// pumpkin_b — a broad, squat pumpkin. Replaces plant_pumpkin_2 (flora `pumpkin2`, 0.90 x 0.63 x 0.90 m, base on y = 0,
// tinted per instance; the old one had no separate stem — this one adds a 'stalk' part, plant default 'mul' rule).
// INTENT
//  silhouette: a wide cushion, sunk in the middle, twelve lobes of different widths, a short thick stalk bent over.
//  big forms: the cushion / the sunken crown / the stalk.
//  the eye rests on: the deep, uneven creases running into the crown, the snapped-and-dried stalk, the bird peck.
//  wear: too heavy to turn — a broad flat pale cheek where it pressed into the soil, now tipped up on its left side.
//  must NOT look like: pumpkin_a scaled flat, a regular gear, a smooth disc.
import { pumpkin, PUMPKIN_MATS, PUMPKIN_TINT } from './_smallprops.mjs';

export default {
  name: 'pumpkin_b', id: 'sculpt_pumpkin_b',
  voxel: 0.0042, lods: [1800, 600, 200], lodError: [0.005, 0.012, 0.025],
  ground: 0, aoRange: 0.15, cavity: [0.006, 0.03], creaseAngle: 55,
  materials: PUMPKIN_MATS, previewTint: { fruit: [0.98, 0.37, 0.045] },
  replaces: { file: 'assets/models/refined/plant_pumpkin_2.glb', scale: 1, tint: { fruit: [0.98, 0.37, 0.045] } },
  notes: 'Sculpted squat pumpkin. Vertex colours on every LOD. fruit = grey ramp (flora tint), stalk / scar = real colour (mul rule).',
  build() {
    return pumpkin({
      R: 0.445, Hb: 0.47, n: 12, seed: 17, crease: 0.024, lobeW: 0.95,
      ground: { at: [-0.29, 0.085, 0.02], n: [-0.62, -0.78, 0.05], depth: 0.012 },
      peck: [0.08, 0.43, 0.3], pecks: 3,
      stalk: [[0, 0.4, 0], [0.004, 0.47, 0.004], [0.02, 0.53, 0.01], [0.055, 0.565, 0.02], [0.09, 0.57, 0.03], [0.115, 0.55, 0.035]],
      stalkR: [0.045, 0.026],
      tilt: [2, -9],
    });
  },
};
