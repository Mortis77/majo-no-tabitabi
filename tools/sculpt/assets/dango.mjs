// 团子 (Dango) — the heroine's fox spirit, sculpted on its own 17-bone skeleton (src/story/companion.js: BONE_POS, 'dango_0'..16).
// INTENT
//  1 Silhouette: a small round fox curled around a huge brush tail that sweeps up behind it like a flame; two tall ears.
//  2 Big forms: the egg body with a clear chest and haunches / the head with a fine muzzle / the layered brush tail.
//  3 The eye rests on: the big glossy eyes under the ears, the white chest + cheek ruffs framing the face, the tail tip.
//  4 Story: not wear but wind — every lock flows back and up as if it is always drifting; tips lighten where the light leaks.
//  5 Must not be: a smooth balloon of ellipsoids, a symmetric toy, fur noise spread evenly. Few big locks, sharp tips.
//
// Model space = the game's (metres, +Z front, origin = root bone at the body centre, no ground). Bind pose = rest pose (bones
// carry identity rotation). The rig GLB that feeds rig.mjs is written by this file:
//   node tools/sculpt/assets/dango.mjs rig     -> .tmp/sculpt/dango/dango_rig.glb (17 joints, the CURRENT body as the old
//                                                 mesh with its weights, hand-authored test clips for the pose sheet)
//   SCULPT_THREADS=2 node tools/sculpt/build.mjs tools/sculpt/assets/dango.mjs
//   node tools/sculpt/assets/dango.mjs post    -> rewrites assets/models/sculpt/dango.glb: COLOR_0 RGBA (A = tip mask),
//                                                 TEXCOORD_0 (x = glow ramp like the game's uv.x, y = tip mask); tipmask.png
import * as P from '../sdf.mjs';

const RIG = '.tmp/sculpt/dango/dango_rig.glb';

// ---------------------------------------------------------------------------------------------------- the game's skeleton
const TAILN = 7;
export const BONE_POS = [
  [0, 0, 0, -1], [0, 0, 0, 0], [0, 0.02, 0.08, 1], [0, 0.085, 0.115, 2],
  [0.064, 0.228, 0.128, 3], [-0.064, 0.228, 0.128, 3], [0.05, 0.162, 0.236, 3], [-0.05, 0.162, 0.236, 3],
];
export function tailSpine(t) { return [0, 0.012 + 0.05 * t + 0.35 * t * t - 0.1 * t * t * t, -0.075 - 0.36 * t + 0.1 * t * t * t]; }
for (let i = 0; i < TAILN; i++) { const p = tailSpine(i / TAILN); BONE_POS.push([p[0], p[1], p[2], i === 0 ? 1 : 8 + i - 1]); }
BONE_POS.push([0, -0.055, 0.075, 1], [0, -0.05, -0.055, 1]);

// ---------------------------------------------------------------------------------------------------------- small maths
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]), lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
V.norm = (a) => V.mul(a, 1 / (V.len(a) || 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------------------------------------- the lock: carved fur
// A lock of fur: a flattened teardrop from root a to tip b, cross-section squashed along n (flat < 1), its centre line
// lifting off the surface toward n by `curl` and sideways by `side` (both x length x h^2), radius R * prof(h).
// Every lock is recorded in LOCKS (for the tip mask and the glow).
export const LOCKS = [];
const softTip = (h) => Math.max(0.22, Math.pow(Math.sin(Math.PI * (0.12 + 0.8 * h)), 0.6));
const teardrop = (h) => Math.max(0.07, Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * h)), 0.72));
function lock(a, b, R, { n = [0, 1, 0], flat = 0.6, curl = 0, side = 0, prof = teardrop, tip = 1, kind = 'fur' } = {}) {
  const ax = V.sub(b, a), L = V.len(ax), t = V.mul(ax, 1 / L);
  let nn = V.sub(n, V.mul(t, V.dot(n, t))); nn = V.norm(nn);
  const w = [t[1] * nn[2] - t[2] * nn[1], t[2] * nn[0] - t[0] * nn[2], t[0] * nn[1] - t[1] * nn[0]];
  const cL = curl * L, sL = side * L, k = Math.min(1, flat) * 0.8;
  const f = (x, y, z) => {
    const dx = x - a[0], dy = y - a[1], dz = z - a[2];
    const u = dx * t[0] + dy * t[1] + dz * t[2];
    const h = u <= 0 ? 0 : u >= L ? 1 : u / L;
    const v = dx * nn[0] + dy * nn[1] + dz * nn[2] - cL * h * h;
    const ww = dx * w[0] + dy * w[1] + dz * w[2] - sL * h * h;
    const r = R * prof(h);
    return (Math.hypot(Math.hypot(v / flat, ww), u - h * L) - r) * k;
  };
  const m = R + Math.abs(cL) + Math.abs(sL) + 0.004;
  const bb = [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m];
  LOCKS.push({ a, t, nn, w, L, R, flat, cL, sL, prof, tip, kind });
  return new P.Shape(f, bb);
}
/** how far along its own lock a surface point lies (0 root .. 1 tip), max over the locks that own it; -1 if none */
export function lockParam(x, y, z, kinds = null) {
  let best = -1, bk = null;
  for (const l of LOCKS) {
    if (kinds && !kinds.includes(l.kind)) continue;
    const dx = x - l.a[0], dy = y - l.a[1], dz = z - l.a[2];
    const u = dx * l.t[0] + dy * l.t[1] + dz * l.t[2];
    if (u < -0.01 || u > l.L + 0.01) continue;
    const h = clamp(u / l.L, 0, 1);
    const v = dx * l.nn[0] + dy * l.nn[1] + dz * l.nn[2] - l.cL * h * h, ww = dx * l.w[0] + dy * l.w[1] + dz * l.w[2] - l.sL * h * h;
    const d = Math.hypot(Math.hypot(v / l.flat, ww), u - h * l.L) - l.R * l.prof(h);
    if (d < 0.004 && h * l.tip > best) { best = h * l.tip; bk = l.kind; }
  }
  return { h: best, kind: bk };
}
function tree(list, k = 0) {
  if (list.length === 1) return list[0];
  const m = list.length >> 1, a = tree(list.slice(0, m), k), b = tree(list.slice(m), k);
  return k ? P.softUnion(k, a, b) : P.union(a, b);
}

// ---------------------------------------------------------------------------------------------------------- the tail
const tailR = (t) => {
  if (t >= 1) return 0;
  const r = 0.084 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(Math.max(0, t), 0.75))), 0.6);
  return Math.max(r, 0.034 * (1 - t / 0.3));
};
// the sculpted tail follows the bones at the root, then its upper half sweeps to her left (+x) and a little lower, so it
// does not rise over the head (revision 2: from the front the old tip stood over the head like a crest)
const TIP_FLICK = [0.11, -0.08, -0.03];
export function meshSpine(t) { const p = tailSpine(t), k = clamp((t - 0.4) / 0.71, 0, 1) ** 1.5; return [p[0] + TIP_FLICK[0] * k, p[1] + TIP_FLICK[1] * k, p[2] + TIP_FLICK[2] * k]; }
const tailT = (t) => V.norm(V.sub(meshSpine(t + 0.01), meshSpine(t - 0.01)));
const tailFrame = (t) => { const T = tailT(t), X = [1, 0, 0]; const N = V.norm([X[1] * T[2] - X[2] * T[1], X[2] * T[0] - X[0] * T[2], X[0] * T[1] - X[1] * T[0]]); return { T, X, N }; };
const radial = (t, th) => { const { X, N } = tailFrame(t); return V.norm(V.add(V.mul(X, Math.cos(th)), V.mul(N, Math.sin(th)))); };
/** nearest tail parameter (0..1.12) and distance to the spine */
export function tailParam(x, y, z) {
  let bt = 0, bd = 1e9;
  for (let i = 0; i <= 56; i++) { const t = -0.06 + (i / 56) * 1.18, p = meshSpine(t), d = Math.hypot(x - p[0], y - p[1], z - p[2]); if (d < bd) { bd = d; bt = t; } }
  return { t: bt, d: bd };
}

function buildTail() {
  const R = rng(23), parts = [];
  // core: a full spindle of round sections; it carries most of the outline, the locks only break it in a few big places
  const core = [];
  for (let i = 0; i < 12; i++) {
    const t0 = -0.08 + i * 0.075, t1 = t0 + 0.075;
    core.push(P.taperedCapsule(meshSpine(t0), meshSpine(t1), Math.max(0.03, 0.74 * tailR(t0)), Math.max(0.014, 0.74 * tailR(t1))));
  }
  parts.push(tree(core, 0.025));
  // revision 2: few BIG locks (big / medium / small), rounded tips, lying along the tail and twisting a little like a flame.
  // [t root, t tip, angle around the tail (0 = her left, pi/2 = up), size]
  const L = [
    [0.04, 0.36, 1.75, 1.15], [0.08, 0.34, -1.3, 0.95], [0.1, 0.4, 0.35, 0.9], [0.06, 0.32, 3.4, 0.85],
    [0.3, 0.66, 1.45, 1.25], [0.34, 0.62, -0.5, 1.0], [0.36, 0.6, 2.7, 0.8], [0.32, 0.64, -2.2, 0.95],
    [0.56, 0.86, 1.9, 1.0], [0.6, 0.84, 0.2, 0.8], [0.58, 0.82, -1.7, 0.85], [0.62, 0.86, 3.6, 0.7],
  ];
  for (const [tk, te, th, sz] of L) {
    const twist = 0.3 + R() * 0.1;
    const root = V.add(meshSpine(tk), V.mul(radial(tk, th), 0.45 * tailR(tk)));
    const tipPt = V.add(meshSpine(te), V.mul(radial(te, th + twist), 1.0 * tailR(te) + 0.01));
    const mid = (tk + te) / 2;
    const rr = 0.52 * tailR(mid) * sz;
    parts.push(lock(root, tipPt, rr, { n: radial(mid, th + twist / 2), flat: 0.55, curl: 0.04, side: (R() - 0.5) * 0.08, prof: softTip, tip: 0.85, kind: 'tail' }));
  }
  // the flame tip: three tongues gathered from t 0.8, the middle one longest, rounded, the side ones swaying out and back in
  const base = 0.8;
  const tongues = [[0, 1.11, 0.032, 0], [1.0, 1.03, 0.026, 0.22], [-1.1, 1.0, 0.024, -0.25]];
  for (const [th, te, rr, sw] of tongues) {
    const root = V.add(meshSpine(base), V.mul(radial(base, th + Math.PI / 2), 0.35 * tailR(base)));
    const tipPt = V.add(meshSpine(te), V.mul(radial(Math.min(te, 0.99), th + Math.PI / 2), th === 0 ? 0 : 0.02));
    parts.push(lock(root, tipPt, rr, { n: radial(0.9, th + Math.PI / 2), flat: 0.7, curl: 0.05, side: sw, tip: 1, kind: 'flame' }));
  }
  return tree(parts, 0.016);
}

// ---------------------------------------------------------------------------------------------------------- the ears
const EAR_LEN = 0.155;
export function earFrame(s) {
  const base = [s * 0.062, 0.21, 0.127];
  const dir = V.norm([s * 0.36, 1, -0.1]);
  let n = V.norm([s * 0.3, 0.05, 1]); n = V.norm(V.sub(n, V.mul(dir, V.dot(n, dir))));
  return { base, dir, n, tip: V.add(base, V.mul(dir, EAR_LEN)) };
}
const earProf = (h) => Math.max(0.05, Math.pow(1 - h, 0.62) * (0.8 + 0.2 * ss(0, 0.3, h)));
function buildEar(s) {
  const { base, dir, n, tip } = earFrame(s);
  const a = V.sub(base, V.mul(dir, 0.012));
  let ear = lock(a, V.add(tip, V.mul(n, -0.004)), 0.046, { n, flat: 0.55, curl: -0.05, prof: earProf, tip: 1, kind: 'ear' });
  // the cup: a smaller leaf pressed into the front face
  const cupA = V.add(V.add(base, V.mul(dir, 0.016)), V.mul(n, 0.024));
  const cup = lock(cupA, V.add(V.add(base, V.mul(dir, EAR_LEN * 0.74)), V.mul(n, 0.016)), 0.031, { n, flat: 0.45, curl: -0.04, prof: earProf, tip: 0, kind: 'cup' });
  ear = ear.softCut(cup, 0.006);
  ear = ear.part(s > 0 ? 'earL' : 'earR', { mat: 'fur', paint: paintEar, blend: { from: 'dango_3', to: s > 0 ? 'dango_4' : 'dango_5', width: 0.034 } });
  // inner tufts: three white locks rising from the bottom of the cup and spilling over its outer rim
  const tufts = [];
  const side = V.norm([dir[1] * n[2] - dir[2] * n[1], dir[2] * n[0] - dir[0] * n[2], dir[0] * n[1] - dir[1] * n[0]]);
  for (const [o, len, rr, sd] of [[-0.5, 0.07, 0.012, -0.15], [0.3, 0.085, 0.013, 0.08]]) {
    const r0 = V.add(V.add(V.add(base, V.mul(dir, 0.014)), V.mul(n, 0.006)), V.mul(side, o * 0.012 * s));
    const r1 = V.add(V.add(V.add(r0, V.mul(dir, len)), V.mul(n, 0.012)), V.mul(side, (o * 0.012 + sd * 0.02) * s));
    tufts.push(lock(r0, r1, rr, { n, flat: 0.75, curl: 0.08, side: sd * s * 0.3, kind: 'inner' }));
  }
  // the glowing tip tuft
  tufts.push(lock(V.add(tip, V.mul(dir, -0.03)), V.add(V.add(tip, V.mul(dir, 0.03)), [s * 0.008, 0.004, -0.006]), 0.011, { n, flat: 0.75, curl: 0.15, kind: 'eartip' }));
  const tf = tree(tufts, 0.006).part(s > 0 ? 'tuftL' : 'tuftR', { mat: 'fur', paint: paintEar, blend: { from: 'dango_3', to: s > 0 ? 'dango_4' : 'dango_5', width: 0.034 } });
  return ear.softAdd(tf, 0.006);
}

// ---------------------------------------------------------------------------------------------------------- the eyes
// Same placement and size as the game's eyes (ellipsoid 0.029 x 0.037 x 0.018 at the eye bone, Euler XYZ (-0.08, ±0.42, 0)
// in radians), so the game's blink (eye bone scale.y -> 0.1) and look (eye bone yaw) work unchanged.
// revision 2: the open eye is 1.2x the game's old eye in each axis (~1.45x the area, reads ~1.3x at game distance)
export const EYE_K = 1.2;
const EYE_R = [0.029 * EYE_K, 0.037 * EYE_K, 0.018 * EYE_K];
function eyeRot(s) { // three.js Euler 'XYZ': M = Rx * Ry * Rz ; rows of M (world = M * local)
  const ax = -0.08, ay = s * 0.42, cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
  // Rx * Ry
  return [[cy, 0, sy], [sx * sy, cx, -sx * cy], [-cx * sy, sx, cx * cy]];
}
export function eyeLocal(s, x, y, z) {
  const c = BONE_POS[s > 0 ? 6 : 7], M = eyeRot(s), p = [x - c[0], y - c[1], z - c[2]];
  // local = M^T p
  return [(M[0][0] * p[0] + M[1][0] * p[1] + M[2][0] * p[2]) / EYE_R[0], (M[0][1] * p[0] + M[1][1] * p[1] + M[2][1] * p[2]) / EYE_R[1], (M[0][2] * p[0] + M[1][2] * p[1] + M[2][2] * p[2]) / EYE_R[2]];
}
function eyeShape(s, grow = 1) {
  const c = BONE_POS[s > 0 ? 6 : 7];
  const f = (x, y, z) => { const l = eyeLocal(s, x, y, z); const k = Math.hypot(l[0], l[1], l[2]) / grow; return (k - 1) * EYE_R[2] * grow * 0.95; };
  const m = 0.04;
  return new P.Shape(f, [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m]);
}
function lidShape(s) {
  const c = BONE_POS[s > 0 ? 6 : 7], K = [0.9, 0.42, 0.88];
  const f = (x, y, z) => { const l = eyeLocal(s, x, y, z); return (Math.hypot(l[0] / K[0], l[1] / K[1], l[2] / K[2]) - 1) * EYE_R[2] * K[2] * 0.9; };
  const m = 0.04;
  return new P.Shape(f, [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m]);
}
/** the game's eye paint, in the eye's own unit frame: [r,g,b] sRGB and glow */
export function eyePaint(s, x, y, z) {
  const l = eyeLocal(s, x, y, z), k = Math.hypot(...l) || 1, d = [l[0] / k, l[1] / k, l[2] / k];
  if (d[2] < 0.15) return { col: COL.rim, glow: 0 };
  const X = d[0], Y = d[1], rho = Math.hypot(X, Y * 0.95);
  // clear amber iris (deeper at the top, bright at the bottom), a big round black pupil, a thin dark rim, ONE hard catch-light
  let col = P.mix(COL.irisTop, COL.irisLow, ss(0.55, -0.6, Y));
  let gl = ss(-0.1, -0.7, Y) * 0.3;
  col = P.mix(col, COL.pupil, ss(0.44, 0.4, Math.hypot(X, Y + 0.04)));
  col = P.mix(col, COL.rim, ss(0.86, 0.92, rho));
  // the catch-light sits on the pupil's upper rim, toward the light (same side on both eyes: light from her upper left)
  const h1 = Math.hypot(X - 0.36, Y - 0.42);
  const hl = ss(0.16, 0.13, h1);
  col = P.mix(col, COL.white, hl); gl = Math.max(gl, hl);
  return { col, glow: gl };
}

// ---------------------------------------------------------------------------------------------------------- colours
const C = (h) => P.color(h);
const COL = {
  cream: C('#ffe4c2'), warm: C('#ffab5c'), warmDeep: C('#f08a40'), white: C('#fffaf2'), belly: C('#fff6ea'),
  earBack: C('#b8562c'), earTip: C('#7e3420'), inner: C('#ffc2b0'), innerDeep: C('#f09a8a'), paw: C('#a8542c'),
  nose: C('#4a2418'), blush: C('#ffa898'), gold: C('#ffd88a'), pale: C('#fff2cf'), under: C('#ffd8a6'), tipW: C('#fff3da'),
  pupil: [0.03, 0.015, 0.01], irisTop: [0.72, 0.33, 0.07], irisLow: [1.0, 0.74, 0.3], rim: [0.2, 0.08, 0.03],
};
COL.white.length; // (keep linters quiet)

/** body fur: cream sides, a warm saddle along the back, white chest / belly / under-jaw, darker socks on the paws */
function paintFur(c) {
  const { x, y, z, ny, nz } = c;
  let col = COL.cream;
  // warm saddle: back of the body, crown of the head, top of the tail (fades toward the tip)
  const tp = tailParam(x, y, z);
  const onTail = tp.d < 0.13 && tp.t > 0.02 && z < -0.06;
  const top = ss(-0.05, 0.75, ny);
  if (onTail) {
    const { N } = tailFrame(clamp(tp.t, 0, 1));
    const up = ((x * 0) + (c.nx * 0) + (c.ny * N[1] + c.nz * N[2]));
    col = P.mix(COL.under, col, ss(-0.5, 0.0, up));                                                     // warm cream underside
    col = P.mix(col, COL.warm, ss(-0.05, 0.6, up) * (1 - ss(0.45, 0.7, tp.t)) * 0.9);
    col = P.mix(col, COL.warmDeep, ss(0.35, 0.9, up) * ss(0.1, 0.3, tp.t) * (1 - ss(0.4, 0.6, tp.t)) * 0.4);
    col = P.mix(col, COL.tipW, ss(0.6, 0.82, tp.t));
    col = P.mix(col, COL.pale, ss(0.95, 1.08, tp.t) * 0.8);
  } else {
    col = P.mix(col, COL.warm, top * ss(-0.12, 0.04, -z + 0.05) * 0.95);          // back of body
    col = P.mix(col, COL.warm, ss(0.22, 0.27, y) * ss(0.1, 0.8, ny) * ss(0.24, 0.16, z) * 0.85); // crown (between the ears)
    col = P.mix(col, COL.warmDeep, top * ss(0.0, -0.08, z) * ss(0.05, 0.1, y) * 0.35);
    // white: chest, belly, under the jaw and the muzzle sides
    const chest = ss(0.03, 0.09, z) * ss(0.16, 0.08, y) * ss(0.3, -0.3, ny);
    const belly = ss(0.05, -0.4, ny);
    const jaw = ss(0.1, 0.13, y) < 1 ? ss(0.16, 0.2, z) * ss(0.14, 0.1, y) : 0;
    col = P.mix(col, COL.belly, Math.max(chest, belly * 0.9, jaw));
    // blush under each eye
    // blush: a clean oval under each eye (hard-ish edge, flat inside) — a shape, not a stain
    for (const s of [-1, 1]) { const q = Math.hypot((x - s * 0.08) / 1.25, y - 0.112, (z - 0.205) / 1.25); col = P.mix(col, COL.blush, ss(0.018, 0.015, q) * 0.85); }
  }
  // lock tips lighten (light leaking through the fur)
  const lp = lockParam(x, y, z, ['fur', 'tail']);
  if (lp.h > 0) col = P.mix(col, COL.pale, ss(0.6, 1, lp.h) * 0.35);
  return col;
}
/** closed-eye lid (only seen while blinking / asleep): warm cream, a soft dark lash line along the slit, rosy below */
function paintLid(c) {
  const s = c.x >= 0 ? 1 : -1, l = eyeLocal(s, c.x, c.y, c.z);
  if (Math.hypot(l[0] / 0.9, l[1] / 0.42, l[2] / 0.88) > 1.08) return paintFur(c);  // not on the lid lens
  let col = P.mix(COL.cream, COL.warm, 0.18);
  col = P.mix(col, COL.blush, ss(-0.1, -0.35, l[1]) * 0.35);
  return P.mix(col, COL.rim, ss(0.22, 0.06, Math.abs(l[1] + 0.03)) * ss(0.2, 0.6, l[2]) * 0.85);
}
function paintRuff(c) {
  const lp = lockParam(c.x, c.y, c.z, ['ruff']);
  let col = P.mix(COL.belly, COL.white, 0.6);
  if (lp.h > 0) col = P.mix(col, COL.pale, ss(0.7, 1, lp.h) * 0.4);
  return P.mix(col, COL.cream, ss(0.15, 0.4, c.cavity) * 0.6);
}
function paintMuzzle(c) {
  // clean white muzzle with a crisp cream bridge on top (a shape with an edge, not a soft stain)
  const { y, ny } = c;
  return P.mix(COL.white, P.mix(COL.cream, COL.warm, 0.15), ss(0.5, 0.58, ny) * ss(0.135, 0.145, y));
}
function paintNose(c) {
  // dark wet nose with one hard highlight on the upper front
  const k = c.ny * 0.62 + c.nz * 0.78 + c.nx * 0.0;
  return P.mix(COL.nose, COL.white, ss(0.95, 0.99, k) * 0.8);
}
function paintEar(c) {
  const { x, y, z, nx, ny, nz } = c, s = x >= 0 ? 1 : -1;
  const { base, dir, n } = earFrame(s);
  const h = clamp(V.dot(V.sub([x, y, z], base), dir) / EAR_LEN, 0, 1.3);
  const front = nx * n[0] + ny * n[1] + nz * n[2];
  const lp = lockParam(x, y, z, ['inner', 'eartip']);
  if (lp.kind === 'inner') return P.mix(COL.white, COL.pale, ss(0.6, 1, lp.h) * 0.5);
  if (lp.kind === 'eartip') return P.mix(COL.earTip, COL.pale, ss(0.45, 0.95, lp.h));
  // back of the ear: deep rust, darker to the tip; front rim cream; the cup rosy
  let col = P.mix(COL.warmDeep, COL.earBack, ss(0.1, 0.5, h));
  col = P.mix(col, COL.earTip, ss(0.62, 0.85, h));
  const cup = c.cavity > 0.05 || front > 0.55;
  if (front > 0.15) {
    let fc = P.mix(COL.cream, COL.inner, ss(0.35, 0.8, front) * (1 - ss(0.75, 0.9, h)));
    if (cup) fc = P.mix(fc, COL.innerDeep, ss(0.75, 1, front) * 0.5);
    fc = P.mix(fc, COL.earTip, ss(0.7, 0.88, h));
    col = P.mix(col, fc, ss(0.15, 0.4, front));
  }
  return P.mix(col, COL.cream, ss(0.12, 0.0, h) * 0.6);
}
function paintPaw(c) { return P.mix(COL.cream, COL.paw, ss(-0.055, -0.085, c.y) * 0.9); }

// ---------------------------------------------------------------------------------------------------------- the body
function buildBody() {
  // torso: an egg tipped forward, a clear chest in front, two haunches behind, a soft waist between
  let torso = P.ellipsoid([0.098, 0.09, 0.116]).turn(-8, 0, 0).at(0, -0.002, -0.01);
  torso = torso.softAdd(P.ellipsoid([0.08, 0.082, 0.066]).turn(18, 0, 0).at(0, 0.02, 0.074), 0.035);                 // chest
  torso = torso.softAdd(P.ellipsoid([0.056, 0.066, 0.07]).turn(-10, 0, 8).at(0.05, -0.016, -0.062).mirror('x'), 0.035); // haunches
  torso = torso.pinch([0, -0.085, 0.0], 0.05, 0.008);                                                                // tuck the belly
  // neck rising to the head
  torso = torso.softAdd(P.taperedCapsule([0, 0.03, 0.06], [0, 0.115, 0.125], 0.066, 0.06), 0.045);
  // flank and shoulder locks (a few, big, flowing back) + the haunch flicks
  const R = rng(5), fur = [];
  for (const s of [1, -1]) {
    fur.push(lock([s * 0.06, 0.035, 0.03], [s * 0.088, 0.0, -0.045], 0.03, { n: [s, 0.4, 0], flat: 0.5, curl: 0.12, side: -0.05 * s, kind: 'fur' }));
    fur.push(lock([s * 0.07, -0.02, -0.035], [s * 0.09, -0.06, -0.1], 0.028, { n: [s, -0.2, -0.2], flat: 0.5, curl: 0.15, kind: 'fur' }));
    fur.push(lock([s * 0.045, 0.06, -0.03], [s * 0.05 + s * R() * 0.01, 0.05, -0.1], 0.026, { n: [s * 0.4, 1, 0], flat: 0.45, curl: 0.12, kind: 'fur' }));
  }
  let body = torso.softAdd(tree(fur, 0.01), 0.018).part('fur', { mat: 'fur', paint: paintFur });
  // chest ruff: a bib of white locks hanging from under the chin, the middle one longest
  const ruff = [];
  // revision 2: four big rounded locks, not seven small teeth — one long off-centre (to her left), one medium, two small
  const rr = [[0.008, 0.1, 0.13, 0.012, -0.038, 0.158, 0.042], [-0.04, 0.095, 0.118, -0.05, -0.012, 0.146, 0.034],
    [0.058, 0.09, 0.1, 0.074, 0.006, 0.12, 0.026], [-0.068, 0.088, 0.098, -0.08, 0.02, 0.112, 0.022]];
  for (const [x0, y0, z0, x1, y1, z1, r] of rr) ruff.push(lock([x0, y0, z0], [x1, y1, z1], r, { n: [x0 * 4, 0, 1], flat: 0.62, curl: 0.08, side: x0 * 1.2, prof: softTip, kind: 'ruff' }));
  ruff.push(P.ellipsoid([0.064, 0.064, 0.046]).turn(15, 0, 0).at(0, 0.042, 0.116));
  body = body.softAdd(tree(ruff, 0.008).part('ruff', { mat: 'fur', paint: paintRuff }), 0.012);
  // paws, tucked: front pair folded under the chest, hind pair under the haunches
  const paws = [];
  for (const s of [1, -1]) {
    paws.push(P.taperedCapsule([s * 0.034, -0.058, 0.07], [s * 0.034, -0.077, 0.118], 0.02, 0.016).softAdd(P.ellipsoid([0.017, 0.012, 0.02]).at(s * 0.033, -0.08, 0.126), 0.01));
    paws.push(P.taperedCapsule([s * 0.062, -0.055, -0.07], [s * 0.06, -0.084, -0.022], 0.024, 0.018).softAdd(P.ellipsoid([0.019, 0.013, 0.024]).at(s * 0.058, -0.089, -0.012), 0.01));
  }
  body = body.softAdd(tree(paws, 0).part('paw', { mat: 'fur', paint: paintPaw }), 0.016);
  return body;
}

function buildHead() {
  const HC = [0, 0.156, 0.148];
  // skull: round, a little wider at the cheeks, the brow over the eyes
  let skull = P.ellipsoid([0.1, 0.09, 0.108]).at(HC[0], HC[1], HC[2] - 0.003);
  skull = skull.softAdd(P.ellipsoid([0.095, 0.075, 0.075]).at(0, 0.155, 0.171), 0.03);              // the face plane the eyes sit in
  skull = skull.softAdd(P.ellipsoid([0.094, 0.056, 0.076]).at(0, 0.122, 0.158), 0.03);             // cheeks
  skull = skull.bulge([0.046, 0.205, 0.215], 0.03, 0.006).bulge([-0.046, 0.205, 0.215], 0.03, 0.006);
  // forelock: a single swept lock off the crown, falling to her right (asymmetric), and a smaller one beside it
  const fl = [lock([0.004, 0.236, 0.128], [0.03, 0.222, 0.2], 0.024, { n: [0, 1, 0.45], flat: 0.38, curl: 0.05, side: 0.1, prof: softTip, kind: 'fur' }),
    lock([-0.016, 0.234, 0.134], [-0.03, 0.222, 0.182], 0.015, { n: [0, 1, 0.45], flat: 0.38, curl: 0.04, side: -0.08, prof: softTip, kind: 'fur' })];
  skull = skull.softAdd(tree(fl, 0.006), 0.012);
  let head = skull.part('fur', { mat: 'fur', paint: paintFur });
  // muzzle: short and fine, pointing a little down; white
  const muzzle = P.taperedCapsule([0, 0.133, 0.21], [0, 0.127, 0.292], 0.034, 0.013).softAdd(P.ellipsoid([0.03, 0.02, 0.04]).at(0, 0.112, 0.235), 0.02)
    .part('muzzle', { mat: 'fur', paint: paintMuzzle, bone: 'dango_3' });
  head = head.softAdd(muzzle, 0.03);
  // a small smile under the muzzle
  const nose = P.ellipsoid([0.015, 0.0105, 0.0115]).turn(-12, 0, 0).at(0, 0.137, 0.296).part('nose', { mat: 'fur', paint: paintNose, bone: 'dango_3' });
  head = head.softAdd(nose, 0.006);
  // cheek ruffs: three white locks a side sweeping out, down and back from the jaw
  const ck = [];
  for (const s of [1, -1]) {
    ck.push(lock([s * 0.06, 0.112, 0.17], [s * 0.134, 0.084, 0.122], 0.031, { n: [s, -0.1, 0.35], flat: 0.55, curl: 0.1, side: -0.05, kind: 'ruff' }));
    ck.push(lock([s * 0.068, 0.134, 0.135], [s * 0.134, 0.126, 0.078], 0.026, { n: [s, 0.25, 0], flat: 0.55, curl: 0.1, kind: 'ruff' }));
  }
  head = head.softAdd(tree(ck, 0.006).part('ruff', { mat: 'fur', paint: paintRuff }), 0.012);
  // eyes: hard-joined so they stay crisp, each rigid on its eye bone (the game scales them to blink)
  // eye sockets: the eye volume is carved out of the face (a dish of lid fur); the eyes themselves are separate glossy shells
  // appended by `post` exactly like the game's (so the game's blink squashes them flat into this dish)
  for (const s of [1, -1]) head = head.softCut(eyeShape(s, 1.0), 0.004);
  // closed-eye lids: a flat lens of fur inside each eye volume (hidden while the eye is open, even turned +-0.3 rad); when the
  // game squashes the eye bone to y 0.1 the socket is no longer an empty dish but a soft lid with the eye's dark slit across it
  const lids = [1, -1].map((s) => lidShape(s));
  head = head.add(P.union(...lids).part('lid', { mat: 'fur', paint: paintLid, bone: 'dango_3' }));
  return head;
}

export default {
  name: 'dango', id: 'sculpt_dango',
  rig: { file: RIG },
  rigCredit: 'the game\'s own 17-bone dango skeleton (companion.js BONE_POS), test clips hand-authored',
  voxel: 0.0021,
  lods: [7200],      // + 2 x 936 eye triangles appended by `post` = ~9070
  ground: null,
  aoRange: 0.04,
  cavity: [0.003, 0.012],
  cavityDark: 0.1,
  aoStrength: 0.16,   // revision 2: overlapping tail locks baked the underside grey; the game's cel light shades it anyway
  creaseAngle: 80,
  hardAngle: 70,
  bandSlack: 0.012,
  weights: { smooth: 4, smoothAlpha: 0.5 },
  poses: [['curl', 1], ['curl', 0.5], ['scurve', 1], ['lookback', 1], ['wag', 1], ['blink', 1]],
  notes: 'Sculpted body for 团子 on the game\'s own dango skeleton (17 joints dango_0..16, rest = BONE_POS). One skinned mesh, vertex colours (A = tip mask), TEXCOORD_0 x = glow ramp, y = tip mask. Material DangoFur.',
  build() {
    LOCKS.length = 0;
    const body = buildBody();
    const head = buildHead();
    const tail = buildTail().part('tail', { mat: 'fur', paint: paintFur });
    const ears = buildEar(1).add(buildEar(-1));
    return body.softAdd(head, 0.035).softAdd(tail, 0.03).softAdd(ears, 0.014);
  },
};

// =========================================================================================== CLI: rig GLB / post-process
const ROLE = typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('dango.mjs') ? process.argv[2] : null;
if (ROLE === 'rig') writeRig().catch((e) => { console.error(e); process.exit(1); });
if (ROLE === 'post') postProcess().catch((e) => { console.error(e); process.exit(1); });

// ---- poses (bone Euler 'YXZ' [x, y, z] as companion.js rotB, eye scale) ------------------------------------------------
function posesDef() {
  const tail = (f) => Object.fromEntries(Array.from({ length: TAILN }, (_, i) => [8 + i, f(i)]));
  return {
    curl: { 1: [0.1, 0.25, 0], 2: [0.1, 0, 0], 3: [-0.35, 1.0, 0.35], 4: [-0.28, 0, -0.6], 5: [-0.28, 0, 0.6], scale: { 6: [1, 0.1, 1], 7: [1, 0.1, 1] }, ...tail(() => [-0.1, 0.42, 0]), 15: [0.3, 0, 0], 16: [-0.2, 0, 0] },
    scurve: { 3: [0.1, -0.4, 0.1], ...tail((i) => [-0.08, [0.4, 0.38, 0.15, -0.35, -0.5, -0.4, -0.2][i], 0]) },
    lookback: { 1: [0, 0.25, 0], 3: [-0.3, 1.05, 0.22], 4: [-1.05, 0, -0.3], 5: [-1.05, 0, 0.3], scale: { 6: [1.14, 1.14, 1], 7: [1.14, 1.14, 1] }, ...tail(() => [0.06, 0.2, 0]) },
    wag: { 3: [0.07, 0.3, 0.18], ...tail((i) => [-0.26 + Math.sin(i * 0.8) * 0.05, 0.3 * Math.sin(-i * 0.9 + 1.2), 0]), 15: [0.35, 0, 0], 16: [-0.35, 0, 0] },
    blink: { 3: [0.35, 0, 0.1], 4: [-0.3, 0, -0.64], 5: [-0.3, 0, 0.64], scale: { 6: [1, 0.1, 1], 7: [1, 0.1, 1] }, ...tail(() => [0.12, 0, 0]) },
  };
}

async function writeRig() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const THREE = await import('three');
  const { Document, NodeIO } = await import('@gltf-transform/core');
  const old = await buildOldFox(THREE);
  const doc = new Document(), buf = doc.createBuffer();
  const scene = doc.createScene('dango');
  const holder = doc.createNode('dangoBody'); scene.addChild(holder);
  const meshNode = doc.createNode('Dango'); holder.addChild(meshNode);
  const bones = BONE_POS.map((b, i) => doc.createNode('dango_' + i));
  BONE_POS.forEach((b, i) => {
    if (b[3] < 0) { bones[i].setTranslation([b[0], b[1], b[2]]); meshNode.addChild(bones[i]); return; }
    const p = BONE_POS[b[3]]; bones[i].setTranslation([b[0] - p[0], b[1] - p[1], b[2] - p[2]]); bones[b[3]].addChild(bones[i]);
  });
  const ibm = new Float32Array(17 * 16);
  BONE_POS.forEach((b, i) => { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b[0], -b[1], -b[2], 1], i * 16); });
  const skin = doc.createSkin('dango').setSkeleton(bones[0]).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
  for (const b of bones) skin.addJoint(b);
  const mat = doc.createMaterial('DangoFur').setBaseColorFactor([1, 1, 1, 1]);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(old.pos).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(old.nrm).setBuffer(buf))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(old.col).setBuffer(buf))
    .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(old.J).setBuffer(buf))
    .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(old.W).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(old.idx).setBuffer(buf)).setMaterial(mat);
  meshNode.setMesh(doc.createMesh('Dango').addPrimitive(prim)).setSkin(skin);
  // test clips: rest at t 0 -> pose at t 1
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [name, def] of Object.entries(posesDef())) {
    const anim = doc.createAnimation(name);
    const times = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buf);
    for (const [k, v] of Object.entries(def)) {
      if (k === 'scale') continue;
      e.set(v[0], v[1], v[2], 'YXZ'); q.setFromEuler(e);
      const s = doc.createAnimationSampler().setInput(times).setOutput(doc.createAccessor().setType('VEC4').setArray(new Float32Array([0, 0, 0, 1, q.x, q.y, q.z, q.w])).setBuffer(buf)).setInterpolation('LINEAR');
      anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(bones[+k]).setTargetPath('rotation').setSampler(s));
    }
    for (const [k, v] of Object.entries(def.scale || {})) {
      const s = doc.createAnimationSampler().setInput(times).setOutput(doc.createAccessor().setType('VEC3').setArray(new Float32Array([1, 1, 1, ...v])).setBuffer(buf)).setInterpolation('LINEAR');
      anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(bones[+k]).setTargetPath('scale').setSampler(s));
    }
  }
  fs.mkdirSync(path.dirname(RIG), { recursive: true });
  await new NodeIO().write(RIG, doc);
  console.log('wrote', RIG, old.pos.length / 3, 'verts (current body)');
}

/** the game's current body (companion.js buildFoxSpirit, ported verbatim in its maths) for the weight transfer + before sheet */
async function buildOldFox(THREE) {
  const BGU = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  const B = { root: 0, body: 1, chest: 2, head: 3, earL: 4, earR: 5, eyeL: 6, eyeR: 7, tail: 8, pawF: 15, pawH: 16 };
  const OC = { cream: [1.0, 0.88, 0.72], back: [1.0, 0.64, 0.32], belly: [1.0, 0.985, 0.95], white: [1, 1, 0.98], inner: [1.0, 0.72, 0.64], innerDeep: [0.93, 0.55, 0.5], amber: [0.98, 0.5, 0.2], gold: [1.0, 0.76, 0.32], pale: [1.0, 0.95, 0.78], nose: [0.3, 0.14, 0.1], pupil: [0.1, 0.04, 0.03], irisTop: [0.36, 0.17, 0.06], irisLow: [1.0, 0.68, 0.26], rim: [0.18, 0.08, 0.04], blush: [1.0, 0.66, 0.6], paw: [1.0, 0.7, 0.4] };
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const sstep = ss;
  function partGeo(Pp, N, Cc, U, SI, SW, I, computeN) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3));
    for (let i = 0; i < Cc.length; i++) Cc[i] = Math.pow(Cc[i], 2.2);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.setIndex(I);
    if (computeN) g.computeVertexNormals(); else g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    return g;
  }
  const _eq = new THREE.Quaternion(), _ev = new THREE.Vector3(), _en = new THREE.Vector3();
  function ellipsoid(c, r, e, ws, hs, paint, bone) {
    const Pp = [], N = [], Cc = [], U = [], SI = [], SW = [], I = [];
    _eq.setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    for (let j = 0; j <= hs; j++) {
      const v = j / hs, th = v * Math.PI;
      for (let i = 0; i <= ws; i++) {
        const u = i / ws, ph = u * Math.PI * 2;
        const dx = Math.sin(th) * Math.sin(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.cos(ph);
        _ev.set(dx * r[0], dy * r[1], dz * r[2]).applyQuaternion(_eq);
        _en.set(dx / r[0], dy / r[1], dz / r[2]).normalize().applyQuaternion(_eq);
        const px = c[0] + _ev.x, py = c[1] + _ev.y, pz = c[2] + _ev.z;
        Pp.push(px, py, pz); N.push(_en.x, _en.y, _en.z);
        const k = paint([dx, dy, dz], [px, py, pz], _en);
        Cc.push(k[0], k[1], k[2]); U.push(k[3] ?? 0.1, 0.5);
        const w = typeof bone === 'function' ? bone([px, py, pz]) : [[bone, 1]];
        SI.push(w[0][0], w[1]?.[0] ?? 0, 0, 0); SW.push(w[0][1], w[1]?.[1] ?? 0, 0, 0);
      }
    }
    for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) { const a = j * (ws + 1) + i, b = a + ws + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
    return partGeo(Pp, N, Cc, U, SI, SW, I, false);
  }
  const _T = new THREE.Vector3(), _Bv = new THREE.Vector3(), _Nv = new THREE.Vector3(), _ref = new THREE.Vector3();
  function sweep(spine, rad, rings, segs, ref, paint, bone) {
    const Pp = [], Cc = [], U = [], SI = [], SW = [], I = [];
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      const a = spine(Math.max(0, t - 0.01)), b = spine(Math.min(1, t + 0.01)), c = spine(t);
      _T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); _ref.set(ref[0], ref[1], ref[2]);
      _Bv.crossVectors(_T, _ref).normalize(); _Nv.crossVectors(_Bv, _T).normalize();
      for (let i = 0; i < segs; i++) {
        const th = (i / segs) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
        const [rx, ry] = rad(t, th);
        const px = c[0] + _Bv.x * ct * rx + _Nv.x * st * ry, py = c[1] + _Bv.y * ct * rx + _Nv.y * st * ry, pz = c[2] + _Bv.z * ct * rx + _Nv.z * st * ry;
        Pp.push(px, py, pz);
        const k = paint(t, ct, st, [px, py, pz]);
        Cc.push(k[0], k[1], k[2]); U.push(k[3] ?? 0.1, 0.5);
        const w = typeof bone === 'function' ? bone(t) : [[bone, 1]];
        SI.push(w[0][0], w[1]?.[0] ?? 0, 0, 0); SW.push(w[0][1], w[1]?.[1] ?? 0, 0, 0);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) { const a = j * segs + i, b = j * segs + ((i + 1) % segs), c = a + segs, d = b + segs; I.push(a, c, b, b, c, d); }
    return partGeo(Pp, null, Cc, U, SI, SW, I, true);
  }
  const parts = [];
  const COLo = OC;
  const furPaint = (glow0) => (d, p, n) => { const up = n.y; let col = mix3(COLo.cream, COLo.back, sstep(0.05, 0.75, up)); col = mix3(col, COLo.belly, sstep(0.0, -0.6, up)); return [...col, glow0]; };
  parts.push(ellipsoid([0, 0.0, -0.005], [0.098, 0.092, 0.128], [-0.12, 0, 0], 28, 20, furPaint(0.14), (p) => (p[2] > 0.06 ? [[B.chest, 0.6], [B.body, 0.4]] : [[B.body, 1]])));
  parts.push(ellipsoid([0, 0.03, 0.085], [0.074, 0.08, 0.06], [0.25, 0, 0], 22, 16, () => [...COLo.belly, 0.16], B.chest));
  for (const s of [-1, 0, 1]) { const o = [s * 0.034, -0.025, 0.11]; parts.push(sweep((t) => [o[0] + s * 0.008 * t, o[1] - 0.032 * t, o[2] + 0.01 * t - 0.012 * t * t], (t) => { const r = 0.032 * Math.pow(Math.max(0, 1 - t * t), 0.5); return [r, r * 0.8]; }, 6, 10, [0, 0, 1], () => [...COLo.belly, 0.16], B.chest)); }
  for (const s of [-1, 1]) {
    parts.push(ellipsoid([s * 0.044, -0.082, 0.075], [0.026, 0.03, 0.038], [0.3, 0, 0], 12, 10, (d) => [...mix3(COLo.cream, COLo.paw, sstep(0.0, -0.8, d[1])), 0.16], B.pawF));
    parts.push(ellipsoid([s * 0.054, -0.066, -0.05], [0.027, 0.027, 0.04], [0.2, 0, 0], 12, 10, (d) => [...mix3(COLo.cream, COLo.paw, sstep(0.0, -0.8, d[1])), 0.16], B.pawH));
  }
  const HC = [0, 0.152, 0.15];
  parts.push(ellipsoid(HC, [0.118, 0.104, 0.108], [0, 0, 0], 32, 24, (d, p) => {
    let col = mix3(COLo.cream, COLo.back, sstep(0.2, 0.9, d[1]) * 0.9 * sstep(0.75, 0.2, d[2]));
    const low = sstep(0.1, -0.5, d[1]) * sstep(0.2, 0.8, d[2]);
    col = mix3(col, COLo.belly, Math.min(1, low * 1.4 + sstep(-0.1, -0.7, d[1]) * 0.8));
    for (const s of [-1, 1]) { const q = Math.hypot(p[0] - s * 0.073, p[1] - 0.128, p[2] - 0.222); col = mix3(col, COLo.blush, sstep(0.03, 0.012, q) * 0.7); }
    return [...col, 0.15];
  }, B.head));
  parts.push(ellipsoid([0, 0.118, 0.238], [0.05, 0.04, 0.058], [0.18, 0, 0], 18, 12, () => [...COLo.belly, 0.16], B.head));
  parts.push(ellipsoid([0, 0.134, 0.294], [0.017, 0.013, 0.012], [0, 0, 0], 10, 8, () => [...COLo.nose, 0], B.head));
  for (const s of [-1, 1]) {
    parts.push(ellipsoid([s * 0.088, 0.112, 0.17], [0.042, 0.036, 0.04], [0, s * 0.5, s * -0.35], 14, 10, () => [...COLo.belly, 0.16], B.head));
    parts.push(ellipsoid([s * 0.1, 0.098, 0.128], [0.03, 0.028, 0.032], [0, s * 0.6, s * -0.5], 12, 8, () => [...COLo.belly, 0.16], B.head));
  }
  parts.push(sweep((t) => [0.004 * t, 0.245 + 0.03 * t - 0.012 * t * t, 0.16 + 0.055 * t - 0.01 * t * t], (t) => { const r = 0.03 * Math.pow(1 - t, 0.8); return [r, r * 0.55]; }, 6, 10, [0, 0, 1], (t) => [...mix3(COLo.back, COLo.gold, t), 0.16], B.head));
  for (const [s, bone] of [[1, B.earL], [-1, B.earR]]) {
    const base = [s * 0.064, 0.208, 0.128];
    const dir = new THREE.Vector3(s * 0.38, 1, -0.12).normalize();
    const L = 0.15;
    const sp = (t) => [base[0] + dir.x * L * t + s * 0.01 * t * t, base[1] + dir.y * L * t, base[2] + dir.z * L * t - 0.012 * t * t];
    parts.push(sweep(sp, (t) => { const w = 0.068 * Math.pow(Math.max(0, 1 - t), 0.85) * (0.8 + 0.2 * sstep(0, 0.25, t)); return [w, w * 0.4]; }, 12, 16, [0, 0, 1], (t, ct, st) => {
      let col = mix3(COLo.cream, COLo.amber, sstep(0.55, 0.95, t));
      const front = sstep(0.15, 0.6, st) * sstep(0.85, 0.5, t) * sstep(0.95, 0.4, Math.abs(ct));
      col = mix3(col, mix3(COLo.inner, COLo.innerDeep, sstep(0.6, 1, st) * 0.6), front);
      return [...col, 0.15];
    }, bone));
    const tip = sp(0.9);
    parts.push(sweep((t) => [tip[0] + s * 0.014 * t, tip[1] + 0.034 * t, tip[2] - 0.012 * t * t], (t) => { const r = 0.014 * Math.pow(1 - t, 0.6); return [r, r * 0.75]; }, 5, 8, [0, 0, 1], (t) => [...mix3(COLo.amber, COLo.pale, t), 0.4], bone));
  }
  for (const [s, bone] of [[1, B.eyeL], [-1, B.eyeR]]) {
    const c = BONE_POS[bone];
    parts.push(ellipsoid([c[0], c[1], c[2]], [0.029, 0.037, 0.018], [-0.08, s * 0.42, 0], 28, 22, (d) => {
      if (d[2] < 0.15) return [...COLo.rim, 0];
      const x = d[0], y = d[1], rho = Math.hypot(x, y * 0.95);
      let col = mix3(COLo.irisTop, COLo.irisLow, sstep(0.45, -0.75, y));
      col = mix3(col, COLo.pupil, sstep(0.5, 0.36, Math.hypot(x, y + 0.05)));
      col = mix3(col, COLo.rim, sstep(0.8, 0.93, rho));
      const h1 = Math.hypot(x - 0.28, y - 0.4), h2 = Math.hypot(x + 0.3, y + 0.42);
      col = mix3(col, COLo.white, Math.max(sstep(0.27, 0.17, h1), sstep(0.13, 0.07, h2) * 0.9));
      return [...col, 0];
    }, bone));
  }
  const tw = (t) => Math.min(TAILN - 1e-4, t * TAILN);
  parts.push(sweep(tailSpine, (t, th) => {
    let r = 0.088 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.78))), 0.62);
    r = Math.max(r, 0.034 * (1 - t / 0.35));
    r *= 1 + 0.26 * Math.sin(3 * th + t * 11) * sstep(0.35, 0.9, t);
    return [r, r * 0.92];
  }, 34, 18, [0, 1, 0], (t, ct, st) => {
    let col = mix3(COLo.cream, COLo.back, sstep(0.1, 0.9, st) * 0.6 * (1 - sstep(0.4, 0.6, t)));
    col = mix3(col, COLo.white, sstep(0.48, 0.62, t)); col = mix3(col, COLo.gold, sstep(0.66, 0.84, t)); col = mix3(col, COLo.pale, sstep(0.93, 1.0, t));
    return [...col, 0.15];
  }, (t) => { const s = tw(t), i = Math.floor(s), f = s - i; return i + 1 < TAILN ? [[B.tail + i, 1 - f], [B.tail + i + 1, f]] : [[B.tail + i, 1]]; }));
  const geo = BGU.mergeGeometries(parts, false);
  const g = (n) => geo.attributes[n].array;
  return { pos: Float32Array.from(g('position')), nrm: Float32Array.from(g('normal')), col: Float32Array.from(g('color')), J: Uint16Array.from(g('skinIndex')), W: Float32Array.from(g('skinWeight')), idx: Uint32Array.from(geo.index.array) };
}

// ---- post: tip mask into COLOR_0.a, glow + tip into TEXCOORD_0 ----------------------------------------------------------
export function tipAndGlow(x, y, z, partName) {
  if (partName === 'eyeL' || partName === 'eyeR') { const e = eyePaint(partName === 'eyeL' ? 1 : -1, x, y, z); return { tip: 0, glow: e.glow }; }
  if (partName === 'nose') return { tip: 0, glow: 0 };
  let tip = 0, glow = 0.15;
  const lp = lockParam(x, y, z);
  if (lp.h > 0) {
    const k = lp.kind === 'eartip' || lp.kind === 'flame' ? ss(0.35, 0.85, lp.h) : lp.kind === 'inner' ? ss(0.65, 1, lp.h) * 0.8 : ss(0.72, 1, lp.h) * 0.75;
    tip = Math.max(tip, k);
  }
  if (partName === 'earL' || partName === 'earR' || partName === 'tuftL' || partName === 'tuftR') {
    const s = x >= 0 ? 1 : -1, { base, dir } = earFrame(s);
    const h = V.dot(V.sub([x, y, z], base), dir) / EAR_LEN;
    tip = Math.max(tip, ss(0.68, 0.9, h));
    glow = Math.max(glow, 0.15 + ss(0.6, 1, h) * 0.3);
  }
  const tp = tailParam(x, y, z);
  if (tp.d < 0.14 && z < -0.05) {
    tip = Math.max(tip, ss(0.8, 0.95, tp.t));
    glow = Math.max(glow, 0.15 + ss(0.5, 0.82, tp.t) * 0.45 + ss(0.88, 1.06, tp.t) * 0.32);
  }
  if (lp.kind === 'eartip') glow = Math.max(glow, 0.4 + lp.h * 0.4);
  return { tip: clamp(tip, 0, 1), glow: clamp(glow, 0, 1) };
}

/** vertices that share a position (split normals at hard edges) get the same averaged top-4 weights */
function weldWeights(Pp, J, W, n) {
  const groups = new Map();
  for (let v = 0; v < n; v++) { const k = `${Math.round(Pp[v * 3] * 2e4)},${Math.round(Pp[v * 3 + 1] * 2e4)},${Math.round(Pp[v * 3 + 2] * 2e4)}`; (groups.get(k) || groups.set(k, []).get(k)).push(v); }
  let welded = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const acc = new Map();
    for (const v of g) for (let k = 0; k < 4; k++) if (W[v * 4 + k] > 0) acc.set(J[v * 4 + k], (acc.get(J[v * 4 + k]) || 0) + W[v * 4 + k]);
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((a, b) => a + b[1], 0);
    for (const v of g) for (let k = 0; k < 4; k++) { J[v * 4 + k] = top[k] ? top[k][0] : 0; W[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
    welded += g.length;
  }
  console.log('post: welded weights on', welded, 'coincident vertices');
}
async function postProcess() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { loadModel } = await import('../model.mjs');
  const R = await import('../preview.mjs');
  const M = await loadModel('tools/sculpt/assets/dango.mjs');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const file = 'assets/models/sculpt/dango.glb';
  const doc = await io.read(file);
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const Pp = prim.getAttribute('POSITION').getArray(), col = prim.getAttribute('COLOR_0').getArray(), n = Pp.length / 3;
  if (prim.getAttribute('COLOR_0').getElementSize() !== 3) { console.log('already post-processed'); return; }
  const rgba = new Float32Array(n * 4), uv = new Float32Array(n * 2), counts = {};
  for (let v = 0; v < n; v++) {
    const x = Pp[v * 3], y = Pp[v * 3 + 1], z = Pp[v * 3 + 2];
    const part = M.shape.partAt(x, y, z).name; counts[part] = (counts[part] || 0) + 1;
    const { tip, glow } = tipAndGlow(x, y, z, part);
    rgba[v * 4] = col[v * 3]; rgba[v * 4 + 1] = col[v * 3 + 1]; rgba[v * 4 + 2] = col[v * 3 + 2]; rgba[v * 4 + 3] = tip;
    uv[v * 2] = glow; uv[v * 2 + 1] = tip;
  }
  // append the two eye shells (the game's convention: ellipsoid at the eye bone, rigid on it, painted iris + glints)
  const J0 = prim.getAttribute('JOINTS_0').getArray(), W0 = prim.getAttribute('WEIGHTS_0').getArray(), N0 = prim.getAttribute('NORMAL').getArray();
  weldWeights(Pp, J0, W0, n);
  const I0 = prim.getIndices().getArray();
  const eP = [], eN = [], eC = [], eU = [], eJ = [], eW = [], eI = [];
  const WS = 26, HS = 18;
  for (const s of [1, -1]) {
    const c = BONE_POS[s > 0 ? 6 : 7], Mx = eyeRot(s), o = n + eP.length / 3;
    for (let j = 0; j <= HS; j++) for (let i = 0; i <= WS; i++) {
      const th = (j / HS) * Math.PI, ph = (i / WS) * Math.PI * 2;
      const dx = Math.sin(th) * Math.sin(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.cos(ph);
      const l = [dx * EYE_R[0], dy * EYE_R[1], dz * EYE_R[2]], ln = V.norm([dx / EYE_R[0], dy / EYE_R[1], dz / EYE_R[2]]);
      const w = [0, 1, 2].map((r) => Mx[r][0] * l[0] + Mx[r][1] * l[1] + Mx[r][2] * l[2]), wn = [0, 1, 2].map((r) => Mx[r][0] * ln[0] + Mx[r][1] * ln[1] + Mx[r][2] * ln[2]);
      const p = [c[0] + w[0], c[1] + w[1], c[2] + w[2]];
      const e = eyePaint(s, p[0], p[1], p[2]);
      eP.push(...p); eN.push(...wn); eC.push(...e.col.map(R.toLin), 0); eU.push(e.glow, 0); eJ.push(s > 0 ? 6 : 7, 0, 0, 0); eW.push(1, 0, 0, 0);
    }
    for (let j = 0; j < HS; j++) for (let i = 0; i < WS; i++) { const a = o + j * (WS + 1) + i, b = a + WS + 1; eI.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  const ne = eP.length / 3, nt = n + ne;
  const cat = (A, B, T) => { const r = new T(A.length + B.length); r.set(A); r.set(B, A.length); return r; };
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const oldAttrs = ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0'].map((k) => prim.getAttribute(k)), oldIdx = prim.getIndices();
  prim.setAttribute('POSITION', acc('VEC3', cat(Pp, eP, Float32Array)));
  prim.setAttribute('NORMAL', acc('VEC3', cat(N0, eN, Float32Array)));
  prim.setAttribute('JOINTS_0', acc('VEC4', cat(J0, eJ, J0.constructor)));
  prim.setAttribute('WEIGHTS_0', acc('VEC4', cat(W0, eW, Float32Array)));
  prim.setIndices(acc('SCALAR', cat(I0, eI, nt > 65535 ? Uint32Array : Uint16Array)));
  for (const x of [...oldAttrs, oldIdx]) x.dispose();
  const rgba2 = cat(rgba, eC, Float32Array), uv2 = cat(uv, eU, Float32Array);
  const old = prim.getAttribute('COLOR_0');
  prim.setAttribute('COLOR_0', acc('VEC4', rgba2));
  prim.setAttribute('TEXCOORD_0', acc('VEC2', uv2));
  old.dispose();
  const mat = prim.getMaterial();
  mat.setExtras({ ...(mat.getExtras() || {}), sculpt: { author: 'sculpted for this project', vertexColors: true, colorAlpha: 'tip mask (1 = ear tips, tail tip, lock ends)', uv: 'x = glow ramp (companion.js rampTexture), y = tip mask' } });
  const bin = await io.writeBinary(doc); fs.writeFileSync(file, bin);
  console.log('post: wrote', file, (bin.length / 1024).toFixed(0), 'KB;', n, '+', ne, 'eye verts;', prim.getIndices().getCount() / 3, 'tris; parts', JSON.stringify(counts));
  // sheet: tip mask (white) and glow (orange) on the clay
  const idx = Uint32Array.from(prim.getIndices().getArray()), nrm = prim.getAttribute('NORMAL').getArray(), PP = prim.getAttribute('POSITION').getArray();
  const tipCol = new Float32Array(nt * 3), glowCol = new Float32Array(nt * 3);
  for (let v = 0; v < nt; v++) { const t = rgba2[v * 4 + 3], g = uv2[v * 2]; tipCol.set([0.25 + 0.75 * t, 0.25 + 0.3 * t, 0.3 - 0.2 * t], v * 3); glowCol.set([0.15 + g, 0.1 + g * 0.7, 0.08 + g * 0.3], v * 3); }
  const b = M.bounds, c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], dist = R.fitDistance(b, 35, 0.8);
  const mesh = (cc) => [{ pos: Float32Array.from(PP), nrm: Float32Array.from(nrm), idx, col: cc, base: [1, 1, 1] }];
  const tiles = [];
  for (const az of [60, 200, 300]) tiles.push({ img: R.render(mesh(tipCol), R.orbit(c, az, 15, dist, 35, 360, 360), { ground: false }), label: `TIP MASK ${az}` });
  for (const az of [60, 200, 300]) tiles.push({ img: R.render(mesh(glowCol), R.orbit(c, az, 15, dist, 35, 360, 360), { ground: false }), label: `GLOW ${az}` });
  R.savePNG(path.join('.tmp/sculpt/dango', 'tipmask.png'), R.sheet(tiles, 3, { title: 'DANGO TIP MASK (A) / GLOW (UV.X)' }));
  console.log('sheet .tmp/sculpt/dango/tipmask.png');
}

// ---- look: close-up sheet of the built GLB (bind pose) — colour row and clay row, filling the frame -------------------
if (ROLE === 'look') look().catch((e) => { console.error(e); process.exit(1); });
async function look() {
  const path = await import('node:path');
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const R = await import('../preview.mjs');
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('assets/models/sculpt/dango.glb');
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const pos = Float32Array.from(prim.getAttribute('POSITION').getArray()), nrm = Float32Array.from(prim.getAttribute('NORMAL').getArray());
  const ca = prim.getAttribute('COLOR_0'), es = ca.getElementSize(), cr = ca.getArray(), n = pos.length / 3, col = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) for (let k = 0; k < 3; k++) col[v * 3 + k] = cr[v * es + k];
  const idx = Uint32Array.from(prim.getIndices().getArray());
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], pos[i + k]); b[k + 3] = Math.max(b[k + 3], pos[i + k]); }
  console.log('bounds', b.map((v) => v.toFixed(3)).join(' '));
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], dist = R.fitDistance(b, 35, 0.95);
  const m = (clay) => [{ pos, nrm, idx, col: clay ? null : col, base: [1, 1, 1] }];
  const views = [[0, 8], [35, 12], [90, 5], [150, 15], [210, 12], [270, 5], [330, 30], [20, 70]];
  const tiles = [];
  for (const [az, el] of views) tiles.push({ img: R.render(m(false), R.orbit(c, az, el, dist, 35, 380, 380), { ground: false }), label: `${az}/${el}` });
  for (const [az, el] of views.slice(0, 4)) tiles.push({ img: R.render(m(true), R.orbit(c, az, el, dist, 35, 380, 380), { ground: false, clay: true }), label: `CLAY ${az}/${el}` });
  // the face, close
  const hc = [0, 0.17, 0.2];
  tiles.push({ img: R.render(m(false), R.orbit(hc, 0, 5, 0.55, 35, 380, 380), { ground: false }), label: 'FACE' });
  tiles.push({ img: R.render(m(false), R.orbit(hc, 40, 10, 0.55, 35, 380, 380), { ground: false }), label: 'FACE 40' });
  tiles.push({ img: R.render(m(true), R.orbit(hc, 0, 5, 0.55, 35, 380, 380), { ground: false, clay: true }), label: 'FACE CLAY' });
  tiles.push({ img: R.render(m(true), R.orbit(hc, 60, 10, 0.55, 35, 380, 380), { ground: false, clay: true }), label: 'FACE CLAY 60' });
  R.savePNG(path.join('.tmp/sculpt/dango', 'look.png'), R.sheet(tiles, 4, { title: 'DANGO CLOSE LOOK (BIND POSE)' }));
  console.log('sheet .tmp/sculpt/dango/look.png');
}

// ---- poselook: the test clips, close up (colour from the front-left, clay from behind-right) ---------------------------
if (ROLE === 'poselook') poseLook().catch((e) => { console.error(e); process.exit(1); });
async function poseLook() {
  const path = await import('node:path');
  const R = await import('../preview.mjs');
  const { loadRig, skinMesh } = await import('../rig.mjs');
  const rig = await loadRig(process.argv[3] || 'assets/models/sculpt/dango.glb');
  const o = rig.old[0];
  const b = [-0.15, -0.12, -0.38, 0.15, 0.4, 0.31], c = [0, 0.1, -0.03], dist = R.fitDistance(b, 35, 0.95);
  const tiles = [];
  const poses = [['rest', 0], ['curl', 1], ['scurve', 1], ['lookback', 1], ['wag', 1], ['blink', 1]];
  for (const clay of [false, true]) for (const [clip, t] of poses) {
    const S = rig.pose(rig.clip(clip === 'rest' ? 'curl' : clip), t);
    const sk = skinMesh(o.pos, o.nrm, o.J, o.W, S);
    const m = [{ pos: sk.pos, nrm: sk.nrm, idx: o.idx, col: clay ? null : o.col, base: [1, 1, 1] }];
    tiles.push({ img: R.render(m, R.orbit(c, clay ? 230 : 45, clay ? 25 : 12, dist, 35, 330, 330), { ground: false, clay }), label: `${clay ? 'CLAY ' : ''}${clip.toUpperCase()}` });
  }
  // the face in the blink and curl poses
  for (const clip of ['blink', 'curl']) {
    const S = rig.pose(rig.clip(clip), 1), sk = skinMesh(o.pos, o.nrm, o.J, o.W, S);
    tiles.push({ img: R.render([{ pos: sk.pos, nrm: sk.nrm, idx: o.idx, col: o.col, base: [1, 1, 1] }], R.orbit([0, 0.16, 0.2], clip === 'curl' ? 60 : 0, 5, 0.5, 35, 330, 330), { ground: false }), label: `FACE ${clip.toUpperCase()}` });
  }
  // before / after with the final GLB (the kit's before_after.png is rendered before `post` appends the eyes)
  const oldRig = await loadRig(RIG), oo = oldRig.old[0];
  const ba = [], cams = [[60, 12, dist, 330], [300, 12, dist, 330], [35, 14, dist * 4.2, 330]];
  for (const [az, el, d, sz] of cams) {
    ba.push({ img: R.render([{ pos: oo.pos, nrm: oo.nrm, idx: oo.idx, col: oo.col, base: [1, 1, 1] }], R.orbit(c, az, el, d, 35, sz, sz), { ground: false }), label: d > dist * 2 ? 'BEFORE ~120 PX' : 'BEFORE' });
    ba.push({ img: R.render([{ pos: o.pos, nrm: o.nrm, idx: o.idx, col: o.col, base: [1, 1, 1] }], R.orbit(c, az, el, d, 35, sz, sz), { ground: false }), label: d > dist * 2 ? 'AFTER ~120 PX' : 'AFTER' });
  }
  R.savePNG(path.join('.tmp/sculpt/dango', 'before_after_final.png'), R.sheet(ba, 6, { title: 'DANGO BEFORE / AFTER (FINAL GLB WITH EYES, SAME CAMERA AND LIGHT)' }));
  R.savePNG(path.join('.tmp/sculpt/dango', 'poses_close.png'), R.sheet(tiles, 6, { title: 'DANGO TEST POSES, CLOSE (COLOUR 45 DEG / CLAY FROM BEHIND)' }));
  console.log('sheet .tmp/sculpt/dango/poses_close.png');
}

// ---- sheets: the kit's skinned sheets (poses / turntable / before_after) rendered again from the FINAL GLB --------------
// The kit renders them before `post` appends the eye shells, so its sheets show empty sockets (closed-looking eyes).
// Same cameras as rig.mjs poseSheets, plus a game-camera row (~120 px and ~300 px tall). Run after `post`.
if (ROLE === 'sheets') finalSheets().catch((e) => { console.error(e); process.exit(1); });
async function finalSheets() {
  const path = await import('node:path');
  const R = await import('../preview.mjs');
  const { loadRig, skinMesh, M4 } = await import('../rig.mjs');
  const rig = await loadRig('assets/models/sculpt/dango.glb'), oldRig = await loadRig(RIG);
  const o = rig.old[0];
  const pose = (r, clip, t) => (clip === 'rest' ? r.joints.map(() => M4.id()) : r.pose(r.clip(clip), t));
  const newMesh = (S, clay) => { const sk = skinMesh(o.pos, o.nrm, o.J, o.W, S); return [{ pos: sk.pos, nrm: sk.nrm, idx: o.idx, col: clay ? null : o.col, base: [1, 1, 1] }]; };
  const oldMeshes = (S) => oldRig.old.map((q) => { const sk = skinMesh(q.pos, q.nrm, q.J, q.W, S); return { pos: sk.pos, nrm: sk.nrm, idx: q.idx, col: q.col, base: q.base || [1, 1, 1] }; });
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < o.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], o.pos[i + k]); b[k + 3] = Math.max(b[k + 3], o.pos[i + k]); }
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], fov = 35, dist0 = R.fitDistance(b, fov, 0.62), ts = 360;
  const save = (n, img) => { R.savePNG(path.join('.tmp/sculpt/dango', n), img); console.log('sheet .tmp/sculpt/dango/' + n); };
  const poses = [['rest', 0], ['curl', 1], ['curl', 0.5], ['scurve', 1], ['lookback', 1], ['wag', 1], ['blink', 1]];
  const tiles = [];
  for (const [clip, t] of poses) tiles.push({ img: R.render(oldMeshes(pose(oldRig, clip, t)), R.orbit(c, 60, 12, dist0, fov, ts, ts)), label: `OLD ${clip} ${t.toFixed(2)}` });
  for (const [clip, t] of poses) tiles.push({ img: R.render(newMesh(pose(rig, clip, t)), R.orbit(c, 60, 12, dist0, fov, ts, ts)), label: `NEW ${clip} ${t.toFixed(2)}` });
  for (const [clip, t] of poses) tiles.push({ img: R.render(newMesh(pose(rig, clip, t), true), R.orbit(c, -60, 12, dist0, fov, ts, ts), { clay: true }), label: 'CLAY OTHER SIDE' });
  save('poses.png', R.sheet(tiles, poses.length, { title: 'dango POSES - OLD / NEW / NEW CLAY (FINAL GLB WITH EYES)' }));
  const rest = pose(rig, 'rest', 0);
  save('turntable.png', R.sheet([0, 45, 90, 135, 180, 225, 270, 315].map((az) => ({ img: R.render(newMesh(rest), R.orbit(c, az, 10, dist0, fov, 300, 300)), label: `${az} DEG` })), 4, { title: 'dango BIND POSE TURNTABLE (FINAL GLB)' }));
  const ba = [], orest = pose(oldRig, 'rest', 0);
  for (const az of [60, 300]) { ba.push({ img: R.render(oldMeshes(orest), R.orbit(c, az, 12, dist0, fov, 480, 480)), label: 'BEFORE' }); ba.push({ img: R.render(newMesh(rest), R.orbit(c, az, 12, dist0, fov, 480, 480)), label: 'AFTER' }); }
  const H = b[4] - b[1], kk = 1 / Math.tan(25 * Math.PI / 180);
  for (const px of [120, 300]) {
    const d = (360 / 2) * kk * H / px, gc = R.camera([c[0] + d * 0.6, c[1] + d * 0.3, c[2] + d * 0.75], c, 50, 480, 360);
    ba.push({ img: R.render(oldMeshes(orest), gc), label: `BEFORE - GAME CAMERA ${px} PX` }, { img: R.render(newMesh(rest), gc), label: `AFTER - GAME CAMERA ${px} PX` });
  }
  save('before_after.png', R.sheet(ba, 2, { title: 'dango BEFORE / AFTER (FINAL GLB WITH EYES)' }));
}
