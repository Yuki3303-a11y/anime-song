# Concerns

## Critical Issues

### 1. XSS via custom song import (unsanitized innerHTML)
- `app.js` `updateCustomSongsUI()`: `${s.titleCN || s.title}` and `${s.anime}` injected directly into `innerHTML`. A malicious JSON import file could inject arbitrary HTML/JS.
- `showAnimeDetail()`: `${songName}` and `${song.artist}` also via `innerHTML`, values sourced from custom songs in localStorage.

### 2. CORS proxy dependency
- `cors-anywhere.fly.dev` is a third-party service with no SLA. If it goes down, Bangumi index import breaks for all indices without pre-fetched JSON files.

### 3. Firebase API key hardcoded
- Full Firebase config (apiKey, projectId, etc.) embedded in plain text in `app.js`.

### 4. No confirmation before clearing custom songs
- `clearCustom` instantly calls `setCustomSongs([])` with no confirmation dialog.

### 5. Partial import with no rollback
- Songs added one-by-one during import. If import fails midway, partial state is persisted.

## Technical Debt
- Monolithic `app.js` (1444 lines, no module splitting)
- No build step / no minification
- ~140 lines of unused CSS classes (`.custom-import-row`, `.bangumi-input`, etc.) — replaced by inline styles in FAB
- 12 debug HTML files left in repo root
- Two separate `document.click` listeners could be merged
- 14+ empty `catch {}` blocks swallowing errors silently
- Hardcoded magic numbers (timeouts: 300ms, 5000ms, 20000ms, 4000ms)

## Security
- No Content Security Policy (CSP)
- No input sanitization on imported song data (title, anime, artist all stored raw)
- Firebase anonymous auth — no abuse protection
- No HTTPS enforcement / no HSTS

## Reliability Risks
- iTunes API dependency (no SLA, rate limits undocumented)
- AniList rate limits (90 req/min unauthenticated) — import loop may exceed
- Bangumi API CORS inconsistency (search has CORS, index doesn't)
- localStorage size limit (5-10MB combined with cache + custom songs)
- Firebase connectivity required for PK mode

## UX Issues
- No loading indicator during audio fetch
- "音频获取失败" silently skips songs
- Keyboard shortcuts don't check IME composition state (`e.isComposing`)
- `roomIdInput` inside `.container` may trigger Chrome text rendering bug
- Generic error messages ("播放失败，请重试")

## Top 3 Recommendations
1. **Sanitize innerHTML** — use `textContent` or HTML escaping on user-provided strings
2. **Add confirmation dialog** — for `clearCustom` and individual song deletion
3. **Add error logging** — replace empty `catch {}` blocks with `console.error` + optional remote logging
