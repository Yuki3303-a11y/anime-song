# Phase 5: Bug修复 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 05-bug-fix
**Areas discussed:** Bug 1 (回顾模式导航), Bug 2 (YouTube嵌入), Bug 3 (手机性能), Bug 4 (导入匹配)

---

## Bug 1 — 回顾模式导航逻辑

| Option | Description | Selected |
|--------|-------------|----------|
| 留在当前回顾题 | 关闭弹窗后留在当前回顾的题目，用户可以继续回顾这道题 | ✓ |
| 跳到下一道回顾题 | 关闭弹窗后自动前进到下一道回顾题 | |
| 回到最新题（现状） | 保持现有行为，关闭即跳回最新未答题 | |

**User's choice:** 留在当前回顾题
**Notes:** 用户描述了具体问题：查看上一题→弹出卡片→点X关闭→自动跳到下一题。期望关闭后留在当前回顾题，并添加右箭头按钮逐步浏览历史题目。

**Sub-decision — 导航按钮:**

| Option | Description | Selected |
|--------|-------------|----------|
| 左箭头 + 右箭头 | 左=上一道，右=下一道（逐步前进） | ✓ |
| 左箭头 + 右箭头 + X关闭 | 三个按钮 | |
| 只要右箭头 | 只加右箭头跳到最新题 | |

**User's choice:** 左+右箭头逐步导航
**Notes:** 用户明确：点左箭头是上一题，再点是上上一题；点右箭头是下一题（不是直接到最新题）。逐步前进直到最新。

---

## Bug 2 — YouTube视频无法嵌套播放

| Option | Description | Selected |
|--------|-------------|----------|
| 恢复之前的修复 | 恢复 transform:scale(0.001) + videoEmbeddable过滤 | ✓ |
| 恢复 + iTunes降级 | 恢复修复的同时，对无法播放的歌曲自动降级到iTunes音频源 | |

**User's choice:** 恢复之前的修复
**Notes:** 根因分析：commit 168eab6 在添加"在 YouTube 打开"链接时意外回退了 545015c 的修复（transform:scale(0.001) → width:1px;height:1px）和 videoEmbeddable 过滤。手机端所有YouTube源歌曲都无法播放，电脑端少数歌曲（如夢灯笼）也不行。

---

## Bug 3 — 手机性能优化

| Option | Description | Selected |
|--------|-------------|----------|
| 樱花动画智能暂停 | Page Visibility API暂停后台canvas动画 | ✓ |
| 减少canvas阴影运算 | 移动端跳过或降级shadowBlur | ✓ |
| 清理无用定时器 | 游戏结束/离开页面时停止进度条轮询 | |
| 减少CSS动画复杂度 | 移动端禁用部分装饰性动画 | |

**User's choice:** 樱花智能暂停 + 减少阴影运算
**Notes:** 用户强调保持视觉效果不变："网站页面最好还是能保持原样，我还是很喜欢背景的樱花落下这个元素"。性能优化必须对用户透明。

---

## Bug 4 — 番剧导入匹配错误

| Option | Description | Selected |
|--------|-------------|----------|
| 提高评分阈值+交叉验证 | score门槛 20→50+，要求collectionName/trackName含番剧关键词 | |
| 导入后用户手动确认 | 对低分匹配弹出确认界面 | |
| 两者都做 | 阈值+验证+确认三重防护 | ✓ |

**User's choice:** 两者都做
**Notes:** 冷门番剧在iTunes上数据少，当前score>=20门槛太低（光是匹配知名歌手就得20分但可能完全无关）。

---

## Claude's Discretion

- Bug 1: 右箭头按钮的UI位置和样式
- Bug 3: 移动端检测方式、shadowBlur降级具体阈值
- Bug 4: 交叉验证关键词匹配策略、导入确认UI设计
- 各修复的具体实现细节

## Deferred Ideas

None — discussion stayed within phase scope.
