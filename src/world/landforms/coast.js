import { CAPE_STACKS } from '../../data/world.js';
// landforms — coast and water features: sea stacks and arches off the west coast, boulders in the rivers, stepping
// stones where a footpath fords 暮川, and the rapids where 暮川 leaves 雾见泉 (stepped rock chute, white water, spray).
// Foam rings on the water at every rock; occasional G.water ripples near the camera. The water level never changes.
import * as THREE from 'three';
import { mulberry32, distToPolyline, noise2 } from '../../core/util.js';
import { POI, RIVERS, ROADS } from '../../data/world.js';
import { Bake, protoRock, rockShader, PALS, palAt, lin } from './rockgeo.js';
import { lfMats, Puffs } from './lfmats.js';

const coastR = (a) => 770 + 42 * Math.sin(a * 3 + 1.3) + 26 * Math.sin(a * 7 + 0.5) + 18 * Math.sin(a * 13 + 2.1);

export function buildCoast(G, root) {
  const W = G.world;
  const M = lfMats();
  const rnd = mulberry32(7707);
  const rock = new Bake();
  const foam = new Bake(), foamA = [];
  const puffs = new Puffs();
  const fall = new Bake(), fallA = [];
  const spots = [];          // { x, z, r } for ripples
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const STACK = [1, 2, 3].map((s) => protoRock({ seed: 600 + s, w: 16, h: 20, planes: 10, flat: 0.45, bands: 7, lip: 0.13, bottom: -0.9, fracture: 0.09 }));
  const BOULD = [1, 2, 3].map((s) => protoRock({ seed: 700 + s, w: 10, h: 8, planes: 9, flat: 0.55, bottom: -0.5 }));
  const SLAB = [1, 2].map((s) => protoRock({ seed: 800 + s, w: 10, h: 6, planes: 8, flat: 1.2, bottom: -0.4 }));
  const put = (proto, x, y, z, yaw, sx, sy, sz, pal, tx = 0, tz = 0) => {
    _e.set(tx, yaw, tz, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    rock.add(proto, _m, rockShader(pal));
  };
  const foamRing = (x, z, r0, w, col) => {
    const S = 28;
    let prev = null;
    const seed = rnd() * 10;
    for (let s = 0; s <= S; s++) {
      const a = (s / S) * Math.PI * 2;
      const wob = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 7 - seed);
      const ia = foam.vert(x + Math.cos(a) * r0 * wob, 0.06, z + Math.sin(a) * r0 * wob, 0, 1, 0, col);
      const ib = foam.vert(x + Math.cos(a) * (r0 * wob + w), 0.06, z + Math.sin(a) * (r0 * wob + w), 0, 1, 0, col);
      foamA.push(0, seed, 1, seed);
      if (prev) { foam.tri(prev[0], prev[1], ia); foam.tri(ia, prev[1], ib); }
      prev = [ia, ib];
    }
  };
  const colliders = [];
  const col = (x, z, r, y0, y1) => { const c = W.addCollider({ x, z, r, y0, y1, tag: 'landforms' }); colliders.push(c); return c; };
  const foamCol = (x, z) => { const v = W.veilAt(x, z); return v > 0.82 ? lin(0x9fdcf0).map((q) => q * 0.55) : v > 0.25 ? lin(0xffe6dc) : lin(0xffffff); };

  // ---- sea stacks and arches off the west coast -------------------------------------------------------------------
  const stacks = [];
  const pal = PALS.coast;
  let tries = 0;
  while (stacks.length < 15 && tries++ < 400) {
    const a = (148 + rnd() * 70) * Math.PI / 180;
    const r = coastR(a) - 20 + rnd() * 120;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (W.heightAt(x, z) > -5) continue;
    if (stacks.some((s) => Math.hypot(s.x - x, s.z - z) < 38)) continue;
    const big = stacks.length < 6;
    const sx = big ? 6 + rnd() * 5 : 3 + rnd() * 3;
    const topY = big ? 16 + rnd() * 22 : 6 + rnd() * 10;
    const sy = (topY + 16) / 1.9;
    const yc = topY - sy;
    put(STACK[stacks.length % 3], x, yc, z, rnd() * 6.28, sx, sy, sx * (0.7 + rnd() * 0.4), pal, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08);
    // little companions at the foot
    for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) {
      const aa = rnd() * 6.28, d = sx * (1.1 + rnd() * 0.8), s = 1 + rnd() * 2.2;
      const bx = x + Math.cos(aa) * d, bz = z + Math.sin(aa) * d;
      put(BOULD[k % 3], bx, -0.6 - rnd() * 0.8, bz, rnd() * 6.28, s * 1.2, s, s, pal);
      foamRing(bx, bz, s * 0.95, 1.6, foamCol(bx, bz));
    }
    foamRing(x, z, sx * 0.92, 3.5, foamCol(x, z));
    col(x, z, sx * 0.8, -20, topY);
    stacks.push({ x, z, r: sx, top: topY });
    spots.push({ x, z, r: sx });
  }
  // arches: a chain of chiselled blocks along a bent curve, legs standing in the sea
  const arches = [];
  for (const a0 of [196, 163]) {
    const a = a0 * Math.PI / 180;
    const r = coastR(a) + 30;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (W.heightAt(cx, cz) > -4) continue;
    const span = 36 + rnd() * 8, hgt = 17 + rnd() * 4;          // wide and low: a bridge of rock, not a ring
    const yaw = a + Math.PI / 2 + (rnd() - 0.5) * 0.5;       // spans along the coast
    const ux = Math.sin(yaw), uz = Math.cos(yaw);
    archSweep(rock, cx, cz, ux, uz, span, hgt, pal, rnd() * 100);
    // a few fallen blocks lodged on the top and at the feet break the clean curve
    for (let k = 0; k < 3; k++) {
      const t = 0.3 + rnd() * 0.4, th = Math.PI * t, s = 1.4 + rnd() * 1.2;
      const along = -Math.cos(th) * span / 2;
      put(BOULD[k % 3], cx + ux * along, Math.sin(th) * hgt + 1.4 + s * 0.3, cz + uz * along, rnd() * 6.28, s * 1.3, s * 0.8, s, pal, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3);
    }
    for (const sgn of [-1, 1]) {
      const lx = cx + ux * sgn * span / 2, lz = cz + uz * sgn * span / 2;
      put(STACK[sgn > 0 ? 0 : 2], lx, -8, lz, rnd() * 6.28, 6, 10, 6.5, pal);
      foamRing(lx, lz, 5.6, 3.5, foamCol(lx, lz));
      col(lx, lz, 5, -20, hgt * 0.75);
      spots.push({ x: lx, z: lz, r: 6 });
    }
    arches.push({ x: cx, z: cz, span, h: hgt, yaw });
  }

  // ---- river boulders ---------------------------------------------------------------------------------------------
  let nb = 0;
  for (const R of RIVERS) {
    for (let i = 0; i < R.pts.length - 1; i++) {
      const [ax, az] = R.pts[i], [bx, bz] = R.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
      for (let d = 4; d < L; d += 7 + rnd() * 8) {
        if (rnd() < 0.45) continue;
        const off = (rnd() - 0.5) * 14;
        const x = ax + tx * d - tz * off, z = az + tz * d + tx * off;
        const h = W.heightAt(x, z);
        if (h > -0.8 || h < -4) continue;
        if (W.isReserved(x, z, 6) || W.protectionAt(x, z) > 0.01) continue;
        if (Math.hypot(x - POI.lake.x, z - POI.lake.z) < POI.lake.r + 10) continue;
        const s = 0.7 + rnd() * 1.6;
        const p = palAt(W, x, z);
        const top = -0.3 + s * (0.5 + rnd() * 0.5);
        put(BOULD[nb % 3], x, top - s * 0.95, z, rnd() * 6.28, s * (1 + rnd() * 0.5), s, s, { ...p, mossK: (p.mossK || 0) * 1.2 });
        foamRing(x, z, s * 0.9, 1.1 + s * 0.4, foamCol(x, z));
        if (s > 1.2) col(x, z, s * 0.85, -5, top);
        spots.push({ x, z, r: s });
        nb++;
      }
    }
  }

  // ---- stepping stones where a footpath fords 暮川 without a bridge --------------------------------------------------
  const fords = [];
  const kure = RIVERS.find((r) => r.id === 'kuregawa');
  for (const road of ROADS) {
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d <= L; d += 1) {
        const x = ax + (bx - ax) * d / L, z = az + (bz - az) * d / L;
        if (distToPolyline(x, z, kure.pts) < 1.2 && W.heightAt(x, z) < -0.5 && !W.BRIDGES.some((b) => Math.hypot(b.x - x, b.z - z) < b.len)) {
          if (!fords.some((f) => Math.hypot(f.x - x, f.z - z) < 30)) fords.push({ x, z, tx: (bx - ax) / L, tz: (bz - az) / L });
        }
      }
    }
  }
  const steps = [];
  for (const f of fords) {
    for (let k = -14; k <= 14; k += 1.5) {
      const x = f.x + f.tx * k + (rnd() - 0.5) * 0.5, z = f.z + f.tz * k + (rnd() - 0.5) * 0.5;
      const h = W.heightAt(x, z);
      if (h > 0.1) continue;
      const top = 0.28 + rnd() * 0.08;
      const s = 0.8 + rnd() * 0.25;
      put(SLAB[steps.length % 2], x, top - 0.55 * 1.0, z, rnd() * 6.28, s, 0.55, s * 0.9, { ...palAt(W, x, z), mossK: 0.4 });
      foamRing(x, z, s * 0.85, 0.9, foamCol(x, z));
      steps.push(W.addPlatform({ x, z, r: s * 0.78, top, thick: 1.5, tag: 'landforms' }));
      spots.push({ x, z, r: s });
    }
  }

  // ---- 雾见泉 outlet: stepped rock chute with white water and spray ---------------------------------------------------
  let cascade = null;
  {
    const S = POI.spring;
    const [nx, nz] = kure.pts[1];
    const L = Math.hypot(nx - S.x, nz - S.z), dx = (nx - S.x) / L, dz = (nz - S.z) / L;
    const px = -dz, pz = dx;
    const at = (t, l) => [S.x + dx * t + px * l, S.z + dz * t + pz * l];
    const pc = palAt(W, S.x, S.z);
    const wet = { ...pc, mossK: 1.0 };
    // gorge banks: big outcrops on both sides
    for (const sg of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const t = 17 + k * 4.5 + rnd() * 2, l = sg * (8 + rnd() * 3 + k * 0.6);
        const [x, z] = at(t, l);
        const s = 2.6 + rnd() * 1.6 - k * 0.2;
        const g = W.heightAt(x, z);
        put(BOULD[k % 3], x, Math.max(g, -1.5) + s * 0.2, z, rnd() * 6.28, s * 1.25, s * (0.9 + rnd() * 0.3), s, wet, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3);
        col(x, z, s * 0.9, -4, Math.max(g, -1.5) + s * 1.1);
      }
    }
    // sills across the channel (steps), with notches where the water pours
    const sills = [{ t: 18.5, top: 0.42 }, { t: 23, top: 0.24 }, { t: 27.5, top: 0.1 }];
    for (const sl of sills) {
      for (let l = -7; l <= 7; l += 1.6) {
        if (Math.abs(l) < 1.6 && sl.t > 20) continue;
        const [x, z] = at(sl.t + (rnd() - 0.5) * 0.8, l);
        const s = 0.85 + rnd() * 0.5;
        put(BOULD[(l * 3 | 0) & 1], x, sl.top - s * 0.7 + (Math.abs(l) > 4 ? 0.25 : 0), z, rnd() * 6.28, s * 1.2, s * 0.8, s, wet);
      }
    }
    // white-water ribbon down the chute (three steps), plus side runs
    const rows = 14;
    const ribbon = (l0, w, ph) => {
      let prev = null;
      for (let i = 0; i <= rows; i++) {
        const v = i / rows, t = 15 + v * 19;
        let y = 0.46;
        for (const sl of sills) y = t > sl.t ? Math.min(y, sl.top - 0.12 - 0.3 * Math.min(1, (t - sl.t) / 1.2)) : y;
        y = Math.max(0.04, y + 0.08);
        const wig = Math.sin(v * 7 + ph) * 0.5;
        const [xa, za] = at(t, l0 + wig - w * (0.7 + v * 0.6));
        const [xb, zb] = at(t, l0 + wig + w * (0.7 + v * 0.6));
        const c = lin(0xf2fbff);
        const ia = fall.vert(xa, y, za, 0, 1, 0, c), ib = fall.vert(xb, y, zb, 0, 1, 0, c);
        fallA.push(0, v * 0.85, 22, ph, 1, v * 0.85, 22, ph);
        if (prev) { fall.tri(prev[0], ia, prev[1]); fall.tri(prev[1], ia, ib); }
        prev = [ia, ib];
      }
    };
    ribbon(0, 1.6, 0.3); ribbon(-4.2, 0.8, 2.1); ribbon(4, 0.7, 4.4);
    for (const sl of sills) for (let l = -6; l <= 6; l += 3) { const [x, z] = at(sl.t + 1.2, l); foamRing(x, z, 0.6, 2.2, lin(0xffffff)); }
    for (let k = 0; k < 9; k++) { const [x, z] = at(19 + k * 1.6, (rnd() - 0.5) * 6); puffs.add(x, 0.8 + rnd() * 1.2, z, 2.2 + rnd() * 1.8, 0.13, lin(0xfff4ee), 0.06, rnd()); }
    // mist on the pond itself (雾见泉)
    for (let k = 0; k < 7; k++) { const a = rnd() * 6.28, d = rnd() * 16; puffs.add(S.x + Math.cos(a) * d, 0.9 + rnd() * 0.8, S.z + Math.sin(a) * d, 4 + rnd() * 3, 0.1, lin(0xfff0ea), 0.02, rnd()); }
    const [cx, cz] = at(23, 0);
    cascade = { x: cx, z: cz };
    spots.push({ x: cx, z: cz, r: 3 }, { x: cx, z: cz, r: 3 });
  }

  const out = { stacks, arches, fords, steps, colliders, spots, cascade, boulders: nb };
  // The trail opens between a pair of near stacks onto a taller rock on the horizon.
  for (const [i,s] of CAPE_STACKS.entries()) {
    const seabed=W.heightAt(s.x,s.z), halfHeight=(s.top-seabed+1.0)/1.9;
    put(STACK[i],s.x,s.top-halfHeight,s.z,s.yaw,s.r,halfHeight,s.r*.64,pal,0,s.lean);
    const bx=s.x+s.r*1.12,bz=s.z+s.r*.33;
    put(BOULD[i],bx,-.55,bz,s.yaw+.34,s.r*.53,s.r*.41,s.r*.44,pal);
    col(s.x,s.z,s.r*.70,seabed-1,s.top);
    foamRing(s.x,s.z,s.r*.86,2.1,foamCol(s.x,s.z));
    spots.push({x:s.x,z:s.z,r:s.r});
    stacks.push({x:s.x,z:s.z,r:s.r,top:s.top});
  }

  const rm = new THREE.Mesh(rock.build(), M.rock); rm.name = 'landforms_coast'; rm.castShadow = false; rm.receiveShadow = true;   // sea stacks shadow only open water: skip the shadow pass
  // big merged mesh spans the island: split is unnecessary (low triangle count), keep frustum culling coarse
  root.add(rm); out.mesh = rm;
  if (!foam.empty) { const g = foam.build(); g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foamA, 2)); const m = new THREE.Mesh(g, M.foam); m.name = 'landforms_foam'; m.renderOrder = 1; root.add(m); out.foam = m; }
  if (!fall.empty) { const g = fall.build(); g.setAttribute('aFall', new THREE.Float32BufferAttribute(fallA, 4)); const m = new THREE.Mesh(g, M.fall); m.name = 'landforms_rapids'; m.renderOrder = 2; root.add(m); out.rapids = m; }
  if (puffs.n) { const m = new THREE.Mesh(puffs.build(), M.puff); m.name = 'landforms_spray'; m.renderOrder = 3; root.add(m); out.spray = m; }
  return out;
}

/** Sea arch: a squarish, irregular rock section swept along a half-ellipse, thick at the legs, chiselled by noise. */
function archSweep(B, cx, cz, ux, uz, span, hgt, pal, seed) {
  const N = 44, S = 12, TAU = Math.PI * 2;
  const shade = rockShader(pal);
  const rows = [];
  const vx = -uz, vz = ux;                                   // across the arch
  for (let i = 0; i <= N; i++) {
    const th = Math.PI * (i / N);
    const along = -Math.cos(th) * span / 2, cy = Math.sin(th) * hgt - 2;
    const ta = Math.sin(th) * span / 2, ty = Math.cos(th) * hgt;
    const tl = Math.hypot(ta, ty) || 1;
    const na = -ty / tl, ny0 = ta / tl;                       // in-plane normal (up at the crown)
    const leg = Math.abs(Math.cos(th));
    const thick = 3.8 + 3.6 * leg * leg, wide = 4.2 + 2.8 * leg;
    const row = [];
    for (let s = 0; s < S; s++) {
      const a = (s / S) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const cs = Math.sign(ca) * Math.pow(Math.abs(ca), 0.55), ss = Math.sign(sa) * Math.pow(Math.abs(sa), 0.55);
      const j = 1 + 0.14 * noise2(i * 0.31 + seed, s * 0.83 - seed) + 0.07 * Math.sin(i * 1.9 + s * 2.3 + seed);
      const ip = cs * thick * j, ac = ss * wide * j;
      const x = cx + ux * (along + na * ip) + vx * ac, y = cy + ny0 * ip, z = cz + uz * (along + na * ip) + vz * ac;
      const nx = ux * na * cs + vx * ss, ny = ny0 * cs, nz = uz * na * cs + vz * ss;
      const nl = Math.hypot(nx, ny, nz) || 1;
      row.push(B.vert(x, y, z, nx, ny, nz, shade(x, y, z, nx / nl, ny / nl, nz / nl, 0.55 + 0.45 * Math.min(1, Math.max(0, (j - 0.86) / 0.28)), 0.5)));
    }
    rows.push(row);
  }
  const P = B.p, Nn = B.n;
  const tri = (a, b, c) => {
    // wind so the face points along the vertex normal (the rock material is single-sided)
    const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
    const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    if (fx * Nn[a * 3] + fy * Nn[a * 3 + 1] + fz * Nn[a * 3 + 2] >= 0) B.tri(a, b, c); else B.tri(a, c, b);
  };
  for (let i = 0; i < N; i++) for (let s = 0; s < S; s++) {
    const a = rows[i][s], b = rows[i][(s + 1) % S], c = rows[i + 1][s], d = rows[i + 1][(s + 1) % S];
    tri(a, b, c); tri(b, d, c);
  }
}
