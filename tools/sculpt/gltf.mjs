// GLB writer for sculpted props: one node per LOD (`<name>_LOD0..2` under a root node `<name>`), one primitive per
// material, materials named `<Name>_<surface>` with extras { surface, look } exactly like the refined props
// (tools/refine-models.mjs) so toonify tags them; LOD0 carries the colour atlas (baseColorTexture, sRGB) and the
// object-space normal map (normalTexture + extras.normalSpace = 'object'); LOD1/2 carry COLOR_0 (linear) only.
// Named empty nodes for anchors / pivots (e.g. `fire`). Also the manifest fragment.
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { encodePNG } from './preview.mjs';

/**
 * lods: [{ pos, nrm, idx, tag (part id per face), uv?, col? }], parts: PARTS (id -> { mat }), materials: cfg.materials
 * atlas: { color (RGBA bytes), normal (RGBA bytes), size } for LOD0
 */
export async function writeStaticGLB(file, { name, lods, parts, materials, atlas, anchors = {}, extras = {} }) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene(name);
  const root = doc.createNode(name).setExtras({ sculpt: extras });
  scene.addChild(root);
  let colorTex = null, normalTex = null;
  if (atlas) {
    colorTex = doc.createTexture(name + '_color').setImage(encodePNG(atlas.size, atlas.size, atlas.color, 4)).setMimeType('image/png');
    normalTex = doc.createTexture(name + '_normal_object').setImage(encodePNG(atlas.size, atlas.size, atlas.normal, 4)).setMimeType('image/png');
  }
  const matCache = new Map();
  const material = (key, lod) => {
    const textured = lod === 0 && atlas;
    const ck = key + (textured ? ':t' : ':v');
    if (matCache.has(ck)) return matCache.get(ck);
    const spec = materials[key] || { name: key, surface: 'stone' };
    const m = doc.createMaterial(`${spec.name}_${spec.surface}${textured ? '' : '_vc'}`)
      .setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
    const ex = { surface: spec.surface, look: spec.look || {}, sculpt: { lod: textured ? 'textured' : 'vertex' } };
    if (textured) {
      m.setBaseColorTexture(colorTex); m.setNormalTexture(normalTex);
      ex.normalSpace = 'object';
    }
    m.setExtras(ex);
    matCache.set(ck, m);
    return m;
  };
  lods.forEach((L, li) => {
    const mesh = doc.createMesh(`${name}_LOD${li}`);
    const groups = new Map();
    for (let f = 0; f < L.idx.length / 3; f++) {
      const key = parts[L.tag[f]]?.mat || 'default';
      let g = groups.get(key); if (!g) groups.set(key, (g = [])); g.push(L.idx[f * 3], L.idx[f * 3 + 1], L.idx[f * 3 + 2]);
    }
    for (const [key, ids] of groups) {
      // compact vertices per primitive
      const remap = new Map(), P = [], N = [], U = [], C = [], I = [];
      for (const v of ids) {
        let r = remap.get(v);
        if (r === undefined) {
          r = remap.size; remap.set(v, r);
          P.push(L.pos[v * 3], L.pos[v * 3 + 1], L.pos[v * 3 + 2]); N.push(L.nrm[v * 3], L.nrm[v * 3 + 1], L.nrm[v * 3 + 2]);
          if (L.uv) U.push(L.uv[v * 2], L.uv[v * 2 + 1]);
          if (L.col) C.push(L.col[v * 3], L.col[v * 3 + 1], L.col[v * 3 + 2]);
        }
        I.push(r);
      }
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(P)).setBuffer(buf))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(N)).setBuffer(buf))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(remap.size > 65535 ? Uint32Array.from(I) : Uint16Array.from(I)).setBuffer(buf))
        .setMaterial(material(key, li));
      if (L.uv && li === 0 && atlas) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(Float32Array.from(U)).setBuffer(buf));
      if (L.col && !(li === 0 && atlas)) prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(C)).setBuffer(buf));
      mesh.addPrimitive(prim);
    }
    const node = doc.createNode(`${name}_LOD${li}`).setMesh(mesh).setExtras({ lod: li, tris: L.idx.length / 3 });
    root.addChild(node);
  });
  for (const [k, p] of Object.entries(anchors)) root.addChild(doc.createNode(k).setTranslation(p).setExtras({ anchor: true }));
  const io = new NodeIO();
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(file, bin);
  return bin.length;
}
