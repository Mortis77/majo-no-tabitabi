// Field -> mesh. Sparse dual contouring with a QEF per cell (sharp where the sculptor cut, smooth elsewhere), narrow-band
// bricks evaluated in parallel; a quadric-error simplifier that guards silhouettes, hard edges and material borders; normals
// split by angle; mesh checks (watertight, flipped faces).

// ------------------------------------------------------------------------------------------------ dual contouring brick
const EDGES = [ // corner pairs of a cell (corner bit = x | y<<1 | z<<2)
  [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

export function dcBrick(shape, o, h, i0, j0, k0, B, dims) {
  const f = shape.f, B1 = B + 1, V = new Float64Array(B1 * B1 * B1);
  let neg = 0;
  for (let c = 0; c <= B; c++) for (let b = 0; b <= B; b++) for (let a = 0; a <= B; a++) {
    const v = f(o[0] + (i0 + a) * h, o[1] + (j0 + b) * h, o[2] + (k0 + c) * h);
    V[a + b * B1 + c * B1 * B1] = v; if (v < 0) neg++;
  }
  const empty = { nc: 0, ne: 0, cellKey: new Float64Array(0), cellPos: new Float32Array(0), edgeKey: new Float64Array(0), edgeInfo: new Int8Array(0) };
  if (neg === 0 || neg === V.length) return empty;
  const [NX, NY] = dims, CX = NX + 1, CY = NY + 1;
  const cellKey = [], cellPos = [], edgeKey = [], edgeInfo = [];
  const cv = new Float64Array(8), n = [0, 0, 0];
  for (let c = 0; c < B; c++) for (let b = 0; b < B; b++) for (let a = 0; a < B; a++) {
    let mask = 0;
    for (let k = 0; k < 8; k++) { const v = V[(a + (k & 1)) + (b + ((k >> 1) & 1)) * B1 + (c + ((k >> 2) & 1)) * B1 * B1]; cv[k] = v; if (v < 0) mask |= 1 << k; }
    // edges owned by this corner (a,b,c): +x, +y, +z
    const v0 = cv[0];
    for (let ax = 0; ax < 3; ax++) {
      const v1 = cv[1 << ax];
      if ((v0 < 0) !== (v1 < 0)) { edgeKey.push((i0 + a) + (j0 + b) * CX + (k0 + c) * CX * CY); edgeInfo.push((ax << 1) | (v0 < 0 ? 1 : 0)); }
    }
    if (mask === 0 || mask === 255) continue;
    // QEF from the crossings
    let a00 = 0, a01 = 0, a02 = 0, a11 = 0, a12 = 0, a22 = 0, b0 = 0, b1 = 0, b2 = 0, mx = 0, my = 0, mz = 0, cnt = 0;
    const cx0 = o[0] + (i0 + a) * h, cy0 = o[1] + (j0 + b) * h, cz0 = o[2] + (k0 + c) * h;
    for (const [p, q] of EDGES) {
      const vp = cv[p], vq = cv[q];
      if ((vp < 0) === (vq < 0)) continue;
      const t = vp / (vp - vq);
      let x = cx0 + ((p & 1) + ((q & 1) - (p & 1)) * t) * h, y = cy0 + (((p >> 1) & 1) + (((q >> 1) & 1) - ((p >> 1) & 1)) * t) * h, z = cz0 + (((p >> 2) & 1) + (((q >> 2) & 1) - ((p >> 2) & 1)) * t) * h;
      // one projection step onto the true surface (fields are not linear across a cell)
      shape.normal(x, y, z, n, h * 0.1);
      const d = f(x, y, z);
      if (Math.abs(d) < h) { x -= d * n[0]; y -= d * n[1]; z -= d * n[2]; }
      const nx = n[0], ny = n[1], nz = n[2], dp = nx * x + ny * y + nz * z;
      a00 += nx * nx; a01 += nx * ny; a02 += nx * nz; a11 += ny * ny; a12 += ny * nz; a22 += nz * nz;
      b0 += nx * dp; b1 += ny * dp; b2 += nz * dp;
      mx += x; my += y; mz += z; cnt++;
    }
    mx /= cnt; my /= cnt; mz /= cnt;
    // x = m + pinv(A) (b - A m)
    const r0 = b0 - (a00 * mx + a01 * my + a02 * mz), r1 = b1 - (a01 * mx + a11 * my + a12 * mz), r2 = b2 - (a02 * mx + a12 * my + a22 * mz);
    const sol = pinvSolve(a00, a01, a02, a11, a12, a22, r0, r1, r2);
    let px = mx + sol[0], py = my + sol[1], pz = mz + sol[2];
    const m = 0.6 * h;
    if (px < cx0 - m || px > cx0 + h + m || py < cy0 - m || py > cy0 + h + m || pz < cz0 - m || pz > cz0 + h + m) { px = mx; py = my; pz = mz; }
    cellKey.push((i0 + a) + (j0 + b) * NX + (k0 + c) * NX * NY);
    cellPos.push(px, py, pz);
  }
  return { nc: cellKey.length, ne: edgeKey.length, cellKey: Float64Array.from(cellKey), cellPos: Float32Array.from(cellPos), edgeKey: Float64Array.from(edgeKey), edgeInfo: Int8Array.from(edgeInfo) };
}

// symmetric 3x3 pseudo-inverse solve via Jacobi eigen decomposition (small eigenvalues truncated)
function pinvSolve(a00, a01, a02, a11, a12, a22, r0, r1, r2) {
  const A = [[a00, a01, a02], [a01, a11, a12], [a02, a12, a22]];
  const Vv = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 6; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(A[p][q]) < 1e-12) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = Vv[k][p], vkq = Vv[k][q]; Vv[k][p] = c * vkp - s * vkq; Vv[k][q] = s * vkp + c * vkq; }
    }
  }
  const ev = [A[0][0], A[1][1], A[2][2]], emax = Math.max(...ev.map(Math.abs));
  const out = [0, 0, 0], r = [r0, r1, r2];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ev[i]) < emax * 0.1 || emax === 0) continue;
    const proj = (Vv[0][i] * r[0] + Vv[1][i] * r[1] + Vv[2][i] * r[2]) / ev[i];
    out[0] += Vv[0][i] * proj; out[1] += Vv[1][i] * proj; out[2] += Vv[2][i] * proj;
  }
  return out;
}

// --------------------------------------------------------------------------------------------------- extraction (main)
/** Extract the surface of model M (main thread) with the pool. Returns { pos: Float32Array, idx: Uint32Array, stats } */
export async function extract(M, pool, h = M.cfg.voxel, log = () => {}) {
  const t0 = Date.now();
  const b = M.bounds, pad = 3 * h, B = 8;
  const o = [b[0] - pad, b[1] - pad, b[2] - pad];
  const dims = [Math.ceil((b[3] - b[0] + 2 * pad) / h), Math.ceil((b[4] - b[1] + 2 * pad) / h), Math.ceil((b[5] - b[2] + 2 * pad) / h)];
  dims[0] = Math.ceil(dims[0] / B) * B; dims[1] = Math.ceil(dims[1] / B) * B; dims[2] = Math.ceil(dims[2] / B) * B;
  const nb = dims.map((d) => d / B);
  // narrow band: a brick whose centre is farther from the surface than its half-diagonal (times the safety) is skipped
  const half = Math.sqrt(3) * B * h / 2, safety = M.cfg.bandSafety, slack = M.cfg.bandSlack ?? 0.03;
  const keep = [];
  for (let k = 0; k < nb[2]; k++) for (let j = 0; j < nb[1]; j++) for (let i = 0; i < nb[0]; i++) {
    const d = M.shape.f(o[0] + (i + 0.5) * B * h, o[1] + (j + 0.5) * B * h, o[2] + (k + 0.5) * B * h);
    if (Math.abs(d) <= half * safety + slack + h) keep.push(i * B, j * B, k * B);
  }
  const total = nb[0] * nb[1] * nb[2], nk = keep.length / 3;
  log(`  grid ${dims.join('x')} @ ${(h * 1000).toFixed(1)} mm: ${nk}/${total} bricks in the band`);
  // chunks
  const per = Math.max(4, Math.ceil(nk / (pool.size * 12)));
  const chunks = [];
  for (let i = 0; i < nk; i += per) chunks.push({ list: Int32Array.from(keep.slice(i * 3, (i + per) * 3)), B, h, o, dims });
  const res = await pool.map('bricks', chunks);
  // assemble: cell -> vertex
  const cellIndex = new Map();
  let nv = 0; for (const r of res) nv += r.cellKey.length;
  const pos = new Float32Array(nv * 3);
  let v = 0;
  for (const r of res) for (let i = 0; i < r.cellKey.length; i++) { cellIndex.set(r.cellKey[i], v); pos.set(r.cellPos.subarray(i * 3, i * 3 + 3), v * 3); v++; }
  const [NX, NY] = dims, CX = NX + 1, CY = NY + 1;
  const idx = [];
  let missing = 0;
  const cell = (i, j, k) => cellIndex.get(i + j * NX + k * NX * NY);
  for (const r of res) for (let e = 0; e < r.edgeKey.length; e++) {
    const key = r.edgeKey[e], info = r.edgeInfo[e], ax = info >> 1, inside = info & 1;
    const i = key % CX, j = Math.floor(key / CX) % CY, k = Math.floor(key / (CX * CY));
    let q;
    if (ax === 0) q = [cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k)];
    else if (ax === 1) q = [cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1)];
    else q = [cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k)];
    if (q.some((x) => x === undefined)) { missing++; continue; }
    if (!inside) q.reverse();
    // split along the shorter diagonal
    const d02 = dist2(pos, q[0], q[2]), d13 = dist2(pos, q[1], q[3]);
    if (d02 <= d13) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); else idx.push(q[0], q[1], q[3], q[1], q[2], q[3]);
  }
  const c0 = cleanup(pos, Uint32Array.from(idx));
  const out = makeManifold(c0.pos, c0.idx);
  log(`  dual contouring: ${out.idx.length / 3} tris, ${out.pos.length / 3} verts (${missing} open quads, ${out.fixedEdges} non-manifold edges paired, ${out.splitVerts} fan vertices split) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return { ...out, stats: { dims, h, bricks: nk, missing, ms: Date.now() - t0 } };
}
function dist2(p, a, b) { const x = p[a * 3] - p[b * 3], y = p[a * 3 + 1] - p[b * 3 + 1], z = p[a * 3 + 2] - p[b * 3 + 2]; return x * x + y * y + z * z; }

/** drop degenerate triangles (repeated vertices) and unused vertices */
export function cleanup(pos, idx) {
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if (a !== b && b !== c && a !== c) keep.push(a, b, c); }
  const remap = new Int32Array(pos.length / 3).fill(-1); let n = 0;
  for (const v of keep) if (remap[v] < 0) remap[v] = n++;
  const P = new Float32Array(n * 3);
  for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) P.set(pos.subarray(v * 3, v * 3 + 3), remap[v] * 3);
  return { pos: P, idx: Uint32Array.from(keep, (v) => remap[v]) };
}

// --------------------------------------------------------------------------------------------------------- simplifier
/**
 * Quadric-error edge collapse to `target` triangles. faceTag (optional Int16Array, one per triangle) marks material
 * borders, which are guarded like hard edges. Returns { pos, idx, tag }.
 */
export function simplify(pos0, idx0, target, { faceTag = null, hardAngle = 50, guard = 8, maxNormalTurn = 0.35, maxError = Infinity } = {}) {
  const nv = pos0.length / 3, nf = idx0.length / 3;
  if (nf <= target) return { pos: pos0, idx: idx0, tag: faceTag };
  const P = Float64Array.from(pos0), F = Int32Array.from(idx0), alive = new Uint8Array(nf).fill(1);
  const Q = new Float64Array(nv * 10), QS = new Float64Array(nv * 10), QA = new Float64Array(nv), stamp = new Int32Array(nv), dead = new Uint8Array(nv);
  const vf = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) vf[F[f * 3 + k]].push(f);
  const fnrm = (f, out) => {
    const a = F[f * 3] * 3, b = F[f * 3 + 1] * 3, c = F[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx; return out;
  };
  const addPlane = (v, a, b, c, d, w, surf = false) => {
    if (surf) { const s2 = v * 10; QS[s2] += w * a * a; QS[s2 + 1] += w * a * b; QS[s2 + 2] += w * a * c; QS[s2 + 3] += w * a * d; QS[s2 + 4] += w * b * b; QS[s2 + 5] += w * b * c; QS[s2 + 6] += w * b * d; QS[s2 + 7] += w * c * c; QS[s2 + 8] += w * c * d; QS[s2 + 9] += w * d * d; }
    const q = v * 10;
    Q[q] += w * a * a; Q[q + 1] += w * a * b; Q[q + 2] += w * a * c; Q[q + 3] += w * a * d; Q[q + 4] += w * b * b;
    Q[q + 5] += w * b * c; Q[q + 6] += w * b * d; Q[q + 7] += w * c * c; Q[q + 8] += w * c * d; Q[q + 9] += w * d * d;
  };
  const n = [0, 0, 0];
  for (let f = 0; f < nf; f++) {
    fnrm(f, n); const l = Math.hypot(n[0], n[1], n[2]); if (l < 1e-20) continue;
    const a = n[0] / l, b = n[1] / l, c = n[2] / l, v0 = F[f * 3], d = -(a * P[v0 * 3] + b * P[v0 * 3 + 1] + c * P[v0 * 3 + 2]);
    for (let k = 0; k < 3; k++) { addPlane(F[f * 3 + k], a, b, c, d, l * 0.5, true); QA[F[f * 3 + k]] += l * 0.5; }
  }
  // guard planes along hard edges, material borders and open borders
  const cosHard = Math.cos(hardAngle * Math.PI / 180);
  const edgeFaces = new Map();
  const ek = (a, b) => (a < b ? a * nv + b : b * nv + a);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) {
    const a = F[f * 3 + k], b = F[f * 3 + (k + 1) % 3], key = ek(a, b);
    const e = edgeFaces.get(key); if (e) e.push(f); else edgeFaces.set(key, [f]);
  }
  const n2 = [0, 0, 0];
  for (const [key, fs] of edgeFaces) {
    const a = Math.floor(key / nv), b = key % nv;
    let hard = fs.length !== 2;
    if (!hard) {
      fnrm(fs[0], n); fnrm(fs[1], n2);
      const l1 = Math.hypot(...n), l2 = Math.hypot(...n2);
      if (l1 > 0 && l2 > 0 && (n[0] * n2[0] + n[1] * n2[1] + n[2] * n2[2]) / (l1 * l2) < cosHard) hard = true;
      if (faceTag && faceTag[fs[0]] !== faceTag[fs[1]]) hard = true;
    }
    if (!hard) continue;
    for (const f of fs) {
      fnrm(f, n);
      const ex = P[b * 3] - P[a * 3], ey = P[b * 3 + 1] - P[a * 3 + 1], ez = P[b * 3 + 2] - P[a * 3 + 2];
      let px = ey * n[2] - ez * n[1], py = ez * n[0] - ex * n[2], pz = ex * n[1] - ey * n[0];
      const l = Math.hypot(px, py, pz); if (l < 1e-20) continue; px /= l; py /= l; pz /= l;
      const d = -(px * P[a * 3] + py * P[a * 3 + 1] + pz * P[a * 3 + 2]), w = guard * (ex * ex + ey * ey + ez * ez);
      addPlane(a, px, py, pz, d, w); addPlane(b, px, py, pz, d, w);
    }
  }
  edgeFaces.clear();
  // heap of candidate collapses
  let hc = new Float64Array(1 << 16), ha = new Int32Array(1 << 16), hb = new Int32Array(1 << 16), hsa = new Int32Array(1 << 16), hsb = new Int32Array(1 << 16), hn = 0;
  const grow = () => {
    const m = hc.length * 2;
    const g = (A, T) => { const B = new T(m); B.set(A); return B; };
    hc = g(hc, Float64Array); ha = g(ha, Int32Array); hb = g(hb, Int32Array); hsa = g(hsa, Int32Array); hsb = g(hsb, Int32Array);
  };
  const swap = (i, j) => {
    let t = hc[i]; hc[i] = hc[j]; hc[j] = t; t = ha[i]; ha[i] = ha[j]; ha[j] = t; t = hb[i]; hb[i] = hb[j]; hb[j] = t;
    t = hsa[i]; hsa[i] = hsa[j]; hsa[j] = t; t = hsb[i]; hsb[i] = hsb[j]; hsb[j] = t;
  };
  const opt = new Float64Array(3);
  const cost = (a, b) => {
    const q = new Float64Array(10);
    for (let k = 0; k < 10; k++) q[k] = Q[a * 10 + k] + Q[b * 10 + k];
    const [A, B, C, D, E, Fq, G, H, I, J] = q;
    // solve [A B C; B E F; C F H] x = -[D G I]
    const det = A * (E * H - Fq * Fq) - B * (B * H - Fq * C) + C * (B * Fq - E * C);
    const ev = (x, y, z) => A * x * x + 2 * B * x * y + 2 * C * x * z + 2 * D * x + E * y * y + 2 * Fq * y * z + 2 * G * y + H * z * z + 2 * I * z + J;
    let best = Infinity;
    const mid = [(P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2];
    if (Math.abs(det) > 1e-14) {
      const x = -(D * (E * H - Fq * Fq) - B * (G * H - Fq * I) + C * (G * Fq - E * I)) / det;
      const y = -(A * (G * H - I * Fq) - D * (B * H - Fq * C) + C * (B * I - G * C)) / det;
      const z = -(A * (E * I - Fq * G) - B * (B * I - G * C) + D * (B * Fq - E * C)) / det;
      // stay near the edge (a far optimum means a near-degenerate quadric)
      const el = Math.sqrt(dist2d(P, a, b));
      if (Math.hypot(x - mid[0], y - mid[1], z - mid[2]) < el * 2) { best = ev(x, y, z); opt[0] = x; opt[1] = y; opt[2] = z; }
    }
    for (const c of [[P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], mid]) {
      const e = ev(c[0], c[1], c[2]); if (e < best) { best = e; opt[0] = c[0]; opt[1] = c[1]; opt[2] = c[2]; }
    }
    return Math.max(best, 0);
  };
  const push = (a, b) => {
    if (hn >= hc.length) grow();
    let i = hn++;
    hc[i] = cost(a, b); ha[i] = a; hb[i] = b; hsa[i] = stamp[a]; hsb[i] = stamp[b];
    while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= hc[i]) break; swap(i, p); i = p; }
  };
  const pop = () => {
    hn--; swap(0, hn);
    let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hn && hc[l] < hc[m]) m = l; if (r < hn && hc[r] < hc[m]) m = r; if (m === i) break; swap(i, m); i = m; }
    return hn;
  };
  const seed = () => {
    hn = 0;
    const seen = new Set();
    for (let f = 0; f < nf; f++) if (alive[f]) for (let k = 0; k < 3; k++) {
      const a = F[f * 3 + k], b = F[f * 3 + (k + 1) % 3], key = ek(a, b);
      if (seen.has(key)) continue; seen.add(key); push(Math.min(a, b), Math.max(a, b));
    }
  };
  let faces = nf;
  const rej = { link: 0, flip: 0 };
  let stopped = false;
  const nbrs = (v, out) => { out.clear(); for (const f of vf[v]) if (alive[f]) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== v) out.add(w); } return out; };
  const Na = new Set(), Nb = new Set(), m0 = [0, 0, 0], m1 = [0, 0, 0];
  // rounds: reseed when collapses run out above the target (rejected edges are not re-queued otherwise), relax a little
  // (allowing faces to turn past ~80 deg wrecked a lantern LOD2 into a twisted spike: never relax that far)
  for (const cosTurn of [maxNormalTurn, maxNormalTurn, Math.min(maxNormalTurn, 0.2)]) {
  if (faces <= target) break;
  seed();
  while (faces > target && hn > 0) {
    const i = pop();
    const a = ha[i], b = hb[i];
    if (dead[a] || dead[b] || hsa[i] !== stamp[a] || hsb[i] !== stamp[b]) continue;
    cost(a, b);
    // stop at the error limit: area-weighted RMS distance of the merged surface planes to the new point
    if (maxError < Infinity) {
      const x = opt[0], y = opt[1], z = opt[2];
      let e = 0;
      for (const v of [a, b]) { const q = v * 10; e += QS[q] * x * x + 2 * QS[q + 1] * x * y + 2 * QS[q + 2] * x * z + 2 * QS[q + 3] * x + QS[q + 4] * y * y + 2 * QS[q + 5] * y * z + 2 * QS[q + 6] * y + QS[q + 7] * z * z + 2 * QS[q + 8] * z + QS[q + 9]; }
      if (Math.sqrt(Math.max(0, e) / (QA[a] + QA[b] + 1e-12)) > maxError) { stopped = true; rej.err = (rej.err || 0) + 1; continue; } // refuse, keep going
    }
    const px = opt[0], py = opt[1], pz = opt[2];
    // link condition: shared neighbours = shared faces
    nbrs(a, Na); nbrs(b, Nb);
    let common = 0; for (const w of Na) if (Nb.has(w)) common++;
    let shared = 0; for (const f of vf[a]) if (alive[f] && (F[f * 3] === b || F[f * 3 + 1] === b || F[f * 3 + 2] === b)) shared++;
    if (common !== shared || shared === 0) { rej.link++; continue; }
    // no flipped or collapsed faces
    let ok = true;
    for (const v of [a, b]) {
      for (const f of vf[v]) {
        if (!alive[f]) continue;
        const ia = F[f * 3], ib = F[f * 3 + 1], ic = F[f * 3 + 2];
        if ((ia === a || ib === a || ic === a) && (ia === b || ib === b || ic === b)) continue;
        fnrm(f, m0);
        const sx = P[v * 3], sy = P[v * 3 + 1], sz = P[v * 3 + 2];
        P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz;
        fnrm(f, m1);
        P[v * 3] = sx; P[v * 3 + 1] = sy; P[v * 3 + 2] = sz;
        const l0 = Math.hypot(...m0), l1 = Math.hypot(...m1);
        if (l1 < l0 * 0.02 || (m0[0] * m1[0] + m0[1] * m1[1] + m0[2] * m1[2]) < cosTurn * l0 * l1) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) { rej.flip++; continue; }
    // collapse b into a
    for (const f of vf[b]) {
      if (!alive[f]) continue;
      const has = F[f * 3] === a || F[f * 3 + 1] === a || F[f * 3 + 2] === a;
      if (has) { alive[f] = 0; faces--; continue; }
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === b) F[f * 3 + k] = a;
      vf[a].push(f);
    }
    vf[a] = vf[a].filter((f) => alive[f]);
    vf[b] = [];
    dead[b] = 1;
    P[a * 3] = px; P[a * 3 + 1] = py; P[a * 3 + 2] = pz;
    for (let k = 0; k < 10; k++) Q[a * 10 + k] += Q[b * 10 + k];
    QA[a] += QA[b];
    for (let k = 0; k < 10; k++) QS[a * 10 + k] += QS[b * 10 + k];
    stamp[a]++;
    nbrs(a, Na);
    for (const w of Na) push(Math.min(a, w), Math.max(a, w));
  }
  }
  // compact
  const keep = [], tags = [];
  for (let f = 0; f < nf; f++) if (alive[f]) { keep.push(F[f * 3], F[f * 3 + 1], F[f * 3 + 2]); if (faceTag) tags.push(faceTag[f]); }
  const out = cleanupTagged(P, keep, tags);
  return { pos: out.pos, idx: out.idx, tag: faceTag ? Int16Array.from(out.tags) : null, rejected: rej, stoppedAtError: stopped };
}
function dist2d(P, a, b) { const x = P[a * 3] - P[b * 3], y = P[a * 3 + 1] - P[b * 3 + 1], z = P[a * 3 + 2] - P[b * 3 + 2]; return x * x + y * y + z * z; }
function cleanupTagged(P, keep, tags) {
  const nv = P.length / 3, remap = new Int32Array(nv).fill(-1); let n = 0;
  const k2 = [], t2 = [];
  for (let t = 0; t < keep.length; t += 3) {
    const a = keep[t], b = keep[t + 1], c = keep[t + 2]; if (a === b || b === c || a === c) continue;
    k2.push(a, b, c); t2.push(tags[t / 3]);
  }
  for (const v of k2) if (remap[v] < 0) remap[v] = n++;
  const pos = new Float32Array(n * 3);
  for (let v = 0; v < nv; v++) if (remap[v] >= 0) { pos[remap[v] * 3] = P[v * 3]; pos[remap[v] * 3 + 1] = P[v * 3 + 1]; pos[remap[v] * 3 + 2] = P[v * 3 + 2]; }
  return { pos, idx: Uint32Array.from(k2, (v) => remap[v]), tags: t2 };
}

// ---------------------------------------------------------------------------------------------------------- normals
/**
 * Split vertices where faces meet at more than `angle` degrees (hard), smooth elsewhere (area weighted).
 * Also splits along `faceTag` borders when splitTags. Returns { pos, nrm, idx, src (original vertex per new vertex), tag }
 */
export function splitNormals(pos, idx, angle = 40, { faceTag = null, splitTags = true } = {}) {
  const nv = pos.length / 3, nf = idx.length / 3;
  const fn = new Float32Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    fn[f * 3] = uy * vz - uz * vy; fn[f * 3 + 1] = uz * vx - ux * vz; fn[f * 3 + 2] = ux * vy - uy * vx; // area weighted
  }
  const vf = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) vf[idx[f * 3 + k]].push(f);
  const cosA = Math.cos(angle * Math.PI / 180);
  const unit = (f) => { const l = Math.hypot(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]) || 1; return [fn[f * 3] / l, fn[f * 3 + 1] / l, fn[f * 3 + 2] / l]; };
  const P = [], N = [], src = [], cornerV = new Int32Array(nf * 3);
  for (let v = 0; v < nv; v++) {
    const fs = vf[v];
    const groups = []; // { n:[..], rep: unit normal of the first face, tag }
    for (const f of fs) {
      const u = unit(f), t = faceTag ? faceTag[f] : 0;
      // smooth normal for this corner: all faces around v within the angle of THIS face
      let sx = 0, sy = 0, sz = 0;
      for (const g of fs) {
        if (splitTags && faceTag && faceTag[g] !== t) continue;
        const w = unit(g);
        if (u[0] * w[0] + u[1] * w[1] + u[2] * w[2] >= cosA) { sx += fn[g * 3]; sy += fn[g * 3 + 1]; sz += fn[g * 3 + 2]; }
      }
      const l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
      let gi = groups.findIndex((g) => g.t === t && g.n[0] * sx + g.n[1] * sy + g.n[2] * sz > 0.9999);
      if (gi < 0) { gi = groups.length; groups.push({ n: [sx, sy, sz], t, id: P.length / 3 }); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); N.push(sx, sy, sz); src.push(v); }
      const k = idx[f * 3] === v ? 0 : idx[f * 3 + 1] === v ? 1 : 2;
      cornerV[f * 3 + k] = groups[gi].id;
    }
  }
  return { pos: Float32Array.from(P), nrm: Float32Array.from(N), idx: Uint32Array.from(cornerV), src: Int32Array.from(src), tag: faceTag };
}

// ------------------------------------------------------------------------------------------------------------ checks
/** watertightness (edges not shared by exactly two faces), inconsistent winding, bounds, signed volume */
export function checkMesh(pos, idx) {
  const nv = pos.length / 3, dir = new Map();
  let open = 0, nonManifold = 0, badWinding = 0;
  for (let f = 0; f < idx.length; f += 3) for (let k = 0; k < 3; k++) {
    const a = idx[f + k], b = idx[f + (k + 1) % 3], key = a * nv + b;
    dir.set(key, (dir.get(key) || 0) + 1);
  }
  const seen = new Set();
  for (const [key, c] of dir) {
    const a = Math.floor(key / nv), b = key % nv, rk = b * nv + a;
    const u = Math.min(key, rk); if (seen.has(u)) continue; seen.add(u);
    const r = dir.get(rk) || 0;
    if (c === 1 && r === 0) open++; else if (c + r > 2) nonManifold++; else if (c === 2 || r === 2) badWinding++;
  }
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], pos[v * 3 + k]); b[k + 3] = Math.max(b[k + 3], pos[v * 3 + k]); }
  let vol = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3, c = idx[f + 1] * 3, d = idx[f + 2] * 3;
    vol += (pos[a] * (pos[c + 1] * pos[d + 2] - pos[c + 2] * pos[d + 1]) - pos[a + 1] * (pos[c] * pos[d + 2] - pos[c + 2] * pos[d]) + pos[a + 2] * (pos[c] * pos[d + 1] - pos[c + 1] * pos[d])) / 6;
  }
  return { tris: idx.length / 3, verts: nv, openEdges: open, nonManifoldEdges: nonManifold, badWindingEdges: badWinding, watertight: open === 0 && nonManifold === 0, bounds: b.map((v) => +v.toFixed(4)), volume: +vol.toFixed(5) };
}

export function faceData(pos, idx) {
  const nf = idx.length / 3, cent = new Float32Array(nf * 3), fn = new Float32Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    for (let k = 0; k < 3; k++) cent[f * 3 + k] = (pos[a + k] + pos[b + k] + pos[c + k]) / 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    fn[f * 3] = nx / l; fn[f * 3 + 1] = ny / l; fn[f * 3 + 2] = nz / l;
  }
  return { cent, fn };
}

// ---------------------------------------------------------------------------------------------------- manifold repair
/**
 * Dual contouring puts one vertex per cell, so where two sheets pass through one cell (thin walls, cracks, touching
 * parts) edges get 4 faces and vertices join two fans. Pair the faces around such edges by angle (opposite windings),
 * then give every fan around a vertex its own vertex copy. Result: manifold (coincident vertices may remain).
 */
export function makeManifold(pos, idx) {
  const nf = idx.length / 3, nv = pos.length / 3;
  const em = new Map();
  const key = (a, b) => (a < b ? a * nv + b : b * nv + a);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) {
    const a = idx[f * 3 + k], b = idx[f * 3 + (k + 1) % 3], kk = key(a, b);
    let e = em.get(kk); if (!e) em.set(kk, (e = [])); e.push(f, a < b ? 1 : 0, idx[f * 3 + (k + 2) % 3]);
  }
  // adjacency: face -> list of [neighbour face] through paired edges
  const adj = Array.from({ length: nf }, () => []);
  let fixed = 0;
  for (const [kk, e] of em) {
    const n = e.length / 3;
    if (n === 2) { adj[e[0]].push(e[3]); adj[e[3]].push(e[0]); continue; }
    if (n < 2) continue;
    fixed++;
    const a = Math.floor(kk / nv), b = kk % nv;
    const ax = pos[b * 3] - pos[a * 3], ay = pos[b * 3 + 1] - pos[a * 3 + 1], az = pos[b * 3 + 2] - pos[a * 3 + 2], al = Math.hypot(ax, ay, az) || 1;
    const u = [ax / al, ay / al, az / al];
    const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let t1 = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]]; const tl = Math.hypot(...t1); t1 = t1.map((v) => v / tl);
    const t2 = [u[1] * t1[2] - u[2] * t1[1], u[2] * t1[0] - u[0] * t1[2], u[0] * t1[1] - u[1] * t1[0]];
    const items = [];
    for (let i = 0; i < n; i++) {
      const f = e[i * 3], dir = e[i * 3 + 1], c = e[i * 3 + 2];
      const px = pos[c * 3] - pos[a * 3], py = pos[c * 3 + 1] - pos[a * 3 + 1], pz = pos[c * 3 + 2] - pos[a * 3 + 2];
      items.push({ f, dir, ang: Math.atan2(px * t2[0] + py * t2[1] + pz * t2[2], px * t1[0] + py * t1[1] + pz * t1[2]) });
    }
    items.sort((p, q) => p.ang - q.ang);
    // walk around the edge: neighbours in angle with opposite windings bound one solid wedge -> pair them
    const used = new Set();
    for (let s = 0; s < 2 && used.size < n; s++) for (let i = 0; i < n; i++) {
      const p = items[(i + s) % n], q = items[(i + s + 1) % n];
      if (used.has(p.f) || used.has(q.f) || p.dir === q.dir) continue;
      used.add(p.f); used.add(q.f); adj[p.f].push(q.f); adj[q.f].push(p.f);
    }
  }
  // split vertices per fan
  const vf = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) vf[idx[f * 3 + k]].push(f);
  const out = Uint32Array.from(idx), P = Array.from(pos);
  let split = 0;
  for (let v = 0; v < nv; v++) {
    const fs = vf[v]; if (fs.length < 2) continue;
    const set = new Set(fs), comp = new Map();
    let c = 0;
    for (const f of fs) {
      if (comp.has(f)) continue;
      const st = [f]; comp.set(f, c);
      while (st.length) { const g = st.pop(); for (const h of adj[g]) if (set.has(h) && !comp.has(h)) { comp.set(h, c); st.push(h); } }
      c++;
    }
    if (c < 2) continue;
    const ids = [v];
    for (let i = 1; i < c; i++) { ids.push(P.length / 3); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); split++; }
    for (const f of fs) { const id = ids[comp.get(f)]; for (let k = 0; k < 3; k++) if (idx[f * 3 + k] === v) out[f * 3 + k] = id; }
  }
  return { pos: Float32Array.from(P), idx: out, fixedEdges: fixed, splitVerts: split };
}
