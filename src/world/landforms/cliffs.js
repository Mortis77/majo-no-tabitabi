// landforms — cliffs and outcrops on the steep analytic terrain: stratified face slabs (ledges with overhang lips) on
// the steepest ground, half-buried outcrops on steep ground, talus boulders at the foot of cliffs, crag spires on the
// ridges of 霜见岳 (silhouette), and the palace crag wrapped in fluted columns of dark rock. Snow and moss are baked
// per vertex in world space. Never on reserved ground, paths, rivers or warded places.
import * as THREE from 'three';
import { mulberry32, noise2 } from '../../core/util.js';
import { POI } from '../../data/world.js';
import { protoRock, protoPrisms, rockShader, palAt, PALS } from './rockgeo.js';
import { CellStore } from './cells.js';
import { buildBands, protoCrag, buildArete } from './bands.js';

const DEG = Math.PI / 180;

export function buildCliffs(G, mat, root) {
  const W = G.world;
  const Q = G.quality || { density: 1, name: 'high' };
  const dens = Q.density ?? 1;
  const hiDist = Q.name === 'low' ? 80 : Q.name === 'med' ? 110 : 130;
  const store = new CellStore('cliffs', mat, { hiDist, castFar: false });   // far cells: no shadow pass (perf)
  root.add(store.group);
  const rnd = mulberry32(20261113);

  // ---- prototypes (hi / lo pairs share seeds → same silhouette) ----------------------------------------------------
  const pair = (o) => ({ hi: protoRock({ ...o, w: o.w, h: o.h }), lo: protoRock({ ...o, w: Math.max(6, Math.round(o.w / 2)), h: Math.max(4, Math.round(o.h / 2.4)), bands: 0 }) });
  // round 2: outcrops are chipped blocks with crisp facets (sharp 140), not pebbles
  const OUT = [1, 2, 3].map((s) => pair({ seed: 200 + s, w: 10, h: 10, planes: 7, flat: 0.35, bands: 2, lip: 0.1, bottom: -0.4, box: 1, sharp: 140, taper: 0.25 }));
  const TALUS = [1, 2, 3].map((s) => pair({ seed: 300 + s, w: 8, h: 6, planes: 9, flat: 0.5, bottom: -0.45 }));
  const SPIRE = [1, 2, 3, 4, 5].map((s) => { const c = protoCrag(400 + s); return { hi: c, lo: c }; });
  const PRISM = [1, 2, 3, 4].map((s) => ({ hi: protoPrisms({ seed: 500 + s, n: 5, rows: 4 }), lo: protoPrisms({ seed: 500 + s, n: 5, rows: 1 }) }));

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const place = (protos, x, y, z, yaw, tiltX, tiltZ, sx, sy, sz, pal, info) => {
    _e.set(tiltX, yaw, tiltZ, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    return store.add(protos, _m, rockShader(pal), { x, z, ...info });
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const H = (x, z) => W.baseHeightAt(x, z);
  const grad = (x, z) => { const e = 1.5; return [(H(x + e, z) - H(x - e, z)) / (2 * e), (H(x, z + e) - H(x, z - e)) / (2 * e)]; };
  const palace = POI.palace;
  const blocked = (x, z, pad) => {
    if (Math.hypot(x - palace.x, z - palace.z) < 125) return true;              // the crag has its own columns; moat
    if (W.isReserved(x, z, pad)) return true;
    if (W.roadDist(x, z) < 8 + pad) return true;
    if (W.riverDist(x, z) < 12) return true;
    if (W.protectionAt(x, z) > 0.01) return true;
    return false;
  };
  const colliders = [];
  const collide = (p, x, z, r, y0, y1) => {
    if (W.roadDist(x, z) < r + 6 || W.isReserved(x, z, r + 2)) return;
    p.col = W.addCollider({ x, z, r, y0, y1, tag: 'landforms' });
    colliders.push(p.col);
  };
  let nFace = 0, nArete = 0, nOut = 0, nTalus = 0, nSpire = 0, nCol = 0;

  // ---- scan the land ----------------------------------------------------------------------------------------------
  const STEP = 7;
  for (let gz = -820; gz <= 820; gz += STEP) for (let gx = -820; gx <= 820; gx += STEP) {
    const x = gx + (rnd() - 0.5) * STEP * 0.9, z = gz + (rnd() - 0.5) * STEP * 0.9;
    const h = H(x, z);
    if (h < 1.5) continue;
    const [gxx, gzz] = grad(x, z);
    const gl = Math.hypot(gxx, gzz);
    const slope = Math.atan(gl);
    const r0 = rnd();
    if (slope < 8 * DEG) continue;
    const dx = -gxx / (gl || 1), dz = -gzz / (gl || 1);              // downhill
    const yaw = Math.atan2(dx, dz);
    if (slope > 44 * DEG) {
      continue;                                   // steep ground: contour bands (bands.js)
    } else if (slope > 31 * DEG) {
      if (r0 > 0.42 || blocked(x, z, 4)) continue;
      const pal = palAt(W, x, z);
      // upright, half-buried, leaning a little downhill (a flat pancake on a slope reads as a pebble)
      const s = 1.6 + rnd() * 2.4;
      const p = place(pick(OUT), x, h - s * 0.45, z, yaw + (rnd() - 0.5) * 0.8, 0.12 + rnd() * 0.15, (rnd() - 0.5) * 0.2, s * (0.85 + rnd() * 0.35), s * (1.05 + rnd() * 0.5), s * 0.8, pal, { y: h, kind: 'outcrop' });
      nOut++;
      if (s > 2.6 && rnd() < 0.5) { collide(p, x, z, s * 0.7, h - s, h + s * 0.6); nCol++; }
    } else if (slope < 27 * DEG && slope > 6 * DEG) {
      // foot of a cliff: steep ground a few metres uphill
      if (r0 > 0.5 * dens) continue;
      const ux = x - dx * 9, uz = z - dz * 9;
      const [ga, gb] = grad(ux, uz);
      if (Math.atan(Math.hypot(ga, gb)) < 40 * DEG) continue;
      if (blocked(x, z, 3)) continue;
      const pal = palAt(W, x, z);
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const tx = x + (rnd() - 0.5) * 6, tz = z + (rnd() - 0.5) * 6;
        if (blocked(tx, tz, 2)) continue;
        const s = 0.6 + rnd() * 1.4;
        const th = H(tx, tz);
        const p = place(pick(TALUS), tx, th - s * 0.2, tz, rnd() * 6.28, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5, s * (1 + rnd() * 0.4), s * 0.75, s, pal, { y: th, kind: 'talus' });
        nTalus++;
        if (s > 1.3) { collide(p, tx, tz, s * 0.8, th - 1, th + s * 0.6); nCol++; }
      }
    }
  }

  // ---- contour cliff bands on the steep ground (one continuous terraced cliff, not slabs)
  const bands = buildBands(G, store, blocked, { dens });

  // ---- crag spires along the ridges of 霜见岳 (silhouette from afar) -------------------------------------------------
  const spires = [];
  for (let gz = -760; gz <= -300; gz += 12) for (let gx = -320; gx <= 280; gx += 12) {
    const x = gx + (rnd() - 0.5) * 8, z = gz + (rnd() - 0.5) * 8;
    if (W.mountainMask(x, z) < 0.18) continue;
    const h = H(x, z);
    if (h < 70) continue;
    let crest = 0;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (H(x + Math.cos(a) * 16, z + Math.sin(a) * 16) < h - 1.5) crest++; }
    if (crest < 5) continue;
    if (spires.some((s) => Math.hypot(s[0] - x, s[1] - z) < 22)) continue;
    if (Math.hypot(x - POI.windshrine.x, z - POI.windshrine.z) < 48 || blocked(x, z, 6)) continue;
    spires.push([x, z]);
    const pal = palAt(W, x, z, { snowK: 0.45 });
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const sx = 2.6 + rnd() * 2.8, sy = 7 + rnd() * 10 * (k === 0 ? 1 : 0.55);
      const ox = x + (k ? (rnd() - 0.5) * 9 : 0), oz = z + (k ? (rnd() - 0.5) * 9 : 0);
      const oh = H(ox, oz);
      const p = place(pick(SPIRE), ox, oh - 1.2, oz, rnd() * 6.28, (rnd() - 0.5) * 0.18, (rnd() - 0.5) * 0.18, sx, sy, sx * (0.8 + rnd() * 0.4), pal, { y: oh, kind: 'spire' });
      nSpire++;
      collide(p, ox, oz, sx * 0.75, oh - 2, oh + sy); nCol++;
    }
  }
  // arêtes: knife-edge ridges with a snow cornice between neighbouring crags on the same crest
  const links = new Uint8Array(spires.length);
  for (let i = 0; i < spires.length; i++) for (let j = i + 1; j < spires.length; j++) {
    if (links[i] >= 2 || links[j] >= 2) continue;
    const [ax, az] = spires[i], [bx, bz] = spires[j];
    const d = Math.hypot(bx - ax, bz - az);
    if (d > 40) continue;
    const lo = Math.min(H(ax, az), H(bx, bz));
    let ok = true;
    for (let t = 0.2; t < 0.9 && ok; t += 0.2) { const x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (H(x, z) < lo - 7 || blocked(x, z, 4) || Math.hypot(x - POI.windshrine.x, z - POI.windshrine.z) < 40) ok = false; }
    if (!ok) continue;
    buildArete(G, store, spires[i], spires[j], rnd); nArete++; links[i]++; links[j]++;
  }

  // ---- the palace crag: fluted columns of dark rock around the wall ---------------------------------------------------
  let nCols = 0;
  {
    const pal = PALS.palace;
    const C = 2 * Math.PI * 62;
    const n = Math.round(C / 3.4);
    for (let i = 0; i < n; i++) {
      for (const ring of [0, 1]) {
        if (ring === 1 && rnd() < 0.45) continue;
        const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.03 + ring * 0.02;
        const dp = ring === 0 ? 59.5 + rnd() * 4 : 66 + rnd() * 7;
        const x = palace.x + Math.cos(a) * dp, z = palace.z + Math.sin(a) * dp;
        const base = H(x, z) - 4;
        const top = ring === 0 ? palace.h - 2.5 - Math.pow(rnd(), 1.6) * 34 : 30 + rnd() * 45;
        if (top - base < 6) continue;
        const sxz = ring === 0 ? 2.6 + rnd() * 1.4 : 2.2 + rnd() * 1.8;
        const p = place(pick(PRISM), x, base, z, rnd() * 6.28, (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04, sxz, top - base, sxz, pal, { y: base, kind: 'column' });
        nCols++;
        if (ring === 1 || rnd() < 0.25) { collide(p, x, z, sxz * 0.8, base, top); nCol++; }
      }
    }
  }

  store.finish();
  return { store, colliders, counts: { face: nFace, bands, arete: nArete, outcrop: nOut, talus: nTalus, spire: nSpire, column: nCols, colliders: nCol }, tris: store.tris };
}

/** Keep pieces honest when spells dig craters or raise mounds: shift them with the ground, shatter if undercut. */
export function deformCliffs(G, C, e) {
  const W = G.world;
  const pad = 6;
  for (const p of C.store.inRect(e.x0 - pad, e.x1 + pad, e.z0 - pad, e.z1 + pad)) {
    const off = W.deformOffsetAt(p.x, p.z);
    const prev = p.off ?? 0;
    const d = off - prev;
    if (Math.abs(d) < 0.3) continue;
    p.off = off;
    if (d < -1.6 && p.kind !== 'column') {
      C.store.kill(p);
      G.fx?.burst?.('shatter_rock', new THREE.Vector3(p.x, p.y + 1, p.z));
    } else C.store.shift(p, d);
  }
}
void noise2;
