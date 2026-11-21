// Silver travelling witch hairstyle, in the character's bind pose, metres.
// A side part, curved cheek locks and two unequal front sections frame the face.
// The longer section carries the gold cuff on her left. The rear sections follow five spring chains.
// +X is her left and +Z is forward.
export const C0 = [0, 1.432, -0.012];                 // the cranium's centre (radial probes start here)
export const COLORS = {
  top: '#e9e9f2', mid: '#bec1d1', deep: '#8388a3',
  gold: '#f8df85', goldDark: '#a17c42',
};
/** the whorl: on the top, a little behind and to her right */
export const WHORL = [-0.020, -0.024];

const smf = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// A smooth fall outside the mantle. At the temples the curtain turns forward onto the shoulders.
export function drapeZ(x, y) {
  const f = smf(1.40, 1.00, y);
  return -0.105 - 0.063 * f + 0.057 * smf(0.072, 0.163, Math.abs(x));
}

// ------------------------------------------------------------------------------------------------ spring chains (new joints)
// All chains hang from the HEAD (tried the upper chest: in her idle and run poses the neck bends so much that a chest-
// parented root ends up inside the skull); the springs keep the stiffness LOW so gravity, not the head's tilt, hangs the hair. Appended to the skeleton by the build (rest rotation identity, inverse bind = the joint's rest translation inverted). Back:
// five chains of four joints (+ _end) from under the occiput to the waist; the joint line runs along the hair's middle layer.
// Side: one chain of three joints (+ _end) in each long side lock, from under the jaw to the chest.
const BACK_Y = [1.385, 1.285, 1.195, 1.128, 1.045];
const BACK_X = { 1: [0, 0, 0, 0, 0], 2: [0.04, 0.05, 0.056, 0.06, 0.062], 4: [0.07, 0.095, 0.108, 0.112, 0.114] };
export const CHAINS = (() => {
  const out = [];
  const z0 = (x, y, i) => (i === 0 ? -0.098 - 0.02 * (1 - Math.min(1, Math.abs(x) / 0.075)) : drapeZ(x, y) - 0.036);
  const mk = (n, xs, sd) => out.push({ part: 'HairBack', n, parent: 'J_Bip_C_Head', kind: 'cape', pts: BACK_Y.map((y, i) => { const x = sd * xs[i]; return [x, y, z0(x, y, i)]; }) });
  mk(1, BACK_X[1], 1); mk(2, BACK_X[2], 1); mk(3, BACK_X[2], -1); mk(4, BACK_X[4], 1); mk(5, BACK_X[4], -1);
  for (const sd of [1, -1]) {
    const pts = sd > 0
      ? [[0.087, 1.35, 0.040], [0.100, 1.271, 0.122], [0.098, 1.198, 0.151], [0.163, 1.095, 0.148]]
      : [[-0.089, 1.35, 0.026], [-0.116, 1.272, 0.067], [-0.102, 1.233, 0.105], [-0.06, 1.22, 0.131]];
    out.push({ part: sd > 0 ? 'HairSideL' : 'HairSideR', n: 1, parent: 'J_Bip_C_Head', kind: 'hair', pts });
  }
  return out;
})();

// Centre of the single gilt cuff on the left shoulder.
export const CUFF_Y = 1.218;

// ------------------------------------------------------------------------------------------------ the design
/**
 * A lock: { name, group, pts, hw (half width per point), ht (half thickness per point), K (section points), ds (ring step),
 *   tip: 'point' | 'cap', weights: rule, lean (crest bias), up: 'head' | 'hang', layer: 0 outer / 1 under / 2 split }.
 */
export function hairDesign(H) {
  const L = [];
  const D2R = Math.PI / 180;
  const O = 0.0055;                 // the hair mass over the cap (volume)
  // lock roots: they rise out of the cap's smooth dome 2.2-3.4 cm from the whorl (radius varied per lock, so no ring shows)
  const nearW = (az) => { const r = 0.022 + 0.012 * ((((Math.sin(az * 12.9898 + 3.1) * 43758.5453) % 1) + 1) % 1); return H.Tp(WHORL[0] + Math.sin(az * D2R) * r, WHORL[1] + Math.cos(az * D2R) * r, 0.0158); };

  // ---------------------------------------------------------------- cheek locks: hug the cheek, end at the jaw, tip in
  for (const sd of [1, -1]) {
    const s = sd > 0 ? 'L' : 'R';
    const pts = [nearW(sd * 40, 0.01), H.R(sd * 32, 58, 0.0175 + O), H.R(sd * 46, 33, 0.0185 + O * 0.7), H.Rm(sd * 54, 1.428, 0.0105), H.Rm(sd * 57, 1.404, 0.0072),
      H.Rm(sd * 52, 1.378, 0.0058), H.Rm(sd * (sd > 0 ? 42 : 47), sd > 0 ? 1.367 : 1.363, 0.0065), H.Rm(sd * (sd > 0 ? 28 : 36), sd > 0 ? 1.366 : 1.351, 0.0065)];
    L.push({ name: 'Cheek' + s, group: 'cheek', pts, up: 'head', weights: 'cheek' + s, K: 12, ds: 0.009, hw: [0.008, 0.017, 0.019, 0.0175, 0.015, 0.0128, 0.0088, 0.0012], ht: [0.0026, 0.0044, 0.0046, 0.0042, 0.0036, 0.0032, 0.0027, 0.0009], lean: -0.1 * sd, layer: 0 });
    // a shorter layer behind it, between the cheek lock and the side lock (fills the temple, ends at the cheekbone)
    const p2 = [nearW(sd * 58, 0.012), H.R(sd * 52, 52, 0.017 + O), H.R(sd * 64, 28, 0.0175 + O * 0.8), H.Rm(sd * 66, 1.418, 0.0105), H.Rm(sd * 66, 1.392, 0.0082), H.Rm(sd * 61, 1.372, 0.0068)];
    L.push({ name: 'Cheek2' + s, group: 'cheek', pts: p2, up: 'head', weights: 'cheek' + s, K: 10, ds: 0.01, hw: [0.008, 0.016, 0.0175, 0.015, 0.01, 0.0012], ht: [0.0026, 0.0042, 0.0044, 0.0038, 0.003, 0.0009], lean: -0.08 * sd, layer: 1 });
  }

  // ---------------------------------------------------------------- over the ears: the side volume that frames the jaw
  for (const sd of [1, -1]) {
    const s = sd > 0 ? 'L' : 'R';
    const pts = [nearW(sd * 92, 0.012), H.R(sd * 86, 50, 0.016 + O), H.R(sd * 93, 20, 0.0175 + O), H.Sd(sd, 1.402, -0.016, 0.019), [sd * 0.092, 1.354, -0.012], [sd * 0.099, 1.325, -0.012], [sd * 0.106, 1.313, -0.021]];
    L.push({ name: 'Ear' + s, group: 'ear', pts, up: 'hang', weights: 'ear', K: 12, ds: 0.011, hw: [0.008, 0.019, 0.023, 0.022, 0.016, 0.009, 0.0012], ht: [0.0028, 0.0046, 0.0052, 0.005, 0.0042, 0.0032, 0.001], lean: 0.1 * sd, layer: 0 });
  }

  // The near shoulder sections have different gestures. The cuff gathers the broad left
  // lock into a single point; the free right section sweeps forward across the collarbone.
  for (const sd of [1, -1]) {
    const tied = sd > 0, side = tied ? 'L' : 'R';
    const root = [nearW(sd * 72), H.R(sd * 67, 57, 0.021), H.R(sd * 81, 34, 0.023),
      H.Sd(sd, 1.423, 0.017, 0.017), [sd * 0.085, 1.383, 0.024]];
    const end = tied
      ? [[0.091,1.342,0.047],[0.099,1.294,0.100],[0.100,1.256,0.131],[0.093,CUFF_Y,0.145],[0.105,1.182,0.154],[0.127,1.145,0.160],[0.152,1.111,0.158],[0.166,1.096,0.147]]
      : [[-0.096,1.344,0.030],[-0.108,1.299,0.073],[-0.116,1.271,0.096],[-0.112,1.250,0.116],[-0.092,1.231,0.132],[-0.065,1.224,0.144],[-0.040,1.230,0.151]];
    const widths = tied ? [0.027,0.028,0.022,0.0105,0.020,0.020,0.009,0.0007] : [0.028,0.031,0.030,0.023,0.014,0.007,0.0007];
    const depths = tied ? [0.0048,0.0043,0.0035,0.0058,0.0036,0.0029,0.0020,0.0006] : [0.0046,0.0050,0.0038,0.003,0.0021,0.0014,0.0006];
    L.push({ name: 'Side' + side, group: 'side', pts: [...root, ...end], up: 'hang', weights: 'side' + side, K: 14, ds: 0.009,
      hw: [0.008,0.017,0.021,0.020,0.023,...widths], ht: [0.0026,0.0044,0.006,0.006,0.007,...depths],
      lean: 0.16 * sd, layer: 0 });
    if (!tied) {
      L.push({ name: 'CollarFlick', group: 'side', up: 'hang', weights: 'sideR', K: 10, ds: 0.008, layer: 1,
        pts: [[-0.111,1.292,0.071],[-0.114,1.259,0.102],[-0.100,1.240,0.124],[-0.078,1.222,0.136],[-0.059,1.211,0.141]],
        hw: [0.006,0.014,0.014,0.009,0.001], ht: [0.003,0.005,0.004,0.003,0.0008] });
    }
  }

  // ---------------------------------------------------------------- the long hair: broad ribbons from the whorl to the waist
  // A ribbon = a MAIN lock (full width, its tip in the middle) + one or two SPLIT locks under it (narrower, they start under
  // the main lock and fan out at the end) -> each ribbon ends in two or three fine tips of unequal length.
  // [name, angle from the back centre (+ her left, deg), tip y, half width at the shoulders, layer, splits [[side, length k]]]
  // Small secondary locks split off at the hem in three different directions. Their roots
  // are seated beneath the main fall, and their whole lengths use the rear spring chains.
  const ends = [
    [[0.081,1.245,-0.103],[0.118,1.163,-0.128],[0.139,1.089,-0.144],[0.163,1.042,-0.137],[0.172,1.028,-0.124]],
    [[-0.086,1.248,-0.093],[-0.128,1.174,-0.117],[-0.151,1.106,-0.125],[-0.162,1.062,-0.113],[-0.165,1.046,-0.095]],
    [[0.039,1.202,-0.143],[0.062,1.139,-0.177],[0.078,1.058,-0.184],[0.094,1.013,-0.176],[0.109,0.992,-0.162]],
    [[-0.060,1.218,-0.136],[-0.084,1.143,-0.166],[-0.089,1.075,-0.177],[-0.100,1.018,-0.175],[-0.118,0.987,-0.165]],
  ];
  for (const [i, points] of ends.entries()) {
    const pts = points.map(([x,y,z])=>[x,y,z-0.035]);
    L.push({ name: 'HemFlick' + i, group: 'long', up: 'hang', weights: 'back', K: 10, ds: 0.010, layer: 1, pts,
      hw: [0.002,0.016,0.015,0.0076,0.0007], ht: [0.0012,0.0038,0.0036,0.0023,0.0006] });
  }

  // A long, fine temple wisp catches the sky beyond the brim when the head turns.
  L.push({ name: 'TempleWisp', group: 'stray', up: 'head', weights: 'head', K: 8, ds: 0.007,
    pts: [H.R(-62, 55, 0.017), H.R(-58, 35, 0.024), [-0.103,1.431,0.051],[-0.112,1.406,0.059],[-0.108,1.395,0.066],[-0.101,1.399,0.071]],
    hw: [0.001,0.0021,0.0021,0.0018,0.0012,0.0005], ht: [0.001,0.0013,0.0014,0.001,0.0008,0.0004], lean: 0.2 });
  // strays: [name, root az, root el, way points (bind), weights]
  const ST = [
    ['St5', -118, 24, [[-0.094, 1.438, -0.064], [-0.103, 1.410, -0.08], [-0.107, 1.389, -0.085]], 'head'],
  ];
  for (const [name, az, el, way, w] of ST) {
    const p0 = H.R(az, el, 0.0185 + O);
    L.push({ name, group: 'stray', up: w === 'back' ? 'hang' : 'head', weights: w, K: 6, ds: 0.008, pts: [p0, ...way], hw: [0.0042, 0.0045, 0.0034, 0.0007], ht: [0.0021, 0.0022, 0.0019, 0.0008], lean: 0.15 });
  }
  // The continuous crown already carries the hair from the part to the temples. Plant the
  // separate face-framing locks inside its side surfaces; no stacked roots on the forehead.
  for (const lock of L) {
    if (!['ear', 'side', 'cheek'].includes(lock.group) || lock.pts.length < 5 || lock.pts[0][1] < 1.475) continue;
    const count = 2;
    lock.pts = lock.pts.slice(count);
    lock.hw = lock.hw.slice(count);
    lock.ht = lock.ht.slice(count);
    const root = lock.pts[0];
    root[0] *= 0.78;
    root[2] = -0.012 + (root[2] + 0.012) * 0.78;
    lock.hw[0] = 0.001;
    lock.ht[0] = 0.001;
    const next = lock.pts[1], middle = root.map((q,k) => q + (next[k] - q) * 0.44);
    lock.pts.splice(1, 0, middle);
    lock.hw.splice(1, 0, lock.hw[1] * 0.52);
    lock.ht.splice(1, 0, lock.ht[1] * 0.6);
  }
  return L;
}


