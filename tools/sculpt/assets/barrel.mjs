// barrel — a big coopered barrel. Replaces prop_barrel_large (catalog `barrel_large`, rolling; 0.99 x 1.10 x 0.99 m).
// INTENT
//  silhouette: a fat bilge between two narrower heads, four dark iron hoops cutting across it; the stave ends standing
//  proud of the head (the chime).
//  big forms: the bellied body / the hoops / the recessed head with its chime.
//  the eye rests on: the bung on the bilge with the dark stain run down from it, the riveted hoop joints, the uneven staves.
//  wear: a cellar barrel rolled out into the weather — staves of different widths and tones, rust bleeding under the
//  hoops, the top silvered by rain, the foot damp and dark, the chime knocked round.
//  must NOT look like: a cylinder with stripes, sixteen equal staves, clean new iron.
import * as P from '../sdf.mjs';
import { C, mix, ss, clamp } from './_smallprops.mjs';

const H = 1.1;
const R0 = 0.4, RB = 0.484;                 // radius at the heads / at the bilge
const rad = (y) => R0 + (RB - R0) * (1 - ((y - H / 2) / (H / 2)) ** 2);
// stave borders (radians, uneven widths)
const BORDERS = (() => {
  const rnd = P.prng(41), w = Array.from({ length: 17 }, () => 0.7 + 0.6 * rnd()), s = w.reduce((a, b) => a + b, 0);
  let a = 0.13; return w.map((v) => { const b = a; a += (v / s) * 2 * Math.PI; return b; });
})();
const staveOf = (a) => { let t = a - BORDERS[0]; t = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); let i = 0; while (i + 1 < BORDERS.length && BORDERS[i + 1] - BORDERS[0] <= t) i++; return i; };
const HOOPS = [[0.055, 0.05], [0.29, 0.055], [0.81, 0.055], [1.045, 0.05]];   // centre y, width
const BUNG = [0, 0.56];                                                         // on +z, at the bilge

export default {
  name: 'barrel', id: 'sculpt_barrel_large',
  voxel: 0.004, lods: [2400, 800, 250], farFrom: 2, farVoxel: 2, lodError: [0.006, 0.012, 0.03],
  ground: 0, aoRange: 0.09, cavity: [0.006, 0.03], creaseAngle: 40,
  materials: {
    wood: { name: 'wood', surface: 'wood', look: { rim: 0.3 } },
    metal: { name: 'metal', surface: 'metal', look: { spec: 0.55, specPower: 40, rim: 0.4 } },
  },
  replaces: { file: 'assets/models/refined/prop_barrel_large.glb', scale: 0.55 },
  notes: 'Sculpted barrel (uneven staves, riveted hoops, bung + stain). Vertex colours on every LOD, no textures: batched + rolling prop. Materials wood / metal (as prop_barrel_large).',

  build() {
    const FAR = process.env.SMALLPROPS_FAR === '1';   // LOD2: no stave joints, no laps / rivets, so the hoops survive
    // staves: a bellied solid with each stave a few millimetres proud or sunk, V joints between them
    const prof = [];
    for (let i = 0; i <= 12; i++) { const y = (i / 12) * H; prof.push([rad(y), y]); }
    let body = P.lathe([[0, 0], ...prof, [0, H]]);
    const rnd = P.prng(7), lift = BORDERS.map(() => (rnd() - 0.5) * 0.004);
    body = body.warp((x, y, z, o) => { const a = Math.atan2(x, z), d = lift[staveOf(a)], r = Math.hypot(x, z) || 1; o[0] = (x / r) * d; o[2] = (z / r) * d; }, { lip: 1.2, grow: 0.006 });
    if (!FAR) for (const b of BORDERS) body = body.cut(P.box([0.008, H + 0.1, 0.03]).turn(0, 0, 0).at(0, H / 2, RB).turn(0, b * 180 / Math.PI, 0));
    // heads: recessed 28 mm below the stave ends, the chime rounded and knocked
    body = body.softCut(P.cylinder(R0 - 0.035, 0.1).at(0, H - 0.028, 0), 0.006).softCut(P.cylinder(R0 - 0.035, 0.1).at(0, -0.072, 0), 0.006);
    let head = P.cylinder(R0 - 0.03, 0.02).at(0, H - 0.05, 0);
    for (const x of [-0.24, -0.09, 0.07, 0.2]) head = head.cut(P.box([0.005, 0.03, 1]).at(x, H - 0.03, 0));   // head boards
    body = body.add(head);
    body = body.chip({ at: [0.3, H, -0.29], dir: [0.6, 0.6, -0.6], depth: 0.025, spread: 0.7, seed: 3 });
    body = body.wear(0.006, { vary: 0.6, seed: 2 });
    // bung: a turned plug in the bilge on +z
    const bung = P.cylinder(0.036, 0.03).turn(90, 0, 0).at(BUNG[0], BUNG[1], rad(BUNG[1]) - 0.026).cut(P.torus(0.03, 0.004).turn(90, 0, 0).at(BUNG[0], BUNG[1], rad(BUNG[1]) + 0.004))
      .round(0.003).part('bung', { mat: 'wood', paint: paintBung });
    const wood = body.part('staves', { mat: 'wood', paint: paintStaves });
    // the stain run down from the bung: a skin with a crisp edge so it survives the LODs
    const bf = body.f;
    const stainF = (x, y, z) => {
      const a = Math.atan2(x, z), t = ss(BUNG[1] - 0.03, 0.16, y);
      const w = (0.04 + 0.012 * Math.sin(y * 37 + 1)) * (0.35 + 0.65 * t) + 0.003 * Math.sin(y * 70);   // narrows as it runs down
      const inA = (Math.abs(a - 0.012 * Math.sin(y * 12)) * rad(y) - w), inY = Math.max(y - BUNG[1] - 0.03, 0.16 - y);
      return Math.max(bf(x, y, z) - 0.0006, Math.max(inA, inY) * 0.9, -z);
    };
    const stain = new P.Shape(stainF, [-0.12, 0.1, 0.3, 0.12, 0.62, 0.5]).part('stain', { mat: 'wood', paint: paintStain });
    // hoops: flat iron bands, a lapped joint with two rivets on each, at different places round
    let hoops = null;
    HOOPS.forEach(([yc, w], i) => {
      const r = rad(yc) + 0.009, y0 = yc - w / 2, y1 = yc + w / 2;
      const pr = FAR ? 0.02 : 0.011;
      let band = P.lathe([[0, y0], [rad(y0) + pr - 0.004, y0], [rad(y0) + pr, y0 + 0.004], [rad(y1) + pr, y1 - 0.004], [rad(y1) + pr - 0.004, y1], [0, y1]]);
      const ang = [40, 160, 250, 320][i] * Math.PI / 180;
      const lap = P.box([0.07, w * 0.92, 0.012]).at(0, yc, r + 0.004).turn(0, ang * 180 / Math.PI, 0);
      if (!FAR) band = band.softAdd(lap, 0.004);
      if (!FAR) for (const s of [-1, 1]) band = band.add(P.sphere(0.0085).scale([1, 1, 0.7]).at(s * 0.022, yc, r + 0.012).turn(0, ang * 180 / Math.PI, 0));
      hoops = hoops ? hoops.add(band) : band;
    });
    hoops = hoops.part('hoops', { mat: 'metal', paint: paintIron });
    return wood.add(stain).add(bung).add(hoops);
  },
};

function paintStaves(c) {
  const { x, y, z, cavity, edge, ny } = c;
  const a = Math.atan2(x, z), i = staveOf(a), k = (i * 0.618) % 1;
  if (y > H - 0.07 && Math.hypot(x, z) < R0 - 0.028 && ny > 0.5) {               // the head: silvered boards, rain-washed
    const b = x < -0.24 ? 0 : x < -0.09 ? 1 : x < 0.07 ? 2 : x < 0.2 ? 3 : 4;
    let hc = mix(C('#e0d2b8'), C('#c4b296'), (b * 0.618) % 1);
    hc = mix(hc, C('#7a6450'), 0.3 * (0.5 + 0.5 * Math.sin(z * 120 + 6 * P.fbm(x * 8, z * 3, 0, b, 2))));
    return mix(hc, C('#3a2a1e'), cavity * 0.5);
  }
  let col = mix(C('#9a6a46'), C('#7a4f34'), k);                                  // each stave its own tone
  col = mix(col, C('#5b3a29'), 0.35 * (0.5 + 0.5 * Math.sin(a * 140 + 8 * P.fbm(x * 3, y * 6, z * 3, i, 2))));  // grain
  col = mix(col, C('#a89a88'), ss(0.75, 1.0, y / H) * 0.35 + (ny > 0.6 ? 0.25 : 0));                          // silvered top
  col = mix(col, C('#3e2a1e'), ss(0.18, 0.0, y) * 0.6);                           // damp foot
  // rust bleeding below each hoop
  for (const [yc, w] of HOOPS) { const d = yc - w / 2 - y; if (d > 0 && d < 0.09) col = mix(col, C('#7a4426'), (1 - d / 0.09) * 0.45 * ss(0.3, 0.7, P.fbm(a * 3, y * 4, 0, 5, 2) + 0.5)); }
  col = mix(col, C('#c8a07a'), edge * 0.5);
  return mix(col, C('#2a1c14'), cavity * 0.6);
}
function paintStain(c) {
  const { y } = c;
  return mix(C('#2e1e14'), C('#4a3020'), ss(BUNG[1] - 0.05, 0.15, y));
}
function paintBung(c) { return mix(C('#b08458'), C('#6e4a30'), c.cavity + 0.2); }
function paintIron(c) {
  const { x, y, z, edge, cavity, ny } = c;
  let col = mix(C('#3c3e46'), C('#2c2e34'), 0.5 + 0.5 * P.fbm(x * 20, y * 20, z * 20, 3, 2));
  const rust = clamp(ss(0.45, 0.75, P.fbm(x * 9, y * 9, z * 9, 7, 3) + 0.5) + (ny < -0.3 ? 0.4 : 0) + cavity * 0.6, 0, 1);
  col = mix(col, C('#8a4a26'), rust * 0.7);
  return mix(col, C('#8a8e98'), edge * 0.55);
}
