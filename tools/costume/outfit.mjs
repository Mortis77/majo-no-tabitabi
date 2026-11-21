// Garment pieces built on a loaded character (see garment.mjs). All geometry and textures are original and procedural.
import { qmul, qinv, qrot, qFromUnit, poseFK, add, sub, mul, dot, cross, len, norm, lerp, lerp3, clamp01, smooth, fbm, vnoise, rotAxis, bodyProfile, sampleProfile, nearestWeights, clearance,
  W1, wmix, wsum, grid, strip, loft, tube, ellipsoid, fixWinding, merge, Wardrobe, Canvas } from './garment.mjs';

export const scaleOf = (C) => C.M.hips[1] / 0.887;
const TAU = Math.PI * 2;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const shadeOf = (c, f = 0.72) => [c[0] * f * 0.92, c[1] * f * 0.95, Math.min(255, c[2] * f * 1.08 + 10)]; // cool shadow tint
const grain = (p, amt) => (vnoise(p[0] * 520, p[1] * 520, p[2] * 520) - 0.5) * amt + (vnoise(p[0] * 140 + 7, p[1] * 140, p[2] * 140) - 0.5) * amt * 0.6;
const BODYB = /^J_Bip_C_(Hips|Spine|Chest|UpperChest)$|_UpperLeg$|_LowerLeg$/;

/** pattern mask 0..1 at metric coords (a = around/horizontal, b = vertical) */
export function pattern(pt, a, b) {
  if (!pt) return 0; const s = pt.scale || 0.05;
  switch (pt.type) {
    case 'stripe': return (((a / s) % 1) + 1) % 1 < (pt.duty || 0.25) ? 1 : 0;
    case 'check': return ((Math.floor(a / s) + Math.floor(b / s)) & 1) ? 1 : 0;
    case 'kasuri': { const u = ((a / s) % 1 + 1) % 1, v = ((b / s) % 1 + 1) % 1; const m = (Math.abs(u - 0.5) < 0.12 && Math.abs(v - 0.5) < 0.3) || (Math.abs(v - 0.5) < 0.12 && Math.abs(u - 0.5) < 0.3); return m && vnoise(a * 300, b * 300) > 0.35 ? 1 : 0; }
    case 'dots': { const u = ((a / s) % 1 + 1) % 1 - 0.5, v = ((b / s) % 1 + 1) % 1 - 0.5; return Math.hypot(u, v) < 0.18 ? 1 : 0; }
    case 'asanoha': { const u = ((a / s) % 1 + 1) % 1, v = ((b / s) % 1 + 1) % 1; const d = Math.min(Math.abs(u - v), Math.abs(u + v - 1), Math.abs(u - 0.5), Math.abs(v - 0.5)); return d < 0.03 ? 1 : 0; }
    case 'waves': { const u = a / s, v = b / s; const r = Math.hypot(((u % 1) + 1) % 1 - 0.5, (((v + (Math.floor(u) & 1) * 0.5) % 1) + 1) % 1) ; return Math.abs((r * 3) % 1 - 0.5) < 0.12 ? 1 : 0; }
    default: return 0;
  }
}
/** fabric colour: base + folds + grain + optional pattern */
export function fabric(c, p, { col, shade, pat, folds = 0.4, g = 7, a = 0, b = 0 } = {}) {
  const sh = shade || shadeOf(col);
  let base = col; if (pat) base = mixc(col, pat.col, pattern(pat, a, b) * (pat.alpha ?? 1));
  const f = fbm(p[0] * 7 + 3, p[1] * 3.5, p[2] * 7) ; const t = smooth(0.52, 0.86, f) * folds;
  const o = mixc(base, mixc(sh, mul(base, 0.55), 0.25), t); const n = grain(p, g);
  return [o[0] + n, o[1] + n, o[2] + n];
}

// ===================================================================== shells
export function buildShellsR1(wd, R, cvA) {
  const C = wd.C, M = C.M, k = scaleOf(C), b = C.body, S = R.shells; const { P, N, UV, I, nv, domBip } = b;
  const waistCut = lerp(M.hips[1], M.spine[1], 0.6);
  const neckCut = M.neck[1] - (S.neckDrop ?? 0.012) * k;
  const ankleCut = M.footL[1] + 0.045 * k;
  const wristX = Math.abs(M.handL[0]) - 0.004 * k, elbowX = Math.abs(M.laL[0]);
  const armTo = S.arm?.to || 'wrist'; const armLim = !S.arm ? -1 : armTo === 'elbow' ? elbowX + 0.035 * k : armTo === 'upper' ? Math.abs(M.uaL[0]) + 0.09 * k : wristX;
  const reg = new Array(nv);
  for (let i = 0; i < nv; i++) {
    const bn = domBip[i].replace(/^J_Bip_[LRC]_/, ''); const y = P[i * 3 + 1], ax = Math.abs(P[i * 3]); let r = 'skin';
    if (bn === 'Neck') r = y < neckCut ? 'torso' : 'skin';
    else if (bn === 'Hips') r = y > waistCut ? 'torso' : 'leg';
    else if (/^(Spine|Chest|UpperChest|Shoulder)$/.test(bn)) r = 'torso';
    else if (/^(UpperArm|LowerArm)$/.test(bn)) r = ax < armLim ? 'arm' : 'skin';
    else if (bn === 'UpperLeg') r = 'leg';
    else if (bn === 'LowerLeg') r = y < ankleCut ? 'foot' : (S.leg?.skinBelow && y < S.leg.skinBelow * k ? 'skin' : 'leg');
    else if (/^(Foot|ToeBase)$/.test(bn)) r = 'foot';
    if (r !== 'skin' && !S[r]) r = 'skin';
    reg[i] = r;
  }
  const keep = [], byReg = {};
  for (let t = 0; t < I.length; t += 3) {
    const rs = [reg[I[t]], reg[I[t + 1]], reg[I[t + 2]]]; const cnt = {}; rs.forEach((r) => (cnt[r] = (cnt[r] || 0) + 1));
    let best = rs[0]; for (const r of rs) if (cnt[r] > cnt[best]) best = r;
    if (best === 'skin') keep.push(I[t], I[t + 1], I[t + 2]); else (byReg[best] ||= []).push(I[t], I[t + 1], I[t + 2]);
  }
  b.prim.setIndices(C.doc.createAccessor().setType('SCALAR').setArray(nv < 65536 ? new Uint16Array(keep) : new Uint32Array(keep)).setBuffer(wd.buffer));
  const out = {};
  for (const [r, tri] of Object.entries(byReg)) {
    const sp = S[r]; const off = (sp.off ?? 0.006) * k; const map = new Map(); const src = [];
    const idx = tri.map((i) => { if (!map.has(i)) { map.set(i, src.length); src.push(i); } return map.get(i); });
    let pos = src.map((i) => add([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], mul([N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], off * (sp.offFn ? sp.offFn([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], M, k) : 1))));
    if (sp.smooth) pos = smoothShell(pos, idx, src, P, N, sp.smooth, off * 0.8);
    const uv = src.map((i) => [UV[i * 2], UV[i * 2 + 1]]);
    const weights = src.map((i) => { const m = new Map(); for (let c = 0; c < 4; c++) { const w = b.Wt[i * 4 + c]; if (w > 0) m.set(b.J[i * 4 + c], (m.get(b.J[i * 4 + c]) || 0) + w); } return m; });
    const geo = { pos, uv, idx }; out[r] = { geo, off, src };
    wd.piece('shell_' + r, geo, weights, sp.mat);
    const soleY = M.bodyMinY + 0.012 * k;
    cvA.tris(uv, idx, pos.map((p) => [...p]), (p) => {
      if (sp.paint) return sp.paint(p, M, k);
      if (r === 'foot' && sp.sole && p[1] < soleY) return mixc(sp.sole, sp.col, 0.1);
      const th = Math.atan2(p[0], p[2]); return fabric(null, p, { col: sp.col, shade: sp.shade, pat: sp.pat, folds: sp.folds ?? 0.4, a: th * 0.15, b: p[1] });
    });
  }
  out.cuts = { waistCut, neckCut, ankleCut, armLim };
  return out;
}
function smoothShell(pos, idx, src, P, N, iters, minOff) {
  const key = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]].map((v) => Math.round(v * 1e4)).join(',');
  const wid = new Map(); const w = src.map((i) => { const kk = key(i); if (!wid.has(kk)) wid.set(kk, wid.size); return wid.get(kk); });
  const n = wid.size; const nb = Array.from({ length: n }, () => new Set()); const ec = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = w[idx[t + e]], c = w[idx[t + (e + 1) % 3]]; if (a === c) continue; nb[a].add(c); nb[c].add(a); const kk = a < c ? a + '_' + c : c + '_' + a; ec.set(kk, (ec.get(kk) || 0) + 1); }
  const bnd = new Uint8Array(n); for (const [kk, c] of ec) if (c === 1) { const [a, c2] = kk.split('_').map(Number); bnd[a] = 1; bnd[c2] = 1; }
  let q = new Array(n); const rep = new Array(n); w.forEach((id, i) => { q[id] = pos[i]; rep[id] = src[i]; });
  for (let it = 0; it < iters; it++) { const q2 = q.map((p, i) => { if (bnd[i] || !nb[i].size) return p; let s = [0, 0, 0]; for (const j of nb[i]) s = add(s, q[j]); return lerp3(p, mul(s, 1 / nb[i].size), 0.5); }); q = q2; }
  q = q.map((p, id) => { const i = rep[id]; const bp = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], bn = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]; const d = dot(sub(p, bp), bn); return d < minOff ? add(p, mul(bn, minOff - d)) : p; });
  return w.map((id) => q[id]);
}

// ===================================================================== ray helper (collars on the torso shell)
export function nearestOnMesh(geo, p) {
  const { pos, idx } = geo; let best = 1e9, bc = null, bn = null;
  for (let t = 0; t < idx.length; t += 3) { const a = pos[idx[t]], b = pos[idx[t + 1]], c = pos[idx[t + 2]]; if (Math.abs(a[1] - p[1]) > 0.06 && Math.abs(b[1] - p[1]) > 0.06) continue;
    const cp = closestTri(p, a, b, c); const d = len(sub(cp, p)); if (d < best) { best = d; bc = cp; bn = cross(sub(b, a), sub(c, a)); } }
  if (!bc) return null; return { cp: bc, n: norm(bn) };
}
function closestTri(p, a, b, c) { const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a); const d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b); const d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b; const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c); const d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c; const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))); const den = 1 / (va + vb + vc); return add(add(a, mul(ab, vb * den)), mul(ac, vc * den)); }
export function rayNear(geo, o, d) {
  let best = Infinity; const { pos, idx } = geo;
  for (let t = 0; t < idx.length; t += 3) { const a = pos[idx[t]], b = pos[idx[t + 1]], c = pos[idx[t + 2]]; const e1 = sub(b, a), e2 = sub(c, a); const h = cross(d, e2); const det = dot(e1, h); if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det, s = sub(o, a), u = f * dot(s, h); if (u < 0 || u > 1) continue; const qv = cross(s, e1), v = f * dot(d, qv); if (v < 0 || u + v > 1) continue; const tt = f * dot(e2, qv); if (tt > 0 && tt < best) best = tt; }
  return best === Infinity ? -1 : best;
}
export function rayHit(geo, o, d, maxT = Infinity) {
  let best = -1; const { pos, idx } = geo;
  for (let t = 0; t < idx.length; t += 3) {
    const a = pos[idx[t]], b = pos[idx[t + 1]], c = pos[idx[t + 2]]; const e1 = sub(b, a), e2 = sub(c, a); const h = cross(d, e2); const det = dot(e1, h); if (Math.abs(det) < 1e-10) continue;
    const f = 1 / det, s = sub(o, a), u = f * dot(s, h); if (u < 0 || u > 1) continue; const qv = cross(s, e1), v = f * dot(d, qv); if (v < 0 || u + v > 1) continue; const tt = f * dot(e2, qv); if (tt > 0 && tt < maxT && tt > best) best = tt;
  }
  return best;
}

// ===================================================================== skirt / hakama / robe / coat-skirt / apron
/** S: { part, top (abs y), hem (abs y) | hemFn(theta), ease, flare:[x,z], curve, pleats, depth, chains, legFollow, arc:[t0,t1], mat, paint(lu,lv,meta), rect, foldBack, parent:'legs'|'hips', clear } */
/** r2 mip gutter: the geometry uses the rect inset by `ins`; the painter runs over the whole rect with local coords extended past
 *  0..1, so the gutter holds the same cloth (no neighbouring atlas colour bleeds in at distance / grazing angles). */
const gutter = (r, ins, lu, lv) => { const W = r[2] - r[0], Hh = r[3] - r[1]; return [(lu * W - ins) / (W - 2 * ins), (lv * Hh - ins) / (Hh - 2 * ins)]; };
export function buildSkirt(wd, S) {
  const C = wd.C, M = C.M, k = scaleOf(C); const zc = M.hips[2];
  const full = !S.arc; const t0 = full ? Math.PI : S.arc[0], t1 = full ? Math.PI + TAU : S.arc[1]; // r2: UV seam at centre back (under the bow), front centre mid-atlas = no mip bleed
  const span = t1 - t0; const cols = Math.max(12, Math.round((S.pleats ? S.pleats * 6 : 72) * span / TAU)) + 1;
  const hipY0 = Math.min(S.top - (S.hipDrop ?? 0.05) * k, M.hips[1] - 0.05 * k);
  const hemAt = (th) => (S.hemFn ? S.hemFn(th) : S.hem);
  const filt = (bn) => BODYB.test(bn); const xcap = Infinity;
  if (S.over) { S.parent = S.over.parentMode; S.legFollow = S.over.legFollow; }
  const profCache = new Map(); const prof = (y) => { const kk = Math.round(y * 200); if (!profCache.has(kk)) { const base = bodyProfile(C, kk / 200, 72, { zc, filter: filt, band: 0.03 }); profCache.set(kk, wd.stack.profile(kk / 200, 72, { zc, band: 0.025, xcap, base })); } return profCache.get(kk); };
  const ease = Math.max(S.ease, 0.016) * k; const RhX = S.flare[0] * k, RhZ = S.flare[1] * k; const sep = (S.over ? 0.012 : 0.006) * k;
  const ellR = (th, a, b) => 1 / Math.sqrt((Math.sin(th) / a) ** 2 + (Math.cos(th) / b) ** 2);
  const rHip = (th) => sampleProfile(prof(hipY0), th) + ease;
  const nTop = S.top - hipY0 > 0.02 ? 3 : 1; const nS = S.rings || 13;
  const rows = [];
  for (let i = 0; i < nTop; i++) rows.push({ kind: 'top', y: lerp(S.top, hipY0, i / nTop) });
  for (let i = 0; i <= nS; i++) rows.push({ kind: 's', s: Math.pow(i / nS, 0.9) });
  if (S.foldBack !== false) rows.push({ kind: 'fold', s: 1 });
  const pleatW = (th) => { if (!S.pleats) return 0; const sg = Math.sin(th) >= 0 ? 1 : -1; let ph = ((sg * th) / TAU) * S.pleats + 0.78; ph = ((ph % 1) + 1) % 1; return ph < 0.78 ? ph / 0.78 : (1 - ph) / 0.22; };
  const surf = (th, row) => {
    let y, r;
    if (row.kind === 'top') { y = row.y; const tt = (S.top - y) / (S.top - hipY0 + 1e-6); r = sampleProfile(prof(y), th) + ease * (0.7 + 0.3 * tt); }
    else { const s = row.s; const hy = hemAt(th); y = lerp(hipY0, hy, s); const env = lerp(rHip(th), Math.max(rHip(th), ellR(th, RhX, RhZ)), Math.pow(s, S.curve || 1)); const yb = Math.max(y, M.bodyMinY + 0.02); r = Math.max(sampleProfile(prof(yb), th) + ease, env); r += (S.depth || 0) * k * pleatW(th) * (0.35 + 0.65 * smooth(0, 0.3, s));
      if (S.over) { const o = S.over; const s2 = (o.hipY0 - y) / (o.hipY0 - o.hemAt(th)); if (s2 >= 0 && s2 <= 1) { const q = o.surf(th, { kind: 's', s: s2 }); r = Math.max(r, Math.hypot(q[0], q[2] - zc) + sep + (o.depth || 0) * k * 0.5); } else if (s2 < 0) r = Math.max(r, o.topR(th) + sep); } }
    if (row.kind === 'fold') { y += 0.028 * k; r -= 0.006 * k; }
    let fl = 0; const floorY = 0.008; if (y < floorY) { fl = floorY - y; y = floorY; r += fl * 0.9; }
    return [Math.sin(th) * r, y, zc + Math.cos(th) * r];
  };
  const thOf = (j) => t0 + span * (j / (cols - 1));
  const geo = grid(rows.length, cols, (i, j) => ({ p: surf(thOf(j), rows[i]), u: j / (cols - 1), v: i / (rows.length - 1) }));
  // chains
  const nCh = S.chains || 0; const chains = [];
  const params = [0, 0.4, 0.75, 1];
  for (let c = 0; c < nCh; c++) {
    const th = full ? (c + 0.5) / nCh * TAU : t0 + span * (c + 0.5) / nCh; const sn = Math.sin(th);
    const parent = S.parent === 'hips' ? 'J_Bip_C_Hips' : sn > 0 ? 'J_Bip_L_UpperLeg' : 'J_Bip_R_UpperLeg';
    const pts = params.map((s) => { const p = surf(th, { kind: 's', s }); return [p[0] * 0.9, p[1], zc + (p[2] - zc) * 0.9]; });
    const ids = wd.chain(S.part, c + 1, parent, pts, { kind: 'skirt', theta: +th.toFixed(3) });
    chains.push({ th, ids, leg: parent.includes('Leg') ? (sn > 0 ? 'J_Bip_L_LowerLeg' : 'J_Bip_R_LowerLeg') : null });
  }
  // weights: a smooth field. Body weights are sampled ONCE per column on the hip ring (no knee-height jumps), smoothed around,
  // then blended continuously into the chain weights down the height; outer layers copy the layer under them.
  const smoothRing = (arr, n) => { let a = arr; for (let it = 0; it < n; it++) a = a.map((w, j) => { const L = a[full ? (j + cols - 2) % (cols - 1) : Math.max(0, j - 1)], Rr = a[full ? (j + 1) % (cols - 1) : Math.min(cols - 1, j + 1)]; return wsum([[L, 0.25], [w, 0.5], [Rr, 0.25]]); }); return a; };
  const hipW = smoothRing(Array.from({ length: cols }, (_, j) => nearestWeights(C, surf(thOf(j), { kind: 's', s: 0 }), { filter: filt, k: 8 })), 3);
  const topW = rows.map((row) => row.kind === 'top' ? smoothRing(Array.from({ length: cols }, (_, j) => nearestWeights(C, surf(thOf(j), row), { filter: filt, k: 8 })), 3) : null);
  const cw = (ch, s) => { let w = Wardrobe.along(ch.ids, params, s); if (ch.leg && S.legFollow) { const fr = smooth(0.3, 0.9, Math.abs(Math.cos(ch.th))) * (Math.cos(ch.th) > 0 ? 1 : 0.8); const lf = S.legFollow + (0.92 - S.legFollow) * fr; w = wmix(w, W1(C.ji(ch.leg)), lf * smooth(0.3, 1, s)); } return w; };
  const chainW = (th, s) => { let a, bI, f;
    if (full) { const x = ((((th / TAU) * nCh - 0.5) % nCh) + nCh) % nCh; a = Math.floor(x) % nCh; bI = (a + 1) % nCh; f = x - Math.floor(x); }
    else { const x = clamp01((th - t0) / span) * nCh - 0.5; a = Math.max(0, Math.min(nCh - 1, Math.floor(x))); bI = Math.min(nCh - 1, a + 1); f = clamp01(x - a); }
    f = f * f * (3 - 2 * f); return wmix(cw(chains[a], s), cw(chains[bI], s), f); };
  const weights = geo.pos.map((p, vi) => {
    const i = Math.floor(vi / cols), j = vi % cols; const row = rows[i]; const th = thOf(j);
    // upper cloth already follows the thighs (front + back), L/R blended smoothly across the centre lines
    const sL = clamp01(0.5 + Math.sin(th) / 0.3); const legW = wmix(W1(C.ji('J_Bip_R_UpperLeg')), W1(C.ji('J_Bip_L_UpperLeg')), sL * sL * (3 - 2 * sL));
    const hw = row.kind === 's' && S.parent !== 'hips' ? wmix(hipW[j], legW, (0.55 + 0.35 * smooth(0.3, 0.9, Math.abs(Math.cos(th))) * (Math.cos(th) > 0 ? 1 : 0.8)) * Math.abs(Math.cos(th)) * smooth(0, 0.3, row.s)) : hipW[j];
    let w = row.kind === 'top' ? topW[i][j] : !nCh ? hw : wmix(hw, chainW(th, row.s), smooth(0.05, 0.4, row.s));
    if (S.over) { const iw = S.over.weightAt(th, p[1]); if (iw) w = wmix(iw, w, row.kind === 'top' ? 0 : 0.12 * smooth(0.5, 1, row.s)); }
    return w;
  });
  // uv into rect + paint
  const ins = Math.max(3, Math.round(wd.cvB.w / 80)) / wd.cvB.w; const [u0, v0, u1, v1] = [S.rect[0] + ins, S.rect[1] + ins, S.rect[2] - ins, S.rect[3] - ins]; geo.uv = geo.uv.map(([u, v]) => [lerp(u0, u1, u), lerp(v0, v1, v)]);
  wd.cvB.rect(S.rect, (lu, lv) => S.paint(...gutter(S.rect, ins, lu, lv), { pleatW, t0, span, rows, topV: (nTop - 0.5) / (rows.length - 1), hemV: (rows.length - 2) / (rows.length - 1) }));
  const hems = []; for (let j = 0; j < cols; j++) { hems.push(j, (rows.length - 1) * cols + j); }
  if (!full) for (let i = 0; i < rows.length; i++) hems.push(i * cols, i * cols + cols - 1);
  wd.piece(S.part, geo, weights, S.mat, { layer: S.layer ?? 2, hems });
  // front-edge trims for open garments
  const ecols = !full && S.edge ? [0, cols - 1] : S.seam ? [Math.round((((S.seam.theta - t0) % TAU + TAU) % TAU) / span * (cols - 1))] : []; if (S.seam && !S.edge) S.edge = S.seam;
  for (const jcol of ecols) {
    const pts = rows.filter((r) => r.kind !== 'fold').map((r, i) => geo.pos[i * cols + jcol]); const ws = rows.filter((r) => r.kind !== 'fold').map((r, i) => weights[i * cols + jcol]);
    const th = thOf(jcol); const nr = [Math.sin(th), 0, Math.cos(th)];
    const acr = pts.map((p, i) => norm(cross(nr, sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]))));
    const g = strip(pts.map((p) => add(p, mul(nr, 0.0065 * k + (S.depth || 0) * k * 0.4))), pts.map(() => nr), acr, S.edge.w * k, 0.002 * k);
    swatchUV(wd, g, S.edge.col); wd.piece(S.part + '_edge', g, g.pos.map((_, vi) => ws[Math.min(ws.length - 1, Math.floor(vi / 4))]), 'cloth_trim', { layer: (S.layer ?? 2) + 0.5 });
  }
  const res = { surf, rows, cols, hipY0, prof, chains, hemAt, depth: S.depth || 0, topR: (th) => sampleProfile(prof(S.top), th) + ease, parentMode: S.parent, legFollow: S.legFollow, layer: S.layer ?? 2 };
  res.weightAt = (th, y) => {
    let tt = th; if (full) tt = ((th - t0) % TAU + TAU) % TAU + t0; else { tt = ((th - t0) % TAU + TAU) % TAU + t0; if (tt > t1) return null; }
    const jf = (tt - t0) / span * (cols - 1); const j = Math.max(0, Math.min(cols - 1, Math.round(jf)));
    const sr = rows.map((r, i) => i).filter((i) => rows[i].kind !== 'fold');
    for (let q = 0; q < sr.length - 1; q++) { const ya = geo.pos[sr[q] * cols + j][1], yb = geo.pos[sr[q + 1] * cols + j][1]; if (y <= ya + 1e-6 && y >= yb - 1e-6) return wmix(weights[sr[q] * cols + j], weights[sr[q + 1] * cols + j], clamp01((ya - y) / (ya - yb || 1))); }
    if (y > geo.pos[j][1]) return weights[j];
    return null; };
  return res;
}

// ===================================================================== sleeves
/** S: { style:'wide'|'bell'|'short'|'rolled'|'tied', end (0..1 shoulder->wrist), depth (m below arm axis), ease, back, round, open, mat, rect, paint, cord:{col}, tsuyu, chains } */
/** Arms-down rest for a sleeve chain: local rest rotation R of the chain root so that in the idle pose the bag hangs straight
 *  down (slightly back) and clears a hip cylinder. World(root) = Q_parent_idle * R. Bind geometry is unchanged (IBMs from the T-pose). */
export function hangRest(C, pose, parent, pts, k) {
  const { Q, P } = poseFK(C, pose, parent); const W0 = C.W.get(parent);
  const j01 = add(P, qrot(Q, sub(pts[0], W0))); const d0 = norm(sub(pts[pts.length - 1], pts[0])); const Lc = len(sub(pts[pts.length - 1], pts[0]));
  const cur = qrot(Q, d0); let tgt = norm([0, -1, -0.12]);
  const hp = poseFK(C, pose, 'J_Bip_C_Hips').P; const Rc = 0.235 * k; let tail = add(j01, mul(tgt, Lc));
  const dx = tail[0] - hp[0], dz = tail[2] - hp[2], d = Math.hypot(dx, dz); if (d < Rc) { tail = [hp[0] + dx / (d || 1) * Rc, tail[1], hp[2] + dz / (d || 1) * Rc]; tgt = norm(sub(tail, j01)); }
  const Rmin = qFromUnit(cur, tgt); return qmul(qinv(Q), qmul(Rmin, Q));
}
export function buildSleeve(wd, side, S) {
  const C = wd.C, M = C.M, k = scaleOf(C), sg = side === 'L' ? 1 : -1;
  const ua = M['ua' + side], hand = M['hand' + side], la = M['la' + side];
  const xa = Math.abs(ua[0]) + (S.xa ?? 0.012) * k, xe = lerp(Math.abs(ua[0]), Math.abs(hand[0]), S.end);
  const axis = (x) => { const t = (x - Math.abs(ua[0])) / (Math.abs(hand[0]) - Math.abs(ua[0])); return [sg * x, lerp(ua[1], hand[1], t), lerp(ua[2], hand[2], t)]; };
  const armFilt = (bn) => bn === `J_Bip_${side}_UpperArm` || bn === `J_Bip_${side}_LowerArm` || bn === `J_Bip_${side}_Shoulder`;
  const armOnly = (bn) => bn === `J_Bip_${side}_UpperArm` || bn === `J_Bip_${side}_LowerArm`;
  const armR = (x) => { x = Math.max(x, Math.abs(ua[0]) + 0.03 * k); const c = axis(x); let r = 0.03 * k; const { P, nv, domBip } = C.body; for (let i = 0; i < nv; i++) { if (!armOnly(domBip[i])) continue; if (Math.abs(Math.abs(P[i * 3]) - x) > 0.014 * k) continue; r = Math.max(r, Math.hypot(P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2])); } return r; };
  const nA = S.rings || 14; const K = S.K || 28; const as = Array.from({ length: nA + 1 }, (_, i) => { const t = i / nA; return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }).map((t) => t);
  const rt0 = (S.ease || 0.022) * k;
  const rts = as.map((a) => { const x = lerp(xa, xe, a); let r = armR(Math.min(x, Math.abs(hand[0]) - 0.02 * k)) + rt0; if (S.style === 'bell') r *= 1 + (S.bell || 1.2) * a * a; if (S.style === 'rolled' || S.style === 'tied') r *= 1 + 0.25 * Math.sin(Math.PI * a); return r; });
  const rtMax = Math.max(...rts);
  const Dm = (S.depth || 0) * k; const bag = Dm > rtMax * 1.4;
  const Dof = (a, rt) => { if (!bag) return S.style === 'bell' ? rt * (S.drop || 1.5) : rt; let d = lerp(rt, Dm, smooth(0.04, 0.26, a)); const a0 = 0.7; if (a > a0) { const u = Math.min(1, (a - a0) / (1 - a0)); d -= (S.round ?? 0.5) * (Dm - rt) * (1 - Math.sqrt(1 - u * u)); } return d; };
  const foldA = (S.folds ?? (bag ? 0.011 : 0)) * k; const foldN = S.foldN ?? 2.3;
  const wb = S.wb ?? 0.55;
  const ringPt = (a, i, kk) => { const x = lerp(xa, xe, a); const c = axis(x); const rt = rts[i]; const D = Dof(a, rt); const ph = -Math.PI / 2 + (TAU * kk) / K; const s = Math.sin(ph), co = Math.cos(ph);
    let y, z; if (s >= 0) { y = rt * s; z = rt * co; } else { const q = -s; y = -D * q; z = rt * co * lerp(1, wb, Math.pow(q, 1.4)) - (S.back || 0.03) * k * q * (D / (Dm || D));
      if (foldA) { const fq = Math.pow(q, 1.3) * smooth(0.08, 0.3, a); z += foldA * fq * Math.sin(TAU * (a * foldN + 0.15)); y += foldA * 0.35 * fq * Math.cos(TAU * (a * foldN + 0.15)); } }
    return [c[0], c[1] + y, c[2] + z]; };
  // rings + one turned-hem ring folded inside the opening (thickness at the open edge)
  const rowsA = as.map((a, i) => ({ a, i })); rowsA.push({ a: 1, i: as.length - 1, fold: true });
  const geo = grid(rowsA.length, K + 1, (ii, j) => { const R0 = rowsA[ii]; let p = ringPt(R0.a, R0.i, j); if (R0.fold) { const c = axis(xe); p = add(lerp3(p, [p[0], c[1], c[2]], 0.05), [-sg * 0.012 * k, 0.0, 0]); } return { p, u: j / K, v: R0.fold ? 0.985 : as[ii] }; });
  const Kc = K + 1; const last = as.length - 1;
  // end cap closing the bag below the opening
  const capEdge = []; const cy = axis(xe)[1]; const openY = cy - rts[last] * (S.open ?? 0.8);
  if (S.style !== 'bell' && S.style !== 'tied' && S.style !== 'rolled' && S.style !== 'short') {
    for (let kk = 0; kk < K / 2 - 1; kk++) { const a = last * Kc + kk, b = last * Kc + kk + 1, c = last * Kc + (K - kk), d = last * Kc + (K - kk - 1); if (geo.pos[b][1] > openY) { capEdge.push(a, c); break; } geo.idx.push(a, b, c, b, d, c); capEdge.length = 0; capEdge.push(b, d); }
  }
  fixWinding(geo, axis((xa + xe) / 2).map((v, i) => (i === 1 ? v - (bag ? Dm * 0.3 : 0) : v)));
  // weights
  const noHand = (bn) => armFilt(bn) || bn === 'J_Bip_C_UpperChest';
  const ringW = as.map((a) => { const x = Math.min(lerp(xa, xe, a), Math.abs(hand[0]) - 0.03 * k); const w = nearestWeights(C, axis(x), { filter: noHand, k: 6 }); return a < 0.06 ? wmix(w, W1(C.ji('J_Bip_' + side + '_Shoulder')), 0.25) : w; });
  let chains = null; const params = [0, 0.45, 0.8, 1];
  if (bag && S.chains !== false) {
    chains = [0.42, 0.86].map((af, ci) => { const x = lerp(xa, xe, af); const c = axis(x); const i = Math.round(af * last); const rt = rts[i]; const D = Dof(af, rt); const y0 = c[1] - rt * 0.7; const zz = c[2] - (S.back || 0.03) * k * 0.6;
      const pts = params.map((q) => [c[0], lerp(y0, c[1] - D, q), zz - (S.back || 0.03) * k * q * 0.4]);
      const parent = x < Math.abs(la[0]) ? `J_Bip_${side}_UpperArm` : `J_Bip_${side}_LowerArm`;
      const restQ = wd.idlePose ? hangRest(C, wd.idlePose, parent, pts, k) : null;
      return { x, y0, D, ids: wd.chain('Sleeve' + side, ci + 1, parent, pts, { kind: 'sleeve', restQ }) }; });
  }
  // round 2: the part of the sleeve that hugs the arm is skinned like the under-sleeve it lies on (no poke-through at the armhole)
  wd.pushOut(geo.pos, 5.8, 0.005 * k, { skip: (n) => !/^shell_/.test(n), iters: 2 });
  const wArm = wd.weightsBelow(geo.pos, 5.8, { skip: (n) => !/^shell_(top|lip_top)$/.test(n), reach: 0.06 });
  const ringWv = geo.pos.map((p, vi) => { const i = Math.min(last, Math.floor(vi / Kc)); const c = axis(lerp(xa, xe, as[i])); const D = Math.max(0.02 * k, Dof(as[i], rts[i]));
    const fb = (1 - smooth(0.05, 0.45, (c[1] - p[1]) / D)) * (1 - smooth(0.5, 0.95, as[i])); return wArm[vi] && fb > 0 ? wmix(ringW[i], wArm[vi], fb) : ringW[i]; });
  const weights = geo.pos.map((p, vi) => { const i = Math.min(last, Math.floor(vi / Kc)); let w = ringWv[vi]; if (!chains) return w;
    const x = Math.abs(p[0]); const f = clamp01((x - chains[0].x) / (chains[1].x - chains[0].x));
    const cw = (ch) => Wardrobe.along(ch.ids, params, clamp01((ch.y0 - p[1]) / (ch.D - (axis(x)[1] - ch.y0) * 0)) );
    const y0 = lerp(chains[0].y0, chains[1].y0, f), D = lerp(chains[0].D, chains[1].D, f); const c = axis(x); const q = (y0 - p[1]) / Math.max(0.02, (c[1] - D) * -1 + y0);
    const chw = wmix(Wardrobe.along(chains[0].ids, params, clamp01(q)), Wardrobe.along(chains[1].ids, params, clamp01(q)), f);
    return wmix(w, chw, smooth(-0.05, 0.35, q)); });
  const ins = Math.max(3, Math.round(wd.cvB.w / 80)) / wd.cvB.w; const [u0, v0, u1, v1] = [S.rect[0] + ins, S.rect[1] + ins, S.rect[2] - ins, S.rect[3] - ins]; geo.uv = geo.uv.map(([u, v]) => [lerp(u0, u1, u), lerp(v0, v1, v)]);
  if (side === 'L') wd.cvB.rect(S.rect, (lu, lv) => S.paint(...gutter(S.rect, ins, lu, lv), { K, L: xe - xa, Dm: bag ? Dm : rtMax, foldN, folds: foldA > 0 }));
  const hems = [...capEdge]; for (let j = 0; j <= K; j++) hems.push(j, (rowsA.length - 1) * Kc + j);
  wd.piece('sleeve_' + side, geo, weights, S.mat, { layer: 5.8, hems, stack: false });
  // cord round the sleeve end + tsuyu tails
  if (S.cord) {
    const ring = Array.from({ length: K }, (_, j) => geo.pos[last * Kc + j]); const c0 = axis(xe);
    const pts = ring.map((p) => { const d = norm([0, p[1] - c0[1], p[2] - c0[2]]); return add(p, add(mul(d, 0.002 * k), [sg * 0.002 * k, 0, 0])); });
    const nr = pts.map(() => [sg, 0, 0]); const acr = pts.map((p, i) => norm(cross([sg, 0, 0], sub(pts[(i + 1) % K], pts[(i + K - 1) % K]))));
    const g = strip(pts, nr, acr, (S.cord.w || 0.0035) * k, (S.cord.t || 0.0025) * k, { closed: true }); swatchUV(wd, g, S.cord.col);
    const ws = ring.map((_, j) => weights[last * Kc + j]); wd.piece('sleeve_cord_' + side, g, g.pos.map((_, vi) => ws[Math.floor(vi / 4) % K]), 'cloth_trim');
    if (S.tsuyu && bag) { const bp = geo.pos[last * Kc]; const bw = weights[last * Kc]; const parts = [];
      for (const dz of [-0.008, 0.008]) parts.push(tube([add(bp, [sg * 0.003 * k, 0, dz * k]), add(bp, [sg * 0.006 * k, -0.035 * k, dz * k * 1.4]), add(bp, [sg * 0.008 * k, -0.07 * k, dz * k * 1.8])], [0.004 * k, 0.004 * k, 0.003 * k], 6));
      parts.push(ellipsoid(add(bp, [sg * 0.004 * k, -0.004 * k, 0]), [0.008 * k, 0.008 * k, 0.012 * k], 8, 5));
      const g2 = merge(parts); swatchUV(wd, g2, S.cord.col); wd.piece('sleeve_tsuyu_' + side, g2, g2.pos.map(() => bw), 'cloth_trim'); }
  }
  return { xe, axis, chains };
}

// ===================================================================== swatches (flat trim colours in the B atlas)
export function swatchUV(wd, geo, col) {
  const key = col.join(','); if (!wd.sw.has(key)) { const n = wd.sw.size; wd.sw.set(key, n); }
  const n = wd.sw.get(key); const [u0, v0, u1, v1] = wd.swRect; const G = 8; const cu = lerp(u0, u1, ((n % G) + 0.5) / G), cv = lerp(v0, v1, (Math.floor(n / G) + 0.5) / G);
  geo.uv = geo.pos.map(() => [cu, cv]); return geo;
}
export function paintSwatches(wd) {
  const [u0, v0, u1, v1] = wd.swRect; const G = 8;
  for (const [key, n] of wd.sw) { const col = key.split(',').map(Number); const r = [lerp(u0, u1, (n % G) / G), lerp(v0, v1, Math.floor(n / G) / G), lerp(u0, u1, (n % G + 1) / G), lerp(v0, v1, (Math.floor(n / G) + 1) / G)];
    wd.cvB.rect(r, (lu, lv) => { const g = (vnoise(lu * 40, lv * 40) - 0.5) * 6; return [col[0] + g, col[1] + g, col[2] + g]; }); }
}

// ===================================================================== collar (crossed kimono collar on the torso shell)
export function buildCollar(wd, shellTorso, R, cuts) {
  const C = wd.C, M = C.M, k = scaleOf(C); const Cc = R.collar; const zc = lerp(M.neck[2], M.uchest[2], 0.4);
  const nY = cuts.neckCut - 0.009 * k; const endY = Cc.endY; const crossT = Cc.cross ?? 0.42;
  const wts = []; const parts = [];
  for (const side of [1, -1]) { // +1 = wearer's left panel (on top), -1 = right panel (under)
    const pts = [];
    const N1 = 16, N2 = 20;
    const nYf = (shellTorso.neckLoop?.length ? Math.min(...shellTorso.neckLoop.filter((q) => q[2] > zc).map((q) => q[1])) : nY) - 0.012 * k;
    for (let i = 0; i <= N1; i++) { const t = i / N1; const th = side * lerp(Math.PI, crossT, t); pts.push({ th, y: lerp(nY + 0.006 * k, nY - 0.006 * k, t) }); }
    for (let i = 1; i <= N2; i++) { const t = i / N2; pts.push({ th: side * lerp(0.42, -(Cc.reach ?? 0.62), t), y: lerp(nYf, endY, Math.pow(t, 0.95)) }); }
    // back + shoulders: follow the finished neckline (the shell's neck cut loop); front: lay on the kimono surface by rays
    const L = shellTorso.neckLoop || []; const lc = L.length ? mul(L.reduce(add, [0, 0, 0]), 1 / L.length) : [0, nY, zc];
    const onLoop = (th) => { let rs = 0, ys = 0, n = 0; for (const q of L) { const a = Math.atan2(q[0] - lc[0], q[2] - lc[2]); const da = Math.abs(((a - th + Math.PI) % TAU + TAU) % TAU - Math.PI); if (da < 0.3) { const w = 1 - da / 0.3; rs += Math.hypot(q[0] - lc[0], q[2] - lc[2]) * w; ys += q[1] * w; n += w; } } return n ? [rs / n, ys / n] : null; };
    const P3 = pts.map(({ th, y }, i) => { const d = [Math.sin(th), 0, Math.cos(th)];
      const lp = i <= N1 && L.length ? onLoop(th) : null; if (lp) return [lc[0] + d[0] * lp[0], lp[1] - 0.012 * k, lc[2] + d[2] * lp[0]];
      // front: a straight line in the front view from the side of the neck to past the centre line, dropped onto the kimono from the front
      const t = (i - N1) / N2; const n0 = L.length ? onLoop(side * crossT) : null; const x0 = n0 ? lc[0] + Math.sin(side * crossT) * n0[0] : side * 0.04 * k;
      const xe = -side * (Cc.reachX ?? 0.085) * k; const x = lerp(x0, xe, Math.pow(t, 1.1)); const o = [x, y, zc + 0.4]; const hz = rayNear(shellTorso.geo, o, [0, 0, -1]);
      if (hz > 0) return [x, y, o[2] - hz]; const o2 = [0, y, zc]; const t2 = rayNear(shellTorso.geo, o2, d); return t2 > 0 ? add(o2, mul(d, t2)) : add(o2, mul(d, 0.06 * k)); });
    let nrm = pts.map(({ th }) => [Math.sin(th), 0, Math.cos(th)]);
    for (let it = 0; it < 3; it++) for (let i = 1; i < P3.length - 1; i++) P3[i] = lerp3(P3[i], lerp3(P3[i - 1], P3[i + 1], 0.5), 0.5);
    // project every path point onto the kimono surface; offsets are taken along the true surface normal
    { const pr = P3.map((p) => nearestOnMesh(shellTorso.geo, p)); pr.forEach((r, i) => { if (r) { P3[i] = r.cp; nrm[i] = r.n; } });
      for (let it = 0; it < 2; it++) nrm = nrm.map((n, i) => norm(add(add(n, nrm[Math.max(0, i - 1)]), nrm[Math.min(nrm.length - 1, i + 1)]))); }
    // the right (under) panel disappears under the left one just past the crossing: only the V above it shows
    if (side < 0) { const cut = P3.findIndex((p, i) => i > N1 && p[0] > (Cc.cutX ?? 0.002) * k); if (cut > 0) { P3.length = cut + 1; pts.length = cut + 1; nrm = nrm.slice(0, cut + 1); } }
    const tan = P3.map((p, i) => norm(sub(P3[Math.min(i + 1, P3.length - 1)], P3[Math.max(i - 1, 0)])));
    let acr = tan.map((t, i) => norm(cross(nrm[i], t)));
    const target = [0, nY + 0.08 * k, zc]; let sgn = 0; P3.forEach((p, i) => (sgn += dot(acr[i], sub(target, p)))); if (sgn < 0) acr = acr.map((a) => mul(a, -1));
    // layers keep >= 4 mm: right panel 5.5 mm off the kimono, left panel lifts to 11.5 mm where it crosses over the right one
    const th0 = pts.map((q) => q.th); const lift = th0.map((th, i) => side < 0 ? 0.0075 : lerp(0.0075, 0.0135, (i > N1 ? 1 : 0) * smooth(0.75, 0.25, Math.abs(th))));
    const hw = (Cc.w || 0.016) * k; const T = 0.0015 * k;
    // smooth the laid path a little (no jagged steps from the triangulated surface)
    const outer = strip(P3.map((p, i) => add(p, mul(nrm[i], lift[i] * k))), nrm, acr, hw, T);
    const innerPts = P3.map((p, i) => add(add(p, mul(acr[i], hw + 0.0042 * k)), mul(nrm[i], (lift[i] - 0.0005) * k)));
    const inner = strip(innerPts, nrm, acr, 0.0045 * k, T);
    swatchUV(wd, outer, Cc.outer); swatchUV(wd, inner, Cc.inner);
    // round 2: >= 4.5 mm off every lower layer (neck lip included) and skinned exactly like the kimono under it
    wd.pushOut(outer.pos, 5, 0.0045 * k, { iters: 3 }); wd.pushOut(inner.pos, 5, 0.0045 * k, { iters: 3 });
    const cf = (bn) => /Neck|UpperChest|Chest|Spine|Shoulder/.test(bn); const bO = wd.weightsBelow(outer.pos, 5), bI = wd.weightsBelow(inner.pos, 5);
    const wOuter = outer.pos.map((p, i) => bO[i] || nearestWeights(C, p, { filter: cf, k: 4 }));
    const wInner = inner.pos.map((p, i) => bI[i] || nearestWeights(C, p, { filter: cf, k: 4 }));
    wd.piece('collar_' + (side > 0 ? 'L' : 'R'), outer, wOuter, 'cloth_trim', { layer: 5 }); wd.piece('collar_inner_' + (side > 0 ? 'L' : 'R'), inner, wInner, 'cloth_trim', { layer: 5 });
  }
}

// ===================================================================== sash + bow + tails
export function buildSash(wd, skirt, Sa) {
  const C = wd.C, M = C.M, k = scaleOf(C); const zc = M.hips[2];
  const yC = Sa.y, h = Sa.h * k; const N = 64; const pts = [], nr = [], acr = [];
  const xcap = Infinity; const sp0 = wd.stack.profile(yC, 72, { zc, band: h / 2 + 0.006 * k, xcap, base: bodyProfile(C, yC, 72, { zc, filter: (bn) => BODYB.test(bn), band: 0.03 }) });
  const rAt = (th) => sampleProfile(sp0, th) + 0.006 * k;
  const prof = []; for (let i = 0; i < N; i++) { const th = (i / N) * TAU; prof.push(rAt(th)); }
  for (let i = 0; i < N; i++) { const th = (i / N) * TAU; const r = prof[i] + 0.004 * k; pts.push([Math.sin(th) * r, yC, zc + Math.cos(th) * r]); nr.push([Math.sin(th), 0, Math.cos(th)]); acr.push([0, 1, 0]); }
  const g = strip(pts, nr, acr, h / 2, 0.004 * k, { closed: true }); swatchUV(wd, g, Sa.col);
  { // conical fit: each edge of the obi sits 5 mm outside whatever is worn at ITS height (the hakama flares right below it)
    const pT = wd.stack.profile(yC + h / 2, 72, { zc, band: 0.01 * k }), pB = wd.stack.profile(yC - h / 2 - 0.01 * k, 72, { zc, band: 0.016 * k });
    g.pos = g.pos.map((p, vi) => { const c = vi % 4; const top = c === 0 || c === 3, outer = c < 2; const th = Math.atan2(p[0], p[2] - zc);
      const r = Math.max(sampleProfile(top ? pT : pB, th), sampleProfile(sp0, th)) + 0.005 * k + (outer ? 0.008 * k : 0); return [Math.sin(th) * r, p[1], zc + Math.cos(th) * r]; }); }
  { wd.pushOut(g.pos, 5, 0.005 * k, { iters: 2 }); const bS = wd.weightsBelow(g.pos, 5, { skip: (n) => /^sleeve_/.test(n) }); wd.piece('sash', g, g.pos.map((p, i) => bS[i] || nearestWeights(C, p, { filter: (bn) => /Hips|Spine/.test(bn), k: 4 })), 'cloth_trim', { layer: 5 }); }
  let backR = Math.max(...g.pos.filter((p) => Math.abs(p[0]) < 0.03 * k && p[2] < zc).map((p) => zc - p[2])); const hipsW = W1(C.ji('J_Bip_C_Hips'));
  if (Sa.koshiita) { // stiff back board of the hakama above the sash, curved to the back, two cords
    const kh = 0.06 * k, wTop = 0.06 * k, wBot = 0.085 * k; const pos = [], idx = [], NU = 9, NV = 5;
    for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) { const tv = v / (NV - 1), tu = u / (NU - 1) * 2 - 1; const y = yC + h / 2 - 0.004 * k + kh * tv; const hw2 = lerp(wBot, wTop, tv) * (1 - 0.15 * tv * tv);
      const x = tu * hw2; const pf = wd.stack.profile(y, 72, { zc, band: 0.012 * k, xcap }); let ph = Math.PI, rr = 0.1 * k; for (let it = 0; it < 6; it++) { rr = sampleProfile(pf, ph) + 0.009 * k; ph = Math.PI - Math.asin(Math.max(-0.95, Math.min(0.95, x / rr))); }
      pos.push([x, y, zc + Math.cos(ph) * rr]); }
    for (let v = 0; v < NV - 1; v++) for (let u = 0; u < NU - 1; u++) { const a = v * NU + u; idx.push(a, a + 1, a + NU, a + 1, a + NU + 1, a + NU); }
    const n = pos.length; const back = pos.map((p) => [p[0], p[1], p[2] - 0.004 * k]); const all = pos.concat(back); const id2 = idx.slice(); idx.forEach((_, t) => { if (t % 3 === 0) id2.push(idx[t] + n, idx[t + 2] + n, idx[t + 1] + n); });
    const ring = []; for (let u = 0; u < NU - 1; u++) ring.push([u, u + 1]); for (let v = 0; v < NV - 1; v++) ring.push([v * NU + NU - 1, (v + 1) * NU + NU - 1]); for (let u = NU - 1; u > 0; u--) ring.push([(NV - 1) * NU + u, (NV - 1) * NU + u - 1]); for (let v = NV - 1; v > 0; v--) ring.push([v * NU, (v - 1) * NU]);
    for (const [a, c] of ring) id2.push(a, c, a + n, c, c + n, a + n);
    const kg = fixWinding({ pos: all, idx: id2, uv: [] }); swatchUV(wd, kg, Sa.koshiCol || Sa.col);
    wd.piece('koshiita', kg, kg.pos.map((p) => nearestWeights(C, p, { filter: (bn) => /Hips|Spine/.test(bn), k: 4 })), 'cloth_trim', { layer: 5.5 });
    backR += 0.014 * k; }
  const knot = [0, yC, zc - backR - 0.012 * k];
  if (Sa.bow) {
    const parts = []; const s = Sa.bowScale * k; const Nn = [0, 0, -1];
    for (const sx of [1, -1]) { const X = norm([sx, 0.28, 0]);
      parts.push(loft([0.01, 0.03, 0.055, 0.08, 0.092].map((x, i) => ({ c: add(knot, add(mul(X, x * s / 0.09 * 0.9), [0, 0, -0.006 * s / 0.09 * Math.sin(i / 4 * Math.PI)])), u: norm(cross(X, Nn)), v: Nn, ru: [0.012, 0.03, 0.038, 0.034, 0.02][i] * s / 0.09, rv: [0.008, 0.014, 0.016, 0.014, 0.008][i] * s / 0.09 })), 12)); }
    parts.push(ellipsoid(knot, [0.016 * s / 0.09, 0.022 * s / 0.09, 0.013 * s / 0.09], 10, 6));
    const g2 = merge(parts); { const cp = g2.pos.map((p) => p.slice()); wd.pushOut(cp, 6, 0.007 * k, { iters: 3 }); let dz = 0; cp.forEach((p, i) => { dz = Math.min(dz, p[2] - g2.pos[i][2]); }); if (dz < 0) g2.pos = g2.pos.map((p) => [p[0], p[1], p[2] + dz]); }
    swatchUV(wd, g2, Sa.bowCol || Sa.col); const bwB = Sa.koshiita ? nearestWeights(C, knot, { filter: (bn) => /Hips|Spine/.test(bn), k: 4 }) : (wd.weightsBelow([knot], 6, { skip: (n) => /^sleeve_/.test(n), reach: 0.08 })[0] || hipsW); wd.piece('sash_bow', g2, g2.pos.map(() => bwB), 'cloth_trim', { layer: 6 });
    // tails hanging over the hakama back, each on its own chain
    for (const sx of [1, -1]) {
      const L = Sa.tail * k; const np = 9; const tp = [];
      for (let i = 0; i < np; i++) { const t = i / (np - 1); const y = yC - 0.01 * k - L * t; const x = sx * (0.016 + 0.05 * t) * k; let zb = knot[2] - 0.004 * k;
        if (skirt) { const th = Math.PI - Math.atan2(x, 0.2); const rows = skirt.rows; // back surface of the skirt at that height
          const s2 = clamp01((skirt.hipY0 - y) / (skirt.hipY0 - (Sa.hemY ?? 0.1))); const p = y > skirt.hipY0 ? null : skirt.surf(Math.PI - sx * 0.12, { kind: 's', s: s2 }); if (p) zb = Math.min(zb, p[2] - 0.02 * k - skirt.depth * k * 0.6); }
        tp.push([x, y, zb]); }
      const ids = wd.chain('SashTail' + (sx > 0 ? 'L' : 'R'), 1, 'J_Bip_C_Hips', [tp[0], tp[3], tp[6], tp[8]], { kind: 'tail' });
      const nrm = tp.map(() => [0, 0, -1]); const acr2 = tp.map((p, i) => norm(cross([0, 0, -1], sub(tp[Math.min(i + 1, np - 1)], tp[Math.max(i - 1, 0)]))));
      const gt = strip(tp, nrm, acr2, (s) => (0.014 + 0.006 * s) * k, 0.0035 * k); swatchUV(wd, gt, Sa.bowCol || Sa.col);
      const params = [0, 3 / 8, 6 / 8, 1];
      wd.piece('sash_tail', gt, gt.pos.map((_, vi) => Wardrobe.along(ids, params, Math.floor(vi / 4) / (np - 1))), 'cloth_trim', { layer: 6 });
    }
  }
  return { yC, prof, knot, rAt };
}

// ===================================================================== hanging charm (bell + paper)
export function buildCharm(wd, sash, Ch) {
  const C = wd.C, k = scaleOf(C); const th = Ch.theta ?? 0.75; const r = sampleProfile(sash.prof, th) + 0.01 * k; const zc = C.M.hips[2];
  const top = [Math.sin(th) * r, sash.yC - 0.012 * k, zc + Math.cos(th) * r]; const nr = [Math.sin(th), 0, Math.cos(th)];
  const L = (Ch.len || 0.07) * k; const end = add(top, [0, -L, 0]); const mid = add(top, [0, -L * 0.5, 0]);
  const ids = wd.chain('Charm', 1, 'J_Bip_C_Hips', [top, mid, add(end, [0, -0.02 * k, 0])], { kind: 'charm' });
  const cw = (y) => Wardrobe.along(ids, [0, 0.5, 1], clamp01((top[1] - y) / (L + 0.02 * k)));
  const cord = tube([top, mid, end], [0.0022 * k, 0.0022 * k, 0.0022 * k], 6); swatchUV(wd, cord, Ch.cord);
  const bell = ellipsoid(add(end, [0, -0.011 * k, 0]), [0.012 * k, 0.012 * k, 0.012 * k], 12, 8); swatchUV(wd, bell, Ch.bell);
  const slit = tube([add(end, [-0.008 * k, -0.016 * k, 0.0105 * k]), add(end, [0.008 * k, -0.016 * k, 0.0105 * k])], [0.0016 * k, 0.0016 * k], 5); swatchUV(wd, slit, [60, 40, 20]);
  const g = merge([cord, bell, slit]); wd.piece('charm', g, g.pos.map((p) => cw(p[1])), 'cloth_trim');
  if (Ch.paper) { // shide: zig-zag paper strip
    const pts = []; for (let i = 0; i < 7; i++) pts.push(add(top, [((i % 2) ? 0.012 : -0.004) * k + 0.014 * k, -i * 0.013 * k, 0.003 * k])); const n = pts.map(() => nr); const a = pts.map(() => norm(cross(nr, [0, 1, 0])));
    const gp = strip(pts, n, a.map((v) => mul(v, 1)), 0.006 * k, 0.0012 * k); swatchUV(wd, gp, [250, 250, 244]); wd.piece('charm_paper', gp, gp.pos.map((p) => cw(p[1])), 'cloth_trim');
  }
}

// ===================================================================== sandals (zori / waraji)
export function buildSandals(wd, Sd) {
  const C = wd.C, M = C.M, k = scaleOf(C);
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1; const foot = M['foot' + side], toe = M['toe' + side];
    const { P, nv, domBip } = C.body; let x0 = 9, x1 = -9, z0 = 9, z1 = -9;
    for (let i = 0; i < nv; i++) { if (!new RegExp(`J_Bip_${side}_(Foot|ToeBase)`).test(domBip[i])) continue; if (P[i * 3 + 1] > M.bodyMinY + 0.03 * k) continue; x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]); z0 = Math.min(z0, P[i * 3 + 2]); z1 = Math.max(z1, P[i * 3 + 2]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 + 0.004 * k, hw = (x1 - x0) / 2 + 0.008 * k, hl = (z1 - z0) / 2 + 0.012 * k; const yTop = M.bodyMinY + 0.001, yBot = 0.0;
    const NO = 28; const outl = []; for (let i = 0; i < NO; i++) { const a = (i / NO) * TAU; const c = Math.cos(a), s = Math.sin(a); const zz = Math.sign(s) * Math.pow(Math.abs(s), 0.7); const w = hw * (zz < 0 ? lerp(1, 0.82, -zz) : 1); outl.push([cx + w * Math.sign(c) * Math.pow(Math.abs(c), 0.7), cz + hl * zz]); }
    const pos = [], idx = []; const ct = pos.length; pos.push([cx, yTop, cz]); outl.forEach(([x, z]) => pos.push([x, yTop, z])); const cb = pos.length; pos.push([cx, yBot, cz]); outl.forEach(([x, z]) => pos.push([x, yBot, z]));
    for (let i = 0; i < NO; i++) { const a = 1 + i, b = 1 + (i + 1) % NO; idx.push(ct, b, a); idx.push(cb, cb + a, cb + b); idx.push(a, b, cb + a, b, cb + b, cb + a); }
    const sole = { pos, idx, uv: [] }; const top = { pos: [], idx: [] };
    // thin top layer (tatami / straw) in a second colour
    const g1 = swatchUV(wd, sole, Sd.sole);
    const toeZ = toe[2]; const wOf = (p) => wmix(W1(C.ji(`J_Bip_${side}_Foot`)), W1(C.ji(`J_Bip_${side}_ToeBase`)), smooth(toeZ - 0.03 * k, toeZ + 0.01 * k, p[2]));
    wd.piece('sandal_' + side, g1, g1.pos.map(wOf), 'cloth_trim');
    // hanao straps: toe post between big and second toe -> over the instep -> both sides
    const post = [cx - sg * hw * 0.28, yTop, toeZ + 0.02 * k]; const parts = [];
    for (const s2 of [1, -1]) { const sideP = [cx + s2 * hw * 0.98, yTop + 0.004 * k, toeZ - 0.045 * k];
      // strap laid ON the tabi: each sample dropped onto the foot shell from above, centre at 0.75 x its radius above the cloth
      const rS = 0.005 * k; const foot = wd.shellGeo?.foot; const NP = 9;
      const lifted = Array.from({ length: NP }, (_, i) => { const t = i / (NP - 1); const p = lerp3(post, sideP, t); if (!foot) return p; const o = [p[0], p[1] + 0.2, p[2]]; const h = rayNear(foot, o, [0, -1, 0]);
        const yy = h > 0 ? o[1] - h + rS * 0.75 : p[1] + rS; return [p[0], Math.max(yTop + rS * 0.6, yy), p[2]]; });
      for (let it = 0; it < 2; it++) for (let i = 1; i < NP - 1; i++) lifted[i] = [lifted[i][0], Math.max(lifted[i][1], (lifted[i - 1][1] + lifted[i + 1][1]) / 2), lifted[i][2]];
      parts.push(tube(lifted, lifted.map(() => rS), 8, [0, 0, 1], 0.7)); }
    parts.push(ellipsoid(add(post, [0, 0.006 * k, 0]), [0.006 * k, 0.008 * k, 0.006 * k], 8, 5));
    const g2 = merge(parts); swatchUV(wd, g2, Sd.strap); wd.piece('sandal_strap_' + side, g2, g2.pos.map(wOf), 'cloth_trim');
  }
}

// ===================================================================== hair ribbon (big bow at the back of the head, tails on chains)
export function hairPoints(C) { const pts = []; for (const nd of C.root.listNodes()) { if (!/_hair$/i.test(nd.getName()) || !nd.getMesh()) continue; for (const p of nd.getMesh().listPrimitives()) { const a = p.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) pts.push([a[i], a[i + 1], a[i + 2]]); } } return pts; }
export function backZ(pts, x, y, r = 0.03, def = 0) { let z = Infinity; for (const p of pts) if (Math.abs(p[0] - x) < r && Math.abs(p[1] - y) < r) z = Math.min(z, p[2]); return z === Infinity ? def : z; }
export function buildHairRibbon(wd, Rb) {
  const C = wd.C, M = C.M, k = scaleOf(C); const hw = M.head; const hp = hairPoints(C);
  const o = add(hw, mul(Rb.offset || [0, 0.15, -0.122], k)); const s = (Rb.scale || 1) * k; const U = norm([0, 0.97, 0.24]), Nn = norm([0, 0.24, -0.97]);
  const at = (X, x, u, n) => add(o, add(mul(X, x * s), add(mul(U, u * s), mul(Nn, n * s))));
  const parts = [];
  for (const sgn of [1, -1]) { const X = [1, 0, 0];
    const Wt = [[0.008, 0.011, 0.008, 0, 0], [0.038, 0.030, 0.016, 0.004, 0.003], [0.078, 0.044, 0.019, 0.010, 0.000], [0.112, 0.043, 0.013, 0.017, -0.010], [0.124, 0.028, 0.006, 0.020, -0.015]];
    parts.push(loft(Wt.map(([x, ru, rv, cu, cn]) => ({ c: at(X, sgn * x, cu, cn), u: U, v: Nn, ru: ru * s, rv: rv * s })), 12)); }
  parts.push(loft([[-0.015, 0.006, 0.005], [-0.009, 0.016, 0.013], [0, 0.019, 0.016], [0.009, 0.016, 0.013], [0.015, 0.006, 0.005]].map(([x, ru, rv]) => ({ c: at([1, 0, 0], x, 0, 0.004), u: U, v: Nn, ru: ru * s, rv: rv * s })), 10));
  const g = merge(parts); g.uv = g.pos.map(() => [0.5, 0.5]); const headW = W1(C.ji('J_Bip_C_Head'));
  wd.piece('hair_ribbon', g, g.pos.map(() => headW), 'Ribbon', { group: `${C.pfx}_ribbon` });
  for (const sx of [1, -1]) { const L = Rb.tail * k; const np = 10; const tp = [];
    for (let i = 0; i < np; i++) { const t = i / (np - 1); const x = o[0] + sx * (0.012 + 0.05 * t) * s / k; const y = o[1] - 0.01 * k - L * t; const zb = backZ(hp, x, y, 0.025 * k, o[2] + 0.02); tp.push([x, y, Math.min(o[2] - 0.006 * k, zb - 0.01 * k)]); }
    const ids = wd.chain('Ribbon' + (sx > 0 ? 'L' : 'R'), 1, 'J_Bip_C_Head', [tp[0], tp[3], tp[6], tp[9]], { kind: 'tail' });
    const nrm = tp.map(() => [0, 0, -1]); const acr = tp.map((p, i) => norm(cross([0, 0, -1], sub(tp[Math.min(i + 1, np - 1)], tp[Math.max(i - 1, 0)]))));
    const gt = strip(tp, nrm, acr, (q) => (0.011 + 0.007 * q) * s, 0.003 * k); gt.uv = gt.pos.map(() => [0.5, 0.5]);
    wd.piece('hair_ribbon_tail', gt, gt.pos.map((_, vi) => Wardrobe.along(ids, [0, 3 / 9, 6 / 9, 1], Math.floor(vi / 4) / (np - 1))), 'Ribbon', { group: `${C.pfx}_ribbon` });
  }
}
