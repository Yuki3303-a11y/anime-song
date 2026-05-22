# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"萌豚挑战" — a static single-page anime music quiz app. Users listen to 30-second song previews and guess which anime they're from. Supports single-player and multiplayer PK mode via Firebase Firestore.

## Running

No build step. Serve with any static HTTP server (ES modules require HTTP, not `file://`):

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`. Always test locally before pushing to GitHub Pages.

## Architecture

**5 core files, no framework, no bundler:**

- `index.html` — All views in one HTML (menu, lobby, room, game, leaderboard). Views toggled via `.hidden` class on direct children of `main.content`. Event delegation on `[data-action]` attributes. Bangumi import UI is in a `position:fixed` bottom bar, **outside** the view system — do NOT put interactive elements (inputs) inside `.container` or `.content`.
- `app.js` — ES module. All game logic, Firebase multiplayer, AniList API, iTunes API, sakura canvas, audio playback, custom songs CRUD, Bangumi index import.
- `songs.js` — Exports `SONGS` array (600+ entries), `ALL_ANIME`, `AVAILABLE_YEARS`, `AVAILABLE_TYPES`. Each song: `{ titleCN, title, anime, artist, year, type }`.
- `style.css` — All styles. CSS custom properties for theming. Note: `.container` must NOT use `overflow: hidden` (causes invisible text in inputs).
- `index_75323.json` — Pre-fetched Bangumi index #75323 (108 anime). Format: `{ total, items: [{ id, name, name_cn, date }] }`. The import flow checks for `index_{id}.json` first before trying proxy.

## Input Field Critical Bug

**Do NOT place `<input>` elements inside `.container` or any element with `overflow: hidden` + `border-radius`.** This combination causes typed text to be invisible in Chrome/Edge (the input receives key events and `e.target.value` is correct, but text is not rendered visually). If you need an input, either:
- Place it outside `.container` (e.g., in a `position:fixed` bar)
- Or use only inline styles with no CSS class dependencies

## Key Systems

**Audio:** iTunes Search API (`country=JP`) with `artist + title` query. Preview URLs cached via `MemCache` (in-memory wrapper over localStorage, key: `audio_cache_v1`). Cache key is `${title}|${anime}`. 5s timeout per request. Falls back to title-only search, then `title + anime`.

**Multiplayer:** Firebase Firestore (project: `animequiz-a16c1`). Anonymous auth. Rooms at `artifacts/{projectId}/public/data/rooms/{roomId}`. Real-time sync via `onSnapshot`.

**Anime metadata:** AniList GraphQL API (`https://graphql.anilist.co`) for cover images and romaji titles. Cached in `MemCache` (`anime_detail_cache_v1`).

**Bangumi links:** Bangumi API (`https://api.bgm.tv/search/subject/anime`) with CORS support. Also used: `https://api.bgm.tv/v0/indices/{id}/subjects` for index import (no CORS, requires proxy).

**Filters (in Settings modal):**
- `filterState.years` — Set-based multi-select
- `filterState.type` — single-select (OP/ED/IN/null)
- `filterState.source` — `null` (all), `'builtin'` (only SONGS), `'custom'` (only custom)
- Applied via `getFilteredSongs()` → calls `getAllSongs()` which merges `SONGS` + `getCustomSongs()`

**Custom Song Library:**
- Stored in localStorage (`custom_songs_v1`)
- Import via Bangumi index: checks `index_{id}.json` locally, falls back to CORS proxy (`cors-anywhere.fly.dev`) → API, then HTML parsing
- Import from JSON file: `importCustomSongsFile(file)`
- Export to JSON: `exportCustomSongs()`
- Each song: `{ title, titleCN, anime, artist, year, type }`

**Bangumi Index Import:**
1. Check local `index_{id}.json` file (fetched from same origin, no CORS issue)
2. If not found, try CORS proxy → Bangumi v0 API
3. Fallback: CORS proxy → parse Bangumi index HTML page
4. Filter to `type === 2` (anime only)
5. For each anime: get romaji title from AniList, search iTunes, add up to 2 songs

**MemCache:** In-memory Map wrapping localStorage for O(1) reads:
```js
const audioCache = new MemCache('audio_cache_v1', 500);
const animeDetailCache = new MemCache('anime_detail_cache_v1', 300);
```

**Keyboard Shortcuts:**
- `1-4`: select answer option (only during gameplay, when not locked and no detail/settings open)
- `Space`: play/pause
- `Escape`: close modals
- All shortcuts skip when `document.activeElement` is `INPUT` or `TEXTAREA`

## Song Data

When adding songs, maintain the format exactly. The `title` field is used as the iTunes search term and cache key. Run this to verify no duplicates:

```bash
node -e "const fs=require('fs');const c=fs.readFileSync('songs.js','utf-8');const m=c.match(/export const SONGS = (\\[[\\s\\S]*?\\]);/);const s=eval(m[1]);const seen=new Set();const d=[];s.forEach(x=>{const k=x.title+'|'+x.anime;if(seen.has(k))d.push(k);seen.add(k);});if(d.length){console.log('Dupes:',d);process.exit(1);}console.log('OK:',s.length,'songs');"
```

## Deployment

GitHub Pages via `gh` CLI. After push, wait for build:
```bash
gh api repos/Yuki3303-a11y/anime-song/pages | grep status
```

## Proxy

- App: no proxy needed for users
- Dev CLI (curl/git push): may need `http://127.0.0.1:7897` (Clash Verge)
- Git push: `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push`
