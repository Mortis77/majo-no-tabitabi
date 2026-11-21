// Neighbouring trees share exposure, drainage and seed sources. The last few
// trees at a stand's edge mix back into the surrounding woodland.
import { noise2 } from '../../core/util.js';
import { insideTrialSurvey, trialShoreDistance } from '../trial-lake.js';

const groves = [
  // East-west belt of sunlit ginkgo stands along sheltered meadow margins.
  ['gold', 1930, 91, 140, 64],
  ['gold', 1375, -112, 212, 72],
  ['gold', 1070, 82, 212, 135],
  ['gold', 640, -176, 260, 78],
  ['gold', 260, -255, 191, 65],
  ['gold', -404, -249, 214, 101],
  ['gold', -985, -161, 230, 93],
  ['gold', -1920, -410, 142, 81],
  // Red maple occupies the intermediate slopes beneath the dark conifer line.
  ['wine', -2260, -816, 195, 95],
  ['wine', -1843, -620, 223, 144],
  ['wine', -1145, -415, 216, 113],
  ['wine', -649, -415, 180, 102],
  ['wine', 190, -20, 139, 72],
  ['wine', 822, -362, 167, 109],
  ['wine', 1489, -309, 171, 81],
  ['wine', 1901, -314, 137, 107]
];
const keys = {
  gold: ['ginkgo1', 'ginkgo2', 'maple3'],
  wine: ['maple1', 'maple2', 'maple3'],
  copper: ['maple3', 'ginkgo1', 'broad3'],
  silver: ['birch', 'willow1', 'willow2'],
  pine: ['pine1', 'pine2', 'pine3'],
  green: ['broad1', 'broad2', 'broad3', 'broad4', 'broad5', 'birch']
};
export const crownColors = {
  gold: [0xd4aa55, 0xc69c4b, 0xc5a45a, 0xd3b568],
  wine: [0x985d66, 0x8d6373, 0x946979, 0xa06763],
  copper: [0xb7995b, 0xb28b5d, 0xaf8b64, 0xbaa363],
  silver: [0x95a787, 0xa6b69a, 0xa7b184, 0x90aa80],
  pine: [0x385c52, 0x4a6856, 0x4c7262, 0x4e6861],
  green: [0x72925a, 0x91a669, 0x7a975c, 0x66885b, 0x86a063]
};
function localStand(x, z) {
  let density = 0,
    kind = null;
  for (const [type, cx, cz, rx, rz] of groves) {
    if (Math.abs(x - cx) > rx * 1.16 || Math.abs(z - cz) > rz * 1.16) continue;
    const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
    if (1 - d > density) {
      density = 1 - d;
      kind = type;
    }
  }
  return { kind, density };
}
export function treeCommunity(x, z, h, river, wooded, forest, random) {
  const patch = noise2(x / 151 + 17, z / 128 - 24),
    soil = noise2(x / 68 - 21, z / 78 + 8);
  let type = 'green';
  const shore = insideTrialSurvey(x, z) ? trialShoreDistance(x, z) : 9;
  if (river < 26 || (shore > 0.87 && shore < 1.2 && soil > 0.02)) {
    type = 'silver';
  } else if (h > 94 || (h > 61 && soil < 0.26) || (forest && patch < -0.08 && soil < 0.12)) {
    type = 'pine';
  } else if (!forest) {
    const { kind, density } = localStand(x, z);
    const core = density + 0.2 * soil;
    if (kind && core > 0.13 && random() < 0.34 + Math.min(0.6, core * 0.9)) {
      type = core > 0.3 ? kind : 'copper';
    } else if (h > 40 && h < 102 && patch > 0.22 && soil > -0.08) {
      type = soil > 0.1 ? 'wine' : 'copper';
    } else if (h < 73 && h > 5 && patch > (wooded ? 0.24 : 0.13) && soil > -0.24) {
      type = soil > 0.06 ? 'gold' : 'copper';
    } else if (wooded && patch < -0.29 && h > 28) {
      type = 'pine';
    }
  }
  return { key: keys[type][Math.floor(random() * keys[type].length)], type };
}
