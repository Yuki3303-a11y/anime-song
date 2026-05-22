# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"萌豚挑战" — a static single-page anime music quiz app. Users listen to 30-second song previews and guess which anime they're from. Supports single-player and multiplayer PK mode via Firebase Firestore.

## Running

No build step. Serve with any static HTTP server (ES modules require HTTP, not `file://`):

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Architecture

**4 files, no framework, no bundler:**

- `index.html` — All views in one HTML (menu, lobby, room, game, leaderboard). Views toggled via `.hidden` class. Event delegation on `[data-action]` attributes.
- `app.js` — ES module. All game logic, Firebase multiplayer, AniList API for anime metadata, iTunes API for 30s audio previews, Bangumi API for links, sakura particle canvas, audio playback.
- `songs.js` — Exports `SONGS` array (600+ entries), `ALL_ANIME`, `AVAILABLE_YEARS`, `AVAILABLE_TYPES`. Each song: `{ titleCN, title, anime, artist, year, type }`.
- `style.css` — All styles. CSS custom properties for theming. Glassmorphism cards, gradient accents, sakura canvas background.

## Key Systems

**Audio:** iTunes Search API (`country=JP`) with `artist + title` query. Preview URLs cached in localStorage (`audio_cache_v1`). 5s timeout per request. Falls back to title-only search.

**Multiplayer:** Firebase Firestore (project: `animequiz-a16c1`). Anonymous auth. Rooms stored at `artifacts/{projectId}/public/data/rooms/{roomId}`. Real-time sync via `onSnapshot`.

**Anime metadata:** AniList GraphQL API (`https://graphql.anilist.co`) for cover images and romaji titles. Cached in localStorage (`anime_cache_v1`).

**Bangumi links:** Bangumi API (`https://api.bgm.tv/search/subject/anime`) to resolve subject IDs. Cached in localStorage (`bangumi_cache_v1`).

**Filters:** Multi-select year (Set-based) + single-select type. Applied via `getFilteredSongs()` before shuffling into playlist.

## Song Data

When adding songs, maintain the format exactly. The `title` field is used as the iTunes search term and cache key. Run this to verify no duplicates:

```bash
node -e "const fs=require('fs');const c=fs.readFileSync('songs.js','utf-8');const m=c.match(/export const SONGS = (\\[[\\s\\S]*?\\]);/);const s=eval(m[1]);const seen=new Set();const d=[];s.forEach(x=>{const k=x.title+'|'+x.anime;if(seen.has(k))d.push(k);seen.add(k);});if(d.length){console.log('Dupes:',d);process.exit(1);}console.log('OK:',s.length,'songs');"
```

## Proxy

Network requests may need proxy `http://127.0.0.1:7897` (Clash Verge). The app itself doesn't use a proxy — this is only for CLI curl/fetch during development.
