import { NodeIO } from '@gltf-transform/core';
const doc = await new NodeIO().read(process.argv[2]);
for (const n of doc.getRoot().listNodes()) { const m = n.getMesh(); if (!m) continue; console.log(n.getName(), m.listPrimitives().map(p => p.getMaterial().getName() + ':' + (p.getIndices().getCount() / 3)).join(' ')); }
