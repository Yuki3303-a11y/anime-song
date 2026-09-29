// Pure helpers for the local single-player library. No browser or Firebase state.
const normalizedName = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export function animeKey(song) {
    if (Number.isInteger(Number(song?.anilistId)) && Number(song.anilistId) > 0) {
        return `anilist:${Number(song.anilistId)}`;
    }
    return `anime:${normalizedName(song?.animeCN || song?.anime)}`;
}

export function trackKey(song) {
    return [song?.title || '', song?.anime || '', song?.type || ''].map(normalizedName).join('|');
}

export function groupSeasonSongs(songs) {
    const groups = new Map();
    for (const song of songs) {
        const key = animeKey(song);
        if (!groups.has(key)) groups.set(key, {
            key, title: song.animeCN || song.anime, originalTitle: song.animeNative || song.anime,
            anilistId: song.anilistId || null, tracks: {}
        });
        if (song.type === 'OP' || song.type === 'ED') groups.get(key).tracks[song.type] = song;
    }
    return [...groups.values()];
}

export function filterWatchedSongs(songs, watchedKeys, enabled) {
    if (!enabled) return songs;
    const keys = new Set(watchedKeys);
    return songs.filter(song => keys.has(animeKey(song)));
}

const trackDetails = song => ({
    key: trackKey(song), title: song.titleCN || song.title,
    anime: song.animeCN || song.anime, type: song.type || '', artist: song.artist || ''
});

export function putMistake(entries, song, selected, at = Date.now()) {
    const current = Array.isArray(entries) ? entries : [];
    const key = trackKey(song);
    const previous = current.find(entry => entry.key === key);
    return [{ ...trackDetails(song), count: (previous?.count || 0) + 1,
        selected: String(selected || ''), at }, ...current.filter(entry => entry.key !== key)].slice(0, 200);
}

export function putAudioCheck(entries, song, status, source = '', at = Date.now()) {
    const current = Array.isArray(entries) ? entries : [];
    const key = trackKey(song);
    return [{ ...trackDetails(song), status, source, at },
        ...current.filter(entry => entry.key !== key)].slice(0, 500);
}

export function putFeedback(entries, song, reason, note = '', at = Date.now()) {
    const current = Array.isArray(entries) ? entries : [];
    const key = trackKey(song);
    return [{ ...trackDetails(song), reason, note: String(note).trim().slice(0, 400), at },
        ...current.filter(entry => entry.key !== key || entry.reason !== reason)].slice(0, 100);
}
