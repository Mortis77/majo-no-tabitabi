// 灯里 — swimsuit A "潮祭" (tide festival): the shrine maiden at the shore. The ONE-PIECE that lies on the base figure,
// grown as a field from her body (tools/sculpt/assets/akari_body.mjs) and cut on designed outlines. The hanging parts
// (wrap skirt, waist cord, bell charm, back bow + tails, zori, wrist cord) are made by tools/costume/swim_a.mjs.
//
//   cloth     skin + 3.6 mm everywhere, bridged across the gluteal cleft, the spine's furrow and the crotch (a stretched
//             fabric spans hollows, it does not follow them).
//   neckline  a crossed wrap, left over right like her kosode: a V with its apex where the under-robe's is (0, 1.192); the
//             top (her left) panel's edge runs on from the apex across the chest to her right waist under the cord. Wide
//             straps (|x| 0.052 .. ~0.097 on the shoulder), a modest scoop back (bottom y 1.135).
//   bands     along the whole neckline and the top panel's edge: a raised white band (eri, 13 mm) with the thin red line
//             at the opening (4.5 mm); the top panel stands 1 mm proud of the under panel (a real overlap edge).
//   piping    the armholes and leg openings: 5 mm of vermilion, a little rolled (+0.8 mm).
//   legs      a moderate athletic cut: up to y 0.85 on the hip bone, full seat at the back (y 0.772); the inner line runs
//             on the inner thigh (y 0.772) just under the crotch, where a flat gusset (bridge.crotch) spans between the thigh roots, and the seat spans
//             the cleft down to its lower edge (bridge.back from y 0.768): the cloth never follows a body groove.
// The cut functions are exported: the build cuts the contoured mesh exactly on them, walls every edge down to the skin
// and splits the red zone off as its own primitive.
import { bodyShape, RIG_FILE } from './akari_body.mjs';

export { RIG_FILE };
export const SWIM = {
  clear: 0.0036,                                            // cloth over the skin (m)
  ease: { pelvis: 0.0012, side: 0.0016, seat: 0.0016, crease: 0.0026, crotch: 0.0062, mons: 0.003, bust: 0.0008 },    // more over the seat / hip crease / gusset (skin bulges in bends)
  lift: { band: 0.0016, panel: 0.001, pipe: 0.0008 },       // raised neckline band, top panel over the under panel, piping bead
  w: { red: 0.0045, band: 0.013, pipe: 0.005 },             // widths: red line at the opening, white band beside it, piping
  neck: { apexY: 1.192, strapX: 0.052, shoulderY: 1.268, scoopY: 1.135, scoopTopY: 1.215, scoopPow: 2.2 },
  wrapEnd: [-0.104, 1.04],                                  // the top panel's edge ends under the cord at her right waist
  arm: { cx: 0.17, cy: 1.30, rx: 0.075, ry: 0.17 },         // armhole: an elliptic cylinder along z about (|x| cx, cy)
  leg: { cx: 0.07, keys: [[-180, 0.772], [-135, 0.772], [-90, 0.772], [-45, 0.767], [0, 0.783], [45, 0.822], [90, 0.84], [135, 0.818], [160, 0.795], [180, 0.772]] },
  bridge: { back: 0.032, crotch: 0.038 },
  gusset: { y: 0.789, yBack: 0.775, half: 0.009, back: -0.04 },                       // the flat gusset floor between the thigh roots                   // |x| below which the cloth spans across the cleft / crotch
  bounds: [-0.172, 0.745, -0.15, 0.172, 1.318, 0.145],
};
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const N = SWIM.neck;
const SLOPE = (N.shoulderY - N.apexY) / N.strapX;                    // the V: y = apex + SLOPE |x|
const LN = (() => { const l = Math.hypot(N.strapX, N.shoulderY - N.apexY); return [(N.shoulderY - N.apexY) / l, -N.strapX / l]; })();   // normal of the top panel's edge (+x side)

/** leg line height at angle phi (deg; 0 front, +90 outer, 180 back) about the thigh */
function legLine(phi) {
  const K = SWIM.leg.keys; while (phi > 180) phi -= 360; while (phi < -180) phi += 360;
  for (let i = 0; i < K.length - 1; i++) if (phi <= K[i + 1][0]) { const t = (phi - K[i][0]) / (K[i + 1][0] - K[i][0]); return lerp(K[i][1], K[i + 1][1], (1 - Math.cos(Math.PI * t)) / 2); }
  return K[K.length - 1][1];
}
const front = (z) => sm(-0.035, 0.0, z);                                 // 1 in front, 0 at the back (blend over the shoulder top)

/** raw cut functions (positive = keep cloth). Exported in metric form by the build (numeric gradient). */
export const cuts = {
  neck(x, y, z) {
    const ax = Math.abs(x);
    const v = Math.max((N.apexY + SLOPE * ax - y) / Math.hypot(1, SLOPE), ax - N.strapX);
    const u = Math.max(N.scoopY + (N.scoopTopY - N.scoopY) * Math.pow(Math.min(1, ax / N.strapX), N.scoopPow) - y, ax - N.strapX);
    return lerp(u, v, front(z));
  },
  arm(x, y) { const A = SWIM.arm, dx = (Math.abs(x) - A.cx) / A.rx, dy = (y - A.cy) / A.ry, q = Math.hypot(dx, dy); const g = Math.hypot(dx / A.rx, dy / A.ry) / (q || 1); return (q - 1) / (g || 1); },
  leg(x, y, z) { const s = x >= 0 ? 1 : -1, phi = Math.atan2(s * (x - s * SWIM.leg.cx), z) * 180 / Math.PI; return y - legLine(phi); },
};
/** the top panel's edge: signed distance (front view) from the line, + on the top panel (her left); valid in front, under the apex */
export function wrapD(x, y) { return x * LN[0] + (y - N.apexY) * LN[1]; }
export const wrapOn = (x, y, z) => front(z - 0.02) * sm(SWIM.wrapEnd[1] - 0.01, SWIM.wrapEnd[1] + 0.006, y) * (y < N.apexY + 0.004 ? 1 : 0);

/**
 * zones at a point of the cloth from metric edge distances { eN, eA, eL } (m from the neckline / armhole / leg edge) ->
 * { red (0/1 hard), band (0..1 soft), lift (m) }
 */
export function zones(x, y, z, e) {
  const W = SWIM.w, Lf = SWIM.lift;
  const fr = front(z), below = y < N.apexY && fr > 0.5;                // front under the apex: the top panel's edge rules
  const dl = wrapD(x, y), on = wrapOn(x, y, z);
  let red = 0, bandS = 0;
  // under the apex the under panel's edge runs on (hidden) to her left: its band shows only right of the top panel's edge
  const eN = below && dl < 0 ? x * -LN[0] + (y - N.apexY) * LN[1] : e.eN;
  const nOk = !below || dl < 0;
  if (nOk && eN < W.red) red = 1;
  if (e.eA < W.pipe || e.eL < W.pipe) red = 1;
  if (on > 0.5 && dl >= 0 && dl < W.red) red = 1;
  if (nOk) bandS = Math.max(bandS, 1 - sm(W.red + W.band - 0.0007, W.red + W.band + 0.0007, eN));
  bandS = Math.max(bandS, on * sm(-0.0006, 0.0006, dl) * (1 - sm(W.red + W.band - 0.0007, W.red + W.band + 0.0007, dl)));
  const panel = on * sm(-0.0006, 0.0006, dl) * (1 - sm(0.06, 0.1, Math.abs(x) * (1 - fr) + Math.max(0, -z + 0.03)));
  const pipe = Math.max(1 - sm(W.pipe - 0.0006, W.pipe + 0.0006, e.eA), 1 - sm(W.pipe - 0.0006, W.pipe + 0.0006, e.eL));
  return { red, band: bandS, panel, lift: Lf.band * bandS + Lf.panel * panel + Lf.pipe * pipe * (1 - bandS), dl, on };
}

/** metric version of a cut (divide by the numeric gradient) */
export function metric(f, e = 0.0008) {
  return (x, y, z) => { const v = f(x, y, z); const gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e); return v / Math.max(0.3, Math.hypot(gx, gy, gz)); };
}
export const edges = { eN: metric(cuts.neck), eA: metric(cuts.arm), eL: metric(cuts.leg) };
export const edgesAt = (x, y, z) => ({ eN: edges.eN(x, y, z), eA: edges.eA(x, y, z), eL: edges.eL(x, y, z) });

/** extra ease where the skin bulges in deep bends (seat, the hip crease, the gusset): the cloth stays over it */
export function seatEase(x, y, z) {
  const E = SWIM.ease, band = sm(0.765, 0.79, y) * (1 - sm(0.9, 0.95, y));
  const bust = E.bust * sm(0.0, 0.04, z) * sm(1.075, 1.09, y) * (1 - sm(1.12, 1.135, y));
  // the seat's ease runs on up to the top of the cleft (it flexes out in a sprint's hip swing)
  const seatBand = sm(0.765, 0.79, y) * (1 - sm(0.985, 1.02, y));
  return bust + seatBand * E.seat * sm(-0.02, -0.06, z) + band * (E.pelvis + E.side * sm(0.09, 0.12, Math.abs(x)) + E.crease * sm(0.0, 0.04, z) * sm(0.02, 0.06, Math.abs(x)) + E.crotch * (1 - sm(0.025, 0.055, Math.abs(x))) * (1 - sm(0.83, 0.86, y))
    + E.mons * sm(0.0, 0.03, z) * (1 - sm(0.03, 0.07, Math.abs(x))) * (1 - sm(0.86, 0.9, y)));   // the front of the gusset folds in a deep hip bend
}
/** |x| out to which the cloth spans a hollow at (x, y, z): gluteal cleft, the spine's furrow under the scoop, the crotch */
export function bridgeW(x, y, z) {
  const B = SWIM.bridge;
  const back = sm(-0.02, -0.05, z) * sm(0.768, 0.786, y) * (1 - sm(1.0, 1.14, y));
  const spine = sm(-0.04, -0.06, z) * sm(0.98, 1.02, y) * (1 - sm(1.12, 1.15, y)) * 0.6;
  const crotch = (1 - sm(0.815, 0.838, y)) * sm(0.765, 0.778, y);   // the gusset: a flat floor between the thigh roots down to the leg cut
  return Math.max(B.back * back, B.back * spine, B.crotch * crotch);
}
export function swimParts(S, J) {
  const body = bodyShape(S, J), bf = body.f;
  // bridging: the body is read at |x| pushed out to the bridge width where cloth spans a hollow
  const bridged = (x, y, z) => {
    const w = bridgeW(x, y, z);
    if (w < 1e-4) return bf(x, y, z);
    const ax = smax(Math.abs(x), w, 0.008);
    return Math.min(bf(x, y, z), bf(ax * (x < 0 ? -1 : 1), y, z));
  };
  const clr = (x, y, z) => SWIM.clear + seatEase(x, y, z) + zones(x, y, z, edgesAt(x, y, z)).lift;
  // the gusset's floor: between the thighs (which nearly touch) the bridged solid has no underside of its own; a flat floor
  // at y gusset.y closes it, in a column |x| < gusset.half (inside the thighs beyond it: never seen, no material added)
  // toward the seat (z < G_.back) the floor steps down to yBack, just above the leg line, so the seat's lower edge runs
  // (nearly) straight across the back instead of notched up at the centre
  const G_ = SWIM.gusset, floor = (x, y, z) => lerp(G_.y, G_.yBack, sm(G_.back + 0.015, G_.back, z)) - y - sm(G_.half, G_.half * 2, Math.abs(x));
  const cloth = new S.Shape((x, y, z) => Math.max(bridged(x, y, z) - clr(x, y, z), floor(x, y, z)), SWIM.bounds, null, 1.25);
  const smoothCloth = new S.Shape((x, y, z) => bridged(x, y, z) - SWIM.clear, SWIM.bounds, null, 1.25);   // normals: no steps
  return { body, cloth, smoothCloth, bridged };
}

export function swimShape(S, J, P = swimParts(S, J)) {
  const b = SWIM.bounds;
  return P.cloth.intersect(S.plane([0, -1, 0], [0, b[1] + 0.004, 0])).intersect(S.plane([0, 1, 0], [0, b[4] - 0.004, 0]))
    .intersect(S.plane([1, 0, 0], [b[3] - 0.004, 0, 0])).intersect(S.plane([-1, 0, 0], [b[0] + 0.004, 0, 0]));
}

export default {
  name: 'akari_swim_a', rig: { file: RIG_FILE },
  voxel: 0.0015, lods: [10000], ground: null, bandSlack: 0.014, bandSafety: 1.4,
  bounds: SWIM.bounds,
  build({ S, rig }) { return swimShape(S, (n) => rig.bone(n).head); },
};
