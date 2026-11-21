// basket_berries — a wide, low withy basket of wild berries with a bentwood bail handle. Replaces prop_basket_berries
// (catalog `basket`: straw, burns, breakable, drops berries; 0.66 x 0.40 x 0.64 m, origin foot centre).
// INTENT
//  silhouette: a broad shallow bowl of woven rods flaring to a thick rim, a single split-bamboo bail arching over it
//  (a little off centre, leaning), a low dark-red heap inside.
//  big forms: the woven bowl / the rim / the bail.
//  the eye rests on: the heap of red and blue-black berries with a few leaves, the straw bindings where the bail meets
//  the rim, the rows of the weave catching light.
//  wear: a picker's basket: berry stains at the rim, the rods grey-silvered outside, the base darker.
//  must NOT look like: the mushroom creel (tall, checker weave, strap), a bowl primitive, a pack basket.
import * as P from '../sdf.mjs';
import { pickMats, withyWeave, strawPaint, leafPaint, blade, rope, ropePaint, FAR, C, mix, ss, clamp } from './containers_lib.mjs';

const OUT = [[0.2, 0.0], [0.238, 0.03], [0.272, 0.09], [0.296, 0.15], [0.305, 0.178]];
const RIM_Y = 0.185, WALL = 0.016, FLOOR = 0.024;
const heap = (x, z) => 0.17 + 0.05 * Math.max(0, 1 - (x * x + (z + 0.03) ** 2) / 0.05) + 0.015 * Math.sin(x * 17 + z * 9);
const BAIL_A = 8;                                                 // degrees: the bail turned off the x axis

export default {
  name: 'basket_berries', id: 'sculpt_basket_berries',
  voxel: 0.0026, lods: [1800, 600, 200], farFrom: 2, farVoxel: 2.4,
  ground: 0, aoRange: 0.07, cavity: [0.004, 0.02], creaseAngle: 40,
  materials: pickMats('straw', 'fruit', 'leaf'),
  replaces: { file: 'assets/models/refined/prop_basket_berries.glb', scale: 0.69482 },
  notes: 'Sculpted berry basket (wide withy stake-and-strand bowl, thick rim, bentwood bail with straw bindings, berries heaped, leaves). Vertex colours on every LOD, no textures: batched, burnable prop. Families straw / fruit / leaf (as prop_basket_berries).',

  build() {
    const far = FAR();
    const prof = [[0, 0], ...OUT, [OUT[OUT.length - 1][0] - WALL, RIM_Y - 0.006]];
    for (let i = OUT.length - 2; i >= 1; i--) prof.push([OUT[i][0] - WALL, Math.max(FLOOR, OUT[i][1])]);
    prof.push([0, FLOOR]);
    let body = P.lathe(prof, { smooth: 0.003 });
    body = withyWeave(body, { y0: 0.012, y1: 0.165, pitch: 0.025, stakes: 22, amp: 0.0045, groove: 0.0035, far });
    let all = body.part('bb_weave', { mat: 'straw', paint: weavePaint });
    // thick rim: a bundle of rods bound with a spiral wrap
    let rim = P.torus(OUT[OUT.length - 1][0] - WALL / 2, 0.016).scale([1, 0.9, 1]).at(0, RIM_Y - 0.002, 0);
    if (!far) rim = new P.Shape(((f) => (x, y, z) => { const d = f(x, y, z); if (d > 0.006) return d; return d + 0.0022 * ss(0.3, 0.9, Math.sin(Math.atan2(x, z) * 60 + (y - RIM_Y) * 120)); })(rim.f), rim.b, rim.pf, 1.3);
    all = all.add(rim.part('bb_rim', { mat: 'straw', paint: rimPaint }));
    // the bail: a flat strip of split bamboo bent over, ends sunk inside the rim, bound with straw at the roots
    const R = OUT[OUT.length - 1][0] - 0.014, bp = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, a = Math.PI * t; bp.push([-Math.cos(a) * R, RIM_Y - 0.045 + Math.sin(a) * 0.255 + 0.0 * t, 0.012 * Math.sin(a)]); }
    let bail = P.tube(bp, 0.0115, { aspect: 2.0, up: [0, 0, 1] }).turn(0, BAIL_A, 0);
    all = all.add(bail.part('bb_bail', { mat: 'straw', paint: (c) => mix(mix(C('#c0a060'), C('#e0cc8c'), c.edge * 0.7 + 0.2 * ss(0.3, 0.9, c.ny)), C('#4a3a1c'), c.cavity * 0.6) }));
    if (!far) {
      let bind = null;
      for (const s of [-1, 1]) {
        const p0 = [s * R, RIM_Y - 0.01, 0];
        const pts = [];
        for (let i = 0; i <= 18; i++) { const t = i / 18, a = t * Math.PI * 2 * 3; pts.push([p0[0] - s * 0.002 + Math.cos(a) * 0.019, p0[1] + t * 0.045 - 0.008, p0[2] + Math.sin(a) * 0.019]); }
        const w = P.tube(pts, 0.0048, { smooth: false });
        bind = bind ? bind.add(w) : w;
      }
      all = all.add(bind.turn(0, BAIL_A, 0).part('bb_bind', { mat: 'straw', paint: ropePaint({ light: '#e8d08e', dark: '#c0a060' }) }));
    }
    // the heap: a dark red mound with berries on top, a few leaves
    const mound = new P.Shape((x, y, z) => (y - heap(x, z)) * 0.8, [-0.29, 0.02, -0.29, 0.29, 0.26, 0.29]).intersect(P.lathe([[0, FLOOR - 0.004], ...OUT.slice(1).map(([r, y]) => [r - WALL - 0.002, Math.max(FLOOR - 0.004, y)]), [0, 0.3]]));
    all = all.add(mound.part('bb_mound', { mat: 'fruit', paint: (c) => mix(C('#7a1e2a'), C('#3a1a2a'), 0.4 + 0.4 * P.fbm(c.x * 40, c.y * 40, c.z * 40, 2, 2) + 0.4 * c.cavity) }));
    if (!far) {
      const rnd = P.prng(31);
      let red = null, blue = null;
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.2, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const r = 0.024 + 0.008 * rnd();
        const b = P.sphere(r).scale([1, 0.92, 1]).at(x, heap(x, z) + r * 0.45, z);
        if (rnd() < 0.62) red = red ? red.add(b) : b; else blue = blue ? blue.add(b) : b;
      }
      all = all.add(red.part('bb_red', { mat: 'fruit', paint: (c) => mix(mix(C('#d8384a'), C('#a01e32'), 0.5 + 0.5 * P.noise3(c.x * 60, c.y * 60, c.z * 60, 1)), C('#ff9aa0'), c.edge * 0.4) }));
      all = all.add(blue.part('bb_blue', { mat: 'fruit', paint: (c) => mix(mix(C('#4a4878'), C('#2a2848'), 0.5 + 0.5 * P.noise3(c.x * 60, c.y * 60, c.z * 60, 2)), C('#9a9cc8'), c.edge * 0.5) }));
      let lv = null;
      for (const [x, z, a] of [[-0.08, 0.06, 0.5], [0.1, -0.05, 2.6], [0.02, 0.15, 4.4], [-0.15, -0.1, 3.4]]) {
        const y = heap(x, z) + 0.025, dx = Math.cos(a) * 0.075, dz = Math.sin(a) * 0.075;
        const l = blade([[x, y, z], [x + dx * 0.5, y + 0.016, z + dz * 0.5], [x + dx, y + 0.002, z + dz]], 0.024, { aspect: 3 });
        lv = lv ? lv.add(l) : l;
      }
      all = all.add(lv.part('bb_leaves', { mat: 'leaf', paint: leafPaint() }));
    } else {
      let lumps = null;
      for (const [x, z] of [[-0.08, 0.02], [0.09, -0.06], [0.05, 0.11], [-0.1, -0.12]]) { const s = P.ellipsoid([0.07, 0.03, 0.06]).at(x, heap(x, z) + 0.01, z); lumps = lumps ? lumps.add(s) : s; }
      all = all.add(lumps.part('bb_red', { mat: 'fruit', paint: () => C('#c03040') }));
    }
    return all;
  },
};

function weavePaint(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(C('#d2b27a'), C('#a8885a'), 0.5 + 0.5 * P.fbm(x * 20, y * 60, z * 20, 4, 2));
  col = mix(col, C('#c4bcaa'), ss(0.08, 0.18, y) * 0.25);                               // rods silvered toward the rim
  col = mix(col, C('#6a5032'), ss(0.04, 0.0, y) * 0.5);
  col = mix(col, C('#f0dcaa'), edge * 0.45);
  return mix(col, C('#4a361c'), cavity * 0.6);
}
function rimPaint(c) {
  let col = strawPaint({ light: '#dcbc80', dark: '#b0905a' })(c);
  const st = ss(0.55, 0.8, P.fbm(c.x * 14, 0, c.z * 14, 9, 2) + 0.5) * ss(-0.2, 0.6, c.ny);   // berry stains on the rim
  return mix(col, C('#7a2a3a'), st * 0.55);
}
