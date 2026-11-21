// 镜湖 (pier, boat, islet shrine, lotus), 星晶野 (stone circle, 晶灯 dais, hermit's hut, crystal pillars),
// 月读宫 (Moon palace on the rock), 风祠 (wind shrine on the summit), and the floating islands.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { PAL, toon, flat, glow } from '../../core/mats.js';
import { box, cyl, cone, sphere, torus, ico } from '../../core/geo.js';
import { t } from '../../core/i18n.js';
import { mulberry32, TAU, noise2 } from '../../core/util.js';
import { ANCHORS, POI, SKY_ISLES } from '../../data/world.js';
import { Site, M, mat, building, isClear, rod, rope, hokora, makeRoof, nearestRoad } from './kit.js';
import { makeTorii, makeCrystalPillar } from './factories.js';
import { stoneLanternDecor, assetModel, assetTree, stones, nobori } from './decor.js';
import { placeTorii } from './shrine.js';
import { buildDais, placeGreatLantern, paperLanternStatic } from './dusk.js';
import { buildPalace } from './palace.js';
import { buildEastShore } from './eastshore.js';
import { M as SM, lathe, rcyl, rbox, lumpy, tube } from '../../props/shapes.js';
import { clothify } from './kit.js';

export async function buildFar(ctx) {
  for (const [n, fn] of [['lake', buildLake], ['crystal', buildCrystal], ['palace', buildPalace], ['wind', buildWindShrine], ['isles', buildSkyIsles], ['eastshore', buildEastShore]]) {
    try { await fn(ctx); } catch (e) { G.reportError('structures:' + n, e); }
    await ctx.step('far:' + n);
  }
}

// ---------------------------------------------------------------------------------------------------------------
async function buildLake(ctx) {
  const A = ANCHORS.lake_ferryman, C = POI.lake;
  const dx = C.x - A.x, dz = C.z - A.z, l = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const site = new Site('lake', A.x, A.z, ry);                      // local +z points out over the lake
  const rng = mulberry32(31);
  const deckY = 1.55, z0 = 3.0, len = 24, w = 2.6;
  const g = new THREE.Group();
  for (let z = z0; z < z0 + len; z += 0.55) {
    const pl = box(w, 0.12, 0.5, rng() < 0.15 ? M.woodDark() : M.woodLight(), (rng() - 0.5) * 0.06, deckY - 0.06, z + 0.25);
    pl.rotation.y = (rng() - 0.5) * 0.03; g.add(pl);
  }
  for (let z = z0; z <= z0 + len; z += 3) for (const sx of [-1, 1]) {
    const gy = Math.min(site.h(sx * (w / 2 - 0.1), z), 0) - 2;
    g.add(cyl(0.13, 0.15, deckY - gy + 0.5, M.woodDark(), sx * (w / 2 - 0.1), (deckY + gy + 0.5) / 2, z, 6));
  }
  g.add(box(0.1, 0.1, len, M.woodDark(), -w / 2, deckY + 0.05, z0 + len / 2), box(0.1, 0.1, len, M.woodDark(), w / 2, deckY + 0.05, z0 + len / 2));
  // a lantern post at the end and a mooring post
  g.add(cyl(0.08, 0.08, 2.6, M.woodDark(), w / 2 - 0.1, deckY + 1.3, z0 + len - 0.3, 6));
  const lan = paperLanternStatic(M.lampWarm(2.2)); lan.position.set(w / 2 - 0.1 + 0.5, deckY + 2.5, z0 + len - 0.3); g.add(lan);
  g.add(box(0.6, 0.05, 0.05, M.woodDark(), w / 2 + 0.2, deckY + 2.55, z0 + len - 0.3));
  site.add(g);
  site.platBox(0, z0 + len / 2, w / 2, len / 2, 0, deckY, 2.5);
  // ramp from the shore to the deck
  for (let k = 0; k < 4; k++) { const z = z0 - 0.4 - k * 0.6; const top = deckY - (k + 1) * 0.15; site.platBox(0, z, w / 2, 0.3, 0, Math.max(top, site.h(0, z)), 1); site.add(box(w, 0.12, 0.6, M.woodLight(), 0, Math.max(top, site.h(0, z)) - 0.06, z)); }
  // the ferry boat moored at the end
  const boat = assetModel('bld_boat_rowing');
  if (boat) site.add(boat, w / 2 + 1.9, 0.05, z0 + len - 3, 0.05);
  else site.add(box(1.8, 0.6, 4.2, M.wood(), 0, 0, 0), w / 2 + 1.9, 0.2, z0 + len - 3);
  await site.bakeSliced(ctx.step);
  ctx.place('lake', { group: site.baked, site, pierEnd: [site.wx(0, z0 + len), site.wz(0, z0 + len)], deckY });

  // --- 镜心屿: tiny shrine, torii on the shore facing the pier, lantern dais at anchor lake_lantern ---------------
  const I = ANCHORS.lake_lantern;
  const isle = new Site('lakeisle', I.x, I.z, 0);
  const y0 = isle.h(0, 0);
  const daisTop = buildDais(isle, 0, 0, y0, { r: 4.4, h: 1.0, mat: M.stoneLight(), edge: M.stone(), steps: [ry + Math.PI] });
  isle.building(hokora({ scale: 1.6, roofMat: M.tileDusk() }), 0, -11, 0);
  // torii on the south-west shore, looking back at the pier
  const tx = -Math.sin(ry) * 20, tz = -Math.cos(ry) * 20;
  placeTorii(isle, makeTorii(1.2, { plaque: t('world.place.lakeisle') }), tx, tz, Math.max(isle.h(tx, tz), 0.2) - 0.3, ry);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.6, x = Math.cos(a) * 8, z = Math.sin(a) * 8; isle.add(stoneLanternDecor(false), x, isle.h(x, z), z, -a); isle.colCyl(x, z, 0.45, y0 - 1, y0 + 3); }
  // lotus pads and flowers on the water around the islet
  const lg = new THREE.Group();
  const pad = mat.paint(0x4f9a5a), petal = glow(0xffb8d8, 1.25), petalW = mat.paint(0xfff0f6);
  for (let i = 0; i < 46; i++) {
    const a = rng() * TAU, r = 30 + rng() * 22;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (isle.h(x, z) > -0.6) continue;
    const p = cyl(0.55 + rng() * 0.4, 0.55, 0.04, pad, x, 0.04, z, 10); lg.add(p);
    if (rng() < 0.45) { const f = cone(0.22, 0.28, i % 2 ? petal : petalW, x + 0.1, 0.2, z, 6); lg.add(f); }
  }
  isle.add(lg);
  await isle.bakeSliced(ctx.step);
  const gl = placeGreatLantern(ctx, 'gl_mirror', I.x, I.z, daisTop);
  ctx.place('lakeisle', { group: isle.baked, site: isle, daisTop, lantern: gl });
}

// ---------------------------------------------------------------------------------------------------------------
async function buildCrystal(ctx) {
  const A = ANCHORS.crystal_lantern;
  const site = new Site('crystal', A.x, A.z, 0);
  const rng = mulberry32(545);
  const y0 = site.h(0, 0);
  const daisTop = buildDais(site, 0, 0, y0, { r: 4.6, h: 1.2, mat: M.moonStone(), edge: M.moonStoneDark(), steps: [-Math.PI / 2, Math.PI / 2] });
  // ruined megalith circle: rough-hewn standing stones with glowing glyph bands, lintels, fallen and broken stones
  const ring = new THREE.Group();
  const N = 14, R = 17;
  const sMat = [mat.stone(0x8a93ad, { bump: 1.6 }), mat.stone(0x6f7894, { bump: 1.6 }), mat.stone(0x9aa2b6, { bump: 1.4 })];
  const runeM = runeMat();
  const tops = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + 0.11;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    if (!isClear(A.x + x, A.z + z, 1.2, { road: 1.8 })) continue;
    const y = site.h(x, z);
    const fallen = i % 4 === 3;
    const hgt = 4.2 + rng() * 2.2;
    const sm = sMat[i % 3];
    if (fallen) {
      // broken in two, lying along the ring, with rubble
      for (const [k, f] of [[0, 0.58], [1, 0.42]]) {
        const s = new THREE.Mesh(monolithGeo(i * 2 + k), sm); s.scale.set(1.3, hgt * f, 0.95);
        const off = (k ? 1 : -1) * hgt * 0.3;
        s.position.set(x - Math.sin(a) * off, y + 0.42, z + Math.cos(a) * off); s.rotation.set(Math.PI / 2 + (k ? 0.2 : -0.1), -a, (rng() - 0.5) * 0.3); ring.add(s);
      }
      for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(monolithGeo(40 + k), sm); r.scale.setScalar(0.35 + rng() * 0.3); r.position.set(x + (rng() - 0.5) * 2.4, y + 0.1, z + (rng() - 0.5) * 2.4); r.rotation.set(rng() * 3, rng() * 3, rng() * 3); ring.add(r); }
    } else {
      const s = new THREE.Mesh(monolithGeo(i), sm); s.scale.set(1.35, hgt, 0.95);
      s.position.set(x, y - 0.3, z); s.rotation.set((rng() - 0.5) * 0.1, -a + Math.PI / 2, (rng() - 0.5) * 0.1); ring.add(s);
      site.colCyl(x, z, 0.8, y - 1, y + hgt);
      // glyph band on the face toward the dais (self-lit runes)
      const gb = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 2.1), runeM);
      gb.position.set(x - Math.cos(a) * 0.5, y + hgt * 0.52, z - Math.sin(a) * 0.5); gb.rotation.y = -a - Math.PI / 2; gb.castShadow = false; ring.add(gb);
      // a carved socket stone at the foot
      const ft = new THREE.Mesh(monolithGeo(60 + i), sMat[(i + 1) % 3]); ft.scale.set(2.0, 0.5, 1.6); ft.position.set(x, y - 0.15, z); ft.rotation.y = -a; ring.add(ft);
      tops.push({ i, a, x, z, top: y - 0.3 + hgt });
    }
  }
  // lintels across neighbouring standing stones (rough beams, a glyph band underneath)
  for (let k = 0; k + 1 < tops.length; k++) {
    const p = tops[k], q = tops[k + 1];
    if (q.i !== p.i + 1 || p.i % 3 !== 0) continue;
    const yy = Math.min(p.top, q.top) + 0.25, len = Math.hypot(q.x - p.x, q.z - p.z) + 1.4;
    const l = new THREE.Mesh(monolithGeo(80 + k), sMat[2]); l.scale.set(len, 0.75, 1.1);
    l.rotation.set(0, -Math.atan2(q.z - p.z, q.x - p.x), Math.PI / 2); l.rotation.order = 'YXZ';
    l.position.set((p.x + q.x) / 2, yy + 0.15, (p.z + q.z) / 2);
    // monolithGeo is vertical (y = length): lay it down along the span
    const lg = new THREE.Group(); lg.position.copy(l.position); lg.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
    l.position.set(0, -0.4, 0); l.scale.set(0.75, len, 1.1); l.rotation.set(0, 0, Math.PI / 2); lg.add(l);
    ring.add(lg);
  }
  // the dais rim: kerb stones and a glowing glyph ring
  for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; if (Math.abs(Math.cos(a)) > 0.92) continue; const k = new THREE.Mesh(monolithGeo(100 + i), sMat[i % 3]); k.scale.set(1.3, 0.55, 0.7); k.position.set(Math.cos(a) * 5.4, y0 - 0.1, Math.sin(a) * 5.4); k.rotation.y = -a; ring.add(k); }
  { const rgeo = new THREE.RingGeometry(3.35, 3.65, 64, 1); const pp = rgeo.attributes.position, uv = rgeo.attributes.uv; for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), yv = pp.getY(i); uv.setXY(i, ((Math.atan2(yv, x) / TAU) + 1) * 4 % 4, (Math.hypot(x, yv) - 3.35) / 0.3); } const gr = new THREE.Mesh(rgeo, runeRingMat()); gr.rotation.x = -Math.PI / 2; gr.position.y = daisTop + 0.02; gr.castShadow = false; ring.add(gr); }
  // crystal clusters sticking out of the ground
  for (let i = 0; i < 18; i++) {
    const a = rng() * TAU, r = 7 + rng() * 26;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isClear(A.x + x, A.z + z, 1.5, { road: 2 })) continue;
    const y = site.h(x, z);
    for (let k = 0; k < 3; k++) {
      const c = cone(0.25 + rng() * 0.3, 1.2 + rng() * 1.8, glow(k % 2 ? PAL.crystal : PAL.glowViolet, 1.5), x + (rng() - 0.5) * 0.8, y + 0.6, z + (rng() - 0.5) * 0.8, 5);
      c.rotation.set((rng() - 0.5) * 0.7, rng() * 3, (rng() - 0.5) * 0.7); c.castShadow = false; ring.add(c);
    }
  }
  site.add(ring);
  // hermit's hut beside anchor crystal_hermit: low stone walls, mossy thatch, smoke-hole
  {
    const h = ANCHORS.crystal_hermit;
    const b = building({ w: 5.2, d: 4.4, wallH: 2.2, base: 0.4, engawa: 0.9, pitch: 1.75, front: ['wood', 'shoji', 'wood'], back: 'wood', left: 'wood', right: 'wood',
      postMat: M.woodDark(), boardMat: M.stoneDark(), winMat: glow(0xffc27a, 2.0), roof: { style: 'thatch', over: 0.7, h: 2.7, mat: mat.thatch(0x6d7a4e) } });
    b.group.add(box(0.6, 1.6, 0.6, M.stoneDark(), 1.6, 4.4, -0.8));
    for (let k = 0; k < 5; k++) b.group.add(box(0.5 + rng() * 0.4, 0.4 + rng() * 0.6, 0.5, M.moonStoneDark(), -3.4 + rng() * 0.5, 0.3, -1.5 + k * 0.8));
    const lx = h.x - 6.5 - A.x, lz = h.z - 3.5 - A.z;
    site.building(b, lx, lz, Math.atan2(h.x - (A.x + lx), h.z - (A.z + lz)));
  }
  await site.bakeSliced(ctx.step);
  const gl = placeGreatLantern(ctx, 'gl_crystal', A.x, A.z, daisTop);
  // three turnable crystal pillars around the dais (positions exposed for the gameplay puzzle)
  const peds = [];
  for (const deg of [90, 210, 330]) {
    const a = (deg * Math.PI) / 180, r = 9.5;
    const x = A.x + Math.cos(a) * r, z = A.z + Math.sin(a) * r;
    const cp = makeCrystalPillar();
    const y = G.world.heightAt(x, z);
    cp.group.position.set(x, y, z);
    G.scene.add(cp.group);
    G.world.addCollider({ x, z, r: 1.2, y0: y - 1, y1: y + 4, tag: 'crystal' });
    G.world.addPlatform({ x, z, r: 1.15, top: y + 0.58, thick: 0.8, tag: 'crystal' });
    cp.pos = new THREE.Vector3(x, y, z);
    ctx.cull(cp.group, cp.pos, 420);
    cp.setAngle(Math.atan2(A.x - x, A.z - z) + 0.9);       // start turned away from the lantern
    peds.push(cp);
  }
  ctx.S.crystalPedestals.push(...peds);
  ctx.place('crystal', { group: site.baked, site, daisTop, lantern: gl, pedestals: peds });
}

// ---------------------------------------------------------------------------------------------------------------
async function buildWindShrine(ctx) {
  const A = ANCHORS.wind_altar;
  const site = new Site('windshrine', A.x, A.z, 0);
  const rng = mulberry32(88);
  const y0 = site.h(0, 0);
  const snow = SM.snow(), ice = SM.ice(), stoneW = mat.stone(0x8f8c8a, { bump: 1.4 }), stoneD = M.stoneDark();
  const g = new THREE.Group();
  // the altar: a carved round stone (same footprint / top as before) with a three-blade wind crest on top
  g.add(lathe([[0, 0], [1.6, 0], [1.62, 0.08], [1.5, 0.16], [1.42, 0.3], [1.5, 0.46], [1.45, 0.56], [1.38, 0.6], [0, 0.6]], stoneW, 0, y0, 0, 28));
  g.add(lathe([[0, 0], [1.75, 0], [1.9, 0.05], [0, 0.05]], stoneD, 0, y0 - 0.03, 0, 28));
  { const crest = glow(0xbfe8ff, 1.5);
    for (let k = 0; k < 3; k++) { const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8, a = k * TAU / 3 + u * 2.2, r = 0.15 + u * 0.95; pts.push([Math.cos(a) * r, y0 + 0.69, Math.sin(a) * r]); }
      const tb = tube(pts, 0.05, crest, 12, 4); tb.castShadow = false; g.add(tb); } }
  site.platDisc(0, 0, 1.5, y0 + 0.6, 1);
  // flagstone apron around the altar, flush with the snow
  for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU + rng() * 0.1, r = 2.4 + (i % 2) * 0.9; const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const f = rbox(0.9 + rng() * 0.4, 0.12, 0.7 + rng() * 0.3, i % 3 ? stoneW : stoneD, x, site.h(x, z) + 0.02, z, 0.04); f.rotation.y = -a + (rng() - 0.5) * 0.3; g.add(f); }
  // shrine north of the altar
  site.building(hokora({ scale: 2.0, roofMat: M.tile() }), 0, -8.5, 0);
  { const nr = nearestRoad(A.x, A.z + 8), tx = nr.x - A.x, tz = nr.z - A.z, ty = site.h(tx, tz), ry = Math.atan2(nr.dx, nr.dz);
    const tr = placeTorii(site, makeTorii(1.0, { color: 'wood' }), tx, tz, ty, ry);
    // a snow cap riding the kasagi (rises with its curved ends) and a little drift on the nuki
    const cap = new THREE.Group(); cap.position.set(tx, ty, tz); cap.rotation.y = ry;
    for (const sx of [-1, 1]) { const c = lumpy(0.5, snow, sx * 1.55, tr.height + 0.06 + 0.05, 0, 0.12, 3 + sx, 14, 6, 3.6, 0.32, 0.6); c.rotation.z = sx * 0.07; cap.add(c); }
    cap.add(lumpy(0.4, snow, 0, tr.height - 1.3 + 0.16, 0, 0.14, 9, 12, 6, 4.2, 0.3, 0.4));
    site.add(cap); }
  // prayer flags strung between poles all round (cloth that sways in the wind)
  const flagCols = [0x3b6fd8, 0xf2f2f2, 0xd8433b, 0x4caa58, 0xf2c23b].map((c) => { const m = clothify(mat.cloth(c), 0.16); m.side = THREE.DoubleSide; return m; });
  const flagGeo = new THREE.PlaneGeometry(0.34, 0.46, 1, 3);
  const poles = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.25; poles.push([Math.cos(a) * 11.5, Math.sin(a) * 11.5]); }
  for (const [x, z] of poles) { const y = site.h(x, z);
    g.add(rcyl(0.08, 0.1, 5.5, M.woodDark(), x, y + 2.75, z, 8));
    g.add(lathe([[0, 0], [0.11, 0], [0.13, 0.12], [0.06, 0.26], [0, 0.3]], M.bronze(), x, y + 5.5, z, 10));   // finial
    g.add(lumpy(0.45, stoneD, x, y + 0.1, z, 0.18, x * 3 + z, 10, 8, 1, 0.5, 1));                          // footing stones
    site.colCyl(x, z, 0.12, y - 1, y + 5.5); }
  const flagLine = (pa, pb, sag, n, i0) => {
    const rp = rope(pa, pb, sag, 0.02, M.rope(), 10); g.add(rp.mesh);
    const ry = Math.atan2(pb[0] - pa[0], pb[2] - pa[2]) + Math.PI / 2;
    for (let k = 1; k < n; k++) { const [x, y, z] = rp.at(k / n);
      const f = new THREE.Mesh(flagGeo, flagCols[(i0 + k) % 5]); f.position.set(x, y - 0.24, z); f.rotation.set((rng() - 0.5) * 0.25, ry, (rng() - 0.5) * 0.1); f.castShadow = false; g.add(f); }
  };
  for (let i = 0; i < poles.length; i++) { const [ax, az] = poles[i], [bx, bz] = poles[(i + 1) % poles.length];
    flagLine([ax, site.h(ax, az) + 5.2, az], [bx, site.h(bx, bz) + 5.2, bz], 0.9, 12, i); }
  // a tall mast against the back of the shrine with flag lines fanning to the ring of poles
  { const mx = 0, mz = -11.2, my = site.h(mx, mz);
    g.add(rcyl(0.1, 0.13, 8.2, M.woodDark(), mx, my + 4.1, mz, 8), lathe([[0, 0], [0.14, 0], [0.17, 0.16], [0.07, 0.34], [0, 0.4]], M.bronze(), mx, my + 8.2, mz, 10));
    site.colCyl(mx, mz, 0.15, my - 1, my + 8.2);
    for (const i of [1, 2, 4, 5]) { const [px, pz] = poles[i]; flagLine([mx, my + 7.9, mz], [px, site.h(px, pz) + 5.3, pz], 1.4, 16, i * 2); } }
  // wind chimes (fūrin): glass bells with clappers and paper tanzaku that catch the wind
  const bell = glow(0xbfeaff, 1.3), strip = [0xf2f2f2, 0xd8433b, 0x3b6fd8].map((c) => { const m = clothify(mat.paper(c), 0.3); m.side = THREE.DoubleSide; return m; });
  const stripGeo = new THREE.PlaneGeometry(0.08, 0.32, 1, 3);
  for (const sx of [-1, 1]) {
    const fx = sx * 3.2, fz = -6.0, y = site.h(fx, fz);
    g.add(rbox(0.12, 2.6, 0.12, M.woodDark(), fx - 0.9, y + 1.3, fz, 0.02), rbox(0.12, 2.6, 0.12, M.woodDark(), fx + 0.9, y + 1.3, fz, 0.02));
    g.add(rbox(2.3, 0.12, 0.16, M.woodDark(), fx, y + 2.6, fz, 0.03), rbox(2.0, 0.06, 0.5, M.tile(), fx, y + 2.72, fz, 0.02));
    g.add(lumpy(0.3, snow, fx, y + 2.8, fz, 0.12, 5 + sx, 12, 6, 3.6, 0.35, 0.9));
    for (let k = 0; k < 3; k++) {
      const cx = fx - 0.6 + k * 0.6;
      g.add(lathe([[0.001, 0.2], [0.05, 0.19], [0.11, 0.12], [0.13, 0.0], [0.12, -0.01]], bell, cx, y + 2.1, fz, 12));
      g.add(rbox(0.012, 0.42, 0.012, M.rope(), cx, y + 2.42, fz, 0.004), sphere(0.025, M.bronze(), cx, y + 2.07, fz, 6, 4));
      const s = new THREE.Mesh(stripGeo, strip[k]); s.position.set(cx, y + 1.88, fz); s.rotation.y = (rng() - 0.5) * 0.6; s.castShadow = false; g.add(s);
    }
    site.colBox(fx, fz, 1.0, 0.1, 0, y - 1, y + 2.6);
  }
  // cairns of stacked stones and ice lanterns along the summit (decoration only, kept off the path)
  let cairns = 0, lamps = 0;
  for (let i = 0; i < 40 && (cairns < 6 || lamps < 6); i++) {
    const a = rng() * TAU, r = 4.5 + rng() * 11; const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z + 8.5) < 3.2 || Math.abs(x) < 4.5 && z > -7 && z < -5 || !isClear(A.x + x, A.z + z, 0.8, { road: 2 })) continue;
    let y = site.h(x, z);
    if (cairns < 6 && i % 2 === 0) {
      cairns++; const n = 4 + Math.floor(rng() * 4); let s = 0.42;
      for (let k = 0; k < n; k++) { const st = lumpy(s, k % 2 ? stoneD : stoneW, x + (rng() - 0.5) * 0.06, y + s * 0.45, z, 0.15, k + i, 10, 7, 1.1, 0.55, 0.9); st.rotation.y = rng() * 3; g.add(st); y += s * 0.85; s *= 0.8; }
      g.add(lumpy(s * 1.1, snow, x, y + s * 0.15, z, 0.1, i, 10, 6, 1.1, 0.35, 1));
    } else if (lamps < 6) {
      lamps++;
      g.add(lumpy(0.5, snow, x, y + 0.08, z, 0.12, i * 3, 12, 6, 1, 0.35, 1));
      g.add(lathe([[0.3, 0], [0.32, 0.05], [0.26, 0.5], [0.18, 0.62], [0.04, 0.66], [0.001, 0.66]], ice, x, y + 0.12, z, 8));
      const fl = sphere(0.09, M.lampWarm(2.6), x, y + 0.36, z, 6, 4); fl.castShadow = false; g.add(fl);
    }
  }
  site.add(g);
  snowShell(site, snow);
  await site.bakeSliced(ctx.step);
  ctx.place('windshrine', { group: site.baked, site, altarTop: y0 + 0.6 });
}

/**
 * Snow lying on every upward-facing surface of a site (roofs, torii beams, lantern caps, pole tops): copies the
 * triangles whose world normal points up, lifts them a few cm along +y and gives them the snow material. Glow, cloth
 * and transparent meshes are skipped. Runs before site.bake(), so the shell merges with the rest of the site.
 */
function snowShell(site, snowMat, minUp = 0.5, lift = 0.07) {
  site.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(site.root.matrixWorld).invert(), mtx = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const out = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  site.root.traverse((o) => {
    if (!o.isMesh || o.material === snowMat || Array.isArray(o.material)) return;
    const m = o.material;
    if (m.transparent || m.userData?.cloth || m.isMeshBasicMaterial || m.toneMapped === false || m.emissiveIntensity > 1) return;
    mtx.multiplyMatrices(inv, o.matrixWorld);
    const g = o.geometry, p = g.attributes.position, idx = g.index;
    const tri = idx ? idx.count / 3 : p.count / 3;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(p, i0).applyMatrix4(mtx); b.fromBufferAttribute(p, i1).applyMatrix4(mtx); c.fromBufferAttribute(p, i2).applyMatrix4(mtx);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      const l = n.length(); if (l < 1e-6) continue;
      if (n.y / l < minUp) continue;
      out.push(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z, c.x, c.y + lift, c.z);
    }
  });
  if (!out.length) return;
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const uv = new Float32Array((out.length / 3) * 2); for (let i = 0; i < out.length / 3; i++) { uv[i * 2] = out[i * 3] * 0.5; uv[i * 2 + 1] = out[i * 3 + 2] * 0.5; }
  sg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  sg.computeVertexNormals();
  const sm = new THREE.Mesh(sg, snowMat); sm.castShadow = false; sm.receiveShadow = true;
  sm.matrixAutoUpdate = true; site.root.add(sm);   // already in root-local space
}

// ---------------------------------------------------------------------------------------------------------------
const _isleGeo = new Map();
function isleRockGeo(r, depth, seed) {
  const k = r + ':' + depth + ':' + seed;
  if (_isleGeo.has(k)) return _isleGeo.get(k);
  const geo = new THREE.ConeGeometry(r * 1.08, depth, 14, 5, true);
  geo.rotateX(Math.PI);
  geo.translate(0, -depth / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const f = 1 + 0.22 * noise2(a * 2.2 + seed, y * 0.18) + 0.1 * noise2(a * 6 + seed * 3, y * 0.5);
    const yy = y < -0.01 ? y * (1 + 0.15 * noise2(x * 0.3 + seed, z * 0.3)) : y;
    p.setXYZ(i, x * f, yy, z * f);
  }
  geo.computeVertexNormals();
  _isleGeo.set(k, geo);
  return geo;
}
async function buildSkyIsles(ctx) {
  const rng = mulberry32(1414);
  const list = [];
  for (const I of SKY_ISLES) {
    await ctx.step('isle');
    const site = new Site('isle_' + I.id, 0, 0, 0);
    const veil = G.world.veilAt(I.x, I.z);
    const major = veil > 0.82 ? 'night' : veil > 0.1 ? 'dusk' : 'sun';
    const grass = toon(major === 'night' ? PAL.grassNight : major === 'dusk' ? PAL.grassDusk : PAL.grassSun);
    const depth = I.r * 1.3 + 6;
    // landforms (src/world/landforms/isles.js) builds the island's land itself when present: cap, rock, roots, falls.
    // The rng() calls below stay in the same order either way, so the decor on top keeps its places.
    const own = !!G.landforms?.isles?.has?.(I.id);
    const rockRot = rng() * 6;
    if (!own) {
      const rock = new THREE.Mesh(isleRockGeo(I.r, depth, I.x * 0.01), major === 'night' ? M.rockDark() : M.rock());
      rock.castShadow = rock.receiveShadow = true;
      site.add(rock, I.x, I.top - 0.9, I.z, rockRot);
      site.add(cyl(I.r * 1.04, I.r * 1.1, 0.9, toon(major === 'night' ? 0x3a3346 : PAL.dirt), 0, 0, 0, 20), I.x, I.top - 0.55, I.z);
      site.add(cyl(I.r, I.r * 1.03, 0.3, grass, 0, 0, 0, 20), I.x, I.top - 0.15, I.z);
    }
    site.platDisc(I.x, I.z, I.r, I.top, depth * 0.8);
    // soft top: bushes, a rim of rocks, flowers
    const bushM = toon(major === 'night' ? 0x1f4a5e : major === 'dusk' ? 0xb0743a : PAL.leafSun);
    for (let k = 0; k < 7; k++) {
      const a = rng() * TAU, d = I.r * (0.55 + rng() * 0.35);
      const b = sphere(0.7 + rng() * 0.8, bushM, I.x + Math.cos(a) * d, I.top + 0.1, I.z + Math.sin(a) * d, 8, 6); b.scale.y = 0.7; site.add(b);
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + rng(), d = I.r * 0.97;
      const st = ico(0.4 + rng() * 0.5, major === 'night' ? M.rockDark() : M.rock(), I.x + Math.cos(a) * d, I.top - 0.1, I.z + Math.sin(a) * d); if (!own) site.add(st);
    }
    const fl = own ? null : major === 'night' ? glow(PAL.glowCyan, 1.6) : toon(major === 'dusk' ? PAL.ginkgo : PAL.sunflower);
    for (let k = 0; k < 16; k++) { const a = rng() * TAU, d = rng() * I.r * 0.8; if (!own) site.add(sphere(0.12, fl, I.x + Math.cos(a) * d, I.top + 0.18, I.z + Math.sin(a) * d, 5, 4)); }
    // dangling roots / glowing crystals under the night isles
    for (let k = 0; k < 4; k++) {
      const a = rng() * TAU, d = rng() * I.r * 0.6;
      const c = cone(0.4 + rng() * 0.5, 2 + rng() * 3, major === 'night' ? glow(PAL.crystal, 1.6) : M.rockDark(), I.x + Math.cos(a) * d, I.top - depth * (0.5 + rng() * 0.3), I.z + Math.sin(a) * d, 5);
      c.rotation.x = Math.PI; c.castShadow = false; if (!own) site.add(c);
    }
    // what grows / stands on top
    const kind = ['tree', 'shrine', 'tree', 'lantern', 'stones'][list.length % 5];
    if (kind === 'tree') {
      const id = major === 'night' ? 'tree_willow_1' : major === 'dusk' ? 'tree_maple_3' : 'tree_cherry_2';
      const tr = assetTree(id, 1, major === 'night' ? PAL.glowTeal : major === 'dusk' ? PAL.maple : PAL.sakura, PAL.woodDark);
      if (tr) { site.add(tr, I.x + I.r * 0.25, I.top, I.z - I.r * 0.2, rng() * 6); site.colCyl(I.x + I.r * 0.25, I.z - I.r * 0.2, 0.4, I.top - 1, I.top + 4); }
    } else if (kind === 'shrine') {
      const b = hokora({ scale: 1.3, roofMat: major === 'night' ? M.tileNight() : M.tile() });
      site.building(b, I.x, I.z - I.r * 0.35, rng() * 6, I.top, { foundation: false });
      site.add(makeTorii(0.6).group, I.x, I.top, I.z + I.r * 0.35);
    } else if (kind === 'lantern') {
      site.add(stoneLanternDecor(major !== 'sun'), I.x, I.top, I.z);
      site.colCyl(I.x, I.z, 0.45, I.top - 1, I.top + 2.6);
    } else {
      site.add(stones(7, I.r * 0.5, rng, M.stone()), I.x, I.top - 0.1, I.z);
    }
    list.push({ id: I.id, x: I.x, z: I.z, top: I.top, r: I.r, kind });
    await site.bakeSliced(ctx.step);
    ctx.place('isle_' + I.id, { group: site.baked, site });
  }
  ctx.place('skyisles', { isles: list });
}

// --- 星晶野 megaliths ---------------------------------------------------------------------------------------------
const _mono = new Map();
/** Rough-hewn standing-stone block, unit size (x 1, y 1, z 1, base at y 0): bulging, chipped, tapered, seeded. */
function monolithGeo(seed) {
  const k = seed % 12;
  let g = _mono.get(k);
  if (g) return g;
  const b = new THREE.BoxGeometry(1, 1, 1, 3, 6, 2);
  b.translate(0, 0.5, 0);
  const p = b.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const taper = 1 - 0.22 * y, bulge = 1 + 0.12 * Math.sin(y * 3.1 + k);
    const n = noise2(x * 3.1 + k * 7.3, y * 4.3 + z * 2.7) * 0.09 + noise2(y * 9 + k, x * 7 - z * 5) * 0.035;
    x = x * taper * bulge + n; z = z * taper * bulge + n * 0.7;
    if (y > 0.97) { y += noise2(x * 5 + k, z * 5) * 0.06 - Math.abs(x) * 0.12; }
    p.setXYZ(i, x, y, z);
  }
  g = b.toNonIndexed(); g.computeVertexNormals();
  _mono.set(k, g);
  return g;
}
let _runeM = null, _runeRing = null;
function runeCanvas(w, h, rows, seed) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const q = c.getContext('2d'); q.clearRect(0, 0, w, h);
  q.strokeStyle = '#ffffff'; q.lineWidth = Math.max(2, w / 22); q.lineCap = 'round';
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cell = rows ? h / rows : w / 12;
  const n = rows || 12;
  for (let i = 0; i < n; i++) {
    const cx = rows ? w / 2 : cell * (i + 0.5), cy = rows ? cell * (i + 0.5) : h / 2, u = cell * 0.32;
    q.beginPath();
    const kind = Math.floor(r() * 5);
    if (kind === 0) { q.arc(cx, cy, u, 0, Math.PI * 2); q.moveTo(cx, cy - u); q.lineTo(cx, cy + u); }
    else if (kind === 1) { q.moveTo(cx - u, cy + u); q.lineTo(cx, cy - u); q.lineTo(cx + u, cy + u); q.moveTo(cx - u * 0.5, cy + u * 0.1); q.lineTo(cx + u * 0.5, cy + u * 0.1); }
    else if (kind === 2) { q.arc(cx, cy, u, Math.PI * 0.2, Math.PI * 1.8); q.moveTo(cx + u * 0.3, cy); q.lineTo(cx + u, cy); }
    else if (kind === 3) { q.moveTo(cx - u, cy - u); q.lineTo(cx + u, cy - u); q.lineTo(cx - u, cy + u); q.lineTo(cx + u, cy + u); }
    else { q.moveTo(cx, cy - u); q.lineTo(cx, cy + u); q.moveTo(cx - u, cy - u * 0.3); q.lineTo(cx, cy); q.lineTo(cx + u, cy - u * 0.3); }
    q.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function runeMat() {
  if (!_runeM) { _runeM = new THREE.MeshBasicMaterial({ map: runeCanvas(64, 256, 6, 99), color: new THREE.Color(0x7fe0ff).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }); }
  return _runeM;
}
function runeRingMat() {
  if (!_runeRing) { const rt = runeCanvas(512, 48, 0, 7); rt.wrapS = THREE.RepeatWrapping; _runeRing = new THREE.MeshBasicMaterial({ map: rt, color: new THREE.Color(0x9fd8ff).multiplyScalar(2.0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }); }
  return _runeRing;
}

function arcTorus(r, tube, mat, x, y, z, arc) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 40, arc), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
