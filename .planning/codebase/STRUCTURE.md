# File Structure

## Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 284 | All views, modals, floating Bangumi panel |
| `app.js` | 1444 | Main logic: Firebase, game, audio, PK, filters, Bangumi import |
| `songs.js` | 983 | Song database: `SONGS`, `ALL_ANIME`, `AVAILABLE_YEARS`, `AVAILABLE_TYPES` |
| `style.css` | 1534 | All styles, animations, responsive design |
| `index_75323.json` | 652 | Pre-fetched Bangumi index #75323 (108 anime) |

## app.js Sections
| Section | Lines | Purpose |
|---------|-------|---------|
| Firebase | 6-37 | Anonymous auth, Firestore init |
| Game State | 39-62 | `gameState` object, `getMaxScore()` |
| Filter State | 67-76 | `filterState`, `updateFilterCount()` |
| MemCache | 78-116 | localStorage cache wrapper |
| Custom Song Library | 118-398 | CRUD, Bangumi import, iTunes/AniList search |
| Sakura Particles | 639-703 | Canvas animation (8 petals) |
| Audio | 706-720 | Web Audio API beeps |
| View Navigation | 777-791 | `showView()` |
| Single Player | 794-814 | `startSingle()` |
| PK Mode | 817-932 | Room CRUD, real-time sync |
| Game Core | 935-1101 | Questions, audio, answers, combos |
| Playback Controls | 1104-1130 | `togglePlay()` |
| Game End | 1133-1179 | `endGame()`, leaderboard persistence |
| Filters UI | 1222-1307 | Year/type/source chips |
| Settings | 1310-1317 | Modal open/close |
| Keyboard | 1339-1368 | 1-4, Space, Escape shortcuts |
| Event Delegation | 1371-1409 | `data-action` click handler |
| Init | 1429-1444 | Bootstrap all systems |

## localStorage Keys
| Key | Purpose |
|-----|---------|
| `audio_cache_v1` | iTunes preview URLs (max 500) |
| `anime_detail_cache_v1` | Anime metadata cache (max 300) |
| `custom_songs_v1` | User's custom song library |
| `aq_rec` | Local leaderboard records (max 50) |
