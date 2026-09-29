// One-off data integrity audit for the final freeze review.
// The checked-in data files are .js with ESM syntax while package.json says
// commonjs, so node won't import them directly; copy them to temp .mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
for (const name of ['songs', 'seasonal-pools', 'seasonal-covers']) {
  fs.copyFileSync(path.join(root, `${name}.js`), path.join(tmp, `${name}.mjs`));
}
const { SONGS, ALL_ANIME, AVAILABLE_TYPES } = await import(pathToFileURL(path.join(tmp, 'songs.mjs')).href);
const { SEASONAL_POOLS } = await import(pathToFileURL(path.join(tmp, 'seasonal-pools.mjs')).href);
const { SEASONAL_COVERS } = await import(pathToFileURL(path.join(tmp, 'seasonal-covers.mjs')).href);

const norm = v => String(v || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
const tkey = s => [norm(s.title), norm(s.anime), norm(s.type)].join('|');
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

// 4. Cross-pool duplicates (legacy vs seasons)
const legacyKeys = new Set(SONGS.map(tkey));
for (const key of seasonKeys) {
  for (const s of SEASONAL_POOLS[key]) {
    if (legacyKeys.has(tkey(s))) issues.push(`Cross duplicate legacy vs ${key}: ${tkey(s)}`);
  }
}

// 5. Cross-season duplicates
for (let i = 0; i < seasonKeys.length; i++) {
  for (let j = i + 1; j < seasonKeys.length; j++) {
    const b = new Set(SEASONAL_POOLS[seasonKeys[j]].map(tkey));
    for (const s of SEASONAL_POOLS[seasonKeys[i]]) {
      if (b.has(tkey(s))) issues.push(`Cross season duplicate ${seasonKeys[i]} vs ${seasonKeys[j]}: ${tkey(s)}`);
    }
  }
}

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
