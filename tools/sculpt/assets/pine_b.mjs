// pine_b — the TALL tiered pine of 曦光原's hills and the shrine precinct (replaces tree_pine_2 and tree_pine_1 / species
//   pine2: 11 m, crown ~4.1 x 3.6 m; pine1 = this tree at 0.73 scale; collider 0.3).
// SILHOUETTE: a tall reddish trunk that leans out of the ground (north, -Z) and straightens above; six BRANCHES leave it at
//   uneven heights, rise a little and level out, each carrying its flat needle pads out at the end (rev B: the pads sat
//   straight on the trunk — a bottle brush); a small stepped pair of pads crowns it.
// BIG FORMS: (1) the leaning bare plated trunk to 4.5 m with one dead snag, (2) six branches with their pads, turned so no
//   tier repeats the one below, (3) the small top pair.
// THE EYE RESTS ON: the branches you can follow from trunk to pad, the sky between trunk and pads, the dark scalloped
//   pad undersides with their brush-stroke rims.
// WEAR STORY: shaded lower boughs died and fell (a dead snag, stubs, bare trunk); bark in big reddish plates, grey and
//   lichened at the damp foot; the crown thins toward the windward west.
// MUST NOT LOOK LIKE: a cone, a fir, a bottle brush, buns on a pole, pine_a stretched, a pack pine, symmetric.
import { pineBuild, pineLod2, needleValue, pineWood, bough } from './trees_a_lib.mjs';

const BARE = 4.0;
const T = [[0, -0.2, 0], [0.05, 1.5, -0.28], [0.13, 3.2, -0.66], [0.2, 5.0, -0.84], [0.2, 7.0, -0.8], [0.12, 9.0, -0.6], [0.05, 10.75, -0.45]];
/** the trunk axis at height y (linear in T) */
const axis = (y) => { for (let i = 1; i < T.length; i++) if (y <= T[i][1] || i === T.length - 1) { const a = T[i - 1], b = T[i], t = Math.min(1, Math.max(0, (y - a[1]) / (b[1] - a[1]))); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; } };
// branches: [height, yaw (deg, 0 = +Z), length, radius at the trunk]
const BR = [[4.15, 80, 1.15, 0.13], [5.0, 225, 1.1, 0.12], [5.65, 125, 0.95, 0.11], [6.35, 330, 1.0, 0.11], [7.15, 175, 0.95, 0.1], [8.0, 270, 0.85, 0.09], [8.95, 40, 0.65, 0.08]];
const BRANCHES = [], PADS = [];
BR.forEach(([y, yaw, len, r0], i) => {
  const a = axis(y), pts = bough([a[0], y, a[2]], yaw, 16, len, { droop: 0.12, lift: -0.18, kink: 0.12, seed: 40 + i });
  BRANCHES.push([pts, r0]);
  const end = pts[4], k = Math.sqrt(len / 1.15);
  // the pad: its long axis ACROSS the branch (a fan), the branch ends in its underside; a twin hangs beside and below
  PADS.push([[end[0], end[1] + 0.16, end[2]], 1.2 * k, 0.9 * k, 0.78 * k, yaw + 90, 10 + i]);
});
// the top: two pads stepped
PADS.push([[0.4, 10.0, -0.35], 0.8, 0.62, 0.6, 40, 51, true], [[-0.15, 10.45, -0.65], 0.7, 0.56, 0.56, 200, 61, true]);
const SPEC = {
  trunk: T, r0: 0.36, r1: 0.1, pow: 0.8, bareTo: BARE,
  roots: [[20, 0.95, 0.15], [120, 0.75, 0.13], [200, 1.15, 0.16], [290, 0.85, 0.13]],
  boughs: [], branches: BRANCHES, pads: PADS, stack: false, twin: 0.6,
  // stubs [y, yaw, len, r]: two short ones and one long dead snag
  stubs: [[2.3, 150, 0.22, 0.1], [3.25, 300, 0.75, 0.07], [3.8, 40, 0.2, 0.085]], tuft: 0.3,
  trunkAt: (y) => { const a = axis(y); return [a[0], a[2]]; },
  woodPaint: (c) => pineWood(c, BARE),
  padPaint: (c) => needleValue(c, { cen: [0.15, 0, -0.7] }),
};
const PINE_TINT = [0.038, 0.138, 0.076];   // rev B: #37684e, see INSTALL.md

export default {
  name: 'pine_b', id: 'sculpt_tree_pine_b', species: ['pine2', 'pine1'],
  voxel: 0.025,
  lods: [5000, 1800, 500],
  ground: 0, aoRange: 1.0, aoStrength: 0.55, cavity: [0.04, 0.18], cavityDark: 0.35, creaseAngle: 82, crownTone: [0.42, 0.9],
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves_dark', surface: 'leaf', look: { rim: 0.35, wrap: 0.4 } } },
  previewTint: PINE_TINT,
  landTints: { 'NIGHT': [0.012, 0.069, 0.093], 'TODAY 4F9A58': [0.078, 0.323, 0.098] },
  replaces: { file: 'assets/models/nature/trees/tree_pine_2.glb', tint: [0.078, 0.323, 0.098] },
  notes: 'Sculpted tall tiered pine (pine2; pine1 at 0.73 scale). Materials trunk (mul) and leaves_dark (tint, x0.74). COLOR_0.a = top snow mask. See .tmp/sculpt/cherry_a/INSTALL.md.',
  lod2: () => pineLod2(SPEC),
  build({ S }) { return pineBuild(S, SPEC); },
};
