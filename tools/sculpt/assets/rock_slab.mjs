// rock_slab — a flat layered slab with a lip: two beds of sandstone, the upper one overhanging on the south.
// SILHOUETTE: low and wide; a thin dark shadow line under the overhanging lip on one long side; one corner missing.
// BIG FORMS: (1) the broad top of the upper bed, a WEDGE thinning to the west, (2) the lower bed, wider and rougher,
//   sunk into the ground on the west where the slab settled, (3) the upper bed's edge proud by ~7 cm on the south as a lip,
//   broken in four flat chips.
// THE EYE RESTS ON: the lip and its shadow, the fallen-away north-west corner of the upper bed, and the joint crack
//   across the top.
// WEAR STORY: bedded stone that splits along its layers; the lower bed weathers back faster (softer), leaving the lip;
//   a corner of the upper bed broke along a joint and lies gone; the top holds water: moss there and in the joint.
// MUST NOT LOOK LIKE: a box, a pancake, a tabletop, or one blob with lines painted on it.
import { rockDef, rockPoly, wearWhere, pl, vCrack, seam, breakAway, chipFlat, floor0, protoBefore } from './rock_common.mjs';

const ring = (rnd, rx, rz, n, cx, cz, y0, jit, tilt = 0.06) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5, nx = Math.sin(a), nz = Math.cos(a);
    const d = Math.hypot(rx * nx, rz * nz) * (1 - jit * rnd());
    out.push(pl([nx, (rnd() - 0.3) * tilt * 2, nz], [cx + nx * d, y0, cz + nz * d]));
  }
  return out;
};

export default rockDef('rock_slab', {
  height: 0.32,
  bedPaint: (x, y, z) => ((y + 0.07) * 0.99 - x * 0.139) / 0.075,   // the beds as they lie after the settling turn
  build(S) {
    const rnd = S.prng(77);
    // lower bed: wider, softer stone, recessed under the lip on the south
    const lower = rockPoly([...ring(rnd, 0.57, 0.4, 6, -0.05, -0.065, 0.08, 0.2, 0.12), pl([0.02, 1, -0.03], [0, 0.17, 0])],
      { k: 0.006, kSoft: 0.03, soft: (x, y, z) => S.ss(0.1, 0.17, y), floor: null, bounds: [-0.66, -0.1, -0.64, 0.62, 0.24, 0.5] });
    // upper bed: a WEDGE (14 cm thick at the east end, 6 cm at the west), overhanging the lower bed on the south (the lip);
    // its top is the only worn-round surface
    const upper = rockPoly([...ring(rnd, 0.5, 0.42, 6, 0.04, 0.1, 0.24, 0.22, 0.05), pl([-0.05, 1, 0.04], [0, 0.3, 0]), pl([0, -1, 0.18], [0, 0.13, 0.1])],
      { k: 0.006, kSoft: 0.03, soft: (x, y, z) => S.ss(0.25, 0.31, y - 0.05 * x), floor: null, bounds: [-0.58, 0.0, -0.45, 0.62, 0.36, 0.6] });
    let body = lower.add(upper).part('stone');
    body = seam(S, body, { y0: 0.085, depth: 0.01, width: 0.018, wobble: 0.015, seed: 2 });
    body = body.rough({ type: 'fbm', scale: 0.4, amp: 0.002, oct: 1, seed: 3 });
    // the fallen-away north-west corner of the upper bed (an old break along a joint: one flat plane, weathered)
    body = body.cut(breakAway(S, { n: [-0.7, 0.35, -0.62], at: [-0.33, 0.22, -0.2], bowl: 0.01, r: 0.25 }));
    // joint crack across the top, through the upper bed only
    body = vCrack(S, body, { n: [1, 0, 0.35], at: [0.14, 0, 0], width: 0.035, depth: 0.08, bottom: 0.2, top: 0.31, wander: 0.025, seed: 5 });
    body = wearWhere(S, body, 0.012, (x, y, z) => S.ss(0.26, 0.31, y - 0.05 * x), { vary: 0.6, seed: 4 });
    // the upper bed's edge broken in four places (fresh-ish, flat chips with crisp edges)
    for (const [ang, sz, fresh] of [[0.3, 0.12, 1], [1.5, 0.14, 0], [2.8, 0.1, 0], [4.4, 0.13, 1]]) {
      const nx = Math.sin(ang), nz = Math.cos(ang), R0 = Math.hypot(0.5 * nx, 0.42 * nz) * 0.95, top = 0.3 + 0.05 * (0.04 + nx * R0);
      let c = chipFlat(S, { n: [nx, 0.4, nz], at: [0.04 + nx * R0, top, 0.1 + nz * R0], r: sz, depth: 0.055, spin: ang * 57 });
      body = fresh ? body.cut(c.part('fresh'), { paintCut: true }) : body.cut(c);
    }
    // the whole slab settled: the west end sank (about 8 deg) so the lower bed goes into the ground on that side
    return floor0(S, body.turn(0, 0, 8).at(0, -0.07, 0)).wear(0.004, { vary: 0.4, seed: 6 });
  },
  before: () => protoBefore([{ opts: { seed: 31, planes: 9, flat: 0.25, bands: 2, lip: 0.14 }, size: [1.12, 0.32, 0.92] }]),
});
