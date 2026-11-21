// cherry_b — the YOUNG cherry of 曦光原, the shrine approach and the village yards (replaces tree_cherry_2 / species
//   cherry2: 6 m tall, crown ~5.3 m, collider 0.32).
// SILHOUETTE (rev B): clearly the younger tree — a slim upright trunk, a tall narrow vase of a twisted twin leader and
//   two side limbs whose ends just begin to arch over; less blossom than the old cherry, more sky, clouds hanging
//   along the limbs.
// BIG FORMS: (1) the straight young trunk with a small flare, (2) the twin leader twisting round each other, (3) the
//   blossom: 2 big clouds, 4 medium, 6 small.
// THE EYE RESTS ON: the fork at 1.7 m (just above the player's head), the sky between the two leaders.
// WEAR STORY: young and well kept (shrine / village tree): smooth glossy bark with pale lenticel bands, no hollow, only a
//   little damp at the foot on the north side.
// MUST NOT LOOK LIKE: the old cherry scaled down, an acacia umbrella, a lollipop, a pink ball, a pack model, symmetric.
import { bunion, limb, plates, sakura, lod2Clumps, floor0, crownValue, FAR, C, mix, ss } from './trees_a_lib.mjs';

const far = FAR();
const CEN = [0, 4.2, 0];
const F = [0.05, 1.75, 0.03];
// limbs: the twin leader (0, 1) crossing once, two side limbs (2, 3), two short ones
const LIMBS = [
  [[F, [-0.1, 2.9, -0.3], [0.15, 4.0, -0.55], [-0.15, 5.0, -0.7], [-0.35, 5.45, -0.55]], 0.15, 0.045],    // 0 leader A
  [[F, [0.25, 2.8, 0.3], [-0.05, 3.9, 0.55], [0.3, 4.75, 0.8], [0.5, 5.0, 1.15]], 0.14, 0.045],           // 1 leader B
  [[F, [-0.5, 2.6, 0.15], [-1.05, 3.5, 0.3], [-1.65, 3.8, 0.4], [-2.0, 3.35, 0.45]], 0.12, 0.04],       // 2 west side limb
  [[F, [0.55, 2.65, -0.15], [1.05, 3.55, -0.35], [1.6, 3.85, -0.5], [1.9, 3.4, -0.6]], 0.12, 0.04],       // 3 east side limb
  [[[0.12, 3.8, -0.5], [-0.5, 4.5, -1.25], [-0.8, 4.5, -1.65], [-0.95, 4.1, -1.85]], 0.07, 0.035],        // 4
  [[[-0.02, 3.7, 0.5], [0.5, 4.3, 1.2], [0.7, 4.35, 1.6], [0.8, 4.0, 1.85]], 0.07, 0.035],            // 5
];
// blossom clouds: [limb, t, radius, seed] — 2 big, 4 medium, 6 small: less than the old tree
const CLUMPS = [
  [0, 0.95, 0.8, 21], [1, 0.9, 0.8, 22],
  [2, 0.72, 0.68, 23], [3, 0.72, 0.66, 24], [4, 0.8, 0.6, 25], [5, 0.8, 0.58, 26],
  [2, 1, 0.45, 27], [3, 1, 0.45, 28], [2, 0.88, 0.5, 33], [3, 0.88, 0.48, 34], [4, 1, 0.38, 29], [5, 1, 0.38, 30], [0, 0.6, 0.42, 31], [1, 0.55, 0.4, 32],
];

function woodPaint(c) {
  const { x, y, z, nx, ny, nz, cavity, edge, ao } = c;
  // cherry bark: dark plum-brown, pale lenticel ridges (edge), wet dark between; boughs a little darker; hollow black
  let col = mix(C('#74504a'), C('#5c403c'), ss(1.8, 4.5, y));
  col = mix(col, C('#9a8078'), edge * 0.75);
  col = mix(col, C('#2e201d'), Math.min(1, cavity * 1.0));
  // moss on the damp north foot (-Z), broken by noise
  const moss = 0.4 * ss(0.8, 0.2, y) * ss(0.1, -0.6, nz) * ss(-0.1, 0.25, c.S.fbm(x * 2.2, y * 2.2, z * 2.2, 5, 2));
  col = mix(col, C('#6f7a44'), moss * 0.7);
  col = mix(col, C('#3a2c26'), ss(0.35, 0.0, y) * 0.25);   // wet dark foot
  return col;
}
function hollowPaint(c) {
  const { cavity, edge, ao } = c;
  let col = mix(C('#2a1d19'), C('#4a3428'), ao);               // rotten heartwood, deep
  return mix(col, C('#8a6a54'), edge * 0.8);                  // the rolled callus lip, paler new wood
}

export default {
  name: 'cherry_b', id: 'sculpt_tree_cherry_b', species: ['cherry2'],
  voxel: 0.02,
  lods: [5000, 1800, 500],
  farFrom: 1, farVoxel: 2.0,
  ground: 0, aoRange: 1.0, aoStrength: 0.55, cavity: [0.04, 0.18], cavityDark: 0.35, creaseAngle: 82,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves_dark', surface: 'leaf', look: { rim: 0.4, wrap: 0.45 } } },
  previewTint: [1, 0.584, 0.716],                                          // C.sakura 0xffc9dc (linear)
  landTints: { 'SAKURA DEEP': [1, 0.347, 0.539], 'SAKURA PALE': [0.98, 0.665, 0.785] },
  replaces: { file: 'assets/models/nature/trees/tree_cherry_2.glb', tint: [1, 0.584, 0.716] },
  notes: 'Sculpted young cherry (cherry2). Materials trunk (mul: COLOR_0 = bark colour) and blossom (tint: COLOR_0 = value ramp). COLOR_0.a = top snow mask. See .tmp/sculpt/cherry_a/INSTALL.md (all four trees).',
  lod2: () => { const SK = sakura({ limbs: LIMBS, clumps: lod2Clumps(CLUMPS), cen: CEN, far: true }); return { blobs: SK.blobs, tubes: [{ pts: [[0, -0.2, 0], [0, 1.0, 0], F], r0: 0.36, r1: 0.2, n: 6 }, ...LIMBS.slice(0, 4).map(([p, r0]) => ({ pts: [p[0], p[Math.floor(p.length / 2)], p[p.length - 1]], r0: r0 * 1.15, r1: 0.05, n: 4 }))] }; },
  build({ S }) {
    S.part('bark', { mat: 'wood', paint: woodPaint });
    // trunk: upright, a slight S, a modest flare
    const tp = [[0, -0.2, 0], [0.04, 0.6, -0.02], [-0.02, 1.15, 0.02], [0.04, 1.5, 0.03], [0.05, 1.9, 0.03]];
    let trunk = limb(tp, 0.42, 0.24, 0.6);
    trunk = trunk.softAdd(S.ellipsoid([0.48, 0.3, 0.45]).at(0, 0.0, 0), 0.2);
    const pieces = [trunk];
    // surface roots gripping the ground (unequal, the downhill / lean side longer)
    for (const [a, L, r] of (far ? [[40, 0.85, 0.13], [150, 0.7, 0.12], [260, 0.8, 0.12], [330, 0.6, 0.11]].slice(0, 3) : [[40, 0.85, 0.13], [150, 0.7, 0.12], [260, 0.8, 0.12], [330, 0.6, 0.11]])) {   // R4: the far field (LOD1/2) keeps three roots: no ball foot
      const t = a * Math.PI / 180, d = [Math.sin(t), Math.cos(t)];
      pieces.push(limb([[d[0] * 0.15, 0.3, d[1] * 0.15], [d[0] * L * 0.45, 0.1, d[1] * L * 0.45], [d[0] * L, -0.08, d[1] * L]], r, 0.05, 0.6));
    }
    const SK = sakura({ limbs: LIMBS, clumps: CLUMPS, cen: CEN, far, zigAmp: 0.1, seedBase: 11 });
    pieces.push(...SK.wood);
    let woodS = bunion(pieces, 0.12);
    if (!far) {
      // cherry bark: horizontal lenticel ridges (cells stretched sideways), strongest on the old trunk
      woodS = plates(woodS, { w: 0.42, h: 0.13, depth: 0.022, groove: 0.3, seed: 3, where: (x, y) => 0.7 * ss(3.0, 1.6, y) });
    }
    woodS = woodS.part('bark', { mat: 'wood', paint: woodPaint });
    const crownPaint = (c) => { const v = crownValue(c, { cen: CEN, R: 2.4, ry: 1.4, lo: 0.6, hi: 0.95, seed: 4 }); return [v, v, v]; };
    const crown = bunion(SK.crown, far ? 0.3 : 0).part('blossom', { mat: 'crown', paint: crownPaint });
    return floor0(woodS.add(crown));
  },
};
