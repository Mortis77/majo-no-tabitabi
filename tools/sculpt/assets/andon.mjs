// andon — the paper floor lamp of village rooms and porches (replaces prop_andon, the Quaternius pack lamp; catalog `andon`).
// Batched prop: vertex colours on every LOD, no textures. The game lights it (models.js glowPart: a code ellipsoid in the
// middle, lit by `cond: 'lit'`; G.elements light); this sculpt keeps the paper box where the old one had it (y 0.215-0.697)
// and leaves the top OPEN so the glow core is seen from the game camera above. Foot centre on the ground, size 0.59 x 0.90 x 0.58.
// INTENT
//  silhouette: a slightly tapering paper box on four splayed legs, the top rails running past the corners and lifting at the
//  ends, an arched carry handle over the open top — a small shrine-roof gesture on a household lamp.
//  big forms: the paper box / the legs and base frame / the handle. Medium: the corner posts, one cross bar per face, the
//  base shelf. Small: the pegs through the rail ends, the one replaced (whiter) pane. Washi stays clean and flat.
//  the eye rests on: the bright paper between dark posts, the lifted rail ends, the patch.
//  wear: lacquered frame, floor-dark feet and base, hand-pale top-rail ends and grip; one pane replaced (whiter) on the right.
//  must NOT look like: a pack lamp (a cube of four equal white squares on a box), a symmetric toy, evenly busy lattice.
import * as P from '../sdf.mjs';
import { C, mix, ss, clamp } from './_smallprops.mjs';
import { obox } from './broom_lib.mjs';

const PY0 = 0.215, PY1 = 0.697;                 // paper band (as the old lamp)
const HB = 0.225, HT = 0.205;                   // half width of the box at the bottom / top (posts' outer faces)
const hw = (y) => HB + (HT - HB) * clamp((y - PY0) / (PY1 - PY0), 0, 1);
const POST = 0.034, RAIL = 0.03, INSET = 0.021;   // the paper sits 21 mm inside the posts' outer faces

export default {
  name: 'andon', id: 'sculpt_prop_andon',
  voxel: 0.0022, lods: [2000, 700, 250], farFrom: 2, farVoxel: 1.8, lodError: [0.0025, 0.007, 0.018],
  ground: 0, aoRange: 0.07, cavity: [0.003, 0.012], creaseAngle: 40, bandSlack: 0.006,
  materials: {
    wood: { name: 'Atlas', surface: 'wood', look: { rim: 0.3 } },
    paper: { name: 'Light', surface: 'paper', look: { trans: 0.35, rim: 0.15 } },
  },
  gameMats: { wood: 'Atlas_wood', paper: 'Light_paper' },
  replaces: { file: 'assets/models/refined/prop_andon.glb', scale: 0.66279 },
  notes: 'Sculpted andon: tapering paper box on splayed legs, lifted rail ends, arched handle over an open top, one patched pane. Vertex colours on every LOD; families Atlas_wood / Light_paper as before (paper = the lit part).',

  build() {
    const FAR = process.env.SMALLPROPS_FAR === '1';
    const parts = [];
    // ---- corner posts (lean in with the taper), legs below splaying out to the feet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const top = [sx * (HT - POST / 2), 0.725, sz * (HT - POST / 2)], bot = [sx * (HB - POST / 2), 0.16, sz * (HB - POST / 2)];
      // square posts (joinery, not dowels), leaning in with the taper
      const pc = [(top[0] + bot[0]) / 2, (top[1] + bot[1]) / 2, (top[2] + bot[2]) / 2];
      parts.push(obox(pc, [1, 0, 0], [top[0] - bot[0], top[1] - bot[1], top[2] - bot[2]], [POST / 2, Math.hypot(top[0] - bot[0], top[1] - bot[1], top[2] - bot[2]) / 2, POST / 2], 0.004));
      // stout legs kicking out to wide feet (diagonal, like a low stool)
      const foot = [sx * 0.262, 0.0, sz * 0.256], hip = [sx * (HB - POST / 2), 0.19, sz * (HB - POST / 2)];
      const lc = [(foot[0] + hip[0]) / 2, (foot[1] + hip[1]) / 2 + 0.01, (foot[2] + hip[2]) / 2];
      parts.push(obox(lc, [sx, 0, -sz], [foot[0] - hip[0], foot[1] - hip[1], foot[2] - hip[2]], [0.019, 0.112, 0.019], 0.005));
      if (!FAR) parts.push(P.roundBox([0.046, 0.022, 0.046], 0.006).at(foot[0] - sx * 0.006, 0.011, foot[2] - sz * 0.006));   // foot block
    }
    // ---- frame rails: base (thick), bottom of the paper, top (runs past the corners, ends lift), a cross bar per face
    const rail = (y, h, half, over = 0, lift = 0, d = RAIL) => {
      const xr = P.boxFromTo([-half - over, y - h / 2, -d / 2, half + over, y + h / 2, d / 2]);
      let g = P.union(xr.at(0, 0, half - d / 2), xr.at(0, 0, -(half - d / 2)),
        xr.turn(0, 90, 0).at(half - d / 2, 0, 0), xr.turn(0, 90, 0).at(-(half - d / 2), 0, 0));
      if (lift) g = g.warp((x, yy, z, o) => { const e = Math.max(Math.abs(x), Math.abs(z)) - half; o[1] = e > 0 ? lift * (e / over) ** 2 : 0; o[0] = 0; o[2] = 0; }, { lip: 1.3, grow: lift });
      return g;
    };
    parts.push(rail(0.172, 0.05, HB + 0.006, 0.0, 0, 0.034));                   // base frame under the paper
    parts.push(rail(PY0 - 0.006, 0.02, HB, 0, 0));                             // paper bottom rail
    parts.push(rail(0.716, 0.032, HT + 0.006, FAR ? 0.03 : 0.05, FAR ? 0 : 0.02, 0.036));   // top rail, ends past the corners, lifting
    if (!FAR) parts.push(rail(0.505, 0.014, hw(0.505) - INSET + 0.008, 0, 0, 0.012));  // one cross bar per face
    // base shelf (a board inside the base frame, the lamp dish would stand on it)
    parts.push(P.boxFromTo([-HB + 0.01, 0.15, -HB + 0.01, HB - 0.01, 0.165, HB - 0.01]));
    // pegs through the rail ends
    if (!FAR) for (const [px, pz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) parts.push(P.cylinder(0.0055, 0.05).at(px * (HT - 0.005), 0.69, pz * (HT + 0.033)));
    // ---- handle: an arch over the open top, from the middle of the left and right top rails
    const arch = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, a = Math.PI * t; arch.push([-Math.cos(a) * (HT - 0.012), 0.728 + Math.sin(a) * 0.16, 0]); }
    // LOD2 (far field) drops the handle: at 250 triangles the arch folds into a pitched roof (a little house)
    if (!FAR) parts.push(P.tube(arch, 0.013, { aspect: 1.6, up: [0, 0, 1] }));
    if (!FAR) parts.push(P.boxFromTo([-0.03, 0.876, -0.014, 0.03, 0.898, 0.014]).turn(0, 0, 0));   // the grip block at the top of the arch
    let frame = bunion(parts);
    if (!FAR) frame = frame.wear(0.0025, { vary: 0.5, seed: 3 });
    frame = frame.part('frame', { mat: 'wood', paint: paintFrame });
    // ---- paper: four panes set just inside the posts' outer faces, a closed hollow box (open top), 5 mm paper
    const T = FAR ? 0.008 : 0.0055;
    let box = shellBox(T);
    box = box.part('paper', { mat: 'paper', paint: paintPaper });
    return frame.add(box);
  },
};

/** the paper as four tapered panes (outer face 6 mm inside the posts' outer faces), thickness t, no top or bottom */
function shellBox(t) {
  const f = (x, y, z) => {
    const yy = clamp(y, PY0, PY1), h = hw(yy) - INSET;
    const ax = Math.abs(x), az = Math.abs(z);
    // distance to the square tube |x|,|z| <= h (outer) minus inner h - t
    const qo = Math.max(ax, az) - h, qi = Math.max(ax, az) - (h - t);
    const wall = Math.max(qo, -qi);
    const dy = Math.max(PY0 - y, y - PY1, 0);
    return wall > 0 ? Math.hypot(wall, dy) : (dy > 0 ? dy : wall);
  };
  const e = HB + 0.01;
  return new P.Shape(f, [-e, PY0 - 0.01, -e, e, PY1 + 0.01, e], null, 1.2);
}
function bunion(list) { if (list.length === 1) return list[0]; const m = list.length >> 1; return P.union(bunion(list.slice(0, m)), bunion(list.slice(m))); }

// the bake multiplies AO x cavity into the vertex colours after paint (bake.mjs compose): on two-triangle panes that turns
// into diagonal smears, so the paper divides it back out and stays one clean tone per pane
function unAO(col, c, k = 1) {
  const m = (1 - 0.7 * (1 - c.ao)) * (1 - 0.45 * c.cavity);
  const f = 1 + (1 / Math.max(0.3, m) - 1) * k;
  return col.map((v) => v * f);
}
function paintFrame(c) {
  const { x, y, z, ny, cavity, edge } = c;
  // persimmon-lacquered wood; three steps of wear only: floor-dark feet and base, mid frame, hand-pale top-rail ends + grip
  let col = mix(C('#8e5c3c'), C('#84542f'), 0.5 + 0.5 * P.fbm(x * 30, y * 30, z * 30, 2, 2));
  const low = Math.max(ss(0.07, 0.02, y), y > 0.14 && y < 0.2 ? 1 : 0);
  col = mix(col, C('#5a3a24'), low * 0.75);                                         // feet + base frame: floor dirt
  const ends = Math.max(Math.abs(x), Math.abs(z)) > HT + 0.012 && y > 0.68 && y < 0.76 ? 1 : 0;
  col = mix(col, C('#c69466'), ends * 0.75);                                        // top-rail ends: hand wear
  col = mix(col, C('#b8865a'), ss(0.84, 0.88, y) * 0.6);                            // the grip at the arch top
  col = mix(col, C('#c89a6e'), edge * 0.35 * (1 - low));
  return mix(col, C('#3a2416'), cavity * 0.45);
}
function paintPaper(c) {
  const { x, y, z } = c;
  const ax = Math.abs(x), az = Math.abs(z), h = hw(y) - INSET;
  const outside = Math.max(ax, az) > h - 0.0035;
  // clean washi, one flat tone per pane (a whisper of difference between them); the right pane (+x) replaced: whiter
  let col = C('#f2e6cc');
  if (ax > az) col = x > 0 ? C('#faf4e6') : C('#efe2c6'); else col = z > 0 ? C('#f2e6cc') : C('#eee0c4');
  if (!outside) col = mix(col, C('#e6d4b0'), 0.35);                                  // inside faces, lit by the lamp
  return unAO(col, c);
}
