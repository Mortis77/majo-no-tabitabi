// crystal_cluster_b — a tall crystal pair on a split boulder. Replaces nat_crystal_cluster_3 (3.08 x 2.6 x 2.79) and
//   nat_crystal_cluster_4 (2.34 x 2.4 x 2.59) (flora `crys3` / `crys4`, foot centre on y = 0, INSTANCED).
// SILHOUETTE: a hunched boulder split down the middle, out of the split two tall crystals rise side by side, one
//   snapped off at two thirds; a lean third shoots out sideways low over the rock; small points line the split.
// BIG FORMS: (1) the twin towers; (2) the hunched boulder; (3) the low sideways crystal.
// THE EYE RESTS ON: the broken tower's slanted break, the tall one's tip, the line of small points along the split.
// WEAR STORY: the crystals forced the boulder apart as they grew; the sideways one grew into the light; one tower
//   broke in a frost.
// MUST NOT LOOK LIKE: a pack crystal cluster (equal spikes in a ring), a symmetric crown, a soft blob of rock.
import { crystalDef, cluster, crowd } from './shroomcrystal_lib.mjs';

export default crystalDef('crystal_cluster_b', {
  replaces: 'assets/models/nature/nature/nat_crystal_cluster_3.glb',
  notes: 'Serves crys3 and crys4 (scale 0.92).',
  build() {
    const main = [
      { base: [-0.14, 0.35, 0.0], dir: [-0.16, 1, 0.1], len: 1.65, r: 0.346, tip: 0.55, taper: 0.9, spin: 3 },
      { base: [0.32, 0.35, 0.05], dir: [0.34, 1, -0.12], len: 1.5, r: 0.320, tip: 0.5, spin: 27, broken: { at: 0.68, tilt: [10, 32] } },
      { base: [0.05, 0.5, 0.3], dir: [0.25, 0.45, 1], len: 0.95, r: 0.179, tip: 0.26, spin: 11 },
      { base: [-0.4, 0.4, -0.2], dir: [-0.8, 1, -0.4], len: 0.6, r: 0.166, tip: 0.2, spin: 40 },
    ];
    // the small points along the split (a line across the rock, x = 0.1)
    const line = [];
    for (let i = 0; i < 7; i++) { const z = -0.75 + i * 0.25; line.push({ base: [0.1 + (i % 2) * 0.12 - 0.06, 0.68 - Math.abs(z) * 0.35, z], dir: [(i % 3 - 1) * 0.5, 1, z * 0.6], len: 0.12 + ((i * 37) % 10) / 40, r: 0.045 + ((i * 13) % 5) / 200, tip: 0.08, spin: i * 23 }); }
    return cluster('cb', {
      rock: { size: [1.3, 1.0, 1.2], c: [0, 0.0, 0], count: 13, seed: 11, flatTop: 0.8, split: { n: [1, 0.05, 0.1], at: [0.1, 0, 0], gap: 0.05 } },
      crystals: [...main, ...line, ...crowd(17, { n: 6, ring: [0.75, 1.05], y: 0.25, len: [0.1, 0.25], r: [0.04, 0.07], up: [0.6, 1.3] })],
    });
  },
});
