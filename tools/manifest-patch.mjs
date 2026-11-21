#!/usr/bin/env node
// Safe concurrent edits of assets/manifest.json. Several people patch the catalogue at the same time, so nobody may rewrite it
// from a copy they read earlier. This tool takes a lock, re-reads the file, applies ONLY your ids, and writes atomically.
//
//   node tools/manifest-patch.mjs fragment.json            merge: for each id in the fragment, Object.assign(manifest[id] ?? {}, entry)
//   node tools/manifest-patch.mjs fragment.json --replace  replace those ids' entries entirely
//   node tools/manifest-patch.mjs --set id.field=json ...  set single fields, e.g. --set char_akari.file='"models/chars/char_akari_v2.glb"'
//   node tools/manifest-patch.mjs --remove id1,id2         delete ids
// A fragment is { "<id>": { file, type, license, author, source, ... }, ... } (same shape as the manifest).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'assets', 'manifest.json');
const LOCK = FILE + '.lock';
const args = process.argv.slice(2);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function lock() {
  for (let i = 0; i < 200; i++) {
    try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); return; } catch (e) {
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 15000) fs.unlinkSync(LOCK); } catch (e2) { /* raced */ }
      sleep(50);
    }
  }
  throw new Error('manifest is locked by someone else for too long: ' + LOCK);
}

let fragment = null, replace = false; const sets = [], removes = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--replace') replace = true;
  else if (a === '--set') sets.push(args[++i]);
  else if (a === '--remove') removes.push(...args[++i].split(',').map((s) => s.trim()).filter(Boolean));
  else fragment = JSON.parse(fs.readFileSync(path.resolve(a), 'utf8'));
}
if (!fragment && !sets.length && !removes.length) { console.error('usage: see the header of tools/manifest-patch.mjs'); process.exit(2); }

lock();
try {
  const m = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let n = 0;
  if (fragment) for (const [id, e] of Object.entries(fragment)) {
    if (!e || typeof e !== 'object') throw new Error('bad entry for ' + id);
    m[id] = replace ? e : Object.assign(m[id] || {}, e); n++;
  }
  for (const s of sets) {
    const eq = s.indexOf('='), key = s.slice(0, eq), dot = key.indexOf('.');
    const id = key.slice(0, dot), field = key.slice(dot + 1);
    if (!m[id]) throw new Error('unknown id ' + id);
    m[id][field] = JSON.parse(s.slice(eq + 1)); n++;
  }
  for (const id of removes) { if (id in m) { delete m[id]; n++; } }
  for (const [id, e] of Object.entries(m)) {
    if (e.file && !fs.existsSync(path.join(ROOT, 'assets', e.file))) console.warn('warning: file missing for', id, '->', e.file);
  }
  const tmp = FILE + '.tmp' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 1) + '\n');
  fs.renameSync(tmp, FILE);
  console.log(`manifest patched: ${n} change(s), ${Object.keys(m).length} entries`);
} finally { try { fs.unlinkSync(LOCK); } catch (e) { /* ignore */ } }
