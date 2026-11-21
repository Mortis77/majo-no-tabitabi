# protagonist scout — working notes (kept up to date as work proceeds)

Resumed 2026-11-12 after the first scout was cut off. Nothing is re-downloaded; everything below was already on disk.

## On disk (assets/_incoming/protagonist/)

| folder | what | licence + evidence |
|---|---|---|
| kaykit-adventurers-2.0/ | KayKit Adventurers 2.0 FREE (Kay Lousberg). Characters/gltf: Mage, Knight, Barbarian, Ranger, Rogue, Rogue_Hooded (.glb, one 1024 gradient atlas each); Assets/gltf: staff, wand, spellbook_open/closed, weapons…; Animations/gltf/Rig_Medium General + MovementBasic | CC0 — `KayKit_Adventurers_2.0_FREE/License.txt`: "License: (Creative Commons Zero, CC0)" |
| kaykit-character-animations-1.1/ | KayKit Character Animations 1.1: Rig_Medium ×8 GLB (General, MovementBasic, MovementAdvanced, CombatMelee, CombatRanged, Simulation, Special, Tools = 139 clips) + Rig_Large ×6 + Mannequin | CC0 — `KayKit_Character_Animations_1.1/License.txt` |
| quaternius-base-characters/ | Universal Base Characters [Standard]: Superhero_Female/Male_FullBody.gltf, 6 hairstyles + eyebrows (gltf) | CC0 — `License_Standard.txt` |
| quaternius-outfits-fantasy/ | Modular Character Outfits Fantasy [Standard/free]: ONLY Female_Peasant + Female_Ranger (gltf + PBR textures) | CC0 — `License_Standard.txt` |
| quaternius-ual1/ | Universal Animation Library 1 [Standard]: UAL1_Standard.glb (+_RM root-motion twin), 43 clips, 65-bone UE-style rig | CC0 — `License.txt` |
| quaternius-ual2/ | Universal Animation Library 2 [Standard]: UAL2_Standard.glb (+_RM), 43 clips, same rig; Female Mannequin/Mannequin_F.glb | CC0 — `License.txt` |
| vroid-cc0-oga/ | 8 VRM 0.x avatars from OpenGameArt "VRoid Studio CC0 models": AvatarSample_D (+_Darkness), _E, _F, _G, HairSample_Female, Sendagaya Shino, Sakurada Fumiriya (male) | CC0 — https://opengameart.org/content/vroid-studio-cc0-models ("License(s): CC0 … explicitly released by VRoid under CC0"); pixiv help https://vroid.pixiv.help/hc/en-us/articles/4402614652569 lists HairSample_Female and β Ver AvatarSample_1–4 (= AvatarSample_D–G) as "CC0 licensed. Copyright is waived". Shino / Fumiriya are not named in that list (their VRM meta says licenseName "Other" with redistribution/modification/commercial = allow) → prefer the explicitly listed ones. |
| polypizza/ | 8 single GLBs looked at by the first scout (Quaternius witch / animated women / monk, chibi witch, tiny mage, Japanese princess bust) | mixed (poly.pizza; Quaternius = CC0, others CC-BY) — none used, see verdicts |
| _preview/ | preview PNGs | |

Scratch: `.tmp/protagonist/` — pv.mjs (contact-sheet previewer), dump.mjs (glTF tree dump), vrmmeta.mjs, saved licence pages (oga_vroid.html, vroid_help_api*.json, vh_*.json), extracted VRoid textures (shino_tex/, hs_tex/).

## Verdicts so far
- polypizza singles: Japanese princess = unrigged bust, chibi witch / tiny mage = unrigged or tiny T-pose statues, Quaternius witch = old low-poly set with only ~20 clips and faceted style. None beats routes A–C. Not staged.
- Quaternius outfits (route B): the free tier has no mage / robe / kimono outfit, only Peasant + Ranger; semi-realistic PBR look.

## To do
- [ ] Route C: retarget UAL → VRoid for real, look at frames
- [ ] Route A: KayKit Mage, drop hat, recolour to white + vermilion, ribbon
- [ ] Route B: assemble base + outfit + hair, judge
- [ ] stage top two + anim libraries, manifest.fragment.json, report.json

## 2026-11-12 progress log
- Route C PROVEN. `tools/devkit/protagonist/convert_vroid.mjs` turns HairSample_Female.vrm (explicit CC0) into a clean GLB: faces +Z, cat-ear hair
  primitives 0-5 dropped, 108 hair primitives -> 1, 13 expression morphs (blink…), textures <=1024, VRM/MToon/unlit stripped.
  `miko_tex.mjs` recolours the dress sheet (bottom half = skirt -> vermilion ramp; collar, cuffs, waist ribbon red) and paints red
  under-shorts onto the skin texture by rasterising body triangles in UV space (hips..upper thigh) so nothing shows in sit / roll / death.
  `ribbon.mjs` adds an original procedural red bow skinned to the head bone.
- `tools/devkit/protagonist/retarget.mjs` + `maps.mjs` (ual_vroid): offline world-space retarget UAL -> VRoid skeleton. First test (idle, walk, jog,
  sprint, cast, sit, roll, swim, jump, death) is sane: feet on the ground, limbs correct, both rigs rest in T-pose (alignment angles ~3°).
  Previews: .tmp/protagonist/out/akari_v1_poses_big.png, head_v3.png
- still to do: full 84-clip retarget, toon preview, KayKit route A build, Quaternius route B judgement, staging.

## 2026-11-13 session (task 1: heroine + shared anim library)
- convert_vroid.mjs gained `--scale k` (baked into vertices, bone offsets, morph deltas, ribbon). ribbon.mjs takes o.k.
  Heroine build: `node tools/devkit/protagonist/convert_vroid.mjs <vroid>/HairSample_Female.vrm .tmp/protagonist/out/akari_v4_back.glb
  --drop-hair 0,1,2,3,4,5 --look miko --ribbon --ribbon-style back --scale 0.94` -> 1.551 m, 27164 tris, 2.2 MB. Back bow chosen (reads from behind).
- retarget.mjs gained `--lock-xz` (hips x/z = rest) and automatic loop seam fix for clips named *Loop (linear distribution of first/last
  mismatch; seams were <=1.3 deg). Full library: `--target akari_v4_back.glb --src UAL1_Standard.glb --src UAL2_Standard.glb --map ual_vroid
  --lock-xz --out .tmp/protagonist/out/anim_ual_v2.glb` -> 84 clips, 2.8 MB. Target hips height 0.887*0.94... (hips y from library = heroine's).
- pv.mjs gained low views: lf, lb, ls, u. Modesty checked (a2_low.png, a2_lowcrop.png, a2_low2.png): only red shorts show. Spot sheets a2_s1/a2_s2 sane.
- NEXT: toon/back check, finger check, props (gohei, broom), stage + manifest.
- DONE 2026-11-13: staged/ char_akari.glb (2.2 MB, 1.551 m, 27164 tris, 13 morphs, no clips), anim_ual.glb (84 clips, 2.8 MB, mesh-less),
  prop_gohei.glb + prop_broom.glb (props.mjs, original procedural). manifest.fragment.json written by tools/devkit/protagonist/manifest.mjs
  (clip descriptions + proposed game mapping in anim_ual.notes). Final glbview check passed (out/final, out/final_toon).
- tools/glbview.mjs fails headless ("view is not defined": iife bundle needs define import.meta.url); the fixed private copy
  tools/devkit/protagonist/glbview.mjs (one-line define) was used for all checks. tools/ untouched.
- Library hips y is absolute for hips height 0.887 m; other VRoid chars must scale the hips position track y by hipsHeight/0.887.

## 2026-11-13 session 2 (task 2: supporting cast, 18 characters)
- convert_vroid.mjs gained `--cast <id>` (recipe in tools/devkit/protagonist/cast_recipes.mjs; heroine path unchanged: rebuild gives same tris/hips):
  per-texel recolour (hair/brow/iris luminance ramps, cloth rules by colour class + world height in hips units + optional UV rects,
  modesty shorts), hair TRANSPLANT from another CC0 VRoid (`hairFrom`: donor hair bones copied under the head, verts moved with it),
  `broad` x/z factor, material colour factor reset to white on recoloured textures (G hair had a teal tint factor), node/mesh prefix = id.
  Add-ons: tools/devkit/protagonist/cast_addons.mjs (ears, tails, bun, kanzashi, sunflower, dish, snowflake, crescent, crown, strawhat,
  necktowel, basket, drum, lantern, bow; hachimaki/headscarf exist but looked like floating halos -> unused).
- Build: `node tools/devkit/protagonist/cast_build.mjs [ids]` -> .tmp/protagonist/cast/<id>.glb (512 px textures, ~1.8-2.6 MB).
- Line-up previewer: tools/devkit/protagonist/castpv.mjs (many models, one camera, scales hips track by hipsY/0.887, prints skinned min-y).
  Idle feet: all -0.007..-0.011 (same as heroine -0.010) -> no per-character hips offset needed.
- Sheets so far: out/cast_v1a.png, cast_v1b.png, cast_v2.png, cast_v3.png. NEXT: cast-pose check, final sheet, stage, manifest.
- DONE 2026-11-13: 17 cast GLBs staged (staged/char_<id>.glb, 1.8-2.6 MB, 27-36k tris, 13 morphs each, no clips, textures <=512).
  Cast-pose check out/cast_castpose.png (Spell_Simple_Shoot + Spell_Simple_Idle_Loop, soles -0.007..-0.011). Final sheet out/cast_sheet.png
  (heroine + 17, Idle_Loop, front + back). Manifest entries merged by tools/devkit/protagonist/cast_manifest.mjs (keeps existing entries).
  Rebuild everything: `node tools/devkit/protagonist/cast_build.mjs && cp .tmp/protagonist/cast/char_*.glb assets/_incoming/protagonist/staged/ && node tools/devkit/protagonist/cast_manifest.mjs`.
  Not checked: low-angle modesty views for sit/roll on the cast (shorts are painted like the heroine's), toon-shader previews.
  Base/hair pairs: granny E+E, himawari D+D, ushio E+F, kokonoe F+E, kuzunoha G+G, rikka G+HS, naru D+E, shoku E+D, kagami F+G,
  oboroyo HS+G, villager_a D+F, villager_b HS+D, villager_c G+E, fox_a D+HS, fox_b HS+E, town_a F+D, town_b E+G.
