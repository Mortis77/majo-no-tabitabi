// pine_a — the WINDSWEPT pine of 曦光原's ridges and the shrine rim (replaces tree_pine_3 and tree_pine_snow_1 / species
//   pine3, pineSnow: 10 m tall, crown ~5.4 x 5.0 m, collider 0.3).
// SILHOUETTE: a bare reddish trunk leaning hard downwind (+X), turning back up near the top; horizontal boughs carrying flat
//   layered pads of needles, most of them thrown downwind; the crown ends in a STEPPED cluster of three pads (rev B: the
//   single flat top disc read as a lily pad on a stalk).
// BIG FORMS: (1) the leaning, plated trunk, (2) the stepped top cluster, (3) seven side pads in loose tiers, each its own
//   mass with sky between.
// THE EYE RESTS ON: the elbow where the trunk turns back up, the brush-stroke rims of the pads, their dark scalloped
//   undersides.
// WEAR STORY: a century of west wind leaned it and stripped the upwind side (short boughs there); the lower trunk lost its
//   boughs and shows big reddish plates, grey and lichened at the damp north foot.
// MUST NOT LOOK LIKE: a cone, a fir, a Christmas tree, mint pillows, a pack pine, symmetric, evenly tufted.
import { pineBuild, pineLod2, needleValue, pineWood } from './trees_a_lib.mjs';

const BARE = 3.8;
const T = [[0, -0.2, 0], [0.35, 1.6, 0.0], [0.95, 3.4, 0.08], [1.45, 5.2, 0.1], [1.6, 6.7, 0.02], [1.35, 8.1, -0.05], [1.0, 9.2, 0.0]];
const PADS = [
  // [centre, rx, rz, th, yaw (deg, the long axis), seed, solo] — thrown downwind (+X); the upwind (-X) pads short
  [[2.0, 4.15, -0.65], 1.45, 0.95, 0.58, 100, 1],
  [[-0.15, 4.95, -1.25], 1.0, 0.75, 0.5, 215, 2],
  [[1.75, 5.6, 1.25], 1.4, 0.92, 0.56, 25, 3],
  [[-0.7, 6.35, 0.35], 0.95, 0.7, 0.48, 280, 4],
  [[2.2, 6.9, -0.45], 1.3, 0.88, 0.54, 95, 5],
  [[0.6, 7.75, -1.25], 1.0, 0.72, 0.5, 210, 6],
  [[1.0, 8.15, 1.1], 1.05, 0.74, 0.5, 20, 7],
  // rev B: the top as a stepped cluster of three pads, each smaller and higher, streaming downwind
  [[1.75, 8.95, 0.2], 1.3, 0.92, 0.52, 95, 8, true],
  [[0.65, 9.35, -0.4], 0.95, 0.7, 0.46, 200, 9, true],
  [[1.15, 9.8, 0.1], 0.7, 0.55, 0.42, 60, 10, true],
];
const BOUGHS = [
  [[1.0, 3.55, 0.06], 0, 0.14], [[1.18, 4.25, 0.08], 1, 0.12], [[1.42, 5.1, 0.1], 2, 0.14], [[1.55, 6.15, 0.05], 3, 0.1],
  [[1.6, 6.7, 0.02], 4, 0.12], [[1.45, 7.7, -0.03], 5, 0.09], [[1.4, 7.95, -0.03], 6, 0.09], [[1.15, 8.75, -0.02], 7, 0.12],
  [[1.05, 9.05, 0.0], 8, 0.08],
];
const SPEC = {
  trunk: T, r0: 0.37, r1: 0.12, pow: 0.75, bareTo: BARE,
  roots: [[60, 1.0, 0.15], [140, 0.8, 0.13], [230, 1.15, 0.16], [310, 0.85, 0.13]],
  boughs: BOUGHS, pads: PADS, stubs: [[2.2, 250, 0.25, 0.1], [3.0, 20, 0.2, 0.09]], reach: 0.35, twin: 0.85, elbow: 0.3, tuft: 0.3, trunkAt: (y) => [0.15 * y + 0.1 * Math.sin(y * 0.4), 0],
  woodPaint: (c) => pineWood(c, BARE),
  padPaint: (c) => needleValue(c, { cen: [1.2, 0, 0] }),
};
// rev B pine tint (the hue is the land tint's): dark blue-green, see INSTALL.md — #37684e (linear below)
const PINE_TINT = [0.038, 0.138, 0.076];

export default {
  name: 'pine_a', id: 'sculpt_tree_pine_a', species: ['pine3', 'pineSnow'],
  voxel: 0.025,
  lods: [5000, 1800, 500],
  ground: 0, aoRange: 1.0, aoStrength: 0.55, cavity: [0.04, 0.18], cavityDark: 0.35, creaseAngle: 82, crownTone: [0.42, 0.9],
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves_dark', surface: 'leaf', look: { rim: 0.35, wrap: 0.4 } } },
  previewTint: PINE_TINT,
  landTints: { 'NIGHT': [0.012, 0.069, 0.093], 'MOUNTAIN SNOW': [0.05, 0.195, 0.098], 'TODAY 4F9A58': [0.078, 0.323, 0.098] },
  replaces: { file: 'assets/models/nature/trees/tree_pine_3.glb', tint: [0.078, 0.323, 0.098] },
  notes: 'Sculpted windswept pine (pine3, pineSnow). Materials trunk (mul) and leaves_dark (tint, x0.74). COLOR_0.a = top snow mask (pineSnow). See .tmp/sculpt/cherry_a/INSTALL.md.',
  lod2: () => pineLod2(SPEC),
  build({ S }) { return pineBuild(S, SPEC); },
};
