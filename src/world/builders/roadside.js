// Roadside: the twelve relightable stone lanterns, signposts at the junctions, jizo, wayside torii, benches.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { t } from '../../core/i18n.js';
import { mulberry32 } from '../../core/util.js';
import { POI, ROADS, STONE_LANTERNS } from '../../data/world.js';
import { Site, M, isClear, hokora, nearestRoad } from './kit.js';
import { makeStoneLantern, makeSignpost, makeTorii } from './factories.js';
import { jizo, bench, nobori } from './decor.js';

export async function buildRoadside(ctx) {
  await ctx.step('roadside');
  // --- the twelve stone lanterns (live, unlit; gameplay lights them) -----------------------------------------
  for (const s of STONE_LANTERNS) {
    await ctx.step('roadside:lantern');
    const h = makeStoneLantern();
    // a few data points sit almost on the road centre: nudge those sideways so the path stays open (<= 1.6 m)
    let sx = s.x, sz = s.z;
    const nr = nearestRoad(sx, sz);
    if (nr.d < 2.3) {
      let nx = sx - nr.x, nz = sz - nr.z, nl = Math.hypot(nx, nz);
      if (nl < 1e-3) { nx = -nr.dz; nz = nr.dx; nl = 1; }
      sx = nr.x + (nx / nl) * 2.3; sz = nr.z + (nz / nl) * 2.3;
    }
    const y = G.world.heightAt(sx, sz);
    h.group.position.set(sx, y, sz);
    // face the nearest road
    let best = null;
    for (const r of ROADS) for (const p of r.pts) { const d = Math.hypot(p[0] - sx, p[1] - sz); if (!best || d < best.d) best = { d, p }; }
    h.group.rotation.y = Math.atan2(nr.x - sx, nr.z - sz);
    G.scene.add(h.group);
    G.world.addCollider({ x: sx, z: sz, r: 0.45, y0: y - 1, y1: y + 2.6, tag: 'stonelantern' });
    h.id = s.id; h.pos = new THREE.Vector3(sx, y, sz);
    ctx.S.stoneLanterns[s.id] = h;
    ctx.cull(h.group, h.pos, 300);
  }

  const rng = mulberry32(606);
  await ctx.step('roadside');
  // --- signposts at the junctions ----------------------------------------------------------------------------
  const junctions = [POI.training, POI.foxvillage, POI.town, POI.dusktree, POI.sunhill];
  const destOf = (r, fromEnd) => {               // place at the other end of a road
    const p = fromEnd ? r.pts[0] : r.pts[r.pts.length - 1];
    let best = null;
    for (const k in POI) { const q = POI[k]; const d = Math.hypot(q.x - p[0], q.z - p[1]); if (!best || d < best.d) best = { d, id: k }; }
    return best.id;
  };
  let signs = 0;
  for (const J of junctions) {
    const legs = [];
    for (const r of ROADS) {
      const a = r.pts[0], b = r.pts[r.pts.length - 1];
      if (Math.hypot(a[0] - J.x, a[1] - J.z) < 1) { const n = r.pts[1]; const l = Math.hypot(n[0] - J.x, n[1] - J.z); legs.push({ ux: (n[0] - J.x) / l, uz: (n[1] - J.z) / l, dest: destOf(r, false) }); }
      else if (Math.hypot(b[0] - J.x, b[1] - J.z) < 1) { const n = r.pts[r.pts.length - 2]; const l = Math.hypot(n[0] - J.x, n[1] - J.z); legs.push({ ux: (n[0] - J.x) / l, uz: (n[1] - J.z) / l, dest: destOf(r, true) }); }
    }
    if (legs.length < 2) continue;
    const dist = J === POI.town ? 66 : J === POI.foxvillage ? 46 : J === POI.dusktree ? 30 : 26;
    for (const leg of legs) {
      // traveller arrives along this leg walking (-ux,-uz); the sign stands on their right and faces them
      const px = -leg.uz, pz = leg.ux;
      let x = J.x + leg.ux * dist + px * 3.4, z = J.z + leg.uz * dist + pz * 3.4;
      if (!isClear(x, z, 0.4, { road: 1.6 })) { x = J.x + leg.ux * dist - px * 3.4; z = J.z + leg.uz * dist - pz * 3.4; if (!isClear(x, z, 0.4, { road: 1.6 })) continue; }
      const wx = -leg.ux, wz = -leg.uz;                          // walking direction
      const lines = [t('structures.sign.to', { arrow: t('structures.sign.arrowU'), place: t('world.place.' + (J === POI.dusktree ? 'dusktree' : J.id)) })];
      for (const o of legs) {
        if (o === leg) continue;
        const cross = wx * o.uz - wz * o.ux, dot = wx * o.ux + wz * o.uz;
        const arrow = dot > 0.7 ? 'arrowU' : cross > 0 ? 'arrowR' : 'arrowL';
        lines.push(t('structures.sign.to', { arrow: t('structures.sign.' + arrow), place: t('world.place.' + o.dest) }));
      }
      const sp = makeSignpost(lines.join('\n'));
      const y = G.world.heightAt(x, z);
      const site = new Site('signpost', 0, 0, 0);
      site.add(sp.group, x, y, z, Math.atan2(leg.ux, leg.uz));
      site.colCyl(x, z, 0.15, y - 1, y + 2.5);
      await site.bakeSliced(ctx.step);
      ctx.cull(site.baked, { x, y, z }, 170);
      signs++;
    }
  }
  await ctx.step('roadside');
  // --- wayside things along the roads: jizo, small torii with a hokora, benches -------------------------------
  const settle = ['bellcrown', 'shrine', 'training', 'village', 'foxvillage', 'town', 'dusktree', 'crystal', 'windshrine', 'palace'];
  const far = (x, z) => settle.every((k) => Math.hypot(POI[k].x - x, POI[k].z - z) > POI[k].r + 22);
  let n = 0;
  for (const r of ROADS) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (l < 40) continue;
      const ux = (bx - ax) / l, uz = (bz - az) / l;
      const f = 0.35 + rng() * 0.3;
      const side = rng() < 0.5 ? 1 : -1;
      const x = ax + (bx - ax) * f - uz * side * 4.8, z = az + (bz - az) * f + ux * side * 4.8;
      if (!far(x, z) || !isClear(x, z, 1.5, { road: 2.2 }) || G.world.heightAt(x, z) < 0.5) continue;
      const y = G.world.heightAt(x, z);
      const face = Math.atan2(uz * side, -ux * side);
      const kind = n % 3;
      const site = new Site('wayside', 0, 0, 0);
      if (kind === 0) {
        for (let k = 0; k < 2 + (n % 2); k++) site.add(jizo(0.95), x + ux * (k - 0.5) * 0.7, y, z + uz * (k - 0.5) * 0.7, face);
        site.colCyl(x, z, 0.7, y - 1, y + 1);
      } else if (kind === 1) {
        site.building(hokora({ scale: 0.9 }), x, z, face);
        site.add(makeTorii(0.42).group, x + Math.sin(face) * 1.8, y, z + Math.cos(face) * 1.8, face);
      } else {
        site.add(bench(false), x, y, z, face);
        site.add(nobori(t('structures.banner.shrineB'), { bg: '#f6f0e2', fg: '#b2241c', h: 3.4, crest: 'sun' }), x + ux * 1.4, y, z + uz * 1.4, face);
      }
      await site.bakeSliced(ctx.step);
      ctx.cull(site.baked, { x, y, z }, 170);
      n++;
    }
  }
  ctx.place('roadside', { signs, wayside: n });
}
