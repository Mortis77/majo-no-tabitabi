// barrel_small — a squat cask of soy or rice wine, bound with split-bamboo hoops. Replaces prop_barrel_small (catalog
// `barrel`: wood, breakable, ROLLING; 0.69 x 0.70 x 0.69 m, origin foot centre).
// INTENT
//  silhouette: a short, fat cask, almost as wide as tall, four plaited bamboo hoops — two broad round the belly, two
//  narrow at the chimes; the stave ends stand proud of the heads.
//  big forms: the bellied body / the bamboo hoops / the paper label on the front.
//  the eye rests on: the brewer's paper label (pale, a single dark ink stroke and a red seal), the bung with its straw
//  twist, the diagonal plait of the hoops.
//  wear: rolled about the yard — staves of different tones, the top washed silver, the foot dark and damp, the label
//  torn at one corner; no iron at all (that is the big barrel's look).
//  must NOT look like: the big iron-hooped barrel, a cylinder with stripes, a pack barrel with white bands.
import * as P from '../sdf.mjs';
import { pickMats, cask, bambooHoop, bambooPaint, stavePaint, rope, ropePaint, FAR, C, mix, ss } from './containers_lib.mjs';

const H = 0.70, R0 = 0.282, RB = 0.328;
const rad = (y) => R0 + (RB - R0) * (1 - ((y - H / 2) / (H / 2)) ** 2);
const HOOPS = [[0.05, 0.042], [0.205, 0.068], [0.495, 0.068], [0.65, 0.042]];
const LABEL = { a: 0.0, y: 0.35, w: 0.095, h: 0.105 };       // paper label on +z (half width as arc length, half height)
const BUNG = { a: -1.2, y: 0.35 };                           // the bung on the side (radians from +z)
const CK = cask({ H, rad, n: 12, seed: 19, chime: 0.02, headBoards: [-0.17, -0.05, 0.08, 0.19] });

export default {
  name: 'barrel_small', id: 'sculpt_barrel_small',
  voxel: 0.0028, lods: [1800, 600, 200], farFrom: 2, farVoxel: 2.4,
  ground: 0, aoRange: 0.08, cavity: [0.004, 0.022], creaseAngle: 40,
  materials: pickMats('wood', 'straw'),
  replaces: { file: 'assets/models/refined/prop_barrel_small.glb', scale: 0.68785 },
  notes: 'Sculpted squat cask (uneven staves, four plaited split-bamboo hoops, paper label with ink stroke + red seal, bung with a straw twist). Vertex colours on every LOD, no textures: batched + rolling prop. Families wood / straw (the hoops; the old metal family is not used).',

  build() {
    const far = FAR();
    const ck = far ? cask({ H, rad, n: 12, seed: 19, chime: 0.02, far: true }) : CK;
    let body = ck.body;
    body = body.chip({ at: [-0.2, H, -0.19], dir: [-0.6, 0.6, -0.6], depth: 0.018, spread: 0.6, seed: 5 });
    const wood = body.part('bs_staves', { mat: 'wood', paint: stavePaint({ staveOf: ck.staveOf, H, hoops: HOOPS, headR: rad(H) - 0.03, headY: H - 0.02 }) });
    let all = wood;
    let hoops = null;
    HOOPS.forEach(([yc, w], i) => { const s = bambooHoop(rad, yc, w, { pr: i === 1 || i === 2 ? 0.013 : 0.01, wraps: [22, 26, 26, 22][i], ang: [40, 170, 280, 330][i], far }); hoops = hoops ? hoops.add(s) : s; });
    all = all.add(hoops.part('bs_hoops', { mat: 'straw', paint: bambooPaint() }));
    // paper label: a skin a few mm proud of the staves, a dark ink stroke and a red seal on it, a corner torn off
    const bf = body.f;
    const win = (x, y, z, ex = 0) => {
      const a = Math.atan2(x, z), r = Math.hypot(x, z);
      let d = Math.max(Math.abs((a - LABEL.a) * r) - LABEL.w - ex, Math.abs(y - LABEL.y) - LABEL.h - ex);
      d = Math.max(d, -((a - LABEL.a) * r - LABEL.w + 0.035 + (y - LABEL.y - LABEL.h) * -1.0));   // torn corner (top right)
      return d;
    };
    const label = new P.Shape((x, y, z) => Math.max(bf(x, y, z) - (far ? 0.004 : 0.0028), win(x, y, z), -z), [-0.14, LABEL.y - 0.13, 0.2, 0.14, LABEL.y + 0.13, RB + 0.02]).part('bs_label', { mat: 'wood', paint: (c) => mix(C('#f2e8cc'), C('#d6c8a4'), c.cavity * 0.6 + 0.15 * ss(LABEL.y - 0.1, LABEL.y - 0.02, c.y) * 0 ) });
    all = all.add(label);
    if (!far) {
      const ink = new P.Shape((x, y, z) => {
        const a = Math.atan2(x, z), r = Math.hypot(x, z), u = (a - LABEL.a) * r + 0.01, v = y - LABEL.y;
        const stroke = Math.max(Math.abs(u + 0.006 * Math.sin(v * 30) + v * 0.08) - (0.018 - 0.06 * Math.max(0, -v - 0.02) ** 1.2), Math.abs(v - 0.005) - 0.08);
        return Math.max(bf(x, y, z) - 0.0042, stroke, -z);
      }, [-0.1, LABEL.y - 0.1, 0.2, 0.1, LABEL.y + 0.1, RB + 0.02]).part('bs_ink', { mat: 'wood', paint: () => C('#2a2622') });
      const seal = new P.Shape((x, y, z) => {
        const a = Math.atan2(x, z), r = Math.hypot(x, z), u = (a - LABEL.a) * r - 0.052, v = y - LABEL.y + 0.068;
        return Math.max(bf(x, y, z) - 0.0042, Math.max(Math.abs(u), Math.abs(v)) - 0.017, -z);
      }, [-0.1, LABEL.y - 0.11, 0.2, 0.12, LABEL.y, RB + 0.02]).part('bs_seal', { mat: 'wood', paint: () => C('#c8442e') });
      all = all.add(ink).add(seal);
      // bung: a turned plug, a twist of straw round its neck
      const ca = Math.sin(BUNG.a), cz = Math.cos(BUNG.a), r = rad(BUNG.y);
      const plug = P.cylinder(0.03, 0.032).turn(90, 0, 0).at(0, 0, r - 0.022).softAdd(P.ellipsoid([0.036, 0.036, 0.012]).at(0, 0, r + 0.011), 0.005).turn(0, BUNG.a * 180 / Math.PI, 0).at(0, BUNG.y, 0);
      all = all.add(plug.part('bs_bung', { mat: 'wood', paint: (c) => mix(C('#b8946a'), C('#6e4c32'), c.cavity * 0.8 + 0.2) }));
      const tw = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10 * Math.PI * 2; tw.push([Math.cos(t) * 0.037, Math.sin(t) * 0.037, r + 0.004]); }
      const twist = rope(tw, 0.0065, { lay: 0.03 }).softAdd(rope([[0.03, -0.02, r + 0.006], [0.045, -0.06, r - 0.004]], 0.0055, { lay: 0.03 }), 0.004).turn(0, BUNG.a * 180 / Math.PI, 0).at(0, BUNG.y, 0);
      all = all.add(twist.part('bs_twist', { mat: 'straw', paint: ropePaint({ light: '#e2c886', dark: '#b8984e' }) }));
    }
    return all;
  },
};
