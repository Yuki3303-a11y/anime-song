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
//   2. 打开游戏 → 设置 → B站代理地址填：http://localhost:8765 → 保存
//   3. 开始游戏即可（也可让游戏自动探测，默认就会优先用本代理）
//
// 依赖：仅 Node.js 内置模块，无需安装任何东西。
// ============================================================
import http from 'node:http';
import https from 'node:https';

const PORT = 8765;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://www.bilibili.com/';
const API_BASE = 'https://api.bilibili.com';
const TIMEOUT = 12000;

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
                try { resolve(JSON.parse(buf)); }
                catch { reject(new Error('B站响应解析失败')); }
            });
        });
        req.setTimeout(TIMEOUT, () => req.destroy(new Error('B站请求超时')));
        req.on('error', reject);
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
    const data = await biliJson('/x/web-interface/search/type?search_type=video&keyword=' + encodeURIComponent(keyword) + '&page=1');
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
function pipeStream(res, audioUrl, req) {
    let target;
    try { target = new URL(audioUrl); }
    catch { res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ error: 'bad stream url' })); return; }
    const mod = target.protocol === 'https:' ? https : http;
    // 转发 Range header（浏览器 <audio> 播放时会发分段请求）
    const upstreamHeaders = { 'User-Agent': UA, 'Referer': REFERER, 'Accept': '*/*' };
    if (req?.headers?.range) upstreamHeaders['Range'] = req.headers.range;
    const upstream = mod.get({
        hostname: target.hostname,
        path: target.pathname + target.search,
        headers: upstreamHeaders
    }, u => {
        if (u.statusCode >= 400) {
            res.writeHead(u.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'upstream ' + u.statusCode }));
            return;
        }
        // 传递上游状态码（200 完整内容 / 206 分段内容）和相关 header
        const respHeaders = {
            'Content-Type': 'audio/mp4',  // B站 CDN 有时返回 application/octet-stream，强制 audio/mp4
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
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: '音频源拉取失败' }));
        } else { res.end(); }
    });
}

// ---------- HTTP 服务 ----------
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost:' + PORT);
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
            pipeStream(res, decodeURIComponent(streamParam), req);
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

server.listen(PORT, () => {
    console.log('============================================');
    console.log('  B站本地代理已启动');
    console.log(`  地址：http://localhost:${PORT}`);
    console.log('  游戏设置里把 B站代理地址填成这个地址即可');
    console.log('  关闭本窗口 = 停止代理');
    console.log('============================================');
});
