#!/usr/bin/env node
// One-liner build of a sculpted asset:
//   node tools/sculpt/build.mjs tools/sculpt/assets/<name>.mjs [--quick] [--sheets-only] [--threads N]
// -> assets/models/sculpt/<name>.glb, assets/models/sculpt/<name>.manifest.json (fragment for tools/manifest-patch.mjs),
//    .tmp/sculpt/<name>/*.png sheets + checks.json. --quick: coarser voxel, 512 atlas, fewer sheets (for fast looks).
// Skinned assets (def.rig) go through tools/sculpt/rig.mjs (weights, skinned GLB, pose sheets).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel } from './model.mjs';
import { Pool } from './pool.mjs';
import { PARTS } from './sdf.mjs';
import { extract, simplify, splitNormals, checkMesh, faceData } from './mesh.mjs';
import { unwrap, bakeAtlas, bakeVertexColors } from './bake.mjs';
import { writeStaticGLB } from './gltf.mjs';
import * as R from './preview.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

export function log(...a) { console.log(...a); }
const secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + ' s';

async function main() {
  const assetPath = args.find((a) => a.endsWith('.mjs'));
  if (!assetPath) { console.error('usage: node tools/sculpt/build.mjs tools/sculpt/assets/<name>.mjs [--quick]'); process.exit(2); }
  const T0 = Date.now();
  const quick = flag('--quick');
  const M = await loadModel(assetPath);
  if (quick) { M.cfg.voxel *= 1.6; M.cfg.atlas = 512; }
  const name = M.def.name;
  const outDir = path.join(ROOT, '.tmp', 'sculpt', name); fs.mkdirSync(outDir, { recursive: true });
  const glbDir = path.join(ROOT, 'assets', 'models', 'sculpt'); fs.mkdirSync(glbDir, { recursive: true });
  const pool = new Pool(assetPath, { threads: +opt('--threads', 0) || undefined });
  log(`sculpt ${name}: ${pool.size} workers, voxel ${(M.cfg.voxel * 1000).toFixed(1)} mm, bounds ${M.bounds.map((v) => v.toFixed(2)).join(' ')}`);
  try {
    if (M.def.rig) {
      const { buildSkinned } = await import('./rig.mjs');
      await buildSkinned(M, pool, { outDir, glbDir, quick, log, T0 });
    } else await buildStatic(M, pool, { outDir, glbDir, quick, T0 });
  } finally { await pool.close(); }
  log(`done in ${secs(T0)}`);
}

// ------------------------------------------------------------------------------------------------------------ static
async function buildStatic(M, pool, { outDir, glbDir, quick, T0 }) {
  const name = M.def.name, cfg = M.cfg, timings = {};
  let t = Date.now();
  const full = await extract(M, pool, cfg.voxel, log);
  timings.extract = Date.now() - t; t = Date.now();
  const tags = await faceTags(pool, full.pos, full.idx);
  log(`  face tags: ${tags.flips} faces disagree with the field gradient`);
  // LOD chain
  const lods = [];
  let src = { pos: full.pos, idx: full.idx, tag: tags.part };
  const fb0 = checkMesh(full.pos, full.idx).bounds, diag = Math.hypot(fb0[3] - fb0[0], fb0[4] - fb0[1], fb0[5] - fb0[2]);
  const errs = cfg.lodError || [0.001, 0.004, 0.012].map((k) => k * diag);
  for (const [li, target] of cfg.lods.entries()) {
    const s = simplify(src.pos, src.idx, target, { faceTag: src.tag, hardAngle: cfg.hardAngle ?? 50, maxError: errs[li] ?? Infinity });
    if (s.idx.length / 3 > target * 1.02) log(`  LOD${li}: the error limit ${(errs[li] * 1000).toFixed(1)} mm (cfg.lodError) / topology kept it above ${target} tris`);
    lods.push(s); src = s;
    // silhouette guard: a LOD whose bounding box drifts from the full mesh's lost a part (or folded)
    const cb = checkMesh(s.pos, s.idx).bounds, fb = checkMesh(full.pos, full.idx).bounds;
    const drift = Math.max(...cb.map((v, k) => Math.abs(v - fb[k])));
    log(`  LOD${lods.length - 1}: ${s.idx.length / 3} tris, bbox drift ${(drift * 1000).toFixed(0)} mm${drift > 0.02 ? '  <-- WARNING: look at lods.png' : ''} (${secs(t)})`);
  }
  timings.simplify = Date.now() - t; t = Date.now();
  // normals + unwrap LOD0 + bake
  const out = [];
  for (let i = 0; i < lods.length; i++) {
    const L = lods[i];
    const sn = splitNormals(L.pos, L.idx, cfg.creaseAngle, { faceTag: L.tag });
    if (i === 0) {
      const um = unwrap({ pos: sn.pos, idx: sn.idx, weld: sn.src }, cfg.atlas, { pad: quick ? 3 : 4 });
      const nrm = new Float32Array(um.src.length * 3);
      for (let v = 0; v < um.src.length; v++) nrm.set(sn.nrm.subarray(um.src[v] * 3, um.src[v] * 3 + 3), v * 3);
      log(`  unwrap: ${um.charts} charts, ${(1000 / um.scale).toFixed(2)} mm per texel`);
      const atlas = await bakeAtlas(pool, um, M, log);
      log(`  atlas baked: ${(atlas.used * 100).toFixed(1)} % used, seam step ${(atlas.seam * 100).toFixed(1)} % (${secs(t)})`);
      out.push({ pos: um.pos, nrm, idx: um.idx, uv: um.uv, tag: L.tag, atlas, um });
    } else {
      const vc = await bakeVertexColors(pool, sn.pos, M);
      out.push({ pos: sn.pos, nrm: sn.nrm, idx: sn.idx, col: vc.col, tag: L.tag });
    }
  }
  timings.bake = Date.now() - t; t = Date.now();
  // write
  const glb = path.join(glbDir, name + '.glb');
  const atlas = out[0].atlas;
  const extras = { author: 'sculpted for this project', lods: out.map((o, i) => ({ lod: i, tris: o.idx.length / 3 })), anchors: M.def.anchors || {}, voxel: cfg.voxel, atlas: cfg.atlas };
  const bytes = await writeStaticGLB(glb, { name, lods: out, parts: PARTS, materials: cfg.materials || {}, atlas, anchors: M.def.anchors || {}, extras });
  log(`  wrote ${path.relative(ROOT, glb)} (${(bytes / 1024).toFixed(0)} KB)`);
  fs.writeFileSync(path.join(outDir, 'atlas_color.png'), R.encodePNG(atlas.size, atlas.size, atlas.color, 4));
  fs.writeFileSync(path.join(outDir, 'atlas_normal.png'), R.encodePNG(atlas.size, atlas.size, atlas.normal, 4));
  // checks
  const checks = {
    name, buildSeconds: 0, full: checkMesh(full.pos, full.idx), flippedFacesVsField: tags.flips,
    lods: out.map((o, i) => ({ lod: i, ...checkMesh(lods[i].pos, lods[i].idx), vertsWritten: o.pos.length / 3 })),
    atlas: { size: atlas.size, used: +(atlas.used * 100).toFixed(1) + ' %', seamStep: +(atlas.seam * 100).toFixed(2) + ' %', mmPerTexel: +(1000 / out[0].um.scale).toFixed(2), charts: out[0].um.charts },
    fileKB: Math.round(bytes / 1024), timings,
  };
  // manifest fragment
  const b = checks.lods[0].bounds;
  const frag = { [M.def.id || 'sculpt_' + name]: {
    file: `models/sculpt/${name}.glb`, type: 'model', license: 'CC0 (original work)', author: 'sculpted for this project',
    source: `tools/sculpt/assets/${name}.mjs (node tools/sculpt/build.mjs)`, scale: 1,
    size: [+(b[3] - b[0]).toFixed(3), +(b[4] - b[1]).toFixed(3), +(b[5] - b[2]).toFixed(3)],
    tris: checks.lods[0].tris, lods: checks.lods.map((l) => l.tris),
    materials: Object.values(cfg.materials || {}).map((m) => `${m.name}_${m.surface}`),
    mats: Object.fromEntries(Object.values(cfg.materials || {}).map((m) => [`${m.name}_${m.surface}`, { surface: m.surface, look: m.look || {} }])),
    notes: M.def.notes || '',
  } };
  fs.writeFileSync(path.join(glbDir, name + '.manifest.json'), JSON.stringify(frag, null, 1) + '\n');
  // sheets
  await staticSheets(M, out, { outDir, quick });
  timings.sheets = Date.now() - t;
  checks.buildSeconds = +((Date.now() - T0) / 1000).toFixed(1);
  fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 1));
  log(JSON.stringify({ lods: checks.lods.map((l) => [l.tris, l.watertight, l.openEdges, l.nonManifoldEdges]), atlas: checks.atlas, fileKB: checks.fileKB }));
}

export async function faceTags(pool, pos, idx) {
  const { cent, fn } = faceData(pos, idx), nf = idx.length / 3;
  const per = Math.ceil(nf / (pool.size * 6)), chunks = [];
  for (let i = 0; i < nf; i += per) chunks.push({ cent: cent.slice(i * 3, Math.min(nf, i + per) * 3), fn: fn.slice(i * 3, Math.min(nf, i + per) * 3) });
  const rs = await pool.map('faces', chunks);
  const part = new Int16Array(nf); let o = 0, flips = 0;
  for (const r of rs) { part.set(r.part, o); o += r.part.length; for (const v of r.flip) flips += v; }
  return { part, flips };
}

// ------------------------------------------------------------------------------------------------------------ sheets
/** renderer meshes for the sculpt's LODs (lod 0 textured) */
export function sculptMeshes(out, lod) {
  const o = out[lod];
  if (lod === 0) return [{ pos: o.pos, nrm: o.nrm, idx: o.idx, uv: o.uv, tex: R.texture(o.atlas.size, o.atlas.size, o.atlas.color, true), nmap: R.texture(o.atlas.size, o.atlas.size, o.atlas.normal, false), base: [1, 1, 1] }];
  return [{ pos: o.pos, nrm: o.nrm, idx: o.idx, col: o.col, base: [1, 1, 1] }];
}

/** three.js Object3D -> renderer meshes (world transforms baked; MeshBasic = unlit) */
export function threeToMeshes(obj) {
  obj.updateMatrixWorld(true);
  const out = [];
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    const n = P.count, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), e = o.matrixWorld.elements;
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      pos[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (N) { const a = N.getX(i), b = N.getY(i), c = N.getZ(i); const nx = e[0] * a + e[4] * b + e[8] * c, ny = e[1] * a + e[5] * b + e[9] * c, nz = e[2] * a + e[6] * b + e[10] * c; const l = Math.hypot(nx, ny, nz) || 1; nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l; }
    }
    const idx = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const col = C ? Float32Array.from({ length: n * 3 }, (_, i) => (i % 3 === 0 ? C.getX(i / 3 | 0) : i % 3 === 1 ? C.getY(i / 3 | 0) : C.getZ(i / 3 | 0))) : null;
    out.push({ pos, nrm: N ? nrm : null, idx, col: m.vertexColors ? col : null, base: m.color ? [m.color.r, m.color.g, m.color.b] : [0.7, 0.7, 0.7], emit: !!m.isMeshBasicMaterial, name: o.name });
  });
  return out;
}

function boundsOf(meshes) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
  return b;
}

async function staticSheets(M, out, { outDir, quick }) {
  const t = Date.now();
  const after = sculptMeshes(out, 0);
  let before = null, live = [];
  if (M.def.before) { const r = await M.def.before({ ROOT, threeToMeshes }); before = r.meshes; live = r.live || []; }
  const b = boundsOf(after), c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const H = b[4] - b[1], rxz = Math.max(b[3] - b[0], b[5] - b[2]) / 2;
  const withLive = (m) => m.concat(live);
  const save = (n, img) => { R.savePNG(path.join(outDir, n), img); log(`  sheet ${path.relative(ROOT, path.join(outDir, n))}`); };
  // turntable: 8 around at eye level, 3 from above, 1 from below
  const fov = 35, ts = quick ? 320 : 480, dist = R.fitDistance(b, fov, 0.86);
  const views = [];
  for (let i = 0; i < 8; i++) views.push([i * 45, 8, `${i * 45} DEG`]);
  for (let i = 0; i < 3; i++) views.push([30 + i * 120, 50, `ABOVE ${30 + i * 120}`]);
  views.push([20, -25, 'BELOW']);
  const tiles = views.map(([az, el, label]) => ({ img: R.render(withLive(after), R.orbit(c, az, el, dist, fov, ts, ts), { ground: el > 0 }), label }));
  save('turntable.png', R.sheet(tiles, 4, { title: `${M.def.name} TURNTABLE (LOD0)` }));
  // clay (form only)
  const clay = [0, 90, 180, 270].map((az) => ({ img: R.render(after, R.orbit(c, az + 20, 10, dist, fov, ts, ts), { clay: true }), label: `CLAY ${az + 20}` }));
  save('clay.png', R.sheet(clay, 4, { title: `${M.def.name} CLAY - FORM ONLY` }));
  // hero: two metres away, standing eye height
  const heroW = quick ? 960 : 1920, heroH = quick ? 540 : 1080;
  const eyeY = 1.6, heroD = 2 + rxz;
  const heroCam = (az) => { const a = az * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * heroD, eyeY, c[2] + Math.cos(a) * heroD], [c[0], b[1] + H * 0.5, c[2]], 62, heroW, heroH); };
  save('hero.png', R.render(withLive(after), heroCam(28)));
  // game camera: object about 300 px tall in a 1280x720 frame, camera raised
  const gameCam = (w, h, px) => { const k = 1 / Math.tan(50 * Math.PI / 360); const d = (h / 2) * k * H / px; const a = 25 * Math.PI / 180, e = 12 * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * d * Math.cos(e), c[1] + Math.sin(e) * d, c[2] + Math.cos(a) * d * Math.cos(e)], c, 50, w, h); };
  const gameImgs = out.map((_, i) => R.render(withLive(sculptMeshes(out, i)), gameCam(640, 720, 300)));
  save('game.png', R.sheet(gameImgs.map((img, i) => ({ img, label: `LOD${i} ${out[i].idx.length / 3} TRIS - GAME CAMERA` })), 3, { title: `${M.def.name} AT GAME DISTANCE (300 PX TALL)` }));
  // LODs side by side: shaded + wire
  const lodTiles = [];
  for (let i = 0; i < out.length; i++) lodTiles.push({ img: R.render(sculptMeshes(out, i), R.orbit(c, 30, 10, dist, fov, ts, ts)), label: `LOD${i} ${out[i].idx.length / 3}` });
  for (let i = 0; i < out.length; i++) lodTiles.push({ img: R.render(sculptMeshes(out, i).map((m) => ({ ...m, tex: null, nmap: null, col: null, uv: null })), R.orbit(c, 30, 10, dist, fov, ts, ts), { wire: true, clay: true }), label: `LOD${i} WIRE` });
  save('lods.png', R.sheet(lodTiles, out.length, { title: `${M.def.name} LODS` }));
  // before / after
  if (before) {
    const bs = quick ? 480 : 760, hb = Math.round(bs * 1.25);
    const cmpCam = (az) => R.camera([c[0] + Math.sin(az * Math.PI / 180) * heroD, eyeY, c[2] + Math.cos(az * Math.PI / 180) * heroD], [c[0], b[1] + H * 0.5, c[2]], 66, bs, hb);
    const gc = gameCam(bs, Math.round(bs * 0.6), 220);
    const tilesBA = [
      { img: R.render(before, cmpCam(28)), label: 'BEFORE - 2 M' }, { img: R.render(withLive(after), cmpCam(28)), label: 'AFTER - 2 M' },
      { img: R.render(before, cmpCam(208)), label: 'BEFORE - BACK' }, { img: R.render(withLive(after), cmpCam(208)), label: 'AFTER - BACK' },
      { img: R.render(before, gc), label: 'BEFORE - GAME CAMERA' }, { img: R.render(withLive(sculptMeshes(out, 1)), gc), label: 'AFTER LOD1 - GAME CAMERA' },
      { img: R.render(before, R.orbit(c, 28, 10, dist, fov, bs, bs), { clay: true }), label: 'BEFORE - CLAY' }, { img: R.render(after, R.orbit(c, 28, 10, dist, fov, bs, bs), { clay: true }), label: 'AFTER - CLAY' },
    ];
    save('before_after.png', R.sheet(tilesBA, 2, { title: `${M.def.name} BEFORE / AFTER - SAME CAMERA AND LIGHT` }));
  }
  log(`  sheets in ${secs(t)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
