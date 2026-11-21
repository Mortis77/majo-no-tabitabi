// rock_boulder_b — the blocky boulder: a squared block with one fresh broken face.
// SILHOUETTE: a low squared block, top tilted a little to the south, one front corner sheared off clean at an angle —
//   the angled pale plane is the read from any distance.
// BIG FORMS: (1) the flat, slightly tilted top (the only worn-round part), (2) four near-vertical walls of unequal width
//   meeting at crisp 2–3 cm edges, plus a broad old fracture plane on the north-west, (3) the big fresh break on the
//   south-east corner, dished like a shell.
// THE EYE RESTS ON: the fresh face (pale, crisp edges, no lichen, no moss), the stepped ledge on the north top edge,
//   and a horizontal bedding crack on the west wall.
// WEAR STORY: an old block, rounded on its old edges; recently (a spell, a frost, a fall) a corner came away and the
//   inside shows clean and light; the old faces keep their streaks, lichen on the damp north, pitting on the west.
// MUST NOT LOOK LIKE: a cube, a crate, a rounded pebble, or evenly chipped all over.
import { rockDef, rockPoly, wearWhere, pl, breakAway, seam, protoBefore } from './rock_common.mjs';

export default rockDef('rock_boulder_b', {
  height: 0.68,
  build(S) {
    const planes = [
      pl([0.1, 1, 0.16], [0, 0.64, 0]),        // top, tilted south
      pl([1, 0.08, 0.12], [0.5, 0, 0]), pl([-1, 0.14, -0.06], [-0.5, 0, 0]),
      pl([0.12, 0.06, 1], [0, 0, 0.4]), pl([-0.1, 0.1, -1], [0, 0, -0.41]),
      pl([0.65, 0.75, -0.3], [0.4, 0.56, -0.16]),   // old bevel, east top
      pl([-0.62, 0.5, 0.55], [-0.38, 0.45, 0.3]),   // old bevel, south-west
      pl([-0.55, 0.15, -0.8], [-0.38, 0.3, -0.3]),  // north-west corner
      pl([0.75, 0.05, -0.65], [0.42, 0.3, -0.3]),   // north-east corner
    ];
    // revision 2: crisp 2–3 cm breaks everywhere; only the old top and the upwind (west) top edge are worn round
    const old = (x, y, z) => S.ss(0.5, 0.64, y) * (0.55 + 0.45 * S.ss(0.1, -0.35, x));
    planes.push(pl([-0.2, 0.12, 1], [0.0, 0.2, 0.42]));  // south wall, second facet
    let body = rockPoly(planes, { k: 0.006, kSoft: 0.06, soft: old, bounds: [-0.56, 0, -0.46, 0.56, 0.72, 0.46] }).part('stone');
    body = body.rough({ type: 'fbm', scale: 0.45, amp: 0.003, oct: 1, seed: 9 });
    // ledge: the north top edge stepped down (a slab of the old top split off long ago)
    body = body.softCut(S.box([1.3, 0.2, 0.22]).turn(0, -6, 4).at(0, 0.66, -0.43), 0.02);
    // bedding crack on the west wall, and a shallow seam all round low down
    body = seam(S, body, { y0: 0.27, depth: 0.014, width: 0.022, wobble: 0.02, seed: 3,
      where: (x, y, z) => Math.max(S.ss(0.15, -0.25, x), S.ss(0.0, -0.3, z)) });   // west and north only: a joint, not a belt
    body = body.crack([[-0.52, 0.42, 0.25], [-0.53, 0.44, 0.05], [-0.52, 0.41, -0.15], [-0.48, 0.43, -0.32]], { width: 0.02, jag: 0.02, seed: 4 });
    body = wearWhere(S, body, 0.014, old, { vary: 0.6, seed: 5 });
    // a second, older fracture plane on the north-west: broad and flat, weathered grey (not fresh)
    body = body.cut(breakAway(S, { n: [-0.62, 0.25, -0.75], at: [-0.33, 0.3, -0.27], bowl: 0.006, r: 0.4 }));
    // the fresh break (after the wear: its edges stay sharp)
    const brk = breakAway(S, { n: [0.7, 0.32, 0.64], at: [0.3, 0.36, 0.24], bowl: 0.03, r: 0.28 }).part('fresh');
    body = body.cut(brk, { paintCut: true });
    return body.wear(0.004, { vary: 0.3, seed: 6 });
  },
  before: () => protoBefore([{ opts: { seed: 21, planes: 9, box: 0.6 }, size: [1.06, 0.68, 0.86] }]),
});
