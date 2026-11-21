#!/usr/bin/env node
// The rig source for the figure's asset modules: the PRESENT heroine's skeleton (char_akari_v2.glb: 175 joints, costume
// J_Sec chains included, inverse bind matrices and node transforms untouched) with ONE skinned mesh: the complete body
// of the original file (char_akari.glb `Body`, the skin that v2 deleted under the garments), joints remapped by name,
// no textures. The kit's loadRig (tools/sculpt/rig.mjs) reads it: bone frames for sculpting + the weight donor.
//   node tools/sculpt/figure/make-rig.mjs   ->  .tmp/sculpt/akari_base/rig_source.glb   (deterministic; rebuild any time)
import fs from 'node:fs';
import path from 'node:path';
import { io, ROOT } from './glbio.mjs';

export const RIG_SOURCE = path.join(ROOT, '.tmp/sculpt/akari_base/rig_source.glb');
export const PRESENT = path.join(ROOT, 'assets/models/chars/char_akari_v2.glb');
export const ORIGINAL = path.join(ROOT, 'assets/models/chars/char_akari.glb');

export async function makeRigSource(out = RIG_SOURCE) {
  const doc = await io().read(PRESENT), v1 = await io().read(ORIGINAL);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const jn = skin.listJoints().map((j) => j.getName());
  // donor: v1 Body
  const sk1 = v1.getRoot().listSkins()[0], jn1 = sk1.listJoints().map((j) => j.getName());
  const donor = v1.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial()?.getName() === 'Body');
  const map = jn1.map((n) => { const i = jn.indexOf(n); if (i < 0) throw new Error('joint missing in v2: ' + n); return i; });
  const J1 = donor.getAttribute('JOINTS_0').getArray(), W1 = donor.getAttribute('WEIGHTS_0').getArray();
  const J = new Uint16Array(J1.length); for (let i = 0; i < J1.length; i++) J[i] = W1[i] > 0 ? map[J1[i]] : 0;
  // strip every mesh / material / texture of v2
  const buf = root.listBuffers()[0];
  let keep = null;
  for (const n of root.listNodes()) { if (!n.getMesh()) continue; if (n.getName() === 'akari_body') keep = n; else { n.setMesh(null); n.setSkin(null); } }
  for (const m of root.listMeshes()) { for (const p of m.listPrimitives()) p.dispose(); if (m !== keep.getMesh()) m.dispose(); }
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  for (const a of root.listAccessors()) if (!a.listParents().some((x) => x !== root)) a.dispose();
  for (const n of root.listNodes()) if (!n.getMesh() && /^akari_/.test(n.getName()) && !n.listChildren().length) n.dispose();
  const mat = doc.createMaterial('Body');
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const prim = doc.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', acc('VEC3', Float32Array.from(donor.getAttribute('POSITION').getArray())))
    .setAttribute('NORMAL', acc('VEC3', Float32Array.from(donor.getAttribute('NORMAL').getArray())))
    .setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', Float32Array.from(W1)))
    .setIndices(acc('SCALAR', Uint32Array.from(donor.getIndices().getArray())));
  keep.getMesh().addPrimitive(prim);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await io().writeBinary(doc));
  return { joints: jn.length, donorVerts: J1.length / 4, out };
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) console.log(await makeRigSource());
