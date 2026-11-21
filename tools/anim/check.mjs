// loop seam + foot drift report for a library
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
const doc = await new NodeIO().readBinary(new Uint8Array(fs.readFileSync(process.argv[2])));
for (const a of doc.getRoot().listAnimations()) {
  const nm = a.getName(); if (!/Loop/.test(nm)) continue; let worst = 0, wn = '';
  for (const c of a.listChannels()) { const o = c.getSampler().getOutput().getArray(); const n = c.getTargetPath() === 'rotation' ? 4 : 3; const L = o.length - n; if (L <= 0) continue;
    let d = 0; if (n === 4) { const dot = Math.abs(o[0] * o[L] + o[1] * o[L + 1] + o[2] * o[L + 2] + o[3] * o[L + 3]); d = 2 * Math.acos(Math.min(1, dot)) * 57.3; } else d = Math.hypot(o[0] - o[L], o[1] - o[L + 1], o[2] - o[L + 2]) * 1000;
    if (d > worst) { worst = d; wn = c.getTargetNode().getName(); } }
  console.log(nm.padEnd(20), 'seam', worst.toFixed(3), wn);
}
