// Skin weights for a VRoid-skeleton figure sculpted anew: the kit's nearest-surface transfer from the donor body, then
// corrections per region — helper bones folded into the body's bones, a rigid head, fingers and thumb weighted
// analytically on their bone chains (a nearest-surface transfer mixes neighbouring fingers) — and poses for the sheets
// (clips of the libraries, or hand-set joint rotations).
import { transferWeights, M4 } from '../rig.mjs';
import { sm } from './paint.mjs';

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];

/**
 * rig: kit rig (loadRig of the rig source). mesh: { pos, idx }. opts: { headRigid(x, y, z) -> 0..1, smooth }
 * -> { J (Uint16 x4), W (Float32 x4), dense }
 */
export function figureWeights(rig, mesh, { headRigid = null, smooth = 2 } = {}) {
  const n = mesh.pos.length / 3, nJ = rig.joints.length, names = rig.jointNames, ix = (nm) => names.indexOf(nm);
  const tw = transferWeights(rig, mesh, new Int32Array(n), { smooth, smoothAlpha: 0.5 });
  const D = tw.dense, head = (nm) => rig.bone(nm).head;
  // 1. helper joints (bust, old skirt / sleeve chains, hair, eyes) -> the nearest body bone up the hierarchy
  const parentOf = new Map(); for (const nd of rig.nodes) for (const c of nd.listChildren()) parentOf.set(c.getName(), nd.getName());
  const foldTo = names.map((nm, i) => { let p = nm; while (p && !/^J_Bip_/.test(p)) p = parentOf.get(p); return p ? ix(p) : i; });
  for (let v = 0; v < n; v++) for (let j = 0; j < nJ; j++) { const t = foldTo[j]; if (t !== j && t >= 0) { const w = D[v * nJ + j]; if (w) { D[v * nJ + t] += w; D[v * nJ + j] = 0; } } }
  // 1b. neck (revision 2): the donor's neck is short and thick, its weights land on this longer, slimmer one as a hinge
  //     that throws cords and folds when the head bows. Along the column the three bones now share the bend by height.
  {
    const iN = ix('J_Bip_C_Neck'), iH = ix('J_Bip_C_Head'), iC = ix('J_Bip_C_UpperChest'), nk = head('J_Bip_C_Neck'), hd = head('J_Bip_C_Head');
    const A = [0, 1.238, -0.024], B = [0, 1.352, -0.004], ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    for (let v = 0; v < n; v++) {
      const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1], z = mesh.pos[v * 3 + 2];
      if (y < nk[1] - 0.034 || y > hd[1] + 0.03) continue;
      const t = Math.max(0, Math.min(1, ((x - A[0]) * ab[0] + (y - A[1]) * ab[1] + (z - A[2]) * ab[2]) / l2));
      const r = Math.hypot(x - A[0] - ab[0] * t, y - A[1] - ab[1] * t, z - A[2] - ab[2] * t);
      const mask = (1 - sm(0.04, 0.064, r)) * sm(nk[1] - 0.034, nk[1] - 0.008, y) * 0.9;
      if (mask <= 0) continue;
      const wH = sm(hd[1] - 0.044, hd[1] + 0.006, y), wC = 1 - sm(nk[1] - 0.03, nk[1] + 0.024, y), wN = Math.max(0, 1 - wH - wC), s = wH + wC + wN;
      for (let j = 0; j < nJ; j++) D[v * nJ + j] *= 1 - mask;
      D[v * nJ + iH] += mask * wH / s; D[v * nJ + iC] += mask * wC / s; D[v * nJ + iN] += mask * wN / s;
    }
  }
  // 1c. elbows (revision 2): a narrow hand-over on the inside of the bend (a fold, not a thinning tube), a wide one over
  //     the point of the elbow. In the bind pose the fold faces +z (palms down).
  for (const S of ['L', 'R']) {
    const iU = ix(`J_Bip_${S}_UpperArm`), iL = ix(`J_Bip_${S}_LowerArm`), sh = head(`J_Bip_${S}_UpperArm`), el = head(`J_Bip_${S}_LowerArm`), wr = head(`J_Bip_${S}_Hand`);
    const a = [wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]], al = Math.hypot(...a); a[0] /= al; a[1] /= al; a[2] /= al;
    const lu = Math.hypot(el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]);
    for (let v = 0; v < n; v++) {
      const px = mesh.pos[v * 3] - el[0], py = mesh.pos[v * 3 + 1] - el[1], pz = mesh.pos[v * 3 + 2] - el[2];
      const t = px * a[0] + py * a[1] + pz * a[2];
      if (t < -lu * 0.45 || t > al * 0.45) continue;
      const share = D[v * nJ + iU] + D[v * nJ + iL]; if (share < 0.6) continue;
      const front = Math.max(-1, Math.min(1, pz / 0.028)), half = 0.027 - 0.013 * (front * 0.5 + 0.5);
      const wL = sm(-half, half, t - 0.003 * front), k = 0.75 * sm(0.6, 0.9, share) * (1 - sm(lu * 0.3, lu * 0.45, -t)) * (1 - sm(al * 0.3, al * 0.45, t));
      D[v * nJ + iU] += k * (share * (1 - wL) - D[v * nJ + iU]); D[v * nJ + iL] = share - D[v * nJ + iU];
    }
  }
  // 2. head: rigid above the jaw
  const iHead = ix('J_Bip_C_Head');
  if (headRigid) for (let v = 0; v < n; v++) {
    const k = headRigid(mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]); if (k <= 0) continue;
    for (let j = 0; j < nJ; j++) D[v * nJ + j] *= 1 - k;
    D[v * nJ + iHead] += k;
  }
  // 3. hands: the share the donor gave to the hand + fingers is redistributed along the bone chains
  for (const S of ['L', 'R']) {
    const iHand = ix(`J_Bip_${S}_Hand`), wrist = head(`J_Bip_${S}_Hand`), sg = S === 'L' ? 1 : -1;
    const chains = [...FINGERS, 'Thumb'].map((f) => ({ f, pts: [1, 2, 3].map((k) => head(`J_Bip_${S}_${f}${k}`)).concat([head(`J_Bip_${S}_${f}3_end`)]), ids: [1, 2, 3].map((k) => ix(`J_Bip_${S}_${f}${k}`)) }));
    const handSet = [iHand, ...chains.flatMap((c) => c.ids)];
    const wv = new Float32Array(nJ);
    for (let v = 0; v < n; v++) {
      const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1], z = mesh.pos[v * 3 + 2];
      if (x * sg < wrist[0] * sg - 0.02) continue;
      let share = 0; for (const j of handSet) share += D[v * nJ + j];
      if (share < 1e-4) continue;
      // nearest chain (distance to its polyline), position along it
      let best = null;
      for (const c of chains) {
        let acc = 0;
        for (let k = 0; k < 3; k++) {
          const a = c.pts[k], b = c.pts[k + 1], e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...e);
          const tRaw = ((x - a[0]) * e[0] + (y - a[1]) * e[1] + (z - a[2]) * e[2]) / (l * l), t = Math.max(0, Math.min(1, tRaw));
          const d = Math.hypot(x - a[0] - e[0] * t, y - a[1] - e[1] * t, z - a[2] - e[2] * t);
          const along = acc + (k === 0 ? Math.min(tRaw, 1) : k === 2 ? Math.max(tRaw, 0) : t) * l;
          if (!best || d < best.d) best = { d, c, along, k, lens: null };
          acc += l;
        }
      }
      const c = best.c, L = [0, 1, 2].map((k) => Math.hypot(c.pts[k + 1][0] - c.pts[k][0], c.pts[k + 1][1] - c.pts[k][1], c.pts[k + 1][2] - c.pts[k][2]));
      wv.fill(0);
      const thumb = c.f === 'Thumb';
      // base: hand -> first bone across the knuckle (the thumb's first bone lies in the palm: only flesh near it follows)
      const base = thumb ? sm(-0.006, 0.012, best.along) * (1 - sm(0.011, 0.022, best.d)) : sm(-0.007, 0.004, best.along) * (1 - sm(0.011, 0.02, best.d) * (best.along < 0 ? 1 : 0));
      const w2 = sm(-0.005, 0.005, best.along - L[0]), w3 = sm(-0.004, 0.004, best.along - L[0] - L[1]);
      wv[iHand] = 1 - base; wv[c.ids[0]] = base * (1 - w2); wv[c.ids[1]] = base * w2 * (1 - w3); wv[c.ids[2]] = base * w2 * w3;
      for (const j of handSet) D[v * nJ + j] = share * wv[j];
    }
  }
  return { ...pick4(D, n, nJ), dense: D, stats: tw.stats };
}

export function pick4(D, n, nJ) {
  const J = new Uint16Array(n * 4), W = new Float32Array(n * 4), top = [0, 0, 0, 0], tw = [0, 0, 0, 0];
  for (let v = 0; v < n; v++) {
    top.fill(0); tw.fill(0);
    for (let j = 0; j < nJ; j++) { const w = D[v * nJ + j]; if (w <= tw[3]) continue; let k = 3; while (k > 0 && w > tw[k - 1]) { tw[k] = tw[k - 1]; top[k] = top[k - 1]; k--; } tw[k] = w; top[k] = j; }
    const s = tw[0] + tw[1] + tw[2] + tw[3] || 1;
    for (let k = 0; k < 4; k++) { J[v * 4 + k] = tw[k] > 0 ? top[k] : 0; W[v * 4 + k] = tw[k] / s; }
    if (!(tw[0] > 0)) { J[v * 4] = 0; W[v * 4] = 1; }
  }
  return { J, W };
}
/** rigid weights to one joint */
export function rigid(n, j) { const J = new Uint16Array(n * 4), W = new Float32Array(n * 4); for (let v = 0; v < n; v++) { J[v * 4] = j; W[v * 4] = 1; } return { J, W }; }

/** weights for a mesh lying on / near a skinned mesh: nearest vertices of the source (k = 3, inverse distance) */
export function copyWeights(src, pos, nJ) {
  const cell = 0.02, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const ns = src.pos.length / 3;
  for (let v = 0; v < ns; v++) { const k = key(src.pos[v * 3], src.pos[v * 3 + 1], src.pos[v * 3 + 2]); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(v); }
  const n = pos.length / 3, D = new Float32Array(n * nJ);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    const near = [];
    for (let r = 1; r <= 4 && near.length < 3; r++) { near.length = 0; for (let a = cx - r; a <= cx + r; a++) for (let b = cy - r; b <= cy + r; b++) for (let c = cz - r; c <= cz + r; c++) { const l = grid.get(`${a},${b},${c}`); if (l) for (const u of l) near.push([Math.hypot(src.pos[u * 3] - x, src.pos[u * 3 + 1] - y, src.pos[u * 3 + 2] - z), u]); } }
    near.sort((p, q) => p[0] - q[0]);
    for (const [d, u] of near.slice(0, 3)) { const w = 1 / (d * d + 1e-8); for (let k = 0; k < 4; k++) D[v * nJ + src.J[u * 4 + k]] += w * src.W[u * 4 + k]; }
  }
  return { ...pick4(D, n, nJ), dense: D };
}

// ------------------------------------------------------------------------------------------------------------- posing
const qAxis = (ax, deg) => { const a = deg * Math.PI / 360, s = Math.sin(a); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a)]; };
const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
/**
 * skin matrices for hand-set rotations: { 'J_Bip_L_UpperArm': [rx, ry, rz] (degrees, applied X then Y then Z in the
 * parent's frame, on top of the rest rotation) }. 'L:' / 'R:' free: names are full joint names.
 */
export function fkPose(rig, rot, on = null) {
  const byName = new Map(rig.nodes.map((nd) => [nd.getName(), nd]));
  const channels = [];
  const base = on ? on.channels.map((c) => ({ ...c })) : [];
  for (const nm in rot) {
    const nd = byName.get(nm); if (!nd) throw new Error('no joint ' + nm);
    const [rx, ry, rz] = rot[nm];
    const q = qMul(qAxis([0, 0, 1], rz), qMul(qAxis([0, 1, 0], ry), qAxis([1, 0, 0], rx)));
    channels.push({ node: nd, path: 'rotation', t: [0], v: Float32Array.from(qMul(nd.getRotation(), q)), interp: 'LINEAR' });
  }
  return rig.pose({ channels: base.concat(channels) }, 0);
}
export const restPose = (rig) => rig.joints.map(() => M4.id());
