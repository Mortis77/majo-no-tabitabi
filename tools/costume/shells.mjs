// Round 2 shells: clean cut loops (triangles clipped along the cut, both on the body and on the garment), lips that close the
// gap between skin and shell (or between two shells) so every cut is a finished, watertight hem, and the torso ENVELOPE:
// the kimono front is a smooth convex surface (per-ring convex hull + vertical upper hull), not an offset of the bust.
import { add, sub, mul, dot, cross, len, norm, lerp, lerp3, clamp01, smooth, wmix, wsum, strip } from './garment.mjs';
import { scaleOf, fabric, swatchUV } from './outfit.mjs';
const TAU = Math.PI * 2;
const ARM = /_(UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)/;

export function buildShells(wd, R, cvA) {
  const C = wd.C, M = C.M, k = scaleOf(C), b = C.body, S = R.shells; const { domBip } = b;
  const waistCut = lerp(M.hips[1], M.spine[1], 0.6);
  const neckCut = M.neck[1] - (S.neckDrop ?? 0.012) * k;
  const ankleCut = M.footL[1] + 0.045 * k;
  const wristX = Math.abs(M.handL[0]) - 0.004 * k, elbowX = Math.abs(M.laL[0]);
  const armTo = S.arm?.to || 'wrist'; const armLim = !S.arm ? -1 : armTo === 'elbow' ? elbowX + 0.035 * k : armTo === 'upper' ? Math.abs(M.uaL[0]) + 0.09 * k : wristX;
  // ---- extendable copy of every body attribute
  const prim = b.prim; const sem = prim.listSemantics(); const A = {};
  for (const s of sem) { const acc = prim.getAttribute(s); A[s] = { arr: Array.from(acc.getArray()), n: acc.getElementSize(), Ctor: acc.getArray().constructor, acc }; }
  const nv0 = b.nv; let nvx = nv0; const par = [];
  const pos = (i) => [A.POSITION.arr[i * 3], A.POSITION.arr[i * 3 + 1], A.POSITION.arr[i * 3 + 2]];
  const nrmOf = (i) => [A.NORMAL.arr[i * 3], A.NORMAL.arr[i * 3 + 1], A.NORMAL.arr[i * 3 + 2]];
  const wOf = (i) => { const m = new Map(); for (let c = 0; c < 4; c++) { const w = A.WEIGHTS_0.arr[i * 4 + c]; if (w > 0) m.set(A.JOINTS_0.arr[i * 4 + c], (m.get(A.JOINTS_0.arr[i * 4 + c]) || 0) + w); } return m; };
  const orig = (i) => (i < nv0 ? i : par[i - nv0]);
  const cache = new Map();
  const mid = (i, j, t, key) => {
    if (i > j) { [i, j] = [j, i]; t = 1 - t; } const kk = key + ':' + i + '_' + j; if (cache.has(kk)) return cache.get(kk);
    for (const s of sem) { if (s === 'JOINTS_0' || s === 'WEIGHTS_0') continue; const a = A[s]; for (let c = 0; c < a.n; c++) a.arr.push(lerp(a.arr[i * a.n + c], a.arr[j * a.n + c], t)); }
    const o = nvx * 3; const nn = norm([A.NORMAL.arr[o], A.NORMAL.arr[o + 1], A.NORMAL.arr[o + 2]]); A.NORMAL.arr[o] = nn[0]; A.NORMAL.arr[o + 1] = nn[1]; A.NORMAL.arr[o + 2] = nn[2];
    const ws = [...wmix(wOf(i), wOf(j), t).entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 4); const tot = ws.reduce((s2, [, v]) => s2 + v, 0) || 1;
    for (let c = 0; c < 4; c++) { A.JOINTS_0.arr.push(ws[c] ? ws[c][0] : 0); A.WEIGHTS_0.arr.push(ws[c] ? ws[c][1] / tot : 0); }
    par.push(orig(t < 0.5 ? i : j)); cache.set(kk, nvx); return nvx++;
  };
  const F = { waist: (p) => p[1] - waistCut, neck: (p) => neckCut - p[1], ankle: (p) => p[1] - ankleCut, arm: (p) => armLim - Math.abs(p[0]), below: (p) => p[1] - (S.leg?.skinBelow || 0) * k };
  const clip = (poly, fn) => { if (!poly) return [null, null]; const f = poly.map((i) => F[fn](pos(i))); const P = [], N = [];
    for (let a = 0; a < poly.length; a++) { const bb = (a + 1) % poly.length; const fa = f[a], fb = f[bb];
      if (fa >= 0) P.push(poly[a]); if (fa <= 0) N.push(poly[a]);
      if ((fa > 0 && fb < 0) || (fa < 0 && fb > 0)) { const m = mid(poly[a], poly[bb], fa / (fa - fb), fn); P.push(m); N.push(m); } }
    return [P.length >= 3 ? P : null, N.length >= 3 ? N : null]; };
  const has = { top: !!S.torso, leg: !!S.leg, foot: !!S.foot, skin: true };
  const out = { top: [], leg: [], foot: [], skin: [] };
  const emit = (poly, r) => { if (!poly) return; if (!has[r]) r = 'skin'; for (let q = 1; q < poly.length - 1; q++) out[r].push(poly[0], poly[q], poly[q + 1]); };
  const I = b.I; const isArm = (i) => ARM.test(domBip[orig(i)]);
  for (let t = 0; t < I.length; t += 3) {
    const vs = [I[t], I[t + 1], I[t + 2]]; const nA = vs.filter(isArm).length;
    if (nA >= 2) { const [p, n] = clip(vs, 'arm'); if (armLim > 0) { const [tp, sk] = clip(p, 'neck'); emit(tp, 'top'); emit(sk, 'skin'); } else emit(p, 'skin'); emit(n, 'skin'); continue; }
    const [up, lo] = clip(vs, 'waist');
    if (up) { const [tp, sk] = clip(up, 'neck'); emit(tp, 'top'); emit(sk, 'skin'); }
    if (lo) { const [l, f] = clip(lo, 'ankle'); if (l) { if (S.leg?.skinBelow) { const [l2, s2] = clip(l, 'below'); emit(l2, 'leg'); emit(s2, 'skin'); } else emit(l, 'leg'); } emit(f, 'foot'); }
  }
  { // r2: snap cut vertices that land within 0.2 mm of another vertex (a corner cut by two planes in different orders) onto it
    const cell = new Map(); const ck = (a, b2, c) => a + ',' + b2 + ',' + c;
    for (let i = 0; i < nvx; i++) { const p = pos(i); const g = p.map((v) => Math.floor(v * 1000)); let hit = -1;
      for (let a = -1; a <= 1 && hit < 0; a++) for (let b2 = -1; b2 <= 1 && hit < 0; b2++) for (let c = -1; c <= 1 && hit < 0; c++) for (const j of cell.get(ck(g[0] + a, g[1] + b2, g[2] + c)) || []) { const q = pos(j); if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.0005) { hit = j; break; } }
      if (hit >= 0) { const q = pos(hit); A.POSITION.arr[i * 3] = q[0]; A.POSITION.arr[i * 3 + 1] = q[1]; A.POSITION.arr[i * 3 + 2] = q[2]; continue; }
      const kk = ck(...g); if (!cell.has(kk)) cell.set(kk, []); cell.get(kk).push(i); }
    for (const r of Object.keys(out)) { const o2 = []; const T = out[r]; for (let t = 0; t < T.length; t += 3) { const a = pos(T[t]), b2 = pos(T[t + 1]), c = pos(T[t + 2]); if (len(cross(sub(b2, a), sub(c, a))) > 1e-11) o2.push(T[t], T[t + 1], T[t + 2]); } out[r] = o2; } }
  // write the body back: same attributes, extra cut vertices appended, only skin triangles kept
  for (const s of sem) { const a = A[s]; a.acc.setArray(new a.Ctor(a.arr)); }
  prim.setIndices(C.doc.createAccessor().setType('SCALAR').setArray(nvx < 65536 ? new Uint16Array(out.skin) : new Uint32Array(out.skin)).setBuffer(wd.buffer));
  // ---- welded normals (UV seams split vertices; the shell must not crack there)
  const keyP = (i) => pos(i).map((v) => Math.round(v * 1e5)).join(',');
  const wid = new Map(); const wN = new Map(); const widOf = new Int32Array(nvx);
  for (let i = 0; i < nvx; i++) { const kk = keyP(i); if (!wid.has(kk)) wid.set(kk, wid.size); widOf[i] = wid.get(kk); const n = nrmOf(i); const o = wN.get(widOf[i]) || [0, 0, 0]; wN.set(widOf[i], add(o, n)); }
  const nW = (i) => norm(wN.get(widOf[i]));
  const uaX = Math.abs(M.uaL[0]);
  const shells = {}; let topW = null;
  for (const r of ['top', 'leg', 'foot']) {
    const tri = out[r]; if (!tri.length) continue;
    const sp = r === 'top' ? S.torso : S[r]; const map = new Map(); const src = [];
    const idx = tri.map((i) => { if (!map.has(i)) { map.set(i, src.length); src.push(i); } return map.get(i); });
    const offAt = (p) => { if (r !== 'top') return (sp.off ?? 0.006) * k; const ta = (S.torso.off ?? 0.01) * k, aa = (S.arm?.off ?? 0.006) * k; return lerp(ta, aa, smooth(uaX - 0.03 * k, uaX + 0.02 * k, Math.abs(p[0]))); };
    let P = src.map((i) => { const p = pos(i); return add(p, mul(nW(i), offAt(p) * (sp.offFn ? sp.offFn(p, M, k) : 1))); });
    if (r === 'top' && sp.smooth) P = smoothWelded(P, idx, src.map((i) => widOf[i]), src.map((i) => pos(i)), src.map((i) => nW(i)), sp.smooth, (S.torso.off ?? 0.01) * k * 0.8, src.map((i) => isArm(i)));
    if (r === 'top') envelope(C, P, src.map((i) => !isArm(i)), { ...(R.build || {}), waistCut, neckCut });
    const uv = src.map((i) => [A.TEXCOORD_0.arr[i * 2], A.TEXCOORD_0.arr[i * 2 + 1]]);
    const weights = src.map((i) => wOf(i));
    // torso: bust bones -> UpperChest, then the weight field is diffused over the envelope (bust-shaped weight islands would
    // otherwise re-draw the bust outline as soon as the spine bends)
    if (r === 'top') { const uc = C.ji('J_Bip_C_UpperChest'); const rm = new Map(); C.jn.forEach((n, j) => { if (/^J_Sec_[LR]_Bust/.test(n)) rm.set(j, uc); });
      let W = weights.map((m) => { const o = new Map(); for (const [j, v] of m) { const jj = rm.get(j) ?? j; o.set(jj, (o.get(jj) || 0) + v); } return o; });
      const wid2 = src.map((i) => widOf[i]); const gid = new Map(); const g = wid2.map((x) => { if (!gid.has(x)) gid.set(x, gid.size); return gid.get(x); });
      const nb = Array.from({ length: gid.size }, () => new Set()); for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = g[idx[t + e]], c = g[idx[t + (e + 1) % 3]]; if (a !== c) { nb[a].add(c); nb[c].add(a); } }
      const pin = new Uint8Array(gid.size); src.forEach((i, vi) => { const p = pos(i); if (isArm(i) || p[1] > neckCut - 0.03 * k || p[1] < waistCut + 0.012 * k) pin[g[vi]] = 1; });
      let G = new Array(gid.size); src.forEach((_, vi) => { G[g[vi]] = W[vi]; });
      for (let it = 0; it < (S.torso.wSmooth ?? 150); it++) G = G.map((m, a) => { if (pin[a] || !nb[a].size) return m; return wsum([[m, 0.5], ...[...nb[a]].map((b2) => [G[b2], 0.5 / nb[a].size])]); });
      W = src.map((_, vi) => G[g[vi]]); topW = W; }
    shells[r] = { geo: { pos: P, uv, idx }, src, map, sp, W: r === 'top' ? topW : null };
  }
  // ---- lips: close every cut (shell <-> skin, shell <-> shell) with a rounded two-segment band
  const bEdges = (r) => { const sh = shells[r]; const cnt = new Map(); const { idx } = sh.geo; const S2 = sh.src;
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], c = idx[t + (e + 1) % 3]; const wa = widOf[S2[a]], wc = widOf[S2[c]]; if (wa === wc) continue; const kk = wa < wc ? wa + '_' + wc : wc + '_' + wa; const o = cnt.get(kk); if (o) o.n++; else cnt.set(kk, { n: 1, a, c }); }
    const res = new Map(); for (const [kk, v] of cnt) if (v.n === 1) res.set(kk, v); return res; };
  const BE = {}; for (const r of Object.keys(shells)) BE[r] = bEdges(r);
  const fieldAt = (p) => { let best = null, bv = 0.004 * k; for (const fn of ['neck', 'waist', 'ankle', 'arm', 'below']) { if (fn === 'below' && !S.leg?.skinBelow) continue; if (fn === 'arm' && armLim < 0) continue; const v = Math.abs(F[fn](p)); if (v < bv) { bv = v; best = fn; } } return best; };
  const grad = { neck: [0, -1, 0], waist: [0, 1, 0], ankle: [0, 1, 0], below: [0, 1, 0] };
  const done = new Set(); const lips = {};
  for (const r of Object.keys(shells)) {
    const sh = shells[r]; const lp = { pos: [], uv: [], idx: [] }; const lw = []; const vcache = new Map(); let other = null;
    const triple = (a, oSh) => { const kk = widOf[sh.src[a]] + ':' + (oSh ? 'S' : 'B'); if (vcache.has(kk)) return vcache.get(kk);
      const bi = sh.src[a]; const X = sh.geo.pos[a]; let O, oi = bi;
      if (oSh) { const j = oSh.map.get(bi) ?? [...oSh.map.entries()].find(([ii]) => widOf[ii] === widOf[bi])?.[1]; O = oSh.geo.pos[j]; } else O = pos(bi);
      const fn = fieldAt(pos(bi)); let away; if (fn === 'arm') away = [Math.sign(pos(bi)[0]), 0, 0]; else if (fn) { const g = grad[fn]; const sgn = F[fn](lerp3(pos(bi), X, 0) ) >= 0 ? 1 : 1; away = mul(g, -1); if (fn === 'neck') away = [0, 1, 0]; if (fn === 'below') away = [0, -1, 0]; if (fn === 'waist' || fn === 'ankle') away = nW(bi); } else away = nW(bi);
      const gap = len(sub(X, O)); const Mi = add(lerp3(X, O, 0.5), add(mul(norm(away), gap * 0.45 + 0.0015 * k), mul(nW(bi), 0.15 * gap)));
      const base = lp.pos.length; lp.pos.push(X, Mi, O); const u = [A.TEXCOORD_0.arr[bi * 2], A.TEXCOORD_0.arr[bi * 2 + 1]]; lp.uv.push(u, u, u); const w = wOf(bi); lw.push(w, w, w);
      vcache.set(kk, base); return base; };
    for (const [kk, e] of BE[r]) {
      let oSh = null; for (const r2 of Object.keys(shells)) if (r2 !== r && BE[r2].has(kk)) oSh = r2;
      if (oSh) { const pk = [r, oSh].sort().join('|') + kk; if (done.has(pk)) continue; done.add(pk); }
      const ta = triple(e.a, oSh ? shells[oSh] : null), tc = triple(e.c, oSh ? shells[oSh] : null);
      const quads = [[ta, tc, ta + 1, tc + 1], [ta + 1, tc + 1, ta + 2, tc + 2]];
      for (const [a0, c0, a1, c1] of quads) { // orient so the band faces away from the inside of the limb/torso
        const pA = lp.pos[a0], pC = lp.pos[c0], pA1 = lp.pos[a1]; const n = cross(sub(pC, pA), sub(pA1, pA)); const out2 = add(nW(sh.src[e.a]), sub(lp.pos[ta + 1], lerp3(lp.pos[ta], lp.pos[ta + 2], 0.5)));
        if (dot(n, out2) >= 0) lp.idx.push(a0, c0, a1, c0, c1, a1); else lp.idx.push(a0, a1, c0, c0, a1, c1); }
      if (oSh === 'foot' || r === 'foot') other = 'ankle';
    }
    { // r2: merge lip vertices closer than 0.2 mm (two bands meeting at a seam leave zero-area slivers = open edges otherwise)
      const km = new Map(); const rm = lp.pos.map((p, i) => { const kk = p.map((v) => Math.round(v * 5000)).join(','); if (!km.has(kk)) km.set(kk, i); return km.get(kk); });
      const ni = []; for (let t = 0; t < lp.idx.length; t += 3) { const a = rm[lp.idx[t]], b2 = rm[lp.idx[t + 1]], c = rm[lp.idx[t + 2]]; if (a !== b2 && b2 !== c && a !== c) ni.push(a, b2, c); } lp.idx = ni; }
    lips[r] = { lp, lw };
  }
  { // r2: close the last slivers where two cut planes meet (neck|arm corner, back seam): weld body skin + shells + lips exactly
    // like the checker does (0.01 mm), walk every boundary loop, and fan-fill the small ones (<= 12 edges, < 6 cm round) into the lip
    const key = new Map(); const VP = [], VW = []; const g3 = new Map(); const wid2 = (p, w) => { const kk = p.map((v) => Math.round(Math.fround(v) * 1e5)).join(','); if (key.has(kk)) return key.get(kk);
      const g = p.map((v) => Math.floor(v * 1000)); for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) for (let c = -1; c <= 1; c++) for (const j of g3.get((g[0] + a) + ',' + (g[1] + b2) + ',' + (g[2] + c)) || []) { const q = VP[j]; if (len(sub(q, p)) < 0.0005) { p[0] = q[0]; p[1] = q[1]; p[2] = q[2]; return j; } } // snap shell/lip points onto a point already there
      key.set(kk, VP.length); const gk = g.join(','); if (!g3.has(gk)) g3.set(gk, []); g3.get(gk).push(VP.length); VP.push(p); VW.push(w); return VP.length - 1; };
    const dir = new Map(); const addTri = (a, b2, c) => { for (const [x, y] of [[a, b2], [b2, c], [c, a]]) { if (x === y) continue; const kk = x < y ? x + '_' + y : y + '_' + x; const o = dir.get(kk); if (o) o.n++; else dir.set(kk, { n: 1, x, y }); } };
    for (let t = 0; t < out.skin.length; t += 3) addTri(...[0, 1, 2].map((e) => wid2(pos(out.skin[t + e]), wOf(out.skin[t + e]))));
    for (const [r, sh] of Object.entries(shells)) { const W2 = sh.W || sh.src.map((i) => wOf(i)); const id = sh.geo.pos.map((p, i) => wid2(p, W2[i])); for (let t = 0; t < sh.geo.idx.length; t += 3) addTri(id[sh.geo.idx[t]], id[sh.geo.idx[t + 1]], id[sh.geo.idx[t + 2]]); }
    for (const r of Object.keys(lips)) { const { lp, lw } = lips[r]; const id = lp.pos.map((p, i) => wid2(p, lw[i])); for (let t = 0; t < lp.idx.length; t += 3) addTri(id[lp.idx[t]], id[lp.idx[t + 1]], id[lp.idx[t + 2]]); }
    const adj = new Map(); const dset = new Set(); for (const v of dir.values()) if (v.n === 1) { for (const [x, y] of [[v.x, v.y], [v.y, v.x]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); } dset.add(v.x + '>' + v.y); }
    const used = new Set(); let filled = 0; const L = lips.top || Object.values(lips)[0];
    const ek = (x, y) => (x < y ? x + '_' + y : y + '_' + x); const walk = (st) => { const stack = [[st]]; while (stack.length) { const path = stack.pop(); const cur = path[path.length - 1]; for (const q of adj.get(cur) || []) { if (used.has(ek(cur, q))) continue; if (q === st && path.length >= 3) return path; if (path.includes(q) || path.length >= 12) continue; stack.push([...path, q]); } } return null; };
    if (process.env.DBGHOLE) for (const [x, ys] of adj) { const p = VP[x]; if (Math.abs(p[0] - 0.025) < 0.012 && Math.abs(p[2] + 0.07) < 0.006 && Math.abs(p[1] - 0.984) < 0.004) console.log('B', x, p.map((v) => v.toFixed(5)).join(','), ys.join(' ')); }
    for (const st of adj.keys()) for (let rep = 0; rep < 3; rep++) { if (!L) break; const loop = walk(st); if (!loop) break;
      let per = 0; for (let i = 0; i < loop.length; i++) per += len(sub(VP[loop[i]], VP[loop[(i + 1) % loop.length]])); if (per > 0.06 * k) break;
      let fw = 0; for (let i = 0; i < loop.length; i++) { const x = loop[i], y = loop[(i + 1) % loop.length]; if (dset.has(x + '>' + y)) fw++; else if (dset.has(y + '>' + x)) fw--; } if (fw > 0) loop.reverse(); // fill runs against the owners
      loop.forEach((q, i) => used.add(ek(q, loop[(i + 1) % loop.length]))); const base = L.lp.pos.length; for (const q of loop) { L.lp.pos.push(VP[q]); L.lp.uv.push(L.lp.uv[0] || [0.5, 0.5]); L.lw.push(VW[q]); }
      for (let i = 1; i < loop.length - 1; i++) L.lp.idx.push(base, base + i, base + i + 1); filled++; }
    if (filled) console.log('  lip holes filled', filled);
  }
  for (const r of Object.keys(lips)) { const { lp, lw } = lips[r]; const sh = shells[r];
    if (lp.idx.length) wd.piece('shell_lip_' + r, lp, lw, r === 'top' ? S.torso.mat : sh.sp.mat, { layer: 1, flatShade: false }); }
  // ---- shell pieces + paint
  const result = {};
  for (const [r, sh] of Object.entries(shells)) {
    const { geo, sp } = sh;
    wd.piece('shell_' + r, geo, sh.W || sh.src.map((i) => wOf(i)), sp.mat, { layer: 1 });
    const soleY = M.bodyMinY + 0.012 * k;
    cvA.tris(geo.uv, geo.idx, geo.pos.map((p) => [...p]), (p) => {
      let s2 = sp; if (r === 'top' && S.arm && Math.abs(p[0]) > uaX + 0.005 * k) s2 = { ...S.torso, ...S.arm, paint: S.arm.paint };
      if (s2.paint) return s2.paint(p, M, k);
      if (r === 'foot' && sp.sole && p[1] < soleY) return mixc(sp.sole, sp.col, 0.1);
      const th = Math.atan2(p[0], p[2]); return fabric(null, p, { col: s2.col, shade: s2.shade, pat: s2.pat, folds: s2.folds ?? 0.4, a: th * 0.15, b: p[1] });
    });
    result[r] = { geo, off: (sp.off ?? 0.006) * k, src: sh.src };
  }
  // tabi / legging cuff: a soft rolled band over the leg|foot junction
  if (shells.leg && shells.foot) for (const side of [1, -1]) {
    const ring = []; for (const [kk, e] of BE.foot) if (BE.leg.has(kk)) { const p = shells.foot.geo.pos[e.a]; if (Math.sign(p[0]) === side) ring.push(lerp3(p, shells.leg.geo.pos[shells.leg.map.get(shells.foot.src[e.a])] ?? p, 0.5)); }
    if (ring.length < 6) continue; const c = mul(ring.reduce(add, [0, 0, 0]), 1 / ring.length); const N = 24; const pts = [], nr = [];
    for (let i = 0; i < N; i++) { const th = (i / N) * TAU; const d = [Math.sin(th), 0, Math.cos(th)]; let rr = 0; for (const p of ring) { const q = sub(p, c); const ang = Math.atan2(q[0], q[2]); let da = Math.abs(((ang - th + Math.PI) % TAU + TAU) % TAU - Math.PI); if (da < 0.4) rr = Math.max(rr, Math.hypot(q[0], q[2])); } pts.push(add(c, mul(d, (rr || 0.04 * k) + 0.0055 * k))); nr.push(d); }
    const g = strip(pts, nr, pts.map(() => [0, 1, 0]), 0.006 * k, 0.0026 * k, { closed: true }); swatchUV(wd, g, S.cuff || mixc(S.foot.col, [120, 120, 130], 0.12));
    const ws = pts.map((p) => { let bi = 0, bd = 9; for (let i = 0; i < nv0; i++) { const d = Math.hypot(b.P[i * 3] - p[0], b.P[i * 3 + 1] - p[1], b.P[i * 3 + 2] - p[2]); if (d < bd) { bd = d; bi = i; } } return wOf(bi); });
    wd.piece('tabi_cuff', g, g.pos.map((_, vi) => ws[Math.floor(vi / 4) % N]), 'cloth_trim', { layer: 1.5 });
  }
  if (result.top) { result.top.neckLoop = []; for (const [, e] of BE.top || []) { const bi = shells.top.src[e.a]; if (fieldAt(pos(bi)) === 'neck') result.top.neckLoop.push(shells.top.geo.pos[e.a]); } }
  result.torso = result.top; result.cuts = { waistCut, neckCut, ankleCut, armLim };
  return result;
}
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Laplacian smoothing on welded ids; boundary + arm vertices pinned; keeps a minimum offset from the skin */
function smoothWelded(P, idx, wids, bp, bn, iters, minOff, pinned) {
  const ids = new Map(); const w = wids.map((x) => { if (!ids.has(x)) ids.set(x, ids.size); return ids.get(x); }); const n = ids.size;
  const nb = Array.from({ length: n }, () => new Set()); const ec = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = w[idx[t + e]], c = w[idx[t + (e + 1) % 3]]; if (a === c) continue; nb[a].add(c); nb[c].add(a); const kk = a < c ? a + '_' + c : c + '_' + a; ec.set(kk, (ec.get(kk) || 0) + 1); }
  const fix = new Uint8Array(n); for (const [kk, c] of ec) if (c === 1) kk.split('_').forEach((x) => (fix[+x] = 1)); w.forEach((id, i) => { if (pinned[i]) fix[id] = 1; });
  let q = new Array(n); const rep = new Array(n); w.forEach((id, i) => { q[id] = P[i]; rep[id] = i; });
  for (let it = 0; it < iters; it++) q = q.map((p, i) => { if (fix[i] || !nb[i].size) return p; let s = [0, 0, 0]; for (const j of nb[i]) s = add(s, q[j]); return lerp3(p, mul(s, 1 / nb[i].size), 0.5); });
  q = q.map((p, id) => { const i = rep[id]; const d = dot(sub(p, bp[i]), bn[i]); return d < minOff ? add(p, mul(bn[i], minOff - d)) : p; });
  return w.map((id) => q[id]);
}

// ---------------------------------------------------------------- torso envelope
function hull2(pts) { const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); }
function rayHull(H, th) { const d = [Math.sin(th), Math.cos(th)]; let best = 0; for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; const e = [b[0] - a[0], b[1] - a[1]]; const den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-12) continue; const t = (a[0] * e[1] - a[1] * e[0]) / den, s = (a[0] * d[1] - a[1] * d[0]) / den; if (s >= -1e-6 && s <= 1 + 1e-6 && t > best) best = t; } return best; }
/** upper concave envelope of (y, r) samples, evaluated at the same ys */
function upperHull(ys, rs) { const pts = ys.map((y, i) => [y, rs[i]]); const h = []; for (const q of pts) { while (h.length >= 2) { const [o, a] = [h[h.length - 2], h[h.length - 1]]; if ((a[0] - o[0]) * (q[1] - o[1]) - (a[1] - o[1]) * (q[0] - o[0]) >= 0) h.pop(); else break; } h.push(q); }
  return ys.map((y) => { for (let i = 0; i < h.length - 1; i++) if (y >= h[i][0] && y <= h[i + 1][0]) return lerp(h[i][1], h[i + 1][1], (y - h[i][0]) / (h[i + 1][0] - h[i][0] || 1)); return rs[ys.indexOf(y)]; }); }

/** radii (K equal angle bins from the axis, th = atan2(x, z)) -> convex outline with corners rounded by sigma degrees -> radii */
export function roundRing(R, sigDeg) {
  const K = R.length; const pts = R.map((r, b) => { const th = (b / K) * TAU; return [Math.sin(th) * r, Math.cos(th) * r]; });
  const H = hull2(pts); const NA = 180; const h = Array.from({ length: NA }, (_, a) => { const ph = (a / NA) * TAU; const u = [Math.sin(ph), Math.cos(ph)]; let m = -1e9; for (const q of H) m = Math.max(m, q[0] * u[0] + q[1] * u[1]); return m; });
  const sg = (sigDeg / 360) * NA; const ker = []; for (let d = -Math.ceil(sg * 2.5); d <= Math.ceil(sg * 2.5); d++) ker.push([d, Math.exp(-0.5 * (d / (sg || 1)) ** 2)]); const ks = ker.reduce((a, [, w]) => a + w, 0);
  const hs = sg > 0 ? h.map((_, a) => ker.reduce((acc, [d, w]) => acc + w * h[((a + d) % NA + NA) % NA], 0) / ks) : h;
  const bnd = hs.map((v, a) => { const ph = (a / NA) * TAU; const dh = (hs[(a + 1) % NA] - hs[(a + NA - 1) % NA]) / (2 * TAU / NA); const u = [Math.sin(ph), Math.cos(ph)], t = [Math.cos(ph), -Math.sin(ph)]; return [u[0] * v + t[0] * dh, u[1] * v + t[1] * dh]; });
  const H2 = hull2(bnd); return R.map((_, b) => rayHull(H2, (b / K) * TAU));
}

export function envelope(C, P, isT, cfg) {
  const M = C.M, k = scaleOf(C); const type = cfg.type || 'female'; const K = 96; const uaX = Math.abs(M.uaL[0]);
  const bust = C.W.get('J_Sec_L_Bust1'); const bustY = bust ? bust[1] : lerp(M.chest[1], M.uchest[1], 0.5);
  const yLo = cfg.waistCut - 0.05 * k, yNeck = cfg.neckCut - 0.035 * k, yArm = M.uaL[1] - 0.06 * k; const dy = 0.01 * k;
  const ys = []; for (let y = yLo; y <= yNeck + 1e-6; y += dy) ys.push(y);
  const xcap0 = uaX - 0.03 * k; const xcapAt = (y) => xcap0 + 0.2 * k * (1 - smooth(yArm - 0.005 * k, yArm + 0.04 * k, y)); const xcap = xcap0; const idT = []; P.forEach((p, i) => { if (isT[i]) idT.push(i); });
  // slice centres
  let zc = ys.map((y) => { let a = 9, b = -9; for (const i of idT) { const p = P[i]; if (Math.abs(p[1] - y) < dy && Math.abs(p[0]) < 0.05 * k) { a = Math.min(a, p[2]); b = Math.max(b, p[2]); } } return a < b ? (a + b) / 2 : NaN; });
  for (let i = 0; i < zc.length; i++) if (isNaN(zc[i])) zc[i] = zc.find((v) => !isNaN(v)) ?? M.chest[2];
  // one straight vertical axis (a slice centre that wanders with the bust/belly makes the front tuck in where it moves back)
  { const srt = zc.slice().sort((a, b) => a - b); const med = srt[srt.length >> 1]; zc = zc.map(() => med); }
  // male: the chest is a plate at upper-chest depth (bust is pulled in; body under the shell is removed)
  const yCap = bustY + 0.07 * k; let capD = Infinity;
  if (type !== 'child') { const si = Math.min(ys.length - 1, Math.max(0, Math.round((yCap - yLo) / dy))); capD = 0; for (const i of idT) { const p = P[i]; if (Math.abs(p[1] - yCap) < dy && Math.abs(p[0]) < 0.06 * k) capD = Math.max(capD, p[2] - zc[si]); } capD += (cfg.cap ?? (type === "male" ? 0.006 : 0.018)) * k; }
  const Rs = ys.map((y, si) => { const pts = []; for (const i of idT) { const p = P[i]; if (Math.abs(p[1] - y) > dy * 0.8 || Math.abs(p[0]) > xcapAt(y)) continue; let z = p[2] - zc[si]; if (type !== 'child' && y < yCap && y > yLo + 0.03 * k) z = Math.min(z, capD); pts.push([p[0], z]); }
    if (pts.length < 3) return null; const H = hull2(pts); return Array.from({ length: K }, (_, b2) => rayHull(H, (b2 / K) * TAU)); });
  for (let i = 0; i < Rs.length; i++) if (!Rs[i]) Rs[i] = Rs[i - 1] || Rs.find((x) => x);
  const yTop = (th) => lerp(yNeck, yArm, Math.sin(th) ** 2);
  const E = ys.map((_, si) => Rs[si].slice());
  const iChest = Math.min(ys.length - 1, Math.max(0, Math.round((bustY - yLo) / dy)));
  for (let b2 = 0; b2 < K; b2++) { const th = (b2 / K) * TAU; const lim = ys.filter((y) => y <= yTop(th) + 1e-6).length; if (lim < 2) continue;
    const env = upperHull(ys.slice(0, lim), Rs.slice(0, lim).map((r) => r[b2])); for (let si = 0; si < lim; si++) E[si][b2] = env[si];
    if (type === 'male') for (let si = 0; si < iChest; si++) E[si][b2] = Math.max(E[si][b2], E[iChest][b2] * (0.94 + 0.06 * si / iChest));
    // kimono padding (hosei): below the fullest point the wrapped front falls straight to the sash, no under-bust tuck
    if (type !== 'child') { let ap = 0; for (let si = 0; si < lim; si++) if (E[si][b2] > E[ap][b2]) ap = si; const fr = (1 + Math.cos(th)) / 2;
      const tw = cfg.padWaist ?? (type === 'male' ? 0.97 : 0.955); const twB = 0.9; const tW = lerp(twB, tw, fr);
      for (let si = 0; si < ap; si++) { const u = si / Math.max(1, ap); E[si][b2] = Math.max(E[si][b2], E[ap][b2] * lerp(tW, 1, Math.pow(u, 0.7))); } } }
  // vertical smoothing, then every ring is made convex with rounded corners (support-function smoothing = Minkowski average of
  // slightly rotated copies; a cel-shaded flat front with hard corners reads as two lobes)
  for (let it = 0; it < (cfg.vSmooth ?? 24); it++) { const c = E.map((r) => r.slice()); for (let si = 1; si < E.length - 1; si++) for (let b2 = 0; b2 < K; b2++) E[si][b2] = (c[si - 1][b2] + 2 * c[si][b2] + c[si + 1][b2]) / 4; }
  for (let si = 0; si < E.length; si++) E[si] = roundRing(E[si], cfg.roundDeg ?? 22);
  if (process.env.DBGENV) console.log("ENV", JSON.stringify({ ys: ys.map((y) => +y.toFixed(3)), zc: zc.map((v) => +v.toFixed(3)), R0: Rs.map((r) => +r[0].toFixed(3)), E0: E.map((r) => +r[0].toFixed(3)), E8: E.map((r) => +r[8].toFixed(3)) }));
  const wFront = cfg.wFront ?? (type === 'male' ? 1 : type === 'child' ? 0.45 : 1), wBack = cfg.wBack ?? (type === 'male' ? 1 : type === 'child' ? 0.3 : 0.7);
  const flatten = (cfg.flatten ?? (type === 'male' ? 0.05 : type === 'child' ? 0 : 0.06)) * k;
  for (const i of idT) { const p = P[i]; if (p[1] < yLo || p[1] > yNeck + 0.01 * k) continue; const f = Math.max(0, Math.min(ys.length - 1, (p[1] - yLo) / dy)); const si = Math.min(ys.length - 2, Math.floor(f)), sf = clamp01(f - si);
    const z0 = lerp(zc[si], zc[si + 1], sf); const x = p[0], z = p[2] - z0; const r = Math.hypot(x, z); if (r < 1e-5) continue; let th = Math.atan2(x, z); if (th < 0) th += TAU;
    const bf = (th / TAU) * K; const b0 = Math.floor(bf) % K, b1 = (b0 + 1) % K, bt = bf - Math.floor(bf);
    const e = lerp(lerp(E[si][b0], E[si][b1], bt), lerp(E[si + 1][b0], E[si + 1][b1], bt), sf);
    const yt = yTop(th); const hy = 1 - smooth(Math.min(yt - 0.012 * k, Math.max(yt - 0.05 * k, yCap + 0.01 * k)), yt + 0.01 * k, p[1]); const w = lerp(wBack, wFront, (1 + Math.cos(th)) / 2) * hy * (Math.abs(x) > xcapAt(p[1]) ? 1 - smooth(xcapAt(p[1]), xcapAt(p[1]) + 0.03 * k, Math.abs(x)) : 1);
    let rn = lerp(r, e, w); rn = Math.max(rn, r - flatten);
    P[i] = [x * rn / r, p[1], z0 + z * rn / r]; }
  if (type === 'male') for (const i of idT) { const p = P[i]; if (p[1] < yArm - 0.03 * k) continue; const ax = Math.abs(p[0]); const s = smooth(0.05 * k, 0.1 * k, ax) * smooth(yArm - 0.03 * k, yArm + 0.02 * k, p[1]); P[i] = [p[0] + Math.sign(p[0]) * 0.008 * k * s, p[1] + 0.003 * k * s, p[2]]; }
  return P;
}
