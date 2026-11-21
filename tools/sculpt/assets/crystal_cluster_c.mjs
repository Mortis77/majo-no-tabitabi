// crystal_cluster_c — the great chunky group (solid: the player collides with it). Replaces nat_crystal_cluster_6
//   (flora `crys6`: 2.85 x 3.2 x 2.87 m, foot centre on y = 0, scaled 1.1-2.4x, INSTANCED).
// SILHOUETTE: three thick, blunt crystals like stacked columns, the tallest leaning back, one fallen and lying across
//   the rock with its broken end towards you, a heavy rock seat under all of it.
// BIG FORMS: (1) the leaning king column; (2) the fallen column lying on the rock; (3) the heavy matrix.
// THE EYE RESTS ON: the fallen one's big pale break, the king's stepped tip, the inner fractures (value steps) inside
//   the thick columns.
// WEAR STORY: very old; one column fell under its own weight and broke where it hit; the standing ones carry old
//   fracture planes; the rock is worn round on top.
// MUST NOT LOOK LIKE: a pack crystal group, thin needles, a symmetric fan, soft edges.
import { crystalDef, cluster, crowd } from './shroomcrystal_lib.mjs';

export default crystalDef('crystal_cluster_c', {
  replaces: 'assets/models/nature/nature/nat_crystal_cluster_6.glb', voxel: 0.009,
  build() {
    const main = [
      { base: [0.05, 0.05, -0.1], dir: [-0.12, 1, -0.2], len: 2.4, r: 0.52, tip: 0.62, taper: 0.92, spin: 6, fr: [[[0.3, 1, 0.5], 1.0, 0.14], [[-0.6, 1, 0.1], 1.75, -0.12]] },
      { base: [0.55, 0.05, 0.3], dir: [0.42, 1, 0.3], len: 1.7, r: 0.44, tip: 0.5, spin: 33 },
      { base: [0.45, 0.05, -0.55], dir: [0.35, 1, -0.45], len: 1.95, r: 0.4, tip: 0.5, spin: 14, broken: { at: 0.8, tilt: [25, 20] } },
      { base: [-0.35, 0.05, -0.6], dir: [-0.3, 1, -0.5], len: 1.35, r: 0.36, tip: 0.42, spin: 40 },
      { base: [-0.6, 0.05, 0.2], dir: [-0.55, 1, 0.3], len: 1.25, r: 0.36, tip: 0.36, spin: 51, broken: { at: 0.85, tilt: [-22, -15] } },
      // the fallen one, lying across the rock, broken end toward +z
      { base: [-0.15, 0.55, 0.05], dir: [0.12, 0.12, 1], len: 1.25, r: 0.3, tip: 0.3, spin: 18, broken: { at: 0.75, tilt: [70, 8] } },
    ];
    return cluster('cc', {
      rock: { size: [1.25, 0.62, 1.2], c: [0, 0.0, 0], count: 12, seed: 23, flatTop: 0.8 },
      crystals: [...main, ...crowd(29, { n: 8, ring: [0.85, 1.15], y: 0.1, len: [0.14, 0.34], r: [0.05, 0.09], up: [0.6, 1.4] })],
    });
  },
});
