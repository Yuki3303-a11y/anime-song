# 萌豚挑战 (Anime Music Quiz)

## What This Is
A browser-based anime music quiz app where users listen to 30-second song previews and guess which anime they're from. Supports single-player and multiplayer PK via Firebase Firestore. 600+ built-in songs with custom song import from Bangumi indices.

## Core Value
Instant, delightful anime music trivia — single click to start, no account needed, works on any device.

## Context
- **Status:** Active development, deployed on GitHub Pages
- **Users:** Friends and anime community (small user base via shared links)
- **Tech:** Vanilla JS ES module, Firebase, iTunes API, AniList, Bangumi API
- **Repo:** `github.com/Yuki3303-a11y/anime-song`

## Current Milestone: Bug Fix & Cleanup

### Objectives
1. Fix PK room connection reliability issues
2. Clean up project (remove debug files, unused CSS, dead code)
3. Improve error handling in network calls

## Requirements

### Validated (existing)
- ✓ Single-player quiz with configurable question count
- ✓ Multiplayer PK via Firebase Firestore rooms
- ✓ 600+ built-in songs with year/type/source filters
- ✓ Bangumi index import for custom song library
- ✓ Anime detail modal with AniList covers and Bangumi links
- ✓ Keyboard shortcuts (1-4, Space, Escape)
- ✓ Local leaderboard with top 10 records
- ✓ Floating Bangumi import panel (fixed positioning workaround)

### Active
- [ ] **PK-01**: PK room creation/joining works reliably (retry logic, better error messages)
- [ ] **CLEAN-01**: Remove debug HTML files (debug2.html through debug13.html)
- [ ] **CLEAN-02**: Remove unused CSS classes (~140 lines: `.custom-import-row`, `.bangumi-input`, etc.)
- [ ] **CLEAN-03**: Remove unused CSS animation (`scoreBump`)
- [ ] **CLEAN-04**: Remove `app_minimal.js` and `test_input.html`
- [ ] **ERR-01**: Replace empty catch blocks with error logging (14+ locations)
- [ ] **ERR-02**: Add user-facing error details for common failures
- [ ] **ERR-03**: Add confirmation dialog before `clearCustom` operation

### Out of Scope
- Full app.js module splitting — deferred to next milestone
- XSS sanitization overhaul — deferred
- Service worker / offline support — deferred

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cleanup before feature work | Dirty repo slows development | Focus on cleanup first |
| Don't split app.js yet | User prefers clean over restructure | Defer to next milestone |
| Keep current fixed-position input workaround | Working fine, no need to fix root cause | Documented in codebase map |

## Evolution
This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-05-22 after initialization*
