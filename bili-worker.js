// B站 API Proxy Worker for 萌豚挑战
// Deploy: wrangler deploy

import SparkMD5 from 'spark-md5';
const { hash: md5 } = SparkMD5;

const BILI_API = 'https://api.bilibili.com';

// B站 cookies for WAF bypass (personal use)
const BILI_COOKIE = 'buvid3=64ACF920-EA61-EC9E-6006-82CB4F07CA6F32360infoc; buvid4=097522C7-6542-DCD3-483B-F479D7B9791033222-026012119-1m27iCIGWIIzOVEGv8R+1Q==; b_nut=1768995232';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Cookie': BILI_COOKIE
};

// ─── WBI Signing ───
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

function getMixinKey(rawKey) {
  return MIXIN_KEY_ENC_TAB.map(i => rawKey[i]).join('').slice(0, 32);
}

// Fallback keys — update when these stop working
let cachedKeys = { imgKey: '7cd084941338484aae1ad9425b84077c', subKey: '4932caff0ff746eab6f01bf08b70ac45' };

async function getWbiKeys() {
  try {
    const r = await fetch(`${BILI_API}/x/web-interface/nav`, { headers });
    const d = await r.json();
    if (d.data?.wbi_img?.img_url) {
      cachedKeys.imgKey = d.data.wbi_img.img_url.split('/').pop().split('.')[0];
      cachedKeys.subKey = d.data.wbi_img.sub_url.split('/').pop().split('.')[0];
    }
  } catch (e) { /* use cached */ }
  return cachedKeys;
}

function signParams(params, imgKey, subKey) {
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = Math.floor(Date.now() / 1000);
  const all = { ...params, wts };
  const query = Object.keys(all)
    .sort()
    .map(k => {
      const v = String(all[k]).replace(/[!'()*]/g, '');
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    })
    .join('&');
  const w_rid = md5(query + mixinKey);
  return { w_rid, wts };
}

async function signedFetch(path, queryParams = {}) {
  const { imgKey, subKey } = await getWbiKeys();
  const { w_rid, wts } = signParams(queryParams, imgKey, subKey);
  const allParams = { ...queryParams, w_rid, wts };
  const url = `${BILI_API}${path}?${Object.keys(allParams).sort().map(k => {
    const v = String(allParams[k]).replace(/[!'()*]/g, '');
    return encodeURIComponent(k) + '=' + encodeURIComponent(v);
  }).join('&')}`;
  return fetch(url, { headers });
}

// ─── CORS ───
function cors(resp) {
  return new Response(resp.body, {
    status: resp.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

// ─── Router ───
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        }
      });
    }

    try {
      if (url.pathname === '/wbidebug') {
        const q = url.searchParams.get('q') || 'test';
        const { imgKey, subKey } = await getWbiKeys();
        const mixinKey = getMixinKey(imgKey + subKey);
        const params = { search_type: 'video', keyword: q, page: '1' };
        const signed = signParams(params, imgKey, subKey);
        const query = Object.keys({ ...params, wts: signed.wts }).sort().map(k => {
          const v = String({ ...params, wts: signed.wts }[k]).replace(/[!'()*]/g, '');
          return encodeURIComponent(k) + '=' + encodeURIComponent(v);
        }).join('&');
        return cors(new Response(JSON.stringify({
          imgKey, subKey, mixinKey,
          queryString: query,
          w_rid: signed.w_rid,
          md5_input: query + mixinKey
        })));
      }

      if (url.pathname === '/search') {
        const q = url.searchParams.get('q');
        if (!q) return cors(new Response(JSON.stringify({ error: 'missing q' }), { status: 400 }));

        const resp = await signedFetch('/x/web-interface/search/type', {
          search_type: 'video', keyword: q, page: url.searchParams.get('page') || '1'
        });
        const data = await resp.json();
        if (data.code !== 0) return cors(new Response(JSON.stringify({ error: data.message, code: data.code }), { status: 502 }));

        const results = (data.data?.result || []).map(r => ({
          bvid: r.bvid,
          title: r.title.replace(/<[^>]+>/g, ''),
          author: r.author,
          play: r.play,
          duration: r.duration ? r.duration.split(':').reduce((a, b) => a * 60 + parseInt(b), 0) : 0,
          cover: r.pic ? (r.pic.startsWith('//') ? 'https:' + r.pic : r.pic) : ''
        }));
        return cors(new Response(JSON.stringify({ results })));
      }

      if (url.pathname === '/audio') {
        const bvid = url.searchParams.get('bvid');
        if (!bvid) return cors(new Response(JSON.stringify({ error: 'missing bvid' }), { status: 400 }));

        const infoResp = await signedFetch('/x/web-interface/view', { bvid });
        const infoData = await infoResp.json();
        if (infoData.code !== 0) return cors(new Response(JSON.stringify({ step: 'view', error: infoData.message, code: infoData.code }), { status: 502 }));

        const cid = infoData.data?.cid;
        const duration = infoData.data?.duration || 0;

        const playResp = await signedFetch('/x/player/playurl', { bvid, cid: String(cid), fnval: '16', fnver: '0', fourk: '1' });
        const playData = await playResp.json();
        if (playData.code !== 0) return cors(new Response(JSON.stringify({ step: 'playurl', error: playData.message, code: playData.code }), { status: 502 }));

        const dash = playData.data?.dash;
        const audioStreams = (dash?.audio || []).sort((a, b) => b.id - a.id);
        const best = audioStreams[0];
        if (!best?.baseUrl) return cors(new Response(JSON.stringify({ error: 'no audio stream' }), { status: 404 }));

        return cors(new Response(JSON.stringify({
          url: best.baseUrl,
          backupUrl: best.backupUrl?.[0] || null,
          duration,
          audioQuality: best.id
        })));
      }

      return cors(new Response(JSON.stringify({ error: 'not found' }), { status: 404 }));
    } catch (e) {
      return cors(new Response(JSON.stringify({ error: e.message }), { status: 500 }));
    }
  }
};
