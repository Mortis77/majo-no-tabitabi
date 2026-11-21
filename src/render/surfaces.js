// Procedurally painted, tileable surface-detail library (generated once at boot, ~11 x 256² texels).
// One DataArrayTexture, one layer per kind. Per texel:
//   R = albedo modulation (0.5 = neutral; painted strokes, grain, mortar, straw strands…)
//   G = height (0..1; feeds the cel band and the cavity darkening)
//   B, A = height gradient d/du, d/dv (0.5 = flat) -> bends the shading normal
// The hook (veilhook.js) samples it by WORLD-SPACE triplanar mapping, so untextured primitives need no UVs.
// Every pattern is periodic over the tile (all noise lattices wrap), mipmapped, so it is stable under motion.
import * as THREE from 'three';

/**
 * Surface kinds. index = texture layer; scale = metres per tile; amp = albedo modulation strength;
 * bump = normal bend strength; fine = strength of the fine speckle scale. Tag materials with
 * material.userData.surface = '<kind>' (or toon(color, { surface: '<kind>' })). 'none' = no detail.
 */
export const SURFACES = {
  paint:   { index: 0, scale: 4.0, amp: 0.5, bump: 0.3, fine: 0.0 },    // broad painted wash + a few long strokes (default)
  wood:    { index: 1, scale: 1.6, amp: 0.85, bump: 0.6, fine: 0.1 },   // planks, grain along the plank, seams, knots
  plaster: { index: 2, scale: 3.2, amp: 0.6, bump: 0.35, fine: 0.0 },   // lime plaster: soft blotches, streaks, hairlines
  stone:   { index: 3, scale: 2.2, amp: 0.85, bump: 0.7, fine: 0.08 },  // dressed stone: mottling, facets, cracks, chips
  rock:    { index: 4, scale: 6.0, amp: 0.85, bump: 0.85, fine: 0.1 },  // natural rock: bands, strata, cracks
  thatch:  { index: 5, scale: 1.5, amp: 0.95, bump: 0.7, fine: 0.08 },  // straw courses down the slope, cut edges
  tile:    { index: 6, scale: 1.8, amp: 0.8, bump: 0.9, fine: 0.05 },   // kawara roof tiles in rows down the slope
  cloth:   { index: 7, scale: 0.6, amp: 0.35, bump: 0.25, fine: 0.04 }, // cloth: soft fold streaks, faint weave
  paper:   { index: 8, scale: 1.2, amp: 0.35, bump: 0.15, fine: 0.04 }, // washi / shoji: soft mottling, long fibres
  metal:   { index: 9, scale: 1.4, amp: 0.6, bump: 0.3, fine: 0.05 },   // patina, run-off streaks
  earth:   { index: 10, scale: 2.8, amp: 0.7, bump: 0.6, fine: 0.1 },   // packed earth, soft pebbles
  bark:    { index: 11, scale: 1.3, amp: 0.85, bump: 0.85, fine: 0.12 },// tree bark: vertical furrows
};
export const SURFACE_NAMES = Object.keys(SURFACES);
const S = 256;

// ---- periodic noise helpers ------------------------------------------------------------------------------------------
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
/** value noise with integer period P (x, y in lattice units, wrap at P) */
function vnoise(x, y, P, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = fade(x - x0), ty = fade(y - y0);
  const xa = ((x0 % P) + P) % P, ya = ((y0 % P) + P) % P, xb = (xa + 1) % P, yb = (ya + 1) % P;
  const a = hash2(xa, ya, s), b = hash2(xb, ya, s), c = hash2(xa, yb, s), d = hash2(xb, yb, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
/** fbm over u,v in [0,1) with base period P (lattice cells per tile), anisotropic periods allowed */
function fbm(u, v, P, oct, s, Py = P) {
  let sum = 0, amp = 0.5, tot = 0, p = P, py = Py;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u * p, v * py, p === py ? p : p, s + o * 17) * 1; tot += amp;
    amp *= 0.5; p *= 2; py *= 2;
  }
  return sum / tot;
}
// anisotropic periodic noise: separate x / y periods
function vnoise2(x, y, Px, Py, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = fade(x - x0), ty = fade(y - y0);
  const xa = ((x0 % Px) + Px) % Px, ya = ((y0 % Py) + Py) % Py, xb = (xa + 1) % Px, yb = (ya + 1) % Py;
  const a = hash2(xa, ya, s), b = hash2(xb, ya, s), c = hash2(xa, yb, s), d = hash2(xb, yb, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function fbm2(u, v, Px, Py, oct, s) {
  let sum = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise2(u * Px, v * Py, Px, Py, s + o * 31); tot += amp; amp *= 0.5; Px *= 2; Py *= 2; }
  return sum / tot;
}
/** periodic cellular noise: distance to nearest / second nearest feature point (cells per tile N) */
function cell(u, v, N, s) {
  const x = u * N, y = v * N, xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = ((cx % N) + N) % N, wy = ((cy % N) + N) % N;
    const px = cx + hash2(wx, wy, s), py = cy + hash2(wx, wy, s + 7);
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; id = hash2(wx, wy, s + 13); } else if (d < d2) d2 = d;
  }
  return [d1, d2, id];
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fr = (x) => x - Math.floor(x);

// ---- pattern generators: (u, v) in [0,1) -> [albedo 0..1, height 0..1] ------------------------------------------------
// Look round (2026-11-14): painted, not printed. Each kind is a few big soft washes + a handful of deliberate marks
// (seams, cut edges, cracks, chips, drips) and almost no uniform grain. Heights are smooth except at the marks, so the
// bent normal and the cel band never speckle. Per-piece tone, the gradients up a wall, the damp foot and the stains
// under the eaves are baked into the vertex colour of the site meshes (world/builders/kit.js shadeBaked).
const GEN = {
  paint(u, v) {
    // a broad wash + a few long faint brush strokes (lacquer, painted boards, everything untagged)
    const wash = fbm(u, v, 2, 3, 5);
    const sk = fbm2(u, v, 2, 7, 2, 11);
    const stroke = sstep(0.56, 0.72, sk) * (1 - sstep(0.78, 0.9, sk));
    const a = 0.5 + (wash - 0.5) * 0.75 + stroke * 0.14;
    return [a, 0.5 + (wash - 0.5) * 0.3 + stroke * 0.08];
  },
  wood(u, v) {
    // 4 planks across u, grain along v: per-plank tone, soft grain lines that follow the plank, a few long streaks,
    // dark seams with a worn lighter lip, the odd butt joint and knot
    const pk = u * 4, pi = Math.floor(pk) % 4, pu = pk - Math.floor(pk);
    const tone = hash2(pi, 0, 71) - 0.5;
    const warp = fbm2(u, v, 4, 1, 2, 77);
    const gl = Math.sin((pu * 4.5 + warp * 1.6 + hash2(pi, 1, 72) * 6) * Math.PI * 2) * 0.5 + 0.5;
    const grain = sstep(0.72, 0.97, gl);
    const streak = fbm2(u, v, 16, 1, 2, 79);
    const wash = fbm(u, v, 2, 2, 85);
    const [kd] = cell(u, v, 2, 83);
    const knot = 1 - sstep(0.025, 0.07, kd * (0.7 + hash2(pi, 2, 84)));
    const jv = hash2(pi, 3, 86), jd = Math.abs(fr(v - jv + 0.5) - 0.5);
    const butt = hash2(pi, 4, 87) > 0.45 ? 1 - sstep(0.0, 0.012, jd) : 0;
    const seamD = Math.min(pu, 1 - pu);
    const seam = 1 - sstep(0.0, 0.035, seamD);
    const lip = sstep(0.035, 0.06, seamD) * (1 - sstep(0.06, 0.13, seamD));
    const a = 0.5 + tone * 0.32 + (wash - 0.5) * 0.3 + (streak - 0.5) * 0.28 - grain * 0.1 - knot * 0.3
      - seam * 0.42 - butt * 0.3 + lip * 0.09;
    const h = 0.62 + Math.sin(Math.min(1, seamD * 8) * Math.PI * 0.5) * 0.18 - seam * 0.45 - butt * 0.3 - grain * 0.03 - knot * 0.06;
    return [a, h];
  },
  plaster(u, v) {
    // lime plaster: big soft blotches, faint vertical weather streaks, soft trowel arcs, two or three hairline cracks
    const blot = fbm(u, v, 2, 3, 101);
    const streak = fbm2(u, v, 9, 1, 2, 103);
    const trowel = fbm2(u, v, 3, 2, 2, 105);
    const [d1, d2, id] = cell(u, v, 3, 107);
    const crack = id > 0.8 ? (1 - sstep(0.0, 0.012, d2 - d1)) * sstep(0.45, 0.7, fbm(u, v, 3, 2, 108)) : 0;
    const a = 0.5 + (blot - 0.5) * 0.6 + (streak - 0.5) * 0.24 + (trowel - 0.5) * 0.14 - crack * 0.3;
    return [a, 0.5 + (trowel - 0.5) * 0.3 + (blot - 0.5) * 0.18 - crack * 0.25];
  },
  stone(u, v) {
    // dressed / carved stone (lanterns, slabs, plinths, steps, courses — the geometry makes the joints): broad
    // mottling, soft chisel facets, a few cracks, rare chips, pale lichen spots
    const mott = fbm(u, v, 2, 3, 131), wash = fbm(u, v, 4, 2, 132);
    const wu = fr(u + (fbm(u, v, 4, 2, 135) - 0.5) * 0.12), wv = fr(v + (fbm(u, v, 4, 2, 136) - 0.5) * 0.12); // wobbly cracks
    const [f1, , fid] = cell(u, v, 5, 133);
    const dome = 1 - Math.min(1, f1 * 1.15);
    const [c1, c2, cid] = cell(wu, wv, 2, 137);
    const crack = cid > 0.7 ? (1 - sstep(0.0, 0.016, c2 - c1)) * sstep(0.5, 0.72, fbm(u, v, 3, 2, 138)) : 0;
    const [p1, , pid] = cell(u, v, 7, 141);
    const chip = pid > 0.82 ? 1 - sstep(0.03, 0.075, p1) : 0;
    const lichen = sstep(0.64, 0.74, fbm(u, v, 3, 2, 143));
    // revision r2: weathered patches at carving scale (~0.25 m): soft darker pits and paler worn spots, sparse, so a
    // lantern or a komainu reads as weathered stone and not as a blank grey primitive
    const wz = fbm(u, v, 9, 2, 145);
    const pit = sstep(0.6, 0.72, wz), worn = sstep(0.62, 0.74, 1 - wz);
    const a = 0.5 + (mott - 0.5) * 0.8 + (wash - 0.5) * 0.22 + (fid - 0.5) * 0.05 + dome * 0.04 - crack * 0.3 - chip * 0.22 + lichen * 0.14
      - pit * 0.16 + worn * 0.1;
    return [a, 0.5 + (mott - 0.5) * 0.2 + dome * 0.1 - crack * 0.35 - chip * 0.3 - pit * 0.06];
  },
  rock(u, v) {
    // natural rock: broad bands, soft strata, a few cracks
    const warp = fbm(u, v, 2, 3, 151) * 0.35;
    const strata = Math.sin((v * 5 + warp * 4) * Math.PI * 2) * 0.5 + 0.5;
    const band = fbm2(u, fr(v + warp), 2, 8, 2, 153);
    const [d1, d2, id] = cell(u, v, 4, 157);
    const crack = id > 0.6 ? (1 - sstep(0.0, 0.025, d2 - d1)) * sstep(0.42, 0.62, fbm(u, v, 3, 2, 158)) : 0;
    const wash = fbm(u, v, 3, 2, 159);
    const a = 0.5 + (band - 0.5) * 0.55 + (strata - 0.5) * 0.18 + (wash - 0.5) * 0.3 - crack * 0.4;
    return [a, 0.5 + (strata - 0.5) * 0.3 + (band - 0.5) * 0.25 - crack * 0.45];
  },
  thatch(u, v) {
    // revision r2: straw seen END-ON or along the stalk (cut eave faces, bales, hay, rope): bundles side by side across
    // u, each rounded (lit centre, dark crease), a few long strands along v, no horizontal courses. Roofs no longer use
    // this layer: they carry thatchMap() on real UVs (the triplanar blend of two projections on a 45-degree slope mushed
    // any course pattern into a smudge).
    const N = 14, bk = fr(u + (fbm2(u, v, 2, 3, 2, 171) - 0.5) * 0.04) * N, bi = Math.floor(bk) % N, bx = bk - Math.floor(bk);
    const tone = hash2(bi, 0, 173) - 0.5;
    const round = Math.sin(bx * Math.PI);
    const crease = 1 - sstep(0.0, 0.14, Math.min(bx, 1 - bx));
    const strand = fbm2(u, v, 96, 2, 2, 175);
    const wash = fbm(u, v, 2, 2, 177);
    const a = 0.5 + tone * 0.2 + (round - 0.6) * 0.16 - crease * 0.3 + (sstep(0.55, 0.75, strand) - 0.3) * 0.1 + (wash - 0.5) * 0.25;
    return [a, 0.35 + round * 0.4 - crease * 0.25];
  },
  tile(u, v) {
    // kawara: columns of half-round tiles along u (8 per tile), 5 rows down v (v grows downhill): per-tile tone, a
    // sheen line on each crown, dark gaps between the columns, the row above's lip shading the top of each row
    const cols = 8, rows = 5, rk = v * rows, ri = Math.floor(rk) % rows, rv = rk - Math.floor(rk);
    const ci = Math.floor(u * cols) % cols, cu = fr(u * cols), round = Math.sin(cu * Math.PI);
    const id = hash2(ci, ri, 181);
    const gap = 1 - sstep(0.0, 0.1, Math.min(cu, 1 - cu));
    const crown = sstep(0.82, 0.97, round);
    const lap = 1 - sstep(0.0, 0.22, rv);
    const lip = sstep(0.86, 0.96, rv);
    const wash = fbm(u, v, 2, 2, 183);
    const a = 0.5 + (id - 0.5) * 0.26 + (wash - 0.5) * 0.22 + (round - 0.5) * 0.18 + crown * 0.1 + lip * 0.08 - gap * 0.36 - lap * 0.3;
    return [a, round * 0.5 + rv * 0.3 - gap * 0.15];
  },
  cloth(u, v) {
    // soft long fold streaks + a barely there weave
    const fold = fbm2(u, v, 3, 1, 2, 191);
    const wash = fbm(u, v, 2, 2, 193);
    const f = 32, weave = Math.sin(u * f * Math.PI * 2) * Math.sin(v * f * Math.PI * 2);
    const a = 0.5 + (fold - 0.5) * 0.4 + (wash - 0.5) * 0.22 + weave * 0.03;
    return [a, 0.5 + (fold - 0.5) * 0.35];
  },
  paper(u, v) {
    // washi: soft cloud mottling, a few long fibres
    let fib = 0;
    for (let k = 0; k < 3; k++) {
      const a1 = k === 0 ? fr(u + v) : k === 1 ? fr(u - v) : fr(2 * u + v), b1 = k === 0 ? fr(u - v) : k === 1 ? fr(u + v) : fr(v - u);
      fib += sstep(0.62, 0.8, fbm2(a1, b1, 2, 24, 2, 201 + k)); // integer directions keep the tile periodic
    }
    const mott = fbm(u, v, 3, 3, 207);
    const a = 0.5 + (mott - 0.5) * 0.45 + fib * 0.08;
    return [a, 0.5 + (mott - 0.5) * 0.15 + fib * 0.05];
  },
  metal(u, v) {
    // patina blotches, run-off streaks, a whisper of brushing
    const pat = sstep(0.42, 0.72, fbm(u, v, 3, 4, 213));
    const run = fbm2(u, v, 10, 1, 2, 211);
    const brush = fbm2(u, v, 24, 2, 2, 215);
    const a = 0.5 - pat * 0.28 + (run - 0.5) * 0.24 + (brush - 0.5) * 0.06;
    return [a, 0.5 - pat * 0.2 + (run - 0.5) * 0.15];
  },
  earth(u, v) {
    // packed earth: soft mottling, a scatter of soft pebbles
    const mott = fbm(u, v, 2, 3, 223);
    const [d1, , id] = cell(u, v, 6, 221);
    const peb = id > 0.8 ? (1 - sstep(0.1, 0.3, d1 + (fbm(u, v, 12, 2, 227) - 0.5) * 0.2)) : 0;
    const wash = fbm(u, v, 4, 2, 225);
    const a = 0.5 + (mott - 0.5) * 0.6 + (wash - 0.5) * 0.18 + peb * (id - 0.86) * 1.6;
    return [a, 0.45 + peb * 0.18 + (mott - 0.5) * 0.2];
  },
  bark(u, v) {
    const warp = fbm2(u, v, 3, 1, 3, 231) * 0.6;
    const furrow = Math.abs(Math.sin((u * 5 + warp) * Math.PI * 2));
    const plates = fbm2(u, v, 8, 2, 2, 233);
    const a = 0.5 + (furrow - 0.5) * 0.55 + (plates - 0.5) * 0.4;
    return [a, furrow * 0.7 + plates * 0.3];
  },
};
let _tex = null;
/** The surface library (DataArrayTexture, depth = number of kinds). Generated on first call. */
export function surfaceTexture() {
  if (_tex) return _tex;
  const L = SURFACE_NAMES.length;
  const data = new Uint8Array(S * S * 4 * L);
  const A = new Float32Array(S * S), H = new Float32Array(S * S);
  SURFACE_NAMES.forEach((name, layer) => {
    const g = GEN[name];
    let mean = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [a, h] = g(x / S, y / S);
      A[y * S + x] = a; H[y * S + x] = clamp01(h); mean += a;
    }
    mean /= S * S; // re-centre albedo so tagging never shifts the authored colour on average
    const o = layer * S * S * 4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const hx = H[y * S + ((x + 1) % S)] - H[y * S + ((x + S - 1) % S)];
      const hy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
      const p = o + i * 4;
      data[p] = Math.round(clamp01(A[i] - mean + 0.5) * 255);
      data[p + 1] = Math.round(H[i] * 255);
      data[p + 2] = Math.round(clamp01(0.5 + hx * 4) * 255);
      data[p + 3] = Math.round(clamp01(0.5 + hy * 4) * 255);
    }
  });
  const t = new THREE.DataArrayTexture(data, S, S, L);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  _tex = t;
  return t;
}

// ---- thatch roof map (revision r2) -------------------------------------------------------------------------------------
// Roofs of straw carry a real UV map instead of the triplanar layer: u runs around the eave ring, v DOWN the slope
// (world/builders/kit.js roofGeometry), one tile = THATCH_TILE metres. Painted, not noise: bundles of straw ~0.15 m wide
// laid in courses (2 per tile); each course's bundles end in a lit, ragged cut butt with a soft shadow under it on the
// course below; bundles are rounded (lit centre, dark crease) and carry a few long strands. The butt ends are staggered
// per bundle, so the courses read as hand-laid, not as straight bands. RGB = colour multiplier stored x MAP_K; the four
// corner texels hold the mean, so a mesh without UVs (all-zero uv after a bake) keeps the material's plain colour.
export const THATCH_TILE = 1.5;
let _thatch = null;
/** { tex, mean }: the thatch roof map (linear data, mipmapped, 256²) and its mean value (divide the colour by it). */
export function thatchMap() {
  if (_thatch) return _thatch;
  const R = 2, N = 16, MAP_K = 0.8;
  const data = new Uint8Array(S * S * 4);
  let sum = 0;
  const course = (k) => ((k % R) + R) % R;
  const colAt = (u, k) => {
    // bundles of uneven width: a periodic warp of the column coordinate (monotonic: N > 0.35 * 2pi * 3)
    const f = fr(u + hash2(course(k), 0, 301)), x = f * N + 0.35 * Math.sin((f * 3 + hash2(course(k), 1, 302)) * Math.PI * 2);
    const i = ((Math.floor(x) % N) + N) % N; return [i, x - Math.floor(x)];
  };
  const buttOf = (k, i) => 0.04 + hash2(course(k), i, 303) * 0.4;   // how far the bundle hangs below its course line
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u0 = x / S, v = y / S;
    const u = u0 + Math.sin((v * 3 + u0 * 2) * Math.PI * 2) * 0.004;  // bundles not ruler-straight (periodic)
    const vr = v * R, k = Math.floor(vr);
    // the course above may hang over this point (its butt ends below the course line)
    const [ia, xa] = colAt(u, k - 1), ea = buttOf(k - 1, ia);
    let vk, vi, vx, end, below;
    if (vr - k < ea) { vk = k - 1; vi = ia; vx = xa; end = k + ea - vr; below = 9; }
    else { const [ib, xb] = colAt(u, k); vk = k; vi = ib; vx = xb; end = k + 1 + buttOf(k, ib) - vr; below = vr - k - ea; }
    const tone = hash2(course(vk), vi, 305) - 0.5, age = hash2(course(vk), vi, 307);
    const round = Math.sin(vx * Math.PI);
    const crease = 1 - sstep(0.0, 0.09, Math.min(vx, 1 - vx));
    // long strands along the bundle (period 1 tile in v: periodic), low contrast
    const strand = vnoise2(u * N * 7, v * 2, N * 7, 2, 309 + course(vk));
    // ragged cut end: each strand stops at its own length, the tips catch the light, a dark gap under them
    const rag = (vnoise2(u * N * 9, 0.5, N * 9, 1, 311) - 0.5) * 0.05;
    const tip = sstep(0.0, 0.03, end + rag) * (1 - sstep(0.07, 0.14, end + rag));
    const gap = 1 - sstep(0.0, 0.025, end + rag);
    const shadow = 1 - sstep(0.0, 0.3, below);                         // under the butt of the course above
    let a = 0.88 + tone * 0.12 + (round - 0.6) * 0.1 - crease * 0.12 + (strand - 0.5) * 0.1 + tip * 0.16 - gap * 0.3 - shadow * 0.32;
    a = Math.max(0.25, a);
    // older bundles a touch greyer, fresh ones golden; shadowed straw slightly cooler
    let r = a * (1.02 - age * 0.03), g = a, b = a * (0.95 + age * 0.04 + shadow * 0.03);
    r *= MAP_K; g *= MAP_K; b *= MAP_K;
    const p = (y * S + x) * 4;
    data[p] = Math.round(clamp01(r) * 255); data[p + 1] = Math.round(clamp01(g) * 255); data[p + 2] = Math.round(clamp01(b) * 255); data[p + 3] = 255;
    sum += clamp01(g);
  }
  const mean = sum / (S * S);
  const m8 = Math.round(mean * 255);
  for (const [x, y] of [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1]]) { const p = (y * S + x) * 4; data[p] = data[p + 1] = data[p + 2] = m8; }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  _thatch = { tex: t, mean };
  return _thatch;
}
