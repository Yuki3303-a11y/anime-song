import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as library from '../library-tools.mjs';
import { normalizeImportedSong, createPersonalBackup, parsePersonalBackup, restorePersonalBackup, describePersonalBackup } from '../personal-backup.mjs';

const song = { title: 'New title', anime: 'Show', type: 'OP', anilistId: 42 };
const history = library.createCatalogHistory([song], {}, { legacy: { 0: ['Old title', 'Old show', 'OP'] } });
const defaultMix = { legacy: false, seasons: ['2026-07'], imported: true, watched: false };
const selectedMix = { legacy: false, seasons: [], imported: false, watched: false, selected: true };
const store = entries => {
    const data = new Map(Object.entries(entries));
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};

test('old selected song aliases become follows and selected-only becomes watched-only', () => {
    assert.equal(typeof library.migrateLegacySongSelection, 'function');
    const result = library.migrateLegacySongSelection({ songs: [song], history,
        watchedKeys: ['anilist:7'], selectedKeys: [library.trackKey({ title: 'Old title', anime: 'Old show', type: 'OP' })],
        mix: selectedMix, defaultMix });
    assert.deepEqual(result.watchedKeys, ['anilist:7', 'anilist:42']);
    assert.deepEqual(result.mix, { legacy: false, seasons: [], imported: false, watched: true });
});

test('unresolved selected-only settings fall back while existing combinations survive', () => {
    assert.equal(typeof library.migrateLegacySongSelection, 'function');
    const options = { songs: [song], history, watchedKeys: [], selectedKeys: ['gone'], defaultMix };
    assert.deepEqual(library.migrateLegacySongSelection({ ...options, mix: selectedMix }).mix, defaultMix);
    assert.deepEqual(library.migrateLegacySongSelection({ ...options, mix: { ...selectedMix, seasons: ['2026-04'], imported: true } }).mix,
        { legacy: false, seasons: ['2026-04'], imported: true, watched: false });
});

test('migration also follows imported songs and is idempotent', () => {
    assert.equal(typeof library.migrateLegacySongSelection, 'function');
    const imported = { title: 'Local', anime: 'Imported anime', type: 'ED' };
    const options = { songs: [song, imported], history, selectedKeys: [library.trackKey(imported)], defaultMix };
    const first = library.migrateLegacySongSelection({ ...options, watchedKeys: [], mix: selectedMix });
    const second = library.migrateLegacySongSelection({ ...options, watchedKeys: first.watchedKeys, mix: first.mix });
    assert.deepEqual(first.watchedKeys, [library.animeKey(imported)]);
    assert.deepEqual(second, first);
});

test('new backups omit retired sections and their summary', () => {
    const data = store({ selected_song_keys_v1: '["old"]', mistake_book_v1: '[]',
        song_source_mix_v1: JSON.stringify({ ...defaultMix, selected: false }) });
    const document = createPersonalBackup(data);
    assert.equal(Object.hasOwn(document.data, 'selected_song_keys_v1'), false);
    assert.equal(Object.hasOwn(document.data, 'mistake_book_v1'), false);
    assert.equal(Object.hasOwn(JSON.parse(document.data.song_source_mix_v1), 'selected'), false);
    assert.doesNotMatch(describePersonalBackup(document), /错题|自选|选歌/);
});

test('legacy backup selections are retained only for migration and mistake books are ignored', () => {
    const document = parsePersonalBackup(JSON.stringify({ format: 'anime-song-personal-backup', version: 1,
        data: { selected_song_keys_v1: '["old"]', mistake_book_v1: '[]', watched_anime_v1: '["anilist:7"]' } }));
    const target = store({ mistake_book_v1: '["leave dormant"]' });
    restorePersonalBackup(target, document);
    assert.equal(target.getItem('selected_song_keys_v1'), '["old"]');
    assert.equal(target.getItem('mistake_book_v1'), '["leave dormant"]');
    assert.equal(target.getItem('watched_anime_v1'), '["anilist:7"]');
});

test('backup settings allow only the three supported preset source names', () => {
    for (const source of ['preset:beginner', 'preset:regular', 'preset:expert']) {
        assert.doesNotThrow(() => parsePersonalBackup(JSON.stringify({ format: 'anime-song-personal-backup', version: 1,
            data: { game_settings_v1: JSON.stringify({ questionCount: 10, types: [], source }) } })));
    }
    assert.throws(() => parsePersonalBackup(JSON.stringify({ format: 'anime-song-personal-backup', version: 1,
        data: { game_settings_v1: JSON.stringify({ questionCount: 10, types: [], source: 'preset:arbitrary' }) } })));
});

test('browser startup migrates follows before custom-song caches exist and consumes old selections once', () => {
    const imported = { title: 'Local', anime: 'Local show', type: 'ED' };
    const data = store({ selected_song_keys_v1: JSON.stringify([library.trackKey(imported)]),
        custom_songs_v1: JSON.stringify([imported]), watched_anime_v1: '["anilist:7"]',
        song_source_mix_v1: JSON.stringify(selectedMix), song_source_mode_v1: 'mix' });
    const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    const init = app.slice(app.indexOf('const filterState ='), app.indexOf('let audioSourcePref ='));
    const context = { ...library, normalizeImportedSong, parsePersonalBackup,
        SONGS: [song], SEASONAL_POOLS: {}, PREVIOUS_CATALOG_KEYS: {},
        gameState: {}, QUARTER_CATALOG: { '2026-07': [song] }, publishedSeasons: ['2026-07'], localStorage: data, console };
    vm.createContext(context);
    vm.runInContext(init + '\nglobalThis.loaded = { filterState, watchedAnimeKeys };', context);
    assert.deepEqual(Array.from(context.loaded.watchedAnimeKeys), ['anilist:7', library.animeKey(imported)]);
    assert.equal(context.loaded.filterState.mix.watched, true);
    assert.equal(data.getItem('selected_song_keys_v1'), null);
    assert.equal(Object.hasOwn(JSON.parse(data.getItem('song_source_mix_v1')), 'selected'), false);
    // Removing a follow later must not recreate it from dormant song choices.
    data.setItem('watched_anime_v1', '["anilist:7"]');
    const reload = { ...context };
    vm.createContext(reload);
    vm.runInContext(init + '\nglobalThis.loaded = { filterState, watchedAnimeKeys };', reload);
    assert.deepEqual(Array.from(reload.loaded.watchedAnimeKeys), ['anilist:7']);
});

test('retired library actions have no runtime handlers or panels', () => {
    const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    assert.doesNotMatch(app, /selectedSongKeys|toggleSelectedSong|useSelectedSongs|mistakeBook|recordMistake|startMistakePractice|practiceMode|libraryMistake/);
});

test('unresolved selected-only browser settings recover a nonempty default even with a stale watched-only flag', () => {
    const data = store({ selected_song_keys_v1: '["gone"]', watched_anime_v1: '["anilist:999"]',
        song_source_mix_v1: JSON.stringify(selectedMix), song_source_mode_v1: 'mix', watched_only_v1: '1' });
    const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    const init = app.slice(app.indexOf('const filterState ='), app.indexOf('let audioSourcePref ='));
    const context = { ...library, normalizeImportedSong, parsePersonalBackup, SONGS: [song], SEASONAL_POOLS: {},
        PREVIOUS_CATALOG_KEYS: {}, gameState: {}, QUARTER_CATALOG: { '2026-07': [song] },
        publishedSeasons: ['2026-07'], localStorage: data, console };
    vm.createContext(context);
    vm.runInContext(init + '\nglobalThis.loaded = filterState;', context);
    assert.equal(context.loaded.watchedOnly, false);
    assert.deepEqual(Array.from(context.loaded.mix.seasons), ['2026-07']);
    assert.equal(data.getItem('watched_only_v1'), '0');
});

test('restoring a new snapshot does not replay old selections left on the destination', () => {
    const document = createPersonalBackup(store({ watched_anime_v1: '["anilist:42"]' }));
    const target = store({ selected_song_keys_v1: '["old choice"]' });
    restorePersonalBackup(target, document);
    assert.equal(target.getItem('selected_song_keys_v1'), null);
});
