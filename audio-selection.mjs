const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
const badVersion = /\b(?:cover|piano|instrumental|karaoke|remix|remaster(?:ed)?|acoustic|live|guitar lesson|drum cover)\b|翻唱|钢琴|伴奏|混音|鼓谱|吉他谱|翻奏|演奏|指弹|扒谱|教程|カバー|ピアノ|インスト|カラオケ|リミックス|ライブ/i;

function hasBadVersion(song, description) {
    const aliases = [song.title, song.titleCN, song.anime, song.animeCN, song.animeNative]
        .filter(Boolean).sort((a, b) => b.length - a.length);
    let residual = description;
    for (const alias of aliases) {
        const literal = String(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        residual = residual.replace(new RegExp(literal, 'gi'), ' ');
    }
    return badVersion.test(residual);
}

export function audioSearchQueries(song) {
    const unique = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
    const titles = unique([song.title, song.titleCN]);
    const anime = unique([song.anime, song.animeCN, song.animeNative]);
    const type = song.type || '';
    return {
        itunes: unique([
            `${song.artist || ''} ${titles[0] || ''}`,
            ...titles.map(title => `${title} ${anime[0] || ''}`),
            ...titles
        ]),
        youtube: unique([
            `${titles[0] || ''} ${anime[0] || ''} ${type}`,
            `${titles.at(-1) || ''} ${anime.at(-1) || ''} ${type}`,
            `${titles[0] || ''} ${song.artist || ''}`
        ]),
        bilibili: unique([
            `${anime[1] || anime[0] || ''} ${type} ${titles.at(-1) || ''}`,
            `${anime[0] || ''} ${type} ${titles[0] || ''}`,
            `${anime.at(-1) || ''} ${type} ${titles[0] || ''}`,
            `${titles[0] || ''} ${song.artist || ''}`
        ])
    };
}

function containsAlias(haystack, aliases) {
    const text = normalize(haystack);
    return aliases.some(alias => {
        const value = normalize(alias);
        return value.length >= 2 && text.includes(value);
    });
}

export function scoreAudioCandidate(song, candidate) {
    const title = candidate.title || '';
    const artist = candidate.artist || '';
    const album = candidate.album || '';
    const haystack = `${title} ${artist} ${album}`;

    // ===== Layer A — identity (hard gates): is this candidate the right song? =====
    if (hasBadVersion(song, haystack)) return -1;                  // wrong version: cover/piano/instrumental/karaoke/remix/live …
    const songAliases = [song.title, song.titleCN].filter(Boolean);
    if (!containsAlias(title, songAliases)) return -1;             // title has no song-name alias at all

    // ===== Layer B — relation evidence (song → anime/type). Not gates; evidence only. =====
    const animeAliases = [song.anime, song.animeCN, song.animeNative].filter(Boolean);
    const animeMatch = containsAlias(`${title} ${album}`, animeAliases);
    const artistMatch = containsAlias(`${title} ${artist}`, [song.artist]);

    // OP/ED type conflict stays a hard rejection — unless the title also contains the wanted type.
    const opposite = song.type === 'OP' ? /\bED\d*\b|片尾|エンディング/i : song.type === 'ED' ? /\bOP\d*\b|片头|オープニング/i : null;
    if (opposite?.test(title) && !new RegExp(`\\b${song.type}\\d*\\b`, 'i').test(title)) return -1;

    const typeMatch = Boolean(song.type) && new RegExp(`\\b${song.type}\\d*\\b`, 'i').test(title);
    const exactTitle = normalize(title) === normalize(song.title);

    // ===== Layer C — source / playability =====
    if (candidate.source === 'youtube' && candidate.embeddable === false) return -1; // explicitly unplayable
    // iTunes has reliable artist metadata: a same-title track with a clearly different artist
    // is a different recording — keep this as a hard rejection (not part of the relaxed rules).
    if (candidate.source === 'itunes' && song.artist && artist && !artistMatch) return -1;

    // ===== Evidence-based scoring: low base; let the actual evidence decide. =====
    let score = 15;                                    // base: title alias present = plausible identity
    score += exactTitle ? 38 : 16;                     // title evidence: exact match vs contained alias
    if (animeMatch) score += 26;                       // relation to the anime confirmed
    if (artistMatch) score += 22;                       // artist confirmed
    if (typeMatch) score += 14;                        // OP/ED type present
    if (exactTitle && animeMatch && typeMatch) score += 10; // strong: exact title + anime + type all confirmed

    if (candidate.source === 'itunes') score += 8;     // direct official preview, reliable

    // Missing relation context used to be a hard rejection — now it just lowers confidence.
    if (!animeMatch && !artistMatch) score -= 12;

    // Progressive, recoverable per-source failure penalty (replaces the flat permanent -35).
    score -= candidate.failurePenalty || (candidate.localFailure ? 10 : 0);
    return score;
}

export function rankAudioCandidates(song, candidates) {
    return candidates.map(candidate => ({ ...candidate, score: scoreAudioCandidate(song, candidate) }))
        .filter(candidate => candidate.score >= 0)
        .sort((a, b) => b.score - a.score);
}

export function uniqueChallengePool(pool) {
    const seen = new Set();
    return pool.filter(song => {
        const key = `${normalize(song.title)}|${normalize(song.anime)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function pickReplacementSong(pool, playlist, failedSongs = []) {
    const identity = song => `${normalize(song.title)}|${normalize(song.anime)}`;
    const used = new Set([...playlist, ...failedSongs].map(identity));
    return uniqueChallengePool(pool).find(song => !used.has(identity(song))) || null;
}
