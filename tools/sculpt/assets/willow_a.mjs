// willow_a — the river willow of 薄暮林 (replaces tree_willow_1 / species willow1: 7 m tall, leaning ~4 m over the water
//   toward -Z, crown ~3.9 x 5.9 m; collider trunkR 0.32; turned 180 deg and scaled it stands in for willow2).
// SILHOUETTE: a thick trunk that leans out over the water and turns up again at a knotted, pollarded HEAD; from the head
//   a fountain of whips arches up and out and falls back as CURTAINS — tapered ribbons of leaf mass in bunches of
//   unequal length, the longest on the water side nearly touching the ground; a small lit dome sits on the head.
// BIG FORMS: (1) the leaning trunk with its bank-side root flare, (2) the knuckled head with its arching whips,
//   (3) six or seven curtain bunches hanging round it, gaps between them where the sky and the trunk show.
// THE EYE RESTS ON: the knotted head (knuckles of old cuts), the lit crowns of the arches against the dark falling
//   curtains, the ragged unequal hem of the curtains.
// WEAR STORY: an old pollard, cut back for withies for generations: a swollen knuckled head, a hollow scar on the
//   bank side of the trunk, roots clawing the bank on the land side to hold the lean, damp dark foot.
// MUST NOT LOOK LIKE: a mop or a jellyfish (one even fringe), a green cone, a pack willow's sheet of hanging cards.
import { bunion, limb, plates, zig, floor0, crownValue, clump, ribbon, FAR, C, mix, ss } from './trees_b_lib.mjs';
import * as P from '../sdf.mjs';

const far = FAR();
const HEAD = [0.05, 4.7, -2.55];
const CEN = [0.05, 5.4, -2.6];
// whips: [yaw deg (0 = +Z), reach m, rise m, curtain bunch: [strands, length of the longest]]
const WHIPS = [
  [180, 2.4, 1.15, [5, 3.6]],     // over the water: the longest curtain
  [235, 2.1, 1.25, [4, 3.0]],
  [125, 2.2, 1.1, [4, 3.2]],
  [290, 1.7, 1.35, [3, 2.3]],
  [65, 1.8, 1.3, [4, 2.6]],
  [10, 1.4, 1.45, [3, 2.0]],      // back over the trunk (the bank side): short
  [340, 1.2, 1.5, [2, 1.6]],
];

function bark(c) {
  const { x, y, z, nz, cavity, edge } = c;
  // old willow: deep-furrowed grey-brown, pale ridges, darker and wetter low on the water side
  let col = mix(C('#7a6658'), C('#8a7666'), ss(1.0, 4.5, y));
  col = mix(col, C('#b4a290'), edge * 0.8);
  col = mix(col, C('#463429'), Math.min(1, cavity * 1.25));
  const lich = ss(0.1, -0.5, nz) * ss(3.5, 0.6, y) * ss(0.0, 0.3, c.S.fbm(x * 1.6, y * 1.6, z * 1.6, 3, 2));
  col = mix(col, C('#98a07a'), lich * 0.5);
  col = mix(col, C('#3e2f27'), ss(0.35, 0.0, y) * 0.5);
  return col;
}
function knuckle(c) {
  // the pollard head: the bark paler and smoother on the old cut knuckles
  return mix(bark(c), C('#a89482'), 0.35 * ss(0.2, 0.8, c.ny));
}

export default {
  name: 'willow_a', id: 'sculpt_tree_willow_a', species: ['willow1', 'willow2'],
  voxel: 0.022,
  lods: [5000, 1800, 500],
  farFrom: 2, farVoxel: 2.4, farCrease: 150,
  ground: 0, aoRange: 0.9, aoStrength: 0.55, cavity: [0.035, 0.15], cavityDark: 0.35, creaseAngle: 55,
  materials: {
    wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } },
    crown: { name: 'leaves', surface: 'leaf', look: { rim: 0.4, wrap: 0.45 } },
    crownHang: { name: 'leaves_dark', surface: 'leaf', look: { rim: 0.4, wrap: 0.5 } },
  },
  matDark: { crownHang: 0.74 },                                             // partRule('leaves_dark').dark
  previewTint: [0.392, 0.479, 0.133],                                       // REVIEW_A soft yellow-green a8b866 (linear); scatter.js C.willow is 86c45e
  landTints: { 'PAL 86c45e': [0.238, 0.552, 0.111], 'DUSK b9a24e': [0.485, 0.356, 0.076] },
  replaces: { file: 'assets/models/nature/trees/tree_willow_1.glb', tint: [0.238, 0.552, 0.111] },
  notes: 'Sculpted river willow (willow1; willow2 turned 180 deg). Materials trunk (mul), leaves (tint: head dome) and leaves_dark (tint, dark 0.74: the hanging curtains). COLOR_0.a = top snow mask. See .tmp/sculpt/maple_a/INSTALL.md.',
  build({ S }) {
    S.part('bark', { mat: 'wood', paint: bark });
    S.part('knuckle', { mat: 'wood', paint: knuckle });
    // trunk: rises from the bank, leans out over the water (-Z), turns up into the head
    const tp = [[0, -0.2, 0.05], [0.0, 0.8, -0.05], [0.04, 1.9, -0.55], [0.08, 3.1, -1.45], [0.06, 4.1, -2.2], HEAD];
    let trunk = limb(tp, 0.33, 0.26, 0.55);
    trunk = trunk.softAdd(S.ellipsoid([0.66, 0.42, 0.62]).at(0, 0.0, 0.12), 0.28);
    const pieces = [trunk];
    if (!far) {
      // roots: the long ones claw back up the bank (+Z) to hold the lean; short ones toward the water
      for (const [a, L, r] of [[-25, 1.35, 0.2], [20, 1.45, 0.22], [70, 1.1, 0.16], [150, 0.7, 0.14], [210, 0.65, 0.13], [290, 1.2, 0.17]]) {
        const t = a * Math.PI / 180, d = [Math.sin(t), Math.cos(t)];
        pieces.push(limb([[d[0] * 0.22, 0.42, d[1] * 0.22], [d[0] * L * 0.42, 0.14, d[1] * L * 0.42], [d[0] * L, -0.08, d[1] * L]], r, 0.05, 0.6));
      }
      // a twist of muscle along the top of the lean (the tension side)
      pieces.push(limb([[0.1, 0.9, 0.15], [0.16, 2.2, -0.45], [0.12, 3.4, -1.45]], 0.1, 0.06));
    }
    let wood = bunion(pieces, 0.12);
    // the hollow scar on the bank side of the trunk (cut before the plates so the rim keeps its bark)
    if (!far) wood = wood.softCut(S.ellipsoid([0.13, 0.42, 0.14]).at(0.0, 1.35, 0.03).turn(-20, 0, 0), 0.05);
    if (!far) wood = plates(wood, { w: 0.22, h: 0.8, depth: 0.045, groove: 0.28, seed: 4, where: (x, y) => ss(4.2, 2.8, y) });
    wood = wood.part('bark', { mat: 'wood', paint: bark });
    // the knotted head: knuckles of old cuts, each a swollen boss with a stub
    const kn = [];
    const rk = P.prng(31);
    for (let i = 0; i < (far ? 3 : 7); i++) {
      const a = i * 2.39996 + rk() * 0.5, r0 = 0.2 + 0.12 * rk();
      const p = [HEAD[0] + Math.sin(a) * 0.3, HEAD[1] + 0.1 + rk() * 0.35, HEAD[2] + Math.cos(a) * 0.3];
      kn.push(S.sphere(r0).at(...p));
      if (!far) kn.push(limb([p, [p[0] + Math.sin(a) * 0.18, p[1] + 0.3, p[2] + Math.cos(a) * 0.18]], r0 * 0.6, r0 * 0.5));
    }
    const head = bunion(kn, 0.12).part('knuckle', { mat: 'wood', paint: knuckle });
    // REVISION (REVIEW_A): willow is all fall — eight whips arch up from the knuckles and over, carrying only a THIN crown
    // of flat leaf sprays along their tops; from their falling outer halves hang 24 soft strands: narrow rounded
    // ribbons tapering to a soft point, nearly vertical, unequal (the water side longest, ~2/3 of the way down)
    // RV2: the arches make a DOME (rise to ~6.9 m, fall to ~5.3 at the rim); the crown is only a thin leafy sleeve
    // riding each arch; the strands leave the arches all along their falling half, so they draw the crown's outline
    const RX = 1.8, RZ = 2.0;
    const whips = [], hang = [], dome = [], arcs = [];
    const rd = P.prng(57);
    const NW = far ? 5 : 8;
    for (let i = 0; i < NW; i++) {
      const yaw = i * (360 / NW) + 20 + (rd() - 0.5) * 22, t = yaw * Math.PI / 180, o = [Math.sin(t), 0, Math.cos(t)];
      const ex = o[0] * RX * (0.9 + 0.2 * rd()), ez = o[2] * RZ * (0.9 + 0.2 * rd()), rise = 2.0 + 0.35 * rd();
      const b0 = [HEAD[0] + o[0] * 0.25, HEAD[1] + 0.35, HEAD[2] + o[2] * 0.25];
      const pts = [b0, [CEN[0] + ex * 0.2, HEAD[1] + rise * 0.9, CEN[2] + ez * 0.2], [CEN[0] + ex * 0.5, HEAD[1] + rise, CEN[2] + ez * 0.5],
        [CEN[0] + ex * 0.8, HEAD[1] + rise * 0.75, CEN[2] + ez * 0.8], [CEN[0] + ex * 1.0, HEAD[1] + rise * 0.32, CEN[2] + ez * 1.0]];
      arcs.push({ pts, o });
      whips.push(limb(far ? pts : zig(pts, 0.04, i + 3), 0.085, 0.03, 0.8));
      // the thin crown: a leafy sleeve over the arch's top and shoulder (not a cap)
      const sl = [pts[1], pts[2], pts[3]].map((p, k) => [p[0], p[1] + 0.1 - k * 0.02, p[2]]);
      dome.push(limb(sl, far ? 0.32 : 0.24, far ? 0.26 : 0.16, 0.8));
    }
    dome.push(clump([CEN[0], HEAD[1] + 2.05, CEN[2]], far ? 0.75 : 0.6, { seed: 99, lobes: far ? 3 : 5, flat: 0.5, under: 0.5, skin: 0, out: [0, 1, 0], far }));
    // strands: 22 outer (+3 inner), unequal, water side longest (hem ~1.6 m), bank side short
    const NS = far ? 8 : 22;
    for (let i = 0; i < NS; i++) {
      const A = arcs[(i * 3) % NW], s0 = far ? 0.85 : 0.5 + 0.5 * ((i * 0.618) % 1);    // where on the falling half
      const seg = 2 + s0 * 2, j = Math.min(3, Math.floor(seg)), f = seg - j;
      const at = A.pts[j].map((v, q) => v + (A.pts[j + 1][q] - v) * f);
      const water = ss(-0.3, -1, A.o[2]), bank = ss(0.3, 1, A.o[2]);
      const target = 2.6 + 0.7 * bank - 0.9 * water + (rd() - 0.4) * 1.4;              // the hem: ~1.6-4 m above ground
      const L = Math.max(1.0, at[1] - Math.max(1.9, target));
      hang.push(ribbon([at[0], at[1] - 0.04, at[2]], { len: L, w: far ? 0.8 : 0.26 + 0.12 * rd(), t: far ? 0.22 : 0.095, out: A.o, bow: (far ? 0.1 : 0.12 + 0.12 * rd()) * (1 - s0 * 0.5), sway: far ? 0.04 : 0.06, taper: far ? 0.85 : 0.95, seed: i + 1, tooth: 0, far }));
    }
    if (!far) for (let i = 0; i < 3; i++) {
      const A = arcs[i * 3 + 1], p = A.pts[2];
      hang.push(ribbon([p[0] * 0.75 + CEN[0] * 0.25, p[1] - 0.15, p[2] * 0.75 + CEN[2] * 0.25], { len: 1.8 + rd() * 0.8, w: 0.28, t: 0.09, out: A.o, bow: 0.05, sway: 0.05, taper: 0.95, seed: 200 + i, tooth: 0 }));
    }
    wood = wood.add(head).add(bunion(whips, 0.05));
    const domePaint = (c) => {
      let v = crownValue(c, { cen: CEN, R: 2.2, ry: 1.2, lo: 0.62, hi: 0.86, seed: 3 });
      v *= 0.88 + 0.12 * ss(-0.35, 0.55, c.ny);
      return [v, v, v];
    };
    const hangPaint = (c) => {
      // strands: a soft range — lit outside, a mild shade inside, the tips lighter (REVIEW_A: no lime top / dark bottom)
      const dx = c.x - CEN[0], dz = c.z - CEN[2], rr = Math.hypot(dx, dz) || 1;
      const outward = (c.nx * dx + c.nz * dz) / rr;
      let v = 0.8 + 0.1 * ss(-0.6, 0.7, outward) + 0.12 * ss(5.0, 2.2, c.y);
      v *= 0.88 + 0.12 * c.ao;
      v += 0.04 * c.edge;
      return [v, v, v];
    };
    const crown = bunion(dome, 0.12).part('leaves', { mat: 'crown', paint: domePaint });
    const curtains = bunion(hang, far ? 0.06 : 0.0).part('curtains', { mat: 'crownHang', paint: hangPaint });
    return floor0(wood.add(crown).add(curtains));
  },
};
