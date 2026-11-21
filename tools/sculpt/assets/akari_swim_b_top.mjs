// 灯里 swimsuit B (暮海), one contoured layer: the top (design + masks: akari_swim_b.mjs; cut, walls, weights: tools/costume/swim_b.mjs).
import { RIG_FILE, topShape } from './akari_swim_b.mjs';

export default {
  name: 'akari_swim_b_top', rig: { file: RIG_FILE },
  voxel: 0.002, lods: [8000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: [-0.165, 1.05, -0.125, 0.165, 1.315, 0.145],
  build({ S, rig }) { return topShape(S, (n) => rig.bone(n).head); },
};
