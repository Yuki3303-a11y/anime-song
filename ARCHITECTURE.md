# 萌豚挑战 — 技术架构与工作原理

## 目录

1. [整体架构](#1-整体架构)
2. [音频获取系统](#2-音频获取系统)
3. [B站代理后端](#3-b站代理后端)
4. [游戏流程](#4-游戏流程)
5. [多人 PK 对战](#5-多人-pk-对战)
6. [樱花飘落动画](#6-樱花飘落动画)
7. [MemCache 缓存系统](#7-memcache-缓存系统)
8. [番剧封面获取](#8-番剧封面获取)
9. [Bangumi 目录导入](#9-bangumi-目录导入)
10. [收藏与歌单系统](#10-收藏与歌单系统)
11. [筛选系统](#11-筛选系统)
12. [排行榜](#12-排行榜)
13. [键盘快捷键](#13-键盘快捷键)
14. [音频源切换](#14-音频源切换)

---

## 1. 整体架构

纯静态单页应用，无框架、无打包工具：

```
index.html  — 所有页面视图（菜单、大厅、房间、游戏、排行榜）都在一个 HTML 里
app.js      — ~3000 行 ES Module，所有游戏逻辑
songs.js    — 562 首歌曲数据，export SONGS 数组
style.css   — 全部样式，CSS 自定义属性做主题
```

### 页面切换原理

所有视图是 `<main class="content">` 的直接子元素，通过 `.hidden` 类显示/隐藏。事件绑定采用**事件委托**——监听 `[data-action]` 属性，点击时派发到对应函数。

### 外部服务依赖

| 服务 | 用途 | 是否必需 |
|------|------|----------|
| iTunes Search API | 30s 试听音频（主源） | 是 |
| YouTube Data API v3 + IFrame Player | 完整歌曲播放 + 降级源 | 是 |
| B站 API（via Vercel） | 国内音频源 | 可选 |
| AniList GraphQL API | 番剧封面图 | 可选 |
| Bangumi API | 番剧目录导入 | 可选 |
| Firebase Realtime Database | 多人 PK 实时同步 | 仅 PK 模式 |
| Firebase Anonymous Auth | PK 用户身份 | 仅 PK 模式 |

---

## 2. 音频获取系统

这是网站最复杂的部分。每首歌的音频获取遵循一条**降级链**：

```
iTunes 30s 试听 (主源) → YouTube (降级) → B站 (兜底/可设为优先)
```

### 2.1 iTunes Search API

`fetchAudio(title, artist, anime)` 函数（app.js:2520）：

1. 先检查 `audioCache`（MemCache 实例），命中直接返回
2. 用 **4 种搜索策略**尝试 iTunes API：
   - `artist + title`（最精确）
   - `artist + title + anime`（消歧义）
   - `title + anime`（无歌手时）
   - `title alone`（最后手段）
3. 每次搜索返回最多 10 个结果，用 `scoreMatch()` **评分算法**选最佳：
   - 标题完全匹配 +100，包含 +30
   - 歌手匹配 +50，不匹配 -20
   - 专辑名包含动漫名 +30
4. 评分 >= 0 就接受，返回 30s 试听 URL（M4A 格式，`<audio>` 直接播放）

### 2.2 YouTube 降级

iTunes 全部失败后，调用 YouTube Data API v3 搜索，返回 `yt:VIDEO_ID` 格式。播放器切换为 YouTube IFrame Player，播放 30 秒后自动暂停。

### 2.3 B站音频源

`searchBilibili(anime, title, artist, type)` 函数（app.js:525）：

**搜索策略**（渐进放宽）：

1. `番名 + OP/ED + 歌名` — 最精确
2. 再加歌手名 — 消歧义
3. 去掉 OP/ED — 更宽泛
4. 只搜番名 — 最后兜底

**评分算法** `scoreResult()`：

| 匹配项 | 加分 |
|--------|------|
| 番名每词命中 | +25 |
| 番名完整命中 | +30 |
| 歌名每词命中 | +30 |
| 歌名完整命中 | +40 |
| OP/ED 关键词 | +20 |
| 播放量 > 10万 | +15 |
| 播放量 > 1万 | +8 |
| 时长 1-6 分钟 | +10 |

**最终验证**：视频标题必须包含番名（短番名 <=3 字时最低分 30，否则 10）。

**音频获取** `getBilibiliAudioUrl(bvid)`（app.js:647）：

1. 调 Vercel API `/api/search?bvid=xxx`
2. Vercel 函数 → B站 DASH API（`fnval=16`）→ 提取最高质量音频流 URL
3. 返回的 URL 经过 **Vercel 流代理**（`/api/search?stream=xxx`），因为 B站 CDN 会检查 Origin 头阻止跨域请求

---

## 3. B站代理后端

`api/search.js` — Vercel Serverless Function，零成本部署，处理三类请求：

| 端点 | 功能 |
|------|------|
| `?q=xxx` | B站视频搜索，含 WBI 签名 |
| `?bvid=xxx` | 获取视频的 DASH 音频流 URL |
| `?stream=xxx` | 音频流代理——从 B站 CDN 拉取音频，转发给浏览器 |

### WBI 签名算法

B站 API 的防爬机制，流程：

1. 从 `/x/web-interface/nav` 获取 `img_url` 和 `sub_url`
2. 拼接后用 `MIXIN_KEY_ENC_TAB`（64 位置换表）重排，取前 32 字符作为 `mixin_key`
3. 将所有参数排序拼接 + `wts`（时间戳）+ `mixin_key`，MD5 生成 `w_rid`
4. 每个请求都带 `w_rid` 和 `wts` 参数

```
请求参数排序 → 拼接 wts → 追加 mixin_key → MD5 → w_rid
```

### 音频流代理

B站 CDN 对音频请求做 Origin 检查，直接在浏览器播放会被拦截。解决方案：

```
浏览器 → Vercel /api/search?stream=<音频URL> → B站 CDN（带 Referer: bilibili.com）→ 音频数据 → 浏览器
```

Vercel 函数作为中间人，设置正确的 `Referer` 和 `User-Agent` 头，绕过 B站 CDN 的跨域限制。

---

## 4. 游戏流程

### 4.1 出题 `loadQuestion()`（app.js:2402）

1. 从 `gameState.playlist` 取当前题（随机打乱的歌曲数组）
2. 显示加载动画，调 `fetchAudio()` 获取音频
3. 音频就绪后调 `renderOptions(correctAnime)` 生成 4 个选项：
   - 1 个正确答案（当前歌的动漫名）
   - 3 个随机错误答案（从 `ALL_ANIME` 中去重抽取）
4. 按钮网格渲染完成后等待玩家点击

### 4.2 答题 `selectAnswer()`

1. 比对选择的动漫名和 `gameState.correctAnime`
2. **答对**：得分 + 连击加成（combo >= 3 时 bonus = combo * 10），绿色闪光 + 涟漪动画
3. **答错**：连击归零，红色闪光
4. 锁定所有选项，标记正确/错误
5. 自动弹出歌曲详情卡片（含完整歌曲播放、封面、收藏按钮）
6. 记录到 `gameState.answerHistory`

### 4.3 连击系统

```
combo = 答对 +1 / 答错归零
bonus = combo >= 3 ? combo * 10 : 0
```

### 4.4 30 秒截断

B站返回完整音频，不是 30s 试听。在 `audio.ontimeupdate` 中检测：如果不是 iTunes/YouTube 源，播放到 30 秒自动暂停。

### 4.5 抗竞态

`gameState.fetchGeneration` 计数器防止快速跳题时旧请求覆盖新结果。每次 `loadQuestion()` 递增 generation，回调中检查是否匹配当前 generation。

---

## 5. 多人 PK 对战

基于 **Firebase Realtime Database** + **Anonymous Auth**。

### 5.1 创建房间 `pkCreate()`

1. 匿名登录获取 `user.uid`
2. 生成 4 位随机房间号
3. 写入 Firebase `rooms/{rid}`，包含：
   - `host`: 房主 uid
   - `guest`: null（等待加入）
   - `status`: "waiting"
   - `questions`: 随机 10 首歌的索引数组
   - `scores`: `{ [uid]: 0 }`

### 5.2 加入房间 `pkJoin()`

1. 读取房间数据，验证 `status === waiting`
2. 将自己的 uid 写入 `guest` 字段
3. 通过 `onValue()` 实时监听房间状态变化

### 5.3 实时同步

```
Firebase rooms/{rid}
  ├── host: uid
  ├── guest: uid
  ├── status: waiting → playing
  ├── questions: [0, 15, 238, ...]
  └── scores: { uid1: 3, uid2: 5 }
```

- 对手加入时更新 UI（P2 卡片激活）
- `status` 变为 `playing` 时双方同时进入游戏
- 得分通过 `scores/{uid}` 实时同步

### 5.4 分享邀请

`pkShare()` 生成 `?room=1234` 链接：
- 优先调用 `navigator.share()`（移动端原生分享）
- 降级到 `navigator.clipboard.writeText()`（复制链接）

### 5.5 断线重连

`retryPK()` 包装函数，PK 操作最多重试 3 次，每次间隔 1 秒递增。

---

## 6. 樱花飘落动画

`initSakura()` 函数（app.js:1946），使用 **Canvas 2D** 实现。

### 花瓣（Petal 类）

- 15 个花瓣实例
- 贝塞尔曲线绘制花瓣形状：
  ```js
  ctx.bezierCurveTo(size*0.4, -size*0.3, size, -size*0.3, size*0.6, size*0.1);
  ctx.bezierCurveTo(size*0.3, size*0.4, -size*0.1, size*0.3, 0, 0);
  ```
- 物理属性：下落速度、左右摆动（`sin(wobble) * 0.3`）、旋转、透明度
- 颜色随机：70% 粉色系（r:236-255, g:180-240, b:200-240），30% 白色系
- 超出屏幕底部时重置到顶部（`reset(false)`）

### 星星（Star 类）

- 8 个星星实例
- 正弦函数实现闪烁效果：`opacity = baseOpacity + sin(twinkle) * 0.3`
- 随机位置和闪烁频率

### 渲染循环

每帧 `requestAnimationFrame` 循环：`update()` → `draw()`。窗口 resize 时 200ms 防抖重设 canvas 尺寸。

---

## 7. MemCache 缓存系统

`class MemCache`（app.js:114）— 内存 Map 包装 localStorage。

### 构造参数

```js
new MemCache(localStorageKey, maxEntries, ttlMs?)
```

### 工作原理

- **读取**：优先从内存 `_data` Map 读取（O(1)），首次从 localStorage 反序列化
- **写入**：写入内存，200ms 防抖后批量 flush 到 localStorage
- **TTL**：条目格式 `{ value, ts }`，读取时检查过期自动删除
- **淘汰**：超出 `maxEntries` 时删除最旧条目（FIFO）

### 缓存实例

| 实例 | localStorage Key | 最大条目 | TTL |
|------|------------------|----------|-----|
| `audioCache` | `audio_cache_v2` | 500 | 24h |
| `animeDetailCache` | `anime_detail_cache_v1` | 300 | 永不过期 |
| `bilibiliCache` | `bilibili_cache_v1` | 200 | 24h |
| `bilibiliAudioCache` | `bilibili_audio_cache_v1` | 200 | 5min |
| `youtubeCache` | `youtube_cache_v1` | 200 | 永不过期 |

B站音频缓存 TTL 较短（5 分钟），因为 B站 CDN 的音频 URL 会过期。

---

## 8. 番剧封面获取

通过 **AniList GraphQL API**（`https://graphql.anilist.co`）：

```graphql
query ($search: String) {
  Media(search: $search, type: ANIME) {
    coverImage { large }
    title { romaji }
  }
}
```

- 返回封面 URL 和罗马音标题
- 缓存在 `animeDetailCache`（永不过期）
- 用于游戏详情卡片和收藏列表显示
- 4 秒超时，失败时静默降级（不显示封面）

---

## 9. Bangumi 目录导入

`importBangumi()` 流程：

### 数据获取

1. 用户输入目录号（如 75323）
2. 先检查本地 `index_{id}.json` 文件（预置的 108 部动漫索引，同源无 CORS 问题）
3. 没有则通过 CORS 代理（`cors-anywhere.fly.dev`）调 Bangumi v0 API：
   ```
   GET https://api.bgm.tv/v0/indices/{id}/subjects?limit=100&offset=0
   ```
4. 分页获取，每页 100 条

### 歌曲搜索

对每部动漫（`type === 2`，仅动漫）：

1. 调 AniList GraphQL 获取罗马音标题
2. 用罗马音标题搜 iTunes
3. 最多导入 5 首歌
4. 通过 `addCustomSong()` 写入 localStorage（`custom_songs_v1`）

### 进度反馈

`importProgress` 进度条实时更新，`importStatus` 显示当前状态。

---

## 10. 收藏与歌单系统

### 收藏 `toggleFavorite()`

- 将当前歌曲存入 `favorites` 数组（localStorage `aq_fav`）
- 保存完整信息：title、anime、artist、type、source、bilibiliUrl
- B站源的歌保存 bvid，下次播放时直接用 `<audio>` 播放完整歌曲
- 去重：同一首歌（title + anime）不重复收藏

### 歌单播放 `playFavSongAtIndex()`

从收藏列表选一首，判断 source：

- `bilibili` → 调 `playBilibili()` 直接播放完整歌曲（用保存的 bvid）
- 其他 → 调 iTunes/YouTube 搜索完整版
- 弹出音乐播放器浮动条，支持上/下一首、暂停
- 旧收藏（无 source 字段）自动尝试 B站搜索补充

---

## 11. 筛选系统

`getFilteredSongs()` 从 `SONGS` + `customSongs` 合并后过滤：

| 筛选维度 | 状态变量 | 行为 |
|----------|----------|------|
| 年份 | `filterState.years`（Set） | 多选，空集 = 全部 |
| 类型 | `filterState.types`（Set） | 多选，OP/ED/IN |
| 来源 | `filterState.source` | null=全部 / "builtin"=仅内置 / "custom"=仅自定义 |

设置界面用 chip 按钮网格渲染，点击切换 active 状态。"全部" 按钮清空对应 Set。

---

## 12. 排行榜

`renderLeaderboard()` 从 localStorage（`aq_rec`）读取游戏记录：

```json
[{ "r": 8, "n": 10, "c": 5, "t": "2025-01-15 14:30", "m": "single" }]
```

| 字段 | 含义 |
|------|------|
| `r` | 答对数 |
| `n` | 总题数 |
| `c` | 最大连击 |
| `t` | 时间戳 |
| `m` | 模式（single / pk） |

- 最多显示 10 条，前三名显示奖牌 emoji
- 每次 `endGame()` 时自动写入新记录
- 支持一键清空

---

## 13. 键盘快捷键

全局 `keydown` 监听，所有快捷键在焦点位于 `INPUT`/`TEXTAREA` 时自动跳过：

| 按键 | 行为 | 条件 |
|------|------|------|
| `1`-`4` | 选择答案选项 | 游戏中、未锁定、无弹窗 |
| `Space` | 播放/暂停音频 | 无弹窗 |
| `Escape` | 关闭模态框 | 有弹窗打开时 |
| `←` `→` | 历史题目导航 | 已答过的题可回看 |

---

## 14. 音频源切换

三种模式，存储在 localStorage（`audio_source_pref_v1`）：

| 模式 | 值 | 优先级 |
|------|-----|--------|
| 默认 | `null` | iTunes → YouTube → B站兜底 |
| B站优先 | `"bilibili-first"` | B站 → iTunes → YouTube |
| 仅B站 | `"bilibili-only"` | B站 → 跳过题目 |

### 切换逻辑

```
fetchAudio() 被调用时：
  1. 检查 audioCache，跳过 YouTube/B站 缓存（强制重新搜索以优先 iTunes）
  2. 如果模式是 bilibili-first 或 bilibili-only → 先尝试 B站
  3. B站失败且模式是 bilibili-only → 返回 null（跳过该题）
  4. 否则走 iTunes → YouTube 降级链
  5. 最终兜底：尝试 B站（仅默认模式下）
```

切换模式时清除 `audioCache` 中的 YouTube/B站 条目，强制下次搜索使用新优先级。

---

## 数据流总览

```
┌─────────────────────────────────────────────────────┐
│                    前端 (app.js)                      │
│                                                       │
│  songs.js ──→ getFilteredSongs() ──→ playlist         │
│                                          │            │
│  loadQuestion() ←────────────────────────┘            │
│       │                                               │
│       ├─ fetchAudio() ──→ iTunes API ──→ 30s M4A     │
│       │                 ──→ YouTube API ──→ yt:ID     │
│       │                 ──→ B站搜索 + 音频             │
│       │                      │                        │
│       │                      ▼                        │
│       │              Vercel Serverless                 │
│       │              (api/search.js)                   │
│       │              WBI签名 + 流代理                   │
│       │                      │                        │
│       │                      ▼                        │
│       │              B站 API + CDN                     │
│       │                                               │
│       ├─ renderOptions() ──→ 4 个选项按钮              │
│       └─ selectAnswer() ──→ 得分/连击/详情卡片         │
│                                                       │
│  AniList GraphQL ──→ 封面图                           │
│  Bangumi API ──→ 目录导入                             │
│  Firebase ──→ PK 实时同步                             │
│  localStorage ──→ 缓存/收藏/排行榜/设置               │
└─────────────────────────────────────────────────────┘
```
