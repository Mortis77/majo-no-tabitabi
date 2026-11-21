// 灯里 swimsuit B (暮海), one contoured layer: the straps (design + masks: akari_swim_b.mjs; cut, walls, weights: tools/costume/swim_b.mjs).
import { RIG_FILE, strapShape } from './akari_swim_b.mjs';

export default {
  name: 'akari_swim_b_straps', rig: { file: RIG_FILE },
  voxel: 0.002, lods: [8000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: [-0.11, 0.03, -0.085, 0.11, 0.135, 0.12],
  build({ S, rig }) { return strapShape(S, (n) => rig.bone(n).head); },
};
