// 灯里's hair bow and the two tail ties — the design (built by tools/sculpt/figure/build-hair.mjs with akari_hair_lib.mjs).
// BOW: a big vermilion bow behind the crown. Each wing is a real loop of ribbon (outer and inner layer joined by the fold
// at its end, puffed apart in the middle, pinched into the knot), the knot is a band wrapped round the pinch, two tails
// hang from under the knot with notched (swallow-tail) ends. Soft creases run along the loops toward the knot; her right
// wing is a little smaller and droops a little (a hand-tied bow is never mirror-true).
// TIES: at each tail root a short white paper wrap bound by a red cord with a small knot and two short ends.
// Bow frame: origin O on the back of the crown, X = her left, Y = up the bow's face, Z = out of the head (away from it).
import { curve, sweep, sheet, V, sm } from './akari_hair_lib.mjs';

export const BOW = {
  at: [180, 29, 0.037],
  size: 1.12,                          // the wings and knot               // radial probe from the cranium centre (az, el, height above the skin) -> O
  thick: 0.0032,
  tiltBack: 15,                        // revision 2: the loops lean back and down onto the skull (deg about the bow's X)
  droop: 0.009,                        // the wing ends hang a little (m at the fold)
  wings: [
    // her left wing; path in the bow frame (x, y, z): out along the outer layer, the fold, back along the inner layer
    { sd: 1, scale: 1, lift: 0.6, pts: [[0.006, 0.0, 0.003], [0.027, 0.006, 0.014], [0.056, 0.015, 0.0195], [0.083, 0.022, 0.0155], [0.099, 0.025, 0.004], [0.095, 0.022, -0.007], [0.07, 0.014, -0.0115], [0.04, 0.007, -0.0105], [0.016, 0.002, -0.005]],
      w: [0.017, 0.031, 0.047, 0.058, 0.062, 0.058, 0.047, 0.032, 0.019] },
    { sd: -1, scale: 0.95, lift: 0.4, pts: null, w: null },
  ],
  knot: { rx: 0.0118, rz: 0.0096, w: 0.0215, th: 0.003, tilt: -6 },
  tails: [
    // centreline relative to O in WORLD axes (hanging), width at top / bottom, notch depth (m), twist (deg)
    { sd: 1, pts: [[0.006, -0.008, -0.008], [0.014, -0.045, -0.02], [0.026, -0.088, -0.024], [0.036, -0.122, -0.021], [0.04, -0.138, -0.018]], w: [0.021, 0.027], notch: 0.011, twist: 75 },
    { sd: -1, pts: [[-0.005, -0.008, -0.008], [-0.012, -0.043, -0.019], [-0.021, -0.082, -0.023], [-0.028, -0.112, -0.021], [-0.031, -0.127, -0.019]], w: [0.021, 0.026], notch: 0.01, twist: -88 },
  ],
};

/** a band section (K = 12) across the ribbon's width (u, along the frame's up) and thickness (b), with soft creases */
function bandSection(w, th, crease = 0, phase = 0) {
  const out = [], n = 4;
  const cr = (s) => crease * Math.sin(s * Math.PI * 1.5 + phase);
  for (let i = 0; i < n; i++) { const s = -1 + (2 * i) / (n - 1); out.push([th / 2 + cr(s), s * w / 2, 1, s]); }
  out.push([cr(1), w / 2 + th * 0.35, 0, 1]);
  for (let i = n - 1; i >= 0; i--) { const s = -1 + (2 * i) / (n - 1); out.push([-th / 2 + cr(s), s * w / 2, -1, s]); }
  out.push([cr(-1), -w / 2 - th * 0.35, 0, -1]);
  return out;
}

/** frame: { O, X, Y, Z } (world). -> [{ name, mesh, kind: 'loop' | 'knot' | 'tail', sd }] */
export function bowMeshes(F) {
  const toW = (p) => V.add(F.O, V.add(V.mul(F.X, p[0]), V.add(V.mul(F.Y, p[1]), V.mul(F.Z, p[2]))));
  // the wings' frame: Y leaned back toward the skull by tiltBack (the upper loop no longer stands up like a fin)
  const ta = (BOW.tiltBack || 0) * Math.PI / 180, Yw = V.nrm(V.add(V.mul(F.Y, Math.cos(ta)), V.mul(F.Z, Math.sin(ta)))), Zw = V.nrm(V.sub(V.mul(F.Z, Math.cos(ta)), V.mul(F.Y, Math.sin(ta))));
  const toWw = (p) => V.add(F.O, V.add(V.mul(F.X, p[0]), V.add(V.mul(Yw, p[1]), V.mul(Zw, p[2]))));
  const out = [];
  const left = BOW.wings[0];
  for (const wg of BOW.wings) {
    const k = wg.scale * BOW.size;
    const pts = (wg.pts || left.pts).map((p) => [p[0] * k * (wg.sd), p[1] * k * wg.lift - (BOW.droop || 0) * (wg.sd < 0 ? 1.3 : 1) * sm(0.02, 0.1, p[0]), p[2] * k]);
    const w = (wg.w || left.w).map((v) => v * k);
    const c = curve(pts.map(toWw), [w], { closed: true, per: 10 });
    const mesh = sweep({ curve: c, rings: 22, up: () => Yw,
      section: (t, sc) => bandSection(sc[0], BOW.thick, 0.0016 * sm(0.0, 0.3, Math.min(t, 1 - t)) , wg.sd * 0.9 + t * 3.0) });
    out.push({ name: 'wing' + (wg.sd > 0 ? 'L' : 'R'), mesh, kind: 'loop', sd: wg.sd });
  }
  // knot: a band wrapped about the pinch (closed path in the X-Z plane), tilted a little
  const k = { ...BOW.knot, rx: BOW.knot.rx * BOW.size, rz: BOW.knot.rz * BOW.size, w: BOW.knot.w * BOW.size }, kp = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; kp.push([Math.cos(a) * k.rx, Math.cos(a) * k.rx * Math.sin(k.tilt * Math.PI / 180), Math.sin(a) * k.rz]); }
  const kc = curve(kp.map(toW), [], { closed: true, per: 6 });
  out.push({ name: 'knot', mesh: sweep({ curve: kc, rings: 12, up: () => F.Y, section: (t) => bandSection(k.w, k.th, 0.0011, t * 9) }), kind: 'knot', sd: 0 });
  // tails: sheets with thickness, swallow-tail notch at the end
  for (const tl of BOW.tails) {
    const cpts = tl.pts.map((p) => V.add(F.O, p));
    const c = curve(cpts, [], { per: 12 });
    const at = (v) => { const s = c.L * v; const P = c.P, cum = c.cum; let i = 0; while (i < P.length - 2 && cum[i + 1] < s) i++; const f = (s - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i]); return { p: V.lerp(P[i], P[i + 1], f), T: V.nrm(V.sub(P[i + 1], P[i])) }; };
    const across = (v) => { const tw = (tl.twist * v) * Math.PI / 180, x = [Math.cos(tw), 0, Math.sin(tw)]; return x; };
    const geo = (u, v) => {
      const vm = 1 - (tl.notch / c.L) * (1 - Math.abs(2 * u - 1));      // the notch: the middle is shorter
      const vv = v * vm, a = at(vv), wv = tl.w[0] + (tl.w[1] - tl.w[0]) * vv;
      let A = across(vv); A = V.nrm(V.sub(A, V.mul(a.T, V.dot(A, a.T))));
      const sag = 0.0018 * Math.cos((2 * u - 1) * Math.PI) * sm(0.1, 0.5, vv);  // a soft fold down the middle
      let N = V.nrm(V.cross(A, a.T)); if (N[2] > 0) N = V.mul(N, -1);
      return { p: V.add(V.add(a.p, V.mul(A, (u - 0.5) * wv)), V.mul(N, sag)), N };
    };
    const mesh = sheet({ nu: 3, nv: 11, P: (u, v) => geo(u, v).p, N: (u, v) => geo(u, v).N, th: () => 0.0026 });
    out.push({ name: 'tail' + (tl.sd > 0 ? 'L' : 'R'), mesh, kind: 'tail', sd: tl.sd });
  }
  return out;
}

/**
 * The tie at a tail root. tie = { c (centre), T (axis, pointing down the tail), B (an across direction) }, wrap / cord from
 * akari_hair.mjs TAIL. -> [{ name, mesh, kind: 'paper' | 'cord' }]
 */
export function tieMeshes(tie, wrap, cord, sd) {
  const out = [], { c, T } = tie;
  const B = V.nrm(V.sub(tie.B, V.mul(T, V.dot(tie.B, T)))), U = V.cross(T, B);
  const ring = (s, r, a) => V.add(V.add(c, V.mul(T, s)), V.add(V.mul(B, Math.cos(a) * r), V.mul(U, Math.sin(a) * r)));
  // paper wrap: a short tube of paper, slightly flared at both ends, with two shallow fold lines
  out.push({ name: 'paper', kind: 'paper', mesh: sheet({ nu: 14, nv: 2, closedU: true,
    P: (u, v) => { const s = wrap.from + (wrap.to - wrap.from) * v, a = u * Math.PI * 2; const fl = 1 + 0.06 * Math.pow(Math.abs(2 * v - 1), 3) + 0.025 * Math.max(0, Math.cos(a * 3 + 0.6)); return ring(s, wrap.r * fl, a); },
    N: (u, v) => { const a = u * Math.PI * 2; return V.add(V.mul(B, Math.cos(a)), V.mul(U, Math.sin(a))); },
    th: () => wrap.th }) });
  // cord: a round cord about the wrap, a knot on the outer back side, two short ends
  const rc = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; rc.push(ring(cord.at, cord.R, a)); }
  const round = (r, K = 5) => () => Array.from({ length: K }, (_, j) => { const a = (j / K) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r, 1, Math.cos(a)]; });
  out.push({ name: 'cord', kind: 'cord', mesh: sweep({ curve: curve(rc, [], { closed: true, per: 4 }), rings: 18, up: () => T, section: round(cord.r) }) });
  const ka = sd > 0 ? -0.6 : Math.PI + 0.6;      // the knot faces out and back
  const kc = ring(cord.at, cord.R + cord.r * 0.6, ka);
  const outward = V.nrm(V.sub(kc, V.add(c, V.mul(T, cord.at))));
  // knot: a short fat loop
  const kl = [-1, -0.4, 0.3, 1].map((q, i) => V.add(kc, V.add(V.mul(T, q * 0.0034), V.mul(outward, [0, 0.0022, 0.0026, 0][i]))));
  out.push({ name: 'knot', kind: 'cord', mesh: sweep({ curve: curve(kl, [], { per: 6 }), rings: 5, up: () => outward, section: round(cord.r * 1.35), tip: 'cap' }) });
  for (const q of [-1, 1]) {
    const e = [kc, V.add(kc, V.add(V.mul(T, 0.008 + q * 0.002), V.mul(outward, 0.003))), V.add(kc, V.add(V.mul(T, cord.ends * 0.6 + q * 0.003), V.mul(outward, 0.004))), V.add(kc, V.add(V.mul(T, cord.ends + q * 0.004), V.mul(outward, 0.0035)))];
    out.push({ name: 'end', kind: 'cord', mesh: sweep({ curve: curve(e, [[cord.r, cord.r, cord.r * 0.9, cord.r * 0.4]], { per: 6 }), rings: 6, up: () => outward,
      section: (t, sc) => round(sc[0])(), tip: 'cap' }) });
  }
  return out;
}
