// Ground animals of the countryside (map round, 2026-11-22): roe deer with a stag, foxes, wild rabbits and sheep
// flocks. Purely ambient (no colliders, no gameplay, no save). Each species is ONE instanced skinned mesh
// (life/skinned.js); herds live on fixed sites drawn from the countryside plan (copse and wood edges, meadows, the moor
// and the heath, field margins) and are streamed in around the heroine (spawn 50–260 m, recycled beyond 330 m, fading
// in and out by scale). They graze, look up, wander a few metres, and bolt: from her on foot (sooner when she runs),
// from a low pass of the broom, from her landing, and from every blast, spell, fire or explosion near them (the
// threats life.js collects). The whole herd takes the alarm; rabbits zig-zag; sheep bunch and trot.
import * as THREE from 'three';
import { mulberry32 } from '../../core/util.js';
import { JOURNEY_POI, CITY } from '../../data/journey-map.js';
import { countryPlan, zoneWeights } from '../flora/countryside-plan.js';
import { standEllipse } from '../flora/forest-stands.js';
import { bakeAsset, makeHerdMesh } from './skinned.js';
import { bakeRabbit } from './rabbit.js';

const TAU = Math.PI * 2;
const SPECIES = {
  deer: { asset: 'ani_deer', clips: { idle: ['Idle', 12], walk: ['Walk', 24], run: ['Gallop', 30], eat: ['Eating', 10] }, walk: 1.15, walkClip: 1.2, run: 8.5, runClip: 8, shy: 26, broom: 36, group: [3, 5], max: 4, cap: 22, scale: [0.9, 1.05], tints: [[1, 1, 1], [1.05, 0.98, 0.92], [0.94, 0.92, 0.9]] },
  stag: { asset: 'ani_stag', clips: { idle: ['Idle', 12], walk: ['Walk', 24], run: ['Gallop', 30], eat: ['Eating', 8] }, walk: 1.15, walkClip: 1.2, run: 8.5, runClip: 8, shy: 30, broom: 40, scale: [0.95, 1.05], cap: 6, tints: [[1, 1, 1]] },
  fox: { asset: 'ani_fox', clips: { idle: ['Idle', 12], walk: ['Walk', 24], run: ['Gallop', 30], eat: ['Eating', 10] }, walk: 1.3, walkClip: 1.3, run: 7.5, runClip: 7, shy: 17, broom: 26, group: [1, 2], max: 3, cap: 8, scale: [1.1, 1.25], tints: [[1, 1, 1], [1.08, 0.96, 0.9]] },
  rabbit: { proc: true, clips: null, walk: 0.9, walkClip: 1.3, run: 6.2, runClip: 4.5, shy: 11, broom: 18, group: [3, 7], max: 6, cap: 40, scale: [0.9, 1.15], tints: [[1, 1, 1], [0.9, 0.88, 0.85], [1.08, 1.04, 0.98]] },
  sheep: { asset: 'ani_sheep', clips: { idle: ['Idle', 8], walk: ['Walk', 20], run: ['Run', 24], eat: ['Idle_Eating', 10] }, walk: 0.7, walkClip: 0.8, run: 3.8, runClip: 4, shy: 8, broom: 14, group: [6, 11], max: 3, cap: 34, scale: [0.9, 1.05], tints: [[1, 1, 1], [0.96, 0.95, 0.92], [1.02, 1.0, 0.97]] },
};
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const rnd = (a, b) => a + Math.random() * (b - a);
const _o = new THREE.Object3D(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export function createHerds(G, root, tier) {
  const W = G.world;
  const plan = countryPlan(W);
  const kinds = {};
  // ---- bodies
  for (const [k, def] of Object.entries(SPECIES)) {
    let baked = null;
    try { baked = def.proc ? bakeRabbit() : bakeAsset(G, def.asset, def.clips); } catch (e) { G.reportError('life:herd:' + k, e); }
    if (!baked) continue;
    const cap = Math.max(4, Math.round(def.cap * Math.max(0.45, tier)));
    const mesh = makeHerdMesh(baked, cap, k);
    root.add(mesh);
    kinds[k] = { def, baked, mesh, cap, count: 0 };
  }
  // ---- sites
  const zw = [0, 0, 0, 0];
  const story = Object.values(JOURNEY_POI).filter((p) => p.r < 160);
  function ground(x, z, pad = 0) {
    if (Math.abs(x) > 2380 || z < -1060 || z > 660) return false;
    const h = W.heightAt(x, z);
    if (h < 1 || W.slopeAt(x, z) > 0.42 || W.isReserved(x, z, 3 + pad)) return false;
    if (Math.hypot(x - CITY.x, z - CITY.z) < 220) return false;
    for (const p of story) if (Math.hypot(x - p.x, z - p.z) < p.r + 25) return false;
    return !plan.fieldAt(x, z, 1) || plan.fieldAt(x, z, 1).kind === 'hay';
  }
  const sites = { deer: [], fox: [], rabbit: [], sheep: [] };
  const sr = mulberry32(6061);
  for (const c of plan.copses) for (let k = 0; k < 2; k++) {
    const a = sr() * TAU, d = c.r + 12 + sr() * 18, x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
    if (ground(x, z)) sites.deer.push({ x, z });
  }
  for (let z = -1000; z < 600; z += 70) for (let x = -2380; x < 2380; x += 70) {
    const jx = x + sr() * 70, jz = z + sr() * 70, roll = sr();
    zoneWeights(jx, jz, zw);
    const se = standEllipse(jx, jz);
    if (se > 1.04 && se < 1.3 && roll < 0.35 && ground(jx, jz)) { sites.deer.push({ x: jx, z: jz }); continue; }
    if (roll < 0.11 && ground(jx, jz)) { sites.fox.push({ x: jx, z: jz }); continue; }
    if (roll > 0.62 && roll < 0.62 + 0.18 + 0.12 * zw[2] && se > 1.0 && ground(jx, jz)) { sites.rabbit.push({ x: jx, z: jz }); continue; }
    if ((zw[1] > 0.5 || zw[2] > 0.6) && roll > 0.94 && ground(jx, jz)) sites.sheep.push({ x: jx, z: jz });
  }
  for (const f of plan.fields) if (f.kind === 'hay' && sr() < 0.5 && ground(f.x, f.z)) sites.sheep.push({ x: f.x, z: f.z });
  for (const k in sites) for (const s of sites[k]) { s.active = false; s.k = k; }

  const groups = [];
  const st = { spawnT: 0, time: 0, alarms: 0 };

  function spawn(k, site) {
    const K = kinds[k], def = SPECIES[k];
    if (!K) return null;
    const n = Math.max(1, Math.round(rnd(def.group[0], def.group[1] + 0.99) * (tier < 0.5 ? 0.7 : 1)));
    const g = { k, site, x: site.x, z: site.z, agents: [], leaving: false, alarm: 0, calmT: 0 };
    const add = (kk) => {
      const D = SPECIES[kk], a = Math.random() * TAU, r = Math.sqrt(Math.random()) * (kk === 'sheep' ? 7 : 5);
      const x = site.x + Math.sin(a) * r, z = site.z + Math.cos(a) * r;
      const t = D.tints[Math.floor(Math.random() * D.tints.length)];
      g.agents.push({ k: kk, x, z, y: W.heightAt(x, z), yaw: Math.random() * TAU, pitch: 0, speed: 0, mode: Math.random() < 0.6 ? 'eat' : 'idle', t: rnd(0, 6), clip: 'eat', clipT: rnd(0, 5), prev: null, prevT: 0, fade: 1, s: 0, scale: rnd(D.scale[0], D.scale[1]), tint: t, gx: x, gz: z, zig: 0 });
    };
    for (let i = 0; i < n; i++) add(k);
    if (k === 'deer' && kinds.stag && Math.random() < 0.7) add('stag');
    site.active = true;
    groups.push(g);
    return g;
  }
  function manage(P) {
    for (const g of groups) if (Math.hypot(g.x - P.x, g.z - P.z) > 330) g.leaving = true;
    for (const k of ['deer', 'fox', 'rabbit', 'sheep']) {
      if (!kinds[k]) continue;
      const def = SPECIES[k];
      const want = Math.max(1, Math.round(def.max * tier));
      let have = 0; for (const g of groups) if (g.k === k && !g.leaving) have++;
      if (have >= want) continue;
      let best = null, bd = 1e9;
      for (const s of sites[k]) {
        if (s.active) continue;
        const d = Math.hypot(s.x - P.x, s.z - P.z);
        if (d < 55 || d > 260) continue;
        const score = d + Math.random() * 80;
        if (score < bd) { bd = score; best = s; }
      }
      if (best) spawn(k, best);
    }
  }
  function setClip(a, c) {
    if (a.clip === c) return;
    a.prev = a.clip; a.prevT = a.clipT; a.clip = c; a.clipT = 0; a.fade = 0;
  }
  function threatAt(a, P, threats, def) {
    // the heroine: on foot (sooner when she runs), on a low broom, or a fresh landing (life threat)
    const dx = a.x - P.x, dz = a.z - P.z, d = Math.hypot(dx, dz);
    let R = 0;
    if (P.broom) { const alt = P.y - W.heightAt(P.x, P.z); R = alt < 42 ? def.broom * (1 - Math.max(0, alt - 6) / 42) : 0; }
    else R = P.fast ? def.shy : def.shy * 0.62;
    if (d < R) return { x: P.x, z: P.z };
    for (const t of threats) if (Math.hypot(a.x - t.x, a.z - t.z) < t.r * 1.8 + 6) return t;
    return null;
  }
  function update(dt, P, threats) {
    if (!P) return;
    st.time += dt;
    st.spawnT -= dt;
    if (st.spawnT <= 0) { st.spawnT = 0.5; manage(P); }
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      // alarm: any member that sees a threat panics the herd
      let src = null;
      for (const a of g.agents) { const th = threatAt(a, P, threats, SPECIES[a.k]); if (th) { src = th; break; } }
      if (src) { if (g.alarm <= 0) st.alarms++; g.alarm = 4.5 + Math.random() * 2; g.sx = src.x; g.sz = src.z; }
      g.alarm -= dt;
      let cx = 0, cz = 0, alive = 0;
      for (const a of g.agents) {
        const def = SPECIES[a.k];
        a.t -= dt;
        if (g.alarm > 0) {
          if (a.mode !== 'flee') { a.mode = 'flee'; a.zig = 0; }
          let ax = a.x - g.sx, az = a.z - g.sz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
          let want = Math.atan2(ax, az);
          if (a.k === 'rabbit') { a.zig -= dt; if (a.zig <= 0) { a.zig = rnd(0.35, 0.8); a.zo = rnd(-0.9, 0.9); } want += a.zo || 0; }
          a.yaw += angDiff(a.yaw, want) * Math.min(1, dt * 5);
          a.speed += (def.run - a.speed) * Math.min(1, dt * 3);
        } else {
          if (a.mode === 'flee') { a.mode = 'idle'; a.t = rnd(1.5, 3); a.gx = a.x; a.gz = a.z; g.x = a.x; g.z = a.z; }
          if (a.t <= 0) {
            const r = Math.random();
            if (r < 0.45) { a.mode = 'eat'; a.t = rnd(5, 12); }
            else if (r < 0.7) { a.mode = 'idle'; a.t = rnd(2, 5); }
            else { a.mode = 'walk'; a.t = rnd(3, 7); const ang = Math.random() * TAU, rr = rnd(2, a.k === 'sheep' ? 9 : 7); a.gx = g.x + Math.sin(ang) * rr; a.gz = g.z + Math.cos(ang) * rr; }
          }
          if (a.mode === 'walk') {
            const dx = a.gx - a.x, dz = a.gz - a.z, d = Math.hypot(dx, dz);
            if (d < 0.6) { a.mode = 'idle'; a.t = rnd(2, 4); }
            else a.yaw += angDiff(a.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 2.2);
            a.speed += ((d < 0.6 ? 0 : def.walk) - a.speed) * Math.min(1, dt * 2);
          } else a.speed += (0 - a.speed) * Math.min(1, dt * 3);
        }
        // move, keep to dry, gentle ground
        if (a.speed > 0.02) {
          const sx = Math.sin(a.yaw), sz = Math.cos(a.yaw);
          const nx = a.x + sx * a.speed * dt, nz = a.z + sz * a.speed * dt;
          const hn = W.heightAt(nx + sx * 1.5, nz + sz * 1.5), hc = W.heightAt(nx, nz);
          if (hn < 0.6 || Math.abs(hn - hc) > 1.1 || Math.abs(nx) > 2400) a.yaw += dt * 3; // turn away from water / steep ground
          else { a.x = nx; a.z = nz; }
        }
        const y = W.heightAt(a.x, a.z);
        const fx = Math.sin(a.yaw) * 0.7, fz = Math.cos(a.yaw) * 0.7;
        const pitch = Math.atan2(W.heightAt(a.x + fx, a.z + fz) - W.heightAt(a.x - fx, a.z - fz), 1.4);
        a.pitch += (-pitch - a.pitch) * Math.min(1, dt * 6);
        a.y = y;
        // animation
        const clip = a.mode === 'flee' ? 'run' : a.mode === 'walk' ? 'walk' : a.mode === 'eat' ? 'eat' : 'idle';
        const rc = a.k === 'rabbit' ? (clip === 'run' || clip === 'walk' ? 'hop' : clip === 'idle' && g.alarm > -2 && g.alarm < 0 ? 'alert' : clip) : clip;
        setClip(a, rc);
        const rate = rc === 'run' ? a.speed / def.runClip : rc === 'walk' ? a.speed / def.walkClip : rc === 'hop' ? Math.max(0.6, a.speed / (a.mode === 'flee' ? def.runClip : def.walkClip)) : 1;
        a.clipT += dt * rate; a.prevT += dt;
        if (a.fade < 1) a.fade = Math.min(1, a.fade + dt * 4);
        // fade in / out by scale
        const target = g.leaving ? 0 : 1;
        a.s += Math.sign(target - a.s) * Math.min(Math.abs(target - a.s), dt * 1.2);
        if (a.s > 0.001) alive++;
        cx += a.x; cz += a.z;
      }
      if (g.alarm > 0) { g.x = cx / g.agents.length; g.z = cz / g.agents.length; }
      if (g.leaving && !alive) { g.site.active = false; groups.splice(gi, 1); }
    }
    write(P);
  }
  function rows(info, t) {
    const f = ((t * info.fps) % info.frames + info.frames) % info.frames, i = Math.floor(f);
    return [info.row0 + i, info.row0 + (i + 1) % info.frames, f - i];
  }
  function write(P) {
    for (const k in kinds) kinds[k].count = 0;
    let near = {};
    for (const g of groups) for (const a of g.agents) {
      const K = kinds[a.k];
      if (!K || a.s <= 0.001 || K.count >= K.cap) continue;
      const d = Math.hypot(a.x - P.x, a.z - P.z);
      if (d > 340) continue;
      near[a.k] = Math.min(near[a.k] ?? 1e9, d);
      const i = K.count++;
      _o.position.set(a.x, a.y - 0.02, a.z);
      _e.set(a.pitch, a.yaw, 0, 'YXZ'); _o.quaternion.setFromEuler(_e);
      _o.scale.setScalar(a.scale * a.s);
      _o.updateMatrix();
      K.mesh.setMatrixAt(i, _o.matrix);
      const C = K.baked.clips, cur = C[a.clip] || C.idle;
      const A = K.mesh.userData.attrs;
      if (a.fade < 1 && a.prev && C[a.prev]) {
        const p = rows(C[a.prev], a.prevT), c = rows(cur, a.clipT);
        A.iAnim.setXYZW(i, p[0], c[0], a.fade, 0);
      } else { const c = rows(cur, a.clipT); A.iAnim.setXYZW(i, c[0], c[1], c[2], 0); }
      A.iTint.setXYZ(i, a.tint[0], a.tint[1], a.tint[2]);
    }
    for (const k in kinds) {
      const K = kinds[k], m = K.mesh;
      m.count = K.count; m.visible = K.count > 0;
      m.castShadow = (near[k] ?? 1e9) < 75;
      if (!K.count) continue;
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, K.count * 16); m.instanceMatrix.needsUpdate = true;
      for (const n of ['iAnim', 'iTint']) { const at = m.userData.attrs[n]; at.clearUpdateRanges(); at.addUpdateRange(0, K.count * at.itemSize); at.needsUpdate = true; }
    }
  }
  return {
    update, groups, sites, kinds,
    /** spawn a group of `k` at (x,z) now (tests) */
    spawnAt(k, x, z) { const s = { x, z, k, active: false }; return spawn(k, s); },
    clear() { for (const g of groups) g.leaving = true; },
    stats() {
      const by = {}; for (const g of groups) for (const a of g.agents) by[a.k] = (by[a.k] || 0) + 1;
      const tris = Object.values(kinds).reduce((s, K) => s + K.count * K.baked.tris, 0);
      return { groups: groups.length, by, drawn: Object.fromEntries(Object.entries(kinds).map(([k, K]) => [k, K.count])), tris, alarms: st.alarms, sites: Object.fromEntries(Object.entries(sites).map(([k, v]) => [k, v.length])), drawCalls: Object.values(kinds).filter((K) => K.mesh.visible).length };
    },
  };
}
