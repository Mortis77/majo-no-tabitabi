// The shrine's lake ferry: a clinker-built skiff moored at the end of the pier (src/world/builders/far.js, lake block,
// assetModel('bld_boat_rowing')). Replaces the Quaternius rowing boat: same box (2.33 x 1.0 x 4.5), origin keel bottom centre.
// INTENT
//  silhouette: a beamy, flared lake skiff whose sheer sweeps up to a tall bow post and down to a small square transom;
//    from the side the overlapping strakes give it a stepped, hand-built line.
//  big forms: the flared clinker hull; the bow post; the three thwarts with the oar lying across them.
//  eye rests on: the stepped strake laps catching light, the vermilion sheer strake (the shrine's boat), the coil of rope
//    in the bow and the oar shipped along the thwarts.
//  wear: the gunwale rubbed pale where hands and the pier have touched it, the vermilion chalked and flaking amidships,
//    a dark waterline with green slime below, bilge water stains inside; the bottom boards bleached where feet stand.
//  not: a pack rowboat (smooth tub with a rim), a symmetric toy, evenly detailed.
// Coordinates: metres, +Y up, +Z = bow, origin = keel bottom centre (the game sets it 0.05 above the water plane).
import * as P from '../sdf.mjs';
import { C, mix, ss, clamp, field, bunion } from './landmarks_lib.mjs';

const L = 2.2;                    // half length (stem head reaches 2.25, transom back -2.22)
const BT = 1.1, BB = 0.42;        // half-beam at the sheer / at the bottom (midships)
// planform shape 0..1 along z (bow sharp, stern square)
const plan = (z) => { const u = z / L; return u >= 0 ? Math.pow(Math.max(0, 1 - Math.pow(u, 2.1)), 0.75) : 1 - 0.36 * Math.pow(-u, 2.4); };
const rocker = (z) => { const u = z / L; return u >= 0 ? 0.36 * Math.pow(u, 2.6) : 0.14 * Math.pow(-u, 2.2); };     // keel rise
const sheer = (z) => { const u = z / L; return u >= 0 ? 0.7 + 0.27 * Math.pow(u, 2.4) : 0.7 + 0.14 * u * u; };      // gunwale top
const STRAKES = 4, LAP = 0.034;
let PLANK = 0.042;
/** outer half-width at (y, z), with clinker laps if clinker */
const halfW = (y, z, clinker) => {
  const p = plan(Math.max(-L, Math.min(L, z))), yb = rocker(z), ys = sheer(z);
  const t = clamp((y - yb) / (ys - yb), 0, 1.1);
  let w = (BB + (BT - BB) * (1 - Math.pow(1 - Math.min(t, 1), 1.7))) * p;
  if (clinker) { const s = Math.min(t, 0.999) * STRAKES, f = s - Math.floor(s); w += LAP * ss(0, 0.09, f) * (1 - f) * 1.1 * p * ss(0.02, 0.12, t); }
  return w;
};
function hullSolid(S, clinker, inset = 0) {
  return new P.Shape((x, y, z) => {
    const yb = rocker(z) + inset;
    const w = halfW(y, z, clinker) - inset;
    const slope = 1.7 * (BT - BB) / Math.max(0.3, sheer(z) - rocker(z));
    const dx = (Math.abs(x) - w) / Math.sqrt(1 + slope * slope);   // flare: distance across the sloping side
    const dy = yb - y;
    const dz = Math.max(z - L - 0.02, -L - 0.02 - z) ;
    return Math.max(dx, dy, dz, y - sheer(z) - 0.002);
  }, [-1.3, -0.05, -2.35, 1.3, 1.1, 2.35], null, 1.6);
}
const F = () => field();

export default {
  name: 'rowboat', id: 'sculpt_rowboat',
  voxel: 0.011,
  fieldVoxel: [0.011, 0.016, 0.028],
  lodField: [0, 1, 2],
  quickVoxel: 1.4,
  vcAll: true,
  lods: [3000, 1000, 300],
  lodError: [0.012, 0.045, 0.1],
  ground: null,
  aoRange: 0.25,
  cavity: [0.008, 0.04],
  creaseAngle: 40,
  bandSlack: 0.04,
  farSheet: true,
  replaces: { file: 'assets/models/refined/bld_boat_rowing.glb', scale: 0.49941 },
  materials: {
    wood: { name: 'Wood', surface: 'wood', look: { rim: 0.3 } },
    dark: { name: 'DarkWood', surface: 'wood', look: { rim: 0.3 } },
    rope: { name: 'Rope', surface: 'none', look: { rim: 0.2 } },
  },
  gameMats: { wood: 'Wood_wood', dark: 'DarkWood_wood', rope: 'Rope' },
  anchors: { bow: [0, 1.0, 2.2], stern: [0, 0.84, -2.2], seat: [0, 0.5, -0.9] },
  notes: 'Sculpted clinker skiff (lake ferry). Vertex colours on every LOD, no textures; materials Wood_wood / DarkWood_wood like the old boat, plus Rope. See .tmp/sculpt/rowboat/INSTALL.md.',

  build({ S }) {
    const D = F();
    PLANK = [0.042, 0.06, 0.09][D];
    S.part('hull', { mat: 'wood', paint: paintHull });
    S.part('inside', { mat: 'wood', paint: paintInside });
    S.part('sheerStrake', { mat: 'wood', paint: paintSheer });
    S.part('trim', { mat: 'dark', paint: paintTrim });
    S.part('thwart', { mat: 'wood', paint: paintThwart });
    S.part('oar', { mat: 'wood', paint: paintOar });
    S.part('rope', { mat: 'rope', paint: paintRope });
    const clinker = D === 0;

    // ============================================================== hull: shell of overlapping strakes, open top
    const outer = hullSolid(S, clinker), inner = hullSolid(S, false, PLANK);
    const topCut = new P.Shape((x, y, z) => sheer(z) - y, [-1.4, 0.5, -2.4, 1.4, 1.2, 2.4]);
    const floorAt = D === 2 ? (z) => sheer(z) - 0.22 : () => -1;   // far: a shallow dished top instead of an open shell
    let shell = outer.cut(inner.intersect(new P.Shape((x, y, z) => Math.max(z - (L - 0.12), -(L - 0.06) - z, floorAt(z) - y), [-1.4, -0.1, -2.4, 1.4, 1.2, 2.4])));
    shell = shell.cut(topCut);
    // the top strake is painted vermilion (its own part so the border stays crisp)
    const sheerBand = new P.Shape((x, y, z) => { const ys = sheer(z), yb = rocker(z); const t0 = yb + (ys - yb) * (1 - 1 / STRAKES); return t0 - y; }, [-1.4, 0, -2.4, 1.4, 1.2, 2.4]);
    const hull = shell.cut(sheerBand).part('hull');
    const top = shell.intersect(sheerBand).part('sheerStrake');
    // inside faces get their own paint (by distance to the inner surface) — done in paint via |x| vs inner width
    // transom: a flat board closing the stern
    const transom = outer.intersect(new P.Shape((x, y, z) => Math.max(-L - 0.03 - z, z - (-L + 0.05)), [-1.4, -0.1, -2.4, 1.4, 1.2, -1.9])).cut(topCut).part('trim');
    // keel, stem post rising at the bow, gunwale rails
    const keelPts = []; for (let i = 0; i <= 12; i++) { const z = -L + 0.05 + (2 * L - 0.05) * (i / 12); keelPts.push([0, rocker(z) + 0.01, z]); }
    const keel = S.tube(keelPts, 0.04, { aspect: 0.8 });
    const stem = S.tube([[0, rocker(1.95) + 0.05, 1.95], [0, 0.55, L + 0.0], [0, 0.82, L + 0.03], [0, 0.955, L + 0.02]], (t) => 0.055 - 0.012 * t, { aspect: 0.7 });
    const gw = []; for (let i = 0; i <= 16; i++) { const z = -L + 0.03 + (2 * L - 0.25) * (i / 16); gw.push([halfW(sheer(z), z, false) + 0.006, sheer(z) - 0.005, z]); }
    const gunwale = S.tube(gw, 0.034, { aspect: 1.3 }).mirror('x');
    const iw = gw.map(([x, y, z]) => [Math.max(0.05, x - PLANK - 0.035), y - 0.035, z]);
    const inwale = D < 2 ? S.tube(iw.slice(1, -1), 0.026).mirror('x') : null;
    let trim = S.union(keel, stem, gunwale, ...(inwale ? [inwale] : []));
    trim = trim.part('trim');

    // ============================================================== ribs, thwarts, bottom boards (inside)
    const inside = [];
    const thwY = 0.5, thw = [[1.05, 0.22], [-0.25, 0.24], [-1.55, 0.26]];
    for (const [z, wdt] of thw) {
      const w = halfW(thwY, z, false) - PLANK + 0.012;
      inside.push(S.roundBox([2 * w, 0.05, wdt], 0.012).at(0, thwY, z).part('thwart'));
      if (D === 0) inside.push(S.roundBox([0.06, thwY - rocker(z) - 0.06, 0.06], 0.01).at(0, (thwY + rocker(z) + 0.06) / 2, z).part('thwart'));
    }
    if (D === 0) {
      // ribs: steamed frames lying on the inner skin, every 0.36 m
      const ribs = new P.Shape((x, y, z) => {
        const p = 0.36, zz = z + 0.09, m = zz - p * Math.round(zz / p);
        const dz = Math.abs(m) - 0.024;
        const wIn = halfW(y, z, false) - PLANK;
        const dx = Math.abs(Math.abs(x) - (wIn - 0.013)) - 0.03;
        const dy = Math.max(rocker(z) + PLANK - 0.01 - y, y - (sheer(z) - 0.06));
        const dzr = Math.max(z - (L - 0.45), -(L - 0.25) - z);
        return Math.max(dz, dx * 0.8, dy, dzr);
      }, [-1.2, 0, -2.0, 1.2, 1.0, 1.8], null, 1.5);
      inside.push(ribs.part('inside'));
      // bottom boards: three planks on the floor amidships
      for (const x of [-0.17, 0, 0.17]) inside.push(S.roundBox([0.15, 0.03, 2.3], 0.01).at(x, rocker(0) + PLANK + 0.03, -0.35).part('thwart'));
      // thole pins at the middle thwart
      for (const sx of [-1, 1]) for (const dz of [-0.07, 0.07]) { const z = -0.25 + dz, w = halfW(sheer(z), z, false); inside.push(S.cylinder(0.02, 0.13).at(sx * (w - 0.01), sheer(z) + 0.02, z).part('trim')); }
    }

    // ============================================================== the oar, shipped along the thwarts; a coil of rope
    const oarY = thwY + 0.025 + 0.035;
    let oar = null;
    if (D < 2) {
      const a = [0.38, oarY, -1.75], b = [0.3, oarY + 0.01, 1.0];
      oar = S.capsule(a, b, 0.032);
      const bl = S.roundBox([0.13, 0.04, 0.62], 0.015).turn(0, -2, 0).at(0.29, oarY + 0.012, 1.3);
      oar = oar.add(bl).add(S.capsule([0.38, oarY, -1.75], [0.385, oarY, -1.95], 0.025)).part('oar');
    }
    let rope = null;
    if (D < 2) {
      const pts = [], rB = 0.16, n = D === 0 ? 3 : 1;
      const cz = 1.5, cx = -0.12, y0 = rocker(cz) + PLANK + 0.03;
      if (D === 0) {
        for (let i = 0; i <= 64 * n; i++) { const t = i / 64, a = t * 2 * Math.PI; const r = rB - 0.012 * t; pts.push([cx + Math.sin(a) * r, y0 + 0.02 + 0.03 * t + 0.006 * Math.sin(a * 3), cz + Math.cos(a) * r * 0.9]); }
        // the free end runs up and over the bow post
        rope = S.tube(pts, 0.021, { smooth: true });
        // the free end runs forward and up to a turn round the stem head
        rope = rope.add(S.tube([[cx + 0.1, y0 + 0.06, cz + 0.12], [cx + 0.12, y0 + 0.2, cz + 0.4], [0.03, 0.8, 2.08], [0.0, 0.92, 2.17]], 0.021));
      } else rope = S.torus(rB, 0.04).scale([1, 1, 0.9]).at(cx, y0 + 0.05, cz);
      rope = rope.part('rope');
    }
    return bunion(S, [hull, top, transom, trim, ...inside, oar, rope]);
  },
};

// ------------------------------------------------------------------------------------------------------------- paint
const isInside = (x, y, z, nx) => Math.abs(x) < halfW(y, z, false) - PLANK * 0.5 && y > rocker(z) + 0.01;
const grain = (x, y, z) => 0.5 + 0.5 * P.fbm(x * 1.5, y * 8, z * 0.8, 3, 2);
function paintHull(c) {
  const { x, y, z, nx, ny, nz, cavity, edge, ao } = c;
  if (isInside(x, y, z, nx) && (nx * Math.sign(x) < 0.2 || ny > 0.5)) return paintInside(c);
  let col = mix(C('#ad8257'), C('#c29266'), grain(x, y, z));
  // each strake a slightly different board
  const yb = rocker(z), t = (y - yb) / (sheer(z) - yb), si = Math.floor(t * STRAKES);
  col = P.mul(col, 0.92 + 0.12 * (0.5 + 0.5 * P.noise3(si * 2.1, x > 0 ? 1 : 4, 2)));
  // the lap of each strake: a dark shadow line under its lower edge, the edge itself pale and worn
  const f = t * STRAKES - si;
  if (t > 0.08) { col = mix(col, C('#4a3322'), ss(0.06, 0.0, f) * 0.7 + ss(0.94, 1, f) * 0.5); col = mix(col, C('#d8b88a'), ss(0.03, 0.08, f) * ss(0.16, 0.1, f) * 0.45); }
  // tar-dark below the waterline, green slime in a ragged band, a pale tide line above it
  const wl = 0.24 + 0.03 * P.fbm(z * 2, 0, x, 5, 2);
  col = mix(col, C('#4e4330'), ss(wl + 0.02, wl - 0.04, y) * 0.75);
  col = mix(col, C('#5e7040'), ss(wl - 0.02, wl - 0.07, y) * ss(wl - 0.2, wl - 0.1, y) * 0.55);
  col = mix(col, C('#d2c3a2'), ss(wl + 0.05, wl + 0.01, y) * ss(wl - 0.01, wl + 0.02, y) * 0.5);
  // the lap shadows and pale lap edges
  col = mix(col, C('#5a4030'), cavity * 0.6);
  col = mix(col, C('#d9b98c'), edge * 0.45);
  return col;
}
function paintInside(c) {
  const { x, y, z, ny, cavity, edge } = c;
  let col = mix(C('#9a6e48'), C('#b07e52'), grain(x, y, z));
  // bilge: wet and dark at the bottom with a tide mark, a puddle aft
  const yb = rocker(z);
  col = mix(col, C('#5c4532'), ss(yb + 0.16, yb + 0.05, y) * 0.6);
  col = mix(col, C('#4a5a40'), ss(yb + 0.08, yb + 0.03, y) * ss(0.4, 0.6, P.fbm(x * 3, 0, z * 3, 6, 2) + 0.5) * 0.4);
  col = mix(col, C('#c9a77a'), ss(0.5, 1, ny) * 0.12);
  return mix(mix(col, C('#4a3426'), cavity * 0.5), C('#d0ac7e'), edge * 0.3);
}
function paintSheer(c) {
  const { x, y, z, nx, ny, cavity, edge } = c;
  if (isInside(x, y, z, nx) && nx * Math.sign(x) < 0.2) return paintInside(c);
  // the shrine's vermilion, chalked by sun and flaking to wood amidships where the oars and the pier rub
  let col = mix(C('#d24a30'), C('#e05a3a'), 0.5 + 0.5 * P.fbm(x * 4, y * 4, z * 4, 2, 2));
  col = mix(col, C('#e88a6e'), ss(0.2, 0.9, ny) * 0.3);
  const flake = ss(0.36, 0.2, P.cellular(x * 7, y * 7, z * 4, 2)) * ss(1.4, 0.2, Math.abs(z + 0.3));
  col = mix(col, C('#a8835e'), clamp(flake + edge * 0.5, 0, 1) * 0.8);
  return mix(col, C('#6a2a1e'), cavity * 0.5);
}
function paintTrim(c) {
  const { x, y, z, ny, cavity, edge } = c;
  let col = mix(C('#6a4a34'), C('#7a5840'), grain(x, y, z));
  // the gunwale and stem head rubbed pale by hands and the pier
  const top = ss(0.3, 0.9, ny) * ss(0.55, 0.7, y);
  col = mix(col, C('#c8a67c'), clamp(top * 0.7 + edge * 0.5, 0, 1));
  if (y < 0.3) col = mix(col, C('#3e3528'), ss(0.28, 0.18, y) * 0.6);   // keel in the water
  return mix(col, C('#3a281c'), cavity * 0.5);
}
function paintThwart(c) {
  const { x, y, z, ny, cavity, edge } = c;
  let col = mix(C('#b48a5e'), C('#c99c6c'), 0.5 + 0.5 * P.fbm(x * 30, y * 3, z * 3, 7, 3));
  col = mix(col, C('#dcc39c'), ss(0.5, 1, ny) * ss(0.25, 0.05, Math.abs(x)) * 0.4);   // sat on, bleached
  col = mix(col, C('#e2c9a0'), edge * 0.4);
  return mix(col, C('#5a4030'), cavity * 0.5);
}
function paintOar(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(C('#c8a476'), C('#d8b688'), 0.5 + 0.5 * P.fbm(x * 3, y * 3, z * 25, 8, 2));
  if (z > 0.95) col = mix(col, C('#8a6a48'), ss(1.1, 1.5, z) * 0.5);   // the blade, darkened by water
  if (z < -1.6) col = mix(col, C('#e8d2aa'), 0.5);                    // the grip, polished
  return mix(mix(col, C('#f0dcb4'), edge * 0.3), C('#5a4030'), cavity * 0.5);
}
function paintRope(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(C('#c9b07a'), C('#d9c28c'), 0.5 + 0.5 * P.fbm(x * 40, y * 40, z * 40, 9, 2));
  col = mix(col, C('#8a7448'), ss(0.25, 0.15, y) * 0.5);
  return mix(mix(col, C('#efdcaa'), edge * 0.35), C('#6e5a38'), cavity * 0.6);
}
