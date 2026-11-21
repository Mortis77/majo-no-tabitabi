// Shared helper of the giant mushrooms (shroom_a..d), the forest-floor clusters (shroom_small_a/b) and the crystals
// (crystal_spire, crystal_cluster_a/b/c, crystal_vein). Not an asset itself.
//
// HOW THE GAME DRAWS THEM (src/world/flora/batches.js + species.js partRule): instanced flora, ONE LOD node kept
// (sp.sculpt = [type, id, lod]), no textures, vertex colours only. Per material NAME:
//   giant shrooms  'cap'     -> tint (instance hue), glow 1.2; the vertex colours of a sculpt's tinted part are turned into
//                               a VALUE relative to the part's mean (x 0.85) -> paint caps and gills in grey; gills and cap
//                               skin share ONE material so the gills keep their brighter value (the normalisation is per
//                               primitive).
//                  'stem'    -> mul base 0x6f6a9c (lavender) x vertex colour, glow 0.22 -> paint near-white with a value story
//   small shrooms  'cap'     -> tint, glow 1;  'stalk' -> mul by the material colour (white) = the painted colour as is
//                               ('stem' would be multiplied by the plants' green 0x5f9a3a)
//   crystals       'crystal' -> tint, glow 1 (value only);  'rock' -> mul base 0x55525f (dark) -> paint near-white
// Build with the vertex-colour driver: SCULPT_THREADS=2 node tools/sculpt/assets/_smallprops.mjs <asset> [--quick]
import * as P from '../sdf.mjs';
import { rockPoly, stonePlanes, pl } from './rock_common.mjs';

export const C = P.color, mix = P.mix, ss = P.ss;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
export const FAR = () => process.env.SMALLPROPS_FAR === '1';
export const grey = (v) => [v, v, v];

// ------------------------------------------------------------------------------------------------- materials / tints
export const SHROOM_MATS = {
  cap: { name: 'cap', surface: 'none', look: { rim: 0.35, wrap: 0.5 } },
  stem: { name: 'stem', surface: 'none', look: { rim: 0.25, wrap: 0.4 } },
};
export const SMALL_MATS = {
  cap: { name: 'cap', surface: 'none', look: { rim: 0.35, wrap: 0.5 } },
  stalk: { name: 'stalk', surface: 'none', look: { rim: 0.25, wrap: 0.4 } },
};
export const CRYSTAL_MATS = {
  crystal: { name: 'crystal', surface: 'none', look: { spec: 0.5, specPower: 40, rim: 0.4 } },
  rock: { name: 'rock', surface: 'rock', look: { rim: 0.2 } },
};
// preview only (linear multipliers): a glowing violet-pink cap as the night lands show it, the lavender stem base,
// a cool blue crystal, the dark crystal-field rock (base 0x55525f x land 0.6, lifted a little so form can be judged)
export const SHROOM_TINT = { cap: [0.78, 0.3, 0.72], stem: [0.6, 0.56, 0.8] };
export const SMALL_TINT = { cap: [0.85, 0.32, 0.2] };
export const CRYSTAL_TINT = { crystal: [0.42, 0.62, 1.0], rock: [0.2, 0.19, 0.25] };

// ------------------------------------------------------------------------------------------------------- shape utils
export const shape = (f, b, lip = 1.2) => new P.Shape(f, b, null, lip);
/** hard floor at y = y0 (the foot sits in the ground) */
export function floorAt(s, y0 = 0) { const f = s.f; return new P.Shape((x, y, z) => Math.max(f(x, y, z), y0 - y), [s.b[0], y0, s.b[2], s.b[3], s.b[4], s.b[5]], s.pf, s.lip); }
/** periodic noise around the axis (no seam at +-pi): fbm on the unit circle, scaled */
export const ringNoise = (th, k, seed, y = 0) => P.fbm(Math.cos(th) * k + 7, y, Math.sin(th) * k + 3, seed, 2);

/** centre of a stem path at height y (path: points with increasing y) */
export function pathAt(path, y) {
  if (y <= path[0][1]) return path[0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (y <= b[1]) { const t = (y - a[1]) / (b[1] - a[1] || 1); return [a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t]; }
  }
  return path[path.length - 1];
}

/**
 * A stem: tube along `path` (foot to cap, y increasing), radius r(t), a bulb at the foot (ellipsoid soft-joined), a few
 * long vertical ridges (integer count -> no seam) that fade toward the foot and the top, an optional twist of the ridges.
 */
export function stem({ path, r, bulb = null, ridges = 0, ridgeAmp = 0, ridgeTwist = 0, ridgeFrom = 0.15, ridgeTo = 0.9, seed = 1, rough = 0 }) {
  let s = P.tube(path, r);
  if (bulb) s = s.softAdd(P.ellipsoid(bulb.size).at(bulb.at[0], bulb.at[1], bulb.at[2]), bulb.k ?? 0.3);
  const y0 = path[0][1], y1 = path[path.length - 1][1];
  if (ridges && ridgeAmp) {
    const f = s.f;
    const g = (x, y, z) => {
      const d = f(x, y, z);
      if (d > ridgeAmp * 3) return d;
      const c = pathAt(path, y), t = (y - y0) / (y1 - y0);
      const env = ss(ridgeFrom - 0.1, ridgeFrom + 0.1, t) * ss(ridgeTo + 0.08, ridgeTo - 0.08, t);
      if (env <= 0) return d;
      const th = Math.atan2(z - c[2], x - c[0]) + ridgeTwist * y + 0.25 * ringNoise(Math.atan2(z - c[2], x - c[0]), 1.3, seed, y * 0.4);
      const w = Math.cos(ridges * th);
      // sharp-crested ridges, broad shallow valleys
      return d - ridgeAmp * env * (Math.pow(0.5 + 0.5 * w, 3) - 0.25);
    };
    s = new P.Shape(g, s.b, s.pf, s.lip + ridgeAmp * ridges * 1.5);
  }
  if (rough) s = s.rough({ type: 'fbm', scale: rough * 25, amp: rough, oct: 2, seed: seed + 5 });
  return s;
}

/**
 * Cap of a giant mushroom, built about the local Y axis with its rim around y = 0 (place it with .turn / .at later).
 *  top: [[r, y], ...] from the crown (r = 0) to the rim;  under: [[r, y], ...] from the rim back to the stem (r = rs)
 *  gills: { n, t (thickness), depth: r => how far below the underside the gill edge hangs, short: r where the short
 *           gills begin, wave }  (null = smooth underside, the far LOD)
 * Returns { skin, gills } (both un-parted) — the caller parts them (gills brighter: the light comes from between them).
 */
export function capParts({ top, under, gills = null, smooth = 0.03, seed = 1, inset = 0.05 }) {
  const prof = [...top, ...under];
  const skin = P.lathe(prof, { smooth });
  if (!gills) return { skin, gills: null };
  const uy = (r) => {
    // underside height at radius r (under goes from the rim inward)
    const U = under;
    if (r >= U[0][0]) return U[0][1];
    for (let i = 1; i < U.length; i++) { const a = U[i - 1], b = U[i]; if (r >= b[0]) { const t = (r - b[0]) / (a[0] - b[0] || 1); return b[1] + (a[1] - b[1]) * t; } }
    return U[U.length - 1][1];
  };
  const rs = under[under.length - 1][0], R = under[0][0];
  const { n, t, depth, short = R * 0.55, wave = 0.03, end: gEnd = 0.91 } = gills;
  const a = TAU / n;
  const lo = [], hiP = [];
  for (let i = 0; i <= 24; i++) { const r = rs * 0.8 + (R * gEnd - rs * 0.8) * (i / 24); lo.push([r, uy(r) - depth(r)]); hiP.push([r, uy(r) + inset]); }
  const vol = P.lathe([...hiP, ...lo.reverse()], { smooth: 0 });
  const fv = vol.f;
  const fins = (x, y, z) => {
    const r = Math.hypot(x, z);
    let th = Math.atan2(z, x) + wave * Math.sin(r * 2.1 + seed);
    let dl = th - a * Math.round(th / a);
    const d1 = r * Math.abs(Math.sin(dl)) - t / 2;
    th += a / 2; dl = th - a * Math.round(th / a);
    const d2 = Math.max(r * Math.abs(Math.sin(dl)) - t * 0.42, short - r);
    return Math.min(d1, d2);
  };
  const g = new P.Shape((x, y, z) => Math.max(fv(x, y, z), fins(x, y, z)), vol.b, null, 1.3);
  return { skin, gills: g, uy };
}

/** the far LODs' stand-in for the gills: one solid under-dome hanging `depth` (max) below the underside */
export function underDome(under, depth) {
  const rs = under[under.length - 1][0], R = under[0][0];
  const uy = (r) => { for (let i = 1; i < under.length; i++) { const a = under[i - 1], b = under[i]; if (r >= b[0]) { const t = (r - b[0]) / (a[0] - b[0] || 1); return b[1] + (a[1] - b[1]) * t; } } return under[under.length - 1][1]; };
  const lo = [...under].reverse().map(([r0]) => { const r = rs + (r0 - rs) * 0.93; return [r, uy(r)]; }).map(([r, y]) => { const sn = Math.max(0, Math.sin(Math.PI * (r - rs) / (R - rs))); return [r, y - depth * Math.pow(sn, 0.7) - 0.07 * Math.pow(sn, 0.35)]; });
  const hi = under.map(([r, y]) => [r * 0.995, y + 0.04]);
  return P.lathe([...lo, ...hi], { smooth: 0.015 });
}

/**
 * Sag + ragged rim + splits as one warp of the cap (local frame, rim near y = 0, radius R):
 *  sag: [amount, towardDeg] the rim droops toward that side (r^2);  rag: rim raggedness (m of radial in/out at the rim)
 *  flaps: [[deg, drop, widthDeg]] a section of the rim hanging lower (a torn flap)
 */
export function capWarp(s, { R, sag = [0, 0], rag = 0, flaps = [], wave = null, zones = null, seed = 1 }) {
  const ts = sag[1] * Math.PI / 180;
  const FL = flaps.map(([d, drop, w]) => [d * Math.PI / 180, drop, w * Math.PI / 180]);
  let grow = Math.abs(sag[0]) + rag + (wave ? wave[0] : 0); for (const f of FL) grow = Math.max(grow, Math.abs(sag[0]) + Math.abs(f[1]));
  return s.warp((x, y, z, o) => {
    const r = Math.hypot(x, z), th = Math.atan2(z, x), u = clamp(r / R, 0, 1.2);
    let dy = -sag[0] * u * u * (0.5 + 0.5 * Math.cos(th - ts));
    for (const [c, drop, w] of FL) { const k = Math.exp(-(1 - Math.cos(th - c)) / (1 - Math.cos(w))); dy -= drop * k * Math.pow(u, 3); }
    if (zones) dy += zones[0] * Math.sin(zones[1] * r + 0.6 * ringNoise(th, 2, seed + 9)) * ss(0.15, 0.4, u);
    if (wave) dy += wave[0] * Math.pow(u, 2.5) * Math.sin(wave[1] * th + 1.3 * ringNoise(th, 1.5, seed + 4) + (wave[2] || 0));
    o[1] = dy;
    if (rag) { const k = rag * Math.pow(u, 4) * ringNoise(th, 3.2, seed); o[0] = (x / (r || 1)) * k; o[2] = (z / (r || 1)) * k; }
  }, { lip: 1.35, grow });
}

/**
 * A torn skirt (annulus / veil remnant) round a stem: a cone shell from radius rIn at height y out and down to rOut,
 * `drop` below; its hem ragged (rag 0..1 of the drop), optional tears [deg, openDeg]. Centred on [cx, cz].
 */
export function skirt({ at: [cx, cy, cz], rIn, rOut, drop, thick, rag = 0.3, seed = 1, tears = [] }) {
  const prof = [[rIn * 0.8, cy + thick * 0.6], [rIn + thick * 0.5, cy + thick * 0.6], [rOut, cy - drop], [rOut - thick * 0.7, cy - drop - thick * 0.3], [rIn + thick * 0.3, cy - thick * 0.9], [rIn * 0.8, cy - thick * 0.9]];
  let s = P.lathe(prof, { smooth: thick * 0.25 });
  const f = s.f;
  s = new P.Shape((x, y, z) => {
    const th = Math.atan2(z, x);
    const hem = cy - drop * (1 - rag * (0.55 + 0.6 * ringNoise(th, 4.5, seed)));
    return Math.max(f(x, y, z), hem - y);
  }, s.b, null, 1.3);
  for (const [d, o] of tears) s = s.cut(rimSplit(d, rIn + thick * 2, o, rOut + 1, thick * 0.6));
  return s.at(cx, 0, cz);
}

/** a young mushroom (button or half-open): stem from `at` along `lean`, a cap of radius cr; returns { stem, cap } */
export function young({ at, h, sr, cr, lean = [0, 0], open = 0.5, seed = 1 }) {
  const top = [at[0] + lean[0], at[1] + h, at[2] + lean[1]];
  const st = P.tube([at, [at[0] + lean[0] * 0.45, at[1] + h * 0.5, at[2] + lean[1] * 0.45], top], (t) => sr * (1.25 - 0.35 * t))
    .softAdd(P.ellipsoid([sr * 1.7, sr * 1.2, sr * 1.7]).at(at[0], at[1] + sr * 0.6, at[2]), sr * 0.8);
  // a button is nearly a ball, a half-open cap a dome with a rolled-in rim
  const ch = cr * (1.05 - 0.4 * open);
  const cap = P.lathe([[0, ch], [cr * 0.6, ch * 0.88], [cr * 0.93, ch * 0.45], [cr, ch * 0.1], [cr * 0.9, -ch * 0.08 * (1 - open)], [sr * 1.1, ch * 0.05]], { smooth: cr * 0.06 })
    .turn(lean[1] / h * 40, 0, -lean[0] / h * 40).at(top[0], top[1] - ch * 0.2, top[2]);
  return { stem: st, cap };
}

/** a bracket: the cap's radius shrinks toward the back (angle 180 deg from local +x) to `back` x R, so the shelf's
 *  root wraps round into the stem it grows from (no straight cut edge) */
export function kidney(sh, back, p = 1.3) {
  const f = sh.f, pf = sh.pf;
  const S = (x, z) => back + (1 - back) * Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(z, x)), p);
  return new P.Shape((x, y, z) => { const k = S(x, z); return f(x / k, y, z / k) * k; }, sh.b, (x, y, z) => { const k = S(x, z); return pf(x / k, y, z / k); }, sh.lip * 1.6);
}

/** a radial split in the rim: a narrow wedge at angle deg, from radius r0 out, opening `open` degrees, through all y */
export function rimSplit(deg, r0, open = 6, len = 10, wmin = 0) {
  const th = deg * Math.PI / 180, h = open * Math.PI / 360;
  const ux = Math.cos(th), uz = Math.sin(th);
  return shape((x, y, z) => {
    const along = x * ux + z * uz, side = -x * uz + z * ux;
    // wedge: |side| < (along - r0) * tan(h), plus a rounded root
    const w = Math.abs(side) * Math.cos(h) - (along - r0) * Math.sin(h) - wmin;
    return Math.max(w, r0 - 0.02 - along, along - r0 - len);
  }, [-len - r0, -50, -len - r0, len + r0, 50, len + r0], 1.1);
}

// --------------------------------------------------------------------------------------------------------- paints
/** cap skin (value only): pale crown, a darker rim band, a pale lip, radial fibrils, dark cracks; o: { c: centre xyz, R } */
export function paintCapSkin(o) {
  return (c) => {
    const { x, y, z, ny, cavity, edge, ao } = c;
    const dx = x - o.c[0], dz = z - o.c[2], r = Math.hypot(dx, dz) / o.R, th = Math.atan2(dz, dx);
    let v = 0.82;
    if (ny > -0.2) {
      v += 0.24 * ss(0.62, 0.12, r);                                        // the crown pale
      v -= 0.2 * ss(0.6, 0.86, r) * ss(1.06, 0.93, r);                      // a deeper band before the rim
      v += 0.08 * ss(0.9, 1.0, r);                                          // and the margin lighter again
      v += 0.07 * Math.cos(o.fib * th + 2 * ringNoise(th, 2, 3)) * ss(0.35, 0.85, r);  // radial fibrils (integer count)
      v += (o.top ? o.top(c, r, th) : 0);
    } else v = 0.6;                                                           // the underside skin between the gills
    v += 0.22 * edge;                                                         // the lip catches light
    v -= 0.35 * clamp(cavity * 1.4, 0, 1);
    return grey(clamp(v, 0.25, 1.25));
  };
}
/** gills: bright free edges (the light comes from inside along them), dimmer deep between */
export function paintGill(o = {}) {
  return (c) => {
    const { cavity, edge, ny, ao } = c;
    let v = (1.0 + 0.5 * (1 - ao)) + 0.3 * edge - 0.4 * clamp(cavity * 1.5, 0, 1) - 0.1 * ss(0.2, 0.9, ny);
    return grey(clamp(v * (o.k || 1), 0.3, 1.35));
  };
}
/** stem (mul with lavender base): near white; pale under the cap, ridges lighter, damp earthy foot */
export function paintStem(o = {}) {
  const yTop = o.yTop || 3, foot = o.foot || 0.6;
  return (c) => {
    const { x, y, z, cavity, edge, ny, ao } = c;
    let col = P.mul(mix(C('#d6d0c8'), C('#f6f2ee'), ss(0, yTop, y)), 1.0 + 0.1 * ss(yTop * 0.3, yTop, y));
    col = mix(col, C('#fffaf4'), edge * 0.25);
    const fib = P.fbm(x * 6, y * 0.9, z * 6, o.seed || 2, 2);                // long fibres (stretched in y)
    col = P.mul(col, 0.95 + 0.07 * fib);
    col = mix(col, C('#8a7a6c'), ss(foot, 0.0, y) * 0.75);                  // damp earthy foot
    col = mix(col, C('#7a6e66'), clamp(cavity * 1.3, 0, 1) * 0.6);
    if (o.bands) col = P.mul(col, 1 - 0.14 * o.bands(x, y, z));
    return P.mul(col, Math.min(1.12, 0.92 + 0.5 * (1 - ao)));
  };
}
/** veil remnants: paler than the stem, torn edges darker */
export function paintVeil(c) {
  const { cavity, edge } = c;
  let col = mix(C('#f4efe8'), C('#ffffff'), edge * 0.6);
  return mix(col, C('#9a8e84'), clamp(cavity * 1.4, 0, 1) * 0.6);
}

// --------------------------------------------------------------------------------------------------------- crystals
/**
 * One crystal: hexagonal prism of radius r and length len, pyramid tip of length tip, slight taper, grown from `base`
 * along `dir`, spun `spin` degrees about its own axis. broken: { at: 0..1 of the length, tilt: [ax, az] deg } cuts the
 * tip off along a tilted plane (fresh break part `brkPart`). Returns { shape, axis } (axis for the paint).
 */
export function crystal({ base, dir, len, r, tip = null, taper = 0.9, spin = 0, broken = null, sides = 6 }) {
  const tl = tip ?? r * 1.6;
  let s = P.lathe([[r, -r * 0.6], [r, 0], [r * taper, len], [0, len + tl]], { sides });
  let brk = null;
  if (broken) {
    const hb = broken.at * (len + tl), [ax, az] = broken.tilt;
    const n = P.norm([Math.sin(az * Math.PI / 180), -1, Math.sin(ax * Math.PI / 180)]);
    brk = P.plane(n, [0, hb, 0]);
  }
  const u = P.norm(dir);
  const frame = (sh) => sh.turn(0, spin, 0).aim(u).at(base[0], base[1], base[2]);
  return { s: frame(s), brk: brk ? frame(brk) : null, axis: { base, u, len: len + tl, r, spin } };
}

/**
 * Crystal paint (value only): every hex face its own value (crisp facets), tips brighter, the root darker, internal
 * fracture planes as hard value steps, a pale fresh break.  ax: { base, u, len, spin }, fr: [[n, offset, dv], ...]
 */
export function paintCrystal(ax, { seed = 1, fr = [], fresh = false } = {}) {
  const rnd = P.prng(seed);
  const faceV = Array.from({ length: 6 }, () => -0.12 + 0.24 * rnd());
  // a local frame: u = axis, e1/e2 across
  const u = ax.u, t0 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = P.norm(P.cross(t0, u)), e2 = P.cross(u, e1);
  const planes = fr.map(([n, off, dv]) => [P.norm(n), off, dv]);
  return (c) => {
    const { x, y, z, nx, ny, nz, edge, cavity } = c;
    const px = x - ax.base[0], py = y - ax.base[1], pz = z - ax.base[2];
    const t = clamp((px * u[0] + py * u[1] + pz * u[2]) / ax.len, 0, 1);
    const along = nx * u[0] + ny * u[1] + nz * u[2];
    let v;
    if (fresh) v = 1.2 - 0.25 * cavity;
    else {
      const a = Math.atan2(nx * e2[0] + ny * e2[1] + nz * e2[2], nx * e1[0] + ny * e1[1] + nz * e1[2]);
      const k = ((Math.round(a / (Math.PI / 3)) % 6) + 6) % 6;
      v = 0.82 + faceV[k];
      if (along > 0.45) v += 0.22;                                           // the tip facets: the brightest planes
      v += 0.28 * Math.pow(t, 1.5) - 0.3 * ss(0.25, 0.0, t);                 // brighter toward the tip, dark root
      for (const [n, off, dv] of planes) if (px * n[0] + py * n[1] + pz * n[2] > off) v += dv;   // fracture steps
      v += 0.12 * edge - 0.3 * cavity;
    }
    return grey(clamp(v, 0.3, 1.4));
  };
}

/** rock matrix paint (mul with the dark base): near white, value story only — pale tops, dark foot and crevices */
export function paintMatrix(c) {
  const { x, y, z, ny, edge, cavity } = c;
  let v = 0.78 + 0.16 * ss(0.2, 0.9, ny) + 0.06 * P.fbm(x * 2, y * 2, z * 2, 4, 2);
  v += 0.2 * edge - 0.35 * clamp(cavity * 1.3, 0, 1);
  v *= 0.75 + 0.25 * ss(0.0, 0.25, y);
  return [v * 0.98, v * 0.97, v];
}
export { rockPoly, stonePlanes, pl };

/** small crystals crowding a base: n of them on a ring [r0, r1] about c, pointing out and up */
export function crowd(seed, { n, c = [0, 0, 0], ring, y = 0, len, r, up = [0.9, 1.6], spinBase = 0 }) {
  const rnd = P.prng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.9 + spinBase, rr = ring[0] + (ring[1] - ring[0]) * rnd();
    const bx = c[0] + Math.cos(a) * rr, bz = c[2] + Math.sin(a) * rr;
    const u = up[0] + (up[1] - up[0]) * rnd();
    out.push({ base: [bx, y - 0.06 + (rnd() - 0.5) * 0.04, bz], dir: [Math.cos(a + (rnd() - 0.5) * 0.8), u, Math.sin(a + (rnd() - 0.5) * 0.8)], len: len[0] + (len[1] - len[0]) * rnd(), r: r[0] + (r[1] - r[0]) * rnd(), spin: rnd() * 60, broken: rnd() < 0.3 ? { at: 0.75 + 0.15 * rnd(), tilt: [(rnd() - 0.5) * 50, (rnd() - 0.5) * 50] } : null });
  }
  return out;
}
/** two internal fracture planes per crystal (value steps), seeded, if the spec gives none */
function autoFr(cs, i) {
  const rnd = P.prng(i * 13 + 5), u = P.norm(cs.dir), L = cs.len;
  const out = [];
  for (let k = 0; k < (L > 0.5 ? 2 : 1); k++) {
    const n = P.norm([u[0] + (rnd() - 0.5) * 1.6, u[1] + (rnd() - 0.5) * 1.2, u[2] + (rnd() - 0.5) * 1.6]);
    const t = 0.3 + 0.45 * rnd();
    out.push([n, t * L * (n[0] * u[0] + n[1] * u[1] + n[2] * u[2]), (rnd() < 0.5 ? -1 : 1) * (0.1 + 0.08 * rnd())]);
  }
  return out;
}

/**
 * A cluster asset from a list of crystals and a rock matrix.
 *  spec: { rock: { size, c, count, seed, flatTop, extra } | null, crystals: [{ base, dir, len, r, tip, spin, broken, fr }],
 *          sink: y of the floor }
 * Each crystal is its own part (paint follows its axis); broken tips cut with a pale 'fresh' part.
 */
export function cluster(name, spec) {
  const parts = [];
  let all = null;
  spec.crystals.forEach((cs, i) => {
    const { s, brk, axis } = crystal(cs);
    let piece = s.part(`${name}_c${i}`, { mat: 'crystal', paint: paintCrystal(axis, { seed: i * 7 + 3, fr: cs.fr || autoFr(cs, i) }) });
    if (brk) {
      const fresh = new P.Shape(brk.f, brk.b, null, 1).part(`${name}_b${i}`, { mat: 'crystal', paint: paintCrystal(axis, { fresh: true }) });
      piece = piece.cut(fresh, { paintCut: true });
    }
    all = all ? all.add(piece) : piece;
    parts.push(axis);
  });
  if (spec.rock) {
    const rk = spec.rock;
    const planes = rk.planes || stonePlanes(P.prng(rk.seed || 1), { size: rk.size, c: rk.c, count: rk.count || 10, cut: rk.cut || [0.8, 1.0], flatTop: rk.flatTop || 0, extra: rk.extra || [], noUnder: true });
    const b = rk.bounds || [rk.c[0] - rk.size[0] - 0.1, -0.5, rk.c[2] - rk.size[2] - 0.1, rk.c[0] + rk.size[0] + 0.1, rk.c[1] + rk.size[1] + 0.1, rk.c[2] + rk.size[2] + 0.1];
    let rock = rockPoly(planes, { k: rk.k ?? 0.012, kSoft: 0.06, soft: (x, y) => ss(rk.c[1], rk.c[1] + rk.size[1], y) * 0.6, floor: -0.5, bounds: b }).part(`${name}_rock`, { mat: 'rock', paint: paintMatrix });
    if (rk.split) {
      // the boulder split open by the growth: a straight-walled gap (2 x gap) through the rock along the plane n . (p - at) = 0
      const n = P.norm(rk.split.n), at = rk.split.at, g = rk.split.gap;
      rock = rock.cut(new P.Shape((x, y, z) => Math.abs((x - at[0]) * n[0] + (y - at[1]) * n[1] + (z - at[2]) * n[2]) - g, [-5, -1, -5, 5, 5, 5], null, 1));
    }
    if (rk.rough) rock = rock.rough({ type: 'fbm', scale: 0.3, amp: rk.rough, oct: 2, seed: 9 });
    all = rock.add(all);
  }
  return floorAt(all, spec.floor ?? 0);
}

/** the common config of the five crystal pieces (asset files give name, replaced model, voxel and build) */
export function crystalDef(name, { replaces, voxel = 0.008, build, notes = '', extra = {} }) {
  return {
    name, id: 'sculpt_' + name,
    voxel, lods: [2400, 800, 250], lodError: [voxel * 1.5, voxel * 4, voxel * 9],
    ground: 0, aoRange: 0.35, aoStrength: 0.45, cavity: [0.01, 0.04], creaseAngle: 28, hardAngle: 40, bandSlack: 0.04,
    materials: CRYSTAL_MATS, previewTint: CRYSTAL_TINT,
    replaces: { file: replaces, scale: 1, tint: { crystal: CRYSTAL_TINT.crystal, rock: CRYSTAL_TINT.rock } },
    notes: `Sculpted crystal piece (${name}). Vertex colours on every LOD. crystal = tint + glow (value only: facets, fracture steps), rock = mul (near white x the dark rock base). ${notes}`,
    ...extra,
    build,
  };
}
