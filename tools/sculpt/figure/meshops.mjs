// Mesh operations the figure needs on top of the kit's mesher: exact plane clipping, welding, mirroring a half figure,
// splitting long edges (deformation needs vertices where QEM left none), boundary loops, small vector helpers.
// A mesh here is { pos: Float32Array, idx: Uint32Array } (+ whatever the caller carries through `src`).

/**
 * Keep the part of the mesh with n . p + d >= 0. Crossing triangles are cut exactly on the plane.
 * Returns { pos, idx, src } — src[v] = [i, j, t]: output vertex v = input i + (input j - input i) * t (t = 0 for kept ones).
 */
export function clipPlane(mesh, n, d) {
  const { pos, idx } = mesh, nv = pos.length / 3;
  const s = new Float64Array(nv);
  for (let v = 0; v < nv; v++) s[v] = n[0] * pos[v * 3] + n[1] * pos[v * 3 + 1] + n[2] * pos[v * 3 + 2] + d;
  const map = new Int32Array(nv).fill(-1), P = [], src = [], I = [], cut = new Map();
  const keep = (v) => { if (map[v] < 0) { map[v] = P.length / 3; P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); src.push([v, v, 0]); } return map[v]; };
  const cross = (a, b) => { // a inside, b outside
    const key = a < b ? a * nv + b : b * nv + a;
    let c = cut.get(key);
    if (c === undefined) {
      const t = s[a] / (s[a] - s[b]);
      c = P.length / 3; P.push(pos[a * 3] + (pos[b * 3] - pos[a * 3]) * t, pos[a * 3 + 1] + (pos[b * 3 + 1] - pos[a * 3 + 1]) * t, pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * t);
      src.push([a, b, t]); cut.set(key, c);
    }
    return c;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]], inn = v.map((x) => s[x] >= 0), cnt = inn[0] + inn[1] + inn[2];
    if (cnt === 0) continue;
    if (cnt === 3) { I.push(keep(v[0]), keep(v[1]), keep(v[2])); continue; }
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3];
      if (cnt === 1 && inn[k]) { I.push(keep(a), cross(a, b), cross(a, c)); break; }
      if (cnt === 2 && !inn[k]) { const pb = keep(b), pc = keep(c), ab = cross(b, a), ac = cross(c, a); I.push(ab, pb, pc, ab, pc, ac); break; }
    }
  }
  return dropDegenerate({ pos: Float32Array.from(P), idx: Uint32Array.from(I), src });
}

function dropDegenerate(m) {
  const I = [];
  for (let t = 0; t < m.idx.length; t += 3) { const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2]; if (a !== b && b !== c && a !== c) I.push(a, b, c); }
  m.idx = Uint32Array.from(I); return m;
}

/** remove unused vertices; arrays in `attrs` ({name: {a: TypedArray, n: components}}) are carried along */
export function compact(mesh, attrs = {}) {
  const nv = mesh.pos.length / 3, map = new Int32Array(nv).fill(-1); let n = 0;
  for (const v of mesh.idx) if (map[v] < 0) map[v] = n++;
  const take = (a, k) => { const o = new a.constructor(n * k); for (let v = 0; v < nv; v++) if (map[v] >= 0) for (let c = 0; c < k; c++) o[map[v] * k + c] = a[v * k + c]; return o; };
  const out = { pos: take(mesh.pos, 3), idx: Uint32Array.from(mesh.idx, (v) => map[v]), map };
  for (const k in attrs) out[k] = take(attrs[k].a, attrs[k].n);
  return out;
}

/** weld vertices closer than eps (grid hash); returns { pos, idx, map } */
export function weld(mesh, eps = 1e-6) {
  const { pos, idx } = mesh, nv = pos.length / 3, map = new Int32Array(nv), P = [], grid = new Map();
  const q = (v) => Math.round(v / eps);
  for (let v = 0; v < nv; v++) {
    const k = q(pos[v * 3]) + ',' + q(pos[v * 3 + 1]) + ',' + q(pos[v * 3 + 2]);
    let u = grid.get(k);
    if (u === undefined) { u = P.length / 3; P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); grid.set(k, u); }
    map[v] = u;
  }
  return dropDegenerate({ pos: Float32Array.from(P), idx: Uint32Array.from(idx, (v) => map[v]), map });
}

/** the half x >= 0 (boundary on x = 0) -> the whole figure: vertices with |x| < eps are snapped to 0 and shared.
 *  Returns { pos, idx, mirrorOf } — mirrorOf[v] = the vertex mirrored from v (itself on the plane). */
export function mirrorX(mesh, eps = 2e-4) {
  const { pos, idx } = mesh, nv = pos.length / 3;
  const P = Array.from(pos), twin = new Int32Array(nv);
  for (let v = 0; v < nv; v++) {
    if (Math.abs(pos[v * 3]) < eps) { P[v * 3] = 0; twin[v] = v; }
    else { twin[v] = P.length / 3; P.push(-pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
  }
  // A triangle with all three vertices welded on the mirror plane is inside the joined volume.
  // Emitting it twice creates oppositely wound coincident faces and four-way edges along the seam.
  const I = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (twin[a] !== a || twin[b] !== b || twin[c] !== c) I.push(a, b, c);
  }
  const leftCount = I.length;
  for (let t = 0; t < leftCount; t += 3) I.push(twin[I[t]], twin[I[t + 2]], twin[I[t + 1]]);
  const n2 = P.length / 3, mirrorOf = new Int32Array(n2);
  for (let v = 0; v < nv; v++) { mirrorOf[v] = twin[v]; mirrorOf[twin[v]] = v; }
  return dropDegenerate({ pos: Float32Array.from(P), idx: Uint32Array.from(I), mirrorOf });
}

/** open boundary edges as vertex loops (arrays of vertex ids in order) */
export function boundaryLoops(mesh) {
  const { idx } = mesh, he = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; he.set(a + ',' + b, 1); }
  const next = new Map();
  for (const key of he.keys()) { const [a, b] = key.split(',').map(Number); if (!he.has(b + ',' + a)) next.set(a, b); }
  const loops = [], seen = new Set();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const loop = []; let v = s;
    while (v !== undefined && !seen.has(v)) { seen.add(v); loop.push(v); v = next.get(v); }
    loops.push(loop);
  }
  return loops;
}

/**
 * Split every edge longer than maxLen(midpoint) (longest first, a few passes). New vertices are placed by place(mid) (e.g.
 * projected onto the sculpt's surface). Returns { pos, idx, parents } — parents[v] = [a, b] for new vertices (else null).
 */
export function splitLongEdges(mesh, maxLen, place = (p) => p, passes = 4) {
  const P = Array.from(mesh.pos); let I = Array.from(mesh.idx); const parents = new Array(P.length / 3).fill(null);
  const len = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  for (let pass = 0; pass < passes; pass++) {
    const mids = new Map(); let any = false;
    const midOf = (a, b) => {
      const key = a < b ? a + ',' + b : b + ',' + a;
      if (mids.has(key)) return mids.get(key);
      const m = [(P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2];
      let id = -1;
      if (len(a, b) > maxLen(m)) { const q = place(m); id = P.length / 3; P.push(q[0], q[1], q[2]); parents.push([a, b]); any = true; }
      mids.set(key, id); return id;
    };
    const out = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const ab = midOf(a, b), bc = midOf(b, c), ca = midOf(c, a), n = (ab >= 0) + (bc >= 0) + (ca >= 0);
      if (n === 0) out.push(a, b, c);
      else if (n === 3) out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      else if (n === 1) { if (ab >= 0) out.push(a, ab, c, ab, b, c); else if (bc >= 0) out.push(a, b, bc, a, bc, c); else out.push(a, b, ca, ca, b, c); }
      else { // two split edges: fan from the corner they share, cut the quad along its shorter diagonal
        const [p, q, r, pq, rp] = ab < 0 ? [c, a, b, ca, bc] : bc < 0 ? [a, b, c, ab, ca] : [b, c, a, bc, ab];
        out.push(p, pq, rp);
        if (len(pq, r) <= len(q, rp)) out.push(pq, q, r, pq, r, rp); else out.push(pq, q, rp, q, r, rp);
      }
    }
    I = out;
    if (!any) break;
  }
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I), parents };
}

/** vertex neighbours (Sets) */
export function neighbours(mesh) {
  const nb = Array.from({ length: mesh.pos.length / 3 }, () => new Set());
  for (let t = 0; t < mesh.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = mesh.idx[t + k], b = mesh.idx[t + (k + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  return nb;
}
/** area-weighted vertex normals */
export function vertexNormals(pos, idx) {
  const N = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { N[v] += nx; N[v + 1] += ny; N[v + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
/** project a point onto a kit Shape's surface (Newton steps along the gradient) */
export function snap(shape, p, iters = 4) {
  const n = [0, 0, 0]; let [x, y, z] = p;
  for (let i = 0; i < iters; i++) { const d = shape.f(x, y, z); if (Math.abs(d) < 2e-6) break; shape.normal(x, y, z, n, 4e-4); x -= d * n[0]; y -= d * n[1]; z -= d * n[2]; }
  return [x, y, z];
}
export const bboxOf = (pos) => { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], pos[i + k]); b[k + 3] = Math.max(b[k + 3], pos[i + k]); } return b; };
