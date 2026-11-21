// 万灯镇 — the lantern town in the everlasting night: lamp tower at the centre, town houses with glowing windows along
// the three streets, a market of stalls under strings of paper lanterns, gates, an inn, a taiko stage, bridges of light.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { PAL, toon, flat, glow, glowDynamic } from '../../core/mats.js';
import { box, cyl, cone, sphere, torus } from '../../core/geo.js';
import { t } from '../../core/i18n.js';
import { mulberry32, TAU } from '../../core/util.js';
import { ANCHORS, POI, ROADS } from '../../data/world.js';
import { Site, M, mat, building, pavilion, townHouse, isClear, nearestRoad, rod, rope, makeRoof, textTexture, texGlow, texMat, windowMat, sharedMat, clothify, bevelBox } from './kit.js';
import { paperLanternStatic } from './dusk.js';
import { paintLettering } from './lettering.js';
import { fontsReady, whenFontsReady } from '../../core/fonts.js';
import { stoneLanternDecor, nobori, bench } from './decor.js';

export async function buildTown(ctx) {
  const P = POI.town;
  const site = new Site('town', P.x, P.z, 0);
  const L = (x, z) => [x - P.x, z - P.z];
  const rng = mulberry32(2051);
  // dressing draws from its own stream so the placement stream (house / stall positions) stays exactly as it was
  const drng = mulberry32(7331);
  const win = windowMat(1);
  const roofMat = M.tileNight();
  const nightPlaster = mat.plaster(0xb4a892);
  // one dynamic glow shared by every street lantern + the tower, so the whole town can be dimmed / relit at once
  const townLamp = glowDynamic(0xff9a4a, 2.6);
  const townLampRed = glowDynamic(0xff5a3a, 2.4);
  const townLampWhite = glowDynamic(0xffe2b0, 2.4);
  const lampMats = [townLamp, townLampRed, townLampWhite];
  const out = { site };
  const occ = [];                                                   // occupied circles (world x, z, r)
  const free = (x, z, r) => occ.every((o) => Math.hypot(o[0] - x, o[1] - z) > o[2] + r);
  const take = (x, z, r) => occ.push([x, z, r]);
  take(P.x, P.z, 9);

  await ctx.step('town');
  // --- spokes: the three streets leaving the centre --------------------------------------------------------
  const spokes = [];
  for (const r of ROADS) {
    const i = r.pts.findIndex(([x, z]) => x === P.x && z === P.z);
    if (i < 0) continue;
    const nb = i === 0 ? r.pts[1] : r.pts[i - 1];
    const dx = nb[0] - P.x, dz = nb[1] - P.z, l = Math.hypot(dx, dz);
    spokes.push({ id: r.id, ux: dx / l, uz: dz / l, len: l });
  }
  const market = spokes.reduce((a, b) => (b.uz > a.uz ? b : a));   // the street running south is the market street
  const at = (s, d, off) => [P.x + s.ux * d - s.uz * off, P.z + s.uz * d + s.ux * off];

  await ctx.step('town');
  // --- lamp tower at the centre (anchor town_lamp) -------------------------------------------------------------
  out.tower = buildTower(site, townLamp);

  await ctx.step('town');
  // --- houses along every street, stalls on the market street -------------------------------------------------------
  let houses = 0;
  const signs = ['inn', 'lamp', 'tea', 'sake', 'food', 'shop', 'fish', 'sweets'];
  for (const s of spokes) {
    const isMarket = s === market;
    const off = isMarket ? 12.8 : 8.2;
    for (let d = 19; d <= 62; d += 8.6) {
      await ctx.step('town:houses');
      for (const side of [-1, 1]) {
        await ctx.step('town:house');
        const [x, z] = at(s, d + (side > 0 ? 2 : -1), side * off);
        if (Math.hypot(x - P.x, z - P.z) > 66) continue;
        if (!free(x, z, 4.4) || !isClear(x, z, 4.2, { road: 2.6 })) continue;
        // face the street: the front (+z local) points back toward the road centre
        const fx = side * s.uz, fz = -side * s.ux;
        const ryF = Math.atan2(fx, fz);
        const shop = rng() < 0.6 ? signs[houses % signs.length] : null;
        const noren = shop ? t('structures.noren.' + shop) : '';
        const w = 6.2 + (houses % 3) * 0.6;
        const b = townHouse({ w, d: 6, winMat: win, roofMat, plasterMat: nightPlaster, noren, norenCrest: 'lantern', norenBg: ['#28304f', '#7a2a24', '#2f4a3a'][houses % 3] });
        // eave lanterns either side of the door
        for (const lx of [-2.2, 2.2]) { const l = streetLantern(lampMats, drng, houses + (lx > 0 ? 1 : 0)); l.position.set(lx, 3.3, 3.5); b.group.add(l); }
        dressFront(b.group, w, 6, shop, drng, lampMats);
        const [ax, az] = L(x, z);
        site.building(b, ax, az, ryF);
        take(x, z, 4.4);
        houses++;
      }
    }
    // paper lantern strings zig-zagging across the street
    for (let d = 15; d <= 60; d += 6.5) {
      const [x0, z0] = at(s, d, -(off - 3.2)), [x1, z1] = at(s, d + 3.2, off - 3.2);
      if (Math.hypot(x0 - P.x, z0 - P.z) > 64) continue;
      if (!isClear(x0, z0, 0.2, { road: 1.6 }) || !isClear(x1, z1, 0.2, { road: 1.6 })) continue;
      lanternString(site, L(x0, z0), L(x1, z1), lampMats, rng, drng);
    }
    if (isMarket) {
      for (let d = 17; d <= 56; d += 4.6) for (const side of [-1, 1]) {
        const [x, z] = at(s, d, side * 5.0);
        if (!free(x, z, 1.6) || !isClear(x, z, 1.6, { road: 3.4 })) continue;
        const fx = side * s.uz, fz = -side * s.ux;
        const st = stall(rng, lampMats);
        const [ax, az] = L(x, z);
        site.building(st, ax, az, Math.atan2(fx, fz), null, { roofPads: false });
        take(x, z, 1.6);
      }
    }
    // gate where the street leaves town
    const [gx, gz] = at(s, Math.min(62, s.len - 1.5), 0);
    gate(site, L(gx, gz), Math.atan2(s.ux, s.uz), win, roofMat, lampMats);
  }
  // fill the blocks between the streets: back rows facing the nearest street
  for (let k = 0; k < 400 && houses < 22; k++) {
    const a = rng() * TAU, r = 20 + rng() * 42;
    const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
    if (!free(x, z, 4.6) || !isClear(x, z, 4.4, { road: 3.2 })) continue;
    const nr = nearestRoad(x, z);
    const ryF = Math.atan2(nr.x - x, nr.z - z);
    const b = townHouse({ w: 6 + (houses % 3) * 0.7, d: 6, winMat: win, roofMat, plasterMat: nightPlaster, noren: null });
    for (const lx of [-2.2, 2.2]) { const l = streetLantern(lampMats, drng, houses + (lx > 0 ? 1 : 0)); l.position.set(lx, 3.3, 3.5); b.group.add(l); }
    if (drng() < 0.5) dressFront(b.group, 6 + (houses % 3) * 0.7, 6, null, drng, lampMats);
    const [ax, az] = L(x, z);
    site.building(b, ax, az, ryF);
    take(x, z, 4.6);
    houses++;
  }
  out.houses = houses;

  await ctx.step('town');
  // --- inn (three storeys) -----------------------------------------------------------------------------------------
  {
    const spots = [[176, -152, 0.75], [234, -160, -0.6], [170, -138, 1.2]];
    for (const [x, z, ry] of spots) {
      if (!free(x, z, 8) || !isClear(x, z, 8, { road: 5 })) continue;
      const g = new THREE.Group();
      const b1 = building({ w: 12, d: 9, wallH: 3.0, base: 0.5, engawa: 1.2, rail: true, steps: true, pitch: 2.4, front: ['lattice', 'lattice', 'open', 'lattice', 'lattice'], left: 'shoji', right: 'shoji', back: 'plaster', winMat: win,
        postMat: M.woodDark(), beamMat: M.woodDark(), roof: { style: 'hip', over: 1.2, h: 0.9, mat: roofMat, lift: 0.5 } });
      g.add(b1.group);
      const b2 = building({ w: 10, d: 7.5, wallH: 2.6, base: 0.01, plinth: 'none', engawa: 0.8, ring: true, rail: true, pitch: 2.5, front: 'shoji', left: 'shoji', right: 'shoji', back: 'shoji', winMat: win,
        postMat: M.woodDark(), beamMat: M.woodDark(), roof: { style: 'hip', over: 1.1, h: 0.8, mat: roofMat, lift: 0.45 } });
      b2.group.position.y = 4.15; g.add(b2.group);
      const b3 = building({ w: 7, d: 5.5, wallH: 2.4, base: 0.01, plinth: 'none', engawa: 0.6, ring: true, rail: true, pitch: 2.33, front: 'shoji', left: 'shoji', right: 'shoji', back: 'shoji', winMat: win,
        postMat: M.woodDark(), beamMat: M.woodDark(), roof: { style: 'hip', over: 1.2, h: 2.6, mat: roofMat, lift: 0.8 } });
      b3.group.position.y = 7.6; g.add(b3.group);
      const sign = texGlow(textTexture(t('structures.noren.inn'), { w: 192, h: 192, bg: '#1d1a20', fg: '#ffd27a', border: '#ffd27a', style: 'gilded' }), 1.6);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), sign); sg.position.set(0, 5.4, 4.7); g.add(sg);
      for (let k = -2; k <= 2; k++) { const l = paperLanternStatic(lampMats[(k + 3) % 3]); l.position.set(k * 2.2, 3.6, 5.85); g.add(l); }
      const res = { group: g, walls: b1.walls.map((w) => ({ ...w, y1: 10 })), floors: b1.floors, pads: b3.pads.map((p) => ({ ...p, top: p.top + 7.6 })) };
      const [ax, az] = L(x, z);
      site.building(res, ax, az, ry);
      take(x, z, 8);
      out.inn = { x, z };
      break;
    }
  }
  await ctx.step('town');
  // --- taiko stage beside town_racer --------------------------------------------------------------------------
  {
    const a = ANCHORS.town_racer;
    const x = a.x + 3.6, z = a.z + 7.2;
    const b = pavilion({ w: 6, d: 4.6, wallH: 3.0, base: 1.1, pitch: 3, steps: true, back: 'wood', postMat: M.verm(), beamMat: M.verm(), boardMat: M.woodDark(),
      roof: { style: 'hip', over: 1.0, h: 2.2, mat: roofMat, lift: 0.7 } });
    const drum = new THREE.Group();
    const body = cyl(0.95, 0.95, 1.2, mat.lacquer(0x8a3a24), 0, 0, 0, 20); body.rotation.x = Math.PI / 2; drum.add(body);
    for (const s of [-1, 1]) { const head = cyl(1.0, 1.0, 0.06, mat.cloth(0xf2e6c8), 0, 0, s * 0.62, 20); head.rotation.x = Math.PI / 2; drum.add(head); const tm = cyl(0.42, 0.42, 0.07, M.black(), 0, 0, s * 0.63, 3); tm.rotation.x = Math.PI / 2; drum.add(tm); }
    drum.add(box(0.12, 1.6, 0.12, M.woodDark(), -0.7, -0.6, 0), box(0.12, 1.6, 0.12, M.woodDark(), 0.7, -0.6, 0));
    drum.position.set(0, 2.55, -0.6); b.group.add(drum);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const l = paperLanternStatic(lampMats[k]); l.position.set(s * (2.0 - k * 1.3), 3.85, 3.0); b.group.add(l); }
    b.walls = [{ x: 0, z: 0, hw: 3.1, hd: 2.4, y1: 1.2 }];
    const [ax, az] = L(x, z);
    site.building(b, ax, az, Math.PI + 0.25);
    take(x, z, 4);
    out.taiko = { x, z };
  }
  await ctx.step('town');
  // --- lamp-maker's workshop (beside town_lampmaker) with lanterns on display -------------------------------------
  {
    const a = ANCHORS.town_lampmaker;
    const x = a.x - 4.0, z = a.z - 5.5;
    if (free(x, z, 3.5)) {
      const b = townHouse({ w: 5.6, d: 5, winMat: win, roofMat, plasterMat: nightPlaster, noren: t('structures.noren.lamp'), norenCrest: 'lantern', norenBg: '#7a2a24' });
      for (let k = 0; k < 7; k++) { const l = streetLantern(lampMats, drng, k, k % 4); l.position.set(-2.4 + k * 0.8, 3.0 - (k % 2) * 0.25, 3.2); b.group.add(l); }
      dressFront(b.group, 5.6, 5, 'lamp', drng, lampMats);
      const [ax, az] = L(x, z);
      site.building(b, ax, az, Math.atan2(a.x - x, a.z - z));
      take(x, z, 3.5);
    }
  }
  await ctx.step('town');
  // --- bridges of light: two footbridges over the market street, lit rails ---------------------------------------
  out.lightBridges = [];
  for (const d of [27, 45]) {
    const [x0, z0] = at(market, d, -8.6), [x1, z1] = at(market, d, 8.6);
    lightBridge(site, L(x0, z0), L(x1, z1), 5.6, [market.ux, market.uz]);
    out.lightBridges.push({ from: [x0, z0], to: [x1, z1] });
  }
  await ctx.step('town');
  // --- glowing street lamps (andon) along the plaza ring --------------------------------------------------------------
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU, x = P.x + Math.cos(a) * 15.5, z = P.z + Math.sin(a) * 15.5;
    if (!isClear(x, z, 0.4, { road: 2.2 })) continue;
    const [ax, az] = L(x, z);
    const y = site.h(ax, az);
    site.add(andon(townLampWhite), ax, y, az, -a);
    site.colCyl(ax, az, 0.25, y - 1, y + 1.6);
  }
  // banners on the plaza
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3, x = P.x + Math.cos(a) * 19, z = P.z + Math.sin(a) * 19;
    if (!isClear(x, z, 0.3, { road: 2 }) || !free(x, z, 0.3)) continue;
    const [ax, az] = L(x, z);
    site.add(nobori(i % 2 ? t('structures.banner.town') : t('structures.banner.townB'), { bg: i % 2 ? '#2a2f5a' : '#7a2a24', fg: '#ffe2a8', glowK: 1.0, crest: 'lantern' }), ax, site.h(ax, az), az, -a);
  }
  await ctx.step('town:lamps');
  plazaDress(site, L, P, spokes, free, take, roofMat, townLamp);
  await ctx.step('town:plaza');
  await site.bakeBlocksSliced(72, ctx.step);   // draw-call pass: 72 m blocks (was 36): a quarter of the per-block draws
  out.lamp = townLamp;
  let lit = true;
  ctx.place('town', {
    group: site.baked, blocks: site.blocks, ...out,
    /** Dim (false) or relight (true) the tower top and every street lantern of the town (fades). */
    setLit(on, instant = false) {
      lit = !!on;
      target = lit ? 1 : 0.06;
      if (instant) { cur = target; applyLamps(); }
    },
    get lit() { return lit; },
  });
  let cur = 1, target = 1;
  function applyLamps() { for (const m of lampMats) m.userData.setGlow(cur); out.tower.flame.visible = cur > 0.2; }
  ctx.tick((dt) => {
    if (Math.abs(cur - target) < 0.002) return;
    cur += (target - cur) * Math.min(1, dt * 1.5);
    if (Math.abs(cur - target) < 0.002) cur = target;
    applyLamps();
  });
}

// ---------------------------------------------------------------------------------------------------------------
function buildTower(site, lampMat) {
  const g = new THREE.Group();
  const st = M.stone(), sd = M.stoneDark(), wd = M.woodDark(), roof = M.tileNight();
  // stepped stone base
  g.add(box(7.0, 0.6, 7.0, sd, 0, 0.3, 0), box(6.0, 0.9, 6.0, st, 0, 1.05, 0));
  // tall wooden shaft with three tiers of small roofs
  let y = 1.5;
  const tiers = [[4.6, 4.2], [3.8, 4.0], [3.2, 3.8]];
  for (const [w, h] of tiers) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.28, h, 0.28, M.verm(), sx * (w / 2 - 0.2), y + h / 2, sz * (w / 2 - 0.2)));
    g.add(box(w - 0.4, h * 0.85, w - 0.4, M.plaster(), 0, y + h * 0.45, 0));
    for (const s of [-1, 1]) { g.add(box(w * 0.42, h * 0.38, 0.06, glow(0xffc27a, 2.0), 0, y + h * 0.5, s * (w / 2 - 0.15))); g.add(box(0.06, h * 0.38, w * 0.42, glow(0xffc27a, 2.0), s * (w / 2 - 0.15), y + h * 0.5, 0)); }
    const r = makeRoof({ hw: w / 2 + 1.1, hd: w / 2 + 1.1, h: 1.0, style: 'hip', mat: roof, lift: 0.55, tile: 0.36 });
    r.group.position.y = y + h; g.add(r.group);
    // a ring of lanterns under each eave
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + Math.PI / 8; const l = paperLanternStatic(lampMat); l.position.set(Math.cos(a) * (w / 2 + 0.75), y + h - 0.05, Math.sin(a) * (w / 2 + 0.75)); g.add(l); }
    y += h + 0.75;
  }
  // the great lamp chamber
  const lampY = y + 0.2;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.add(box(0.16, 2.6, 0.16, M.verm(), Math.cos(a) * 1.4, lampY + 1.3, Math.sin(a) * 1.4)); }
  const paper = cyl(1.25, 1.25, 2.3, lampMat, 0, lampY + 1.3, 0, 6); paper.castShadow = false; g.add(paper);
  const topR = makeRoof({ hw: 2.6, hd: 2.6, h: 2.2, style: 'hip', mat: roof, lift: 0.7, tile: 0.36, finial: (() => { const f = new THREE.Group(); f.add(cyl(0.06, 0.1, 2.0, M.gold(), 0, 1.0, 0, 6)); for (let k = 0; k < 4; k++) f.add(torus(0.28 - k * 0.04, 0.035, M.gold(), 0, 0.5 + k * 0.32, 0, 4, 12).rotateX(Math.PI / 2)); f.add(sphere(0.2, M.gold(), 0, 2.1, 0, 10, 8)); return f; })() });
  topR.group.position.y = lampY + 2.6; g.add(topR.group);
  // inner flame (bright core, live so it can be hidden while the town is dark)
  const flame = sphere(0.65, glow(0xffe8b8, 6), 0, lampY + 1.3, 0, 12, 8); flame.castShadow = false; flame.userData.dynamic = true; g.add(flame);
  site.add(g, 0, site.h(0, 0), 0);
  const y0 = site.h(0, 0);
  site.colBox(0, 0, 3.0, 3.0, 0, y0 - 1, y0 + y + 3, 'town_tower');
  site.platBox(0, 0, 3.5, 3.5, 0, y0 + 1.5, 1.5, 'town_tower');
  for (const p of topR.pads) site.platBox(0, 0, p.hw, p.hd, 0, y0 + lampY + 2.6 + p.top, 0.9, 'town_tower');
  return { height: y0 + lampY + 4.8, lampY: y0 + lampY + 1.3, flame };
}

/** A string of lanterns between two local points (with poles). */
function lanternString(site, A, B, mats, rng, drng) {
  const ya = site.h(A[0], A[1]), yb = site.h(B[0], B[1]);
  const g = new THREE.Group();
  const pm = M.woodDark();
  g.add(cyl(0.08, 0.09, 5.2, pm, A[0], ya + 2.6, A[1], 6), cyl(0.08, 0.09, 5.2, pm, B[0], yb + 2.6, B[1], 6));
  // the cable sags under the lanterns; pole tops carry a small cross-arm
  const rp = rope([A[0], ya + 5.0, A[1]], [B[0], yb + 5.0, B[1]], 1.05, 0.022, M.rope(), 12);
  g.add(rp.mesh);
  for (const [P0, y0] of [[A, ya], [B, yb]]) g.add(box(0.5, 0.08, 0.1, pm, P0[0], y0 + 5.05, P0[1]), cone(0.12, 0.2, pm, P0[0], y0 + 5.3, P0[1], 6));
  const n = Math.max(4, Math.round(Math.hypot(B[0] - A[0], B[1] - A[1]) / 1.2));
  const kind = Math.floor(drng() * 4);                                  // one shape per string, varied colours / sizes
  for (let k = 1; k < n; k++) {
    const [x, y, z] = rp.at(k / n);
    const l = streetLantern(mats, drng, Math.floor(rng() * 3), (kind + (k % 3 === 0 ? 1 : 0)) % 4);
    l.position.set(x, y - 0.04, z); l.scale.setScalar(0.72 + drng() * 0.22); g.add(l);
  }
  site.add(g);
  site.colCyl(A[0], A[1], 0.14, ya - 1, ya + 5.2); site.colCyl(B[0], B[1], 0.14, yb - 1, yb + 5.2);
}

/** Night-market stall: counter, awning, goods, a lantern. */
function stall(rng, mats) {
  const g = new THREE.Group();
  const cloth = [mat.cloth(0x7a2a24), mat.cloth(0x2a3f6a), mat.cloth(0x3a5a3a), mat.cloth(0x8a5a2a)][Math.floor(rng() * 4)];
  g.add(box(2.6, 0.95, 1.0, M.wood(), 0, 0.48, 0.4));
  for (const sx of [-1.25, 1.25]) for (const sz of [-0.6, 0.85]) g.add(box(0.1, 2.5, 0.1, M.woodDark(), sx, 1.25, sz));
  const aw = box(3.0, 0.08, 2.0, cloth, 0, 2.55, 0.25); aw.rotation.x = 0.2; g.add(aw);
  g.add(box(3.0, 0.4, 0.04, cloth, 0, 2.3, 1.25));
  const goods = [mat.paint(0xffb35a), mat.paint(0xe6e0c8), mat.paint(0xd94a3a), mat.paint(0x9fd8ff), mat.paint(0x7fbf5a)];
  // wares on a cloth runner: fruit baskets, stacked bowls, sake bottles (two draws per item, as the old boxes took)
  g.add(box(2.5, 0.02, 0.62, cloth, 0, 0.965, 0.42));
  const wood = M.woodLight(), fruit = [mat.paint(0xf08a2a), mat.paint(0xd8402e), mat.paint(0x9ac84a)];
  for (let i = 0; i < 6; i++) {
    const a = rng(), c = goods[Math.floor(rng() * goods.length)], x = -1.0 + i * 0.4;
    if (i % 3 === 0) {
      g.add(cyl(0.17, 0.13, 0.12, wood, x, 1.03, 0.45, 8));
      for (let k = 0; k < 4; k++) g.add(sphere(0.065, fruit[(k + Math.floor(a * 3)) % 3], x + Math.cos(k * 1.7) * 0.08, 1.11 + (k === 3 ? 0.06 : 0), 0.45 + Math.sin(k * 1.7) * 0.08, 6, 4));
    } else if (i % 3 === 1) {
      const n = 2 + Math.floor(a * 3);
      for (let k = 0; k < n; k++) g.add(cyl(0.13, 0.08, 0.07, c, x, 1.01 + k * 0.055, 0.45, 9));
    } else {
      for (const dx of [-0.07, 0.08]) { g.add(cyl(0.06, 0.07, 0.2 + a * 0.08, c, x + dx, 1.08 + a * 0.04, 0.45, 7)); g.add(cyl(0.022, 0.03, 0.08, c, x + dx, 1.22 + a * 0.08, 0.45, 5)); }
    }
  }
  const l = paperLanternStatic(mats[Math.floor(rng() * 3)]); l.position.set(1.15, 2.3, 1.15); g.add(l);
  const l2 = paperLanternStatic(mats[Math.floor(rng() * 3)]); l2.position.set(-1.15, 2.3, 1.15); g.add(l2);
  return { group: g, walls: [{ x: 0, z: 0.4, hw: 1.3, hd: 0.5, y1: 1.0 }], floors: [], pads: [] };
}

/** Street gate: two posts, a tiled roof and big lanterns, straddling the road. */
function gate(site, [lx, lz], ry, win, roofMat, mats) {
  const g = new THREE.Group();
  const span = 3.4;
  for (const sx of [-1, 1]) {
    g.add(box(0.5, 5.2, 0.5, M.woodDark(), sx * span, 2.6, 0), box(0.8, 0.5, 0.8, M.stone(), sx * span, 0.25, 0));
    g.add(box(0.2, 3.0, 0.9, M.woodDark(), sx * span, 1.5, 0.5));
    const l = paperLanternStatic(mats[0]); l.position.set(sx * (span - 1.2), 4.3, 0.55); l.scale.setScalar(1.6); g.add(l);
  }
  g.add(box(span * 2 + 1.6, 0.4, 0.45, M.woodDark(), 0, 4.8, 0));
  const r = makeRoof({ hw: span + 1.5, hd: 1.1, h: 0.9, style: 'gable', mat: roofMat, lift: 0.35, tile: 0.34 });
  r.group.position.y = 5.2; g.add(r.group);
  const y = site.h(lx, lz);
  site.add(g, lx, y, lz, ry);
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const sx of [-1, 1]) site.colBox(lx + sx * span * c, lz - sx * span * s, 0.3, 0.6, ry, y - 1, y + 5.5);
  void win;
}

/** Arched footbridge high over a street, rails lined with glowing lights. Walkable (platforms). */
function lightBridge(site, A, B, height, street) {
  const g = new THREE.Group();
  const ya = site.h(A[0], A[1]) + height, yb = site.h(B[0], B[1]) + height;
  const dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz);
  const N = Math.ceil(len / 0.8), w = 2.4;
  const yAt = (f) => ya + (yb - ya) * f + 4 * 1.4 * f * (1 - f);
  const light = glow(0x9fe8ff, 2.2), lightWarm = glow(0xffd8a0, 2.6);
  for (let i = 0; i < N; i++) {
    const f0 = i / N, f1 = (i + 1) / N, fm = (f0 + f1) / 2;
    const x = A[0] + dx * fm, z = A[1] + dz * fm, y = yAt(fm);
    const seg = box(w, 0.18, len / N + 0.03, M.woodDark(), 0, 0, 0);
    seg.position.set(x, y - 0.09, z); seg.rotation.set(-Math.atan2(yAt(f1) - yAt(f0), len / N), ry, 0, 'YXZ');
    g.add(seg);
    // glowing edge strips
    for (const s of [-1, 1]) { const e = box(0.08, 0.08, len / N + 0.03, light, 0, 0, 0); e.position.set(x + Math.cos(ry) * s * (w / 2), y + 0.02, z - Math.sin(ry) * s * (w / 2)); e.rotation.copy(seg.rotation); e.castShadow = false; g.add(e); }
    site.platBox(x, z, w / 2, len / N / 2 + 0.02, ry, y, 0.6);
    for (const s of [-1, 1]) site.colBox(x + Math.cos(ry) * s * (w / 2 + 0.05), z - Math.sin(ry) * s * (w / 2 + 0.05), 0.06, len / N / 2, ry, y - 0.2, y + 1.1);
  }
  // rail posts topped with little lights
  const nP = Math.round(len / 1.5);
  for (let i = 0; i <= nP; i++) {
    const f = i / nP, x = A[0] + dx * f, z = A[1] + dz * f, y = yAt(f);
    for (const s of [-1, 1]) {
      const px = x + Math.cos(ry) * s * (w / 2 + 0.05), pz = z - Math.sin(ry) * s * (w / 2 + 0.05);
      g.add(cyl(0.05, 0.05, 1.0, M.verm(), px, y + 0.5, pz, 6));
      g.add(sphere(0.11, i % 2 ? light : lightWarm, px, y + 1.08, pz, 8, 6));
    }
  }
  // landings at both ends, stairs running down along the street
  const [sux, suz] = street;
  for (const [E, ye] of [[A, ya], [B, yb]]) {
    const gy = site.h(E[0], E[1]);
    g.add(box(w, ye - gy + 0.2, w, M.woodDark(), E[0], (ye + gy - 0.2) / 2, E[1]));
    site.platBox(E[0], E[1], w / 2, w / 2, ry, ye, ye - gy + 0.2);
    const n = Math.ceil((ye - gy) / 0.3);
    for (let k = 0; k < n; k++) {
      const top = gy + ((ye - gy) * (k + 1)) / n;
      const d = w / 2 + 0.21 + (n - 1 - k) * 0.42;
      const x = E[0] + sux * d, z = E[1] + suz * d;
      const st = box(w - 0.4, top - gy + 0.2, 0.44, M.woodDark(), x, (top + gy - 0.2) / 2, z); st.rotation.y = Math.atan2(sux, suz); g.add(st);
      site.platBox(x, z, w / 2 - 0.2, 0.22, Math.atan2(sux, suz), top, top - gy + 0.2);
    }
  }
  site.add(g);
}

/** Floor-standing paper lamp (andon) on a short post. */
function andon(mat) {
  const g = new THREE.Group();
  g.add(box(0.12, 0.9, 0.12, M.woodDark(), 0, 0.45, 0));
  g.add(box(0.5, 0.06, 0.5, M.woodDark(), 0, 0.92, 0));
  const p = box(0.38, 0.5, 0.38, mat, 0, 1.2, 0); p.castShadow = false; g.add(p);
  g.add(box(0.5, 0.06, 0.5, M.woodDark(), 0, 1.48, 0));
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Street dressing (architecture round 2): varied paper lanterns, shop signboards, upper-floor railings, stacked goods.
// All of it is static and bakes into the town's blocks (one draw per material per block, own far LOD).
const _lg = new Map();
/** kind 0 round chochin, 1 tall ribbed, 2 square andon, 3 wide flat — { body, caps, tassel } geometries, cached */
function lanternGeos(kind) {
  let o = _lg.get(kind);
  if (o) return o;
  let body, top, bot;
  if (kind === 1) {
    const pts = []; for (let i = 0; i <= 6; i++) { const f = i / 6; pts.push(new THREE.Vector2(0.17 * (0.78 + 0.22 * Math.sin(Math.PI * f)) + (i % 2 ? 0.008 : 0), -0.7 + f * 0.58)); }
    body = new THREE.LatheGeometry(pts, 8); top = -0.12; bot = -0.7;
  } else if (kind === 2) {
    body = new THREE.BoxGeometry(0.3, 0.4, 0.3); body.translate(0, -0.36, 0); top = -0.16; bot = -0.56;
  } else if (kind === 3) {
    body = new THREE.SphereGeometry(0.27, 9, 5); body.scale(1, 0.72, 1); body.translate(0, -0.3, 0); top = -0.11; bot = -0.49;
  } else {
    body = new THREE.SphereGeometry(0.24, 9, 6); body.scale(1, 1.3, 1); body.translate(0, -0.38, 0); top = -0.07; bot = -0.69;
  }
  const cr = kind === 2 ? 0.17 : kind === 3 ? 0.14 : 0.13;
  const a = new THREE.CylinderGeometry(cr, cr, 0.06, kind === 2 ? 4 : 7, 1); if (kind === 2) a.rotateY(Math.PI / 4); a.translate(0, top - 0.01, 0);
  const b = a.clone(); b.translate(0, bot - top + 0.02, 0);
  const hook = new THREE.CylinderGeometry(0.012, 0.012, 0.1, 4, 1); hook.translate(0, top + 0.05, 0);
  const caps = mergeNI([a, b, hook]);
  const tassel = new THREE.CylinderGeometry(0.035, 0.012, 0.22, 5, 1); tassel.translate(0, bot - 0.13, 0);
  o = { body, caps, tassel };
  _lg.set(kind, o);
  return o;
}
function mergeNI(list) {
  const gs = list.map((g) => { const q = g.index ? g.toNonIndexed() : g; for (const n of Object.keys(q.attributes)) if (n !== 'position' && n !== 'normal') q.deleteAttribute(n); return q; });
  let n = 0; for (const g of gs) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let k = 0; for (const g of gs) { pos.set(g.attributes.position.array, k * 3); nor.set(g.attributes.normal.array, k * 3); k += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
/** A hanging paper lantern (hook at y = 0): glowing body in one of the town's three lamp colours, black caps, red tassel. */
function streetLantern(mats, r, mi, kind = mi % 4) {
  const G3 = lanternGeos(kind);
  const g = new THREE.Group();
  const body = new THREE.Mesh(G3.body, mats[((mi % 3) + 3) % 3]); body.castShadow = false; g.add(body);
  const caps = new THREE.Mesh(G3.caps, M.black()); caps.castShadow = false; g.add(caps);
  r();                                                             // (kept: one draw per lantern for the tassel colour)
  const ts = new THREE.Mesh(G3.tassel, mat.cloth(0xb0302a)); ts.castShadow = false; g.add(ts);
  g.rotation.y = r() * Math.PI;
  return g;
}
/** Every shop's signboard in one canvas (one row per shop kind) — one material, one draw per block for all signs. */
const SHOP_KINDS = ['inn', 'lamp', 'tea', 'sake', 'food', 'shop', 'fish', 'sweets'];
let _atlas = null;
function kanbanAtlas() {
  if (_atlas) return _atlas;
  // rows are painted by hand (lettering.js, 'board': dark lacquer, pale brush paint, light wear); re-painted if the faces
  // come late. A row is about as wide as the board plane (bw x 0.54, aspect ~4), so the name fills the board's height.
  const W = 384, H = 104, cv = document.createElement('canvas'); cv.width = W; cv.height = H * SHOP_KINDS.length;
  const c = cv.getContext('2d'), row = document.createElement('canvas'); row.width = W; row.height = H;
  const paint = () => {
    c.clearRect(0, 0, W, cv.height);
    SHOP_KINDS.forEach((k, i) => { paintLettering(row, t('structures.kanban.' + k), { bg: '#140c07', fg: '#fff0d2', border: '#a07a3a', style: 'board', seed: i }); c.drawImage(row, 0, i * H); });
  };
  paint();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  if (!fontsReady()) whenFontsReady(() => { paint(); tex.needsUpdate = true; });
  _atlas = { rows: SHOP_KINDS, mat: texGlow(tex, 0.9) };
  return _atlas;
}
/**
 * Front of a town house (origin on the ground, front +z, w x d as built by townHouse): a shop gets a roof signboard
 * with its name on the pent roof, a lit standing sign by the door and stacked goods; a home gets a railed upper
 * balcony with a laundry pole. Nothing here has a collider (it stands under the eaves, off the street).
 */
function dressFront(g, w, d, shop, r, lampMats) {
  const hd = d / 2, y1 = 0.42 + 2.7, wd = M.woodDark();
  if (shop) {
    const bw = Math.min(2.6, w * 0.42);
    const atlas = kanbanAtlas(), row = atlas.rows.indexOf(shop);
    const sz = hd - 0.36, sy = y1 + 0.95;
    g.add(box(bw + 0.14, 0.66, 0.1, wd, 0, sy, sz));
    const pg = new THREE.PlaneGeometry(bw, 0.54), uv = pg.attributes.uv, nr = atlas.rows.length;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (nr - 1 - row + uv.getY(i)) / nr);             // this shop's row of the atlas
    const p = new THREE.Mesh(pg, atlas.mat); p.position.set(0, sy, sz + 0.056); p.castShadow = false; g.add(p);
    g.add(box(bw + 0.4, 0.06, 0.32, wd, 0, sy + 0.36, sz + 0.05));                     // little cap board
    for (const sx of [-1, 1]) g.add(box(0.07, 0.42, 0.07, wd, sx * bw * 0.4, sy - 0.48, sz));   // feet onto the pent roof
    // lit standing paper sign (andon) left of the door — shares the town's lamp glow, so it dims with the town
    const sx0 = -0.35, sz0 = hd + 0.55;
    g.add(box(0.4, 0.08, 0.4, wd, sx0, 0.34, sz0), box(0.4, 0.08, 0.4, wd, sx0, 1.36, sz0));
    for (const qx of [-1, 1]) for (const qz of [-1, 1]) g.add(box(0.05, 1.02, 0.05, wd, sx0 + qx * 0.17, 0.85, sz0 + qz * 0.17));
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.9), lampMats[2]); f.castShadow = false;
      f.position.set(sx0 + Math.sin(ry) * 0.16, 0.85, sz0 + Math.cos(ry) * 0.16); f.rotation.y = ry; g.add(f);
    }
    // stacked goods at the right of the frontage
    const gx = w / 2 - 0.62, gz = hd + 0.5;
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const k = Math.floor(r() * 3), x = gx - i * 0.62 * (0.8 + r() * 0.3), z = gz + (r() - 0.5) * 0.3;
      if (k === 0) {                                                       // sake / soy barrel with hoops
        g.add(cyl(0.27, 0.29, 0.66, M.wood(), x, 0.33, z, 10));
        for (const hy of [0.12, 0.54]) g.add(cyl(0.3, 0.3, 0.05, M.black(), x, hy, z, 10));
        g.add(cyl(0.25, 0.25, 0.02, wd, x, 0.67, z, 10));
        if (r() < 0.5) { g.add(cyl(0.2, 0.22, 0.48, M.woodLight(), x + 0.04, 0.92, z, 9)); g.add(cyl(0.23, 0.23, 0.04, M.black(), x + 0.04, 0.8, z, 9)); }
      } else if (k === 1) {                                                // crates, two high
        const c1 = box(0.56, 0.42, 0.46, M.woodLight(), x, 0.21, z); c1.rotation.y = (r() - 0.5) * 0.4; g.add(c1);
        g.add(box(0.6, 0.06, 0.5, wd, x, 0.08, z), box(0.6, 0.06, 0.5, wd, x, 0.36, z));
        if (r() < 0.6) { const c2 = box(0.46, 0.34, 0.4, M.wood(), x + 0.04, 0.59, z); c2.rotation.y = (r() - 0.5) * 0.6; g.add(c2); }
      } else {                                                             // rice / charcoal sacks
        r(); const sack = mat.cloth(0xc8b48a);
        for (let j = 0; j < 2 + Math.floor(r() * 2); j++) { const sk = sphere(0.24, sack, x + (j % 2) * 0.12 - 0.06, 0.18 + j * 0.24, z + (j % 2 ? 0.05 : -0.05), 7, 5); sk.scale.set(1.15, 0.72, 0.9); g.add(sk); }
      }
    }
  } else {
    // railed balcony in front of the upper windows (sits on the pent roof), a laundry pole with a cloth
    const zr = hd - 0.32, x0 = -(w / 2 - 0.35), x1 = w / 2 - 0.35, len = x1 - x0;
    g.add(box(len, 0.08, 0.12, wd, 0, y1 + 0.82, zr), box(len, 0.07, 0.1, wd, 0, y1 + 1.46, zr));
    for (const x of [x0, x1]) g.add(box(0.1, 0.8, 0.1, wd, x, y1 + 1.1, zr));
    const nb = Math.round(len / 0.26);
    for (let i = 1; i < nb; i++) g.add(box(0.04, 0.6, 0.04, wd, x0 + (len * i) / nb, y1 + 1.14, zr));
    if (r() < 0.6) {
      g.add(cyl(0.025, 0.025, len * 0.8, M.woodLight(), 0, y1 + 1.95, zr + 0.05, 5).rotateZ(Math.PI / 2));
      const cl = [0xd8d0c0, 0x5a6a9a];
      for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9, 2, 3), clothify(mat.cloth(cl[Math.floor(r() * cl.length)]), 0.08)); c.material.side = THREE.DoubleSide; c.position.set((i ? 1 : -1) * len * 0.2, y1 + 1.5, zr + 0.06); c.castShadow = false; g.add(c); }
    }
    // a potted pine at the door
    g.add(cyl(0.22, 0.17, 0.32, M.black(), -0.5, 0.16, hd + 0.45, 8), sphere(0.32, mat.paint(0x2f5a3c), -0.5, 0.58, hd + 0.45, 7, 5));
    void lampMats;
  }
}

// ---------------------------------------------------------------------------------------------------------------
/**
 * Final sets: the square round the lamp tower was one even paved plane. A kerb of set stones rings the tower base
 * (gaps where the streets come in), a roofed well with a lit lantern under its roof (a warm pool on the paving),
 * barrel stacks, wooden planters with clipped pines and benches stand in the wide sector between the streets.
 * Placement is checked against roads (2.6 m), the occupied circles, colliders and every anchor's circle.
 * Materials are the town's own (stone, dark wood, night tile, black, rope, the shared lamp glow).
 */
function plazaDress(site, L, P, spokes, free, take, roofMat, lamp) {
  const r = mulberry32(9091);
  const at = (x, z) => { const [lx, lz] = L(x, z); return [lx, site.h(lx, lz), lz]; };
  const okAt = (x, z, rr) => isClear(x, z, rr, { road: 2.6 }) && free(x, z, rr) && Object.values(ANCHORS).every((a) => Math.hypot(a.x - x, a.z - z) > 3.6 + rr);
  const angs = spokes.map((s) => Math.atan2(s.uz, s.ux));
  const nearSpoke = (a, w) => angs.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < w);
  // kerb ring at the tower's foot
  {
    const g = new THREE.Group(), sd = M.stoneDark(), R = 9.6, n = 64;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU;
      if (nearSpoke(a, 0.24)) continue;
      const x = P.x + Math.cos(a) * R, z = P.z + Math.sin(a) * R;
      if (Object.values(ANCHORS).some((q) => q.x !== P.x && Math.hypot(q.x - x, q.z - z) < 3.6)) continue;   // the save lantern's circle
      const [lx, y, lz] = at(x, z);
      g.add(bevelBox((TAU * R) / n - 0.06, 0.17, 0.3, sd, lx, y + 0.03, lz, 0.03).rotateY(-a + Math.PI / 2));
    }
    site.add(g);
  }
  // candidates in the wide sectors between the streets, out between the lamp ring (15.5 m) and the houses
  const spots = [];
  for (let k = 0; k < 40; k++) {
    const a = r() * TAU, d = 16.8 + r() * 3.2;
    if (nearSpoke(a, 0.42)) continue;
    spots.push([P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, a]);
  }
  // the g6 view looks west-north-west from the save lantern: the well goes there first
  spots.sort((p, q) => Math.abs(Math.atan2(Math.sin(p[2] - 3.4), Math.cos(p[2] - 3.4))) - Math.abs(Math.atan2(Math.sin(q[2] - 3.4), Math.cos(q[2] - 3.4))));
  const use = (rr) => { const i = spots.findIndex(([x, z]) => okAt(x, z, rr)); if (i < 0) return null; const s = spots.splice(i, 1)[0]; take(s[0], s[1], rr); return s; };
  // roofed well with a lantern hung under the roof
  {
    const s = use(1.8);
    if (s) {
      const [lx, y, lz] = at(s[0], s[1]);
      const g = new THREE.Group(), st = M.stone(), dk = M.woodDark();
      g.add(bevelBox(2.6, 0.12, 2.6, M.stoneDark(), 0, 0.06, 0, 0.04));
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; g.add(bevelBox(0.62, 0.62, 0.3, st, Math.cos(a) * 0.82, 0.43, Math.sin(a) * 0.82, 0.04).rotateY(-a + Math.PI / 2)); }
      g.add(cyl(0.7, 0.7, 0.04, M.black(), 0, 0.6, 0, 14));
      for (const sx of [-1, 1]) g.add(box(0.15, 2.5, 0.15, dk, sx * 1.05, 1.25, 0));
      g.add(box(2.4, 0.14, 0.16, dk, 0, 2.42, 0));
      g.add(cyl(0.13, 0.13, 0.3, dk, 0, 2.2, 0, 8).rotateZ(Math.PI / 2));
      g.add(rod(0, 2.1, 0, 0.05, 1.05, 0.05, 0.012, M.black(), 4));
      g.add(cyl(0.18, 0.15, 0.26, M.wood(), 0.05, 0.92, 0.05, 8));
      const roof = makeRoof({ hw: 1.55, hd: 1.15, h: 0.62, style: 'gable', mat: roofMat, lift: 0.08, thick: 0.08, corr: 0.03, tile: 0.18 });
      roof.group.position.y = 2.5; g.add(roof.group);
      const lan = paperLanternStatic(lamp); lan.position.set(0.62, 2.42, 0); g.add(lan);
      site.add(g, lx, y, lz, -s[2] + Math.PI / 2);
      site.colCyl(lx, lz, 1.1, y - 1, y + 1.1);
    }
  }
  // barrel stacks (sake / soy casks with rope hoops)
  for (let n = 0; n < 2; n++) {
    const s = use(1.0); if (!s) break;
    const [lx, y, lz] = at(s[0], s[1]);
    const g = new THREE.Group(), wd = M.woodDark();
    for (const [x, z, yy] of [[-0.36, 0, 0], [0.36, 0.05, 0], [0, 0.42, 0], [0.02, 0.15, 0.62]]) {
      g.add(cyl(0.3, 0.3, 0.6, wd, x, yy + 0.3, z, 12));
      for (const hy of [0.1, 0.5]) g.add(cyl(0.31, 0.31, 0.05, M.black(), x, yy + hy, z, 12));
      g.add(cyl(0.28, 0.28, 0.02, M.woodDark(), x, yy + 0.605, z, 12));
    }
    site.add(g, lx, y, lz, r() * TAU);
    site.colCyl(lx, lz, 0.75, y - 1, y + 1.3);
  }
  // planters with clipped pines, a bench between two of them
  const pine = mat.paint(0x2f5a3c);
  for (let n = 0; n < 3; n++) {
    const s = use(1.4); if (!s) break;
    const [lx, y, lz] = at(s[0], s[1]);
    const g = new THREE.Group(), dk = M.woodDark();
    for (const sx of [-1, 1]) {
      g.add(box(0.9, 0.5, 0.9, dk, sx * 1.35, 0.25, 0));
      g.add(box(0.82, 0.04, 0.82, M.black(), sx * 1.35, 0.5, 0));
      g.add(cyl(0.05, 0.07, 0.6, M.wood(), sx * 1.35, 0.8, 0, 6));
      for (let k = 0; k < 3; k++) { const p = sphere(0.36 - k * 0.08, pine, sx * 1.35 + (k - 1) * 0.12, 0.95 + k * 0.28, (k % 2) * 0.08, 8, 5); p.scale.y = 0.55; g.add(p); }
    }
    g.add(box(1.7, 0.08, 0.42, M.wood(), 0, 0.46, 0));
    for (const sx of [-0.7, 0.7]) g.add(box(0.08, 0.42, 0.36, dk, sx, 0.21, 0));
    site.add(g, lx, y, lz, -s[2] + Math.PI / 2);
    site.colBox(lx, lz, 1.85, 0.48, -s[2] + Math.PI / 2, y - 1, y + 0.55);
  }
}
