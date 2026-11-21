// landforms — cliff BANDS that follow the contour lines of steep ground, and the sharp summit of 霜见岳.
//
// Bands: the analytic height field is sampled on a 4 m grid; marching squares trace every contour level (5.5 m apart)
// through the steep cells; each chained contour becomes a run of stratified cliff: a level ledge at the contour with an
// overhanging lip, a recessed under-lip, a wall dropping to the next level down, and a buried foot. Stacked levels read
// as one continuous terraced cliff that wraps the hill, never as slabs leaning on it. Ledges break off in places,
// walls carry vertical joints, run ends taper into the slope. Two LODs (hi: 2.4 m along the contour, 7 profile
// segments; lo: 4.8 m, 3 segments) baked into the same CellStore as the other cliff pieces.
// Crags: the ridge points of the summit get sharp low-poly shards (flat facets, off-centre apex), joined by knife-edge
// arêtes with a snow cornice hanging over the lee (north) side.
import * as THREE from 'three';
import { mulberry32, noise2 } from '../../core/util.js';
import { rockShader, palAt, sstep, mix3 } from './rockgeo.js';

const DEG = Math.PI / 180;
// marching-squares: corner bits a=1 b=2 c=4 d=8 (above the level) -> pairs of edges (e0 ab, e1 bc, e2 dc, e3 ad)
const MS = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [1, 3], [0, 1], [3, 0], []];

/**
 * Trace contour runs through the steep, unblocked ground. Returns [{ L, pts: [[x,z],...] }] (raw marching-squares
 * points, chained, 4 m-ish spacing).
 */
function traceContours(W, blocked, { S = 4, X0 = -W.WORLD.half, N = 1 + 2 * W.WORLD.half / S, DL = 5.5, minSlope = 44 * DEG }) {
  const H = (x, z) => W.baseHeightAt(x, z);
  const hg = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hg[j * N + i] = H(X0 + i * S, X0 + j * S);
  const M = N - 1;
  const ok = new Uint8Array(M * M);
  const tmin = Math.tan(minSlope);
  let hmax = 0;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const a = hg[j * N + i], b = hg[j * N + i + 1], c = hg[(j + 1) * N + i + 1], d = hg[(j + 1) * N + i];
    if (Math.min(a, b, c, d) < 1.0) continue;
    const gx = ((b + c) - (a + d)) / (2 * S), gz = ((d + c) - (a + b)) / (2 * S);
    if (Math.hypot(gx, gz) < tmin) continue;
    const cx = X0 + (i + 0.5) * S, cz = X0 + (j + 0.5) * S;
    if (blocked(cx, cz, 3)) continue;
    ok[j * M + i] = 1;
    hmax = Math.max(hmax, a, b, c, d);
  }
  const runs = [];
  for (let L = 3 + DL * 0.5; L < hmax; L += DL) {
    const segs = [];          // [edgeA, edgeB]
    const pt = new Map();     // edgeId -> [x,z]
    const adj = new Map();    // edgeId -> [seg indices]
    const eid = (i, j, v) => ((j * N + i) << 1) | v;
    const edgePt = (id) => {
      let p = pt.get(id);
      if (p) return p;
      const v = id & 1, k = id >> 1, i = k % N, j = (k - i) / N;
      const h1 = hg[j * N + i], h2 = v ? hg[(j + 1) * N + i] : hg[j * N + i + 1];
      const t = Math.min(1, Math.max(0, (L - h1) / ((h2 - h1) || 1e-6)));
      p = v ? [X0 + i * S, X0 + (j + t) * S] : [X0 + (i + t) * S, X0 + j * S];
      pt.set(id, p);
      return p;
    };
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      if (!ok[j * M + i]) continue;
      const a = hg[j * N + i], b = hg[j * N + i + 1], c = hg[(j + 1) * N + i + 1], d = hg[(j + 1) * N + i];
      const cs = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0);
      const e = MS[cs];
      if (!e.length) continue;
      const E = [eid(i, j, 0), eid(i + 1, j, 1), eid(i, j + 1, 0), eid(i, j, 1)];
      for (let k = 0; k < e.length; k += 2) {
        const s = [E[e[k]], E[e[k + 1]]];
        const si = segs.length; segs.push(s);
        for (const id of s) { let l = adj.get(id); if (!l) adj.set(id, l = []); l.push(si); }
      }
    }
    const used = new Uint8Array(segs.length);
    const walk = (si, from) => {          // follow the chain from segment si leaving through edge != from
      const out = [];
      let cur = si, enter = from;
      for (;;) {
        used[cur] = 1;
        const s = segs[cur];
        const exit = s[0] === enter ? s[1] : s[0];
        out.push(exit);
        const nx = (adj.get(exit) || []).find((k) => !used[k]);
        if (nx === undefined) break;
        cur = nx; enter = exit;
      }
      return out;
    };
    for (let si = 0; si < segs.length; si++) {
      if (used[si]) continue;
      const fwd = walk(si, segs[si][0]);
      used[si] = 0;
      const back = (adj.get(segs[si][0]) || []).find((k) => k !== si && !used[k]);
      used[si] = 1;
      let ids = [segs[si][0], ...fwd];
      if (back !== undefined) { const b = walk(back, segs[si][0]); ids = [...b.reverse(), ...ids]; }
      if (ids.length < 4) continue;
      runs.push({ L, pts: ids.map(edgePt) });
    }
  }
  return runs;
}

/** Resample a polyline at a fixed step (keeps the ends). */
function resample(pts, step) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const l = Math.hypot(x1 - x0, z1 - z0);
    let t = step - acc;
    while (t <= l) { out.push([x0 + (x1 - x0) * t / l, z0 + (z1 - z0) * t / l]); t += step; }
    acc = l - (t - step);
  }
  const last = pts[pts.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.4) out.push(last);
  // one smoothing pass (marching squares zig-zags on the 4 m grid)
  for (let i = 1; i < out.length - 1; i++) out[i] = [(out[i - 1][0] + out[i][0] * 2 + out[i + 1][0]) / 4, (out[i - 1][1] + out[i][1] * 2 + out[i + 1][1]) / 4];
  return out;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/** Quad A(i,row0) B(i,row1) C(i+1,row0) D(i+1,row1), wound to face the stored normal of A. */
function quad(bake, A, B, C, D) {
  const pa = bake.p, nn = bake.n;
  _a.set(pa[A * 3], pa[A * 3 + 1], pa[A * 3 + 2]);
  _b.set(pa[C * 3], pa[C * 3 + 1], pa[C * 3 + 2]).sub(_a);
  _c.set(pa[B * 3], pa[B * 3 + 1], pa[B * 3 + 2]).sub(_a);
  _b.cross(_c);
  if (_b.x * nn[A * 3] + _b.y * nn[A * 3 + 1] + _b.z * nn[A * 3 + 2] < 0) { bake.tri(A, B, C); bake.tri(B, D, C); } else { bake.tri(A, C, B); bake.tri(B, C, D); }
}

/**
 * Bake one band piece (a slice of a run) into a Bake. prof: per point { x, z, nx, nz, rows: [[o, y, cav]...] }.
 * Each profile segment gets its own vertices (crisp ledge / lip edges), smooth along the contour.
 */
function bakeStrip(bake, pts, shade, segIdx) {
  const n = pts.length;
  for (const [j0, j1] of segIdx) {
    const base = bake.nv;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const r0 = p.rows[j0], r1 = p.rows[j1];
      // segment normal in the (outward, up) plane rotated by +90°: (-dy, do)
      const dO = r1[0] - r0[0], dY = r1[1] - r0[1];
      const l = Math.hypot(dO, dY) || 1;
      const no = -dY / l, ny = dO / l;
      const nx = p.nx * no, nz = p.nz * no;
      for (const r of [r0, r1]) {
        const x = p.x + p.nx * r[0], z = p.z + p.nz * r[0], y = r[1];
        bake.vert(x, y, z, nx, ny, nz, shade(x, y, z, nx, ny, nz, r[2], r[3]));
      }
    }
    for (let i = 0; i < n - 1; i++) {
      quad(bake, base + i * 2, base + i * 2 + 1, base + i * 2 + 2, base + i * 2 + 3);
    }
  }
}

/** Contour cliff bands. Adds pieces to `store` (kind 'band'). Returns counts. */
export function buildBands(G, store, blocked, { dens = 1 } = {}) {
  const W = G.world;
  const H = (x, z) => W.baseHeightAt(x, z);
  const rnd = mulberry32(777001);
  const DL = 5.5;
  const runs = traceContours(W, blocked, { DL });
  let nPieces = 0, nPts = 0, len = 0;
  const HI = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]];
  const LO = [[0, 1], [1, 2], [2, 3]];
  for (const run of runs) {
    const pts = resample(run.pts, 2.4);
    if (pts.length < 6) continue;
    const L = run.L;
    // per point profile
    const prof = [];
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      if (i) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const e = 1.2;
      const gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e);
      const gl = Math.hypot(gx, gz) || 1e-6;
      prof.push({ x, z, nx: -gx / gl, nz: -gz / gl, ts: gl, along });
    }
    const total = along;
    len += total;
    // pieces of <= 22 points (~50 m), sharing their end point; some dropped (gaps in the band), ends taper
    const PIECE = 22;
    for (let s = 0; s < prof.length - 1; s += PIECE - 1) {
      const sl = prof.slice(s, Math.min(prof.length, s + PIECE));
      if (sl.length < 3) continue;
      const seed = noise2(sl[0].x * 0.013 + L * 0.7, sl[0].z * 0.013);
      if (seed < -0.2 && rnd() < 0.85) continue;       // a gap: the slope shows through
      if (noise2(sl[0].x * 0.008 + 5.1, L * 0.29) < -0.25) continue;   // whole beds missing in places: uneven terraces
      const hbK = 0.45 + 0.5 * (0.5 + 0.5 * noise2(sl[0].x * 0.02 - L, sl[0].z * 0.02 + L));
      const rows = [];
      for (const p of sl) {
        // taper toward the ends of the run, and toward a dropped neighbour piece (soft both ends of every piece)
        const dEnd = Math.min(p.along, total - p.along);
        const dPiece = Math.min(p.along - sl[0].along, sl[sl.length - 1].along - p.along);
        const k = sstep(0, 6, dEnd) * (0.55 + 0.45 * sstep(0, 5, dPiece + (seed > 0 ? 6 : 0)));
        const hb = DL * hbK * (0.85 + 0.3 * (0.5 + 0.5 * noise2(p.along * 0.09 + L, L * 0.3))) * k;
        const d = Math.min(9, hb / Math.max(0.6, p.ts));
        const wob = noise2(p.along * 0.21 + L * 3.1, L * 1.7) * 0.5;
        const jt = (p.along / (4 + 3 * (0.5 + 0.5 * noise2(L, 3.3))) + L) % 1;
        const notch = jt < 0.12 ? 0.55 : 0;                 // vertical joint: wall stepped back, lip lowered
        const f = d * 0.85 + wob - notch;
        const fy = (o) => H(p.x + p.nx * o, p.z + p.nz * o);
        const foot = Math.min(L - hb - 0.2, fy(d + 0.25) - 0.25);
        const span = Math.max(0.5, L - foot);
        const ly = (y) => ((y - foot) / span) * 2 - 1;
        const r = [
          [-1.0, L - 1.0, 0.4],
          [0.15, L + 0.12 * k, 0.75],
          [Math.max(0.3, f - 0.3), L + (0.3 - notch * 0.4) * k, 0.95],
          [Math.max(0.5, f + 0.35 * k), L - 0.15 * k, 0.8],
          [Math.max(0.4, f + 0.05 * k), L - 0.75 * k, 0.0],
          [Math.max(0.3, f - 0.15 + 0.1 * wob), L - hb * 0.45, 0.4],
          [d + 0.25, foot, 0.25],
          [d + 1.4, fy(d + 1.4) - 0.8, 0.25],
        ].map((q) => [q[0], q[1], q[2], ly(q[1])]);
        rows.push({ ...p, rows: r });
      }
      const pal = palAt(W, sl[0].x, sl[0].z);
      const shade = rockShader(pal);
      const mid = sl[sl.length >> 1];
      const lo = rows.filter((_, i) => i % 2 === 0 || i === rows.length - 1).map((p) => ({ ...p, rows: [p.rows[1], p.rows[3], p.rows[6], p.rows[7]] }));
      store.addRaw({ x: mid.x, z: mid.z, y: L, kind: 'band' }, (b) => bakeStrip(b, rows, shade, HI), (b) => bakeStrip(b, lo, shade, LO));
      nPieces++; nPts += rows.length;
    }
  }
  void dens;
  return { pieces: nPieces, points: nPts, metres: Math.round(len), levels: runs.length };
}

// ------------------------------------------------------------------------------------------------ summit crags

/** Sharp low-poly shard: flat facets, irregular base, off-centre apex. Object space: base y 0, top 1, radius ~1. */
export function protoCrag(seed) {
  const rnd = mulberry32(seed);
  const m = 5 + Math.floor(rnd() * 2);
  const ax = (rnd() - 0.5) * 0.5, az = (rnd() - 0.5) * 0.5;
  const RING = [[0, 1.0], [0.28, 0.8], [0.52, 0.58], [0.76, 0.32]];
  const rings = RING.map(([t, r], ri) => {
    const a0 = rnd() * 6.28;
    const pts = [];
    for (let k = 0; k < m; k++) {
      const a = a0 * 0.15 + (k / m) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const rr = r * (0.75 + rnd() * 0.45);
      pts.push([ax * t + Math.cos(a) * rr, t - 0.08 + rnd() * 0.16 * (ri ? 1 : 0), az * t + Math.sin(a) * rr]);
    }
    return pts;
  });
  rings[0].forEach((p) => { p[1] = -0.15; });
  const apex = [ax, 1, az];
  const P = [], C = [];
  const tri = (a, b, c, cav) => { P.push(...a, ...b, ...c); C.push(cav, cav, cav); };
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < m; k++) {
    const a = rings[r][k], b = rings[r][(k + 1) % m], c = rings[r + 1][(k + 1) % m], d = rings[r + 1][k];
    const cav = 0.3 + 0.18 * r + rnd() * 0.25;
    tri(a, b, c, cav); tri(a, c, d, cav);
  }
  const top = rings[rings.length - 1];
  for (let k = 0; k < m; k++) tri(top[k], top[(k + 1) % m], apex, 0.95);
  // wind order: make every facet face away from the shard's axis
  for (let i = 0; i < P.length; i += 9) {
    _a.set(P[i], P[i + 1], P[i + 2]); _b.set(P[i + 3], P[i + 4], P[i + 5]).sub(_a); _c.set(P[i + 6], P[i + 7], P[i + 8]).sub(_a);
    const n = _b.cross(_c);
    const cx = (P[i] + P[i + 3] + P[i + 6]) / 3, cz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3, cy = (P[i + 1] + P[i + 4] + P[i + 7]) / 3;
    if (n.x * (cx - ax * cy) + n.z * (cz - az * cy) + n.y * 0.05 < 0) for (let q = 0; q < 3; q++) { const t = P[i + 3 + q]; P[i + 3 + q] = P[i + 6 + q]; P[i + 6 + q] = t; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex([...Array(P.length / 3).keys()]);
  g.computeVertexNormals();
  return { geo: g, cav: new Float32Array(C) };
}

/**
 * Knife-edge arête between two ridge points (a, b: [x, z]) with a snow cornice overhanging the north (-z) side.
 * Baked straight into the store as a raw piece.
 */
export function buildArete(G, store, a, b, rnd) {
  const W = G.world;
  const H = (x, z) => W.baseHeightAt(x, z);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(3, Math.round(len / 2.6));
  const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
  let sx = -tz, sz = tx;                        // side axis; cornice on the side facing north (-z)
  if (sz > 0) { sx = -sx; sz = -sz; }
  const pal = palAt(W, a[0], a[1]);
  const shade = rockShader(pal);
  const snowC = (y, nyv) => mix3([0.86, 0.9, 0.98], [0.97, 0.98, 1.0], sstep(0.2, 0.9, nyv));
  const mk = (hiRes) => (bake) => {
    const pts = [];
    const step = hiRes ? 1 : 2;
    for (let i = 0; i <= n; i += step) {
      const t = Math.min(1, i / n);
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const h = H(x, z);
      const end = sstep(0, 0.18, Math.min(t, 1 - t));
      const jag = (i % 2 ? 0.9 : 0) + rnd() * 1.4;
      const top = h + (1.2 + jag + 2.2 * (0.5 + 0.5 * noise2(x * 0.05, z * 0.05))) * end;
      const w = 2.2 + 1.2 * end;
      pts.push({ x, z, h, top, w, end });
    }
    // rock blade: south flank, north flank (two strips, flat-ish normals)
    for (const side of [1, -1]) {
      const base = bake.nv;
      for (const p of pts) {
        const ox = sx * side, oz = sz * side;
        const nx = ox * 0.8, ny = 0.6, nz = oz * 0.8;
        const x0 = p.x + ox * p.w, z0 = p.z + oz * p.w, y0 = H(x0, z0) - 1.2;
        bake.vert(x0, y0, z0, nx, ny, nz, shade(x0, y0, z0, nx, ny, nz, 0.5, -1));
        bake.vert(p.x + ox * 0.15, p.top, p.z + oz * 0.15, nx, ny, nz, shade(p.x, p.top, p.z, nx, ny, nz, 0.95, 1));
      }
      for (let i = 0; i < pts.length - 1; i++) {
        quad(bake, base + i * 2, base + i * 2 + 1, base + i * 2 + 2, base + i * 2 + 3);
      }
    }
    // cornice: a snow lip along the crest leaning out over the north side
    if (pal.snowLine) {
      const base = bake.nv;
      const ox = sx, oz = sz;
      for (const p of pts) {
        const o = 0.9 * p.end;
        const q = [[-0.4, p.top - 0.35], [0.0, p.top + 0.3 * p.end], [o, p.top + 0.05], [o * 0.5, p.top - 0.5 * p.end]];
        const ns = [[-0.5, 0.86], [0.2, 0.98], [0.9, -0.1], [0.3, -0.9]];
        for (let k = 0; k < 4; k++) {
          const [d, y] = q[k];
          bake.vert(p.x + ox * d, y, p.z + oz * d, ox * ns[k][0], ns[k][1], oz * ns[k][0], snowC(y, ns[k][1]));
        }
      }
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 3; k++) {
        const A = base + i * 4 + k;
        quad(bake, A, A + 1, A + 4, A + 5);
      }
    }
  };
  return store.addRaw({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, y: H((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), kind: 'arete' }, mk(true), mk(false));
}
