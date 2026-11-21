#!/usr/bin/env node
// Install the costume artist's garments (assets/_incoming/costume/) into the game. Safe to re-run any time (round 2, 3 …).
//
//   node tools/install-costumes.mjs            copy every *.glb from assets/_incoming/costume/ to assets/models/chars/ and patch
//                                               the manifest through tools/manifest-patch.mjs (lock + merge, never a rewrite)
//   node tools/install-costumes.mjs --dry      print what would happen
//
// Mapping: the fragment id char_<id>_v2 is merged INTO the existing id char_<id> (file -> the _v2 file, plus the new fields
// secondaryChains, springDefaults, materials, meshes, bytes, tris, size, author, notes), so no game code changes. New ids in the
// fragment that are not _v2 (char_banou) are added as they are. Every installed entry keeps `fileV1` = the v1 file
// (char_banou: char_granny.glb), which ?costume=v1 loads for A/B shots (src/core/assets.js). v1 files stay on disk.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets', '_incoming', 'costume');
const DST = path.join(ROOT, 'assets', 'models', 'chars');
const dry = process.argv.includes('--dry');

const frag = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.fragment.json'), 'utf8'));
const V1_OF = { char_banou: 'char_granny' };
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'manifest.json'), 'utf8'));
const out = {};
let copied = 0;
for (const [fid, e] of Object.entries(frag)) {
  const id = fid.replace(/_v2$/, '');
  const base = V1_OF[id] || (e.replaces || id);
  const file = path.basename(e.file);
  const from = path.join(SRC, file);
  if (!fs.existsSync(from)) { console.warn('skip', fid, '(no file', file + ')'); continue; }
  const to = path.join(DST, file);
  const same = fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size && fs.readFileSync(to).equals(fs.readFileSync(from));
  if (!same) { if (!dry) fs.copyFileSync(from, to); copied++; }
  const entry = { ...e };
  delete entry.replaces;
  // The clip libraries of a character belong to the animation side (docs/api/animation.md: ['anim_ual', 'anim_miko']); the
  // costume fragment only knows the v1 value, so never let it overwrite what the manifest has.
  delete entry.clipsFrom;
  if (!MANIFEST[id]) entry.clipsFrom = ['anim_ual', 'anim_miko']; // brand-new id (char_banou on a fresh checkout)
  entry.file = 'models/chars/' + file;
  entry.fileV1 = 'models/chars/' + base + '.glb';
  entry.costume = 2;
  out[id] = entry;
}
const tmp = path.join(ROOT, '.tmp', 'install-costumes.fragment.json');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, JSON.stringify(out, null, 1));
console.log((dry ? '[dry] ' : '') + 'costumes: ' + Object.keys(out).length + ' entries, ' + copied + ' files copied');
for (const [id, e] of Object.entries(out)) console.log('  ' + id.padEnd(18) + ' -> ' + e.file + '  (' + (e.secondaryChains?.length || 0) + ' chains, v1 ' + e.fileV1 + ')');
if (!dry) {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'manifest-patch.mjs'), tmp], { stdio: 'inherit' });
  fs.unlinkSync(tmp);
}
