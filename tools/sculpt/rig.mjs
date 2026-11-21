// Sculpting on a skeleton. Reads a rigged GLB of the game (skeleton, bind pose, inverse bind matrices, the old skinned
// mesh with its weights, the clips — or the clips of another GLB named by `clipsFrom`), exposes the bones to the sculptor
// as frames in the model's world space (metres, as the game places it), transfers skin weights from the old mesh to the
// new one (nearest surface point, then smoothing, then per-part corrections), writes a skinned GLB that keeps every joint,
// the hierarchy, the inverse bind matrices and the clips untouched (only the mesh primitive is replaced), and poses
// meshes with clips for the preview.
//
// Skinning follows glTF / three.js (attached bind mode re-inverts the mesh's own matrix every frame, GLTFLoader binds with
// identity): world = sum_i w_i * jointWorld_i * IBM_i * v_local — the skinned node's own transform is ignored.
// The sculptor works in the bind-pose world (B * v_local, B = jointWorld * IBM at rest, the same for every joint).
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PARTS } from './sdf.mjs';
import { extract, simplify, splitNormals, checkMesh } from './mesh.mjs';
import { bakeVertexColors } from './bake.mjs';
import * as R from './preview.mjs';

// ------------------------------------------------------------------------------------------------------------- mat4
// column-major like glTF / three
export const M4 = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
  },
  mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  inv(m) {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06, d = 1 / det;
    return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
      (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
      (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
      (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d];
  },
  pt(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; },
  dir(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; },
};
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1;
  if (d < 0) { d = -d; s = -1; }
  let k0 = 1 - t, k1 = t * s;
  if (d < 0.9995) { const th = Math.acos(d), sn = Math.sin(th); k0 = Math.sin((1 - t) * th) / sn; k1 = (Math.sin(t * th) / sn) * s; }
  const o = [a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1, a[3] * k0 + b[3] * k1];
  const l = Math.hypot(...o); return o.map((v) => v / l);
};

// ------------------------------------------------------------------------------------------------------------- load
/** opts: { file, clipsFrom?: path to a GLB whose clips drive this skeleton (matched by joint name) } */
export async function loadRig(file, opts = {}) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const parent = new Map();
  for (const n of nodes) for (const c of n.listChildren()) parent.set(c, n);
  const rest = new Map(nodes.map((n) => [n, { t: n.getTranslation(), r: n.getRotation(), s: n.getScale() }]));
  const worldOf = (pose) => {
    const W = new Map();
    const get = (n) => {
      if (W.has(n)) return W.get(n);
      const p = pose.get(n) || rest.get(n);
      const L = M4.trs(p.t, p.r, p.s);
      const P = parent.get(n); const w = P ? M4.mul(get(P), L) : L; W.set(n, w); return w;
    };
    for (const n of nodes) get(n);
    return W;
  };
  const restWorld = worldOf(new Map());
  const meshNode = nodes.find((n) => n.getSkin() && n.getMesh());
  const skin = meshNode.getSkin();
  const joints = skin.listJoints();
  const ibmArr = skin.getInverseBindMatrices().getArray();
  const IBM = joints.map((_, i) => Array.from(ibmArr.slice(i * 16, i * 16 + 16)));
  const S0 = joints.map((j, i) => M4.mul(restWorld.get(j), IBM[i]));
  // B: the bind transform shared by most joints (a joint whose rest pose differs from its bind pose gives another S0)
  const keyOf = (m) => m.map((v) => v.toFixed(4)).join();
  const votes = new Map(); for (const m of S0) votes.set(keyOf(m), (votes.get(keyOf(m)) || 0) + 1);
  const bestKey = [...votes].sort((a, b) => b[1] - a[1])[0][0];
  const B = S0.find((m) => keyOf(m) === bestKey), Binv = M4.inv(B);
  const meshWorld = B; // the bind-pose world transform of the mesh's local coordinates
  // old mesh in world space (bind) with dense weights
  const prims = meshNode.getMesh().listPrimitives();
  const old = prims.map((p) => {
    const P = p.getAttribute('POSITION').getArray(), J = p.getAttribute('JOINTS_0').getArray(), Wt = p.getAttribute('WEIGHTS_0').getArray();
    const N = p.getAttribute('NORMAL')?.getArray(), UV = p.getAttribute('TEXCOORD_0')?.getArray(), C = p.getAttribute('COLOR_0');
    const nv = P.length / 3, pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) {
      pos.set(M4.pt(B, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), v * 3); // bind pose, in the game's world
      if (N) { const d = M4.dir(meshWorld, N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); const l = Math.hypot(...d) || 1; nrm.set(d.map((x) => x / l), v * 3); }
    }
    let col = null;
    if (C) { const a = C.getArray(), ec = C.getElementSize(), norm = C.getNormalized() ? (a instanceof Uint8Array ? 255 : 65535) : 1; col = new Float32Array(nv * 3); for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) col[v * 3 + k] = a[v * ec + k] / norm; }
    const m = p.getMaterial(), bt = m?.getBaseColorTexture();
    let tex = null; if (bt) { const d = R.decodePNG(Buffer.from(bt.getImage())); tex = R.texture(d.w, d.h, d.rgba, true); }
    const bf = m?.getBaseColorFactor() || [1, 1, 1, 1];
    return { pos, nrm, idx: p.getIndices() ? Uint32Array.from(p.getIndices().getArray()) : Uint32Array.from({ length: nv }, (_, i) => i), J: Uint16Array.from(J), W: Float32Array.from(Wt), uv: UV ? Float32Array.from(UV) : null, col, tex, base: bf.slice(0, 3) };
  });
  // clips
  let clipDoc = doc, clipNodes = nodes;
  if (opts.clipsFrom) { clipDoc = await io.read(opts.clipsFrom); clipNodes = clipDoc.getRoot().listNodes(); }
  const byName = new Map(nodes.map((n) => [n.getName(), n]));
  const clips = clipDoc.getRoot().listAnimations().map((a) => ({
    name: a.getName(),
    channels: a.listChannels().map((c) => {
      const s = c.getSampler();
      return { node: byName.get(c.getTargetNode().getName()), path: c.getTargetPath(), t: s.getInput().getArray(), v: s.getOutput().getArray(), interp: s.getInterpolation() };
    }).filter((c) => c.node && c.path !== 'weights'),
  }));
  for (const c of clips) c.duration = Math.max(0, ...c.channels.map((ch) => ch.t[ch.t.length - 1]));
  void clipNodes;

  // bones as sculpting frames (world space, bind pose)
  const jointNames = joints.map((j) => j.getName());
  // joint frames in the BIND pose: B * inverse(IBM)
  const bindWorld = new Map(joints.map((j, i) => [j, M4.mul(B, M4.inv(IBM[i]))]));
  const head = (n) => { const w = bindWorld.get(n) || restWorld.get(n); return [w[12], w[13], w[14]]; };
  const bone = (name) => {
    const n = byName.get(name); if (!n) throw new Error('no bone ' + name + ' (bones: ' + jointNames.join(', ') + ')');
    const h = head(n);
    const kids = n.listChildren();
    const t = kids.length ? head(kids[0]) : M4.pt(bindWorld.get(n) || restWorld.get(n), 0, 1, 0);
    const d = [t[0] - h[0], t[1] - h[1], t[2] - h[2]], len = Math.hypot(...d);
    return { name, head: h, tail: t, len, dir: d.map((v) => v / (len || 1)), world: bindWorld.get(n), at: (u) => [h[0] + d[0] * u, h[1] + d[1] * u, h[2] + d[2] * u] };
  };
  const rig = {
    file, doc, io, nodes, joints, jointNames, IBM, meshNode, meshWorld, old, clips, bone, restWorld, opts,
    /** 'Leg.{side}' -> 'Leg.L' or 'Leg.R' by which side of the body x lies on */
    sideOf: (x) => { const l = byName.get(jointNames.find((n) => /\.L$|_L$|Left/i.test(n))); if (!l) return 'L'; return Math.sign(head(l)[0]) === Math.sign(x || 1e-9) ? 'L' : 'R'; },
    clip(name) { const c = clips.find((k) => k.name === name) || clips.find((k) => k.name.includes(name)); if (!c) throw new Error('no clip ' + name); return c; },
    /** world matrices of all joints for a clip at time t (seconds) */
    pose(clip, t) {
      const c = typeof clip === 'string' ? rig.clip(clip) : clip;
      const pose = new Map();
      for (const ch of c.channels) {
        const p = pose.get(ch.node) || { ...rest.get(ch.node) }; pose.set(ch.node, p);
        const T = ch.t, n = ch.path === 'rotation' ? 4 : 3, cubic = ch.interp === 'CUBICSPLINE';
        const val = (i) => { const o = cubic ? (i * 3 + 1) * n : i * n; return Array.from(ch.v.slice(o, o + n)); };
        let i = 0; while (i < T.length - 1 && T[i + 1] < t) i++;
        let v;
        if (t <= T[0]) v = val(0); else if (t >= T[T.length - 1]) v = val(T.length - 1);
        else {
          const u = ch.interp === 'STEP' ? 0 : (t - T[i]) / (T[i + 1] - T[i]);
          const a = val(i), b = val(i + 1);
          v = n === 4 ? slerp(a, b, u) : a.map((x, k) => x + (b[k] - x) * u);
        }
        if (ch.path === 'translation') p.t = v; else if (ch.path === 'rotation') p.r = v; else p.s = v;
      }
      const W = worldOf(pose);
      return joints.map((j, i) => M4.mul(M4.mul(W.get(j), IBM[i]), Binv)); // skin matrices (apply to world-bind positions)
    },
  };
  // the rest pose must give back the bind mesh (checks IBM convention)
  // every joint's rest skin matrix must be the same B (else the bind pose is not the rest pose)
  rig.restDiffers = joints.filter((j, i) => keyOf(S0[i]) !== bestKey).map((j) => j.getName());
  rig.restError = rig.restDiffers.length;
  return rig;
}

/** skin positions/normals (world bind) with joints J (4 per vertex) / weights W by skin matrices S */
export function skinMesh(pos, nrm, J, W, S) {
  const n = pos.length / 3, P = new Float32Array(n * 3), N = nrm ? new Float32Array(n * 3) : null;
  for (let v = 0; v < n; v++) {
    let x = 0, y = 0, z = 0, a = 0, b = 0, c = 0;
    for (let k = 0; k < 4; k++) {
      const w = W[v * 4 + k]; if (!w) continue;
      const m = S[J[v * 4 + k]];
      const p = M4.pt(m, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); x += w * p[0]; y += w * p[1]; z += w * p[2];
      if (N) { const d = M4.dir(m, nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]); a += w * d[0]; b += w * d[1]; c += w * d[2]; }
    }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    if (N) { const l = Math.hypot(a, b, c) || 1; N[v * 3] = a / l; N[v * 3 + 1] = b / l; N[v * 3 + 2] = c / l; }
  }
  return { pos: P, nrm: N };
}

// ---------------------------------------------------------------------------------------------------- weight transfer
/**
 * Weights for a new mesh (world bind positions): nearest point on the old skinned surface, barycentric blend of its
 * weights; then `smooth` rounds of neighbour averaging (joint seams soften); then per-part corrections:
 *   part.bone = 'Leg.{side}'                      rigid to one bone
 *   part.blend = { from, to, width }              from -> to across the head of `to` (width m either side)
 *   part.smooth = false                          keep transferred weights exactly
 * Returns { J: Uint16Array (4/vertex), W: Float32Array (4/vertex), dense, stats }
 */
export function transferWeights(rig, mesh, vertPart, { smooth = 3, smoothAlpha = 0.5 } = {}) {
  const nJ = rig.joints.length, n = mesh.pos.length / 3;
  const dense = new Float32Array(n * nJ);
  // old triangles (all primitives) with dense corner weights
  const tris = [];
  for (const o of rig.old) for (let t = 0; t < o.idx.length; t += 3) tris.push([o, o.idx[t], o.idx[t + 1], o.idx[t + 2]]);
  // grid for nearest search
  const cell = 0.03, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  tris.forEach((tr, i) => {
    const [o, a, b, c] = tr, P = o.pos;
    const lo = [0, 1, 2].map((k) => Math.min(P[a * 3 + k], P[b * 3 + k], P[c * 3 + k])), hi = [0, 1, 2].map((k) => Math.max(P[a * 3 + k], P[b * 3 + k], P[c * 3 + k]));
    for (let x = Math.floor(lo[0] / cell); x <= Math.floor(hi[0] / cell); x++) for (let y = Math.floor(lo[1] / cell); y <= Math.floor(hi[1] / cell); y++) for (let z = Math.floor(lo[2] / cell); z <= Math.floor(hi[2] / cell); z++) {
      const k = `${x},${y},${z}`; let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i);
    }
  });
  let maxDist = 0, sumDist = 0;
  for (let v = 0; v < n; v++) {
    const px = mesh.pos[v * 3], py = mesh.pos[v * 3 + 1], pz = mesh.pos[v * 3 + 2];
    let best = Infinity, bt = -1, bw = null;
    for (let r = 0; r < 12 && (bt < 0 || best > (r - 1) * cell); r++) {
      const cx = Math.floor(px / cell), cy = Math.floor(py / cell), cz = Math.floor(pz / cell);
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== r) continue;
        const l = grid.get(`${x},${y},${z}`); if (!l) continue;
        for (const i of l) {
          const [o, a, b, c] = tris[i];
          const q = closestOnTri(px, py, pz, o.pos, a, b, c);
          if (q.d < best) { best = q.d; bt = i; bw = q.w; }
        }
      }
    }
    if (bt < 0) continue;
    maxDist = Math.max(maxDist, best); sumDist += best;
    const [o, a, b, c] = tris[bt];
    [a, b, c].forEach((vi, k) => { for (let j = 0; j < 4; j++) dense[v * nJ + o.J[vi * 4 + j]] += bw[k] * o.W[vi * 4 + j]; });
  }
  // smoothing over the new mesh's edges (position-welded via src when given)
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < mesh.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = mesh.idx[t + k], b = mesh.idx[t + (k + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  if (mesh.weld) { // vertices split for normals share neighbours
    const groups = new Map(); for (let v = 0; v < n; v++) { const g = groups.get(mesh.weld[v]); if (g) g.push(v); else groups.set(mesh.weld[v], [v]); }
    for (const g of groups.values()) for (const a of g) for (const b of g) if (a !== b) nb[a].add(b);
  }
  const lockedSmooth = (v) => PARTS[vertPart[v]]?.smooth === false;
  for (let it = 0; it < smooth; it++) {
    const next = dense.slice();
    for (let v = 0; v < n; v++) {
      if (lockedSmooth(v) || !nb[v].size) continue;
      for (let j = 0; j < nJ; j++) { let s = 0; for (const u of nb[v]) s += dense[u * nJ + j]; next[v * nJ + j] = dense[v * nJ + j] * (1 - smoothAlpha) + (s / nb[v].size) * smoothAlpha; }
    }
    dense.set(next);
  }
  // corrections per part
  const jIndex = (name) => { const i = rig.jointNames.indexOf(name); if (i < 0) throw new Error('no joint ' + name); return i; };
  const resolve = (s, x) => s.replace('{side}', rig.sideOf(x));
  let corrected = 0;
  for (let v = 0; v < n; v++) {
    const p = PARTS[vertPart[v]]; if (!p || (!p.bone && !p.blend)) continue;
    const x = mesh.pos[v * 3];
    for (let j = 0; j < nJ; j++) dense[v * nJ + j] = 0;
    if (p.bone) dense[v * nJ + jIndex(resolve(p.bone, x))] = 1;
    else {
      const to = rig.bone(resolve(p.blend.to, x)), w = p.blend.width ?? 0.02;
      const d = (mesh.pos[v * 3] - to.head[0]) * to.dir[0] + (mesh.pos[v * 3 + 1] - to.head[1]) * to.dir[1] + (mesh.pos[v * 3 + 2] - to.head[2]) * to.dir[2];
      const t = Math.max(0, Math.min(1, (d + w) / (2 * w))), s = t * t * (3 - 2 * t);
      dense[v * nJ + jIndex(resolve(p.blend.from, x))] += 1 - s; dense[v * nJ + jIndex(to.name)] += s;
    }
    corrected++;
  }
  // top 4, normalised
  const J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const ord = Array.from({ length: nJ }, (_, j) => j).sort((a, b) => dense[v * nJ + b] - dense[v * nJ + a]).slice(0, 4);
    const s = ord.reduce((a, j) => a + dense[v * nJ + j], 0) || 1;
    ord.forEach((j, k) => { J[v * 4 + k] = j; W[v * 4 + k] = dense[v * nJ + j] / s; });
    if (!(s > 0)) { J[v * 4] = 0; W[v * 4] = 1; }
  }
  return { J, W, dense, stats: { meanDist: sumDist / n, maxDist, corrected } };
}
function closestOnTri(px, py, pz, P, a, b, c) {
  const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
  const abx = P[b * 3] - ax, aby = P[b * 3 + 1] - ay, abz = P[b * 3 + 2] - az, acx = P[c * 3] - ax, acy = P[c * 3 + 1] - ay, acz = P[c * 3 + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const fin = (u, v) => { const w = 1 - u - v; const qx = ax + abx * u + acx * v, qy = ay + aby * u + acy * v, qz = az + abz * u + acz * v; return { d: Math.hypot(px - qx, py - qy, pz - qz), w: [w, u, v] }; };
  if (d1 <= 0 && d2 <= 0) return fin(0, 0);
  const bpx = px - P[b * 3], bpy = py - P[b * 3 + 1], bpz = pz - P[b * 3 + 2];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return fin(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return fin(d1 / (d1 - d3), 0);
  const cpx = px - P[c * 3], cpy = py - P[c * 3 + 1], cpz = pz - P[c * 3 + 2];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return fin(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return fin(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return fin(1 - w, w); }
  const den = 1 / (va + vb + vc); return fin(vb * den, vc * den);
}

// --------------------------------------------------------------------------------------------------------- skinned GLB
/** replace the skinned mesh's primitives with the new mesh; joints, hierarchy, IBMs and clips stay byte-for-byte */
export async function writeSkinnedGLB(rig, file, mesh, { materialName } = {}) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(rig.file);
  const meshNode = doc.getRoot().listNodes().find((n) => n.getSkin() && n.getMesh());
  const gm = meshNode.getMesh();
  const oldPrims = gm.listPrimitives();
  const mat = oldPrims[0].getMaterial();
  const jt = oldPrims[0].getAttribute('JOINTS_0').getArray();
  const buf = doc.getRoot().listBuffers()[0];
  const inv = M4.inv(rig.meshWorld);
  const n = mesh.pos.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    P.set(M4.pt(inv, mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]), v * 3);
    const d = M4.dir(inv, mesh.nrm[v * 3], mesh.nrm[v * 3 + 1], mesh.nrm[v * 3 + 2]); const l = Math.hypot(...d) || 1; N.set(d.map((x) => x / l), v * 3);
  }
  const Jarr = jt instanceof Uint8Array ? Uint8Array.from(mesh.J) : Uint16Array.from(mesh.J);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(P).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(buf))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(mesh.col)).setBuffer(buf))
    .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(Jarr).setBuffer(buf))
    .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(Float32Array.from(mesh.W)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(n > 65535 ? Uint32Array.from(mesh.idx) : Uint16Array.from(mesh.idx)).setBuffer(buf))
    .setMaterial(mat);
  for (const p of oldPrims) { gm.removePrimitive(p); for (const s of p.listSemantics()) { const a = p.getAttribute(s); p.setAttribute(s, null); if (a && !a.listParents().some((x) => x !== doc.getRoot())) a.dispose(); } const ix = p.getIndices(); p.setIndices(null); if (ix && !ix.listParents().some((x) => x !== doc.getRoot())) ix.dispose(); p.dispose(); }
  gm.addPrimitive(prim);
  // vertex colours replace the atlas: drop the texture, keep the material (name, cel kind) as it was
  const tex = mat.getBaseColorTexture(); mat.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]);
  if (tex && !tex.listParents().some((x) => x !== doc.getRoot())) tex.dispose();
  if (materialName) mat.setName(materialName);
  mat.setExtras({ ...(mat.getExtras() || {}), sculpt: { author: 'sculpted for this project', vertexColors: true } });
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(file, bin);
  return bin.length;
}

/** verify that joints, hierarchy, IBMs and clips match the source byte-for-byte */
export async function compareRigs(a, b) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const [A, B] = await Promise.all([io.read(a), io.read(b)]);
  const sk = (d) => d.getRoot().listSkins()[0];
  const names = (d) => sk(d).listJoints().map((j) => j.getName() + '<' + (j.listParents().find((p) => p.propertyType === 'Node')?.getName() || ''));
  const ibmA = Buffer.from(sk(A).getInverseBindMatrices().getArray().buffer.slice(0)), ibmB = Buffer.from(sk(B).getInverseBindMatrices().getArray().buffer.slice(0));
  const trsA = A.getRoot().listNodes().map((n) => [n.getName(), ...n.getTranslation(), ...n.getRotation(), ...n.getScale()].join()), trsB = B.getRoot().listNodes().map((n) => [n.getName(), ...n.getTranslation(), ...n.getRotation(), ...n.getScale()].join());
  const clips = (d) => d.getRoot().listAnimations().map((x) => x.getName() + ':' + x.listChannels().map((c) => c.getTargetNode().getName() + c.getTargetPath() + Buffer.from(c.getSampler().getOutput().getArray().buffer).toString('base64').length).join());
  return { joints: names(A).join() === names(B).join(), ibm: ibmA.equals(ibmB), nodes: trsA.join('|') === trsB.join('|'), clips: clips(A).join('|') === clips(B).join('|') };
}

// --------------------------------------------------------------------------------------------------------- build path
export async function buildSkinned(M, pool, { outDir, glbDir, log, T0 }) {
  const rig = M.rig, cfg = M.cfg, name = M.def.name;
  log(`  rig: ${rig.joints.length} joints (${rig.jointNames.join(', ')}), ${rig.clips.length} clips, joints whose node rest differs from the bind pose: ${rig.restDiffers.join(', ') || 'none'}`);
  const { faceTags } = await import('./build.mjs');
  const full = await extract(M, pool, cfg.voxel, log);
  const tags = await faceTags(pool, full.pos, full.idx);
  const target = cfg.lods[0];
  const s = simplify(full.pos, full.idx, target, { faceTag: tags.part, hardAngle: cfg.hardAngle ?? 60 });
  const sn = splitNormals(s.pos, s.idx, cfg.creaseAngle ?? 70, { faceTag: s.tag, splitTags: false });
  log(`  mesh: ${s.idx.length / 3} tris, ${sn.pos.length / 3} verts`);
  const vc = await bakeVertexColors(pool, sn.pos, M);
  const tw = transferWeights(rig, { pos: sn.pos, idx: sn.idx, weld: sn.src }, vc.part, cfg.weights || {});
  log(`  weights: nearest old surface mean ${(tw.stats.meanDist * 1000).toFixed(1)} mm, max ${(tw.stats.maxDist * 1000).toFixed(1)} mm; ${tw.stats.corrected} vertices corrected by part rules`);
  const mesh = { pos: sn.pos, nrm: sn.nrm, idx: sn.idx, col: vc.col, J: tw.J, W: tw.W };
  const glb = path.join(glbDir, name + '.glb');
  const bytes = await writeSkinnedGLB(rig, glb, mesh);
  const same = await compareRigs(rig.file, glb);
  log(`  wrote ${path.relative(process.cwd(), glb)} (${(bytes / 1024).toFixed(0)} KB); rig kept: ${JSON.stringify(same)}`);
  // deformation stats over every clip: max edge stretch (candy wrapper / collapse detector)
  const deform = deformStats(rig, mesh);
  log(`  deformation over all clips: edge stretch ${deform.minStretch.toFixed(2)} .. ${deform.maxStretch.toFixed(2)}, worst at ${deform.worst} near ${deform.worstAt}; per clip (1% / 99% / 99.9%): ${JSON.stringify(deform.perClip)}`);
  // sheets
  poseSheets(M, rig, mesh, outDir, log);
  const checks = { name, mesh: checkMesh(s.pos, s.idx), weights: tw.stats, rigKept: same, deform, fileKB: Math.round(bytes / 1024), buildSeconds: +((Date.now() - T0) / 1000).toFixed(1) };
  fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 1));
  const frag = { [M.def.id || 'sculpt_' + name]: { file: `models/sculpt/${name}.glb`, type: 'model', license: 'CC0 (original body sculpted for this project; skeleton and clips from the source pack, CC0)', author: 'sculpted for this project (rig: ' + (M.def.rigCredit || 'source pack') + ')', source: `tools/sculpt/assets/${name}.mjs`, scale: 1, tris: s.idx.length / 3, clips: rig.clips.map((c) => c.name), notes: M.def.notes || '' } };
  fs.writeFileSync(path.join(glbDir, name + '.manifest.json'), JSON.stringify(frag, null, 1) + '\n');
}

function deformStats(rig, mesh) {
  const edges = [];
  for (let t = 0; t < mesh.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = mesh.idx[t + k], b = mesh.idx[t + (k + 1) % 3]; if (a < b) edges.push(a, b); }
  const L0 = []; for (let e = 0; e < edges.length; e += 2) L0.push(dist(mesh.pos, edges[e], edges[e + 1]));
  let mn = Infinity, mx = 0, worst = '', worstAt = null;
  const perClip = {};
  for (const c of rig.clips) {
    const all = [];
    for (let i = 0; i <= 8; i++) {
      const t = (c.duration * i) / 8, P = skinMesh(mesh.pos, null, mesh.J, mesh.W, rig.pose(c, t)).pos;
      for (let e = 0; e < edges.length; e += 2) {
        if (L0[e / 2] < 1e-4) continue;
        const r = dist(P, edges[e], edges[e + 1]) / L0[e / 2];
        all.push(r);
        if (r < mn) mn = r; if (r > mx) { mx = r; worst = `${c.name.split('|').pop()} t=${t.toFixed(2)}`; worstAt = Array.from(mesh.pos.slice(edges[e] * 3, edges[e] * 3 + 3), (v) => +v.toFixed(3)); }
      }
    }
    all.sort((p, q) => p - q);
    perClip[c.name.split('|').pop()] = { p1: +all[Math.floor(all.length * 0.01)].toFixed(2), p99: +all[Math.floor(all.length * 0.99)].toFixed(2), p999: +all[Math.floor(all.length * 0.999)].toFixed(2) };
  }
  return { minStretch: mn, maxStretch: mx, worst, worstAt, perClip };
}
const dist = (P, a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);

function poseSheets(M, rig, mesh, outDir, log) {
  const poses = M.def.poses || rig.clips.slice(0, 3).flatMap((c) => [[c.name, c.duration * 0.25], [c.name, c.duration * 0.6]]);
  const oldMeshes = (S) => rig.old.map((o) => { const sk = skinMesh(o.pos, o.nrm, o.J, o.W, S); return { pos: sk.pos, nrm: sk.nrm, idx: o.idx, uv: o.uv, tex: o.tex, col: o.col, base: o.base }; });
  const newMesh = (S, clay) => { const sk = skinMesh(mesh.pos, mesh.nrm, mesh.J, mesh.W, S); return [{ pos: sk.pos, nrm: sk.nrm, idx: mesh.idx, col: clay ? null : mesh.col, base: [1, 1, 1] }]; };
  const rest = rig.joints.map(() => M4.id());
  const b = M.bounds, c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], fov = 35, dist0 = R.fitDistance(b, fov, 0.62), ts = 360;
  const save = (n, img) => { R.savePNG(path.join(outDir, n), img); log(`  sheet ${path.join('.tmp/sculpt', M.def.name, n)}`); };
  const tiles = [];
  for (const [clip, t] of poses) tiles.push({ img: R.render(oldMeshes(rig.pose(clip, t)), R.orbit(c, 60, 12, dist0, fov, ts, ts)), label: `OLD ${clip.split('|').pop()} ${t.toFixed(2)}` });
  for (const [clip, t] of poses) tiles.push({ img: R.render(newMesh(rig.pose(clip, t)), R.orbit(c, 60, 12, dist0, fov, ts, ts)), label: `NEW ${clip.split('|').pop()} ${t.toFixed(2)}` });
  for (const [clip, t] of poses) tiles.push({ img: R.render(newMesh(rig.pose(clip, t), true), R.orbit(c, -60, 12, dist0, fov, ts, ts), { clay: true }), label: `CLAY OTHER SIDE` });
  save('poses.png', R.sheet(tiles, poses.length, { title: `${M.def.name} POSES - OLD / NEW / NEW CLAY (OTHER SIDE)` }));
  const views = [0, 45, 90, 135, 180, 225, 270, 315];
  save('turntable.png', R.sheet(views.map((az) => ({ img: R.render(newMesh(rest), R.orbit(c, az, 10, dist0, fov, 300, 300)), label: `${az} DEG` })), 4, { title: `${M.def.name} BIND POSE TURNTABLE` }));
  const ba = [];
  for (const az of [60, 300]) { ba.push({ img: R.render(oldMeshes(rest), R.orbit(c, az, 12, dist0, fov, 480, 480)), label: 'BEFORE' }); ba.push({ img: R.render(newMesh(rest), R.orbit(c, az, 12, dist0, fov, 480, 480)), label: 'AFTER' }); }
  // game camera: about 120 px tall
  const k = 1 / Math.tan(25 * Math.PI / 180), H = b[4] - b[1], d = (360 / 2) * k * H / 110;
  const gc = R.camera([c[0] + d * 0.6, c[1] + d * 0.3, c[2] + d * 0.75], c, 50, 480, 360);
  ba.push({ img: R.render(oldMeshes(rest), gc), label: 'BEFORE - GAME CAMERA' }, { img: R.render(newMesh(rest), gc), label: 'AFTER - GAME CAMERA' });
  save('before_after.png', R.sheet(ba, 2, { title: `${M.def.name} BEFORE / AFTER` }));
}
