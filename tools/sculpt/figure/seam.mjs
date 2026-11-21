// Cutting and joining meshes exactly (figure work). A mesh is { pos: Float32Array, idx: Uint32Array }.
//   splitField  — insert vertices along the zero set of a scalar field and say on which side every triangle lies
//   clipField   — keep the positive side (eye openings, the mouth slit, material borders with a designed outline)
//   stitch      — join two pieces that were cut by the same plane at different resolutions (no T-junctions)
//   extrudeRim  — give an opening an inward wall (lid thickness, lip thickness)

/**
 * fn(x, y, z) -> scalar. Triangles crossing 0 are cut on the zero set (bisection along each edge when refine, so the
 * cut follows a curved outline exactly at the cut points). Returns { pos, idx, side (Int8 per triangle: 1 / -1),
 * src ([i, j, t] per vertex: on edge i-j at t; t = 0 for old vertices), cut (Uint8 per vertex: 1 = on the zero set) }.
 */
export function splitField(mesh, fn, { refine = 10, eps = 1e-7 } = {}) {
  const { pos, idx } = mesh, nv = pos.length / 3;
  const s = new Float64Array(nv);
  for (let v = 0; v < nv; v++) { let q = fn(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); if (Math.abs(q) < eps) q = eps; s[v] = q; }
  const P = Array.from(pos), src = Array.from({ length: nv }, (_, v) => [v, v, 0]), cutV = new Array(nv).fill(0), I = [], side = [], cuts = new Map();
  const cross = (a, b) => { // s[a] > 0 > s[b] or the reverse; canonical order a < b
    if (a > b) { const t = a; a = b; b = t; }
    const key = a * nv + b; let c = cuts.get(key);
    if (c !== undefined) return c;
    let t = s[a] / (s[a] - s[b]);
    if (refine) {
      let lo = 0, hi = 1; const sa = s[a] > 0;
      for (let it = 0; it < refine; it++) {
        const m = (lo + hi) / 2;
        const q = fn(pos[a * 3] + (pos[b * 3] - pos[a * 3]) * m, pos[a * 3 + 1] + (pos[b * 3 + 1] - pos[a * 3 + 1]) * m, pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * m);
        if ((q > 0) === sa) lo = m; else hi = m;
      }
      t = (lo + hi) / 2;
    }
    t = Math.max(0.02, Math.min(0.98, t));
    c = P.length / 3;
    P.push(pos[a * 3] + (pos[b * 3] - pos[a * 3]) * t, pos[a * 3 + 1] + (pos[b * 3 + 1] - pos[a * 3 + 1]) * t, pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * t);
    src.push([a, b, t]); cutV.push(1); cuts.set(key, c);
    return c;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]], pp = v.map((x) => s[x] > 0), cnt = pp[0] + pp[1] + pp[2];
    if (cnt === 3 || cnt === 0) { I.push(v[0], v[1], v[2]); side.push(cnt ? 1 : -1); continue; }
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3];
      const lone = cnt === 1 ? pp[k] : !pp[k];
      if (!lone) continue;
      // a is alone on its side: triangle (a, ab, ac) on a's side, quad (ab, b, c, ac) on the other
      const ab = cross(a, b), ac = cross(a, c), sa = pp[k] ? 1 : -1;
      I.push(a, ab, ac); side.push(sa);
      I.push(ab, b, c, ab, c, ac); side.push(-sa, -sa);
      break;
    }
  }
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I), side: Int8Array.from(side), src, cut: Uint8Array.from(cutV) };
}

/** keep fn >= 0. Returns { pos, idx, src, cut, map (old+cut vertex -> new index or -1) } */
export function clipField(mesh, fn, opts) {
  const sp = splitField(mesh, fn, opts);
  const I = []; for (let t = 0; t < sp.side.length; t++) if (sp.side[t] > 0) I.push(sp.idx[t * 3], sp.idx[t * 3 + 1], sp.idx[t * 3 + 2]);
  return compactMesh({ pos: sp.pos, idx: Uint32Array.from(I) }, { src: sp.src, cut: sp.cut });
}

/** drop unused vertices; `carry` = { name: per-vertex array (plain or typed, one entry per vertex) } */
export function compactMesh(mesh, carry = {}) {
  const nv = mesh.pos.length / 3, map = new Int32Array(nv).fill(-1); let n = 0;
  const I = [];
  for (let t = 0; t < mesh.idx.length; t += 3) { const a = mesh.idx[t], b = mesh.idx[t + 1], c = mesh.idx[t + 2]; if (a === b || b === c || a === c) continue; I.push(a, b, c); }
  for (const v of I) if (map[v] < 0) map[v] = n++;
  const pos = new Float32Array(n * 3);
  for (let v = 0; v < nv; v++) if (map[v] >= 0) pos.set(mesh.pos.subarray(v * 3, v * 3 + 3), map[v] * 3);
  const out = { pos, idx: Uint32Array.from(I, (v) => map[v]), map };
  for (const k in carry) { const a = carry[k], o = Array.isArray(a) ? new Array(n) : new a.constructor(n); for (let v = 0; v < nv; v++) if (map[v] >= 0) o[map[v]] = a[v]; out[k] = o; }
  return out;
}

/** boundary half-edges: Map a -> b for edges a->b without an opposite */
export function boundaryNext(idx) {
  const he = new Set();
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) he.add(idx[t + k] + ',' + idx[t + (k + 1) % 3]);
  const next = new Map();
  for (const key of he) { const [a, b] = key.split(',').map(Number); if (!he.has(b + ',' + a)) next.set(a, b); }
  return next;
}

/**
 * Join piece B (coarse) to piece A (fine) along a seam both were cut on: onSeam(x, y, z) -> true for seam points.
 * Every seam vertex of B is welded to its nearest seam vertex of A; A's seam vertices in between split B's border
 * triangles as fans. Returns the joined mesh { pos, idx, nA (A's vertices come first, unchanged), mapB }.
 */
export function stitch(A, B, onSeam) {
  const nA = A.pos.length / 3, nB = B.pos.length / 3;
  const nxA = boundaryNext(A.idx), nxB = boundaryNext(B.idx);
  const is = (m, v) => onSeam(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]);
  // A's seam chain(s): boundary edges with both ends on the seam; order along the chain via prev/next
  const aNext = new Map(), aPrev = new Map();
  for (const [a, b] of nxA) if (is(A, a) && is(A, b)) { aNext.set(a, b); aPrev.set(b, a); }
  const sa = [...new Set([...aNext.keys(), ...aNext.values()])];
  if (!sa.length) throw new Error('stitch: piece A has no seam');
  const nearestA = (x, y, z) => { let best = -1, bd = 1e9; for (const a of sa) { const d = (A.pos[a * 3] - x) ** 2 + (A.pos[a * 3 + 1] - y) ** 2 + (A.pos[a * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = a; } } return best; };
  const mapB = new Int32Array(nB);
  for (let v = 0; v < nB; v++) mapB[v] = nA + v;
  const seamB = new Set();
  for (const [a, b] of nxB) if (is(B, a) && is(B, b)) { seamB.add(a); seamB.add(b); }
  for (const b of seamB) mapB[b] = nearestA(B.pos[b * 3], B.pos[b * 3 + 1], B.pos[b * 3 + 2]);
  const pos = new Float32Array((nA + nB) * 3); pos.set(A.pos); pos.set(B.pos, nA * 3);
  const I = Array.from(A.idx);
  // path on A's seam from p to q (either direction along the chain, the shorter one)
  const path = (p, q) => {
    for (const step of [aNext, aPrev]) {
      const out = [p]; let v = p;
      for (let i = 0; i < 400 && v !== q; i++) { v = step.get(v); if (v === undefined) break; out.push(v); }
      if (v === q) { if (!path.best || out.length < path.best.length) path.best = out; }
    }
    const r = path.best; path.best = null; return r;
  };
  for (let t = 0; t < B.idx.length; t += 3) {
    const v = [B.idx[t], B.idx[t + 1], B.idx[t + 2]];
    let done = false;
    for (let k = 0; k < 3 && !done; k++) {
      const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3];
      if (nxB.get(a) !== b || !seamB.has(a) || !seamB.has(b)) continue;
      const p = mapB[a], q = mapB[b], cc = mapB[c];
      if (p === q) { done = true; break; }                     // collapsed border edge: the triangle vanishes
      const chain = path(p, q);
      if (!chain) { I.push(p, q, cc); done = true; break; }
      for (let i = 0; i + 1 < chain.length; i++) I.push(chain[i], chain[i + 1], cc);
      done = true;
    }
    if (!done) I.push(mapB[v[0]], mapB[v[1]], mapB[v[2]]);
  }
  const m = compactMesh({ pos, idx: Uint32Array.from(I) });
  return { pos: m.pos, idx: m.idx };
}

/**
 * An inward wall along the open boundary edges selected by pick(a, b) (both vertex ids): each boundary vertex gets a
 * copy moved by offset(v) -> [dx, dy, dz]; quads join the edge to its copy. Returns { pos, idx, rimOf (new vertex ->
 * the boundary vertex it was copied from; -1 for old ones) }.
 */
export function extrudeRim(mesh, pick, offset) {
  const nx = boundaryNext(mesh.idx), P = Array.from(mesh.pos), I = Array.from(mesh.idx), copy = new Map(), rimOf = new Array(mesh.pos.length / 3).fill(-1);
  const cp = (v) => { let c = copy.get(v); if (c === undefined) { const o = offset(v); c = P.length / 3; P.push(mesh.pos[v * 3] + o[0], mesh.pos[v * 3 + 1] + o[1], mesh.pos[v * 3 + 2] + o[2]); copy.set(v, c); rimOf.push(v); } return c; };
  for (const [a, b] of nx) { if (!pick(a, b)) continue; const a2 = cp(a), b2 = cp(b); I.push(b, a, a2, b, a2, b2); }
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I), rimOf: Int32Array.from(rimOf) };
}
