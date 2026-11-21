// 灯里's shrine-maiden outfit: the layers that LIE ON the base figure, grown as fields from her body
// (tools/sculpt/assets/akari_body.mjs) over her always-worn undergarment (akari_under.mjs). The hanging layers (hakama,
// wide sleeves, sash, bow, tails, boards, charm, zori) are lofted by the garment generator (tools/costume/v3.mjs) on top of
// these. Nothing here cuts the body: every layer is a solid outside the one beneath it.
//
//   kosode   white hakui: body + under-sleeves to the wrist, skin + robe clearance + 4.5 mm (7.5 mm over the bare forearm),
//            the front falling straight from the bust to the sash (hosei: a kimono front has no under-bust tuck), a V
//            neckline OUTSIDE the robe's so the robe's white band shows inside it, a raised white collar band (eri)
//            crossed left over right (her left panel on top), and a red line between the two collars (split off as its
//            own primitive: material cloth_trim).
//   tabi     white split-toe socks: the foot rounded 3.5 mm, the four small toes in ONE toe box, the big toe on its own,
//            the split at x = +-0.0347 open for the zori thong; cuff at y 0.2.
//   lining   the hakama's red divided legs (umanori), seen when the hakama swings: legs + 11 mm over the shorts, 8 mm below,
//            each leg on its own, open at the top (inside the hakama), hemmed above the tabi.
import { bodyShape, RIG_FILE, TOES, SOLE_Y } from './akari_body.mjs';
import { UNDER, robeClear, underParts, robeShape } from './akari_under.mjs';

export { RIG_FILE };
export const OUTFIT = {
  over: 0.0045, forearm: 0.0075,                 // kosode clearance over the robe (trunk, upper arm) / over bare skin
  hemY: 0.955, cuffX: 0.345, topY: 1.36,         // kosode hem (inside the hakama, 7 cm under the sash), cuffs (just past the
                                                 // elbow, over the inner sleeve: round 'finish'; was 0.495), neck bound
  cutD: 0.016, cutBack: 0.008, bandD: 0.025, redD: 0.0068,       // horizontal shift outward from the robe's V line: cut / white band / red line
  band: { halfW: 0.0135, bottom: -0.0036, bottomOpen: 0.0025, top: 0.0072 },  // white collar band (eri): 27 mm wide; sunk 3.6 mm into
                                                 // the cloth where there is cloth (a steep wall: a clean edge on the shoulders; the
                                                 // part inside the kosode is clipped off in v3-layers), 2.5 mm above the robe's band
                                                 // over the opening
  red: { halfW: 0.0052, bottom: 0.0022, top: 0.0058 },  // red line: 10.4 mm wide (about 9.5 mm shows beside the band), 3.6 mm
                                                 // thick, lying on the ENVELOPE of kosode and robe (so the robe's raised band
                                                 // beside her right neck and round the nape never covers it)
  insleeve: { x0: 0.3, cuffX: 0.497, under: 0.0045, loose: 0.011, cuff: 0.0062 },   // white inner sleeve (juban sleeve):
                                                 // from under the kosode's cuff to the wrist, loose over the forearm, gathered at the cuff
  waistEnd: [-0.104, 1.04],                      // the top panel's edge runs under the sash at her right
  hosei: { y0: 1.0, y1: 1.168 },                 // front padding band (bust apex -> sash)
  back: { y0: 1.0, y1: 1.215 },                  // back padding band (shoulder blades -> sash): the back falls flat over the spine's furrow
  tabi: { clear: 0.0035, topY: 0.2, split: 0.0347, splitW: 0.0013, web: 0.097 },
  lining: { top: 0.84, hemY: 0.205, over: 0.011, below: 0.008, shortsY: UNDER.legY },
  ext: 0.03,
};
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const SLOPE = (UNDER.neckTop[1] - UNDER.neckApex[1]) / UNDER.neckTop[0];   // the robe's V: y = apex + SLOPE |x|
const AX0 = [0, 1.225, -0.024], AX1 = [0, 1.4, 0.0];                         // the neck's axis (the robe's neck hole)
const axisZ = (y) => AX0[2] + (AX1[2] - AX0[2]) * (y - AX0[1]) / (AX1[1] - AX0[1]);
const holeR = (y) => UNDER.holeR[0] + (UNDER.holeR[1] - UNDER.holeR[0]) * (y - AX0[1]) / (AX1[1] - AX0[1]);

/** kosode clearance over the skin at (x, y): robe + over on the trunk / upper arm, a little over the bare forearm */
export function kosodeClear(x, y) {
  const trunk = robeClear(y) + OUTFIT.over;
  return lerp(trunk, OUTFIT.forearm, sm(UNDER.sleeveX - 0.01, UNDER.sleeveX + 0.035, Math.abs(x)));
}
/** what lies under the kosode at (x, y) (m above the skin): the robe, the shorts or nothing */
export function underClear(x, y) {
  if (y > UNDER.hemY && Math.abs(x) < UNDER.sleeveX) return robeClear(y);
  if (y < UNDER.shortsTopY && y > UNDER.legY) return UNDER.shorts;
  return 0;
}

export function kosodeParts(S, J) {
  const O = OUTFIT, body = bodyShape(S, J), bf = body.f;
  const base = new S.Shape((x, y, z) => bf(x, y, z) - kosodeClear(x, y), [-0.56, 0.84, -0.17, 0.56, 1.38, 0.17], null, 1.15);
  const b0 = base.f;
  const zOn = (f, x, y) => { let z = 0.17; for (let i = 0; i < 120; i++) { const d = f(x, y, z); if (d < 1e-4) break; z -= Math.max(d * 0.6, 2e-4); } return z; };
  const xOn = (f, y, z, x0 = 0.3) => { let x = x0; for (let i = 0; i < 160; i++) { const d = f(x, y, z); if (d < 1e-4) break; x -= Math.max(d * 0.6, 2e-4); } return x; };
  // hosei: an elliptic front from the bust apex straight down to the sash, measured on the cloth itself; the back the same
  // from the shoulder blades (a kimono lies over the hollows, it does not follow them)
  const zOnB = (f, x, y) => { let z = -0.17; for (let i = 0; i < 120; i++) { const d = f(x, y, z); if (d < 1e-4) break; z += Math.max(d * 0.6, 2e-4); } return z; };
  const yB = 1.156, yW = 1.035, zB = zOn(b0, 0.054, yB), zW = zOn(b0, 0, yW) + 0.002, wB = xOn(b0, yB, 0.0) * 0.985, wW = xOn(b0, yW, 0.0) * 0.99;
  const yK = 1.185, zK = -zOnB(b0, 0.064, yK) + 0.004, zKW = -zOnB(b0, 0, yW) + 0.006, wK = xOn(b0, 1.15, -0.03, 0.17) * 0.97;   // width taken under the arms
  const pad = new S.Shape((x, y, z) => {
    const t = Math.max(0, Math.min(1, (y - yW) / (yB - yW))), W = lerp(wW, wB, t), D = lerp(zW, zB, t);
    const e = (Math.hypot(x / W, (z - 0.004) / D) - 1) * Math.min(W, D);
    return Math.max(e, O.hosei.y0 - y, y - O.hosei.y1, 0.004 - z);
  }, [-0.14, O.hosei.y0 - 0.01, -0.01, 0.14, O.hosei.y1 + 0.01, 0.14], null, 1.2);
  const backPad = new S.Shape((x, y, z) => {
    const t = Math.max(0, Math.min(1, (y - yW) / (yK - yW))), W = lerp(wW, wK, t), D = lerp(zKW, zK, t);
    const e = (Math.hypot(x / W, (z - 0.004) / D) - 1) * Math.min(W, D);
    return Math.max(e, O.back.y0 - y, y - O.back.y1, z - 0.004);
  }, [-0.15, O.back.y0 - 0.01, -0.14, 0.15, O.back.y1 + 0.01, 0.01], null, 1.2);
  const cloth = base.softAdd(pad, 0.018).softAdd(backPad, 0.022);
  const cf = cloth.f;
  // a point of the neck rim at angle deg (0 = front, +90 = her left) and radius r about the neck axis, on the cloth
  const rim = (deg, r, f = cf) => {
    const a = deg * Math.PI / 180, sx = Math.sin(a), cz = Math.cos(a);
    let y = 1.38; for (let i = 0; i < 600; i++) { if (f(r * sx, y, axisZ(y) + r * cz) <= 0) break; y -= 0.0004; }
    return [r * sx, y, axisZ(y) + r * cz];
  };
  const onV = (x, y, f = cf) => [x, y, zOn(f, x, y)];
  const vX = (y, d) => (y - UNDER.neckApex[1]) / SLOPE + d;        // |x| of a V line shifted outward by d at height y
  // one collar path at outward shift d: her right V edge (under panel) up -> round the nape -> her left, then the top
  // panel's edge straight down across the chest to her right waist (stopAtApex: end where it crosses the under panel's edge)
  const napeFit = {};
  const path = (d, stopAtApex, f = cf) => {   // f: the surface the path lies on (the red line: the kosode + robe envelope)
    const pts = [], yApex = UNDER.neckApex[1] - SLOPE * d, yTop = 1.262;
    for (let i = 0; i <= 5; i++) { const y = lerp(yApex - 0.012, yTop, i / 5); pts.push(onV(-vX(y, d), y, f)); }
    // round the nape in 10-degree steps (few samples made a pointed V at the back where the cloth falls away)
    const nape = [], degs = []; for (let a = -80; a >= -180; a -= 10) degs.push(a); for (let a = 170; a >= 80; a -= 10) degs.push(a);
    for (const a of degs) nape.push(rim(a, holeR(1.27) + d, f));
    // round 'finish': the rim's heights follow the trapezius and the spine's furrow, so the collar dipped to a point at the
    // centre back and lumped beside it. Fit ONE smooth curve y = c0 + c1 cos(a) + c2 cos(2a) to them (symmetric), and put
    // each point on the cloth at that height by marching in along its ray from the neck's axis
    { const rows = degs.map((a, i) => { const r = a * Math.PI / 180; return [1, Math.cos(r), Math.cos(2 * r), nape[i][1]]; });
      const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bb = [0, 0, 0];
      for (const q of rows) for (let i = 0; i < 3; i++) { bb[i] += q[i] * q[3]; for (let j = 0; j < 3; j++) A[i][j] += q[i] * q[j]; }
      const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det3(A), c = [0, 1, 2].map((k) => det3(A.map((row, i) => row.map((v, j) => (j === k ? bb[i] : v)))) / D);
      degs.forEach((a, i) => {
        const r = a * Math.PI / 180, y = c[0] + c[1] * Math.cos(r) + c[2] * Math.cos(2 * r), sx = Math.sin(r), cz = Math.cos(r);
        let R = 0.13; for (let k = 0; k < 400; k++) { if (f(R * sx, y, axisZ(y) + R * cz) <= 0) break; R -= 0.00025; }
        nape[i] = [R * sx, y, axisZ(y) + R * cz];
      });
      napeFit[d] = c; }
    pts.push(...nape);
    const x0 = vX(yTop, d), [xe, ye] = O.waistEnd, n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = lerp(x0, xe + d, t), y = lerp(yTop, ye, t);
      if (stopAtApex && x <= -vX(y, d)) { pts.push(onV(x, y, f)); break; }
      pts.push(onV(x, y, f));
    }
    return pts;
  };
  const robeF = robeShape(S, J, underParts(S, J)).f, envF = (x, y, z) => Math.min(cf(x, y, z), robeF(x, y, z));
  const bandPath = path(O.bandD, false), redPath = path(O.redD, true, envF);
  // the neck opening (negative inside): a cylinder about the neck + the V, both shifted outward of the robe's by cutD
  const cutD = O.cutD;
  const vee = new S.Shape((x, y, z) => Math.max((UNDER.neckApex[1] + SLOPE * (Math.abs(x) - cutD) - y) * 0.45, -0.014 - z), [-0.25, 1.1, -0.014, 0.25, 1.5, 0.2], null, 1.2);
  // round 'finish': behind the neck the opening hugs the robe's band (8 mm instead of 16): the white band lies further out
  // there (its height is one smooth curve) and the cut edge showed between it and the red line as a ragged strip
  const ring = new S.Shape((x, y, z) => {
    const dz = z - axisZ(y), r = Math.hypot(x, dz), back = sm(0.35, 0.85, -dz / (r || 1));
    return Math.max(r - (holeR(y) + lerp(cutD, O.cutBack, back)), AX0[1] - y, y - AX1[1]);
  }, [-0.13, AX0[1] - 0.01, -0.16, 0.13, AX1[1] + 0.01, 0.12], null, 1.2);
  const cut = ring.add(vee), cutF = cut.f;
  // a band that LIES on the cloth: within halfW of its path (which runs on the surface) and between bottom and top above
  // the cloth — uniform width and thickness however the path turns (a flattened tube twists where the collar goes round).
  // Contoured as its own thin solid (finer voxel than the cloth): sunk into the cloth where cloth is, lifted over the opening.
  const shellBand = (pts, { halfW, bottom, bottomOpen = bottom, top }, onF = cf) => {
    const c = S.tube(pts, 0.0005), cd = c.f, b = c.b, g = halfW + 0.012;
    return new S.Shape((x, y, z) => {
      const s = sm(0.003, -0.003, cutF(x, y, z)), lo = lerp(bottom, bottomOpen, s), mid = (lo + top) / 2, ht = (top - lo) / 2;
      const h = onF(x, y, z), c = cd(x, y, z), lat = Math.sqrt(Math.max(0, c * c - h * h));   // across the surface, not through it
      return Math.max(lat - halfW, Math.abs(h - mid) - ht);
    }, [b[0] - g, b[1] - g, b[2] - g, b[3] + g, b[4] + g, b[5] + g], null, 1.25);
  };
  // the red line lies on the envelope of the kosode's cloth and the robe (with its raised collar band): beside her right
  // neck and round the nape the robe's band stands above the kosode's cloth and used to swallow the line
  const band = shellBand(bandPath, O.band), red = shellBand(redPath, O.red, envF);
  return { body, base, cloth, pad, band, red, cut, robeF, envF, napeFit, bandPath, redPath, zOn, rim, axisZ, holeR, measured: { zB, zW, wB, wW, zK, zKW, wK } };
}

export function kosodeShape(S, J, P = kosodeParts(S, J)) {
  const O = OUTFIT;
  let k = P.cloth.intersect(S.plane([0, -1, 0], [0, O.hemY - O.ext, 0])).intersect(S.plane([0, 1, 0], [0, O.topY, 0]));
  k = k.intersect(S.plane([1, 0, 0], [O.cuffX + O.ext, 0, 0])).intersect(S.plane([-1, 0, 0], [-O.cuffX - O.ext, 0, 0]));
  return k.softCut(P.cut, 0.003);
}
/** the collar: white band (eri) + red line, one thin solid of its own lying on the kosode */
export function collarShape(S, J, P = kosodeParts(S, J)) { return P.band.add(P.red); }
/** round 'finish': band and red line contoured as two pieces (the red's outline was the split line of one decimated mesh
 *  and read jagged up close) */
export function bandShape(S, J, P = kosodeParts(S, J)) { return P.band; }
export function redShape(S, J, P = kosodeParts(S, J)) { return P.red; }

export function tabiShape(S, J) {
  const T = OUTFIT.tabi, body = bodyShape(S, J);
  // the four small toes as one box (soft hull of the toe capsules, a little fuller), the big toe on its own
  let box = null;
  for (const [x0, z0, x1, z1, r0, r1] of TOES) {
    const c = S.taperedCapsule([x0, SOLE_Y + r0 + 0.002, z0 - 0.006], [x1, SOLE_Y + r1 + 0.0012, z1], r0 + 0.0015, r1 + 0.0012);
    box = box ? box.softAdd(c, 0.012) : c;
  }
  let foot = body.intersect(S.plane([0, 1, 0], [0, T.topY + OUTFIT.ext, 0])).softAdd(box.mirror('x'), 0.006).round(T.clear);
  // the split between the big toe and the rest: a thin slot from the web forward, down to the sole
  const slot = new S.Shape((x, y, z) => Math.max(Math.abs(Math.abs(x) - T.split) - T.splitW, T.web - z), [-0.06, 0, T.web - 0.01, 0.06, 0.12, 0.2], null, 1);
  foot = foot.softCut(slot, 0.0018);
  return foot.intersect(S.plane([0, 1, 0], [0, T.topY + OUTFIT.ext, 0]));
}

export function liningShape(S, J) {
  const L = OUTFIT.lining, body = bodyShape(S, J), bf = body.f;
  const clr = (y) => lerp(L.below, L.over, sm(L.shortsY - 0.03, L.shortsY + 0.01, y));
  const legs = new S.Shape((x, y, z) => Math.max(bf(x, y, z) - clr(y), 0.0025 - Math.abs(x)), [-0.2, L.hemY - 0.05, -0.15, 0.2, L.top + 0.05, 0.15], null, 1.15);
  return legs.intersect(S.plane([0, 1, 0], [0, L.top + OUTFIT.ext, 0])).intersect(S.plane([0, -1, 0], [0, L.hemY - OUTFIT.ext, 0]));
}

/** white inner sleeve (juban sleeve) on each forearm: from under the kosode's cuff (x0) to the wrist (cuffX), 4.5 mm over the
 *  skin under the kosode, loose (11 mm) over the forearm, gathered to 6.2 mm at the cuff. Both arms are in the field;
 *  v3-layers contours her left one and mirrors it (a contoured piece keeps one connected part). */
export function insleeveClear(ax) {
  const I = OUTFIT.insleeve, c0 = OUTFIT.cuffX;
  const up = lerp(I.under, I.loose, sm(c0 - 0.004, c0 + 0.05, ax));
  return lerp(up, I.cuff, sm(I.cuffX - 0.06, I.cuffX - 0.004, ax));
}
export function insleeveShape(S, J) {
  const I = OUTFIT.insleeve, body = bodyShape(S, J), bf = body.f;
  const arm = new S.Shape((x, y, z) => { const ax = Math.abs(x); return Math.max(bf(x, y, z) - insleeveClear(ax), I.x0 - ax); }, [-0.56, 1.1, -0.1, 0.56, 1.32, 0.1], null, 1.15);
  return arm.intersect(S.plane([1, 0, 0], [I.cuffX + OUTFIT.ext, 0, 0])).intersect(S.plane([-1, 0, 0], [-I.cuffX - OUTFIT.ext, 0, 0]));
}
