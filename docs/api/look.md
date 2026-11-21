# look — lighting model, shadows, surface detail, atmosphere on surfaces, post chain (as built)

Owner files: `src/render/veilhook.js`, `src/render/surfaces.js`, `src/render/shadows.js`, `src/render/post.js`,
`src/render/atmo.js`, `src/render/skydome.js`, `src/render/noise.js`, `src/world/sky.js`, `src/core/mats.js`.

Every lit material in the game (MeshToon / Lambert / Phong / Standard / Physical, with instancing, batching, skinning,
morphs and vertex colours) goes through `hookMaterial()` (core/mats.js); `toon()` / `flat()` / `own()` do this for
you. The hook (veilhook.js) replaces the sun lighting, the ambient, the shadows and the fog of the material, so the
whole world shares one look. Materials you build by hand MUST call `hookMaterial(m)` too.

## 1. Lighting model (per fragment)

- **Sun**: one stylised term from the Sun (`directionalLights[0]`). Soft wrapped terminator + one crisp cel band
  (`smoothstep(-0.03, 0.09, N·L + detail)`); the band edge is broken by the surface height so terminators look
  brush-painted. Lit side = `0.25 + 0.75·N·L`, shadow side keeps a small wrapped glow. Direct sunlight is still scaled by
  the daylight at the fragment's own xz (Veil) and tinted by the local sun colour.
- **Coloured shadows**: where the Sun does not reach (cast shadow, terminator, under the Veil) the ambient is filled
  with sky-scattered sunlight and shifted toward the land's shadow colour (`atmo.js` row `shadowTint`): clear blue in
  the meadow, violet-rose at dusk, indigo with a hint of teal at night. Nothing goes grey or black.
- **Ambient**: sky / ground hemisphere from the palette (`hemiSky`, `hemiGnd`) + **bounce** (`bounce` row × local sun)
  on down / side facing surfaces.
- **Rim**: fresnel rim biased toward the Sun and strongest when back-lit; under the Veil a golden rim + fill from the
  ring (scaled by the material's `rim` knob too).
- **Specular** (opt-in): small stylised highlight with a crisp edge. **Translucency** (opt-in): back-lit glow for
  leaves / paper.
- Near-light soft clamp (fire, pooled point lights) and the final soft clamp are unchanged (fix2).

### Per-material knobs: `material.userData.look`
Read when the material compiles; call `G.look.refresh(material)` after changing them at runtime.

| knob | default | meaning |
|---|---|---|
| `rim` | 0.3 | sun rim strength (characters 0.6) |
| `spec` | 0 | stylised specular strength (lacquer 0.15, tiles 0.25, metal 0.6, crystal 0.5) |
| `specPower` | 24 | highlight tightness |
| `wrap` | 0.4 | how far the soft light wraps past the terminator on the shadow side |
| `shadowTint` | 1 | how much the shade takes the land's shadow colour (skin 0.35 — warmer) |
| `trans` | 0 | back-light translucency (flora materials default 0.55, leaf colours 0.4, paper 0.35) |
| `detail` | 1 | surface-detail albedo amplitude multiplier |
| `bump` | 1 | surface-detail normal strength multiplier |
| `fine` | 1 | fine speckle multiplier |
| `scale` | per kind | metres per texture tile (overrides the kind's scale) |
| `band` | 0 | shifts the cel band (+ = more of the surface lit) |

## 2. Surface detail: `material.userData.surface`

`src/render/surfaces.js` paints a library of tileable textures at boot (one `DataArrayTexture`, 12 × 256², ~230 ms):
R = albedo modulation, G = height, BA = height gradient. The hook maps it in WORLD SPACE (no UVs needed): a top
projection oriented down the slope (thatch strands and tile rows run down roofs) + a side projection aligned with the
face on planar surfaces (classic X/Z pair on curved ones). Three scales, all distance-faded and mipmapped (stable):

1. macro colour drift (painted wash, warm / cool) — every detailed material;
2. the material pattern (fades out 40–110 m);
3. fine speckle of the same pattern 4.3× smaller (fades out 6–22 m; off on 'low').

It modulates albedo, bends the shading normal and feeds the cel band.

| kind | m/tile | use for |
|---|---|---|
| `paint` | 3.2 | generic painterly brush strokes — the DEFAULT for every untagged lit material |
| `wood` | 1.6 | planks + grain (grain runs vertically on walls / posts) |
| `plaster` | 2.6 | lime plaster walls |
| `stone` | 2.2 | cut stone blocks, steps, plinths, lanterns |
| `rock` | 5.5 | natural rock, cliffs, floating islands |
| `thatch` | 1.5 | straw roofs (courses + strands down the slope) |
| `tile` | 1.8 | kawara roof tiles |
| `cloth` | 0.45 | cloth, banners, noren (subtle) |
| `paper` | 1.1 | shoji / washi, lantern paper |
| `metal` | 1.4 | bronze, iron, gold |
| `earth` | 2.4 | packed earth, clay |
| `bark` | 1.3 | tree trunks |
| `none` | – | no detail at all (faces, skin, hair, glow, UI-like props) |

Tag through the factories: `toon(0x8b5a3c, { surface: 'wood' })`, `flat(c, { surface: 'rock', look: { bump: 1.5 } })`,
or directly `m.userData.surface = 'stone'` before the first render (then `G.look.refresh(m)` if it already rendered).

**Automatic guess** (existing calls): toon()/flat() look the colour up in the palette (exact, else the nearest PAL
colour within sRGB distance 34): wood colours → wood, trunks → bark, vermilion → paint + small spec, plaster →
plaster, paper → paper, thatch / straw → thatch, roof tiles → tile, stone → stone, rock / snow → rock, dirt / sand →
earth, gold → metal, skin / hair → none (+ character rim), miko clothes → cloth (half strength), crystals → none +
spec. Unmatched low-saturation `flat()` colours → rock; everything else → paint.
Never detailed: skinned meshes, materials with a `map`, transparent materials, and materials named `flora*`,
`terrain*`, `water*`, `grass*` (they have their own detail).

## 3. Shadows (`render/shadows.js`)

Three cascades (two on 'low'): the Sun is cascade 0; cascades 1–2 are extra DirectionalLights with intensity 0 that
only own a shadow map (named `mvSunCascade1/2`, so three renders them with every caster's customDepthMaterial,
alpha test and sway). Each cascade is an orthographic box in the fixed light space, centred ahead of the camera
(cascade 0 on the heroine), snapped to its own texel grid (no shimmer).

| tier | cascade half-extents (m) | map sizes | far cascade refresh |
|---|---|---|---|
| high | 15 / 52 / 180 | 2048 / 2048 / 1536 | every 3rd / 6th frame (draw-call pass; was 2nd / 4th) |
| med | 18 / 60 / 170 | 2048 / 1024 / 1024 | every 3rd frame |
| low | 24 / 110 | 1024 / 1024 | every 2nd frame |

The hook picks the first cascade that covers the fragment (9-tap Poisson PCF on hardware compare, no noise), blends
across cascade borders and fades out past the last one. Shadows only remove the Sun; the shade keeps the coloured
ambient (never black). Deep under the Veil no map is re-rendered. `G.look.shadows.frozen = true` stops map updates.

Casters: anything with `castShadow`. Note the far cascade only shows what casts: structures cull casters beyond
80/70/58 m and flora beyond 52/42/30 m from the heroine (their files).

**Draw-call pass (2026-11-14, docs/api/perf.md "Draw-call pass")** — what each cascade draws. shadows.js wraps
`THREE.Mesh.prototype.intersectsFrustum` (three's own test runs first) and tells the passes apart by the frustum
object (`shadow._frustum` of each cascade; anything else = main / mirror). A frustum-culled caster is skipped in
cascade *i* when (a) its shadow capsule (its sphere swept down the light to 60 m under the focus / ground) misses the
camera frustum cut at the cascade's reach, or (b) for *i* > 0, its light-space footprint lies inside cascade *i−1*'s
exclusive box (the hook reads map *i* only within 0.07 / 0.05 UV of that box's edge and outside it), or (c) for
*i* > 0, its radius is under one texel of cascade *i*. Instanced groups: count 0 is never drawn, and the group is
drawn only if one instance passes (a)–(c) in that pass (any pass: one instance inside the frustum). Maps that are
reused (`every` > 1) are culled with a wider frustum (+0.12 / 0.2 rad) and margins (1.5 / 4 m) and re-render at once
when the camera turns / moves past them or the inner cascade's box moves past the margin — a culled caster can never
be missing from a texel that is read. 'high' refresh is now 1 / 3 / 6 frames (was 1 / 2 / 4), staggered so the outer
maps never render in the same frame. Prop kits (`props:*` InstancedMesh with frustumCulled = false) are adopted:
frustumCulled = true, tested per instance from the live matrices (any InstancedMesh can opt in with
`userData.mvCellCull = true`). `G.look.shadows.cullStats` = `{ culled[i], inst, zero, renders[i] }` counters.
Off: `?dcull=0` (or `?perf=0`). Objects with frustumCulled = false (terrain, flora batches, characters) are untouched.

The sun-transmission map integrates the sky's 3D cloud density along the solar direction.
Terrain, foliage, characters, water highlights and their reflections sample it at the receiver's world position.
In an aerial view the closest shadow map follows the rider and the outer maps follow the visible ground.

## 4. Atmosphere on surfaces
Height fog whose colour blends the camera's air with the fragment's air (unchanged), with sun / ring in-scatter, plus
aerial perspective: distant surfaces lose saturation toward the air colour before they dissolve into it.

## 5. Post chain (`render/post.js`, driven by `world/sky.js`)
The HDR scene pass uses GTAO on high quality. It integrates light shafts up to the first visible surface and
attenuates them with cloud and geometry shadows. Exposure and bloom precede tone mapping.
The grade adjusts luminance contrast around middle grey with fixed black and white endpoints.
Solar elevation and eclipse coverage blend the automatic daylight, dusk and night grades.

| tier | MSAA | AO | bloom | shafts | sharpen | detail fine scale | cascades |
|---|---|---|---|---|---|---|---|
| high | 4 (also at pixel ratio 1.5) | GTAO | yes | yes | 0.6 | yes | 3 |
| med | 2 at retina, else 4 | – | yes | yes | 0.5 | yes | 3 (smaller) |
| low | FXAA | – | – | yes | – | no | 2 |

`GRADES` presets gained `vib` (vibrance: extra saturation for muted colours only).

## 6. API summary
- `core/mats.js`: `toon(color, { surface, look, ...MeshToonMaterial params })`, `flat(color, { surface, look, ... })`
  (all old calls unchanged).
- `render/surfaces.js`: `SURFACES` (kind → { index, scale, amp, bump, fine }), `SURFACE_NAMES`, `surfaceTexture()`.
- `render/veilhook.js`: `veilHook(m)` (unchanged), `refreshLook(m)`, `surfaceOf(m)`, `LOOK_DEFAULTS`.
- `render/atmo.js`: new palette rows `shadowTint`, `bounce` (GLSL `MV_ROW_SHADOW`, `MV_ROW_BOUNCE`); new shared
  uniforms `mvSurf`, `mvNoise`, `mvCloud`, `mvQ`.
- `render/shadows.js`: `setupSunShadow()` returns `{ half, focus, cascades, frozen, update(daylight) }`.
- `G.look = { surfaces, defaults, uniforms, refresh(m), set({ detail, fine, clouds, debug }), shadows }`.
  `G.look.set({ debug: true })` paints the surface pattern as albedo (to check tags).

## Round 2 (environment round 2, 2026-11-13)

### Light surfaces
- `CLAMP_FINAL` (veilhook.js) knee **0.85**, ceiling **1.5** (was 1.0 / 1.75), hue-preserving on the max channel. Pale
  stone, plaster and white cloth in full sun used to sit in the flat top of the ACES shoulder and read as white; now
  they keep colour and texture under the bloom threshold. Emissive is added after the clamp, so lamps and glow are
  unaffected. Anything that should glare (sun glints, magic) must go through emissive.

### Post (`render/post.js`, presets in `world/sky.js`)
- **SMAA** on top of 4× MSAA on **high** (`G.post.set('smaa', on)`), run on the graded sRGB image. Not temporal, so
  nothing smears in motion (heroine, grass, particles). Sharpen lowered 0.6 → 0.5 on med / high so SMAA + sharpen do
  not re-crisp the alpha edges. med: MSAA 4 (2 on retina); low: FXAA.
- **Opaque capture for refraction**: `G.post.captureOpaque(renderer)` → `{ color, depth, width, height }` or null.
  Call it from a transparent object's `onBeforeRender` while the main scene draws (it returns null otherwise). It blits
  the scene target's colour + depth (MSAA-resolved) into its own target, once per frame (later callers in the same
  frame get the cached result). The multisampled scene buffer is untouched. The water is the only user today; any
  other refracting surface (crystal, ice, glass) may use the same capture for free.

### Rules for other systems
- Light albedo (> ~0.8 linear) on lit surfaces is fine now; do not pre-darken textures to dodge the old burn-out.
- Do not create your own copy of the opaque scene; use `captureOpaque`.
- A material that should look different from far away in the impostor bake must not rely on `onBeforeRender` state
  (the bake renders the near model with its own bake shader).

### Frame cost (round 2)
- See the report numbers: the machine was heavily loaded (load average 15–75 during the run), so per-layer numbers were
  measured interleaved A/B (renderFrame + gl.finish, p25 of 8, median of 5 reps) and are noisy; treat them as ranges.

## Round 3 notes (u3-atmos)
- Fog now carries aerial perspective per land (blue / warm / violet) and valley ground mist (veilhook, `U.mvQ.z` scales the mist). Hand-made shaders that include GLSL_ATMO fog get both for free.
- In the planar-reflection pass `U.mvQ.xy = 0` and `U.mvCloud.w = 1`. The mirror samples the same moving cloud shadows as the main scene and skips triplanar detail and cascade lookups.
- The shadow term in the grass shader and the contact shadows under characters (`mvContact`) were checked: the heroine's shadow reads on the grass carpet. Layer 5 is enabled on the cascade shadow cameras when they are created.

## Performance pass (2026-11-14, see docs/api/perf.md)
- `post.js`: GTAO and its Poisson denoise read view normals from a shared half-res RGB8 target built once per frame from
  the depth (same reconstruction as three's); before, the denoise rebuilt them from 9 depth taps for each of its 13
  taps. `opt.aoNormals = false` / `?perf=0` = old path.
- `post.js` `pipe.setRenderScale(pr)` / `G.post.setRenderScale(pr)`: the pipeline can render at a lower pixel ratio than
  the canvas (dynamic resolution); `pipe.size` / `G.post.renderSize` is the internal size. `skydome.renderLow(r, cam,
  size)` takes it so the half-res sky layer lines up.
- The canvas is created with `antialias: false` (the scene target has its own MSAA).
- `?msaa=<n>` overrides the scene MSAA samples (tests only).

## Look round — surfaces (2026-11-14, built surfaces painted, not printed)
- **What the look is now.** Every layer of `render/surfaces.js` was repainted: a few big soft washes + a handful of
  deliberate marks (plank seams with a worn lighter lip, butt joints, rare knots; plaster streaks and one or two
  hairlines; stone mottling, soft chisel facets, wobbly cracks, rare chips, pale lichen; thatch courses with a shaded top,
  a ragged lit cut edge and a dark gap; kawara rows with a crown sheen line, dark column gaps and the lip shadow). No
  per-texel speck, no 48–90-per-tile grain. Heights are smooth except at the marks, so the bent normal and the cel band no
  longer speckle. `stone` no longer draws running-bond blocks: the geometry makes the joints (course stones, slabs).
- **Fine speckle almost off**: `fine` is 0–0.12 per kind (was 0.25–0.6); `paint` and `plaster` have none.
- **Scales**: paint 4.0, plaster 3.2, stone 2.2, rock 6.0, earth 2.8, cloth 0.6, paper 1.2 m/tile (the rest unchanged).
- **Per piece, baked** (`world/builders/kit.js` `shadeBaked`): `bakeKeep` records each mesh's vertex range per material
  (same traversal as `bakeStatic`; dropped silently if the totals do not match) → every stone / plank / post gets its
  own value (stone ±16 %, wood ±7.5 %, plaster ±2.5 %) and a slight warm / cool shift; pieces taller than 0.25 m get a
  gradient up the piece (darker low, sun-bleached high); stone sides get a lit top arris and a darker lower joint.
  Ground contact is now a broad soft gradient (2.2 m) + a narrow warm damp band (0.7 m); the old green moss stripe on
  slab sides is an olive-dark patchy tint; under the eaves the stain is darker and warmer.
- **Real bevels**: `bevelBox(w, h, d, mat, x, y, z, b)` (kit.js) — a box with chamfered top edges, 20 triangles, cached
  per size. Used for the shrine approach slabs (also slightly varied in size and set) and the foundation course stones.
- **Props** (`props/models.js` `paintParts`): every lit kit part gets a baked foot-to-top value gradient (warm damp foot,
  lighter top; rolling props only the top light) via a cached vertexColors clone of its material; every prop instance has
  its own tone (0.93–1.03, `props/prop.js`, visual only, never saved).
- **Rules for other systems**: tag materials with the right `surface`; do not add your own noise texture on top — the
  painted layers are meant to be quiet. Want variation? Build separate pieces (they get their own tone) or use
  `bevelBox` for stones that show their edge. `look.fine` > 0.2 brings the grain back; avoid it.
- **Cost**: draw calls +0 (no new materials in a bake; the props' vertexColors clones replace their originals 1:1).
  Shader work unchanged (the application in veilhook.js was not touched). Texture memory unchanged (12 × 256² RGBA8 +
  mips ≈ 4.2 MB); generation 130–200 ms at boot (was 100–230). Triangles: +8 per course stone / slab (20 vs 12) — a few
  thousand in the whole world. Boot CPU: one extra pass over each baked mesh's vertices (piece bounds) inside shadeBaked.

### Surfaces revision r2 (after the art-director review)
- **Thatch roofs carry a real UV map** (`render/surfaces.js` `thatchMap()`, 256², `THATCH_TILE` = 1.5 m): straw bundles
  ~0.15 m wide of uneven width, laid in courses (2 per tile) whose butt ends are staggered per bundle, a lit ragged cut
  tip and a soft shadow under each butt. `roofGeometry` gives grid roofs (thatch hip and gable) `uv`: u around the eave
  ring (continuous across the hips; the ring is an integer number of tiles, the one seam sits under the (-x, +z) hip
  roll and seam triangles are lifted by one ring), v = slope length from the eave, negative uphill. Why: on a ~45° roof
  the hook's triplanar blends the top projection (v downhill) with the side projection (v = height, uphill, u sometimes
  mirrored), so any course pattern mushed into a smudge. The thatch roof materials (`M.thatch()`, `mat.thatch(c)`) are
  `flat` + `map` with **smooth** shading, `look.detail = 0` (no triplanar), colour divided by the map's mean; the four
  corner texels hold the mean, so a mesh merged into that material without UVs (zero uv after a bake) keeps the plain
  colour. The eave is one thick clean edge: the lower line of the cut bands only swells gently (no per-segment teeth);
  the outer lip samples the lit tips of the last course stretched down the face.
- The `thatch` triplanar layer (still used by cut faces, ridge rolls, bales, rope) is now bundles side by side with long
  strands, no horizontal courses.
- **Carved stone** (`shadeBaked`, surface `stone` only): a per-vertex crevice term (point-based: neighbours within 0.2 m
  in front of the normal, spatial hash, ≤ 40 neighbours) darkens and olive-tints concave places (under the lantern roof,
  between petals, pedestal joints); soft top light by the normal (tops pale and slightly warm, undersides ×0.82 and
  cool); the moss at the foot of stone is olive, not black. The `stone` layer gained sparse soft pits / worn spots at
  ~0.25 m. `PAL.stone` / `stoneDark` are a warmer grey (0xa29e96 / 0x6b6862, were blue-grey).
- Terrain dirt yards and town paving (g4, g6) are the ground artist's (`terrain/detail.js`, `terrain/shader.js`): a
  proven patch is filed as a request (`.tmp/look-surface/r2/request_terrain.patch`).
- **Cost**: draw calls +0 (the mapped thatch material replaces the old one 1:1). Texture memory +0.35 MB (one 256² RGBA8
  + mips). Per pixel on thatch roofs cheaper: one map fetch instead of three triplanar `textureGrad` + fine. Vertices
  +0 (the roof top is made non-indexed before the bake, which did that anyway). Boot CPU: map ~15 ms; crevice pass a
  few ms per site (stone vertices only).
- Rules: build new straw roofs with `makeRoof` + `M.thatch()` / `mat.thatch(c)` so they get the UVs; a hand-made thatch
  mesh needs its own `uv` (u along the eave, v down the slope, 1 unit = 1.5 m) or it shows the plain colour.

## Look round (light, shadow, air, final image — 2026-11-14)
What the look is now:
- **Key and fill.** By day the Sun is the key and the sky only fills the shade: the scattered sunlight kept in shade
  dropped from 0.15 + 0.75 to 0.06 + 0.2 (`MV_FILL_LIT` / `MV_FILL_SHADE`, veilhook.js), and the sky hemisphere `hemiSky`
  from k 1.25 / 1.3 / 1.9 / 3.2 to 0.8 / 0.88 / 1.0 / 0.5 (atmo.js). Lit : shade on flat ground is about 4 : 1 (was 2.4 : 1);
  the shade keeps the land's cool `shadowTint`, the key is slightly warm (`sunTint` 0xfff1de), bounce unchanged.
- **Night key.** New palette row `moonKey` (GLSL `MV_ROW_MOONKEY`): a cool cel-banded light from the Moon wheel (same
  direction as the Sun), 0 by day, 0.4 at deep dusk, 0.85 at night; it takes the cast shadow while the maps still
  render (dusk), the contact term after that. The golden-ring wrap fill went 0.38 → 0.2 (`MV_RING_FILL`). Night ambient is
  much lower, so warm lanterns, windows and her own lantern make pools against a cool, darker land.
- **Tone curve.** The grade pass now uses an AgX-style filmic curve (log encoding + sigmoid, three's constants) with
  exposure `uToneExp` 1.2, log-domain contrast `uToneCt` 1.25 and look saturation `uToneSat` 1.25: a gentle toe, a
  long hue-stable shoulder, primaries pulled back. `?tone=0` or `G.post.set('tone', false)` = the old ACES fit (A/B).
- **Grade.** `GRADES` gained `knee` (saturation knee: the loudest colours are pulled back, muted ones kept); lift is
  nearly zero (raised blacks were half of the flat look); gain warms the lights, `sh` cools the darks; vignette 0.12–0.22.
- **AO.** GTAO radius 2.2 m, scale 1.2, thickness 3 (was 1.6 / 1.15 / 2.5); in the composite it is deepened (pow 1.5) and
  sinks toward a cool shade instead of grey. Same passes and sample counts.
- **Air.** Aerial perspective reaches the middle distance sooner (×2.4 of the fog amount, was ×1.6; mix 0.48) and moves
  the VALUE of far things part-way to the air (darks lift), so near / middle / far planes step back.
- Shadows: unchanged maps and filter (9-tap Poisson on hardware compare: clean, no dither); they read now because the
  shade is no longer filled back up.

Rules for other systems:
- Do not add your own fill / ambient boost to make a surface "readable in shade": the shade is meant to be ~¼ of the
  light. If a material must stay brighter, give it emissive or `look.band`, not extra ambient.
- Grass (`flora/grass.js`) multiplies its indirect light by 0.62 in cast shadow on top of the hook: with the new fill this
  is a double darkening; it should drop to ~0.85 (request filed).
- Night scenes are now dark between light sources: anything that must be found at night needs its own glow / lantern.
- Hand-made shaders that tone-map themselves must not: everything goes through the grade pass.

Cost: no new passes, no new draw calls, no new render targets, no texture memory (one more row in the existing 64×16
palette texture). Per fragment: the moon-key term (one palette fetch + a few ALU) on every hooked material, AgX instead
of ACES in the grade (×5 because of the sharpen taps: 5 log2 + 5 pow per pixel, roughly the same as the ACES rational),
two extra ops in the AO composite and the aerial term. GTAO radius only changes which texels the 12 samples hit
(slightly worse cache use). Draw calls in the golden shots unchanged by this work (649–924, set by the scenes).
Anti-aliasing: MSAA 4 + SMAA kept (decided against TAA: flora relies on alpha-to-coverage, there are no motion vectors
for skinned / swaying meshes, so a history resolve would ghost or flicker; the dither sources are filed with the owners).

### Look round, revision (light r2)
What changed after the art review:
- **Key light lower than the disc.** `KEY_DIR` (render/shadows.js): the Sun wheel's azimuth at 32 deg elevation (the disc
  stays at 42 deg). The DirectionalLight and every cascade use it, so shading, cel band, moon key and cast shadows follow;
  the disc, shafts, water glint and cloud shadows keep `SUN_DIR`. Cast shadows are 1.6x the caster's height (was 1.1x):
  trees, figures, banner poles and eaves now throw shapes across the ground (g2/g3 trees, g1 banners and heroine, the
  diagonal eave edge on the g4 wall).
- **Contact shadow** under the heroine / people: radius 0.85 m (npc 0.7), core 0.82 with exp(-2q) (was 0.62, 0.72, exp(-2.6q)).
- **Lamp pools.** At night (camera veil > 0.45) the six lanterns nearest the view light the ground and walls through
  `U.mvLamp[6]` / `U.mvLampCol[6]` (veilhook ambient section): (1 - q)^2 falloff with the height halved, so a lantern at
  3-4 m pools 2-3 m wide on the paving; half-wrapped, no shadow. world/sky.js finds lamps by itself: every warm, bright
  glow() / glowDynamic() mesh (MeshBasic, toneMapped false, r >= 1.6 b) has its vertices clustered once (0.5 m cells,
  connected components; compact clusters only, so window panes are not lamps), lazily, one mesh per frame; lanterns
  within 2.6 m of a chosen one only widen its pool. Pool brightness follows the material colour, so dimming the town
  lamps (`setGlow`) dims the pools. Debug: `G.sky.lamps`. Night fill went down a step (hemiSky k 0.5 -> 0.34, ground
  1.3 -> 1.0, Moon key 0.85 -> 0.64) so the square between pools is darker and cooler.
- **Dusk rim.** The sun-facing rim (look.rim) grows up to 2.6x in the dusk band (4v(1-v)), so figures separate from crowns.
- **Aerial perspective grows with distance only**: the aerial weight is squared (foreground contrast back, far haze kept).
- **Tone contrast** `uToneCt` 1.25 -> 1.45 (log-domain): value range now wider than before the round in every shot.
- **Sharpness.** Most of the softness the review measured was dynamic resolution, not the AA: headless runs on a shared
  GPU drop the render scale to 0.85 and the last pass upscales bilinearly (edge energy g1 66 -> 92, g8 66 -> 97 with
  `?dynres=0`). The grade's sharpen now grows with the drop (`uSharp` + 3 x (1 - scale), capped 1.2). Golden shots for
  comparison must be taken with `--params dynres=0`. MSAA 4 + SMAA kept.

Rules: lantern-like light comes from glow materials, not PointLights (the pools find them); a carried / moving glow is
ignored. Shots for look comparison: `dynres=0`.

Cost (r2): no new passes, draw calls, render targets or textures. Uniforms: +12 vec (6 lamps). Per fragment: the
lamp loop breaks at the first unused slot, so by day it is one compare; at night up to 6 x (~14 ALU). CPU: one scene
traverse every 1.5 s at night (skips seen meshes), one glow mesh clustered per frame until all are known (the town:
379 lamps, a few ms in total spread over frames), selection over the known lamps each frame (a few hundred distance
tests). Golden draw calls unchanged (936 in the last full run, set by the scenes).

## Light r3 — image and light, round 2 (2026-11-14)
Before / after: `.tmp/final-light2/pairs/` (sbs_*, grey_*, crop300_*), runs `.tmp/final-light2/before` and `/final`
(script `tools/devkit/final-light2/shots.js`: golden g1-g8, g9 = shrine approach, n0-n7 = night dolly, 11 = render scale 0.77).
- **Sharpness.** (a) Dynamic resolution: the last pass used to be a bilinear stretch. When the render scale is below
  the canvas, a final `upscale` pass (post.js `UPSCALE_FRAG`) does a Catmull-Rom reconstruction clamped to the 2x2
  source footprint plus a contrast-adaptive sharpen against the source neighbours (0.4 + 2.6 x drop). At 0.77 it is
  close to full resolution (`crop300_scale077_full_bilinear_edgeaware.png`). It is disabled at full scale.
  (b) Steps: `DYNRES_STEPS` in core/boot.js are now fractions of the tier's pixel ratio: high 1 -> 0.92 -> 0.85 -> 0.77
  (a pixel-ratio-1 display used to jump straight from 1 to 0.85). (c) The grade's CAS is clamped to the neighbourhood
  (no ringing), so it went up: high 0.5 -> 0.8, med 0.5 -> 0.7. (d) Bloom: wide mips toned down (tints 1/.85/.6/.36/.2,
  radius 0.3 -> 0.15). The milky sheet over signs and facades at night is gone (`crop300_g6_sign.png`).
  (e) Haze: the base fog is x smoothstep(15, 60 m), aerial perspective x smoothstep(40, 100 m), ground mist starts at
  45 m (was 18 m). That was the grey wash on near fields.
- **Lamp pools.** Bug found: the six-slot loop sat inside three's unrolled hemisphere loop, so `mvLamp[ i ]` was
  rewritten to `[ 0 ]` and only ONE lamp ever lit. Replaced by `U.mvLampMap`, a 128 x 128 HalfFloat map, 1 m texels,
  camera-centred and snapped to 8 m. world/sky.js splats EVERY known lamp into it (cubic falloff; reach 2.4 + 3 x
  lantern size, up to 6 m; strength by lantern size, so festival strings give less than a post lantern). rgb holds the
  pool colour, pushed to amber so white cloth turns warm, not white. a = sum of lum x lamp height, so the shader gets
  the lamp height back. veilhook reads 3 taps (the value, plus x and z gradients that give the direction to the lamp
  for walls), applies a height falloff (1 - 0.018 dy^2)^2 and fades out at 40-56 m from the camera, then rolls off
  hue-preserving (knee 2.4, ceiling 4). The map is re-baked only when it moves, the lamp set or a brightness changes,
  or a newly found lamp fades in (0.8 s). Lamp clustering may now take up to 3 ms a frame, so a town reached by a jump
  lights up at once. Uniforms: `mvLampMap`, `mvLampBox` (origin x, z, 1/size, night k). `mvLamp` / `mvLampCol` are gone.
  Debug: `G.sky.lamps` = { known, used, bakes, origin, night }.
- **Sun direction.** The azimuth stays at 14 deg (the wheel has to sit over the Veil as you travel east; az 24 / el 30
  was tried and gave nothing in the golden shots, and the g5 heroine got worse). The **Sun wheel came down to 32 deg**
  (world/veil.js), the elevation the key already had, and `KEY_DIR` = `SUN_DIR` again. Disc, shafts, water glint, cloud
  shadows and cast shadows agree; cast shadows are unchanged (1.6x height). The wheel / ring now sits lower in east-facing
  frames. Cloud shadows: strength 0.42 -> 0.6, soft edge widened (cover -0.12 .. +0.24).
- **AO on foliage.** The AO composite tests the hue. Leaf green and blossom pink (saturated, green-max or red-max with
  blue > green) keep 35 % of the AO and none of its cool tint, so the gaps in crowns no longer turn violet
  (`crop300_g1_cherry.png`). Stone, wood, plaster and the vermilion torii keep all of it.
- Grass: the extra shade factor in flora/grass.js went 0.62 -> 0.85, as filed.
Cost: no new draw calls at full resolution. +1 full-screen draw only while dynamic resolution is below full scale (the
frame then has ~28 % fewer pixels). One 128^2 RGBA16F texture (128 KB), one more sampler on hooked materials, and 3
texture taps + ~25 ALU per hooked fragment at night only (by day it is one compare). This replaces the six-slot loop.
CPU: about 65k half-float conversions per bake, a bake every 8 m of camera travel (plus fades), ~21 bakes over the
night dolly. Golden draw calls in the final run: g1 549, g2 757, g3 660, g4 1022, g5 515, g6 584, g7 463, g8 932,
g9 730 (set by the scenes; the before run's counts were not captured, but nothing in this change adds scene draws).

## GPU pass (2026-11-16, docs/api/perf.md "GPU pass")
Same picture, cheaper per pixel / per vertex. Off: `?gpu=0` (or `?perf=0`); single changes `?gpuoff=sc,grade`.
- **Cascade coordinates per fragment** (`MV_SC_FRAG`): the hook no longer passes three's three `vDirectionalShadowCoord`
  varyings (12 floats per vertex); `mvCascadeShadow()` computes `directionalShadowMatrix[i] * (vMvWorld + n * normalBias)`
  from the interpolated vertex normal — the same linear quantity three interpolated — and only for the cascades it
  reads. Kept on the vertex path: flat-shaded materials (no `vNormal`) and any material whose own hook touches
  `worldPosition` before the shadow chunk (flora cards look their shadow up off the crown). **Rule:** if your
  onBeforeCompile moves the shadow lookup position, write to `worldPosition` (the hook then keeps three's path).
- **Contact shadows**: a contact slot is skipped where its term is exactly 0 (outside -0.9 < dy < 0.4) or below 6e-6.
- **Fog / aerial / mist**: skipped inside 15 m, where all of them are multiplied by an exact 0.
- **Post**: a tone pass maps HDR → display once per pixel and adds the bloom (the bloom's own full-res additive blend
  is skipped); the grade (sharpen, grading, vignette, dither) then reads display values. Before, the sharpen tone-mapped
  five times per pixel. `pipe.tone` sits between bloom and grade; on only where bloom or sharpen is on.
- Debug variants for pricing (probes only): `G.look.hookDebug(['flat'|'flatvary'|'noshadow'|'onetap'|'noblend'|'nofog'|
  'nocontact'|'nosun'|'noamb'])`, `G.look.gpuSwitch({ old, sc, tap, grade })` (recompiles hooked materials).
