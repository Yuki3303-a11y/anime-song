# Integrations

## Firebase Firestore
- **Project ID**: `animequiz-a16c1`
- **SDK Version**: 11.6.1 (via CDN: `www.gstatic.com/firebasejs/11.6.1/`)
- **Auth Method**: Anonymous Authentication (`signInAnonymously`)
- **User Identity**: UID displayed as first 6 characters in header status pill

### Collections / Document Paths
| Path | Purpose | Fields |
|---|---|---|
| `artifacts/animequiz-a16c1/public/data/rooms/{roomId}` | Multiplayer game rooms | `host`, `guest`, `status`, `timestamp`, `scores` (uid→score map), `questions` |

### Firestore Operations
- `setDoc` — Create room on host start
- `getDoc` — Look up room on guest join
- `updateDoc` — Set guest, update status, update scores
- `onSnapshot` — Real-time listener for room state changes
- `serverTimestamp` — Room creation timestamp

### Invite Flow
- Room ID embedded in URL query string (`?room=XXXX`)
- `checkInvite()` auto-fills room ID and navigates to lobby
- `navigator.share()` for native sharing; `navigator.clipboard.writeText()` fallback

---

## iTunes Search API
- **Endpoint**: `https://itunes.apple.com/search`
- **Parameters**: `term`, `media=music`, `entity=song`, `limit=5`, `country=JP`
- **Purpose**: Fetch 30-second song preview URLs for audio playback
- **Fallback chain**: `artist + title` → `title` alone → `title + "anime"`
- **Cache**: Results cached in `audio_cache_v1` MemCache (keyed by `title|anime`)
- **Timeout**: 5 seconds per request
- **CORS**: Supported (no proxy needed)

---

## AniList GraphQL API
- **Endpoint**: `https://graphql.anilist.co`
- **Auth**: None (public API)
- **Method**: POST with JSON body
- **Purpose**: Fetch anime cover images and romaji titles
- **Queries**: Lightweight (romaji only, for Bangumi import) and full detail (romaji + coverImage + id)
- **Cache**: Results cached in `anime_detail_cache_v1` MemCache
- **Timeout**: 4 seconds

---

## Bangumi API (bgm.tv)

| Endpoint | CORS | Purpose |
|---|---|---|
| `https://api.bgm.tv/search/subject/{keyword}?limit=10&type=2` | Yes | Search for anime subjects |
| `https://api.bgm.tv/v0/indices/{id}/subjects?limit=100&offset=N` | No | Fetch all subjects in an index |
| `https://bgm.tv/index/{id}` | No | HTML page (regex parsing fallback) |
| `https://bgm.tv/subject/{id}` | N/A | Direct link in detail modal |

### Bangumi Matching Logic
1. Filter to `type === 2` (anime only)
2. Exact match on `name_cn` or `name`
3. Starts-with / contains match
4. Fallback to `ANIME_ALT_NAMES` hardcoded mapping (10 entries)
5. Last resort: low-confidence match

---

## CORS Proxy
- **URL**: `https://cors-anywhere.fly.dev/`
- **Purpose**: Adds `Access-Control-Allow-Origin: *` to Bangumi API responses
- **Used by**: `fetchIndexViaProxy()`, `fetchIndexViaHtml()`
- **Fallback chain**: local JSON → proxy + API → proxy + HTML

---

## Local Data Files
- **`index_75323.json`**: Pre-fetched Bangumi index #75323 (108 anime). Format: `{ total, items: [{ id, name, name_cn, date }] }`
- **`songs.js`**: 600+ song entries. Exports `SONGS`, `ALL_ANIME`, `AVAILABLE_YEARS`, `AVAILABLE_TYPES`
