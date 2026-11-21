// HIP LANTERN — the small collapsible paper lantern at the heroine's left hip (replaces the sphere + two cylinders built in
// src/player/player.js, ~l. 88-104). Same origin (the lantern's centre, attached to 'hips' at [0.17, -0.12, -0.04]), same
// size (paper 0.13 wide, 0.195 between the ring faces), +Y up. Crests face +X and -X (outward / toward her body).
// SILHOUETTE: a squat paper barrel pinched by two black rings, a small iron hook rising off-centre with its cord loop.
// BIG / MEDIUM / SMALL: the paper body / the lacquer rings, the hook / the bamboo ribs as soft ridges, the round petal crest,
//   the cord knot.
// EYE RESTS ON: the crest (dark against the glowing paper at night), the hook, the ring rims.
// The top is open (a vent): the glowing paper shows through the top ring at night, a cross wire carries the hook.
// WEAR: the side against her body (-X) is pressed a little flat and one rib bent; the paper under the top ring is browned by
//   the candle's heat; the lacquer is rubbed through to the red undercoat on the outer ring edges.
// MUST NOT LOOK LIKE: a ball between two hockey pucks; a perfectly turned, evenly ribbed lathe object.
import * as P from '../sdf.mjs';

const B = 0.0948, R0 = 0.064, Y_END = 0.0775;          // paper superellipse half-height, radius, where it tucks under the rings
const pr = (y) => { const t = Math.min(1, Math.abs(y) / B); return R0 * Math.pow(1 - Math.pow(t, 2.4), 1 / 2.4); };
const RIB = 60;                                         // ribs at y = (k + 0.5) / 60 — the glow shader's dark bands (celmat lanternPaperMaterial)

export default {
  name: 'hip_lantern',
  id: 'sculpt_hip_lantern',
  voxel: 0.0004,
  lods: [1800, 700, 250],
  lodError: [0.0006, 0.0015, 0.004],
  atlas: 512,
  ground: null,
  aoRange: 0.02,
  cavity: [0.0012, 0.005],
  bandSlack: 0.003,
  creaseAngle: 55,
  materials: {
    paper: { name: 'LanternPaper', surface: 'paper', look: { trans: 0.35, detail: 0, bump: 0, fine: 0 } },
    ink: { name: 'Ink', surface: 'paper', look: { detail: 0, bump: 0, fine: 0 } },
    lacquer: { name: 'Lacquer', surface: 'paint', look: { spec: 0.18, specPower: 36, detail: 0, bump: 0, fine: 0 } },
    iron: { name: 'Iron', surface: 'metal', look: { spec: 0.35, detail: 0, bump: 0, fine: 0 } },
    cord: { name: 'Cord', surface: 'cloth', look: { detail: 0, bump: 0, fine: 0 } },
  },
  anchors: { hang: [0.004, 0.124, -0.004], light: [0, 0, 0] },
  notes: 'Sculpted hip lantern. Origin = lantern centre (old hipLantern group origin). Paper body = material LanternPaper_paper (celifyProp turns it into the glowing lanternPaperMaterial); crest = Ink. LOD0 atlas + object-space normal map; LOD1/2 vertex colours. See .tmp/sculpt/hip_lantern/INSTALL.md.',

  build({ S }) {
    // ---- paper body: superellipse barrel, ribs as soft ridges with the paper sagging between, pressed flat on -X
    const paperF = (x, y, z) => {
      let rho = Math.hypot(x, z);
      // pressed side (against her hip): the barrel flattens a little toward -X
      const press = Math.max(0, -x / rho) ** 3 * 0.0045 * (1 - (y / B) ** 2);
      const fr = y * RIB - Math.floor(y * RIB) - 0.5;      // 0 on a rib

      
      const rib = Math.exp(-((fr / 0.16) ** 2)) * 0.0013 - 0.0004;   // softer ridges: a gentle scallop, not a saw edge
      const r = pr(y) + rib * (pr(y) / R0) - press;
      const d = (rho - r) * 0.9;
      return Math.max(d, Math.abs(y) - Y_END);
    };
    let paper = new S.Shape(paperF, [-0.066, -0.08, -0.066, 0.066, 0.08, 0.066], null, 1.3);
    // the bent rib: a shallow dent where it was knocked
    paper = paper.pinch([0.03, 0.025, 0.056], 0.016, 0.0016);
    // the vent: the top is open, you look down into the lantern (the inner wall is paper too, so it glows at night)
    paper = paper.softCut(S.ellipsoid([0.0245, 0.05, 0.0245]).at(0, 0.088, 0), 0.002);
    paper = paper.part('paper', { mat: 'paper', paint: paintPaper });

    // ---- crest: a round mon — a ring of even 2.2 mm line, five round petals and a centre dot, 0.8 mm proud, on +X and -X
    const crest2 = (u, v) => {                               // 2D signed distance in the crest plane (u = z, v = y - yc)
      const r = Math.hypot(u, v), a = Math.atan2(u, v);
      const ring = Math.abs(r - 0.0185) - 0.0011;
      const sec = (2 * Math.PI) / 5, k = Math.round(a / sec), ar = a - k * sec;
      const petal = Math.hypot(r * Math.cos(ar) - 0.0092, r * Math.sin(ar)) - 0.0048;
      const dot = r - 0.0022;
      return Math.min(ring, petal, dot);
    };
    const yc = 0.006, CS = 1.0;
    const crestF = (x, y, z) => Math.max(crest2(z / CS, (y - yc) / CS) * CS, 0.035 - Math.abs(x));
    const crestPrism = new S.Shape(crestF, [-0.07, yc - 0.022, -0.022, 0.07, yc + 0.022, 0.022]);
    const relief = new S.Shape((x, y, z) => paperF(x, y, z) - 0.0008, [-0.067, -0.08, -0.067, 0.067, 0.08, 0.067], null, 1.3);
    const ink = relief.intersect(crestPrism).part('crest', { mat: 'ink', paint: paintInk });

    // ---- lacquer rings top and bottom (each a flat band with a rolled rim), a turned plug in the bottom one
    const ringProf = (s) => [[0.026, 0], [0.041, 0], [0.0435, 0.0018], [0.0435, 0.0085], [0.0415, 0.0112], [0.034, 0.0122], [0.026, 0.0122]].map(([r, y]) => [r, s > 0 ? 0.0745 + y : -0.0745 - y]);
    // the top ring at ~70 % of the bottom one's height (it was the heavy black puck the eye stopped on)
    const topProf = [[0.026, 0], [0.041, 0], [0.0433, 0.0013], [0.0433, 0.0058], [0.0416, 0.0078], [0.034, 0.0086], [0.026, 0.0086]].map(([r, y]) => [r, 0.0745 + y]);
    let rings = S.lathe(topProf).add(S.lathe(ringProf(-1)));
    rings = rings.add(S.lathe([[0, -0.08], [0.027, -0.08], [0.027, -0.0875], [0.024, -0.0905], [0.006, -0.0915], [0, -0.0918]]));
    // kit lathe() always closes the profile to the axis, so the top ring comes out as a lid: bore the vent through it
    rings = rings.cut(S.cylinder(0.0262, 0.03).at(0, 0.07, 0));
    rings = rings.softCut(S.torus(0.0433, 0.0008).at(0, 0.0788, 0), 0.0005).softCut(S.torus(0.0435, 0.0009).at(0, -0.0805, 0), 0.0005);
    rings = rings.wear(0.0008, { vary: 0.5, seed: 3, scale: 0.01 });
    rings = rings.part('rings', { mat: 'lacquer', paint: paintLacquer });

    // ---- iron hook: a stem off the top plug, bent over into a hook that opens toward -Z; a cord loop tied round it
    const hook = S.tube([[0.004, 0.085, 0.002], [0.004, 0.1, 0.0015], [0.0045, 0.112, 0.0], [0.004, 0.121, -0.003], [0.0035, 0.1245, -0.0085], [0.003, 0.121, -0.0135], [0.003, 0.1155, -0.0135]], (t) => 0.0016 - 0.0004 * t)
      .add(S.sphere(0.0021).at(0.003, 0.1155, -0.0135))
      .add(S.lathe([[0, 0.0835], [0.0042, 0.0835], [0.0046, 0.0858], [0.003, 0.0885], [0, 0.089]]).at(0.004, 0, 0.002))
      // the cross wire over the open top: ends bent down into the ring, the hook's stem riveted at its middle
      .add(S.tube([[-0.031, 0.0805, 0.0018], [-0.029, 0.0855, 0.002], [-0.01, 0.0858, 0.002], [0.018, 0.0858, 0.002], [0.029, 0.0855, 0.002], [0.031, 0.0805, 0.0018]], 0.0011, { smooth: false }))
      .part('hook', { mat: 'iron', paint: paintIron });
    const loop = S.tube([[0.004, 0.103, 0.0015], [0.0105, 0.0985, 0.0065], [0.0125, 0.092, 0.0], [0.0095, 0.0985, -0.0065], [0.004, 0.103, 0.0015]], 0.0010)
      .add(S.torus(0.0028, 0.0011).at(0.0042, 0.1035, 0.0015))
      .add(S.tube([[0.0068, 0.102, 0.003], [0.0105, 0.094, 0.009], [0.012, 0.083, 0.011]], 0.0009))
      .part('cord', { mat: 'cord', paint: paintCord });

    return S.union(paper, ink, rings, hook, loop);
  },

  async before({ ROOT, threeToMeshes }) {
    const THREE = await import(ROOT + '/node_modules/three/build/three.module.js');
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffb155 }));
    paper.scale.y = 1.25;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.025, 8), new THREE.MeshLambertMaterial({ color: 0x5b3a29 }));
    cap.position.y = 0.085;
    const cap2 = cap.clone(); cap2.position.y = -0.085;
    g.add(paper, cap, cap2);
    return { meshes: threeToMeshes(g) };
  },
};

// ----------------------------------------------------------------------------------------------------------- paint
function paintPaper(c) {
  const { x, y, z, cavity } = c;
  // washi: warm off-white with long fibres; the ribs show through darker; browned under the top ring by the heat
  let col = P.mix(P.color('#f7ecd2'), P.color('#efdfbd'), P.ss(0.1, 0.8, P.fbm(x * 90, y * 260, z * 90, 2, 3)));
  col = P.mix(col, P.color('#fff7e4'), P.ss(0.55, 0.8, P.fbm(x * 400, y * 40, z * 400, 5, 2)) * 0.4);
  // the belly a touch brighter (thinnest paper, nearest the flame), the bamboo ribs a steady ~15 % darker band
  col = P.mix(col, P.color('#fffaec'), (1 - (y / 0.075) ** 2) * 0.35);
  const fr = y * RIB - Math.floor(y * RIB) - 0.5;
  col = col.map((v) => v * (1 - 0.15 * Math.exp(-((fr / 0.11) ** 2))));
  col = P.mix(col, P.color('#b98d55'), P.ss(0.05, 0.077, y) * 0.55);
  col = P.mix(col, P.color('#d8c49c'), P.ss(-0.2, -0.8, x / 0.064) * 0.3); // rubbed against her hip
  return P.mix(col, P.color('#a88f68'), cavity * 0.5);
}
function paintInk(c) {
  const { x, y, z, edge } = c;
  // vermilion-black sun wheel: the ink pooled darker in the middle, a little lighter where it thinned on the rays
  const r = Math.hypot(z, y - 0.006);
  let col = P.mix(P.color('#2a1714'), P.color('#5a221a'), P.ss(0.008, 0.022, r));
  col = P.mix(col, P.color('#7a3022'), P.ss(0.4, 0.8, P.fbm(x * 200, y * 200, z * 200, 3, 2)) * 0.3);
  return P.mix(col, P.color('#8a4a34'), edge * 0.25);
}
function paintLacquer(c) {
  const { x, y, z, edge, cavity, ny } = c;
  // dark lacquer brown, not black; a lighter warm highlight on the rolled rim
  let col = P.mix(P.color('#2b1a12'), P.color('#432a1c'), P.ss(-0.2, 0.8, ny));
  col = P.mix(col, P.color('#7a5238'), edge * 0.55);
  // rubbed through to the red undercoat on the outer rims, more on the outward (+X) side
  const rub = edge * (0.45 + 0.55 * P.ss(-0.3, 0.8, x / 0.043)) * P.ss(0.3, 0.75, P.fbm(x * 300, y * 300, z * 300, 8, 2) + 0.35);
  col = P.mix(col, P.color('#8c2a1c'), P.clamp(rub * 1.3, 0, 0.85));
  return P.mix(col, P.color('#120a07'), cavity * 0.6);
}
function paintIron(c) {
  const { edge, cavity, x, y, z } = c;
  let col = P.mix(P.color('#2d2b2c'), P.color('#4a4441'), P.ss(0.3, 0.7, P.fbm(x * 500, y * 500, z * 500, 2, 2)));
  col = P.mix(col, P.color('#6b4a33'), P.ss(0.5, 0.75, P.fbm(x * 300, y * 300, z * 300, 4, 2)) * 0.5); // a little rust
  col = P.mix(col, P.color('#9a958e'), edge * 0.55);
  return P.mix(col, P.color('#121112'), cavity * 0.6);
}
function paintCord(c) {
  const { edge, cavity } = c;
  let col = P.color('#9b3a26');
  col = P.mix(col, P.color('#c9644a'), edge * 0.5);
  return P.mix(col, P.color('#4a160e'), cavity * 0.7);
}

// ---------------------------------------------------------------- post step (kit workaround, see gohei.mjs kitNotes)
// node tools/sculpt/assets/hip_lantern.mjs --post   (ALWAYS after a build). LOD1/2 vertex colours are sampled by position
// only, so on the far LODs the long ring / hook triangles borrow the paper colour (tan rings). Re-paint the vertices of
// the small dark parts (lacquer, iron, cord) with their own paint, and border vertices of the others.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
async function post(file) {
  const { NodeIO } = await import('@gltf-transform/core');
  const io = new NodeIO(), doc = await io.read(file);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const fn = (m) => (/^Lacquer/.test(m) ? paintLacquer : /^Iron/.test(m) ? paintIron : /^Cord/.test(m) ? paintCord : /^Ink/.test(m) ? paintInk : paintPaper);
  for (const mesh of doc.getRoot().listMeshes()) {
    const prims = mesh.listPrimitives().filter((p) => p.getAttribute('COLOR_0'));
    const key = (a, i) => `${a[i].toFixed(5)},${a[i + 1].toFixed(5)},${a[i + 2].toFixed(5)}`, owners = new Map();
    prims.forEach((p, pi) => { const a = p.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) { const k = key(a, i); (owners.get(k) || owners.set(k, new Set()).get(k)).add(pi); } });
    prims.forEach((p) => {
      const mat = p.getMaterial().getName(), all = /^(Lacquer|Iron|Cord)/.test(mat);
      const a = p.getAttribute('POSITION').getArray(), n = p.getAttribute('NORMAL').getArray(), C = p.getAttribute('COLOR_0'), col = C.getArray().slice();
      for (let i = 0; i < a.length; i += 3) {
        if (!all && owners.get(key(a, i)).size < 2) continue;
        const c = fn(mat)({ x: a[i], y: a[i + 1], z: a[i + 2], nx: n[i], ny: n[i + 1], nz: n[i + 2], h: 0.5, ao: 1, cavity: 0.15, edge: 0.3, broad: 0 });
        const sh = 0.8 + 0.15 * n[i + 1];
        for (let k = 0; k < 3; k++) col[i + k] = lin(c[k]) * sh;
      }
      C.setArray(col);
    });
  }
  layFarLOD(doc);
  await io.write(file, doc);
}

// LOD2 (far, < 60 px), laid by hand: the simplifier's 250 tris gave hard octagon facets and a dark diamond for the mon.
// 12-sided paper barrel and rings, the hook as two thin rods, no mon and no cord. Flat normals, vertex colours from the
// same paint functions (linear, a little sky-over-ground shade so the faces separate).
function layFarLOD(doc) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const soup = () => ({ p: [], n: [], c: [] });
  const tri = (g, a, b, c, paint) => {
    const u = [0, 1, 2].map((k) => b[k] - a[k]), v = [0, 1, 2].map((k) => c[k] - a[k]);
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    for (const q of [a, b, c]) {
      const col = paint({ x: q[0], y: q[1], z: q[2], nx: n[0], ny: n[1], nz: n[2], h: 0.5, ao: 1, cavity: 0.1, edge: 0.15, broad: 0 });
      g.p.push(...q); g.n.push(...n); g.c.push(...col.slice(0, 3).map((x) => Math.min(1, lin(x) * (0.84 + 0.12 * n[1]))));
    }
  };
  const N = 12, ph = Math.PI / N;
  const ring = (y, r) => Array.from({ length: N }, (_, i) => { const a = ph + (i / N) * 2 * Math.PI; return [r * Math.sin(a), y, r * Math.cos(a)]; });
  const prism = (g, rings, paint) => {
    const R = rings.map(([y, r]) => ring(y, r));
    for (let j = 0; j + 1 < R.length; j++) for (let i = 0; i < N; i++) { const a = R[j][i], b = R[j][(i + 1) % N], c = R[j + 1][(i + 1) % N], d = R[j + 1][i]; tri(g, a, b, c, paint); tri(g, a, c, d, paint); }
    const B = R[0], T = R[R.length - 1];
    for (let i = 1; i + 1 < N; i++) { tri(g, B[0], B[i + 1], B[i], paint); tri(g, T[0], T[i], T[i + 1], paint); }
  };
  const rod = (g, a, b, r, paint) => {   // closed triangular rod
    const d = [0, 1, 2].map((k) => b[k] - a[k]), L = Math.hypot(...d), u = d.map((x) => x / L);
    const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let e1 = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]]; const l1 = Math.hypot(...e1); e1 = e1.map((x) => x / l1);
    const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
    const rg = (o) => [0, 1, 2].map((i) => { const t = (i / 3) * 2 * Math.PI; return [0, 1, 2].map((k) => o[k] + (e1[k] * Math.cos(t) + e2[k] * Math.sin(t)) * r); });
    const A = rg(a), Bq = rg(b);
    for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tri(g, A[i], A[j], Bq[j], paint); tri(g, A[i], Bq[j], Bq[i], paint); }
    tri(g, A[0], A[2], A[1], paint); tri(g, Bq[0], Bq[1], Bq[2], paint);
  };
  const G = { LanternPaper: soup(), Lacquer: soup(), Iron: soup() };
  prism(G.LanternPaper, [-0.0775, -0.045, 0, 0.045, 0.0775].map((y) => [y, pr(y) - 0.0003]), paintPaper);
  prism(G.Lacquer, [[0.0745, 0.0433], [0.0831, 0.0405]], paintLacquer);
  prism(G.Lacquer, [[-0.0918, 0.032], [-0.0745, 0.0435]], paintLacquer);
  rod(G.Iron, [0.004, 0.083, 0.002], [0.0045, 0.115, 0.0], 0.0019, paintIron);
  rod(G.Iron, [0.0045, 0.113, 0.001], [0.0035, 0.1245, -0.0085], 0.0017, paintIron);
  rod(G.Iron, [0.0035, 0.1235, -0.0075], [0.003, 0.1155, -0.0135], 0.0016, paintIron);
  const node = doc.getRoot().listNodes().find((o) => o.getName() === 'hip_lantern_LOD2'), mesh = node.getMesh();
  for (const prim of mesh.listPrimitives()) {
    const k = /^(\w+?)_/.exec(prim.getMaterial().getName())?.[1], g = G[k];
    if (!g) { mesh.removePrimitive(prim); prim.dispose(); continue; }
    prim.getAttribute('POSITION').setArray(new Float32Array(g.p));
    prim.getAttribute('NORMAL').setArray(new Float32Array(g.n));
    prim.getAttribute('COLOR_0').setArray(new Float32Array(g.c));
    prim.getIndices().setArray(Uint16Array.from({ length: g.p.length / 3 }, (_, i) => i));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--post')) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  post(path.join(ROOT, 'assets/models/sculpt/hip_lantern.glb')).then(() => console.log('far LOD colours repainted'));
}
