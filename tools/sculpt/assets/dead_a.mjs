// dead_a — the split dead tree of 常夜原 (replaces tree_dead_1 / dead1: 6.5 m tall, 4.6 x 2.6 m, collider trunkR 0.32;
//   dead3 and deadSnow map onto it scaled, see INSTALL.md).
// SILHOUETTE: a squat trunk that SPLIT long ago into two stems — the main one bent hard down-wind (+X) like a crooked arm,
//   the other rising, both ending in broken stubs; one low branch ends in hooked claw twigs; a hollow opens in the split.
// BIG FORMS: (1) the flared foot and the split with its hollow, (2) the wind-bent main stem, (3) the upright second stem,
//   with four boughs between them reaching like fingers.
// THE EYE RESTS ON: the black hollow in the front of the split, the broken top of the main stem, the claws against the
//   night sky, the plates of bark hanging off the lower trunk.
// WEAR STORY: struck and split, then dried by decades of wind from the west; the bark has fallen from everything high,
//   leaving silver wood split in long vertical cracks, and clings in three patches low down, hanging in loose plates.
// MUST NOT LOOK LIKE: a pack tree's twisted cylinder, a symmetric candelabra, a spiky noise sculpture, sticks of one size.
import { bunion, limb, plates, zig, floor0, groundRoot, buttress, splinters, claws, barkPlate, along, lit, FAR, C, mix, ss } from './trees_c_lib.mjs';

const far = FAR();
const BASE = [[0, -0.2, 0], [0.06, 0.9, 0.0], [0.2, 1.65, 0.02]];
const SA = [[0.2, 1.55, 0.02], [0.6, 2.75, 0.1], [1.15, 3.65, 0.14], [1.75, 4.15, 0.04], [2.25, 4.3, -0.1]];   // main, wind-bent
const SB = [[0.15, 1.55, 0.0], [-0.12, 2.7, -0.1], [-0.3, 3.85, -0.2], [-0.22, 5.0, -0.22], [0.05, 6.0, -0.18]];  // second, upright
// boughs: [stem, fraction, path offsets from the stem point (3 points), r0, end: 'stub' | 'claw', dir]
const BOUGHS = [
  [SA, 0.42, [[0.45, 0.35, 0.35], [0.95, 0.5, 0.8], [1.3, 0.35, 1.05]], 0.1, 'claw'],
  [SA, 0.7, [[0.4, -0.05, -0.3], [0.9, -0.25, -0.65], [1.3, -0.45, -0.85]], 0.09, 'break'],
  [SB, 0.45, [[-0.4, 0.3, 0.15], [-0.85, 0.45, 0.35], [-1.25, 0.4, 0.5]], 0.1, 'break'],
  [SB, 0.72, [[-0.25, 0.35, -0.35], [-0.5, 0.55, -0.7], [-0.6, 0.6, -0.95]], 0.08, 'stub'],
  [SA, 0.2, [[0.3, 0.2, -0.25], [0.55, 0.3, -0.45]], 0.08, 'stub'],
];

// (rev) the last bark clings in three patches near the base (painted round the hanging plates)
const PATCH = [[[-0.3, 1.2, 0.05], 0.42], [[0.05, 0.85, -0.36], 0.45], [[0.34, 0.7, -0.18], 0.36]];
const POCKET = [0.16, 1.2, 0.33];
function wood(c) {
  const { x, y, z, ny, cavity, edge, S } = c;
  // silver-grey weathered wood; (rev) the long dry splits are dark, their lips pale; no crackle elsewhere
  let col = mix(C('#776f67'), C('#8f877d'), ss(1.5, 4.5, y));
  col = mix(col, C('#b3aa9d'), edge * 0.6 + ss(0.5, 1, ny) * 0.12);
  col = mix(col, C('#2e2926'), Math.min(1, cavity * 1.4));
  const n = S.fbm(x * 2.2, y * 1.4, z * 2.2, 21, 2);
  let patch = 0;
  for (const [p, r] of PATCH) patch = Math.max(patch, ss(r, r * 0.6, Math.hypot(x - p[0], (y - p[1]) * 0.6, z - p[2]) + 0.12 * n));
  col = mix(col, mix(C('#5a4f48'), C('#7c6c60'), edge * 0.6), patch * 0.9);
  col = mix(col, C('#4a423c'), ss(0.25, 0.0, y) * 0.5);
  if (far) {
    // LOD2 has no hollow cut: paint it, dark with a brown rim, on the front of the split
    const d = Math.hypot((x - POCKET[0]) / 0.22, (y - POCKET[1]) / 0.55, (z - POCKET[2] - 0.08) / 0.32);
    col = mix(col, C('#4a3c32'), ss(1.3, 1.0, d));
    col = mix(col, C('#1c1715'), ss(0.95, 0.7, d));
  }
  return col;
}
function bark(c) {
  const { ny, cavity, edge } = c;
  // the loose plates: dark grey-brown outside, a paler rusty underside where they peel
  let col = mix(C('#5f544d'), C('#8a7462'), ss(-0.2, -0.7, ny));
  col = mix(col, C('#8c8279'), edge * 0.5);
  return mix(col, C('#2a2420'), Math.min(1, cavity * 1.3));
}
function hollow(c) {
  const { ao, edge } = c;
  return mix(mix(C('#1c1715'), C('#3e322a'), ao), C('#5a4d43'), edge * 0.45);
}

export default {
  name: 'dead_a', id: 'sculpt_tree_dead_a', species: ['dead1', 'dead3', 'deadSnow'],
  voxel: 0.02,
  lods: [5000, 1800, 500],
  farFrom: 2, farVoxel: 2.2,
  ground: 0, aoRange: 0.8, aoStrength: 0.5, cavity: [0.03, 0.15], cavityDark: 0.35, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.25 } } },
  previewTint: [1, 1, 1],
  replaces: { file: 'assets/models/nature/trees/tree_dead_1.glb', tint: [1, 1, 1] },
  notes: 'Sculpted split dead tree (dead1; dead3, deadSnow scaled). One material trunk (mul: COLOR_0 = wood colour). No crown part. COLOR_0.a = top snow mask. See .tmp/sculpt/broadleaf_a/INSTALL.md.',
  build({ S }) {
    S.part('deadwood', { mat: 'wood', paint: lit(wood, 0.5, 0.3) });
    S.part('barkplate', { mat: 'wood', paint: lit(bark, 0.5, 0.3) });
    S.part('hollow', { mat: 'wood', paint: lit(hollow, 0.5, 0.3) });
    let trunk = limb(BASE, 0.4, 0.3, 0.8).softAdd(S.ellipsoid([0.58, 0.42, 0.5]).at(0.0, 0.0, 0), 0.22);
    const pieces = [trunk, limb(SA, 0.27, 0.09, 0.75), limb(SB, 0.22, 0.07, 0.75)];
    if (!far) {
      for (const [a, L, r, h, sd] of [[70, 0.8, 0.24, 0.75, 1], [200, 0.65, 0.22, 0.7, 2], [300, 0.85, 0.25, 0.8, 3]]) pieces.push(buttress(a, L, r, h, { seed: sd, rt: 0.25 }));
      for (const [a, L, r, sd] of [[120, 1.3, 0.11, 4], [245, 1.1, 0.1, 5], [20, 1.0, 0.09, 6]]) pieces.push(groundRoot(a, L, r, { seed: sd, rt: 0.4, y0: 0.12 }));
    }
    const ends = [];
    BOUGHS.forEach(([stem, u, offs, r0, kind], i) => {
      const a = along(stem, u).p, pts = [a, ...offs.map((o) => [a[0] + o[0], a[1] + o[1], a[2] + o[2]])];
      if (far && r0 < 0.09) return;
      pieces.push(limb(far ? pts : zig(pts, 0.14, i + 11), r0, kind === 'stub' ? r0 * 0.6 : kind === 'break' ? 0.055 : 0.045, 0.85));
      const e = pts.at(-1), p = pts.at(-2);
      ends.push([e, [e[0] - p[0], e[1] - p[1], e[2] - p[2]], kind, r0, i]);
    });
    let w = bunion(pieces, 0.1);
    if (!far) {
      // (rev) long vertical dry splits in the silver wood (cells 6 m tall: walls run up the stems, almost no cross
      // cracks), only on the upright parts; the boughs stay smooth
      w = plates(w, { w: 0.42, h: 6.0, depth: 0.03, groove: 0.075, seed: 21, where: (x, y) => ss(0.15, 0.5, y) * ss(3.5, 2.8, y) });
      const extra = [];
      // broken ends and claws
      extra.push(...splinters(SA.at(-1), [0.8, 0.5, -0.1], 0.09, { n: 4, len: 0.3, seed: 31, rmin: 0.024 }));
      extra.push(...splinters(SB.at(-1), [0.2, 1, 0.0], 0.075, { n: 4, len: 0.32, seed: 32, rmin: 0.022 }));
      for (const [e, d, kind, r0, i] of ends) {
        // (rev) claws on ONE branch only (the low front one); every other end is a break with splinters
        if (kind === 'claw') extra.push(...claws(e, d, { n: 3, len: 0.6, r0: 0.045, r1: 0.027, curl: 0.32, spread: 1.0, seed: 50 + i }));
        else extra.push(...splinters(e, d, kind === 'break' ? 0.05 : r0 * 0.6, { n: 3, len: kind === 'break' ? 0.2 : 0.16, seed: 40 + i, rmin: 0.022 }));
      }
      w = w.add(bunion(extra, 0.02));
    }
    w = w.part('deadwood', { mat: 'wood', paint: lit(wood, 0.5, 0.3) });
    if (!far) {
      // the hollow: opens in the front of the split and runs down into the trunk; a deeper crack between the stems
      const pocket = S.ellipsoid([0.17, 0.5, 0.26]).turn(0, 0, -8).at(POCKET[0], POCKET[1], POCKET[2]).part('hollow', { mat: 'wood', paint: lit(hollow, 0.5, 0.3) });
      const cleft = S.ellipsoid([0.08, 0.42, 0.3]).turn(0, 0, -15).at(0.2, 1.75, 0.02).part('hollow', { mat: 'wood', paint: lit(hollow, 0.5, 0.3) });
      w = w.softAdd(S.ellipsoid([0.27, 0.62, 0.17]).turn(0, 0, -8).at(0.16, 1.2, 0.28).part('deadwood', { mat: 'wood', paint: lit(wood, 0.5, 0.3) }), 0.07);      // the rolled lip
      w = w.softCut(pocket, 0.04, { paintCut: true }).softCut(cleft, 0.03, { paintCut: true });
      // loose bark plates hanging off the lower trunk (the last bark, peeling)
      const pl = [];
      for (const [p, a, o] of [
        [[-0.33, 1.35, 0.05], -90, { w: 0.24, h: 0.55, peel: 12 }], [[0.05, 0.95, -0.4], 180, { w: 0.28, h: 0.6, peel: 16 }],
        [[0.36, 0.8, -0.18], 115, { w: 0.22, h: 0.45, peel: 20 }],
      ]) pl.push(barkPlate(p, a, { t: 0.05, curl: 0.22, ...o }));
      w = w.add(bunion(pl).part('barkplate', { mat: 'wood', paint: lit(bark, 0.5, 0.3) }));
    }
    return floor0(w);
  },
};
