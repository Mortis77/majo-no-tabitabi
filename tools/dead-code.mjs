#!/usr/bin/env node
// List src/ modules that never reach the game bundle (dead code inherited from the Moonveil engine, or forgotten).
//   node tools/dead-code.mjs        -> prints bundled / total counts and every unused file with its size
// Locale files are skipped (they are collected by namespace at build time, not imported).
import * as esbuild from 'esbuild';
import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.cwd(), SRC = path.join(ROOT, 'src');
const man = JSON.parse(fs.readFileSync('systems.manifest.json', 'utf8'));
const entry = man.map((s, i) => `import { ${s.export} as s${i} } from './${s.path}';`).join('\n') + "\nimport './core/boot.js';";
const r = await esbuild.build({ bundle: true, write: false, metafile: true, format: 'iife', logLevel: 'silent',
  loader: { '.glsl': 'text', '.css': 'text', '.txt': 'text' }, define: { __JOURNEY_FIELD__: 'null' },
  stdin: { contents: entry, resolveDir: SRC, sourcefile: 'entry.js', loader: 'js' },
  plugins: [{ name: 'v', setup(b) { b.onResolve({ filter: /^virtual:locales$/ }, () => ({ path: 'l', namespace: 'v' })); b.onLoad({ filter: /.*/, namespace: 'v' }, () => ({ contents: 'export default {}', loader: 'js' })); } }] });
const usedRel = new Set(Object.keys(r.metafile.inputs));
const all = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.js$/.test(f) && !p.includes('/locales/')) all.push(path.relative(ROOT, p)); } })(SRC);
const unused = all.filter((f) => !usedRel.has(f));
console.log('bundled', usedRel.size, 'src js', all.length, 'unused', unused.length);
for (const f of unused) console.log(f, fs.statSync(f).size);
