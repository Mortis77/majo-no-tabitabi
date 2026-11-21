# tools/sculpt/figure — figures on top of the sculptors' kit

New modules only; nothing in `tools/sculpt/*.mjs` was changed. They import the kit (sdf, mesh, rig, preview, pool).

```
SCULPT_THREADS=2 node tools/sculpt/figure/build-akari.mjs --sheets all      # ~40 s cold, ~15 s with the piece cache
   --sheets face,expr,body,poses,joints,ba | none      --no-glb      --no-hair
-> assets/models/sculpt/akari_base.glb, .regions.json;  .tmp/sculpt/akari_base/*.png, FITTING.md, build.json
```

| module | what it adds to the studio |
|---|---|
| `pieces.mjs` | **Multi-resolution contouring**: one field, several pieces, each with its own bounds / voxel / cut planes / triangle budget (a hand at 0.9 mm, a thigh at 2.6 mm), cached on disk by a hash of the shape sources. |
| `seam.mjs` | `splitField` / `clipField` (cut a mesh exactly on any scalar field, bisection on the edges: eye openings, material borders, hems), `stitch` (join two pieces cut on one plane at different resolutions, no T-junctions), `extrudeRim` (lid and lip walls). |
| `meshops.mjs` | `clipPlane`, `mirrorX` (model half, get a symmetric mesh), `splitLongEdges` (local density where a face moves), `snap`, normals. |
| `face.mjs` | A face from designed curves: lid outlines, brow, mouth line; eye white / iris / highlights on spheres about the eye bone; ribbons on the skin; **expression shapes as displacement fields** (`shapeDelta`) evaluated on every primitive, lids sliding on the sculpt's own surface (height map). |
| `paint.mjs` | **Textures for skinned meshes**: a small anti-aliased canvas (soft ellipses, tapered strokes), face / iris / highlight / eye-white / line / mouth textures, ramp textures that turn two per-vertex numbers into colour (skin warmth + shade) so no unwrap is needed. PNG out. |
| `weights.mjs` | Donor transfer (kit) + corrections: helper bones folded into body bones, rigid head, **analytic finger / thumb weights on the bone chains**, `copyWeights` for garments; `fkPose` (hand-set joint rotations for stress poses). |
| `writer.mjs` | **Several skinned meshes in one GLB, morph targets (`mesh.extras.targetNames`), textures per material**, on the untouched skeleton of a rig source; `compareSkeleton` (joints, inverse binds, rest pose). |
| `render.mjs` | Fork of the kit's CPU renderer: cel emulation of the game's character shader (face-normal rounding, shade tints, alpha MASK / BLEND, back-face culling), soft clay. |
| `glbio.mjs` | Character GLB reader (all primitives, JPEG textures, morph targets), extra clip libraries bound by joint name. |
| `fitting.mjs` | Girths by plane sections, regions per vertex from the dominant bones, capsule colliders. |
| `akari-mesh.mjs`, `akari-figure.mjs`, `under.mjs`, `make-rig.mjs`, `build-akari.mjs` | 灯里's assembly (fields in `tools/sculpt/assets/akari_{body,head,under}.mjs`). |

Limits: the preview's cel mode follows the game's shader in the points that decide a face, not in rim / grain / fog;
judge in the game (`?akari=base`). Ramp-textured skin has no painted detail beyond two channels. A garment grown as a
field is cut where it meets the skin, so its hems are as regular as its triangle budget allows.
