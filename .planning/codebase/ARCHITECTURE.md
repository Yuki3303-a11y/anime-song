# Architecture

## Overview
A static single-page anime music quiz app with no framework, no bundler, and no build step. All views live in a single `index.html` and are toggled via `.hidden` CSS class. The app is an ES module (`app.js`) importing Firebase SDK from CDN for multiplayer, iTunes Search API for audio, AniList GraphQL for metadata, and Bangumi API for index imports. The Bangumi floating panel lives **outside** `.container` as `position:fixed` to avoid a Chrome/Edge text rendering bug triggered by `overflow: hidden` + `border-radius`.

## View System
Navigation via `showView(viewName)`: adds `.hidden` to all `.content > div`, then removes `.hidden` from target `v-{viewName}`.

| View ID | Description |
|---------|-------------|
| `v-menu` | Main menu (default visible) |
| `v-lobby` | Multiplayer lobby |
| `v-room` | PK waiting room |
| `v-game` | Gameplay (audio, options, scores) |
| `v-leaderboard` | Local leaderboard |
| `settingsModal` | Settings overlay (outside `.content`) |
| `endModal` | End-of-game modal |
| `animeDetailModal` | Anime detail modal |

## Data Flow

### Single Player
`menu → startSingle() → getFilteredSongs() → shuffle → loadQuestion() → fetchAudio() (iTunes) → renderOptions() → handleAnswer() → showAnimeDetail() (AniList + Bangumi) → nextQuestion() → endGame()`

### Multiplayer PK
`lobby → pkCreate()/pkJoin() → enterRoom() → onSnapshot (Firestore) → pkStart() → loadQuestion() → updateDoc(scores) → endGame()`

### Bangumi Import
1. Check `index_{id}.json` (local, no CORS)
2. CORS proxy → Bangumi v0 API
3. CORS proxy → parse HTML (regex)
4. Filter type=2 → AniList romaji → iTunes search → addCustomSong()

## Filter System
- `filterState.years` — Set (multi-select)
- `filterState.type` — null/OP/ED/IN (single-select)
- `filterState.source` — null/builtin/custom (single-select)
- `getFilteredSongs()` merges `SONGS` + custom songs, then filters
