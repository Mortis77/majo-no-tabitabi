# 《月帷巫女》设计与技术契约

> 所有参与开发的人（和智能体）都以本文为准。代码里的事实以 `src/core/`、`src/world/ground.js`、`src/world/veil.js`、`src/data/world.js` 为准——这些文件已经写好，**不要改动它们**（需要改时在汇报里提出）。

## 0. 一句话与铁律

第三人称 3D 魔法开放世界冒险。主角是骑着召唤扫帚、通晓八系灵诀的巫女「灯里」。世界的一切——草木、岩石、水面、器物、生灵——都遵循同一套元素与物理规则，可以被魔法改变。

**铁律**

1. **这是魔法世界，不出现任何科技/天文术语。** 玩家可见文字（对白、UI、提示、图鉴）禁用：日食、月食、食甚、日蚀、星球、行星、卫星、轨道、引力、重力、潮汐、公转、自转、天文、宇宙、物理、化学、科技、能量、系统、数据、像素、BUG 等。月亮挡住太阳这件事只用世界内的说法：**月轮、日轮、月帷、帷下、常夜、薄暮、曦光、金环**。
2. **原创。** 不照搬任何现成游戏的角色、名称、UI、图标、音乐、关卡。可以借鉴"卡通渲染开放世界 + 元素互动"这一类型的手感。
3. **文字不写死。** 代码里不允许出现任何玩家可见的文字字面量：全部放进 `src/locales/zh-CN/<系统名>*.js`，用 `t('命名空间.键', {参数})` 取（见 §5.5）。目前只有简体中文，文风：温柔、带一点俳谐的和风童话。以后会加别的语言。
4. 运行环境：Chrome / Electron（macOS）。只用 three.js(0.187) + @dimforge/rapier3d-compat(0.21)。不引入其他运行时依赖，不访问网络。
5. 资源：模型/音频来自 `assets/`（开放授权，见 `assets/manifest.json` 与 `CREDITS.md`），其余用代码生成。

## 1. 世界观

### 1.1 曦月洲
太古之时，日轮与月轮是轮流巡天的一对姊妹。后来大地深处生出噬光的大妖 **「无明」**——它以日光为食，越吃越大。月神 **胧** 为了饿住它，把月轮钉在了天穹的一处，正好挡在日轮与无明之间。从此月轮不再行走，月影覆盖的土地再也见不到完整的太阳，人们把这片影子叫作 **月帷**。

- **曦光原**（帷外，西）：日轮完整，永远是明亮的上午。向日神社与朝颜村在这里。
- **薄暮林**（帷缘，中）：月轮咬住半个日轮，永远是黄昏。红枫与银杏不落叶，狐灵住在这里。
- **常夜原**（帷下，东）：月轮完全遮住日轮，只在边缘漏出一圈 **金环**。这里的人靠万盏灯火生活，草木自己会发光。
- **月读宫**：帷心的石峰之上，月神的旧宫，无明就被镇在峰下。

镇住无明的是四盏 **镇灯**：暮灯（千年枫下）、镜灯（镜湖镜心屿）、晶灯（星晶野）、月灯（月读宫）。镇灯里烧的是「日火」——从帷外带进来的日光。

### 1.2 故事
近来镇灯一盏接一盏暗下去，常夜原的路灯也跟着熄灭。无明翻了个身，它呼出的气凝成 **影祟**，沿着月帷的边缘往外渗，薄暮林的黄昏一年比一年深。

向日神社世代侍奉日轮，巫女能把日光「请」进符里。年轻的巫女 **灯里** 被日和婆婆托付了神社的星帚，要把日火重新送进四盏镇灯。一路上她向各地的师父学会八系灵诀，最后在月读宫面对被无明附身的月之巫女 **胧夜**，以及无明本身。

结局不是「驱散黑夜」：常夜原的人爱他们的夜。灯里点亮月灯，无明重新睡去，月帷停止蔓延，金环比任何时候都亮。

### 1.3 人物
| id | 名 | 身份 | 地点 | 教授 |
|---|---|---|---|---|
| akari | 灯里 | 主角，向日神社见习巫女 | — | — |
| dango | 团子 | 管狐（会说话的小狐灵，同伴/提示） | 跟随主角 | — |
| granny | 日和婆婆 | 向日神社宫司 | anchor `granny` | 唤帚、日·日辉 |
| himawari | 阳葵 | 师姐，火系巫女，爽朗好胜 | 神乐练习场 | 火·狐火、结界（对决教学） |
| ushio | 阿汐 | 朝颜村井里的河童姑娘 | anchor `village_elder` 旁的井 | 水·涟珠 |
| kokonoe | 九重 | 狐火之里的顽皮术师（公狐） | anchor `fox_racer` | 风·旋风、光翼 |
| kuzunoha | 葛叶 | 狐火之里长老 | anchor `fox_elder` | 式神 |
| rikka | 六花 | 霜见岳的雪女 | 风祠 | 冰·霜华 |
| naru | 鸣 | 万灯镇打太鼓的雷童 | anchor `town_racer` | 雷·落雷 |
| shoku | 烛 | 万灯镇灯匠少女 | anchor `town_lampmaker` | —（主线引导、商店） |
| banou | 磐翁 | 星晶野的石匠隐士 | anchor `crystal_hermit` | 岩·岩起 |
| kagami | 镜姬 | 镜湖的摆渡人（月之眷属） | anchor `lake_ferryman` | 月·月引 |
| oboroyo | 胧夜 | 月读宫的月之巫女，被无明附身 | 月读宫 | 终战 |

其余村民、狐灵、镇民、小贩由剧情模块自由发挥。

## 2. 地图

坐标与地点全部在 `src/data/world.js`（只有 id 与坐标；名字在 `src/locales/zh-CN/world.js`）：`POI`、`ANCHORS`（NPC/机关的精确落点，周围 3.5 m 不得放东西）、`ROADS`、`RIVERS`、`BRIDGES`、`STONE_LANTERNS`(12)、`GREAT_LANTERNS`(4)、`SKY_ISLES`(14 座浮空岛)、`FLATTEN`。+x 东，+z 南，+y 上，单位米，海平面 y=0。陆地是半径约 770 的不规则圆盘。

月帷中心 `VEIL=(380,-40)`，半径 300 内为全夜，620 外为全日，其间为薄暮。`veilAt(x,z)`：0=曦光，1=常夜。

| 地点 | 坐标 | 说明 |
|---|---|---|
| 向日神社 | (-540, 40) 山顶平台 h=30 | 出生点；拜殿在北朝南，鸟居与石阶在南 |
| 神乐练习场 | (-600, -22) | 战斗/对决教学 |
| 朝颜村 | (-455, 150) | 农村，水车、稻田、向日葵 |
| 向日葵之丘 | (-620, -140) | 花海，画师支线 |
| 白浪岬 | (-380, 560) | 南岸海角 |
| 霜见岳 / 风祠 | 山顶 (-20, -540) h=176 | 雪山；冰系师父 |
| 雾见泉 | (-150, -250) | 暮川源头 |
| 狐火之里 | (-70, 90) | 狐灵村，千本鸟居 |
| 千年枫（暮灯） | (-30, -170) | 第一盏镇灯 |
| 镜湖 / 镜心屿（镜灯） | (120, 400) | 第二盏镇灯 |
| 万灯镇 | (205, -125) | 常夜的城镇，夜市，枢纽 |
| 萤茸林 | (400, 210) | 发光巨菇森林 |
| 星晶野（晶灯） | (545, -275) | 第三盏镇灯 |
| 月池 / 月读宫（月灯） | (380, -40) 峰顶 h=140 | 环形水池围着石峰；终点 |
| 暗潮岸 | (690, 60) | 东岸 |

## 3. 玩法

### 3.1 操作（`src/core/input.js` 的 action 名）
| 动作 | 键 | action |
|---|---|---|
| 移动 | WASD | forward/back/left/right（`input.moveX/moveY`） |
| 视角 | 鼠标（指针锁定；未锁定时按住拖动） | `input.lookX/lookY` |
| 跳 / 扫帚上升 / 空中按住展开光翼 | 空格 | jump |
| 下降（扫帚） | C / Ctrl | descend |
| 疾跑 / 扫帚加速 | Shift | sprint |
| 闪身（带无敌帧的冲刺） | Q | dodge |
| 灵符（普通攻击，可按住连发） | 左键 | attack |
| 施放当前灵诀（点按=小式，按住蓄力后松开=大式） | 右键 | cast |
| 选择灵诀 | 1–8 / 滚轮；按住 Tab 打开灵诀轮盘 | el1…el8 / wheel |
| 结界（格挡；刚展开的瞬间可弹反） | R | guard |
| 唤帚（召唤/收起扫帚） | F | broom |
| 互动 | E | interact |
| 吃团子回血 | X | heal |
| 召唤式神 | Z | summon |
| 金环（终极，「契」满时） | G | ultimate |
| 锁定目标 | 鼠标中键 / T | lock |
| 地图 / 手记 / 灵诀簿 / 暂停 | M / J / B / Esc | map / journal / spellbook / pause |

### 3.2 八象（元素）与万物相生
元素 id：`fire 火` `water 水` `ice 冰` `wind 风` `thunder 雷` `earth 岩` `sun 日` `moon 月`。

**材质**（每个可反应的东西都有一个）：`grass 草叶` `wood 木` `paper 纸` `cloth 布` `stone 石` `metal 金属` `ice 冰` `crystal 晶` `water 水` `flesh 生灵` `spirit 灵体` `shade 影`。

**状态**：`burning 燃烧` `wet 湿润` `frozen 冻结` `shocked 感电` `lit 明亮(被光照着)`。

**反应表**（`G.elements.apply` 的行为，所有法术/环境共用）：

| 施加 | 对象状态/材质 | 结果 |
|---|---|---|
| 火 | 草/木/纸/布（干） | 点燃；燃烧会向相邻可燃物与草地蔓延，顺风更快 |
| 火 | 湿润 | 蒸干（冒蒸汽），不点燃 |
| 火 | 冻结 / 冰 | 融化 → 变湿润；冰块融成水花 |
| 火 | 影 | 额外伤害（影祟怕光与火） |
| 水 | 燃烧 | 熄灭 + 蒸汽 |
| 水 | 任意 | 湿润 12 秒（湿了点不着、导电、更易冻结） |
| 水 | 灯/火盆 | 熄灭 |
| 冰 | 湿润的生灵 | 冻结（6 秒，重击会碎裂造成 3 倍伤害） |
| 冰 | 水面 | 结出可站立的浮冰（约 30 秒后融化，遇火更快） |
| 冰 | 燃烧 | 熄灭 |
| 风 | 刚体 / 轻物 / 生灵 | 推开、吹飞；纸和布飞得最远 |
| 风 | 燃烧 | 火势顺风蔓延；小火可能被吹灭 |
| 风 | 影瘴（雾） | 吹散 |
| 雷 | 湿润 / 水面 / 金属 | 感电并向 8 m 内其他导体连锁 |
| 雷 | 干燥的树/木 | 劈裂并点燃 |
| 雷 | 石 / 晶 | 崩碎 |
| 岩 | 冻结 | 击碎（3 倍伤害） |
| 岩 | 地面 | 隆起岩柱 / 陨星砸出坑（`G.world.deform`）|
| 日 | 影 / 影瘴 | 净化（2 倍伤害、驱散） |
| 日 | 灯 / 镇灯 | 点亮 |
| 日 | 晶 | 折射、共鸣发光（机关） |
| 日 | 冻结 | 缓慢解冻 |
| 月 | 刚体 | 可被「月引」抓取 |
| 月 | 影 | 影祟在月光下变强（别对它们用月） |

**连带规则**：燃烧处上方有上升气流（光翼滑翔可借力）；雨（祈雨）范围内持续灭火并使一切湿润；坑低于海平面会自己积水；城镇与神社有 **结界**（`G.world.protectionAt`）——地面不会被烧也不会被炸出坑，但里面的器物仍然可以互动。

**「契」**：每次引发元素反应（蒸汽、碎冰、连锁感电、净化、顺风火……）积攒「契」，攒满可放终极灵诀「金环」。鼓励玩家搭配元素。

### 3.3 灵诀
状态存于 `G.state.spells[id]`：0 未学，1 会小式，2 会大式。`G.state.abilities` 记录非元素能力。

| id | 名 | 小式（点按） | 大式（蓄力） |
|---|---|---|---|
| charm | 灵符 | 左键：自动追踪的纸符，轻微日属性，无消耗 | — |
| fire | 火 | **狐火**：火球，爆炸半径 3，点燃。灵力 12 | **炎舞**：大火球半径 7，留下火圈。30 |
| water | 水 | **涟珠**：水珠，溅射半径 4，灭火、打湿、轻推。10 | **祈雨**：在目标处唤来半径 18 的雨云 20 秒。28 |
| ice | 冰 | **霜华**：冰枪，穿透；冻住湿润目标；打到水面结浮冰。12 | **冰镜**：目标处半径 8 冰爆；陆地上升起冰台。30 |
| wind | 风 | **旋风**：前方 12 m 锥形阵风，推飞、助火、偏转飞弹。8 | **龙卷**：目标处生成半径 5、高 40 的上升气流 14 秒。26 |
| thunder | 雷 | **落雷**：0.35 秒预兆后劈中准星处（40 m 内）。16 | **鸣神**：半径 10 内连落五雷加一道主雷。36 |
| earth | 岩 | **岩起**：准星处地面升起半径 2.4、高 6 的岩柱（可把自己或敌人顶起来；25 秒后崩塌；最多 4 根）。14 | **陨星**：1.2 秒后陨石坠地，半径 9 爆炸，砸出深 4 的坑。45 |
| sun | 日 | **日辉**：自身周围半径 9 的光爆，净化影祟、点亮灯火，留下一团光 10 秒。20 | **天照**：按住持续射出光束（22/秒）；与敌方光束相撞进入 **对波** |
| moon | 月 | **月引**：抓起准星处的物体（或小型敌人）悬在身前，再按右键投掷、左键放下。6 + 4/秒 | **月晕**：目标处半径 10 的缓时结界 8 秒，里面的敌人、飞弹、物体只有 25% 速度。34 |
| broom | 唤帚 | F：召唤星帚骑乘飞行。巡航不耗灵力，加速与急升消耗 | |
| wings | 光翼 | 空中按住空格：背后展开光之翼滑翔，遇上升气流会被托起 | |
| guard | 结界 | R：身前光盾减伤 80%；展开 0.25 秒内接到飞弹则弹反 | |
| dodge | 闪身 | Q：冲刺 6 m，0.35 秒无敌 | |
| shikigami | 式神 | Z：召唤两只纸鹤助战 30 秒。35 | |
| kinkan | 金环 | G：「契」满时，从天上的金环引下光柱，半径 14 | |

**飞弹相克**：敌我飞弹在空中相撞会按反应表抵消/爆炸（火×水=蒸汽爆，火×冰=互消，雷穿过水弹会连锁……），强的一方带着剩余威力继续前进。**对波**：两道持续光束相撞时出现角力条，连点左键推进，输的一方吃下爆炸。

### 3.4 数值基线
- 主角：生命 100（+20×5），灵力 100（+20×5）。步行 5.5 m/s，疾跑 8.5，跳跃初速 7.5（重力 22），空中可二段跳一次。
- 灵力回复：6/秒 × 日照（`G.env.light`）；常夜中很慢，但在点亮的灯 14 m 内 +10/秒。——**把光带进黑夜** 是全游戏的节奏。
- 扫帚：巡航 16 m/s，加速 28（灵力 12/秒），升降 9 m/s，上限高度 300。灵力空了会缓缓下降。
- 灵符：伤害 12，每秒 3 发。其余法术伤害大致 = 灵力消耗 × 2.2。
- 影祟在黑暗中更强（攻击 ×(1+0.5·veil)），在光照（`G.elements.lightAt`）中变弱变慢。

### 3.5 敌人
影祟（材质 shade）：**影团**（慢，近战）、**影狼**（快，扑咬）、**灯蛾**（飞行，吐暗弹，被光吸引）、**鬼火**（漂浮，自爆点火）、**晶傀**（石材质重型，砸地；雷/岩可崩碎护甲）、**影巫**（施法者，会用暗弹 + 一种元素，会与玩家对轰）。曦光原只有淘气的 **纸魅**（纸材质，一点就着）。

对决者（人形施法者，与玩家同一套灵诀，可对轰）：阳葵（火）、九重（风）、六花（冰）、鸣（雷）、胧夜（月+全部）。

首领：**胧牙**（影狼王，千年枫）、**灯喰蛾**（巨蛾，镜心屿）、**胧夜 → 无明**（月读宫，两阶段）。

### 3.6 主线
| 任务 id | 内容 |
|---|---|
| m0_shrine | 序章。神社醒来 → 婆婆教灵符与日辉 → 练习场净化纸魅 → 与阳葵对决教学（学火、结界）→ 开箱得星帚，穿过 6 个试飞环 |
| m1_village | 朝颜村草垛失火 → 向阿汐学水 → 灭火（元素教学）|
| m2_dusk | 过暮桥进薄暮林 → 狐火之里见葛叶；九重教风与光翼 → 清除千年枫周围三处影巢（烧掉影棘）→ 击败胧牙 → 用火点亮 **暮灯** |
| m3_town | 进入常夜 → 万灯镇见烛；镇灯塔熄了：去萤茸林取三簇萤火 → 镇上重新亮起，商店开张；向鸣学雷 |
| m4_mirror | 镜湖：镜姬教月引 → 点亮湖面三盏莲灯（浮冰或扫帚）→ 击败灯喰蛾 → 点亮 **镜灯** |
| m5_crystal | 星晶野：用月引/日光转动三枚晶柱让光汇到灯上（期间晶傀来袭）→ 点亮 **晶灯**；磐翁教岩 |
| m6_moon | 三灯齐亮，月读宫的月障消散 → 飞上石峰 → 胧夜对决 → 无明 → 点亮 **月灯** → 结局 |

支线：找回五只小狐狸、三场扫帚竞速、重燃十二盏石灯笼、村里孩子的风筝（浮空岛）、夜市食材、向日葵之丘的画师、雪山学冰（六花）、十枚绘马（世界观碎片）、二十四滴月之泪（隐藏收集，4 滴换一次强化）。

### 3.7 存档
全部进度在 `G.state`（见 `src/core/save.js` 的 `defaultState()`，新增持久字段必须加在那里）。检查点：神社手水舍、各村存灯、点亮的石灯笼。死亡在最近检查点复活。地形坑洞不存档（大地会自己愈合）。

## 4. 美术

- **观感**：卡通渲染的开放世界——柔和色块、三四阶色阶、会随风摆动的大片草、远景薄雾、辉光。不要写实 PBR。
- **材质**：统一用 `src/core/mats.js`：`toon(color)`（默认）、`flat(color)`（岩石/屋顶/晶体的硬面）、`glow(color, strength)`（自发光并触发辉光：灯纸、发光菌盖、眼睛、魔法）。调色板 `PAL`。
- **自己 new 的受光材质**（地形着色器、实例化植被、水面等不是从 `toon/flat` 来的）必须调用 `hookMaterial(mat)`（`core/mats.js`）：天空系统靠这个钩子给所有材质注入「月帷着色」（站在日光下也能看见远处帷下的土地是暗的）和阴影设置。自发光/无光照材质不用。
- **几何**：`src/core/geo.js` 的 `box/cyl/cone/sphere/ico/torus/grp`，多个图元拼成的静态物体 **必须** 用 `bakeStatic(group)` 合并后再加入场景。
- **三地色调**：曦光原=明亮草绿+暖白日光；薄暮林=橙红枫叶+金色斜光+紫色阴影；常夜原=深蓝墨绿底色，靠青/紫/粉的自发光与暖橙灯火点亮，天上挂着金环。亮度随 `G.env.veil` 连续过渡。
- **夜里必须看得清**：常夜原的环境光不能低到一片黑；主角随身有一盏灯。
- 光照单位是物理单位（three r155+）：日光 DirectionalLight 强度约 2–3，点光源 `PointLight(color, 强度 20–200, 距离, 2)`。同屏动态点光源 ≤ 6 个（靠 `glow` 材质 + 辉光表现"亮"，不要给每盏灯一个真光源）。
- 外部模型经 `G.assets.model(id)` 取得，已自动转成卡通材质。清单见 §4.1（资源侦察完成后补全）。

### 4.1 资源清单
完整清单与每项的说明在 `assets/manifest.json`（用 `G.assets.info(id)` 读），来源授权见各项的 `license/author/source`。
- **人物（已入库）**：全部是同一家族的动漫风人形（CC0 VRoid 样例改色），共用一套骨骼命名与一个动作库。
  - 主角 `char_akari`（1.55 m）。配角：`char_granny`, `char_himawari`, `char_ushio`, `char_kokonoe`, `char_kuzunoha`, `char_rikka`, `char_naru`, `char_shoku`, `char_kagami`, `char_oboroyo`, `char_villager_a`, `char_villager_b`, `char_villager_c`, `char_fox_a`, `char_fox_b`, `char_town_a`, `char_town_b`。
  - 动作库 `anim_ual`（84 个动作，原地播放、不带位移；`G.assets.clips('char_xxx')` 会自动并入）。每个状态该用哪个动作、坐姿/游泳的高度约定、
    非主角需要按 `hipsHeight/0.887` 缩放髋部位移轨道——都写在 `assets/manifest.json` 的 `anim_ual.notes` / `clips` 里，**用之前先读**。
  - 每个角色的 `bones`（head/chest/hips/handR/handL/spine 的骨骼名）、`morphs`（表情：眨眼、喜怒哀等）、`hipsHeight` 在清单里。
  - 道具 `prop_gohei`（御币）、`prop_broom`（星帚，尾部挂小灯笼）。
  - 影祟里的人形（影巫）直接用这些人物换成全黑材质 + 发光眼睛。
- **植被 / 建筑器物 / 生物 / 音频**：整理中，入库后同样进 `assets/manifest.json`（前缀 tree_ plant_ rock_ nat_ bld_ prop_ mon_ ani_ tex_ bgm_ amb_ sfx_）。

## 5. 技术架构

### 5.1 目录与归属
```
build.mjs                 构建（index.html + game.js + assets/）
systems.manifest.json     系统清单：初始化顺序 = 每帧更新顺序
tools/play.mjs            无头 Chrome 运行/脚本/截图（§7）
tools/glbview.mjs         模型检视与预览
assets/                   manifest.json + models/ audio/ textures/
src/core/                 【核心，已完成，勿改】game boot input events save interact assets mats geo util fallback i18n
src/locales/zh-CN/        词条：core.js world.js【核心】 + 各系统自己的 <系统名>*.js
src/world/ground.js       【核心】地形高度、平台、碰撞体、地形变形、分区
src/world/veil.js         【核心】月帷规则、日/月方向
src/data/world.js         【核心】地图数据
src/<system>/…            各系统（每个系统一个目录，归属见清单）
```
系统顺序：`fx, audio, ui, physics, elements, sky, terrain, flora, structures, props, gameplay, player, spells, combat, story`。

### 5.2 系统对象
```js
// src/<dir>/<name>.js
import { G } from '../core/game.js';
export const fooSystem = {
  name: 'foo',
  pausable: true,                 // false = 暂停菜单中也照常收到真实 dt（ui/audio）
  async init(G) {},               // 建好静态内容，把公开 API 挂到 G.foo。此时 G.state 只是默认值，不要读存档内容
  start(G) {},                    // 标题画面之后、G.state 已是最终存档/新档时调用一次：按存档恢复自己的状态
  update(dt, rdt) {},             // 每帧。dt=游戏时间步长（暂停时为 0），rdt=真实步长
  lateUpdate(dt, rdt) {},         // 相机更新之后。做世界→屏幕投影的放这里
};
```
每帧顺序：`env 刷新 → 各系统 update → G.interact.update → G.cam.update(dt, rdt) → 各系统 lateUpdate → G.renderFrame() → input.endFrame`。

**规矩**
- 访问别的系统一律可选链：`G.fx?.burst(...)`、`G.audio?.sfx(...)`、`G.ui?.toast(...)`。任何系统缺席时自己都不能崩（子集构建靠这个）。
- `update` 里不要抛异常、不要每帧 `new` 大量对象（复用临时向量）、不要每帧遍历全场景。
- 不要缓存 `G.state` 或其子对象的引用（开始游戏时整个对象会被替换）。
- 模式 `G.mode`：`title | play | talk | menu | cutscene | ending`。只有 `play` 时玩家可操作、敌人才行动；`menu` 时 dt=0。用 `G.setMode()` 切换。
- 需要让画面顿一下：`G.hitstop(0.06)`。
- 出错上报 `G.reportError('where', err)`（测试会读 `G.errors`）。
- URL 参数（测试用）：`autostart=1` 跳过标题且不写存档；`pos=x,z`；`cam=px,py,pz,tx,ty,tz`；`quality=low|med|high`；`mute=1`。
- 画质 `G.quality = { pixelRatio, shadowSize, bloom, density, particles, viewDist }`，数量类参数请乘上它。

### 5.3 核心 API 速查（已实现）
```js
G.world.heightAt(x,z)            // 地形高度（含变形）      baseHeightAt 不含变形
G.world.groundAt(x,z,y=∞)        // 脚下可站立面：地形或不高于 y+0.7 的平台顶
G.world.normalAt / slopeAt / isWater(x,z) / sample(x,z)->{h,veil,slope,road,river,region,water}
G.world.veilAt(x,z) / daylightAt / regionAt / majorAt / roadDist / riverDist / mountainMask
G.world.isReserved(x,z,pad)      // 聚落/锚点/道路/桥/灯位：这里不许撒植被和杂物
G.world.protectionAt(x,z)        // 0..1 结界强度；isProtected(x,z)
G.world.deform(x,z,r,amount,{rim}) // 改变地形（负=挖坑 正=隆起），会发 'terrain:deformed'
G.world.addPlatform({x,z,r,top}|{box:true,x,z,hw,hd,rot,top})   // 可站立的平面（浮空岛、桥面、台基、屋顶）
G.world.addCollider({x,z,r,y0,y1}|{box:true,x,z,hw,hd,rot,y0,y1}) // 侧向阻挡（墙、柱、树干、大石）
G.world.resolveCollisions(pos, radius, height)  // 把竖直胶囊推出所有碰撞体
G.world.raycastGround(origin, dir, maxDist)     // 对地形+平台步进求交
G.world.anchor(id) -> Vector3    G.world.at(x,z) -> Vector3   G.world.POI / ANCHORS / SKY_ISLES / ...
G.env = { veil, light, region, regionName, major, focus, sunDir, moonDir }
G.input.held/pressed/released(action)   moveX moveY lookX lookY wheel locked   consume(action)   keyLabel(action)
G.events.on(name, fn) -> off     emit(name, payload)     once
G.save.write() / load() / exists()      addItem(G,id,n) itemCount setFlag hasFlag   （从 core/save.js 导入）
G.interact.add({ pos|getPos, radius, prompt, onInteract, enabled, priority, broom }) -> { remove() }
G.assets.model(id) / clips(id) / has(id) / info(id) / load(id) / arrayBuffer(id) / texture(id) / toonify(obj)
G.hitstop(sec)   G.setMode(mode)   G.reportError(where, err)   G.debug.teleport(x,z,y) / setCam(...) / stats()
```

### 5.5 文字与多语言（i18n）
```js
import { t, raw, has, onLocaleChange } from '../core/i18n.js';     // 也可用 G.t
t('ui.hud.mana')                          // -> '灵力'
t('gameplay.got', { item: name, n: 3 })   // 词条里写 '获得 {item} ×{n}'
raw('story.dlg.granny_intro')             // 取结构化数据（数组/对象），对白脚本、列表用这个
```
- 词条文件：`src/locales/zh-CN/<命名空间>.js`，`export default { 键: '文字', 分组: { 键: '…' }, 列表: [ … ] }`。**文件名就是命名空间，必须以所属系统名开头**：`ui.js`、`story.js`、`story.quests.js`、`spells.js`……（`core.js`、`world.js` 属于核心）。构建时自动发现，无需手动登记；子集构建只带上所选系统的词条。
- 地名：`t('world.place.' + id)`（区域 id 与 POI id 通用），副标题 `t('world.sub.' + id)`；八象名 `t('core.element.fire')`；状态名 `t('core.status.wet')`；按键名用 `G.input.keyLabel(action)`。
- 在**需要显示时**调用 `t()`，不要在模块顶层求值存成常量（语言可在运行时切换；UI 监听 `onLocaleChange` 重绘）。
- 对白/任务/图鉴这类大段文字：结构和文字一起放在词条文件里（每行 `{ who, text }`、选项、以及用 id 引用的逻辑钩子如 `{ do: 'give_broom' }`），代码只按 id 执行钩子。翻译时只改 `text`。
- 字体：标题/正文字体栈取 `t('core.meta.fontTitle')` / `t('core.meta.fontBody')`（设成 CSS 变量），不要把字体名写死在样式里。
- 检查：`node tools/check-i18n.mjs src/你的目录` —— 代码（注释除外）里出现中日文字符即报错；词条里出现 §0 的禁用词也报错。交付前必须通过。

### 5.4 事件表
发出者负责按此格式发；监听者只依赖这些字段。
```
game:start {loaded}            mode:changed {mode,prev}        region:enter {id,name,prev,major}
resize {w,h}                   settings:changed settings        save:collect state / save:done
input:lockLost / input:lockGained
terrain:deformed {x,z,r,amount,x0,x1,z0,z1}                    terrain:scorch {x,z,r,kind:'burn'|'wet'|'frost'}
inventory:changed {id,count,delta}    flag:set {name,value}
player:jump / player:land {speed} / player:step {surface} / player:dodge / player:mount / player:dismount / player:glide {on}
player:damaged {amount,element,from} / player:died / player:respawn / player:healed {amount}
player:outfit {id}             // 衣装换好了（src/player/wardrobe.js；docs/api/heroine.md "Wardrobe"）
spell:cast {caster,spell,form,pos,dir,team} / spell:learned {id,level} / spell:select {id}
spell:clash {pos,a,b,result}   beam:struggle {state:'start'|'end', winner}
element:applied {element,pos,radius,power,team} / element:reaction {type,pos,power}   // type: steam melt shatter conduct ignite extinguish purify freeze thaw
element:ignite {reactor} / element:burnout {reactor}
physics:impact {body,other,speed,pos}       prop:broken {type,pos,by}
enemy:spawned {enemy} / enemy:hit {enemy,amount,element,pos} / enemy:killed {enemy,type,pos,by}
boss:start {id,name} / boss:phase {id,phase} / boss:defeated {id}        duel:start {id} / duel:end {id,won}
item:collected {id,kind,pos}   lantern:lit {id} / lantern:out {id}   greatlantern:lit {id}   checkpoint {id}
quest:started {id} / quest:updated {id,step} / quest:completed {id}
dialogue:start {id} / dialogue:end {id}      race:start {id} / race:finish {id,time,best}
```

## 6. 模块契约

> 签名是约定；内部怎么做由负责人决定。带 ★ 的是别的模块一定会调用的入口，名字和参数不能改。

### 6.1 physics（`src/physics/`）→ `G.physics`
Rapier 世界；固定步长 1/60（累加器，单帧最多 4 步，dt=0 时不走）；网格插值同步。
```js
G.physics.RAPIER, .world
★ add({ mesh, shape:'box'|'sphere'|'cylinder'|'capsule'|'hull', size, pos, quat?, type:'dynamic'|'fixed'|'kinematic',
        material:'wood'|'stone'|'metal'|'ice'|'paper'|'cloth'|'flesh', density?|mass?, friction?, restitution?,
        ccd?, lifetime?, group:'prop'|'debris'|'character'|'projectile', owner?, onImpact?(other, speed) }) -> PhysBody
   // size: box=[hx,hy,hz] sphere=r cylinder/capsule={r,h}（h 为总高）hull=由 mesh 几何算凸包
★ remove(body)
   PhysBody { rb, mesh, mass, material, owner, pos:Vector3(只读镜像), vel:Vector3(只读镜像), sleeping, submerged(0..1),
              applyImpulse(v3), applyImpulseAt(v3, point), setVelocity(v3), setPosition(v3), setKinematicTarget(pos, quat?),
              wake(), held(由月引抓住时为 true) }
★ explode(pos, radius, impulse, {up=0.35, exclude}) -> PhysBody[]      // 径向冲量，线性衰减
★ pushCone(origin, dir, range, halfAngle, impulse) -> PhysBody[]       // 阵风
★ raycast(origin, dir, maxDist, {dynamicOnly=false, exclude}) -> {dist, point, normal, body|null} | null   // 含地形与静态体
★ overlapSphere(pos, r, cb(body))
★ supportAt(x, z, y, maxDrop=1.6) -> {y, body} | null    // 脚下最近的刚体顶面（站在箱子/浮冰/原木/岩柱上）
★ addCharacter({ getPos, radius, height, owner }) -> handle{remove()}   // 运动学胶囊，跟随角色，使器物会撞到角色/被角色推开
   count, maxDynamic(≈260，超出先移除最老的 debris)
```
- 地形：围绕"活动点"（玩家 + 未休眠刚体）按块懒建高度场；监听 `terrain:deformed` 重建受影响的块。
- 静态体：自动镜像 `G.world.addCollider/addPlatform` 登记的一切（init 时已有的 + 之后新增的；`dead=true` 的移除）。
- 浮力：低于海平面的部分受到与浸没体积成正比的浮力和阻力（密度：木 0.55、纸 0.2、冰 0.9、石 2.6、金属 7）；`submerged` 供别人读。
- 风：每步对未休眠刚体施加 `G.elements?.windAt(pos)` 的力（轻物明显，重物几乎不动）。
- 月晕缓时：`G.physics.timeBubbles`（由 spells 填）范围内的刚体速度被压到 25%。
- 强碰撞发 `physics:impact`（speed > 4 m/s，节流）。

### 6.2 elements（`src/elements/`）→ `G.elements`
```js
ELEMENTS, MATERIALS   // 常量与每种材质的默认属性 { flammable 0..1, burnTime, conductive, freezable }
★ register({ owner, kind:'prop'|'tree'|'plant'|'creature'|'lantern'|'structure'|'hazard', material, pos|getPos, radius, height?,
             team?:'player'|'enemy'|'neutral', flammable?, burnTime?, conductive?, freezable?, immune?:[status...],
             on:{ ignite, extinguish, burnTick(r,dt), burnout, wet, dry, freeze, thaw, shock(r,power), hit(r,element,power,info), light(r,power) } }) -> Reactor
★ unregister(reactor)
   Reactor { owner, material, burning, wet, frozen, shocked, lit,   // 剩余秒数或 0/false
             ignite(), extinguish(), soak(sec), freeze(sec), thaw(), shock(power), is(status) }
★ apply(element, pos, radius, power=1, info={ source, team, dir, damage?, noGround? }) -> Reactor[]   // 唯一入口：按 §3.2 反应表处理范围内一切
★ igniteGround(x,z,r) / extinguishGround(x,z,r) / isBurningAt(x,z) / fireCount
★ rain(x,z,r,duration) / isRainingAt(x,z)
★ addWind({ kind:'updraft'|'gust', pos, dir?, radius, height, strength, duration }) -> handle{remove()}
★ windAt(pos, out) -> Vector3        // 全局微风 + 风场 + 火上方的上升气流
★ freezeWater(x,z,r,duration=30) -> 生成浮冰（刚体 + 可站立）
★ lightAt(pos) -> 0..1               // 日照 + 燃烧物 + 点亮的灯 + 光球；影祟用它判断强弱
★ addLight({ pos, radius, duration? }) -> handle   // 登记一个光源（点亮的灯、日辉留下的光团）
   query(pos, r, cb(reactor)) / nearest(pos, r, filter)
   gauge 相关由 spells 监听 'element:reaction' 自行累计
```
- 草地火：2 m 格，只记录燃烧中的格子（Map），蔓延受风向、湿润、雨、结界影响；同时燃烧上限 ≈ 420 格；烧过发 `terrain:scorch`。火焰用实例化广告牌自绘，自带少量（≤4）动态点光。
- 伤害不在这里结算：通过 `on.hit / on.burnTick / on.shock` 回调交给拥有者（玩家、敌人、器物各自扣血/碎裂）。`info.damage` 是施加者给的基础伤害。
- 所有反应发 `element:reaction`，并调用 `G.fx?.burst('steam'|…)`、`G.audio?.sfx(...)`。

### 6.3 fx（`src/fx/`）→ `G.fx`
GPU 粒子池（加色/柔和两类，≤ 8000 粒）、拖尾、冲击环、光束、闪光、屏幕震动。
```js
★ burst(name, pos, opts?)          // 一次性效果；未知 name 静默忽略（只 warn 一次）
★ emitter(name, opts?) -> { pos:Vector3, dir?:Vector3, rate, active, stop(), remove() }   // 持续发射器，改 pos 即移动
★ trail(opts) -> { push(pos), stop() }          // 带状拖尾（扫帚、灵符、光翼）
★ ring(pos, { color, radius, dur, y? })         // 贴地扩散环
★ beam(opts) -> { set(from, to), setWidth(w), remove() }   // 持续光束（天照/对波）
★ lightning(from, to, { color, branches, dur })
★ flash(pos, color, intensity, dur, distance?)  // 临时点光（池化，≤4）
★ shake(amount, dur?)                           // 屏幕震动（尊重 G.settings.shake），相机读取 G.fx.shakeOffset
★ text(pos, string, { color, size, dur })       // 世界空间飘字（伤害数字等）
```
必备 burst 名：`hit_sun hit_dark hit_fire hit_water hit_ice hit_wind hit_thunder hit_earth hit_moon purify steam splash shatter_ice shatter_rock wood_break dust land jump dash pickup heal levelup ignite extinguish explosion explosion_big spark leaves petals feathers magic_circle summon charge_done lantern_ignite greatlantern meteor_trail crater boss_death clash clash_big`。
必备 emitter 名：`flame smoke embers rain snow fireflies spores pollen maple_leaves broom_sparkle wing_dust aura_<element> updraft waterfall_mist miasma`。
环境粒子：按 `G.env.major` 在主角周围自动维持（曦光：花粉与花瓣；薄暮：落叶；常夜：萤火与孢子）。

### 6.4 audio（`src/audio/`）→ `G.audio`
WebAudio；首次用户输入后 `resume`；`G.params.mute` 时静音；音量读 `G.settings`。
```js
★ sfx(name, { pos?, vol=1, pitch=1, delay? })     // 未知 name 静默忽略；带 pos 时按距离衰减/声像
★ loop(name, { vol, pos? }) -> { setVol(v), setPos(p), stop(fade?) }
★ music(mood | null, { fade=2 })                  // 一般不用手动调：系统会按 G.env.major、G.env.region、战斗/首领事件自动切换
   unlock(), setVolumes()
```
曲目与音效来自 `assets/`（id 前缀 `bgm_ amb_ sfx_`），缺的用程序合成兜底。自动环境声：风、鸟、虫鸣、水声（靠近河湖）、火声（靠近燃烧）、扫帚风声（随速度）。

### 6.5 ui（`src/ui/`）→ `G.ui`
DOM 叠加层（`G.uiRoot`）。和纸、墨、朱红、金的日式绘卷风；标题字体用系统宋体/明朝体（`"Songti SC","Hiragino Mincho ProN","Noto Serif CJK SC",serif`）。
```js
★ showTitle({ hasSave, saveInfo }) -> Promise<'new'|'continue'>      // 标题画面（含设置、操作说明）
★ toast(text, { icon?, dur=3 })           ★ banner(title, subtitle?)        // 地区入场横幅
★ prompt(text | null)                      // 屏幕下方互动提示（核心的 interact 会调）
★ say({ name, text, portrait?, choices?:[string], side? }) -> Promise<number|undefined>   // 对话框，打字机效果，E/空格/点击推进
★ setTracker({ title, objective, progress? } | null)                // 当前任务追踪
★ setMarkers([{ id, pos:{x,y,z}, icon, color, label?, kind:'quest'|'lantern'|'npc'|... }])   // 罗盘条 + 屏幕边缘指示
★ bossBar({ name, hp, max, sub? } | null)  ★ duelBars(...) 可并入 bossBar
★ struggle({ value:0..1 } | null)          // 对波角力条
★ fade(alpha, dur) -> Promise              ★ letterbox(on)                  // 过场黑边
★ openShop({ title, items:[{id,name,desc,price,icon,owned?,max?}], currency:()=>number, onBuy:(id)=>boolean }) -> Promise
★ openMenu(tab?:'map'|'journal'|'spells'|'items'|'wardrobe'|'settings') / closeMenu() / isOpen     // wardrobe = 衣装页（src/ui/wardrobe.js）
★ learnSpell({ id, name, desc, element })  -> Promise                // 学会灵诀的大字演出
★ showEnding(data) -> Promise
   providers: { journal:()=>[{id,title,desc,state,main,objectives:[{text,done}]}], mapMarkers:()=>[{x,z,icon,label,kind}],
                items:()=>[{id,name,desc,count,icon}], lore:()=>[{id,title,text}], spells:()=>[{id,name,desc,level,element}] }
```
HUD 自己每帧读取：`G.player`（hp/maxHp/mana/maxMana/onBroom/gliding/status）、`G.state.inventory`、`G.spells?.selected/list/gauge/charge`、`G.combat?.lockTarget`、`G.env`。准星常驻。Esc / 指针锁丢失 → 暂停菜单。菜单打开时 `G.setMode('menu')` 并 `G.input.exitLock()`。

### 6.6 sky（`src/world/sky.js`, `src/render/`）→ `G.sky`, `G.lights`
天穹着色器：日轮固定（`SUN_DIR`），月轮位置随观察点变化（`G.env.moonDir`），月轮遮住日轮时只剩金环与日冕；随 `G.env.veil` 从晴空 → 黄昏 → 星夜（星、天河、金环周围的帷幕状极光）；有体积感的云层。灯光：日光、半球光/环境光、带高度衰减的雾，全部随 veil 过渡。

渲染管线（按 `G.quality` 分档，全部可在设置里关）：**级联软阴影**（3 级，近处清晰、远山也有影）、**屏幕空间环境光遮蔽**（GTAO）、**辉光**、**体积光束**（日轮/金环方向的径向光柱，常夜里从金环洒下）、**景深**（仅过场/对话）、**色调映射 + 三地各自的调色**（曦光明快、薄暮暖金带紫、常夜冷青）、抗锯齿（SMAA/FXAA）。水面反射由 terrain/water 负责（平面反射或屏幕空间反射 + 菲涅尔）。替换 `G.renderFrame`；后期链对外暴露 `G.post = { composer, setDOF(on, focusDist), setGrade(name), enabled }`。
```js
G.lights = { sun, hemi, ambient? }      G.sky.flash(color, dur)      G.sky.setRingBoost(k)   // 结局金环大亮
G.sky.setWeather({ rainAt? })  可选   G.sky.exposure
```

### 6.7 terrain / flora / structures / props
- **terrain**（`src/world/terrain.js`, `water.js`）：按 `heightAt` 生成地形网格（近处细、远处粗或分块），顶点色按生物群系/veil/坡度/道路/雪线；监听 `terrain:deformed` 局部更新（坑内露出泥土色），监听 `terrain:scorch` 改色；水面着色器（海、湖、河、月池；常夜下泛微光）。`G.terrain.refresh(x0,x1,z0,z1)`。
- **flora**（`src/world/flora.js`）：实例化植被（三地各自的树、灌木、花、巨菇、晶簇、岩石）+ 主角周围的动态草；树干/大石登记碰撞体；**每棵树、每块可碎岩石都是元素反应体**：可点燃（烧成焦木）、可被雷劈/陨星/强风放倒（生成 `log` 刚体，见 props）、岩石可崩碎；坑里的植被消失。避开 `G.world.isReserved`。
  `G.flora.treesNear(pos, r)`、`G.flora.fell(tree, dir)`、`G.flora.removeInRadius(x,z,r)`。
- **structures**（`src/world/structures.js`, `builders/`）：神社、村、狐里、万灯镇、月读宫、风祠、桥、浮空岛（顶面登记平台）、码头、千年枫巨树等；登记碰撞体与平台；窗纸/灯笼用 `glow`。导出给别人用的模型工厂：`makeStoneLantern()`、`makeGreatLantern()`、`makePaperLantern()`、`makeTorii()`、`makeChest()`、`makeSignpost(text)`、`makeRaceRing()`、`makeBrazier()`——都返回 `{ group, setLit?(on) }` 之类的小对象。
- **props**（`src/props/`）→ `G.props`：可交互器物目录（木箱、木桶、爆竹桶、水瓮、陶罐、草垛、圆木 log、滚石、铁球、铁箱、推车、火盆、风铃、神社铃、灯笼、南瓜、苹果…），每个 = 模型 + 刚体 + 反应体 + 耐久/破碎（碎片是短寿命 debris 刚体）+ 掉落。
  `★ G.props.spawn(type, pos, { rot?, vel?, burning?, persistent? }) -> Prop`、`G.props.types`、`G.props.near(pos, r)`、`prop.damage(n, info)`、`prop.break()`。按数据在聚落与野外摆放。

### 6.8 player（`src/player/`）→ `G.player`, `G.cam`
```js
G.player = { group, pos(=group.position), vel, yaw, hp, maxHp, mana, maxMana, dead,
  state:'ground'|'air'|'glide'|'broom'|'swim'|'frozen'|'cutscene', grounded, onBroom, gliding, speed,
  radius:0.4, height:1.6, team:'player', reactor,           // 在 elements 登记的反应体（会燃烧/湿/冻/感电）
  aim: { origin, dir, point, dist, target },                 // 准星射线命中的世界点/目标，每帧更新
  ★ takeDamage(amount, { element?, from?, knock?, source? }), ★ heal(n), ★ spendMana(n)->bool, ★ addMana(n),
  ★ teleport(x,y,z), ★ setControl(on), ★ playAction(name, opts), ★ recalcStats(), invulnerable(秒),
  outfit, ★ setOutfit(id, { quiet }) -> Promise<bool>,      // 衣装：src/data/outfits.js 的 id；存档 G.state.outfit（docs/api/heroine.md "Wardrobe"）
  rig }                                                       // 她当前的模型（换装后是新的 rig：别缓存，用时读 G.player.rig）
G.cam = { yaw, pitch, dist, update(dt,rdt), ★ cinematic({ pos, look, dur, ease }) -> Promise, ★ release(), fovKick(k) }
```
自写运动学控制器：地面用 `G.world.groundAt` + `G.physics?.supportAt`，侧向 `resolveCollisions`，游泳、二段跳、闪身、光翼滑翔（读 `G.elements?.windAt`）、扫帚飞行（`G.world.ceilingAt`、高度上限）。在 physics 里登记角色胶囊。相机：第三人称跟随、防穿地、扫帚加速时拉远加 FOV、锁定目标构图、读取 `G.fx?.shakeOffset`。标题模式下环绕神社取景。

### 6.9 spells（`src/spells/`）→ `G.spells`
```js
G.spells = { list:[{id,name,element,level,cost,…}], selected, gauge(0..1), charge(0..1), holding(月引抓着的 body),
  ★ cast(spellId, form:'small'|'big', { caster, origin, dir, target?, point?, team, power=1 }) -> handle   // 玩家与 AI 共用
  ★ learn(id, level=1), ★ select(id), knows(id), projectiles:[…], beams:[…], timeBubbles:[…] }
```
读玩家输入（attack/cast/el*/wheel/guard/summon/ultimate）；灵力、冷却、蓄力；飞弹（含飞弹相克、被风偏转、被结界弹反）、落点通过 `G.elements.apply` + `G.physics.explode` + `G.world.deform` 生效；光束与对波；月引抓取；式神；金环。伤害经 `info.damage` 传给反应体拥有者。

### 6.10 combat（`src/combat/`）→ `G.combat`
生命/伤害结算、敌人 AI 与生成（营地数据 `src/data/camps.js`）、对决者 AI（调用 `G.spells.cast`）、首领、掉落、锁定。
```js
G.combat = { enemies:[…], lockTarget, inCombat, ★ spawn(type, pos, opts)->Enemy, ★ startBoss(id), ★ startDuel(id)->Promise<won>,
  ★ nearest(pos, r, filter), ★ damage(enemy, amount, info) }
Enemy { type, pos, vel, hp, maxHp, radius, height, team:'enemy', reactor, dead, stun(sec), … }
```

### 6.11 gameplay（`src/gameplay/`）→ `G.gameplay`
石灯笼与镇灯（可被火/日点亮、被水/风熄灭；点亮的是检查点与光源）、检查点与复活、拾取物与掉落（星屑、心、灵力珠）、宝箱、月之泪、绘马、竞速、月障、上升气流点、蹦床巨菇、晶柱机关、商店货品与强化。
`★ spawnPickup(kind, pos, n)`、`★ igniteGreatLantern(id)`、`★ setGreatLanternReady(id, on)`、`★ respawnPlayer()`、`checkpoints`。

### 6.12 story（`src/story/`）→ `G.quests`, `G.dialogue`, `G.npcs`
NPC（模型、待机、朝向玩家、互动）、同伴团子、对话脚本运行器、任务引擎（数据驱动，监听事件推进）、全部中文剧本、教学提示、过场（开场、学诀、点灯、结局）。
`G.quests.start/advance/isDone/active/tracker()`、`G.dialogue.play(id|lines) -> Promise`。

## 7. 工具与验证（每个人都要用）

```bash
node build.mjs --check src/你的文件.js [...]     # 只检查你的模块能否编译（别人的文件坏了不影响）
node tools/play.mjs --name 标签 --systems a,b,c --params "pos=-455,150" --script .tmp/你的脚本.js
node tools/glbview.mjs assets/models/x.glb --anim Idle
node tools/check-i18n.mjs src/你的目录            # 不许有写死的文字
```
- `play.mjs` 在私有的无头 Chrome 里真实运行游戏（静音、不碰玩家存档），执行脚本、截图到 `.tmp/play/<标签>/`，并打印控制台错误与 `G.errors`。**截图要用 Read 工具亲眼看**——"没有报错"不等于"好看/正确"。
- `--systems` 只构建列出的系统；缺席的系统由核心兜底（简易天空、粗地形、自由相机），所以你可以只带上自己的系统和已经完成的依赖。别人正在写的系统不要带。
- 脚本在页面内作为 async 函数体运行，可用 `T`（`frames wait key press look teleport cam shot errors stats`）和 `G`。
- 临时文件只放 `.tmp/`。不要启动常驻服务器，不要打开有界面的浏览器，不要动 `~/` 下其他项目。
- 只改自己归属的文件。需要核心增加东西时，在汇报里写清楚，不要自己动核心。

## 8. 性能预算（Apple Silicon，1440×900）

目标 60 帧。绘制调用 ≤ 500，三角形 ≤ 1.5M，动态点光 ≤ 6，阴影贴图 1 张（跟随主角 ±70 m）。粒子 ≤ 8000。动态刚体 ≤ 260。燃烧格 ≤ 420。敌人同时活跃 ≤ 24（40 m 外的休眠）。实例化一切重复物体；静态拼装物必须 `bakeStatic`。

## 9. 已完成系统与实现备注（以代码和 docs/api/*.md 为准）

已完成：**physics、elements、sky（含后期管线）、fx、ui**，以及人物资源。每个系统"实际做成什么样、确切 API、已知问题"在 `docs/api/<system>.md`，
动手前先读你要用到的那几份（比读源码省事）。几条容易踩的：
- `G.world` 的盒形平台/碰撞体 `rot` 现在与 `Object3D.rotation.y` 同向（已修正）；遍历 `platforms/colliders` 要跳过 `.dead`。
- `G.world.deform()` 在结界内（聚落、锚点附近）不起作用，测试挖坑要选野外。
- physics：`explode/pushCone` 的 impulse 是"25 质量参考木箱获得的速度(m/s)"；`supportAt()` 返回的是共享对象（用完即取值，别存引用）；
  被物理驱动的 mesh 必须直接挂在 `G.scene` 下；角色用 `addCharacter` 登记后会推开器物。
- elements：浮冰是 `G.world` 平台（physics 自动镜像成固定碰撞体）；地面火烧过会发 `terrain:scorch`（地形系统负责画焦痕）。
- sky：单张跟随阴影贴图（±70 m），没有级联；启用后期时色调映射在调色通道里做，别依赖 `renderer.toneMapping`；
  阴影靠各自的 mesh 设置 `castShadow/receiveShadow`；`G.lights = { sun, hemi, ... }`。
- fx：相机每帧定位后要加上 `G.fx.shakeOffset`（世界空间 Vector3），否则震屏无效；粒子没有软深度，贴地大光斑会被地面切掉，尽量抬高一点生成。
- ui：`showEnding` 结束后 `G.mode` 停在 `'ending'`，由剧情系统决定下一步；标题画面不控制相机（相机系统在 `G.mode==='title'` 时自己取景）。
- 画质 high 的像素比上限现为 1.5；设置项新增 `postAO/postBloom/postShafts`。

### 9.1 第二批完成后的补充
已完成：**terrain（含 water）、player（含相机、扫帚、光翼）、actors（共用人物骨架 `src/actors/rig.js` + 状态→动作表 `clips.js`）**；见 `docs/api/terrain.md`、`docs/api/player.md`。
素材已全部入库：`docs/assets-catalogue.md` 是带尺寸/面数/材质名/动作名的 id 速查表（526 项：人物、植被 98、建筑 27、器物 122、生物 38、特效贴图 33、音乐 12、环境声 10、音效 167）。
- 人物（NPC、对决者、人形敌人）一律用 `createActor(assetId, opts)`（`src/actors/rig.js`），不要自己写 AnimationMixer。
- 元素 `apply()` 现在默认**不误伤同队**（火/冰/雷/岩/月/风跳过 `team` 相同的反应体；水与日仍然生效；`info.friendlyFire = true` 可强制）。
- 吃团子回血（X 键）由 player 系统处理，别的系统不要再绑这个键。
- 同屏动态点光预算放宽到 10（fx 4 + elements 4 + 主角灯 1 已占 9）：新系统**不要再加常驻点光**，用 `glow` 材质 + 辉光表现亮，需要闪光用 `G.fx.flash`。
- 地形数据贴图（高度/路距/河距）与焦痕贴图可供其它着色器采样：`G.terrain.dataTexture` 等，布局见 terrain.md。
- 月读宫石峰已改成近乎垂直的崖壁（脚下有碎石坡），只能飞上去。
- GLSL 里不要写 `smoothstep(a, b, x)` 且 a > b（结果未定义，在辉光下会整屏变黑）；要反向就写 `1.0 - smoothstep(b, a, x)`。

### 9.2 第三批完成后的补充
已完成：**flora、structures、props、audio、spells**（`docs/api/*.md`）。至此世界、主角、法术齐备，剩下 combat、gameplay、story。
- **归属**：12 盏石灯笼、4 盏镇灯（连同灯座）、取帚的箱子、星晶野三根晶柱都由 structures 摆好，句柄在 `G.structures.stoneLanterns / greatLanterns / chests / crystalPedestals`
  （`.pos` 是真实位置，个别石灯笼为了让路偏移了 2 米）。gameplay 只驱动这些句柄（`setLit` / `open` / `setAngle`），不要再摆一份。
- **声音**：发声前先看 `src/audio/names.js`（`G.audio.has(name)`）。音频系统已经自动为这些事件配音：player:step、prop:broken、enemy:killed、item:collected、checkpoint、spell:clash、physics:impact 等——这些事件上别的系统不要再自己播一遍。
- **器物掉落**用的拾取物种类：stardust、heart、apple、roasted_apple、carrot、fish、grilled_fish、berry、mushroom、rice、pumpkin（gameplay 的 `spawnPickup(kind, pos, n)` 要认这些）。
- 新事件：`prop:ring {type,pos,prop}`（神社铃、风铃被敲响/吹响）。
- spells 给 combat 的约定：`enemy.held === true` 时（被月引抓住）跳过它自己的移动与 AI；`G.spells.timeBubbles`（`{pos,radius,scale,team}`）里对方阵营的敌人要按 scale 变慢；
  对决者施法用 `G.spells.cast(id, form, { caster, origin, dir|target|point, team:'enemy', power })`，持续光束传 `{ duration, strength }`。
- 巨菇伞盖是可站立平台，`G.flora.bouncePads` 给出弹跳点（主角落上去应被弹起）。
- 西海岸的平整地块（神社、练习场）高度已修正为数据里的精确值。测试脚本里用 `T.cam()` 定机位现在对所有系统的裁剪都生效。

### 9.3 画面升级一（2026-11-13）完成后的补充
目标从"低多边形纯色"改为"手绘质感的赛璐璐开放世界"。这一批重做了光照/阴影/表面细节、地表与草毯、植被、人物着色、水体；各自的实现与 API 在
`docs/api/look.md`、`terrain.md`、`flora.md`、`actors-look.md`（水体写在 terrain.md 的补充里）。动手前必读 look.md。容易踩的：
- **所有受光材质都走同一个光照模型**（`src/render/veilhook.js`）：赛璐璐明暗带 + 按地域着色的阴影 + 天光/地面反光 + 轮廓光。自己建的材质必须 `hookMaterial()`，
  并标注表面类别：`toon(color, { surface, look })` / `material.userData.surface`（paint wood plaster stone rock thatch tile cloth paper metal earth bark none）。
  不标注时按调色板颜色猜；自定义十六进制颜色猜不到，要显式写。带贴图、透明、蒙皮的材质不叠表面细节。
- 阴影是 3 级级联（low 为 2 级），外层隔帧刷新；只有 `directionalLights[0]` 参与光照，另外两盏零强度的灯只为持有阴影贴图，别动它们。
- 人物与生物在 `assets.toonify` 里自动走赛璐璐路径（`src/actors/celmat.js`：描边、双色调、发丝高光、弹簧骨）。人物 GLB 的 Body/Face/Hair/Eye 材质名不能改。
  `?celoff=1` 可回到旧着色做对比。
- 植被不再用低模素材：树、灌木、花草、岩石、巨菇、晶体全部由 `src/world/flora/procgen.js` 在开机时生成（`buildProcModel(G, key, sp)`），叶片贴图由画布绘制。
  其它系统要摆树就调它，不要再 `assets.model('tree_*')`。
- 草是相机周围 5 圈的实例化草毯，读取一张跟随相机的地表图；`G.flora`/`createGrass` 的 `clear()`、焦痕、爆风压草都保留。
- 水体：high 档有平面反射（隔帧刷新、只在近水时渲染）；`G.water.wake()`、`?water=legacy`。目前没有折射（需要后期管线提供不透明场景颜色与深度）。
- 着色器编译错误不会出现在 `T.errors()` 里，改着色器后要看控制台的 program 报错。
- 性能：这一批之后 high 档整帧约 200–360 万三角、500–1100 次绘制，超过原先 150 万/500 的预算；每个系统新增内容都要带 LOD/实例化并自测开销，最终统一压一轮。

### 9.4 升级二（2026-11-13）完成后的补充

六路并行（动作、服装与布料、建筑、器物、地貌、环境第二轮），细节见 `docs/api/{animation,cloth,structures,props,landforms,flora,terrain,look}.md`。跨系统必须知道的规矩：

- **动作库**：所有人形角色的清单条目 `clipsFrom` 必须是 `['anim_ual', 'anim_miko']`。调用方只写 `src/actors/clips.js` 里的逻辑状态名，不写片段名。
  片段绝不给 `J_Sec_*` 骨骼打关键帧（那是布料解算的地盘）。对白行带 `act` / `expr` 标签，译者只改文字。
- **服装**：角色 id 不变，`file` 指向 `_v2` 文件，旧文件在 `fileV1`（`?costume=v1` 仅供对比）。安装只用 `node tools/install-costumes.mjs`，
  它不会改 `clipsFrom`。服装材质名 `cloth_*` 与 `J_Sec_<Part>_<n>_<nn>` 骨链名不能改。磐翁是独立的 `char_banou`。
- **清单并发修改**：只用 `tools/manifest-patch.mjs`（加锁、合并），不要整文件重写，也不要用旧副本 `--replace` 角色条目。
- **图层 5 是"只投影"图层**（`PROXY_LAYER`）：远处建筑的简化投影体和角色的合并投影体都在这一层，只有阴影相机能看到。别的东西不许放进这一层；
  重建级联阴影灯时要给它们的 `shadow.camera` 打开图层 5。
- **建筑**：屋顶、梁柱、墙板、鸟居、石灯笼都来自 `builders/kit.js`（`makeRoof`、`stoneCourse`、`mat.<surface>()`）；建造代码里不写裸的 `toon(0x…)`。
  场地里的树用 `decor.js` 的 `procTree()`（由 `structures.js` 统一实例化）。碰撞体、平台、锚点位置一律不动。
- **器物**：素材包模型先过 `tools/refine-models.mjs`（细分、软边、烘焙遮蔽、收拢到调色板），成品在 `assets/models/refined/`，清单里有 `orig` 与
  `refined: 2`；`?propsv=1` 读原件做对比。手工器物用 `src/props/shapes.js`（圆角盒、倒角圆柱、车削体、绳环、木板箱、纸灯笼）。
- **地貌**是新系统 `landforms`（排在 flora 之后）：浮岛岩体、崖壁/露头/碎石坡、海蚀柱与拱、河石、雾见泉急流、远景山影与云海。
  浮岛的可行走顶面、平台和碰撞仍由 `builders/far.js` 负责（保留 `own` 分支和随机数调用顺序）。`?nolandforms=1` 可整层关闭。
- **环境**：远处的树是开机时从近景模型烘出来的八方向广告牌，一次绘制；水有屏幕空间折射（`G.post.captureOpaque()`）和岸边湿带；
  浮在开阔海面上的东西用 `water.surfaceAt()`，玩法判定仍用 `levelAt()`；high 档在 4× 多重采样之上加了 SMAA。
- **性能（未达标，留给升级三统一处理）**：high 档整帧约 210–360 万三角、500–930 次绘制；各路的毫秒数都是在机器满载时量的，不可靠。
  已知的大头：水面平面反射（每两帧约 114 次绘制）、万灯镇整块没有分块细节层次（俯瞰 44 万三角）、角色每人约 19 次绘制（没有合并图集）。

### 9.5 升级三（2026-11-13 夜）完成后的补充

六路并行（主角动作修正、生灵与环境生灵、地标建筑二轮、魔法特效、山体与地面二轮、天空光影与近景植物）。细节在各自的
`docs/api/*.md`（animation、cloth、life、actors-look、structures、fx、spells、elements、terrain、landforms、sky、look、flora）。跨系统规矩：

- **骨骼的程序化修改**一律放在 `rig.update()` 里 `mixer.update` 之后，并且可以假定起点是干净的片段姿势（`forceRewrite` 保证每帧重写）。
  腿部 IK 只走 `legTwoBone`（自带"膝盖不高于髋、不过伸"的保护）。施法的全身叠加表是 `clips.js` 的 `CAST_BODY`，只读片段的 release 标记，不改出手时机。
- **测试镜头**：`T.viewCam(...)` / `T.orbitCam(...)` 只负责画面，不驱动瞄准；`T.cam(...)` 维持旧行为（会带着瞄准走）。
- **生灵**：游戏里实际出场的只有 5 种怪物模型与 12 种动物；影团、纸魅、鬼火是手工建模。蒙皮生灵量包围盒前必须先摆好骨架（否则单位是厘米）。
  环境生灵是纯视觉的新系统 `life`（排在 landforms 之后），`G.life.stats().by` 给出各类数量，可供音频使用；`?nolife=1` 关闭。
- **建筑**：镇灯、石灯笼、宝箱在 `builders/keyobjects.js`；月读宫在 `builders/palace.js`；暗潮岸在 `builders/eastshore.js`。
  摆进场地的素材模型在烘焙前要过 `prepVertexColours`（否则会渲染成纯黑）。布类（幡旗、门帘、经幡）用 `clothify(material, amp)` 在顶点着色器里摆动。
  新增的摆设一律用独立的随机数流，不能挪动既有房屋与摊位的位置。万灯镇与狐火之里按街区分块做远景细节层次。
- **特效**：形体特效都走 `src/fx/shapes.js`（一次实例化绘制，上限 160 个），贴图是开机时画布绘制的噪声与符纹；符纹是自造笔画，不得像任何现实文字。
  对轰的冲击波会发 `fx:blast { pos, radius }`（纯视觉），草地已监听并压倒；`embers`、`shatter_rock` 两个爆发 id 必须保持注册。
- **地面**：陡坡（>35°）用分层岩石着色，岩层高度与地貌的等高崖带对齐（5.75 + k·5.5 米）；`GROUND_TINT_GLSL` 是地面的大尺度色调函数，草叶尚未接入。
  地形着色器的注释里不能写中文（文字检查会把模板字符串里的中文当成硬编码文本）。
- **天空与水**：天空在 `src/render/skydome.js`（分层积云、卷云、日轮、月轮、月帷边缘的光带）；级联阴影相机创建时就打开图层 5；
  水面平面反射已减半分辨率并精简反射对象；镜湖不在 `water.depthAt` 的覆盖范围内（只有海面有水位）。
- **验收**：`tools/acceptance/playthrough.js` 是通关验收脚本的正本（`node tools/play.mjs --name accept --params story=1 --timeout 1500 --script tools/acceptance/playthrough.js`）。
  `node build.mjs --check` 不带文件名时什么都不检查，必须带上改动的文件。

### 9.6 性能与加载、画面质感攻关、最后一轮内容（2026-11-14）

细节在 `docs/api/perf.md`、`look.md`（"Look round" / "Light r3"）、`structures.md`、`fx.md`、`life.md`、`story.md`（"Play-test, final round"）。跨系统规矩：

- **光**：主光与冷色阴影的比约 4:1，阴影里不许自己再加环境光或补光提亮，要亮就用自发光或 `look.band`；夜里光源之间就是暗的，
  夜里必须被找到的东西要自带发光或灯笼。色调映射只在后期的调色通道里做（`?tone=0` 回到旧曲线做对比）。
  日轮仰角 32°、方位东偏南 14°（`veil.js`），长影子朝西北偏西落；要让一块空地有影子，就在它的东南侧放遮挡物。
- **灯的光池**：所有灯的位置烘成一张贴图由光照钩子读取（`U.mvLampMap` / `U.mvLampBox`），不是真光源；`G.sky.lampList()` 给出灯的世界坐标。
- **画面清晰度**：动态分辨率的台阶是档位像素比的 1 → 0.92 → 0.85 → 0.77，缩放时最后一步用保边放大。对比截图一律加 `?dynres=0`。
- **草与树**：4.5 米以外的草不写深度（环境遮蔽、光柱、深度雾看到的是草下的土）；远处草靠缩短和颜色收敛过渡，不用抖动。
  树冠用平滑的"冠法线"着色，叶片贴图是干净的大色块；樱花冠内的环境遮蔽被减弱。
- **表面**：建成物先画大的明暗与色相渐变，再加少量有意的痕迹，不铺均匀颗粒；`M.stoneWarm` 与 `M.carved` 是同一个平滑石材材质。
  新增布景只用所在场地已有的材质（查 `G.structures.stats().per`，网格数即绘制次数），不许给道路和锚点圈内加碰撞体。
- **建造是异步的**：所有场地建造函数都是 async，通过 `ctx.step(label)` 让出主线程（标题画面期间分片执行）；输出与随机数顺序不变。
- **字**：字体按语言在 `core.meta` 里声明，由 `src/core/fonts.js` 加载（`assets/fonts/<locale>/`）；任何往画布上写字的地方必须先等字体就绪，
  否则会悄悄退回印刷体。幡旗、招牌、匾额的字是"手写"渲染（逐字大小、歪斜、飞白），旁边的纹章是画布手绘。
- **对轰**：光束按施法者的元素着色（`beams.js` 设 `lookEl` / `lookColor`），亮度压在泛光阈值以下；冲击波发 `fx:blast`，
  并有只影响布料与植被的"视觉阵风"（`G.elements.visualWindAt`，角色布料与植被摆动已改读它，刚体与玩家仍读 `windAt`）。
- **同伴与生灵**：团子是手工建的小狐灵（`story/companion.js`）；台阶上的麻雀、鸟居上的乌鸦、栈桥下的锦鲤、浅滩的鹭是固定机位的"主角生灵"，
  坐标抄自 `builders/shrine.js` 与 `dusk.js`，这两处的台阶或鸟居隧道若移动要同步改 `life/kinds.js`。
- **流程修正（试玩）**：主线对决在学会二级日辉之前不放光束；对决开始时补满体力与灵力；骑扫帚也能点莲灯；
  胧夜与无明对主角的伤害按倍率缩放（法术实体不读施法者的 power，这是个已知缺口）；离开无明的场地 4 秒会中止战斗并可重试。
- **启动**：标题先出，世界在后台分片加载；着色器预热用"真画一遍代表物"（`render/warmup.js` 的 `warmDraw`，只在图层 31 上），不用 `compileAsync`。
  新打包的应用首次启动要重建显卡驱动缓存（约 25 秒可玩），之后约 6 秒。
- **性能现状**：high 档平均每帧约 23 毫秒，瓶颈是绘制调用（约 900 次主绘制 + 400 次阴影绘制）。测量用 `node tools/perf.mjs`，`?perf=0` 关掉性能改动做对比。
