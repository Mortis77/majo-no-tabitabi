// 石守 stone golem (stone_golem) — a shrine guardian piled up from old shrine stone, on the mon_golem_big skeleton and clips.
// INTENT (revision 2)
//  1 Silhouette: a hunchback cairn. One great mossy boulder rides the shoulders and back and juts out over the head like a
//    roof; the carved face hangs low under it. Short thick stump legs, small upper arms, huge forearm boulders (the right
//    one a club of a fist). Wider at the top than at the feet, and lopsided.
//  2 Big forms: the shoulder boulder / the two forearm boulders / the stump legs. Medium: the roped chest, the face slab.
//  3 The eye rests on: the two glowing cracks under the deep brow shelf, the thick straw rope with white paper streamers,
//    the ragged moss cap on the boulder.
//  4 Story: once the stones of a mountain shrine, roped as a sacred thing; rain from above (moss only on the tops), corners
//    knocked off (brow corner, left hand), spirit light leaking through cracks.
//  5 Must not be: the pack golem (orange boxes, pink nose, equal blocks), bevelled cubes, symmetric, a dark grey blob.
//
// Bind pose of assets/models/refined/mon_golem_big.glb (T pose, arms along x at y 2.80), metres, +Z front. Every limb of
// this skeleton is a single rigid bone, so every piece is pinned to one bone and pieces of different bones keep a gap of
// >= 5 cm in the bind pose (each moves as its own closed stone; no stretched skin across a joint).
//   SCULPT_THREADS=2 node tools/sculpt/build.mjs tools/sculpt/assets/stone_golem.mjs [--quick]
//   node .tmp/sculpt/shade_bat/finish.mjs stone_golem post   -> materials Stone / Eyes, TEXCOORD_0.x = glow mask, sheets
import * as L from './batgolem_lib.mjs';
import * as Q from '../sdf.mjs';
const { V } = L;
const QK = !!process.env.SCULPT_Q;
const C = (h) => Q.color(h);
const A = 'EnemyArmature|EnemyArmature|EnemyArmature|';

// ------------------------------------------------------------------------------------------------------------- paint
// granite tones, lifted ~15 % from round 1 so the back keeps its form under the game's stone tint
const STONES = ['#c0b6a8', '#b6b0ac', '#c4b8a6', '#b0a9a2', '#bbb2a9', '#c9bdad', '#aea8a2', '#beb3a1'];
// moss patches (centre, radius): only on the up-facing tops of the shoulder boulder and the head
const MOSS = [[-0.22, 3.66, -0.38, 0.5], [0.42, 3.55, -0.85, 0.34], [0.14, 3.15, 0.8, 0.14], [-0.62, 3.5, -0.2, 0.14], [-2.3, 3.16, -0.38, 0.12]];
const mossMask = (x, y, z, ny) => {
  let m = 0;
  for (const [cx, cy, cz, r] of MOSS) { const d = Math.hypot(x - cx, y - cy, z - cz) / r; m = Math.max(m, Q.ss(1.25, 0.8, d + 0.35 * Q.fbm(x * 6, y * 6, z * 6, 31, 2))); }
  return m * Q.ss(0.35, 0.7, ny);
};
function stonePaint(tone) {
  const base = C(STONES[tone % STONES.length]);
  return (c) => {
    const x = c.x, y = c.y, z = c.z;
    // calm faces, a faint large mottle, paler worn edges, dark in the joints
    let col = Q.mul(base, 0.95 + 0.1 * Q.fbm(x * 2.2, y * 2.2, z * 2.2, 3 + tone, 2));
    col = Q.mix(col, C('#e4ddd2'), c.edge * 0.55);
    // granite speckle only on the sun-facing tops
    const up = Q.ss(0.45, 0.8, c.ny);
    const sp = Q.ss(0.72, 0.8, Q.noise3(x * 38, y * 38, z * 38, 11));
    col = Q.mix(col, C('#7e766d'), sp * up * 0.4);
    // rain streaks down the faces under the tops (vertical), a slightly darker wet foot
    const streak = Q.ss(0.55, 0.8, Q.noise3(x * 9, y * 0.8, z * 9, 7)) * Q.ss(0.6, 0.2, Math.abs(c.ny));
    col = Q.mix(col, C('#968e84'), streak * 0.3);
    col = Q.mix(col, C('#867f76'), Q.ss(0.3, 0.0, y) * 0.4);
    // a green stain round the moss caps only
    col = Q.mix(col, C('#8f9a62'), mossMask(x, y, z, c.ny) * 0.55);
    return Q.mix(col, C('#5f584f'), c.cavity * 0.45);
  };
}
const paintSeam = (c) => Q.mix(C('#3e6f7c'), C('#2a3f48'), c.cavity * 0.5);
const paintBreak = (c) => Q.mix(C('#d6cdbf'), C('#b2a99b'), Q.fbm(c.x * 20, c.y * 20, c.z * 20, 5, 2));
const paintEye = () => C('#c8f8ff');
const paintMoss = (c) => Q.mix(Q.mix(C('#6f8248'), C('#a3b06a'), Q.ss(0.3, 0.9, c.ny) * 0.6 + c.edge * 0.4), C('#4b5a30'), c.cavity * 0.6);
function paintRope(c) {
  const g = Q.ss(0.0, 0.6, c.cavity * 2);
  let col = Q.mix(C('#d6c088'), C('#e8d9a8'), c.edge * 0.6);
  return Q.mix(col, C('#8f7a4a'), g * 0.6);
}
const paintPaper = (c) => Q.mix(C('#f5f1e6'), C('#d9d2c4'), c.cavity * 0.8 + Q.ss(0.5, 0, c.edge) * 0.1);

// ------------------------------------------------------------------------------------------------------------- pieces
let NID = 0;
/** one field stone pinned to a bone: c centre, s full size; unequal split faces, lumpy, never a box */
function stone(c, s, { turn = [0, 0, 0], cuts = 4, depth = 0.16, lump = 0.06, egg = 0, seed = 0, bone, tone } = {}) {
  const id = NID++;
  return L.fieldStone(c, s, { turn, cuts: cuts + 2, depth: depth + 0.14, lump, egg, seed: seed || id * 7 + 3 }).part('stone' + id, { mat: 'stone', paint: stonePaint(tone ?? id), bone });
}
function brkP(sh, at, dir, depth, seed, bone) { Q.part('break_' + bone, { mat: 'stone', paint: paintBreak, bone }); return L.brk(sh, { at, dir, depth, spread: 0.6, seed, rough: 0.01, paint: 'break_' + bone }); }
/** a ragged moss cap: overlapping flat pads, billowed */
function moss(pads, bone, seed) {
  const rnd = Q.prng(seed), parts = [];
  for (const [x, y, z, r] of pads) {
    parts.push(Q.ellipsoid([r, r * 0.22, r * (0.75 + 0.3 * rnd())]).turn(0, rnd() * 90, 0).at(x, y, z));
    for (let k = 0; k < 3; k++) { const a = rnd() * 6.28, rr = r * (0.35 + 0.25 * rnd()); parts.push(Q.ellipsoid([rr, rr * 0.3, rr]).at(x + Math.cos(a) * r * 0.85, y - r * 0.08, z + Math.sin(a) * r * 0.75)); }
  }
  return Q.union(...parts).rough({ type: 'billow', scale: 0.07, amp: 0.016, oct: 2, seed })
    .part('moss_' + bone, { mat: 'stone', paint: paintMoss, bone });
}
/** a jagged glowing crack: slot chain painted as the seam (or as the eye) */
function seam(sh, pts, n, w0, w1, D, bone, name = 'seam_' + bone, paint = paintSeam, mat = 'stone') {
  return sh.cut(L.crackSlots(pts, V.norm(n), w0, w1, D).part(name, { mat, paint, bone }), { paintCut: true });
}

/** shide: a zigzag paper streamer hanging from `top` (x, y, z), facing +z, four steps */
function shide(top, len, w, flip, yaw) {
  const t = QK ? 0.04 : 0.03, st = len / 4, sgn = flip ? -1 : 1;
  const cx = [0, 0.62, 0, 0.62, 0.3].map((v) => v * w * sgn), cy = [0, -st, -2 * st, -3 * st, -4 * st];
  const outline = [];
  for (let i = 0; i <= 4; i++) outline.push([cx[i] - w / 2, cy[i] + (i === 0 ? 0 : 0.02 * (i % 2 ? 1 : -1))]);
  for (let i = 4; i >= 0; i--) outline.push([cx[i] + w / 2, cy[i] - (i === 0 ? 0 : 0.02 * (i % 2 ? 1 : -1))]);
  return Q.extrude(outline, t, { round: 0.006 }).turn(8, yaw, 0).at(...top);
}

const ROPE_Y = 2.25, ROPE_C = [0.04, -0.4], ROPE_R = [0.84, 0.66];
const ropePt = (a) => { const f = Math.max(0, Math.cos(a)); return [ROPE_C[0] + Math.sin(a) * ROPE_R[0], ROPE_Y - 0.12 * f * f + 0.03 * Math.sin(a), ROPE_C[1] + Math.cos(a) * ROPE_R[1]]; };

export default {
  name: 'stone_golem', id: 'sculpt_mon_golem_big',
  rig: { file: 'assets/models/refined/mon_golem_big.glb' },
  rigCredit: 'Quaternius, CC0 (skeleton + clips)',
  voxel: 0.009,
  lods: [12000],
  ground: null,                 // a walking creature: no ground occlusion baked into the soles (round 1 had a black foot)
  aoRange: 0.12, cavityDark: 0.3, cavity: [0.006, 0.025], creaseAngle: 50, bandSlack: 0.02,
  weights: { smooth: 1, smoothAlpha: 0.5 },
  poses: [[A + 'Idle', 1.5], [A + 'Walk', 0.5], [A + 'Attack', 0.35], [A + 'Run', 0.3], [A + 'HitRecieve', 0.1], [A + 'Death', 0.8]],
  notes: 'Sculpted shrine-stone golem on the mon_golem_big skeleton (joints, IBMs, clips unchanged). Rigid pieces per bone. Vertex colours; materials Stone / Eyes; TEXCOORD_0.x glow mask (post step).',

  build() {
    NID = 0;
    // ------------------------------------------------------------------ legs: short thick stumps (rigid; R = -x heavier)
    let legR = Q.union(
      stone([-0.48, 0.15, -0.24], [0.84, 0.3, 0.98], { turn: [0, 9, 3], bone: 'Leg.R', tone: 3, cuts: 3, depth: 0.22 }),
      stone([-0.46, 0.72, -0.37], [0.82, 0.98, 0.76], { turn: [4, -12, 4], bone: 'Leg.R', tone: 1, egg: -0.25 }),
      stone([-0.66, 0.98, -0.1], [0.3, 0.24, 0.26], { turn: [0, 30, 20], bone: 'Leg.R', tone: 6, cuts: 3 }),
      stone([-0.44, 1.26, -0.39], [0.64, 0.32, 0.62], { turn: [0, 20, -4], bone: 'Leg.R', tone: 5, cuts: 3 }),
    );
    legR = seam(legR, [[-0.4, 1.0, 0.0], [-0.5, 0.82, 0.02], [-0.42, 0.62, 0.0]], [0, 0, 1], 0.02, 0.008, 0.1, 'Leg.R');
    let legL = Q.union(
      stone([0.47, 0.13, -0.21], [0.74, 0.26, 0.9], { turn: [0, -14, -2], bone: 'Leg.L', tone: 0, cuts: 3, depth: 0.22 }),
      stone([0.46, 0.66, -0.35], [0.72, 0.86, 0.68], { turn: [-3, 15, -5], bone: 'Leg.L', tone: 6, egg: -0.2 }),
      stone([0.44, 1.2, -0.37], [0.58, 0.36, 0.58], { turn: [6, -25, 4], bone: 'Leg.L', tone: 4, cuts: 3 }),
    );
    legL = brkP(legL, [0.76, 0.26, 0.12], [0.7, 0.5, 0.6], 0.09, 3, 'Leg.L');

    // ------------------------------------------------------------------ body (bone Body): pelvis, roped chest, the shoulder boulder
    let body = Q.union(
      stone([-0.05, 1.8, -0.42], [1.3, 0.56, 0.95], { turn: [0, 8, 3], bone: 'Body', tone: 2, cuts: 3 }),          // pelvis
      stone([0.08, 2.25, -0.4], [1.52, 0.62, 1.16], { turn: [0, -6, -3], bone: 'Body', tone: 0, cuts: 3 }),        // roped chest
      stone([-0.04, 2.6, -0.48], [1.22, 0.46, 1.0], { turn: [4, 10, 3], bone: 'Body', tone: 7, cuts: 3 }),         // upper chest
      stone([-0.55, 1.98, -0.02], [0.32, 0.24, 0.26], { turn: [0, 20, 12], bone: 'Body', tone: 3, cuts: 3 }),      // chinking stones
      stone([0.58, 2.48, -0.08], [0.24, 0.2, 0.22], { turn: [8, -15, -10], bone: 'Body', tone: 6, cuts: 3 }),
    );
    // the boulder: one great stone across shoulders and back, its front lip riding out over the head
    const boulder = L.fieldStone([-0.03, 3.22, -0.62], [1.86, 0.98, 1.42], { turn: [10, -7, 5], seed: 77, cuts: 7, depth: 0.26, lump: 0.045 })
      .softAdd(L.fieldStone([0.05, 3.47, -0.04], [1.3, 0.46, 0.92], { turn: [-6, 8, -4], seed: 78, cuts: 4, depth: 0.3, lump: 0.04 }), 0.35)
      .part('boulder', { mat: 'stone', paint: stonePaint(5), bone: 'Body' });
    body = body.softAdd(boulder, 0.22);
    body = brkP(body, [0.72, 3.38, -0.25], [0.6, 0.6, 0.4], 0.13, 5, 'Body');
    body = brkP(body, [-0.6, 1.6, 0.0], [-0.4, -0.6, 0.7], 0.08, 7, 'Body');
    // glowing cracks: the boulder's back, the chest's right flank, the upper chest front
    body = seam(body, [[0.3, 3.42, -1.18], [0.12, 3.22, -1.26], [0.2, 3.02, -1.22], [0.04, 2.84, -1.12]], [0, 0, -1], 0.026, 0.01, 0.13, 'Body');
    body = seam(body, [[-0.75, 2.46, -0.28], [-0.76, 2.32, -0.42], [-0.74, 2.14, -0.6]], [-1, 0, 0], 0.02, 0.008, 0.1, 'Body');
    body = seam(body, [[0.35, 2.78, 0.0], [0.3, 2.66, 0.02], [0.37, 2.52, 0.02]], [0, 0, 1], 0.018, 0.008, 0.1, 'Body');
    const bodyMoss = moss([[-0.22, 3.66, -0.38, 0.36], [0.42, 3.55, -0.85, 0.24], [-0.62, 3.5, -0.2, 0.09]], 'Body', 4);

    // the shimenawa: a thick two-strand straw rope round the chest, a knot at the front-left, streamers
    const loop = []; for (let i = 0; i < 64; i++) loop.push(ropePt((i / 64) * Math.PI * 2));
    let rope = L.rope(loop, 0.1, { turns: 22, groove: 0.32 });
    const kn = ropePt(0.35);
    rope = rope.add(Q.ellipsoid([0.17, 0.14, 0.13]).at(kn[0], kn[1] - 0.02, kn[2] + 0.04).rough({ type: 'ridged', scale: 0.04, amp: 0.008, seed: 2 }));
    for (const [dx, len] of [[-0.04, 0.32], [0.05, 0.26]]) rope = rope.add(Q.taperedCapsule([kn[0] + dx, kn[1] - 0.08, kn[2] + 0.05], [kn[0] + dx * 1.6, kn[1] - len, kn[2] + 0.08], 0.045, 0.02).strata({ spacing: 0.06, depth: 0.004, width: 0.008, axis: 'y', seed: 3 }));
    rope = rope.part('rope', { mat: 'stone', paint: paintRope, bone: 'Body' });
    const papers = [];
    for (const [a, len, flip] of [[-0.6, 0.5, false], [0.05, 0.56, true], [0.85, 0.44, false]]) {
      const p = ropePt(a), yaw = (a * 180) / Math.PI;
      papers.push(shide([p[0], p[1] - 0.07, p[2] + 0.09 * Math.cos(a)], len * 1.2, 0.12, flip, yaw));
    }
    const paper = Q.union(...papers).part('paper', { mat: 'stone', paint: paintPaper, bone: 'Body' });

    // ------------------------------------------------------------------ head: the carved face hanging under the boulder (bone Head)
    const headB = stone([0.02, 2.85, 0.44], [0.9, 0.62, 0.54], { turn: [-4, -6, 3], bone: 'Head', tone: 1, cuts: 3 });
    let plate = L.block([-0.01, 2.84, 0.78], [0.82, 0.6, 0.18], { r: 0.06, turn: [-4, 0, -3], facets: 8, seed: 41, fdepth: 0.09 })
      .rough({ type: 'fbm', scale: 0.2, amp: 0.012, oct: 2, seed: 44 });
    // the brow shelf: a thick ledge thrust forward over the eyes
    const brow = L.fieldStone([0.02, 3.06, 0.84], [0.8, 0.2, 0.3], { turn: [14, 0, -5], seed: 42, cuts: 4, depth: 0.2, lump: 0.03 });
    plate = plate.softAdd(brow, 0.07);
    // a long wedge nose (moai): side profile extruded across x, tapering
    const noseO = [[0, 0.3], [-0.05, 0.27], [-0.15, 0.02], [-0.12, -0.03], [0, -0.03]];
    const nose = L.frame(Q.extrude(noseO, 0.13, { round: 0.02 }), [0.0, 2.72, 0.86], [0.0, 3.0, 0.86], [1, 0, 0]);
    plate = plate.softAdd(nose, 0.03).part('plate', { mat: 'stone', paint: stonePaint(5), bone: 'Head' });
    // carved: a mouth crack, cheek lines, a chipped brow corner
    plate = plate.groove([[-0.22, 2.67, 0.87], [-0.05, 2.655, 0.875], [0.08, 2.67, 0.875], [0.2, 2.65, 0.87]], { width: 0.022 });
    plate = plate.groove([[-0.36, 2.9, 0.875], [-0.3, 2.74, 0.875], [-0.33, 2.6, 0.87]], { width: 0.018 });
    plate = plate.groove([[0.36, 2.92, 0.875], [0.31, 2.76, 0.875], [0.34, 2.62, 0.87]], { width: 0.018 });
    plate = brkP(plate, [0.48, 3.16, 1.0], [0.7, 0.4, 0.6], 0.1, 9, 'Head');
    plate = brkP(plate, [-0.4, 2.56, 0.88], [-0.6, -0.5, 0.6], 0.06, 10, 'Head');
    // the eyes: two jagged glowing cracks under the shelf (left long and level, right lower, shorter, split by the crack)
    plate = seam(plate, [[0.07, 2.93, 0.88], [0.15, 2.9, 0.88], [0.24, 2.94, 0.88], [0.33, 2.91, 0.88]], [0, 0, 1], 0.045, 0.02, 0.07, 'Head', 'eye', paintEye, 'eye');
    plate = seam(plate, [[-0.08, 2.9, 0.88], [-0.17, 2.925, 0.88], [-0.3, 2.88, 0.88]], [0, 0, 1], 0.042, 0.022, 0.07, 'Head', 'eye', paintEye, 'eye');
    plate = seam(plate, [[-0.22, 3.0, 0.88], [-0.25, 2.88, 0.88], [-0.21, 2.78, 0.88], [-0.26, 2.62, 0.87]], [0, 0, 1], 0.015, 0.006, 0.06, 'Head');
    const headMoss = moss([[0.14, 3.15, 0.8, 0.1]], 'Head', 6);
    const head = headB.add(plate).softAdd(headMoss, 0.02);

    // ------------------------------------------------------------------ arms (rigid): small upper arms, huge forearm boulders
    let armR = Q.union(
      stone([-1.0, 2.7, -0.47], [0.38, 0.36, 0.42], { turn: [10, 0, 8], bone: 'Arm.R', tone: 4, cuts: 3 }),
      stone([-1.3, 2.8, -0.44], [0.3, 0.36, 0.36], { turn: [0, 6, -5], bone: 'Arm.R', tone: 2, cuts: 3 }),
      stone([-1.76, 2.8, -0.42], [0.66, 0.8, 0.8], { turn: [-6, -4, 14], bone: 'Arm.R', tone: 7, egg: 0.2 }),
      stone([-2.3, 2.7, -0.36], [0.64, 0.98, 0.98], { turn: [4, 0, -8], bone: 'Arm.R', tone: 0, cuts: 5 }),
      // knuckle stones on the fist's front
      stone([-2.42, 2.44, 0.1], [0.3, 0.2, 0.22], { turn: [0, 10, 5], bone: 'Arm.R', tone: 3, cuts: 2 }),
      stone([-2.4, 2.66, 0.12], [0.32, 0.21, 0.22], { turn: [0, -8, -6], bone: 'Arm.R', tone: 6, cuts: 2 }),
      stone([-2.38, 2.88, 0.08], [0.28, 0.2, 0.2], { turn: [0, 5, 4], bone: 'Arm.R', tone: 1, cuts: 2 }),
    );
    armR = brkP(armR, [-2.58, 3.08, -0.62], [-0.6, 0.6, -0.5], 0.1, 11, 'Arm.R');
    armR = seam(armR, [[-1.7, 3.1, -0.06], [-1.8, 2.9, -0.02], [-1.74, 2.7, -0.03], [-1.82, 2.52, -0.06]], [0, 0, 1], 0.022, 0.009, 0.12, 'Arm.R');
    let armL = Q.union(
      stone([1.0, 2.72, -0.47], [0.34, 0.32, 0.38], { turn: [-8, 0, -6], bone: 'Arm.L', tone: 3, cuts: 3 }),
      stone([1.28, 2.82, -0.45], [0.28, 0.32, 0.34], { turn: [0, -8, 4], bone: 'Arm.L', tone: 5, cuts: 3 }),
      stone([1.7, 2.8, -0.43], [0.58, 0.64, 0.66], { turn: [6, 5, -10], bone: 'Arm.L', tone: 1, egg: 0.15 }),
      stone([2.24, 2.74, -0.4], [0.56, 0.7, 0.72], { turn: [0, -10, 6], bone: 'Arm.L', tone: 6, cuts: 4 }),
    );
    armL = brkP(armL, [2.5, 2.98, -0.12], [0.6, 0.5, 0.6], 0.14, 13, 'Arm.L');
    armL = brkP(armL, [1.62, 3.06, -0.3], [0, 0.8, 0.5], 0.07, 15, 'Arm.L');
    const armRMoss = moss([[-2.3, 3.16, -0.38, 0.1]], 'Arm.R', 9);

    return Q.union(legR, legL, body.softAdd(bodyMoss, 0.03), rope, paper, head, armR.softAdd(armRMoss, 0.02), armL);
  },
};

// ------------------------------------------------------------------------------------------------------- post + sheets
const MAT = { eye: 'Eyes' };
const GLOW = (p) => (p.startsWith('seam') ? 0.92 : p === 'eye' ? 1 : 0);
// run through .tmp/sculpt/shade_bat/finish.mjs <name> post|sheets (a module cannot load itself while its top-level await runs)
export async function finish(role) {
  const GLB = 'assets/models/sculpt/stone_golem.glb', DIR = '.tmp/sculpt/stone_golem';
  if (role === 'post') await L.post('tools/sculpt/assets/stone_golem.mjs', GLB, { matOf: (p) => MAT[p] || 'Stone', base: 'Stone', glowOf: GLOW });
  if (role === 'post' || role === 'sheets') {
    await L.sheets({ name: 'stone_golem', glb: GLB, oldGlb: 'assets/models/refined/mon_golem_big.glb', dir: DIR, az: 35,
      poses: [[A + 'Idle', 1.5], [A + 'Walk', 0.5], [A + 'Attack', 0.35], [A + 'Run', 0.3], [A + 'HitRecieve', 0.1], [A + 'Death', 0.8]],
      tint: { Stone: Q.color('#e6e2f2'), Eyes: [1.3, 1.6, 1.7] },
      baPose: [A + 'Idle', 1.5],
      close: [{ c: [0, 2.95, 0.6], d: 2.2, az: 20, el: 6, label: 'FACE 3/4', pose: [A + 'Idle', 1.5] }, { c: [0, 2.3, 0.1], d: 2.6, az: -25, el: 5, label: 'ROPE', pose: [A + 'Idle', 1.5] },
        { c: [-2.0, 2.7, -0.3], d: 2.4, az: 40, el: 15, label: 'HEAVY ARM' }, { c: [0, 2.6, -0.5], d: 3.0, az: 200, el: 20, label: 'BACK' }] });
  }
}
