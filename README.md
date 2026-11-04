# 萌豚挑战 · 二次元听歌猜番剧

听一段约 30 秒的动画歌曲，猜番剧、歌名或歌手。混合模式会逐题切换题型。内置曲库有 285 首原有歌曲和 120 首季度歌曲（2026 年 1、4、7、10 月各 30 首）。音频由第三方平台实时提供。

## 本地运行

准备 Node.js 22 或 24、可通过 `python` 命令运行的 Python 3，以及现代浏览器。首次运行在仓库目录执行 `npm ci`，安装 Vercel 函数使用的 `spark-md5`。

Windows 双击 **一键启动.bat**。它会启动或复用 8080 网站服务和 8765 B 站代理，再打开浏览器。也可以分别启动：

```sh
python -m http.server 8080 --bind 127.0.0.1
node bili-proxy.mjs
```

打开 [本地网站](http://127.0.0.1:8080/)。通过 HTTP 加载浏览器 ES Modules。B 站代理可单独用 `启动B站代理.bat` 启动。浏览器会尝试探测本地代理，也可在设置中填写 `http://127.0.0.1:8765`。

## 游戏与曲库

- 首页可切换番剧封面、查看当前出题范围和设置曲库来源。支持原有曲库、季度曲库、导入和自由组合，可叠加歌曲类型和追番筛选。
- 单人挑战可选 10、20、30 题，实际题数受曲池大小限制。答题后左侧展示番剧和歌曲信息，支持复听、收藏、反馈和回顾。提示会降低本题得分。
- 「我的曲库」分为当前曲库与全部曲库。全部曲库包含季度、自带曲库和 Bangumi 导入。追番、错题练习与音源反馈收在「曲库工具」。Bangumi 导入接受目录号，支持自定义歌曲 JSON 导入和导出。
- 收藏、排行榜、设置、导入歌曲、追番、错题和音源反馈保存在当前浏览器的 `localStorage`，按站点来源隔离。
- 联机 PK 使用 Firebase 匿名身份和 Realtime Database。房间以四位房间号或邀请链接加入，题目按 `songs.js` 中的索引同步。联机题目索引依赖原有曲库顺序。

## 目录与技术栈

| 路径 | 职责 |
|---|---|
| `index.html`、`style.css` | 单页视图、弹窗、响应式布局与动画 |
| `app.js` | 游戏状态、播放器、曲库、收藏、导入、Firebase 房间与页面事件 |
| `audio-selection.mjs` | 构造搜索词、候选评分、失败权重、歌曲去重及替换 |
| `library-navigation.mjs` | 曲库来源映射、组合、搜索、分组及试听会话标记 |
| `library-tools.mjs` | 曲目与番剧身份、追番过滤、本地错题、音源状态与反馈记录 |
| `songs.js`、`seasonal-pools.js`、`seasonal-covers.js` | 原有歌曲、已发布季度曲库和封面地址 |
| `index_75323.json` | Bangumi 目录 75323 的本地索引 |
| `bili-proxy.mjs`、`api/search.js` | Node.js 本地代理、Vercel B 站代理 |
| `scripts/`、`candidates/` | 季度发现、更新、校验和审计，以及候选与核查记录 |
| `tests/`、`.github/workflows/` | Node 内置测试、定期生成季度候选的工作流 |

前端采用原生 HTML、CSS、JavaScript 和浏览器 ES Modules。Firebase SDK 通过 CDN 加载。播放使用 HTML Audio 与 YouTube IFrame Player API。本地代理使用 Node 内置模块，Vercel 函数使用 `spark-md5` 生成 B 站 WBI 签名。

## 核心数据流

1. 单人出题先合并曲库和筛选范围，按歌名与番剧去重，优先抽取最近五局没出现的歌曲。池子不足时逐步放宽历史限制。错误选项按题型和可用曲池生成。
2. 智选三源并行检索 iTunes、YouTube 和 B 站。设置可限定为 iTunes + YouTube 或仅 B 站。搜索使用歌名、番名、歌手、类型和可用别名。评分区分歌曲识别证据与播放失败记录。强候选可提前结束收集，普通候选有约 700ms 的收集窗口，收集阶段硬上限约 8 秒。
3. iTunes 返回试听地址，YouTube 候选检查嵌入状态，B 站先搜视频再取音频流。媒体就绪后开放答题。播放失败会尝试其他候选。无可用结果时，单人模式会尝试换歌或跳题，跳过不计错。
4. 曲库试听与答题共用音源解析和会话内解析缓存。并发请求按歌曲与来源设置合并。B 站视频搜索结果缓存 24 小时，取流结果缓存 30 分钟。两者通过 `MemCache` 写入本地存储，CDN 地址可能提前失效。季度封面来自内置地址，其他封面按需查询并缓存。
5. Bangumi 目录导入优先读取仓库里的同号 JSON，其余目录通过公共 CORS 转发获取 API 或目录页面。随后用 AniList 和 iTunes 补充番名、匹配歌曲并写入本机自定义曲库。

## API 与配置

| 入口 | 行为 |
|---|---|
| `/api/search?q=关键词` | B 站搜索，返回视频 ID、标题、作者、时长等 |
| `/api/search?bvid=BV…` | 取音频 CDN 地址，可能带备用地址。仅本地代理还有直链视频流回退 |
| `/api/search?stream=…&backup=…` | 转发允许的 HTTPS CDN 地址，保留字节范围，主地址失败时可试备用地址 |

前端配置在源码和浏览器设置中。YouTube 客户端 API Key 与 Firebase 配置可被浏览器查看，权限和配额依赖各平台控制台。Vercel 可选设置 `BILI_COOKIE` 供服务端请求使用。季度更新脚本可选设置 `YOUTUBE_API_KEY` 和 `BILI_WORKER_URL`。GitHub Actions 用工作流提供的令牌维护季度候选 PR。

## 季度更新

```sh
npm run discover -- --year 2026 --season fall --out candidates/2026-10
npm run update-season -- --year 2026 --season fall
```

发现脚本从 AniList 获取当季热门 TV 动画，按 AniList ID 关联 AnimeThemes，筛选有 OP 和 ED 的番剧，默认目标为 15 部。候选保存在 `candidates/YYYY-MM.json` 和同名 Markdown 中。季度键使用 01、04、07、10。发现命令默认用 UTC，Windows 更新入口默认用本机日期。

`一键更新季度曲库.bat` 默认按本机日期取当季。补查 10 月可在命令窗口运行 `一键更新季度曲库.bat --year 2026 --season fall`。交互脚本按 Bangumi 收藏热度选择当季 TV 动画，直接使用榜单中文名，以 AniList 和 AnimeThemes 补充封面及 OP／ED。

遇到无法确认的番剧或歌曲时，按窗口提示补填或跳过。输入 `/quit` 保存退出，下次继续。手工音源支持 YouTube 视频、B 站完整视频地址和 iTunes 试听直链。请先试听确认曲目，脚本会再检查链接可用性。候选进度与逐首报告在 `candidates/YYYY-MM-bangumi.*`。

B 站请粘贴浏览器地址栏中形如 `https://www.bilibili.com/video/BV…/` 的视频页。若复制到的是 `b23.tv` 分享短链，先用浏览器打开，再复制展开后的地址。可用 `--check-links 9` 抽查榜单前 9 部的音源，或用 `--retry-skipped` 把已跳过的番剧放回复核队列。

进入逐项复核前，脚本会批量检查当前候选。每次最多检查两首，每首的三个音源并行，快查上限 12 秒。扫描后可输入 `R` 重试失败项，已通过的结果会复用。更新代理文件后，重启已打开的本地 B 站代理窗口可使用新的线路规则。

凑齐 15 部与 30 首后，输入 `Y` 才写入曲库、封面与音源，并更新浏览器缓存版本。失败会恢复这些文件。成功后刷新 8080 可查看新季度、海报和试听。YouTube 的自动检查依据嵌入状态，实际播放仍受地区、网络和授权限制。GitHub 工作流使用独立的 AniList 发现命令维护候选 PR。

## 验证与部署

```sh
npm test
npm run validate
npm run audit
```

项目无构建、Lint 和 TypeScript 步骤。Vercel 从仓库根目录提供静态资源与 `api/search.js`。GitHub Pages 和其他纯静态托管仅提供网页，B 站功能使用网页设置中的代理地址。部署应包含三个数据模块、所有前端模块和图片。修改模块时更新其导入 URL 的缓存版本。校验脚本要求 `index.html` 的 CSS、入口脚本与 `app.js` 的原有曲库版本一致。

## 常见问题

- **页面空白或按钮没反应**。确认从 HTTP 地址打开，并检查浏览器能否访问 Firebase CDN。
- **B 站取流失败**。检查 8765 本地代理是否在运行。线上代理和本地代理都可能被 B 站限流。
- **YouTube 提示点击播放或跳题**。浏览器可能拦截自动播放，视频也可能受嵌入或地区限制。可点播放或切换来源。
- **季度曲目难匹配**。部分曲名和歌手只有罗马音，外部搜索结果可能主要用日文。查看音源反馈和候选核查记录。
- **换浏览器后数据不见了**。本地记录按浏览器和站点来源保存。自定义曲库可用 JSON 迁移。

当前验证范围、待确认项和维护顺序见 [PROJECT_STATUS.md](PROJECT_STATUS.md)。
