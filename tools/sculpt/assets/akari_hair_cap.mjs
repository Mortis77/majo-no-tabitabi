// 灯里's hair CAP — the field the kit contours (tools/sculpt/figure/build-hair.mjs, contourPieces): the skull grown by a
// clearance of 11-17 mm (revision 2: +4.5 mm at the temples, hairline lower behind the ears and at the nape) (anime hair stands well off the skull) that dives 3 mm under the skin below the hairline, so the hairline has no wall. It is the dark
// under-layer that shows between the locks (akari_hair.mjs). Kept in its own file so editing the locks never re-contours it.
import { headShape } from './akari_head.mjs';

const C0 = [0, 1.432, -0.012];
/** the cap's clearance above the skin: 11-16 mm, diving to -3 mm below the hairline (no wall at the hairline) */
const HAIRLINE = [ // [azimuth deg (0 front, 90 her left side, 180 back), hairline y]
  [0, 1.452], [30, 1.446], [45, 1.432], [60, 1.421], [72, 1.418], [88, 1.425], [100, 1.42], [118, 1.385], [135, 1.365], [155, 1.357], [180, 1.355],
];
export function hairlineY(az) {
  az = Math.abs(az); if (az > 180) az = 360 - az;
  for (let i = 0; i < HAIRLINE.length - 1; i++) {
    const [a0, y0] = HAIRLINE[i], [a1, y1] = HAIRLINE[i + 1];
    if (az <= a1) { const t = (az - a0) / (a1 - a0), e = t * t * (3 - 2 * t); return y0 + (y1 - y0) * e; }
  }
  return HAIRLINE[HAIRLINE.length - 1][1];
}
const smf = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function capClear(x, y, z) {
  const az = Math.atan2(x, z - C0[2]) * 180 / Math.PI, hl = hairlineY(az);
  const top = 0.0128 + 0.0042 * smf(1.44, 1.5, y) + 0.0022 * smf(-0.03, -0.09, z)    // fuller over the crown and the back
    + 0.0045 * smf(0.03, 0.065, Math.abs(x)) * smf(1.39, 1.42, y) * (1 - smf(1.48, 1.52, y));   // revision 2: fuller temples
  const k = smf(hl - 0.006, hl + 0.014, y);
  return -0.003 + (top + 0.003) * k;
}
export function capShape(S) {
  const head = headShape(S), hf = head.f;
  return new S.Shape((x, y, z) => hf(x, y, z) - capClear(x, y, z), [-0.11, 1.3, -0.14, 0.11, 1.55, 0.105], null, 1.3);
}


/** the kit's view of this module */
export default {
  name: 'akari_hair_cap', voxel: 0.0018, lods: [2400], ground: null, bandSlack: 0.012, bandSafety: 1.4,
  bounds: [-0.11, 1.3, -0.14, 0.11, 1.55, 0.105],
  build({ S }) { return capShape(S); },
};
