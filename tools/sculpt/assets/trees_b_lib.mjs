// trees_b_lib — shared helper of the dusk-forest trees maple_a, maple_b, ginkgo_a, willow_a. Not an asset itself.
// Driver and the generic helpers (bunion, limb, bough, plates, zig, floor0, crownValue) started as a copy of
// trees_a_lib.mjs (the first tree set) so that set's later edits cannot change these builds; the dusk shapes are new:
//  - layer(): a maple canopy layer — a flat low cloud of overlapping lobes, domed lit top, flat shaded underside,
//    scalloped leafy rim;  - fan(): a ginkgo fan mass — a thick, slightly cupped sector with a notched, scalloped rim;
//  - ribbon(): a willow curtain — a hanging tapered ribbon of leaf mass with a serrated edge.
// Materials: any material key starting with 'crown' is a crown (tint) material; the others are wood (mul).
// COLOR_0 RGBA: rgb as the kit writes it; a = def.alpha(info) if the asset gives one (willow: hang weight for the wind),
// else the top-facing snow mask of trees_a.
//
//   SCULPT_THREADS=2 node tools/sculpt/assets/trees_b_lib.mjs tools/sculpt/assets/<name>.mjs [--quick]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../sdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');
export const FAR = () => process.env.TREESB_FAR === '1';
/** the LOD1 field (def.midFrom): simpler shapes that decimate cleanly (one lace per shelf, rounder rims) */
export const MID = () => process.env.TREESB_MID === '1';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ss = P.ss, mix = P.mix, C = P.color;

// ===================================================================================================== shape helpers
/** balanced union of many shapes (k > 0: smooth). Splits along the widest axis of the centres -> the bbox skip prunes. */
export function bunion(list, k = 0) {
  list = list.filter(Boolean);
  if (list.length === 1) return list[0];
  const cen = (s) => [(s.b[0] + s.b[3]) / 2, (s.b[1] + s.b[4]) / 2, (s.b[2] + s.b[5]) / 2];
  const cs = list.map(cen), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const c of cs) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], c[a]); hi[a] = Math.max(hi[a], c[a]); }
  let ax = 0; for (let a = 1; a < 3; a++) if (hi[a] - lo[a] > hi[ax] - lo[ax]) ax = a;
  const ord = list.map((s, i) => [cs[i][ax], s]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const h = ord.length >> 1, A = bunion(ord.slice(0, h), k), B = bunion(ord.slice(h), k);
  return k > 0 ? P.softUnion(k, A, B) : P.union(A, B);
}

/** a limb along points, radius r0 at the base tapering to r1 (pow < 1 keeps it thick longer) */
export function limb(pts, r0, r1, pow = 0.85) { return P.tube(pts, (t) => r1 + (r0 - r1) * Math.pow(1 - t, pow)); }

/** a bough path: from `a`, heading yaw (deg, 0 = +Z, 90 = +X) and pitch (deg up), `len` m, bending by `droop` (m down at
 *  the middle) and `lift` (m up at the end), with a sideways elbow `kink` (m) — returns 5 points */
export function bough(a, yaw, pitch, len, { droop = 0, lift = 0, kink = 0, seed = 1 } = {}) {
  const r = P.prng(seed), y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  const d = [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)], s = [Math.cos(y), 0, -Math.sin(y)];
  const out = [a.slice()];
  for (const t of [0.25, 0.5, 0.75, 1]) {
    const k = kink * Math.sin(t * Math.PI) * (r() < 0.5 ? 1 : -1) * (0.6 + 0.4 * r());
    const dv = -droop * Math.sin(t * Math.PI) + lift * t * t;
    out.push([a[0] + d[0] * len * t + s[0] * k, a[1] + d[1] * len * t + dv, a[2] + d[2] * len * t + s[2] * k]);
  }
  return out;
}

/**
 * Plated / ridged bark on a wood shape: grooves along the walls of a stretched cell pattern (plates `w` wide, `h` tall),
 * `depth` deep, only where `where(x,y,z)` > 0 (0..1). Displacement inward only (plates stay on the old surface).
 */
export function plates(shape, { w = 0.3, h = 0.6, depth = 0.025, groove = 0.25, seed = 1, where = null }) {
  const f = shape.f;
  return new P.Shape((x, y, z) => {
    const d = f(x, y, z);
    if (d > depth * 3 + 0.02 || d < -depth * 4) return d;
    const m = where ? where(x, y, z) : 1;
    if (m <= 0) return d;
    const e = P.cellular(x / w, y / h, z / w, seed, true);          // distance to the cell wall (0 on the wall)
    const g = Math.max(0, 1 - e / groove);
    return d + depth * m * g * g;
  }, shape.b, shape.pf, shape.lip + depth / (w * groove) * 1.5);
}

/**
 * Blossom / leaf clump: a core ellipsoid plus `lobes` sub-masses on its upper and outer shell (scalloped outline), a
 * flatter underside, and a leafy skin (bumps ~r*0.22 across, amp r*skin). c = centre, r = radius, out = unit direction
 * away from the tree's crown centre (lobes favour it). One custom field (cheap).
 */
export function clump(c, r, { seed = 1, lobes = 7, flat = 0.72, under = 0.5, skin = 0.07, out = [0, 1, 0], k = 0.35, far = false } = {}) {
  const rnd = P.prng(seed * 977 + 13), L = [];
  const o = P.norm(out);
  for (let i = 0; i < lobes; i++) {
    const a = i * 2.39996 + rnd() * 0.8, yy = 0.15 + 0.75 * rnd(), rr = Math.sqrt(1 - yy * yy);
    let d = P.norm([Math.cos(a) * rr + o[0] * 0.6, yy * 0.9 + o[1] * 0.3, Math.sin(a) * rr + o[2] * 0.6]);
    const lr = r * (0.38 + 0.22 * rnd()), dist = r - lr * (0.55 + 0.25 * rnd());
    L.push([c[0] + d[0] * dist, c[1] + d[1] * dist * flat, c[2] + d[2] * dist, lr]);
  }
  const ry = r * flat * 0.8, cr = r * 0.72, kk = r * k, amp = far ? 0 : r * skin, fr = 1 / Math.max(0.22, r * 0.3), yb = c[1] - r * flat * under;
  const sd = seed * 7 + 3;
  const f = (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const k0 = Math.hypot(px / cr, py / ry, pz / cr), k1 = Math.hypot(px / (cr * cr), py / (ry * ry), pz / (cr * cr));
    let d = k1 < 1e-9 ? -ry : (k0 * (k0 - 1)) / k1;
    for (let i = 0; i < L.length; i++) { const l = L[i]; d = P.smin(d, Math.hypot(x - l[0], y - l[1], z - l[2]) - l[3], kk); }
    // underside: a soft flat cut (the clump hangs a little under its own weight; not a hard plate)
    const cut = yb - y - (far ? 0 : r * 0.08 * P.noise3(x * fr * 0.6, 0, z * fr * 0.6, sd));
    d = -P.smin(-d, -cut, r * 0.3);
    if (amp > 0 && d < amp * 2.5 && d > -amp * 3) {
      // leafy skin: cell bumps (each a little rosette of blossom / leaves), stronger on top and outside
      // (fades out on the underside: the cushions read smooth and shaded below, broken and leafy on top and rim)
      const e = P.cellular(x * fr, y * fr, z * fr, sd), up = clamp((y - yb) / (r * flat), 0.25, 1);
      d -= amp * up * (0.55 - e * 1.1);
    }
    return d;
  };
  const R = r * 1.25;
  return new P.Shape(f, [c[0] - R, c[1] - R, c[2] - R, c[0] + R, c[1] + R, c[2] + R], null, 1.5);
}

/**
 * Needle pad of a painted pine: a flat layered cloud. c = centre of the pad's mid-plane, rx/rz = half extents (along
 * yaw / across), th = thickness. A domed top made of `lobes` flattened masses (scalloped in plan), a flat underside at
 * c.y - th*0.3 with ragged hanging tufts toward the rim, a soft needle skin on the top.
 */
export function pad(c, { rx, rz, th, yaw = 0, seed = 1, lobes = 5, tuft = 0.22, skin = 0.035, far = false }) {
  const rnd = P.prng(seed * 131 + 7), L = [];
  const cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180);
  // lobes laid along the pad's long axis and around it (plan outline = a few round bulges)
  for (let i = 0; i < lobes; i++) {
    const t = lobes === 1 ? 0 : (i / (lobes - 1)) * 2 - 1, side = (rnd() - 0.5) * 1.1;
    const lx = t * rx * 0.55, lz = side * rz * 0.45;
    const lr = Math.min(rx, rz) * (0.5 + 0.25 * rnd()) * (1 - 0.25 * Math.abs(t));
    L.push([lx, (rnd() - 0.3) * th * 0.25, lz, lr, th * (0.42 + 0.2 * rnd())]);
  }
  const yb = -th * 0.3, sd = seed * 5 + 1, fr = 1 / Math.max(0.18, Math.min(rx, rz) * 0.28);
  const f = (x, y, z) => {
    const qx = x - c[0], qy = y - c[1], qz = z - c[2];
    const u = qx * sy + qz * cy, w = qx * cy - qz * sy;         // u along the pad (yaw dir), w across
    // core: a flattened ellipsoid
    const ax = rx * 0.78, az = rz * 0.78, ay = th * 0.5;
    const k0 = Math.hypot(u / ax, qy / ay, w / az), k1 = Math.hypot(u / (ax * ax), qy / (ay * ay), w / (az * az));
    let d = k1 < 1e-9 ? -ay : (k0 * (k0 - 1)) / k1;
    for (let i = 0; i < L.length; i++) {
      const l = L[i], ex = u - l[0], ey = qy - l[1], ez = w - l[2];
      const a0 = Math.hypot(ex / l[3], ey / l[4], ez / l[3]), a1 = Math.hypot(ex / (l[3] * l[3]), ey / (l[4] * l[4]), ez / (l[3] * l[3]));
      d = P.smin(d, a1 < 1e-9 ? -l[4] : (a0 * (a0 - 1)) / a1, th * 0.45);
    }
    // underside: flat, with tufts hanging toward the rim
    const rim = clamp(Math.hypot(u / rx, w / rz) * 1.25 - 0.35, 0, 1);
    let hang = 0;
    if (!far) { const e = P.cellular(u * fr * 1.6, 0, w * fr * 1.6, sd); hang = th * tuft * 2.2 * Math.max(0, 1 - e * 1.8) * rim; }
    const cut = (yb - hang) - qy;
    d = Math.max(d, cut);
    if (!far && d < 0.08 && d > -0.08 && qy > yb * 0.5) d -= th * skin * 2 * (0.5 - P.cellular(x * fr * 2.2, y * fr * 2.2, z * fr * 2.2, sd + 1));
    return d;
  };
  const R = Math.max(rx, rz) * 1.15;
  return new P.Shape(f, [c[0] - R, c[1] - th * 1.6, c[2] - R, c[0] + R, c[1] + th * 1.2, c[2] + R], null, 2.2);
}

/** a bough that zig-zags: each interior span gets an elbow pushed sideways by up to `amp` (x span length), seeded */
export function zig(pts, amp = 0.18, seed = 1) {
  const r = P.prng(seed * 53 + 1), out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d);
    const s = P.norm(P.cross(d, [r() - 0.5, r() - 0.5, r() - 0.5]));
    const k = amp * l * (r() < 0.5 ? -1 : 1) * (0.5 + 0.5 * r());
    out.push([a[0] + d[0] * 0.5 + s[0] * k, a[1] + d[1] * 0.5 + s[1] * k * 0.5, a[2] + d[2] * 0.5 + s[2] * k], b);
  }
  return out;
}

/**
 * A blossom cloud: one main clump plus `sat` smaller ones hung round its outer / lower rim (the outline scallops at two
 * scales, the underside steps). `out` = direction away from the crown centre. Returns { shapes, twigs } — twigs are
 * short limbs from the cloud's foot into its satellites (the fine branching seen from below).
 */
export function cloud(c, r, { seed = 1, out = [0, 1, 0], sat = 3, far = false, flat = 0.6, skin = 0.06, foot = null } = {}) {
  const rnd = P.prng(seed * 71 + 5), o = P.norm([out[0], 0, out[2]]);
  const shapes = [clump(c, r, { seed, lobes: far ? 4 : 8, out, far, flat, under: 0.55, skin })], twigs = [];
  for (let i = 0; i < (far ? Math.min(1, sat) : sat); i++) {
    const a = Math.atan2(o[0], o[2]) + (i - (sat - 1) / 2) * 1.25 + (rnd() - 0.5) * 0.6;
    const rr = r * (0.5 + 0.18 * rnd()), dist = r * (0.95 + 0.25 * rnd());
    const sc = [c[0] + Math.sin(a) * dist, c[1] - r * (0.25 + 0.35 * rnd()), c[2] + Math.cos(a) * dist];
    shapes.push(clump(sc, rr, { seed: seed * 10 + i, lobes: far ? 3 : 6, out: [Math.sin(a), 0.3, Math.cos(a)], far, flat: flat * 0.95, under: 0.5, skin }));
    if (foot) twigs.push([[foot[0], foot[1], foot[2]], [(foot[0] + sc[0]) / 2, (foot[1] + sc[1]) / 2 - 0.1, (foot[2] + sc[2]) / 2], sc]);
  }
  return { shapes, twigs };
}

// ----------------------------------------------------------------------------------------------- dusk-forest shapes
const ell = (x, y, z, a, b, c) => { const k0 = Math.hypot(x / a, y / b, z / c), k1 = Math.hypot(x / (a * a), y / (b * b), z / (c * c)); return k1 < 1e-9 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1; };

/**
 * Maple canopy layer: a flat low cloud. c = centre of the layer's underside plane + th*0.35, rx / rz = half extents in
 * plan (rx along yaw), th = thickness at the middle. `lobes` flattened masses inside the plan ellipse (the outline is a
 * row of round bulges with notches between them), the middle domed up, a flat shaded underside that sags a little,
 * a leafy skin (pointed cells) on the top and rim. `open` (0..1) hollows the middle from below (vase crowns).
 */
export function layer(c, { rx, rz, th, yaw = 0, seed = 1, lobes = 8, skin = 0.12, far = false, sag = 0.15, tilt = [0, 0], open = 0 }) {
  const rnd = P.prng(seed * 313 + 11), L = [];
  const cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180);
  const n = far ? Math.max(3, Math.round(lobes * 0.5)) : lobes;
  for (let i = 0; i < n; i++) {
    // rim lobes on a jittered ring, a few inner ones: outline = bulges + notches
    const rim = i < n * 0.72, a = i * 2.39996 + rnd() * 0.7, rr = rim ? 0.62 + 0.18 * rnd() : 0.25 * rnd();
    const lx = Math.cos(a) * rx * rr, lz = Math.sin(a) * rz * rr;
    const lr = Math.min(rx, rz) * (rim ? 0.36 + 0.16 * rnd() : 0.5 + 0.15 * rnd());
    const dome = 1 - (rr * rr);
    L.push([lx, th * (0.05 + 0.32 * dome) + (rnd() - 0.5) * th * 0.15, lz, lr, th * (0.38 + 0.18 * dome + 0.1 * rnd())]);
  }
  const yb = -th * 0.35, sd = seed * 5 + 1, amp = far ? 0 : th * skin, fr = 1 / Math.max(0.16, th * 0.42);
  const k = th * 0.42;
  const f = (x, y, z) => {
    const qx = x - c[0], qz = z - c[2];
    const qy = y - c[1] - tilt[0] * qx - tilt[1] * qz;
    const u = qx * cy + qz * sy, w = -qx * sy + qz * cy;
    let d = ell(u, qy - th * 0.08, w, rx * 0.66, th * 0.42, rz * 0.66);
    for (let i = 0; i < L.length; i++) { const l = L[i]; d = P.smin(d, ell(u - l[0], qy - l[1], w - l[2], l[3], l[4], l[3]), k); }
    // underside: flat, sagging a little toward the middle, softly joined
    const rho = Math.min(1, Math.hypot(u / rx, w / rz));
    let cut = (yb - sag * th * (1 - rho * rho)) - qy;
    if (!far) cut -= th * 0.1 * P.noise3(u * fr * 0.5, 0, w * fr * 0.5, sd);
    d = -P.smin(-d, -cut, th * 0.22);
    if (open > 0) d = -P.smin(-d, ell(u, qy + th * 0.35, w, rx * 0.42 * open, th * 0.7, rz * 0.42 * open), th * 0.3);
    if (amp > 0 && d < amp * 2.5 && d > -amp * 3) {
      const up = clamp((qy - yb) / th + 0.15, 0.2, 1), e = P.cellular(x * fr, y * fr * 1.3, z * fr, sd);
      d -= amp * up * (0.5 - e * 1.15);
    }
    return d;
  };
  const R = Math.max(rx, rz) * 1.15;
  return new P.Shape(f, [c[0] - R, c[1] - th * 1.4, c[2] - R, c[0] + R, c[1] + th * 1.5 + R * Math.max(Math.abs(tilt[0]), Math.abs(tilt[1])), c[2] + R], null, 1.6);
}

/**
 * Ginkgo fan mass: grows from `base` along `dir` (outward-up), a sector `spread` degrees either side, radius r,
 * thickness th; slightly cupped (the rim rises by `cup` x r), a notch in the middle of the rim (the ginkgo leaf's
 * split) and scallops along it; thin at the stalk, thick in the body, thinner at the rim; leafy skin on top / rim.
 */
export function fan(base, dir, { r, th, spread = 55, seed = 1, cup = 0.18, notch = 0.16, roll = 0, far = false, skin = 0.14 }) {
  const rnd = P.prng(seed * 97 + 3), ph = rnd() * 6.28, sc = 5 + Math.floor(rnd() * 3);
  const u = P.norm(dir);
  let v = P.cross(u, [0, 1, 0]); if (Math.hypot(...v) < 0.2) v = P.cross(u, [1, 0, 0]); v = P.norm(v);
  let w = P.norm(P.cross(v, u));
  if (roll) { const a = roll * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a); const v2 = v.map((q, i) => q * ca + w[i] * sa), w2 = w.map((q, i) => -v[i] * sa + q * ca); v = v2; w = w2; }
  const spr = spread * Math.PI / 180, rr = th * 0.32, sd = seed * 3 + 7, amp = far ? 0 : th * skin, fr = 1 / Math.max(0.12, th * 0.55);
  const f = (x, y, z) => {
    const px = x - base[0], py = y - base[1], pz = z - base[2];
    const pu = px * u[0] + py * u[1] + pz * u[2], pv = px * v[0] + py * v[1] + pz * v[2];
    let pw = px * w[0] + py * w[1] + pz * w[2];
    const rho = Math.hypot(pu, pv), ang = Math.atan2(pv, pu);
    const t = Math.min(1, rho / r);
    pw -= cup * r * t * t;
    let R = r * (1 + (far ? 0 : 0.06 * Math.sin(ang * sc * 2 + ph)) - notch * Math.exp(-((ang / 0.16) ** 2)));
    const dr = rho - R;
    const ex = Math.abs(ang) - spr;
    const da = ex > Math.PI / 2 ? rho : rho * Math.sin(ex);
    const half = th * 0.5 * (0.35 + 0.65 * ss(0, 0.45, t)) * (1 - 0.35 * t * t);
    const dw = Math.abs(pw) - half;
    const q0 = dr + rr, q1 = da + rr, q2 = dw + rr * 0.6;
    let d = Math.hypot(Math.max(q0, 0), Math.max(q1, 0), Math.max(q2, 0)) + Math.min(Math.max(q0, q1, q2), 0) - rr;
    if (amp > 0 && d < amp * 2.5 && d > -amp * 3) {
      const top = clamp(0.4 + (pw > 0 ? 0.6 : 0) + 0.5 * t, 0, 1), e = P.cellular(x * fr, y * fr, z * fr, sd);
      d -= amp * top * (0.5 - e * 1.15);
    }
    return d;
  };
  const B = r * 1.25 + th;
  return new P.Shape(f, [base[0] - B, base[1] - B, base[2] - B, base[0] + B, base[1] + B, base[2] + B], null, 1.7);
}

/**
 * Willow curtain: a ribbon of leaf mass hanging from `top`, `len` long, `w` wide at the top tapering to w*(1-taper),
 * `t` thick (keep >= 3 voxels), facing `out` (horizontal; the thin axis). It bows out by `bow` m and sways sideways by
 * `sway`; its edges are serrated (leaf tufts every ~`tooth` m).
 */
export function ribbon(top, { len, w, t, out, bow = 0.25, sway = 0.12, taper = 0.7, seed = 1, tooth = 0.24, far = false }) {
  const rnd = P.prng(seed * 41 + 9), ph = rnd() * 6.28, ph2 = rnd() * 6.28;
  const o = P.norm([out[0], 0, out[2]]), sd = [-o[2], 0, o[0]];
  const N = 8, pts = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, b = bow * Math.sin(Math.PI * s * 0.75), sw = sway * Math.sin(s * Math.PI * 1.3 + ph);
    pts.push([top[0] + o[0] * b + sd[0] * sw, top[1] - len * s, top[2] + o[2] * b + sd[2] * sw]);
  }
  const segs = []; let total = 0;
  for (let i = 0; i < N; i++) { const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); segs.push([a, b, l, total]); total += l; }
  const f = (x, y, z) => {
    let best = 1e9;
    for (let i = 0; i < N; i++) {
      const [a, b, l, s0] = segs[i];
      const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const h = clamp((px * bx + py * by + pz * bz) / (l * l), 0, 1);
      const qx = px - bx * h, qy = py - by * h, qz = pz - bz * h;
      const s = (s0 + h * l) / total;
      let hw = 0.5 * w * (1 - taper * Math.pow(s, 1.2));
      if (!far && tooth > 0) hw *= 1 + 0.2 * Math.sin(s * len / tooth * 6.283 + ph2) * ss(0.05, 0.25, s);
      if (tooth === 0) hw *= 0.55 + 0.45 * ss(0, 0.14, s);            // smooth strand: a soft neck where it leaves the twig
      // elliptic section: half-width hw (tapering, toothed), half-thickness ht that thins only to 60 % (no torn tips)
      const ht = Math.min(hw, 0.5 * t * (1 - 0.4 * s));
      const qn = qx * o[0] + qz * o[2];
      const qs = Math.hypot(qx - qn * o[0], qy, qz - qn * o[2]);
      const d = (Math.hypot(qn / ht, qs / hw) - 1) * ht;
      if (d < best) best = d;
    }
    return best;
  };
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9], m = w * 0.8 + 0.05;
  for (const p of pts) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], p[k] - m); bb[k + 3] = Math.max(bb[k + 3], p[k] + m); }
  return new P.Shape(f, bb, null, 1.3);
}

// ------------------------------------------------------------------------------------- revision A shapes (REVIEW_A)
const smax = (a, b, k) => -P.smin(-a, -b, k);

/**
 * Maple lace layer (replaces layer() for the maples): a THIN umbrella of foliage, not a pad. c = centre of the layer,
 * rx / rz = half extents (rx along yaw), th = thickness at the middle (rim ~0.4 th). Plan outline: a star of `points`
 * (5-8) unequal pointed lobes with rounded notches between them (momiji, not cushion). Top: a low three-faced roof
 * (2-3 big planes, no fine noise); underside flat; the rim droops by `droop` m; `holes` small punch-throughs where the
 * sky and the branches show. `far`: a single rounded convex blob instead (LOD2: no plates, no spikes).
 */
export function lace(c, { rx, rz, th, yaw = 0, seed = 1, points = 6, sharp = 0.3, holes = 1, droop = 0.22, tilt = [0, 0], far = false, mid = false }) {
  if (mid) { th *= 1.35; rx *= 1.06; rz *= 1.06; points = Math.min(points, 6); sharp *= 0.7; holes = 0; }
  const rnd = P.prng(seed * 211 + 5);
  const cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180);
  if (far) {
    const ax = rx * 0.8, az = rz * 0.8, ay = Math.max(th * 1.5, Math.min(rx, rz) * 0.3);
    const f = (x, y, z) => {
      const qx = x - c[0], qz = z - c[2], qy = y - c[1] - tilt[0] * qx - tilt[1] * qz + droop * 0.3;
      const u = qx * cy + qz * sy, w = -qx * sy + qz * cy;
      return ell(u, qy, w, ax, ay, az);
    };
    const R = Math.max(rx, rz);
    return new P.Shape(f, [c[0] - R, c[1] - th * 2 - R * 0.3, c[2] - R, c[0] + R, c[1] + th * 2 + R * 0.3, c[2] + R], null, 1.5);
  }
  const ph = rnd() * 6.283, j2 = rnd() * 6.283, j3 = rnd() * 6.283, roof = [rnd() * 6.283];
  roof.push(roof[0] + 2.0 + rnd() * 0.4, roof[0] + 4.1 + rnd() * 0.4);
  const H = [];
  for (let i = 0; i < holes; i++) { const a = rnd() * 6.283, r = 0.38 + 0.22 * rnd(); H.push([Math.cos(a) * r, Math.sin(a) * r, 0.11 + 0.06 * rnd()]); }
  const rm = Math.min(rx, rz), k = th * 0.22;
  const f = (x, y, z) => {
    const qx = x - c[0], qz = z - c[2];
    const u = qx * cy + qz * sy, w = -qx * sy + qz * cy;
    const nu = u / rx, nw = w / rz, rho = Math.hypot(nu, nw), th0 = Math.atan2(nw, nu);
    // star outline: sharp points, rounded notches, unequal lengths
    const star = Math.pow(Math.abs(Math.sin(points * (th0 + ph) / 2)), 0.85);
    const Rn = (1 - sharp * star) * (1 + 0.1 * Math.sin(2 * th0 + j2) + 0.07 * Math.sin(3 * th0 + j3));
    const dPlan = (rho - Rn) * rm * 0.85;
    // vertical: drooping rim, a three-plane roof over a flat underside
    const qy = y - c[1] - tilt[0] * qx - tilt[1] * qz + droop * rho * rho;
    let sm = 0; for (const a of roof) sm += Math.exp(6 * rho * Math.cos(th0 - a));
    const ridge = Math.log(sm / 3) / 6;                     // soft max of the three plane directions
    const ytop = th * (0.62 - 0.42 * Math.max(0, ridge)) - th * 0.08 * rho;
    const ybot = -th * 0.26 + th * 0.18 * rho * rho;
    let d = smax(smax(dPlan, qy - ytop, k), ybot - qy, k);
    for (const h of H) d = smax(d, (h[2] - Math.hypot(nu - h[0], nw - h[1])) * rm * 0.85, k * 0.6);
    return d;
  };
  const R = Math.max(rx, rz) * 1.2;
  return new P.Shape(f, [c[0] - R, c[1] - th - droop - R * 0.3, c[2] - R, c[0] + R, c[1] + th * 1.2 + R * 0.3, c[2] + R], null, 2.4);
}

/**
 * Ginkgo soft fan (replaces fan() clumps): a ROUNDED mass whose outer edge opens into `lobes` (2-3) fan-shaped lobes,
 * each a thin sector with a scalloped rim and the ginkgo notch; all smooth-joined (no internal creases, no skin noise).
 * `far`: one rounded blob.
 */
export function softFan(base, dir, { r, th, lobes = 3, seed = 1, cup = 0.16, far = false }) {
  const rnd = P.prng(seed * 59 + 2);
  const u = P.norm(dir);
  let v = P.cross(u, [0, 1, 0]); if (Math.hypot(...v) < 0.2) v = P.cross(u, [1, 0, 0]); v = P.norm(v);
  const w = P.norm(P.cross(v, u));
  const cc = [base[0] + u[0] * r * 0.42, base[1] + u[1] * r * 0.42, base[2] + u[2] * r * 0.42];
  const core = (ax, ay, az) => (x, y, z) => {
    const px = x - cc[0], py = y - cc[1], pz = z - cc[2];
    return ell(px * u[0] + py * u[1] + pz * u[2], px * w[0] + py * w[1] + pz * w[2], px * v[0] + py * v[1] + pz * v[2], ax, ay, az);
  };
  if (far) {
    const f = core(r * 0.62, th * 0.95, r * 0.62);
    return new P.Shape(f, [cc[0] - r, cc[1] - r, cc[2] - r, cc[0] + r, cc[1] + r, cc[2] + r], null, 1.5);
  }
  const fc = core(r * 0.4, th * 0.6, r * 0.46), L = [];
  for (let i = 0; i < lobes; i++) {
    const a = ((i - (lobes - 1) / 2) * 0.72 + (rnd() - 0.5) * 0.25), ca = Math.cos(a), sa = Math.sin(a);
    const d = [u[0] * ca + v[0] * sa + w[0] * 0.12, u[1] * ca + v[1] * sa + w[1] * 0.12, u[2] * ca + v[2] * sa + w[2] * 0.12];
    L.push(fan(base, d, { r: r * (0.95 + 0.2 * rnd()), th: th * 0.5, spread: 30 + rnd() * 8, seed: seed * 5 + i, cup, notch: 0.12, skin: 0, far: false }));
  }
  const kk = th * 0.5;
  const f = (x, y, z) => { let d = fc(x, y, z); for (const l of L) d = P.smin(d, l.f(x, y, z), kk); return d; };
  const B = r * 1.35 + th;
  return new P.Shape(f, [base[0] - B, base[1] - B, base[2] - B, base[0] + B, base[1] + B, base[2] + B], null, 1.8);
}

/** hard floor at y = 0 (roots buried) */
export function floor0(s) { const f = s.f; return new P.Shape((x, y, z) => Math.max(f(x, y, z), -y - 0.0), [s.b[0], -0.05, s.b[2], s.b[3], s.b[4], s.b[5]], s.pf, s.lip); }

// ===================================================================================================== paint helpers
/**
 * Crown value (grey): bright on top and outside, darker toward the crown core and on the underside (the AO gradient
 * into the crown the game's flat tint cannot make); `cen` = crown centre, `R` = crown radius, `ry` vertical radius.
 * The game keeps only this light/dark story (normalised to mean 0.85) and multiplies the land tint.
 */
export function crownValue(c, { cen, R, ry, lo = 0.5, hi = 1.0, seed = 1 }) {
  const { x, y, z, ny, ao, cavity, edge } = c;
  const dx = (x - cen[0]) / R, dy = (y - cen[1]) / ry, dz = (z - cen[2]) / R;
  const out = clamp(Math.hypot(dx, dy, dz), 0, 1.2);
  let v = lo + (hi - lo) * (0.45 * ss(0.25, 1.0, out) + 0.4 * ss(-0.5, 0.8, ny) + 0.15 * ss(-0.6, 0.9, dy));
  v *= 0.82 + 0.18 * ao;
  v += 0.08 * edge - 0.12 * cavity;
  v += 0.03 * P.fbm(x * 0.7, y * 0.7, z * 0.7, seed, 2);
  return v;
}

// ===================================================================================================== build driver
async function main() {
  const args = process.argv.slice(2);
  const assetPath = args.find((a) => a.endsWith('.mjs'));
  const quick = args.includes('--quick');
  const { loadModel } = await import('../model.mjs');
  const { Pool } = await import('../pool.mjs');
  const { PARTS } = await import('../sdf.mjs');
  const { extract, simplify, splitNormals, checkMesh } = await import('../mesh.mjs');
  const { bakeVertexColors } = await import('../bake.mjs');
  const { faceTags } = await import('../build.mjs');
  const R = await import('../preview.mjs');
  const T0 = Date.now();
  delete process.env.TREESB_FAR; delete process.env.TREESB_MID;
  const M = await loadModel(assetPath);
  const cfg = M.cfg, def = M.def, name = def.name;
  if (quick) cfg.voxel *= 1.5;
  const outDir = path.join(ROOT, '.tmp', 'sculpt', name); fs.mkdirSync(outDir, { recursive: true });
  const glbDir = path.join(ROOT, 'assets', 'models', 'sculpt'); fs.mkdirSync(glbDir, { recursive: true });
  const pool = new Pool(assetPath);
  let far = null, mid = null;
  console.log(`trees ${name}: ${pool.size} workers, voxel ${(cfg.voxel * 1000).toFixed(1)} mm, bounds ${M.bounds.map((v) => v.toFixed(2)).join(' ')}`);
  try {
    const full = await extract(M, pool, cfg.voxel, console.log);
    const tags = await faceTags(pool, full.pos, full.idx);
    const fb = checkMesh(full.pos, full.idx).bounds, diag = Math.hypot(fb[3] - fb[0], fb[4] - fb[1], fb[5] - fb[2]);
    const errs = cfg.lodError || [0.004, 0.012, 0.03].map((k) => k * diag);
    const lods = [];
    let src = { pos: full.pos, idx: full.idx, tag: tags.part };
    for (const [li, target] of cfg.lods.entries()) {
      if (def.midFrom != null && li === def.midFrom) {
        process.env.TREESB_MID = '1';
        const M2 = await loadModel(assetPath); const pool2 = new Pool(assetPath);
        const full2 = await extract(M2, pool2, cfg.voxel * (def.midVoxel || 1.5), console.log);
        const tags2 = await faceTags(pool2, full2.pos, full2.idx);
        mid = { M: M2, pool: pool2 }; src = { pos: full2.pos, idx: full2.idx, tag: tags2.part };
        delete process.env.TREESB_MID;
      }
      if (def.farFrom != null && li === def.farFrom) {
        process.env.TREESB_FAR = '1';
        const M2 = await loadModel(assetPath); const pool2 = new Pool(assetPath);
        const full2 = await extract(M2, pool2, cfg.voxel * (def.farVoxel || 2.5), console.log);
        const tags2 = await faceTags(pool2, full2.pos, full2.idx);
        far = { M: M2, pool: pool2 }; src = { pos: full2.pos, idx: full2.idx, tag: tags2.part };
        delete process.env.TREESB_FAR;
      }
      const s = simplify(src.pos, src.idx, target, { faceTag: src.tag, hardAngle: cfg.hardAngle ?? 60, maxError: errs[li] ?? Infinity, ...(cfg.lodTurn?.[li] != null ? { maxNormalTurn: cfg.lodTurn[li] } : {}) });
      const cb = checkMesh(s.pos, s.idx).bounds, drift = Math.max(...cb.map((v, k) => Math.abs(v - fb[k])));
      console.log(`  LOD${li}: ${s.idx.length / 3} tris (target ${target}), bbox drift ${(drift * 1000).toFixed(0)} mm`);
      s.far = li >= (def.farFrom ?? 99) ? far : li >= (def.midFrom ?? 99) ? mid : null;
      s.isFar = li >= (def.farFrom ?? 99);
      lods.push(s); src = s;
    }
    const out = [];
    for (const L of lods) {
      // far LOD: smooth normals (REVIEW_A: LOD2 shards come partly from flat-shaded facets on 30-tri blobs)
      const sn = splitNormals(L.pos, L.idx, L.isFar ? (def.farCrease ?? cfg.creaseAngle) : cfg.creaseAngle, { faceTag: L.tag });
      // border vertices: sample each copy a little inside its own faces (see _smallprops.mjs)
      const nv = sn.pos.length / 3, tagsOf = new Map();
      for (let f = 0; f < sn.idx.length / 3; f++) for (let k = 0; k < 3; k++) { const s = sn.src[sn.idx[f * 3 + k]]; let t = tagsOf.get(s); if (!t) tagsOf.set(s, (t = new Set())); t.add(L.tag[f]); }
      const at = Float32Array.from(sn.pos), acc = new Float32Array(nv * 4), vtag = new Int16Array(nv).fill(-1);
      for (let f = 0; f < sn.idx.length / 3; f++) {
        const ia = sn.idx[f * 3], ib = sn.idx[f * 3 + 1], ic = sn.idx[f * 3 + 2];
        for (const v of [ia, ib, ic]) {
          vtag[v] = L.tag[f];
          if (tagsOf.get(sn.src[v]).size < 2) continue;
          for (let k = 0; k < 3; k++) acc[v * 4 + k] += (sn.pos[ia * 3 + k] + sn.pos[ib * 3 + k] + sn.pos[ic * 3 + k]) / 3;
          acc[v * 4 + 3]++;
        }
      }
      for (let v = 0; v < nv; v++) if (acc[v * 4 + 3]) for (let k = 0; k < 3; k++) at[v * 3 + k] = 0.35 * sn.pos[v * 3 + k] + 0.65 * acc[v * 4 + k] / acc[v * 4 + 3];
      const MM = L.far ? L.far.M : M;
      const vc = await bakeVertexColors(L.far ? L.far.pool : pool, at, MM);
      // alpha: the top-facing snow mask (crown tops, bough tops), from the field normal at the sample
      const col = new Float32Array(nv * 4);
      for (let v = 0; v < nv; v++) {
        for (let k = 0; k < 3; k++) col[v * 4 + k] = vc.col[v * 3 + k];
        const ny = vc.raw[v * 8 + 4], px = sn.pos[v * 3], py = sn.pos[v * 3 + 1], pz = sn.pos[v * 3 + 2];
        const pm = PARTS[vtag[v]]?.mat || '', isCrown = pm.startsWith('crown');
        const n = 0.25 * P.fbm(px * 1.3, py * 1.3, pz * 1.3, 17, 2);
        col[v * 4 + 3] = def.alpha ? clamp(def.alpha({ x: px, y: py, z: pz, ny, ao: vc.raw[v * 8 + 6], mat: pm, part: PARTS[vtag[v]]?.name }), 0, 1) : isCrown ? clamp(ss(0.3, 0.8, ny + n) * (0.6 + 0.4 * vc.raw[v * 8 + 6]), 0, 1) : clamp(ss(0.72, 0.95, ny + n) * 0.8 * ss(1.2, 2.5, py), 0, 1);
      }
      out.push({ pos: sn.pos, nrm: sn.nrm, idx: sn.idx, col, tag: L.tag, vpart: vc.part });
    }
    const glb = path.join(glbDir, name + '.glb');
    const bytes = await writeTreeGLB(glb, { name, lods: out, parts: PARTS, materials: cfg.materials, anchors: def.anchors || {}, extras: { author: 'sculpted for this project', lods: out.map((o, i) => ({ lod: i, tris: o.idx.length / 3 })), voxel: cfg.voxel, colour: 'COLOR_0 RGBA: rgb = toLin(paint) (kit convention); a = top-facing snow mask', species: def.species || [] } });
    console.log(`  wrote ${path.relative(ROOT, glb)} (${(bytes / 1024).toFixed(0)} KB)`);
    let before = null, beforeBounds = null;
    if (def.replaces) { before = await loadBefore(def.replaces, R); beforeBounds = bboxOf(before); }
    const checks = {
      name, full: checkMesh(full.pos, full.idx), flippedFacesVsField: tags.flips,
      lods: out.map((o, i) => ({ lod: i, target: cfg.lods[i], ...checkMesh(lods[i].pos, lods[i].idx), vertsWritten: o.pos.length / 3, parts: [...new Set(Array.from(lods[i].tag).map((t) => PARTS[t]?.name))] })),
      fileKB: Math.round(bytes / 1024), vertexColourOnly: true,
    };
    const b = checks.lods[0].bounds;
    checks.measure = measure(out[0], PARTS);
    if (beforeBounds) checks.vsReplaced = { replaced: def.replaces.file, before: beforeBounds.map((v) => +v.toFixed(2)), after: b.map((v) => +v.toFixed(2)), sizeBefore: sizeOf(beforeBounds), sizeAfter: sizeOf(b) };
    const matNames = Object.values(cfg.materials).map((m) => m.name);
    const frag = { [def.id || 'sculpt_' + name]: {
      file: `models/sculpt/${name}.glb`, type: 'model', license: 'CC0 (original work)', author: 'sculpted for this project',
      source: `tools/sculpt/assets/${name}.mjs (node tools/sculpt/assets/trees_b_lib.mjs)`, scale: 1,
      size: sizeOf(b), tris: checks.lods[0].tris, lods: checks.lods.map((l) => l.tris), materials: matNames,
      mats: Object.fromEntries(Object.values(cfg.materials).map((m) => [m.name, { surface: m.surface, look: m.look || {} }])),
      notes: def.notes || '',
    } };
    fs.writeFileSync(path.join(glbDir, name + '.manifest.json'), JSON.stringify(frag, null, 1) + '\n');
    await sheets({ M, out, before, outDir, quick, R, PARTS });
    checks.buildSeconds = +((Date.now() - T0) / 1000).toFixed(1);
    fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 1));
    console.log(JSON.stringify({ lods: checks.lods.map((l) => [l.tris, l.watertight, l.openEdges, l.nonManifoldEdges]), size: sizeOf(b), before: beforeBounds && sizeOf(beforeBounds), measure: checks.measure, fileKB: checks.fileKB }));
  } finally { await pool.close(); if (far) await far.pool.close().catch(() => {}); if (mid) await mid.pool.close().catch(() => {}); }
  console.log(`done in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
}
const sizeOf = (b) => [+(b[3] - b[0]).toFixed(2), +(b[4] - b[1]).toFixed(2), +(b[5] - b[2]).toFixed(2)];
function bboxOf(meshes) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
  return b;
}
/** trunk radius at chest height (1.2-1.4 m, wood vertices near the axis), crown extents */
function measure(o, PARTS) {
  let r = 0, n = 0; const cb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let v = 0; v < o.pos.length / 3; v++) {
    const x = o.pos[v * 3], y = o.pos[v * 3 + 1], z = o.pos[v * 3 + 2], m = PARTS[o.vpart[v]]?.mat;
    if (m === 'wood' && y > 1.2 && y < 1.4 && Math.hypot(x, z) < 1.2) { r += Math.hypot(x, z); n++; }
    if (m && m.startsWith('crown')) for (let k = 0; k < 3; k++) { cb[k] = Math.min(cb[k], o.pos[v * 3 + k]); cb[k + 3] = Math.max(cb[k + 3], o.pos[v * 3 + k]); }
  }
  return { trunkRChest: n ? +(r / n).toFixed(3) : null, crownBox: cb.map((v) => +v.toFixed(2)), crownR: +(Math.max(cb[3] - cb[0], cb[5] - cb[2]) / 2).toFixed(2) };
}

/** GLB: root <name>, children <name>_LOD0..2, one primitive per material, materials named exactly as cfg.materials[].name,
 *  baseColor white, COLOR_0 VEC4 on every LOD, no textures */
async function writeTreeGLB(file, { name, lods, parts, materials, anchors, extras }) {
  const { Document, NodeIO } = await import('@gltf-transform/core');
  const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene(name);
  const root = doc.createNode(name).setExtras({ sculpt: extras });
  scene.addChild(root);
  const mats = new Map();
  const material = (key) => {
    if (mats.has(key)) return mats.get(key);
    const spec = materials[key];
    const m = doc.createMaterial(spec.name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0)
      .setExtras({ surface: spec.surface, look: spec.look || {}, sculpt: { lod: 'vertex', alpha: 'snow mask, not opacity' } });
    mats.set(key, m); return m;
  };
  lods.forEach((L, li) => {
    const mesh = doc.createMesh(`${name}_LOD${li}`), groups = new Map();
    for (let f = 0; f < L.idx.length / 3; f++) { const key = parts[L.tag[f]]?.mat || 'wood'; let g = groups.get(key); if (!g) groups.set(key, (g = [])); g.push(L.idx[f * 3], L.idx[f * 3 + 1], L.idx[f * 3 + 2]); }
    for (const key of Object.keys(materials)) {
      const ids = groups.get(key); if (!ids) continue;
      const remap = new Map(), Pp = [], N = [], Cc = [], I = [];
      for (const v of ids) {
        let r = remap.get(v);
        if (r === undefined) { r = remap.size; remap.set(v, r); Pp.push(L.pos[v * 3], L.pos[v * 3 + 1], L.pos[v * 3 + 2]); N.push(L.nrm[v * 3], L.nrm[v * 3 + 1], L.nrm[v * 3 + 2]); for (let k = 0; k < 4; k++) Cc.push(L.col[v * 4 + k]); }
        I.push(r);
      }
      mesh.addPrimitive(doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(Pp)).setBuffer(buf))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(N)).setBuffer(buf))
        .setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(Float32Array.from(Cc)).setBuffer(buf))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(remap.size > 65535 ? Uint32Array.from(I) : Uint16Array.from(I)).setBuffer(buf))
        .setMaterial(material(key)));
    }
    root.addChild(doc.createNode(`${name}_LOD${li}`).setMesh(mesh).setExtras({ lod: li, tris: L.idx.length / 3 }));
  });
  for (const [k, p] of Object.entries(anchors)) root.addChild(doc.createNode(k).setTranslation(p).setExtras({ anchor: true }));
  const bin = await new NodeIO().writeBinary(doc);
  fs.writeFileSync(file, bin);
  return bin.length;
}

/** the pack model the species points at, as the game would colour it (trunk: material colour x ramp; crown: ramp x tint) */
async function loadBefore({ file, tint }, R) {
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(path.join(ROOT, file));
  const meshes = [], t = [0, 0, 0, 0];
  const visit = (node, mat) => {
    const m = mul4(mat, node.getMatrix()), mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ca = prim.getAttribute('COLOR_0'), ia = prim.getIndices();
      const n = pa.getCount(), pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const mt = prim.getMaterial(), mn = mt?.getName() || '';
      const base = mn === 'trunk' ? mt.getBaseColorFactor().slice(0, 3) : tint;
      for (let i = 0; i < n; i++) {
        pa.getElement(i, t); const x = t[0], y = t[1], z = t[2];
        pos[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; pos[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; pos[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (na) { na.getElement(i, t); const a = m[0] * t[0] + m[4] * t[1] + m[8] * t[2], b = m[1] * t[0] + m[5] * t[1] + m[9] * t[2], c = m[2] * t[0] + m[6] * t[1] + m[10] * t[2]; const l = Math.hypot(a, b, c) || 1; nrm[i * 3] = a / l; nrm[i * 3 + 1] = b / l; nrm[i * 3 + 2] = c / l; }
        let g = 1; if (ca) { ca.getElement(i, t); g = t[0]; }
        for (let k = 0; k < 3; k++) col[i * 3 + k] = g * base[k] * (mn === 'snow' ? 0 : 1) + (mn === 'snow' ? 0.85 * g : 0);
      }
      const idx = ia ? Uint32Array.from(ia.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      meshes.push({ pos, nrm, idx, col, base: [1, 1, 1] });
    }
    for (const c of node.listChildren()) visit(c, m);
  };
  for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) visit(n, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return meshes;
}
function mul4(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }

/** renderer meshes of one LOD, coloured as the game does: wood = COLOR_0; crown = grey normalised to mean 0.85 x tint;
 *  snow (opts.snow) = mix toward white by the alpha mask */
export function gameMeshes(M, o, PARTS, { tint = null, snow = 0 } = {}) {
  const T = tint || M.def.previewTint || [1, 1, 1], n = o.pos.length / 3, col = new Float32Array(n * 3);
  // the game normalises each tinted primitive (= material) on its own to mean 0.85 (batches.js)
  const means = new Map();
  for (let v = 0; v < n; v++) { const m = PARTS[o.vpart[v]]?.mat || ''; if (!m.startsWith('crown')) continue; let a = means.get(m); if (!a) means.set(m, (a = [0, 0, 0, 0])); for (let k = 0; k < 3; k++) a[k] += o.col[v * 4 + k]; a[3]++; }
  for (const a of means.values()) for (let k = 0; k < 3; k++) a[k] = Math.max(1e-3, a[k] / a[3]);
  const dark = M.def.matDark || {};
  for (let v = 0; v < n; v++) {
    const m = PARTS[o.vpart[v]]?.mat || '', mean = means.get(m), crown = !!mean;
    const g = crown ? 0.85 * (dark[m] ?? 1) * (o.col[v * 4] / mean[0] + o.col[v * 4 + 1] / mean[1] + o.col[v * 4 + 2] / mean[2]) / 3 : 0;
    for (let k = 0; k < 3; k++) {
      let c = crown ? g * T[k] : o.col[v * 4 + k];
      if (snow) c = c + (0.9 - c) * o.col[v * 4 + 3] * snow;
      col[v * 3 + k] = c;
    }
  }
  return [{ pos: o.pos, nrm: o.nrm, idx: o.idx, col, base: [1, 1, 1] }];
}

async function sheets({ M, out, before, outDir, quick, R, PARTS }) {
  const name = M.def.name, save = (n, img) => { R.savePNG(path.join(outDir, n), img); console.log(`  sheet .tmp/sculpt/${name}/${n}`); };
  const after = gameMeshes(M, out[0], PARTS);
  const b = bboxOf(after), c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const H = Math.max(b[4] - b[1], (b[3] - b[0]) * 0.8, (b[5] - b[2]) * 0.8);
  const fov = 35, ts = quick ? 300 : 420, dist = R.fitDistance(b, fov, 0.86);
  const views = [];
  for (let i = 0; i < 8; i++) views.push([i * 45, 8, `${i * 45} DEG`]);
  for (let i = 0; i < 3; i++) views.push([30 + i * 120, 60, `ABOVE ${30 + i * 120}`]);
  views.push([20, -20, 'BELOW']);
  save('turntable.png', R.sheet(views.map(([az, el, label]) => ({ img: R.render(after, R.orbit(c, az, el, dist, fov, ts, ts), { ground: el > 0 }), label })), 4, { title: `${name} TURNTABLE (LOD0 ${out[0].idx.length / 3} TRIS, AS THE GAME TINTS IT)` }));
  save('clay.png', R.sheet([0, 90, 180, 270].map((az) => ({ img: R.render(after, R.orbit(c, az + 20, 10, dist, fov, ts, ts), { clay: true }), label: `CLAY ${az + 20}` })).concat([{ img: R.render(after, R.orbit(c, 40, 75, dist, fov, ts, ts), { clay: true }), label: 'CLAY TOP' }]), 5, { title: `${name} CLAY - FORM ONLY` }));
  // hero: two metres from the trunk, standing eye height, looking up into the tree
  const heroW = quick ? 960 : 1600, heroH = quick ? 540 : 900;
  const heroCam = (az, w, h, fv = 70, d = 2.6, look = 0.42) => { const a = az * Math.PI / 180; return R.camera([Math.sin(a) * d, 1.6, Math.cos(a) * d], [0, H * look, 0], fv, w, h); };
  save('hero.png', R.render(after, heroCam(28, heroW, heroH)));
  const gameCam = (w, h, px, az = 25) => { const k = 1 / Math.tan(50 * Math.PI / 360); const d = (h / 2) * k * H / px; const a = az * Math.PI / 180, e = 12 * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * d * Math.cos(e), c[1] + Math.sin(e) * d, c[2] + Math.cos(a) * d * Math.cos(e)], c, 50, w, h); };
  const gt = out.map((o, i) => ({ img: R.render(gameMeshes(M, o, PARTS), gameCam(420, 480, 300)), label: `LOD${i} ${o.idx.length / 3} TRIS` }));
  for (const [lab, tint] of Object.entries(M.def.landTints || {})) gt.push({ img: R.render(gameMeshes(M, out[1], PARTS, { tint, snow: lab.includes('SNOW') ? 1 : 0 }), gameCam(420, 480, 300, 205)), label: `LOD1 ${lab}` });
  save('game.png', R.sheet(gt, 3, { title: `${name} AT GAME DISTANCE (300 PX TALL)` }));
  const lt = [];
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(gameMeshes(M, out[i], PARTS), R.orbit(c, 30, 10, dist, fov, ts, ts)), label: `LOD${i} ${out[i].idx.length / 3}` });
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(gameMeshes(M, out[i], PARTS).map((m) => ({ ...m, col: null })), R.orbit(c, 30, 10, dist, fov, ts, ts), { wire: true, clay: true }), label: `LOD${i} WIRE` });
  save('lods.png', R.sheet(lt, out.length, { title: `${name} LODS` }));
  if (before) {
    const bs = quick ? 400 : 560;
    const gc = gameCam(bs, Math.round(bs * 0.75), 240);
    const tiles = [
      { img: R.render(before, heroCam(28, bs, bs)), label: 'BEFORE - 2 M' }, { img: R.render(after, heroCam(28, bs, bs)), label: 'AFTER - 2 M' },
      { img: R.render(before, R.orbit(c, 208, 8, dist, fov, bs, bs)), label: 'BEFORE - BACK' }, { img: R.render(after, R.orbit(c, 208, 8, dist, fov, bs, bs)), label: 'AFTER - BACK' },
      { img: R.render(before, gc), label: 'BEFORE - GAME CAMERA' }, { img: R.render(gameMeshes(M, out[1], PARTS), gc), label: 'AFTER LOD1 - GAME CAMERA' },
      { img: R.render(before, R.orbit(c, 28, 10, dist, fov, bs, bs), { clay: true }), label: 'BEFORE - CLAY' }, { img: R.render(after, R.orbit(c, 28, 10, dist, fov, bs, bs), { clay: true }), label: 'AFTER - CLAY' },
    ];
    save('before_after.png', R.sheet(tiles, 2, { title: `${name} BEFORE (PACK MODEL) / AFTER - SAME CAMERA AND LIGHT` }));
  }
  // grove: the tree as the forest shows it, instanced at several turns / scales / distances, LOD by distance (1/10 scale
  // render against the renderer's fixed shadow offset, see NOTES.md)
  if (!quick) {
    const rnd = P.prng(9), list = [], SC = 0.1;
    for (let i = 0; i < 11; i++) {
      const x = (rnd() - 0.5) * 50, z = -8 - rnd() * 55, yaw = rnd() * 6.283, s = 0.85 + rnd() * 0.3, d = Math.hypot(x, z - 12);
      const o = out[d < 25 ? 0 : d < 45 ? 1 : 2], m = gameMeshes(M, o, PARTS)[0], cy = Math.cos(yaw), sy = Math.sin(yaw);
      const pos = new Float32Array(m.pos.length), nrm = new Float32Array(m.nrm.length);
      for (let v = 0; v < m.pos.length; v += 3) {
        const px = m.pos[v] * s, py = m.pos[v + 1] * s, pz = m.pos[v + 2] * s;
        pos[v] = (x + cy * px + sy * pz) * SC; pos[v + 1] = py * SC; pos[v + 2] = (z - sy * px + cy * pz) * SC;
        nrm[v] = cy * m.nrm[v] + sy * m.nrm[v + 2]; nrm[v + 1] = m.nrm[v + 1]; nrm[v + 2] = -sy * m.nrm[v] + cy * m.nrm[v + 2];
      }
      list.push({ ...m, pos, nrm });
    }
    save('grove.png', R.render(list, R.camera([0, 5 * SC, 14 * SC], [0, 4 * SC, -20 * SC], 55, 1280, 720), { groundColor: [0.24, 0.32, 0.14] }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
