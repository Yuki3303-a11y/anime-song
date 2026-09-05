#!/usr/bin/env node
// =====================================================================
// scripts/fetch-season.mjs — 曲库自动发现脚本（候选生成）
//
// 数据链路（已实测可行，见 feasibility-auto-library.md）：
//   AniList（当季热门番）→ AnimeThemes（OP/ED 歌曲）→ 质量门禁 → candidates
//
// 用法：
//   node scripts/fetch-season.mjs [--season summer] [--year 2026] [--limit 40] [--out candidates]
//   不传 --season/--year 时按当前日期推断当季档期。
//
// 输出：
//   candidates.js — 候选歌曲（人工复核后合并进 songs.js）
//   candidates.md — 人类可读复核报告（含热度、来源链接）
//
// 质量门禁：
//   - 仅取 AniList 当季 POPULARITY_DESC 前 N 部（默认 40）
//   - 每番剧最多 2 首（OP1 + ED1）
//   - 与现有 songs.js 去重（title|anime 归一化匹配）
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';

const ANILIST_URL = 'https://graphql.anilist.co';
const THEMES_URL = 'https://api.animethemes.moe/anime';

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
function argVal(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
}
function currentSeason(now = new Date()) {
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  if (m <= 3) return { season: 'winter', year: y };
  if (m <= 6) return { season: 'spring', year: y };
  if (m <= 9) return { season: 'summer', year: y };
  return { season: 'fall', year: y };
}

const def = currentSeason();
const season = argVal('--season', def.season);
const year = parseInt(argVal('--year', String(def.year)), 10);
const limit = parseInt(argVal('--limit', '40'), 10);
const outBase = argVal('--out', 'candidates');

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, '');

// ---------- 1. AniList：当季热门番 ----------
async function fetchAniList() {
  const query = `query ($season: MediaSeason, $year: Int, $perPage: Int) {
    Page(perPage: $perPage) {
      media(season: $season, seasonYear: $year, type: ANIME, format: TV, sort: POPULARITY_DESC, isAdult: false) {
        id
        title { romaji native }
        popularity
        averageScore
      }
    }
  }`;
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables: { season: season.toUpperCase(), year, perPage: limit } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const data = await res.json();
  const media = data?.data?.Page?.media || [];
  if (!media.length) throw new Error('AniList 返回空列表（检查档期参数）');
  return media.map(m => ({
    id: m.id,
    romaji: m.title?.romaji || '',
    native: m.title?.native || '',
    popularity: m.popularity || 0,
    averageScore: m.averageScore || 0,
  }));
}

// ---------- 2. AnimeThemes：当季所有主题曲（分页） ----------
async function fetchAnimeThemes() {
  const all = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams();
    // 注意：/anime 端点用扁平 filter；数组语法 filter[anime.season][] 仅用于 /animetheme 端点
    params.append('filter[season]', season);
    params.append('filter[year]', String(year));
    params.append('include', 'animethemes.song.artists'); // 点链 include：番剧 → 主题曲 → 歌曲 → 歌手
    params.append('page[number]', String(page));          // 分页固定每页 15 条
    const res = await fetch(`${THEMES_URL}?${params.toString()}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/vnd.api+json, application/json',
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`AnimeThemes HTTP ${res.status}`);
    const data = await res.json();
    const items = data?.anime || [];
    all.push(...items);
    const meta = data?.meta || {};
    const perPage = meta.per_page || 15;
    if (items.length === 0 || items.length < perPage) break;
    page++;
  }
  return all;
}

// ---------- 3. 读取现有曲库（去重用） ----------
function loadExistingSongs() {
  const p = path.resolve(process.cwd(), 'songs.js');
  if (!fs.existsSync(p)) return [];
  const code = fs.readFileSync(p, 'utf-8');
  const m = code.match(/export const SONGS = (\[[\s\S]*?\]);/);
  if (!m) return [];
  try { return new Function('return ' + m[1] + ';')(); } catch { return []; }
}

// ---------- 3.5 Bangumi 中文番剧名补全（失败静默保留原名） ----------
// 注意：api.bgm.tv 在国内网络可能不可达（GitHub Actions 等境外环境可用）；
// 若连续多次失败则快速跳过，避免本地长时间空转。
let bgmFailStreak = 0;
async function fetchBangumiCN(name) {
  if (!name) return '';
  if (bgmFailStreak >= 5) return ''; // 已连续失败 5 次 → 直接跳过剩余
  try {
    const url = 'https://api.bgm.tv/search/subject/' + encodeURIComponent(name) + '?type=2';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'anime-song-quiz/1.0 (https://github.com/Yuki3303-a11y/anime-song)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) { bgmFailStreak++; return ''; }
    const data = await res.json();
    const list = (data.list || []).filter(x => x.type === 2);
    if (!list.length) return '';
    bgmFailStreak = 0;
    const n = norm(name);
    const hit = list.find(x => x.name && norm(x.name) === n)
      || list.find(x => x.name_cn && norm(x.name_cn) === n);
    const chosen = hit || list[0];
    return (chosen.name_cn && chosen.name_cn !== chosen.name) ? chosen.name_cn : '';
  } catch { bgmFailStreak++; return ''; }
}

// ---------- 4. 主流程 ----------
async function main() {
  console.log(`[1/4] AniList 拉取 ${year} ${season} 热门番（前 ${limit}）...`);
  const anilist = await fetchAniList();
  console.log(`     命中 ${anilist.length} 部番剧`);

  console.log('[2/4] AnimeThemes 拉取当季主题曲...');
  const themes = await fetchAnimeThemes();
  console.log(`     命中 ${themes.length} 部番剧的主题曲数据`);

  // 名称匹配：AniList romaji ↔ AnimeThemes anime.name
  const themeByName = new Map();
  for (const t of themes) {
    const key = norm(t.name);
    if (key) themeByName.set(key, t);
  }
  const matched = [];
  const unmatched = [];
  for (const a of anilist) {
    const key = norm(a.romaji);
    const theme = themeByName.get(key);
    if (theme) matched.push({ anilist: a, theme });
    else unmatched.push(a);
  }
  console.log(`[3/4] 名称匹配：${matched.length} 部命中，${unmatched.length} 部未匹配`);

  // 每番取 OP1 + ED1（slug 排序取最早）
  const candidates = [];
  for (const { anilist: a, theme: t } of matched) {
    const themes2 = (t.animethemes || [])
      .filter(x => x.song && (x.type === 'OP' || x.type === 'ED'))
      .sort((x, y) => (x.slug || '').localeCompare(y.slug || '', undefined, { numeric: true }));
    const picked = new Set();
    for (const th of themes2) {
      if (picked.size >= 2) break;
      const type = th.type;
      if (picked.has(type)) continue;
      const artist = (th.song.artists || []).map(x => x.name).join(', ');
      candidates.push({
        title: th.song.title || '',
        titleCN: th.song.title || '', // 阶段一：中文歌名复用原名（多数 OP 无官方中文译名）
        anime: t.name || a.romaji || '',
        animeCN: '', // Bangumi 中文名，下方补全
        artist,
        type,
        popularity: a.popularity,
        averageScore: a.averageScore,
        anilistId: a.id,
        slug: t.slug || '',
        animethemeUrl: `https://animethemes.moe/anime/${t.slug || ''}`,
      });
      picked.add(type);
    }
  }

  // Bangumi 中文番剧名补全（用日文原名/罗马音搜，命中率最高）
  console.log('[3.5/4] Bangumi 中文番剧名补全...');
  const cnMap = new Map();
  const uniqueAnime = [...new Set(candidates.map(c => c.anime))];
  let cnCount = 0;
  for (const a of uniqueAnime) {
    const src = matched.find(m => m.theme.name === a);
    const native = src?.anilist.native || '';
    const cn = (native && (await fetchBangumiCN(native))) || (await fetchBangumiCN(a));
    if (cn) { cnMap.set(a, cn); cnCount++; }
  }
  for (const c of candidates) c.animeCN = cnMap.get(c.anime) || c.anime;
  console.log(`     命中 ${cnCount}/${uniqueAnime.length} 部番剧中文名`);

  // 去重（与现有曲库 title|anime）
  const existing = loadExistingSongs();
  const existingKeys = new Set(existing.map(s => norm(s.title + '|' + s.anime)));
  const seen = new Set();
  const fresh = candidates.filter(c => {
    const k = norm(c.title + '|' + c.anime);
    if (existingKeys.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 质量门槛：零热度番直接剔除（popularity 为 0 说明数据异常）
  const clean = fresh.filter(c => c.popularity > 0);

  console.log(`[4/4] 候选：${candidates.length} 首原始 → 去重后 ${fresh.length} → 有效 ${clean.length}`);
  if (unmatched.length) {
    console.log(`\n⚠️ 未匹配番剧（AnimeThemes 无数据或名称不一致，前 10 部）：`);
    unmatched.slice(0, 10).forEach(u => console.log(`   - ${u.romaji} (pop ${u.popularity})`));
  }

  // 输出 candidates.js
  const stamp = new Date().toISOString().slice(0, 10);
  const js = `// 由 scripts/fetch-season.mjs 自动生成 — ${year} ${season} 档候选（${stamp}）
// ⚠️ 人工复核后合并进 songs.js：titleCN 建议用 Bangumi 中文名核对，确认后 bump 版本号 v25→v26
export const CANDIDATES = ${JSON.stringify(clean, null, 2)};
`;
  const jsPath = path.resolve(process.cwd(), `${outBase}.js`);
  fs.writeFileSync(jsPath, js, 'utf-8');

  // 输出 candidates.md 报告
  const md = [
    `# 曲库候选报告 — ${year} ${season} 档（${stamp}）`,
    ``,
    `- 数据源：AniList（热度排序）+ AnimeThemes（主题曲）+ Bangumi（中文番剧名）`,
    `- 候选 ${clean.length} 首 / ${new Set(clean.map(c => c.anime)).size} 部番剧（已与现有曲库去重）`,
    `- 每番限 OP1 + ED1；合并前请人工复核歌名与热度`,
    ``,
    `| 番剧 | 歌曲 | 歌手 | 类型 | 人气 | 评分 | 链接 |`,
    `|------|------|------|------|------|------|------|`,
    ...clean.map(c => `| ${c.animeCN}（${c.anime}） | ${c.title} | ${c.artist} | ${c.type} | ${c.popularity} | ${c.averageScore || '-'} | [AnimeThemes](${c.animethemeUrl}) |`),
    ``,
    unmatched.length ? `## 未匹配番剧（${unmatched.length} 部，需人工核对）\n\n${unmatched.map(u => `- ${u.romaji}（人气 ${u.popularity}）`).join('\n')}\n` : '',
  ].join('\n');
  const mdPath = path.resolve(process.cwd(), `${outBase}.md`);
  fs.writeFileSync(mdPath, md, 'utf-8');

  console.log(`\n✅ 已生成：`);
  console.log(`   ${jsPath}`);
  console.log(`   ${mdPath}`);
  console.log(`\n下一步：人工复核 ${outBase}.md → 合并进 songs.js → bump 版本号。`);
}

main().catch(e => {
  console.error('❌ 失败：', e.message);
  process.exit(1);
});
