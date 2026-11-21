// 灯里's outfit, one contoured layer (design and parameters: akari_outfit.mjs; mesh, hems, weights: tools/costume/v3-layers.mjs).
// The red line between the two collars (material cloth_trim).
import { RIG_FILE, redShape } from './akari_outfit.mjs';

export default {
  name: 'akari_outfit_red', rig: { file: RIG_FILE },
  voxel: 0.0007, lods: [8000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: [-0.1, 1.12, -0.11, 0.1, 1.33, 0.14],
  build({ S, rig }) { return redShape(S, (n) => rig.bone(n).head); },
};
