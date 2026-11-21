// 灯里's outfit, one contoured layer (design and parameters: akari_outfit.mjs; mesh, hems, weights: tools/costume/v3-layers.mjs).
// The white collar band (eri); the red line is its own piece (akari_outfit_red.mjs) since round 'finish'.
import { RIG_FILE, bandShape } from './akari_outfit.mjs';

export default {
  name: 'akari_outfit_collar', rig: { file: RIG_FILE },
  voxel: 0.0009, lods: [8000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: [-0.14, 0.99, -0.13, 0.14, 1.34, 0.16],
  build({ S, rig }) { return bandShape(S, (n) => rig.bone(n).head); },
};
