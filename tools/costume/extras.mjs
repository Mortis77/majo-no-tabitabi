// Character add-ons with secondary chains where they should swing (all original procedural geometry).
import { add, sub, mul, dot, cross, len, norm, lerp, lerp3, clamp01, smooth, rotAxis, bodyProfile, sampleProfile, nearestWeights, W1, wmix,
  strip, loft, tube, ellipsoid, merge, grid, Wardrobe } from './garment.mjs';
import { swatchUV, rayHit, rayNear, hairPoints, scaleOf } from './outfit.mjs';
const TAU = Math.PI * 2;

function faceTop(C) { let top = -9; for (const nd of C.root.listNodes()) { if (!/_face$/.test(nd.getName()) || !nd.getMesh()) continue; for (const p of nd.getMesh().listPrimitives()) { if (p.getMaterial()?.getName() !== 'Face') continue; const a = p.getAttribute('POSITION').getArray(); for (let i = 1; i < a.length; i += 3) top = Math.max(top, a[i]); } } return top; }
function chin(C) { let best = null; for (const nd of C.root.listNodes()) { if (!/_face$/.test(nd.getName()) || !nd.getMesh()) continue; for (const p of nd.getMesh().listPrimitives()) { if (p.getMaterial()?.getName() !== 'Face') continue; const a = p.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i]) < 0.01 && (!best || a[i + 1] < best[1])) best = [a[i], a[i + 1], a[i + 2]]; } } return best; }
const headSlice = (pts, c, y, band) => { const R = new Float32Array(48); for (const p of pts) { if (Math.abs(p[1] - y) > band) continue; const x = p[0] - c[0], z = p[2] - c[2]; let th = Math.atan2(x, z); if (th < 0) th += TAU; const b = Math.floor(th / TAU * 48) % 48; R[b] = Math.max(R[b], Math.hypot(x, z)); } const o = Array.from(R, (_, i) => Math.max(R[i], R[(i + 1) % 48], R[(i + 47) % 48])); return Array.from(o, (_, i) => Math.max(o[i], (o[(i + 1) % 48] + o[(i + 47) % 48]) / 2)); };
const prof = (R, th) => { const K = R.length; const t = (((th / TAU) % 1) + 1) % 1 * K; const i = Math.floor(t) % K; return lerp(R[i], R[(i + 1) % K], t - Math.floor(t)); };

export function buildExtras(ctx, list) {
  const { C, M, k, wd, shells } = ctx; const J = (n) => C.ji(n); const rig = (n) => W1(J(n));
  const add1 = (name, geo, col, w, mat = 'cloth_trim', layer = null) => { swatchUV(wd, geo, col); wd.piece(name, geo, typeof w === 'function' ? geo.pos.map(w) : Array.isArray(w) ? w : geo.pos.map(() => w), mat, { layer }); };
  const bodyBackZ = (y) => { let z = 9; const { P, nv } = C.body; for (let i = 0; i < nv; i++) if (Math.abs(P[i * 3 + 1] - y) < 0.03 && Math.abs(P[i * 3]) < 0.05) z = Math.min(z, P[i * 3 + 2]); return z; };
  const hp = hairPoints(C); const headC = M.head;
  for (const a of list) {
    switch (a.type) {
      case 'tails': { // fluffy fox tails from the small of the back, one chain each
        const n = a.n || 1; const base = [0, M.hips[1] - 0.02 * k, bodyBackZ(M.hips[1]) + 0.02 * k]; const L = a.len * k, r0 = a.r * k;
        for (let i = 0; i < n; i++) {
          const fan = n === 1 ? 0.45 : (i - (n - 1) / 2) * ((a.spread || 1.5) / Math.max(1, n - 1)); const lenF = n === 1 ? 1 : 1 - 0.12 * Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
          const S = 18; const pts = [], rr = [];
          const lift = n > 1 ? (i % 2 ? 0.32 : -0.06) + 0.05 * Math.abs(i - (n - 1) / 2) : 0; const bx = n > 1 ? (i - (n - 1) / 2) * 0.014 * k : 0;
          for (let j = 0; j <= S; j++) { const s = j / S; let p = [0, L * lenF * (-0.18 * s + 0.95 * s * s), -L * lenF * (0.62 * s + 0.12 * s * s) - 0.01 * k]; p = rotAxis(p, [1, 0, 0], lift); p = rotAxis(p, [0, 0, -1], fan); pts.push(add(add(base, [bx, 0, 0]), p)); rr.push(r0 * (0.3 * (1 - s) + 1.15 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.97)), 0.5)) + 0.003); }
          const at = (s) => pts[Math.round(s * S)]; const ids = wd.chain('Tail', i + 1, 'J_Bip_C_Hips', [at(0.1), at(0.45), at(0.75), at(1)], { kind: 'tail' });
          const params = [0.1, 0.45, 0.75, 1]; const cut = 15;
          const mk = (sl, rs, col) => { const g = tube(sl, rs, 14, [1, 0, 0]); const K = 14; swatchUV(wd, g, col); return g; };
          const g1 = mk(pts.slice(0, cut + 1), rr.slice(0, cut + 1), a.colour), g2 = mk(pts.slice(cut), rr.slice(cut).map((r) => r * 1.01), a.tip);
          const wOf = (off) => (p, vi) => { const ring = Math.min(Math.floor(vi / 14), (vi < 14 * 40 ? 99 : 0)); let best = 0, bd = 9; pts.forEach((q, j) => { const d = len(sub(q, p)); if (d < bd) { bd = d; best = j; } }); const s = best / S; return s < 0.1 ? wmix(rig('J_Bip_C_Hips'), W1(ids[0]), s / 0.1) : Wardrobe.along(ids, params, s); };
          wd.piece('fox_tail', g1, g1.pos.map(wOf(0)), 'cloth_trim'); wd.piece('fox_tail_tip', g2, g2.pos.map(wOf(cut)), 'cloth_trim');
        }
        break; }
      case 'mask': { // fox mask worn on the side of the head
        const sg = a.side || -1; const y = headC[1] + 0.085 * k; let xs = 0; for (const p of hp) if (Math.abs(p[1] - y) < 0.03 && Math.abs(p[2] - headC[2]) < 0.04 && sg * p[0] > xs) xs = sg * p[0];
        const c = [sg * (xs + 0.012 * k), y, headC[2] + 0.01 * k]; const n = norm([sg, 0.15, 0.35]); const e1 = norm(cross([0, 1, 0], n)), e2 = norm(cross(n, e1));
        const face = ellipsoid(c, [0.052 * k, 0.07 * k, 0.022 * k], 14, 9, [e1, e2, n]); add1('fox_mask', face, a.colour || [250, 248, 240], rig('J_Bip_C_Head'));
        for (const s2 of [1, -1]) { const ec = add(add(c, mul(e1, s2 * 0.034 * k)), mul(e2, 0.06 * k)); add1('fox_mask_ear', loft([0, 0.5, 1].map((t) => ({ c: add(ec, mul(e2, t * 0.035 * k)), u: e1, v: n, ru: (1 - t) * 0.016 * k + 0.002, rv: (1 - t) * 0.008 * k + 0.001 })), 8), a.colour || [250, 248, 240], rig('J_Bip_C_Head')); }
        const red = a.mark || [210, 40, 40];
        for (const s2 of [1, -1]) { const p0 = add(add(c, mul(n, 0.021 * k)), mul(e1, s2 * 0.022 * k)); const pts = [add(p0, mul(e2, 0.012 * k)), add(add(p0, mul(e1, s2 * 0.012 * k)), mul(e2, -0.004 * k)), add(add(p0, mul(e1, s2 * 0.02 * k)), mul(e2, -0.012 * k))];
          add1('fox_mask_mark', strip(pts, pts.map(() => n), pts.map(() => norm(add(e2, mul(e1, s2)))), 0.004 * k, 0.0015 * k), red, rig('J_Bip_C_Head')); }
        add1('fox_mask_mark', ellipsoid(add(add(c, mul(n, 0.02 * k)), mul(e2, 0.035 * k)), [0.006 * k, 0.004 * k, 0.003 * k], 8, 5, [e1, e2, n]), red, rig('J_Bip_C_Head'));
        // cord round the head
        break; }
      case 'hatBack': { // sugegasa hanging on the back on a cord
        const y = M.uchest[1] - 0.03 * k; const c = [0, y, bodyBackZ(y) - (a.gap || 0.07) * k]; const ax = norm([0, 0.25, -1]); const Rr = (a.r || 0.21) * k, h = 0.075 * k; const u = norm(cross(ax, [1, 0, 0])), v = [1, 0, 0];
        const secs = [0, 0.15, 0.4, 0.7, 1].map((t) => ({ c: add(c, mul(ax, h * (1 - t))), u, v, ru: Math.max(0.004, Rr * t), rv: Math.max(0.004, Rr * t) })); secs.push({ c: add(c, mul(ax, -0.006 * k)), u, v, ru: Rr * 0.97, rv: Rr * 0.97 });
        const g = loft(secs, 28); add1('hat_back', g, a.colour || [196, 166, 104], rig('J_Bip_C_UpperChest'));
        const nk = M.neck; const cord = []; for (let i = 0; i <= 16; i++) { const th = Math.PI * (0.25 + 1.5 * i / 16); cord.push([Math.sin(th) * 0.075 * k, nk[1] - 0.03 * k - 0.03 * k * Math.cos(th), nk[2] + Math.cos(th) * 0.07 * k]); }
        add1('hat_cord', tube([add(c, [0.06 * k, 0.05 * k, 0.02 * k]), ...cord, add(c, [-0.06 * k, 0.05 * k, 0.02 * k])], new Array(19).fill(0.003 * k), 6), a.cord || [120, 60, 40], rig('J_Bip_C_UpperChest'));
        break; }
      case 'kasa': { // wide straw hat worn on the head
        let top = -9; for (const p of hp) top = Math.max(top, p[1]); top = Math.max(top, faceTop(C)); const c = [0, top - 0.035 * k, headC[2] - 0.01 * k]; const Rr = (a.r || 0.25) * k, h = 0.1 * k;
        const secs = [0, 0.12, 0.35, 0.65, 1].map((t) => ({ c: add(c, [0, h * (1 - t), 0]), u: [1, 0, 0], v: [0, 0, 1], ru: Math.max(0.004, Rr * t), rv: Math.max(0.004, Rr * t) })); secs.push({ c: add(c, [0, -0.008 * k, 0]), u: [1, 0, 0], v: [0, 0, 1], ru: Rr * 0.97, rv: Rr * 0.97 });
        add1('kasa', loft(secs, 32), a.colour || [180, 150, 96], rig('J_Bip_C_Head'));
        add1('kasa_band', tube(Array.from({ length: 33 }, (_, i) => add(c, [Math.sin(i / 32 * TAU) * Rr * 0.4, h * 0.6, Math.cos(i / 32 * TAU) * Rr * 0.4])), new Array(33).fill(0.006 * k), 6), a.band || [90, 60, 40], rig('J_Bip_C_Head'));
        break; }
      case 'beard': { // long elder's beard on its own chain
        const ch = chin(C) || add(headC, [0, -0.02 * k, 0.06 * k]); const L = (a.len || 0.17) * k; const top = add(ch, [0, 0.012 * k, -0.004 * k]);
        const pts = Array.from({ length: 9 }, (_, i) => { const t = i / 8; return add(top, [0, -L * t, (0.02 * t - 0.035 * t * t) * k + 0.012 * k * Math.sin(Math.PI * t)]); });
        const ids = wd.chain('Beard', 1, 'J_Bip_C_Head', [pts[1], pts[4], pts[7], pts[8]], { kind: 'beard' });
        const secs = pts.map((p, i) => { const t = i / 8; return { c: p, u: [1, 0, 0], v: [0, 0, 1], ru: (0.034 * (1 - t) + 0.006) * k * (i === 0 ? 1.1 : 1), rv: (0.016 * (1 - t) + 0.004) * k }; });
        const g = loft(secs, 12); add1('beard', g, a.colour || [214, 212, 206], (p) => { const t = clamp01((top[1] - p[1]) / L); return t < 0.125 ? rig('J_Bip_C_Head') : Wardrobe.along(ids, [0.125, 0.5, 0.875, 1], t); });
        for (const s2 of [1, -1]) { const m0 = add(ch, [s2 * 0.004 * k, 0.03 * k, 0.012 * k]); add1('moustache', tube([m0, add(m0, [s2 * 0.018 * k, -0.004 * k, -0.002 * k]), add(m0, [s2 * 0.03 * k, -0.02 * k, -0.008 * k])], [0.005 * k, 0.005 * k, 0.003 * k], 8), a.colour || [214, 212, 206], rig('J_Bip_C_Head')); }
        break; }
      case 'hammer': { const sg = a.side || -1; const top = [sg * 0.13 * k, M.hips[1] + 0.05 * k, M.hips[2] + 0.07 * k]; const bot = add(top, [sg * 0.03 * k, -0.27 * k, -0.02 * k]);
        add1('hammer_handle', tube([top, bot], [0.011 * k, 0.012 * k], 8), [150, 110, 70], rig('J_Bip_C_Hips'));
        const hc = add(top, [0, 0.02 * k, 0]); add1('hammer_head', loft([{ c: add(hc, [0, 0, -0.05 * k]), u: [1, 0, 0], v: [0, 1, 0], ru: 0.022 * k, rv: 0.022 * k }, { c: add(hc, [0, 0, 0.05 * k]), u: [1, 0, 0], v: [0, 1, 0], ru: 0.02 * k, rv: 0.02 * k }], 6), [96, 98, 104], rig('J_Bip_C_Hips'));
        break; }
      case 'sticks': { const z = bodyBackZ(M.hips[1]) - 0.03 * k; for (const s2 of [1, -1]) { const a0 = [s2 * 0.1 * k, M.hips[1] + 0.12 * k, z], a1 = [-s2 * 0.06 * k, M.hips[1] - 0.2 * k, z - 0.01 * k];
          add1('drumstick', tube([a0, a1], [0.009 * k, 0.007 * k], 8), [214, 176, 120], rig('J_Bip_C_Hips')); add1('drumstick_tip', ellipsoid(a0, [0.012 * k, 0.012 * k, 0.012 * k], 8, 5), [190, 40, 34], rig('J_Bip_C_Hips')); }
        add1('stick_holster', tube([[0.08 * k, M.hips[1] - 0.06 * k, z + 0.006 * k], [-0.08 * k, M.hips[1] - 0.09 * k, z + 0.006 * k]], [0.016 * k, 0.016 * k], 8, [0, 0, 1], 0.5), a.holster || [70, 40, 30], rig('J_Bip_C_Hips'));
        break; }
      case 'pouch': { const sg = a.side || -1; const th = sg * 1.9; const r = (ctx.sash ? sampleProfile(ctx.sash.prof, th) : 0.15) + 0.02 * k; const c = [Math.sin(th) * r, M.hips[1] - 0.02 * k, M.hips[2] + Math.cos(th) * r]; const n = norm([Math.sin(th), 0, Math.cos(th)]); const e1 = norm(cross([0, 1, 0], n));
        add1('tool_pouch', ellipsoid(c, [0.05 * k, 0.055 * k, 0.025 * k], 10, 6, [e1, [0, 1, 0], n]), a.colour || [120, 84, 50], rig('J_Bip_C_Hips'));
        add1('tool_pouch_flap', ellipsoid(add(c, [0, 0.03 * k, 0.004 * k]), [0.052 * k, 0.025 * k, 0.026 * k], 10, 6, [e1, [0, 1, 0], n]), a.flap || [90, 60, 36], rig('J_Bip_C_Hips'));
        for (const dx of [-0.02, 0.015]) add1('tool_handle', tube([add(c, add(mul(e1, dx * k), [0, 0.04 * k, 0])), add(c, add(mul(e1, dx * k), [0, 0.1 * k, 0]))], [0.005 * k, 0.005 * k], 6), [150, 120, 80], rig('J_Bip_C_Hips'));
        break; }
      case 'headband': { // hachimaki fitted to the actual hair surface, knot + two tails on chains
        const y = headC[1] + (a.y || 0.075) * k; const R = headSlice(hp.concat(facePts(C)), headC, y, 0.012 * k); const N = 40; const pts = [], nr = [];
        for (let i = 0; i < N; i++) { const th = i / N * TAU; const r = prof(R, th) + 0.006 * k; pts.push([headC[0] + Math.sin(th) * r, y + 0.012 * k * Math.cos(th), headC[2] + Math.cos(th) * r]); nr.push([Math.sin(th), 0, Math.cos(th)]); }
        add1('headband', strip(pts, nr, pts.map(() => [0, 1, 0]), 0.013 * k, 0.003 * k, { closed: true }), a.colour, rig('J_Bip_C_Head'));
        const knot = add(pts[N / 2], [0, 0, -0.012 * k]); add1('headband_knot', ellipsoid(knot, [0.016 * k, 0.014 * k, 0.012 * k], 8, 5), a.colour, rig('J_Bip_C_Head'));
        for (const s2 of [1, -1]) { const tp = Array.from({ length: 7 }, (_, i) => { const t = i / 6; return add(knot, [s2 * (0.01 + 0.035 * t) * k, -(0.13 * t) * k, -(0.01 + 0.02 * t) * k]); });
          const ids = wd.chain('Headband' + (s2 > 0 ? 'L' : 'R'), 1, 'J_Bip_C_Head', [tp[0], tp[3], tp[5], tp[6]], { kind: 'tail' });
          const g = strip(tp, tp.map(() => [0, 0, -1]), tp.map((p, i) => norm(cross([0, 0, -1], sub(tp[Math.min(i + 1, 6)], tp[Math.max(i - 1, 0)])))), 0.012 * k, 0.0025 * k);
          add1('headband_tail', g, a.colour, (p) => Wardrobe.along(ids, [0, 0.5, 5 / 6, 1], clamp01((knot[1] - p[1]) / (0.13 * k)))); }
        break; }
      case 'tasuki': { // cord tying the sleeves back, crossing on the back
        if (!shells.torso) break; const zc = M.uchest[2];
        for (const s2 of [1, -1]) { const ctrl = [[s2 * 0.075, M.uchest[1] + 0.02, 0.5], [s2 * 0.08, M.uaL[1] + 0.03, Math.PI * 0.5 * 0 + s2 * 1.4], [s2 * 0.03, M.uchest[1] - 0.02, null], [-s2 * 0.12, M.chest[1] - 0.02, null]];
          const pts = []; const nr = [];
          const path = [[s2 * 0.35, M.uchest[1] + 0.03 * k], [s2 * 1.2, M.uaL[1] + 0.02 * k], [s2 * 2.2, M.uaL[1] - 0.01 * k], [s2 * 2.8, M.uchest[1] - 0.02 * k], [Math.PI, M.chest[1] + 0.02 * k], [Math.PI + s2 * 0.6, M.chest[1] - 0.02 * k], [-s2 * 2.0, M.chest[1] - 0.03 * k], [-s2 * 1.6, M.chest[1] - 0.035 * k]];
          for (let i = 0; i < path.length - 1; i++) for (let j = 0; j < 4; j++) { const t = j / 4; const th = lerp(path[i][0], path[i + 1][0], t), yy = lerp(path[i][1], path[i + 1][1], t); const d = [Math.sin(th), 0, Math.cos(th)]; const o = [0, yy, zc]; let h = rayNear(shells.torso.geo, o, d); if (!(h > 0 && h < 0.16 * k)) h = rayHit(shells.torso.geo, o, d, 0.16 * k); pts.push(add(o, mul(d, (h > 0 ? h : 0.12 * k) + 0.009 * k))); nr.push(d); }
          const g = strip(pts, nr, pts.map((p, i) => norm(cross(nr[i], sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])))), 0.006 * k, 0.003 * k);
          wd.pushOut(g.pos, 5, 0.006 * k, { skip: (n) => /^sleeve/.test(n), iters: 3 }); const tB = wd.weightsBelow(g.pos, 5, { skip: (n) => /^sleeve/.test(n), reach: 0.05 });
          add1('tasuki', g, a.colour, g.pos.map((p, vi) => tB[vi] || nearestWeights(C, p, { filter: (bn) => /Chest|Shoulder|Spine/.test(bn), k: 4 })), 'cloth_trim', 5); }
        break; }
      case 'cape': { // shawl / frost cape over the shoulders, open front, 3 chains at the back
        const zc = M.uchest[2]; const y0 = shells.cuts.neckCut - 0.004 * k, y1 = Math.max(a.hemY ? a.hemY(M, k) : M.chest[1], M.uaL[1] - 0.075 * k); const xcap = Math.abs(M.uaL[0]) + (a.xcap ?? 0.015) * k; // r2: short shoulder capelet that ends above the sleeve bags
        const filt = (bn) => /Neck|UpperChest|Chest|Spine|Shoulder|UpperArm/.test(bn); const t0 = a.open || 0.45, t1 = TAU - (a.open || 0.45); const cols = 49, rows = 17;
        const profs = Array.from({ length: rows }, (_, i) => { const yy = lerp(y0, Math.max(y1, M.uaL[1] - 0.02 * k), Math.min(1, i / (rows - 1) * 1.6)); return wd.stack.profile(yy, 72, { zc, xcap, band: 0.02, base: bodyProfile(C, yy, 72, { zc, filter: filt, xcap, band: 0.02 }) }); });
        const env = profs.map((R) => R); for (let i = 1; i < rows; i++) env[i] = env[i].map((r, j) => Math.max(r, env[i - 1][j] * (1 + 0.02))); // drape: never narrower going down
        const geo = grid(rows, cols, (i, j) => { const th = lerp(t0, t1, j / (cols - 1)); const y = lerp(y0, y1, i / (rows - 1)); const r = prof(env[i], th) + (a.off || 0.02) * k * (0.6 + 0.4 * i / (rows - 1)); return { p: [Math.sin(th) * r, y, zc + Math.cos(th) * r], u: j / (cols - 1), v: i / (rows - 1) }; });
        const noSl = {}; wd.pushOut(geo.pos, 6, (a.sep ?? 0.01) * k, noSl);
        { const cs = (a.sep ?? 0.01) * k; for (let it = 0; it < 2; it++) { const q = geo.pos.map((p) => p.slice()); for (let i = 1; i < rows - 1; i++) for (let j = 1; j < cols - 1; j++) { const v = i * cols + j; geo.pos[v] = lerp3(q[v], mul(add(add(q[v - 1], q[v + 1]), add(q[v - cols], q[v + cols])), 0.25), 0.5); } wd.pushOut(geo.pos, 6, cs, { iters: 1, ...noSl }); } }
        const chs = [-0.7, 0, 0.7].map((dt, ci) => { const th = Math.PI + dt; const pts = [0.35, 0.65, 0.9, 1].map((v) => { const i = Math.round(v * (rows - 1)); const j = Math.round((th - t0) / (t1 - t0) * (cols - 1)); const p = geo.pos[i * cols + j]; return [p[0] * 0.95, p[1], zc + (p[2] - zc) * 0.95]; }); return { th, ids: wd.chain(a.part || 'Cape', ci + 1, 'J_Bip_C_UpperChest', pts, { kind: 'cape' }) }; });
        const wB = wd.weightsBelow(geo.pos, 6, { skip: (n) => /^sleeve_(cord|tsuyu)/.test(n), reach: 0.05 });
        const w = geo.pos.map((p, vi) => { const i = Math.floor(vi / cols), j = vi % cols; const v = i / (rows - 1); const bw = wB[vi] || nearestWeights(C, p, { filter: filt, k: 5 }); if (v < 0.35) return bw; const th = lerp(t0, t1, j / (cols - 1));
          const x = clamp01((th - chs[0].th) / (chs[2].th - chs[0].th)) * 2; const ai = Math.min(1, Math.floor(x)); const f = x - ai; const cw = wmix(Wardrobe.along(chs[ai].ids, [0.35, 0.65, 0.9, 1], v), Wardrobe.along(chs[ai + 1].ids, [0.35, 0.65, 0.9, 1], v), f);
          const side = Math.abs(Math.sin(th)) > 0.6 ? 0.35 : 1; return wmix(bw, cw, smooth(0.35, 0.6, v) * side); });
        const r = a.rect; const ins = 3 / wd.cvB.w; const rr = [r[0] + ins, r[1] + ins, r[2] - ins, r[3] - ins]; geo.uv = geo.uv.map(([u, v]) => [lerp(rr[0], rr[2], u), lerp(rr[1], rr[3], v)]);
        wd.cvB.rect(rr, (lu, lv) => a.paint(lu, lv, { t0: 0, span: TAU, pleatW: () => 0.5 })); const hm = []; for (let j = 0; j < cols; j++) hm.push(j, (rows - 1) * cols + j); for (let i = 0; i < rows; i++) hm.push(i * cols, i * cols + cols - 1); wd.piece('cape', geo, w, 'cloth_coat', { layer: 6, hems: hm });
        if (a.edge) { for (const jc of [0, cols - 1]) { const pts = Array.from({ length: rows }, (_, i) => geo.pos[i * cols + jc]); const th = lerp(t0, t1, jc / (cols - 1)); const n = [Math.sin(th), 0, Math.cos(th)];
          const g = strip(pts.map((p) => add(p, mul(n, 0.0055 * k))), pts.map(() => n), pts.map((p, i) => norm(cross(n, sub(pts[Math.min(i + 1, rows - 1)], pts[Math.max(i - 1, 0)])))), 0.008 * k, 0.0015 * k);
          add1('cape_edge', g, a.edge, g.pos.map((_, vi) => w[Math.min(rows - 1, Math.floor(vi / 4)) * cols + jc]), 'cloth_trim', 6.5); } }
        break; }
      default: throw new Error('extra ' + a.type);
    }
  }
}
function facePts(C) { const pts = []; for (const nd of C.root.listNodes()) { if (!/_face$/.test(nd.getName()) || !nd.getMesh()) continue; for (const p of nd.getMesh().listPrimitives()) { const a = p.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) pts.push([a[i], a[i + 1], a[i + 2]]); } } return pts; }
