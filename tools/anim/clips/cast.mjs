// Spell casting one-shots and loops (right hand = gohei, left hand free for seals / charms).
import { G, L, R, W, LW, CAST, WIDE, READY, STAND, pose } from './common.mjs';

const k = (t, ...o) => Object.assign({ t }, ...o);
const LAG = { sp: 0.025, hd: -0.03, Rt: 0.045, Lt: 0.04, shR: 0.02, shL: 0.02 };
const C = (name, dur, desc, release, keys, extra = {}) => ({ name, dur, loop: false, desc, marks: { release }, upper: true, lag: LAG, keys, ...extra });

export const CASTS = [
  // FIRE: coil low-right, thrust forward, flick the wand tip up. Silhouette: long straight arm pointing at the target.
  C('Cast_Fire', 0.85, 'coiled thrust then a sharp wrist flick (fire)', 0.33, [
    k(0, CAST, READY),
    k(0.17, { hp: [0.01, -0.06, -0.03], hr: [0, -24, 0], sp: [2, -22, 2], hd: [0, 30, 0], shR: [0, 0, -6], e: 'in' },
      W([-0.24, 1.02, -0.1], [0.1, 0.55, 1], [0.6, -0.2, 0.3]), L([0.12, 1.12, 0.3], [0.1, 0.6, 1], [0, 0, 1]), { gL: G.open }),
    k(0.33, { hp: [-0.01, -0.07, 0.05], hr: [0, 6, 0], sp: [8, 16, -2], hd: [-2, -12, 0], shR: [0, 10, 0], e: 'out' },
      W([-0.08, 1.24, 0.38], [0.02, 0.15, 1], [0.6, 0.6, 0.2]), L([0.2, 1.05, 0.02], [-0.2, 0.2, 1], [-1, 0, 0]), { gL: G.soft }),
    k(0.43, { sp: [6, 14, -2], e: 'io' }, W([-0.08, 1.29, 0.35], [0.0, 1, 0.45], [0.6, 0.1, 0.8])),
    k(0.62, { hp: [0, -0.05, 0.02], hr: [0, -4, 0], sp: [5, 12, 0], hd: [0, 0, 0], shR: [0, 0, 0], e: 'io' }, W([-0.16, 1.12, 0.27], [0.05, 1, 0.4], [0.4, 0, 1])),
    k(0.85, CAST, READY),
  ]),
  // WATER: dip low to the left, flowing rising arc up and out to the right, tip curls over.
  C('Cast_Water', 1.0, 'low-to-high flowing sweep that curls over at the top (water)', 0.5, [
    k(0, CAST, READY),
    k(0.24, { hp: [0.03, -0.1, 0.01], hr: [0, 14, 0], sp: [14, 18, 6], hd: [8, 14, 6], e: 'io' },
      W([0.04, 0.86, 0.27], [0.5, -0.4, 0.6], [0.6, -0.6, 0.4]), L([0.3, 0.95, 0.0], [0.6, -0.5, -0.4], [0, -1, 0]), { gL: G.soft }),
    k(0.5, { hp: [-0.03, -0.01, 0.0], hr: [0, -14, 0], sp: [-8, -16, -6], hd: [-12, -14, -4], e: 'lin' },
      W([-0.3, 1.46, 0.18], [-0.35, 1, 0.3], [-0.2, 0.2, 1]), L([0.33, 1.08, 0.12], [1, 0.2, 0.2], [0, -0.6, 0.6]), { gL: G.open }),
    k(0.72, { hp: [-0.02, -0.03, 0.0], sp: [-2, -10, -4], hd: [-6, -8, 0], e: 'io' },
      W([-0.33, 1.32, 0.04], [-1, 0.25, -0.1], [-0.1, 0.3, 1]), L([0.3, 1.02, 0.1], [0.8, -0.3, 0.3], [0, -1, 0])),
    k(1.0, CAST, READY),
  ], { lag: { ...LAG, Rt: 0.07, Lp: 0.06, sp: 0.04 } }),
  // ICE: cock high over the left shoulder, one decisive diagonal cut down-right that stops dead and holds.
  C('Cast_Ice', 0.75, 'sharp diagonal cut that stops dead and holds (ice)', 0.27, [
    k(0, CAST, READY),
    k(0.15, { hp: [0.02, -0.02, -0.01], hr: [0, 10, 0], sp: [-4, 24, 4], hd: [0, -6, 0], e: 'in3' },
      W([0.07, 1.42, 0.12], [0.35, 1, -0.3], [0.2, 0.2, 1]), L([0.18, 1.05, 0.14], [0.1, 0, 1], [-1, 0, 0])),
    k(0.27, { hp: [-0.02, -0.08, 0.03], hr: [0, -14, 0], sp: [12, -20, -4], hd: [4, 8, 0], e: 'lin' },
      W([-0.3, 0.97, 0.3], [-0.65, -0.55, 0.55], [-0.4, 0.4, 1]), L([0.24, 1.1, -0.04], [0.4, 0.5, 0.6], [0, 0, 1]), { gL: G.open }),
    k(0.5, { hp: [-0.02, -0.081, 0.03], sp: [12, -20, -4], e: 'io' }, W([-0.3, 0.965, 0.3], [-0.65, -0.55, 0.55], [-0.4, 0.4, 1])),
    k(0.75, CAST, READY),
  ], { lag: { sp: 0.012, hd: -0.03, Rt: 0.0, Lt: 0.02 } }),
  // WIND: twist right with the wand trailing, step out with the left foot and sweep wide across, body following.
  C('Cast_Wind', 0.95, 'wide horizontal sweep with a body twist and a left step (wind)', 0.45, [
    k(0, CAST, READY),
    k(0.22, { hp: [-0.04, -0.05, -0.02], hr: [0, -22, 0], sp: [2, -30, 0], hd: [0, 34, 0], e: 'in', FL: [0.04, 0, 0.07] },
      W([-0.36, 1.1, -0.06], [-1, 0.2, -0.3], [-0.2, -0.2, 1]), L([-0.04, 1.12, 0.25], [-1, 0.1, 0.2], [0, 0, -1]), { gL: G.soft }),
    k(0.34, { FL: [0.09, 0.07, 0.12], FLr: [10, 20, 0] }),
    k(0.45, { hp: [0.05, -0.08, 0.05], hr: [0, 20, 0], sp: [6, 30, -4], hd: [0, -24, 0], FL: [0.13, 0, 0.17], FLr: [0, 24, 0], e: 'out' },
      W([0.14, 1.16, 0.34], [1, 0.15, 0.35], [0.3, -0.1, 1]), L([0.38, 1.16, -0.1], [1, 0.2, -0.3], [0, -1, 0]), { gL: G.open }),
    k(0.66, { hp: [0.05, -0.07, 0.04], hr: [0, 24, 0], sp: [4, 34, -2], hd: [0, -26, 0], e: 'io' },
      W([0.2, 1.2, 0.26], [1, 0.4, -0.2], [0.2, 0, 1]), L([0.36, 1.12, -0.14], [0.9, 0, -0.4], [0, -1, 0])),
    k(0.95, CAST, READY, { FL: [0.04, 0, 0.07], FLr: [0, 6, 0] }),
  ], { lag: { ...LAG, Rt: 0.06, Lp: 0.05, sp: 0.04, hr: -0.02 } }),
  // THUNDER: rise onto the toes with the wand straight up, hang, then strike down hard into a low crouch.
  C('Cast_Thunder', 1.05, 'raise overhead on the toes, hang, strike down into a crouch (thunder)', 0.66, [
    k(0, CAST, READY),
    k(0.24, { hp: [0, 0.03, 0.0], hr: [0, -4, 0], sp: [-10, 4, 0], hd: [-16, 0, 0], FL: [0.04, 0.04, 0.07], FR: [-0.05, 0.04, -0.08], FLr: [24, 6, 0], FRr: [24, -22, 0], toeL: 24, toeR: 24, e: 'out' },
      W([-0.08, 1.6, 0.04], [0, 1, 0.05], [0.5, 0.1, 0.8]), L([0.27, 1.38, 0.08], [0.6, 0.6, 0.2], [0, 1, 0]), { gL: G.open }),
    k(0.5, { hp: [0, 0.035, 0.0], sp: [-12, 4, 0], hd: [-18, 0, 0], e: 'in3' }, W([-0.08, 1.61, 0.02], [0, 1, -0.05], [0.5, 0.1, 0.8])),
    k(0.66, { hp: [0, -0.13, 0.03], hr: [0, -8, 0], sp: [26, 8, 0], hd: [-14, 0, 0], FL: [0.04, 0, 0.07], FR: [-0.05, 0, -0.08], FLr: [0, 6, 0], FRr: [0, -22, 0], toeL: 0, toeR: 0, e: 'lin' },
      W([-0.14, 0.98, 0.4], [0, -0.35, 1], [0.4, -0.8, 0.3]), L([0.25, 1.02, -0.06], [0.4, 0.4, -0.6], [0, -1, 0]), { gL: G.claw }),
    k(0.84, { hp: [0, -0.12, 0.03], sp: [24, 8, 0], e: 'io' }, W([-0.14, 0.99, 0.39], [0, -0.3, 1], [0.4, -0.8, 0.3])),
    k(1.05, CAST, READY),
  ]),
  // EARTH: plant wide, crouch and grip low, strain, then haul both hands up as if lifting a slab of stone.
  C('Cast_Earth', 1.1, 'wide planted crouch, strain, both hands haul upward (earth)', 0.74, [
    k(0, CAST, READY),
    k(0.22, WIDE, { hp: [0, -0.24, -0.05], hr: [12, 0, 0], sp: [28, 0, 0], hd: [-30, 0, 0], FL: [0.15, 0, 0.03], FR: [-0.15, 0, 0.0], FLr: [0, 16, 0], FRr: [0, -16, 0], e: 'io' },
      W([-0.18, 0.56, 0.36], [0.3, -0.2, 1], [0.1, -1, 0.2]), L([0.18, 0.56, 0.36], [0, -0.6, 1], [0, 1, 0.2]), { gL: G.claw }),
    k(0.5, { hp: [0, -0.25, -0.06], hr: [14, 0, 0], sp: [30, 0, 0], e: 'in' }, W([-0.18, 0.55, 0.34], [0.3, -0.2, 1], [0.1, -1, 0.2]), L([0.18, 0.55, 0.34], [0, -0.6, 1], [0, 1, 0.2])),
    k(0.74, { hp: [0, -0.07, 0.02], hr: [0, 0, 0], sp: [-8, 0, 0], hd: [-12, 0, 0], e: 'out' },
      W([-0.2, 1.34, 0.26], [0, 1, 0.3], [0, 0.3, 1]), L([0.2, 1.34, 0.26], [0, 0.4, 1], [0, 1, 0]), { gL: G.fist }),
    k(0.88, { hp: [0, -0.07, 0.02], sp: [-6, 0, 0], e: 'io' }, W([-0.2, 1.36, 0.24], [0, 1, 0.2], [0, 0.3, 1]), L([0.2, 1.36, 0.24], [0, 0.4, 1], [0, 1, 0])),
    k(1.1, CAST, READY),
  ], { noise: { Lp: [0.004, 11], Rp: [0.004, 12] } }),
  // SUN: hands meet at the chest, a beat of stillness, then open up and outward like a blessing, on the toes.
  C('Cast_Sun', 1.05, 'hands together at the chest, then open upward in a blessing (sun)', 0.72, [
    k(0, CAST, READY),
    k(0.26, STAND, { sp: [6, 0, 0], hd: [12, 0, 0], e: 'io' },
      W([-0.025, 1.12, 0.2], [0, 1, 0.1], [1, 0, 0.15]), L([0.03, 1.1, 0.2], [0, 1, 0.15], [-1, 0, 0]), { gL: G.flat }),
    k(0.48, { sp: [7, 0, 0], hd: [14, 0, 0], e: 'in' }, W([-0.025, 1.13, 0.2], [0, 1, 0.1], [1, 0, 0.15]), L([0.03, 1.11, 0.2], [0, 1, 0.15], [-1, 0, 0])),
    k(0.72, { hp: [0, 0.02, 0], sp: [-12, 0, 0], hd: [-18, 0, 0], FL: [0.012, 0.03, 0.012], FR: [-0.01, 0.03, -0.008], FLr: [18, 6, 0], FRr: [18, -8, 0], toeL: 18, toeR: 18, e: 'out' },
      W([-0.3, 1.5, 0.14], [-0.4, 1, 0.1], [0, 0.3, 1]), L([0.3, 1.5, 0.14], [0.4, 1, 0.1], [0, 0.5, 0.8]), { gL: G.open }),
    k(0.85, { e: 'io' }, W([-0.31, 1.52, 0.12], [-0.4, 1, 0.05], [0, 0.3, 1]), L([0.31, 1.52, 0.12], [0.45, 1, 0.05], [0, 0.5, 0.8])),
    k(1.05, CAST, READY, { FL: [0.04, 0, 0.07], FR: [-0.05, 0, -0.08], FLr: [0, 6, 0], FRr: [0, -22, 0], toeL: 0, toeR: 0 }),
  ], { lag: { ...LAG, Lp: 0.03 } }),
  // MOON: the wand tip draws a slow circle in front of her, then the left hand beckons it home.
  C('Cast_Moon', 1.1, 'wand draws a circle in the air, then the left hand beckons (moon)', 0.86, [
    k(0, CAST, READY),
    k(0.14, { sp: [0, -4, 2], hd: [-4, -6, 2] }, W([-0.2, 1.5, 0.26], [-0.1, 0.5, 1], [0.3, 1, 0])),
    k(0.3, { sp: [3, 10, -3], hd: [2, 2, -3] }, W([0.0, 1.32, 0.3], [0.2, 0.3, 1], [0.3, 1, 0])),
    k(0.46, { sp: [8, 4, 0], hd: [8, -4, 0] }, W([-0.2, 1.12, 0.32], [0, 0.1, 1], [0.3, 1, 0])),
    k(0.6, { sp: [2, -12, 4], hd: [0, -12, 4] }, W([-0.38, 1.3, 0.2], [-0.3, 0.3, 1], [0.3, 1, 0])),
    k(0.72, { sp: [0, -4, 2], hd: [-4, -6, 0], e: 'io' }, W([-0.21, 1.49, 0.25], [-0.1, 0.5, 1], [0.3, 1, 0]), L([0.17, 1.0, 0.14], [0.1, -0.4, 1], [-0.7, -0.3, 0.2])),
    k(0.8, { sp: [4, 14, 0], hd: [0, -6, 0] }, W([-0.2, 1.2, 0.2], [0, 1, 0.3], [0.3, 0, 1]), L([0.16, 1.18, 0.34], [0, 0.1, 1], [0, 1, 0]), { gL: G.open }),
    k(0.9, { e: 'io' }, L([0.16, 1.2, 0.26], [0, 0.6, 0.7], [0, 0.7, -0.7]), { gL: G.beckon }),
    k(1.1, CAST, READY),
  ], { lag: { ...LAG, Rt: 0.03 } }),
  // charge: wand upright before the face, left hand in a seal below it, a held breath with a fine tremble
  { name: 'Charge_Loop', dur: 1.6, loop: true, upper: true, desc: 'wand upright before the face, left hand sealed, held tension with a fine tremble',
    keys: [
      k(0, WIDE, { hp: [0, -0.06, 0], sp: [4, 4, 0], hd: [6, -2, 0], shR: [0, 0, 4], shL: [0, 0, -4] },
        W([-0.05, 1.27, 0.24], [0.03, 1, 0.05], [0.8, 0, 0.6]), L([0.05, 1.12, 0.22], [0, 1, 0.3], [-1, 0, 0]), { gL: G.seal, gR: G.wand }),
      k(0.8, { hp: [0, -0.065, 0], sp: [5, 4, 0], hd: [7, -2, 0] }, W([-0.05, 1.265, 0.245], [0.03, 1, 0.07], [0.8, 0, 0.6]), L([0.05, 1.115, 0.222], [0, 1, 0.3], [-1, 0, 0])),
    ], noise: { Rp: [0.0025, 9], Lp: [0.0018, 10], hd: [0.35, 7] }, breath: 0.6 },
  C('Charge_Release', 0.95, 'big two-handed release from the charge, recoil back a step', 0.24, [
    k(0, WIDE, { hp: [0, -0.06, 0], sp: [4, 4, 0], hd: [6, -2, 0] }, W([-0.05, 1.27, 0.24], [0.03, 1, 0.05], [0.8, 0, 0.6]), L([0.05, 1.12, 0.22], [0, 1, 0.3], [-1, 0, 0]), { gL: G.seal, gR: G.wand }),
    k(0.12, { hp: [0, -0.1, -0.02], sp: [10, 0, 0], hd: [0, 0, 0], e: 'in3' }, W([-0.08, 1.12, 0.12], [0, 0.6, 1], [0.6, -0.4, 0.4]), L([0.08, 1.12, 0.12], [0, 0.6, 1], [-0.4, -0.2, 0.6])),
    k(0.24, { hp: [0, -0.08, 0.05], sp: [8, 0, 0], hd: [-6, 0, 0], e: 'lin' }, W([-0.07, 1.24, 0.4], [0, 0.25, 1], [0.6, 0.8, 0]), L([0.07, 1.24, 0.39], [0, 1, 0.1], [0, 0, 1]), { gL: G.open }),
    k(0.4, { hp: [0, -0.05, -0.06], sp: [-12, 0, 0], hd: [-10, 0, 0], FR: [-0.08, 0.0, -0.12], FL: [0.08, 0, -0.02], e: 'io' },
      W([-0.1, 1.38, 0.3], [0, 0.8, 0.6], [0.6, 0.4, 0.6]), L([0.1, 1.38, 0.3], [0, 1, -0.1], [0, 0.2, 1])),
    k(0.95, CAST, READY),
  ], { lag: { ...LAG, sp: 0.04 } }),
  { name: 'Guard_Loop', dur: 1.4, loop: true, upper: true, desc: 'wand braced horizontally in front with both hands, knees soft',
    keys: [
      k(0, WIDE, { hp: [0, -0.09, -0.01], sp: [8, 6, 0], hd: [-6, -4, 0] }, W([-0.13, 1.17, 0.29], [1, 0.05, 0.05], [0, 0.6, 1]), L([0.13, 1.19, 0.3], [0, 1, 0.1], [0, 0, 1]), { gL: G.soft, gR: G.wand }),
      k(0.7, { hp: [0, -0.095, -0.01], sp: [9, 6, 0] }, W([-0.13, 1.165, 0.295], [1, 0.07, 0.05], [0, 0.6, 1]), L([0.13, 1.185, 0.305], [0, 1, 0.1], [0, 0, 1])),
    ], breath: 1.0 },
  C('Guard_Hit', 0.45, 'blocked hit: guard pushed into the chest, head turns away, recover', 0.06, [
    k(0, WIDE, { hp: [0, -0.09, -0.01], sp: [8, 6, 0], hd: [-6, -4, 0] }, W([-0.13, 1.17, 0.29], [1, 0.05, 0.05], [0, 0.6, 1]), L([0.13, 1.19, 0.3], [0, 1, 0.1], [0, 0, 1]), { gL: G.soft, gR: G.wand }),
    k(0.07, { hp: [0, -0.11, -0.05], sp: [-10, 2, 3], hd: [8, 18, 6], e: 'out' }, W([-0.12, 1.22, 0.17], [1, 0.25, 0.1], [0, 0.6, 1]), L([0.12, 1.24, 0.17], [0, 1, 0.1], [0, 0, 1])),
    k(0.45, { hp: [0, -0.09, -0.01], sp: [8, 6, 0], hd: [-6, -4, 0], e: 'io' }, W([-0.13, 1.17, 0.29], [1, 0.05, 0.05], [0, 0.6, 1]), L([0.13, 1.19, 0.3], [0, 1, 0.1], [0, 0, 1])),
  ], { marks: { impact: 0.06 } }),
  // SUMMON BROOM: wand up, two overhead twirls, point down in front, left hand catches the handle
  C('Summon_Broom', 1.2, 'twirl the wand overhead, point down, left hand catches the broom', 0.72, [
    k(0, CAST, READY),
    k(0.18, STAND, { sp: [-6, 0, 0], hd: [-14, 0, 0] }, W([-0.1, 1.55, 0.08], [0, 0.6, 0.8], [1, 0, 0])),
    k(0.3, { hd: [-16, 4, 0] }, W([-0.04, 1.56, 0.0], [0.8, 0.6, 0], [0, 0, -1])),
    k(0.42, { hd: [-16, 0, 0] }, W([-0.1, 1.57, -0.06], [0, 0.6, -0.8], [-1, 0, 0])),
    k(0.54, { hd: [-14, -4, 0] }, W([-0.16, 1.55, 0.02], [-0.8, 0.6, 0], [0, 0, 1])),
    k(0.62, { hd: [-12, 0, 0], e: 'in' }, W([-0.1, 1.56, 0.08], [0, 0.6, 0.8], [1, 0, 0])),
    k(0.72, { hp: [0, -0.05, 0.02], sp: [14, 0, 0], hd: [14, 0, 0], e: 'out' }, W([-0.17, 1.05, 0.36], [0, -1, 0.5], [0.3, 0.3, 1]), L([0.17, 0.98, 0.14], [0.1, -0.4, 1], [-0.7, -0.3, 0.2])),
    k(0.92, { hp: [0, -0.08, 0.02], sp: [16, 4, 0], hd: [16, 0, 0], e: 'out' }, L([0.1, 0.94, 0.32], [-0.2, -0.3, 1], [-1, 0, 0]), { gL: G.grip }),
    k(1.2, { hp: [0, -0.03, 0], sp: [4, 0, 0], hd: [2, 0, 0], e: 'io' }, W([-0.19, 1.0, 0.17], [0.05, 1, 0.35], [0.35, -0.1, 1]), L([0.12, 0.97, 0.26], [-0.2, -0.3, 1], [-1, 0, 0])),
  ], { marks: { release: 0.72, catch: 0.92 }, lag: { ...LAG, Rt: 0.02 } }),
  // SHIKIGAMI: two-finger seal brought to the lips (a whispered word), then flicked out forward-left
  C('Summon_Shikigami', 0.95, 'two-finger seal at the lips, whisper, flick it outward', 0.56, [
    k(0, CAST, READY),
    k(0.24, { sp: [4, -8, 0], hd: [10, 6, 0], e: 'io' }, L([0.03, 1.27, 0.2], [-0.2, 1, 0.1], [-1, 0, -0.2]), { gL: G.seal }),
    k(0.42, { sp: [5, -10, 0], hd: [12, 8, 0], e: 'in' }, L([0.03, 1.275, 0.19], [-0.2, 1, 0.1], [-1, 0, -0.2])),
    k(0.56, { sp: [4, 16, -3], hd: [-4, -14, 0], e: 'out' }, L([0.27, 1.28, 0.34], [0.5, 0.15, 1], [0, -1, 0])),
    k(0.95, { sp: [4, 10, 0], hd: [0, 2, 0], e: 'io' }, L([0.17, 0.98, 0.14], [0.1, -0.4, 1], [-0.7, -0.3, 0.2]), { gL: G.soft }),
  ], { lag: { ...LAG, Lt: 0.05 } }),
  // KINKAN: both arms to the sky, on the toes, the whole body a line; release = gather and burst
  { name: 'Kinkan_Loop', dur: 2.0, loop: true, upper: false, desc: 'the ultimate: both arms raised to the sky, on her toes, trembling with power',
    keys: [
      k(0, { hp: [0, 0.02, 0], sp: [-12, 0, 0], hd: [-22, 0, 0], FL: [0.05, 0.035, 0.02], FR: [-0.05, 0.035, -0.02], FLr: [22, 8, 0], FRr: [22, -8, 0], toeL: 22, toeR: 22 },
        W([-0.13, 1.6, 0.06], [-0.1, 1, 0.1], [0.6, 0, 0.8]), L([0.14, 1.6, 0.06], [0.15, 1, 0.1], [-0.6, 0, 0.6]), { gL: G.open, gR: G.wand }),
      k(1.0, { hp: [0, 0.025, 0], sp: [-13, 0, 0], hd: [-24, 0, 0] }, W([-0.14, 1.605, 0.05], [-0.12, 1, 0.08], [0.6, 0, 0.8]), L([0.15, 1.605, 0.05], [0.17, 1, 0.08], [-0.6, 0, 0.6])),
    ], noise: { Rp: [0.003, 8], Lp: [0.003, 8.6], sp: [0.4, 6] }, breath: 0.5 },
  C('Kinkan_Release', 1.4, 'the ultimate release: gather the light to the chest, then burst both arms up and out', 0.62, [
    k(0, { hp: [0, 0.02, 0], sp: [-12, 0, 0], hd: [-22, 0, 0], FL: [0.05, 0.035, 0.02], FR: [-0.05, 0.035, -0.02], FLr: [22, 8, 0], FRr: [22, -8, 0], toeL: 22, toeR: 22 },
      W([-0.13, 1.6, 0.06], [-0.1, 1, 0.1], [0.6, 0, 0.8]), L([0.14, 1.6, 0.06], [0.15, 1, 0.1], [-0.6, 0, 0.6]), { gL: G.open, gR: G.wand }),
    k(0.4, WIDE, { hp: [0, -0.16, -0.02], sp: [24, 0, 0], hd: [10, 0, 0], FL: [0.09, 0, 0.02], FR: [-0.09, 0, 0.0], FLr: [0, 14, 0], FRr: [0, -14, 0], toeL: 0, toeR: 0, e: 'io' },
      W([-0.04, 1.06, 0.2], [0, 1, 0.1], [1, 0, 0.3]), L([0.04, 1.04, 0.2], [0, 1, 0.1], [-1, 0, 0.3]), { gL: G.flat }),
    k(0.62, { hp: [0, 0.03, 0.0], sp: [-16, 0, 0], hd: [-26, 0, 0], FL: [0.09, 0.03, 0.02], FR: [-0.09, 0.03, 0.0], FLr: [20, 14, 0], FRr: [20, -14, 0], toeL: 20, toeR: 20, e: 'out' },
      W([-0.3, 1.52, 0.12], [-0.4, 1, 0], [0.4, 0, 1]), L([0.3, 1.52, 0.12], [0.4, 1, 0], [0, 0.2, 1]), { gL: G.open }),
    k(0.9, { hp: [0, -0.02, -0.03], sp: [-10, 0, 0], hd: [-16, 0, 0], FLr: [0, 14, 0], FRr: [0, -14, 0], FL: [0.09, 0, 0.02], FR: [-0.09, 0, 0.0], toeL: 0, toeR: 0, e: 'io' },
      W([-0.33, 1.42, 0.08], [-0.6, 0.8, 0], [0.4, 0, 1]), L([0.33, 1.42, 0.08], [0.6, 0.8, 0], [0, 0.2, 1])),
    k(1.4, CAST, READY),
  ], { lag: { ...LAG, sp: 0.04, Lp: 0.03 } }),
];

// CHARMS: quick left-hand card flick, three variants (forehand flat, high backhand, low sidearm); chain every 0.33 s
const charm = (name, desc, cock, out, sp0, sp1) => C(name, 0.42, desc, 0.15, [
  k(0, CAST, READY, { sp: [4, 10, 0] }),
  k(0.08, { sp: sp0, hd: [0, -4, 0], e: 'in' }, cock, { gL: G.card }),
  k(0.15, { sp: sp1, hd: [0, 4, 0], e: 'out' }, out),
  k(0.2, { gL: G.open }),
  k(0.42, { sp: [4, 10, 0], hd: [0, 2, 0], e: 'io' }, L([0.17, 0.98, 0.14], [0.1, -0.4, 1], [-0.7, -0.3, 0.2]), { gL: G.soft }),
], { lag: { sp: 0.015, hd: -0.02, Lt: 0.03 }, chain: 0.33 });
CASTS.push(
  charm('Charm_Throw', 'left-hand charm card flick, flat forehand (variant A)',
    L([-0.04, 1.2, 0.14], [-1, 0.2, 0.3], [0, -1, 0]), L([0.16, 1.2, 0.42], [0.25, 0, 1], [0, -1, 0]), [2, -14, 0], [6, 14, -2]),
  charm('Charm_Throw_B', 'left-hand charm card flick, high backhand from the right shoulder (variant B)',
    L([-0.06, 1.34, 0.08], [-0.6, 0.8, 0], [0, 0, -1]), L([0.2, 1.36, 0.38], [0.4, 0.4, 1], [0, -0.3, 1]), [-2, -18, 3], [2, 16, -4]),
  charm('Charm_Throw_C', 'left-hand charm card flick, low sidearm from the hip (variant C)',
    L([0.28, 0.98, -0.06], [0.4, -0.2, -1], [0, -1, 0]), L([0.06, 1.1, 0.42], [-0.3, 0.1, 1], [0, -1, 0.2]), [8, 18, -4], [6, 0, 2]),
);
