# 萌豚挑战 — 动漫音乐猜谜

一款二次元风格的在线动漫音乐猜谜游戏。听30秒歌曲片段，猜出它来自哪部动漫。
此网站完全由AI生成。

**[>> 点击开始挑战 <<](https://yuki3303-a11y.github.io/anime-song/)**

## 游戏模式

- **单人挑战** — 自定义题数，答对得分，连续答对有连击加成
- **PK对战** — 创建房间邀请好友，实时对战比拼谁更懂动漫音乐（需要科学上网环境）

## 曲库

- 内置 560+ 首经典动漫歌曲（OP/ED/IN），每首均经过人工验证
- 支持按年份、类型（可多选）筛选
- 可导入 Bangumi 目录扩充曲库
- 支持自定义歌曲 JSON 导入/导出

## 特色功能

- **完整歌曲播放** — 答题后可播放 YouTube 完整版歌曲
- **歌单系统** — 收藏喜欢的歌曲，支持全部播放、随机播放、顺序播放
- **番剧封面** — 自动获取 AniList/Bangumi 番剧封面图
- 樱花飘落背景动画
- 答对/答错视觉反馈（闪光 + 涟漪）
- 上一题回顾功能
- 排行榜记录
- 键盘快捷键支持

## 键盘快捷键

| 按键 | 功能 |
|------|------|
| `1`-`4` | 选择答案选项 |
| `Space` | 播放/暂停音频 |
| `Escape` | 关闭弹窗 |
| `←` `→` | 历史题目导航 |

## 技术栈

纯前端实现，无需后端：

- HTML / CSS / JavaScript（ES Modules）
- Firebase Realtime Database（多人PK）（需要科学上网环境）
- Firebase Anonymous Auth
- YouTube Data API v3 + IFrame Player API（完整歌曲播放）
- AniList GraphQL API（动漫封面）
- Bangumi API（番剧信息）
- iTunes Search API（音频预览）

## 本地运行

```bash
# 启动本地服务器
python -m http.server 8080

# 打开浏览器
# http://localhost:8080
```

## 部署

通过 GitHub Pages 自动部署，推送到 `master` 分支即可。

## 许可

仅供学习交流使用。
