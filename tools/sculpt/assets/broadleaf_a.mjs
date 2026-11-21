// broadleaf_a — the great round-headed broadleaf of the sunlit lands (replaces tree_broadleaf_1 / broad1: 7 m tall, crown
//   ~5.4 m across, collider trunkR 0.32; broad3 = this tree at 1.57x).
// SILHOUETTE: a short, heavy trunk on a buttressed foot that opens at the fork into five strong boughs like a hand; over
//   them a ROUND HEAD made of six separate leaf masses (five round the rim, one on top) with sky and deep shade between.
// BIG FORMS: (1) the buttressed, ridged trunk, (2) the fork and its five boughs the eye can follow into the masses,
//   (3) the six crown masses, each a cushion with smaller cushions hung on its rim (two-scale scallop).
// THE EYE RESTS ON: the fork (the throat of the tree), the buttress fins gripping the ground, the dark window under the
//   crown where the boughs cross the sky.
// WEAR STORY: an old village tree; the long south-west bough sags under its mass; the bark ridges are pale where rain
//   runs, dark in the furrows; moss on the damp north foot; one old pruning knot healed over on the trunk.
// MUST NOT LOOK LIKE: a green ball on a stick, a cone, a pack tree's faceted lump, a symmetric lollipop, noise for bark.
import { bunion, limb, plates, cloud, zig, floor0, crownValue, buttress, groundRoot, lit, farField, FAR, C, mix, ss } from './trees_c_lib.mjs';

const far = FAR();
const F = [0.12, 2.25, 0.02];             // the fork
const CEN = [0.05, 4.75, 0.05];           // crown centre (for the AO gradient)
// crown masses: [centre, radius, seed, satellites]; five round the rim (uneven angles / heights), one on top
const MASSES = [
  [[-1.45, 3.75, 0.8], 1.2, 21, 1],      // 0 south-west, the low one on the sagging bough
  [[1.2, 4.3, 1.0], 1.15, 22, 1],        // 1 south-east
  [[1.4, 4.0, -0.9], 1.18, 23, 1],       // 2 north-east, low
  [[-0.4, 4.45, -1.35], 1.15, 24, 1],    // 3 north, higher
  [[-1.5, 4.75, -0.3], 1.05, 25, 1],     // 4 west, higher still
  [[0.15, 5.55, 0.1], 1.32, 26, 2],      // 5 the top
];
// boughs: [path (fork -> elbow -> into the mass), r0, r1, mass index]
const BOUGHS = [
  [[F, [-0.55, 2.75, 0.4], [-1.15, 3.25, 0.75]], 0.2, 0.08, 0],
  [[F, [0.6, 2.95, 0.45], [1.05, 3.85, 0.85]], 0.19, 0.075, 1],
  [[F, [0.65, 3.0, -0.35], [1.2, 4.1, -0.7]], 0.19, 0.075, 2],
  [[F, [0.0, 3.0, -0.6], [-0.3, 3.75, -1.2]], 0.18, 0.07, 3],
  [[F, [-0.5, 3.15, -0.15], [-1.2, 4.3, -0.3]], 0.16, 0.065, 4],
  [[[0.1, 2.9, 0.1], [0.25, 4.0, 0.1], [0.18, 5.0, 0.05]], 0.17, 0.07, 5],
];

function bark(c) {
  const { x, y, z, ny, nz, cavity, edge, S } = c;
  // grey-brown ridged bark: pale on the ridges, dark in the furrows; boughs a little warmer and smoother.
  // (rev) ONE bark from the ground up: the root flare is the same bark, darker and damp low, mossy where it meets the
  // ground (moss on every top-facing root surface below 0.7 m, and up the north side); ridge highlights fade at the foot
  const foot = ss(1.3, 0.2, y);
  let col = mix(C('#7c6758'), C('#957c6a'), ss(0.8, 3.0, y));
  col = mix(col, C('#b3a08a'), edge * 0.5 * (1 - 0.85 * foot));
  col = mix(col, C('#463a31'), Math.min(1, cavity * 0.8));
  col = mix(col, C('#4a3e35'), foot * 0.75);                               // damp dark foot and roots
  const n = S.fbm(x * 2.2, y * 2.2, z * 2.2, 5, 2);
  const moss = Math.max(ss(0.9, 0.15, y) * ss(-0.3, 0.4, ny) * ss(-0.35, 0.05, n), ss(1.7, 0.3, y) * ss(0.15, -0.55, nz) * ss(-0.1, 0.25, n));
  col = mix(col, C('#56652f'), moss * 0.85);
  return mix(col, C('#33291f'), ss(0.12, -0.02, y) * 0.6);                 // the ground line
}
// the foot keeps its ground AO (roots must not bake pale); the trunk above 1.4 m gets the kit AO back as before
const BARK = lit(bark, 0.55, (c) => ss(0.1, 1.4, c.y));
const CROWN = { flat: 0.68, skin: 0.08, lobes: 12, satDist: 0.7, satR: 0.55, satDrop: 0.22, spread: 1.6, lobe: { k: 0.12, lr0: 0.26, lr1: 0.14, inset: [0.3, 0.2], satLobes: 7, rim: 10, rimR: 0.22, rimY: -0.05, under: 0.36, cutK: 0.1 } };
const massAt = ([c0, r]) => [[c0[0] * 0.86, c0[1], c0[2] * 0.86], r * 1.08];
/** LOD2, built: one blob per clump (cloud centres), trunk + boughs as 5-6 sided tubes */
function farSpec() {
  const blobs = [];
  MASSES.forEach((m) => {
    const [c, r] = massAt(m), cl = cloud(c, r, { seed: m[2], sat: m[3], out: [c[0] - CEN[0], 1, c[2] - CEN[2]], ...CROWN });
    cl.centres.forEach(([cc, rr], i) => blobs.push([[cc[0], cc[1] - rr * 0.05, cc[2]], [rr * 1.02, rr * 0.78, rr * 1.02], m[2] * 3 + i]));
  });
  const tubes = [[[[0, 0, 0], [0.04, 0.9, 0.0], [0.08, 1.6, 0.03], F], 0.5, 0.27, 6]];
  BOUGHS.forEach(([pts0, r0, r1, mi]) => { const [cc] = massAt(MASSES[mi]); tubes.push([[pts0[0], pts0.at(-1), [cc[0] * 0.8, cc[1] - 0.3, cc[2] * 0.8]], r0 * 0.95, r1, 5]); });
  return { blobs, tubes, crown: 'leaves', wood: 'bark' };
}

export default {
  name: 'broadleaf_a', id: 'sculpt_tree_broadleaf_a', species: ['broad1', 'broad3'],
  voxel: 0.022,
  lods: [5000, 1800, 500],
  farFrom: 2, farVoxel: 2.4, farSpec,
  ground: 0, aoRange: 1.0, aoStrength: 0.55, cavity: [0.04, 0.18], cavityDark: 0.25, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves', surface: 'leaf', look: { rim: 0.4, wrap: 0.45 } } },
  previewTint: [0.202, 0.604, 0.091],                                      // sunLeaf 0x7ccc55 (linear)
  landTints: { 'SUN 5fae48': [0.114, 0.423, 0.065], 'DUSK d88a3a': [0.687, 0.254, 0.042], 'NIGHT 1f5560': [0.014, 0.091, 0.117] },
  replaces: { file: 'assets/models/nature/trees/tree_broadleaf_1.glb', tint: [0.202, 0.604, 0.091] },
  notes: 'Sculpted great broadleaf (broad1; broad3 at 1.57x). Materials trunk (mul: COLOR_0 = bark colour) and leaves (tint: COLOR_0 = value ramp). COLOR_0.a = top snow mask. See .tmp/sculpt/broadleaf_a/INSTALL.md.',
  build({ S }) {
    S.part('bark', { mat: 'wood', paint: BARK });
    S.part('leaves', { mat: 'crown', paint: (c) => { const v = crownValue(c, { cen: CEN, R: 2.6, ry: 1.7, lo: 0.42, hi: 1.0, seed: 4 }); return [v, v, v]; } });
    if (far) return floor0(farField(S, farSpec()));
    // trunk: short and heavy, a slight lean east, flaring into buttresses
    let trunk = limb([[0, -0.2, 0], [0.02, 0.8, 0.0], [0.08, 1.6, 0.03], F], 0.39, 0.28, 0.8);
    trunk = trunk.softAdd(S.ellipsoid([0.55, 0.45, 0.52]).at(0, 0.0, 0), 0.25);
    const pieces = [trunk];
    if (!far) {
      for (const [a, L, r, h, sd] of [[15, 0.8, 0.3, 0.9, 1], [100, 0.6, 0.25, 0.75, 2], [165, 0.75, 0.27, 0.85, 3], [290, 0.9, 0.29, 0.95, 5]])
        pieces.push(buttress(a, L, r, h, { seed: sd, rt: 0.22 }));
      for (const [a, L, r, sd] of [[55, 1.35, 0.13, 6], [230, 1.5, 0.14, 8], [335, 1.1, 0.11, 9]]) pieces.push(groundRoot(a, L, r, { seed: sd, rt: 0.45, y0: 0.15 }));
    }
    BOUGHS.forEach(([pts0, r0, r1, mi], i) => {
      const [cc, cr] = MASSES[mi], pts = pts0.concat([[cc[0] * 0.86, cc[1] - cr * 0.12, cc[2] * 0.86]]);   // end deep in the mass: no tip shows
      pieces.push(limb(far ? pts : zig(pts, 0.16, i + 3), far ? r0 * 0.9 : r0, Math.max(r1, 0.055), 0.8));
    });
    let wood = bunion(pieces, 0.12);
    if (!far) {
      // vertical ridged plates on the old trunk (cells stretched upward), fading out into the boughs
      wood = plates(wood, { w: 0.17, h: 0.55, depth: 0.03, groove: 0.28, seed: 4, where: (x, y) => ss(3.2, 2.0, y) });
      // an old pruning knot on the south face, healed over (a ring swell)
      wood = wood.softAdd(S.ellipsoid([0.13, 0.15, 0.1]).at(0.08, 1.75, 0.3), 0.06);
    }
    wood = wood.part('bark', { mat: 'wood', paint: BARK });
    const crownPaint = (c) => { const v = crownValue(c, { cen: CEN, R: 2.6, ry: 1.7, lo: 0.42, hi: 1.0, seed: 4 }); return [v, v, v]; };
    const shapes = [], twigs = [];
    MASSES.forEach((m) => {
      // (rev) oak clumps: bigger, flatter-bottomed, a ring of rim lobes for a lobed, toothed outline
      const [c, r] = massAt(m);
      const cl = cloud(c, r, { seed: m[2], sat: m[3], out: [c[0] - CEN[0], 1, c[2] - CEN[2]], ...CROWN });
      shapes.push(...cl.shapes);
      for (const t of cl.twigs) twigs.push(limb(t, 0.06, 0.045));
    });
    const crown = bunion(shapes, 0).part('leaves', { mat: 'crown', paint: crownPaint });
    if (twigs.length) wood = wood.add(bunion(twigs).part('bark', { mat: 'wood', paint: BARK }));
    return floor0(wood.add(crown));
  },
};
