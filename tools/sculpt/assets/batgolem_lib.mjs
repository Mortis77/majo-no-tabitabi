// Helpers for shade_bat.mjs and stone_golem.mjs (sculptor: batgolem). Kit files are not touched; everything the kit lacks
// for these two lives here:
//  - membrane(): a thin curved sheet made of fan patches between finger polylines (distance to a triangle set), with a
//    scalloped trailing edge, sag between the ribs and a per-row thickness the mesher can hold (>= 3 voxels)
//  - slot(): a narrow deep cut along a segment (cracks that go deep enough to show a glow core under them)
//  - rope(): a closed twisted two-strand straw rope along a sampled loop
//  - brk(): a bounded break (three planes in a ball) — after earth_column_common.mjs
//  - post(): rewrite the kit's skinned GLB — weld weights at split vertices, split the single primitive into one primitive
//    per game material (the game keys eye glow / wing tint on material NAMES), optional TEXCOORD_0 glow mask
//  - sheets(): poses / turntable / before-after / close look rendered from the FINAL GLB, plus a "game tint" row
import * as S from '../sdf.mjs';

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]), lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};
V.norm = (a) => V.mul(a, 1 / (V.len(a) || 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** mirror about the plane x = cx (model the +x half relative to cx) */
export function mirrorAbout(shape, cx) { return shape.at(-cx, 0, 0).mirror('x').at(cx, 0, 0); }

/** point at arc-length fraction u (0..1) along a polyline */
export function polyAt(P, u) {
  const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + V.len(V.sub(P[i], P[i - 1])));
  const t = clamp(u, 0, 1) * L[L.length - 1];
  for (let i = 1; i < P.length; i++) if (t <= L[i] || i === P.length - 1) { const k = (t - L[i - 1]) / ((L[i] - L[i - 1]) || 1); return V.lerp(P[i - 1], P[i], clamp(k, 0, 1)); }
  return P[P.length - 1];
}

// ------------------------------------------------------------------------------------------- triangle-set sheet (membrane)
function triPrep(a, b, c, h) {
  const ba = V.sub(b, a), cb = V.sub(c, b), ac = V.sub(a, c), nor = V.cross(ba, ac);
  const bb = [Math.min(a[0], b[0], c[0]) - h, Math.min(a[1], b[1], c[1]) - h, Math.min(a[2], b[2], c[2]) - h, Math.max(a[0], b[0], c[0]) + h, Math.max(a[1], b[1], c[1]) + h, Math.max(a[2], b[2], c[2]) + h];
  return { a, b, c, ba, cb, ac, nor, c1: V.cross(ba, nor), c2: V.cross(cb, nor), c3: V.cross(ac, nor), dba: V.dot(ba, ba), dcb: V.dot(cb, cb), dac: V.dot(ac, ac), dn: V.dot(nor, nor), h, bb };
}
function triDist(T, x, y, z) {
  const pa = [x - T.a[0], y - T.a[1], z - T.a[2]], pb = [x - T.b[0], y - T.b[1], z - T.b[2]], pc = [x - T.c[0], y - T.c[1], z - T.c[2]];
  const s = Math.sign(V.dot(T.c1, pa)) + Math.sign(V.dot(T.c2, pb)) + Math.sign(V.dot(T.c3, pc));
  if (s < 2) {
    const e = (v, d, p) => { const k = clamp(V.dot(v, p) / d, 0, 1); const q = [v[0] * k - p[0], v[1] * k - p[1], v[2] * k - p[2]]; return V.dot(q, q); };
    return Math.sqrt(Math.min(e(T.ba, T.dba, pa), e(T.cb, T.dcb, pb), e(T.ac, T.dac, pc)));
  }
  const d = V.dot(T.nor, pa); return Math.sqrt((d * d) / T.dn);
}
/**
 * A sheet = thin solid around a set of triangles: d = min_i (dist_i - h_i).
 * patches: [{ A: polyline, B: polyline, nu, nv, sag, n (sag direction), scallop, h: (u) => half thickness }]
 * Each patch is a fan between two polylines that start at the same point; row u = 1 is the trailing edge, pulled in by
 * `scallop * sin(pi v)` (as a fraction of u) so the edge between the two finger tips curves toward the wrist.
 * Returns { shape, at(pi, u, v) world point on patch pi }.
 */
export function sheet(patches) {
  const tris = [];
  const pt = (p, u, v) => {
    const sc = 1 - (p.scallop || 0) * Math.sin(Math.PI * v) * ss(0.5, 1, u);
    const uu = u * sc;
    const q = V.lerp(polyAt(p.A, uu), polyAt(p.B, uu), v);
    const sag = (p.sag || 0) * Math.sin(Math.PI * v) * Math.sin(Math.PI * Math.min(1, uu * 0.9 + 0.1));
    return V.add(q, V.mul(p.n, sag));
  };
  for (const p of patches) {
    for (let i = 0; i < p.nu; i++) for (let j = 0; j < p.nv; j++) {
      const u0 = i / p.nu, u1 = (i + 1) / p.nu, v0 = j / p.nv, v1 = (j + 1) / p.nv;
      const h = p.h((u0 + u1) / 2);
      const q00 = pt(p, u0, v0), q10 = pt(p, u1, v0), q01 = pt(p, u0, v1), q11 = pt(p, u1, v1);
      if (i === 0) tris.push(triPrep(q00, q10, q11, h)); // apex row: q00 == q01
      else { tris.push(triPrep(q00, q10, q11, h)); tris.push(triPrep(q00, q11, q01, h)); }
    }
  }
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const T of tris) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], T.bb[k]); bb[k + 3] = Math.max(bb[k + 3], T.bb[k + 3]); }
  const g = 0.02; bb[0] -= g; bb[1] -= g; bb[2] -= g; bb[3] += g; bb[4] += g; bb[5] += g;
  const f = (x, y, z) => {
    let best = 1e9;
    for (const T of tris) {
      const q = S.boxDist(T.bb, x, y, z) - T.h; if (q >= best) continue;
      const d = triDist(T, x, y, z) - T.h; if (d < best) best = d;
    }
    return best;
  };
  return { shape: new S.Shape(f, bb), at: (i, u, v) => pt(patches[i], u, v), tris };
}

// ------------------------------------------------------------------------------------------------------- narrow deep cut
/** slot from a to b: half-width w (number or [wa, wb]), reaching D either side of the surface along n (unit) */
export function slot(a, b, n, w, D) {
  const ab = V.sub(b, a), L2 = V.dot(ab, ab), [wa, wb] = Array.isArray(w) ? w : [w, w];
  const m = Math.max(wa, wb, D) + 0.01;
  const bb = [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m];
  return new S.Shape((x, y, z) => {
    const p = [x - a[0], y - a[1], z - a[2]], t = clamp(V.dot(p, ab) / L2, 0, 1);
    const q = [p[0] - ab[0] * t, p[1] - ab[1] * t, p[2] - ab[2] * t], qn = V.dot(q, n);
    const qs = Math.hypot(q[0] - n[0] * qn, q[1] - n[1] * qn, q[2] - n[2] * qn);
    return Math.max(qs - (wa + (wb - wa) * t), Math.abs(qn) - D);
  }, bb);
}
/** a jagged crack as a chain of slots through the points (widths taper from w0 to w1) */
export function crackSlots(points, n, w0, w1, D) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const t0 = i / (points.length - 1), t1 = (i + 1) / (points.length - 1);
    out.push(slot(points[i], points[i + 1], n, [w0 + (w1 - w0) * t0, w0 + (w1 - w0) * t1], D));
  }
  return S.union(...out);
}

// ----------------------------------------------------------------------------------------------- twisted straw rope loop
/** closed loop C(s) sampled (array of points, last != first). Two strands twisting `turns` times round the loop. */
export function rope(loop, R, { turns = 20, groove = 0.25, up = [0, 1, 0] } = {}) {
  const n = loop.length, seg = [];
  let total = 0;
  for (let i = 0; i < n; i++) { const a = loop[i], b = loop[(i + 1) % n]; const L = V.len(V.sub(b, a)); seg.push({ a, b, L, s0: total }); total += L; }
  for (const g of seg) { g.t = V.mul(V.sub(g.b, g.a), 1 / g.L); const nn = V.norm(V.cross(g.t, V.cross(up, g.t))); g.N = nn; g.B = V.cross(g.t, nn); }
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of loop) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], p[k] - R * 1.4); bb[k + 3] = Math.max(bb[k + 3], p[k] + R * 1.4); }
  const w = (turns * 2 * Math.PI) / total;
  const f = (x, y, z) => {
    let best = 1e9, bs = 0, bq = null, bg = null;
    for (const g of seg) {
      const p = [x - g.a[0], y - g.a[1], z - g.a[2]], t = clamp(V.dot(p, g.t), 0, g.L);
      const q = [p[0] - g.t[0] * t, p[1] - g.t[1] * t, p[2] - g.t[2] * t], d = V.len(q);
      if (d < best) { best = d; bs = g.s0 + t; bq = q; bg = g; }
    }
    if (best > R * 1.6) return best - R;
    const th = Math.atan2(V.dot(bq, bg.B), V.dot(bq, bg.N));
    // two strands: the radius dips twice around the section, the dips spiral along the rope
    const r = R * (1 - groove * 0.5 * (1 - Math.cos(2 * th - w * bs)) ** 2);
    return (best - r) * 0.85;
  };
  return new S.Shape(f, bb);
}

// ---------------------------------------------------------------------------------------------------- bounded break
/** a knocked-off corner bounded by a ball (no strip up a tall face). paint: a part name for the fresh break */
export function brk(shape, { at, dir, depth = 0.1, spread = 0.5, seed = 1, rough = 0.008, ball = 2.2, paint = null }) {
  const rnd = S.prng(seed * 31 + 5), n = S.norm(dir);
  const c = [at[0] - n[0] * depth, at[1] - n[1] * depth, at[2] - n[2] * depth];
  const t1 = S.norm(S.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = S.cross(n, t1), planes = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 2 * Math.PI + rnd() * 1.2, s = spread * (0.7 + 0.6 * rnd());
    planes.push(S.norm([0, 1, 2].map((k) => n[k] + s * (Math.cos(a) * t1[k] + Math.sin(a) * t2[k]))));
  }
  const rb = depth * ball, f = shape.f, pf = shape.pf, sd = seed * 13 + 1;
  const cutF = (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    let k = -1e9; for (const p of planes) { const v = -(px * p[0] + py * p[1] + pz * p[2]); if (v > k) k = v; }
    k += rough * S.fbm(x * 9 / Math.max(0.05, depth * 4), y * 9 / Math.max(0.05, depth * 4), z * 9 / Math.max(0.05, depth * 4), sd, 2);
    return Math.max(k, Math.hypot(x - at[0], y - at[1], z - at[2]) - rb);
  };
  const P = paint ? S.part(paint) : null;
  return new S.Shape((x, y, z) => Math.max(f(x, y, z), -cutF(x, y, z)), shape.b,
    P ? (x, y, z) => (-cutF(x, y, z) >= f(x, y, z) - 2e-3 ? P : pf(x, y, z)) : pf, shape.lip + 0.2);
}

/** a granite block: a box with unequal facets cut by planes, crisp-ish bevel, a slight turn */
export function block(c, size, { r = 0.03, turn = [0, 0, 0], facets = 0, seed = 1, fdepth = 0.04 } = {}) {
  let b = S.roundBox(size, r).turn(...turn).at(...c);
  if (facets) {
    const rnd = S.prng(seed);
    const fn = b.f; const planes = [];
    for (let i = 0; i < facets; i++) {
      // a plane slicing one corner / edge of the block: normal toward a random corner, offset inward by fdepth..2fdepth
      const n = S.norm([(rnd() - 0.5) * 2, (rnd() - 0.3) * 2, (rnd() - 0.5) * 2]);
      const ex = Math.abs(n[0]) * size[0] / 2 + Math.abs(n[1]) * size[1] / 2 + Math.abs(n[2]) * size[2] / 2;
      planes.push({ n, o: ex * (0.82 - 0.12 * rnd()) - fdepth * rnd() });
    }
    const T = turn.map((v) => (v * Math.PI) / 180);
    // planes live in the block's local frame: rotate the query back (inverse of X then Y then Z turns)
    const inv = (x, y, z) => {
      x -= c[0]; y -= c[1]; z -= c[2];
      let cz = Math.cos(-T[2]), sz = Math.sin(-T[2]); [x, y] = [x * cz - y * sz, x * sz + y * cz];
      let cy = Math.cos(-T[1]), sy = Math.sin(-T[1]); [x, z] = [x * cy + z * sy, -x * sy + z * cy];
      let cx = Math.cos(-T[0]), sx = Math.sin(-T[0]); [y, z] = [y * cx - z * sx, y * sx + z * cx];
      return [x, y, z];
    };
    b = new S.Shape((x, y, z) => { let d = fn(x, y, z); const p = inv(x, y, z); for (const q of planes) { const v = V.dot(p, q.n) - q.o; if (v > d) d = v; } return d; }, b.b, b.pf, b.lip);
  }
  return b;
}

// ============================================================================================== post: the shipped GLB
/** vertices that share a position get the same averaged top-4 weights (from dango.mjs) */
export function weldWeights(Pp, J, W, n) {
  const groups = new Map();
  for (let v = 0; v < n; v++) { const k = `${Math.round(Pp[v * 3] * 2e4)},${Math.round(Pp[v * 3 + 1] * 2e4)},${Math.round(Pp[v * 3 + 2] * 2e4)}`; (groups.get(k) || groups.set(k, []).get(k)).push(v); }
  let welded = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const acc = new Map();
    for (const v of g) for (let k = 0; k < 4; k++) if (W[v * 4 + k] > 0) acc.set(J[v * 4 + k], (acc.get(J[v * 4 + k]) || 0) + W[v * 4 + k]);
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((a, b) => a + b[1], 0);
    for (const v of g) for (let k = 0; k < 4; k++) { J[v * 4 + k] = top[k] ? top[k][0] : 0; W[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
    welded += g.length;
  }
  return welded;
}

/**
 * Split the kit's single skinned primitive into one primitive per game material.
 *  asset: path of the asset module; matOf(partName) -> material name; base: name of the kit's (kept) material
 *  glowOf(partName, x, y, z) -> 0..1 written to TEXCOORD_0.x when `uvGlow` (else no UV)
 * The first material keeps the original material object (name changed to base); the others are clones renamed.
 */
export async function post(assetFile, glbFile, { matOf, base, glowOf = null, dropNodes = [], log = console.log }) {
  const fs = await import('node:fs');
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { loadModel } = await import('../model.mjs');
  const M = await loadModel(assetFile);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(glbFile);
  // the pack's static extras (the bat's separate 'Eyes' mesh) would float on the new head: drop them
  for (const nd of doc.getRoot().listNodes()) if (dropNodes.includes(nd.getName()) && nd.getMesh() && !nd.getSkin()) {
    const me = nd.getMesh(); nd.setMesh(null); for (const p of me.listPrimitives()) p.dispose(); me.dispose(); log('post: dropped static node ' + nd.getName());
  }
  const mesh = doc.getRoot().listNodes().find((nd) => nd.getSkin() && nd.getMesh()).getMesh();
  const prims = mesh.listPrimitives();
  if (prims.length !== 1) { log('post: already split (' + prims.length + ' primitives)'); return; }
  const prim = prims[0], mat0 = prim.getMaterial();
  const Pp = prim.getAttribute('POSITION').getArray(), N0 = prim.getAttribute('NORMAL').getArray(), C0 = prim.getAttribute('COLOR_0').getArray();
  const J0 = prim.getAttribute('JOINTS_0').getArray(), W0 = prim.getAttribute('WEIGHTS_0').getArray(), I0 = prim.getIndices().getArray();
  const n = Pp.length / 3;
  const welded = weldWeights(Pp, J0, W0, n);
  // vertex positions are in the mesh's local frame; the asset field is in the bind world. Use the rig's meshWorld.
  const { M4 } = await import('../rig.mjs');
  const MW = M.rig.meshWorld;
  const wp = (v) => M4.pt(MW, Pp[v * 3], Pp[v * 3 + 1], Pp[v * 3 + 2]);
  // material per triangle: part at the centroid, nudged inside along the face normal
  const byMat = new Map(), counts = {};
  for (let t = 0; t < I0.length; t += 3) {
    const a = wp(I0[t]), b = wp(I0[t + 1]), c = wp(I0[t + 2]);
    const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const nn = V.norm(V.cross(V.sub(b, a), V.sub(c, a)));
    const p = M.shape.partAt(cen[0] - nn[0] * 0.001, cen[1] - nn[1] * 0.001, cen[2] - nn[2] * 0.001).name;
    const m = matOf(p); counts[m] = (counts[m] || 0) + 1;
    (byMat.get(m) || byMat.set(m, []).get(m)).push(I0[t], I0[t + 1], I0[t + 2]);
  }
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  mat0.setName(base);
  const mats = new Map([[base, mat0]]);
  const order = [base, ...[...byMat.keys()].filter((k) => k !== base).sort()];
  const old = prim;
  for (const mname of order) {
    const idx = byMat.get(mname); if (!idx) continue;
    const remap = new Map(), keep = [];
    for (const v of idx) if (!remap.has(v)) { remap.set(v, keep.length); keep.push(v); }
    const k = keep.length, P = new Float32Array(k * 3), N = new Float32Array(k * 3), C = new Float32Array(k * 3), W = new Float32Array(k * 4), J = new J0.constructor(k * 4), UV = glowOf ? new Float32Array(k * 2) : null;
    keep.forEach((v, i) => {
      for (let q = 0; q < 3; q++) { P[i * 3 + q] = Pp[v * 3 + q]; N[i * 3 + q] = N0[v * 3 + q]; C[i * 3 + q] = C0[v * 3 + q]; }
      for (let q = 0; q < 4; q++) { W[i * 4 + q] = W0[v * 4 + q]; J[i * 4 + q] = J0[v * 4 + q]; }
      if (UV) { const w = wp(v); UV[i * 2] = glowOf(M.shape.partAt(w[0], w[1], w[2]).name, w[0], w[1], w[2]); UV[i * 2 + 1] = 0.5; }
    });
    let m = mats.get(mname);
    if (!m) { m = mat0.clone().setName(mname); mats.set(mname, m); }
    const np = doc.createPrimitive()
      .setAttribute('POSITION', acc('VEC3', P)).setAttribute('NORMAL', acc('VEC3', N)).setAttribute('COLOR_0', acc('VEC3', C))
      .setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', W))
      .setIndices(acc('SCALAR', k > 65535 ? Uint32Array.from(idx, (v) => remap.get(v)) : Uint16Array.from(idx, (v) => remap.get(v))))
      .setMaterial(m);
    if (UV) np.setAttribute('TEXCOORD_0', acc('VEC2', UV));
    mesh.addPrimitive(np);
  }
  mesh.removePrimitive(old);
  for (const s of old.listSemantics()) { const a = old.getAttribute(s); old.setAttribute(s, null); a?.dispose(); }
  const ix = old.getIndices(); old.setIndices(null); ix?.dispose(); old.dispose();
  const bin = await io.writeBinary(doc); fs.writeFileSync(glbFile, bin);
  log(`post: welded ${welded} coincident vertices; primitives ${JSON.stringify(counts)} (tris); wrote ${glbFile} ${(bin.length / 1024).toFixed(0)} KB`);
  return { counts, bytes: bin.length };
}

// ============================================================================================== sheets from the final GLB
/**
 * opts: { name, glb, oldGlb, poses: [[clip, t]], dir, tint: { matName: [r,g,b] multiply } (the game's tint, for a GAME row),
 *         close: [{ c, d, az, el, label }] close-up cameras }
 */
export async function sheets(o) {
  const path = await import('node:path');
  const R = await import('../preview.mjs');
  const { loadRig, skinMesh, M4 } = await import('../rig.mjs');
  const rig = await loadRig(o.glb), oldRig = await loadRig(o.oldGlb);
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(o.glb);
  const matNames = doc.getRoot().listNodes().find((nd) => nd.getSkin() && nd.getMesh()).getMesh().listPrimitives().map((p) => p.getMaterial()?.getName() || '');
  const pose = (r, clip, t) => (clip === 'rest' ? r.joints.map(() => M4.id()) : r.pose(r.clip(clip), t));
  const tintCol = (col, mi) => { const k = o.tint?.[matNames[mi]]; if (!k || !col) return col; const c = new Float32Array(col.length); for (let i = 0; i < col.length; i += 3) for (let q = 0; q < 3; q++) c[i + q] = col[i + q] * k[q]; return c; };
  const newMesh = (S, mode) => rig.old.map((q, mi) => { const sk = skinMesh(q.pos, q.nrm, q.J, q.W, S); return { pos: sk.pos, nrm: sk.nrm, idx: q.idx, col: mode === 'clay' ? null : mode === 'game' ? tintCol(q.col, mi) : q.col, base: [1, 1, 1] }; });
  const oldMeshes = (S) => oldRig.old.map((q) => { const sk = skinMesh(q.pos, q.nrm, q.J, q.W, S); return { pos: sk.pos, nrm: sk.nrm, idx: q.idx, uv: q.uv, tex: q.tex, col: q.col, base: q.base || [1, 1, 1] }; });
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; let tris = 0;
  for (const q of rig.old) { tris += q.idx.length / 3; for (let i = 0; i < q.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], q.pos[i + k]); b[k + 3] = Math.max(b[k + 3], q.pos[i + k]); } }
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], fov = 35, dist0 = R.fitDistance(o.fitBounds || b, fov, 0.62), ts = 340;
  const save = (n, img) => { R.savePNG(path.join(o.dir, n), img); console.log('sheet ' + path.join(o.dir, n)); };
  const az0 = o.az ?? 60;
  if (!o.only || o.only.includes('poses')) {
    const tiles = [];
    for (const [clip, t] of o.poses) tiles.push({ img: R.render(oldMeshes(pose(oldRig, clip, t)), R.orbit(c, az0, 12, dist0, fov, ts, ts)), label: `OLD ${clip.split('|').pop()} ${t}` });
    for (const [clip, t] of o.poses) tiles.push({ img: R.render(newMesh(pose(rig, clip, t)), R.orbit(c, az0, 12, dist0, fov, ts, ts)), label: `NEW ${clip.split('|').pop()} ${t}` });
    for (const [clip, t] of o.poses) tiles.push({ img: R.render(newMesh(pose(rig, clip, t), 'clay'), R.orbit(c, -az0, 12, dist0, fov, ts, ts), { clay: true }), label: 'CLAY OTHER SIDE' });
    if (o.tint) for (const [clip, t] of o.poses) tiles.push({ img: R.render(newMesh(pose(rig, clip, t), 'game'), R.orbit(c, az0 + 140, 20, dist0, fov, ts, ts)), label: 'GAME TINT FROM BEHIND' });
    save('poses.png', R.sheet(tiles, o.poses.length, { title: `${o.name} POSES - OLD / NEW / CLAY / GAME TINT (FINAL GLB, ${tris} TRIS)` }));
  }
  const rest = pose(rig, 'rest', 0), orest = pose(oldRig, 'rest', 0);
  if (!o.only || o.only.includes('turntable')) {
    const views = [0, 45, 90, 135, 180, 225, 270, 315].map((az) => ({ img: R.render(newMesh(rest), R.orbit(c, az, 10, dist0, fov, 300, 300)), label: `${az} DEG` }));
    for (const [az, el] of [[30, 55], [210, 55], [0, 89], [90, -40]]) views.push({ img: R.render(newMesh(rest, 'clay'), R.orbit(c, az, el, dist0, fov, 300, 300), { clay: true }), label: `CLAY ${az}/${el}` });
    save('turntable.png', R.sheet(views, 4, { title: `${o.name} BIND POSE TURNTABLE + CLAY (FINAL GLB)` }));
  }
  if (!o.only || o.only.includes('before_after')) {
    const ba = [];
    const fp = o.baPose || ['rest', 0];
    const S1 = pose(rig, fp[0], fp[1]), S0 = pose(oldRig, fp[0], fp[1]);
    for (const az of [az0, 360 - az0]) { ba.push({ img: R.render(oldMeshes(S0), R.orbit(c, az, 12, dist0, fov, 440, 440)), label: 'BEFORE' }); ba.push({ img: R.render(newMesh(S1), R.orbit(c, az, 12, dist0, fov, 440, 440)), label: 'AFTER' }); }
    const H = b[4] - b[1], kk = 1 / Math.tan(25 * Math.PI / 180);
    for (const px of [120, 300]) {
      const d = (360 / 2) * kk * H / px, gc = R.camera([c[0] + d * 0.6, c[1] + d * 0.3, c[2] + d * 0.75], c, 50, 440, 330);
      ba.push({ img: R.render(oldMeshes(S0), gc), label: `BEFORE - GAME CAMERA ${px} PX` }, { img: R.render(newMesh(S1, o.tint ? 'game' : null), gc), label: `AFTER - GAME CAMERA ${px} PX${o.tint ? ' (TINT)' : ''}` });
    }
    save('before_after.png', R.sheet(ba, 2, { title: `${o.name} BEFORE / AFTER (FINAL GLB, ${fp[0]} ${fp[1]})` }));
  }
  if (o.close && (!o.only || o.only.includes('close'))) {
    const tiles = [];
    for (const k of o.close) {
      const S1 = pose(rig, k.pose?.[0] || 'rest', k.pose?.[1] || 0);
      tiles.push({ img: R.render(newMesh(S1, k.mode), R.orbit(k.c, k.az, k.el, k.d, 35, 380, 380), { clay: k.mode === 'clay', ground: k.ground ?? true }), label: k.label });
    }
    save('close.png', R.sheet(tiles, 4, { title: `${o.name} CLOSE LOOK (FINAL GLB)` }));
  }
}

// ------------------------------------------------------------------------------------------------ placement in a frame
/** place a shape modelled in local (x across, y along, z through) at origin o with axis ey = toward `tip`, ez ~ `face` */
export function frame(shape, o, tip, face) {
  const ey = V.norm(V.sub(tip, o)); let ez = V.sub(face, V.mul(ey, V.dot(face, ey))); ez = V.norm(ez); const ex = V.cross(ey, ez);
  const f = shape.f, pf = shape.pf, b = shape.b;
  const loc = (x, y, z) => { const p = [x - o[0], y - o[1], z - o[2]]; return [V.dot(p, ex), V.dot(p, ey), V.dot(p, ez)]; };
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < 8; i++) {
    const l = [b[i & 1 ? 3 : 0], b[i & 2 ? 4 : 1], b[i & 4 ? 5 : 2]];
    const w = V.add(o, V.add(V.add(V.mul(ex, l[0]), V.mul(ey, l[1])), V.mul(ez, l[2])));
    for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], w[k] - 0.002); bb[k + 3] = Math.max(bb[k + 3], w[k] + 0.002); }
  }
  return new S.Shape((x, y, z) => { const p = loc(x, y, z); return f(p[0], p[1], p[2]); }, bb, (x, y, z) => { const p = loc(x, y, z); return pf(p[0], p[1], p[2]); }, shape.lip);
}
/** distance from p to a polyline */
export function polyDist(P, p) {
  let best = 1e9;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], ab = V.sub(P[i + 1], a), t = clamp(V.dot(V.sub(p, a), ab) / (V.dot(ab, ab) || 1), 0, 1);
    best = Math.min(best, V.len(V.sub(p, V.add(a, V.mul(ab, t)))));
  }
  return best;
}
/** is this module the script node was started with? */
export function isMain(url) { return process.argv[1] && url.endsWith(process.argv[1].split('/').pop()) && url.includes(process.argv[1].replace(/^\.\//, '').split('/').slice(-3).join('/')); }

// ------------------------------------------------------------------------------------------- irregular field stone
/** inverse of S.turn(X, Y, Z degrees) about centre c (the frame block() uses) */
function invTurn(c, turn) {
  const T = turn.map((v) => (v * Math.PI) / 180);
  return (x, y, z) => {
    x -= c[0]; y -= c[1]; z -= c[2];
    const cz = Math.cos(-T[2]), sz = Math.sin(-T[2]); [x, y] = [x * cz - y * sz, x * sz + y * cz];
    const cy = Math.cos(-T[1]), sy = Math.sin(-T[1]); [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    const cx = Math.cos(-T[0]), sx = Math.sin(-T[0]); [y, z] = [y * cx - z * sx, y * sx + z * cx];
    return [x, y, z];
  };
}
/**
 * A split field stone: a lumpy ellipsoid sliced by a few unequal flat faces (one always underneath so stones stack),
 * no box anywhere. size = full extents; cuts = number of split faces; depth = how far a face bites (fraction of reach).
 */
export function fieldStone(c, size, { turn = [0, 0, 0], seed = 1, cuts = 4, depth = 0.16, lump = 0.045, egg = 0 } = {}) {
  const rnd = S.prng(seed * 17 + 3), h = size.map((v) => v / 2);
  let b = S.ellipsoid(h.map((v) => v * 1.1));
  if (egg) b = b.softAdd(S.ellipsoid([h[0] * 0.8, h[1] * 0.7, h[2] * 0.8]).at(0, h[1] * egg, 0), Math.min(...h) * 0.4);
  b = b.turn(...turn).at(...c);
  const sup = (n) => Math.hypot(n[0] * h[0], n[1] * h[1], n[2] * h[2]) * 1.1;
  const planes = [{ n: [0, -1, 0], o: sup([0, -1, 0]) * (0.86 - 0.06 * rnd()) }];
  for (let i = 0; i < cuts; i++) {
    const n = S.norm([(rnd() - 0.5) * 2, (rnd() - 0.4) * 1.6, (rnd() - 0.5) * 2]);
    planes.push({ n, o: sup(n) * (1 - depth * (0.5 + rnd())) });
  }
  const fn = b.f, inv = invTurn(c, turn);
  b = new S.Shape((x, y, z) => { let d = fn(x, y, z); const p = inv(x, y, z); for (const q of planes) { const v = V.dot(p, q.n) - q.o; if (v > d) d = v; } return d; }, b.b, b.pf, b.lip);
  const m = Math.min(...size);
  return b.rough({ type: 'fbm', scale: m * 0.7, amp: m * lump, oct: 2, seed: seed + 9 });
}
