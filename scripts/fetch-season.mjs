#!/usr/bin/env node
// Generate review candidates only. Published pools live in seasonal-pools.js.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MONTH = { winter: '01', spring: '04', summer: '07', fall: '10' };
const value = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i < 0 ? fallback : process.argv[i + 1];
};
export function currentSeason(date = new Date()) {
  const m = date.getUTCMonth() + 1;
  return { year: date.getUTCFullYear(), season: m <= 3 ? 'winter' : m <= 6 ? 'spring' : m <= 9 ? 'summer' : 'fall' };
}
export function seasonKey(year, season) {
  if (!Number.isInteger(year) || year < 1900 || !MONTH[season]) throw new Error('Invalid year or season');
  return `${year}-${MONTH[season]}`;
}
export function pickThemePair(anime) {
  const sorted = [...(anime.animethemes || [])]
    .filter(t => ['OP', 'ED'].includes(t.type) && t.song?.title?.trim() && t.song?.artists?.some(a => a.name))
    .sort((a, b) => (a.slug || '').localeCompare(b.slug || '', undefined, { numeric: true }));
  const OP = sorted.find(t => t.type === 'OP');
  const ED = sorted.find(t => t.type === 'ED');
  return OP && ED ? { OP, ED } : null;
}
export function selectSeasonSongs(ranked, themeAnime, target = 15) {
  const byId = new Map();
  for (const anime of themeAnime) for (const resource of anime.resources || []) {
    if (resource.site === 'AniList' && resource.external_id != null && Number.isInteger(Number(resource.external_id)))
      byId.set(Number(resource.external_id), anime);
  }
  const selected = [], skipped = [];
  for (const [index, media] of ranked.entries()) {
    if (selected.length === target) break;
    const anime = byId.get(media.id);
    const pair = anime && pickThemePair(anime);
    if (!pair) {
      skipped.push({ rank: index + 1, anilistId: media.id, anime: media.title?.romaji || '', reason: anime ? 'missing OP/ED metadata' : 'no AnimeThemes ID match' });
      continue;
    }
    const songs = ['OP', 'ED'].map(type => ({
      titleCN: pair[type].song.title.trim(), title: pair[type].song.title.trim(),
      anime: anime.name, animeCN: '', animeNative: media.title?.native || '',
      artist: pair[type].song.artists.map(a => a.name).filter(Boolean).join(', '),
      type, season: seasonKey(media.seasonYear, media.season.toLowerCase()), anilistId: media.id,
      popularity: media.popularity || 0, rank: index + 1,
      animethemesUrl: `https://animethemes.moe/anime/${anime.slug}`
    }));
    selected.push({ rank: index + 1, anime: anime.name, anilistId: media.id,
      animeNative: media.title?.native || '', animeEnglish: media.title?.english || '',
      coverUrl: media.coverImage?.medium || '', songs });
  }
  return { complete: selected.length === target, selected, skipped, songs: selected.flatMap(x => x.songs) };
}
async function fetchAniList(year, season, limit) {
  const query = `query ($page: Int, $perPage: Int, $year: Int, $season: MediaSeason) {
    Page(page: $page, perPage: $perPage) {
      media(season: $season, seasonYear: $year, type: ANIME, format: TV, sort: POPULARITY_DESC, isAdult: false) {
        id season seasonYear title { romaji english native } coverImage { medium } popularity
      }
    }
  }`;
  const all = [];
  for (let page = 1; all.length < limit; page++) {
    const perPage = Math.min(50, limit - all.length);
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { page, perPage, year, season: season.toUpperCase() } }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
    const body = await response.json();
    const batch = body?.data?.Page?.media || [];
    all.push(...batch);
    if (batch.length < perPage) break;
  }
  return all;
}
async function fetchAnimeThemes(year, season) {
  const all = [];
  for (let page = 1; page <= 30; page++) {
    const params = new URLSearchParams({
      'filter[season]': season, 'filter[year]': String(year),
      include: 'resources,animethemes.song.artists', 'page[number]': String(page)
    });
    const response = await fetch(`https://api.animethemes.moe/anime?${params}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36', Accept: 'application/vnd.api+json, application/json' },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`AnimeThemes HTTP ${response.status}`);
    const body = await response.json();
    const batch = body?.anime || [];
    all.push(...batch);
    if (batch.length < 15) return all;
  }
  throw new Error('AnimeThemes pagination exceeded 30 pages');
}
async function main() {
  const today = currentSeason();
  const season = value('--season', today.season);
  const year = Number(value('--year', String(today.year)));
  const key = seasonKey(year, season);
  const target = Number(value('--top-anime', '15'));
  const limit = Number(value('--limit', '100'));
  if (!Number.isInteger(target) || target < 1 || !Number.isInteger(limit) || limit < target || limit > 200)
    throw new Error('Invalid target or limit');
  const out = path.resolve(value('--out', `candidates/${key}`));
  const [ranked, themes] = await Promise.all([fetchAniList(year, season, limit), fetchAnimeThemes(year, season)]);
  const result = selectSeasonSongs(ranked, themes, target);
  const data = { season: key, rankSource: 'AniList POPULARITY_DESC TV', targetAnime: target, complete: result.complete, selected: result.selected, skipped: result.skipped };
  const report = [
    `# ${key} 季度曲库候选`, '',
    `状态：${result.complete ? '30 首元数据齐全，待人工复核音源' : `仅 ${result.selected.length}/${target} 部完整，暂不可发布`}`,
    `选入：${result.selected.length} 部 / ${result.songs.length} 首。AniList 排名，AnimeThemes 歌曲，AniList ID 关联。`,
    '', '| 排名 | 番剧 | OP | ED | 人气 | 来源 |', '|---:|---|---|---|---:|---|',
    ...result.selected.map(x => `| ${x.rank} | ${x.anime} | ${x.songs[0].title} — ${x.songs[0].artist} | ${x.songs[1].title} — ${x.songs[1].artist} | ${x.songs[0].popularity} | [AnimeThemes](${x.songs[0].animethemesUrl}) |`),
    '', '## 跳过的更热门番剧', '', ...result.skipped.map(x => `- ${x.rank}. ${x.anime}（${x.reason}）`),
    '', '## 发布前复核', '', '- 核对中文番名、歌名、歌手与 OP/ED。', '- 逐首试听，确认至少一个现有音频源可播放且音频与题目相符。', '- 仅将复核后的完整 30 首加入季度静态曲库；候选不会被网页加载。', ''
  ].join('\n');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(`${out}.json`, JSON.stringify(data, null, 2) + '\n');
  fs.writeFileSync(`${out}.md`, report);
  console.log(`${key}: ${result.selected.length}/${target} anime, ${result.songs.length} songs, complete=${result.complete}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
