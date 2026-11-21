// Traversal: glide (light wings), broom riding, hard landing.
import { G, L, R, W, LW, STAND, READY, ARMS_DOWN, pose, feetAt } from './common.mjs';
import { mirrorKeys } from '../synth.mjs';
const k = (t, ...o) => Object.assign({ t }, ...o);

// ---- glide: body pitched into the flight, chest open, arms swept back and out like trailing wings, legs together and trailing
const glideKeys = (bank = 0) => {
  const b = bank; // -1 = bank left, +1 = bank right
  const arm = (dy, s) => s; // placeholder for readability
  return [
    k(0, { hp: [0, 0.0, 0], hr: [24, -6 * b, -14 * b + 2], sp: [-14, -8 * b, 0], hd: [-16, -14 * b, 4 * b],
      FL: [-0.01, 0.1, -0.29], FR: [0.01, 0.12, -0.33], FLr: [55, 0, 0], FRr: [62, 0, 0], kL: [0, -0.3, 1], kR: [0, -0.3, 1], toeL: -10, toeR: -10 },
      L([0.36, 1.08 - 0.07 * b, -0.17], [0.7, -0.25, -0.6], [0, -1, 0.2]), W([-0.36, 1.08 + 0.07 * b, -0.17], [-0.35, -0.05, -1], [-0.7, -0.2, -0.5]), { gL: G.soft, gR: G.wand }),
    k(1.2, { hp: [0, 0.018, 0], hr: [22, -6 * b, -14 * b - 2], sp: [-16, -8 * b, 0], hd: [-18, -14 * b, 4 * b], FL: [-0.01, 0.11, -0.31], FR: [0.01, 0.11, -0.31] },
      L([0.37, 1.12 - 0.07 * b, -0.15], [0.7, -0.1, -0.6], [0, -1, 0.2]), W([-0.37, 1.12 + 0.07 * b, -0.15], [-0.35, 0.05, -1], [-0.7, -0.1, -0.5])),
  ];
};
const glide = (name, b, desc) => ({ name, dur: 2.4, loop: true, desc, upper: false, keys: glideKeys(b), lag: { Lp: 0.12, Rp: 0.15, hd: 0.1, FL: 0.2, FR: 0.28 }, breath: 0.6 });

// ---- broom, side-saddle: hips turned 70 deg to her left, legs hang on the left side with ankles crossed, torso counter-turned
const RIDE = { hp: [0, -0.367, -0.01], hr: [0, 70, 0], sp: [10, -52, -4], hd: [-4, -18, 4],
  FL: [0.27, -0.035, 0.06], FR: [0.3, -0.03, 0.19], FLr: [18, 75, 0], FRr: [24, 62, 0], kL: [0.94, 0, 0.34], kR: [0.94, 0, 0.34] };
const RIDE_ARMS = { ...W([-0.02, 0.53, 0.2], [0.05, 0.25, 1], [0.2, -1, 0.1]), ...L([0.07, 0.53, -0.1], [0.1, -1, -0.1], [-0.3, 0.0, 0.9]), gL: G.grip, gR: G.grip };
const BOOST = { hp: [0, -0.36, -0.03], hr: [8, 45, 0], sp: [32, -40, 0], hd: [-34, -8, 0],
  FL: [0.2, 0.0, -0.12], FR: [0.24, 0.02, 0.0], FLr: [50, 50, 0], FRr: [45, 40, 0], kL: [0.8, 0, 0.6], kR: [0.8, 0, 0.6] };
const BOOST_ARMS = { ...W([0.0, 0.53, 0.33], [0.1, 0.1, 1], [0.1, -1, 0.1]), ...LW([0.02, 0.53, 0.2], [0, 0.05, 1], [0.6, -0.8, 0]), gL: G.grip, gR: G.grip };

export const TRAVEL = [
  glide('Glide_Loop', 0, 'light-wing glide: pitched forward, chest open, arms swept back and out, legs together trailing, gentle sway'),
  glide('Glide_Bank_L', -1, 'glide banking left (same timing as Glide_Loop: blend by weight)'),
  glide('Glide_Bank_R', 1, 'glide banking right (same timing as Glide_Loop: blend by weight)'),
  { name: 'Broom_Ride_Loop', dur: 3.2, loop: true, upper: false, desc: 'side-saddle on the broom, right hand on the handle, left hand behind her hip, ankles crossed, relaxed sway',
    keys: [
      k(0, RIDE, RIDE_ARMS),
      k(1.6, { hp: [0, -0.362, -0.01], sp: [8, -50, -6], hd: [-6, -20, 6], FL: [0.27, -0.03, 0.07], FR: [0.3, -0.04, 0.18], FLr: [24, 75, 0], FRr: [16, 62, 0] }),
    ], lag: { FL: 0.3, FR: 0.45, hd: 0.2 }, breath: 1.0 },
  { name: 'Broom_Boost_Loop', dur: 1.0, loop: true, upper: false, desc: 'boost: leaning low along the handle, both hands forward, head up into the wind',
    keys: [k(0, BOOST, BOOST_ARMS), k(0.5, { hp: [0, -0.365, -0.03], sp: [33, -40, 1], FL: [0.2, 0.005, -0.13] })],
    noise: { sp: [0.6, 3], hd: [0.8, 2.6], FL: [0.006, 3.5], FR: [0.006, 3.1] }, breath: 0.4 },
  { name: 'Broom_Mount', dur: 0.8, loop: false, upper: false, desc: 'hop up and settle side-saddle onto the broom (broom seat 0.46 m)', marks: { seated: 0.6 },
    keys: [
      k(0, STAND, ARMS_DOWN),
      k(0.18, { hp: [0, -0.12, 0], hr: [0, 15, 0], sp: [14, -10, 0], hd: [6, -10, 0], e: 'in' }, W([-0.08, 0.66, 0.2], [0.05, 0.25, 1], [0.2, -1, 0.1]), { gR: G.grip }),
      k(0.38, { hp: [0, -0.2, 0.0], hr: [0, 55, 0], sp: [6, -40, 0], FL: [0.2, 0.12, 0.05], FR: [0.22, 0.1, 0.15], FLr: [20, 60, 0], FRr: [20, 50, 0], kL: [0.9, 0, 0.4], kR: [0.9, 0, 0.4], e: 'out' },
        RIDE_ARMS),
      k(0.6, RIDE, { e: 'io' }), k(0.8, { hp: [0, -0.366, -0.01] }),
    ], lag: { FL: 0.04, FR: 0.08, hd: -0.04 } },
  { name: 'Broom_Dismount', dur: 0.75, loop: false, upper: false, desc: 'slide off the broom and land on both feet', marks: { feetDown: 0.42 },
    keys: [
      k(0, RIDE, RIDE_ARMS),
      k(0.22, { hp: [0, -0.24, 0.02], hr: [0, 35, 0], sp: [8, -20, 0], hd: [6, -10, 0], FL: [0.12, 0.08, 0.04], FR: [0.06, 0.1, 0.08], FLr: [20, 30, 0], FRr: [20, 20, 0], kL: [0.5, 0, 0.9], kR: [0.5, 0, 0.9], e: 'in' }),
      k(0.42, STAND, { hp: [0, -0.13, 0.0], hr: [0, 0, 0], sp: [14, 0, 0], hd: [4, 0, 0], kL: [0.15, 0, 1], kR: [-0.15, 0, 1], e: 'out' },
        L([0.24, 0.92, 0.1], [0.4, -0.6, 0.6], [0, -1, 0]), W([-0.24, 0.92, 0.1], [0, 0.2, 1], [-0.4, -0.6, 0.6]), { gL: G.open, gR: G.wand }),
      k(0.75, STAND, ARMS_DOWN, { e: 'io' }),
    ], lag: { FL: 0.03, FR: 0.06 } },
  { name: 'Land_Hard', dur: 1.1, loop: false, upper: false, desc: 'heavy landing from a height: deep crouch, left hand to the ground, wand out for balance, rise', marks: { impact: 0.05, recover: 0.6 },
    keys: [
      k(0, { hp: [0, 0.02, 0], hr: [8, 0, 0], sp: [4, 0, 0], hd: [10, 0, 0], FL: [0.04, 0.08, 0.04], FR: [-0.05, 0.06, -0.06], FLr: [20, 6, 0], FRr: [24, -10, 0] },
        L([0.3, 1.15, 0.05], [0.8, 0.2, 0], [0, -1, 0]), W([-0.3, 1.15, 0.05], [-0.4, 0.6, 0.6], [-0.8, 0.2, 0]), { gL: G.open, gR: G.wand }),
      k(0.06, { hp: [0, -0.5, -0.03], hr: [34, 0, 0], sp: [40, 6, 0], hd: [-44, 0, 0], FL: [0.08, 0, 0.12], FR: [-0.07, 0.0, -0.18], FLr: [0, 10, 0], FRr: [35, -14, 0], toeR: 35, kL: [0.4, 0, 1], kR: [-0.3, -0.4, 1], e: 'out' },
        L([0.17, 0.1, 0.36], [0.2, -0.2, 1], [0, -1, 0], { Lsp: 'root' }), W([-0.36, 0.62, 0.1], [-1, 0.4, 0.3], [-0.6, -0.6, 0.4]), { gL: G.open }),
      k(0.13, { hp: [0, -0.515, -0.03], sp: [43, 6, 0] }),
      k(0.6, { hp: [0, -0.48, -0.03], hr: [32, 0, 0], sp: [38, 4, 0], hd: [-40, 0, 0], e: 'io' }, L([0.17, 0.125, 0.34], [0.2, -0.2, 1], [0, -1, 0])),
      k(1.1, STAND, ARMS_DOWN, { e: 'io' }),
    ], lag: { hd: 0.05, Rp: 0.05, sp: 0.03 } },
];
