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
- `app.js` — ES module. All game logic, Firebase multiplayer, AniList API, iTunes API, YouTube API, sakura canvas, audio playback, custom songs CRUD, Bangumi index import. ~2800 lines.
- `songs.js` — Exports `SONGS` array (562 entries), `ALL_ANIME`, `AVAILABLE_YEARS`, `AVAILABLE_TYPES`. Each song: `{ titleCN, title, anime, artist, year, type }`. `title` field is the iTunes search term and cache key.
- `style.css` — All styles. CSS custom properties for theming. Note: `.container` must NOT use `overflow: hidden` (causes invisible text in inputs).
- `index_75323.json` — Pre-fetched Bangumi index #75323 (108 anime). Format: `{ total, items: [{ id, name, name_cn, date }] }`. The import flow checks for `index_{id}.json` first before trying proxy.

## Input Field Critical Bug

**Do NOT place `<input>` elements inside `.container` or any element with `overflow: hidden` + `border-radius`.** This combination causes typed text to be invisible in Chrome/Edge (the input receives key events and `e.target.value` is correct, but text is not rendered visually). If you need an input, either:
- Place it outside `.container` (e.g., in a `position:fixed` bar)
- Or use only inline styles with no CSS class dependencies

## Audio System (Critical — three-way consistency)

The audio pipeline must ensure the quiz 30s preview, the full version (detail modal), and the displayed anime/song metadata reference the **same song**. Do not introduce separate search paths.

**Quiz audio fetch (`fetchAudio(title, artist, anime)`):**
1. Check `audioCache` (MemCache with 24h TTL, key = `${title}|${anime}`)
2. iTunes search (JP store, 4 strategy tiers, 5s timeout each):
   - `artist + title` → `artist + title + anime` → `title + anime` → `title`
3. Each result scored via `scoreMatch()`: exact title +100, partial +60/+30, artist exact +50/partial +25/mismatch -20, collection contains anime name +30. Threshold: score >= 40.
4. If all iTunes tiers fail → YouTube fallback (`searchYouTube`)
5. **Returns a rich object** `{url, source:'itunes'|'youtube', itunesTrack, itunesArtist, ytVideoId, ytQuery}`, NOT a plain URL string
6. Result saved to `gameState.lastAudioResult` so the full player can reuse it

**Full version search (`searchAndLoadFullSong`):**
1. Check `gameState.lastAudioResult`:
   - `source === 'youtube'` → reuse the exact same `ytVideoId` (zero API call)
   - `source === 'itunes'` → build YouTube query from `itunesTrack + itunesArtist` (actual matched metadata, not songs.js data)
   - Neither → fall back to independent search
2. If YouTube fails → fall back to iTunes preview via `fetchAudio`

**Cache format (backward compat critical):** Old entries are plain strings (`"url"` or `"yt:videoId"`). New entries are objects `{url, source, ...}`. `normalizeAudioEntry()` upgrades old entries on read. All callers must extract `.url` from the enriched result, not treat it as a bare string.

**Scoring details:** The `scoreMatch` function inside `fetchAudio` uses the anime name to check `collectionName`. If the album/collection contains the anime name, +30 bonus. This is the strongest signal for anime song matching when artist/title are ambiguous.

**YouTube API key rotation:** 5 keys in `YT_API_KEYS` array, each 100 searches/day. `searchYouTube()` detects 403/429 responses, marks key exhausted, auto-switches. Add more keys to the array to increase quota.

## MemCache

In-memory Map wrapping localStorage with TTL and debounced writes:

```js
class MemCache {
    constructor(key, maxEntries, ttlMs)  // ttlMs optional, undefined = no expiry
    // Entries stored as {value, ts} wrappers when TTL is set
    // Writes debounced 200ms (_scheduleFlush) to avoid blocking main thread
}
```

Three instances:
- `audioCache` = `new MemCache('audio_cache_v2', 500, 24*60*60*1000)` — 24h TTL
- `animeDetailCache` = `new MemCache('anime_detail_cache_v1', 300)` — no TTL (anime data doesn't expire)
- `youtubeCache` = `new MemCache('youtube_cache_v1', 200)` — no TTL

## Song Data Quality

**Do NOT add speculative/fabricated entries.** Every song must be verified:
- Artist actually performed that OP/ED for that anime
- Title and romanization are correct
- Year and type (OP/ED/IN) are accurate
- No entries for unaired anime (songs not announced yet)

Run this to verify no duplicates after any changes:

```bash
node -e "const fs=require('fs');const c=fs.readFileSync('songs.js','utf-8');const m=c.match(/export const SONGS = (\[[\s\S]*?\]);/);const s=eval(m[1]);const seen=new Set();const d=[];s.forEach(x=>{const k=x.title+'|'+x.anime;if(seen.has(k))d.push(k);seen.add(k);});if(d.length){console.log('Dupes:',d);process.exit(1);}console.log('OK:',s.length,'songs');"
```

Never change or rename this script's logic — the eval approach works with the ES module format.

## Key Systems

**Multiplayer:** Firebase Firestore (project: `animequiz-a16c1`). Anonymous auth. Rooms at `artifacts/{projectId}/public/data/rooms/{roomId}`. Real-time sync via `onSnapshot`. Free tier: 50K reads/day, 20K writes/day (~600 PK games/day).

**Anime metadata:** AniList GraphQL API (`https://graphql.anilist.co`) for cover images and romaji titles. Cached in `animeDetailCache`. Bangumi API (`https://api.bgm.tv/search/subject/anime`) for detail links.

**Bangumi Index Import (`importFromBangumi`):**
1. Check local `index_{id}.json` → CORS proxy → API → HTML parsing
2. Filter to `type === 2` (anime only)
3. For each anime: AniList romaji → iTunes search via `searchItunesForAnime()`
4. **Import scoring (`scoreImportResult`):** Album contains anime name +50, album contains romaji +30, known anime artist +20, real-looking track name +10. Min score 30 to accept. Max 2 songs per anime.

**Custom Song Library:** localStorage (`custom_songs_v1`). Merged with `SONGS` via `getAllSongs()`.

**Filters:** `filterState.years` (Set multi-select), `filterState.type` (OP/ED/IN/null), `filterState.source` (null/all/builtin/custom). Applied via `getFilteredSongs()`.

**Sakura Canvas:** Particle system throttled to ~24fps with 15 petals + 8 stars. Debounced resize. CSS `will-change: transform` on animated elements, reduced blur-radius on `.bg-deco` for GPU performance.

**Keyboard Shortcuts:**
- `1-4`: select answer (only during gameplay, not locked, no modal open)
- `Space`: play/pause
- `Escape`: close modals
- `ArrowLeft/Right`: prev/next question
- All skip when `document.activeElement` is `INPUT` or `TEXTAREA`

## Race Condition Guards

- `gameState.fetchGeneration` — incremented in `loadQuestion()`, checked in `fetchAudio().then()` to discard stale responses
- `gameState.lastAudioResult` — bridges quiz audio result to full player, preventing independent searches
- `audio.onerror` handler also has generation guard
- `renderOptions` uses closure-captured `correctAnime` (not `gameState.correctAnime`) to prevent race with recursive `loadQuestion()` calls

## Deployment

GitHub Pages via `gh` CLI. Push to master auto-deploys. Check status:
```bash
gh api repos/Yuki3303-a11y/anime-song/pages | grep status
```

Live URL: `https://yuki3303-a11y.github.io/anime-song/`

## Proxy

- App: no proxy needed for users
- Dev CLI (curl/git push): may need `http://127.0.0.1:7897` (Clash Verge)
- Git push with proxy: `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push`
