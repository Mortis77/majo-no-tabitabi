// Skinned GLB writer for figures: SEVERAL skinned meshes on one skeleton, several primitives per mesh, morph targets
// (named in mesh.extras.targetNames, as three.js reads them), textures per material. The skeleton, hierarchy, inverse
// bind matrices and node transforms of the rig source are kept untouched: only mesh nodes are replaced.
import fs from 'node:fs';
import { io } from './glbio.mjs';
import { M4 } from '../rig.mjs';

/**
 * meshes: [{ node, targetNames?: [..], prims: [{ material: { name, alphaMode, alphaCutoff, doubleSided, extras, base,
 *   tex: { name, bytes (png / jpeg), mime } | null }, pos, nrm, uv, idx, J, W, targets?: [Float32Array deltas] }] }]
 * opts: { meshWorld (kit rig.meshWorld), sceneExtras }
 */
export async function writeFigureGLB(rigFile, outFile, meshes, { meshWorld = null, extras = null } = {}) {
  const doc = await io().read(rigFile), root = doc.getRoot(), buf = root.listBuffers()[0];
  const skin = root.listSkins()[0];
  const old = root.listNodes().filter((n) => n.getMesh());
  const parentOf = new Map(); for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const holder = parentOf.get(old[0]) || null, scene = root.listScenes()[0];
  for (const n of old) { const m = n.getMesh(); n.setMesh(null); for (const p of m.listPrimitives()) { for (const s of p.listSemantics()) { const a = p.getAttribute(s); p.setAttribute(s, null); if (a && a.listParents().length <= 1) a.dispose(); } const ixa = p.getIndices(); p.setIndices(null); if (ixa && ixa.listParents().length <= 1) ixa.dispose(); p.dispose(); } m.dispose(); n.dispose(); }
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  const inv = meshWorld ? M4.inv(meshWorld) : null;
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mats = new Map(), texs = new Map();
  const material = (m) => {
    if (mats.has(m.name)) return mats.get(m.name);
    const g = doc.createMaterial(m.name).setAlphaMode(m.alphaMode || 'OPAQUE').setDoubleSided(!!m.doubleSided).setMetallicFactor(0).setRoughnessFactor(1).setBaseColorFactor(m.base || [1, 1, 1, 1]);
    if (m.alphaMode === 'MASK') g.setAlphaCutoff(m.alphaCutoff ?? 0.5);
    if (m.emissive) g.setEmissiveFactor(m.emissive);                 // a flat self-light (no emissive texture: the game's merged cel material keeps such parts)
    if (m.extras) g.setExtras(m.extras);
    if (m.tex) {
      let t = texs.get(m.tex.name);
      if (!t) { t = doc.createTexture(m.tex.name).setImage(m.tex.bytes).setMimeType(m.tex.mime || 'image/png'); texs.set(m.tex.name, t); }
      g.setBaseColorTexture(t);
    }
    mats.set(m.name, g); return g;
  };
  let tris = 0, verts = 0;
  for (const M of meshes) {
    const gm = doc.createMesh(M.node);
    for (const p of M.prims) {
      const n = p.pos.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) {
        if (inv) { P.set(M4.pt(inv, p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2]), v * 3); const d = M4.dir(inv, p.nrm[v * 3], p.nrm[v * 3 + 1], p.nrm[v * 3 + 2]), l = Math.hypot(...d) || 1; N.set(d.map((x) => x / l), v * 3); }
        else { P[v * 3] = p.pos[v * 3]; P[v * 3 + 1] = p.pos[v * 3 + 1]; P[v * 3 + 2] = p.pos[v * 3 + 2]; N[v * 3] = p.nrm[v * 3]; N[v * 3 + 1] = p.nrm[v * 3 + 1]; N[v * 3 + 2] = p.nrm[v * 3 + 2]; }
      }
      const prim = doc.createPrimitive().setMaterial(material(p.material))
        .setAttribute('POSITION', acc('VEC3', P)).setAttribute('NORMAL', acc('VEC3', N))
        .setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(p.uv)))
        .setAttribute('JOINTS_0', acc('VEC4', Uint16Array.from(p.J))).setAttribute('WEIGHTS_0', acc('VEC4', Float32Array.from(p.W)))
        .setIndices(acc('SCALAR', n > 65535 ? Uint32Array.from(p.idx) : Uint16Array.from(p.idx)));
      if (M.targetNames) for (let k = 0; k < M.targetNames.length; k++) {
        const d = p.targets?.[k] || new Float32Array(n * 3);
        prim.addTarget(doc.createPrimitiveTarget(M.targetNames[k]).setAttribute('POSITION', acc('VEC3', Float32Array.from(d))));
      }
      gm.addPrimitive(prim); tris += p.idx.length / 3; verts += n;
    }
    if (M.targetNames) { gm.setWeights(M.targetNames.map(() => 0)); gm.setExtras({ targetNames: M.targetNames }); }
    const node = doc.createNode(M.node).setMesh(gm).setSkin(skin);
    if (holder) holder.addChild(node); else scene.addChild(node);
  }
  if (extras) scene.setExtras({ ...(scene.getExtras() || {}), ...extras });
  const bin = await io().writeBinary(doc);
  fs.writeFileSync(outFile, bin);
  return { bytes: bin.length, tris, verts, materials: [...mats.keys()], textures: [...texs.keys()] };
}

/** the skeleton contract between two character files: joint names + parents, inverse bind matrices, joint rest TRS */
export async function compareSkeleton(a, b) {
  const [A, B] = await Promise.all([io().read(a), io().read(b)]);
  const desc = (d) => {
    const sk = d.getRoot().listSkins()[0], js = sk.listJoints();
    const par = new Map(); for (const n of d.getRoot().listNodes()) for (const c of n.listChildren()) par.set(c, n);
    return { n: js.length, names: js.map((j) => j.getName() + '<' + (par.get(j)?.getName() || '')).join(), ibm: Buffer.from(Float32Array.from(sk.getInverseBindMatrices().getArray()).buffer).toString('base64'), trs: js.map((j) => [...j.getTranslation(), ...j.getRotation(), ...j.getScale()].map((v) => v.toFixed(6)).join()).join('|') };
  };
  const x = desc(A), y = desc(B);
  return { joints: x.n, sameJoints: x.names === y.names, sameIBM: x.ibm === y.ibm, sameRest: x.trs === y.trs };
}
