# life — ambient small life (as built, upgrade 3)

Owner files: `src/world/life.js` (system, `G.life`), `src/world/life/meshes.js` (the five instanced bodies and their
shaders), `src/world/life/kinds.js` (species, group behaviours, where they live). System order: right after
`landforms`. Boot text key `core.boot.life`. URL `?nolife=1` skips the whole system (A/B).

Purely visual: no colliders, no physics bodies, no interactables, no save state, no gameplay events emitted. It does
not duplicate `src/fx/ambient.js` (pollen, petals, maple / ginkgo leaves, fireflies, spores stay there).

## What lives where

Groups spawn in a ring around the heroine (biased ahead of the camera) where the land suits them; the Veil value AT
THE SPOT (`G.world.veilAt`, same weights as fx/ambient.js) chooses the land, so borders blend. Far groups fade out
(scale, no pop) and are recycled.

| land | group id | what |
|---|---|---|
| 曦光原 | `songbirds` | sparrow flocks pecking and hopping on open ground; burst up when she comes near, circle, settle again (elsewhere if she stays) |
| | `swallows` | swallows swooping low round her (follow her lazily, leave when she changes land) |
| | `butterflies` | butterflies over meadows away from roads; settle on flowers with wings closed upright |
| | `bees` | bees darting between flowers on 向日丘 (POI `sunhill`) |
| | `dragonflies` | dragonflies hovering and darting at water edges (also 薄暮) |
| | `fish` | fish shadows under the surface; now and then one breaks it (`G.water.ripple`) |
| coast / peaks | `gulls`, `gullsky` | gulls standing on beaches; gulls wheeling over the sea near the shore |
| | `eagles` | eagles circling high over 霜见岳 (MOUNTAIN ellipse) |
| 薄暮林 | `crows`, `crowsky` | crow flocks on the ground; crows wheeling against the sunset |
| | `geese` | a V skein crossing the sky, 40–55 m up |
| | `moths` | moths orbiting stone lanterns and the great lanterns (data/world.js) |
| | `frogs` | frogs on river banks: throat pumping, small hops, a leap + ripple into the water when she comes near |
| | `cranes` | cranes standing in lake shallows (ground −0.15…−0.65), long feeding dips, slow heavy take-off |
| 常夜原 | `glowmoths` | glowing moths (bloom) drifting low over the dark meadows |
| | `lightfish` | light-fish (HDR, bloom) in any deep water — the palace moat included |
| | `bats` | bats flitting round her |
| | `jellies` | lantern-jellies (additive, pulsing) drifting 2–7 m up over the dark shore |

## Reactions
- **The heroine** is a moving threat: per species radius (sparrow 6.5 m, crow 9, gull 8, crane 12, frog 3.6, fish
  3.5, insects ~2), × 1.6 when she sprints, glides or rides the broom.
- **Blasts**: listens to `element:applied` (radius 6 + 2.5·radius), `element:reaction` (14), `spell:cast` (7),
  `physics:impact` (speed > 4, 9), `enemy:killed` (10), `prop:broken` (8), `player:land` (speed > 8, 10). Threats live
  0.5 s. Other systems may call `G.life.scare(pos, radius)`.
- **Wind**: insects and jellies drift with `G.elements.windAt` (one call per group per frame); circling birds' thermals
  drift with it; flocks circling after a scare lean into it.

## API (`G.life`)
- `enabled`, `root` (Group), `meshes` { bird, insect, frog, fish, jelly }, `groups` (live list, read-only)
- `setEnabled(on)` — show / hide all (clears groups when off)
- `scare(pos, r = 10, k = 1)` — make everything near flee
- `spawn(id, x, z)` — tests: spawn a group of that id at / near (x, z), ignoring the land check
- `clear()`, `stats()` → { groups, counts per body, by group id, ms (EMA of update cost), drawCalls, threats }

## How it is drawn (rules for other systems)
- FIVE draw calls at most, one `InstancedMesh` per body, `frustumCulled = false`, no shadow casting / receiving, never
  on layer 5. Instance caps on 'high': bird 96, insect 110, frog 10, fish 24, jelly 12.
- All motion of wings / legs / neck / head / tails / bells is in the vertex shader from per-instance attributes:
  `iColA`, `iColB` (vec3), `iAnim` (phase, amplitude, fold, glow), `iShape` (vec4, per body — see meshes.js header).
  The CPU writes only matrices + those four attributes for the live count (update ranges, not the whole buffer).
- bird / insect / frog are `MeshToonMaterial` + `hookMaterial()` (surface `none`, rim 0.55, wrap 0.55; insects
  trans 0.5) so the three lands light them like everything else; painted shading (back / belly gradient, AO, darker
  primaries) is baked into a vertex attribute (`color.g`), a cream belly / beak / leg accent into `color.b`. Glow-moths
  add `diffuse × glow` to the emissive (blooms at night).
- Insect wing shapes and patterns (butterfly border + spots, moth mottling + eye spot, dragonfly veins, bee ovals) are
  cut and painted in the fragment shader from wing UVs — one quad pair per wing.
- fish (unlit, alpha, `renderOrder −5`, after the water) and jelly (unlit, additive, HDR, `renderOrder 5`) are
  MeshBasic patches — they are a shadow / a light, not lit surfaces.
- Quality: instance caps and group counts × 1 / 0.65 / 0.3 (high / med / low) — 'low' keeps about one group of each.

## Spawn manager
Every 0.35 s the three neediest group types (want − have, want = max × tier × land match at her spot) try a spawn;
a type whose spot finder fails (no shallows / lanterns / flowers in reach) rests 3–6 s so it cannot starve the others
(before this fix one unplaceable type — cranes away from the lake — kept 薄暮 / 常夜 empty). After ~9 s at a spot on
'high': 曦光 sunflower hill 8 groups (22 butterflies, 16 bees, 5 swallows, gulls), 薄暮 bamboo 7 (crows on the ground
and wheeling, a geese skein, fish), 常夜 mushroom meadow 6 (18 glow-moths, lantern moths, bats).
Companion groups (`follows`: swallows, bats, geese) leave when she walks into a land that does not suit them.

## Measured cost
1440×900 'high', game camera, A/B ×4 toggling `G.life.root.visible`, best p25 of `renderFrame + gl.finish`, machine
load 95–145 (five colleagues) — the GPU numbers are NOT trustworthy beyond "inside the noise":
- 曦光 (31 agents live): on 14.9 ms / off 14.6 ms; 3 draw calls (bird, insect, fish); +~2 k triangles
- 薄暮 / 常夜: differences ±0.3 ms either sign
- CPU update (`stats().ms`, EMA): 0.20–0.31 ms per frame with 6–8 groups / 30–45 agents
- Draws: 2–3 typical, 5 max (budget 12). No shadow-map draws.

## Known shortfalls
- At the game camera (6 m behind her) most of the life reads as small specks: butterflies / moths were sized up
  (0.13 / 0.11 m half-span) but a player notices them mainly when they move or burst. Birds on the ground are seen
  best when she walks into a flock. A bolder pass would add a few "hero" groups placed on the paths ahead of her.
- The CPU cost (0.2–0.3 ms) is on the main thread and grows with agents; the 0.5 ms budget holds on 'high' with the
  default caps but would not with all caps full.
- Birds are one generic body (spindle + wings + fanned tail); species read through size, colour, neck / legs and
  motion, not silhouette details (no crest, no forked swallow tail, bats have bird wings with a fast flutter).
- No feet IK: perched birds / cranes stand on `heightAt`, so on a roof or a platform they would float or sink — group
  spots avoid reserved ground (settlements), so they never perch on buildings.
- Fish are surface decals (no refraction / depth fade); they read as shadows by day, they are not visible fish.
- No sound (no birdsong, no wing flutter, no frog chorus) — audio owner.
- Flocks do not avoid trees / cliffs while circling (they fly high enough in open spots, but a circle can clip a
  tree crown in the forest).

## Hero moments (final-beasts round, 2026-11-14)
A few fixed groups placed where a player walks, larger on screen than the ambient specks, same five instanced bodies (no new
draw call, no new mesh), every tier (`lowFloor`). Defined in `life/kinds.js` (`HERO`, `heroFind`, `heroPerchInit`, `koiInit`,
`heroMothFind`), spawned by the normal manager when she is within reach of the spot:
| group id | where | what |
|---|---|---|
| `hero_sparrows` | 向日神社 stone stairs (`STEPS`, builders/shrine.js) | 8 sparrows (0.44 m, was 0.3) pecking on the treads (`env.groundAt`, so they stand on the steps); burst up as she climbs, circle, come back to the stairs once she has passed |
| `hero_crows` | two torii of the 千本鳥居 tunnel (`TUNNEL`, builders/dusk.js) | 4 crows (0.68 m) in a row on the top beam, no hopping; lift off when she walks under, return to the beam |
| `hero_heron` | lake shallows nearest the 镜湖 ferry pier | a grey heron (1.2 m, new kind `heron`) wading; slow heavy take-off |
| `hero_koi` | deep water nearest the pier end | 5 koi decals in orange / white / gold (0.75–1 m) turning slowly inside 4.5 m |
| `hero_moths` | lamps of 万灯镇 within 30 m of her (`env.lamps` = `G.sky.lampList()`, **not yet provided by sky.js — requested**; until then this group never spawns) | moths (0.16 m) orbiting the lamp heads, up to 3 lamps |
| `moths` (ambient, changed) | stone lanterns and great lanterns, as before | now the larger `mothH` (0.16 m half-span, was 0.09) |
Mechanics: perching groups may carry `g.groundFn(x, z)` (perch height), `g.noHop`, `g.fixed` + `g.landAt(agent)` (return to
the same perch instead of settling elsewhere); fish groups `g.R` (home radius). life.js passes `groundAt` and `lamps` (`G.sky.lampList?.()`, an array of {x, y, z}) in the
find / init env. Spot positions are copied from the builders' constants: if the shrine stairs or the torii tunnel move, update
`STEPS` / `TUNNEL` in kinds.js.
Cost: + up to ~30 agents near those spots (bird cap 96 unchanged), the same ≤ 5 draws; CPU per agent as the ambient ones.
