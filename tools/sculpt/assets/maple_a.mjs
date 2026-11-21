// maple_a — the broad, low maple of 薄暮林 (replaces tree_maple_1 / species maple1: 9 m tall, crown ~10 m across,
//   collider trunkR 0.4).
// SILHOUETTE: a short, muscular trunk that splits at two metres into five spreading boughs; over them THREE stacked
//   canopy layers like low clouds — a broad low skirt, a smaller middle tier, a small cap — each layer a row of
//   overlapping flat cushions with sky and deep shade between the tiers, so the red reads in bands.
// BIG FORMS: (1) the flared trunk with its roots and the low fork, (2) the five boughs (the long west one reaching
//   furthest and lowest), (3) the three canopy tiers.
// THE EYE RESTS ON: the fork (the boughs part like fingers), the dark band under each layer against its lit top, the
//   long low west bough carrying the lowest cushion.
// WEAR STORY: an old tree; the west bough sags under its own layer; ridged grey-brown bark with pale lichen on the
//   damp north side; one stub where a limb broke off long ago, healed over.
// MUST NOT LOOK LIKE: a ball or a dome on a stick, a cone, a pack tree's faceted lump, an even cauliflower of bumps.
import { bunion, limb, plates, zig, floor0, crownValue, lace, FAR, MID, C, mix, ss } from './trees_b_lib.mjs';
import * as P from '../sdf.mjs';

const far = FAR(), mid = MID();
const F = [0.16, 1.85, 0.02];          // the fork: low
const CEN = [0, 5.3, 0];
const ZK = 0.64;                       // the crown is longer east-west than north-south (old footprint 10.8 x 6.6)
// canopy layers: [angle deg (0 = +Z, 90 = +X), dist from axis, centre y, rx (radial), rz (across), th, seed, tier]
// R3: broad and low, not a pagoda — three tiers of nearly equal reach stepping up like low clouds, a flat wide top
const RING = [
  // tier 1 — the broad low skirt: five lace umbrellas that overlap at their inner ends, sky between their points
  // (REVIEW_A: the west tongue shortened to ~70 %; the east shelves pushed out to keep the 10.8 m span)
  [-88, 3.0, 2.85, 1.85, 1.7, 0.5, 1, 1],     // the long low west shelf
  [-99, 3.85, 2.4, 0.95, 0.85, 0.42, 15, 1],  // its sagging tip, lower than the rest (breaks the cake)
  [-22, 2.95, 3.3, 1.85, 1.7, 0.5, 2, 1],
  [48, 3.4, 3.5, 1.95, 1.7, 0.5, 3, 1],
  [116, 3.55, 3.2, 1.9, 1.75, 0.5, 4, 1],
  [186, 2.85, 3.45, 1.8, 1.65, 0.5, 5, 1],
  // tier 2 — almost as broad, over the notches of the skirt
  [-55, 2.6, 5.05, 1.85, 1.6, 0.5, 6, 2],
  [15, 2.35, 5.4, 1.7, 1.55, 0.48, 7, 2],
  [85, 2.6, 5.0, 1.75, 1.55, 0.5, 8, 2],
  [152, 2.4, 5.3, 1.7, 1.6, 0.48, 9, 2],
  [228, 2.3, 5.2, 1.65, 1.5, 0.48, 10, 2],
  // tier 3 — a wide flat top of three, the crown's roof, no knob on it
  [-40, 1.45, 7.05, 1.75, 1.5, 0.48, 11, 3],
  [80, 1.35, 7.3, 1.65, 1.45, 0.46, 12, 3],
  [200, 1.25, 7.0, 1.6, 1.45, 0.48, 13, 3],
  [140, 0.5, 8.2, 1.35, 1.2, 0.4, 14, 4],
];const LAYERS = RING.map(([a, d, y, rx, rz, th, seed, tier]) => {
  const t = a * Math.PI / 180;
  return { c: [Math.sin(t) * d, y, Math.cos(t) * d * ZK], rx, rz, th, yaw: 90 - a, seed, tier, a: t };
});

function bark(c) {
  const { x, y, z, nz, cavity, edge } = c;
  // grey-brown maple bark, a little warm; pale ridges, dark furrows; boughs a touch lighter and smoother
  let col = mix(C('#80655a'), C('#8c7264'), ss(1.5, 4, y));
  col = mix(col, C('#b8a292'), edge * 0.8);
  col = mix(col, C('#4a362e'), Math.min(1, cavity * 1.2));
  // pale grey-green lichen on the damp north side of the trunk and the bough tops
  const lich = ss(0.05, -0.55, nz) * ss(3.2, 0.5, y) * ss(0.0, 0.3, c.S.fbm(x * 1.8, y * 1.8, z * 1.8, 7, 2));
  col = mix(col, C('#9a9c7c'), lich * 0.55);
  col = mix(col, C('#40302a'), ss(0.3, 0.0, y) * 0.45);    // wet foot
  return col;
}

export default {
  name: 'maple_a', id: 'sculpt_tree_maple_a', species: ['maple1'],
  voxel: 0.025,
  lods: [5000, 1800, 500],
  midFrom: 1, midVoxel: 1.5, farFrom: 2, farVoxel: 2.4, farCrease: 150,
  ground: 0, aoRange: 1.1, aoStrength: 0.55, cavity: [0.04, 0.18], cavityDark: 0.35, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves', surface: 'leaf', look: { rim: 0.4, wrap: 0.45 } } },
  previewTint: [0.784, 0.125, 0.024],                                      // PAL.maple 0xe5632b (linear)
  landTints: { 'CRIMSON b8302c': [0.479, 0.030, 0.025], 'AMBER f0a640': [0.871, 0.381, 0.051] },
  replaces: { file: 'assets/models/nature/trees/tree_maple_1.glb', tint: [0.784, 0.125, 0.024] },
  notes: 'Sculpted broad maple (maple1). Materials trunk (mul: COLOR_0 = bark colour) and leaves (tint: COLOR_0 = value ramp). COLOR_0.a = top snow mask. See .tmp/sculpt/maple_a/INSTALL.md.',
  build({ S }) {
    S.part('bark', { mat: 'wood', paint: bark });
    // trunk: short and thick, a slight lean east, a twist of muscle; the root flare spreads wide
    const tp = [[0, -0.2, 0], [0.02, 0.7, 0.0], [0.1, 1.35, 0.03], F];
    let trunk = limb(tp, 0.46, 0.34, 0.7);
    trunk = trunk.softAdd(S.ellipsoid([0.78, 0.5, 0.72]).at(0.0, 0.0, 0.0), 0.3);
    const pieces = [trunk];
    if (!far) {
      // muscle: two long swellings up the trunk that run on into the west and east boughs
      pieces.push(S.ellipsoid([0.16, 0.75, 0.16]).at(-0.25, 1.25, 0.12), S.ellipsoid([0.16, 0.7, 0.16]).at(0.31, 1.35, -0.12));
      // surface roots, unequal, gripping the ground; the longest under the long west bough
      for (const [a, L, r] of [[-95, 1.7, 0.22], [-20, 1.05, 0.18], [55, 1.25, 0.19], [125, 0.95, 0.16], [195, 1.3, 0.2], [255, 0.9, 0.15]]) {
        const t = a * Math.PI / 180, d = [Math.sin(t), Math.cos(t)];
        pieces.push(limb([[d[0] * 0.25, 0.45, d[1] * 0.25], [d[0] * L * 0.42, 0.16, d[1] * L * 0.42], [d[0] * L, -0.08, d[1] * L]], r, 0.05, 0.6));
      }
      // an old healed stub on the north-east of the trunk
      pieces.push(limb([[0.15, 1.65, -0.2], [0.32, 1.8, -0.5]], 0.11, 0.1));
    }
    // boughs: every skirt shelf has a main bough from the fork, arching up then out and down a little under its
    // shelf; upper shelves hang on limbs from the leader (the eye follows fork -> bough -> shelf)
    const leader = [F, [0.25, 3.0, 0.0], [0.05, 4.7, -0.1], [-0.1, 6.3, 0.05], [0.05, 7.9, 0.1]];
    pieces.push(limb(far ? leader : zig(leader, 0.08, 2), 0.25, far ? 0.08 : 0.06, 0.8));
    LAYERS.forEach((L, i) => {
      // the bough ends INSIDE its shelf (R2 showed bough tips poking out under the shelves as spikes)
      const { c, th, tier, a } = L, foot = [c[0] * 0.8, c[1] - th * 0.05, c[2] * 0.8];
      if (tier === 1) {
        const d = [Math.sin(a), 0, Math.cos(a) * ZK], k = Math.hypot(c[0], c[2]);
        const pts = [F, [F[0] + d[0] * k * 0.3, F[1] + 0.75, F[2] + d[2] * k * 0.3], [d[0] * k * 0.62, c[1] - th * 0.15, d[2] * k * 0.62], foot];
        pieces.push(limb(far ? pts : zig(pts, 0.14, i + 3), i === 0 ? 0.27 : 0.23, far ? 0.09 : 0.07, 0.8));
      } else if (!far || tier === 4) {
        const y0 = c[1] - (tier === 4 ? 0.9 : 1.45), from = [0.15 * Math.sin(i * 2.1), y0, 0.15 * Math.cos(i * 2.1)];
        const mid = [(from[0] + foot[0]) * 0.5, (from[1] + foot[1]) * 0.5 + 0.2, (from[2] + foot[2]) * 0.5];
        pieces.push(limb(far ? [from, foot] : zig([from, mid, foot], 0.12, i + 9), tier === 2 ? 0.13 : 0.1, 0.05));
      }
    });
    // REVIEW_A: branches visible in the gaps — under every shelf a few dark twigs fan from the bough end toward its
    // points (thin: < 1/3 of the bough), ending inside the lace
    if (!far && !mid) LAYERS.forEach((L, i) => {
      const { c, rx, rz, th, yaw, tier } = L, r = P.prng(i * 31 + 7), n = tier === 1 ? 4 : 3;
      const foot = [c[0] * 0.8, c[1] - th * 0.05, c[2] * 0.8], cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180);
      for (let k = 0; k < n; k++) {
        const a = k * 6.283 / n + r() * 1.2, u = Math.cos(a) * rx * 0.62, w = Math.sin(a) * rz * 0.62;
        const end = [c[0] + u * cy - w * sy, c[1] - th * 0.05 - 0.12 * 0.5, c[2] + u * sy + w * cy];
        const mid = [(foot[0] + end[0]) / 2, Math.min(foot[1], end[1]) - th * 0.35, (foot[2] + end[2]) / 2];
        pieces.push(limb([foot, mid, end], tier === 1 ? 0.07 : 0.055, 0.03, 0.8));
      }
    });
    let wood = bunion(pieces, 0.1);
    if (!far) wood = plates(wood, { w: 0.32, h: 0.85, depth: 0.04, groove: 0.28, seed: 5, where: (x, y) => ss(3.2, 1.8, y) });
    wood = wood.part('bark', { mat: 'wood', paint: bark });
    // crown: value only (the game takes the hue from the instance); bands: lit tops, deep shade under each layer
    const leafPaint = (c) => {
      let v = crownValue(c, { cen: CEN, R: 4.8, ry: 2.6, lo: 0.4, hi: 0.88, seed: 4 });
      v *= 0.78 + 0.22 * ss(-0.35, 0.55, c.ny);
      return [v, v, v];
    };
    // R2 (revision): a lace of irregular shallow points (not a leaf icon), no punched holes; each lace carries a smaller
    // second layer above it, offset toward the trunk and turned (fine stacked layering, sky between the sub-layers)
    const shapes = [];
    LAYERS.forEach(({ c, rx, rz, th, yaw, seed, tier }) => {
      const tl = [-c[0] * 0.04, -c[2] * 0.04];
      shapes.push(lace(c, { rx: rx * 1.08, rz: rz * 1.08, th, yaw, seed, points: 7 + (seed % 3), sharp: 0.2, holes: 0, droop: tier === 1 ? 0.3 : 0.22, far, mid, tilt: tl }));
      if (!far && !mid && tier < 4) shapes.push(lace([c[0] * 0.88, c[1] + th * 0.75, c[2] * 0.88], { rx: rx * 0.72, rz: rz * 0.72, th: th * 0.8, yaw: yaw + 37, seed: seed + 40, points: 6 + (seed % 3), sharp: 0.2, holes: 0, droop: 0.16, tilt: tl }));
    });
    const crown = bunion(shapes).part('leaves', { mat: 'crown', paint: leafPaint });
    return floor0(wood.add(crown));
  },
};
