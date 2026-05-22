# Requirements

## v1 — Bug Fix & Cleanup

### PK Connection Reliability
- [ ] **PK-01**: PK room creation adds retry logic (3 attempts, 1s backoff) with specific error messages
- [ ] **PK-02**: PK room joining adds retry logic with better error handling
- [ ] **PK-03**: Replace empty catch blocks in Firebase functions with console.error logging
- [ ] **PK-04**: Add connection status check before PK operations (warn if offline)

### Error Handling
- [ ] **ERR-01**: Replace all 14+ empty `catch {}` blocks with `console.error` + context
- [ ] **ERR-02**: Replace generic error messages with specific ones ("连接失败，请检查网络" vs "加入房间失败，请检查房间号")
- [ ] **ERR-03**: Add `confirm()` dialog before `clearCustom` operation
- [ ] **ERR-04**: Add `confirm()` dialog before individual song deletion

### Project Cleanup
- [ ] **CLEAN-01**: Delete debug files (debug2.html through debug13.html, debug_input.html)
- [ ] **CLEAN-02**: Delete `app_minimal.js`
- [ ] **CLEAN-03**: Remove unused CSS classes: `.custom-import-row`, `.bangumi-input`, `.import-status`, `.import-progress-bar`, `.import-progress-fill`, `.custom-songs-list`, `.custom-empty`, `.custom-song-item`, `.custom-song-info`, `.custom-song-title`, `.custom-song-anime`, `.custom-song-del`, `.custom-actions`
- [ ] **CLEAN-04**: Remove unused CSS animation: `@keyframes scoreBump`
- [ ] **CLEAN-05**: Remove unused `@keyframes playRing`
- [ ] **CLEAN-06**: Merge two separate `document.click` listeners into one handler
- [ ] **CLEAN-07**: Extract magic numbers to named constants (timeout values)

### Verified (no change needed)
- ✓ Single-player quiz flow (start → load → answer → end)
- ✓ Bangumi index import (fixed position panel works)
- ✓ Keyboard shortcuts (1-4, Space, Escape) with input guard
- ✓ Settings filters (year, type, source) in modal
- ✓ Anime detail modal with AniList covers

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PK-01 | 1 | — |
| PK-02 | 1 | — |
| PK-03 | 1 | — |
| PK-04 | 1 | — |
| ERR-01 | 2 | — |
| ERR-02 | 2 | — |
| ERR-03 | 2 | — |
| ERR-04 | 2 | — |
| CLEAN-01 | 3 | — |
| CLEAN-02 | 3 | — |
| CLEAN-03 | 3 | — |
| CLEAN-04 | 3 | — |
| CLEAN-05 | 3 | — |
| CLEAN-06 | 3 | — |
| CLEAN-07 | 3 | — |
