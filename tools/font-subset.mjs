#!/usr/bin/env node
// The interface's display serif (MV Serif = Noto Serif SC, SIL OFL 1.1, no Reserved Font Name) ships as a subset: only the
// characters the locales and the credits use, plus printable ASCII and the typographic marks below. 25 MB -> about 0.5 MB.
//
//   node tools/font-subset.mjs --check          list characters the locales use that the shipped subset lacks (no Python needed)
//   node tools/font-subset.mjs <source.ttf>      rebuild assets/fonts/zh-CN/NotoSerifSC-UI.woff2 from the variable source
//                                                (NotoSerifSC[wght].ttf from https://github.com/google/fonts/tree/main/ofl/notoserifsc);
//                                                needs Python with fonttools + brotli: `pip install fonttools brotli`
//                                                (FONTTOOLS_PY=/path/to/python picks the interpreter).
//
// A character outside the subset is not lost: the browser draws that one glyph from the next face in the stack (Songti /
// Noto Serif CJK / serif). Rebuild when --check reports gaps after new text lands.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/fonts/zh-CN/NotoSerifSC-UI.woff2');
const LIST = path.join(ROOT, 'tools/font-subset.chars.txt');   // what the shipped subset holds
const EXTRA = '“”‘’—–…·・《》〈〉「」『』【】〔〕、。，．！？：；（）～￥％＋－×÷＝•◆◇✦✧★☆○●◎↑↓←→⇄‹›«»°′″№';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(js|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

function wanted() {
  const set = new Set();
  for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));
  for (const c of EXTRA) set.add(c);
  let text = '';
  for (const f of walk(path.join(ROOT, 'src/locales'))) text += fs.readFileSync(f, 'utf8');
  try { for (const r of Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')))) text += (r.author || '') + (r.license || ''); } catch (e) { /* credits optional */ }
  for (const c of text) if (c.codePointAt(0) >= 0x80) set.add(c);
  return [...set].sort();
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
  const have = new Set(fs.existsSync(LIST) ? [...fs.readFileSync(LIST, 'utf8')] : []);
  const miss = wanted().filter((c) => !have.has(c) && c.trim());
  if (!miss.length) { console.log('font-subset: the shipped subset covers every locale character'); process.exit(0); }
  console.log(`font-subset: ${miss.length} character(s) fall back to the system serif: ${miss.join('')}`);
  console.log('rebuild: node tools/font-subset.mjs <NotoSerifSC[wght].ttf>');
  process.exit(1);
}
if (!args[0] || !fs.existsSync(args[0])) { console.error('usage: see the header of tools/font-subset.mjs'); process.exit(2); }

const chars = wanted().join('');
const tmp = path.join(os.tmpdir(), `mv-font-subset-${process.pid}.txt`);
fs.writeFileSync(tmp, chars);
const py = process.env.FONTTOOLS_PY || 'python3';
const r = spawnSync(py, ['-m', 'fontTools.subset', path.resolve(args[0]), `--text-file=${tmp}`, '--flavor=woff2',
  '--layout-features=kern,liga,locl,palt,halt,vpal,vhal', `--output-file=${OUT}`], { stdio: 'inherit' });
fs.rmSync(tmp, { force: true });
if (r.status !== 0) { console.error('fontTools failed (pip install fonttools brotli; FONTTOOLS_PY picks the python)'); process.exit(1); }
fs.writeFileSync(LIST, chars);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${[...chars].length} characters)`);
