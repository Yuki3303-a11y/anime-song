import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

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
  const start = appSource.indexOf('async function fetchAudio(title, artist, anime) {');
  const end = appSource.indexOf('async function fetchAudioInner(', start);
  const fn = appSource.slice(start, end);
  const context = {
    audioCache: { get: () => ({ url: 'https://example.test/preview', source: 'itunes' }), delete() {} },
    audioSourcePref: 'bilibili-only',
    normalizeAudioEntry: x => x,
    fetchAudioInFlight: new Map(),
    fetchAudioInner: async () => ({ url: 'https://example.test/bili', source: 'bilibili' }),
  };
  vm.createContext(context);
  return vm.runInContext(`${fn}\nfetchAudio('title', 'artist', 'anime')`, context)
    .then(result => assert.equal(result.source, 'bilibili'));
});

test('local audio proxy rejects non-Bilibili and non-HTTPS stream URLs', () => {
  const source = fs.readFileSync(path.join(root, 'bili-proxy.mjs'), 'utf8');
  const start = source.indexOf('function pipeStream(res, audioUrl, req) {');
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
    if (!elements.has(id)) elements.set(id, { textContent: '', style: {}, classList: { add() {}, remove() {} }, disabled: false });
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

test('leaving a question cancels its delayed detail popup', () => {
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
  let delayed;
  let popupCount = 0;
  const context = {
    gameState, $, audio: { pause() {} }, stopQuizYT() {}, beep() {}, flashScreen() {},
    showSongInfo() {}, animateScore() {}, updateNavButtons() {},
    getGuessValue: song => song.anime,
    document: { querySelectorAll: selector => selector === '.opt-btn' ? [{ textContent: 'B', classList: { add() {} } }] : [] },
    setTimeout: fn => { delayed = fn; },
    showAnimeDetail: () => { popupCount++; },
  };
  vm.createContext(context);
  vm.runInContext(fn, context);
  context.handleAnswer({ classList: { add() {} } }, 'B');
  gameState.currentSong = { anime: 'C', title: 'later' };
  gameState.questionIndex = 1;
  gameState.fetchGeneration++;
  delayed();
  assert.equal(popupCount, 0);
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
