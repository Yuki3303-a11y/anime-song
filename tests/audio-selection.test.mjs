import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { scoreAudioCandidate, rankAudioCandidates, uniqueChallengePool, audioSearchQueries, pickReplacementSong } from '../audio-selection.mjs';

const song = { title: 'Re:Re:', artist: 'ASIAN KUNG-FU GENERATION', anime: 'ERASED', animeCN: '只有我不存在的城市', type: 'OP' };

test('rejects unrelated or misleading audio even when the song title matches', () => {
  assert.equal(scoreAudioCandidate(song, { source: 'youtube', title: 'Re:Re: cover piano ERASED OP' }), -1);
  assert.equal(scoreAudioCandidate(song, { source: 'youtube', title: 'Re:Re: another anime ED' }), -1);
  assert.equal(scoreAudioCandidate(song, { source: 'itunes', title: 'Re:Re:', artist: 'Other Singer', album: 'Other Album' }), -1);
  assert.equal(scoreAudioCandidate(song, { source: 'itunes', title: 'Re:Re:', artist: 'Other Singer', album: 'ERASED' }), -1);
  assert.equal(scoreAudioCandidate(song, { source: 'bilibili', title: 'Other song ERASED OP' }), -1);
  assert.equal(scoreAudioCandidate(song, { source: 'bilibili', title: 'ERASED OP Re:Re: 动态鼓谱' }), -1);
  assert.equal(scoreAudioCandidate(song, { source: 'youtube', title: 'ERASED OP Re:Re: guitar lesson' }), -1);
});

test('legitimate titles containing Live remain playable while actual live versions are rejected', () => {
  const alive = { title: 'ALIVE', anime: '莉可丽丝', artist: 'ClariS', type: 'OP' };
  const date = { title: 'Date A Live', anime: '约会大作战', artist: 'Sweet Arms', type: 'OP' };
  const love = { title: 'Snow Halation', anime: 'LoveLive!', artist: "μ's", type: 'ED' };
  assert.ok(scoreAudioCandidate(alive, { source: 'youtube', title: '莉可丽丝 OP ALIVE' }) >= 0);
  assert.ok(scoreAudioCandidate(date, { source: 'youtube', title: '约会大作战 OP Date A Live' }) >= 0);
  assert.ok(scoreAudioCandidate(love, { source: 'bilibili', title: 'LoveLive! ED Snow Halation' }) >= 0);
  assert.equal(scoreAudioCandidate(alive, { source: 'youtube', title: '莉可丽丝 OP ALIVE live concert' }), -1);
});

test('compares trustworthy matches across sources and favors stronger evidence', () => {
  const ranked = rankAudioCandidates(song, [
    { source: 'youtube', title: 'ERASED OP Re:Re:' },
    { source: 'itunes', title: 'Re:Re:', artist: song.artist, album: 'Re:Re:' },
    { source: 'bilibili', title: '只有我不存在的城市 OP Re:Re: ASIAN KUNG-FU GENERATION' }
  ]);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].source, 'bilibili');
  assert.ok(ranked.every(item => item.score >= 0));
});

test('a source that failed locally loses priority for the same song', () => {
  const candidates = [
    { source: 'youtube', title: `ERASED OP ${song.title}`, localFailure: true },
    { source: 'bilibili', title: `ERASED OP ${song.title}` }
  ];
  assert.equal(rankAudioCandidates(song, candidates)[0].source, 'bilibili');
});

test('one challenge cannot contain the same title and anime twice', () => {
  const pool = [song, { ...song, type: 'ED' }, { ...song }, { ...song, title: 'Other' }];
  assert.equal(uniqueChallengePool(pool).length, 2);
});

test('a failed question uses an unused song from the same selected pool', () => {
  const pool = [song, { ...song, title: 'Second' }, { ...song, title: 'Third' }];
  const playlist = pool.slice(0, 2);
  assert.equal(pickReplacementSong(pool, playlist, [song])?.title, 'Third');
  assert.equal(pickReplacementSong(pool, pool, [song]), null);
});

test('quiz replaces an unplayable question without consuming a question slot', () => {
  const source = app.slice(app.indexOf('function skipUnplayableQuestion('), app.indexOf('async function recoverQuestionAudio('));
  const spare = { ...song, title: 'Spare' };
  const state = { mode: 'single', currentSong: song, playlist: [song], activePool: [song, spare],
    questionIndex: 0, fetchGeneration: 1, lastAudioResult: null, failedQuestionSongs: [] };
  let loaded = 0;
  const context = {
    gameState: state, clearQuizMediaTimeout() {}, recordLocalAudioCheck() {},
    setQuizMediaState() {}, notify() {}, pickReplacementSong,
    audioSourcePref: 'smart', setTimeout: callback => { callback(); }, loadQuestion: () => { loaded++; },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.skipUnplayableQuestion('unavailable');
  assert.equal(state.questionIndex, 0);
  assert.equal(state.playlist[0].title, 'Spare');
  assert.equal(loaded, 1);
});

test('search variants include localized names without requiring a mismatched artist spelling', () => {
  const queries = audioSearchQueries({ title: 'Avid', titleCN: 'Avid', anime: '86', animeCN: '86—不存在的战区', animeNative: 'エイティシックス', artist: '泽野弘之', type: 'ED' });
  assert.ok(queries.bilibili.some(query => query.includes('86—不存在的战区') && query.includes('Avid')));
  assert.ok(queries.bilibili.some(query => query.includes('エイティシックス') && query.includes('Avid')));
  assert.ok(queries.itunes.includes('Avid'));
  assert.ok(queries.youtube.some(query => query.includes('86') && query.includes('Avid') && !query.includes('泽野弘之')));
});

test('Bilibili keeps searching after unrelated results fill the first page', async () => {
  const source = app.slice(app.indexOf('function normalizeBiliText('), app.indexOf('async function getBilibiliAudioUrl('));
  const queries = [];
  const context = {
    BILI_TIMEOUT: 12000, bilibiliCache: { get: () => null, set() {} },
    window: { BILI_WORKER_URL: 'http://proxy.test' },
    fetch: async url => {
      const query = new URL(url).searchParams.get('q');
      queries.push(query);
      return { ok: true, json: async () => ({ results: queries.length === 1
        ? Array.from({ length: 9 }, (_, i) => ({ bvid: `wrong${i}`, title: `Unrelated ${i}`, duration: 100 }))
        : [{ bvid: 'right', title: '只有我不存在的城市 OP Re:Re:', duration: 250 }] }) };
    },
    setTimeout, clearTimeout, AbortController, Set, Promise, console,
    biliProxyState: {}, audioSearchQueries,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const result = await context.searchBilibili(song.anime, song.title, song.artist, 'OP', { animeCN: song.animeCN });
  assert.ok(queries.length > 1);
  assert.equal(result?.bvid, 'right');
});

test('three-source search waits for the Bilibili search budget instead of discarding it at eight seconds', async () => {
  const source = app.slice(app.indexOf('async function fetchAudioInner('), app.indexOf('function getGuessValue('));
  let budget = 0;
  const context = {
    gameState: { currentSong: song, failedYtVideos: new Set(), failedBiliVideos: new Set() },
    getAllSongs: () => [song], SEASONAL_POOLS: {},
    searchQuizItunesCandidates: async () => [], searchQuizYouTubeCandidates: async () => [],
    searchBilibili: async () => ({ title: `ERASED OP ${song.title}`, bvid: 'right' }),
    settleWithin: async (promise, ms) => { budget = ms; return promise; },
    rankAudioCandidates, audioChecks: [], trackKey: () => 'key',
    getBilibiliAudioUrl: async () => ({ url: 'https://cdn.test/right' }),
    buildBiliProxyUrl: url => url, biliProxyState: {}, Promise, Set, Object,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'smart');
  assert.ok(budget >= 12000, `Bilibili search budget was ${budget} ms`);
});

test('iTunes tries translated song title when the first spelling has no matching recording', async () => {
  const source = app.slice(app.indexOf('async function searchQuizItunesCandidates('), app.indexOf('function settleWithin('));
  const searched = [];
  const localSong = { ...song, titleCN: '重放', artist: '另一个写法' };
  const context = {
    ITUNES_TIMEOUT: 5000, audioSearchQueries,
    fetch: async url => {
      const term = new URL(url).searchParams.get('term');
      searched.push(term);
      return { ok: true, json: async () => ({ results: term === '重放'
        ? [{ trackName: '重放', artistName: '另一个写法', collectionName: 'ERASED', previewUrl: 'correct' }]
        : [] }) };
    },
    AbortController, setTimeout, clearTimeout, Promise, Set,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const results = await context.searchQuizItunesCandidates(localSong);
  assert.ok(searched.includes('重放'));
  assert.equal(results[0]?.url, 'correct');
});

test('YouTube retries a localized query when the first page has no trustworthy song match', async () => {
  const source = app.slice(app.indexOf('async function searchQuizYouTubeCandidates('), app.indexOf('// =====================================================================\n// Bilibili Search', app.indexOf('async function searchQuizYouTubeCandidates(')));
  const localSong = { ...song, animeNative: '僕だけがいない街' };
  const searches = [];
  const context = {
    YT_API_KEYS: ['test-key'], ytKeyIndex: 0, ytKeyExhausted: new Set(), YT_TIMEOUT: 6000,
    audioSearchQueries, rankAudioCandidates,
    fetch: async url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/search')) {
        searches.push(new URL(url).searchParams.get('q'));
        const id = searches.length === 1 ? 'wrong' : 'right';
        const title = searches.length === 1 ? 'Unrelated song' : '僕だけがいない街 OP Re:Re:';
        return { ok: true, json: async () => ({ items: [{ id: { videoId: id }, snippet: { title, channelTitle: 'Anime' } }] }) };
      }
      return { ok: true, json: async () => ({ items: [{ id: searches.length === 1 ? 'wrong' : 'right', status: { embeddable: true } }] }) };
    },
    AbortController, setTimeout, clearTimeout, Promise, Set, Map, console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const results = await context.searchQuizYouTubeCandidates(localSong);
  assert.ok(searches.length > 1);
  assert.equal(results[0]?.videoId, 'right');
});

test('YouTube stops promptly when the network cannot reach its API', async () => {
  const source = app.slice(app.indexOf('async function searchQuizYouTubeCandidates('), app.indexOf('// =====================================================================\n// Bilibili Search', app.indexOf('async function searchQuizYouTubeCandidates(')));
  let requests = 0;
  const context = {
    YT_API_KEYS: ['a', 'b', 'c'], ytKeyIndex: 0, ytKeyExhausted: new Set(), YT_TIMEOUT: 6000,
    audioSearchQueries, rankAudioCandidates,
    fetch: async () => { requests++; throw new TypeError('network unavailable'); },
    AbortController, setTimeout, clearTimeout, Promise, Set, Map, console: { warn() {} },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  assert.equal((await context.searchQuizYouTubeCandidates(song)).length, 0);
  assert.ok(requests <= 2, `unreachable API was called ${requests} times`);
});

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
test('three-source quiz ranks candidates while limited modes never query the excluded platform', async () => {
  const start = app.indexOf('async function fetchAudioInner(');
  const end = app.indexOf('function getGuessValue(', start);
  const calls = [];
  const context = {
    gameState: { currentSong: song, failedYtVideos: new Set(), failedBiliVideos: new Set() },
    getAllSongs: () => [song], SEASONAL_POOLS: {},
    searchQuizItunesCandidates: async () => { calls.push('itunes'); return [{ source: 'itunes', title: song.title, artist: song.artist, url: 'clip' }]; },
    searchQuizYouTubeCandidates: async () => { calls.push('youtube'); return [{ source: 'youtube', title: `ERASED OP ${song.title}`, videoId: 'yt' }]; },
    searchBilibili: async () => { calls.push('bilibili'); return { title: `只有我不存在的城市 OP ${song.title} ${song.artist}`, bvid: 'bv' }; },
    rankAudioCandidates, audioChecks: [], trackKey: () => 'key', getBilibiliAudioUrl: async () => ({ url: 'https://cdn.test/audio' }),
    buildBiliProxyUrl: url => url, biliProxyState: {},
    settleWithin: promise => promise, Promise, Set, Object,
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  const smart = await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'smart');
  assert.equal(smart.source, 'bilibili');
  assert.deepEqual(calls.sort(), ['bilibili', 'itunes', 'youtube']);
  calls.length = 0;
  const duo = await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'itunes-youtube');
  assert.notEqual(duo.source, 'bilibili');
  assert.deepEqual(calls.sort(), ['itunes', 'youtube']);
  calls.length = 0;
  const only = await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'bilibili-only');
  assert.equal(only.source, 'bilibili');
  assert.deepEqual(calls, ['bilibili']);
});

test('failed YouTube embed IDs are excluded before the next ranked attempt', async () => {
  const source = app.slice(app.indexOf('async function fetchAudioInner('), app.indexOf('function getGuessValue('));
  const context = {
    gameState: { currentSong: song, failedYtVideos: new Set(['blocked']), failedBiliVideos: new Set() },
    getAllSongs: () => [song], SEASONAL_POOLS: {},
    searchQuizItunesCandidates: async () => [],
    searchQuizYouTubeCandidates: async () => [
      { source: 'youtube', title: `ERASED OP ${song.title}`, videoId: 'blocked' },
      { source: 'youtube', title: `ERASED OP ${song.title}`, videoId: 'next' }
    ],
    searchBilibili: async () => null, rankAudioCandidates, audioChecks: [], trackKey: () => 'key', settleWithin: promise => promise, Promise, Set, Object,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const result = await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'itunes-youtube');
  assert.equal(result.ytVideoId, 'next');
});

test('Bangumi page includes newly tagged imports and older imports, but not hand-added songs', () => {
  const source = app.slice(app.indexOf('function getBangumiSongs() {'), app.indexOf('function renderWatchLibrary()', app.indexOf('function getBangumiSongs() {')));
  const context = { getCustomSongs: () => [
    { title: 'new', origin: 'bangumi' }, { title: 'old', _importScore: 90 }, { title: 'manual' }
  ] };
  vm.createContext(context);
  vm.runInContext(source, context);
  assert.deepEqual(Array.from(context.getBangumiSongs(), song => song.title), ['new', 'old']);
});

test('preview and quiz reuse the identical scored audio result in Bilibili-only mode', async () => {
  const source = app.slice(app.indexOf('function audioResultKey('), app.indexOf('async function searchQuizItunesCandidates(', app.indexOf('async function fetchAudio(')));
  let requests = 0;
  const context = {
    audioSourcePref: 'bilibili-only', fetchAudioInFlight: new Map(),
    resolvedAudioCache: new Map(), gameState: { currentSong: song },
    fetchAudioInner: async () => { requests++; return { source: 'bilibili', url: 'https://cdn.test/same-recording' }; }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const preview = await context.fetchAudio(song.title, song.artist, song.anime, 'OP', true);
  const quiz = await context.fetchAudio(song.title, song.artist, song.anime, 'OP', false);
  assert.strictEqual(preview, quiz);
  assert.equal(requests, 1);
});

test('YouTube library preview plays the selected quiz video inside the site', async () => {
  const source = app.slice(app.indexOf('async function prepareLibraryPreviewAudio('), app.indexOf('async function playLibraryPreview(', app.indexOf('async function prepareLibraryPreviewAudio(')));
  let playedId = '';
  const context = {
    libraryPreviewSession: { isCurrent: () => true },
    libraryPreviewResult: null, libraryPreviewSource: '', libraryPreviewUrl: '', libraryPreviewVideo: '',
    libraryPreviewState: '', libraryPreviewTimer: null,
    ytReady: true, ytPlayer: { loadVideoById({ videoId }) { playedId = videoId; } },
    ensureYouTubeAPI: async () => {},
    updateLibraryPreviewUI() {}, clearTimeout, setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  await context.prepareLibraryPreviewAudio({ source: 'youtube', url: 'yt:chosen', ytVideoId: 'chosen' }, 1);
  assert.equal(playedId, 'chosen');
  assert.equal(context.libraryPreviewUrl, 'yt:chosen');
  clearTimeout(context.libraryPreviewTimer);
});

test('YouTube preview waits for the player before loading the chosen quiz recording', async () => {
  const source = app.slice(app.indexOf('async function prepareLibraryPreviewAudio('), app.indexOf('async function playLibraryPreview(', app.indexOf('async function prepareLibraryPreviewAudio(')));
  let release;
  const playerReady = new Promise(resolve => { release = resolve; });
  const loaded = [];
  const context = {
    libraryPreviewSession: { isCurrent: () => true },
    libraryPreviewResult: null, libraryPreviewSource: '', libraryPreviewUrl: '', libraryPreviewVideo: '',
    libraryPreviewState: '', libraryPreviewTimer: null,
    ensureYouTubeAPI: () => playerReady,
    ytPlayer: { loadVideoById({ videoId }) { loaded.push(videoId); } },
    updateLibraryPreviewUI() {}, clearTimeout, setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const pending = context.prepareLibraryPreviewAudio({ source: 'youtube', url: 'yt:chosen', ytVideoId: 'chosen' }, 1);
  assert.deepEqual(loaded, []);
  release();
  await pending;
  assert.deepEqual(loaded, ['chosen']);
  clearTimeout(context.libraryPreviewTimer);
});

test('YouTube iframe API is requested only once when first needed', async () => {
  const source = app.slice(app.indexOf('function ensureYouTubeAPI()'), app.indexOf('function onYtError(', app.indexOf('function ensureYouTubeAPI()')));
  let appended = 0;
  const context = {
    document: { createElement: () => ({ remove() {} }), head: { appendChild() { appended++; } } },
    window: {}, clearTimeout, setTimeout, console,
    YT: { Player: class { constructor(_id, options) { queueMicrotask(() => options.events.onReady()); } } },
    applyPlayerVolume() {}, onYtStateChange() {}, onYtError() {},
  };
  vm.createContext(context);
  vm.runInContext(`let ytReady = false; let ytPlayer = null; let youtubeApiPromise = null; ${source}`, context);
  const first = context.ensureYouTubeAPI();
  assert.strictEqual(context.ensureYouTubeAPI(), first);
  assert.equal(appended, 1);
  context.window.onYouTubeIframeAPIReady();
  await first;
  await context.ensureYouTubeAPI();
  assert.equal(appended, 1);
});

test('a failed preview video is excluded and its replacement becomes the quiz version', async () => {
  const source = app.slice(app.indexOf('async function prepareLibraryPreviewAudio('), app.indexOf('async function playLibraryPreview(', app.indexOf('async function prepareLibraryPreviewAudio(')));
  const player = { pause() {}, async play() {}, src: '', volume: 0 };
  let saved = null;
  const context = {
    libraryPreviewSession: { activeKey: 'song', start: () => 2, isCurrent: () => true },
    libraryPreviewSong: song, libraryPreviewResult: { source: 'youtube', url: 'yt:blocked', ytVideoId: 'blocked' },
    libraryPreviewSource: 'youtube', libraryPreviewUrl: 'yt:blocked', libraryPreviewVideo: '',
    libraryPreviewState: 'playing', libraryPreviewTimer: null, libraryPreviewRecovering: false, libraryPreviewRetryCount: 0,
    libraryPreviewFailedSources: new Set(), libraryPreviewFailedVideos: { yt: new Set(), bili: new Set() },
    ytPlayer: { pauseVideo() {} }, $: () => player, trackKey: () => 'song', audioSourcePref: 'smart',
    forgetResolvedAudio() {}, recordLocalAudioCheck() {}, updateLibraryTrackStatus() {}, updateLibraryPreviewUI() {},
    fetchAudioInner: async (_title, _artist, _anime, _key, _sources, _type, _pref, ids) => {
      assert.equal(ids.yt.has('blocked'), true);
      return { source: 'bilibili', url: 'https://cdn.test/backup', bvid: 'backup' };
    },
    rememberResolvedAudio(_song, result) { saved = result; },
    volumeMuted: false, playerVolume: 50, clearTimeout, setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  await context.recoverLibraryPreviewAudio('embed rejected');
  assert.equal(saved.bvid, 'backup');
  assert.equal(player.src, 'https://cdn.test/backup');
});
