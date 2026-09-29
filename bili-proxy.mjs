// ============================================================
// B站本地音频代理（萌豚挑战专用）
// ------------------------------------------------------------
// 为什么需要它：
//   项目部署在 Vercel 的代理（境外服务器）取 B站音频流时会被
//   B站风控（返回 no audio stream），导致"仅B站"模式全部失败。
//   本脚本在你自己电脑上运行，从你的网络直接访问 B站，
//   不会被风控，游戏即可正常播放 B站音频。
//
// 使用方法：
//   1. 双击运行"启动B站代理.bat"（或命令行 node bili-proxy.mjs）
//   2. 打开游戏 → 设置 → B站代理地址填：http://127.0.0.1:8765 → 保存
//   3. 开始游戏即可（也可让游戏自动探测，默认就会优先用本代理）
//
// 依赖：仅 Node.js 内置模块，无需安装任何东西。
// ============================================================
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PORT = 8765;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://www.bilibili.com/';
const API_BASE = 'https://api.bilibili.com';
const TIMEOUT = 12000;
const STREAM_HOST_SUFFIXES = ['.bilivideo.com', '.akamaized.net', '.mcdn.bilivideo.cn'];
const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];
const FALLBACK_IMG = '7cd084941338484aae1ad9425b84077c';
const FALLBACK_SUB = '4932caff0ff746eab6f01bf08b70ac45';
let cachedWbiKeys = null;

function isAllowedStreamUrl(url) {
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (!url.port || url.port === '443') && !url.username && !url.password &&
        STREAM_HOST_SUFFIXES.some(suffix => host === suffix.slice(1) || host.endsWith(suffix));
}

// ---------- B站 API 请求（JSON） ----------
function biliJson(pathWithQuery) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_BASE + pathWithQuery);
        const req = https.get({
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers: { 'User-Agent': UA, 'Referer': REFERER, 'Accept': 'application/json, text/plain, */*' }
        }, res => {
            let buf = '';
            res.on('data', d => { buf += d; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    const error = new Error(`B站 HTTP ${res.statusCode}`);
                    error.statusCode = res.statusCode;
                    reject(error);
                    return;
                }
                try {
                    const data = JSON.parse(buf);
                    if (data.code !== undefined && data.code !== 0) {
                        const error = new Error(`B站 API 错误 ${data.code}: ${data.message || ''}`);
                        error.biliCode = data.code;
                        reject(error);
                        return;
                    }
                    resolve(data);
                } catch { reject(new Error('B站响应解析失败')); }
            });
        });
        req.setTimeout(TIMEOUT, () => req.destroy(new Error('B站请求超时')));
        req.on('error', reject);
    });
}

function getMixinKey(raw) {
    return MIXIN_KEY_ENC_TAB.map(i => raw[i]).join('').slice(0, 32);
}

function buildWbiQuery(params, mixinKey, nowSeconds = Math.floor(Date.now() / 1000)) {
    const all = { ...params, wts: String(nowSeconds) };
    const query = Object.keys(all).sort().map(key => {
        const value = String(all[key]).replace(/[!'()*]/g, '');
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }).join('&');
    const wRid = crypto.createHash('md5').update(query + mixinKey).digest('hex');
    return `${query}&w_rid=${wRid}`;
}

function isRetriable(error) {
    const message = error?.message || '';
    return error?.statusCode === 412 || error?.statusCode === 429 ||
        error?.biliCode === -412 || error?.biliCode === -799 ||
        /超时|ECONNRESET|socket hang up|EAI_AGAIN/.test(message);
}

async function withRetry(fn, options = {}) {
    const maxRetries = options.maxRetries ?? 2;
    const delay = options.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try { return await fn(); }
        catch (error) {
            lastError = error;
            if (!isRetriable(error) || attempt === maxRetries) break;
            await delay(300 * (attempt + 1));
        }
    }
    throw lastError;
}

async function getWbiKeys(forceRefresh = false) {
    if (cachedWbiKeys && !forceRefresh) return cachedWbiKeys;
    try {
        const nav = await biliJson('/x/web-interface/nav');
        const wbi = nav?.data?.wbi_img;
        if (!wbi?.img_url || !wbi?.sub_url) throw new Error('WBI keys unavailable');
        cachedWbiKeys = {
            img: wbi.img_url.split('/').pop().split('.')[0],
            sub: wbi.sub_url.split('/').pop().split('.')[0]
        };
    } catch {
        cachedWbiKeys = { img: FALLBACK_IMG, sub: FALLBACK_SUB };
    }
    return cachedWbiKeys;
}

async function signedBiliJson(path, params) {
    return withRetry(async () => {
        const keys = await getWbiKeys();
        const mixinKey = getMixinKey(keys.img + keys.sub);
        return biliJson(`${path}?${buildWbiQuery(params, mixinKey)}`);
    });
}

function getCid(bvid) {
    return biliJson('/x/web-interface/view?bvid=' + encodeURIComponent(bvid));
}

async function getAudioStream(bvid) {
    const info = await getCid(bvid);
    const cid = info?.data?.cid;
    if (!cid) throw new Error('视频不存在或没有 cid');
    const duration = info?.data?.duration || 0;
    const title = info?.data?.title || '';
    // 优先 DASH 音频（fnval=16），失败再退回 mp4 音频轨（fnval=1 durl）
    let play = await biliJson(`/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&fnval=16&fnver=0&fourk=1`);
    let audio = (play?.data?.dash?.audio || []).sort((a, b) => b.id - a.id)[0];
    if (audio?.baseUrl) {
        return { url: audio.baseUrl, backupUrl: audio.backupUrl?.[0] || null, duration, title };
    }
    // durl 模式：取最大清晰度音轨
    play = await biliJson(`/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&fnval=1`);
    const durl = (play?.data?.durl || []).sort((a, b) => (b.size || 0) - (a.size || 0))[0];
    if (durl?.url) {
        return { url: durl.url, backupUrl: durl.backup_url?.[0] || null, duration, title };
    }
    throw new Error('没有可用的音频流');
}

// ---------- B站视频搜索 ----------
async function searchBilibili(keyword) {
    const data = await signedBiliJson('/x/web-interface/wbi/search/type', {
        search_type: 'video', keyword, page: '1'
    });
    return parseSearchResults(data);
}

function parseSearchResults(data) {
    const list = data?.data?.result || [];
    return list.map(r => {
        let dur = 0;
        if (r.duration) {
            const p = String(r.duration).split(':');
            dur = parseInt(p[0]) * 60 + parseInt(p[1] || '0');
        }
        return {
            bvid: r.bvid,
            title: (r.title || '').replace(/<[^>]+>/g, ''),
            author: r.author,
            play: r.play,
            duration: dur,
            cover: r.pic ? (r.pic.startsWith('//') ? 'https:' + r.pic : r.pic) : ''
        };
    }).filter(r => r.bvid);
}

// ---------- 流式转发 B站 CDN 音频（解决 Referer 校验，支持 Range 分段请求） ----------
function pipeStream(res, audioUrl, req, backupUrl = null, transport = https) {
    const candidates = [audioUrl, backupUrl].filter(Boolean);
    const targets = [];
    for (const candidate of candidates) {
        let target;
        try { target = new URL(candidate); }
        catch {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'bad stream url' }));
            return;
        }
        if (!isAllowedStreamUrl(target)) {
            res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'stream host not allowed' }));
            return;
        }
        targets.push(target);
    }

    const requestTarget = index => {
        const target = targets[index];
        const upstreamHeaders = { 'User-Agent': UA, 'Referer': REFERER, 'Accept': '*/*' };
        if (req?.headers?.range) upstreamHeaders.Range = req.headers.range;
        const upstream = transport.get({
            hostname: target.hostname,
            path: target.pathname + target.search,
            headers: upstreamHeaders
        }, u => {
            if (u.statusCode >= 400) {
                u.resume?.();
                if (index + 1 < targets.length && !res.headersSent) return requestTarget(index + 1);
                res.writeHead(u.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'upstream ' + u.statusCode }));
                return;
            }
            const upstreamType = u.headers['content-type'];
            const respHeaders = {
                'Content-Type': !upstreamType || upstreamType === 'application/octet-stream' ? 'audio/mp4' : upstreamType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*'
            };
            if (u.headers['content-length']) respHeaders['Content-Length'] = u.headers['content-length'];
            if (u.headers['content-range']) respHeaders['Content-Range'] = u.headers['content-range'];
            res.writeHead(u.statusCode, respHeaders);
            u.pipe(res);
        });
        upstream.setTimeout(15000, () => upstream.destroy(new Error('音频源连接超时')));
        upstream.on('error', () => {
            if (index + 1 < targets.length && !res.headersSent) return requestTarget(index + 1);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: '音频源拉取失败' }));
            } else { res.end(); }
        });
    };
    requestTarget(0);
}

// ---------- HTTP 服务 ----------
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const json = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
    };

    try {
        // 1) 音频流转发：/stream?url= 或 /api/search?stream=
        const streamParam = url.pathname === '/stream' ? url.searchParams.get('url') : url.searchParams.get('stream');
        if (streamParam) {
            pipeStream(res, streamParam, req, url.searchParams.get('backup'));
            return;
        }

        // 2) B站视频搜索：/api/search?q=...
        const q = url.searchParams.get('q');
        if (q) {
            const results = await searchBilibili(q);
            json(200, { results });
            return;
        }

        // 3) 音频取流：/api/search?bvid=...
        const bvid = url.searchParams.get('bvid');
        if (bvid) {
            const audio = await getAudioStream(bvid);
            json(200, { url: audio.url, backupUrl: audio.backupUrl, duration: audio.duration, title: audio.title });
            return;
        }

        json(400, { error: 'missing q or bvid' });
    } catch (e) {
        json(502, { error: e.message || 'proxy error' });
    }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    server.listen(PORT, '127.0.0.1', () => {
        console.log('============================================');
        console.log('  B站本地代理已启动');
        console.log(`  地址：http://127.0.0.1:${PORT}`);
        console.log('  游戏设置里把 B站代理地址填成这个地址即可');
        console.log('  关闭本窗口 = 停止代理');
        console.log('============================================');
    });
}

export { buildWbiQuery, getMixinKey, parseSearchResults, pipeStream, withRetry };
