import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { LIBRARY_PRESETS, getPresetId } from '../library-presets.mjs';
import { filterWatchedSongs } from '../library-tools.mjs';
import { sourceSelection, sourceFromSelection } from '../library-navigation.mjs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('preset sources survive source selection and only expose their matching recordings', () => {
    for (const preset of LIBRARY_PRESETS) {
        const source = `preset:${preset.id}`;
        assert.equal(sourceSelection(source).group, 'preset');
        assert.equal(sourceFromSelection(sourceSelection(source)), source);
    }
    const op = { title: 'Opening', anime: 'Show', anilistId: 1, type: 'OP' };
    const ed = { ...op, title: 'Ending', type: 'ED' };
    const unrelated = { title: 'Other', anime: 'Other', anilistId: 2, type: 'OP' };
    const context = {
        getCustomSongs: () => [unrelated], builtinSongs: [op, ed, unrelated],
        filterState: { source: 'preset:regular', types: new Set(), watchedOnly: false },
        PRESET_POOLS: { regular: [op, ed] }, getPresetId, filterWatchedSongs,
        getWatchedAnimeKeys: () => ['anilist:1'],
    };
    vm.createContext(context);
    const start = app.indexOf('function getFilteredSongs() {');
    const end = app.indexOf('// Anti-repeat question selection', start);
    vm.runInContext(app.slice(start, end), context);
    assert.deepEqual(context.getFilteredSongs(), [op, ed]);
    context.filterState.types.add('ED');
    context.filterState.watchedOnly = true;
    assert.deepEqual(context.getFilteredSongs(), [ed]);
    context.getWatchedAnimeKeys = () => ['anilist:2'];
    assert.equal(context.getFilteredSongs().length, 0);
    assert.equal(context.PRESET_POOLS.regular[0], op);
});

test('applying a preset clears incompatible filters without changing round length or follows', () => {
    const follows = ['anilist:42'];
    const state = { types: new Set(['ED']), watchedOnly: true, source: 'mix' };
    const storage = new Map();
    const chips = Array.from({ length: 4 }, () => ({ active: false, classList: { toggle(_name, active) { this.active = active; } } }));
    const elements = {
        typeChips: { querySelectorAll: () => chips },
        watchedOnlyFilter: { checked: true }, libraryOnlyWatched: { checked: true },
        'v-library': { classList: { contains: () => true } },
    };
    const context = {
        LIBRARY_PRESETS, PRESET_POOLS: { beginner: [{ title: 'OP' }] }, filterState: state,
        gameState: { questionCount: 20 }, watchedAnimeKeys: follows,
        $: id => elements[id], localStorage: { setItem: (key, value) => storage.set(key, value) },
        setSourceFilter: value => { state.source = value; }, notify() {},
    };
    vm.createContext(context);
    const start = app.indexOf('function applyLibraryPreset(id) {');
    const end = app.indexOf("let lastOfficialSource =", start);
    vm.runInContext(app.slice(start, end), context);
    context.applyLibraryPreset('beginner');
    assert.equal(state.source, 'preset:beginner');
    assert.equal(state.types.size, 0);
    assert.equal(state.watchedOnly, false);
    assert.equal(context.gameState.questionCount, 20);
    assert.deepEqual(follows, ['anilist:42']);
    assert.equal(elements.watchedOnlyFilter.checked, false);
    assert.equal(elements.libraryOnlyWatched.checked, false);
    assert.equal(storage.get('watched_only_v1'), '0');
    context.applyLibraryPreset('unknown');
    assert.equal(state.source, 'preset:beginner');
});
