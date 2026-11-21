// landforms — floating islands (浮空岛): pieces of land lifted by magic. Exact walkable top (SKY_ISLES top / r) with a
// grassy cap and a drooping grass fringe, a dirt band with roots and vines, layered broken rock (each stratum
// overhanging the one below, vertical cracks) narrowing into hanging prongs and stalactites, thin streams falling off
// the edge into mist, glowing crystal veins under the night isles, a soft cloud wisp at the base and drifting rocks.
// Platforms, colliders and the decor on top stay in structures (builders/far.js) — this file is only the land.
import * as THREE from 'three';
import { mulberry32, noise2 } from '../../core/util.js';
import { SKY_ISLES } from '../../data/world.js';
import { Bake, rockShader, PALS, protoRock, lin, mix3, sstep } from './rockgeo.js';
import { createIsleMeadow } from './isleMeadow.js';
import { lfMats, Puffs } from './lfmats.js';

const TAU = Math.PI * 2;
const GRASS = { sun: [lin(0x6fb64a), lin(0x9ad35e)], dusk: [lin(0xa48a3e), lin(0xc9a95a)], night: [lin(0x1f4a5a), lin(0x2f6a72)] };
const DIRT = { sun: lin(0x8a6a4a), dusk: lin(0x6e4a3c), night: lin(0x3a3346) };
const ROOT = { sun: lin(0x5b3a29), dusk: lin(0x4d3530), night: lin(0x2a2440) };
const VINE = { sun: lin(0x4f8f3e), dusk: lin(0x8a6a2e), night: lin(0x1f5a5e) };
const WATER = { sun: lin(0xd8f2ff), dusk: lin(0xffd6c4), night: lin(0x7ff0ff) };
const MIST = { sun: lin(0xf6fbff), dusk: lin(0xffe0d6), night: lin(0x8fa2d8) };
const ROCKP = { sun: PALS.sun, dusk: PALS.dusk, night: PALS.night };

// which isles get a stream falling off the edge (angle offset is random)
const FALLS = new Set(['fi_kite', 'fi_sun', 'fi_cape', 'fi_dusk1', 'fi_lake', 'fi_peak', 'fi_night4', 'fi_glow']);

/** Depth of the rock body below the top (m). */
export const isleDepth = (I) => I.r * 1.9 + 12;

export function buildIsles(G, root) {
  const W = G.world;
  const M = lfMats();
  const rocks = new THREE.Group(); rocks.name = 'landforms_isles';
  root.add(rocks);
  const falls = new Bake(), fallAttr = [];
  const puffs = new Puffs();
  const glowB = new Bake();
  const drift = [];
  const ids = new Set();
  const info = [];
  const dproto = protoRock({ seed: 77, w: 9, h: 7, planes: 9, flat: 0.5, bottom: -0.9 });

  for (const I of SKY_ISLES) {
    const seed = Math.abs(Math.round(I.x * 13 + I.z * 7)) + 11;
    const rnd = mulberry32(seed);
    const veil = W.veilAt(I.x, I.z);
    const major = veil > 0.82 ? 'night' : veil > 0.1 ? 'dusk' : 'sun';
    const T = I.top, r = I.r, D = isleDepth(I);
    const pal = { ...ROCKP[major] };
    const shade = rockShader(pal);
    const body = new Bake(), cap = new Bake();

    // ---- rock body: rings of a polar grid (A around), strata bands overhanging downward ----------------------------
    const A = 56;
    const rings = [];   // { y, k (radius factor), kind: 0 dirt / 1 rock, band }
    rings.push({ y: T - 0.32, k: 1.035, kind: 0, band: -1 });
    rings.push({ y: T - 0.85, k: 1.05, kind: 0, band: -1 });
    rings.push({ y: T - 1.5, k: 1.02, kind: 0.5, band: -1 });
    const nb = 5 + Math.floor(rnd() * 3);
    const y0 = T - 1.5, yb = T - D * 0.8;
    const cuts = [0];
    for (let b = 1; b < nb; b++) cuts.push((b + (rnd() - 0.5) * 0.5) / nb);
    cuts.push(1);
    for (let b = 0; b < nb; b++) {
      const ta = cuts[b], tb = cuts[b + 1];
      for (const f of [0.02, 0.25, 0.55, 0.82, 0.96]) {
        const t = ta + (tb - ta) * f;
        if (b === 0 && f < 0.1) continue;
        // inset at the top of a band (under the lip of the band above), proud lip at its bottom
        const lipK = f < 0.1 ? 0.86 : 0.93 + 0.07 * sstep(0.5, 0.96, f);
        rings.push({ y: y0 + (yb - y0) * Math.pow(t, 1.08), t, k: lipK, kind: 1, band: b, f });
      }
    }
    const profile = (t) => Math.pow(Math.max(0, 1 - Math.pow(t, 1.5)), 0.72) * (1 + 0.1 * Math.sin(Math.min(1, t * 2.2) * Math.PI));
    const ph = rnd() * TAU, prongs = 2 + Math.floor(rnd() * 3);
    const lobe = (a, b) => 1 + 0.15 * noise2(Math.cos(a) * 1.2 + seed * 0.01 + b * 0.07, Math.sin(a) * 1.2) + 0.07 * noise2(Math.cos(a) * 3.1 - b * 0.11, Math.sin(a) * 3.1 + seed * 0.003);
    const crack = (a, y) => 1 - 0.075 * Math.pow(Math.abs(Math.sin(a * 6 + ph + 0.25 * Math.sin(y * 0.4))), 12) - 0.04 * Math.pow(Math.abs(Math.sin(a * 13 + ph * 2)), 16);
    const grid = [];
    for (let ri = 0; ri < rings.length; ri++) {
      const R = rings[ri];
      const t = R.t ?? 0;
      const row = [];
      for (let ai = 0; ai < A; ai++) {
        const a = (ai / A) * TAU;
        let rad = r * R.k * (R.kind === 1 ? profile(t) * lobe(a, R.band) * crack(a, R.y) : 1 + 0.02 * noise2(Math.cos(a) * 3, Math.sin(a) * 3 + seed));
        if (R.kind === 1) {
          const prong = Math.pow(0.5 + 0.5 * Math.cos(prongs * (a - ph)), 1.5);
          rad *= 1 - 0.6 * sstep(0.45, 1.0, t) * (1 - prong);
        }
        let y = R.y;
        if (R.kind === 1) y += 0.7 * noise2(Math.cos(a) * 2 + seed * 0.01, Math.sin(a) * 2) + 0.1 * noise2(Math.cos(a) * 3 + R.band, Math.sin(a) * 3);
        row.push(body.vert(I.x + Math.cos(a) * rad, y, I.z + Math.sin(a) * rad, Math.cos(a), 0, Math.sin(a), [1, 1, 1]));
      }
      grid.push(row);
    }
    // bottom tip (blunt), under the strongest prong
    const tipY = T - D * 0.84;
    const tip = body.vert(I.x + Math.cos(ph) * r * 0.06, tipY, I.z + Math.sin(ph) * r * 0.06, 0, -1, 0, [1, 1, 1]);
    for (let ri = 0; ri < grid.length - 1; ri++) for (let ai = 0; ai < A; ai++) {
      const a = grid[ri][ai], b = grid[ri][(ai + 1) % A], c = grid[ri + 1][ai], d = grid[ri + 1][(ai + 1) % A];
      body.tri(a, b, c); body.tri(b, d, c);
    }
    const last = grid[grid.length - 1];
    for (let ai = 0; ai < A; ai++) body.tri(last[ai], last[(ai + 1) % A], tip);

    // stalactites / hanging prongs: chiselled tapered cones from the lower body
    const nst = 5 + Math.floor(rnd() * 5);
    for (let k = 0; k < nst; k++) {
      const big = k < 3;
      const a = big ? ph + (k / prongs) * TAU + (rnd() - 0.5) * 0.4 : rnd() * TAU;
      const t = big ? 0.72 + rnd() * 0.18 : 0.3 + rnd() * 0.55;
      const yy = y0 + (yb - y0) * t;
      const rr = r * profile(t) * 0.75 * (big ? 0.6 : 0.9);
      const len = big ? D * (0.22 + rnd() * 0.18) : 2.5 + rnd() * 5;
      hangCone(body, I.x + Math.cos(a) * rr, yy + 0.5, I.z + Math.sin(a) * rr, len, big ? r * (0.16 + rnd() * 0.08) : 0.6 + rnd() * 0.9, rnd);
    }

    // shade the body (world-space strata + depth darkening; dirt band at the top)
    {
      const p = body.p, n = body.n, c = body.c;
      // recompute normals from the triangles first
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(body.idx); g.computeVertexNormals();
      const nn = g.attributes.normal.array;
      for (let i = 0; i < nn.length; i++) n[i] = nn[i];
      g.dispose();
      for (let v = 0; v < body.nv; v++) {
        const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
        const nx = n[v * 3], ny = n[v * 3 + 1], nz = n[v * 3 + 2];
        const depth = (T - y) / D;
        let col = shade(x, y, z, nx, ny, nz, 1, 1);
        const dk = 1 - 0.28 * sstep(0.1, 0.9, depth);
        col = [col[0] * dk, col[1] * dk, col[2] * dk * 1.04];
        const dirt = 1 - sstep(T - 1.2, T - 2.4, y);
        if (dirt > 0) col = mix3(col, DIRT[major].map((q) => q * (0.85 + 0.25 * noise2(x * 0.7, z * 0.7 + y))), dirt);
        c[v * 3] = col[0]; c[v * 3 + 1] = col[1]; c[v * 3 + 2] = col[2];
      }
    }

    // ---- grassy cap: exact flat top inside r, lip and roll over the edge -----------------------------------------------
    {
      const [g0, g1] = GRASS[major];
      const gcol = (x, z, k) => { const n = noise2(x * 0.35, z * 0.35) * 0.5 + 0.5, n2 = noise2(x * 1.3 + 4, z * 1.3); return mix3(g0, g1, n * 0.8).map((q) => q * k * (0.92 + 0.12 * n2)); };
      const radii = [0, 0.3, 0.55, 0.75, 0.9, 1.0];
      const AC = 48;
      const rowsI = [];
      const center = cap.vert(I.x, T, I.z, 0, 1, 0, gcol(I.x, I.z, 1));
      for (let ri = 1; ri < radii.length; ri++) {
        const row = [];
        for (let ai = 0; ai < AC; ai++) {
          const a = (ai / AC) * TAU, rr = r * radii[ri];
          const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr;
          row.push(cap.vert(x, T, z, 0, 1, 0, gcol(x, z, 1)));
        }
        rowsI.push(row);
      }
      // lip / roll rings (outside the walkable radius)
      const lip = [[1.03, -0.06, 0.25, 0.95], [1.055, -0.3, 0.8, 0.82], [1.05, -0.62, 0.2, 0.62], [1.03, -0.8, -0.6, 0.5]];
      for (const [k, dy, ny, sh] of lip) {
        const row = [];
        for (let ai = 0; ai < AC; ai++) {
          const a = (ai / AC) * TAU;
          const wob = 1 + 0.025 * noise2(Math.cos(a) * 4 + seed, Math.sin(a) * 4);
          const x = I.x + Math.cos(a) * r * k * wob, z = I.z + Math.sin(a) * r * k * wob;
          row.push(cap.vert(x, T + dy, z, Math.cos(a) * (1 - Math.abs(ny)), ny, Math.sin(a) * (1 - Math.abs(ny)), gcol(x, z, sh)));
        }
        rowsI.push(row);
      }
      for (let ai = 0; ai < AC; ai++) cap.tri(center, rowsI[0][(ai + 1) % AC], rowsI[0][ai]);
      for (let ri = 0; ri < rowsI.length - 1; ri++) for (let ai = 0; ai < AC; ai++) {
        const a = rowsI[ri][ai], b = rowsI[ri][(ai + 1) % AC], c = rowsI[ri + 1][ai], d = rowsI[ri + 1][(ai + 1) % AC];
        cap.tri(a, c, b); cap.tri(b, c, d);
      }
      // grass tufts: sparse inside, a dense drooping fringe over the edge
      const tufts = Math.round(r * 9);
      for (let k = 0; k < tufts; k++) {
        const a = rnd() * TAU;
        const edge = k < tufts * 0.6;
        const rr = edge ? r * (0.9 + rnd() * 0.16) : r * (0.35 + rnd() * 0.5);
        const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr;
        const y = rr > r ? T - (rr - r) * 2.5 : T;
        const out = edge ? 0.55 + rnd() * 0.5 : 0.2;
        tuft(cap, x, y - 0.02, z, a, 0.35 + rnd() * (edge ? 0.6 : 0.35), out, gcol(x, z, 0.75), gcol(x, z, 1.25), rnd);
      }
      // a little stream across the cap feeding the fall
    }

    // ---- roots and vines hanging from the dirt band -----------------------------------------------------------------
    {
      const nr = Math.round(r * 1.3);
      for (let k = 0; k < nr; k++) {
        const a = rnd() * TAU;
        const rr = r * (1.0 + rnd() * 0.04);
        const vine = rnd() < 0.55;
        const len = vine ? 3 + rnd() * 10 : 2 + rnd() * 6;
        const pts = [];
        const sx = Math.cos(a), sz = Math.sin(a);
        const y00 = T - 0.5 - rnd() * 1.2;
        const curl = (rnd() - 0.5) * 0.6;
        for (let s = 0; s <= 8; s++) {
          const t = s / 8;
          const outw = (vine ? 0.4 : 0.9) * Math.sin(t * Math.PI * 0.8) + (vine ? 0 : -0.8 * t * t);
          const sway = curl * t * t * 2;
          pts.push([I.x + sx * (rr + outw) - sz * sway, y00 - len * t, I.z + sz * (rr + outw) + sx * sway, (vine ? 0.07 : 0.16) * (1 - t * 0.75)]);
        }
        tube(cap, pts, vine ? 3 : 4, vine ? VINE[major] : ROOT[major]);
        if (vine) for (let s = 1; s < 8; s++) if (rnd() < 0.8) leaf(cap, pts[s], rnd, VINE[major]);
      }
    }

    const bodyMesh = new THREE.Mesh(body.build(), M.rock);
    bodyMesh.castShadow = bodyMesh.receiveShadow = true;
    bodyMesh.name = 'isle_rock_' + I.id;
    const capMesh = new THREE.Mesh(cap.build(), M.cap);
    capMesh.castShadow = true; capMesh.receiveShadow = true;
    capMesh.name = 'isle_cap_' + I.id;
    rocks.add(bodyMesh, capMesh);

    // ---- night: glowing crystal veins and clusters underneath -------------------------------------------------------
    if (major === 'night') {
      const cA = lin(0x6ff3ff).map((q) => q * 2.2), cB = lin(0xb48cff).map((q) => q * 2.0);
      // veins: thin glowing seams under a few strata lips
      for (let ri = 3; ri < rings.length - 2; ri++) {
        const R = rings[ri];
        if (R.f !== 0.96 || rnd() < 0.35) continue;
        const a0 = rnd() * TAU, span = 0.8 + rnd() * 1.8;
        const N = 18;
        let prevA = -1, prevB = -1;
        for (let s = 0; s <= N; s++) {
          const a = a0 + span * (s / N);
          const ai = Math.round((a / TAU) * A) % A, aiN = (ai + A) % A;
          const vi = grid[ri][aiN];
          const px = body.p[vi * 3], py = body.p[vi * 3 + 1], pz = body.p[vi * 3 + 2];
          const dx = px - I.x, dz = pz - I.z, dl = Math.hypot(dx, dz) || 1;
          const w = 0.12 + 0.1 * Math.sin(s * 1.7 + a0);
          const col = mix3(cA, cB, 0.5 + 0.5 * Math.sin(s * 0.5 + a0));
          const ia = glowB.vert(px + dx / dl * 0.06, py - 0.05, pz + dz / dl * 0.06, dx, 0, dz, col);
          const ib = glowB.vert(px + dx / dl * 0.04, py - 0.05 - w * 2.5, pz + dz / dl * 0.04, dx, 0, dz, col.map((q) => q * 0.6));
          if (prevA >= 0) { glowB.tri(prevA, ia, prevB); glowB.tri(ia, ib, prevB); }
          prevA = ia; prevB = ib;
        }
      }
      // crystal clusters jutting out and down
      const ncl = 5 + Math.floor(rnd() * 4);
      for (let k = 0; k < ncl; k++) {
        const a = rnd() * TAU, t = 0.25 + rnd() * 0.6;
        const yy = y0 + (yb - y0) * t;
        const rr = r * profile(t) * 0.92;
        const n = 2 + Math.floor(rnd() * 3);
        for (let q = 0; q < n; q++) {
          const dir = new THREE.Vector3(Math.cos(a + (rnd() - 0.5) * 0.8), -0.3 - rnd() * 0.9, Math.sin(a + (rnd() - 0.5) * 0.8)).normalize();
          crystal(glowB, I.x + Math.cos(a) * rr, yy, I.z + Math.sin(a) * rr, dir, 1.2 + rnd() * 2.6, 0.22 + rnd() * 0.3, q % 2 ? cB : cA);
        }
      }
    }

    // ---- stream falling off the edge into mist ------------------------------------------------------------------
    let streamAngle = null;
    if (FALLS.has(I.id)) {
      const a = Math.PI + (rnd() - 0.5) * 1.2;
      const L = Math.min(56, D * (1.05 + rnd() * 0.35));
      streamAngle = a;
      addFall(falls, fallAttr, I.x, I.z, T, r, a, L, 0.9 + r * 0.06, WATER[major], seed);
      // mist where the stream dissolves
      const fx = I.x + Math.cos(a) * (r * 1.06 + 1.6), fz = I.z + Math.sin(a) * (r * 1.06 + 1.6);
      // round 3: a few faint, spreading veils along the lower fall (the old stack of six puffs read as a white blob)
      for (let k = 0; k < 4; k++) {
        const t = 0.52 + k * 0.13, sp = 1 + k * 1.6;
        puffs.add(fx + (rnd() - 0.5) * sp, T - L * t, fz + (rnd() - 0.5) * sp, 3.2 + k * 1.8, 0.075 - 0.01 * k, MIST[major], 0.05, rnd());
      }
      // the source: a short flat runnel across the lip
      addRunnel(falls, fallAttr, I.x, I.z, T, r, a, WATER[major], seed);
    }

    // ---- cloud wisp at the base ------------------------------------------------------------------------------------
    {
      // a thin ring hugging the waist, just outside the rock (billboards inside the body read as a white blob from below)
      const tw = 0.5 + rnd() * 0.12, yw = T - D * tw;
      const rw = r * profile(Math.min(1, Math.max(0, (T - yw - 1.5) / (D * 0.8 - 1.5)))) * 0.95;
      const nw = 8 + Math.floor(rnd() * 4);
      for (let k = 0; k < nw; k++) {
        const a = (k / nw) * TAU + rnd() * 0.4;
        const sz = r * (0.32 + rnd() * 0.2);
        const rr = rw + sz * (0.55 + rnd() * 0.3);
        puffs.add(I.x + Math.cos(a) * rr, yw + (rnd() - 0.5) * 2.5, I.z + Math.sin(a) * rr, sz, major === 'night' ? 0.11 : 0.14, MIST[major], 0.02 + rnd() * 0.03, rnd());
      }
    }

    // ---- drifting rocks --------------------------------------------------------------------------------------------
    const nd = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < nd; k++) {
      drift.push({ cx: I.x, cz: I.z, rad: r * (1.35 + rnd() * 0.8), a: rnd() * TAU, w: (0.012 + rnd() * 0.02) * (rnd() < 0.5 ? -1 : 1),
        y: T - 3 - rnd() * D * 0.45, bob: 0.3 + rnd() * 0.5, ph: rnd() * TAU, s: 0.7 + rnd() * 1.6, rot: rnd() * TAU, spin: (rnd() - 0.5) * 0.12,
        col: ROCKP[major].base });
    }

    ids.add(I.id);
    info.push({ id: I.id, x: I.x, z: I.z, top: T, r, depth: D, major, streamAngle, fall: FALLS.has(I.id) });
  }

  // merged extras (one draw call each)
  const out = { ids, info, meshes: [rocks], meadow: createIsleMeadow(G, root, info) };
  if (!falls.empty) {
    const g = falls.build();
    g.setAttribute('aFall', new THREE.Float32BufferAttribute(fallAttr, 4));
    const m = new THREE.Mesh(g, M.fall); m.name = 'landforms_isle_falls'; m.renderOrder = 2; m.frustumCulled = false;
    root.add(m); out.falls = m;
  }
  if (puffs.n) { const m = new THREE.Mesh(puffs.build(), M.puff); m.name = 'landforms_isle_mist'; m.renderOrder = 3; root.add(m); out.mist = m; }
  if (!glowB.empty) { const m = new THREE.Mesh(glowB.build(), M.glow); m.name = 'landforms_isle_glow'; root.add(m); out.glow = m; }
  // drifting rocks: one InstancedMesh, animated near the camera
  {
    const geo = new Bake();
    geo.add(dproto, new THREE.Matrix4(), rockShader({ base: [0.85, 0.85, 0.85], alt: [0.75, 0.74, 0.78], moss: lin(0x8fb86a), mossK: 0.7 }));
    const im = new THREE.InstancedMesh(geo.build(), M.rock, drift.length);
    im.name = 'landforms_drift'; im.castShadow = true; im.receiveShadow = true;
    const c = new THREE.Color();
    drift.forEach((d, i) => { c.setRGB(d.col[0] * 1.25, d.col[1] * 1.25, d.col[2] * 1.25); im.setColorAt(i, c); });
    root.add(im);
    out.drift = { mesh: im, list: drift };
    animateDrift(out.drift, 0);
    im.computeBoundingSphere();
  }
  return out;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
export function animateDrift(D, t) {
  const im = D.mesh;
  D.list.forEach((d, i) => {
    const a = d.a + d.w * t;
    _p.set(d.cx + Math.cos(a) * d.rad, d.y + Math.sin(t * 0.4 + d.ph) * d.bob, d.cz + Math.sin(a) * d.rad);
    _e.set(0.3 * Math.sin(d.ph), d.rot + d.spin * t, 0.25 * Math.cos(d.ph)); _q.setFromEuler(_e);
    _s.set(d.s, d.s * 0.8, d.s);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
  });
  im.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------ helpers
/** Hanging chiselled stalactite: 7-sided, stepped rings, tip at (x, y - len, z). */
function hangCone(B, x, y, z, len, rad, rnd) {
  const S = 7, R = 7;
  const rows = [];
  const tw = rnd() * TAU, lean = (rnd() - 0.5) * 0.25, lx = Math.cos(tw) * lean, lz = Math.sin(tw) * lean;
  for (let i = 0; i <= R; i++) {
    const t = i / R;
    const step = 1 - 0.12 * ((t * 3.3 + rnd() * 0.2) % 1);
    const rr = rad * Math.pow(1 - t, 1.15) * step;
    const cy = y - len * t, cx = x + lx * len * t * t, cz = z + lz * len * t * t;
    const row = [];
    for (let s = 0; s < S; s++) {
      const a = (s / S) * TAU + tw + t * 0.3;
      const j = 1 + (rnd() - 0.5) * 0.25;
      row.push(B.vert(cx + Math.cos(a) * rr * j, cy + (rnd() - 0.5) * 0.15 * rad, cz + Math.sin(a) * rr * j, Math.cos(a), 0, Math.sin(a), [1, 1, 1]));
    }
    rows.push(row);
  }
  for (let i = 0; i < R; i++) for (let s = 0; s < S; s++) {
    const a = rows[i][s], b = rows[i][(s + 1) % S], c = rows[i + 1][s], d = rows[i + 1][(s + 1) % S];
    B.tri(a, b, c); B.tri(b, d, c);
  }
}

/** Grass tuft: n single-triangle blades fanning from (x,y,z), leaning outward along heading a by `out`. */
function tuft(B, x, y, z, a, h, out, c0, c1, rnd) {
  const n = 4;
  for (let k = 0; k < n; k++) {
    const b = a + (rnd() - 0.5) * 2.2, w = 0.05 + rnd() * 0.04;
    const ox = Math.cos(b), oz = Math.sin(b);
    const px = -oz * w, pz = ox * w;
    const hh = h * (0.7 + rnd() * 0.5);
    const lean = out * hh;
    const droop = out > 0.5 ? hh * 0.6 : 0;
    const bx = x + (rnd() - 0.5) * 0.15, bz = z + (rnd() - 0.5) * 0.15;
    const i0 = B.vert(bx + px, y, bz + pz, 0, 1, 0, c0);
    const i1 = B.vert(bx - px, y, bz - pz, 0, 1, 0, c0);
    const i2 = B.vert(bx + Math.cos(a) * lean + ox * 0.08, y + hh - droop, bz + Math.sin(a) * lean + oz * 0.08, 0, 1, 0, c1);
    B.tri(i0, i1, i2);
  }
}

/** Tube through pts [[x,y,z,r]], `sides` around. */
function tube(B, pts, sides, col) {
  const rows = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z, r] = pts[i];
    const j = Math.min(pts.length - 1, i + 1), h = Math.max(0, i - 1);
    let tx = pts[j][0] - pts[h][0], ty = pts[j][1] - pts[h][1], tz = pts[j][2] - pts[h][2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // basis perpendicular to the tangent
    let ux = 1, uy = 0, uz = 0;
    if (Math.abs(tx) > 0.9) { ux = 0; uz = 1; }
    let bx = ty * uz - tz * uy, by = tz * ux - tx * uz, bz = tx * uy - ty * ux; const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
    const cx = by * tz - bz * ty, cy = bz * tx - bx * tz, cz = bx * ty - by * tx;
    const row = [];
    const k = 0.8 + 0.4 * (i / pts.length);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * TAU;
      const nx = bx * Math.cos(a) + cx * Math.sin(a), ny = by * Math.cos(a) + cy * Math.sin(a), nz = bz * Math.cos(a) + cz * Math.sin(a);
      row.push(B.vert(x + nx * r, y + ny * r, z + nz * r, nx, ny, nz, col.map((q) => q * k)));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let s = 0; s < sides; s++) {
    const a = rows[i][s], b = rows[i][(s + 1) % sides], c = rows[i + 1][s], d = rows[i + 1][(s + 1) % sides];
    B.tri(a, c, b); B.tri(b, c, d);
  }
}

function leaf(B, p, rnd, col) {
  const a = rnd() * TAU, s = 0.18 + rnd() * 0.16;
  const ox = Math.cos(a) * s, oz = Math.sin(a) * s;
  const c = col.map((q) => q * (1.05 + rnd() * 0.35));
  const i0 = B.vert(p[0], p[1], p[2], ox, 0.4, oz, c);
  const i1 = B.vert(p[0] + ox - oz * 0.5, p[1] - s * 0.3, p[2] + oz + ox * 0.5, ox, 0.4, oz, c);
  const i2 = B.vert(p[0] + ox * 2, p[1] - s * 0.5, p[2] + oz * 2, ox, 0.4, oz, c);
  const i3 = B.vert(p[0] + ox + oz * 0.5, p[1] - s * 0.3, p[2] + oz - ox * 0.5, ox, 0.4, oz, c);
  B.tri(i0, i1, i2); B.tri(i0, i2, i3);
}

/** Hexagonal glowing crystal with a pointed tip from (x,y,z) along dir. */
function crystal(B, x, y, z, dir, len, rad, col) {
  const S = 6;
  let ux = 0, uy = 1, uz = 0; if (Math.abs(dir.y) > 0.9) { ux = 1; uy = 0; }
  const b = new THREE.Vector3(ux, uy, uz).cross(dir).normalize(), c = dir.clone().cross(b).normalize();
  const ring = (t, rr) => { const o = []; for (let s = 0; s < S; s++) { const a = (s / S) * TAU; const nx = b.x * Math.cos(a) + c.x * Math.sin(a), ny = b.y * Math.cos(a) + c.y * Math.sin(a), nz = b.z * Math.cos(a) + c.z * Math.sin(a); o.push(B.vert(x + dir.x * t + nx * rr, y + dir.y * t + ny * rr, z + dir.z * t + nz * rr, nx, ny, nz, col.map((q) => q * (0.55 + 0.45 * (t / len))))); } return o; };
  const r0 = ring(-0.3, rad), r1 = ring(len * 0.78, rad * 0.95);
  const tip = B.vert(x + dir.x * len, y + dir.y * len, z + dir.z * len, dir.x, dir.y, dir.z, col.map((q) => q * 1.3));
  for (let s = 0; s < S; s++) { const s1 = (s + 1) % S; B.tri(r0[s], r1[s], r0[s1]); B.tri(r0[s1], r1[s], r1[s1]); B.tri(r1[s], tip, r1[s1]); }
}

/** Falling ribbon: a curved sheet (arc of a cylinder around the fall axis) arching off the lip then dropping L m. */
function addFall(B, attr, cx, cz, T, r, a, L, w, col, seed) {
  const ox = Math.cos(a), oz = Math.sin(a), px = -oz, pz = ox;
  const rows = 22, cols = 5;
  const idx = [];
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    const yDrop = v < 0.1 ? (v / 0.1) * (v / 0.1) * L * 0.1 : L * v;
    const outw = r * 1.06 + 0.2 + Math.min(1, v * 6) * 1.2 + v * 0.8;
    const ww = w * (1 + v * 1.6);
    const row = [];
    for (let j = 0; j <= cols; j++) {
      const u = j / cols;
      const ang = (u - 0.5) * 2.0;
      const sx = Math.sin(ang) * ww * 0.5, sOut = (Math.cos(ang) - 0.6) * ww * 0.35;
      const x = cx + ox * (outw + sOut) + px * sx, z = cz + oz * (outw + sOut) + pz * sx;
      row.push(B.vert(x, T - 0.28 - yDrop, z, ox, 0, oz, col));
      attr.push(u, v, L, (seed % 97) * 0.13);
    }
    idx.push(row);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const p = idx[i][j], q = idx[i][j + 1], s = idx[i + 1][j], t = idx[i + 1][j + 1];
    B.tri(p, s, q); B.tri(q, s, t);
  }
}

/** Flat runnel over the cap edge feeding the fall (from 0.72 r to the lip). */
function addRunnel(B, attr, cx, cz, T, r, a, col, seed) {
  const ox = Math.cos(a), oz = Math.sin(a), px = -oz, pz = ox;
  const rows = 6, w = 0.55;
  let prev = null;
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    const d = r * (0.72 + 0.36 * v);
    const y = d > r ? T - (d - r) * 1.3 + 0.03 : T + 0.03;
    const wig = Math.sin(v * 5 + seed) * 0.4;
    const xa = cx + ox * d + px * (wig - w), za = cz + oz * d + pz * (wig - w);
    const xb = cx + ox * d + px * (wig + w), zb = cz + oz * d + pz * (wig + w);
    const ia = B.vert(xa, y, za, 0, 1, 0, col), ib = B.vert(xb, y, zb, 0, 1, 0, col);
    attr.push(0, v * 0.3, 12, 3.1, 1, v * 0.3, 12, 3.1);
    if (prev) { B.tri(prev[0], ia, prev[1]); B.tri(prev[1], ia, ib); }
    prev = [ia, ib];
  }
}
