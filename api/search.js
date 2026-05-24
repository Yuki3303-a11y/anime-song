// Vercel Serverless Function — B站 API Proxy
// Deploy: vercel --prod
const https = require('https');

const BILI_HOST = 'api.bilibili.com';
const BILI_COOKIE = process.env.BILI_COOKIE || 'buvid3=64ACF920-EA61-EC9E-6006-82CB4F07CA6F32360infoc; buvid4=097522C7-6542-DCD3-483B-F479D7B9791033222-026012119-1m27iCIGWIIzOVEGv8R+1Q==; b_nut=1768995232';

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

const FALLBACK_IMG = '7cd084941338484aae1ad9425b84077c';
const FALLBACK_SUB = '4932caff0ff746eab6f01bf08b70ac45';

function getMixinKey(raw) {
  return MIXIN_KEY_ENC_TAB.map(i => raw[i]).join('').slice(0, 32);
}

const md5 = require('spark-md5').hash;

let cachedKeys = null;

function biliGet(path, params) {
  return new Promise((resolve, reject) => {
    (async () => {
      // Get WBI keys
      if (!cachedKeys) {
        try {
          const navData = await get(`/x/web-interface/nav`);
          if (navData.data?.wbi_img) {
            cachedKeys = {
              img: navData.data.wbi_img.img_url.split('/').pop().split('.')[0],
              sub: navData.data.wbi_img.sub_url.split('/').pop().split('.')[0]
            };
          }
        } catch (e) { cachedKeys = { img: FALLBACK_IMG, sub: FALLBACK_SUB }; }
      }

      const mixinKey = getMixinKey(cachedKeys.img + cachedKeys.sub);
      const wts = Math.floor(Date.now() / 1000);
      const all = { ...params, wts };
      const query = Object.keys(all).sort().map(k => {
        const v = String(all[k]).replace(/[!'()*]/g, '');
        return encodeURIComponent(k) + '=' + encodeURIComponent(v);
      }).join('&');
      const w_rid = md5(query + mixinKey);
      resolve(get(`${path}?${query}&w_rid=${w_rid}`));
    })().catch(reject);
  });
}

function get(endpoint) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BILI_HOST,
      path: endpoint,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/',
        'Cookie': BILI_COOKIE,
        'Accept': 'application/json'
      }
    };
    https.get(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON parse failed: ' + body.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, bvid } = req.query;

  try {
    if (q) {
      const data = await biliGet('/x/web-interface/search/type', { search_type: 'video', keyword: q, page: '1' });
      const results = (data.data?.result || []).map(r => {
        let dur = 0;
        if (r.duration) { const p = r.duration.split(':'); dur = parseInt(p[0]) * 60 + parseInt(p[1]); }
        return {
          bvid: r.bvid, title: (r.title || '').replace(/<[^>]+>/g, ''),
          author: r.author, play: r.play, duration: dur,
          cover: r.pic ? (r.pic.startsWith('//') ? 'https:' + r.pic : r.pic) : ''
        };
      });
      return res.json({ results });
    }

    if (bvid) {
      const info = await biliGet('/x/web-interface/view', { bvid });
      const cid = info.data?.cid;
      const duration = info.data?.duration || 0;

      const play = await biliGet('/x/player/playurl', { bvid, cid: String(cid), fnval: '16', fnver: '0', fourk: '1' });
      const audio = (play.data?.dash?.audio || []).sort((a, b) => b.id - a.id)[0];
      if (!audio?.baseUrl) return res.status(404).json({ error: 'no audio stream' });

      return res.json({ url: audio.baseUrl, backupUrl: (audio.backupUrl || [null])[0], duration, audioQuality: audio.id });
    }

    return res.status(400).json({ error: 'missing q or bvid' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
