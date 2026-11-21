// pot_large — a wide, low earthenware stew pot with its lid. Replaces prop_pot_large (0.60 x 0.225 x 0.36 m, loop handles
// along x).
// INTENT
//  silhouette: a squat belly under a domed lid with a knob, two flat loop handles sticking out like ears.
//  big forms: the belly / the lid / the loop handles.
//  the eye rests on: the black fire-skin over the bottom half (with a crisp ragged edge), the lid knob and its overhanging rim.
//  wear: a hearth pot — sooted to the waist, a pale rubbed rim where the lid turns, a lid that does not sit quite square.
//  must NOT look like: a metal saucepan, a smooth bowl, a symmetrical toy.
import * as P from '../sdf.mjs';
import { thrownWarp, C, mix, ss } from './_smallprops.mjs';

const OUT = [[0, 0.004], [0.1, 0.004], [0.106, 0], [0.118, 0], [0.12, 0.014], [0.114, 0.02], [0.14, 0.035], [0.168, 0.07], [0.176, 0.1], [0.172, 0.13], [0.16, 0.148], [0.158, 0.158], [0.15, 0.162], [0, 0.162]];
function sootLine(a) {
  let y = 0.07 + 0.022 * Math.cos(a - 0.6) + 0.006 * Math.sin(a * 3 + 1);
  for (const [c, w, L] of [[0.4, 0.22, 0.035], [-0.6, 0.2, 0.025], [2.6, 0.2, 0.02]]) { let d = a - c; d = Math.atan2(Math.sin(d), Math.cos(d)); y += L * Math.exp(-((d / w) ** 2)); }
  return y;
}

export default {
  name: 'pot_large', id: 'sculpt_pot_large',
  voxel: 0.0022, lods: [1800, 600, 200], farFrom: 2, farVoxel: 1.8, lodError: [0.003, 0.007, 0.014],
  ground: 0, aoRange: 0.08, cavity: [0.003, 0.015], creaseAngle: 50,
  materials: { clay: { name: 'clay', surface: 'earth', look: { spec: 0.12, specPower: 20, detail: 0.7, scale: 1.2 } } },
  replaces: { file: 'assets/models/props/prop_pot_large.glb', scale: 0.3 },
  notes: 'Sculpted lidded stew pot (foot ring, tab handles, soot). Vertex colours on every LOD, no textures: batched prop. Material clay.',

  build() {
    // LOD2 (revision 2): built from a simpler field so its 200 triangles go to the round silhouette (>= 12 sides), not
    // to the foot hollow, throwing rings and handle holes: solid ear tabs, no foot ring, lid fused onto the rim
    const FAR = process.env.SMALLPROPS_FAR === '1';
    if (FAR) return farPot();
    let body = P.lathe(OUT, { smooth: 0.003 });
    body = body.softCut(P.lathe([[0, -0.01], [0.096, -0.01], [0.092, 0.008], [0, 0.011]]), 0.003);       // foot ring
    body = thrownWarp(body, { h: 0.16, rings: { pitch: 0.022, amp: 0.001, from: 0.4, to: 0.85 }, oval: 0.004, ovalAng: 60, seed: 13 });
    // tab handles: pinched flat, thumb dent on top, ends rounded and a little lifted
    // loop handles: a thick clay coil bent into a flat D and pressed on, the right one sagging a little
    const loop = (sag) => P.tube([[0.16, 0.128, 0.062], [0.215, 0.132, 0.072], [0.262, 0.13 - sag, 0.054], [0.274, 0.126 - sag, 0], [0.262, 0.128 - sag, -0.052], [0.215, 0.131, -0.07], [0.16, 0.126, -0.06]], (t) => 0.021 - 0.003 * Math.sin(t * Math.PI));
    const tabs = loop(0.008).add(loop(0).turn(0, 180, 0));
    body = body.softAdd(tabs, 0.012);
    const clay = body.part('clay', { mat: 'clay', paint: paintPot });
    const bf = body.f;
    const soot = new P.Shape((x, y, z) => Math.max(bf(x, y, z) - 0.0005, (y - sootLine(Math.atan2(z, x))) * 0.85), [-0.32, -0.01, -0.2, 0.32, 0.17, 0.2])
      .part('soot', { mat: 'clay', paint: paintSoot });
    // lid: a low dome sitting inside the rim, a knob; cocked by a few degrees. (Revision 2: the steam notch is gone -
    // at game distance it read as a slot cut into the rim.)
    let lid = P.lathe([[0.15, -0.004], [0.168, 0.0], [0.17, 0.008], [0.152, 0.018], [0.11, 0.033], [0.06, 0.042], [0.03, 0.044], [0.026, 0.052], [0.03, 0.06], [0.022, 0.064], [0, 0.065]], { smooth: 0.003 });
    lid = thrownWarp(lid, { h: 0.07, rings: { pitch: 0.016, amp: 0.0008, from: 0.2, to: 0.7 }, seed: 15 });
    lid = lid.turn(1.5, 25, -1).at(0.003, 0.159, -0.002).part('lid', { mat: 'clay', paint: paintLid });
    return clay.add(soot).add(lid);
  },
};

function farPot() {
  // one part, one surface: part borders and the soot skin cost the far LOD its roundness; soot and lid are paint here
  const body = P.lathe([[0, 0.004], [0.118, 0], [0.14, 0.035], [0.168, 0.07], [0.176, 0.1], [0.172, 0.13], [0.16, 0.15], [0, 0.15]], { smooth: 0.004 });
  const ear = (s) => P.ellipsoid([0.06, 0.016, 0.07]).at(s * 0.225, 0.13, 0);
  const lid = P.lathe([[0, 0.14], [0.17, 0.152], [0.172, 0.166], [0.152, 0.176], [0.11, 0.192], [0.06, 0.201], [0.03, 0.205], [0.028, 0.219], [0, 0.223]], { smooth: 0.004 });
  return body.softAdd(ear(1).add(ear(-1)), 0.015).add(lid).part('clay', { mat: 'clay', paint: paintFar });
}
function paintFar(c) {
  const line = sootLine(Math.atan2(c.z, c.x));
  if (c.y > 0.153) return paintLid({ ...c, y: c.y - 0.159 });
  if (c.y < line) return paintSoot(c);
  return paintPot(c);
}

function paintPot(c) {
  const { x, y, z, edge } = c;
  const line = sootLine(Math.atan2(z, x));
  let col = mix(C('#b06a42'), C('#94573a'), 0.5 + 0.5 * P.fbm(x * 12, y * 12, z * 12, 4, 2));
  col = mix(col, C('#6a4532'), ss(line + 0.06, line, y) * 0.6);
  return mix(col, C('#e0ab82'), edge * 0.45);
}
function paintSoot(c) {
  const { x, y, z, edge, ny } = c;
  const line = sootLine(Math.atan2(z, x));
  let col = mix(C('#3a2f2a'), C('#4e4038'), 0.5 + 0.5 * P.fbm(x * 25, y * 25, z * 25, 6, 2));
  col = mix(col, C('#5a4538'), ss(line - 0.03, line, y) * 0.6);
  col = mix(col, C('#7a5a46'), edge * 0.5);
  if (ny < -0.7) col = mix(col, C('#1c1714'), 0.5);
  return col;
}
function paintLid(c) {
  const { x, y, z, edge, ny } = c;
  const r = Math.hypot(x, z);
  let col = mix(C('#d49a6a'), C('#b47a50'), 0.5 + 0.5 * P.fbm(x * 14, y * 14, z * 14, 5, 2));
  col = mix(col, C('#7c5a48'), ss(0.03, 0.0, r) * 0.2 + ss(0.13, 0.16, r) * 0.25);   // steam-stained centre, rim
  col = mix(col, C('#e6b48a'), edge * 0.5 + ss(0.035, 0.02, r) * 0.25);            // knob rubbed by fingers
  if (ny < -0.5) col = mix(col, C('#5a3a2a'), 0.5);
  return col;
}
