// crystal_cluster_a — a fan of crystals from a low rock. Replaces nat_crystal_cluster_1 (2.44 x 1.8 x 2.2) and
//   nat_crystal_cluster_2 (2.47 x 2.2 x 2.26) (flora `crys1` / `crys2`, foot centre on y = 0, INSTANCED).
// SILHOUETTE: five crystals of very unequal length fanning out of one low, flat rock like a hand opening — the longest
//   nearly upright, the others lean out to three sides, two with their tips snapped; small ones crowd the rock's edges.
// BIG FORMS: (1) the leader; (2) the fan of four; (3) the flat rock matrix.
// THE EYE RESTS ON: the leader's bright tip, the two pale breaks, the crowd of small points round the base.
// WEAR STORY: grown from one pocket in the rock; an old rockfall broke two tips; the rock's top is weathered pale.
// MUST NOT LOOK LIKE: five copies of one pack crystal stuck in the ground, a symmetric crown, soft edges.
import { crystalDef, cluster, crowd } from './shroomcrystal_lib.mjs';

export default crystalDef('crystal_cluster_a', {
  replaces: 'assets/models/nature/nature/nat_crystal_cluster_2.glb',
  notes: 'Serves crys1 (scale y 0.82) and crys2.',
  build() {
    const main = [
      { base: [0.08, 0.0, 0.02], dir: [0.1, 1, -0.07], len: 1.62, r: 0.320, tip: 0.5, taper: 0.88, spin: 8 },
      { base: [-0.32, 0.02, 0.18], dir: [-0.62, 1, 0.38], len: 1.05, r: 0.256, tip: 0.3, spin: 31, broken: { at: 0.8, tilt: [14, -24] } },
      { base: [0.4, 0.02, 0.26], dir: [0.72, 1, 0.45], len: 0.88, r: 0.218, tip: 0.28, spin: 52 },
      { base: [0.18, 0.03, -0.38], dir: [0.3, 1, -0.85], len: 0.78, r: 0.205, tip: 0.25, spin: 17, broken: { at: 0.74, tilt: [-30, 10] } },
      { base: [-0.3, 0.0, -0.28], dir: [-0.55, 1, -0.6], len: 0.56, r: 0.166, tip: 0.2, spin: 44 },
    ];
    return cluster('ca', {
      rock: { size: [0.98, 0.5, 0.9], c: [0, 0.0, 0], count: 11, seed: 5, flatTop: 0.72 },
      crystals: [...main, ...crowd(7, { n: 9, ring: [0.48, 0.8], y: 0.2, len: [0.1, 0.3], r: [0.04, 0.075], up: [0.7, 1.5] })],
    });
  },
});
