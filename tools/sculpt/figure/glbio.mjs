// Reading skinned GLBs for the figure work (tools/sculpt/figure): every skinned mesh of a character file as renderer /
// weight-source meshes in the BIND pose (game metres), textures decoded with sharp (the kit's decoder reads PNG only and
// the cast files carry JPEG), morph targets by name, and extra clip libraries bound to a kit rig by joint name.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import * as R from '../preview.mjs';
import { M4 } from '../rig.mjs';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
export const io = () => new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** decode any image sharp knows -> { w, h, rgba } */
export async function decodeImage(bytes) {
  const { data, info } = await sharp(Buffer.from(bytes)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, rgba: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}
/** renderer texture with alpha kept: { w, h, d (linear rgb floats), a (0..1 floats) } */
export function texRGBA(w, h, rgba) {
  const t = R.texture(w, h, rgba, true); t.a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) t.a[i] = rgba[i * 4 + 3] / 255;
  return t;
}

/**
 * All skinned primitives of a character GLB in the bind pose.
 * -> { joints: [names], parents: [name|null], heads: {name: [x,y,z]}, prims: [{ node, material, pos, nrm, uv, idx, J, W,
 *      tex, base, alphaMode, alphaCutoff, doubleSided, shade, targets: {name: Float32Array deltas} }] }
 */
export async function loadCharacter(file, { textures = true } = {}) {
  const doc = await io().read(file);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const ibmArr = skin.getInverseBindMatrices().getArray();
  const IBM = joints.map((_, i) => Array.from(ibmArr.slice(i * 16, i * 16 + 16)));
  const parent = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parent.set(c, n);
  const heads = {};
  joints.forEach((j, i) => { const w = M4.inv(IBM[i]); heads[j.getName()] = [w[12], w[13], w[14]]; });
  const texCache = new Map();
  const prims = [];
  for (const n of root.listNodes()) {
    const mesh = n.getMesh(); if (!mesh || !n.getSkin()) continue;
    const names = mesh.getExtras()?.targetNames || [];
    for (const p of mesh.listPrimitives()) {
      const m = p.getMaterial();
      const P = p.getAttribute('POSITION').getArray(), N = p.getAttribute('NORMAL')?.getArray(), UV = p.getAttribute('TEXCOORD_0')?.getArray();
      const J = p.getAttribute('JOINTS_0').getArray(), Wt = p.getAttribute('WEIGHTS_0').getArray();
      const nv = P.length / 3;
      let tex = null;
      const bt = m?.getBaseColorTexture();
      if (bt && textures) {
        if (!texCache.has(bt)) { const d = await decodeImage(bt.getImage()); texCache.set(bt, texRGBA(d.w, d.h, d.rgba)); }
        tex = texCache.get(bt);
      }
      const targets = {};
      p.listTargets().forEach((t, i) => { const a = t.getAttribute('POSITION'); if (a) targets[names[i] || String(i)] = Float32Array.from(a.getArray()); });
      const bf = m?.getBaseColorFactor() || [1, 1, 1, 1];
      prims.push({
        node: n.getName(), material: m?.getName() || '', pos: Float32Array.from(P), nrm: N ? Float32Array.from(N) : null, uv: UV ? Float32Array.from(UV) : null,
        idx: p.getIndices() ? Uint32Array.from(p.getIndices().getArray()) : Uint32Array.from({ length: nv }, (_, i) => i),
        J: Uint16Array.from(J), W: Float32Array.from(Wt), tex, base: bf.slice(0, 3).map(R.toLin ? (v) => v : (v) => v), opacity: bf[3],
        alphaMode: m?.getAlphaMode() || 'OPAQUE', alphaCutoff: m?.getAlphaCutoff() ?? 0.5, doubleSided: !!m?.getDoubleSided(), shade: m?.getExtras()?.shadeColor || null, authoredFaceNormals: !!m?.getExtras()?.authoredFaceNormals, targets,
      });
    }
  }
  return { file, joints: joints.map((j) => j.getName()), parents: joints.map((j) => parent.get(j)?.getName() || null), heads, IBM, prims };
}

/** clips of a library GLB bound to a kit rig (tools/sculpt/rig.mjs loadRig) by node name; pushed onto rig.clips */
export async function addClips(rig, file) {
  const doc = await io().read(file);
  const byName = new Map(rig.nodes.map((n) => [n.getName(), n]));
  const out = doc.getRoot().listAnimations().map((a) => ({
    name: a.getName(),
    channels: a.listChannels().map((c) => { const s = c.getSampler(); return { node: byName.get(c.getTargetNode().getName()), path: c.getTargetPath(), t: s.getInput().getArray(), v: s.getOutput().getArray(), interp: s.getInterpolation() }; }).filter((c) => c.node && c.path !== 'weights'),
  }));
  for (const c of out) { c.duration = Math.max(0, ...c.channels.map((ch) => ch.t[ch.t.length - 1])); rig.clips.push(c); }
  return out.map((c) => c.name);
}

/** a prim as a renderer mesh (optionally posed by skin matrices S and morph weights {name: w}) */
export function primMesh(p, { S = null, morph = null, skin } = {}) {
  let pos = p.pos, nrm = p.nrm;
  if (morph && p.targets) {
    let any = false;
    for (const k in morph) if (morph[k] && p.targets[k]) { if (!any) { pos = Float32Array.from(pos); any = true; } const d = p.targets[k], w = morph[k]; for (let i = 0; i < pos.length; i++) pos[i] += d[i] * w; }
  }
  if (S && skin) { const sk = skin(pos, nrm, p.J, p.W, S); pos = sk.pos; nrm = sk.nrm; }
  return { pos, nrm, idx: p.idx, uv: p.uv, tex: p.tex, base: p.base, name: p.material, material: p.material, alphaMode: p.alphaMode, alphaCutoff: p.alphaCutoff, doubleSided: p.doubleSided, opacity: p.opacity ?? 1, bind: p.pos, authoredFaceNormals: p.authoredFaceNormals };
}
export const writeFile = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
