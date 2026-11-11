#!/usr/bin/env node
// Generate review candidates only. Published pools live in seasonal-pools.js.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_SEASON_ANIME = 30;

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
  const pair = pickThemes(anime);
  return pair.OP && pair.ED && pair.OP.song.title.trim().toLowerCase() !== pair.ED.song.title.trim().toLowerCase() ? pair : null;
}
export function pickThemes(anime) {
  const sorted = [...(anime.animethemes || [])]
    .filter(t => ['OP', 'ED'].includes(t.type) && t.song?.title?.trim() && t.song?.artists?.some(a => a.name))
    .sort((a, b) => (a.slug || '').localeCompare(b.slug || '', undefined, { numeric: true }));
  const OP = sorted.find(t => t.type === 'OP');
  const ED = sorted.find(t => t.type === 'ED');
  return { OP, ED };
}
export function selectSeasonSongs(ranked, themeAnime, target = DEFAULT_SEASON_ANIME) {
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
export async function fetchAniList(year, season, limit) {
  const query = `query ($page: Int, $perPage: Int, $year: Int, $season: MediaSeason) {
    Page(page: $page, perPage: $perPage) {
      media(season: $season, seasonYear: $year, type: ANIME, format: TV, sort: POPULARITY_DESC, isAdult: false) {
        id season seasonYear title { romaji english native } synonyms coverImage { medium large } popularity
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
export async function fetchAnimeThemes(year, season) {
  try {
    return await fetchAnimeThemesApi(year, season);
  } catch (error) {
    console.warn(`AnimeThemes API 暂不可用（${error.message}），尝试读取官方季度页面。`);
    const page = async url => {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`AnimeThemes page HTTP ${response.status}`);
      const html = await response.text();
      const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!match) throw new Error('AnimeThemes 官方页面数据格式已变化');
      return JSON.parse(match[1]).props.pageProps;
    };
    const index = await page(`https://animethemes.moe/year/${year}/${season}`);
    const queue = index.season?.anime?.nodes;
    if (!Array.isArray(queue)) throw new Error('AnimeThemes 季度页面缺少番剧数据');
    const results = new Array(queue.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (cursor < queue.length) {
        const position = cursor++;
        try {
          const { anime } = await page(`https://animethemes.moe/anime/${queue[position].slug}`);
          results[position] = {
            name: anime.title.romaji, slug: anime.slug,
            resources: anime.resources.edges.filter(edge => edge.node.site === 'ANILIST').map(edge => ({
              site: 'AniList', external_id: Number(edge.node.link.match(/\/anime\/(\d+)/)?.[1])
            })),
            animethemes: anime.themes.map(theme => ({
              type: theme.type, slug: `${theme.type}${theme.sequence || 1}`,
              song: { title: theme.song?.title.romaji, artists: (theme.song?.staff || [])
                .filter(staff => ['Performance', 'Featuring'].includes(staff.role))
                .map(staff => ({ name: typeof staff.alias === 'string' ? staff.alias : staff.artist.name.main })) }
            }))
          };
        } catch (pageError) {
          console.warn(`待复核：${queue[position].slug} 页面未能读取（${pageError.message}）。`);
        }
      }
    }));
    return results.filter(Boolean);
  }
}

async function fetchAnimeThemesApi(year, season) {
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
  const target = Number(value('--top-anime', String(DEFAULT_SEASON_ANIME)));
  const limit = Number(value('--limit', '100'));
  if (!Number.isInteger(target) || target < 1 || !Number.isInteger(limit) || limit < target || limit > 200)
    throw new Error('Invalid target or limit');
  const out = path.resolve(value('--out', `candidates/${key}`));
  const useAniList = value('--rank-source', 'bangumi') === 'anilist';
  let result;
  if (useAniList) {
    const [ranked, themes] = await Promise.all([fetchAniList(year, season, limit), fetchAnimeThemes(year, season)]);
    result = selectSeasonSongs(ranked, themes, target);
  } else {
    const { discoverBangumiSeason, selectBangumiSeasonSongs } = await import('./bangumi-season.mjs');
    result = selectBangumiSeasonSongs(await discoverBangumiSeason(year, season), target);
  }
  const data = { season: key, rankSource: useAniList ? 'AniList POPULARITY_DESC TV' : 'Bangumi heat (TV)', targetAnime: target, complete: result.complete, selected: result.selected, skipped: result.skipped };
  const report = [
    `# ${key} 季度曲库候选`, '',
    `状态：${result.complete ? `${target * 2} 首元数据齐全，待人工复核音源` : `仅 ${result.selected.length}/${target} 部完整，暂不可发布`}`,
    `选入：${result.selected.length} 部 / ${result.songs.length} 首。${data.rankSource} 排名，AnimeThemes 歌曲，AniList ID 关联。`,
    '', '| 排名 | 番剧 | OP | ED | 人气 | 来源 |', '|---:|---|---|---|---:|---|',
    ...result.selected.map(x => `| ${x.rank} | ${x.anime} | ${x.songs[0].title} — ${x.songs[0].artist} | ${x.songs[1].title} — ${x.songs[1].artist} | ${x.songs[0].popularity ?? '—'} | [AnimeThemes](${x.songs[0].animethemesUrl}) |`),
    '', '## 跳过的更热门番剧', '', ...result.skipped.map(x => `- ${x.rank}. ${x.anime || x.animeCN || x.original}（${x.reason}）`),
    '', '## 发布前复核', '', '- 核对中文番名、歌名、歌手与 OP/ED。', '- 逐首试听，确认至少一个现有音频源可播放且音频与题目相符。', `- 仅将复核后的完整 ${target * 2} 首加入季度静态曲库；候选不会被网页加载。`, ''
  ].join('\n');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(`${out}.json`, JSON.stringify(data, null, 2) + '\n');
  fs.writeFileSync(`${out}.md`, report);
  console.log(`${key}: ${result.selected.length}/${target} anime, ${result.songs.length} songs, complete=${result.complete}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
