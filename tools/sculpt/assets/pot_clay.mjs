// pot_clay — a village cooking pot with two loop handles. Replaces prop_pot_clay (catalog `pot`: the breakable pot that
// drops stardust; 0.49 x 0.35 x 0.33 m, handles along x).
// INTENT
//  silhouette: a round belly on a foot ring, a thick rolled rim, two loop handles standing out to the sides like ears.
//  big forms: the belly / the rim collar / the handles.
//  the eye rests on: the soot of the hearth climbing the belly from below (rubbed off the high spots), the rim, one crack.
//  wear: years on a fire — black below, smoke licking up one side, the rim pale where the ladle knocks it, a hairline crack.
//  must NOT look like: a terracotta flowerpot, a smooth ball, a symmetrical trophy.
import * as P from '../sdf.mjs';
import { thrownWarp, C, mix, ss } from './_smallprops.mjs';

const H = 0.35;
const OUT = [[0, 0.004], [0.088, 0.004], [0.094, 0.0], [0.104, 0.0], [0.106, 0.016], [0.1, 0.024], [0.118, 0.04], [0.148, 0.08], [0.162, 0.135], [0.161, 0.19], [0.15, 0.245], [0.132, 0.288], [0.123, 0.305], [0.127, 0.318], [0.142, 0.328], [0.146, 0.338], [0.14, 0.346], [0.126, 0.346], [0, 0.346]];

export default {
  name: 'pot_clay', id: 'sculpt_pot_clay',
  voxel: 0.0022, lods: [1800, 600, 200], lodError: [0.003, 0.007, 0.014],
  ground: 0, aoRange: 0.08, cavity: [0.003, 0.015], creaseAngle: 50,
  materials: { clay: { name: 'clay', surface: 'earth', look: { spec: 0.12, specPower: 20, detail: 0.7, scale: 1.2 } } },
  replaces: { file: 'assets/models/refined/prop_pot_clay.glb', scale: 0.81301 },
  notes: 'Sculpted cooking pot (foot ring, loop handles, hearth soot, crack). Vertex colours on every LOD, no textures: batched prop. Material clay (as prop_pot_clay).',

  build() {
    let body = P.lathe(OUT, { smooth: 0.003 });
    // the open mouth, a shallow well (dark inside) — the pot is broken or carried, never looked into from close by
    body = body.softCut(P.lathe([[0, 0.22], [0.08, 0.225], [0.11, 0.27], [0.114, 0.33], [0.118, 0.36], [0, 0.36]], { smooth: 0.004 }), 0.004);
    // foot ring: a shallow hollow under the foot
    body = body.softCut(P.lathe([[0, -0.01], [0.082, -0.01], [0.078, 0.008], [0, 0.012]]), 0.003);
    body = thrownWarp(body, { h: H, rings: { pitch: 0.024, amp: 0.001, from: 0.3, to: 0.82 }, oval: 0.002, ovalAng: 20, lean: 0.003, leanAng: 120, seed: 11 });
    // handles: thick clay straps pulled and pressed on, not quite level
    const handle = (s, tilt) => P.tube([[s * 0.142, 0.29, 0], [s * 0.19, 0.3, 0.005], [s * 0.232, 0.27, 0.004], [s * 0.226, 0.22, 0], [s * 0.18, 0.19, -0.004], [s * 0.156, 0.188, -0.004]], (t) => 0.0135 - 0.003 * Math.sin(t * Math.PI), { aspect: 1.5, up: [0, 0, 1] }).turn(0, 0, tilt);
    body = body.softAdd(handle(1, 2).add(handle(-1, -4)), 0.012);
    body = body.crack([[0.03, 0.344, 0.123], [0.04, 0.31, 0.128], [0.034, 0.27, 0.15], [0.045, 0.235, 0.158]], { width: 0.0035, jag: 0.006, seed: 3 });
    const clay = body.part('clay', { mat: 'clay', paint: paintPot });
    // hearth soot as its own skin (a crisp edge that survives 600 triangles): up from the foot, tongues on the flame side
    const bf = body.f;
    const sootF = (x, y, z) => Math.max(bf(x, y, z) - 0.0005, (y - sootLine(Math.atan2(z, x))) * 0.85);
    const soot = new P.Shape(sootF, [-0.25, -0.01, -0.18, 0.25, 0.3, 0.18]).part('soot', { mat: 'clay', paint: paintSoot });
    return clay.add(soot);
  },
};

function sootLine(a) {
  const lick = 0.5 + 0.5 * Math.cos(a - 3.6);
  let y = 0.075 + 0.07 * lick + 0.02 * Math.sin(a * 3 + 0.5);
  for (const [c, w, L] of [[3.2, 0.12, 0.07], [3.75, 0.1, 0.09], [4.3, 0.09, 0.05], [2.5, 0.08, 0.035]]) { let d = a - c; d = Math.atan2(Math.sin(d), Math.cos(d)); y += L * Math.exp(-((d / w) ** 2)); }
  return y;
}
function paintSoot(c) {
  const { x, y, z, edge, ny } = c;
  const top = ss(sootLine(Math.atan2(z, x)) - 0.04, sootLine(Math.atan2(z, x)), y);
  let col = mix(C('#2a2320'), C('#3a302a'), 0.5 + 0.5 * P.fbm(x * 25, y * 25, z * 25, 6, 2));
  col = mix(col, C('#5a4538'), top * 0.6);                 // the smoke thins to brown at its edge
  col = mix(col, C('#7a5a46'), edge * 0.5);                // rubbed off the foot ring and the high belly
  if (ny < -0.7) col = mix(col, C('#1c1714'), 0.5);
  return col;
}
function paintPot(c) {
  const { x, y, z, edge, ny, ao } = c;
  const r = Math.hypot(x, z);
  let col = mix(C('#b86c40'), C('#9a5534'), 0.5 + 0.5 * P.fbm(x * 12, y * 12, z * 12, 4, 2));
  // hearth soot: up from the foot, higher on the side the flames licked (-z,-x), with tongues; rubbed off the edges
  const line = sootLine(Math.atan2(z, x));
  col = mix(col, C('#6a4532'), ss(line + 0.07, line, y) * 0.6);   // brown smoke halo above the soot
  col = mix(col, C('#e2ad84'), edge * 0.45);                      // ladle-knocked rim, handle tops
  if (ny > 0.5 && y > 0.32) col = mix(col, C('#d39a6f'), 0.3);
  if (r < 0.116 && y > 0.2 && ny > -0.9) col = mix(col, C('#2a1a12'), ss(0.33, 0.25, y) * 0.9);  // inside
  return col;
}
