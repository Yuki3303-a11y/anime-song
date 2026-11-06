import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { rankAudioCandidates } from '../audio-selection.mjs';
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('async function fetchAudioInner('), app.indexOf('function getGuessValue('));
const song = { title: 'Re:Re:', anime: 'ERASED', animeCN: '只有我不存在的城市', artist: 'ASIAN KUNG-FU GENERATION', type: 'OP' };
function setup(localSong = song) {
    const calls = [];
    const context = { gameState: { currentSong: localSong, failedYtVideos: new Set(), failedBiliVideos: new Set() },
        getAllSongs: () => [localSong], SEASONAL_POOLS: {}, audioSourcePref: 'smart',
        searchQuizItunesCandidates: async () => { calls.push('search'); return []; },
        searchQuizYouTubeCandidates: async () => [], searchBilibili: async () => null,
        getBilibiliAudioUrl: async id => { calls.push(id); return { url: `https://cdn.test/${id}` }; },
        buildBiliProxyUrl: url => url, biliProxyState: {}, rankAudioCandidates, sourceFailurePenalty: () => 0,
        settleWithin: promise => promise, GATHER_HARD: 8000, GATHER_GRACE: 700, STRONG_SCORE: 90,
        BILI_SEARCH_BUDGET: 10000, performance, Promise, Set, Map, Object, setTimeout, clearTimeout, AbortController, AbortSignal };
    vm.createContext(context);
    vm.runInContext(source, context);
    return { context, calls };
}
test('a trusted backup is tried before searching and failed video IDs are not reused', async () => {
    const { context, calls } = setup();
    const result = await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'smart',
        { yt: new Set(['blocked']), bili: new Set() }, null, song, [
            { source: 'youtube', videoId: 'blocked', title: 'ERASED OP Re:Re:' },
            { source: 'bilibili', bvid: 'backup', title: 'ERASED OP Re:Re:' }
        ]);
    assert.equal(result?.bvid, 'backup');
    assert.deepEqual(calls, ['backup']);
});
test('custom songs use their confirmed IDs and restricted modes still exclude other sources', async () => {
    const localSong = { ...song, youtubeVideoId: 'confirmed', bilibiliVideoId: 'confirmed-bv' };
    const { context, calls } = setup(localSong);
    const result = await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'bilibili-only');
    assert.equal(result?.bvid, 'confirmed-bv');
    assert.deepEqual(calls, ['confirmed-bv']);
});
test('an aborted prefetch makes no source requests or proxy-health changes', async () => {
    const { context, calls } = setup();
    const controller = new AbortController();
    controller.abort();
    const result = await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'smart',
        { yt: new Set(), bili: new Set() }, controller.signal, song);
    assert.equal(result, null);
    assert.deepEqual(calls, []);
    assert.deepEqual(context.biliProxyState, {});
});
test('search results keep relation-confirmed alternatives but drop misleading title-only backups', async () => {
    const { context } = setup();
    context.searchQuizYouTubeCandidates = async () => [
        { source: 'youtube', videoId: 'main', title: 'ERASED OP Re:Re:' },
        { source: 'youtube', videoId: 'backup', title: 'Re:Re: ASIAN KUNG-FU GENERATION' },
        { source: 'youtube', videoId: 'weak', title: 'Re:Re:' }
    ];
    const result = await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'smart');
    assert.deepEqual(Array.from(result?.alternatives || [], candidate => candidate.videoId), ['main', 'backup']);
});

test('candidate collection enforces its hard deadline even when every source hangs', async () => {
    const { context } = setup();
    context.GATHER_HARD = 20;
    context.searchQuizItunesCandidates = () => new Promise(() => {});
    context.searchQuizYouTubeCandidates = () => new Promise(() => {});
    context.searchBilibili = () => new Promise(() => {});
    context.settleWithin = (promise, ms, fallback) => {
        // Leave the independent Bilibili budget unresolved; only the gather deadline may release this test.
        if (ms >= 10000) return promise;
        let timer;
        return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); })])
            .finally(() => clearTimeout(timer));
    };
    const before = performance.now();
    assert.equal(await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'smart'), null);
    assert.ok(performance.now() - before < 250);
});

test('expired resolved stream is searched again instead of reusing an old signed URL', async () => {
    const start = app.indexOf('function audioResultKey(');
    const end = app.indexOf('async function searchQuizItunesCandidates(', start);
    const old = { source: 'bilibili', url: 'expired', resolvedAt: Date.now() - 60 * 60 * 1000 };
    const cache = new Map([['Re:Re:|ASIAN KUNG-FU GENERATION|ERASED|OP|smart', old]]);
    const context = { audioSourcePref: 'smart', gameState: { currentSong: song }, resolvedAudioCache: cache,
        fetchAudioInFlight: new Map(), fetchAudioInner: async () => ({ source: 'bilibili', url: 'fresh' }) };
    vm.createContext(context);
    vm.runInContext(app.slice(start, end), context);
    assert.equal((await context.fetchAudio(song.title, song.artist, song.anime, song.type)).url, 'fresh');
});
