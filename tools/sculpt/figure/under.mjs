// The undergarment mesh (revision 2). Robe and shorts are contoured as two solids that run PAST the garment's edges
// (tools/sculpt/assets/akari_under.mjs, akari_under_shorts.mjs); here everything inside the skin is thrown away, then
// hem, cuffs and legs are cut exactly on their planes (straight, even edges — the first pass let the mesher find them and
// they came out ragged) and given a wall toward the skin; the cord is cut out of the robe on its own outline so it can
// carry its own material; normals come from the cloth's field; weights are copied from the skin beneath, and the robe
// below the cord hangs from the pelvis (the hem no longer kinks where the thigh folds).
import path from 'node:path';
import * as S from '../sdf.mjs';
import { ROOT } from './glbio.mjs';
import { contourPieces } from './pieces.mjs';
import { compactMesh, clipField, splitField, extrudeRim, boundaryNext } from './seam.mjs';
import { vertexNormals } from './meshops.mjs';
import { pick4 } from './weights.mjs';
import { UNDER, underParts, cordShape, robeClear } from '../assets/akari_under.mjs';

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** cut on planes (each [fn(x,y,z) >= 0 kept, onPlane(x,y,z) -> bool, depthTo (m above the skin where the wall ends)]) and wall the new edges */
function hem(mesh, cuts, body) {
  let m = { pos: mesh.pos, idx: mesh.idx };
  for (const c of cuts) { const r = clipField(m, c.keep, { refine: 0 }); m = { pos: r.pos, idx: r.idx }; }
  const n0 = m.pos.length / 3, g = [0, 0, 0];
  const which = (v) => { const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2]; for (const c of cuts) if (c.wall !== null && c.on(x, y, z)) return c; return null; };
  const r = extrudeRim(m, (a, b) => { const ca = which(a); return ca && ca === which(b); }, (v) => {
    const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2], c = which(v), d = body.f(x, y, z) - c.wall;
    if (d <= 0) return [0, 0, 0];
    body.normal(x, y, z, g, 0.002); const k = c.axis;                        // slide toward the skin, staying on the cut plane
    g[k] = 0; const l = Math.hypot(g[0], g[1], g[2]) || 1;
    return [-g[0] / l * d, -g[1] / l * d, -g[2] / l * d];
  });
  const rim = new Uint8Array(r.pos.length / 3); for (let v = n0; v < rim.length; v++) rim[v] = 1;
  return { pos: r.pos, idx: r.idx, rim };
}

export async function buildUnder({ rig, skin, log, threads, copyWeights, nJ }) {
  const A = (f) => path.join(ROOT, 'tools/sculpt/assets', f), U = UNDER, cacheDir = path.join(ROOT, '.tmp/sculpt/akari_base/cache');
  const J = (n) => rig.bone(n).head, P = underParts(S, J), body = P.body, src = [A('akari_under.mjs'), A('akari_body.mjs')];
  const r1 = await contourPieces(A('akari_under.mjs'), [{ name: 'robe', bounds: [-0.26, 0.88, -0.14, 0.26, 1.33, 0.14], voxel: 0.0021, planes: [], tris: 7000, key: 6 }], { cacheDir, sources: src, log, threads });
  const r2 = await contourPieces(A('akari_under_shorts.mjs'), [{ name: 'shorts', bounds: [-0.2, 0.63, -0.14, 0.2, 1.0, 0.14], voxel: 0.0021, planes: [], tris: 2800, key: 6 }], { cacheDir, sources: [A('akari_under_shorts.mjs'), ...src], log, threads });
  const outside = (m0) => { const c = clipField(m0, (x, y, z) => body.f(x, y, z) - 0.0012, { refine: 6 }); return compactMesh({ pos: c.pos, idx: c.idx }); };
  const near = (a, b) => Math.abs(a - b) < 2e-5;
  // ---- robe: hem and cuffs; its hem wall stops just outside the shorts
  let robe = hem(outside(r1.robe), [
    { keep: (x, y) => y - U.hemY, on: (x, y) => near(y, U.hemY), wall: U.shorts + 0.0008, axis: 1 },
    { keep: (x) => U.sleeveX - x, on: (x) => near(x, U.sleeveX), wall: 0.0012, axis: 0 },
    { keep: (x) => U.sleeveX + x, on: (x) => near(x, -U.sleeveX), wall: 0.0012, axis: 0 },
  ], body);
  // ---- shorts: leg hems walled, the top (under the robe) left open
  const shorts = hem(outside(r2.shorts), [
    { keep: (x, y) => y - U.legY, on: (x, y) => near(y, U.legY), wall: 0.0012, axis: 1 },
    { keep: (x, y) => U.shortsTopY - y, on: () => false, wall: null, axis: 1 },
  ], body);
  // ---- the cord: split the robe on its outline, its triangles become a primitive of their own
  const cord = cordShape(S, P), cf = cord.f;
  const inCord = (x, y, z) => 0.0007 - cf(x, y, z);
  const sp = splitField({ pos: robe.pos, idx: robe.idx }, inCord, { refine: 8 });
  const rimR = new Uint8Array(sp.pos.length / 3); for (let v = 0; v < rimR.length; v++) { const s = sp.src[v]; rimR[v] = robe.rim[s[0]] && robe.rim[s[1]] ? 1 : 0; }
  const part = (keep, rimOf, pos, idx, side) => { const I = []; for (let t = 0; t < idx.length / 3; t++) if (!side || (side[t] > 0) === keep) I.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]); const c = compactMesh({ pos, idx: Uint32Array.from(I) }, { rim: rimOf }); return { pos: c.pos, idx: c.idx, rim: c.rim }; };
  const robeW = part(false, rimR, sp.pos, sp.idx, sp.side), cordM = U.cord ? part(true, rimR, sp.pos, sp.idx, sp.side) : null;
  const white = cordM ? join(robeW, shorts) : join(part(true, rimR, sp.pos, sp.idx, null), shorts);
  // ---- finish: normals from the cloth's field, weights from the skin, fold shade in uv.x
  const robeField = P.cloth.softAdd(S.tube(P.path, 0.005, { aspect: 1.9, up: [0, 0.35, 1] }), 0.004), shortsField = body.round(U.shorts);
  const iHips = rig.jointNames.indexOf('J_Bip_C_Hips'), legs = ['L', 'R'].map((s) => rig.jointNames.indexOf(`J_Bip_${s}_UpperLeg`));
  const finish = (m, isCord) => {
    const n = m.pos.length / 3, nrm = vertexNormals(m.pos, m.idx), g = [0, 0, 0], uv = new Float32Array(n * 2);
    const w = copyWeights(skin, m.pos, nJ), D = w.dense;
    for (let v = 0; v < n; v++) {
      const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2], d = body.f(x, y, z);
      const isRobe = isCord || d > U.shorts + 0.0006 || y > U.shortsTopY;
      if (!m.rim[v]) {
        (isCord ? cord : isRobe ? robeField : shortsField).normal(x, y, z, g, isCord ? 0.0012 : 0.0028);
        if (g[0] * nrm[v * 3] + g[1] * nrm[v * 3 + 1] + g[2] * nrm[v * 3 + 2] > 0.25) { nrm[v * 3] = g[0]; nrm[v * 3 + 1] = g[1]; nrm[v * 3 + 2] = g[2]; }
      }
      // the robe below the cord hangs from the pelvis: most of what the thighs would pull goes to the hips
      if (isRobe && y < U.tieY - 0.01) { const keep = 0.3 + 0.7 * sm(U.hemY + 0.03, U.tieY - 0.01, y); for (const j of legs) { const wl = D[v * nJ + j]; D[v * nJ + j] = wl * keep; D[v * nJ + iHips] += wl * (1 - keep); } }
      // uv.x = fold shade: walls and what sits in a hollow a little deeper; a soft line of shade under the cord
      const wall = m.rim[v] ? 1 : 0, under = isRobe && !isCord ? Math.exp(-(((y - (U.tieY - U.tieHalf - 0.004)) / 0.0045) ** 2)) : 0;
      const lap = !isRobe && y > U.hemY - 0.02 ? 0.5 * sm(U.hemY - 0.02, U.hemY - 0.004, y) : 0;      // the robe's hem shades the shorts beneath it
      uv[v * 2] = Math.min(0.96, 0.04 + 0.7 * wall + 0.42 * under + lap + (isCord ? 0.12 * sm(U.tieHalf * 0.4, U.tieHalf, Math.abs(y - U.tieY)) : 0)); uv[v * 2 + 1] = 0.5;
    }
    const pk = pick4(D, n, nJ);
    return { pos: m.pos, nrm, uv, idx: m.idx, J: pk.J, W: pk.W };
  };
  const out = { white: finish(white, false), cord: cordM ? finish(cordM, true) : null };
  // open borders left on purpose: the shorts' top (under the robe) and the cord's cut (it lies on the robe)
  log(`  under: robe + shorts ${out.white.idx.length / 3} tris, ${out.white.pos.length / 3} verts; cord ${out.cord ? out.cord.idx.length / 3 : 0} tris (robe ${U.robe * 1000} mm off the skin, ${U.cinch * 1000} mm at the cord, ${((robeClear(U.hemY)) * 1000).toFixed(1)} mm at the hem; shorts ${U.shorts * 1000} mm)`);
  return out;
}

function join(a, b) {
  const na = a.pos.length / 3, pos = new Float32Array(a.pos.length + b.pos.length), idx = new Uint32Array(a.idx.length + b.idx.length), rim = new Uint8Array(na + b.pos.length / 3);
  pos.set(a.pos); pos.set(b.pos, a.pos.length); idx.set(a.idx); for (let i = 0; i < b.idx.length; i++) idx[a.idx.length + i] = b.idx[i] + na;
  rim.set(a.rim); rim.set(b.rim, na);
  return { pos, idx, rim };
}
void boundaryNext;
