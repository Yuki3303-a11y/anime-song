import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('YouTube embed requests retain the site origin in their Referer', () => {
    assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
});

test('waiting for a user gesture stops the skip timer but keeps answers disabled', () => {
    let cleared = 0;
    const elements = new Map();
    const button = { disabled: false };
    const context = { gameState: {}, $: id => {
        if (!elements.has(id)) elements.set(id, { dataset: {} });
        return elements.get(id);
    }, document: { querySelectorAll: () => [button] }, clearQuizMediaTimeout() { cleared++; }, stopQuestionLoad() {} };
    vm.createContext(context);
    vm.runInContext(app.slice(app.indexOf('function setQuizMediaState('), app.indexOf('let quizMediaTimeout')), context);
    context.setQuizMediaState('awaiting-play', '点击播放');
    assert.equal(cleared, 1);
    assert.equal(button.disabled, true);
    assert.equal(elements.get('playBtn').disabled, false);
});

test('unavailable YouTube player is bypassed for pins, backups, search and resolved cache', async () => {
    const song = { title: 'TEST ME', artist: 'CHANMINA', anime: 'Oshi no Ko', type: 'OP', youtubeVideoId: 'pinned' };
    let ytSearches = 0;
    const context = { gameState: { currentSong: song, youtubeUnavailableUntil: Date.now() + 60000 },
        audioSourcePref: 'itunes-youtube', resolvedAudioCache: new Map(), fetchAudioInFlight: new Map(),
        getAllSongs: () => [song], SEASONAL_POOLS: {}, sourceFailurePenalty: () => 0,
        searchQuizItunesCandidates: async () => [{ source: 'itunes', url: 'correct', title: song.title, artist: song.artist }],
        searchQuizYouTubeCandidates: async () => { ytSearches++; return []; },
        rankAudioCandidates: (_song, values) => values.map(value => ({ ...value, score: 100 })), trackKey: () => 'song',
        settleWithin: promise => promise, GATHER_HARD: 8000, GATHER_GRACE: 700, STRONG_SCORE: 90,
        performance, Promise, Set, Object, Date, setTimeout, clearTimeout };
    vm.createContext(context);
    vm.runInContext(app.slice(app.indexOf('function audioResultKey('), app.indexOf('function getGuessValue(')), context);
    context.searchQuizItunesCandidates = async () => [{ source: 'itunes', url: 'correct', title: song.title, artist: song.artist }];
    context.resolvedAudioCache.set(context.audioResultKey(song.title, song.artist, song.anime, song.type),
        { source: 'youtube', url: 'yt:cached', resolvedAt: Date.now() });
    const result = await context.fetchAudio(song.title, song.artist, song.anime, song.type);
    assert.equal(result.source, 'itunes');
    assert.equal(ytSearches, 0);
    const backup = await context.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), song.type,
        'itunes-youtube', { yt: new Set(), bili: new Set() }, null, song,
        [{ source: 'youtube', videoId: 'backup', title: song.title, artist: song.artist }]);
    assert.equal(backup.source, 'itunes');
    assert.equal(ytSearches, 0);
});

test('failed initialization destroys its iframe and can retry using the already loaded SDK', async () => {
    const instances = [];
    const timers = [];
    let destroyed = 0;
    let scripts = 0;
    const host = { innerHTML: '' };
    const context = { gameState: {}, ytReady: false, ytPlayer: null, youtubeApiPromise: null,
        window: { location: { origin: 'http://127.0.0.1:8080' } },
        document: { getElementById: () => host, createElement: () => ({ remove() {} }), head: { appendChild() { scripts++; } } },
        YT: { Player: class { constructor(_id, options) { this.options = options; instances.push(this); } destroy() { destroyed++; } } },
        setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {}, console: { error() {} },
        applyPlayerVolume() {}, onYtStateChange() {}, onYtError() {}, onYtAutoplayBlocked() {} };
    vm.createContext(context);
    vm.runInContext(app.slice(app.indexOf('function ensureYouTubeAPI()'), app.indexOf('function onYtError(')), context);
    const first = context.ensureYouTubeAPI();
    timers[0]();
    await assert.rejects(first);
    assert.equal(destroyed, 1);
    assert.equal(context.ytPlayer, null);
    context.gameState.youtubeUnavailableUntil = 0; // Explicit retry by the user.
    const retry = context.ensureYouTubeAPI();
    assert.equal(instances.length, 2);
    instances[0].options.events.onReady({ target: instances[0] });
    assert.equal(context.ytReady, false);
    instances[1].options.events.onReady({ target: instances[1] });
    assert.strictEqual(await retry, instances[1]);
    assert.equal(scripts, 0);
    assert.equal(instances[1].options.playerVars.origin, 'http://127.0.0.1:8080');
    assert.equal(typeof instances[1].options.events.onAutoplayBlocked, 'function');
});

test('a native play permission error waits for a click rather than excluding iTunes', async () => {
    let recovered = 0;
    let state;
    const element = { classList: { add() {}, remove() {} }, innerHTML: '', style: { display: 'none' } };
    const context = { playLock: false, gameState: { isPlaying: false }, quizYT: { active: false },
        audioContext: null, audio: { play: () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) },
        $: () => element, recoverQuestionAudio() { recovered++; }, setQuizMediaState(value) { state = value; }, setTimeout, clearTimeout };
    vm.createContext(context);
    vm.runInContext(app.slice(app.indexOf('function togglePlay()'), app.indexOf('function stopQuizYT()')), context);
    context.togglePlay();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(recovered, 0);
    assert.equal(state, 'awaiting-play');
});

test('a silent YouTube preview timeout recovers instead of claiming that the audio is ready', async () => {
    let timeout;
    let recovered = 0;
    const context = { gameState: {}, libraryPreviewSession: { isCurrent: () => true }, libraryPreviewState: '',
        libraryPreviewResult: null, libraryPreviewSource: '', libraryPreviewUrl: '', libraryPreviewVideo: '', libraryPreviewTimer: null,
        ensureYouTubeAPI: async () => {}, ytPlayer: { loadVideoById() {} }, updateLibraryPreviewUI() {},
        recoverLibraryPreviewAudio() { recovered++; }, setTimeout: callback => { timeout = callback; return 1; }, clearTimeout() {} };
    vm.createContext(context);
    vm.runInContext(app.slice(app.indexOf('async function prepareLibraryPreviewAudio('), app.indexOf('async function recoverLibraryPreviewAudio(')), context);
    await context.prepareLibraryPreviewAudio({ source: 'youtube', ytVideoId: 'test', url: 'yt:test' }, 1);
    timeout();
    assert.equal(recovered, 1);
    assert.notEqual(context.libraryPreviewState, 'ready');
    assert.ok(context.gameState.youtubeUnavailableUntil > Date.now());
});

test('a search started before the player failed cannot return a late YouTube candidate', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const song = { title: 'song', artist: 'artist', anime: 'anime', type: 'OP' };
    const context = { gameState: { currentSong: song }, getAllSongs: () => [song], audioSourcePref: 'itunes-youtube',
        searchQuizItunesCandidates: async () => [], searchQuizYouTubeCandidates: () => pending,
        rankAudioCandidates: (_song, values) => values.map(value => ({ ...value, score: 100 })), sourceFailurePenalty: () => 0,
        settleWithin: promise => promise, GATHER_HARD: 8000, GATHER_GRACE: 700, STRONG_SCORE: 90,
        performance, Promise, Set, Object, Date, setTimeout, clearTimeout };
    vm.createContext(context);
    vm.runInContext(app.slice(app.indexOf('async function fetchAudioInner('), app.indexOf('function getGuessValue(')), context);
    const result = context.fetchAudioInner(song.title, song.artist, song.anime, 'key');
    context.gameState.youtubeUnavailableUntil = Date.now() + 60000;
    release([{ source: 'youtube', title: 'song', artist: 'artist', videoId: 'late' }]);
    assert.equal(await result, null);
});
