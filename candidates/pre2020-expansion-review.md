# 2020 年前曲库：按番剧部数扩充

更新日期：2026-11-12。目标已更正为**2011—2019年每年约60部番剧，2010年及以前合计约100部番剧**。目标不按歌曲首数、题数或演唱版本数计算；同一作品的多个OP/ED不增加番剧部数。

## 实际数量

部数按独立AniList作品ID去重，歌曲条目与单局出题去重后的曲目数另行统计。相比v70，本次增加382部作品、1455个曲目条目，原有315首和v70全部2525条季度记录逐字段保留。2020年后的季度选取规则保持现状。

| 范围 | 更正前部数 | 目标部数 | 实际部数 | 曲目条目 | 单局去重曲目 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2010年及以前 | 66 | 100 | 100 | 570 | 570 |
| 2011年 | 14 | 60 | 60 | 229 | 229 |
| 2012年 | 21 | 60 | 60 | 174 | 174 |
| 2013年 | 16 | 60 | 60 | 197 | 197 |
| 2014年 | 23 | 60 | 60 | 182 | 182 |
| 2015年 | 23 | 60 | 60 | 146 | 146 |
| 2016年 | 25 | 60 | 60 | 148 | 146 |
| 2017年 | 29 | 60 | 60 | 147 | 147 |
| 2018年 | 21 | 60 | 60 | 161 | 161 |
| 2019年 | 20 | 60 | 60 | 154 | 154 |

全站目前共有1458部作品、4230个曲目条目，单局去重曲池4132首，按114个非空季度归档。10/20/30题设置仍决定单局题数。

## 选取与排序规则

1. [Bangumi公开API](https://bangumi.github.io/dev-docs/)按heat读取日本TV动画年度首播范围，实际每页20条，分页取得候选。2010年及以前为一个合并范围。
2. 已有作品和歌曲全部保留。新增作品按热度顺序优先补足到60部/100部；因原有榜外作品仍在，最终名单不要求等同于纯榜单截取。达到部数目标后不再加新作，已有作品的已核实OP/ED仍继续补齐。
3. 每个年度前60候选、早期前100候选均逐作核对；热度排序保存在historical-ranks.js，网页选择历史年份或季度时按该顺序显示，无排名的原有作品排在其后。
4. 以日文原名、正式季度、精确AniList资源ID核对作品，拒绝TV/OVA/剧场版串号与HD重编条目虚增。中文名以Bangumi中文名为基础。
5. [AnimeThemes](https://animethemes.moe/)主题目录提供歌名、类型、序号与演唱署名；数据库漏署名时，使用电视台、动画官网和唱片发行商资料补核，来源URL保留在JSON的sourceReviews及previousVersionSources。常规不同歌名OP/ED及长篇后续OP/ED一并收录，不以Off-Vocal、纯配乐、纯混音或无法确认的版本凑数。
6. 来源缺曲/缺署名与“达到目标后暂缓收录的新作品”分别记录。缺口不称为未公开歌曲；没有可靠依据时不猜演员/歌手。此前确认删除的六部早期作品不恢复。

## 验证范围与剩余缺口

157项自动测试、曲库校验与完整性审计通过；保留旧曲、独立作品计数与热度排序均有检查。新增曲目继续使用现有三源检索，尚未逐首人工听审全部新增歌曲。未知演唱署名与特殊片尾仍按项保存在[完整清单](pre2020-expansion.json)的missing等字段，不承诺每部所有主题资料都完整。

## 当前已收录作品

### 2010年及以前

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 新世纪福音战士 | 1 | 2 | [来源](https://animethemes.moe/anime/neon_genesis_evangelion) |
| 轻音少女 | 2 | 2 | [来源](https://animethemes.moe/anime/k_on) |
| CLANNAD ～AFTER STORY～ | 3 | 3 | [来源](https://animethemes.moe/anime/clannad_after_story) |
| CLANNAD | 4 | 2 | [来源](https://animethemes.moe/anime/clannad) |
| 龙与虎 | 5 | 5 | [来源](https://animethemes.moe/anime/toradora) |
| 死亡笔记 | 6 | 4 | [来源](https://animethemes.moe/anime/death_note) |
| 钢之炼金术师 FULLMETAL ALCHEMIST | 7 | 10 | [来源](https://animethemes.moe/anime/fullmetal_alchemist_brotherhood) |
| 化物语 | 8 | 6 | [来源](https://animethemes.moe/anime/bakemonogatari) |
| 轻音少女 第二季 | 9 | 5 | [来源](https://animethemes.moe/anime/k_on_2010) |
| 某科学的超电磁炮 | 10 | 5 | [来源](https://animethemes.moe/anime/toaru_kagaku_no_railgun) |
| 星际牛仔 | 11 | 1 | [来源](https://anilist.co/anime/1) |
| 天使的心跳 | 12 | 3 | [来源](https://animethemes.moe/anime/angel_beats) |
| 反叛的鲁路修 | 13 | 6 | [来源](https://animethemes.moe/anime/code_geass_hangyaku_no_lelouch) |
| 幸运星 | 14 | 24 | [来源](https://animethemes.moe/anime/luckystar) |
| 凉宫春日的忧郁 2009 | 15 | 2 | [来源](https://animethemes.moe/anime/suzumiya_haruhi_no_yuuutsu_2009) |
| 凉宫春日的忧郁 | 16 | 4 | [来源](https://animethemes.moe/anime/suzumiya_haruhi_no_yuuutsu) |
| 天元突破 红莲螺岩 | 17 | 4 | [来源](https://animethemes.moe/anime/tengen_toppa_gurren_lagann) |
| 吊带袜天使 | 18 | 1 | [来源](https://animethemes.moe/anime/panty_stocking_with_garterbelt) |
| 海贼王 | 19 | 50 | [来源](https://animethemes.moe/anime/one_piece) |
| 我的妹妹哪有这么可爱！ | 20 | 13 | [来源](https://animethemes.moe/anime/ore_no_imouto_ga_konnani_kawaii_wake_ga_nai) |
| 寒蝉鸣泣之时 | 21 | 2 | [来源](https://animethemes.moe/anime/higurashi_no_naku_koro_ni) |
| 银魂 | 22 | 13 | [来源](https://animethemes.moe/anime/gintama) |
| 缘之空 | 23 | 2 | [来源](https://animethemes.moe/anime/yosuga_no_sora_in_solitude_where_we_are_least_alone) |
| 四叠半神话大系 | 24 | 2 | [来源](https://animethemes.moe/anime/yojouhan_shinwa_taikei) |
| Code Geass 反叛的鲁路修R2 | 25 | 4 | [来源](https://animethemes.moe/anime/code_geass_hangyaku_no_lelouch_r2) |
| 魔法禁书目录 | 26 | 2 | [来源](https://animethemes.moe/anime/toaru_majutsu_no_index) |
| 无头骑士异闻录 | 27 | 2 | [来源](https://animethemes.moe/anime/durarara) |
| 笨蛋，测验，召唤兽 | 29 | 2 | [来源](https://animethemes.moe/anime/baka_to_test_to_shoukanjuu) |
| AIR | 30 | 2 | [来源](https://animethemes.moe/anime/air) |
| 狼与香辛料 | 31 | 2 | [来源](https://animethemes.moe/anime/ookami_to_koushinryou) |
| 混沌武士 | 32 | 4 | [来源](https://animethemes.moe/anime/samurai_champloo) |
| 名侦探柯南 | 33 | 44 | [来源](https://animethemes.moe/anime/detective_conan) |
| 永生之酒 | 34 | 2 | [来源](https://animethemes.moe/anime/baccano) |
| Fate/stay night | 35 | 3 | [来源](https://animethemes.moe/anime/fatestay_night) |
| 夏目友人帐 | 36 | 1 | [来源](https://animethemes.moe/anime/natsume_yuujinchou) |
| 攻壳机动队 STAND ALONE COMPLEX | 37 | 2 | [来源](https://animethemes.moe/anime/ghost_in_the_shell_stand_alone_complex) |
| 攻壳机动队 S.A.C. 2nd GIG | 38 | 1 | [来源](https://animethemes.moe/anime/ghost_in_the_shell_stand_alone_complex_2nd_gig) |
| 寒蝉鸣泣之时 解 | 39 | 1 | [来源](https://animethemes.moe/anime/higurashi_no_naku_koro_ni_kai) |
| 妄想学生会 | 40 | 2 | [来源](https://animethemes.moe/anime/seitokai_yakuindomo) |
| 魔法禁书目录 第二季 | 41 | 4 | [来源](https://animethemes.moe/anime/toaru_majutsu_no_index_ii) |
| 魔卡少女樱 | 42 | 4 | [来源](https://animethemes.moe/anime/cardcaptor_sakura) |
| 欢迎加入NHK！ | 43 | 3 | [来源](https://animethemes.moe/anime/nhk_ni_youkoso) |
| 钢之炼金术师 | 44 | 3 | [来源](https://animethemes.moe/anime/fullmetal_alchemist) |
| 灼眼的夏娜 | 45 | 4 | [来源](https://animethemes.moe/anime/shakugan_no_shana) |
| DARKER THAN BLACK -黑之契约者- | 46 | 3 | [来源](https://animethemes.moe/anime/darker_than_black_kuro_no_keiyakusha) |
| 天降之物 | 47 | 10 | [来源](https://animethemes.moe/anime/sora_no_otoshimono) |
| 出包王女 | 48 | 1 | [来源](https://animethemes.moe/anime/to_love_ru) |
| 日在校园 | 50 | 7 | [来源](https://animethemes.moe/anime/school_days) |
| 零之使魔 | 51 | 2 | [来源](https://animethemes.moe/anime/zero_no_tsukaima) |
| 玲音 | 52 | 1 | [来源](https://anilist.co/anime/339) |
| 只有神知道的世界 | 53 | 7 | [来源](https://animethemes.moe/anime/kami_nomi_zo_shiru_sekai) |
| 火影忍者 | 54 | 24 | [来源](https://animethemes.moe/anime/naruto) |
| 少女革命 | 55 | 2 | [来源](https://animethemes.moe/anime/shoujo_kakumei_utena) |
| 狼与香辛料 第二季 | 56 | 2 | [来源](https://animethemes.moe/anime/ookami_to_koushinryou_ii) |
| 荒川爆笑团 | 57 | 3 | [来源](https://animethemes.moe/anime/arakawa_under_the_bridge) |
| 悠久之翼 | 58 | 5 | [来源](https://animethemes.moe/anime/ef_a_tale_of_memories) |
| 南家三姐妹 | 60 | 2 | [来源](https://animethemes.moe/anime/minami_ke) |
| 火影忍者疾风传 | 61 | 61 | [来源](https://animethemes.moe/anime/naruto_shippuuden) |
| 蜂蜜与四叶草 | 62 | 2 | [来源](https://animethemes.moe/anime/hachimitsu_to_clover) |
| 学园默示录 HIGHSCHOOL OF THE DEAD | 65 | 13 | [来源](https://animethemes.moe/anime/highschool_of_the_dead) |
| 夏目友人帐 第二季 | 66 | 1 | [来源](https://anilist.co/anime/5300) |
| 真实之泪 | 67 | 1 | [来源](https://animethemes.moe/anime/true_tears) |
| 爆漫王。 | 68 | 1 | [来源](https://animethemes.moe/anime/bakuman) |
| 水星领航员 | 69 | 3 | [来源](https://animethemes.moe/anime/aria_the_animation) |
| 地狱少女 | 84 | 2 | [来源](https://animethemes.moe/anime/jigoku_shoujo) |
| 死神 | 86 | 45 | [来源](https://animethemes.moe/anime/bleach) |
| NANA | 93 | 2 | [来源](https://anilist.co/anime/877) |
| 犬夜叉 | 98 | 7 | [来源](https://animethemes.moe/anime/inuyasha) |
| 龙珠 | 105 | 1 | [来源](https://anilist.co/anime/223) |
| 交响诗篇 | 111 | 2 | [来源](https://anilist.co/anime/237) |
| 棋魂 | 119 | 2 | [来源](https://anilist.co/anime/135) |
| 黑之契约者 流星的双子 | 120 | 2 | [来源](https://animethemes.moe/anime/darker_than_black_ryuusei_no_gemini) |
| 噬魂师 | 124 | 4 | [来源](https://animethemes.moe/anime/soul_eater) |
| 剑风传奇（1997） | 128 | 3 | [来源](https://animethemes.moe/anime/berserk) |
| 精灵宝可梦 | 131 | 7 | [来源](https://animethemes.moe/anime/pokemon) |
| 龙珠GT | 原有保留 | 1 | [来源](https://anilist.co/anime/225) |
| 浪客剑心 | 原有保留 | 10 | [来源](https://animethemes.moe/anime/rurouni_kenshin_meiji_kenkaku_romantan) |
| 圣斗士星矢 | 原有保留 | 3 | [来源](https://animethemes.moe/anime/saint_seiya) |
| 北斗神拳 | 原有保留 | 2 | [来源](https://anilist.co/anime/967) |
| 美少女战士 | 原有保留 | 2 | [来源](https://anilist.co/anime/530) |
| 名侦探柯南：迷宫的十字路口 | 原有保留 | 1 | [来源](https://anilist.co/anime/1366) |
| 数码宝贝 | 原有保留 | 4 | [来源](https://animethemes.moe/anime/digimon_adventure) |
| 头文字D | 原有保留 | 3 | [来源](https://animethemes.moe/anime/initial_d_first_stage) |
| 头文字D Second Stage | 原有保留 | 2 | [来源](https://animethemes.moe/anime/initial_d_second_stage) |
| 机动战士高达SEED | 原有保留 | 3 | [来源](https://animethemes.moe/anime/mobile_suit_gundam_seed) |
| 秒速5厘米 | 原有保留 | 1 | [来源](https://anilist.co/anime/1689) |
| 黑执事 | 原有保留 | 3 | [来源](https://animethemes.moe/anime/kuroshitsuji) |
| 超时空要塞Frontier | 原有保留 | 14 | [来源](https://animethemes.moe/anime/macross_f) |
| 魔法老师涅吉！ | 原有保留 | 2 | [来源](https://animethemes.moe/anime/mahou_sensei_negima) |
| 魔法少女奈叶A's | 原有保留 | 2 | [来源](https://animethemes.moe/anime/mahou_shoujo_lyrical_nanoha_as) |
| 新机动战记高达W | 原有保留 | 1 | [来源](https://anilist.co/anime/90) |
| 超时空要塞：可曾记得爱 | 原有保留 | 1 | [来源](https://anilist.co/anime/1089) |
| 幽游白书 | 原有保留 | 1 | [来源](https://anilist.co/anime/392) |
| 游戏王 怪兽之决斗 | 原有保留 | 4 | [来源](https://animethemes.moe/anime/yugioh_duel_monsters) |
| 网球王子 | 原有保留 | 10 | [来源](https://animethemes.moe/anime/tennis_no_ouji_sama) |
| 麻辣教师GTO | 原有保留 | 3 | [来源](https://animethemes.moe/anime/great_teacher_onizuka) |
| 猫的报恩 | 原有保留 | 1 | [来源](https://anilist.co/anime/597) |
| 水果篮子 | 原有保留 | 3 | [来源](https://animethemes.moe/anime/fruits_basket) |
| 千与千寻 | 原有保留 | 1 | [来源](https://anilist.co/anime/199) |
| 新世纪福音战士新剧场版：序 | 原有保留 | 1 | [来源](https://anilist.co/anime/2759) |

### 2011年

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 命运石之门 | 1 | 4 | [来源](https://animethemes.moe/anime/steinsgate) |
| 魔法少女小圆 | 2 | 4 | [来源](https://animethemes.moe/anime/mahou_shoujo_madokamagica) |
| Fate/Zero | 3 | 2 | [来源](https://animethemes.moe/anime/fatezero) |
| 日常 | 4 | 16 | [来源](https://animethemes.moe/anime/nichijou) |
| 未闻花名 | 5 | 2 | [来源](https://animethemes.moe/anime/ano_hi_mita_hana_no_namae_wo_bokutachi_wa_mada_shiranai) |
| 罪恶王冠 | 6 | 6 | [来源](https://animethemes.moe/anime/guilty_crown) |
| 未来日记 | 7 | 4 | [来源](https://animethemes.moe/anime/mirai_nikki) |
| 银魂 第二季 | 8 | 7 | [来源](https://animethemes.moe/anime/gintama_2011) |
| 回转企鹅罐 | 9 | 11 | [来源](https://animethemes.moe/anime/mawaru_penguindrum) |
| 花开伊吕波 | 10 | 8 | [来源](https://animethemes.moe/anime/hanasaku_iroha) |
| GOSICK | 11 | 3 | [来源](https://animethemes.moe/anime/gosick) |
| 笨蛋，测验，召唤兽2！ | 12 | 4 | [来源](https://animethemes.moe/anime/baka_to_test_to_shoukanjuu_ni) |
| 我的朋友很少 | 13 | 2 | [来源](https://animethemes.moe/anime/boku_wa_tomodachi_ga_sukunai) |
| 摇曳百合 | 14 | 2 | [来源](https://animethemes.moe/anime/yuru_yuri) |
| 电波女与青春男 | 15 | 2 | [来源](https://animethemes.moe/anime/denpa_onna_to_seishun_otoko) |
| 偶像大师 | 16 | 26 | [来源](https://animethemes.moe/anime/the_idolm_at_ster) |
| 夏目友人帐 叁 | 17 | 2 | [来源](https://animethemes.moe/anime/natsume_yuujinchou_san) |
| 白兔糖 | 18 | 2 | [来源](https://animethemes.moe/anime/usagi_drop) |
| 这个是僵尸吗？ | 19 | 2 | [来源](https://animethemes.moe/anime/kore_wa_zombie_desu_ka) |
| 绯弹的亚里亚 | 20 | 2 | [来源](https://animethemes.moe/anime/hidan_no_aria) |
| 猎人 | 21 | 5 | [来源](https://animethemes.moe/anime/hunter_x_hunter_2011) |
| IS〈无限斯特拉托斯〉 | 22 | 2 | [来源](https://animethemes.moe/anime/is_infinite_stratos) |
| 神的记事本 | 23 | 3 | [来源](https://animethemes.moe/anime/kamisama_no_memochou) |
| 青之驱魔师 | 24 | 4 | [来源](https://animethemes.moe/anime/ao_no_exorcist) |
| 丹特丽安的书架 | 25 | 1 | [来源](https://animethemes.moe/anime/dantalian_no_shoka) |
| 迷茫管家与懦弱的我 | 26 | 2 | [来源](https://animethemes.moe/anime/mayo_chiki) |
| 只有神知道的世界 第二季 | 27 | 3 | [来源](https://animethemes.moe/anime/kami_nomi_zo_shiru_sekai_ii) |
| 歌牌情缘 | 28 | 2 | [来源](https://animethemes.moe/anime/chihayafuru) |
| 灼眼的夏娜III -Final- | 29 | 6 | [来源](https://animethemes.moe/anime/shakugan_no_shana_iii_final) |
| 境界线上的地平线 | 30 | 3 | [来源](https://animethemes.moe/anime/kyoukaisenjou_no_horizon) |
| 迷糊餐厅 第二季 | 31 | 2 | [来源](https://animethemes.moe/anime/working_2011) |
| 爆漫王。2 | 32 | 2 | [来源](https://animethemes.moe/anime/bakuman_2) |
| 好想告诉你 第二季 | 33 | 2 | [来源](https://animethemes.moe/anime/kimi_ni_todoke_2nd_season) |
| 恶魔阿萨谢尔在召唤你 | 34 | 2 | [来源](https://animethemes.moe/anime/yondemasu_yo_azazel_san) |
| 赌博默示录 破戒录篇 | 35 | 2 | [来源](https://animethemes.moe/anime/gyakkyou_burai_kaiji_hakairoku_hen) |
| 未来都市NO.6 | 36 | 2 | [来源](https://animethemes.moe/anime/no6) |
| 侵略!?乌贼娘 | 37 | 2 | [来源](https://animethemes.moe/anime/shinryaku_ika_musume_2011) |
| 便・当 | 38 | 3 | [来源](https://animethemes.moe/anime/ben_to) |
| 放浪男孩 | 39 | 2 | [来源](https://animethemes.moe/anime/hourou_musuko) |
| BLOOD-C | 40 | 2 | [来源](https://animethemes.moe/anime/blood_c) |
| 金钱掌控 | 41 | 2 | [来源](https://animethemes.moe/anime/c_the_money_of_soul_and_possibility_control) |
| 萝球社！ | 42 | 2 | [来源](https://animethemes.moe/anime/ro_kyu_bu) |
| 灵异E接触 | 43 | 2 | [来源](https://animethemes.moe/anime/level_e) |
| 纯白交响曲 | 44 | 2 | [来源](https://animethemes.moe/anime/mashiro_iro_symphony_the_color_of_lovers) |
| 女神异闻录4 | 45 | 10 | [来源](https://animethemes.moe/anime/persona_4_the_animation) |
| C3 -魔方少女- | 46 | 4 | [来源](https://animethemes.moe/anime/c3) |
| 少年同盟 | 47 | 2 | [来源](https://animethemes.moe/anime/kimi_to_boku) |
| 异国迷宫的十字路口 | 48 | 2 | [来源](https://animethemes.moe/anime/ikoku_meiro_no_croisee) |
| 滑头鬼之孙～千年魔京～ | 49 | 4 | [来源](https://animethemes.moe/anime/nurarihyon_no_mago_sennen_makyou) |
| UN-GO | 50 | 2 | [来源](https://animethemes.moe/anime/un_go) |
| 恶魔奶爸 | 51 | 10 | [来源](https://animethemes.moe/anime/beelzebub) |
| 腹黑妹妹控兄记 | 52 | 2 | [来源](https://animethemes.moe/anime/oniichan_no_koto_nanka_zenzen_suki_ja_nai_n_da_kara_ne) |
| 架向星空之桥 | 53 | 1 | [来源](https://animethemes.moe/anime/hoshizora_e_kakaru_hashi) |
| 玉响～hitotose～ | 54 | 6 | [来源](https://animethemes.moe/anime/tamayura_hitotose) |
| TIGER & BUNNY | 55 | 4 | [来源](https://animethemes.moe/anime/tiger_bunny) |
| A频道 | 56 | 3 | [来源](https://animethemes.moe/anime/a_channel) |
| 死囚乐园 | 57 | 2 | [来源](https://animethemes.moe/anime/deadman_wonderland) |
| 我们没有翅膀 | 58 | 3 | [来源](https://animethemes.moe/anime/oretachi_ni_tsubasa_wa_nai_under_the_innocent_sky) |
| DOG DAYS | 59 | 2 | [来源](https://animethemes.moe/anime/dog_days) |
| 世界第一初恋 | 61 | 1 | [来源](https://anilist.co/anime/9926) |

### 2012年

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 冰菓 | 1 | 4 | [来源](https://animethemes.moe/anime/hyouka) |
| 中二病也要谈恋爱！ | 2 | 2 | [来源](https://animethemes.moe/anime/chuunibyou_demo_koi_ga_shitai) |
| 刀剑神域 | 3 | 4 | [来源](https://animethemes.moe/anime/sword_art_online) |
| 男子高中生的日常 | 4 | 2 | [来源](https://animethemes.moe/anime/danshi_koukousei_no_nichijou) |
| 樱花庄的宠物女孩 | 5 | 5 | [来源](https://animethemes.moe/anime/sakurasou_no_pet_na_kanojo) |
| JOJO的奇妙冒险 | 6 | 3 | [来源](https://animethemes.moe/anime/jojo_no_kimyou_na_bouken) |
| 来自新世界 | 7 | 2 | [来源](https://animethemes.moe/anime/shinsekai_yori) |
| 心理测量者 | 8 | 4 | [来源](https://animethemes.moe/anime/psycho_pass) |
| 伪物语 | 9 | 4 | [来源](https://animethemes.moe/anime/nisemonogatari) |
| Another | 10 | 2 | [来源](https://anilist.co/anime/11111) |
| 散华礼弥 | 11 | 2 | [来源](https://animethemes.moe/anime/sankarea) |
| 人类衰退之后 | 12 | 2 | [来源](https://animethemes.moe/anime/jinrui_wa_suitai_shimashita) |
| 猫物语（黑） | 13 | 2 | [来源](https://animethemes.moe/anime/nekomonogatari_kuro) |
| 潜行吧！奈亚子 | 14 | 2 | [来源](https://animethemes.moe/anime/haiyore_nyaruko_san) |
| 邻座的怪同学 | 15 | 2 | [来源](https://animethemes.moe/anime/tonari_no_kaibutsu_kun) |
| 少女与战车 | 16 | 2 | [来源](https://animethemes.moe/anime/girls_und_panzer) |
| 恋爱随意链接 | 17 | 5 | [来源](https://animethemes.moe/anime/kokoro_connect) |
| 加速世界 | 18 | 4 | [来源](https://animethemes.moe/anime/accel_world) |
| 摇曳百合♪♪ | 19 | 4 | [来源](https://animethemes.moe/anime/yuru_yuri_2012) |
| 恶魔高校 D×D | 20 | 2 | [来源](https://animethemes.moe/anime/high_school_dxd) |
| Little Busters! | 21 | 4 | [来源](https://animethemes.moe/anime/little_busters) |
| 出包王女Darkness | 22 | 2 | [来源](https://animethemes.moe/anime/to_love_ru_darkness) |
| 「K」 | 23 | 4 | [来源](https://animethemes.moe/anime/k) |
| TARI TARI | 24 | 2 | [来源](https://animethemes.moe/anime/tari_tari) |
| 夏目友人帐 肆 | 25 | 2 | [来源](https://animethemes.moe/anime/natsume_yuujinchou_shi) |
| 绝园的暴风雨 | 26 | 4 | [来源](https://animethemes.moe/anime/zetsuen_no_tempest) |
| 一起一起这里那里 | 27 | 2 | [来源](https://animethemes.moe/anime/acchi_kocchi_tv) |
| 妖狐×仆SS | 28 | 6 | [来源](https://animethemes.moe/anime/inu_x_boku_ss) |
| 就算是哥哥只要有爱就没问题对吧 | 29 | 2 | [来源](https://animethemes.moe/anime/oniichan_dakedo_ai_sae_areba_kankeinai_yo_ne) |
| 黑岩射手 | 30 | 2 | [来源](https://animethemes.moe/anime/blackrock_shooter_tv) |
| 爱杀宝贝 | 31 | 2 | [来源](https://animethemes.moe/anime/kill_me_baby) |
| 零之使魔F | 32 | 2 | [来源](https://animethemes.moe/anime/zero_no_tsukaima_f) |
| 这个是僵尸吗？OF THE DEAD | 33 | 2 | [来源](https://animethemes.moe/anime/kore_wa_zombie_desu_ka_of_the_dead) |
| 在盛夏等待 | 34 | 2 | [来源](https://animethemes.moe/anime/ano_natsu_de_matteru) |
| 爆漫王。3 | 35 | 4 | [来源](https://animethemes.moe/anime/bakuman_3) |
| 黑子的篮球 | 36 | 4 | [来源](https://animethemes.moe/anime/kuroko_no_basket) |
| 银魂' 延长战 | 37 | 4 | [来源](https://animethemes.moe/anime/gintama_enchousen) |
| 听爸爸的话！ | 38 | 2 | [来源](https://animethemes.moe/anime/papa_no_iukoto_wo_kikinasai) |
| 元气少女缘结神 | 39 | 2 | [来源](https://animethemes.moe/anime/kamisama_hajimemashita) |
| 军火女王 | 40 | 3 | [来源](https://animethemes.moe/anime/jormungand) |
| 惊爆游戏! | 41 | 3 | [来源](https://animethemes.moe/anime/btooom) |
| 女子落语 | 42 | 2 | [来源](https://animethemes.moe/anime/joshiraku) |
| 天才麻将少女 阿知贺篇 | 43 | 3 | [来源](https://animethemes.moe/anime/saki_achiga_hen_episode_of_side_a) |
| 黄昏少女×失忆 | 44 | 2 | [来源](https://animethemes.moe/anime/tasogare_otome_x_amnesia) |
| 圣诞之吻SS+ plus | 45 | 2 | [来源](https://animethemes.moe/anime/amagami_ss_plus) |
| 恋爱与选举与巧克力 | 46 | 2 | [来源](https://animethemes.moe/anime/koi_to_senkyo_to_chocolate) |
| 穷神 | 47 | 2 | [来源](https://animethemes.moe/anime/binbougami_ga) |
| 天方魔谭MAGI | 48 | 4 | [来源](https://animethemes.moe/anime/magi_the_labyrinth_of_magic) |
| 境界线上的地平线 第二季 | 49 | 3 | [来源](https://animethemes.moe/anime/kyoukaisenjou_no_horizon_ii) |
| 坂道上的阿波罗 | 50 | 2 | [来源](https://animethemes.moe/anime/sakamichi_no_apollon) |
| 三人行必有我妹 | 51 | 2 | [来源](https://animethemes.moe/anime/kono_naka_ni_hitori_imouto_ga_iru) |
| 织田信奈的野望 | 53 | 2 | [来源](https://animethemes.moe/anime/oda_nobuna_no_yabou) |
| 机器人笔记 | 54 | 3 | [来源](https://animethemes.moe/anime/roboticsnotes) |
| 美少女死神 还我H之魂 | 55 | 2 | [来源](https://animethemes.moe/anime/dakara_boku_wa_h_ga_dekinai) |
| 白熊咖啡馆 | 56 | 8 | [来源](https://animethemes.moe/anime/shirokuma_cafe) |
| 谜样女友X | 57 | 2 | [来源](https://animethemes.moe/anime/nazo_no_kanojo_x) |
| 军火女王 PERFECT ORDER | 59 | 3 | [来源](https://animethemes.moe/anime/jormungand_perfect_order) |
| 无赖勇者的鬼畜美学 | 60 | 2 | [来源](https://animethemes.moe/anime/hagure_yuusha_no_aesthetica) |
| 宇宙兄弟 | 61 | 7 | [来源](https://animethemes.moe/anime/uchuu_kyoudai) |
| 弒神者！～不顺从之神与弑神的魔王～ | 62 | 2 | [来源](https://animethemes.moe/anime/campione_matsurowanu_kamigami_to_kamigoroshi_no_maou) |

### 2013年

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 进击的巨人 | 1 | 5 | [来源](https://animethemes.moe/anime/shingeki_no_kyojin) |
| 我的青春恋爱物语果然有问题 | 2 | 2 | [来源](https://animethemes.moe/anime/yahari_ore_no_seishun_love_comedy_wa_machigatteiru) |
| 斩服少女 | 3 | 4 | [来源](https://animethemes.moe/anime/kill_la_kill) |
| 某科学的超电磁炮S | 4 | 6 | [来源](https://animethemes.moe/anime/toaru_kagaku_no_railgun_s) |
| 约会大作战 | 5 | 5 | [来源](https://animethemes.moe/anime/date_a_live) |
| 玉子市场 | 6 | 2 | [来源](https://animethemes.moe/anime/tamako_market) |
| 境界的彼方 | 7 | 2 | [来源](https://animethemes.moe/anime/kyoukai_no_kanata) |
| 悠哉日常大王 | 8 | 2 | [来源](https://animethemes.moe/anime/non_non_biyori) |
| 我的妹妹哪有这么可爱。 | 9 | 14 | [来源](https://animethemes.moe/anime/ore_no_imouto_ga_konnani_kawaii_wake_ga_nai_2013) |
| 物语系列 第二季 | 10 | 7 | [来源](https://animethemes.moe/anime/monogatari_series_second_season) |
| 打工吧！魔王大人 | 11 | 4 | [来源](https://animethemes.moe/anime/hataraku_maou_sama) |
| 来自风平浪静的明天 | 12 | 4 | [来源](https://animethemes.moe/anime/nagi_no_asukara) |
| 变态王子与不笑猫。 | 13 | 2 | [来源](https://animethemes.moe/anime/hentai_ouji_to_warawanai_neko) |
| 白色相簿2 | 14 | 4 | [来源](https://animethemes.moe/anime/white_album_2) |
| Love Live! | 15 | 3 | [来源](https://animethemes.moe/anime/love_live_school_idol_project) |
| 弹丸论破 希望学园与绝望高中生 | 16 | 2 | [来源](https://animethemes.moe/anime/danganronpa_kibou_no_gakuen_to_zetsubou_no_koukousei_the_animation) |
| 我女友与青梅竹马的惨烈修罗场 | 17 | 2 | [来源](https://animethemes.moe/anime/ore_no_kanojo_to_osananajimi_ga_shuraba_sugiru) |
| 我不受欢迎，怎么想都是你们的错！ | 18 | 3 | [来源](https://animethemes.moe/anime/watashi_ga_motenai_no_wa_dou_kangaetemo_omaera_ga_warui) |
| 记录的地平线 | 19 | 2 | [来源](https://animethemes.moe/anime/log_horizon) |
| 机巧少女不会受伤 | 20 | 2 | [来源](https://animethemes.moe/anime/machine_doll_wa_kizutsukanai) |
| 有顶天家族 | 21 | 2 | [来源](https://animethemes.moe/anime/uchouten_kazoku) |
| Fate/kaleid liner 魔法少女☆伊莉雅 | 22 | 3 | [来源](https://animethemes.moe/anime/fatekaleid_liner_prismaillya) |
| 我的脑内选项正在全力妨碍学园恋爱喜剧 | 23 | 2 | [来源](https://animethemes.moe/anime/ore_no_nounai_sentakushi_ga_gakuen_love_comedy_wo_zenryoku_de_jama_shiteiru) |
| 我的朋友很少NEXT | 24 | 2 | [来源](https://animethemes.moe/anime/boku_wa_tomodachi_ga_sukunai_next) |
| 问题儿童都来自异世界？ | 25 | 2 | [来源](https://animethemes.moe/anime/mondaiji_tachi_ga_isekai_kara_kuru_sou_desu_yo) |
| 向山进发 | 26 | 1 | [来源](https://animethemes.moe/anime/yama_no_susume) |
| 噬血狂袭 | 27 | 4 | [来源](https://animethemes.moe/anime/strike_the_blood) |
| 魔王勇者 | 28 | 2 | [来源](https://animethemes.moe/anime/maoyuu_maou_yuusha) |
| 潜行吧！奈亚子W | 29 | 6 | [来源](https://animethemes.moe/anime/haiyore_nyaruko_san_w) |
| GJ部 | 30 | 5 | [来源](https://animethemes.moe/anime/gj_bu) |
| 银之匙 Silver Spoon | 31 | 2 | [来源](https://animethemes.moe/anime/gin_no_saji) |
| Little Busters! 〜Refrain〜 | 32 | 5 | [来源](https://animethemes.moe/anime/little_busters_refrain) |
| 黄金拼图 | 34 | 2 | [来源](https://animethemes.moe/anime/kiniro_mosaic) |
| 只有神知道的世界 女神篇 | 35 | 10 | [来源](https://animethemes.moe/anime/kami_nomi_zo_shiru_sekai_megami_hen) |
| 恋爱研究所 | 37 | 2 | [来源](https://animethemes.moe/anime/love_lab) |
| 东京暗鸦 | 38 | 4 | [来源](https://animethemes.moe/anime/tokyo_ravens) |
| 南家三姐妹 我回来了 | 39 | 2 | [来源](https://animethemes.moe/anime/minami_ke_tadaima) |
| 恶魔高校 D×D NEW | 40 | 4 | [来源](https://animethemes.moe/anime/high_school_dxd_new) |
| 青春纪行 | 41 | 4 | [来源](https://animethemes.moe/anime/golden_time) |
| 狗与剪刀的正确用法 | 42 | 2 | [来源](https://animethemes.moe/anime/inu_to_hasami_wa_tsukaiyou) |
| 神不在的星期天 | 43 | 2 | [来源](https://animethemes.moe/anime/kamisama_no_inai_nichiyoubi) |
| Free! | 44 | 3 | [来源](https://animethemes.moe/anime/free) |
| IS〈无限斯特拉托斯〉第二季 | 46 | 2 | [来源](https://animethemes.moe/anime/is_infinite_stratos_2) |
| 翠星之加尔刚蒂亚 | 47 | 2 | [来源](https://animethemes.moe/anime/suisei_no_gargantia) |
| 歌牌情缘 第二季 | 48 | 3 | [来源](https://animethemes.moe/anime/chihayafuru_2) |
| 锁锁美同学@提不起劲 | 49 | 2 | [来源](https://animethemes.moe/anime/sasami_san_at_ganbaranai) |
| 革命机Valvrave | 50 | 3 | [来源](https://animethemes.moe/anime/kakumeiki_valvrave) |
| 萌萌侵略者 | 51 | 2 | [来源](https://animethemes.moe/anime/outbreak_company) |
| 苍蓝钢铁的琶音 | 52 | 4 | [来源](https://animethemes.moe/anime/aoki_hagane_no_arpeggio_ars_nova) |
| 跟班×服务 | 53 | 2 | [来源](https://animethemes.moe/anime/servant_x_service) |
| 京骚戏画 | 54 | 2 | [来源](https://animethemes.moe/anime/kyousou_giga_tv) |
| 琴浦小姐 | 55 | 4 | [来源](https://animethemes.moe/anime/kotoura_san) |
| 恶魔阿萨谢尔在召唤你Z | 56 | 4 | [来源](https://animethemes.moe/anime/yondemasu_yo_azazel_san_z) |
| 新蔷薇少女 | 57 | 2 | [来源](https://animethemes.moe/anime/rozen_maiden_2013) |
| 归宅部活动记录 | 58 | 4 | [来源](https://animethemes.moe/anime/kitakubu_katsudou_kiroku) |
| 恶之华 | 59 | 5 | [来源](https://animethemes.moe/anime/aku_no_hana) |
| 当不成勇者的我，只好认真找工作了。 | 60 | 2 | [来源](https://animethemes.moe/anime/yuusha_ni_narenakatta_ore_wa_shibushibu_shuushoku_wo_ketsui_shimashita) |
| 超次元游戏 海王星 | 61 | 3 | [来源](https://animethemes.moe/anime/choujigen_game_neptune_the_animation) |
| 血意少年 | 62 | 2 | [来源](https://animethemes.moe/anime/blood_lad) |
| 言叶之庭 | 原有保留 | 1 | [来源](https://anilist.co/anime/16782) |

### 2014年

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 游戏人生 | 1 | 3 | [来源](https://animethemes.moe/anime/no_game_no_life) |
| 白箱 | 2 | 5 | [来源](https://animethemes.moe/anime/shirobako) |
| 四月是你的谎言 | 3 | 4 | [来源](https://animethemes.moe/anime/shigatsu_wa_kimi_no_uso) |
| 月刊少女野崎君 | 4 | 2 | [来源](https://animethemes.moe/anime/gekkan_shoujo_nozaki_kun) |
| Fate/stay night [Unlimited Blade Works] | 5 | 3 | [来源](https://animethemes.moe/anime/fatestay_night_unlimited_blade_works_tv) |
| JOJO的奇妙冒险 星尘斗士 | 6 | 2 | [来源](https://animethemes.moe/anime/jojo_no_kimyou_na_bouken_part_3_stardust_crusaders) |
| 中二病也要谈恋爱！恋 | 7 | 2 | [来源](https://animethemes.moe/anime/chuunibyou_demo_koi_ga_shitai_ren) |
| 寄生兽 生命的准则 | 8 | 2 | [来源](https://animethemes.moe/anime/kiseijuu_sei_no_kakuritsu) |
| 乒乓 | 9 | 2 | [来源](https://animethemes.moe/anime/ping_pong_the_animation) |
| 甘城光辉游乐园 | 10 | 2 | [来源](https://animethemes.moe/anime/amagi_brilliant_park) |
| 东京喰种 | 11 | 2 | [来源](https://animethemes.moe/anime/tokyo_ghoul) |
| 刀剑神域 第二季 | 12 | 6 | [来源](https://animethemes.moe/anime/sword_art_online_ii) |
| 伪恋 | 13 | 9 | [来源](https://animethemes.moe/anime/nisekoi) |
| 野良神 | 14 | 2 | [来源](https://animethemes.moe/anime/noragami) |
| 斩·赤红之瞳！ | 15 | 4 | [来源](https://animethemes.moe/anime/akame_ga_kill) |
| 请问您今天要来点兔子吗？ | 16 | 3 | [来源](https://animethemes.moe/anime/gochuumon_wa_usagi_desu_ka) |
| 约会大作战 第二季 | 17 | 3 | [来源](https://animethemes.moe/anime/date_a_live_ii) |
| 排球少年 | 18 | 4 | [来源](https://animethemes.moe/anime/haikyuu) |
| 妄想学生会＊ | 19 | 2 | [来源](https://animethemes.moe/anime/seitokai_yakuindomo_2014) |
| 漆黑的子弹 | 20 | 4 | [来源](https://animethemes.moe/anime/black_bullet) |
| 凭物语 | 21 | 2 | [来源](https://animethemes.moe/anime/tsukimonogatari) |
| 花物语 | 22 | 2 | [来源](https://animethemes.moe/anime/hanamonogatari) |
| 东京残响 | 23 | 2 | [来源](https://animethemes.moe/anime/zankyou_no_terror) |
| 魔法科高校的劣等生 | 24 | 4 | [来源](https://animethemes.moe/anime/mahouka_koukou_no_rettousei) |
| 一周的朋友。 | 25 | 2 | [来源](https://animethemes.moe/anime/isshuukan_friends) |
| 灰色的果实 | 26 | 6 | [来源](https://animethemes.moe/anime/grisaia_no_kajitsu) |
| 关于完全听不懂老公在说什么的事 | 27 | 2 | [来源](https://animethemes.moe/anime/danna_ga_nani_wo_itteiru_ka_wakaranai_ken) |
| Love Live! 第二季 | 28 | 5 | [来源](https://animethemes.moe/anime/love_live_school_idol_project_2nd_season) |
| 日常系的异能战斗 | 29 | 2 | [来源](https://animethemes.moe/anime/inou_battle_wa_nichijou_kei_no_naka_de) |
| 结城友奈是勇者 | 30 | 3 | [来源](https://animethemes.moe/anime/yuuki_yuuna_wa_yuusha_de_aru) |
| 太空丹迪 | 31 | 2 | [来源](https://animethemes.moe/anime/spacedandy) |
| 心理测量者2 | 32 | 2 | [来源](https://animethemes.moe/anime/psycho_pass_2) |
| 农林 | 33 | 6 | [来源](https://animethemes.moe/anime/nourin) |
| 希德尼娅的骑士 | 34 | 2 | [来源](https://animethemes.moe/anime/sidonia_no_kishi) |
| 七大罪 | 35 | 5 | [来源](https://animethemes.moe/anime/nanatsu_no_taizai) |
| 漫画家和助手 | 36 | 3 | [来源](https://animethemes.moe/anime/mangaka_san_to_assistant_san_to_the_animation) |
| ALDNOAH.ZERO | 37 | 3 | [来源](https://animethemes.moe/anime/aldnoahzero) |
| 樱Trick | 38 | 3 | [来源](https://animethemes.moe/anime/sakura_trick) |
| 虫师 续章 | 39 | 1 | [来源](https://animethemes.moe/anime/mushishi_zoku_shou) |
| 元气囝仔 | 40 | 2 | [来源](https://animethemes.moe/anime/barakamon) |
| Fate/kaleid liner 魔法少女☆伊莉雅 2wei! | 41 | 2 | [来源](https://animethemes.moe/anime/fatekaleid_liner_prismaillya_2wei) |
| 目隐都市的演绎者 | 43 | 7 | [来源](https://animethemes.moe/anime/mekakucity_actors) |
| 精灵使的剑舞 | 44 | 2 | [来源](https://animethemes.moe/anime/seirei_tsukai_no_blade_dance) |
| 三坪房间的侵略者!? | 45 | 2 | [来源](https://animethemes.moe/anime/rokujouma_no_shinryakusha) |
| 未确认进行式 | 46 | 2 | [来源](https://animethemes.moe/anime/mikakunin_de_shinkoukei) |
| 极黑的布伦希尔德 | 47 | 2 | [来源](https://animethemes.moe/anime/gokukoku_no_brynhildr) |
| 最近，妹妹的样子有点怪？ | 48 | 2 | [来源](https://animethemes.moe/anime/saikin_imouto_no_yousu_ga_chotto_okashiinda_ga) |
| 向山进发 第二季 | 49 | 5 | [来源](https://animethemes.moe/anime/yama_no_susume_second_season) |
| 记录的地平线 第二季 | 50 | 2 | [来源](https://animethemes.moe/anime/log_horizon_2nd_season) |
| 七人魔法使 | 51 | 5 | [来源](https://animethemes.moe/anime/trinity_seven) |
| 天体的秩序 | 52 | 4 | [来源](https://animethemes.moe/anime/sora_no_method) |
| 我，要成为双马尾 | 53 | 2 | [来源](https://animethemes.moe/anime/ore_twintails_ni_narimasu) |
| 太空丹迪 第二季 | 54 | 3 | [来源](https://animethemes.moe/anime/spacedandy_2nd_season) |
| 我们大家的河合庄 | 55 | 2 | [来源](https://animethemes.moe/anime/bokura_wa_minna_kawaisou) |
| 天才麻将少女 全国篇 | 56 | 6 | [来源](https://animethemes.moe/anime/saki_zenkoku_hen) |
| 银之匙 Silver Spoon 第二季 | 57 | 2 | [来源](https://animethemes.moe/anime/gin_no_saji_2nd_season) |
| 电器街的漫画店 | 58 | 2 | [来源](https://animethemes.moe/anime/denki_gai_no_honya_san) |
| 鬼灯的冷彻 | 59 | 3 | [来源](https://animethemes.moe/anime/hoozuki_no_reitetsu) |
| 青春之旅 | 62 | 1 | [来源](https://anilist.co/anime/20596) |
| 妖精的尾巴 第二季 | 原有保留 | 1 | [来源](https://anilist.co/anime/20626) |

### 2015年

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 路人女主的养成方法 | 1 | 2 | [来源](https://animethemes.moe/anime/saenai_heroine_no_sodatekata) |
| 吹响吧！上低音号 | 2 | 2 | [来源](https://animethemes.moe/anime/hibike_euphonium) |
| 一拳超人 | 3 | 3 | [来源](https://animethemes.moe/anime/one_punch_man) |
| 夏洛特 | 4 | 3 | [来源](https://animethemes.moe/anime/charlotte) |
| 我的青春恋爱物语果然有问题 续 | 5 | 2 | [来源](https://animethemes.moe/anime/yahari_ore_no_seishun_love_comedy_wa_machigatteiru_zoku) |
| 命运之夜 [无限剑制] 第二季 | 6 | 3 | [来源](https://animethemes.moe/anime/fatestay_night_unlimited_blade_works_2nd_season) |
| JOJO的奇妙冒险 星尘斗士 埃及篇 | 7 | 1 | [来源](https://animethemes.moe/anime/jojo_no_kimyou_na_bouken_part_3_stardust_crusaders_2nd_season) |
| 干物妹！小埋 | 8 | 2 | [来源](https://animethemes.moe/anime/himouto_umaru_chan) |
| OVERLORD | 9 | 2 | [来源](https://animethemes.moe/anime/overlord) |
| 可塑性记忆 | 10 | 2 | [来源](https://animethemes.moe/anime/plastic_memories) |
| 暗杀教室 | 11 | 3 | [来源](https://animethemes.moe/anime/ansatsu_kyoushitsu_tv) |
| 血界战线 | 12 | 2 | [来源](https://anilist.co/anime/20727) |
| 在地下城寻求邂逅是否搞错了什么 | 13 | 3 | [来源](https://animethemes.moe/anime/dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka) |
| 学园孤岛 | 14 | 3 | [来源](https://animethemes.moe/anime/gakkou_gurashi) |
| 没有黄段子存在的无聊世界 | 15 | 2 | [来源](https://animethemes.moe/anime/shimoneta_to_iu_gainen_ga_sonzai_shinai_taikutsu_na_sekai) |
| 终物语 | 16 | 5 | [来源](https://animethemes.moe/anime/owarimonogatari) |
| 监狱学园 | 17 | 2 | [来源](https://animethemes.moe/anime/prison_school) |
| 请问您今天要来点兔子吗？？ | 18 | 3 | [来源](https://animethemes.moe/anime/gochuumon_wa_usagi_desu_ka_2015) |
| 食戟之灵 | 19 | 1 | [来源](https://animethemes.moe/anime/shokugeki_no_souma_food_wars) |
| 伪恋： | 20 | 8 | [来源](https://animethemes.moe/anime/nisekoi_2015) |
| 野良神 ARAGOTO | 21 | 2 | [来源](https://animethemes.moe/anime/noragami_aragoto) |
| 悠哉日常大王 Repeat | 22 | 2 | [来源](https://animethemes.moe/anime/non_non_biyori_repeat) |
| 落第骑士英雄谭 | 23 | 1 | [来源](https://animethemes.moe/anime/rakudai_kishi_no_cavalry) |
| 东京喰种√A | 24 | 1 | [来源](https://animethemes.moe/anime/tokyo_ghoul_a) |
| 终结的炽天使 | 25 | 2 | [来源](https://animethemes.moe/anime/owari_no_seraph) |
| 排球少年 第二季 | 26 | 4 | [来源](https://animethemes.moe/anime/haikyuu_second_season) |
| 新妹魔王的契约者 | 27 | 1 | [来源](https://animethemes.moe/anime/shinmai_maou_no_testament) |
| 无头骑士异闻录×2 承 | 28 | 1 | [来源](https://animethemes.moe/anime/durararax2_shou) |
| 灰色的乐园 | 29 | 3 | [来源](https://animethemes.moe/anime/grisaia_no_rakuen) |
| 银魂° | 30 | 5 | [来源](https://animethemes.moe/anime/gintama_2015) |
| 出包王女Darkness 第二季 | 31 | 2 | [来源](https://animethemes.moe/anime/to_love_ru_darkness_2nd) |
| 摇曳百合 3☆High! | 32 | 3 | [来源](https://animethemes.moe/anime/yuru_yuri_sanhai) |
| 山田君与7个魔女 | 33 | 2 | [来源](https://animethemes.moe/anime/yamada_kun_to_7_nin_no_majo_tv) |
| 关于完全听不懂老公在说什么的事 第二季 | 34 | 3 | [来源](https://animethemes.moe/anime/danna_ga_nani_wo_itteiru_ka_wakaranai_ken_2_sure_me) |
| 灰色的迷宫 | 35 | 1 | [来源](https://animethemes.moe/anime/grisaia_no_meikyuu_caprice_no_mayu_0) |
| Fate/kaleid liner 魔法少女☆伊莉雅 2wei Herz! | 36 | 1 | [来源](https://animethemes.moe/anime/fatekaleid_liner_prismaillya_2wei_herz) |
| 樱子小姐的脚下埋着尸体 | 37 | 1 | [来源](https://animethemes.moe/anime/sakurako_san_no_ashimoto_ni_wa_shitai_ga_umatteiru) |
| 无头骑士异闻录×2 转 | 38 | 2 | [来源](https://animethemes.moe/anime/durararax2_ten) |
| 我老婆是学生会长 | 39 | 3 | [来源](https://animethemes.moe/anime/okusama_ga_seitokaichou) |
| 绝对双刃 | 40 | 3 | [来源](https://animethemes.moe/anime/absolute_duo) |
| 学战都市 六芒星 | 41 | 2 | [来源](https://animethemes.moe/anime/gakusen_toshi_asterisk) |
| 魔物娘的同居日常 | 42 | 2 | [来源](https://animethemes.moe/anime/monster_musume_no_iru_nichijou) |
| 终结的炽天使 名古屋决战篇 | 43 | 2 | [来源](https://animethemes.moe/anime/owari_no_seraph_nagoya_kessen_hen) |
| 舰队Collection | 44 | 2 | [来源](https://animethemes.moe/anime/kantai_collection_kan_colle) |
| 赤发白雪姬 | 45 | 2 | [来源](https://animethemes.moe/anime/akagami_no_shirayuki_hime) |
| 百合熊风暴 | 46 | 1 | [来源](https://animethemes.moe/anime/yuri_kuma_arashi) |
| 迷糊餐厅 第三季 | 47 | 2 | [来源](https://animethemes.moe/anime/working_2015) |
| 长门有希酱的消失 | 48 | 2 | [来源](https://animethemes.moe/anime/nagato_yuki_chan_no_shoushitsu) |
| 我被绑架到贵族女校当「庶民样本」 | 49 | 2 | [来源](https://animethemes.moe/anime/ore_ga_ojousama_gakkou_ni_shomin_sample_toshite_getssareta_ken) |
| 六花的勇者 | 50 | 4 | [来源](https://animethemes.moe/anime/rokka_no_yuusha) |
| 希德尼娅的骑士 第九惑星战役 | 51 | 1 | [来源](https://animethemes.moe/anime/sidonia_no_kishi_daikyuu_wakusei_seneki) |
| Concrete Revolutio 超人幻想 | 52 | 1 | [来源](https://animethemes.moe/anime/concrete_revolutio_choujin_gensou) |
| 死亡游行 | 53 | 2 | [来源](https://animethemes.moe/anime/death_parade) |
| 俺物语!! | 54 | 2 | [来源](https://animethemes.moe/anime/ore_monogatari) |
| 旋转少女 | 55 | 3 | [来源](https://animethemes.moe/anime/rollinggirls) |
| 乱步奇谭 拉普拉斯的游戏 | 56 | 2 | [来源](https://animethemes.moe/anime/ranpo_kitan_game_of_laplace) |
| ALDNOAH.ZERO 第二季 | 57 | 3 | [来源](https://animethemes.moe/anime/aldnoahzero_2nd_season) |
| 偶像大师 灰姑娘女孩 | 58 | 9 | [来源](https://animethemes.moe/anime/the_idolm_at_ster_cinderella_girls) |
| 恶魔高校 D×D BorN | 59 | 3 | [来源](https://animethemes.moe/anime/high_school_dxd_born) |
| 精灵宝可梦 XY&Z | 98 | 2 | [来源](https://anilist.co/anime/21356) |

### 2016年

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 为美好的世界献上祝福！ | 1 | 2 | [来源](https://anilist.co/anime/21202) |
| Re:从零开始的异世界生活 | 2 | 8 | [来源](https://animethemes.moe/anime/rezero_kara_hajimeru_isekai_seikatsu) |
| 灵能百分百 | 3 | 1 | [来源](https://anilist.co/anime/21507) |
| 齐木楠雄的灾难 | 4 | 2 | [来源](https://animethemes.moe/anime/saiki_kusuo_no_ps_nan) |
| 吹响吧！上低音号 第二季 | 5 | 2 | [来源](https://animethemes.moe/anime/hibike_euphonium_2) |
| JOJO的奇妙冒险 不灭钻石 | 6 | 1 | [来源](https://anilist.co/anime/21450) |
| 只有我不存在的城市 | 7 | 2 | [来源](https://anilist.co/anime/21234) |
| ReLIFE | 8 | 7 | [来源](https://animethemes.moe/anime/relife) |
| 3月的狮子 | 9 | 5 | [来源](https://animethemes.moe/anime/3_gatsu_no_lion) |
| 在下坂本，有何贵干？ | 10 | 1 | [来源](https://animethemes.moe/anime/sakamoto_desu_ga) |
| 这个美术社大有问题！ | 11 | 3 | [来源](https://animethemes.moe/anime/kono_bijutsubu_ni_wa_mondai_ga_aru) |
| NEW GAME! | 12 | 3 | [来源](https://animethemes.moe/anime/new_game) |
| 灰与幻想的格林姆迦尔 | 13 | 2 | [来源](https://animethemes.moe/anime/hai_to_gensou_no_grimgar) |
| 甲铁城的卡巴内利 | 14 | 3 | [来源](https://animethemes.moe/anime/koutetsujou_no_kabaneri) |
| 线上游戏的老婆不可能是女生？ | 15 | 2 | [来源](https://animethemes.moe/anime/netoge_no_yome_wa_onnanoko_ja_nai_to_omotta) |
| 暗杀教室 第二季 | 16 | 4 | [来源](https://animethemes.moe/anime/ansatsu_kyoushitsu_tv_2nd_season) |
| 亚人 | 17 | 2 | [来源](https://animethemes.moe/anime/ajin) |
| 我的英雄学院 | 18 | 2 | [来源](https://animethemes.moe/anime/boku_no_hero_academia) |
| 文豪野犬 | 19 | 2 | [来源](https://animethemes.moe/anime/bungou_stray_dogs) |
| 无彩限的怪灵世界 | 20 | 2 | [来源](https://animethemes.moe/anime/musaigen_no_phantom_world) |
| 粗点心战争 | 21 | 2 | [来源](https://animethemes.moe/anime/dagashi_kashi) |
| 飞翔的魔女 | 22 | 2 | [来源](https://animethemes.moe/anime/flying_witch) |
| 排球少年 乌野高校 VS 白鸟泽学园高校 | 23 | 2 | [来源](https://animethemes.moe/anime/haikyuu_karasuno_koukou_vs_shiratorizawa_gakuen_koukou) |
| 食戟之灵 贰之皿 | 24 | 2 | [来源](https://animethemes.moe/anime/shokugeki_no_souma_ni_no_sara) |
| 少女编号 | 25 | 4 | [来源](https://animethemes.moe/anime/giarlish_number) |
| 轻拍翻转小魔女 | 26 | 1 | [来源](https://animethemes.moe/anime/flip_flappers) |
| 超自然9人组 | 27 | 2 | [来源](https://animethemes.moe/anime/occulticnine) |
| 昭和元禄落语心中 | 28 | 1 | [来源](https://animethemes.moe/anime/shouwa_genroku_rakugo_shinjuu) |
| 宇宙巡警露露子 | 29 | 1 | [来源](https://animethemes.moe/anime/uchuu_patrol_luluco) |
| Rewrite | 30 | 8 | [来源](https://animethemes.moe/anime/rewrite) |
| 迷家 | 31 | 1 | [来源](https://animethemes.moe/anime/mayoiga) |
| 夏目友人帐 伍 | 32 | 2 | [来源](https://animethemes.moe/anime/natsume_yuujinchou_go) |
| Fate/Grand Order -First Order- | 33 | 1 | [来源](https://animethemes.moe/anime/fategrand_order_first_order) |
| 弹丸论破3 -The End of 希望之峰学园- 未来篇 | 34 | 1 | [来源](https://animethemes.moe/anime/danganronpa_3_the_end_of_kibougamine_gakuen_mirai_hen) |
| 无头骑士异闻录×2 结 | 35 | 2 | [来源](https://animethemes.moe/anime/durararax2_ketsu) |
| 弹丸论破3 -The End of 希望之峰学园- 绝望篇 | 36 | 2 | [来源](https://animethemes.moe/anime/danganronpa_3_the_end_of_kibougamine_gakuen_zetsubou_hen) |
| Fate/kaleid liner 魔法少女☆伊莉雅 3rei!! | 37 | 2 | [来源](https://animethemes.moe/anime/fatekaleid_liner_prismaillya_3rei) |
| 田中君总是如此慵懒 | 38 | 1 | [来源](https://animethemes.moe/anime/tanaka_kun_wa_itsumo_kedaruge) |
| 文豪野犬 第二季 | 39 | 2 | [来源](https://animethemes.moe/anime/bungou_stray_dogs_2nd_season) |
| 最弱无败神装机龙 | 40 | 2 | [来源](https://animethemes.moe/anime/saijaku_muhai_no_bahamut) |
| 冰上的尤里 | 41 | 1 | [来源](https://animethemes.moe/anime/yuri_on_ice) |
| 编舟记 | 42 | 1 | [来源](https://animethemes.moe/anime/fune_wo_amu) |
| Love Live! Sunshine!! | 43 | 5 | [来源](https://animethemes.moe/anime/love_live_sunshine) |
| 超时空要塞Δ | 44 | 11 | [来源](https://animethemes.moe/anime/macross_d) |
| 亚人 第2部分 | 45 | 2 | [来源](https://animethemes.moe/anime/ajin_2nd_season) |
| WWW.迷糊餐厅 | 46 | 2 | [来源](https://animethemes.moe/anime/wwwworking) |
| 终末的伊泽塔 | 47 | 2 | [来源](https://animethemes.moe/anime/shuumatsu_no_izetta) |
| 高校舰队 | 48 | 2 | [来源](https://animethemes.moe/anime/haifuri) |
| 她和她的猫 -Everything Flows- | 49 | 2 | [来源](https://animethemes.moe/anime/kanojo_to_kanojo_no_neko_everything_flows) |
| 羁绊者 | 50 | 2 | [来源](https://animethemes.moe/anime/kiznaiver) |
| 学战都市 六芒星 第二季 | 51 | 2 | [来源](https://animethemes.moe/anime/gakusen_toshi_asterisk_2nd_season) |
| Anne Happy♪ | 52 | 3 | [来源](https://animethemes.moe/anime/anne_happy) |
| 双星之阴阳师 | 53 | 3 | [来源](https://animethemes.moe/anime/sousei_no_onmyouji) |
| 房东妹子青春期 | 54 | 1 | [来源](https://animethemes.moe/anime/ooyasan_wa_shishunki) |
| 天真与闪电 | 55 | 1 | [来源](https://animethemes.moe/anime/amaama_to_inazuma) |
| 91天 | 56 | 2 | [来源](https://animethemes.moe/anime/91_days) |
| 魔法少女育成计划 | 57 | 2 | [来源](https://animethemes.moe/anime/mahou_shoujo_ikusei_keikaku) |
| 机动战士高达 铁血的奥尔芬斯 第二季 | 77 | 2 | [来源](https://anilist.co/anime/21749) |
| 你的名字。 | 原有保留 | 4 | [来源](https://anilist.co/anime/21519) |
| 声之形 | 原有保留 | 1 | [来源](https://anilist.co/anime/20954) |

### 2017年

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 小林家的龙女仆 | 1 | 2 | [来源](https://animethemes.moe/anime/kobayashi_san_chi_no_maid_dragon) |
| 进击的巨人 第二季 | 2 | 4 | [来源](https://animethemes.moe/anime/shingeki_no_kyojin_season_2) |
| 来自深渊 | 3 | 2 | [来源](https://animethemes.moe/anime/made_in_abyss) |
| 为美好的世界献上祝福！ 第二季 | 4 | 2 | [来源](https://animethemes.moe/anime/kono_subarashii_sekai_ni_shukufuku_wo_2) |
| 埃罗芒阿老师 | 5 | 2 | [来源](https://animethemes.moe/anime/eromanga_sensei) |
| 少女终末旅行 | 6 | 3 | [来源](https://animethemes.moe/anime/shoujo_shuumatsu_ryokou) |
| 月色真美 | 7 | 2 | [来源](https://animethemes.moe/anime/tsuki_ga_kirei) |
| 路人女主的养成方法 ♭ | 8 | 3 | [来源](https://animethemes.moe/anime/saenai_heroine_no_sodatekata_2017) |
| 欢迎来到实力至上主义的教室 | 9 | 1 | [来源](https://animethemes.moe/anime/youkoso_jitsuryoku_shijou_shugi_no_kyoushitsu_e) |
| 末日时在做什么？有没有空？可以来拯救吗？ | 10 | 3 | [来源](https://animethemes.moe/anime/shuumatsu_nani_shitemasu_ka_isogashii_desu_ka_sukutte_moratte_ii_desu_ka) |
| 珈百璃的堕落 | 11 | 3 | [来源](https://animethemes.moe/anime/gabriel_dropout) |
| 宝石之国 | 12 | 3 | [来源](https://animethemes.moe/anime/houseki_no_kuni) |
| 3月的狮子 第二季 | 13 | 4 | [来源](https://animethemes.moe/anime/3_gatsu_no_lion_2nd_season) |
| 徒然喜欢你 | 14 | 2 | [来源](https://animethemes.moe/anime/tsurezure_children) |
| 重启咲良田 | 15 | 3 | [来源](https://animethemes.moe/anime/sakurada_reset) |
| 笨女孩 | 16 | 2 | [来源](https://animethemes.moe/anime/aho_girl) |
| 干物妹！小埋R | 17 | 2 | [来源](https://animethemes.moe/anime/himouto_umaru_chan_r) |
| 小魔女学园 | 18 | 4 | [来源](https://animethemes.moe/anime/little_witch_academia_tv) |
| 狂赌之渊 | 19 | 2 | [来源](https://animethemes.moe/anime/kakegurui) |
| 幼女战记 | 20 | 3 | [来源](https://animethemes.moe/anime/youjo_senki) |
| 调教咖啡厅 | 21 | 2 | [来源](https://animethemes.moe/anime/blend_s) |
| 人渣的本愿 | 22 | 2 | [来源](https://animethemes.moe/anime/kuzu_no_honkai) |
| 终物语（下） | 23 | 4 | [来源](https://animethemes.moe/anime/owarimonogatari_2nd_season) |
| Just Because! | 24 | 2 | [来源](https://animethemes.moe/anime/just_because) |
| NEW GAME!! | 25 | 3 | [来源](https://animethemes.moe/anime/new_game_2017) |
| 如果有妹妹就好了。 | 26 | 3 | [来源](https://animethemes.moe/anime/imouto_sae_ireba_ii) |
| 政宗君的复仇 | 27 | 1 | [来源](https://animethemes.moe/anime/masamune_kun_no_revenge) |
| One Room | 28 | 3 | [来源](https://animethemes.moe/anime/one_room) |
| Re:CREATORS | 29 | 5 | [来源](https://animethemes.moe/anime/recreators) |
| GAMERS电玩咖 | 30 | 3 | [来源](https://animethemes.moe/anime/gamers) |
| 血界战线 & BEYOND | 31 | 2 | [来源](https://animethemes.moe/anime/kekkai_sensen_beyond) |
| 不正经的魔术讲师与禁忌教典 | 32 | 2 | [来源](https://animethemes.moe/anime/rokudenashi_majutsu_koushi_to_akashic_records) |
| 此花绮谭 | 33 | 5 | [来源](https://animethemes.moe/anime/konohana_kitan) |
| 兽娘动物园 | 34 | 1 | [来源](https://animethemes.moe/anime/kemono_friends) |
| Fate/Apocrypha | 35 | 4 | [来源](https://animethemes.moe/anime/fateapocrypha) |
| Princess Principal | 36 | 2 | [来源](https://animethemes.moe/anime/princess_principal) |
| Urara迷路帖 | 37 | 2 | [来源](https://animethemes.moe/anime/urara_meirochou) |
| BanG Dream! | 38 | 4 | [来源](https://animethemes.moe/anime/bang_dream) |
| 魔法使的新娘 | 39 | 3 | [来源](https://animethemes.moe/anime/mahoutsukai_no_yome) |
| 我的英雄学院 第二季 | 40 | 4 | [来源](https://animethemes.moe/anime/boku_no_hero_academia_2nd_season) |
| 奇诺之旅 | 41 | 2 | [来源](https://animethemes.moe/anime/kino_no_tabi_the_beautiful_world_the_animated_series) |
| 食戟之灵 餐之皿 | 42 | 2 | [来源](https://animethemes.moe/anime/shokugeki_no_souma_san_no_sara) |
| 异世界食堂 | 43 | 2 | [来源](https://animethemes.moe/anime/isekai_shokudou) |
| 樱花任务 | 44 | 4 | [来源](https://animethemes.moe/anime/sakura_quest) |
| ACCA13区监察课 | 46 | 1 | [来源](https://animethemes.moe/anime/acca_13_ku_kansatsu_ka) |
| 夏目友人帐 陆 | 47 | 1 | [来源](https://animethemes.moe/anime/natsume_yuujinchou_roku) |
| 带着智能手机闯荡异世界。 | 48 | 2 | [来源](https://animethemes.moe/anime/isekai_wa_smartphone_to_tomo_ni) |
| 在地下城寻求邂逅是否搞错了什么 外传 剑姬神圣谭 | 49 | 2 | [来源](https://animethemes.moe/anime/dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka_gaiden_sword_oratoria) |
| 骑士&魔法 | 50 | 2 | [来源](https://animethemes.moe/anime/knights_magic) |
| 清恋 | 51 | 4 | [来源](https://animethemes.moe/anime/seiren) |
| 有顶天家族 第二季 | 54 | 2 | [来源](https://animethemes.moe/anime/uchouten_kazoku_2) |
| 天使的3P! | 55 | 5 | [来源](https://animethemes.moe/anime/tenshi_no_3p) |
| 雏子的笔记 | 56 | 2 | [来源](https://animethemes.moe/anime/hinako_note) |
| 关于我女友是个一本正经的碧池这件事 | 57 | 1 | [来源](https://animethemes.moe/anime/boku_no_kanojo_ga_majimesugiru_sho_bitch_na_ken) |
| 昭和元禄落语心中 -助六再临篇- | 58 | 1 | [来源](https://animethemes.moe/anime/shouwa_genroku_rakugo_shinjuu_sukeroku_futatabi_hen) |
| Love Live! Sunshine!! 第二季 | 72 | 1 | [来源](https://anilist.co/anime/98349) |
| 名侦探柯南：唐红的恋歌 | 原有保留 | 1 | [来源](https://anilist.co/anime/98222) |
| 进击的巨人 LOST GIRLS | 原有保留 | 1 | [来源](https://anilist.co/anime/99634) |
| 游戏人生 ZERO | 原有保留 | 1 | [来源](https://anilist.co/anime/21875) |
| 烟花 | 原有保留 | 1 | [来源](https://anilist.co/anime/97908) |

### 2018年

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 青春期笨蛋不做兔女郎学姐的梦 | 1 | 2 | [来源](https://anilist.co/anime/101291) |
| 紫罗兰永恒花园 | 2 | 3 | [来源](https://animethemes.moe/anime/violet_evergarden) |
| 碧蓝之海 | 3 | 1 | [来源](https://animethemes.moe/anime/grand_blue) |
| 进击的巨人 第三季 | 4 | 3 | [来源](https://animethemes.moe/anime/shingeki_no_kyojin_season_3) |
| 摇曳露营 | 5 | 2 | [来源](https://animethemes.moe/anime/yuru_camp) |
| 命运石之门 0 | 6 | 5 | [来源](https://animethemes.moe/anime/steinsgate_0) |
| 比宇宙更远的地方 | 7 | 3 | [来源](https://animethemes.moe/anime/sora_yori_mo_tooi_basho) |
| 少女☆歌剧 Revue Starlight | 8 | 2 | [来源](https://animethemes.moe/anime/shoujokageki_revue_starlight) |
| JOJO的奇妙冒险 黄金之风 | 9 | 1 | [来源](https://animethemes.moe/anime/jojo_no_kimyou_na_bouken_part_5_ougon_no_kaze) |
| 佐贺偶像是传奇 | 10 | 6 | [来源](https://animethemes.moe/anime/zombieland_saga) |
| 关于我转生变成史莱姆这档事 | 11 | 4 | [来源](https://animethemes.moe/anime/tensei_shitara_slime_datta_ken) |
| DARLING in the FRANXX | 12 | 7 | [来源](https://animethemes.moe/anime/darling_in_the_franxx) |
| 擅长捉弄的高木同学 | 13 | 8 | [来源](https://animethemes.moe/anime/karakai_jouzu_no_takagi_san) |
| 工作细胞 | 14 | 2 | [来源](https://anilist.co/anime/100977) |
| 终将成为你 | 15 | 3 | [来源](https://animethemes.moe/anime/yagate_kimi_ni_naru) |
| 强风吹拂 | 16 | 3 | [来源](https://animethemes.moe/anime/kaze_ga_tsuyoku_fuiteiru) |
| 赛马娘 Pretty Derby | 17 | 6 | [来源](https://animethemes.moe/anime/uma_musume_pretty_derby) |
| SSSS.古立特 | 18 | 2 | [来源](https://animethemes.moe/anime/ssssgridman) |
| 齐木楠雄的灾难 第二季 | 19 | 3 | [来源](https://animethemes.moe/anime/saiki_kusuo_no_ps_nan_2) |
| 龙王的工作！ | 20 | 3 | [来源](https://animethemes.moe/anime/ryuuou_no_oshigoto) |
| OVERLORD 第二季 | 21 | 2 | [来源](https://animethemes.moe/anime/overlord_ii) |
| 刀剑神域 爱丽丝篇 | 22 | 5 | [来源](https://animethemes.moe/anime/sword_art_online_alicization) |
| OVERLORD 第三季 | 23 | 2 | [来源](https://animethemes.moe/anime/overlord_iii) |
| 杀戮天使 | 24 | 2 | [来源](https://animethemes.moe/anime/satsuriku_no_tenshi) |
| MEGALO BOX | 25 | 2 | [来源](https://animethemes.moe/anime/megalo_box) |
| 哥布林杀手 | 26 | 4 | [来源](https://animethemes.moe/anime/goblin_slayer) |
| 黑社会的超能力女儿 | 27 | 4 | [来源](https://animethemes.moe/anime/hinamatsuri) |
| 魔法禁书目录 第三季 | 28 | 4 | [来源](https://animethemes.moe/anime/toaru_majutsu_no_index_iii) |
| 邪神与厨二病少女 | 30 | 1 | [来源](https://animethemes.moe/anime/jashin_chan_dropkick) |
| citrus～柑橘味香气～ | 31 | 2 | [来源](https://animethemes.moe/anime/citrus) |
| 高分少女 | 32 | 1 | [来源](https://animethemes.moe/anime/high_score_girl) |
| 来玩游戏吧 | 33 | 2 | [来源](https://animethemes.moe/anime/asobi_asobase) |
| 恋如雨止 | 34 | 2 | [来源](https://animethemes.moe/anime/koi_wa_ameagari_no_you_ni) |
| pop子和pipi美的日常 | 35 | 5 | [来源](https://animethemes.moe/anime/poputepipikku) |
| 宅男腐女恋爱真难 | 36 | 3 | [来源](https://animethemes.moe/anime/wotaku_ni_koi_wa_muzukashii) |
| 后街女孩 | 37 | 2 | [来源](https://animethemes.moe/anime/back_street_girls_gokudolls) |
| 邻家的吸血鬼小妹 | 38 | 2 | [来源](https://animethemes.moe/anime/tonari_no_kyuuketsuki_san) |
| 黄金神威 | 39 | 2 | [来源](https://animethemes.moe/anime/golden_kamuy) |
| Happy Sugar Life | 40 | 3 | [来源](https://animethemes.moe/anime/happy_sugar_life) |
| 东京喰种:re | 41 | 2 | [来源](https://animethemes.moe/anime/tokyo_ghoulre) |
| 刀剑神域外传 Gun Gale Online | 42 | 2 | [来源](https://animethemes.moe/anime/sword_art_online_alternative_gun_gale_online) |
| Fate/EXTRA Last Encore | 43 | 2 | [来源](https://animethemes.moe/anime/fateextra_last_encore) |
| One Room 第二季 | 44 | 3 | [来源](https://animethemes.moe/anime/one_room_2nd_season) |
| 异世界魔王与召唤少女的奴隶魔术 | 45 | 2 | [来源](https://animethemes.moe/anime/isekai_maou_to_shoukan_shoujo_no_dorei_majutsu) |
| 东京喰种:re 第二季 | 46 | 1 | [来源](https://animethemes.moe/anime/tokyo_ghoulre_2nd_season) |
| 来自多彩世界的明天 | 47 | 1 | [来源](https://animethemes.moe/anime/irozuku_sekai_no_ashita_kara) |
| 妖精森林的小不点 | 48 | 2 | [来源](https://animethemes.moe/anime/hakumei_to_mikochi) |
| 寄宿学校的朱丽叶 | 49 | 1 | [来源](https://animethemes.moe/anime/kishuku_gakkou_no_juliet) |
| 刻刻 | 50 | 1 | [来源](https://animethemes.moe/anime/kokkoku) |
| 漫画女孩 | 51 | 2 | [来源](https://animethemes.moe/anime/comic_girls) |
| ISLAND | 52 | 4 | [来源](https://animethemes.moe/anime/island) |
| 向山进发 第三季 | 53 | 1 | [来源](https://animethemes.moe/anime/yama_no_susume_third_season) |
| 魔卡少女樱 透明牌篇 | 54 | 4 | [来源](https://animethemes.moe/anime/cardcaptor_sakura_clear_card_hen) |
| 我的英雄学院 第三季 | 55 | 4 | [来源](https://animethemes.moe/anime/boku_no_hero_academia_3rd_season) |
| 爆肝工程师的异世界狂想曲 | 56 | 2 | [来源](https://animethemes.moe/anime/death_march_kara_hajimaru_isekai_kyousoukyoku) |
| 千绪的通学路 | 57 | 2 | [来源](https://animethemes.moe/anime/chio_chan_no_tsuugakuro) |
| Slow Start | 59 | 3 | [来源](https://animethemes.moe/anime/slow_start) |
| 博多豚骨拉面 | 60 | 1 | [来源](https://animethemes.moe/anime/hakata_tonkotsu_ramens) |
| 战栗杀机 | 68 | 1 | [来源](https://anilist.co/anime/100388) |
| 剧场版 夏目友人帐 ～缘结空蝉～ | 原有保留 | 1 | [来源](https://anilist.co/anime/100268) |

### 2019年

| 番剧 | 热度序号 | 曲目条目 | 主题来源 |
| --- | ---: | ---: | --- |
| 辉夜大小姐想让我告白～天才们的恋爱头脑战～ | 1 | 3 | [来源](https://animethemes.moe/anime/kaguya_sama_wa_kokurasetai_tensai_tachi_no_renai_zunousen) |
| 鬼灭之刃 | 2 | 4 | [来源](https://animethemes.moe/anime/kimetsu_no_yaiba) |
| 进击的巨人 第三季 Part.2 | 3 | 2 | [来源](https://animethemes.moe/anime/shingeki_no_kyojin_season_3_part_2) |
| 冰海战记 | 4 | 4 | [来源](https://animethemes.moe/anime/vinland_saga) |
| 灵能百分百 第二季 | 5 | 5 | [来源](https://animethemes.moe/anime/mob_psycho_100_ii) |
| 天使降临到了我身边！ | 6 | 2 | [来源](https://animethemes.moe/anime/watashi_ni_tenshi_ga_maiorita) |
| 慎重勇者 ～这个勇者明明超强却过分慎重～ | 7 | 3 | [来源](https://animethemes.moe/anime/shinchou_yuusha_kono_yuusha_ga_ore_tueee_kuse_ni_shinchou_sugiru) |
| 街角魔族 | 8 | 2 | [来源](https://animethemes.moe/anime/machikado_mazoku) |
| 约定的梦幻岛 | 9 | 3 | [来源](https://animethemes.moe/anime/yakusoku_no_neverland) |
| 五等分的新娘 | 10 | 2 | [来源](https://anilist.co/anime/103572) |
| 女高中生的无所事事 | 11 | 3 | [来源](https://animethemes.moe/anime/joshikousei_no_mudazukai) |
| 石纪元 | 12 | 2 | [来源](https://animethemes.moe/anime/dr_stone) |
| 擅长捉弄的高木同学 第二季 | 13 | 9 | [来源](https://animethemes.moe/anime/karakai_jouzu_no_takagi_san_2) |
| 动物狂想曲 | 14 | 5 | [来源](https://animethemes.moe/anime/beastars) |
| 一拳超人 第二季 | 15 | 2 | [来源](https://animethemes.moe/anime/one_punch_man_2nd_season) |
| 刀剑神域 爱丽丝篇 异界战争 | 16 | 2 | [来源](https://animethemes.moe/anime/sword_art_online_alicization_war_of_underworld) |
| 盾之勇者成名录 | 17 | 5 | [来源](https://animethemes.moe/anime/tate_no_yuusha_no_nariagari) |
| 约会大作战 第三季 | 18 | 2 | [来源](https://animethemes.moe/anime/date_a_live_iii) |
| 不吉波普不笑 | 19 | 3 | [来源](https://animethemes.moe/anime/boogiepop_wa_warawanai) |
| 多罗罗 | 20 | 4 | [来源](https://animethemes.moe/anime/dororo) |
| 平凡职业造就世界最强 | 21 | 1 | [来源](https://animethemes.moe/anime/arifureta_shokugyou_de_sekai_saikyou) |
| Fate/Grand Order 绝对魔兽战线 巴比伦尼亚 | 22 | 4 | [来源](https://animethemes.moe/anime/fategrand_order_zettai_majuu_sensen_babylonia) |
| 在地下城寻求邂逅是否搞错了什么 第二季 | 23 | 1 | [来源](https://animethemes.moe/anime/dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka_ii) |
| 某科学的一方通行 | 24 | 2 | [来源](https://animethemes.moe/anime/toaru_kagaku_no_accelerator) |
| 君主·埃尔梅罗二世事件簿 魔眼收集列车 Grace note | 25 | 1 | [来源](https://animethemes.moe/anime/lord_el_melloi_ii_sei_no_jikenbo_rail_zeppelin_grace_note) |
| 家有女友 | 26 | 3 | [来源](https://animethemes.moe/anime/domestic_na_kanojo) |
| 只要可爱即使是变态你也会喜欢我吧？ | 27 | 3 | [来源](https://animethemes.moe/anime/kawaikereba_hentai_demo_suki_ni_natte_kuremasu_ka) |
| 骚动时节的少女们啊 | 28 | 2 | [来源](https://animethemes.moe/anime/araburu_kisetsu_no_otome_domo_yo) |
| 高分少女 第二季 | 29 | 1 | [来源](https://animethemes.moe/anime/high_score_girl_ii) |
| 喜欢本大爷的竟然就你一个？ | 30 | 2 | [来源](https://animethemes.moe/anime/ore_wo_suki_nano_wa_omae_dake_ka_yo) |
| 我们真的学不来 | 31 | 2 | [来源](https://animethemes.moe/anime/bokutachi_wa_benkyou_ga_dekinai) |
| CAROLE & TUESDAY | 32 | 4 | [来源](https://animethemes.moe/anime/carole_tuesday) |
| 狂赌之渊×× | 33 | 1 | [来源](https://animethemes.moe/anime/kakegurui_2019) |
| 炎炎消防队 | 34 | 4 | [来源](https://animethemes.moe/anime/enen_no_shouboutai) |
| 我，不是说了能力要平均值么！ | 35 | 2 | [来源](https://animethemes.moe/anime/watashi_nouryoku_wa_heikinchi_de_tte_itta_yo_ne) |
| 川柳少女 | 36 | 1 | [来源](https://animethemes.moe/anime/senryuu_shoujo) |
| 笨拙之极的上野 | 37 | 7 | [来源](https://animethemes.moe/anime/ueno_san_wa_bukiyou) |
| 入间同学入魔了 | 38 | 2 | [来源](https://animethemes.moe/anime/mairimashita_iruma_kun) |
| 淫乱的青酱不能学习 | 39 | 1 | [来源](https://animethemes.moe/anime/midara_na_ao_chan_wa_benkyou_ga_dekinai) |
| BanG Dream! 第二季 | 40 | 4 | [来源](https://animethemes.moe/anime/bang_dream_2nd_season) |
| 你遭难了吗？ | 41 | 2 | [来源](https://animethemes.moe/anime/sounan_desu_ka) |
| 烟草 | 43 | 1 | [来源](https://animethemes.moe/anime/kemurikusa) |
| 异世界四重奏 | 44 | 3 | [来源](https://animethemes.moe/anime/isekai_quartet) |
| 流汗吧！健身少女 | 45 | 2 | [来源](https://animethemes.moe/anime/dumbbell_nan_kilo_moteru) |
| 为什么老师会在这里！？ | 46 | 2 | [来源](https://animethemes.moe/anime/nande_koko_ni_sensei_ga) |
| 贤者之孙 | 47 | 1 | [来源](https://animethemes.moe/anime/kenja_no_mago) |
| 皿三昧 | 48 | 1 | [来源](https://animethemes.moe/anime/sarazanmai) |
| 我们真的学不来！ | 49 | 3 | [来源](https://animethemes.moe/anime/bokutachi_wa_benkyou_ga_dekinai_2) |
| 彼方的阿斯特拉 | 50 | 3 | [来源](https://animethemes.moe/anime/kanata_no_astra) |
| Endro~！ | 51 | 2 | [来源](https://animethemes.moe/anime/endro) |
| 文豪野犬 第三季 | 52 | 2 | [来源](https://animethemes.moe/anime/bungou_stray_dogs_3rd_season) |
| 普通攻击是全体攻击而且能二次攻击的妈妈你喜欢吗？ | 53 | 2 | [来源](https://animethemes.moe/anime/tsuujou_kougeki_ga_zentai_kougeki_de_ni_kai_kougeki_no_okaasan_wa_suki_desu_ka) |
| 一个人的○○小日子 | 54 | 2 | [来源](https://animethemes.moe/anime/hitoribocchi_no_marumaru_seikatsu) |
| COP CRAFT | 55 | 1 | [来源](https://animethemes.moe/anime/cop_craft) |
| 重来吧、魔王大人！ | 56 | 2 | [来源](https://animethemes.moe/anime/maou_sama_retry) |
| 心理测量者3 | 57 | 2 | [来源](https://animethemes.moe/anime/psycho_pass_3) |
| 食戟之灵  神之皿 | 58 | 2 | [来源](https://animethemes.moe/anime/shokugeki_no_souma_shin_no_sara) |
| 贤惠幼妻仙狐小姐 | 59 | 2 | [来源](https://animethemes.moe/anime/sewayaki_kitsune_no_senko_san) |
| 为了女儿，我说不定连魔王都能干掉。 | 60 | 1 | [来源](https://animethemes.moe/anime/uchi_no_ko_no_tame_naraba_ore_wa_moshikashitara_maou_mo_taoseru_kamo_shirenai) |
| 天气之子 | 原有保留 | 3 | [来源](https://anilist.co/anime/106286) |
