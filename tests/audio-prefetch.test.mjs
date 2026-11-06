import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../audio-prefetch.mjs').catch(() => ({}));
const tick = () => new Promise(resolve => setTimeout(resolve, 8));

test('next-song preparation resolves one recording without starting media and is reused on take', async () => {
    assert.equal(typeof module.createAudioPrefetch, 'function');
    let calls = 0;
    const result = { source: 'youtube', url: 'yt:confirmed' };
    const prefetch = module.createAudioPrefetch(async () => { calls++; return result; }, 0);
    prefetch.schedule('next', { title: 'next' });
    prefetch.schedule('next', { title: 'next' });
    await tick();
    assert.strictEqual(await prefetch.take('next'), result);
    assert.equal(calls, 1);
    assert.equal(prefetch.take('next'), null);
});

test('leaving a challenge aborts background resolution and never caches its late result', async () => {
    assert.equal(typeof module.createAudioPrefetch, 'function');
    let signal;
    let finish;
    const prefetch = module.createAudioPrefetch((_song, value) => { signal = value; return new Promise(resolve => { finish = resolve; }); }, 0);
    prefetch.schedule('old', {});
    await tick();
    prefetch.cancel();
    assert.equal(signal.aborted, true);
    finish({ url: 'late' });
    await tick();
    assert.equal(prefetch.take('old'), null);
});

test('entering the next question takes ownership so cancelling background work does not abort playback resolution', async () => {
    assert.equal(typeof module.createAudioPrefetch, 'function');
    let signal;
    let finish;
    const prefetch = module.createAudioPrefetch((_song, value) => { signal = value; return new Promise(resolve => { finish = resolve; }); }, 1000);
    prefetch.schedule('next', {});
    const playing = prefetch.take('next');
    await Promise.resolve();
    prefetch.cancel();
    assert.equal(signal.aborted, false);
    finish({ url: 'same' });
    assert.equal((await playing).url, 'same');
});

test('replacing the upcoming song cancels the old task and failures are recoverable', async () => {
    assert.equal(typeof module.createAudioPrefetch, 'function');
    const calls = [];
    const prefetch = module.createAudioPrefetch(async song => { calls.push(song.title); throw new Error('network'); }, 0);
    prefetch.schedule('old', { title: 'old' });
    prefetch.schedule('new', { title: 'new' });
    await tick();
    assert.equal(await prefetch.take('new'), null);
    assert.deepEqual(calls, ['new']);
});
