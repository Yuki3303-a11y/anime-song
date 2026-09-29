#!/usr/bin/env node
// One-click local seasonal update. Publishes only complete, metadata-enriched,
// source-checked pools, then runs the project's full tests and validators.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { audioSearchQueries, rankAudioCandidates } from '../audio-selection.mjs';
import { currentLocalSeason, mergeSeasonData, prepareSeasonForPublish } from './season-updater-tools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BILI = 'https://anime-song-gamma.vercel.app';
const REQUEST_TIMEOUT = 12000;
const nap = ms => new Promise(resolve => setTimeout(resolve, ms));
let startedProxy = null;

function parseExport(source, name) {
  const match = source.match(new RegExp(`export const ${name} = (\\{[\\s\\S]*\\});`));
  if (!match) throw new Error(`${name} data cannot be parsed`);
  return JSON.parse(match[1]);
}

async function fetchJson(url, options = {}, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally { clearTimeout(timer); }
}

const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');

async function lookupBangumiName(show) {
  const aliases = [show.animeNative, show.animeEnglish, show.anime].filter(Boolean);
  let lastError;
  for (const keyword of aliases) {
    try {
      const body = await fetchJson('https://api.bgm.tv/v0/search/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'anime-song-library-updater/1.0' },
        body: JSON.stringify({ keyword, sort: 'match', filter: { type: [2], nsfw: false }, limit: 10 })
      });
      const items = Array.isArray(body) ? body : body.data || [];
      const exact = items.find(item => aliases.some(alias => normalize(alias) === normalize(item.name)));
      const chinese = String(exact?.name_cn || '').trim();
      if (chinese && /[\u3400-\u9fff]/.test(chinese)) return chinese;
    } catch (error) { lastError = error; }
    await nap(250);
  }
  if (lastError) console.warn(`Bangumi lookup failed for ${show.anime}: ${lastError.message}`);
  return '';
}

async function verifyPreview(song, previewUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(previewUrl, { headers: { Range: 'bytes=0-0' }, signal: controller.signal });
    await response.body?.cancel();
    return response.ok && [200, 206].includes(response.status);
  } catch { return false; }
  finally { clearTimeout(timer); }
}

async function searchItunes(song) {
  for (const term of audioSearchQueries(song).itunes) {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=15&country=JP`;
      const data = await fetchJson(url, { headers: { Accept: 'application/json' } });
      const candidates = (data.results || []).filter(item => item.previewUrl).map(item => ({
        source: 'itunes', url: item.previewUrl, title: item.trackName || '',
        artist: item.artistName || '', album: item.collectionName || ''
      }));
      for (const candidate of rankAudioCandidates(song, candidates).slice(0, 3)) {
        if (await verifyPreview(song, candidate.url)) return {
          anilistId: song.anilistId, type: song.type, playable: true, source: 'itunes',
          matchedTitle: candidate.title, matchedArtist: candidate.artist, matchedAlbum: candidate.album, score: candidate.score
        };
      }
    } catch { /* try the next query/source */ }
  }
  return null;
}

function youtubeApiKeys() {
  if (process.env.YOUTUBE_API_KEY) return [process.env.YOUTUBE_API_KEY];
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const match = app.match(/const YT_API_KEYS = \[([\s\S]*?)\];/);
  return match ? [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(found => found[1]) : [];
}

async function searchYouTube(song) {
  const keys = youtubeApiKeys();
  const exhausted = new Set();
  if (!keys.length) return null;
  for (const query of audioSearchQueries(song).youtube) {
    for (const [keyIndex, key] of keys.entries()) {
      if (exhausted.has(keyIndex)) continue;
      try {
        const params = new URLSearchParams({
          part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '10', q: query, key
        });
        const found = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
        const items = (found.items || []).filter(item => item.id?.videoId);
        if (!items.length) break;
        const ids = items.map(item => item.id.videoId);
        const detailParams = new URLSearchParams({ part: 'status', id: ids.join(','), key });
        const details = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`);
        const embeddable = new Set((details.items || []).filter(item => item.status?.embeddable).map(item => item.id));
        const ranked = rankAudioCandidates(song, items.filter(item => embeddable.has(item.id.videoId)).map(item => ({
          source: 'youtube', videoId: item.id.videoId, title: item.snippet?.title || '',
          artist: item.snippet?.channelTitle || '', embeddable: true
        })));
        if (ranked.length) {
          const best = ranked[0];
          return {
            anilistId: song.anilistId, type: song.type, playable: true, source: 'youtube',
            matchedTitle: best.title, matchedArtist: best.artist, videoId: best.videoId, score: best.score
          };
        }
        break;
      } catch (error) {
        if ([403, 429].includes(error.status)) { exhausted.add(keyIndex); continue; }
        break;
      }
    }
  }
  return null;
}

async function checkStream(url, base, backupUrl) {
  const streamUrl = new URL('/api/search', base);
  streamUrl.searchParams.set('stream', url);
  if (backupUrl) streamUrl.searchParams.set('backup', backupUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(streamUrl, { headers: { Range: 'bytes=0-0' }, signal: controller.signal });
    await response.body?.cancel();
    return response.ok && [200, 206].includes(response.status);
  } catch { return false; }
  finally { clearTimeout(timer); }
}

async function biliBases() {
  const bases = [];
  const local = 'http://127.0.0.1:8765';
  try {
    const response = await fetch(`${local}/api/search?q=__probe__`, { signal: AbortSignal.timeout(800) });
    if (response.ok) bases.push(local);
  } catch { /* local proxy is optional */ }
  const configured = process.env.BILI_WORKER_URL?.replace(/\/$/, '');
  if (configured && !bases.includes(configured)) bases.push(configured);
  if (!bases.includes(DEFAULT_BILI)) bases.push(DEFAULT_BILI);
  return bases;
}

async function startLocalProxyIfNeeded() {
  try {
    const response = await fetch('http://127.0.0.1:8765/api/search?q=__probe__', { signal: AbortSignal.timeout(800) });
    if (response.ok) return;
  } catch { /* start a temporary proxy below */ }
  startedProxy = spawn(process.execPath, [path.join(ROOT, 'bili-proxy.mjs')], {
    cwd: ROOT, stdio: 'ignore', windowsHide: true
  });
  for (let attempt = 0; attempt < 20; attempt++) {
    if (startedProxy.exitCode !== null) break;
    await nap(500);
    try {
      const response = await fetch('http://127.0.0.1:8765/api/search?q=__probe__', { signal: AbortSignal.timeout(800) });
      if (response.ok) {
        console.log('已临时启动本地 B 站代理，用于歌曲验证。');
        return;
      }
    } catch { /* wait for service startup */ }
  }
  startedProxy.kill();
  startedProxy = null;
  console.warn('本地 B 站代理未能启动；继续尝试已部署代理与 iTunes。');
}

async function searchBilibili(song, bases) {
  for (const base of bases) for (const query of audioSearchQueries(song).bilibili) {
    try {
      const data = await fetchJson(`${base}/api/search?q=${encodeURIComponent(query)}`);
      const candidates = (data.results || []).filter(item => item.bvid && item.duration >= 25 && item.duration <= 600)
        .map(item => ({ source: 'bilibili', bvid: item.bvid, title: item.title || '', artist: item.author || '', album: '' }));
      for (const candidate of rankAudioCandidates(song, candidates).slice(0, 3)) {
        try {
          const audio = await fetchJson(`${base}/api/search?bvid=${encodeURIComponent(candidate.bvid)}`);
          if (audio.url && await checkStream(audio.url, base, audio.backupUrl))
            return {
              anilistId: song.anilistId, type: song.type, playable: true, source: 'bilibili',
              matchedTitle: candidate.title, matchedArtist: candidate.artist, bvid: candidate.bvid, score: candidate.score
            };
        } catch { /* try the next high-confidence result */ }
      }
    } catch { /* proxy may be unavailable; continue */ }
  }
  return null;
}

async function verifyAudio(songs) {
  const bases = await biliBases();
  const checks = [];
  for (let index = 0; index < songs.length; index++) {
    const song = songs[index];
    console.log(`[音源 ${index + 1}/${songs.length}] ${song.anime} ${song.type} — ${song.title}`);
    const found = await searchItunes(song) || await searchBilibili(song, bases) || await searchYouTube(song);
    checks.push(found || { anilistId: song.anilistId, type: song.type, playable: false, source: null });
  }
  return checks;
}

function renderReport(candidate, checks, seasonKey) {
  const byId = new Map(checks.map(check => [`${check.anilistId}|${check.type}`, check]));
  const passed = checks.filter(check => check.playable).length;
  const translated = candidate.selected.filter(show => show.animeCN).length;
  const covered = candidate.selected.filter(show => /^https:\/\//.test(show.coverUrl || '')).length;
  const ready = passed === 30 && translated === 15 && covered === 15;
  const rows = candidate.selected.flatMap(show => show.songs.map(song => {
    const check = byId.get(`${song.anilistId}|${song.type}`);
    const match = check?.matchedTitle ? `${check.matchedTitle}${check.matchedArtist ? ` — ${check.matchedArtist}` : ''} (${check.score})` : '未匹配';
    return `| ${show.animeCN || show.anime} | ${song.type} | ${song.title} | ${song.artist} | ${check?.source || '未验证'} | ${match} |`;
  }));
  return [
    `# ${seasonKey} 季度曲库一键更新检查`, '',
    `- AniList/AnimeThemes 候选：${candidate.selected.length}/15 部，${candidate.selected.reduce((sum, show) => sum + show.songs.length, 0)} 首。`,
    `- Bangumi 中文番名：${translated}/${candidate.selected.length} 部精确匹配；AniList HTTPS 封面：${covered}/${candidate.selected.length} 部。`,
    `- 音源可用性：${passed}/${checks.length} 首通过三源自动匹配（iTunes/B 站探测音频地址；YouTube 确认视频允许嵌入）。匹配项和分数见表。`,
    `- 发布状态：${ready ? '准备运行测试并写入本地季度曲库' : '未发布；请检查缺项后再运行'}.`,
    '', '| 番剧 | 类型 | 歌曲 | 歌手 | 通过音源 | 命中结果与分数 |', '|---|---|---|---|---|---|', ...rows, ''
  ].join('\n');
}

function writeAtomic(file, content) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, file);
}

function runNpm(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32'
  });
  return result.status ?? 1;
}

function seasonArgs() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };
  const local = currentLocalSeason();
  const year = Number(get('--year', String(local.year)));
  const season = get('--season', local.season);
  const months = { winter: '01', spring: '04', summer: '07', fall: '10' };
  if (!Number.isInteger(year) || !months[season]) throw new Error('用法：node scripts/update-season.mjs [--year 2026 --season fall]');
  return { year, season, key: `${year}-${months[season]}` };
}

async function main() {
  const { year, season, key } = seasonArgs();
  const poolPath = path.join(ROOT, 'seasonal-pools.js');
  const coverPath = path.join(ROOT, 'seasonal-covers.js');
  const poolSource = fs.readFileSync(poolPath, 'utf8');
  const coverSource = fs.readFileSync(coverPath, 'utf8');
  const poolsParsed = parseExport(poolSource, 'SEASONAL_POOLS');
  const coversParsed = parseExport(coverSource, 'SEASONAL_COVERS');
  if (Object.hasOwn(poolsParsed, key)) throw new Error(`${key} 已存在于正式曲库，无需更新；为保护已发布曲库，本次未写入任何内容。`);

  const candidateBase = path.join(ROOT, 'candidates', key);
  fs.mkdirSync(path.dirname(candidateBase), { recursive: true });
  const discover = spawnSync(process.execPath, [path.join(ROOT, 'scripts/fetch-season.mjs'), '--year', String(year), '--season', season, '--out', candidateBase], {
    cwd: ROOT, stdio: 'inherit', windowsHide: true
  });
  if (discover.status !== 0) throw new Error('AniList/AnimeThemes 候选生成失败，请检查网络后重试。');
  const candidatePath = `${candidateBase}.json`;
  const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  if (!candidate.complete) throw new Error(`候选不完整（${candidate.selected?.length || 0}/15 部），未发布。详情：candidates/${key}.md`);

  console.log('\n[1/3] 通过 Bangumi 精确匹配中文番名…');
  const chineseNames = {};
  for (const show of candidate.selected) {
    chineseNames[show.anilistId] = await lookupBangumiName(show);
    show.animeCN = chineseNames[show.anilistId];
    for (const song of show.songs) song.animeCN = show.animeCN;
    console.log(`  ${show.animeCN ? '✓' : '✗'} ${show.anime} → ${show.animeCN || '未找到精确中文名'}`);
  }

  console.log('\n[2/3] 验证歌曲来源和音频地址…');
  await startLocalProxyIfNeeded();
  const checks = await verifyAudio(candidate.selected.flatMap(show => show.songs));
  candidate.audioChecks = checks;
  candidate.generatedAt = new Date().toISOString();
  const report = renderReport(candidate, checks, key);
  fs.writeFileSync(`${candidateBase}.json`, JSON.stringify(candidate, null, 2) + '\n');
  fs.writeFileSync(`${candidateBase}.md`, report);

  const missingNames = candidate.selected.filter(show => !show.animeCN);
  const missingCovers = candidate.selected.filter(show => !/^https:\/\//.test(show.coverUrl || ''));
  const missingAudio = checks.filter(check => !check.playable);
  if (missingNames.length || missingCovers.length || missingAudio.length) {
    const reasons = [
      missingNames.length && `${missingNames.length} 部没有 Bangumi 精确中文名`,
      missingCovers.length && `${missingCovers.length} 部缺少 AniList HTTPS 封面`,
      missingAudio.length && `${missingAudio.length} 首没有通过来源匹配和音频地址检查`
    ].filter(Boolean).join('；');
    throw new Error(`自动检查未全部通过（${reasons}），正式曲库保持不变。请查看 candidates/${key}.md。`);
  }

  const prepared = prepareSeasonForPublish(candidate, key, chineseNames, checks);
  const merged = mergeSeasonData(poolsParsed, coversParsed, key, prepared);
  const poolMatch = poolSource.match(/(export const SEASONAL_POOLS = )(\{[\s\S]*\})(;\s*)$/);
  const coverMatch = coverSource.match(/(export const SEASONAL_COVERS = )(\{[\s\S]*\})(;\s*)$/);
  if (!poolMatch || !coverMatch) throw new Error('无法安全定位季度数据块，未发布。');
  const nextPoolSource = `${poolMatch[1]}${JSON.stringify(merged.pools, null, 2)}${poolMatch[3]}`;
  const nextCoverSource = `${coverMatch[1]}${JSON.stringify(merged.covers, null, 4)}${coverMatch[3]}`;

  console.log('\n[3/3] 暂存曲库，运行完整测试和校验…');
  try {
    writeAtomic(poolPath, nextPoolSource);
    writeAtomic(coverPath, nextCoverSource);
  } catch (error) {
    writeAtomic(poolPath, poolSource);
    writeAtomic(coverPath, coverSource);
    throw error;
  }
  const testStatus = runNpm(['test']);
  const validateStatus = runNpm(['run', 'validate']);
  if (testStatus !== 0 || validateStatus !== 0) {
    writeAtomic(poolPath, poolSource);
    writeAtomic(coverPath, coverSource);
    throw new Error(`发布校验失败（npm test=${testStatus}, npm run validate=${validateStatus}）；已恢复正式曲库文件。`);
  }

  console.log(`\n✅ ${key} 已加入本地季度曲库：15 部番剧、30 首歌曲。`);
  fs.appendFileSync(`${candidateBase}.md`, '\n测试结果：`npm test` 通过；`npm run validate` 通过。\n');
  console.log('候选和逐首自动音源检查记录：candidates/' + key + '.md');
  console.log('本脚本只更新本地文件，不会提交或推送到 GitHub/Vercel。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`\n❌ ${error.message}`); process.exitCode = 1; })
    .finally(() => { if (startedProxy && startedProxy.exitCode === null) startedProxy.kill(); });
}
