// Ritual and story: bow, pray, kagura dance, offer, kneel.
import { G, L, R, W, LW, STAND, ARMS_DOWN, ARMS_FREE, pose, feetAt } from './common.mjs';
const k = (t, ...o) => Object.assign({ t }, ...o);
const ch = (o) => ({ ...o, ...(o.Lp ? { Lsp: 'chest' } : {}), ...(o.Rp ? { Rsp: 'chest' } : {}) });
const hip = (o) => ({ ...o, ...(o.Lp ? { Lsp: 'hips' } : {}), ...(o.Rp ? { Rsp: 'hips' } : {}) });
// hands folded on the front of the thighs (hips space), fingers down, palms back; right fist keeps the wand along the thigh
const THIGH_HANDS = hip({ ...L([0.06, 0.76, 0.13], [-0.25, -1, 0.15], [0, 0, -1]), ...R([-0.06, 0.76, 0.13], [0.25, -1, 0.15], [0, 0, -1]), gL: G.flat, gR: G.flat });
const GASSHO = ch({ ...L([0.012, 1.1, 0.2], [0, 1, 0.2], [-1, 0, 0]), ...R([-0.012, 1.1, 0.2], [0, 1, 0.2], [1, 0, 0]), gL: G.flat, gR: G.flat });

// ---- kagura: steps and phrases ----
const fk = (yaw, l, r) => feetAt(yaw, l, r);
const stepKeys = (side, t0, t1, yawFrom, yawTo, lift = 0.06, wide = [0, 0, 0]) => {
  const a = fk(yawFrom, wide, [-wide[0], wide[1], wide[2]]), b = fk(yawTo, wide, [-wide[0], wide[1], wide[2]]);
  const F = 'F' + side, Fr = 'F' + side + 'r';
  const mid = a[F].map((v, i) => (v + b[F][i]) / 2 + (i === 1 ? lift : 0));
  return [k(t0, { [F]: a[F], [Fr]: a[Fr] }), k((t0 + t1) / 2, { [F]: mid, [Fr]: [14, (yawFrom + yawTo) / 2, 0], ['toe' + side]: 10 }), k(t1, { [F]: b[F], [Fr]: b[Fr], ['toe' + side]: 0 })];
};
const WAND_UP = ch(W([-0.07, 1.1, 0.24], [0, 1, 0.12], [0.85, 0, 0.5]));
const LH_UNDER = ch(L([0.03, 1.0, 0.22], [-0.7, -0.2, 0.6], [0, 1, 0]));
const kagura = {
  name: 'Kagura_Loop', dur: 12, loop: true, upper: false, gohei: 'hold',
  desc: 'slow shrine dance with the gohei (miko-mai): raise, turning steps, sinking circles, offering, opening; title screen and learn-spell ceremony',
  keys: [
    // 0: still, wand upright before the chest
    k(0, { hp: [0, -0.02, 0], hr: [0, 0, 0], sp: [2, 0, 0], hd: [6, 0, 0], kL: [0.15, 0, 1], kR: [-0.15, 0, 1] }, fk(0), WAND_UP, LH_UNDER, { gL: G.soft, gR: G.wand }),
    // 1.5: rise, wand lifted high to the right, gaze follows; left hand opens low
    k(1.5, { hp: [-0.02, 0.0, 0], hr: [0, -12, 1], sp: [-6, -8, 3], hd: [-18, -16, 4] },
      ch(W([-0.28, 1.5, 0.12], [-0.3, 1, 0.2], [0.3, 0.2, 1])), ch(L([0.3, 0.92, 0.08], [0.6, -0.6, 0.2], [0, -0.6, 0.8])), { gL: G.open }),
    // 3.0: turned 60 deg left with two steps; wand flows down through the front to low left
    ...stepKeys('L', 1.7, 2.3, 0, 60, 0.05), ...stepKeys('R', 2.3, 2.9, 0, 60, 0.05),
    k(3.0, { hp: [0.02, -0.08, 0], hr: [0, 60, -2], sp: [12, 10, -2], hd: [10, 8, -2] },
      ch(W([0.12, 0.92, 0.3], [0.6, -0.3, 0.5], [0.4, -0.5, 0.6])), ch(L([0.3, 1.1, -0.02], [0.8, 0.3, -0.2], [0, -1, 0])), { gL: G.soft }),
    // 3.6-4.6: sinking, the wand draws a horizontal circle at chest height
    k(3.7, { hp: [0, -0.11, 0], sp: [8, 0, 0], hd: [6, 0, 0] }, ch(W([0.0, 1.12, 0.36], [0, 0.3, 1], [0.5, 1, 0]))),
    k(4.2, { hp: [-0.01, -0.12, 0], sp: [6, -10, 2], hd: [2, -10, 2] }, ch(W([-0.26, 1.12, 0.24], [-0.6, 0.3, 0.6], [0.5, 1, 0]))),
    k(4.7, { hp: [0, -0.1, 0], sp: [4, 0, 0], hd: [-4, 0, 0] }, ch(W([-0.12, 1.16, 0.06], [-0.2, 0.6, -0.4], [0.5, 1, 0]))),
    // 6.0: rise, turn back through front to 60 deg right; wand arcs overhead to high right, left arm extended
    ...stepKeys('R', 5.0, 5.55, 60, 0, 0.05), ...stepKeys('L', 5.55, 6.1, 60, 0, 0.05),
    ...stepKeys('R', 6.1, 6.6, 0, -60, 0.05), ...stepKeys('L', 6.6, 7.1, 0, -60, 0.05),
    k(6.0, { hp: [0, 0.005, 0], hr: [0, 0, 0], sp: [-8, -6, 2], hd: [-20, -6, 0] },
      ch(W([-0.12, 1.58, 0.12], [-0.1, 1, -0.1], [0.5, 0, 0.9])), ch(L([0.36, 1.2, 0.08], [1, 0.2, 0.1], [0, -1, 0])), { gL: G.open }),
    k(7.2, { hp: [-0.02, -0.03, 0], hr: [0, -60, 2], sp: [-2, -10, 4], hd: [-12, -14, 4] },
      ch(W([-0.33, 1.38, 0.12], [-0.8, 0.6, 0.1], [0, 0.2, 1])), ch(L([0.32, 1.06, 0.16], [0.7, -0.3, 0.6], [0, -0.7, 0.6]))),
    // 8.2: offering: wand presented horizontally forward in both hands, a slow bow
    k(8.3, { hp: [0, -0.05, -0.02], hr: [12, -60, 0], sp: [8, 0, 0], hd: [10, 0, 0] },
      ch(W([-0.1, 1.08, 0.33], [1, 0.05, 0.1], [0, 0.4, 1])), ch(L([0.12, 1.08, 0.33], [0, 0.3, 1], [0, 1, 0])), { gL: G.flat }),
    // 9.6: turn home to front, arms opening wide, face lifted
    ...stepKeys('L', 8.8, 9.3, -60, 0, 0.05), ...stepKeys('R', 9.3, 9.8, -60, 0, 0.05),
    k(9.9, { hp: [0, -0.01, 0], hr: [0, 0, 0], sp: [-8, 0, 0], hd: [-16, 0, 0] },
      ch(W([-0.36, 1.3, 0.12], [-0.6, 0.8, 0.2], [0, 0, 1])), ch(L([0.36, 1.3, 0.12], [1, 0.4, 0.1], [0, -0.2, 1])), { gL: G.open }),
    // 11: wand returns upright before the chest, gentle sway, settle
    k(11.0, { hp: [0.015, -0.025, 0], hr: [0, 6, -1], sp: [3, 4, -1], hd: [6, 4, -2] }, ch(W([-0.08, 1.12, 0.26], [0.05, 1, 0.15], [0.85, 0, 0.5])), ch(L([0.04, 1.02, 0.23], [-0.7, -0.2, 0.6], [0, 1, 0])), { gL: G.soft }),
  ],
  lag: { hd: 0.18, sp: 0.1, Rt: 0.12, Lp: 0.15, Lt: 0.2 }, breath: 0.5,
};

export const RITUAL = [
  { name: 'Bow', dur: 2.0, loop: false, upper: false, gohei: 'hide', desc: 'deep formal bow (about 45 deg) with hands on the thighs', marks: { down: 0.75, up: 1.45 },
    keys: [
      k(0, STAND, ARMS_DOWN),
      k(0.3, { sp: [0, 0, 0], hd: [6, 0, 0] }, THIGH_HANDS),
      k(0.75, { hp: [0, -0.01, -0.07], hr: [32, 0, 0], sp: [12, 0, 0], hd: [6, 0, 0], e: 'out' }),
      k(1.45, { hp: [0, -0.01, -0.07], hr: [33, 0, 0], sp: [12, 0, 0], hd: [8, 0, 0], e: 'io' }),
      k(1.75, { hp: [0.008, -0.012, 0], hr: [0, 0, 1.2], sp: [1, 0, -1], hd: [2, 0, 0] }, THIGH_HANDS),
      k(2.0, STAND, ARMS_DOWN),
    ], lag: { hd: 0.1, sp: 0.05 } },
  { name: 'Pray', dur: 3.6, loop: false, upper: false, gohei: 'hide', desc: 'shrine prayer: hands meet, two claps, a held moment with head bowed, then a bow', marks: { clap1: 0.85, clap2: 1.2, bow: 2.7 },
    keys: [
      k(0, STAND, ARMS_DOWN),
      k(0.5, { sp: [3, 0, 0], hd: [6, 0, 0], e: 'io' }, GASSHO),
      k(0.7, ch({ ...R([-0.03, 1.08, 0.19], [0, 1, 0.3], [1, 0, 0]), ...L([0.06, 1.12, 0.22], [0, 1, 0.2], [-1, 0, -0.2]) })),
      k(0.85, { e: 'out' }, GASSHO),
      k(1.03, ch({ ...R([-0.03, 1.08, 0.19], [0, 1, 0.3], [1, 0, 0]), ...L([0.06, 1.12, 0.22], [0, 1, 0.2], [-1, 0, -0.2]) })),
      k(1.2, { e: 'out' }, GASSHO),
      k(1.4, { sp: [8, 0, 0], hd: [18, 0, 0] }),
      k(2.3, { sp: [9, 0, 0], hd: [20, 0, 0], e: 'io' }, GASSHO),
      k(2.7, { hp: [0, -0.01, -0.05], hr: [24, 0, 0], sp: [10, 0, 0], hd: [8, 0, 0], e: 'io' }, THIGH_HANDS),
      k(3.15, { hp: [0, -0.01, -0.05], hr: [24, 0, 0], sp: [10, 0, 0], hd: [8, 0, 0], e: 'io' }),
      k(3.6, STAND, ARMS_DOWN, { e: 'io' }),
    ], lag: { hd: 0.08 } },
  kagura,
  { name: 'Offer', dur: 2.0, loop: false, upper: true, gohei: 'hide', desc: 'both hands held out palms up, presenting something, a small bow; hold at 0.6-1.4', marks: { hold: 0.6, give: 1.0 },
    keys: [
      k(0, STAND, ARMS_FREE),
      k(0.6, { sp: [10, 0, 0], hd: [14, 0, 0], hp: [0, -0.01, -0.02], e: 'out' }, L([0.08, 1.02, 0.32], [-0.25, 0.1, 1], [0, 1, 0]), R([-0.08, 1.02, 0.32], [0.25, 0.1, 1], [0, 1, 0]), { gL: G.cup, gR: G.cup }),
      k(1.4, { sp: [12, 0, 0], hd: [16, 0, 0] }, L([0.08, 1.03, 0.34], [-0.25, 0.1, 1], [0, 1, 0]), R([-0.08, 1.03, 0.34], [0.25, 0.1, 1], [0, 1, 0])),
      k(2.0, STAND, ARMS_FREE, { e: 'io' }),
    ], lag: { hd: 0.06, Lp: 0.03 } },
  { name: 'Kneel_Loop', dur: 3.0, loop: true, upper: false, gohei: 'hold', desc: 'down on the right knee, left foot planted, head hanging, heavy breathing (defeat / rest)',
    keys: [
      k(0, { hp: [0, -0.43, -0.02], hr: [8, 8, 0], sp: [22, -4, 0], hd: [26, 6, 0], FL: [0.05, 0, 0.25], FR: [-0.03, -0.06, -0.33], FLr: [0, 8, 0], FRr: [60, -6, 0], toeR: 50, kL: [0.2, 0.2, 1], kR: [-0.1, -1, 0.5] },
        L([0.1, 0.62, 0.32], [0.1, -1, 0.3], [-0.6, 0, -0.6]), W([-0.22, 0.42, 0.18], [0, 0.2, 1], [0, -1, 0.1]), { gL: G.relax, gR: G.wand }),
      k(1.5, { hp: [0, -0.44, -0.02], sp: [24, -4, 0], hd: [28, 6, 0] }),
    ], breath: 3.0, breathPer: 1.5, lag: { hd: 0.2 } },
];
