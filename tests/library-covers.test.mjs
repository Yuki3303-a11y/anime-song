import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const load = async name => import(`data:text/javascript;base64,${fs.readFileSync(new URL(`../${name}`, import.meta.url)).toString('base64')}`);
const { SONGS } = await load('songs.js');
const { LEGACY_COVERS } = await load('legacy-covers.js');
const { SEASONAL_COVERS } = await load('seasonal-covers.js');
const coverFunctions = app.slice(app.indexOf('async function loadLibraryCover('), app.indexOf('function renderCurrentLibrary('));

function coverContext(overrides = {}) {
    const context = {
        LEGACY_COVERS, SEASONAL_COVERS, libraryCoverCache: new Map(), libraryCoverRequests: new Map(),
        animeKey: song => `anilist:${song.anilistId}`, findCatalogSong: () => null,
        ANILIST_TIMEOUT: 1000, BANGUMI_TIMEOUT: 1000, AbortController, setTimeout, clearTimeout,
        fetch: () => { throw new Error('Unexpected metadata request'); },
        searchAniList: () => { throw new Error('Unexpected title search'); },
        searchBangumi: () => { throw new Error('Unexpected title search'); },
        ...overrides
    };
    vm.createContext(context);
    vm.runInContext(coverFunctions, context);
    return context;
}

test('every built-in work resolves an exact static cover without metadata requests', async () => {
    const context = coverContext();
    const works = [...new Map(SONGS.map(song => [song.anilistId, song])).values()];
    assert.equal(Object.keys(LEGACY_COVERS).length, works.length);
    for (const song of works) {
        assert.match(LEGACY_COVERS[song.anilistId], /^https:\/\//, song.anime);
        assert.equal(await context.findLibraryCover(song), SEASONAL_COVERS[song.anilistId] || LEGACY_COVERS[song.anilistId]);
    }
});

test('a transient lookup failure can be retried and never uses a fuzzy match for a known ID', async () => {
    let calls = 0;
    const context = coverContext({ fetch: async () => ++calls === 1
        ? { ok: false, status: 429 }
        : { ok: true, json: async () => ({ data: { Media: { coverImage: { large: 'https://example.com/recovered.jpg' } } } }) } });
    const song = { anilistId: 999999, anime: 'Unknown exact work' };
    assert.equal(await context.findLibraryCover(song), '');
    assert.equal(context.libraryCoverCache.has('anilist:999999'), false);
    assert.equal(await context.findLibraryCover(song), 'https://example.com/recovered.jpg');
    assert.equal(calls, 2);
});

test('an exact Bangumi ID supplies the backup when AniList is unavailable', async () => {
    const calls = [];
    const context = coverContext({ fetch: async url => {
        calls.push(url);
        return url.includes('graphql') ? { ok: false }
            : { ok: true, json: async () => ({ images: { large: 'https://example.com/bangumi.jpg' } }) };
    } });
    assert.equal(await context.findLibraryCover({ anilistId: 999999, bangumiId: 123, anime: 'Exact work' }), 'https://example.com/bangumi.jpg');
    assert.deepEqual(calls, ['https://graphql.anilist.co', 'https://api.bgm.tv/v0/subjects/123']);
});

test('concurrent cards share a request, release it, and evict an image that fails to load', async () => {
    let calls = 0;
    const song = { anilistId: 999999, anime: 'Exact work' };
    const context = coverContext({ findCatalogSong: () => song, fetch: async () => {
        calls++;
        return { ok: true, json: async () => ({ data: { Media: { coverImage: { large: 'https://example.com/image.jpg' } } } }) };
    } });
    const image = {};
    const poster = { dataset: { coverSongKey: 'song' }, isConnected: true,
        querySelector: () => image, classList: { add() {}, remove() {} } };
    await Promise.all([context.loadLibraryCover(poster), context.loadLibraryCover(poster)]);
    assert.equal(calls, 1);
    assert.equal(context.libraryCoverRequests.size, 0);
    assert.equal(image.src, 'https://example.com/image.jpg');
    image.onerror();
    assert.equal(context.libraryCoverCache.size, 0);
    await context.loadLibraryCover(poster);
    assert.equal(calls, 2);
});
