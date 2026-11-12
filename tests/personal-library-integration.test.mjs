import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { animeKey, trackKey, filterWatchedSongs } from '../library-tools.mjs';
import { buildQuarterCatalog, groupLibrarySongs, searchLibraryTracks, selectMixedSongs, sortAnimeByHeat } from '../library-navigation.mjs';
import { uniqueChallengePool } from '../audio-selection.mjs';

const app = fs.readFileSync(fileURLToPath(new URL('../app.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

test('historical quarter browser shows years, all four months and every theme', () => {
  const old = { title: 'Old OP', anime: 'Old show', type: 'OP', season: '1995-10' };
  const tracks = [old, { ...old, title: 'Second OP' }, { ...old, title: 'Insert', type: 'IN' }];
  const recent = { title: 'Recent ED', anime: 'Recent show', type: 'ED', season: '2026-07' };
  const catalog = buildQuarterCatalog(tracks, { '2026-07': [recent] });
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', value: '' });
    return elements.get(id);
  };
  const startButton = {};
  let groups;
  const context = {
    QUARTER_CATALOG: catalog, publishedSeasons: Object.keys(catalog).sort().reverse(), selectedLibrarySeason: '1995-10', selectedLibraryYear: '1995',
    HISTORICAL_ANIME_RANKS: {}, sortAnimeByHeat,
    $: element, document: { querySelector: () => startButton }, groupLibrarySongs, searchLibraryTracks, animeKey, trackKey,
    filterWatchedSongs, uniqueChallengePool, filterState: { types: new Set(), watchedOnly: false }, watchedAnimeKeys: [], audioChecks: [],
    seasonLabel: key => key, renderLibraryCoverGrid: (_id, values) => { groups = values; },
  };
  const start = app.indexOf('function renderSeasonLibrary() {');
  const end = app.indexOf('function getBangumiSongs()', start);
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  context.renderSeasonLibrary();
  assert.deepEqual(groups.flatMap(group => group.tracks), tracks);
  assert.match(element('librarySeasonTabs').innerHTML, /2010 年及以前/);
  assert.doesNotMatch(element('librarySeasonTabs').innerHTML, /1995 年|<select/);
  assert.match(element('librarySeasonSummary').textContent, /1 首 IN/);
  assert.equal(startButton.disabled, false);
  context.selectedLibrarySeason = null;
  context.selectedLibraryYear = 'early';
  context.renderSeasonLibrary();
  assert.deepEqual(groups.flatMap(group => group.tracks), tracks);
  assert.equal(startButton.disabled, false);
  assert.match(element('librarySeasonSummary').textContent, /^2010 年及以前/);
  context.selectedLibraryYear = '2026';
  context.renderSeasonLibrary();
  assert.deepEqual(groups.flatMap(group => group.tracks), [recent]);
  for (const month of ['01', '04', '07', '10']) assert.ok(element('librarySeasonTabs').innerHTML.includes(`${month} 月`));
  assert.match(element('librarySeasonTabs').innerHTML, /data-value="2026-01" disabled/);
  assert.equal(startButton.disabled, true);
});

test('early anime can start a challenge using the grouped range and current type filter', () => {
  const old = { title: 'Old', anime: 'Classic', type: 'OP', season: '1995-10' };
  const insert = { ...old, title: 'Insert', type: 'IN' };
  let started;
  const context = { selectedLibrarySeason: null, selectedLibraryYear: 'early',
    publishedSeasons: ['2026-07', '1995-10'], QUARTER_CATALOG: { '2026-07': [{ ...old, season: '2026-07', title: 'Recent' }], '1995-10': [old, insert] },
    filterState: { types: new Set(['OP']), watchedOnly: false }, watchedAnimeKeys: [], filterWatchedSongs,
    startMode: (...args) => { started = args; } };
  vm.createContext(context);
  const start = app.indexOf('function startSelectedSeason() {');
  vm.runInContext(app.slice(start, app.indexOf('function startMistakePractice()', start)), context);
  context.startSelectedSeason();
  assert.equal(started[0], 'anime');
  assert.deepEqual(Array.from(started[1]), [old]);
  assert.equal(started[2], '2010 年及以前');
});

test('legacy-only saved settings migrate to an exact compatible mix', () => {
  const storage = new Map([['game_settings_v1', JSON.stringify({ questionCount: 20, types: ['IN'], source: 'legacy' })]]);
  const context = {
    gameState: {}, QUARTER_CATALOG: { '1995-10': [{}] }, publishedSeasons: ['1995-10'], parsePersonalBackup() {},
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  };
  const start = app.indexOf('const filterState =');
  const end = app.indexOf('function saveGameSettings()', start);
  vm.createContext(context);
  vm.runInContext(app.slice(start, end) + '\nglobalThis.loadedState = filterState;', context);
  assert.equal(context.loadedState.source, 'mix');
  assert.deepEqual(JSON.parse(JSON.stringify(context.loadedState.mix)), { legacy: true, seasons: [], imported: false, watched: false, selected: false });
  assert.equal(context.gameState.questionCount, 20);
  assert.deepEqual(Array.from(context.loadedState.types), ['IN']);
  assert.equal(JSON.parse(storage.get('song_source_mix_v1')).legacy, true);
});

test('watched-only selection composes with quarter and type filters', () => {
  const start = app.indexOf('function getFilteredSongs() {');
  const end = app.indexOf('// Anti-repeat question selection', start);
  const old = { title: 'Old', anime: 'Old Anime', type: 'OP' };
  const watched = { title: 'New OP', anime: 'New Anime', type: 'OP', season: '2026-07', anilistId: 1 };
  const unwatched = { title: 'New ED', anime: 'Other Anime', type: 'ED', season: '2026-07', anilistId: 2 };
  const otherOp = { title: 'Other OP', anime: 'Other Anime', type: 'OP', season: '2026-07', anilistId: 2 };
  const context = {
    SONGS: [old], QUARTER_CATALOG: { '2026-07': [watched, unwatched, otherOp] }, builtinSongs: [old, watched, unwatched, otherOp],
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
    SONGS: [old], QUARTER_CATALOG: { '2026-04': [spring], '2026-07': [summer] },
    builtinSongs: [old, spring, summer],
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
    SONGS: [], ANIME_QUESTION_CONTEXT: {}, gameState: { mode: 'single', activePool: [question], optionPool: [question, ...others] },
    shuffle: values => values, animeLabel: song => song.anime,
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  assert.deepEqual(Array.from(context.buildWrongOptions(question, 'anime')), ['A', 'B', 'C']);
});

test('watched-only season questions keep answer choices in that season', () => {
  const start = app.indexOf("function startMode(mode, practiceSongs = null, poolName = '') {"), end = app.indexOf('let pkBusy = false;', start);
  const season = ['A', 'B', 'C', 'D'].map((anime, i) => ({ title: `Song ${i}`, anime, artist: `Artist ${i}` }));
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} } });
    return elements.get(id);
  };
  const context = {
    gameState: { questionCount: 10 }, filterState: { source: 'season:2026-07', types: new Set(), watchedOnly: true },
    QUARTER_CATALOG: { '2026-07': season }, $: element,
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
  const start = app.indexOf('function markAnswerOption(button, correctValue, selected) {');
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
      document: { querySelectorAll: selector => selector === '.opt-btn' ? [{ textContent: 'Correct', dataset: {}, classList: { add() {} }, setAttribute() {} }] : [] },
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
