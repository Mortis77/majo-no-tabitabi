// containers_lib — shared helper of the containers set (crate_a, crate_b, crate_iron, crate_carrots, crate_apples,
// barrel_small, barrel_fish, barrel_apples, basket_mushrooms, basket_berries, hay_sheaf).
// Members of the same family as the first batch's vessels (_smallprops.mjs): batched props, so NO texture and NO normal
// map — form in geometry, paint in vertex colours, the game's material names (wood / metal / straw / fruit / leaf / food).
// Build with the first batch's vertex-colour driver:
//   SCULPT_THREADS=2 node tools/sculpt/assets/_smallprops.mjs tools/sculpt/assets/<name>.mjs [--quick]
// Contact sheet of several built GLBs (old / new / back / top / clay / game LOD1 / LOD2), one row each:
//   node tools/sculpt/assets/containers_lib.mjs look <round-label> crate_a crate_b ...
//
// Kit rules followed here (tools/sculpt/NOTES.md): contacts sink >= 1 voxel or stay >= 2 voxels clear; part() before
// chip/cut paint; unique part names; far LODs from a simpler field (process.env.SMALLPROPS_FAR).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../sdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');
export const C = P.color, mix = P.mix, ss = P.ss;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const growB = (b, g) => [b[0] - g, b[1] - g, b[2] - g, b[3] + g, b[4] + g, b[5] + g];
export const FAR = () => process.env.SMALLPROPS_FAR === '1';

// the game's material families (names and surface tags exactly as the refined pack GLBs carried them)
export const MATS = {
  wood: { name: 'wood', surface: 'wood', look: { rim: 0.3 } },
  metal: { name: 'metal', surface: 'metal', look: { spec: 0.55, specPower: 40, rim: 0.4 } },
  straw: { name: 'straw', surface: 'thatch', look: { scale: 0.8 } },
  fruit: { name: 'fruit', surface: 'none', look: { spec: 0.3, specPower: 36, rim: 0.35, wrap: 0.5 } },
  leaf: { name: 'leaf', surface: 'none', look: { trans: 0.4 } },
  food: { name: 'food', surface: 'none', look: { spec: 0.12, specPower: 24, rim: 0.3, wrap: 0.5 } },
};
export const pickMats = (...k) => Object.fromEntries(k.map((n) => [n, MATS[n]]));

// ================================================================================================== wood: boards
/**
 * Paint of one board. tone 0..1 picks the board's own value between light and dark (no two boards alike); grain is the
 * axis the fibres run along: long streaks along it, darker end grain on the faces it points out of.
 * extra(c, col) -> col lets an asset add a story (brand, soot, stain) before edge wear and cavity.
 */
export function woodPaint({ tone = 0.5, grain = 'x', seed = 1, light = '#caa67c', dark = '#8f6a48', end = '#7a5a40', silver = 0.35, wet = 0.07, extra = null } = {}) {
  const base = mix(C(light), C(dark), tone);
  const ga = grain === 'x' ? 0 : grain === 'y' ? 1 : 2;
  return (c) => {
    const { x, y, z, nx, ny, nz, cavity, edge } = c;
    const p = [x, y, z], n = [nx, ny, nz];
    const along = p[ga], an = Math.abs(n[ga]), a1 = p[(ga + 1) % 3], a2 = p[(ga + 2) % 3];
    let col = base;
    const g = P.fbm(along * 2.5, a1 * 30, a2 * 30, seed, 2);                       // long streaks along the fibre
    col = mix(col, C(dark), clamp(0.5 + g * 1.6, 0, 1) * 0.4);
    if (an > 0.7) col = mix(col, C(end), 0.6 + 0.15 * Math.sin(Math.hypot(a1 * 7.1, a2 * 6.3) * 40));   // end grain
    col = mix(col, C('#d8cbb0'), ss(0.55, 0.95, ny) * silver);                     // rain-silvered tops
    col = mix(col, C('#6a4c34'), ss(wet, 0, y) * 0.55);                            // damp foot
    if (extra) col = extra(c, col);
    col = mix(col, C('#ead2ac'), edge * 0.5);                                      // rubbed edges
    return mix(col, C('#3e2a1c'), cavity * 0.5);
  };
}

/**
 * A board between two corners, rounded (r), optionally bowed: the middle pushed `bow` metres along `bowAxis` (0/1/2).
 * Long axis = the largest extent.
 */
export function board(lo, hi, { r = 0.004, bow = 0, bowAxis = 1 } = {}) {
  const s = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  let b = P.roundBox(s, Math.min(r, Math.min(...s) * 0.3)).at((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
  if (bow) {
    const la = s.indexOf(Math.max(...s)), c0 = (lo[la] + hi[la]) / 2, h = s[la] / 2;
    b = b.warp((x, y, z, o) => { const u = ([x, y, z][la] - c0) / h; o[0] = o[1] = o[2] = 0; o[bowAxis] = bow * Math.max(0, 1 - u * u); }, { lip: 1.15, grow: Math.abs(bow) + 0.002 });
  }
  return b;
}

/**
 * Boards of one face of a box. face: { axis: 'x'|'y'|'z', sign: +-1, at: outer plane coordinate },
 * u = [u0, u1] range along the first in-plane axis, v = [v0, v1] along the second (in-plane axes: z face -> x, y;
 * x face -> z, y; y face -> x, z). run: 'u' | 'v' = the direction the boards run (grain); widths: across-the-run widths
 * in order (their sum + gaps should fill the range; the last board takes what is left). thick: board thickness
 * (boards stand on the core, sunk `sink` into it). Returns [{ shape, i, lo, hi, grainAxis }].
 */
export function faceBoards({ face, u, v, run = 'u', widths, gap = 0.009, thick = 0.022, sink = 0.006, jitter = 0.0025, seed = 1 }) {
  const rnd = P.prng(seed);
  const ax = { x: 0, y: 1, z: 2 }[face.axis];
  const inPlane = face.axis === 'z' ? [0, 1] : face.axis === 'x' ? [2, 1] : [0, 2];
  const [iu, iv] = inPlane, across = run === 'u' ? [v, iv] : [u, iu], along = run === 'u' ? [u, iu] : [v, iv];
  const out = [];
  let a = across[0][0];
  const end = across[0][1];
  widths.forEach((w, i) => {
    const last = i === widths.length - 1;
    const a1 = last ? end : Math.min(end, a + w);
    const lo = [0, 0, 0], hi = [0, 0, 0];
    lo[across[1]] = a + (i ? gap / 2 : 0); hi[across[1]] = a1 - (last ? 0 : gap / 2);
    lo[along[1]] = along[0][0]; hi[along[1]] = along[0][1];
    const proud = (rnd() - 0.5) * 2 * jitter;                                        // each board a little in or out
    const o = face.at + proud * face.sign, inner = face.at - face.sign * (thick + sink);
    lo[ax] = Math.min(o, inner); hi[ax] = Math.max(o, inner);
    out.push({ i, lo, hi, grainAxis: along[1], tone: rnd() });
    a = a1;
  });
  return out;
}

/** turn a shape about a vertical (y) axis through pivot (x, z) by deg */
export const swingY = (s, px, pz, deg) => s.at(-px, 0, -pz).turn(0, deg, 0).at(px, 0, pz);

/** nail head / rivet: a low dome of radius r on the surface point `at`, facing n; sunk so it stays watertight */
export function nail(at, n, r = 0.009, k = 0.5) {
  return P.ellipsoid([r, r * k, r]).aim(n).at(at[0] - n[0] * r * 0.15, at[1] - n[1] * r * 0.15, at[2] - n[2] * r * 0.15);
}
export function ironPaint({ light = '#6c6f78', dark = '#4c4e56', rust = 0.6, seed = 3 } = {}) {
  return (c) => {
    const { x, y, z, edge, cavity, ny } = c;
    let col = mix(C(light), C(dark), 0.5 + 0.5 * P.fbm(x * 14, y * 14, z * 14, seed, 2));
    const r = clamp(ss(0.4, 0.75, P.fbm(x * 7, y * 7, z * 7, seed + 4, 3) + 0.5) * rust + (ny < -0.3 ? 0.3 : 0) + cavity * 0.5, 0, 1);
    col = mix(col, C('#9a5a32'), r * 0.6);
    col = mix(col, C('#b4b8c0'), edge * 0.55);
    return col;
  };
}
export const nailPaint = (c) => mix(mix(C('#4a4644'), C('#8a5434'), 0.4 + 0.3 * P.noise3(c.x * 60, c.y * 60, c.z * 60, 4)), C('#a9a6a0'), c.edge * 0.6);

// ================================================================================================== rope and twists
/** resample a polyline (Catmull-Rom) and give a frame along it */
function frames(points, per = 12) {
  const pts = P.resample(points, per), out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = P.norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    let up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const bn = P.norm(P.cross(t, up)), nn = P.cross(bn, t);
    out.push({ p: pts[i], t, n: nn, b: bn });
  }
  let len = 0; out[0].s = 0;
  for (let i = 1; i < out.length; i++) { const p = out[i].p, q = out[i - 1].p; len += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); out[i].s = len; }
  return { fr: out, len };
}
/**
 * Twisted rope: `plies` strands wound about the centre line (lay = metres per full turn), each a tube of r*0.62,
 * soft-joined over a core so it reads as one cord with a spiral relief. far: a plain tube.
 */
export function rope(points, r, { lay = 0.05, plies = 2, far = false, k = 0.004 } = {}) {
  if (far) return P.tube(points, r * 1.05);
  const { fr } = frames(points, 14);
  let s = P.tube(points, r * 0.62);
  for (let j = 0; j < plies; j++) {
    const ph = (j / plies) * 2 * Math.PI, pts = [];
    for (const f of fr) {
      const a = ph + (f.s / lay) * 2 * Math.PI, ca = Math.cos(a) * r * 0.42, sa = Math.sin(a) * r * 0.42;
      pts.push([f.p[0] + f.n[0] * ca + f.b[0] * sa, f.p[1] + f.n[1] * ca + f.b[1] * sa, f.p[2] + f.n[2] * ca + f.b[2] * sa]);
    }
    s = s.softAdd(P.tube(pts, r * 0.56, { smooth: false }), k);
  }
  return s;
}
export function ropePaint({ light = '#d6bf8c', dark = '#a48a5c', seed = 9 } = {}) {
  return (c) => {
    let col = mix(C(light), C(dark), 0.5 + 0.5 * P.fbm(c.x * 30, c.y * 30, c.z * 30, seed, 2));
    col = mix(col, C('#efe0b8'), c.edge * 0.5);
    return mix(col, C('#5a4630'), c.cavity * 0.6);
  };
}

// ================================================================================================== coopered casks
/**
 * A cask body: radius profile rad(y), staves of uneven width (borders, radians), each lifted a little, V joints, a head
 * recessed `chime` below the stave ends with its boards. open: no top head (an open tub), the inside to `floorY`.
 * Returns { body, borders, staveOf }.
 */
export function cask({ H, rad, n = 14, seed = 7, chime = 0.022, joint = 0.006, open = false, floorY = 0.06, wall = 0.02, far = false, headBoards = [] }) {
  const rnd = P.prng(seed), w = Array.from({ length: n }, () => 0.65 + 0.7 * rnd()), sum = w.reduce((a, b) => a + b, 0);
  let a0 = rnd() * 6.28; const borders = w.map((v) => { const b = a0; a0 += (v / sum) * 2 * Math.PI; return b; });
  const staveOf = (a) => { let t = a - borders[0]; t = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); let i = 0; while (i + 1 < borders.length && ((borders[i + 1] - borders[0]) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) <= t) i++; return i; };
  const prof = [[0, 0]];
  for (let i = 0; i <= 14; i++) { const y = (i / 14) * H; prof.push([rad(y), y]); }
  if (open) { prof.push([rad(H) - wall, H], [rad(floorY) - wall, floorY], [0, floorY]); }
  else prof.push([0, H]);
  let body = P.lathe(prof, { smooth: 0.002 });
  const lift = borders.map(() => (rnd() - 0.5) * 0.003);
  body = body.warp((x, y, z, o) => { const d = lift[staveOf(Math.atan2(x, z))], r = Math.hypot(x, z) || 1; o[0] = (x / r) * d; o[2] = (z / r) * d; o[1] = 0; }, { lip: 1.2, grow: 0.006 });
  const rmax = Math.max(rad(0), rad(H / 2), rad(H));
  if (!far) for (const b of borders) body = body.cut(P.box([joint, H + 0.1, 0.03]).at(0, H / 2, rmax + 0.004).turn(0, b * 180 / Math.PI, 0));
  if (!open) {
    const rh = rad(H) - 0.03;
    body = body.softCut(P.cylinder(rh, 0.1).at(0, H - chime, 0), 0.005).softCut(P.cylinder(rad(0) - 0.03, 0.1).at(0, -0.1 + chime * 0.8, 0), 0.005);
    let head = P.cylinder(rh + 0.004, 0.02).at(0, H - chime - 0.016, 0);
    if (!far) for (const x of headBoards) head = head.cut(P.box([0.006, 0.03, 1]).at(x, H - chime + 0.004, 0));
    body = body.add(head);
  }
  return { body, borders, staveOf };
}
/** flat hoop band (iron) round a cask at height yc, width w, proud pr; lap + two rivets at angle ang (deg) */
export function ironHoop(rad, yc, w, { pr = 0.009, ang = 0, far = false } = {}) {
  const y0 = yc - w / 2, y1 = yc + w / 2, p = far ? pr * 1.8 : pr;
  let band = P.lathe([[0, y0], [rad(y0) + p - 0.003, y0], [rad(y0) + p, y0 + 0.003], [rad(y1) + p, y1 - 0.003], [rad(y1) + p - 0.003, y1], [0, y1]]);
  if (!far) {
    const r = rad(yc) + p;
    band = band.softAdd(P.box([0.06, w * 0.9, 0.012]).at(0, yc, r - 0.002).turn(0, ang, 0), 0.003);
    for (const s of [-1, 1]) band = band.add(P.ellipsoid([0.008, 0.008, 0.005]).at(s * 0.018, yc, r + 0.004).turn(0, ang, 0));
  }
  return band;
}
/**
 * Bamboo hoop: split bamboo strips wound round (a braid of two flat strips crossing), as used on sake-style casks.
 * Reads as a fat rounded band with a diagonal wrap pattern; the tucked end on angle `ang`.
 */
export function bambooHoop(rad, yc, w, { pr = 0.012, wraps = 18, ang = 0, far = false } = {}) {
  const y0 = yc - w / 2, y1 = yc + w / 2;
  let band = P.lathe([[0, y0], [rad(y0) + pr * 0.4, y0], [rad(y0) + pr, y0 + w * 0.22], [rad(yc) + pr * 1.12, yc], [rad(y1) + pr, y1 - w * 0.22], [rad(y1) + pr * 0.4, y1], [0, y1]]);
  if (far) return band;
  // diagonal wrap grooves: a periodic cut (seam-free: integer frequency in the angle)
  const f = band.f;
  band = new P.Shape((x, y, z) => {
    const d = f(x, y, z);
    if (d > 0.006) return d;
    const a = Math.atan2(x, z), t = (y - y0) / w;
    const g = Math.sin(a * wraps + t * Math.PI * 1.6);
    return d + 0.0022 * ss(0.55, 0.95, g);
  }, band.b, band.pf, 1.3);
  // the tucked end: a short strip lying over the band
  const r = rad(yc) + pr;
  band = band.softAdd(P.roundBox([0.07, w * 0.5, 0.008], 0.003).turn(0, 0, 22).at(0, yc, r + 0.001).turn(0, ang, 0), 0.003);
  return band;
}
export function bambooPaint({ seed = 5 } = {}) {
  return (c) => {
    const { x, y, z, edge, cavity, ny } = c;
    let col = mix(C('#c8b066'), C('#a99250'), 0.5 + 0.5 * P.fbm(x * 18, y * 30, z * 18, seed, 2));
    col = mix(col, C('#e4d49a'), edge * 0.6);
    col = mix(col, C('#d9cfa8'), ss(0.6, 0.95, ny) * 0.3);
    return mix(col, C('#5a4a24'), cavity * 0.6);
  };
}

// ================================================================================================== produce
/** apple: a squat sphere with a dimple at the stalk, a short stalk; tilt so they lie every which way */
export function apple(at, r, { tilt = [0, 0], far = false, stalk = true } = {}) {
  let a = P.ellipsoid([r, r * 0.88, r]);
  a = a.softCut(P.sphere(r * 0.32).at(0, r * 0.98, 0), r * 0.25);
  if (!far) a = a.softCut(P.sphere(r * 0.18).at(0, -r * 0.92, 0), r * 0.12);
  let s = null;
  if (stalk && !far) s = P.taperedCapsule([0, r * 0.62, 0], [r * 0.12, r * 1.12, r * 0.04], r * 0.085, r * 0.06);
  if (tilt[0] || tilt[1]) { a = a.turn(tilt[0], 0, tilt[1]); if (s) s = s.turn(tilt[0], 0, tilt[1]); }
  return { body: a.at(at[0], at[1], at[2]), stalk: s ? s.at(at[0], at[1], at[2]) : null };
}
export function applePaint({ red = '#d2402e', deep = '#9e2a24', blush = '#e9b04a', seed = 2 } = {}) {
  return (c) => {
    const { x, y, z, ny, cavity, edge } = c;
    const k = 0.5 + 0.5 * P.noise3(x * 9, y * 9, z * 9, seed);                     // which side met the sun
    let col = mix(C(blush), C(red), ss(0.25, 0.65, k + ny * 0.15));
    col = mix(col, C(deep), ss(0.6, 1.0, k) * 0.5);
    col = mix(col, C('#f6dc8a'), 0.25 * ss(0.5, 0.9, P.fbm(x * 70, y * 25, z * 70, seed + 1, 2) + 0.4));   // streaks
    col = mix(col, C('#fff1d0'), edge * 0.25);
    return mix(col, C('#4a2416'), cavity * 0.55);
  };
}
export const stalkPaint = (c) => mix(C('#7a5a36'), C('#3e2c1a'), c.cavity * 0.6);
export function leafPaint({ light = '#8fb257', dark = '#5e8a3e', seed = 4 } = {}) {
  return (c) => {
    let col = mix(C(light), C(dark), 0.5 + 0.5 * P.fbm(c.x * 20, c.y * 20, c.z * 20, seed, 2));
    col = mix(col, C('#c8d88a'), c.edge * 0.4);
    return mix(col, C('#2e4a20'), c.cavity * 0.5);
  };
}
/** a leaf blade: a flattened tapered tube along points; w = half WIDTH of the blade, aspect = width / thickness
 *  (thickness = 2 w / aspect; keep it >= 2 voxels) */
export function blade(points, w, { aspect = 4, up = [0, 1, 0] } = {}) {
  return P.tube(points, (t) => (w / aspect) * (Math.sin(Math.PI * clamp(0.08 + t * 0.92, 0, 1)) ** 0.7) + 0.0012, { aspect, up });
}

// ================================================================================================== weaves
/**
 * Withy stake-and-strand wall on a lathe body: horizontal rows of rods (pitch) pass in front of and behind `stakes`
 * upright stakes; each row is a rounded band, the next row's over / under is shifted by one stake.
 * f: the plain wall's field; rows between y0..y1. Displacement is outward only where the rod passes outside.
 */
export function withyWeave(shape, { y0, y1, pitch = 0.022, stakes = 16, amp = 0.004, groove = 0.0035, far = false }) {
  if (far) return shape;
  const f = shape.f;
  return new P.Shape((x, y, z) => {
    const d = f(x, y, z);
    if (d > 0.012 || y < y0 - 0.004 || y > y1 + 0.004) return d;
    const row = Math.floor((y - y0) / pitch), t = ((y - y0) / pitch) - row;
    const band = Math.sin(Math.PI * clamp(t, 0, 1));                              // 0 at the row borders, 1 mid-row
    const a = Math.atan2(x, z), over = Math.sin(a * stakes + row * Math.PI);       // + = in front of the stake
    const env = ss(y0 - 0.004, y0 + 0.006, y) * ss(y1 + 0.004, y1 - 0.006, y);
    return d - env * (amp * (0.45 + 0.55 * over) * Math.pow(band, 0.6) - groove * (1 - Math.pow(band, 0.35)));
  }, growB(shape.b, amp + 0.003), shape.pf, 1.4);
}
/**
 * Split-bamboo plain (checker) weave: vertical and horizontal strips, each cell shows the strip that is on top;
 * the top strip stands proud with a groove at its edges. cols: strips around (integer), rowH: strip height.
 */
export function checkerWeave(shape, { y0, y1, cols = 24, rowH = 0.04, amp = 0.0035, groove = 0.003, far = false }) {
  if (far) return shape;
  const f = shape.f;
  return new P.Shape((x, y, z) => {
    const d = f(x, y, z);
    if (d > 0.012 || y < y0 - 0.004 || y > y1 + 0.004) return d;
    const a = Math.atan2(x, z), u = (a / (2 * Math.PI) + 0.5) * cols, v = (y - y0) / rowH;
    const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
    const vertTop = ((iu + iv) & 1) === 0;
    // inside the cell: the top strip runs across it; grooves at its long edges
    const across = vertTop ? fu : fv;                                              // 0..1 across the top strip
    const edgeG = 1 - Math.pow(Math.sin(Math.PI * across), 0.3);
    const along = vertTop ? fv : fu;                                               // dips where it goes under
    const dip = 1 - Math.pow(Math.sin(Math.PI * along), 0.5);
    const env = ss(y0 - 0.004, y0 + 0.008, y) * ss(y1 + 0.004, y1 - 0.008, y);
    return d - env * (amp * (1 - 0.6 * dip) - groove * edgeG);
  }, growB(shape.b, amp + 0.003), shape.pf, 1.5);
}
/** cell coordinate of the checker weave (for paint: strips alternate tone) */
export function checkerCell(x, y, z, { y0, cols, rowH }) {
  const a = Math.atan2(x, z), u = (a / (2 * Math.PI) + 0.5) * cols, v = (y - y0) / rowH;
  const iu = Math.floor(u), iv = Math.floor(v);
  return { iu, iv, vertTop: ((iu + iv) & 1) === 0 };
}
export function strawPaint({ light = '#e2c27c', dark = '#b8924e', seed = 6, cav = '#5e4626' } = {}) {
  return (c) => {
    const { x, y, z, edge, cavity, ny } = c;
    let col = mix(C(light), C(dark), 0.5 + 0.5 * P.fbm(x * 25, y * 12, z * 25, seed, 2));
    col = mix(col, C('#f2dea6'), edge * 0.5);
    col = mix(col, C('#806640'), ss(0.06, 0, y) * 0.4);
    return mix(col, C(cav), cavity * 0.55);
  };
}

// ================================================================================================== contact sheet
async function loadGLB(file, scale = 1) {
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(file);
  const groups = new Map();
  const visit = (node, mat, key) => {
    const m = mul4(mat, node.getMatrix());
    const nm = node.getName() || '';
    const lm = /_LOD(\d)$/.exec(nm); if (lm) key = +lm[1];
    const mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ca = prim.getAttribute('COLOR_0'), ia = prim.getIndices();
      const n = pa.getCount(), pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), t = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        pa.getElement(i, t); const x = t[0], y = t[1], z = t[2];
        pos[i * 3] = (m[0] * x + m[4] * y + m[8] * z + m[12]) * scale; pos[i * 3 + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) * scale; pos[i * 3 + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) * scale;
        if (na) { na.getElement(i, t); const a = m[0] * t[0] + m[4] * t[1] + m[8] * t[2], b = m[1] * t[0] + m[5] * t[1] + m[9] * t[2], c = m[2] * t[0] + m[6] * t[1] + m[10] * t[2]; const l = Math.hypot(a, b, c) || 1; nrm[i * 3] = a / l; nrm[i * 3 + 1] = b / l; nrm[i * 3 + 2] = c / l; }
      }
      const idx = ia ? Uint32Array.from(ia.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      const mt = prim.getMaterial(), base = mt ? mt.getBaseColorFactor().slice(0, 3) : [0.7, 0.7, 0.7];
      let col = null;
      if (ca) { col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { ca.getElement(i, t); col[i * 3] = t[0]; col[i * 3 + 1] = t[1]; col[i * 3 + 2] = t[2]; } }
      const k = key ?? 0; if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ pos, nrm, idx, col, base, tris: idx.length / 3 });
    }
    for (const c of node.listChildren()) visit(c, m, key);
  };
  for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) visit(n, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], null);
  return [...groups.keys()].sort().map((k) => groups.get(k));
}
function mul4(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function bbox(ms) { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (const m of ms) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); } return b; }

async function look(label, names) {
  const R = await import('../preview.mjs');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'));
  const tiles = [], ts = 330;
  for (const name of names) {
    const mod = (await import(path.join(HERE, name + '.mjs'))).default;
    const lods = await loadGLB(path.join(ROOT, 'assets', 'models', 'sculpt', name + '.glb'));
    const rep = mod.replaces; let old = null;
    if (rep) old = (await loadGLB(path.join(ROOT, rep.file), rep.scale)).flat();
    const all = lods[0], b = bbox(all), H0 = b[4] - b[1], c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    const dist = R.fitDistance(old ? bbox(old.concat(all)) : b, 35, 0.86);
    const tri = lods.map((l) => l.reduce((s, m) => s + m.tris, 0));
    const H = b[4] - b[1];
    const gcam = (px) => { const k = 1 / Math.tan(50 * Math.PI / 360); const d = (ts / 2) * k * H / px; const a = 25 * Math.PI / 180, e = 14 * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * d * Math.cos(e), c[1] + Math.sin(e) * d, c[2] + Math.cos(a) * d * Math.cos(e)], c, 50, ts, ts); };
    const row = [
      old && { img: R.render(old, R.orbit(c, 30, 16, dist, 35, ts, ts)), label: `${name} OLD` },
      { img: R.render(all, R.orbit(c, 30, 16, dist, 35, ts, ts)), label: `NEW ${tri[0]}` },
      { img: R.render(all, R.orbit(c, 210, 40, dist, 35, ts, ts)), label: 'BACK ABOVE' },
      { img: R.render(all, R.orbit(c, 120, 12, dist, 35, ts, ts), { clay: true }), label: 'CLAY 120' },
      { img: R.render(lods[1] || all, gcam(150)), label: `LOD1 ${tri[1]} GAME` },
      { img: R.render(lods[2] || all, gcam(70)), label: `LOD2 ${tri[2]} FAR` },
    ];
    for (const t of row) if (t) tiles.push(t); else tiles.push({ img: R.image(ts, ts, [0.1, 0.1, 0.1]), label: '-' });
  }
  const dir = path.join(ROOT, '.tmp', 'sculpt', 'crate_a'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `look_${label}.png`);
  R.savePNG(file, R.sheet(tiles, 6, { title: `CONTAINERS ${label}` }));
  console.log(file);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'look') {
  look(process.argv[3], process.argv.slice(4)).catch((e) => { console.error(e); process.exit(1); });
}

// ================================================================================================== heaps of produce
/**
 * Apples heaped on a height field h(x, z): a jittered grid (spacing) inside `inside(x, z)`, each apple resting a little
 * into the ones below, every one tilted its own way. Returns { bodies, stalks } (unions) or nulls.
 */
export function appleHeap({ h, inside, x0, x1, z0, z1, spacing = 0.1, r = [0.044, 0.052], seed = 3, far = false, skip = 0.12 }) {
  const rnd = P.prng(seed);
  let bodies = null, stalks = null;
  let row = 0;
  for (let z = z0; z <= z1; z += spacing * 0.87, row++) {
    for (let x = x0 + (row % 2 ? spacing / 2 : 0); x <= x1; x += spacing) {
      if (rnd() < skip) continue;                                                     // holes in the heap: shadows
      const px = x + (rnd() - 0.5) * spacing * 0.35, pz = z + (rnd() - 0.5) * spacing * 0.35;
      if (!inside(px, pz)) continue;
      const rr = r[0] + (r[1] - r[0]) * rnd();
      const a = apple([px, h(px, pz) + rr * (0.35 + 0.3 * rnd()), pz], rr, { tilt: [(rnd() - 0.5) * 120, (rnd() - 0.5) * 120], far, stalk: rnd() < 0.6 });
      bodies = bodies ? bodies.add(a.body) : a.body;
      if (a.stalk) stalks = stalks ? stalks.add(a.stalk) : a.stalk;
    }
  }
  return { bodies, stalks };
}
/** paint of staves of a cask (per-stave tone, silvered top, damp foot, darker below hoops, pale worn edges) */
export function stavePaint({ staveOf, H, light = '#c09a72', dark = '#94704e', hoops = [], headR = 0, headY = 1e9, rustHoops = false, extra = null }) {
  return (c) => {
    const { x, y, z, cavity, edge, ny } = c;
    const a = Math.atan2(x, z), i = staveOf(a), k = (i * 0.618) % 1;
    if (y > headY - 0.03 && Math.hypot(x, z) < headR && ny > 0.5) {                  // the head boards, rain-washed
      let hc = mix(C('#d6c6a6'), C('#b49c7a'), 0.5 + 0.5 * Math.sin(x * 31));
      return mix(hc, C('#3e2a1c'), cavity * 0.5);
    }
    let col = mix(C(light), C(dark), k);
    col = mix(col, C(dark), 0.3 * (0.5 + 0.5 * P.fbm(a * 6, y * 3, 0, i, 2)));
    col = mix(col, C('#cdbfa4'), ss(0.7, 1.0, y / H) * 0.3);
    col = mix(col, C('#5e4430'), ss(0.12, 0.0, y) * 0.55);
    for (const [yc, w] of hoops) { const d = yc - w / 2 - y; if (d > 0 && d < 0.06) col = mix(col, C(rustHoops ? '#7e4a2a' : '#6a4c34'), (1 - d / 0.06) * 0.35); }
    if (extra) col = extra(c, col);
    col = mix(col, C('#e2caa4'), edge * 0.5);
    return mix(col, C('#3a281a'), cavity * 0.55);
  };
}

/**
 * Split-bamboo band weave: broad flat horizontal strips (pitch) with a sharp groove between them, passing over and
 * under `stakes` upright strips — an upright shows as a proud flat rib on every other row, alternating stake by stake.
 * Built from rings (cheap for the simplifier) plus short rib segments, so it survives 1800 triangles.
 */
export function bandWeave(shape, { y0, y1, pitch = 0.045, stakes = 16, band = 0.0035, groove = 0.004, rib = 0.004, ribW = 0.55, far = false }) {
  if (far) return shape;
  const f = shape.f, k = stakes / 2;
  return new P.Shape((x, y, z) => {
    const d = f(x, y, z);
    if (d > 0.014 || y < y0 - 0.004 || y > y1 + 0.004) return d;
    const row = Math.floor((y - y0) / pitch), t = clamp((y - y0) / pitch - row, 0, 1);
    const prof = clamp(Math.sin(Math.PI * t) * 3.2, 0, 1);                        // flat strip, rounded edges
    const a = Math.atan2(x, z), c = Math.cos(k * a);
    const over = (row & 1) ? c < 0 : c > 0;                                         // this stake is on top in this row
    const ribP = over ? ss(1 - ribW * 0.35, 1 - ribW * 0.25, Math.abs(c)) : 0;
    const env = ss(y0 - 0.004, y0 + 0.008, y) * ss(y1 + 0.004, y1 - 0.008, y);
    return d - env * (band * prof - groove * (1 - prof) + rib * ribP * prof);
  }, growB(shape.b, band + rib + 0.003), shape.pf, 1.5);
}
/** for paint: is this point on an upright rib (true) or a horizontal strip */
export function bandCell(x, y, z, { y0, pitch = 0.045, stakes = 16, ribW = 0.55 }) {
  const row = Math.floor((y - y0) / pitch), c = Math.cos((stakes / 2) * Math.atan2(x, z));
  const over = (row & 1) ? c < 0 : c > 0;
  return { row, rib: over && Math.abs(c) > 1 - ribW * 0.3 };
}
