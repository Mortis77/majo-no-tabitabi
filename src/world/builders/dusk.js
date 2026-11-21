// The dusk lands: 暮桥 (arched bridge), 狐火之里 (fox village), 千年枫 (the ancient maple + 暮灯 dais), 雾见泉 (spring shrine).
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { PAL, toon, flat, glow } from '../../core/mats.js';
import { box, cyl, cone, sphere } from '../../core/geo.js';
import { t } from '../../core/i18n.js';
import { mulberry32, TAU } from '../../core/util.js';
import { ANCHORS, POI, BRIDGES } from '../../data/world.js';
import { Site, M, building, isClear, rod, rope, hokora, nearestRoad, windowMat, stairs, stoneCourse } from './kit.js';
import { makeTorii, makeGreatLantern } from './factories.js';
import { stoneLanternDecor, nobori, shimenawa, assetTree, stones, procTree, kitsune } from './decor.js';
import { placeTorii } from './shrine.js';
import { paperLanternStatic } from './paperLantern.js';
export { paperLanternStatic };

export async function buildDusk(ctx) {
  for (const b of BRIDGES) { await buildBridge(ctx, b); await ctx.step('bridge'); }
  await buildFoxVillage(ctx);
  await ctx.step('fox:done');
  await buildDuskTree(ctx);
  await ctx.step('dusktree:done');
  await buildSpring(ctx);
}

// ---------------------------------------------------------------------------------------------------------------
/** Arched vermilion bridge: walkable deck (platforms), railings (colliders), piers into the water. */
export async function buildBridge(ctx, B, { width = 3.8, arch = 3.2 } = {}) {
  const site = new Site('bridge_' + B.id, B.x, B.z, B.rot + Math.PI / 2);   // local +z runs along the span
  const half = B.len / 2;
  const yA = Math.max(site.h(0, -half), 0.6), yB = Math.max(site.h(0, half), 0.6);
  const N = Math.ceil(B.len / 0.9);
  const yAt = (f) => yA + (yB - yA) * f + 4 * arch * f * (1 - f);
  const deck = new THREE.Group();
  const plank = M.woodLight(), verm = M.verm(), dark = M.woodDark();
  for (let i = 0; i < N; i++) {
    const f0 = i / N, f1 = (i + 1) / N, fm = (f0 + f1) / 2;
    const z0 = -half + B.len * f0, z1 = -half + B.len * f1, zm = (z0 + z1) / 2;
    const y0 = yAt(f0), y1 = yAt(f1), ym = yAt(fm);
    const seg = box(width, 0.22, Math.hypot(z1 - z0, y1 - y0) + 0.03, plank, 0, 0, 0);
    seg.position.set(0, ym - 0.11, zm); seg.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
    deck.add(seg);
    // side beams (vermilion fascia)
    for (const sx of [-1, 1]) { const fb = box(0.16, 0.42, Math.hypot(z1 - z0, y1 - y0) + 0.03, verm, sx * (width / 2 + 0.06), ym - 0.25, zm); fb.rotation.x = seg.rotation.x; deck.add(fb); }
    site.platBox(0, zm, width / 2, (z1 - z0) / 2 + 0.02, 0, ym, 1.0);
    for (const sx of [-1, 1]) site.colBox(sx * (width / 2 + 0.05), zm, 0.08, (z1 - z0) / 2 + 0.02, 0, ym - 0.3, ym + 1.2);
  }
  // railings: posts with bronze giboshi caps + two rails following the arch
  const nP = Math.round(B.len / 2.4);
  for (const sx of [-1, 1]) {
    for (let i = 0; i <= nP; i++) {
      const f = i / nP, z = -half + B.len * f, y = yAt(f);
      const end = i === 0 || i === nP;
      const pr = end ? 0.13 : 0.09;
      deck.add(cyl(pr, pr, 1.15, verm, sx * (width / 2 + 0.05), y + 0.55, z, 8));
      deck.add(cyl(pr * 1.25, pr * 1.25, 0.06, M.black(), sx * (width / 2 + 0.05), y + 0.05, z, 8));
      if (end || i % 3 === 0) {
        deck.add(cyl(pr * 1.15, pr * 1.15, 0.07, M.gold(), sx * (width / 2 + 0.05), y + 1.14, z, 8));
        const gb = sphere(pr * 1.45, M.gold(), sx * (width / 2 + 0.05), y + 1.27, z, 8, 6); gb.scale.y = 0.85; deck.add(gb);
        deck.add(cone(pr * 0.7, pr * 1.6, M.gold(), sx * (width / 2 + 0.05), y + 1.46, z, 6));
      } else deck.add(box(0.2, 0.06, 0.2, verm, sx * (width / 2 + 0.05), y + 1.14, z));
    }
    for (const hh of [1.0, 0.5]) {
      for (let i = 0; i < nP; i++) {
        const fa = i / nP, fb = (i + 1) / nP;
        deck.add(rod(sx * (width / 2 + 0.05), yAt(fa) + hh, -half + B.len * fa, sx * (width / 2 + 0.05), yAt(fb) + hh, -half + B.len * fb, hh > 0.7 ? 0.06 : 0.04, verm, 6));
      }
    }
  }
  // piers: pairs of round posts with cross-bracing, standing in the river
  for (const f of [0.22, 0.4, 0.6, 0.78]) {
    const z = -half + B.len * f, y = yAt(f);
    const gy = site.h(0, z) - 1;
    for (const sx of [-1, 1]) deck.add(cyl(0.22, 0.26, y - gy, dark, sx * (width / 2 - 0.3), (y + gy) / 2 - 0.2, z, 8));
    deck.add(box(width, 0.2, 0.2, dark, 0, y - 0.7, z));
    deck.add(rod(-(width / 2 - 0.3), y - 0.8, z, width / 2 - 0.3, Math.max(gy + 0.5, y - 2.8), z, 0.07, dark, 5));
  }
  // stone abutments under both ends (individual dressed stones)
  for (const s of [-1, 1]) {
    const z = s * (half - 0.6), y = yAt(s < 0 ? 0 : 1), gy = Math.min(site.h(0, z), y - 0.4);
    const ab = new THREE.Group();
    stoneCourse(ab, width + 0.9, 1.6, 0, y - gy + 0.9, M.stoneWarm(), B.len + s);
    ab.position.y = gy - 0.9; ab.position.z = z;
    deck.add(ab);
  }
  // lanterns at both ends
  for (const s of [-1, 1]) for (const sx of [-1, 1]) {
    const z = s * (half + 1.2), x = sx * (width / 2 + 1.0);
    const y = site.h(x, z);
    if (!isClear(site.wx(x, z), site.wz(x, z), 0.5, { road: 1.4 })) continue;
    site.add(stoneLanternDecor(true), x, y, z);
    site.colCyl(x, z, 0.45, y - 1, y + 2.6);
  }
  site.add(deck);
  await site.bakeSliced(ctx.step);
  ctx.place(B.id, { group: site.baked, site, deckY: (f) => yAt(f), apexY: yAt(0.5) });
}

// ---------------------------------------------------------------------------------------------------------------
async function buildFoxVillage(ctx) {
  const P = POI.foxvillage;
  const site = new Site('foxvillage', P.x, P.z, 0);
  const L = (x, z) => [x - P.x, z - P.z];
  const rng = mulberry32(5150);
  const veil = G.world.veilAt(P.x, P.z);
  const win = windowMat(Math.max(veil, 0.5));
  const tileMat = M.tileDusk();
  const out = { site };

  await ctx.step('fox');
  // --- 千本鳥居 tunnel of torii along the road to the ancient maple ------------------------------------------------
  {
    const road = [[-70, 90], [-60, 0]];
    const dx = road[1][0] - road[0][0], dz = road[1][1] - road[0][1], len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len, ry = Math.atan2(ux, uz);
    let n = 0;
    for (let d = 14; d <= 52; d += 1.15) {
      const x = road[0][0] + ux * d, z = road[0][1] + uz * d;
      const [lx, lz] = L(x, z);
      const y = site.h(lx, lz);
      const tr = makeTorii(0.82);
      placeTorii(site, tr, lx, lz, y, ry);
      n++;
      if (n % 6 === 1) {                       // a fox-fire lantern hanging from every sixth torii's tie beam
        const lan = paperLanternStatic(M.foxFire(2.4));
        site.add(lan, lx, y + 4.6 * 0.82 - 1.3, lz, ry);
      }
    }
    // fox statues guard the entrance
    for (const sx of [-1, 1]) {
      const x = road[0][0] + ux * 11 + uz * sx * 3.2, z = road[0][1] + uz * 11 - ux * sx * 3.2;
      const [lx, lz] = L(x, z);
      const y = site.h(lx, lz);
      // carved fox messengers (decor kitsune): the brush tails sweep outward, one holds a scroll, one a jewel
      site.add(kitsune(sx, sx > 0, 1.0), lx, y - 0.04, lz, ry + Math.PI + sx * 0.35);
      site.colBox(lx, lz, 0.6, 0.7, ry, y - 1, y + 3);
    }
    out.tunnel = { from: [road[0][0] + ux * 14, road[0][1] + uz * 14], to: [road[0][0] + ux * 52, road[0][1] + uz * 52], count: n };
  }
  await ctx.step('fox');
  // --- the elder's hall (west, facing east) -----------------------------------------------------------------
  {
    const b = building({ w: 9, d: 6.5, wallH: 2.8, base: 1.3, engawa: 1.2, rail: true, steps: true, pitch: 2.25,
      postMat: M.verm(), beamMat: M.verm(), front: ['shoji', 'shoji', 'shoji', 'shoji'], left: 'plaster', right: 'plaster', back: 'wood', winMat: win,
      brackets: true, bracketMat: M.verm(),
      roof: { style: 'hip', over: 1.3, h: 3.4, mat: tileMat, lift: 0.8, underMat: M.wood(), rafterMat: M.woodLight() } });
    b.group.add(shimenawa([-3.7, 3.85, 4.05], [3.7, 3.85, 4.05], 0.35, 0.15));
    const [lx, lz] = L(-94, 80);
    site.building(b, lx, lz, Math.PI / 2);
    for (const sz of [-1, 1]) {
      const [fx, fz] = L(-84.5, 80 + sz * 3.4);
      const y = site.h(fx, fz);
      site.add(kitsune(-sz, sz < 0, 0.82), fx, y - 0.04, fz, -Math.PI / 2 + sz * 0.3);
      site.colBox(fx, fz, 0.5, 0.6, 0, y - 1, y + 2.5);
    }
  }
  await ctx.step('fox');
  // --- small shrine houses on stilts --------------------------------------------------------------------
  const spots = [[-100, 104, 2.6], [-90, 118, 3.0], [-62, 120, 3.3], [-44, 116, 3.6], [-38, 76, 4.6], [-48, 64, 5.0], [-96, 60, 1.2], [-108, 74, 1.6], [-32, 98, 4.1]];
  for (const [i, [x, z, ry]] of spots.entries()) {
    await ctx.step('fox:house');
    if (!isClear(x, z, 4, { road: 2.5 })) continue;
    const big = i % 3 === 0;
    const b = building({ w: big ? 5.5 : 4.2, d: big ? 4.4 : 3.6, wallH: 2.3, base: 1.6 + (i % 2) * 0.6, plinth: 'none', engawa: 0.9, rail: true, steps: true, pitch: big ? 1.85 : 2.1,
      postMat: M.verm(), beamMat: M.verm(), front: ['shoji', 'open', 'shoji'], left: 'shoji', right: 'plaster', back: 'plaster', winMat: win,
      roof: { style: i % 2 ? 'gable' : 'hip', over: 0.8, h: big ? 2.3 : 1.8, mat: tileMat, lift: 0.5 } });
    // stilts under the floor
    const W = big ? 5.5 : 4.2, D = big ? 4.4 : 3.6, base = 1.6 + (i % 2) * 0.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 0.2, 1]) b.group.add(cyl(0.11, 0.13, base + 0.3, M.vermDark(), sx * (W / 2 - 0.2), base / 2 - 0.15, sz * (D / 2 + 0.3) + 0.4, 6));
    b.group.add(box(W + 0.4, 0.1, 0.1, M.vermDark(), 0, base * 0.45, D / 2 + 0.4));
    // a fox-fire lantern at the eave corner
    const lan = paperLanternStatic(M.foxFire(2.4)); lan.position.set(W / 2 + 0.3, base + 2.4, D / 2 + 1.0); b.group.add(lan);
    const [lx, lz] = L(x, z);
    site.building(b, lx, lz, ry, null, { foundation: false });
  }
  await ctx.step('fox');
  // --- tiny hokora + fox statues sprinkled around -----------------------------------------------------------
  for (const [x, z, ry] of [[-80, 70, 0.6], [-58, 80, -0.4], [-110, 92, 1.5], [-24, 86, -1.4], [-75, 128, 3.0]]) {
    if (!isClear(x, z, 1.5, { road: 2 })) continue;
    const [lx, lz] = L(x, z);
    site.building(hokora({ scale: 0.8, stilt: 0 , roofMat: tileMat }), lx, lz, ry);
  }
  await ctx.step('fox');
  // --- strings of fox-fire lanterns on poles across the lanes ---------------------------------------------------
  {
    const poles = [[[-60, 86], [-60, 96]], [[-82, 87], [-82, 95]], [[-73, 104], [-66, 104]], [[-50, 84], [-50, 93]]];
    const pm = M.woodDark();
    const g = new THREE.Group();
    for (const [[ax, az], [bx, bz]] of poles) {
      const A = L(ax, az), B = L(bx, bz);
      if (!isClear(ax, az, 0.2, { road: 1.6 }) || !isClear(bx, bz, 0.2, { road: 1.6 })) continue;
      const ya = site.h(...A), yb = site.h(...B);
      g.add(cyl(0.07, 0.08, 3.6, pm, A[0], ya + 1.8, A[1], 6), cyl(0.07, 0.08, 3.6, pm, B[0], yb + 1.8, B[1], 6));
      const rp = rope([A[0], ya + 3.4, A[1]], [B[0], yb + 3.4, B[1]], 0.45, 0.02, M.rope(), 10);
      g.add(rp.mesh);
      for (let k = 1; k < 6; k++) { const [x, y, z] = rp.at(k / 6); const l = paperLanternStatic(k % 2 ? M.foxFire(2.4) : M.lampWarm(2.3)); l.position.set(x, y, z); g.add(l); }
      site.colCyl(A[0], A[1], 0.12, ya - 1, ya + 3.6); site.colCyl(B[0], B[1], 0.12, yb - 1, yb + 3.6);
    }
    site.add(g);
  }
  await ctx.step('fox');
  // --- maples and ginkgo in the yards ---------------------------------------------------------------------
  for (const [x, z, id] of [[-112, 112, 'tree_maple_1'], [-30, 120, 'tree_maple_3'], [-110, 58, 'tree_ginkgo_1'], [-28, 64, 'tree_maple_1'], [-86, 132, 'tree_maple_3']]) {
    if (!isClear(x, z, 2, { road: 3 })) continue;
    const tr = procTree(id.replace('tree_maple_', 'maple').replace('tree_ginkgo_', 'ginkgo'), 1, id.includes('ginkgo') ? 0xf2b632 : [0xe5632b, 0xd8452a, 0xf07a2a][Math.floor(rng() * 3)]);
    const [lx, lz] = L(x, z);
    const y = site.h(lx, lz);
    site.add(tr, lx, y - 0.1, lz, rng() * 6);
    site.colCyl(lx, lz, 0.45, y - 1, y + 4);
  }
  // banners
  for (const [x, z] of [[-64, 70], [-77, 108], [-57, 110]]) {
    if (!isClear(x, z, 0.2, { road: 1.6 })) continue;
    const [lx, lz] = L(x, z);
    site.add(nobori(t('structures.banner.fox'), { bg: '#d94a2a', fg: '#fff4dc', crest: 'fox' }), lx, site.h(lx, lz), lz, rng() * 6);
  }
  await site.bakeBlocksSliced(64, ctx.step);   // draw-call pass: 64 m blocks (was 32)

  // floating fox-fire wisps (one instanced mesh, bobbing)
  const n = 16;
  const wisp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), glow(0x8fe6ff, 3.2), n);
  wisp.castShadow = false; wisp.frustumCulled = false;
  const base = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, r = 8 + rng() * 34;
    const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
    base.push([x, G.world.heightAt(x, z) + 2.2 + rng() * 2.5, z, rng() * TAU]);
  }
  const m4 = new THREE.Matrix4();
  const camPos = new THREE.Vector3();
  G.scene.add(wisp);
  let acc = 0;
  ctx.tick((dt, time) => {
    acc += dt;
    if (acc < 1 / 30) return;
    acc = 0;
    if (!G.camera) return;
    G.camera.getWorldPosition(camPos);
    const near = Math.hypot(camPos.x - P.x, camPos.z - P.z) < 260;
    wisp.visible = near;
    if (!near) return;
    for (let i = 0; i < n; i++) {
      const b = base[i];
      m4.makeTranslation(b[0] + Math.sin(time * 0.4 + b[3]) * 1.2, b[1] + Math.sin(time * 1.1 + b[3] * 2) * 0.45, b[2] + Math.cos(time * 0.35 + b[3]) * 1.2);
      wisp.setMatrixAt(i, m4);
    }
    wisp.instanceMatrix.needsUpdate = true;
  });
  ctx.place('foxvillage', { group: site.baked, blocks: site.blocks, wisps: wisp, ...out });
}

// ---------------------------------------------------------------------------------------------------------------
async function buildDuskTree(ctx) {
  const A = ANCHORS.dusk_lantern;
  const site = new Site('dusktree', A.x, A.z, 0);
  const y0 = site.h(0, 0);
  const out = { site };
  // the colossal maple, east of the road, its crown arching over the dais
  {
    const tx = 17, tz = -15;
    // the procedural maple of the forest, grown to ancient size (two crowns, turned against each other)
    site.add(procTree('maple1', 5.4, 0xe0502a), tx, site.h(tx, tz) - 0.6, tz, 2.3);
    site.add(procTree('maple3', 4.2, 0xf07a2a), tx + 1.0, site.h(tx, tz) - 0.6, tz - 0.8, 4.1);
    site.colCyl(tx, tz, 3.2, y0 - 2, y0 + 14);
    // roots / stone ring and a shimenawa round the trunk
    const g = new THREE.Group();
    for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU; g.add(box(1.5, 0.6, 0.6, M.stone(), tx + Math.cos(a) * 6.2, site.h(tx, tz) + 0.2, tz + Math.sin(a) * 6.2)); g.children[g.children.length - 1].rotation.y = -a; }
    const rp = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.32, 6, 28), M.rope()); rp.rotation.x = Math.PI / 2; rp.position.set(tx, site.h(tx, tz) + 4.2, tz); g.add(rp);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; const p = box(0.3, 0.7, 0.03, M.white(), tx + Math.cos(a) * 3.85, site.h(tx, tz) + 3.6, tz + Math.sin(a) * 3.85); p.rotation.y = -a + Math.PI / 2; g.add(p); }
    site.add(g);
    out.tree = { x: A.x + tx, z: A.z + tz };
  }
  // the 暮灯 dais: round stone terrace with steps, the Great Lantern on top
  const daisTop = buildDais(site, 0, 0, y0, { r: 5.2, h: 1.2, mat: M.stone(), edge: M.stoneDark(), steps: [Math.PI, 0] });
  // stone lanterns ring
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5, x = Math.cos(a) * 11, z = Math.sin(a) * 11;
    if (!isClear(A.x + x, A.z + z, 0.6, { road: 1.6 })) continue;
    site.add(stoneLanternDecor(false), x, site.h(x, z), z, -a);
    site.colCyl(x, z, 0.45, y0 - 1, y0 + 3);
  }
  // torii on the road from the fox village
  {
    const nr = nearestRoad(A.x, A.z + 14);
    placeTorii(site, makeTorii(1.1, { plaque: t('world.place.dusktree') }), nr.x - A.x, nr.z - A.z, site.h(nr.x - A.x, nr.z - A.z), Math.atan2(nr.dx, nr.dz));
  }
  await site.bakeSliced(ctx.step);
  const gl = placeGreatLantern(ctx, 'gl_dusk', A.x, A.z, daisTop);
  ctx.place('dusktree', { group: site.baked, daisTop, lantern: gl, ...out });
}

/** Round stone dais (stepped drum) centred on local (x,z) at ground y. Registers platforms; returns the top height. */
export function buildDais(site, x, z, y, { r = 5, h = 1.2, mat, edge, tiers = 2, steps = [0] } = {}) {
  const g = new THREE.Group();
  const th = h / tiers;
  for (let i = 0; i < tiers; i++) {
    const rr = r - i * (r * 0.18);
    g.add(cyl(rr, rr + 0.15, th, i % 2 ? (edge || mat) : mat, x, y + th * (i + 0.5), z, 32));
    site.platDisc(x, z, rr, y + th * (i + 1), th + 0.6);
  }
  g.add(cyl(r * 0.5, r * 0.5, 0.06, edge || mat, x, y + h + 0.03, z, 32));
  const n = Math.max(2, Math.ceil(h / 0.3));
  for (const a of steps) {
    const sx = Math.sin(a), sz = Math.cos(a);
    for (let j = 0; j < n; j++) {
      const top = y + (h * (j + 1)) / n, d = r - 0.1 + (n - 1 - j) * 0.45 + 0.22;
      const s = box(2.4, top - y + 0.4, 0.45, mat, x + sx * d, (top + y - 0.4) / 2, z + sz * d);
      s.rotation.y = a; g.add(s);
      site.platBox(x + sx * d, z + sz * d, 1.2, 0.23, a, top, top - y + 0.4);
    }
  }
  site.add(g);
  return y + h;
}

const GL_LAND = { gl_dusk: 'dusk', gl_mirror: 'mirror', gl_crystal: 'crystal', gl_moon: 'moon' };
/** Stand a Great Lantern at world (x,z) on height y, register it in G.structures.greatLanterns. */
export function placeGreatLantern(ctx, id, x, z, y) {
  const gl = makeGreatLantern({ land: GL_LAND[id] || 'sun' });
  gl.group.position.set(x, y, z);
  G.scene.add(gl.group);
  gl.top = y; gl.id = id; gl.pos = new THREE.Vector3(x, y, z);
  G.world.addCollider({ x, z, r: 1.2, y0: y - 1, y1: y + 2.6, tag: 'greatlantern' });
  ctx.S.greatLanterns[id] = gl;
  ctx.cull(gl.group, gl.pos, 900);
  const cp = new THREE.Vector3();
  // embers drifting up out of the cap while lit and near (one fx emitter, created on demand)
  let em = null;
  const sp = gl.spark ? gl.spark.clone().add(gl.pos) : gl.pos.clone().setY(y + 4.5);
  ctx.tick((dt, time) => {
    if (!G.camera) return;
    G.camera.getWorldPosition(cp);
    const d2 = cp.distanceToSquared(gl.pos);
    if (gl.lit && d2 < 160 * 160) gl.tick(dt, time);
    const want = gl.lit && d2 < 70 * 70;
    if (want && !em) em = G.fx?.emitter?.('embers', { pos: sp, rate: 0.35, radius: 0.9 }) || null;
    else if (!want && em) { em.remove?.(); em = null; }
  });
  return gl;
}

// ---------------------------------------------------------------------------------------------------------------
async function buildSpring(ctx) {
  const P = POI.spring;
  const site = new Site('spring', P.x, P.z, 0);
  // small spring shrine on the east bank, facing the pond, and a torii standing in the water
  const bx = 24, bz = 0;
  site.building(hokora({ scale: 1.5, roofMat: M.tileDusk() }), bx, bz, -Math.PI / 2);
  placeTorii(site, makeTorii(0.95), 13, 0, -1.0, Math.PI / 2);
  // stepping stones from the shrine to the torii
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const x = 21 - i * 1.4, z = (i % 2 ? 0.5 : -0.5);
    const y = Math.max(site.h(x, z), -0.2);
    g.add(cyl(0.55, 0.65, 0.5 + (y + 0.2 > 0 ? 0 : 0.4), M.stone(), x, y + 0.05, z, 8));
    site.platDisc(x, z, 0.6, Math.max(y, -0.2) + 0.3, 1.5);
  }
  for (const s of [-1, 1]) site.add(stoneLanternDecor(false), 25, site.h(25, s * 3.2), s * 3.2, -Math.PI / 2);
  g.add(stones(14, 6, mulberry32(9), M.stoneDark()).translateX(24).translateY(site.h(24, 0) - 0.2));
  site.add(g);
  await site.bakeSliced(ctx.step);
  ctx.place('spring', { group: site.baked, site });
}
