# tools/sculpt — the sculptors' studio

You shape ONE object with care. You cannot push clay, but you can write shape code and LOOK at what it makes. This kit
turns a short shape description (a distance field) into a game-ready GLB with LODs, a baked colour atlas and normal map,
and a set of preview sheets rendered on the CPU in the game's light. Everything runs on the CPU (no browser, no GPU).

```
node tools/sculpt/build.mjs tools/sculpt/assets/<name>.mjs            full build (lantern: 80 s idle machine, ~4 min under load; 6 workers)
node tools/sculpt/build.mjs tools/sculpt/assets/<name>.mjs --quick    coarser voxel, 512 atlas: ~1 min, for looking
```
Outputs: `assets/models/sculpt/<name>.glb`, `assets/models/sculpt/<name>.manifest.json` (a fragment for
`node tools/manifest-patch.mjs` — the lead applies it, not you), and `.tmp/sculpt/<name>/`:
`turntable.png` (8 around, 3 above, 1 below), `clay.png` (form only), `hero.png` (1080p, two metres away, standing eye
height), `game.png` (each LOD about 300 px tall, as the game camera sees it), `lods.png` (LODs shaded + wireframe),
`before_after.png` (the object the game has now, same camera and light), `atlas_*.png`, `checks.json`.
Skinned assets give `poses.png` (old / new / new clay in six poses from three clips), `turntable.png`, `before_after.png`.

Files: `sdf.mjs` (shapes), `noise.mjs`, `model.mjs` (loading, surface sampling), `mesh.mjs` (dual contouring, manifold
repair, simplifier, normals, checks), `bake.mjs` (unwrap, atlas, vertex colours), `gltf.mjs` (writer), `rig.mjs`
(skeletons, weights, skinned writer, posing), `preview.mjs` (renderer, PNG, sheets), `pool.mjs` / `worker.mjs`.

## 1. An asset module

```js
// tools/sculpt/assets/well_bucket.mjs
export default {
  name: 'well_bucket', id: 'sculpt_well_bucket',
  voxel: 0.003,                       // mesh voxel (m). ~1/500 of the object's size is a good start
  lods: [6000, 1500, 400],            // triangles: hero (2 m), game camera, far
  atlas: 1024,                        // 512 for small props
  ground: 0,                          // the ground counts as an occluder for AO (null = hanging object)
  materials: { wood: { name: 'OldWood', surface: 'wood', look: { detail: 0.3 } }, iron: { name: 'Iron', surface: 'metal', look: { spec: 0.4 } } },
  anchors: { handle: [0, 0.42, 0] },  // named empty nodes the game code can find (pivots, sockets)
  build({ S }) {
    const staves = S.lathe([[0.16, 0], [0.18, 0.3], [0.17, 0.32]]).shell(0.018)
      .part('staves', { mat: 'wood', paint: (c) => S.mix(S.color('#8b5a3c'), S.color('#5b3a29'), c.cavity) });
    const hoops = S.torus(0.175, 0.008).at(0, 0.08, 0).add(S.torus(0.18, 0.008).at(0, 0.25, 0))
      .part('hoops', { mat: 'iron', paint: () => S.color('#4a4d57') });
    return staves.add(hoops).wear(0.004);
  },
  async before({ ROOT, threeToMeshes }) { /* optional: the game's current version, for before_after.png */ },
};
```
Units are metres, Y is up, the origin is where the game puts the object (normally the foot centre on the ground), +Z is
the object's front. All randomness is seeded (`S.prng(seed)`), because every worker rebuilds the same field.

## 2. Shapes (sdf.mjs) — read it like modelling

Primitives (centred on the origin unless said): `sphere(r)`, `ellipsoid([rx,ry,rz])`, `box([sx,sy,sz])`,
`roundBox(size, r)`, `capsule(a, b, r)`, `taperedCapsule(a, b, ra, rb)` (the basic limb), `cone(r0, r1, h)` and
`cylinder(r, h)` (from y 0 up), `torus(R, r)` (in XZ), `plane(n, at)`, `lathe(profile, { sides, smooth })` (profile
`[[radius, y], ...]` turned about Y; `sides: 6` makes a hex prism with a corner on +Z), `extrude(outline, depth)` (2D
outline in XY pushed along Z; `ngon`, `circle` help), `tube(points, radius, { aspect, up })` (Catmull-Rom curve; radius
a number, `[r0, r1]` or `t => r`; `aspect` flattens the section), `boxFromTo([x0,y0,z0,x1,y1,z1])`.

Joins: `a.add(b)`, `a.softAdd(b, k)` (blend radius k), `a.cut(b)`, `a.softCut(b, k)`, `a.intersect(b)`,
`a.softIntersect(b, k)`, `S.union(...)`, `S.softUnion(k, ...)`. A cut keeps the base's paint; `cut(b, { paintCut: true })`
paints the cut surface with b's part.

Placing: `.at(x, y, z)`, `.turn(ax, ay, az)` (degrees, X then Y then Z), `.aim(dir)` (local +Y along dir),
`.scale(s | [sx,sy,sz])`, `.mirror('x')` (model the +x half, get both), `.around(n, offsetDeg)` (n copies about Y; model
one on +Z), `.twist(degPerM)`, `.bend(degPerM)`, `.taper(k)`, `.warp((x,y,z,out) => { out[1] = ... })` (free
displacement, e.g. lifting roof corners).

Working the surface:
- `.chisel({ count, depth, radius, tilt, seed, where, dirs })` — flat facets cut into the surface at jittered angles; each
  facet fades back to the surface at its edge (no slots) and is no thicker than 2.5 x depth.
- `.chip({ at, dir, depth, spread, seed, paint })` — a knocked-off corner: three rough planes behind `at`; `paint` names a
  part for the fresh break.
- `.groove(points, { width })`, `.crack(points, { width, jag, seed })` — cuts along curves (cracks taper and wander).
- `.strata({ spacing, depth, width, wobble, axis })` — bedding lines, feather rows, scale rings.
- `.rough({ type: 'fbm'|'ridged'|'billow'|'cellular'|'cells', scale, amp, oct, seed, mask })` — noise displacement;
  `mask` = `'up'|'side'|'down'`, `{ y: [from, to] }` or `(x,y,z[,nx,ny,nz]) => 0..1`.
- `.bulge(at, radius, amount)`, `.pinch(at, radius, amount)`, `.round(r)`, `.shell(t)`, `.clip(box)`.
- `.wear(r, { vary, seed })` — rounds exposed edges by about r, leaves crevices sharp. Costs 9x evaluations of the
  shape below it: wear each part, not the whole model.
- `shape.probe(rnd, dirs, from)` gives a surface point and normal — use it to scatter things ON the surface (moss
  cushions, barnacles, rivets).

Parts and paint: `.part(name, { mat, paint, bone, blend, smooth })`. `mat` is a key of `materials` (one glTF material
each). `paint(c)` returns an sRGB colour `[r,g,b]` 0..1 and gets `c = { x, y, z, nx, ny, nz, h (0..1 height in the
bounds), ao, cavity (0 flat .. 1 deep crevice), edge (0..1 convex edge), broad (+ = in a large hollow), part, mat, S }`.
Paint is called on the TRUE surface of the full-resolution field, so it follows form exactly. AO and cavity are also
multiplied in afterwards (`aoStrength` 0.7, `cavityDark` 0.45 in the asset config); keep paint as albedo + story.
Helpers: `S.color('#hex')`, `S.mix(a, b, t)`, `S.ss(a, b, x)` (smoothstep), `S.fbm/ridged/billow/cellular/noise3`.

## 3. Sculpting on a skeleton (rig.mjs)

```js
export default {
  name: 'hen', rig: { file: 'assets/models/refined/ani_chicken.glb' /*, clipsFrom: 'assets/...glb' */ },
  voxel: 0.0022, lods: [4200], poses: [['Idle', 0.5], ['Run', 0.1], ['Run', 0.29], ...],
  build({ S, rig }) {
    const L = rig.bone('Leg.L');                 // { head, tail, dir, len, at(u), world } in the BIND pose, game metres
    const shank = S.taperedCapsule(L.head, L.tail, 0.011, 0.008).mirror('x').part('leg', { mat: 'body', bone: 'Leg.{side}' });
    ...
  },
};
```
- Model in the bind pose around the same joints (print them: `rig.jointNames`, `rig.bone(n)`). `{side}` in a bone name
  resolves to L / R by the side of the body the vertex is on.
- Weights: transferred from the old mesh (nearest surface point, barycentric), smoothed `weights.smooth` rounds over the
  new mesh, then per-part corrections: `bone: 'X'` (rigid), `blend: { from, to, width }` (across the head of `to`),
  `smooth: false` (keep the transfer exactly). Top four joints, normalised.
- The skinned GLB replaces only the mesh primitive: joint names, hierarchy, inverse bind matrices and clips stay
  byte-for-byte (the build verifies it: `rig kept: {joints, ibm, nodes, clips: true}`), the material keeps its name (the
  cel shader's name rules, docs/api/actors-look.md, keep working), the atlas texture is dropped for vertex colours.
- Detail on a deforming mesh: vertex colours on a denser mesh. Evidence: the cel path (`makeCelMaterial`) copies `map` but
  not `normalMap`, and the creature merge (`creature.js` `celKey`) refuses materials with a normal map. A tangent-space
  map would be thrown away by the game as it stands.
- Checks: `deformation over all clips` = edge stretch (1 % / 99 % / 99.9 % per clip, worst place). 99.9 % above ~3 means
  a candy-wrapper or collapsing joint: look at `poses.png` there.
- Skinning convention (glTF / three.js attached bind mode): world = sum w * jointWorld * IBM * v. Some packs' node rest
  pose is not the bind pose (the chicken's legs); the kit always models in the bind pose.

## 4. How to look

Build `--quick`, open the sheets, be hard on them, change the code, build again. At least three rounds; a full build last.
- **Silhouette first, from every side** (turntable, clay). If the clay does not read, no paint will save it.
- **Big - medium - small.** One clear big form, a few medium ones, small detail only where the eye rests. Even detail
  everywhere reads as noise at game distance (`game.png`).
- **Where does the eye rest?** Put the sharpest edges, the strongest value contrast and the story there (a lantern: the
  windows and the roof corners).
- **Asymmetry with a reason.** Weather comes from one side; moss on the damp side; one corner knocked off.
- **Wear tells a story.** Rounded where hands and rain touch, sharp in the crevices, pale on the worn edges, dark in the
  wet foot. Not the same everywhere.
- **The game read.** At 300 px the medium forms must still be there; LOD1 must keep them (`lods.png`, `game.png`).

Usual mistakes: perfect symmetry; detail spread evenly; noise instead of form (rough() is seasoning, not shape); every edge
equally sharp; colour that ignores form (paint by `ny`, `cavity`, `edge`, `ao`, height); chisel radius larger than the
part (bites into neighbouring forms); `wear()` over the whole model (slow); thin walls under two voxels (they tear).

## 5. Replacing a game object

Keep: its bounding box (within a few cm), origin (foot centre on the ground unless the code says otherwise), up axis
(+Y), front (+Z, or whatever the builder used — check its corners / openings), ground contact, and every named sub-part
or pivot the code reads (export them as `anchors`; leave live parts such as flames, paper, lids to the code).
Read the builder first; write down where its live parts sit and leave room for them. You do NOT install: the lead wires
it in (installer notes below). Never edit `src/` or `assets/manifest.json` from a sculpt job.

## 6. What the kit cannot do (yet)

- Dual contouring has one vertex per cell: walls thinner than ~2 voxels tear or touch; the repair keeps the mesh manifold
  but coincident vertices remain. Keep parts at least 3 voxels thick or lower the voxel.
- The simplifier refuses collapses that would move the surface more than `lodError[i]` (default 0.1 / 0.4 / 1.2 % of
  the diagonal) and never folds faces past ~70 deg; on a busy object a LOD may therefore stay above its target (the
  build says so). Without that cap it once ate a whole lantern into a twisted spike to hit the count — always LOOK at
  `lods.png`. The build also prints each LOD's bounding-box drift (a lost part shows there).
- Distance bounds: twists, warps and big noise make the field inexact; raise `bandSlack` if the mesh shows holes.
- The atlas packer is a shelf packer: ~40 % fill with many small charts. Atlas PNGs are big (lantern GLB 4 MB);
  compress at install time if size matters.
- Paint has no image textures (only procedural); no hand-placed decals; no transparency.
- Preview light is the game's light in spirit, not its shader: no surface-detail layer, no fog, no post chain.
- Skinned path: one mesh, one LOD, vertex colours only; weights come from a nearest-surface transfer, so new parts far
  from the old surface (tails, ears, hair) inherit their nearest old part's bone — pin or blend them by part.

## 7. Installer notes (for the lead)

**Stone lantern** (`assets/models/sculpt/stone_lantern.glb`, id `sculpt_stone_lantern`):
- Replace the static stone of `makeStoneLantern` (src/world/builders/keyobjects.js): the base lathe + petals, pole,
  platform + petals, sill / posts / lintel, fire dish, roof + tips, moss cap + cushions, jewel. Keep `paperMat` paper
  panels on faces k = 0, 2, 4 (angles 30 / 150 / 270 deg, apothem 0.268, y 1.74, 0.26 x 0.34 — the sculpt's openings are
  0.19 x 0.27 at y 1.735, so the panel edges hide in the wall), the flame group at (0, 1.66..1.76, 0), `fader`, `setLit`,
  the flicker, `height: 2.65`, `firePos (0, 1.73, 0)` (= the GLB's `fire` node). Drop the three lattice-bar faces (the
  stone now has moon / crescent openings there).
- Build a `THREE.LOD` from the nodes `stone_lantern_LOD0/1/2` (suggested: 0 / 10 / 30 m); share the loaded geometry
  between all lanterns (12 roadside + shrine). `stoneLanternDecor()` (decor.js) goes through the same factory; its
  `moss` flag no longer applies (the moss is sculpted on the north-west side; hide the `Moss_none` primitives if needed).
- LOD0 materials carry `extras.normalSpace = 'object'`: after GLTFLoader set `material.normalMapType =
  THREE.ObjectSpaceNormalMap`. **toonify (src/core/assets.js static path) currently drops normalMap** — it must copy
  `normalMap` and `normalMapType` into the MeshToonMaterial, and the Veil hook must be checked to use the mapped normal
  (GPU check). LOD1 / LOD2 are vertex coloured (`vertexColors`), no textures.
- Orientation is the old one (a hex corner on +Z), so `roadside.js` facing-the-road rotation is unchanged.
- Surface tags: `Granite_stone` keeps the stone surface layer at low strength (`detail 0.25, bump 0.3, fine 0`) because
  the detail is baked; `Moss_none`.

**Chicken** (`assets/models/sculpt/chicken.glb`, id `sculpt_ani_chicken`): drop-in for `ani_chicken.file` — same joints,
IBMs, clips and material name; vertex colours instead of the atlas. Check the creature cel path with `vertexColors`.
