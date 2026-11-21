// Keep a dressed file's skeleton IDENTICAL to its base figure's (joints, parents, rest pose, inverse binds: what
// tools/sculpt/figure/writer.mjs compareSkeleton checks). The garment generator (garment.mjs Wardrobe.chain) re-places an
// existing J_Sec_ node at the cloth it drives; this puts every such node (joints and their _end leaves) back at the base's
// rest transform and inverse bind. Vertex positions are untouched: skinned with the base's (rest, IBM) pair the bind pose is
// the same mesh; only the pivots of the cloth chains are the base's (a few cm off the cloth's own hang points).
//   import { keepBaseSkeleton } from './keepskel.mjs';   await keepBaseSkeleton(outGlb, baseGlb, { match: /^J_Sec_/ })
import { NodeIO } from '@gltf-transform/core';
import { compareSkeleton } from '../sculpt/figure/writer.mjs';

export async function keepBaseSkeleton(file, baseFile, { match = /^J_Sec_/ } = {}) {
  const io = new NodeIO(); const [doc, base] = await Promise.all([io.read(file), io.read(baseFile)]);
  const bn = new Map(base.getRoot().listNodes().map((n) => [n.getName(), n]));
  const bsk = base.getRoot().listSkins()[0], bj = bsk.listJoints().map((j) => j.getName()), bI = bsk.getInverseBindMatrices().getArray();
  const moved = [];
  for (const n of doc.getRoot().listNodes()) {
    if (!match.test(n.getName())) continue; const b = bn.get(n.getName()); if (!b) continue;
    const d = Math.max(...n.getTranslation().map((v, i) => Math.abs(v - b.getTranslation()[i])), ...n.getRotation().map((v, i) => Math.abs(v - b.getRotation()[i])));
    if (d > 1e-7) moved.push(n.getName() + ' ' + (d * 1000).toFixed(1));
    n.setTranslation([...b.getTranslation()]).setRotation([...b.getRotation()]).setScale([...b.getScale()]);
  }
  for (const sk of doc.getRoot().listSkins()) {
    const acc = sk.getInverseBindMatrices(), I = acc.getArray().slice();
    sk.listJoints().forEach((j, i) => { const k = bj.indexOf(j.getName()); if (k >= 0 && match.test(j.getName())) for (let c = 0; c < 16; c++) I[i * 16 + c] = bI[k * 16 + c]; });
    acc.setArray(I);
  }
  await io.write(file, doc);
  return { moved, check: await compareSkeleton(baseFile, file) };
}
