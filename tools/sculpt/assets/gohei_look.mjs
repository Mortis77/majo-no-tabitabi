// Close-up sheets for small hand-held props (the kit's hero / before-after cameras sit 2 m away, where a 0.5 m wand or a
// 0.2 m lantern is a few pixels). Reads the built GLB (all LODs, node hierarchy with translations, atlas + object-space
// normal map on LOD0, vertex colours on LOD1/2) and renders with the kit's renderer and light.
//   node tools/sculpt/assets/gohei_look.mjs gohei|hip_lantern
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../preview.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function readGLB(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + n).toString());
  const binStart = 20 + n + 8;
  const acc = (i) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView];
    const off = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const ct = a.componentType, bytes = ct === 5126 || ct === 5125 ? 4 : ct === 5123 || ct === 5122 ? 2 : 1;
    const stride = bv.byteStride || comps * bytes;
    const out = new Float64Array(a.count * comps);
    for (let e = 0; e < a.count; e++) for (let k = 0; k < comps; k++) {
      const q = off + e * stride + k * bytes;
      let v = ct === 5126 ? b.readFloatLE(q) : ct === 5125 ? b.readUInt32LE(q) : ct === 5123 ? b.readUInt16LE(q) : b.readUInt8(q);
      if (a.normalized) v /= ct === 5123 ? 65535 : 255;
      out[e * comps + k] = v;
    }
    return out;
  };
  const img = (ti) => {
    const t = j.textures[ti], im = j.images[t.source], bv = j.bufferViews[im.bufferView];
    return R.decodePNG(b.subarray(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength));
  };
  const texCache = new Map();
  const tex = (ti, srgb) => { const k = ti + ':' + srgb; if (!texCache.has(k)) { const p = img(ti); texCache.set(k, R.texture(p.w, p.h, p.rgba, srgb)); } return texCache.get(k); };
  const out = [];
  const walk = (ni, off, lodHint) => {
    const node = j.nodes[ni], t = node.translation || [0, 0, 0];
    const o = [off[0] + t[0], off[1] + t[1], off[2] + t[2]];
    const m = /_LOD(\d)$/.exec(node.name || ''), lod = m ? +m[1] : lodHint;
    if (node.mesh != null) for (const p of j.meshes[node.mesh].primitives) {
      const pos = Float32Array.from(acc(p.attributes.POSITION));
      for (let i = 0; i < pos.length; i += 3) { pos[i] += o[0]; pos[i + 1] += o[1]; pos[i + 2] += o[2]; }
      const nrm = Float32Array.from(acc(p.attributes.NORMAL));
      const idx = Uint32Array.from(acc(p.indices));
      const mat = j.materials[p.material] || {};
      const bc = mat.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1];
      const mesh = { pos, nrm, idx, base: [bc[0], bc[1], bc[2]], lod, mat: mat.name, node: node.name };
      if (p.attributes.TEXCOORD_0 != null && mat.pbrMetallicRoughness?.baseColorTexture) {
        mesh.uv = Float32Array.from(acc(p.attributes.TEXCOORD_0));
        mesh.tex = tex(mat.pbrMetallicRoughness.baseColorTexture.index, true);
        if (mat.normalTexture) mesh.nmap = tex(mat.normalTexture.index, false);
      }
      if (p.attributes.COLOR_0 != null) mesh.col = Float32Array.from(acc(p.attributes.COLOR_0));
      out.push(mesh);
    }
    for (const c of node.children || []) walk(c, o, lod);
  };
  for (const ni of j.scenes[0].nodes) walk(ni, [0, 0, 0], undefined);
  return out;
}

// the game gives paper back-light translucency (manifest look.trans 0.35, src/render/veilhook.js mvSun); the kit
// renderer has none, so a sheet of paper seen from behind went flat sky-grey. Emulate that term per vertex.
const SUN = [0.55, 0.75, 0.42], sl = Math.hypot(...SUN), Ls = SUN.map((v) => v / sl);
export const trans = (ms, eye) => ms.map((m) => {
  if (!/^Paper/.test(m.mat || '') || m.emit) return m;
  const n = m.pos.length / 3, col = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const vx = eye[0] - m.pos[v * 3], vy = eye[1] - m.pos[v * 3 + 1], vz = eye[2] - m.pos[v * 3 + 2], vl = Math.hypot(vx, vy, vz);
    let nx = m.nrm[v * 3], ny = m.nrm[v * 3 + 1], nz = m.nrm[v * 3 + 2];
    if (nx * vx + ny * vy + nz * vz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const ndl = nx * Ls[0] + ny * Ls[1] + nz * Ls[2];
    let bt = Math.max(0, -(vx * Ls[0] + vy * Ls[1] + vz * Ls[2]) / vl); bt = bt * bt * bt;
    const add = 0.35 * (0.25 + bt) * Math.min(1, Math.max(0, 0.7 - ndl * 0.5)) * 1.75 / Math.PI;
    const k = ndl < 0.05 ? 1 + add / 0.3 : 1;
    for (let q = 0; q < 3; q++) col[v * 3 + q] = (m.col ? m.col[v * 3 + q] : 1) * k;
  }
  return { ...m, col };
});

/** the game's lanternPaperMaterial (celmat.js): colour x map x rib bands at y=(k+.5)/60 x view core, toneMapped off */
export const glowLit = (ms, eye, glow) => (glow ? ms.map((m) => {
  if (!glow.test(m.mat || '')) return m;
  const n = m.pos.length / 3, col = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const y = m.pos[v * 3 + 1], fr = Math.abs((((y * 60) % 1) + 1) % 1 - 0.5) * 2;
    const rib = 1 - 0.32 * (1 - Math.min(1, Math.max(0, fr / 0.18)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, fr / 0.18))));
    const vx = eye[0] - m.pos[v * 3], vy = eye[1] - y, vz = eye[2] - m.pos[v * 3 + 2], vl = Math.hypot(vx, vy, vz);
    const ndv = Math.abs((m.nrm[v * 3] * vx + m.nrm[v * 3 + 1] * vy + m.nrm[v * 3 + 2] * vz) / vl);
    const k = rib * (0.55 + 0.45 * ndv) * 1.7;
    const c0 = m.col ? [m.col[v * 3], m.col[v * 3 + 1], m.col[v * 3 + 2]] : [1, 1, 1];
    const glowC = [1.0, 0.76, 0.48];
    for (let q = 0; q < 3; q++) col[v * 3 + q] = c0[q] * glowC[q] * k + Math.pow(ndv, 6) * 0.25 * [1, 0.85, 0.6][q];
  }
  return { ...m, nmap: null, col, base: [1, 1, 1], emit: true };
}) : ms);

export function lookSheets(name, { glow = null } = {}) {
  const meshes = readGLB(path.join(ROOT, 'assets/models/sculpt', name + '.glb'));
  const outDir = path.join(ROOT, '.tmp/sculpt', name);
  const lod = (i) => meshes.filter((m) => m.lod === i);
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of lod(0)) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const fov = 30, S = 520, d = R.fitDistance(b, fov, 0.92);
  const opt = { ground: false };
  const rt = (ms, cam, o) => R.render(trans(glowLit(ms, cam.eye, glow), cam.eye), cam, o);
  const tiles = [];
  for (const [az, el] of [[25, 10], [90, 5], [160, 10], [250, 15], [330, 40]]) tiles.push({ img: rt(lod(0), R.orbit(c, az, el, d, fov, S, S), opt), label: `LOD0 ${az}/${el}` });
  tiles.push({ img: R.render(lod(0), R.orbit(c, 25, 10, d, fov, S, S), { ...opt, clay: true }), label: 'LOD0 CLAY' });
  // the top third, close (where the eye rests)
  const top = [c[0], b[1] + (b[4] - b[1]) * (name === 'gohei' ? 0.78 : 0.55), c[2]];
  tiles.push({ img: rt(lod(0), R.orbit(top, 30, 15, d * (name === 'gohei' ? 0.36 : 0.6), fov, S, S), opt), label: 'CLOSE 30' });
  tiles.push({ img: rt(lod(0), R.orbit(top, 200, 15, d * (name === 'gohei' ? 0.36 : 0.6), fov, S, S), opt), label: 'CLOSE 200' });
  // small: as at the game camera (the prop ~ 60 px tall and ~ 25 px tall), LOD1 and LOD2
  const small = (i, px) => { const img = rt(lod(i), R.orbit(c, 25, 12, d * (S / px) * 0.9, fov, S, S), opt); return img; };
  tiles.push({ img: small(1, 110), label: 'LOD1 ~110 PX' });
  tiles.push({ img: small(2, 50), label: 'LOD2 ~50 PX' });
  tiles.push({ img: rt(lod(1), R.orbit(c, 25, 10, d, fov, S, S), opt), label: 'LOD1' });
  tiles.push({ img: rt(lod(2), R.orbit(c, 25, 10, d, fov, S, S), opt), label: 'LOD2' });
  if (glow) { const raw = meshes.filter((m) => m.lod === 0); tiles[9] = { img: R.render(raw, R.orbit(c, 25, 10, d, fov, S, S), opt), label: 'LOD0 UNLIT (DAY / CELOFF)' }; }
  R.savePNG(path.join(outDir, 'look.png'), R.sheet(tiles, 4, { title: `${name} CLOSE LOOK` }));
  console.log('wrote', path.join(outDir, 'look.png'));
}

/** the kit sheets (turntable, clay, hero, game, lods, before_after) re-rendered from the GLB that SHIPS (after the
 *  --split / --post steps), same cameras and light as build.mjs. Hanging props: no ground disc (kit always draws y = 0).
 *  glow: material regex drawn emissive like the game's lanternPaperMaterial (texture x rib bands x view core). */
export async function glbSheets(name, { glow = null, before = null } = {}) {
  const all = readGLB(path.join(ROOT, 'assets/models/sculpt', name + '.glb'));
  const outDir = path.join(ROOT, '.tmp/sculpt', name);
  const nL = 1 + Math.max(...all.map((m) => m.lod ?? 0));
  const raw = (i) => all.filter((m) => (m.lod ?? 0) === i);
  const tris = (i) => raw(i).reduce((s, m) => s + m.idx.length / 3, 0);
  const lit = (ms, eye) => glowLit(ms, eye, glow);
  const R0 = (ms, cam, o = {}) => R.render(trans(lit(ms, cam.eye), cam.eye), cam, { ground: false, ...o });
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of raw(0)) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i + k]); }
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], H = b[4] - b[1], rxz = Math.max(b[3] - b[0], b[5] - b[2]) / 2;
  const save = (n, img) => { R.savePNG(path.join(outDir, n), img); console.log('wrote', path.join(outDir, n)); };
  const fov = 35, ts = 480, dist = R.fitDistance(b, fov, 0.86), after = raw(0);
  const views = [];
  for (let i = 0; i < 8; i++) views.push([i * 45, 8, `${i * 45} DEG`]);
  for (let i = 0; i < 3; i++) views.push([30 + i * 120, 50, `ABOVE ${30 + i * 120}`]);
  views.push([20, -25, 'BELOW']);
  save('turntable.png', R.sheet(views.map(([az, el, label]) => ({ img: R0(after, R.orbit(c, az, el, dist, fov, ts, ts)), label })), 4, { title: `${name} TURNTABLE (LOD0, SHIPPED GLB${glow ? ', PAPER LIT' : ''})` }));
  save('clay.png', R.sheet([0, 90, 180, 270].map((az) => ({ img: R.render(after, R.orbit(c, az + 20, 10, dist, fov, ts, ts), { clay: true, ground: false }), label: `CLAY ${az + 20}` })), 4, { title: `${name} CLAY - FORM ONLY` }));
  const eyeY = 1.6, heroD = 2 + rxz;
  const heroCam = (az, w, h, f) => { const a = az * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * heroD, eyeY, c[2] + Math.cos(a) * heroD], [c[0], b[1] + H * 0.5, c[2]], f, w, h); };
  save('hero.png', R.render(raw(0), heroCam(28, 1920, 1080, 62), { ground: false }));
  const gameCam = (w, h, px) => { const k = 1 / Math.tan(50 * Math.PI / 360); const d = (h / 2) * k * H / px; const a = 25 * Math.PI / 180, e = 12 * Math.PI / 180; return R.camera([c[0] + Math.sin(a) * d * Math.cos(e), c[1] + Math.sin(e) * d, c[2] + Math.cos(a) * d * Math.cos(e)], c, 50, w, h); };
  const gi = [];
  for (let i = 0; i < nL; i++) gi.push({ img: R0(raw(i), gameCam(640, 720, 300)), label: `LOD${i} ${tris(i)} TRIS - GAME CAMERA` });
  if (glow) for (let i = 0; i < nL; i++) gi.push({ img: R.render(raw(i), gameCam(640, 720, 300), { ground: false }), label: `LOD${i} UNLIT` });
  save('game.png', R.sheet(gi, nL, { title: `${name} AT GAME DISTANCE (300 PX TALL), SHIPPED GLB` }));
  const lt = [];
  for (let i = 0; i < nL; i++) lt.push({ img: R0(raw(i), R.orbit(c, 30, 10, dist, fov, ts, ts)), label: `LOD${i} ${tris(i)}` });
  for (let i = 0; i < nL; i++) lt.push({ img: R.render(raw(i).map((m) => ({ ...m, tex: null, nmap: null, col: null, uv: null, emit: false })), R.orbit(c, 30, 10, dist, fov, ts, ts), { wire: true, clay: true, ground: false }), label: `LOD${i} WIRE` });
  for (let i = 0; i < nL; i++) lt.push({ img: R0(raw(i), R.orbit(c, 30, 10, dist * (ts / (i === 2 ? 50 : 110)) * 0.9, fov, ts, ts)), label: `LOD${i} ~${i === 2 ? 50 : 110} PX` });
  save('lods.png', R.sheet(lt, nL, { title: `${name} LODS (SHIPPED GLB)` }));
  if (before) {
    const bs = 760, hb = Math.round(bs * 1.25), cmp = (az) => heroCam(az, bs, hb, 66), gc = gameCam(bs, Math.round(bs * 0.6), 220);
    const nog = { ground: false };
    const tl = [
      { img: R.render(before, cmp(28), nog), label: 'BEFORE - 2 M' }, { img: R0(after, cmp(28)), label: 'AFTER - 2 M' },
      { img: R.render(before, cmp(208), nog), label: 'BEFORE - BACK' }, { img: R0(after, cmp(208)), label: 'AFTER - BACK' },
      { img: R.render(before, gc, nog), label: 'BEFORE - GAME CAMERA' }, { img: R0(raw(1), gc), label: 'AFTER LOD1 - GAME CAMERA' },
      { img: R.render(before, R.orbit(c, 28, 10, dist, fov, bs, bs), { clay: true, ground: false }), label: 'BEFORE - CLAY' }, { img: R.render(after, R.orbit(c, 28, 10, dist, fov, bs, bs), { clay: true, ground: false }), label: 'AFTER - CLAY' },
    ];
    save('before_after.png', R.sheet(tl, 2, { title: `${name} BEFORE / AFTER - SAME CAMERA AND LIGHT (SHIPPED GLB)` }));
  }
}

/** per LOD of the shipped GLB: triangles, open and non-manifold edges (vertices welded at 0.01 mm), with locations */
export function glbChecks(name) {
  const all = readGLB(path.join(ROOT, 'assets/models/sculpt', name + '.glb'));
  const out = [];
  for (let li = 0; li < 3; li++) {
    const ms = all.filter((m) => (m.lod ?? 0) === li); if (!ms.length) continue;
    const vid = new Map(), P = []; const id = (x, y, z) => { const k = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`; if (!vid.has(k)) { vid.set(k, P.length); P.push([x, y, z]); } return vid.get(k); };
    const E = new Map(); let tris = 0, vol = 0; const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const m of ms) for (let f = 0; f < m.idx.length; f += 3) {
      tris++;
      const v = [0, 1, 2].map((q) => { const i = m.idx[f + q]; for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], m.pos[i * 3 + k]); b[k + 3] = Math.max(b[k + 3], m.pos[i * 3 + k]); } return id(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); });
      { const [A, B, C] = v.map((i) => P[i]); vol += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6; }
      for (let q = 0; q < 3; q++) { const a = v[q], c = v[(q + 1) % 3]; const k = a < c ? a + ',' + c : c + ',' + a; E.set(k, (E.get(k) || 0) + 1); }
    }
    let open = 0, nm = 0; const where = [], openAt = [];
    for (const [k, n] of E) { if (n === 1) { open++; const [a, c] = k.split(',').map(Number); openAt.push(P[a].map((v, i) => +((v + P[c][i]) / 2).toFixed(3))); } if (n > 2) { nm++; const [a, c] = k.split(',').map(Number); where.push(P[a].map((v, i) => +((v + P[c][i]) / 2).toFixed(4))); } }
    out.push({ lod: li, tris, volumeCm3: +(vol * 1e6).toFixed(2), openEdges: open, nonManifoldEdges: nm, watertight: open === 0 && nm === 0, bounds: b.map((v) => +v.toFixed(4)), nonManifoldAt: where.slice(0, 20), openAt: openAt.filter((_, i) => i % Math.max(1, Math.floor(openAt.length / 12)) === 0).slice(0, 12) });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2] || 'gohei';
  if (process.argv.includes('--checks')) console.log(JSON.stringify(glbChecks(name)));
  else lookSheets(name, { glow: name === 'hip_lantern' ? /LanternPaper/ : null });
}
