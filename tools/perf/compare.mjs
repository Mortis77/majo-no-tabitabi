#!/usr/bin/env node
// Compare two perf runs: node tools/perf/compare.mjs <labelA> <labelB> [tier]
// Prints per scene: frame p50 / ser p50 / calls / ktris for A and B (from .tmp/perf/<label>/<tier>.json), plus the
// moving runs (frame p50 / p95 / max, frames over 25 ms) — the table format used in docs/api/perf.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [a, b, ...tiersArg] = process.argv.slice(2);
const tiers = tiersArg.length ? tiersArg : ['high', 'med', 'low'];
const load = (l, t) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp/perf', l, t + '.json'), 'utf8')); } catch (e) { return null; } };
const f = (x, w = 6) => (x == null ? '-' : typeof x === 'number' ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)) : String(x)).padStart(w);
for (const t of tiers) {
  const A = load(a, t), B = b ? load(b, t) : null;
  if (!A && !B) continue;
  const m = (B || A).meta;
  console.log(`\n### ${t}  (${m.drawingBuffer.join('x')}, pixel ratio ${m.pixelRatio})   ${a}${b ? ' -> ' + b : ''}`);
  console.log('scene'.padEnd(24) + '  frame50 A     B    ser50 A     B   calls A    B   ktris A     B');
  const ids = [...new Set([...(A?.scenes || []), ...(B?.scenes || [])].map((s) => s.id))];
  const get = (R, id) => R?.scenes.find((s) => s.id === id)?.stats;
  let sa = 0, sb = 0, n = 0;
  for (const id of ids) {
    const x = get(A, id), y = get(B, id);
    if (x && y) { sa += x.ser?.p50 || 0; sb += y.ser?.p50 || 0; n++; }
    console.log(id.padEnd(24) + f(x?.frame.p50, 10) + f(y?.frame.p50) + f(x?.ser?.p50, 10) + f(y?.ser?.p50) + f(x?.calls, 8) + f(y?.calls, 5) + f(x ? Math.round(x.tris / 1000) : null, 9) + f(y ? Math.round(y.tris / 1000) : null));
  }
  if (n) console.log(`mean ser p50 over ${n} common scenes: ${(sa / n).toFixed(1)} -> ${(sb / n).toFixed(1)} ms`);
  for (const R of [A, B]) {
    if (!R?.runs) continue;
    for (const [name, r] of Object.entries(R.runs)) {
      if (r.error) { console.log(`  run ${name}: ERROR ${r.error}`); continue; }
      console.log(`  ${R === A ? a : b} run ${name.padEnd(18)} frame p50 ${f(r.stats.frame.p50)} p95 ${f(r.stats.frame.p95)} max ${f(r.stats.frame.max)}  >25ms ${r.hitches?.length ?? '-'} / ${r.stats.n}`);
    }
  }
}
