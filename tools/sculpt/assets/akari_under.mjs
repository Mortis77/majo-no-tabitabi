// 灯里's always-worn undergarment as fields: a short white under-robe (hadajuban) to the high hip, wrapped left over
// right with a raised collar band, short fitted sleeves, held by a thin cord at the natural waist; white shorts to mid
// thigh. Grown from the body's own field (tools/sculpt/assets/akari_body.mjs), so it follows every form.
// Revision 2 (review B3 / B7 / H2):
//   - the robe is CINCHED at the cord (3 mm from the skin there, 6.2 mm on the chest) and flares a little to its hem,
//     so the waist reads through white cloth even with the arms down;
//   - robe and shorts are two solids, made LONGER than the garment: figure/under.mjs cuts hem, cuffs and legs exactly on
//     their planes (straight, even edges) and gives them a wall;
//   - the collar band is ONE path found on the cloth itself: up her right front, round the nape, down across her left to
//     the waist at her right — no joint at the nape, nothing floating when the shoulder line changes.
// The fields are solid; figure/under.mjs keeps only what lies outside the skin.
import { bodyShape, RIG_FILE } from './akari_body.mjs';

export const UNDER = {
  robe: 0.0062, shorts: 0.004, cinch: 0.003, flare: 0.0052,      // clearances over the skin (m)
  hemY: 0.93, sleeveX: 0.218, shortsTopY: 0.962, legY: 0.668,
  neckApex: [0, 1.192], neckTop: [0.036, 1.262], waistEnd: [-0.084, 1.04],     // the V of the collar; the top panel runs on to her right waist
  tieY: 1.032, tieHalf: 0.0036, tieLift: 0.0017,
  holeR: [0.0478, 0.0495],                                       // the neck opening about the neck's axis (bottom, top)
  cord: 'cloth_trim',                                            // material of the cord (null = part of the white cloth)
  ext: 0.03,                                                     // how far the solids run past hem / cuff / leg before the exact cut
};
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** the robe's clearance over the skin at height y */
export function robeClear(y) {
  const U = UNDER, g = Math.exp(-(((y - U.tieY) / 0.03) ** 2));
  return U.robe - (U.robe - U.cinch) * g + U.flare * sm(U.tieY - 0.025, U.hemY, y);
}
const AX0 = [0, 1.225, -0.024], AX1 = [0, 1.4, 0.0];
const axisZ = (y) => AX0[2] + (AX1[2] - AX0[2]) * (y - AX0[1]) / (AX1[1] - AX0[1]);

/** the pieces of the design that both the field and the mesh builder need */
export function underParts(S, J) {
  const U = UNDER, body = bodyShape(S, J), bf = body.f;
  const cloth = new S.Shape((x, y, z) => bf(x, y, z) - robeClear(y), [-0.26, 0.86, -0.15, 0.26, 1.37, 0.15], null, 1.15);
  const cf = cloth.f;
  const zOn = (x, y) => { let z = 0.15; for (let i = 0; i < 80; i++) { const d = cf(x, y, z); if (d < 1e-4) break; z -= Math.max(d * 0.6, 2e-4); } return z; };
  // the rim of the neck opening: where a cylinder about the neck's axis leaves the cloth (marched from above)
  const rim = (deg, lift = 0.0008) => {
    const a = deg * Math.PI / 180, sx = Math.sin(a), cz = Math.cos(a);
    let y = 1.37;
    for (let i = 0; i < 400; i++) { const R = U.holeR[0] + (U.holeR[1] - U.holeR[0]) * (y - AX0[1]) / (AX1[1] - AX0[1]); if (cf(R * sx, y, axisZ(y) + R * cz) <= 0) break; y -= 0.0005; }
    const R = U.holeR[0] + (U.holeR[1] - U.holeR[0]) * (y - AX0[1]) / (AX1[1] - AX0[1]);
    return [R * sx, y + lift, axisZ(y) + R * cz];
  };
  // collar path: her right front (under the top panel) -> right side -> nape -> left side -> down the V -> her right waist
  const slope = (U.neckTop[1] - U.neckApex[1]) / U.neckTop[0];
  const V = (xa) => U.neckApex[1] + slope * xa, onV = (x, lift) => [x, V(Math.abs(x)), zOn(x, V(Math.abs(x))) + lift];
  const path = [];
  for (const x of [-0.008, -0.018, -0.028, -0.036, -0.0445]) path.push(onV(x, 0.0002));          // the under panel's edge (her right)
  for (const deg of [-82, -112, -146, 180, 146, 112, 82]) path.push(rim(deg));                      // round the nape
  path.push(onV(0.0445, 0.001));
  for (let i = 0; i <= 9; i++) { const t = i / 9, x = U.neckTop[0] + (U.waistEnd[0] - U.neckTop[0]) * t, y = U.neckTop[1] + (U.waistEnd[1] - U.neckTop[1]) * t; path.push([x, y, zOn(x, y) + 0.001]); }
  const knot = [U.waistEnd[0] + 0.012, U.tieY, 0]; knot[2] = zOn(knot[0], knot[1]) + 0.0012;
  return { body, cloth, zOn, rim, path, slope, knot };
}

/** the cord: a slim raised band at the natural waist, a small flat knot at her right front and its two short ends */
export function cordShape(S, P) {
  const U = UNDER, bf = P.body.f, k = P.knot;
  const band = new S.Shape((x, y, z) => Math.max(bf(x, y, z) - (U.cinch + U.tieLift), Math.abs(y - U.tieY) - U.tieHalf), [-0.2, U.tieY - 0.01, -0.15, 0.2, U.tieY + 0.01, 0.15], null, 1.1);
  let cord = band.softAdd(S.ellipsoid([0.0085, 0.0062, 0.0042]).at(k[0], k[1], k[2] - 0.001), 0.003);
  for (const [dx, len] of [[-0.011, 0.034], [0.006, 0.028]]) {
    const x1 = k[0] + dx, y1 = k[1] - len;
    cord = cord.softAdd(S.taperedCapsule([k[0] + dx * 0.25, k[1] - 0.004, k[2]], [x1, y1, P.zOn(x1, y1) + 0.0016], 0.0026, 0.0021), 0.002);
  }
  return cord;
}

export function robeShape(S, J, P = underParts(S, J)) {
  const U = UNDER;
  let robe = P.cloth.intersect(S.plane([0, -1, 0], [0, U.hemY - U.ext, 0])).intersect(S.plane([0, 1, 0], [0, 1.36, 0]));
  robe = robe.intersect(S.plane([1, 0, 0], [U.sleeveX + U.ext, 0, 0]).intersect(S.plane([-1, 0, 0], [-U.sleeveX - U.ext, 0, 0])));
  // the neck opening: a cylinder about the neck, and in front the V between the two collar edges
  const vee = new S.Shape((x, y, z) => Math.max((U.neckApex[1] + P.slope * Math.abs(x) - y) * 0.45, -0.012 - z), [-0.2, 1.15, -0.012, 0.2, 1.5, 0.2], null, 1.2);
  const neckHole = S.taperedCapsule(AX0, AX1, U.holeR[0], U.holeR[1]);
  robe = robe.softCut(neckHole.add(vee), 0.003);
  robe = robe.softAdd(S.tube(P.path, 0.005, { aspect: 1.9, up: [0, 0.35, 1] }), 0.004);
  return robe.softAdd(cordShape(S, P), 0.0016);
}

export function shortsShape(S, J) {
  const U = UNDER, body = bodyShape(S, J);
  let shorts = body.round(U.shorts).intersect(S.plane([0, -1, 0], [0, U.legY - U.ext, 0])).intersect(S.plane([0, 1, 0], [0, U.shortsTopY + U.ext, 0]));
  // each leg on its own below the crotch
  const apart = new S.Shape((x, y) => Math.min(0.0016 - Math.abs(x), 0.806 - y), [-1e9, -1e9, -1e9, 1e9, 1e9, 1e9]);
  return shorts.intersect(apart);
}

export default {
  name: 'akari_under', rig: { file: RIG_FILE },
  voxel: 0.0022, lods: [5000], ground: null, bandSlack: 0.012, bandSafety: 1.4,
  bounds: [-0.26, 0.88, -0.14, 0.26, 1.33, 0.14],
  build({ S, rig }) { return robeShape(S, (n) => rig.bone(n).head); },
};
