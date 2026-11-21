// Deterministic placement: believable clusters in and around every settlement, market goods in 万灯镇, hay and carts
// in 朝颜村, firework barrels at festivals and camps, boulders on slopes above roads, logs at the river, iron at 星晶野,
// sparse scatter in the wild. Produces RECORDS only (data); props.js turns the ones near the player into live props.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { mulberry32, distToPolyline } from '../core/util.js';
import { CATALOG } from './catalog.js';
import { getKit } from './models.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
// layout size: a sculpted kit (models.js) keeps the footprint of the model it replaced, so the layout does not move
const size = (t) => { const k = getKit(t, CATALOG[t]); return k.layoutSize || k.size; };
let R = Math.random;
const pick = (a) => a[Math.floor(R() * a.length) % a.length];
const rr = (a, b) => a + (b - a) * R();

/** Half height of a type once rotated by Euler rot. */
function halfH(t, rot) {
  const s = size(t);
  if (!rot || (!rot[0] && !rot[2])) return s.y / 2;
  _m.makeRotationFromEuler(_e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0));
  const e = _m.elements;   // column-major: row 1 = e[1], e[5], e[9]
  return 0.5 * (Math.abs(e[1]) * s.x + Math.abs(e[5]) * s.y + Math.abs(e[9]) * s.z);
}
function foot(t) { const s = size(t); return Math.max(s.x, s.z) * 0.5; }

// ---- cluster templates: items { t, x, z, yaw?, on?, tilt? } in a local frame ----------------------------------------
function row(types, gap = 0.1, z = 0) {
  let w = 0; for (const t of types) w += size(t).x + gap;
  w -= gap;
  let x = -w / 2; const out = [];
  for (const t of types) { const sx = size(t).x; out.push({ t, x: x + sx / 2, z, yaw: rr(-0.08, 0.08) }); x += sx + gap; }
  return out;
}
function scatter(types, r, minGap = 0.15) {
  const out = [];
  for (const t of types) {
    const f = foot(t);
    for (let k = 0; k < 14; k++) {
      const a = R() * 6.283, d = Math.sqrt(R()) * r;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (out.every((o) => Math.hypot(o.x - x, o.z - z) > f + foot(o.t) + minGap)) { out.push({ t, x, z, yaw: R() * 6.283 }); break; }
    }
  }
  return out;
}
const TPL = {
  crates() {
    const a = row([pick(['crate', 'crate', 'crate_large']), pick(['crate', 'crate_small', 'crate'])], 0.06);
    if (R() < 0.65) a.push({ t: pick(['crate', 'crate_small']), x: a[0].x + rr(-0.05, 0.05), z: 0, on: 0, yaw: rr(-0.2, 0.2) });
    if (R() < 0.4) a.push({ t: 'barrel', x: a[1].x + 0.9, z: 0.35 });
    return a;
  },
  barrels() {
    const n = 2 + Math.floor(R() * 3), out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; out.push({ t: pick(['barrel', 'barrel', 'barrel_large']), x: Math.cos(a) * 0.5 * (n > 2), z: Math.sin(a) * 0.5 * (n > 2) + (n === 2 ? i * 0.9 - 0.45 : 0), yaw: R() * 6 }); }
    return out;
  },
  market() {
    const goods = ['crate_apples', 'crate_carrots', 'basket', 'basket_mushrooms', 'barrel_fish', 'barrel_apples', 'sack', 'pumpkin', 'crate_apples'];
    const a = row([pick(goods), pick(goods), pick(goods), pick(goods)], 0.12, 0.5);
    const b = row(['crate', pick(['crate', 'barrel_fish', 'sack'])], 0.1, -0.5);
    b.push({ t: 'crate_small', x: b[0].x, z: -0.5, on: a.length, yaw: rr(-0.2, 0.2) });
    if (R() < 0.5) b.push({ t: pick(['apple', 'fish']), x: rr(-0.8, 0.8), z: 1.2 });
    return a.concat(b).map((o, i) => (o.on != null ? { ...o, on: a.length } : o));
  },
  hay() {
    const a = row(['hay', 'hay'], 0.05);
    if (R() < 0.6) a.push({ t: 'hay', x: rr(-0.25, 0.25), z: 0, on: 0, yaw: rr(-0.3, 0.3) });
    a.push({ t: 'hay_sheaf', x: rr(-1.4, 1.4), z: 1.1 + R() * 0.4 });
    if (R() < 0.5) a.push({ t: 'hay_sheaf', x: rr(-1.4, 1.4), z: -1.2 });
    return a;
  },
  pottery() { const n = 3 + Math.floor(R() * 4); return scatter(Array.from({ length: n }, () => pick(['pot', 'pot', 'vase', 'jar', 'jar_small', 'water_jar'])), 1.3, 0.06); },
  farm() { return scatter(['bucket', pick(['wheelbarrow', 'sack']), 'sack', pick(['basket', 'basket_mushrooms']), 'pumpkin', 'pumpkin'], 2.2); },
  pumpkins() { return scatter(Array.from({ length: 4 + Math.floor(R() * 4) }, () => 'pumpkin'), 2.4, 0.2); },
  logs() {
    const n = 2 + Math.floor(R() * 2), w = size('log').x + 0.04;
    const out = [];
    for (let i = 0; i < n; i++) out.push({ t: 'log', x: (i - (n - 1) / 2) * w, z: rr(-0.1, 0.1), yaw: rr(-0.04, 0.04) });
    if (n === 3 || R() < 0.4) out.push({ t: 'log', x: out[0].x + w / 2, z: 0, on: 0 });
    if (R() < 0.6) out.push({ t: 'log_short', x: w * 2.2, z: 0.5, yaw: R() * 6 });
    return out;
  },
  woodpile() { return [{ t: 'planks', x: 0, z: 0 }, { t: 'log_short', x: 1.2, z: 0.3, yaw: 1.3 }, { t: 'log_short', x: 1.25, z: -0.5, yaw: 1.5 }, { t: 'plank', x: 0, z: 0, on: 0, yaw: 0.2 }, { t: 'ladder', x: -1.3, z: 0, yaw: 0.1, tilt: [-Math.PI / 2, 0] }]; },
  camp() {
    const out = [{ t: 'firework', x: 0, z: 0 }, { t: 'firework', x: 0.72, z: 0.15 }];
    if (R() < 0.6) out.push({ t: 'firework', x: 0.35, z: -0.6 });
    out.push({ t: 'crate', x: -1.1, z: 0.1, yaw: 0.3 }, { t: 'crate_small', x: -1.1, z: 0.1, on: out.length, yaw: 0.6 });
    out.push({ t: pick(['brazier', 'campfire']), x: 0.2, z: 2.6, lit: true }, { t: 'barrel', x: -1.4, z: 1.4 });
    return out.map((o, i) => (o.on != null ? { ...o, on: out.length - 4 } : o));
  },
  festival() {
    const out = [{ t: 'firework', x: -0.38, z: 0 }, { t: 'firework', x: 0.38, z: 0 }, { t: 'firework', x: 0, z: 0.66 }];
    if (R() < 0.5) out.push({ t: 'firework', x: 0, z: -0.66 });
    out.push({ t: 'lantern_post', x: -2.4, z: 0.4, yaw: Math.PI }, { t: 'lantern_post', x: 2.4, z: 0.4 }, { t: 'bench', x: 0, z: 2.2 });
    return out;
  },
  iron() {
    const out = [{ t: 'iron_box', x: 0, z: 0, yaw: R() }, { t: 'iron_ball', x: 1.0, z: 0.4 }, { t: 'iron_ball', x: -0.9, z: 0.6 }];
    if (R() < 0.5) out.push({ t: 'iron_box', x: 0, z: 0, on: 0, yaw: R() });
    if (R() < 0.5) out.push({ t: 'iron_ball', x: 0.4, z: -1.0 });
    return out;
  },
  library() { return [{ t: 'table_low', x: 0, z: 0 }, { t: 'book', x: -0.2, z: 0, on: 0 }, { t: 'scroll', x: 0.25, z: 0.05, on: 0, yaw: 0.3 }, { t: 'book_big', x: 0.8, z: 0.4 }, { t: 'stool', x: 0, z: 0.85 }]; },
  seat() { return [{ t: 'bench', x: 0, z: 0 }, { t: 'stool', x: 1.3, z: 0.3 }].concat(R() < 0.5 ? [{ t: 'stool', x: -1.3, z: 0.25 }] : []); },
  snow() { return scatter(['snowball', 'snowball', pick(['snowball', 'ice_block']), 'ice_block'], 2.4, 0.2); },
  offering() { return [{ t: 'water_jar', x: 0, z: 0 }, { t: 'bottle_sake', x: 0.55, z: 0.1 }, { t: 'bottle_sake', x: 0.7, z: -0.15 }, { t: 'jar_small', x: -0.55, z: 0.15 }]; },
  apples() { return [{ t: 'basket', x: 0, z: 0 }].concat(scatter(['apple', 'apple', 'apple', 'apple'], 1.4).map((o) => ({ ...o, x: o.x + 0.4, z: o.z + 0.4 }))); },
  cartstop() { return [{ t: 'cart', x: 0, z: 0, yaw: R() * 6 }, { t: 'sack', x: 1.3, z: 0.6 }, { t: 'crate', x: 1.3, z: -0.5 }]; },
  water() { return [{ t: 'water_jar', x: 0, z: 0 }, { t: 'water_jar', x: 0.8, z: 0.15 }, { t: 'bucket', x: 0.4, z: 0.75 }]; },
};
const SINGLE = (t, extra) => () => [{ t, x: 0, z: 0, ...extra }];

// ---- free-spot finder -------------------------------------------------------------------------------------------------
let taken = [];
function freeAt(x, z, rad, o = {}) {
  const W = G.world;
  const h = W.heightAt(x, z);
  if (h < (o.minH ?? 0.8) || W.isWater(x, z)) return false;
  if (W.slopeAt(x, z) > (o.maxSlope ?? 0.3)) return false;
  if (W.roadDist(x, z) < (o.road ?? 3.6) + rad) return false;
  if (W.riverDist(x, z) < (o.river ?? 6) + rad) return false;
  for (const k in W.ANCHORS) { const a = W.ANCHORS[k]; if (Math.hypot(x - a.x, z - a.z) < 4.2 + rad) return false; }
  for (const s of W.STONE_LANTERNS) if (Math.hypot(x - s.x, z - s.z) < 3.2 + rad) return false;
  for (const b of W.BRIDGES) if (Math.hypot(x - b.x, z - b.z) < b.len / 2 + 4 + rad) return false;
  if (o.notReserved && W.isReserved(x, z, rad + 1)) return false;
  for (let i = 0; i < taken.length; i++) { const t = taken[i]; if (Math.hypot(x - t.x, z - t.z) < t.r + rad + (o.gap ?? 1.2)) return false; }
  // buildings, trees, rocks: nothing registered with G.world may overlap
  _p.set(x, h, z);
  W.resolveCollisions(_p, rad + 0.3, 2.2);
  if (Math.abs(_p.x - x) + Math.abs(_p.z - z) > 1e-3) return false;
  // flat-topped platforms well above the ground (roofs, decks) are not floors
  const g = W.groundAt(x, z, h + 0.8);
  if (g - h > 1.4) return false;
  return true;
}

function clusterRadius(items) { let r = 0.5; for (const it of items) r = Math.max(r, Math.hypot(it.x, it.z) + foot(it.t)); return r; }

/** Turn a template at (x,z,yaw) into records. */
function emit(out, items, cx, cz, yaw, o = {}) {
  const W = G.world;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const recs = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!CATALOG[it.t]) continue;
    const lx = it.x, lz = it.z;
    const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
    const ry = yaw + (it.yaw || 0);
    const rot = [it.tilt ? it.tilt[0] : 0, ry, it.tilt ? it.tilt[1] : 0];
    const hh = halfH(it.t, rot);
    let y;
    if (it.on != null && recs[it.on]) { const b = recs[it.on]; y = b.y + b.hh + hh + 0.01; }
    else {
      const f = foot(it.t) * 0.7;
      const h0 = W.heightAt(x, z);
      let g = W.groundAt(x, z, h0 + 0.8);
      for (const [dx, dz] of [[f, 0], [-f, 0], [0, f], [0, -f]]) g = Math.max(g, W.groundAt(x + dx, z + dz, h0 + 0.8));
      y = g + hh + 0.01;
    }
    const r = { type: it.t, x, y, z, rot, hh, g: W.heightAt(x, z), lit: it.lit ?? o.lit, persistent: false, gone: false, live: null };
    recs.push(r);
    out.push(r);
  }
  return recs;
}

/** Try to drop a template somewhere in the ring rMin..rMax around (cx,cz). */
function placeCluster(out, tpl, cx, cz, rMin, rMax, o = {}) {
  const items = TPL[tpl] ? TPL[tpl]() : SINGLE(tpl, o.item)();
  const rad = clusterRadius(items);
  for (let k = 0; k < (o.tries ?? 40); k++) {
    const a = R() * 6.283, d = rMin + (rMax - rMin) * Math.sqrt(R());
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (!freeAt(x, z, rad, o)) continue;
    taken.push({ x, z, r: rad });
    const yaw = o.faceCentre ? Math.atan2(cx - x, cz - z) : R() * 6.283;
    emit(out, items, x, z, yaw, o);
    return true;
  }
  return false;
}

// ---- plans --------------------------------------------------------------------------------------------------------------
// [template, count, rMin, rMax] — radii as a fraction of the POI radius (values > 2 are metres)
const PLANS = {
  village: [['hay', 7, 0.35, 1.05], ['cartstop', 3, 0.3, 0.95], ['crates', 6, 0.2, 0.95], ['barrels', 5, 0.2, 0.9], ['market', 2, 0.15, 0.6],
    ['farm', 3, 0.4, 1.1], ['pumpkins', 3, 0.6, 1.2], ['woodpile', 2, 0.3, 1.0], ['pottery', 2, 0.2, 0.8], ['water', 2, 0.1, 0.6],
    ['seat', 3, 0.1, 0.7], ['apples', 2, 0.3, 1.0], ['festival', 1, 0.1, 0.5], ['lantern_post', 5, 0.1, 0.8], ['torch_post', 2, 0.2, 0.9]],
  town: [['market', 12, 0.12, 0.85], ['crates', 4, 0.3, 1.0], ['barrels', 3, 0.3, 1.0], ['festival', 2, 0.15, 0.7], ['lantern_post', 10, 0.1, 0.95],
    ['pottery', 3, 0.2, 0.9], ['seat', 3, 0.1, 0.7], ['library', 2, 0.2, 0.8], ['torch_post', 4, 0.5, 1.05], ['brazier', 3, 0.2, 0.9], ['andon', 4, 0.1, 0.8], ['water', 1, 0.2, 0.8]],
  foxvillage: [['festival', 2, 0.15, 0.8], ['lantern_post', 6, 0.15, 0.95], ['pottery', 3, 0.2, 0.9], ['seat', 2, 0.1, 0.8], ['library', 1, 0.2, 0.8],
    ['wind_chime', 3, 0.2, 0.9], ['brazier', 2, 0.2, 0.8], ['crates', 2, 0.4, 1.0], ['offering', 2, 0.2, 0.9], ['andon', 2, 0.2, 0.8]],
  shrine: [['offering', 4, 0.2, 0.8], ['wind_chime', 3, 0.2, 0.85], ['shrine_bell', 1, 0.15, 0.4], ['brazier', 2, 0.15, 0.6], ['lantern_post', 2, 0.3, 0.9], ['seat', 1, 0.4, 0.9], ['crates', 1, 0.5, 0.95], ['pottery', 1, 0.4, 0.9]],
  training: [['crates', 2, 0.3, 1.0], ['barrels', 2, 0.3, 1.0], ['pottery', 3, 0.2, 1.0], ['hay', 1, 0.5, 1.1], ['torch_post', 2, 0.6, 1.0]],
  crystal: [['iron', 5, 0.35, 1.05], ['brazier', 2, 0.4, 0.9], ['crates', 2, 0.5, 1.1], ['camp', 1, 0.6, 1.2], ['woodpile', 1, 0.5, 1.1]],
  windshrine: [['snow', 3, 3, 13], ['wind_chime', 2, 3, 10], ['shrine_bell', 1, 3, 9], ['ice_block', 2, 4, 13]],
  lakeisle: [['offering', 1, 5, 18], ['lantern_post', 3, 4, 20], ['pottery', 1, 6, 20]],
  dusktree: [['lantern_post', 3, 0.85, 1.25], ['offering', 1, 0.9, 1.3], ['brazier', 2, 0.85, 1.2]],
};
// enemy camps / festivals out in the wild (no camp data exists yet; these sit off the roads in dusk and night lands)
const CAMPS = [[-48, -112], [-110, -10], [60, 170], [320, 150], [470, -250], [640, 40], [260, -260], [470, 140], [150, 250]];

// ---- lived-in settlements: goods lean against the houses (back and side walls, door/street side kept clear),
//      market goods sit in front of the stalls, offerings in front of the shrine halls -------------------------------
// template -> where it prefers to go ('wall' = beside a house, 'stall' = in front of a stall, 'front' = street side of a hall)
const NEAR = {
  village: { hay: 'wall', crates: 'wall', barrels: 'wall', woodpile: 'wall', pottery: 'wall', water: 'wall', apples: 'wall', cartstop: 'wall', pumpkins: 'wall' },
  town: { crates: 'wall', barrels: 'wall', pottery: 'wall', library: 'wall', market: 'stall', water: 'wall' },
  foxvillage: { pottery: 'wall', crates: 'wall', library: 'wall', offering: 'front' },
  shrine: { offering: 'front', crates: 'wall', pottery: 'wall' },
};
function siteBoxes(tag, poi, kind) {
  const res = [];
  for (const c of G.world.colliders) {
    if (c.dead || !c.box || c.tag !== tag) continue;
    if (Math.hypot(c.x - poi.x, c.z - poi.z) > poi.r * 1.25) continue;
    const big = Math.max(c.hw, c.hd), small = Math.min(c.hw, c.hd);
    if (kind === 'stall' ? (big >= 0.9 && big < 2.5 && small >= 0.4) : big >= 2.5 && small >= 1.2) res.push(c);
  }
  return res;
}
function placeBeside(out, tpl, boxes, mode, o) {
  if (!boxes.length) return false;
  const W = G.world;
  const items = TPL[tpl] ? TPL[tpl]() : SINGLE(tpl, o.item)();
  const rad = clusterRadius(items);
  for (let k = 0; k < 30; k++) {
    const b = pick(boxes);
    const side = Math.floor(R() * 4) % 4;                 // 0 +x, 1 -x, 2 +z, 3 -z (box frame)
    const alongX = side >= 2;
    const ext = alongX ? b.hd : b.hw, run = alongX ? b.hw : b.hd;
    const off = ext + rad + (mode === 'stall' ? 0.35 : 0.5);
    const t = (R() * 2 - 1) * Math.max(0, run - rad * 0.6);
    const sg = side % 2 ? -1 : 1;
    const lx = alongX ? t : sg * off, lz = alongX ? sg * off : t;
    const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
    const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
    // street side = the side closer to a road: doors and stall fronts face it
    const street = W.roadDist(x, z) < W.roadDist(b.x, b.z) - 0.5;
    if (mode === 'wall' && street && R() < 0.85) continue;
    if (mode === 'front' && !street) continue;
    if (!freeAt(x, z, rad, o)) continue;
    taken.push({ x, z, r: rad });
    const nx = lx * c + lz * s, nz = -lx * s + lz * c;      // outward direction from the box centre
    const yaw = Math.atan2(nx, nz) + (mode === 'wall' ? Math.PI : 0);   // wall goods face the wall, the rest face out
    emit(out, items, x, z, yaw, o);
    return true;
  }
  return false;
}

function settlements(out) {
  const W = G.world;
  for (const id in PLANS) {
    const poi = W.POI[id];
    if (!poi) continue;
    const near = NEAR[id] || {};
    const houses = near ? siteBoxes(id, poi, 'wall') : [];
    const stalls = near ? siteBoxes(id, poi, 'stall') : [];
    for (const [tpl, n, a, b] of PLANS[id]) {
      const rMin = a > 2 ? a : a * poi.r, rMax = b > 2 ? b : b * poi.r;
      const mode = near[tpl];
      const o = { road: tpl === 'lantern_post' || tpl === 'torch_post' ? 1.6 : mode === 'stall' || mode === 'front' ? 1.2 : 2.6,
        gap: tpl === 'lantern_post' ? 0.8 : mode ? 0.9 : 1.4, maxSlope: 0.34, river: 5, minH: id === 'lakeisle' ? 0.6 : 0.8 };
      for (let i = 0; i < n; i++) {
        if (mode && placeBeside(out, tpl, mode === 'stall' ? stalls : houses, mode, o)) continue;
        placeCluster(out, tpl, poi.x, poi.z, rMin, rMax, o);
      }
    }
  }
}

/** Boulders on slopes above the roads: they wait there for someone to nudge them. */
function roadBoulders(out) {
  const W = G.world;
  for (const road of W.ROADS) {
    const pts = road.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az), steps = Math.floor(len / 34);
      for (let k = 1; k <= steps; k++) {
        if (R() < 0.45) continue;
        const f = k / (steps + 1), x0 = ax + (bx - ax) * f, z0 = az + (bz - az) * f;
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        const hr = W.heightAt(x0, z0);
        for (const side of [1, -1]) {
          const d = rr(9, 22), x = x0 + nx * d * side, z = z0 + nz * d * side;
          const h = W.heightAt(x, z), sl = W.slopeAt(x, z);
          if (h - hr < 2.5 || sl < 0.14 || sl > 0.75) continue;
          const t = R() < 0.4 ? 'boulder_l' : R() < 0.7 ? 'boulder_m' : 'boulder_s';
          if (!freeAt(x, z, foot(t), { maxSlope: 0.8, road: 4, notReserved: true, gap: 3 })) continue;
          taken.push({ x, z, r: foot(t) });
          emit(out, [{ t, x: 0, z: 0, yaw: R() * 6 }], x, z, 0);
          if (t === 'boulder_l' && R() < 0.4) {
            const x2 = x + rr(-2, 2), z2 = z + rr(-2, 2);
            if (freeAt(x2, z2, foot('boulder_s'), { maxSlope: 0.8, road: 4, notReserved: true, gap: 0.5 })) { taken.push({ x: x2, z: z2, r: 0.4 }); emit(out, [{ t: 'boulder_s', x: 0, z: 0 }], x2, z2, 0); }
          }
          break;
        }
      }
    }
  }
}

/** Logs washed up along the river banks, crates and barrels at the lake pier. */
function riverside(out) {
  const W = G.world;
  for (const riv of W.RIVERS) {
    const pts = riv.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.floor(len / 45));
      for (let k = 0; k < steps; k++) {
        const f = (k + 0.5) / steps, x0 = ax + (bx - ax) * f, z0 = az + (bz - az) * f;
        const nx = -(bz - az) / len, nz = (bx - ax) / len, side = R() < 0.5 ? 1 : -1;
        for (let tr = 0; tr < 6; tr++) {
          const d = rr(7, 13), x = x0 + nx * d * side, z = z0 + nz * d * side;
          const tpl = R() < 0.7 ? 'logs' : 'log_short';
          const items = TPL[tpl] ? TPL[tpl]() : SINGLE(tpl)();
          const rad = clusterRadius(items);
          if (!freeAt(x, z, rad, { river: 4.5, road: 3, maxSlope: 0.34, notReserved: true, minH: 0.6 })) continue;
          taken.push({ x, z, r: rad });
          emit(out, items, x, z, Math.atan2(bx - ax, bz - az) + rr(-0.4, 0.4));
          break;
        }
      }
    }
  }
  const pier = W.ANCHORS.lake_ferryman;
  if (pier) for (const tpl of ['crates', 'barrels', 'water', 'logs']) placeCluster(out, tpl, pier.x, pier.z, 5, 14, { river: 0, road: 2.4, minH: 0.5, maxSlope: 0.4 });
}

function camps(out) {
  for (const [x, z] of CAMPS) placeCluster(out, 'camp', x, z, 0, 14, { notReserved: true, road: 6, maxSlope: 0.25, tries: 60 });
}

/** Sparse things in the wild, chosen by what land it is. */
function wild(out) {
  const W = G.world;
  const pools = {
    sun: ['hay', 'pumpkins', 'boulder_m', 'pottery', 'crates', 'apples', 'log', 'boulder_s', 'farm'],
    dusk: ['log', 'logs', 'boulder_m', 'pottery', 'crates', 'boulder_l', 'barrels', 'lantern_post'],
    night: ['boulder_m', 'pottery', 'crates', 'iron', 'log', 'boulder_l', 'lantern_post', 'barrels'],
  };
  let placed = 0;
  for (let k = 0; k < 900 && placed < 70; k++) {
    const a = R() * 6.283, d = Math.sqrt(R()) * 700;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = W.heightAt(x, z);
    if (h < 1.5 || h > 70) continue;
    const major = W.majorAt(x, z);
    const tpl = pick(pools[major] || pools.sun);
    const items = TPL[tpl] ? TPL[tpl]() : SINGLE(tpl)();
    const rad = clusterRadius(items);
    if (!freeAt(x, z, rad, { notReserved: true, road: 5, gap: 18, maxSlope: tpl.startsWith('boulder') ? 0.5 : 0.28 })) continue;
    taken.push({ x, z, r: rad });
    emit(out, items, x, z, R() * 6.283);
    placed++;
  }
}

/** Build every placement record. Deterministic for a given world (same colliders -> same layout). */
export function buildRecords(seed = 20261113) {
  taken = [];
  const out = [];
  const step = (s, fn) => { R = mulberry32(seed + s); try { fn(out); } catch (e) { G.reportError('props:place', e); } };
  step(1, settlements);
  step(2, camps);
  step(3, riverside);
  step(4, roadBoulders);
  step(5, wild);
  R = Math.random;
  out.forEach((r, i) => { r.id = i; });
  return out;
}
export { distToPolyline };
