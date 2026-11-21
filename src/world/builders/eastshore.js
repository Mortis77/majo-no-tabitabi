// 暗潮岸 (east shore, x 690 z 60, everlasting night) — an abandoned fishing cove: a ruined pier walking out into the
// dark tide (broken decking, lone posts further out), two boat sheds on the shingle, a torii standing in the water,
// weathered stone markers and a fallen lantern. Decoration only: no colliders on any road, nothing gameplay uses.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { glow } from '../../core/mats.js';
import { box, cyl } from '../../core/geo.js';
import { mulberry32 } from '../../core/util.js';
import { POI } from '../../data/world.js';
import { Site, M, mat, building, isClear, rope } from './kit.js';
import { makeTorii } from './factories.js';
import { placeTorii } from './shrine.js';
import { dryingRack, stoneLanternDecor } from './decor.js';
import { rcyl, lumpy } from '../../props/shapes.js';

export async function buildEastShore(ctx) {
  const P = POI.eastshore;
  if (!P) return;
  // origin on the beach east of the POI centre, local +z = world +x (out to sea)
  const site = new Site('eastshore', P.x + 42, P.z + 10, Math.PI / 2);
  const rng = mulberry32(6907);
  const old = M.woodOld(), dark = M.woodDark(), wet = mat.wood(0x3a3430);
  const clear = (lx, lz, r) => isClear(site.wx(lx, lz), site.wz(lx, lz), r, { road: 3 });

  await ctx.step('eastshore');
  // --- the ruined pier ---------------------------------------------------------------------------------------
  const deckY = 1.6, w = 2.4, z0 = 0, len = 34;
  const pier = new THREE.Group();
  const broken = (z) => (z > 13 && z < 16.5) || z > 27;               // a collapsed bay and a lost far end
  for (let z = z0; z < z0 + len; z += 0.5) {
    if (broken(z) && rng() < 0.82) continue;
    const miss = rng() < 0.1;
    if (miss) continue;
    const pl = box(w * (0.8 + rng() * 0.2), 0.1, 0.44, rng() < 0.3 ? wet : old, (rng() - 0.5) * 0.25, deckY - 0.05 - (z > 27 ? (z - 27) * 0.18 : 0), z + 0.25);
    pl.rotation.set((rng() - 0.5) * 0.06, (rng() - 0.5) * 0.12, z > 27 ? -0.12 : (rng() - 0.5) * 0.05); pier.add(pl);
  }
  for (let z = z0; z <= z0 + len + 9; z += 3) for (const sx of [-1, 1]) {
    if (rng() < (z > z0 + len ? 0.45 : 0.12)) continue;              // some posts gone; lone ones stand further out
    const gy = Math.min(site.h(sx * (w / 2 - 0.1), z), 0.2) - 1.5;
    const top = deckY + 0.35 - (z > z0 + len ? rng() * 0.9 : 0);
    const p = cyl(0.13, 0.16, top - gy, rng() < 0.5 ? dark : wet, sx * (w / 2 - 0.1), (top + gy) / 2, z, 6);
    p.rotation.z = (rng() - 0.5) * (z > 24 ? 0.25 : 0.06); pier.add(p);
  }
  // stringers (one snapped), mooring post with rope and a dim lamp at the end of the standing part
  pier.add(box(0.12, 0.12, 13, dark, -w / 2 + 0.05, deckY - 0.13, z0 + 6.5), box(0.12, 0.12, 13, dark, w / 2 - 0.05, deckY - 0.13, z0 + 6.5));
  const snap = box(0.12, 0.12, 9, dark, w / 2 - 0.05, deckY - 0.5, 21.5); snap.rotation.x = 0.12; pier.add(snap);
  pier.add(box(0.12, 0.12, 9, dark, -w / 2 + 0.05, deckY - 0.13, 21.5));
  pier.add(cyl(0.07, 0.07, 2.4, dark, w / 2 - 0.05, deckY + 1.1, 12.5, 6), box(0.55, 0.05, 0.05, dark, w / 2 + 0.2, deckY + 2.25, 12.5));
  const lampG = new THREE.Group();
  lampG.add(box(0.26, 0.34, 0.26, glow(0x8fd8ff, 1.5), 0, 0, 0), box(0.32, 0.05, 0.32, M.black(), 0, 0.19, 0), box(0.3, 0.04, 0.3, M.black(), 0, -0.19, 0));
  lampG.position.set(w / 2 + 0.42, deckY + 1.95, 12.5); lampG.traverse((o) => { if (o.isMesh) o.castShadow = false; }); pier.add(lampG);
  const bol = rcyl(0.18, 0.22, 0.6, dark, -w / 2 - 0.25, deckY + 0.05, 9.5, 8); pier.add(bol);
  pier.add(rope([-w / 2 - 0.25, deckY + 0.25, 9.5], [-w / 2 - 3.2, 0.05, 12.5], 0.25, 0.025, M.rope(), 8).mesh);
  site.add(pier);
  // only the standing part near the shore is walkable (a platform, not a wall)
  site.platBox(0, z0 + 7.5, w / 2, 7.5, 0, deckY, 2.2);

  await ctx.step('eastshore');
  // --- boat sheds (funaya) on the shingle, open to the sea, a skiff inside each ---------------------------------
  for (const [lx, lz, ry] of [[-11, -3, 0], [-19.5, -4.5, 0.12]]) {
    if (!clear(lx, lz, 4.5)) continue;
    const b = building({ w: 5.2, d: 6.4, wallH: 2.4, base: 0.2, pitch: 2.6, front: 'open', back: 'wood', left: 'wood', right: 'wood',
      postMat: dark, beamMat: dark, boardMat: old, roof: { style: 'gable', over: 0.6, h: 1.7, shingle: true, underMat: dark, lift: 0.2 } });
    const skiff = new THREE.Group();
    const hull = lumpy(1, wet, 0, 0.35, 0, 0.03, 3, 10, 6, 0.75, 0.38, 2.3); skiff.add(hull);
    skiff.add(box(1.25, 0.08, 4.2, old, 0, 0.62, 0), box(1.1, 0.06, 0.3, old, 0, 0.6, 0.6), box(1.1, 0.06, 0.3, old, 0, 0.6, -0.9));
    skiff.position.set(0.1, 0.25, 0.8); skiff.rotation.y = 0.05; b.group.add(skiff);
    b.group.add(dryingRack(3.0).translateZ(-2.6).translateX(-1.2));
    site.building(b, lx, lz, ry);
  }

  await ctx.step('eastshore');
  // --- the torii in the water -----------------------------------------------------------------------------------
  {
    const lx = -14, lz = 26;
    const tr = makeTorii(1.35, { rope: true });
    const y = Math.max(site.h(lx, lz), -3.2);
    tr.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    placeTorii(site, tr, lx, lz, y, 0);
  }

  await ctx.step('eastshore');
  // --- weathered stone markers along the shore, one leaning, a toppled lantern ------------------------------------
  const stoneM = M.stoneDark(), moss = M.moss();
  for (let i = 0; i < 7; i++) {
    const lx = 6 + i * 3.1 + (rng() - 0.5) * 1.2, lz = -6 - rng() * 3;
    if (!clear(lx, lz, 0.6)) continue;
    const g = new THREE.Group(), h = 1.1 + rng() * 1.2;
    g.add(lumpy(0.5, stoneM, 0, h / 2, 0, 0.06, 20 + i, 7, 6, 0.55, h, 0.4));
    g.add(lumpy(0.5, moss, 0, 0.08, 0, 0.08, 40 + i, 7, 4, 0.7, 0.2, 0.55));
    if (i % 3 === 0) g.add(box(0.5, 0.3, 0.45, stoneM, 0, h + 0.05, 0));                       // a little cap stone
    g.rotation.set((rng() - 0.5) * 0.25, rng() * 3, (rng() - 0.5) * (i === 4 ? 0.7 : 0.15));
    site.add(g, lx, site.h(lx, lz) - 0.1, lz);
  }
  {
    const lx = 4.5, lz = -12;
    if (clear(lx, lz, 1)) { const l = stoneLanternDecor(false); site.add(l, lx, site.h(lx, lz) + 0.35, lz); l.rotation.set(0, 0.4, 1.35); }
  }
  // mooring posts out in the shallows, a sunken skiff's ribs
  for (let i = 0; i < 5; i++) {
    const lx = 5 + i * 1.7, lz = 10 + (i % 2) * 1.5;
    const gy = Math.min(site.h(lx, lz), 0) - 1;
    site.add(cyl(0.12, 0.15, 1.8 + (i % 3) * 0.4 - gy, wet, 0, 0, 0, 6), lx, gy + (1.8 + (i % 3) * 0.4 - gy) / 2, lz);
  }
  {
    const lx = -6, lz = 6, gy = Math.min(site.h(lx, lz), 0.1);
    const ribs = new THREE.Group();
    for (let k = 0; k < 6; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 4, 8, Math.PI), wet); r.position.z = -1.5 + k * 0.6; r.rotation.z = Math.PI; ribs.add(r); }
    ribs.add(box(0.1, 0.1, 3.6, wet, 0, -0.8, 0));
    ribs.rotation.set(0.1, 0.6, 0.25); site.add(ribs, lx, gy + 0.55, lz);
  }
  await site.bakeSliced(ctx.step);
  ctx.place('eastshore', { group: site.baked, site });
  void G;
}
