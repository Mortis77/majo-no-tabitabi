#!/usr/bin/env node
// Guard against hard-coded player-visible text: reports CJK characters that appear in CODE (string / template literals)
// outside src/locales/. Comments are fine. Locale copy also rejects names specific to the Moonveil setting.
//   node tools/check-i18n.mjs                 -> whole src/
//   node tools/check-i18n.mjs src/ui src/story/quests.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2).length ? process.argv.slice(2).map((p) => path.resolve(p)) : [path.join(ROOT, 'src')];
const CJK = /[぀-ヿ㐀-䶿一-鿿＀-￯　-〿]/;
// The itinerary includes an eclipse. Place names from the previous game's map identify a
// stale location reliably, while ordinary descriptions of weather and astronomy belong in dialogue.
const LEGACY_NAMES = ['月帷巫女', '巫女「灯里」', '朝颜村', '狐火之里', '万灯镇', '星晶野', '霜见岳', '月读宫', '白浪岬'];

function walk(p, out) {
  if (!fs.existsSync(p)) return out;
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const e of fs.readdirSync(p)) walk(path.join(p, e), out); }
  else if (/\.(js|mjs|html|css)$/.test(p)) out.push(p);
  return out;
}

/** Blank out comments, keep everything else (so string contents survive) — tolerant single-pass scanner. */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let mode = null; // null | "'" | '"' | '`'
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode) {
      out += c;
      if (c === '\\') { out += d ?? ''; i += 2; continue; }
      if (c === mode) mode = null;
      i++;
      continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') mode = c;
    out += c; i++;
  }
  return out;
}

let bad = 0;
for (const file of targets.flatMap((p) => walk(p, []))) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const isLocale = rel.split(path.sep).includes('locales');
  if (isLocale) {
    const code = stripComments(src);
    code.split('\n').forEach((line, i) => {
      for (const w of LEGACY_NAMES) if (line.includes(w)) { bad++; console.log(`${rel}:${i + 1}  previous-game name 「${w}」  ${line.trim().slice(0, 90)}`); }
    });
    continue;
  }
  if (rel.endsWith('index.template.html')) continue; // static shell: texts are replaced from the locale at boot
  const code = file.endsWith('.html') ? src.replace(/<!--[\s\S]*?-->/g, '') : stripComments(src);
  code.split('\n').forEach((line, i) => {
    if (CJK.test(line)) { bad++; console.log(`${rel}:${i + 1}  hard-coded text  ${line.trim().slice(0, 100)}`); }
  });
}
console.log(bad ? `\n${bad} problem(s). Localise hard-coded copy and replace previous-game names.` : 'i18n OK');
process.exit(bad ? 1 : 0);
