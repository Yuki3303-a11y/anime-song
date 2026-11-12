#!/usr/bin/env node
// Build published data from reviewed rank/work mappings and official page snapshots.
// Source snapshots stay outside the repository; the manifest records gaps and provenance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { archiveThemeSongs, mergeArchivedSongs } from './archive-season-tools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const load = file => import(`data:text/javascript;base64,${fs.readFileSync(file).toString('base64')}`);

export async function buildSeasonArchive(cacheDir, baseRef = null) {
  const plan = read(path.join(cacheDir, 'match-plan.json'));
  const { SONGS } = await load(path.join(ROOT, 'songs.js'));
  const published = file => baseRef ? import(`data:text/javascript;base64,${execFileSync('git', ['show', `${baseRef}:${file}`], { cwd: ROOT }).toString('base64')}`) : load(path.join(ROOT, file));
  const { SEASONAL_POOLS: original } = await published('seasonal-pools.js');
  const { SEASONAL_COVERS: originalCovers } = await published('seasonal-covers.js');
  const existingSongs = [...SONGS, ...Object.values(original).flat()];
  const pools = { ...original }, covers = { ...originalCovers };
  const incomingBySeason = {};
  const manifest = { generatedAt: new Date().toISOString(), rankSource: 'Bangumi heat (TV)', targetAnime: 30,
    policy: '热度前30名内收录已确认的常规OP/ED，保留全部既有曲目，不以更低排名强行补满。季度按番剧档期归档。', seasons: {} };
  for (const [season, selection] of Object.entries(plan.seasons).sort()) {
    const incoming = [], selected = [], missing = [...selection.unresolved];
    const mediaFile = path.join(cacheDir, `anilist-${season}.json`);
    const media = fs.existsSync(mediaFile) ? read(mediaFile).data.Page.media : [];
    for (const row of selection.selected) {
      const file = path.join(cacheDir, `anime-${row.slug}.json`);
      if (!fs.existsSync(file)) { missing.push({ ...row, reason: '官方主题曲页面尚未核实' }); continue; }
      const anime = read(file);
      const details = media.find(item => item.id === row.anilistId);
      const month = { WINTER: '01', SPRING: '04', SUMMER: '07', FALL: '10' }[anime.season];
      const catalogSeason = month ? `${anime.year}-${month}` : season;
      const result = archiveThemeSongs(anime, { ...row, season, catalogSeason, releaseYear: details?.startDate?.year }, existingSongs);
      if (!result.songs.length) { missing.push({ ...row, reason: '暂无演唱署名完整的OP/ED' }); continue; }
      incoming.push(...result.songs);
      for (const song of result.songs) (incomingBySeason[song.season] ||= []).push(song);
      covers[row.anilistId] ||= row.coverUrl;
      selected.push({ rank: row.rank, bangumiId: row.bangumiId, anilistId: row.anilistId,
        anime: row.nameCN || row.name, catalogSeason, source: `https://animethemes.moe/anime/${row.slug}`,
        songs: result.songs.map(song => ({ type: song.type, sequence: song.themeSequence, title: song.title, artist: song.artist })),
        missing: result.missing });
    }
    manifest.seasons[season] = { rankedAnime: 30, selectedAnime: selected.length,
      totalSongs: incoming.length,
      retainedAnime: new Set((original[season] || []).map(song => song.anilistId)).size,
      selected, missing };
  }
  for (const season of new Set([...Object.keys(original), ...Object.keys(incomingBySeason)])) {
    pools[season] = mergeArchivedSongs(original[season] || [], incomingBySeason[season] || []);
    if (!pools[season].length) delete pools[season];
    if (manifest.seasons[season]) manifest.seasons[season].totalSongs = pools[season]?.length || 0;
  }
  const used = new Set(Object.values(pools).flat().map(song => String(song.anilistId)));
  const usedCovers = Object.fromEntries(Object.entries(covers).filter(([id]) => used.has(id)));
  return { pools, covers: usedCovers, manifest };
}

async function main() {
  const index = process.argv.indexOf('--cache');
  const cache = index >= 0 && process.argv[index + 1];
  if (!cache) throw new Error('用法：npm run build-archive -- --cache 已复核资料目录 [--write]');
  const refIndex = process.argv.indexOf('--base-ref');
  const result = await buildSeasonArchive(path.resolve(cache), refIndex >= 0 ? process.argv[refIndex + 1] : null);
  for (const [key, entry] of Object.entries(result.manifest.seasons))
    console.log(`${key}: 新榜单关联 ${entry.selectedAnime}/30 部，共 ${entry.totalSongs} 首，未确认 ${entry.missing.length} 部`);
  if (!process.argv.includes('--write')) { console.log('预览完成。加 --write 才写入已核对的数据。'); return; }
  fs.writeFileSync(path.join(ROOT, 'seasonal-pools.js'), '// Archived quarterly themes; provenance and gaps are in candidates/season-archive-manifest.json.\nexport const SEASONAL_POOLS = ' + JSON.stringify(result.pools, null, 2) + ';\n');
  fs.writeFileSync(path.join(ROOT, 'seasonal-covers.js'), '// HTTPS covers matched to published work IDs.\nexport const SEASONAL_COVERS = ' + JSON.stringify(result.covers, null, 2) + ';\n');
  fs.writeFileSync(path.join(ROOT, 'candidates', 'season-archive-manifest.json'), JSON.stringify(result.manifest, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
