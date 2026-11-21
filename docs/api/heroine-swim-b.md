# heroine wardrobe — swimsuit B 暮海 (dusk sea)

Owner files: `tools/costume/swim_b.mjs` (build, coverage check, install), `tools/sculpt/assets/akari_swim_b.mjs` (field designs
and cut lines of top, shorts, sandal straps) with its three contour stubs `akari_swim_b_{top,shorts,straps}.mjs`,
`assets/models/chars/char_akari_swim_b.glb`, the manifest entry `char_akari_swim_b`. Work log and pictures:
`.tmp/akari-swim-b/` (PROGRESS.md, sheets/, play/g.js). Builds on docs/api/heroine.md (layers, chains, fitting) and
docs/api/cloth.md.

Switch: `?akari=swim_b` (the player's test switch → `char_akari_swim_b`). `preload: false`. The outfit's player-facing name
is the installer's to add (no strings here).

## Design
The twilight forest at the sea: darker, sportier and asymmetric against A's white festival. One idea: a violet star-print
wrap knotted at the left hip over an athletic indigo two-piece. Her red bow is the one warm accent.
- **Top** (`akari_swim_top`): indigo halter sports top. One structured front shell: the chest's concave envelope, flat from
  cup to cup and straight down to the band (no line between the breasts, no under-bust crease). A 3 mm gold centre piping
  runs from the band to the neckline. A wide raised under-band (36 mm) with gold piping on its top edge. Two 21 mm halter
  straps hug the neck base and run down the back to a gold ring between the shoulder blades, and one 25 mm strap runs from
  the ring to the band (Y racer back). Skin + 3.2 mm, band + 4.7 mm, walls 3 mm into the skin.
- **Shorts** (`akari_swim_shorts`): indigo, high-waisted, one closed solid over seat and crotch. The body is united with
  (a) a seat bridge, the concave envelope of the back along every row and every column up to y 0.9, so the seat is flat
  across the cleft and the gluteal fold; (b) a flat gusset floor 20 mm under the crotch line; (c) a wedge between the inner
  thighs (y 0.777–0.83). The wedge's back face carries the seat's lower row on down, so there is no shelf or pit at the foot
  of the seat. Its front face is the straight line between the inner groins, so there is no centre groove. The union is
  then offset: skin + 3.8 mm, waistband + 5 mm. Legs end at y 0.735 with a 4.2 mm gold hem band, a short slit at each outer
  seam, and 5 mm gold piping down each side seam. Centre weights are mirror-averaged, so the seat and gusset never tear on
  the centre line.
- **Wrap** (`akari_swim_wrap`): violet shading from indigo at the waist to violet at the hem, with a scatter of small gold
  lantern-light dots and a gold hem line. It is tied in a knot at the front-left hip and hangs asymmetrically: above the knee
  at her right, open over the left thigh.
- **Sandals** (`akari_swim_sandals`): 34 mm soles (footbed, indigo side, gold welt, dark outsole) that fill the skeleton's
  stand-off, with a forefoot band, an ankle strap and a heel strap (strap clearance 2.6 mm) and gold buckles.
  **Anklet** (`akari_swim_anklet`): a thin gold chain on the right ankle.

## Colour in the game (read before changing PAL)
The game's tone curve (AgX: contrast 1.45, saturation 1.25) under the blue sky fill crushes the dim channels of a saturated
colour to 0. A "true" indigo albedo (82,64,150) showed as pure royal blue (0,19,139). The albedos in `PAL` are therefore
greyed. They were solved through an emulation of that curve (`.tmp/akari-swim-b/agx.mjs`) fitted to in-game samples:
indigo 110,86,138 → about 43,32,118 in shade and 135,100,169 in full sun; violet 152,98,156. Garment shade colour: 1,0.66,0.84.
Judge any change in the game, not on the CPU sheet (the CPU sheet shows them lighter and greyer than the game does).
`SWB_CAL="r,g,b;r,g,b"` paints the top and the shorts rows with trial colours for such a test (never install a trial).

## Layers and chains
No `akari_under` node: the swimsuit is the always-worn layer. Nodes: akari_face, akari_body, akari_hair, akari_ribbon,
akari_swim_top, akari_swim_shorts, akari_swim_sandals, akari_swim_wrap, akari_swim_anklet. Materials: cloth_white (top,
shorts, straps; double-sided), cloth_red (wrap), cloth_trim (piping, gold, soles).
secondaryChains: Hakama 1, 2, 3, 4, 6, 8, 10 (wrap; joint 01 only, the wrap ends above joint 02); Charm (the knot's two ends);
RibbonL / RibbonR (bow). The SashTail joints sit at the centre back, 20 cm from the knot at the left hip, so the knot ends
use Charm instead (see the report to the lead). Skeleton, inverse binds and rest pose are identical to the base
(compareSkeleton: same).

## Numbers (build of 2026-11-18)
67 879 triangles in all (budget 70 000). Top 6 626, shorts 9 202, sandals 3 703, wrap 2 572, anklet 432, body 19 870 after
cull. 4.39 MB.
Coverage: 2 378 zone triangles (the under-top chest band and the shorts' pelvis zone from akari_under + regions.json) over
39 poses (rest, clip poses incl. Roll, Land_Hard, Sit_Ground, Kneel, Broom, and 10 stress poses), 48 views each, at most
3 px allowed: 0 fails. Skin swung OUT past her outline by the body's crotch skinning (Roll@0.5) is reported as
`culledSkinOutsideOutline` and is not a window.

## Rebuild
```
SCULPT_THREADS=2 node tools/costume/swim_b.mjs                 # build + coverage check; copies to assets/ only if it passes
SCULPT_THREADS=2 node tools/costume/swim_b.mjs --install-only  # re-check the shipped glb, then patch the manifest entry
SCULPT_THREADS=2 node tools/costume/swim_b.mjs --check-only    # coverage only
node tools/play.mjs --name swb_gN --script .tmp/akari-swim-b/play/g.js --size 1920x1080 --quality high --timeout 480 \
  --params "dynres=0&akari=swim_b"                            # in-game look (poses held by stepping the rig by hand)
```
Field pieces are cached in `.tmp/akari-swim-b/cache` keyed by their sources. A change to `akari_swim_b.mjs` re-contours all
three pieces (about 1 minute), and the coverage check takes about 1 more.
