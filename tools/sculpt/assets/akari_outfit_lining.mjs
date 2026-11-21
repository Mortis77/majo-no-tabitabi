// 灯里's outfit, one contoured layer (design and parameters: akari_outfit.mjs; mesh, hems, weights: tools/costume/v3-layers.mjs).
import { RIG_FILE, liningShape } from './akari_outfit.mjs';

export default {
  name: 'akari_outfit_lining', rig: { file: RIG_FILE },
  voxel: 0.0024, lods: [8000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: [-0.16, 0.17, -0.13, 0.16, 0.88, 0.13],
  build({ S, rig }) { return liningShape(S, (n) => rig.bone(n).head); },
};
