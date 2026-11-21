// 灯里's outfit, one contoured layer (design and parameters: akari_outfit.mjs; mesh, hems, weights: tools/costume/v3-layers.mjs).
import { RIG_FILE, kosodeShape } from './akari_outfit.mjs';

export default {
  name: 'akari_outfit_kosode', rig: { file: RIG_FILE },
  voxel: 0.0024, lods: [8000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: [-0.56, 0.86, -0.17, 0.56, 1.38, 0.17],
  build({ S, rig }) { return kosodeShape(S, (n) => rig.bone(n).head); },
};
