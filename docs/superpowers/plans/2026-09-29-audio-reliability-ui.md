# Audio Reliability and Clear Quiz UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Bilibili hit rate, guarantee failed audio cannot leave an answerable silent question, unify volume across playback engines, and apply the approved clear-state quiz UI without changing game rules or data storage.

**Architecture:** Keep the current static frontend and Node proxy. Upgrade the local proxy to the same WBI-signed search contract already used by the Vercel endpoint, add safe backup-CDN streaming, then centralize quiz media state and volume state in `app.js`. The UI remains the existing page structure with a clearer media status, disabled answers until playback is usable, automatic source recovery, and a manual reload action.

**Tech Stack:** Vanilla JavaScript ES modules, Node.js built-ins, HTML/CSS, Node test runner.

---

### Task 1: WBI-signed local Bilibili search

**Files:**
- Modify: `bili-proxy.mjs`
- Test: `tests/bili-proxy.test.mjs`

- [ ] Write tests for deterministic WBI signing, retryable 412 handling, and parsing Bilibili search results.
- [ ] Run `node --test tests/bili-proxy.test.mjs` and confirm the tests fail because the local proxy has no exported WBI helpers.
- [ ] Add Node `crypto` based WBI signing, cached nav keys, explicit Bilibili error handling, and bounded retry/backoff to `bili-proxy.mjs`.
- [ ] Guard `server.listen` so importing the module in tests does not start the proxy.
- [ ] Run `node --test tests/bili-proxy.test.mjs` and confirm all proxy tests pass.

### Task 2: Search aliases and backup CDN support

**Files:**
- Modify: `app.js`
- Modify: `bili-proxy.mjs`
- Modify: `api/search.js`
- Test: `tests/bili-proxy.test.mjs`
- Test: `tests/regressions.test.mjs`

- [ ] Write failing tests proving each Bilibili query gets its own timeout, Chinese song aliases can pass matching, rejected collection keywords do not reject valid “全曲/高音质” uploads, and the backup CDN URL is forwarded.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Normalize punctuation and Unicode, score `title/titleCN`, `anime/animeCN`, artist, and OP/ED context, and issue at most three deduplicated search strategies.
- [ ] Pass `backupUrl` through the frontend and make both local and Vercel stream proxies retry the allowed backup host when the primary CDN fails before response headers are sent.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Shared volume state

**Files:**
- Modify: `app.js`
- Modify: `index.html`
- Test: `tests/regressions.test.mjs`

- [ ] Write failing tests proving one volume update applies to native audio and YouTube and synchronizes all three sliders.
- [ ] Run the focused test and confirm failure with the current split volume handlers.
- [ ] Add one persisted 0–100 volume state, one mute state, and `applyPlayerVolume`/`setPlayerVolume` helpers used by quiz, detail, and playlist controls.
- [ ] Apply the saved volume when YouTube becomes ready and update the main slider to the same 0–100 scale.
- [ ] Run the focused test and confirm it passes.

### Task 4: Media readiness and automatic recovery

**Files:**
- Modify: `app.js`
- Modify: `index.html`
- Test: `tests/regressions.test.mjs`

- [ ] Write failing tests proving answer buttons stay disabled while media is searching/buffering, become enabled on native `canplay` or YouTube `PLAYING`, and a playback timeout invokes recovery instead of waiting for an answer click.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Add centralized quiz media states (`searching`, `buffering`, `ready`, `playing`, `switching`, `failed`) and a generation-safe timeout.
- [ ] Allow `fetchAudioInner` to exclude a failed source, automatically try another source within a bounded retry budget, and skip without counting an answer when no source works.
- [ ] Route native error/stall and YouTube error/start-timeout paths through the same recovery function.
- [ ] Run the focused tests and confirm they pass.

### Task 5: Approved clear-state quiz UI

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`
- Test: `tests/regressions.test.mjs`

- [ ] Write static regression assertions for the live status region, reload action, fallback explanation, volume percentage, disabled answer styling, focus visibility, and reduced motion support.
- [ ] Run the focused assertions and confirm they fail.
- [ ] Implement the approved clear-state layout within the existing game screen: visible source/readiness status, 30-second timing labels, unified volume value, automatic fallback note, and explicit reload action.
- [ ] Replace `transition: all` on touched controls with property-specific transitions and add keyboard focus styles without changing game behavior.
- [ ] Run the focused assertions and confirm they pass.

### Task 6: Full verification

**Files:**
- Verify only.

- [ ] Run `npm test`.
- [ ] Run `npm run validate`.
- [ ] Start the existing local server and proxy, confirm proxy search repeatedly returns results for a previously unstable query, and confirm an audio endpoint exposes a primary and optional backup stream.
- [ ] Test the quiz in the browser: Bilibili-only playback, unified volume on native and YouTube sources, disabled answers before readiness, manual reload, automatic recovery, keyboard focus, and mobile layout.
- [ ] Review `git diff --check`, `git status --short`, and the final diff; report every changed file and any remaining external dependency limits.

## Self-review

- Coverage: Bilibili search, matching, CDN fallback, shared volume, readiness, recovery, UI, automated tests, and browser verification each have a task.
- Scope: No database changes, framework replacement, feature deletion, or song-library removal.
- Test strategy: Every behavior change begins with a failing regression test; final validation includes both automated and live network/browser evidence.
