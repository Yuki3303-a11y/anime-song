import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

test('YouTube search returns when every API key is exhausted', () => {
  const start = appSource.indexOf('async function searchYouTube(query) {');
  const end = appSource.indexOf('// =====================================================================', start);
  const fn = appSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  const context = {
    youtubeCache: { get: () => null },
    YT_API_KEYS: ['key-1', 'key-2'],
    ytKeyIndex: 0,
    ytKeyExhausted: new Set([0, 1]),
    console: { error() {} },
  };
  vm.createContext(context);
  const result = vm.runInContext(`${fn}\nsearchYouTube('song')`, context, { timeout: 100 });
  return assert.doesNotReject(async () => assert.equal(await result, null));
});

test('quiz audio error recovery remains installed after loading a question', () => {
  const load = appSource.indexOf('function loadQuestion() {');
  const next = appSource.indexOf('function buildBiliProxyUrl(', load);
  assert.ok(load >= 0 && next > load);
  assert.equal(appSource.slice(load, next).includes('audio.onerror ='), false);
  assert.equal((appSource.match(/audio\.onerror\s*=/g) || []).length, 1);
});

test('preferred Bilibili source cannot return an iTunes cache entry', () => {
  const start = appSource.indexOf('async function fetchAudio(');
  const end = appSource.indexOf('async function fetchAudioInner(', start);
  const fn = appSource.slice(start, end);
  const context = {
    audioCache: { get: () => ({ url: 'https://example.test/preview', source: 'itunes' }), delete() {} },
    audioSourcePref: 'bilibili-only',
    normalizeAudioEntry: x => x,
    audioResultKey: (...parts) => parts.join('|'), resolvedAudioCache: new Map(),
    fetchAudioInFlight: new Map(),
    gameState: { currentSong: null },
    fetchAudioInner: async () => ({ url: 'https://example.test/bili', source: 'bilibili' }),
  };
  vm.createContext(context);
  return vm.runInContext(`${fn}\nfetchAudio('title', 'artist', 'anime')`, context)
    .then(result => assert.equal(result.source, 'bilibili'));
});

test('library preview shares the exact Bilibili-only question search', async () => {
  const start = appSource.indexOf('async function fetchAudio(');
  const end = appSource.indexOf('async function fetchAudioInner(', start);
  const calls = [];
  const context = {
    audioCache: { get: () => null, delete() {} }, audioSourcePref: 'bilibili-only',
    normalizeAudioEntry: x => x, fetchAudioInFlight: new Map(),
    audioResultKey: (...parts) => parts.join('|'), resolvedAudioCache: new Map(),
    gameState: { currentSong: { type: 'OP' } },
    fetchAudioInner: async (...args) => { calls.push(args.at(-1)); return { url: 'ok' }; },
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  await Promise.all([
    context.fetchAudio('Song', 'Artist', 'Anime', 'OP', false),
    context.fetchAudio('Song', 'Artist', 'Anime', 'OP', true),
  ]);
  assert.deepEqual(calls, ['bilibili-only']);
});

test('local audio proxy rejects non-Bilibili and non-HTTPS stream URLs', () => {
  const source = fs.readFileSync(path.join(root, 'bili-proxy.mjs'), 'utf8');
  const start = source.indexOf('function pipeStream(');
  const end = source.indexOf('// ---------- HTTP 服务 ----------', start);
  const fn = source.slice(start, end);
  const policy = source.slice(source.indexOf('const STREAM_HOST_SUFFIXES ='), source.indexOf('// ---------- B站 API 请求'));
  let upstreamCalls = 0;
  let lastOptions;
  const context = {
    URL,
    UA: 'test', REFERER: 'test',
    http: { get(options) { upstreamCalls++; lastOptions = options; return { setTimeout() {}, on() {} }; } },
    https: { get(options) { upstreamCalls++; lastOptions = options; return { setTimeout() {}, on() {} }; } },
  };
  vm.createContext(context);
  vm.runInContext(policy + fn, context);
  const response = () => ({ status: null, writeHead(code) { this.status = code; }, end() {} });
  for (const url of ['http://127.0.0.1:8080/private', 'https://example.com/audio', 'http://upos-sz-mirrorcos.bilivideo.com/audio']) {
    const res = response();
    context.pipeStream(res, url, {});
    assert.equal(res.status, 403, url);
  }
  assert.equal(upstreamCalls, 0);
  context.pipeStream(response(), 'https://upos-sz-mirrorcos.bilivideo.com/audio?token=a%2Fb', {});
  assert.equal(lastOptions.path, '/audio?token=a%2Fb');
  assert.match(source, /server\.listen\(PORT, ['"]127\.0\.0\.1['"]/);
  assert.equal(source.includes('pipeStream(res, decodeURIComponent(streamParam), req)'), false);
});

test('Vercel stream proxy preserves byte range response', async () => {
  const source = fs.readFileSync(path.join(root, 'api/search.js'), 'utf8');
  let requestOptions;
  const upstream = {
    statusCode: 206,
    headers: { 'content-type': 'audio/mp4', 'content-length': '100', 'content-range': 'bytes 0-99/1000' },
    pipe(res) { res.piped = true; },
  };
  const https = {
    get(options, callback) {
      requestOptions = options;
      callback(upstream);
      return { setTimeout() {}, on() {} };
    },
  };
  const context = {
    require(name) {
      if (name === 'https') return https;
      if (name === 'http') return https;
      if (name === 'url') return { URL };
      if (name === 'spark-md5') return { hash: () => '' };
      throw new Error(name);
    },
    module: { exports: null }, process: { env: {} }, URLSearchParams,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const res = {
    headers: {}, statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    end() { return this; },
    json() { return this; },
  };
  await context.module.exports({ method: 'GET', headers: { range: 'bytes=0-99' }, query: { stream: 'https://upos-sz-mirrorcos.bilivideo.com/audio?token=a%2Fb' } }, res);
  assert.equal(requestOptions.headers.Range, 'bytes=0-99');
  assert.equal(requestOptions.path, '/audio?token=a%2Fb');
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers['content-range'], 'bytes 0-99/1000');
  assert.equal(res.piped, true);
});

test('Vercel stream proxy retries an allowed backup CDN', async () => {
  const source = fs.readFileSync(path.join(root, 'api/search.js'), 'utf8');
  const hosts = [];
  const https = {
    get(options, callback) {
      hosts.push(options.hostname);
      const primary = hosts.length === 1;
      queueMicrotask(() => callback({
        statusCode: primary ? 502 : 206,
        headers: primary ? {} : { 'content-type': 'audio/mp4' },
        resume() {},
        pipe(res) { res.piped = true; },
      }));
      return { setTimeout() {}, on() {}, destroy() {} };
    },
  };
  const context = {
    require(name) {
      if (name === 'https' || name === 'http') return https;
      if (name === 'url') return { URL };
      if (name === 'spark-md5') return { hash: () => '' };
      throw new Error(name);
    },
    module: { exports: null }, process: { env: {} }, URLSearchParams,
    setTimeout, clearTimeout, queueMicrotask,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const res = {
    headers: {}, headersSent: false, statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; this.headersSent = true; return this; },
    end() { return this; }, json() { return this; },
  };
  await context.module.exports({ method: 'GET', headers: {}, query: {
    stream: 'https://primary.bilivideo.com/audio',
    backup: 'https://backup.bilivideo.com/audio',
  } }, res);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(hosts, ['primary.bilivideo.com', 'backup.bilivideo.com']);
  assert.equal(res.statusCode, 206);
  assert.equal(res.piped, true);
});

test('PK room creation does not overwrite an existing four-digit room', async () => {
  const start = appSource.indexOf('let pkBusy = false;');
  const end = appSource.indexOf('async function pkJoin() {', start);
  const fn = appSource.slice(start, end);
  const rooms = new Map([['rooms/1000', { host: 'another-player', status: 'waiting' }]]);
  let entered;
  let nextRandom = 0;
  const context = {
    user: { uid: 'new-player' }, db: {}, roomId: null,
    navigator: { onLine: true },
    Math: { floor: Math.floor, random: () => nextRandom++ / 10 },
    SONGS: [{ title: 'song' }],
    buildPlaylist: songs => songs,
    serverTimestamp: () => 123,
    ref: (_db, key) => key,
    retryPK: fn => fn(),
    runTransaction: async (key, change) => {
      const value = change(rooms.get(key) || null);
      if (value === undefined) return { committed: false };
      rooms.set(key, value);
      return { committed: true };
    },
    set: async (key, value) => { rooms.set(key, value); },
    enterRoom: id => { entered = id; },
    notify: () => {},
    console: { error() {} },
  };
  vm.createContext(context);
  await vm.runInContext(`${fn}\npkCreate()`, context);
  assert.equal(rooms.get('rooms/1000').host, 'another-player');
  assert.equal(entered, '1900');
  assert.equal(rooms.get('rooms/1900').host, 'new-player');
});

test('PK joining cannot replace a guest who joined concurrently', async () => {
  const start = appSource.indexOf('async function pkJoin() {');
  const end = appSource.indexOf('function pkShare() {', start);
  const fn = appSource.slice(start, end);
  const room = { host: 'host-player', guest: 'other-guest', status: 'waiting', scores: { 'host-player': 0, 'other-guest': 0 } };
  let entered = false;
  const context = {
    pkBusy: false, user: { uid: 'new-guest' }, navigator: { onLine: true },
    $: () => ({ value: '1234' }), db: {}, roomId: null,
    ref: (_db, key) => key,
    retryPK: fn => fn(),
    get: async () => ({ exists: () => true, val: () => ({ ...room, guest: null }) }),
    update: async (_key, change) => { room.guest = change.guest; },
    runTransaction: async (_key, change) => {
      const next = change(room);
      if (next === undefined) return { committed: false, snapshot: { val: () => room } };
      Object.assign(room, next);
      return { committed: true, snapshot: { val: () => room } };
    },
    enterRoom: () => { entered = true; },
    notify: () => {}, console: { error() {} },
  };
  vm.createContext(context);
  await vm.runInContext(`${fn}\npkJoin()`, context);
  assert.equal(room.guest, 'other-guest');
  assert.equal(entered, false);
});

test('PK start is reserved for the host after a guest joins', async () => {
  const start = appSource.indexOf('async function pkStart() {');
  const end = appSource.indexOf('function enterRoom(', start);
  const fn = appSource.slice(start, end);
  const room = { host: 'host-player', guest: 'guest-player', status: 'waiting' };
  const context = {
    roomId: '1234', user: { uid: 'guest-player' }, db: {},
    ref: (_db, key) => key,
    update: async (_key, change) => Object.assign(room, change),
    runTransaction: async (_key, change) => {
      const next = change(room);
      if (next === undefined) return { committed: false };
      Object.assign(room, next);
      return { committed: true };
    },
    notify() {}, console: { error() {} },
  };
  vm.createContext(context);
  await vm.runInContext(`${fn}\npkStart()`, context);
  assert.equal(room.status, 'waiting');
});

test('an older review audio request cannot replace the current review song', async () => {
  const start = appSource.indexOf('function loadQuestion() {');
  const end = appSource.indexOf('function buildBiliProxyUrl(', start);
  const fn = appSource.slice(start, end);
  const pending = [];
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, disabled: false });
    return elements.get(id);
  };
  const gameState = {
    playlist: [{ title: 'first', anime: 'A' }, { title: 'second', anime: 'B' }],
    questionIndex: 0, viewingHistory: true,
    answerHistory: [
      { song: { title: 'first', anime: 'A', artist: 'one' }, isCorrect: true },
      { song: { title: 'second', anime: 'B', artist: 'two' }, isCorrect: true },
    ],
    fetchGeneration: 0,
  };
  const audio = { src: '', pause() {} };
  const context = {
    gameState, audio, progressFill: { style: {} }, $, stopQuizYT() {},
    clearQuizMediaTimeout() {}, setQuizMediaState() {},
    renderHistoryOptions() {}, showSongInfo() {}, updateNavButtons() {}, animateScore() {},
    fetchAudio: () => new Promise(resolve => pending.push(resolve)),
    quizYT: {}, endGame() {},
  };
  vm.createContext(context);
  vm.runInContext(fn, context);
  context.loadQuestion();
  gameState.questionIndex = 1;
  context.loadQuestion();
  pending[1]({ url: 'https://example.test/second', source: 'itunes' });
  await Promise.resolve();
  pending[0]({ url: 'https://example.test/first', source: 'itunes' });
  await Promise.resolve();
  assert.equal(audio.src, 'https://example.test/second');
});

test('answer shows inline result and navigation without waiting for detail popup', () => {
  const start = appSource.indexOf('function handleAnswer(btn, selected) {');
  const end = appSource.indexOf('function showSongInfo(', start);
  const fn = appSource.slice(start, end);
  const firstSong = { anime: 'A', title: 'first', artist: 'one' };
  const gameState = {
    isLocked: false, hints: { h1: false, h2: false }, currentSong: firstSong,
    guessType: 'anime', answerHistory: [], score: 0, combo: 0, correctCount: 0,
    questionIndex: 0, fetchGeneration: 1,
  };
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { classList: { add() {}, remove() {} }, innerHTML: '', style: {} });
    return elements.get(id);
  };
  let resultCount = 0;
  let navUpdates = 0;
  const context = {
    gameState, $, audio: { pause() {} }, stopQuizYT() {}, beep() {}, flashScreen() {},
    showSongInfo() { resultCount++; }, animateScore() {}, updateNavButtons() { navUpdates++; },
    getGuessValue: song => song.anime,
    document: { querySelectorAll: selector => selector === '.opt-btn' ? [{ textContent: 'B', classList: { add() {} } }] : [] },
    setTimeout: () => assert.fail('answer should not wait for a timer'),
    showAnimeDetail: () => assert.fail('answer should not open the detail panel automatically'),
  };
  vm.createContext(context);
  vm.runInContext(fn, context);
  context.handleAnswer({ classList: { add() {} } }, 'B');
  assert.equal(resultCount, 1);
  assert.equal(navUpdates, 1);
});

test('answer immediately reveals the left detail while leaving the question player intact', () => {
  const start = appSource.indexOf('function showSongInfo(isCorrect) {');
  const end = appSource.indexOf('function showCombo()', start);
  assert.ok(start >= 0 && end > start);
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { textContent: '', style: {}, classList: {
        add(name) { classes.add(name); }, contains(name) { return classes.has(name); },
      } });
    }
    return elements.get(id);
  };
  const song = { title: 'Opening', anime: 'Anime', artist: 'Singer' };
  const detailCalls = [];
  const context = {
    $, gameState: { currentSong: song, questionIndex: 0, playlist: [song], viewingHistory: false },
    animeLabel: value => value.anime,
    showAnimeDetail: (value, options) => detailCalls.push({ value, options }),
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  context.showSongInfo(true);
  assert.equal($('gameAudioPanel').classList.contains('answered'), true);
  assert.equal(detailCalls.length, 1);
  assert.equal(detailCalls[0].value, song);
  assert.equal(detailCalls[0].options.auto, true);
  assert.equal($('answerNextBtn').textContent, '查看结果 →');
});

test('home cover controls rotate hero and page through all seasonal posters', () => {
  const start = appSource.indexOf('const homeGallerySeason =');
  const end = appSource.indexOf("$('inlineDetailHost').appendChild", start);
  assert.ok(start >= 0 && end > start);
  const songs = Array.from({ length: 6 }, (_, index) => ({ anilistId: index + 1, animeCN: `番剧${index + 1}`, anime: `Anime${index + 1}` }));
  const springSong = { anilistId: 7, animeCN: '春番', anime: 'Spring Anime' };
  const covers = Object.fromEntries([...songs, springSong].map(song => [song.anilistId, `cover-${song.anilistId}.jpg`]));
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { src: '', textContent: '', innerHTML: '' });
    return elements.get(id);
  };
  const context = { $, SEASONAL_POOLS: { '2026-07': songs, '2026-04': [springSong] }, SEASONAL_COVERS: covers, escapeHTML: value => value };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  context.renderHomeAnimeGallery();
  assert.equal($('heroFeaturedCover').src, 'cover-1.jpg');
  assert.match($('homeAnimePosters').innerHTML, /番剧4/);
  assert.doesNotMatch($('homeAnimePosters').innerHTML, /番剧5/);
  context.shiftHomeAnime('hero', -1);
  assert.equal($('heroFeaturedCover').src, 'cover-7.jpg');
  context.shiftHomeAnime('gallery', 1);
  assert.match($('homeAnimePosters').innerHTML, /番剧5/);
  assert.doesNotMatch($('homeAnimePosters').innerHTML, /番剧1/);
  context.shiftHomeAnime('gallery', 1);
  assert.match($('homeAnimePosters').innerHTML, /番剧1/);
});

test('homepage seasonal gallery follows the newest published quarter', () => {
  const start = appSource.indexOf('const homeGallerySeason =');
  const end = appSource.indexOf("$('inlineDetailHost').appendChild", start);
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { src: '', textContent: '', innerHTML: '' });
    return elements.get(id);
  };
  const fall = { anilistId: 8, animeCN: '秋番', anime: 'Autumn Anime' };
  const context = { $, SEASONAL_POOLS: { '2026-07': [{ anilistId: 1, animeCN: '夏番' }], '2026-10': [fall] },
    SEASONAL_COVERS: { 1: 'summer.jpg', 8: 'autumn.jpg' }, escapeHTML: value => value };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  context.renderHomeAnimeGallery();
  assert.equal($('homeGalleryCount').textContent, '1 / 1');
  assert.equal($('homeAnimeSeasonLabel').textContent, '2026 / AUTUMN ANIME');
  assert.equal($('homeAnimeTitle').textContent, '从封面认出这个秋天');
  assert.match($('homeAnimePosters').innerHTML, /秋番/);
  assert.doesNotMatch($('homeAnimePosters').innerHTML, /夏番/);
});

test('replaying the question after opening full audio restores the quiz clip', () => {
  const start = appSource.indexOf('function togglePlay() {'), end = appSource.indexOf('function stopQuizYT()', start);
  assert.ok(start >= 0 && end > start);
  let stoppedFull = 0;
  const audio = { src: 'full-version', play: () => Promise.resolve(), pause() {} };
  const elements = new Map([['fullPlayer', { style: { display: 'block' } }]]);
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { classList: { add() {}, remove() {} }, innerHTML: '' });
    return elements.get(id);
  };
  const context = {
    $, audio, audioContext: null, playLock: false, quizYT: { active: false },
    gameState: { isPlaying: false, lastAudioResult: { url: 'quiz-clip', source: 'bilibili' } },
    stopFullPlayer() { stoppedFull++; $('fullPlayer').style.display = 'none'; },
    stopMusicPlayer() {}, setQuizMediaState() {}, sourceLabel: source => source,
    recoverQuestionAudio() {}, setTimeout: () => 1, clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  context.togglePlay();
  assert.equal(stoppedFull, 1);
  assert.equal(audio.src, 'quiz-clip');
});

test('unplayable skipped questions do not count as answered in the result', () => {
  const start = appSource.indexOf('function endGame() {');
  const end = appSource.indexOf('function restartGame() {', start);
  const fn = appSource.slice(start, end);
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { classList: { add() {} }, textContent: '' });
    return elements.get(id);
  };
  const storage = new Map();
  const context = {
    $,
    gameState: {
      mode: 'single', playlist: Array(10).fill({}), answerHistory: Array(8).fill({}),
      correctCount: 7, score: 80, maxCombo: 4, gameMode: 'anime',
    },
    spawnCelebration() {},
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  vm.createContext(context);
  vm.runInContext(fn, context);
  context.endGame();
  assert.equal($('endScore').textContent, '7 / 8');
  assert.equal(JSON.parse(storage.get('aq_rec'))[0].n, 8);
});

test('saved localhost proxy URLs still reach the loopback-only listener', () => {
  const start = appSource.indexOf('function normalizeLocalProxyUrl(');
  const end = appSource.indexOf('window.BILI_WORKER_URL =', start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  assert.equal(context.normalizeLocalProxyUrl('http://localhost:8765'), 'http://127.0.0.1:8765');
  assert.equal(context.normalizeLocalProxyUrl('https://anime-song-gamma.vercel.app'), 'https://anime-song-gamma.vercel.app');
});

test('closing the Bilibili music player releases shared audio', () => {
  const start = appSource.indexOf('function hideMusicPlayer() {');
  const end = appSource.indexOf('function stopMusicPlayer() {', start);
  const fn = appSource.slice(start, end);
  let paused = false;
  const context = {
    musicUseAudio: true,
    audio: { pause() { paused = true; } },
    $: () => ({ classList: { remove() {} }, innerHTML: '' }),
    ytPlayer: null, playlist: {},
    stopMusicProgress() {}, renderFavorites() {},
  };
  vm.createContext(context);
  vm.runInContext(fn, context);
  context.hideMusicPlayer();
  assert.equal(paused, true);
  assert.equal(context.musicUseAudio, false);
});

test('Bilibili matching normalizes Unicode punctuation and accepts Chinese song aliases', () => {
  const start = appSource.indexOf('function normalizeBiliText(');
  const end = appSource.indexOf('async function searchBilibili(', start);
  assert.ok(start >= 0 && end > start, 'Bilibili normalization helpers are missing');
  const context = {};
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  assert.equal(context.normalizeBiliText('ＫＩＣＫ－ＢＡＣＫ！'), 'kickback');
  assert.equal(context.biliTitleMatches('【冰菓 OP】温柔的理由 高音质', ['Yasashisa no Riyuu', '温柔的理由']), true);
});

test('each Bilibili search strategy receives a fresh timeout controller', () => {
  const start = appSource.indexOf('async function searchBilibili(');
  const end = appSource.indexOf('async function getBilibiliAudioUrl(', start);
  assert.ok(start >= 0 && end > start);
  const fn = appSource.slice(start, end);
  const tryStart = fn.indexOf('async function trySearch(');
  const tryEnd = fn.indexOf('function scoreResult(', tryStart);
  assert.ok(tryStart >= 0 && tryEnd > tryStart);
  assert.match(fn.slice(tryStart, tryEnd), /new AbortController\(\)/);
  assert.doesNotMatch(fn.slice(0, tryStart), /new AbortController\(\)/);
});

test('Bilibili proxy URL carries the backup CDN URL', () => {
  const start = appSource.indexOf('function buildBiliProxyUrl(');
  const end = appSource.indexOf('async function fetchBilibiliAudio(', start);
  assert.ok(start >= 0 && end > start);
  const context = { window: { BILI_WORKER_URL: 'http://127.0.0.1:8765' } };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  const value = context.buildBiliProxyUrl(
    'https://primary.bilivideo.com/audio',
    'https://backup.bilivideo.com/audio',
  );
  assert.match(value, /backup=/);
  assert.equal(new URL(value).searchParams.get('backup'), 'https://backup.bilivideo.com/audio');
});

test('Bilibili audio resolution tries the next matched video when the first has no stream', async () => {
  const start = appSource.indexOf('async function fetchBilibiliAudio(');
  const end = appSource.indexOf('// In-flight dedup:', start);
  assert.ok(start >= 0 && end > start);
  const attempted = [];
  const context = {
    gameState: { currentSong: { titleCN: '中文歌名', animeCN: '中文番名' } },
    searchBilibili: async () => ({
      bvid: 'bad', title: 'first',
      _alternates: [{ bvid: 'good', title: 'second' }],
    }),
    getBilibiliAudioUrl: async bvid => {
      attempted.push(bvid);
      return bvid === 'good' ? { url: 'https://cdn/audio', backupUrl: '', duration: 90 } : null;
    },
    buildBiliProxyUrl: url => url,
    audioCache: { set() {} },
    biliProxyState: { down: true, reason: 'no-stream' },
  };
  vm.createContext(context);
  const result = await vm.runInContext(`${appSource.slice(start, end)}\nfetchBilibiliAudio('song','artist','anime','OP','key')`, context);
  assert.deepEqual(attempted, ['bad', 'good']);
  assert.equal(result.bvid, 'good');
});

test('Bilibili recovery excludes a video whose stream failed during playback', async () => {
  const start = appSource.indexOf('async function fetchBilibiliAudio(');
  const end = appSource.indexOf('// In-flight dedup:', start);
  const attempted = [];
  const context = {
    gameState: { currentSong: {} },
    searchBilibili: async () => ({
      bvid: 'broken', title: 'first',
      _alternates: [{ bvid: 'working', title: 'second' }],
    }),
    getBilibiliAudioUrl: async bvid => {
      attempted.push(bvid);
      return { url: `https://cdn/${bvid}`, duration: 90 };
    },
    buildBiliProxyUrl: url => url,
    audioCache: { set() {} },
    biliProxyState: {},
  };
  vm.createContext(context);
  const result = await vm.runInContext(
    `${appSource.slice(start, end)}\nfetchBilibiliAudio('song','artist','anime','OP','key',new Set(['broken']))`,
    context,
  );
  assert.deepEqual(attempted, ['working']);
  assert.equal(result.bvid, 'working');
});

test('automatic recovery remembers earlier failed sources and moves to a new source', async () => {
  const start = appSource.indexOf('async function recoverQuestionAudio(');
  const end = appSource.indexOf('function buildBiliProxyUrl(', start);
  assert.ok(start >= 0 && end > start);
  const seen = [];
  const gameState = {
    recoveringAudio: false, isLocked: false,
    currentSong: { title: 'song', anime: 'anime', artist: 'artist' },
    lastAudioResult: { source: 'itunes', url: 'https://itunes.test/clip' },
    mediaRetryCount: 0, fetchGeneration: 1,
    failedAudioSources: new Set(), failedBiliVideos: new Set(),
  };
  const context = {
    gameState,
    clearQuizMediaTimeout() {}, stopQuizYT() {}, setQuizMediaState() {},
    audio: { pause() {} }, audioCache: { delete() {} },
    forgetResolvedAudio() {},
    fetchAudioInner: async (_title, _artist, _anime, _key, excluded) => {
      seen.push([...excluded]);
      return { source: 'youtube', url: 'yt:abc' };
    },
    prepareQuestionAudio(result) { gameState.lastAudioResult = result; },
    skipUnplayableQuestion() {},
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  await context.recoverQuestionAudio('failed');
  await context.recoverQuestionAudio('failed again');
  assert.deepEqual(seen, [['itunes'], ['itunes', 'youtube']]);
});

test('manual reload retries the selected source even in Bilibili-only mode', async () => {
  const start = appSource.indexOf('async function retryQuestionAudio()');
  const end = appSource.indexOf('function buildBiliProxyUrl(', start);
  assert.ok(start >= 0 && end > start, 'manual reload helper is missing');
  const excluded = [];
  const gameState = {
    recoveringAudio: false, isLocked: false,
    currentSong: { title: 'song', anime: 'anime', artist: 'artist' },
    lastAudioResult: { source: 'bilibili', bvid: 'bad' },
    fetchGeneration: 1, failedAudioSources: new Set(['bilibili']),
    failedBiliVideos: new Set(['bad']),
  };
  const context = {
    gameState, clearQuizMediaTimeout() {}, stopQuizYT() {},
    audio: { pause() {} }, setQuizMediaState() {},
    audioCache: { delete() {} }, bilibiliAudioCache: { delete() {} },
    forgetResolvedAudio() {},
    fetchAudioInner: async (_title, _artist, _anime, _key, sources) => {
      excluded.push([...sources]);
      return { source: 'bilibili', url: 'https://cdn.test/audio' };
    },
    prepareQuestionAudio() {}, skipUnplayableQuestion() {},
    console: { error() {} },
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  await context.retryQuestionAudio();
  assert.deepEqual(excluded, [[]]);
  assert.equal(gameState.failedAudioSources.size, 0);
  assert.equal(gameState.failedBiliVideos.size, 0);
});

test('question answers are disabled as soon as they are rendered during loading', () => {
  const start = appSource.indexOf('function renderOptions(song) {');
  const end = appSource.indexOf('// =====================================================================\n// Hint System', start);
  const buttons = [];
  const grid = { innerHTML: '', appendChild(button) { buttons.push(button); } };
  const context = {
    gameState: { mediaState: 'searching', guessType: 'anime' },
    getGuessValue: () => 'A', buildWrongOptions: () => ['B', 'C', 'D'],
    shuffle: values => values, $: () => grid,
    document: { createElement: () => ({ dataset: {}, style: {} }) },
    handleAnswer() {},
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  context.renderOptions({});
  assert.equal(buttons.length, 4);
  assert.deepEqual(buttons.map(button => button.disabled), [true, true, true, true]);
});

test('one player volume update applies to native audio, YouTube, and every slider', () => {
  const start = appSource.indexOf('const PLAYER_VOLUME_KEY');
  const end = appSource.indexOf('// =====================================================================\n// Custom Song Library', start);
  assert.ok(start >= 0 && end > start, 'shared player volume helpers are missing');
  const elements = new Map([
    ['volSlider', { value: '' }], ['fpVolRange', { value: '' }],
    ['musicVolRange', { value: '' }], ['libraryVolRange', { value: '' }],
    ['libraryPreviewAudio', { volume: 1 }], ['volValue', { textContent: '' }],
  ]);
  const storage = new Map();
  const context = {
    audio: { volume: 1 },
    ytPlayer: { setVolume(value) { this.volume = value; } },
    volumeMuted: false,
    $: id => elements.get(id) || null,
    updateVolIcon() {},
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  assert.equal(context.audio.volume, 0.5, 'missing saved volume should default to 50%');
  context.setPlayerVolume(35);
  assert.equal(context.audio.volume, 0.35);
  assert.equal(context.ytPlayer.volume, 35);
  assert.equal(elements.get('volSlider').value, '35');
  assert.equal(elements.get('fpVolRange').value, '35');
  assert.equal(elements.get('musicVolRange').value, '35');
  assert.equal(elements.get('libraryVolRange').value, '35');
  assert.equal(elements.get('libraryPreviewAudio').volume, 0.35);
  assert.equal(elements.get('volValue').textContent, '35%');
});

test('quiz options remain disabled until media becomes usable', () => {
  const start = appSource.indexOf('function setQuizMediaState(');
  const end = appSource.indexOf('function loadQuestion()', start);
  assert.ok(start >= 0 && end > start, 'quiz media state helper is missing');
  const options = [{ disabled: false }, { disabled: false }];
  const elements = new Map([
    ['playerStatus', { textContent: '', dataset: {}, className: '' }],
    ['playBtn', { disabled: false }],
    ['retryAudioBtn', { hidden: true }],
  ]);
  const context = {
    gameState: { mediaState: 'idle' },
    $: id => elements.get(id) || null,
    document: { querySelectorAll: () => options },
    clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  context.setQuizMediaState('buffering', '正在缓冲');
  assert.deepEqual(options.map(x => x.disabled), [true, true]);
  context.setQuizMediaState('ready', '音频已就绪');
  assert.deepEqual(options.map(x => x.disabled), [false, false]);
});

test('quiz media timeout triggers generation-safe automatic recovery', () => {
  const start = appSource.indexOf('function setQuizMediaState(');
  const end = appSource.indexOf('function loadQuestion()', start);
  assert.ok(start >= 0 && end > start, 'quiz media timeout helpers are missing');
  let pending;
  let recovered = '';
  const context = {
    $: () => null,
    document: { querySelectorAll: () => [] },
    gameState: { fetchGeneration: 7 },
    setTimeout(fn) { pending = fn; return 1; },
    clearTimeout() {},
    recoverQuestionAudio(reason) { recovered = reason; },
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  context.armQuizMediaTimeout('播放启动超时', 1000);
  pending();
  assert.equal(recovered, '播放启动超时');
});

test('quiz UI exposes clear playback state and recovery controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.match(html, /id="playerStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="retryAudioBtn"/);
  assert.match(html, /失败时自动换源/);
  assert.match(html, /id="volValue"/);
  assert.match(css, /\.opt-btn:disabled/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
