// Helper + build driver of the two hand-built small enemies (shade_jelly = 影团 makeJelly, shade_paper = 纸魅 makeHitogata).
//
// Both are code-built meshes in the game (src/actors/creature.js), moved by vertex shaders (uJig / uCelTime) and the
// creature motion layer — no skeleton. So the sculpts are STATIC meshes with the same node names, origin and local axes
// as the code builds, vertex-coloured on every LOD, no textures. A creature is several separate meshes (jelly: the
// translucent body, the additive core, the opaque things caught inside), which a single distance field cannot give
// (a union swallows whatever is inside the body), so each "piece" is meshed from its own field: build() reads
// process.env.JP_PIECE and JP_DETAIL ('full' | 'mid' | 'far', per LOD) and returns that piece's shape.
//
//   SCULPT_THREADS=2 node tools/sculpt/assets/jellypaper_lib.mjs tools/sculpt/assets/<name>.mjs [--quick]
//
// Asset fields besides the kit's: pieces [{ key, node, lods: [tris per LOD, 0 = absent], detail: [per LOD],
// voxel?, voxelMul: [per LOD], lodError: [m per LOD] }], lodNames, gameScale (the creature's def.scale, for the
// sheets only), before() -> renderer meshes { opaque, inner } of the code-built object, look(ctx) -> extra sheets.
// Outputs: assets/models/sculpt/<name>.glb + .manifest.json, .tmp/sculpt/<name>/*.png + checks.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as P from '../sdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');
export const C = P.color, mix = P.mix, ss = P.ss;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ================================================================================================== shape helpers
/** bilinear sampler of a 2D function on a grid (for expensive 2D distance fields); outside the grid: edge + distance */
export function grid2d(fn, [x0, y0, x1, y1], h) {
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, g = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = fn(x0 + i * h, y0 + j * h);
  return (x, y) => {
    const cx = clamp(x, x0, x1), cy = clamp(y, y0, y1), out = Math.hypot(x - cx, y - cy);
    const fx = (cx - x0) / h, fy = (cy - y0) / h;
    const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy)), u = fx - i, v = fy - j;
    const a = g[j * nx + i], b = g[j * nx + i + 1], c = g[(j + 1) * nx + i], d = g[(j + 1) * nx + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v + out;
  };
}
/** 2D distances */
export const d2circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
export function d2ellipse(x, y, cx, cy, rx, ry) { const k = Math.hypot((x - cx) / rx, (y - cy) / ry); return (k - 1) * Math.min(rx, ry); }
/** tapered stroke a -> b (radii ra, rb); returns { d, t (0..1 along), s (signed across, m) } */
export function d2stroke(x, y, a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], L2 = bx * bx + by * by, L = Math.sqrt(L2);
  const t = clamp(((x - a[0]) * bx + (y - a[1]) * by) / L2, 0, 1);
  const qx = x - a[0] - bx * t, qy = y - a[1] - by * t;
  const s = (qx * -by + qy * bx) / L;
  return { d: Math.hypot(qx, qy) - (ra + (rb - ra) * t), t, s };
}
/** point on the surface of `shape` along the horizontal ray from the Y axis at angle a (deg, 0 = +Z) and height y */
export function surfAt(shape, aDeg, y, lift = 0, cx = 0, cz = 0) {
  const a = aDeg * Math.PI / 180, sx = Math.sin(a), sz = Math.cos(a);
  let lo = 0, hi = 1.2;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (shape.f(cx + sx * m, y, cz + sz * m) < 0) lo = m; else hi = m; }
  const r = (lo + hi) / 2, p = [cx + sx * r, y, cz + sz * r], n = shape.normal(p[0], p[1], p[2], [0, 0, 0], 1e-3);
  return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
}

// ================================================================================================== even sheet mesher
// A folded sheet (the paper doll) meshed directly instead of from voxels + decimation, which leaves long slivers on a
// flat card: points are laid out in 2D (contours of the cut, the ink, the seal and the char sampled evenly, fold lines,
// then a graded hex grid filling the rest), Delaunay-triangulated, kept inside the cut, and lifted onto the folded
// surface as a top and a bottom skin joined by a side wall along the cut edge. Watertight by construction.
class Hash {
  constructor(cell) { this.c = cell; this.m = new Map(); }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  add(p) { const i = Math.floor(p[0] / this.c), j = Math.floor(p[1] / this.c), k = this.key(i, j); let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(p); }
  /** nearest point within r (or null) */
  near(x, y, r) {
    const i0 = Math.floor((x - r) / this.c), i1 = Math.floor((x + r) / this.c), j0 = Math.floor((y - r) / this.c), j1 = Math.floor((y + r) / this.c);
    let best = null, bd = r * r;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.m.get(this.key(i, j)); if (a) for (const p of a) { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = p; } } }
    return best;
  }
}
/** zero crossings of f on a grid of step g inside box, thinned to an even spacing sp (unordered points) */
function contour(f, box, g, sp, accept, out, hash) {
  const [x0, y0, x1, y1] = box, nx = Math.ceil((x1 - x0) / g), ny = Math.ceil((y1 - y0) / g);
  const v = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = f(x0 + i * g, y0 + j * g);
  const cand = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const a = v[j * (nx + 1) + i];
    if (i < nx) { const b = v[j * (nx + 1) + i + 1]; if ((a < 0) !== (b < 0)) { const t = a / (a - b); cand.push([x0 + (i + t) * g, y0 + j * g]); } }
    if (j < ny) { const b = v[(j + 1) * (nx + 1) + i]; if ((a < 0) !== (b < 0)) { const t = a / (a - b); cand.push([x0 + i * g, y0 + (j + t) * g]); } }
  }
  // walk the candidates in chains (nearest-neighbour order) so the thinning keeps an even step along each curve
  const ch = new Hash(g * 2); for (const p of cand) ch.add(p);
  const used = new Set(); let n = 0;
  for (const s0 of cand) {
    if (used.has(s0)) continue;
    let p = s0, acc = sp;     // distance walked since the last kept point
    let last = null;
    while (p) {
      used.add(p);
      if (last) acc += Math.hypot(p[0] - last[0], p[1] - last[1]);
      if (acc >= sp * 0.999 && (!accept || accept(p[0], p[1])) && !hash.near(p[0], p[1], sp * 0.7)) { const q = [p[0], p[1], sp]; out.push(q); hash.add(q); acc = 0; n++; }
      last = p;
      // next unused crossing next to p
      let nb = null, bd = (g * 1.5) ** 2;
      const i0 = Math.floor((p[0] - g * 1.5) / ch.c), i1 = Math.floor((p[0] + g * 1.5) / ch.c), j0 = Math.floor((p[1] - g * 1.5) / ch.c), j1 = Math.floor((p[1] + g * 1.5) / ch.c);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = ch.m.get(ch.key(i, j)); if (a) for (const q of a) { if (used.has(q)) continue; const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < bd) { bd = d; nb = q; } } }
      p = nb;
    }
  }
  return n;
}
/** Bowyer-Watson Delaunay of 2D points with triangle adjacency (walk to locate, flood the cavity) -> flat CCW index list */
export function delaunay(pts) {
  const n = pts.length;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of pts) { minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); }
  const D = Math.max(maxx - minx, maxy - miny) * 20, cx0 = (minx + maxx) / 2, cy0 = (miny + maxy) / 2;
  const X = new Float64Array(n + 3), Y = new Float64Array(n + 3);
  pts.forEach((p, i) => { X[i] = p[0]; Y[i] = p[1]; });
  X[n] = cx0 - D; Y[n] = cy0 - D; X[n + 1] = cx0 + D; Y[n + 1] = cy0 - D; X[n + 2] = cx0; Y[n + 2] = cy0 + D;
  const V = [], NB = [], CX = [], CY = [], R2 = [], alive = [];
  const mk = (a, b, c) => {
    const t = alive.length;
    const ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx = X[c], cy = Y[c];
    const dd = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / dd, uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / dd;
    V.push(a, b, c); NB.push(-1, -1, -1); CX.push(ux); CY.push(uy); R2.push((ax - ux) ** 2 + (ay - uy) ** 2); alive.push(1);
    return t;
  };
  mk(n, n + 1, n + 2);
  const order = [...Array(n).keys()].sort((i, j) => (Math.floor(Y[i] * 30) - Math.floor(Y[j] * 30)) || ((Math.floor(Y[i] * 30) & 1 ? -1 : 1) * (X[i] - X[j])));
  let last = 0;
  const orient = (a, b, px, py) => (X[b] - X[a]) * (py - Y[a]) - (Y[b] - Y[a]) * (px - X[a]);
  for (const pi of order) {
    const px = X[pi], py = Y[pi];
    // locate by walking
    let t = last, guard = 0;
    while (!alive[t]) t--;
    walk: for (;;) {
      if (++guard > 100000) break;
      for (let k = 0; k < 3; k++) {
        const a = V[t * 3 + k], b = V[t * 3 + (k + 1) % 3];
        if (orient(a, b, px, py) < 0 && NB[t * 3 + k] >= 0) { t = NB[t * 3 + k]; continue walk; }
      }
      break;
    }
    // flood the cavity
    const bad = [t], isBad = new Set([t]);
    for (let q = 0; q < bad.length; q++) {
      const u = bad[q];
      for (let k = 0; k < 3; k++) { const w = NB[u * 3 + k]; if (w < 0 || isBad.has(w)) continue; if ((px - CX[w]) ** 2 + (py - CY[w]) ** 2 < R2[w] * (1 - 1e-12)) { isBad.add(w); bad.push(w); } }
    }
    const startAt = new Map(), endAt = new Map(), made = [];
    for (const u of bad) {
      alive[u] = 0;
      for (let k = 0; k < 3; k++) {
        const w = NB[u * 3 + k]; if (w >= 0 && isBad.has(w)) continue;
        const a = V[u * 3 + k], b = V[u * 3 + (k + 1) % 3];
        const T = mk(a, b, pi); made.push(T);
        NB[T * 3] = w;
        if (w >= 0) for (let j = 0; j < 3; j++) if (NB[w * 3 + j] === u) NB[w * 3 + j] = T;
        startAt.set(a, T); endAt.set(b, T);
      }
    }
    for (const T of made) { const a = V[T * 3], b = V[T * 3 + 1]; NB[T * 3 + 1] = startAt.get(b); NB[T * 3 + 2] = endAt.get(a); }
    last = made[made.length - 1];
  }
  const out = [];
  for (let t = 0; t < alive.length; t++) if (alive[t] && V[t * 3] < n && V[t * 3 + 1] < n && V[t * 3 + 2] < n) out.push(V[t * 3], V[t * 3 + 1], V[t * 3 + 2]);
  return out;
}
/**
 * opts: { dO(x,y) cut outline (<0 inside), F(x,y) fold height z, T thickness, box [x0,y0,x1,y1], h interior spacing,
 *   sO outline spacing, contours: [{ f, box, sp }] inner borders (ink, seal, char), lines: [{ a, b, sp }] fold lines,
 *   g contour grid step }
 * returns { pos, idx, stats }
 */
export function sheetMesh(o) {
  const pts = [], hash = new Hash(Math.max(o.sO, 0.004));
  const inside = (x, y) => o.dO(x, y) < -o.sO * 0.35;
  contour(o.dO, o.box, o.g, o.sO, null, pts, hash);
  const nOut = pts.length;
  for (const c of o.contours || []) contour(c.f, c.box, c.g || o.g, c.sp, inside, pts, hash);
  for (const l of o.lines || []) {
    const L = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]), k = Math.max(1, Math.round(L / l.sp));
    for (let i = 0; i <= k; i++) { const x = l.a[0] + (l.b[0] - l.a[0]) * i / k, y = l.a[1] + (l.b[1] - l.a[1]) * i / k; if (inside(x, y) && !hash.near(x, y, l.sp * 0.6)) { const q = [x, y, l.sp]; pts.push(q); hash.add(q); } }
  }
  // graded interior fill: a coarse hex grid; finer grids only close to the finer contours, so the step grows evenly
  const cHash = new Hash(Math.max(o.sO, 0.004)); for (const p of pts) cHash.add(p);
  const levels = [];
  for (let s = o.h; s > (o.hMin || o.h / 4) * 0.99; s /= 2) levels.push(s);
  levels.forEach((s, li) => {
    const dy = s * Math.sqrt(3) / 2;
    for (let j = 0, y = o.box[1]; y <= o.box[3]; j++, y += dy) for (let x = o.box[0] + (j & 1) * s / 2; x <= o.box[2]; x += s) {
      if (o.dO(x, y) > -0.5 * s) continue;
      const q = hash.near(x, y, s * 1.2);
      if (q && Math.hypot(q[0] - x, q[1] - y) < 0.42 * (s + q[2])) continue;
      if (li > 0) { const c = cHash.near(x, y, s * 2.5); if (!c || c[2] > s * 0.75) continue; }
      const p = [x, y, s]; pts.push(p); hash.add(p);
    }
  });
  const tri = delaunay(pts);
  // keep triangles inside the cut
  const keep = [];
  for (let t = 0; t < tri.length; t += 3) {
    const A = pts[tri[t]], B = pts[tri[t + 1]], Cc = pts[tri[t + 2]];
    const cx = (A[0] + B[0] + Cc[0]) / 3, cy = (A[1] + B[1] + Cc[1]) / 3;
    if (o.dO(cx, cy) > 0) continue;
    let ok = true;
    for (const [P1, P2] of [[A, B], [B, Cc], [Cc, A]]) { const L = Math.hypot(P1[0] - P2[0], P1[1] - P2[1]); if (o.dO((P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2) > 0.15 * L) ok = false; }
    if (ok) keep.push(tri[t], tri[t + 1], tri[t + 2]);
  }
  // bow-tie vertices (two fans meeting at a point) -> drop the smaller fan's triangle touching it, until clean
  for (let it = 0; it < 6; it++) {
    const be = new Map();
    for (let t = 0; t < keep.length; t += 3) for (let k = 0; k < 3; k++) { const a = keep[t + k], b = keep[t + (k + 1) % 3], key = a < b ? a + ',' + b : b + ',' + a; be.set(key, (be.get(key) || 0) + 1); }
    const bc = new Map();
    for (const [key, c] of be) if (c === 1) for (const v of key.split(',')) bc.set(+v, (bc.get(+v) || 0) + 1);
    const badV = new Set([...bc].filter(([, c]) => c > 2).map(([v]) => v));
    if (!badV.size) break;
    const out = [];
    const dropped = new Set();
    for (let t = 0; t < keep.length; t += 3) {
      const hit = [0, 1, 2].find((k) => badV.has(keep[t + k]) && !dropped.has(keep[t + k]));
      if (hit !== undefined) { dropped.add(keep[t + hit]); continue; }
      out.push(keep[t], keep[t + 1], keep[t + 2]);
    }
    keep.length = 0; keep.push(...out);
  }
  // lift: top and bottom skins offset along the fold surface's normal, side wall along boundary edges
  const used = new Map(); const vs = [];
  for (const v of keep) if (!used.has(v)) { used.set(v, vs.length); vs.push(v); }
  const nv = vs.length, pos = new Float32Array(nv * 6), e = 0.0004;
  for (let i = 0; i < nv; i++) {
    const [x, y] = pts[vs[i]], z = o.F(x, y);
    const gx = (o.F(x + e, y) - o.F(x - e, y)) / (2 * e), gy = (o.F(x, y + e) - o.F(x, y - e)) / (2 * e), l = Math.hypot(gx, gy, 1);
    const n = [-gx / l, -gy / l, 1 / l], h2 = o.T / 2;
    pos.set([x + n[0] * h2, y + n[1] * h2, z + n[2] * h2], i * 3);
    pos.set([x - n[0] * h2, y - n[1] * h2, z - n[2] * h2], (nv + i) * 3);
  }
  const idx = [];
  const ec = new Map();
  for (let t = 0; t < keep.length; t += 3) {
    const a = used.get(keep[t]), b = used.get(keep[t + 1]), c = used.get(keep[t + 2]);
    idx.push(a, b, c, nv + a, nv + c, nv + b);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { const key = p < q ? p + ',' + q : q + ',' + p; const r = ec.get(key); if (r) r.n++; else ec.set(key, { n: 1, p, q }); }
  }
  let nb = 0;
  for (const r of ec.values()) if (r.n === 1) { const { p, q } = r; idx.push(p, nv + p, nv + q, p, nv + q, q); nb++; }
  return { pos, idx: Uint32Array.from(idx), stats: { pts: pts.length, outline: nOut, top: keep.length / 3, boundary: nb } };
}
/** solve the interior spacing h so the sheet lands just under `target` triangles */
export function sheetMeshTarget(make, target, h0, log = () => {}) {
  let h = h0, best = null;
  for (let it = 0; it < 7; it++) {
    const m = make(h), n = m.idx.length / 3;
    log(`    sheet h ${(h * 1000).toFixed(1)} mm: ${n} tris (top ${m.stats.top}, boundary ${m.stats.boundary}, points ${m.stats.pts})`);
    if (n <= target && (!best || n > best.idx.length / 3)) best = m;
    if (n <= target && n > target * 0.96) break;
    h *= Math.min(1.6, Math.max(0.6, Math.pow(n / (target * 0.98), 0.5)));
  }
  return best || make(h * 1.3);
}

// ================================================================================================== back-lit sheets
/** stand-in for the game's back-light translucency (look.trans) in the CPU sheets: faces turned away from the sun are
 *  pre-lit with sky + trans * key * (-n.l) and drawn unlit; faces towards the sun render normally */
export function backlit(meshes, trans, L = { dir: [0.55, 0.75, 0.42], key: [1.75, 1.575, 1.295], sky: [0.198, 0.2475, 0.363], bounce: [0.16, 0.137, 0.106] }) {
  const ln = Math.hypot(...L.dir), d = L.dir.map((v) => v / ln), out = [];
  for (const m of meshes) {
    if (m.emit || !m.col) { out.push(m); continue; }
    const front = [], back = [];
    for (let t = 0; t < m.idx.length; t += 3) {
      let s = 0; for (let k = 0; k < 3; k++) { const v = m.idx[t + k]; s += m.nrm[v * 3] * d[0] + m.nrm[v * 3 + 1] * d[1] + m.nrm[v * 3 + 2] * d[2]; }
      (s < 0 ? back : front).push(m.idx[t], m.idx[t + 1], m.idx[t + 2]);
    }
    out.push({ ...m, idx: Uint32Array.from(front) });
    const col = Float32Array.from(m.col);
    for (let v = 0; v < col.length / 3; v++) {
      const nd = m.nrm[v * 3] * d[0] + m.nrm[v * 3 + 1] * d[1] + m.nrm[v * 3 + 2] * d[2], hemi = m.nrm[v * 3 + 1] * 0.5 + 0.5;
      for (let k = 0; k < 3; k++) col[v * 3 + k] *= L.sky[k] * hemi + L.bounce[k] * (1 - hemi) + L.key[k] * trans * (0.5 + 0.5 * Math.max(0, -nd));
    }
    if (back.length) out.push({ ...m, idx: Uint32Array.from(back), col, emit: true });
  }
  return out;
}

// ================================================================================================== the code-built "before"
async function three() { return import('three'); }
/** 影团 as makeJelly builds it (jellyGeometry, the core, the ember eyes) — renderer meshes */
export async function beforeJelly() {
  const THREE = await three();
  const { threeToMeshes } = await import('../build.mjs');
  const g = new THREE.IcosahedronGeometry(0.5, 7), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < -0.08) y = -0.08 + (y + 0.08) * 0.22;
    const t = clamp((y + 0.1) / 0.6, 0, 1), pinch = 1 - 0.18 * t * t;
    x *= pinch * 1.08; z *= pinch * 1.08; y = y + 0.12 + 0.06 * t * t;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const body = new THREE.Group(), inner = new THREE.Group();
  body.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x2a1650 })));
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc070ff).multiplyScalar(1.6) }));
  core.position.set(0, 0.3, -0.02); inner.add(core);
  const eyes = new THREE.Group();
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a3c).multiplyScalar(1.4) })); e1.scale.set(1.1, 0.75, 0.5);
    const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd0a0).multiplyScalar(1.6) })); e2.position.set(0.012 * s, 0.01, 0.022);
    eye.add(e1, e2); eye.position.set(0.13 * s, 0.4, 0.44); eye.rotation.y = 0.28 * s; eye.rotation.z = -0.25 * s;
    eyes.add(eye);
  }
  return { opaque: threeToMeshes(body), inner: threeToMeshes(inner), eyes: threeToMeshes(eyes) };
}
/** the jelly's ember eyes (code, kept) at given anchors, as renderer meshes */
export async function jellyEyes(anchors) {
  const THREE = await three();
  const { threeToMeshes } = await import('../build.mjs');
  const eyes = new THREE.Group();
  for (const [s, k] of [[-1, 'Eye_L'], [1, 'Eye_R']]) {
    const eye = new THREE.Group();
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a3c).multiplyScalar(1.4) })); e1.scale.set(1.1, 0.75, 0.5);
    const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd0a0).multiplyScalar(1.6) })); e2.position.set(0.012 * s, 0.01, 0.022);
    eye.add(e1, e2); eye.position.set(...anchors[k]); eye.rotation.y = 0.28 * s; eye.rotation.z = -0.25 * s;
    eyes.add(eye);
  }
  return threeToMeshes(eyes);
}

/** 纸魅 as makeHitogata builds it: the folded plane, its canvas texture approximated per vertex (silhouette by triangle) */
export async function beforePaper() {
  const W = 128, H = 192;
  // the canvas path of paperTexture(), flattened (canvas pixels)
  const q = (p0, c, p1, n = 8) => { const o = []; for (let i = 1; i <= n; i++) { const t = i / n; o.push([(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]]); } return o; };
  const poly = [[52, 50], [76, 50], ...q([76, 50], [108, 52], [124, 70]), [118, 96], ...q([118, 96], [98, 88], [86, 86]), [90, 150], [84, 186], [68, 186], [64, 158], [60, 186], [44, 186], [38, 150], [42, 86], ...q([42, 86], [30, 88], [10, 96]), [4, 70], ...q([4, 70], [20, 52], [52, 50])];
  const inside = (x, y) => P.poly2d(poly, x, y) < 0 || ((x - 64) / 21) ** 2 + ((y - 30) / 23) ** 2 < 1;
  const seg = (x, y, a, b) => { const r = d2stroke(x, y, a, b, 0, 0); return r.d; };
  const colAt = (x, y) => {
    let c = C('#fbf3e0');
    if (y > 150) c = mix(c, C('#e8d8bc'), 0.4);
    const eye = Math.min(seg(x, y, [51, 26], [56, 24]), seg(x, y, [56, 24], [60, 29]), seg(x, y, [77, 26], [72, 24]), seg(x, y, [72, 24], [68, 29]));
    if (eye < 1.7) c = C('#231a2c');
    if (((x - 64) / 3.2) ** 2 + ((y - 40) / 2.2) ** 2 < 1) c = C('#231a2c');
    const ds = Math.hypot(x - 64, y - 72);
    if (ds < 7) c = Math.abs(ds - 4) < 0.7 ? C('#fbf3e0') : C('#d63428');
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) if (seg(x, y, [64 + s * (26 + k * 9), 62 + k * 3], [64 + s * (24 + k * 9), 82 + k * 2]) < 0.75) c = mix(c, C('#231a2c'), 0.55);
    if (Math.abs(P.poly2d(poly, x, y)) < 0.8 && y > 48) c = mix(c, C('#3c2c28'), 0.75);
    return c.map((v) => Math.pow(v, 2.2));
  };
  const NX = 96, NY = 144, pos = [], col = [], nrm = [], idx = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const u = i / NX, v = j / NY, x = (u - 0.5) * 0.62, y0 = (v - 0.5) * 0.93;
    pos.push(x, y0 + 0.465, -Math.abs(x) * 0.32 + Math.sin((y0 + 0.4) * 3.2) * 0.02);
    const s = Math.sign(x) || 0; const l = Math.hypot(0.32, 1); nrm.push(s * 0.32 / l, 0, 1 / l);
    col.push(...colAt(u * W, (1 - v) * H));
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const cu = (i + 0.5) / NX * W, cv = (1 - (j + 0.5) / NY) * H;
    if (!inside(cu, cv)) continue;
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  // back-facing copy of normals for the second winding is not needed for the renderer's two-sided lambert
  return { opaque: [{ pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), idx: Uint32Array.from(idx), col: Float32Array.from(col), base: [1, 1, 1] }], inner: [] };
}

// ================================================================================================== build driver
const log = (...a) => console.log(...a);
async function main() {
  const args = process.argv.slice(2);
  const assetPath = path.resolve(args.find((a) => a.endsWith('.mjs')));
  const quick = args.includes('--quick');
  const sheetsOnly = args.includes('--sheets');
  const { loadModel } = await import('../model.mjs');
  const { Pool } = await import('../pool.mjs');
  const { PARTS } = await import('../sdf.mjs');
  const { extract, simplify, splitNormals, checkMesh } = await import('../mesh.mjs');
  const { bakeVertexColors } = await import('../bake.mjs');
  const { faceTags } = await import('../build.mjs');
  const R = await import('../preview.mjs');
  const T0 = Date.now(), secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + ' s';
  const def = (await import(pathToFileURL(assetPath).href)).default;
  const name = def.name, nL = def.lodNames.length;
  const outDir = path.join(ROOT, '.tmp', 'sculpt', name); fs.mkdirSync(outDir, { recursive: true });
  const glbDir = path.join(ROOT, 'assets', 'models', 'sculpt'); fs.mkdirSync(glbDir, { recursive: true });
  const cache = path.join(outDir, 'lods.cache.json');
  let pieces;
  if (sheetsOnly && fs.existsSync(cache)) pieces = JSON.parse(fs.readFileSync(cache, 'utf8'), (k, v) => (v && v.__t ? globalThis[v.__t].from(v.a) : v));
  else {
    pieces = [];
    for (const pc of def.pieces) {
      const lods = [];
      let src = null, curDetail = null, cur = null, diag = 1, fb = null;
      const pools = [];
      try {
        for (let li = 0; li < nL; li++) {
          const target = pc.lods[li];
          if (!target) { lods.push(null); continue; }
          const detail = pc.detail?.[li] ?? 'full';
          if (detail !== curDetail) {
            process.env.JP_PIECE = pc.key; process.env.JP_DETAIL = detail;
            const M = await loadModel(assetPath);
            const vox = (pc.voxel ?? def.voxel) * (pc.voxelMul?.[li] ?? 1) * (quick ? 1.5 : 1);
            const pool = new Pool(assetPath); pools.push(pool);
            log(`${name}/${pc.key} [${detail}]: voxel ${(vox * 1000).toFixed(2)} mm, bounds ${M.bounds.map((v) => v.toFixed(3)).join(' ')}`);
            if (pc.mesh) { cur = { M, pool }; curDetail = detail; }
            else {
            const full = await extract(M, pool, vox, log);
            const tags = await faceTags(pool, full.pos, full.idx);
            const ck = checkMesh(full.pos, full.idx);
            log(`  full: ${full.idx.length / 3} tris, watertight ${ck.watertight}, open ${ck.openEdges}, nonmanifold ${ck.nonManifoldEdges}`);
            fb = ck.bounds; diag = Math.hypot(fb[3] - fb[0], fb[4] - fb[1], fb[5] - fb[2]);
            cur = { M, pool }; curDetail = detail; src = { pos: full.pos, idx: full.idx, tag: tags.part };
            }
          }
          const err = pc.lodError?.[li] ?? 0.004 * diag;
          const t = Date.now();
          let s;
          if (pc.mesh) {
            // an even remesh made directly (no voxel extraction, no decimation): see sheetMesh()
            const m = pc.mesh(detail, target, log), tg = await faceTags(cur.pool, m.pos, m.idx);
            s = { pos: m.pos, idx: m.idx, tag: tg.part };
            if (tg.flips) log(`  faceTags: ${tg.flips} faces flipped against the field`);
            fb = checkMesh(s.pos, s.idx).bounds;
          } else s = simplify(src.pos, src.idx, target, { faceTag: src.tag, hardAngle: def.hardAngle ?? 50, maxError: err });
          const ck = checkMesh(s.pos, s.idx), drift = Math.max(...ck.bounds.map((v, k) => Math.abs(v - fb[k])));
          log(`  ${def.lodNames[li]}: ${s.idx.length / 3} tris (target ${target}), watertight ${ck.watertight}, nonmanifold ${ck.nonManifoldEdges}, drift ${(drift * 1000).toFixed(1)} mm (${secs(t)})`);
          // vertex colours; a vertex on a part border is split per part: sample each copy a little inside its own faces
          const sn = splitNormals(s.pos, s.idx, def.creaseAngle ?? 50, { faceTag: s.tag });
          const nv = sn.pos.length / 3, tagsOf = new Map();
          for (let f = 0; f < sn.idx.length / 3; f++) for (let k = 0; k < 3; k++) { const v = sn.src[sn.idx[f * 3 + k]]; let q = tagsOf.get(v); if (!q) tagsOf.set(v, (q = new Set())); q.add(s.tag[f]); }
          const at = Float32Array.from(sn.pos), acc = new Float32Array(nv * 4);
          for (let f = 0; f < sn.idx.length / 3; f++) {
            const ia = sn.idx[f * 3], ib = sn.idx[f * 3 + 1], ic = sn.idx[f * 3 + 2];
            for (const v of [ia, ib, ic]) {
              if (tagsOf.get(sn.src[v]).size < 2) continue;
              for (let k = 0; k < 3; k++) acc[v * 4 + k] += (sn.pos[ia * 3 + k] + sn.pos[ib * 3 + k] + sn.pos[ic * 3 + k]) / 3;
              acc[v * 4 + 3]++;
            }
          }
          for (let v = 0; v < nv; v++) if (acc[v * 4 + 3]) for (let k = 0; k < 3; k++) at[v * 3 + k] = 0.35 * sn.pos[v * 3 + k] + 0.65 * acc[v * 4 + k] / acc[v * 4 + 3];
          const vc = await bakeVertexColors(cur.pool, at, cur.M);
          lods.push({ pos: sn.pos, nrm: sn.nrm, idx: sn.idx, col: vc.col, tag: s.tag, check: ck, target });
          src = s;
        }
      } finally { for (const p of pools) await p.close().catch(() => {}); }
      pieces.push({ key: pc.key, node: pc.node, lods });
    }
    fs.writeFileSync(cache, JSON.stringify(pieces, (k, v) => (ArrayBuffer.isView(v) ? { __t: v.constructor.name, a: Array.from(v) } : v)));
  }
  // parts are declared by build() in a fixed order: load once so PARTS matches the cached tags
  process.env.JP_PIECE = def.pieces[0].key; process.env.JP_DETAIL = 'full';
  await loadModel(assetPath);
  const glb = path.join(glbDir, name + '.glb');
  const bytes = await writeGLB(glb, def, pieces, PARTS);
  log(`  wrote ${path.relative(ROOT, glb)} (${(bytes / 1024).toFixed(0)} KB)`);
  // checks + manifest fragment
  const before = def.before ? await def.before() : null;
  const lodTris = def.lodNames.map((n, li) => pieces.reduce((a, p) => a + (p.lods[li] ? p.lods[li].idx.length / 3 : 0), 0));
  const allB = bboxOf(pieces.flatMap((p) => (p.lods[0] ? [p.lods[0]] : [])));
  const beforeB = before ? bboxOf([...before.opaque, ...(before.inner || [])]) : null;
  const checks = {
    name, lods: Object.fromEntries(def.lodNames.map((n, li) => [n, { tris: lodTris[li], pieces: Object.fromEntries(pieces.filter((p) => p.lods[li]).map((p) => [p.node, { tris: p.lods[li].idx.length / 3, target: p.lods[li].target, watertight: p.lods[li].check.watertight, openEdges: p.lods[li].check.openEdges, nonManifoldEdges: p.lods[li].check.nonManifoldEdges, bounds: p.lods[li].check.bounds.map((v) => +v.toFixed(3)) }])) }])),
    bounds: allB.map((v) => +v.toFixed(3)), size: sizeOf(allB),
    vsReplaced: beforeB ? { before: beforeB.map((v) => +v.toFixed(3)), sizeBefore: sizeOf(beforeB), maxDelta: +Math.max(...allB.map((v, k) => Math.abs(v - beforeB[k]))).toFixed(3) } : null,
    fileKB: Math.round(bytes / 1024), vertexColourOnly: true, buildSeconds: +((Date.now() - T0) / 1000).toFixed(1),
  };
  fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 1));
  const frag = { [def.id]: {
    file: `models/sculpt/${name}.glb`, type: 'model', license: 'CC0 (original work)', author: 'sculpted for this project',
    source: `tools/sculpt/assets/${name}.mjs (node tools/sculpt/assets/jellypaper_lib.mjs)`, scale: 1,
    size: sizeOf(allB), tris: lodTris[0], lods: lodTris, lodNames: def.lodNames,
    materials: [...new Set(Object.values(def.materials).map((m) => m.name))], notes: def.notes || '',
  } };
  fs.writeFileSync(path.join(glbDir, name + '.manifest.json'), JSON.stringify(frag, null, 1) + '\n');
  await sheets({ def, pieces, before, outDir, quick, R });
  log(JSON.stringify({ lods: lodTris, size: checks.size, before: checks.vsReplaced?.sizeBefore, maxDelta: checks.vsReplaced?.maxDelta, fileKB: checks.fileKB }));
  log(`done in ${secs(T0)}`);
}
const sizeOf = (b) => [+(b[3] - b[0]).toFixed(3), +(b[4] - b[1]).toFixed(3), +(b[5] - b[2]).toFixed(3)];
export function bboxOf(meshes) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
  return b;
}

/** GLB: root <name>; one node per LOD (<name>_<lodName>); under it one child node per piece (its game name) with a mesh,
 *  one primitive per material, COLOR_0 (linear, as the kit writes it), no textures. Anchors as empty nodes under root. */
async function writeGLB(file, def, pieces, PARTS) {
  const { Document, NodeIO } = await import('@gltf-transform/core');
  const doc = new Document(), buf = doc.createBuffer(), name = def.name;
  const scene = doc.createScene(name);
  const root = doc.createNode(name).setExtras({ sculpt: { author: 'sculpted for this project', lods: def.lodNames, vertexColour: true } });
  scene.addChild(root);
  const mats = new Map();
  const material = (key) => {
    if (mats.has(key)) return mats.get(key);
    const spec = def.materials[key] || { name: key, surface: 'none' };
    const m = doc.createMaterial(spec.name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0)
      .setExtras({ surface: spec.surface, look: spec.look || {}, sculpt: { lod: 'vertex' } });
    mats.set(key, m); return m;
  };
  def.lodNames.forEach((ln, li) => {
    const lodNode = doc.createNode(`${name}_${ln}`).setExtras({ lod: ln });
    root.addChild(lodNode);
    for (const pc of pieces) {
      const L = pc.lods[li]; if (!L) continue;
      const mesh = doc.createMesh(`${pc.node}_${ln}`);
      const groups = new Map();
      for (let f = 0; f < L.idx.length / 3; f++) {
        const key = PARTS[L.tag[f]]?.mat || 'default';
        let g = groups.get(key); if (!g) groups.set(key, (g = [])); g.push(L.idx[f * 3], L.idx[f * 3 + 1], L.idx[f * 3 + 2]);
      }
      for (const [key, ids] of groups) {
        const remap = new Map(), Pp = [], N = [], Cc = [], I = [];
        for (const v of ids) {
          let r = remap.get(v);
          if (r === undefined) { r = remap.size; remap.set(v, r); Pp.push(L.pos[v * 3], L.pos[v * 3 + 1], L.pos[v * 3 + 2]); N.push(L.nrm[v * 3], L.nrm[v * 3 + 1], L.nrm[v * 3 + 2]); Cc.push(L.col[v * 3], L.col[v * 3 + 1], L.col[v * 3 + 2]); }
          I.push(r);
        }
        mesh.addPrimitive(doc.createPrimitive()
          .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(Pp)).setBuffer(buf))
          .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(N)).setBuffer(buf))
          .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(Cc)).setBuffer(buf))
          .setIndices(doc.createAccessor().setType('SCALAR').setArray(remap.size > 65535 ? Uint32Array.from(I) : Uint16Array.from(I)).setBuffer(buf))
          .setMaterial(material(key)));
      }
      lodNode.addChild(doc.createNode(pc.node).setMesh(mesh).setExtras({ piece: pc.key, tris: L.idx.length / 3 }));
    }
  });
  for (const [k, p] of Object.entries(def.anchors || {})) root.addChild(doc.createNode(k).setTranslation(p).setExtras({ anchor: true }));
  const bin = await new NodeIO().writeBinary(doc);
  fs.writeFileSync(file, bin);
  return bin.length;
}

// ================================================================================================== sheets
export const scaleMeshes = (ms, s, lift = 0) => ms.map((m) => ({ ...m, pos: m.pos.map((v, i) => v * s + (i % 3 === 1 ? lift : 0)) }));
/** a stand-in for the game's translucent body: blend of the opaque render and the render without the body */
export function translucent(R, opaque, inner, cam, alpha, opts = {}) {
  const A = R.render([...opaque, ...inner], cam, opts), B = R.render(inner, cam, { ...opts, shadow: false });
  for (let i = 0; i < A.d.length; i++) A.d[i] = A.d[i] * alpha + B.d[i] * (1 - alpha);
  return A;
}
async function sheets({ def, pieces, before, outDir, quick, R }) {
  if (def.backlit) { const R0 = R; R = { ...R0, render: (ms, cam, o = {}) => R0.render(o.clay || o.wire ? ms : backlit(ms, def.backlit, R0.LIGHT), cam, o) }; }
  const name = def.name, gs = def.gameScale || 1, save = (n, img) => { R.savePNG(path.join(outDir, n), img); log(`  sheet .tmp/sculpt/${name}/${n}`); };
  const lodM = (li, filter = null) => pieces.filter((p) => p.lods[li] && (!filter || filter(p))).map((p) => ({ pos: p.lods[li].pos, nrm: p.lods[li].nrm, idx: p.lods[li].idx, col: p.lods[li].col, base: [1, 1, 1], piece: p.key }));
  const extra = def.extraMeshes ? await def.extraMeshes() : [];     // code-kept parts (eyes) for the sheets
  const after = [...lodM(0), ...extra];
  const b = bboxOf(after), c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const H = b[4] - b[1];
  const fov = 35, ts = quick ? 300 : 440, dist = R.fitDistance(b, fov, 0.86);
  const gOpt = { ground: def.ground != null, groundY: b[1] };
  const views = [];
  for (let i = 0; i < 8; i++) views.push([i * 45, 10, `${i * 45} DEG`]);
  for (let i = 0; i < 3; i++) views.push([30 + i * 120, 55, `ABOVE ${30 + i * 120}`]);
  views.push([20, -25, 'BELOW']);
  save('turntable.png', R.sheet(views.map(([az, el, label]) => ({ img: R.render(after, R.orbit(c, az, el, dist, fov, ts, ts), { ...gOpt, ground: gOpt.ground && el > 0 }), label })), 4, { title: `${name} TURNTABLE (${def.lodNames[0]}, VERTEX COLOUR, OPAQUE)` }));
  const clayM = lodM(0);
  save('clay.png', R.sheet([0, 90, 180, 270].map((az) => ({ img: R.render(clayM, R.orbit(c, az + 20, 14, dist, fov, ts, ts), { clay: true, ground: false }), label: `CLAY ${az + 20}` })).concat([{ img: R.render(clayM, R.orbit(c, 40, 70, dist, fov, ts, ts), { clay: true, ground: false }), label: 'CLAY TOP' }]), 5, { title: `${name} CLAY - FORM ONLY` }));
  // game-sized: scale by the creature's def.scale
  const lift = def.sheetLift || 0, sAfter = scaleMeshes(after, gs, lift), sb = bboxOf(sAfter), sc = [(sb[0] + sb[3]) / 2, (sb[1] + sb[4]) / 2, (sb[2] + sb[5]) / 2], sH = sb[4] - sb[1];
  const heroW = quick ? 960 : 1440, heroH = quick ? 540 : 810, eyeY = 1.6, heroD = 2 + Math.max(sb[3] - sb[0], sb[5] - sb[2]) / 2;
  const heroCam = (az, w = heroW, h = heroH, fv = 50) => { const a = az * Math.PI / 180; return R.camera([sc[0] + Math.sin(a) * heroD, eyeY, sc[2] + Math.cos(a) * heroD], [sc[0], sb[1] + sH * 0.5, sc[2]], fv, w, h); };
  save('hero.png', R.render(sAfter, heroCam(28), { ...gOpt, groundY: sb[1] }));
  const gameCam = (w, h, px) => { const k = 1 / Math.tan(50 * Math.PI / 360); const d = (h / 2) * k * sH / px; const a = 25 * Math.PI / 180, e = 14 * Math.PI / 180; return R.camera([sc[0] + Math.sin(a) * d * Math.cos(e), sc[1] + Math.sin(e) * d, sc[2] + Math.cos(a) * d * Math.cos(e)], sc, 50, w, h); };
  save('game.png', R.sheet(def.lodNames.map((ln, li) => ({ img: R.render(scaleMeshes([...lodM(li), ...extra], gs, lift), gameCam(480, 560, 300), { ...gOpt, groundY: sb[1] }), label: `${ln} ${lodM(li).reduce((a, m) => a + m.idx.length / 3, 0)} TRIS` })), def.lodNames.length, { title: `${name} AT 300 PX TALL` }));
  const lt = [];
  for (let li = 0; li < def.lodNames.length; li++) lt.push({ img: R.render(lodM(li), R.orbit(c, 30, 12, dist, fov, ts, ts), { ground: false }), label: `${def.lodNames[li]}` });
  for (let li = 0; li < def.lodNames.length; li++) lt.push({ img: R.render(lodM(li).map((m) => ({ ...m, col: null })), R.orbit(c, 30, 12, dist, fov, ts, ts), { wire: true, clay: true, ground: false }), label: `${def.lodNames[li]} WIRE` });
  save('lods.png', R.sheet(lt, def.lodNames.length, { title: `${name} LODS` }));
  if (before) {
    const bs = quick ? 420 : 600;
    const bo = scaleMeshes([...before.opaque, ...(before.inner || []), ...(before.eyes || [])], gs, lift);
    const cmp = (az) => heroCam(az, bs, bs, 40);
    const gc = gameCam(bs, Math.round(bs * 0.7), 200);
    const lod1 = scaleMeshes([...lodM(1), ...extra], gs, lift);
    const tiles = [
      { img: R.render(bo, cmp(28), { ...gOpt, groundY: sb[1] }), label: 'BEFORE - 2 M' }, { img: R.render(sAfter, cmp(28), { ...gOpt, groundY: sb[1] }), label: 'AFTER - 2 M' },
      { img: R.render(bo, cmp(208), { ...gOpt, groundY: sb[1] }), label: 'BEFORE - BACK' }, { img: R.render(sAfter, cmp(208), { ...gOpt, groundY: sb[1] }), label: 'AFTER - BACK' },
      { img: R.render(bo, gc, { ...gOpt, groundY: sb[1] }), label: 'BEFORE - GAME CAMERA' }, { img: R.render(lod1, gc, { ...gOpt, groundY: sb[1] }), label: `AFTER ${def.lodNames[1]} - GAME CAMERA` },
      { img: R.render(scaleMeshes(before.opaque, gs, lift), R.orbit(sc, 28, 14, dist * gs, fov, bs, bs), { clay: true, ground: false }), label: 'BEFORE - CLAY' }, { img: R.render(scaleMeshes(clayM, gs, lift), R.orbit(sc, 28, 14, dist * gs, fov, bs, bs), { clay: true, ground: false }), label: 'AFTER - CLAY' },
    ];
    save('before_after.png', R.sheet(tiles, 2, { title: `${name} BEFORE / AFTER - GAME SCALE ${gs}` }));
  }
  if (def.look) await def.look({ R, lodM, extra, before, save, c, b, dist, fov, quick, gs, heroCam, gameCam, sb, sc, scaleMeshes, translucent });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
