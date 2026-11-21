// Shared helper of the nine small props (jar_a, jar_b, pot_clay, pot_large, pumpkin_a, pumpkin_b, barrel, bucket,
// handcart). Two jobs:
//  1. shape + paint helpers used by those asset files (wheel-thrown vessels, staves, rope, wood, clay paint);
//  2. a VERTEX-COLOUR build driver. These props are drawn batched per material family (src/props/models.js: one
//     THREE.BatchedMesh per material, lit vertex-coloured parts folded into a white family material) and the pumpkins
//     go through the flora batches (src/world/flora/batches.js, 'fruit' = tint mode, grey ramp only). Neither path may
//     carry a texture or a normal map, but tools/sculpt/build.mjs always bakes LOD0 to an atlas. This driver runs the
//     same kit stages (extract, simplify, splitNormals, vertex-colour bake, writer, renderer) with COLOR_0 on every LOD,
//     then renames the materials to the exact names the game keys on (clay, glaze, wood, metal, fruit, stalk ...).
//
//   SCULPT_THREADS=2 node tools/sculpt/assets/_smallprops.mjs tools/sculpt/assets/<name>.mjs [--quick]
//
// Outputs exactly where build.mjs puts them: assets/models/sculpt/<name>.glb + .manifest.json, .tmp/sculpt/<name>/*.png,
// checks.json. Asset fields used besides the kit's: `gameMats` (material key -> exact glTF material name),
// `previewTint` (material key -> linear RGB multiplier for the sheets only: the flora tint the game applies per
// instance), `replaces` ({ file, scale } of the model it replaces, for before_after.png and the bounding-box check).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../sdf.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..');

// ===================================================================================================== shape helpers
/**
 * Wheel-thrown vessel: an outside profile [[r, y], ...] from the foot up to the lip, a wall thickness, a floor.
 * Returns a solid lathe (outside up, over the rounded lip, down the inside) — throwing rings, off-round and lean are
 * applied by `thrownWarp`.
 */
export function vessel(outside, { wall = 0.012, floor = 0.018, lip = 0.006, foot = 0 } = {}) {
  const prof = [[0, 0]];
  for (const p of outside) prof.push(p);
  const top = outside[outside.length - 1];
  // inside: offset the outside inward by `wall` (radial offset is fine for gentle profiles)
  const inner = [];
  for (let i = outside.length - 1; i >= 0; i--) {
    const [r, y] = outside[i];
    if (y < floor + 0.004) break;
    inner.push([Math.max(0.004, r - wall), Math.min(y, top[1] - lip * 0.4)]);
  }
  for (const p of inner) prof.push(p);
  const last = inner[inner.length - 1] || [top[0] - wall, top[1] - lip];
  prof.push([Math.max(0.004, last[0] - wall * 0.5), floor]);
  prof.push([0, floor]);
  return P.lathe(prof, { smooth: lip * 0.5 });
}

/**
 * Throwing rings, an off-round mouth and a slight lean as one warp (displacement along the radial direction).
 * rings: { pitch, amp, from, to } (spiral grooves left by fingers), oval: amount of off-round at the top (m),
 * lean: metres of sideways shift at the top, h: vessel height.
 */
export function thrownWarp(shape, { h, rings = null, oval = 0, ovalAng = 0, lean = 0, leanAng = 0, seed = 1 }) {
  const ca = Math.cos(ovalAng * Math.PI / 180), sa = Math.sin(ovalAng * Math.PI / 180);
  const cl = Math.cos(leanAng * Math.PI / 180), sl = Math.sin(leanAng * Math.PI / 180);
  return shape.warp((x, y, z, o) => {
    const t = Math.max(0, Math.min(1, y / h));
    const r = Math.hypot(x, z) || 1e-6, ux = x / r, uz = z / r;
    let d = 0;
    if (rings) {
      // revision 2: even, horizontal rings (the spiral term had a seam at atan2 = +-pi, and the noise-modulated
      // amplitude read as low-frequency lumps / a melted body); `jitter` keeps a trace of the hand (default 0.12)
      const { pitch, amp, from = 0.1, to = 0.95, jitter = 0.12 } = rings;
      const ph = y / pitch;
      const env = P.ss(from - 0.05, from + 0.05, t) * P.ss(to + 0.04, to - 0.04, t);
      d += amp * env * (1 - jitter + jitter * P.noise3(x * 4, y * 2, z * 4, seed)) * Math.sin(ph * 2 * Math.PI);
    }
    if (oval) { const k = (ux * ca + uz * sa); d += oval * t * t * (2 * k * k - 1); }
    o[0] = ux * d + lean * t * t * cl; o[2] = uz * d + lean * t * t * sl; o[1] = 0;
  }, { lip: 1.35, grow: Math.max(0.01, Math.abs(oval) + Math.abs(lean) + (rings ? rings.amp : 0)) });
}

/** rope: a twisted tube along points (two plies as a groove pattern) */
export function rope(points, r, { lay = 0.022, seed = 1 } = {}) {
  let t = P.tube(points, r);
  // ply grooves: helical cuts made by a warp of the radius is not available -> use a twisting strata along the tube axis
  t = t.rough({ type: 'fbm', scale: r * 3, amp: r * 0.12, seed });
  return t;
}

// ===================================================================================================== paint helpers
export const C = P.color;
export const mix = P.mix, ss = P.ss, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ===================================================================================================== build driver
async function main() {
  const args = process.argv.slice(2);
  const assetPath = args.find((a) => a.endsWith('.mjs'));
  const quick = args.includes('--quick');
  const { loadModel } = await import('../model.mjs');
  const { Pool } = await import('../pool.mjs');
  const { PARTS } = await import('../sdf.mjs');
  const { extract, simplify, splitNormals, checkMesh } = await import('../mesh.mjs');
  const { bakeVertexColors } = await import('../bake.mjs');
  const { writeStaticGLB } = await import('../gltf.mjs');
  const { faceTags } = await import('../build.mjs');
  const R = await import('../preview.mjs');
  const T0 = Date.now(), secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + ' s';
  const M = await loadModel(assetPath);
  const cfg = M.cfg, def = M.def, name = def.name;
  if (quick) cfg.voxel *= 1.5;
  const outDir = path.join(ROOT, '.tmp', 'sculpt', name); fs.mkdirSync(outDir, { recursive: true });
  const glbDir = path.join(ROOT, 'assets', 'models', 'sculpt'); fs.mkdirSync(glbDir, { recursive: true });
  const pool = new Pool(assetPath);
  let lodsAll = [];
  console.log(`smallprops ${name}: ${pool.size} workers, voxel ${(cfg.voxel * 1000).toFixed(1)} mm, bounds ${M.bounds.map((v) => v.toFixed(3)).join(' ')}`);
  try {
    const full = await extract(M, pool, cfg.voxel, console.log);
    const tags = await faceTags(pool, full.pos, full.idx);
    const fb = checkMesh(full.pos, full.idx).bounds, diag = Math.hypot(fb[3] - fb[0], fb[4] - fb[1], fb[5] - fb[2]);
    const errs = cfg.lodError || [0.004, 0.012, 0.03].map((k) => k * diag);
    const lods = []; lodsAll = lods;
    let src = { pos: full.pos, idx: full.idx, tag: tags.part };
    // far LODs (def.farFrom = first LOD index) come from a simpler field: build() sees process.env.SMALLPROPS_FAR = '1'
    // (same file, same origin; e.g. a spoked wheel becomes a disc), meshed on a coarser voxel, baked with its own field
    let far = null;
    for (const [li, target] of cfg.lods.entries()) {
      if (def.farFrom != null && li === def.farFrom) {
        process.env.SMALLPROPS_FAR = '1';
        const M2 = await loadModel(assetPath); const pool2 = new Pool(assetPath);
        const full2 = await extract(M2, pool2, cfg.voxel * (def.farVoxel || 2), console.log);
        const tags2 = await faceTags(pool2, full2.pos, full2.idx);
        far = { M: M2, pool: pool2 }; src = { pos: full2.pos, idx: full2.idx, tag: tags2.part };
        delete process.env.SMALLPROPS_FAR;
      }
      const s = simplify(src.pos, src.idx, target, { faceTag: src.tag, hardAngle: cfg.hardAngle ?? 50, maxError: errs[li] ?? Infinity, ...(cfg.lodTurn?.[li] != null ? { maxNormalTurn: cfg.lodTurn[li] } : {}) });
      const cb = checkMesh(s.pos, s.idx).bounds, drift = Math.max(...cb.map((v, k) => Math.abs(v - fb[k])));
      console.log(`  LOD${li}: ${s.idx.length / 3} tris (target ${target}), bbox drift ${(drift * 1000).toFixed(0)} mm`);
      lods.push(s); src = s; s.far = far;
    }
    const out = [];
    for (const L of lods) {
      const sn = splitNormals(L.pos, L.idx, cfg.creaseAngle, { faceTag: L.tag });
      // a vertex on a part border is split per part (splitNormals splitTags), but the bake would give both copies the
      // colour of whichever part the field says owns that exact point: sample each copy a little inside its own faces
      const nv = sn.pos.length / 3, tagsOf = new Map();
      for (let f = 0; f < sn.idx.length / 3; f++) for (let k = 0; k < 3; k++) { const s = sn.src[sn.idx[f * 3 + k]]; let t = tagsOf.get(s); if (!t) tagsOf.set(s, (t = new Set())); t.add(L.tag[f]); }
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
      const vc = await bakeVertexColors(L.far ? L.far.pool : pool, at, L.far ? L.far.M : M);
      out.push({ pos: sn.pos, nrm: sn.nrm, idx: sn.idx, col: vc.col, tag: L.tag, vpart: vc.part });
    }
    // write (no atlas: every LOD vertex coloured), then rename materials to the game's names
    const glb = path.join(glbDir, name + '.glb');
    const extras = { author: 'sculpted for this project', lods: out.map((o, i) => ({ lod: i, tris: o.idx.length / 3 })), anchors: def.anchors || {}, voxel: cfg.voxel, vertexColour: true };
    await writeStaticGLB(glb, { name, lods: out, parts: PARTS, materials: cfg.materials || {}, atlas: null, anchors: def.anchors || {}, extras });
    const bytes = await renameMaterials(glb, cfg.materials || {}, def.gameMats || {});
    console.log(`  wrote ${path.relative(ROOT, glb)} (${(bytes / 1024).toFixed(0)} KB)`);
    // before
    let before = null, beforeBounds = null;
    if (def.replaces) { before = await loadBefore(def.replaces, R); beforeBounds = bboxOf(before); }
    const checks = {
      name, full: checkMesh(full.pos, full.idx), flippedFacesVsField: tags.flips,
      lods: out.map((o, i) => ({ lod: i, target: cfg.lods[i], ...checkMesh(lods[i].pos, lods[i].idx), vertsWritten: o.pos.length / 3 })),
      fileKB: Math.round(bytes / 1024), vertexColourOnly: true,
    };
    const b = checks.lods[0].bounds;
    if (beforeBounds) checks.vsReplaced = { replaced: def.replaces.file, scale: def.replaces.scale, before: beforeBounds.map((v) => +v.toFixed(3)), after: b, sizeBefore: sizeOf(beforeBounds), sizeAfter: sizeOf(b), maxDelta: +Math.max(...b.map((v, k) => Math.abs(v - beforeBounds[k]))).toFixed(3) };
    const frag = { [def.id || 'sculpt_' + name]: {
      file: `models/sculpt/${name}.glb`, type: 'model', license: 'CC0 (original work)', author: 'sculpted for this project',
      source: `tools/sculpt/assets/${name}.mjs (node tools/sculpt/assets/_smallprops.mjs)`, scale: 1,
      size: sizeOf(b), tris: checks.lods[0].tris, lods: checks.lods.map((l) => l.tris),
      materials: Object.entries(cfg.materials || {}).map(([k, m]) => (def.gameMats || {})[k] || m.name),
      mats: Object.fromEntries(Object.entries(cfg.materials || {}).map(([k, m]) => [(def.gameMats || {})[k] || m.name, { surface: m.surface, look: m.look || {} }])),
      notes: def.notes || '',
    } };
    fs.writeFileSync(path.join(glbDir, name + '.manifest.json'), JSON.stringify(frag, null, 1) + '\n');
    await sheets({ M, out, before, outDir, quick, R, PARTS });
    checks.buildSeconds = +((Date.now() - T0) / 1000).toFixed(1);
    fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 1));
    console.log(JSON.stringify({ lods: checks.lods.map((l) => [l.tris, l.watertight, l.openEdges, l.nonManifoldEdges]), size: sizeOf(b), before: beforeBounds && sizeOf(beforeBounds), maxDelta: checks.vsReplaced?.maxDelta, fileKB: checks.fileKB }));
  } finally { await pool.close(); for (const L of lodsAll) if (L.far) await L.far.pool.close().catch(() => {}); }
  console.log(`done in ${secs(T0)}`);
}
const sizeOf = (b) => [+(b[3] - b[0]).toFixed(3), +(b[4] - b[1]).toFixed(3), +(b[5] - b[2]).toFixed(3)];
function bboxOf(meshes) {
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
  return b;
}

async function renameMaterials(file, materials, gameMats) {
  const { NodeIO } = await import('@gltf-transform/core');
  const io = new NodeIO();
  const doc = await io.read(file);
  for (const m of doc.getRoot().listMaterials()) {
    for (const [k, spec] of Object.entries(materials)) {
      if (m.getName() === `${spec.name}_${spec.surface}_vc`) {
        m.setName(gameMats[k] || spec.name);
        const ex = m.getExtras(); ex.sculpt = { lod: 'vertex' }; m.setExtras(ex);
      }
    }
  }
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(file, bin);
  return bin.length;
}

/** the model the game shows now, as renderer meshes (manifest scale applied; COLOR_0, factor and PNG texture kept) */
async function loadBefore({ file, scale = 1, tint = null }, R) {
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(path.join(ROOT, file));
  const meshes = [];
  const visit = (node, mat) => {
    const local = node.getMatrix(), m = mul4(mat, local);
    const mesh = node.getMesh();
    if (mesh) for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ca = prim.getAttribute('COLOR_0'), ua = prim.getAttribute('TEXCOORD_0'), ia = prim.getIndices();
      const n = pa.getCount(), pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), t = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        pa.getElement(i, t); const x = t[0], y = t[1], z = t[2];
        pos[i * 3] = (m[0] * x + m[4] * y + m[8] * z + m[12]) * scale; pos[i * 3 + 1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) * scale; pos[i * 3 + 2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) * scale;
        if (na) { na.getElement(i, t); const a = m[0] * t[0] + m[4] * t[1] + m[8] * t[2], b = m[1] * t[0] + m[5] * t[1] + m[9] * t[2], c = m[2] * t[0] + m[6] * t[1] + m[10] * t[2]; const l = Math.hypot(a, b, c) || 1; nrm[i * 3] = a / l; nrm[i * 3 + 1] = b / l; nrm[i * 3 + 2] = c / l; }
      }
      const idx = ia ? Uint32Array.from(ia.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      const mt = prim.getMaterial();
      const base = mt ? mt.getBaseColorFactor().slice(0, 3) : [0.7, 0.7, 0.7];
      if (tint && mt && tint[mt.getName()]) for (let k = 0; k < 3; k++) base[k] = tint[mt.getName()][k];   // the game's colour (flora tint / mul base)
      let col = null;
      if (ca) { col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { ca.getElement(i, t); col[i * 3] = t[0]; col[i * 3 + 1] = t[1]; col[i * 3 + 2] = t[2]; } }
      let tex = null, uv = null;
      const img = mt?.getBaseColorTexture();
      if (img && ua && img.getMimeType() === 'image/png') {
        const d = R.decodePNG(Buffer.from(img.getImage())); tex = R.texture(d.w, d.h, d.rgba, true);
        uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { ua.getElement(i, t); uv[i * 2] = t[0]; uv[i * 2 + 1] = t[1]; }
      }
      if (!na) { /* flat normals are rare in these packs */ }
      meshes.push({ pos, nrm, idx, col, uv, tex, base });
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

/** renderer meshes of one LOD; previewTint multiplies the colour of the parts whose material the game tints */
function lodMeshes(M, o, PARTS) {
  const tint = M.def.previewTint || {};
  let col = o.col;
  if (Object.keys(tint).length) {
    col = Float32Array.from(o.col);
    for (let v = 0; v < o.pos.length / 3; v++) { const t = tint[PARTS[o.vpart[v]]?.mat]; if (t) for (let k = 0; k < 3; k++) col[v * 3 + k] *= t[k]; }
  }
  return [{ pos: o.pos, nrm: o.nrm, idx: o.idx, col, base: [1, 1, 1] }];
}

async function sheets({ M, out, before, outDir, quick, R, PARTS }) {
  const name = M.def.name, save = (n, img) => { R.savePNG(path.join(outDir, n), img); console.log(`  sheet .tmp/sculpt/${name}/${n}`); };
  const after = lodMeshes(M, out[0], PARTS);
  const b = bboxOf(after), c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const H = b[4] - b[1], rxz = Math.max(b[3] - b[0], b[5] - b[2]) / 2;
  const fov = 35, ts = quick ? 300 : 440, dist = R.fitDistance(b, fov, 0.86);
  const views = [];
  for (let i = 0; i < 8; i++) views.push([i * 45, 10, `${i * 45} DEG`]);
  for (let i = 0; i < 3; i++) views.push([30 + i * 120, 55, `ABOVE ${30 + i * 120}`]);
  views.push([20, -25, 'BELOW']);
  save('turntable.png', R.sheet(views.map(([az, el, label]) => ({ img: R.render(after, R.orbit(c, az, el, dist, fov, ts, ts), { ground: el > 0 }), label })), 4, { title: `${name} TURNTABLE (LOD0 ${out[0].idx.length / 3} TRIS, VERTEX COLOUR)` }));
  save('clay.png', R.sheet([0, 90, 180, 270].map((az) => ({ img: R.render(after, R.orbit(c, az + 20, 14, dist, fov, ts, ts), { clay: true }), label: `CLAY ${az + 20}` })).concat([{ img: R.render(after, R.orbit(c, 40, 70, dist, fov, ts, ts), { clay: true }), label: 'CLAY TOP' }]), 5, { title: `${name} CLAY - FORM ONLY` }));
  const heroW = quick ? 960 : 1920, heroH = quick ? 540 : 1080, eyeY = 1.6, heroD = 2 + rxz;
  const heroCam = (az, w = heroW, h = heroH, fv = 62) => { const a = az * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * heroD, eyeY, c[2] + Math.cos(a) * heroD], [c[0], b[1] + H * 0.5, c[2]], fv, w, h); };
  save('hero.png', R.render(after, heroCam(28)));
  const gameCam = (w, h, px) => { const k = 1 / Math.tan(50 * Math.PI / 360); const d = (h / 2) * k * H / px; const a = 25 * Math.PI / 180, e = 12 * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * d * Math.cos(e), c[1] + Math.sin(e) * d, c[2] + Math.cos(a) * d * Math.cos(e)], c, 50, w, h); };
  save('game.png', R.sheet(out.map((o, i) => ({ img: R.render(lodMeshes(M, o, PARTS), gameCam(560, 640, 300)), label: `LOD${i} ${o.idx.length / 3} TRIS` })), 3, { title: `${name} AT GAME DISTANCE (300 PX TALL)` }));
  const lt = [];
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(lodMeshes(M, out[i], PARTS), R.orbit(c, 30, 12, dist, fov, ts, ts)), label: `LOD${i} ${out[i].idx.length / 3}` });
  for (let i = 0; i < out.length; i++) lt.push({ img: R.render(lodMeshes(M, out[i], PARTS).map((m) => ({ ...m, col: null })), R.orbit(c, 30, 12, dist, fov, ts, ts), { wire: true, clay: true }), label: `LOD${i} WIRE` });
  save('lods.png', R.sheet(lt, out.length, { title: `${name} LODS` }));
  if (before) {
    const bs = quick ? 420 : 640, hb = Math.round(bs * 1.0);
    const cmp = (az) => heroCam(az, bs, hb, 50);
    const gc = gameCam(bs, Math.round(bs * 0.6), 180);
    const tiles = [
      { img: R.render(before, cmp(28)), label: 'BEFORE - 2 M' }, { img: R.render(after, cmp(28)), label: 'AFTER - 2 M' },
      { img: R.render(before, cmp(208)), label: 'BEFORE - BACK' }, { img: R.render(after, cmp(208)), label: 'AFTER - BACK' },
      { img: R.render(before, gc), label: 'BEFORE - GAME CAMERA' }, { img: R.render(lodMeshes(M, out[1], PARTS), gc), label: 'AFTER LOD1 - GAME CAMERA' },
      { img: R.render(before, R.orbit(c, 28, 14, dist, fov, bs, bs), { clay: true }), label: 'BEFORE - CLAY' }, { img: R.render(after, R.orbit(c, 28, 14, dist, fov, bs, bs), { clay: true }), label: 'AFTER - CLAY' },
    ];
    save('before_after.png', R.sheet(tiles, 2, { title: `${name} BEFORE / AFTER - SAME CAMERA AND LIGHT` }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });

// ===================================================================================================== pumpkins
// The flora path tints 'fruit' per instance (grey ramp only in the vertex colours); 'stalk' and 'scar' fall to the
// plant default 'mul' rule (src/world/flora/species.js partRule), so their vertex colours are the colour you see.
export const PUMPKIN_MATS = {
  fruit: { name: 'fruit', surface: 'none', look: { spec: 0.3, specPower: 36, rim: 0.35, wrap: 0.5 } },
  stalk: { name: 'stalk', surface: 'wood', look: { rim: 0.3 } },
  scar: { name: 'scar', surface: 'none', look: { spec: 0.15, specPower: 20, rim: 0.3, wrap: 0.5 } },
};
// instance tint of the flora palette (scatter.js C.pumpkin 0xf08a2a), linear — for the preview sheets only
export const PUMPKIN_TINT = { fruit: [0.871, 0.254, 0.023] };

/**
 * Lobed pumpkin: n lobes (ellipsoids aimed out from the axis) of uneven width / height, soft-joined so the creases run
 * deep; a flattened, pale ground spot; a dry curled stalk; a bird peck.
 * o: { R (outer radius), Hb (body height), n, seed, squash, stalk: points, stalkR: [r0, r1], tilt: [ax, az] (deg),
 *      ground: [x, y, z] centre of the ground spot before the tilt, peck: [x, y, z] on the surface, pecks }
 */
export function pumpkin(o) {
  const rnd = P.prng(o.seed || 1), n = o.n || 10;
  const widths = Array.from({ length: n }, () => 0.75 + 0.5 * rnd());
  const sum = widths.reduce((a, b) => a + b, 0);
  const lobes = [];
  let a0 = rnd() * 360;
  for (let i = 0; i < n; i++) {
    const span = (widths[i] / sum) * 360, mid = a0 + span / 2; a0 += span;
    const halfW = Math.sin((span / 2) * Math.PI / 180) * o.R * (o.lobeW ?? 0.9) * (1.0 + 0.12 * rnd());
    const h = o.Hb * 0.5 * (0.93 + 0.12 * rnd()), d = o.R * (0.55 + 0.05 * rnd());
    const out = o.R - d;
    lobes.push(P.ellipsoid([halfW, h, d]).at(0, o.Hb * 0.5 + (rnd() - 0.5) * 0.02, out).turn(0, mid, 0));
  }
  let body = P.softUnion(o.crease ?? 0.03, ...lobes);
  // a core so the lobes read as one fruit with creases, not a bundle
  body = body.softAdd(P.ellipsoid([o.R * 0.78, o.Hb * 0.46, o.R * 0.78]).at(0, o.Hb * 0.5, 0), 0.03);
  // its own weight: the lower lobes sag out and sit wide on the ground instead of pinching to a point
  body = body.softAdd(P.ellipsoid([o.R * 0.8, o.Hb * 0.16, o.R * 0.8]).at(0, o.Hb * 0.17, 0), o.sag ?? 0.06);
  // the stalk end sinks into a dimple, the blossom end too
  body = body.softCut(P.ellipsoid([o.R * 0.16, o.Hb * 0.12, o.R * 0.16]).at(0, o.Hb * 1.0, 0), 0.03);
  body = body.softCut(P.ellipsoid([o.R * 0.12, o.Hb * 0.06, o.R * 0.12]).at(0, 0, 0), 0.02);
  body = body.rough({ type: 'fbm', scale: 0.09, amp: 0.004, seed: (o.seed || 1) + 3 });
  // ground spot: pressed flat where it lay (a plane cut), a separate pale part so the edge stays crisp
  const g = o.ground, gn = P.norm(g.n);
  body = body.softCut(P.plane(gn.map((v) => -v), g.at), 0.05);   // keep the side behind the plane: flatten
  const bf = body.f, gat = g.at;
  const spot = new P.Shape((x, y, z) => Math.max(bf(x, y, z) - 0.0006, ((x - gat[0]) * gn[0] + (y - gat[1]) * gn[1] + (z - gat[2]) * gn[2]) * -1 - g.depth), body.b)
    .part('groundspot', { mat: 'scar', paint: paintGroundSpot });
  let fruit = body.part('fruit', { mat: 'fruit', paint: paintFruitGrey(o) });
  // bird peck: a few jabs into one lobe, the flesh showing
  if (o.peck) {
    const [px, py, pz] = o.peck, pr = P.prng((o.seed || 1) + 9);
    let jabs = null;
    for (let i = 0; i < (o.pecks || 4); i++) {
      const s = P.ellipsoid([0.018 + 0.012 * pr(), 0.028 + 0.014 * pr(), 0.022]).turn(0, 0, (pr() - 0.5) * 50).at(px + (pr() - 0.5) * 0.06, py + (pr() - 0.5) * 0.05, pz + (pr() - 0.5) * 0.02);
      jabs = jabs ? jabs.add(s) : s;
    }
    jabs = jabs.part('peck', { mat: 'scar', paint: paintPeck });
    fruit = fruit.softCut(jabs, 0.006, { paintCut: true });
  }
  let st = P.tube(o.stalk, (t) => o.stalkR[0] + (o.stalkR[1] - o.stalkR[0]) * Math.pow(t, 0.7));
  // flutes of a dry stalk, and a flared foot where it grips the fruit
  st = st.rough({ type: 'ridged', scale: 0.025, amp: 0.004, seed: 4 });
  const foot = P.ellipsoid([o.stalkR[0] * 1.9, o.stalkR[0] * 0.8, o.stalkR[0] * 1.9]).at(o.stalk[0][0], o.stalk[0][1] + 0.01, o.stalk[0][2]);
  st = st.softAdd(foot, 0.02).part('stalk', { mat: 'stalk', paint: paintStalk });
  let all = fruit.add(spot).softAdd(st, 0.012);
  if (o.tilt) all = all.turn(o.tilt[0], 0, o.tilt[1]);
  return all;
}
function paintFruitGrey(o) {
  // grey ramp only: crease dark, ridges and the sunny top light, a dull belly; speckled skin
  return (c) => {
    const { x, y, z, cavity, edge, broad, h } = c;
    let v = 0.8 + 0.12 * ss(0.2, 0.9, h) - 0.35 * clamp(cavity * 1.2 + Math.max(0, broad) * 0.8, 0, 1) + 0.12 * edge;
    v += 0.05 * (P.fbm(x * 40, y * 40, z * 40, 2, 2));
    v -= 0.12 * ss(0.15, 0.0, h);
    v = clamp(v, 0.3, 1);
    return [v, v, v];
  };
}
function paintGroundSpot(c) {
  const { x, y, z, cavity } = c;
  let col = mix(C('#e8d39a'), C('#d6b878'), 0.5 + 0.5 * P.fbm(x * 30, y * 30, z * 30, 5, 2));
  col = mix(col, C('#9a8a5a'), P.ss(0.55, 0.75, P.fbm(x * 18, y * 18, z * 18, 6, 2) + 0.5) * 0.4);   // earth stains
  return mix(col, C('#a08454'), cavity * 0.5);
}
function paintPeck(c) {
  const { x, y, z, cavity } = c;
  let col = mix(C('#f2c25a'), C('#e8a03a'), 0.5 + 0.5 * P.fbm(x * 80, y * 80, z * 80, 7, 2));
  return mix(col, C('#b86a2a'), cavity * 0.6);
}
function paintStalk(c) {
  const { x, y, z, cavity, edge, h } = c;
  let col = mix(C('#8a7a52'), C('#6e6040'), 0.5 + 0.5 * P.fbm(x * 50, y * 50, z * 50, 8, 2));
  col = mix(col, C('#6a7a3a'), ss(0.75, 0.6, h) * 0.5);               // still a little green at the foot
  col = mix(col, C('#c8b88a'), edge * 0.5);
  return mix(col, C('#3a3020'), cavity * 0.5);
}
