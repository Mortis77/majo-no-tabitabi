// The countryside between the story places, composed instead of uniform (map round, 2026-11-22).
// One deterministic plan, shared by the flora scatter (crops, hedges, walls, copses, lone trees, flower drifts, heath),
// the painted far fields (fields.js) and the ambient herds (world/life/herds.js):
//   * zones   farmland around the hometown and before the walled city, the heather moor east of the wilds, the rocky
//             heath on the high pass, the open wilds; everything else is meadow;
//   * fields  rotated parcels (lavender, wheat, barley, hay with bales, poppies, orchards) with hedges / dry-stone walls /
//             rail fences on their edges, lanes between them;
//   * walls   dry-stone walls along the road through the moor, the heath and the farmland, and across the moor;
//   * hedges  hedgerows running away from the road through the meadows (field boundaries the anime keeps in frame);
//   * lone    landmark trees on crests; copses (small groves of one community); flower drifts of one colour each.
// Nothing is planned inside the story places, on a road, near an anchor or a wayside, or in the crater-lake survey.
import { mulberry32, noise2, smoothstep } from '../../core/util.js';
import { CITY, JOURNEY_ANCHORS, JOURNEY_POI, ROAD_ACROSS } from '../../data/journey-map.js';
import { WAYSIDES } from '../../data/waysides.js';
import { insideTrialSurvey } from '../trial-lake.js';
import { farmWeight } from '../terrain/paddyLayout.js';
import { standEllipse } from './forest-stands.js';
import { LANDMARKS, landmarkAt } from '../../data/landmarks.js';

// [type, cx, cz, rx, rz]
export const ZONES = [
  ['farm', 2215, 20, 470, 430],
  ['farm', -1880, -270, 330, 230],
  ['moor', 1290, -160, 290, 240],
  ['heath', -1240, -400, 340, 260],
  ['wild', 180, -208, 250, 210],
];
const ZI = { farm: 0, moor: 1, heath: 2, wild: 3 };

/** Zone weights at (x,z): [farm, moor, heath, wild] in 0..1 (meadow = what is left). Edges wander with noise. */
export function zoneWeights(x, z, out = [0, 0, 0, 0]) {
  out[0] = out[1] = out[2] = out[3] = 0;
  const wob = 0.12 * noise2(x / 140 + 7, z / 140 - 3);
  for (const [type, cx, cz, rx, rz] of ZONES) {
    const dx = (x - cx) / rx, dz = (z - cz) / rz;
    if (dx * dx + dz * dz > 1.5) continue;
    const w = 1 - smoothstep(0.72, 1.02, Math.sqrt(dx * dx + dz * dz) + wob);
    const k = ZI[type];
    if (w > out[k]) out[k] = w;
  }
  return out;
}

// Pastel, painterly meadow colours (the anime's flower fields), chosen per region from east to west.
export const MEADOW_COLOURS = {
  buttercup: 0xf0d050, daisy: 0xf2efe4, poppy: 0xe0644c, cornflower: 0x7d9fe2, lupine: 0xa88cd8,
  clover: 0xe9a6c0, hawkweed: 0xeb9c50, cream: 0xf3e3b0,
};
const REGION_FLOWERS = [
  // [x from, palette]
  [1700, ['buttercup', 'daisy', 'clover', 'cream']],
  [900, ['poppy', 'buttercup', 'daisy', 'cornflower']],
  [-200, ['cornflower', 'daisy', 'hawkweed', 'poppy', 'buttercup']],
  [-1000, ['lupine', 'clover', 'daisy', 'buttercup']],
  [-1600, ['lupine', 'daisy', 'cornflower']],
  [-9999, ['poppy', 'clover', 'cream', 'lupine']],
];
export function regionFlowers(x) {
  for (const [from, list] of REGION_FLOWERS) if (x >= from) return list;
  return REGION_FLOWERS[REGION_FLOWERS.length - 1][1];
}

let PLAN = null;

/** The plan (built once per world; deterministic). */
export function countryPlan(W) {
  if (PLAN) return PLAN;
  const t0 = performance.now();
  const zw = [0, 0, 0, 0];
  const anchors = Object.values(JOURNEY_ANCHORS);
  const pois = ['hometown', 'forest', 'trial', 'farewell', 'practice', 'gate', 'inn', 'roof', 'lookout', 'bellkeep'].map((k) => JOURNEY_POI[k]).filter(Boolean);
  /** may something be built / planted at (x,z)? pad widens every clearance */
  function open(x, z, pad = 0) {
    if (Math.abs(x) > 2400 || insideTrialSurvey(x, z)) return false;
    const h = W.heightAt(x, z);
    if (h < 2.2) return false;
    if (W.roadDist(x, z) < 5 + pad || W.riverDist(x, z) < 20 + pad) return false;
    if (W.isReserved(x, z, 2 + pad)) return false;
    if (Math.hypot(x - CITY.x, z - CITY.z) < 205 + pad) return false;
    for (const p of pois) if (Math.hypot(x - p.x, z - p.z) < p.r + 28 + pad) return false;
    for (const a of anchors) if (Math.abs(x - a.x) < 14 + pad && Math.abs(z - a.z) < 14 + pad) return false;
    for (const w of WAYSIDES) if (Math.abs(x - w.x) < w.radius + 10 + pad && Math.abs(z - w.z) < w.radius + 10 + pad) return false;
    if (landmarkAt(x, z, 4 + pad)) return false;
    return true;
  }

  // ---------------------------------------------------------------- field parcels
  const fields = [], fieldBins = new Map();
  const binKey = (bx, bz) => bx * 4096 + bz;
  const FB = 64;
  function addFieldBins(f) {
    const r = Math.hypot(f.hw, f.hd) + 2;
    for (let bx = Math.floor((f.x - r) / FB); bx <= Math.floor((f.x + r) / FB); bx++)
      for (let bz = Math.floor((f.z - r) / FB); bz <= Math.floor((f.z + r) / FB); bz++) {
        const k = binKey(bx, bz); let l = fieldBins.get(k); if (!l) fieldBins.set(k, (l = [])); l.push(f);
      }
  }
  /** the parcel at (x,z) (pad: metres around it), or null */
  function fieldAt(x, z, pad = 0) {
    const l = fieldBins.get(binKey(Math.floor(x / FB), Math.floor(z / FB)));
    if (!l) return null;
    for (const f of l) {
      const dx = x - f.x, dz = z - f.z, u = dx * f.c + dz * f.s, v = -dx * f.s + dz * f.c;
      if (Math.abs(u) < f.hw + pad && Math.abs(v) < f.hd + pad) return f;
    }
    return null;
  }
  const edges = { hedge: [], wall: [], fence: [] };
  const FIELD_KINDS = [
    // kind, weight east, weight west
    ['wheat', 0.27, 0.2], ['lavender', 0.16, 0.3], ['hay', 0.18, 0.12], ['barley', 0.12, 0.08],
    ['orchard', 0.12, 0.16], ['poppy', 0.15, 0.14],
  ];
  const farmZones = [[2215, 20, 470, 430, 0.32, 54, 36, 1], [-1880, -270, 330, 230, -0.22, 50, 34, 2]];
  // every farmstead landmark works a patchwork of its own (weights of the eastern farmland)
  for (const l of LANDMARKS) if (l.kind === 'farmstead') farmZones.push([l.x, l.z, 170, 140, l.angle, 44, 30, 1, l.id]);
  for (const [zk, [zx, zz, rx, rz, ang, pw, pd, zid, owner]] of farmZones.entries()) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const rnd = mulberry32(7717 + zid * 101 + Math.round(zx));
    const taken = new Set();
    const R = Math.max(rx, rz);
    const ni = Math.ceil(R / pw) + 1, nj = Math.ceil(R / pd) + 1;
    const cells = [];
    for (let j = -nj; j <= nj; j++) for (let i = -ni; i <= ni; i++) cells.push([i, j]);
    for (const [i, j] of cells) {
      const u = (i + 0.5) * pw + (rnd() - 0.5) * 6, v = (j + 0.5) * pd + (rnd() - 0.5) * 5;
      const x = zx + u * c - v * s, z = zz + u * s + v * c;
      const e = Math.hypot((x - zx) / rx, (z - zz) / rz);
      const pick = rnd(), shrink = rnd();
      if (e > 1) continue;
      let hw = pw / 2 - 2.4 - shrink * 3.5, hd = pd / 2 - 2.2 - shrink * 2.5;
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        ok = true;
        let lo = 1e9, hi = -1e9;
        for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) {
          const px = x + (a * hw) * c - (b * hd) * s, pz = z + (a * hw) * s + (b * hd) * c;
          if (!open(px, pz, 1.5) || standEllipse(px, pz) < 1.12) { ok = false; break; }
          const h = W.heightAt(px, pz);
          const slope = W.slopeAt(px, pz);
          if (slope > 0.3 || farmWeight(px, pz, h, slope, W.roadDist(px, pz), W.riverDist(px, pz)) > 0) ok = false;
          lo = Math.min(lo, h); hi = Math.max(hi, h);
        }
        if (ok && hi - lo > 9) ok = false;
        if (!ok) { hw *= 0.72; hd *= 0.72; }
      }
      if (!ok || hw < 9 || hd < 7) continue;
      // kind by weight (west zone: more lavender)
      let acc = 0, kind = 'hay';
      const tot = FIELD_KINDS.reduce((a, k) => a + k[zid], 0);
      for (const k of FIELD_KINDS) { acc += k[zid] / tot; if (pick < acc) { kind = k[0]; break; } }
      const f = { id: fields.length, zone: zk, owner: owner || null, kind, x, z, c, s, ang, hw, hd, seed: Math.floor(rnd() * 1e9), i, j };
      fields.push(f); addFieldBins(f); taken.add(i + ',' + j);
    }
    // every zone has some lavender and some wheat (the look the player remembers)
    for (const want of ['lavender', 'wheat']) {
      const zf = fields.filter((f) => f.zone === zk);
      if (zf.some((f) => f.kind === want) || !zf.length) continue;
      const f = zf.filter((q) => q.kind !== 'orchard').sort((a, b) => Math.hypot(a.x - zx, a.z - zz) - Math.hypot(b.x - zx, b.z - zz))[0];
      if (f) f.kind = want;
    }
    // boundaries: each parcel decides its +u and +v edges, and -u / -v where it has no neighbour
    for (const f of fields) {
      if (f.zone !== zk) continue;
      const er = mulberry32(f.seed ^ 0x5bd1);
      const sides = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (const [du, dv] of sides) {
        const own = du > 0 || dv > 0 || !taken.has((f.i + du) + ',' + (f.j + dv));
        const roll = er();
        if (!own) continue;
        let type = f.kind === 'orchard' ? 'fence' : roll < (zid === 2 ? 0.3 : 0.42) ? 'hedge' : roll < (zid === 2 ? 0.62 : 0.6) ? 'wall' : roll < 0.7 ? 'fence' : null;
        if (!type) continue;
        // edge line in world space, 1.6 m outside the parcel
        const off = 1.6;
        const u0 = du ? du * (f.hw + off) : -f.hw, u1 = du ? du * (f.hw + off) : f.hw;
        const v0 = dv ? dv * (f.hd + off) : -f.hd, v1 = dv ? dv * (f.hd + off) : f.hd;
        const p0 = [f.x + u0 * f.c - v0 * f.s, f.z + u0 * f.s + v0 * f.c], p1 = [f.x + u1 * f.c - v1 * f.s, f.z + u1 * f.s + v1 * f.c];
        edges[type].push({ pts: [p0, p1], seed: f.seed + du * 3 + dv * 7, gate: f.kind !== 'orchard' && er() < 0.5 });
      }
    }
  }

  // ---------------------------------------------------------------- dry-stone walls along the road (moor, heath, farmland)
  const roadWalls = [];
  {
    let sAcc = 0;
    for (let k = 1; k < ROAD_ACROSS.length; k++) {
      const [x0, z0] = ROAD_ACROSS[k - 1], [x1, z1] = ROAD_ACROSS[k];
      const L = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / L, tz = (z1 - z0) / L;
      for (let d = 1.2; d < L; d += 2.4) {
        const s = sAcc + d;
        const px = x0 + tx * d, pz = z0 + tz * d;
        zoneWeights(px, pz, zw);
        const zone = Math.max(zw[0], zw[1], zw[2]);
        if (zone < 0.5) continue;
        for (const side of [-1, 1]) {
          const run = noise2(s / 70 + side * 13.1, side * 3.7);
          if (run < 0.05) continue;
          const off = 6.3 + 0.6 * noise2(s / 25, side);
          const cx = px - tz * off * side, cz = pz + tx * off * side;
          if (W.roadDist(cx, cz) < 5.2 || !open(cx, cz, -1.5) || standEllipse(cx, cz) < 1.0) continue;
          roadWalls.push({ x: cx, z: cz, yaw: Math.atan2(tx, tz), len: 2.4 });
        }
      }
      sAcc += L;
    }
  }
  // walls across the moor and the heath: long gently curving lines that divide the hill pasture
  const moorWalls = [];
  const lineRnd = mulberry32(90211);
  const crossLines = [[1290, -160, 290, 240, 9], [-1240, -400, 340, 260, 7], [180, -208, 250, 210, 3]];
  for (const [zx, zz, rx, rz, n] of crossLines) {
    for (let k = 0; k < n; k++) {
      let x = zx + (lineRnd() - 0.5) * rx * 1.4, z = zz + (lineRnd() - 0.5) * rz * 1.4;
      let head = lineRnd() * Math.PI * 2;
      const steps = Math.floor(50 + lineRnd() * 70);
      let miss = 0;
      for (let st = 0; st < steps; st++) {
        head += 0.035 * noise2(x / 60 + k, z / 60 - k);
        const nx = x + Math.sin(head) * 2.4, nz = z + Math.cos(head) * 2.4;
        const mx = (x + nx) / 2, mz = (z + nz) / 2;
        if (open(mx, mz, 0) && standEllipse(mx, mz) > 1.05 && !fieldAt(mx, mz, 3) && Math.abs(W.heightAt(nx, nz) - W.heightAt(x, z)) < 1.4) {
          moorWalls.push({ x: mx, z: mz, yaw: head, len: 2.4 }); miss = 0;
        } else if (++miss > 6) break;
        x = nx; z = nz;
      }
    }
  }

  // ---------------------------------------------------------------- hedgerows through the meadows, away from the road
  const meadowHedges = [];
  {
    const hr = mulberry32(55117);
    let next = 90;
    let sAcc = 0;
    for (let k = 1; k < ROAD_ACROSS.length; k++) {
      const [x0, z0] = ROAD_ACROSS[k - 1], [x1, z1] = ROAD_ACROSS[k];
      const L = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / L, tz = (z1 - z0) / L;
      while (next < sAcc + L) {
        const d = next - sAcc;
        const px = x0 + tx * d, pz = z0 + tz * d;
        next += 150 + hr() * 140;
        zoneWeights(px, pz, zw);
        if (zw[0] > 0.4 || zw[1] > 0.5 || zw[2] > 0.5) continue;
        for (const side of [-1, 1]) {
          if (hr() < 0.3) continue;
          let head = Math.atan2(-tz * side, tx * side) + (hr() - 0.5) * 0.8; // away from the road
          let x = px - tz * side * 11, z = pz + tx * side * 11;
          const pts = [];
          const steps = Math.floor((70 + hr() * 150) / 1.6);
          for (let st = 0; st < steps; st++) {
            head += 0.02 * noise2(x / 50 + k * 3, z / 50);
            x += Math.sin(head) * 1.6; z += Math.cos(head) * 1.6;
            if (!open(x, z, 0) || standEllipse(x, z) < 1.02 || fieldAt(x, z, 2)) { if (pts.length > 8) break; else continue; }
            pts.push([x, z]);
          }
          if (pts.length > 12) meadowHedges.push({ pts, seed: Math.floor(hr() * 1e9) });
        }
      }
      sAcc += L;
    }
  }

  // ---------------------------------------------------------------- landmark trees, copses, flower drifts
  const lone = [], copses = [], drifts = [];
  const lr = mulberry32(31337);
  for (let gz = -1000; gz < 560; gz += 150) for (let gx = -2400; gx < 2400; gx += 150) {
    const x = gx + lr() * 150, z = gz + lr() * 150, roll = lr(), sc = lr();
    if (roll > 0.5 || !open(x, z, 6) || standEllipse(x, z) < 1.3 || fieldAt(x, z, 10)) continue;
    const h = W.heightAt(x, z);
    let around = 0;
    for (let a = 0; a < 4; a++) around += W.heightAt(x + Math.sin(a * 1.57) * 28, z + Math.cos(a * 1.57) * 28);
    if (h < around / 4 - 0.6 || W.slopeAt(x, z) > 0.28) continue; // on rises, not in hollows
    zoneWeights(x, z, zw);
    const heath = zw[2] > 0.5 || zw[1] > 0.6;
    lone.push({ x, z, scale: heath ? 0.9 + sc * 0.4 : 1.15 + sc * 0.55, key: heath ? (sc < 0.5 ? 'hawthorn' : 'pine3') : 'oak', heath });
  }
  const cr = mulberry32(4242);
  for (let gz = -1000; gz < 560; gz += 105) for (let gx = -2400; gx < 2400; gx += 105) {
    const x = gx + cr() * 105, z = gz + cr() * 105, roll = cr(), n = 5 + Math.floor(cr() * 10), comm = cr();
    zoneWeights(x, z, zw);
    const p = zw[0] > 0.5 ? 0.07 : zw[1] > 0.5 ? 0.12 : zw[2] > 0.5 ? 0.2 : zw[3] > 0.5 ? 0.22 : 0.3;
    if (roll > p || !open(x, z, 6) || standEllipse(x, z) < 1.2 || fieldAt(x, z, 14)) continue;
    const type = zw[2] > 0.5 ? (comm < 0.6 ? 'pine' : 'silver') : comm < 0.34 ? 'silver' : comm < 0.84 ? 'green' : comm < 0.93 ? 'gold' : 'wine';
    copses.push({ x, z, n, r: 7 + n * 1.25, type, seed: Math.floor(cr() * 1e9) });
  }
  const dr = mulberry32(80085);
  for (let gz = -1000; gz < 560; gz += 58) for (let gx = -2400; gx < 2400; gx += 58) {
    const x = gx + dr() * 58, z = gz + dr() * 58, roll = dr(), pick = dr(), rx = 12 + dr() * 30, rz = 7 + dr() * 16, ang = dr() * Math.PI;
    zoneWeights(x, z, zw);
    if (zw[1] > 0.5 || zw[2] > 0.6) continue; // heather country instead
    const p = zw[0] > 0.5 ? 0.12 : 0.34;
    if (roll > p || !open(x, z, 2) || standEllipse(x, z) < 1.05 || fieldAt(x, z, 4)) continue;
    const list = regionFlowers(x);
    drifts.push({ x, z, rx, rz, ang, colour: MEADOW_COLOURS[list[Math.floor(pick * list.length)]], seed: Math.floor(dr() * 1e9) });
  }

  PLAN = {
    fields, fieldAt, edges, roadWalls, moorWalls, meadowHedges, lone, copses, drifts, open,
    ms: Math.round(performance.now() - t0),
  };
  return PLAN;
}
