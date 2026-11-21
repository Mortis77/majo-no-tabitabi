// jar_a — storage jar with a rope collar and a wooden lid. Replaces prop_jar_a (catalog `jar`, scale 1.4 in the game).
// INTENT
//  silhouette: a heavy high shoulder on a small foot, a short neck, a flat lid tied down — a jar that holds a winter's pickles.
//  big forms: the swelling body / the neck and rolled lip / the lid.
//  the eye rests on: the glossy olive glaze poured from the rim, its runs ending in round beads on the fire side, the rope knot and its tails.
//  wear: thrown by hand (finger rings, a lean, an off-round mouth), fired on one side (glaze + scorch on +x), damp foot.
//  must NOT look like: a lathe primitive, symmetric, glossy, evenly detailed.
import * as P from '../sdf.mjs';
import { vessel, thrownWarp, C, mix, ss, clamp } from './_smallprops.mjs';

const H = 0.40;                       // body height to the lip; lid knob to 0.45
const FIRE = 80;                      // degrees: the side that faced the fire (glaze runs, scorch)
const OUT = [[0.082, 0], [0.09, 0.006], [0.1, 0.035], [0.124, 0.11], [0.144, 0.19], [0.149, 0.245], [0.141, 0.295], [0.117, 0.336], [0.09, 0.362], [0.082, 0.375], [0.087, 0.39], [0.09, H]];

// revision 2: the glaze is a POUR from the rim, not a cap with a hem. Base line high on the far side (just under the
// neck), low on the fire side; three runs hang from it as tapered capsules with a fat rounded bead at the end.
const FA = FIRE * Math.PI / 180;
const dAng = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
function baseLine(a) {
  const k = Math.cos(dAng(a, FA));
  return 0.318 - 0.04 * Math.max(0, k) ** 1.3 + 0.02 * Math.max(0, -k) + 0.006 * Math.sin(a * 3 + 1);
}
// [centre angle (rad), bead radius (m), run length below the base line (m)]
const RUNS = [[FA - 0.22, 0.013, 0.12], [FA + 0.24, 0.012, 0.075]];   // two runs: shorter ones smeared at LOD1
// 2D signed distance (arc length s, height y) to the glazed region; also returns the bead weight (thick at run ends)
function glazeSD(x, y, z) {
  const a = Math.atan2(z, x), r = Math.max(0.06, Math.hypot(x, z));
  const yb = baseLine(a);
  let d = y - yb > 0 ? -(y - yb) : (yb - y);            // cap: inside above the base line
  let bead = 0;
  for (const [c, rb, L] of RUNS) {
    const s = dAng(a, c) * r;
    const ytop = baseLine(c) + 0.004, ybot = baseLine(c) - L;
    // tapered capsule: radius rb*0.55 at the top -> rb at the bead
    const t = Math.max(0, Math.min(1, (ytop - y) / (ytop - ybot)));
    const rad = rb * (0.55 + 0.45 * t * t);
    const dy = y < ybot ? y - ybot : (y > ytop ? y - ytop : 0);
    const dc = Math.hypot(s, dy) - rad;
    // smooth union (k = 8 mm) so each run leaves the line with a fillet, not a corner
    const k = 0.008, h = Math.max(0, Math.min(1, 0.5 + 0.5 * (dc - d) / k));
    d = dc * (1 - h) + d * h - k * h * (1 - h);
    bead = Math.max(bead, ss(rb * 2.2, 0, Math.hypot(s, y - ybot)));
  }
  return { d, bead, yb };
}
function glazeLine(a) { return baseLine(a); }

export default {
  name: 'jar_a', id: 'sculpt_jar_a',
  voxel: 0.0022, lods: [1800, 600, 200], farFrom: 2, farVoxel: 2.4, lodError: [0.0028, 0.006, 0.012],
  ground: 0, aoRange: 0.08, cavity: [0.003, 0.015], creaseAngle: 50,
  materials: {
    clay: { name: 'clay', surface: 'earth', look: { spec: 0.12, specPower: 20, detail: 0.7, scale: 1.2 } },
    glaze: { name: 'glaze', surface: 'paint', look: { spec: 0.6, specPower: 70, detail: 0.2 } },
    wood: { name: 'wood', surface: 'wood', look: { rim: 0.3 } },
  },
  replaces: { file: 'assets/models/refined/prop_jar_a.glb', scale: 0.6 },
  notes: 'Sculpted storage jar (rope collar, wooden lid). Vertex colours on every LOD, no textures: batched prop. Materials clay / glaze (as prop_jar_a) + wood (lid, rope).',

  build() {
    const FAR = process.env.SMALLPROPS_FAR === '1';   // LOD2: one rope ring, no tails, no lid joints
    let body = vessel(OUT, { wall: 0.012, floor: 0.02, lip: 0.007 }).add(P.cylinder(0.08, 0.37).at(0, 0.02, 0)); // closed by the lid: no inside
    body = thrownWarp(body, { h: H, rings: { pitch: 0.021, amp: 0.0011, from: 0.15, to: 0.9 }, oval: 0.005, ovalAng: 30, lean: 0.005, leanAng: 200, seed: 3 });
    body = body.bulge([0.1, 0.2, -0.09], 0.06, 0.003);            // a thumb-heavy spot of the thrower
    const clay = body.part('clay', { mat: 'clay', paint: paintClay });
    // ash glaze: a thin skin (0.5 mm) poured from the rim, thicker (pooled) in the beads at the run ends.
    // FAR (LOD2): the cap only, 2 mm proud, no runs -> no thin slivers for the simplifier to tear open
    const bf = body.f;
    const glazeF = FAR
      ? (x, y, z) => Math.max(bf(x, y, z) - 0.002, (baseLine(Math.atan2(z, x)) + 0.01 - y) * 0.85)
      : (x, y, z) => { const g = glazeSD(x, y, z); return Math.max(bf(x, y, z) - 0.0008 - 0.0008 * ss(0.0, -0.01, y - g.yb) - 0.0016 * g.bead, g.d * 0.85); };
    const glaze = new P.Shape(glazeF, [-0.17, 0.15, -0.17, 0.17, 0.41, 0.17]).part('glaze', { mat: 'glaze', paint: paintGlaze });
    // lid: a turned board disc, slightly cocked, with a knob; worn pale where the hand lifts it
    let lid = P.lathe([[0.104, 0], [0.106, 0.012], [0.1, 0.019], [0.035, 0.022], [0.028, 0.03], [0.03, 0.042], [0.022, 0.05], [0, 0.051]], { smooth: 0.003 });
    if (!FAR) lid = lid.softCut(P.box([0.3, 0.004, 0.004]).at(0, 0.019, 0.045), 0.002).softCut(P.box([0.3, 0.004, 0.004]).at(0, 0.019, -0.05), 0.002); // board joints
    lid = lid.turn(3, 0, -2).at(0.003, H - 0.003, 0).part('lid', { mat: 'wood', paint: paintLid });
    // rope collar: two turns under the lip, a knot at the front-left, two tails over the shoulder
    const ring = (y, r) => P.torus(r, 0.0062).at(0, y, 0);
    let rope = ring(0.366, 0.091).add(ring(0.378, 0.088));
    const knot = P.ellipsoid([0.016, 0.014, 0.013]).at(0, 0.372, 0.096).turn(0, -35, 0);
    const tail1 = P.tube([[-0.05, 0.372, 0.085], [-0.07, 0.355, 0.1], [-0.088, 0.33, 0.112], [-0.1, 0.3, 0.112], [-0.104, 0.275, 0.106]], [0.006, 0.0045]);
    const tail2 = P.tube([[-0.05, 0.372, 0.085], [-0.06, 0.35, 0.11], [-0.066, 0.32, 0.124], [-0.064, 0.29, 0.13]], [0.006, 0.0042]);
    if (FAR) rope = P.torus(0.09, 0.009).at(0, 0.372, 0);
    else rope = rope.add(knot.softAdd(tail1, 0.006).softAdd(tail2, 0.006));
    rope = rope.rough({ type: 'fbm', scale: 0.006, amp: 0.0008, seed: 5 }).part('rope', { mat: 'wood', paint: paintRope });
    return clay.add(glaze).add(lid).add(rope);
  },
};

// ------------------------------------------------------------------------------------------------------------- paint
function fireSide(x, z) { const f = FIRE * Math.PI / 180; return (x * Math.cos(f) + z * Math.sin(f)) / Math.hypot(x, z || 1e-6); }
function paintClay(c) {
  const { x, y, z, ao, edge, ny } = c;
  const fs = fireSide(x, z);
  let col = mix(C('#b8693e'), C('#9a5232'), 0.5 + 0.5 * P.fbm(x * 12, y * 12, z * 12, 2, 2));
  // fire flash: a dark scorched blush under the glaze on the fire side, a pale ash-grey ghost lower down
  col = mix(col, C('#5e3020'), ss(0.1, 0.9, fs) * ss(0.12, 0.26, y) * 0.65);
  col = mix(col, C('#c9a07a'), ss(0.3, -0.6, fs) * ss(0.25, 0.08, y) * 0.35);
  // damp foot
  col = mix(col, C('#6e3c26'), ss(0.06, 0.0, y) * 0.6);
  col = mix(col, C('#e0a97a'), edge * 0.35);
  if (ny > 0.6 && y > 0.37) col = mix(col, C('#7a4a30'), 0.4);
  return col;
}
function paintGlaze(c) {
  const { x, y, z, cavity, edge, ny } = c;
  const g = glazeSD(x, y, z);
  // glossy dark olive, streaked downward (it flowed), not mottled like cloth
  const streak = 0.5 + 0.5 * P.fbm(x * 70, y * 7, z * 70, 4, 2);
  let col = mix(C('#36421c'), C('#4a5626'), streak);
  // value step at the rim: the lip is thin honey-amber where the glaze broke over the edge, then the deep pour
  col = mix(col, C('#b08a44'), ss(0.372, 0.386, y) * 0.75);
  col = mix(col, C('#3a4620'), ss(0.372, 0.36, y) * ss(0.335, 0.355, y) * 0.5);
  // thin at its edge (a narrow amber feather), pooled almost black-green in the beads
  col = mix(col, C('#7a6232'), ss(-0.0035, 0.0, g.d) * 0.55);
  col = mix(col, C('#26331a'), g.bead * 0.8);
  // glossy: a crisp painted catch-light where the shoulder faces the key light (front-left, high), a soft satin
  // halo around it - a glaze reads as glass at 300 px only if it carries its own highlight
  const { nx, nz } = c;
  const lk = 0.45 * nx + 0.6 * ny + 0.66 * nz;
  col = mix(col, C('#6f7c3e'), ss(0.72, 0.9, lk) * 0.4);
  col = mix(col, C('#b4bc7c'), ss(0.93, 0.965, lk) * ss(0.27, 0.295, y) * ss(0.35, 0.33, y) * (1 - g.bead) * 0.7);
  col = mix(col, C('#9aa25a'), edge * 0.2);
  col = mix(col, C('#2a3418'), cavity * 0.4);
  return col;
}
function paintLid(c) {
  const { x, y, z, edge, ny } = c;
  const r = Math.hypot(x, z);
  const grain = 0.5 + 0.5 * Math.sin(x * 260 + 6 * P.fbm(x * 8, y * 8, z * 30, 7, 2));
  let col = mix(C('#8b5a3c'), C('#6e4430'), grain * 0.6);
  col = mix(col, C('#5b3a29'), ss(0.06, 0.1, r) * (ny > 0.5 ? 0.35 : 0.1));     // weathered rim
  col = mix(col, C('#c49a6c'), ss(0.045, 0.02, r) * 0.6 + edge * 0.35);         // the knob, rubbed by hands
  return col;
}
function paintRope(c) {
  const { x, y, z, cavity } = c;
  let col = mix(C('#c8a86a'), C('#a98444'), 0.5 + 0.5 * P.fbm(x * 60, y * 60, z * 60, 8, 2));
  return mix(col, C('#6e5530'), cavity * 0.6);
}
