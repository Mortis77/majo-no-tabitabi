// 灯里's undergarment, second solid: the white shorts to mid thigh (see akari_under.mjs for the design; the two are
// contoured apart so the robe's hem lies over the shorts as its own edge and each can be cut exactly on its planes).
import { RIG_FILE } from './akari_body.mjs';
import { shortsShape } from './akari_under.mjs';

export default {
  name: 'akari_under_shorts', rig: { file: RIG_FILE },
  voxel: 0.0022, lods: [3000], ground: null, bandSlack: 0.012, bandSafety: 1.4,
  bounds: [-0.2, 0.63, -0.14, 0.2, 1.0, 0.14],
  build({ S, rig }) { return shortsShape(S, (n) => rig.bone(n).head); },
};
