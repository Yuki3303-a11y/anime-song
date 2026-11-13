import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPresetPools } from '../library-presets.mjs';
import { animeKey, trackKey } from '../library-tools.mjs';
import { buildQuarterCatalog } from '../library-navigation.mjs';
import { uniqueChallengePool } from '../audio-selection.mjs';

const song = (id, title = `${id}-op`, type = 'OP', extra = {}) => ({
    bangumiId: id, anilistId: id + 10000, anime: `Anime ${id}`, animeCN: `番剧 ${id}`,
    title, artist: 'Singer', type, ...extra
});
const loadData = async file => import(`data:text/javascript;base64,${fs.readFileSync(new URL(file, import.meta.url)).toString('base64')}`);

test('library presets expose a pure builder and the three supported source IDs', async () => {
    const presets = await import('../library-presets.mjs').catch(() => null);
    assert.equal(typeof presets?.buildPresetPools, 'function');
    assert.deepEqual(presets.LIBRARY_PRESETS.map(preset => [preset.id, preset.label]), [
        ['beginner', '入门精选'], ['regular', '进阶挑战'], ['expert', '动漫高手']
    ]);
    assert.equal(presets.getPresetId('preset:beginner'), 'beginner');
    assert.equal(presets.getPresetId('preset:regular'), 'regular');
    assert.equal(presets.getPresetId('preset:expert'), 'expert');
    for (const source of [null, undefined, '', 'beginner', 'preset:', 'preset:unknown', 'preset:expert:extra']) {
        assert.equal(presets.getPresetId(source), null);
    }
});

test('popularity cutoffs use early 10/25/60, annual 3/10/30 and quarterly 2/5/15 in rank order', () => {
    const early = Array.from({ length: 61 }, (_, i) => song(i + 1));
    const annual = Array.from({ length: 31 }, (_, i) => song(i + 101));
    const seasonal = Array.from({ length: 16 }, (_, i) => song(i + 201));
    const pools = buildPresetPools(
        { '2009-01': early.toReversed(), '2011-01': annual.toReversed(), '2020-01': seasonal.toReversed() },
        { early: early.map(s => s.bangumiId), 2011: annual.map(s => s.bangumiId) },
        { '2020-01': seasonal.map(s => [s.bangumiId, s.anilistId]) }
    );
    for (const [id, limits] of [['beginner', [10, 3, 2]], ['regular', [25, 10, 5]], ['expert', [60, 30, 15]]]) {
        assert.deepEqual(pools[id], [...early.slice(0, limits[0]), ...annual.slice(0, limits[1]), ...seasonal.slice(0, limits[2])]);
    }
});

test('unpublished ranks and null gaps do not promote lower-ranked works into a cutoff', () => {
    const inAnnual = song(3), afterAnnual = song(4), inSeason = song(11), afterSeason = song(13);
    const pools = buildPresetPools(
        { '2011-01': [afterAnnual, inAnnual], '2020-01': [afterSeason, inSeason] },
        { 2011: [1, 2, 3, 4] }, { '2020-01': [[11, 10011], null, [13, 10013]] }
    );
    assert.deepEqual(pools.beginner, [inAnnual, inSeason]);
    assert.deepEqual(pools.regular, [inAnnual, afterAnnual, inSeason, afterSeason]);
});

test('first OP and ED follow theme sequence and existing order without changing song identity', () => {
    const op3 = Object.freeze(song(1, 'OP3', 'OP', { themeSequence: 3 }));
    const op1 = Object.freeze(song(1, 'OP1', 'OP', { themeSequence: 1 }));
    const alternate1 = Object.freeze(song(1, 'Another OP1', 'OP', { themeSequence: 1 }));
    const ed2 = Object.freeze(song(1, 'ED2', 'ED', { themeSequence: 2 }));
    const ed1 = Object.freeze(song(1, 'ED1', 'ED', { themeSequence: 1 }));
    const original = Object.freeze([op3, ed2, op1, alternate1, ed1]);
    const catalog = Object.freeze({ '2011-01': original });
    const before = JSON.stringify(catalog);
    const pools = buildPresetPools(catalog, { 2011: [1] }, {});
    assert.deepEqual(pools.beginner, [op1]);
    assert.deepEqual(pools.regular, [op1, ed1]);
    assert.deepEqual(pools.expert, [op1, alternate1, op3, ed1, ed2]);
    assert.equal(pools.beginner[0], op1);
    assert.equal(pools.regular[0], pools.beginner[0]);
    assert.equal(JSON.stringify(catalog), before);
});

test('an original OP without sequence keeps its existing position ahead of a later OP2', () => {
    const original = song(1, 'Original OP'), later = song(1, 'OP2', 'OP', { themeSequence: 2 });
    const pools = buildPresetPools({ '2011-01': [original, later] }, { 2011: [1] }, {});
    assert.deepEqual(pools.beginner, [original]);
});

test('an explicitly marked OP1 is preferred over a different unnumbered opening', () => {
    const unnumbered = song(1, 'Unnumbered OP'), first = song(1, 'Marked OP1', 'OP', { themeSequence: 1 });
    const pools = buildPresetPools({ '2011-01': [unnumbered, first] }, { 2011: [1] }, {});
    assert.deepEqual(pools.beginner, [first]);
    assert.equal(pools.regular[0], first);
    assert.ok(pools.expert.includes(first));
});

test('missing OP is skipped in beginner and does not replace the OP with an ED or another work', () => {
    const ending = song(1, 'ED only', 'ED'), opening = song(2, 'OP only');
    const pools = buildPresetPools({ '2011-01': [ending, opening] }, { 2011: [1, 2] }, {});
    assert.deepEqual(pools.beginner, [opening]);
    assert.deepEqual(pools.regular, [ending, opening]);
    assert.deepEqual(pools.expert, [ending, opening]);
});

test('non-theme entries, missing credits and explicit instrumental versions stay out of presets', () => {
    const valid = song(1, 'Konpeki no Alpine ~Nikenme ni Karaoke ni Haitta Oretachi no Tension Super MAX ver.~');
    const songs = [song(1, 'Insert', 'IN'), song(1, 'Unknown', ''), song(1, 'No singer', 'OP', { artist: '' }),
        song(1, 'flame of hope -instrumental-', 'ED'), song(1, 'OP (off vocal)'), valid];
    const pools = buildPresetPools({ '2011-01': songs }, { 2011: [1] }, {});
    for (const pool of Object.values(pools)) assert.deepEqual(pool, [valid]);
});

test('AniList fallback links old published songs with no Bangumi ID and deduplicates repeat years', () => {
    const original = song(1, 'Original', 'OP', { bangumiId: undefined });
    const alias = song(1, 'Original', 'OP', { anime: 'Another label' });
    const extra = song(1, 'Extra', 'ED', { themeSequence: 2 });
    const pools = buildPresetPools({ '2019-10': [original], '2020-01': [alias, extra] },
        { 2019: [1] }, { '2020-01': [[1, 10001]] });
    assert.deepEqual(pools.beginner, [original]);
    assert.deepEqual(pools.regular, [original, extra]);
    assert.deepEqual(pools.expert, [original, extra]);
});

test('expert keeps distinct recording IDs while removing duplicate copies and preserving lower-tier references', () => {
    const first = song(1, 'Same title', 'OP', { recordingId: 'recording:first' });
    const copy = { ...first, anime: 'Alias label' };
    const second = song(1, 'Same title', 'OP', { recordingId: 'recording:second' });
    const pools = buildPresetPools({ '2011-01': [first, copy, second] }, { 2011: [1] }, {});
    assert.deepEqual(pools.beginner, [first]);
    assert.deepEqual(pools.expert, [first, second]);
    assert.equal(pools.expert[0], pools.beginner[0]);
});

test('frozen seasonal ranks refer only to published identities and preserve their source positions', async () => {
    const { PRESET_SEASON_RANKS } = await loadData('../preset-ranks.js');
    const { SONGS } = await loadData('../songs.js'), { SEASONAL_POOLS } = await loadData('../seasonal-pools.js');
    const published = [...SONGS, ...Object.values(SEASONAL_POOLS).flat()];
    const manifest = JSON.parse(fs.readFileSync(new URL('../candidates/season-archive-manifest.json', import.meta.url)));
    assert.equal(Object.keys(PRESET_SEASON_RANKS).length, 28);
    for (const [season, positions] of Object.entries(PRESET_SEASON_RANKS)) {
        assert.equal(positions.length, 15);
        const expansionFile = new URL(`../candidates/${season}-expansion.json`, import.meta.url);
        const expansion = fs.existsSync(expansionFile) ? JSON.parse(fs.readFileSync(expansionFile)) : null;
        for (const [index, ids] of positions.entries()) {
            if (!ids) continue;
            const [bangumiId, anilistId] = ids;
            assert.ok(published.some(s => s.anilistId === anilistId || s.bangumiId === bangumiId), `${season} rank ${index + 1} is published`);
            const source = manifest.seasons[season].selected.find(r => r.rank === index + 1) || expansion?.selected.find(r => r.rank === index + 1);
            assert.deepEqual(ids, [source.bangumiId, source.anilistId]);
        }
    }
});

test('actual preset pools are nested, keep published references and report work and song totals', async t => {
    const { SONGS } = await loadData('../songs.js'), { SEASONAL_POOLS } = await loadData('../seasonal-pools.js');
    const { HISTORICAL_ANIME_RANKS } = await loadData('../historical-ranks.js');
    const { PRESET_SEASON_RANKS } = await loadData('../preset-ranks.js');
    const catalog = buildQuarterCatalog(SONGS, SEASONAL_POOLS), published = new Set(Object.values(catalog).flat());
    const before = JSON.stringify(catalog), pools = buildPresetPools(catalog, HISTORICAL_ANIME_RANKS, PRESET_SEASON_RANKS);
    for (const [id, entries] of Object.entries(pools)) {
        assert.ok(entries.length > 0);
        assert.ok(entries.every(s => published.has(s) && ['OP', 'ED'].includes(s.type)));
        assert.equal(new Set(entries.map(trackKey)).size, entries.length);
        t.diagnostic(`${id}: ${new Set(entries.map(animeKey)).size} anime, ${entries.length} tracks, ${uniqueChallengePool(entries).length} quiz recordings`);
    }
    assert.ok(pools.beginner.every(s => pools.regular.includes(s)));
    assert.ok(pools.regular.every(s => pools.expert.includes(s)));
    assert.equal(JSON.stringify(catalog), before);
});
