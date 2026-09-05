#!/usr/bin/env node
// =====================================================================
// scripts/validate-songs.mjs — 曲库完整性校验
//
// 用法：npm run validate  （或 node scripts/validate-songs.mjs）
//
// 校验项：
//   1. SONGS 可导入且为数组
//   2. 必填字段齐全：titleCN / title / anime / artist / type
//   3. type 合法：OP / ED / IN
//   4. title|anime 无重复
//   5. 曲目数量与 ALL_ANIME 部数输出（供核对）
//   6. 缓存版本号一致性：app.js 与 index.html 的 ?v= 必须一致
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

// ---------- 1. 读取 SONGS / ALL_ANIME ----------
// 用正则提取数据数组（项目为 commonjs 类型，songs.js 的 ESM 语法无法直接 import）
let SONGS, ALL_ANIME;
try {
  const code = fs.readFileSync(path.join(root, 'songs.js'), 'utf-8');
  const mSong = code.match(/export const SONGS = (\[[\s\S]*?\]);/);
  const mAnime = code.match(/export const ALL_ANIME = (\[[\s\S]*?\]);/);
  if (!mSong || !mAnime) throw new Error('songs.js 结构无法解析（SONGS/ALL_ANIME 未找到）');
  SONGS = new Function('return ' + mSong[1] + ';')();
  ALL_ANIME = new Function('SONGS', 'return ' + mAnime[1] + ';')(SONGS);
} catch (e) {
  console.error('❌ songs.js 读取失败:', e.message);
  process.exit(1);
}

// ---------- 2. 必填字段 ----------
const required = ['titleCN', 'title', 'anime', 'artist', 'type'];
const validTypes = new Set(['OP', 'ED', 'IN']);

for (let i = 0; i < SONGS.length; i++) {
  const s = SONGS[i];
  const idx = `[${i}]`;
  for (const f of required) {
    if (s[f] === undefined || s[f] === null || String(s[f]).trim() === '') {
      errors.push(`${idx} 缺字段 ${f}: ${JSON.stringify(s)}`);
    }
  }
  if (s.type && !validTypes.has(s.type)) {
    errors.push(`${idx} type 非法 "${s.type}": ${s.title} (${s.anime})`);
  }
}

// ---------- 3. 去重 ----------
const seen = new Map();
for (const s of SONGS) {
  const k = `${s.title}|${s.anime}`;
  if (seen.has(k)) errors.push(`重复条目 title|anime: "${k}"`);
  else seen.set(k, true);
}

// ---------- 4. 版本号一致性 ----------
// 约定：style.css / app.js / songs.js 的 ?v= 版本号必须一致（曲库更新时整体 bump）
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf-8');
const vCss = (html.match(/style\.css\?v=(\d+)/) || [])[1];
const vApp = (html.match(/app\.js\?v=(\d+)/) || [])[1];
const vSongs = (appJs.match(/songs\.js\?v=(\d+)/) || [])[1];
const vSet = new Set([vCss, vApp, vSongs]);
if (vSet.size !== 1) {
  errors.push(`缓存版本号不一致: style.css v=${vCss ?? '无'}, app.js v=${vApp ?? '无'}, songs.js v=${vSongs ?? '无'}`);
}

// ---------- 5. 汇总 ----------
const animeCount = new Set(SONGS.map(s => s.anime)).size;
const types = {};
for (const s of SONGS) types[s.type] = (types[s.type] || 0) + 1;

console.log(`📦 SONGS: ${SONGS.length} 首 / ${animeCount} 部番剧`);
console.log(`   类型分布: ${Object.entries(types).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`   ALL_ANIME 导出: ${Array.isArray(ALL_ANIME) ? ALL_ANIME.length : '缺失/非数组'}`);
console.log(`   版本号: style.css v=${vCss} · app.js v=${vApp} · songs.js v=${vSongs}`);

if (errors.length) {
  console.error(`\n❌ 校验失败，共 ${errors.length} 个问题：`);
  errors.slice(0, 30).forEach(e => console.error('   - ' + e));
  process.exit(1);
}
console.log('\n✅ 曲库校验通过');
