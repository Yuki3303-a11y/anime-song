# Phase 1 Plan — PK Connection Reliability

**Phase:** 1 — PK Connection Reliability
**Milestone:** Bug Fix & Cleanup (v1)
**Date:** 2026-05-23
**Mode:** mvp
**Requirements:** PK-01, PK-02, PK-03, PK-04

---

## 1. Summary

This phase hardens the multiplayer PK mode against network failures. Currently `pkCreate()` and `pkJoin()` (app.js:819-854) use single-shot Firebase calls with empty error handling — a transient network blip causes a "创建房间失败" or "加入房间失败" toast with no retry, no diagnostic logging, and no offline awareness.

After this phase:
- Room creation and joining each retry up to 3 times with 1s backoff on transient network errors.
- Logical errors (room not found, room full) are detected and reported with distinct user-facing messages — no wasted retries.
- An offline guard (`navigator.onLine`) blocks PK operations before any Firebase call, showing an immediate warning.
- Every Firebase catch block in the PK code path logs a contextual error to the console (`[PK] functionName:` prefix).

No visual changes. No CSS changes. All work is in `app.js`.

---

## 2. Tasks

### Task 1: Add retry helper function (3 retries, 1s fixed backoff)

**Where:** After the `notify()` function (around line 730) and before the PK section comment block (line 817).

**What:** Insert a new `retryPK(fn, label)` helper:

```js
async function retryPK(fn, label) {
    for (let i = 0; i < 3; i++) {
        try {
            return await fn();
        } catch (e) {
            console.error(`[PK] ${label} attempt ${i + 1}:`, e);
            if (i < 2) await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error('NetworkError');
}
```

**Rationale:**
- Centralises retry logic; both `pkCreate` and `pkJoin` call the same helper.
- Retries only on thrown errors (network/timeout). Logical errors detected inside `fn()` use `return`/`notify()` and skip the retry loop by not throwing.
- 1s fixed backoff per CONTEXT.md and DISCUSSION-LOG (not exponential — the discussion concluded fixed is simpler and sufficient).
- The final `throw new Error('NetworkError')` is caught by the caller, which maps it to the appropriate user-facing message.

**Decision point:** Fixed 1s backoff (not exponential) as recorded in DISCUSSION-LOG.md.

---

### Task 2: Update pkCreate() with retry, offline check, and specific errors

**Where:** `app.js:819-837` (current `pkCreate` function).

**What to change:**

1. Add offline check as the first statement inside the function body:

```js
if (!navigator.onLine) {
    notify('当前无网络连接，请检查网络');
    return;
}
```

2. Wrap the Firebase `setDoc` call in the `retryPK` helper instead of calling it directly:

```js
await retryPK(
    () => setDoc(ref, { host: user.uid, guest: null, status: 'waiting', timestamp: serverTimestamp(), scores: { [user.uid]: 0 }, questions: shuffle([...Array(SONGS.length).keys()]).slice(0, 10) }),
    'pkCreate'
);
```

3. Update the catch block to distinguish the error type:

```js
} catch (e) {
    console.error('[PK] pkCreate:', e);
    notify('网络连接超时，请检查网络后重试');
}
```

**Preserved behavior:**
- `if (!user) { notify('正在连接服务器...'); return; }` guard stays.
- `enterRoom(rid)` call happens after successful `setDoc` — same as before, but now only after retry exhaustion.

**New flow (pseudocode):**
```
pkCreate()
 ├─ user check (existing)
 ├─ offline check (NEW)
 ├─ retryPK(setDoc, ...)  ← up to 3 attempts
 │   ├─ attempt 1 → fail? wait 1s
 │   ├─ attempt 2 → fail? wait 1s
 │   └─ attempt 3 → fail? throw NetworkError
 ├─ enterRoom(rid)        ← only on success
 └─ catch → console.error + "网络连接超时，请检查网络后重试"
```

---

### Task 3: Update pkJoin() with retry, offline check, and specific errors

**Where:** `app.js:839-854` (current `pkJoin` function).

**What to change:**

1. Add offline check as the first statement inside the function body:

```js
if (!navigator.onLine) {
    notify('当前无网络连接，请检查网络');
    return;
}
```

2. Restructure the logic so logical errors (room not found, room full) are detected with `getDoc` first, then the `updateDoc` is retried. The key insight: `getDoc` itself can fail due to network, so it runs inside `retryPK`. Subsequent logical checks (`.exists()`, `.status !== 'waiting'`) are synchronous and skip the retry:

```js
const snap = await retryPK(
    () => getDoc(ref),
    'pkJoin.getDoc'
);
```

Once the snapshot is retrieved (after up to 3 retries):
- If `!snap.exists()` → `notify('房间号不存在或已过期')` and return (no retry needed — this is a logical error).
- If `d.status !== 'waiting' && d.guest !== user.uid` → `notify('该房间已满，请尝试其他房间')` and return (logical).
- If `!d.guest` → `updateDoc(...)` — wrap this in another `retryPK` call since it touches the network again.

3. Update the catch block:

```js
} catch (e) {
    console.error('[PK] pkJoin:', e);
    notify('网络连接超时，请检查网络后重试');
}
```

**New flow (pseudocode):**
```
pkJoin()
 ├─ user check (existing)
 ├─ roomId format check (existing)
 ├─ offline check (NEW)
 ├─ retryPK(getDoc, ...)         ← up to 3 retries
 │   └─ all fail → throw NetworkError
 ├─ !exists    → "房间号不存在或已过期" return
 ├─ room full  → "该房间已满，请尝试其他房间" return
 ├─ !guest     → retryPK(updateDoc, ...) ← up to 3 retries
 ├─ enterRoom(rid)
 └─ catch → console.error + "网络连接超时，请检查网络后重试"
```

---

### Task 4: Add console.error logging to all Firebase/PK catch blocks

**Where:** `app.js` lines 834-835, 852-853, and 931.

**What to change:**

Three catch sites in the PK code path:

1. **pkCreate catch (line 834-835):**
   - Old: `} catch (e) { notify('创建房间失败，请重试'); }`
   - New: already covered by Task 2's catch block.

2. **pkJoin catch (line 852-853):**
   - Old: `} catch (e) { notify('加入房间失败，请检查房间号'); }`
   - New: already covered by Task 3's catch block.

3. **checkInvite catch (line 931):**
   - Old: `} catch {}`
   - New: `} catch (e) { console.error('[PK] checkInvite:', e); }`

The `checkInvite()` catch on line 931 is the last remaining empty catch block in the PK code path. It guards `new URL(location.href).searchParams.get('room')` against malformed URLs (which should never happen at runtime, but `URL()` constructor throws on invalid URLs). Logging it aids debugging if a user somehow arrives with a corrupted URL.

---

### Task 5: Add navigator.onLine check before PK operations

**Where:** `app.js:820` (pkCreate) and `app.js:840` (pkJoin).

**What to change:**

Insert this guard as the first check after `user` validation in both functions:

```js
if (!navigator.onLine) {
    notify('当前无网络连接，请检查网络');
    return;
}
```

**Rationale:**
- `navigator.onLine` is the standard browser API for online/offline state.
- Returning early avoids wasting 3 retry attempts (6 seconds total) when the device is already known to be offline.
- The same message "当前无网络连接，请检查网络" is used for both create and join, since the fix action is the same (check network and retry).

**Edge case:** `navigator.onLine` can be `true` on a flaky connection (WiFi connected but no internet). In that case the retry logic in Tasks 2/3 takes over and shows the timeout message after exhaustion.

---

## 3. Files to Modify

| File | Lines | Changes |
|------|-------|---------|
| `app.js` | after 730 | Insert `retryPK()` helper function |
| `app.js` | 819-837 | Rewrite `pkCreate()` — offline check, retry, specific error |
| `app.js` | 839-854 | Rewrite `pkJoin()` — offline check, retry, logical error detection, specific error |
| `app.js` | 931 | Replace empty `catch {}` with `console.error('[PK] checkInvite:', e)` |

**No other files are touched.** `style.css`, `index.html`, `songs.js` are unchanged.

---

## 4. Implementation Notes

### 4.1 Error classification for retry decision

The retry helper only catches thrown errors (network/timeout). Logical errors are handled inline and return early — they never reach the catch block. This is the cleanest way to implement the "only retry on network errors" decision:

| Error type | How detected | Retry? | User message |
|------------|-------------|--------|-------------|
| Network timeout / Firebase unreachable | `throw` from Firestore SDK | Yes (3x) | 网络连接超时，请检查网络后重试 |
| Room does not exist | `!snap.exists()` | No | 房间号不存在或已过期 |
| Room is full | `d.status !== 'waiting' && d.guest !== user.uid` | No | 该房间已满，请尝试其他房间 |
| Device offline | `navigator.onLine === false` | No (bypasses retry entirely) | 当前无网络连接，请检查网络 |

### 4.2 Retry helper placement

Place `retryPK()` right before the `// PK Mode` comment block (line 817), after `notify()` (line 730). This groups it with the PK functions that use it, keeping the code self-documenting. Do not place it at the top of the file or inside another function.

### 4.3 Existing patterns to follow

- **notify()** (line 725): Toast notifications auto-dismiss after 2.5s. Use this for all user-facing error messages.
- **fetchAudio() fallback** (line 972-1019): Already uses a 3-step fallback/retry philosophy. The PK retry follows the same spirit.
- **statusDot** (line 30): Already shows online/offline in the header; no changes needed.

### 4.4 What NOT to change

- Do NOT modify `pkShare()` — it is purely local (clipboard/share API) with no network calls.
- Do NOT modify `pkStart()` — it is called after the room is already established and the snapshot listener is active.
- Do NOT modify `enterRoom()` — the `onSnapshot` listener auto-retries internally (Firebase's built-in reconnect).
- Do NOT change the `if (!user) { notify('正在连接服务器...'); return; }` guards — they handle anonymous auth still initialising.

### 4.5 Console error format

All PK catch blocks use the format: `console.error('[PK] functionName:', error)`
- `[PK]` prefix enables filtering in DevTools console.
- First argument is the string label, second is the error object (preserves stack trace).

---

## 5. Verification

### 5.1 Task 1 — retryPK helper

- [ ] Open browser console; call `retryPK(() => Promise.reject(new Error('test')), 'test')` and verify it logs 3 attempt errors then throws.
- [ ] Call `retryPK(() => Promise.resolve('ok'), 'test')` and verify it returns `'ok'` on first try with no retry logging.
- [ ] Verify the helper exists as a top-level async function in app.js, not nested inside another function.

### 5.2 Task 2 — pkCreate

- [ ] **Normal:** Click "创建房间" — room creates on first attempt. Verify no console errors.
- [ ] **Network flaky (simulated):** Open DevTools Network tab, throttle to "Slow 3G", click create — verify up to 3 attempts in console, then the timeout message "网络连接超时，请检查网络后重试".
- [ ] **Network down (simulated):** DevTools Network tab → "Offline", click create — verify "网络连接超时，请检查网络后重试" after retries. Verify no uncaught errors in console.
- [ ] Check console: `[PK] pkCreate:` appears on failure. `[PK] pkCreate attempt 1/2/3:` appear from retry helper.

### 5.3 Task 2 — pkJoin logical errors

- [ ] **Room not found:** Enter a non-existent 4-digit code → "房间号不存在或已过期". Verify NO retry attempts logged (the error is caught at `.exists()` check).
- [ ] **Room full:** Join a room that already has a guest → "该房间已满，请尝试其他房间". Same: no retry attempts logged.

### 5.4 Task 3 — pkJoin with retry

- [ ] **Normal:** Create a room on one device, join from another → succeeds on first attempt.
- [ ] **Network flaky (throttled):** Join with "Slow 3G" → up to 3 `getDoc` attempts in console, then success or timeout message.
- [ ] **Network down:** Join with "Offline" → timeout message after 3 retries with `[PK] pkJoin.getDoc:` errors.

### 5.5 Task 4 — console.error on empty catch

- [ ] Trigger a malformed `checkInvite`: manually set `location.href` to something that causes `new URL(...)` to throw. Verify `[PK] checkInvite:` appears in console instead of silent failure.
- [ ] For pkCreate and pkJoin, the error logging is already verified in 5.2 and 5.4 above.

### 5.6 Task 5 — offline detection

- [ ] Set browser offline (DevTools Network → Offline OR toggle the device's network off).
- [ ] Click "创建房间" → immediate toast "当前无网络连接，请检查网络" with NO retry attempts (no 6-second wait).
- [ ] Click "加入房间" → same immediate toast, no retry attempts.
- [ ] Go back online, verify room create/join works normally again.

### 5.7 Regression — no breakage

- [ ] Single-player quiz: start a quiz, answer all 10 questions, verify score screen.
- [ ] Settings: change filters, verify they persist.
- [ ] Bangumi import: open import panel, verify it loads.
- [ ] Anime detail modal: click an anime name in results, verify AniList cover loads.
- [ ] PK room lifecycle: create room → share link → join from link → start game → answer questions → finish. Full happy path unchanged.

---

## Appendix: Complete modified functions (reference)

### retryPK() — new helper

```js
async function retryPK(fn, label) {
    for (let i = 0; i < 3; i++) {
        try {
            return await fn();
        } catch (e) {
            console.error(`[PK] ${label} attempt ${i + 1}:`, e);
            if (i < 2) await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error('NetworkError');
}
```

### pkCreate() — after changes

```js
async function pkCreate() {
    if (!user) { notify('正在连接服务器...'); return; }
    if (!navigator.onLine) { notify('当前无网络连接，请检查网络'); return; }
    const rid = String(Math.floor(1000 + Math.random() * 9000));
    roomId = rid;
    const ref = doc(db, 'artifacts', projectId, 'public', 'data', 'rooms', rid);
    try {
        await retryPK(
            () => setDoc(ref, {
                host: user.uid,
                guest: null,
                status: 'waiting',
                timestamp: serverTimestamp(),
                scores: { [user.uid]: 0 },
                questions: shuffle([...Array(SONGS.length).keys()]).slice(0, 10),
            }),
            'pkCreate'
        );
        enterRoom(rid);
    } catch (e) {
        console.error('[PK] pkCreate:', e);
        notify('网络连接超时，请检查网络后重试');
    }
}
```

### pkJoin() — after changes

```js
async function pkJoin() {
    if (!user) { notify('正在连接服务器...'); return; }
    if (!navigator.onLine) { notify('当前无网络连接，请检查网络'); return; }
    const rid = $('roomIdInput').value.trim();
    if (rid.length !== 4) { notify('请输入4位房间号'); return; }
    const ref = doc(db, 'artifacts', projectId, 'public', 'data', 'rooms', rid);
    try {
        const snap = await retryPK(() => getDoc(ref), 'pkJoin.getDoc');
        if (!snap.exists()) { notify('房间号不存在或已过期'); return; }
        const d = snap.data();
        if (d.status !== 'waiting' && d.guest !== user.uid) {
            notify('该房间已满，请尝试其他房间');
            return;
        }
        if (!d.guest) {
            await retryPK(
                () => updateDoc(ref, { guest: user.uid, [`scores.${user.uid}`]: 0 }),
                'pkJoin.updateDoc'
            );
        }
        roomId = rid;
        enterRoom(rid);
    } catch (e) {
        console.error('[PK] pkJoin:', e);
        notify('网络连接超时，请检查网络后重试');
    }
}
```

### checkInvite() — after changes

```js
function checkInvite() {
    try {
        const rid = new URL(location.href).searchParams.get('room');
        if (rid && rid.length === 4) {
            showView('lobby');
            $('roomIdInput').value = rid;
        }
    } catch (e) {
        console.error('[PK] checkInvite:', e);
    }
}
```

---

*Plan completed. Ready for execution.*
