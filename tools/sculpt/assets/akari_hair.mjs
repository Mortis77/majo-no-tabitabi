// 灯里's hair — the design (revision 2, after the art review of 2026-11-17).
// Glossy black with a cool blue-violet cast; twin tails tied high at the back-sides of the head with a white paper wrap bound
// by a red cord; a LONG, soft, asymmetric fringe swept to her left (three length groups, parted over the bridge of the nose in
// an inverted V, no lock over an iris); two side locks framing the cheeks to the jaw; full temples; a crown that flows from a
// whorl; the back of the head parted down the middle and gathered up into the tails, with a layer of tapered locks hanging
// from the back of the skull down to the collar (the nape is closed).
//
// Two kinds of form:
//  - the CAP (akari_hair_cap.mjs, contoured by the kit): the skull grown by a clearance that dives under the skin at the
//    hairline, so the hairline has no wall. It is the dark under-layer that shows between locks.
//  - LOCKS (hairDesign): solid swept forms with a lens section, built by tools/sculpt/figure/build-hair.mjs
//    (akari_hair_lib.mjs sweep). Every lock is given by a few points placed with probes on the head (front / top / side /
//    back / radial projections onto the skull at a height `off` above the skin) or, below the skull, in bind space.
// Bind space, metres, her left = +x, front = +z. Head landmarks: tools/sculpt/assets/akari_head.mjs (HEAD).
// Eye facts used here (char_akari_v3): iris |x| 0.022-0.049, y 1.384-1.415; brows y 1.421-1.427; lash line ~1.415.

export const C0 = [0, 1.432, -0.012];                 // the cranium's centre (radial probes start here)
export const COLORS = {
  // hair ramp: depth 0 (the lit crest of a lock) .. 1 (the under-layer between locks), sRGB. Near black, blue-violet cast.
  top: '#272944', mid: '#13142a', deep: '#05050c', sheen: '#3f4878', sheenEdge: '#2a3054',
  ribbon: '#e2422c', ribbonDeep: '#9e1f1c', paper: '#f6f2e8', paperDeep: '#cfc8c4', cord: '#c3212b', cordDeep: '#7e1219',
};

/**
 * The painted sheen: a FAINT highlight per lock (the game's own light-following ring does the real highlight). A band
 * round the upper head at elevation `el` (deg, from C0; by azimuth) +- `half`, shifted per lock by up to +-`jitter`, so it
 * breaks into one soft glint per lock; `k` scales it (0 = off). On the tails a glint across the bulge.
 */
export const SHEEN = { el: [[0, 46], [60, 45], [120, 41], [180, 37]], half: 3.6, jitter: 3.4, k: 0.42, tail: [0.2, 0.26], tailJitter: 0.04, tailK: 0.22 };

/**
 * Twin tails (her left; the right one is mirrored with `right` changes). The tie sits on the skull at (az, el) from C0, `off`
 * above the skin; the axis runs out, down and back in an S (out under the tie, in at the shoulder, a flick out at the end),
 * behind the shoulder (the kosode's back is at z ≈ -0.06 there), down to the shoulder blade. Along the axis (fraction f):
 * r = how far the locks sit from the axis (widest a hand below the tie, fanning again at the ends), across / depth scale
 * that radius (the tail is broader seen from behind than from the side), hw / ht = a lock's half width / half thickness.
 */
export const TAIL = {
  tie: [114, 29, 0.0215],
  axis: [[0.104, 1.45, -0.072], [0.134, 1.405, -0.094], [0.153, 1.35, -0.111], [0.156, 1.29, -0.119], [0.148, 1.24, -0.118], [0.153, 1.195, -0.11]],
  right: { dy: 0.008, dz: -0.004 },          // her right tail a touch shorter, hanging a little further back
  r: [[0, 0.006], [0.1, 0.02], [0.28, 0.031], [0.5, 0.027], [0.75, 0.021], [1, 0.024]],
  across: 1.3, depth: 0.78,
  hw: [[0, 0.01], [0.12, 0.019], [0.35, 0.024], [0.65, 0.021], [0.88, 0.012], [1, 0.003]],
  ht: [[0, 0.0048], [0.15, 0.0078], [0.45, 0.0076], [0.75, 0.0055], [1, 0.0012]],
  twist: 64,                                  // degrees the locks turn about the axis from tie to tip
  wrap: { from: -0.004, to: 0.017, r: 0.0168, th: 0.0022 },   // paper wrap along the axis (m from the tie centre)
  cord: { at: 0.0068, R: 0.0183, r: 0.0017, ends: 0.022 },
};

/**
 * The locks. H = probes from the build: F(x, y, off) front, Tp(x, z, off) top, Sd(side, y, z, off) side, Bk(x, y, off) back,
 * R(az, el, off) radial from C0 (degrees; az 0 = front, + toward her left), tie(side) -> tie centre.
 * A lock: { name, group, pts, hw (half width per point), ht (half thickness per point), up: 'head' | { axis },
 *           tip: 'point' | 'cap', K (section points), ds, weights: rule name, lean (section crest bias) }
 */
export function hairDesign(H) {
  const L = [];
  const lerp = (a, b, t) => a + (b - a) * t;
  const O = 0.0055;          // how far the hair mass stands off the cap (volume)
  const SIDE = 0.005;        // extra fullness at the temples and above the ears (review: the head read small)
  // ---------------------------------------------------------------- fringe: long, soft, asymmetric
  // [name, root x, tip x, tip y, half width, off at tip, length group, flick]
  //  long  : the centre pair parting over the bridge of the nose (inverted V) and the two outer locks to mid-cheek
  //  medium: the two big locks over the eyes, ending at the lash line (above the irises)
  //  short : three locks ending at the brow line
  // The fringe sweeps to her left; c2, r1 and ro cross against the sweep.
  const FR = [
    ['Fc1', 0.001, 0.012, 1.398, 0.0125, 0.0058, 'long', 1],
    ['Fc2', -0.003, -0.013, 1.402, 0.0118, 0.0058, 'long', -1],
    ['Fl2', -0.01, 0.032, 1.4205, 0.019, 0.0062, 'medium', 1],
    ['Fl3', 0.012, 0.054, 1.428, 0.0155, 0.0068, 'short', 1],
    ['Flo', 0.026, 0.062, 1.374, 0.0145, 0.0085, 'long', 1],
    ['Fr1', -0.017, -0.027, 1.4285, 0.0118, 0.0066, 'short', -1],
    ['Fr2', -0.03, -0.041, 1.4195, 0.0195, 0.0064, 'medium', 1],
    ['Fr3', -0.054, -0.062, 1.404, 0.013, 0.0072, 'long', 1],     // fills her right temple under the fringe
    ['Fro', -0.041, -0.06, 1.384, 0.0155, 0.0085, 'long', -1],
    ['Fl4', -0.02, 0.019, 1.4325, 0.0098, 0.0068, 'short', 1],
  ];
  for (const [name, xr, xt, yt, hw, offT, grp, fl] of FR) {
    const long = grp === 'long', med = grp === 'medium';
    const ease = (t) => 1 - Math.pow(1 - t, 1.7);            // sweeps early, hangs at the end
    const ys = long ? [1.448, 1.432, 1.416] : med ? [1.448, 1.433] : [1.447];
    const pts = [H.Tp(xr, -0.016, 0.0095), H.Tp(lerp(xr, xt, 0.22), 0.029, 0.017 + O * 0.6), H.F(lerp(xr, xt, 0.45), 1.468, 0.0195 + O * 0.4)];
    const hws = [0.011, hw * 1.04, hw * 1.02], hts = [0.0032, 0.0046, 0.0048];
    ys.forEach((y, i) => {
      if (y <= yt + 0.006) return;
      const t = (1.468 - y) / (1.468 - yt), x = lerp(xr, xt, 0.45 + 0.55 * ease(t));
      pts.push(H.F(x, y, lerp(0.0165, offT, Math.sqrt(t))));
      hws.push(hw * lerp(0.98, 0.55, t * t)); hts.push(lerp(0.0047, 0.0034, t));
    });
    // the tip, flicked a touch outward and in the sweep direction
    pts.push(H.F(xt + fl * 0.0018, yt, offT + 0.0008));
    hws.push(hw * 0.14); hts.push(0.0011);
    L.push({ name, group: 'fringe', pts, up: 'head', weights: 'head', K: 10, ds: long ? 0.0115 : 0.0105, hw: hws, ht: hts, lean: fl * 0.16 });
  }
  // ---------------------------------------------------------------- side locks: long, framing the cheeks down to the jaw
  for (const sd of [1, -1]) {
    const a = sd > 0 ? 0 : 0.007;   // her right one a touch shorter
    L.push({ name: sd > 0 ? 'SideL' : 'SideR', group: 'side', up: 'head', weights: sd > 0 ? 'sideL' : 'sideR', K: 10, ds: 0.0115, tip: 'point',
      pts: [H.Tp(sd * 0.034, 0.002, 0.0095), H.R(sd * 50, 40, 0.018 + O + SIDE * 0.5), H.Sd(sd, 1.45, 0.044, 0.019 + O * 0.6 + SIDE * 0.6), H.Sd(sd, 1.403, 0.04, 0.0195), H.Sd(sd, 1.355 + a, 0.043, 0.0205), H.Sd(sd, 1.306 + a, 0.051, 0.0185)],
      hw: [0.012, 0.0185, 0.0195, 0.018, 0.0145, 0.0022], ht: [0.0034, 0.0054, 0.0054, 0.0048, 0.0038, 0.001], lean: -0.12 * sd });
    // a shorter lock behind it, over the front of the ear
    L.push({ name: sd > 0 ? 'Side2L' : 'Side2R', group: 'side', up: 'head', weights: sd > 0 ? 'sideL' : 'sideR', K: 10, ds: 0.012,
      pts: [H.R(sd * 64, 42, 0.011 + SIDE * 0.5), H.Sd(sd, 1.442, 0.02, 0.0185 + O * 0.5 + SIDE), H.Sd(sd, 1.405, 0.016, 0.0195 + SIDE * 0.5), H.Sd(sd, 1.362, 0.022, 0.018)],
      hw: [0.012, 0.015, 0.0115, 0.0014], ht: [0.0032, 0.0046, 0.0036, 0.0009] });
  }
  // ---------------------------------------------------------------- temples: over the top of the ear, up into the tie
  for (const sd of [1, -1]) {
    const tie = H.tie(sd);
    L.push({ name: 'Temple1' + (sd > 0 ? 'L' : 'R'), group: 'temple', up: 'head', weights: 'head', K: 10, ds: 0.014, tip: 'cap',
      pts: [H.R(sd * 46, 52, 0.01), H.R(sd * 78, 34, 0.0165 + O + SIDE), H.Sd(sd, 1.444, -0.014, 0.0175 + O + SIDE), H.R(sd * 110, 25, 0.0165 + O * 0.5 + SIDE * 0.6), tie],
      hw: [0.012, 0.019, 0.02, 0.016, 0.009], ht: [0.003, 0.0046, 0.0048, 0.0042, 0.0034] });
    L.push({ name: 'Temple2' + (sd > 0 ? 'L' : 'R'), group: 'temple', up: 'head', weights: 'head', K: 10, ds: 0.014, tip: 'cap',
      pts: [H.R(sd * 72, 20, 0.0095 + SIDE * 0.4), H.Sd(sd, 1.424, 0.006, 0.0165 + O * 0.5 + SIDE), H.Sd(sd, 1.418, -0.032, 0.017 + O * 0.5 + SIDE), H.R(sd * 117, 15, 0.0165 + SIDE * 0.5), tie],
      hw: [0.011, 0.016, 0.017, 0.014, 0.008], ht: [0.003, 0.0042, 0.0044, 0.0038, 0.0032] });
  }
  // ---------------------------------------------------------------- crown: radiating from the whorl into the ties
  const W = H.Tp(-0.016, -0.036, 0.012);
  const crown = [
    ['C1L', 1, [[20, 74], [55, 54], [92, 37]]],
    ['C2L', 1, [[78, 70], [104, 50], [114, 36]]],
    ['C1R', -1, [[-28, 74], [-58, 54], [-90, 37]]],
    ['C2R', -1, [[-110, 68], [-114, 48], [-117, 34]]],
  ];
  for (const [name, sd, way] of crown) {
    L.push({ name, group: 'crown', up: 'head', weights: 'head', K: 10, ds: 0.014, tip: 'cap',
      pts: [W, ...way.map(([az, el], i) => H.R(az, el, 0.0165 + O + 0.0008 * i + SIDE * 0.5 * i / 2)), H.tie(sd)],
      hw: [0.008, 0.019, 0.0205, 0.017, 0.008], ht: [0.003, 0.0046, 0.0048, 0.0044, 0.0034] });
  }
  // ---------------------------------------------------------------- back of the head: parted down the middle, gathered up
  for (const sd of [1, -1]) {
    const tie = H.tie(sd), s = sd > 0 ? 'L' : 'R';
    const rows = [
      // start at the parting (x, y), waypoint (az, el)
      ['B1' + s, 0.0105, 1.49, [148, 31]],
      ['B2' + s, 0.0105, 1.448, [150, 14]],
      ['B3' + s, 0.0125, 1.412, [144, 2], [130, 10]],
    ];
    for (const [name, x, y, w1, w2] of rows) {
      L.push({ name, group: 'back', up: 'head', weights: 'head', K: 10, ds: 0.014, tip: 'cap',
        pts: [H.Bk(sd * x, y, 0.011), H.Bk(sd * (x + 0.024), y + 0.004, 0.0165 + O), H.R(sd * w1[0], w1[1], 0.017 + O + SIDE * 0.4), ...(w2 ? [H.R(sd * w2[0], w2[1], 0.0165 + O * 0.6 + SIDE * 0.5)] : []), tie],
        hw: [0.011, 0.02, 0.0215, ...(w2 ? [0.0165] : []), 0.008], ht: [0.003, 0.0046, 0.005, ...(w2 ? [0.0042] : []), 0.0034] });
    }
  }
  // ---------------------------------------------------------------- the nape: tapered locks hanging from the back of the skull
  // to the collar (the kosode's collar top is at y ~1.315, its back at z ~ -0.074; the neck's back at z -0.04..-0.05). They
  // start under the gathered back locks, fall over the occiput and curve in a little, tips just over the collar edge.
  // [name, x at root, x at tip, tip y, half width, start az for the behind-the-ear ones]
  const NP = [
    ['N0', 0.0, 0.004, 1.309, 0.0145],
    ['N1L', 0.02, 0.025, 1.329, 0.0135], ['N1R', -0.021, -0.026, 1.317, 0.0155],
    ['N2L', 0.04, 0.045, 1.318, 0.015], ['N2R', -0.041, -0.044, 1.336, 0.0125],
    ['N3L', 0.056, 0.058, 1.352, 0.011], ['N3R', -0.055, -0.057, 1.344, 0.0125],
  ];
  for (const [name, x0, x1, yt, hw] of NP) {
    const ax = Math.abs(x0);
    const p0 = H.Bk(x0, 1.428, 0.0125);
    const p1 = H.Bk(lerp(x0, x1, 0.3), 1.395, 0.0175 + O * 0.5);
    const p2 = [lerp(x0, x1, 0.65), lerp(1.395, yt, 0.55), p1[2] + 0.009];
    const p3 = [x1, yt, Math.max(p2[2] + 0.006, -0.083 + 0.03 * ax / 0.06)];
    L.push({ name, group: 'nape', up: 'head', weights: 'nape', K: 8, ds: 0.0135, pts: [p0, p1, p2, p3],
      hw: [hw * 0.8, hw, hw * 0.78, hw * 0.12], ht: [0.0032, 0.0048, 0.004, 0.001], lean: Math.sign(x0) * 0.1 });
  }
  // behind the ears: one lock each side, from under the temple down behind the ear
  for (const sd of [1, -1]) {
    const p0 = H.R(sd * 112, 8, 0.012 + SIDE * 0.5), p1 = H.R(sd * 122, -6, 0.0175 + SIDE * 0.5);
    const p2 = [sd * 0.067, 1.384, -0.052], p3 = [sd * 0.063, 1.364, -0.05];
    L.push({ name: 'Ear' + (sd > 0 ? 'L' : 'R'), group: 'nape', up: 'head', weights: 'nape', K: 8, ds: 0.0135, pts: [p0, p1, p2, p3],
      hw: [0.012, 0.0145, 0.011, 0.0025], ht: [0.003, 0.0046, 0.0038, 0.0012], lean: -0.1 * sd });
  }
  // ---------------------------------------------------------------- one soft curl lying with the part on the crown
  L.push({ name: 'Curl', group: 'stray', up: 'head', weights: 'head', K: 10, ds: 0.0062,
    pts: [H.Tp(0.012, -0.012, 0.012), H.R(30, 66, 0.0215 + O), H.R(44, 64, 0.0265 + O), H.R(51, 67, 0.029 + O), H.R(47, 71, 0.028 + O)],
    hw: [0.006, 0.0075, 0.0062, 0.004, 0.0008], ht: [0.0024, 0.003, 0.0026, 0.002, 0.0007], lean: 0.25 });
  // ---------------------------------------------------------------- twin tails: overlapping locks around each tail's axis
  const TL = [
    // angle about the axis (deg, 0 = back, 90 = outward side), length (fraction of the axis), offset scale, hw scale, ht scale
    [0, 1.0, 0.45, 1.2, 1.25],
    [42, 0.87, 1, 1.05, 1],
    [88, 0.97, 1, 1.1, 1],
    [135, 0.79, 0.95, 1.0, 0.95],
    [180, 0.68, 0.8, 0.95, 0.9],
    [226, 0.84, 1, 1.0, 0.95],
    [272, 0.74, 1, 0.95, 0.9],
    [318, 0.93, 1, 1.05, 1],
  ];
  for (const sd of [1, -1]) {
    TL.forEach(([ang, frac, osc, wsc, tsc], k) => {
      L.push({ name: `Tail${sd > 0 ? 'L' : 'R'}${k}`, group: 'tail', side: sd, up: { axis: sd, ang: sd * ang }, weights: sd > 0 ? 'tailL' : 'tailR', K: 8, ds: 0.024,
        tailLock: { ang: sd * ang, frac, osc, wsc, tsc } });
    });
  }
  return L;
}

export { capShape, capClear, hairlineY } from './akari_hair_cap.mjs';
