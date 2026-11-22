// Planting the countryside plan (countryside-plan.js) into the flora instance lists (map round, 2026-11-22).
// Called once from scatter.js with its placement helpers:
//   put(id, x, z, rot, scale, rgb, { tx, tz, mineral, sink }) — one instance at an exact yaw / pitch
//   ok(x, z, pad)                                             — the plan's clearance test (roads, anchors, places)
// Counts of the dense layers (crops, heather, hedges, drifts) follow the quality density; walls, fences, bales, orchard
// and landmark trees do not (they are the composition, and cheap).
import * as THREE from 'three';
import { mulberry32, noise2, smoothstep } from '../../core/util.js';
import { countryPlan, zoneWeights, MEADOW_COLOURS } from './countryside-plan.js';
import { LANDMARKS } from '../../data/landmarks.js';
import { poolOf } from '../landforms/pools.js';
import { crownColors } from './travel-canopy.js';
import { standEllipse } from './forest-stands.js';
import './countryside-species.js';

const pal = (list) => list.map((h) => new THREE.Color(h).toArray());
const TONES = {
  lavender: pal([0x9b7fd4, 0x8c72c8, 0xa88ad8, 0xb39adf, 0x9478c9]),
  wheat: pal([0xe3c066, 0xd9b55a, 0xe8c975, 0xd4ae58, 0xdcb966]),
  barley: pal([0xc8c67a, 0xbcc27a, 0xd2c983, 0xc3bf6e]),
  poppy: pal([0xe25b45, 0xd9503e, 0xe8694c, 0xde5a4a]),
  poppyMix: pal([0xf2efe4, 0x7d9fe2, 0xf0d050]),
  hedge: pal([0x5f8f48, 0x6a9a4e, 0x55874a, 0x739f52, 0x66934a]),
  leaves: pal([0x6f9e4f, 0x7aa858, 0x82ad5a, 0x6a9a50]),
  heather: pal([0xa9739f, 0xb98aac, 0x9c6a94, 0xc79bb8, 0x9b7591, 0xb48aa4]),
  gorse: pal([0x4f7440, 0x587c46, 0x4a6e3e]),
  bracken: pal([0x8aa05a, 0x9aa860, 0x7f9a55]),
  blossom: pal([0xf4efe6, 0xf2e6ea, 0xefe9da, 0xf6e9ee]),
  stone: [[1, 1, 1], [0.95, 0.95, 0.92], [1.04, 1.02, 0.97], [0.92, 0.93, 0.9]],
  wood: [[1, 1, 1], [0.92, 0.9, 0.88], [1.05, 1.02, 0.98]],
  straw: [[1, 1, 1], [0.96, 0.94, 0.88], [1.03, 1.0, 0.94]],
  ring: pal([0xf2efe4, 0xf0d050, 0xf3e3b0]),
  undergrowth: pal([0x859a56, 0x789d68, 0x93a76c, 0x739b5e]),
};
const COPSE = {
  green: ['broad1', 'broad2', 'broad4', 'broad5', 'oak'], silver: ['birch', 'birch', 'birch', 'broad5'],
  gold: ['ginkgo1', 'ginkgo2', 'maple3', 'broad2'], wine: ['maple1', 'maple2', 'maple3', 'broad4'], pine: ['pine1', 'pine2', 'pine3'],
};
const crownPal = Object.fromEntries(Object.entries(crownColors).map(([k, v]) => [k, pal(v)]));

export function plantCountryside(W, density, put) {
  const plan = countryPlan(W);
  const { ok: _unused, open } = { ok: null, open: plan.open };
  const rnd = mulberry32(911);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const dense = 0.55 + 0.45 * density;
  const counts = {};
  const P = (id, x, z, rot, scale, rgb, o) => { if (put(id, x, z, rot, scale, rgb, o)) counts[id] = (counts[id] || 0) + 1; };
  const pitchAlong = (x, z, yaw, len) => {
    const dx = Math.sin(yaw) * len / 2, dz = Math.cos(yaw) * len / 2;
    return Math.atan2(W.heightAt(x + dx, z + dz) - W.heightAt(x - dx, z - dz), len);
  };
  // a run of segments (walls 2.4 m, fences 3 m) from p0 to p1; gate: leave a gap
  function segments(id, p0, p1, len, gate, seed) {
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const n = Math.max(1, Math.round(L / len)), step = L / n;
    const yaw = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
    const gr = mulberry32(seed);
    const gateAt = gate ? Math.floor(gr() * n) : -1;
    for (let k = 0; k < n; k++) {
      if (k === gateAt || (gate && k === gateAt + 1 && id === 'drywall')) continue;
      const t = (k + 0.5) / n, x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
      if (!open(x, z, -0.5)) continue;
      const s = step / len;
      P(id, x, z, yaw - Math.PI / 2, s, pick(id === 'fence' ? TONES.wood : TONES.stone), { tz: pitchAlong(x, z, yaw, step), mineral: true, sink: id === 'drywall' ? 0.12 : 0.05, sx: s });
    }
  }
  function hedgeLine(pts, seed, gate) {
    const hr = mulberry32(seed);
    let acc = 0, nextTree = 6 + hr() * 10;
    // resample at ~1.5 m (fewer on lower tiers)
    const spacing = 1.45 / (0.72 + 0.28 * density);
    let gateS = gate ? 6 + hr() * 20 : -1;
    for (let k = 1; k < pts.length; k++) {
      const [x0, z0] = pts[k - 1], [x1, z1] = pts[k];
      const L = Math.hypot(x1 - x0, z1 - z0);
      for (let d = 0; d < L; d += spacing) {
        const s = acc + d;
        if (gateS >= 0 && s > gateS && s < gateS + 4.2) continue;
        const x = x0 + (x1 - x0) * d / L + (hr() - 0.5) * 0.5, z = z0 + (z1 - z0) * d / L + (hr() - 0.5) * 0.5;
        if (!open(x, z, -1)) continue;
        if (s > nextTree) {
          nextTree = s + 9 + hr() * 14;
          const key = hr() < 0.45 ? 'hawthorn' : hr() < 0.6 ? 'broad5' : 'broad1';
          P(key, x, z, hr() * 6.28, key === 'hawthorn' ? 0.8 + hr() * 0.35 : 0.72 + hr() * 0.3, key === 'hawthorn' ? pick(TONES.blossom) : pick(crownPal.green), { tx: (hr() - 0.5) * 0.06, tz: (hr() - 0.5) * 0.06 });
        }
        P('hedge', x, z, hr() * 6.28, 0.78 + hr() * 0.4, pick(TONES.hedge), { tx: (hr() - 0.5) * 0.1, tz: (hr() - 0.5) * 0.1 });
      }
      acc += L;
    }
  }

  // ---------------------------------------------------------------- fields
  for (const f of plan.fields) {
    const fr = mulberry32(f.seed);
    const at = (u, v) => [f.x + u * f.c - v * f.s, f.z + u * f.s + v * f.c];
    const rowYaw = Math.atan2(f.c, f.s); // rows run along the parcel's u axis
    if (f.kind === 'lavender' || f.kind === 'wheat' || f.kind === 'barley') {
      const lav = f.kind === 'lavender';
      const thin = density < 0.6 ? 1.35 : 1; // low tier: sparser tufts, the painted field carries the look
      const rowGap = (lav ? 1.6 : 1.25) * (lav ? 1 : thin), step = (lav ? 0.92 : 1.2) / dense * thin;
      const tones = TONES[f.kind];
      const m = lav ? 1.1 : 0.7;
      for (let v = -f.hd + m; v <= f.hd - m; v += rowGap) {
        for (let u = -f.hw + m + fr() * step; u <= f.hw - m; u += step) {
          const [x, z] = at(u + (fr() - 0.5) * 0.12, v + (fr() - 0.5) * (lav ? 0.1 : 0.3));
          P(f.kind === 'barley' ? 'wheat' : f.kind, x, z, fr() * 6.28, (lav ? 0.95 : 0.92) + fr() * 0.25, tones[Math.floor(fr() * tones.length)], { tx: (fr() - 0.5) * 0.08, tz: (fr() - 0.5) * 0.08 });
        }
      }
    } else if (f.kind === 'poppy') {
      const n = Math.round(f.hw * f.hd * 4 / 2.3 * dense);
      for (let k = 0; k < n; k++) {
        const [x, z] = at((fr() * 2 - 1) * (f.hw - 0.6), (fr() * 2 - 1) * (f.hd - 0.6));
        const mix = fr() < 0.13;
        P(fr() < 0.6 ? 'flower2' : 'flower1', x, z, fr() * 6.28, 0.85 + fr() * 0.45, mix ? pick(TONES.poppyMix) : pick(TONES.poppy));
      }
    } else if (f.kind === 'hay') {
      const n = 4 + Math.floor(fr() * 9), rowV = (fr() - 0.5) * f.hd;
      for (let k = 0; k < n; k++) {
        const u = -f.hw + 3 + (k + fr() * 0.6) * (2 * f.hw - 6) / n, v = rowV + (fr() - 0.5) * f.hd * 0.9;
        const [x, z] = at(u, v);
        P('haybale', x, z, fr() * 6.28, 0.92 + fr() * 0.16, pick(TONES.straw), { mineral: true, sink: 0.08 });
      }
    } else if (f.kind === 'orchard') {
      for (let v = -f.hd + 3; v <= f.hd - 2.5; v += 5.6) {
        for (let u = -f.hw + 3; u <= f.hw - 2.5; u += 6.4) {
          const [x, z] = at(u + (fr() - 0.5) * 0.6, v + (fr() - 0.5) * 0.6);
          P('apple', x, z, fr() * 6.28, 0.88 + fr() * 0.3, pick(TONES.leaves), { tx: (fr() - 0.5) * 0.05, tz: (fr() - 0.5) * 0.05 });
        }
      }
    }
  }
  for (const e of plan.edges.hedge) {
    const [p0, p1] = e.pts, L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.ceil(L / 1.5);
    const pts = []; for (let k = 0; k <= n; k++) pts.push([p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n]);
    hedgeLine(pts, e.seed, e.gate);
  }
  for (const e of plan.edges.wall) segments('drywall', e.pts[0], e.pts[1], 2.4, e.gate, e.seed);
  for (const e of plan.edges.fence) segments('fence', e.pts[0], e.pts[1], 3, e.gate, e.seed);

  // ---------------------------------------------------------------- walls along the road and across the moor / heath
  // the low tier (phones) keeps the road walls and drops the long walls across the moor and heath
  for (const w of density < 0.6 ? plan.roadWalls : plan.roadWalls.concat(plan.moorWalls)) {
    P('drywall', w.x, w.z, w.yaw - Math.PI / 2, 1, pick(TONES.stone), { tz: pitchAlong(w.x, w.z, w.yaw, w.len), mineral: true, sink: 0.12 });
  }
  // ---------------------------------------------------------------- hedgerows through the meadows
  for (const h of plan.meadowHedges) hedgeLine(h.pts, h.seed, true);

  // ---------------------------------------------------------------- landmark trees with a flower ring
  for (const t of plan.lone) {
    const tr = mulberry32(Math.round(t.x * 7 + t.z * 13));
    const tones = t.key === 'hawthorn' ? TONES.blossom : t.key === 'pine3' ? crownPal.pine : crownPal.green;
    P(t.key, t.x, t.z, tr() * 6.28, t.scale, tones[Math.floor(tr() * tones.length)], { tx: (tr() - 0.5) * 0.04, tz: (tr() - 0.5) * 0.04 });
    if (t.heath) continue;
    const ring = Math.round(14 * dense);
    for (let k = 0; k < ring; k++) {
      const a = tr() * 6.28, r = 5 + tr() * 7;
      P(tr() < 0.5 ? 'flower1' : 'flower4', t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, tr() * 6.28, 0.8 + tr() * 0.4, pick(TONES.ring));
    }
    if (tr() < 0.6) P('moss2', t.x + 3.2, t.z - 2.1, tr() * 6.28, 0.7 + tr() * 0.5, pick(TONES.stone), { mineral: true, tx: 0.2, tz: 0.1 });
  }
  // ---------------------------------------------------------------- copses
  for (const c of plan.copses) {
    const cr = mulberry32(c.seed);
    const keys = COPSE[c.type] || COPSE.green, tones = crownPal[c.type] || crownPal.green;
    for (let k = 0; k < c.n; k++) {
      const a = k * 2.39996 + cr() * 0.6, r = k === 0 ? 0 : c.r * Math.sqrt(k / c.n) * (0.75 + cr() * 0.35);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!open(x, z, -1) || standEllipse(x, z) < 1.05) continue;
      const key = keys[Math.floor(cr() * keys.length)];
      const scale = k === 0 ? 1.2 + cr() * 0.3 : 0.7 + cr() * 0.55;
      P(key === 'oak' && k ? 'broad3' : key, x, z, cr() * 6.28, key === 'oak' ? scale * 0.75 : scale, tones[Math.floor(cr() * tones.length)], { tx: (cr() - 0.5) * 0.06, tz: (cr() - 0.5) * 0.06 });
    }
    const fringe = Math.round((4 + c.n * 0.6) * dense);
    for (let k = 0; k < fringe; k++) {
      const a = cr() * 6.28, r = c.r * (0.9 + cr() * 0.4), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!open(x, z, -2)) continue;
      const fern = cr() < 0.35;
      P(fern ? 'fern1' : pick(['bush1', 'bush3', 'bushBerry']), x, z, cr() * 6.28, fern ? 0.9 + cr() * 0.5 : 0.8 + cr() * 0.6, pick(fern ? TONES.undergrowth : TONES.hedge));
    }
  }
  // ---------------------------------------------------------------- flower drifts (one colour each)
  for (const d of plan.drifts) {
    const dr = mulberry32(d.seed);
    const base = new THREE.Color(d.colour);
    const n = Math.round(Math.PI * d.rx * d.rz / 11 * dense);
    const kind = dr() < 0.45 ? 'flower1' : dr() < 0.7 ? 'flower4' : 'flower2';
    const cs = Math.cos(d.ang), sn = Math.sin(d.ang);
    const tint = [0, 0, 0];
    for (let k = 0; k < n; k++) {
      // denser in the middle, ragged at the rim
      const a = dr() * 6.28, r = Math.pow(dr(), 0.7) * (0.75 + 0.35 * noise2(Math.cos(a) * 2 + d.x, Math.sin(a) * 2));
      const u = Math.cos(a) * r * d.rx, v = Math.sin(a) * r * d.rz;
      const x = d.x + u * cs - v * sn, z = d.z + u * sn + v * cs;
      if (!open(x, z, -2.5)) continue;
      const k2 = 0.9 + dr() * 0.18;
      tint[0] = base.r * k2; tint[1] = base.g * k2; tint[2] = base.b * k2;
      P(dr() < 0.82 ? kind : 'flower1', x, z, dr() * 6.28, 0.8 + dr() * 0.5, tint.slice());
    }
  }
  // ---------------------------------------------------------------- heath: heather, gorse, bracken and stones
  const zw = [0, 0, 0, 0];
  const hr = mulberry32(5150);
  for (const [zx, zz, rx, rz] of [[1290, -160, 300, 250], [-1240, -400, 350, 270]]) {
    for (let z = zz - rz; z < zz + rz; z += 4.6) for (let x = zx - rx; x < zx + rx; x += 4.6) {
      const jx = x + hr() * 4.6, jz = z + hr() * 4.6, roll = hr();
      zoneWeights(jx, jz, zw);
      const w = Math.max(zw[1], zw[2]);
      if (w < 0.05) continue;
      const patch = smoothstep(-0.35, 0.45, noise2(jx / 26 + 5, jz / 26 - 9));
      if (roll > w * (0.18 + 0.62 * patch) * (0.5 + 0.5 * density)) continue;
      if (W.roadDist(jx, jz) < 4 || !open(jx, jz, -3) || standEllipse(jx, jz) < 1.0 || plan.fieldAt(jx, jz, 1)) continue;
      const kind = hr();
      if (kind < 0.72) {
        const n = 1 + Math.floor(hr() * 3);
        for (let k = 0; k < n; k++) P('heather', jx + (hr() - 0.5) * 2.4, jz + (hr() - 0.5) * 2.4, hr() * 6.28, 0.75 + hr() * 0.6, pick(TONES.heather), { tx: (hr() - 0.5) * 0.12, tz: (hr() - 0.5) * 0.12 });
      } else if (kind < 0.86) P('gorse', jx, jz, hr() * 6.28, 0.8 + hr() * 0.5, pick(TONES.gorse));
      else if (kind < 0.95) P('fern2', jx, jz, hr() * 6.28, 0.9 + hr() * 0.6, pick(TONES.bracken));
      else P(hr() < 0.6 ? 'moss2' : 'boulder2', jx, jz, hr() * 6.28, 0.6 + hr() * (zw[2] > 0.5 ? 1.6 : 0.9), pick(TONES.stone), { mineral: true, tx: (hr() - 0.5) * 0.4, tz: (hr() - 0.5) * 0.4 });
    }
  }
  // ---------------------------------------------------------------- the plants of the landmarks (data/landmarks.js)
  for (const l of LANDMARKS) {
    const lr = mulberry32(Math.round(l.x * 3 + l.z * 5) >>> 0);
    const F = { force: true };
    const ring = (n, r0, r1, ids, tones, s0 = 0.8, s1 = 1.3, o = F) => {
      for (let k = 0; k < n; k++) {
        const a = lr() * 6.28, r = r0 + lr() * (r1 - r0), x = l.x + Math.sin(a) * r, z = l.z + Math.cos(a) * r;
        if (W.roadDist(x, z) < 4 || W.heightAt(x, z) < 0.2) continue;
        P(ids[Math.floor(lr() * ids.length)], x, z, lr() * 6.28, s0 + lr() * (s1 - s0), tones[Math.floor(lr() * tones.length)], o);
      }
    };
    const stones = (n, r0, r1, ids, s0, s1) => ring(n, r0, r1, ids, TONES.stone, s0, s1, { force: true, mineral: true, tx: (lr() - .5) * .4, tz: (lr() - .5) * .3 });
    switch (l.kind) {
      case 'ancientTree':
        P('ancient', l.x, l.z, l.angle, 1, crownPal.green[1], { force: true, sink: 0.4 });
        ring(Math.round(40 * dense), 12, 26, ['flower1', 'flower4'], TONES.ring);
        ring(14, 9, 16, ['fern1', 'fern2'], TONES.undergrowth, 1, 1.6);
        stones(6, 7, 12, ['moss2', 'moss1'], 0.8, 1.6);
        break;
      case 'flowerValley': {
        const cols = ['poppy', 'buttercup', 'cornflower', 'daisy', 'lupine', 'clover'].map((k) => new THREE.Color(MEADOW_COLOURS[k]).toArray());
        const n = Math.round(Math.PI * l.r * l.r / 7 * dense);
        for (let k = 0; k < n; k++) {
          const a = lr() * 6.28, r = Math.sqrt(lr()) * l.r, x = l.x + Math.sin(a) * r, z = l.z + Math.cos(a) * r;
          if (W.roadDist(x, z) < 4 || W.isReserved(x, z, 1)) continue;
          const band = Math.floor(((noise2(x / 38 + 4, z / 38) + 1) * 3 + (x - l.x) / 40) + 60) % cols.length;
          const c = cols[lr() < 0.85 ? band : Math.floor(lr() * cols.length)];
          P(lr() < 0.5 ? 'flower1' : lr() < 0.6 ? 'flower4' : 'flower2', x, z, lr() * 6.28, 0.85 + lr() * 0.55, c, F);
        }
        ring(9, l.r * 0.85, l.r * 1.05, ['birch'], crownPal.silver, 0.8, 1.2);
        break;
      }
      case 'swingTree':
        P('oak', l.x, l.z, l.angle + 1.6, 1.15, crownPal.green[0], F);
        ring(Math.round(18 * dense), 6, 11, ['flower1', 'flower4'], TONES.ring);
        break;
      case 'fallenGiant':
        P('fallen1', l.x, l.z, l.angle, 2.7, TONES.stone[0], { force: true, mineral: true });
        P('logMoss', l.x + 6, l.z - 3, l.angle + 0.4, 1.8, TONES.stone[1], { force: true, mineral: true });
        P('stump', l.x - 7, l.z + 2, 0, 2.2, TONES.stone[0], { force: true, mineral: true });
        ring(5, 4, 11, ['dead3', 'dead2'], TONES.blossom, 0.55, 0.8);
        ring(10, 2, 9, ['mushSmall1', 'fern1'], TONES.undergrowth, 0.8, 1.3);
        break;
      case 'snags':
        ring(6, 0, l.r, ['dead1', 'dead3', 'dead2'], TONES.blossom, 0.9, 1.4);
        stones(4, 2, l.r, ['moss2'], 0.6, 1.0);
        ring(6, 0, l.r, ['log1', 'stump'], TONES.stone, 0.9, 1.3, { force: true, mineral: true });
        break;
      case 'rockfall':
        for (let k = 0; k < 13; k++) {
          const a = lr() * 6.28, r = Math.sqrt(lr()) * 6, x = l.x + Math.sin(a) * r, z = l.z + Math.cos(a) * r;
          P(['boulder3', 'boulder4', 'boulder5'][k % 3], x, z, lr() * 6.28, 0.7 + (1 - r / 6) * 1.1 + lr() * 0.3, TONES.stone[k % 4], { force: true, mineral: true, tx: (lr() - .5) * .5, tz: (lr() - .5) * .5 });
        }
        break;
      case 'charcoalCamp':
        ring(7, 8, 15, ['stump', 'log1'], TONES.stone, 0.9, 1.3, { force: true, mineral: true });
        ring(3, 13, 17, ['dead1', 'dead3'], TONES.blossom, 0.8, 1.1);
        break;
      case 'quarry': {
        const fx = Math.sin(l.angle), fz = Math.cos(l.angle);
        for (let k = 0; k < 6; k++) P(['boulder3', 'boulder4'][k % 2], l.x + fx * (3 + lr() * 2) + (lr() - .5) * 5, l.z + fz * (3 + lr() * 2) + (lr() - .5) * 5, lr() * 6.28, 0.9 + lr() * 0.7, TONES.stone[k % 4], { force: true, mineral: true });
        break;
      }
      case 'chapelRuin':
        P('boulder3', l.x + Math.sin(l.angle) * 6.6, l.z + Math.cos(l.angle) * 6.6, lr() * 6, 1.1, TONES.stone[0], { force: true, mineral: true });
        stones(8, 9, 16, ['moss2', 'moss1'], 0.6, 1.2);
        ring(10, 10, 17, ['bush1', 'bushBerry', 'fern1'], TONES.hedge, 0.8, 1.3);
        break;
      case 'tor': case 'stoneCircle': case 'trilithons': case 'dolmen': case 'cairn':
        ring(Math.round((l.kind === 'cairn' ? 10 : 30) * dense), l.r * 0.5, l.r * 1.4, ['heather', 'heather', 'fern2', 'flower1'], TONES.heather, 0.7, 1.2);
        break;
      case 'wayShrine': case 'bench':
        ring(6, 1.5, 4, ['flower1', 'flower4'], TONES.ring, 0.7, 1.1);
        break;
      case 'apiary':
        for (let k = 0; k < 60 * dense; k++) {
          const u = (lr() - 0.5) * 16, v = 4 + lr() * 6, a = l.angle;
          P('lavender', l.x + u * Math.cos(a) + v * Math.sin(a), l.z - u * Math.sin(a) + v * Math.cos(a), lr() * 6.28, 0.9 + lr() * 0.3, TONES.lavender[k % 5], F);
        }
        break;
      case 'hermitCottage':
        ring(12, 6, 12, ['flower1', 'bushBerry', 'fern1'], TONES.ring, 0.7, 1.1);
        break;
      case 'tarn': case 'cragFalls': {
        const pool = poolOf(W, l);
        if (!pool) break;
        for (let k = 0; k < 7; k++) {
          const a = lr() * 6.28, r = lr() * pool.r * 0.75;
          P(lr() < 0.5 ? 'lily1' : 'lily2', pool.x + Math.sin(a) * r, pool.z + Math.cos(a) * r, lr() * 6.28, 0.8 + lr() * 0.4, TONES.leaves[k % 4], { force: true, y: pool.level + 0.08, sink: 0 });
        }
        for (let k = 0; k < 26; k++) {
          const a = lr() * 6.28, r = pool.r * (0.82 + lr() * 0.14);
          P(lr() < 0.5 ? 'reed1' : 'reed2', pool.x + Math.sin(a) * r, pool.z + Math.cos(a) * r, lr() * 6.28, 0.8 + lr() * 0.4, TONES.undergrowth[k % 4], { force: true, y: pool.level - 0.25, sink: 0 });
        }
        break;
      }
      default: break;
    }
  }
  return { counts, planMs: plan.ms, fields: plan.fields.length };
}
