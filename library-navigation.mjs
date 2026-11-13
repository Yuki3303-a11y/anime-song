import { trackKey as catalogTrackKey } from './library-tools.mjs';

export function sourceSelection(source) {
    const preset = /^preset:(beginner|regular|expert)$/.exec(source || '')?.[1];
    if (preset) return { group: 'preset', official: 'all', season: null, preset };
    if (source === 'mix') return { group: 'mix', official: 'all', season: null };
    if (source === 'custom') return { group: 'custom', official: 'all', season: null };
    if (source?.startsWith('season:')) return { group: 'official', official: 'season', season: source.slice(7) };
    if (source === 'legacy') return { group: 'official', official: 'legacy', season: null };
    if (source === 'builtin') return { group: 'official', official: 'all', season: null };
    return { group: 'all', official: 'all', season: null };
}

export function sourceFromSelection({ group, official = 'all', season = null, preset = null }) {
    if (group === 'preset') return ['beginner', 'regular', 'expert'].includes(preset) ? `preset:${preset}` : null;
    if (group === 'mix') return 'mix';
    if (group === 'custom') return 'custom';
    if (group !== 'official') return null;
    if (official === 'legacy') return 'legacy';
    if (official === 'season' && season) return `season:${season}`;
    return 'builtin';
}

export function searchLibraryTracks(songs, query = '') {
    const term = String(query).normalize('NFKC').trim().toLowerCase();
    const seen = new Set();
    return songs.filter(song => {
        const key = catalogTrackKey(song);
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

export function sortAnimeByHeat(groups, rankedBangumiIds = []) {
    const positions = new Map(rankedBangumiIds.map((id, index) => [Number(id), index]));
    const rank = group => positions.get(Number(group.song?.bangumiId)) ?? Number.MAX_SAFE_INTEGER;
    return [...groups].sort((a, b) => rank(a) - rank(b));
}

export function selectMixedSongs({ legacy, seasons, imported, watchedKeys, animeKey, mix }) {
    const watched = new Set(watchedKeys);
    const chosenSeasons = new Set(mix.seasons || []);
    const seen = new Set();
    const seasonalSongs = Object.values(seasons).flat();
    const selectedSeasonalSongs = new Set([...chosenSeasons].flatMap(season => seasons[season] || []));
    return [...legacy, ...seasonalSongs, ...imported].filter(song => {
        const included = (mix.legacy && legacy.includes(song)) ||
            selectedSeasonalSongs.has(song) ||
            (mix.imported && imported.includes(song)) ||
            (mix.watched && watched.has(animeKey(song)));
        if (!included) return false;
        const key = catalogTrackKey(song);
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
// Keep the original objects so saved song keys and legacy PK indices stay valid.
export function buildQuarterCatalog(legacy, pools) {
    const catalog = {};
    const tracks = new Set();
    const recordings = new Set();
    const add = (song, season = song.season) => {
        if (!/^\d{4}-(01|04|07|10)$/.test(season)) return;
        const key = catalogTrackKey(song);
        const recording = song.anilistId ? `${song.anilistId}|${catalogTrackKey({ title: song.title, type: song.type, recordingId: song.recordingId })}` : null;
        if (tracks.has(key) || recording && recordings.has(recording)) {
            tracks.add(key);
            if (recording) recordings.add(recording);
            return;
        }
        tracks.add(key);
        if (recording) recordings.add(recording);
        (catalog[season] ||= []).push(song);
    };
    legacy.forEach(song => add(song));
    Object.entries(pools).forEach(([season, songs]) => songs.forEach(song => add(song, song.season || season)));
    return catalog;
}
