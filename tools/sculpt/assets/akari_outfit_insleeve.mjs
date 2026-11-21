// 灯里's outfit, one contoured layer (design and parameters: akari_outfit.mjs; mesh, hems, weights: tools/costume/v3-layers.mjs).
import { RIG_FILE, insleeveShape } from './akari_outfit.mjs';

export default {
  name: 'akari_outfit_insleeve', rig: { file: RIG_FILE },
  voxel: 0.0016, lods: [8000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: [0.27, 1.1, -0.1, 0.56, 1.32, 0.1],
  build({ S, rig }) { return insleeveShape(S, (n) => rig.bone(n).head); },
};
