// pumpkin_a — a tall field pumpkin. Replaces plant_pumpkin_1 (flora `pumpkin1`, 0.80 x 0.76 x 0.79 m, base on y = 0,
// tinted per instance: 'fruit' keeps a grey ramp).
// INTENT
//  silhouette: a round-shouldered stack of lobes, a little lopsided, with a dry stalk curling up and over like a question.
//  big forms: the lobed body / the stalk / the dimple the stalk grows from.
//  the eye rests on: the deep uneven creases, the curl of the stalk, the bird peck on the upper front lobe.
//  wear: it sat in one spot all summer (a flattened pale cheek, now turned a little to the front), the stalk dried brown,
//  a crow had a go at it.
//  must NOT look like: a striped ball, ten identical segments, a shiny plastic toy.
import { pumpkin, PUMPKIN_MATS, PUMPKIN_TINT } from './_smallprops.mjs';

export default {
  name: 'pumpkin_a', id: 'sculpt_pumpkin_a',
  voxel: 0.004, lods: [1800, 600, 200], lodError: [0.005, 0.012, 0.025],
  ground: 0, aoRange: 0.15, cavity: [0.006, 0.03], creaseAngle: 55,
  materials: PUMPKIN_MATS, previewTint: PUMPKIN_TINT,
  replaces: { file: 'assets/models/refined/plant_pumpkin_1.glb', scale: 1, tint: { fruit: PUMPKIN_TINT.fruit, stem: [0.11, 0.32, 0.04] } },
  notes: 'Sculpted pumpkin. Vertex colours on every LOD. fruit = grey ramp (flora tint), stalk / scar = real colour (mul rule).',
  build() {
    return pumpkin({
      R: 0.39, Hb: 0.49, n: 10, seed: 5, crease: 0.022, lobeW: 0.95,
      ground: { at: [0, 0.05, 0.285], n: [0, -0.7, 0.71], depth: 0.01 },
      peck: [0.2, 0.37, 0.28], pecks: 4,
      stalk: [[0, 0.43, 0], [0.004, 0.53, 0.008], [0.02, 0.62, 0.02], [0.06, 0.675, 0.03], [0.11, 0.705, 0.025], [0.15, 0.695, 0.005], [0.162, 0.66, -0.015], [0.148, 0.635, -0.02]],
      stalkR: [0.038, 0.018],
      tilt: [-7, 3],
    });
  },
};
