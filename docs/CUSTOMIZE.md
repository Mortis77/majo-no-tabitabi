# 改造指南：名字、人物、剧情、音乐都放在哪里

《月帷巫女》从一开始就把"内容"和"代码"分开了。想换一种语言、改人物的名字和外形、重写剧情、换音乐，都不需要动引擎。
这份文档只说明**东西放在哪、怎么换**，不预设你要把它改成什么。

改完以后的检查（都在项目根目录下执行）：

```bash
node tools/check-i18n.mjs
```

```bash
node tools/play.mjs --name accept --params story=1 --timeout 1500 --script tools/acceptance/playthrough.js
```

第一条检查有没有写死在代码里的文字，第二条把主线从标题打到结局（约 6 分钟，结尾应出现 `ALL PASSED`）。

---

## 1. 文字：所有玩家能看到的字

全部在 `src/locales/zh-CN/`，代码里通过 `t('文件.键')` 读取。加一种语言就是复制这个目录（例如 `src/locales/en/`）逐文件翻译。

| 文件 | 内容 |
|---|---|
| `core.js` | 游戏标题（`title`）、字体、加载提示、八象名称（火水冰风雷岩日月）、三片大地的简称 |
| `story.js` | **人物名字**（`name.<id>`：主角 `akari`、同伴 `dango`、13 位有名字的角色、路人）、交谈提示、任务界面用语 |
| `story.quests.js` | 主线七章（`m0_shrine` … `m6_moon`）与十条支线的标题、目标、提示 |
| `story.dlg.main.js` | 主线对白。每一行是 `{ who, text, act?, expr?, do?, if?, choices? }`；**只改 `text`**，`who` 是人物 id，`act`/`expr` 是表演标签，`do`/`if`/`goto` 是剧情逻辑 |
| `story.dlg.side.js` | 支线、切磋、路人闲聊 |
| `world.js` | **地名**（`place.*`、`sub.*`）、河流、桥、六盏镇灯的名字 |
| `spells.js` | 灵诀（法术）与四种术式的名字、说明、提示 |
| `combat.js` | 敌人、对手、对决与头目战的名字和台词 |
| `structures.js` | 幡旗、门帘、招牌、告示牌上的字 |
| `gameplay.js` `props.js` `player.js` `ui.js` | 机关与收集物、器物、操作提示、全部界面文字 |

文字里**不要出现科学或天文术语**（这是一个魔法世界），这是本项目自己的写作规矩。

## 2. 人物：谁是谁、长什么样

一个人物由四处共同决定：

| 要改什么 | 改哪里 |
|---|---|
| 名字 | `src/locales/zh-CN/story.js` 的 `name.<id>` |
| 站在哪、做什么、用哪个模型 | `src/story/npcs.js` 的人物表：`{ id, asset, anchor, idle, work, props … }`。`asset` 是清单里的模型 id，`anchor` 是 `src/data/world.js` 里的锚点 |
| 模型文件 | `assets/manifest.json` 里的 `char_<id>` 条目，`file` 指向 `assets/models/chars/char_<id>_v2.glb`（磐翁是 `char_banou.glb`） |
| 性格与台词 | 对白文件（见上）；对手的招式风格在 `src/combat/duel.js` 和 `src/locales/zh-CN/combat.js` |

现有 19 个人形模型：主角 `char_akari`；有名字的 `granny himawari ushio kokonoe kuzunoha rikka naru shoku kagami oboroyo banou`；
路人 `villager_a/b/c`、`fox_a/b`、`town_a/b`。

主角另有**衣装**（卷轴菜单「衣装」页，随时可换，到哪儿都能穿）：魔女旅行装 `char_akari`、潮祭水着 `char_akari_swim_a`、
暮海水着 `char_akari_swim_b`。

- **重建（一条命令）**：`node tools/costume/wardrobe-build.mjs --install`——用当前的身体/脸（`assets/models/sculpt/akari_base.glb`）
  和银发（`akari_hair2.glb`，或 `--hair <文件>`）把三件全部重新穿好、检查（骨架、脸和 13 个表情与身体一致、泳装的覆盖检查），
  写进 `assets/models/chars/` 和清单。换了脸或头发只要再跑这一条。衣装页的图：`node tools/costume/wardrobe-pics.mjs`。
- **加一件新衣装**要动五处：① 穿衣的构建脚本（仿 `tools/costume/swim_a.mjs`，结尾必须有会让构建失败的覆盖检查）；
  ② `tools/costume/wardrobe-build.mjs` 的 `OUTFITS` 表加一行；③ `src/data/outfits.js` 衣装表加一行（模型 id、图、腰间灯笼的挂法）；
  ④ 每种语言 `src/locales/<语言>/ui.js` 的 `outfit.<id>.name` 和一行 `desc`；⑤ 跑上面的构建命令和 `node tools/check-i18n.mjs`。
  默认旅行装由 `tools/costume/witch-traveller.mjs` 制作，宽檐帽由 `witch-hat.mjs` 绑定到头骨。原存档沿用 `miko` 衣装编号。
  细节（每一步的字段、检查项、换装时带过去什么）：`docs/api/heroine.md` 的 “Wardrobe” 一节。

#### 修改灯里的银发

- **刘海与发顶**　`tools/sculpt/assets/akari_hair2_cap.mjs` 的 `sectors` 控制发片边界和尖端位置，`fringeLeaves()` 生成覆盖额头的外层发片。先从正面画出眼睛周围的留白，再转到四分之三侧面检查发片贴合额头的弧度。[Ascalon 的 Blender 动漫发片建模演示](https://blenderartists.org/t/flat-modeling-anime-toon-hair/1204349)
- **两侧长发**　`tools/sculpt/assets/akari_hair2.mjs` 的 `hairDesign()` 分别定义左右发束的路径、半宽和厚度。`tools/sculpt/figure/build-hair2.mjs` 沿路径旋转扁平截面。改肩前轮廓时，先调路径与宽度，再调扭转角，从侧面检查发梢和金环的位置。[VRoid 官方发束编辑教程](https://vroid.pixiv.help/hc/en-us/articles/900005678786-How-do-I-customize-hairstyles)
- **游戏内检查**　运行 `node tools/costume/wardrobe-build.mjs --rebuild-hair --install`，再运行 `node tools/costume/wardrobe-pics.mjs`。用默认旅行装检查帽檐、披肩和后领，再切到潮祭或暮海看完整发顶。跑步、跳跃、骑扫帚时，从侧后方观察长发摆幅。

### 换一个人物的外形

所有人形角色共用同一套骨架（VRoid 人形骨架）和同一个动作库，所以有两条路：

1. **改服装配方，重新生成**（推荐）。服装是程序生成的：
   - `tools/costume/recipes.mjs`：每个角色一份配方（衣型、袖型、裙/袴、腰带、配色、花纹、头饰、尾巴等）。
   - `tools/costume/outfit.mjs`、`shells.mjs`、`extras.mjs`、`garment.mjs`：衣片、贴身层、配件、蒙皮与贴图的生成器。
   - 生成：`node tools/costume/build.mjs <id …>`，成品在 `.tmp/costume/out/`；检查：`node tools/costume/check.mjs`。
   - 把成品放进 `assets/_incoming/costume/`（连同 `node tools/costume/manifest.mjs` 生成的清单片段），再执行
     `node tools/install-costumes.mjs` 安装进游戏。
   - 身体、脸、头发来自五个 CC0 的 VRoid 基础模型（`assets/models/chars/char_<id>.glb`，即清单里的 `fileV1`）。换发型、脸型、身高要换这个基础模型。
2. **直接换成你自己的 GLB**。要求：
   - 骨骼名与现有模型一致（`J_Bip_C_Hips` 等），否则动作对不上；
   - 身体/脸/头发/眼睛的材质名保留 `Body` `Face*` `Hair*` `Eye*`（描边与赛璐璐着色靠这些名字识别）；
   - 会飘动的部分做成名为 `J_Sec_<部位>_<序号>_<01..03>` 的骨链，并在清单条目里列进 `secondaryChains`（格式见 `docs/api/cloth.md`）；
   - 用 `node tools/manifest-patch.mjs` 改清单，不要整文件重写；**不要改 `clipsFrom`**（必须是 `['anim_ual', 'anim_miko']`）。

### 动作

- 动作库是 `assets/models/chars/anim_miko.glb`（56 个原创片段）加开源的 `anim_ual.glb`。
- 逻辑状态 → 片段的对照表在 `src/actors/clips.js`；游戏代码只写状态名。
- 原创片段的生成源码在 `tools/anim/`（`clips/*.mjs` 按类别分：施法、对白、行走飞行、劳作、仪式）。

### 同伴与生灵

- 同伴团子：`src/story/companion.js`（行为）与清单里的 `ani_fox`（模型）。
- 敌人：`src/combat/types.js`（每种敌人用哪个模型或手工形体、体型、行为）；名字在 `src/locales/zh-CN/combat.js`。
  影团、纸魅、鬼火是手工建模，代码在 `src/actors/creature.js`。
- 动物与环境生灵：`src/combat/wildlife.js`、`src/world/life/`。

## 3. 世界：地点、任务怎么布置

| 要改什么 | 改哪里 |
|---|---|
| 地点、道路、河流、桥、锚点坐标 | `src/data/world.js`（`POI`、`ROADS`、`RIVERS`、`BRIDGES`、`ANCHORS`、镇灯 `GREAT_LANTERNS`、浮岛 `SKY_ISLES`） |
| 月帷的位置与范围（哪里是白昼、黄昏、长夜） | `src/data/world.js` 的 `VEIL` |
| 每个地点的建筑 | `src/world/builders/*.js`（神社 `shrine.js`、村子 `village.js`、薄暮林 `dusk.js`、万灯镇 `town.js`、月读宫 `palace.js`、暗潮岸 `eastshore.js`、其余 `far.js`） |
| 主线与支线的流程 | `src/story/questdefs.js`：每个任务是一串步骤（到某处、和某人说话、打赢某场、点亮某盏灯…），每步可挂对白和奖励 |
| 过场演出 | `src/story/cutscenes.js` |
| 对决与头目战 | `src/combat/duel.js`、`bosses.js` |
| 法术本身（数值、形态） | `src/spells/`；元素反应规则在 `src/elements/reactor.js` |

改了地点坐标或任务流程后，通关验收脚本 `tools/acceptance/playthrough.js` 也要跟着改（它按现有的任务步骤一步步走）。

## 4. 画面与声音

| 要改什么 | 改哪里 |
|---|---|
| 全局配色 | `src/core/mats.js` 的 `PAL`（人物、建筑、三片大地、灯火、水的主色都从这里取） |
| 界面图标、八象徽记 | `src/ui/icons.js`；界面样式 `src/ui/style.js` |
| 标题画面 | `src/ui/title.js`（标题文字在 `core.js` 的 `title`） |
| 音乐 | `assets/audio/music/bgm_*.ogg`，共 12 首（`title sun shrine dusk night town battle duel boss final ending flight`）。换同名文件即可；什么时候放哪首在 `src/audio/director.js` |
| 环境声与音效 | `assets/audio/ambience/`、`assets/audio/sfx/`；名称对照在 `src/audio/names.js` |
| 素材出处与许可 | `assets/manifest.json` 每个条目的 `license` / `author` / `source`；`node tools/gen-credits.mjs` 据此生成鸣谢名单 |

换进来的素材请确认许可允许你的用途，并把出处写进清单，鸣谢名单才会正确。

## 5. 不要动的东西

- 存档格式（`src/core/save.js`）：改了以后旧存档会读不出来。
- 人物 id、任务 id、锚点 id：它们被对白、任务、存档、验收脚本同时引用。**改显示出来的名字只改语言文件，不要改 id。**
- 渲染图层 5（只用于阴影的简化体）、`cloth_*` 材质名、`J_Sec_*` 骨链名。

三套灯里的独立 GLB 可以用 `node tools/costume/export-character.mjs char_akari 输出目录` 重建。另两套的模型 ID 是 `char_akari_swim_a` 和 `char_akari_swim_b`。导出文件包含九个动作，旅行裙的十片裙褶随动作一起烘焙；游戏内由腿部碰撞实时驱动。
