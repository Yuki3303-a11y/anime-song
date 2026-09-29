import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  animeKey, trackKey, groupSeasonSongs, filterWatchedSongs,
  putMistake, putAudioCheck, putFeedback
} from '../library-tools.mjs';

const poolSource = fs.readFileSync(fileURLToPath(new URL('../seasonal-pools.js', import.meta.url)), 'utf8');
const SEASONAL_POOLS = JSON.parse(poolSource.match(/export const SEASONAL_POOLS = (\{[\s\S]*\});/)[1]);

const song = { title: 'Connect', anime: 'Mahou Shoujo Madoka Magica', animeCN: '魔法少女小圆', type: 'OP', artist: 'ClariS', anilistId: 9756 };

test('season page groups reviewed OP and ED entries by anime', () => {
  for (const [season, songs] of Object.entries(SEASONAL_POOLS)) {
    const grouped = groupSeasonSongs(songs);
    assert.equal(grouped.length, 15, season);
    assert.ok(grouped.every(anime => anime.tracks.OP && anime.tracks.ED), season);
    assert.equal(new Set(grouped.map(anime => anime.key)).size, 15, season);
  }
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

test('mistake book counts repeats and keeps the latest selected answer', () => {
  const first = putMistake([], song, '错误答案', 100);
  const second = putMistake(first, song, '另一个答案', 200);
  assert.equal(second.length, 1);
  assert.equal(second[0].count, 2);
  assert.equal(second[0].selected, '另一个答案');
  assert.equal(second[0].at, 200);
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
