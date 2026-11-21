// rock_standing — a tall standing stone, set up by hand long ago, now leaning.
// SILHOUETTE: a blade that tapers unevenly (east edge leans in, west edge plumb) and twists ~15 deg from foot to top,
//   leaning ~6 deg to the east; its top a broken ridge of two facets with the north-west corner fallen away.
// BIG FORMS: (1) the broad front face (south), dished concave, (2) the back, convex (two planes at a low ridge),
//   (3) the sloped two-facet top, the only worn-round part.
// THE EYE RESTS ON: the broken top corner, the long vertical crack down the front from the top, and the dark wet foot
//   where it goes into the ground.
// WEAR STORY: raised by people (faces roughly dressed, edges once squared, now rounded), centuries of rain down the
//   faces (streaks from the top), frost split the top and dropped a corner, it settled and leans; lichen on the damp
//   north face, pitting on the west edge.
// MUST NOT LOOK LIKE: an obelisk, a plank, a cone, or a symmetrical tombstone.
import { rockDef, rockPoly, wearWhere, pl, vCrack, floor0, breakAway, chipFlat, protoBefore } from './rock_common.mjs';

export default rockDef('rock_standing', {
  height: 1.55,
  build(S) {
    // revision 2: not a plank. The faces taper UNEVENLY (the east edge leans in hard, the west edge almost plumb, the
    // back leans in more than the front), the back is CONVEX (two planes meeting at a low ridge), the front CONCAVE
    // (a broad shallow trough, below), and the whole blade twists ~15 deg from foot to top.
    const planes = [
      pl([0.02, 0.045, 1], [0, 0, 0.225]),                                         // front (south), dished below
      pl([0.5, 0.075, -1], [0.06, 0, -0.23]), pl([-0.55, 0.09, -1], [0.06, 0, -0.23]), // back: a convex ridge
      pl([1, 0.13, 0.06], [0.32, 0, 0]), pl([-1, 0.035, -0.1], [-0.33, 0, 0]),     // east leans in, west near plumb
      pl([0.72, 0.1, 0.7], [0.25, 0, 0.15]), pl([-0.72, 0.05, 0.62], [-0.27, 0, 0.14]),
      pl([0.6, 0.15, -0.78], [0.24, 0, -0.17]), pl([-0.62, 0.07, -0.8], [-0.26, 0, -0.17]),
      pl([0.62, 1, 0.15], [0.04, 1.505, 0]), pl([-0.35, 1, -0.4], [-0.08, 1.545, 0]),  // two-facet broken top: a long steep slope east, a short one west
      pl([0.75, 0.6, 0.35], [0.24, 1.32, 0.1]),                                  // weathered-back south-east shoulder
    ];
    const crown = (x, y, z) => S.ss(1.45, 1.6, y) * S.ss(-0.05, -0.25, x);   // only the old west crest is worn (rev 3: small)
    let body = rockPoly(planes, { k: 0.006, kSoft: 0.025, soft: crown, bounds: [-0.42, 0, -0.34, 0.42, 1.75, 0.34] }).part('stone');
    // the concave front: a trough ~6 cm deep across the south face, dying out at both edges
    body = body.cut(new S.Shape((x, y, z) => Math.hypot(x + 0.02, z - (0.205 + 1.1 - 0.06)) - 1.1, [-2, -1, -2, 2, 3, 2]));
    body = body.rough({ type: 'fbm', scale: 0.55, amp: 0.004, oct: 1, seed: 12 });
    // the fallen-away corner of the top (north-west)
    // (a clean angled plane, dished a little: the corner split off along a joint and fell)
    // a spall scar on the east face, mid height (an old frost flake gone)
    body = body.chip({ at: [0.31, 0.78, -0.02], dir: [1, 0.15, -0.1], depth: 0.05, spread: 0.9, seed: 9, rough: 0.002 });
    // frost crack down the front face from the top
    body = vCrack(S, body, { n: [1, 0, 0.12], at: [0.13, 0, 0], width: 0.03, depth: 0.1, bottom: 0.78, top: 1.4, wander: 0.02, seed: 5,
      where: (x, y, z) => S.ss(0.0, 0.12, z) });
    body = wearWhere(S, body, 0.012, crown, { vary: 0.6, seed: 4 });
    // a block gone from the west edge at hip height: an old flat break, weathered (not fresh)
    body = body.cut(chipFlat(S, { n: [-0.8, 0.25, 0.4], at: [-0.3, 0.95, 0.12], r: 0.16, depth: 0.06, spin: 40 }));
    body = body.cut(breakAway(S, { n: [-0.55, 0.5, -0.67], at: [-0.2, 1.38, -0.13], bowl: 0.004, r: 0.3 }).part('fresh'), { paintCut: true });
    // the lean: 6 deg to the east, 2 deg to the south; the foot re-cut flat into the ground
    return floor0(S, body.twist(10).turn(2, 0, -6).at(-0.04, -0.01, 0)).wear(0.004, { vary: 0.4, seed: 6 });
  },
  before: () => protoBefore([{ opts: { seed: 51, planes: 10, bands: 4, taper: 0.3, flat: 0.2 }, size: [0.66, 1.55, 0.48] }]),
});
