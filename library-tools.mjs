// Pure helpers for the local single-player library. No browser or Firebase state.
const normalizedName = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export function animeKey(song) {
    if (Number.isInteger(Number(song?.anilistId)) && Number(song.anilistId) > 0) {
        return `anilist:${Number(song.anilistId)}`;
    }
    return `anime:${normalizedName(song?.animeCN || song?.anime)}`;
}

export function trackKey(song) {
    return [song?.title || '', song?.anime || '', song?.type || '', ...(song?.recordingId ? [song.recordingId] : [])].map(normalizedName).join('|');
}

export function groupSeasonSongs(songs) {
    const groups = new Map();
    for (const song of songs) {
        const key = animeKey(song);
        if (!groups.has(key)) groups.set(key, {
            key, title: song.animeCN || song.anime, originalTitle: song.animeNative || song.anime,
            anilistId: song.anilistId || null, tracks: {}, tracksByType: {}, songs: []
        });
        const group = groups.get(key);
        group.songs.push(song);
        (group.tracksByType[song.type || 'OTHER'] ||= []).push(song);
        // Retain the first OP/ED convenience fields used by older consumers.
        if (song.type === 'OP' || song.type === 'ED') group.tracks[song.type] ||= song;
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

// A different recording can carry a show follow forward without inheriting track records.
export function createCatalogHistory(legacy, seasonal, previousKeys) {
    const current = [...legacy, ...Object.values(seasonal).flat()];
    const currentTracks = new Set(current.map(trackKey));
    const currentAnime = new Set(current.map(animeKey));
    const tracks = new Map();
    const shows = new Map();
    const recordings = new Map();
    for (const song of current) {
        if (!song.anilistId) continue;
        const recording = `${song.anilistId}|${trackKey({ title: song.title, type: song.type, recordingId: song.recordingId })}`;
        if (!recordings.has(recording)) recordings.set(recording, song);
        const canonical = recordings.get(recording);
        if (trackKey(song) !== trackKey(canonical)) tracks.set(trackKey(song), canonical);
        const oldAnime = animeKey({ ...song, anilistId: null });
        const newAnime = animeKey(song);
        if (!shows.has(oldAnime)) shows.set(oldAnime, currentAnime.has(oldAnime) ? [oldAnime] : []);
        shows.get(oldAnime).push(newAnime);
    }
    for (const [pool, entries] of Object.entries(previousKeys)) {
        const songs = pool === 'legacy' ? legacy : seasonal[pool];
        for (const [index, [title, anime, type, sameRecording = true]] of Object.entries(entries)) {
            const song = songs?.[index];
            if (!song) continue;
            const previous = { title, anime, type, anilistId: pool === 'legacy' ? null : song.anilistId };
            const oldTrack = trackKey(previous);
            if (sameRecording && !currentTracks.has(oldTrack)) tracks.set(oldTrack, song);
            const oldAnime = animeKey(previous);
            const newAnime = animeKey(song);
            if (oldAnime === newAnime) continue;
            if (!shows.has(oldAnime)) shows.set(oldAnime, currentAnime.has(oldAnime) ? [oldAnime] : []);
            shows.get(oldAnime).push(newAnime);
        }
    }
    return {
        watched: keys => [...new Set(keys.flatMap(key => shows.get(key) || [key]))],
        selected: keys => [...new Set(keys.map(key => tracks.has(key) ? trackKey(tracks.get(key)) : key))],
        record(entry) {
            const song = tracks.get(entry?.key);
            return song ? { ...entry, ...trackDetails(song) } : entry;
        },
        favorite(entry) {
            const song = tracks.get(trackKey(entry));
            return song ? { ...entry, title: song.title, titleCN: song.titleCN || song.title, anime: song.anime,
                animeCN: song.animeCN || '', type: song.type, artist: song.artist } : entry;
        }
    };
}

// Read retired per-song selections once, preserving their shows as follows.
export function migrateLegacySongSelection({ songs, history, watchedKeys, selectedKeys, mix, defaultMix }) {
    const tracks = new Map();
    for (const song of songs) if (!tracks.has(trackKey(song))) tracks.set(trackKey(song), animeKey(song));
    const migrated = history.selected(selectedKeys).map(key => tracks.get(key)).filter(Boolean);
    const watched = history.watched([...new Set([...watchedKeys, ...migrated])]);
    const availableAnime = new Set(tracks.values());
    const hasAvailableFollow = watched.some(key => availableAnime.has(key));
    let resetWatchedOnly = false;
    let nextMix = { legacy: !!mix.legacy, seasons: [...(mix.seasons || [])], imported: !!mix.imported, watched: !!mix.watched };
    if (mix.selected) {
        if (migrated.length) nextMix.watched = true;
        else if (!nextMix.legacy && !nextMix.seasons.length && !nextMix.imported && !(nextMix.watched && hasAvailableFollow)) {
            nextMix = { ...defaultMix, seasons: [...defaultMix.seasons] };
            resetWatchedOnly = !hasAvailableFollow;
        }
    }
    return { watchedKeys: watched, mix: nextMix, resetWatchedOnly };
}

export function putAudioCheck(entries, song, status, source = '', at = Date.now(), reason = '') {
    const current = Array.isArray(entries) ? entries : [];
    const key = trackKey(song);
    return [{ ...trackDetails(song), status, source, at, ...(reason ? { reason: String(reason).slice(0, 400) } : {}) },
        ...current.filter(entry => entry.key !== key)].slice(0, 500);
}

export function putFeedback(entries, song, reason, note = '', at = Date.now()) {
    const current = Array.isArray(entries) ? entries : [];
    const key = trackKey(song);
    return [{ ...trackDetails(song), reason, note: String(note).trim().slice(0, 400), at },
        ...current.filter(entry => entry.key !== key || entry.reason !== reason)].slice(0, 100);
}
