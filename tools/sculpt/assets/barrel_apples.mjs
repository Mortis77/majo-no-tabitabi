// barrel_apples — a tall orchard cask, open, apples heaped over the rim. Replaces prop_barrel_apples (catalog
// `barrel_apples`: wood, breakable, rolling, spills apples; 0.74 x 0.95 x 0.74 m, origin foot centre).
// INTENT
//  silhouette: a tall, slim cask with three iron hoops and a crown of red apples bulging over the mouth, higher on one
//  side; a few leaves caught among them.
//  big forms: the cask / the iron hoops / the dome of apples.
//  the eye rests on: the red and yellow apples against the dark rim, the bung with a dribble of cider stain, the hoop laps.
//  wear: an orchard cask: staves sun-faded on top, the foot grass-stained and damp, rust bleeding under the hoops.
//  must NOT look like: the big barrel (taller and slimmer, open, three hoops), a barrel with a red lid, apples in rings.
import * as P from '../sdf.mjs';
import { pickMats, cask, ironHoop, ironPaint, stavePaint, appleHeap, applePaint, stalkPaint, leafPaint, blade, FAR, C, mix, ss } from './containers_lib.mjs';

const H = 0.8, R0 = 0.305, RB = 0.352;
const rad = (y) => R0 + (RB - R0) * (1 - ((y - H / 2) / (H / 2)) ** 2);
const HOOPS = [[0.06, 0.05], [0.25, 0.055], [0.56, 0.055], [0.745, 0.05]];
const RIN = R0 - 0.022;
const heap = (x, z) => H - 0.02 + 0.075 * Math.max(0, 1 - (x * x + z * z) / (RIN * RIN)) + 0.025 * Math.max(0, x + z) / 0.3 * 0.6;
const BUNG = { a: -0.5, y: 0.41 };

export default {
  name: 'barrel_apples', id: 'sculpt_barrel_apples',
  voxel: 0.003, lods: [1800, 600, 200], farFrom: 1, farVoxel: 2.0,
  ground: 0, aoRange: 0.08, cavity: [0.004, 0.022], creaseAngle: 40,
  materials: pickMats('wood', 'metal', 'fruit', 'leaf'),
  replaces: { file: 'assets/models/refined/prop_barrel_apples.glb', scale: 1.05796 },
  notes: 'Sculpted orchard cask (tall open cask, four iron hoops, bung with a cider stain, apples heaped over the rim, leaves). Vertex colours on every LOD, no textures: batched + rolling prop. Families wood / metal / fruit / leaf.',

  build() {
    const far = FAR();
    const ck = cask({ H, rad, n: 16, seed: 37, open: true, floorY: H - 0.12, wall: 0.022, far });
    let body = ck.body;
    if (!far) body = body.chip({ at: [0.21, H, 0.21], dir: [0.6, 0.6, 0.6], depth: 0.016, spread: 0.6, seed: 2 });
    const bf = body.f;
    let all = body.part('ba_staves', { mat: 'wood', paint: stavePaint({ staveOf: ck.staveOf, H, hoops: HOOPS, rustHoops: true, extra: grass }) });
    let hoops = null;
    HOOPS.forEach(([yc, w], i) => { const s = ironHoop(rad, yc, w, { pr: 0.009, ang: [30, 150, 250, 330][i], far }); hoops = hoops ? hoops.add(s) : s; });
    all = all.add(hoops.part('ba_hoops', { mat: 'metal', paint: ironPaint({ light: '#6a6d76', dark: '#4e5058', rust: 0.7 }) }));
    // fill under the apples
    const fill = new P.Shape((x, y, z) => (y - heap(x, z) + 0.035) * 0.8, [-RIN, H - 0.15, -RIN, RIN, H + 0.1, RIN]).intersect(P.cylinder(RIN - 0.002, 0.3).at(0, H - 0.2, 0));
    all = all.add(fill.part('ba_fill', { mat: 'fruit', paint: () => C('#5a2418') }));
    const ap = appleHeap({ h: heap, inside: (x, z) => Math.hypot(x, z) < RIN - 0.025, x0: -RIN, x1: RIN, z0: -RIN, z1: RIN, spacing: far ? 0.125 : 0.112, r: far ? [0.056, 0.06] : [0.052, 0.06], seed: 11, far, skip: far ? 0 : 0.05 });
    // two apples riding up on the rim
    let bodies = ap.bodies;
    if (!far) for (const [a, dy] of [[0.9, 0.04], [2.6, 0.03]]) bodies = bodies.add(P.ellipsoid([0.05, 0.044, 0.05]).turn(20, 0, 30).at(Math.sin(a) * (RIN - 0.012), H + dy, Math.cos(a) * (RIN - 0.012)));
    all = all.add(bodies.part('ba_apples', { mat: 'fruit', paint: applePaint() }));
    if (ap.stalks) all = all.add(ap.stalks.part('ba_stalks', { mat: 'wood', paint: stalkPaint }));
    if (!far) {
      // leaves caught among the apples
      let lv = null;
      for (const [x, z, a] of [[-0.12, 0.08, 0.6], [0.1, -0.14, 2.3], [0.17, 0.12, 4.0]]) {
        const y = heap(x, z) + 0.04, dx = Math.cos(a) * 0.075, dz = Math.sin(a) * 0.075;
        const l = blade([[x, y, z], [x + dx * 0.5, y + 0.022, z + dz * 0.5], [x + dx, y + 0.008, z + dz]], 0.026, { aspect: 4, up: [0, 1, 0] });
        lv = lv ? lv.add(l) : l;
      }
      all = all.add(lv.part('ba_leaves', { mat: 'leaf', paint: leafPaint() }));
      // bung + cider stain
      const r = rad(BUNG.y);
      const plug = P.cylinder(0.032, 0.032).turn(90, 0, 0).at(0, 0, r - 0.024).softAdd(P.ellipsoid([0.036, 0.036, 0.01]).at(0, 0, r + 0.008), 0.004).turn(0, BUNG.a * 180 / Math.PI, 0).at(0, BUNG.y, 0);
      all = all.add(plug.part('ba_bung', { mat: 'wood', paint: (c) => mix(C('#c09a6e'), C('#6e4c32'), c.cavity * 0.8 + 0.2) }));
      const stain = new P.Shape((x, y, z) => {
        const a = Math.atan2(x, z), rr = Math.hypot(x, z), t = ss(BUNG.y, 0.12, y);
        const w = (0.03 + 0.008 * Math.sin(y * 41)) * (0.4 + 0.6 * t);
        return Math.max(bf(x, y, z) - 0.0012, Math.abs((a - BUNG.a - 0.01 * Math.sin(y * 14)) * rr) - w, Math.max(y - BUNG.y - 0.02, 0.12 - y));
      }, [-0.35, 0.1, 0.0, 0.1, BUNG.y + 0.05, 0.4]).part('ba_stain', { mat: 'wood', paint: (c) => mix(C('#4a2e1a'), C('#6a4428'), ss(BUNG.y, 0.12, c.y)) });
      all = all.add(stain);
    }
    return all;
  },
};

function grass(c, col) { return mix(col, C('#6a7040'), ss(0.06, 0.0, c.y) * 0.4 * (0.5 + 0.5 * P.fbm(c.x * 20, 0, c.z * 20, 6, 2))); }
