# 2026 年 11 月曲库审查

核对对象为 `songs.js` 的 285 首原有歌曲与 `seasonal-pools.js` 的 120 首已发布季度歌曲，共 405 个条目。浏览器里个人导入的歌曲由使用者管理。

- 番名按具体作品、季度及剧场版核查，优先用大陆授权名称或国内常用译名。原有曲库以 [Bangumi](https://bgm.tv/) 和 [Bangumi Data](https://github.com/bangumi-data/bangumi-data) 的作品身份辅助对照；季度曲库逐条用 AniList ID 对到 AnimeThemes 和 Bangumi。
- 歌名、演唱署名和 OP／ED／插曲关系，以 [AniSongDB](https://anisongdb.com/)、[AnimeThemes](https://animethemes.moe/) 和动画或唱片官方资料交叉核查。有国内通用曲名的沿用，无通行译名的保留日文或拉丁字母原名。录音有差异时采用动画实际使用的版本。
- 原有曲库修订 223 条，季度曲库修订 94 条。保留 285 首和四个各 30 首的季度曲库。发布曲库及交叉引用以本次提交为准。季度候选文件与旧音源报告是历史快照。
- 曲库校验、完整性审计和 Node 测试均通过。本轮检查的是曲目资料与归属，第三方音源未逐首重新播放。

## 歌曲归属与署名示例

- 《灌篮高手》的《直到世界尽头》为 WANDS 演唱的 ED。[东映动画](https://lineup.toei-anim.co.jp/ja/tv/movie_slumdunk/)
- Uru 的《紙一重》从《擅长逃跑的殿下》归回《地狱乐》的 ED。《怪兽8号》的《Nobody》是 OneRepublic 演唱的 ED。[《地狱乐》](https://www.jigokuraku.com/staffcast/) · [《怪兽8号》](https://kaiju-no8.net/music/ending.html)
- 2026 年 7 月《攻壳机动队 THE GHOST IN THE SHELL》的 ED《Blue》补全了 Saya Gray 与 Daniel Caesar 的客席演唱署名。[动画官网](https://www.theghostintheshell-anime.jp/news/article/?id=23860)
- 2026 年 10 月《FX战士久留美》的两首曲目按动画官网补全角色演唱名义。[动画官网](https://fxkurumi-info.com/news/?id=20260831_03)

## 改用其他歌曲或录音的原有曲库位置

以下序号从 1 开始。新条目沿用原有位置，旧歌曲记录不会绑定到另一份录音。

| 序号 | 原条目 | 本次采用 | 资料 |
|---:|---|---|---|
| 26 | 《目标是宝可梦大师》，Jason Paige | 《精灵宝可梦》日语 OP《目标是宝可梦大师》，松本梨香 | [Sony Music](https://www.sonymusic.co.jp/PR/pokemon/info/546687) |
| 66 | 《Secret Base》，ZONE | 《未闻花名》ED《secret base ～君がくれたもの～ (10 years after Ver.)》，茅野爱衣、户松遥、早见沙织 | [Aniplex](https://www.aniplex.co.jp/lineup/anohana-movie/products/detail/?id=3103) |
| 77 | 《Mysterious Beauty》 | 《冰菓》ED《まどろみの約束》，佐藤聪美、茅野爱衣 | [官方片尾视频](https://www.youtube.com/watch?v=tL6BMqnSdH8) |
| 86 | 《悲怆》 | 《一拳超人》特别 ED《悲しみたちを抱きしめて》，森口博子 | [动画官网](https://onepunchman-anime.net/goods/cd/ed.php) |
| 124 | 真人剧《非自然死亡》的《Lemon》 | 《你想活出怎样的人生》ED《地球仪》，米津玄师 | [唱片官网](https://reissuerecords.net/chikyugi/) |
| 131 | 《The Blessing》英文录音 | 《机动战士高达 水星的魔女》日语 OP《祝福》，YOASOBI | [动画条目](https://bgm.tv/subject/349441) |
| 158、159 | 《真夜中パンチ》《Sparkle》 | 《异世界舅舅》OP《story》、ED《一番星ソノリティ》 | [动画官网](https://isekaiojisan.com/music/index.html) |
| 167 | 《Wanna Be a Dreammaker》 | 《交响诗篇》ED《秘密基地》，高田梢枝 | [Sony Music](https://www.sonymusic.co.jp/artist/KozueTakada/discography/SECL-193) |
| 168 | 真人电影《NANA》的《Glamorous Sky》 | TV 动画《NANA》OP《rose》，土屋安娜 | [日本电视台](https://www.ntv.co.jp/nana/) |
| 177 | 《Asgard》 | 《未来日记》ED《filament》，妖精帝國 | [唱片官网](https://catalog.bandainamcomusiclive.co.jp/release/65387/) |
| 188 | 《虚無の真空》 | 《东京复仇者》ED《ここで息をして》，eill | [动画官网](https://tokyo-revengers-anime.com/news/archives/88) |
| 197 | 《ボクのート》 | 《棋魂》ED《ボクらの冒険》，Kids Alive | [动画条目](https://bgm.tv/subject/605) |
| 216 | 《Zoner Zound》 | 《防风少年》OP《絶対零度》，natori | [动画官网](https://windbreaker-anime.com/music/op01.html) |
| 225 | 《BATTLE CRY》 | 《蓝色监狱 VS. U-20 日本》ED《One》，Snow Man | [动画官网](https://tv.bluelock-pr.com/tv2nd/news/409/) |
| 227 | 《낟알》 | 《地。-关于地球的运动-》ED《アポリア》，Yorushika | [动画官网](https://anime-chi.jp/) |
| 233、234 | 《Sparkle》《エンヴィーベイビー》 | 《炎炎消防队 二之章》OP《SPARK-AGAIN》、ED《ディザイア》 | [OP](https://fireforce-anime.jp/season2/music/) · [ED](https://fireforce-anime.jp/season2/music/2nd.php) |
| 235、236 | 《Romantic Love》《Tokyo秋冬...》 | 《更衣人偶坠入爱河》OP《燦々デイズ》、ED《恋ノ行方》 | [动画官网](https://bisquedoll-anime.com/1st/music/) |
