import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { groupLibrarySongs } from '../library-navigation.mjs';
import { animeKey } from '../library-tools.mjs';
import { uniqueChallengePool } from '../audio-selection.mjs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('const homeGallerySeason ='), app.indexOf("$('inlineDetailHost').appendChild"));
const first = { title: 'OP A', anime: 'A', anilistId: 1, type: 'OP', season: '2021-04', coverImage: 'https://example.test/a.jpg' };
const second = { title: 'OP B', anime: 'B', anilistId: 2, type: 'OP', season: '2026-10', coverImage: 'https://example.test/b.jpg' };

function showcase(songs = [first, second], options = {}) {
    const elements = new Map();
    const buttons = { hero: [{}, {}], gallery: [{}, {}] };
    const storage = options.storage || new Map();
    let currentSongs = songs;
    const context = {
        $: id => {
            if (!elements.has(id)) elements.set(id, { src: '', hidden: false, complete: true, naturalWidth: 200,
                textContent: '', innerHTML: '', removeAttribute(name) { if (name === 'src') this.src = ''; } });
            return elements.get(id);
        },
        groupLibrarySongs, animeKey, uniqueChallengePool, getFilteredSongs: () => currentSongs,
        SEASONAL_POOLS: options.seasons || { '2026-10': [first, second] }, SEASONAL_COVERS: { 1: first.coverImage, 2: second.coverImage },
        staticAnimeCover: song => song.coverImage || '', findLibraryCover: options.lookup || (() => Promise.resolve('')),
        libraryCoverCache: new Map(), escapeHTML: text => text,
        document: { querySelectorAll: selector => buttons[selector.includes('shiftHomeHero') ? 'hero' : 'gallery'] },
        sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        Math: Object.assign(Object.create(Math), { random: () => 0 }),
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return { context, elements, buttons, storage, setSongs: value => { currentSongs = value; } };
}

test('hero deduplicates the current question pool and updates when the library changes', () => {
    const { context, setSongs, buttons } = showcase([first, { ...first, title: 'ED A', type: 'ED' }, second]);
    context.updateHomeHero();
    assert.equal(context.$('heroFeaturedCount').textContent, '1 / 2');
    assert.equal(context.$('heroFeaturedMeta').textContent, '2021 · 4 月');
    setSongs([second]);
    context.updateHomeHero();
    assert.equal(context.$('heroFeaturedTitle').textContent, 'B');
    assert.equal(context.$('heroFeaturedMeta').textContent, '2026 · 10 月');
    assert.equal(context.$('heroFeaturedCover').src, second.coverImage);
    assert.equal(context.$('heroFeaturedCount').textContent, '1 / 1');
    assert.ok(buttons.hero.every(button => button.disabled));
});

test('random starts and reloads avoid the previous anime whenever another is available', () => {
    const initial = showcase();
    initial.context.updateHomeHero();
    assert.equal(initial.context.$('heroFeaturedTitle').textContent, 'A');
    const reload = showcase([first, second], { storage: initial.storage });
    reload.context.updateHomeHero();
    assert.equal(reload.context.$('heroFeaturedTitle').textContent, 'B');
    reload.context.updateHomeHero(undefined, true);
    assert.equal(reload.context.$('heroFeaturedTitle').textContent, 'A');
});

test('empty libraries and missing artwork keep honest counts without stale images', async () => {
    const { context, setSongs, buttons } = showcase([first]);
    context.updateHomeHero();
    setSongs([]);
    context.updateHomeHero();
    assert.equal(context.$('heroFeaturedCount').textContent, '0 / 0');
    assert.equal(context.$('heroFeaturedMeta').textContent, '');
    assert.equal(context.$('heroFeaturedCover').hidden, true);
    assert.equal(context.$('heroFeaturedCover').src, '');
    assert.ok(buttons.hero.every(button => button.disabled));
    setSongs([{ title: 'Custom song', anime: 'No artwork', type: 'OP' }]);
    context.updateHomeHero();
    await Promise.resolve();
    assert.equal(context.$('heroFeaturedCount').textContent, '1 / 1');
    assert.equal(context.$('heroFeaturedTitle').textContent, 'No artwork');
    assert.equal(context.$('heroFeaturedMeta').textContent, '');
    assert.equal(context.$('heroEmptyState').textContent, '暂无封面');
});

test('a late cover lookup cannot replace the image for a newly selected library', async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const { context, setSongs } = showcase([{ ...first, coverImage: '' }], { lookup: () => pending });
    context.updateHomeHero();
    setSongs([second]);
    context.updateHomeHero();
    finish(first.coverImage);
    await pending;
    assert.equal(context.$('heroFeaturedTitle').textContent, 'B');
    assert.equal(context.$('heroFeaturedCover').src, second.coverImage);
    context.$('heroFeaturedCover').onerror();
    assert.equal(context.$('heroFeaturedCover').hidden, true);
    assert.equal(context.$('heroEmptyState').textContent, '暂无封面');
});

test('manual hero navigation wraps independently of the seasonal gallery', () => {
    const { context } = showcase();
    context.updateHomeHero();
    context.renderHomeAnimeGallery();
    context.shiftHomeAnime('hero', -1);
    assert.equal(context.$('heroFeaturedTitle').textContent, 'B');
    context.shiftHomeAnime('gallery', 1);
    assert.equal(context.$('heroFeaturedTitle').textContent, 'B');
    context.shiftHomeAnime('hero', 1);
    assert.equal(context.$('heroFeaturedTitle').textContent, 'A');
});

test('a custom current library is visible even when the seasonal gallery is empty', () => {
    const { context, buttons } = showcase([second], { seasons: {} });
    context.renderHomeAnimeGallery();
    context.updateHomeHero();
    assert.equal(context.$('homeGalleryCount').textContent, '0 / 0');
    assert.equal(context.$('heroFeaturedTitle').textContent, 'B');
    assert.ok(buttons.gallery.every(button => button.disabled));
});
