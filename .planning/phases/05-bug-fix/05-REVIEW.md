---
phase: 05-bug-fix
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - index.html
  - app.js
findings:
  critical: 1
  warning: 5
  info: 2
  total: 8
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-24
**Depth:** standard
**Files Reviewed:** 2 (index.html, app.js)
**Status:** issues_found

## Summary

Reviewed the 4 bug fix areas in this phase: (1) YouTube iframe rendering and videoEmbeddable filter, (2) Page Visibility API for sakura pause and mobile shadowBlur downgrade, (3) review mode navigation with closeDetailModal and right-arrow stepping, and (4) Bangumi import scoring threshold, cross-validate, and low-confidence confirm dialog. The core logic for fixes 1, 2, and 4 is sound. Fix 3 (review mode navigation) is also functionally correct but has a race-condition concern in viewingHistory mode.

One **blocker** was found: an infinite loop in `searchYouTube` when all API keys are exhausted. Several warnings and informational items are also reported.

---

## Critical Issues

### CR-01: Infinite loop in `searchYouTube` when all API keys are exhausted

**File:** `app.js:416-445`
**Issue:** The while-loop at line 417 uses `tried.size < YT_API_KEYS.length` as its exit condition. When a key is in the `ytKeyExhausted` set (quota exceeded), the code skips it via `continue` at line 421 **without adding it to `tried`**. If all 5 API keys are exhausted, `tried.size` remains 0 forever because every index is in `ytKeyExhausted` and is therefore skipped without ever being added to `tried`. The loop spins indefinitely, locking the page's main thread.

**Fix:**
```javascript
async function searchYouTube(query) {
    const cacheKey = query;
    const cached = youtubeCache.get(cacheKey);
    if (cached) return cached;

    // Try each key until one works
    const tried = new Set();
    while (tried.size < YT_API_KEYS.length) {
        const idx = ytKeyIndex;
        if (tried.has(idx)) {
            ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
            continue;
        }
        // Mark as tried even if exhausted, so the loop eventually exits
        tried.add(idx);
        if (ytKeyExhausted.has(idx)) {
            ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
            continue;
        }
        const key = YT_API_KEYS[idx];
        try {
            const res = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&videoSyndicated=true&maxResults=1&q=${encodeURIComponent(query)}&key=${key}`
            );
            if (res.status === 403 || res.status === 429) {
                console.warn('[YT] Key #' + idx + ' quota exceeded, switching...');
                ytKeyExhausted.add(idx);
                ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
                continue;
            }
            const data = await res.json();
            const videoId = data.items?.[0]?.id?.videoId || null;
            if (videoId) youtubeCache.set(cacheKey, videoId);
            return videoId;
        } catch (e) {
            console.error('[YT] searchYouTube failed:', e);
            ytKeyIndex = (ytKeyIndex + 1) % YT_API_KEYS.length;
        }
    }
    console.error('[YT] All keys exhausted or failed');
    return null;
}
```

The key change is moving `tried.add(idx)` **before** the exhausted check, so exhausted keys are still counted as tried. This ensures the loop always terminates after at most `YT_API_KEYS.length` iterations.

---

## Warnings

### WR-01: `loadQuestion` viewingHistory mode lacks `fetchGeneration` guard against stale async callbacks

**File:** `app.js:2089-2133`
**Issue:** In the viewingHistory branch of `loadQuestion`, the `fetchAudio` call (line 2109) runs without a generation counter guard. If the user rapidly navigates through review history by pressing left/right arrows, multiple concurrent `fetchAudio` promises are created. The `.then()` callback (lines 2109-2127) modifies shared state (`quizYT.active`, `quizYT.videoId`, `audio.src`) without checking whether it is still relevant. A stale promise that completes last could overwrite state with wrong audio data for the currently displayed question.

By contrast, the main quiz flow branch (lines 2153-2157) correctly uses `fetchGeneration` as a guard.

**Fix:** Add a fetch-generation check in the viewingHistory branch, mirroring the pattern used in the main flow:

```javascript
gameState.fetchGeneration++;
const histGen = gameState.fetchGeneration;
// ... inside fetchAudio callback:
fetchAudio(record.song.title, record.song.artist, record.song.anime).then(result => {
    if (histGen !== gameState.fetchGeneration) return;
    // ... rest of the callback
});
```

### WR-02: `searchYouTube` cached results bypass `videoEmbeddable` filter

**File:** `app.js:410-413, 426-428`
**Issue:** The `videoEmbeddable=true` parameter in the YouTube Data API query only applies at search time. Cached results (line 412: `if (cached) return cached;` and line 437: `youtubeCache.set(cacheKey, videoId)`) store the raw videoId. If a video later becomes non-embeddable (e.g., copyright claim added), the cached videoId is returned without re-verifying embeddability. This causes `onYtError` events (codes 101/150) which are handled downstream, but the user experience degrades with avoidable playback failures.

Also, the cache has no TTL (line 162: `new MemCache('youtube_cache_v1', 200)` — no TTL argument), so stale videoIds persist indefinitely.

**Fix:** Either add a TTL to the YouTube cache (e.g., `new MemCache('youtube_cache_v1', 200, 24 * 60 * 60 * 1000)`) or re-verify embeddability on cache hit with a lightweight query.

### WR-03: Hardcoded API keys exposed in client-side JavaScript

**File:** `app.js:9-17` (Firebase config), `app.js:185-191` (YouTube Data API keys)
**Issue:** Five YouTube API keys and a Firebase configuration with API key are hardcoded in client-side JavaScript. These are fully visible to anyone inspecting the page source or network requests. While this is inherent to a static SPA architecture without a backend, the YouTube keys in particular represent billable quota that any malicious actor could consume.

**Fix:** As a defense-in-depth measure, ensure each YouTube API key is restricted in the Google Cloud Console to the app's domain(s) (`anime-quiz.example.com`) and the YouTube Data API v3 only. Check the Firebase API key restrictions similarly. This is an operational/DevOps concern, not a code change.

### WR-04: `crossValidateAnime` 3-char substring matching produces false positives for short anime names

**File:** `app.js:1248-1250`
**Issue:** The cross-validation function extracts all 3-character substrings from the anime name and checks if they appear in the track or collection name. For short anime names like "Air" (3 chars), the single substring "Air" is checked — but this is already covered by the `t.includes(target)` exact match on line 1246. For names like "K-On!" (5 chars), substrings "K-O" and "-On" are checked, but a 3-char match is a weak signal and could produce false positives. The current scoring threshold (`s >= 50` and cross-validate pass) reduces false positives, but the function would benefit from a minimum target length for substring matching or requiring the match to span word boundaries.

**Fix:** Add a minimum length check for substring analysis, or require at least 4-char substrings for partial matching:

```javascript
// Only do substring matching for targets with at least 4 chars
if (target.length >= 4) {
    for (let i = 0; i < target.length - 2; i++) {
        const sub = target.substring(i, i + 3);
        if (t.includes(sub) || c.includes(sub)) return true;
    }
}
```

### WR-05: `isMobile` recomputed per-frame in star `draw()` method

**File:** `app.js:1709`
**Issue:** The `isMobile` variable is declared with `const` inside the `Star.draw()` method and computes `'ontouchstart' in window || navigator.maxTouchPoints > 0` on every frame for every star. With 8 stars at ~24fps, this runs 192 DOM checks per second unnecessarily. The device type does not change during the session.

**Fix:** Compute once at module scope or in `initSakura`:

```javascript
const IS_MOBILE = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// ... inside Star.draw():
ctx.shadowBlur = IS_MOBILE ? 0 : this.size * 2;
```

---

## Info

### IN-01: Production `console.log`/`console.error`/`console.warn` calls

**File:** `app.js` (multiple locations)
**Issue:** There are ~20 console logging calls throughout the codebase (e.g., lines 221, 241, 249, 430, 440, 445, 2272). While useful for debugging, these remain in production code. The structured output with `[Component]` prefixes is helpful for diagnostics but exposes internal state (API key exhaustion, cache errors, network failures) to the console.

**Fix:** Consider wrapping in a debug flag or removing non-critical production logs. The `[YT]` key rotation logs (line 430) are particularly informative to anyone inspecting the console.

### IN-02: `escapeHTML` does not escape single quotes

**File:** `app.js:70-72`
**Issue:** The `escapeHTML` function escapes `&`, `<`, `>`, and `"` but omits `'` (single quote). Currently all innerHTML usage in the codebase either: (a) uses the escaped values in text content contexts where `'` is safe, or (b) uses escaped values inside double-quoted HTML attributes. However, if future code uses `escapeHTML` output inside a single-quoted HTML attribute, it would be vulnerable to injection.

**Fix:** Add single-quote escaping for defense-in-depth:
```javascript
function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

---

_Reviewed: 2026-05-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
