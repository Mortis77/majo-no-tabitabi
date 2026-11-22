# heroine wardrobe — swimsuit A 潮祭 (tide festival)

> **Journey note (2026-11-22):** this page describes an earlier cut. The swimsuit as built now is a white frilled two-piece with a frill skirt and a sheer shirt; Elaina's versions are built by `tools/journey/swimwear.mjs` (see docs/api/heroine.md, "Wardrobe (journey)").


Owner files: `tools/costume/swim_a.mjs` (build, coverage check, install), `tools/sculpt/assets/akari_swim_a.mjs` (the suit's
field design and cut lines), `assets/models/chars/char_akari_swim_a.glb`, the manifest entry `char_akari_swim_a`. Work log and
pictures: `.tmp/akari-swim-a/` (PROGRESS.md, sheets/, play/). Builds on docs/api/heroine.md (layers, chains, fitting) and
docs/api/cloth.md (spring solver).

Switch: `?akari=swim_a` (src/player/player.js `akariId()` → `char_akari_swim_a`). `preload: false`. The outfit's player-facing
name is the installer's to add (no strings here).

## Design
The shrine maiden at the shore: one idea — a white one-piece, one bold red waist, an asymmetric flick of pleats.
- **Suit**: white one-piece, skin + 3.6 mm everywhere (more over seat / hip crease / gusset), walls at every edge down to
  1.3 mm off the skin. Neckline a crossed wrap, left over right like her kosode: raised white band (13 mm) with the thin red
  line at the opening (4.5 mm); the top panel's edge runs on across the chest to her right waist under the cord (1 mm overlap
  step). Wide straps, a modest scoop back (bottom y 1.135) closed by a crossed red cord. Armholes and leg openings: 5 mm
  vermilion piping, rolled +0.8 mm. Leg line: y 0.85 on the hip bone, full seat (0.772 at the back), inner line 0.772.
- **Bridging** (no body groove read through the cloth): the seat spans the gluteal cleft as one flat surface down to its lower
  edge (`bridge.back` 32 mm from y 0.768); the spine's furrow under the scoop is spanned; a **flat gusset** closes the crotch:
  the bridged solid is floored at y 0.789 in a column |x| < 9 mm (`SWIM.gusset`), so seen from below it is a flat white strip
  with red piping on both sides, not a fold into the groove. Behind z -0.04 the floor steps down to 0.775 (`gusset.yBack`), so
  the seat's lower edge runs straight across the back (no notch at the centre).
- **Lining**: like a real swimsuit's, an inner opaque white layer over the skin of the undergarment's mandatory zones plus one
  ring, offset 1.5 mm along the skin's face normals averaged over 9 mm (0.45× inside the cleft, 0.2× at its own edge), skinned
  exactly like the skin. Hidden under the suit at rest; it is what keeps the zones covered where the body's own skinning
  folds in deep bends.
- **Skirt** (akari_skirt): asymmetric wrap, a cut-down hakama. Knee-length at her right (hem y 0.548), round the back (0.578)
  to the front (0.598), rising in a diagonal to mid-thigh at the open edge on her front left (0.672). 13 knife pleats, 17 mm
  deep, an ink line on every folded edge and along the hem. The over panel's edge (white piping) runs from the tie at her left
  hip down to the hem; the panels part only below y ≈ 0.74 (under the suit's leg line): a modest inverted V over the thigh.
- **Cord set** (akari_cord): red cord at the natural waist (y 1.034), flat reef knot at the front left with the bell and paper
  charm on a string (Charm chain), a WHITE back bow with two 30 cm white tails (SashTail L/R) — the centre mark from behind
  at play distance (red on the red skirt vanished in the game) — and the crossed red back cord.
- **Zori** (akari_zori): 34 mm sole (the skeleton stands on it), straw top, red hanao, bare feet.
- **Wrist cord** (akari_wrist): red cord with a gold bead, left wrist.

## Layers (nodes, inside out)
| node | material | tris (build 2026-11-18) |
|---|---|---|
| akari_body / akari_face / akari_hair / akari_ribbon | base figure, untouched | 22 180 / 13 090 / 12 044 / 340 |
| akari_swim_lining | cloth_white | 2 274 |
| akari_swim (white + piping) | cloth_white, cloth_trim | ~12 100 |
| akari_skirt | cloth_red (double-sided) | 3 392 |
| akari_cord, akari_zori, akari_wrist | cloth_trim | ~3 300 |

Whole character 69 817 tris (build 2026-11-18 04:xx), 4.36 MB.

The base's `akari_under` node is NOT carried over: the swimsuit is the always-worn layer. Whole character under 70 000 tris
(the build fails above).

## Chains (no joint added or moved; skeleton = the base's, checked by writer.mjs compareSkeleton)
- Hakama_1..10 (skirt): below the hip line every column is weighted to its two nearest chains, j1 → j2 by height (j2 up to
  0.6 near the hem). The back panel keeps 50 % of the hips' own motion (`FIT.skirt.backPin`): the chains hang from the thighs,
  and in a deep hip bend (slide, sitting) a back panel on the chains alone swings down off her seat. The skirt's top
  (yoke, y 1.04 → 0.837) is skinned to what lies beneath, and the chain share ramps in over the top half of the skirt
  (`FIT.skirt.pin`).
- SashTailL/R_1 (bow tails), Charm_1 (bell + paper), RibbonL/R_1 (the base's hair bow).
- Manifest `springDefaults`: v3's, with `skirt.stiffness` 0.95 (v3 0.6) so the waist stays pinned; no sleeve kind.

## Build
```
SCULPT_THREADS=2 node tools/costume/swim_a.mjs        # contours the suit (~2-5 min cold, cached after), builds, checks, installs
```
Writes `.tmp/akari-swim-a/out/char_akari_swim_a.glb` (+ build.json, coverage.json, layers sidecar, textures). Then the
**coverage check**: the undergarment's mandatory zones (chest band y 1.10-1.13 all round + y 1.13-1.188 within 60° of the
front; hips/waist-region skin under y 0.962, from `akari_base.regions.json`) are rasterised from the 26 view directions at
0.6 mm in the rest pose and 24 stress poses (idle, jog, sprint, jump, roll ×2, crouch, sitting, sit-ground, kneel, two
casts, glide, broom, swim, kagura, slide, sword, kneeling work, FK arms-up / twist / deep squat / kick). The rasteriser draws the body, the suit + lining and the opaque head shell (Face: the body
mesh is open at the neck seam; without the head a view from above-front in the sprint lean looked down the neck onto the
inside of the lower back). Any zone triangle seen past opaque suit cloth, or any hole-probe pixel, fails the build (exit 1); triangles the BODY's own skinning tears are reported separately as
base-figure defects. Only a passing file is copied to `assets/models/chars/` and the manifest entry written (through
tools/manifest-patch.mjs, this id only, read back). Switches: `--out`, `--no-check`, `--no-install`, `--check-only`,
`--install-only`.

## Pictures
CPU: `.tmp/akari-swim-a/sheets/final_turn.png` (cel + clay turntable), `r9_seat.png` (seat, gusset, sit/jump/squat).
Game (`.tmp/akari-swim-a/play/shots.js`, `poses.js`): `.tmp/play/swa_g3/` (sheet `sheets/g3_final.jpg`), held poses
`.tmp/play/swa_p1/` (`sheets/p1_poses.jpg`).

## Known shortfalls
- The red piping at the BACK of the leg opening still waves in deep bends (kneel, sit-ground from below): the seat edge rides
  the gluteal fold; wider weight smoothing did not change it.
- The pleat ink reads at 2 m, not at play distance; from the game camera the skirt is a red bell with a white bow.
- From the front the long skirt makes it read as a miko top + skirt more than a swimsuit; the suit itself shows only at the back
  scoop and in motion.
- The body's skin (not this file's): shadow side of the legs goes grey and grainy in the game's light (see PROGRESS.md).
