# Phase 1 Summary — PK Connection Reliability

**Status:** complete
**Date:** 2026-05-23
**Requirements:** PK-01, PK-02, PK-03, PK-04

## One-Liner

Hardened PK room creation and joining with 3-retry network resilience, offline detection, specific user-facing error messages, and Firebase error logging.

## What Was Built

| Task | Requirement | Change |
|------|-------------|--------|
| 1 | PK-01/PK-02 | Added `retryPK(fn, label)` helper with 3 retries and 1s fixed backoff |
| 2 | PK-01/PK-04 | Updated `pkCreate()` with offline guard, retry-wrapped `setDoc`, specific timeout error |
| 3 | PK-02/PK-04 | Updated `pkJoin()` with offline guard, retry-wrapped `getDoc`/`updateDoc`, logical error detection (room not found / room full) |
| 4 | PK-03 | Replaced empty `catch {}` in `checkInvite()` with `console.error('[PK] checkInvite:', e)` |
| 5 | PK-04 | Added `navigator.onLine` check before Firebase calls in both PK functions |

## Error Messages

| Condition | User message |
|-----------|-------------|
| Device offline | 当前无网络连接，请检查网络 |
| Network timeout after 3 retries | 网络连接超时，请检查网络后重试 |
| Room does not exist | 房间号不存在或已过期 |
| Room is full | 该房间已满，请尝试其他房间 |

## Files Modified

- `app.js` — 95 lines changed (+69/-26): added `retryPK()` helper, rewrote `pkCreate()` and `pkJoin()`, fixed `checkInvite()` catch block
- No changes to `style.css`, `index.html`, or `songs.js`

## Self-Check

- [x] Node --check syntax validation passed
- [x] `retryPK` helper exists as top-level async function
- [x] `pkCreate` has offline guard, retry, and specific error
- [x] `pkJoin` has offline guard, retry, logical error detection, specific errors
- [x] `checkInvite` catch block logs error
- [x] No empty catch blocks remain in PK code path
- [x] Existing functions (`pkShare`, `pkStart`, `enterRoom`, `notify`) untouched
