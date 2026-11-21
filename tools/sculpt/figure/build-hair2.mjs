#!/usr/bin/env node
// 灯里's hair 2 — LONG LOOSE HAIR (after the owner's references of 2026-11-18; replaces the twin tails of build-hair.mjs).
//   SCULPT_THREADS=2 node tools/sculpt/figure/build-hair2.mjs [--out <glb>] [--test-char] [--face]
//   -> assets/models/sculpt/akari_hair2.glb: nodes akari_hair [Hair] and akari_ribbon [Ribbon, the single gold cuff]; skinned to the base figure's 175 joints + the NEW spring chains J_Sec_HairBack_1..5 (4 joints + _end each, from
//      under the occiput to the waist) and J_Sec_HairSideL_1 / J_Sec_HairSideR_1 (3 joints + _end, in the long side locks),
//      APPENDED to the skin (every old joint keeps index, name, parent, rest pose, inverse bind; checked, the build fails
//      otherwise). Report .tmp/akari-hair2/out/build.json.
//   --test-char  compose it into the default heroine (assets/models/chars/char_akari_miko.glb) with swap-hair2.mjs ->
//                assets/models/sculpt/akari_hair2.char.glb + manifest entry char_akari_hair2 (?akari=hair2), only that id
//   --face       the same on the face sculptor's figure (assets/models/sculpt/akari_base_face.glb) -> akari_hair2.face.glb +
//                char_akari_hair2f (?akari=hair2f)
// Design: tools/sculpt/assets/akari_hair2.mjs (locks, chains, colours), akari_hair2_cap.mjs (crown, loose back panels and forehead leaves), akari_hair2_lib.mjs
// (sweeps + face-mesh probes).
// Shading: the hair ramp combines depth with painted strand flow. The game's light-following band adds the crown reflection.
// The fitted gold cuff uses the existing Ribbon material and accessory node.
import fs from 'node:fs';
import path from 'node:path';
import * as S from '../sdf.mjs';
import { loadRig, M4 } from '../rig.mjs';
import { io, ROOT, loadCharacter } from './glbio.mjs';
import { RIG_SOURCE, makeRigSource } from './make-rig.mjs';
import { writeFigureGLB } from './writer.mjs';
import { Canvas, hex, mix3 } from './paint.mjs';
import { headShape } from '../assets/akari_head.mjs';
import { crownMesh, crownNormal, fringeLeaves } from '../assets/akari_hair2_cap.mjs';
import { hairDesign, C0, COLORS, CHAINS, CUFF_Y } from '../assets/akari_hair2.mjs';
import { curve, curveAt, sweep, lensSection, sheet, join, normals, grid, V, sm, meshProbe } from '../assets/akari_hair2_lib.mjs';
import { compareSkeletonPrefix, swapHair2, entryFields, HAIR2 } from './swap-hair2.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUTGLB = path.resolve(arg('out', HAIR2));
const WORK = path.resolve(arg('work-dir', path.join(ROOT, '.tmp/akari-hair2/out')));
fs.mkdirSync(WORK, { recursive: true });
const log = (...a) => console.log(...a);
const t0 = Date.now();
const FACES = (process.env.HAIR2_FACES || 'assets/models/sculpt/akari_base.glb').split(',').map((f) => path.resolve(ROOT, f)).filter((f) => fs.existsSync(f));

// ------------------------------------------------------------------------------------------------ the skeleton + new chains
if (!fs.existsSync(RIG_SOURCE)) await makeRigSource();
const RIG2 = path.join(WORK, 'rig2.glb');
{
  const doc = await io().read(RIG_SOURCE), root = doc.getRoot(), skin = root.listSkins()[0];
  const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const par = new Map(); for (const n of root.listNodes()) for (const c of n.listChildren()) par.set(c, n);
  const W = new Map(); const wOf = (n) => { if (W.has(n)) return W.get(n); const L = M4.trs(n.getTranslation(), n.getRotation(), n.getScale()); const p = par.get(n); const w = p ? M4.mul(wOf(p), L) : L; W.set(n, w); return w; };
  const js = skin.listJoints(), ibm = skin.getInverseBindMatrices().getArray();
  const hi = js.findIndex((j) => j.getName() === 'J_Bip_C_Head');
  const B = M4.mul(wOf(js[hi]), Array.from(ibm.slice(hi * 16, hi * 16 + 16)));      // the shared bind transform
  const extra = [];
  for (const ch of CHAINS) {
    let p = byName.get(ch.parent);
    ch.pts.forEach((pt, i) => {
      const last = i === ch.pts.length - 1, name = `J_Sec_${ch.part}_${ch.n}_${last ? 'end' : String(i + 1).padStart(2, '0')}`;
      const pw = wOf(p), loc = M4.pt(M4.inv(pw), pt[0], pt[1], pt[2]);
      const n = doc.createNode(name).setTranslation(loc); p.addChild(n); par.set(n, p); byName.set(name, n);
      if (!last) { skin.addJoint(n); extra.push(...M4.mul(M4.inv(wOf(n)), B)); }
      p = n;
    });
  }
  const arr = new Float32Array(ibm.length + extra.length); arr.set(ibm); arr.set(extra, ibm.length);
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(arr).setBuffer(root.listBuffers()[0]));
  fs.writeFileSync(RIG2, await io().writeBinary(doc));
}
const rig = await loadRig(RIG2);
const JN = rig.jointNames, jx = (n) => { const i = JN.indexOf(n); if (i < 0) throw new Error('no joint ' + n); return i; };
const head = headShape(S), hf = head.f;
const nearestJoint = (re, p) => { let best = -1, bd = 1e9; JN.forEach((n, i) => { if (!re.test(n)) return; const h = rig.bone(n).head, d = Math.hypot(h[0] - p[0], h[1] - p[1], h[2] - p[2]); if (d < bd) { bd = d; best = i; } }); return best; };
const J = {
  head: jx('J_Bip_C_Head'), neck: jx('J_Bip_C_Neck'), upperChest: jx('J_Bip_C_UpperChest'), spine: jx('J_Bip_C_Spine'),
  cheekL: [nearestJoint(/^HairJoint/, [0.075, 1.37, 0.049]), nearestJoint(/^HairJoint/, [0.071, 1.324, 0.045])],
  cheekR: [nearestJoint(/^HairJoint/, [-0.074, 1.376, 0.053]), nearestJoint(/^HairJoint/, [-0.071, 1.324, 0.045])],
  back: CHAINS.filter((c) => c.part === 'HairBack').map((c) => ({ n: c.n, ids: c.pts.slice(0, -1).map((_, i) => jx(`J_Sec_HairBack_${c.n}_0${i + 1}`)), pts: c.pts })),
  sideL: [1, 2, 3].map((i) => jx(`J_Sec_HairSideL_1_0${i}`)), sideR: [1, 2, 3].map((i) => jx(`J_Sec_HairSideR_1_0${i}`)),
};
const sideChain = { 1: CHAINS.find((c) => c.part === 'HairSideL'), [-1]: CHAINS.find((c) => c.part === 'HairSideR') };

// ------------------------------------------------------------------------------------------------ probes

function march(o, d, off) {
  let p = o.slice(), t = 0;
  for (let i = 0; i < 600; i++) { const f = hf(p[0], p[1], p[2]) - off; if (f < 2e-5) break; const st = Math.max(f * 0.85, 1.5e-4); t += st; p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]; if (t > 0.6) throw new Error('probe missed the head from ' + o); }
  return p;
}
// the faces the hair must sit on: Face + Body + eye whites of every target character, head region only
const faceTris = [];
for (const f of FACES) {
  const Cf = await loadCharacter(f, { textures: false });
  for (const p of Cf.prims) {
    if (!/^(Face|Body|EyeWhite|FaceEyelash)$/.test(p.material)) continue;
    for (let t = 0; t < p.idx.length; t += 3) {
      const a = p.idx[t] * 3, b = p.idx[t + 1] * 3, c = p.idx[t + 2] * 3;
      if (Math.max(p.pos[a + 1], p.pos[b + 1], p.pos[c + 1]) < 1.29) continue;
      faceTris.push(p.pos[a], p.pos[a + 1], p.pos[a + 2], p.pos[b], p.pos[b + 1], p.pos[b + 2], p.pos[c], p.pos[c + 1], p.pos[c + 2]);
    }
  }
}
const FP = meshProbe(Float32Array.from(faceTris));
log(`  face probes on ${FACES.map((f) => path.basename(f)).join(' + ')} (${FP.count} tris)`);
const meshHit = (o, d) => { const t = FP.first(o, d, 1); if (t === null) throw new Error('mesh probe missed from ' + o); return t; };
const D2R = Math.PI / 180;
const H = {
  F: (x, y, off) => march([x, y, 0.25], [0, 0, -1], off),
  Tp: (x, z, off) => march([x, 1.8, z], [0, -1, 0], off),
  Sd: (sd, y, z, off) => march([sd * 0.3, y, z], [-sd, 0, 0], off),
  Bk: (x, y, off) => march([x, y, -0.35], [0, 0, 1], off),
  R: (az, el, off) => { const d = [Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), Math.cos(az * D2R) * Math.cos(el * D2R)]; return march(V.add(C0, V.mul(d, 0.35)), V.mul(d, -1), off); },
  // onto the face meshes (outermost of all target faces), `off` back along the ray
  Fm: (x, y, off) => { const o = [x, y, 0.3], t = meshHit(o, [0, 0, -1]); return [x, y, 0.3 - t + off]; },
  Sm: (sd, y, z, off) => { const o = [sd * 0.3, y, z], t = meshHit(o, [-sd, 0, 0]); return [sd * (0.3 - t + off), y, z]; },
  // horizontal ray toward the head's vertical axis (x 0, z 0) from azimuth az at height y
  Rm: (az, y, off) => { const d = [-Math.sin(az * D2R), 0, -Math.cos(az * D2R)], o = [-d[0] * 0.3, y, -d[2] * 0.3], t = meshHit(o, d); return V.add(o, V.mul(d, t - off)); },
};

// ------------------------------------------------------------------------------------------------ parts
const parts = [];
parts.push({ name: 'crown', group: 'cap', mat: 'Hair', node: 'akari_hair', mesh: crownMesh(),
  env: crownNormal, envK: 0.86, weights: (v, p, a) => a.tail > 0 ? mixW(W1(J.head), RULES.back(p), Math.max(a.tail,sm(1.37,1.27,p[1]))) : W1(J.head) });
for (const [i, mesh] of fringeLeaves().entries())
  parts.push({ name: 'forehead_leaf_' + i, group: 'overlay', mat: 'Hair', node: 'akari_hair', mesh,
    env: crownNormal, envK: 0.78, weights: () => [[J.head,1]] });
// ---- weights
const W1 = (j) => [[j, 1]];
const mixW = (a, b, t) => { const m = new Map(); for (const [j, w] of a) m.set(j, (m.get(j) || 0) + w * (1 - t)); for (const [j, w] of b) m.set(j, (m.get(j) || 0) + w * t); return [...m]; };
/** along a chain by height: joint k governs the span k -> k+1 (blend into k+1 over it), the last joint its whole span */
const along = (ids, ys, y) => {
  if (y >= ys[0]) return W1(ids[0]);
  for (let k = 0; k < ids.length; k++) { const a = ys[k], b = ys[k + 1]; if (k === ids.length - 1) return W1(ids[k]); if (y >= b) return mixW(W1(ids[k]), W1(ids[k + 1]), sm(a, b, y)); }
  return W1(ids[ids.length - 1]);
};
const backChains = J.back.slice().sort((a, b) => a.pts[2][0] - b.pts[2][0]);       // by x, her right .. her left
const chainX = (c, y) => { const P = c.pts; if (y >= P[0][1]) return P[0][0]; for (let i = 0; i < P.length - 1; i++) if (y >= P[i + 1][1]) return P[i][0] + (P[i + 1][0] - P[i][0]) * (P[i][1] - y) / (P[i][1] - P[i + 1][1]); return P[P.length - 1][0]; };
const RULES = {
  head: () => W1(J.head),
  // over the ears: rigid on the head, the tips 30 % on the neck (a turned head does not push them into the shoulder)
  ear: (p) => { const k = 0.3 * sm(1.37, 1.32, p[1]); return k > 0 ? [[J.head, 1 - k], [J.neck, k]] : W1(J.head); },
  // the cheek locks ride the old short side-lock chains a little (tips 30 %), so they move but never leave the cheek
  cheekL: (p) => { const k = 0.3 * sm(1.41, 1.34, p[1]); return k > 0 ? [[J.head, 1 - k], [J.cheekL[0], k * 0.6], [J.cheekL[1], k * 0.4]] : W1(J.head); },
  cheekR: (p) => { const k = 0.3 * sm(1.41, 1.34, p[1]); return k > 0 ? [[J.head, 1 - k], [J.cheekR[0], k * 0.6], [J.cheekR[1], k * 0.4]] : W1(J.head); },
  sideL: (p) => { const k = sm(1.39, 1.345, p[1]); const w = along(J.sideL, sideChain[1].pts.map((q) => q[1]), p[1]); return k >= 1 ? w : k <= 0 ? W1(J.head) : mixW(W1(J.head), w, k); },
  sideR: (p) => { const k = sm(1.39, 1.345, p[1]); const w = along(J.sideR, sideChain[-1].pts.map((q) => q[1]), p[1]); return k >= 1 ? w : k <= 0 ? W1(J.head) : mixW(W1(J.head), w, k); },
  // the long hair: by height along the back chains, blended across the two nearest chains by x; rigid on the skull above
  back: (p) => {
    const y = p[1], k = sm(1.43, 1.345, y);
    if (k <= 0) return W1(J.head);
    const xs = backChains.map((c) => chainX(c, y));
    let w;
    if (p[0] <= xs[0]) w = along(backChains[0].ids, backChains[0].pts.map((q) => q[1]), y);
    else if (p[0] >= xs[xs.length - 1]) { const c = backChains[backChains.length - 1]; w = along(c.ids, c.pts.map((q) => q[1]), y); }
    else {
      let i = 0; while (i < xs.length - 2 && p[0] > xs[i + 1]) i++;
      const t = sm(xs[i], xs[i + 1], p[0]), a = backChains[i], b = backChains[i + 1];
      w = mixW(along(a.ids, a.pts.map((q) => q[1]), y), along(b.ids, b.pts.map((q) => q[1]), y), t);
    }
    const moving = k >= 1 ? w : mixW(W1(J.head), w, k);
    // Anchor the layer touching the shoulders while the five hanging chains carry the
    // outer fall. Its roots then follow the back when the running animation dips the head.
    const lower = sm(1.24, 1.01, y);
    const anchor = sm(1.405, 1.25, y) * (0.70 - 0.16 * lower);
    const torso = mixW(W1(J.upperChest), W1(J.spine), lower);
    return mixW(moving, torso, anchor);
  },
};
// ---- locks
const radialOut = (p) => V.nrm([p[0], 0, p[2] + 0.02]);
const design = hairDesign(H);
function rollFrame(radial, tangent, fraction, side) {
  const outward = V.nrm(V.sub(radial,V.mul(tangent,V.dot(radial,tangent))));
  const angle = side * (-0.68 * sm(0.06,0.51,fraction) + 1.64 * sm(0.53,0.97,fraction));
  return V.add(V.mul(outward,Math.cos(angle)),V.mul(V.cross(tangent,outward),Math.sin(angle)));
}

for (const lk of design) {
  const c = curve(lk.pts, [lk.hw, lk.ht], { per: 14 });
  const hang = lk.up === 'hang';
  const up = hang ? (p) => { const k = sm(1.43, 1.35, p[1]); return V.nrm(V.add(V.mul(crownNormal(p), 1 - k), V.mul(radialOut(p), k))); } : (p) => crownNormal(p);
  // envelope normal: the skull's above, a rounded body-hugging cylinder below (one clean light on the whole fall)
  const env = (p) => { const k = sm(1.42, 1.34, p[1]); const hn = crownNormal(p); if (k <= 0) return hn; const r = radialOut(p); return V.nrm(V.add(V.mul(hn, 1 - k), V.mul(V.nrm([r[0], 0.12, r[2]]), k))); };
  const envK = lk.group === 'side' ? 0.48 : lk.group === 'long' ? 0.72 : 0.66;
  const frame = (p,T,t) => {
    const radial = up(p);
    return lk.group === 'side' ? rollFrame(radial,T,t,lk.weights === 'sideL' ? 1 : -1) : radial;
  };
  const mesh = sweep({ curve: c, ds: lk.ds || 0.01, minRings: 6, dens: 1.15, tip: lk.tip || 'point', root: 'cap', up: frame,
    section: (t, sc) => lensSection(lk.K || 10, Math.max(sc[0], 0.0004), Math.max(sc[1], 0.0003), { bias: lk.lean || 0, under: 0.55 }) });
  const rule = RULES[lk.weights] || RULES.head;
  parts.push({ name: lk.name, group: lk.group, layer: lk.layer || 0, mat: 'Hair', node: 'akari_hair', mesh, env, envK, weights: (v, p) => rule(p) });
}
// ---- one gold cuff on the left shoulder. The fitting is elliptical, with bevelled rims.
// It carries the very same chain blend as the compressed section inside it.
{
  const section = design.find((lock) => lock.name === 'SideL');
  const c = curve(section.pts, [], { per: 32 });
  const station = c.P.reduce((best, pt, i) => Math.abs(pt[1] - CUFF_Y) < Math.abs(c.P[best][1] - CUFF_Y) ? i : best, 0);
  const { p, T } = curveAt(c, c.cum[station]);
  const up = radialOut(p);
  const outward = rollFrame(up,T,c.cum[station]/c.L,1);
  const across = V.nrm(V.cross(T, outward));
  const direction = (u, x, z) => V.add(V.mul(across, x * Math.cos(u * Math.PI * 2)), V.mul(outward, z * Math.sin(u * Math.PI * 2)));
  const cuff = sheet({ nu: 32, nv: 12, closedU: true,
    P: (u, v) => {
      const lip = 1 + 0.11 * Math.exp(-((Math.abs(v - 0.5) - 0.40) ** 2) / 0.003);
      const centre = V.add(p, V.mul(T, (v - 0.5) * 0.017));
      return V.add(centre, direction(u, 0.0135 * lip, 0.0087 * lip));
    },
    N: (u) => V.nrm(direction(u, 1 / 0.0135, 1 / 0.0087)), th: () => 0.001 });
  // The wardrobe identifies the hair accessory by its original node and material names.
  parts.push({ name: 'gilt_cuff', group: 'clasp', kind: 'cuff', mat: 'Ribbon', node: 'akari_ribbon',
    mesh: cuff, weights: (v, p) => RULES.sideL(p) });
}

// ------------------------------------------------------------------------------------------------ normals, depth, weights
const allPos = join(parts.map((p) => p.mesh)).pos, owner = new Int32Array(allPos.length / 3);
{ let o = 0; parts.forEach((p, i) => { owner.fill(i, o, o + p.mesh.pos.length / 3); o += p.mesh.pos.length / 3; }); }
const G = grid(allPos, 0.008);
const prims = { Hair: [], Cuff: [] };
const stats = {};
for (const [pi, P] of parts.entries()) {
  const m = P.mesh, n = m.pos.length / 3, nrm = normals(m.pos, m.idx), uv = new Float32Array(n * 2), Jv = new Uint16Array(n * 4), Wv = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const p = [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]], a = m.at[v];
    let N = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    
    if (P.env) {
      let e = P.env(p);
      const side = a.side ?? 1;
      if (side < 0 && ['cap','overlay','side'].includes(P.group)) e = V.mul(e, -1);
      const k = P.envK * (side > 0 ? 1 - 0.12 * Math.abs(a.s ?? 0) : side === 0 ? 0.9 : 0.8);
      N = V.nrm(V.add(V.mul(N, 1 - k), V.mul(e, k)));
    }
    nrm[v * 3] = N[0]; nrm[v * 3 + 1] = N[1]; nrm[v * 3 + 2] = N[2];
    let occ = 0;
    G.near(p[0], p[1], p[2], 0.0075, (q) => {
      if (owner[q] === pi) return;
      const dx = allPos[q * 3] - p[0], dy = allPos[q * 3 + 1] - p[1], dz = allPos[q * 3 + 2] - p[2], d = Math.hypot(dx, dy, dz), h = dx * N[0] + dy * N[1] + dz * N[2];
      if (d < 0.0075 && h > 0.0008) occ += (1 - d / 0.0075) * Math.min(1, h / 0.003);
    });
    occ = Math.min(1, occ / 3.5);
    let d;
    if (P.mat === 'Hair') {
      let strand = 0.5;
      if (P.group === 'cap' || P.group === 'overlay') {
        strand = 0.5 + 0.32 * a.s;
        d = a.depth;
      }
      else {
        const side = a.side ?? 1, s = Math.abs(a.s ?? 0);
        d = side > 0 ? 0.02 + (P.group === 'long' ? 0.22 : 0.32) * Math.pow(s, 2.2) : side === 0 ? 0.26 : 0.5;
        // roots go into the shade under the locks around them: over the first 1.5 cm of the lock (not a fraction of it)
        if (!a.apex && a.arc != null && a.arc < 0.015) d += 0.28 * (1 - a.arc / 0.015);
        if (P.layer === 1) d += 0.08; if (P.layer === 2) d += 0.05;
        // A little drift in the painted flow follows the lock. Its crest, dark edge and
        // highlight taper together because the coordinate belongs to the swept section.
        const phase = pi * 2.39996;
        strand = 0.5 + 0.37 * (a.s || 0) + 0.07 * Math.sin(a.t * 3.8 + phase);
        const crest = Math.exp(-((a.t - (0.32 + 0.1 * Math.sin(phase))) ** 2) / 0.045);
        d += 0.075 * (1 - crest) + 0.04 * Math.cos(phase);
        if (P.group === 'side') {
          const fold = sm(0.05,0.87,(a.s || 0) * (P.name === 'SideL' ? -1 : 1));
          d += 0.17 * fold + (side < 0 ? 0.16 : 0);
        } else if (side < 0 && p[1] < 1.4) d -= 0.08;
      }
      d = Math.min(1, d + (P.group === 'cap' ? 0 : 0.12) * occ);
      uv[v * 2] = strand; uv[v * 2 + 1] = 0.03 + 0.94 * Math.max(0, d);
    } else {
      const angular = 0.5 + 0.5 * Math.cos(a.u * Math.PI * 2 - 0.8);
      uv[v * 2] = 0.04 + 0.92 * (a.face === 0 ? angular : angular * 0.46);
      uv[v * 2 + 1] = 0.03 + 0.94 * a.v;
    }
    const w = P.weights(v, p, a).filter(([, x]) => x > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4), ws = w.reduce((s2, x) => s2 + x[1], 0) || 1;
    w.forEach(([j, x], k) => { Jv[v * 4 + k] = j; Wv[v * 4 + k] = x / ws; });
  }
  const prim = { pos: m.pos, nrm, uv, idx: m.idx, J: Jv, W: Wv };
  (P.mat === 'Hair' ? prims.Hair : prims.Cuff).push(prim);
  stats[P.group] = (stats[P.group] || 0) + m.idx.length / 3;
}
const merge = (list) => { const j = join(list.map((p) => ({ pos: p.pos, idx: p.idx }))), cat = (k, T) => { const n = list.reduce((s2, p) => s2 + p[k].length, 0), o = new T(n); let q = 0; for (const p of list) { o.set(p[k], q); q += p[k].length; } return o; }; return { pos: j.pos, idx: j.idx, nrm: cat('nrm', Float32Array), uv: cat('uv', Float32Array), J: cat('J', Uint16Array), W: cat('W', Float32Array) }; };

// ------------------------------------------------------------------------------------------------ textures
function hairRamp() {
  const s = 128, c = new Canvas(s, s, hex(COLORS.mid), 1);
  const top = hex(COLORS.top), mid = hex(COLORS.mid), deep = hex(COLORS.deep);
  const glint = hex('#ffffff');
  c.each((px, py) => {
    const d = Math.max(0, Math.min(1, (py / s - 0.03) / 0.94)), u = px / s;
    const dark = Math.exp(-((u - 0.24) ** 2) / 0.0014) + 0.75 * Math.exp(-((u - 0.79) ** 2) / 0.0006);
    const shine = 0.25 * Math.exp(-((u - 0.36) ** 2) / 0.0008) + 0.13 * Math.exp(-((u - 0.63) ** 2) / 0.002);
    const depth = Math.min(1, d + 0.24 * dark);
    const base = depth < 0.52 ? mix3(top, mid, sm(0, 0.52, depth)) : mix3(mid, deep, sm(0.52, 1, depth));
    return [...mix3(base, glint, (1 - d) ** 2 * shine), 1];
  }, undefined, 'set');
  return c;
}
function ribbonRamp() {
  const s = 64, c = new Canvas(s, s, [1, 1, 1], 1);
  const metal = hex(COLORS.gold), edge = hex(COLORS.goldDark), shine = hex('#fff0ba');
  c.each((px, py) => {
    const u = px / s, v = py / s;
    const lip = Math.exp(-((Math.abs(v - 0.5) - 0.38) ** 2) / 0.0012);
    const recess = Math.exp(-((Math.abs(v - 0.50) - 0.25) ** 2) / 0.001);
    const base = mix3(edge, metal, Math.max(0, 0.14 + 0.82 * sm(0.04, 0.83, u) - 0.22 * recess));
    return [...mix3(base, shine, 0.5 * lip + 0.18 * sm(0.87, 1, u)), 1];
  }, undefined, 'set');
  return c;
}
const tex = { Hair: hairRamp(), Ribbon: ribbonRamp() };
fs.writeFileSync(path.join(WORK, 'tex_hair2.png'), tex.Hair.png()); fs.writeFileSync(path.join(WORK, 'tex_ribbon.png'), tex.Ribbon.png());
export const HAIR_BAND = { y: +(process.env.HAIR2_BAND_Y || 0.074), half: +(process.env.HAIR2_BAND_HALF || 0.009), strength: +(process.env.HAIR2_BAND_K || 0.32), teeth: 0 };
const MAT = {
  // hairBand (the game's soft light-following band, docs/api/actors-look.md "Character fixes"): y above the head centre
  // (Face base bbox centre, 1.410), half width, strength; teeth 0 = the soft band
  Hair: { name: 'Hair', extras: { shadeColor: [0.82, 0.84, 0.92], hairBand: HAIR_BAND, hairStyle: 'silver-witch' }, tex: { name: 'Hair', bytes: tex.Hair.png(), mime: 'image/png' } },
  Ribbon: { name: 'Ribbon', extras: { shadeColor: [0.78, 0.64, 0.48] }, tex: { name: 'Ribbon', bytes: tex.Ribbon.png(), mime: 'image/png' } },
};

// ------------------------------------------------------------------------------------------------ write + checks
const hairPrim = { material: MAT.Hair, ...merge(prims.Hair) };
const cuffPrim = { material: MAT.Ribbon, ...merge(prims.Cuff) };
const meshes = [{ node: 'akari_hair', prims: [hairPrim] }, { node: 'akari_ribbon', prims: [cuffPrim] }];
fs.mkdirSync(path.dirname(OUTGLB), { recursive: true });
await writeFigureGLB(RIG2, OUTGLB, meshes, {});
const sk = await compareSkeletonPrefix(RIG_SOURCE, OUTGLB);
if (!sk.ok) throw new Error('old skeleton changed: ' + JSON.stringify(sk));
const tris = { hair: hairPrim.idx.length / 3, cuff: cuffPrim.idx.length / 3 };
const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < hairPrim.pos.length; i += 3) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], hairPrim.pos[i + k]); bb[k + 3] = Math.max(bb[k + 3], hairPrim.pos[i + k]); }
// eyes: does any hair cover an iris seen from the front? (iris boxes of every target face, hair in front of them)
const irisCheck = [];
for (const f of FACES) {
  const Cf = await loadCharacter(f, { textures: false }); const ir = Cf.prims.find((p) => p.material === 'EyeIris'); if (!ir) continue;
  for (const sd of [1, -1]) {
    const mn = [9, 9, 9], mx = [-9, -9, -9]; for (let i = 0; i < ir.pos.length; i += 3) { if (Math.sign(ir.pos[i]) !== sd) continue; for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], ir.pos[i + k]); mx[k] = Math.max(mx[k], ir.pos[i + k]); } }
    const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, rx = (mx[0] - mn[0]) / 2, ry = (mx[1] - mn[1]) / 2;
    let hit = 0; const cell = new Set();
    for (let t = 0; t < hairPrim.idx.length; t += 3) { const a = hairPrim.idx[t] * 3; const x = hairPrim.pos[a], y = hairPrim.pos[a + 1], z = hairPrim.pos[a + 2]; if (z < mn[2] - 0.004) continue; const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (e < 0.8) { hit++; cell.add(Math.round(x * 500) + ',' + Math.round(y * 500)); } }
    irisCheck.push({ face: path.basename(f), side: sd > 0 ? 'L' : 'R', iris: [cx, cy, rx, ry].map((v) => +v.toFixed(4)), hairVertsOver: hit });
  }
}
const info = { file: path.relative(ROOT, OUTGLB), bytes: fs.statSync(OUTGLB).size, tris, groups: stats, locks: design.length, hairBox: bb.map((v) => +v.toFixed(4)), skeleton: sk,
  chains: CHAINS.map((c) => ({ part: c.part, n: c.n, pts: c.pts.map((p) => p.map((v) => +v.toFixed(4))) })), hairBand: HAIR_BAND, iris: irisCheck, faces: FACES.map((f) => path.relative(ROOT, f)), seconds: (Date.now() - t0) / 1000 };
fs.writeFileSync(path.join(WORK, 'build.json'), JSON.stringify(info, null, 1));
log(`akari_hair2: hair ${tris.hair} tris (akari_hair), cuff ${tris.cuff} (akari_ribbon); ${design.length} locks; groups ${JSON.stringify(stats)}`);
log(`  skeleton: ${sk.joints} old joints identical, +${sk.added.length} (${sk.added.join(' ')}); iris ${irisCheck.map((r) => r.face.slice(0, 14) + r.side + ':' + r.hairVertsOver).join(' ')}`);
log(`  hair box ${info.hairBox.join(' ')}; ${info.bytes} bytes -> ${info.file} (${info.seconds.toFixed(1)} s)`);

// ------------------------------------------------------------------------------------------------ test characters
async function testChar(id, srcFile, outRel, baseId, notes) {
  const { execFileSync } = await import('node:child_process');
  const out = path.join(ROOT, 'assets', outRel);
  const r = await swapHair2(srcFile, OUTGLB, out, { log });
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')), base = man[baseId];
  if (!base) throw new Error('no manifest entry ' + baseId);
  const doc = await io().read(out); let all = 0; const mn = [9, 9, 9], mx = [-9, -9, -9], mats = new Set(), meshes2 = [];
  for (const nd of doc.getRoot().listNodes()) { const m = nd.getMesh(); if (!m) continue; meshes2.push(nd.getName());
    for (const p of m.listPrimitives()) { mats.add(p.getMaterial().getName()); all += p.getIndices().getCount() / 3; const P = p.getAttribute('POSITION').getArray(); for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i + a]); mx[a] = Math.max(mx[a], P[i + a]); } } }
  const entry = { ...base, ...(await entryFields(base, OUTGLB)), file: outRel, preload: false, size: mx.map((v, a) => +(v - mn[a]).toFixed(3)), tris: all, bytes: r.bytes, meshes: meshes2, materials: [...mats].sort(),
    license: 'CC0 (original body, face, undergarment, outfit, hair, cuff and textures made for this project; skeleton: VRoid HairSample_Female, CC0)',
    author: 'sculpted / generated for this project (tools/sculpt/figure, tools/costume, tools/sculpt/figure/build-hair2.mjs); skeleton: pixiv Inc. (VRoid Project) CC0, hair chains added for this project',
    source: `${baseId} (${base.file}) with the long hair 2 swapped in: tools/sculpt/figure/build-hair2.mjs (tools/sculpt/assets/akari_hair2*.mjs, swap-hair2.mjs)`, notes };
  const frag = path.join(WORK, `manifest.${id}.json`); fs.writeFileSync(frag, JSON.stringify({ [id]: entry }, null, 1));
  log(execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), frag, '--replace'], { encoding: 'utf8' }).trim());
  const back = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'))[id];
  log(`  manifest read back: ${id} ${back && back.file === outRel ? 'present' : 'MISSING'} (${back?.tris} tris, ${back?.bytes} bytes, ${back?.secondaryChains?.length} chains, preload ${back?.preload})`);
}
if (args.includes('--test-char'))
  await testChar('char_akari_hair2', path.join(ROOT, 'assets/models/chars/char_akari_miko.glb'), 'models/sculpt/akari_hair2.char.glb', 'char_akari',
    'Test heroine behind ?akari=hair2: the default heroine (travelling outfit) with the long silver hair (akari_hair: cap and loose locks) and gold cuff (akari_ribbon). Old skeleton untouched; + J_Sec_HairBack_1..5 (cape) and J_Sec_HairSideL/R_1 (hair) chains appended.');
if (args.includes('--face')) {
  const src = path.join(ROOT, 'assets/models/sculpt/akari_base_face.glb');
  if (fs.existsSync(src)) await testChar('char_akari_hair2f', src, 'models/sculpt/akari_hair2.face.glb', 'char_akari_face',
    'Test heroine behind ?akari=hair2f: the face sculptor\'s figure (assets/models/sculpt/akari_base_face.glb, undergarment) with the long silver hair and gold cuff. Test only.');
  else log('  --face: no akari_base_face.glb yet');
}
