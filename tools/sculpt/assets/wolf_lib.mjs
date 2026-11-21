// wolf_lib — the shade wolf (影狼 / 胧牙) sculpted on the ani_wolf skeleton. Shapes, paint, and the post step.
// Bind pose, game metres (the pack model's Root wrapper already scales it), +Z front, feet on y = 0.
// Joints that fix the flesh (bind pose, +x side):
//   shoulder (0.087, 0.387, 0.308)  elbow (0.087, 0.296, 0.280)  wrist (0.087, 0.058, 0.338)  toes (0.087, 0.020, 0.370)
//   hip      (0.091, 0.466,-0.104)  stifle (0.091, 0.353,-0.039) hock (0.091, 0.214,-0.271)  heel (0.091, 0.051,-0.212)
//   neck 0.496/0.359 -> head joint (0, 0.563, 0.556), muzzle axis forward and ~15 deg down; ears Ear1 at (0.060, 0.611, 0.564)
//   tail bones run straight back at y ~0.5 from z -0.158 to z -0.655 (Tail1..Tail8)
import * as P from '../sdf.mjs';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]), norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export { V };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function tree(list, k = 0) {
  if (list.length === 1) return list[0];
  const m = list.length >> 1, a = tree(list.slice(0, m), k), b = tree(list.slice(m), k);
  return k ? P.softUnion(k, a, b) : P.union(a, b);
}

// ------------------------------------------------------------------------------------------------ the lock: a brush stroke
// A lock of shade-fur: a flattened stroke from root a to tip b. Thin along `thin` (flat < 1), its centre line lifting toward
// `lift` by curl x length x h^2 (the flick of a brush leaving the paper). Radius R * prof(h). Recorded in LOCKS for paint.
export const LOCKS = [];
const brush = (h) => Math.max(0.05, Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * h)), 0.55) * (1 - 0.2 * h));
const stroke = (h) => Math.max(0.05, Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * h)), 0.8) * (1 - 0.25 * h));
function lock(a, b, R, { thin = [1, 0, 0], flat = 0.45, lift = [0, 1, 0], curl = 0.15, prof = stroke, kind = 'mane' } = {}) {
  const ax = V.sub(b, a), L = V.len(ax), t = V.mul(ax, 1 / L);
  const nn = V.norm(V.sub(thin, V.mul(t, V.dot(thin, t))));   // flat axis
  const w = V.cross(t, nn);                                     // broad axis
  let lf = V.sub(lift, V.mul(t, V.dot(lift, t))); lf = V.norm(lf);
  const lv = V.dot(lf, nn) * curl * L, lw = V.dot(lf, w) * curl * L;
  const k = flat * 0.85;
  const f = (x, y, z) => {
    const dx = x - a[0], dy = y - a[1], dz = z - a[2];
    const u = dx * t[0] + dy * t[1] + dz * t[2];
    const h = u <= 0 ? 0 : u >= L ? 1 : u / L;
    const v = dx * nn[0] + dy * nn[1] + dz * nn[2] - lv * h * h;
    const ww = dx * w[0] + dy * w[1] + dz * w[2] - lw * h * h;
    return (Math.hypot(Math.hypot(v / flat, ww), u - h * L) - R * prof(h)) * k;
  };
  const m = R + Math.abs(curl * L) + 0.006;
  const bb = [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m];
  LOCKS.push({ a, t, nn, w, L, R, flat, lv, lw, prof, kind });
  return new P.Shape(f, bb, null, 1.25);
}
/** how far along its own lock a surface point lies (0 root .. 1 tip); -1 if no lock owns it */
export function lockParam(x, y, z, kinds = null) {
  let best = -1, bk = null;
  for (const l of LOCKS) {
    if (kinds && !kinds.includes(l.kind)) continue;
    const dx = x - l.a[0], dy = y - l.a[1], dz = z - l.a[2];
    const u = dx * l.t[0] + dy * l.t[1] + dz * l.t[2];
    if (u < -0.01 || u > l.L + 0.01) continue;
    const h = clamp(u / l.L, 0, 1);
    const v = dx * l.nn[0] + dy * l.nn[1] + dz * l.nn[2] - l.lv * h * h, ww = dx * l.w[0] + dy * l.w[1] + dz * l.w[2] - l.lw * h * h;
    const d = Math.hypot(Math.hypot(v / l.flat, ww), u - h * l.L) - l.R * l.prof(h);
    if (d < 0.005 && h > best) { best = h; bk = l.kind; }
  }
  return { h: best, kind: bk };
}

// march down from above (or inward from the side) to the surface of a shape
function dropTo(shape, x, z, y0 = 0.9) { let y = y0; for (let i = 0; i < 80; i++) { const d = shape.d(x, y, z); if (d < 0.0008) break; y -= Math.max(d * 0.8, 0.0008); } return [x, y, z]; }
function inTo(shape, y, z, x0 = 0.3) { let x = x0; for (let i = 0; i < 80; i++) { const d = shape.d(x, y, z); if (d < 0.0008) break; x -= Math.max(d * 0.8, 0.0008); } return [x, y, z]; }

// ------------------------------------------------------------------------------------------------------------- tail
// The bones run straight back at y ~0.5; the flesh hangs: a heavy brush that drops from the root and sweeps down and back,
// so the silhouette is a wolf's carried tail, not the pack dog's stick. Skin weights by slab (see TAIL_SLABS).
export const TAIL_PTS = [[0, 0.535, -0.13], [0, 0.525, -0.24], [0, 0.5, -0.36], [0, 0.465, -0.475], [0, 0.43, -0.58], [0, 0.405, -0.66]];
export const TAIL_R = (t) => Math.max(0.004, 0.036 + 0.058 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05) ** 0.85), 1.1) - 0.03 * t * t);
// bone heads of Tail2..Tail8 (z); slab k (Tail(k+1) -> Tail(k+2)) blends across the head of Tail(k+2)
const TH = [-0.158, -0.201, -0.294, -0.388, -0.451, -0.530, -0.587, -0.655];
export const TAIL_SLABS = (() => {
  const s = [];
  for (let k = 0; k < 7; k++) {
    const c = TH[k + 1], zHi = k === 0 ? -0.185 : (TH[k] + TH[k + 1]) / 2, zLo = k === 6 ? -1.2 : (TH[k + 1] + TH[k + 2]) / 2;
    s.push({ name: 'tail' + (k + 1), from: 'Tail' + (k + 1), to: 'Tail' + (k + 2), zHi, zLo, c });
  }
  return s;
})();

// --------------------------------------------------------------------------------------------------------- the body
// The head is modelled level, then pitched down HEAD_PITCH degrees about the Head joint: a lower, hunting carriage.
export const HEAD_PIVOT = [0, 0.563, 0.556];
export const HEAD_PITCH = 8;
const HP = HEAD_PITCH * Math.PI / 180;
/** head-model space -> bind space (sign 1) or back (sign -1) */
export function rotHead(p, sign = 1) {
  const c = Math.cos(HP * sign), s = Math.sin(HP * sign), y = p[1] - HEAD_PIVOT[1], z = p[2] - HEAD_PIVOT[2];
  return [p[0], HEAD_PIVOT[1] + c * y - s * z, HEAD_PIVOT[2] + s * y + c * z];
}
const hd = (shape) => shape.at(-HEAD_PIVOT[0], -HEAD_PIVOT[1], -HEAD_PIVOT[2]).turn(HEAD_PITCH, 0, 0).at(...HEAD_PIVOT);
// eyes: long narrow almonds slanted up and back, sunk under a ledge of brow; a hot core bead in each (pupil glow)
export const EYE = { c: [0.04, 0.616, 0.636], r: [0.026, 0.0066, 0.011], tilt: [6, 38, 16] };
export const CORE = { c: [0.044, 0.6164, 0.6411], r: [0.019, 0.0036, 0.0062] };
// the snarl: lip line dips at the fangs and curls up and back to a high corner
export const MOUTH = [[0.012, 0.556, 0.718], [0.021, 0.552, 0.697], [0.03, 0.556, 0.668], [0.04, 0.559, 0.637], [0.047, 0.556, 0.608]];
// the glowing gape is only the front of the lip line, between the fangs; behind it the lips close in a dark seam
const GAPE = MOUTH.slice(0, 3);
export const EYE_BIND = rotHead(EYE.c), CORE_BIND = rotHead(CORE.c), EYE_R = Math.max(...EYE.r);

export function buildWolf(S, rig, { lod = false } = {}) {
  LOCKS.length = 0;
  const R = rng(77);
  const fur = { mat: 'body', paint: paintFur };
  // ---- trunk: a deep keeled chest that hangs below the elbows, high withers, a waist pinched thin, strong croup
  const ribs = S.ellipsoid([0.096, 0.178, 0.19]).turn(-6, 0, 0).at(0, 0.466, 0.2);
  const brisket = S.ellipsoid([0.07, 0.112, 0.078]).turn(20, 0, 0).at(0, 0.392, 0.33);
  const keel = S.ellipsoid([0.054, 0.062, 0.14]).turn(-12, 0, 0).at(0, 0.33, 0.225);
  const withers = S.ellipsoid([0.052, 0.05, 0.11]).at(0, 0.618, 0.27);
  const scap = S.ellipsoid([0.03, 0.105, 0.058]).turn(-24, 0, 7).at(0.078, 0.52, 0.3).mirror('x');
  const loin = S.ellipsoid([0.05, 0.046, 0.13]).at(0, 0.55, -0.01);
  const croup = S.ellipsoid([0.076, 0.07, 0.085]).turn(10, 0, 0).at(0, 0.515, -0.115);
  let trunk = S.softUnion(0.05, ribs, brisket, keel, withers).softAdd(scap, 0.035).softAdd(loin, 0.06).softAdd(croup, 0.06);
  // the tuck: belly cut up hard behind the ribs, flank hollows either side
  trunk = trunk.softCut(S.ellipsoid([0.13, 0.085, 0.11]).at(0, 0.39, -0.03), 0.04);
  trunk = trunk.softCut(S.ellipsoid([0.045, 0.06, 0.08]).at(0.098, 0.465, -0.01).mirror('x'), 0.035);
  // ---- neck: thick, carried lower and more forward; the mane hides its top line
  const neck = S.tube([[0, 0.5, 0.29], [0, 0.54, 0.41], [0, 0.57, 0.52]], (t) => 0.084 - 0.024 * t, { aspect: 0.82 });
  trunk = trunk.softAdd(neck, 0.05);
  // ---- haunches: big thigh over the hip, buttock behind
  const thigh = S.ellipsoid([0.046, 0.105, 0.078]).turn(-14, 0, 0).at(0.088, 0.415, -0.085)
    .softAdd(S.taperedCapsule([0.09, 0.45, -0.1], [0.092, 0.36, -0.048], 0.05, 0.034), 0.03).mirror('x');
  trunk = trunk.softAdd(thigh, 0.04);
  // ---- forelimb: a heavy upper arm under the scapula, elbow point, a strong forearm, knobbed wrist, broad pastern
  const arm = S.softUnion(0.02,
    S.taperedCapsule([0.08, 0.46, 0.31], [0.088, 0.305, 0.272], 0.052, 0.036),
    S.sphere(0.024).at(0.087, 0.3, 0.252),
  ).mirror('x');
  trunk = trunk.softAdd(arm, 0.035);
  trunk = trunk.part('fur', fur);
  const fore = S.softUnion(0.014,
    S.taperedCapsule([0.088, 0.295, 0.276], [0.087, 0.078, 0.333], 0.037, 0.023),
    S.ellipsoid([0.032, 0.07, 0.036]).turn(-6, 0, 0).at(0.088, 0.232, 0.29),
    S.sphere(0.025).at(0.087, 0.07, 0.334),
    S.taperedCapsule([0.087, 0.07, 0.336], [0.087, 0.032, 0.362], 0.023, 0.025),
  ).mirror('x').part('foreleg', fur);
  // ---- hindlimb: gaskin muscle, long shank to a sharp hock, metatarsus straight to the paw
  const hind = S.softUnion(0.014,
    S.taperedCapsule([0.091, 0.355, -0.05], [0.091, 0.226, -0.258], 0.036, 0.02),
    S.ellipsoid([0.03, 0.062, 0.036]).turn(-55, 0, 0).at(0.091, 0.31, -0.115),
    S.sphere(0.019).at(0.091, 0.222, -0.283),
    S.taperedCapsule([0.091, 0.22, -0.27], [0.091, 0.042, -0.208], 0.019, 0.019),
  ).mirror('x').part('hindleg', fur);
  // ---- paws: big (the fore paws broader still), four toes, hooked claws
  const paw = (cx, cz, s) => {
    const parts = [S.ellipsoid([0.03 * s, 0.022 * s, 0.04 * s]).at(cx, 0.021 * s, cz)];
    for (const [ox, oz, sc] of [[-0.024, 0.024, 0.85], [-0.009, 0.036, 1], [0.009, 0.036, 1], [0.024, 0.024, 0.85]]) {
      const tx = cx + ox * s, tz = cz + oz * s;
      parts.push(S.ellipsoid([0.0105 * s * sc, 0.0115 * s, 0.015 * s * sc]).at(tx, 0.0115 * s, tz));
    }
    return S.softUnion(0.008, ...parts);
  };
  const claws = (cx, cz, s) => {
    const c = [];
    for (const [ox, oz, sc] of [[-0.025, 0.036, 0.85], [-0.0095, 0.05, 1], [0.0095, 0.05, 1], [0.025, 0.036, 0.85]]) {
      const tx = cx + ox * s, tz = cz + oz * s;
      c.push(S.taperedCapsule([tx, 0.016 * s, tz - 0.006], [tx + ox * 0.15, 0.003, tz + 0.016 * s * sc], 0.0048 * s, 0.0022));
    }
    return S.union(...c);
  };
  const FP = 1.32, HPW = 1.12;
  const paws = S.union(paw(0.087, 0.37, FP), paw(0.091, -0.18, HPW)).mirror('x').part('paw', { mat: 'body', paint: paintPaw });
  const clawSet = S.union(claws(0.087, 0.37, FP), claws(0.091, -0.18, HPW)).mirror('x').part('claw', { mat: 'body', paint: paintClaw });

  // ---- head (modelled level, then pitched by hd()): long wedge skull, a hard brow ledge, cheekbones, deep jaw,
  //      a tapered muzzle with a clear stop, snarl wrinkles, a lip line pulled back
  const skull = S.ellipsoid([0.052, 0.057, 0.078]).at(0, 0.612, 0.566);
  // the brow: a hard ridge whose inner end drops into the stop (a scowl), outer end lifting back over the slanted eye
  const browL = S.ellipsoid([0.03, 0.0085, 0.022]).turn(10, 34, 22).at(0.03, 0.634, 0.638).mirror('x');
  const cheek = S.ellipsoid([0.016, 0.014, 0.042]).turn(0, 12, 0).at(0.049, 0.598, 0.585).mirror('x');
  const muzzle = S.taperedCapsule([0, 0.598, 0.632], [0, 0.585, 0.73], 0.031, 0.0155);
  const bridge = S.roundBox([0.03, 0.03, 0.1], 0.01).turn(6, 0, 0).at(0, 0.598, 0.672);
  const jaw = S.taperedCapsule([0, 0.548, 0.565], [0, 0.55, 0.71], 0.031, 0.0145);
  const masseter = S.ellipsoid([0.025, 0.031, 0.036]).at(0.044, 0.565, 0.563).mirror('x');
  let head = S.softUnion(0.022, skull, cheek, masseter).softAdd(S.softUnion(0.012, muzzle, bridge), 0.022)
    .softAdd(browL, 0.01).softAdd(jaw, 0.02);
  // the muzzle tapers: side planes converge toward the nose
  head = head.softCut(S.box([0.06, 0.12, 0.2]).turn(0, -7, -8).at(0.06, 0.6, 0.71).mirror('x'), 0.008);
  // the stop: a deep step between the brows down onto the bridge, and a frown furrow up the forehead
  head = head.softCut(S.ellipsoid([0.015, 0.012, 0.022]).at(0, 0.632, 0.66), 0.007);
  head = head.cut(S.taperedCapsule([0, 0.648, 0.645], [0, 0.664, 0.6], 0.0035, 0.002));
  // snarl wrinkles on the bridge sides
  for (const [z, k] of [[0.676, 1], [0.694, 0.85]]) head = head.cut(S.taperedCapsule([0.019, 0.611, z], [0.031, 0.588, z + 0.006], 0.0026 * k, 0.0016).mirror('x'));
  // the lip line, gaping at the fangs
  head = head.cut(S.tube(MOUTH, (t) => 0.0056 - 0.0032 * t).mirror('x'));
  // eye sockets: deep, under the brow ledge
  head = head.softCut(S.ellipsoid([0.03, 0.0095, 0.016]).turn(...EYE.tilt).at(EYE.c[0] + 0.005, EYE.c[1] - 0.001, EYE.c[2] + 0.002).mirror('x'), 0.004);
  head = hd(head).part('head', { mat: 'body', paint: paintHead, blend: { from: 'Neck3', to: 'Head', width: 0.06 } });
  const nose = hd(S.ellipsoid([0.0165, 0.0135, 0.0135]).at(0, 0.586, 0.737).cut(S.ellipsoid([0.0042, 0.004, 0.006]).at(0.007, 0.584, 0.749).mirror('x')))
    .part('nose', { mat: 'body', paint: () => S.color('#5e5672') });
  const eyes = hd(S.ellipsoid(EYE.r).turn(...EYE.tilt).at(...EYE.c).mirror('x')).part('eye', { mat: 'eye', paint: () => S.color('#ff4a86'), bone: 'Head' });
  const cores = hd(S.ellipsoid(CORE.r).turn(...EYE.tilt).at(...CORE.c).mirror('x')).part('core', { mat: 'eye', paint: () => S.color('#fff2f8'), bone: 'Head' });
  const ember = hd(S.tube(GAPE, (t) => 0.0042 - 0.0012 * t).at(-0.0022, 0.0002, -0.0012).mirror('x')).part('ember', { mat: 'ember', paint: () => S.color('#ff7a8a'), bone: 'Head' });
  // fangs: an upper and a lower canine each side, crossing the gaping lip line
  const fangs = hd(S.union(
    S.taperedCapsule([0.0172, 0.566, 0.702], [0.0192, 0.54, 0.707], 0.0047, 0.0009),
    S.taperedCapsule([0.0205, 0.547, 0.686], [0.0218, 0.571, 0.681], 0.0042, 0.0009),
  ).mirror('x')).part('fang', { mat: 'body', paint: paintFang, bone: 'Head' });
  // ears: swept flat back and out, cupped, pointed
  const ear = (() => {
    const a = rotHead([0.046, 0.625, 0.57]), b = rotHead([0.096, 0.69, 0.462]);
    let e = lock(a, b, 0.034, { thin: [0.6, 0.35, 0.72], flat: 0.36, lift: [0, 0, -1], curl: 0.12, prof: (h) => Math.max(0.06, Math.pow(1 - h, 0.85) * Math.min(1, 0.55 + h * 3)), kind: 'ear' });
    e = e.softCut(hd(S.ellipsoid([0.007, 0.032, 0.015]).turn(-36, 0, -22).at(0.072, 0.664, 0.545)), 0.006);
    return e.mirror('x');
  })().part('ear', { mat: 'body', paint: paintEar, blend: { from: 'Head', to: 'Ear1.{side}', width: 0.03 } });

  // ---- the mane: torn brush strokes along neck and spine; big at nape and withers, smaller down the back, a few at the croup
  const base = trunk.softAdd(head, 0.03);
  const manes = [];
  // dorsal row: [z, length, radius, side splay, up angle]
  const row = [
    [0.47, 0.11, 0.028, -0.25, 22],
    [0.405, 0.175, 0.05, 0.32, 23], [0.335, 0.19, 0.056, -0.34, 23], [0.262, 0.18, 0.052, 0.3, 22], [0.19, 0.155, 0.042, -0.24, 19],
    [0.122, 0.12, 0.027, 0.16, 18], [0.062, 0.105, 0.023, -0.2, 16], [0.008, 0.088, 0.019, 0.12, 15],
    [-0.045, 0.058, 0.014, -0.14, 13], [-0.088, 0.046, 0.012, 0.1, 13], [-0.118, 0.036, 0.0105, -0.08, 14],
  ];
  const skip = lod ? new Set([7, 9]) : new Set();   // LOD: two small strokes go
  row.forEach(([z, L, r, sp, up], i) => {
    if (skip.has(i)) return;
    const j = 0.85 + R() * 0.3;
    const root = dropTo(base, sp * 0.03, z);
    const a = [root[0], root[1] - 0.012, root[2]];
    const ang = up * Math.PI / 180, dir = V.norm([sp * 0.35, Math.sin(ang), -Math.cos(ang)]);
    const b = V.add(a, V.mul(dir, L * j));
    manes.push(lock(a, b, r, { thin: [1, 0, -0.1 * Math.sign(sp)], flat: 0.34, lift: [sp * 0.4, 1, 0], curl: 0.2 + R() * 0.1, prof: brush }));
    // a fork on the big ones: a second, shorter stroke torn off to the other side
    if (L > 0.17 && !lod) {
      const d2 = V.norm([-sp * 0.6, Math.sin(ang * 0.7), -Math.cos(ang * 0.7)]);
      manes.push(lock(V.add(a, [0, 0.004, -0.01]), V.add(a, V.mul(d2, L * 0.55)), r * 0.7, { thin: [1, 0, 0], flat: 0.36, lift: [0, 1, 0], curl: 0.24, prof: brush }));
    }
  });
  // neck sides: two staggered rows of strokes lying back along the neck, out over the shoulder
  const side = [[0.5, 0.585, 0.11, 0.019], [0.455, 0.56, 0.13, 0.021], [0.41, 0.535, 0.14, 0.022], [0.365, 0.51, 0.13, 0.02],
    [0.47, 0.63, 0.12, 0.018], [0.42, 0.61, 0.135, 0.02], [0.37, 0.59, 0.13, 0.019]];
  const sideL = lod ? side.filter((_, i) => i % 2 === 0) : side;
  for (const s of [1, -1]) sideL.forEach(([z, y, L, r], i) => {
    const jit = (R() - 0.5) * 0.02;
    const root = inTo(base, y + jit, z, 0.25 * s >= 0 ? 0.25 : -0.25);
    const a = s > 0 ? inTo(base, y + jit, z, 0.25) : (() => { let x = -0.25; for (let k = 0; k < 80; k++) { const d = base.d(x, y + jit, z); if (d < 0.0008) break; x += Math.max(d * 0.8, 0.0008); } return [x, y + jit, z]; })();
    void root;
    if (!Number.isFinite(a[0]) || Math.abs(a[0]) > 0.2 || Math.abs(base.d(a[0], a[1], a[2])) > 0.003) return;   // the ray missed the neck
    const a2 = [a[0] - 0.01 * s, a[1], a[2]];
    const dir = V.norm([0.32 * s, -0.12 - 0.12 * (i % 2), -1]);
    manes.push(lock(a2, V.add(a2, V.mul(dir, L * (0.85 + R() * 0.3))), r * 1.2, { thin: [s, 0.2, 0], flat: 0.3, lift: [s * 0.7, 0.3, 0], curl: 0.22 }));
  });
  // cheek ruff: three strokes per side from behind the jaw, swept back and down
  for (const s of [1, -1]) [[0.555, 0.548, 0.09, 0.016, -0.25], [0.53, 0.575, 0.1, 0.017, 0.0], [0.545, 0.52, 0.08, 0.014, -0.5]].forEach(([z, y, L, r, dn]) => {
    const a = rotHead([0.045 * s, y, z]);
    const dir = V.norm([0.45 * s, dn * 0.5, -1]);
    manes.push(lock(a, V.add(a, V.mul(dir, L)), r * 1.15, { thin: [s, 0.1, 0.2], flat: 0.32, lift: [s, 0.2, 0], curl: 0.24, kind: 'ruff' }));
  });
  // throat ruff: strokes hanging from the throat down the brisket
  [[0.0, 0.5, 0.49, 0.085, 0.026], [0.024, 0.465, 0.44, 0.08, 0.025], [-0.02, 0.44, 0.405, 0.075, 0.023]].forEach(([x, y, z, L, r]) => {
    const a = [x, y, z];
    const dir = V.norm([x * 2, -1, -0.15]);
    manes.push(lock(a, V.add(a, V.mul(dir, L)), r, { thin: [1, 0, 0], flat: 0.36, lift: [0, 0, 1], curl: 0.25, prof: brush, kind: 'ruff' }));
  });
  // elbow and hock feathers: one small stroke trailing back from each
  for (const s of [1, -1]) {
    manes.push(lock([0.09 * s, 0.305, 0.26], [0.096 * s, 0.27, 0.205], 0.012, { thin: [1, 0, 0], flat: 0.45, lift: [0, -1, 0], curl: 0.2, kind: 'tuft' }));
    manes.push(lock([0.091 * s, 0.235, -0.285], [0.093 * s, 0.205, -0.33], 0.01, { thin: [1, 0, 0], flat: 0.45, lift: [0, -1, 0], curl: 0.2, kind: 'tuft' }));
  }
  const mane = tree(manes).part('mane', { mat: 'body', paint: paintMane });

  // ---- tail: heavy brush with torn strokes along its top and sides
  const tailCore = S.tube(TAIL_PTS, TAIL_R);
  const tl = [];
  const tN = lod ? 6 : 11;
  for (let i = 0; i < tN; i++) {
    const t = 0.15 + (i / (tN - 1)) * 0.72;
    const p = tubeAt(TAIL_PTS, t), p2 = tubeAt(TAIL_PTS, Math.min(1, t + 0.05)), T = V.norm(V.sub(p2, p));
    const sideS = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : -1;
    const nrm = V.norm([sideS * 0.9, sideS === 0 ? 1 : 0.35, 0]);
    const a = V.add(p, V.mul(nrm, TAIL_R(t) * 0.55));
    const L = 0.08 + 0.05 * Math.sin(Math.PI * t) + R() * 0.02;
    const dir = V.norm(V.add(V.mul(T, 1), V.mul(nrm, 0.16)));
    tl.push(lock(a, V.add(a, V.mul(dir, L)), 0.022 + 0.014 * Math.sin(Math.PI * t), { thin: nrm, flat: 0.34, lift: nrm, curl: 0.22, prof: brush, kind: 'tail' }));
  }
  // the tip: two strokes torn apart
  const tp = TAIL_PTS[TAIL_PTS.length - 1];
  tl.push(lock(V.add(tp, [0, 0.02, 0.045]), V.add(tp, [0.02, -0.03, -0.045]), 0.02, { thin: [1, 0, 0], flat: 0.45, lift: [0, -1, 0], curl: 0.15, kind: 'tail' }));
  tl.push(lock(V.add(tp, [0, 0.025, 0.04]), V.add(tp, [-0.018, 0.005, -0.055]), 0.019, { thin: [1, 0, 0], flat: 0.45, lift: [0, 1, 0], curl: 0.15, kind: 'tail' }));
  const tailAll = tailCore.softAdd(tree(tl), 0.012);
  const tailParts = TAIL_SLABS.map((sl) => tailAll.intersect(S.boxFromTo([-0.3, 0.1, sl.zLo, 0.3, 0.8, sl.zHi]))
    .part(sl.name, { mat: 'body', paint: paintTail, blend: { from: sl.from, to: sl.to, width: 0.05 } }));
  const tailRoot = tailAll.intersect(S.boxFromTo([-0.3, 0.1, -0.185, 0.3, 0.8, 0.0])).part('tailroot', { mat: 'body', paint: paintTail });

  // ---- assemble (softAdd joins the flesh; eyes / ember / claws sit in sockets)
  let wolf = trunk.softAdd(head, 0.03).softAdd(fore, 0.03).softAdd(hind, 0.035).softAdd(paws, 0.012).softAdd(mane, 0.012);
  wolf = wolf.softAdd(tailRoot.add(tree(tailParts)), 0.025);
  wolf = wolf.softAdd(ear, 0.012).add(nose).add(clawSet).add(fangs).add(eyes).add(cores).add(ember);
  return wolf;
}

export function tubeAt(pts, t) {
  const n = pts.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f));
  return V.lerp(pts[i], pts[i + 1], f - i);
}

// ------------------------------------------------------------------------------------------------------------- paint
// The game multiplies these by the 'shade' tint (body 0x1f1238, cel ramp and a breathing violet rim), so the paint is a
// VALUE map in cool lavender: lit planes near 1, ink pooling darker toward the paws and in the mane's roots, the stroke
// tips lightest (the ink-flame catches the rim). Raw colours read as a pale violet-grey wolf in the kit's sheets.
const C = {
  hi: P.color('#efeaf7'), mid: P.color('#cfc6e0'), low: P.color('#a99fc0'), ink: P.color('#7e7398'), deep: P.color('#5d5379'),
};
// A designed saddle: ink laid over the back from the withers to the croup, its lower edge torn like a dry brush stroke.
function saddle(x, y, z) {
  const edge = 0.535 + 0.014 * Math.sin(z * 47 + 0.6) + 0.008 * Math.sin(z * 113) + 0.03 * P.ss(0.25, 0.42, z) + 0.02 * P.ss(-0.05, -0.15, z);
  return P.ss(edge - 0.012, edge + 0.008, y) * P.ss(-0.17, -0.08, z) * P.ss(0.42, 0.33, z);
}
function paintFur(c) {
  const { x, y, z, ny, cavity, edge } = c;
  let col = P.mix(C.mid, C.hi, P.ss(-0.2, 0.7, ny) * 0.6);
  // the chest and throat lighter
  col = P.mix(col, C.hi, P.ss(0.2, 0.4, z) * P.ss(0.45, 0.32, y) * 0.5);
  // the saddle
  col = P.mix(col, C.ink, saddle(x, y, z) * 0.85);
  // ink settles downward: the legs darken toward the paws
  col = P.mix(col, C.ink, P.ss(0.3, 0.08, y) * 0.7);
  col = P.mix(col, C.hi, edge * 0.3);
  return P.mix(col, C.deep, cavity * 0.18);
}
function paintPaw(c) { return P.mix(C.ink, C.deep, P.ss(0.03, 0.0, c.y) * 0.6 + c.cavity * 0.3); }
function paintClaw(c) { return P.mix(P.color('#e4ddef'), C.mid, P.ss(0.0, 0.02, c.y)); }
function paintFang(c) { const q = rotHead([c.x, c.y, c.z], -1); return P.mix(P.color('#f6f1fa'), P.color('#cfc6e0'), P.ss(0.552, 0.566, q[1]) * P.ss(0.7, 0.71, q[2]) * 0.6); }
function paintHead(c) {
  const { ny, nz, cavity, edge } = c;
  const [x, y, z] = rotHead([c.x, c.y, c.z], -1);
  let col = P.mix(C.mid, C.hi, P.ss(-0.1, 0.8, ny) * 0.7);
  // jaw and throat a step darker, the bridge catching light
  col = P.mix(col, C.low, P.ss(0.575, 0.535, y) * 0.45);
  col = P.mix(col, C.hi, P.ss(0.6, 0.9, nz) * 0.2);
  // the mask: an ink band through the eyes, sweeping back and up over the brow into the crest; the bridge between stays pale
  const ax = Math.abs(x);
  // the hood: brow, eyes, forehead and skull in ink down to a clean edge at the stop and along the cheek; muzzle and jaw pale
  const hood = P.ss(0.598, 0.608, y - 0.22 * (z - 0.64)) * P.ss(0.674, 0.662, z);
  void ax; col = P.mix(col, C.ink, hood * 0.85);
  col = P.mix(col, C.deep, P.ss(0.715, 0.735, z) * 0.6);   // muzzle tip ink-dipped
  col = P.mix(col, C.hi, edge * 0.4);
  return P.mix(col, C.deep, cavity * 0.4);
}
function paintEar(c) {
  const lp = lockParam(c.x, c.y, c.z, ['ear']);
  let col = P.mix(C.mid, C.ink, P.ss(0.4, 1.0, lp.h) * 0.6);
  return P.mix(col, C.deep, c.cavity * 0.5);
}
function paintMane(c) {
  const lp = lockParam(c.x, c.y, c.z);
  const h = lp.h < 0 ? 0 : lp.h;
  // root ink-dark, tip pale: the ink-flame
  let col = P.mix(C.ink, C.low, P.ss(0.0, 0.45, h));
  col = P.mix(col, C.hi, P.ss(0.5, 0.95, h));
  col = P.mix(col, C.hi, c.edge * 0.35);
  return P.mix(col, C.deep, c.cavity * 0.35);
}
function paintTail(c) {
  const lp = lockParam(c.x, c.y, c.z, ['tail']);
  let col = P.mix(C.low, C.mid, P.ss(-0.2, 0.7, c.ny));
  if (lp.h >= 0) col = P.mix(col, C.hi, P.ss(0.45, 0.95, lp.h));
  col = P.mix(col, C.ink, P.ss(-0.6, -0.68, c.z) * 0.4);
  col = P.mix(col, C.hi, c.edge * 0.3);
  return P.mix(col, C.deep, c.cavity * 0.35);
}
