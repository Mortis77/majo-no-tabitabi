#!/usr/bin/env node
// 灯里's hair and hair bow, re-sculpted (replaces the stock VRoid hair + bow of the base figure).
//   SCULPT_THREADS=2 node tools/sculpt/figure/build-hair.mjs [--out <glb>]
//   -> assets/models/sculpt/akari_hair.glb  (nodes akari_hair [Hair + Ribbon (the tail ties)], akari_ribbon [Ribbon]; skinned to
//      the 175 joints of the base figure, skeleton untouched), .tmp/akari-hair/out/build.json
// Design: tools/sculpt/assets/akari_hair.mjs (locks), akari_hair_cap.mjs (the cap field), akari_hair_bow.mjs (bow + ties),
// geometry: akari_hair_lib.mjs. Shading: colour through two 64 x 64 ramp textures (no vertex colours: the game's character
// merge refuses them). Hair: uv.y = depth (0 = the lit crest of a lock .. 1 = the under-layer) inside the first sixth of the
// texture, uv.x = one cell (of 48) per lock: the game's hair shader jitters its highlight by floor(uv.x * 48), floor(uv.y * 6),
// so every lock gets ONE jitter value and the highlight band stays clean across a lock. Normals: the lock's own, blended toward
// a smooth envelope (the skull's, or the tail's axis), so the shade and the highlight follow the head's roundness.
import fs from 'node:fs';
import path from 'node:path';
import * as S from '../sdf.mjs';
import { loadRig } from '../rig.mjs';
import { ROOT } from './glbio.mjs';
import { RIG_SOURCE, makeRigSource } from './make-rig.mjs';
import { contourPieces } from './pieces.mjs';
import { clipField, compactMesh } from './seam.mjs';
import { writeFigureGLB, compareSkeleton } from './writer.mjs';
import { Canvas, hex, mix3 } from './paint.mjs';
import { headShape } from '../assets/akari_head.mjs';
import { capShape } from '../assets/akari_hair_cap.mjs';
import { hairDesign, TAIL, C0, COLORS, SHEEN } from '../assets/akari_hair.mjs';
import { BOW, bowMeshes, tieMeshes } from '../assets/akari_hair_bow.mjs';
import { curve, curveAt, sweep, lensSection, join, normals, grid, V, sm } from '../assets/akari_hair_lib.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUTGLB = path.resolve(arg('out', path.join(ROOT, 'assets/models/sculpt/akari_hair.glb')));
const WORK = path.join(ROOT, '.tmp/akari-hair/out');
fs.mkdirSync(WORK, { recursive: true });
const log = (...a) => console.log(...a);
const t0 = Date.now();

// ------------------------------------------------------------------------------------------------ rig, head field, probes
if (!fs.existsSync(RIG_SOURCE)) await makeRigSource();
const rig = await loadRig(RIG_SOURCE);
const JN = rig.jointNames, jx = (n) => { const i = JN.indexOf(n); if (i < 0) throw new Error('no joint ' + n); return i; };
const head = headShape(S), hf = head.f;
const nearestJoint = (re, p) => { let best = -1, bd = 1e9; JN.forEach((n, i) => { if (!re.test(n)) return; const h = rig.bone(n).head, d = Math.hypot(h[0] - p[0], h[1] - p[1], h[2] - p[2]); if (d < bd) { bd = d; best = i; } }); return best; };
const J = {
  head: jx('J_Bip_C_Head'), neck: jx('J_Bip_C_Neck'),
  tailL: [nearestJoint(/^HairJoint/, [0.061, 1.506, -0.021]), nearestJoint(/^HairJoint/, [0.133, 1.386, -0.045]), nearestJoint(/^HairJoint/, [0.161, 1.237, -0.047])],
  tailR: [nearestJoint(/^HairJoint/, [-0.06, 1.506, -0.021]), nearestJoint(/^HairJoint/, [-0.136, 1.387, -0.044]), nearestJoint(/^HairJoint/, [-0.14, 1.237, -0.047])],
  sideL: [nearestJoint(/^HairJoint/, [0.075, 1.37, 0.049]), nearestJoint(/^HairJoint/, [0.071, 1.324, 0.045])],
  sideR: [nearestJoint(/^HairJoint/, [-0.074, 1.376, 0.053]), nearestJoint(/^HairJoint/, [-0.071, 1.324, 0.045])],
  strayL: [nearestJoint(/^HairJoint/, [0.081, 1.514, 0.02]), nearestJoint(/^HairJoint/, [0.119, 1.561, 0.018])],
  ribL: ['J_Sec_RibbonL_1_01', 'J_Sec_RibbonL_1_02', 'J_Sec_RibbonL_1_03'].map(jx),
  ribR: ['J_Sec_RibbonR_1_01', 'J_Sec_RibbonR_1_02', 'J_Sec_RibbonR_1_03'].map(jx),
};
const g3 = [0, 0, 0];
const headN = (p, e = 0.006) => { const x = p[0], y = p[1], z = p[2]; return V.nrm([hf(x + e, y, z) - hf(x - e, y, z), hf(x, y + e, z) - hf(x, y - e, z), hf(x, y, z + e) - hf(x, y, z - e)]); };
function march(o, d, off) {
  let p = o.slice(), t = 0;
  for (let i = 0; i < 600; i++) { const f = hf(p[0], p[1], p[2]) - off; if (f < 2e-5) break; const st = Math.max(f * 0.85, 1.5e-4); t += st; p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]; if (t > 0.6) throw new Error('probe missed the head from ' + o); }
  return p;
}
const D2R = Math.PI / 180;
const H = {
  F: (x, y, off) => march([x, y, 0.25], [0, 0, -1], off),
  Tp: (x, z, off) => march([x, 1.8, z], [0, -1, 0], off),
  Sd: (sd, y, z, off) => march([sd * 0.3, y, z], [-sd, 0, 0], off),
  Bk: (x, y, off) => march([x, y, -0.35], [0, 0, 1], off),
  R: (az, el, off) => { const d = [Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), Math.cos(az * D2R) * Math.cos(el * D2R)]; return march(V.add(C0, V.mul(d, 0.35)), V.mul(d, -1), off); },
};
H.tie = (sd) => H.R(sd * TAIL.tie[0], TAIL.tie[1], TAIL.tie[2]);
H.tailAxis = (sd) => [H.tie(sd), ...TAIL.axis.map((p) => (sd > 0 ? p.slice() : [-p[0], p[1] + TAIL.right.dy, p[2] + TAIL.right.dz]))];
const table = (tb, f) => { for (let i = 0; i < tb.length - 1; i++) if (f <= tb[i + 1][0]) { const t = (f - tb[i][0]) / (tb[i + 1][0] - tb[i][0]); return tb[i][1] + (tb[i + 1][1] - tb[i][1]) * t * t * (3 - 2 * t); } return tb[tb.length - 1][1]; };

// ------------------------------------------------------------------------------------------------ parts
// part = { name, group, mesh: { pos, idx, at }, mat: 'Hair' | 'Ribbon', node, env(p) -> normal | null, envK, weights(v, p, at) }
const parts = [];
// ---- the cap (kit contour of the field, interior thrown away)
{
  const A = path.join(ROOT, 'tools/sculpt/assets');
  const cap = await contourPieces(path.join(A, 'akari_hair_cap.mjs'), [{ name: 'cap', bounds: [-0.11, 1.3, -0.14, 0.11, 1.55, 0.105], voxel: 0.0018, planes: [], tris: 2100, key: 2 }],
    { cacheDir: path.join(ROOT, '.tmp/akari-hair/cache'), sources: [path.join(A, 'akari_hair_cap.mjs'), path.join(A, 'akari_head.mjs'), path.join(A, 'akari_body.mjs')], log, threads: +(process.env.SCULPT_THREADS || 2) });
  const c = clipField(cap.cap, (x, y, z) => hf(x, y, z) + 0.0015, { refine: 6 });
  const m = compactMesh({ pos: c.pos, idx: c.idx });
  const capF = capShape(S);
  parts.push({ name: 'cap', group: 'cap', mat: 'Hair', node: 'akari_hair', mesh: { pos: m.pos, idx: m.idx, at: Array.from({ length: m.pos.length / 3 }, () => ({ t: 0.5, side: 1, s: 0 })) },
    env: (p) => { capF.normal(p[0], p[1], p[2], g3, 0.007); return [g3[0], g3[1], g3[2]]; }, envK: 0.9, weights: () => [[J.head, 1]] });
}
// ---- locks
const tailAxes = { 1: curve(H.tailAxis(1), [], { per: 16 }), [-1]: curve(H.tailAxis(-1), [], { per: 16 }) };
const axisFrame = (c, s) => { const f = curveAt(c, s); const back = [0, 0, -1]; const e2 = V.nrm(V.sub(back, V.mul(f.T, V.dot(back, f.T)))), e1 = V.cross(f.T, e2); return { p: f.p, T: f.T, e1, e2 }; };
const nearestOnAxis = (c, p) => { let best = 0, bd = 1e9; for (let i = 0; i < c.P.length; i++) { const d = Math.hypot(c.P[i][0] - p[0], c.P[i][1] - p[1], c.P[i][2] - p[2]); if (d < bd) { bd = d; best = i; } } return c.P[best]; };
const chainW = (keys) => (y) => { // keys [[y, joint], ...] from high to low: smooth blend between neighbours
  if (y >= keys[0][0]) return [[keys[0][1], 1]];
  for (let i = 0; i < keys.length - 1; i++) { const [y0, j0] = keys[i], [y1, j1] = keys[i + 1]; if (y >= y1) { if (j0 === j1) return [[j0, 1]]; const t = sm(y0, y1, y); return [[j0, 1 - t], [j1, t]]; } }
  return [[keys[keys.length - 1][1], 1]];
};
const RULES = {
  head: () => [[J.head, 1]],
  // the nape locks: rigid on the head down to the occiput, the tips 40 % on the neck so a raised chin does not push them
  // into the collar
  nape: (y) => { const k = 0.4 * sm(1.375, 1.315, y); return k > 0 ? [[J.head, 1 - k], [J.neck, k]] : [[J.head, 1]]; },
  tailL: chainW([[1.452, J.head], [1.405, J.tailL[0]], [1.385, J.tailL[0]], [1.35, J.tailL[1]], [1.245, J.tailL[1]], [1.21, J.tailL[2]]]),
  tailR: chainW([[1.452, J.head], [1.405, J.tailR[0]], [1.385, J.tailR[0]], [1.35, J.tailR[1]], [1.245, J.tailR[1]], [1.21, J.tailR[2]]]),
  sideL: chainW([[1.415, J.head], [1.385, J.sideL[0]], [1.35, J.sideL[0]], [1.325, J.sideL[1]]]),
  sideR: chainW([[1.415, J.head], [1.385, J.sideR[0]], [1.35, J.sideR[0]], [1.325, J.sideR[1]]]),
  ribbonL: chainW([[1.478, J.head], [1.455, J.ribL[0]], [1.41, J.ribL[0]], [1.385, J.ribL[1]], [1.33, J.ribL[1]], [1.31, J.ribL[2]]]),
  ribbonR: chainW([[1.478, J.head], [1.455, J.ribR[0]], [1.41, J.ribR[0]], [1.385, J.ribR[1]], [1.33, J.ribR[1]], [1.31, J.ribR[2]]]),
};
const design = hairDesign(H);
let cell = 0;
for (const lk of design) {
  let pts, vals, up, env, envK;
  if (lk.tailLock) {
    const q = lk.tailLock, c = tailAxes[lk.side], s0 = 0.002, s1 = c.L * q.frac, n = 9;
    pts = []; vals = [[], [], [], [], []];
    for (let i = 0; i < n; i++) {
      const s = s0 + (s1 - s0) * (i / (n - 1)), fa = s / c.L, fl = i / (n - 1), fr = axisFrame(c, s);
      const th = (q.ang + TAIL.twist * fa * lk.side) * D2R, dir = V.add(V.mul(fr.e1, Math.sin(th)), V.mul(fr.e2, Math.cos(th)));
      // the tail's section is an oval, broad across (seen from behind) and shallower front to back; the tips fan out
      const r = table(TAIL.r, fa) * q.osc + (i === n - 1 ? 0.006 : 0) + (q.osc < 0.5 ? 0.002 * Math.sin(fl * Math.PI) : 0);
      const off = V.add(V.mul(fr.e1, Math.sin(th) * r * TAIL.across), V.mul(fr.e2, Math.cos(th) * r * TAIL.depth));
      pts.push(V.add(fr.p, off));
      vals[0].push(table(TAIL.hw, fl) * q.wsc); vals[1].push(table(TAIL.ht, fl) * q.tsc); vals[2].push(dir[0]); vals[3].push(dir[1]); vals[4].push(dir[2]);
    }
    up = (p, T, t, sc) => [sc[2], sc[3], sc[4]];
    env = (p) => { const q = nearestOnAxis(c, p), d = V.sub(p, q); return V.nrm(V.add(V.nrm(d), [0, 0, -0.25])); }; envK = 0.72;
  } else {
    pts = lk.pts; vals = [lk.hw, lk.ht];
    // side locks: below the cheekbone the lock's flat face turns forward, so from the front it shows its width (not an edge)
    up = lk.group === 'side' ? (p) => V.nrm(V.add(headN(p, 0.008), [0, 0, 1.3 * sm(1.43, 1.37, p[1])])) : (p) => headN(p, 0.008);
    env = (p) => headN(p, 0.012); envK = lk.group === 'fringe' ? 0.62 : lk.group === 'side' ? 0.66 : 0.8;
  }
  const c = curve(pts, vals, { per: 14 });
  // the painted sheen band: where the centreline is inside it, with rings on both borders (crisp edges)
  const jit = ((Math.sin(cell * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1 - 0.5;
  let inBand;
  if (lk.tailLock) {
    const q = lk.tailLock, La = tailAxes[lk.side].L, s0 = 0.002, s1 = La * q.frac, lo = SHEEN.tail[0] + jit * 2 * SHEEN.tailJitter, hi = SHEEN.tail[1] + jit * 2 * SHEEN.tailJitter;
    inBand = (a) => { const fa = (s0 + (s1 - s0) * (a / c.L)) / La; return fa > lo && fa < hi; };
  } else {
    inBand = (a) => { const p = curveAt(c, a).p, dx = p[0] - C0[0], dy = p[1] - C0[1], dz = p[2] - C0[2], el = Math.asin(dy / Math.hypot(dx, dy, dz)) * 180 / Math.PI, az = Math.abs(Math.atan2(dx, dz) * 180 / Math.PI);
      return Math.abs(el - table(SHEEN.el, az) - jit * 2 * SHEEN.jitter) < SHEEN.half; };
  }
  const extra = [];
  // revision 2: with a faint sheen (SHEEN.k < 0.5) the band gets no forced border rings: a soft glint, and ~2.5 k fewer tris
  if ((SHEEN.k ?? 1) >= 0.5) { let prev = inBand(0); const N = 160; for (let i = 1; i <= N; i++) { const a = c.L * i / N, cur = inBand(a); if (cur !== prev) { let lo = c.L * (i - 1) / N, hi = a; for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (inBand(m) === prev) lo = m; else hi = m; } const b = (lo + hi) / 2; extra.push(b - 0.0007, b + 0.0007); } prev = cur; } }
  const mesh = sweep({ curve: c, ds: lk.ds || 0.007, minRings: 7, dens: 1.15, tip: lk.tip || 'point', root: 'cap', up, extra,
    section: (t, sc) => lensSection(lk.K || 8, Math.max(sc[0], 0.0004), Math.max(sc[1], 0.0003), { bias: lk.lean || 0, under: lk.group === 'tail' ? 0.75 : 0.5 }) });
  const rule = RULES[lk.weights] || RULES.head;
  const wFn = lk.weights === 'strayL' ? (y, a) => { const t = a.t; if (t < 0.35) return [[J.head, 1]]; if (t < 0.65) { const k = sm(0.35, 0.65, t); return [[J.head, 1 - k], [J.strayL[0], k]]; } const k = sm(0.65, 1, t); return [[J.strayL[0], 1 - k], [J.strayL[1], k]]; } : (y) => rule(y);
  cell++;
  parts.push({ name: lk.name, group: lk.group, mat: 'Hair', node: 'akari_hair', mesh, env, envK, inBand, weights: (v, p, a) => wFn(p[1], a) });
}
// ---- ties (Ribbon material, in the hair node: they belong to the tails)
for (const sd of [1, -1]) {
  const c = tailAxes[sd], f = curveAt(c, 0.004);
  for (const t of tieMeshes({ c: tailAxes[sd].P[0], T: f.T, B: [sd, 0, 0] }, TAIL.wrap, TAIL.cord, sd))
    parts.push({ name: 'tie_' + t.name + (sd > 0 ? 'L' : 'R'), group: 'tie', kind: t.kind, mat: 'Ribbon', node: 'akari_hair', mesh: t.mesh, env: null, envK: 0, weights: () => [[J.head, 1]] });
}
// ---- the bow
{
  const O0 = H.R(BOW.at[0], BOW.at[1], BOW.at[2]);
  const Z = headN(O0, 0.01), X = V.nrm(V.sub([1, 0, 0], V.mul(Z, Z[0]))), Y = V.cross(Z, X);
  const F = { O: O0, X, Y: Y[1] > 0 ? Y : V.mul(Y, -1), Z };
  for (const b of bowMeshes(F))
    parts.push({ name: 'bow_' + b.name, group: 'bow', kind: b.kind, mat: 'Ribbon', node: 'akari_ribbon', mesh: b.mesh, env: null, envK: 0,
      weights: b.kind === 'tail' ? (v, p) => (b.sd > 0 ? RULES.ribbonL : RULES.ribbonR)(p[1]) : () => [[J.head, 1]] });
  log(`  bow at ${O0.map((v) => v.toFixed(3))}, face ${Z.map((v) => v.toFixed(2))}`);
}

// ------------------------------------------------------------------------------------------------ normals, depth, weights
const allPos = join(parts.map((p) => p.mesh)).pos, owner = new Int32Array(allPos.length / 3);
{ let o = 0; parts.forEach((p, i) => { owner.fill(i, o, o + p.mesh.pos.length / 3); o += p.mesh.pos.length / 3; }); }
const G = grid(allPos, 0.008);
const prims = { Hair: [], RibbonHair: [], RibbonBow: [] };
const stats = {};
for (const [pi, P] of parts.entries()) {
  const m = P.mesh, n = m.pos.length / 3, nrm = normals(m.pos, m.idx), uv = new Float32Array(n * 2), Jv = new Uint16Array(n * 4), Wv = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]], a = m.at[v];
    let N = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    if (P.env) {
      const e = P.env(p), side = a.side ?? 1;
      // revision 2: the envelope's normal dominates on top AND underneath, so interior lock edges never turn to the view
      // (they drew pale rim lines along every lock); the lock form reads through the ramp (darker edges) and the ink
      const k = P.envK * (side > 0 ? 1 - 0.12 * Math.abs(a.s ?? 0) : side === 0 ? 0.9 : 0.8);
      N = V.nrm(V.add(V.mul(N, 1 - k), V.mul(e, k)));
    }
    nrm[v * 3] = N[0]; nrm[v * 3 + 1] = N[1]; nrm[v * 3 + 2] = N[2];
    // occlusion: other parts' surface in front of this vertex (under-layers between locks go deep)
    let occ = 0;
    G.near(p[0], p[1], p[2], 0.0075, (q) => {
      if (owner[q] === pi) return;
      const dx = allPos[q * 3] - p[0], dy = allPos[q * 3 + 1] - p[1], dz = allPos[q * 3 + 2] - p[2], d = Math.hypot(dx, dy, dz), h = dx * N[0] + dy * N[1] + dz * N[2];
      if (d < 0.0075 && h > 0.0008) occ += (1 - d / 0.0075) * Math.min(1, h / 0.003);
    });
    occ = Math.min(1, occ / 3.5);
    let d;
    if (P.mat === 'Hair') {
      if (P.group === 'cap') d = 0.58;
      else {
        const side = a.side ?? 1, s = Math.abs(a.s ?? 0);
        d = side > 0 ? 0.02 + 0.36 * Math.pow(s, 2.2) : side === 0 ? 0.3 : 0.66;
        if (a.t < 0.14 && !a.apex) d += 0.3 * (1 - a.t / 0.14);
      }
      d = Math.min(1, d + 0.55 * occ);
      // sheen: on the lock's crest inside the band, fading toward the lock's edges, none underneath or under other locks
      let h = 0;
      if (P.inBand && !a.apex && a.ring >= 0 && P.inBand(a.arc)) { const side = a.side ?? 1, sx = Math.abs(a.s ?? 0); h = side > 0 ? 1 - 0.8 * Math.pow(sx, 1.4) : side === 0 ? 0.15 : 0; h *= 1 - occ; if (P.group === 'tail') h *= SHEEN.tailK; h *= SHEEN.k ?? 1; }
      uv[v * 2] = 0.03 + 0.94 * h; uv[v * 2 + 1] = (0.1 + 0.8 * d) / 6;
    } else {
      // Ribbon ramp: u = depth, v = colour family (rows: vermilion / paper / cord)
      const face = a.face ?? (a.side > 0 ? 0 : a.side < 0 ? 1 : 2);
      d = face === 0 ? 0.05 : face === 1 ? 0.5 : 0.28;
      if (P.kind === 'loop') d = (a.side > 0 ? 0.04 : a.side < 0 ? 0.45 : 0.25) + 0.12 * Math.abs(a.s ?? 0);
      d = Math.min(0.95, d + 0.5 * occ);
      const row = P.kind === 'paper' ? 1 : P.kind === 'cord' ? 2 : 0;
      uv[v * 2] = 0.04 + 0.92 * d; uv[v * 2 + 1] = (row + 0.5) / 3;
    }
    const w = P.weights(v, p, a).filter(([, x]) => x > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4), ws = w.reduce((s2, x) => s2 + x[1], 0) || 1;
    w.forEach(([j, x], k) => { Jv[v * 4 + k] = j; Wv[v * 4 + k] = x / ws; });
  }
  const prim = { pos: m.pos, nrm, uv, idx: m.idx, J: Jv, W: Wv };
  (P.mat === 'Hair' ? prims.Hair : P.node === 'akari_hair' ? prims.RibbonHair : prims.RibbonBow).push(prim);
  stats[P.group] = (stats[P.group] || 0) + m.idx.length / 3;
}
const merge = (list) => { const j = join(list.map((p) => ({ pos: p.pos, idx: p.idx }))), cat = (k, T) => { const n = list.reduce((s2, p) => s2 + p[k].length, 0), o = new T(n); let q = 0; for (const p of list) { o.set(p[k], q); q += p[k].length; } return o; }; return { pos: j.pos, idx: j.idx, nrm: cat('nrm', Float32Array), uv: cat('uv', Float32Array), J: cat('J', Uint16Array), W: cat('W', Float32Array) }; };

// ------------------------------------------------------------------------------------------------ textures
const lin = (c) => c;
function hairRamp() {
  const s = 64, c = new Canvas(s, s, hex(COLORS.mid), 1), top = hex(COLORS.top), mid = hex(COLORS.mid), deep = hex(COLORS.deep), sh = hex(COLORS.sheen), she = hex(COLORS.sheenEdge);
  c.each((px, py) => {
    const v = ((py / s) * 6) % 1, d = Math.max(0, Math.min(1, (v - 0.1) / 0.8)), h = Math.max(0, Math.min(1, (px / s - 0.03) / 0.94));
    let col = d < 0.42 ? mix3(top, mid, sm(0, 0.42, d)) : mix3(mid, deep, sm(0.42, 1, d));
    col = mix3(col, mix3(she, sh, sm(0.3, 0.9, h)), sm(0.05, 0.45, h) * (1 - 0.75 * d));
    return [lin(col[0]), lin(col[1]), lin(col[2]), 1];
  }, undefined, 'set');
  return c;
}
function ribbonRamp() {
  const s = 64, c = new Canvas(s, s, [1, 1, 1], 1);
  const fam = [[hex(COLORS.ribbon), hex(COLORS.ribbonDeep)], [hex(COLORS.paper), hex(COLORS.paperDeep)], [hex(COLORS.cord), hex(COLORS.cordDeep)]];
  c.each((px, py) => { const row = Math.min(2, Math.floor((py / s) * 3)), u = Math.max(0, Math.min(1, (px / s - 0.04) / 0.92)); const col = mix3(fam[row][0], fam[row][1], sm(0, 1, u)); return [col[0], col[1], col[2], 1]; }, undefined, 'set');
  return c;
}
const tex = { Hair: hairRamp(), Ribbon: ribbonRamp() };
fs.writeFileSync(path.join(WORK, 'tex_hair.png'), tex.Hair.png()); fs.writeFileSync(path.join(WORK, 'tex_ribbon.png'), tex.Ribbon.png());
const MAT = {
  // hairBand (read by the game's hairBand(), job heroine-look): the light-following ring on THIS hair, bind space, y above
  // the head centre (Face bbox centre y 1.4101) -> a horizontal ring at y 1.482 across the crown, no zig-zag teeth
  Hair: { name: 'Hair', extras: { shadeColor: [0.6, 0.62, 0.92], hairBand: { y: 0.072, half: 0.009, strength: 0.9, teeth: 0 } }, tex: { name: 'Hair', bytes: tex.Hair.png(), mime: 'image/png' } },
  Ribbon: { name: 'Ribbon', extras: { shadeColor: [0.62, 0.12, 0.16] }, tex: { name: 'Ribbon', bytes: tex.Ribbon.png(), mime: 'image/png' } },
};

// ------------------------------------------------------------------------------------------------ write
const hairPrim = { material: MAT.Hair, ...merge(prims.Hair) }, tiePrim = { material: MAT.Ribbon, ...merge(prims.RibbonHair) }, bowPrim = { material: MAT.Ribbon, ...merge(prims.RibbonBow) };
const meshes = [{ node: 'akari_hair', prims: [hairPrim, tiePrim] }, { node: 'akari_ribbon', prims: [bowPrim] }];
fs.mkdirSync(path.dirname(OUTGLB), { recursive: true });
await writeFigureGLB(RIG_SOURCE, OUTGLB, meshes, {});
const sk = await compareSkeleton(RIG_SOURCE, OUTGLB);
const tris = { hair: hairPrim.idx.length / 3, ties: tiePrim.idx.length / 3, bow: bowPrim.idx.length / 3 };
const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < hairPrim.pos.length; i += 3) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], hairPrim.pos[i + k]); bb[k + 3] = Math.max(bb[k + 3], hairPrim.pos[i + k]); }
const info = { file: path.relative(ROOT, OUTGLB), bytes: fs.statSync(OUTGLB).size, tris, groups: stats, locks: design.length, hairBox: bb.map((v) => +v.toFixed(4)), skeleton: sk, joints: J, seconds: (Date.now() - t0) / 1000 };
fs.writeFileSync(path.join(WORK, 'build.json'), JSON.stringify(info, null, 1));
log(`akari_hair: hair ${tris.hair} + ties ${tris.ties} tris (node akari_hair), bow ${tris.bow} tris (akari_ribbon); ${design.length} locks; groups ${JSON.stringify(stats)}`);
log(`  skeleton ${JSON.stringify(sk)}; hair box ${info.hairBox.join(' ')}; ${info.bytes} bytes -> ${info.file} (${info.seconds.toFixed(1)} s)`);

// ------------------------------------------------------------------------------------------------ test character (--test-char)
// char_akari_hair = the present char_akari_v3 with this hair and bow swapped in, registered as manifest entry char_akari_hair
// (the v3 entry's fields, preload:false) -> ?akari=hair. Only this id is patched, through tools/manifest-patch.mjs.
if (args.includes('--test-char')) {
  const { swapHair } = await import('./swap-hair.mjs');
  const { execFileSync } = await import('node:child_process');
  const FILE = 'models/chars/char_akari_hair.glb', out = path.join(ROOT, 'assets', FILE);
  const r = await swapHair(path.join(ROOT, 'assets/models/chars/char_akari_v3.glb'), OUTGLB, out, { log });
  const sk2 = await compareSkeleton(path.join(ROOT, 'assets/models/chars/char_akari_v3.glb'), out);
  if (!sk2.sameJoints || !sk2.sameIBM || !sk2.sameRest) throw new Error('skeleton changed: ' + JSON.stringify(sk2));
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')), v3 = man.char_akari_v3 || man.char_akari;   // wardrobe: the v3 test entry is gone, char_akari carries its fields
  const { io } = await import('./glbio.mjs');
  const doc = await io().read(out); let all = 0; const mn = [9, 9, 9], mx = [-9, -9, -9], mats = new Set(), meshes = [];
  for (const nd of doc.getRoot().listNodes()) { const m = nd.getMesh(); if (!m) continue; meshes.push(nd.getName());
    for (const p of m.listPrimitives()) { mats.add(p.getMaterial().getName()); all += p.getIndices().getCount() / 3; const P = p.getAttribute('POSITION').getArray(); for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i + a]); mx[a] = Math.max(mx[a], P[i + a]); } } }
  // springs for the heavier tails (spring.js maps stiffness -> pull 0.11 x, drag -> damp 0.2 x): looser and less damped
  // than the solver's hair default (pull 0.085, damp 0.09), so the tails lag, overshoot and settle; a thicker hit radius
  // for the fuller tails against the chest / arm / neck capsules
  const HAIR_SPRING = { stiffness: 0.55, drag: 0.32, gravity: 0.3, hit: 0.026 };
  const entry = { ...v3, springDefaults: { ...(v3.springDefaults || {}), hair: HAIR_SPRING }, file: FILE, preload: false, size: mx.map((v, a) => +(v - mn[a]).toFixed(3)), tris: all, bytes: r.bytes, meshes, materials: [...mats].sort(),
    license: 'CC0 (original body, face, undergarment, outfit, hair, bow and textures made for this project; skeleton: VRoid HairSample_Female, CC0)',
    author: 'sculpted / generated for this project (tools/sculpt/figure, tools/costume/v3.mjs, tools/sculpt/figure/build-hair.mjs); skeleton: pixiv Inc. (VRoid Project) CC0',
    source: 'char_akari_v3 with the re-sculpted hair + bow swapped in: tools/sculpt/figure/build-hair.mjs --test-char (tools/sculpt/assets/akari_hair*.mjs, swap-hair.mjs)',
    notes: 'Test heroine behind ?akari=hair: char_akari_v3 (layered outfit, docs/api/heroine.md) with the re-sculpted hair (akari_hair: cap + swept locks, '
      + 'Hair + the tail ties in Ribbon) and bow (akari_ribbon). Same skeleton / inverse binds / clips / morphs / chains as char_akari_v3; the hair and bow tails '
      + 'are weighted to the HairJoint and J_Sec_Ribbon chains.' };
  const frag = path.join(WORK, 'manifest.fragment.json'); fs.writeFileSync(frag, JSON.stringify({ char_akari_hair: entry }, null, 1));
  log(execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), frag], { encoding: 'utf8' }).trim());
  const back = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')).char_akari_hair;
  log(`  manifest read back: char_akari_hair ${back && back.file === FILE ? 'present' : 'MISSING'} (${back?.tris} tris, ${back?.bytes} bytes)`);
}
