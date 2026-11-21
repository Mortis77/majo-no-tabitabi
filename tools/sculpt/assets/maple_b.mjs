// maple_b — the tall vase maple of 薄暮林 (replaces tree_maple_3 / species maple3: 7.5 m tall, crown ~4.8 m across,
//   collider trunkR 0.32; at scale 1.2 it also stands in for maple2, 9 m).
// SILHOUETTE: a short, muscular trunk that divides at one and a half metres into four boughs rising like the ribs of
//   a vase; the canopy is a spiral stair of shelves round an OPEN centre — from the side light shows through the
//   middle between the tiers, from above the hollow is a dark well with the boughs in it.
// BIG FORMS: (1) the trunk and the four-way fork, (2) the four ribs of the vase, (3) four tiers of shelves wound round
//   the hollow, each tier turned against the one below.
// THE EYE RESTS ON: the fork, the hollow (dark, with sky through it), the lit tops of the shelves against their dark
//   undersides.
// WEAR STORY: younger than the broad maple; a smoother, greyer bark with a few long ridges; the south-west rib was
//   cut back once and has a swollen collar where it regrew.
// MUST NOT LOOK LIKE: an oval lollipop, a cone, a closed ball, the broad maple squeezed thin.
import { bunion, limb, plates, zig, floor0, crownValue, lace, FAR, MID, C, mix, ss } from './trees_b_lib.mjs';
import * as P from '../sdf.mjs';

const far = FAR(), mid = MID();
const F = [0.06, 1.45, 0.0];
const CEN = [0, 5.0, 0];
// shelves: [angle deg (0 = +Z), dist from axis, centre y, rx (radial), rz (across), th, seed, tier]
// R2: a vase that WIDENS upward round an open centre (the old maple3 carried its crown high and wide): three tiers of
// broad, thin shelves, each tier further out than the one below, nothing on the axis — from above a dark well
const RING = [
  [-40, 1.15, 3.75, 1.05, 1.15, 0.4, 1, 1],
  [80, 1.2, 3.95, 1.0, 1.2, 0.4, 2, 1],
  [200, 1.1, 3.85, 1.0, 1.1, 0.4, 3, 1],
  [20, 1.55, 5.15, 1.15, 1.3, 0.41, 4, 2],
  [140, 1.6, 5.3, 1.2, 1.35, 0.41, 5, 2],
  [262, 1.5, 5.2, 1.15, 1.3, 0.41, 6, 2],
  [-75, 1.4, 6.55, 1.2, 1.4, 0.39, 7, 3],
  [50, 1.5, 6.7, 1.15, 1.35, 0.39, 8, 3],
  [170, 1.4, 6.6, 1.2, 1.4, 0.39, 9, 3],
  [110, 1.05, 7.2, 0.62, 0.8, 0.33, 10, 4],
  [290, 1.0, 7.15, 0.62, 0.78, 0.33, 11, 4],
];
const LAYERS = RING.map(([a, d, y, rx, rz, th, seed, tier]) => {
  const t = a * Math.PI / 180;
  return { c: [Math.sin(t) * d * 0.8, y, Math.cos(t) * d * 0.8], rx: rx * 1.02, rz: rz * 1.02, th, yaw: 90 - a, seed, tier, a: t };   // R3: plan x0.9 (old span 4.85)
});

function bark(c) {
  const { x, y, z, nz, cavity, edge } = c;
  let col = mix(C('#857068'), C('#8f7a6e'), ss(1.2, 4, y));
  col = mix(col, C('#bcaa9c'), edge * 0.75 * ss(2.6, 1.6, y));
  // REVIEW_A: no pale stilts — the limbs aloft carry the trunk's dark value
  col = mix(col, C('#5a463e'), ss(1.7, 2.8, y) * 0.75);
  col = mix(col, C('#4c3a32'), Math.min(1, cavity * 1.2));
  const lich = ss(0.05, -0.55, nz) * ss(2.6, 0.4, y) * ss(0.0, 0.3, c.S.fbm(x * 2, y * 2, z * 2, 9, 2));
  col = mix(col, C('#a0a284'), lich * 0.5);
  col = mix(col, C('#46362e'), ss(0.28, 0.0, y) * 0.45);
  return col;
}

export default {
  name: 'maple_b', id: 'sculpt_tree_maple_b', species: ['maple3', 'maple2'],
  voxel: 0.022,
  lods: [5000, 1800, 500],
  midFrom: 1, midVoxel: 1.5, farFrom: 2, farVoxel: 2.4, farCrease: 150,
  ground: 0, aoRange: 0.9, aoStrength: 0.55, cavity: [0.035, 0.15], cavityDark: 0.35, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves', surface: 'leaf', look: { rim: 0.4, wrap: 0.45 } } },
  previewTint: [0.871, 0.188, 0.024],                                       // f07a2a (dusk.js maple3 tint, linear)
  landTints: { 'CRIMSON b8302c': [0.479, 0.030, 0.025], 'SCARLET d0422a': [0.631, 0.054, 0.024] },
  replaces: { file: 'assets/models/nature/trees/tree_maple_3.glb', tint: [0.871, 0.188, 0.024] },
  notes: 'Sculpted vase maple (maple3; maple2 at scale 1.2). Materials trunk (mul: COLOR_0 = bark colour) and leaves (tint: COLOR_0 = value ramp). COLOR_0.a = top snow mask. See .tmp/sculpt/maple_a/INSTALL.md.',
  build({ S }) {
    S.part('bark', { mat: 'wood', paint: bark });
    const tp = [[0, -0.2, 0], [0.0, 0.6, 0.0], [0.04, 1.1, 0.01], F];
    let trunk = limb(tp, 0.38, 0.3, 0.7);
    trunk = trunk.softAdd(S.ellipsoid([0.6, 0.4, 0.56]).at(0, 0, 0), 0.25);
    const pieces = [trunk];
    if (!far) {
      pieces.push(S.ellipsoid([0.15, 0.6, 0.15]).at(-0.2, 1.0, 0.1), S.ellipsoid([0.14, 0.55, 0.14]).at(0.2, 1.05, -0.12));
      for (const [a, L, r] of [[-30, 1.0, 0.16], [60, 0.8, 0.14], [150, 1.05, 0.16], [230, 0.75, 0.13], [300, 0.9, 0.14]]) {
        const t = a * Math.PI / 180, d = [Math.sin(t), Math.cos(t)];
        pieces.push(limb([[d[0] * 0.2, 0.36, d[1] * 0.2], [d[0] * L * 0.42, 0.12, d[1] * L * 0.42], [d[0] * L, -0.08, d[1] * L]], r, 0.04, 0.6));
      }
    }
    // REVIEW_A: no ribs standing up like stilts — a diverging hierarchy: every tier-1 shelf has a limb from the fork,
    // every higher shelf a thinner limb leaving the nearest limb of the tier below at mid-length and bowing OUTWARD to
    // its shelf; the limbs end inside their shelf's lace (no tip pokes through)
    const limbs = [];
    LAYERS.forEach((L, i) => {
      const { c, th, a, tier } = L, foot = [c[0] * 0.78, c[1] - th * 0.1, c[2] * 0.78];
      let from;
      if (tier === 1) from = F;
      else {
        let best = null;
        for (const q of limbs) if (q.tier === tier - 1) { const m = q.pts[2], dd = Math.hypot(m[0] - foot[0], m[2] - foot[2]); if (!best || dd < best[1]) best = [m, dd]; }
        from = best[0];
      }
      const o = [Math.sin(a), 0, Math.cos(a)], ln = Math.hypot(foot[0] - from[0], foot[1] - from[1], foot[2] - from[2]);
      const bow = 0.18 * ln;
      const p1 = [from[0] + (foot[0] - from[0]) * 0.33 + o[0] * bow, from[1] + (foot[1] - from[1]) * 0.33, from[2] + (foot[2] - from[2]) * 0.33 + o[2] * bow];
      const p2 = [from[0] + (foot[0] - from[0]) * 0.66 + o[0] * bow * 0.9, from[1] + (foot[1] - from[1]) * 0.7, from[2] + (foot[2] - from[2]) * 0.66 + o[2] * bow * 0.9];
      const pts = [from, p1, p2, foot];
      limbs.push({ tier, pts });
      const r0 = [0, 0.15, 0.095, 0.07, 0.055][tier], r1 = [0, 0.055, 0.042, 0.036, 0.032][tier];
      if (!far || tier === 1) pieces.push(limb(far ? pts : zig(pts, 0.08, i + 2), r0, far ? Math.max(r1, 0.06) : r1, 0.85));
      if (!far && tier === 1 && Math.abs(((a * 57.3 + 360) % 360) - 200) < 30) pieces.push(S.ellipsoid([0.15, 0.18, 0.15]).at(F[0] + o[0] * 0.45, 2.2, F[2] + o[2] * 0.45));
      // dark twigs under the shelf toward its points (seen in the gaps)
      if (!far && !mid) {
        const r = P.prng(i * 19 + 3);
        for (let k = 0; k < 3; k++) {
          const b = k * 2.09 + r() * 1.0, end = [c[0] + Math.sin(b) * L.rx * 0.6, c[1] - th * 0.12, c[2] + Math.cos(b) * L.rz * 0.6];
          pieces.push(limb([foot, [(foot[0] + end[0]) / 2, foot[1] - th * 0.3, (foot[2] + end[2]) / 2], end], r1 * 0.9, 0.025, 0.8));
        }
      }
    });
    let wood = bunion(pieces, 0.08);
    if (!far) wood = plates(wood, { w: 0.26, h: 1.0, depth: 0.03, groove: 0.22, seed: 8, where: (x, y) => ss(2.6, 1.4, y) });
    wood = wood.part('bark', { mat: 'wood', paint: bark });
    const leafPaint = (c) => {
      let v = crownValue(c, { cen: CEN, R: 2.3, ry: 2.2, lo: 0.4, hi: 0.88, seed: 6 });
      v *= 0.78 + 0.22 * ss(-0.35, 0.55, c.ny);
      return [v, v, v];
    };
    const shapes = [];
    LAYERS.forEach(({ c, rx, rz, th, yaw, seed, tier }) => {
      const tl = [-c[0] * 0.03, -c[2] * 0.03];
      shapes.push(lace(c, { rx: rx * 1.08, rz: rz * 1.08, th, yaw, seed, points: 6 + (seed % 3), sharp: 0.2, holes: 0, droop: 0.2, far, mid, tilt: tl }));
      if (!far && !mid && tier < 4) shapes.push(lace([c[0] * 0.9, c[1] + th * 0.75, c[2] * 0.9], { rx: rx * 0.7, rz: rz * 0.7, th: th * 0.8, yaw: yaw + 41, seed: seed + 40, points: 6 + (seed % 2), sharp: 0.2, holes: 0, droop: 0.14, tilt: tl }));
    });
    const crown = bunion(shapes).part('leaves', { mat: 'crown', paint: leafPaint });
    return floor0(wood.add(crown));
  },
};
