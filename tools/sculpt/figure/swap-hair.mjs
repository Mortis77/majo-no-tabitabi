#!/usr/bin/env node
// Swap 灯里's hair and hair bow in any of her character files (every outfit carries the same skeleton):
//   node tools/sculpt/figure/swap-hair.mjs <character.glb> <hair.glb> <out.glb>
// The nodes `akari_hair` and `akari_ribbon` of the character (meshes, their materials and textures when nothing else uses
// them) are replaced by the ones in the hair file (tools/sculpt/figure/build-hair.mjs -> assets/models/sculpt/akari_hair.glb).
// Joints are matched BY NAME (the hair file's JOINTS_0 are remapped to the character's skin), the new nodes take the old
// nodes' parent and skin. Nothing else in the character file is touched: skeleton, inverse binds, clips, other meshes,
// morph targets, scene extras. Refuses when a joint the hair needs is missing.
import fs from 'node:fs';
import path from 'node:path';
import { io } from './glbio.mjs';

const NODES = ['akari_hair', 'akari_ribbon'];

export async function swapHair(charFile, hairFile, outFile, { log = console.log } = {}) {
  const A = await io().read(charFile), B = await io().read(hairFile);
  const ra = A.getRoot(), rb = B.getRoot();
  const skinA = ra.listSkins()[0], skinB = rb.listSkins()[0];
  if (!skinA || !skinB) throw new Error('both files need a skin');
  const namesA = skinA.listJoints().map((j) => j.getName()), namesB = skinB.listJoints().map((j) => j.getName());
  const map = namesB.map((n) => namesA.indexOf(n));
  const parent = new Map(); for (const n of ra.listNodes()) for (const c of n.listChildren()) parent.set(c, n);
  const scene = ra.listScenes()[0];
  // ---- remove the old nodes (and what only they used)
  let holder = null;
  for (const nm of NODES) {
    for (const n of ra.listNodes().filter((q) => q.getName() === nm)) {
      holder = holder || parent.get(n) || null;
      const m = n.getMesh();
      if (m) {
        for (const p of m.listPrimitives()) {
          const mat = p.getMaterial();
          for (const s of p.listSemantics()) { const a = p.getAttribute(s); p.setAttribute(s, null); if (a && a.listParents().length <= 1) a.dispose(); }
          for (const t of p.listTargets()) { for (const s of t.listSemantics()) { const a = t.getAttribute(s); t.setAttribute(s, null); if (a && a.listParents().length <= 1) a.dispose(); } t.dispose(); }
          const ix = p.getIndices(); p.setIndices(null); if (ix && ix.listParents().length <= 1) ix.dispose();
          p.dispose();
          if (mat && mat.listParents().filter((q) => q.propertyType === 'Primitive').length === 0) {
            const tex = [mat.getBaseColorTexture(), mat.getEmissiveTexture(), mat.getNormalTexture()].filter(Boolean);
            mat.dispose();
            for (const t of tex) if (t.listParents().filter((q) => q.propertyType === 'Material').length === 0) t.dispose();
          }
        }
        m.dispose();
      }
      n.dispose();
    }
  }
  // ---- copy the new ones in
  const buf = ra.listBuffers()[0];
  const mats = new Map(), texs = new Map();
  const copyTex = (t) => { if (!t) return null; if (!texs.has(t)) texs.set(t, A.createTexture(t.getName()).setImage(t.getImage()).setMimeType(t.getMimeType())); return texs.get(t); };
  const copyMat = (m) => {
    if (mats.has(m)) return mats.get(m);
    // a material of the same name left in the character (another node still uses it) is replaced for the hair only
    const g = A.createMaterial(m.getName()).setAlphaMode(m.getAlphaMode()).setAlphaCutoff(m.getAlphaCutoff()).setDoubleSided(m.getDoubleSided())
      .setBaseColorFactor(m.getBaseColorFactor()).setMetallicFactor(m.getMetallicFactor()).setRoughnessFactor(m.getRoughnessFactor()).setEmissiveFactor(m.getEmissiveFactor()).setExtras({ ...(m.getExtras() || {}) });
    const bt = copyTex(m.getBaseColorTexture()); if (bt) g.setBaseColorTexture(bt);
    mats.set(m, g); return g;
  };
  const acc = (a, arr) => A.createAccessor().setType(a.getType()).setArray(arr).setNormalized(a.getNormalized()).setBuffer(buf);
  let tris = 0;
  const added = [];
  for (const nm of NODES) {
    const src = rb.listNodes().find((n) => n.getName() === nm && n.getMesh());
    if (!src) { log(`  ${nm}: not in the hair file (left out)`); continue; }
    const mesh = A.createMesh(nm);
    for (const p of src.getMesh().listPrimitives()) {
      const q = A.createPrimitive().setMaterial(copyMat(p.getMaterial())).setMode(p.getMode());
      for (const s of p.listSemantics()) {
        const a = p.getAttribute(s); let arr = a.getArray().slice();
        if (/^JOINTS_/.test(s)) for (let i = 0; i < arr.length; i++) { const k = map[arr[i]]; if (k < 0) throw new Error(`joint ${namesB[arr[i]]} is not in ${path.basename(charFile)}`); arr[i] = k; }
        if (/^JOINTS_/.test(s) && namesA.length > 255 && arr instanceof Uint8Array) arr = Uint16Array.from(arr);
        q.setAttribute(s, acc(a, arr));
      }
      const ix = p.getIndices(); if (ix) { q.setIndices(acc(ix, ix.getArray().slice())); tris += ix.getCount() / 3; }
      mesh.addPrimitive(q);
    }
    const node = A.createNode(nm).setMesh(mesh).setSkin(skinA);
    if (holder) holder.addChild(node); else scene.addChild(node);
    added.push(nm);
  }
  const bin = await io().writeBinary(A);
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, bin);
  log(`swap-hair: ${path.basename(charFile)} + ${path.basename(hairFile)} -> ${outFile}: ${added.join(', ')} (${tris} tris), ${bin.length} bytes`);
  return { bytes: bin.length, tris, nodes: added };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('swap-hair.mjs')) {
  const [c, h, o] = process.argv.slice(2);
  if (!c || !h || !o) { console.error('usage: node tools/sculpt/figure/swap-hair.mjs <character.glb> <hair.glb> <out.glb>'); process.exit(1); }
  await swapHair(path.resolve(c), path.resolve(h), path.resolve(o));
}
