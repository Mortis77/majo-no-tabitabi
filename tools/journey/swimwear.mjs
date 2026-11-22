// Elaina's two swimsuits for the 衣装 page (docs/api/heroine.md "Wardrobe (journey)"). The original engine dressed its
// heroine in two swim outfits (tools/costume/swim_a.mjs / swim_b.mjs, docs/api/heroine-swim-*.md) on the same sculpted base
// figure Elaina is made from (assets/models/sculpt/akari_base.glb: body, face + its 13 shapes, 201-joint skeleton). This
// tool keeps each of those files whole — the complete body under the suit, every garment layer, the lining, the skirts and
// wraps with their riding fold and their own spring chains — and makes it hers:
//   1. her hair: the nodes akari_hair / akari_ribbon are replaced by Elaina's uncovered hair from the everyday model
//      (assets/models/journey/elaina_apprentice.glb: loose silver hair, brass cuff, the crown curl apprentice_hair +
//      apprentice_hairGlint), skin joints remapped BY BONE NAME and every used joint's inverse bind checked against the
//      suit's skeleton (a mismatch stops the build);
//   2. her eyes: the iris texture is tinted with build-cast's eyes() (tools/journey/eyes.mjs, ELAINA_IRIS);
//   3. the suit's colours: kept as designed (white / lavender / deep indigo already sit in her palette) — TINT below can
//      re-tint a material's base colour factor if that is ever wanted.
// Nothing bare is ever written: the suit layers are checked to be present before the file is.
//   node tools/journey/swimwear.mjs [--only a,b] [--no-install]
// Out: assets/models/journey/elaina_swim_<x>.glb, manifest char_elaina_swim_<x> (preload false; the hair chains and the
// suit's own chains / spring defaults come from the source row char_akari_swim_<x>).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { copyToDocument, prune } from '@gltf-transform/functions';
import { eyes, ELAINA_IRIS } from './eyes.mjs';

const io = new NodeIO();
const DONOR = 'assets/models/journey/elaina_apprentice.glb';
const HAIR = ['akari_hair', 'akari_ribbon', 'apprentice_hair', 'apprentice_hairGlint'];   // copied from the donor, in this order
const DROP = ['akari_hair', 'akari_ribbon'];                                            // removed from the suit file
const SUITS = {
  a: {
    src: 'assets/models/chars/char_akari_swim_a.glb',
    row: 'char_akari_swim_a',
    layers: ['akari_body', 'akari_swim', 'akari_swim_lining', 'akari_skirt'],
    notes:
      'Elaina\'s 潮祭 swimsuit (衣装 page, unlocked after both episodes). The original engine\'s swim A file (white frilled suit, frill skirt, sheer beach shirt, sandals) with her uncovered hair and iris. Costume reference: TAITO Coreful Elaina Swimsuit (2025), https://www.taito.co.jp/taito-prize/0451877100.',
  },
  b: {
    src: 'assets/models/chars/char_akari_swim_b.glb',
    row: 'char_akari_swim_b',
    layers: ['akari_body', 'akari_swim_top', 'akari_swim_shorts', 'akari_swim_waist'],
    notes:
      'Elaina\'s 暮海 swimsuit (衣装 page, unlocked after both episodes). The original engine\'s swim B file (deep indigo suit, lavender organza ruffles, gold stars, wrist scrunchie) with her uncovered hair and iris. Costume reference: TAITO Aqua Float Girls Elaina (2022), https://www.taito.co.jp/taito-prize/0451504900.',
  },
};
// material name -> [r, g, b] linear base colour factor (multiplies the painted texture); empty = the designs as they are
const TINT = { a: {}, b: {} };

const args = process.argv.slice(2);
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? new Set(args[onlyArg + 1].split(',')) : null;

const ibmOf = (skin) => {
  const a = skin.getInverseBindMatrices().getArray(),
    m = new Map();
  skin.listJoints().forEach((j, i) => m.set(j.getName(), a.slice(16 * i, 16 * i + 16)));
  return m;
};

const rows = {};
for (const [x, suit] of Object.entries(SUITS)) {
  if (only && !only.has(x)) continue;
  const id = 'char_elaina_swim_' + x;
  const doc = await io.read(suit.src),
    root = doc.getRoot(),
    skin = root.listSkins()[0],
    buf = root.listBuffers()[0];
  const donor = await io.read(DONOR),
    dRoot = donor.getRoot(),
    dSkin = dRoot.listSkins()[0];
  for (const name of suit.layers)
    if (!root.listNodes().some((n) => n.getMesh()?.getName() === name)) throw Error(`${suit.src}: suit layer ${name} missing`);

  // 1. hair: drop the suit file's own, copy the donor's (meshes only: primitives, accessors, materials, textures)
  for (const n of root.listNodes().filter((n) => DROP.includes(n.getMesh()?.getName()))) {
    const m = n.getMesh();
    n.dispose();
    m.dispose();
  }
  const dNodes = HAIR.map((name) => {
    const n = dRoot.listNodes().find((n) => n.getMesh()?.getName() === name);
    if (!n) throw Error(`${DONOR}: hair node ${name} missing`);
    return n;
  });
  const map = copyToDocument(doc, donor, dNodes.map((n) => n.getMesh()));
  const dJoints = dSkin.listJoints().map((j) => j.getName()),
    tIndex = new Map(skin.listJoints().map((j, i) => [j.getName(), i])),
    dIbm = ibmOf(dSkin),
    tIbm = ibmOf(skin);
  const remapped = new Set();
  let used = new Set();
  for (const dn of dNodes) {
    const mesh = map.get(dn.getMesh());
    for (const p of mesh.listPrimitives()) {
      for (const acc of [...p.listAttributes(), p.getIndices()].filter(Boolean)) acc.setBuffer(buf);
      const J = p.getAttribute('JOINTS_0'),
        W = p.getAttribute('WEIGHTS_0');
      if (!J || remapped.has(J)) continue;
      remapped.add(J);
      const a = J.getArray(),
        w = W.getArray(),
        out = new a.constructor(a.length);
      for (let i = 0; i < a.length; i++) {
        if (!w[i]) continue;
        const name = dJoints[a[i]],
          k = tIndex.get(name);
        if (k === undefined) throw Error(`hair joint ${name} is not in ${suit.src}'s skeleton`);
        out[i] = k;
        used.add(name);
      }
      J.setArray(out);
    }
    const node = doc.createNode(dn.getName()).setMesh(mesh).setSkin(skin);
    node.setTranslation(dn.getTranslation()).setRotation(dn.getRotation()).setScale(dn.getScale());
    root.listScenes()[0].addChild(node);
  }
  for (const name of used) {
    const a = dIbm.get(name),
      b = tIbm.get(name);
    const err = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    if (err > 1e-4) throw Error(`inverse bind of ${name} differs (${err.toExponential(2)}): not the same skeleton`);
  }
  for (const b of root.listBuffers()) if (b !== buf) b.dispose();

  // 2. eyes
  await eyes(doc, ELAINA_IRIS);

  // 3. colours
  for (const [mat, rgb] of Object.entries(TINT[x] || {})) {
    const m = root.listMaterials().find((m) => m.getName() === mat);
    if (m) m.setBaseColorFactor([...rgb, m.getBaseColorFactor()[3]]);
  }

  root.listScenes()[0].setName(id);
  await doc.transform(
    prune({
      keepLeaves: true,
      keepAttributes: true,
      propertyTypes: [PropertyType.ACCESSOR, PropertyType.MATERIAL, PropertyType.TEXTURE, PropertyType.PRIMITIVE, PropertyType.MESH],
    }),
  );
  for (const name of [...suit.layers, ...HAIR])
    if (!root.listNodes().some((n) => n.getMesh()?.getName() === name)) throw Error(`${id}: ${name} lost in the build`);
  const file = 'models/journey/elaina_swim_' + x + '.glb';
  await io.write('assets/' + file, doc);
  const meshes = root.listMeshes(),
    tris = meshes.reduce(
      (a, m) => a + m.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() || p.getAttribute('POSITION').getCount()) / 3, 0),
      0,
    );
  const size = [0, 1, 2].map((i) => {
    let lo = Infinity,
      hi = -Infinity;
    for (const m of meshes)
      for (const p of m.listPrimitives()) {
        const a = p.getAttribute('POSITION');
        lo = Math.min(lo, a.getMin([])[i]);
        hi = Math.max(hi, a.getMax([])[i]);
      }
    return +(hi - lo).toFixed(3);
  });
  rows[id] = { file, bytes: (await fs.stat('assets/' + file)).size, tris, size, meshes: meshes.map((m) => m.getName()), materials: root.listMaterials().map((m) => m.getName()), suit };
  console.log(id, 'tris', tris, 'bytes', rows[id].bytes, 'hair joints', used.size, 'size', size.join(' x '));
}

if (!args.includes('--no-install') && Object.keys(rows).length) {
  const man = JSON.parse(await fs.readFile('assets/manifest.json', 'utf8')),
    patch = {};
  for (const [id, r] of Object.entries(rows)) {
    const src = man[r.suit.row];
    if (!src) throw Error('manifest has no ' + r.suit.row);
    patch[id] = {
      file: r.file,
      type: 'model',
      license:
        'Original mesh and garment construction inspired by the anime character design. Humanoid skeleton based on pixiv VRoid HairSample_Female (CC0).',
      author: 'Journey character team',
      source: `tools/journey/swimwear.mjs: ${r.suit.src} + Elaina's hair from ${DONOR}`,
      bytes: r.bytes,
      tris: r.tris,
      size: r.size,
      meshes: r.meshes,
      materials: r.materials,
      scale: 1,
      clipsFrom: src.clipsFrom,
      bones: src.bones,
      hipsHeight: src.hipsHeight,
      morphs: src.morphs,
      morphMesh: src.morphMesh,
      preload: false,
      secondaryChains: src.secondaryChains,
      springDefaults: src.springDefaults,
      notes: r.suit.notes,
    };
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'journey-swim-'));
  try {
    const fragment = path.join(temp, 'swim.json');
    await fs.writeFile(fragment, JSON.stringify(patch));
    execFileSync(process.execPath, ['tools/manifest-patch.mjs', fragment, '--replace'], { stdio: 'inherit' });
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
