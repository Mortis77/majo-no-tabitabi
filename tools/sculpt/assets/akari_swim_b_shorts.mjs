// 灯里 swimsuit B (暮海), one contoured layer: the shorts (design + masks: akari_swim_b.mjs; cut, walls, weights: tools/costume/swim_b.mjs).
import { RIG_FILE, shortsShape } from './akari_swim_b.mjs';

export default {
  name: 'akari_swim_b_shorts', rig: { file: RIG_FILE },
  voxel: 0.002, lods: [8000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: [-0.19, 0.69, -0.135, 0.19, 1.05, 0.12],
  build({ S, rig }) { return shortsShape(S, (n) => rig.bone(n).head); },
};
