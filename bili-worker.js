// B站 API Proxy Worker for 萌豚挑战
// Deploy: npx wrangler deploy bili-worker.js

const BILI_API = 'https://api.bilibili.com';

// MD5 implementation (Cloudflare Workers don't support MD5 via crypto.subtle)
function md5(str) {
  function r(d, v) { d = ((d + 0x100000000) % 0x100000000) & 0xFFFFFFFF; d += (v || 0); return d < 0 ? (d ^ 0x80000000) + 0x80000000 : d; }
  function ch(x, y, z) { return (x & y) ^ (~x & z); }
  function maj(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
  function s(x, n) { return (x << n) | (x >>> (32 - n)); }
  const b = [];
  for (let i = 0; i < str.length; i++) b.push(str.charCodeAt(i));
  const l = b.length;
  b.push(0x80);
  while (b.length % 64 !== 56) b.push(0);
  for (let i = 0; i < 8; i++) b.push((l * 8) >>> (i * 8) & 0xFF);
  let a0 = 0x67452301, b0 = 0xEFCDAB89, c0 = 0x98BADCFE, d0 = 0x10325476;
  for (let i = 0; i < b.length; i += 64) {
    const w = [];
    for (let j = 0; j < 16; j++) w[j] = b[i + j * 4] | (b[i + j * 4 + 1] << 8) | (b[i + j * 4 + 2] << 16) | (b[i + j * 4 + 3] << 24);
    for (let j = 16; j < 64; j++) { const g = w[j - 15]; w[j] = w[j - 16] + s(g, 7) + s(g, 22) + r(w[j - 7], s(g, 17)); w[j] = r(w[j]); }
    let a = a0, bb = b0, c = c0, d = d0;
    for (let j = 0; j < 64; j++) {
      let f, k;
      if (j < 16) { f = ch(bb, c, d); k = j; }
      else if (j < 32) { f = ch(d, bb, c); k = (5 * j + 1) % 16; }
      else if (j < 48) { f = bb ^ c ^ d; k = (3 * j + 5) % 16; }
      else { f = c ^ (bb | ~d); k = (7 * j) % 16; }
      const t = r(r(r(a, f), w[k]), [0xD76AA478, 0xE8C7B756, 0x242070DB, 0xC1BDCEEE, 0xF57C0FAF, 0x4787C62A, 0xA8304613, 0xFD469501, 0x698098D8, 0x8B44F7AF, 0xFFFF5BB1, 0x895CD7BE, 0x6B901122, 0xFD987193, 0xA679438E, 0x49B40821, 0xF61E2562, 0xC040B340, 0x265E5A51, 0xE9B6C7AA, 0xD62F105D, 0x2441453, 0xD8A1E681, 0xE7D3FBC8, 0x21E1CDE6, 0xC33707D6, 0xF4D50D87, 0x455A14ED, 0xA9E3E905, 0xFCEFA3F8, 0x676F02D9, 0x8D2A4C8A, 0xFFFA3942, 0x8771F681, 0x6D9D6122, 0xFDE5380C, 0xA4BEEA44, 0x4BDECFA9, 0xF6BB4B60, 0xBEBFBC70, 0x289B7EC6, 0xEAA127FA, 0xD4EF3085, 0x4881D05, 0xD9D4D039, 0xE6DB99E5, 0x1FA27CF8, 0xC4AC5665, 0xF4292244, 0x432AFF97, 0xAB9423A7, 0xFC93A039, 0x655B59C3, 0x8F0CCC92, 0xFFEFF47D, 0x85845DD1, 0x6FA87E4F, 0xFE2CE6E0, 0xA3014314, 0x4E0811A1, 0xF7537E82, 0xBD3AF235, 0x2AD7D2BB, 0xEB86D391][j]);
      a = d; d = c; c = s(bb, 30); bb = a; a = r(a, t);
    }
    a0 = r(a0, a); b0 = r(b0, bb); c0 = r(c0, c); d0 = r(d0, d);
  }
  function hex(v) { return ('0' + (v & 0xFF).toString(16)).slice(-2); }
  return hex(a0) + hex(a0 >>> 8) + hex(a0 >>> 16) + hex(a0 >>> 24)
       + hex(b0) + hex(b0 >>> 8) + hex(b0 >>> 16) + hex(b0 >>> 24)
       + hex(c0) + hex(c0 >>> 8) + hex(c0 >>> 16) + hex(c0 >>> 24)
       + hex(d0) + hex(d0 >>> 8) + hex(d0 >>> 16) + hex(d0 >>> 24);
}

// WBI signing
let mixinCache = { key: null, ts: 0 };

async function getMixinKey() {
  const now = Date.now();
  if (mixinCache.key && now - mixinCache.ts < 3600000) return mixinCache.key;
  const res = await fetch(`${BILI_API}/x/web-interface/nav`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.bilibili.com' }
  });
  const data = await res.json();
  const imgUrl = data.data?.wbi_img?.img_url || '';
  const subUrl = data.data?.wbi_img?.sub_url || '';
  const imgKey = imgUrl.split('/').pop().split('.')[0];
  const subKey = subUrl.split('/').pop().split('.')[0];
  mixinCache = { key: imgKey + subKey, ts: now };
  return mixinCache.key;
}

async function signedFetch(path, queryParams = {}) {
  const mixinKey = await getMixinKey();
  const params = { ...queryParams, wts: Math.floor(Date.now() / 1000) };
  const sorted = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
  params.w_rid = md5(sorted + mixinKey);
  const url = `${BILI_API}${path}?${Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(params[k])}`).join('&')}`;
  return fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.bilibili.com' }
  });
}

// CORS headers
function cors(resp) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    ...Object.fromEntries(resp.headers)
  };
  return new Response(resp.body, { status: resp.status, headers });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    try {
      // /search?q=xxx
      if (url.pathname === '/search') {
        const q = url.searchParams.get('q');
        if (!q) return cors(new Response(JSON.stringify({ error: 'missing q param' }), { status: 400 }));

        const resp = await signedFetch('/x/web-interface/search/type', {
          search_type: 'video',
          keyword: q,
          page: url.searchParams.get('page') || '1'
        });
        const data = await resp.json();

        if (data.code !== 0) {
          return cors(new Response(JSON.stringify({ error: data.message || 'search failed', code: data.code }), { status: 502 }));
        }

        const results = (data.data?.result || []).map(r => ({
          bvid: r.bvid,
          title: r.title.replace(/<[^>]+>/g, ''),
          author: r.author,
          play: r.play,
          duration: r.duration ? parseInt(r.duration.split(':').reduce((a, b) => a * 60 + parseInt(b), 0)) : 0,
          cover: r.pic ? (r.pic.startsWith('//') ? 'https:' + r.pic : r.pic) : ''
        }));

        return cors(new Response(JSON.stringify({ results })));
      }

      // /audio?bvid=xxx
      if (url.pathname === '/audio') {
        const bvid = url.searchParams.get('bvid');
        if (!bvid) return cors(new Response(JSON.stringify({ error: 'missing bvid param' }), { status: 400 }));

        // Get video info (cid)
        const infoResp = await signedFetch('/x/web-interface/view', { bvid });
        const infoData = await infoResp.json();
        if (infoData.code !== 0) {
          return cors(new Response(JSON.stringify({ error: infoData.message || 'get video info failed' }), { status: 502 }));
        }
        const cid = infoData.data?.cid;
        const duration = infoData.data?.duration || 0;

        // Get playurl with DASH format (fnval=16 for audio-only streams)
        const playResp = await signedFetch('/x/player/playurl', { bvid, cid: String(cid), fnval: '16', fnver: '0', fourk: '1' });
        const playData = await playResp.json();
        if (playData.code !== 0) {
          return cors(new Response(JSON.stringify({ error: playData.message || 'get playurl failed' }), { status: 502 }));
        }

        // Extract highest quality audio stream
        const dash = playData.data?.dash;
        const audioStreams = (dash?.audio || []).sort((a, b) => b.id - a.id);
        const bestAudio = audioStreams[0];

        if (!bestAudio?.baseUrl) {
          return cors(new Response(JSON.stringify({ error: 'no audio stream found' }), { status: 404 }));
        }

        return cors(new Response(JSON.stringify({
          url: bestAudio.baseUrl,
          backupUrl: bestAudio.backupUrl?.[0] || null,
          duration: duration,
          audioQuality: bestAudio.id
        })));
      }

      return cors(new Response(JSON.stringify({ error: 'not found' }), { status: 404 }));
    } catch (e) {
      return cors(new Response(JSON.stringify({ error: e.message || 'internal error' }), { status: 500 }));
    }
  }
};
