// crate_apples — an orchard picking crate, apples heaped higher than its sides. Replaces prop_crate_apples (catalog
// `crate_apples`: wood, breakable, spills apples; 0.90 x 0.70 x 0.67 m, origin foot centre).
// INTENT
//  silhouette: two thick end boards with arched tops and hand holes standing above three gapped side slats; between
//  them a heap of apples, higher toward the left end and spilling over the front slat.
//  big forms: the end boards / the slatted sides / the apple heap.
//  the eye rests on: the red-gold apples, the dark hand holes, the light through the slat gaps.
//  wear: picked into every autumn: end boards rubbed pale round the holes, slats grey-silvered, earth on the foot.
//  must NOT look like: the carrot crate (taller, arched ends), a box with a red top, apples in a grid.
import * as P from '../sdf.mjs';
import { pickMats, woodPaint, board, nail, appleHeap, applePaint, stalkPaint, leafPaint, blade, FAR, C, mix, ss } from './containers_lib.mjs';

const X = 0.45, Z = 0.334, END_H = 0.6, SIDE_H = 0.5;
const ET = 0.03;                                      // end board thickness
const heap = (x, z) => 0.5 + 0.075 * Math.exp(-(((x + 0.12) ** 2) / 0.07 + (z ** 2) / 0.06)) + 0.04 * Math.exp(-(((x - 0.2) ** 2) / 0.02 + ((z - 0.1) ** 2) / 0.02)) - 0.03 * (z < 0 ? -z / 0.3 : 0);

export default {
  name: 'crate_apples', id: 'sculpt_crate_apples',
  voxel: 0.0032, lods: [1800, 600, 200], farFrom: 1, farVoxel: 2.0,
  ground: 0, aoRange: 0.08, cavity: [0.004, 0.022], creaseAngle: 40,
  materials: pickMats('wood', 'metal', 'fruit', 'leaf'),
  replaces: { file: 'assets/models/refined/prop_crate_apples.glb', scale: 0.87213 },
  notes: 'Sculpted orchard crate (arched end boards with hand holes, three gapped slats a side, apples heaped unevenly, a few leaves). Vertex colours on every LOD, no textures: batched prop. Families wood / metal / fruit / leaf.',

  build() {
    const far = FAR();
    let all = board([-X + ET, 0.02, -Z + 0.01], [X - ET, 0.045, Z - 0.01], { r: 0.004 }).part('ka_floor', { mat: 'wood', paint: woodPaint({ tone: 0.8, grain: 'x', seed: 2 }) });
    // end boards: thick, arched top, hand hole
    for (const sx of [-1, 1]) {
      const prof = [[-Z, 0], [Z, 0], [Z, END_H - 0.07]];
      for (let i = 1; i < 8; i++) { const t = i / 8, zz = Z - 2 * Z * t; prof.push([zz, END_H - 0.07 + 0.07 * Math.sin(Math.PI * t) ** 0.6]); }
      prof.push([-Z, END_H - 0.07]);
      let e = P.extrude(prof.map(([z, y]) => [z, y]), ET, { round: 0.005 }).turn(0, 90, 0).at(sx * (X - ET / 2), 0, 0);
      e = e.cut(P.capsule([0, END_H - 0.13, -0.075], [0, END_H - 0.13, 0.075], 0.024).at(sx * (X - ET / 2), 0, 0));
      if (sx < 0 && !far) e = e.chip({ at: [-X, END_H - 0.04, Z - 0.03], dir: [-0.5, 0.5, 0.7], depth: 0.012, spread: 0.6, seed: 4 });
      all = all.add(e.part('ka_end' + (sx > 0 ? 'r' : 'l'), { mat: 'wood', paint: woodPaint({ tone: sx > 0 ? 0.15 : 0.55, grain: 'z', seed: 5 + sx, silver: 0.3, extra: handRub }) }));
    }
    // side slats: three a side with gaps you can see through; far: one panel
    let si = 0, nails = null; const addN = (s) => { nails = nails ? nails.add(s) : s; };
    for (const sz of [-1, 1]) {
      const slats = (sz > 0 ? [[0.0, 0.13], [0.185, 0.33], [0.385, SIDE_H]] : [[0.0, 0.145], [0.2, 0.325], [0.38, SIDE_H]]);
      for (const [y0, y1] of slats) {
        const zc = sz * (Z - 0.011);
        const s = board([-X + ET - 0.008, y0, zc - 0.011], [X - ET + 0.008, y1, zc + 0.011], { r: 0.004, bow: sz * 0.003, bowAxis: 2 });
        all = all.add(s.part('ka_s' + si, { mat: 'wood', paint: woodPaint({ tone: [0.35, 0.05, 0.6, 0.2, 0.75, 0.45][si % 6], grain: 'x', seed: 20 + si, silver: 0.5 }) }));
        if (!far) for (const e of [-1, 1]) addN(nail([e * (X - ET / 2), (y0 + y1) / 2, sz * Z], [0, 0, sz], 0.0085));
        si++;
      }
    }
    if (nails) all = all.add(nails.part('ka_nails', { mat: 'metal', paint: (c) => mix(C('#4a4644'), C('#a9a6a0'), c.edge * 0.6) }));
    // the heap
    const fill = new P.Shape((x, y, z) => (y - heap(x, z) + 0.04) * 0.8, [-X, 0.02, -Z, X, 0.62, Z]).intersect(P.boxFromTo([-X + ET + 0.002, 0.03, -Z + 0.024, X - ET - 0.002, 0.7, Z - 0.024]));
    all = all.add(fill.part('ka_fill', { mat: 'fruit', paint: () => C('#5a2418') }));
    const ap = appleHeap({ h: heap, inside: (x, z) => Math.abs(x) < X - ET - 0.045 && Math.abs(z) < Z - 0.06, x0: -X, x1: X, z0: -Z, z1: Z, spacing: far ? 0.13 : 0.118, r: far ? [0.06, 0.064] : [0.054, 0.062], seed: 23, far, skip: far ? 0 : 0.06 });
    let bodies = ap.bodies;
    if (!far) bodies = bodies.add(P.ellipsoid([0.05, 0.045, 0.05]).turn(30, 0, 10).at(0.08, SIDE_H + 0.03, Z - 0.03));   // one riding the front slat
    all = all.add(bodies.part('ka_apples', { mat: 'fruit', paint: applePaint({ red: '#c8402c', blush: '#e8c050' }) }));
    if (ap.stalks) all = all.add(ap.stalks.part('ka_stalks', { mat: 'wood', paint: stalkPaint }));
    if (!far) {
      let lv = null;
      for (const [x, z, a] of [[-0.2, 0.1, 0.4], [0.05, -0.12, 2.1], [0.26, 0.05, 3.6], [-0.05, 0.2, 5.0]]) {
        const y = heap(x, z) + 0.045, dx = Math.cos(a) * 0.08, dz = Math.sin(a) * 0.08;
        const l = blade([[x, y, z], [x + dx * 0.5, y + 0.02, z + dz * 0.5], [x + dx, y + 0.005, z + dz]], 0.026, { aspect: 4 });
        lv = lv ? lv.add(l) : l;
      }
      all = all.add(lv.part('ka_leaves', { mat: 'leaf', paint: leafPaint() }));
    }
    return all;
  },
};

function handRub(c, col) {
  const d = Math.hypot(Math.max(0, Math.abs(c.z) - 0.075), c.y - (END_H - 0.13));
  return mix(col, C('#e0c8a0'), ss(0.06, 0.025, d) * 0.5);
}
