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

## Milestone: UI美化迭代 (v2)

Status: In Progress

### Phase 1 -- 深度UI美化 []

**Goal:** 进一步增强二次元风格，添加更多动画效果和交互反馈，提升整体视觉体验。

**Mode:** mvp

**Requirements:**
| REQ-ID | Description |
|--------|-------------|
| UI-01 | 添加点击涟漪动画效果 |
| UI-02 | 正确/错误答案屏幕闪光反馈 |
| UI-03 | 分数变化数字滚动动画 |
| UI-04 | 加载状态二次元风格动画 |
| UI-05 | 增加更多背景装饰元素 |

**Plans:** 2 plans

Plans:
- [ ] 04-01-PLAN.md — Click ripple (UI-01) + Screen flash feedback (UI-02)
- [ ] 04-02-PLAN.md — Score rolling animation (UI-03) + Anime loading (UI-04) + Background decorations (UI-05)

**Success Criteria:**
1. 按钮点击时有流畅的涟漪动画效果
2. 答对/答错时屏幕有明显的视觉反馈（绿/红闪光）
3. 分数变化时有数字滚动动画
4. 加载状态显示二次元风格的加载动画
5. 页面背景有更多层次的装饰元素

---

*Last updated: 2026-05-23*
