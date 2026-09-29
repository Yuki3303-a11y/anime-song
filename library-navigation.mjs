export function sourceSelection(source) {
    if (source === 'mix') return { group: 'mix', official: 'all', season: null };
    if (source === 'custom') return { group: 'custom', official: 'all', season: null };
    if (source?.startsWith('season:')) return { group: 'official', official: 'season', season: source.slice(7) };
    if (source === 'legacy') return { group: 'official', official: 'legacy', season: null };
    if (source === 'builtin') return { group: 'official', official: 'all', season: null };
    return { group: 'all', official: 'all', season: null };
}

export function sourceFromSelection({ group, official = 'all', season = null }) {
    if (group === 'mix') return 'mix';
    if (group === 'custom') return 'custom';
    if (group !== 'official') return null;
    if (official === 'legacy') return 'legacy';
    if (official === 'season' && season) return `season:${season}`;
    return 'builtin';
}

export function mixForAddedSong(source, seasons) {
    const season = source?.startsWith('season:') ? source.slice(7) : null;
    return {
        legacy: source === null || source === 'builtin' || source === 'legacy',
        seasons: season ? [season] : source === null || source === 'builtin' ? [...seasons] : [],
        imported: source === null || source === 'custom',
        watched: false,
        selected: true
    };
}

export function searchLibraryTracks(songs, query = '') {
    const term = String(query).normalize('NFKC').trim().toLowerCase();
    const seen = new Set();
    return songs.filter(song => {
        const key = [song.title, song.anime, song.type].map(value => String(value || '').normalize('NFKC').toLowerCase()).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return !term || [song.title, song.titleCN, song.anime, song.animeCN, song.animeNative, song.artist]
            .join(' ').normalize('NFKC').toLowerCase().includes(term);
    }).sort((a, b) => String(b.season || '').localeCompare(String(a.season || '')));
}

export function groupLibrarySongs(songs, getAnimeKey) {
    const groups = new Map();
    for (const song of songs) {
        const key = getAnimeKey(song);
        if (!groups.has(key)) groups.set(key, {
            key, title: song.animeCN || song.anime, originalTitle: song.animeNative || song.anime,
            song, tracks: []
        });
        groups.get(key).tracks.push(song);
    }
    return [...groups.values()];
}

export function selectMixedSongs({ legacy, seasons, imported, watchedKeys, animeKey, trackKey, selectedKeys = [], mix }) {
    const watched = new Set(watchedKeys);
    const chosenSeasons = new Set(mix.seasons || []);
    const chosenTracks = new Set(selectedKeys);
    const seen = new Set();
    const seasonalSongs = Object.values(seasons).flat();
    return [...legacy, ...seasonalSongs, ...imported].filter(song => {
        const included = (mix.legacy && legacy.includes(song)) ||
            (seasonalSongs.includes(song) && chosenSeasons.has(song.season)) ||
            (mix.imported && imported.includes(song)) ||
            (mix.watched && watched.has(animeKey(song))) ||
            (mix.selected && trackKey && chosenTracks.has(trackKey(song)));
        if (!included) return false;
        const key = [song.title, song.anime, song.type].map(value => String(value || '').normalize('NFKC').toLowerCase()).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function createPreviewSession() {
    let generation = 0;
    let activeKey = null;
    return {
        get activeKey() { return activeKey; },
        start(key) { activeKey = key; return ++generation; },
        isCurrent(token) { return token === generation && activeKey !== null; },
        stop() { activeKey = null; generation++; }
    };
}
