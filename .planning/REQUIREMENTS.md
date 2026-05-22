# Requirements

## v1 — Bug Fix & Cleanup

### PK Connection Reliability
- [x] **PK-01**: PK room creation adds retry logic (3 attempts, 1s backoff) with specific error messages
- [x] **PK-02**: PK room joining adds retry logic with better error handling
- [x] **PK-03**: Replace empty catch blocks in Firebase functions with console.error logging
- [x] **PK-04**: Add connection status check before PK operations (warn if offline)

### Error Handling
- [x] **ERR-01**: Replace all 14+ empty `catch {}` blocks with `console.error` + context
- [x] **ERR-02**: Replace generic error messages with specific ones
- [x] **ERR-03**: Add `confirm()` dialog before `clearCustom` operation
- [x] **ERR-04**: Add `confirm()` dialog before individual song deletion

### Project Cleanup
- [x] **CLEAN-01**: Delete debug files (debug2.html through debug13.html)
- [x] **CLEAN-02**: Delete `app_minimal.js`
- [x] **CLEAN-03**: Remove 14 unused CSS classes
- [x] **CLEAN-04**: Remove unused CSS animation: `@keyframes scoreBump`
- [x] **CLEAN-05**: Remove unused `@keyframes playRing`
- [x] **CLEAN-06**: Merge two separate `document.click` listeners into one handler
- [x] **CLEAN-07**: Extract 8 magic timeout/retry numbers to named constants

### Verified (no change needed)
- ✓ Single-player quiz flow (start → load → answer → end)
- ✓ Bangumi index import (fixed position panel works)
- ✓ Keyboard shortcuts (1-4, Space, Escape) with input guard
- ✓ Settings filters (year, type, source) in modal
- ✓ Anime detail modal with AniList covers

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PK-01 | 1 | Done |
| PK-02 | 1 | Done |
| PK-03 | 1 | Done |
| PK-04 | 1 | Done |
| ERR-01 | 2 | Done |
| ERR-02 | 2 | Done |
| ERR-03 | 2 | Done |
| ERR-04 | 2 | Done |
| CLEAN-01 | 3 | Done |
| CLEAN-02 | 3 | Done |
| CLEAN-03 | 3 | Done |
| CLEAN-04 | 3 | Done |
| CLEAN-05 | 3 | Done |
| CLEAN-06 | 3 | Done |
| CLEAN-07 | 3 | Done |
