// 岩起 rubble skirt — the ground torn open around the foot of an earth column (sits at ground level, any variant).
// Silhouette: a low, broken ring — plates of ground crust tipped up toward the column like a burst pie crust, high on
//   one side, sinking flat on the other; lumps and stones spilled outward between them.
// Big forms: two large heaved crust plates on the heavy side, five medium ones round the ring, a dozen small chips;
//   the dark rifts between them; the spill.
// Eye rests on: the lifted plate edges, a pale dry crust over a dark torn soil section; two or three big grey stones
//   thrown out on the heavy side.
// Wear story: seconds old — dry pale crust on top, damp dark soil in every break, nothing settled or overgrown.
// Must not look like: a doughnut, an even ring of identical wedges, a flat decal.
import * as S from '../sdf.mjs';
import * as K from './earth_column_common.mjs';

const HEAVY = 1.1; // the side where the ground broke hardest (rad about Y)
const RIN = 1.8, ROUT = 3.5;

function paintCrust(c) {
  const { x, y, z, ny, cavity, edge, ao } = c;
  let col = S.mix(S.color('#6a5b4d'), S.color('#7e6f60'), 0.5 + 0.5 * S.fbm(x * 1.6, y * 1.6, z * 1.6, 71, 3));
  // dry pale skin on up-facing crust, damp dark torn section on the sides and in the rifts
  col = S.mix(col, S.color('#9a8b78'), S.ss(0.45, 0.9, ny) * (0.55 + 0.3 * S.fbm(x * 3, 0, z * 3, 72, 2)));
  col = S.mix(col, S.color('#55463a'), S.ss(0.5, 0.1, ny) * 0.4);
  col = S.mix(col, S.color('#9a958c'), S.ss(0.2, 0.08, S.cellular(x * 6, y * 6, z * 6, 73)) * 0.4 * (1 - S.ss(0.5, 0.9, ny))); // grit in the section
  col = S.mix(col, S.color('#bba78c'), edge * 0.45);
  col = S.mix(col, S.color('#33281f'), cavity * 0.45 + (1 - ao) * 0.2);
  return col;
}
function paintStone(c) {
  const { x, y, z, ny, cavity, edge } = c;
  const k = Math.floor(S.noise3(x * 1.3, 0, z * 1.3, 81) * 4 + 4) % 3;
  let col = [S.color('#8f8b84'), S.color('#9e978b'), S.color('#7c7873')][k];
  col = S.mix(col, S.color('#6b665f'), S.ss(0.3, 0.6, S.fbm(x * 2.5, y * 2.5, z * 2.5, 82, 3)) * 0.4);
  col = S.mix(col, S.color('#5a4c40'), S.ss(0.15, -0.15, y) * 0.6);          // soil-stained where it lies
  col = S.mix(col, S.color('#cbc5b9'), edge * 0.55 + S.ss(0.6, 0.95, ny) * 0.15);
  return S.mix(col, S.color('#3e3833'), cavity * 0.35);
}

export default {
  name: 'earth_rubble',
  id: 'sculpt_earth_rubble',
  voxel: 0.018,
  lods: [900, 300],
  lodError: [0.06, 0.2],
  atlas: 512,
  ground: 0,
  aoRange: 0.4,
  cavity: [0.02, 0.08],
  creaseAngle: 50,
  hardAngle: 55,
  bandSlack: 0.05,
  materials: K.MATERIALS,
  notes: 'Earth-spell rubble skirt, laid around the foot of any earth_column_* at ground level. Pivot = column axis at ground level; buried 0.25 m. See .tmp/sculpt/earth_rubble/INSTALL.md.',

  build() {
    S.part('crust', { mat: 'rock', paint: paintCrust });
    S.part('stone', { mat: 'rock', paint: paintStone });
    const rnd = S.prng(4401);
    // ---- the heaved ring: a low mound of broken ground around the foot, diving under the grass at its outer edge
    const mound = new S.Shape((x, y, z) => {
      const r = Math.hypot(x, z), t = Math.atan2(z, x), heavy = 0.5 + 0.5 * Math.cos(t - HEAVY);
      const ro = ROUT - 0.35 + 0.7 * heavy + 0.7 * S.fbm(Math.cos(t) * 1.4, 0, Math.sin(t) * 1.4, 8, 3); // ragged outer edge
      const h = (0.16 + 0.2 * heavy) * S.ss(1.5, 2.1, r) * S.ss(ro, 2.4, r) - 0.06 + 0.06 * S.fbm(x * 1.2, 0, z * 1.2, 5, 2) - 0.5 * S.ss(ro, ro + 0.4, r);
      return Math.max((y - h) * 0.8, 1.2 - r);
    }, [-ROUT - 1.4, -0.3, -ROUT - 1.4, ROUT + 1.4, 0.5, ROUT + 1.4], null, 1.3)
      .rough({ type: 'billow', scale: 0.5, amp: 0.05, seed: 6 }).part('crust');
    // ---- plates of ground crust, broken and tipped up toward the column: 2 large (heavy side), 5 medium, 12 small
    //      (a burst crust breaks into few big plates and many chips — not into equal wedges)
    const plates = [];
    const sizes = [['L', HEAVY - 0.35], ['L', HEAVY + 0.55]];
    for (let i = 0; i < 5; i++) sizes.push(['M', HEAVY + 1.3 + i * 0.85 + (rnd() - 0.5) * 0.3]);
    for (let i = 0; i < 12; i++) sizes.push(['S', rnd() * 2 * Math.PI]);
    sizes.forEach(([k, mid], i) => {
      const heavy = 0.5 + 0.5 * Math.cos(mid - HEAVY);
      const size = k === 'L' ? 0.95 + 0.15 * rnd() : k === 'M' ? 0.66 + 0.12 * rnd() : 0.16 + 0.12 * rnd();
      const d = k === 'L' ? 2.75 : k === 'M' ? 2.35 + 0.3 * rnd() : 2.1 + 1.5 * rnd();
      const P = K.jagPoly(k === 'S' ? 5 : 5 + (i % 3), size, rnd, 0.22, 0.5, rnd() * 6).map(([x, z]) => [x * 1.2, z * 0.85]);
      const slope = k === 'S' ? (rnd() - 0.3) * 0.9 : 0.25 + heavy * 0.5 + rnd() * 0.1;
      const th = k === 'L' ? 0.4 : k === 'M' ? 0.3 : 0.12 + 0.08 * rnd();
      let p = K.prism(P, -th, 0, { tilt: [-slope, (rnd() - 0.5) * 0.3], tiltBot: [-slope, 0] }).part('crust');
      if (k !== 'S') p = p.chisel({ count: 3, depth: 0.05, radius: 0.35 * size, tilt: 0.3, seed: 10 + i })
        .rough({ type: 'fbm', scale: 0.7, amp: 0.03, seed: 12 + i, mask: 'up' });
      p = p.wear(k === 'S' ? 0.025 : 0.04, { vary: 0.6, seed: 20 + i })
        .turn(0, -mid * 180 / Math.PI + (k === 'S' ? rnd() * 90 : 0), 0)
        .at(Math.cos(mid) * d, (k === 'L' ? 0.2 : k === 'M' ? 0.1 : 0.04) + heavy * (k === 'S' ? 0.04 : 0.2), Math.sin(mid) * d);
      plates.push(p);
    });
    // ---- spilled clods (rounded, soil) and thrown stones (angular, grey), more on the heavy side
    const bits = [];
    for (let i = 0; i < 9; i++) {
      let t = rnd() * 2 * Math.PI; if (rnd() < 0.5) t = HEAVY + (rnd() - 0.5) * 2.2;
      const heavy = 0.5 + 0.5 * Math.cos(t - HEAVY);
      const stone = i % 2 === 0;
      const r = (stone ? 0.17 : 0.18) + rnd() * 0.13 + heavy * 0.12 + (i < 3 ? 0.14 : 0);
      const d = ROUT - 0.4 + rnd() * 0.8;
      const x = Math.cos(t) * d, z = Math.sin(t) * d;
      if (stone) {
        const P = K.jagPoly(5 + (i % 3), r, rnd, 0.2, 0.5, rnd() * 6);
        bits.push(K.prism(P, -0.2, r * (0.8 + 0.6 * rnd()), { tilt: [(rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8] })
          .turn((rnd() - 0.5) * 30, rnd() * 180, (rnd() - 0.5) * 30).at(x, -0.05, z).part('stone').wear(0.03, { seed: 40 + i }));
      } else {
        bits.push(S.ellipsoid([r * 1.2, r * 0.7, r]).turn((rnd() - 0.5) * 30, rnd() * 180, 0).at(x, r * 0.2, z)
          .chisel({ count: 3, depth: r * 0.25, radius: r * 0.8, seed: 50 + i }).part('crust'));
      }
    }
    const all = S.union(mound, ...plates, ...bits);
    return all.intersect(S.plane([0, -1, 0], [0, -0.25, 0]));
  },

  async before(ctx) { return K.beforePillar(ctx, 0.4); },
};

/** convex hull (monotone chain) of 2D points */
function hull(P) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
