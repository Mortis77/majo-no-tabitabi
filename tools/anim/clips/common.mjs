// Shared poses and helpers for clip authoring. Root space: +X her left, +Y up, +Z front. Right hand x < 0.
import { G } from '../synth.mjs';
export { G };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** left hand: wrist p, finger direction f, palm-facing direction palm -> {Lp, Lf, Lt} */
export const L = (p, f, palm, extra = {}) => ({ Lp: p, Lf: f, Lt: cross(palm, f), ...extra });
/** right hand: wrist p, finger (knuckle) direction f, palm-facing direction -> {Rp, Rf, Rt} */
export const R = (p, f, palm, extra = {}) => ({ Rp: p, Rf: f, Rt: cross(f, palm), ...extra });
/** right fist holding the gohei: wrist p, wand direction w, knuckle direction k (perpendicular-ish to w) */
export const W = (p, w, k, extra = {}) => ({ Rp: p, Rt: w, Rf: k, ...extra });
/** left fist / grip with thumb side direction t */
export const LW = (p, t, k, extra = {}) => ({ Lp: p, Lt: t, Lf: k, ...extra });

// ankle offsets for a stance turned by yaw deg (positions relative to rest ankles), optional extra offsets
const ANK = { L: [0.043, 0.129, -0.024], R: [-0.044, 0.129, -0.024] };
export function feetAt(yaw, l = [0, 0, 0], r = [0, 0, 0]) {
  const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
  const rot = (p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  const pl = rot([ANK.L[0] + l[0], ANK.L[1] + l[1], ANK.L[2] + l[2]]), pr = rot([ANK.R[0] + r[0], ANK.R[1] + r[1], ANK.R[2] + r[2]]);
  return { FL: [pl[0] - ANK.L[0], pl[1] - ANK.L[1], pl[2] - ANK.L[2]], FR: [pr[0] - ANK.R[0], pr[1] - ANK.R[1], pr[2] - ANK.R[2]], FLr: [0, yaw, 0], FRr: [0, yaw, 0] };
}

// ---- stances ----
export const STAND = { hp: [0.008, -0.012, 0], hr: [0, 0, 1.2], sp: [1, 0, -1], hd: [0, 0, 0], FL: [0.012, 0, 0.012], FR: [-0.01, 0, -0.008], FLr: [0, 6, 0], FRr: [0, -8, 0], kL: [0.15, 0, 1], kR: [-0.15, 0, 1] };
export const CAST = { hp: [0.0, -0.035, 0], hr: [0, -12, 0], sp: [4, 10, 0], hd: [0, 2, 0], FL: [0.04, 0, 0.07], FR: [-0.05, 0, -0.08], FLr: [0, 6, 0], FRr: [0, -22, 0] };
export const WIDE = { hp: [0, -0.07, 0], hr: [0, 0, 0], FL: [0.08, 0, 0.02], FR: [-0.08, 0, 0.0], FLr: [0, 14, 0], FRr: [0, -14, 0] };

// ---- arm poses ----
// hands relaxed at the sides; right fist holds the wand pointing forward-down
export const ARMS_DOWN = { Lsp: 'root', Rsp: 'root', Lpole: [0.4, -0.3, -1], Rpole: [-0.4, -0.3, -1], ...L([0.19, 0.88, 0.04], [0.08, -1, 0.12], [-1, 0, 0.1]), ...W([-0.19, 0.89, 0.06], [0.05, -0.45, 1], [0.05, -1, -0.2]), gL: G.relax, gR: G.wand };
// casting ready: wand up and a little forward in front of the right hip/chest, left hand loose in front
export const READY = { Lsp: 'root', Rsp: 'root', Lpole: [0.4, -0.3, -1], Rpole: [-0.4, -0.3, -1], ...W([-0.19, 1.0, 0.17], [0.05, 1, 0.35], [0.35, -0.1, 1]), ...L([0.17, 0.98, 0.14], [0.1, -0.4, 1], [-0.7, -0.3, 0.2]), gL: G.soft, gR: G.wand };
// NPC hands-free relaxed (no wand)
export const ARMS_FREE = { Lsp: 'root', Rsp: 'root', Lpole: [0.4, -0.3, -1], Rpole: [-0.4, -0.3, -1], ...L([0.19, 0.88, 0.04], [0.08, -1, 0.12], [-1, 0, 0.1]), ...R([-0.19, 0.88, 0.04], [-0.08, -1, 0.12], [1, 0, 0.1]), gL: G.relax, gR: G.relax };
const HOME = { Lsp: 'root', Rsp: 'root', Lpole: [0.4, -0.3, -1], Rpole: [-0.4, -0.3, -1] };
export const pose = (...a) => Object.assign({}, ...a);
