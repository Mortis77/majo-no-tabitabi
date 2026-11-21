#!/usr/bin/env node
// Writes the manifest entry char_akari_v3 from the built file (node tools/costume/v3.mjs first) and applies it with
// tools/manifest-patch.mjs (lock + merge; only this id). preload:false — the player loads it on demand behind ?akari=v3.
//   node tools/costume/v3-install.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const FILE = 'models/chars/char_akari_v3.glb';
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
const v2 = man.char_akari, base = man.char_akari_base;
const info = JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp/akari-v3/out/build.json'), 'utf8'));
const doc = await new NodeIO().read(path.join(ROOT, 'assets', FILE)); const root = doc.getRoot();
let tris = 0; const mn = [9, 9, 9], mx = [-9, -9, -9], mats = new Set(), meshes = [];
for (const nd of root.listNodes()) { const m = nd.getMesh(); if (!m) continue; meshes.push(nd.getName());
  for (const p of m.listPrimitives()) { mats.add(p.getMaterial().getName()); tris += p.getIndices().getCount() / 3; const P = p.getAttribute('POSITION').getArray();
    for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i + a]); mx[a] = Math.max(mx[a], P[i + a]); } } }
const chains = info.chains.map((c) => ({ root: c.joints[0], joints: c.joints, tail: c.joints[0].replace(/_01$/, '_end'), parent: c.parent, kind: c.kind,
  ...(c.theta !== undefined ? { theta: c.theta } : {}), ...(c.restRotation ? { restRotation: c.restRotation } : {}) }));
// the hair bow is the base figure's own (akari_ribbon on the RibbonL / RibbonR chains, refitted by the sculptor)
for (const c of base.secondaryChains) if (!chains.some((q) => q.root === c.root)) chains.push(c);
const entry = {
  file: FILE, type: 'model', preload: false,
  license: 'CC0 (original body, face, undergarment, outfit and textures made for this project; hair + bow mesh, skeleton: VRoid HairSample_Female, CC0)',
  author: 'sculpted / generated for this project (tools/sculpt/figure, tools/costume/v3.mjs); hair, bow and skeleton: pixiv Inc. (VRoid Project) CC0',
  source: 'tools/costume/v3.mjs on assets/models/sculpt/akari_base.glb (+ tools/sculpt/assets/akari_outfit*.mjs)',
  scale: 1, size: mx.map((v, a) => +(v - mn[a]).toFixed(3)), tris, bytes: fs.statSync(path.join(ROOT, 'assets', FILE)).size,
  clipsFrom: v2.clipsFrom, morphs: v2.morphs, morphMesh: 'akari_face', bones: v2.bones, hipsHeight: v2.hipsHeight,
  meshes, materials: [...mats].sort(), secondaryChains: chains, springDefaults: v2.springDefaults,
  notes: 'Heroine v3 behind ?akari=v3 (src/player/player.js): the base figure (char_akari_base: whole body, revised face with the 13 shapes, '
    + 'hair + bow, undergarment) dressed in SEPARATE layers, one node + material group per garment, nothing cut from the body: akari_under '
    + '(robe + shorts + cord), akari_kosode (white hakui with crossed collar band + red collar line), akari_tabi, akari_lining (red divided '
    + 'legs), akari_hakama (18 pleats, 10 chains, legs follow), akari_sode (wide sleeves, 2 chains each), akari_obi (sash, back bow + 2 tails, '
    + 'koshiita, front board), akari_charm, akari_zori; akari_ribbon kept from the base. Same skeleton / inverse binds / clips / morphs as '
    + 'char_akari; the J_Sec_ chains keep the v2 names. Layer structure, fitting, chains: docs/api/heroine.md.',
};
const frag = { char_akari_v3: entry };
const out = path.join(ROOT, '.tmp/akari-v3/out/manifest.fragment.json'); fs.writeFileSync(out, JSON.stringify(frag, null, 1));
console.log('char_akari_v3', tris, 'tris', entry.bytes, 'bytes', meshes.join(' '), '|', entry.materials.join(' '), '| chains', chains.length);
if (!process.argv.includes('--dry')) console.log(execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), out], { encoding: 'utf8' }).trim());
