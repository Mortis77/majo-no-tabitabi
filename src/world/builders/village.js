// 朝颜村 — thatched farmhouses, the well of the river-spirit girl, a waterwheel, morning-glory fences, a dango stall.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { PAL, toon, flat, glow } from '../../core/mats.js';
import { box, cyl, sphere } from '../../core/geo.js';
import { t } from '../../core/i18n.js';
import { mulberry32 } from '../../core/util.js';
import { ANCHORS, POI } from '../../data/world.js';
import { Site, M, mat, building, pavilion, isClear, rod, rope, textTexture, texMat, makeRoof, clothify } from './kit.js';
import { dryingRack, moningGloryFence, scarecrow, noticeBoard, waterwheel, jizo, bench, parasol, assetModel, procTree } from './decor.js';
import { hokora } from './kit.js';
import { harvestStation, millBales, dangoKitchen } from './household.js';

export async function buildVillage(ctx) {
  const P = POI.village;
  const site = new Site('village', P.x, P.z, 0);
  const L = (x, z) => [x - P.x, z - P.z];
  const rng = mulberry32(915);
  const vrng = mulberry32(4421);                                     // dressing only (placement stream untouched)
  const thatchMats = [M.thatch(), mat.thatch(0xb8995c), mat.thatch(0xcdb27a)];
  const out = { site };

  await ctx.step('village');
  // --- farmhouses -----------------------------------------------------------------------------------------
  const houses = [
    [-481, 166, 2.2], [-494, 148, 1.6], [-470, 188, 3.0], [-441, 186, 3.3], [-410, 183, 3.6],
    [-426, 138, 0.0], [-400, 140, 0.3], [-472, 117, 0.6], [-446, 104, 0.2],
  ];
  for (const [i, [x, z, ry]] of houses.entries()) {
    await ctx.step('village:house');
    const w = 7 + (i % 3), d = 5.5 + (i % 2);
    // every farmhouse a little different: layout of the front, old silvered boards or plaster, veranda or not
    const fronts = [['shoji', 'open', 'shoji', 'shoji'], ['wood', 'open', 'shoji', 'shoji'], ['shoji', 'shoji', 'open', 'wood'], ['lattice', 'open', 'shoji', 'lattice']];
    const b = building({ w, d, wallH: 2.3 + (i % 4 === 1 ? 0.2 : 0), base: 0.45, engawa: i % 4 === 3 ? 0 : 1.0, pitch: w / 4,
      front: fronts[i % 4], back: 'wood', left: ['wood', 'plaster'], right: ['plaster', 'wood'], koshi: true,
      postMat: M.woodDark(), beamMat: M.woodDark(), boardMat: i % 2 ? M.woodOld() : M.wood(), plasterMat: i % 3 === 1 ? M.plasterWarm() : M.plaster(),
      roof: { style: 'thatch', over: 1.2 + (i % 3) * 0.1, h: 3.4 + (i % 2) * 0.5, mat: thatchMats[i % 3], underMat: M.woodDark() } });
    farmDress(b.group, w, d, i, vrng);
    eaveDress(b.group, w, d, i, b.eaveY || 2.75, i % 4 === 3 ? 0 : 1.0);
    // Sorting baskets live on the raised veranda, snug against a closed wall bay.
    if ([1, 4, 5, 8].includes(i)) {
      const station=harvestStation(i===5,PERSIMMON()), sx=i===4 ? 1 : -1;
      station.position.set(sx*(w/2-1.25),.57,d/2+.49);
      b.group.add(station);
      b.walls.push({x:station.position.x,z:station.position.z,hw:i===5 ? 1.35 : .8,hd:.41,y1:1.55});
    }
    const [lx, lz] = L(x, z);
    site.building(b, lx, lz, ry);
    // a drying rack or a log pile beside some houses
    const side = i % 2 ? 1 : -1;
    const ox = Math.cos(ry) * side * (w / 2 + 2.6), oz = -Math.sin(ry) * side * (w / 2 + 2.6);
    if (i % 3 !== 2 && isClear(x + ox, z + oz, 2.2)) {
      const [rx, rz] = L(x + ox, z + oz);
      site.add(dryingRack(3.6), rx, site.h(rx, rz), rz, ry + Math.PI / 2);
      site.colBox(rx, rz, 0.4, 1.9, ry + Math.PI / 2 + Math.PI / 2, site.h(rx, rz) - 1, site.h(rx, rz) + 2);
    }
  }

  await ctx.step('village');
  // --- the well (阿汐 lives in it) beside anchor village_elder ------------------------------------------------
  {
    const a = ANCHORS.village_elder;
    const [lx, lz] = L(a.x - 3.0, a.z - 4.8);
    const y = site.h(lx, lz);
    const wg = new THREE.Group();
    wg.add(cyl(1.05, 1.15, 0.85, M.stone(), 0, 0.42, 0, 12));
    wg.add(cyl(0.85, 0.85, 0.05, mat.none(PAL.water, { spec: 0.5, specPower: 60 }), 0, 0.7, 0, 12));
    wg.add(cyl(1.12, 1.12, 0.1, M.stoneDark(), 0, 0.88, 0, 12));
    for (const sx of [-1, 1]) wg.add(box(0.14, 2.3, 0.14, M.wood(), sx * 1.0, 1.15, 0));
    wg.add(box(2.3, 0.12, 0.14, M.wood(), 0, 2.25, 0));
    wg.add(cyl(0.15, 0.15, 0.35, M.woodDark(), 0, 2.08, 0, 8));
    wg.add(rod(0, 2.0, 0, 0, 1.1, 0.2, 0.012, M.rope(), 4));
    wg.add(cyl(0.2, 0.16, 0.3, M.wood(), 0, 1.0, 0.2, 8));
    const r = makeRoof({ hw: 1.5, hd: 1.2, h: 0.75, style: 'gable', mat: M.thatch(), lift: 0.1, thick: 0.18 });
    r.group.position.y = 2.3; wg.add(r.group);
    // a cucumber offering and a little lotus pot: Ushio's
    wg.add(box(0.45, 0.06, 0.2, mat.paint(0x5aa04a), 1.25, 0.9, 0.3));
    site.add(wg, lx, y, lz, 0.4);
    site.colCyl(lx, lz, 1.15, y - 1, y + 1);
    site.colCyl(lx + Math.cos(0.4) * 1.0, lz - Math.sin(0.4) * 1.0, 0.12, y - 1, y + 2.5);
    site.colCyl(lx - Math.cos(0.4) * 1.0, lz + Math.sin(0.4) * 1.0, 0.12, y - 1, y + 2.5);
    out.well = { x: P.x + lx, z: P.z + lz, y };
  }
  await ctx.step('village');
  // --- dango stall (anchor village_dango stands in front of it) ---------------------------------------------
  {
    const a = ANCHORS.village_dango;
    const b = pavilion({ w: 3.2, d: 2.0, wallH: 2.1, base: 0.12, pitch: 3.2, postMat: M.wood(), beamMat: M.wood(), back: 'wood', plinth: 'none',
      roof: { style: 'gable', over: 0.55, h: 0.9, mat: M.thatch() } });
    b.group.add(box(3.0, 0.9, 0.6, M.woodLight(), 0, 0.45, 0.6));
    for (let i = 0; i < 6; i++) {           // skewers of dango on the counter
      const x = 0.02 + i * 0.22;
      b.group.add(cyl(0.008, 0.008, 0.32, M.woodLight(), x, 1.05, 0.6, 3));
      for (let k = 0; k < 3; k++) b.group.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat.paint([0xf6c6d4, 0xfffaf0, 0x9ed38a][k])).translateX(x).translateY(0.98 + k * 0.08).translateZ(0.6));
    }
    const nm = texMat(textTexture(t('structures.noren.dango'), { w: 256, h: 96, bg: '#c8322a', fg: '#fff3dd' }));
    const nor = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), nm); nor.position.set(0, 1.95, 1.06); b.group.add(nor);
    const steamers=dangoKitchen();
    steamers.position.set(-.80,.90,.55);b.group.add(steamers);
    b.walls = [{ x: 0, z: 0.6, hw: 1.5, hd: 0.3, y1: 1.2 }];
    const [lx, lz] = L(a.x, a.z - 5.0);
    site.building(b, lx, lz, 0);
    // tea benches with a parasol
    for (const [dx, dz] of [[-4.4, -4.0], [4.2, -3.6]]) {
      const x = a.x + dx, z = a.z + dz;
      if (!isClear(x, z, 1)) continue;
      const [bx, bz] = L(x, z);
      const y = site.h(bx, bz);
      site.add(bench(true), bx, y, bz, 0.1);
      site.add(parasol(), bx + 0.4, y, bz - 0.5);
    }
  }
  await ctx.step('village');
  // --- notice board on the plaza, jizo and a hokora by the road -------------------------------------------
  {
    const [lx, lz] = L(-461.5, 155.5);
    const y = site.h(lx, lz);
    site.add(noticeBoard(t('structures.notice.village')), lx, y, lz, 2.5);
    site.colBox(lx, lz, 1.1, 0.2, 2.5, y - 1, y + 2.6);
    const [jx, jz] = L(-476, 133);
    for (let i = 0; i < 3; i++) site.add(jizo(0.9), jx + i * 0.7, site.h(jx, jz), jz, 2.3);
    const hk = hokora({ scale: 1.1 });
    const [hx, hz] = L(-389, 168);
    site.building(hk, hx, hz, Math.PI + 0.1);
  }
  await ctx.step('village');
  // --- waterwheel + mill on a wooden flume (north-east edge) ------------------------------------------------
  {
    const [lx, lz] = L(-412, 118);
    const mill = building({ w: 5, d: 4.5, wallH: 2.6, base: 0.4, pitch: 2.5, front: ['wood', 'shoji'], back: 'wood', left: 'wood', right: 'wood',
      postMat: M.woodDark(), roof: { style: 'thatch', over: 0.7, h: 2.8, mat: M.thatch() } });
    // Stacked rice is loaded from the dry side, opposite the flume.
    const sacks=millBales();sacks.position.set(-3.52,0,.05);sacks.rotation.y=1.30;mill.group.add(sacks);
    mill.walls.push({x:-3.52,z:.05,hw:.72,hd:1.23,y1:1.50});
    site.building(mill, lx, lz, 0.25);
    const y = site.h(lx, lz);
    const ww = waterwheel(2.6);
    const wx = lx + Math.cos(0.25) * 3.6, wz = lz - Math.sin(0.25) * 3.6;
    site.add(ww.group, wx, y + 2.5, wz, 0.25 + Math.PI / 2);
    // flume: a trough on trestles coming from the hill to the top of the wheel
    const fl = new THREE.Group();
    const water = glow(0x9fdcff, 1.05);
    for (let k = 0; k < 6; k++) {
      const fz = -1.2 - k * 2.2;
      fl.add(box(0.9, 0.12, 2.2, M.wood(), 0, 5.35, fz), box(0.08, 0.35, 2.2, M.wood(), -0.45, 5.5, fz), box(0.08, 0.35, 2.2, M.wood(), 0.45, 5.5, fz));
      fl.add(box(0.75, 0.04, 2.2, water, 0, 5.45, fz));
      fl.add(box(0.12, 5.35, 0.12, M.woodDark(), -0.5, 2.67, fz), box(0.12, 5.35, 0.12, M.woodDark(), 0.5, 2.67, fz));
    }
    site.add(fl, wx, y, wz, 0.25 + Math.PI);
    site.colCyl(wx, wz, 2.0, y - 1, y + 5.5);
    ctx.tick((dt) => { ww.wheel.rotation.z -= dt * 0.6; });
  }
  await ctx.step('village');
  // --- morning-glory fences along the lanes ---------------------------------------------------------------
  {
    const runs = [[-486, 158, -472, 158], [-466, 174, -452, 176], [-436, 174, -420, 172], [-417, 151, -401, 152], [-437, 120, -421, 124], [-488, 128, -478, 136], [-460, 108, -452, 98]];
    for (const [x0, z0, x1, z1] of runs) {
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0);
      if (!isClear(mx, mz, 0.5, { road: 2.6 })) continue;
      const [lx, lz] = L(mx, mz);
      const ry = Math.atan2(z0 - z1, x1 - x0);
      const y = site.h(lx, lz);
      site.add(moningGloryFence(len, rng), lx, y, lz, ry);
      site.colBox(lx, lz, len / 2, 0.12, ry, y - 1, y + 1.3);
    }
  }
  await ctx.step('village');
  // --- persimmon / cherry trees in the yards -------------------------------------------------------------
  for (const [x, z, id] of [[-487, 178, 'tree_cherry_2'], [-430, 196, 'tree_broadleaf_1'], [-397, 128, 'tree_cherry_2'], [-482, 103, 'tree_broadleaf_2'], [-433, 160, 'tree_cherry_2']]) {
    if (!isClear(x, z, 2, { road: 3 })) continue;
    const tr = id === 'tree_cherry_2' ? procTree('cherry2', 1, 0xffc9dc) : procTree(id === 'tree_broadleaf_1' ? 'broad1' : 'broad2', 1, 0x7ccc55);
    const [lx, lz] = L(x, z);
    const y = site.h(lx, lz);
    site.add(tr, lx, y - 0.1, lz, rng() * 6);
    site.colCyl(lx, lz, 0.45, y - 1, y + 4);
  }
  await ctx.step('village:yards');
  plazaDress(site, L);
  await ctx.step('village:plaza');
  await site.bakeSliced(ctx.step);
  ctx.place('village', { group: site.baked, ...out });

  await ctx.step('village');
  // --- scarecrows out in the fields (separate light site, far from the houses) ------------------------------
  const fields = new Site('village_fields', P.x, P.z, 0);
  let n = 0;
  for (const [a, r] of [[0.3, 100], [0.9, 112], [1.5, 98], [1.9, 120], [2.6, 104], [-0.4, 108], [-1.0, 96]]) {
    const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
    if (!isClear(x, z, 1, { road: 4 })) continue;
    const [lx, lz] = L(x, z);
    fields.add(scarecrow(rng), lx, fields.h(lx, lz), lz, rng() * 6);
    n++;
  }
  // Harvested strips along the field margins. Tilt each rail along the slope and
  // keep the road shoulder and reserved quest areas clear across its full length.
  for (const [x,z,len,rot] of [[-318,139,5.9,.40],[-348,130,4.3,.35],[-371,183,5.1,-.24],[-552,167,4.8,.18]]) {
    const dx=Math.cos(rot)*len/2, dz=-Math.sin(rot)*len/2;
    const clearance=len/2+.65;
    if (!isClear(x,z,clearance,{road:4}) || G.world.isReserved(x,z,clearance) || G.world.riverDist(x,z)<9) continue;
    const [lx,lz]=L(x,z);
    const left = fields.h(lx-dx,lz-dz), right=fields.h(lx+dx,lz+dz);
    const y=(left+right)/2, frame=new THREE.Group(), rack=dryingRack(len);
    rack.rotation.z=Math.atan2(right-left,len); frame.add(rack);
    fields.add(frame,lx,y,lz,rot);
    fields.colBox(lx,lz,len/2,.34,rot,Math.min(left,right)-.24,Math.max(left,right)+1.85);
  }
  await fields.bakeSliced(ctx.step);
  ctx.place('village_fields', { group: fields.baked, count: n });
  void assetModel;
}

// ---------------------------------------------------------------------------------------------------------------
/**
 * Three farmhouse variants by index (house frame: front +z, w x d footprint): a lean-to annex with stacked firewood
 * on the side away from the drying rack (i % 3 = 0), a laundry line behind the house (1), a woodpile and tubs at
 * the back wall (2). No colliders: everything hugs the walls under the eaves.
 */
function farmDress(g, w, d, i, r) {
  const hw = w / 2, hd = d / 2, side = i % 2 ? -1 : 1;                 // opposite the drying rack
  const logs = mat.wood(0x8a6a48), ends = mat.wood(0xc9a77a), dk = M.woodDark();
  const woodpile = (x, z, len, rows, ry) => {
    const p = new THREE.Group();
    for (let k = 0; k < rows; k++) for (let j = 0; j < Math.round(len / 0.2); j++) {
      const lg = cyl(0.09, 0.09, 0.62, j % 3 ? logs : ends, -len / 2 + 0.1 + j * 0.2 + (k % 2) * 0.1, 0.1 + k * 0.17, 0, 6); lg.rotation.x = Math.PI / 2; p.add(lg);
    }
    p.position.set(x, 0.45, z); p.rotation.y = ry; g.add(p);
  };
  if (i % 3 === 0) {
    const ax = side * (hw + 0.95);
    const slab = box(1.9, 0.08, d * 0.7, M.thatchDark(), ax, 2.25, 0); slab.rotation.z = -side * 0.32; g.add(slab);
    for (const zz of [-d * 0.32, d * 0.32]) g.add(box(0.12, 1.55, 0.12, dk, side * (hw + 1.75), 1.22, zz));
    g.add(box(0.1, 0.12, d * 0.68, dk, side * (hw + 1.75), 1.92, 0));
    woodpile(side * (hw + 0.5), 0, d * 0.55, 4, Math.PI / 2);
    g.add(box(0.5, 0.4, 0.5, M.woodLight(), side * (hw + 1.3), 0.65, d * 0.22));          // chopping block
  } else if (i % 3 === 1) {
    const z = -hd - 1.6, x0 = -hw * 0.7, x1 = hw * 0.7;
    for (const x of [x0, x1]) g.add(cyl(0.05, 0.06, 2.0, dk, x, 1.45, z, 6));
    const rp = rope([x0, 2.35, z], [x1, 2.35, z], 0.18, 0.012, M.rope(), 8); g.add(rp.mesh);
    const cl = [0xe8e2d4, 0x6a7fae, 0xb8574a, 0xd9c48a, 0x7c9b6e];
    const n = 3 + Math.floor(r() * 3);
    for (let k = 1; k <= n; k++) {
      const [x, y, zz] = rp.at(k / (n + 1));
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + r() * 0.3, 0.7 + r() * 0.3, 2, 3), clothify(mat.cloth(cl[Math.floor(r() * cl.length)]), 0.1));
      c.material.side = THREE.DoubleSide; c.castShadow = false; c.position.set(x, y - 0.42, zz); g.add(c);
    }
  } else {
    woodpile(0, -hd - 0.45, w * 0.5, 3, 0);
    for (const k of [0, 1]) g.add(cyl(0.32, 0.28, 0.42, M.wood(), -hw + 0.7 + k * 0.75, 0.66, -hd - 0.55, 10));
    g.add(cyl(0.34, 0.34, 0.04, M.woodDark(), -hw + 0.7, 0.86, -hd - 0.55, 10));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Final sets. Façades got depth (eaves 0.35 m deeper, things hanging under them) and the plaza became a place.
const PERSIMMON = () => mat.paint(0xe2782c, { spec: 0.25, specPower: 30 });

/**
 * Under the front eave of a farmhouse (house frame, front +z): strings of drying persimmons from the eave beam, a
 * straw rain cape and hats on the wall, a hoe and a rake leaning by the door, an unlit paper lantern; and a line of
 * drip stones where the rain falls off the thatch (all round the house). No colliders: it all hugs the walls.
 */
function eaveDress(g, w, d, i, eaveY, ev = 0) {
  const r = mulberry32(900 + i * 17);
  const hw = w / 2, hd = d / 2, fz = hd + 0.32, top = Math.min(eaveY, 2.7) - 0.05;
  const pm = PERSIMMON(), rp = M.rope(), straw = M.straw(), wd = M.wood();
  // persimmon strings, in two groups either side of the door
  for (const gx of [-hw * 0.62, hw * 0.55]) {
    if (r() < 0.25) continue;
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const x = gx + (k - (n - 1) / 2) * 0.24, len = 0.9 + r() * 0.35;
      g.add(rod(x, top, fz, x, top - len, fz, 0.006, rp, 3));
      for (let j = 0; j < Math.round(len / 0.11); j++) g.add(new THREE.Mesh(_pers || (_pers = new THREE.IcosahedronGeometry(0.046, 0)), pm).translateX(x + (j % 2 ? 0.012 : -0.012)).translateY(top - 0.08 - j * 0.11).translateZ(fz));
    }
  }
  // straw cape (mino) and two hats on pegs beside the door; tools leaning on the wall
  const side = i % 2 ? 1 : -1;
  const cape = cyl(0.12, 0.34, 0.85, straw, side * (hw - 0.45), 1.35, hd + 0.1, 8); cape.scale.z = 0.35; g.add(cape);
  for (const k of [0, 1]) { const h = cyl(0.03, 0.3, 0.14, straw, side * (hw - 1.05 - k * 0.5), 1.75 - k * 0.12, hd + 0.08, 10); h.rotation.x = Math.PI / 2 - 0.15; g.add(h); }
  g.add(rod(-side * (hw - 0.6), 0.45, hd + 0.35, -side * (hw - 0.75), 1.85, hd + 0.08, 0.022, wd, 5));
  g.add(box(0.2, 0.04, 0.12, M.stoneDark(), -side * (hw - 0.6), 0.47, hd + 0.38));
  g.add(rod(-side * (hw - 0.95), 0.45, hd + 0.4, -side * (hw - 1.05), 1.95, hd + 0.08, 0.02, wd, 5));
  for (let k = 0; k < 6; k++) g.add(box(0.012, 0.12, 0.012, wd, -side * (hw - 0.95) + (k - 2.5) * 0.04, 0.42, hd + 0.4));
  g.add(box(0.26, 0.03, 0.03, wd, -side * (hw - 0.95), 0.48, hd + 0.4));
  // an unlit paper lantern on a bracket by the door
  if (i % 3 !== 1) { const lx = side * 0.9; g.add(rod(lx, top - 0.02, hd + 0.05, lx, top - 0.02, hd + 0.45, 0.015, M.woodDark(), 4)); g.add(cyl(0.14, 0.14, 0.32, M.paper(), lx, top - 0.38, hd + 0.45, 10)); g.add(cyl(0.1, 0.1, 0.05, M.woodDark(), lx, top - 0.2, hd + 0.45, 8), cyl(0.1, 0.1, 0.05, M.woodDark(), lx, top - 0.56, hd + 0.45, 8)); }
  // drip stones: a band of river stones on the ground where the eave drips (the eave reaches about 1.2 m beyond walls)
  const st = M.stone(), ex = hw + 1.05, ez = hd + 1.05, ef = hd + ev + 1.05;   // the roof also covers the veranda
  const runs = [[-ex, -ez, ex, -ez], [ex, -ez, ex, ef], [ex, ef, -ex, ef], [-ex, ef, -ex, -ez]];
  for (const [ax, az, bx, bz] of runs) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 0.21);
    for (let k = 0; k < n; k++) {
      const f = (k + r()) / n, x = ax + (bx - ax) * f, z = az + (bz - az) * f, o = (r() - 0.5) * 0.22;
      const s = 0.07 + r() * 0.05;
      const m = new THREE.Mesh(_peb || (_peb = new THREE.IcosahedronGeometry(1, 0)), st);
      m.scale.set(s * 1.3, s * 0.55, s); m.rotation.y = r() * 3;
      m.position.set(x + (az === bz ? 0 : o), s * 0.15 - 0.02, z + (az === bz ? o : 0)); g.add(m);
    }
  }
}
let _pers = null, _peb = null;

/**
 * The plaza (around the junction and the well): a big shade tree on its east side whose shadow crosses the open ground,
 * a hand-cart loaded with straw by the notice board, flower tubs, firewood with a chopping block near the well.
 * Colliders on the cart, the tubs and the tree trunk; the roads and the anchors' circles stay clear.
 */
function plazaDress(site, L) {
  const at = (x, z) => { const [lx, lz] = L(x, z); return [lx, site.h(lx, lz), lz]; };
  const okAt = (x, z, rr) => isClear(x, z, rr, { road: 2.4 });                 // anchors' circles + roads
  // shade tree
  for (const [x, z] of [[-438.5, 163], [-440, 166]]) {
    if (!okAt(x, z, 1.5)) continue;
    const [lx, y, lz] = at(x, z);
    site.add(procTree('broad1', 1.3, 0x86c95a), lx, y - 0.1, lz, 2.2);
    site.colCyl(lx, lz, 0.5, y - 1, y + 4);
    break;
  }
  // hand-cart (daihachi) with straw bundles and a tub
  for (const [x, z, ry] of [[-458.6, 160.2, 0.55], [-457, 161.5, 0.4]]) {
    if (!okAt(x, z, 1.3)) continue;
    const [lx, y, lz] = at(x, z);
    const g = new THREE.Group(), wd = M.wood(), dk = M.woodDark();
    for (let k = 0; k < 5; k++) g.add(box(0.95, 0.05, 0.3, k % 2 ? M.woodLight() : wd, 0, 0.72, -0.62 + k * 0.31));
    for (const sx of [-1, 1]) {
      g.add(box(0.07, 0.08, 2.9, dk, sx * 0.47, 0.68, 0.45));                      // side rails running out as shafts
      const wh = new THREE.Group();
      wh.add(cyl(0.56, 0.56, 0.07, dk, 0, 0, 0, 18).rotateZ(Math.PI / 2));
      wh.add(cyl(0.48, 0.48, 0.09, wd, 0, 0, 0, 18).rotateZ(Math.PI / 2));
      for (let k = 0; k < 6; k++) { const sp = box(0.04, 0.9, 0.04, dk, 0, 0, 0); sp.rotation.x = (k / 6) * Math.PI; wh.add(sp); }
      wh.add(cyl(0.09, 0.09, 0.16, dk, 0, 0, 0, 8).rotateZ(Math.PI / 2));
      wh.position.set(sx * 0.6, 0.56, 0); g.add(wh);
    }
    g.add(box(1.0, 0.06, 0.06, dk, 0, 0.69, 1.85));                                // cross bar at the shafts' end
    g.add(box(0.06, 0.62, 0.06, dk, 0, 0.36, 1.6));                                // prop leg
    for (let k = 0; k < 3; k++) { const b = cyl(0.17, 0.19, 0.85, M.straw(), -0.25 + k * 0.25, 0.95, -0.2 + (k % 2) * 0.1, 8); b.rotation.x = Math.PI / 2; g.add(b); g.add(cyl(0.2, 0.2, 0.05, M.rope(), -0.25 + k * 0.25, 0.95, -0.2 + (k % 2) * 0.1, 8).rotateX(Math.PI / 2)); }
    g.add(cyl(0.22, 0.19, 0.34, wd, 0.22, 0.92, 0.45, 10));
    g.rotation.x = 0.06;
    site.add(g, lx, y, lz, ry);
    site.colBox(lx, lz, 0.75, 1.2, ry, y - 1, y + 1.3);
    break;
  }
  // flower tubs: wooden tubs with morning glories climbing a bamboo cone
  const bloom = [glow(0x7aa8ff, 1.05), glow(0xb68cff, 1.05)], vine = mat.paint(0x4f8f3e), bam = mat.wood(0xa7b56b);
  let tubs = 0;
  // a pair flanking the notice board (along its face), a pair by the dango stall's benches
  const okRoad = (x, z) => isClear(x, z, 0.4, { road: 2.4 });
  for (const [x, z] of [[-462.9, 154.4], [-460.1, 156.6], [-449.9, 130.4], [-438.5, 130.8]]) {
    if (tubs >= 4 || !okRoad(x, z)) continue;
    const [lx, y, lz] = at(x, z);
    const g = new THREE.Group();
    g.add(cyl(0.34, 0.28, 0.42, M.wood(), 0, 0.21, 0, 12));
    for (const yy of [0.08, 0.34]) g.add(cyl(0.345, 0.33, 0.035, M.rope(), 0, yy, 0, 12));
    g.add(cyl(0.3, 0.3, 0.03, M.woodDark(), 0, 0.41, 0, 12));
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; g.add(rod(Math.cos(a) * 0.22, 0.4, Math.sin(a) * 0.22, 0, 1.25, 0, 0.012, bam, 4)); }
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, hh = 0.5 + (k / 9) * 0.7, rr = 0.24 * (1 - (hh - 0.4) / 1.0);
      const lf = sphere(0.09, vine, Math.cos(a) * rr, hh, Math.sin(a) * rr, 6, 4); lf.scale.set(1.2, 0.7, 1); g.add(lf);
      if (k % 2 === 0) g.add(sphere(0.045, bloom[k % 4 ? 0 : 1], Math.cos(a + 0.5) * (rr + 0.05), hh + 0.04, Math.sin(a + 0.5) * (rr + 0.05), 6, 4));
    }
    site.add(g, lx, y, lz, tubs * 1.7);
    site.colCyl(lx, lz, 0.36, y - 1, y + 0.6);
    tubs++;
  }
  // firewood stack and a chopping block with an axe, near the well
  for (const [x, z, ry] of [[-458.6, 145.6, 0.9], [-449.8, 139.4, 0.4]]) {
    if (!okAt(x, z, 1.0)) continue;
    const [lx, y, lz] = at(x, z);
    const g = new THREE.Group(), logs = mat.wood(0x8a6a48), ends = mat.wood(0xc9a77a);
    for (let k = 0; k < 4; k++) for (let j = 0; j < 9 - k; j++) { const lg = cyl(0.09, 0.09, 0.62, (j + k) % 3 ? logs : ends, -0.8 + j * 0.2 + k * 0.1, 0.09 + k * 0.165, 0, 6); lg.rotation.x = Math.PI / 2; g.add(lg); }
    g.add(cyl(0.26, 0.28, 0.42, M.woodLight(), 1.3, 0.21, 0.2, 10));
    g.add(rod(1.3, 0.42, 0.2, 1.55, 0.75, 0.45, 0.02, M.wood(), 4));
    site.add(g, lx, y, lz, ry);
    site.colBox(lx, lz, 1.0, 0.4, ry, y - 1, y + 0.8);
    break;
  }
}
