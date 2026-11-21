import { NodeIO } from '@gltf-transform/core';
for (const f of process.argv.slice(2)) { const doc = await new NodeIO().read(f); const r = doc.getRoot(); const J = r.listSkins()[0].listJoints().map((j) => j.getName()); const used = new Set();
  for (const nd of r.listNodes()) { const m = nd.getMesh(); if (!m) continue; for (const p of m.listPrimitives()) { const jn = p.getAttribute('JOINTS_0').getArray(), w = p.getAttribute('WEIGHTS_0').getArray(); const I = p.getIndices().getArray(); const live = new Set(I); for (const i of live) for (let c = 0; c < 4; c++) if (w[i * 4 + c] > 0.01) used.add(J[jn[i * 4 + c]]); } }
  console.log(f.split('/').pop(), [...used].filter((n) => /^J_Sec_/.test(n) && !/^J_Sec_[A-Za-z]+_\d+_\d\d$/.test(n) && !/Hair/.test(n)).join(' ')); }
