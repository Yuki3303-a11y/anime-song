import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { scoreAudioCandidate, audioSearchQueries, rankAudioCandidates } from '../audio-selection.mjs';
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const song = { title: 'GO GHOST', artist: 'King Gnu', anime: 'Koukaku Kidoutai: THE GHOST IN THE SHELL', animeCN: '攻壳机动队 THE GHOST IN THE SHELL', type: 'OP' };

test('rejects vocal-less versions and unrelated same-title videos', () => {
    for (const version of ['纯音乐', '无人声', '人声消除', 'off vocal', 'backing track', 'Inst.']) {
        assert.equal(scoreAudioCandidate(song, { source: 'bilibili', title: `${song.animeCN} OP GO GHOST ${version}` }), -1, version);
    }
    assert.equal(scoreAudioCandidate(song, { source: 'youtube', title: 'GO GHOST unrelated musician' }), -1);
    assert.ok(scoreAudioCandidate(song, { source: 'bilibili', title: '【中日字幕/King Gnu/OP】攻壳机动队 THE GHOST IN THE SHELL「去吧 灵魂／GO GHOST」【科学猴制作】' }) > 0);
    assert.ok(audioSearchQueries(song).bilibili.includes(`${song.animeCN} OP`));
    assert.equal(scoreAudioCandidate({ title: 'Blue', artist: 'Eve', type: 'ED' },
        { source: 'youtube', title: 'Blueberry never again' }), -1);
});

test('official matching iTunes preview outranks an equally identified YouTube upload', () => {
    assert.equal(rankAudioCandidates(song, [
        { source: 'youtube', title: `${song.animeCN} OP GO GHOST King Gnu` },
        { source: 'itunes', title: song.title, artist: song.artist }
    ])[0].source, 'itunes');
});

test('a pinned YouTube video does not bypass a valid iTunes preview', async () => {
    const pinned = { ...song, youtubeVideoId: 'pinned' };
    const ctx = { gameState: {}, getAllSongs: () => [pinned], audioSourcePref: 'itunes-youtube',
        searchQuizItunesCandidates: async () => [{ source: 'itunes', title: song.title, artist: song.artist, url: 'preview' }],
        searchQuizYouTubeCandidates: async () => [], rankAudioCandidates, sourceFailurePenalty: () => 0,
        settleWithin: p => p, GATHER_HARD: 8000, GATHER_GRACE: 700, STRONG_SCORE: 90,
        performance, setTimeout, clearTimeout };
    vm.createContext(ctx);
    vm.runInContext(app.slice(app.indexOf('async function fetchAudioInner('), app.indexOf('function getGuessValue(')), ctx);
    const result = await ctx.fetchAudioInner(song.title, song.artist, song.anime, 'key', new Set(), 'OP', 'itunes-youtube', {}, null, pinned);
    assert.equal(result.source, 'itunes');
});

test('YouTube resume preserves position without stopping or reloading the shared player', () => {
    let played = 0, stopped = 0, loaded = 0;
    const ctx = { playLock: false, gameState: { isPlaying: false }, quizYT: { active: true, videoId: 'same' }, ytReady: true,
        ytPlayer: { playVideo() { played++; }, loadVideoById() { loaded++; }, getCurrentTime: () => 12, getVideoData: () => ({ video_id: 'same' }) },
        stopFullPlayer() { stopped++; }, stopMusicPlayer() {}, setQuizMediaState() {}, armQuizMediaTimeout() {}, clearTimeout() {} };
    vm.createContext(ctx);
    vm.runInContext(app.slice(app.indexOf('function togglePlay()'), app.indexOf('function stopQuizYT()')), ctx);
    ctx.togglePlay();
    assert.equal(played, 1);
    assert.equal(stopped, 0);
    assert.equal(loaded, 0);
});

test('iTunes returns its first verified recording without waiting for a hung spelling query', async () => {
    const ctx = { ITUNES_TIMEOUT: 5000, audioSearchQueries: () => ({ itunes: ['hung', 'valid'] }), rankAudioCandidates,
        fetch: async url => url.includes('term=hung') ? new Promise(() => {}) : ({ ok: true,
            json: async () => ({ results: [{ trackName: song.title, artistName: song.artist, previewUrl: 'official' }] }) }),
        AbortController, setTimeout: () => 1, clearTimeout() {} };
    vm.createContext(ctx);
    vm.runInContext(app.slice(app.indexOf('async function searchQuizItunesCandidates('), app.indexOf('function settleWithin(')), ctx);
    let timer;
    const result = await Promise.race([ctx.searchQuizItunesCandidates(song), new Promise(resolve => { timer = setTimeout(() => resolve([]), 100); })]);
    clearTimeout(timer);
    assert.equal(result[0]?.url, 'official');
});

test('YouTube buffering leaves pause available and PAUSED synchronizes playback state', () => {
    const element = { innerHTML: '', classList: { add() {}, remove() {} } };
    const states = [];
    const ctx = { quizYT: { active: true }, gameState: { isPlaying: false },
        YT: { PlayerState: { PLAYING: 1, BUFFERING: 3, PAUSED: 2, CUED: 5, ENDED: 0 } },
        ytPlayer: { getCurrentTime: () => 12 }, $: () => element, clearTimeout() {}, stopQuizProgress() {},
        armQuizMediaTimeout() {}, setQuizMediaState: state => states.push(state) };
    vm.createContext(ctx);
    vm.runInContext(app.slice(app.indexOf('function onYtStateChange('), app.indexOf('    if (libraryPreviewSession.activeKey', app.indexOf('function onYtStateChange('))) + '}', ctx);
    ctx.onYtStateChange({ data: 3 });
    assert.equal(ctx.gameState.isPlaying, true);
    assert.equal(states.at(-1), 'buffering');
    ctx.onYtStateChange({ data: 2 });
    assert.equal(ctx.gameState.isPlaying, false);
    assert.equal(states.at(-1), 'ready');
});

test('YouTube preview duration follows media time, not a wall clock that expires while paused', () => {
    let deadlines = 0;
    const ctx = { quizYT: { active: false }, libraryPreviewSession: { activeKey: 'song' }, libraryPreviewResult: { source: 'youtube' },
        libraryPreviewSong: song, libraryPreviewTimer: null, libraryPreviewState: 'loading',
        YT: { PlayerState: { PLAYING: 1 } }, clearTimeout() {}, setTimeout() { deadlines++; },
        recordLocalAudioCheck() {}, noteSourceSuccess() {}, updateLibraryTrackStatus() {}, updateLibraryPreviewUI() {} };
    vm.createContext(ctx);
    vm.runInContext(app.slice(app.indexOf('function onYtStateChange('), app.indexOf('    // Update detail modal player UI')) + '}', ctx);
    ctx.onYtStateChange({ data: 1 });
    assert.equal(deadlines, 0);
    assert.equal(ctx.libraryPreviewState, 'playing');
    assert.match(app.slice(app.indexOf('async function prepareLibraryPreviewAudio('), app.indexOf('async function recoverLibraryPreviewAudio(')), /endSeconds: 30/);
});
