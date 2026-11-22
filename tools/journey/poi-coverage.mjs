#!/usr/bin/env node
// Design-time point-of-interest coverage of the journey map (map round, 2026-11-22).
//
//   node tools/journey/poi-coverage.mjs [--out .tmp/agents/map/coverage] [--set before|after|both] [--grid 60]
//
// Samples a grid over the land and, per cell, counts the points of interest a traveller can SEE: on foot (eye 1.7 m)
// and on the broom (60 m above the ground). A point is visible when it is within the reach of its scale (large 1600 m,
// medium 700 m, small 260 m) and the line from the eye to its top (ground + h) clears the terrain (height function,
// sampled on a 10 m grid; trees are ignored). Also records how many 90° sectors hold a visible point (pull in different
// directions) and the distance to the nearest point. Writes a PNG heat map per set / height and prints the numbers.
//   before = story places + the wayside notes (what the map had);  after = before + src/data/landmarks.js.
// Also flies the road and the straight east-west line at 16 m/s and reports how often a NEW point comes into view.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { world as W } from '../../src/world/ground.js';
import { JOURNEY_POI, ROAD_ACROSS, CITY } from '../../src/data/journey-map.js';
import { WAYSIDES } from '../../src/data/waysides.js';
import { LANDMARKS } from '../../src/data/landmarks.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(opt('out', '.tmp/agents/map/coverage'));
const SET = opt('set', 'both');
const GRID = +opt('grid', 60);
fs.mkdirSync(OUT, { recursive: true });

const REACH = { large: 1600, medium: 700, small: 260 };
// ---- height grid (10 m) for fast line-of-sight
const X0 = -2450, Z0 = -1100, X1 = 2450, Z1 = 700, HS = 10;
const NX = Math.round((X1 - X0) / HS) + 1, NZ = Math.round((Z1 - Z0) / HS) + 1;
const HG = new Float32Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) HG[j * NX + i] = Math.max(0, W.baseHeightAt(X0 + i * HS, Z0 + j * HS));
function hAt(x, z) {
  const fx = Math.min(NX - 1.001, Math.max(0, (x - X0) / HS)), fz = Math.min(NZ - 1.001, Math.max(0, (z - Z0) / HS));
  const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * NX + i;
  return (HG[k] * (1 - tx) + HG[k + 1] * tx) * (1 - tz) + (HG[k + NX] * (1 - tx) + HG[k + NX + 1] * tx) * tz;
}
function sees(ex, ey, ez, p) {
  const d = Math.hypot(p.x - ex, p.z - ez);
  if (d > REACH[p.scale]) return false;
  const ty = p.y + p.h;
  const n = Math.ceil(d / 15);
  for (let k = 1; k < n; k++) {
    const t = k / n, y = ey + (ty - ey) * t;
    if (hAt(ex + (p.x - ex) * t, ez + (p.z - ez) * t) > y + 0.5) return false;
  }
  return true;
}
// ---- point sets
const P = (id, x, z, scale, h) => ({ id, x, z, scale, h, y: hAt(x, z) });
const before = [
  P('city', CITY.x, CITY.z, 'large', 42), P('hometown', JOURNEY_POI.hometown.x, JOURNEY_POI.hometown.z, 'medium', 10),
  P('fran_cottage', JOURNEY_POI.forest.x, JOURNEY_POI.forest.z, 'medium', 8), P('trial_lawn', JOURNEY_POI.trial.x, JOURNEY_POI.trial.z, 'small', 2),
  P('crater_lake', 1725, -48, 'medium', 1),
  ...WAYSIDES.map((w) => P(w.id, w.x, w.z, w.id === 'mill' || w.id === 'lookout' || w.id === 'pass' || w.id === 'standingStones' ? 'medium' : 'small', w.id === 'mill' ? 12 : 3)),
];
const after = before.concat(LANDMARKS.map((l) => P(l.id, l.x, l.z, l.scale, l.h)));

function grid(points, eyeH) {
  const cells = [];
  for (let z = -1000 + GRID / 2; z < 620; z += GRID) for (let x = -2420 + GRID / 2; x < 2420; x += GRID) {
    const g = hAt(x, z);
    if (W.baseHeightAt(x, z) < 0.5) continue;
    const ey = g + eyeH;
    let n = 0, near = 1e9;
    const sectors = new Set();
    for (const p of points) {
      const d = Math.hypot(p.x - x, p.z - z);
      near = Math.min(near, d);
      if (sees(x, ey, z, p)) { n++; sectors.add(Math.floor(((Math.atan2(p.x - x, p.z - z) + Math.PI) / (Math.PI / 2))) % 4); }
    }
    cells.push({ x, z, n, sec: sectors.size, near });
  }
  const N = cells.length;
  const frac = (f) => +(100 * cells.filter(f).length / N).toFixed(1);
  return {
    cells,
    stats: {
      cells: N, meanVisible: +(cells.reduce((a, c) => a + c.n, 0) / N).toFixed(2),
      'pct>=1': frac((c) => c.n >= 1), 'pct>=2': frac((c) => c.n >= 2), 'pct>=3': frac((c) => c.n >= 3),
      'pct2+directions': frac((c) => c.sec >= 2), 'pctEmpty': frac((c) => c.n === 0),
      meanNearest: Math.round(cells.reduce((a, c) => a + c.near, 0) / N), 'pctNearest>400': frac((c) => c.near > 400),
    },
  };
}
async function heat(cells, file) {
  const S = 4, w = Math.ceil(4840 / GRID) * S, h = Math.ceil(1620 / GRID) * S;
  const img = Buffer.alloc(w * h * 3, 0);
  // land shading under the cells
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = -2420 + (i + 0.5) * GRID / S, z = -1000 + (j + 0.5) * GRID / S;
    const k = (j * w + i) * 3, land = W.baseHeightAt(x, z) > 0.5;
    img[k] = land ? 40 : 20; img[k + 1] = land ? 44 : 30; img[k + 2] = land ? 40 : 60;
  }
  const ramp = (n) => n <= 0 ? [150, 30, 40] : n === 1 ? [210, 120, 40] : n === 2 ? [220, 200, 60] : n === 3 ? [120, 200, 80] : n <= 5 ? [60, 170, 120] : [40, 120, 200];
  for (const c of cells) {
    const i0 = Math.floor((c.x - GRID / 2 + 2420) / GRID) * S, j0 = Math.floor((c.z - GRID / 2 + 1000) / GRID) * S;
    const col = ramp(c.n);
    for (let j = 0; j < S - 1; j++) for (let i = 0; i < S - 1; i++) { const k = ((j0 + j) * w + i0 + i) * 3; if (k >= 0 && k < img.length - 2) { img[k] = col[0]; img[k + 1] = col[1]; img[k + 2] = col[2]; } }
  }
  await sharp(img, { raw: { width: w, height: h, channels: 3 } }).resize(w * 2, h * 2, { kernel: 'nearest' }).png().toFile(file);
}
// new points per stretch of flight (16 m/s)
function flight(points, line, eyeH) {
  const seen = new Set(), news = [];
  let s = 0, last = 0, gaps = [];
  for (let k = 1; k < line.length; k++) {
    const [x0, z0] = line[k - 1], [x1, z1] = line[k], L = Math.hypot(x1 - x0, z1 - z0);
    for (let d = 0; d < L; d += 25) {
      const x = x0 + (x1 - x0) * d / L, z = z0 + (z1 - z0) * d / L, ey = hAt(x, z) + eyeH;
      let fresh = 0;
      for (const p of points) if (!seen.has(p.id) && sees(x, ey, z, p)) { seen.add(p.id); fresh++; }
      if (fresh) { news.push(Math.round(s + d)); gaps.push(s + d - last); last = s + d; }
    }
    s += L;
  }
  gaps.sort((a, b) => a - b);
  return { length: Math.round(s), newPoints: seen.size, medianGapM: Math.round(gaps[gaps.length >> 1] || 0), maxGapM: Math.round(gaps[gaps.length - 1] || 0), medianGapS: +((gaps[gaps.length >> 1] || 0) / 16).toFixed(1) };
}
const report = {};
const sets = SET === 'both' ? { before, after } : SET === 'before' ? { before } : { after };
for (const [name, pts] of Object.entries(sets)) {
  report[name] = { points: pts.length };
  for (const [label, eye] of [['foot', 1.7], ['broom60', 60]]) {
    const g = grid(pts, eye);
    report[name][label] = g.stats;
    await heat(g.cells, path.join(OUT, `heat_${name}_${label}.png`));
  }
  report[name].flightRoad = flight(pts, ROAD_ACROSS.slice().reverse(), 45);
  report[name].flightStraight = flight(pts, [[2395, 55], [-2395, -475]], 60);
}
fs.writeFileSync(path.join(OUT, 'coverage.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
console.log('heat maps in', OUT, '(red = nothing in view, orange 1, yellow 2, green 3, teal 4-5, blue 6+)');
