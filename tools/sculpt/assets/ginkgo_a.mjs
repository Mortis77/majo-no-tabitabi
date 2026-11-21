// ginkgo_a — the tall ginkgo of 薄暮林 (replaces tree_ginkgo_1 / species ginkgo1: 11 m tall, crown ~4.8 m across,
//   collider trunkR 0.28; at scale 1.18 it also stands in for ginkgo2, 13 m).
// SILHOUETTE: a tall, straight, slightly leaning column; boughs leave the trunk in loose whorls and rise steeply; the
//   gold sits on them in FANS — thick, cupped, notched wedges held out and up like open hands — stacked up a
//   narrow oval with gaps between the fans; at the foot a flared base sunk in a heap of fallen gold.
// BIG FORMS: (1) the straight trunk with its flare and litter heap, (2) the steep boughs in whorls, (3) twenty-odd fans
//   of unequal size, biggest in the lower middle.
// THE EYE RESTS ON: the fans' notched rims against the sky, the ring of fallen gold round the foot, the deep vertical
//   furrows of the old bark low on the trunk.
// WEAR STORY: an old temple-ground ginkgo: corky grey bark in deep vertical furrows, a few burrs (chichi) hanging
//   under the lowest boughs, the litter of this autumn heaped on the up-slope side.
// MUST NOT LOOK LIKE: a birch or poplar recoloured yellow (the old model was exactly that), a cone, a lollipop.
import { bunion, limb, plates, zig, floor0, crownValue, softFan, FAR, C, mix, ss } from './trees_b_lib.mjs';
import * as P from '../sdf.mjs';

const far = FAR();
const CEN = [0, 6.6, 0];
// trunk axis: a slight lean north-east, straight
const ax = (y) => [0.012 * y + 0.004 * y * y * 0.1, y, -0.008 * y];
// whorls: [height, [yaw deg, pitch deg, len] ...]
const WHORLS = [
  [3.1, [[20, 48, 2.3], [150, 52, 2.1], [265, 50, 2.2]]],
  [4.2, [[85, 52, 2.5], [215, 55, 2.3], [330, 50, 2.4]]],
  [5.3, [[0, 57, 2.2], [125, 58, 2.1], [245, 56, 2.15]]],
  [6.5, [[60, 64, 1.6], [180, 66, 1.5], [300, 62, 1.55]]],
  [7.7, [[110, 68, 1.25], [235, 70, 1.15], [350, 68, 1.2]]],
  [8.8, [[30, 72, 0.9], [160, 74, 0.85], [280, 72, 0.85]]],
];

function bark(c) {
  const { x, y, z, nz, cavity, edge } = c;
  // corky grey-brown, deep furrows, pale ridges; fallen gold heaped round the foot
  let col = mix(C('#8a7868'), C('#948474'), ss(1.5, 6, y));
  col = mix(col, C('#c2b4a4'), edge * 0.8);
  col = mix(col, C('#4e4036'), Math.min(1, cavity * 1.3));
  const lich = ss(0.05, -0.55, nz) * ss(3, 0.6, y) * ss(0.0, 0.3, c.S.fbm(x * 2, y * 2, z * 2, 11, 2));
  col = mix(col, C('#a4a688'), lich * 0.45);
  return col;
}
function litter(c) {
  const { x, z, ny, cavity } = c;
  // fallen ginkgo gold: warm yellow, a little browner in the hollows and toward the outer rim
  const r = Math.hypot(x, z), n = c.S.fbm(x * 3, 0, z * 3, 13, 2);
  let col = mix(C('#e3b443'), C('#c99336'), ss(0.0, 0.4, n) * 0.7 + ss(0.6, 1.1, r) * 0.3);
  col = mix(col, C('#9a6e2c'), Math.min(1, cavity * 1.2));
  col = mix(col, C('#f2c862'), ss(0.6, 1.0, ny) * 0.2);
  // fades into the dusk grass toward the outer patches
  return mix(col, C('#a48e4c'), ss(0.9, 1.8, r) * 0.6);
}

export default {
  name: 'ginkgo_a', id: 'sculpt_tree_ginkgo_a', species: ['ginkgo1', 'ginkgo2'],
  voxel: 0.025,
  lods: [5000, 1800, 500],
  farFrom: 2, farVoxel: 2.4, farCrease: 150,
  ground: 0, aoRange: 0.9, aoStrength: 0.55, cavity: [0.035, 0.15], cavityDark: 0.35, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves', surface: 'leaf', look: { rim: 0.4, wrap: 0.45 } } },
  previewTint: [0.730, 0.371, 0.042],                                       // REVIEW_A: butter-gold tint dea43a (linear) -> lit faces ~e8b83a, shade ~a8761e; PAL.ginkgo is f2b632
  landTints: { 'PAL f2b632': [0.887, 0.468, 0.032], 'DEEP e8a628': [0.807, 0.381, 0.021] },
  replaces: { file: 'assets/models/nature/trees/tree_ginkgo_1.glb', tint: [0.887, 0.468, 0.032] },
  notes: 'Sculpted ginkgo (ginkgo1; ginkgo2 at scale 1.18). Materials trunk (mul: COLOR_0 = bark colour; the litter heap round the foot is painted gold in it) and leaves (tint: COLOR_0 = value ramp). COLOR_0.a = top snow mask. See .tmp/sculpt/maple_a/INSTALL.md.',
  build({ S }) {
    S.part('bark', { mat: 'wood', paint: bark });
    S.part('litter', { mat: 'wood', paint: litter });
    const tp = [[0, -0.2, 0], ax(1.2), ax(3.2), ax(5.5), ax(8.0), ax(10.3)];
    let trunk = limb(tp, 0.33, 0.06, 0.62);
    trunk = trunk.softAdd(S.ellipsoid([0.52, 0.45, 0.5]).at(0, 0.02, 0), 0.25);
    const pieces = [trunk];
    if (!far) {
      for (const [a, L, r] of [[10, 0.85, 0.15], [100, 0.7, 0.13], [170, 0.95, 0.15], [250, 0.65, 0.12], [310, 0.8, 0.14]]) {
        const t = a * Math.PI / 180, d = [Math.sin(t), Math.cos(t)];
        pieces.push(limb([[d[0] * 0.18, 0.4, d[1] * 0.18], [d[0] * L * 0.45, 0.13, d[1] * L * 0.45], [d[0] * L, -0.06, d[1] * L]], r, 0.04, 0.6));
      }
    }
    const fans = [], twig = [];
    WHORLS.forEach(([h, bs], wi) => bs.forEach(([yaw, pitch, len], bi) => {
      const seed = wi * 7 + bi + 1, rnd = P.prng(seed * 17), y = yaw + (rnd() - 0.5) * 30;
      const a0 = ax(h), t = y * Math.PI / 180, p = (pitch + (rnd() - 0.5) * 8) * Math.PI / 180;
      const d = [Math.sin(t) * Math.cos(p), Math.sin(p), Math.cos(t) * Math.cos(p)];
      const L = len * 0.86 * (0.9 + 0.2 * rnd());
      // the bough rises steeply, flattening a little toward its end (ginkgo limbs turn up, then out)
      const pts = [a0, [a0[0] + d[0] * L * 0.35, a0[1] + d[1] * L * 0.4, a0[2] + d[2] * L * 0.35], [a0[0] + d[0] * L * 0.72, a0[1] + d[1] * L * 0.72, a0[2] + d[2] * L * 0.72], [a0[0] + d[0] * L * 1.05, a0[1] + d[1] * L * 0.92, a0[2] + d[2] * L * 1.05]];
      if (far ? wi % 2 === 0 : true) pieces.push(limb(far ? pts : zig(pts, 0.1, seed), 0.11 - wi * 0.01, far ? 0.06 : 0.035, 0.8));
      // fans: one at the end, one part-way (lower whorls), held out and up
      const tip = pts[3], outD = [Math.sin(t), 0.9 + wi * 0.08, Math.cos(t)];
      const r = 1.15 * (0.78 + 0.6 * rnd()) * (1 - wi * 0.06);
      // REVIEW_A: soft rounded masses whose outer edge opens into 2-3 fan lobes (no creases, no crumpled skin)
      fans.push(softFan([tip[0] - d[0] * 0.25, tip[1] - 0.2, tip[2] - d[2] * 0.25], outD, { r: far ? r * 1.1 : r, th: 0.7, lobes: 2 + (seed % 2), seed, cup: 0.16, far }));
      if (wi < 4 && !far && (wi + bi) % 3 !== 2) {
        const m = pts[2], t2 = t + (bi % 2 ? 0.6 : -0.6), o2 = [Math.sin(t2), 0.75, Math.cos(t2)];
        const base2 = [m[0] - Math.sin(t2) * 0.2, m[1] - 0.15, m[2] - Math.cos(t2) * 0.2];
        fans.push(softFan(base2, o2, { r: r * 0.78, th: 0.6, lobes: 2, seed: seed + 50, cup: 0.14 }));
      }
    }));
    // the top: two small fans on the leader
    fans.push(softFan([ax(10.0)[0], 9.9, ax(10.0)[2]], [0.3, 1, 0.1], { r: 0.75, th: 0.5, lobes: 2, seed: 91, cup: 0.12, far }));
    fans.push(softFan([ax(9.5)[0], 9.4, ax(9.5)[2]], [-0.6, 1, -0.4], { r: 0.7, th: 0.5, lobes: 2, seed: 92, cup: 0.12, far }));
    // burrs (chichi) hanging under the lowest boughs, on the trunk
    if (!far) for (const [a, h, L] of [[40, 2.9, 0.38], [190, 3.0, 0.28]]) {
      const t = a * Math.PI / 180, b = ax(h), o = [b[0] + Math.sin(t) * 0.2, h, b[2] + Math.cos(t) * 0.2];
      pieces.push(S.taperedCapsule(o, [o[0] + Math.sin(t) * 0.05, h - L, o[2] + Math.cos(t) * 0.05], 0.09, 0.05));
    }
    let wood = bunion(pieces, 0.07);
    if (!far) wood = plates(wood, { w: 0.17, h: 0.95, depth: 0.045, groove: 0.3, seed: 12, where: (x, y) => ss(4.5, 2.5, y) * ss(0.1, 0.3, Math.hypot(x, y - y, 0) < 0.6 ? 1 : 0) });
    wood = wood.part('bark', { mat: 'wood', paint: bark });
    // the litter heap: fallen fans heaped round the foot, more on the up-slope (north) side, scalloped outline
    if (!far) {
      // REVIEW_A: no hard disc — a low heap at the foot breaking into scattered leaf patches that thin out and fade
      const lit = [];
      const rnd = P.prng(77);
      for (let i = 0; i < 28; i++) {
        const a = i * 2.39996 + rnd() * 0.5, d = 0.45 + 1.25 * Math.pow(rnd(), 1.3) + (Math.cos(a) < 0 ? 0.15 : 0);
        const sz = 0.55 - 0.3 * Math.min(1, d / 1.7) + 0.1 * rnd();
        lit.push(S.ellipsoid([sz, 0.05, sz * (0.6 + 0.3 * rnd())]).turn(0, a * 57.3, 0).at(Math.sin(a) * d, -0.012, Math.cos(a) * d));
      }
      lit.push(S.ellipsoid([0.9, 0.13, 0.85]).at(0, 0.0, 0));
      const heap = bunion(lit, 0.06).part('litter', { mat: 'wood', paint: litter });
      wood = wood.add(heap);
    } else {
      wood = wood.add(S.ellipsoid([0.95, 0.14, 0.9]).part('litter', { mat: 'wood', paint: litter }));
    }
    const leafPaint = (c) => {
      // REVIEW_A: calmer range (no lemon tops, no olive-black shade side): butter-gold lit, warm ochre shade
      let v = crownValue(c, { cen: CEN, R: 2.3, ry: 3.6, lo: 0.68, hi: 0.98, seed: 8 });
      v *= 0.92 + 0.08 * ss(-0.35, 0.55, c.ny);
      return [v, v, v];
    };
    const crown = bunion(fans).part('leaves', { mat: 'crown', paint: leafPaint });
    return floor0(wood.add(crown));
  },
};
