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
    if (hasBadVersion(song, haystack)) return -1;
    const songAliases = [song.title, song.titleCN].filter(Boolean);
    const animeAliases = [song.anime, song.animeCN, song.animeNative].filter(Boolean);
    if (!containsAlias(title, songAliases)) return -1;
    const animeMatch = containsAlias(`${title} ${album}`, animeAliases);
    const artistMatch = containsAlias(`${title} ${artist}`, [song.artist]);
    if (!animeMatch && !artistMatch) return -1;
    const opposite = song.type === 'OP' ? /\bED\d*\b|片尾|エンディング/i : song.type === 'ED' ? /\bOP\d*\b|片头|オープニング/i : null;
    if (opposite?.test(title) && !new RegExp(`\\b${song.type}\\d*\\b`, 'i').test(title)) return -1;
    if (candidate.source === 'itunes' && song.artist && artist && !artistMatch) return -1;
    let score = 60 + (animeMatch ? 35 : 0) + (artistMatch ? 35 : 0);
    if (song.type && new RegExp(`\\b${song.type}\\d*\\b`, 'i').test(title)) score += 12;
    if (normalize(title) === normalize(song.title)) score += 12;
    if (candidate.source === 'itunes') score += 8; // direct preview, no embed restrictions
    if (candidate.source === 'youtube' && candidate.embeddable === false) return -1;
    if (candidate.localFailure) score -= 35;
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
