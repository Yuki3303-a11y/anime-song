import test from 'node:test';
import assert from 'node:assert/strict';
import { audioSearchQueries, scoreAudioCandidate } from '../audio-selection.mjs';

const avid = { title: 'Avid', anime: '86', artist: '泽野弘之', type: 'ED' };
const official = { source: 'itunes', title: 'Avid (feat. mizuki)', artist: 'SawanoHiroyuki[nZk]', album: 'Avid / Hands Up to the Sky' };

test('verified Chinese and Japanese Sawano names accept his official iTunes artist identity', () => {
    for (const artist of ['泽野弘之', '澤野弘之', 'SawanoHiroyuki[nZk]']) {
        assert.ok(scoreAudioCandidate({ ...avid, artist }, official, { requireRelation: true }) >= 0, artist);
    }
});

test('iTunes queries use the same verified artist aliases as candidate scoring', () => {
    const queries = audioSearchQueries(avid);
    assert.ok(queries.itunes.includes('SawanoHiroyuki[nZk] Avid'));
    assert.ok(queries.itunes.includes('澤野弘之 Avid'));
});

test('artist aliases do not allow unrelated singers or covers, live or instrumental versions', () => {
    for (const artist of ['Unrelated Singer', 'Piano Anime']) {
        assert.equal(scoreAudioCandidate(avid, { ...official, artist }), -1);
    }
    for (const title of ['Avid (Piano Cover)', 'Avid (Live)', 'Avid (Instrumental)']) {
        assert.equal(scoreAudioCandidate(avid, { ...official, title }), -1);
    }
});

test('explicit artist aliases compose with existing queries and strict iTunes identity checks', () => {
    const song = { title: 'Example', artist: '歌手甲', artistAliases: ['Artist A'], anime: 'Example anime', type: 'OP' };
    assert.ok(audioSearchQueries(song).itunes.includes('Artist A Example'));
    assert.ok(scoreAudioCandidate(song, { source: 'itunes', title: 'Example', artist: 'Artist A' }) >= 0);
    assert.equal(scoreAudioCandidate(song, { source: 'itunes', title: 'Example', artist: 'Artist B' }), -1);
});
