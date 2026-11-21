// A figure is contoured in PIECES at different voxel sizes from one field (a hand needs 0.9 mm, a thigh 2.6 mm), each
// piece cut on its seam planes, simplified to its own budget, then stitched without T-junctions and mirrored.
// Pieces are cached on disk by a hash of the shape sources + parameters: a dropped connection or a change to another
// piece never re-contours a finished one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadModel } from '../model.mjs';
import { Pool } from '../pool.mjs';
import { extract, simplify, cleanup, checkMesh } from '../mesh.mjs';
import { clipPlane } from './meshops.mjs';
import { compactMesh } from './seam.mjs';

export const hashOf = (files, extra = '') => { const h = crypto.createHash('sha1'); for (const f of files) h.update(fs.readFileSync(f)); h.update(extra); return h.digest('hex').slice(0, 12); };

const save = (file, m) => { const head = Buffer.from(JSON.stringify({ nv: m.pos.length / 3, ni: m.idx.length })); const len = Buffer.alloc(4); len.writeUInt32LE(head.length); fs.writeFileSync(file, Buffer.concat([len, head, Buffer.from(m.pos.buffer, m.pos.byteOffset, m.pos.byteLength), Buffer.from(m.idx.buffer, m.idx.byteOffset, m.idx.byteLength)])); };
const load = (file) => { const b = fs.readFileSync(file), hl = b.readUInt32LE(0), h = JSON.parse(b.subarray(4, 4 + hl).toString()); const o = 4 + hl; const pos = new Float32Array(h.nv * 3), idx = new Uint32Array(h.ni); Buffer.from(pos.buffer).set(b.subarray(o, o + h.nv * 12)); Buffer.from(idx.buffer).set(b.subarray(o + h.nv * 12, o + h.nv * 12 + h.ni * 4)); return { pos, idx }; };

/**
 * Contour the pieces of one asset module.
 * pieces: [{ name, bounds, voxel, planes: [[nx, ny, nz, d], ...] (keep n.p + d >= 0), tris (simplify target),
 *            maxError?, post?(mesh) }]
 * -> { name: { pos, idx } }
 */
export async function contourPieces(assetPath, pieces, { cacheDir, sources, log = console.log, threads } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const out = {}; let M = null, pool = null;
  try {
    for (const p of pieces) {
      const key = hashOf(sources, JSON.stringify({ b: p.bounds, v: p.voxel, pl: p.planes, t: p.tris, e: p.maxError, k: p.key || 0 }));
      const file = path.join(cacheDir, `${p.name}_${key}.bin`);
      if (fs.existsSync(file)) { out[p.name] = load(file); log(`  piece ${p.name}: cached (${out[p.name].idx.length / 3} tris)`); continue; }
      if (!M) { M = await loadModel(assetPath); pool = new Pool(assetPath, { threads }); }
      const t0 = Date.now();
      const full = await extract({ ...M, bounds: p.bounds }, pool, p.voxel, log);
      let m = { pos: full.pos, idx: full.idx };
      for (const pl of p.planes || []) m = clipPlane(m, [pl[0], pl[1], pl[2]], pl[3]);
      m = compactMesh(m);
      m = largest(m);
      const s = simplify(m.pos, m.idx, p.tris, { hardAngle: 180, maxError: p.maxError ?? Infinity, guard: 12 });
      const c = cleanup(s.pos, s.idx);
      out[p.name] = { pos: c.pos, idx: c.idx };
      save(file, out[p.name]);
      for (const f of fs.readdirSync(cacheDir)) if (f.startsWith(p.name + '_') && f !== path.basename(file)) fs.unlinkSync(path.join(cacheDir, f));
      const ck = checkMesh(c.pos, c.idx);
      log(`  piece ${p.name}: ${full.idx.length / 3} -> ${c.idx.length / 3} tris, open edges ${ck.openEdges}, non-manifold ${ck.nonManifoldEdges} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
  } finally { if (pool) await pool.close(); }
  return out;
}

/** keep the largest connected component (bounds cut stray shells off neighbouring parts) */
export function largest(m) {
  const nv = m.pos.length / 3, parent = new Int32Array(nv); for (let i = 0; i < nv; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < m.idx.length; t += 3) { const a = find(m.idx[t]), b = find(m.idx[t + 1]), c = find(m.idx[t + 2]); parent[b] = a; parent[c] = a; }
  const cnt = new Map(); for (let t = 0; t < m.idx.length; t += 3) { const r = find(m.idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  let best = -1, bn = 0; for (const [r, n] of cnt) if (n > bn) { bn = n; best = r; }
  if (cnt.size === 1) return m;
  const I = []; for (let t = 0; t < m.idx.length; t += 3) if (find(m.idx[t]) === best) I.push(m.idx[t], m.idx[t + 1], m.idx[t + 2]);
  return compactMesh({ pos: m.pos, idx: Uint32Array.from(I) });
}
