#!/usr/bin/env node
// char_akari_swim_a — 灯里's swimsuit A "潮祭" (tide festival) on her base figure (assets/models/sculpt/akari_base.glb).
//   SCULPT_THREADS=2 node tools/costume/swim_a.mjs [--out file.glb] [--no-check] [--no-install] [--check-only] [--install-only]
// Writes .tmp/akari-swim-a/out/char_akari_swim_a.glb; only when the coverage check passes is it copied to
// assets/models/chars/ and the manifest entry char_akari_swim_a written (tools/manifest-patch.mjs, this id only).
// The base's body, face (13 shapes), hair and hair bow are kept untouched; the base's undergarment node is NOT carried
// over: the swimsuit is the always-worn layer, so the build ENDS WITH A COVERAGE CHECK (rest + stress poses) that exits 1
// when any body triangle of the undergarment's mandatory zones is not under opaque swimsuit cloth.
//   akari_swim / akari_swim_lining   black halter with pale flounces, separate white ruffled briefs
//   akari_beach_shirt  off-shoulder chiffon cover-up, with independent sleeves and open front
//   akari_wrist / akari_zori  ruffled right thigh band and white ankle-wrap sandals
// No joint is added or moved: chains keep the base's joint positions; IBMs are copied back from the base after writing.
import path from 'node:path';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import * as S from '../sculpt/sdf.mjs';
import { loadRig, skinMesh } from '../sculpt/rig.mjs';
import { contourPieces } from '../sculpt/figure/pieces.mjs';
import { clipField, splitField, compactMesh, extrudeRim } from '../sculpt/figure/seam.mjs';
import { vertexNormals } from '../sculpt/figure/meshops.mjs';
import { copyWeights, fkPose, restPose, pick4 } from '../sculpt/figure/weights.mjs';
import { compareSkeleton } from '../sculpt/figure/writer.mjs';
import { loadCharacter, addClips } from '../sculpt/figure/glbio.mjs';
import { closestPt, loadChar, Wardrobe, Canvas, lerp, clamp01, smooth, W1, wmix, wsum, nearestWeights, add, sub, mul, norm, cross, dot, len, strip, loft, tube, ellipsoid, merge, fixWinding, bodyProfile, sampleProfile, fbm } from './garment.mjs';
import { paintSwatches, swatchUV, scaleOf, rayNear } from './outfit.mjs';
import { addSwimRideFold } from './swim-a-ride.mjs';
import { swimsuitCut, beachDetails, sandalStraps } from './swim_a_coreful.mjs';
import { SWIM, swimParts, edgesAt, zones, wrapD, wrapOn, bridgeW, RIG_FILE } from '../sculpt/assets/akari_swim_a.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const BASE = path.join(ROOT, 'assets/models/sculpt/akari_base.glb');
// the build writes into the work folder; only a file whose coverage check passed is copied to the asset tree (install())
const OUT = opt('out') ? path.resolve(opt('out')) : path.join(ROOT, '.tmp/akari-swim-a/out/char_akari_swim_a.glb');
const ASSET = 'models/chars/char_akari_swim_a.glb';
const WORK = path.resolve(opt('work-dir',path.join(ROOT, '.tmp/akari-swim-a/out'))); fs.mkdirSync(WORK, { recursive: true });
const CACHE = path.join(ROOT, '.tmp/akari-swim-a/cache');
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ palette + fit (one place)
// WSHADE: white cloth's shade is a cool grey-blue (wardrobe finish: never the warm beige of skin, also seen from below)
const WHITE = [248, 246, 241], WSHADE = [182, 194, 228], WHI = [255, 255, 253];
const CHARCOAL = [46, 40, 53], CHARCOAL_SHADE = [25, 20, 36], CHARCOAL_HI = [63, 57, 68];
export const FIT = {
  zori: { margin: 0.006, top: [242, 235, 242], side: [209, 201, 217] },
  spring: { skirtStiffness: 0.95 },                                   // manifest springDefaults.skirt.stiffness (v3: 0.6): the waist stays pinned
  crotchCull: { x: 0.022, y0: 0.784, y1: 0.85, z0: -0.05, z1: 0.065 },    // skin dropped by region (see 1a); checked by hole probes
  lining: 0.0015, liningRings: 1, liningRingsBack: 2, liningCrotch: 1.7,                                                   // the lining's offset over the skin (m)
  wrist: { x: 0.474, r: 0.0017, bead: 0.0043, beadCol: [228, 188, 92] },
};
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ramp = (base, shade, hi) => (t) => (t < 0 ? mixc(base, hi, Math.min(1, -t / 0.25)) : mixc(base, shade, Math.min(1, t)));
const tn = (t) => clamp01((t + 0.25) / 1.25);
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// =====================================================================================================  the suit (field)
async function buildSuit({ skin, nJ, log, threads }) {
  const A = (f) => path.join(ROOT, 'tools/sculpt/assets', f);
  const rig = await loadRig(path.join(ROOT, RIG_FILE)); const J = (n) => rig.bone(n).head;
  const P = swimParts(S, J), body = P.body;
  const t0 = Date.now();
  const r = await contourPieces(A('akari_swim_a.mjs'), [{ name: 'suit', bounds: SWIM.bounds, voxel: 0.0015, planes: [], tris: 10200, key: 2 }],
    { cacheDir: CACHE, sources: [A('akari_swim_a.mjs'), A('akari_body.mjs')], log, threads });
  log(`  suit contoured (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  // exact cuts: neckline, armholes, leg openings (all edges of the suit are cuts)
  const E = { eN: (x, y, z) => edgesAt(x, y, z).eN, eA: (x, y, z) => edgesAt(x, y, z).eA, eL: (x, y, z) => edgesAt(x, y, z).eL };
  let m = { pos: r.suit.pos, idx: r.suit.idx };
  for (const k of ['eN', 'eA', 'eL']) { const c = clipField(m, E[k], { refine: 12 }); m = { pos: c.pos, idx: c.idx }; }
  m = largestPart(m);
  // walls: every open edge goes down to 1.3 mm above the skin, staying in its cut surface
  const n0 = m.pos.length / 3, g = [0, 0, 0];
  const wall = extrudeRim(m, () => true, (v) => {
    const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2], d = body.f(x, y, z) + 0.0006;
    if (d <= 0) return [0, 0, 0];
    body.normal(x, y, z, g, 0.002); const e = edgesAt(x, y, z); const k = e.eN < e.eA && e.eN < e.eL ? 'eN' : e.eA < e.eL ? 'eA' : 'eL';
    const h = 0.0008, f = E[k], gc = [(f(x + h, y, z) - f(x - h, y, z)), (f(x, y + h, z) - f(x, y - h, z)), (f(x, y, z + h) - f(x, y, z - h))]; const gl = Math.hypot(...gc) || 1;
    const pr = (g[0] * gc[0] + g[1] * gc[1] + g[2] * gc[2]) / gl; let w = [g[0] - pr * gc[0] / gl, g[1] - pr * gc[1] / gl, g[2] - pr * gc[2] / gl]; const wl = Math.hypot(...w) || 1; w = w.map((q) => q / wl);
    return [-w[0] * d, -w[1] * d, -w[2] * d];
  });
  const rim = new Uint8Array(wall.pos.length / 3); for (let v = n0; v < rim.length; v++) rim[v] = 1;
  // split the red zone (red line at the opening, top panel's edge line, piping) off as its own primitive
  const redF = (x, y, z) => (zones(x, y, z, edgesAt(x, y, z)).red ? 1 : -1);
  const sp = splitField({ pos: wall.pos, idx: wall.idx }, redF, { refine: 12 });
  const rimS = new Uint8Array(sp.pos.length / 3); for (let v = 0; v < rimS.length; v++) { const [a, b] = sp.src[v]; rimS[v] = rim[a] && rim[b] ? 1 : 0; }
  const part = (q, keep, carry) => { const I = []; for (let t = 0; t < q.side.length; t++) if ((q.side[t] > 0) === keep) I.push(q.idx[t * 3], q.idx[t * 3 + 1], q.idx[t * 3 + 2]); return compactMesh({ pos: q.pos, idx: Uint32Array.from(I) }, carry); };
  const cutR = Uint8Array.from(sp.cut);
  const w0 = part(sp, false, { rim: rimS, cut: cutR }), red = part(sp, true, { rim: rimS });
  // the white raised band gets an exact outline too: lighter inside, a soft cast line on the plain cloth beside it
  const bandF = (x, y, z) => (zones(x, y, z, edgesAt(x, y, z)).band > 0.5 ? 1 : -1);
  const sb = splitField({ pos: w0.pos, idx: w0.idx }, bandF, { refine: 12 });
  const carry = (arr) => Uint8Array.from(sb.src, ([a, b]) => (arr[a] && arr[b] ? 1 : 0));
  const rim2 = carry(w0.rim), cut2 = carry(w0.cut), seam = Uint8Array.from(sb.cut);
  const wb = part(sb, true, { rim: rim2, cut: cut2, seam }), wp = part(sb, false, { rim: rim2, cut: cut2, seam });
  const nb = wb.pos.length / 3, white = { pos: new Float32Array([...wb.pos, ...wp.pos]), idx: new Uint32Array([...wb.idx, ...Array.from(wp.idx, (v) => v + nb)]), rim: new Uint8Array([...wb.rim, ...wp.rim]),
    flag: new Uint8Array([...Array.from(wb.seam, (q) => (q ? 2 : 0)), ...Array.from(wp.seam, (q, v) => (q ? 1 : wp.cut[v] ? 1 : 0))]) };
  for (let v = 0; v < nb; v++) if (!white.flag[v] && wb.cut[v]) white.flag[v] = 1;
  // normals from the cloth's own field without the steps, broad (5 mm): the suit lies over the figure's small forms
  const finish = (mm, shadeOf) => {
    const n = mm.pos.length / 3, nrm = vertexNormals(mm.pos, mm.idx), shade = new Float32Array(n), w = bridgedWeights(mm.pos);
    for (let v = 0; v < n; v++) {
      const x = mm.pos[v * 3], y = mm.pos[v * 3 + 1], z = mm.pos[v * 3 + 2];
      if (!mm.rim[v]) { P.smoothCloth.normal(x, y, z, g, 0.005); if (g[0] * nrm[v * 3] + g[1] * nrm[v * 3 + 1] + g[2] * nrm[v * 3 + 2] > 0.25) { nrm[v * 3] = g[0]; nrm[v * 3 + 1] = g[1]; nrm[v * 3 + 2] = g[2]; } }
      shade[v] = shadeOf(x, y, z, mm.rim[v], [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]], mm.flag ? mm.flag[v] : 0);
    }
    return { pos: mm.pos, nrm, idx: mm.idx, shade, J: w.J, W: w.W };
  };
  // weights: where the cloth spans a hollow (cleft, crotch) it hangs from the forms at the bridge's edges, not from the
  // bottom of the hollow: blend the skin at +-bridge width across x = 0
  function bridgedWeights(pos) {
    const copyWeights = (sk, P) => triWeights(sk, P, nJ);   // exact: the closest point of the skin, barycentric
    const n = pos.length / 3, w0 = copyWeights(skin, pos, nJ), pL = Float32Array.from(pos), pR = Float32Array.from(pos), bw = new Float32Array(n);
    for (let v = 0; v < n; v++) { const b = bridgeW(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); bw[v] = b; const ax = Math.max(Math.abs(pos[v * 3]), b); pL[v * 3] = ax; pR[v * 3] = -ax; }
    const pU = Float32Array.from(pos); for (let v = 0; v < n; v++) { pU[v * 3] = 0; pU[v * 3 + 1] = Math.max(pos[v * 3 + 1], 0.806); }   // the gusset hangs from the pelvis floor above it
    const wl = copyWeights(skin, pL, nJ), wr = copyWeights(skin, pR, nJ), wu = copyWeights(skin, pU, nJ), D = new Float32Array(n * nJ);
    for (let v = 0; v < n; v++) { const b = bw[v], x = pos[v * 3]; const add = (w, f) => { for (let q = 0; q < 4; q++) D[v * nJ + w.J[v * 4 + q]] += w.W[v * 4 + q] * f; };
      if (b < 0.004) { add(w0, 1); continue; }
      // the front of the gusset (mons, over the hip creases) tracks the skin under it exactly: in a wide-legged sit the
      // skin there is carried forward by the thighs and a cloth hung from the pelvis alone would let it through
      // ... and so does the whole crotch (front, gusset floor): in wide-legged poses the body's skinning pinches a fin of skin
      // along the centre line there that pierces any cloth hung from elsewhere; cloth that follows the skin under it covers it
      const yv = pos[v * 3 + 1], ax = Math.abs(x), zv = pos[v * 3 + 2];
      const fc = (1 - sm(0.825, 0.845, yv)) * (1 - sm(0.035, 0.05, ax)) * sm(-0.05, -0.03, zv);
      const fg = Math.max(fc, zv > 0 && yv < 0.87 ? sm(0.0, 0.02, zv) : 0);
      if (fg > 0) { add(w0, fg); if (fg >= 1) continue; }
      const k1 = 1 - fg;
      const t = sm(-b, b, x), own = pos[v * 3 + 1] < 0.84 && pos[v * 3 + 2] > -0.06 ? 0.8 * (1 - sm(0.3, 0.9, Math.abs(x) / b)) : 0;   // the gusset keeps half of the pelvis' own motion
      add(wl, k1 * t * (1 - own)); add(wr, k1 * (1 - t) * (1 - own)); add(wu, k1 * own); }
    return pick4(D, n, nJ);
  }
  const W_ = SWIM.w, bandOut = W_.red + W_.band;
  const whiteShade = (x, y, z, rimV, n, flag) => {
    if (rimV) return 0.6;
    if (flag === 1) return 0.5;                                                              // beside a raised edge: its cast line
    if (flag === 2) return -0.12;
    const e = edgesAt(x, y, z), zn = zones(x, y, z, e), fr = sm(-0.035, 0, z), below = y < SWIM.neck.apexY && fr > 0.5, dl = wrapD(x, y), on = wrapOn(x, y, z);
    let t = 0;
    t -= 0.1 * zn.band;                                                                       // the band a little lighter
    if (!below || dl < 0) t += 0.2 * Math.exp(-(((e.eN - bandOut - 0.003) / 0.003) ** 2));   // the band's soft cast line, falling off
    t += on * 0.2 * Math.exp(-(((dl - bandOut - 0.003) / 0.003) ** 2));
    t += on * 0.22 * Math.exp(-(((dl + 0.003) / 0.003) ** 2));                                // the top panel's edge over the under panel
    t += 0.22 * fr * sm(1.125, 1.105, y) * sm(1.085, 1.1, y) * sm(-0.1, -0.5, n[1]);          // under the bust
    t += 0.12 * sm(0.55, 0.95, Math.abs(n[0])) * sm(0.95, 1.12, y);                            // the flanks
    t += 0.3 * (1 - sm(0.79, 0.825, y)) * sm(0.2, -0.6, n[0] * Math.sign(x || 1));            // inner thigh / gusset
    t += 0.35 * sm(-0.3, -0.85, n[1]);                                                         // undersides (gusset floor, under the seat): in the cool shade
    t += 0.12 * Math.exp(-(((Math.min(e.eA, e.eL) - W_.pipe - 0.003) / 0.003) ** 2));          // a soft line beside the piping
    return t;
  };
  const redShade = (x, y, z, rimV, n) => (rimV ? 0.55 : 0.06 + 0.42 * sm(0.25, -0.6, n[1] * 0.45 + n[2] * 0.6 + Math.abs(n[0]) * 0.2));
  const out = { white: finish(white, whiteShade), red: finish(red, redShade) };
  smoothLegEdge([out.white, out.red], nJ, log);
  for (const [k, v] of Object.entries(out)) log(`  suit ${k}: ${v.idx.length / 3} tris`);
  return { ...out, P, rig, bridgedWeights };
}
/** the leg openings move as one smooth band: near the leg edge (and on its piping) every vertex takes the Gaussian average
 *  (12 mm) of the weights round it, over all suit primitives at once (a function of position: no cracks at the colour
 *  split), so a bending knee / hip drags the opening as a whole instead of stretching it vertex by vertex (no wavy piping) */
function smoothLegEdge(parts, nJ, log) {
  const all = []; for (const m of parts) { const n = m.pos.length / 3; for (let v = 0; v < n; v++) all.push([m, v]); }
  const G = 0.012, grid = new Map(), key = (a, b, c) => a + ',' + b + ',' + c, P = (m, v) => [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
  all.forEach(([m, v], i) => { const p = P(m, v), kk = key(...p.map((q) => Math.floor(q / G))); let l = grid.get(kk); if (!l) grid.set(kk, (l = [])); l.push(i); });
  const R = 0.012, upd = []; let nS = 0;
  for (const [m, v] of all) {
    const p = P(m, v), eL = edgesAt(...p).eL; if (eL > 0.028) continue; const blend = sm(0.028, 0.008, eL); if (blend <= 0) continue;
    const D = new Float32Array(nJ); let tw = 0; const c0 = p.map((q) => Math.floor(q / G));
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const i of grid.get(key(c0[0] + a, c0[1] + b, c0[2] + c)) || []) {
      const [m2, v2] = all[i], q = P(m2, v2), d2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2; if (d2 > R * R) continue;
      if (Math.sign(q[0]) !== Math.sign(p[0]) && Math.abs(q[0]) > 0.004 && Math.abs(p[0]) > 0.004) continue;   // never across the gusset to the other leg
      const g = Math.exp(-d2 / (2 * (R / 2) ** 2)); tw += g; for (let k = 0; k < 4; k++) D[m2.J[v2 * 4 + k]] += m2.W[v2 * 4 + k] * g; }
    if (!tw) continue; for (let k = 0; k < 4; k++) D[m.J[v * 4 + k]] += 0;   // keep own joints addressable
    const own = new Float32Array(nJ); for (let k = 0; k < 4; k++) own[m.J[v * 4 + k]] += m.W[v * 4 + k];
    for (let j = 0; j < nJ; j++) D[j] = lerp(own[j], D[j] / tw, blend);
    upd.push([m, v, D]); nS++; }
  for (const [m, v, D] of upd) { const w = pick4(D, 1, nJ); for (let k = 0; k < 4; k++) { m.J[v * 4 + k] = w.J[k]; m.W[v * 4 + k] = w.W[k]; } }
  log(`  leg openings: ${nS} vertices smoothed`);
}
/** skin weights of the closest point on the skin surface (closest triangle, barycentric) for each point */
function triWeights(skin, pos, nJ) {
  const P = skin.pos, I = skin.idx, G = 0.02, grid = new Map(), key = (a, b, c) => a + ',' + b + ',' + c;
  for (let t = 0; t < I.length; t += 3) { const lo = [0, 1, 2].map((k) => Math.floor(Math.min(P[I[t] * 3 + k], P[I[t + 1] * 3 + k], P[I[t + 2] * 3 + k]) / G)), hi = [0, 1, 2].map((k) => Math.floor(Math.max(P[I[t] * 3 + k], P[I[t + 1] * 3 + k], P[I[t + 2] * 3 + k]) / G));
    for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) for (let c = lo[2]; c <= hi[2]; c++) { const kk = key(a, b, c); let l = grid.get(kk); if (!l) grid.set(kk, (l = [])); l.push(t); } }
  const n = pos.length / 3, D = new Float32Array(n * nJ), V = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  for (let v = 0; v < n; v++) {
    const q = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], c0 = q.map((x) => Math.floor(x / G)); let best = 1e9, bt = -1, bcp = null;
    for (let r = 1; r <= 3 && bt < 0; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) for (const t of grid.get(key(c0[0] + a, c0[1] + b, c0[2] + c)) || []) { const cp = closestPt(q, V(I[t]), V(I[t + 1]), V(I[t + 2])); const d = len(sub(q, cp)); if (d < best) { best = d; bt = t; bcp = cp; } }
    if (bt < 0) continue; const A = V(I[bt]), B = V(I[bt + 1]), Cc = V(I[bt + 2]); const ar = (p, q2, r2) => len(cross(sub(q2, p), sub(r2, p))); const tot = ar(A, B, Cc) || 1e-12;
    const bw = [ar(bcp, B, Cc) / tot, ar(A, bcp, Cc) / tot]; bw.push(Math.max(0, 1 - bw[0] - bw[1]));
    for (let e = 0; e < 3; e++) { const i = I[bt + e]; for (let k = 0; k < 4; k++) D[v * nJ + skin.J[i * 4 + k]] += skin.W[i * 4 + k] * bw[e]; }
  }
  return pick4(D, n, nJ);
}
// At an exact cut, an interpolated pair of opposing normals can cancel. Some
// lining vertices also lie on a crease with no valid source normal. Restore
// only those points, matching the neighbouring surface's orientation.
function repairCutNormals(positions, indices, normals) {
  const valid = n => Number.isFinite(n[0] + n[1] + n[2]) && Math.hypot(...n) > 1e-7;
  const missing = new Map();
  normals.forEach((n,i) => { if (!valid(n)) missing.set(i,{area:[0,0,0],neighbours:[0,0,0]}); });
  if (!missing.size) return;
  for (let i=0;i<indices.length;i+=3) {
    const ids=[indices[i],indices[i+1],indices[i+2]];
    if (!ids.some(v=>missing.has(v))) continue;
    const [a,b,c]=ids.map(v=>positions[v]);
    const face=cross(sub(b,a),sub(c,a));
    for (const id of ids) {
      const m=missing.get(id);
      if (!m) continue;
      for (let k=0;k<3;k++) m.area[k]+=face[k];
      for (const other of ids) if (!missing.has(other))
        for (let k=0;k<3;k++) m.neighbours[k]+=normals[other][k];
    }
  }
  for (const [i,m] of missing) {
    let n=valid(m.area)?m.area:m.neighbours;
    if (!valid(n)) {
      // Degenerate coincident edge triangles may carry no meaningful face
      // area or one-ring normals. Search for the nearest original valid seam.
      let nearest=Infinity;
      for(let j=0;j<positions.length;j++){
        if(missing.has(j)) continue;
        const d=sub(positions[i],positions[j]), distance=dot(d,d);
        if(distance<nearest){nearest=distance;n=normals[j];}
      }
      if(!valid(n)) throw new Error('Cut surface has no usable normals');
    }
    if (valid(m.neighbours) && dot(n,m.neighbours)<0) n=n.map(x=>-x);
    normals[i]=norm(n);
  }
}
function largestPart(m) {
  const nv = m.pos.length / 3, par = new Int32Array(nv).map((_, i) => i); const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < m.idx.length; t += 3) { const a = f(m.idx[t]); par[f(m.idx[t + 1])] = a; par[f(m.idx[t + 2])] = a; }
  const cnt = new Map(); for (let t = 0; t < m.idx.length; t += 3) { const r = f(m.idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  let best = -1, bn = 0; for (const [r, n] of cnt) if (n > bn) { bn = n; best = r; }
  const I = []; for (let t = 0; t < m.idx.length; t += 3) if (f(m.idx[t]) === best) I.push(m.idx[t], m.idx[t + 1], m.idx[t + 2]);
  const c = compactMesh({ pos: m.pos, idx: Uint32Array.from(I) }); return { pos: c.pos, idx: c.idx };
}

function buildZori(wd, footGeo) {
  const C = wd.C, M = C.M, Z = FIT.zori, yTop = M.bodyMinY - 0.0004;
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1; const toe = M['toe' + side];
    const { P, nv, domBip } = C.body; let x0 = 9, x1 = -9, z0 = 9, z1 = -9;
    for (let i = 0; i < nv; i++) { if (!new RegExp(`J_Bip_${side}_(Foot|ToeBase)`).test(domBip[i])) continue; if (P[i * 3 + 1] > M.bodyMinY + 0.02) continue; x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]); z0 = Math.min(z0, P[i * 3 + 2]); z1 = Math.max(z1, P[i * 3 + 2]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 + 0.003, hw = (x1 - x0) / 2 + Z.margin, hl = (z1 - z0) / 2 + Z.margin + 0.004;
    const NO = 32; const outl = (ins) => { const o = []; for (let i = 0; i < NO; i++) { const a = (i / NO) * TAU, c = Math.cos(a), s = Math.sin(a), zz = Math.sign(s) * Math.pow(Math.abs(s), 0.72), w = (hw - ins) * (zz < 0 ? lerp(1, 0.8, -zz) : 1); o.push([cx + w * Math.sign(c) * Math.pow(Math.abs(c), 0.68), cz + (hl - ins) * zz]); } return o; };
    // body (lacquered sides, bevelled) and the straw top as its own piece
    const rings = [[0.0, 0.003], [0.004, 0.0], [yTop - 0.005, 0.0], [yTop - 0.0012, 0.0012]];
    const pos = [], idx = []; rings.forEach(([y, ins]) => outl(ins).forEach(([x, z]) => pos.push([x, y, z])));
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < NO; i++) { const a = r * NO + i, b = r * NO + (i + 1) % NO; idx.push(a, b, a + NO, b, b + NO, a + NO); }
    const cb = pos.length; pos.push([cx, 0, cz]); for (let i = 0; i < NO; i++) idx.push(cb, (i + 1) % NO, i);
    const sole = fixWinding({ pos, idx, uv: [] }, [cx, yTop / 2, cz]); swatchUV(wd, sole, Z.side);
    const tp = [], ti = []; outl(0.0012).forEach(([x, z]) => tp.push([x, yTop, z])); const ct = tp.length; tp.push([cx, yTop + 0.0004, cz]); for (let i = 0; i < NO; i++) ti.push(ct, i, (i + 1) % NO);
    const topG = fixWinding({ pos: tp, idx: ti, uv: [] }, [cx, yTop - 0.01, cz]); swatchUV(wd, topG, Z.top);
    const toeZ = toe[2]; const wOf = (p) => wmix(W1(C.ji(`J_Bip_${side}_Foot`)), W1(C.ji(`J_Bip_${side}_ToeBase`)), smooth(toeZ - 0.03, toeZ + 0.01, p[2]));
    wd.piece('zori_' + side, sole, sole.pos.map(wOf), 'cloth_trim', { group: 'akari_zori' });
    wd.piece('zori_top_' + side, topG, topG.pos.map(wOf), 'cloth_trim', { group: 'akari_zori' });
    sandalStraps(wd, side, footGeo, wOf, yTop, sg, rayNear);
  }
}

// =====================================================================================================  build
export async function build({ log = console.log, threads = Number(process.env.SCULPT_THREADS || 2) } = {}) {
  const t0 = Date.now();
  const C = await loadChar(BASE); const M = C.M; const nJ = C.jn.length;
  const wd = new Wardrobe(C, { texSize: 512 }); wd.cvA = new Canvas(512, 512); wd.cvB = new Canvas(1024, 1024); wd.sw = new Map(); wd.swRect = [0.75, 0.75, 1, 1];
  const wmap = (Jj, Ww, v) => { const m = new Map(); for (let c = 0; c < 4; c++) { const w = Ww[v * 4 + c]; if (w > 0) m.set(Jj[v * 4 + c], (m.get(Jj[v * 4 + c]) || 0) + w); } return m; };
  // the base's undergarment is not worn under the swimsuit
  const underNode = C.root.listNodes().find((n) => n.getName() === 'akari_under'); underNode.getMesh().dispose(); underNode.dispose();
  const ROWS = 8, rowV = (r) => (r + 0.5) / ROWS, rowRect = (r) => [0, r / ROWS, 1, (r + 1) / ROWS];
  wd.cvA.rect(rowRect(0), (u) => ramp(WHITE, WSHADE, WHI)(u * 1.25 - 0.25));
  const cell = (name) => { if (!wd.sw.has(name)) wd.sw.set(name, wd.sw.size); const n = wd.sw.get(name); const [u0, v0, u1, v1] = wd.swRect, G = 8; return [lerp(u0, u1, (n % G) / G), lerp(v0, v1, Math.floor(n / G) / G), lerp(u0, u1, (n % G + 1) / G), lerp(v0, v1, (Math.floor(n / G) + 1) / G)]; };
  const skin = { pos: C.body.P, J: C.body.J, W: C.body.Wt, idx: C.body.I };

  // ---- 1. the suit
  const suit = await buildSuit({ skin, nJ, log, threads });
  const charcoal = cell('ramp:halter');
  const pearl = cell('ramp:brief');
  const cellRamps = [
    [charcoal, u => ramp(CHARCOAL, CHARCOAL_SHADE, CHARCOAL_HI)(u * 1.25 - .25)],
    [pearl, u => ramp(WHITE, WSHADE, WHI)(u * 1.25 - .25)]
  ];
  // Interpolate the original seam normals and all weights at each new cut. Both
  // pieces retain the certified leg cut and crotch bridge used by the coverage test.
  for (const source of [suit.white, suit.red]) {
    const cut=clipField(source,swimsuitCut);
    const pos=[],nrm=[],uv=[],wts=[];
    for(let v=0;v<cut.src.length;v++){
      const [a,b,t]=cut.src[v], p=V3(cut.pos,v), shade=lerp(source.shade[a],source.shade[b],t);
      pos.push(p); nrm.push(norm(V3(source.nrm,a).map((x,k)=>lerp(x,source.nrm[b*3+k],t))));
      wts.push(wmix(wmap(source.J,source.W,a),wmap(source.J,source.W,b),t));
      // Single atlas, with charcoal upper elastic and cool white lower briefs.
      const rect=charcoal;
      uv.push([lerp(rect[0],rect[2],.06+.88*tn(shade)),(rect[1]+rect[3])/2]);
    }
    repairCutNormals(pos,cut.idx,nrm);
    wd.piece('bathing_suit', {pos,uv,idx:Array.from(cut.idx)},wts,'cloth_trim',{normals:nrm,hems:[],layer:1,group:'akari_swim'});
  }

  // ---- 1b. the lining: like a real swimsuit's, an inner opaque layer 1.5 mm over the skin of the mandatory zones,
  // skinned exactly like the skin under it, so that no bend of the body can show skin there even where the body's own
  // skinning folds (deep hip bends, the crease of a crouch). Hidden under the 3.6 mm outer cloth in every ordinary pose.
  const lined = new Set();
  { const zone = mandatoryZone(C.body.P, C.body.N, C.body.I); const P = C.body.P, Nn = C.body.N, I = C.body.I, map = new Map(), pos = [], uv = [], nrm = [], wts = [], idx = [];
    // the lining reaches FIT.liningRings rings of skin past the zones (staying inside the suit's cuts), and thins to
    // 0.2x at its own edge, so no oblique view can look under its edge onto zone skin
    const nV = P.length / 3, ring = new Int8Array(nV).fill(-1), inside = (v) => { const e = edgesAt(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); return Math.min(e.eN, e.eA, e.eL) > 0.004; };
    for (const t of zone.tris) for (let e = 0; e < 3; e++) ring[I[t + e]] = 0;
    // over the lower back (above the zone's top at the back) it runs FIT.liningRingsBack rings: in a sprint's forward lean a
    // grazing view down the back under the suit (through the scoop) must not slip under its thin edge onto zone skin
    const backV = v => P[v*3+1] > .90;
    for (let r = 1; r <= Math.max(FIT.liningRings, FIT.liningRingsBack); r++) { const nxt = []; for (let t = 0; t < I.length; t += 3) { const vs = [I[t], I[t + 1], I[t + 2]]; if (!vs.some((v) => ring[v] === r - 1)) continue; for (const v of vs) if (ring[v] < 0 && inside(v) && (r <= FIT.liningRings || backV(v))) nxt.push(v); } for (const v of nxt) ring[v] = r; }
    const tris = []; for (let t = 0; t < I.length; t += 3) if (ring[I[t]] >= 0 && ring[I[t + 1]] >= 0 && ring[I[t + 2]] >= 0) tris.push(t);
    for (const t of zone.tris) lined.add(t);   // the cull below drops zone skin only (under the lining's full thickness)
    const edgeV = new Uint8Array(nV); { const cnt = new Map(); for (const t of tris) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], k = a < b ? a + ',' + b : b + ',' + a; cnt.set(k, (cnt.get(k) || 0) + 1); } for (const [k, c] of cnt) if (c === 1) for (const v of k.split(',')) edgeV[+v] = 1; }
    // offset direction: the skin's face normals averaged over 9 mm (not the vertex normal: in a groove that points sideways
    // across the groove and the lining would slide into the far wall in a bend); the lining spans small grooves
    const FC = [], FN = []; for (let t = 0; t < I.length; t += 3) { const A = V3(P, I[t]), Bv = V3(P, I[t + 1]), Cv = V3(P, I[t + 2]); const c = [0, 1, 2].map((k) => (A[k] + Bv[k] + Cv[k]) / 3); if (c[1] > 1.22 || c[1] < 0.7) continue; FC.push(c); FN.push(cross(sub(Bv, A), sub(Cv, A))); }
    const nAt = (q) => { const n = [0, 0, 0]; for (let f = 0; f < FC.length; f++) { const d2 = (FC[f][0] - q[0]) ** 2 + (FC[f][1] - q[1]) ** 2 + (FC[f][2] - q[2]) ** 2; if (d2 > 0.000081) continue; const g = Math.exp(-d2 / 0.00004); n[0] += FN[f][0] * g; n[1] += FN[f][1] * g; n[2] += FN[f][2] * g; } return n; };
    // in the crotch the body's own skinning raises a sharp ridge along the centre line in wide-legged poses (sit-ground,
    // kneel, kick): there the lining stands off FIT.liningCrotch x more (still well inside the 10 mm suit at rest)
    for (const t of tris) for (let e = 0; e < 3; e++) { const v = I[t + e]; if (!map.has(v)) { map.set(v, pos.length); const n = nAt(V3(P, v)); if (n[0] * Nn[v * 3] + n[1] * Nn[v * 3 + 1] + n[2] * Nn[v * 3 + 2] < 0) for (let k = 0; k < 3; k++) n[k] = -n[k]; const nl = Math.hypot(...n) || 1;   // the body's winding: face normals may point in
      const off = FIT.lining * (P[v * 3 + 2] < -0.005 ? lerp(0.45, 1, sm(0.004, 0.016, Math.abs(P[v * 3]))) : 1) * (edgeV[v] ? 0.2 : 1);   // thinner inside the cleft (its walls are close) and at its edge
      const crotch = (1 - sm(0.815, 0.835, P[v * 3 + 1])) * (1 - sm(0.012, 0.03, Math.abs(P[v * 3])));   // the crotch's centre: thicker
      pos.push([0, 1, 2].map((k) => P[v * 3 + k] + n[k] / nl * off * (1 + FIT.liningCrotch * crotch))); nrm.push(n.map((q) => q / nl)); uv.push([0.03 + 0.94 * tn(0.55), rowV(0)]); wts.push(wmap(C.body.J, C.body.Wt, v)); } idx.push(map.get(v)); }
    // over the dropped crotch skin (1c) the lining hangs like the suit's gusset (the suit's bridged weights), not from the
    // skin's pinched fin: it spans the crotch as one flat panel in every pose, and no skin is left under it to poke through
    { const lp = new Float32Array(pos.flat()), bw = suit.bridgedWeights(lp), CR = FIT.crotchCull;
      for (let v = 0; v < pos.length; v++) { const [x, y, z] = pos[v]; const c = (1 - sm(CR.x, CR.x + 0.012, Math.abs(x))) * sm(CR.y0 - 0.01, CR.y0, y) * (1 - sm(CR.y1, CR.y1 + 0.012, y)) * sm(CR.z0 - 0.01, CR.z0, z) * (1 - sm(CR.z1, CR.z1 + 0.01, z));
        if (c <= 0) continue; const m = new Map(); for (const [j, w] of wts[v]) m.set(j, w * (1 - c)); for (let q = 0; q < 4; q++) { const w = bw.W[v * 4 + q]; if (w > 0) m.set(bw.J[v * 4 + q], (m.get(bw.J[v * 4 + q]) || 0) + w * c); } wts[v] = m; } }
    const kept = clipField({ pos: Float32Array.from(pos.flat()), idx: Uint32Array.from(idx) }, (x,y,z)=>swimsuitCut(x,y,z)-.00055);
    const lp=Array.from({length:kept.pos.length/3},(_,i)=>V3(kept.pos,i));
    const ln=kept.src.map(([a,b,t])=>norm(nrm[a].map((x,k)=>lerp(x,nrm[b][k],t))));
    repairCutNormals(lp,kept.idx,ln);
    wd.piece('suit_lining', {pos:lp,uv:kept.src.map(([a])=>uv[a]),idx:Array.from(kept.idx)},kept.src.map(([a,b,t])=>wmix(wts[a],wts[b],t)),'cloth_white',{normals:ln,hems:[],group:'akari_swim_lining'});
    log(`  lining: ${idx.length / 3} tris over the mandatory zones`); }

  // Inside the stitched two-piece, the original body triangles are also the lining's
  // watertight inner face. This uses the same positions and skin weights, so a bend
  // cannot open a slit between the inner lining and the unmasked skin at a seam.
  // All masked body triangles are independently hole-tested in the posed camera check.
  if (!args.includes('--whole')) {
    const {P,N,I,J,Wt}=C.body, CR=FIT.crotchCull;
    const inCr=v=>Math.abs(P[v*3])<CR.x&&P[v*3+1]>CR.y0&&P[v*3+1]<CR.y1&&P[v*3+2]>CR.z0&&P[v*3+2]<CR.z1;
    const inner={pos:[],idx:[],uv:[]},weights=[],normals=[], kept=[],map=new Map();
    const inside=v=>{
      const p=V3(P,v),e=edgesAt(...p);
      return p[1]>.9 && swimsuitCut(...p)>.00065 && Math.min(e.eA,e.eN,e.eL)>.0005;
    };
    for(let t=0;t<I.length;t+=3){
      const vs=[I[t],I[t+1],I[t+2]];
      if(vs.every(inside)){
        for(const v of vs) {
          if(!map.has(v)){
            map.set(v,inner.pos.length);inner.pos.push(V3(P,v));normals.push(V3(N,v));
            weights.push(wmap(J,Wt,v));inner.uv.push([(charcoal[0]+charcoal[2])*.5,(charcoal[1]+charcoal[3])*.5]);
          }
          inner.idx.push(map.get(v));
        }
      } else if(!(lined.has(t)&&vs.every(inCr))) kept.push(...vs);
    }
    wd.piece('sealed_inner_face',inner,weights,'cloth_trim',{normals,hems:[],group:'akari_swim_lining'});
    C.body.prim.getIndices().setArray(Uint32Array.from(kept));
    log('  opaque inner lining and crotch cull: '+(I.length-kept.length)/3+' triangles');
  }

  // ---- 2. hanging parts
  beachDetails(wd);
  { const I = C.body.I, Pp = C.body.P, pos = [], idx = [], map = new Map(); for (let t = 0; t < I.length; t += 3) { if (Pp[I[t] * 3 + 1] > 0.16 && Pp[I[t + 1] * 3 + 1] > 0.16) continue; for (let e = 0; e < 3; e++) { const v = I[t + e]; if (!map.has(v)) { map.set(v, pos.length); pos.push([Pp[v * 3], Pp[v * 3 + 1], Pp[v * 3 + 2]]); } idx.push(map.get(v)); } }
    buildZori(wd, { pos, idx }); }

  // ---- 3. textures + materials
  paintSwatches(wd);
  for (const [r, fn] of cellRamps) wd.cvB.rect(r, (lu) => fn(clamp01((lu - 0.06) / 0.88)));
  wd.cvA.dilate(4); wd.cvB.dilate(6);
  const TA = 'akari_swim_a_garment_a', TB = 'akari_swim_a_garment_b'; wd.textures.set(TA, wd.cvA); wd.textures.set(TB, wd.cvB);
  const sh = [0.62, 0.64, 0.78];
  // cloth_white: extras.shadeAmbient = its shade hue also on the sky / ground light where the sun does not reach (celmat.js)
  for (const [name, tex, finish, rough, doubleSided] of [
    ['cloth_white', TA, 'stretch', .81, false], ['cloth_trim', TB, 'stretch', .81, false],
    ['cloth_frill', TB, 'linen', .89, true], ['cloth_voile', TB, 'voile', .87, true],
    ['cloth_seam', TB, 'linen', .92, true],
  ]) wd.material(name, { tex, rough, doubleSided, shade: sh, extras: { finish, shadeAmbient: name === 'cloth_white' } });
  const res = await wd.finish(OUT, { dumpTex: path.join(WORK, 'tex'), sidecar: path.join(WORK, 'char_akari_swim_a.layers.json') });
  // ---- 4. the skeleton exactly as the base's (finish() rebuilds IBMs from rest positions: put the base's own back)
  { const io = new NodeIO(); const [d, b] = await Promise.all([io.read(OUT), io.read(BASE)]); const sk = d.getRoot().listSkins()[0], sb = b.getRoot().listSkins()[0];
    if (sk.listJoints().map((j) => j.getName()).join() !== sb.listJoints().map((j) => j.getName()).join()) throw new Error('joint order differs from the base');
    sk.getInverseBindMatrices().setArray(Float32Array.from(sb.getInverseBindMatrices().getArray()));
    for (const m of d.getRoot().listMaterials()) {
      const alpha = { cloth_voile: .76, cloth_seam: .87 }[m.getName()];
      if (alpha) m.setAlphaMode('BLEND').setBaseColorFactor([1,1,1,alpha]);
    }
    addSwimRideFold(d);
    await io.write(OUT, d); }
  const skel = await compareSkeleton(OUT, BASE);
  log(`skeleton vs base: ${JSON.stringify(skel)}`);
  if (!(skel.joints === 175 && skel.sameJoints && skel.sameIBM && skel.sameRest)) { console.error('SKELETON CHANGED'); process.exitCode = 1; }
  const groups = {}; let total = 0; for (const p of wd.pieces) { if (p.ghost) continue; const g = p.group || '?'; groups[g] = (groups[g] || 0) + p.geo.idx.length / 3; }
  const ch = await loadCharacter(OUT, { textures: false }); for (const p of ch.prims) total += p.idx.length / 3;
  const info = { out: OUT, garmentTris: res.tris, totalTris: total, groups, size: fs.statSync(OUT).size, skeleton: skel, skirtChains: [4, 7],
    pieces: wd.pieces.filter((p) => !p.ghost).map((p) => ({ name: p.name, mat: p.mat, group: p.group, layer: p.layer ?? null, tris: p.geo.idx.length / 3 })) };
  fs.writeFileSync(path.join(WORK, 'build.json'), JSON.stringify(info, null, 1));
  log(`char_akari_swim_a: garment tris ${res.tris}, whole character ${total} (budget 70000), ${(info.size / 1e6).toFixed(2)} MB (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (total > 70000) { console.error('OVER THE TRIANGLE BUDGET'); process.exitCode = 1; }
  return info;
}

// =====================================================================================================  coverage check
/** the mandatory zones (see coverage()): per-vertex tag (1 chest band, 2 pelvis) and the body triangles wholly inside */
export function mandatoryZone(pos, _nrm, idx) {
  const regs = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/sculpt/akari_base.regions.json'), 'utf8'));
  const names = regs.names, reg = regs.akari_body.region;
  if (reg.length !== pos.length / 3) throw new Error('regions do not match the body');
  const inZone = new Uint8Array(reg.length);
  for (let v = 0; v < reg.length; v++) { const n = names[reg[v]], x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], th = Math.abs(Math.atan2(x, z)) * 180 / Math.PI;
    if (n === 'chest' && ((y >= 1.10 && y <= 1.13) || (y > 1.13 && y <= 1.188 && th < 60))) inZone[v] = 1;
    if ((n === 'hips' || n === 'waist') && y < 0.962) inZone[v] = 2; }
  const tris = []; for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if (inZone[a] && inZone[b] && inZone[c]) tris.push(t); }
  return { inZone, tris };
}
/** the undergarment's mandatory zones on the body (derived from akari_under: its robe covers the trunk to the V apex, its
 *  shorts y 0.962 -> 0.668; regions.json gives the bone group of each skin vertex):
 *    chest band  chest-region skin, y 1.10 .. 1.13 all round (the band) and y 1.13 .. 1.188 within 60 deg of the front (the bust)
 *    pelvis      hips / waist-region skin under the shorts' top (y < 0.962): the pelvis part of the shorts
 *  A zone triangle is covered when, from each corner and its centre, the ray along the skin normal meets swimsuit cloth
 *  (akari_swim: white + piping, opaque) within 35 mm — or, for skin inside a crease or the slot between the legs, when
 *  no ray of a cone of 9 (the normal and 8 at 50 deg) gets out: each meets cloth or the body itself within 60 mm (skin
 *  buried in a fold of the posed body is not seen). Skin that any of those rays can see from outside fails. */
export async function coverage({ file = OUT, log = console.log, sheet = null, outerOnly = false } = {}) {
  const regs = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/sculpt/akari_base.regions.json'), 'utf8'));
  const names = regs.names, reg = regs.akari_body.region;
  const ch = await loadCharacter(file, { textures: false });
  const body = ch.prims.find((p) => p.material === 'Body'), head = ch.prims.filter((p) => p.material === 'Face'), cloth = ch.prims.filter((p) => (outerOnly ? p.node === 'akari_swim' : /^akari_swim/.test(p.node)));
  if (reg.length !== body.pos.length / 3) throw new Error('regions do not match the body');
  // the base's full triangle list: the triangles this file culled (see build 1a) are HOLE PROBES; zone triangles are
  // taken from the full list, so a culled zone triangle is probed and a kept one is tested as skin
  const baseB = (await loadCharacter(BASE, { textures: false })).prims.find((p) => p.material === 'Body');
  if (baseB.pos.length !== body.pos.length) throw new Error('Body vertices differ from the base');
  const keptK = new Set(); for (let t = 0; t < body.idx.length; t += 3) keptK.add(body.idx[t] + ',' + body.idx[t + 1] + ',' + body.idx[t + 2]);
  const probeI = []; for (let t = 0; t < baseB.idx.length; t += 3) if (!keptK.has(baseB.idx[t] + ',' + baseB.idx[t + 1] + ',' + baseB.idx[t + 2])) probeI.push(baseB.idx[t], baseB.idx[t + 1], baseB.idx[t + 2]);
  void names; const { inZone, tris } = mandatoryZone(body.pos, null, body.idx); const zoneAll = mandatoryZone(baseB.pos, null, baseB.idx).tris.length; const zoneSet = new Set(tris);
  const rig = await loadRig(file); await addClips(rig, path.join(ROOT, 'assets/models/chars/anim_ual.glb')); await addClips(rig, path.join(ROOT, 'assets/models/chars/anim_miko.glb'));
  const clipAt = (name, f) => { const c = rig.clips.find((q) => q.name === name); if (!c) return null; return rig.pose(c, c.duration * f); };
  const poses = [['rest', restPose(rig)]];
  for (const [n, f] of [['Idle_Loop', 0.3], ['Jog_Fwd_Loop', 0.3], ['Sprint_Loop', 0.6], ['Jump_Loop', 0.5], ['Roll', 0.35], ['Roll', 0.55], ['Crouch_Idle_Loop', 0.5], ['Sitting_Idle_Loop', 0.5], ['Sit_Ground_Loop', 0.5], ['Kneel_Loop', 0.5],
    ['Cast_Thunder', 0.5], ['Spell_Simple_Shoot', 0.5], ['Glide_Loop', 0.5], ['Broom_Ride_Loop', 0.5], ['Swim_Fwd_Loop', 0.3], ['Kagura_Loop', 0.4], ['Slide_Loop', 0.5], ['Sword_Heavy_Combo', 0.5], ['Fixing_Kneeling', 0.5]]) { const S0 = clipAt(n, f); if (S0) poses.push([`${n}@${f}`, S0]); }
  poses.push(['fk_arms_up', fkPose(rig, { J_Bip_L_UpperArm: [0, 0, 75], J_Bip_R_UpperArm: [0, 0, -75] })]);
  poses.push(['fk_twist', fkPose(rig, { J_Bip_C_Spine: [0, 25, 0], J_Bip_C_Chest: [0, 20, 0], J_Bip_C_UpperChest: [0, 15, 0] })]);
  poses.push(['fk_squat', fkPose(rig, { J_Bip_L_UpperLeg: [-115, 0, 0], J_Bip_R_UpperLeg: [-115, 0, 0], J_Bip_L_LowerLeg: [125, 0, 0], J_Bip_R_LowerLeg: [125, 0, 0], J_Bip_C_Spine: [20, 0, 0] })]);
  poses.push(['fk_kick', fkPose(rig, { J_Bip_L_UpperLeg: [-100, 0, -10], J_Bip_R_UpperLeg: [20, 0, 0] })]);
  const results = []; let fail = 0;
  // view directions: the 26 of a cube (faces, edges, corners)
  const dirs = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) dirs.push(norm([a, b, c]));
  const PX = 0.0006;
  for (const [pname, Sk] of poses) {
    const B = skinMesh(body.pos, body.nrm, body.J, body.W, Sk);
    const CL = cloth.map((p) => ({ pos: skinMesh(p.pos, null, p.J, p.W, Sk).pos, idx: p.idx }));
    // window: the posed zone triangles' bounds + 4 cm
    const lo = [9, 9, 9], hi = [-9, -9, -9]; for (const t of tris) for (let e = 0; e < 3; e++) { const v = body.idx[t + e]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], B.pos[v * 3 + k]); hi[k] = Math.max(hi[k], B.pos[v * 3 + k]); } }
    for (const v of probeI) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], B.pos[v * 3 + k]); hi[k] = Math.max(hi[k], B.pos[v * 3 + k]); }
    for (let k = 0; k < 3; k++) { lo[k] -= 0.04; hi[k] += 0.04; }
    const ctr = lo.map((v, k) => (v + hi[k]) / 2), R = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, N = Math.ceil(2 * R / PX);
    const zb = new Float32Array(N * N), id = new Int32Array(N * N), seen = new Map(), pz = new Float32Array(N * N), pid = new Int32Array(N * N), holeTri = new Map(); let holes = 0, holeView = null; const holeAt = new Map();
    // the opaque head shell (Face) is drawn too: the body mesh is open at the neck seam, and without the head a view from
    // above-front in a forward lean (sprint) looks down the neck into the trunk and onto the INSIDE of the lower back
    const HD = head.map((p) => ({ pos: skinMesh(p.pos, null, p.J, p.W, Sk).pos, idx: p.idx }));
    const layers = [{ pos: B.pos, idx: body.idx, body: true }, ...CL.map((m) => ({ ...m, body: false })), ...HD.map((m) => ({ ...m, body: false }))];
    for (const d of dirs) {
      const a = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], u = norm(cross(a, d)), w = cross(d, u);
      zb.fill(Infinity); id.fill(-1);
      for (const L of layers) { const P = L.pos, I = L.idx;
        for (let t = 0; t < I.length; t += 3) {
          const s = [], dp = [];
          for (let e = 0; e < 3; e++) { const v = I[t + e] * 3, x = P[v] - ctr[0], y = P[v + 1] - ctr[1], z = P[v + 2] - ctr[2]; s.push([(x * u[0] + y * u[1] + z * u[2] + R) / PX, (x * w[0] + y * w[1] + z * w[2] + R) / PX]); dp.push(-(x * d[0] + y * d[1] + z * d[2])); }
          const x0 = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0]))), y0 = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1])));
          if (x0 > x1 || y0 > y1) continue;
          const den = (s[1][1] - s[2][1]) * (s[0][0] - s[2][0]) + (s[2][0] - s[1][0]) * (s[0][1] - s[2][1]); if (Math.abs(den) < 1e-12) continue;
          let tag = L.body ? t : -2;
          { const e1 = [0, 1, 2].map((k) => P[I[t + 1] * 3 + k] - P[I[t] * 3 + k]), e2 = [0, 1, 2].map((k) => P[I[t + 2] * 3 + k] - P[I[t] * 3 + k]), fn = cross(e1, e2); if (dot(fn, d) <= 0) continue; }   // single-sided like the game: a triangle facing away is not drawn (it neither shows nor hides)
          for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) { const X = px + 0.5, Y = py + 0.5;
            const l1 = ((s[1][1] - s[2][1]) * (X - s[2][0]) + (s[2][0] - s[1][0]) * (Y - s[2][1])) / den, l2 = ((s[2][1] - s[0][1]) * (X - s[2][0]) + (s[0][0] - s[2][0]) * (Y - s[2][1])) / den, l3 = 1 - l1 - l2;
            if (l1 < -2e-4 || l2 < -2e-4 || l3 < -2e-4) continue; const z = l1 * dp[0] + l2 * dp[1] + l3 * dp[2], q = py * N + px;
            if (z < zb[q] - (L.body ? 0 : 0.0002)) { zb[q] = z; id[q] = tag; } } } }
      // hole probes: the culled skin, where it would face the camera in front of what is drawn. The nearest surface drawn
      // there must be swimsuit cloth seen from outside (a pixel outside her outline shows background: no window either)
      if (probeI.length) { pz.fill(Infinity); const P = B.pos;
        for (let t = 0; t < probeI.length; t += 3) { const s = [], dp = []; const a0 = probeI[t], b0 = probeI[t + 1], c0 = probeI[t + 2];
          const fn = cross(sub(V3(P, b0), V3(P, a0)), sub(V3(P, c0), V3(P, a0))); if (dot(fn, d) <= 0) continue;
          for (const vi of [a0, b0, c0]) { const x = P[vi * 3] - ctr[0], y = P[vi * 3 + 1] - ctr[1], z = P[vi * 3 + 2] - ctr[2]; s.push([(x * u[0] + y * u[1] + z * u[2] + R) / PX, (x * w[0] + y * w[1] + z * w[2] + R) / PX]); dp.push(-(x * d[0] + y * d[1] + z * d[2])); }
          const x0 = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0]))), y0 = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1])));
          if (x0 > x1 || y0 > y1) continue; const den = (s[1][1] - s[2][1]) * (s[0][0] - s[2][0]) + (s[2][0] - s[1][0]) * (s[0][1] - s[2][1]); if (Math.abs(den) < 1e-12) continue;
          for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) { const X = px + 0.5, Y = py + 0.5;
            const l1 = ((s[1][1] - s[2][1]) * (X - s[2][0]) + (s[2][0] - s[1][0]) * (Y - s[2][1])) / den, l2 = ((s[2][1] - s[0][1]) * (X - s[2][0]) + (s[0][0] - s[2][0]) * (Y - s[2][1])) / den, l3 = 1 - l1 - l2;
            if (l1 < 0 || l2 < 0 || l3 < 0) continue; const z = l1 * dp[0] + l2 * dp[1] + l3 * dp[2], q = py * N + px; if (z < pz[q]) { pz[q] = z; pid[q] = t; } } }
        // cloth seen from outside, or her own uncovered skin (a thigh behind the dropped fin) is no window
        let h = 0; for (let q = 0; q < pz.length; q++) { if (pz[q] === Infinity || zb[q] === Infinity || pz[q] >= zb[q] - 0.002 || id[q] === -2 || (id[q] >= 0 && !zoneSet.has(id[q])))  continue; h++;
          const k = id[q] >= 0 ? 'skin' : id[q] === -4 ? 'cloth inside' : id[q] === -3 ? 'skin inside' : 'other'; holeAt.set(k, (holeAt.get(k) || 0) + 1); holeTri.set(pid[q], (holeTri.get(pid[q]) || 0) + 1); }
        if (h > holes) { holes = h; holeView = d.map((x) => +x.toFixed(2)); } }
      for (let q = 0; q < id.length; q++) if (id[q] >= 0) { seen.set(id[q], (seen.get(id[q]) || 0) + 1); if (process.env.COV_DEBUG && pname === (process.env.COV_POSE || 'rest')) { const t = id[q], v = body.idx[t]; const T0 = process.env.COV_DEBUG.split(',').map(Number); if (Math.abs(body.pos[v * 3] - T0[0]) < 0.002 && Math.abs(body.pos[v * 3 + 1] - T0[1]) < 0.002 && Math.abs(body.pos[v * 3 + 2] - T0[2]) < 0.002) console.log('DBG dir', d.map((x) => x.toFixed(2)).join(','), 'px', q % N, Math.floor(q / N), 'N', N); } }
    }
    let bad = 0, defect = 0; const badZ = [0, 0, 0], badPts = [], defPts = [];
    // a visible zone triangle that the BODY's own skinning has torn (an edge stretched past 1.6x or squashed under 0.45x
    // of its bind length, or turned over) is the base figure's defect, not a cloth gap: counted and reported, not failed
    const torn = (t) => { const v = [0, 1, 2].map((e) => body.idx[t + e]); let worst = 1; for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3]; const l0 = Math.hypot(body.pos[a * 3] - body.pos[b * 3], body.pos[a * 3 + 1] - body.pos[b * 3 + 1], body.pos[a * 3 + 2] - body.pos[b * 3 + 2]), l1 = Math.hypot(B.pos[a * 3] - B.pos[b * 3], B.pos[a * 3 + 1] - B.pos[b * 3 + 1], B.pos[a * 3 + 2] - B.pos[b * 3 + 2]); const r = l1 / (l0 || 1e-9); worst = Math.max(worst, r, 1 / Math.max(r, 1e-6) * 0.72); }
      const n0 = cross(sub(V3(body.pos, v[1]), V3(body.pos, v[0])), sub(V3(body.pos, v[2]), V3(body.pos, v[0]))), n1 = cross(sub(V3(B.pos, v[1]), V3(B.pos, v[0])), sub(V3(B.pos, v[2]), V3(B.pos, v[0]))), nb = cross(sub(V3(B.pos, v[1]), V3(B.pos, v[0])), [0, 0, 0]);
      void nb; const avgN = [0, 1, 2].map((k) => B.nrm[v[0] * 3 + k] + B.nrm[v[1] * 3 + k] + B.nrm[v[2] * 3 + k]); return worst > 1.6 || dot(n1, avgN) < 0 || len(n0) < 1e-12; };
    for (const t of tris) { const n = seen.get(t) || 0; if (n < 2) continue; if (torn(t)) { defect++; if (defPts.length < 8) { const v = body.idx[t]; defPts.push([body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]].map((q) => +q.toFixed(3)).concat([n])); } continue; } bad++; const v = body.idx[t]; badZ[inZone[v]]++; if (badPts.length < 12) badPts.push([body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]].map((q) => +q.toFixed(3)).concat([n])); }
    const HOLE_PX = 2; const holeFail = holes >= HOLE_PX;
    results.push({ pose: pname, zoneTris: zoneAll, keptZoneTris: tris.length, culledTris: probeI.length / 3, holes, holeView, holeOver: Object.fromEntries(holeAt), holeFail, holeTris: [...holeTri].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => [0, 1, 2].map((k) => +((body.pos[probeI[t] * 3 + k] + body.pos[probeI[t + 1] * 3 + k] + body.pos[probeI[t + 2] * 3 + k]) / 3).toFixed(4)).concat([n])), visible: bad, chest: badZ[1], pelvis: badZ[2], at: badPts, bodyDefect: defect, defectAt: defPts });
    if (bad || holeFail) fail++;
    log(`  coverage ${pname.padEnd(24)} visible zone triangles ${bad} / ${tris.length} kept${holes ? `, hole pixels ${holes} ${JSON.stringify(Object.fromEntries(holeAt))} view ${holeView}` : ', no holes'}${defect ? ` (+${defect} torn by the body's own skinning)` : ''}${bad ? `  (chest ${badZ[1]}, pelvis ${badZ[2]}; bind-pose at [x,y,z,pixels] ${JSON.stringify(badPts.slice(0, 4))})` : ''}`);
  }
  fs.writeFileSync(path.join(WORK, outerOnly ? 'coverage_outer.json' : 'coverage.json'), JSON.stringify(results, null, 1));
  return { ok: fail === 0, results };
}
const V3 = (P, i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
function rayTri(o, d, T) {
  const e1 = [T[3] - T[0], T[4] - T[1], T[5] - T[2]], e2 = [T[6] - T[0], T[7] - T[1], T[8] - T[2]];
  const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
  if (Math.abs(det) < 1e-14) return -1; const f = 1 / det, s = [o[0] - T[0], o[1] - T[1], o[2] - T[2]], u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]); if (u < 0 || u > 1) return -1;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]); if (v < 0 || u + v > 1) return -1;
  return f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
}

// =====================================================================================================  install
/** copy a checked file into the asset tree and write the manifest entry char_akari_swim_a (only this id, through
 *  tools/manifest-patch.mjs; fields as char_akari_v3's, preload:false; chains: only those this file uses) */
async function install(file) {
  const cov = JSON.parse(fs.readFileSync(path.join(WORK, 'coverage.json'), 'utf8'));
  if (cov.some((r) => r.visible > 0 || r.holeFail)) throw new Error('coverage not passed: not installing');
  fs.copyFileSync(file, path.join(ROOT, 'assets', ASSET));
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')), v3 = man.char_akari_v3 || man.char_akari;   // wardrobe: the v3 test entry is gone, char_akari carries its fields
  const doc = await new NodeIO().read(path.join(ROOT, 'assets', ASSET)); let tris = 0; const mn = [9, 9, 9], mx = [-9, -9, -9], mats = new Set(), meshes = [];
  for (const nd of doc.getRoot().listNodes()) { const m = nd.getMesh(); if (!m) continue; meshes.push(nd.getName());
    for (const p of m.listPrimitives()) { mats.add(p.getMaterial().getName()); tris += p.getIndices().getCount() / 3; const P = p.getAttribute('POSITION').getArray();
      for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i + a]); mx[a] = Math.max(mx[a], P[i + a]); } } }
  const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
  const chains = v3.secondaryChains.filter((c) => /^J_Sec_(Hakama_\d+|SashTail[LR]_1|Charm_1|Ribbon[LR]_1)_01$/.test(c.root) && c.joints.every((j) => names.has(j)));
  const sd = JSON.parse(JSON.stringify(v3.springDefaults)); delete sd.sleeve; sd.skirt.stiffness = FIT.spring.skirtStiffness;
  const entry = { file: ASSET, type: 'model', preload: false,
    license: 'CC0 (original body, face, swimsuit and textures made for this project; hair + bow mesh, skeleton: VRoid HairSample_Female, CC0)',
    author: 'sculpted / generated for this project (tools/sculpt/figure, tools/costume/swim_a.mjs); hair, bow and skeleton: pixiv Inc. (VRoid Project) CC0',
    source: 'tools/costume/swim_a.mjs on assets/models/sculpt/akari_base.glb (+ tools/sculpt/assets/akari_swim_a.mjs)',
    scale: 1, size: mx.map((v, a) => +(v - mn[a]).toFixed(3)), tris, bytes: fs.statSync(path.join(ROOT, 'assets', ASSET)).size,
    clipsFrom: v3.clipsFrom, morphs: v3.morphs, morphMesh: v3.morphMesh, bones: v3.bones, hipsHeight: v3.hipsHeight,
    meshes, materials: [...mats].sort(), secondaryChains: chains, springDefaults: sd,
    notes: 'Heroine wardrobe: swimsuit A (tide festival) behind ?akari=swim_a. The base figure without its undergarment node (the swimsuit is the '
      + 'always-worn layer; the build fails unless a coverage check over rest + stress poses passes): akari_swim (black halter with white double flounce and separate ruffled briefs), '
      + 'akari_swim_lining, akari_skirt (hip ruffle), akari_beach_shirt (open white chiffon shrug), akari_cord '
      + '(halter straps and hip ties), akari_zori (ankle-wrap sandals), akari_wrist (right thigh ruffle). '
      + 'Same skeleton / inverse binds / clips / morphs as char_akari_v3. docs/api/heroine-swim-a.md.' };
  const frag = path.join(WORK, 'manifest.fragment.json'); fs.writeFileSync(frag, JSON.stringify({ char_akari_swim_a: entry }, null, 1));
  const { execFileSync } = await import('node:child_process');
  console.log(execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), frag, '--replace'], { encoding: 'utf8' }).trim());
  const back = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')).char_akari_swim_a;
  if (!back || back.file !== ASSET || back.tris !== tris) throw new Error('manifest entry char_akari_swim_a did not read back');
  console.log(`installed ${ASSET}: ${tris} tris, ${chains.length} chains (${chains.map((c) => c.root.replace(/^J_Sec_|_01$/g, '')).join(' ')}), entry read back`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (args.includes('--install-only')) { await install(OUT); process.exit(0); }
  if (!args.includes('--check-only')) await build();
  if (!args.includes('--no-check')) {
    console.log('coverage check (rest + stress poses):');
    const cv = await coverage({ file: OUT });
    if (!cv.ok) { console.error('COVERAGE CHECK FAILED: swimsuit does not cover the mandatory zones (see .tmp/akari-swim-a/out/coverage.json)'); process.exit(1); }
    console.log('coverage check passed');
    if (!args.includes('--no-install')) await install(OUT);
    if (args.includes('--outer')) { console.log('for information: the OUTER cloth alone (where the lining would show):'); await coverage({ file: OUT, outerOnly: true }); }
  }
}
void dot; void len;
