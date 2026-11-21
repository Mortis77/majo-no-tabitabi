// NPC work loops (props are the game's: broom / drumsticks / hoe / pole / hammer+chisel / fan go in handR, see NOTES).
import { G, L, R, W, LW, STAND, WIDE, ARMS_FREE, pose } from './common.mjs';
const k = (t, ...o) => Object.assign({ t }, ...o);
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const sub = (a, b) => a.map((x, i) => x - b[i]);
// two fists on one straight handle: top hand l, lower hand r; thumbs point along the handle (toward the working end)
const handle = (l, r, knL = [0, 0, 1], knR = [0, 0, 1], dir = null) => {
  const d = dir || norm(sub(r, l));
  return { Lp: l, Lt: d, Lf: knL, Rp: r, Rt: d, Rf: knR, gL: G.grip, gR: G.grip, Lsp: 'root', Rsp: 'root' };
};
const SEIZA = { hp: [0, -0.56, -0.05], hr: [6, 0, 0], FL: [0.02, -0.08, -0.1], FR: [-0.02, -0.08, -0.1], FLr: [165, 0, 0], FRr: [165, 0, 0], kL: [0.05, 0, 1], kR: [-0.05, 0, 1] };

export const WORK = [
  { name: 'Sweep_Loop', dur: 2.4, loop: true, upper: false, prop: 'broom in handR (handle along the thumb direction)', desc: 'sweeping with a long broom, two strokes right-to-left, body twisting with each',
    keys: [
      k(0, STAND, { hp: [-0.02, -0.04, 0], hr: [0, -10, 0], sp: [18, -14, 0], hd: [18, -10, 0] }, handle([0.0, 1.0, 0.1], [-0.16, 0.8, 0.28], [0.3, 0, 1], [-0.3, 0.3, 1])),
      k(0.75, { hp: [0.02, -0.045, 0], hr: [0, 8, 0], sp: [18, 12, 0], hd: [20, 10, 0], e: 'io' }, handle([0.06, 1.0, 0.14], [0.04, 0.8, 0.32], [0.3, 0, 1], [-0.3, 0.3, 1])),
      k(1.2, { hp: [-0.02, -0.04, 0], hr: [0, -10, 0], sp: [18, -14, 0], hd: [18, -10, 0], e: 'io' }, handle([0.0, 1.0, 0.1], [-0.16, 0.8, 0.28], [0.3, 0, 1], [-0.3, 0.3, 1])),
      k(1.95, { hp: [0.02, -0.045, 0], hr: [0, 8, 0], sp: [18, 12, 0], hd: [20, 10, 0], e: 'io' }, handle([0.06, 1.0, 0.14], [0.04, 0.8, 0.32], [0.3, 0, 1], [-0.3, 0.3, 1])),
    ], lag: { sp: 0.06, hd: 0.12, Lp: 0.04 }, marks: { strokes: [0.75, 1.95] } },
  { name: 'Drum_Loop', dur: 1.6, loop: true, upper: false, prop: 'drumstick (bachi) in each hand along the thumb; drum skin in front at ~0.95 m (scaled with the character)',
    desc: 'taiko: right, left, right, then both sticks overhead and a big double strike', marks: { hits: [0, 0.4, 0.8, 1.4] },
    keys: [
      k(0, WIDE, { hp: [0, -0.12, -0.02], sp: [10, 0, 0], hd: [-6, 0, 0] }, LW([0.13, 1.25, 0.2], [0.1, 0.6, 1], [0, 1, 0.2]), W([-0.1, 0.96, 0.38], [0.05, -0.5, 1], [0.1, -1, 0.2]), { gL: G.grip, gR: G.grip }),
      k(0.2, { sp: [8, 6, 0] }, W([-0.14, 1.26, 0.22], [-0.05, 0.6, 1], [0, 1, 0.2])),
      k(0.4, { sp: [12, -4, 0], e: 'out' }, LW([0.1, 0.96, 0.38], [-0.05, -0.5, 1], [-0.1, -1, 0.2])),
      k(0.6, { sp: [8, -6, 0] }, LW([0.14, 1.26, 0.22], [0.05, 0.6, 1], [0, 1, 0.2])),
      k(0.8, { sp: [12, 4, 0], e: 'out' }, W([-0.1, 0.96, 0.38], [0.05, -0.5, 1], [0.1, -1, 0.2])),
      k(1.15, { hp: [0, -0.06, -0.02], sp: [-8, 0, 0], hd: [-14, 0, 0], e: 'in' }, W([-0.12, 1.55, 0.06], [0.2, 0.7, -0.6], [0, 1, 0]), LW([0.12, 1.55, 0.06], [-0.2, 0.7, -0.6], [0, 1, 0])),
      k(1.4, { hp: [0, -0.15, -0.02], sp: [14, 0, 0], hd: [-4, 0, 0], e: 'out' }, W([-0.1, 0.96, 0.38], [0.05, -0.5, 1], [0.1, -1, 0.2]), LW([0.1, 0.96, 0.38], [-0.05, -0.5, 1], [-0.1, -1, 0.2])),
    ], ee: {}, lag: { sp: 0.03, hd: 0.05, Rt: 0.03, Lt: 0.03 } },
  { name: 'Hoe_Loop', dur: 1.9, loop: true, upper: false, prop: 'hoe in handR (blade end beyond the right fist, along the thumb)', desc: 'farmer: raise the hoe over the right shoulder, chop down into the soil, pull back', marks: { hit: 0.85 },
    keys: [
      k(0, STAND, { hp: [0, -0.05, 0], sp: [14, -4, 0], hd: [16, 0, 0], FL: [0.03, 0, 0.12], FR: [-0.03, 0, -0.1] }, handle([0.02, 0.93, 0.18], [-0.06, 0.88, 0.32], [0.2, -0.3, 1], [0.6, -0.3, 0.6])),
      k(0.6, { hp: [0, -0.02, -0.02], sp: [-4, -14, 0], hd: [8, 6, 0], e: 'io' }, handle([-0.05, 1.18, 0.12], [-0.17, 1.4, 0.0], [0, 1, 0.3], [0.5, 0.6, 0.4], norm([-0.3, 0.6, -0.5]))),
      k(0.85, { hp: [0, -0.1, 0.02], sp: [24, 0, 0], hd: [24, 0, 0], e: 'in' }, handle([0.02, 0.95, 0.2], [-0.05, 0.8, 0.36], [0.2, -0.3, 1], [0.6, -0.3, 0.6], norm([0, -0.6, 0.8]))),
      k(1.3, { hp: [0, -0.07, -0.03], sp: [16, -2, 0], hd: [18, 0, 0], e: 'io' }, handle([0.03, 0.9, 0.12], [-0.05, 0.84, 0.26], [0.2, -0.3, 1], [0.6, -0.3, 0.6], norm([0, -0.8, 0.6]))),
    ], lag: { sp: 0.04, hd: 0.08 } },
  { name: 'Pole_Loop', dur: 3.2, loop: true, upper: false, prop: 'long pole in handR (vertical, along the thumb)', desc: 'ferrywoman: plant the pole forward on the right, walk it back with a long lean, recover', marks: { plant: 0.3 },
    keys: [
      k(0, STAND, { hp: [0, -0.03, 0.02], sp: [6, -12, 0], hd: [4, -6, 0], FL: [0.03, 0, 0.14], FR: [-0.03, 0, -0.14] }, handle([-0.16, 1.45, 0.26], [-0.2, 1.22, 0.28], [0.6, 0, 0.6], [0.6, 0, 0.6], [0, -1, 0])),
      k(0.3, { e: 'in' }),
      k(1.8, { hp: [0, -0.1, -0.06], sp: [26, -18, 0], hd: [-10, -4, 0], e: 'io' }, handle([-0.22, 1.12, -0.02], [-0.25, 0.92, -0.08], [0.6, 0, 0.6], [0.6, 0, 0.6], norm([0.05, -1, -0.25]))),
      k(2.5, { hp: [0, -0.05, 0.0], sp: [10, -8, 0], hd: [0, -4, 0] }, handle([-0.2, 1.3, 0.12], [-0.24, 1.12, 0.1], [0.6, 0, 0.6], [0.6, 0, 0.6], [0, -1, 0.1])),
    ], lag: { sp: 0.08, hd: 0.15 } },
  { name: 'Hammer_Loop', dur: 1.4, loop: true, upper: false, prop: 'mallet in handR, chisel in handL (both along the thumb)', desc: 'stone-mason: chisel held on the block, mallet raised and struck twice', marks: { hits: [0.55, 1.15] },
    keys: [
      k(0, WIDE, { hp: [0, -0.12, -0.04], sp: [26, 6, 0], hd: [22, 0, 0] }, LW([0.05, 0.82, 0.32], [-0.1, -0.6, 0.6], [-0.6, -0.2, 0.7]), W([-0.12, 1.05, 0.22], [0.4, 0.4, 0.6], [0, 0.3, 1]), { gL: G.grip, gR: G.grip }),
      k(0.38, { sp: [24, 2, 0], e: 'io' }, W([-0.2, 1.28, 0.1], [0.1, 0.9, -0.3], [0, 1, 0])),
      k(0.55, { sp: [28, 6, 0], e: 'in' }, W([-0.04, 0.95, 0.32], [0.8, -0.2, 0.3], [0, -0.2, 1])),
      k(0.72, { e: 'out' }, W([-0.08, 1.04, 0.26], [0.6, 0.2, 0.4], [0, 0.3, 1])),
      k(1.0, { sp: [25, 4, 0] }, W([-0.16, 1.2, 0.15], [0.2, 0.8, -0.2], [0, 1, 0])),
      k(1.15, { sp: [28, 6, 0], e: 'in' }, W([-0.04, 0.95, 0.32], [0.8, -0.2, 0.3], [0, -0.2, 1])),
    ], lag: { sp: 0.03, hd: 0.06 } },
  { name: 'Craft_Loop', dur: 4.0, loop: true, upper: false, prop: 'none needed (paper / frame work at the lap); optional small prop in handL', desc: 'lantern-maker: seated in seiza, hands working at the lap: fold, turn, press, glance up',
    keys: [
      k(0, SEIZA, { sp: [16, 0, 0], hd: [22, 0, 0] }, L([0.07, 0.5, 0.26], [-0.3, 0.1, 1], [-0.6, 0.6, 0]), R([-0.07, 0.5, 0.26], [0.3, 0.1, 1], [0.6, 0.6, 0]), { gL: G.cup, gR: G.soft }),
      k(0.8, { hd: [24, 4, 2] }, R([-0.02, 0.53, 0.28], [0.8, 0.0, 0.6], [0, -1, 0]), { gR: G.beckon }),
      k(1.4, { hd: [22, 2, 0] }, R([-0.06, 0.5, 0.26], [0.3, 0.1, 1], [0.6, 0.6, 0]), L([0.06, 0.52, 0.27], [-0.3, 0.3, 1], [-0.4, 0.8, 0]), { gR: G.soft }),
      k(2.2, { hd: [20, -2, -2] }, L([0.04, 0.53, 0.29], [-0.7, 0.3, 0.6], [-0.4, 0.8, 0])),
      k(2.6, { hd: [-4, 6, 3], sp: [10, 2, 0], eye: [6, 4] }),
      k(3.2, { hd: [20, 0, 0], sp: [16, 0, 0], eye: [0, 0] }, R([-0.07, 0.49, 0.25], [0.3, 0.1, 1], [0.6, 0.6, 0]), L([0.07, 0.5, 0.26], [-0.3, 0.1, 1], [-0.6, 0.6, 0])),
    ], lag: { hd: 0.15 }, breath: 0.9 },
  { name: 'Fan_Loop', dur: 1.2, loop: true, upper: true, prop: 'hand fan (uchiwa) in handR, along the fingers', desc: 'fanning herself: quick wrist flaps by the face, head tilted into the breeze',
    keys: [
      k(0, STAND, { sp: [-2, 4, 2], hd: [-6, -6, 6] }, R([-0.13, 1.18, 0.22], [-0.25, 1, 0.25], [0.4, 0, -1]), L([0.17, 0.98, 0.08], [-0.3, -0.8, 0.4], [-1, 0, 0]), { gR: G.grip, gL: G.relax }),
      k(0.2, {}, R([-0.12, 1.19, 0.21], [0.35, 1, 0.25], [0.4, 0, -1])), k(0.4, {}, R([-0.13, 1.18, 0.22], [-0.25, 1, 0.25], [0.4, 0, -1])),
      k(0.6, {}, R([-0.12, 1.19, 0.21], [0.35, 1, 0.25], [0.4, 0, -1])), k(0.8, {}, R([-0.13, 1.18, 0.22], [-0.25, 1, 0.25], [0.4, 0, -1])),
      k(1.0, {}, R([-0.12, 1.19, 0.21], [0.35, 1, 0.25], [0.4, 0, -1])),
    ], breath: 0.6 },
  { name: 'Sit_Ground_Loop', dur: 4.8, loop: true, upper: false, desc: 'sitting on the ground leaning back on both hands, left leg out, right knee up, looking around',
    keys: [
      k(0, { hp: [0, -0.77, -0.02], hr: [-10, 0, 0], sp: [-8, 0, 0], hd: [14, 0, 0], FL: [0.02, -0.075, 0.62], FR: [-0.03, -0.075, 0.4], FLr: [-25, 6, 0], FRr: [0, -6, 0], kL: [0.1, 1, 0.3], kR: [-0.1, 1, 0.3] },
        L([0.2, 0.06, -0.22], [0.2, 0, -1], [0, -1, 0]), R([-0.2, 0.06, -0.22], [-0.2, 0, -1], [0, -1, 0]), { gL: G.flat, gR: G.flat }),
      k(1.6, { hd: [10, 18, 4] }), k(2.4, { hd: [12, 16, 4] }), k(3.6, { hd: [16, -10, -2] }),
    ], lag: { hd: 0.2 }, breath: 1.0 },
];
