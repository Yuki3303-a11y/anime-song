import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceSelection, sourceFromSelection, createPreviewSession, searchLibraryTracks, selectMixedSongs, groupLibrarySongs, mixForAddedSong } from '../library-navigation.mjs';

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

test('hand-picked songs can join a quarter without including the whole original library', () => {
  const old = { title: 'Picked', anime: 'A', type: 'OP' };
  const unwanted = { title: 'Unwanted', anime: 'B', type: 'ED' };
  const summer = { title: 'Summer', anime: 'C', type: 'OP', season: '2026-07' };
  const selected = selectMixedSongs({ legacy: [old, unwanted], seasons: { '2026-07': [summer] }, imported: [],
    watchedKeys: [], animeKey: song => song.anime, trackKey: song => `${song.title}|${song.anime}|${song.type}`,
    selectedKeys: ['Picked|A|OP'],
    mix: { legacy: false, seasons: ['2026-07'], imported: false, watched: false, selected: true } });
  assert.deepEqual(selected, [old, summer]);
});

test('adding one song while browsing a quarter preserves that quarter in the new mix', () => {
  assert.deepEqual(mixForAddedSong('season:2026-07', ['2026-04', '2026-07']),
    { legacy: false, seasons: ['2026-07'], imported: false, watched: false, selected: true });
});
