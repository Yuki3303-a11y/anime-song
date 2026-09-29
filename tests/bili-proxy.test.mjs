import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const proxy = await import('../bili-proxy.mjs');

test('local proxy builds a deterministic sorted WBI query', () => {
  const mixinKey = proxy.getMixinKey(
    '7cd084941338484aae1ad9425b84077c' +
    '4932caff0ff746eab6f01bf08b70ac45'
  );
  const signed = proxy.buildWbiQuery({
    search_type: 'video',
    keyword: "魔法少女小圆 OP Connect!",
    page: '1',
  }, mixinKey, 1_700_000_000);
  const unsigned = 'keyword=' + encodeURIComponent('魔法少女小圆 OP Connect') +
    '&page=1&search_type=video&wts=1700000000';
  const expectedRid = crypto.createHash('md5').update(unsigned + mixinKey).digest('hex');
  assert.equal(signed, `${unsigned}&w_rid=${expectedRid}`);
});

test('local proxy retries Bilibili 412 responses within the retry budget', async () => {
  let attempts = 0;
  const result = await proxy.withRetry(async () => {
    attempts++;
    if (attempts < 3) {
      const error = new Error('precondition failed');
      error.statusCode = 412;
      throw error;
    }
    return 'ok';
  }, { maxRetries: 2, delay: async () => {} });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('local proxy parses Bilibili search durations and strips highlight markup', () => {
  const results = proxy.parseSearchResults({ data: { result: [{
    bvid: 'BV1TEST',
    title: '<em class="keyword">Connect</em> 魔法少女小圆',
    author: 'ClariS',
    play: 12345,
    duration: '4:27',
    pic: '//example.test/cover.jpg',
  }] } });
  assert.deepEqual(results, [{
    bvid: 'BV1TEST',
    title: 'Connect 魔法少女小圆',
    author: 'ClariS',
    play: 12345,
    duration: 267,
    cover: 'https://example.test/cover.jpg',
  }]);
});

test('local stream proxy retries an allowed backup CDN before returning an error', async () => {
  const calls = [];
  const transport = {
    get(options, callback) {
      calls.push(options.hostname);
      const primary = calls.length === 1;
      const upstream = {
        statusCode: primary ? 502 : 206,
        headers: primary ? {} : {
          'content-type': 'application/octet-stream',
          'content-length': '100',
          'content-range': 'bytes 0-99/1000',
        },
        resume() {},
        pipe(res) { res.piped = true; },
      };
      queueMicrotask(() => callback(upstream));
      return { setTimeout() {}, on() {}, destroy() {} };
    },
  };
  const res = {
    headersSent: false,
    statusCode: null,
    headers: {},
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; this.headersSent = true; },
    end() {},
  };
  proxy.pipeStream(
    res,
    'https://primary.bilivideo.com/audio',
    { headers: { range: 'bytes=0-99' } },
    'https://backup.bilivideo.com/audio',
    transport,
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['primary.bilivideo.com', 'backup.bilivideo.com']);
  assert.equal(res.statusCode, 206);
  assert.equal(res.piped, true);
  assert.equal(res.headers['Content-Type'], 'audio/mp4');
});
