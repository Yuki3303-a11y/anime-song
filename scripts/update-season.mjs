#!/usr/bin/env node
import { DEFAULT_SEASON_ANIME } from './fetch-season.mjs';
// One-click local seasonal update. Publishes only complete, metadata-enriched,
// source-checked pools, then runs the project's full tests and validators.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { audioSearchQueries, rankAudioCandidates } from '../audio-selection.mjs';
import { currentLocalSeason, mergeSeasonData, prepareSeasonForPublish } from './season-updater-tools.mjs';
import { discoverBangumiSeason } from './bangumi-season.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BILI = 'https://anime-song-gamma.vercel.app';
const REQUEST_TIMEOUT = 12000;
const FAST_SCAN_MS = 12000;
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
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  try {
    const response = await fetch(url, { ...options, signal });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally { clearTimeout(timer); }
}

const rankForPublish = (song, candidates) => rankAudioCandidates(song, candidates, { requireRelation: true });

async function verifyPreview(previewUrl, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(previewUrl, { headers: { Range: 'bytes=0-0' },
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal });
    await response.body?.cancel();
    return response.ok && /^(audio\/|video\/mp4)/i.test(response.headers.get('content-type') || '');
  } catch { return false; }
  finally { clearTimeout(timer); }
}

async function searchItunes(song, signal, evidence) {
  for (const term of audioSearchQueries(song).itunes) {
    if (signal.aborted) break;
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=15&country=JP`;
      const data = await fetchJson(url, { headers: { Accept: 'application/json' }, signal });
      evidence.searched = true;
      const candidates = (data.results || []).filter(item => item.previewUrl).map(item => ({
        source: 'itunes', url: item.previewUrl, title: item.trackName || '',
        artist: item.artistName || '', album: item.collectionName || ''
      }));
      for (const candidate of rankForPublish(song, candidates).slice(0, 3)) {
        evidence.matched = true;
        if (await verifyPreview(candidate.url, signal)) return {
          anilistId: song.anilistId, type: song.type, playable: true, source: 'itunes',
          url: candidate.url,
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

async function searchYouTube(song, signal, evidence) {
  const keys = youtubeApiKeys();
  const exhausted = new Set();
  if (!keys.length) return null;
  for (const query of audioSearchQueries(song).youtube) {
    for (const [keyIndex, key] of keys.entries()) {
      if (signal.aborted) return null;
      if (exhausted.has(keyIndex)) continue;
      try {
        const params = new URLSearchParams({
          part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '10', q: query, key
        });
        const found = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal });
        evidence.searched = true;
        const items = (found.items || []).filter(item => item.id?.videoId);
        if (!items.length) break;
        const ids = items.map(item => item.id.videoId);
        const detailParams = new URLSearchParams({ part: 'status', id: ids.join(','), key });
        if (rankForPublish(song, items.map(item => ({ source: 'youtube', title: item.snippet?.title,
          artist: item.snippet?.channelTitle }))).length) evidence.matched = true;
        const details = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`, { signal });
        const embeddable = new Set((details.items || []).filter(item => item.status?.embeddable).map(item => item.id));
        const ranked = rankForPublish(song, items.filter(item => embeddable.has(item.id.videoId)).map(item => ({
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

async function checkStream(url, base, backupUrl, signal, notes) {
  const streamUrl = new URL('/api/search', base);
  streamUrl.searchParams.set('stream', url);
  if (backupUrl) streamUrl.searchParams.set('backup', backupUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(streamUrl, { headers: { Range: 'bytes=0-0' },
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal });
    if (notes && !response.ok) {
      const problem = await response.json().catch(() => ({}));
      notes.push(problem.error === 'stream host not allowed' ? '音频线路被代理拒绝' : `音频请求失败（HTTP ${response.status}）`);
      return false;
    }
    await response.body?.cancel();
    return response.ok && /^(audio\/|video\/mp4)/i.test(response.headers.get('content-type') || '');
  } catch { notes?.push('音频请求超时或连接中断'); return false; }
  finally { clearTimeout(timer); }
}

const LOCAL_BILI = 'http://127.0.0.1:8765';

async function localBiliReady() {
  try {
    const response = await fetch(`${LOCAL_BILI}/api/search`, { signal: AbortSignal.timeout(800) });
    return response.status === 400 && (await response.json()).error === 'missing q or bvid';
  } catch { return false; }
}

async function biliBases() {
  const bases = [];
  if (await localBiliReady()) bases.push(LOCAL_BILI);
  const configured = process.env.BILI_WORKER_URL?.replace(/\/$/, '');
  if (configured && !bases.includes(configured)) bases.push(configured);
  if (!bases.includes(DEFAULT_BILI)) bases.push(DEFAULT_BILI);
  return bases;
}

async function startLocalProxyIfNeeded() {
  if (await localBiliReady()) return;
  startedProxy = spawn(process.execPath, [path.join(ROOT, 'bili-proxy.mjs')], {
    cwd: ROOT, stdio: 'ignore', windowsHide: true
  });
  for (let attempt = 0; attempt < 20; attempt++) {
    if (startedProxy.exitCode !== null) break;
    await nap(500);
    if (await localBiliReady()) {
      console.log('已临时启动本地 B 站代理，用于歌曲验证。');
      return;
    }
  }
  startedProxy.kill();
  startedProxy = null;
  console.warn('本地 B 站代理未能启动，将尝试其他代理和音源。');
}

async function searchBilibili(song, bases, signal, evidence) {
  for (const base of bases) for (const query of audioSearchQueries(song).bilibili) {
    if (signal.aborted) return null;
    try {
      const data = await fetchJson(`${base}/api/search?q=${encodeURIComponent(query)}`, { signal });
      evidence.searched = true;
      const candidates = (data.results || []).filter(item => item.bvid && item.duration >= 25 && item.duration <= 600)
        .map(item => ({ source: 'bilibili', bvid: item.bvid, title: item.title || '', artist: item.author || '', album: '' }));
      for (const candidate of rankForPublish(song, candidates).slice(0, 3)) {
        evidence.matched = true;
        try {
          const audio = await fetchJson(`${base}/api/search?bvid=${encodeURIComponent(candidate.bvid)}`, { signal });
          if (audio.url && await checkStream(audio.url, base, audio.backupUrl, signal))
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

export async function verifyManualAudio(link, bases, notes = []) {
  let url;
  try { url = new URL(link); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname;
  const videoId = host === 'youtu.be' ? url.pathname.slice(1) :
    ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)
      ? url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1] : null;
  if (/^[\w-]{11}$/.test(videoId || '')) {
    for (const key of youtubeApiKeys()) {
      try {
        const params = new URLSearchParams({ part: 'status', id: videoId, key });
        const data = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${params}`);
        return data.items?.[0]?.status?.embeddable ? { source: 'youtube', videoId } : null;
      } catch { /* try the next configured key */ }
    }
  }
  const bvid = ['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(host)
    ? url.pathname.match(/^\/video\/(BV[\w]{10})(?:\/|$)/)?.[1] : null;
  if (bvid) for (const base of bases) {
    try {
      const audio = await fetchJson(`${base}/api/search?bvid=${bvid}`);
      if (audio.url && await checkStream(audio.url, base, audio.backupUrl, undefined, notes)) return { source: 'bilibili', bvid };
      if (!audio.url) notes.push('视频已识别，但未返回音频线路');
    } catch (error) {
      notes.push(error.status ? `获取音频线路失败（HTTP ${error.status}）` : '连接代理超时或中断');
    }
  }
  if (host.endsWith('.itunes.apple.com') && await verifyPreview(url.href)) return { source: 'itunes', url: url.href };
  return null;
}

const sourceLabel = { bilibili: 'B 站', youtube: 'YouTube', itunes: 'iTunes' };
const typeLabel = { OP: '片头曲（OP）', ED: '片尾曲（ED）' };
const statusLabel = {
  metadata: '缺歌曲资料', identity: '需核对番剧条目 ID', title: '歌名需要人工确认',
  stream: '有匹配候选，播放检查未通过', timeout: '快查超时，可重试',
  network: '音源服务未响应，可重试', missing: '未找到可信音源'
};

function withSearchAlias(song) {
  // The listing also spells out the currency symbols in Japanese.
  if (song.title.normalize('NFKC').replace(/\s/g, '') === '$・¥・€' &&
      /Aina Suzuki/i.test(song.artist)) return { ...song, titleCN: 'ドル・エン・ユーロ' };
  return song;
}

export async function findVerifiedAudio(song, getBases) {
  song = withSearchAlias(song);
  if (![song.title, song.titleCN].some(title =>
    String(title || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '').length >= 2)) return { reason: 'title' };
  const controller = new AbortController();
  const signal = controller.signal;
  const evidence = {};
  let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve({ reason: evidence.matched ? 'stream' : 'timeout' }), FAST_SCAN_MS); });
  const checks = [
    searchItunes(song, signal, evidence),
    getBases().then(bases => searchBilibili(song, bases, signal, evidence)),
    searchYouTube(song, signal, evidence)
  ];
  try {
    return await Promise.race([deadline, Promise.any(checks.map(async check => {
      const result = await check;
      if (!result) throw new Error('no verified match');
      return { check: result };
    })).catch(() => ({ reason: evidence.matched ? 'stream' : evidence.searched ? 'missing' : 'network' }))]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function scanCandidateLinks(candidate, rows, getBases, onResult) {
  const tasks = [];
  const results = [];
  for (const row of rows) {
    const media = candidate.media.find(item => item.id === row.mediaId);
    const theme = candidate.themes[row.mediaId];
    const name = row.animeCN || row.original;
    if (!media) { results.push({ label: name, reason: 'identity' }); continue; }
    for (const type of ['OP', 'ED']) {
      const details = row.draft?.[type]?.details || theme?.songs[type];
      if (!details) { results.push({ label: `${name}｜${typeLabel[type]}`, reason: 'metadata' }); continue; }
      const song = { ...details, type, anilistId: media.id, anime: theme?.name || media.title.romaji,
        animeCN: name, animeNative: media.title.native };
      const label = `${name}｜${typeLabel[type]} ${song.title} — ${song.artist}`;
      const draft = row.draft?.[type];
      if (onResult && (draft?.check || draft?.scanReason)) {
        results.push({ label, check: draft.check, reason: draft.scanReason });
      } else if (details.manual) {
        results.push({ label, reason: 'title' });
      } else tasks.push({ row, type, details, song, label });
    }
  }
  let cursor = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      const result = await findVerifiedAudio(task.song, getBases);
      results.push({ label: task.label, ...result });
      onResult?.(task, result);
      console.log(`[${++done}/${tasks.length}] ${task.label}：${result.check ? sourceLabel[result.check.source] : statusLabel[result.reason]}`);
    }
  }));
  console.log(`\n批量检查通过 ${results.filter(item => item.check).length} 首。待处理项：`);
  for (const item of results.filter(item => !item.check))
    console.log(`- ${item.label}：${statusLabel[item.reason]}`);
  return results.filter(item => !item.check);
}

function renderReport(candidate, checks, seasonKey) {
  const byId = new Map(checks.map(check => [`${check.anilistId}|${check.type}`, check]));
  const passed = candidate.selected.flatMap(show => show.songs)
    .filter(song => byId.get(`${song.anilistId}|${song.type}`)?.playable).length;
  const translated = candidate.selected.filter(show => show.animeCN).length;
  const covered = candidate.selected.filter(show => /^https:\/\//.test(show.coverUrl || '')).length;
  const ready = passed === DEFAULT_SEASON_ANIME * 2 && translated === DEFAULT_SEASON_ANIME && covered === DEFAULT_SEASON_ANIME;
  const cell = value => String(value || '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const rows = candidate.selected.flatMap(show => show.songs.map(song => {
    const check = byId.get(`${song.anilistId}|${song.type}`);
    const match = check?.matchedTitle ? `${check.matchedTitle}${check.matchedArtist ? ` — ${check.matchedArtist}` : ''}${check.score == null ? '' : ` (${check.score})`}` : '未匹配';
    const link = check?.reviewUrl || (check?.videoId ? `https://www.youtube.com/watch?v=${check.videoId}` :
      check?.bvid ? `https://www.bilibili.com/video/${check.bvid}` : check?.url);
    return `| ${[show.animeCN || show.anime, song.type, song.title, song.artist, check?.source || '未验证', match,
      link ? `<${encodeURI(link)}>` : ''].map(cell).join(' | ')} |`;
  }));
  return [
    `# ${seasonKey} 季度曲库一键更新检查`, '',
    `- AniList/AnimeThemes 候选：${candidate.selected.length}/${DEFAULT_SEASON_ANIME} 部，${candidate.selected.reduce((sum, show) => sum + show.songs.length, 0)} 首。`,
    `- Bangumi 中文名或人工确认显示名：${translated}/${candidate.selected.length} 部；HTTPS 封面：${covered}/${candidate.selected.length} 部。`,
    `- 音源检查：${passed}/${DEFAULT_SEASON_ANIME * 2} 首。自动结果需要歌名与番剧或歌手证据。人工结果由用户试听确认，脚本检查链接。`,
    `- 发布状态：${ready ? '准备运行测试并写入本地季度曲库' : '未发布；请检查缺项后再运行'}.`,
    '', '| 番剧 | 类型 | 歌曲 | 歌手 | 通过音源 | 命中结果与分数 | 试听链接 |', '|---|---|---|---|---|---|---|', ...rows,
    '', '## 最近批量检查的待处理项',
    ...(candidate.scanPending || []).map(item => `- ${item.label}：${statusLabel[item.reason]}`),
    '', '## 顺延补位', ...candidate.skipped.map(show => `- #${show.rank} ${show.original}（Bangumi ${show.bangumiId}）`), ''
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

  const candidateBase = path.join(ROOT, 'candidates', `${key}-bangumi`);
  fs.mkdirSync(path.dirname(candidateBase), { recursive: true });
  const candidatePath = `${candidateBase}.json`;
  console.log(`[${key}] 读取复核进度或查询 Bangumi 当季 TV 热度榜…`);
  const candidate = fs.existsSync(candidatePath) ? JSON.parse(fs.readFileSync(candidatePath, 'utf8')) :
    await discoverBangumiSeason(year, season);
  let basesPromise;
  const getBases = () => basesPromise ||= (async () => {
      await startLocalProxyIfNeeded();
      return biliBases();
  })();
  const auditFlag = process.argv.indexOf('--check-links');
  if (auditFlag !== -1) {
    const arg = process.argv[auditFlag + 1];
    const count = arg && !arg.startsWith('--') ? Number(arg) : 8;
    if (!Number.isInteger(count) || count < 1 || count > DEFAULT_SEASON_ANIME) throw new Error(`抽查部数须为 1 到 ${DEFAULT_SEASON_ANIME}。`);
    console.log(`抽查榜单前 ${count} 部。只检查音源，不改复核进度。`);
    await scanCandidateLinks(candidate, candidate.queue.slice(0, count), getBases);
    return;
  }
  candidate.targetAnime = DEFAULT_SEASON_ANIME;
  const checks = candidate.audioChecks;
  const reportPath = `${candidateBase}.md`;
  if (process.argv.includes('--retry-skipped')) {
    console.log(`已将 ${candidate.skipped.length} 部跳过的番剧放回复核队列，保留已完成曲目。`);
    candidate.skipped = [];
  } else if (candidate.skipped.length) {
    console.log(`有 ${candidate.skipped.length} 部已跳过。如需补回，可加 --retry-skipped 再运行。`);
  }
  const save = () => {
    candidate.complete = candidate.selected.length === DEFAULT_SEASON_ANIME;
    writeAtomic(candidatePath, JSON.stringify(candidate, null, 2) + '\n');
    writeAtomic(reportPath, renderReport(candidate, checks, key));
  };
  save();
  console.log(`已取得 ${candidate.queue.length} 部候选，当前完成 ${candidate.selected.length}/${DEFAULT_SEASON_ANIME}。报告：${reportPath}`);
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const lines = input[Symbol.asyncIterator]();
  const ask = async prompt => {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done || value.trim().toLowerCase() === '/quit') throw new Error('已保存复核进度。');
    return value.trim();
  };
  try {
    const pendingRows = candidate.queue.filter(row =>
      !candidate.selected.some(show => show.bangumiId === row.bangumiId) &&
      !candidate.skipped.some(show => show.bangumiId === row.bangumiId)).slice(0, DEFAULT_SEASON_ANIME - candidate.selected.length);
    const saveScan = ({ row, type, details }, result) => {
      row.draft ||= {};
      row.draft[type] = { details, check: result.check, scanReason: result.reason };
      save();
    };
    if (pendingRows.length) {
      console.log(`先批量检查接下来的 ${pendingRows.length} 部，每首最多 ${FAST_SCAN_MS / 1000} 秒，两首并行。`);
      candidate.scanPending = await scanCandidateLinks(candidate, pendingRows, getBases, saveScan);
      save();
      if (pendingRows.some(row => Object.values(row.draft || {}).some(item => item.scanReason))) {
        const action = await ask('按回车进入逐项补填，输入 R 只重试未通过的歌曲，或输入 /quit 保存退出：');
        if (action.toLowerCase() === 'r') {
          for (const row of pendingRows) for (const item of Object.values(row.draft || {})) {
            if (!item.check) delete item.scanReason;
          }
          candidate.scanPending = await scanCandidateLinks(candidate, pendingRows, getBases, saveScan);
          save();
        }
      }
    }
    for (const row of candidate.queue) {
      if (candidate.selected.length === DEFAULT_SEASON_ANIME) break;
      if (candidate.selected.some(show => show.bangumiId === row.bangumiId) ||
          candidate.skipped.some(show => show.bangumiId === row.bangumiId)) continue;
      const skip = () => { candidate.skipped.push({ rank: row.rank, bangumiId: row.bangumiId, original: row.original }); save(); };
      console.log(`\n#${row.rank} ${row.animeCN || row.original} https://bgm.tv/subject/${row.bangumiId}`);
      const mediaFor = id => candidate.media.find(item => item.id === Number(id) &&
        !candidate.selected.some(show => show.anilistId === item.id));
      let media = mediaFor(row.mediaId);
      while (!media) {
        const id = await ask('未能唯一匹配番剧。填同季度 AniList 数字 ID，Enter 跳过，/quit 保存退出：');
        if (!id) break;
        media = /^\d+$/.test(id) && mediaFor(id);
        if (!media) console.log('这个 ID 不在同季度 TV 名单中，或已入选。');
      }
      if (!media) { skip(); continue; }
      row.mediaId = media.id;
      if (!row.animeCN) row.animeCN = await ask('请填中文番名，Enter 使用原名，/quit 退出：') || row.original;
      const theme = candidate.themes[media.id];
      const show = {
        bangumiId: row.bangumiId, rank: row.rank, anime: theme?.name || media.title.romaji,
        animeCN: row.animeCN, animeNative: media.title.native, anilistId: media.id,
        coverUrl: media.coverImage?.large || media.coverImage?.medium || row.coverUrl, songs: []
      };
      if (!/^https:\/\//.test(show.coverUrl || '')) { console.log('缺少封面，已顺延。'); skip(); continue; }
      row.draft ||= {};
      save();
      const accepted = [];
      for (const type of ['OP', 'ED']) {
        let details = row.draft[type]?.details || theme?.songs[type];
        if (!details) {
          const title = await ask(`缺 ${type}。请输入歌名，Enter 跳过这部，/quit 退出：`);
          if (!title) break;
          let artist;
          while (!artist) artist = await ask('歌手：');
          details = { title, artist, manual: true };
        }
        const draft = row.draft[type] ||= { details };
        save();
        const song = { title: details.title, titleCN: details.title, artist: details.artist,
          anime: show.anime, animeCN: show.animeCN, animeNative: show.animeNative,
          type, season: key, anilistId: media.id,
          animethemesUrl: theme?.slug ? `https://animethemes.moe/anime/${theme.slug}` : undefined };
        console.log(`  ${type} ${song.title} — ${song.artist}`);
        if (!draft.check && !draft.scanReason && !details.manual) {
          console.log('    正在自动查找并检查音源…');
          const result = await findVerifiedAudio(song, getBases);
          draft.check = result.check;
          draft.scanReason = result.reason;
          save();
        }
        if (draft.check) console.log(`    已通过：${sourceLabel[draft.check.source]}`);
        while (!draft.check) {
          console.log(`\n需要补链接：${show.animeCN}｜${typeLabel[type]}《${song.title}》— ${song.artist}`);
          if (draft.scanReason) console.log(`自动检查：${statusLabel[draft.scanReason]}`);
          console.log('请在浏览器试听确认版本，复制 B 站视频页面地址（www.bilibili.com/video/BV…）。也可用 YouTube 视频页或 iTunes 试听直链。');
          console.log('粘贴后按回车检查。直接按回车会跳过整部番剧；输入 /quit 会保存进度并退出。');
          const link = await ask('播放链接：');
          if (!link) break;
          console.log('正在检查链接是否能取流或嵌入…');
          const notes = [];
          const source = await verifyManualAudio(link, await getBases(), notes);
          if (!source) {
            console.log(notes.length ? [...new Set(notes)].join('；') : '链接未通过检查。B 站请用展开后的 BV 视频页。');
            continue;
          }
          draft.check = { ...source, anilistId: media.id, type, playable: true, matchedTitle: '人工确认', reviewUrl: link };
          save();
          console.log(`链接已保存：${sourceLabel[source.source]}`);
        }
        if (!draft.check) break;
        accepted.push(draft.check);
        show.songs.push(song);
      }
      if (show.songs.length !== 2) { skip(); continue; }
      checks.push(...accepted);
      candidate.selected.push(show);
      save();
    }
    if (!candidate.complete) throw new Error(`仅完成 ${candidate.selected.length}/${DEFAULT_SEASON_ANIME} 部，已保存，未发布。`);
    console.log(candidate.selected.map(show => `${show.animeCN} | ${show.songs.map(song => `${song.type} ${song.title}`).join(' / ')}`).join('\n'));
    console.log(`逐首检查报告：${reportPath}`);
    if ((await ask('确认加入本地曲库？输入 Y 发布，N 保存退出 [y/N]：')).toLowerCase() !== 'y') {
      throw new Error('已保存，未发布。');
    }
  } finally {
    input.close();
  }

  const chineseNames = Object.fromEntries(candidate.selected.map(show => [show.anilistId, show.animeCN]));
  const prepared = prepareSeasonForPublish(candidate, key, chineseNames, checks);
  const merged = mergeSeasonData(poolsParsed, coversParsed, key, prepared);
  const poolMatch = poolSource.match(/(export const SEASONAL_POOLS = )(\{[\s\S]*\})(;\s*)$/);
  const coverMatch = coverSource.match(/(export const SEASONAL_COVERS = )(\{[\s\S]*\})(;\s*)$/);
  if (!poolMatch || !coverMatch) throw new Error('无法安全定位季度数据块，未发布。');
  const nextPoolSource = `${poolMatch[1]}${JSON.stringify(merged.pools, null, 2)}${poolMatch[3]}`;
  const nextCoverSource = `${coverMatch[1]}${JSON.stringify(merged.covers, null, 4)}${coverMatch[3]}`;
  const appPath = path.join(ROOT, 'app.js');
  const indexPath = path.join(ROOT, 'index.html');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const indexSource = fs.readFileSync(indexPath, 'utf8');
  const bump = (source, pattern) => source.replace(pattern, (_, prefix, version) => prefix + (Number(version) + 1));
  const updates = [
    [poolPath, poolSource, nextPoolSource],
    [coverPath, coverSource, nextCoverSource],
    [appPath, appSource, bump(appSource, /((?:songs|seasonal-pools|seasonal-covers)\.js\?v=)(\d+)/g)],
    [indexPath, indexSource, bump(indexSource, /((?:app\.js|style\.css)\?v=)(\d+)/g)]
  ];
  if (updates.some(([file, before]) => fs.readFileSync(file, 'utf8') !== before))
    throw new Error('曲库文件在复核期间有改动，请重新运行后发布。');

  console.log('\n[3/3] 暂存曲库，运行完整测试和校验…');
  const written = [];
  try {
    for (const [file, before, after] of updates) {
      writeAtomic(file, after);
      written.push([file, before]);
    }
    const testStatus = runNpm(['test']);
    const validateStatus = runNpm(['run', 'validate']);
    if (testStatus !== 0 || validateStatus !== 0) {
      throw new Error(`发布校验失败（npm test=${testStatus}, npm run validate=${validateStatus}）。`);
    }
  } catch (error) {
    for (const [file, before] of written.reverse()) writeAtomic(file, before);
    throw error;
  }

  console.log(`\n✅ ${key} 已加入本地季度曲库：${DEFAULT_SEASON_ANIME} 部番剧、${DEFAULT_SEASON_ANIME * 2} 首歌曲。`);
  fs.appendFileSync(reportPath, '\n已发布到本地。npm test 和 npm run validate 均通过。\n');
  console.log('刷新 http://127.0.0.1:8080/ 查看新季度。');
  console.log('本脚本只更新本地文件，不会提交或推送到 GitHub/Vercel。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const launcher = process.argv.includes('--windows-launcher');
  if (launcher) {
    console.log('=== 萌豚挑战｜季度曲库更新 ===');
    console.log('默认更新本机当前季度。输入 /quit 保存退出，只有在最后输入 Y 才会发布。\n');
  }
  main().catch(error => { console.error(`\n❌ ${error.message}`); process.exitCode = 1; })
    .finally(() => {
      if (startedProxy && startedProxy.exitCode === null) startedProxy.kill();
      if (launcher) console.log('\n按任意键关闭窗口。');
    });
}
