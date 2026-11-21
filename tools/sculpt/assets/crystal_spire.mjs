// crystal_spire — a single leaning spire of the crystal fields. Replaces nat_crystal_3 (flora `crysSpike`: 0.84 x 2.0 x
//   0.74 m, foot centre on y = 0, sunk 0.2 x scale into the ground, INSTANCED; crystal = tint + glow, rock = mul).
// SILHOUETTE: one tall six-sided spire leaning a little east, its point slightly off-centre; a short broken sister
//   leaning the other way from the same root, two splinters at the foot, a fist of dark rock it broke out of.
// BIG FORMS: (1) the spire with its long faces; (2) the broken sister; (3) the rock fist.
// THE EYE RESTS ON: the bright tip facets, the fresh pale break on the sister, the value step of an inner fracture
//   halfway up the spire.
// WEAR STORY: it grew slowly for a long time; something struck the sister and snapped her top off; the faces are clean,
//   the foot is dull where it meets the rock.
// MUST NOT LOOK LIKE: a pack crystal (a lone stretched octahedron), a symmetric obelisk, soft or rounded.
import { crystalDef, cluster, pl } from './shroomcrystal_lib.mjs';

export default crystalDef('crystal_spire', {
  replaces: 'assets/models/nature/nature/nat_crystal_3.glb', voxel: 0.0055,
  build() {
    return cluster('sp', {
      rock: { size: [0.3, 0.17, 0.26], c: [0.0, 0.0, 0.0], count: 9, seed: 3, flatTop: 0.85 },
      crystals: [
        { base: [-0.02, -0.25, 0.0], dir: [0.16, 1, 0.04], len: 1.72, r: 0.19, tip: 0.5, taper: 0.86, spin: 12,
          fr: [[[0.35, 1, 0.15], 0.75, 0.16], [[-0.4, 1, -0.3], 1.35, -0.12]] },
        { base: [-0.08, -0.15, 0.06], dir: [-0.42, 1, 0.22], len: 0.72, r: 0.11, tip: 0.2, spin: 40, broken: { at: 0.82, tilt: [18, -28] } },
        { base: [0.13, -0.05, -0.1], dir: [0.55, 1, -0.45], len: 0.24, r: 0.055, tip: 0.09, spin: 5 },
        { base: [-0.06, -0.05, -0.14], dir: [-0.25, 1, -0.7], len: 0.17, r: 0.045, tip: 0.07, spin: 22 },
      ],
    });
  },
});
