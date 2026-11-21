// Geometry for 灯里's sculpted hair and bow (tools/sculpt/figure/build-hair.mjs). The kit contours fields well but is weak
// at thin forms (README §6), so the locks, the bow and the ties are built here as SOLID sweeps with exact sections:
//   sweep()      a section carried along a Catmull-Rom curve (locks: tapered lens section, pointed flicked tip, closed root;
//                cords: a round section on a closed path; bow loops: a band section on a closed path)
//   sheet()      a surface with thickness (bow tails with notched ends, the paper wraps): top, bottom and walls
// Every mesh is closed (watertight) and outward facing. Per-vertex data the painter needs rides along in `at`.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V = { sub, add, mul, dot, cross, len, nrm, lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] };
export const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Catmull-Rom curve through control points; each point may carry scalars (vals[k][i]) interpolated the same way.
 * -> { P: [[x,y,z]], S: [[scalars]], cum: [arc length], L, closed }
 */
export function curve(points, vals = [], { per = 14, closed = false } = {}) {
  const n = points.length, P = [], S = [];
  const idx = (i) => (closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
  const spans = closed ? n : n - 1;
  const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
  // control points beyond the ends are mirrored (a straight continuation), so the ends keep their tangent
  const pt = (i) => {
    if (closed || (i >= 0 && i < n)) return points[idx(i)];
    if (i < 0) return sub(mul(points[0], 2), points[1]);
    return sub(mul(points[n - 1], 2), points[n - 2]);
  };
  const vv = (k, i) => vals[k][idx(i)];
  for (let s = 0; s < spans; s++) {
    for (let q = 0; q < per; q++) {
      const t = q / per;
      const a = pt(s - 1), b = pt(s), c = pt(s + 1), d = pt(s + 2);
      P.push([0, 1, 2].map((k) => cr(a[k], b[k], c[k], d[k], t)));
      // scalars: smooth (no overshoot) between the two control values
      const e = t * t * (3 - 2 * t);
      S.push(vals.map((_, k) => vv(k, s) + (vv(k, s + 1) - vv(k, s)) * e));
    }
  }
  if (!closed) { P.push(points[n - 1].slice()); S.push(vals.map((_, k) => vals[k][n - 1])); }
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + len(sub(P[i], P[i - 1])));
  const L = closed ? cum[cum.length - 1] + len(sub(P[0], P[P.length - 1])) : cum[cum.length - 1];
  return { P, S, cum, L, closed };
}
/** point, unit tangent and scalars at arc length s */
export function curveAt(c, s) {
  const { P, S, cum, L, closed } = c, n = P.length;
  if (closed) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
  let i = 0; while (i < n - 1 && cum[i + 1] < s) i++;
  const j = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
  const seg = (closed && i === n - 1) ? L - cum[i] : cum[j] - cum[i];
  const f = seg > 1e-9 ? (s - cum[i]) / seg : 0;
  const p = V.lerp(P[i], P[j], f), sc = S[i].map((v, k) => v + (S[j][k] - v) * f);
  const a = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[closed ? (j + 1) % n : Math.min(n - 1, j + 1)];
  let T = sub(b, a); if (len(T) < 1e-9) T = sub(P[j], P[i]);
  return { p, T: nrm(T), s: sc };
}

/** lens section of K points (K even): b across (half width hw), u up (half thickness ht), flatter underside */
export function lensSection(K, hw, ht, { under = 0.5, ridge = 0.85, bias = 0 } = {}) {
  const out = [];
  for (let j = 0; j < K; j++) {
    const a = (j / K) * Math.PI * 2, s = Math.cos(a), top = Math.sin(a) >= 0;
    const h = Math.pow(Math.max(0, 1 - s * s), ridge);
    // bias > 0 leans the section's crest toward +b (a lock that turns over its edge)
    out.push([hw * s, (top ? ht * h * (1 + bias * s) : -ht * under * h), top ? 1 : -1, s]);
  }
  return out;
}

/**
 * Sweep a section along a curve.
 * o = { curve, rings (count) | ds, section(t, sc, i) -> [[b, u, side, s], ...] (K points; same K everywhere),
 *       up(p, T, t, sc) -> vector (the section's u direction before orthogonalising), tip: 'point' | 'cap' | 'none',
 *       root: 'cap' | 'none', tipPoint (override apex), dens (>1 crowds rings toward the tip) }
 * -> mesh { pos, idx, at: [{ t, side, s, ring }] } (closed, outward)
 */
export function sweep(o) {
  const c = o.curve, closed = c.closed;
  const nR = o.rings || Math.max(o.minRings || 6, Math.ceil(c.L / (o.ds || 0.007)));
  const dens = o.dens || 1;
  const pos = [], at = [], idx = [];
  let K = 0;
  // ring stations (fractions of the length): uniform (crowded toward the tip by `dens`) + forced ones (o.extra, in metres:
  // e.g. the two edges of a painted highlight band, so the band gets crisp borders); uniform ones too close to a forced one go
  let X = []; for (let r = 0; r <= (closed ? nR - 1 : nR); r++) { let x = r / nR; if (!closed && dens !== 1) x = 1 - Math.pow(1 - x, dens); X.push(x); }
  if (o.extra && o.extra.length) {
    const ex = o.extra.map((m) => m / c.L).filter((x) => x > 0.01 && x < (closed ? 1 : 0.985));
    const gap = Math.min(0.35 / nR, 0.004 / c.L);
    X = X.filter((x, i) => i === 0 || i === X.length - 1 || !ex.some((e) => Math.abs(e - x) < gap)).concat(ex).sort((a, b) => a - b);
  }
  const ringCount = X.length;
  for (let r = 0; r < ringCount; r++) {
    const x = X[r];
    const tEnd = !closed && r === ringCount - 1 && o.tip === 'point';
    const s = x * c.L, f = curveAt(c, tEnd ? c.L * 0.999 : s);
    const sec = o.section(x, f.s, r);
    K = sec.length;
    let U = o.up(f.p, f.T, x, f.s); U = nrm(sub(U, mul(f.T, dot(U, f.T))));
    const B = cross(f.T, U);
    if (tEnd) break;
    for (const [b, u, side, ss] of sec) { pos.push(f.p[0] + B[0] * b + U[0] * u, f.p[1] + B[1] * b + U[1] * u, f.p[2] + B[2] * b + U[2] * u); at.push({ t: x, side, s: ss, ring: r, arc: s }); }
  }
  const rings = pos.length / 3 / K;
  for (let r = 0; r < rings - 1 + (closed ? 1 : 0); r++) {
    const r2 = (r + 1) % rings;
    for (let j = 0; j < K; j++) {
      const j2 = (j + 1) % K, a = r * K + j, b = r * K + j2, cc = r2 * K + j2, d = r2 * K + j;
      idx.push(a, b, cc, a, cc, d);
    }
  }
  if (!closed) {
    const end = curveAt(c, c.L), beg = curveAt(c, 0);
    // tip
    const last = (rings - 1) * K;
    const apex = o.tipPoint || end.p;
    if (o.tip === 'point') { const v = pos.length / 3; pos.push(...apex); at.push({ t: 1, side: 0, s: 0, ring: rings, apex: true, arc: c.L }); for (let j = 0; j < K; j++) idx.push(last + j, last + (j + 1) % K, v); }
    else { const v = pos.length / 3; pos.push(...add(end.p, mul(end.T, 0.0005))); at.push({ t: 1, side: 0, s: 0, ring: rings, arc: c.L }); for (let j = 0; j < K; j++) idx.push(last + j, last + (j + 1) % K, v); }
    // root
    const v0 = pos.length / 3; pos.push(...sub(beg.p, mul(beg.T, 0.0005))); at.push({ t: 0, side: 0, s: 0, ring: -1, arc: 0 });
    for (let j = 0; j < K; j++) idx.push((j + 1) % K, j, v0);
  }
  return orient({ pos: Float32Array.from(pos), idx: Uint32Array.from(idx), at });
}

/**
 * A surface with thickness. P(u, v) -> point, N(u, v) -> unit normal of the surface, th(u, v) -> thickness; u, v in 0..1.
 * closedU / closedV wrap the grid. Walls get their own vertices (crisp edges).
 * -> mesh { pos, idx, at: [{ u, v, face: 0 top | 1 bottom | 2 wall }] }
 */
export function sheet({ nu, nv, P, N, th, closedU = false, closedV = false }) {
  const pos = [], idx = [], at = [];
  const cu = closedU ? nu : nu + 1, cv = closedV ? nv : nv + 1;
  const vert = (u, v, side) => { const p = P(u, v), n = N(u, v), t = th(u, v) / 2 * side; pos.push(p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t); return pos.length / 3 - 1; };
  const grid = (side, face) => { const g = []; for (let i = 0; i < cv; i++) { g.push([]); for (let k = 0; k < cu; k++) { g[i].push(vert(k / nu, i / nv, side)); at.push({ u: k / nu, v: i / nv, face }); } } return g; };
  const top = grid(1, 0), bot = grid(-1, 1);
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  for (let i = 0; i < (closedV ? cv : cv - 1); i++) for (let k = 0; k < (closedU ? cu : cu - 1); k++) {
    const i2 = (i + 1) % cv, k2 = (k + 1) % cu;
    quad(top[i][k], top[i][k2], top[i2][k2], top[i2][k]);
    quad(bot[i][k], bot[i2][k], bot[i2][k2], bot[i][k2]);
  }
  // walls along the open borders (own vertices)
  const wall = (list) => { // list of [u, v] along the border, in order
    const a0 = pos.length / 3;
    for (const [u, v] of list) { vert(u, v, 1); at.push({ u, v, face: 2 }); vert(u, v, -1); at.push({ u, v, face: 2 }); }
    for (let q = 0; q < list.length - 1; q++) { const a = a0 + q * 2; quad(a, a + 1, a + 3, a + 2); }
  };
  if (!closedU) { wall([...Array(cv).keys()].map((i) => [0, i / nv]).concat(closedV ? [[0, 1]] : []).reverse()); wall([...Array(cv).keys()].map((i) => [1, i / nv]).concat(closedV ? [[1, 1]] : [])); }
  if (!closedV) { wall([...Array(cu).keys()].map((k) => [k / nu, 1]).concat(closedU ? [[1, 1]] : []).reverse()); wall([...Array(cu).keys()].map((k) => [k / nu, 0]).concat(closedU ? [[1, 0]] : [])); }
  return orient({ pos: Float32Array.from(pos), idx: Uint32Array.from(idx), at });
}

/** make a closed mesh face outward (signed volume > 0); open sheets are oriented by their top grid */
export function orient(m) {
  let vol = 0; const p = m.pos, I = m.idx;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    vol += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  if (vol < 0) for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  return m;
}

/** concatenate meshes; per-vertex extra arrays named in `keys` are concatenated too */
export function join(list, keys = []) {
  let nv = 0, ni = 0; for (const m of list) { nv += m.pos.length / 3; ni += m.idx.length; }
  const pos = new Float32Array(nv * 3), idx = new Uint32Array(ni), ex = Object.fromEntries(keys.map((k) => [k, []]));
  let ov = 0, oi = 0;
  for (const m of list) { pos.set(m.pos, ov * 3); for (let i = 0; i < m.idx.length; i++) idx[oi + i] = m.idx[i] + ov; for (const k of keys) ex[k].push(...m[k]); ov += m.pos.length / 3; oi += m.idx.length; }
  return { pos, idx, ...ex };
}

/** angle-weighted smooth vertex normals */
export function normals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const A = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], B = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], C = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
    const fn = cross(sub(B, A), sub(C, A)); const fl = len(fn); if (fl < 1e-14) continue;
    const ang = (P, Q, R) => { const u = nrm(sub(Q, P)), v = nrm(sub(R, P)); return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))); };
    const w = [ang(A, B, C), ang(B, C, A), ang(C, A, B)];
    [a, b, c].forEach((v, k) => { for (let q = 0; q < 3; q++) n[v * 3 + q] += fn[q] / fl * w[k]; });
  }
  for (let v = 0; v < n.length / 3; v++) { const l = Math.hypot(n[v * 3], n[v * 3 + 1], n[v * 3 + 2]) || 1; n[v * 3] /= l; n[v * 3 + 1] /= l; n[v * 3 + 2] /= l; }
  return n;
}

/** a uniform grid of points for neighbour queries */
export function grid(pos, cell) {
  const m = new Map(), key = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
  for (let v = 0; v < pos.length / 3; v++) { const k = key(Math.floor(pos[v * 3] / cell), Math.floor(pos[v * 3 + 1] / cell), Math.floor(pos[v * 3 + 2] / cell)); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(v); }
  return { near(x, y, z, r, fn) { const i0 = Math.floor((x - r) / cell), i1 = Math.floor((x + r) / cell), j0 = Math.floor((y - r) / cell), j1 = Math.floor((y + r) / cell), k0 = Math.floor((z - r) / cell), k1 = Math.floor((z + r) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) { const a = m.get(key(i, j, k)); if (a) for (const v of a) fn(v); } } };
}
