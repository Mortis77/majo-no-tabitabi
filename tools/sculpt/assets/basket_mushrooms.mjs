// basket_mushrooms — a forager's creel of split bamboo, heaped with mushrooms, a rope strap to sling it on the back.
// Replaces prop_basket_mushrooms (catalog `basket_mushrooms`: straw, burns, breakable; 0.39 x 0.45 x 0.37 m, origin foot
// centre).
// INTENT
//  silhouette: a round-bellied creel narrowing a little to a bound rim, a rope strap arching up from two side lugs and
//  leaning back, a heap of caps of different sizes crowning the mouth.
//  big forms: the woven body / the rim roll and lugs / the mushroom crown + the strap loop.
//  the eye rests on: the checker of the weave (two strip tones), the brown caps with pale undersides tipped toward us,
//  the knots where the strap meets the lugs.
//  wear: carried through wet woods: the foot darkened by moss and earth, the rim rubbed pale, one strip sprung at the rim.
//  must NOT look like: a cylinder bucket, the berry basket (that one is wide and low, withy), a pack basket with a bow.
import * as P from '../sdf.mjs';
import { pickMats, bandWeave, bandCell, rope, ropePaint, strawPaint, FAR, C, mix, ss, clamp } from './containers_lib.mjs';

const OUT = [[0.13, 0.0], [0.152, 0.02], [0.168, 0.08], [0.172, 0.15], [0.166, 0.22], [0.158, 0.275]];   // a straight-sided creel, a little waisted at the mouth
const RIM_Y = 0.282, WALL = 0.014, FLOOR = 0.022;
const WV = { y0: 0.022, y1: 0.262, pitch: 0.048, stakes: 16, ribW: 0.55 };
const SQ = 0.93;                                                // the body is a little oval (narrower in z)
// mushrooms: [x, z, cap radius, tilt x, tilt z, kind]  kind 0 brown cap, 1 pale small
const MUSH = [[-0.05, 0.03, 0.058, -18, 10, 0], [0.06, -0.04, 0.05, 15, -20, 0], [0.04, 0.08, 0.04, 30, 18, 0], [-0.08, -0.07, 0.045, -10, -28, 0], [0.1, 0.05, 0.03, 10, 34, 1], [-0.11, 0.06, 0.028, -30, 20, 1], [0.0, -0.1, 0.032, -36, 6, 1], [0.01, 0.0, 0.05, 6, -6, 0]];

export default {
  name: 'basket_mushrooms', id: 'sculpt_basket_mushrooms',
  voxel: 0.002, lods: [1800, 600, 200], farFrom: 2, farVoxel: 2.4,
  ground: 0, aoRange: 0.06, cavity: [0.003, 0.016], creaseAngle: 40,
  materials: pickMats('straw', 'food'),
  replaces: { file: 'assets/models/refined/prop_basket_mushrooms.glb', scale: 0.61323 },
  notes: 'Sculpted forager creel (split-bamboo checker weave, bound rim, side lugs, rope strap, mushrooms heaped). Vertex colours on every LOD, no textures: batched, burnable prop. Families straw / food (as prop_basket_mushrooms).',

  build() {
    const far = FAR();
    const prof = [[0, 0], ...OUT, [OUT[OUT.length - 1][0] - WALL, RIM_Y - 0.004]];
    for (let i = OUT.length - 2; i >= 1; i--) prof.push([OUT[i][0] - WALL, Math.max(FLOOR, OUT[i][1])]);
    prof.push([0, FLOOR]);
    let body = P.lathe(prof, { smooth: 0.003 }).scale([1, 1, SQ]);
    body = bandWeave(body, { ...WV, band: 0.003, groove: 0.0045, rib: 0.0035, far });
    let all = body.part('bm_weave', { mat: 'straw', paint: weavePaint });
    // rim: a rolled binding, wrapped with a diagonal strip
    const rr = OUT[OUT.length - 1][0] - WALL / 2;
    let rim = P.torus(rr, 0.0115).scale([1, 1.15, SQ]).at(0, RIM_Y - 0.004, 0);
    if (!far) rim = new P.Shape(((f) => (x, y, z) => { const d = f(x, y, z); if (d > 0.006) return d; return d + 0.0016 * ss(0.4, 0.9, Math.sin(Math.atan2(x, z) * 46 + (y - RIM_Y) * 160)); })(rim.f), rim.b, rim.pf, 1.3);
    // foot ring: a heavier strip round the base
    const foot = P.torus(0.13, 0.009).scale([1, 1, SQ]).at(0, 0.012, 0);
    // side lugs on +-x: little loops of cane the strap ties to
    let lugs = null;
    for (const s of [-1, 1]) {
      const l = P.torus(0.022, 0.0065).turn(0, 0, 90).at(s * 0.164, RIM_Y - 0.04, 0);
      lugs = lugs ? lugs.add(l) : l;
    }
    all = all.add(rim.add(foot).add(lugs).part('bm_rim', { mat: 'straw', paint: strawPaint({ light: '#d8b874', dark: '#a8864a' }) }));
    // strap: from lug to lug, arching up and leaning back over the mouth
    const sp = far
      ? [[-0.17, RIM_Y - 0.04, 0], [-0.13, 0.39, -0.07], [0, 0.44, -0.11], [0.13, 0.39, -0.07], [0.17, RIM_Y - 0.04, 0]]
      : [[-0.164, RIM_Y - 0.06, 0.012], [-0.18, RIM_Y - 0.02, 0.0], [-0.15, 0.37, -0.06], [-0.06, 0.43, -0.105], [0.05, 0.435, -0.11], [0.14, 0.38, -0.07], [0.18, RIM_Y - 0.02, 0.0], [0.164, RIM_Y - 0.06, 0.012]];
    let strap = rope(sp, 0.0085, { lay: 0.03, far });
    if (!far) for (const s of [-1, 1]) strap = strap.softAdd(P.ellipsoid([0.014, 0.016, 0.014]).at(s * 0.185, RIM_Y - 0.035, 0.0), 0.004);
    all = all.add(strap.part('bm_strap', { mat: 'straw', paint: ropePaint({ light: '#c8a874', dark: '#8a7048' }) }));
    // mushrooms: a mound of forest litter, caps tipped every way on it
    const mound = new P.Shape((x, y, z) => (y - (RIM_Y - 0.02 + 0.03 * Math.max(0, 1 - (x * x + z * z) / 0.022))) * 0.8, [-0.16, 0.2, -0.16, 0.16, 0.33, 0.16]).intersect(P.cylinder(0.148, 0.2).scale([1, 1, SQ]).at(0, 0.15, 0));
    all = all.add(mound.part('bm_litter', { mat: 'food', paint: (c) => mix(C('#6a4a30'), C('#3e2c1e'), 0.5 + 0.5 * P.fbm(c.x * 50, c.y * 50, c.z * 50, 3, 2)) }));
    let caps = null, stems = null;
    for (const [x, z, r, tx, tz, kind] of (far ? MUSH.slice(0, 5) : MUSH)) {
      const yb = RIM_Y + 0.012 + 0.03 * Math.max(0, 1 - (x * x + z * z) / 0.022);
      let cap = kind ? P.ellipsoid([r, r * 0.75, r]) : P.ellipsoid([r, r * 0.45, r]).softAdd(P.ellipsoid([r * 0.7, r * 0.42, r * 0.7]).at(0, r * 0.12, 0), r * 0.3);
      cap = cap.cut(P.ellipsoid([r * 0.82, r * 0.25, r * 0.82]).at(0, -r * 0.32, 0));        // the hollow underneath (gills)
      const st = P.taperedCapsule([0, -r * 0.9, 0], [0, -r * 0.1, 0], r * 0.22, r * 0.3);
      const place = (s) => s.turn(tx, 0, tz).at(x, yb + r * 0.55, z);
      caps = caps ? caps.add(place(cap)) : place(cap);
      stems = stems ? stems.add(place(st)) : place(st);
    }
    all = all.add(stems.part('bm_stems', { mat: 'food', paint: (c) => mix(C('#efe4cc'), C('#9a8a70'), c.cavity * 0.7) }));
    all = all.add(caps.part('bm_caps', { mat: 'food', paint: capPaint }));
    return all;
  },
};

function weavePaint(c) {
  const { x, y, z, cavity, edge } = c;
  const cell = bandCell(x, y, z / SQ, WV);
  // the uprights a shade darker than the broad weavers: the over-under reads at a glance
  let col = cell.rib ? mix(C('#b08c50'), C('#9a7840'), 0.5 + 0.5 * P.noise3(x * 30, y * 30, z * 30, 2)) : mix(C('#e2c684'), C('#cfae6c'), 0.5 + 0.5 * P.noise3(x * 8, cell.row * 3.1, z * 8, 5));
  col = mix(col, C('#5e5a34'), ss(0.06, 0.0, y) * 0.55);                      // mossy damp foot
  col = mix(col, C('#f0dca2'), edge * 0.4);
  return mix(col, C('#4a361c'), cavity * 0.6);
}
function capPaint(c) {
  const { x, y, z, ny, cavity, edge } = c;
  // brown caps darker at the crown, pale gills underneath; the small pale ones by colour of their size
  let col = mix(C('#b07a4a'), C('#7a4a2a'), ss(0.0, 0.8, ny));
  if (ny < -0.2) col = mix(C('#ead8b4'), C('#c8b08a'), cavity);
  col = mix(col, C('#d8b080'), 0.2 * ss(0.3, 0.8, P.cellular(x * 70, y * 70, z * 70, 3)));   // cracked cap skin
  col = mix(col, C('#f2dcb0'), edge * 0.35);
  return mix(col, C('#3a2414'), cavity * 0.5);
}
