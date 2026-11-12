// One-off data integrity audit for the final freeze review.
// The checked-in data files are .js with ESM syntax while package.json says
// commonjs, so node won't import them directly; copy them to temp .mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildQuarterCatalog } from '../library-navigation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
for (const name of ['songs', 'seasonal-pools', 'seasonal-covers']) {
  fs.copyFileSync(path.join(root, `${name}.js`), path.join(tmp, `${name}.mjs`));
}
const { SONGS, ALL_ANIME, AVAILABLE_TYPES } = await import(pathToFileURL(path.join(tmp, 'songs.mjs')).href);
const { SEASONAL_POOLS } = await import(pathToFileURL(path.join(tmp, 'seasonal-pools.mjs')).href);
const { SEASONAL_COVERS } = await import(pathToFileURL(path.join(tmp, 'seasonal-covers.mjs')).href);

const norm = v => String(v || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
const tkey = s => [norm(s.title), norm(s.anime), norm(s.type), norm(s.recordingId)].join('|');
const issues = [];

// 1. Required fields on SONGS
for (const s of SONGS) {
  for (const f of ['title', 'anime', 'artist', 'type']) {
    if (!s[f]) issues.push(`SONGS missing ${f}: ${JSON.stringify(s).slice(0, 120)}`);
  }
  if (!['OP', 'ED', 'IN'].includes(s.type)) issues.push(`SONGS bad type: ${s.type}`);
}

// 2. Duplicate tracks within SONGS
const seen = new Map();
for (const s of SONGS) {
  const k = tkey(s);
  if (seen.has(k)) issues.push(`SONGS duplicate track: ${k}`);
  seen.set(k, 1);
}

// 3. Seasonal pools
const seasonKeys = Object.keys(SEASONAL_POOLS);
for (const key of seasonKeys) {
  const pool = SEASONAL_POOLS[key];
  const op = pool.filter(s => s.type === 'OP');
  const ed = pool.filter(s => s.type === 'ED');
  const other = pool.filter(s => s.type !== 'OP' && s.type !== 'ED');
  console.log(`Season ${key}: total=${pool.length} OP=${op.length} ED=${ed.length} other=${other.length} uniqueAnime=${new Set(pool.map(s => s.anilistId)).size}`);
  const localSeen = new Set();
  for (const s of pool) {
    for (const f of ['title', 'anime', 'artist', 'type', 'anilistId']) {
      if (s[f] === undefined || s[f] === null || s[f] === '') issues.push(`${key} missing ${f}: ${JSON.stringify(s).slice(0, 100)}`);
    }
    const k = tkey(s);
    if (localSeen.has(k)) issues.push(`${key} duplicate track: ${k}`);
    localSeen.add(k);
    if (!SEASONAL_COVERS[s.anilistId]) issues.push(`${key} no cover for anilistId ${s.anilistId} (${s.anime})`);
  }
}

// Original and seasonal backing files may share recordings. Validate the catalog players actually use.
const catalog = buildQuarterCatalog(SONGS, SEASONAL_POOLS);
const catalogTracks = new Set();
for (const [season, songs] of Object.entries(catalog)) for (const song of songs) {
  const key = tkey(song);
  if (catalogTracks.has(key)) issues.push(`Visible catalog duplicate: ${key}`);
  catalogTracks.add(key);
  if (song.season !== season) issues.push(`Visible catalog quarter mismatch: ${key}`);
}
console.log(`\nVisible catalog: ${Object.keys(catalog).length} quarters / ${catalogTracks.size} tracks`);

// 6. Seasonal cover keys vs anilist IDs
const coverCount = Object.keys(SEASONAL_COVERS).length;
const usedCoverIds = new Set();
for (const s of SONGS) if (s.anilistId) usedCoverIds.add(String(s.anilistId));
for (const key of seasonKeys) for (const s of SEASONAL_POOLS[key]) usedCoverIds.add(String(s.anilistId));
const coverIds = Object.keys(SEASONAL_COVERS);
const orphan = coverIds.filter(id => !usedCoverIds.has(id));
console.log(`\nSEASONAL_COVERS entries=${coverCount}, orphan (unused) covers=${orphan.length}`);

// 7. OP/ED pairing per season
for (const key of seasonKeys) {
  const byAnime = new Map();
  for (const s of SEASONAL_POOLS[key]) {
    if (!byAnime.has(s.anilistId)) byAnime.set(s.anilistId, new Set());
    byAnime.get(s.anilistId).add(s.type);
  }
  const unpaired = [...byAnime].filter(([, types]) => !(types.has('OP') && types.has('ED')));
  console.log(`Season ${key}: anime=${byAnime.size}, unpaired=${unpaired.length}`);
}

console.log(`\nSONGS total=${SONGS.length}, ALL_ANIME=${ALL_ANIME.length}, AVAILABLE_TYPES=${JSON.stringify(AVAILABLE_TYPES)}`);
console.log(`\n===== ISSUES (${issues.length}) =====`);
issues.forEach(i => console.log(' - ' + i));
fs.rmSync(tmp, { recursive: true, force: true });
if (issues.length) process.exitCode = 1;
