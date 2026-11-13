import { animeKey, trackKey } from './library-tools.mjs';

// These presets describe frozen popularity ranges, not measured listening difficulty.
export const LIBRARY_PRESETS = [
    { id: 'beginner', label: '入门精选', description: '热门作品的首支已收录 OP，每部一首。' },
    { id: 'regular', label: '进阶挑战', description: '扩大热门作品范围，每部首支已收录 OP 和 ED。' },
    { id: 'expert', label: '动漫高手', description: '进一步扩大作品范围，包含已收录的不同 OP 和 ED。' }
];

export function getPresetId(source) {
    return LIBRARY_PRESETS.find(preset => source === `preset:${preset.id}`)?.id || null;
}

const LIMITS = { beginner: [10, 3, 2], regular: [25, 10, 5], expert: [60, 30, 15] };
const instrumental = /\b(?:instrumental|off[ -]?vocals?|no[ -]?vocals?)\b|インスト(?:ゥルメンタル)?|纯音乐|无人声|无主唱/i;
const sequence = song => Number(song.themeSequence) === 1 ? 0 : Number(song.themeSequence) > 1 ? Number(song.themeSequence) : 1;
const recordingKey = song => song.recordingId ? `recording:${song.recordingId}` :
    `${animeKey(song)}|${trackKey({ title: song.title, type: song.type })}`;

// Historical ranks are Bangumi IDs; seasonal positions are [Bangumi ID, AniList ID].
// Null positions preserve missing frozen ranks, so a cutoff never promotes a later work.
export function buildPresetPools(catalog = {}, historicalRanks = {}, seasonalRanks = {}) {
    const groups = new Map(), byBangumi = new Map(), byAniList = new Map();
    const tracks = new Set(), recordings = new Set();
    for (const song of Object.values(catalog).flat()) {
        if (!['OP', 'ED'].includes(song.type) || !song.title?.trim() || !song.artist?.trim() || instrumental.test(song.title)) continue;
        const key = animeKey(song);
        if (!groups.has(key)) groups.set(key, []);
        const group = groups.get(key);
        if (song.bangumiId) byBangumi.set(Number(song.bangumiId), group);
        if (song.anilistId) byAniList.set(Number(song.anilistId), group);
        const track = trackKey(song), recording = recordingKey(song);
        if (tracks.has(track) || recordings.has(recording)) continue;
        tracks.add(track);
        recordings.add(recording);
        group.push(song);
    }
    const ranges = [
        [historicalRanks.early || [], 0],
        ...Object.keys(historicalRanks).filter(key => /^201[1-9]$/.test(key)).sort().map(key => [historicalRanks[key], 1]),
        ...Object.keys(seasonalRanks).filter(key => /^20\d{2}-(01|04|07|10)$/.test(key) && Number(key.slice(0, 4)) >= 2020)
            .sort().map(key => [seasonalRanks[key], 2])
    ];
    return Object.fromEntries(LIBRARY_PRESETS.map(({ id }) => {
        const songs = [], seenGroups = new Set();
        for (const [ranks, rangeType] of ranges) {
            for (const entry of ranks.slice(0, LIMITS[id][rangeType])) {
                if (!entry) continue;
                const [bangumiId, anilistId] = Array.isArray(entry) ? entry : [entry];
                const group = byBangumi.get(Number(bangumiId)) || byAniList.get(Number(anilistId));
                if (!group || seenGroups.has(group)) continue;
                seenGroups.add(group);
                const opening = group.filter(song => song.type === 'OP').sort((a, b) => sequence(a) - sequence(b));
                const ending = group.filter(song => song.type === 'ED').sort((a, b) => sequence(a) - sequence(b));
                songs.push(...(id === 'beginner' ? opening.slice(0, 1) : id === 'regular' ?
                    [...opening.slice(0, 1), ...ending.slice(0, 1)] : [...opening, ...ending]));
            }
        }
        return [id, songs];
    }));
}
