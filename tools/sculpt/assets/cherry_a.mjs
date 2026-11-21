// cherry_a — the OLD cherry of 曦光原 (replaces tree_cherry_1 / species cherry1: 8 m tall, crown ~9.1 x 7.1 m, collider 0.4).
// SILHOUETTE (rev B): a sakura, not an acacia — a short thick trunk leaning east forks low into dark twisting limbs that
//   rise, spread WIDE and LOW and arch down at their ends; blossom clouds hang ALONG the limbs, the lowest at the drooping
//   tips well under the crown top, with sky between the clouds.
// BIG FORMS: (1) the leaning, flared trunk with its hollow, (2) four great arching limbs + a leader, (3) the blossom:
//   3 big clouds, 6 medium, a dozen small ones at the tips and along the limbs.
// THE EYE RESTS ON: the dark hollow in the trunk front with its rolled lip, the low fork, the long west limb arching down
//   to its tip cloud at head height.
// WEAR STORY: a century of west wind leaned it east; a lost limb rotted into a hollow; moss on the damp north foot;
//   horizontal lenticel ridges of cherry bark, pale on the ridges, dark between.
// MUST NOT LOOK LIKE: an acacia umbrella, a lollipop, a pink ball, identical puffs, a pack tree, noise for bark.
import { bunion, limb, plates, sakura, lod2Clumps, floor0, crownValue, FAR, C, mix, ss } from './trees_a_lib.mjs';

const far = FAR();
const CEN = [0, 5.0, 0.1];
const F = [0.55, 2.0, 0.1];
// limbs: [points, r0, r1] — rise, spread, arch down at the end
const LIMBS = [
  [[F, [-0.5, 3.0, 0.35], [-1.7, 3.95, 0.5], [-2.9, 4.25, 0.55], [-3.6, 3.85, 0.5], [-3.9, 3.2, 0.45]], 0.26, 0.05],   // 0 the long west limb
  [[F, [1.35, 3.1, 0.15], [2.3, 4.05, 0.4], [3.1, 4.35, 0.6], [3.6, 3.95, 0.72], [3.8, 3.35, 0.78]], 0.25, 0.05],     // 1 east
  [[F, [0.35, 3.2, -0.7], [0.1, 4.3, -1.7], [-0.2, 4.55, -2.5], [-0.35, 4.0, -2.95]], 0.22, 0.05],                    // 2 back
  [[[0.75, 2.4, 0.15], [1.0, 3.3, 0.95], [0.85, 4.35, 1.85], [0.65, 4.5, 2.55], [0.5, 3.95, 2.95]], 0.19, 0.05],      // 3 front
  [[F, [0.8, 3.6, 0.0], [0.6, 5.1, -0.2], [0.35, 6.4, -0.1], [0.1, 7.0, 0.05]], 0.2, 0.05],                           // 4 leader
  [[[-1.0, 3.4, 0.4], [-1.5, 4.7, 1.2], [-2.1, 5.4, 1.7], [-2.55, 5.2, 2.05], [-2.8, 4.65, 2.2]], 0.13, 0.045],       // 5 west-front
  [[[1.75, 3.5, 0.25], [2.2, 4.8, -0.8], [2.65, 5.35, -1.45], [2.95, 5.0, -1.85]], 0.12, 0.045],                      // 6 east-back
  [[[0.65, 4.6, -0.15], [-0.6, 5.65, -0.8], [-1.7, 6.05, -1.2], [-2.35, 5.7, -1.4]], 0.12, 0.045],                    // 7 high west-back
  [[[0.45, 5.5, -0.15], [1.4, 6.2, 0.75], [2.05, 6.15, 1.3], [2.35, 5.7, 1.5]], 0.1, 0.04],                           // 8 high east-front
];
// blossom clouds: [limb, t along it, radius, seed] — 3 big, 6 medium, 12 small
const CLUMPS = [
  [0, 0.6, 1.25, 4], [1, 0.62, 1.2, 5], [4, 0.97, 1.15, 6],
  [2, 0.7, 0.92, 7], [3, 0.7, 0.88, 8], [5, 0.66, 0.9, 9], [6, 0.68, 0.85, 10], [7, 0.68, 0.92, 11], [8, 0.7, 0.82, 12],
  // R2: the blossom follows each limb down to its tip (a cloud at 0.87 and the tip cloud) — no bare hooks
  [0, 0.87, 0.7, 25], [1, 0.87, 0.68, 26], [2, 0.9, 0.6, 27], [3, 0.9, 0.58, 28], [5, 0.9, 0.55, 29], [6, 0.9, 0.52, 30], [7, 0.9, 0.55, 31],
  [0, 1, 0.55, 13], [1, 1, 0.55, 14], [2, 1, 0.5, 15], [3, 1, 0.5, 16], [5, 1, 0.48, 17], [6, 1, 0.45, 18], [7, 1, 0.5, 19], [8, 1, 0.5, 20],
  [0, 0.34, 0.5, 21], [1, 0.36, 0.48, 22], [4, 0.62, 0.55, 23], [2, 0.42, 0.45, 24],
];

function woodPaint(c) {
  const { x, y, z, nx, ny, nz, cavity, edge, ao } = c;
  // cherry bark: dark plum-brown, pale lenticel ridges (edge), wet dark between; boughs a little darker; hollow black
  let col = mix(C('#7c5852'), C('#674843'), ss(2.2, 5, y));
  col = mix(col, C('#9a8078'), edge * 0.75);
  col = mix(col, C('#2e201d'), Math.min(1, cavity * 1.0));
  // moss on the damp north foot (-Z), broken by noise
  const moss = ss(1.4, 0.3, y) * ss(0.1, -0.6, nz) * ss(-0.1, 0.25, c.S.fbm(x * 2.2, y * 2.2, z * 2.2, 5, 2));
  col = mix(col, C('#6f7a44'), moss * 0.7);
  col = mix(col, C('#3a2c26'), ss(0.35, 0.0, y) * 0.25);   // wet dark foot
  return col;
}
function hollowPaint(c) {
  const { cavity, edge, ao } = c;
  let col = mix(C('#2a1d19'), C('#4a3428'), ao);               // rotten heartwood, deep
  return mix(col, C('#7a5e4c'), edge * 0.5);                  // the rolled callus lip, paler new wood
}

export default {
  name: 'cherry_a', id: 'sculpt_tree_cherry_a', species: ['cherry1'],
  voxel: 0.025,
  lods: [5000, 1800, 500],
  farFrom: 1, farVoxel: 2.0,
  ground: 0, aoRange: 1.0, aoStrength: 0.55, cavity: [0.04, 0.18], cavityDark: 0.35, creaseAngle: 82,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves_dark', surface: 'leaf', look: { rim: 0.4, wrap: 0.45 } } },
  previewTint: [1, 0.584, 0.716],                                          // C.sakura 0xffc9dc (linear)
  landTints: { 'SAKURA DEEP': [1, 0.347, 0.539], 'SAKURA PALE': [0.98, 0.665, 0.785] },
  replaces: { file: 'assets/models/nature/trees/tree_cherry_1.glb', tint: [1, 0.584, 0.716] },
  notes: 'Sculpted old cherry (cherry1). Materials trunk (mul: COLOR_0 = bark colour) and blossom (tint: COLOR_0 = value ramp). COLOR_0.a = top snow mask. See .tmp/sculpt/cherry_a/INSTALL.md.',
  lod2: () => { const SK = sakura({ limbs: LIMBS, clumps: lod2Clumps(CLUMPS), cen: CEN, far: true }); return { blobs: SK.blobs, tubes: [{ pts: [[0, -0.2, 0], [0.2, 1.2, 0.06], F], r0: 0.5, r1: 0.3, n: 6 }, ...LIMBS.slice(0, 5).map(([p, r0]) => ({ pts: [p[0], p[Math.floor(p.length / 2)], p[p.length - 1]], r0: r0 * 1.1, r1: 0.06, n: 4 }))] }; },
  build({ S }) {
    S.part('hollow', { mat: 'wood', paint: hollowPaint });
    const wood = S.part('bark', { mat: 'wood', paint: woodPaint });
    // trunk: flared foot, a lean east, a slight S; the fork sits low
    const tp = [[0, -0.2, 0], [0.05, 0.6, 0.02], [0.22, 1.3, 0.06], [0.42, 1.75, 0.1], [0.55, 2.15, 0.1]];
    let trunk = limb(tp, 0.46, 0.3, 0.75);              // R4: chest r 0.35 -> ~0.39 (collider 0.4)
    trunk = trunk.softAdd(S.ellipsoid([0.62, 0.42, 0.58]).at(0.02, 0.0, 0), 0.25);                  // root flare
    const pieces = [trunk];
    // surface roots gripping the ground (unequal, the downhill / lean side longer)
    for (const [a, L, r] of (far ? [[20, 1.35, 0.2], [95, 1.0, 0.17], [160, 1.1, 0.16], [230, 0.9, 0.15], [300, 1.2, 0.18]].slice(0, 3) : [[20, 1.35, 0.2], [95, 1.0, 0.17], [160, 1.1, 0.16], [230, 0.9, 0.15], [300, 1.2, 0.18]])) {   // R4: the far field (LOD1/2) keeps three roots: no ball foot
      const t = a * Math.PI / 180, d = [Math.sin(t), Math.cos(t)];
      pieces.push(limb([[d[0] * 0.2, 0.4, d[1] * 0.2], [d[0] * L * 0.45, 0.14, d[1] * L * 0.45], [d[0] * L, -0.1, d[1] * L]], r, 0.06, 0.6));
    }
    const SK = sakura({ limbs: LIMBS, clumps: CLUMPS, cen: CEN, far, zigAmp: 0.14, seedBase: 1 });
    pieces.push(...SK.wood);
    let woodS = bunion(pieces, 0.12);
    if (!far) {
      // cherry bark: horizontal lenticel ridges (cells stretched sideways), strongest on the old trunk
      woodS = plates(woodS, { w: 0.42, h: 0.13, depth: 0.022, groove: 0.3, seed: 3, where: (x, y) => ss(3.6, 2.2, y) });
    }
    woodS = woodS.part('bark', { mat: 'wood', paint: woodPaint });
    // the hollow: a rotted-out pocket in the trunk front (+Z) where a limb was lost, its lip rolled round by callus
    {
      // rev B: the hollow is in the far field too (LOD1 kept it black-less before: it popped)
      const pocket = S.ellipsoid([0.15, 0.36, 0.24]).turn(0, 0, -12).at(0.18, 1.0, 0.42).part('hollow', { mat: 'wood', paint: hollowPaint });
      woodS = woodS.softAdd(S.ellipsoid([0.26, 0.5, 0.16]).turn(0, 0, -12).at(0.18, 1.0, 0.36), 0.08);   // the callus swell around it
      woodS = woodS.softCut(pocket, 0.05, { paintCut: true });
    }
    const crownPaint = (c) => { const v = crownValue(c, { cen: CEN, R: 4.3, ry: 2.0, lo: 0.6, hi: 0.95, seed: 4 }); return [v, v, v]; };
    const crown = bunion(SK.crown, far ? 0.3 : 0).part('blossom', { mat: 'crown', paint: crownPaint });
    return floor0(woodS.add(crown));
  },
};
