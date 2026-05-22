# Roadmap

## Milestone: Bug Fix & Cleanup (v1)

Status: Complete

---

### Phase 1 -- PK Connection Reliability [x] -- Complete 2026-05-23

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

---

### Phase 2 -- Error Handling & Safety [x] -- Complete 2026-05-23

**Goal:** Replace all silent failures with logged errors and specific user-facing messages; add confirmation dialogs for destructive actions.

**Mode:** mvp

**Requirements:**
| REQ-ID | Description |
|--------|-------------|
| ERR-01 | Replace all 14+ empty `catch {}` blocks with `console.error` + context |
| ERR-02 | Replace generic error messages with specific ones |
| ERR-03 | Add `confirm()` dialog before `clearCustom` operation |
| ERR-04 | Add `confirm()` dialog before individual song deletion |

---

### Phase 3 -- Code Cleanup [x] -- Complete 2026-05-23

**Goal:** Remove all debug files, unused CSS, dead code, and tidy up structural issues.

**Mode:** mvp

**Requirements:**
| REQ-ID | Description |
|--------|-------------|
| CLEAN-01 | Delete debug files: debug2.html through debug13.html |
| CLEAN-02 | Delete `app_minimal.js` |
| CLEAN-03 | Remove 14 unused CSS classes |
| CLEAN-04 | Remove unused `@keyframes scoreBump` |
| CLEAN-05 | Remove unused `@keyframes playRing` |
| CLEAN-06 | Merge two separate `document.click` listeners into one handler |
| CLEAN-07 | Extract 8 magic timeout/retry numbers to named constants |

---

*Last updated: 2026-05-23*
