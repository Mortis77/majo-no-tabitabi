# cast:cast — as built

## Summary
The supporting cast is finished: all 17 characters (10 named, plus 3 villagers, 2 fox villagers and 2 night-town folk) are staged in assets/_incoming/protagonist/staged/ as char_<id>.glb. Each file is 1.8–2.6 MB with 27k–36k triangles, has 512 px textures and the 13 expression morphs, and carries no animation clips of its own. The manifest fragment now has their 17 entries alongside the existing akari, anim_ual, gohei and broom entries, which were left as they were. The heroine and the animation library were not rebuilt.

All bases come from the explicitly CC0 avatars (AvatarSample_D/E/F/G and HairSample_Female); Shino and Fumiriya were not used. To make people look different with only 5 bodies, I added a hair transplant: one avatar's hair and hair bones are moved onto another avatar's head. Every character uses a different body + hair pair (for example kuzunoha is G's body with G's hair, oboroyo is HairSample's body with G's hair).

Each character also gets new colours for hair, eyes and clothes (and skin for some), modesty shorts painted on where a skirt could show underwear, and its own height. Add-ons are original geometry fixed to one bone: fox ears and 1 or 5 tails, a hair bun with pin, sunflower, head dish, snowflake, crescent, moon crown, straw hat, neck towel, back basket, taiko drum, a glowing paper lantern, and a bow.

**Male bodies:** not possible. All five allowed avatars are female bodies, so the "male-reading" folk get short hair, earth or dark colours, and villager_a, villager_c and town_a are made 5–7% wider. Each of those manifest entries says so.

**Feet:** the animation library's hips height was set for the heroine, so each character's hips track is scaled by its own hipsHeight ÷ 0.887 (the rule already in the anim_ual notes). With that, every character's feet sit 7–11 mm below y=0 in idle and both cast poses; the heroine sits 10 mm below. So no character needs an extra hips offset.

## Public API
Each manifest entry char_<id> (granny, himawari, ushio, kokonoe, kuzunoha, rikka, naru, shoku, kagami, oboroyo, villager_a/b/c, fox_a/b, town_a/b) has these fields:
- file: models/chars/<id>.glb
- type: "model"; license: "CC0"
- author: base body (and hair donor, if any) plus "recolour, procedural add-ons and conversion by Moonveil Miko"
- source: the OpenGameArt URL and the pixiv help page that lists the CC0 avatars
- scale: 1 (height is already in the file)
- size: [x, y, z] in metres, add-ons included (e.g. kuzunoha's ears give 1.804 m, villager_a's straw hat gives 1.738 m)
- tris
- clipsFrom: "anim_ual"
- morphs: blink, blink_l, blink_r, joy, fun, angry, sorrow, surprised, a, i, u, e, o
- morphMesh: "<short id>_face", e.g. "granny_face"
- bones: head J_Bip_C_Head, chest J_Bip_C_Chest, upperChest J_Bip_C_UpperChest, spine J_Bip_C_Spine, hips J_Bip_C_Hips, handR J_Bip_R_Hand, handL J_Bip_L_Hand, neck J_Bip_C_Neck, footR J_Bip_R_Foot, footL J_Bip_L_Foot
- hipsHeight: rest hips height in metres, from 0.741 (naru) to 0.99 (kuzunoha)
- notes: who the character is, the look, the hips-scale factor, foot heights, add-on mesh name, and the female-body caveat for the generic folk

How the game should use them:
- Clone the anim_ual clips per character and multiply the y of the J_Bip_C_Hips.position track by hipsHeight / 0.887. No extra hips offset is needed.
- GLB layout: one top node named after the short id (e.g. "granny") containing the Root skeleton; meshes are <id>_face, <id>_body, <id>_hair and <id>_addons. Add-on materials carry extras.shadeColor, and LanternPaper also has a warm emissive.

New pipeline pieces (in .tmp/protagonist):
- `convert_vroid.mjs --cast <id>` builds one character from its recipe; recipe fields are base, hairFrom, dropHair, k, broad, hair, hairGamma, eye, skin, shorts, cloth rules {c, y, hue, L, uv, to, con} and addons.
- `cast_build.mjs [ids]` builds all or some characters.
- `cast_manifest.mjs` merges the cast entries into the manifest fragment.
- `castpv.mjs --models a,b --anims lib --poses --views ff,bb` renders a line-up and prints each character's lowest point (min-y) per pose.

## Known issues
- No male bodies: all five explicitly CC0 avatars are female (bust and skirt or bodysuit remain). The male-reading folk rely on short hair, earth or dark colours and the 5-7% wider build (villager_a, villager_c, town_a), which is stated in their notes. Sakurada Fumiriya is male but not on the explicit CC0 list, so it was not used.
- The F-body characters (kokonoe, kagami, town_a) keep F's original high-cut leotard bodysuit shape; only its colours changed.
- Not checked for the cast: low-angle modesty views in sit, roll or death (the shorts are painted the same way as on the heroine), and previews with the toon shader.
- Hair bones are static with no spring physics, and donor hair is placed at the target's head without per-avatar size fitting. It looked right on the sheets, but there could be small hair-into-face overlaps in close-ups.
- Manifest size includes add-ons, so for hit capsules use the body height rather than size[1] for kuzunoha (ears) and villager_a (straw hat). Tails make the z depth 0.6-0.9 m on the fox characters.
- tools/glbview.mjs still fails headless ("view is not defined"), as earlier sessions found; the private fixed copy in .tmp/protagonist was used. tools/ was not touched.
- Unused add-ons hachimaki and headscarf remain in cast_addons.mjs; their placement read as floating halos.
