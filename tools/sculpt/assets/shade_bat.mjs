// 灯喰 shade bat (shade_bat) — the night shade between bat and moth, on the mon_bat skeleton and clips.
// INTENT (revision 2)
//  1 Silhouette: a plump furred body hung under two ribbed, torn sails; a small round head under two big leaf ears
//    (1.5x the head) — the charm of a bat — with a ringed moth abdomen and short hooked feet tucked up under it.
//  2 Big forms: the two membranes (fan of four finger bones, scalloped trailing edge) / the body with its bone-pale ruff
//    (the one colour accent) / the head with its ears.
//  3 The eye rests on: two big round eyes set low and wide, each with a hard white highlight; the pale ruff framing the
//    head; the moth eye-spot on each wing.
//  4 Story: an old shade that has fought lamps — two tears, a notch and a hole in the membranes, a ragged fringe.
//  5 Must not be: the pack bat (cube body, yellow bib, boxy wings), gaunt and antenna-headed, symmetric-perfect, noisy.
//
// Bind pose of assets/models/refined/mon_bat.glb, metres, +Z front, centre line x = -0.0215.
//   SCULPT_THREADS=2 node tools/sculpt/build.mjs tools/sculpt/assets/shade_bat.mjs      (SCULPT_Q=1 thickens sheets for --quick)
//   node tools/sculpt/assets/shade_bat.mjs post     -> split per game material (Main / Wing / Belly / Eyes), sheets from the GLB
import * as L from './batgolem_lib.mjs';
const { V } = L;
const CX = -0.0215;
const TH = process.env.SCULPT_Q ? 1.45 : 1;          // quick builds use a 1.6x voxel: thicker membranes so they do not tear

// ---------------------------------------------------------------------------------------------- wing geometry (L side)
const SH = [0.043, 0.492, 0.153], EL = [0.115, 0.644, 0.043], WR = [0.173, 0.744, -0.065], KN = [0.213, 0.747, -0.233];
const D4 = V.norm([0.305, -0.413, -0.858]);
const F1 = [WR, KN, V.add(KN, V.mul(D4, 0.20)), V.add(KN, V.mul(D4, 0.33))];
const F2 = [WR, [0.232, 0.668, -0.205], [0.278, 0.575, -0.36], [0.300, 0.505, -0.455]];
const F3 = [WR, [0.214, 0.620, -0.140], [0.240, 0.520, -0.250], [0.252, 0.452, -0.300]];
const F4 = [WR, [0.188, 0.590, -0.060], [0.196, 0.500, -0.100], [0.198, 0.450, -0.115]];
const B4 = [WR, EL, [0.082, 0.585, 0.128], [0.070, 0.545, 0.140]];
const NRM = (() => { const n = V.norm(V.cross(V.sub(F1[3], WR), V.sub(F4[3], WR))); return n[0] < 0 ? V.mul(n, -1) : n; })();
const hM = (u) => (0.0062 - 0.0010 * u) * TH;
const PATCHES = [
  { A: F1, B: F2, nu: 9, nv: 5, sag: -0.018, n: NRM, scallop: 0.16, h: hM },
  { A: F2, B: F3, nu: 9, nv: 4, sag: -0.014, n: NRM, scallop: 0.17, h: hM },
  { A: F3, B: F4, nu: 8, nv: 4, sag: -0.010, n: NRM, scallop: 0.15, h: hM },
  { A: F4, B: B4, nu: 8, nv: 5, sag: -0.012, n: NRM, scallop: 0.10, h: hM },
];
let SHEET = null;
const sheetL = () => (SHEET ||= L.sheet(PATCHES));
const FINGERS = [F1, F2, F3, F4, [SH, EL, WR]];
// trailing edge (for the paler fringe) and the eye-spot centre
const EDGE = []; for (let i = 0; i < PATCHES.length; i++) for (let j = 0; j <= 12; j++) EDGE.push(null);
const SPOT = { c: null, r: 0.052 };
const EYE = [CX + 0.057, 0.8, 0.382], SHINE = V.norm([-0.25, 0.45, 0.86]);
const EAR0 = [CX + 0.045, 0.845, 0.31], EAR1 = [CX + 0.045 + 0.105, 0.845 + 0.18, 0.29], EARF = [0.35, 0, 1];
const sideP = (c) => [CX + Math.abs(c.x - CX), c.y, c.z];

const MAT = { body: 'Main', head: 'Main', snout: 'Main', ear: 'Main', arm: 'Main', finger: 'Main', claw: 'Main', leg: 'Main', foot: 'Main', thumb: 'Main', brow: 'Main', fang: 'Main',
  membrane: 'Wing', ruff: 'Belly', abdomen: 'Belly', eye: 'Eyes', shine: 'EyePupilShine' };

export default {
  name: 'shade_bat', id: 'sculpt_mon_bat',
  rig: { file: 'assets/models/refined/mon_bat.glb' },
  rigCredit: 'Quaternius, CC0 (skeleton + clips)',
  voxel: 0.0034,
  lods: [9000],
  ground: null,
  aoRange: 0.05, cavityDark: 0.3, cavity: [0.003, 0.012], creaseAngle: 70, bandSlack: 0.012,
  weights: { smooth: 3, smoothAlpha: 0.5 },
  poses: [['BatArmature|Bat_Flying', 0.0], ['BatArmature|Bat_Flying', 0.21], ['BatArmature|Bat_Flying', 0.42], ['BatArmature|Bat_Attack', 0.29], ['BatArmature|Bat_Attack', 0.58], ['BatArmature|Bat_Death', 1.2]],
  notes: 'Sculpted moth-bat shade on the mon_bat skeleton (joints, IBMs, clips unchanged). Vertex colours, no texture. Materials Main / Wing / Belly / Eyes (post step).',

  build({ S, rig }) {
    void rig;
    const P = (o) => S.part(o.name, o);
    // ---------------------------------------------------------------------- thorax, abdomen, ruff
    const bodyDir = [0, 0.236, 0.075];
    let thorax = S.ellipsoid([0.12, 0.15, 0.112]).aim(bodyDir).at(CX, 0.545, 0.215);
    thorax = thorax.softAdd(S.ellipsoid([0.095, 0.08, 0.08]).at(CX, 0.50, 0.27), 0.04);            // chest
    thorax = thorax.softAdd(S.ellipsoid([0.075, 0.08, 0.06]).at(CX, 0.62, 0.17), 0.04);             // shoulders hump
    // fur as form: a few big locks on the back of the thorax (lying down and back)
    const locks = [];
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.038, y = 0.64 - Math.abs(i - 2) * 0.02;
      locks.push(S.taperedCapsule([CX + x, y, 0.16], [CX + x * 1.25, y - 0.12, 0.115], 0.03, 0.008));
    }
    thorax = thorax.softAdd(S.union(...locks), 0.02).rough({ type: 'cells', scale: 0.03, amp: 0.0015, seed: 4 });
    const body = thorax.part('body', { mat: 'body', paint: paintBody });

    let abd = S.taperedCapsule([CX, 0.45, 0.175], [CX, 0.255, 0.075], 0.07, 0.016)
      .softAdd(S.ellipsoid([0.06, 0.06, 0.055]).at(CX, 0.4, 0.165), 0.03)
      .strata({ spacing: 0.032, depth: 0.0045, width: 0.009, wobble: 0.004, axis: 'y', seed: 6 });
    const abdomen = abd.part('abdomen', { mat: 'abdomen', paint: paintAbdomen, blend: { from: 'BodyRoot', to: 'Body', width: 0.09 } });

    const tufts = [], rnd = S.prng(11);
    const NC = [CX, 0.695, 0.255];
    for (let i = 0; i < 17; i++) {
      const a = (i / 17) * Math.PI * 2 + (rnd() - 0.5) * 0.2;           // 0 = front
      const front = Math.max(0, Math.cos(a));
      const rad = [Math.sin(a), 0, Math.cos(a)];
      const len = (0.06 + rnd() * 0.03) * (1 - 0.55 * front);
      const base = V.add(NC, V.mul(rad, 0.055));
      const tip = V.add(base, V.add(V.mul(rad, len), [0, -0.045 - len * 0.4 - 0.02 * front, 0]));
      tufts.push(S.taperedCapsule(base, tip, 0.03, 0.006));
    }
    const ruff = S.softUnion(0.012, ...tufts).part('ruff', { mat: 'ruff', paint: paintRuff });

    // ---------------------------------------------------------------------- head
    let head = S.sphere(0.074).scale([1.0, 0.9, 1.06]).at(CX, 0.80, 0.33);
    head = head.softAdd(S.ellipsoid([0.05, 0.04, 0.045]).at(CX, 0.77, 0.37), 0.03);                // jaw
    head = head.part('head', { mat: 'head', paint: paintHead });
    const snout = S.taperedCapsule([CX, 0.79, 0.385], [CX, 0.772, 0.462], 0.036, 0.019)
      .part('snout', { mat: 'snout', paint: paintHead, bone: 'Face' });
    // nose-leaf: a small upright spade on the snout tip
    const leafO = [[-0.016, 0], [0.016, 0], [0.012, 0.018], [0, 0.04], [-0.012, 0.018]];
    const noseleaf = L.frame(S.extrude(leafO, 0.012, { round: 0.004 }), [CX, 0.785, 0.462], [CX, 0.83, 0.45], [0, 0, 1])
      .part('snout', { mat: 'snout' });
    const fang = S.taperedCapsule([CX + 0.016, 0.768, 0.446], [CX + 0.018, 0.736, 0.452], 0.0075, 0.0035);
    const fangs = L.mirrorAbout(fang, CX).part('fang', { mat: 'fang', paint: () => S.color('#e9e1ee'), bone: 'Face' });
    const brow = L.mirrorAbout(S.ellipsoid([0.026, 0.009, 0.022]).turn(0, 0, -14).at(CX + 0.062, 0.842, 0.372), CX)
      .part('brow', { mat: 'brow', paint: paintHead, bone: 'Face' });
    const eyes = L.mirrorAbout(S.ellipsoid([0.034, 0.035, 0.026]).turn(0, 30, 0).at(...EYE), CX)
      .part('eye', { mat: 'eye', paint: paintEye, bone: 'Face' });
    // a hard white highlight on each eye, the same upper-left spot on both (not mirrored)
    const shine = S.union(...[EYE, [2 * CX - EYE[0], EYE[1], EYE[2]]].map((e) => S.sphere(0.0095).at(...V.add(e, V.mul(V.norm(V.add(V.norm([e[0] < CX ? -0.3 : 0.3, -0.05, 1]), [-0.3, 0.55, 0])), 0.028)))))
      .part('shine', { mat: 'eye', paint: () => S.color('#ffffff'), bone: 'Face' });
    // ears: big broad leaf ears (~0.2 m, 1.5x the head), splayed out a little, a shallow cup facing front-out
    const earO = [[-0.055, 0], [0.05, 0], [0.066, 0.05], [0.062, 0.1], [0.04, 0.155], [0.012, 0.2], [-0.004, 0.215], [-0.022, 0.18], [-0.05, 0.12], [-0.064, 0.06]];
    let ear = S.extrude(earO, 0.024 * Math.min(TH, 1.2), { round: 0.009 });
    ear = ear.cut(S.ellipsoid([0.042, 0.085, 0.014]).at(0.002, 0.095, 0.017));
    const earL = L.frame(ear, EAR0, EAR1, EARF);
    const ears = L.mirrorAbout(earL, CX).part('ear', { mat: 'ear', paint: paintEar, bone: 'Face' });

    // ---------------------------------------------------------------------- legs and hooked feet
    const thigh = S.taperedCapsule([0.112, 0.37, 0.165], [0.116, 0.305, 0.177], 0.032, 0.024);
    const claws = [];
    const p0 = [0.112, 0.29, 0.18];
    for (const dx of [-0.02, 0, 0.018]) {
      claws.push(S.tube([p0, [0.112 + dx, 0.268, 0.2], [0.112 + dx * 1.3, 0.245, 0.205], [0.112 + dx * 1.25, 0.236, 0.19], [0.112 + dx * 1.15, 0.242, 0.178]], [0.011, 0.0045]));
    }
    const legL = thigh.part('leg', { mat: 'leg', paint: paintLeg, blend: { from: 'BodyRoot', to: 'UpperLeg.{side}', width: 0.05 } }).softAdd(S.union(...claws).part('foot', { mat: 'foot', paint: paintClaw, bone: 'LowerLeg.{side}' }), 0.01);
    const legs = L.mirrorAbout(legL, CX);

    // ---------------------------------------------------------------------- wings
    const arm = S.tube([V.add(SH, [-0.02, 0, 0]), SH, EL, WR], (t) => 0.026 - 0.011 * t);
    let fingers = S.union(...[F1, F2, F3, F4].map((F, i) => {
      const ext = V.add(F[3], V.mul(V.norm(V.sub(F[3], F[2])), 0.026));             // a hooked tip past the edge
      return S.tube([...F, ext], (t) => (0.0125 - 0.0065 * t) * (i === 0 ? 1.1 : 1) * Math.min(TH, 1.25));
    }));
    const knuckle = S.sphere(0.02).at(...WR);
    const thumb = S.tube([WR, V.add(WR, [0.008, 0.028, 0.03]), V.add(WR, [0.004, 0.022, 0.06]), V.add(WR, [-0.004, 0.006, 0.07])], [0.011, 0.004])
      .part('thumb', { mat: 'thumb', paint: paintClaw });
    const bones = arm.add(knuckle).part('arm', { mat: 'arm', paint: paintFinger }).add(fingers.part('finger', { mat: 'finger', paint: paintFinger })).add(thumb);
    const sh = sheetL();
    let membrane = sh.shape.part('membrane', { mat: 'membrane', paint: paintMembrane });
    // tears: a ragged notch in the outer panel, a slit in the third panel, a small hole in the second
    const cutN = NRM;
    membrane = membrane.cut(L.crackSlots([sh.at(0, 1.08, 0.46), sh.at(0, 0.9, 0.52), sh.at(0, 0.8, 0.47)], cutN, 0.012, 0.004, 0.05));
    membrane = membrane.cut(L.crackSlots([sh.at(2, 1.1, 0.55), sh.at(2, 0.93, 0.5), sh.at(2, 0.86, 0.56)], cutN, 0.01, 0.0035, 0.05));
    membrane = membrane.cut(S.ellipsoid([0.013, 0.02, 0.05]).at(...sh.at(1, 0.66, 0.6)));
    const wingL = membrane.softAdd(bones, 0.012);
    const wings = L.mirrorAbout(wingL, CX);

    // ---------------------------------------------------------------------- whole
    let bat = body.softAdd(abdomen, 0.03).softAdd(ruff, 0.02);
    bat = bat.softAdd(head, 0.035).softAdd(snout, 0.015).add(noseleaf).softAdd(brow, 0.012).softAdd(eyes, 0.004).softAdd(fangs, 0.004);
    bat = bat.softAdd(ears, 0.02).add(shine);
    bat = bat.softAdd(legs, 0.014).softAdd(wings, 0.02);
    return bat;
  },
};

// ------------------------------------------------------------------------------------------------------------- paint
import * as Q from '../sdf.mjs';
const C = (h) => Q.color(h);
function paintBody(c) {
  // dusk-violet fur: darker on the back and the top, lighter toward the chest; locks catch light on their ridges
  let col = Q.mix(C('#7c6c97'), C('#5a4b74'), Q.ss(0.1, 0.5, c.ny * 0.5 - c.nz + 0.3) * 0.8);
  col = Q.mix(col, C('#9a8bb3'), Q.ss(0.2, 0.7, c.nz) * Q.ss(0.6, 0.45, c.y) * 0.5);
  col = Q.mix(col, C('#b7a9cb'), c.edge * 0.35);
  return Q.mix(col, C('#3f3354'), c.cavity * 0.5);
}
function paintAbdomen(c) {
  // ringed moth abdomen: dark bands in the grooves, pale ridges, tip darker
  let col = Q.mix(C('#a698bd'), C('#6d5e88'), Q.ss(0.38, 0.27, c.y) * 0.6);
  col = Q.mix(col, C('#4a3d62'), c.cavity * 0.9);
  return Q.mix(col, C('#d0c6de'), c.edge * 0.3);
}
function paintRuff(c) {
  // the one accent: a bone-pale ruff (two steps lighter than round 1), lilac only deep in the folds
  let col = Q.mix(C('#e2d9ea'), C('#f6f2f7'), Q.ss(0.66, 0.6, c.y) * 0.7 + c.edge * 0.3);
  return Q.mix(col, C('#9d8db5'), c.cavity * 0.55);
}
function paintHead(c) {
  let col = Q.mix(C('#6e5f8a'), C('#4f4268'), Q.ss(0.2, 0.8, c.ny) * 0.6);
  col = Q.mix(col, C('#8c7da6'), Q.ss(0.4, 0.9, c.nz) * 0.4);
  return Q.mix(col, C('#352a48'), c.cavity * 0.6);
}
function paintEar(c) {
  // fur on the back and the rim, a dark inner face (the cup) that frames the head from the front
  const nx = c.x < CX ? -c.nx : c.nx, f = V.norm(EARF);
  const inner = Q.ss(0.25, 0.6, nx * f[0] + c.nz * f[2]) * (1 - Q.ss(0.25, 0.6, c.edge));
  let col = Q.mix(C('#6e5f8a'), C('#8a7ba5'), c.edge * 0.5);
  col = Q.mix(col, C('#2c2140'), inner * 0.85);
  return Q.mix(col, C('#2e2440'), c.cavity * 0.4);
}
function paintEye(c) {
  // a big round dark pupil with a glowing rim (the game glows this material as a whole; the sheet shows the drawing)
  const e = c.x < CX ? [2 * CX - EYE[0], EYE[1], EYE[2]] : EYE;
  const d = V.norm(V.sub([c.x, c.y, c.z], e)), look = V.norm([c.x < CX ? -0.3 : 0.3, -0.05, 1]);
  const k = V.dot(d, look);
  return Q.mix(Q.mix(C('#f2c8f7'), C('#c58ad8'), Q.ss(0.0, 0.3, k)), C('#24122f'), Q.ss(0.42, 0.52, k));
}
function paintLeg(c) { return Q.mix(C('#5b4d75'), C('#3a2f4e'), c.cavity * 0.5 + Q.ss(0.3, 0.2, c.y) * 0.4); }
function paintClaw(c) { return Q.mix(C('#3a3046'), C('#8d8199'), c.edge * 0.6); }
function paintFinger(c) { return Q.mix(Q.mix(C('#4a3d63'), C('#6e5f89'), c.edge * 0.6), C('#2c2340'), c.cavity * 0.4); }
function paintMembrane(c) {
  const p = sideP(c);
  // base: dusky lilac, darker close to the bones (veins), paler toward the ragged fringe
  let dB = 1e9; for (const F of FINGERS) dB = Math.min(dB, L.polyDist(F, p));
  if (!SPOT.c) SPOT.c = sheetL().at(1, 0.62, 0.15);
  let dE = 1e9; if (!EDGE[0]) { let k = 0; for (let i = 0; i < PATCHES.length; i++) for (let j = 0; j <= 12; j++) EDGE[k++] = sheetL().at(i, 1, j / 12); }
  for (let k = 0; k < EDGE.length - 1; k++) dE = Math.min(dE, L.polyDist([EDGE[k], EDGE[k + 1]], p));
  let col = Q.mix(C('#9686b2'), C('#7a6a98'), Q.ss(0.05, 0.25, V.len(V.sub(p, WR))));
  col = Q.mix(col, C('#56476f'), Q.ss(0.03, 0.008, dB) * 0.75);
  col = Q.mix(col, C('#cfc4de'), Q.ss(0.045, 0.012, dE) * 0.55);
  // the moth eye-spot: dark core, pale ring, soft halo
  const ds = V.len(V.sub(p, SPOT.c)) / SPOT.r;
  col = Q.mix(col, C('#e8dcf0'), Q.ss(1.15, 0.95, ds) * Q.ss(0.45, 0.62, ds));
  col = Q.mix(col, C('#30244a'), Q.ss(0.5, 0.38, ds));
  return col;
}

// ------------------------------------------------------------------------------------------------------- post + sheets
// run through .tmp/sculpt/shade_bat/finish.mjs <name> post|sheets (a module cannot load itself while its top-level await runs)
export async function finish(role) {
  const GLB = 'assets/models/sculpt/shade_bat.glb', DIR = '.tmp/sculpt/shade_bat';
  if (role === 'post') await L.post('tools/sculpt/assets/shade_bat.mjs', GLB, { matOf: (p) => MAT[p] || 'Main', base: 'Main', dropNodes: ['Eyes'] });
  if (role === 'post' || role === 'sheets') {
    const A = 'BatArmature|';
    // the game's 'shade' tint multiplies these (sRGB) colours, lifted x2.2 for the CPU preview's lack of rim / spirit light
    const k = 2.2, t = (h) => Q.color(h).map((v) => v * k);
    await L.sheets({ name: 'shade_bat', glb: GLB, oldGlb: 'assets/models/refined/mon_bat.glb', dir: DIR, az: 50,
      poses: [[A + 'Bat_Flying', 0], [A + 'Bat_Flying', 0.21], [A + 'Bat_Flying', 0.42], [A + 'Bat_Attack', 0.29], [A + 'Bat_Attack', 0.58], [A + 'Bat_Death', 1.2]],
      tint: { Main: t('#1f1238'), Wing: t('#2a1650'), Belly: t('#2c1a52'), Eyes: [1.6, 1.25, 0.75], EyePupilShine: [2.2, 2.0, 1.6] },
      baPose: [A + 'Bat_Flying', 0.42],
      close: [{ c: [CX, 0.82, 0.33], d: 0.75, az: 25, el: 8, label: 'HEAD 3/4' }, { c: [CX, 0.82, 0.33], d: 0.75, az: 0, el: 0, label: 'HEAD FRONT' },
        { c: [0.2, 0.62, -0.2], d: 1.2, az: 90, el: 10, label: 'WING SIDE' }, { c: [0.2, 0.62, -0.2], d: 1.2, az: 60, el: 10, label: 'WING CLAY', mode: 'clay' }] });
  }
}
