// Quantify seasonal songs whose track title + artist have no CJK characters
// (romaji-only metadata). These are the songs at risk of failing the B站
// title/artist match because B站 uploads use Japanese/Chinese titles.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
fs.copyFileSync(path.join(root, 'seasonal-pools.js'), path.join(tmp, 'seasonal-pools.mjs'));
const { SEASONAL_POOLS } = await import(pathToFileURL(path.join(tmp, 'seasonal-pools.mjs')).href);

const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
const hasCJK = (...vals) => vals.some(v => CJK.test(String(v || '')));

for (const [season, pool] of Object.entries(SEASONAL_POOLS)) {
  const romaji = pool.filter(s => !hasCJK(s.title, s.titleCN, s.artist));
  console.log(`\n${season}: ${romaji.length}/${pool.length} romaji-only tracks`);
  romaji.forEach(s => console.log(`  ${s.type} "${s.title}" -- ${s.artist} (${s.animeCN || s.anime})`));
}
fs.rmSync(tmp, { recursive: true, force: true });