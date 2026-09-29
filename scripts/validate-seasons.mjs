#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'seasonal-pools.js'), 'utf8');
const match = source.match(/export const SEASONAL_POOLS = (\{[\s\S]*\});/);
if (!match) throw new Error('seasonal-pools.js cannot be parsed');
const pools = JSON.parse(match[1]);
const errors = [];
for (const [season, songs] of Object.entries(pools)) {
  if (!/^\d{4}-(01|04|07|10)$/.test(season)) errors.push(`Invalid season key ${season}`);
  if (songs.length !== 30) errors.push(`${season}: expected 30 songs, found ${songs.length}`);
  const byAnime = new Map();
  const keys = new Set();
  for (const song of songs) {
    for (const field of ['titleCN', 'title', 'anime', 'animeCN', 'artist', 'type', 'anilistId']) {
      if (!song[field]) errors.push(`${season}: missing ${field} in ${JSON.stringify(song)}`);
    }
    if (song.season !== season) errors.push(`${season}: song has wrong season ${song.title}`);
    if (!['OP', 'ED'].includes(song.type)) errors.push(`${season}: invalid type ${song.type}`);
    if (song.youtubeVideoId && !/^[A-Za-z0-9_-]{11}$/.test(song.youtubeVideoId))
      errors.push(`${season}: invalid YouTube ID for ${song.title}`);
    const key = `${song.anilistId}|${song.type}`;
    if (keys.has(key)) errors.push(`${season}: duplicate ${key}`);
    keys.add(key);
    if (!byAnime.has(song.anilistId)) byAnime.set(song.anilistId, new Set());
    byAnime.get(song.anilistId).add(song.type);
  }
  if (byAnime.size !== 15) errors.push(`${season}: expected 15 anime, found ${byAnime.size}`);
  for (const [id, types] of byAnime) {
    if (!types.has('OP') || !types.has('ED')) errors.push(`${season}: anime ${id} lacks OP or ED`);
  }
  console.log(`${season}: ${songs.length} songs / ${byAnime.size} anime`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Seasonal pools validated');
}
