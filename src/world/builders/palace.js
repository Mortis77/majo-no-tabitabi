// 月读宫 — the Moon palace on its crag (architecture round 2). The climax of the game: an arena ringed by a colonnade
// with an entablature, a carved moon gate with an inner light, the lantern dais before a crescent screen, side halls
// and corner pavilions with sweeping night-tile roofs and golden shachi, a fortress skirt down the crag, lantern rows,
// long banners in the wind, floating stone fragments, crescent motifs, vermilion bridges over the moat (月池).
// Every walkable surface / collider of the old palace is kept exactly (arena disc, pillar colliders, gate plinths,
// landing terrace + balustrade, dais, crescent screen, side halls); new pieces are visual unless stated.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { PAL, glow, glowDynamic } from '../../core/mats.js';
import { box, cyl, sphere, torus } from '../../core/geo.js';
import { mulberry32, TAU } from '../../core/util.js';
import { ANCHORS, POI, MOAT } from '../../data/world.js';
import { Site, M, mat, building, makeRoof, clothify, textTexture, texMat, stoneCourse } from './kit.js';
import { lathe, rbox, ring } from '../../props/shapes.js';
import { stoneLanternDecor } from './decor.js';
import { buildDais, placeGreatLantern, buildBridge } from './dusk.js';

function arcTorus(r, tube, m, x, y, z, arc, rs = 6, ts = 40) {
  const o = new THREE.Mesh(new THREE.TorusGeometry(r, tube, rs, ts, arc), m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  return o;
}
/** crescent plate (extruded, bevelled) of outer radius r, facing +z, horns up */
const _cres = new Map();
function crescent(r, depth, m) {
  const k = r + ':' + depth;
  let geo = _cres.get(k);
  if (!geo) {
    const s = new THREE.Shape();
    s.absarc(0, 0, r, Math.PI * 0.05, Math.PI * 0.95, true);
    s.absarc(0, r * 0.32, r * 0.78, Math.PI * 0.98, Math.PI * 0.02, false);
    geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: r * 0.04, bevelSegments: 1, curveSegments: 10 });
    geo.translate(0, 0, -depth / 2);
    _cres.set(k, geo);
  }
  const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true;
  return o;
}

export async function buildPalace(ctx) {
  const P = POI.palace, Ar = ANCHORS.palace_arena;
  const site = new Site('palace', P.x, P.z, 0);
  const L = (x, z) => [x - P.x, z - P.z];
  const top = P.h;
  const rng = mulberry32(140);
  const silver = M.silver(), blue = M.deepBlue(), ms = M.moonStone(), msd = M.moonStoneDark(), gold = M.gold();
  const pale = mat.stone(0xc9d0e4), wall = mat.stone(0x7f89ab), night = M.tileNight();
  const cold = glow(0xbfe0ff, 2.2), coldK = glow(0x8fc8ff, 2.8), warm = M.lampWarm(2.4);
  const g = new THREE.Group();
  const [ax, az] = L(Ar.x, Ar.z);
  await ctx.step('palace');
  // --- arena floor (unchanged platform), inlaid rings and spokes, a carved rim -----------------------------------
  g.add(cyl(30, 30.6, 0.5, mat.stone(0x7d88ad), ax, top + 0.25, az, 64));
  for (const [r, w] of [[29.2, 0.35], [21, 0.25], [12, 0.25], [4, 0.2]]) { const rg = torus(r, w, coldK, ax, top + 0.52, az, 3, 96); rg.rotation.x = Math.PI / 2; rg.scale.z = 0.25; rg.castShadow = false; g.add(rg); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const sp = box(0.18, 0.06, 17, cold, ax + Math.cos(a) * 20.5, top + 0.53, az + Math.sin(a) * 20.5); sp.rotation.y = -a + Math.PI / 2; sp.castShadow = false; g.add(sp); }
  // crescent inlays between the spokes, rotating round the middle ring
  for (let i = 0; i < 12; i++) { const a = ((i + 0.5) / 12) * TAU; const c = crescent(1.1, 0.05, coldK); c.rotation.set(-Math.PI / 2, 0, -a); c.position.set(ax + Math.cos(a) * 16.5, top + 0.53, az + Math.sin(a) * 16.5); c.castShadow = false; g.add(c); }
  site.platDisc(ax, az, 30, top + 0.5, 1.0);
  // three-step ring round the arena (visual; the old ring of slabs)
  g.add(lathe([[30.5, top], [33.2, top], [33.2, top + 0.12], [32.2, top + 0.14], [32.2, top + 0.28], [31.2, top + 0.3], [31.2, top + 0.44], [30.5, top + 0.46]], pale, ax, 0, az, 72));
  await ctx.step('palace');
  // --- colonnade: 14 columns (the old pillar slots + colliders) under a ring entablature ------------------------
  const COLH = 15.5, slots = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + Math.PI / 16;
    const x = ax + Math.cos(a) * 33.5, z = az + Math.sin(a) * 33.5;
    const skip = Math.hypot(x + P.x - ANCHORS.palace_landing.x, z + P.z - ANCHORS.palace_landing.z) < 6.5 || Math.hypot(x + P.x - ANCHORS.palace_lantern.x, z + P.z - ANCHORS.palace_lantern.z) < 6;
    slots.push({ a, x, z, skip });
    if (skip) continue;
    const hgt = 16 + (i % 2) * 4;
    site.colCyl(x, z, 0.75, top - 1, top + hgt + 2);                                    // unchanged collider
    const y0 = top;
    g.add(rbox(2.3, 0.7, 2.3, msd, x, y0 + 0.35, z, 0.06, 1));                           // plinth
    g.add(lathe([[1.0, y0 + 0.7], [1.02, y0 + 0.82], [0.92, y0 + 0.9], [0.86, y0 + 1.0], [0.92, y0 + 1.08], [0.76, y0 + 1.2], [0.7, y0 + 1.3], [0, y0 + 1.3]], pale, x, 0, z, 20));   // torus base
    const sh = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; sh.push([0.7 - 0.12 * t + 0.03 * Math.sin(t * Math.PI), y0 + 1.3 + t * (COLH - 2.6)]); }
    g.add(lathe(sh, silver, x, 0, z, 16));                                                // shaft (entasis)
    for (const f of [0.3, 0.62]) g.add(ring(0.66 - f * 0.1, 0.06, blue, x, y0 + 1.3 + f * (COLH - 2.6), z, 16, 4));
    const yc = y0 + COLH - 1.3;
    g.add(ring(0.6, 0.07, gold, x, yc + 0.05, z, 16, 4));                                 // necking
    g.add(lathe([[0.58, yc], [0.64, yc + 0.25], [0.86, yc + 0.6], [1.1, yc + 0.9], [1.16, yc + 1.0], [0, yc + 1.0]], pale, x, 0, z, 20));   // echinus
    const ab = rbox(2.5, 0.32, 2.5, msd, x, yc + 1.16, z, 0.05, 1); ab.rotation.y = -a; g.add(ab);   // abacus
  }
  // entablature: architrave + glowing frieze + cornice on each span between two standing columns
  const yE = top + COLH;
  for (let i = 0; i < 16; i++) {
    const A = slots[i], B = slots[(i + 1) % 16];
    if (A.skip || B.skip) continue;
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, len = Math.hypot(B.x - A.x, B.z - A.z) + 2.4;
    const ry = -Math.atan2(B.z - A.z, B.x - A.x);
    const am = (A.a + B.a) / 2;
    const put = (o) => { o.rotation.y = ry; g.add(o); return o; };
    put(rbox(len, 1.1, 1.5, pale, mx, yE + 0.55, mz, 0.05, 1));
    put(rbox(len - 0.1, 0.5, 1.62, blue, mx, yE + 1.35, mz, 0.04, 1));
    const fr = put(box(len - 0.4, 0.14, 1.66, coldK, mx, yE + 1.35, mz)); fr.castShadow = false;
    put(rbox(len + 0.25, 0.32, 2.0, pale, mx, yE + 1.78, mz, 0.06, 1));
    put(rbox(len + 0.1, 0.16, 1.7, silver, mx, yE + 2.02, mz, 0.04, 1));
    // long banner hanging from the outer face of the architrave, in the wind
    const ox = Math.cos(am) * 0.95, oz = Math.sin(am) * 0.95;
    banner(g, mx + ox, yE - 0.05, mz + oz, -am + Math.PI / 2, 1.5, 9.5, i);
  }
  // crescent crests + moon lamps on top of the entablature above each standing column
  for (const S of slots) {
    if (S.skip) continue;
    const c = crescent(0.95, 0.16, gold); c.position.set(S.x, yE + 2.9, S.z); c.rotation.y = -S.a + Math.PI / 2; g.add(c);
    g.add(lathe([[0.4, 0], [0.42, 0.12], [0.2, 0.3], [0.16, 0.7], [0, 0.72]], gold, S.x, yE + 2.1, S.z, 12));
    const orb = sphere(0.38, coldK, S.x, yE + 3.05, S.z, 12, 8); orb.castShadow = false; g.add(orb);
  }
  await ctx.step('palace');
  // --- the moon gate ------------------------------------------------------------------------------------------
  {
    const [gx, gz] = L(ANCHORS.palace_landing.x, ANCHORS.palace_landing.z - 6.2);
    const R = 6.2, yc = top + R + 0.4;
    g.add(torus(R, 0.42, silver, gx, yc, gz, 12, 72));
    { const t2 = torus(R - 0.62, 0.14, coldK, gx, yc, gz, 6, 72); t2.castShadow = false; g.add(t2); }
    g.add(torus(R + 0.62, 0.13, gold, gx, yc, gz, 6, 72));
    // carved rim: voussoir blocks with gold studs, a keystone with a crescent
    const N = 28;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      if (Math.sin(a) < -0.86) continue;                     // leave the foot open
      const vx = gx + Math.cos(a) * (R + 0.18), vy = yc + Math.sin(a) * (R + 0.18);
      const v = rbox(0.72, 1.05, 1.15, i % 2 ? pale : ms, vx, vy, gz, 0.07, 1); v.rotation.z = a; g.add(v);
      if (i % 2 === 0) g.add(sphere(0.09, gold, gx + Math.cos(a) * (R + 0.18), yc + Math.sin(a) * (R + 0.18), gz + 0.6, 6, 4));
    }
    g.add(rbox(1.3, 1.7, 1.5, pale, gx, yc + R + 0.45, gz, 0.1, 2));
    const kc = crescent(0.55, 0.12, gold); kc.position.set(gx, yc + R + 0.5, gz + 0.8); g.add(kc);
    // inner light: a faint luminous veil filling the ring, brighter at the rim
    g.add(gateVeil(R - 0.7, gx, yc, gz));
    for (const sx of [-1, 1]) {
      g.add(rbox(1.6, 1.2, 2.4, msd, gx + sx * (R - 0.3), top + 0.6, gz, 0.08, 2));                 // unchanged plinths
      site.colBox(gx + sx * (R - 0.3), gz, 0.8, 1.2, 0, top - 1, top + 1.5);
      // guardian lantern posts flanking the gate
      g.add(lathe([[0.5, 0], [0.5, 0.3], [0.32, 0.45], [0.26, 2.6], [0.4, 2.8], [0.4, 2.95], [0, 2.95]], pale, gx + sx * (R + 1.9), top, gz + 1.2, 12));
      const lamp = sphere(0.36, coldK, gx + sx * (R + 1.9), top + 3.35, gz + 1.2, 12, 8); lamp.castShadow = false; g.add(lamp);
      g.add(arcTorus(0.5, 0.06, gold, gx + sx * (R + 1.9), top + 3.35, gz + 1.2, Math.PI * 1.3));
    }
    const cr = arcTorus(1.3, 0.28, gold, gx, top + 2 * R + 2.3, gz, Math.PI * 1.3); cr.rotation.z = -Math.PI * 0.15; g.add(cr);
  }
  await ctx.step('palace');
  // --- landing terrace (unchanged platform + balustrade collider), carved balustrade, lantern row ---------------
  {
    const [lx, lz] = L(ANCHORS.palace_landing.x, ANCHORS.palace_landing.z + 3);
    const tg = new THREE.Group();
    stoneCourse(tg, 18, 12, 0, 1.4, msd, 77);
    tg.position.set(lx, top - 1.0, lz); g.add(tg);
    g.add(rbox(18.2, 0.2, 12.2, pale, lx, top + 0.3, lz, 0.05, 1));
    site.platBox(lx, lz, 9, 6, 0, top + 0.4, 1);
    for (let i = 0; i <= 12; i++) {
      const x = lx - 9 + i * 1.5;
      g.add(lathe([[0.16, 0], [0.16, 0.08], [0.1, 0.16], [0.17, 0.42], [0.1, 0.72], [0.14, 0.86], [0.14, 0.95], [0, 0.95]], pale, x, top + 0.4, lz + 5.8, 10));
    }
    g.add(rbox(18.3, 0.16, 0.36, pale, lx, top + 1.42, lz + 5.8, 0.05, 1), rbox(18.3, 0.12, 0.3, silver, lx, top + 0.46, lz + 5.8, 0.03, 1));
    site.colBox(lx, lz + 5.8, 9, 0.15, 0, top - 1, top + 1.5);
    for (const sx of [-1, 1]) { const ln = stoneLanternDecor(true); ln.traverse((o) => { if (o.isMesh && (o.material === M.stone() || o.material === M.carved())) o.material = ms; }); site.add(ln, lx + sx * 8, top + 0.4, lz + 4.5); }
  }
  await ctx.step('palace');
  // --- 月灯 dais (palace_lantern) before the crescent screen (unchanged colliders) ------------------------------
  const [dx, dz] = L(ANCHORS.palace_lantern.x, ANCHORS.palace_lantern.z);
  const daisTop = buildDais(site, dx, dz, top, { r: 4.6, h: 1.3, mat: ms, edge: msd, steps: [0] });
  {
    const cr = arcTorus(7.5, 0.9, silver, dx, top + 9, dz - 7.5, Math.PI * 1.25, 10, 56); cr.rotation.z = Math.PI * 0.125 + Math.PI; g.add(cr);
    const cr2 = arcTorus(7.5, 0.3, coldK, dx, top + 9, dz - 7.0, Math.PI * 1.25, 6, 56); cr2.rotation.z = cr.rotation.z; cr2.castShadow = false; g.add(cr2);
    const cr3 = arcTorus(8.55, 0.16, gold, dx, top + 9, dz - 7.5, Math.PI * 1.25, 4, 56); cr3.rotation.z = cr.rotation.z; g.add(cr3);
    for (const sx of [-1, 1]) {
      g.add(rbox(3, 1.2, 2, msd, dx + sx * 6.2, top + 0.6, dz - 7.5, 0.08, 2));
      // banner pair hanging beside the screen
      g.add(lathe([[0.12, 0], [0.1, 8.5], [0.16, 8.6], [0, 8.8]], silver, dx + sx * 9.6, top, dz - 6.4, 8));
      banner(g, dx + sx * 9.6 - sx * 0.05, top + 8.2, dz - 6.2, 0, 1.3, 7.2, 30 + sx);
    }
    site.colBox(dx, dz - 7.5, 7.5, 1.0, 0, top - 1, top + 2);
  }
  await ctx.step('palace');
  // --- side halls (unchanged footprints) with shachi on the ridges -------------------------------------------
  for (const sx of [-1, 1]) {
    const b = building({ w: 10, d: 7, wallH: 3.6, base: 1.0, engawa: 1.4, rail: true, steps: true, pitch: 2.5, postMat: silver, beamMat: blue, railMat: silver,
      brackets: true, bracketMat: gold,
      front: ['shoji', 'shoji', 'shoji', 'shoji'], left: 'plaster', right: 'plaster', back: 'plaster', winMat: glow(0xcfe6ff, 1.9), floorMat: ms, plinthMat: msd,
      roof: { style: 'hip', over: 1.9, h: 4.6, mat: mat.tile(0x2e3f7a), ridgeMat: silver, underMat: blue, lift: 1.3, shachi: gold } });
    const [hx, hz] = L(P.x + sx * 43.5, P.z - 12);
    site.building(b, hx, hz, -sx * Math.PI / 2);
  }
  await ctx.step('palace');
  // --- corner pavilions on the rear terrace (hexagonal-feel pyramid roofs, open sides) — visual + posts ---------
  for (const sx of [-1, 1]) {
    const px = sx * 24, pz = -38;
    if (Math.hypot(px, pz) > 50) continue;
    const pg = new THREE.Group();
    pg.add(rbox(7.6, 0.8, 7.6, msd, 0, 0.4, 0, 0.08, 2), rbox(7.0, 0.16, 7.0, pale, 0, 0.88, 0, 0.04, 1));
    for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
      pg.add(lathe([[0.32, 0], [0.32, 0.12], [0.24, 0.24], [0.22, 3.6], [0.3, 3.75], [0, 3.75]], silver, qx * 2.8, 0.96, qz * 2.8, 12));
      site.colCyl(px + qx * 2.8, pz + qz * 2.8, 0.3, top - 1, top + 4.6);
    }
    for (const s of [-1, 1]) pg.add(rbox(6.0, 0.36, 0.3, blue, 0, 4.5, s * 2.8, 0.04, 1), rbox(0.3, 0.36, 6.0, blue, s * 2.8, 4.5, 0, 0.04, 1));
    const rf = makeRoof({ hw: 4.6, hd: 4.6, h: 3.4, style: 'pyramid', mat: night, ridgeMat: silver, underMat: blue, lift: 1.1, finial: pavFinial(gold) });
    rf.group.position.y = 4.7; pg.add(rf.group);
    // hanging moon lanterns under the eaves
    for (const qx of [-1, 1]) for (const qz of [-1, 1]) { const l = sphere(0.26, warm, qx * 3.6, 4.1, qz * 3.6, 10, 8); l.scale.y = 1.3; l.castShadow = false; pg.add(l); }
    site.add(pg, px, top, pz, 0);
  }
  await ctx.step('palace');
  // --- lantern rows round the outer terrace ----------------------------------------------------------------------
  for (let i = 0; i < 16; i += 2) {
    const a = ((i + 1) / 16) * TAU;
    const x = ax + Math.cos(a) * 38.5, z = az + Math.sin(a) * 38.5;
    if (Math.hypot(x, z) > 50) continue;
    if (Math.hypot(x + P.x - ANCHORS.palace_landing.x, z + P.z - ANCHORS.palace_landing.z) < 10) continue;
    if (Math.abs(Math.abs(x) - 43.5) < 7 && Math.abs(z + 12) < 9) continue;      // side halls
    if (Math.abs(Math.abs(x) - 24) < 5.5 && Math.abs(z + 38) < 5.5) continue;      // pavilions
    const ln = stoneLanternDecor(true); ln.traverse((o) => { if (o.isMesh && (o.material === M.stone() || o.material === M.carved())) o.material = ms; });
    site.add(ln, x, site.h(x, z), z, -a + Math.PI / 2);
  }
  await ctx.step('palace');
  // --- fortress skirt down the crag: battered masonry ring under the rim, parapet curb on top ----------------------
  {
    const pts = [];
    const RT = 52.5;
    for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([RT + 2.2 * t * t + 0.4 * Math.sin(k * 1.7), top + 0.25 - t * 26]); }
    const skirt = lathe(pts.slice().reverse(), wall, 0, 0, 0, 96); skirt.material = wall; g.add(skirt);
    // course lines and buttresses
    for (const y of [top - 4, top - 10, top - 17]) { const t = (top + 0.25 - y) / 26; g.add(ring(RT + 2.2 * t * t + 0.08, 0.18, msd, 0, y, 0, 96, 4)); }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU + 0.07;
      { const b = rbox(2.0, 24, 2.6, msd, Math.cos(a) * (RT + 1.4), top - 12, Math.sin(a) * (RT + 1.4), 0.15, 1); b.rotation.y = -a; g.add(b); }
    }
    // curb (low parapet) with breaks; purely visual, 0.45 m
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU;
      if (i % 8 === 7) continue;
      const c = rbox(4.6, 0.45, 0.7, pale, Math.cos(a) * (RT - 0.4), top + 0.22, Math.sin(a) * (RT - 0.4), 0.06, 1); c.rotation.y = -a + Math.PI / 2; g.add(c);
    }
  }
  site.add(g);
  await site.bakeSliced(ctx.step);
  await ctx.step('palace');
  // --- floating stone fragments drifting round the crag (one InstancedMesh, bobbing) ---------------------------
  frags(ctx, P, top, rng);
  const gl = placeGreatLantern(ctx, 'gl_moon', ANCHORS.palace_lantern.x, ANCHORS.palace_lantern.z, daisTop);
  ctx.place('palace', { group: site.baked, site, daisTop, lantern: gl, arena: { x: Ar.x, z: Ar.z, r: 30, y: top + 0.5 } });
  await ctx.step('palace');
  // --- vermilion bridges over the moat (decorative crossings; deck walkable) -------------------------------------
  for (const [id, deg] of [['b_moat_sw', 128], ['b_moat_se', 52]]) {
    try {
      const a = (deg * Math.PI) / 180, rm = (MOAT.r0 + MOAT.r1) / 2;
      await buildBridge(ctx, { id, x: MOAT.x + Math.cos(a) * rm, z: MOAT.z + Math.sin(a) * rm, rot: -a, len: MOAT.r1 - MOAT.r0 + 12 }, { width: 3.6, arch: 4.2 });
    } catch (e) { G.reportError('structures:moatbridge', e); }
  }
}

function pavFinial(m) {
  const g = new THREE.Group();
  g.add(lathe([[0.28, 0], [0.18, 0.15], [0.16, 0.5], [0.3, 0.62], [0.32, 0.8], [0.18, 0.95], [0.06, 1.3], [0, 1.4]], m, 0, -0.1, 0, 14));
  const c = crescent(0.42, 0.08, m); c.position.y = 1.75; g.add(c);
  return g;
}

/** A long banner: deep-blue cloth with a silver crescent and border, top edge at y, hanging down `h` m, swaying. */
const _banTex = new Map();
function banner(g, x, y, z, ry, w, h, seed) {
  const key = 'pb' + (seed % 2);
  let m = _banTex.get(key);
  if (!m) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 384;
    const q = c.getContext('2d');
    q.fillStyle = seed % 2 ? '#1f2c66' : '#2a2160'; q.fillRect(0, 0, 64, 384);
    q.fillStyle = '#c9d4ff'; q.fillRect(4, 0, 3, 384); q.fillRect(57, 0, 3, 384);
    q.fillStyle = '#e7c66a'; q.fillRect(0, 0, 64, 10);
    q.beginPath(); q.arc(32, 92, 20, 0, TAU); q.fillStyle = '#dfe6ff'; q.fill();
    q.beginPath(); q.arc(40, 86, 18, 0, TAU); q.fillStyle = seed % 2 ? '#1f2c66' : '#2a2160'; q.fill();
    q.strokeStyle = '#8fa6ff'; q.lineWidth = 2; for (let i = 0; i < 6; i++) { q.beginPath(); q.moveTo(14, 150 + i * 30); q.lineTo(50, 150 + i * 30); q.stroke(); }
    // swallow-tail cut at the bottom
    q.clearRect(0, 352, 64, 32); q.fillStyle = seed % 2 ? '#1f2c66' : '#2a2160';
    q.beginPath(); q.moveTo(0, 352); q.lineTo(64, 352); q.lineTo(64, 384); q.lineTo(32, 360); q.lineTo(0, 384); q.closePath(); q.fill();
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    m = clothify(texMat(tx, { side: THREE.DoubleSide, alphaTest: 0.5, transparent: false }), 0.55);
    m.userData.surface = 'none'; m.userData.farColor = 0x26306a;
    _banTex.set(key, m);
  }
  const pg = new THREE.PlaneGeometry(w, h, 1, 8);
  const o = new THREE.Mesh(pg, m);
  o.position.set(x, y - h / 2, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true;
  g.add(o);
  { const bar = rbox(w + 0.3, 0.1, 0.1, M.gold(), x, y + 0.02, z, 0.03, 1); bar.rotation.y = ry; g.add(bar); }
}

/** Luminous disc inside the moon gate (additive radial glow, brighter toward the rim). */
function gateVeil(r, x, y, z) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const q = c.getContext('2d'); const gr = q.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(160,200,255,0.10)'); gr.addColorStop(0.7, 'rgba(170,210,255,0.22)'); gr.addColorStop(0.93, 'rgba(210,230,255,0.7)'); gr.addColorStop(1, 'rgba(210,230,255,0)');
  q.fillStyle = gr; q.fillRect(0, 0, 128, 128);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  m.color.setScalar(0.75);
  const o = new THREE.Mesh(new THREE.CircleGeometry(r, 48), m);
  o.position.set(x, y, z); o.castShadow = false; o.userData.dynamic = true; o.renderOrder = 3;
  return o;
}

/** Floating stone fragments: chiselled moonstone blocks with a glowing rune band, bobbing slowly round the crag. */
function frags(ctx, P, top, rng) {
  const N = G.quality?.name === 'low' ? 10 : 22;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.y *= 0.55; if (v.y < 0) v.y *= 1.8; v.x *= 1 + 0.15 * Math.sin(v.z * 5); p.setXYZ(i, v.x, v.y, v.z); }
  const rock = geo.toNonIndexed(); rock.computeVertexNormals();
  const im = new THREE.InstancedMesh(rock, M.moonStone(), N);
  const band = new THREE.InstancedMesh(new THREE.TorusGeometry(1.02, 0.05, 3, 20), glow(0x9fd0ff, 2.4), N);
  band.castShadow = false;
  const items = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + rng() * 0.2, r = 58 + rng() * 22, sc = 1.2 + rng() * 2.6;
    items.push({ x: P.x + Math.cos(a) * r, y: top - 20 + rng() * 44, z: P.z + Math.sin(a) * r, sc, ph: rng() * TAU, spin: (rng() - 0.5) * 0.2, ry: rng() * TAU });
  }
  const write = (t) => {
    for (let i = 0; i < N; i++) {
      const it = items[i];
      pos.set(it.x, it.y + Math.sin(t * 0.4 + it.ph) * 0.9, it.z);
      q.setFromEuler(e.set(0.1 * Math.sin(t * 0.3 + it.ph), it.ry + t * it.spin, 0));
      s.setScalar(it.sc);
      m4.compose(pos, q, s); im.setMatrixAt(i, m4);
      s.set(it.sc, it.sc, it.sc); q.setFromEuler(e.set(Math.PI / 2 + 0.1 * Math.sin(t * 0.3 + it.ph), it.ry + t * it.spin, 0));
      m4.compose(pos, q, s); band.setMatrixAt(i, m4);
    }
    im.instanceMatrix.needsUpdate = true; band.instanceMatrix.needsUpdate = true;
  };
  write(0);
  im.castShadow = true; im.receiveShadow = true;
  im.frustumCulled = false; band.frustumCulled = false;
  const grp = new THREE.Group(); grp.name = 'palace_frags'; grp.add(im, band);
  G.scene.add(grp);
  const c = new THREE.Vector3(P.x, top, P.z);
  ctx.cull(grp, c, 700);
  let fr = 0;
  const cp = new THREE.Vector3();
  ctx.tick((dt, t) => { if (!grp.visible || (++fr & 1)) return; G.camera?.getWorldPosition(cp); if (cp.distanceToSquared(c) < 320 * 320) write(t); });
}
void glowDynamic; void PAL; void textTexture; void cyl;
