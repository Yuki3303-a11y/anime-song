import test from 'node:test';
import assert from 'node:assert/strict';
import { currentLocalSeason, prepareSeasonForPublish, mergeSeasonData } from '../scripts/season-updater-tools.mjs';
import { fetchBangumiRanking, matchBangumiShow } from '../scripts/bangumi-season.mjs';
import { rankAudioCandidates } from '../audio-selection.mjs';

test('Bangumi pagination advances by the returned count and retains shows after the first page', async () => {
  const originalFetch = globalThis.fetch;
  const offsets = [];
  globalThis.fetch = async url => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    offsets.push(offset);
    const length = Math.min(20, 45 - offset);
    return { ok: true, json: async () => ({ total: 45,
      data: Array.from({ length }, (_, i) => ({ id: offset + i + 1, platform: 'TV' })) }) };
  };
  try {
    const ranking = await fetchBangumiRanking(2026, 'fall');
    assert.deepEqual(offsets, [0, 20, 40]);
    assert.equal(ranking.length, 45);
    assert.equal(ranking[27].id, 28);
  } finally { globalThis.fetch = originalFetch; }
});

test('Bangumi discovery distinguishes sequels and leaves ambiguous titles for review', () => {
  const media = [
    { id: 1, title: { native: 'アオアシ' } },
    { id: 2, title: { native: 'アオアシ 第2期' } }
  ];
  const show = { id: 555605, name: 'アオアシ Season 2' };
  assert.equal(matchBangumiShow(show, media, [])?.id, 2);
  assert.equal(matchBangumiShow(show, [...media, { ...media[1], id: 3 }], []), null);
});

test('publishing rejects a playable title-only hit while allowing a match with artist evidence', () => {
  const song = { title: 'RESPAWN!!', anime: 'Nia Liston', artist: 'Watame Tsunomaki', type: 'OP' };
  const unrelated = { title: 'Fortnite Respawn Rumble', source: 'bilibili' };
  const related = { title: 'Watame Tsunomaki — RESPAWN!!', source: 'youtube' };
  assert.deepEqual(rankAudioCandidates(song, [unrelated, related], { requireRelation: true })
    .map(item => item.title), [related.title]);
});

function candidateFor(key = '2026-10') {
  return {
    season: key,
    complete: true,
    targetAnime: 30,
    selected: Array.from({ length: 30 }, (_, index) => {
      const anilistId = 30000 + index;
      const anime = `Anime ${index + 1}`;
      const common = { anime, animeNative: `日本語番組${index + 1}`, anilistId, season: key };
      return {
        anime, anilistId,
        coverUrl: `https://example.test/${anilistId}.jpg`,
        songs: ['OP', 'ED'].map(type => ({
          ...common, title: `${type} Song ${index + 1}`, titleCN: `${type} Song ${index + 1}`,
          artist: `Artist ${index + 1}`, type
        }))
      };
    })
  };
}

const namesFor = candidate => Object.fromEntries(candidate.selected.map(show => [show.anilistId, `中文番名${show.anilistId}`]));
const playableFor = candidate => candidate.selected.flatMap(show => show.songs).map(song => ({
  anilistId: song.anilistId, type: song.type, playable: true, source: 'itunes'
}));

test('one-click season selection uses the local calendar quarter', () => {
  assert.deepEqual(currentLocalSeason(new Date(2026, 9, 1, 0, 5)), { year: 2026, season: 'fall', key: '2026-10' });
  assert.deepEqual(currentLocalSeason(new Date(2027, 0, 1, 0, 5)), { year: 2027, season: 'winter', key: '2027-01' });
});

test('publish preparation requires 30 AniList shows, 60 paired songs, covers, Chinese names and playable source checks', () => {
  const candidate = candidateFor();
  const prepared = prepareSeasonForPublish(candidate, '2026-10', namesFor(candidate), playableFor(candidate));
  assert.equal(prepared.songs.length, 60);
  assert.equal(Object.keys(prepared.covers).length, 30);
  assert.ok(prepared.songs.every(song => song.animeCN && song.season === '2026-10'));
  assert.throws(() => prepareSeasonForPublish({ ...candidate, complete: false }, '2026-10', namesFor(candidate), playableFor(candidate)), /incomplete/i);
  assert.throws(() => prepareSeasonForPublish(candidate, '2026-10', namesFor(candidate), playableFor(candidate).slice(1)), /playable/i);
  assert.throws(() => prepareSeasonForPublish(candidate, '2026-10', {}, playableFor(candidate)), /Chinese|中文/i);
  const youtubeChecks = playableFor(candidate);
  youtubeChecks[0] = { ...youtubeChecks[0], source: 'youtube', videoId: 'abcdefghijk' };
  youtubeChecks[1] = { ...youtubeChecks[1], source: 'bilibili', bvid: 'BV1234567890' };
  youtubeChecks[2].url = 'https://audio-ssl.itunes.apple.com/preview.m4a';
  const youtubePrepared = prepareSeasonForPublish(candidate, '2026-10', namesFor(candidate), youtubeChecks);
  assert.equal(youtubePrepared.songs[0].youtubeVideoId, 'abcdefghijk');
  assert.equal(youtubePrepared.songs[1].bilibiliVideoId, 'BV1234567890');
  assert.equal(youtubePrepared.songs[2].itunesPreviewUrl, youtubeChecks[2].url);
});

test('publish preparation rejects duplicate IDs, empty theme lists and invalid covers', () => {
  const candidate = candidateFor();
  const names = namesFor(candidate);
  const playable = playableFor(candidate);
  const duplicate = structuredClone(candidate);
  duplicate.selected[1].anilistId = duplicate.selected[0].anilistId;
  assert.throws(() => prepareSeasonForPublish(duplicate, '2026-10', names, playable), /unique|15/i);
  const missingEd = structuredClone(candidate);
  missingEd.selected[0].songs = [];
  assert.throws(() => prepareSeasonForPublish(missingEd, '2026-10', names, playable), /OP.*ED/i);
  const badCover = structuredClone(candidate);
  badCover.selected[0].coverUrl = 'http://example.test/cover.jpg';
  assert.throws(() => prepareSeasonForPublish(badCover, '2026-10', names, playable), /cover|HTTPS/i);
  const duplicateSong = structuredClone(candidate);
  duplicateSong.selected[0].songs[1].title = duplicateSong.selected[0].songs[0].title;
  assert.throws(() => prepareSeasonForPublish(duplicateSong, '2026-10', names, playable), /duplicate song/i);
});

test('merge refuses to overwrite a published quarter or a conflicting cover', () => {
  const candidate = candidateFor();
  const prepared = prepareSeasonForPublish(candidate, '2026-10', namesFor(candidate), playableFor(candidate));
  assert.throws(() => mergeSeasonData({ '2026-10': [] }, {}, '2026-10', prepared), /already published/i);
  assert.throws(() => mergeSeasonData({}, { '30000': 'https://old.example/cover.jpg' }, '2026-10', prepared), /cover/i);
  const merged = mergeSeasonData({}, {}, '2026-10', prepared);
  assert.equal(merged.pools['2026-10'].length, 60);
  assert.equal(Object.keys(merged.covers).length, 30);
});
