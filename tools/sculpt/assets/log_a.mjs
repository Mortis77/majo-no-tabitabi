// log_a — a woodcutter's log left in the forest (replaces nat_log_1 / species log1: 0.59 x 0.70 x 2.50, lying along Z).
// SILHOUETTE: a thick barked log, one end sawn square, the other end the axe-felled point of the tree, a sawn-off branch
//   stub standing up from its back — a log someone WORKED, not a cylinder.
// BIG FORMS: (1) the barked body, a little swollen toward the felled end, (2) the felling end: two big axe faces meeting
//   in a torn hinge of splinters, (3) the started V-notch on the top where someone began to cut it to length.
// THE EYE RESTS ON: the sawn face with its growth rings and the pale fresh wood of the notch against the dark bark; the
//   three small glowing caps tucked under the felled end (the old log's accent, kept).
// WEAR STORY: felled with the axe, carried, sawn at one end, a notch started and abandoned; it has lain one season: a thin
//   moss patch on the damp top toward the felled end, the bark plates opening, mushrooms in the shade underneath.
// MUST NOT LOOK LIKE: a pack log (a smooth cylinder with flat caps), a perfectly round section, the same bark all over.
import { logBody, plates, furrows, ringFace, mossBlanket, mushroom, splinters, bunion, limb, floorAt, rings, lit, grey, ss, mix, C, brk } from './bamboologs_lib.mjs';
import * as P from '../sdf.mjs';

const FARF = () => process.env.BL_FAR === '1';
const Y0 = 0.255, R0 = 0.262, ZA = -1.3, ZB = 1.36, SAW = 1.255;
const NOTCH = { z: 0.18, yb: 0.33, k: 0.75 };
const STUB = { a: [0.06, 0.36, -0.36], b: [0.14, 0.75, -0.52] };

function bark(c) {
  const { x, y, z, nx, ny, nz, cavity, edge, ao } = c;
  // dark warm bark; plate faces mid, the ridges catch light, grooves near black; damp and greener underneath
  let col = mix(C('#523629'), C('#634434'), ss(-0.3, 0.6, ny));
  col = mix(col, C('#8a6f58'), edge * 0.7);
  col = mix(col, C('#2a1d16'), Math.min(1, cavity * 1.6));
  col = mix(col, C('#4a4532'), ss(0.08, 0.0, y) * 0.5);
  // the bark tears back from the notch and the felled end: pale ragged rims of bast
  const nearNotch = ss(0.16, 0.08, Math.abs(z - NOTCH.z)) * ss(0.33, 0.43, y);
  col = mix(col, C('#a8835e'), nearNotch * 0.6);
  return col;
}
function sawn(c) {
  const { x, y, z, edge, cavity } = c;
  // the sawn end: pale wood, darker heart, growth rings, a radial drying check
  const rg = rings(x, y, z, [0.015, Y0 + 0.01, SAW], [1, 0, 0], [0, 1, 0], { spacing: 0.021, seed: 4 });
  const rr = Math.hypot(x - 0.015, y - Y0 - 0.01);
  let col = mix(C('#d7b386'), C('#b98d5f'), ss(0.06, 0.0, rr) * 0.8);
  col = mix(col, C('#93683f'), rg * 0.75);
  col = mix(col, C('#6a4a32'), ss(0.24, 0.26, rr));                                   // the cambium ring under the bark
  // faint saw arcs (the cut came down from the top)
  col = mix(col, C('#c7a275'), 0.25 * (0.5 + 0.5 * Math.sin((y * 0.0 + Math.hypot(x - 0.6, y - 0.9)) * 260)));
  return mix(col, C('#3a281c'), Math.min(1, cavity * 1.4));
}
function chopped(c) {
  const { x, y, z, edge, cavity } = c;
  // fresh axe faces: pale, with the dark lines of each blow across the face
  let col = mix(C('#d9b88c'), C('#c09668'), 0.5 + 0.5 * P.fbm(x * 9, y * 9, z * 9, 7, 2));
  col = mix(col, C('#8c6440'), ss(0.65, 0.9, 0.5 + 0.5 * Math.sin((y * 0.9 + z * 0.45) * 95)) * 0.5);
  col = mix(col, C('#ead1a8'), edge * 0.5);
  return mix(col, C('#4a3322'), Math.min(1, cavity * 1.5));
}
const stem = (c) => mix(C('#e8dfcf'), C('#b9ab92'), ss(0.5, 0.0, c.ny + 0.5) * 0.5);
const capV = (c) => grey(0.7 + 0.3 * ss(-0.2, 0.8, c.ny) + 0.1 * c.edge);
const mossV = (c) => grey(0.62 + 0.38 * ss(0.0, 0.9, c.ny) + 0.12 * c.edge - 0.2 * c.cavity);


export default {
  name: 'log_a', id: 'sculpt_nat_log_a', species: ['log1'], view: 'prop',
  voxel: 0.0075,
  lods: [2400, 800, 250],
  farFrom: 2, farVoxel: 2.6,
  ground: 0, aoRange: 0.25, aoStrength: 0.55, cavity: [0.008, 0.04], cavityDark: 0.28, creaseAngle: 50,
  materials: { wood: { name: 'trunk', surface: 'bark' }, crown: { name: 'moss', surface: 'none' }, cap: { name: 'cap', surface: 'none' } },
  tintMats: ['crown', 'cap'], tintK: { crown: 0.9 },
  previewTint: [0.159, 0.347, 0.069],                                 // scatter C.mossSun (linear)
  tints: { cap: [0.323, 0.275, 0.042] },
  landTints: { 'DUSK MOSS 9a8f3a': { crown: [0.323, 0.275, 0.042], cap: [0.323, 0.275, 0.042] }, 'NIGHT MOSS 2a6a66': { crown: [0.023, 0.145, 0.133], cap: [0.023, 0.145, 0.133] } },
  replaces: { file: 'assets/models/refined/nat_log_1.glb', rules: { cap: { tint: [0.323, 0.275, 0.042] }, stem: { mul: [0.745, 0.672, 0.552] } } },
  notes: 'Sculpted sawn log (log1). trunk (mul, real colour: bark, sawn face, axe faces, mushroom stems), moss (tint), cap (tint, glow: the small mushrooms). COLOR_0.a = snow mask. See .tmp/sculpt/bamboo_a/INSTALL.md.',
  build({ S }) {
    const far = FARF();
    S.part('bark', { mat: 'wood', paint: lit(bark) }); S.part('sawn', { mat: 'wood', paint: lit(sawn) }); S.part('chopped', { mat: 'wood', paint: lit(chopped) });
    S.part('stem', { mat: 'wood', paint: lit(stem) }); S.part('logmoss', { mat: 'crown', paint: mossV }); S.part('caps', { mat: 'cap', paint: capV });
    // body: swells toward the felled (-Z) end, a little oval, a slight bend
    let body = logBody([0, Y0, ZA], [0.0, Y0 + 0.005, ZB], (t) => R0 * (1.07 - 0.1 * t) * (1 + 0.03 * Math.sin(t * 9.0)), { aspect: 0.93, lumps: far ? 0 : 0.025, seed: 2 });
    // the branch stub (sawn off)
    let stub = limb([STUB.a, [0.1, 0.56, -0.44], STUB.b], 0.085, 0.066, 1);
    body = body.softAdd(stub, 0.05);
    if (!far) body = furrows(body, { axis: 'z', centre: () => [0, Y0], n: 11, depth: 0.018, width: 0.14, seed: 5, plate: 0.5, where: (x, y, z) => ss(SAW - 0.01, SAW - 0.08, z) * ss(-1.15, -0.95, z) * ss(0.2, 0.32, Math.hypot(x - 0.1, y - 0.55, z + 0.44)) });
    body = body.part('bark', { mat: 'wood', paint: lit(bark) });
    // the sawn end (square-ish, not quite: the saw wandered) and the sawn stub top
    const sawPl = P.plane(P.norm([-0.06, -0.04, -1]), [0, Y0, SAW]);           // negative beyond the saw line
    body = body.cut(sawPl.scale(1).intersect(P.box([1, 1, 0.4]).at(0, Y0, SAW + 0.2)).part('sawn', { mat: 'wood', paint: lit(sawn) }), { paintCut: true });
    if (!far) body = ringFace(body, [0.015, Y0 + 0.01, SAW], P.norm([0.06, 0.04, 1]), { spacing: 0.062, width: 0.017, depth: 0.014, R: 0.235, check: 1.9, checkW: 0.016 });
    const sd = P.norm([STUB.b[0] - STUB.a[0], STUB.b[1] - STUB.a[1], STUB.b[2] - STUB.a[2]]);
    const stubTop = [STUB.a[0] + sd[0] * 0.36, STUB.a[1] + sd[1] * 0.36, STUB.a[2] + sd[2] * 0.36];
    body = body.cut(P.plane([-sd[0], -sd[1], -sd[2]], stubTop).intersect(P.sphere(0.12).at(...STUB.b)).part('sawn', { mat: 'wood', paint: lit(sawn) }), { paintCut: true });
    // the felled end: two axe faces meeting in a hinge
    const RID = [0, Y0 - 0.03, -1.12], box = P.box([1, 1, 1.1]).at(0, Y0, -1.35);
    const n1 = P.norm([0, 0.66, -0.75]), n2 = P.norm([0.12, -0.6, -0.79]);
    body = body.cut(P.plane([-n1[0], -n1[1], -n1[2]], RID).intersect(box).part('chopped', { mat: 'wood', paint: lit(chopped) }), { paintCut: true });
    body = body.cut(P.plane([-n2[0], -n2[1], -n2[2]], RID).intersect(box).part('chopped', { mat: 'wood', paint: lit(chopped) }), { paintCut: true });
    // the abandoned V-notch on the top
    const nA = P.plane(P.norm([0, -1, NOTCH.k]), [0, NOTCH.yb, NOTCH.z]), nB = P.plane(P.norm([0, -1, -NOTCH.k]), [0, NOTCH.yb, NOTCH.z]);
    body = body.cut(nA.intersect(nB).intersect(P.box([0.8, 0.4, 0.4]).at(0, NOTCH.yb + 0.2, NOTCH.z)).part('chopped', { mat: 'wood', paint: lit(chopped) }), { paintCut: true });
    if (!far) {
      // axe bites on the felled faces (bounded breaks, not strips)
      for (const [p, d, dep, sd2] of [[[0.09, Y0 + 0.1, -1.0], [0, 0.66, -0.75], 0.022, 1], [[-0.11, Y0 + 0.04, -1.07], [0, 0.66, -0.75], 0.02, 2], [[0.05, Y0 - 0.13, -1.03], [0, -0.6, -0.79], 0.02, 3]]) body = body.cut(brk(p, d, dep, { seed: sd2 }).part('chopped', { mat: 'wood', paint: lit(chopped) }), { paintCut: true });
      // the torn hinge: splinters along the meeting line, pointing out of the end
      const sp = [];
      for (const [x, sd3] of [[-0.12, 1], [-0.02, 2], [0.09, 3]]) sp.push(...splinters([x, Y0 - 0.03, -1.1], [0, 0.1, -1], 0.035, { n: 2, len: 0.09, seed: sd3, rmin: 0.011, spread: 0.5 }));
      body = body.add(bunion(sp).part('chopped', { mat: 'wood', paint: lit(chopped) }));
    }
    let all = body;
    // moss: a thin patch on the damp top toward the felled end
    const moss = mossBlanket(body, far ? 0.03 : 0.024, (x, y, z) => (y - Y0 - 0.2 - 0.09 * P.fbm(x * 7, 0, z * 7, 3, 2) + 0.06 * x / 0.25) * 6 - Math.max(0, Math.abs(z + 0.85) - 0.14) * 2.5, { seed: 6, scale: 0.07, bump: 0.3 });
    all = all.add(moss.intersect(P.box([0.8, 0.4, 1.4]).at(0, Y0 + 0.2, -0.5)).part('logmoss', { mat: 'crown', paint: mossV }));
    // a little group of caps on the shaded upper flank by the stub (the old log's glowing accent, kept and placed)
    const st = [], cp = [];
    for (const [at, d, len, r, R] of [[[-0.19, 0.44, -0.6], [-0.55, 0.83, 0], 0.09, 0.016, 0.068], [[-0.225, 0.4, -0.46], [-0.7, 0.7, 0.15], 0.07, 0.014, 0.054], [[-0.15, 0.47, -0.74], [-0.4, 0.9, -0.15], 0.06, 0.012, 0.042]]) {
      const m = mushroom(at, d, len, r * (far ? 1.4 : 1), R * (far ? 1.2 : 1)); st.push(m.stem); cp.push(m.cap);
    }
    all = all.add(bunion(st).part('stem', { mat: 'wood', paint: lit(stem) })).add(bunion(cp).part('caps', { mat: 'cap', paint: capV }));
    return floorAt(all, 0);
  },
};
