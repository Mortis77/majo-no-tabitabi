// 向日神社 (hilltop) and 神乐练习场.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { PAL, flat, toon } from '../../core/mats.js';
import { box, cyl, cone, torus } from '../../core/geo.js';
import { t } from '../../core/i18n.js';
import { mulberry32 } from '../../core/util.js';
import { ANCHORS, POI } from '../../data/world.js';
import { Site, M, mat, bevelBox, building, pavilion, kura, stairs, fence, isClear, rod, nearestRoad, makeRoof, roofY, chigiBlade, katsuogi } from './kit.js';
import { makeTorii, makeChest, makeShrineBell, makeEmaRack } from './factories.js';
import { stoneLanternDecor, nobori, shimenawa, bellHouse, basin, makiwara, assetModel, bench, procTree, komainu } from './decor.js';
import { ropeRing, ring, ell, lumpy, lathe, rbox } from '../../props/shapes.js';

import { redPost } from './toriiFinish.js';
import { donatedBarrels, prayerDesk } from './household.js';
import { fitHaidenVeranda, layApproach, offeringChest, shrineFloorMarker } from './shrineMaterials.js';

export const shrineRoof = () => M.copper();          // verdigris copper (pavilions)
export const shrineRoofEdge = () => flat(0x3b6e62, { surface: 'tile', look: { spec: 0.3 } });

/** Add a torii to a site and register its two posts as colliders. */
export function placeTorii(site, tr, lx, lz, y, ry = 0) {
  site.add(tr.group, lx, y, lz, ry);
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const [px, pz] of tr.posts) site.colCyl(lx + px * c + pz * s, lz - px * s + pz * c, tr.postR, y - 1, y + tr.height);
  return tr;
}

export async function buildShrine(ctx) {
  const P = POI.shrine;
  const site = new Site('shrine', P.x, P.z, 0);
  const L = (x, z) => [x - P.x, z - P.z];               // world -> local (rot 0)
  const rng = mulberry32(4242);
  const roofMat = shrineRoof();
  const out = { site };

  await ctx.step('shrine');
  // --- 拝殿 haiden (north, facing south) ---------------------------------------------------------------
  {
    const floorMaterial = shrineFloorMarker();
    const b = building({ w: 12, d: 8, wallH: 3.2, base: 0.9, engawa: 1.6, floorMat: floorMaterial, rail: true, steps: true, pitch: 2.4,
      postMat: redPost(), beamMat: M.verm(), front: ['shoji', 'shoji', 'open', 'shoji', 'shoji'], left: ['plaster', 'shoji', 'plaster'], right: ['plaster', 'shoji', 'plaster'], back: 'wood',
      brackets: true, bracketMat: M.verm(),
      roof: { style: 'hip', over: 1.7, h: 4.6, shingle: true, lift: 0.9, underMat: M.wood(), rafterMat: M.woodLight() } });
    fitHaidenVeranda(b.group, floorMaterial);
    // chidori-hafu: a small gable dormer on the front slope (layered roof silhouette), gable face with a gold ornament
    {
      const P = b.roof.P, zc = 1.6 / 2 + P.hd - 2.7;
      const y0 = b.eaveY + roofY(P, 0, P.hd - 0.7) + 0.12;
      const d = makeRoof({ hw: 2.1, hd: 2.4, h: 1.55, style: 'gable', shingle: true, lift: 0.25, rafters: false, underMat: M.wood() });
      d.group.rotation.y = Math.PI / 2; d.group.position.set(0, y0, zc); b.group.add(d.group);
      const tri = new THREE.Shape(); tri.moveTo(-2.15, 0); tri.lineTo(2.15, 0); tri.lineTo(0, 1.45); tri.closePath();
      const tg = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false }), M.wood()); tg.position.set(0, y0 - 0.32, zc + 1.75); b.group.add(tg);
      b.group.add(box(0.5, 0.42, 0.1, M.gold(), 0, y0 + 0.5, zc + 1.92));
      b.group.add(box(4.3, 0.16, 0.18, M.verm(), 0, y0 - 0.3, zc + 1.92));
    }
    // shimenawa across the front beam
    b.group.add(shimenawa([-4.6, 3.95, 4.95], [4.6, 3.95, 4.95], 0.45, 0.2));
    // offering box
    const saisen = offeringChest();
    saisen.position.z = 7.6; b.group.add(saisen);
    const [lx, lz] = L(-540, 12);
    out.haidenY = site.building(b, lx, lz, 0);
    // Donated sake at the side of the worship hall, outside the bell and stair approach.
    const rackX=lx-5.10, rackZ=lz+7.05, rackY=site.h(rackX,rackZ);
    site.add(donatedBarrels(),rackX,rackY,rackZ,-.09);
    site.colBox(rackX,rackZ,1.22,.425,-.09,rackY-.15,rackY+1.66);
    // two shrine bells before the steps (live: ring())
    out.bells = [];
    for (const dx of [-2.2, 2.2]) {
      const bell = makeShrineBell();
      site.addDynamic(bell.group, lx + dx, out.haidenY, lz + 9.0 - 1.0, 0);
      out.bells.push(bell);
    }
  }
  await ctx.step('shrine');
  // --- 本殿 honden (behind, raised, chigi + katsuogi) ----------------------------------------------------
  {
    const b = building({ w: 5, d: 4.4, wallH: 2.6, base: 1.5, engawa: 0.9, ring: true, rail: true, steps: true, pitch: 1.7,
      postMat: M.verm(), beamMat: M.verm(), front: ['plaster', 'wood', 'plaster'], left: 'plaster', right: 'plaster', back: 'plaster',
      brackets: true, bracketMat: M.verm(),
      roof: { style: 'gable', over: 0.9, h: 2.7, shingle: true, underMat: M.wood(), rafterMat: M.woodLight(), lift: 0.4 } });
    const top = 1.62 + 2.6 + 0.05 + 2.7;
    for (const sx of [-1, 1]) {                         // chigi (crossed finials)
      for (const sz of [-1, 1]) { const c = chigiBlade(M.woodDark(), 1.8, 0.3, 0.12); c.position.set(sx * 4.05, top + 0.5, sz * 0.3); c.rotation.x = sz * 0.55; g0(b).add(c); }
      const cap = box(0.16, 0.12, 0.5, M.gold(), sx * 4.05, top - 0.12, 0); g0(b).add(cap);                 // gilt binding where they cross
    }
    for (let i = -1; i <= 1; i++) { const k = katsuogi(M.woodDark(), M.gold(), 1.4, 0.17); k.position.set(i * 1.4, top + 0.25, 0); g0(b).add(k); }
    const [lx, lz] = L(-540, 0.5);
    const y = site.building(b, lx, lz, 0);
    // tamagaki (low vermilion fence) around it
    const fg = new THREE.Group();
    const fy = () => 0;
    fence(fg, -5.5, 4.6, -1.6, 4.6, fy, 'wood', M.verm()); fence(fg, 1.6, 4.6, 5.5, 4.6, fy, 'wood', M.verm());
    fence(fg, -5.5, -4.6, 5.5, -4.6, fy, 'wood', M.verm()); fence(fg, -5.5, -4.6, -5.5, 4.6, fy, 'wood', M.verm()); fence(fg, 5.5, -4.6, 5.5, 4.6, fy, 'wood', M.verm());
    site.add(fg, lx, y - 1.5 + 0.0, lz);
    for (const [px, pz, hw, hd] of [[-3.55, 4.6, 1.95, 0.1], [3.55, 4.6, 1.95, 0.1], [0, -4.6, 5.5, 0.1], [-5.5, 0, 0.1, 4.6], [5.5, 0, 0.1, 4.6]]) site.colBox(lx + px, lz + pz, hw, hd, 0, y - 2, y);
  }
  await ctx.step('shrine');
  // --- 神楽殿 kagura stage (east, facing west) ------------------------------------------------------------
  {
    const b = pavilion({ w: 6, d: 6, wallH: 3.0, base: 1.1, engawa: 0.8, ring: true, rail: true, steps: true, pitch: 3,
      postMat: M.verm(), beamMat: M.verm(), back: 'wood', boardMat: mat.wood(0xd9c69a),
      roof: { style: 'hip', over: 1.3, h: 3.0, mat: roofMat, ridgeMat: shrineRoofEdge(), underMat: M.wood(), lift: 0.7 } });
    // painted pine on the back wall
    const pine = new THREE.Group();
    for (let i = 0; i < 5; i++) pine.add(box(1.2 - i * 0.18, 0.28, 0.04, M.moss(), (i % 2 ? 0.3 : -0.2), 1.9 + i * 0.3, -2.86));
    pine.add(box(0.14, 1.6, 0.04, M.woodDark(), 0, 1.7, -2.87));
    b.group.add(pine);
    b.walls = [{ x: 0, z: -3.0, hw: 3.1, hd: 0.2, y1: 4.4 }];
    const [lx, lz] = L(-519, 23);
    site.building(b, lx, lz, -Math.PI / 2);
  }
  await ctx.step('shrine');
  // --- 手水舎 temizuya (checkpoint, anchor shrine_save is in front of it) --------------------------------------
  {
    const b = pavilion({ w: 2.8, d: 1.9, wallH: 2.3, base: 0.18, pitch: 2.8, postMat: M.woodLight(), beamMat: M.woodLight(),
      roof: { style: 'hip', over: 0.8, h: 1.3, mat: roofMat, ridgeMat: shrineRoofEdge(), underMat: M.wood(), lift: 0.4 } });
    b.group.add(basin(1.7).translateY(0.18));
    b.walls = [{ x: 0, z: 0, hw: 0.95, hd: 0.5, y1: 1.0 }];
    const [lx, lz] = L(ANCHORS.shrine_save.x + 5.2, ANCHORS.shrine_save.z);
    site.building(b, lx, lz, -Math.PI / 2);
  }
  await ctx.step('shrine');
  // --- 絵馬掛け ema rack (north of anchor ema_shrine) -----------------------------------------------------
  {
    const r = makeEmaRack();
    const [lx, lz] = L(ANCHORS.ema_shrine.x, ANCHORS.ema_shrine.z + 4.6);
    const y = site.h(lx, lz);
    site.add(r.group, lx, y, lz, Math.PI);
    site.colBox(lx, lz, 1.35, 0.2, 0, y - 1, y + 2.2);
    // The rack overlooks a steep bank. Turn the desk along the contour and
    // seat its four feet on a level stone pad cut into the hillside.
    const deskX=lx+2.55, deskZ=lz-.12, turn=Math.PI*1.205;
    const deskY=site.ground(deskX,deskZ,1.02,.51,turn)+.05;
    site.add(prayerDesk(),deskX,deskY,deskZ,turn);
    site.platBox(deskX,deskZ,1.17,.66,turn,deskY,.68);
    site.colBox(deskX,deskZ,.9,.38,turn,deskY-.15,deskY+1.1);
  }
  await ctx.step('shrine');
  // --- 蔵 storehouse + the broom chest ----------------------------------------------------------------
  {
    const b = kura({ w: 4.6, d: 3.8, roofMat: M.tile() });
    const [lx, lz] = L(-567.5, 39);
    site.building(b, lx, lz, Math.PI / 2);
    const a = ANCHORS.broom_chest;
    const chest = makeChest();
    const [cx, cz] = L(a.x, a.z);
    site.addDynamic(chest.group, cx, site.h(cx, cz), cz, a.face);
    out.chest = chest;
    ctx.S.chests.broom_chest = chest;
  }
  await ctx.step('shrine');
  // --- 鐘楼 bell house -----------------------------------------------------------------------------------
  {
    const b = bellHouse(pavilion({ w: 3.4, d: 3.4, wallH: 3.6, base: 0.6, pitch: 3.4, postMat: M.verm(), beamMat: M.verm(),
      roof: { style: 'hip', over: 1.1, h: 2.0, mat: roofMat, ridgeMat: shrineRoofEdge(), underMat: M.wood(), lift: 0.6 } }));
    b.walls = [{ x: 0, z: 0, hw: 0.9, hd: 0.9, y1: 4 }];
    const [lx, lz] = L(-561, 25);
    site.building(b, lx, lz, Math.PI / 2);
  }
  await ctx.step('shrine');
  // --- pagoda (staged model) on a stone podium ----------------------------------------------------------
  {
    const pg = assetModel('bld_pagoda_red');
    const [lx, lz] = L(-509, 11);
    const y = site.ground(lx, lz, 4.6, 4.6, 0);
    site.add(box(9.6, 0.5, 9.6, M.stone(), 0, 0, 0), lx, y + 0.25, lz);
    if (pg) site.add(pg, lx, y + 0.5, lz, 0.3);
    site.colBox(lx, lz, 4.4, 4.4, 0, y - 1, y + 17);
    site.platBox(lx, lz, 4.8, 4.8, 0, y + 0.5);
  }
  await ctx.step('shrine');
  // --- 御神木 sacred tree with a shimenawa ----------------------------------------------------------------
  {
    const [lx, lz] = L(-525, 0);
    const y = site.h(lx, lz);
    site.add(procTree('broad3', 1.45, 0x4f9a48), lx, y - 0.25, lz, 0.8);
    // twisted straw rope round the trunk with zig-zag shide and straw tassels
    site.add(ropeRing(0.6, 0.3, M.rope()), lx, y + 2.3, lz);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, sh = new THREE.Group();
      for (let k = 0; k < 4; k++) sh.add(box(0.13, 0.15, 0.012, M.white(), (k % 2 ? 0.045 : -0.045), -0.08 - k * 0.14, 0));
      site.add(sh, lx + Math.cos(a) * 0.76, y + 2.2, lz + Math.sin(a) * 0.76, Math.PI / 2 - a);
      if (i % 2) { const ts = cone(0.07, 0.3, M.straw(), 0, 0, 0, 6); ts.rotation.x = Math.PI; site.add(ts, lx + Math.cos(a + 0.5) * 0.72, y + 2.0, lz + Math.sin(a + 0.5) * 0.72); }
    }
    site.add(box(1.8, 0.35, 1.8, M.stone(), 0, 0, 0), lx, y + 0.1, lz);
    site.colCyl(lx, lz, 1.0, y - 1, y + 6);
  }
  await ctx.step('shrine');
  // --- 参道 stone approach, lanterns, banners ----------------------------------------------------------
  {
    layApproach(site, L);
    // a pair of guardian komainu where the approach begins (open-mouthed on the right as one walks in)
    for (const sx of [-1, 1]) {
      await ctx.step('shrine:komainu');
      const x = -540 + sx * 2.7, z = 66.5;
      if (!isClear(x, z, 0.8, { road: 0 })) continue;
      const [lx, lz] = L(x, z), y = site.h(lx, lz);
      site.add(komainu(sx < 0, 0.95), lx, y - 0.05, lz, -sx * 0.35);
      site.colBox(lx, lz, 0.55, 0.65, -sx * 0.35, y - 1, y + 2.2);
    }
    for (const z of [36, 50, 64]) for (const sx of [-1, 1]) {
      await ctx.step('shrine:lantern');
      const [lx, lz] = L(-540 + sx * 3.7, z);
      const y = site.h(lx, lz);
      site.add(stoneLanternDecor(false, true), lx, y, lz, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      site.colCyl(lx, lz, 0.5, y - 1, y + 2.6);
    }
    let i = 0;
    for (let z = 24; z <= 70; z += 5.5) for (const sx of [-1, 1]) {
      const x = -540 + sx * 6.2;
      if (!isClear(x, z, 0.2, { road: 0 })) continue;
      const [lx, lz] = L(x, z);
      const txt = i++ % 2 ? t('structures.banner.shrineA') : t('structures.banner.shrineB');
      site.add(nobori(txt, { bg: i % 2 ? '#c8322a' : '#f6f0e2', fg: i % 2 ? '#fff6e0' : '#b2241c', crest: 'sun' }), lx, site.h(lx, lz), lz, sx > 0 ? Math.PI : 0);
    }
  }
  await ctx.step('shrine');
  // --- 石段 stairway down to the road, torii avenue -----------------------------------------------------
  {
    // the flight follows the road down the hill (road centre under the middle of the stairs)
    const top = [-549.6, 73.2], bot = [-529.4, 91.8];
    const [x0, z0] = L(...top), [x1, z1] = L(...bot);
    const y0 = site.h(x0, z0), y1 = site.h(x1, z1);
    stairs(site, x0, z0, y0, x1, z1, y1 + 0.15, 4.2, M.stone());
    const ry = Math.atan2(x1 - x0, z1 - z0);
    // side curbs
    const len = Math.hypot(x1 - x0, z1 - z0);
    const nx = Math.cos(ry), nz = -Math.sin(ry);
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      for (let k = 0; k < 18; k++) {
        const f0 = k / 18, f1 = (k + 1) / 18;
        const ax = x0 + (x1 - x0) * f0 + nx * s * 2.35, az = z0 + (z1 - z0) * f0 + nz * s * 2.35;
        const bx = x0 + (x1 - x0) * f1 + nx * s * 2.35, bz = z0 + (z1 - z0) * f1 + nz * s * 2.35;
        const ya = Math.max(y0 + (y1 - y0) * f0, site.h(ax, az)) + 0.35, yb = Math.max(y0 + (y1 - y0) * f1, site.h(bx, bz)) + 0.35;
        g.add(rod(ax, ya - 0.3, az, bx, yb - 0.3, bz, 0.28, M.stoneDark(), 4));
      }
      site.add(g);
    }
    void len;
    // torii: grand one at the foot, one at the top, an avenue of small ones on the stairs
    const plaque = t('world.place.shrine');
    placeTorii(site, makeTorii(1.25, { plaque, rope: true }), x0 + (x1 - x0) * -0.04, z0 + (z1 - z0) * -0.04, y0, ry);
    for (let k = 1; k <= 6; k++) {
      const f = k / 7.2;
      const x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
      const y = Math.max(y0 + (y1 - y0) * f, site.h(x, z)) + 0.14;
      placeTorii(site, makeTorii(0.92), x, z, y - 0.05, ry);
    }
    const nr = nearestRoad(site.wx(x1, z1), site.wz(x1, z1));
    const fx = nr.x - P.x, fz = nr.z - P.z;
    placeTorii(site, makeTorii(1.55, { plaque, rope: true }), fx, fz, site.h(fx, fz), Math.atan2(nr.dx, nr.dz));
    for (const s of [-1, 1]) {
      const lx = fx + nx * s * 5.0 - (x1 - x0) * 0.02, lz = fz + nz * s * 5.0;
      if (!isClear(site.wx(lx, lz), site.wz(lx, lz), 0.5, { road: 0.6 })) continue;
      const y = site.h(lx, lz);
      site.add(stoneLanternDecor(false, true), lx, y, lz, ry);
      site.colCyl(lx, lz, 0.5, y - 1, y + 2.6);
    }
    out.stairs = { from: [site.wx(x0, z0), site.wz(x0, z0)], to: [site.wx(x1, z1), site.wz(x1, z1)], top: y0, bottom: y1 };
  }
  await ctx.step('shrine');
  // --- low stone wall along the plateau rim (west + north), keeps the shrine readable from afar -------------
  {
    const g = new THREE.Group();
    for (let a = 1.75; a < 4.65; a += 0.06) {
      const x = -540 + Math.cos(a) * 33, z = 40 + Math.sin(a) * 33;
      if (!isClear(x, z, 0.6)) continue;
      if (Math.hypot(x + 549.6, z - 73.2) < 5.5) continue;          // leave the top of the stairway open
      const [lx, lz] = L(x, z);
      const y = site.h(lx, lz);
      g.add(box(2.1, 0.8, 0.5, M.stone(), lx, y + 0.3, lz)); g.children[g.children.length - 1].rotation.y = -a + Math.PI / 2;
    }
    site.add(g);
  }
  // trees around the precinct: cherries by the approach, pines on the rim
  for (const [x, z, id, s] of [[-556, 64, 'tree_cherry_2', 1.1], [-524, 74, 'tree_cherry_2', 1.0], [-555, 33, 'tree_cherry_1', 0.8], [-513, 40, 'tree_cherry_1', 0.85],
    [-572, 58, 'tree_pine_3', 1.1], [-560, -6, 'tree_pine_3', 1.2], [-520, -8, 'tree_pine_2', 1.1], [-506, 22, 'tree_pine_3', 1.0], [-506, 58, 'tree_pine_2', 1.0]]) {
    if (!isClear(x, z, 2, { road: 3 })) continue;
    const cherry = id.startsWith('tree_cherry');
    const key = id.replace('tree_cherry_', 'cherry').replace('tree_pine_', 'pine');
    const tr = procTree(key, s, cherry ? [0xffb7d0, 0xffc9dc, 0xff9fc2][Math.floor(rng() * 3)] : [0x4f9a58, 0x5aa860][Math.floor(rng() * 2)]);
    const [lx, lz] = L(x, z);
    const y = site.h(lx, lz);
    site.add(tr, lx, y - 0.1, lz, (x * 7 + z) % 6);
    site.colCyl(lx, lz, 0.4, y - 1, y + 4);
  }
  // a few benches + banner poles for life
  {
    const [lx, lz] = L(-552, 58);
    site.add(bench(true), lx, site.h(lx, lz), lz, Math.PI / 2);
  }
  await ctx.step('shrine:trees');
  forecourtDress(site, L);
  await ctx.step('shrine:dress');
  await site.bakeSliced(ctx.step);
  void rng;
  ctx.place('shrine', { group: site.baked, site, ...out });

  await buildTraining(ctx);
}

function g0(b) { return b.group; }

async function buildTraining(ctx) {
  const P = POI.training;
  const site = new Site('training', P.x, P.z, 0);
  const rng = mulberry32(77);
  // low fence ring with gaps for the two roads
  const g = new THREE.Group();
  const R = 19;
  for (let a = 0; a < Math.PI * 2; a += 0.09) {
    const x0 = Math.cos(a) * R, z0 = Math.sin(a) * R, x1 = Math.cos(a + 0.09) * R, z1 = Math.sin(a + 0.09) * R;
    const wx = P.x + (x0 + x1) / 2, wz = P.z + (z0 + z1) / 2;
    if (!isClear(wx, wz, 0.3, { road: 3.0 })) continue;
    fence(g, x0, z0, x1, z1, (x, z) => site.h(x, z), 'wood', M.woodLight());
  }
  site.add(g);
  // straw targets on the west half and a row along the north
  const spots = [[-9, -6], [-11, 1], [-8, 8], [-4, -12], [3, -13], [10, -9]];
  for (const [x, z] of spots) {
    const y = site.h(x, z);
    site.add(makiwara(), x, y, z, Math.atan2(-x, -z));
    site.colCyl(x, z, 0.35, y - 1, y + 2);
  }
  // rest shed (open pavilion) uphill by the road, with a bench and a weapon rack
  {
    const b = pavilion({ w: 4.2, d: 2.6, wallH: 2.4, base: 0.3, pitch: 2.1, postMat: M.wood(), back: 'wood',
      roof: { style: 'gable', over: 0.7, h: 1.1, mat: M.tile() } });
    b.group.add(bench(false).translateZ(-0.4).translateY(0.35));
    for (let i = 0; i < 4; i++) b.group.add(rod(-1.4 + i * 0.25, 0.4, -1.05, -1.3 + i * 0.25, 2.0, -1.2, 0.025, M.woodLight(), 4));
    b.walls = [{ x: 0, z: -1.3, hw: 2.2, hd: 0.15, y1: 3 }];
    site.building(b, 13, 7, -Math.PI / 2 - 0.4);
  }
  // banners
  for (const [x, z] of [[-14, -11], [-15, 9], [6, 16]]) {
    const y = site.h(x, z);
    site.add(nobori(t('structures.banner.training'), { bg: '#f6f0e2', fg: '#c8322a', crest: 'sun' }), x, y, z, rng() * 6);
  }
  await site.bakeSliced(ctx.step);
  ctx.place('training', { group: site.baked, site });
}

/**
 * Final sets: the forecourt was one even sand plane. Composition, not noise: tall pines on its east side (the key comes
 * from the east-south-east, so their long shadows lie across the approach and the sand), stone kerbs along the approach,
 * a raked-sand garden with three rock islands on moss (west, in front of the bench), stepping stones from the approach
 * to the bench, a tall memorial stone on a lotus base. Only materials the shrine site already has (no new draw calls).
 * Own random stream; the place's `rng` is untouched. Colliders only on the rocks, the stele and the tree trunks.
 */
function forecourtDress(site, L) {
  const r = mulberry32(6161);
  const at = (x, z) => { const [lx, lz] = L(x, z); return [lx, site.h(lx, lz), lz]; };
  // tall trees on the light's side of the approach
  for (const [x, z, key, s, tint] of [[-531.4, 60.2, 'pine3', 1.3, 0x4f9a58], [-530.6, 54.0, 'pine3', 1.1, 0x5aa860], [-529.8, 43.6, 'pine3', 1.05, 0x5aa860], [-530.2, 65.6, 'cherry2', 0.95, 0xffc9dc]]) {
    if (!isClear(x, z, 2, { road: 3 })) continue;
    const [lx, y, lz] = at(x, z);
    site.add(procTree(key, s, tint), lx, y - 0.1, lz, (x * 3 + z) % 6);
    site.colCyl(lx, lz, 0.4, y - 1, y + 4);
  }
  // kerbs: a line of set stones on each side of the paving (visual; the approach stays open)
  {
    const g = new THREE.Group(), st = M.stone();
    for (const sx of [-1, 1]) for (let z = 21.2; z < 67.6;) {
      const len = 0.48 + r() * 0.26;
      const [lx, y, lz] = at(-540 + sx * 1.36, z + len / 2);
      const k = bevelBox(0.2, 0.16, len - 0.04, st, lx + (r() - 0.5) * 0.03, y + 0.02, lz, 0.025);
      k.rotation.y = (r() - 0.5) * 0.04; g.add(k);
      z += len;
    }
    site.add(g);
  }
  // raked-sand garden: a stone kerb frame, straight raked ridges that part round three rock islands into rings
  {
    const cx = -552.6, cz = 44.2, hx = 4.4, hz = 3.0;
    if (isClear(cx, cz, 3.2, { road: 2 })) {
      const g = new THREE.Group(), st = M.stone(), sl = M.stoneLight(), rk = M.stoneDark(), moss = M.moss();
      const [, gy] = at(cx, cz);
      const H = (x, z) => site.h(...L(x, z));
      for (const [ax, az, bx, bz] of [[-hx, -hz, hx, -hz], [-hx, hz, hx, hz], [-hx, -hz, -hx, hz], [hx, -hz, hx, hz]]) {
        const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.62);
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n, x = cx + ax + (bx - ax) * f, z = cz + az + (bz - az) * f;
          const [lx, lz] = L(x, z);
          const k = bevelBox(az === bz ? len / n - 0.05 : 0.24, 0.17, az === bz ? 0.24 : len / n - 0.05, st, lx, H(x, z) + 0.03, lz, 0.03);
          g.add(k);
        }
      }
      // rock islands: [x, z, radius, height]
      const rocks = [[-554.3, 43.4, 0.62, 1.15], [-553.2, 44.5, 0.38, 0.5], [-549.9, 45.4, 0.5, 0.42]];
      rocks.forEach(([x, z, rr, hh], i) => {
        const [lx, lz] = L(x, z), y = H(x, z);
        const m = lumpy(rr, rk, lx, y + hh * 0.42, lz, 0.18, 31 + i * 7, 9, 7, 1, hh / rr * 0.62, 0.85);
        m.rotation.y = i * 1.3; g.add(m);
        g.add(ell(rr * 1.45, 0.07, rr * 1.25, moss, lx, y + 0.02, lz, [0, i * 0.7, 0], 12, 6));
        for (let k = 1; k <= 3; k++) { const ring0 = ring(rr * 1.3 + k * 0.24, 0.035, sl, lx, y + 0.02, lz, 28, 4); ring0.scale.set(1, 0.6, 0.86); ring0.rotation.y = i * 0.7; g.add(ring0); }
        site.colCyl(lx, lz, rr * 0.9, y - 1, y + hh);
      });
      // straight ridges along the garden, broken where the rings are
      for (let zz = -hz + 0.3; zz <= hz - 0.29; zz += 0.24) {
        const z = cz + zz;
        const cuts = [];
        for (const [x, rz, rr] of rocks) { const R = rr * 1.3 + 3 * 0.24 + 0.15, dz = (z - rz) / 0.86; if (Math.abs(dz) < R) { const w = Math.sqrt(R * R - dz * dz); cuts.push([x - w, x + w]); } }
        cuts.sort((a, b) => a[0] - b[0]);
        let x0 = cx - hx + 0.25;
        const xe = cx + hx - 0.25;
        const seg = (a, b) => { if (b - a < 0.25) return; const m = (a + b) / 2, [lx, lz] = L(m, z); g.add(box(b - a, 0.03, 0.05, sl, lx, H(m, z) + 0.015, lz)); };
        for (const [a, b] of cuts) { seg(x0, Math.min(a, xe)); x0 = Math.max(x0, b); }
        seg(x0, xe);
      }
      void gy;
      site.add(g);
    }
  }
  // stepping stones from the approach to the bench, moss between
  {
    const g = new THREE.Group(), sl = M.stoneLight(), moss = M.moss();
    for (let i = 0; i < 7; i++) {
      const f = i / 6, x = -542.0 + (-550.6 + 542.0) * f, z = 56.4 + Math.sin(f * 3.1) * 0.7 + (r() - 0.5) * 0.3;
      const [lx, y, lz] = at(x, z);
      const rr = 0.3 + r() * 0.1;
      // a little moss on one side of some stones (in the joints), not a ring round every one
      const ma = r() * 6.3; if (i % 2 === 0) g.add(ell(rr * 0.7, 0.025, rr * 0.45, moss, lx + Math.cos(ma) * rr * 0.8, y + 0.008, lz + Math.sin(ma) * rr * 0.8, [0, -ma, 0], 8, 4));
      g.add(ell(rr, 0.07, rr * 0.8, sl, lx, y + 0.03, lz, [0, r() * 3, 0], 12, 6));
    }
    site.add(g);
  }
  // memorial stone (kuyōtō-like stele) on a lotus base at the garden's north-west corner: tall, throws a long shadow
  {
    const [x, z] = [-558.6, 47.6];
    if (isClear(x, z, 1.0, { road: 2 })) {
      const [lx, y, lz] = at(x, z), cv = M.carved();
      const g = new THREE.Group();
      g.add(bevelBox(1.3, 0.3, 1.0, M.stoneDark(), 0, 0.15, 0, 0.05));
      g.add(lathe([[0.5, 0.3], [0.56, 0.36], [0.5, 0.44], [0.4, 0.5], [0, 0.5]], cv, 0, 0, 0, 8));
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.add(ell(0.15, 0.07, 0.09, cv, Math.sin(a) * 0.46, 0.43, Math.cos(a) * 0.46, [0, a, 0], 8, 5)); }
      const slab = rbox(0.62, 2.3, 0.26, cv, 0, 1.65, 0, 0.05, 2); g.add(slab);
      g.add(lathe([[0.36, 2.78], [0.4, 2.84], [0.3, 2.95], [0.12, 3.06], [0, 3.08]], cv, 0, 0, 0, 4));
      site.add(g, lx, y - 0.05, lz, 0.5);
      site.colBox(lx, lz, 0.65, 0.5, 0.5, y - 1, y + 3);
    }
  }
}
