import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { selectSeasonSongs } from '../scripts/fetch-season.mjs';
import { filterWatchedSongs } from '../library-tools.mjs';
import { buildQuarterCatalog } from '../library-navigation.mjs';
import { challengeTrackKey, uniqueChallengePool } from '../audio-selection.mjs';
import { ANIME_PREMIERE_YEARS, ANIME_QUESTION_CONTEXT } from '../anime-question-context.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const poolSource = fs.readFileSync(path.join(root, 'seasonal-pools.js'), 'utf8');
const pools = JSON.parse(poolSource.match(/export const SEASONAL_POOLS = (\{[\s\S]*\});/)[1]);
const coverSource = fs.readFileSync(path.join(root, 'seasonal-covers.js'), 'utf8');
const covers = JSON.parse(coverSource.match(/export const SEASONAL_COVERS = (\{[\s\S]*\});/)[1]);

test('removed classics are absent while Bleach and published PK indices remain intact', async () => {
  const source = fs.readFileSync(path.join(root, 'songs.js'), 'utf8');
  const { SONGS, PK_SONGS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const removed = new Set(['银河铁道999', '机动战士高达', '机动战士Z高达', '魔神英雄传', '樱桃小丸子', '灌篮高手']);
  assert.ok([...SONGS, ...Object.values(pools).flat()].every(song => !removed.has(song.animeCN || song.anime)));
  assert.deepEqual(SONGS.filter(song => song.anime === '死神').map(song => song.title), ['Rolling star', 'Life is Like a Boat']);
  assert.deepEqual(PK_SONGS.filter(Boolean), SONGS);
  assert.deepEqual(PK_SONGS.flatMap((song, i) => song ? [] : [i]), [1, 2, 3, 4, 12, 13, 190, 191, 244]);
  for (const [index, title] of [[5, 'Makafushigi Adventure!'], [14, 'Zankoku na Tenshi no Thesis'], [192, 'Hohoemi no Bakudan'], [245, 'Resuscitated Hope']]) {
    assert.equal(PK_SONGS[index].title, title);
  }
});

test('every published seasonal anime has a cached HTTPS cover', () => {
  const ids = new Set(Object.values(pools).flat().map(song => song.anilistId));
  for (const id of ids) assert.match(covers[id] || '', /^https:\/\//);
  assert.equal(Object.keys(covers).length, ids.size);
});

test('historical and recent quarters contain verified themes without a fixed track count', () => {
  for (let year = 2020; year <= 2026; year++) {
    for (const month of ['01', '04', '07', '10']) assert.ok(pools[`${year}-${month}`]?.length);
  }
  for (const key of Object.keys(pools)) {
    const songs = pools[key];
    assert.ok(songs.length > 0);
    const ids = new Set(songs.map(song => song.anilistId));
    assert.ok(ids.size > 0);
    assert.ok(songs.every(song => ['OP', 'ED'].includes(song.type) && song.artist && song.animethemesUrl));
    assert.equal(new Set(songs.map(song => `${song.anilistId}|${song.type}|${song.title}|${song.artist}`)).size, songs.length);
  }
});

test('pre-2020 expansion reaches annual targets with exact work and theme references', async () => {
  const { SONGS } = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(root, 'songs.js')).toString('base64')}`);
  const catalog = buildQuarterCatalog(SONGS, pools);
  const songsForYear = year => uniqueChallengePool(Object.entries(catalog)
    .filter(([key]) => Number(key.slice(0, 4)) === year).flatMap(([, songs]) => songs));
  for (let year = 2011; year <= 2019; year++) {
    assert.ok(songsForYear(year).length >= 55, `${year} has too few songs`);
    assert.ok(songsForYear(year).length <= 80, `${year} exceeds the reviewed annual range`);
  }
  const early = uniqueChallengePool(Object.entries(catalog).filter(([key]) => Number(key.slice(0, 4)) <= 2010).flatMap(([, songs]) => songs));
  assert.ok(early.length >= 100 && early.length <= 120);
  for (const [season, songs] of Object.entries(pools).filter(([key]) => Number(key.slice(0, 4)) < 2020)) {
    for (const song of songs) {
      assert.equal(song.season, season);
      assert.ok(song.bangumiId > 0 && song.anilistId > 0 && song.themeId > 0);
      assert.match(song.animethemesUrl, /^https:\/\/animethemes\.moe\/anime\/[\w-]+$/);
    }
  }
});

test('previously published seasonal tracks keep their original identities and order', () => {
  for (const key of ['2026-01', '2026-04', '2026-07', '2026-10']) {
    const candidate = JSON.parse(fs.readFileSync(path.join(root, 'candidates', `${key}-expansion.json`), 'utf8'));
    assert.equal(candidate.complete, true);
    const rankedSongs = candidate.selected.flatMap(anime => anime.songs);
    assert.ok(rankedSongs.length <= pools[key].length);
    for (const [index, song] of pools[key].slice(0, rankedSongs.length).entries()) {
      assert.deepEqual(
        [song.anilistId, song.title, song.type],
        [rankedSongs[index].anilistId, rankedSongs[index].title, rankedSongs[index].type]
      );
    }
  }
});

test('discovery matches by AniList ID and keeps known themes inside the ranked cutoff', () => {
  const media = (id, name) => ({ id, title: { romaji: name }, season: 'SPRING', seasonYear: 2026, popularity: 100 - id });
  const theme = (id, name, types) => ({
    name, slug: name, resources: [{ site: 'AniList', external_id: id }],
    animethemes: types.map(type => ({ type, slug: type + '1', song: { title: name + ' ' + type, artists: [{ name: 'Singer' }] } }))
  });
  const result = selectSeasonSongs(
    [media(1, 'different title'), media(2, 'missing ED'), media(3, 'third anime')],
    [theme(1, 'matched by ID', ['OP', 'ED']), theme(2, 'incomplete', ['OP']), theme(3, 'third anime', ['OP', 'ED'])],
    2
  );
  assert.equal(result.complete, true);
  assert.deepEqual(result.selected.map(x => x.anilistId), [1, 2]);
  assert.deepEqual(result.skipped.map(x => x.anilistId), []);
  assert.equal(result.songs.length, 3);
  assert.equal(selectSeasonSongs([media(2, 'no metadata')], [], 1).complete, false);
});

test('single-player filters include old, seasonal and custom pools without changing PK source', () => {
  const start = app.indexOf('function getAllSongs() {');
  const end = app.indexOf('// Anti-repeat question selection', start);
  const snippets = app.slice(start, end);
  const legacy = { title: 'old', anime: 'old anime', type: 'OP' };
  const seasonal = { title: 'new', anime: 'new anime', type: 'ED', season: '2026-07' };
  const custom = { title: 'custom', anime: 'custom anime', type: 'OP' };
  const context = {
    SONGS: [legacy], builtinSongs: [legacy, seasonal], QUARTER_CATALOG: { '2026-07': [seasonal] },
    getCustomSongs: () => [custom], filterWatchedSongs, getWatchedAnimeKeys: () => [],
    filterState: { types: new Set(), source: null, watchedOnly: false }
  };
  vm.createContext(context);
  vm.runInContext(snippets, context);
  const titles = () => Array.from(context.getFilteredSongs(), song => song.title);
  assert.deepEqual(titles(), ['old', 'new', 'custom']);
  for (const [source, expected] of [
    ['builtin', ['old', 'new']], ['legacy', ['old']], ['custom', ['custom']], ['season:2026-07', ['new']]
  ]) {
    context.filterState.source = source;
    assert.deepEqual(titles(), expected);
  }
  context.filterState.types = new Set(['OP']);
  assert.deepEqual(titles(), []);
  assert.match(app, /buildPlaylist\(SONGS, 10\)\.map\(s => PK_SONGS\.indexOf\(s\)\)/);
  assert.match(app, /d\.questions\.map\(i => Number\.isInteger\(i\) \? PK_SONGS\[i\] : null\)/);
});

test('seasonal wrong answers come from the active question pool', () => {
  const start = app.indexOf('function buildWrongOptions(song, guessType) {');
  const end = app.indexOf('function renderOptions(song) {', start);
  const context = {
    SONGS: [{ anime: 'legacy', title: 'old', artist: 'old' }], ANIME_QUESTION_CONTEXT: {},
    gameState: { mode: 'single', activePool: [
      { anime: 'A', title: 'a', artist: 'a' }, { anime: 'B', title: 'b', artist: 'b' },
      { anime: 'C', title: 'c', artist: 'c' }, { anime: 'D', title: 'd', artist: 'd' }
    ] },
    shuffle: x => x,
    animeLabel: song => song.animeCN || song.anime
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  assert.deepEqual(Array.from(context.buildWrongOptions(context.gameState.activePool[0], 'anime')), ['B', 'C', 'D']);
});

test('anime options prefer the same quarter, then closer genres inside the current pool', () => {
  const start = app.indexOf('function buildWrongOptions(song, guessType) {');
  const end = app.indexOf('function renderOptions(song) {', start);
  const question = { anime: 'Question', season: '2026-07' };
  const other = ['Unrelated', 'Similar', 'Same quarter', 'Closest', 'Same quarter', 'Question'].map(anime => ({ anime }));
  const context = {
    SONGS: [], gameState: { mode: 'single', activePool: [question, ...other] },
    shuffle: choices => choices, animeLabel: song => song.anime,
    ANIME_QUESTION_CONTEXT: {
      Question: ['2026-07', 'Drama', 'School'],
      'Same quarter': ['2026-07', 'Action'],
      Similar: ['2026-01', 'School', 'Comedy'],
      Closest: ['2025-10', 'Drama', 'School'],
    }
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  assert.deepEqual(Array.from(context.buildWrongOptions(question, 'anime')), ['Same quarter', 'Closest', 'Similar']);
});

test('a 30-question game draws distinct songs from the larger selected season', () => {
  const start = app.indexOf('function buildPlaylist(pool, n) {');
  const end = app.indexOf('// Fetch Bangumi index', start);
  const context = { loadRecentGames: () => [], shuffle: songs => songs, uniqueChallengePool, challengeTrackKey };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  for (const key of ['2026-04', '2026-07']) {
    const chosen = Array.from(context.buildPlaylist(pools[key], 30));
    assert.equal(chosen.length, 30);
    assert.equal(new Set(chosen.map(s => `${s.title}|${s.anime}`)).size, 30);
    assert.ok(chosen.every(song => song.season === key));
  }
});

test('starting a round avoids the last playable song even when drawing the entire pool', () => {
  const start = app.indexOf('function buildPlaylist(pool, n) {');
  const end = app.indexOf('// Fetch Bangumi index', start);
  const first = { title: 'First', anime: '日本語', animeCN: 'Anime' };
  const second = { title: 'Second', anime: 'Anime' };
  const context = { loadRecentGames: () => [[challengeTrackKey({ title: 'First', anime: 'Anime' })]],
    uniqueChallengePool, shuffle: songs => songs, challengeTrackKey };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  assert.deepEqual(Array.from(context.buildPlaylist([first, second], 2)), [second, first]);
  assert.deepEqual(Array.from(context.buildPlaylist([first], 1)), [first]);
});

test('drawing from another pool does not discard recent song history or mark unheard picks', () => {
  const start = app.indexOf('function buildPlaylist(pool, n) {');
  const end = app.indexOf('// Fetch Bangumi index', start);
  const song = { title: 'Same', anime: 'Japanese', animeCN: 'Anime' };
  const other = { title: 'New', anime: 'Other' };
  let history = [['Same|Japanese', 'Another|Old']];
  const gameState = { recentQuestions: [], currentSong: other };
  const context = { loadRecentGames: () => history.slice(), saveRecentGames: value => { history = Array.from(value); },
    uniqueChallengePool, shuffle: songs => songs, challengeTrackKey, gameState };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  assert.deepEqual(Array.from(context.buildPlaylist([song, other], 1)), [other]);
  assert.deepEqual(history, [['Same|Japanese', 'Another|Old']]);
  context.recordPresentedQuestion();
  context.recordPresentedQuestion();
  gameState.currentSong = song;
  context.recordPresentedQuestion();
  assert.deepEqual(history, [['Same|Japanese', 'Another|Old'], [other, song].map(challengeTrackKey)]);
});

test('anime hints reveal the artist and premiere year without exposing the song name', () => {
  const start = app.indexOf('const HINT_LABELS =');
  const end = app.indexOf('function markAnswerOption(', start);
  const unknown = { artist: 'Singer', title: 'Song', anime: 'Unknown' };
  const gameState = { currentSong: unknown, guessType: 'anime', hints: { h1: false, h2: false } };
  const context = { ANIME_QUESTION_CONTEXT, ANIME_PREMIERE_YEARS, animeLabel: s => s.animeCN || s.anime,
    gameState, $: () => ({}) };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  const song = { artist: 'Singer', title: 'Song', anime: '青之壬生浪 -芹泽暗杀篇-', season: '2026-01' };
  assert.equal(context.getHintContent(song, 'anime', 'h1'), '歌手：Singer');
  assert.equal(context.getHintContent(song, 'anime', 'h2'), '番剧年份：2025 年');
  assert.equal(context.getHintContent(song, 'song', 'h2'), '番剧：青之壬生浪 -芹泽暗杀篇-');
  assert.equal(context.getHintContent(unknown, 'anime', 'h2'), '');
  context.useHint('h2');
  assert.equal(gameState.hints.h2, false);
});

test('seasonal answer choices are distinct and stay within the selected season', () => {
  const start = app.indexOf('function buildWrongOptions(song, guessType) {');
  const end = app.indexOf('function renderOptions(song) {', start);
  for (const key of ['2026-04', '2026-07']) {
    const context = {
      SONGS: [], ANIME_QUESTION_CONTEXT: {}, gameState: { mode: 'single', activePool: pools[key] },
      shuffle: choices => choices, animeLabel: song => song.animeCN || song.anime
    };
    vm.createContext(context);
    vm.runInContext(app.slice(start, end), context);
    for (const song of pools[key]) for (const type of ['anime', 'song', 'artist']) {
      const answer = type === 'anime' ? song.animeCN : type === 'song' ? song.titleCN : song.artist;
      const choices = Array.from(context.buildWrongOptions(song, type));
      assert.equal(choices.length, 3, `${key} ${song.title} ${type}`);
      assert.equal(new Set([answer, ...choices]).size, 4, `${key} ${song.title} ${type}`);
    }
  }
});
