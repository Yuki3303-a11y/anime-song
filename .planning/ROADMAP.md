# Roadmap

## Milestone: Bug Fix & Cleanup (v1)

Status: Planning

---

### Phase 1 -- PK Connection Reliability

**Goal:** Make multiplayer PK room creation and joining work reliably with retry logic, better error reporting, and offline detection.

**Mode:** mvp

**Requirements:**
| REQ-ID | Description |
|--------|-------------|
| PK-01 | PK room creation: 3-retry with 1s backoff + specific error messages |
| PK-02 | PK room joining: retry logic with better error handling |
| PK-03 | Replace empty catch blocks in Firebase functions with console.error logging |
| PK-04 | Connection status check before PK operations (warn if offline) |

**Success Criteria:**
1. Creating a PK room succeeds on first attempt under normal network conditions; retries and surfaces a meaningful error on failure.
2. Joining a PK room retries on transient failures and surfaces the correct error message ("加入房间失败，请检查房间号" vs generic).
3. All Firebase catch blocks log errors with context instead of swallowing silently.
4. Attempting PK operations while offline shows a clear warning instead of a silent failure.

**Build Order Rationale:**
PK multiplayer is the most-used feature after single-player. Unreliable room connectivity directly impacts the core multiplayer experience. Fixing these issues first delivers the highest user-facing value. PK-03 (Firebase catch blocks) is grouped here because it shares the same code surface as PK-01/PK-02.

---

### Phase 2 -- Error Handling & Safety

**Goal:** Replace all silent failures with logged errors and specific user-facing messages; add confirmation dialogs for destructive actions.

**Mode:** mvp

**Requirements:**
| REQ-ID | Description |
|--------|-------------|
| ERR-01 | Replace all 14+ empty `catch {}` blocks with `console.error` + context |
| ERR-02 | Replace generic error messages with specific ones |
| ERR-03 | Add `confirm()` dialog before `clearCustom` operation |
| ERR-04 | Add `confirm()` dialog before individual song deletion |

**Success Criteria:**
1. Every catch block in the codebase logs an error with contextual information (no empty `catch {}` exists).
2. User-facing error messages are specific to the operation that failed (network, room, import, etc.).
3. Both `clearCustom` and individual song deletion prompt a confirmation dialog before executing.
4. No silent failures remain — every caught error is either logged, shown to the user, or both.

**Build Order Rationale:**
Phase 1 handles PK-specific error paths; this phase covers the remaining 14+ empty catch blocks across the rest of the codebase plus user-facing safety improvements. Doing this after PK ensures the PK error handling patterns can be reused as a template for other areas. The confirmation dialogs (ERR-03, ERR-04) are simple DOM changes that fit naturally here.

---

### Phase 3 -- Code Cleanup

**Goal:** Remove all debug files, unused CSS, dead code, and tidy up structural issues.

**Mode:** mvp

**Requirements:**
| REQ-ID | Description |
|--------|-------------|
| CLEAN-01 | Delete debug files: debug2.html through debug13.html, debug_input.html |
| CLEAN-02 | Delete `app_minimal.js` |
| CLEAN-03 | Remove unused CSS classes: `.custom-import-row`, `.bangumi-input`, `.import-status`, `.import-progress-bar`, `.import-progress-fill`, `.custom-songs-list`, `.custom-empty`, `.custom-song-item`, `.custom-song-info`, `.custom-song-title`, `.custom-song-anime`, `.custom-song-del`, `.custom-actions` |
| CLEAN-04 | Remove unused `@keyframes scoreBump` |
| CLEAN-05 | Remove unused `@keyframes playRing` |
| CLEAN-06 | Merge two separate `document.click` listeners into one handler |
| CLEAN-07 | Extract magic numbers to named constants (timeout values) |

**Success Criteria:**
1. Zero debug files remain in the repo root (verified by glob for `debug*.html`).
2. Zero unused CSS selectors or keyframe animations remain in `style.css`.
3. No dead JS files (`app_minimal.js`, `test_input.html`) exist.
4. `document.click` is handled by a single listener; magic numbers (timeouts) are named constants.

**Build Order Rationale:**
Cleanup is intentionally last. Removing files (CLEAN-01, CLEAN-02) and CSS (CLEAN-03 through CLEAN-05) is low-risk but noisy — doing it after bugfixes avoids merge conflicts and ensures the cleanup doesn't accidentally remove CSS that PK or error-handling changes depend on. CLEAN-06 (event listener merge) and CLEAN-07 (magic numbers) are minor structural improvements that are safe to batch here.

---

*Last updated: 2026-05-23*
