// Helpers + build driver for the two landmarks (pagoda, rowboat). Not part of the kit; uses the kit's stages unchanged.
//
//   SCULPT_THREADS=2 node tools/sculpt/assets/landmarks_lib.mjs tools/sculpt/assets/pagoda.mjs [--quick]
//
// Why a driver: the pagoda's LOD1 / LOD2 (7000 / 1800 triangles for five roofs, sixty bracket clusters and twenty rails)
// cannot come from the simplifier (NOTES.md: many-part objects), so each LOD may be meshed from its own, simpler field:
// def.lodField[i] = which field LOD i comes from (0 = full; build() reads process.env.LM_FIELD), def.fieldVoxel[f] = its
// voxel. LOD0 bakes the colour atlas + object-space normal map exactly like build.mjs; the other LODs bake vertex colours
// (with each border vertex sampled inside its own part, as _smallprops.mjs does). def.vcAll = true: vertex colours on
// every LOD, no atlas (the rowboat). def.replaces = { file, scale } loads the game's present model for before_after.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../sdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');
export const C = P.color, mix = P.mix, ss = P.ss;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const field = () => +(process.env.LM_FIELD || 0);

// ================================================================================================= shape helpers
/** a beam between two corner points, slightly rounded */
export function beam(S, [x0, y0, z0, x1, y1, z1], r = 0.02) {
  return S.roundBox([Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], r).at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
/** union of many shapes as a balanced tree split along the longest axis (the kit's union() folds left: O(n) per sample) */
export function bunion(S, list) {
  const L = list.filter(Boolean);
  if (L.length === 0) return null;
  if (L.length === 1) return L[0];
  if (L.length === 2) return S.union(L[0], L[1]);
  const cen = (s, k) => (s.b[k] + s.b[k + 3]) / 2;
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const s of L) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], cen(s, k)); hi[k] = Math.max(hi[k], cen(s, k)); }
  const ax = [0, 1, 2].reduce((a, k) => (hi[k] - lo[k] > hi[a] - lo[a] ? k : a), 0);
  const sorted = L.slice().sort((a, b) => cen(a, ax) - cen(b, ax)), h = sorted.length >> 1;
  return S.union(bunion(S, sorted.slice(0, h)), bunion(S, sorted.slice(h)));
}
/** model one side on +Z, get all four (90 degree copies about Y) */
export const four = (s) => s.around(4, 0);
/** model one corner at +X+Z, get all four */
export const corners = (s) => s.mirror('x').mirror('z');

// ================================================================================================= build driver
async function main() {
  const args = process.argv.slice(2);
  const assetPath = args.find((a) => a.endsWith('.mjs') && !a.endsWith('landmarks_lib.mjs'));
  const quick = args.includes('--quick');
  const { loadModel } = await import('../model.mjs');
  const { Pool } = await import('../pool.mjs');
  const { PARTS } = await import('../sdf.mjs');
  const { extract, simplify, splitNormals, checkMesh } = await import('../mesh.mjs');
  const { unwrap, bakeAtlas, bakeVertexColors } = await import('../bake.mjs');
  const { writeStaticGLB } = await import('../gltf.mjs');
  const { faceTags } = await import('../build.mjs');
  const R = await import('../preview.mjs');
  const T0 = Date.now(), secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + ' s';
  delete process.env.LM_FIELD;
  const M0 = await loadModel(assetPath);
  const def = M0.def, cfg = M0.cfg, name = def.name;
  const qk = quick ? (def.quickVoxel || 1.6) : 1;
  if (quick && !def.vcAll) cfg.atlas = 512;
  const outDir = path.join(ROOT, '.tmp', 'sculpt', name); fs.mkdirSync(outDir, { recursive: true });
  const glbDir = path.join(ROOT, 'assets', 'models', 'sculpt'); fs.mkdirSync(glbDir, { recursive: true });
  const lodField = def.lodField || cfg.lods.map(() => 0);
  const fieldVoxel = def.fieldVoxel || [cfg.voxel];
  const fields = new Map(), pools = [];
  const getField = async (f) => {
    if (fields.has(f)) return fields.get(f);
    process.env.LM_FIELD = String(f);
    const M = f === 0 ? M0 : await loadModel(assetPath);
    const pool = new Pool(assetPath); pools.push(pool);
    const t = Date.now();
    const vox = (fieldVoxel[f] ?? cfg.voxel) * qk;
    console.log(`  field ${f}: voxel ${(vox * 1000).toFixed(1)} mm, bounds ${M.bounds.map((v) => v.toFixed(2)).join(' ')}`);
    const full = await extract(M, pool, vox, console.log);
    const tags = await faceTags(pool, full.pos, full.idx);
    console.log(`  field ${f}: ${full.idx.length / 3} tris, ${tags.flips} flipped (${secs(t)})`);
    delete process.env.LM_FIELD;
    const r = { M, pool, full, tags }; fields.set(f, r); return r;
  };
  try {
    const F0 = await getField(lodField[0]);
    const fb = checkMesh(F0.full.pos, F0.full.idx).bounds, diag = Math.hypot(fb[3] - fb[0], fb[4] - fb[1], fb[5] - fb[2]);
    const errs = cfg.lodError || [0.001, 0.004, 0.012].map((k) => k * diag);
    const lods = [];
    let prevField = -1, src = null;
    for (const [li, target] of cfg.lods.entries()) {
      const f = lodField[li], F = await getField(f);
      if (f !== prevField) src = { pos: F.full.pos, idx: F.full.idx, tag: F.tags.part };
      const t = Date.now();
      const s = simplify(src.pos, src.idx, target, { faceTag: src.tag, hardAngle: cfg.hardAngle ?? 50, maxError: errs[li] ?? Infinity, ...(cfg.lodTurn?.[li] != null ? { maxNormalTurn: cfg.lodTurn[li] } : {}) });
      const cb = checkMesh(s.pos, s.idx).bounds, drift = Math.max(...cb.map((v, k) => Math.abs(v - fb[k])));
      console.log(`  LOD${li} (field ${f}): ${s.idx.length / 3} tris (target ${target}), bbox drift ${(drift * 1000).toFixed(0)} mm (${secs(t)})`);
      s.F = F; lods.push(s); src = s; prevField = f;
    }
    const out = [];
    for (let i = 0; i < lods.length; i++) {
      const L = lods[i], t = Date.now();
      const sn = splitNormals(L.pos, L.idx, cfg.creaseAngle, { faceTag: L.tag });
      if (i === 0 && !def.vcAll) {
        const um = unwrap({ pos: sn.pos, idx: sn.idx, weld: sn.src }, cfg.atlas, { pad: quick ? 3 : 4 });
        const nrm = new Float32Array(um.src.length * 3);
        for (let v = 0; v < um.src.length; v++) nrm.set(sn.nrm.subarray(um.src[v] * 3, um.src[v] * 3 + 3), v * 3);
        console.log(`  unwrap: ${um.charts} charts, ${(1000 / um.scale).toFixed(1)} mm per texel`);
        const atlas = await bakeAtlas(L.F.pool, um, L.F.M, console.log);
        console.log(`  atlas: ${(atlas.used * 100).toFixed(1)} % used (${secs(t)})`);
        out.push({ pos: um.pos, nrm, idx: um.idx, uv: um.uv, tag: L.tag, atlas, um });
        continue;
      }
      // border vertices: sample each copy a little inside its own faces (crisp part borders in vertex colour)
      const nv = sn.pos.length / 3, tagsOf = new Map();
      for (let f = 0; f < sn.idx.length / 3; f++) for (let k = 0; k < 3; k++) { const s = sn.src[sn.idx[f * 3 + k]]; let q = tagsOf.get(s); if (!q) tagsOf.set(s, (q = new Set())); q.add(L.tag[f]); }
      const at = Float32Array.from(sn.pos), acc = new Float32Array(nv * 4);
      for (let f = 0; f < sn.idx.length / 3; f++) {
        const ia = sn.idx[f * 3], ib = sn.idx[f * 3 + 1], ic = sn.idx[f * 3 + 2];
        for (const v of [ia, ib, ic]) {
          if (tagsOf.get(sn.src[v]).size < 2) continue;
          for (let k = 0; k < 3; k++) acc[v * 4 + k] += (sn.pos[ia * 3 + k] + sn.pos[ib * 3 + k] + sn.pos[ic * 3 + k]) / 3;
          acc[v * 4 + 3]++;
        }
      }
      for (let v = 0; v < nv; v++) if (acc[v * 4 + 3]) for (let k = 0; k < 3; k++) at[v * 3 + k] = 0.35 * sn.pos[v * 3 + k] + 0.65 * acc[v * 4 + k] / acc[v * 4 + 3];
      const vc = await bakeVertexColors(L.F.pool, at, L.F.M);
      out.push({ pos: sn.pos, nrm: sn.nrm, idx: sn.idx, col: vc.col, tag: L.tag });
      console.log(`  LOD${i} vertex colours (${secs(t)})`);
    }
    const glb = path.join(glbDir, name + '.glb');
    const atlas = def.vcAll ? null : out[0].atlas;
    const extras = { author: 'sculpted for this project', lods: out.map((o, i) => ({ lod: i, tris: o.idx.length / 3 })), anchors: def.anchors || {}, voxel: cfg.voxel, atlas: atlas ? cfg.atlas : 0, vertexColour: !!def.vcAll };
    await writeStaticGLB(glb, { name, lods: out, parts: PARTS, materials: cfg.materials || {}, atlas, anchors: def.anchors || {}, extras });
    const bytes = await renameMaterials(glb, cfg.materials || {}, def.gameMats || {});
    console.log(`  wrote ${path.relative(ROOT, glb)} (${(bytes / 1024).toFixed(0)} KB)`);
    if (atlas) {
      fs.writeFileSync(path.join(outDir, 'atlas_color.png'), R.encodePNG(atlas.size, atlas.size, atlas.color, 4));
      fs.writeFileSync(path.join(outDir, 'atlas_normal.png'), R.encodePNG(atlas.size, atlas.size, atlas.normal, 4));
    }
    let before = null, beforeBounds = null;
    if (def.replaces) { before = await loadBefore(def.replaces, R); beforeBounds = bboxOf(before); }
    const checks = {
      name, quick, full: checkMesh(F0.full.pos, F0.full.idx),
      lods: out.map((o, i) => ({ lod: i, target: cfg.lods[i], field: lodField[i], ...checkMesh(lods[i].pos, lods[i].idx), vertsWritten: o.pos.length / 3 })),
      atlas: atlas ? { size: atlas.size, used: +(atlas.used * 100).toFixed(1), mmPerTexel: +(1000 / out[0].um.scale).toFixed(1), charts: out[0].um.charts } : null,
      fileKB: Math.round(bytes / 1024),
    };
    const b = checks.lods[0].bounds;
    if (beforeBounds) checks.vsReplaced = { replaced: def.replaces.file, scale: def.replaces.scale, before: beforeBounds.map((v) => +v.toFixed(3)), after: b.map((v) => +v.toFixed(3)), sizeBefore: sizeOf(beforeBounds), sizeAfter: sizeOf(b), maxDelta: +Math.max(...b.map((v, k) => Math.abs(v - beforeBounds[k]))).toFixed(3) };
    const frag = { [def.id || 'sculpt_' + name]: {
      file: `models/sculpt/${name}.glb`, type: 'model', license: 'CC0 (original work)', author: 'sculpted for this project',
      source: `tools/sculpt/assets/${name}.mjs (node tools/sculpt/assets/landmarks_lib.mjs)`, scale: 1,
      size: sizeOf(b), tris: checks.lods[0].tris, lods: checks.lods.map((l) => l.tris),
      materials: Object.entries(cfg.materials || {}).map(([k, m]) => matName(k, m, def, !atlas)),
      mats: Object.fromEntries(Object.entries(cfg.materials || {}).map(([k, m]) => [matName(k, m, def, !atlas), { surface: m.surface, look: m.look || {} }])),
      notes: def.notes || '',
    } };
    fs.writeFileSync(path.join(glbDir, name + '.manifest.json'), JSON.stringify(frag, null, 1) + '\n');
    await sheets({ def, out, before, outDir, quick, R });
    checks.buildSeconds = +((Date.now() - T0) / 1000).toFixed(1);
    fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 1));
    console.log(JSON.stringify({ lods: checks.lods.map((l) => [l.tris, l.watertight, l.openEdges, l.nonManifoldEdges]), size: sizeOf(b), before: beforeBounds && sizeOf(beforeBounds), maxDelta: checks.vsReplaced?.maxDelta, atlas: checks.atlas, fileKB: checks.fileKB }));
  } finally { for (const p of pools) await p.close().catch(() => {}); }
  console.log(`done in ${secs(T0)}`);
}
const matName = (k, m, def, vc) => (def.gameMats || {})[k] || (vc ? m.name : `${m.name}_${m.surface}`);
const sizeOf = (b) => [+(b[3] - b[0]).toFixed(3), +(b[4] - b[1]).toFixed(3), +(b[5] - b[2]).toFixed(3)];
function bboxOf(meshes) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
  return b;
}

/** vertex-coloured materials: `<Name>_<surface>_vc` -> the game's name (def.gameMats[key]) or `<Name>_<surface>` */
async function renameMaterials(file, materials, gameMats) {
  const { NodeIO } = await import('@gltf-transform/core');
  const io = new NodeIO();
  const doc = await io.read(file);
  for (const m of doc.getRoot().listMaterials()) for (const [k, spec] of Object.entries(materials)) {
    if (gameMats[k] && (m.getName() === `${spec.name}_${spec.surface}_vc` || m.getName() === `${spec.name}_${spec.surface}`)) m.setName(gameMats[k]);
  }
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(file, bin);
  return bin.length;
}

/** the model the game shows now, as renderer meshes (manifest scale applied; COLOR_0 kept) */
export async function loadBefore({ file, scale = 1 }, R) {
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(path.join(ROOT, file));
  const meshes = [];
  const visit = (node, mat) => {
    const m = mul4(mat, node.getMatrix()), mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ca = prim.getAttribute('COLOR_0'), ia = prim.getIndices();
      const n = pa.getCount(), pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), t = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        pa.getElement(i, t); const x = t[0], y = t[1], z = t[2];
        pos[i * 3] = (m[0] * x + m[4] * y + m[8] * z + m[12]) * scale; pos[i * 3 + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) * scale; pos[i * 3 + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) * scale;
        if (na) { na.getElement(i, t); const a = m[0] * t[0] + m[4] * t[1] + m[8] * t[2], b = m[1] * t[0] + m[5] * t[1] + m[9] * t[2], c = m[2] * t[0] + m[6] * t[1] + m[10] * t[2]; const l = Math.hypot(a, b, c) || 1; nrm[i * 3] = a / l; nrm[i * 3 + 1] = b / l; nrm[i * 3 + 2] = c / l; }
      }
      const idx = ia ? Uint32Array.from(ia.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      const mt = prim.getMaterial();
      const base = mt ? mt.getBaseColorFactor().slice(0, 3) : [0.7, 0.7, 0.7];
      let col = null;
      if (ca) { col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { ca.getElement(i, t); col[i * 3] = t[0]; col[i * 3 + 1] = t[1]; col[i * 3 + 2] = t[2]; } }
      meshes.push({ pos, nrm, idx, col, base });
    }
    for (const c of node.listChildren()) visit(c, m);
  };
  for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) visit(n, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return meshes;
}
function mul4(a, b) {
  const o = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
  return o;
}

function lodMeshes(o, i) {
  if (o.atlas) return [{ pos: o.pos, nrm: o.nrm, idx: o.idx, uv: o.uv, tex: o.tex, nmap: o.nmap, base: [1, 1, 1] }];
  return [{ pos: o.pos, nrm: o.nrm, idx: o.idx, col: o.col, base: [1, 1, 1] }];
}

async function sheets({ def, out, before, outDir, quick, R }) {
  const name = def.name, save = (n, img) => { R.savePNG(path.join(outDir, n), img); console.log(`  sheet .tmp/sculpt/${name}/${n}`); };
  for (const o of out) if (o.atlas) { o.tex = R.texture(o.atlas.size, o.atlas.size, o.atlas.color, true); o.nmap = R.texture(o.atlas.size, o.atlas.size, o.atlas.normal, false); }
  const after = lodMeshes(out[0], 0);
  const b = bboxOf(after), c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const H = b[4] - b[1], W = Math.max(b[3] - b[0], b[5] - b[2]), rxz = W / 2;
  const fov = 35, ts = quick ? 320 : 460, dist = R.fitDistance(b, fov, 0.86);
  const views = [];
  for (let i = 0; i < 8; i++) views.push([i * 45, 8, `${i * 45} DEG`]);
  for (let i = 0; i < 3; i++) views.push([30 + i * 120, 50, `ABOVE ${30 + i * 120}`]);
  views.push([20, -25, 'BELOW']);
  save('turntable.png', R.sheet(views.map(([az, el, label]) => ({ img: R.render(after, R.orbit(c, az, el, dist, fov, ts, ts), { ground: el > 0 }), label })), 4, { title: `${name} TURNTABLE (LOD0 ${out[0].idx.length / 3} TRIS)` }));
  save('clay.png', R.sheet([0, 90, 180, 270].map((az) => ({ img: R.render(after, R.orbit(c, az + 20, 10, dist, fov, ts, ts), { clay: true }), label: `CLAY ${az + 20}` })).concat([{ img: R.render(after, R.orbit(c, 40, 65, dist, fov, ts, ts), { clay: true }), label: 'CLAY ABOVE' }]), 5, { title: `${name} CLAY - FORM ONLY` }));
  // hero: two metres from the object, standing eye height, looking at the part in front of the eye (tall objects: up a little)
  const heroW = quick ? 960 : 1920, heroH = quick ? 540 : 1080, eyeY = 1.6, heroD = 2 + rxz;
  const look = Math.min(b[1] + H * 0.5, eyeY + (def.heroLookUp ?? 0));
  const heroCam = (az, w = heroW, h = heroH, fv = 62) => { const a = az * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * heroD, eyeY, c[2] + Math.cos(a) * heroD], [c[0], look, c[2]], fv, w, h); };
  save('hero.png', R.render(after, heroCam(28)));
  // game camera: the whole object about 300 px tall; plus a close game-camera view (8 m) for big objects
  const gameCam = (w, h, px, az = 25) => { const k = 1 / Math.tan(50 * Math.PI / 360); const d = (h / 2) * k * Math.max(H, W * 0.75) / px; const a = az * Math.PI / 180, e = 12 * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * d * Math.cos(e), c[1] + Math.sin(e) * d, c[2] + Math.cos(a) * d * Math.cos(e)], c, 50, w, h); };
  save('game.png', R.sheet(out.map((o, i) => ({ img: R.render(lodMeshes(o, i), gameCam(560, 640, 300)), label: `LOD${i} ${o.idx.length / 3} TRIS` })), 3, { title: `${name} AT GAME DISTANCE (300 PX TALL)` }));
  const lt = [];
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(lodMeshes(out[i], i), R.orbit(c, 30, 10, dist, fov, ts, ts)), label: `LOD${i} ${out[i].idx.length / 3}` });
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(lodMeshes(out[i], i).map((m) => ({ ...m, col: null, tex: null, nmap: null, uv: null })), R.orbit(c, 30, 10, dist, fov, ts, ts), { wire: true, clay: true }), label: `LOD${i} WIRE` });
  save('lods.png', R.sheet(lt, out.length, { title: `${name} LODS` }));
  // far: small in the distance (LOD1 at 150 px, LOD2 at 70 px and 40 px)
  if (def.farSheet) {
    const ft = [[1, 150], [2, 70], [2, 40]].filter(([i]) => out[i]).map(([i, px]) => ({ img: R.render(lodMeshes(out[i], i), gameCam(260, 260, px, 200)), label: `LOD${i} ${px} PX` }));
    save('far.png', R.sheet(ft, ft.length, { title: `${name} SMALL IN THE DISTANCE` }));
  }
  if (def.closeSheet) {
    // what the player sees at 6-10 m: four views at the game camera's height, LOD0
    const cl = def.closeSheet.map(([az, d, y, ty]) => { const a = az * Math.PI / 180; return { img: R.render(after, R.camera([c[0] + Math.sin(a) * d, y, c[2] + Math.cos(a) * d], [c[0], ty, c[2]], 55, quick ? 480 : 720, quick ? 400 : 600)), label: `${d} M AZ ${az}` }; });
    save('close.png', R.sheet(cl, 2, { title: `${name} AT 6-10 M (LOD0)` }));
  }
  if (before) {
    const bs = quick ? 420 : 640;
    const cmp = (az) => heroCam(az, bs, bs, 62);
    const gc = gameCam(bs, Math.round(bs * 0.8), Math.round(bs * 0.6));
    const tiles = [
      { img: R.render(before, cmp(28)), label: 'BEFORE - 2 M' }, { img: R.render(after, cmp(28)), label: 'AFTER - 2 M' },
      { img: R.render(before, cmp(208)), label: 'BEFORE - BACK' }, { img: R.render(after, cmp(208)), label: 'AFTER - BACK' },
      { img: R.render(before, gc), label: 'BEFORE - GAME CAMERA' }, { img: R.render(lodMeshes(out[1], 1), gc), label: 'AFTER LOD1 - GAME CAMERA' },
      { img: R.render(before, R.orbit(c, 28, 10, dist, fov, bs, bs), { clay: true }), label: 'BEFORE - CLAY' }, { img: R.render(after, R.orbit(c, 28, 10, dist, fov, bs, bs), { clay: true }), label: 'AFTER - CLAY' },
    ];
    save('before_after.png', R.sheet(tiles, 2, { title: `${name} BEFORE / AFTER - SAME CAMERA AND LIGHT` }));
  }
}

/** quick look at the game's present model only: node landmarks_lib.mjs --before <file> <scale> <outDir> */
async function lookBefore(file, scale, outName) {
  const R = await import('../preview.mjs');
  const m = await loadBefore({ file, scale: +scale }, R);
  const b = bboxOf(m), c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], dist = R.fitDistance(b, 35, 0.86);
  const tiles = [0, 90, 180, 270].map((az) => ({ img: R.render(m, R.orbit(c, az + 25, 12, dist, 35, 400, 400), { ground: true }), label: `OLD ${az + 25}` }));
  const outDir = path.join(ROOT, '.tmp', 'sculpt', outName); fs.mkdirSync(outDir, { recursive: true });
  R.savePNG(path.join(outDir, 'old.png'), R.sheet(tiles, 4, { title: `${file} (the model the game has now)` }));
  console.log('bounds', b.map((v) => v.toFixed(3)).join(' '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const run = a[0] === '--before' ? lookBefore(a[1], a[2], a[3]) : main();
  run.catch((e) => { console.error(e); process.exit(1); });
}
