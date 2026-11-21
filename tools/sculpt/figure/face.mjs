// 灯里's face: the designed outlines (eye, brow, mouth) as curves in the front plane, the cuts they make in the skin (an
// eye opening with a lid wall, a mouth that parts along its line), the parts behind and on top (eye white and iris on
// spheres about the eye bone so the rig's glances slide them, highlights, lash line, lower line, brow, the inside of
// the mouth) and the thirteen expression shapes as displacement fields over all of them.
// Bind space, metres; her left eye is on +x. Everything is authored for +x and mirrored.
import { splitField, clipField, extrudeRim } from './seam.mjs';
import { splitLongEdges, snap } from './meshops.mjs';
import { HEAD } from '../assets/akari_head.mjs';
import { faceUV, sm, GLINT_SPOTS } from './paint.mjs';

// Slightly hooded almond opening. More of the iris falls behind the upper lid than below the lower lid;
// a lower, softly arched brow leaves room for its movement between the locks of the fringe.
export const EYE = {
  in: [0.0145, 1.3946], out: [0.0535, 1.3931], up: 0.0153, low: 0.0111, aU: 1.01, bU: 0.68, aL: 1.04, bL: 0.87,
  // The eyeball: an ellipsoid (radius Rw in plan, Ry in height), centre = eye bone + c. The centre lies ON THE LINE from
  // the bone to the iris centre (plan view; here 2 mm behind the bone), so a yaw of the eye bone slides the iris along the
  // white: the gap between them stays 0.9-1.2 mm through +-14 degrees (.tmp/akari-face/eyecheck.mjs places it for a given
  // eye and head). On the flat eye-level mask of revision 4 the white lies 1.7-4.2 mm behind the lower lid, 2.6-7.5 mm
  // under the upper one and 5.8 mm deep at the outer corner. (Tried and dropped: a 44-52 mm eyeball further out, and a
  // white lifted toward the lids at the outer corner - a glance of 6 degrees then put the iris's rim under that white: a
  // jagged white bite in the iris, seen in the game.)
  Rw: 0.058, Ry: 0.085, c: [-0.00067, 0, -0.00191],
  // The upper lid covers 3.4 mm of the iris, and the lower edge tucks 1.7 mm under the lower lid.
  iris: [0.03340, 1.3971], irisR: [0.0109, 0.0147],
};
export const TAG = { EYE: 1, LIPU: 2, LIPL: 4, RIM: 8 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const sOf = (xa) => (xa - EYE.in[0]) / (EYE.out[0] - EYE.in[0]);
/** upper and lower lid edge heights at s (0 inner corner .. 1 outer corner) */
export function lids(s) {
  const c = clamp01(s), base = EYE.in[1] + (EYE.out[1] - EYE.in[1]) * c;
  return [base + EYE.up * Math.pow(Math.sin(Math.PI * Math.pow(c, EYE.aU)), EYE.bU), base - EYE.low * Math.pow(Math.sin(Math.PI * Math.pow(c, EYE.aL)), EYE.bL)];
}
const HW = HEAD.mouthHalf;
export const mouthLine = (xa) => HEAD.mouthY - 0.0001 + 0.0008 * Math.min(1, xa / HW) ** 2 - 0.00034 * Math.sin(Math.PI * Math.min(1, xa / HW));
const mouthArc = (xa) => mouthLine(xa) - 0.0098 * Math.sqrt(Math.max(0, 1 - (xa / HW) ** 2));
/** Calligraphic weight: narrow at the tear duct, heaviest just before the outer corner. */
export const lashTh = (s) => 0.00065 + 0.0028 * sm(0.02, 0.45, s) + 0.00145 * sm(0.5, 0.9, s) - 0.0006 * sm(0.9, 1, s);
export const BROW_PTS = [[0.0158, 1.4223], [0.0330, 1.4332], [0.0502, 1.4231]];
export const PAINT = { lids, eye: EYE, mouthLine, mouthHalf: HW, noseY: HEAD.noseY, mouthY: HEAD.mouthY, lashTh };

/** the front of the head as a height field z(x, y) (rays along -z onto the uncut sculpt) */
export function heightMap(shape, { x1 = 0.09, y0 = 1.29, y1 = 1.475, h = 0.0005 } = {}) {
  const nx = Math.round(x1 / h) + 1, ny = Math.round((y1 - y0) / h) + 1, Z = new Float32Array(nx * ny), f = shape.f;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i * h, y = y0 + j * h; let z = 0.115;
    for (let k = 0; k < 80; k++) { const d = f(x, y, z); if (d < 2e-5) break; z -= Math.max(d * 0.55, 1.5e-4); if (z < -0.03) break; }
    Z[j * nx + i] = z;
  }
  return (x, y) => {
    const fx = Math.min(nx - 1.001, Math.max(0, Math.abs(x) / h)), fy = Math.min(ny - 1.001, Math.max(0, (y - y0) / h));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    return (Z[j * nx + i] * (1 - u) + Z[j * nx + i + 1] * u) * (1 - v) + (Z[(j + 1) * nx + i] * (1 - u) + Z[(j + 1) * nx + i + 1] * u) * v;
  };
}
/** depth of the eyeball (R = EYE.Rw: the white; larger R: the layers on it) at (x, y) for the eye on the side of x; pivot = the left eye bone */
export const whiteZ = (pivot, x, y, R = EYE.Rw) => { const ry = EYE.Ry + R - EYE.Rw, dx = (Math.abs(x) - pivot[0] - EYE.c[0]) / R, dy = (y - pivot[1] - EYE.c[1]) / ry; return pivot[2] + EYE.c[2] + R * Math.sqrt(Math.max(1e-6, 1 - dx * dx - dy * dy)); };

/**
 * The surface a CLOSING lid slides on: the sculpt's eye bed, raised inside the opening so that it clears the eyeball by
 * 2.8 mm (iris 1.1, highlights 1.9). The bed alone dips to 1.5 mm over the white in the lower half of the eye: a closed lid
 * that follows it lets the highlights through as white dots (seen in the game, V7) — a lid bulges over the eye it covers.
 */
export const lidSurface = (zs, pivot) => (x, y) => {
  const z = zs(x, y), s = sOf(Math.abs(x));
  if (s <= 0 || s >= 1 || y < 1.355 || y > 1.445) return z;
  const [yU, yL] = lids(s), w = sm(-0.0015, 0.0005, Math.min(yU - y, y - yL)) * sm(0, 0.08, s) * sm(1, 0.92, s);
  return w > 0 ? z + w * Math.max(0, whiteZ(pivot, x, y) + 0.0028 - z) : z;
};

// ----------------------------------------------------------------------------------------------------- cuts (half mesh)
/** half skin (x >= 0) -> { pos, idx, tag } with the eye opening, its lid wall, the parted mouth line and lip walls */
export function cutFaceHalf(half0, pivot, shape = null) {
  // vertices where the face moves: the lids, the mouth and the cheek between get short edges, set on the sculpt's surface
  const dens = (p) => { if (p[2] < 0.03) return Infinity; const e = Math.hypot((p[0] - 0.0378) / 0.036, (p[1] - 1.3958) / 0.03); if (e < 1) return 0.0044; if (p[0] < 0.016 && Math.abs(p[1] - HEAD.mouthY) < 0.0075 && p[2] > 0.04) return 0.0027; if (p[0] < 0.03 && p[1] > 1.312 && p[1] < HEAD.mouthY + 0.017 && p[2] > 0.04) return 0.005; if (p[0] < 0.06 && p[1] > 1.316 && p[1] < 1.43) return 0.0075; return Infinity; };
  const rf = splitLongEdges(half0, dens, (p) => { if (!shape) return p; const q = snap(shape, p, 3); if (Math.abs(p[0]) < 1e-6) q[0] = 0; return q; }, 5);
  const half = { pos: rf.pos, idx: rf.idx };
  const eyeIn = (x, y) => {
    const s = sOf(x);
    if (s <= 0) return -Math.hypot(x - EYE.in[0], y - EYE.in[1]);
    if (s >= 1) return -Math.hypot(x - EYE.out[0], y - EYE.out[1]);
    const [u, l] = lids(s); return Math.min(u - y, y - l);
  };
  const c1 = clipField(half, (x, y, z) => (z > 0.03 ? -eyeIn(x, y) : 1));
  let tag = Uint8Array.from(c1.cut, (c) => (c ? TAG.EYE : 0));
  // the lower lip + chin patch: its upper border is the mouth line; split on its outline, then part the line
  const inPatch = (x, y) => (x >= HW ? -Math.hypot(x - HW, y - mouthLine(HW)) : Math.min(mouthLine(x) - y, y - mouthArc(x)));
  const sp = splitField(c1, (x, y, z) => (z > 0.03 ? inPatch(x, y) : -1));
  const n0 = sp.pos.length / 3, P = Array.from(sp.pos), T = [];
  for (let v = 0; v < n0; v++) T.push(sp.src[v][2] === 0 && sp.src[v][0] === sp.src[v][1] ? tag[sp.src[v][0]] : 0);
  const copy = new Int32Array(n0).fill(-1);
  for (let v = 0; v < n0; v++) {
    if (!sp.cut[v]) continue;
    const x = P[v * 3], y = P[v * 3 + 1];
    if (Math.abs(y - mouthLine(x)) > Math.abs(y - mouthArc(x))) continue;      // on the arc: stays welded
    copy[v] = P.length / 3; P.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); T[v] |= TAG.LIPU; T.push(TAG.LIPL);
  }
  // at rest the two lips meet edge to edge, the lower one a fifth of a millimetre behind. (Tried and dropped: tucking it
  // up behind the upper lip made the lips cross, tucking it 0.7 mm back left a bevel that caught the light as a bright
  // hairline in clay. What used to glint through the seam were the TEETH: they now rest above the line, see faceParts.)
  for (let v = 0; v < n0; v++) { const c = copy[v]; if (c < 0) continue; const k = Math.max(0, 1 - (P[c * 3] / HW) ** 2); P[c * 3 + 2] -= 0.0002 * k; }
  const I = Array.from(sp.idx);
  for (let t = 0; t < sp.side.length; t++) if (sp.side[t] > 0) for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; if (copy[v] >= 0) I[t * 3 + k] = copy[v]; }
  let m = { pos: Float32Array.from(P), idx: Uint32Array.from(I) };
  tag = Uint8Array.from(T);
  // walls: the lid's thickness runs back to the eye white; the lips get 3.5 mm
  const wall = (bit, off) => {
    const r = extrudeRim(m, (a, b) => (tag[a] & bit) && (tag[b] & bit), off);
    const t2 = new Uint8Array(r.pos.length / 3); t2.set(tag); for (let v = tag.length; v < t2.length; v++) t2[v] = tag[r.rimOf[v]] | TAG.RIM;
    m = { pos: r.pos, idx: r.idx }; tag = t2;
  };
  wall(TAG.EYE, (v) => [0, 0, Math.min(-0.0015, whiteZ(pivot, m.pos[v * 3], m.pos[v * 3 + 1]) - 0.0008 - m.pos[v * 3 + 2])]);
  wall(TAG.LIPU, () => [0, 0, -0.0035]);
  wall(TAG.LIPL, () => [0, 0, -0.0035]);
  return { pos: m.pos, idx: m.idx, tag };
}

// ---------------------------------------------------------------------------------------------------------------- parts
const ROLE = { skin: 0, line: 1, brow: 2, still: 3, teeth: 4, tongue: 5, glint: 6 };   // glint + i = highlight i of GLINTS
// the highlights of paint.mjs highlightTexture (GLINT_SPOTS), in iris-box units (-1 .. 1, v up): centre u, v, half size of the patch
const GLINTS = GLINT_SPOTS.map((g) => [g.u, g.v, Math.max(g.ru, g.rv) * 1.18]);
export { ROLE };
function grid(nu, nv, fn) { // fn(u, v) -> { p: [x,y,z], uv: [u,v] }; faces wound for +z when x grows with u and y with v
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const r = fn(i / nu, j / nv); pos.push(...r.p); uv.push(...r.uv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  return { pos, uv, idx };
}
const mirrorPart = (p) => {
  const pos = p.pos.slice(), uv = p.uv.slice(), idx = [];
  for (let i = 0; i < pos.length; i += 3) pos[i] = -pos[i];
  if (p.flipU) for (let i = 0; i < uv.length; i += 2) uv[i] = 1 - uv[i];   // keeps the picture unmirrored on the other side
  for (let t = 0; t < p.idx.length; t += 3) idx.push(p.idx[t], p.idx[t + 2], p.idx[t + 1]);
  return { ...p, pos, uv, idx, side: -1 };
};

/**
 * Everything of the face that is not skin. zs = heightMap of the sculpt, pivot = the left eye bone's head.
 * -> [{ material, pos, uv, idx, role, bone ('head' | 'eye'), side (1 = her left) }]  (arrays, both sides)
 */
export function faceParts(zs, pivot) {
  const L = [];
  const x0 = EYE.in[0] - 0.006, x1 = EYE.out[0] + 0.006, y0 = EYE.in[1] - EYE.low - 0.006, y1 = EYE.out[1] + EYE.up + 0.006;
  // eye white: a patch of the sphere about the eye bone
  // (outside the opening the patch is hidden by the skin: there it ducks 1.2 mm under the sculpt's surface, so the larger
  // sphere cannot come through the side of the cheek below the outer corner)
  const inOpen = (x, y) => { const s = sOf(x); if (s <= 0 || s >= 1) return false; const [yU, yL] = lids(s); return y <= yU && y >= yL; };
  const whiteAt = (x, y) => { const zw = whiteZ(pivot, x, y); return inOpen(x, y) ? zw : Math.min(zw, zs(x, y) - 0.0012); };
  L.push({ material: 'EyeWhite', role: ROLE.still, bone: 'head', ...grid(16, 12, (u, v) => { const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * v; return { p: [x, y, whiteAt(x, y)], uv: [u, 1 - v] }; }) });
  // iris: a cap of a slightly larger sphere (rings x spokes), carried by the eye bone
  { const pos = [], uv = [], idx = [], N = 24, rings = [0, 0.45, 0.8, 1.0];
    for (const r of rings) for (let k = 0; k < N; k++) { const a = (k / N) * 2 * Math.PI, x = EYE.iris[0] + EYE.irisR[0] * r * Math.cos(a), y = EYE.iris[1] + EYE.irisR[1] * r * Math.sin(a); pos.push(x, y, whiteZ(pivot, x, y, EYE.Rw + 0.0011)); uv.push(0.5 + 0.5 * r * Math.cos(a), 0.5 - 0.5 * r * Math.sin(a)); }
    for (let j = 0; j + 1 < rings.length; j++) for (let k = 0; k < N; k++) { const a = j * N + k, b = j * N + (k + 1) % N, c = a + N, d = b + N; if (j === 0) idx.push(a, c, d); else idx.push(a, d, b, a, c, d); }
    L.push({ material: 'EyeIris', role: ROLE.still, bone: 'eye', pos, uv, idx });
  }
  // (highlights: built below for both eyes at once)
  // ribbons on the skin: rows [bottom(s), top(s)] -> points, lifted off the skin
  const ribbon = (material, n, at, lift = 0.0005, role = ROLE.line) => {
    const g = grid(n, 1, (u, v) => { const [x, yb, yt] = at(u); const y = yb + (yt - yb) * v; return { p: [x, y, zs(x, y) + lift], uv: [u, 1 - v] }; });
    L.push({ material, role, bone: 'head', ...g });
  };
  // Draw the upper lid in one stroke from the tear duct to a rising, tapered outer flick.
  const W = EYE.out[0] - EYE.in[0], WING = 0.115;
  ribbon('FaceEyelash', 28, (u) => {
    const s = -0.025 + (1.025 + WING) * u;
    if (s <= 1) { const x = EYE.in[0] + W * s, yU = lids(s)[0]; return [x, yU - 0.0007, yU + Math.max(0.0002, lashTh(s) * sm(-0.03, 0.03, s))]; }
    const e = (s - 1) / WING, x = EYE.out[0] + W * (s - 1), yb = EYE.out[1] - 0.0007 + 0.31 * W * (s - 1);
    return [x, yb, yb + 0.0001 + (lashTh(1) + 0.0007) * Math.pow(1 - e, 1.25)];
  }, 0.0006);
  // two tapered strokes under the outer corner (the lower lashes), pointing down and out: strips with their own two edges
  for (const [s0, len] of [[0.835, 0.00145], [0.928, 0.00185]]) {
    const xb = EYE.in[0] + W * s0, yb = lids(s0)[1] - 0.0001, dx = 0.5, dy = -0.866;
    const g = grid(2, 1, (u, v) => { const th = 0.001 * (1 - 0.75 * u), o = (v - 0.5) * th, x = xb + dx * len * u - dy * o, y = yb + dy * len * u + dx * o; return { p: [x, y, zs(x, y) + 0.0007], uv: [u, 1 - v] }; });
    L.push({ material: 'FaceEyelash', role: ROLE.line, bone: 'head', ...g });
  }
  // lower line: a thin stroke on the outer third only, tapering to nothing toward the iris
  ribbon('FaceEyeline', 10, (u) => { const s = 0.62 + 0.38 * u, x = EYE.in[0] + W * s, yL = lids(s)[1], th = 0.0001 + 0.0011 * Math.pow(u, 1.3); return [x, yL - th * 0.75, yL + th * 0.25]; });
  // A shallow arch under the fringe, tapered at the outer tip.
  const [B0, B1, B2] = BROW_PTS;
  ribbon('FaceBrow', 12, (u) => {
    const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u, x = a * B0[0] + b * B1[0] + c * B2[0], y = a * B0[1] + b * B1[1] + c * B2[1];
    const th = 0.0023 * (1 - 0.64 * Math.pow(u, 1.3)) * sm(-0.02, 0.12, u);
    return [x, y - th / 2, y + th / 2];
  }, 0.0006, ROLE.brow);
  const out = [];
  for (const p of L) out.push({ ...p, side: 1 }, mirrorPart(p));
  // highlights: one small patch of the sphere per highlight, a hair in front of the iris; the same picture in both eyes
  // (the light comes from one side), so they are built for each eye and not mirrored. Each has its own role: when the eye
  // closes it shrinks toward its own centre (shapeDelta), as a painted highlight does.
  for (const sd of [1, -1]) GLINTS.forEach(([cu, cv, hf], gi) => {
    const q = grid(2, 2, (u, v) => { const a = cu + hf * (2 * u - 1), b = cv + hf * (2 * v - 1), x = sd * EYE.iris[0] + EYE.irisR[0] * a, y = EYE.iris[1] + EYE.irisR[1] * b; return { p: [x, y, whiteZ(pivot, x, y, EYE.Rw + 0.0019)], uv: [(a + 1) / 2, (1 - b) / 2] }; });
    out.push({ material: 'EyeHighlight', role: ROLE.glint + gi, bone: 'eye', side: sd, ...q });
  });
  // the inside of the mouth (centred): a hollow, the upper teeth, the tongue
  const cz = zs(0, HEAD.mouthY) - 0.0045, cy = HEAD.mouthY - 0.0044, R = [0.0104, 0.0104, 0.013];
  { const g = grid(18, 5, (u, v) => { const a = u * 2 * Math.PI, ph = v * Math.PI / 2, c = Math.cos(ph); const x = R[0] * Math.cos(a) * c, y = cy + R[1] * Math.sin(a) * c; return { p: [x, y, Math.min(cz, zs(x, y) - 0.0045) - R[2] * Math.sin(ph)], uv: [0.25 + 0.2 * Math.cos(a) * c, 0.5 - 0.45 * Math.sin(a) * c] }; });
    out.push({ material: 'FaceMouth', role: ROLE.still, bone: 'head', side: 0, ...g }); }
  // upper teeth: a band behind the upper lip. At REST it is wholly above the mouth line (V7): behind the closed lips there
  // is only the dark of the mouth, so no white can glint through the seam (the "teeth stitches" of the clay sheets).
  // The shapes that open the mouth bring it down into view (TEETH); it is tall enough that a smile plus a vowel never
  // shows its upper edge.
  { const g = grid(10, 3, (u, v) => { const x = (2 * u - 1) * 0.0078, k = (x / 0.0078) ** 2, yB = mouthLine(Math.abs(x)) + 0.0005 + 0.001 * k, yT = mouthLine(Math.abs(x)) + 0.0082; return { p: [x, yB + (yT - yB) * v, zs(x, HEAD.mouthY) - 0.0039 - 0.0026 * k], uv: [0.6 + 0.3 * u, 0.1 + 0.3 * (1 - v)] }; });
    out.push({ material: 'FaceMouth', role: ROLE.teeth, bone: 'head', side: 0, ...g }); }
  // tongue: a mound on the floor of the mouth, facing the viewer (seen in a wide A, a sliver in O)
  // (revision 3: the chin under the lip recedes now, so the mound is set behind the skin at ITS OWN height — placed from
  // the mouth's depth alone it came through the skin under the lower lip as a red spot)
  { const yF = HEAD.mouthY - 0.0112, r = [0.0068, 0.005, 0.007], zc = Math.min(cz - 0.0007, zs(0, yF) - 0.0058, zs(0, yF + r[1]) - 0.0058, zs(r[0] * 0.7, yF + r[1] * 0.5) - 0.0034) - r[2];
    const g = grid(10, 5, (u, v) => { const lon = (u - 0.5) * Math.PI, lat = v * Math.PI / 2, c = Math.cos(lat); return { p: [r[0] * Math.sin(lon) * c, yF + r[1] * Math.sin(lat), zc + r[2] * Math.cos(lon) * c], uv: [0.6 + 0.3 * u, 0.62 + 0.3 * (1 - v)] }; });
    out.push({ material: 'FaceMouth', role: ROLE.tongue, bone: 'head', side: 0, ...g }); }
  return out;
}

// --------------------------------------------------------------------------------------------------------------- shapes
export const SHAPES = ['blink', 'blink_l', 'blink_r', 'joy', 'fun', 'angry', 'sorrow', 'surprised', 'a', 'i', 'u', 'e', 'o'];
// Mouth (revision 2, review F5): every vowel has its own outline. jaw = how far the lower lip drops at the centre, upper =
// how far the upper lip rises, cornerX / cornerY move the corners (negative x = narrower), forward purses the lips,
// p = exponent of the opening's outline (0.5 = an ellipse: O and U; larger = a lens: I and E), chin = the share of the jaw's
// drop that the chin takes (the jaw swings: a wide A lengthens the face a little).
// Revision 3 (the V-line face, mouth 23.6 mm): the corner travel of U and O is scaled to the narrower mouth (-8.2 -> -7.6, -7.2 -> -6.6).
//                 jaw     upper   cornerX  cornerY forward   p    chin
const MOUTH = {
  // V7: the game's speech never drives a vowel past ~0.5 (rig.js: target 0.25-0.8, eased at 34 characters a second), so
  // the full shapes are a fifth larger than the review asked for: at half weight the mouth still reads as speaking.
  // Revision 4 (the tiny mouth of the references, 17 mm closed): every travel scaled to it; A opens a little WIDER than
  // the closed mouth (a flat upper line, a round lower one: the open smile of the references), I and E widen, U and O
  // close round (round 7: a fifth larger again - at the weights speech uses, 0.3-0.5, the tiny mouth must still read at
  // dialogue distance). The smiles (fun, joy) pull the corners 3.6-4 mm out and up: the neutral mouth is tiny, a smile is a wide
  // thin curve (reference 2).
  a: [0.0142, 0.0013, 0.002, 0.0004, 0, 0.6, 0.5], i: [0.004, 0.0012, 0.0034, 0.0006, 0, 0.85, 0.3], u: [0.0054, 0.002, -0.0036, 0, 0.0026, 0.5, 0.4],
  e: [0.0078, 0.0014, 0.0022, 0.0003, 0, 0.75, 0.42], o: [0.0112, 0.0028, -0.0027, 0, 0.0014, 0.5, 0.5],
  joy: [0.003, 0.0004, 0.004, 0.003, 0, 0.7, 0.4], fun: [0, 0, 0.0036, 0.0026, 0, 0.7, 0], angry: [0, 0.0003, -0.0012, -0.002, 0, 0.7, 0],
  sorrow: [0, 0, -0.001, -0.0022, 0, 0.7, 0], surprised: [0.0045, 0.001, -0.0022, 0, 0.0006, 0.5, 0.45],
};
// the upper teeth: hidden at rest; down into view for a / i / e and a smile, kept up where the lips close round the opening
const TEETH = { a: -0.0027, i: -0.0033, e: -0.0033, joy: -0.0033, o: 0.0011, u: 0.0009, surprised: -0.0005 };   // rest = hidden above the line; down = into view
const GLINT = { blink: 1, blink_l: 1, blink_r: 1, joy: 1 };
// the tongue: a little up and forward in a wide A
const TONGUE = { a: [0.0012, 0.0008], e: [0.0008, 0], o: [-0.001, -0.001], u: [-0.002, -0.002] };
// lids: where the upper and lower edge go, as fractions of the opening height H measured from the lower lid (+ arch).
// f(s, up, base offsets) with s = 0 inner corner .. 1 outer corner; `line(a, b)` = an upper edge that is a straight slant
// (a + b * s) * EYE.up above the corner line, never above the neutral lid: the glare of anger, the droop of sorrow —
// the brows sit under the fringe, so these two expressions are carried by the lids and the mouth (review F6).
const slant = (s, a, b) => { const [yU, yL] = lids(s), base = EYE.in[1] + (EYE.out[1] - EYE.in[1]) * s, H = Math.max(1e-5, yU - yL); return Math.min(1, (base + EYE.up * (a + b * s) - yL) / H); };
const LIDS = {
  blink: (s) => [0.1, 0.1, 0, 0.011, 0.007], blink_l: (s) => [0.1, 0.1, 0, 0.011, 0.007], blink_r: (s) => [0.1, 0.1, 0, 0.011, 0.007],
  joy: (s) => [0.47, 0.41, 0.0036 * Math.sin(Math.PI * s), 0.011, 0.016],
  fun: (s) => [0.74, 0.13, 0.0008 * Math.sin(Math.PI * s), 0.011, 0.012],
  angry: (s) => [slant(s, 0.26, 0.86), 0.13, 0, 0.011, 0.008],
  sorrow: (s) => [slant(s, 1.02, -0.62) - 0.05, 0.16 * Math.sin(Math.PI * s), 0.0006 * Math.sin(Math.PI * s), 0.011, 0.01],
  surprised: (s) => [1.17, -0.05, 0, 0.013, 0.008],
};
const BROW = {
  angry: (t) => [-0.0016 * (1 - t), -0.0052 * Math.pow(1 - t, 1.2) + 0.0034 * t], sorrow: (t) => [0, 0.0046 * Math.pow(1 - t, 1.2) - 0.0042 * t],
  surprised: () => [0, 0.0042], joy: () => [0, 0.0013], fun: () => [0, 0.0007],
};

/**
 * Displacement of one vertex for one shape. role: ROLE.*, tag: TAG bits (lip edges), zs: height map.
 * Lids slide on the sculpt's surface (the height map of the uncut head stands in for the eyeball under a closed lid).
 */
export function shapeDelta(name, x, y, z, role, tag, zs, out) {
  out[0] = out[1] = out[2] = 0;
  if (role === ROLE.teeth) { out[1] = TEETH[name] || 0; return out; }
  if (role === ROLE.tongue) { const t = TONGUE[name]; if (t) { out[1] = t[0]; out[2] = t[1]; } return out; }
  // highlights: when the eye closes each one shrinks to nothing about its own centre (and stays in front of the iris)
  if (role >= ROLE.glint) {
    const k = GLINT[name];
    if (k && !(name === 'blink_l' && x < 0) && !(name === 'blink_r' && x > 0)) { const g = GLINTS[role - ROLE.glint], sd = x >= 0 ? 1 : -1; out[0] = (sd * EYE.iris[0] + EYE.irisR[0] * g[0] - x) * k; out[1] = (EYE.iris[1] + EYE.irisR[1] * g[1] - y) * k; out[2] = -0.0006 * k; }
    return out;
  }
  if (role === ROLE.still || z < 0.02) return out;
  const xa = Math.abs(x), sg = x >= 0 ? 1 : -1;
  if (role === ROLE.brow) {
    const f = BROW[name]; if (!f) return out;
    const d = f(clamp01((xa - BROW_PTS[0][0]) / (BROW_PTS[2][0] - BROW_PTS[0][0])));
    out[0] = d[0] * sg; out[1] = d[1]; out[2] = zs(xa + d[0], y + d[1]) - zs(xa, y);
    return out;
  }
  // ---- lids (skin + lines)
  const lf = LIDS[name];
  if (lf && !(name === 'blink_l' && x < 0) && !(name === 'blink_r' && x > 0) && y > 1.356 && y < 1.442 && xa > EYE.in[0] - 0.012 && xa < EYE.out[0] + 0.014) {
    const s = clamp01(sOf(xa)), [yU, yL] = lids(s), H = yU - yL, k = lf(s);
    const wx = 1 - sm(0, 0.008, Math.max(EYE.in[0] - xa, xa - EYE.out[0], 0));
    let dy;
    if (y >= (yU + yL) / 2) {
      const h = y - yU, edge = yL + k[0] * H + k[2] - yU;
      // skin above the lid follows with a falloff; the lash band (a line ribbon up to 5.5 mm tall) rides the lid's edge
      // rigidly and THINS as the eye closes - to 40 % in a blink: a closed eye is a thin dark arc, not a black patch
      if (role === ROLE.line) dy = edge - Math.max(0, h) * 0.6 * clamp01(-edge / (0.85 * Math.max(H, 1e-5)));
      else dy = edge * (h <= 0 ? 1 : 1 - sm(0.0004, k[3], h));
    }
    else { const h = yL - y; dy = (yL + k[1] * H + k[2] - yL) * (h <= 0 ? 1 : 1 - sm(0.0004, k[4], h)); }
    dy *= wx;
    out[1] += dy; out[2] += zs(xa, y + dy) - zs(xa, y);
  }
  // ---- mouth (skin only): the lower lip and the chin swing down and back, the upper lip rises, the corners travel
  const mf = MOUTH[name];
  if (mf && role === ROLE.skin && z > 0.03 && xa < 0.05 && y > 1.298 && y < HEAD.mouthY + 0.027) {
    const [J, U, CX, CY, F, P, CH] = mf;
    const yl = mouthLine(xa), above = tag & TAG.LIPU ? true : tag & TAG.LIPL ? false : y >= yl;
    const c = xa < HW ? Math.pow(1 - (xa / HW) ** 2, P) : 0;
    const dl = Math.hypot(Math.max(0, xa - HW), y - yl), near = 1 - sm(0.003, 0.017, dl), cx = Math.min(xa, HW) / HW;
    if (above) out[1] += U * c * (1 - sm(0, 0.0095, y - yl));
    else {
      const lip = c * (1 - sm(0.003, 0.022, yl - y));
      const chin = CH * (1 - sm(0.015, 0.041, xa)) * sm(0.031, 0.051, z) * sm(0, 0.004, yl - y);
      const d = J * Math.max(lip, chin);
      out[1] -= d; out[2] -= d * 0.18;                          // the jaw swings back a little as it drops
    }
    // the corners travel ON the skin (revision 3: across the mouth the V-line face is a wedge in plan, so a corner drawn
    // straight inward left the surface and folded the cheek beside it: fine lines at both sides of an O or a U)
    const dx = CX * cx * near, dc = CY * cx * cx * near;
    out[0] += sg * dx; out[1] += dc; out[2] += F * (1 - sm(0.002, 0.017, dl)) + (dx || dc ? zs(xa + dx, y + dc) - zs(xa, y) : 0);
  }
  return out;
}

/** planar face uv for a skin vertex */
export const skinUV = (x, y) => faceUV(x, y);
