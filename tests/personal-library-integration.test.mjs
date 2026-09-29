import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { animeKey, trackKey, filterWatchedSongs } from '../library-tools.mjs';
import { selectMixedSongs } from '../library-navigation.mjs';

const app = fs.readFileSync(fileURLToPath(new URL('../app.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

test('watched-only selection composes with quarter and type filters', () => {
  const start = app.indexOf('function getFilteredSongs() {');
  const end = app.indexOf('// Anti-repeat question selection', start);
  const old = { title: 'Old', anime: 'Old Anime', type: 'OP' };
  const watched = { title: 'New OP', anime: 'New Anime', type: 'OP', season: '2026-07', anilistId: 1 };
  const unwatched = { title: 'New ED', anime: 'Other Anime', type: 'ED', season: '2026-07', anilistId: 2 };
  const otherOp = { title: 'Other OP', anime: 'Other Anime', type: 'OP', season: '2026-07', anilistId: 2 };
  const context = {
    SONGS: [old], SEASONAL_POOLS: { '2026-07': [watched, unwatched, otherOp] },
    getCustomSongs: () => [], filterWatchedSongs,
    getWatchedAnimeKeys: () => [animeKey(watched)],
    filterState: { types: new Set(['OP']), source: 'season:2026-07', watchedOnly: true },
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  assert.deepEqual(Array.from(context.getFilteredSongs()), [watched]);
});

test('current challenge pool combines imported songs, one quarter and followed anime', () => {
  const old = { title: 'Followed OP', anime: 'Old Anime', type: 'OP' };
  const spring = { title: 'Spring OP', anime: 'Spring', type: 'OP', season: '2026-04' };
  const summer = { title: 'Summer OP', anime: 'Summer', type: 'OP', season: '2026-07' };
  const imported = { title: 'Imported OP', anime: 'Imported', type: 'OP' };
  const context = {
    SONGS: [old], SEASONAL_POOLS: { '2026-04': [spring], '2026-07': [summer] },
    getCustomSongs: () => [imported], getWatchedAnimeKeys: () => [animeKey(old)],
    filterWatchedSongs, selectMixedSongs, animeKey, trackKey, selectedSongKeys: [],
    filterState: { types: new Set(['OP']), source: 'mix', watchedOnly: false,
      mix: { legacy: false, seasons: ['2026-07'], imported: true, watched: true } },
  };
  const start = app.indexOf('function getFilteredSongs() {');
  const end = app.indexOf('// Anti-repeat question selection', start);
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  assert.deepEqual(Array.from(context.getFilteredSongs()), [old, summer, imported]);
});

test('one-song mistake practice can still offer three other anime answers', () => {
  const start = app.indexOf('function buildWrongOptions(song, guessType) {');
  const end = app.indexOf('function renderOptions(song) {', start);
  const question = { title: 'Q', anime: 'Question' };
  const others = ['A', 'B', 'C'].map(anime => ({ title: anime, anime }));
  const context = {
    SONGS: [], gameState: { mode: 'single', activePool: [question], optionPool: [question, ...others] },
    shuffle: values => values, animeLabel: song => song.anime,
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  assert.deepEqual(Array.from(context.buildWrongOptions(question, 'anime')), ['A', 'B', 'C']);
});

test('watched-only season questions keep answer choices in that season', () => {
  const start = app.indexOf("function startMode(mode, practiceSongs = null, poolName = '') {"), end = app.indexOf('function startSingle()', start);
  const season = ['A', 'B', 'C', 'D'].map((anime, i) => ({ title: `Song ${i}`, anime, artist: `Artist ${i}` }));
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} } });
    return elements.get(id);
  };
  const context = {
    gameState: { questionCount: 10 }, filterState: { source: 'season:2026-07', types: new Set(), watchedOnly: true },
    SEASONAL_POOLS: { '2026-07': season }, $: element,
    getFilteredSongs: () => [season[0]], getAllSongs: () => [...season, { title: 'Outside', anime: 'Other', artist: 'Other' }],
    animeLabel: s => s.anime, buildPlaylist: songs => songs, showView() {}, loadQuestion() {},
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  context.startMode('anime');
  assert.deepEqual(Array.from(context.gameState.optionPool), season);
  assert.equal(element('totalQ').textContent, 1);
});

test('wrong single-player answers enter the mistake book but PK answers do not', () => {
  const start = app.indexOf('function handleAnswer(btn, selected) {');
  const end = app.indexOf('function showSongInfo(', start);
  let recorded = 0;
  const song = { title: 'Q', anime: 'Correct', artist: 'Singer' };
  const makeContext = mode => {
    const state = {
      mode, isLocked: false, hints: { h1: false, h2: false }, currentSong: song,
      guessType: 'anime', answerHistory: [], score: 0, combo: 0, correctCount: 0,
      questionIndex: 0, fetchGeneration: 1,
    };
    const element = { classList: { add() {}, remove() {} }, innerHTML: '', style: {} };
    const context = {
      gameState: state, $: () => element, audio: { pause() {} }, stopQuizYT() {},
      beep() {}, flashScreen() {}, showSongInfo() {}, animateScore() {},
      updateNavButtons() {}, getGuessValue: s => s.anime,
      document: { querySelectorAll: selector => selector === '.opt-btn' ? [{ textContent: 'Correct', classList: { add() {} } }] : [] },
      setTimeout() {}, recordMistake() { recorded++; },
    };
    vm.createContext(context);
    vm.runInContext(app.slice(start, end), context);
    context.handleAnswer({ classList: { add() {} } }, 'Wrong');
  };
  makeContext('single');
  makeContext('pk');
  assert.equal(recorded, 1);
});
