// Worker side of the pool: builds the asset's field once, then runs tasks (dual-contouring bricks, face tags, surface
// samples). Messages: { task, data } -> result object (typed arrays are transferred back).
import { parentPort, workerData } from 'node:worker_threads';
import { loadModel, sampleSurface } from './model.mjs';
import { dcBrick } from './mesh.mjs';

const M = await loadModel(workerData.assetPath, workerData.opts);

const tasks = {
  bricks({ list, B, h, o, dims }) {
    const outs = [];
    for (let i = 0; i < list.length; i += 3) outs.push(dcBrick(M.shape, o, h, list[i], list[i + 1], list[i + 2], B, dims));
    // concatenate
    let nc = 0, ne = 0; for (const r of outs) { nc += r.nc; ne += r.ne; }
    const cellKey = new Float64Array(nc), cellPos = new Float32Array(nc * 3), edgeKey = new Float64Array(ne), edgeInfo = new Int8Array(ne);
    let a = 0, e = 0;
    for (const r of outs) {
      cellKey.set(r.cellKey.subarray(0, r.nc), a); cellPos.set(r.cellPos.subarray(0, r.nc * 3), a * 3); a += r.nc;
      edgeKey.set(r.edgeKey.subarray(0, r.ne), e); edgeInfo.set(r.edgeInfo.subarray(0, r.ne), e); e += r.ne;
    }
    return { result: { cellKey, cellPos, edgeKey, edgeInfo }, transfer: [cellKey.buffer, cellPos.buffer, edgeKey.buffer, edgeInfo.buffer] };
  },
  // per face: part id and whether its winding disagrees with the field gradient
  faces({ cent, fn }) {
    const n = cent.length / 3, part = new Int16Array(n), flip = new Uint8Array(n), g = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const x = cent[i * 3], y = cent[i * 3 + 1], z = cent[i * 3 + 2];
      part[i] = M.shape.partAt(x, y, z).id;
      M.shape.normal(x, y, z, g, 1e-3);
      if (g[0] * fn[i * 3] + g[1] * fn[i * 3 + 1] + g[2] * fn[i * 3 + 2] < -0.2) flip[i] = 1;
    }
    return { result: { part, flip }, transfer: [part.buffer, flip.buffer] };
  },
  // surface samples: pts = x,y,z per sample -> 8 floats each (see sampleSurface) + part id
  samples({ pts }) {
    const n = pts.length / 3, out = new Float32Array(n * 8), part = new Int16Array(n);
    for (let i = 0; i < n; i++) part[i] = sampleSurface(M, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], out, i * 8).id;
    return { result: { out, part }, transfer: [out.buffer, part.buffer] };
  },
  // field values at points (for checks)
  field({ pts }) {
    const n = pts.length / 3, out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = M.shape.f(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    return { result: { out }, transfer: [out.buffer] };
  },
};

parentPort.on('message', ({ task, data }) => {
  try {
    const { result, transfer } = tasks[task](data);
    parentPort.postMessage(result, transfer);
  } catch (e) { parentPort.postMessage({ error: (e && e.stack) || String(e) }); }
});
