// Hidden-surface cull for layered outfits: drops the triangles of an inner layer (skin, undergarment) that an opaque outer
// layer covers in EVERY pose, so a dressed figure does not pay for what nobody can see. The sources stay whole: an outfit
// build calls this on its own copy of the index lists (tools/costume/v3.mjs; `--whole` there skips it).
//
//   import { cullCovered } from './cull.mjs';
//   const r = cullCovered(target, covers, opts);   // -> { idx (kept triangles), keep (Uint8Array per triangle), stats }
//
// target  { pos, idx, nrm? }                       flat Float32Array / number[] (x, y, z …) or [[x, y, z] …]; nrm optional
// covers  [{ name, pos, idx, margin? }]            opaque layers in the SAME bind space (weights copied from the skin under
//                                                  them, so they move with it: covered at rest = covered in every pose)
// opts    { maxGap 0.08, margin 0.035, rays 5, tilt 32°, erode 0.012, keepIf(x, y, z) -> true keeps the vertex,
//           hiddenEdges true, edgeMargin 0.02, normalsFrom { pos, nrm } (aim the rays along a reference surface's normals) }
//
// A vertex counts as covered when EVERY ray of a small cone around its normal (straight out + `rays - 1` tilted by `tilt`)
// hits a cover within `maxGap`, and the FIRST hit lies at least `margin` (the cover's own margin if it has one) from that
// cover's open edges (neck, cuffs, hems, sleeve openings: the boundary edges of the welded cover mesh). Each connected part
// of a cover is its own cover; an open edge that itself lies under another cover (a waistband under the robe, the inner
// sleeve's top end under the kosode) is not an opening (`hiddenEdges`, tested with `edgeMargin`). Then the covered set is
// eroded by `erode` along the target's own edges, and a triangle goes only when all three of its corners stay covered.
// Conservative by construction: a vertex near any opening, under a thin gap at a grazing angle, or under a hanging layer
// (not passed as a cover) is kept.

const flat = (p) => (p instanceof Float32Array || p instanceof Float64Array ? p : Array.isArray(p[0]) ? Float32Array.from(p.flat()) : Float32Array.from(p));
const flatIdx = (I) => (I instanceof Uint32Array || I instanceof Uint16Array || I instanceof Int32Array ? I : Uint32Array.from(I));

/** vertex normals (area weighted) of a flat mesh */
export function meshNormals(P, I) {
  const n = P.length / 3, N = new Float32Array(n * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { N[v] += nx; N[v + 1] += ny; N[v + 2] += nz; }
  }
  for (let v = 0; v < n; v++) { const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l; }
  return N;
}

/** points along the open edges of a mesh (welded by position to 0.01 mm first), spaced <= step */
export function openEdgePoints(P, I, step = 0.004, withNormals = false) {
  const VN = withNormals ? meshNormals(P, I) : null, on = [];
  const key = new Map(), id = new Int32Array(P.length / 3);
  for (let v = 0; v < id.length; v++) { const k = Math.round(P[v * 3] * 1e5) + ',' + Math.round(P[v * 3 + 1] * 1e5) + ',' + Math.round(P[v * 3 + 2] * 1e5); if (!key.has(k)) key.set(k, v); id[v] = key.get(k); }
  const ec = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = id[I[t + e]], b = id[I[t + (e + 1) % 3]]; if (a === b) continue;
    const k = a < b ? a * 4194304 + b : b * 4194304 + a; ec.set(k, (ec.get(k) || 0) + 1);
  }
  const out = [];
  for (const [k, c] of ec) {
    if (c !== 1) continue;
    const a = Math.floor(k / 4194304), b = k % 4194304;
    const L = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]), n = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i < n; i++) { const t = i / n; out.push(P[a * 3] + (P[b * 3] - P[a * 3]) * t, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t);
      if (VN) { let x = VN[a * 3] * (1 - t) + VN[b * 3] * t, y = VN[a * 3 + 1] * (1 - t) + VN[b * 3 + 1] * t, z = VN[a * 3 + 2] * (1 - t) + VN[b * 3 + 2] * t; const l = Math.hypot(x, y, z) || 1; on.push(x / l, y / l, z / l); } }
  }
  return VN ? { pts: Float32Array.from(out), nrm: Float32Array.from(on) } : Float32Array.from(out);
}

/** the triangles of a mesh split by connected part (welded by position) -> [Uint32Array idx …] */
export function components(P, I) {
  const key = new Map(), id = new Int32Array(P.length / 3);
  for (let v = 0; v < id.length; v++) { const k = Math.round(P[v * 3] * 1e5) + ',' + Math.round(P[v * 3 + 1] * 1e5) + ',' + Math.round(P[v * 3 + 2] * 1e5); if (!key.has(k)) key.set(k, v); id[v] = key.get(k); }
  const par = new Int32Array(id.length).map((_, i) => i), find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < I.length; t += 3) { const a = find(id[I[t]]); par[find(id[I[t + 1]])] = a; par[find(id[I[t + 2]])] = find(a); }
  const by = new Map(); for (let t = 0; t < I.length; t += 3) { const r = find(id[I[t]]); if (!by.has(r)) by.set(r, []); by.get(r).push(I[t], I[t + 1], I[t + 2]); }
  return [...by.values()].filter((a) => a.length >= 3 * 16).map((a) => Uint32Array.from(a));
}

/** uniform grid over points or triangles */
class Grid {
  constructor(cell) { this.c = cell; this.m = new Map(); }
  key(i, j, k) { return ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512); }
  cellOf(x) { return Math.floor(x / this.c); }
  add(i, j, k, v) { const kk = this.key(i, j, k); let a = this.m.get(kk); if (!a) this.m.set(kk, (a = [])); a.push(v); }
  get(i, j, k) { return this.m.get(this.key(i, j, k)); }
}

function pointGrid(Q, cell) {
  const g = new Grid(cell);
  for (let i = 0; i < Q.length / 3; i++) g.add(g.cellOf(Q[i * 3]), g.cellOf(Q[i * 3 + 1]), g.cellOf(Q[i * 3 + 2]), i);
  return g;
}
/** distance from (x, y, z) to the nearest point of a point grid, capped at cap */
function nearest(g, Q, x, y, z, cap) {
  const r = Math.ceil(cap / g.c), ci = g.cellOf(x), cj = g.cellOf(y), ck = g.cellOf(z); let best = cap * cap;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
    const a = g.get(ci + i, cj + j, ck + k); if (!a) continue;
    for (const q of a) { const dx = Q[q * 3] - x, dy = Q[q * 3 + 1] - y, dz = Q[q * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < best) best = d; }
  }
  return Math.sqrt(best);
}

function triGrid(list, cell) {
  const g = new Grid(cell);
  list.forEach((c, ci) => {
    const P = c.P, I = c.I;
    for (let t = 0; t < I.length; t += 3) {
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (let e = 0; e < 3; e++) for (let a = 0; a < 3; a++) { const v = P[I[t + e] * 3 + a]; lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v); }
      for (let i = g.cellOf(lo[0]); i <= g.cellOf(hi[0]); i++) for (let j = g.cellOf(lo[1]); j <= g.cellOf(hi[1]); j++) for (let k = g.cellOf(lo[2]); k <= g.cellOf(hi[2]); k++) g.add(i, j, k, ci * 1e7 + t);
    }
  });
  return g;
}

/** Möller–Trumbore, both faces; -> t or -1 */
function rayTri(P, I, t, o, d) {
  const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
  const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return -1;
  const inv = 1 / det, tx = o[0] - P[a], ty = o[1] - P[a + 1], tz = o[2] - P[a + 2], u = (tx * px + ty * py + tz * pz) * inv; if (u < -1e-6 || u > 1 + 1e-6) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

/** every hit along o + s d, s in (0, maxS]: [{ s, cover }] */
function castAll(g, list, o, d, maxS) {
  const hits = [], seen = new Set(), step = g.c * 0.5, n = Math.ceil(maxS / step) + 1;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(maxS, i * step), x = o[0] + d[0] * s, y = o[1] + d[1] * s, z = o[2] + d[2] * s;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const arr = g.get(g.cellOf(x) + a, g.cellOf(y) + b, g.cellOf(z) + c); if (!arr) continue;
      for (const code of arr) {
        if (seen.has(code)) continue; seen.add(code);
        const ci = Math.floor(code / 1e7), t = code - ci * 1e7, hs = rayTri(list[ci].P, list[ci].I, t, o, d);
        if (hs > 1e-5 && hs <= maxS) hits.push({ s: hs, cover: ci });
      }
    }
  }
  return hits;
}

/**
 * -> { idx: Uint32Array (kept triangles), keep: Uint8Array per triangle, covered: Uint8Array per vertex, stats }
 */
export function cullCovered(target, covers, opts = {}) {
  const O = { maxGap: 0.08, margin: 0.035, rays: 5, tilt: 32, erode: 0.012, keepIf: null, hiddenEdges: true, edgeMargin: 0.02, ...opts };
  const P = flat(target.pos), I = flatIdx(target.idx), nv = P.length / 3;
  let N = target.nrm ? flat(target.nrm) : meshNormals(P, I);
  // normalsFrom { pos, nrm }: aim every vertex's ray cone along the normal of the nearest point of a reference surface (the
  // skin under an undergarment): the hem walls of a thin layer face along the limb and their own rays run inside the gap
  if (O.normalsFrom) {
    const RP = flat(O.normalsFrom.pos), RN = O.normalsFrom.nrm ? flat(O.normalsFrom.nrm) : meshNormals(RP, flatIdx(O.normalsFrom.idx)), rg = pointGrid(RP, 0.02), N2 = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], ci = rg.cellOf(x), cj = rg.cellOf(y), ck = rg.cellOf(z); let best = 0.03 * 0.03, bv = -1;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const a = rg.get(ci + i, cj + j, ck + k); if (!a) continue; for (const q of a) { const d = (RP[q * 3] - x) ** 2 + (RP[q * 3 + 1] - y) ** 2 + (RP[q * 3 + 2] - z) ** 2; if (d < best) { best = d; bv = q; } } }
      for (let c = 0; c < 3; c++) N2[v * 3 + c] = bv >= 0 ? RN[bv * 3 + c] : N[v * 3 + c];
    }
    N = N2;
  }
  // every connected part of a cover is a cover of its own (robe and shorts in one primitive have different openings)
  const parts = []; for (const c of covers) { const cP = flat(c.pos), cI = flatIdx(c.idx), comps = components(cP, cI); comps.forEach((ci, k) => parts.push({ name: comps.length > 1 ? `${c.name}#${k}` : c.name, P: cP, I: ci, margin: c.margin })); }
  const list = parts.map((c) => { const E = openEdgePoints(c.P, c.I, 0.004, true); return { name: c.name, P: c.P, I: c.I, E: E.pts, EN: E.nrm, eg: pointGrid(E.pts, 0.02), margin: c.margin ?? O.margin }; });
  const g = triGrid(list, 0.02);
  // the ray cone: straight out + (rays - 1) tilted around it
  const tilt = O.tilt * Math.PI / 180, dirs = (n) => {
    const out = [n]; const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]]; const lu = Math.hypot(...u); u = u.map((q) => q / lu);
    const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    for (let r = 0; r < O.rays - 1; r++) { const ph = (r / (O.rays - 1)) * Math.PI * 2, c = Math.cos(ph) * Math.sin(tilt), s = Math.sin(ph) * Math.sin(tilt), k = Math.cos(tilt);
      out.push([n[0] * k + u[0] * c + w[0] * s, n[1] * k + u[1] * c + w[1] * s, n[2] * k + u[2] * c + w[2] * s]); }
    return out;
  };
  // an open edge that lies UNDER another cover (the shorts' waistband under the robe, the inner sleeve's top end under the
  // kosode) is no opening to the outside: such edge points are dropped before the margin test (edgeMargin from the other
  // cover's own open edges)
  const hidden = {};
  if (O.hiddenEdges && list.length > 1) {
    // the ray cone of an edge point leaves along the TARGET's normal nearest to it (the skin's outward direction): the cover's
    // own normal there belongs to its hem wall and runs along the limb
    const tg = pointGrid(P, 0.02);
    const nearV = (x, y, z) => { const ci = tg.cellOf(x), cj = tg.cellOf(y), ck = tg.cellOf(z); let best = 0.03 * 0.03, bv = -1;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const a = tg.get(ci + i, cj + j, ck + k); if (!a) continue; for (const q of a) { const d = (P[q * 3] - x) ** 2 + (P[q * 3 + 1] - y) ** 2 + (P[q * 3 + 2] - z) ** 2; if (d < best) { best = d; bv = q; } } }
      return bv; };
    for (const [ci, c] of list.entries()) {
      const keep = [], ne = c.E.length / 3; let gone = 0;
      for (let e = 0; e < ne; e++) {
        const tv = nearV(c.E[e * 3], c.E[e * 3 + 1], c.E[e * 3 + 2]);
        const n = tv >= 0 ? [N[tv * 3], N[tv * 3 + 1], N[tv * 3 + 2]] : [c.EN[e * 3], c.EN[e * 3 + 1], c.EN[e * 3 + 2]], o = [c.E[e * 3] + n[0] * 2e-4, c.E[e * 3 + 1] + n[1] * 2e-4, c.E[e * 3 + 2] + n[2] * 2e-4];
        let ok = true;
        for (const d of dirs(n)) {
          const hits = castAll(g, list, o, d, O.maxGap).filter((h) => h.cover !== ci);
          if (!hits.some((h) => { const q = list[h.cover]; return nearest(q.eg, q.E, o[0] + d[0] * h.s, o[1] + d[1] * h.s, o[2] + d[2] * h.s, O.edgeMargin + 0.001) >= O.edgeMargin; })) { ok = false; break; }
        }
        if (ok) gone++; else keep.push(c.E[e * 3], c.E[e * 3 + 1], c.E[e * 3 + 2]);
      }
      hidden[c.name] = gone; c.Eopen = Float32Array.from(keep);
    }
    for (const c of list) { c.E = c.Eopen; c.eg = pointGrid(c.E, 0.02); }
  }
  const covered = new Uint8Array(nv); const why = { open: 0, miss: 0, keepIf: 0 };
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (O.keepIf && O.keepIf(x, y, z)) { why.keepIf++; continue; }
    const n = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], o = [x + n[0] * 2e-4, y + n[1] * 2e-4, z + n[2] * 2e-4];
    let ok = true;
    for (const d of dirs(n)) {
      const hits = castAll(g, list, o, d, O.maxGap);
      if (!hits.length) { ok = false; why.miss++; break; }
      // the FIRST cover along the ray decides: covered if that hit is far enough from its open edges (a later cover could be
      // another limb's layer, which does not stay in front of this vertex in every pose)
      let h = hits[0]; for (const q of hits) if (q.s < h.s) h = q;
      const c = list[h.cover], good = nearest(c.eg, c.E, o[0] + d[0] * h.s, o[1] + d[1] * h.s, o[2] + d[2] * h.s, c.margin + 0.001) >= c.margin;
      if (!good) { ok = false; why.open++; break; }
    }
    if (ok) covered[v] = 1;
  }
  // erode along the target's edges (Dijkstra-lite from every uncovered vertex, up to O.erode)
  if (O.erode > 0) {
    const adj = Array.from({ length: nv }, () => []);
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; adj[a].push(b); adj[b].push(a); }
    // seams: vertices at the same position are one vertex for the erosion
    const key = new Map(); for (let v = 0; v < nv; v++) { const k = Math.round(P[v * 3] * 1e5) + ',' + Math.round(P[v * 3 + 1] * 1e5) + ',' + Math.round(P[v * 3 + 2] * 1e5); const w = key.get(k); if (w !== undefined) { adj[v].push(w); adj[w].push(v); } else key.set(k, v); }
    const dist = new Float32Array(nv).fill(1e9); let front = [];
    for (let v = 0; v < nv; v++) if (!covered[v]) { dist[v] = 0; front.push(v); }
    while (front.length) {
      const next = [];
      for (const a of front) for (const b of adj[a]) { const d = dist[a] + Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]); if (d < dist[b] && d < O.erode) { dist[b] = d; next.push(b); } }
      front = next;
    }
    for (let v = 0; v < nv; v++) if (dist[v] < O.erode) covered[v] = 0;
  }
  const nt = I.length / 3, keep = new Uint8Array(nt), out = [];
  for (let t = 0; t < nt; t++) { const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2]; if (!(covered[a] && covered[b] && covered[c])) { keep[t] = 1; out.push(a, b, c); } }
  const kept = out.length / 3;
  return { idx: Uint32Array.from(out), keep, covered, stats: { tris: nt, kept, dropped: nt - kept, verts: nv, covered: covered.reduce((s, q) => s + q, 0), why, covers: list.map((c) => `${c.name}: ${c.E.length / 3} open-edge points` + (hidden[c.name] ? ` (+${hidden[c.name]} hidden under another cover)` : '')) } };
}

/** drop the vertices no kept triangle uses; carry = { name: [array per vertex | flat array, itemSize] } -> { idx, map, carried } */
export function compactKept(nv, idx, carry = {}) {
  const map = new Int32Array(nv).fill(-1); let n = 0; const I = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) { const v = idx[i]; if (map[v] < 0) map[v] = n++; I[i] = map[v]; }
  const carried = {};
  for (const [k, [arr, size]] of Object.entries(carry)) {
    if (size === 0) { const o = new Array(n); for (let v = 0; v < nv; v++) if (map[v] >= 0) o[map[v]] = arr[v]; carried[k] = o; continue; }
    const o = new arr.constructor(n * size); for (let v = 0; v < nv; v++) if (map[v] >= 0) for (let c = 0; c < size; c++) o[map[v] * size + c] = arr[v * size + c]; carried[k] = o;
  }
  return { idx: I, map, n, carried };
}
