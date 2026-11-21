#!/usr/bin/env node
// Same-camera picture check: node tools/perf/picdiff.mjs <dirA> <dirB> [outDir]
// Per image: mean absolute difference (0..255) and the share of pixels that differ by more than 24 levels; with outDir,
// writes side-by-side pairs (A | B) for the listed files. Used for the 'high' before/after pairs in docs/api/perf.md.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const [A, B, OUT] = process.argv.slice(2);
const rows = [];
for (const f of fs.readdirSync(A).filter((x) => x.endsWith('.png')).sort()) {
  if (!fs.existsSync(path.join(B, f))) continue;
  const a = await sharp(path.join(A, f)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(path.join(B, f)).removeAlpha().raw().toBuffer();
  let sum = 0, big = 0; const n = a.data.length / 3;
  for (let i = 0; i < a.data.length; i += 3) {
    const d = (Math.abs(a.data[i] - b[i]) + Math.abs(a.data[i + 1] - b[i + 1]) + Math.abs(a.data[i + 2] - b[i + 2])) / 3;
    sum += d; if (d > 24) big++;
  }
  rows.push({ f, mean: sum / n, big: (big / n) * 100 });
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    const w = a.info.width, h = a.info.height;
    await sharp({ create: { width: w * 2 + 8, height: h, channels: 3, background: '#000' } })
      .composite([{ input: path.join(A, f), left: 0, top: 0 }, { input: path.join(B, f), left: w + 8, top: 0 }])
      .jpeg({ quality: 82 }).toFile(path.join(OUT, f.replace('.png', '.jpg')));
  }
}
rows.sort((x, y) => y.mean - x.mean);
for (const r of rows) console.log(r.mean.toFixed(2).padStart(6) + '  ' + r.big.toFixed(2).padStart(6) + '%  ' + r.f);
