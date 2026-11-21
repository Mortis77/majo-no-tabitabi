// barrel_fish — the fishmonger's open tub, fish packed head-down in salt, their tails up. Replaces prop_barrel_fish
// (catalog `barrel_fish`: wood, breakable, rolling, spills fish; 0.68 x 0.90 x 0.66 m, origin foot centre).
// INTENT
//  silhouette: a tapered open tub (wider at the mouth) with three plaited bamboo hoops, and a fan of forked fish tails
//  rising out of it at different heights and leans — the tails ARE the read.
//  big forms: the tub / the white salt crust at the mouth / the tails.
//  the eye rests on: the silver-blue tails against the pale salt, the dark wet staves under the rim, one stave longer
//  than the rest with a rope through it (the carrying ear).
//  wear: salt water: staves dark and wet at the top and the foot, salt bloom in the joints, the hoops bleached.
//  must NOT look like: a barrel with a blue lid, fish in a ring, symmetric tails.
import * as P from '../sdf.mjs';
import { pickMats, cask, bambooHoop, bambooPaint, stavePaint, rope, ropePaint, FAR, C, mix, ss, clamp } from './containers_lib.mjs';

const H = 0.6, RBOT = 0.276, RTOP = 0.31;
const rad = (y) => RBOT + (RTOP - RBOT) * (y / H) + 0.008 * Math.sin(Math.PI * y / H);
const HOOPS = [[0.075, 0.05], [0.31, 0.055], [0.53, 0.05]];
const SALT = 0.545;
// fish: [x, z, lean x (deg), lean z (deg), turn y (deg), height above the salt, scale]
const FISH = [[-0.08, 0.03, -14, 8, 20, 0.36, 1.0], [0.1, -0.06, 18, -10, 110, 0.31, 0.95], [0.03, 0.15, 4, 24, 75, 0.26, 0.9], [-0.12, -0.13, -22, -18, 150, 0.22, 0.85]];

function fish([x, z, lx, lz, ty, hh, s], far) {
  // the tail half of a fish: flattened body from the salt up to the wrist, then a forked tail fin
  const L = hh / s - 0.12;
  let b = P.taperedCapsule([0, -0.06, 0], [0, L, 0], 0.062, 0.016).scale([0.46, 1, 1]);
  const fin = P.extrude([[0, -0.015], [0.1, 0.12], [0.072, 0.135], [0.035, 0.09], [0, 0.07], [-0.035, 0.09], [-0.072, 0.135], [-0.1, 0.12]], far ? 0.016 : 0.01, { round: 0.003 }).turn(0, 90, 0).at(0, L - 0.004, 0);
  b = b.softAdd(fin, 0.01);
  if (!far) b = b.softAdd(P.extrude([[0, 0], [0.022, 0.045], [0, 0.055], [-0.012, 0.02]], 0.007, { round: 0.002 }).turn(0, 90, 0).at(0, L * 0.35, -0.02), 0.006);  // a little fin on the back
  return b.scale(s).turn(lx, ty, lz).at(x, SALT - 0.03, z);
}

export default {
  name: 'barrel_fish', id: 'sculpt_barrel_fish',
  voxel: 0.0028, lods: [1800, 600, 200], farFrom: 2, farVoxel: 2.4,
  ground: 0, aoRange: 0.08, cavity: [0.004, 0.022], creaseAngle: 40,
  materials: pickMats('wood', 'straw', 'fruit'),
  replaces: { file: 'assets/models/refined/prop_barrel_fish.glb', scale: 0.52756 },
  notes: 'Sculpted fish tub (tapered open tub, three plaited bamboo hoops, a carrying ear with rope, salt crust, five fish tails of different heights). Vertex colours on every LOD, no textures: batched + rolling prop. Families wood / straw / fruit (the fish, as the old model named them).',

  build() {
    const far = FAR();
    const ck = cask({ H, rad, n: 15, seed: 29, open: true, floorY: SALT - 0.08, wall: 0.022, far });
    let body = ck.body;
    // one stave runs on up as a carrying ear with a hole (on -x)
    const ear = P.roundBox([0.075, 0.13, 0.022], 0.012).at(0, H + 0.03, 0).cut(P.capsule([0, H + 0.055, -0.05], [0, H + 0.055, 0.05], 0.019)).turn(0, 90, 0).at(-(rad(H) - 0.012), 0, 0);
    body = body.softAdd(ear, 0.006);
    const wood = body.part('bf_staves', { mat: 'wood', paint: stavePaint({ staveOf: ck.staveOf, H: H + 0.1, light: '#b48e68', dark: '#86644a', hoops: HOOPS, extra: wet }) });
    let all = wood;
    let hoops = null;
    HOOPS.forEach(([yc, w], i) => { const s = bambooHoop(rad, yc, w, { pr: 0.011, wraps: [24, 26, 28][i], ang: [60, 200, 310][i], far }); hoops = hoops ? hoops.add(s) : s; });
    all = all.add(hoops.part('bf_hoops', { mat: 'straw', paint: bambooPaint({ seed: 8 }) }));
    // salt crust: lumpy, high in the middle, inside the rim
    const salt = new P.Shape((x, y, z) => (y - SALT - 0.025 * Math.exp(-(x * x + z * z) / 0.03) - 0.006 * P.fbm(x * 30, 0, z * 30, 4, 2)) * 0.8, [-0.3, SALT - 0.1, -0.3, 0.3, SALT + 0.05, 0.3])
      .intersect(P.cylinder(rad(SALT) - 0.012, 0.2).at(0, SALT - 0.15, 0));
    all = all.add(salt.part('bf_salt', { mat: 'straw', paint: (c) => mix(mix(C('#eeeae0'), C('#cfd0cc'), 0.5 + 0.5 * P.fbm(c.x * 40, c.y * 40, c.z * 40, 3, 2)), C('#7a8288'), c.cavity * 0.6) }));
    let fs = null;
    for (const f of (far ? FISH.slice(0, 3) : FISH)) { const s = fish(f, far); fs = fs ? fs.add(s) : s; }
    all = all.add(fs.part('bf_fish', { mat: 'fruit', paint: fishPaint }));
    // a rope through the ear, knotted, its end hanging
    if (!far) {
      const ex = -(rad(H) - 0.012);
      const rp = rope([[ex - 0.03, H + 0.055, 0.0], [ex, H + 0.056, 0.0], [ex + 0.03, H + 0.055, 0.0], [ex + 0.02, H + 0.0, 0.03], [ex - 0.03, H - 0.06, 0.05], [ex - 0.045, H - 0.16, 0.06]], 0.009, { lay: 0.035 });
      all = all.add(rp.part('bf_rope', { mat: 'straw', paint: ropePaint({ light: '#c8b48a', dark: '#94805a' }) }));
    }
    return all;
  },
};

function wet(c, col) {
  col = mix(col, C('#5a4636'), ss(H - 0.12, H, c.y) * 0.45);                       // dark wet lip
  return mix(col, C('#e4e0d4'), c.cavity * 0.5 * ss(0.2, 0.5, c.y));               // salt bloom in the joints
}
function fishPaint(c) {
  const { x, y, z, nx, nz, cavity, edge } = c;
  // back blue-grey on the side facing out of the bundle, belly silver; fins darker toward the tips
  const out = clamp(0.5 + 0.5 * (nx * Math.sign(x || 1) * 0.6 + nz * Math.sign(z || 1) * 0.6), 0, 1);
  let col = mix(C('#dfe4e6'), C('#5f7d96'), ss(0.3, 0.8, out));
  col = mix(col, C('#3c4e60'), ss(SALT + 0.2, SALT + 0.32, y) * 0.6);
  col = mix(col, C('#a8b8c2'), 0.2 * (0.5 + 0.5 * Math.sin(y * 160 + x * 40)));    // scale rows
  col = mix(col, C('#f6f8f8'), edge * 0.45);
  return mix(col, C('#26303a'), cavity * 0.5);
}
