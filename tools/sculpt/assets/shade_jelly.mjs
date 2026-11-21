// 影团 — the shade jelly (TYPES.blob, makeJelly in src/actors/creature.js), sculpted as a static set of pieces for the
// same procedural rig: the JELLY_VERT shader (uJig squash / lean / wobble by y / 0.62) and the motion layer move it.
//
// INTENT
//  1. Silhouette: a heavy drop of taint that has just slumped to the ground — belly sagging forward-left over a wide
//     pooled rim, the crown still drawn up and back in a short pulled tip where it let go. Never a dome.
//  2. Big forms: the sagging belly (widest, lowest), the face-shoulder mass leaning forward over it, the flat scalloped
//     rim where it spreads on the ground.
//  3. Where the eye rests: the brow folds and sockets that hold the ember eyes; two drips running from the crown (one to a bead on the skirt)
//     to fat beads; the things it swallowed (a bone charm on a cord, a maple and a ginkgo leaf) round a pale clot core.
//  4. Wear story: the skin is thick and dusty where it drags on the ground (pale rim), wrinkles where the belly folds
//     onto the rim, darker and glossier on fresh drips; the light core shows through the front.
//  5. Must not look like: a hemisphere, a gumdrop, a symmetric blob, a pack slime with a face, noise for skin.
//
// Units: the code's local units (the game draws it at def.scale 1.5). Origin = foot centre, +Z front, +Y up.
import * as L from './jellypaper_lib.mjs';

const DETAIL = () => process.env.JP_DETAIL || 'full';

export default {
  name: 'shade_jelly', id: 'sculpt_shade_jelly',
  gameScale: 1.5,
  voxel: 0.0024,
  ground: 0,
  aoRange: 0.1, aoStrength: 0.45, cavity: [0.004, 0.02], cavityDark: 0.3,
  creaseAngle: 60, bandSlack: 0.025,
  materials: {
    skin: { name: 'JellySkin', surface: 'none', look: { rim: 0.6, wrap: 0.55, shadowTint: 1 } },
    core: { name: 'JellyCore', surface: 'none', look: {} },
    keep: { name: 'JellyKeep', surface: 'none', look: { rim: 0.2, wrap: 0.5 } },
  },
  lodNames: ['LOD0', 'LOD1', 'LOD2'],
  pieces: [
    { key: 'body', node: 'JellyBody', lods: [3700, 1300, 420], detail: ['full', 'full', 'far'], voxelMul: [1, 1, 2.2], lodError: [0.0012, 0.0035, 0.012] },
    { key: 'core', node: 'JellyCore', lods: [380, 160, 60], detail: ['full', 'full', 'far'], voxel: 0.0016, voxelMul: [1, 1, 2], lodError: [0.002, 0.004, 0.01] },
    { key: 'keep', node: 'JellyKeep', lods: [900, 260, 0], detail: ['full', 'full', 'full'], voxel: 0.0012, voxelMul: [1, 1, 1], lodError: [0.0008, 0.003, 0.01] },
  ],
  // ember eyes stay code (makeJelly 'Eye' groups): put them here; Core = where the additive core sits
  anchors: { Eye_L: [-0.13, 0.405, 0.415], Eye_R: [0.135, 0.41, 0.41], Core: [0, 0.3, -0.02] },
  notes: '影团 shade jelly: static pieces JellyBody / JellyCore / JellyKeep per LOD for makeJelly (vertex colours, no textures). See .tmp/sculpt/shade_jelly/INSTALL.md.',

  build({ S }) {
    const far = DETAIL() === 'far', piece = process.env.JP_PIECE || 'body';
    // every part is declared here, always in the same order (part ids must match across the piece builds)
    const pSkin = S.part('skin', { mat: 'skin', paint: paintSkin });
    const pDrip = S.part('drip', { mat: 'skin', paint: paintDrip });
    const pSocket = S.part('socket', { mat: 'skin', paint: (c) => S.mix(S.mix(S.color('#160b24'), S.color('#2e1a4a'), S.ss(0.0, 0.8, c.ny) * 0.5), S.color('#8a6cc0'), c.edge * 0.55) });
    const pCore = S.part('core', { mat: 'core', paint: paintCore });
    const pBone = S.part('bone', { mat: 'keep', paint: paintBone });
    const pCord = S.part('cord', { mat: 'keep', paint: (c) => S.mix(S.color('#c2452e'), S.color('#6a1e16'), c.cavity * 0.8 + 0.1) });
    const pMaple = S.part('maple', { mat: 'keep', paint: paintMaple });
    const pGinkgo = S.part('ginkgo', { mat: 'keep', paint: paintGinkgo });
    void pSkin; void pDrip; void pSocket; void pCore; void pBone; void pCord; void pMaple; void pGinkgo;
    if (piece === 'core') return core(S, far);
    if (piece === 'keep') return keep(S);
    return body(S, far);
  },

  async before() { return L.beforeJelly(); },
  async extraMeshes() { return L.jellyEyes(this.anchors); },
  async look({ R, lodM, extra, before, save, sb, sc, gs, scaleMeshes, translucent, quick }) {
    // the game draws the body translucent (alpha 0.62 facing .. 1 at the silhouette) over the core and the keepsakes
    const ts = quick ? 360 : 520;
    const tiles = [];
    const cams = [[20, 12, 'FRONT 20'], [110, 12, 'SIDE 110'], [200, 18, 'BACK 200'], [320, 40, 'ABOVE 320']];
    const d = Math.max(sb[4] - sb[1], sb[3] - sb[0]) * 2.1;
    for (const [az, el, lab] of cams) {
      const cam = R.orbit(sc, az, el, d, 35, ts, ts);
      const body = scaleMeshes([...lodM(0, (p) => p.key === 'body'), ...extra], gs), inner = scaleMeshes([...lodM(0, (p) => p.key !== 'body').map((m) => (m.piece === 'core' ? { ...m, emit: true, col: m.col.map((v) => v * 1.4) } : m)), ...extra], gs);
      tiles.push({ img: translucent(R, body, inner, cam, 0.7, { groundY: sb[1] }), label: 'AFTER ' + lab });
    }
    const bo = scaleMeshes([...before.opaque, ...before.eyes], gs), bi = scaleMeshes([...before.inner.map((m) => ({ ...m, emit: true })), ...before.eyes], gs);
    tiles.push({ img: translucent(R, bo, bi, R.orbit(sc, 20, 12, d, 35, ts, ts), 0.7, { groundY: sb[1] }), label: 'BEFORE FRONT 20' });
    const inner0 = scaleMeshes(lodM(0, (p) => p.key !== 'body'), gs);
    tiles.push({ img: R.render(inner0, R.orbit(sc, 20, 12, d * 0.6, 35, ts, ts), { groundY: sb[1] }), label: 'CORE + KEEPSAKES ALONE' });
    save('look.png', R.sheet(tiles, 3, { title: 'shade_jelly LOOK - BODY 70% OPAQUE OVER CORE / KEEPSAKES (STAND-IN FOR THE GAME SHADER)' }));
  },
};

// ------------------------------------------------------------------------------------------------------------- body
function mass(S, far) {
  // belly: low and wide, sagging forward-left over the rim
  let m = S.ellipsoid([0.5, 0.215, 0.48]).at(0.012, 0.165, 0.02);
  m = m.softAdd(S.ellipsoid([0.27, 0.15, 0.25]).at(-0.215, 0.13, 0.2), 0.09);
  // face mass: narrower than the belly, pushed forward over it
  m = m.softAdd(S.ellipsoid([0.275, 0.235, 0.27]).turn(-12, 0, 5).at(-0.005, 0.39, 0.14), 0.14);
  // fill the back so the crown rises out of a round back, not a hood
  // (rev 2) a fat, round back: one big soft mass, blended wide so no seam or flat facet forms between belly and crown
  m = m.softAdd(S.ellipsoid([0.42, 0.27, 0.34]).at(0.01, 0.27, -0.11), 0.18);
  m = m.softAdd(S.ellipsoid([0.3, 0.2, 0.26]).at(0.0, 0.4, -0.08), 0.16);
  // the crown, drawn up and back where the drop let go
  m = m.softAdd(S.softUnion(0.09, S.sphere(0.2).at(0.0, 0.44, 0.0), S.sphere(0.12).at(-0.03, 0.54, -0.04), S.sphere(0.06).scale([1, 1.3, 1]).at(-0.05, 0.605, -0.07)), 0.16);
  // the rim: a flat skirt pooled on the ground, scalloped by uneven lobes
  const lobes = [];
  const rnd = S.prng(11);
  for (let i = 0; i < 9; i++) {
    const a = i * 40 + (rnd() - 0.5) * 18, r = 0.39 + rnd() * 0.04, w = 0.1 + rnd() * 0.05;
    lobes.push(S.ellipsoid([w, 0.05 + rnd() * 0.012, 0.11]).turn(0, a, 0).at(Math.sin(a * Math.PI / 180) * r, 0.0, Math.cos(a * Math.PI / 180) * r));
  }
  const rim = S.softUnion(0.05, S.ellipsoid([0.5, 0.07, 0.49]).at(0, 0.005, 0.01), ...lobes);
  m = m.softAdd(rim, 0.075);
  // the sole: flat on the ground, sunk 4 cm like the old foot
  m = m.softIntersect(S.plane([0, -1, 0], [0, -0.045, 0]), 0.012);
  if (!far) m = m.rough({ type: 'billow', scale: 0.2, amp: 0.004, oct: 2, seed: 3 });
  return m;
}
function body(S, far) {
  let m = mass(S, far);
  const base = m;
  // brow folds over the ember eyes: the skin bunches above them
  for (const s of (far ? [] : [-1, 1])) {          // LOD2: brows folded into the body (no blades)
    const brow = S.ellipsoid([0.07, 0.022, 0.045]).turn(8, -12 * s, -16 * s).at(0.13 * s, 0.46, 0.385 - (s > 0 ? 0.005 : 0));
    m = m.softAdd(brow, 0.035);
  }
  m = m.part('skin');
  // drips: from the crown/shoulder down over the belly, each ending in a fat bead
  // (rev 2) the flank drip runs all the way down, thin, and ends in a bead sitting on the skirt; the back keeps
  // one soft drip only
  const drips = [[60, 0.5, 0.085, 0.024], [148, 0.55, 0.22, 0.024]];
  let dr = null;
  for (const [a, y0, y1, r] of drips) {
    const pts = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8, y = y0 + (y1 - y0) * t; pts.push(L.surfAt(base, a + Math.sin(t * 2.2 + a) * 4, y, r * (-0.45 + 0.15 * t))); }
    let d = S.tube(pts, (t) => r * (0.35 + 0.35 * t) * (far ? 1.4 : 1));
    const bead = L.surfAt(base, a + Math.sin(2.2 + a) * 4, y1, r * 0.15);
    d = d.softAdd(S.sphere(r * (far ? 1.7 : 1.4)).scale([1, 0.85, 1]).at(bead[0], bead[1], bead[2]), 0.02);
    dr = dr ? dr.add(d) : d;
  }
  if (!far) m = m.softAdd(dr.part('drip'), 0.06);   // LOD2: no drips (they decimate into blades)
  if (!far) {
    // compression wrinkles where the sagging belly folds onto the rim (front-left)
    for (const [a0, a1, y, r] of [[-70, -5, 0.085, 0.009], [-55, 10, 0.06, 0.007], [-95, -40, 0.11, 0.007]]) {
      const pts = [];
      for (let k = 0; k <= 6; k++) pts.push(L.surfAt(base, a0 + (a1 - a0) * k / 6, y + Math.sin(k) * 0.004, 0.002));
      m = m.softCut(S.tube(pts, r), 0.008);
    }
  }
  // sockets for the embers
  for (const [s, k] of [[-1, [-0.13, 0.405, 0.43]], [1, [0.135, 0.41, 0.425]]]) {
    m = m.softCut(S.ellipsoid([0.074, 0.052, 0.06]).turn(0, 16 * s, -14 * s).at(k[0], k[1], k[2] + 0.035).part('socket'), 0.022, { paintCut: true });
  }
  return m;
}

// ------------------------------------------------------------------------------------------------------------- core
function core(S, far) {
  if (far) return S.ellipsoid([0.15, 0.17, 0.14]).at(0, 0.3, -0.02).part('core');
  let k = S.softUnion(0.05,
    S.sphere(0.105).at(0, 0.3, -0.02),
    S.sphere(0.08).at(0.065, 0.36, -0.05),
    S.sphere(0.07).at(-0.07, 0.25, 0.025),
    S.sphere(0.055).at(0.025, 0.205, -0.08),
    S.sphere(0.045).at(-0.04, 0.405, 0.0));
  k = k.rough({ type: 'ridged', scale: 0.07, amp: 0.006, seed: 21 });
  return k.part('core');
}

// --------------------------------------------------------------------------------------------- keepsakes inside
function keep(S) {
  // a carved bone toggle on a red cord: rings cut round it, a hole through the waist
  let bone = S.taperedCapsule([-0.08, 0, 0], [0.08, 0, 0], 0.03, 0.026);
  bone = bone.softAdd(S.sphere(0.04).scale([0.7, 1, 1]).at(-0.08, 0, 0), 0.012).softAdd(S.sphere(0.036).scale([0.7, 1, 1]).at(0.08, 0, 0), 0.012);
  bone = bone.softCut(S.torus(0.03, 0.006).turn(0, 0, 90), 0.004);      // the waist the cord sits in
  bone = bone.part('bone');
  for (const x of [-0.05, 0.05, -0.064, 0.064]) bone = bone.cut(S.torus(0.033, 0.0034).turn(0, 0, 90).at(x, 0, 0));
  // cord: wrapped twice round the waist, knotted on top, two frayed tails
  const cord = S.torus(0.0265, 0.0045).turn(0, 0, 90).at(-0.003, 0, 0).add(S.torus(0.0265, 0.0045).turn(0, 0, 90).at(0.003, 0, 0))
    .add(S.sphere(0.011).at(0, 0.031, 0))
    .add(S.tube([[0, 0.031, 0], [0.026, 0.042, 0.012], [0.044, 0.03, 0.02]], [0.0045, 0.0034]))
    .add(S.tube([[0, 0.031, 0], [-0.02, 0.046, -0.01], [-0.036, 0.04, -0.024]], [0.0045, 0.0034]))
    .part('cord');
  const charm = bone.add(cord).turn(25, 35, -30).at(0.17, 0.2, 0.12);
  // a maple leaf (five pointed lobes), curled
  const mo = [];
  for (let i = 0; i <= 90; i++) {
    const th = -Math.PI * 0.82 + (i / 90) * Math.PI * 1.64;    // fan of lobes, open at the stem
    const lob = 1 - Math.pow(Math.abs(Math.sin(3.05 * th)), 0.8);   // five pointed lobes
    const r = 0.095 * (0.45 + 0.55 * lob) * (1 - 0.15 * Math.abs(th) / 2.6);
    mo.push([Math.sin(th) * r, Math.cos(th) * r]);
  }
  mo.push([0.005, -0.015], [0.004, -0.07], [-0.004, -0.07], [-0.005, -0.015]);
  let maple = S.extrude(mo, 0.0055, { round: 0.0015 }).warp((x, y, z, o) => { o[2] = 3.2 * x * x + 1.8 * y * y; }, { grow: 0.03 });
  maple = maple.part('maple').turn(-30, 25, 40).at(-0.24, 0.22, 0.04);
  // a ginkgo fan with its notch and stalk
  const go = [];
  for (let i = 0; i <= 40; i++) { const th = (-58 + i * 116 / 40) * Math.PI / 180; const notch = Math.abs(th) < 0.08 ? 0.75 : 1; go.push([Math.sin(th) * 0.082 * notch, Math.cos(th) * 0.082 * notch]); }
  go.push([0.007, 0.008], [0.004, -0.06], [-0.004, -0.06], [-0.007, 0.008]);
  let ginkgo = S.extrude(go, 0.0055, { round: 0.0015 }).warp((x, y, z, o) => { o[2] = -2.6 * x * x; }, { grow: 0.02 });
  ginkgo = ginkgo.part('ginkgo').turn(50, -40, 110).at(0.05, 0.13, -0.24);
  return charm.add(maple).add(ginkgo);
}

// ------------------------------------------------------------------------------------------------------------- paint
import * as P from '../sdf.mjs';
const C = P.color, mix = P.mix, ss = P.ss;
function paintSkin(c) {
  const { x, y, z, ny, cavity, edge } = c;
  // dark violet taint; a lighter sheen on the upward skin, darker in the belly's shade
  let col = mix(C('#2b1849'), C('#4a2f75'), ss(-0.35, 0.85, ny) * ss(0.15, 0.5, y) * 0.85);
  // (rev 2) the back is lit by the sky and the glow inside: lift it, never near-black
  col = mix(col, C('#5e4594'), ss(0.0, -0.3, z) * ss(0.08, 0.3, y) * 0.65);
  col = mix(col, C('#20122f'), ss(0.25, 0.08, y) * ss(0.3, -0.5, ny) * 0.6);
  // the core seen through the front of the skin
  const g = Math.exp(-((x * x + (y - 0.3) * (y - 0.3)) / (2 * 0.14 * 0.14))) * ss(0.1, 0.4, z);
  col = mix(col, C('#5b3b8e'), g * 0.4);
  // the rim: thick, dull skin dragged over the ground, dusted
  const rim = ss(0.11, 0.035, y);
  col = mix(col, C('#6e5d7c'), rim * 0.85);
  col = mix(col, C('#7d6d6a'), ss(0.03, -0.01, y) * 0.55 * (0.7 + 0.3 * P.fbm(x * 20, 0, z * 20, 4, 2)));
  col = mix(col, C('#1e1232'), cavity * 0.45);
  col = mix(col, C('#7356a3'), edge * 0.3 * (1 - rim));
  return col;
}
function paintDrip(c) {
  const { ny, edge, cavity } = c;
  let col = mix(C('#1c0f31'), C('#55378a'), ss(0.3, 0.95, ny) * 0.8);
  col = mix(col, C('#8c6cc6'), edge * 0.35);
  return mix(col, C('#120822'), cavity * 0.4);
}
function paintCore(c) {
  const { x, y, z, cavity } = c;
  const r = Math.hypot(x, y - 0.3, z + 0.02);
  let col = mix(C('#f4e4ff'), C('#b682f0'), ss(0.06, 0.15, r));
  return mix(col, C('#7a44c8'), cavity * 0.6);
}
function paintBone(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(C('#efe6cf'), C('#d8c8a2'), 0.5 + 0.5 * P.fbm(x * 60, y * 60, z * 60, 13, 2));
  col = mix(col, C('#fff9ea'), edge * 0.4);
  return mix(col, C('#6e5a42'), cavity * 0.8);
}
function paintMaple(c) {
  const { x, y, z, cavity } = c;
  const lx = x + 0.24, ly = y - 0.22, lz = z - 0.04;
  const r = Math.hypot(lx, ly, lz);
  let col = mix(C('#f0782f'), C('#c8302a'), ss(0.03, 0.085, r));
  return mix(col, C('#7a2416'), cavity * 0.5);
}
function paintGinkgo(c) {
  const { x, y, z, cavity } = c;
  const r = Math.hypot(x - 0.05, y - 0.13, z + 0.24);
  let col = mix(C('#f6c94a'), C('#e59a22'), ss(0.04, 0.08, r));
  return mix(col, C('#8a5a14'), cavity * 0.5);
}
