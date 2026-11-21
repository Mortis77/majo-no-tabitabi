// Procedural garment generator for the VRoid-based cast of 月帷巫女 (original geometry + textures, no third-party data).
// Input: an existing staged character GLB (T-pose, +Z forward, bones translation-only).
// Output: the same character with its VRoid outfit replaced by real garments:
//   * offset SHELLS of body regions (torso / arms / legs / feet) that copy the body skin weights exactly -> deform perfectly; the
//     skin under them is deleted (no poke-through possible)
//   * LOFTED pieces (wide sleeves, pleated hakama / robes / coats, sash, bow, collars, cords, sandals ...) weighted from the nearest
//     body vertices blended with new SECONDARY chains J_Sec_<Part>_<chain>_<nn> (+ _end tail) that the game's spring solver drives
//   * procedural fabric textures painted into the UVs this script creates
import fs from 'node:fs';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

// ---------------------------------------------------------------- vector helpers
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const srgb2lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const rotAxis = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a); return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))); };
// cheap deterministic value noise
const hash = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
export function vnoise(x, y, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t); const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
export const fbm = (x, y, z = 0, o = 3) => { let a = 0, f = 1, s = 0.5, t = 0; for (let i = 0; i < o; i++) { a += s * vnoise(x * f, y * f, z * f); t += s; f *= 2.03; s *= 0.5; } return a / t; };

// ---------------------------------------------------------------- quaternions [x,y,z,w] + clip sampling + FK (round 2)
export const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
export const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
export const qrot = (q, v) => { const u = [q[0], q[1], q[2]]; const t = mul(cross(u, v), 2); return add(add(v, mul(t, q[3])), cross(u, t)); };
export function qFromUnit(a, b) { const d = dot(a, b); if (d < -0.999999) { let ax = cross([1, 0, 0], a); if (len(ax) < 1e-6) ax = cross([0, 1, 0], a); ax = norm(ax); return [ax[0], ax[1], ax[2], 0]; } const c = cross(a, b); const q = [c[0], c[1], c[2], 1 + d]; const l = Math.hypot(...q); return q.map((v) => v / l); }
export function qslerp(a, b, t) { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; let bb = b; if (d < 0) { d = -d; bb = b.map((v) => -v); } if (d > 0.9995) { const r = a.map((v, i) => v + (bb[i] - v) * t); const l = Math.hypot(...r); return r.map((v) => v / l); } const th = Math.acos(d), s = Math.sin(th); const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s; return a.map((v, i) => v * wa + bb[i] * wb); }
let _clipLib = null;
/** local rotations {boneName: q} of a clip at fraction t of its duration (anim_ual, LINEAR quats) */
export async function samplePose(clipName, t) {
  if (!_clipLib) { const path = new URL('../../assets/models/chars/anim_ual.glb', import.meta.url).pathname; const d = await new NodeIO().read(path); _clipLib = d.getRoot().listAnimations(); }
  const a = _clipLib.find((x) => x.getName() === clipName); if (!a) throw new Error('no clip ' + clipName);
  let dur = 0; for (const ch of a.listChannels()) { const inp = ch.getSampler().getInput().getArray(); dur = Math.max(dur, inp[inp.length - 1]); }
  const time = dur * t; const out = {};
  for (const ch of a.listChannels()) { if (ch.getTargetPath() !== 'rotation') continue; const s = ch.getSampler(); const inp = s.getInput().getArray(), o = s.getOutput().getArray();
    let i = 0; while (i < inp.length - 2 && inp[i + 1] < time) i++; const f = clamp01((time - inp[i]) / ((inp[i + 1] ?? inp[i]) - inp[i] || 1));
    const q0 = Array.from(o.slice(i * 4, i * 4 + 4)), q1 = inp.length > 1 ? Array.from(o.slice((i + 1) * 4, (i + 1) * 4 + 4)) : q0; out[ch.getTargetNode().getName()] = qslerp(q0, q1, f); }
  return out;
}
/** world rotation + position of a bone under a pose (rest rotations are identity, translations from C.W) */
export function poseFK(C, pose, name) {
  const chain = []; for (let n = name; n; n = C.parent.get(n)) chain.unshift(n);
  let Q = [0, 0, 0, 1], P = C.W.get(chain[0]);
  for (let i = 1; i < chain.length; i++) { const t = sub(C.W.get(chain[i]), C.W.get(chain[i - 1])); P = add(P, qrot(Q, t)); Q = qmul(Q, pose[chain[i - 1]] || [0, 0, 0, 1]); }
  Q = qmul(Q, pose[name] || [0, 0, 0, 1]); // rotation of the bone itself
  return { Q, P };
}

/** Radial "what is already worn" profile: every built garment layer adds its vertices; later layers query it. */
export class Stack {
  constructor() { this.b = new Map(); }
  add(pos) { for (const p of pos) { const kk = Math.floor(p[1] / 0.01); if (!this.b.has(kk)) this.b.set(kk, []); this.b.get(kk).push(p); } }
  profile(y, K, { zc = 0, band = 0.02, xcap = Infinity, base = null } = {}) {
    const R = new Float32Array(K).fill(0);
    for (let kk = Math.floor((y - band) / 0.01); kk <= Math.floor((y + band) / 0.01); kk++) for (const p of this.b.get(kk) || []) {
      if (Math.abs(p[1] - y) > band || Math.abs(p[0]) > xcap) continue; const x = p[0], z = p[2] - zc; const r = Math.hypot(x, z); let th = Math.atan2(x, z); if (th < 0) th += Math.PI * 2;
      const b = Math.floor((th / (Math.PI * 2)) * K) % K; if (r > R[b]) R[b] = r; }
    // the body profile is only a fallback where nothing is worn yet (under the torso envelope the bust must not come back)
    const filled = R.reduce((a, v) => a + (v > 0 ? 1 : 0), 0); if (filled >= K * 0.6) base = null;
    const D = Array.from(R, (_, i) => Math.max(R[i], R[(i + 1) % K], R[(i + K - 1) % K], base ? base[i] : 0));
    for (let i = 0; i < K; i++) if (D[i] === 0) { let a = i, b = i; while (D[((a % K) + K) % K] === 0 && a > i - K) a--; while (D[b % K] === 0 && b < i + K) b++; D[i] = Math.max(D[((a % K) + K) % K], D[b % K]); }
    let S = D; for (let it = 0; it < 2; it++) S = Array.from(S, (_, i) => Math.max(S[i], (S[(i + K - 1) % K] + 2 * S[i] + S[(i + 1) % K]) / 4));
    return S;
  }
}

// ---------------------------------------------------------------- loading
export async function loadChar(file) {
  const io = new NodeIO(); const doc = await io.read(file); const root = doc.getRoot();
  const scene = root.listScenes()[0]; const top = scene.listChildren()[0];
  const skin = root.listSkins()[0]; const joints = skin.listJoints();
  const W = new Map(), parent = new Map(), nodeBy = new Map();
  const walk = (n, p, par) => { const t = n.getTranslation(); const w = [p[0] + t[0], p[1] + t[1], p[2] + t[2]]; W.set(n.getName(), w); nodeBy.set(n.getName(), n); if (par) parent.set(n.getName(), par.getName()); n.listChildren().forEach((c) => walk(c, w, n)); };
  scene.listChildren().forEach((n) => walk(n, [0, 0, 0], null));
  const jn = joints.map((j) => j.getName());
  const bipOf = (name) => { let n = name; while (n && !/^J_Bip_/.test(n)) n = parent.get(n); return n || 'J_Bip_C_Hips'; };
  const jbip = jn.map((n) => bipOf(n));
  // body primitive
  let bodyNode = null, bodyPrim = null;
  for (const nd of root.listNodes()) { const m = nd.getMesh(); if (!m || !/_body$/i.test(nd.getName())) continue; for (const p of m.listPrimitives()) if (p.getMaterial()?.getName() === 'Body') { bodyNode = nd; bodyPrim = p; } }
  if (!bodyPrim) throw new Error('no Body primitive in ' + file);
  const g = (k) => bodyPrim.getAttribute(k).getArray();
  const body = { prim: bodyPrim, node: bodyNode, P: g('POSITION'), N: g('NORMAL'), UV: g('TEXCOORD_0'), J: g('JOINTS_0'), Wt: g('WEIGHTS_0'), I: bodyPrim.getIndices().getArray() };
  const nv = body.P.length / 3; body.nv = nv; body.dom = new Int32Array(nv);
  for (let i = 0; i < nv; i++) { let b = 0; for (let k = 1; k < 4; k++) if (body.Wt[i * 4 + k] > body.Wt[i * 4 + b]) b = k; body.dom[i] = body.J[i * 4 + b]; }
  body.domBip = Array.from(body.dom, (j) => jbip[j]);
  const C = { file, doc, root, scene, top, skin, joints, jn, jbip, W, parent, nodeBy, body, pfx: top.getName() === 'Akari' ? 'akari' : top.getName() };
  C.ji = (name) => { const i = jn.indexOf(name); if (i < 0) throw new Error('no joint ' + name); return i; };
  C.w = (name) => W.get(name);
  const M = {}; C.M = M;
  for (const [k, n] of Object.entries({ hips: 'Hips', spine: 'Spine', chest: 'Chest', uchest: 'UpperChest', neck: 'Neck', head: 'Head' })) M[k] = W.get('J_Bip_C_' + n);
  for (const [k, n] of Object.entries({ sh: 'Shoulder', ua: 'UpperArm', la: 'LowerArm', hand: 'Hand', ul: 'UpperLeg', ll: 'LowerLeg', foot: 'Foot', toe: 'ToeBase' })) { M[k + 'L'] = W.get('J_Bip_L_' + n); M[k + 'R'] = W.get('J_Bip_R_' + n); }
  M.toeEnd = W.get('J_Bip_L_ToeBase_end');
  // body extents
  let minY = 9, maxY = -9; for (let i = 0; i < nv; i++) { minY = Math.min(minY, body.P[i * 3 + 1]); maxY = Math.max(maxY, body.P[i * 3 + 1]); }
  M.bodyMinY = minY; M.bodyMaxY = maxY;
  return C;
}
const BP = (i, P) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];

// ---------------------------------------------------------------- body queries
/** max radial distance of body verts around the vertical axis through (0, y, zc), in K angular bins (theta 0 = +Z front, +pi/2 = +X left) */
export function bodyProfile(C, y, K, { band = 0.025, zc = 0, filter = null, xcap = Infinity } = {}) {
  const { P, nv, domBip } = C.body; const R = new Float32Array(K).fill(0);
  for (let i = 0; i < nv; i++) {
    const py = P[i * 3 + 1]; if (Math.abs(py - y) > band) continue; if (filter && !filter(domBip[i], i)) continue;
    const x = Math.max(-xcap, Math.min(xcap, P[i * 3])), z = P[i * 3 + 2] - zc; const r = Math.hypot(x, z); let th = Math.atan2(x, z); if (th < 0) th += Math.PI * 2;
    const b = Math.floor((th / (Math.PI * 2)) * K) % K; R[b] = Math.max(R[b], r);
  }
  // fill empty bins + smooth (dilate then blur)
  const D = Array.from(R, (_, i) => Math.max(R[i], R[(i + 1) % K], R[(i + K - 1) % K]));
  for (let i = 0; i < K; i++) if (D[i] === 0) { let a = i, b = i; while (D[a] === 0 && a > i - K) a--; while (D[b % K] === 0 && b < i + K) b++; D[i] = Math.max(D[((a % K) + K) % K], D[b % K]); }
  return Array.from(D, (_, i) => (D[(i + K - 1) % K] + 2 * D[i] + D[(i + 1) % K]) / 4);
}
export const sampleProfile = (R, th) => { const K = R.length; let t = ((th / (Math.PI * 2)) % 1 + 1) % 1 * K; const i = Math.floor(t) % K, f = t - Math.floor(t); return lerp(R[i], R[(i + 1) % K], f); };

/** k nearest body vertices (optionally filtered by dominant bip bone) -> blended weight map {jointIndex: w} */
export function nearestWeights(C, p, { k = 4, filter = null } = {}) {
  const { P, nv, J, Wt, domBip } = C.body; const best = []; // [d2, i]
  for (let i = 0; i < nv; i++) {
    if (filter && !filter(domBip[i], i)) continue;
    const dx = P[i * 3] - p[0], dy = P[i * 3 + 1] - p[1], dz = P[i * 3 + 2] - p[2]; const d2 = dx * dx + dy * dy + dz * dz;
    if (best.length < k) { best.push([d2, i]); best.sort((a, b) => a[0] - b[0]); } else if (d2 < best[k - 1][0]) { best[k - 1] = [d2, i]; best.sort((a, b) => a[0] - b[0]); }
  }
  const w = new Map(); let tot = 0;
  for (const [d2, i] of best) { const f = 1 / (Math.sqrt(d2) + 0.004); tot += f; for (let c = 0; c < 4; c++) { const wt = Wt[i * 4 + c]; if (wt <= 0) continue; const j = J[i * 4 + c]; w.set(j, (w.get(j) || 0) + wt * f); } }
  for (const [j, v] of w) w.set(j, v / tot);
  return w;
}
export const W1 = (j) => new Map([[j, 1]]);
export function wmix(a, b, t) { const o = new Map(); for (const [j, v] of a) o.set(j, (o.get(j) || 0) + v * (1 - t)); for (const [j, v] of b) o.set(j, (o.get(j) || 0) + v * t); return o; }
export function wsum(list) { const o = new Map(); for (const [m, s] of list) for (const [j, v] of m) o.set(j, (o.get(j) || 0) + v * s); return o; }

/** nearest body vertex (any) -> {i, d along its normal} used to keep loft pieces outside the skin */
export function clearance(C, p, filter = null) {
  const { P, N, nv, domBip } = C.body; let bi = -1, bd = 1e9;
  for (let i = 0; i < nv; i++) { if (filter && !filter(domBip[i], i)) continue; const dx = P[i * 3] - p[0], dy = P[i * 3 + 1] - p[1], dz = P[i * 3 + 2] - p[2]; const d2 = dx * dx + dy * dy + dz * dz; if (d2 < bd) { bd = d2; bi = i; } }
  return { i: bi, n: BP(bi, N), b: BP(bi, P), along: dot(sub(p, BP(bi, P)), BP(bi, N)) };
}

// ---------------------------------------------------------------- geometry builders (each returns {pos, uv, idx})
export function grid(rows, cols, at, { closeU = false } = {}) {
  // at(i,j) -> {p, u, v};  i = row (0..rows-1), j = col (0..cols-1)
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const r = at(i, j); pos.push(r.p); uv.push([r.u, r.v]); }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) { const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1; idx.push(a, c, b, b, c, d); }
  return { pos, uv, idx };
}
/** rectangular-section strip along a path: pts, per-point normal n (thickness dir) and across dir a; halfW(s), th(s) */
export function strip(pts, nrm, acr, halfW, th, { closed = false } = {}) {
  const n = pts.length; const pos = [], uv = [], idx = []; const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  let L = 0; const acc = [0]; for (let i = 1; i < n; i++) { L += len(sub(pts[i], pts[i - 1])); acc.push(L); }
  for (let i = 0; i < n; i++) { const s = acc[i] / (L || 1); const hw = typeof halfW === 'function' ? halfW(s) : halfW, t = typeof th === 'function' ? th(s) : th;
    for (let c = 0; c < 4; c++) { const [ca, cn] = corners[c]; pos.push(add(pts[i], add(mul(acr[i], ca * hw), mul(nrm[i], cn * t)))); uv.push([s, c / 3]); } }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) { const i2 = (i + 1) % n; for (let c = 0; c < 4; c++) { const c2 = (c + 1) % 4; const a = i * 4 + c, b = i * 4 + c2, d = i2 * 4 + c, e = i2 * 4 + c2; idx.push(a, d, b, b, d, e); } }
  if (!closed) { idx.push(0, 1, 2, 0, 2, 3); const e = (n - 1) * 4; idx.push(e, e + 2, e + 1, e, e + 3, e + 2); }
  return fixWinding({ pos, uv, idx });
}
/** loft elliptical rings */
export function loft(sections, K = 12, caps = true) {
  const pos = [], uv = [], idx = [];
  sections.forEach((s, i) => { for (let k = 0; k < K; k++) { const a = (k / K) * Math.PI * 2; pos.push(add(s.c, add(mul(s.u, s.ru * Math.cos(a)), mul(s.v, s.rv * Math.sin(a))))); uv.push([k / K, i / Math.max(1, sections.length - 1)]); } });
  for (let i = 0; i < sections.length - 1; i++) for (let k = 0; k < K; k++) { const a = i * K + k, b = i * K + (k + 1) % K, c = a + K, d = b + K; idx.push(a, b, c, b, d, c); }
  if (caps) { const cap = (i, flip) => { const ci = pos.length; pos.push(sections[i].c.slice()); uv.push([0.5, i ? 1 : 0]); for (let k = 0; k < K; k++) { const a = i * K + k, b = i * K + (k + 1) % K; if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); } }; cap(0, true); cap(sections.length - 1, false); }
  return fixWinding({ pos, uv, idx });
}
export function tube(pts, radii, K = 8, ref = [0, 1, 0], flat = 1) {
  const secs = pts.map((p, i) => { const t = norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])); let u = cross(t, ref); if (len(u) < 1e-4) u = cross(t, [1, 0, 0]); u = norm(u); const v = norm(cross(u, t)); return { c: p, u, v, ru: radii[i], rv: radii[i] * flat }; });
  return loft(secs, K);
}
export function ellipsoid(c, r, K = 12, R = 8, axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
  const secs = []; for (let i = 0; i <= R; i++) { const t = -1 + (2 * i) / R; const s = Math.sqrt(Math.max(0, 1 - t * t)); secs.push({ c: add(c, mul(axes[1], t * r[1])), u: axes[0], v: axes[2], ru: Math.max(1e-4, s * r[0]), rv: Math.max(1e-4, s * r[2]) }); }
  return loft(secs, K);
}
export function fixWinding(part, centre = null) {
  const c = centre || mul(part.pos.reduce(add, [0, 0, 0]), 1 / part.pos.length); let s = 0;
  for (let t = 0; t < part.idx.length; t += 3) { const a = part.pos[part.idx[t]], b = part.pos[part.idx[t + 1]], d = part.pos[part.idx[t + 2]]; s += dot(cross(sub(b, a), sub(d, a)), sub(mul(add(add(a, b), d), 1 / 3), c)); }
  if (s < 0) for (let t = 0; t < part.idx.length; t += 3) { const x = part.idx[t + 1]; part.idx[t + 1] = part.idx[t + 2]; part.idx[t + 2] = x; }
  return part;
}
export function merge(parts) { const pos = [], uv = [], idx = []; for (const p of parts) { const b = pos.length; pos.push(...p.pos); uv.push(...(p.uv || p.pos.map(() => [0.5, 0.5]))); p.idx.forEach((i) => idx.push(b + i)); } return { pos, uv, idx }; }

// ---------------------------------------------------------------- output assembly
/** A garment build session on one character. */
export class Wardrobe {
  constructor(C, o = {}) {
    this.C = C; this.doc = C.doc; this.buffer = C.root.listBuffers()[0]; this.pieces = []; this.chains = []; this.texSize = o.texSize || 512;
    this.materials = new Map(); this.textures = new Map(); this.mats = o.mats || {}; this.stack = new Stack();
  }
  /** add a new secondary chain: pts = world positions of joints _01.._nn followed by the tail point (_end) */
  chain(part, idx, parentName, pts, meta = {}) {
    const C = this.C; let par = C.nodeBy.get(parentName); let pw = C.W.get(parentName); const ids = [];
    for (let i = 0; i < pts.length; i++) {
      const last = i === pts.length - 1; const name = `J_Sec_${part}_${idx}_${last ? 'end' : String(i + 1).padStart(2, '0')}`;
      // v3 (layered base figure): a skeleton that already carries this chain (same name) keeps its node and joint index —
      // the node is re-placed / re-parented, so every other mesh's JOINTS_0 stays valid
      const old = C.nodeBy.get(name); const n = old || this.doc.createNode(name);
      n.setTranslation(sub(pts[i], pw)).setRotation(i === 0 && meta.restQ ? meta.restQ : [0, 0, 0, 1]); par.addChild(n); C.W.set(name, pts[i]); C.parent.set(name, par.getName()); C.nodeBy.set(name, n);
      if (!last) { const ji = C.jn.indexOf(name); if (ji >= 0) { C.jbip[ji] = C.jbip[C.jn.indexOf(parentName)] || parentName; ids.push(ji); } else { C.skin.addJoint(n); C.jn.push(name); C.jbip.push(C.jbip[C.jn.indexOf(parentName)] || parentName); ids.push(C.jn.length - 1); } }
      par = n; pw = pts[i];
    }
    const { restQ, ...rest } = meta; this.chains.push({ part, idx, parent: parentName, joints: ids.map((i) => C.jn[i]), ...rest, ...(restQ ? { restRotation: restQ.map((v) => +v.toFixed(5)) } : {}) });
    return ids;
  }
  /** weights along a chain for height/param s in [0,1] measured from first joint (0) to tail (1) given joint params */
  static along(ids, params, s) {
    // params: param of each joint and the tail (length ids.length+1)
    if (s <= params[0]) return W1(ids[0]);
    for (let k = 0; k < ids.length; k++) { const a = params[k], b = params[k + 1]; if (s <= b || k === ids.length - 1) { if (k === ids.length - 1) return W1(ids[k]); const t = clamp01((s - a) / (b - a)); return wmix(W1(ids[k]), W1(ids[k + 1]), t); } }
    return W1(ids[ids.length - 1]);
  }
  /** register a piece: geo {pos, uv, idx}, weights: array of Map, material name, uv already in [0,1] of the material texture */
  /** Round 2: keep a garment outside everything already worn below `layer` (min separation `sep`, along the inner surface's own
   *  face normal = the checker's test). Moves vertices in place; returns how many moved. */
  pushOut(pos, layer, sep, { skip = () => false, reach = 0.03, iters = 2 } = {}) {
    const T = []; for (const pc of this.pieces) { if (pc.layer == null || pc.layer >= layer || skip(pc.name)) continue; const { pos: P, idx } = pc.geo; for (let t = 0; t < idx.length; t += 3) T.push([P[idx[t]], P[idx[t + 1]], P[idx[t + 2]]]); }
    if (!T.length) return 0; const G = 0.02; const grid = new Map(); const key = (a, b, c) => a + ',' + b + ',' + c;
    T.forEach((tr, ti) => { const lo = [0, 1, 2].map((c) => Math.floor(Math.min(tr[0][c], tr[1][c], tr[2][c]) / G)), hi = [0, 1, 2].map((c) => Math.floor(Math.max(tr[0][c], tr[1][c], tr[2][c]) / G));
      for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) for (let c = lo[2]; c <= hi[2]; c++) { const kk = key(a, b, c); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(ti); } });
    const nrm = T.map(([a, b, c]) => norm(cross(sub(b, a), sub(c, a)))); let moved = 0;
    for (let it = 0; it < iters; it++) for (let i = 0; i < pos.length; i++) { const q = pos[i]; const g0 = q.map((v) => Math.floor(v / G)); const cand = []; let best = 1e9; const seen = new Set();
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const ti of grid.get(key(g0[0] + a, g0[1] + b, g0[2] + c)) || []) { if (seen.has(ti)) continue; seen.add(ti);
        const cp = closestPt(q, ...T[ti]); const d = len(sub(q, cp)); if (d > reach) continue; cand.push([d, dot(sub(q, cp), nrm[ti]), ti]); if (d < best) best = d; }
      if (!cand.length) continue; let s = -1e9, tb = -1; for (const [d, sv, ti] of cand) if (d <= best + 0.0005 && sv > s) { s = sv; tb = ti; }
      if (tb < 0 || !Number.isFinite(s)) continue; if (s < sep) { pos[i] = add(q, mul(nrm[tb], sep - s)); if (it === 0) moved++; } }
    return moved;
  }
  /** Round 2: skin weights of whatever is worn right under each point (nearest triangle of a lower layer, barycentric blend),
   *  so an outer layer moves exactly like the surface it lies on. Returns null for points with nothing within `reach`. */
  weightsBelow(pos, layer, { skip = () => false, reach = 0.04 } = {}) {
    const T = []; for (const pc of this.pieces) { if (pc.layer == null || pc.layer >= layer || skip(pc.name) || !pc.weights) continue; const { pos: P, idx } = pc.geo; for (let t = 0; t < idx.length; t += 3) T.push([idx[t], idx[t + 1], idx[t + 2], pc]); }
    const G = 0.03; const grid = new Map(); const key = (a, b, c) => a + ',' + b + ',' + c;
    T.forEach(([i0, i1, i2, pc], ti) => { const tr = [pc.geo.pos[i0], pc.geo.pos[i1], pc.geo.pos[i2]]; const lo = [0, 1, 2].map((c) => Math.floor(Math.min(tr[0][c], tr[1][c], tr[2][c]) / G)), hi = [0, 1, 2].map((c) => Math.floor(Math.max(tr[0][c], tr[1][c], tr[2][c]) / G));
      for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) for (let c = lo[2]; c <= hi[2]; c++) { const kk = key(a, b, c); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(ti); } });
    return pos.map((q) => { const g0 = q.map((v) => Math.floor(v / G)); let best = reach, bt = -1, bcp = null;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const ti of grid.get(key(g0[0] + a, g0[1] + b, g0[2] + c)) || []) { const [i0, i1, i2, pc] = T[ti]; const cp = closestPt(q, pc.geo.pos[i0], pc.geo.pos[i1], pc.geo.pos[i2]); const d = len(sub(q, cp)); if (d < best) { best = d; bt = ti; bcp = cp; } }
      if (bt < 0) return null; const [i0, i1, i2, pc] = T[bt]; const A = pc.geo.pos[i0], B = pc.geo.pos[i1], Cc = pc.geo.pos[i2];
      const ar = (p, q2, r) => len(cross(sub(q2, p), sub(r, p))); const tot = ar(A, B, Cc) || 1e-12; const wa = ar(bcp, B, Cc) / tot, wb = ar(A, bcp, Cc) / tot, wc = Math.max(0, 1 - wa - wb);
      return wsum([[pc.weights[i0], wa], [pc.weights[i1], wb], [pc.weights[i2], wc]]); });
  }
  /** o.layer: inside->outside order for the checker (null = accessory, not tested); o.hems: vertex indices of declared open edges */
  piece(name, geo, weights, mat, o = {}) { this.pieces.push({ name, geo, weights, mat, ...o }); if (o.layer != null && o.stack !== false) this.stack.add(geo.pos); return this; }
  material(name, spec) { this.materials.set(name, spec); }

  /** finalize: create primitives, textures, rebuild IBMs, prune */
  async finish(outFile, o = {}) {
    const { doc, C, buffer } = this; const A = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
    // textures
    const texObj = new Map();
    for (const [tname, t] of this.textures) {
      const img = await sharp(Buffer.from(t.data.buffer), { raw: { width: t.w, height: t.h, channels: 4 } }).removeAlpha().jpeg({ quality: o.jpegQ || 88, chromaSubsampling: '4:4:4' }).toBuffer();
      texObj.set(tname, doc.createTexture(tname).setImage(img).setMimeType('image/jpeg'));
      if (o.dumpTex) fs.writeFileSync(`${o.dumpTex}_${tname}.jpg`, img);
    }
    const matObj = new Map();
    for (const [mname, s] of this.materials) {
      const m = doc.createMaterial(mname).setRoughnessFactor(s.rough ?? 1).setMetallicFactor(s.metal ?? 0).setDoubleSided(!!s.doubleSided);
      m.setBaseColorFactor(s.colour ? [...s.colour.map(srgb2lin), 1] : [1, 1, 1, 1]);
      if (s.tex) m.setBaseColorTexture(texObj.get(s.tex));
      if (s.emissive) m.setEmissiveFactor(s.emissive);
      m.setExtras({ shadeColor: s.shade || [0.6, 0.6, 0.7], garment: true, ...(s.extras || {}) });
      matObj.set(mname, m);
    }
    // group pieces into one mesh per "group" (default: <pfx>_outfit)
    const meshes = new Map(); let tris = 0; const side = {};
    // garments never follow the VRoid bust bones: their weight goes to the parent (UpperChest)
    const remap = new Map(); C.jn.forEach((n, i) => { if (/^J_Sec_[LR]_Bust/.test(n)) remap.set(i, C.ji('J_Bip_C_UpperChest')); });
    const fixW = (m) => { if (![...m.keys()].some((j) => remap.has(j))) return m; const o = new Map(); for (const [j, v] of m) { const jj = remap.get(j) ?? j; o.set(jj, (o.get(jj) || 0) + v); } return o; };
    for (const pc of this.pieces) {
      const g = pc.geo; const nv = g.pos.length; if (!nv || pc.ghost) continue;
      const P = new Float32Array(nv * 3), UV = new Float32Array(nv * 2), Jn = new Uint16Array(nv * 4), Wt = new Float32Array(nv * 4);
      for (let i = 0; i < nv; i++) {
        P.set(g.pos[i], i * 3); UV[i * 2] = g.uv[i][0]; UV[i * 2 + 1] = g.uv[i][1];
        const ws = [...fixW(pc.weights[i]).entries()].filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4); const tot = ws.reduce((s, [, v]) => s + v, 0) || 1;
        ws.forEach(([j, v], k) => { Jn[i * 4 + k] = j; Wt[i * 4 + k] = v / tot; }); if (!ws.length) { Jn[i * 4] = C.ji('J_Bip_C_Hips'); Wt[i * 4] = 1; }
      }
      const N = pc.normals || smoothNormals(g.pos, g.idx, pc.flatShade);
      const prim = doc.createPrimitive().setMaterial(matObj.get(pc.mat)).setAttribute('POSITION', A('VEC3', P)).setAttribute('NORMAL', A('VEC3', new Float32Array(N.flat())))
        .setAttribute('TEXCOORD_0', A('VEC2', UV)).setAttribute('JOINTS_0', A('VEC4', Jn)).setAttribute('WEIGHTS_0', A('VEC4', Wt)).setIndices(A('SCALAR', nv < 65536 ? new Uint16Array(g.idx) : new Uint32Array(g.idx)));
      const mg = pc.group || `${C.pfx}_outfit`;
      if (!meshes.has(mg)) { const mesh = doc.createMesh(mg); meshes.set(mg, mesh); C.top.addChild(doc.createNode(mg).setMesh(mesh).setSkin(C.skin)); }
      meshes.get(mg).addPrimitive(prim); tris += g.idx.length / 3;
      (side[mg] ||= []).push({ name: pc.name, mat: pc.mat, layer: pc.layer ?? null, hems: pc.hems ? [...new Set(pc.hems)] : [] });
    }
    if (o.sidecar) fs.writeFileSync(o.sidecar, JSON.stringify({ pfx: C.pfx, meshes: side }));
    // inverse bind matrices from world rest positions (all rest rotations are identity)
    const J = C.skin.listJoints(); const ibm = new Float32Array(J.length * 16);
    J.forEach((j, i) => { const w = C.W.get(j.getName()); ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1], i * 16); });
    C.skin.setInverseBindMatrices(A('MAT4', ibm));
    await doc.transform(prune({ keepLeaves: true, keepAttributes: true }));
    await new NodeIO().write(outFile, doc);
    return { tris };
  }
}

export function closestPt(p, a, b, c) { const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a); const d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b); const d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b; const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c); const d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c; const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))); const den = 1 / (va + vb + vc); return add(add(a, mul(ab, vb * den)), mul(ac, vc * den)); }
export function smoothNormals(pos, idx, flat = false) {
  const N = pos.map(() => [0, 0, 0]); const key = (p) => p.map((v) => Math.round(v * 2000)).join(',');
  const groups = new Map(); pos.forEach((p, i) => { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  for (let t = 0; t < idx.length; t += 3) { const a = pos[idx[t]], b = pos[idx[t + 1]], c = pos[idx[t + 2]]; const n = cross(sub(b, a), sub(c, a)); for (const i of [idx[t], idx[t + 1], idx[t + 2]]) N[i] = add(N[i], n); }
  if (!flat) for (const ids of groups.values()) if (ids.length > 1) { const s = ids.reduce((acc, i) => add(acc, N[i]), [0, 0, 0]); ids.forEach((i) => (N[i] = s)); }
  return N.map(norm);
}

// ---------------------------------------------------------------- textures
export class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4); this.mask = new Uint8Array(w * h); }
  /** fill a UV rect [u0,v0,u1,v1] by fn(lu, lv) -> [r,g,b] (lu, lv local 0..1) */
  rect(r, fn) {
    const [u0, v0, u1, v1] = r; const x0 = Math.floor(u0 * this.w), x1 = Math.ceil(u1 * this.w), y0 = Math.floor(v0 * this.h), y1 = Math.ceil(v1 * this.h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const c = fn((x + 0.5 - x0) / (x1 - x0), (y + 0.5 - y0) / (y1 - y0)); const i = (y * this.w + x) * 4; this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255; this.mask[y * this.w + x] = 1; }
  }
  /** rasterise triangles in UV space; attrs per vertex (arrays of numbers) interpolated; fn(attr) -> rgb */
  tris(UV, idx, attrs, fn) {
    const { w, h } = this;
    for (let t = 0; t < idx.length; t += 3) {
      const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
      const ax = UV[ia][0] * w, ay = UV[ia][1] * h, bx = UV[ib][0] * w, by = UV[ib][1] * h, cx = UV[ic][0] * w, cy = UV[ic][1] * h;
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx) + 1)), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy) + 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5; let l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d, l3 = 1 - l1 - l2;
        const e = -0.02 * 1; if (l1 < e || l2 < e || l3 < e) continue;
        const A = attrs[ia], B = attrs[ib], Cc = attrs[ic]; const at = A.map((v, k) => v * l1 + B[k] * l2 + Cc[k] * l3);
        const c = fn(at); const i = (y * w + x) * 4; this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255; this.mask[y * w + x] = 1;
      }
    }
  }
  dilate(n = 4) {
    const { w, h, data, mask } = this;
    for (let it = 0; it < n; it++) { const add = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (mask[y * w + x]) continue; let r = 0, g = 0, b = 0, c = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || !mask[Y * w + X]) continue; const i = (Y * w + X) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; c++; }
        if (c) add.push([y * w + x, r / c, g / c, b / c]); }
      for (const [p, r, g, b] of add) { data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; data[p * 4 + 3] = 255; mask[p] = 1; } }
  }
}
