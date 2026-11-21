// 灯里 — the HEAD as a field. An anime head is designed by three drawings: the FRONT outline (half width per height), the
// PROFILE (front depth per height, and the line of the jaw from the chin to the ear) and the THREE-QUARTER far-cheek
// contour. The face below the brow is a column whose horizontal section is drawn per height from those curves; the cranium
// is an ellipsoid; nose, lips, chin tip, ear are small masses on top. Joined to the body's neck.
// Bind space, metres, her left = +x, front = +z. Landmarks are exported for the face builder (figure/face.mjs).
import { bodyShape, RIG_FILE } from './akari_body.mjs';

export const HEAD = {
  chinY: 1.316, topY: 1.51, eyeY: 1.395, browY: 1.425, noseY: 1.368, mouthY: 1.349,
  mouthHalf: 0.010, noseTip: [0, 1.3726, 0.0866],
  // Face material region: front of the head (ears included), above a plane that lies 4 mm under the plane of the jaw
  // (the jaw's underside rises from the chin to the ear lobe at 31 degrees: JAW below)
  faceZ: -0.036, jawPlane: (z) => 1.311 + 0.56 * (0.052 - z),
};
// The cheek reaches its widest point just under the eye. The width falls slowly to the line of the mouth,
// then the jaw flows quickly in to a rounded point. The rear of each jaw section lies higher than its tip.
// Each section is [height, half width, front depth, back depth, depth at maximum width, front taper].
const PROFILE = [
  [1.3135, 0.002, 0.0550, 0.0510, 0.0532, 0],
  [1.316, 0.005, 0.0598, 0.0476, 0.0530, 0.04],
  [1.319, 0.011, 0.0645, 0.0432, 0.0523, 0.10],
  [1.323, 0.019, 0.0682, 0.0364, 0.0494, 0.14],
  [1.328, 0.0285, 0.0697, 0.0280, 0.0468, 0.17],
  [1.333, 0.0375, 0.0698, 0.0193, 0.0440, 0.14],
  [1.339, 0.0462, 0.0702, 0.0099, 0.0403, 0.10],
  [1.345, 0.0531, 0.0715, 0.0001, 0.0362, 0.07],
  [1.350, 0.0575, 0.0726, -0.0084, 0.0320, 0.05],
  [1.356, 0.0616, 0.0742, -0.0178, 0.0285, 0.02],
  [1.362, 0.0652, 0.0759, -0.0274, 0.0251, 0],
  [1.368, 0.0680, 0.0773, -0.0341, 0.0222, 0],
  [1.375, 0.0698, 0.0786, -0.0396, 0.0207, 0],
  [1.382, 0.0704, 0.0795, -0.042, 0.0190, 0],
  [1.395, 0.0709, 0.0795, -0.045, 0.0173, 0],
  [1.410, 0.0723, 0.0800, -0.047, 0.0163, 0],
  [1.4235, 0.0728, 0.0810, -0.048, 0.0159, 0],
  [1.440, 0.0724, 0.0804, -0.049, 0.015, 0],
  [1.462, 0.068, 0.0735, -0.050, 0.01175, 0],
];
const NC = PROFILE[0].length - 1, Y0 = PROFILE[0][0], CHEEK_N = 0.15, MASK_N = 0.65, TUCK_N = 0.79;
function profileAt(y, out) {
  const P = PROFILE, n = P.length;
  if (y <= P[0][0]) { for (let k = 0; k < NC; k++) out[k] = P[0][k + 1]; return; }
  if (y >= P[n - 1][0]) { for (let k = 0; k < NC; k++) out[k] = P[n - 1][k + 1]; return; }
  let i = 0; while (y > P[i + 1][0]) i++;
  // Catmull-Rom on the uneven rows (tangents from the neighbours' slopes), so close rows do not overshoot
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)], h = p2[0] - p1[0], t = (y - p1[0]) / h, t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  for (let k = 1; k <= NC; k++) {
    const m1 = p2[0] > p0[0] ? (p2[k] - p0[k]) / (p2[0] - p0[0]) : 0, m2 = p3[0] > p1[0] ? (p3[k] - p1[k]) / (p3[0] - p1[0]) : 0;
    out[k - 1] = h00 * p1[k] + h10 * h * m1 + h01 * p2[k] + h11 * h * m2;
  }
}

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function headShape(S) {
  const E = (c, r, t) => (t ? S.ellipsoid(r).turn(t[0], t[1], t[2]) : S.ellipsoid(r)).at(c[0], c[1], c[2]);
  const pr = [0, 0, 0, 0, 0];
  const column = new S.Shape((x, y, z) => {
    profileAt(y, pr);
    const w = pr[0], f = pr[1], b = pr[2], c = pr[3], kap = pr[4];
    // exponent of the section: 2.5 at the eyes (a calm front plane, a clear turn at the temple), 2.38 at the chin.
    // FRONT quadrant (z >= c): boxier from the mouth up to the upper lid (+MASK_N: the face is a calm MASK across the eyes,
    // so eyes set well apart still face the viewer and the far eye of a three-quarter view stays whole) and a little more
    // between the mouth and the lower lid (+CHEEK_N: the corner of the section is the far cheek of a three-quarter view,
    // the soft bump under the eye). Above y 1.428 and everywhere behind the widest point nothing changed.
    // BACK quadrant (z < c), below the ear lobe only: rounder (-TUCK_N): behind the cheek the side of the jaw tucks in
    // toward the underside, so the outline seen from below is the cheek, not a broad jaw bone.
    const n0 = 2.38 + 0.12 * sm(1.322, 1.372, y) - 0.5 * sm(1.4, 1.448, y), up = sm(1.33, 1.352, y);
    const nF = n0 + MASK_N * up * (1 - sm(1.412, 1.428, y)) + CHEEK_N * up * (1 - sm(1.372, 1.388, y)), nB = n0 - TUCK_N * (1 - sm(1.352, 1.372, y));
    const ax = Math.abs(x);
    // front quadrant (z >= c): the half width tapers toward the front by (1 - kappa t^2) - a wedge in plan, round at the tip
    // (only at the chin now); back quadrant: the plain superellipse (its flat back is the jaw's underside)
    let a = w, D, t, ex = 0, n = nF;
    if (z >= c) { D = f - c; t = (z - c) / D; const tc = Math.min(t, 1.15), tau = 1 - kap * tc * tc; a = w * tau; ex = t < 1.15 ? (2 * kap * tc) / tau : 0; }
    else { D = c - b; t = (c - z) / D; n = nB; }
    const u = ax / a, un = Math.pow(u, n), tn = Math.pow(t, n), q = Math.pow(un + tn, 1 / n);
    // distance: first order (q - 1) / |grad q| in the section below the cheek (true to scale where the chin is thin), the
    // old scaled form above it, so the upper head keeps the surface the hair was fitted to
    const d0 = (q - 1) * Math.min(w, (f - b) / 2) * 0.85;
    let dr = d0;
    const lo = 1 - sm(1.372, 1.392, y);
    if (lo > 0) {
      let d1;
      if (q < 1e-6) d1 = -Math.min(a, D);
      else { const k = Math.pow(q, 1 - n), gx = (k * un) / Math.max(u, 1e-9) / a, gz = (k * (tn / Math.max(t, 1e-9) + un * ex)) / D; d1 = ((q - 1) / Math.hypot(gx, gz)) * 0.85; }
      dr = d0 + (d1 - d0) * lo;
    }
    const dy = Math.max(Y0 - y, y - 1.462);
    return dy > 0 ? Math.hypot(Math.max(dr, 0), dy) : dr;
  }, [-0.075, 1.298, -0.055, 0.075, 1.47, 0.085], null, 1.6);
  let face = column.softIntersect(S.plane([0, 1, 0], [0, 1.452, 0]), 0.024);
  face = face.softIntersect(S.plane([0, -1, 0], [0, HEAD.chinY - 0.0005, 0]), 0.006);          // the chin's small flat
  let head = E([0, 1.432, -0.012], [0.073, 0.078, 0.092]).softAdd(face, 0.03);
  // the eye sits in a shallow bed: brow shelf above, the cheek's rise below (revision 4: the larger, lower eye set 3 mm
  // further out - the bed follows it)
  head = head.softCut(E([0.0385, 1.3962, 0.0890], [0.0305, 0.019, 0.0095]).mirror('x'), 0.014);
  // nose: a tiny wedge - no bridge between the eyes (it rises out of the face plane at lower-lid level), a small upturned tip
  let nose = S.taperedCapsule([0, 1.385, 0.0783], [0, 1.3736, 0.0823], 0.0019, 0.0025);
  nose = nose.softAdd(S.sphere(0.0030).at(0, 1.3726, 0.0836), 0.003).softAdd(E([0, 1.3692, 0.0797], [0.0047, 0.0023, 0.0034]), 0.004);
  head = head.softAdd(nose, 0.008);
  // lips: two small soft rolls (the mouth is 20 mm wide). In PROFILE the run from the nose to the chin is a soft S, not a
  // ruler line: the lips stand 1.5-2 mm proud, a breath of a dip under the lower lip, then a small round chin (the
  // column's front z swells 1 mm at y 1.325, rows of PROFILE) that stays 3 mm behind the lips: it does not jut. None of it
  // changes the front outline.
  const my = HEAD.mouthY;
  head = head.softAdd(E([0, my + 0.0022, 0.0732], [0.009, 0.0028, 0.0024]), 0.005);
  head = head.softAdd(E([0, my - 0.0028, 0.0727], [0.008, 0.0028, 0.0023]), 0.005);
  head = head.softCut(E([0, my - 0.0088, 0.0738], [0.0085, 0.0026, 0.0028]), 0.006);
  // temple: the cranium no longer pinches above the ear (review H3)
  head = head.softAdd(E([0.0575, 1.447, 0.008], [0.0135, 0.022, 0.034]).mirror('x'), 0.022);
  // ear
  let ear = E([0.0712, 1.3925, -0.017], [0.0062, 0.0265, 0.0158], [-10, -20, 0]);
  ear = ear.softCut(E([0.0768, 1.3935, -0.0125], [0.005, 0.0165, 0.0085], [-10, -20, 0]), 0.004);
  head = head.softAdd(ear.mirror('x'), 0.005);
  return head;
}
/** blend of the head onto the neck: tight, so the jaw keeps its edge over the neck */
export const NECK_BLEND = 0.008;

export default {
  name: 'akari_head', rig: { file: RIG_FILE },
  voxel: 0.0012, lods: [8000], ground: null, bandSlack: 0.012, bandSafety: 1.4,
  bounds: [-0.012, 1.268, -0.125, 0.105, 1.535, 0.115],
  build({ S, rig }) { return headShape(S).softAdd(bodyShape(S, (n) => rig.bone(n).head), NECK_BLEND); },
};
