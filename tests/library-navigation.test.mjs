import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildQuarterCatalog, sourceSelection, sourceFromSelection, createPreviewSession, searchLibraryTracks, selectMixedSongs, groupLibrarySongs, sortAnimeByHeat } from '../library-navigation.mjs';

test('historical browsing follows Bangumi heat while retaining unranked works', () => {
  const groups = [90, 3, 1, 91, 2].map(bangumiId => ({ song: { bangumiId } }));
  assert.deepEqual(sortAnimeByHeat(groups, [1, 2, 3]).map(group => group.song.bangumiId), [1, 2, 3, 90, 91]);
  assert.deepEqual(groups.map(group => group.song.bangumiId), [90, 3, 1, 91, 2]);
  assert.deepEqual(sortAnimeByHeat(groups), groups);
});

test('all six source meanings map to an intuitive group and back', () => {
  for (const source of [null, 'builtin', 'legacy', 'custom', 'season:2026-04', 'season:2026-07']) {
    const selection = sourceSelection(source);
    assert.equal(sourceFromSelection(selection), source);
  }
  assert.deepEqual(sourceSelection('season:2026-07'),
    { group: 'official', official: 'season', season: '2026-07' });
});

test('preview session invalidates older searches and stops one active song', () => {
  const session = createPreviewSession();
  const first = session.start('song-a');
  const second = session.start('song-b');
  assert.equal(session.isCurrent(first), false);
  assert.equal(session.isCurrent(second), true);
  assert.equal(session.activeKey, 'song-b');
  session.stop();
  assert.equal(session.isCurrent(second), false);
  assert.equal(session.activeKey, null);
});

test('track browser searches old and seasonal titles and deduplicates copies', () => {
  const old = { title: 'Blue Bird', anime: 'Naruto', animeCN: '火影忍者', artist: 'Ikimono Gakari', type: 'OP' };
  const summer = { title: 'Fiction', anime: 'Summer Anime', artist: 'imase', type: 'ED', season: '2026-07' };
  assert.deepEqual(searchLibraryTracks([old, summer, { ...old }], '火影'), [old]);
  assert.deepEqual(searchLibraryTracks([old, summer], 'imase'), [summer]);
  assert.deepEqual(searchLibraryTracks([old, summer], ''), [summer, old]);
});

test('all catalog sources share one query and can search across releases and imports', () => {
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="libraryCatalogSearch"/);
  assert.doesNotMatch(html, /id="library(?:Track|Season|Bangumi)Search"/);
  const legacy = { title: 'Moon', anime: 'Old', artist: 'Singer', type: 'OP' };
  const quarter = { title: 'Sky', anime: 'New', artist: 'Singer', type: 'ED', season: '2026-04' };
  const imported = { title: 'Star', anime: 'Imported', artist: 'Singer', type: 'ED' };
  const input = { value: 'Singer' };
  let groups;
  const context = {
    $: id => id === 'libraryCatalogSearch' ? input : {}, getAllSongs: () => [legacy, quarter, imported],
    SONGS: [legacy], searchLibraryTracks, groupLibrarySongs, animeKey: song => song.anime,
    renderLibraryCoverGrid: (_id, matches) => { groups = matches; },
  };
  const start = app.indexOf('function renderCatalogLibrary() {');
  const end = app.indexOf('function renderSeasonLibrary()', start);
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  context.renderCatalogLibrary();
  assert.deepEqual(groups.flatMap(group => group.tracks), [quarter, legacy, imported]);
  assert.equal(input.value, 'Singer');
  assert.doesNotMatch(html, /data-value="tracks"|libraryTracksPanel/);
  for (const label of ['全部番剧', '季度番剧', 'Bangumi 导入']) assert.ok(html.includes(label));
});

test('quarter catalog includes small historical quarters and preserves every distinct theme', () => {
  const old = { title: 'First OP', anime: 'Old show', type: 'OP', season: '1995-10', anilistId: 1 };
  const anotherOp = { ...old, title: 'Second OP' };
  const insert = { ...old, title: 'Insert', type: 'IN' };
  const ending = { title: 'Ending', anime: 'New show', type: 'ED', season: '2020-01', anilistId: 2 };
  const duplicate = { ...old, anime: 'Old show alternate name' };
  const catalog = buildQuarterCatalog([old, anotherOp, insert], { '1995-10': [duplicate], '2020-01': [ending], '2099-01': [] });
  assert.deepEqual(Object.keys(catalog), ['1995-10', '2020-01']);
  assert.deepEqual(catalog['1995-10'], [old, anotherOp, insert]);
  assert.equal(catalog['1995-10'][0], old);
  assert.deepEqual(catalog['2020-01'], [ending]);
  const selected = selectMixedSongs({ legacy: [old, anotherOp, insert], seasons: catalog, imported: [],
    watchedKeys: [], animeKey: song => song.anime, mix: { seasons: ['1995-10'] } });
  assert.deepEqual(selected, [old, anotherOp, insert]);
});

test('free combination unions imported, chosen quarter and followed anime without duplicates', () => {
  const old = { title: 'Old', anime: 'A' };
  const followed = { title: 'Followed', anime: 'B' };
  const spring = { title: 'Spring', anime: 'C', season: '2026-04' };
  const summer = { title: 'Summer', anime: 'D', season: '2026-07' };
  const imported = { title: 'Import', anime: 'E' };
  const selected = selectMixedSongs({ legacy: [old, followed], seasons: { '2026-04': [spring], '2026-07': [summer] }, imported: [imported],
    watchedKeys: ['B'], animeKey: song => song.anime,
    mix: { legacy: false, seasons: ['2026-07'], imported: true, watched: true } });
  assert.deepEqual(selected, [followed, summer, imported]);
});

test('free combination source has a stable selection meaning', () => {
  assert.equal(sourceSelection('mix').group, 'mix');
  assert.equal(sourceFromSelection({ group: 'mix' }), 'mix');
});

test('cover browsing groups songs under one anime and preserves track actions', () => {
  const first = { title: 'Opening', anime: 'Show', animeCN: '番剧', type: 'OP' };
  const second = { title: 'Ending', anime: 'Show', animeCN: '番剧', type: 'ED' };
  const other = { title: 'Another', anime: 'Other', type: 'OP' };
  const groups = groupLibrarySongs([first, second, other], song => song.anime);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].tracks, [first, second]);
  assert.equal(groups[0].title, '番剧');
});
