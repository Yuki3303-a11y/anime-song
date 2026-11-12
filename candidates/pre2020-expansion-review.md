# 2020 年前曲库扩充记录

更新日期：2026-11-12。新增430个曲目条目，原有315首歌曲及2020年后的2095条季度记录均保持原内容和顺序。此前用户确认移除的六部早期番剧不重新加入。

## 数量口径

按年度首播范围的 Bangumi TV 热度顺序优先收录；已核实的常规不同歌名 OP/ED 一并收录，年番后续 OP/ED 不只取第一组。旧歌参与目标总量计算，不要求每年恰好60首。2010年及以前为一个合并范围。

下表使用实际可出题的歌曲去重口径；同首歌重复用于OP/ED或存在多个演唱版本时，一次挑战仍只出一次。统一浏览共2775个曲目条目，实际可出题2679首，覆盖107个非空季度。

| 范围 | 扩充前 | 扩充后可出题 |
| --- | ---: | ---: |
| 2010年及以前 | 90 | 103 |
| 2011年 | 18 | 62 |
| 2012年 | 11 | 60 |
| 2013年 | 8 | 61 |
| 2014年 | 15 | 60 |
| 2015年 | 12 | 60 |
| 2016年 | 24 | 61 |
| 2017年 | 15 | 62 |
| 2018年 | 17 | 60 |
| 2019年 | 13 | 63 |

## 来源与复核规则

- 热度来源：[Bangumi公开API](https://bangumi.github.io/dev-docs/)，使用 sort=heat、日本TV动画、年度首播日期范围；不是评分最高榜。原始响应每页最多20条，按实际分页继续读取。
- 中文番名优先使用Bangumi中文名，作品通过日本原名、正式季度与精确AniList ID交叉核对。
- 歌曲类型、歌名和演唱者以[AnimeThemes](https://animethemes.moe/)官方条目为基础；缺漏署名通过动画官网、唱片公司或发行商补核，具体URL保留在JSON记录的supplementalCredits、creditCorrections中。
- 不以无歌词器乐、Off-Vocal、纯再编曲或无法确定演唱者的特殊结尾凑数。元数据源缺漏不等于歌曲未发表。
- 新曲使用现有智选三源、iTunes + YouTube或仅B站流程。没有逐首人工听审全部430个新增条目，也不把元数据匹配称为音源已验证。
- 全部源记录、缺口和排除原因见[扩充清单](pre2020-expansion.json)。既有2020年后榜单记录继续见[季度归档清单](season-archive-manifest.json)。

## 本次新增曲目及官方主题来源

### 2010年及以前

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 新世纪福音战士 | 1 | [主题曲](https://animethemes.moe/anime/neon_genesis_evangelion) |
| 轻音少女 | 1 | [主题曲](https://animethemes.moe/anime/k_on) |
| CLANNAD ～AFTER STORY～ | 2 | [主题曲](https://animethemes.moe/anime/clannad_after_story) |
| CLANNAD | 1 | [主题曲](https://animethemes.moe/anime/clannad) |
| 龙与虎 | 3 | [主题曲](https://animethemes.moe/anime/toradora) |
| 死亡笔记 | 3 | [主题曲](https://animethemes.moe/anime/death_note) |
| 四叠半神话大系 | 2 | [主题曲](https://animethemes.moe/anime/yojouhan_shinwa_taikei) |

### 2011年

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 命运石之门 | 3 | [主题曲](https://animethemes.moe/anime/steinsgate) |
| 魔法少女小圆 | 2 | [主题曲](https://animethemes.moe/anime/mahou_shoujo_madokamagica) |
| Fate/Zero | 1 | [主题曲](https://animethemes.moe/anime/fatezero) |
| 日常 | 16 | [主题曲](https://animethemes.moe/anime/nichijou) |
| 我们仍未知道那天所看见的花的名字。 | 1 | [主题曲](https://animethemes.moe/anime/ano_hi_mita_hana_no_namae_wo_bokutachi_wa_mada_shiranai) |
| 罪恶王冠 | 2 | [主题曲](https://animethemes.moe/anime/guilty_crown) |
| 未来日记 | 2 | [主题曲](https://animethemes.moe/anime/mirai_nikki) |
| 银魂' | 6 | [主题曲](https://animethemes.moe/anime/gintama_2011) |
| 回转企鹅罐 | 11 | [主题曲](https://animethemes.moe/anime/mawaru_penguindrum) |

本范围存在2项来源缺漏或待确认记录，详见JSON；已有歌曲继续保留。

### 2012年

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 冰菓 | 2 | [主题曲](https://animethemes.moe/anime/hyouka) |
| 中二病也要谈恋爱！ | 1 | [主题曲](https://animethemes.moe/anime/chuunibyou_demo_koi_ga_shitai) |
| 刀剑神域 | 3 | [主题曲](https://animethemes.moe/anime/sword_art_online) |
| 男子高中生的日常 | 2 | [主题曲](https://animethemes.moe/anime/danshi_koukousei_no_nichijou) |
| 樱花庄的宠物女孩 | 5 | [主题曲](https://animethemes.moe/anime/sakurasou_no_pet_na_kanojo) |
| JOJO的奇妙冒险 | 2 | [主题曲](https://animethemes.moe/anime/jojo_no_kimyou_na_bouken) |
| 来自新世界 | 2 | [主题曲](https://animethemes.moe/anime/shinsekai_yori) |
| 心理测量者 | 2 | [主题曲](https://animethemes.moe/anime/psycho_pass) |
| 伪物语 | 3 | [主题曲](https://animethemes.moe/anime/nisemonogatari) |
| Another | 0 | [主题曲](https://animethemes.moe/anime/another) |
| 散华礼弥 | 2 | [主题曲](https://animethemes.moe/anime/sankarea) |
| 人类衰退之后 | 2 | [主题曲](https://animethemes.moe/anime/jinrui_wa_suitai_shimashita) |
| 猫物语（黑） | 2 | [主题曲](https://animethemes.moe/anime/nekomonogatari_kuro) |
| 潜行吧！奈亚子 | 2 | [主题曲](https://animethemes.moe/anime/haiyore_nyaruko_san) |
| 邻座的怪同学 | 2 | [主题曲](https://animethemes.moe/anime/tonari_no_kaibutsu_kun) |
| 少女与战车 | 2 | [主题曲](https://animethemes.moe/anime/girls_und_panzer) |
| 恋爱随意链接 | 5 | [主题曲](https://animethemes.moe/anime/kokoro_connect) |
| 加速世界 | 4 | [主题曲](https://animethemes.moe/anime/accel_world) |
| 摇曳百合♪♪ | 4 | [主题曲](https://animethemes.moe/anime/yuru_yuri_2012) |
| 恶魔高校 D×D | 2 | [主题曲](https://animethemes.moe/anime/high_school_dxd) |

本范围存在2项来源缺漏或待确认记录，详见JSON；已有歌曲继续保留。

### 2013年

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 进击的巨人 | 3 | [主题曲](https://animethemes.moe/anime/shingeki_no_kyojin) |
| 我的青春恋爱物语果然有问题 | 2 | [主题曲](https://animethemes.moe/anime/yahari_ore_no_seishun_love_comedy_wa_machigatteiru) |
| 斩服少女 | 4 | [主题曲](https://animethemes.moe/anime/kill_la_kill) |
| 某科学的超电磁炮S | 6 | [主题曲](https://animethemes.moe/anime/toaru_kagaku_no_railgun_s) |
| 约会大作战 | 4 | [主题曲](https://animethemes.moe/anime/date_a_live) |
| 玉子市场 | 2 | [主题曲](https://animethemes.moe/anime/tamako_market) |
| 境界的彼方 | 1 | [主题曲](https://animethemes.moe/anime/kyoukai_no_kanata) |
| 悠哉日常大王 | 2 | [主题曲](https://animethemes.moe/anime/non_non_biyori) |
| 我的妹妹哪有这么可爱。 | 14 | [主题曲](https://animethemes.moe/anime/ore_no_imouto_ga_konnani_kawaii_wake_ga_nai_2013) |
| 物语系列 第二季 | 7 | [主题曲](https://animethemes.moe/anime/monogatari_series_second_season) |
| 打工吧！魔王大人 | 4 | [主题曲](https://animethemes.moe/anime/hataraku_maou_sama) |
| 来自风平浪静的明天 | 4 | [主题曲](https://animethemes.moe/anime/nagi_no_asukara) |

本范围存在1项来源缺漏或待确认记录，详见JSON；已有歌曲继续保留。

### 2014年

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 游戏人生 | 2 | [主题曲](https://animethemes.moe/anime/no_game_no_life) |
| 白箱 | 5 | [主题曲](https://animethemes.moe/anime/shirobako) |
| 四月是你的谎言 | 2 | [主题曲](https://animethemes.moe/anime/shigatsu_wa_kimi_no_uso) |
| 月刊少女野崎君 | 2 | [主题曲](https://animethemes.moe/anime/gekkan_shoujo_nozaki_kun) |
| Fate/stay night [Unlimited Blade Works] | 3 | [主题曲](https://animethemes.moe/anime/fatestay_night_unlimited_blade_works_tv) |
| JOJO的奇妙冒险 星尘斗士 | 2 | [主题曲](https://animethemes.moe/anime/jojo_no_kimyou_na_bouken_part_3_stardust_crusaders) |
| 中二病也要谈恋爱！恋 | 2 | [主题曲](https://animethemes.moe/anime/chuunibyou_demo_koi_ga_shitai_ren) |
| 寄生兽 生命的准则 | 1 | [主题曲](https://animethemes.moe/anime/kiseijuu_sei_no_kakuritsu) |
| 乒乓 | 2 | [主题曲](https://animethemes.moe/anime/ping_pong_the_animation) |
| 甘城光辉游乐园 | 2 | [主题曲](https://animethemes.moe/anime/amagi_brilliant_park) |
| 东京喰种 | 1 | [主题曲](https://animethemes.moe/anime/tokyo_ghoul) |
| 刀剑神域 第二季 | 6 | [主题曲](https://animethemes.moe/anime/sword_art_online_ii) |
| 伪恋 | 9 | [主题曲](https://animethemes.moe/anime/nisekoi) |
| 野良神 | 2 | [主题曲](https://animethemes.moe/anime/noragami) |
| 斩·赤红之瞳！ | 4 | [主题曲](https://animethemes.moe/anime/akame_ga_kill) |

本范围存在1项来源缺漏或待确认记录，详见JSON；已有歌曲继续保留。

### 2015年

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 路人女主的养成方法 | 2 | [主题曲](https://animethemes.moe/anime/saenai_heroine_no_sodatekata) |
| 吹响吧！上低音号 | 2 | [主题曲](https://animethemes.moe/anime/hibike_euphonium) |
| 一拳超人 | 1 | [主题曲](https://animethemes.moe/anime/one_punch_man) |
| 夏洛特 | 3 | [主题曲](https://animethemes.moe/anime/charlotte) |
| 我的青春恋爱物语果然有问题 续 | 2 | [主题曲](https://animethemes.moe/anime/yahari_ore_no_seishun_love_comedy_wa_machigatteiru_zoku) |
| Fate/stay night [Unlimited Blade Works] 第二季 | 1 | [主题曲](https://animethemes.moe/anime/fatestay_night_unlimited_blade_works_2nd_season) |
| JOJO的奇妙冒险 星尘斗士 埃及篇 | 0 | [主题曲](https://animethemes.moe/anime/jojo_no_kimyou_na_bouken_part_3_stardust_crusaders_2nd_season) |
| 干物妹！小埋 | 1 | [主题曲](https://animethemes.moe/anime/himouto_umaru_chan) |
| OVERLORD | 1 | [主题曲](https://animethemes.moe/anime/overlord) |
| 可塑性记忆 | 1 | [主题曲](https://animethemes.moe/anime/plastic_memories) |
| 暗杀教室 | 3 | [主题曲](https://animethemes.moe/anime/ansatsu_kyoushitsu_tv) |
| 血界战线 | 0 | [主题曲](https://animethemes.moe/anime/kekkai_sensen) |
| 在地下城寻求邂逅是否搞错了什么 | 3 | [主题曲](https://animethemes.moe/anime/dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka) |
| 学园孤岛 | 3 | [主题曲](https://animethemes.moe/anime/gakkou_gurashi) |
| 没有黄段子存在的无聊世界 | 2 | [主题曲](https://animethemes.moe/anime/shimoneta_to_iu_gainen_ga_sonzai_shinai_taikutsu_na_sekai) |
| 终物语 | 5 | [主题曲](https://animethemes.moe/anime/owarimonogatari) |
| 监狱学园 | 2 | [主题曲](https://animethemes.moe/anime/prison_school) |
| 请问您今天要来点兔子吗？？ | 3 | [主题曲](https://animethemes.moe/anime/gochuumon_wa_usagi_desu_ka_2015) |
| 食戟之灵 | 1 | [主题曲](https://animethemes.moe/anime/shokugeki_no_souma_food_wars) |
| 伪恋： | 8 | [主题曲](https://animethemes.moe/anime/nisekoi_2015) |
| 野良神 ARAGOTO | 2 | [主题曲](https://animethemes.moe/anime/noragami_aragoto) |
| 悠哉日常大王 Repeat | 2 | [主题曲](https://animethemes.moe/anime/non_non_biyori_repeat) |

本范围存在6项来源缺漏或待确认记录，详见JSON；已有歌曲继续保留。

### 2016年

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 为美好的世界献上祝福！ | 0 | [主题曲](https://animethemes.moe/anime/kono_subarashii_sekai_ni_shukufuku_wo) |
| Re：从零开始的异世界生活 | 5 | [主题曲](https://animethemes.moe/anime/rezero_kara_hajimeru_isekai_seikatsu) |
| 灵能百分百 | 0 | [主题曲](https://animethemes.moe/anime/mob_psycho_100) |
| 齐木楠雄的灾难 | 2 | [主题曲](https://animethemes.moe/anime/saiki_kusuo_no_ps_nan) |
| 吹响吧！上低音号 第二季 | 2 | [主题曲](https://animethemes.moe/anime/hibike_euphonium_2) |
| JOJO的奇妙冒险 不灭钻石 | 0 | [主题曲](https://animethemes.moe/anime/jojo_no_kimyou_na_bouken_part_4_diamond_wa_kudakenai) |
| 只有我不存在的城市 | 0 | [主题曲](https://animethemes.moe/anime/boku_dake_ga_inai_machi) |
|  | 7 | [主题曲](https://animethemes.moe/anime/relife) |
| 3月的狮子 | 5 | [主题曲](https://animethemes.moe/anime/3_gatsu_no_lion) |
| 在下坂本，有何贵干？ | 1 | [主题曲](https://animethemes.moe/anime/sakamoto_desu_ga) |
| 这个美术社大有问题！ | 3 | [主题曲](https://animethemes.moe/anime/kono_bijutsubu_ni_wa_mondai_ga_aru) |
|  | 3 | [主题曲](https://animethemes.moe/anime/new_game) |
| 灰与幻想的格林姆迦尔 | 2 | [主题曲](https://animethemes.moe/anime/hai_to_gensou_no_grimgar) |
| 甲铁城的卡巴内利 | 2 | [主题曲](https://animethemes.moe/anime/koutetsujou_no_kabaneri) |
| 线上游戏的老婆不可能是女生？ | 2 | [主题曲](https://animethemes.moe/anime/netoge_no_yome_wa_onnanoko_ja_nai_to_omotta) |
| 暗杀教室 第二季 | 4 | [主题曲](https://animethemes.moe/anime/ansatsu_kyoushitsu_tv_2nd_season) |

本范围存在7项来源缺漏或待确认记录，详见JSON；已有歌曲继续保留。

### 2017年

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 小林家的龙女仆 | 2 | [主题曲](https://animethemes.moe/anime/kobayashi_san_chi_no_maid_dragon) |
| 进击的巨人 第二季 | 1 | [主题曲](https://animethemes.moe/anime/shingeki_no_kyojin_season_2) |
| 来自深渊 | 1 | [主题曲](https://animethemes.moe/anime/made_in_abyss) |
| 为美好的世界献上祝福！ 第二季 | 2 | [主题曲](https://animethemes.moe/anime/kono_subarashii_sekai_ni_shukufuku_wo_2) |
| 埃罗芒阿老师 | 1 | [主题曲](https://animethemes.moe/anime/eromanga_sensei) |
| 少女终末旅行 | 3 | [主题曲](https://animethemes.moe/anime/shoujo_shuumatsu_ryokou) |
| 月色真美 | 2 | [主题曲](https://animethemes.moe/anime/tsuki_ga_kirei) |
| 路人女主的养成方法 ♭ | 3 | [主题曲](https://animethemes.moe/anime/saenai_heroine_no_sodatekata_2017) |
| 欢迎来到实力至上主义的教室 | 1 | [主题曲](https://animethemes.moe/anime/youkoso_jitsuryoku_shijou_shugi_no_kyoushitsu_e) |
| 末日时在做什么？有没有空？可以来拯救吗？ | 3 | [主题曲](https://animethemes.moe/anime/shuumatsu_nani_shitemasu_ka_isogashii_desu_ka_sukutte_moratte_ii_desu_ka) |
| 珈百璃的堕落 | 3 | [主题曲](https://animethemes.moe/anime/gabriel_dropout) |
| 宝石之国 | 3 | [主题曲](https://animethemes.moe/anime/houseki_no_kuni) |
| 3月的狮子 第二季 | 4 | [主题曲](https://animethemes.moe/anime/3_gatsu_no_lion_2nd_season) |
| 徒然喜欢你 | 2 | [主题曲](https://animethemes.moe/anime/tsurezure_children) |
| 重启咲良田 | 3 | [主题曲](https://animethemes.moe/anime/sakurada_reset) |
| 笨女孩 | 2 | [主题曲](https://animethemes.moe/anime/aho_girl) |
| 干物妹！小埋R | 2 | [主题曲](https://animethemes.moe/anime/himouto_umaru_chan_r) |
| 小魔女学园 | 4 | [主题曲](https://animethemes.moe/anime/little_witch_academia_tv) |
| 狂赌之渊 | 2 | [主题曲](https://animethemes.moe/anime/kakegurui) |
| 幼女战记 | 3 | [主题曲](https://animethemes.moe/anime/youjo_senki) |

本范围存在6项来源缺漏或待确认记录，详见JSON；已有歌曲继续保留。

### 2018年

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 青春猪头少年不会梦到兔女郎学姐 | 0 | [主题曲](https://animethemes.moe/anime/seishun_buta_yarou_wa_bunny_girl_senpai_no_yume_wo_minai) |
| 紫罗兰永恒花园 | 1 | [主题曲](https://animethemes.moe/anime/violet_evergarden) |
| 碧蓝之海 | 1 | [主题曲](https://animethemes.moe/anime/grand_blue) |
| 进击的巨人 第三季 | 2 | [主题曲](https://animethemes.moe/anime/shingeki_no_kyojin_season_3) |
| 摇曳露营△ | 1 | [主题曲](https://animethemes.moe/anime/yuru_camp) |
| 命运石之门 0 | 4 | [主题曲](https://animethemes.moe/anime/steinsgate_0) |
| 比宇宙更远的地方 | 3 | [主题曲](https://animethemes.moe/anime/sora_yori_mo_tooi_basho) |
| 少女☆歌剧 Revue Starlight | 2 | [主题曲](https://animethemes.moe/anime/shoujokageki_revue_starlight) |
| JOJO的奇妙冒险 黄金之风 | 1 | [主题曲](https://animethemes.moe/anime/jojo_no_kimyou_na_bouken_part_5_ougon_no_kaze) |
| 佐贺偶像是传奇 | 6 | [主题曲](https://animethemes.moe/anime/zombieland_saga) |
| 关于我转生变成史莱姆这档事 | 3 | [主题曲](https://animethemes.moe/anime/tensei_shitara_slime_datta_ken) |
| DARLING in the FRANXX | 6 | [主题曲](https://animethemes.moe/anime/darling_in_the_franxx) |
| 擅长捉弄的高木同学 | 8 | [主题曲](https://animethemes.moe/anime/karakai_jouzu_no_takagi_san) |
| 工作细胞 | 0 | [主题曲](https://animethemes.moe/anime/hataraku_saibou) |
| 终将成为你 | 3 | [主题曲](https://animethemes.moe/anime/yagate_kimi_ni_naru) |
| 强风吹拂 | 2 | [主题曲](https://animethemes.moe/anime/kaze_ga_tsuyoku_fuiteiru) |

本范围存在6项来源缺漏或待确认记录，详见JSON；已有歌曲继续保留。

### 2019年

| 番剧 | 新收录数量 | 官方主题条目 |
| --- | ---: | --- |
| 辉夜大小姐想让我告白～天才们的恋爱头脑战～ | 2 | [主题曲](https://animethemes.moe/anime/kaguya_sama_wa_kokurasetai_tensai_tachi_no_renai_zunousen) |
| 鬼灭之刃 | 2 | [主题曲](https://animethemes.moe/anime/kimetsu_no_yaiba) |
| 进击的巨人 第三季 Part.2 | 2 | [主题曲](https://animethemes.moe/anime/shingeki_no_kyojin_season_3_part_2) |
| 冰海战记 | 4 | [主题曲](https://animethemes.moe/anime/vinland_saga) |
| 灵能百分百 第二季 | 5 | [主题曲](https://animethemes.moe/anime/mob_psycho_100_ii) |
| 天使降临到了我身边！ | 2 | [主题曲](https://animethemes.moe/anime/watashi_ni_tenshi_ga_maiorita) |
| 慎重勇者 ～这个勇者明明超强却过分慎重～ | 3 | [主题曲](https://animethemes.moe/anime/shinchou_yuusha_kono_yuusha_ga_ore_tueee_kuse_ni_shinchou_sugiru) |
| 街角魔族 | 2 | [主题曲](https://animethemes.moe/anime/machikado_mazoku) |
| 约定的梦幻岛 | 3 | [主题曲](https://animethemes.moe/anime/yakusoku_no_neverland) |
| 五等分的新娘 | 0 | [主题曲](https://animethemes.moe/anime/gotoubun_no_hanayome) |
| 女高中生的无所事事 | 3 | [主题曲](https://animethemes.moe/anime/joshikousei_no_mudazukai) |
| 石纪元 | 1 | [主题曲](https://animethemes.moe/anime/dr_stone) |
| 擅长捉弄的高木同学 第二季 | 9 | [主题曲](https://animethemes.moe/anime/karakai_jouzu_no_takagi_san_2) |
| 动物狂想曲 | 4 | [主题曲](https://animethemes.moe/anime/beastars) |
| 一拳超人 第二季 | 2 | [主题曲](https://animethemes.moe/anime/one_punch_man_2nd_season) |
| 刀剑神域 爱丽丝篇 异界战争 | 1 | [主题曲](https://animethemes.moe/anime/sword_art_online_alicization_war_of_underworld) |
| 盾之勇者成名录 | 5 | [主题曲](https://animethemes.moe/anime/tate_no_yuusha_no_nariagari) |

本范围存在1项来源缺漏或待确认记录，详见JSON；已有歌曲继续保留。
