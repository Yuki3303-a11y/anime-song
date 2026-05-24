# Phase 5: Bug修复 - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

## Phase Boundary

修复萌豚挑战中4个已知bug：回顾模式导航逻辑、YouTube嵌入播放、手机性能、番剧导入匹配错误。纯修复阶段，不改动视觉风格和功能范围。

## Implementation Decisions

### Bug 1 — 回顾模式导航逻辑
- **D-01:** 关闭动漫详情弹窗（X按钮/Escape/点击外部）→ 停留在当前回顾的题目，不自动跳转
- **D-02:** 左箭头 → 上一道回顾题（已有功能，保持）
- **D-03:** 右箭头 → 下一道回顾题（新增），逐步前进已答题目
- **D-04:** 在回顾模式中按右箭头到最新题之后再按 → 退出回顾模式，加载当前未答题
- **涉及文件:** `app.js` — `nextQuestion()` (line 2492), `prevQuestion()` (line 2506), `closeDetail` action (line 2817), Escape key handler (line 2734), click-outside handler (line 2771)

### Bug 2 — YouTube视频无法嵌套播放
- **D-05:** 恢复 `index.html` 中 ytPlayerContainer 的 `transform:scale(0.001)` 渲染方案（当前被 commit 168eab6 意外回退为 `width:1px;height:1px;overflow:hidden`）
- **D-06:** 恢复 `app.js` YouTube API 搜索中的 `videoEmbeddable=true&videoSyndicated=true` 过滤参数（同样被回退）
- **原因:** 手机浏览器要求iframe以完整尺寸渲染才能初始化播放器；`videoEmbeddable`过滤避免搜到禁止嵌入的视频
- **涉及文件:** `index.html` (line 458), `app.js` — YouTube搜索请求位置

### Bug 3 — 手机性能优化
- **D-07:** 使用 Page Visibility API — 页面不可见（切后台/其他标签）时暂停樱花Canvas动画循环
- **D-08:** 移动端降级 `shadowBlur` — 检测移动设备时跳过或减小canvas阴影模糊值
- **D-09:** 保持视觉效果完全不变 — 不删除或改变樱花粒子数量、样式、动画
- **涉及文件:** `app.js` — `initSakura()` (line 1584), canvas animate loop (line 1678)

### Bug 4 — 番剧导入匹配错误
- **D-10:** 提高 `searchItunesForAnime()` 的评分阈值从 `>= 20` 提高到 `>= 50`，减少仅凭歌手名即通过的误匹配
- **D-11:** 增加交叉验证 — 歌曲的 `trackName` 或 `collectionName` 必须包含番剧名的至少一个关键词片段
- **D-12:** 导入后确认步骤 — 对低置信度匹配（阈值可调）的歌曲，导入完成后弹窗让用户手动选择保留或删除
- **涉及文件:** `app.js` — `scoreImportResult()` (line 1180), `searchItunesForAnime()` (line 1176), `importFromBangumi()` (line 1094)

### Claude's Discretion
- Bug 1 右箭头按钮的UI位置和样式
- Bug 3 移动端检测方式和shadowBlur降级的具体阈值
- Bug 4 交叉验证的关键词匹配策略细节、导入确认UI的具体设计
- 各修复的具体实现细节

## Canonical References

### Requirements & Planning
- `.planning/ROADMAP.md` — Phase 5 Bug修复 requirements (BUG-01 through BUG-04)
- `.planning/REQUIREMENTS.md` — Full requirement registry

### Code References
- `app.js:2033-2085` — `loadQuestion()` history viewing mode
- `app.js:2492-2521` — `nextQuestion()`, `prevQuestion()`, `updatePrevButton()`
- `app.js:2817` — `closeDetail` → `nextQuestion()` dispatch
- `app.js:220-254` — YouTube player initialization (`initYtPlayer`)
- `app.js:256-298` — `onYtError()` — error codes 101/150 = not embeddable
- `app.js:1176-1251` — `searchItunesForAnime()` and `scoreImportResult()`
- `app.js:1094-1173` — `importFromBangumi()` import flow
- `app.js:1584-1688` — `initSakura()` canvas animation
- `index.html:458` — `ytPlayerContainer` div

### Prior Fixes (restore from git)
- `545015c` — fix: filter embeddable YouTube videos + render iframe at full size via transform:scale
- `3a8c256` — fix: use clip:rect for hidden YT iframe — works on mobile where opacity:0 fails

### Codebase Maps
- `.planning/codebase/STACK.md` — Tech stack and API details
- `.planning/codebase/STRUCTURE.md` — File layout and localStorage keys
- `.planning/codebase/CONCERNS.md` — Known issues (note: many already fixed; check current state)

## Existing Code Insights

### Reusable Assets
- `escapeHTML()` (app.js:70) — already used for XSS prevention, available for any new UI code
- `notify()` (app.js:1711) — user-facing toast notifications
- `$()` (app.js:4) — document.getElementById shorthand

### Established Patterns
- `[data-action]` event delegation (app.js:2800-2854) — all UI actions dispatch through here
- `gameState.viewingHistory` flag — controls review mode vs normal play mode
- `MemCache` class (app.js:78-116) — localStorage + in-memory cache wrapper

### Integration Points
- `closeDetail` action → `nextQuestion()` — needs conditional logic for history mode
- `ytPlayerContainer` in `index.html` — must render at full size hidden via transform
- `initSakura()` animate loop — needs visibility check
- `importFromBangumi()` loop — needs post-import confirmation step insertion

## Specific Ideas

- Bug 1: 用户明确表示"在已答题的那些加上一个右箭头可以回到最新题目"，右箭头应该逐步前进而非一键跳回
- Bug 2: 两个被回退的commit (545015c, 3a8c256) 是已验证的修复，直接恢复即可
- Bug 3: 用户强调"网站页面最好还是能保持原样，我还是很喜欢背景的樱花落下这个元素" — 性能优化必须对用户透明
- Bug 4: 用户选择"提高阈值+交叉验证+导入确认"三重防护

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 5-Bug修复*
*Context gathered: 2026-05-24*
