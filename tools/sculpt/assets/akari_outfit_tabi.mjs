// 灯里's outfit, one contoured layer (design and parameters: akari_outfit.mjs; mesh, hems, weights: tools/costume/v3-layers.mjs).
import { RIG_FILE, tabiShape } from './akari_outfit.mjs';

export default {
  name: 'akari_outfit_tabi', rig: { file: RIG_FILE },
  voxel: 0.0024, lods: [8000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: [-0.1, 0.0, -0.11, 0.1, 0.24, 0.16],
  build({ S, rig }) { return tabiShape(S, (n) => rig.bone(n).head); },
};
