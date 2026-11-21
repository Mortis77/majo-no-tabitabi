// crate_carrots — a low slatted market crate heaped with carrots, greens still on. Replaces prop_crate_carrots (catalog
// `crate_carrots`: wood, breakable, drops carrots; 0.70 x 0.403 x 0.556 m, origin foot centre).
// INTENT
//  silhouette: a low open crate, two slats a side with a gap you see the carrots through, solid end boards with a hand
//  slot; the heap rises higher at the left, a spray of carrot tops spilling over the front-right rim.
//  big forms: the crate / the heap of carrots / the green tops.
//  the eye rests on: the orange of the carrots against the grey-brown slats, the green fronds breaking the box outline,
//  the carrots seen through the slat gap.
//  wear: a market crate: slats knocked and uneven, earth on the floor boards and the foot, edges rubbed.
//  must NOT look like: a box with an orange lid, carrots in rows, symmetric heap.
import * as P from '../sdf.mjs';
import { pickMats, woodPaint, board, nail, nailPaint, blade, leafPaint, FAR, C, mix, ss, clamp } from './containers_lib.mjs';

const X = 0.35, Z = 0.278, WALL_H = 0.24;
const PO = 0.042;                                   // corner post
const SL = 0.016;                                   // slat thickness
const heap = (x, z) => 0.19 + 0.1 * Math.exp(-(((x + 0.07) ** 2) / 0.045 + ((z + 0.02) ** 2) / 0.05)) + 0.02 * Math.sin(x * 13 + z * 7);

function carrots(far) {
  const rnd = P.prng(17), out = [];
  const N = far ? 0 : 15;
  for (let i = 0; i < N; i++) {
    const x = -0.25 + 0.5 * rnd(), z = -0.18 + 0.36 * rnd();
    const a = rnd() * Math.PI * 2, L = 0.2 + 0.06 * rnd(), r0 = 0.02 + 0.005 * rnd();
    const dx = Math.cos(a) * L / 2, dz = Math.sin(a) * L / 2;
    const xa = clamp(x - dx, -X + 0.06, X - 0.06), za = clamp(z - dz, -Z + 0.06, Z - 0.06), xb = clamp(x + dx, -X + 0.04, X - 0.04), zb = clamp(z + dz, -Z + 0.04, Z - 0.04);
    const ya = heap(xa, za) + r0 * 0.35, yb = heap(xb, zb) + 0.004;
    const mid = [(xa + xb) / 2 + 0.01 * (rnd() - 0.5), (ya + yb) / 2 + 0.008, (za + zb) / 2 + 0.01 * (rnd() - 0.5)];
    out.push({ pts: [[xa, ya, za], mid, [xb, yb, zb]], r0, crown: [xa, ya, za], dir: [xa - xb, 0, za - zb], tops: i % 3 === 0 });
  }
  return out;
}

export default {
  name: 'crate_carrots', id: 'sculpt_crate_carrots',
  voxel: 0.0028, lods: [1800, 600, 200], farFrom: 2, farVoxel: 2.4,
  ground: 0, aoRange: 0.08, cavity: [0.004, 0.02], creaseAngle: 40,
  materials: pickMats('wood', 'metal', 'fruit', 'leaf'),
  replaces: { file: 'assets/models/refined/prop_crate_carrots.glb', scale: 0.98067 },
  notes: 'Sculpted market crate of carrots (slatted sides with a see-through gap, end boards with hand slots, carrots heaped unevenly, greens spilling over the rim). Vertex colours on every LOD, no textures: batched prop. Families wood / metal / fruit / leaf.',

  build() {
    const far = FAR();
    let all = null; const add = (s) => { all = all ? all.add(s) : s; };
    // floor
    add(board([-X + 0.01, 0.0, -Z + 0.01], [X - 0.01, 0.026, Z - 0.01], { r: 0.004 }).part('cc_floor', { mat: 'wood', paint: woodPaint({ tone: 0.8, grain: 'x', seed: 3, extra: earth }) }));
    // posts
    let k = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      add(board([sx > 0 ? X - PO : -X, 0, sz > 0 ? Z - PO : -Z], [sx > 0 ? X : -X + PO, WALL_H + (k === 1 ? 0.008 : 0), sz > 0 ? Z : -Z + PO], { r: 0.006 }).part('cc_post' + k, { mat: 'wood', paint: woodPaint({ tone: 0.9, grain: 'y', seed: 5 + k, extra: earth }) }));
      k++;
    }
    // long sides (+-z): two slats each, a gap between; far: one solid panel
    let si = 0, nails = null; const addN = (s) => { nails = nails ? nails.add(s) : s; };
    for (const sz of [-1, 1]) {
      const slats = far ? [[0.02, WALL_H - 0.004]] : sz > 0 ? [[0.02, 0.112], [0.15, WALL_H - 0.004]] : [[0.02, 0.105], [0.142, WALL_H - 0.004]];
      for (const [y0, y1] of slats) {
        let s = board([-X + PO - 0.006, y0, sz > 0 ? Z - PO / 2 - SL / 2 + 0.006 : -Z + PO / 2 - SL / 2 - 0.006], [X - PO + 0.006, y1, sz > 0 ? Z - PO / 2 + SL / 2 + 0.006 : -Z + PO / 2 + SL / 2 - 0.006], { r: 0.004, bow: sz * 0.003, bowAxis: 2 });
        if (sz > 0 && y0 > 0.1 && !far) s = s.turn(0, 0, -1.2);                       // the front top slat knocked askew
        add(s.part('cc_s' + si, { mat: 'wood', paint: woodPaint({ tone: [0.3, 0.6, 0.05, 0.45][si % 4], grain: 'x', seed: 20 + si, extra: earth }) }));
        if (!far) for (const e of [-1, 1]) addN(nail([e * (X - PO / 2), (y0 + y1) / 2, sz * (Z - PO / 2 + SL / 2 + 0.006) * 1], [0, 0, sz], 0.0075));
        si++;
      }
    }
    // end boards (+-x): solid, a hand slot through each
    for (const sx of [-1, 1]) {
      let e = board([sx > 0 ? X - PO / 2 - SL / 2 + 0.004 : -X + PO / 2 - SL / 2 - 0.004, 0.02, -Z + PO - 0.006], [sx > 0 ? X - PO / 2 + SL / 2 + 0.004 : -X + PO / 2 + SL / 2 - 0.004, WALL_H - 0.004, Z - PO + 0.006], { r: 0.004 });
      if (!far) e = e.cut(P.capsule([0, 0.185, -0.055], [0, 0.185, 0.055], 0.016).scale([3, 1, 1]).at(sx * (X - PO / 2), 0, 0));
      add(e.part('cc_end' + (sx > 0 ? 'r' : 'l'), { mat: 'wood', paint: woodPaint({ tone: sx > 0 ? 0.2 : 0.7, grain: 'z', seed: 40 + sx, extra: earth }) }));
    }
    if (nails) add(nails.part('cc_nails', { mat: 'metal', paint: (c) => mix(C('#4a4644'), C('#a9a6a0'), c.edge * 0.6) }));
    // the heap's body: a mound filling the crate (dark carrot-and-earth), the carrots lie on it
    const inner = P.boxFromTo([-X + PO * 0.5, 0.02, -Z + PO * 0.5, X - PO * 0.5, 0.5, Z - PO * 0.5]);
    const mound = new P.Shape((x, y, z) => (y - heap(x, z)) * 0.85, [-X, 0, -Z, X, 0.36, Z]).intersect(inner);
    add(mound.part('cc_mound', { mat: 'fruit', paint: (c) => mix(C('#b8582a'), C('#6a3a20'), 0.4 + 0.5 * c.cavity + 0.3 * P.fbm(c.x * 30, c.y * 30, c.z * 30, 2, 2)) }));
    if (far) {
      // far: a few big orange lumps and one green spray so the colour story holds at 200 triangles
      let lumps = null;
      for (const [x, z] of [[-0.12, 0.0], [0.08, -0.08], [0.14, 0.1], [-0.05, 0.14]]) { const s = P.ellipsoid([0.09, 0.035, 0.05]).turn(0, x * 300, 0).at(x, heap(x, z) + 0.012, z); lumps = lumps ? lumps.add(s) : s; }
      add(lumps.part('cc_carrot', { mat: 'fruit', paint: carrotPaint }));
      add(P.ellipsoid([0.1, 0.05, 0.07]).turn(0, 0, -30).at(0.2, 0.31, 0.2).part('cc_tops', { mat: 'leaf', paint: leafPaint() }));
      return all;
    }
    let car = null, tops = null;
    for (const c of carrots(far)) {
      const r0 = c.r0;
      let s = P.tube(c.pts, (t) => r0 * (1 - 0.9 * Math.pow(t, 1.15)) * (t < 0.06 ? 0.85 + 2.5 * t : 1) + 0.0028);
      car = car ? car.add(s) : s;
      if (c.tops) {
        const d = P.norm(c.dir), [cx, cy, cz] = c.crown;
        for (let j = 0; j < 3; j++) {
          const sp = (j - 1) * 0.5, side = [-d[2], 0, d[0]];
          const tip = [cx + d[0] * 0.15 + side[0] * sp * 0.12, cy + 0.07 + 0.03 * j, cz + d[2] * 0.13 + side[2] * sp * 0.12];
          const mid = [cx + d[0] * 0.06 + side[0] * sp * 0.05, cy + 0.075, cz + d[2] * 0.06 + side[2] * sp * 0.05];
          const b = blade([[cx + d[0] * 0.01, cy + 0.006, cz + d[2] * 0.01], mid, [tip[0], tip[1] - 0.035, tip[2]]], 0.013, { aspect: 3.6, up: [side[0], 0.3, side[2]] });
          tops = tops ? tops.add(b) : b;
        }
      }
    }
    // one bunch of greens spilling over the front-right rim (breaks the box outline)
    for (let j = 0; j < 4; j++) {
      const base = [0.17 + j * 0.02, heap(0.17, 0.16) + 0.01, 0.15 + j * 0.008];
      const b = blade([base, [base[0] + 0.03 + j * 0.012, 0.36 + 0.012 * j, base[2] + 0.08], [base[0] + 0.05 + j * 0.03, 0.33 - 0.01 * j, Z + 0.02]], 0.014, { aspect: 3.6, up: [0.3, 0.6, -0.4] });
      tops = tops.add(b);
    }
    add(car.part('cc_carrot', { mat: 'fruit', paint: carrotPaint }));
    add(tops.part('cc_tops', { mat: 'leaf', paint: leafPaint({ light: '#97bb5a', dark: '#5f8c3c' }) }));
    return all;
  },
};

function carrotPaint(c) {
  const { x, y, z, cavity, edge, ny } = c;
  let col = mix(C('#f0923e'), C('#d8662a'), 0.5 + 0.5 * P.fbm(x * 40, y * 40, z * 40, 7, 2));
  col = mix(col, C('#f6b064'), ss(0.3, 0.9, ny) * 0.4);
  col = mix(col, C('#ffd29a'), edge * 0.3);
  return mix(col, C('#6a2e14'), cavity * 0.6);
}
function earth(c, col) { return mix(col, C('#5e4a36'), ss(0.08, 0.0, c.y) * 0.35); }
