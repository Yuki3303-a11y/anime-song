# Personal Library Implementation Plan

**Goal:** Add a seasonal library page, a local watchlist filter, and a local mistake and audio feedback workflow for single-player mode.

**Architecture:** Keep published seasonal pools static. Put pure grouping, identity, filtering, and bounded record updates in `library-tools.mjs`; keep browser storage and DOM wiring in `app.js`. Preserve PK's `SONGS` index and Firebase schema.

**Tech Stack:** Existing vanilla HTML/CSS/ES modules, Node's built-in test runner, browser `localStorage`.

---

### Task 1: Library data rules

- [x] Write tests for season grouping, anime identity, watched filtering, audio status, mistake deduplication, and feedback bounds.
- [x] Run tests to observe failures.
- [x] Implement `library-tools.mjs` and rerun tests.

### Task 2: Seasonal and watchlist UI

- [x] Add a single-player library view with published quarter tabs, 15 anime cards, OP/ED rows, and honest local playback status.
- [x] Add searchable all-anime watchlist management and a persisted "only watched" setting that composes with source/type filters.
- [x] Add a one-click seasonal start action; keep PK untouched.
- [x] Test filtering and UI behavior at desktop and narrow widths.

### Task 3: Mistake practice and audio feedback

- [x] Record wrong single-player answers only; show a mistake list and allow targeted practice, including one-song practice with answer options drawn from the wider library.
- [x] Record local playback successes/failures; allow per-song feedback with reason and optional note, and let users copy/export their local feedback.
- [x] Make local-only storage clear in the UI and cap persisted records.
- [x] Run the full test suite, catalog validation, syntax checks, and browser flows.

**Constraints:** No database migration, no new framework, no change to PK question indices, no automatic claim that a published song can play until a local playback has succeeded.
