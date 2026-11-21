#!/usr/bin/env node
// Compare two takes of a shot: per-frame sha1 of the captured picture (take.json) and, for frames that differ, the
// pixel difference of the encoded video (ffmpeg PSNR per frame).
//   node tools/trailer/compare.mjs <takeDirA> <takeDirB>
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('usage: node tools/trailer/compare.mjs <takeDirA> <takeDirB>'); process.exit(1); }
const ja = JSON.parse(fs.readFileSync(path.join(a, 'take.json'), 'utf8'));
const jb = JSON.parse(fs.readFileSync(path.join(b, 'take.json'), 'utf8'));
if (ja.build !== jb.build) console.log(`NOTE: different game bundles (${ja.build} vs ${jb.build}): the game code changed between the takes`);
const ha = ja.frameHashes || [], hb = jb.frameHashes || [];
const n = Math.max(ha.length, hb.length);
const diff = [];
for (let i = 0; i < n; i++) if (ha[i] !== hb[i]) diff.push(i);
console.log(`frames: ${ha.length} vs ${hb.length}; identical: ${n - diff.length}; different: ${diff.length}`);
if (diff.length) console.log('first different frames: ' + diff.slice(0, 20).join(' '));
const va = fs.readdirSync(a).find((f) => /\.(mov|mp4)$/.test(f)), vb = fs.readdirSync(b).find((f) => /\.(mov|mp4)$/.test(f));
if (diff.length && va && vb) {
  const r = spawnSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-i', path.join(a, va), '-i', path.join(b, vb),
    '-lavfi', 'psnr=stats_file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const rows = r.stdout.split('\n').filter(Boolean).map((l) => { const m = /n:(\d+).*psnr_avg:(\S+)/.exec(l); return m ? [Number(m[1]) - 1, m[2]] : null; }).filter(Boolean);
  const bad = rows.filter(([, p]) => p !== 'inf');
  console.log(`video PSNR: ${rows.length - bad.length} frames bit-identical after encode, ${bad.length} differ`);
  if (bad.length) {
    const vals = bad.map(([, p]) => Number(p));
    console.log(`  differing frames PSNR min ${Math.min(...vals).toFixed(1)} dB, mean ${(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)} dB`);
    console.log('  e.g. ' + bad.slice(0, 12).map(([f, p]) => `${f}:${(+p).toFixed(1)}`).join('  '));
  }
}
process.exit(diff.length ? 1 : 0);
