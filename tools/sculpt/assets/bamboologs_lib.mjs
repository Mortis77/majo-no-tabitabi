// bamboologs_lib — shared helper of bamboo_a, bamboo_b (bamboo clumps) and log_fallen, log_a, log_moss, stump_a (the dead
// wood of the forest floor). Not an asset itself. It is also the BUILD DRIVER (all six are drawn INSTANCED by
// src/world/flora: vertex colours on every LOD, no texture, no normal map, the game's material names):
//
//   SCULPT_THREADS=2 node tools/sculpt/assets/bamboologs_lib.mjs tools/sculpt/assets/<name>.mjs [--quick]
//
// The driver is a copy of the trees_c_lib.mjs driver (extract, faceTags, simplify, splitNormals, vertex bake, COLOR_0 RGBA,
// writer) with three changes:
//  1. BUILT CULMS: a bamboo culm is a long thin tube with a ring at every node. The kit's simplifier cannot keep 80 rings
//     on six 9 m culms inside 4,000 triangles, so the culms (and their twigs) are written as explicit ring-by-ring tubes
//     (`culmMesh`), node rings exactly where the field has them; the field still holds the culms (for AO, paint and part
//     at bake), but is extracted WITHOUT them (env BL_NOCULM=1) for the rest of the clump (leaf sprays, sheaths, foot).
//  2. per-material TINT in the sheets (`def.tintMats`, `def.tints`): the game normalises each tinted primitive to a mean
//     grey of 0.85 and multiplies the instance tint; mul primitives show their painted colour.
//  3. framing for low, long objects (logs): the game / hero cameras fit the larger of height and length.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../sdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');
export const FAR = () => process.env.BL_FAR === '1';
export const NOCULM = () => process.env.BL_NOCULM === '1';
export const MID = () => process.env.BL_MID === '1';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ss = P.ss, mix = P.mix, C = P.color;
const D2R = Math.PI / 180;

// ===================================================================================================== generic shapes
/** balanced union (bbox tree) of many shapes; k > 0 smooth */
export function bunion(list, k = 0) {
  list = list.filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const cen = (s) => [(s.b[0] + s.b[3]) / 2, (s.b[1] + s.b[4]) / 2, (s.b[2] + s.b[5]) / 2];
  const cs = list.map(cen), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const c of cs) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], c[a]); hi[a] = Math.max(hi[a], c[a]); }
  let ax = 0; for (let a = 1; a < 3; a++) if (hi[a] - lo[a] > hi[ax] - lo[ax]) ax = a;
  const ord = list.map((s, i) => [cs[i][ax], s]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const h = ord.length >> 1, A = bunion(ord.slice(0, h), k), B = bunion(ord.slice(h), k);
  return k > 0 ? P.softUnion(k, A, B) : P.union(A, B);
}
export function limb(pts, r0, r1, pow = 0.85) { return P.tube(pts, (t) => r1 + (r0 - r1) * Math.pow(1 - t, pow)); }
/** hard floor at y = y0 */
export function floorAt(s, y0 = 0) { const f = s.f; return new P.Shape((x, y, z) => Math.max(f(x, y, z), y0 - y), [s.b[0], Math.max(s.b[1], y0 - 0.05), s.b[2], s.b[3], s.b[4], s.b[5]], s.pf, s.lip); }

/** bark in plates / ridges along an AXIS ('x' | 'y' | 'z'): grooves on the walls of a cell pattern stretched along the
 *  axis (plates `w` across, `h` along), `depth` deep, only where `where` > 0. Inward only. */
export function plates(shape, { w = 0.2, h = 0.5, depth = 0.02, groove = 0.25, seed = 1, axis = 'y', where = null }) {
  const f = shape.f;
  const q = axis === 'x' ? (x, y, z) => [x / h, y / w, z / w] : axis === 'z' ? (x, y, z) => [x / w, y / w, z / h] : (x, y, z) => [x / w, y / h, z / w];
  return new P.Shape((x, y, z) => {
    const d = f(x, y, z);
    if (d > depth * 3 + 0.02 || d < -depth * 4) return d;
    const m = where ? where(x, y, z) : 1;
    if (m <= 0) return d;
    const [a, b, c] = q(x, y, z);
    const e = P.cellular(a, b, c, seed, true);
    const g = Math.max(0, 1 - e / groove);
    return d + depth * m * g * g;
  }, shape.b, shape.pf, shape.lip + depth / (Math.min(w, h) * groove) * 1.5);
}

/** a bounded break (three planes behind `at` intersected with a ball), to cut away: a chip that cannot run up a face */
export function brk(at, dir, depth, { seed = 1, spread = 0.55, r = null } = {}) {
  const rnd = P.prng(seed * 29 + 3), n = P.norm(dir), R = r || depth * 2.6;
  let s = null;
  for (let i = 0; i < 3; i++) {
    const j = P.norm([n[0] + (rnd() - 0.5) * spread * 2, n[1] + (rnd() - 0.5) * spread * 2, n[2] + (rnd() - 0.5) * spread * 2]);
    const o = [at[0] - n[0] * depth, at[1] - n[1] * depth, at[2] - n[2] * depth];
    const pl = P.plane([-j[0], -j[1], -j[2]], o);   // inside = in front of the plane, toward `dir`
    s = s ? s.intersect(pl) : pl;
  }
  return s.intersect(P.sphere(R).at(at[0], at[1], at[2]));
}

/** splinters at a broken end: n short tapered spikes from `end` roughly along `dir` */
export function splinters(end, dir, r, { n = 3, len = 0.2, seed = 1, rmin = 0.02, spread = 0.6 } = {}) {
  const rnd = P.prng(seed * 41 + 9), dn = P.norm(dir), out = [];
  for (let i = 0; i < n; i++) {
    const jn = P.norm([dn[0] + (rnd() - 0.5) * spread, dn[1] + (rnd() - 0.5) * spread, dn[2] + (rnd() - 0.5) * spread]);
    const off = [(rnd() - 0.5) * r * 1.2, (rnd() - 0.5) * r * 1.2, (rnd() - 0.5) * r * 1.2], L = len * (0.45 + 0.8 * rnd());
    const a = [end[0] + off[0] - dn[0] * r * 0.8, end[1] + off[1] - dn[1] * r * 0.8, end[2] + off[2] - dn[2] * r * 0.8];
    out.push(P.taperedCapsule(a, [a[0] + jn[0] * L, a[1] + jn[1] * L, a[2] + jn[2] * L], Math.max(rmin * 1.5, r * (0.3 + 0.25 * rnd())), rmin));
  }
  return out;
}

/** a flat leafy mass (bamboo spray, sapling leaves, moss tuft): a flattened core plus lobes, a ragged hanging lower rim
 *  of pointed leaf tips (drooping lance leaves). c = centre, rx along yaw, rz across, th thickness. */
export function spray(c, { rx, rz, th, yaw = 0, seed = 1, lobes = 5, tips = 0.5, droop = 0.25, far = false, tilt = 0 }) {
  const ct = Math.cos(tilt * D2R), st = Math.sin(tilt * D2R);
  const rnd = P.prng(seed * 131 + 7), L = [];
  const cy = Math.cos(yaw * D2R), sy = Math.sin(yaw * D2R);
  for (let i = 0; i < lobes; i++) {
    const t = lobes === 1 ? 0 : (i / (lobes - 1)) * 2 - 1, side = (rnd() - 0.5) * 1.2;
    const lx = t * rx * 0.55, lz = side * rz * 0.45;
    const lr = Math.min(rx, rz) * (0.5 + 0.3 * rnd()) * (1 - 0.25 * Math.abs(t));
    L.push([lx, (rnd() - 0.4) * th * 0.8 - droop * th * t * t, lz, lr, th * (0.38 + 0.2 * rnd())]);
  }
  const yb = -th * 0.25, sd = seed * 5 + 1, fr = 1 / Math.max(0.05, Math.min(rx, rz) * 0.32);
  const f = (x, y, z) => {
    const qx = x - c[0], qy0 = y - c[1], qz = z - c[2];
    const u0 = qx * sy + qz * cy, w = qx * cy - qz * sy;
    const u = u0 * ct - qy0 * st, qy = u0 * st + qy0 * ct;          // tilted: the outer end hangs down
    const ax = rx * 0.75, az = rz * 0.75, ay = th * 0.45;
    const dd = (u * u) / (rx * rx);
    const qyy = qy + droop * th * dd * 2;                                   // the spray arches down toward its ends
    const k0 = Math.hypot(u / ax, qyy / ay, w / az), k1 = Math.hypot(u / (ax * ax), qyy / (ay * ay), w / (az * az));
    let d = k1 < 1e-9 ? -ay : (k0 * (k0 - 1)) / k1;
    for (let i = 0; i < L.length; i++) {
      const l = L[i], ex = u - l[0], ey = qyy - l[1], ez = w - l[2];
      const a0 = Math.hypot(ex / l[3], ey / l[4], ez / l[3]), a1 = Math.hypot(ex / (l[3] * l[3]), ey / (l[4] * l[4]), ez / (l[3] * l[3]));
      d = P.smin(d, a1 < 1e-9 ? -l[4] : (a0 * (a0 - 1)) / a1, th * 0.35);
    }
    // lower rim: pointed leaf tips hanging down (cell centres = tips), stronger toward the rim
    const rim = clamp(Math.hypot(u / rx, w / rz) * 1.3 - 0.3, 0, 1);
    let hang = 0;
    if (!far) {
      const e = P.cellular(u * fr, 0, w * fr, sd);
      hang = th * tips * 2.4 * Math.pow(ss(0.75, 0.05, e), 1.5) * rim;
    }
    d = Math.max(d, (yb - hang) - qyy);
    if (!far && d < 0.05 && d > -0.05 && qyy > yb * 0.3) d -= th * 0.05 * (0.5 - P.cellular(x * fr * 1.6, y * fr * 1.6, z * fr * 1.6, sd + 1));
    return d;
  };
  const R = Math.max(rx, rz) * 1.2;
  return new P.Shape(f, [c[0] - R, c[1] - th * 3.2, c[2] - R, c[0] + R, c[1] + th * 1.4, c[2] + R], null, 2.2);
}

/** a bamboo leaf fan: `n` lance leaves fanned out of `b` around yaw (spread deg), drooping, softly joined at the base —
 *  a hand of pointed leaves, the silhouette that says bamboo. L = leaf length, w = half width. */
export function fan(b, { yaw = 0, n = 5, spread = 110, L = 0.34, w = 0.05, droop = 30, seed = 1, k = 0.035 }) {
  const rnd = P.prng(seed * 37 + 11), out = [];
  for (let j = 0; j < n; j++) {
    const f = n === 1 ? 0 : j / (n - 1) - 0.5, a = (yaw + f * spread + (rnd() - 0.5) * 18) * D2R;
    const e = (droop + Math.abs(f) * 30 + (rnd() - 0.5) * 16) * D2R, LL = L * (0.8 + 0.35 * rnd()) * (1 - 0.25 * Math.abs(f));
    const d = [Math.sin(a) * Math.cos(e), -Math.sin(e), Math.cos(a) * Math.cos(e)], side = [Math.cos(a), 0, -Math.sin(a)];
    const p0 = [b[0] - d[0] * 0.02, b[1] + 0.01, b[2] - d[2] * 0.02];
    const p1 = [b[0] + d[0] * LL * 0.45, b[1] + d[1] * LL * 0.3 + 0.03, b[2] + d[2] * LL * 0.45];
    const p2 = [b[0] + d[0] * LL, b[1] + d[1] * LL - LL * 0.12, b[2] + d[2] * LL];
    out.push(P.tube([p0, p1, p2], (t) => Math.max(0.009, w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.95)), 0.8)), { aspect: 0.38, up: side }));
  }
  return P.softUnion(k, ...out);
}

// ===================================================================================================== bamboo culms
/**
 * A culm: base [x, z], h (m), lean (horizontal reach of the top as a fraction of h, toward yaw deg), bow (m, sideways
 * at mid, toward bowYaw), nod (m: the tip arches over), r0 (base radius). Nodes from the internode list. Returns an object
 * with the curve, the radius profile and an SDF.
 */
export function makeCulm({ base, h, yaw = 0, lean = 0.06, bow = 0.1, bowYaw = 90, nod = 0.3, r0 = 0.055, seed = 1, first = 0.1, nodeMax = 0.5, sink = 0.12 }) {
  const D = [Math.sin(yaw * D2R), 0, Math.cos(yaw * D2R)], B = [Math.sin(bowYaw * D2R), 0, Math.cos(bowYaw * D2R)];
  const at = (t) => {
    const nn = ss(0.62, 1, t);
    const s = lean * h * t * t + nod * nn * nn, bw = bow * Math.sin(Math.PI * t);
    return [base[0] + D[0] * s + B[0] * bw, -sink + (h + sink) * t - nod * 0.55 * nn * nn * nn, base[1] + D[2] * s + B[2] * bw];
  };
  // arc table
  const N = 240, T = new Float64Array(N + 1), S = new Float64Array(N + 1);
  let prev = at(0), acc = 0;
  for (let i = 0; i <= N; i++) { const t = i / N, p = at(t); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]); prev = p; T[i] = t; S[i] = acc; }
  const L = acc;
  const sOf = (t) => { const f = clamp(t, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)); return S[i] + (S[i + 1] - S[i]) * (f - i); };
  const tOf = (s) => { let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] < s) lo = m; else hi = m; } return (lo + (s - S[lo]) / Math.max(1e-9, S[hi] - S[lo])) / N; };
  // nodes: short internodes at the foot, long in the middle, shorter again near the top (arc metres from the base)
  const rnd = P.prng(seed * 17 + 5), nodes = [];
  let s = sink + first;
  while (s < L * 0.93) { nodes.push(s); const u = s / L; s += nodeMax * (0.5 + 0.5 * ss(0.0, 0.3, u)) * (1 - 0.3 * ss(0.7, 1, u)) * (0.92 + 0.16 * rnd()); }
  // radius profile (arc s): base taper, thin tip; node ridges (k = 1.12 at the node, 0.96 just above, 1.03 just below)
  const rb = (s) => { const u = s / L; return r0 * (1 - 0.42 * u) * (1 - 0.72 * ss(0.8, 1, u)) * (1 + 0.12 * ss(0.06, 0, s - sink)); };
  const RING = 0.035, PRE = 0.03;
  const km = (s) => {
    // find the nearest node at or above / below
    let k = -1; for (let i = 0; i < nodes.length; i++) if (nodes[i] <= s + PRE) k = i; else break;
    if (k < 0) return 1;
    const n0 = nodes[k], d = s - n0;
    if (d < 0) return 1.03 + (1.12 - 1.03) * clamp((d + PRE) / PRE, 0, 1);    // just below the next ridge
    if (d < RING) return 1.12 + (0.96 - 1.12) * (d / RING);
    const n1 = nodes[k + 1];
    if (n1 == null) return 0.96;
    return 0.96 + (1.03 - 0.96) * clamp((d - RING) / Math.max(0.05, n1 - PRE - n0 - RING), 0, 1);
  };
  const R = (s) => rb(s) * km(s);
  // SDF: Newton from t = y / h on the curve
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i <= 40; i++) { const p = at(i / 40); for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], p[k] - r0 * 1.4); bb[k + 3] = Math.max(bb[k + 3], p[k] + r0 * 1.4); } }
  const near = (x, y, z) => {
    let t = clamp((y + sink) / (h + sink), 0, 1);
    for (let it = 0; it < 3; it++) {
      const p = at(t), q = at(Math.min(1, t + 1e-3)), o = at(Math.max(0, t - 1e-3)), dt = Math.min(1, t + 1e-3) - Math.max(0, t - 1e-3);
      const d = [(q[0] - o[0]) / dt, (q[1] - o[1]) / dt, (q[2] - o[2]) / dt], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      t = clamp(t + ((x - p[0]) * d[0] + (y - p[1]) * d[1] + (z - p[2]) * d[2]) / dd, 0, 1);
    }
    return t;
  };
  const f = (x, y, z) => { const t = near(x, y, z), p = at(t), s = sOf(t); return Math.hypot(x - p[0], y - p[1], z - p[2]) - R(s); };
  const shape = new P.Shape(f, bb, null, 1.25);
  return { at, L, sOf, tOf, nodes, R, rb, shape, near, D, h, sink, r0 };
}

/** node info at a surface point of a culm: { s (arc), u (0..1), dNode (m above the nearest node below; big if none) } */
export function culmInfo(cu, x, y, z) {
  const t = cu.near(x, y, z), s = cu.sOf(t);
  let below = -1e9; for (const n of cu.nodes) if (n <= s + 1e-4) below = n; else break;
  let above = 1e9; for (const n of cu.nodes) if (n > s + 1e-4) { above = n; break; }
  return { s, u: s / cu.L, dNode: s - below, toNext: above - s };
}

/** explicit culm mesh: loops at every node (`ring`: 3 loops / 1 loop / none), plus loops so no span is longer than
 *  `maxSpan`, `sides`-gon, closed at the foot, pointed at the tip. Returns { pos, idx, nrm } */
export function culmMesh(cu, { sides = 6, ring = 3, ring3Below = 1e9, ringBelow = 1e9, maxSpan = 0.8, twist = 0 } = {}) {
  // marks: arc position -> radius. 3-loop nodes follow the field profile (ridge 1.12, waist above, swell below); 1-loop
  // nodes sit at a mild 1.05 (the node is carried by paint there); spans between are straight at the base taper.
  const marks = new Map([[0, cu.rb(0)]]);
  for (const n of cu.nodes) {
    const k = ring >= 3 && n < ring3Below ? 3 : ring >= 1 && n < ringBelow ? 1 : 0;
    if (k >= 3) for (const d of [-0.03, 0, 0.035]) marks.set(n + d, cu.R(n + d));
    else if (k >= 1) marks.set(n, cu.rb(n) * 1.05);
  }
  marks.set(cu.L * 0.995, cu.rb(cu.L * 0.995));
  let list = [...marks.keys()].filter((s) => s >= 0 && s <= cu.L).sort((a, b) => a - b);
  const out = [list[0]];
  for (let i = 1; i < list.length; i++) {
    const a = out[out.length - 1], b = list[i];
    const n = Math.ceil((b - a) / maxSpan);
    for (let k = 1; k < n; k++) { const s = a + (b - a) * k / n; out.push(s); marks.set(s, cu.rb(s)); }
    out.push(b);
  }
  list = out;
  const pos = [], nrm = [], idx = [];
  let ref = [1, 0, 0];
  const frames = list.map((s) => {
    const t = cu.tOf(s), p = cu.at(t), q = cu.at(Math.min(1, t + 0.002)), o = cu.at(Math.max(0, t - 0.002));
    const d = P.norm([q[0] - o[0], q[1] - o[1], q[2] - o[2]]);
    let u = P.norm(P.cross(d, ref)); if (!isFinite(u[0])) u = [1, 0, 0];
    const w = P.cross(u, d); ref = w;
    // radius for the mesh: the profile itself (ring = 1: the node loop at its ridge value, internodes straight)
    const r = marks.get(s);
    return { p, d, u, w, r };
  });
  frames.forEach((F, i) => {
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * 6.2832 + twist * D2R + (i % 2) * (ring >= 3 ? 0 : 0);
      const ca = Math.cos(a), sa = Math.sin(a);
      const n = [F.u[0] * ca + F.w[0] * sa, F.u[1] * ca + F.w[1] * sa, F.u[2] * ca + F.w[2] * sa];
      pos.push(F.p[0] + n[0] * F.r, F.p[1] + n[1] * F.r, F.p[2] + n[2] * F.r); nrm.push(...n);
    }
  });
  const nl = frames.length;
  for (let i = 0; i < nl - 1; i++) for (let k = 0; k < sides; k++) {
    const a0 = i * sides + k, a1 = i * sides + (k + 1) % sides, b0 = a0 + sides, b1 = a1 + sides;
    idx.push(a0, a1, b0, a1, b1, b0);
  }
  // foot cap (below ground, a fan) and tip point
  const F0 = frames[0], c0 = pos.length / 3; pos.push(...F0.p); nrm.push(0, -1, 0);
  for (let k = 0; k < sides; k++) idx.push(c0, (k + 1) % sides, k);
  const Fl = frames[nl - 1], tipT = 1, tp = cu.at(tipT), c1 = pos.length / 3; pos.push(...tp); nrm.push(...Fl.d);
  for (let k = 0; k < sides; k++) idx.push(c1, (nl - 1) * sides + k, (nl - 1) * sides + (k + 1) % sides);
  return { pos: Float32Array.from(pos), idx: flipW(idx), nrm: Float32Array.from(nrm) };
}
/** the ring frames turn clockwise about the tangent: reverse every triangle so faces wind outward */
function flipW(idx) { const o = Uint32Array.from(idx); for (let i = 0; i < o.length; i += 3) { const t = o[i + 1]; o[i + 1] = o[i + 2]; o[i + 2] = t; } return o; }

/** a thin twig as an explicit few-sided tube along points, radius r0 -> r1 */
export function twigMesh(pts, r0, r1, sides = 3) {
  const pos = [], nrm = [], idx = [], n = pts.length;
  let ref = [0.3, 1, 0.2];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)], d = P.norm([q[0] - o[0], q[1] - o[1], q[2] - o[2]]);
    const u = P.norm(P.cross(d, ref)), w = P.cross(u, d); ref = w;
    const r = r0 + (r1 - r0) * (i / (n - 1));
    for (let k = 0; k < sides; k++) { const a = (k / sides) * 6.2832, nn = [u[0] * Math.cos(a) + w[0] * Math.sin(a), u[1] * Math.cos(a) + w[1] * Math.sin(a), u[2] * Math.cos(a) + w[2] * Math.sin(a)]; pos.push(p[0] + nn[0] * r, p[1] + nn[1] * r, p[2] + nn[2] * r); nrm.push(...nn); }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) { const a0 = i * sides + k, a1 = i * sides + (k + 1) % sides; idx.push(a0, a1, a0 + sides, a1, a1 + sides, a0 + sides); }
  const c1 = pos.length / 3, e = pts[n - 1], dd = P.norm([e[0] - pts[n - 2][0], e[1] - pts[n - 2][1], e[2] - pts[n - 2][2]]);
  pos.push(e[0] + dd[0] * r1, e[1] + dd[1] * r1, e[2] + dd[2] * r1); nrm.push(...dd);
  for (let k = 0; k < sides; k++) idx.push(c1, (n - 1) * sides + k, (n - 1) * sides + (k + 1) % sides);
  return { pos: Float32Array.from(pos), idx: flipW(idx), nrm: Float32Array.from(nrm) };
}
function concatMesh(list) {
  let nv = 0, ni = 0; for (const m of list) { nv += m.pos.length; ni += m.idx.length; }
  const pos = new Float32Array(nv), nrm = new Float32Array(nv), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const m of list) { pos.set(m.pos, o); nrm.set(m.nrm, o); for (let i = 0; i < m.idx.length; i++) idx[oi + i] = m.idx[i] + o / 3; o += m.pos.length; oi += m.idx.length; }
  return { pos, nrm, idx };
}

// ===================================================================================================== bamboo clump
/**
 * spec: { culms: [{ base:[x,z], h, yaw, lean, bow, bowYaw, nod, r0, seed, leafFrom, sheath, tone }], shoots: [{ base, h,
 * r0, yaw, seed }], stubs: [{ base, h, r0, yaw, seed, cut: 'break' | 'saw' }], mound: [rx, ry, rz], litter: n, seed }
 * Derived (deterministic): culm objects, twigs (from every other node in the leafy top), sprays (at twig ends, plus a
 * drooping tip spray per culm).
 */
const PLANS = new Map();
export function bambooPlan(spec) {
  if (PLANS.has(spec)) return PLANS.get(spec);
  const culms = spec.culms.map((c, i) => makeCulm({ ...c, seed: c.seed ?? i + 1 }));
  const twigs = [], sprays = [];
  culms.forEach((cu, i) => {
    const c = spec.culms[i], rnd = P.prng((c.seed ?? i + 1) * 61 + 11), from = c.leafFrom ?? 0.55;
    let side = rnd() < 0.5 ? 1 : -1;
    const yaw0 = c.yaw ?? 0, cnt = c.masses ?? 3, top = 0.9;
    for (let k = 0; k < cnt; k++) {
      // node nearest to an evenly spread, jittered position in the leafy top
      const want = (from + (top - from) * ((k + 0.25 + 0.5 * rnd()) / cnt)) * cu.L;
      let n = cu.nodes[0]; for (const q of cu.nodes) if (Math.abs(q - want) < Math.abs(n - want)) n = q;
      const u = n / cu.L;
      side = -side;
      const t = cu.tOf(n), p = cu.at(t);
      const yaw = yaw0 + side * (60 + 70 * rnd()), yr = yaw * D2R;
      const d = [Math.sin(yr), 0, Math.cos(yr)];
      const g = (u - from) / (top - from);
      const len = (0.18 + 0.12 * rnd()) * (c.twig ?? 1);
      const mid = [p[0] + d[0] * len * 0.5, p[1] + len * 0.25, p[2] + d[2] * len * 0.5];
      const end = [p[0] + d[0] * len, p[1] + len * 0.3, p[2] + d[2] * len];
      twigs.push({ pts: [p, mid, end], r0: Math.max(0.013, cu.rb(n) * 0.26), r1: 0.009, culm: i });
      const rx = (0.5 + 0.14 * rnd()) * (c.leaf ?? 1) * (1.08 - 0.3 * g), rz = rx * (0.7 + 0.15 * rnd()), th = (0.21 + 0.08 * rnd()) * (c.leaf ?? 1) * (1.05 - 0.25 * g);
      const cc = [end[0] + d[0] * rx * 0.45, end[1] - th * 0.3, end[2] + d[2] * rx * 0.45];
      const tilt = 20 + 16 * rnd();
      const sprayDef = { c: cc, rx, rz, th, yaw, tilt, seed: i * 50 + k * 3, culm: i, u, fans: [] };
      // single lance leaves breaking out of the outer and lower rim (BUILT, crisp points; LOD0 all, LOD1 the first two)
      sprayDef.leaves = rimLeaves(cc, rx, rz, th, yaw, tilt, c.leaves ?? 6, rnd);
      sprays.push(sprayDef);
    }
    // the drooping tip
    const tp = cu.at(1), tq = cu.at(0.96), td = P.norm([tp[0] - tq[0], 0, tp[2] - tq[2]]), ty = Math.atan2(td[0], td[2]) / D2R;
    const rx = 0.4 * (c.leaf ?? 1), tc = [tp[0] + td[0] * rx * 0.15, tp[1] - 0.2, tp[2] + td[2] * rx * 0.15];
    sprays.push({ c: tc, rx, rz: rx * 0.7, th: 0.24, yaw: ty, tilt: 28, seed: i * 50 + 49, culm: i, u: 1, leaves: rimLeaves(tc, rx, rx * 0.7, 0.24, ty, 28, 5, rnd, 300) });
  });
  // keep the crown inside the old footprint: pull spray centres in toward the axis where they would overhang `reach`
  if (spec.reach) for (const sp of sprays) {
    // the farthest point of the mass and its leaves, measured from the axis
    let far = Math.hypot(sp.c[0], sp.c[2]) + sp.rx * 0.85;
    for (const l of sp.leaves) far = Math.max(far, Math.hypot(l.b[0] + l.d[0] * l.L, l.b[2] + l.d[2] * l.L));
    const r = Math.hypot(sp.c[0], sp.c[2]);
    if (far > spec.reach && r > 1e-6) { const k = Math.max(0.15, (r - (far - spec.reach)) / r), dx = sp.c[0] * (k - 1), dz = sp.c[2] * (k - 1); sp.c[0] += dx; sp.c[2] += dz; for (const l of sp.leaves) { l.b[0] += dx; l.b[2] += dz; } }
  }
  const plan = { culms, twigs, sprays };
  PLANS.set(spec, plan);
  return plan;
}

/** leaves round a mass: spread over the outer half of the rim (around yaw, +-spreadDeg), pointing out and down */
function rimLeaves(cc, rx, rz, th, yaw, tilt, n, rnd, spreadDeg = 200) {
  const out = [];
  for (let j = 0; j < n; j++) {
    const f = n === 1 ? 0 : j / (n - 1) - 0.5, a = (yaw + f * spreadDeg + (rnd() - 0.5) * 22) * D2R;
    const ca = Math.cos(a - yaw * D2R), ell = 1 / Math.hypot(ca / rx, Math.sin(a - yaw * D2R) / rz);    // rim radius at a
    const drop = Math.max(0, ca) * ell * Math.sin(tilt * D2R);
    const b = [cc[0] + Math.sin(a) * ell * 0.78, cc[1] - th * (0.15 + 0.2 * rnd()) - drop, cc[2] + Math.cos(a) * ell * 0.78];
    const e = (28 + 26 * rnd()) * D2R, d = [Math.sin(a) * Math.cos(e), -Math.sin(e), Math.cos(a) * Math.cos(e)];
    out.push({ b, d, L: 0.26 + 0.12 * rnd(), w: 0.042 + 0.012 * rnd(), roll: (rnd() - 0.5) * 0.5 });
  }
  return out;
}
/** one lance leaf as a field (for AO / paint): a flattened tapered tube */
function leafShape({ b, d, L, w }) {
  const side = P.norm(P.cross(d, [0, 1, 0])), m = [b[0] + d[0] * L * 0.5, b[1] + d[1] * L * 0.5 + 0.02, b[2] + d[2] * L * 0.5], t = [b[0] + d[0] * L, b[1] + d[1] * L - L * 0.15, b[2] + d[2] * L];
  return P.tube([b, m, t], (u) => Math.max(0.006, w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + u)), 0.7)), { aspect: 0.3, up: side });
}
/** one lance leaf as an explicit closed mesh: base, two edge points, tip, a raised rib on top and a keel below (8 tris) */
export function leafMesh({ b, d, L, w, roll = 0 }) {
  let side = P.norm(P.cross(d, [0, 1, 0])), up = P.norm(P.cross(side, d));
  // roll the blade a little about its own axis
  const cr = Math.cos(roll), sr = Math.sin(roll);
  [side, up] = [[side[0] * cr + up[0] * sr, side[1] * cr + up[1] * sr, side[2] * cr + up[2] * sr], [up[0] * cr - side[0] * sr, up[1] * cr - side[1] * sr, up[2] * cr - side[2] * sr]];
  const at = (u, dy) => [b[0] + d[0] * L * u, b[1] + d[1] * L * u - L * 0.15 * u * u + dy, b[2] + d[2] * L * u];
  const q = at(0.38, 0.01), tip = at(1, 0), th = Math.max(0.008, w * 0.22);
  const V = [b, [q[0] + side[0] * w, q[1] + side[1] * w, q[2] + side[2] * w], tip, [q[0] - side[0] * w, q[1] - side[1] * w, q[2] - side[2] * w], [q[0] + up[0] * th, q[1] + up[1] * th, q[2] + up[2] * th], [q[0] - up[0] * th, q[1] - up[1] * th, q[2] - up[2] * th]];
  const F = [[0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0], [0, 1, 5], [1, 2, 5], [2, 3, 5], [3, 0, 5]];
  const pos = [], nrm = [], idx = [];
  // flat-ish shading: each face its own vertices (crisp fold along the rib), normals bent toward `up` for a soft read
  for (const f of F) {
    const A = V[f[0]], B = V[f[1]], Cc = V[f[2]];
    let n = P.norm(P.cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]]));
    const s = n[0] * up[0] + n[1] * up[1] + n[2] * up[2] >= 0 ? 1 : -1;
    n = P.norm([n[0] + up[0] * s * 0.6, n[1] + up[1] * s * 0.6, n[2] + up[2] * s * 0.6]);
    for (const v of [A, B, Cc]) { idx.push(pos.length / 3); pos.push(...v); nrm.push(...n); }
  }
  // make every face wind outward (away from the leaf's centre)
  const cx = (V[4][0] + V[5][0]) / 2, cy = (V[4][1] + V[5][1]) / 2, cz = (V[4][2] + V[5][2]) / 2;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, bb = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const n = P.cross([pos[bb] - pos[a], pos[bb + 1] - pos[a + 1], pos[bb + 2] - pos[a + 2]], [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]]);
    const mx = (pos[a] + pos[bb] + pos[c]) / 3 - cx, my = (pos[a + 1] + pos[bb + 1] + pos[c + 1]) / 3 - cy, mz = (pos[a + 2] + pos[bb + 2] + pos[c + 2]) / 3 - cz;
    if (n[0] * mx + n[1] * my + n[2] * mz < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), nrm: Float32Array.from(nrm) };
}

/** the clump field. Parts (registered in this order by the caller): culm, twig, leafspray, sheath, shoot, stub, foot, litter */
export function bambooField(S, spec, paints) {
  const far = FAR(), noc = NOCULM(), mid = MID(), plan = bambooPlan(spec);
  const pieces = [];
  if (!noc) {
    pieces.push(bunion(plan.culms.map((c) => c.shape)).part('culm', { mat: 'wood', paint: paints.culm }));
    if (!far) pieces.push(bunion(plan.twigs.map((t) => limb(t.pts, t.r0, t.r1, 1))).part('twig', { mat: 'wood', paint: paints.twig }));
  }
  // leaf sprays
  const masses = plan.sprays.map((p) => spray(p.c, { rx: p.rx * (far ? 1.05 : 1), rz: p.rz * (far ? 1.1 : 1), th: p.th * (far ? 1.15 : 1), yaw: p.yaw, tilt: p.tilt, seed: p.seed, lobes: far ? 2 : mid ? 4 : 5, tips: mid ? 0.6 : 0.5, droop: 0.3, far }));
  if (!far && !mid && !noc) for (const p of plan.sprays) for (const l of p.leaves) masses.push(leafShape(l));
  pieces.push(bunion(masses).part('leafspray', { mat: 'crown', paint: paints.leaf }));
  // sheaths: sleeves round the lowest internodes, each with a pointed blade peeling off at its top
  const sh = [];
  plan.culms.forEach((cu, i) => {
    const n = spec.culms[i].sheath || 0;
    for (let k = 0; k < n && k < cu.nodes.length - 1; k++) {
      const s0 = cu.nodes[k] - 0.02, s1 = cu.nodes[k + 1] - 0.05 + (k === n - 1 ? -0.08 : 0.06);
      sh.push(...sheath(cu, s0, s1, (spec.culms[i].seed ?? i) * 7 + k, far));
    }
  });
  for (const sp of spec.shoots || []) sh.push(...shoot(sp, far));
  if (sh.length) pieces.push(bunion(sh).part('sheath', { mat: 'wood', paint: paints.sheath }));
  // stubs of old culms: broken (splinters) or cut on a slant (harvested)
  const stubs = [];
  for (const st of spec.stubs || []) {
    const cu = makeCulm({ base: st.base, h: st.h + 0.3, yaw: st.yaw ?? 0, lean: 0.01, bow: 0.005, nod: 0, r0: st.r0, seed: st.seed ?? 3, first: 0.08, nodeMax: 0.3 });
    let s = cu.shape;
    const top = cu.at(st.h / (st.h + 0.3 + cu.sink)), yr = (st.yaw ?? 0) * D2R;
    if (st.cut === 'saw') {
      s = s.cut(P.plane([Math.sin(yr) * 0.55, -1, Math.cos(yr) * 0.55], [top[0], top[1], top[2]]).intersect(P.sphere(0.4).at(top[0], top[1] + 0.25, top[2])));
      // hollow: a culm is a tube; the slant cut shows the dark hollow inside
      s = s.cut(P.capsule([top[0], top[1] - 0.12, top[2]], [top[0], top[1] + 0.3, top[2]], st.r0 * 0.62));
    } else {
      s = s.cut(P.sphere(st.r0 * 6).at(top[0] + Math.sin(yr) * st.r0 * 0.8, top[1] + st.r0 * 6 - 0.02, top[2] + Math.cos(yr) * st.r0 * 0.8));
      s = s.cut(P.capsule([top[0], top[1] - 0.1, top[2]], [top[0], top[1] + 0.3, top[2]], st.r0 * 0.6));
      if (!far) s = s.add(bunion(splinters([top[0], top[1] - 0.05, top[2]], [Math.sin(yr) * 0.3, 1, Math.cos(yr) * 0.3], st.r0 * 0.7, { n: 3, len: 0.16, seed: st.seed ?? 5, rmin: 0.014, spread: 0.5 })));
    }
    stubs.push(s);
  }
  if (stubs.length) pieces.push(bunion(stubs).part('stub', { mat: 'wood', paint: paints.stub }));
  // the foot: a low rhizome mound with two knuckles of rhizome arching out of it
  const [mx, my, mz] = spec.mound || [0.5, 0.14, 0.45];
  let foot = S.ellipsoid([mx, my * 2, mz]).at(0.02, -my * 0.9, -0.02);
  if (!far && !mid) {
    const rnd = P.prng((spec.seed || 1) * 7 + 2), kn = [];
    for (let i = 0; i < (spec.knuckles ?? 2); i++) {
      const a = (i * 2.4 + rnd() * 1.2), d = [Math.sin(a), Math.cos(a)], L = mx * (0.9 + 0.4 * rnd());
      kn.push(limb([[d[0] * mx * 0.5, my * 0.6, d[1] * mz * 0.5], [d[0] * L * 0.85, my * 0.75, d[1] * L * 0.85], [d[0] * L * 1.2, 0.0, d[1] * L * 1.2], [d[0] * L * 1.35, -0.06, d[1] * L * 1.35]], 0.04, 0.03, 1));
    }
    foot = foot.softAdd(bunion(kn), 0.04);
    foot = foot.rough({ type: 'cellular', scale: 0.09, amp: 0.012, seed: 4 });
  }
  pieces.push(foot.part('foot', { mat: 'wood', paint: paints.foot }));
  // dry leaf litter: lance leaves lying on the mound and the ground round it, half sunk
  if (!far && !mid && spec.litter) {
    const rnd = P.prng((spec.seed || 1) * 13 + 9), lv = [];
    for (let i = 0; i < spec.litter; i++) {
      const a = rnd() * 6.283, rr = (0.15 + 0.85 * Math.sqrt(rnd())) * (mx + 0.35), x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      const e = Math.max(0, 1 - (x * x) / (mx * mx) - (z * z) / (mz * mz)), y = e > 0 ? my * 1.1 * Math.sqrt(e) - my * 0.9 + 0.0 : 0;
      const L = 0.09 + 0.05 * rnd();
      lv.push(S.ellipsoid([L, 0.016, L * 0.24]).turn((rnd() - 0.5) * 20, rnd() * 360, (rnd() - 0.5) * 20).at(x, Math.max(0, y) + 0.003, z));
    }
    pieces.push(bunion(lv).part('litter', { mat: 'wood', paint: paints.litter }));
  }
  let all = pieces[0];
  for (let i = 1; i < pieces.length; i++) all = all.add(pieces[i]);
  return floorAt(all, 0);
}
/** a sheath sleeve on a culm between arc s0 and s1: a slightly flared cone around the culm, a pointed blade peeling out */
function sheath(cu, s0, s1, seed, far) {
  const rnd = P.prng(seed * 19 + 1), out = [];
  const t0 = cu.tOf(s0), t1 = cu.tOf(s1), a = cu.at(t0), b = cu.at(t1), r0 = cu.rb(s0) * 1.32, r1 = cu.rb(s1) * 1.16;
  out.push(P.taperedCapsule(a, b, r0, r1));
  if (!far) {
    // the blade: a narrow pointed tongue from the sleeve top, curling out and down
    const yr = rnd() * 6.283, d = [Math.sin(yr), 0, Math.cos(yr)], L = 0.12 + 0.08 * rnd();
    const p0 = [b[0] + d[0] * r1 * 0.8, b[1] - 0.02, b[2] + d[2] * r1 * 0.8];
    out.push(P.tube([p0, [p0[0] + d[0] * L * 0.4, p0[1] + L * 0.6, p0[2] + d[2] * L * 0.4], [p0[0] + d[0] * L * 0.95, p0[1] + L * 0.85, p0[2] + d[2] * L * 0.95]], (t) => 0.026 * (1 - 0.75 * t), { aspect: 0.45, up: [d[0], 0.2, d[2]] }));
  }
  return out;
}
/** a young shoot: stacked sheath cones to a spear point, the upper ones with blades flaring out */
function shoot({ base, h, r0 = 0.06, yaw = 0, seed = 1 }, far) {
  const rnd = P.prng(seed * 23 + 4), out = [], yr = yaw * D2R, lean = [Math.sin(yr) * 0.05, Math.cos(yr) * 0.05];
  const n = far ? 2 : 5;
  let y = -0.08;
  for (let i = 0; i < n; i++) {
    const f0 = y / h, y1 = Math.min(h, y + h * (i === n - 1 ? 1 : 0.3 - 0.03 * i));
    const rA = r0 * (1.25 - 0.95 * f0), rB = Math.max(0.012, r0 * (1.25 - 0.95 * (y1 / h)) * (i === n - 1 ? 0.18 : 0.9));
    const A = [base[0] + lean[0] * y, y, base[1] + lean[1] * y], B = [base[0] + lean[0] * y1, y1, base[1] + lean[1] * y1];
    out.push(P.taperedCapsule(A, B, rA, rB));
    if (!far && i > 0) {
      const a = rnd() * 6.283, d = [Math.sin(a), 0, Math.cos(a)], L = 0.1 + 0.08 * (i / n);
      const p0 = [B[0] + d[0] * rB * 0.7, B[1] - 0.03, B[2] + d[2] * rB * 0.7];
      out.push(P.tube([p0, [p0[0] + d[0] * L * 0.35, p0[1] + L * 0.7, p0[2] + d[2] * L * 0.35], [p0[0] + d[0] * L * 0.8, p0[1] + L * 1.0, p0[2] + d[2] * L * 0.8]], (t) => 0.024 * (1 - 0.7 * t), { aspect: 0.45, up: [d[0], 0.2, d[2]] }));
    }
    y = y1 - 0.04;
    if (y1 >= h) break;
  }
  return out;
}
/** built meshes for LOD li: culms (+ twigs on LOD0/1) */
export function bambooBuilt(spec, li) {
  const plan = bambooPlan(spec), out = [];
  const opt = [{ sides: spec.sides0 ?? 6, ring: 3, ring3Below: spec.ring3Below ?? 2.2, ringBelow: spec.ring1Below ?? 4.4, maxSpan: 1.1 }, { sides: 4, ring: 1, ringBelow: spec.ring1BelowLod1 ?? 3.0, maxSpan: 1.6 }, { sides: 4, ring: 0, maxSpan: 2.8 }][li];
  for (const cu of plan.culms) out.push({ ...culmMesh(cu, opt), part: 'culm' });
  if (li === 0) for (const t of plan.twigs) out.push({ ...twigMesh([t.pts[0], t.pts[2]], t.r0, t.r1, 3), part: 'twig' });
  if (li < 2) for (const sp of plan.sprays) sp.leaves.forEach((l, j) => { if (li === 0 || j % 3 === 1) out.push({ ...leafMesh(li === 0 ? l : { ...l, L: l.L * 1.15, w: l.w * 1.4 }), part: 'leafspray' }); });
  return out;
}
/** which culm a point belongs to (nearest by the field) and its node info */
export function nearestCulm(spec, x, y, z) {
  const plan = bambooPlan(spec);
  let best = 1e9, bi = 0;
  plan.culms.forEach((cu, i) => { const d = Math.abs(cu.shape.f(x, y, z)); if (d < best) { best = d; bi = i; } });
  return { i: bi, ...culmInfo(plan.culms[bi], x, y, z), cu: plan.culms[bi] };
}

// ===================================================================================================== dead wood
/** a lying log: axis from a to b (points), radius r(t) (t 0..1 along), cross-section a little flattened where it lies
 *  (aspect < 1 squashes vertically), sinking `sink` into the ground. */
export function logBody(a, b, r, { aspect = 0.92, lumps = 0.0, seed = 1 } = {}) {
  const R = typeof r === 'function' ? r : () => r;
  const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...ax), d = ax.map((v) => v / L);
  let rmax = 0; for (let i = 0; i <= 20; i++) rmax = Math.max(rmax, R(i / 20));
  const f = (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const h = px * d[0] + py * d[1] + pz * d[2], t = clamp(h / L, 0, 1);
    const qx = px - d[0] * h, qy = py - d[1] * h, qz = pz - d[2] * h;
    let rr = R(t);
    if (lumps) rr *= 1 + lumps * P.noise3(x * 1.3, y * 1.3, z * 1.3, seed);
    const rad = Math.hypot(qx, qy / aspect, qz) - rr;
    const cap = Math.max(-h, h - L);
    return cap > 0 ? Math.hypot(Math.max(rad, 0), cap) + Math.min(Math.max(rad, cap), 0) : Math.max(rad, cap);
  };
  const bb = [Math.min(a[0], b[0]) - rmax, Math.min(a[1], b[1]) - rmax, Math.min(a[2], b[2]) - rmax, Math.max(a[0], b[0]) + rmax, Math.max(a[1], b[1]) + rmax, Math.max(a[2], b[2]) + rmax];
  return new P.Shape(f, bb, null, 1.15 + lumps * 2);
}
/** a moss blanket over `base`: base grown by `t` (+ cushion bumps) only where mask(x,y,z) > 0 (signed, metres-ish); the
 *  edge of the mask is a little cliff — the blanket reads as a growth lying on the wood */
export function mossBlanket(base, t, mask, { seed = 1, bump = 0.5, scale = 0.07, taper = 0, edge = 0.4 } = {}) {
  const f = base.f;
  return new P.Shape((x, y, z) => {
    const m = mask(x, y, z);
    const e = P.cellular(x / scale, y / scale, z / scale, seed);
    // taper > 0: a cushion, thick inside the patch, thinning to `edge` x t at its rim (no tarp-like cliff)
    const tt = taper > 0 ? t * (edge + (1 - edge) * ss(0, taper, m)) : t;
    const d = f(x, y, z) - tt * (1 + bump * (0.5 - e));
    return Math.max(d, -m);
  }, [base.b[0] - t * 2, base.b[1] - t * 2, base.b[2] - t * 2, base.b[3] + t * 2, base.b[4] + t * 2, base.b[5] + t * 2], null, 1.4);
}
/** a mushroom: stem from `at` along dir (len, r), cap (radius R) — returns { stem, cap } */
export function mushroom(at, dir, len, r, R, { tilt = 0 } = {}) {
  const d = P.norm(dir), top = [at[0] + d[0] * len, at[1] + d[1] * len, at[2] + d[2] * len];
  const stem = P.taperedCapsule([at[0] - d[0] * 0.02, at[1] - d[1] * 0.02, at[2] - d[2] * 0.02], top, r * 1.15, r);
  const cap = P.ellipsoid([R, R * 0.55, R]).cut(P.ellipsoid([R * 0.85, R * 0.3, R * 0.85]).at(0, -R * 0.32, 0)).aim(d).at(top[0], top[1], top[2]);
  return { stem, cap };
}
/** a shelf (bracket) fungus on a surface at `at` facing horizontal yaw (deg): a half-disc, thick at the wood, thin rim,
 *  growth ridges round the rim, flat underside */
export function shelf(at, yaw, R, { th = 0.06, seed = 1 } = {}) {
  const yr = yaw * D2R, d = [Math.sin(yr), 0, Math.cos(yr)];
  let s = P.ellipsoid([R, th, R * 0.8]).warp((x, y, z, o) => { const q = Math.hypot(x, z) / R; o[1] = y + th * 0.35 * q * q; });
  s = s.add(P.torus(R * 0.62, th * 0.32).at(0, th * 0.35, 0)).add(P.torus(R * 0.84, th * 0.24).at(0, th * 0.1, 0));
  s = s.cut(P.box([R * 3, th * 3, R * 3]).at(0, -th * 1.62, 0));                      // flat underside
  // keep the half that sticks out (+Z local), sunk into the wood
  s = s.intersect(P.box([R * 2.4, th * 4, R * 1.4]).at(0, 0, R * 0.55));
  return s.turn(0, yaw, 0).at(at[0] - d[0] * R * 0.15, at[1], at[2] - d[2] * R * 0.15);
}
/** growth rings on a sawn face: value 0..1 (1 = the dark late-wood line), pith at `c` in the face plane spanned by u, v */
export function rings(x, y, z, c, u, v, { spacing = 0.022, seed = 3 } = {}) {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  const a = px * u[0] + py * u[1] + pz * u[2], b = px * v[0] + py * v[1] + pz * v[2];
  const r = Math.hypot(a, b) * (1 + 0.12 * Math.sin(Math.atan2(b, a) * 2 + 1.3)) + 0.012 * P.fbm(a * 6, b * 6, 0, seed, 2);
  const f = (r / spacing) % 1;
  return Math.pow(ss(0.55, 0.92, f) * ss(1.0, 0.92, f), 0.7);
}

/** bark FURROWS along a lying log's axis (z, or x with axis 'x'): n long grooves round the section, wandering a little,
 *  broken into long plates by cross-gaps; centre(t) gives the section centre [a, y] at the axial coordinate */
export function furrows(shape, { axis = 'z', centre = () => [0, 0], n = 9, depth = 0.02, width = 0.16, wob = 0.9, seed = 1, plate = 0.45, where = null }) {
  const f = shape.f;
  return new P.Shape((x, y, z) => {
    const d = f(x, y, z);
    if (d > depth * 3 + 0.02 || d < -depth * 4) return d;
    const m = where ? where(x, y, z) : 1;
    if (m <= 0) return d;
    const t = axis === 'z' ? z : axis === 'y' ? y : x, cen = centre(t), a = axis === 'z' ? x - cen[0] : axis === 'y' ? x - cen[0] : z - cen[0], b = axis === 'y' ? z - cen[1] : y - cen[1];
    const th = Math.atan2(b, a), ca = Math.cos(th), sa = Math.sin(th);
    const ph = n * th + wob * P.fbm(ca * 1.2 + 3, sa * 1.2, t * 0.9, seed, 2) * 3;
    let g = ss(1 - width, 1, Math.cos(ph));
    // cross gaps: every plate ends somewhere (long plates, not endless lines)
    const cut = P.fbm(ca * 2 + t * 0.2, sa * 2, t / plate, seed + 7, 2);
    g = Math.max(g, 0.85 * ss(0.32, 0.42, cut) * ss(1 - width * 3, 1, Math.cos(ph * 0.5 + 1)));
    return d + depth * m * g;
  }, shape.b, shape.pf, shape.lip + depth * n * 0.6 / 0.05);
}
/** concentric ring grooves (and one radial check) on a flat end face: centre c, face normal nrm (outward), rings every
 *  `spacing`, groove `width` wide, `depth` deep, within radius R */
export function ringFace(shape, c, nrm, { spacing = 0.055, width = 0.012, depth = 0.01, R = 0.25, check = 0.6, checkW = 0.012 } = {}) {
  const f = shape.f, n = P.norm(nrm), u = P.norm(P.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = P.cross(n, u);
  return new P.Shape((x, y, z) => {
    const d = f(x, y, z);
    const px = x - c[0], py = y - c[1], pz = z - c[2], h = px * n[0] + py * n[1] + pz * n[2];
    if (Math.abs(h) > depth * 3 || d > depth * 3) return d;
    const a = px * u[0] + py * u[1] + pz * u[2], b = px * v[0] + py * v[1] + pz * v[2], r = Math.hypot(a, b);
    if (r > R) return d;
    const q = (r % spacing) - spacing * 0.5, gr = ss(width, 0, Math.abs(q)) * (r > spacing * 0.6 ? 1 : 0);
    const ang = Math.atan2(b, a), ck = ss(checkW, 0, Math.abs(r * Math.sin(ang - check))) * (Math.cos(ang - check) > 0 ? 1 : 0) * ss(0.02, 0.06, r);
    return d + depth * Math.max(gr, ck * 1.4) * ss(depth * 3, 0, Math.abs(h));
  }, shape.b, shape.pf, shape.lip + 1.5);
}

/** shared dead-wood paints (sRGB looks; wrap with lit() for the 'trunk' material) */
export const WOODPAINT = {
  bark(c) {
    const { x, y, z, ny, cavity, edge } = c;
    let col = mix(C('#5d4636'), C('#6e5442'), ss(-0.3, 0.6, ny));
    col = mix(col, C('#8b705a'), edge * 0.7);
    col = mix(col, C('#2a1d16'), Math.min(1, cavity * 1.6));
    col = mix(col, C('#4c4834'), ss(0.1, 0.0, y) * 0.55 + ss(-0.2, -0.8, ny) * 0.25);         // damp, greenish underneath
    return col;
  },
  // weathered bare wood: silver-tan, the fissures dark, the ridges pale
  bare(c) {
    const { x, y, z, ny, cavity, edge } = c;
    let col = mix(C('#8e7f6c'), C('#a29482'), ss(-0.2, 0.8, ny));
    col = mix(col, C('#c3b6a2'), edge * 0.6);
    col = mix(col, C('#2e241d'), Math.min(1, cavity * 1.7));
    return mix(col, C('#5a5440'), ss(0.12, 0.0, y) * 0.5);
  },
  // rotten wood: warm brown-orange, crumbly, dark in every pit
  rot(c) {
    const { x, y, z, cavity, edge, ao } = c;
    let col = mix(C('#7a5233'), C('#9a6a42'), 0.5 + 0.5 * P.fbm(x * 7, y * 7, z * 7, 8, 2));
    col = mix(col, C('#b8895e'), edge * 0.4);
    return mix(col, C('#24170f'), Math.min(1, cavity * 1.5 + (1 - ao) * 0.6));
  },
  hollow(c) { const { ao, edge } = c; return mix(mix(C('#1c130e'), C('#3a281b'), ao), C('#6a4b33'), edge * 0.5); },
  // fresh break / sawn / chopped wood: pale
  fresh(c) {
    const { x, y, z, edge, cavity } = c;
    let col = mix(C('#d4b083'), C('#bb9264'), 0.5 + 0.5 * P.fbm(x * 9, y * 9, z * 9, 7, 2));
    col = mix(col, C('#e8cfa6'), edge * 0.5);
    return mix(col, C('#4a3322'), Math.min(1, cavity * 1.5));
  },
  soil(c) {
    const { x, y, z, ny, cavity, edge } = c;
    let col = mix(C('#4a3a2c'), C('#5e4a38'), 0.5 + 0.5 * P.fbm(x * 6, y * 6, z * 6, 12, 2));
    col = mix(col, C('#74604a'), edge * 0.45 + ss(0.3, 0.9, ny) * 0.2);
    return mix(col, C('#1e1610'), Math.min(1, cavity * 1.4));
  },
  stone(c) {
    const { x, y, z, ny, cavity, edge } = c;
    let col = mix(C('#8f8a80'), C('#a8a296'), ss(-0.2, 0.8, ny));
    col = mix(col, C('#c2bcb0'), edge * 0.6);
    return mix(col, C('#45413b'), Math.min(1, cavity * 1.5));
  },
  // bracket fungus: cream rim, ochre-brown banded top, pale underside
  fungus(c) {
    const { x, y, z, ny, edge, cavity } = c;
    const band = 0.5 + 0.5 * Math.sin(Math.hypot(x, z) * 140 + y * 40);
    let col = ny > -0.3 ? mix(C('#a7773f'), C('#c89a5a'), band * 0.6) : C('#e6d9bf');
    col = mix(col, C('#efe4c8'), edge * 0.8);
    return mix(col, C('#4a3420'), Math.min(1, cavity * 1.3));
  },
  stem(c) { return mix(C('#e8dfcf'), C('#b9ab92'), ss(0.5, 0.0, c.ny + 0.5) * 0.5); },
  sapling(c) { return mix(C('#6f5a3c'), C('#8a8a4a'), ss(0.0, 0.4, c.y)); },
};
export const MOSSV = (c) => grey(0.6 + 0.4 * ss(-0.1, 0.9, c.ny) + 0.14 * c.edge - 0.22 * c.cavity + 0.05 * P.fbm(c.x * 8, c.y * 8, c.z * 8, 4, 2));
export const CAPV = (c) => grey(0.72 + 0.3 * ss(-0.2, 0.8, c.ny) + 0.1 * c.edge);
/** a root running from the foot out along yaw a (deg): starts up on the trunk (y0), dives into the ground */
export function rootLimb(a, len, r, { seed = 1, rt = 0.2, y0 = 0.3, wob = 0.4 } = {}) {
  const t = a * D2R, d = [Math.sin(t), Math.cos(t)], rnd = P.prng(seed * 17 + 1), w = (rnd() - 0.5) * wob;
  return limb([[d[0] * rt * 0.6, y0, d[1] * rt * 0.6], [d[0] * (rt + len * 0.25) + d[1] * w * 0.3, y0 * 0.35, d[1] * (rt + len * 0.25) - d[0] * w * 0.3], [d[0] * (rt + len * 0.6) + d[1] * w, 0.04, d[1] * (rt + len * 0.6) - d[0] * w], [d[0] * (rt + len), -0.06, d[1] * (rt + len)]], r, Math.max(0.025, r * 0.3), 0.55);
}

// ===================================================================================================== paint helpers
/** sRGB paint -> the linear number the game should receive for 'mul' parts (assets.js fixSculptColours re-encodes
 *  COLOR_0 once); `keep` gives back that much of the kit's AO (aoS = aoStrength) so the painted value survives */
const toLinC = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export function lit(fn, aoS = 0.55, keep = 0.5) {
  return (c) => { const col = fn(c), kp = typeof keep === 'function' ? keep(c) : keep, f = 1 / Math.max(0.3, 1 - kp * aoS * (1 - c.ao)); return [toLinC(Math.max(0, col[0])) * f, toLinC(Math.max(0, col[1])) * f, toLinC(Math.max(0, col[2])) * f]; };
}
/** value-only paint for tinted parts: v -> [v, v, v] */
export const grey = (v) => [v, v, v];

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
  delete process.env.BL_FAR; delete process.env.BL_NOCULM; delete process.env.BL_MID;
  const M = await loadModel(assetPath);                    // the full field (bake, paint, sheets)
  const cfg = M.cfg, def = M.def, name = def.name;
  if (quick) cfg.voxel *= 1.5;
  const outDir = path.join(ROOT, '.tmp', 'sculpt', name); fs.mkdirSync(outDir, { recursive: true });
  const glbDir = path.join(ROOT, 'assets', 'models', 'sculpt'); fs.mkdirSync(glbDir, { recursive: true });
  const hasBuilt = typeof def.built === 'function';
  const pools = [];
  const mkPool = (env) => { for (const k of ['BL_FAR', 'BL_NOCULM', 'BL_MID']) delete process.env[k]; Object.assign(process.env, env); const p = new Pool(assetPath); pools.push(p); for (const k of Object.keys(env)) delete process.env[k]; return p; };
  try {
    // 1. the extracted field (without the built culms)
    const envMesh = hasBuilt ? { BL_NOCULM: '1' } : {};
    Object.assign(process.env, envMesh);
    const Mx = await loadModel(assetPath);
    delete process.env.BL_NOCULM;
    const poolX = mkPool(envMesh);
    console.log(`bamboologs ${name}: ${poolX.size} workers, voxel ${(cfg.voxel * 1000).toFixed(1)} mm, bounds ${Mx.bounds.map((v) => v.toFixed(2)).join(' ')}`);
    const full = await extract(Mx, poolX, cfg.voxel, console.log);
    const tags = await faceTags(poolX, full.pos, full.idx);
    await poolX.close();
    const fb = checkMesh(full.pos, full.idx).bounds, diag = Math.hypot(fb[3] - fb[0], fb[4] - fb[1], fb[5] - fb[2]);
    const errs = cfg.lodError || [0.004, 0.012, 0.03].map((k) => k * diag);
    const lods = [];
    let src = { pos: full.pos, idx: full.idx, tag: tags.part };
    for (const [li, target] of cfg.lods.entries()) {
      const built = hasBuilt ? def.built(li, PARTS) : null;           // [{ pos, idx, nrm, part }]
      const bTris = built ? built.reduce((a, m) => a + m.idx.length / 3, 0) : 0;
      const fdef = def.fields?.[li] || (def.farFrom != null && li === def.farFrom ? { env: { BL_FAR: '1' }, voxel: def.farVoxel || 2.5 } : null);
      if (fdef) {
        const env = { ...fdef.env, ...(hasBuilt ? { BL_NOCULM: '1' } : {}) };
        Object.assign(process.env, env);
        const M2 = await loadModel(assetPath);
        for (const k of Object.keys(env)) delete process.env[k];
        const pool2 = mkPool(env);
        const full2 = await extract(M2, pool2, cfg.voxel * (fdef.voxel || 2.5), console.log);
        const tags2 = await faceTags(pool2, full2.pos, full2.idx);
        await pool2.close();
        src = { pos: full2.pos, idx: full2.idx, tag: tags2.part };
      }
      const ft = Math.max(60, target - bTris);
      const s = simplify(src.pos, src.idx, ft, { faceTag: src.tag, hardAngle: cfg.hardAngle ?? 60, maxError: errs[li] ?? Infinity, ...(cfg.lodTurn?.[li] != null ? { maxNormalTurn: cfg.lodTurn[li] } : {}) });
      const cb = checkMesh(s.pos, s.idx).bounds, drift = Math.max(...cb.map((v, k) => Math.abs(v - fb[k])));
      console.log(`  LOD${li}: field ${s.idx.length / 3} + built ${bTris} = ${s.idx.length / 3 + bTris} tris (target ${target}), field bbox drift ${(drift * 1000).toFixed(0)} mm`);
      lods.push({ ...s, built });
      src = s;
    }
    // 2. bake against the full field
    const poolB = mkPool({});
    const out = [];
    for (const L of lods) {
      const sn = splitNormals(L.pos, L.idx, cfg.creaseAngle, { faceTag: L.tag });
      const nv0 = sn.pos.length / 3, tagsOf = new Map();
      for (let f = 0; f < sn.idx.length / 3; f++) for (let k = 0; k < 3; k++) { const s = sn.src[sn.idx[f * 3 + k]]; let t = tagsOf.get(s); if (!t) tagsOf.set(s, (t = new Set())); t.add(L.tag[f]); }
      // merge the built pieces after the field mesh
      const parts = [{ pos: sn.pos, nrm: sn.nrm, idx: sn.idx }];
      const ftag = Array.from(L.tag);
      for (const b of L.built || []) { parts.push(b); const id = PARTS.find((p) => p.name === b.part).id; for (let f = 0; f < b.idx.length / 3; f++) ftag.push(id); }
      const mm = concatMesh(parts), nv = mm.pos.length / 3, tagArr = Int16Array.from(ftag);
      const at = Float32Array.from(mm.pos), acc = new Float32Array(nv0 * 4), vtag = new Int16Array(nv).fill(-1);
      for (let f = 0; f < mm.idx.length / 3; f++) for (let k = 0; k < 3; k++) vtag[mm.idx[f * 3 + k]] = tagArr[f];
      for (let f = 0; f < sn.idx.length / 3; f++) {
        const ia = sn.idx[f * 3], ib = sn.idx[f * 3 + 1], ic = sn.idx[f * 3 + 2];
        for (const v of [ia, ib, ic]) {
          if (tagsOf.get(sn.src[v]).size < 2) continue;
          for (let k = 0; k < 3; k++) acc[v * 4 + k] += (sn.pos[ia * 3 + k] + sn.pos[ib * 3 + k] + sn.pos[ic * 3 + k]) / 3;
          acc[v * 4 + 3]++;
        }
      }
      for (let v = 0; v < nv0; v++) if (acc[v * 4 + 3]) for (let k = 0; k < 3; k++) at[v * 3 + k] = 0.35 * sn.pos[v * 3 + k] + 0.65 * acc[v * 4 + k] / acc[v * 4 + 3];
      const vc = await bakeVertexColors(poolB, at, M);
      const col = new Float32Array(nv * 4);
      for (let v = 0; v < nv; v++) {
        for (let k = 0; k < 3; k++) col[v * 4 + k] = vc.col[v * 3 + k];
        // a built vertex is painted by ITS part (the field's nearest part may be a neighbour)
        if (v >= nv0 && def.builtPaint) { const c = def.builtPaint(vtag[v], vc, v, mm.pos); if (c) for (let k = 0; k < 3; k++) col[v * 4 + k] = c[k]; }
        const ny = vc.raw[v * 8 + 4], px = mm.pos[v * 3], py = mm.pos[v * 3 + 1], pz = mm.pos[v * 3 + 2];
        const n = 0.25 * P.fbm(px * 1.3, py * 1.3, pz * 1.3, 17, 2);
        col[v * 4 + 3] = clamp(ss(0.45, 0.9, ny + n), 0, 1);       // A: top-facing snow mask
      }
      const vpart = Int16Array.from({ length: nv }, (_, v) => (vtag[v] >= 0 ? vtag[v] : vc.part[v]));
      out.push({ pos: mm.pos, nrm: mm.nrm, idx: mm.idx, col, tag: tagArr, vpart });
    }
    await poolB.close();
    const glb = path.join(glbDir, name + '.glb');
    const bytes = await writeGLB(glb, { name, lods: out, parts: PARTS, materials: cfg.materials, anchors: def.anchors || {}, extras: { author: 'sculpted for this project', lods: out.map((o, i) => ({ lod: i, tris: o.idx.length / 3 })), voxel: cfg.voxel, colour: 'COLOR_0 RGBA: rgb = toLin(paint) (kit convention); a = top-facing snow mask', species: def.species || [] } });
    console.log(`  wrote ${path.relative(ROOT, glb)} (${(bytes / 1024).toFixed(0)} KB)`);
    let before = null, beforeBounds = null;
    if (def.replaces) { before = await loadBefore(def.replaces); beforeBounds = bboxOf(before); }
    const checks = {
      name, full: checkMesh(full.pos, full.idx), flippedFacesVsField: tags.flips,
      lods: out.map((o, i) => ({ lod: i, target: cfg.lods[i], ...checkMesh(o.pos, o.idx), fieldPart: checkMesh(lods[i].pos, lods[i].idx), parts: [...new Set(Array.from(o.tag).map((t) => PARTS[t]?.name))], mats: [...new Set(Array.from(o.tag).map((t) => PARTS[t]?.mat))] })),
      fileKB: Math.round(bytes / 1024), vertexColourOnly: true,
    };
    for (const l of checks.lods) { delete l.fieldPart.bounds; }
    const b = checks.lods[0].bounds;
    checks.measure = def.measure ? def.measure(out[0], PARTS) : null;
    if (beforeBounds) checks.vsReplaced = { replaced: def.replaces.file, before: beforeBounds.map((v) => +v.toFixed(2)), after: b.map((v) => +v.toFixed(2)), sizeBefore: sizeOf(beforeBounds), sizeAfter: sizeOf(b) };
    const matNames = Object.values(cfg.materials).map((m) => m.name);
    const frag = { [def.id || 'sculpt_' + name]: {
      file: `models/sculpt/${name}.glb`, type: 'model', license: 'CC0 (original work)', author: 'sculpted for this project',
      source: `tools/sculpt/assets/${name}.mjs (node tools/sculpt/assets/bamboologs_lib.mjs)`, scale: 1,
      size: sizeOf(b), tris: checks.lods[0].tris, lods: checks.lods.map((l) => l.tris), materials: matNames,
      mats: Object.fromEntries(Object.values(cfg.materials).map((m) => [m.name, { surface: m.surface, look: m.look || {} }])),
      notes: def.notes || '',
    } };
    fs.writeFileSync(path.join(glbDir, name + '.manifest.json'), JSON.stringify(frag, null, 1) + '\n');
    await sheets({ M, out, before, outDir, quick, R, PARTS });
    checks.buildSeconds = +((Date.now() - T0) / 1000).toFixed(1);
    fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 1));
    console.log(JSON.stringify({ lods: checks.lods.map((l) => [l.tris, l.watertight, l.openEdges, l.nonManifoldEdges]), size: sizeOf(b), before: beforeBounds && sizeOf(beforeBounds), measure: checks.measure, fileKB: checks.fileKB }));
  } finally { for (const p of pools) await p.close().catch(() => {}); }
  console.log(`done in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
}
const sizeOf = (b) => [+(b[3] - b[0]).toFixed(2), +(b[4] - b[1]).toFixed(2), +(b[5] - b[2]).toFixed(2)];
function bboxOf(meshes) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
  return b;
}
/** chest-height spread of the given material's vertices (bamboo: the clump collider) and the crown box */
export function measureClump(o, PARTS, { wood = 'wood', crown = 'crown' } = {}) {
  const pts = [], cb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let v = 0; v < o.pos.length / 3; v++) {
    const x = o.pos[v * 3], y = o.pos[v * 3 + 1], z = o.pos[v * 3 + 2], m = PARTS[o.vpart[v]]?.mat;
    if (m === wood && y > 1.2 && y < 1.4) pts.push(Math.hypot(x, z));
    if (m === crown) for (let k = 0; k < 3; k++) { cb[k] = Math.min(cb[k], o.pos[v * 3 + k]); cb[k + 3] = Math.max(cb[k + 3], o.pos[v * 3 + k]); }
  }
  pts.sort((a, b) => a - b);
  return { chestRMax: pts.length ? +pts[pts.length - 1].toFixed(3) : null, chestR90: pts.length ? +pts[Math.floor(pts.length * 0.9)].toFixed(3) : null, crownBox: cb.map((v) => +v.toFixed(2)), crownR: +(Math.max(cb[3] - cb[0], cb[5] - cb[2]) / 2).toFixed(2) };
}

async function writeGLB(file, { name, lods, parts, materials, anchors, extras }) {
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

/** the pack model as the game colours it: `rules[matName]` = { mul: linear rgb (null = the material factor) } or
 *  { tint: linear rgb, k } (vertex grey x k x tint, not normalised: the old models are not sculpts) */
async function loadBefore({ file, rules = {} }) {
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(path.join(ROOT, file));
  const meshes = [], t = [0, 0, 0, 0];
  let done = false;
  const visit = (node) => {
    const m = node.getWorldMatrix(), mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ca = prim.getAttribute('COLOR_0'), ia = prim.getIndices();
      const n = pa.getCount(), pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const mt = prim.getMaterial(), mn = mt?.getName() || '';
      const rule = rules[mn] || { mul: null };
      const base = rule.tint ? rule.tint.map((v) => v * (rule.k ?? 1)) : (rule.mul || mt.getBaseColorFactor().slice(0, 3));
      for (let i = 0; i < n; i++) {
        pa.getElement(i, t); const x = t[0], y = t[1], z = t[2];
        pos[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; pos[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; pos[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (na) { na.getElement(i, t); const a = m[0] * t[0] + m[4] * t[1] + m[8] * t[2], b = m[1] * t[0] + m[5] * t[1] + m[9] * t[2], c = m[2] * t[0] + m[6] * t[1] + m[10] * t[2]; const l = Math.hypot(a, b, c) || 1; nrm[i * 3] = a / l; nrm[i * 3 + 1] = b / l; nrm[i * 3 + 2] = c / l; }
        let g = 1; if (ca) { ca.getElement(i, t); g = t[0]; }
        for (let k = 0; k < 3; k++) col[i * 3 + k] = g * base[k];
      }
      const idx = ia ? Uint32Array.from(ia.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      meshes.push({ pos, nrm, idx, col, base: [1, 1, 1] });
    }
    for (const c of node.listChildren()) visit(c);
  };
  // the pack files hold one model (some have two scenes with LODs: take the first scene's first root only)
  for (const s of doc.getRoot().listScenes()) { if (done) break; for (const n of s.listChildren()) visit(n); done = true; }
  return meshes;
}

/** renderer meshes of one LOD coloured as the game: tinted materials (def.tintMats) normalised per material to a mean
 *  grey of 0.85 x tint (def.tints[key] || previewTint; x k from def.tintK); mul materials show enc(COLOR_0) */
export function gameMeshes(M, o, PARTS, { tint = null, snow = 0 } = {}) {
  const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const tm = M.def.tintMats || [], n = o.pos.length / 3, col = new Float32Array(n * 3);
  const mean = {}, cnt = {};
  for (const k of tm) { mean[k] = [0, 0, 0]; cnt[k] = 0; }
  for (let v = 0; v < n; v++) { const m = PARTS[o.vpart[v]]?.mat; if (mean[m]) { for (let k = 0; k < 3; k++) mean[m][k] += enc(o.col[v * 4 + k]); cnt[m]++; } }
  for (const m of tm) for (let k = 0; k < 3; k++) mean[m][k] = Math.max(1e-3, mean[m][k] / Math.max(1, cnt[m]));
  for (let v = 0; v < n; v++) {
    const m = PARTS[o.vpart[v]]?.mat, isT = !!mean[m];
    const T = isT ? ((tint && (tint[m] || (Array.isArray(tint) ? tint : null))) || M.def.tints?.[m] || M.def.previewTint || [1, 1, 1]) : null;
    const g = isT ? 0.85 * (M.def.tintK?.[m] ?? 1) * (enc(o.col[v * 4]) / mean[m][0] + enc(o.col[v * 4 + 1]) / mean[m][1] + enc(o.col[v * 4 + 2]) / mean[m][2]) / 3 : 0;
    for (let k = 0; k < 3; k++) {
      let c = isT ? g * T[k] : enc(o.col[v * 4 + k]);
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
  const H = b[4] - b[1], W = Math.max(b[3] - b[0], b[5] - b[2]);
  const prop = M.def.view === 'prop', FIT = prop ? Math.max(H, W * 0.8) : H;
  const fov = 35, ts = quick ? 300 : 420, dist = R.fitDistance(b, fov, 0.86);
  const views = [];
  for (let i = 0; i < 8; i++) views.push([i * 45, prop ? 18 : 8, `${i * 45} DEG`]);
  for (let i = 0; i < 3; i++) views.push([30 + i * 120, 60, `ABOVE ${30 + i * 120}`]);
  views.push([20, -20, 'BELOW']);
  save('turntable.png', R.sheet(views.map(([az, el, label]) => ({ img: R.render(after, R.orbit(c, az, el, dist, fov, ts, ts), { ground: el > 0 }), label })), 4, { title: `${name} TURNTABLE (LOD0 ${out[0].idx.length / 3} TRIS, AS THE GAME TINTS IT)` }));
  save('clay.png', R.sheet([0, 90, 180, 270].map((az) => ({ img: R.render(after, R.orbit(c, az + 20, prop ? 22 : 10, dist, fov, ts, ts), { clay: true }), label: `CLAY ${az + 20}` })).concat([{ img: R.render(after, R.orbit(c, 40, 75, dist, fov, ts, ts), { clay: true }), label: 'CLAY TOP' }]), 5, { title: `${name} CLAY - FORM ONLY` }));
  const heroW = quick ? 960 : 1600, heroH = quick ? 540 : 900;
  // hero: a tree from two metres at eye height looking up; a log from two metres at eye height looking down at it
  const heroCam = (az, w, h) => {
    const a = az * Math.PI / 180;
    if (prop) { const d = 2.0 + W * 0.35; return R.camera([c[0] + Math.sin(a) * d, 1.6, c[2] + Math.cos(a) * d], [c[0], H * 0.4, c[2]], 55, w, h); }
    return R.camera([Math.sin(a) * 2.6, 1.6, Math.cos(a) * 2.6], [0, H * 0.42, 0], 70, w, h);
  };
  save('hero.png', R.render(after, heroCam(M.def.heroAz ?? 28, heroW, heroH)));
  const gameCam = (w, h, px, az = 25) => { const k = 1 / Math.tan(50 * Math.PI / 360); const d = (h / 2) * k * FIT / px; const a = az * Math.PI / 180, e = (prop ? 24 : 12) * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * d * Math.cos(e), c[1] + Math.sin(e) * d, c[2] + Math.cos(a) * d * Math.cos(e)], c, 50, w, h); };
  const gt = out.map((o, i) => ({ img: R.render(gameMeshes(M, o, PARTS), gameCam(420, 480, 300, M.def.gameAz ?? 25)), label: `LOD${i} ${o.idx.length / 3} TRIS` }));
  for (const [lab, tint] of Object.entries(M.def.landTints || {})) gt.push({ img: R.render(gameMeshes(M, out[1], PARTS, { tint, snow: lab.includes('SNOW') ? 1 : 0 }), gameCam(420, 480, 300, (M.def.gameAz ?? 25) + 180)), label: `LOD1 ${lab}` });
  save('game.png', R.sheet(gt, 3, { title: `${name} AT GAME DISTANCE (300 PX)` }));
  const lt = [];
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(gameMeshes(M, out[i], PARTS), R.orbit(c, 30, prop ? 20 : 10, dist, fov, ts, ts)), label: `LOD${i} ${out[i].idx.length / 3}` });
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(gameMeshes(M, out[i], PARTS).map((m) => ({ ...m, col: null })), R.orbit(c, 30, prop ? 20 : 10, dist, fov, ts, ts), { wire: true, clay: true }), label: `LOD${i} WIRE` });
  save('lods.png', R.sheet(lt, out.length, { title: `${name} LODS` }));
  if (before) {
    const bs = quick ? 400 : 560;
    const gc = gameCam(bs, Math.round(bs * 0.75), 240, M.def.gameAz ?? 25);
    const tiles = [
      { img: R.render(before, heroCam(M.def.heroAz ?? 28, bs, bs)), label: 'BEFORE - 2 M' }, { img: R.render(after, heroCam(M.def.heroAz ?? 28, bs, bs)), label: 'AFTER - 2 M' },
      { img: R.render(before, R.orbit(c, 208, 12, dist, fov, bs, bs)), label: 'BEFORE - BACK' }, { img: R.render(after, R.orbit(c, 208, 12, dist, fov, bs, bs)), label: 'AFTER - BACK' },
      { img: R.render(before, gc), label: 'BEFORE - GAME CAMERA' }, { img: R.render(gameMeshes(M, out[1], PARTS), gc), label: 'AFTER LOD1 - GAME CAMERA' },
      { img: R.render(before, R.orbit(c, 28, 14, dist, fov, bs, bs), { clay: true }), label: 'BEFORE - CLAY' }, { img: R.render(after, R.orbit(c, 28, 14, dist, fov, bs, bs), { clay: true }), label: 'AFTER - CLAY' },
    ];
    save('before_after.png', R.sheet(tiles, 2, { title: `${name} BEFORE (PACK MODEL) / AFTER - SAME CAMERA AND LIGHT` }));
  }
  // grove: several instances at turns / scales / distances, LOD by distance (1/10 scale against the shadow offset)
  if (!quick && M.def.grove !== false) {
    const rnd = P.prng(9), list = [], SC = 0.1, spread = prop ? 14 : 30;
    for (let i = 0; i < 9; i++) {
      const x = (rnd() - 0.5) * spread, z = -3 - rnd() * spread, yaw = rnd() * 6.283, s = 0.85 + rnd() * 0.3, d = Math.hypot(x, z - 6);
      const o = out[d < (prop ? 9 : 18) ? 0 : d < (prop ? 16 : 30) ? 1 : 2], m = gameMeshes(M, o, PARTS)[0], cy = Math.cos(yaw), sy = Math.sin(yaw);
      const pos = new Float32Array(m.pos.length), nrm = new Float32Array(m.nrm.length);
      for (let v = 0; v < m.pos.length; v += 3) {
        const px = m.pos[v] * s, py = m.pos[v + 1] * s, pz = m.pos[v + 2] * s;
        pos[v] = (x + cy * px + sy * pz) * SC; pos[v + 1] = py * SC; pos[v + 2] = (z - sy * px + cy * pz) * SC;
        nrm[v] = cy * m.nrm[v] + sy * m.nrm[v + 2]; nrm[v + 1] = m.nrm[v + 1]; nrm[v + 2] = -sy * m.nrm[v] + cy * m.nrm[v + 2];
      }
      list.push({ ...m, pos, nrm });
    }
    const eyeY = prop ? 2.2 : 4, lookY = prop ? 0.3 : 3.5;
    save('grove.png', R.render(list, R.camera([0, eyeY * SC, 6 * SC], [0, lookY * SC, -spread * 0.5 * SC], 55, 1280, 720), { groundColor: [0.24, 0.32, 0.14] }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
