# 宝塔面板部署指南 · 萌豚挑战

> 目标：把这个动漫歌曲答题网站部署到你自己的服务器（宝塔面板）上。

---

## 〇、先搞清楚这个项目的结构

| 文件 | 作用 | 宝塔能否跑 |
|------|------|-----------|
| `index.html` / `app.js` / `songs.js` / `style.css` | **网站主体（纯静态）** | ✅ 直接放就行 |
| `图标1.png` / `hero-icon.png` | 图片资源 | ✅ |
| `api/search.js` | B站音频代理（Vercel 函数） | ❌ 宝塔跑不了 serverless |
| `bili-proxy.py` | B站代理的本地 Python 版 | ✅ 可做后台进程 |
| `bili-worker.js` | Cloudflare Worker 版 | ❌ 跑在 CF 上 |
| `vercel.json` / `wrangler.toml` | Vercel/CF 配置 | 不用管 |

**核心结论**：网站主体是纯静态的，宝塔 100% 能部署。唯一的后端依赖是「B站音频代理」，但它只是音频降级链的最后一环（iTunes 主源 → YouTube → B站兜底），即使不部署也不影响主流程。

而且——前端默认指向 `https://anime-song-gamma.vercel.app`（你已有的 Vercel 部署）。**只要 Vercel 还在跑，宝塔上的静态站也能继续借用它的 B站代理，功能完整。**

所以下面给两套方案，按你的需求选：
- **方案 A（推荐）**：宝塔只放静态文件，B站代理继续用 Vercel —— 最省事，5 分钟搞定
- **方案 B**：完全自托管，连 B站代理也搬到宝塔 —— 适合想彻底脱离 Vercel 的人

---

## 方案 A：纯静态部署（推荐）

### 第 1 步：服务器准备
1. 买一台云服务器（阿里云/腾讯云/华为云都行，1 核 1G 足够，因为只是静态站）
2. 系统选 **Ubuntu 22.04** 或 **CentOS 7.9+**
3. 按宝塔官网 `bt.cn` 一键安装宝塔面板：
   ```bash
   # Ubuntu
   wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec

   # CentOS
   yum install -y wget && wget -O install.sh https://download.bt.cn/install/install_6.0.sh && sh install.sh ed8484bec
   ```
4. 装完记下**面板地址、账号、密码**，登录宝塔

### 第 2 步：装 Nginx
登录宝塔后，左侧 **「软件商店」** → 搜索 **「Nginx」** → 安装稳定版（1.22 或更高）。
> 静态站只需要 Nginx，不需要 PHP / MySQL / 数据库。

### 第 3 步：绑定域名（推荐，也可用 IP）
1. 去域名服务商（阿里云万网/腾讯云 DNSPod）买/解析一个域名，比如 `anime.yourdomain.com`
2. 添加 A 记录指向**你的服务器公网 IP**
3. 等解析生效（通常几分钟到几小时）

> 没域名也能用，直接用 `http://服务器IP` 访问，但没法上 HTTPS。

### 第 4 步：宝塔创建站点
1. 宝塔左侧 **「网站」** → **「添加站点」**
2. 填写：
   - **域名**：`anime.yourdomain.com`（或留空用 IP）
   - **根目录**：默认 `/www/wwwroot/anime.yourdomain.com`
   - **PHP 版本**：选 **「纯静态」**
   - **数据库**：不创建
3. 点 **「提交」**

### 第 5 步：上传项目文件
**关键：只传静态文件，不传后端文件和无关文件。**

需要上传的文件（共 7 个）：
```
index.html
app.js
songs.js
style.css
hero-icon.png
图标1.png
小小佐仓千代2026top150.txt   ← 可选，仅作参考
```

**不要上传**的文件：
```
api/                    ← Vercel 函数，宝塔不用
node_modules/           ← 依赖包，静态站不需要
package.json / package-lock.json
vercel.json / wrangler.toml
bili-proxy.py / bili-worker.js   ← 方案 A 不用
.workbuddy/             ← 本地 AI 工作数据
feasibility-auto-library.md / overview.md  ← 文档
```

**上传方式二选一**：
- **方式 1（推荐，打包传）**：本地把这 7 个文件打成 zip → 宝塔「文件」进站点目录 → 上传 zip → 右键解压
- **方式 2（命令行，懂的话更快）**：服务器装 git 后 `git clone` 你的仓库，再把静态文件复制到站点目录

### 第 6 步：验证访问
浏览器打开 `http://anime.yourdomain.com`（或 `http://服务器IP`），应该能看到网站。
- 答题、iTunes 试听、YouTube 降级 → **正常** ✅
- B站兜底 → **也能用**（前端默认调 Vercel 的代理，跨域请求不影响）✅

### 第 7 步：上 HTTPS（强烈推荐）
1. 宝塔「网站」→ 点你站点右侧 **「设置」** → **「SSL」** 标签
2. 选 **「Let's Encrypt」** → 勾选域名 → **「申请」**（免费、自动续签）
3. 申请成功后，开启 **「强制 HTTPS」**
4. 以后访问 `https://anime.yourdomain.com` 就是绿色小锁了

---

## 方案 B：完全自托管（连 B站代理也搬过来）

> 适合：不想依赖 Vercel、或 Vercel 免费额度不够用、想要全部数据自己掌控。

在方案 A 的基础上，**额外**做以下步骤：

### B1. 装 Python 项目管理器
宝塔「软件商店」→ 搜 **「Python 项目管理器」** → 安装。

### B2. 准备 B站代理
1. 宝塔「文件」→ 进站点目录 → 新建子目录 `bili-proxy`
2. 把本地的 `bili-proxy.py` 上传进去
3. 在 `bili-proxy` 目录里创建 `requirements.txt`，内容：
   ```
   flask
   flask-cors
   bilibili-api-python
   ```
4. 宝塔「Python 项目管理器」→ **「添加项目」**：
   - 项目路径：`/www/wwwroot/anime.yourdomain.com/bili-proxy`
   - Python 版本：3.10 或更高
   - 启动文件：`bili-proxy.py`
   - 端口：8765
   - **开机自启**：勾上
5. 启动项目，宝塔日志里看到 `Running on http://0.0.0.0:8765` 即成功

### B3. 给代理配反向代理 + HTTPS
B站代理默认监听 8765 端口，不能直接对外（防火墙、HTTPS 问题）。用 Nginx 反代到子路径：

1. 宝塔「网站」→ 你的站点「设置」→ **「反向代理」** → **「添加反向代理」**
2. 填：
   - 代理名称：`bili`
   - 目标 URL：`http://127.0.0.1:8765`
   - 发送域名：`$host`
   - **代理目录**：`/bili`  ← 关键，让 `https://yourdomain/bili/search` 转发到 `http://localhost:8765/search`
3. 保存

### B4. 改前端指向
打开你**上传到宝塔的** `app.js`（不是本地这份），找到第 82 行附近：
```javascript
const BILI_WORKER_URL_DEFAULT = 'https://anime-song-gamma.vercel.app';
```
改成你的反代地址（注意去掉 `/bili` 后缀，因为前端拼接时已有 `/api/search`，需要调整反代规则或路径）。

**更稳妥的做法**：不硬改代码，而是让用户在网站**设置弹窗**里填「B站代理地址」（你的网站本来就有这个设置项，存在 localStorage）。这样部署时不用动代码。

### B5. 注意事项
- `bili-proxy.py` 的搜索功能比 `api/search.js` 简单（少了 wbi 签名和 cookie），命中率可能略低
- 如果想要 100% 等价的功能，可以把 `api/search.js` 改写成 Node 常驻服务（用 PM2 管理器跑），但工作量较大
- B站 API 有反爬，建议在服务器上配个稳定的 cookie

---

## 方案对比

| 维度 | 方案 A（纯静态） | 方案 B（自托管） |
|------|-----------------|-----------------|
| 部署难度 | ⭐ 极简 | ⭐⭐⭐ 中等 |
| 耗时 | 5-10 分钟 | 1-2 小时 |
| 依赖 Vercel | 是（B站代理） | 否 |
| B站兜底可用 | ✅（借 Vercel） | ✅（自建） |
| 维护成本 | 几乎零 | 需关注 Python 进程存活 |
| 适合人群 | 大多数人 | 想完全自控的 |

**我的建议**：先用方案 A 跑起来，体验几天没问题再考虑要不要上方案 B。静态站几乎不会挂，Vercel 免费额度对你这种小站绰绰有余。

---

## 常见问题

**Q: 部署后访问白屏？**
A: F12 看控制台。最常见是文件没传全（漏了 songs.js）或路径大小写问题（Linux 区分大小写，Windows 不区分——本地 `Songs.js` 上传后可能找不到 `songs.js`）。

**Q: iTunes 试听没声音？**
A: 检查是不是 HTTPS 没配。iTunes 试听链接是 https 的，混在 http 页面里会被浏览器拦（mixed content）。配 SSL 即可。

**Q: 想换个端口而不是 80/443？**
A: 宝塔「网站」→ 站点设置 → 「配置文件」，改 `listen 80;` 为 `listen 8080;` 等。记得宝塔「安全」里放行该端口。

**Q: 怎么更新曲库/代码？**
A: 改完本地文件 → 重新上传覆盖 → **强刷浏览器**（Ctrl+Shift+R）。代码里带 `?v=25` 版本号，改代码时记得把版本号 +1（app.js 第 4 行 + index.html 的 script 标签），用户不用强刷也能拿到新版本。

**Q: 服务器放哪个地区好？**
A: 用户主要在国内就选国内节点（阿里云杭州/腾讯云上海），但国内服务器**需要备案**才能绑域名。不想备案就选香港/新加坡节点，延迟稍高但免备案。

---

## 一句话总结

> **方案 A**：宝塔装 Nginx → 建站点 → 传 7 个静态文件 → 配 SSL，5 分钟搞定，B站代理继续白嫖 Vercel。**就这个。**
