// rock_rubble — a cluster of fallen stones at the foot of a cliff: one big piece, a few middling, small ones around.
// SILHOUETTE: a low irregular heap, highest a little off-centre where one stone rests on two others; small stones
//   trail off to one side (the direction they rolled).
// BIG FORMS: (1) the big angular piece, (2) the stone resting across the big one and its neighbour, (3) the scatter.
// THE EYE RESTS ON: the stacked stone and the dark gaps under it, and one fresh pale face on a recently fallen piece.
// WEAR STORY: pieces fell at different times: older ones half sunk, rounded, mossy in the gaps; the newest sits on top,
//   sharp and pale where it broke.
// MUST NOT LOOK LIKE: a pile of equal pebbles, a ring of stones, or one blob.
import { rockDef, rockPoly as poly, stonePlanes, breakAway, protoBefore } from './rock_common.mjs';

const STONES = [
  // centre, half size, sink (how far the centre sits below its half height), seed, edge blend
  { c: [-0.12, 0.13, -0.04], s: [0.25, 0.18, 0.21], seed: 1, k: 0.02 },
  { c: [0.22, 0.09, 0.12], s: [0.18, 0.13, 0.15], seed: 2, k: 0.018 },
  { c: [0.06, 0.27, 0.0], s: [0.15, 0.085, 0.12], seed: 3, k: 0.008, fresh: true }, // the newest, resting on the two
  { c: [-0.4, 0.05, 0.22], s: [0.13, 0.085, 0.11], seed: 4, k: 0.02 },
  { c: [0.4, 0.05, -0.26], s: [0.12, 0.075, 0.14], seed: 5, k: 0.014 },
  { c: [0.0, 0.04, 0.36], s: [0.1, 0.065, 0.085], seed: 6, k: 0.015 },
  { c: [0.44, 0.03, 0.34], s: [0.075, 0.05, 0.065], seed: 7, k: 0.012 },
  { c: [-0.43, 0.04, -0.3], s: [0.095, 0.06, 0.08], seed: 8, k: 0.018 },
  { c: [0.27, 0.03, 0.47], s: [0.055, 0.04, 0.05], seed: 9, k: 0.01 },
];

export default rockDef('rock_rubble', {
  height: 0.38,
  build(S) {
    const parts = STONES.map((st) => {
      const rnd = S.prng(900 + st.seed);
      const b = [st.c[0] - st.s[0] * 1.1, 0, st.c[2] - st.s[2] * 1.1, st.c[0] + st.s[0] * 1.1, st.c[1] + st.s[1] * 1.1, st.c[2] + st.s[2] * 1.1];
      let p = poly(stonePlanes(rnd, { size: st.s, c: st.c, count: 8, cut: [0.7, 1.0] }), { k: st.fresh ? 0.004 : st.c[1] < 0.06 && st.s[0] > 0.09 ? 0.012 : 0.006, bounds: b }).part('stone');
      if (st.fresh) p = p.cut(breakAway(S, { n: [0.8, 0.35, 0.5], at: [st.c[0] + 0.1, st.c[1] + 0.01, st.c[2] + 0.05], bowl: 0.012, r: 0.1 }).part('fresh'), { paintCut: true });
      return p;
    });
    return S.softUnion(0.012, ...parts).wear(0.004, { vary: 0.5, seed: 3 });
  },
  before: () => protoBefore([
    { opts: { seed: 61, planes: 8 }, size: [0.5, 0.3, 0.42], at: [-0.12, 0, -0.04] },
    { opts: { seed: 62, planes: 8 }, size: [0.36, 0.22, 0.3], at: [0.22, 0, 0.12] },
    { opts: { seed: 63, planes: 8 }, size: [0.26, 0.17, 0.22], at: [-0.4, 0, 0.22] },
    { opts: { seed: 64, planes: 8 }, size: [0.24, 0.15, 0.28], at: [0.4, 0, -0.26] },
    { opts: { seed: 65, planes: 8 }, size: [0.2, 0.13, 0.17], at: [0.0, 0, 0.36] },
    { opts: { seed: 66, planes: 8 }, size: [0.19, 0.12, 0.16], at: [-0.43, 0, -0.3] },
  ]),
});
