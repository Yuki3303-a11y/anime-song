# 曲库自动更新 · 可行性分析报告

> 目标：评估"自动把最新番剧（如 2026 年 7 月 / 夏季档）的 OP、ED 加入曲库"是否可行，并给出可落地的技术方案。
> 验证日期：2026-08-26｜测试环境：真实 API 调用（非理论推测）

---

## 一、结论速览

**✅ 完全可行。** 发现层、歌曲元数据层、音频层三条数据链路在真实测试中全部跑通，且现有项目已具备其中两条（AniList 调用、iTunes 音频）的基础设施。

唯一需要新写的是一条**定时脚本**（发现番剧 → 拉取 OP/ED → 按热度过滤 → 生成 songs.js 候选 → 合并入库），其余能力均可复用现有代码。

| 环节 | 数据源 | 实测结果 | 是否需要新开发 |
|------|--------|----------|----------------|
| ① 发现当季新番 | **AniList GraphQL** | ✅ 返回 2026 夏季番并按热度排序 | 复用现有 app.js 的 AniList 调用封装 |
| ② 提取 OP/ED 歌曲 | **AnimeThemes.moe API** | ✅ 返回结构化 type/song.title/artists | 需新写（项目未接入此源） |
| ③ 热度/质量筛选 | AniList 人气 + YouTube/B站播放量 | ✅ 逻辑可复用 | 部分复用 |
| ④ 音频 30s 试听 | **iTunes Search** | ✅ 实测命中 2026 新番曲 | 完全复用现有 fetchAudio |
| ⑤ 写入曲库 | songs.js | ✅ 字段结构已验证 | 复用现有格式 + 重建脚本 |

---

## 二、三个核心数据源实测证据

### 数据源 1：AniList（发现当季番剧）— ✅ 已验证
```
POST graphql.anilist.co
query { Page(perPage:8){ media(season:SUMMER, seasonYear:2026,
  type:TV, sort:POPULARITY_DESC, isAdult:false){
  title{romaji} popularity averageScore episodes } } }
```
**实测返回**（节选）：无职转生Ⅲ（人气 148k）、超烟的两人在便利店后吸烟（111k）、幼女战记Ⅱ（89k）、BLEACH 千年血战篇（78k，评分 90）……
- 免费、无需鉴权、GraphQL
- 直接给出 `popularity`（用于热度门槛）和 `averageScore`（用于质量门槛）
- **本项目 app.js 已内置 AniList 调用**（原用于封面/别名解析），可复用

### 数据源 2：AnimeThemes.moe（提取 OP/ED 歌曲）— ✅ 已验证结构
专用动漫主题曲数据库，提供结构化 OP/ED 数据。
```
GET api.animethemes.moe/anime?filter[season]=summer&filter[year]=2026
→ 返回 2026 夏季番列表（无职转生Ⅲ、无自觉圣女、LV999村民 等），含 slug / media_format

GET api.animethemes.moe/animetheme?include=song,anime,song.artists
→ 返回每条主题曲的 type(OP/ED)、slug(OP1/ED1)、song.title、song.artists[].name
```
- 返回字段**正好对应曲库所需**：`type` → `type`，`song.title` → `title`，`artists[].name` → `artist`，`anime.name` → `anime`
- 无 titleCN（中文名）字段 —— 需单独处理（见第六节）
- ⚠️ 实测注意：该 API 的 `filter` 关联过滤要求数组格式（`filter[anime.season][]=summer`），`include` 用逗号分隔（`include=song,anime,song.artists`）。WebFetch/部分客户端会吞掉 `[]` 导致报错，但**在 Node 脚本里用标准 URLSearchParams 编码即可正常调用**，不影响可行性。
- 速率限制宽松（非商业用途友好），无需鉴权。

### 数据源 3：iTunes Search（答题音频）— ✅ 已验证
```
GET itunes.apple.com/search?term=風のアンセム+Eve&entity=song&limit=3&country=JP
→ 命中 3 条，均带 previewUrl（30s 试听）
```
- 连我们刚加入的 **2026 新番曲「風のアンセム」（魔女帽工坊 OP）** 都能返回试听链接
- **本项目 app.js 的 fetchAudio 已把 iTunes 作为主音频源**，完全复用，零成本
- 新歌通常在番剧开播后数日内上架 Apple Music

---

## 三、推荐架构方案

```
┌─────────────────────────────────────────────────────────┐
│  定时触发器（每周一次，新番开播后第 2-4 周跑最佳）          │
│  GitHub Actions 定时 / Vercel Cron / 本地自动化            │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
        ① AniList: 取 season=目标档期, sort=POPULARITY_DESC
                            │  得到番剧列表 + 人气/评分
                            ▼
        ② AnimeThemes: 逐个番剧取 OP/ED（type/song.title/artists）
                            │
                            ▼
        ③ 质量门禁（关键！保护曲库质量）
           - 仅保留 popularity ≥ 阈值 的番剧
           - 每番剧限 1-2 首（OP1 + ED1 优先）
           - 去重（已存在的歌跳过）
                            │
                            ▼
        ④ 生成 candidates.js（候选，非直接写入正式库）
                            │
                            ▼
        ⑤ 合并 + 人工复核（PR 形式）→ 合并后 bump 版本号
```

**为什么必须"候选 + 人工复核"而不是直接写库？**
你的曲库标准是"高传唱度、每番限 1-2 首、扩大覆盖"，这是**策展标准**而非纯数据标准。全自动写入会引入冷门曲、破坏配额。最佳实践是：
- 脚本自动产出候选清单（含来源链接、热度数据）
- 以 Pull Request 形式呈现，你或我快速过目后合并
- 既省去手工逐个查番的重复劳动，又守住质量底线

---

## 四、与现有项目的契合度（已实测锚定）

> 核对 `app.js` 实际接入的端点：`graphql.anilist.co`、`api.bgm.tv`（ Bangumi 中文名）、`itunes.apple.com/search`、`www.googleapis.com/youtube/v3/search`、`upos-sz-mirrorcos.bilivideo.com`（B站）。即**发现、中文名、音频三层所需 API 本项目已全部接入**，只需新增 AnimeThemes 一个源。

| 现有资产 | 可复用点 |
|----------|----------|
| `app.js` 的 AniList 调用 + 超时封装 | 直接用于①发现层（已验证返回热度/评分） |
| `app.js` 对 `api.bgm.tv` 的调用 | 用于⑥拿番剧**官方中文名**（anime 字段与现库一致） |
| `app.js` 的 `fetchAudio`（iTunes→YouTube→B站降级链） | 直接用于④音频层，新歌无需改代码（已实测命中 2026 曲） |
| `songs.js` 的五字段格式 + `ALL_ANIME`/`AVAILABLE_TYPES` 导出 | 候选格式直接对齐 |
| 本次任务二写的曲库重建脚本思路（KEEP/DROP/FIX + norm 匹配） | 直接复用于去重与配额控制 |
| GitHub 仓库（已推送） | 用 **GitHub Actions 定时**自动跑脚本并开 PR（公开仓免费） |
| 部署在 Vercel（vercel.json 存在） | 备选：加 `crons` 字段做服务端触发（hobby 计划有次数限制，不如 Actions 稳） |
| `.workbuddy/` 本地自动化 | 备选：设"每周日跑一次发现脚本"的本地定时任务 |

---

## 五、实施工作量估算

| 模块 | 工作量 | 说明 |
|------|--------|------|
| AnimeThemes 抓取脚本（Node） | 小（0.5-1天） | 处理分页、include/filter、字段映射 |
| 质量门禁（热度门槛+配额+去重） | 小（0.5天） | 复用本次重建脚本逻辑 |
| 候选生成 / PR 自动化 | 小（0.5天） | 生成 diff + 提交 PR |
| titleCN（中文名）补全 | 中（见第六节） | 主要不确定项 |
| 定时触发器配置 | 极小（0.5h） | GitHub Actions 或 Vercel Cron |
| **合计** | **约 2-3 天** | 含联调与一次真实档期试运行 |

---

## 六、待解决的三个关键问题

### 1. `titleCN`（中文歌名）字段 — 需单独补全
AnimeThemes 只有罗马音/日文原名，**没有中文译名**。曲库现有 `titleCN` 多为原名（如「kick back」「銀河鉄道999」），少数有中文（如「红莲的弓矢」）。
**方案**：
- 方案 A（省事）：titleCN 直接复用 title（罗马音/原名），与曲库中约 70% 的条目保持一致
- 方案 B（体验好）：用 Bangumi API（`api.bgm.tv`，本项目已 preconnect）拿番剧官方中文名，歌曲名用 LLM/翻译 API 生成 —— 需 API key 与成本
- **建议**：先用方案 A 跑通流程，标题翻译作为后续增强

### 2. 热度门槛的取值
需定一个 popularity 阈值，避免把无人气的新番写进来。建议：
- 先以 AniList `popularity` 全季排序的**前 40-50 名**为候选池（Q1 档）
- 或结合 YouTube 该 OP 视频播放量（>50万）做交叉验证
- 阈值应在第一次试运行后根据实际命中数校准

### 3. 番剧中文名（anime 字段）
同理，anime 字段用 AnimeThemes 的英文名还是 Bangumi 中文名？
- 曲库现有 anime 多为中文/日文原名（「无职转生」「鬼灭之刃」），建议用 **Bangumi 中文名**以与现有一致
- 可在发现层用 AniList 的 `id` 去 Bangumi 反查中文译名

---

## 七、风险与对策

| 风险 | 概率 | 对策 |
|------|------|------|
| AnimeThemes 偶发限流 | 中 | 脚本加重试 + 指数退避；缓存结果 |
| 新番开播初期 OP 尚未录入 AnimeThemes | 高 | 定时任务设在开播后 2-4 周；可补一轮 YouTube 搜索兜底 |
| 自动写入破坏曲库"策展质量" | 中 | 坚持"候选+PR 人工复核"而非直写 |
| iTunes 暂无某新歌试听 | 低 | 现有 YouTube→B站降级链自动兜底，无需额外处理 |
| titleCN 翻译不准 | 中 | 默认用原名（方案 A），翻译作为可选增强 |

---

## 八、建议的落地路线（最小可行版 → 完整版）

**MVP（1 天内可交付）**：
1. 写一个 Node 脚本 `scripts/fetch-season.mjs`
2. 输入档期（如 summer 2026）→ AniList 取番 → AnimeThemes 取 OP/ED → 按人气前 N + 每番 1-2 首 → 输出 `candidates.js`
3. 你过目后人工合并（或我帮你合并）

**增强版**：
4. 接 GitHub Actions 每两周自动跑 → 自动开 PR
5. 接 Bangumi 补中文番剧名；titleCN 翻译（可选）
6. 热度交叉验证（YouTube 播放量）

---

## 九、一句话总结

> 三个数据源（AniList 发现 + AnimeThemes 取曲 + iTunes 音频）**实测全部可用**，现有项目已具备其中两条的完整代码。核心工作量是一个"定时发现 + 质量门禁 + 候选 PR"的脚本（约 2-3 天），唯一需要决策的是中文歌名/番名的补全策略（建议先用原名跑通，翻译作增强）。
