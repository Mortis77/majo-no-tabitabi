// City-life layout (citylife round, 2026-11-22): where the witches of the Land of Mages fly, perch and walk.
// The places agent exports the city as data (`CITY_LIFE` in src/data/bellcrown.js: balconies, towers, spires, sky
// lanes, streets, squares, shop fronts, gate arch, practice field, keep-out zones). Anything it does not export is
// derived here from the built city itself: the colliders / platforms the builders register (G.world) are stamped into
// two grids once, when the heroine first comes near:
//   sky   (4 m cells)  highest solid top per cell, dilated one cell: flight clearance, rooftop perches, spires
//   walk  (2 m cells)  1 where a wall / stall / fountain stands at street level: walkers never enter those cells
// Everything here runs once (plus a cheap keep-out refresh twice a second); nothing per frame.
import * as BC from '../../data/bellcrown.js';
import { CITY, JOURNEY_POI } from '../../data/journey-map.js';

const TAU = Math.PI * 2;
const SKY = 4, WALK = 2;

function boxExt(b) { const c = Math.abs(Math.cos(b.rot || 0)), s = Math.abs(Math.sin(b.rot || 0)); return [b.hw * c + b.hd * s, b.hw * s + b.hd * c]; }
function inBox(b, x, z, pad) {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
  return Math.abs(dx * c - dz * s) <= b.hw + pad && Math.abs(dx * s + dz * c) <= b.hd + pad;
}
const pt = (p) => (Array.isArray(p) ? { x: p[0], y: p.length > 2 ? p[1] : undefined, z: p.length > 2 ? p[2] : p[1] } : p);

/** Build the layout. Returns null when the world is not there yet. */
export function buildCityPlan(G) {
  const W = G.world;
  if (!W?.heightAt) return null;
  const D = BC.CITY_LIFE || null;
  if (D && D.ready === false) return null; // balconies / shop fronts are still being built
  const cx = D?.bounds?.x ?? D?.center?.x ?? CITY.x, cz = D?.bounds?.z ?? D?.center?.z ?? CITY.z;
  const R = Math.max(D?.bounds?.r ?? 0, D?.bounds?.halfW ?? 0, D?.bounds?.halfD ?? 0, 250) + 30;
  const ground = D?.ground ?? CITY.y;
  // ---- sky grid
  const n = Math.ceil((2 * R) / SKY), x0 = cx - R, z0 = cz - R;
  const top = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) top[j * n + i] = W.heightAt(x0 + (i + 0.5) * SKY, z0 + (j + 0.5) * SKY);
  // `top`: exact tops (cell centre inside the footprint); `sky`: padded 2.5 m, the flight-clearance surface
  const sky = new Float32Array(top);
  const nw = Math.ceil((2 * R) / WALK);
  const walk = new Uint8Array(nw * nw);
  const stamp = (c, y1, pad, grid, cell, nn, val) => {
    let ex, ez;
    if (c.box) [ex, ez] = boxExt(c); else ex = ez = c.r;
    const i0 = Math.max(0, Math.floor((c.x - ex - pad - x0) / cell)), i1 = Math.min(nn - 1, Math.floor((c.x + ex + pad - x0) / cell));
    const j0 = Math.max(0, Math.floor((c.z - ez - pad - z0) / cell)), j1 = Math.min(nn - 1, Math.floor((c.z + ez + pad - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + (i + 0.5) * cell, pz = z0 + (j + 0.5) * cell;
      const inside = c.box ? inBox(c, px, pz, pad) : (px - c.x) ** 2 + (pz - c.z) ** 2 <= (c.r + pad) ** 2;
      if (!inside) continue;
      const k = j * nn + i;
      if (val === undefined) { if (y1 > grid[k]) grid[k] = y1; } else grid[k] = val;
    }
  };
  const towers = [], cand = [];
  for (const c of W.colliders || []) {
    if (c.dead || !(c.y1 < 600)) continue;
    if (Math.abs(c.x - cx) > R + 30 || Math.abs(c.z - cz) > R + 30) continue;
    stamp(c, c.y1, 0.2, top, SKY, n);
    stamp(c, c.y1, 2.5, sky, SKY, n);
    const g = W.heightAt(c.x, c.z);
    // street-level obstacles for walkers (walls, stalls, fountains, lamp posts)
    if (c.y0 < g + 1.7 && c.y1 > g + 0.25) stamp(c, 0, 0.45, walk, WALK, nw, 1);
    const size = c.box ? Math.max(c.hw, c.hd) : c.r;
    if (c.y1 > ground + 24 && size < 16) cand.push({ x: c.x, z: c.z, top: c.y1, r: Math.max(2, size) });
  }
  for (const p of W.platforms || []) {
    if (p.dead || Math.abs(p.x - cx) > R + 30 || Math.abs(p.z - cz) > R + 30) continue;
    stamp(p, p.top, 0.2, top, SKY, n);
    stamp(p, p.top, 2.5, sky, SKY, n);
  }
  const skyAt = (x, z) => {
    const i = Math.floor((x - x0) / SKY), j = Math.floor((z - z0) / SKY);
    if (i < 0 || j < 0 || i >= n || j >= n) return W.heightAt(x, z);
    return sky[j * n + i];
  };
  const rawTop = (x, z) => {
    const i = Math.floor((x - x0) / SKY), j = Math.floor((z - z0) / SKY);
    if (i < 0 || j < 0 || i >= n || j >= n) return W.heightAt(x, z);
    return top[j * n + i];
  };
  const blocked = (x, z) => {
    const i = Math.floor((x - x0) / WALK), j = Math.floor((z - z0) / WALK);
    if (i < 0 || j < 0 || i >= nw || j >= nw) return true;
    return walk[j * nw + i] === 1;
  };
  // inside the walls: exported bounds, else the city's own level terraces (the paved plateaus are dead flat; the
  // country outside the wall slopes), within the radius
  const levels = [];
  if (!D?.bounds) {
    const hist = new Map();
    let tot = 0;
    for (let j = 0; j < n; j += 2) for (let i = 0; i < n; i += 2) {
      const x = x0 + (i + 0.5) * SKY, z = z0 + (j + 0.5) * SKY;
      if (Math.hypot(x - cx, z - cz) > R * 0.6) continue;
      const k = Math.round(W.heightAt(x, z) * 2) / 2; hist.set(k, (hist.get(k) || 0) + 1); tot++;
    }
    for (const [k, c] of hist) if (c > tot * 0.03) levels.push(k);
  }
  const onLevel = (x, z) => { if (!levels.length) return true; const h = W.heightAt(x, z); for (const l of levels) if (Math.abs(h - l) < 0.4) return true; return false; };
  const edge = BC.bellEdge && BC.BELL ? (x, z) => BC.bellEdge(x - BC.BELL.x, z - BC.BELL.z) : null;
  const inCity = edge ? (x, z, pad = 0) => edge(x, z) < pad - 6 : (x, z, pad = 0) => Math.hypot(x - cx, z - cz) < R - 30 + pad && (pad > 0 || onLevel(x, z));

  // ---- towers / spires (exported, else the tallest slim colliders, one per 22 m)
  let spires = (D?.spires || []).map(pt).map((s) => ({ x: s.x, z: s.z, top: s.top ?? s.y, r: s.r ?? 4 }));
  if (!spires.length) {
    cand.sort((a, b) => b.top - a.top);
    for (const c of cand) {
      if (spires.length >= 14) break;
      if (spires.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 22)) continue;
      if (!inCity(c.x, c.z, 20)) continue;
      spires.push(c);
    }
  }
  for (const t of D?.towers || []) towers.push({ x: t.x, z: t.z, r: t.r ?? 6, top: t.top ?? t.y });

  // ---- perches: balconies / terraces / pads (exported, else open platforms above the street with a wall behind)
  let perches = [];
  for (const b of D?.balconies || []) {
    const p = pt(b);
    perches.push({ x: p.x, y: p.y ?? b.top, z: p.z, face: b.face ?? 0, w: b.w ?? 2.4, kind: b.kind || 'balcony', id: perches.length, busy: 0, claim: 0, folk: 0 });
  }
  if (!perches.length) {
    const probe = { x: 0, y: 0, z: 0 };
    for (const p of W.platforms || []) {
      if (p.dead || !inCity(p.x, p.z)) continue;
      const g = W.heightAt(p.x, p.z);
      if (p.top < g + 5 || p.top > g + 70) continue;
      if ((W.ceilingAt?.(p.x, p.z, p.top + 0.5) ?? Infinity) < p.top + 6) continue; // a roof right above it
      probe.x = p.x; probe.y = p.top + 0.05; probe.z = p.z;
      if (W.resolveCollisions?.(probe, 0.35, 1.7)) continue; // inside a wall
      // the open side: the direction (of 8) whose skyline 5 m out is lowest; a wall behind makes it a balcony
      let best = 1e9, face = 0, wall = false;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU, h = rawTop(p.x + Math.sin(a) * 5, p.z + Math.cos(a) * 5);
        if (h < best) { best = h; face = a; }
        if (h > p.top + 2.5) wall = true;
      }
      if (best > p.top - 3) continue; // not over a drop
      const size = p.box ? Math.min(p.hw, p.hd) * 2 : p.r * 2;
      if (size < 1.2) continue;
      // stand on the open edge, 0.7 m in from the drop
      const reach = Math.max(0, (p.box ? Math.min(p.hw, p.hd) : p.r) - 0.8);
      perches.push({ x: p.x + Math.sin(face) * reach * 0.6, y: p.top, z: p.z + Math.cos(face) * reach * 0.6, face, w: Math.min(6, Math.max(1.6, size)), kind: wall ? 'balcony' : 'roof', id: 0, busy: 0, claim: 0, folk: 0 });
    }
    // thin out: one perch per 7 m
    perches.sort((a, b) => (a.kind === 'balcony' ? 0 : 1) - (b.kind === 'balcony' ? 0 : 1) || b.y - a.y);
    const keep = [];
    for (const p of perches) if (!keep.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 7 && Math.abs(q.y - p.y) < 5)) keep.push(p);
    perches = keep.slice(0, 220);
    perches.forEach((p, i) => (p.id = i));
  }

  // the rampart walk: a long perch round the town (a landing spot every ~26 m, facing into the town)
  if (D?.wallWalk?.pts?.length > 2) {
    const ww = D.wallWalk.pts.map(pt), y = D.wallWalk.y;
    for (let i = 0; i < ww.length; i++) {
      const a = ww[i], b = ww[(i + 1) % ww.length], L = Math.hypot(b.x - a.x, b.z - a.z), m = Math.floor(L / 26);
      for (let k = 1; k <= m; k++) {
        const f = k / (m + 1), x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
        perches.push({ x, y, z, face: Math.atan2(cx - x, cz - z), w: 2.2, kind: 'wall', id: perches.length, busy: 0, claim: 0, folk: 0 });
      }
    }
  }

  // ---- streets / squares / shop fronts / lanes (exported or derived)
  const streets = (D?.streets || []).map((l) => l.map(pt)).filter((l) => l.length > 1);
  const squares = (D?.squares || []).map(pt).map((s) => ({ x: s.x, z: s.z, r: s.r ?? 12 }));
  const shops = (D?.shopFronts || []).map(pt).map((s) => ({ x: s.x, z: s.z, face: s.face ?? 0 }));
  const lanes = [];
  if (D?.skyLanes) for (const L of D.skyLanes) {
    const l = L.pts.map(pt).map((p) => ({ x: p.x, y: L.y ?? p.y, z: p.z }));
    if (l.length < 2) continue;
    if (L.loop) l.push({ ...l[0] });
    l.width = L.width ?? 10; l.trusted = true;
    lanes.push(l);
  } else for (const l0 of D?.lanes || []) { const l = l0.map(pt); if (l.length > 1) { l.width = 10; l.trusted = true; lanes.push(l); } }
  const gateD = D?.gate || null;
  const gp = JOURNEY_POI.gate;
  const gate = gateD
    ? { x: gateD.x, z: gateD.z, y: gateD.y ?? ground, face: gateD.face ?? Math.atan2(gateD.x - cx, gateD.z - cz), w: gateD.archW ?? 8, h: gateD.archH ?? 12, depth: gateD.depth ?? 10 }
    : { x: gp.x, z: gp.z, y: ground, face: Math.atan2(gp.x - cx, gp.z - cz), w: 8, h: 11, depth: 10 };
  const pr = D?.practice || JOURNEY_POI.practice;
  const practice = { x: pr.x, z: pr.z, r: pr.r ?? 28, y: pr.y ?? W.heightAt(pr.x, pr.z) };
  const keepOut = (D?.keepOut || []).map((k) => ({ id: k.id || 'zone', x: k.x, z: k.z, r: k.r ?? 12, y0: k.y0 ?? -1e9, y1: k.y1 ?? 1e9, always: true }));

  // derived street segments: straight runs through open cells, at least 18 m long
  if (!streets.length) {
    let seed = 9137;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let tries = 0; tries < 900 && streets.length < 46; tries++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * (R - 50);
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      if (blocked(x, z) || rawTop(x, z) > W.heightAt(x, z) + 1.5 || !inCity(x, z)) continue;
      const dir = Math.floor(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.5;
      const sx = Math.sin(dir), sz = Math.cos(dir);
      let l0 = 0, l1 = 0;
      const okStep = (d0, d1) => !blocked(x + sx * d1, z + sz * d1) && inCity(x + sx * d1, z + sz * d1) && Math.abs(W.heightAt(x + sx * d1, z + sz * d1) - W.heightAt(x + sx * d0, z + sz * d0)) < 0.8;
      while (l1 < 90 && okStep(l1, l1 + 1)) l1 += 1;
      while (l0 < 90 && okStep(-l0, -l0 - 1)) l0 += 1;
      if (l0 + l1 < 18) continue;
      const A = { x: x - sx * (l0 - 1), z: z - sz * (l0 - 1) }, B = { x: x + sx * (l1 - 1), z: z + sz * (l1 - 1) };
      if (streets.some((s) => Math.hypot(s[0].x - A.x, s[0].z - A.z) + Math.hypot(s[1].x - B.x, s[1].z - B.z) < 16)) continue;
      streets.push([A, B]);
    }
  }
  // street-level safety along exported streets too: walk cells that are blocked are simply skipped by walkers

  // derived sky lanes: rings and chords over the roofs, at several heights between the towers
  {
    const alts = [ground + 30, ground + 40, ground + 50, ground + 64];
    const ring = (rad, alt, ph, k) => {
      const l = [];
      for (let i = 0; i < k; i++) { const a = ph + (i / k) * TAU; l.push({ x: cx + Math.sin(a) * rad, y: alt, z: cz + Math.cos(a) * rad * 0.82 }); }
      l.push(l[0]);
      return l;
    };
    const derived = [ring(R * 0.42, alts[1], 0.3, 16), ring(R * 0.25, alts[0], 2.0, 12), ring(R * 0.6, alts[3], 2.6, 18)];
    // chords across the town, kinked through an off-centre point, a point every ~40 m
    let seed = 4411;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI + rnd() * 0.4, rr = R * 0.82, alt = alts[k % 4] + rnd() * 6;
      const mx = cx + (rnd() - 0.5) * R * 0.5, mz = cz + (rnd() - 0.5) * R * 0.4;
      const A = { x: cx + Math.sin(a) * rr, z: cz + Math.cos(a) * rr * 0.75 }, B = { x: cx - Math.sin(a) * rr, z: cz - Math.cos(a) * rr * 0.75 };
      const l = [];
      for (const [p, q] of [[A, { x: mx, z: mz }], [{ x: mx, z: mz }, B]]) {
        const d = Math.hypot(q.x - p.x, q.z - p.z), m = Math.max(1, Math.round(d / 40));
        for (let i = l.length ? 1 : 0; i <= m; i++) l.push({ x: p.x + ((q.x - p.x) * i) / m, y: alt + Math.sin(i * 1.3 + k) * 3, z: p.z + ((q.z - p.z) * i) / m });
      }
      derived.push(l);
    }
    for (const l of derived) { l.width = 16; l.trusted = false; lanes.push(l); }
  }
  // every lane point clears the roofs it passes over (lanes between towers keep their height where it is open)
  // derived lane points clear the roofs they pass over; exported ones are trusted (street canyons between the house
  // fronts) but never scrape a roof; anything near the gate goes through the middle of the arch
  for (const l of lanes) {
    l.gate = false;
    for (const p of l) {
      if (p.y === undefined) p.y = ground + 40;
      p.y = l.trusted ? Math.max(p.y, rawTop(p.x, p.z) + 2) : Math.max(p.y, skyAt(p.x, p.z) + 7);
      if (Math.hypot(p.x - gate.x, p.z - gate.z) < gate.depth + 14) { p.y = Math.min(p.y, gate.y + gate.h * 0.55); l.gate = true; }
    }
  }

  const plan = {
    cx, cz, R, ground, x0, z0, n, sky, top, walk, nw, data: D,
    perches, spires, towers, streets, squares, shops, lanes, gate, practice, keepOut, levels,
    skyAt, rawTop, blocked, inCity,
    /** max sky height along a straight segment (every ~3 m), from fraction f0..f1 of the way */
    clearance(ax, ay, az, bx, by, bz, f0 = 0, f1 = 1) {
      const d = Math.hypot(bx - ax, bz - az), k = Math.max(2, Math.ceil(d / 3));
      let worst = -1e9;
      for (let i = 0; i <= k; i++) {
        const f = f0 + (f1 - f0) * (i / k);
        const y = ay + (by - ay) * f;
        const m = skyAt(ax + (bx - ax) * f, az + (bz - az) * f) - y;
        if (m > worst) worst = m;
      }
      return worst; // > -margin means the segment scrapes something
    },
  };
  return plan;
}

/** Story-staged zones that are active right now (refreshed twice a second by the flyers / crowds). */
export function activeKeepOut(G, plan, out) {
  out.length = 0;
  for (const k of plan.keepOut) out.push(k);
  const step = G.story?.current?.()?.id || '';
  const P = JOURNEY_POI;
  // the accident: the crash roof and the path Saya and the heroine take into it
  if (step === 'collision' || step === 'repair') out.push({ id: 'roof', x: P.roof.x, z: P.roof.z, r: 34, y0: -1e9, y1: 1e9 });
  else out.push({ id: 'roof', x: P.roof.x, z: P.roof.z, r: 12, y0: -1e9, y1: 1e9 });
  // the inn (its interior is a story room)
  out.push({ id: 'inn', x: P.inn.x, z: P.inn.z, r: P.inn.r + 2, y0: -1e9, y1: plan.ground + 24 });
  // the practice field during the lesson and the ring course
  if (step === 'teach' || step === 'course' || step === 'praise') out.push({ id: 'practice', x: plan.practice.x, z: plan.practice.z, r: plan.practice.r + 45, y0: -1e9, y1: plan.practice.y + 70 });
  // the gate fly-through (and the parting there)
  if (step === 'gate' || step === 'depart') out.push({ id: 'gate', x: plan.gate.x, z: plan.gate.z, r: 42, y0: -1e9, y1: plan.gate.y + Math.max(40, plan.gate.h + 25) });
  return out;
}

export function inKeepOut(list, x, y, z, pad = 0) {
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (y < k.y0 - pad || y > k.y1 + pad) continue;
    if ((x - k.x) ** 2 + (z - k.z) ** 2 < (k.r + pad) ** 2) return k;
  }
  return null;
}
