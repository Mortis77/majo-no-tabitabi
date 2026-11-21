// v3 (layered base figure): the layers that lie ON 灯里's base figure — kosode, tabi, red leg lining — contoured from their
// fields (tools/sculpt/assets/akari_outfit*.mjs) with the sculptors' kit, cut exactly on their hem / cuff planes and walled
// toward the layer beneath (thickness at every opening), normals from the cloth's field, skin weights copied from the body
// beneath, and the painted fold shade as one number per vertex (uv.x into a ramp row: no unwrap needed).
// Nothing here touches the body: it stays whole under every layer.
import path from 'node:path';
import * as S from '../sculpt/sdf.mjs';
import { contourPieces } from '../sculpt/figure/pieces.mjs';
import { compactMesh, clipField, splitField, extrudeRim } from '../sculpt/figure/seam.mjs';
import { vertexNormals } from '../sculpt/figure/meshops.mjs';
import { copyWeights } from '../sculpt/figure/weights.mjs';
import { loadRig } from '../sculpt/rig.mjs';
import { OUTFIT, kosodeParts, kosodeShape, collarShape, tabiShape, liningShape, insleeveShape, insleeveClear, kosodeClear, underClear } from '../sculpt/assets/akari_outfit.mjs';
import { UNDER } from '../sculpt/assets/akari_under.mjs';
import { bodyShape, RIG_FILE, SOLE_Y } from '../sculpt/assets/akari_body.mjs';

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const near = (a, b) => Math.abs(a - b) < 2e-5;
/** a piece contoured on her left (+x) side, mirrored to her right: contourPieces keeps ONE connected part, so two feet,
 *  two legs or two arms are contoured as one and mirrored (round 'finish': the tabi and the lining had only the left one) */
export function withMirror(m) {
  const n = m.pos.length / 3, pos = new Float32Array(n * 6), idx = new Uint32Array(m.idx.length * 2);
  pos.set(m.pos); for (let v = 0; v < n; v++) { pos[(n + v) * 3] = -m.pos[v * 3]; pos[(n + v) * 3 + 1] = m.pos[v * 3 + 1]; pos[(n + v) * 3 + 2] = m.pos[v * 3 + 2]; }
  idx.set(m.idx); for (let t = 0; t < m.idx.length; t += 3) { idx[m.idx.length + t] = n + m.idx[t]; idx[m.idx.length + t + 1] = n + m.idx[t + 2]; idx[m.idx.length + t + 2] = n + m.idx[t + 1]; }
  return { pos, idx };
}

/** cut on planes and wall the new edges toward wallTo(x, y, z) (m above the skin); returns { pos, idx, rim (1 = wall vertex) } */
function hem(mesh, cuts, body) {
  let m = { pos: mesh.pos, idx: mesh.idx };
  for (const c of cuts) { const r = clipField(m, c.keep, { refine: 0 }); m = { pos: r.pos, idx: r.idx }; }
  const n0 = m.pos.length / 3, g = [0, 0, 0];
  const which = (v) => { const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2]; for (const c of cuts) if (c.wallTo && c.on(x, y, z)) return c; return null; };
  const r = extrudeRim(m, (a, b) => { const ca = which(a); return ca && ca === which(b); }, (v) => {
    const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2], c = which(v), d = body.f(x, y, z) - c.wallTo(x, y, z);
    if (d <= 0) return [0, 0, 0];
    body.normal(x, y, z, g, 0.002); g[c.axis] = 0; const l = Math.hypot(g[0], g[1], g[2]) || 1;
    return [-g[0] / l * d, -g[1] / l * d, -g[2] / l * d];
  });
  const rim = new Uint8Array(r.pos.length / 3); for (let v = n0; v < rim.length; v++) rim[v] = 1;
  return { pos: r.pos, idx: r.idx, rim };
}

/**
 * -> { kosode, collar, red, tabi, lining }: each { pos, nrm, idx, shade (0..1 per vertex, -0.25 = highlight), J, W } in the base's
 * joint indices (skin = { pos, J, W } of the base Body primitive, nJ its joint count).
 */
export async function buildLayers({ ROOT, skin, nJ, M, log = console.log, threads, paint }) {
  const A = (f) => path.join(ROOT, 'tools/sculpt/assets', f), cacheDir = path.join(ROOT, '.tmp/akari-v3/cache');
  const rig = await loadRig(path.join(ROOT, RIG_FILE)); const J = (n) => rig.bone(n).head;
  const body = bodyShape(S, J), O = OUTFIT;
  const src = (f) => [A(f), A('akari_outfit.mjs'), A('akari_body.mjs'), A('akari_under.mjs')];
  const t0 = Date.now();
  // budgets (round 'finish'): kosode 17 k -> 12 k (its forearm went to the inner sleeve), collar band contoured at 3.8 k (the red line on its own, 1.1 k) and then
  // clipped where it lies inside the kosode (about half of it: its underside), one tabi / one lining leg / one inner sleeve
  // contoured and mirrored
  const rK = await contourPieces(A('akari_outfit_kosode.mjs'), [{ name: 'kosode', bounds: [-0.4, 0.86, -0.17, 0.4, 1.38, 0.17], voxel: 0.0019, planes: [], tris: 12000, key: 4 }], { cacheDir, sources: src('akari_outfit_kosode.mjs'), log, threads });
  const rC = await contourPieces(A('akari_outfit_collar.mjs'), [{ name: 'collar', bounds: [-0.14, 0.99, -0.13, 0.14, 1.34, 0.16], voxel: 0.0009, planes: [], tris: 3800, key: 4 }], { cacheDir, sources: src('akari_outfit_collar.mjs'), log, threads });
  const rR = await contourPieces(A('akari_outfit_red.mjs'), [{ name: 'red', bounds: [-0.1, 1.12, -0.11, 0.1, 1.33, 0.14], voxel: 0.0007, planes: [], tris: 1100, key: 4 }], { cacheDir, sources: src('akari_outfit_red.mjs'), log, threads });
  const rT = await contourPieces(A('akari_outfit_tabi.mjs'), [{ name: 'tabi', bounds: [0.0, 0.0, -0.11, 0.1, 0.24, 0.16], voxel: 0.0012, planes: [], tris: 1500, key: 4 }], { cacheDir, sources: src('akari_outfit_tabi.mjs'), log, threads });
  const rL = await contourPieces(A('akari_outfit_lining.mjs'), [{ name: 'lining', bounds: [0.0, 0.17, -0.13, 0.16, 0.88, 0.13], voxel: 0.0026, planes: [], tris: 1500, key: 4 }], { cacheDir, sources: src('akari_outfit_lining.mjs'), log, threads });
  const rS = await contourPieces(A('akari_outfit_insleeve.mjs'), [{ name: 'insleeve', bounds: [0.27, 1.1, -0.1, 0.56, 1.32, 0.1], voxel: 0.0014, planes: [], tris: 1000, key: 4 }], { cacheDir, sources: src('akari_outfit_insleeve.mjs'), log, threads });
  log(`  layers contoured (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  const outside = (m0, clr) => { const c = clipField(m0, (x, y, z) => body.f(x, y, z) - clr(x, y), { refine: 6 }); return compactMesh({ pos: c.pos, idx: c.idx }); };

  // ---- kosode: everything below the robe / shorts goes, hem + cuffs walled down to the layer beneath
  const P = kosodeParts(S, J), kos = kosodeShape(S, J, P);
  let k = hem(outside(rK.kosode, (x, y) => underClear(x, y) + 0.0012), [
    { keep: (x, y) => y - O.hemY, on: (x, y) => near(y, O.hemY), wallTo: (x, y) => underClear(x, y) + 0.0012, axis: 1 },
    { keep: (x) => O.cuffX - x, on: (x) => near(x, O.cuffX), wallTo: (x) => insleeveClear(Math.abs(x)) + 0.0009, axis: 0 },   // over the inner sleeve
    { keep: (x) => O.cuffX + x, on: (x) => near(x, -O.cuffX), wallTo: (x) => insleeveClear(Math.abs(x)) + 0.0009, axis: 0 },
  ], body);
  const kosM = { pos: k.pos, idx: k.idx, rim: k.rim };
  // ---- the collar: white band (eri) and the red line between the two collars, two thin solids of their own
  // the band's underside lies inside the kosode (sunk 3.6 mm for a clean steep edge): clipped 2.2 mm under the cloth
  const kosF = kos.f, co0 = outside(rC.collar, (x, y) => underClear(x, y) + 0.0012);
  const co = compactMesh(clipField({ pos: co0.pos, idx: co0.idx }, (x, y, z) => kosF(x, y, z) + 0.0022, { refine: 6 }));
  const rd = outside(rR.red, (x, y) => underClear(x, y) + 0.0012);
  const colM = { pos: co.pos, idx: co.idx, rim: new Uint8Array(co.pos.length / 3) }, redM = { pos: rd.pos, idx: rd.idx, rim: new Uint8Array(rd.pos.length / 3) };

  // ---- tabi: cuff on the ankle walled to the skin
  const tabiF = tabiShape(S, J);
  const tb = hem(outside(withMirror(rT.tabi), () => 0.0008), [{ keep: (x, y) => O.tabi.topY - y, on: (x, y) => near(y, O.tabi.topY), wallTo: () => 0.0011, axis: 1 }], body);
  // ---- lining: open at the top (inside the hakama), hem above the tabi walled to the skin
  const linF = liningShape(S, J);
  const ln = hem(outside(withMirror(rL.lining), (x, y) => (y < UNDER.shortsTopY && y > UNDER.legY ? UNDER.shorts : 0) + 0.0012), [
    { keep: (x, y) => O.lining.top - y, on: () => false, wallTo: null, axis: 1 },
    { keep: (x, y) => y - O.lining.hemY, on: (x, y) => near(y, O.lining.hemY), wallTo: () => 0.0013, axis: 1 },
  ], body);

  // inner sleeve: open toward the shoulder (inside the kosode), cuff at the wrist walled to the skin
  const isF = insleeveShape(S, J), IS = O.insleeve;
  const sl = hem(outside(withMirror(rS.insleeve), () => 0.0012), [
    { keep: (x) => IS.cuffX - x, on: (x) => near(x, IS.cuffX), wallTo: () => 0.0012, axis: 0 },
    { keep: (x) => IS.cuffX + x, on: (x) => near(x, -IS.cuffX), wallTo: () => 0.0012, axis: 0 },
  ], body);
  const band = P.band.f, slotX = O.tabi.split;
  const finish = (m, field, shadeOf, fine = 0.0028) => {
    const eOf = typeof fine === 'function' ? fine : () => fine;
    const n = m.pos.length / 3, nrm = vertexNormals(m.pos, m.idx), g = [0, 0, 0], shade = new Float32Array(n);
    const w = copyWeights(skin, m.pos, nJ);
    for (let v = 0; v < n; v++) {
      const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2];
      if (!m.rim[v]) { field.normal(x, y, z, g, eOf(x, y, z)); if (g[0] * nrm[v * 3] + g[1] * nrm[v * 3 + 1] + g[2] * nrm[v * 3 + 2] > 0.25) { nrm[v * 3] = g[0]; nrm[v * 3 + 1] = g[1]; nrm[v * 3 + 2] = g[2]; } }
      shade[v] = shadeOf(x, y, z, m.rim[v], [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]]);
    }
    return { pos: m.pos, nrm, idx: m.idx, shade, J: w.J, W: w.W };
  };
  const kosShade = (x, y, z, rim, n) => {
    if (rim) return 0.62;
    let t = paint(x, y, z);                                                      // the painted form of the kosode (recipes.kosodePaint)
    t += 0.3 * Math.exp(-(((band(x, y, z) - 0.001) / 0.0035) ** 2));            // the collar band casts a soft line on the cloth
    return t;
  };
  const tabiShade = (x, y, z, rim, n) => {
    if (rim) return 0.55;
    let t = 0.05 + 0.22 * sm(SOLE_Y + 0.008, SOLE_Y - 0.002, y);                  // the sole a little grey
    const ax = Math.abs(x); t += 0.45 * Math.exp(-(((ax - slotX) / 0.0026) ** 2)) * sm(O.tabi.web - 0.006, O.tabi.web + 0.004, z);  // the split
    t += 0.3 * sm(O.tabi.topY - 0.014, O.tabi.topY - 0.004, y);                     // the cuff's turned edge
    // kohaze: the clasps at the back of the ankle (three small shade marks on her outer side)
    if (z < -0.03 && x * Math.sign(x) > 0) { const s = Math.sign(x); const ox = x * s - 0.06; for (const yy of [0.15, 0.168, 0.186]) t += 0.4 * Math.exp(-((((y - yy) / 0.0026) ** 2) + (((z + 0.05) / 0.012) ** 2))) * sm(-0.02, 0.0, ox + 0.02); }
    return t + 0.12 * sm(0.3, -0.6, n[1]) * sm(0.08, 0.04, y);
  };
  const linShade = (x, y, z, rim, n) => {
    if (rim) return 0.6;
    const s = Math.sign(x) || 1, cx = s * (y > 0.5 ? 0.07 : 0.05), th = Math.atan2(x - cx, z);
    let t = 0.18 + 0.35 * Math.pow(0.5 + 0.5 * Math.sin(th * 4 + y * 9), 3);        // long folds down the leg
    t += 0.3 * sm(0.3, -0.5, Math.sin(th) * s);                                    // the inside of the leg in shade
    return t + 0.25 * sm(O.lining.hemY + 0.03, O.lining.hemY + 0.004, y);
  };
  const slShade = (x, y, z, rim, n) => {
    if (rim) return 0.6;
    const ax = Math.abs(x), th = Math.atan2(z, y - 1.2);
    let t = 0.08 + 0.3 * sm(0.2, -0.7, n[1]);                                        // the underside of the forearm in shade
    t += 0.22 * Math.pow(0.5 + 0.5 * Math.sin(th * 3 + ax * 40), 4) * sm(O.cuffX, O.cuffX + 0.04, ax);   // a few long folds
    t += 0.35 * sm(IS.cuffX - 0.03, IS.cuffX - 0.002, ax) * Math.pow(0.5 + 0.5 * Math.sin(th * 9), 2);  // gathers at the cuff
    return t + 0.25 * sm(IS.cuffX - 0.006, IS.cuffX - 0.001, ax);                      // the cuff's turned edge
  };
  const out = {
    kosode: finish(kosM, P.cloth, kosShade, 0.0055),          // broad normals: the cloth's form, not every form under it
    collar: finish(colM, P.band, (x, y, z, rim, n) => 0.03 + 0.42 * sm(0.1, -0.7, n[1] * 0.45 + n[2] * 0.65), 0.0009),
    red: finish(redM, P.red, (x, y, z, rim, n) => (rim ? 0.6 : 0.08 + 0.45 * sm(0.2, -0.6, n[1] * 0.4 + n[2] * 0.7)), 0.0012),
    tabi: finish({ pos: tb.pos, idx: tb.idx, rim: tb.rim }, tabiF, tabiShade, 0.0012),
    lining: finish({ pos: ln.pos, idx: ln.idx, rim: ln.rim }, linF, linShade),
    insleeve: finish({ pos: sl.pos, idx: sl.idx, rim: sl.rim }, isF, slShade, 0.003),
  };
  for (const [nm, m] of Object.entries(out)) log(`  layer ${nm}: ${m.idx.length / 3} tris, ${m.pos.length / 3} verts`);
  log(`  kosode front (hosei) measured: ${JSON.stringify(P.measured)}`);
  void kosodeShape; return { ...out, parts: P, body, kosodeClear };
}
