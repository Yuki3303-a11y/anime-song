import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const backup = await import('../personal-backup.mjs').catch(() => ({}));
function memoryStore(entries = {}) {
    const data = new Map(Object.entries(entries));
    return { data, getItem: key => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const song = { title: 'TEST ME', titleCN: 'TEST ME', anime: 'Oshi no Ko 3', animeCN: '我推的孩子 第三季',
    artist: 'CHANMINA', type: 'OP', anilistId: 187117, origin: 'bangumi', _importScore: 90,
    coverImage: 'https://example.com/cover.jpg', youtubeVideoId: 'QgIQbeRzkkc', season: '2026-01' };

test('legacy song import preserves identity, cover, origin and verified source metadata', () => {
    const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    const source = app.slice(app.indexOf('function importCustomSongsFile('), app.indexOf('// Update custom songs list', app.indexOf('function importCustomSongsFile(')));
    let saved;
    const context = { FileReader: class { readAsText() { this.result = JSON.stringify([song]); this.onload(); } },
        getCustomSongs: () => [], setCustomSongs: value => { saved = value; }, notify() {}, console,
        normalizeImportedSong: backup.normalizeImportedSong };
    vm.createContext(context);
    vm.runInContext(source, context);
    context.importCustomSongsFile({});
    assert.deepEqual(JSON.parse(JSON.stringify(saved?.[0])), song);
});

test('personal backup round-trips records while excluding caches and authentication', () => {
    assert.equal(typeof backup.createPersonalBackup, 'function');
    const store = memoryStore({ custom_songs_v1: JSON.stringify([song]), watched_anime_v1: '["anilist:187117"]',
        selected_song_keys_v1: '["test me|oshi no ko 3|op"]', fav_songs_v1: JSON.stringify([song]),
        song_source_mix_v1: '{"legacy":false,"seasons":["2026-01"],"imported":true,"watched":false,"selected":true}',
        audio_source_pref_v1: 'smart', player_volume_v1: '43', audio_cache_v3: '{"expired":"stream"}',
        firebaseLocalStorage: 'private', bili_proxy_url_v1: 'http://private-host:8765' });
    const document = backup.createPersonalBackup(store);
    const parsed = backup.parsePersonalBackup(JSON.stringify(document));
    const target = memoryStore();
    backup.restorePersonalBackup(target, parsed);
    assert.equal(target.getItem('custom_songs_v1'), store.getItem('custom_songs_v1'));
    assert.deepEqual(JSON.parse(target.getItem('song_source_mix_v1')),
        { legacy: false, seasons: ['2026-01'], imported: true, watched: false });
    assert.equal(target.getItem('selected_song_keys_v1'), null);
    assert.equal(target.getItem('player_volume_v1'), '43');
    assert.equal(target.getItem('audio_cache_v3'), null);
    assert.equal(target.getItem('firebaseLocalStorage'), null);
    assert.equal(target.getItem('bili_proxy_url_v1'), null);
});

test('malformed or unsupported backup fails before touching existing data', () => {
    assert.equal(typeof backup.parsePersonalBackup, 'function');
    const valid = backup.createPersonalBackup(memoryStore());
    for (const data of [ { ...valid, version: 99 }, { ...valid, data: { custom_songs_v1: '{}' } },
        { ...valid, data: { watched_anime_v1: '[null]' } },
        { ...valid, data: { custom_songs_v1: '[{"title":"x"}]' } },
        { ...valid, data: { custom_songs_v1: JSON.stringify([{ ...song, itunesPreviewUrl: 'https://evil.example/song.mp3' }]) } },
        { ...valid, data: { firebaseLocalStorage: 'secret' } },
        { ...valid, data: { local_audio_checks_v1: '[{"key":"x","status":"oops"}]' } } ]) {
        assert.throws(() => backup.parsePersonalBackup(JSON.stringify(data)));
    }
});

test('backup storage quota failure rolls back changed and previously absent keys', () => {
    assert.equal(typeof backup.restorePersonalBackup, 'function');
    const target = memoryStore({ watched_anime_v1: '["old"]', unrelated: 'keep' });
    const originalSet = target.setItem;
    target.setItem = (key, value) => { if (key === 'player_volume_v1' && value === '43') throw new Error('quota'); originalSet(key, value); };
    const document = backup.parsePersonalBackup(JSON.stringify({ format: 'anime-song-personal-backup', version: 1,
        data: { watched_anime_v1: '["new"]', selected_song_keys_v1: '["new-song"]', player_volume_v1: '43' } }));
    assert.throws(() => backup.restorePersonalBackup(target, document), /quota/);
    assert.equal(target.getItem('watched_anime_v1'), '["old"]');
    assert.equal(target.getItem('selected_song_keys_v1'), null);
    assert.equal(target.getItem('unrelated'), 'keep');
});

test('a complete snapshot restores default preferences that were unset at export time', () => {
    assert.equal(typeof backup.createPersonalBackup, 'function');
    const store = memoryStore({ watched_anime_v1: '["old"]' });
    const document = backup.createPersonalBackup(store);
    store.setItem('audio_source_pref_v1', 'bilibili-only');
    store.setItem('custom_songs_v1', JSON.stringify([song]));
    backup.restorePersonalBackup(store, document);
    assert.equal(store.getItem('audio_source_pref_v1'), null);
    assert.equal(store.getItem('custom_songs_v1'), null);
    assert.equal(store.getItem('watched_anime_v1'), '["old"]');
});

test('song import strips unsafe URLs and rejects invalid song objects', () => {
    assert.equal(typeof backup.normalizeImportedSong, 'function');
    assert.equal(backup.normalizeImportedSong({ title: {}, anime: 'x' }), null);
    const normalized = backup.normalizeImportedSong({ ...song, coverImage: 'javascript:alert(1)',
        itunesPreviewUrl: 'https://evil.example/song.mp3', youtubeVideoId: 'not-a-video-url' });
    assert.equal(normalized.coverImage, undefined);
    assert.equal(normalized.itunesPreviewUrl, undefined);
    assert.equal(normalized.youtubeVideoId, undefined);
    assert.equal(normalized.anilistId, song.anilistId);
});
