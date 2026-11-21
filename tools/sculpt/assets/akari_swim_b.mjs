// 灯里 — swimsuit B, 暮海 ("dusk sea"): the layers that LIE ON the base figure, grown as fields from her body
// (tools/sculpt/assets/akari_body.mjs). The hanging over-piece (waist wrap, knot, ends), the sandal soles, the gold ring
// and the anklet are built by tools/costume/swim_b.mjs on top of these. Nothing here cuts the body.
//
//   top      indigo halter sports top: one structured front shell (the chest's concave envelope: flat from cup to cup,
//            straight down to the band; 3 mm gold centre piping), a
//            wide raised under-band all round, two halter straps that hug the neck base and run down the back to a gold
//            ring between the shoulder blades, one centre strap from the ring to the band (racer back). Skin + 3.2 mm,
//            the band + 4.7 mm. Its outline is a MASK (positive = cloth) cut exactly on the contoured cloth; gold
//            piping = a second mask (band's top edge, neckline + armholes).
//   shorts   indigo high-waisted swim shorts, ONE closed solid over seat + crotch (body united with a seat bridge and a
//            flat gusset floor, then offset): skin + 3.8 mm, waistband + 5 mm, legs to y 0.735 (6.5 cm below the crotch,
//            full seat), each leg on its own below the gusset, a short slit at each outer side seam; gold piping down
//            each side seam and a 4 mm gold band round each hem.
//   straps   the sandals' straps lying on the bare foot: a wide band over the forefoot, an ankle strap, a heel strap.
//
// Positive mask = keep. All lengths in metres, bind pose (T-pose), her left = +x, front = +z.
import { bodyShape, RIG_FILE, SOLE_Y } from './akari_body.mjs';

export { RIG_FILE, SOLE_Y };
export const SWIM = {
  top: {
    clr: 0.0032, band: 0.0047,                    // over the skin: panel + straps / under-band
    bandBot: 1.072, bandTop: 1.108,               // under-band (36 mm), under the bust (under-bust y 1.115)
    neckC: 1.222, root: [0.048, 1.248],           // neckline at the centre front, the strap roots (|x|, y)
    bridge: [1.104, 1.214], bridgeX: 0.054,       // flat front between the bust apexes (x +-0.054)
    strapHW: 0.0105, backHW: 0.0125,              // halter straps 21 mm, centre back strap 25 mm
    ring: { y: 1.19, r: 0.0095, wire: 0.0019, hole: 0.0064 },
    pipeW: 0.004,                                  // gold piping width (neckline, armholes)
    centreHW: 0.0015,                              // centre-front piping: 3 mm
    fillet: 0.004,
  },
  shorts: {
    clr: 0.0038, seat: 0.0024, fold: 0.003, gusset: 0.002, front: 0.006, floorDrop: 0.02, slot: 0.766, blend: 0.008, hip: 0.0016, band: 0.005, top: 1.016, topBack: 0.01, bandH: 0.026,
    wedge: { yLo: 0.777, hw: 0.03, back: 0.022, front: 0.017, frontIn: 0.003, y1: 0.83, ySeat: 0.804, sweep: 0.5 },   // flat seat foot + flat front of the gusset (r3)
    leg: 0.735, notch: 0.017, notchW: 0.012, seamZ: -0.012, pipeHW: 0.0026, hemW: 0.0042,
  },
  sandal: {
    clr: 0.0026, footX: 0.045, bottom: 0.0335,
    ankle: { y: 0.104, z: -0.018, tilt: 0.38, hw: 0.0062 },
    heel: { hw: 0.0075, z: -0.046 },
    fore: { z: 0.064, y: 0.06, tilt: 0.3, hw: 0.0145 },
  },
};

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
/** polynomial smooth minimum (k: blend width) */
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (a - b) / k)); return lerp(b, a, h) + k * h * (1 - h); };
/** monotone cubic through (xs ascending, ys) — no overshoot between the designed points */
export function monotone(xs, ys) {
  const n = xs.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const zOn = (f, x, y, z0 = 0.17) => { let z = z0; for (let i = 0; i < 160; i++) { const d = f(x, y, z); if (d < 1e-5) break; z -= Math.max(d * 0.7, 1e-4); } return z; };
/** a point moved onto the zero set of shape along its gradient */
export function snapTo(shape, p, it = 40) {
  let [x, y, z] = p; const g = [0, 0, 0];
  for (let i = 0; i < it; i++) { const d = shape.f(x, y, z); if (Math.abs(d) < 2e-6) break; shape.normal(x, y, z, g, 0.0008); x -= d * g[0]; y -= d * g[1]; z -= d * g[2]; }
  return [x, y, z];
}


// ------------------------------------------------------------------ bridges: cloth spans hollows, it does not sink into them
/** concave (upper) envelope of D over xs, per contiguous run of samples (null = the ray missed): the straight bridge over
 *  every dip between two highs */
export function envelope1(xs, D) {
  const out = D.slice(), n = xs.length; let i = 0;
  while (i < n) {
    if (D[i] == null) { i++; continue; }
    let j = i; while (j + 1 < n && D[j + 1] != null) j++;
    const h = [];
    for (let k = i; k <= j; k++) { while (h.length >= 2) { const a = h[h.length - 2], b = h[h.length - 1]; if ((D[b] - D[a]) * (xs[k] - xs[a]) <= (D[k] - D[a]) * (xs[b] - xs[a])) h.pop(); else break; } h.push(k); }
    for (let q = 0; q < h.length - 1; q++) { const a = h[q], b = h[q + 1]; for (let k = a; k <= b; k++) out[k] = D[a] + (D[b] - D[a]) * (xs[k] - xs[a]) / (xs[b] - xs[a]); }
    i = j + 1;
  }
  return out;
}
/** A fill over the hollows of one side of the body seen along z (dir -1: from behind, +1: from the front): the body's height
 *  map H(x, y) (= dir * z of the first hit), bridged by the concave envelope along x in every row and along y in every column
 *  inside envY; the fill is the gap between the envelope and the skin (+ `into` under it). Union it with the body and every
 *  offset of the union spans the hollows as one flat sheet. -> field (negative inside), approximate distance along z. */
export function heightBridge(bf, { dir, x: [x0, x1], y: [y0, y1], step = 0.002, envY = null, into = 0.003, zFar = 0.12 }) {
  const xs = [], ys = []; for (let x = x0; x <= x1 + 1e-9; x += step) xs.push(x); for (let y = y0; y <= y1 + 1e-9; y += step) ys.push(y);
  const NX = xs.length, NY = ys.length, H = Array.from({ length: NY }, () => new Array(NX).fill(null));
  for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
    const x = xs[ix], y = ys[iy]; let z = dir * 0.22;
    for (let it = 0; it < 2000; it++) { const d = bf(x, y, z); if (d < 5e-5) { H[iy][ix] = dir * z; break; } z -= dir * Math.max(d * 0.9, 2.5e-4); if (dir * z < -zFar) break; }
  }
  const E = H.map((row) => envelope1(xs, row));
  if (envY) for (let ix = 0; ix < NX; ix++) {
    const idx = []; for (let iy = 0; iy < NY; iy++) if (ys[iy] >= envY[0] - 1e-9 && ys[iy] <= envY[1] + 1e-9) idx.push(iy);
    const col = envelope1(idx.map((i) => ys[i]), idx.map((i) => H[i][ix]));
    idx.forEach((iy, k) => { if (col[k] != null && E[iy][ix] != null) E[iy][ix] = Math.max(E[iy][ix], col[k]); });
  }
  const MISS = 0.03;
  const node = (iy, ix, w) => (H[iy][ix] == null ? MISS : Math.max(w - E[iy][ix], H[iy][ix] - into - w));
  const f = (x, y, z) => {
    const fx = (x - x0) / step, fy = (y - y0) / step; if (fx < 0 || fy < 0 || fx > NX - 1 || fy > NY - 1) return MISS;
    const ix = Math.min(NX - 2, Math.floor(fx)), iy = Math.min(NY - 2, Math.floor(fy)), tx = fx - ix, ty = fy - iy, w = dir * z;
    return (node(iy, ix, w) * (1 - tx) + node(iy, ix + 1, w) * tx) * (1 - ty) + (node(iy + 1, ix, w) * (1 - tx) + node(iy + 1, ix + 1, w) * tx) * ty;
  };
  return { f, H, E, xs, ys };
}

// =============================================================================================================== top
export function topParts(S, J) {
  const T = SWIM.top, body = bodyShape(S, J), bf = body.f;
  const raise = (y) => sm(T.bandTop + 0.0012, T.bandTop - 0.0012, y);
  const clr = (y) => T.clr + (T.band - T.clr) * raise(y);
  const B = [-0.2, 1.03, -0.14, 0.2, 1.33, 0.16];
  // the front bridged as one sports-top shell: the concave envelope of the chest seen from the front, along x in every row
  // (straight from cup to cup, no cleavage line) and along y in every column above the band (falls straight from the bust
  // to the band, no under-bust crease). The band itself stays on the ribs.
  const fb = heightBridge(bf, { dir: 1, x: [-0.095, 0.095], y: [1.05, 1.27], envY: [T.bandTop, 1.25] });
  const base = new S.Shape((x, y, z) => smin(bf(x, y, z), fb.f(x, y, z), 0.008) - clr(y), B, null, 1.15);
  const cloth = base;
  // ---- strap paths laid on the cloth: front root -> round the neck base -> down the back to the ring; ring -> band
  const zBack = (x, y) => -zOn((a, b, c) => cloth.f(a, b, -c), x, y);
  const ringC = snapTo(cloth, [0, T.ring.y, zBack(0, T.ring.y)]);
  const L = [[0.043, 1.226, 0.085], [0.047, 1.247, 0.065], [0.052, 1.268, 0.04], [0.056, 1.285, 0.01], [0.055, 1.287, -0.02], [0.05, 1.274, -0.045], [0.04, 1.252, -0.064], [0.026, 1.224, -0.078], [T.ring.r + 0.002, T.ring.y + 0.004, ringC[2]]];
  const strapPts = L.map((p) => snapTo(cloth, p));
  const strapL = S.tube(strapPts, 0.0005), strapR = S.tube(strapPts.map((p) => [-p[0], p[1], p[2]]), 0.0005);
  const backPts = [[0, T.ring.y - T.ring.r + 0.001], [0, 1.16], [0, 1.13], [0, T.bandTop - 0.004]].map(([x, y]) => snapTo(cloth, [x, y, zBack(x, y)]));
  const backS = S.tube(backPts, 0.0005);
  const cf = cloth.f;
  const lat = (sh, x, y, z) => { const c = sh.f(x, y, z), h = cf(x, y, z); return Math.sqrt(Math.max(0, c * c - h * h)); };
  // ---- the panel's top edge: a front-view outline in front, by depth z round the side (no seam where they meet)
  const tSide = monotone([-0.08, -0.058, -0.032, 0.0, 0.03, 0.06], [1.05, 1.112, 1.134, 1.155, 1.178, 1.2]);
  const tFront = (ax) => ax <= T.root[0] ? T.neckC + (T.root[1] - T.neckC) * (ax / T.root[0]) ** 2 : T.root[1] - 0.05 * Math.min(1.4, (ax - T.root[0]) / 0.06) ** 1.5;
  const top = (x, z) => { const ax = Math.abs(x), w = Math.max(sm(0.085, 0.112, ax), sm(0.04, -0.02, z)); return lerp(tFront(ax), tSide(z), w); };
  const panel = (x, y, z) => { const e = 0.0015, gx = (top(x + e, z) - top(x - e, z)) / (2 * e), gz = (top(x, z + e) - top(x, z - e)) / (2 * e); return (top(x, z) - y) / Math.sqrt(1 + gx * gx + gz * gz); };
  const straps = (x, y, z) => Math.max(T.strapHW - lat(strapL, x, y, z), T.strapHW - lat(strapR, x, y, z), T.backHW - lat(backS, x, y, z));
  const k = T.fillet;
  const mask = (x, y, z) => {
    let m = smax(smax(panel(x, y, z), T.bandTop + 0.0015 - y, k), straps(x, y, z), k);
    m = Math.min(m, y - T.bandBot);
    return Math.min(m, Math.hypot(x - ringC[0], y - ringC[1], z - ringC[2]) - T.ring.hole);
  };
  const pipe = (x, y, z) => {
    const pb = Math.min(y - (T.bandTop - 0.0032), T.bandTop + 0.0022 - y);
    const p = panel(x, y, z), pp = Math.min(T.pipeW - p, p + 0.002, -straps(x, y, z) - 0.0008, top(x, z) - T.bandTop - 0.004);
    const pc = Math.min(T.centreHW - Math.abs(x), z - 0.02, y - T.bandTop);    // the centre-front piping, band to neckline
    return Math.max(pb, pp, pc);
  };
  // each boundary of the piping as its own cut (exact, and only where it bounds something: no stray cuts across the panel)
  const rises = (x, y, z) => top(x, z) - T.bandTop - 0.004;
  const pipeCuts = [(x, y) => y - (T.bandTop - 0.0032), (x, y) => T.bandTop + 0.0022 - y, (x, y, z) => T.pipeW - panel(x, y, z), (x, y, z) => -straps(x, y, z) - 0.0008, rises,
    (x) => T.centreHW - x, (x) => T.centreHW + x];
  return { body, base, cloth, mask, pipe, pipeCuts, panel, straps, ringC, strapPts, backPts, clr, B, fb };
}
export function topShape(S, J) { return topParts(S, J).cloth; }

// ============================================================================================================ shorts
export function shortsParts(S, J) {
  const H = SWIM.shorts, body = bodyShape(S, J), bf = body.f;
  const yTop = (z) => H.top + H.topBack * sm(0.03, -0.07, z);
  // the seat gets more ease than the front: hips and thighs flex up to 120 degrees and skinning shrinks the offset there
  const seat = (y, z) => H.seat * sm(-0.015, -0.055, z) * (1 - sm(0.9, 0.95, y)) + H.fold * sm(-0.03, -0.06, z) * Math.exp(-(((y - 0.795) / 0.035) ** 2));
  // and the crotch: the skin there folds into a ridge in deep flexion (roll, hard landing, sitting on the ground)
  const gusset = (x, y, z = 0) => H.gusset * Math.exp(-((x / 0.03) ** 2)) * sm(0.76, 0.785, y) * sm(0.85, 0.82, y)
    + H.front * Math.exp(-((x / 0.028) ** 2)) * sm(0.775, 0.795, y) * sm(0.86, 0.83, y) * sm(0.0, 0.025, z);   // the front of the gusset: room for the hip's deep fold
  // Leave ease where the high-flexion thigh blends into the hip, including the outer side seam.
  const thighEase = (x, y) => 0.008 * sm(0.034, 0.066, Math.abs(x)) * sm(0.731, 0.766, y) * (1 - sm(0.83, 0.895, y));
  const clr = (y, z, x = 0.1) => H.clr + seat(y, z) + thighEase(x, y) + gusset(x, y, z) + H.hip * sm(0.915, 0.945, y) + (H.band - H.clr) * sm(yTop(z) - H.bandH - 0.0012, yTop(z) - H.bandH + 0.0012, y);
  const B = [-0.2, 0.67, -0.14, 0.2, 1.06, 0.13];
  // each leg on its own below y H.slot (a 3 mm slot under the gusset floor; the half-gap between the thighs is >= 5.4 mm there, so the slot never opens the
  // cloth: it only keeps the contour from bridging the legs); above it the cloth runs across the crotch as a gusset
  const zs = [], cy = []; for (let z = -0.14; z <= 0.13; z += 0.004) { let y = 0.6; while (y < 0.95 && bf(0, y, z) > 0) y += 0.0008; zs.push(z); cy.push(y); }
  const crotchY = (z) => { const t = (z + 0.14) / 0.004, i = Math.max(0, Math.min(zs.length - 2, Math.floor(t))), f = Math.max(0, Math.min(1, t - i)); return lerp(cy[i], cy[i + 1], f); };
  // ONE closed solid over the seat and the crotch: the body united with (a) the seat bridge, the concave envelope of the
  // back seen from behind along x in every row (flat across the cleft) and along y in every column up to y 0.9 (flat from
  // the seat down onto the thigh: no gluteal fold), and (b) a flat gusset floor a few mm under the crotch line, spanning
  // between the inner thighs from the front of the crotch to the seat. Every offset of that union bridges; nothing of the
  // body's own forms between the legs or in the cleft reaches the cloth.
  const sb = heightBridge(bf, { dir: -1, x: [-0.13, 0.13], y: [0.70, 1.03], envY: [0.70, 0.9] });
  const drop = (z) => H.floorDrop * (1 - sm(0.045, 0.07, z)) * (1 - sm(-0.05, -0.07, z)) - 0.0025;
  const floor = (x, y, z) => { const yc = crotchY(z); return Math.max(yc - drop(z) - y, y - yc - 0.004, Math.abs(x) - 0.03, yc - 0.88); };
  // (c) r3: the seat's foot and the gusset's front, spanned FLAT between the legs: below the cleft the seen-from-behind rows
  // miss at x = 0 (the thighs part) so the envelope cannot bridge them; a wedge between the inner thighs whose outer face
  // is the straight line from one inner glute / inner groin to the other (no notch at the foot of the seat, no centre
  // groove at the front of the crotch). Rounded bottom edge at yLo, merged into the floor and the leg tubes.
  const Wd = H.wedge, zRow = (x0, dir) => { const t = []; for (let y = Wd.yLo - 0.01; y <= Wd.y1 + 0.011; y += 0.002) t.push(dir < 0 ? -zOn((a, b, c) => bf(a, b, -c), x0, y) : zOn(bf, x0, y)); return t; };
  const tb = zRow(Wd.back, -1), tf = zRow(Wd.front, 1);
  const tab = (t, y) => { const u = (y - (Wd.yLo - 0.01)) / 0.002, i = Math.max(0, Math.min(t.length - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - i)); return lerp(t[i], t[i + 1], f); };
  // the back face continues the seat bridge's bottom row (no shelf where the rows stop bridging at the cleft's foot) and
  // sweeps forward toward the inner glutes only near the bottom edge: the rounded foot of the seat
  const zSeat = -zOn((a, b, c) => smin(bf(a, b, -c), sb.f(a, b, -c), H.blend), 0, Wd.ySeat);
  const zBackW = (y) => { const t = Math.max(0, Math.min(1, (Wd.ySeat - y) / (Wd.ySeat - Wd.yLo))); return lerp(zSeat, lerp(zSeat, tab(tb, y), Wd.sweep), t ** 1.5); };
  const wedge = (x, y, z) => Math.max(zBackW(y) - z, z - (tab(tf, y) - Wd.frontIn), Math.abs(x) - Wd.hw, Wd.yLo - y, y - Wd.y1);
  const filled = (x, y, z) => smin(smin(smin(bf(x, y, z), sb.f(x, y, z), H.blend), floor(x, y, z), H.blend), wedge(x, y, z), H.blend);   // blended: no crease where cloth leaves the skin
  const cloth = new S.Shape((x, y, z) => Math.max(filled(x, y, z) - clr(y, z, x), Math.min(0.0016 - Math.abs(x), H.slot - y)), B, null, 1.15);
  const notch = (x, z) => H.notch * (1 - sm(0, H.notchW, Math.abs(z - H.seamZ))) * sm(0.05, 0.08, Math.abs(x));
  const mask = (x, y, z) => Math.min(yTop(z) - y, y - (H.leg + notch(x, z)));
  // piping: the region between its boundary fields (each cut on its own, so a strip narrower than a triangle is not lost)
  // + a gold band round each leg's hem (following the side slit)
  const hemCut = (x, y, z) => H.leg + notch(x, z) + H.hemW - y;
  const sideCuts = [(x, y, z) => H.pipeHW - (z - H.seamZ), (x, y, z) => H.pipeHW + (z - H.seamZ), (x) => Math.abs(x) - 0.06];
  const pipeCuts = [...sideCuts, hemCut];
  const pipe = (x, y, z) => Math.max(Math.min(...sideCuts.map((f) => f(x, y, z))), hemCut(x, y, z));
  return { body, cloth, mask, pipe, pipeCuts, yTop, notch, crotchY, B, sb, floor, filled, wedge };
}
export function shortsShape(S, J) { return shortsParts(S, J).cloth; }

// ============================================================================================================ sandals
export function strapParts(S, J) {
  const D = SWIM.sandal, body = bodyShape(S, J), bf = body.f;
  const B = [-0.115, 0.028, -0.09, 0.115, 0.135, 0.125];
  const cloth = new S.Shape((x, y, z) => bf(x, y, z) - D.clr, B, null, 1.1);
  const nA = [0, 1, -D.ankle.tilt].map((v, i, a) => v / Math.hypot(...a)), nF = [0, D.fore.tilt, 1].map((v, i, a) => v / Math.hypot(...a));
  const k = 0.003;
  const parts = (x, y, z) => {
    const s = Math.sign(x) || 1, fx = s * D.footX;
    const dA = nA[1] * (y - D.ankle.y) + nA[2] * (z - D.ankle.z);
    const ankle = D.ankle.hw - Math.abs(dA);
    const heel = Math.min(D.heel.hw - Math.abs(x - fx), D.heel.z - z, -dA);
    const fore = D.fore.hw - Math.abs(nF[1] * (y - D.fore.y) + nF[2] * (z - D.fore.z));
    return { ankle, heel, fore, dA };
  };
  const mask = (x, y, z) => { const p = parts(x, y, z); return Math.min(smax(smax(p.ankle, p.heel, k), p.fore, k), y - D.bottom); };
  return { body, cloth, mask, parts, nA, nF, B };
}
export function strapShape(S, J) { return strapParts(S, J).cloth; }
