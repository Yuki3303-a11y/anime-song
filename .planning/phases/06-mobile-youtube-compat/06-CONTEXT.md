# Phase 6: 移动端YouTube兼容修复 - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

## Phase Boundary

手机端YouTube嵌入播放兼容修复。桌面端逻辑完全不动，仅针对移动端优化YouTube搜索和播放失败处理。

## Implementation Decisions

### 核心策略
- **D-01:** 桌面端YouTube搜索保持 `maxResults=1`，逻辑一字不改
- **D-02:** 手机端YouTube搜索使用 `maxResults=5`，获取多个候选videoId
- **D-03:** 手机端播放失败（错误码101/150）时自动尝试下一个候选，不跳过题目
- **D-04:** 所有候选都失败时给出明确提示（如"该歌曲暂无可用YouTube源"），但不自动跳到下一题
- **D-05:** 移动端检测复用已有的 `isMobile` 模式：`'ontouchstart' in window || navigator.maxTouchPoints > 0`

### YouTube搜索改造
- **D-06:** `searchYouTube()` 函数接受可选的 `maxResults` 参数（默认1），手机端传5
- **D-07:** 多个videoId缓存结构调整——`youtubeCache` 缓存结果改为数组，按顺序取

### 播放失败重试
- **D-08:** `onYtError()` 中quiz模式收到101/150错误时，检查是否还有候选videoId
- **D-09:** 有候选 → 尝试下一个；无候选 → 显示提示，不跳过题目（与当前跳过题目的行为不同）
- **D-10:** 桌面端 `onYtError` 行为保持不变

### Claude's Discretion
- 多候选videoId的缓存数据结构设计
- 重试时的UI反馈细节（loading状态/提示文案）
- 是否需要区分"候选全部不可嵌入"和"候选全部网络错误"

## Canonical References

### Requirements & Planning
- `.planning/ROADMAP.md` — Phase 6 MOB-01, MOB-02, MOB-03

### Code References
- `app.js:410-447` — `searchYouTube()` 当前实现（maxResults=1固定）
- `app.js:256-295` — `onYtError()` 错误处理（quiz模式当前跳过题目）
- `app.js:110-116` — `youtubeCache` (MemCache实例)
- `app.js:168-175` — `quizYT` 状态结构 `{ active, videoId }`
- `app.js:220-254` — `initYtPlayer()` 播放器初始化
- `app.js:1709` — 已有 `isMobile` 检测模式（`ontouchstart` + `maxTouchPoints`）

### Prior Context
- `.planning/phases/05-bug-fix/05-VERIFICATION.md` — Phase 5验证报告，SC2(YouTube嵌入)在桌面端已通过但手机端仍失败
- `.planning/phases/05-bug-fix/05-01-SUMMARY.md` — Phase 5中YouTube修复的总结

## Existing Code Insights

### Reusable Assets
- `isMobile` 检测模式已在 `initSakura()` 中实现（`app.js:1709`），可直接复用
- `youtubeCache` (MemCache) 已存在，只需调整缓存值结构（单个videoId → videoId数组）
- `searchYouTube()` 函数结构清晰，添加 `maxResults` 参数改动面小

### Established Patterns
- `[data-action]` 事件委托——本阶段不涉及新增UI操作
- YouTube API key轮换逻辑（`ytKeyExhausted` + `ytKeyIndex`）

### Integration Points
- `searchYouTube()` → 被 `fetchAudio()` 调用（获取quiz音频源）
- `onYtError()` → YouTube iframe播放器错误回调
- `quizYT.videoId` → 当前激活的YouTube视频ID

## Specific Ideas

- 用户明确要求桌面端完全不动，"我很满意了不要再改动了"
- 手机端的目标是"静默切换"——用户感知不到候选切换，只看到播放成功
- 只有当所有候选都失败时才通知用户

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 6-移动端YouTube兼容修复*
*Context gathered: 2026-05-24*
