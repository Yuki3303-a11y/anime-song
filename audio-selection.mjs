const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
const badVersion = /\b(?:cover|piano|instrumental|karaoke|remix|remaster(?:ed)?|acoustic|live|guitar lesson|drum cover)\b|纯音乐|无人声|无主唱|人声消除|消音版|\b(?:off[ -]?vocals?|no[ -]?vocals?|backing track|inst)\b|翻唱|钢琴|伴奏|混音|鼓谱|吉他谱|翻奏|演奏|指弹|扒谱|教程|カバー|ピアノ|インスト|カラオケ|リミックス|ライブ/i;

// Verified against the official iTunes artist identity; do not infer unrelated artists.
const knownArtistAliases = [['泽野弘之', '澤野弘之', 'SawanoHiroyuki[nZk]']];
function artistAliases(song) {
    const supplied = [song.artist, ...(Array.isArray(song.artistAliases) ? song.artistAliases : [])]
        .filter(value => typeof value === 'string' && value.trim());
    const names = new Set(supplied.map(normalize));
    return [...new Set([...supplied, ...knownArtistAliases.filter(group => group.some(name => names.has(normalize(name)))).flat()])];
}

function withoutCatalogNames(song, description) {
    const aliases = [song.title, song.titleCN, song.anime, song.animeCN, song.animeNative]
        .filter(Boolean).sort((a, b) => b.length - a.length);
    let residual = description;
    for (const alias of aliases) {
        const literal = String(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        residual = residual.replace(new RegExp(literal, 'gi'), ' ');
    }
    return residual;
}

const themeLabels = {
    __proto__: null,
    OP: /\b(?:ncop|op|opening)\d*\b|片[头頭]|オープニング/i,
    ED: /\b(?:nced|ed|ending)\d*\b|片尾|エンディング/i,
    IN: /\bIN\d*\b/i
};

// Apple supplies a track name separately from artist and album. Only discard
// common credit and broadcast-length suffixes when comparing that field.
function matchesItunesTitle(title, aliases) {
    const stripped = title.normalize('NFKC')
        .replace(/[\s([~「【–—-]+(?:feat(?:uring)?[.\s]+[^)\]]+|tv[\s-]*(?:size|edit|ver(?:sion)?\.?|サイズ)(?:\s*ver\.?)?)[\s)\]~」】–—-]*$/i, '');
    const name = normalize(stripped);
    if (aliases.includes(name)) return true;
    const [first, second] = aliases;
    return Boolean(second && first !== second && (name === first + second || name === second + first));
}

export function audioSearchQueries(song) {
    const unique = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
    const titles = unique([song.title, song.titleCN]);
    const anime = unique([song.anime, song.animeCN, song.animeNative]);
    const artists = artistAliases(song);
    const type = song.type || '';
    return {
        itunes: unique([
            `${song.artist || ''} ${titles[0] || ''}`,
            ...artists.map(artist => `${artist} ${titles[0] || ''}`),
            ...titles.map(title => `${title} ${anime[0] || ''}`),
            ...titles
        ]),
        youtube: unique([
            `${titles[0] || ''} ${anime[0] || ''} ${type}`,
            `${titles.at(-1) || ''} ${anime.at(-1) || ''} ${type}`,
            `${titles[0] || ''} ${song.artist || ''}`
        ]),
        bilibili: unique([
            `${song.animeCN || song.animeNative || song.anime || ''} ${type}`,
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
        // Short names such as Blue / Eve must not match Blueberry / never.
        if (/^[a-z0-9]{2,4}$/i.test(String(alias).trim())) {
            return new RegExp(`(^|[^a-z0-9])${value}(?=$|[^a-z0-9])`, 'i').test(String(haystack).normalize('NFKC'));
        }
        return value.length >= 2 && text.includes(value);
    });
}

export function scoreAudioCandidate(song, candidate, { requireRelation = false } = {}) {
    const title = candidate.title || '';
    const artist = candidate.artist || '';
    const album = candidate.album || '';
    const labels = withoutCatalogNames(song, title);

    // ===== Layer A — identity (hard gates): is this candidate the right song? =====
    if (badVersion.test(labels) || badVersion.test(withoutCatalogNames(song, `${artist} ${album}`))) return -1;
    if (candidate.source !== 'itunes' && /\b(?:medley|mashup|reaction)\b|合集|串烧|串燒|メドレー/i.test(labels)) return -1;
    const songAliases = [song.title, song.titleCN].filter(Boolean);
    const normalizedAliases = songAliases.map(normalize).filter(Boolean);
    const exactTitle = normalizedAliases.includes(normalize(title));
    if (candidate.source === 'itunes') {
        if (!exactTitle && !matchesItunesTitle(title, normalizedAliases)) return -1;
    } else if (!exactTitle && !containsAlias(title, songAliases)) return -1;

    // Video uploads need song identity plus anime or artist evidence.
    const animeAliases = [song.anime, song.animeCN, song.animeNative].filter(Boolean);
    const animeMatch = containsAlias(`${title} ${album}`, animeAliases);
    const artistMatch = containsAlias(candidate.source === 'itunes' ? artist : `${title} ${artist}`, artistAliases(song));
    if ((requireRelation || candidate.source !== 'itunes') && !animeMatch && !artistMatch) return -1;

    // OP/ED type conflict stays a hard rejection — unless the title also contains the wanted type.
    const opposite = song.type === 'OP' ? themeLabels.ED : song.type === 'ED' ? themeLabels.OP : null;
    const typeMatch = themeLabels[song.type]?.test(labels);
    if (opposite?.test(labels) && !typeMatch) return -1;

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

    if (candidate.source === 'youtube') score -= 20; // iframe startup/embedding risk versus direct audio
    if (candidate.source === 'itunes') score += 8;     // direct official preview, reliable

    // Remaining candidates without relation evidence have lower confidence.
    if (!animeMatch && !artistMatch) score -= 12;

    // Progressive, recoverable per-source failure penalty (replaces the flat permanent -35).
    score -= candidate.failurePenalty || (candidate.localFailure ? 10 : 0);
    return score;
}

export function rankAudioCandidates(song, candidates, options) {
    return candidates.map(candidate => ({ ...candidate, score: scoreAudioCandidate(song, candidate, options) }))
        .filter(candidate => candidate.score >= 0)
        .sort((a, b) => b.score - a.score);
}

export const challengeTrackKey = song => `${normalize(song.title)}|${normalize(song.animeCN || song.anime)}`;

export function uniqueChallengePool(pool) {
    const seen = new Set();
    return pool.filter(song => {
        const key = challengeTrackKey(song);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function pickReplacementSong(pool, playlist, failedSongs = [], lastPlayed) {
    const used = new Set([...playlist, ...failedSongs].map(challengeTrackKey));
    return uniqueChallengePool(pool).find(song => {
        const key = challengeTrackKey(song);
        return !used.has(key) && key !== lastPlayed && `${song.title}|${song.anime}` !== lastPlayed;
    }) || null;
}
