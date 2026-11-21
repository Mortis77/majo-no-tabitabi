// jar_b — small open-mouthed jar. Replaces prop_jar_b (0.27 x 0.35 x 0.27 m).
// INTENT
//  silhouette: an egg on a narrow foot with a short flared mouth pushed off-round; one bite out of the rim.
//  big forms: the egg body / the pinched neck and flared lip / the dark open mouth.
//  the eye rests on: the single long ash-glaze run from the rim to near the foot on the fire side, the rim chip (pale break).
//  wear: fired lying a little on its side (glaze only on one shoulder), rim knocked once, foot grimy, throwing rings low down.
//  must NOT look like: a vase from a pack — symmetric, evenly coloured, a perfect circle at the mouth.
import * as P from '../sdf.mjs';
import { thrownWarp, C, mix, ss } from './_smallprops.mjs';

const H = 0.35, FIRE = 150;
const OUT = [[0, 0], [0.068, 0], [0.078, 0.008], [0.098, 0.04], [0.118, 0.1], [0.132, 0.17], [0.13, 0.225], [0.112, 0.268], [0.086, 0.297], [0.074, 0.312], [0.075, 0.326], [0.083, 0.336], [0.085, 0.342], [0, 0.342]];
const dA = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
function glazeLine(a) {
  const f = FIRE * Math.PI / 180, k = Math.cos(dA(a, f));
  let y = 0.33 - 0.09 * Math.max(0, k) ** 1.5 + 0.03 * Math.max(0, -k);   // a cap leaning to the fire side
  y -= 0.17 * Math.exp(-((dA(a, f + 0.1) / 0.05) ** 4));                // the long run
  y -= 0.05 * Math.exp(-((dA(a, f - 0.35) / 0.04) ** 4));               // a short one beside it
  return y;
}

export default {
  name: 'jar_b', id: 'sculpt_jar_b',
  voxel: 0.002, lods: [1800, 600, 200], lodError: [0.0025, 0.006, 0.012],
  ground: 0, aoRange: 0.07, cavity: [0.003, 0.014], creaseAngle: 50,
  materials: {
    clay: { name: 'clay', surface: 'earth', look: { spec: 0.12, specPower: 20, detail: 0.7, scale: 1.2 } },
    glaze: { name: 'glaze', surface: 'paint', look: { spec: 0.35, specPower: 46, detail: 0.5 } },
  },
  replaces: { file: 'assets/models/props/prop_jar_b.glb', scale: 0.53846 },
  notes: 'Sculpted small open jar (ash-glaze run, chipped rim). Vertex colours on every LOD, no textures: batched prop. Materials clay / glaze (as prop_jar_a).',

  build() {
    P.part('break', { mat: 'clay', paint: paintBreak });
    let body = P.lathe(OUT, { smooth: 0.004 });
    const mouth = P.lathe([[0, 0.255], [0.045, 0.258], [0.064, 0.29], [0.067, 0.33], [0.071, 0.345], [0.075, 0.37], [0, 0.37]], { smooth: 0.004 });
    body = body.softCut(mouth, 0.004);
    body = thrownWarp(body, { h: H, rings: { pitch: 0.022, amp: 0.0011, from: 0.05, to: 0.6 }, oval: 0.003, ovalAng: 70, lean: -0.004, leanAng: 40, seed: 7 });
    const ca = 60 * Math.PI / 180, cx = Math.cos(ca) * 0.083, cz = Math.sin(ca) * 0.083;
    body = body.chip({ at: [cx, 0.342, cz], dir: [cx, 0.5, cz], depth: 0.036, spread: 0.9, seed: 4, rough: 0.002, paint: 'break' });
    const clay = body.part('clay', { mat: 'clay', paint: paintClay });
    const bf = body.f;
    const glazeF = (x, y, z) => {
      const yl = glazeLine(Math.atan2(z, x)), tip = ss(0.05, 0.0, y - yl);
      return Math.max(bf(x, y, z) - 0.0004 - 0.0012 * ss(0, 0.015, y - yl) - 0.0018 * tip, (yl - y) * 0.85);
    };
    const glaze = new P.Shape(glazeF, [-0.15, 0.1, -0.15, 0.15, 0.36, 0.15]).part('glaze', { mat: 'glaze', paint: paintGlaze });
    return clay.add(glaze);
  },
};

function paintClay(c) {
  const { x, y, z, edge, ny } = c;
  const r = Math.hypot(x, z);
  const f = FIRE * Math.PI / 180, fs = (x * Math.cos(f) + z * Math.sin(f)) / (r || 1e-6);
  let col = mix(C('#c47a4a'), C('#a45e38'), 0.5 + 0.5 * P.fbm(x * 14, y * 14, z * 14, 3, 2));
  col = mix(col, C('#6a3524'), ss(0.2, 0.9, fs) * ss(0.08, 0.24, y) * 0.55);            // scorch under the glaze
  col = mix(col, C('#d8b08a'), ss(-0.1, -0.8, fs) * ss(0.3, 0.1, y) * 0.4);             // ash-grey flash on the cool side
  col = mix(col, C('#5e3524'), ss(0.05, 0.0, y) * 0.55);
  col = mix(col, C('#e6b088'), edge * 0.4);
  // the open mouth: dark inside
  if (r < 0.071 && y > 0.25 && ny > -0.95) col = mix(col, C('#2e1a12'), ss(0.34, 0.27, y) * 0.9);
  return col;
}
function paintBreak(c) { return mix(C('#e2a77c'), C('#c98a5f'), 0.5 + 0.5 * P.fbm(c.x * 60, c.y * 60, c.z * 60, 5, 2)); }
function paintGlaze(c) {
  const { x, y, z, cavity, edge } = c;
  const yl = glazeLine(Math.atan2(z, x)), thick = ss(0.045, 0.0, y - yl);
  let col = mix(C('#a39a4c'), C('#808642'), 0.5 + 0.5 * P.fbm(x * 30, y * 30, z * 30, 4, 2));
  col = mix(col, C('#3e5233'), thick * 0.85);
  col = mix(col, C('#c9ae62'), edge * 0.35);
  if (Math.hypot(x, z) < 0.071 && y > 0.27) col = mix(col, C('#2c3020'), ss(0.34, 0.29, y) * 0.8);
  return mix(col, C('#33402a'), cavity * 0.4);
}
