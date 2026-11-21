#!/usr/bin/env node
// Aqua Float Girls original (TAITO, 2022). Sculpted layers fitted to the game rig.
// Official reference: https://www.taito.co.jp/taito-prize/0451504900
// node tools/costume/swim_b.mjs --out output.glb [--work-dir directory]
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import * as S from '../sculpt/sdf.mjs';
import { loadRig, skinMesh } from '../sculpt/rig.mjs';
import { contourPieces } from '../sculpt/figure/pieces.mjs';
import { compactMesh, clipField, splitField, extrudeRim } from '../sculpt/figure/seam.mjs';
import { vertexNormals, splitLongEdges } from '../sculpt/figure/meshops.mjs';
import { compareSkeleton } from '../sculpt/figure/writer.mjs';
import { loadCharacter } from '../sculpt/figure/glbio.mjs';
import { fkPose } from '../sculpt/figure/weights.mjs';
import { closestPt, loadChar, Wardrobe, Canvas, lerp, smooth, clamp01, W1, wmix, nearestWeights, add, sub, mul, norm, cross, dot, len, fixWinding, grid, strip } from './garment.mjs';
import { paintSwatches } from './outfit.mjs';
import { cullCovered } from './cull.mjs';
import { fitHipRuffle } from '../sculpt/assets/akari_swim_b_fit.mjs';
import { SWIM, topParts, shortsParts, snapTo, RIG_FILE } from '../sculpt/assets/akari_swim_b.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const BASE = path.join(ROOT, 'assets/models/sculpt/akari_base.glb');
// --out file.glb: the passing file goes there instead of the asset tree (tools/costume/wardrobe-build.mjs dresses into its work folder)
const OUT = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : path.join(ROOT, 'assets/models/chars/char_akari_swim_b.glb');
const WORK = args.includes('--work-dir') ? path.resolve(args[args.indexOf('--work-dir') + 1]) : path.join(ROOT, '.tmp/akari-swim-b/out'); fs.mkdirSync(WORK, { recursive: true });
const BUILT = path.join(WORK, 'char_akari_swim_b.glb');
const TRI_BUDGET = 70000;
const SHORTS_MARGIN = Number(process.env.SHORTS_MARGIN || 0.035);
// skin kept under the openings that gape in a deep bend: the leg tubes up to legTo (the thigh leaves the hem when the hip
// flexes) and a band above the top's under-band foot (the band lifts off the ribs when the arms go up)
const KEEP = { legTo: 0.8, band: [1.03, 1.105] };
const CROTCH = { x: 0.07, y0: 0.745, y1: 0.875 };   // culled by region (see 4b)   // cull keeps skin this far from the shorts' openings (cull.mjs default 3.5 cm)
const TAU = Math.PI * 2;
const sm = (a, b, x) => smooth(a, b, x);

const knit = { base: [62, 53, 64], shade: [42, 36, 52], hi: [86, 73, 83] };
const gold = { base: [233, 183, 91], shade: [161, 103, 48], hi: [255, 233, 150] };
const mixc = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const ramp = (base, shade, hi) => (t) => (t < 0 ? mixc(base, hi, Math.min(1, -4 * t)) : mixc(base, shade, Math.min(1, t)));
const tn = (t) => clamp01((t + 0.25) / 1.25);
function underBrief(x,y,z) {
  const half=Math.abs(x),back=z<0,h=y-.014;
  if(h<.799 || y > hipEdge(x,z)-.024) return false;
  if(h<.838) return half < .014 + .014*sm(.803,.838,h) && Math.abs(z)<.065;
  const marks=[[.838,27],[.846,32],[.856,36],[.866,42],[.876,49],[.886,59],[.896,71],[.905,82],[.914,90]];
  let width=90;
  for(let i=1;i<marks.length;i++)if(h<marks[i][0]){
    const [y0,w0]=marks[i-1],[y1,w1]=marks[i];
    width=lerp(w0,w1,(h-y0)/(y1-y0));break;
  }
  return Math.atan2(half,Math.abs(z)) < Math.min(90,width+(back?7:0))*Math.PI/180;
}
const hipEdge = (x, z) => .94 + .022 * sm(.025, .139, Math.abs(x)) + .008 * sm(.02,-.075,z);
const neckline = (angle) => {
  const c=Math.cos(angle),s=Math.sin(angle);
  return 1.109 + .103*sm(-.05,.82,c) + .017*sm(.16,.49,Math.abs(s))*sm(.56,.84,c);
};
const lowerBand = (x, z) => 1.079 + .012 * sm(.02, .114, Math.abs(x)) + .005 * sm(.02,-.075,z);

// ------------------------------------------------------------------ field layers: cut on the outline, walls, normals, weights
/** close the small holes the contour leaves (dual-contouring "open quads" along a crease of the field: hairline cracks
 *  the light shows through). Every boundary loop shorter than maxPerim is fanned from its centroid; long loops (the
 *  piece's own bounds, cut away later by the mask) stay. -> { pos, idx, closed } */
export function closeCracks(m, maxPerim = 0.12) {
  const nx = new Map(); const P = Array.from(m.pos), I = Array.from(m.idx), ec = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; const k = a < b ? a + '_' + b : b + '_' + a; ec.set(k, (ec.get(k) || 0) + 1); }
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; const k = a < b ? a + '_' + b : b + '_' + a; if (ec.get(k) === 1) nx.set(b, a); }   // walk the hole the other way round
  const seen = new Set(); let closed = 0;
  const D = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  for (const s0 of nx.keys()) {
    if (seen.has(s0)) continue; const loop = []; let v = s0, ok = true;
    while (!seen.has(v)) { seen.add(v); loop.push(v); const w = nx.get(v); if (w === undefined) { ok = false; break; } v = w; }
    if (!ok || v !== s0 || loop.length < 3) continue;
    let per = 0; for (let i = 0; i < loop.length; i++) per += D(loop[i], loop[(i + 1) % loop.length]); if (per > maxPerim) continue;
    const c = [0, 1, 2].map((k) => loop.reduce((acc, i) => acc + P[i * 3 + k], 0) / loop.length); const ci = P.length / 3; P.push(...c);
    for (let i = 0; i < loop.length; i++) I.push(loop[i], loop[(i + 1) % loop.length], ci);
    closed++;
  }
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I), closed };
}
/** keep what lies outside the skin, cut exactly on mask (positive = cloth), split the piping off, wall every outline
 *  edge down to the skin. -> [{ pos, idx, rim }] (cloth, piping) */
/** open edges (by position) on the seat's surface near the centre back: a crack there shows skin */
function seatOpen(m) {
  const P = m.pos, I = m.idx, key = (i) => Math.round(P[i * 3] * 1e5) + ',' + Math.round(P[i * 3 + 1] * 1e5) + ',' + Math.round(P[i * 3 + 2] * 1e5), id = new Map(), W = [];
  for (let i = 0; i < P.length / 3; i++) { const k = key(i); if (!id.has(k)) id.set(k, i); W.push(id.get(k)); }
  const ec = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = W[I[t + e]], c = W[I[t + (e + 1) % 3]]; const k = a < c ? a + '_' + c : c + '_' + a; ec.set(k, (ec.get(k) || 0) + 1); }
  let n = 0; for (const [k, c] of ec) { if (c !== 1) continue; const a = +k.split('_')[0]; if (Math.abs(P[a * 3]) < 0.035 && P[a * 3 + 1] > 0.765 && P[a * 3 + 1] < 0.95 && P[a * 3 + 2] < -0.075) n++; }
  return n;
}
function cutLayer(m0, { body, mask, pipe, pipeCuts = [], wallTo = -0.0004, split = null }) {
  // long edges split where the body bends most (a long flat chord over the seat sags into the skin when the hip flexes)
  { const cc = closeCracks(m0); if (cc.closed) console.log(`  closed ${cc.closed} crack loop(s) in the contour`); m0 = cc; }
  // only a short snap: a midpoint far off the surface (an inner rim of the contour) stays put, or it pulls a sliver out over
  // the seat whose open edges show as crack lines (r3)
  if (split) { const sp0 = splitLongEdges({ pos: m0.pos, idx: m0.idx }, split.maxLen, (q) => { const r = snapTo(split.field, q, 8); return Math.hypot(r[0] - q[0], r[1] - q[1], r[2] - q[2]) < 0.004 ? r : q; }); m0 = { pos: Float32Array.from(sp0.pos), idx: Uint32Array.from(sp0.idx) }; }
  const c = clipField(m0, (x, y, z) => body.f(x, y, z) - 0.0009, { refine: 6 });
  const m = compactMesh({ pos: c.pos, idx: c.idx });
  const k = clipField(m, mask, { refine: 14 });
  if (process.env.CUTDBG) for (const [nm, mm] of [['split', m0], ['clip', c], ['compact', m], ['mask', k]]) console.log('  CUTDBG', nm, seatOpen(mm));
  const parts = [];
  if (pipe) {
    // every boundary of the piping cut on its own (exact, nothing lost between vertices), then each triangle by its centre
    let cur = { pos: k.pos, idx: k.idx }, om = Uint8Array.from(k.cut);
    for (const f of pipeCuts) {
      const sp = splitField(cur, f, { refine: 10 }); const n0 = cur.pos.length / 3, nv = sp.pos.length / 3, o2 = new Uint8Array(nv);
      for (let v = 0; v < nv; v++) { if (v < n0) o2[v] = om[v]; else { const [a, b] = sp.src[v]; o2[v] = om[a] && om[b] ? 1 : 0; } }
      cur = { pos: sp.pos, idx: sp.idx }; om = o2;
    }
    const P = cur.pos, inPipe = (t) => { const a = cur.idx[t * 3], b = cur.idx[t * 3 + 1], d = cur.idx[t * 3 + 2];
      return pipe((P[a * 3] + P[b * 3] + P[d * 3]) / 3, (P[a * 3 + 1] + P[b * 3 + 1] + P[d * 3 + 1]) / 3, (P[a * 3 + 2] + P[b * 3 + 2] + P[d * 3 + 2]) / 3) > 0; };
    for (const keep of [false, true]) { const I = []; for (let t = 0; t < cur.idx.length / 3; t++) if (inPipe(t) === keep) I.push(cur.idx[t * 3], cur.idx[t * 3 + 1], cur.idx[t * 3 + 2]); parts.push(compactMesh({ pos: cur.pos, idx: Uint32Array.from(I) }, { om })); }
  } else parts.push({ pos: k.pos, idx: k.idx, om: k.cut });
  const g = [0, 0, 0];
  return parts.map((p) => {
    const r = extrudeRim({ pos: p.pos, idx: p.idx }, (a, b) => p.om[a] && p.om[b], (v) => {
      const x = p.pos[v * 3], y = p.pos[v * 3 + 1], z = p.pos[v * 3 + 2], d = body.f(x, y, z) - wallTo; if (d <= 0) return [0, 0, 0];
      body.normal(x, y, z, g, 0.002); return [-g[0] * d, -g[1] * d, -g[2] * d];
    });
    const n0 = p.pos.length / 3, rim = new Uint8Array(r.pos.length / 3); for (let v = n0; v < rim.length; v++) rim[v] = 1;
    return { pos: r.pos, idx: r.idx, rim };
  });
}
/** skin weights of the CLOSEST point on the body surface (barycentric on its triangle): the cloth moves as the skin under
 *  it does, also in deep bends (3 nearest vertices could all lie on one side and let the cloth sink in a fold).
 *  legsApart: below the crotch only triangles of the same leg. */
let _skinTris = null;
function copyW(skin, pos, nJ, legsApart = false, mirror = null) {
  const P = skin.pos, I = skin.idx, G = 0.015, key = (a, b, c) => a + ',' + b + ',' + c;
  if (!_skinTris || _skinTris.src !== skin) {
    const grid = new Map();
    for (let t = 0; t < I.length; t += 3) { const lo = [0, 1, 2].map((k) => Math.floor(Math.min(P[I[t] * 3 + k], P[I[t + 1] * 3 + k], P[I[t + 2] * 3 + k]) / G)), hi = [0, 1, 2].map((k) => Math.floor(Math.max(P[I[t] * 3 + k], P[I[t + 1] * 3 + k], P[I[t + 2] * 3 + k]) / G));
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const kk = key(x, y, z); let l = grid.get(kk); if (!l) grid.set(kk, (l = [])); l.push(t); } }
    _skinTris = { src: skin, grid };
  }
  const grid = _skinTris.grid, V = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n = pos.length / 3, out = [];
  const at = (q) => {
    const g = q.map((c) => Math.floor(c / G));
    const ok = legsApart && q[1] < 0.766 ? (t) => Math.sign(P[I[t] * 3] + P[I[t + 1] * 3] + P[I[t + 2] * 3]) === Math.sign(q[0]) : () => true;
    let best = Infinity, bt = -1, bcp = null;
    for (let r = 1; r <= 4 && bt < 0; r++) { const seen = new Set();
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) for (const t of grid.get(key(g[0] + a, g[1] + b, g[2] + c)) || []) {
        if (seen.has(t) || !ok(t)) continue; seen.add(t); const cp = closestPt(q, V(I[t]), V(I[t + 1]), V(I[t + 2])); const d = len(sub(q, cp)); if (d < best) { best = d; bt = t; bcp = cp; } } }
    const A = V(I[bt]), B = V(I[bt + 1]), Cc = V(I[bt + 2]);
    const ar = (p, q2, r) => len(cross(sub(q2, p), sub(r, p))); const tot = ar(A, B, Cc) || 1e-12; const wa = ar(bcp, B, Cc) / tot, wb = ar(A, bcp, Cc) / tot, wc = Math.max(0, 1 - wa - wb);
    const w = new Map(); for (const [vi, f] of [[I[bt], wa], [I[bt + 1], wb], [I[bt + 2], wc]]) for (let k = 0; k < 4; k++) { const wt = skin.W[vi * 4 + k]; if (wt > 0) w.set(skin.J[vi * 4 + k], (w.get(skin.J[vi * 4 + k]) || 0) + wt * f); }
    return skin.train ? fitWeights(skin.train, q, [[I[bt], wa], [I[bt + 1], wb], [I[bt + 2], wc]], bcp, w) : w;
  };
  for (let v = 0; v < n; v++) {
    const q = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    let wf = at(q);
    // the gusset: under the crotch the body's own slit opens when the legs part; toward the midline the cloth takes the
    // mean of its own and its mirror point's weights, so it stays a bridge between the legs instead of tearing
    // (and on every centre seam a garment spans: the seat bridge, the top's flat front -> `mirror` [y0, y1])
    const yr = mirror || (legsApart ? [0.76, 1.04] : null);
    if (yr && skin.mirrorJ) { const f = sm(0.03, 0.0, Math.abs(q[0])) * sm(yr[0], yr[0] + 0.02, q[1]) * sm(yr[1], yr[1] - 0.02, q[1]);
      if (f > 0) { const wm = new Map(); for (const [j, x] of at([-q[0], q[1], q[2]])) wm.set(skin.mirrorJ[j], (wm.get(skin.mirrorJ[j]) || 0) + x); wf = wmix(wf, wmix(wf, wm, 0.5), f); } }
    // the gusset floor's middle moves with the crotch skin right above it (that skin is hips-weighted and swings back in a
    // deep landing / squat; the inner thighs the floor is nearest to do not)
    if (legsApart && skin.crotchY) { const g = sm(0.022, 0.006, Math.abs(q[0])) * sm(0.764, 0.772, q[1]) * sm(0.815, 0.805, q[1]) * sm(-0.025, -0.01, q[2]) * sm(0.05, 0.035, q[2]);
      if (g > 0) wf = wmix(wf, at([0, skin.crotchY(q[2]) + 0.0015, q[2]]), g); }
    out.push(wf);
  }
  return out;
}
/** Training poses for the weight fit: skin matrices + the posed body (positions, normals) per pose. */
export async function trainingPoses(skin) {
  const { loadFigureRig } = await import('../sculpt/figure/akari-figure.mjs');
  const rig = await loadFigureRig(); const list = [];
  for (const [n, f] of [['Idle_Loop', 0.6], ['Jog_Fwd_Loop', 0.05], ['Jog_Fwd_Loop', 0.45], ['Jog_Fwd_Loop', 0.85], ['Sprint_Loop', 0.15], ['Sprint_Loop', 0.6], ['Jump_Loop', 0.2], ['Land_Hard', 0.3], ['Land_Hard', 0.55],
    ['Roll', 0.35], ['Roll', 0.6], ['Glide_Loop', 0.2], ['Broom_Ride_Loop', 0.2], ['Sit_Ground_Loop', 0.1], ['Sit_Ground_Loop', 0.7], ['Sitting_Idle_Loop', 0.2], ['Crouch_Idle_Loop', 0.2], ['Kneel_Loop', 0.2],
    ['Kagura_Loop', 0.15], ['Kagura_Loop', 0.45], ['Kagura_Loop', 0.8], ['Cast_Fire', 0.5], ['Sword_Regular_Combo', 0.4], ['Swim_Fwd_Loop', 0.5], ['ClimbUp_1m', 0.3], ['Slide_Loop', 0.2]]) {
    const c = rig.clip(n); list.push(rig.pose(c, c.duration * f));
  }
  const S2 = { arms_up2: { J_Bip_L_UpperArm: [0, 0, 70], J_Bip_R_UpperArm: [0, 0, -70] }, squat2: { J_Bip_L_UpperLeg: [-120, 0, 10], J_Bip_R_UpperLeg: [-120, 0, -10], J_Bip_L_LowerLeg: [140, 0, 0], J_Bip_R_LowerLeg: [140, 0, 0] },
    kick2: { J_Bip_R_UpperLeg: [-105, 0, 0], J_Bip_L_UpperLeg: [25, 0, 0] }, splits2: { J_Bip_L_UpperLeg: [0, 0, 55], J_Bip_R_UpperLeg: [0, 0, -55] }, twist2: { J_Bip_C_Spine: [0, -30, 0], J_Bip_C_Chest: [0, -20, 0] },
    bend2: { J_Bip_C_Spine: [0, 0, -20], J_Bip_C_Chest: [0, 0, -15] }, curl2: { J_Bip_C_Spine: [30, 0, 0], J_Bip_C_Chest: [18, 0, 0], J_Bip_L_UpperLeg: [-75, 0, 0], J_Bip_R_UpperLeg: [-75, 0, 0] } };
  for (const r of Object.values(S2)) list.push(fkPose(rig, r));
  list.push(fkPose(rig, {}));
  const n = skin.pos.length / 3, nrm = skin.nrm;
  return list.map((Sk) => ({ Sk, ...skinMesh(skin.pos, nrm, skin.J, skin.W, Sk) })).map((p) => { void n; return p; });
}
/** weights for one cloth point that put it, in every training pose, at the posed skin point + its rest clearance along the
 *  posed skin normal (least squares on the joints of the skin triangle, sum 1, none negative; pulled lightly toward w0) */
function fitWeights(train, q, bary, sp, w0) {
  const js = [...w0.keys()]; if (js.length < 2) return w0;
  const nr = [0, 0, 0]; for (const [vi, f] of bary) for (let k = 0; k < 3; k++) nr[k] += f * train.restN[vi * 3 + k];
  const d0 = dot(sub(q, sp), norm(nr));
  const k = js.length, H = Array.from({ length: k }, () => new Float64Array(k)), g = new Float64Array(k), lam = 2e-6 * train.poses.length;
  for (const P of train.poses) {
    const s = [0, 0, 0], n = [0, 0, 0]; for (const [vi, f] of bary) for (let c = 0; c < 3; c++) { s[c] += f * P.pos[vi * 3 + c]; n[c] += f * P.nrm[vi * 3 + c]; }
    const t = add(s, mul(norm(n), d0)); const A = js.map((j) => { const m = P.Sk[j]; return [m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12], m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13], m[2] * q[0] + m[6] * q[1] + m[10] * q[2] + m[14]]; });
    for (let a = 0; a < k; a++) { g[a] += dot(A[a], t); for (let b = 0; b < k; b++) H[a][b] += dot(A[a], A[b]); }
  }
  for (let a = 0; a < k; a++) { H[a][a] += lam; g[a] += lam * w0.get(js[a]); }
  let act = js.map((_, i) => i), w = null;
  for (let it = 0; it < k; it++) {
    // [H 1; 1' 0] [w; mu] = [g; 1] on the active set
    const m = act.length, M = Array.from({ length: m + 1 }, () => new Float64Array(m + 2));
    for (let a = 0; a < m; a++) { for (let b = 0; b < m; b++) M[a][b] = H[act[a]][act[b]]; M[a][m] = 1; M[a][m + 1] = g[act[a]]; }
    for (let b = 0; b < m; b++) M[m][b] = 1; M[m][m + 1] = 1;
    for (let c = 0; c <= m; c++) { let piv = c; for (let r = c + 1; r <= m; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r; [M[c], M[piv]] = [M[piv], M[c]]; const d = M[c][c]; if (Math.abs(d) < 1e-14) return w0;
      for (let r = 0; r <= m; r++) if (r !== c) { const f = M[r][c] / d; for (let cc = c; cc <= m + 1; cc++) M[r][cc] -= f * M[c][cc]; } }
    const sol = Array.from({ length: m }, (_, a) => M[a][m + 1] / M[a][a]);
    let worst = -1, wv = 0; sol.forEach((v, a) => { if (v < wv) { wv = v; worst = a; } });
    if (worst < 0) { w = new Map(); act.forEach((a, i) => { if (sol[i] > 1e-5) w.set(js[a], sol[i]); }); break; }
    act.splice(worst, 1); if (act.length === 1) { w = new Map([[js[act[0]], 1]]); break; }
  }
  if (!w) return w0;
  let tot = 0; for (const v of w.values()) tot += v; for (const [j, v] of w) w.set(j, v / tot);
  return w;
}
/** normals from the cloth's own field (broad sample: the cloth smooths over the body's small forms); walls keep the mesh's */
function fieldNormals(m, field, eps) {
  const n = m.pos.length / 3, nrm = vertexNormals(m.pos, m.idx), g = [0, 0, 0], out = [];
  for (let v = 0; v < n; v++) {
    const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2]; let N = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    if (!m.rim[v]) { field.normal(x, y, z, g, eps); if (g[0] * N[0] + g[1] * N[1] + g[2] * N[2] > 0.25) N = [g[0], g[1], g[2]]; }
    out.push(N);
  }
  return out;
}

// ------------------------------------------------------------------ small solids: closed tubes, rings
function loopTube(pts, r, K = 8) {
  const n = pts.length, pos = [], idx = [], uv = [];
  for (let i = 0; i < n; i++) {
    const t = norm(sub(pts[(i + 1) % n], pts[(i + n - 1) % n])); let u = cross(t, [0, 1, 0]); if (len(u) < 0.3) u = cross(t, [1, 0, 0]); u = norm(u); const w = cross(u, t);
    for (let k = 0; k < K; k++) { const a = k / K * TAU; pos.push(add(pts[i], add(mul(u, Math.cos(a) * r), mul(w, Math.sin(a) * r)))); uv.push([0.5, 0.5]); }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) { const a = i * K + k, b = i * K + (k + 1) % K, c = ((i + 1) % n) * K + k, d = ((i + 1) % n) * K + (k + 1) % K; idx.push(a, c, b, b, c, d); }
  // winding: outward from each ring's own centre line
  let s = 0; for (let t = 0; t < idx.length; t += 3) { const A = pos[idx[t]], B = pos[idx[t + 1]], Cc = pos[idx[t + 2]]; const i = Math.floor(idx[t] / K); s += dot(cross(sub(B, A), sub(Cc, A)), sub(A, pts[i])); }
  if (s < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  return { pos, idx, uv };
}

// A radial section of the underlying garment, interpolated between 2 mm slices.
// This keeps each gathered root on the body while the free edge flares away.
function radialSampler(mesh) {
  const {pos,idx}=mesh, cuts=new Map(), step=.002;
  function section(y) {
    const key=Math.round(y/step);
    if (cuts.has(key)) return cuts.get(key);
    const h=key*step+1e-7, edges=[];
    for(let i=0;i<idx.length;i+=3) {
      const hit=[];
      for(let j=0;j<3;j++){
        const a=idx[i+j]*3,b=idx[i+(j+1)%3]*3, ay=pos[a+1],by=pos[b+1];
        if((ay>h)===(by>h)) continue;
        const t=(h-ay)/(by-ay);
        hit.push([lerp(pos[a],pos[b],t),lerp(pos[a+2],pos[b+2],t)]);
      }
      if(hit.length===2) edges.push(hit);
    }
    cuts.set(key,edges); return edges;
  }
  return (y,angle) => {
    const dx=Math.sin(angle),dz=Math.cos(angle);
    let radius=0;
    for(const [a,b] of section(y)){
      const ex=b[0]-a[0],ez=b[1]-a[1],denom=dx*ez-dz*ex;
      if(Math.abs(denom)<1e-8) continue;
      const u=(a[0]*dz-a[1]*dx)/denom;
      if(u>=0 && u<=1) radius=Math.max(radius,(a[0]*ez-a[1]*ex)/denom);
    }
    return radius;
  };
}

// A single swimsuit pattern from the front waist to the back waist. The short
// rows under the pelvis form a continuous gusset shared by both leg openings.
function tailoredBrief(C) {
  const radius=radialSampler({pos:C.body.P,idx:C.body.I});
  const rows=[],N=64, clearance=.0055;
  const addSection=(y,angle,back,belt=0)=>{
    const az=angle*Math.PI/180;
    rows.push(Array.from({length:N+1},(_,j)=>{
      const u=j/N*2-1,a=back?Math.PI-u*az:u*az;
      const h=y+belt*.014*Math.sin(a)**2;
      const testAngle=.16, side=back?-1:1;
      const core=radius(h,back?Math.PI-testAngle:testAngle);
      const c=Math.cos(a),s=Math.sin(a);
      const r=Math.max(radius(h,a),core*.94*(1-sm(.0,.4,Math.abs(s))))+clearance+(back?.007:0);
      return [s*r,h,c*r];
    }));
  };
  const upper=[[.943,90,1],[.935,90,1],[.925,90,1],[.914,90,.8],[.905,82,.60],[.896,71,.44],[.886,59,.32],[.876,49,.18],[.866,42,.08],[.856,36,0],[.846,32,0],[.838,27,0]];
  for(const [y,angle,belt] of upper) addSection(y,angle,false,belt);
  // Where the legs separate, the material follows the underside of the pelvis
  // between the thighs. The centre seam remains one surface throughout a stride.
  const sling=[
    [.830,.047,.025],[.824,.041,.022],[.819,.037,.021],[.813,.030,.020],
    [.808,.021,.018],[.802,.011,.0175],[.799,0,.0175],[.800,-.011,.018],
    [.803,-.021,.019],[.809,-.031,.020],[.816,-.040,.022],[.824,-.050,.024],[.831,-.057,.027]
  ];
  for(const [y,z,w] of sling)rows.push(Array.from({length:N+1},(_,j)=>{
    const u=j/N*2-1;return [u*w,y-.003*u*u-.003*sm(-.017,-.048,z),z+Math.sign(z)*.006*u*u-.014*sm(-.013,-.043,z)];
  }));
  for(const [y,angle,belt] of upper.slice().reverse()) addSection(y,Math.min(90,angle+7),true,belt);
  // Share the side-seam rings above the leg opening, and keep the waist edge exact.
  for(let i=0;i<4;i++)for(const col of [0,N]){
    const opposite=rows.length-1-i;
    rows[opposite][col]=rows[i][col].slice();
  }
  const pos=rows.flat(),idx=[];
  for(let row=0;row<rows.length-1;row++)for(let j=0;j<N;j++){
    const i=row*(N+1)+j,k=i+N+1;idx.push(i,k,i+1,i+1,k,k+1);
  }
  // Turn the waist and both leg openings inward onto the skin. This closes
  // the sightline under an open edge at a steep camera angle.
  const wall=(ids,isWaist)=>{
    const vertices=ids.map(i=>{
      const [x,y,z]=pos[i],r=Math.hypot(x,z),inset=isWaist?.013:.009;
      const inner=[x*(1-inset/r),y+(isWaist?-.006:.003),z*(1-inset/r)];
      pos.push(inner);return pos.length-1;
    });
    for(let j=1;j<ids.length;j++)idx.push(ids[j-1],vertices[j-1],ids[j],ids[j],vertices[j-1],vertices[j]);
  };
  const all=Array.from({length:N+1},(_,j)=>j),last=(rows.length-1)*(N+1);
  wall(all,true);wall(all.map(i=>last+i),true);
  for(const col of [0,N]) wall(rows.slice(3,-3).map((_,j)=>(j+3)*(N+1)+col),false);
  return {pos:Float32Array.from(pos.flat()),idx:Uint32Array.from(idx),rim:new Uint8Array(pos.length)};

}

function addOrganza(wd,C,onRow,TP,rawTop,rawBrief) {
  const radii={top:radialSampler(rawTop),hip:radialSampler(rawBrief)};
  const closestGroup=(p,kind)=>nearestWeights(C,p,{k:6,filter:(name)=>kind==='top'?/Chest|Spine|Bust/.test(name):/Hips|Spine|UpperLeg/.test(name)});
  function flounce(kind,layer) {
    const upper=kind==='top', N=upper?96:112,rows=6, row=layer?3:2;
    const root=(a)=>{
      const c=Math.cos(a),s=Math.sin(a);
      if(upper) return neckline(a);
      return hipEdge(s*.143,c*.098)+.006+.015*sm(-.1,.82,c);
    };
    const prefix=upper?'neckline':'waist';
    const position=(a,t)=>{
      const c=Math.cos(a), base=root(a),n=upper?12:15;
      const phase=n*a+.81*Math.sin(3*a+.35)+.42*Math.sin(5*a-.9)+.45*t+(layer?.53:0);
      const ridge=(Math.cos(phase)+1)/2;
      const l=upper?lerp(.022,.058,sm(.18,.75,c))+.005*(1-c*c):.049+.008*(1-c*c)-.019*sm(.0,.78,c);
      const drop=layer?l*.88:l+.005;
      const t0=layer?.0:.12, fall=drop*(t+t0);
      const y=base-fall+(upper?.0035:.0057)*Math.sin(phase-.6)*t*t;
      const surface=radii[kind](y,a);
      const ease=(layer?.003:.0018)+t*(layer?.013:.006)+(upper?.012:.017)*ridge*t**1.3+(upper?0:.007*(1-sm(.0,.75,c)))*t*t;
      const r=surface+ease;
      return {p:[Math.sin(a)*r,y,Math.cos(a)*r],ridge};
    };
    const vBand=(upper?0:.5)+layer*.25, pad=.004;
    const color = layer ? ramp([194,176,199],[143,125,155],[229,214,228]) : ramp([178,162,184],[119,104,135],[216,202,216]);
    wd.cvB.rect([0,vBand,1,vBand+.25],(u,v)=>{
      const a=u*TAU,t=clamp01((v*.25-pad)/(.25-2*pad)),n=upper?12:15;
      const phase=n*a+.81*Math.sin(3*a+.35)+.42*Math.sin(5*a-.9)+.45*t+(layer?.53:0);
      const ridge=(Math.cos(phase)+1)/2,shade=.43*(1-ridge)-.19*ridge+.13*(1-t)+.04*Math.cos(3*a);
      const weave=Math.sin(TAU*(u*107+t*9))*Math.sin(TAU*(u*107-t*9));
      const hem=.15*sm(.94,.99,t)-.13*sm(.975,1,t);
      return color(shade+hem-.047*weave);
    });
    const g=grid(rows,N+1,(i,j)=>{
      const t=i/(rows-1),a=TAU*j/N,{p}=position(a,t);
      return {p,u:j/N,v:vBand+pad+t*(.25-2*pad)};
    });
    fixWinding(g,[0,upper?1.15:.9,0]);
    const under=upper?'halter':'brief';
    const nearby=wd.weightsBelow(g.pos,2,{skip:name=>name!==under,reach:.09});
    const weights=g.pos.map((p,i)=>nearby[i] || closestGroup(p,kind));
    wd.piece(prefix+(layer?'_ruffle':'_ruffle_under'),g,weights,'float_organza',{layer:2+layer*.1,group:'akari_swim_'+prefix});
    if(layer) {
      const pts=Array.from({length:N},(_,j)=>position(TAU*j/N,0).p);
      const edge=loopTube(pts,upper?.0022:.0025,6);
      edge.uv=edge.pos.map(()=>onRow(upper?0:2)(.03));
      wd.piece(prefix+'_binding',edge,edge.pos.map((_,i)=>weights[Math.floor(i/6)]),'cloth_white',{layer:2.2,group:'akari_swim_'+prefix});
    }
  }
  for(const kind of ['top','hip']) for(const layer of [0,1]) flounce(kind,layer);

  const gStar=(point,normal,r)=>{
    const u=norm(cross([0,1,0],normal)), v=norm(cross(normal,u));
    const center=add(point,mul(normal,.002)), pos=[add(center,mul(normal,.0032))],idx=[];
    for(let i=0;i<10;i++){
      const a=Math.PI/2+i*TAU/10,rad=r*(i%2?.47:1);
      pos.push(add(center,add(mul(u,Math.cos(a)*rad),mul(v,Math.sin(a)*rad))));
    }
    for(let i=0;i<10;i++) idx.push(0,1+i,1+(i+1)%10);
    return {pos,idx,uv:pos.map((_,i)=>onRow(5)(i===0?-.25:.1+.28*Math.sin(i)))};
  };
  for(const sign of [-1,1]) {
    const root=snapTo(TP.cloth,[sign*.044,1.206,.12]);
    const points=[root,...TP.strapPts.slice(0,7).map(q=>[q[0]*sign,q[1],q[2]])];
    const normals=points.map(p=>TP.cloth.normal(...p,[0,0,0],.002));
    const pts=points.map((p,i)=>add(p,mul(normals[i],.0025)));
    const across=pts.map((p,i)=>norm(cross(normals[i],sub(pts[Math.min(i+1,pts.length-1)],pts[Math.max(0,i-1)]))));
    const strap=strip(pts,normals,across,.0043,.0011);
    strap.uv=strap.pos.map((_,i)=>onRow(0)(i%4<2?-.10:.08));
    wd.piece('halter_tie_'+sign,strap,strap.pos.map(p=>closestGroup(p,'top')),'cloth_white',{layer:1.3,group:'akari_swim_top'});
    const anchor=snapTo(TP.cloth,[sign*.048,1.228,.12]),normal=TP.cloth.normal(...anchor,[0,0,0],.003);
    const g=gStar(add(anchor,mul(normal,.004)),normal,.012), w=closestGroup(anchor,'top');
    wd.piece('halter_star_'+sign,g,g.pos.map(()=>w),'float_gold',{layer:2,group:'akari_swim_stars'});
  }

  // A gathered fabric torus around the left wrist. The folds are part of the mesh.
  const wrist=C.W.get('J_Bip_L_Hand'), lower=C.W.get('J_Bip_L_LowerArm'), axis=norm(sub(wrist,lower));
  const c=add(wrist,mul(axis,-.018)), v=norm(cross(axis,[0,0,1])),w=norm(cross(axis,v)),N=72,K=10;
  const wristband=grid(K+1,N+1,(i,j)=>{
    const t=i/K*TAU,a=j/N*TAU,phase=10*a+.4*Math.sin(3*a), fold=.5+.5*Math.cos(phase);
    const r=.025+.004*fold+(.006+.0025*fold)*Math.cos(t);
    const p=add(c,add(mul(axis,.009*Math.sin(t)+.004*Math.sin(phase)),add(mul(v,r*Math.cos(a)),mul(w,r*Math.sin(a)))));
    const uv=onRow(4)(.38*(1-fold)-.18*fold+.12*Math.cos(t));return {p,u:uv[0],v:uv[1]};
  });
  fixWinding(wristband,c);
  const weight=wmix(W1(C.ji('J_Bip_L_LowerArm')),W1(C.ji('J_Bip_L_Hand')),.24);
  wd.piece('pink_wrist_scrunchie',wristband,wristband.pos.map(()=>weight),'float_wrist',{group:'akari_swim_scrunchie'});
}

// ==================================================================================================== build
export async function build() {
  const t0 = Date.now(); const log = (s) => console.log(s);
  const threads = Number(process.env.SCULPT_THREADS || 2);
  const C = await loadChar(BASE);
  const wd = new Wardrobe(C, { texSize: 512 }); wd.cvA = new Canvas(512, 512); wd.cvB = new Canvas(1024, 1024);
  wd.sw = new Map(); wd.swRect = [0.75, 0.75, 1, 1];
  const nJ = C.jn.length;
  // the base's undergarment is not carried over: the swimsuit is the always-worn layer
  { const u = C.root.listNodes().find((n) => n.getName() === 'akari_under'); u.getMesh().dispose(); u.dispose(); }
  const rig = await loadRig(path.join(ROOT, RIG_FILE)); const J = (n) => rig.bone(n).head;
  const skin = { pos: C.body.P, idx: C.body.I, J: C.body.J, W: C.body.Wt, nrm: C.body.N, mirrorJ: C.jn.map((nm, i) => { const m = nm.replace(/_L_/, '_@_').replace(/_R_/, '_L_').replace(/_@_/, '_R_'); const k = C.jn.indexOf(m); return k >= 0 ? k : i; }) };
  { const tt = Date.now(); skin.train = { poses: await trainingPoses(skin), restN: C.body.N }; log(`  weight-fit training poses: ${skin.train.poses.length} (${((Date.now() - tt) / 1000).toFixed(0)} s)`); }

  // ---- atlas A ramp rows; gold ramp cell in B
  const ROWS = 8, rowV = (r) => (r + 0.5) / ROWS, rowRect = (r) => [0, r / ROWS, 1, (r + 1) / ROWS];
  const paintRow = (r, fn) => wd.cvA.rect(rowRect(r), (lu) => fn(lu * 1.25 - 0.25));
  paintRow(0, ramp(knit.base, knit.shade, knit.hi));
  paintRow(1, ramp([58, 49, 61], knit.shade, knit.hi));
  paintRow(2, ramp([178,162,184], [119,104,135], [216,202,216]));
  paintRow(3, ramp([194,176,199], [143,125,155], [229,214,228]));
  paintRow(4, ramp([216,146,180], [156,92,140], [245,191,213]));
  paintRow(5, ramp(gold.base, gold.shade, gold.hi));
  const onRow = (r) => (t) => [0.03 + 0.94 * tn(t), rowV(r)];

  // ---- 1. field layers
  const A = (f) => path.join(ROOT, 'tools/sculpt/assets', f), cacheDir = path.join(ROOT, '.tmp/akari-swim-b/cache');
  const src = (f) => [A(f), A('akari_swim_b.mjs'), A('akari_body.mjs')];
  const tc = Date.now();
  const rTop = await contourPieces(A('akari_swim_b_top.mjs'), [{ name: 'top', bounds: [-0.165, 1.05, -0.125, 0.165, 1.315, 0.145], voxel: 0.0016, planes: [], tris: 6200, key: 1 }], { cacheDir, sources: src('akari_swim_b_top.mjs'), log, threads });
  const rSh = await contourPieces(A('akari_swim_b_shorts.mjs'), [{ name: 'shorts', bounds: [-0.19, 0.69, -0.135, 0.19, 1.05, 0.12], voxel: 0.0018, planes: [], tris: 3800, key: 1 }], { cacheDir, sources: src('akari_swim_b_shorts.mjs'), log, threads });
  log(`  field pieces (${((Date.now() - tc) / 1000).toFixed(0)} s)`);
  const TP = topParts(S, J), SP = shortsParts(S, J), body = TP.body, T = SWIM.top, H = SWIM.shorts;
  const halter = (x,y,z) => Math.min(TP.mask(x,y,z), y-lowerBand(x,z), Math.max(Math.min(TP.panel(x,y,z), Math.max(1.211,neckline(Math.atan2(x,z))+.002)-y), T.bandTop + .0015 - y, TP.straps(x,y,z) - .0058));
  const [topC] = cutLayer(rTop.top, { body, mask: halter, wallTo: -.003 });
  const shC = tailoredBrief(C);

  const topShade = (x, y, z, rim, n) => {
    if (rim) return 0.62;
    let t = 0.04;
    t += 0.12 * sm(T.bandTop - 0.006, T.bandBot + 0.006, y);                                     // the band a touch deeper toward its foot
    t += 0.34 * Math.exp(-(((y - (T.bandTop + 0.004)) / 0.004) ** 2)) * sm(0.03, 0.07, z);          // the shell's ledge over the band
    t += 0.24 * sm(0.55, 0.95, Math.abs(n[0])) * (y > T.bandTop ? 1 : 0.6);                        // turning away at the sides
    t -= 0.14 * sm(1.13, 1.2, y) * sm(0.05, 0.08, z) * (1 - sm(0.05, 0.09, Math.abs(x)));           // one broad light across the upper shell
    t += 0.2 * sm(-0.2, -0.75, n[1]) * (y > T.bandTop ? 1 : 0);                                    // undersides
    return t;
  };
  const shortsShade = (x, y, z, rim, n) => {
    if (rim) return 0.62;
    const yT = SP.yTop(z); let t = 0.05;
    t += 0.34 * Math.exp(-(((y - (yT - H.bandH - 0.0035)) / 0.0035) ** 2));                          // the waistband's foot
    t += 0.2 * sm(0.6, 0.95, Math.abs(n[0]));
    t += 0.25 * sm(-0.2, -0.75, n[1]);
    t -= 0.08 * Math.exp(-((((Math.abs(x) - 0.06) / 0.04) ** 2) + (((y - 0.9) / 0.05) ** 2))) * sm(0.3, 0.8, n[2]);   // light on the front of the hips
    return t;
  };
  const emitField = (name, m, field, eps, shadeOf, uvOf, mat, o) => {
    const n = m.pos.length / 3, pos = [], uv = [];
    let nrm;
    if (field) nrm = fieldNormals(m, field, eps);
    else {
      const v = vertexNormals(m.pos,m.idx);
      nrm = Array.from({length:n},(_,i)=>[v[3*i],v[3*i+1],v[3*i+2]]);
    }
    for (let v = 0; v < n; v++) { const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2]; pos.push([x, y, z]); uv.push(uvOf(shadeOf(x, y, z, m.rim[v], nrm[v]))); }
    const w = copyW(skin, m.pos, nJ, !!o.legsApart, o.mirror || null);
    const geo = { pos, uv, idx: Array.from(m.idx) }; wd.piece(name, geo, w, mat, { normals: nrm, hems: [], layer: o.layer, group: o.group }); return { geo, w };
  };
  emitField('halter', topC, TP.cloth, .005, topShade, onRow(0), 'cloth_white', { layer: 1, group: 'akari_swim_top', mirror: [1.04,1.3] });
  skin.crotchY = SP.crotchY;
  emitField('brief', shC, null, .005, shortsShade, onRow(1), 'cloth_white', { layer: 1, group: 'akari_swim_shorts', legsApart: true });
  addOrganza(wd, C, onRow, TP, rTop.top, rSh.shorts);
  await fitHipRuffle(C,wd);

  // ---- 4b. cull: the skin under the top and the shorts is dropped where they cover it (cull.mjs, as v3 does): this file
  // does not pay for what nobody sees, and the few-mm dips of the shorts into the skin at deep bends cannot show skin.
  // Cloth + piping of one garment go in as ONE cover (welded along the piping cut, so the piping is no opening).
  if (!args.includes('--whole')) {
    const fm = (...ms) => { let n = 0; const P = [], I = []; for (const m of ms) { for (const v of m.pos) P.push(v); for (const i of m.idx) I.push(i + n); n += m.pos.length / 3; } return { pos: Float32Array.from(P), idx: Uint32Array.from(I) }; };
    const r = cullCovered({ pos: C.body.P, idx: C.body.I, nrm: C.body.N }, [{ name: 'top', ...fm(topC) }, { name: 'shorts', margin: SHORTS_MARGIN, ...fm(shC) }],
      { keepIf: (x, y, z) => (y < KEEP.legTo && !(Math.abs(x) < CROTCH.x && y > CROTCH.y0)) || (y > KEEP.band[0] && y < KEEP.band[1]) });
    // The seat is under tension in a roll. Retain the skin at the leg opening
    // but remove the hidden patch inside the rear panel; the independent hole
    // rays below still probe every removed triangle in all animations.
    const hidden=(i)=>{
      const x=C.body.P[i*3],y=C.body.P[i*3+1],z=C.body.P[i*3+2];
      return z<-.017 && underBrief(x,y,z);
    };
    const index=[];
    for(let i=0;i<r.idx.length;i+=3){
      const [a,b,c]=r.idx.subarray(i,i+3);
      if(!(hidden(a)&&hidden(b)&&hidden(c)))index.push(a,b,c);
    }
    C.body.prim.getIndices().setArray(Uint32Array.from(index));
    log(`  cull: body ${r.stats.tris} -> ${index.length/3} tris`);
  }

  // The bind figure was posed on 34 mm platform soles. Bring bare feet down
  // together and spread that displacement along the lower shin.
  const footPositions = C.body.prim.getAttribute('POSITION');
  const bare = Float32Array.from(footPositions.getArray());
  for(let i=1;i<bare.length;i+=3) bare[i] -= .0345 * (1-sm(.133,.295,bare[i]));
  footPositions.setArray(bare);

  // ---- 5. textures + materials
  paintSwatches(wd);

  wd.cvA.dilate(4); wd.cvB.dilate(6);
  const TA = 'akari_swim_b_garment_a', TB = 'akari_swim_b_garment_b'; wd.textures.set(TA, wd.cvA); wd.textures.set(TB, wd.cvB);
  // the game pushes every garment's shade colour toward a cool blue (celmat COOL) and multiplies it in: a blue shade colour on
  // an indigo albedo went to pure royal blue on screen (r3 game rounds g1/g2: R channel 0). A warm-violet shade colour keeps
  // the shade side indigo-violet after that push.
  const sh = (process.env.SWB_SH || '1.0,0.66,0.84').split(',').map(Number);
  wd.material('cloth_white', { rough: .81, extras: { finish: 'stretch' }, tex: TA, doubleSided: true, shade: sh });   // a crumple in a deep bend shows the cloth's inside, never a window
  wd.material('float_organza', { rough: .87, extras: { finish: 'voile' }, tex: TB, doubleSided: true, shade: [.85,.76,.88] });
  wd.material('float_wrist', { rough: .89, extras: { finish: 'linen' }, tex: TA, doubleSided: true, shade: [.88,.75,.83] });
  wd.material('float_gold', { rough: .43, metal: .56, extras: { finish: 'brass' }, tex: TA, doubleSided: true, shade: [.85,.71,.63] });
  const res = await wd.finish(BUILT, { dumpTex: path.join(WORK, 'tex'), sidecar: path.join(WORK, 'char_akari_swim_b.layers.json') });

  // ---- 6. checks that fail the build
  await keepSkeleton(BUILT);
  const sk = await compareSkeleton(BASE, BUILT);
  if (!(sk.sameJoints && sk.sameIBM && sk.sameRest && sk.joints === 175)) throw new Error('skeleton differs from the base: ' + JSON.stringify(sk));
  const tris = await countTris(BUILT);
  const cov = await coverage(BUILT, log);
  if (tris.total >= TRI_BUDGET) { fs.writeFileSync(path.join(WORK, 'build.json'), JSON.stringify({ tris, coverage: cov.summary }, null, 1)); throw new Error(`triangle budget: ${tris.total} >= ${TRI_BUDGET} ${JSON.stringify(tris.by)}`); }
  const info = { out: OUT, garmentTris: res.tris, tris, skeleton: sk, coverage: cov.summary, size: fs.statSync(BUILT).size, chains: [],
    pieces: wd.pieces.filter((p) => !p.ghost).map((p) => ({ name: p.name, mat: p.mat, group: p.group, layer: p.layer ?? null, tris: p.geo.idx.length / 3 })) };
  fs.writeFileSync(path.join(WORK, 'build.json'), JSON.stringify(info, null, 1));
  if (!cov.pass) throw new Error('COVERAGE CHECK FAILED: ' + JSON.stringify(cov.summary.fails.slice(0, 12)));
  fs.copyFileSync(BUILT, OUT);
  log(`char_akari_swim_b: ${tris.total} tris (garment ${res.tris}), ${(info.size / 1e6).toFixed(2)} MB, coverage ok over ${cov.summary.poses} poses (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  return info;
}

// ------------------------------------------------------------------ skeleton: the base's inverse binds byte for byte
async function keepSkeleton(file) {
  const io = new NodeIO(); const [a, b] = await Promise.all([io.read(BASE), io.read(file)]);
  const sa = a.getRoot().listSkins()[0], sb = b.getRoot().listSkins()[0];
  const na = sa.listJoints().map((j) => j.getName()), nb = sb.listJoints().map((j) => j.getName());
  if (na.join() !== nb.join()) throw new Error('joint lists differ');
  sb.getInverseBindMatrices().setArray(Float32Array.from(sa.getInverseBindMatrices().getArray()));
  const byName = new Map(a.getRoot().listNodes().map((n) => [n.getName(), n]));
  for (const j of sb.listJoints()) { const o = byName.get(j.getName()); j.setTranslation(o.getTranslation()).setRotation(o.getRotation()).setScale(o.getScale()); }
  await io.write(file, b);
}
async function countTris(file) {
  const doc = await new NodeIO().read(file); const by = {}; let total = 0;
  for (const nd of doc.getRoot().listNodes()) { const m = nd.getMesh(); if (!m) continue; let t = 0; for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3; by[nd.getName()] = t; total += t; }
  return { total, by };
}
// ==================================================================================================== COVERAGE CHECK
// Zones from the undergarment (tools/sculpt/assets/akari_under.mjs UNDER) and the regions of akari_base.regions.json.
export const ZONES = {
  chest: { regions: ['chest'], y0: 1.095, y1: 1.2, xMax: 0.1, front: true },            // under-bust 1.115 - 2 cm .. robe V apex 1.192 + 8 mm
  pelvis: { regions: ['hips', 'waist', 'thigh_L', 'thigh_R'], y0: 0.758, y1: 0.962 },   // crotch 0.798 - 4 cm .. under-shorts top 0.962
};
export const STRESS = {
  arms_up: { J_Bip_L_UpperArm: [0, 0, 78], J_Bip_R_UpperArm: [0, 0, -78], J_Bip_L_Shoulder: [0, 0, 14], J_Bip_R_Shoulder: [0, 0, -14] },
  arms_forward: { J_Bip_L_UpperArm: [0, -82, -60], J_Bip_R_UpperArm: [0, 82, 60] },
  arms_back: { J_Bip_L_UpperArm: [0, 40, -70], J_Bip_R_UpperArm: [0, -40, 70] },
  deep_squat: { J_Bip_L_UpperLeg: [-112, 0, 6], J_Bip_R_UpperLeg: [-112, 0, -6], J_Bip_L_LowerLeg: [130, 0, 0], J_Bip_R_LowerLeg: [130, 0, 0], J_Bip_C_Spine: [22, 0, 0] },
  high_kick: { J_Bip_L_UpperLeg: [-100, 0, 0], J_Bip_R_UpperLeg: [22, 0, 0], J_Bip_C_Spine: [-8, 0, 0] },
  splits_side: { J_Bip_L_UpperLeg: [0, 0, 60], J_Bip_R_UpperLeg: [0, 0, -60] },
  twist: { J_Bip_C_Spine: [0, 32, 0], J_Bip_C_Chest: [0, 22, 0], J_Bip_C_UpperChest: [0, 14, 0], J_Bip_L_UpperArm: [0, 0, -60], J_Bip_R_UpperArm: [0, 0, 60] },
  side_bend: { J_Bip_C_Spine: [0, 0, 22], J_Bip_C_Chest: [0, 0, 16], J_Bip_R_UpperArm: [0, 0, -100] },
  arch_back: { J_Bip_C_Spine: [-24, 0, 0], J_Bip_C_Chest: [-16, 0, 0], J_Bip_L_UpperArm: [0, 0, 80], J_Bip_R_UpperArm: [0, 0, -80] },
  curl_forward: { J_Bip_C_Spine: [38, 0, 0], J_Bip_C_Chest: [22, 0, 0], J_Bip_L_UpperLeg: [-60, 0, 0], J_Bip_R_UpperLeg: [-60, 0, 0], J_Bip_L_LowerLeg: [90, 0, 0], J_Bip_R_LowerLeg: [90, 0, 0] },
};
const CLIPS = [['Idle_Loop', 0.3], ['Jog_Fwd_Loop', 0.2], ['Jog_Fwd_Loop', 0.65], ['Sprint_Loop', 0.3], ['Sprint_Loop', 0.8], ['Jump_Start', 0.6], ['Jump_Loop', 0.5], ['Land_Hard', 0.4],
  ['Roll', 0.25], ['Roll', 0.5], ['Glide_Loop', 0.5], ['Broom_Ride_Loop', 0.5], ['Swim_Fwd_Loop', 0.3], ['Swim_Fwd_Loop', 0.75], ['Cast_Thunder', 0.5], ['Cast_Wind', 0.5], ['Spell_Simple_Shoot', 0.4],
  ['Sit_Ground_Loop', 0.4], ['Sitting_Idle_Loop', 0.5], ['Crouch_Idle_Loop', 0.5], ['Kneel_Loop', 0.5], ['Kagura_Loop', 0.3], ['Kagura_Loop', 0.6], ['Sword_Heavy_Combo', 0.5], ['Bow', 0.5], ['Charm_Throw', 0.5], ['Slide_Loop', 0.5], ['ClimbUp_1m', 0.5]];

const PX = 0.0012, MAXPX = 3;
const VIEWS = Array.from({ length: 48 }, (_, i) => { const y = 1 - (2 * i + 1) / 48, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5)); return [Math.cos(a) * r, y, Math.sin(a) * r]; });
export async function coverage(file, log = console.log) {
  const { loadFigureRig } = await import('../sculpt/figure/akari-figure.mjs');
  const ch = await loadCharacter(file, { textures: false });
  const bodyP = ch.prims.find((p) => p.material === 'Body');
  const cloth = ch.prims.filter((p) => p.node === 'akari_swim_top' || p.node === 'akari_swim_shorts');
  // the head closes the body's face opening; a hair skinned to joints of its own (hair 2) is left out of the occluders (stricter)
  const nBase = (await loadCharacter(BASE, { textures: false })).joints.length;
  const others = ch.prims.filter((p) => /^akari_(face|hair)$/.test(p.node) && p.alphaMode === 'OPAQUE' && !Array.from(p.J).some((j) => j >= nBase));
  const RG = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/sculpt/akari_base.regions.json'), 'utf8'));
  const names = RG.names, reg = RG.akari_body.region;
  if (reg.length !== bodyP.pos.length / 3) throw new Error('regions.json does not match the Body primitive');
  // zone triangles (all three vertices inside the zone)
  const inZone = (v) => { const r = names[reg[v]], x = bodyP.pos[v * 3], y = bodyP.pos[v * 3 + 1], z = bodyP.pos[v * 3 + 2];
    const c = ZONES.chest; if (c.regions.includes(r) && y >= Math.max(c.y0,lowerBand(x,z)+.012) && y <= c.y1 && Math.abs(x) <= c.xMax && z > 0.012) return 1;
    const p = ZONES.pelvis; if (p.regions.includes(r) && y >= p.y0 && y <= p.y1 && underBrief(x,y,z)) return 2; return 0; };
  const zv = new Uint8Array(bodyP.pos.length / 3).map((_, v) => inZone(v));
  const zt = new Set(); for (let t = 0; t < bodyP.idx.length; t += 3) { const a = bodyP.idx[t], b = bodyP.idx[t + 1], c = bodyP.idx[t + 2]; if (zv[a] && zv[a] === zv[b] && zv[a] === zv[c]) zt.add(t); }
  // the skin this file culled (under the top / shorts): its zone triangles become HOLE PROBES. Where one faces the camera,
  // the nearest surface drawn must be top / shorts cloth or something in front of it: else the camera looks through a
  // hole in her (background, the far thigh, skin behind) where the skin was dropped.
  const baseP = (await loadCharacter(BASE, { textures: false })).prims.find((p) => p.material === 'Body');
  if (baseP.pos.length !== bodyP.pos.length) throw new Error('Body vertices differ from the base');
  const keptK = new Set(); for (let t = 0; t < bodyP.idx.length; t += 3) keptK.add([bodyP.idx[t], bodyP.idx[t + 1], bodyP.idx[t + 2]].join());
  const probeI = []; let zoneAll = 0;
  for (let t = 0; t < baseP.idx.length; t += 3) { const a = baseP.idx[t], b = baseP.idx[t + 1], c = baseP.idx[t + 2]; const inZ = zv[a] && zv[a] === zv[b] && zv[a] === zv[c]; if (inZ) zoneAll++; if (!keptK.has([a, b, c].join())) probeI.push(a, b, c); }
  const PROBE = -3, CLOTH = -2;
  const rig = await loadFigureRig();
  // the base's joints first and in the same order; a hair that brings its own joints (hair 2, J_Sec_Hair*) appends them after
  // the base's (tools/costume/wardrobe-build.mjs --hair): they skin only the hair, which this check does not draw
  if (rig.jointNames.join() !== ch.joints.slice(0, rig.jointNames.length).join() || ch.joints.slice(rig.jointNames.length).some((n) => !/^J_Sec_Hair/.test(n))) throw new Error('rig source and file joint orders differ');
  const poses = [['rest', fkPose(rig, {})]];
  for (const [nm, tt] of CLIPS) { let c; try { c = rig.clip(nm); } catch { continue; } poses.push([`${nm}@${tt}`, rig.pose(c, c.duration * tt)]); }
  for (const [nm, rot] of Object.entries(STRESS)) poses.push(['stress:' + nm, fkPose(rig, rot)]);
  const fails = [], dump = {}, outsideMax = {}; let tested = 0;
  for (const [nm, Sk] of poses) {
    const B = skinMesh(bodyP.pos, bodyP.nrm, bodyP.J, bodyP.W, Sk);
    // What a camera can see: the posed body + top + shorts rasterised orthographically from VIEWS directions round the
    // sphere at PX metres per pixel (depth buffer). A pixel whose nearest surface is a zone triangle of the body is skin
    // showing. Any view with >= MAXPX such pixels fails the pose. (Skin seen only at a grazing angle up a leg opening
    // projects to well under a pixel at the protected edge of each pattern piece.)
    // single-sided like the game: a triangle counts only when it faces the camera
    const tri = [];
    const addTris = (q, qn, idx, zoneOf, ds = false) => { for (let t = 0; t < idx.length; t += 3) { const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
      const a = [q[ia * 3], q[ia * 3 + 1], q[ia * 3 + 2]], b = [q[ib * 3], q[ib * 3 + 1], q[ib * 3 + 2]], c = [q[ic * 3], q[ic * 3 + 1], q[ic * 3 + 2]];
      const fn = cross(sub(b, a), sub(c, a)); void qn;                         // winding decides, as on the GPU (FrontSide = counter-clockwise)
      tri.push([q, ia, ib, ic, zoneOf(t), fn, ds]); } };
    for (const p of cloth) { const q = skinMesh(p.pos, p.nrm, p.J, p.W, Sk); addTris(q.pos, q.nrm, p.idx, () => CLOTH, p.doubleSided); }
    for (const p of others) { const q = skinMesh(p.pos, p.nrm, p.J, p.W, Sk); addTris(q.pos, q.nrm, p.idx, () => -1); }
    addTris(B.pos, B.nrm, bodyP.idx, (t) => (zt.has(t) ? t : -1));
    const probes = []; { const save = tri.length; addTris(B.pos, B.nrm, probeI, (t) => t); probes.push(...tri.splice(save)); }
    const zb = [9, 9, 9, -9, -9, -9]; for (let i0 = 0; i0 < probeI.length + zt.size * 3; i0++) { const i = i0 < probeI.length ? probeI[i0] : null; if (i === null) break; for (let c = 0; c < 3; c++) { zb[c] = Math.min(zb[c], B.pos[i * 3 + c]); zb[c + 3] = Math.max(zb[c + 3], B.pos[i * 3 + c]); } }
    for (const t of zt) for (let k = 0; k < 3; k++) { const i = bodyP.idx[t + k]; for (let c = 0; c < 3; c++) { zb[c] = Math.min(zb[c], B.pos[i * 3 + c]); zb[c + 3] = Math.max(zb[c + 3], B.pos[i * 3 + c]); } }
    const cen = [(zb[0] + zb[3]) / 2, (zb[1] + zb[4]) / 2, (zb[2] + zb[5]) / 2], rad = Math.hypot(zb[3] - zb[0], zb[4] - zb[1], zb[5] - zb[2]) / 2 + 0.01;
    let worst = 0, worstView = null, worstHoles = 0; const seenT = new Set();
    for (const w of VIEWS) {
      if (cen[1] + 2.5 * w[1] < 0.05) continue;                                     // a camera 2.5 m out would be under the ground
      let e1 = cross(w, [0, 1, 0]); if (len(e1) < 0.2) e1 = cross(w, [1, 0, 0]); e1 = norm(e1); const e2 = cross(w, e1);
      const N = Math.ceil((2 * rad) / PX), u0 = dot(cen, e1) - rad, v0 = dot(cen, e2) - rad;
      const depth = new Float32Array(N * N).fill(-Infinity), id = new Int32Array(N * N).fill(-1);
      const pDepth = new Float32Array(N * N).fill(-Infinity), pid = new Int32Array(N * N).fill(-1);
      const raster = (list, dep, ids) => { for (const [q, ia, ib, ic, zt0, fn, ds] of list) {
        if (!ds && dot(fn, w) <= 0) continue;                                          // double-sided cloth draws its back faces too
        const P3 = [ia, ib, ic].map((i) => [q[i * 3], q[i * 3 + 1], q[i * 3 + 2]]);
        const X = P3.map((p) => (dot(p, e1) - u0) / PX), Y = P3.map((p) => (dot(p, e2) - v0) / PX), D = P3.map((p) => dot(p, w));
        const x0 = Math.max(0, Math.floor(Math.min(...X))), x1 = Math.min(N - 1, Math.ceil(Math.max(...X))), y0 = Math.max(0, Math.floor(Math.min(...Y))), y1 = Math.min(N - 1, Math.ceil(Math.max(...Y)));
        if (x0 > x1 || y0 > y1) continue;
        const ar = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]); if (Math.abs(ar) < 1e-9) continue;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const l1 = ((X[1] - px) * (Y[2] - py) - (X[2] - px) * (Y[1] - py)) / ar, l2 = ((X[2] - px) * (Y[0] - py) - (X[0] - px) * (Y[2] - py)) / ar, l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          const d = l1 * D[0] + l2 * D[1] + l3 * D[2], k = y * N + x; if (d > dep[k]) { dep[k] = d; if (ids) ids[k] = zt0; }
        }
      } };
      raster(tri, depth, id); raster(probes, pDepth, pid);
      let n = 0, holes = 0, outside = 0;
      for (let k = 0; k < N * N; k++) {
        if (id[k] >= 0) { n++; seenT.add(id[k]); continue; }
        const pd = pDepth[k]; if (pd === -Infinity || depth[k] >= pd - 0.002) continue;   // no culled skin here, or covered in front
        if (id[k] === CLOTH) continue;                                                       // swimsuit cloth (a crumple of the shorts at most): no window
        // nothing of her drawn at this pixel, before or behind the culled skin: that skin has swung OUT past her outline
        // (the body's own skinning at the crotch in a deep fold); it is not drawn, so the pixel is background: no window
        if (depth[k] === -Infinity) { outside++; continue; }
        n++; holes++; if (holes === 1) seenT.add('hole');
        { const t = pid[k], c = [0, 1, 2].map((a) => ((bodyP.pos[probeI[t] * 3 + a] + bodyP.pos[probeI[t + 1] * 3 + a] + bodyP.pos[probeI[t + 2] * 3 + a]) / 3).toFixed(3)).join(','); seenT.add('h:' + c); }
        if (process.env.DEBUG_VIEW) id[k] = -9;
      }
      if (process.env.DEBUG_VIEW && new RegExp(process.env.DEBUG_VIEW).test(nm) && n >= MAXPX) {
        const { PNG } = await import('pngjs').catch(() => ({ PNG: null }));
        const rgb = new Uint8Array(N * N * 3); for (let k = 0; k < N * N; k++) { const c = id[k] === -9 ? [255, 0, 0] : id[k] >= 0 ? [255, 150, 0] : depth[k] === -Infinity ? [255, 255, 255] : id[k] === CLOTH ? [60, 60, 170] : [170, 160, 160]; rgb.set(c, ((N - 1 - Math.floor(k / N)) * N + (k % N)) * 3); }
        const sharp = (await import('sharp')).default; await sharp(Buffer.from(rgb), { raw: { width: N, height: N, channels: 3 } }).png().toFile(path.join(WORK, `view_${nm.replace(/\W/g, '_')}_${w.map((v) => v.toFixed(2)).join('_')}.png`)); void PNG;
      }
      if (n > worst) { worst = n; worstHoles = holes; worstView = w.map((v) => +v.toFixed(2)); }
      if (outside > (outsideMax[nm] || 0)) outsideMax[nm] = outside;
    }
    tested += VIEWS.length;
    const miss = worst >= MAXPX ? worst : 0, where = worst ? [{ px: worst, holes: worstHoles, view: worstView }] : [];
    if (worst) (dump[nm] = [...seenT]);
    if (miss) fails.push({ pose: nm, miss, where });
  }
  fs.writeFileSync(path.join(WORK, 'cov_miss.json'), JSON.stringify(dump));
  const zl = [...zt]; const summary = { zoneTris: zoneAll, keptZoneTris: zl.length, culledTris: probeI.length / 3, chestTris: zl.filter((t) => zv[bodyP.idx[t]] === 1).length, pelvisTris: zl.filter((t) => zv[bodyP.idx[t]] === 2).length, px: PX, views: VIEWS.length, maxPx: MAXPX, poses: poses.length, probes: tested, fails, culledSkinOutsideOutline: outsideMax };
  log(`  coverage: ${zoneAll} zone triangles (${summary.culledTris} culled body triangles -> hole probes; kept ${summary.chestTris} chest + ${summary.pelvisTris} pelvis) x ${poses.length} poses -> ${fails.length ? 'FAIL ' + fails.map((f) => `${f.pose} ${f.miss}px (${f.where[0]?.holes} hole) [${f.where[0]?.view}]`).join(', ') : 'all covered'}`);
  return { pass: fails.length === 0, summary };
}
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ==================================================================================================== manifest entry
async function install() {
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
  const v3 = man.char_akari_v3 || man.char_akari, base = man.char_akari_base, info = JSON.parse(fs.readFileSync(path.join(WORK, 'build.json'), 'utf8'));
  const FILE = 'models/chars/char_akari_swim_b.glb'; const doc = await new NodeIO().read(path.join(ROOT, 'assets', FILE));
  const mn = [9, 9, 9], mx = [-9, -9, -9], mats = new Set(), meshes = []; let tris = 0;
  for (const nd of doc.getRoot().listNodes()) { const m = nd.getMesh(); if (!m) continue; meshes.push(nd.getName());
    for (const p of m.listPrimitives()) { mats.add(p.getMaterial().getName()); tris += p.getIndices().getCount() / 3; const P = p.getAttribute('POSITION').getArray(); for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i + a]); mx[a] = Math.max(mx[a], P[i + a]); } } }
  const chains = info.chains.slice(); for (const c of base.secondaryChains) if (!chains.some((q) => q.root === c.root)) chains.push(c);
  const entry = {
    file: FILE, type: 'model', preload: false,
    license: v3.license.replace('undergarment, outfit', 'swimsuit'), author: v3.author.replace('tools/costume/v3.mjs', 'tools/costume/swim_b.mjs'),
    source: 'tools/costume/swim_b.mjs on assets/models/sculpt/akari_base.glb (+ tools/sculpt/assets/akari_swim_b*.mjs)',
    scale: 1, size: mx.map((v, a) => +(v - mn[a]).toFixed(3)), tris, bytes: fs.statSync(path.join(ROOT, 'assets', FILE)).size,
    clipsFrom: v3.clipsFrom, morphs: v3.morphs, morphMesh: v3.morphMesh, bones: v3.bones, hipsHeight: v3.hipsHeight,
    meshes, materials: [...mats].sort(), secondaryChains: chains, springDefaults: v3.springDefaults,
    notes: 'Aqua Float Girls original-inspired swim set. A charcoal halter and brief with gathered lavender ruffles, gold strap stars, a pink left wrist scrunchie and bare feet. Coverage checked in 39 poses.',
  };
  const out = path.join(WORK, 'manifest.fragment.json'); fs.writeFileSync(out, JSON.stringify({ char_akari_swim_b: entry }, null, 1));
  console.log(execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), out], { encoding: 'utf8' }).trim());
  const back = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')).char_akari_swim_b;
  if (!back || back.file !== FILE || back.tris !== tris) throw new Error('manifest entry not read back');
  console.log('char_akari_swim_b in manifest:', back.tris, 'tris', back.secondaryChains.length, 'chains', back.meshes.join(' '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    if (args.includes('--install-only')) { const c = await coverage(OUT); if (!c.pass) throw new Error('coverage fails on ' + OUT + ': not installed'); await install(); }
    else if (args.includes('--check-only')) { const c = await coverage(fs.existsSync(BUILT) ? BUILT : OUT); if (!c.pass) process.exit(1); }
    else { await build(); if (args.includes('--install')) await install(); }
  } catch (e) { console.error(e.stack || e.message); process.exit(1); }
}

