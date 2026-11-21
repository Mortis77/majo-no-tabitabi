// bucket — a coopered well / farm bucket with a rope handle. Replaces prop_bucket_wood (catalog `bucket`; 0.45 x 0.30 x 0.39 m).
// INTENT
//  silhouette: a short tub flaring a little to the mouth, two staves standing up as ears, a rope loop slumped over the
//  front — the rope is what makes it a bucket and not a cup.
//  big forms: the tub / the two iron hoops / the ears with the rope.
//  the eye rests on: the rope knots at the ears, the dark wet inside with a pale worn rim, one stave split at the top.
//  wear: carried to the well every day — the rim and the ears rubbed pale, the foot dark and damp, rust under the hoops,
//  staves of different widths and tones; the rope frayed and grey with use.
//  must NOT look like: a cylinder with two stripes, sixteen equal staves, a handle drawn in the air.
import * as P from '../sdf.mjs';
import { C, mix, ss, clamp } from './_smallprops.mjs';

const H = 0.252, EAR = 0.278;                       // rim height, ear top
const R0 = 0.158, R1 = 0.182;                       // radius at the foot / at the rim (outside)
const WALL = 0.016, FLOOR = 0.026;
const rad = (y) => R0 + (R1 - R0) * (y / H);
const BORDERS = (() => {
  const rnd = P.prng(23), w = Array.from({ length: 11 }, () => 0.65 + 0.7 * rnd()), s = w.reduce((a, b) => a + b, 0);
  let a = 0.31; return w.map((v) => { const b = a; a += (v / s) * 2 * Math.PI; return b; });
})();
const staveOf = (a) => { let t = a - BORDERS[0]; t = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); let i = 0; while (i + 1 < BORDERS.length && BORDERS[i + 1] - BORDERS[0] <= t) i++; return i; };
const HOOPS = [[0.046, 0.03], [0.19, 0.03]];
const ROPE_R = 0.0105;

export default {
  name: 'bucket', id: 'sculpt_bucket_wood',
  voxel: 0.0018, lods: [1800, 600, 200], farFrom: 2, farVoxel: 2, lodError: [0.0025, 0.006, 0.014],
  ground: 0, aoRange: 0.08, cavity: [0.003, 0.014], creaseAngle: 45,
  materials: {
    wood: { name: 'wood', surface: 'wood', look: { rim: 0.3 } },
    metal: { name: 'metal', surface: 'metal', look: { spec: 0.55, specPower: 40, rim: 0.4 } },
  },
  gameMats: { wood: 'MI_Trim_Furniture_wood', metal: 'MI_Trim_Metal_metal' },
  replaces: { file: 'assets/models/refined/prop_bucket_wood.glb', scale: 1.02463 },
  notes: 'Sculpted coopered bucket (uneven staves, two iron hoops, ears + rope handle slumped over the front). Vertex colours on every LOD, no textures: batched prop. Families wood / metal (names as prop_bucket_wood).',

  build() {
    const FAR = process.env.SMALLPROPS_FAR === '1';   // LOD2: no joints / split / chip, rope without knots and tails
    // tub: outside up, over the rim, down the inside to the floor
    const prof = [[0, 0], [R0 - 0.004, 0], [R0, 0.005]];
    for (let i = 1; i <= 6; i++) { const y = (i / 6) * H; prof.push([rad(y), y]); }
    // LOD2: a shallow dark well instead of the full inside, so its triangles go to the hoop and the rope
    if (FAR) prof.push([rad(H) - WALL, H], [rad(H) - WALL - 0.01, H - 0.035], [0, H - 0.035]);
    else prof.push([rad(H) - WALL, H], [R0 - WALL + 0.004, FLOOR], [0, FLOOR]);
    let tub = P.lathe(prof, { smooth: 0.002 });
    // ears: the two staves on +-x run on up, rounded, a hole for the rope
    for (const s of [-1, 1]) {
      const w0 = 0.064;
      let ear = P.boxFromTo([-w0 / 2, H - 0.03, -WALL / 2, w0 / 2, EAR - 0.012, WALL / 2]).add(P.cylinder(w0 / 2, WALL).turn(90, 0, 0).at(0, EAR - 0.012 - 0, WALL / 2));
      ear = ear.turn(0, 90, 0).turn(0, 0, -s * 4.5).at(s * (rad(H) - WALL / 2), 0, 0);
      tub = tub.softAdd(ear, 0.004);
    }
    tub = tub.cut(P.cylinder(0.0125, 0.6).turn(0, 0, 90).at(0.3, EAR - 0.024, 0));
    // stave lift + V joints
    const rnd = P.prng(5), lift = BORDERS.map(() => (rnd() - 0.5) * 0.004);
    tub = tub.warp((x, y, z, o) => { const a = Math.atan2(x, z), d = lift[staveOf(a)] * ss(0.0, 0.03, y), r = Math.hypot(x, z) || 1; o[0] = (x / r) * d; o[2] = (z / r) * d; o[1] = 0; }, { lip: 1.2, grow: 0.004 });
    if (!FAR) for (const b of BORDERS) tub = tub.cut(P.boxFromTo([-0.0032, 0.004, -0.006, 0.0032, EAR + 0.01, 0.006]).at(0, 0, R1 + 0.002).turn(0, b * 180 / Math.PI, 0));
    // a stave split at the top on the front-left; the rim knocked
    if (!FAR) tub = tub.cut(P.boxFromTo([-0.0018, H - 0.07, -0.03, 0.0018, H + 0.01, 0.03]).turn(0, 0, 8).at(0, 0, rad(H)).turn(0, -38, 0));
    tub = tub.chip({ at: [0.07, H, 0.17], dir: [0.3, 0.7, 0.7], depth: 0.008, spread: 0.6, seed: 4 });
    tub = tub.wear(0.0035, { vary: 0.6, seed: 2 });
    const wood = tub.part('staves', { mat: 'wood', paint: paintStaves });
    // hoops: flat iron bands just proud of the staves, a lap with one rivet
    let hoops = null;
    HOOPS.forEach(([yc, w], i) => {
      const y0 = yc - w / 2, y1 = yc + w / 2;
      const pr = FAR ? 0.016 : 0.0095;   // LOD2: the bands stand proud enough that 200 triangles keep them
      let band = P.lathe([[0, y0], [rad(y0) + 0.003, y0], [rad(y0) + pr, y0 + 0.004], [rad(y1) + pr, y1 - 0.004], [rad(y1) + 0.003, y1], [0, y1]]);
      const ang = [130, 245][i];
      if (FAR) { if (i === 0) hoops = P.lathe([[0, 0.02], [rad(0.02) + 0.02, 0.02], [rad(0.075) + 0.02, 0.075], [0, 0.075]]); return; }   // LOD2: one broad hoop
      band = band.add(P.boxFromTo([-0.02, y0 + 0.002, -0.003, 0.02, y1 - 0.002, 0.003]).at(0, 0, rad(yc) + 0.006).turn(0, ang, 0));
      band = band.add(P.sphere(0.0055).scale([1, 1, 0.6]).at(0.008, yc, rad(yc) + 0.009).turn(0, ang, 0));
      hoops = hoops ? hoops.add(band) : band;
    });
    hoops = hoops.cut(P.cylinder(R0 - 0.02, 0.3).at(0, -0.01, 0)).part('hoops', { mat: 'metal', paint: paintIron });
    // rope: through both ears, knotted outside, the loop slumped forward over the front staves
    const yE = EAR - 0.024, xE = rad(H) + 0.004;
    const loop = [[xE + 0.012, yE, 0], [xE + 0.008, yE - 0.006, 0.05], [0.15, yE - 0.03, 0.155], [0.075, yE - 0.07, 0.2], [0, yE - 0.082, 0.207], [-0.08, yE - 0.07, 0.198], [-0.152, yE - 0.03, 0.15], [-xE - 0.008, yE - 0.006, 0.05], [-xE - 0.012, yE, 0]];
    let rope = P.tube(loop, FAR ? ROPE_R * 1.5 : ROPE_R);
    // the plies: a twisted groove pattern along the rope, cheap: ridged noise stretched along it
    if (!FAR) for (const s of [-1, 1]) {
      rope = rope.add(P.tube([[s * (xE - 0.03), yE, 0], [s * (xE + 0.03), yE, 0]], ROPE_R * 0.9));   // through the ear
      rope = rope.add(P.ellipsoid([0.012, 0.014, 0.015]).at(s * (xE - 0.03), yE, 0));                     // stop knot inside
      rope = rope.add(P.ellipsoid([0.016, 0.017, 0.019]).at(s * (xE + 0.024), yE, 0.004));                 // knot
      rope = rope.add(P.tube([[s * (xE + 0.03), yE - 0.004, 0.008], [s * (xE + 0.036), yE - 0.03, 0.014], [s * (xE + 0.03), yE - 0.05, 0.022]], [0.0075, 0.0045]));   // frayed tail
    }
    // (revision 2: at LOD2 the rope had no part at all -> it was baked as an unnamed white strip)
    if (!FAR) rope = rope.rough({ type: 'ridged', scale: 0.012, amp: 0.0012, seed: 8 });
    rope = rope.part('rope', { mat: 'wood', paint: paintRope });
    return wood.add(hoops).add(rope);
  },
};

function paintStaves(c) {
  const { x, y, z, cavity, edge, ny, ao } = c;
  const a = Math.atan2(x, z), i = staveOf(a), k = (i * 0.618 + 0.2) % 1;
  const r = Math.hypot(x, z);
  const inside = r < rad(y) - WALL * 0.6 && y > FLOOR * 0.6 && y < H - 0.002;
  let col = mix(C('#b0845a'), C('#8a6040'), k);                                  // each stave its own tone
  col = mix(col, C('#6a4630'), 0.3 * (0.5 + 0.5 * Math.sin(a * 220 + 10 * P.fbm(x * 4, y * 9, z * 4, i, 2))));  // grain
  if (inside && process.env.SMALLPROPS_FAR === '1') col = mix(C('#5a3e2a'), C('#3a281c'), ss(H - 0.012, H - 0.03, y));
  else if (inside) {
    col = mix(C('#9a6e4a'), C('#6a4a32'), ss(0.2, 0.06, y));                     // the inside: darker, damp low down
    col = mix(col, C('#4e3626'), ss(0.115, 0.1, y) * 0.5);                       // the water line
  } else {
    col = mix(col, C('#4a3222'), ss(0.04, 0.0, y) * 0.7);                        // damp foot
    for (const [yc, w] of HOOPS) { const d = yc - w / 2 - y; if (d > 0 && d < 0.035) col = mix(col, C('#7a4426'), (1 - d / 0.035) * 0.4); }
  }
  col = mix(col, C('#d8b88c'), ss(H - 0.02, H + 0.004, y) * (ny > 0.3 ? 0.7 : 0.35));   // rim rubbed pale
  if (y > H) col = mix(col, C('#d0b089'), 0.45);                                  // ears: hand-worn
  col = mix(col, C('#d6b48a'), edge * 0.5);
  return mix(col, C('#2a1c14'), cavity * 0.55);
}
function paintIron(c) {
  const { x, y, z, edge, cavity, ny } = c;
  let col = mix(C('#3c3e46'), C('#2e3036'), 0.5 + 0.5 * P.fbm(x * 30, y * 30, z * 30, 3, 2));
  const rust = clamp(ss(0.4, 0.75, P.fbm(x * 14, y * 14, z * 14, 7, 3) + 0.5) + (ny < -0.3 ? 0.4 : 0) + cavity * 0.6, 0, 1);
  col = mix(col, C('#8a4a26'), rust * 0.65);
  return mix(col, C('#8e929c'), edge * 0.55);
}
function paintRope(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(C('#b8a77e'), C('#94845e'), 0.5 + 0.5 * P.fbm(x * 90, y * 90, z * 90, 11, 2));
  col = mix(col, C('#7c7462'), ss(0.24, 0.18, y) * 0.35);                        // grey where the hand holds it
  col = mix(col, C('#d6c89c'), edge * 0.4);
  return mix(col, C('#4a3e28'), cavity * 0.6);
}
