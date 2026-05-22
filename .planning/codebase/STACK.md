# Tech Stack

## Runtime
- Browser-only JavaScript (ES modules, no transpilation, no bundler)
- Served via any static HTTP server (`python -m http.server 8080` locally)
- Language: JavaScript (Vanilla, no TypeScript)
- Target: Modern browsers (Chrome, Edge, Firefox, Safari) with ES module support

## Frontend
- **No framework** -- Vanilla JS with ES modules (`<script type="module">`)
- **CSS** -- Single `style.css` file, CSS custom properties for theming (gradient backgrounds, rounded cards, pink/purple color scheme)
- **Google Fonts** -- `Noto Sans SC` (weights 300, 400, 500, 700, 900), loaded via `<link>` from `fonts.googleapis.com`
- **HTML** -- Single `index.html`, all views as sibling `<div>` elements inside `<main.content>`, toggled via `.hidden` class
- **Event handling** -- `document.addEventListener('click')` with `[data-action]` attribute delegation pattern
- **Canvas** -- `<canvas id="sakuraCanvas">` for animated falling sakura petals (8 particles, pure JS animation loop)
- **Web Audio API** -- `AudioContext` for simple beep sound effects (correct/wrong answer feedback)
- **CSS visualizer** -- 8 animated `.vis-bar` divs simulating an audio visualizer during playback

## APIs & External Services

### Firebase (Firebase JS SDK v11.6.1 via CDN)
- **Purpose**: Multiplayer real-time sync, anonymous user identity
- **Auth**: Anonymous sign-in (`signInAnonymously`)
- **CDN modules**: `firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`
- **Project**: `animequiz-a16c1`
- **Usage**: Room creation/joining, real-time score sync via `onSnapshot`, game start coordination

### iTunes Search API
- **Purpose**: Fetch 30-second song preview URLs
- **Endpoint**: `https://itunes.apple.com/search?term=...&media=music&entity=song&limit=5&country=JP`
- **Auth**: None (public API)
- **Usage**: Searched with JP country code for Japanese anime music; results cached via MemCache

### AniList GraphQL API
- **Purpose**: Fetch anime cover images and romaji titles
- **Endpoint**: `https://graphql.anilist.co`
- **Auth**: None (public GraphQL API)

### Bangumi API (bgm.tv)
- Search: `https://api.bgm.tv/search/subject/{keyword}` (has CORS)
- Index v0: `https://api.bgm.tv/v0/indices/{id}/subjects` (no CORS)
- Web: `https://bgm.tv/index/{id}` (no CORS, HTML parsing fallback)

### CORS Proxy
- **URL**: `https://cors-anywhere.fly.dev/`
- **Purpose**: Bypass CORS restrictions on Bangumi's v0 API and index HTML pages

## Storage

### localStorage Keys

| Key | Purpose | Format | Max Entries |
|---|---|---|---|
| `audio_cache_v1` | Cached iTunes preview URLs | `{ "SongTitle|AnimeName": "https://...previewUrl" }` | 500 |
| `anime_detail_cache_v1` | Cached anime metadata | `{ "AnimeName": { image, bangumiId, titleRomaji } }` | 300 |
| `custom_songs_v1` | User's custom song library | `[{ title, titleCN, anime, artist, year, type }]` | unlimited |
| `aq_rec` | Local leaderboard records | `[{ s: score, m: mode, c: maxCombo, r: correctCount, t: date }]` | 50 |

### MemCache (In-Memory Wrapper)
- Custom class wrapping localStorage with in-memory Map for O(1) reads
- Lazy-loads on first access, writes back on `set()` with dirty-flag optimization
- LRU-like eviction: oldest entries removed when exceeding `maxEntries`

### Firebase Firestore
- Path: `artifacts/{projectId}/public/data/rooms/{roomId}`
- Document fields: `host`, `guest`, `status` (waiting/playing), `timestamp`, `scores`, `questions`

## Build & Deploy
- **Build**: None -- zero build step, zero dependencies, zero package.json
- **Local dev**: `python -m http.server 8080`
- **Deployment**: GitHub Pages via `gh` CLI
- **Repository**: `https://github.com/Yuki3303-a11y/anime-song.git`
- **Cache busting**: Query strings on script/css (`?v=2`)
