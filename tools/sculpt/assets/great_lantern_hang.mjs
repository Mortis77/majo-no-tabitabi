// 镇灯 corner pendant — hangs from each hang_* node of great_lantern.glb (replaces the code's red corner tassels).
// INTENT: a thin red cord, a knot with two paper streamers, a squat bronze wind-bell, its tongue and a long wind-strip.
// Reads as a small vertical accent with a bright paper flutter; the bell carries the patina of the lantern's fittings.
// Origin = the hang point (top of the cord); it hangs down -Y, ~0.98 m. The game sways it about the origin.
import * as P from '../sdf.mjs';
import { TINTS } from './great_lantern.mjs';

const LAND = process.env.GL_LAND || '';
const TF = LAND && TINTS[LAND] ? P.color(TINTS[LAND].Fitting) : [1, 1, 1];
const mulc = (a, b) => [Math.min(1, a[0] * b[0]), Math.min(1, a[1] * b[1]), Math.min(1, a[2] * b[2])];

export default {
  name: LAND ? 'great_lantern_hang_' + LAND : 'great_lantern_hang',
  id: 'sculpt_great_lantern_hang',
  voxel: 0.0035,
  lods: [1600, 500, 160],
  atlas: 256,
  ground: null,
  aoRange: 0.06,
  cavity: [0.003, 0.012],
  materials: {
    cord: { name: 'Cord', surface: 'none', look: { rim: 0.2 } },
    paper: { name: 'Shide', surface: 'none', look: { trans: 0.4 } },
    bronze: { name: 'Fitting', surface: 'metal', look: { spec: 0.5 } },
  },
  anchors: { top: [0, 0, 0], bell: [0, -0.6, 0], strip: [0, -0.74, 0] },
  notes: 'Corner pendant of the sculpted great lantern: origin at the hang point, hangs -Y. Fitting takes the land tint like great_lantern.glb.',
  build({ S }) {
    // a two-ply cord
    const ply = (ph) => { const p = []; for (let i = 0; i <= 60; i++) { const y = -0.02 - (0.56 * i) / 60; const a = y * 70 + ph; p.push([Math.sin(a) * 0.006, y, Math.cos(a) * 0.006]); } return p; };
    let cord = S.tube(ply(0), 0.0085, { smooth: false }).add(S.tube(ply(Math.PI), 0.0085, { smooth: false }));
    cord = cord.add(S.torus(0.014, 0.006).turn(90, 0, 0).at(0, -0.012, 0));                                // loop over the hook
    cord = cord.softAdd(S.ellipsoid([0.024, 0.02, 0.022]).at(0, -0.2, 0), 0.006);                          // the knot
    cord = cord.part('cord', { mat: 'cord', paint: paintCord });
    // two zigzag paper streamers tied at the knot
    const zig = (w, h, n) => { const o = [], s = w * 0.55; const off = (i) => (i % 2 ? s : 0); for (let i = 0; i < n; i++) o.push([off(i), -i * h], [off(i), -(i + 1) * h]); for (let i = n - 1; i >= 0; i--) o.push([off(i) + w, -(i + 1) * h], [off(i) + w, -i * h]); return o; };
    const sh = (deg, len, tilt) => S.extrude(zig(0.045, len / 4, 4), 0.009, { round: 0.002 }).at(0.004, -0.205, 0).turn(0, 0, tilt).turn(0, deg, 0);
    const paper = S.union(sh(10, 0.24, 8), sh(190, 0.21, 6)).part('paper', { mat: 'paper', paint: paintPaper });
    // the bell: squat, flared lip, a band and a ring of bosses; a tongue hanging below with a wind-strip
    const bell = S.lathe([[0, -0.565], [0.016, -0.565], [0.03, -0.58], [0.058, -0.6], [0.072, -0.64], [0.082, -0.69], [0.09, -0.712], [0.084, -0.718], [0.072, -0.705], [0.06, -0.66], [0.045, -0.61], [0.02, -0.59], [0, -0.588]], { smooth: 0.002 })
      .add(S.torus(0.072, 0.004).at(0, -0.66, 0)).add(S.sphere(0.008).at(0, -0.625, 0.058).around(6))
      .add(S.torus(0.012, 0.004).turn(90, 0, 0).at(0, -0.556, 0));
    const tongue = S.capsule([0, -0.6, 0], [0, -0.74, 0], 0.005).add(S.roundBox([0.05, 0.05, 0.008], 0.003).at(0, -0.76, 0));
    const metal = bell.add(tongue).wear(0.002, { seed: 4 }).part('bronze', { mat: 'bronze', paint: paintBell });
    const strip = S.roundBox([0.05, 0.2, 0.008], 0.003).at(0, -0.885, 0).turn(0, 0, 3).part('paper', { mat: 'paper', paint: paintPaper });
    return S.union(cord, paper, metal, strip);
  },
};
function paintCord(c) { const { x, y, z, edge, cavity } = c; let col = P.mix(P.color('#b8352a'), P.color('#d0473a'), 0.5 + 0.5 * P.fbm(x * 90, y * 90, z * 90, 2, 2)); col = P.mix(col, P.color('#8f5a48'), P.ss(-0.1, -0.5, y) * 0.25); return P.mix(P.mix(col, P.color('#e8735e'), edge * 0.5), P.color('#5a1a16'), cavity * 0.6); }
function paintPaper(c) { const { x, y, z, cavity } = c; let col = P.mix(P.color('#f4f0e6'), P.color('#fffdf6'), 0.5 + 0.5 * P.fbm(x * 60, y * 60, z * 60, 4, 2)); col = P.mix(col, P.color('#d6ccb4'), P.ss(-0.9, -1.0, y) * 0.5); return P.mix(col, P.color('#b9ab8c'), cavity * 0.4); }
function paintBell(c) { const { x, y, z, ny, cavity, edge, ao } = c; let col = P.mix(P.color('#d9cfbf'), P.color('#e9e0d0'), 0.5 + 0.5 * P.fbm(x * 40, y * 40, z * 40, 3, 2)); const pat = P.clamp(cavity * 1.2 + P.ss(0.3, 1, ny) * 0.6 + (1 - ao) * 0.5, 0, 1) * P.ss(0.25, 0.6, P.fbm(x * 50, y * 50, z * 50, 5, 3) + 0.35); col = P.mix(col, P.color('#7fb8a2'), pat * 0.8); col = P.mix(col, P.color('#fffaf0'), edge * 0.6); return mulc(col, TF); }
