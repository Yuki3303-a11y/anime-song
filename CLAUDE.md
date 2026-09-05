# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"萌豚挑战" — a static single-page anime music quiz app. Users listen to 30-second song previews and guess which anime they're from. Game modes: guess the anime, guess the song title, guess the artist, mixed mode, plus multiplayer PK via Firebase.

## Running

No build step. Serve with any static HTTP server (ES modules require HTTP, not `file://`):

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`. Always test locally before pushing to GitHub Pages.

## Architecture

**5 core files, no framework, no bundler:**

- `index.html` — All views in one HTML (menu, lobby, room, game, leaderboard). Views toggled via `.hidden` class on direct children of `main.content`. Event delegation on `[data-action]` attributes. Bangumi import UI is in a `position:fixed` bottom bar, **outside** the view system — do NOT put interactive elements (inputs) inside `.container` or `.content`.
- `app.js` — ES module. All game logic, Firebase multiplayer, AniList API, iTunes API, YouTube API, sakura canvas, audio playback, custom songs CRUD, Bangumi index import. ~3300 lines.
- `songs.js` — Exports `SONGS` array (285 entries / 188 anime), `ALL_ANIME`, `AVAILABLE_TYPES`. Each song: `{ titleCN, title, anime, artist, type }`. `title` field is the iTunes search term and cache key.
- `style.css` — All styles. CSS custom properties for theming. Note: `.container` must NOT use `overflow: hidden` (causes invisible text in inputs).
- `index_75323.json` — Pre-fetched Bangumi index #75323 (108 anime). Format: `{ total, items: [{ id, name, name_cn, date }] }`. The import flow checks for `index_{id}.json` first before trying proxy.

## Input Field Critical Bug

**Do NOT place `<input>` elements inside `.container` or any element with `overflow: hidden` + `border-radius`.** This combination causes typed text to be invisible in Chrome/Edge (the input receives key events and `e.target.value` is correct, but text is not rendered visually). If you need an input, either:
- Place it outside `.container` (e.g., in a `position:fixed` bar)
- Or use only inline styles with no CSS class dependencies

## Key Systems

**Audio:** iTunes Search API (`country=JP`) with `artist + title` query. Preview URLs cached via `MemCache` (in-memory wrapper over localStorage, key: `audio_cache_v2`). Cache key is `${title}|${anime}`. 5s timeout per request. Falls back to title-only search, then `title + anime`, then YouTube Data API, then B站 (via Cloudflare Worker proxy). Audio source preference stored in `audio_source_pref_v1` localStorage key (`null` / `'bilibili-first'` / `'bilibili-only'`).

**Multiplayer:** Firebase Firestore (project: `animequiz-a16c1`). Anonymous auth. Rooms at `artifacts/{projectId}/public/data/rooms/{roomId}`. Real-time sync via `onSnapshot`.

**Anime metadata:** AniList GraphQL API (`https://graphql.anilist.co`) for cover images and romaji titles. Cached in `MemCache` (`anime_detail_cache_v1`).

**Bangumi links:** Bangumi API (`https://api.bgm.tv/search/subject/anime`) with CORS support. Also used: `https://api.bgm.tv/v0/indices/{id}/subjects` for index import (no CORS, requires proxy).

**Filters (in Settings modal):**
- `filterState.years` — Set-based multi-select
- `filterState.type` — single-select (OP/ED/IN/null)
- `filterState.source` — `null` (all), `'builtin'` (only SONGS), `'custom'` (only custom)
- Applied via `getFilteredSongs()` → calls `getAllSongs()` which merges `SONGS` + `getCustomSongs()`

**Anti-repeat question selection:** `buildPlaylist(pool, n)` (app.js) keeps a sliding window of recently played song keys in localStorage (`played_history_v1`) so each song is picked once per full-library cycle before any repeats. Used by single-player (`startMode`) and PK host (`pkCreate`).

**Game modes & hints:**
- `startMode(mode)` starts single-player with `gameMode` = `'anime'` / `'song'` / `'artist'` / `'mixed'`. `startSingle()` is kept as an alias for `startMode('anime')`.
- Each question sets `guessType` (`'anime'` / `'song'` / `'artist'`) — fixed by mode, random in mixed, always `'anime'` in PK.
- `getGuessValue(q, guessType)` extracts the target answer; `buildWrongOptions(q, guessType)` builds 3 distractors — for song mode it excludes same-anime and same-artist songs (relaxed to same-anime only when pool is short), artist mode draws from the ALL_ARTISTS equivalent pool, anime mode from ALL_ANIME.
- `renderHintBar()` / `useHint()` — two hints per question, labels adapt to guessType (`song` → artist/anime hints, `artist` → title/anime hints). Scoring multiplier: `hintMult` starts at 1, one hint ×0.6, both hints ×0.36. Hints disabled in review mode and in PK.
- `recordModeLabel()` stamps the mode into the leaderboard entry (`g` field) and answer history (`guessType` / `correctValue`).

**Library auto-update:**
- `scripts/fetch-season.mjs` — discovers the current-season anime (AniList popularity top-N) and their OP/ED (AnimeThemes API), applies quality gates (max 2 per anime, dedupe vs existing SONGS), writes `candidates.js` + `candidates.md` for manual review. Run: `npm run discover` (or with `--season/--year/--limit`).
- `.github/workflows/update-library.yml` — weekly scheduled workflow (Sun 03:00 UTC, manual dispatch supported) that runs discovery and opens a PR with the candidates.
- After merging new songs into `songs.js`, bump the cache version `?v=26` → next in both `app.js` (songs.js import) and `index.html` (style.css + app.js tags) — `npm run validate` checks they match.

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

**Bilibili (B站) Audio Source:**
- Node proxy (`bili-proxy.mjs`, zero deps, Node built-ins only) — runs on localhost:8765
- Start: double-click `启动B站代理.bat` or `node bili-proxy.mjs` (must be running for B站 mode)
- Frontend auto-probes `localhost:8765` on load (`probeLocalProxy()` in app.js); if reachable, `window.BILI_WORKER_URL` switches to it automatically. Manual override via settings → B站代理地址 (localStorage `bili_proxy_url_v1`).
- Endpoints (compatible with the Vercel `/api/search` contract): `/api/search?q=xxx` (video search), `/api/search?bvid=xxx` (view + playurl DASH audio, durl fallback), `/stream?url=` (CDN audio pipe with Referer header)
- Why it exists: the default Vercel proxy (anime-song-gamma.vercel.app) runs from overseas IPs and B站 WAF rejects its playurl requests (`no audio stream`), so 仅B站 mode failed for every song. Local proxy runs from the user's own IP → no WAF block.
- Failure hinting in app.js: `biliProxyState.reason` is `proxy-down` (network) or `no-stream` (Vercel WAF reject); 仅B站 mode shows actionable guidance on first failure.
- B站 returns DASH audio streams (M4A/AAC) playable via `<audio>` element
- B站 audio URLs expire quickly — never cached long-term in audioCache
- Default `BILI_WORKER_URL` = `https://anime-song-gamma.vercel.app` (Vercel Serverless `/api/search`), overridden by local proxy when running

**MemCache:** In-memory Map wrapping localStorage for O(1) reads:
```js
const audioCache = new MemCache('audio_cache_v2', 500, 24*60*60*1000);
const animeDetailCache = new MemCache('anime_detail_cache_v1', 300);
const youtubeCache = new MemCache('youtube_cache_v1', 200);
const bilibiliCache = new MemCache('bilibili_cache_v1', 200, 24*60*60*1000);
const bilibiliAudioCache = new MemCache('bilibili_audio_cache_v1', 200, 5*60*1000);
```

**Keyboard Shortcuts:**
- `1-4`: select answer option (only during gameplay, when not locked and no detail/settings open)
- `Space`: play/pause
- `Escape`: close modals
- All shortcuts skip when `document.activeElement` is `INPUT` or `TEXTAREA`

## Song Data

When adding songs, maintain the format exactly. The `title` field is used as the iTunes search term and cache key. Run `npm run validate` to verify fields, duplicates, type legality and cache version consistency:

```bash
npm run validate
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
