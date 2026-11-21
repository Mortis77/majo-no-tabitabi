#!/usr/bin/env node
// char_akari_v3 — 灯里's shrine-maiden outfit as SEPARATE LAYERS on her base figure (assets/models/sculpt/akari_base.glb).
//   SCULPT_THREADS=6 node tools/costume/v3.mjs [--out file.glb] [--whole] [--keeplegs]   (~60 s; field layers cached in .tmp/akari-v3/cache)
//   --whole     keep every triangle of the skin and the undergarment (by default the build drops what an opaque lying layer
//               covers in every pose: tools/costume/cull.mjs; the base figure file and all sources stay whole either way)
//   --keeplegs  keep the leg skin under the red lining too
// The base's body, face (13 shapes), hair and hair bow are kept untouched; NOTHING is cut from the body. On top of it:
//   under   the always-worn undergarment of the base (re-emitted with its geometry and weights; only its ramp moves into
//           the outfit atlas so it shares cloth_white / cloth_trim with the outfit: one material per name)
//   kosode  white hakui + red collar line             fields (v3-layers.mjs, tools/sculpt/assets/akari_outfit*.mjs)
//   tabi, lining (red divided legs)                    fields
//   hakama (18 pleats, legs follow), wide sode, sash + bow + tails, koshiita (back board), front board, bell charm, zori:
//           the garment generator (outfit.mjs) lofted over what is already worn (its layer stack sees the fields)
// Each garment is its own node (mesh) and material group; the game merges per material at load (celmat / celmerge).
// Chains keep the v2 names (J_Sec_<Part>_<n>_<nn>): the base skeleton carries them already and they are re-placed in place.
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { loadChar, Wardrobe, Canvas, samplePose, lerp, smooth, clamp01, W1, wmix, nearestWeights, add, sub, mul, norm, cross, strip, fixWinding } from './garment.mjs';
import { buildSkirt, buildSleeve, buildSash, buildCharm, buildSandals, paintSwatches, swatchUV, scaleOf, rayNear } from './outfit.mjs';
import { skirtPaint, sleevePaint, kosodePaint } from './recipes.mjs';
import { buildLayers } from './v3-layers.mjs';
import { cullCovered, compactKept } from './cull.mjs';
import { keepBaseSkeleton } from './keepskel.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const BASE = path.join(ROOT, 'assets/models/sculpt/akari_base.glb');
const OUT = opt('out') ? path.resolve(opt('out')) : path.join(ROOT, 'assets/models/chars/char_akari_v3.glb');
const WORK = path.join(ROOT, '.tmp/akari-v3/out'); fs.mkdirSync(WORK, { recursive: true });

// ------------------------------------------------------------------ palette + fit (one place)
const WHITE = [248, 245, 239], WSHADE = [196, 204, 230], WHI = [255, 255, 252];
const TABI = [250, 250, 247], TSHADE = [206, 212, 230];
const VERM = { base: [204, 40, 34], light: [232, 70, 50], dark: [112, 14, 28], hem: [150, 22, 30] };
const LINE = [184, 34, 34], LSHADE = [110, 16, 30], LHI = [214, 62, 50];
const RED_TRIM = [200, 30, 36], RED_SHADE = [120, 14, 30];
export const FIT = {
  sashY: 1.04, sashH: 0.034,                  // the sash on her natural waist (FITTING: waist y 1.03, girth 495 mm)
  hakamaTop: 1.052,                           // the hakama's top edge, under the sash
  hakama: { ease: 0.022, flare: [0.226, 0.198], curve: 1.3, pleats: 18, depth: 0.021, chains: 10, legFollow: 0.6 },   // round 'finish': her hips are
                                              // fuller than v2's, so the v2 flare (196 x 174) hung almost straight (1.4 deg chains): a real bell again
  sleeve: { style: 'wide', end: 0.97, depth: 0.38, ease: 0.02, back: 0.03 },
  front: { wTop: 0.05, wBot: 0.066, h: 0.052, t: 0.0035 },   // front board (half widths), below the sash
};

const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** shade t (-0.25 highlight .. 0 base .. 1 shade) -> colour */
const ramp = (base, shade, hi) => (t) => (t < 0 ? mixc(base, hi, Math.min(1, -t / 0.25)) : mixc(base, shade, Math.min(1, t)));
const tn = (t) => clamp01((t + 0.25) / 1.25);

export async function build() {
  const t0 = Date.now(); const log = (s) => console.log(s);
  const C = await loadChar(BASE); const M = C.M; const k = scaleOf(C);
  const wd = new Wardrobe(C, { texSize: 512 }); wd.cvA = new Canvas(512, 512); wd.cvB = new Canvas(1024, 1024);   // 1024: the same size class as the Face map -> the draw-call merge packs every map in <= 5 arrays (celmerge CEL_ARRS)
  wd.idlePose = await samplePose('Idle_Loop', 0.3); wd.sw = new Map(); wd.swRect = [0.75, 0.75, 1, 1];
  const nJ = C.jn.length;
  const wmap = (J, W, v) => { const m = new Map(); for (let c = 0; c < 4; c++) { const w = W[v * 4 + c]; if (w > 0) m.set(J[v * 4 + c], (m.get(J[v * 4 + c]) || 0) + w); } return m; };

  // ---- atlas A: ramp rows (64 px each) — 0 kosode, 1 tabi, 2 robe + shorts (the base's own ramp), 3 red lining
  const ROWS = 8; const rowV = (r) => (r + 0.5) / ROWS;
  const rowRect = (r) => [0, r / ROWS, 1, (r + 1) / ROWS];
  const paintRow = (r, fn) => wd.cvA.rect(rowRect(r), (lu) => fn(lu));
  paintRow(0, (u) => ramp(WHITE, WSHADE, WHI)(u * 1.25 - 0.25));
  paintRow(1, (u) => ramp(TABI, TSHADE, [255, 255, 255])(u * 1.25 - 0.25));
  paintRow(3, (u) => ramp(LINE, LSHADE, LHI)(u * 1.25 - 0.25));
  // ramp cells in B's swatch area (cloth_trim): red collar line, the robe's cord (copied)
  const cell = (name) => { if (!wd.sw.has(name)) wd.sw.set(name, wd.sw.size); const n = wd.sw.get(name); const [u0, v0, u1, v1] = wd.swRect, G = 8;
    return [lerp(u0, u1, (n % G) / G), lerp(v0, v1, Math.floor(n / G) / G), lerp(u0, u1, (n % G + 1) / G), lerp(v0, v1, (Math.floor(n / G) + 1) / G)]; };
  const cellRamps = [];

  // ---- 0. the lying layers from their fields (built first: they are the covers the cull needs)
  const WHOLE = args.includes('--whole'), KEEPLEGS = args.includes('--keeplegs'); const cullLog = {};
  const bodyPrim = C.body.prim; const skin = { pos: C.body.P, J: C.body.J, W: C.body.Wt };
  const kp = kosodePaint({ base: WHITE, shade: WSHADE, waist: FIT.sashY });
  const paint = (x, y, z) => { const c = kp([x, y, z], M, k); return (WHITE[0] - c[0]) / (WHITE[0] - WSHADE[0]); };
  const L = await buildLayers({ ROOT, skin, nJ, M, log, threads: Number(process.env.SCULPT_THREADS || 6), paint });
  const cover = (name, m, margin) => ({ name, pos: m.pos, idx: m.idx, ...(margin ? { margin } : {}) });

  // ---- 1. the undergarment of the base, re-emitted (geometry + weights as built by the sculptor)
  const underNode = C.root.listNodes().find((n) => n.getName() === 'akari_under'); let underFlat = null;
  const texRow = async (tex) => { const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const y = Math.floor(info.height / 2);
    return (u) => { const x = Math.max(0, Math.min(info.width - 1, Math.floor(u * info.width))); const i = (y * info.width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; }; };
  for (const p of underNode.getMesh().listPrimitives()) {
    const mat = p.getMaterial().getName(); const row = await texRow(p.getMaterial().getBaseColorTexture());
    const P = p.getAttribute('POSITION').getArray(), N = p.getAttribute('NORMAL').getArray(), UV = p.getAttribute('TEXCOORD_0').getArray(), J = p.getAttribute('JOINTS_0').getArray(), W = p.getAttribute('WEIGHTS_0').getArray(), I = Array.from(p.getIndices().getArray());
    const n = P.length / 3; const pos = [], nrm = [], uv = [], wts = [];
    let toUV;
    if (mat === 'cloth_white') { paintRow(2, (u) => row(u)); toUV = (u) => [u, rowV(2)]; }
    else { const r = cell('ramp:cord'); cellRamps.push([r, (u) => row(u)]); toUV = (u) => [lerp(r[0], r[2], u), (r[1] + r[3]) / 2]; }
    for (let v = 0; v < n; v++) { pos.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]); nrm.push([N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]); uv.push(toUV(UV[v * 2])); wts.push(wmap(J, W, v)); }
    let geo = { pos, uv, idx: I }, nr = nrm, ws = wts;
    if (mat === 'cloth_white') {
      underFlat = { pos: P, idx: Uint32Array.from(I) };
      if (!WHOLE) {   // robe under the kosode, shorts under the red lining: dropped where covered in every pose
        const r = cullCovered({ pos: P, idx: I, nrm: N }, [cover('kosode', L.kosode), cover('lining', L.lining)], { normalsFrom: { pos: C.body.P, nrm: C.body.N } }); cullLog.under = r.stats;
        const c = compactKept(n, r.idx, { pos: [pos, 0], uv: [geo.uv, 0], nrm: [nrm, 0], wts: [wts, 0] });
        geo = { pos: c.carried.pos, uv: c.carried.uv, idx: Array.from(c.idx) }; nr = c.carried.nrm; ws = c.carried.wts;
      }
    }
    wd.piece(mat === 'cloth_white' ? 'under' : 'under_cord', geo, ws, mat, { layer: mat === 'cloth_white' ? 0.5 : 0.6, group: 'akari_under', normals: nr, hems: [] });
  }
  underNode.getMesh().dispose(); underNode.dispose();

  // ---- 2. the lying layers (built in step 0)
  const emit = (name, m, mat, uvOf, o) => {
    const n = m.pos.length / 3; const pos = [], nrm = [], uv = [], wts = [];
    for (let v = 0; v < n; v++) { pos.push([m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]]); nrm.push([m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]]); uv.push(uvOf(m.shade[v])); wts.push(wmap(m.J, m.W, v)); }
    const geo = { pos, uv, idx: Array.from(m.idx) }; wd.piece(name, geo, wts, mat, { normals: nrm, hems: [], ...o }); return geo;
  };
  const redCell = cell('ramp:collar_red'); cellRamps.push([redCell, (u) => ramp(RED_TRIM, RED_SHADE, [228, 60, 56])(u * 1.25 - 0.25)]);
  const onRow = (r) => (t) => [0.03 + 0.94 * tn(t), rowV(r)];
  const kosGeo = emit('shell_top', L.kosode, 'cloth_white', onRow(0), { layer: 1, group: 'akari_kosode' });
  emit('collar', L.collar, 'cloth_white', onRow(0), { layer: 1.2, group: 'akari_kosode' });
  emit('collar_red', L.red, 'cloth_trim', (t) => [lerp(redCell[0], redCell[2], 0.06 + 0.88 * tn(t)), (redCell[1] + redCell[3]) / 2], { layer: 1.2, group: 'akari_kosode' });
  const tabiGeo = emit('tabi', L.tabi, 'cloth_white', onRow(1), { layer: 1, group: 'akari_tabi' });
  emit('lining', L.lining, 'cloth_red_inner', onRow(3), { layer: 1.5, group: 'akari_lining' });
  emit('insleeve', L.insleeve, 'cloth_white', onRow(0), { layer: 0.9, group: 'akari_insleeve' });   // the white inner sleeve, its own node
  wd.shellGeo = { foot: tabiGeo };

  // ---- 3. the hanging layers (garment generator over the worn stack)
  const S0 = { part: 'Hakama', top: FIT.hakamaTop, hem: M.footL[1] - 0.005, ...FIT.hakama, mat: 'cloth_red', rect: [0, 0, 0.6, 1], clear: 0.012, paint: skirtPaint(VERM), layer: 2, group: 'akari_hakama' };
  const skirt = withGroup(wd, 'akari_hakama', () => buildSkirt(wd, S0));
  const SL = { ...FIT.sleeve, mat: 'cloth_white_sode', rect: [0.6, 0, 1, 0.72], cord: { col: RED_TRIM }, tsuyu: true,
    paint: sleevePaint({ base: WHITE, shade: WSHADE, motif: { type: 'sun', col: [234, 120, 104], col2: [222, 176, 70] }, stitch: [196, 34, 38] }) };
  withGroup(wd, 'akari_sode', () => { buildSleeve(wd, 'L', SL); buildSleeve(wd, 'R', SL); });
  const sash = withGroup(wd, 'akari_obi', () => buildSash(wd, skirt, { y: FIT.sashY, h: FIT.sashH, col: [196, 30, 34], bow: true, bowScale: 0.12, tail: 0.36, hemY: M.footL[1], koshiita: true, koshiCol: [190, 28, 32] }));
  withGroup(wd, 'akari_obi', () => buildFrontBoard(wd, skirt, sash, FIT.front, [192, 30, 33]));
  withGroup(wd, 'akari_charm', () => buildCharm(wd, sash, { theta: 0.85, len: 0.06, cord: RED_TRIM, bell: [226, 182, 64], paper: true }));
  { let ty = 9; for (const p of tabiGeo.pos) ty = Math.min(ty, p[1]); const keep = M.bodyMinY; M.bodyMinY = ty - 0.0012;   // zori top just under the tabi's sole
    withGroup(wd, 'akari_zori', () => buildSandals(wd, { sole: [188, 150, 104], strap: RED_TRIM })); M.bodyMinY = keep; }

  // ---- 4. textures + materials
  paintSwatches(wd);
  for (const [r, fn] of cellRamps) wd.cvB.rect(r, (lu) => fn(clamp01((lu - 0.06) / 0.88)));
  wd.cvA.dilate(4); wd.cvB.dilate(6);
  const A = 'akari_v3_garment_a', B = 'akari_v3_garment_b'; wd.textures.set(A, wd.cvA); wd.textures.set(B, wd.cvB);
  const sh = [0.62, 0.64, 0.78];
  // white cloth (kosode, undergarment, tabi, sode): extras.shadeAmbient = its cool shade hue also on the sky / ground light where
  // the sun does not reach (celmat.js), so white seen from below never reads as skin (wardrobe finish)
  const cool = { shadeAmbient: true };
  for (const [n, s] of Object.entries({ cloth_white: { tex: A, extras: cool }, cloth_red_inner: { tex: A }, cloth_red: { tex: B, doubleSided: true }, cloth_white_sode: { tex: B, doubleSided: true, extras: cool }, cloth_trim: { tex: B } })) wd.material(n, { ...s, shade: sh });
  // ---- 5. the skin this outfit covers in every pose: dropped from THIS file's copy of the body (sources stay whole)
  if (!WHOLE) {
    const covers = [cover('robe+shorts', underFlat), cover('kosode', L.kosode), cover('insleeve', L.insleeve), cover('tabi', L.tabi)];
    if (!KEEPLEGS) covers.push(cover('lining', L.lining));
    const r = cullCovered({ pos: C.body.P, idx: C.body.I, nrm: C.body.N }, covers); cullLog.body = r.stats;
    bodyPrim.getIndices().setArray(r.idx);
    log(`  cull: body ${r.stats.tris} -> ${r.stats.kept} tris, undergarment ${cullLog.under.tris} -> ${cullLog.under.kept}`);
  }
  const res = await wd.finish(OUT, { dumpTex: path.join(WORK, 'tex'), sidecar: path.join(WORK, 'char_akari_v3.layers.json') });
  // the skeleton stays the base's exactly (rest + inverse binds of the re-placed J_Sec_ chain nodes put back)
  const ks = await keepBaseSkeleton(OUT, BASE); log(`  skeleton: ${JSON.stringify(ks.check)} (${ks.moved.length} chain nodes put back to the base's rest)`);
  if (!ks.check.sameJoints || !ks.check.sameIBM || !ks.check.sameRest) throw new Error('skeleton differs from the base: ' + JSON.stringify(ks.check));
  const info = { out: OUT, tris: res.tris, skeleton: ks.check, cull: WHOLE ? 'whole' : cullLog, chains: wd.chains, size: fs.statSync(OUT).size, pieces: wd.pieces.filter((p) => !p.ghost).map((p) => ({ name: p.name, mat: p.mat, group: p.group, layer: p.layer ?? null, tris: p.geo.idx.length / 3 })) };
  fs.writeFileSync(path.join(WORK, 'build.json'), JSON.stringify(info, null, 1));
  fs.copyFileSync(OUT, path.join(WORK, 'char_akari_v3.glb'));
  log(`char_akari_v3: garment tris ${res.tris}, chains ${wd.chains.length}, ${(info.size / 1e6).toFixed(2)} MB (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  return info;
}

/** every piece added inside fn goes to its own node (mesh) unless it named one */
function withGroup(wd, group, fn) { const n0 = wd.pieces.length; const r = fn(); for (let i = n0; i < wd.pieces.length; i++) if (!wd.pieces[i].group) wd.pieces[i].group = group; return r; }

/** the hakama's front board: a stiff panel laid on the hakama's front right under the sash (ray-cast onto the hakama as
 *  built, so it follows its real surface and pleats), two pressed pleat lines; skinned like the hakama beneath */
function buildFrontBoard(wd, skirt, sash, F, col) {
  const C = wd.C, k = scaleOf(C); const hak = wd.pieces.find((p) => p.name === 'Hakama').geo;
  const yT = sash.yC - FIT.sashH / 2 * k - 0.0015 * k, h = F.h * k; const NU = 13, NV = 6;
  const front = [], back = [];
  for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) {
    const tv = v / (NV - 1), tu = u / (NU - 1) * 2 - 1, y = yT - h * tv, x = tu * lerp(F.wTop, F.wBot, tv) * k;
    const o = [x, y, 0.5], t = rayNear(hak, o, [0, 0, -1]); const z = t > 0 ? o[2] - t : 0.1;
    front.push([x, y, z + 0.0028 * k]); back.push([x, y, z - 0.0012 * k]);
  }
  // smooth the face a little across u (the pleats under it are deep; a board bridges them)
  for (let it = 0; it < 3; it++) for (let v = 0; v < NV; v++) for (let u = 1; u < NU - 1; u++) { const i = v * NU + u; front[i] = [front[i][0], front[i][1], Math.max(front[i][2], (front[i - 1][2] + front[i + 1][2]) / 2)]; }
  const idx = []; for (let v = 0; v < NV - 1; v++) for (let u = 0; u < NU - 1; u++) { const a = v * NU + u; idx.push(a, a + NU, a + 1, a + 1, a + NU, a + NU + 1); }
  const n = front.length; const all = front.concat(back); const id2 = idx.slice(); idx.forEach((_, t) => { if (t % 3 === 0) id2.push(idx[t] + n, idx[t + 2] + n, idx[t + 1] + n); });
  const ring = []; for (let u = 0; u < NU - 1; u++) ring.push([u, u + 1]); for (let v = 0; v < NV - 1; v++) ring.push([v * NU + NU - 1, (v + 1) * NU + NU - 1]); for (let u = NU - 1; u > 0; u--) ring.push([(NV - 1) * NU + u, (NV - 1) * NU + u - 1]); for (let v = NV - 1; v > 0; v--) ring.push([v * NU, (v - 1) * NU]);
  for (const [a, c] of ring) id2.push(a, c, a + n, c, c + n, a + n);
  const g = fixWinding({ pos: all, idx: id2, uv: [] }, [0, yT - h / 2, (front[Math.floor(n / 2)][2] + back[Math.floor(n / 2)][2]) / 2]); swatchUV(wd, g, col);
  const wb = wd.weightsBelow(g.pos, 5.4, { skip: (nm) => nm !== 'Hakama', reach: 0.05 });
  wd.piece('front_board', g, g.pos.map((p, i) => wb[i] || nearestWeights(C, p, { filter: (bn) => /Hips|Spine/.test(bn), k: 4 })), 'cloth_trim', { layer: 5.4 });
  for (const sx of [-0.42, 0.42]) {
    const uu = Math.round((sx + 1) / 2 * (NU - 1)); const pts = [], nr = [], ac = [];
    for (let v = 0; v < NV; v++) { pts.push(add(front[v * NU + uu], [0, 0, 0.0005 * k])); nr.push([0, 0, 1]); ac.push([1, 0, 0]); }
    const gl = strip(pts, nr, ac, 0.0011 * k, 0.0005 * k); swatchUV(wd, gl, [140, 18, 26]); const wl = wd.weightsBelow(gl.pos, 5.5, { skip: (nm) => nm !== 'Hakama', reach: 0.05 });
    wd.piece('front_board_pleat', gl, gl.pos.map((p, i) => wl[i] || W1(C.ji('J_Bip_C_Hips'))), 'cloth_trim', {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) await build();
void sub; void mul; void norm; void cross; void smooth; void wmix;
