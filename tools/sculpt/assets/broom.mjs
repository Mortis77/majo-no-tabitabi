// BROOM — the heroine's flying broom (replaces prop_broom, the KayKit pack broom). Standing like the old one: long axis +Y,
// bristle tips at y = 0, handle cap at y = 1.50; broom.js fitRide lays it along +Z (model +Z = DOWN in flight, -Z = up
// toward her, +Y = forward). Seat 41 % up (y 0.615); hands at y ~0.76-1.24.
// SILHOUETTE: a long, slightly S-bent pale branch ending in a carved jewel knob, and a heavy head of twig locks that fans
//   wide and sweeps UP at the tips (toward -Z: up in flight) like a tail — a comet, not a cone.
// BIG / MEDIUM / SMALL: the shaft and the fanned head / the red-and-white cord band with its knot, the jewel cap, the
//   paper streamer / the bell, the charm slip, knots and a sawn branch stub, stray twigs, three bamboo sprigs.
// EYE RESTS ON: the binding (kohaku cord, knot, bell, zig-zag paper) and the swept-up tips; then the cap.
// WEAR: the wood is honey-polished where she grips and sits, grey-brown grime toward the binding; the twigs are darker
//   and oily under the cord, sun-bleached at the tips, dusty on the underside where she lands.
// MUST NOT LOOK LIKE: a dowel in a straw cone, a symmetric witch broom, even detail everywhere (the shaft middle is calm).
import * as P from '../sdf.mjs';
import { C, mix, ss, clamp, norm, add, yLock, strip, beforeMeshes } from './broom_lib.mjs';

const TAU = Math.PI * 2;
// ------------------------------------------------------------------------------------------------- shaft (natural branch)
const Y0 = 0.36, Y1 = 1.447;                           // shaft runs from inside the head to the cap
const sx = (y) => 0.007 * Math.sin(TAU * (y - Y0) / (Y1 - Y0)) + 0.003 * Math.sin(TAU * 2.3 * (y - Y0));   // S-curve
const sz = (y) => -0.005 * Math.sin(Math.PI * (y - Y0) / (Y1 - Y0));                                       // a bow up (in flight)
const axis = (y) => [sx(y), sz(y)];
const GRIP = [0.75, 1.3];
const rShaft = (y) => {
  let r = 0.0226 - 0.0032 * ss(Y0, Y1, y);   // ~14 % taper toward the cap                                     // thicker butt, thinner tip end
  r -= 0.0012 * ss(GRIP[0] - 0.03, GRIP[0] + 0.05, y) * ss(GRIP[1] + 0.03, GRIP[1] - 0.05, y);   // worn thinner by hands
  return r;
};
const KNOTS = [[0.695, 140, 1.0], [1.405, 300, 1.05], [1.055, 35, 1.15]];   // one low, two on the upper half (outside the grips)  // y, angle (deg about Y from +Z), size
const STUB = { y: 1.372, ang: 250 };   // above the left hand's reach (holder z 0.70 = model y 1.315)
// ------------------------------------------------------------------------------------------------- head
const NECK = [0.43, 0.505];                            // cord band
const RN = 0.039;                                      // bundle radius at the band
const CORD_R = 0.0052, TURNS = [0.4405, 0.4505, 0.4605, 0.4705, 0.4805, 0.4905];
const UPPER = [0.535, 0.5445];                         // two red turns where the bundle meets the shaft
const knot = [0.006, 0.462, RN + 0.009];               // the hanging knot on the +Z side (DOWN in flight)
const BELL = [0.012, 0.418, RN + 0.072];
const SHIDE_ROOT = [RN + 0.004, 0.487, 0.012];
const CHARM = { y: 1.345 };

// twig locks, grouped into SIX bundles (big-medium-small): each bundle three locks that leave the band side by side and
// converge toward the bundle line at the tips, with gaps between bundles; bundle angle about Y (0 = +Z), tip y, spread
const rnd = P.prng(41);
const NB = 6, BUNDLES = [], LOCKS = [];
for (let b = 0; b < NB; b++) {
  const ba = (b / NB) * TAU + 0.35 + (rnd() - 0.5) * 0.35;
  const B = { a: ba, tip: 0.006 + rnd() * 0.045 + (Math.cos(ba) > 0.5 ? 0.018 : 0), spread: 0.9 + rnd() * 0.24, tone: b };
  BUNDLES.push(B);
  for (let k = 0; k < 3; k++) {
    const off = (k - 1) * 0.3 + (rnd() - 0.5) * 0.08;
    LOCKS.push({ a: ba + off, ba, tip: B.tip + (k === 1 ? 0 : 0.012 + rnd() * 0.02), spread: B.spread * (k === 1 ? 1.03 : 0.95 + rnd() * 0.05), r: (k === 1 ? 0.0125 : 0.0098) + rnd() * 0.002, ph: rnd() * 6, b });
  }
}
// where a lock (or stray twig) sits at height y: ring at the neck, fanning out and sweeping up (-Z) to the tips; the lower
// half splays wider sideways (x) so the head still reads as a broom at game distance
function lockCentre(L, y, top = 0.53) {
  const t = clamp((top - y) / (top - L.tip), 0, 1);
  const conv = L.ba == null ? 0 : 0.72 * ss(0.25, 0.95, t);
  const a = L.a + (L.ba - L.a || 0) * conv;
  const ex = (0.031 + 0.088 * L.spread * Math.pow(t, 1.6)) * (1 + 0.13 * ss(0.4, 1, t));   // radial distance
  const ez = 0.031 + 0.052 * L.spread * Math.pow(t, 1.6);
  const pinch = 1 - 0.18 * ss(0.12, 0.0, Math.abs(t - 0.13));      // the band pulls them in
  const curl = -0.058 * Math.pow(ss(0.45, 1, t), 1.7);             // tips sweep up (toward -Z)
  return [Math.sin(a) * ex * pinch, Math.cos(a) * ez * pinch + curl];
}
/** bundle index of a point of the head (paint): nearest bundle line at that height */
function bundleAt(x, y, z) {
  let best = 0, bd = 1e9;
  for (let b = 0; b < NB; b++) { const [cx, cz] = lockCentre({ a: BUNDLES[b].a, ba: BUNDLES[b].a, tip: BUNDLES[b].tip, spread: BUNDLES[b].spread }, y); const d = Math.hypot(x - cx, z - cz); if (d < bd) { bd = d; best = b; } }
  return best;
}

export default {
  name: 'broom', id: 'sculpt_prop_broom',
  voxel: +(process.env.BROOM_VOXEL || 0.002),
  lods: [6000, 2000, 600],
  lodError: [0.0022, 0.006, 0.009],
  atlas: 1024,
  ground: 0,
  aoRange: 0.06, cavity: [0.0025, 0.012], creaseAngle: 50, bandSlack: 0.006, aoStrength: 0.5, cavityDark: 0.35,
  materials: {
    wood: { name: 'Wood', surface: 'wood', look: { detail: 0.15, bump: 0.2, fine: 0, rim: 0.25 } },
    straw: { name: 'Straw', surface: 'thatch', look: { detail: 0.1, bump: 0.2, fine: 0 } },
    cord: { name: 'Cord', surface: 'cloth', look: { detail: 0, bump: 0, fine: 0 } },
    paper: { name: 'Paper', surface: 'paper', look: { trans: 0.35, detail: 0, bump: 0, fine: 0 } },
    brass: { name: 'Brass', surface: 'metal', look: { spec: 0.55, specPower: 44, detail: 0, bump: 0, fine: 0 } },
  },
  anchors: {
    bristle_tip: [0, 0.03, -0.06], bell: BELL, streamer_root: SHIDE_ROOT, seat: [sx(0.615), 0.615, sz(0.615)],
    binding: [0, 0.468, 0], cap: [sx(Y1), 1.49, sz(Y1)], charm: [sx(CHARM.y), CHARM.y, sz(CHARM.y) + 0.03],
  },
  notes: 'Sculpted shrine-maiden broom: S-bent pale branch shaft with knots and a carved jewel cap, a fanned head of twig locks sweeping up at the tips, red-and-white cord band with hanging knot, bell, zig-zag paper streamer and a charm slip. Same length, axis and seat as prop_broom.',

  build() {
    // ---- shaft: a tube along the S-curve with knots and a sawn stub
    const pts = []; for (let i = 0; i <= 24; i++) { const y = Y0 + (Y1 + 0.004 - Y0) * i / 24; const [x, z] = axis(y); pts.push([x, y, z]); }
    let shaft = P.tube(pts, (t) => rShaft(Y0 + (Y1 - Y0) * t), { smooth: false });
    for (const [y, ang, k] of KNOTS) {
      const a = ang * Math.PI / 180, r = rShaft(y), [x, z] = axis(y);
      shaft = shaft.softAdd(P.ellipsoid([0.011 * k, 0.017 * k, 0.011 * k]).at(x + Math.sin(a) * r * 0.75, y, z + Math.cos(a) * r * 0.75), 0.008);
      shaft = shaft.cut(P.ellipsoid([0.0035 * k, 0.005 * k, 0.0035 * k]).at(x + Math.sin(a) * (r + 0.006 * k), y, z + Math.cos(a) * (r + 0.006 * k)));
    }
    {
      const a = STUB.ang * Math.PI / 180, [x, z] = axis(STUB.y), r = rShaft(STUB.y);
      const d = norm([Math.sin(a), 0.75, Math.cos(a)]);
      const stub = P.taperedCapsule([x, STUB.y - 0.012, z], add([x, STUB.y, z], d, r + 0.014), 0.0085, 0.0075)
        .cut(P.plane(d.map((v) => -v), add([x, STUB.y, z], d, r + 0.011)));   // saw off beyond the plane
      shaft = shaft.softAdd(stub, 0.006);
    }
    // the bark peeled, a natural branch: a little low-frequency unevenness, a few long shaving facets low down
    shaft = shaft.rough({ type: 'fbm', scale: 0.09, amp: 0.0007, seed: 3 })
      .chisel({ count: 7, depth: 0.0011, radius: 0.03, seed: 9, where: (x, y) => y > 0.56 && y < 0.72 || (y > 1.29 && y < 1.4) });
    shaft = shaft.part('shaft', { mat: 'wood', paint: paintShaft });
    // ---- the cap: a carved jewel knob on a collar (red lacquer ring), four shallow petal grooves
    const [cx, cz] = axis(Y1);
    let cap = P.lathe([[0.0168, 0], [0.0185, 0.004], [0.0215, 0.006], [0.0215, 0.012], [0.0165, 0.015], [0.016, 0.019], [0.024, 0.027], [0.0262, 0.033], [0.022, 0.042], [0.012, 0.049], [0.0032, 0.0535], [0, 0.054]], { smooth: 0.0015 });
    for (let k = 0; k < 4; k++) cap = cap.cut(P.boxFromTo([-0.0013, 0.021, 0.02, 0.0013, 0.05, 0.034]).turn(-8, 45 + k * 90, 0));
    cap = cap.at(cx, Y1 - 0.004, cz).part('cap', { mat: 'wood', paint: paintCap });
    // ---- head: a solid core under the band (no light through the bundle), twelve fluted locks, stray twigs, sprigs
    const core = P.lathe([[0, 0.335], [0.026, 0.345], [0.034, 0.39], [RN - 0.003, 0.44], [RN - 0.004, 0.5], [0.03, 0.535], [0.022, 0.552], [0, 0.556]], { smooth: 0.004 })
      .part('core', { mat: 'straw', paint: paintStraw });
    const locks = LOCKS.map((L, i) => yLock({
      centre: (y) => lockCentre(L, y), y0: L.tip, y1: 0.535,
      radius: (y) => { const t = clamp((0.535 - y) / (0.535 - L.tip), 0, 1); return L.r * (0.85 + 0.55 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62)) * (1 - 0.72 * ss(0.68, 1, t)); },
      asp: 1.75, flutes: 5, flute: (y) => 0.16 + 0.14 * ss(0.4, 0.15, y), phase: L.ph,
    }));
    const twigs = [];
    const r2 = P.prng(77);
    for (let i = 0; i < 9; i++) {
      const L = { a: r2() * TAU, tip: 0.002 + r2() * 0.07, spread: 1.0 + r2() * 0.16 };
      const ys = [0.5, 0.38, 0.26, 0.16, 0.08, L.tip + 0.012, L.tip];
      const wob = (r2() - 0.5) * 0.02;
      const tp = ys.map((y, k) => { const [x, z] = lockCentre(L, y); const out = 1 + 0.07 * ss(0.3, 0.0, y); return [x * out + (k > 3 ? wob : 0), Math.max(y, 0.004), z * out - (k > 4 ? 0.012 : 0)]; });
      twigs.push(P.tube(tp, [0.0036, 0.0025], { smooth: false }));
    }
    // three bamboo sprigs: thin stems out of the -Z / side of the head, small dried leaves near their ends
    const sprigs = [], leaves = [];
    for (const [a, len, tipY] of [[200, 1.0, 0.07], [128, 0.9, 0.11], [262, 0.85, 0.12]]) {
      const ar = a * Math.PI / 180, L = { a: ar, tip: tipY, spread: 1.08 };
      const sp = [0.44, 0.3, 0.2, tipY + 0.02].map((y) => { const [x, z] = lockCentre(L, y); return [x * 1.06, y, z * 1.06]; });
      sprigs.push(P.tube(sp, [0.0034, 0.0026], { smooth: false }));
      const lr = P.prng(Math.round(a));
      for (let k = 0; k < 3; k++) {
        const base = sp[Math.min(3, 2 + (k > 0 ? 1 : 0))], dir = norm([Math.sin(ar) * 0.6 + (lr() - 0.5) * 0.8, -0.85, Math.cos(ar) * 0.6 - 0.35 + (lr() - 0.5) * 0.6]);
        const c = add(base, dir, 0.034);
        const lf = P.ellipsoid([0.0068, 0.04 * len, 0.0026]).turn(0, (lr() - 0.5) * 70, 0).aim(dir).at(c[0], c[1], c[2]);
        leaves.push(lf);
      }
    }
    const strayAll = bunion([...twigs, ...sprigs]).part('twigs', { mat: 'straw', paint: paintTwig });
    const leafAll = bunion(leaves).part('leaves', { mat: 'straw', paint: paintLeaf });
    const lockAll = bunion(locks).part('locks', { mat: 'straw', paint: paintStraw });
    let head = core.add(lockAll).add(strayAll).add(leafAll);
    // ---- cord: six turns (kohaku twist painted on), two upper turns, a knot with two tails, the bell's string
    const rings = [...TURNS.map((y) => P.torus(RN + 0.0005, CORD_R).at(0, y, 0)), ...UPPER.map((y) => P.torus(0.0285 + (y - UPPER[0]) * -0.6, CORD_R * 0.9).at(0, y, 0))];
    let cord = bunion(rings);
    cord = cord.add(P.ellipsoid([0.013, 0.012, 0.0095]).at(knot[0], knot[1], knot[2]))
      .add(P.ellipsoid([0.0085, 0.0075, 0.007]).turn(0, 0, 40).at(knot[0] - 0.011, knot[1] + 0.003, knot[2] - 0.001))
      .add(P.ellipsoid([0.0085, 0.0075, 0.007]).turn(0, 0, -40).at(knot[0] + 0.012, knot[1] + 0.002, knot[2] - 0.001));
    const tailA = [add(knot, [-0.004, -0.004, 0.006]), add(knot, [-0.01, -0.02, 0.035]), add(knot, [-0.014, -0.038, 0.072]), add(knot, [-0.012, -0.05, 0.1])];
    const tailB = [add(knot, [0.004, -0.004, 0.006]), add(knot, [0.009, -0.016, 0.03]), add(knot, [0.01, -0.03, 0.05]), add(BELL, [0, 0.011, -0.012])];
    cord = cord.add(P.tube(tailA, [0.0042, 0.0038])).add(P.tube(tailB, 0.0032))
      .add(P.taperedCapsule(add(knot, [-0.012, -0.05, 0.1]), add(knot, [-0.011, -0.058, 0.118]), 0.0058, 0.0072));   // tassel
    // charm slip cord: a loop round the shaft and a short string
    const [hx, hz] = axis(CHARM.y), hr = rShaft(CHARM.y);
    cord = cord.add(P.torus(hr + 0.0018, 0.0033).at(hx, CHARM.y, hz))
      .add(P.torus(hr + 0.0018, 0.0033).at(hx, CHARM.y + 0.0085, hz))
      .add(P.tube([[hx + 0.002, CHARM.y - 0.002, hz + hr + 0.002], [hx + 0.003, CHARM.y - 0.006, hz + hr + 0.016], [hx + 0.002, CHARM.y - 0.009, hz + hr + 0.03]], 0.0026));
    cord = cord.part('cord', { mat: 'cord', paint: paintCord });
    // ---- bell: a small round bell with a slit and a top loop
    let bell = P.sphere(0.0135).scale([1, 0.92, 1]).at(BELL[0], BELL[1], BELL[2])
      .add(P.torus(0.004, 0.0016).turn(90, 0, 0).at(BELL[0], BELL[1] + 0.0145, BELL[2]).turn(0, 0, 0))
      .add(P.torus(0.0128, 0.0013).at(BELL[0], BELL[1] - 0.001, BELL[2]));
    bell = bell.cut(P.boxFromTo([-0.0018, -0.02, -0.006, 0.0018, -0.004, 0.02]).at(BELL[0], BELL[1], BELL[2] + 0.004))
      .cut(P.sphere(0.0032).at(BELL[0], BELL[1] - 0.012, BELL[2] + 0.006));
    bell = bell.part('bell', { mat: 'brass', paint: paintBrass });
    // ---- shide: a zig-zag paper streamer, four panels stepping out and back, hanging DOWN in flight (+Z), trailing (-Y)
    const D = norm([0, -0.32, 1]);              // down in flight, drifting back
    const W = [1, 0, 0];                        // the paper faces +-Y (face-on from behind the rider)
    const pan = [], STEP = [[0.0, 0.046], [0.016, 0.044], [0.0, 0.042], [0.016, 0.04]];
    let A = SHIDE_ROOT.slice();
    for (let k = 0; k < 4; k++) {
      const [off, h] = STEP[k];
      const top = add(add(A, W, off), [0, (k % 2 ? -1 : 1) * 0.0022, 0]);
      const bot = add(top, D, h);
      pan.push(strip(top, bot, W, 0.025, 0.0032));
      A = add(A, D, h - 0.008);
    }
    // the root fold over the cord
    pan.push(strip(add(SHIDE_ROOT, [-0.012, 0.008, -0.01]), add(SHIDE_ROOT, [0.0, 0.0, 0.004]), [0, 1, 0], 0.025, 0.0032).at(0, 0, 0));
    const shide = bunion(pan).part('shide', { mat: 'paper', paint: paintPaper });
    // ---- charm slip: a white slip with a red seal, hanging from its string
    const ct = [hx + 0.002, CHARM.y - 0.006, hz + hr + 0.028], cb = add(ct, norm([0, -0.12, 1]), 0.072);
    const charm = strip(ct, cb, [1, 0, 0], 0.03, 0.0042).part('charm', { mat: 'paper', paint: paintCharm });

    return shaft.add(cap).add(head).add(cord).add(bell).add(shide).add(charm);
  },

  async before() { return { meshes: await beforeMeshes('assets/models/props/prop_broom.glb', 0.60388) }; },
};

/** balanced union (box culling stays effective with many small pieces) */
function bunion(list) {
  if (list.length === 1) return list[0];
  const m = list.length >> 1;
  return P.union(bunion(list.slice(0, m)), bunion(list.slice(m)));
}

// ------------------------------------------------------------------------------------------------- paint
function paintShaft(c) {
  const { x, y, z, cavity, edge } = c;
  const [ax, az] = axis(y), ang = Math.atan2(x - ax, z - az);
  // hand-worn wood one value step below the straw (honey-brown, not a pale stick), long grain along the branch
  const g = 0.5 + 0.5 * Math.sin(ang * 3 + y * 9 + 2.2 * P.fbm(x * 30, y * 3, z * 30, 2, 2));
  let col = mix(C('#b8946a'), C('#a07c56'), g * 0.7);
  col = mix(col, C('#987252'), 0.25 * ss(0.3, 0.8, P.fbm(x * 60, y * 6, z * 60, 5, 2) + 0.5));
  // grime toward the binding
  col = mix(col, C('#86684a'), ss(0.66, 0.46, y) * 0.55);
  // two hand-polished grip bands (darker, oiled by palms), and the seat rub, a little lighter at the band edges
  const band = (y0, y1) => ss(y0 - 0.012, y0 + 0.012, y) * ss(y1 + 0.012, y1 - 0.012, y);
  const grip = Math.max(band(0.78, 0.95), band(1.15, 1.31));
  col = mix(col, mix(C('#6a4428'), C('#7e5434'), 0.5 + 0.5 * Math.sin(ang * 2 + y * 40)), grip * 0.85);
  const seat = ss(0.57, 0.6, y) * ss(0.67, 0.64, y);
  col = mix(col, C('#8c6440'), seat * 0.45);
  // knots: dark end-grain rings
  for (const [ky, , k] of KNOTS) { const d = Math.abs(y - ky); if (d < 0.022 * k) col = mix(col, C('#6a4a30'), (1 - d / (0.022 * k)) * Math.min(1, cavity * 3 + 0.25)); }
  col = mix(col, C('#d8bb8e'), edge * 0.35 * (1 - grip * 0.5));
  return mix(col, C('#4a3220'), cavity * 0.5);
}
function paintCap(c) {
  const { y, cavity, edge } = c;
  const v = y - (Y1 - 0.004);
  let col = mix(C('#d6b88c'), C('#e8cf9e'), ss(0.02, 0.05, v));
  if (v > 0.0045 && v < 0.0135) col = mix(C('#c8432c'), C('#a8321f'), cavity * 2);   // red lacquer collar
  col = mix(col, C('#f4e2bc'), edge * 0.45);
  return mix(col, C('#6a4a30'), cavity * 0.55);
}
// AO / cavity are multiplied in after paint (bake.mjs): undo most of it on the outer stalks so the tips stay straw-gold
function liftAO(col, c, k) {
  const m = (1 - 0.5 * (1 - c.ao)) * (1 - 0.35 * c.cavity);
  const f = 1 + (1 / Math.max(0.35, m) - 1) * k;
  return col.map((v) => Math.min(1.2, v * f));
}
const BTONE = ['#e6b064', '#d8a056', '#ecb96e', '#d49c58', '#e2aa60', '#eebf78'];   // warm gold (the sky fill turns lemon tones olive)
function paintStraw(c) {
  const { x, y, z, cavity, edge, nz } = c;
  const b = y < 0.43 ? bundleAt(x, y, z) : 0;
  const fib = 0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 37 + 3 * P.fbm(x * 40, y * 4, z * 40, 7, 2));
  let col = mix(C(BTONE[b]), C('#c49052'), fib * 0.3);                  // each bundle its own straw
  col = mix(col, C('#f4c482'), ss(0.24, 0.03, y) * 0.6);                 // sun-bleached gold tips
  col = mix(col, C('#a8804c'), ss(0.36, 0.5, y) * 0.45);                 // darker, oily toward the band
  // the inner core of the head (deep in the bundle, near the band) is the only dark part
  const core = ss(0.6, 0.2, c.ao) * ss(0.2, 0.36, y);
  col = mix(col, C('#7e5e36'), core * 0.5);
  col = mix(col, C('#b8aa90'), ss(0.08, 0.0, y) * ss(-0.1, 0.5, nz) * 0.3);   // dust on the underside tips (landings)
  col = mix(col, C('#f6e2aa'), edge * 0.3);
  col = mix(col, C('#7a5c38'), cavity * 0.25 * ss(0.15, 0.35, y));
  return liftAO(col, c, 0.8 * ss(0.36, 0.16, y));
}
function paintTwig(c) {
  const { y, edge, cavity, x, z } = c;
  let col = mix(C('#cc9a62'), C('#b88656'), 0.5 + 0.5 * P.fbm(x * 50, y * 20, z * 50, 3, 2));   // a little redder than the straw
  col = mix(col, C('#eab878'), ss(0.2, 0.02, y) * 0.6);
  col = mix(col, C('#ecd09a'), edge * 0.3);
  col = mix(col, C('#6a4a2a'), cavity * 0.3);
  return liftAO(col, c, 0.75 * ss(0.36, 0.16, y));
}
function paintLeaf(c) {
  const { x, y, z, edge } = c;
  let col = mix(C('#a7a65a'), C('#c4b46a'), 0.5 + 0.5 * P.fbm(x * 40, y * 40, z * 40, 9, 2));   // dried bamboo leaf
  return mix(col, C('#dccf90'), edge * 0.35);
}
function paintCord(c) {
  const { x, y, z, cavity, edge } = c;
  // twisted two-ply kohaku cord: the stripe follows a helix round each turn
  let ph;
  const rho = Math.hypot(x, z);
  if (y > 0.43 && y < 0.55 && rho > 0.022 && rho < 0.05 && Math.abs(z - knot[2]) > 0.02) {
    const all = [...TURNS, ...UPPER]; let yc = all[0]; for (const t of all) if (Math.abs(y - t) < Math.abs(y - yc)) yc = t;
    const R = yc > 0.52 ? 0.0285 : RN;
    ph = 2 * Math.atan2(y - yc, rho - R) + 12 * Math.atan2(x, z);
  } else ph = (x + y * 0.7 + z) * 520;
  const red = Math.sin(ph) > 0;
  let col = red ? C('#d8402c') : C('#f4eee2');
  if (y > 1.0) col = C('#d03a28');                                        // charm string: plain red
  col = mix(col, red ? C('#f06a4c') : C('#ffffff'), edge * 0.3);
  return mix(col, red ? C('#6a1a12') : C('#8a8478'), cavity * 0.6);
}
function paintBrass(c) {
  const { edge, cavity, ny } = c;
  let col = mix(C('#c8963a'), C('#e8c06a'), ss(-0.2, 0.8, ny));
  col = mix(col, C('#fff0b8'), edge * 0.5);
  return mix(col, C('#5a3a14'), cavity * 0.7);
}
function paintPaper(c) {
  const { y, edge, cavity } = c;
  let col = mix([1.08, 1.06, 1.0], C('#f4ecda'), ss(0.47, 0.3, y));
  col = mix(col, C('#e2d4b0'), ss(0.33, 0.29, y) * 0.5);                 // the lowest tip yellowed
  col = mix(col, C('#ffffff'), edge * 0.2);
  return mix(col, C('#9a9284'), cavity * 0.4);
}
function paintCharm(c) {
  const { x, y, z, edge } = c;
  // local coordinates along the slip: v down from its top, u across
  const [hx, hz] = axis(CHARM.y), hr = rShaft(CHARM.y);
  const top = [hx + 0.002, CHARM.y - 0.006, hz + hr + 0.028], d = norm([0, -0.12, 1]);
  const v = (x - top[0]) * d[0] + (y - top[1]) * d[1] + (z - top[2]) * d[2], u = x - top[0];
  let col = C('#f6f0e2');
  // a vermilion seal (ring + dot) above, two calm ink strokes below (not text)
  const sr = Math.hypot(u, v - 0.02);
  if (sr < 0.0095 && sr > 0.0062 || sr < 0.003) col = C('#c8402a');
  if (Math.abs(u) < 0.0022 && v > 0.035 && v < 0.064) col = C('#3a3430');
  if (Math.abs(u - 0.007) < 0.0012 && v > 0.04 && v < 0.056) col = C('#4a4038');
  col = mix(col, C('#c8402a'), ss(0.003, 0.0, Math.abs(v - 0.0005)) * 0.6);     // red top band
  return mix(col, C('#ffffff'), edge * 0.2);
}
