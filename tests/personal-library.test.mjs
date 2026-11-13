import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  animeKey, trackKey, groupSeasonSongs, filterWatchedSongs,
  putAudioCheck, putFeedback, createCatalogHistory
} from '../library-tools.mjs';

const poolSource = fs.readFileSync(fileURLToPath(new URL('../seasonal-pools.js', import.meta.url)), 'utf8');
const SEASONAL_POOLS = JSON.parse(poolSource.match(/export const SEASONAL_POOLS = (\{[\s\S]*\});/)[1]);

const song = { title: 'Connect', anime: 'Mahou Shoujo Madoka Magica', animeCN: '魔法少女小圆', type: 'OP', artist: 'ClariS', anilistId: 9756 };

test('season page groups every published theme without requiring OP and ED pairs', () => {
  for (const [season, songs] of Object.entries(SEASONAL_POOLS)) {
    const grouped = groupSeasonSongs(songs);
    assert.equal(grouped.length, new Set(songs.map(animeKey)).size, season);
    assert.equal(grouped.flatMap(anime => anime.songs).length, songs.length, season);
    assert.equal(grouped.flatMap(anime => Object.values(anime.tracksByType).flat()).length, songs.length, season);
    assert.equal(new Set(grouped.map(anime => anime.key)).size, grouped.length, season);
  }
});

test('multiple openings, ending and insert themes remain available under one show', () => {
  const tracks = [song, { ...song, title: 'Another OP' }, { ...song, title: 'Magia', type: 'ED' }, { ...song, title: 'Insert', type: 'IN' }];
  const [group] = groupSeasonSongs(tracks);
  assert.deepEqual(group.songs, tracks);
  assert.deepEqual(group.tracksByType.OP, tracks.slice(0, 2));
  assert.equal(group.tracks.OP, song);
  assert.deepEqual(group.tracksByType.IN, [tracks[3]]);
});

test('watched filtering uses stable anime identity and leaves the source list intact', () => {
  const other = { title: 'Other', anime: 'Other Anime', type: 'ED' };
  const songs = [song, { ...song, title: 'Magia', type: 'ED' }, other];
  assert.equal(animeKey(song), 'anilist:9756');
  assert.notEqual(trackKey(song), trackKey(songs[1]));
  assert.deepEqual(filterWatchedSongs(songs, [animeKey(song)], true), songs.slice(0, 2));
  assert.deepEqual(filterWatchedSongs(songs, [], false), songs);
  assert.equal(songs.length, 3);
});

test('catalog corrections carry old selections and records to the same songs, including a split series', () => {
  const first = { title: 'First', titleCN: '第一首', anime: '系列 第一季', type: 'ED', artist: '歌手' };
  const second = { title: 'Second', anime: '系列 第二季', type: 'OP' };
  const original = { title: 'First', anime: '系列', type: 'OP' };
  const oldKey = trackKey(original);
  const history = createCatalogHistory([first, second], {}, {
    legacy: { 0: ['First', '系列', 'OP'], 1: ['Second', '系列', 'OP'] }
  });

  assert.deepEqual(history.watched([animeKey(original), 'anime:我的导入']), [animeKey(first), animeKey(second), 'anime:我的导入']);
  assert.deepEqual(history.selected([oldKey, trackKey(first), 'custom']), [trackKey(first), 'custom']);
  assert.deepEqual(history.record({ key: oldKey, count: 2 }), {
    key: trackKey(first), title: first.titleCN, anime: first.anime, type: first.type, artist: first.artist, count: 2
  });
  const unrelated = { key: 'old-replacement', count: 1 };
  assert.equal(history.record(unrelated), unrelated);
  assert.deepEqual(history.favorite({ ...original, videoId: 'saved' }), { ...first, animeCN: '', videoId: 'saved' });
});

test('assigning exact anime IDs migrates old follows and canonical recording selections', () => {
  const first = { title: 'First', anime: 'Series', animeCN: '系列', type: 'OP', anilistId: 1 };
  const second = { title: 'Second', anime: 'Series', animeCN: '系列', type: 'ED', anilistId: 2 };
  const copy = { ...first, anime: 'Series season one', animeCN: '系列 第一季' };
  const history = createCatalogHistory([first, second], { '2020-01': [copy] }, {});
  assert.deepEqual(history.watched(['anime:系列']), ['anilist:1', 'anilist:2']);
  assert.deepEqual(history.selected([trackKey(copy)]), [trackKey(first)]);
  assert.equal(history.record({ key: trackKey(copy), count: 3 }).key, trackKey(first));
  assert.equal(history.favorite(copy).anime, first.anime);
});

test('audio status distinguishes verified local playback from a later failure', () => {
  const played = putAudioCheck([], song, 'played', 'bilibili', 100);
  const failed = putAudioCheck(played, song, 'failed', 'bilibili', 200);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].status, 'failed');
  assert.equal(failed[0].source, 'bilibili');
});

test('feedback stays attached to the track and bounded in local storage', () => {
  const first = putFeedback([], song, 'wrong-match', '这不是原曲', 100);
  const second = putFeedback(first, song, 'wrong-match', '对应了翻唱', 200);
  assert.equal(second.length, 1);
  assert.equal(second[0].note, '对应了翻唱');
  const many = Array.from({ length: 105 }, (_, i) => ({ key: `old-${i}`, reason: 'unplayable', at: i }));
  assert.equal(putFeedback(many, song, 'wrong-match', '', 300).length, 100);
});
