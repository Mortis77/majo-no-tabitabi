// trees_a_lib — shared helper of the four flora trees cherry_a, cherry_b, pine_a, pine_b. Not an asset itself.
//  1. shape helpers: a balanced union (bounding-box tree, so a field of ~80 pieces stays cheap), limbs, plated bark,
//     blossom clumps (lobed masses with a leafy scalloped skin and a flat-ish underside), needle pads (flat layered
//     clouds with a domed top and a ragged hanging lower edge);
//  2. paint helpers (crown = VALUE only, the game takes the hue from the instance tint; wood = the real bark colour);
//  3. a VERTEX-COLOUR build driver (trees are drawn INSTANCED by the hundreds in src/world/flora: no texture, no normal
//     map). Same kit stages as tools/sculpt/assets/_smallprops.mjs (extract, simplify, splitNormals, vertex bake), but
//     COLOR_0 is RGBA (A = top-facing snow mask), materials are named exactly `trunk` and `blossom` / `leaves` (the
//     names src/world/flora/species.js partRule keys on), the far LOD comes from a simpler field (TREES_FAR=1), and the
//     sheets show what the game draws (crown: grey normalised to mean 0.85 x the land tint, as batches.js does).
//
//   SCULPT_THREADS=2 node tools/sculpt/assets/trees_a_lib.mjs tools/sculpt/assets/<name>.mjs [--quick]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../sdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');
export const FAR = () => process.env.TREES_FAR === '1';
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
export function clump(c, r, { seed = 1, lobes = 7, flat = 0.72, under = 0.5, skin = 0.07, out = [0, 1, 0], k = 0.2, far = false } = {}) {
  const rnd = P.prng(seed * 977 + 13), L = [];
  const o = P.norm(out);
  for (let i = 0; i < lobes; i++) {
    const a = i * 2.39996 + rnd() * 0.8, yy = 0.15 + 0.75 * rnd(), rr = Math.sqrt(1 - yy * yy);
    let d = P.norm([Math.cos(a) * rr + o[0] * 0.6, yy * 0.9 + o[1] * 0.3, Math.sin(a) * rr + o[2] * 0.6]);
    const lr = r * (0.3 + 0.3 * rnd()), dist = r - lr * (0.45 + 0.3 * rnd());   // R4: unequal, more proud lobes (scalloped, not a marshmallow)
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
export function pad(c, { rx, rz, th, yaw = 0, seed = 1, lobes = 5, tuft = 0.22, skin = 0.02, far = false }) {
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
    // R2: rounded hanging tufts at two scales (big drops + small ones between), not an even comb of teeth
    if (!far) {
      const e = P.cellular(u * fr * 0.85, 0, w * fr * 0.85, sd), e2 = P.cellular(u * fr * 2.1, 0, w * fr * 2.1, sd + 3);
      hang = th * tuft * 2.2 * (0.8 * ss(0.85, 0.15, e) + 0.35 * ss(0.8, 0.25, e2)) * rim;
    }
    const cut = (yb - hang) - qy;
    d = Math.max(d, cut);
    if (!far && d < 0.08 && d > -0.08 && qy > yb * 0.5) d -= th * skin * 2 * (0.5 - P.cellular(x * fr * 1.5, y * fr * 1.5, z * fr * 1.5, sd + 1));
    return d;
  };
  const R = Math.max(rx, rz) * 1.15;
  return new P.Shape(f, [c[0] - R, c[1] - th * 1.6, c[2] - R, c[0] + R, c[1] + th * 1.2, c[2] + R], null, 2.2);
}

/**
 * Needle pad, revision B (review A: "mint sausages"): a flat-topped pad whose rim is 4-6 big BRUSH STROKES (tapered
 * lobes laid radially, notches between them), a flat underside hung with a scalloped drop under each stroke. `skip`
 * (deg, in the pad's own u/w plane) = the side toward the trunk: strokes there are short.
 */
export function pad2(c, { rx, rz, th, yaw = 0, seed = 1, strokes = 5, far = false, skip = null }) {
  const rnd = P.prng(seed * 191 + 3), cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180);
  const n = far ? Math.min(4, strokes) : strokes, S = [], D = [];
  const a0 = rnd() * 6.283;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.283 + (rnd() - 0.5) * 0.5, ca = Math.cos(a), sa = Math.sin(a);
    let rim = Math.hypot(rx * ca, rz * sa);
    if (skip != null) { const dd = Math.abs(((a - skip * Math.PI / 180) % 6.283 + 9.42) % 6.283 - 3.14); if (dd < 0.9) rim *= 0.7; }
    const dir = [rx * ca / Math.hypot(rx * ca, rz * sa), rz * sa / Math.hypot(rx * ca, rz * sa)];
    // R2: strokes are rim scallops on a big core (long deep strokes read as an ivy-leaf star from above)
    const hl = rim * (0.3 + 0.06 * rnd()), hw = Math.min(rx, rz) * (0.42 + 0.1 * rnd()), hh = th * (0.32 + 0.06 * rnd());
    const cc = [dir[0] * rim * 0.68, -th * (0.06 + 0.08 * rnd()), dir[1] * rim * 0.68];
    S.push([cc[0], cc[1], cc[2], dir[0], dir[1], hl, hw, hh]);
    D.push([dir[0] * rim * 0.74, -th * 0.34, dir[1] * rim * 0.74, hw * 0.55, th * (0.22 + 0.1 * rnd())]);
  }
  const ax = rx * 0.74, az = rz * 0.74, ay = th * 0.45, sd = seed * 5 + 1;
  const ell = (px, py, pz, a, b, cc) => { const k0 = Math.hypot(px / a, py / b, pz / cc), k1 = Math.hypot(px / (a * a), py / (b * b), pz / (cc * cc)); return k1 < 1e-9 ? -Math.min(a, b, cc) : (k0 * (k0 - 1)) / k1; };
  const f = (x, y, z) => {
    const qx = x - c[0], qy = y - c[1], qz = z - c[2];
    const u = qx * sy + qz * cy, w = qx * cy - qz * sy;
    let d = ell(u, qy, w, ax, ay, az);
    for (const s of S) {
      const pu = u - s[0], pw = w - s[2], al = pu * s[3] + pw * s[4], ac = -pu * s[4] + pw * s[3];
      // tapered stroke: narrower toward its tip (al > 0)
      const taper = 1 - 0.35 * clamp(al / s[5], 0, 1);
      d = P.smin(d, ell(al, qy - s[1], ac, s[5], s[7] * (0.6 + 0.4 * taper), s[6] * taper), th * 0.2);
    }
    // flat-ish top: a gentle dome over the whole pad
    const rho = Math.hypot(u / rx, w / rz);
    d = -P.smin(-d, -(qy - th * (0.4 - 0.22 * rho * rho)), th * 0.12);
    // flat underside, then a hanging scalloped drop under each stroke
    d = Math.max(d, -th * 0.3 - qy);
    for (const q of D) d = P.smin(d, ell(u - q[0], qy - q[1], w - q[2], q[3], q[4], q[3]), th * 0.14);
    // needle strokes on the top: shallow radial grooves
    if (!far && qy > -th * 0.1 && d > -0.06 && d < 0.06) {
      const ang = Math.atan2(w / rz, u / rx);
      d += th * 0.05 * Math.max(0, Math.sin(ang * 13 + 2.5 * P.noise3(u * 2, 0, w * 2, sd))) * clamp(rho * 1.4 - 0.2, 0, 1);
    }
    return d;
  };
  const R = Math.max(rx, rz) * 1.12;
  return new P.Shape(f, [c[0] - R, c[1] - th * 0.9, c[2] - R, c[0] + R, c[1] + th * 0.75, c[2] + R], null, 2.2);
}

/** point and unit tangent at fraction t of a polyline's arc length */
export function polyAt(pts, t) {
  const L = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); L.push(l); tot += l; }
  let s = clamp(t, 0, 1) * tot;
  for (let i = 0; i < L.length; i++) {
    if (s <= L[i] || i === L.length - 1) {
      const a = pts[i], b = pts[i + 1], k = L[i] ? Math.min(1, s / L[i]) : 0;
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], d: P.norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]) };
    }
    s -= L[i];
  }
}

/**
 * Sakura crown + limbs (review A: "acacia, not sakura"). limbs: [[pts, r0, r1]] — arching limbs that rise, spread and
 * droop at the ends; clumps: [[limb, t, r, seed]] — blossom clouds hung ALONG the limbs (centre a little under the
 * limb, so it reads as blossom hanging from the branch). Every limb ends at the centre of a clump (no thorns).
 * Returns { wood: [shapes], crown: [shapes], blobs (LOD2 spec) }.
 */
export function sakura({ limbs, clumps, cen, far, zigAmp = 0.16, seedBase = 1 }) {
  const wood = [], crown = [], blobs = [];
  limbs.forEach(([pts, r0, r1], i) => {
    const pp = far ? pts : zig(pts, zigAmp, seedBase + i);
    wood.push(limb(pp, far ? r0 * 0.9 : r0, far ? Math.max(r1, 0.06) : Math.max(r1, 0.045), 0.8));
  });
  clumps.forEach(([li, t, r, seed]) => {
    const { p, d } = polyAt(limbs[li][0], t);
    const c = [p[0], p[1] - r * 0.22, p[2]];
    const out = [c[0] - cen[0], 0.6, c[2] - cen[2]];
    // the cloud is drawn out along the limb (two masses), smaller clouds are single
    const big = r > 0.7;
    const rr = far ? r * 1.12 : r;
    crown.push(clump(c, rr, { seed, lobes: far ? 4 : big ? 9 : 6, out, far, flat: big ? 0.68 : 0.76, under: 0.55, skin: 0.07, k: 0.2 }));
    if (big) {
      const back = [c[0] - d[0] * r * 0.75, c[1] - d[1] * r * 0.75 - r * 0.12, c[2] - d[2] * r * 0.75];
      crown.push(clump(back, rr * 0.62, { seed: seed + 40, lobes: far ? 3 : 6, out, far, flat: 0.66, under: 0.55, skin: 0.07, k: 0.2 }));
    }
    blobs.push({ c, r: [r * 1.12 * (big ? 1.15 : 1.05), r * (big ? 0.72 : 0.8), r * 1.0], yaw: Math.atan2(d[0], d[2]) * 180 / Math.PI, n: r > 0.6 ? 5 : 4 });
  });
  return { wood, crown, blobs };
}

/** LOD2 clump list: inner small clouds dropped, a limb's tip cloud folded into the cloud before it (x1.3) */
export function lod2Clumps(list) {
  const near = (li) => list.some((q) => q[0] === li && q[1] > 0.8 && q[1] < 1);
  return list.filter(([li, t, r]) => r >= 0.55 || (t === 1 && !near(li))).map(([li, t, r, s]) => [li, t, t > 0.8 && t < 1 ? r * 1.3 : r, s]);
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

/**
 * A painted pine from a spec (pine_a, pine_b): { trunk: points, r0, r1, pow, roots: [[deg, len, r]], boughs: [[from, padIndex,
 * r0]], pads: [[c, rx, rz, th, yaw, seed]], bareTo (m: plated bare trunk below), cen, woodPaint, padPaint }.
 * Boughs run from the trunk point to the underside of their pad with an elbow; each pad also gets two short twigs.
 */
export function pineBuild(S, sp) {
  const far = FAR();
  S.part('pinebark', { mat: 'wood', paint: sp.woodPaint });
  const pieces = [limb(sp.trunk, sp.r0, sp.r1, sp.pow ?? 0.7).softAdd(S.ellipsoid([sp.r0 * 1.45, sp.r0 * 0.9, sp.r0 * 1.4]).at(sp.trunk[1][0] * 0.2, 0, sp.trunk[1][2] * 0.2), 0.22)];
  if (!far) for (const [a, L, r] of sp.roots) {
    const t = a * Math.PI / 180, d = [Math.sin(t), Math.cos(t)];
    pieces.push(limb([[d[0] * 0.12, 0.35, d[1] * 0.12], [d[0] * L * 0.45, 0.1, d[1] * L * 0.45], [d[0] * L, -0.1, d[1] * L]], r, 0.05, 0.6));
  }
  sp.boughs.forEach(([from, pi, r0], i) => {
    const [c, rx, rz, th] = sp.pads[pi];
    if (far && r0 < (sp.farMinR ?? 0.1)) return;
    const rch = sp.reach ?? 0.25, end = [c[0] + (from[0] - c[0]) * rch, c[1] - th * 0.15, c[2] + (from[2] - c[2]) * rch];
    const mid = [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2 + (sp.elbow ?? 0.25) * (i % 2 ? 1 : -0.4), (from[2] + end[2]) / 2];
    const pts = far ? [from, end] : zig([from, mid, end], 0.18, i + 31);
    pieces.push(limb(pts, r0, Math.max(0.05, r0 * 0.35), 0.8));
  });
  // dead stubs on the bare trunk (shaded lower boughs that died and broke off): [y, yaw deg, len, r]
  if (!far && sp.stubs && sp.trunkAt) for (const [y, yaw, L, r] of sp.stubs) {
    const a = sp.trunkAt(y), t = yaw * Math.PI / 180, d = [Math.sin(t), Math.cos(t)];
    pieces.push(limb([[a[0], y, a[1]], [a[0] + d[0] * (L + 0.15), y - 0.06, a[1] + d[1] * (L + 0.15)]], r, r * 0.7, 1));
  }
  let wood = bunion(pieces, 0.1);
  if (!far) wood = plates(wood, { w: 0.24, h: 0.42, depth: 0.03, groove: 0.22, seed: 7, where: (x, y) => ss(sp.bareTo + 1.5, sp.bareTo - 0.5, y) * 0.9 + 0.1 });
  wood = wood.part('pinebark', { mat: 'wood', paint: sp.woodPaint });
  // visible branches that carry the pads (pine_b): [[pts, r0]]
  if (sp.branches) { let w2 = []; sp.branches.forEach(([pts, r0], i) => w2.push(limb(far ? pts : zig(pts, 0.12, i + 71), r0, Math.max(0.045, r0 * 0.4), 0.8))); wood = wood.add(bunion(w2, 0.06).part('pinebark', { mat: 'wood', paint: sp.woodPaint })); }
  const pads = [];
  const skipOf = (c, yaw) => { if (!sp.trunkAt) return null; const t = sp.trunkAt(c[1]), qx = t[0] - c[0], qz = t[1] - c[2], cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180); return Math.atan2(qx * cy - qz * sy, qx * sy + qz * cy) * 180 / Math.PI; };
  sp.pads.forEach(([c, rx, rz, th, yaw, seed, solo], i) => {
    const P2 = (cc, o) => pad2(cc, { ...o, far, skip: skipOf(cc, o.yaw) });
    pads.push(P2(c, { rx: far ? rx * 1.06 : rx, rz: far ? rz * 1.06 : rz, th, yaw, seed, strokes: 4 + (seed % 3) }));
    // a twin pad hung beside and below (each bough carries a hand of two masses, overlapping, light / shade alternate)
    if (sp.twin && !solo && rx < (sp.tableRx ?? 1.8)) {
      const a = yaw * Math.PI / 180, sd = seed % 2 ? 1 : -1, off = rz * sp.twin;
      const c3 = [c[0] + Math.cos(a) * off * sd + Math.sin(a) * rx * 0.25, c[1] - th * 0.55, c[2] - Math.sin(a) * off * sd + Math.cos(a) * rx * 0.25];
      pads.push(P2(c3, { rx: rx * 0.72, rz: rz * 0.8, th: th * 0.85, yaw: yaw - 25 * sd, seed: seed + 90, strokes: 4 }));
    }
    // a second, smaller layer stacked on the pad, set back toward the trunk: pads read as layered strata, not buns
    if (sp.stack !== false && !solo && rx < (sp.tableRx ?? 1.8)) {
      const tx = sp.trunkAt ? sp.trunkAt(c[1]) : [0, 0], k = 0.22;
      const c2 = [c[0] + (tx[0] - c[0]) * k, c[1] + th * 0.5, c[2] + (tx[1] - c[2]) * k];
      pads.push(P2(c2, { rx: rx * 0.6, rz: rz * 0.64, th: th * 0.6, yaw: yaw + 20, seed: seed + 50, strokes: 4 }));
    }
  });
  const crown = bunion(pads, far ? 0.25 : 0).part('needles', { mat: 'crown', paint: sp.padPaint });
  return floor0(wood.add(crown));
}

/** needle value (revision B): lit flat top, clearly darker scalloped underside and notches (value only — the land
 *  tint gives the hue; the crown material is `leaves_dark`, the game's existing x0.74 rule) */
export function needleValue(c, { cen, lo = 0.3, hi = 1.0, seed = 2 }) {
  const { x, y, z, ny, ao, cavity, edge } = c;
  const out = clamp(Math.hypot(x - cen[0], z - cen[2]) / 2.2, 0, 1);
  let v = lo + (hi - lo) * (0.8 * ss(-0.25, 0.8, ny) + 0.2 * out);
  v *= 0.72 + 0.28 * ao;
  v += 0.06 * edge - 0.18 * cavity + 0.03 * P.fbm(x * 0.9, y * 0.9, z * 0.9, seed, 2);
  return [v, v, v];
}

/** pine bark: reddish-brown plates, dark grooves, greyer at the foot; the warm orange of old pine bark only as broken
 *  PATCHES on the upper trunk (review A: the top turned solid orange in LOD1/2) */
export function pineWood(c, bareTo = 4) {
  const { x, y, z, nz, cavity, edge } = c;
  let col = C('#77503f');
  const patch = ss(bareTo - 1.5, bareTo + 1.5, y) * ss(0.05, 0.3, P.fbm(x * 1.6, y * 0.7, z * 1.6, 23, 2));
  col = mix(col, C('#a8694a'), patch * 0.7);
  col = mix(col, C('#a8806a'), edge * 0.55);
  col = mix(col, C('#3a2420'), Math.min(1, cavity * 1.4));
  col = mix(col, C('#6a5a4c'), ss(1.6, 0.2, y) * 0.35);                                   // grey weathered foot
  const lichen = ss(1.8, 0.4, y) * ss(0.0, -0.6, nz) * ss(0.0, 0.3, P.fbm(x * 2.5, y * 2.5, z * 2.5, 9, 2));
  return mix(col, C('#7c8456'), lichen * 0.6);
}

/** LOD2 spec of a painted pine: one rounded blob per pad (+ twin), the trunk and the boughs / branches as thin tubes */
export function pineLod2(sp) {
  const blobs = [], tubes = [{ pts: sp.trunk.filter((_, i) => i % 2 === 0 || i === sp.trunk.length - 1), r0: sp.r0 * 1.05, r1: sp.r1, n: 6 }];
  sp.pads.forEach(([c, rx, rz, th, yaw, seed, solo]) => {
    blobs.push({ c: [c[0], c[1] - th * 0.05, c[2]], r: [rx * 0.92, th * 0.68, rz * 0.92], yaw, n: 5 });
    if (sp.twin && !solo && rx < (sp.tableRx ?? 1.8)) { const a = yaw * Math.PI / 180, sd = seed % 2 ? 1 : -1, off = rz * sp.twin; blobs.push({ c: [c[0] + Math.cos(a) * off * sd + Math.sin(a) * rx * 0.25, c[1] - th * 0.55, c[2] - Math.sin(a) * off * sd + Math.cos(a) * rx * 0.25], r: [rx * 0.66, th * 0.6, rz * 0.72], yaw: yaw - 25 * sd, n: 4 }); }
  });
  for (const [from, pi, r0] of sp.boughs) { if (r0 < 0.1) continue; const c = sp.pads[pi][0]; tubes.push({ pts: [from, [c[0], c[1] - sp.pads[pi][3] * 0.2, c[2]]], r0: r0 * 1.1, r1: 0.05, n: 4 }); }
  if (sp.branches) for (const [pts, r0] of sp.branches) tubes.push({ pts: [pts[0], pts[pts.length - 1]], r0: r0 * 1.1, r1: 0.05, n: 4 });
  return { blobs, tubes };
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
  delete process.env.TREES_FAR;
  const M = await loadModel(assetPath);
  const cfg = M.cfg, def = M.def, name = def.name;
  if (quick) cfg.voxel *= 1.5;
  const outDir = path.join(ROOT, '.tmp', 'sculpt', name); fs.mkdirSync(outDir, { recursive: true });
  const glbDir = path.join(ROOT, 'assets', 'models', 'sculpt'); fs.mkdirSync(glbDir, { recursive: true });
  const pool = new Pool(assetPath);
  let far = null;
  console.log(`trees ${name}: ${pool.size} workers, voxel ${(cfg.voxel * 1000).toFixed(1)} mm, bounds ${M.bounds.map((v) => v.toFixed(2)).join(' ')}`);
  try {
    const full = await extract(M, pool, cfg.voxel, console.log);
    const tags = await faceTags(pool, full.pos, full.idx);
    const fb = checkMesh(full.pos, full.idx).bounds, diag = Math.hypot(fb[3] - fb[0], fb[4] - fb[1], fb[5] - fb[2]);
    const errs = cfg.lodError || [0.004, 0.012, 0.03].map((k) => k * diag);
    const lods = [];
    let src = { pos: full.pos, idx: full.idx, tag: tags.part };
    for (const [li, target] of cfg.lods.entries()) {
      if (def.farFrom != null && li === def.farFrom) {
        process.env.TREES_FAR = '1';
        const M2 = await loadModel(assetPath); const pool2 = new Pool(assetPath);
        const full2 = await extract(M2, pool2, cfg.voxel * (def.farVoxel || 2.5), console.log);
        const tags2 = await faceTags(pool2, full2.pos, full2.idx);
        far = { M: M2, pool: pool2 }; src = { pos: full2.pos, idx: full2.idx, tag: tags2.part };
        delete process.env.TREES_FAR;
      }
      if (def.lod2 && li === 2) { lods.push({ explicit: true }); continue; }
      const s = simplify(src.pos, src.idx, target, { faceTag: src.tag, hardAngle: cfg.hardAngle ?? 60, maxError: errs[li] ?? Infinity, ...(cfg.lodTurn?.[li] != null ? { maxNormalTurn: cfg.lodTurn[li] } : {}) });
      const cb = checkMesh(s.pos, s.idx).bounds, drift = Math.max(...cb.map((v, k) => Math.abs(v - fb[k])));
      console.log(`  LOD${li}: ${s.idx.length / 3} tris (target ${target}), bbox drift ${(drift * 1000).toFixed(0)} mm`);
      s.far = li >= (def.farFrom ?? 99) ? far : null;
      lods.push(s); src = s;
    }
    const out = [];
    for (const L of lods) {
      if (L.explicit) { const e = explicitLod2(def.lod2(), out[1], PARTS); out.push(e); lods[out.length - 1] = { pos: e.pos, idx: e.idx, tag: e.tag }; console.log(`  LOD2 (explicit blobs): ${e.idx.length / 3} tris`); continue; }
      const sn = splitNormals(L.pos, L.idx, cfg.creaseAngle, { faceTag: L.tag });
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
        // rev B crown tone: the kit's AO / cavity multiply drove the crown value range to ~30:1 (near-white tops after the
        // game's mean normalisation); squeeze it (in sRGB) into def.crownTone so lit = pale tint, shade = deeper tint
        if (PARTS[vtag[v]]?.mat === 'crown') { const [lo, hi] = def.crownTone || [0.48, 0.95]; for (let k = 0; k < 3; k++) col[v * 4 + k] = Math.pow(lo + (hi - lo) * Math.pow(Math.max(0, col[v * 4 + k]), 1 / 2.2), 2.2); }
        const ny = vc.raw[v * 8 + 4], px = sn.pos[v * 3], py = sn.pos[v * 3 + 1], pz = sn.pos[v * 3 + 2];
        const isCrown = PARTS[vtag[v]]?.mat === 'crown';
        const n = 0.25 * P.fbm(px * 1.3, py * 1.3, pz * 1.3, 17, 2);
        col[v * 4 + 3] = isCrown ? clamp(ss(0.3, 0.8, ny + n) * (0.6 + 0.4 * vc.raw[v * 8 + 6]), 0, 1) : clamp(ss(0.72, 0.95, ny + n) * 0.8 * ss(1.2, 2.5, py), 0, 1);
      }
      out.push({ pos: sn.pos, nrm: sn.nrm, idx: sn.idx, col, tag: L.tag, vpart: vc.part });
    }
    // crown value as the game shows it (0.85 x v / mean x dark): percentiles per LOD
    const dk = (def.materials?.crown?.name === 'leaves_dark') ? 0.74 : 1;
    out.forEach((o, i) => { const g = []; for (let v = 0; v < o.pos.length / 3; v++) if (PARTS[o.vpart[v]]?.mat === 'crown') g.push(o.col[v * 4]); const m = g.reduce((a, b) => a + b, 0) / g.length; g.sort((a, b) => a - b); const q = (t) => (0.85 * dk * g[Math.floor(t * (g.length - 1))] / m).toFixed(2); console.log(`  LOD${i} crown x tint: p5 ${q(0.05)} p25 ${q(0.25)} p50 ${q(0.5)} p75 ${q(0.75)} p95 ${q(0.95)} max ${q(1)}`); });
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
      source: `tools/sculpt/assets/${name}.mjs (node tools/sculpt/assets/trees_a_lib.mjs)`, scale: 1,
      size: sizeOf(b), tris: checks.lods[0].tris, lods: checks.lods.map((l) => l.tris), materials: matNames,
      mats: Object.fromEntries(Object.values(cfg.materials).map((m) => [m.name, { surface: m.surface, look: m.look || {} }])),
      notes: def.notes || '',
    } };
    fs.writeFileSync(path.join(glbDir, name + '.manifest.json'), JSON.stringify(frag, null, 1) + '\n');
    await sheets({ M, out, before, outDir, quick, R, PARTS });
    checks.buildSeconds = +((Date.now() - T0) / 1000).toFixed(1);
    fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 1));
    console.log(JSON.stringify({ lods: checks.lods.map((l) => [l.tris, l.watertight, l.openEdges, l.nonManifoldEdges]), size: sizeOf(b), before: beforeBounds && sizeOf(beforeBounds), measure: checks.measure, fileKB: checks.fileKB }));
  } finally { await pool.close(); if (far) await far.pool.close().catch(() => {}); }
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
  let r = 0, n = 0; const pts = [], cb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let v = 0; v < o.pos.length / 3; v++) {
    const x = o.pos[v * 3], y = o.pos[v * 3 + 1], z = o.pos[v * 3 + 2], m = PARTS[o.vpart[v]]?.mat;
    if (m === 'wood' && y > 1.2 && y < 1.4 && Math.hypot(x, z) < 1.2) { pts.push([x, z]); }
    if (m === 'crown') for (let k = 0; k < 3; k++) { cb[k] = Math.min(cb[k], o.pos[v * 3 + k]); cb[k + 3] = Math.max(cb[k + 3], o.pos[v * 3 + k]); }
  }
  // radius about the section's own centre (a leaning trunk is not centred on the origin at chest height)
  if (pts.length) { const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, mz = pts.reduce((a, p) => a + p[1], 0) / pts.length; for (const p of pts) { r += Math.hypot(p[0] - mx, p[1] - mz); n++; } }
  return { trunkRChest: n ? +(r / n).toFixed(3) : null, crownBox: cb.map((v) => +v.toFixed(2)), crownR: +(Math.max(cb[3] - cb[0], cb[5] - cb[2]) / 2).toFixed(2) };
}

/**
 * LOD2 built directly (review A: "LOD2 turns into shards"): every clump / pad one convex rounded blob of 16-20
 * triangles (two rings of n=4/5 + poles, smooth ellipsoid normals), limbs as n-sided tubes closed to points. Wood
 * colours copied from the nearest LOD1 wood vertex (same kit colour convention), crown value from the blob's facing.
 */
function explicitLod2(spec, near, PARTS) {
  const crownId = PARTS.findIndex((p) => p.mat === 'crown'), woodId = PARTS.findIndex((p) => p.mat === 'wood' && near.vpart.includes(p.id)) >= 0 ? PARTS.findIndex((p) => p.mat === 'wood' && near.vpart.includes(p.id)) : PARTS.findIndex((p) => p.mat === 'wood');
  const pos = [], nrm = [], col = [], idx = [], tag = [], vpart = [];
  const nw = []; for (let v = 0; v < near.pos.length / 3; v++) if (PARTS[near.vpart[v]]?.mat === 'wood') nw.push(v);
  const woodCol = (x, y, z) => { let b = -1, bd = 1e9; for (const v of nw) { const d = (near.pos[v * 3] - x) ** 2 + (near.pos[v * 3 + 1] - y) ** 2 + (near.pos[v * 3 + 2] - z) ** 2; if (d < bd) { bd = d; b = v; } } return b < 0 ? [0.2, 0.12, 0.1, 0] : [near.col[b * 4], near.col[b * 4 + 1], near.col[b * 4 + 2], 0]; };
  let cx = 0, cz = 0; for (const b of spec.blobs) { cx += b.c[0]; cz += b.c[2]; } cx /= spec.blobs.length; cz /= spec.blobs.length;
  const ymin = Math.min(...spec.blobs.map((b) => b.c[1])), ymax = Math.max(...spec.blobs.map((b) => b.c[1]));
  for (const b of spec.blobs) {
    const n = b.n || 5, base = pos.length / 3, [rx, ry, rz] = b.r, a = (b.yaw || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const loc = [[0, 1, 0]];
    for (const [el, off] of [[0.42, 0], [-0.5, 0.5]]) for (let i = 0; i < n; i++) { const t = (i + off) / n * 6.283; loc.push([Math.cos(el) * Math.cos(t), Math.sin(el), Math.cos(el) * Math.sin(t)]); }
    loc.push([0, -1, 0]);
    const hgt = (b.c[1] - ymin) / Math.max(0.5, ymax - ymin), outd = clamp(Math.hypot(b.c[0] - cx, b.c[2] - cz) / 2.5, 0, 1);
    for (const [lx, ly, lz] of loc) {
      const px = lx * rx, py = ly * ry, pz = lz * rz, wx = px * ca + pz * sa, wz = -px * sa + pz * ca;
      const gx = lx / rx, gy = ly / ry, gz = lz / rz, nx0 = gx * ca + gz * sa, nz0 = -gx * sa + gz * ca, l = Math.hypot(nx0, gy, nz0);
      const ny = gy / l;
      pos.push(b.c[0] + wx, b.c[1] + py, b.c[2] + wz); nrm.push(nx0 / l, ny, nz0 / l);
      const v = Math.pow(0.6 + 0.36 * (0.72 * ss(-0.55, 0.85, ny) + 0.14 * hgt + 0.14 * outd), 2.2);   // same linear convention as the bake
      col.push(v, v, v, clamp(ss(0.3, 0.8, ny), 0, 1)); vpart.push(crownId);
    }
    const tri = (p, q, r) => { idx.push(base + p, base + q, base + r); tag.push(crownId); };
    for (let i = 0; i < n; i++) {
      const i1 = 1 + i, i2 = 1 + (i + 1) % n, j1 = 1 + n + i, j2 = 1 + n + (i + 1) % n;   // lower ring offset +half step
      tri(0, i2, i1); tri(i1, i2, j1); tri(j1, i2, j2); tri(2 * n + 1, j1, j2);
    }
  }
  for (const t of spec.tubes) {
    const n = t.n || 5, pts = t.pts, m = pts.length, base = pos.length / 3;
    // vertex 0 = start point (closed), rings at every interior AND end point except the tip, tip = last point
    const ringAt = [];
    for (let i = 0; i < m - 1; i++) ringAt.push(i);
    const rad = (i) => t.r0 + (t.r1 - t.r0) * (i / (m - 1));
    const start = [pts[0][0], pts[0][1] - (t.r0 * 0.5), pts[0][2]];
    pos.push(...start); nrm.push(0, -1, 0); col.push(...woodCol(...pts[0])); vpart.push(woodId);
    for (const i of ringAt) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(m - 1, i + 1)], d = P.norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const u = P.norm(P.cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), w = P.cross(d, u), r = rad(i);
      for (let k = 0; k < n; k++) { const th = k / n * 6.283, e = [u[0] * Math.cos(th) + w[0] * Math.sin(th), u[1] * Math.cos(th) + w[1] * Math.sin(th), u[2] * Math.cos(th) + w[2] * Math.sin(th)]; const p = [pts[i][0] + e[0] * r, pts[i][1] + e[1] * r, pts[i][2] + e[2] * r]; pos.push(...p); nrm.push(...e); col.push(...woodCol(...p)); vpart.push(woodId); }
    }
    const tip = pts[m - 1]; pos.push(...tip); { const a = pts[m - 2], d = P.norm([tip[0] - a[0], tip[1] - a[1], tip[2] - a[2]]); nrm.push(...d); } col.push(...woodCol(...tip)); vpart.push(woodId);
    const R = ringAt.length, tipV = 1 + R * n;
    const tri = (p, q, r) => { idx.push(base + p, base + q, base + r); tag.push(woodId); };
    for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; tri(0, 1 + k2, 1 + k); }
    for (let r = 0; r < R - 1; r++) for (let k = 0; k < n; k++) { const k2 = (k + 1) % n, a = 1 + r * n, b = 1 + (r + 1) * n; tri(a + k, a + k2, b + k); tri(b + k, a + k2, b + k2); }
    for (let k = 0; k < n; k++) { const k2 = (k + 1) % n, a = 1 + (R - 1) * n; tri(a + k, a + k2, tipV); }
  }
  // winding: every face front-facing along its vertex normals
  for (let f = 0; f < idx.length; f += 3) {
    const [a, b, c] = [idx[f], idx[f + 1], idx[f + 2]], A = pos.slice(a * 3, a * 3 + 3), B = pos.slice(b * 3, b * 3 + 3), Cc = pos.slice(c * 3, c * 3 + 3);
    const fn = P.cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]]);
    const vn = [0, 1, 2].map((k) => nrm[a * 3 + k] + nrm[b * 3 + k] + nrm[c * 3 + k]);
    if (fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] < 0) { idx[f + 1] = c; idx[f + 2] = b; }
  }
  return { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), idx: Uint32Array.from(idx), col: Float32Array.from(col), tag: Int16Array.from(tag), vpart: Int16Array.from(vpart) };
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
  const T0 = tint || M.def.previewTint || [1, 1, 1], n = o.pos.length / 3, col = new Float32Array(n * 3);
  const dk = (M.def.materials?.crown?.name === 'leaves_dark') ? 0.74 : 1, T = T0.map((v) => v * dk);   // partRule dark
  const mean = [0, 0, 0]; let nc = 0;
  for (let v = 0; v < n; v++) if (PARTS[o.vpart[v]]?.mat === 'crown') { for (let k = 0; k < 3; k++) mean[k] += o.col[v * 4 + k]; nc++; }
  for (let k = 0; k < 3; k++) mean[k] = Math.max(1e-3, mean[k] / Math.max(1, nc));
  for (let v = 0; v < n; v++) {
    const crown = PARTS[o.vpart[v]]?.mat === 'crown';
    const g = crown ? 0.85 * (o.col[v * 4] / mean[0] + o.col[v * 4 + 1] / mean[1] + o.col[v * 4 + 2] / mean[2]) / 3 : 0;
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
  const H = b[4] - b[1];
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
