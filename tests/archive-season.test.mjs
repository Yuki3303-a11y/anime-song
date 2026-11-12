import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveThemeSongs, mergeArchivedSongs } from '../scripts/archive-season-tools.mjs';
import { prepareSeasonForPublish } from '../scripts/season-updater-tools.mjs';
import { buildQuarterCatalog } from '../library-navigation.mjs';
import { trackKey } from '../library-tools.mjs';

test('historical import keeps all regular openings and endings, preserves old recordings and rejects wrong work IDs', () => {
  const theme = (id, type, title) => ({ id, type, sequence: id, group: null,
    song: { title: { romaji: title }, staff: [{ role: 'Performance', artist: { name: { main: 'Singer' } } }] } });
  const anime = { title: { romaji: 'Work' }, year: 2020, slug: 'work',
    resources: { edges: [{ node: { site: 'ANILIST', link: 'https://anilist.co/anime/1' } }] },
    themes: [theme(1, 'OP', 'First'), theme(2, 'OP', 'Second'), theme(3, 'ED', 'Ending'),
      { ...theme(4, 'OP', 'Foreign version'), group: { name: 'Dub' } }] };
  const old = { title: 'First', titleCN: '旧显示名', artist: '原有演唱署名', anime: '保留原始键', type: 'OP', anilistId: 1, season: '2020-01', youtubeVideoId: 'abcdefghijk' };
  const context = { season: '2020-01', anilistId: 1, bangumiId: 2, nameCN: '番剧', slug: 'work' };
  const result = archiveThemeSongs(anime, context, [old]);
  assert.equal(result.songs.length, 3);
  assert.equal(result.songs[0].titleCN, old.titleCN);
  assert.equal(result.songs[0].youtubeVideoId, old.youtubeVideoId);
  assert.deepEqual(result.songs.map(song => song.type), ['OP', 'OP', 'ED']);
  assert.equal(mergeArchivedSongs([old], result.songs).length, 3);
  assert.throws(() => archiveThemeSongs(anime, { ...context, anilistId: 99 }), /mismatch/);
});

test('a smaller quarter can publish several openings only when every recording has its own checked source', () => {
  const common = { anime: 'Work', anilistId: 1, season: '2020-01', artist: 'Singer' };
  const songs = ['One', 'Two'].map((title, i) => ({ ...common, title, type: 'OP', themeSequence: i + 1 }));
  const candidate = { season: '2020-01', targetAnime: 30, complete: true,
    selected: [{ anime: 'Work', anilistId: 1, coverUrl: 'https://example.test/cover.jpg', songs }] };
  const bare = [{ anilistId: 1, type: 'OP', playable: true, source: 'itunes' }];
  assert.throws(() => prepareSeasonForPublish(candidate, candidate.season, { 1: '番剧' }, bare), /playable/);
  const checks = songs.map(song => ({ anilistId: 1, type: 'OP', songTitle: song.title, playable: true, source: 'itunes' }));
  const prepared = prepareSeasonForPublish(candidate, candidate.season, { 1: '番剧' }, checks);
  assert.equal(prepared.songs.length, 2);
  assert.deepEqual(prepared.songs.map(song => song.themeSequence), [1, 2]);
});

test('different credited performances of one theme remain independently selectable', () => {
  const anime = { title: { romaji: 'Work' }, year: 2020, slug: 'work',
    resources: { edges: [{ node: { site: 'ANILIST', link: 'https://anilist.co/anime/1' } }] },
    themes: ['Singer A', 'Singer B'].map((name, i) => ({ id: i + 1, type: 'ED', sequence: i + 1,
      song: { title: { romaji: 'Ending' }, staff: [{ role: 'Performance', artist: { name: { main: name } } }] } })) };
  const { songs } = archiveThemeSongs(anime, { anilistId: 1, season: '2020-01', nameCN: '番剧' });
  assert.equal(songs.length, 2);
  assert.notEqual(trackKey(songs[0]), trackKey(songs[1]));
  assert.equal(buildQuarterCatalog([], { '2020-01': songs })['2020-01'].length, 2);
});
