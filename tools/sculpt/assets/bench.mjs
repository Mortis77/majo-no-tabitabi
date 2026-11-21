// bench — a low village bench (長凳). Replaces prop_bench (catalog `bench`; 1.60 x 0.31 x 0.31 m, origin foot centre).
// INTENT
//  silhouette: one thick slab with a waney back edge, carried on four round legs that splay out at both ends, a rail
//  between each pair — long, low and a little crooked, never a box on four posts.
//  big forms: the slab / the two splayed leg pairs / the rails.
//  the eye rests on: the wedged leg tops showing through the seat, the hollow polished where people sit, the split at
//  the right end held by an iron cramp.
//  wear: decades outside a tea house: the seat silvered at the ends and polished honey in the hollow, the front edge
//  rounded by legs and hands, feet dark from wet ground, bark still clinging under the back edge.
//  must NOT look like: a primitive, the pack bench, symmetric, evenly detailed.
import * as P from '../sdf.mjs';
import { C, mix, ss, clamp, MATS, splitCut, board, zone, brk, woodPaint, endGrainPaint, barkPaint, ironPaint, FAR, add } from './woodwork_lib.mjs';

const TOP = 0.307, TH = 0.068, HX = 0.795;          // seat top, thickness, half length
const ZF = 0.152;                                    // straight front edge
const zb = (x) => -0.138 - 0.012 * Math.sin(x * 4.1 + 0.7) - 0.006 * Math.sin(x * 11.3);   // waney back edge
const LEGS = [];                                     // [top, foot]
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const tx = sx * (sx > 0 ? 0.6 : 0.585) , tz = sz * 0.07 - 0.005;
  LEGS.push([[tx, TOP + 0.002, tz], [tx + sx * 0.1, 0, tz + sz * 0.06 + (sx > 0 && sz > 0 ? 0.004 : 0)]]);
}
const HOLLOW = [-0.2, 0.02];                         // centre of the worn hollow (x, z)

export default {
  name: 'bench', id: 'sculpt_bench',
  voxel: 0.0034, lods: [1800, 600, 200], lodError: [0.003, 0.009, 0.03], farFrom: 2, farVoxel: 2.2,
  ground: 0, aoRange: 0.12, cavity: [0.005, 0.025], creaseAngle: 42, bandSlack: 0.02,
  materials: { wood: MATS.wood, cord: { name: 'cord', surface: 'wood', look: { rim: 0.3 } }, metal: MATS.metal },
  gameMats: { wood: 'MI_Trim_Furniture_wood', cord: 'MI_Trim_Metal_wood', metal: 'MI_Trim_Metal_metal' },
  replaces: { file: 'assets/models/refined/prop_bench.glb', scale: 0.57623 },
  closeups: [[[0.68, 0.26, 0.0], 35, 38, 0.75], [[-0.62, 0.16, 0.0], 210, 14, 1.0]],
  anchors: { seat: [HOLLOW[0], TOP - 0.006, HOLLOW[1]] },
  notes: 'Sculpted low bench: waney-edged slab, four splayed round legs with wedged through-tenons, rails, worn hollow seat, a split held by an iron cramp. Vertex colours on every LOD, no textures (batched prop). Materials MI_Trim_Furniture_wood / MI_Trim_Metal_wood / MI_Trim_Metal_metal as prop_bench.',

  build() {
    const far = FAR();
    // fixed part order (far field and workers must agree on ids)
    const pSeat = P.part('seat', { mat: 'wood', paint: paintSeat });
        const pBark = P.part('barkstrip', { mat: 'wood', paint: barkPaint({ seed: 3 }) });
    const pEnds = P.part('seatends', { mat: 'wood', paint: endGrainPaint({ axis: 'x', centre: [-0.02, 0.14], R: 0.16, tone: 0.55, heart: 0.5 }) });
    const pLeg = P.part('legs', { mat: 'wood', paint: woodPaint({ tone: 0.62, axis: 'y', seed: 5, silver: 0.1, foot: 0.06, edge: 0.4 }) });
    const pEnd = P.part('tenons', { mat: 'cord', paint: endGrainPaint({ axis: 'y', R: 0.024, tone: 0.3, heart: 0.4 }) });
    const pWedge = P.part('wedges', { mat: 'cord', paint: (c) => mix(C('#6a4a30'), C('#3a281a'), c.cavity) });
    const pIron = P.part('cramp', { mat: 'metal', paint: ironPaint({ seed: 2, rust: 0.6 }) });
    const pRail = P.part('rails', { mat: 'wood', paint: woodPaint({ tone: 0.75, axis: 'z', seed: 8, silver: 0.1, edge: 0.4 }) });
    const tag = (s, p) => new P.Shape(s.f, s.b, () => p, s.lip);

    // ------------------------------------------------------------------ seat: slab with a waney back, ends not square
    let slab = board([-HX, TOP - TH, -0.17, HX, TOP, ZF], { r: 0.01, bow: -0.004, axis: 'x' });
    const wane = new P.Shape((x, y, z) => (zb(x) - z) * 0.95, [-1, -1, -1, 1, 1, 1]);
    slab = slab.softIntersect(wane, 0.016);
    // ends: left end cut a little out of square, right end square-ish
    slab = slab.intersect(P.plane(P.norm([-1, 0, 0.09]), [-HX + 0.004, 0, 0]));
    slab = slab.intersect(P.plane(P.norm([1, 0, 0.03]), [HX, 0, 0]));
    if (!far) {
      // worn hollow: a broad shallow dish where people sit
      slab = slab.softCut(P.ellipsoid([0.34, 0.03, 0.17]).at(HOLLOW[0], TOP + 0.03 - 0.007, HOLLOW[1]), 0.04);
      // the split at the right end, running in along the grain, and a knocked corner front-left
      slab = slab.cut(splitCut([HX + 0.03, 0.036], [HX - 0.3, 0.03], TOP + 0.001, { d0: 0.05, w0: 0.012, wig: 0.004, seed: 4 }));
      slab = slab.cut(brk([-HX + 0.01, TOP - 0.005, ZF - 0.01], [-0.6, 0.6, 0.5], 0.035, 7));
      // leg holes (the tenons fill them)
      for (const [t] of LEGS) slab = slab.cut(P.cylinder(0.025, 0.2).at(t[0], TOP - 0.15, t[2]));
    }
    slab = slab.wear(0.004, { vary: 0.7, seed: 6 });
    let seat = tag(slab, pSeat);
    if (!far) {
      // crisp colour zones: the polished hollow, the bark strip under the back edge
      const bark = tag(zone(slab, (x, y, z) => Math.max(z - zb(x) - 0.018, y - (TOP - 0.03))), pBark);
      const endz = tag(zone(slab, (x) => (HX - 0.005) - Math.abs(x)), pEnds);
      seat = seat.add(bark).add(endz);
    }

    // ------------------------------------------------------------------ legs: round, tapering, splayed; wedged tenons
    let legs = null, ends = null, wedges = null;
    LEGS.forEach(([t, f], i) => {
      const mid = [t[0] + (f[0] - t[0]) * 0.5 + 0.008 * (i % 2 ? 1 : -1), (t[1] - 0.06 + f[1]) / 2, t[2] + (f[2] - t[2]) * 0.5 + 0.006 * (i > 1 ? 1 : -1)];
      const leg = P.tube([[t[0], t[1] - 0.06, t[2]], mid, f], (u) => 0.03 - 0.006 * u).add(P.taperedCapsule([t[0], TOP - 0.03, t[2]], [t[0], t[1] - 0.09, t[2]], 0.025, 0.025))
        .intersect(P.plane([0, -1, 0], [0, 0.0, 0]));
      legs = add(legs, leg);
      if (!far) {
        // the tenon end on the seat top (end grain), a wedge across it
        const e = P.cylinder(0.025, 0.035).at(t[0], TOP - 0.0345, t[2]);
        ends = add(ends, e);
        wedges = add(wedges, P.boxFromTo([-0.0035, -0.002, -0.025, 0.0035, 0.0012, 0.025]).turn(0, 20 + i * 37, 0).at(t[0], TOP, t[2]));
      }
    });
    // rails between each pair (front-back), let into the legs
    let rails = null;
    for (const sx of [-1, 1]) {
      const a = LEGS.filter(([t]) => Math.sign(t[0]) === sx);
      const pt = (L, u) => [L[0][0] + (L[1][0] - L[0][0]) * u, L[0][1] + (L[1][1] - L[0][1]) * u, L[0][2] + (L[1][2] - L[0][2]) * u];
      const u = sx > 0 ? 0.62 : 0.66;
      const p0 = pt(a[0], u), p1 = pt(a[1], u);
      rails = add(rails, P.taperedCapsule(p0, p1, 0.02, 0.019));
    }
    let out = seat.add(tag(legs, pLeg)).add(tag(rails, pRail));
    if (!far) {
      out = out.add(tag(ends, pEnd)).add(tag(wedges, pWedge));
      // iron cramp across the split, its two legs driven in
      const cramp = P.roundBox([0.013, 0.008, 0.074], 0.002).at(0, 0.002, 0).add(P.roundBox([0.013, 0.03, 0.009], 0.002).at(0, -0.01, 0.034)).add(P.roundBox([0.013, 0.03, 0.009], 0.002).at(0, -0.01, -0.034))
        .turn(0, 8, 0).at(HX - 0.085, TOP, 0.034);
      out = out.add(tag(cramp, pIron));
    }
    return out;
  },
};

function paintSeat(c) {
  const { x, y, z, ny, edge, cavity } = c;
  let col = woodPaint({ tone: 0.32, axis: 'x', seed: 2, silver: 0.35, edge: 0.55 })(c);
  // the ends weather grey, the underside darker
  col = mix(col, C('#a89c8a'), 0.35 * ss(0.45, 0.78, Math.abs(x)) * (ny > 0.3 ? 1 : 0.4));
  col = mix(col, C('#d9b07e'), 0.3 * ss(0.12, 0.155, z) * (ny > 0 ? 1 : 0));   // front edge rubbed light
  // the hollow: polished by sitting, warmer and a touch lighter, fading out softly (no decal edge)
  const r = Math.hypot((x - HOLLOW[0]) / 0.3, (z - HOLLOW[1]) / 0.14);
  if (ny > 0.6) col = mix(col, C('#d69a62'), 0.45 * ss(1.0, 0.3, r));
  return col;
}
function paintHollow(c) {
  const { x, z, cavity } = c;
  const r = Math.hypot((x - HOLLOW[0]) / 0.27, (z - HOLLOW[1]) / 0.12);
  let col = mix(C('#d0a46c'), C('#c09060'), ss(0.2, 1, r));                  // polished honey, deeper at the rim
  col = mix(col, C('#e2be88'), 0.4 * ss(0.6, 0.0, r));
  return mix(col, C('#5a3c24'), cavity * 0.4);
}

