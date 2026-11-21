// stool — a three-legged village stool (小凳). Replaces prop_stool (catalog `stool`; old 0.675 x 0.45 x 0.675 m block).
// INTENT
//  silhouette: a thick oval seat on three long legs that splay wide like a milking stool — a tripod, light and stable,
//  not the pack's square block.
//  big forms: the seat (thick, bevelled underneath, one side cut straight where it met the board's edge) / three legs.
//  the eye rests on: the front leg mended with a splint and pale cord, the three wedged leg tops in the worn seat.
//  wear: the seat dished and honey-polished in the middle, edges rubbed pale; legs darker, feet stained by the yard; the
//  splint newer, paler wood than the leg it saves.
//  must NOT look like: a primitive, the pack stool, symmetric, evenly detailed.
import * as P from '../sdf.mjs';
import { C, mix, ss, MATS, zone, woodPaint, endGrainPaint, cordPaint, lashing, FAR, add } from './woodwork_lib.mjs';

const TOP = 0.45, TH = 0.062;
const LEGS = [[8, 0.325, 0.112], [128, 0.335, 0.108], [246, 0.33, 0.115]].map(([a, rf, rt], i) => {
  const r = a * Math.PI / 180, s = Math.sin(r), c = Math.cos(r);
  return { top: [s * rt, TOP + 0.001, c * rt - 0.005], foot: [s * rf, 0, c * rf + 0.012], i };
});
const legAt = (L, u) => [L.top[0] + (L.foot[0] - L.top[0]) * u, L.top[1] + (L.foot[1] - L.top[1]) * u, L.top[2] + (L.foot[2] - L.top[2]) * u];
const SPLINT = LEGS[0];                      // the front leg is the mended one
const legR = (u) => 0.026 - 0.006 * u;

export default {
  name: 'stool', id: 'sculpt_stool',
  voxel: 0.0026, lods: [1800, 600, 200], lodError: [0.0025, 0.007, 0.02], farFrom: 2, farVoxel: 2.4,
  ground: 0, aoRange: 0.1, cavity: [0.004, 0.02], creaseAngle: 42, bandSlack: 0.02,
  materials: { wood: MATS.wood },
  gameMats: { wood: 'wood' },
  replaces: { file: 'assets/models/refined/prop_stool.glb', scale: 0.9 },
  anchors: { seat: [0, TOP - 0.006, 0] },
  closeups: [[legAt(SPLINT, 0.5), 20, 12, 0.55], [[0, TOP, 0], 160, 50, 0.75]],
  notes: 'Sculpted three-legged stool: oval bevelled seat with a worn hollow, three splayed round legs with wedged through-tenons, the front leg mended with a splint and cord. Footprint is a tripod (about 0.62 x 0.56 m) inside the old 0.675 square. Vertex colours on every LOD, material `wood` as prop_stool.',

  build() {
    const far = FAR();
    const pSeat = P.part('seat', { mat: 'wood', paint: paintSeat });
    const pLeg = P.part('legs', { mat: 'wood', paint: woodPaint({ tone: 0.66, axis: 'y', seed: 5, silver: 0.1, foot: 0.07, edge: 0.4 }) });
    const pEnd = P.part('tenons', { mat: 'wood', paint: endGrainPaint({ axis: 'y', R: 0.024, tone: 0.3, heart: 0.4 }) });
    const pWedge = P.part('wedges', { mat: 'wood', paint: (c) => mix(C('#6a4a30'), C('#3a281a'), c.cavity) });
    const pSplint = P.part('splint', { mat: 'wood', paint: woodPaint({ tone: 0.05, axis: 'y', seed: 9, silver: 0.0, edge: 0.5 }) });
    const pCord = P.part('cord', { mat: 'wood', paint: cordPaint({ seed: 3 }) });
    const tag = (s, p) => new P.Shape(s.f, s.b, () => p, s.lip);

    // ---------------------------------------------------------------- seat: oval, bevelled under, one straight side
    let seat = P.lathe([[0, TOP - TH + 0.004], [0.165, TOP - TH], [0.198, TOP - 0.024], [0.2, TOP - 0.01], [0.192, TOP - 0.001], [0.17, TOP], [0, TOP]], { smooth: 0.004 })
      .scale([1, 1, 0.92]);
    seat = seat.intersect(P.plane(P.norm([1, 0, -0.18]), [0.172, 0, 0]));           // the straight board edge, +x
    if (!far) {
      seat = seat.softCut(P.ellipsoid([0.15, 0.03, 0.13]).at(-0.01, TOP + 0.03 - 0.007, 0.01), 0.04);   // the hollow
      for (const L of LEGS) seat = seat.cut(P.cylinder(0.0262, 0.2).at(L.top[0], TOP - 0.15, L.top[2]));
    }
    const seatUnworn = seat;
    seat = seat.wear(0.003, { vary: 0.6, seed: 2 });
    let out = tag(seat, pSeat);

    // ---------------------------------------------------------------- legs: through the seat, splayed, a slight crook
    let legs = null, ends = null, wedges = null;
    for (const L of LEGS) {
      const mid = legAt(L, 0.5); mid[0] += 0.007 * (L.i - 1); mid[2] += 0.005 * (L.i % 2 ? 1 : -1);
      // the upper part runs along the leg axis right up into the seat
      let leg = P.tube([legAt(L, -0.08), legAt(L, 0.2), mid, L.foot], (u) => legR(u)).intersect(P.plane([0, -1, 0], [0, 0, 0])).intersect(P.plane([0, 1, 0], [0, TOP - 0.005, 0]));
      if (!far && L === SPLINT) {
        // the old break: a jagged ring a little proud / sunk around the leg under the splint
        const b = legAt(L, 0.52);
        leg = leg.cut(P.torus(legR(0.52) + 0.002, 0.0035).aim(sub(L.top, L.foot)).at(b[0], b[1], b[2]).warp((x, y, z, o) => { o[1] = 0.004 * Math.sin(x * 260 + z * 170); }, { grow: 0.006 }));
      }
      legs = add(legs, leg);
      if (!far) {
        // tenon end flush with the seat (vertical cylinder where the leg passes the top), wedge across it
        ends = add(ends, P.cylinder(0.0262, 0.04).at(L.top[0], TOP - 0.035, L.top[2]).intersect(seatUnworn.round(0.0012)));
        wedges = add(wedges, P.boxFromTo([-0.0035, -0.002, -0.026, 0.0035, 0.0012, 0.026]).turn(0, 30 + L.i * 50, 0).at(L.top[0], TOP - 0.0015, L.top[2]).intersect(seatUnworn.round(0.0018)));
      }
    }
    out = out.add(tag(legs, pLeg));
    if (!far) out = out.add(tag(ends, pEnd)).add(tag(wedges, pWedge));

    // ---------------------------------------------------------------- the mend: a split stick bound on with cord
    if (!far) {
      const L = SPLINT, d = P.norm(sub(L.top, L.foot)), out_ = P.norm([L.foot[0] - L.top[0], 0, L.foot[2] - L.top[2]]);
      const off = legR(0.5) + 0.006;
      const a = legAt(L, 0.36), b = legAt(L, 0.68);
      const sp = P.tube([[a[0] + out_[0] * off, a[1], a[2] + out_[2] * off], [b[0] + out_[0] * (off + 0.002), b[1], b[2] + out_[2] * (off + 0.002)]], 0.0105, { aspect: 0.6, up: out_ });
      out = out.add(tag(sp, pSplint));
      let cord = null;
      for (const u of [0.43, 0.61]) {
        const p = legAt(L, u);
        cord = add(cord, lashing([p[0] + out_[0] * 0.004, p[1], p[2] + out_[2] * 0.004], d, legR(u) + 0.004, { turns: 3, cord: 0.0052, pitch: 0.0095 }));
      }
      out = out.add(tag(cord, pCord));
    }
    return out;
  },
};
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

function paintSeat(c) {
  const { x, z, ny } = c;
  let col = woodPaint({ tone: 0.3, axis: 'x', seed: 2, silver: 0.25, edge: 0.6 })(c);
  const r = Math.hypot((x + 0.01) / 0.15, (z - 0.01) / 0.13);
  if (ny > 0.6) col = mix(col, C('#d69a62'), 0.5 * ss(1.0, 0.25, r));     // polished by sitting
  return col;
}
