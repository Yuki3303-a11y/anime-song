import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { selectSeasonSongs } from '../scripts/fetch-season.mjs';
import { filterWatchedSongs } from '../library-tools.mjs';
import { uniqueChallengePool } from '../audio-selection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const poolSource = fs.readFileSync(path.join(root, 'seasonal-pools.js'), 'utf8');
const pools = JSON.parse(poolSource.match(/export const SEASONAL_POOLS = (\{[\s\S]*\});/)[1]);
const coverSource = fs.readFileSync(path.join(root, 'seasonal-covers.js'), 'utf8');
const covers = JSON.parse(coverSource.match(/export const SEASONAL_COVERS = (\{[\s\S]*\});/)[1]);

test('every published seasonal anime has a cached HTTPS cover', () => {
  const ids = new Set(Object.values(pools).flat().map(song => song.anilistId));
  for (const id of ids) assert.match(covers[id] || '', /^https:\/\//);
  assert.equal(Object.keys(covers).length, ids.size);
});

test('2026 spring and summer pools contain 15 unique OP/ED pairs each', () => {
  for (const key of ['2026-04', '2026-07']) {
    const songs = pools[key];
    assert.equal(songs.length, 30);
    const ids = new Set(songs.map(song => song.anilistId));
    assert.equal(ids.size, 15);
    for (const id of ids) assert.deepEqual(songs.filter(song => song.anilistId === id).map(song => song.type), ['OP', 'ED']);
  }
});

test('published season entries match the reviewed popularity candidates', () => {
  for (const key of ['2026-04', '2026-07']) {
    const candidate = JSON.parse(fs.readFileSync(path.join(root, 'candidates', `${key}.json`), 'utf8'));
    assert.equal(candidate.complete, true);
    const rankedSongs = candidate.selected.flatMap(anime => anime.songs);
    assert.equal(rankedSongs.length, pools[key].length);
    for (const [index, song] of pools[key].entries()) {
      assert.deepEqual(
        [song.anilistId, song.title, song.artist, song.type],
        [rankedSongs[index].anilistId, rankedSongs[index].title, rankedSongs[index].artist, rankedSongs[index].type]
      );
    }
  }
});

test('discovery matches by AniList ID and skips incomplete higher ranked anime', () => {
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
  assert.deepEqual(result.selected.map(x => x.anilistId), [1, 3]);
  assert.deepEqual(result.skipped.map(x => x.anilistId), [2]);
  assert.equal(result.songs.length, 4);
  assert.equal(selectSeasonSongs([media(2, 'missing ED')], [theme(2, 'incomplete', ['OP'])], 1).complete, false);
});

test('single-player filters include old, seasonal and custom pools without changing PK source', () => {
  const start = app.indexOf('function getAllSongs() {');
  const end = app.indexOf('// Anti-repeat question selection', start);
  const snippets = app.slice(start, end);
  const legacy = { title: 'old', anime: 'old anime', type: 'OP' };
  const seasonal = { title: 'new', anime: 'new anime', type: 'ED', season: '2026-07' };
  const custom = { title: 'custom', anime: 'custom anime', type: 'OP' };
  const context = {
    SONGS: [legacy], SEASONAL_POOLS: { '2026-07': [seasonal] },
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
  assert.match(app, /buildPlaylist\(SONGS, 10\)\.map\(s => SONGS\.indexOf\(s\)\)/);
  assert.match(app, /d\.questions\.map\(i => SONGS\[i\]\)/);
});

test('seasonal wrong answers come from the active question pool', () => {
  const start = app.indexOf('function buildWrongOptions(song, guessType) {');
  const end = app.indexOf('function renderOptions(song) {', start);
  const context = {
    SONGS: [{ anime: 'legacy', title: 'old', artist: 'old' }],
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

test('a 30-question game uses every song in the selected season', () => {
  const start = app.indexOf('function buildPlaylist(pool, n) {');
  const end = app.indexOf('// Fetch Bangumi index', start);
  const context = { loadPlayedHistory: () => [], savePlayedHistory: () => {}, shuffle: songs => songs, uniqueChallengePool };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  for (const key of ['2026-04', '2026-07']) {
    const chosen = Array.from(context.buildPlaylist(pools[key], 30));
    assert.equal(chosen.length, 30);
    assert.equal(new Set(chosen.map(s => `${s.title}|${s.anime}`)).size, 30);
    assert.ok(chosen.every(song => song.season === key));
  }
});

test('seasonal answer choices are distinct and stay within the selected season', () => {
  const start = app.indexOf('function buildWrongOptions(song, guessType) {');
  const end = app.indexOf('function renderOptions(song) {', start);
  for (const key of ['2026-04', '2026-07']) {
    const context = {
      SONGS: [], gameState: { mode: 'single', activePool: pools[key] },
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
