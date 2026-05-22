# Phase 1 Context — PK Connection Reliability

**Phase:** 1 — PK Connection Reliability
**Date:** 2026-05-23
**Mode:** mvp

## Domain
Fix multiplayer PK room creation and joining reliability. Currently `pkCreate()` and `pkJoin()` (app.js:819-854) have no retry logic, empty catch blocks, and generic error messages. Firebase operations silently fail on network issues.

## Canonical Refs
- `.planning/ROADMAP.md` — Phase 1 requirements (PK-01 through PK-04)
- `.planning/REQUIREMENTS.md` — Full requirement descriptions
- `.planning/codebase/ARCHITECTURE.md` — PK data flow documentation
- `app.js:819-932` — PK mode implementation (pkCreate, pkJoin, pkShare, pkStart, enterRoom)

## Decisions

### Retry Strategy
- **3 retries with 1s exponential backoff** for both `pkCreate()` and `pkJoin()`
- After all retries exhausted, show specific error message
- Retry only on network/timeout errors, not on logical errors (room not found, room full)

### Error Messages
Three distinct error types to surface to user:
- **Network timeout:** "网络连接超时，请检查网络后重试"
- **Room not found:** "房间号不存在或已过期"
- **Room full:** "该房间已满，请尝试其他房间"

### Offline Detection
- Check `navigator.onLine` before any PK operation
- If offline: show "当前无网络连接，请检查网络" and return early
- Do not attempt retry when offline

### Firebase Error Logging
- Replace empty `catch (e) {}` in pkCreate/pkJoin/enterRoom with `console.error('[PK] context:', e)`
- Log: function name, room ID, user UID, error message

## Code Context

### Files to Modify
- `app.js` — pkCreate() (line 819), pkJoin() (line 839), enterRoom() (line 876)
- `style.css` — no changes needed for this phase

### Existing Patterns
- `fetchAudio()` already uses 3-step fallback pattern — similar retry philosophy
- `notify()` function available for user-facing messages
- `statusDot` / `uidText` already indicate connection state in header

## Requirements (from ROADMAP.md)
| REQ-ID | Description |
|--------|-------------|
| PK-01 | PK room creation: 3-retry with 1s backoff + specific error messages |
| PK-02 | PK room joining: retry logic with better error handling |
| PK-03 | Replace empty catch blocks in Firebase functions with console.error logging |
| PK-04 | Connection status check before PK operations (warn if offline) |
