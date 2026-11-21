#!/usr/bin/env node
// Offline prop refinement (visual upgrade 2). Turns faceted, textured low-poly asset-pack models into soft cel props that
// sit in the painted world: one vertex-coloured mesh per surface kind, no textures, rounded silhouettes, bevel-like edge
// shading and baked light (AO, ground contact, worn edges, dark cavities).
//
//   node tools/refine-models.mjs                    refine every id in RECIPES, write assets/models/refined/*.glb
//   node tools/refine-models.mjs prop_pot_clay ...  only these ids
//   node tools/refine-models.mjs --manifest         also repoint the manifest entries (through tools/manifest-patch.mjs)
//   node tools/refine-models.mjs --list             print the recipe table
//
// Pipeline per model (all in the model's own units, before the manifest `scale`):
//   1. flatten every node / primitive to a triangle soup (node transforms baked)
//   2. bake colour: material colour x COLOR_0 x base-colour texture (sampled at the corner and the triangle centre, so
//      palette atlases give clean flat colours); textures are dropped afterwards
//   3. classify each triangle into a surface kind (wood / metal / earth / paper / ...) by recipe + colour rules
//   4. weld by position; edges are creases when boundary, non-manifold or sharper than the recipe's crease angle
//   5. 'round' / 'organic': crease-aware Loop subdivision (levels limited by a triangle budget) -> round silhouettes
//      'box': linear 1-to-4 tessellation (shape kept) + soft-edge normals: corners on a hard edge lean toward the
//      neighbouring face, so the cel band catches a thin highlight / shade line along every edge (a shading bevel)
//   6. normals by crease angle (position-shared, so colour seams never crease the shading)
//   7. light bake into vertex colours: voxel ambient occlusion (ground plane counted as solid for ground props),
//      ground-contact gradient, curvature (convex edges lighter / worn, cavities darker)
//   8. palette pull toward src/core/mats.js PAL (sRGB), saturation cap and a soft value floor
//   9. write one primitive per (source material, surface) with material.extras = { surface, look }; flora-path models
//      keep their source material names / colours (flora reads them) and only get shading baked into COLOR_0
// The originals stay where they were; the manifest entry of the same id points to the refined file
// (`file`), keeps the original in `orig`, records `mats` = { materialName: { surface, look } } and `refined: 2`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = 'models/refined';
const args = process.argv.slice(2);
const WRITE_MANIFEST = args.includes('--manifest');
const only = args.filter((a) => !a.startsWith('--'));

// ---- palette (sRGB), mirrors src/core/mats.js PAL (only the colours props should drift toward) ----------------------
const PAL = {
  mikoRed: 0xd8362c, gold: 0xffd27a, paper: 0xfff8e6, straw: 0xd9b46a, strawDark: 0xa98444,
  vermilion: 0xe24a2e, vermilionDark: 0xb5351f, wood: 0x8b5a3c, woodDark: 0x5b3a29, woodLight: 0xc49a6c, plaster: 0xf2e9d8,
  roofTile: 0x3c4a5c, thatch: 0xc8a86a, stone: 0x9b9aa2, stoneDark: 0x66656f, moss: 0x6f8f54,
  leafSun: 0x6fbf4f, sunflower: 0xffc928, sakura: 0xffc1d6, sand: 0xf0dfae, dirt: 0xb99468,
  maple: 0xe5632b, ginkgo: 0xf2b632, duskTrunk: 0x4d3530, rock: 0x8a8791, rockDark: 0x55525f, snow: 0xf4f8ff,
  iron: 0x4a4d57, clay: 0xc0703f, clayDark: 0xa65a33, indigo: 0x3d5f8f, porcelain: 0xe9e4d6, pumpkin: 0xf08a24, apple: 0xd8362c,
};
const PAL_RGB = Object.values(PAL).map((h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]);

// ---- surface looks (match docs/api/look.md knobs) ----------------------------------------------------------------------
const LOOKS = {
  wood: { surface: 'wood', look: { rim: 0.3 } },
  woodOld: { surface: 'wood', look: { rim: 0.3, detail: 1.2 } },
  metal: { surface: 'metal', look: { spec: 0.55, specPower: 40, rim: 0.4 } },
  clay: { surface: 'earth', look: { spec: 0.12, specPower: 20, detail: 0.7, scale: 1.2 } },
  glaze: { surface: 'paint', look: { spec: 0.35, specPower: 46, detail: 0.5 } },
  glass: { surface: 'none', look: { spec: 0.7, specPower: 70, rim: 0.6 } },
  paper: { surface: 'paper', look: { trans: 0.35, rim: 0.15 } },
  cloth: { surface: 'cloth', look: { detail: 0.8 } },
  straw: { surface: 'thatch', look: { scale: 0.8 } },
  stone: { surface: 'stone', look: {} },
  rock: { surface: 'rock', look: {} },
  bark: { surface: 'bark', look: {} },
  fruit: { surface: 'none', look: { spec: 0.3, specPower: 36, rim: 0.35, wrap: 0.5 } },
  food: { surface: 'none', look: { spec: 0.12, specPower: 24, rim: 0.3, wrap: 0.5 } },
  paint: { surface: 'paint', look: { spec: 0.15, specPower: 30 } },
  leaf: { surface: 'none', look: { trans: 0.4 } },
};

// colour rules: [test(hsl, rgb), lookKey]; first match wins, else the recipe's base look
const isIron = (h) => h.s < 0.22 && h.l < 0.62;
const isGreyLight = (h) => h.s < 0.16 && h.l >= 0.62;
const isGreen = (h) => h.h > 0.2 && h.h < 0.45 && h.s > 0.25;
const isRedFruit = (h) => (h.h < 0.04 || h.h > 0.94) && h.s > 0.45 && h.l > 0.25;
const isOrange = (h) => h.h > 0.03 && h.h < 0.12 && h.s > 0.6 && h.l > 0.35;
const IRON = [isIron, 'metal'];
const FOOD_IN_CRATE = [[isRedFruit, 'fruit'], [isOrange, 'fruit'], [isGreen, 'leaf'], IRON];

// cls: 'box' | 'round' | 'organic' | 'flora'   base: look key   max: triangle budget   crease: degrees
// ground: sits on the ground (ground plane occludes, contact gradient)   rules: colour rules   sat/pull: colour tweaks
const RECIPES = {
  // crates, boxes, furniture (box)
  prop_crate_metal: { cls: 'box', base: 'wood', rules: [IRON], max: 4000 },
  prop_crate_big: { cls: 'box', base: 'wood', rules: [IRON], max: 2400 },
  prop_crate_apples: { cls: 'box', base: 'wood', rules: FOOD_IN_CRATE, max: 4000 },
  prop_crate_carrots: { cls: 'box', base: 'wood', rules: FOOD_IN_CRATE, max: 6000 },
  prop_crate_large: { cls: 'box', base: 'metal', rules: [[(h) => h.s > 0.25 && h.h > 0.03 && h.h < 0.14, 'wood']], max: 4000 },
  prop_planks_stack: { cls: 'box', base: 'wood', rules: [IRON], max: 2400 },
  prop_plank_a: { cls: 'box', base: 'wood', max: 600 },
  prop_ladder: { cls: 'box', base: 'wood', max: 1400 },
  prop_bench: { cls: 'box', base: 'wood', rules: [IRON], max: 2400 },
  prop_stool: { cls: 'box', base: 'wood', rules: [IRON], max: 1800 },
  prop_table_low: { cls: 'box', base: 'wood', rules: [IRON], max: 2000 },
  prop_cart: { cls: 'box', base: 'wood', rules: [IRON, [(h) => h.s < 0.2 && h.l > 0.45, 'cloth']], max: 6000, crease: 40 },
  prop_wheelbarrow: { cls: 'box', base: 'wood', rules: [IRON], max: 2400 },
  prop_book_stack: { cls: 'box', base: 'cloth', rules: [[(h) => h.l > 0.75, 'paper'], [(h) => h.h > 0.1 && h.h < 0.17 && h.s > 0.45, 'metal']], max: 1800 },
  prop_book_big: { cls: 'box', base: 'cloth', rules: [[(h) => h.l > 0.72, 'paper'], [(h) => h.h > 0.1 && h.h < 0.17 && h.s > 0.4, 'metal'], IRON], max: 2400 },
  prop_andon: { cls: 'box', base: 'wood', rules: [[(h) => h.l > 0.7, 'paper']], max: 2400 },
  // round things
  prop_barrel_small: { cls: 'round', base: 'wood', rules: [IRON], max: 3400, crease: 55 },
  prop_barrel_large: { cls: 'round', base: 'wood', rules: [IRON], max: 3400, crease: 55 },
  prop_barrel_fish: { cls: 'round', base: 'wood', rules: [IRON, [(h) => h.h > 0.5 && h.h < 0.7, 'fruit']], max: 4400, crease: 55 },
  prop_barrel_apples: { cls: 'round', base: 'wood', rules: FOOD_IN_CRATE, max: 4400, crease: 55 },
  prop_bucket_wood: { cls: 'round', base: 'wood', rules: [IRON], max: 3200, crease: 55 },
  prop_pot_clay: { cls: 'round', base: 'clay', max: 2400, crease: 80 },
  prop_vase_a: { cls: 'round', base: 'glaze', max: 2600, crease: 80 },
  prop_jar_a: { cls: 'round', base: 'clay', rules: [[(h) => h.s < 0.25 && h.l > 0.55, 'glaze']], max: 2600, crease: 80 },
  prop_jar_c: { cls: 'round', base: 'clay', rules: [[(h) => h.s < 0.25 && h.l > 0.55, 'glaze']], max: 2600, crease: 80 },
  prop_bottle_green: { cls: 'round', base: 'glass', rules: [[(h) => h.h > 0.04 && h.h < 0.14 && h.s > 0.3, 'wood']], max: 2000, crease: 80 },
  prop_bottle_sake: { cls: 'round', base: 'glaze', max: 2000, crease: 80 },
  prop_apple_red: { cls: 'round', base: 'fruit', rules: [[(h) => h.h > 0.05 && h.h < 0.17 && h.l < 0.4, 'wood'], [isGreen, 'leaf']], max: 1400, crease: 85 },
  prop_pumpkin: { cls: 'round', base: 'fruit', rules: [[isGreen, 'leaf'], [(h) => h.l < 0.3, 'wood']], max: 2400, crease: 85 },
  prop_mushroom: { cls: 'round', base: 'food', max: 1500, crease: 85 },
  prop_dango: { cls: 'round', base: 'food', rules: [[(h) => h.s > 0.2 && h.h > 0.06 && h.h < 0.14 && h.l < 0.6, 'wood']], max: 2400, crease: 85 },
  prop_onigiri: { cls: 'round', base: 'food', max: 1900, crease: 70 },
  prop_scroll: { cls: 'round', base: 'paper', rules: [[(h) => h.l < 0.4, 'wood']], max: 2000, crease: 60 },
  // organic
  prop_tree_log: { cls: 'organic', base: 'bark', rules: [[(h) => h.l > 0.5, 'wood']], max: 1500, crease: 60 },
  prop_log_a: { cls: 'organic', base: 'bark', rules: [[(h) => h.l > 0.5, 'wood']], max: 3200, crease: 60 },
  prop_fish: { cls: 'organic', base: 'fruit', max: 2400, crease: 70, ground: false },
  prop_hay_sheaf: { cls: 'organic', base: 'straw', max: 2000, crease: 70 },
  prop_basket_berries: { cls: 'organic', base: 'straw', rules: [[(h) => (h.h < 0.05 || h.h > 0.6) && h.s > 0.3, 'fruit'], [isGreen, 'leaf']], max: 4400, crease: 60 },
  prop_basket_mushrooms: { cls: 'organic', base: 'straw', rules: [[(h) => (h.h < 0.04 || h.h > 0.9) && h.s > 0.4, 'food'], [isGreyLight, 'food']], max: 6000, crease: 60 },
  prop_bonfire: { cls: 'organic', base: 'bark', max: 2800, crease: 60, keep: /fire/i },
  prop_boulder_1: { src: 'rock_boulder_1', cls: 'organic', base: 'rock', max: 400, crease: 38 },
  prop_boulder_2: { src: 'rock_boulder_2', cls: 'organic', base: 'rock', max: 400, crease: 38 },
  prop_boulder_3: { src: 'rock_boulder_3', cls: 'organic', base: 'rock', max: 700, crease: 38 },
  // structures' asset models (bld_*): bake only (no subdivision, they are big)
  bld_boat_rowing: { cls: 'box', base: 'wood', max: 1800, crease: 40 },
  bld_fox_statue: { cls: 'organic', base: 'stone', max: 2200, crease: 50 },
  bld_pagoda_red: { cls: 'box', base: 'paint', rules: [[(h) => h.s < 0.2 && h.l < 0.5, 'stone'], [(h) => h.h > 0.08 && h.h < 0.16 && h.s > 0.5, 'metal']], max: 2400, crease: 40 },
  // flora-path models (G.flora reads material names + colours; only shading is baked)
  plant_pumpkin_1: { cls: 'flora', max: 3200, crease: 80 },
  plant_pumpkin_2: { cls: 'flora', max: 2600, crease: 80 },
  plant_mushroom_small_1: { cls: 'flora', max: 1800, crease: 80 },
  plant_mushroom_small_3: { cls: 'flora', max: 1800, crease: 80 },
  plant_lilypad_1: { cls: 'flora', max: 1400, crease: 70, ground: false },
  plant_lilypad_2: { cls: 'flora', max: 1100, crease: 70, ground: false },
  nat_log_moss_1: { cls: 'flora', max: 2600, crease: 60 },
  nat_log_1: { cls: 'flora', max: 2000, crease: 60 },
  nat_stump_1: { cls: 'flora', max: 2000, crease: 60 },
  nat_fallen_trunk_1: { cls: 'flora', max: 2600, crease: 55 },
  plant_lotus_1: { cls: 'flora', build: 'lotus', ground: false },
};

// ---- small math ----------------------------------------------------------------------------------------------------------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055);
function hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, s, l };
}
function fromHsl(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0]; };
function mat4mul(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }

// ---- 1-2. read + bake colour ----------------------------------------------------------------------------------------------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const imgCache = new Map();
async function decode(tex) {
  if (imgCache.has(tex)) return imgCache.get(tex);
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { data, w: info.width, h: info.height };
  imgCache.set(tex, img);
  return img;
}
function sample(img, u, v) {
  u = u - Math.floor(u); v = v - Math.floor(v);
  const x = Math.min(img.w - 1, Math.floor(u * img.w)), y = Math.min(img.h - 1, Math.floor(v * img.h));
  const o = (y * img.w + x) * 4;
  return [s2l(img.data[o] / 255), s2l(img.data[o + 1] / 255), s2l(img.data[o + 2] / 255)];
}
/** Triangle soup: { P: [[x,y,z]x3], C: [[r,g,b]x3] linear, mat: name, src: material } */
async function readSoup(file) {
  const doc = await io.read(file);
  const tris = [];
  const mats = new Map();
  for (const scene of doc.getRoot().listScenes()) {
    const nodes = [];
    scene.traverse((n) => nodes.push(n));
    for (const node of nodes) {
      const mesh = node.getMesh(); if (!mesh) continue;
      const M = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== 4) continue;
        const pos = prim.getAttribute('POSITION'); if (!pos) continue;
        const mat = prim.getMaterial();
        const name = mat?.getName() || 'mat';
        const bc = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1];
        const tex = mat?.getBaseColorTexture();
        const ti = mat?.getBaseColorTextureInfo();
        const img = tex ? await decode(tex) : null;
        const uv = img ? prim.getAttribute('TEXCOORD_' + (ti?.getTexCoord() || 0)) : null;
        const tt = ti?.getExtension?.('KHR_texture_transform');
        const off = tt ? tt.getOffset() : [0, 0], sc = tt ? tt.getScale() : [1, 1];
        const col = prim.getAttribute('COLOR_0');
        if (!mats.has(name)) mats.set(name, { name, color: bc.slice(0, 3), emissive: mat ? mat.getEmissiveFactor() : [0, 0, 0], doubleSided: !!mat?.getDoubleSided(), alpha: mat?.getAlphaMode() || 'OPAQUE', hasVC: !!col });
        const idx = prim.getIndices();
        const n = idx ? idx.getCount() : pos.getCount();
        const get = (i) => (idx ? idx.getScalar(i) : i);
        const tmp = [];
        for (let t = 0; t + 2 < n; t += 3) {
          const vi = [get(t), get(t + 1), get(t + 2)];
          const P = vi.map((i) => mat4mul(M, pos.getElement(i, tmp).slice(0, 3)));
          const C = vi.map((i) => {
            const c = col ? col.getElement(i, tmp).slice(0, 3) : [1, 1, 1];
            return [c[0] * bc[0], c[1] * bc[1], c[2] * bc[2]];
          });
          if (img && uv) {
            const U = vi.map((i) => { const a = uv.getElement(i, tmp); return [a[0] * sc[0] + off[0], a[1] * sc[1] + off[1]]; });
            const cu = (U[0][0] + U[1][0] + U[2][0]) / 3, cv = (U[0][1] + U[1][1] + U[2][1]) / 3;
            const cs = sample(img, cu, cv);
            for (let k = 0; k < 3; k++) {
              // pull corner samples 70% of the way to the centre: atlas palettes give flat colours, painted maps keep a gradient
              const s = sample(img, U[k][0] * 0.3 + cu * 0.7, U[k][1] * 0.3 + cv * 0.7);
              for (let j = 0; j < 3; j++) C[k][j] *= s[j] * 0.6 + cs[j] * 0.4;
            }
          }
          const e = cross(sub(P[1], P[0]), sub(P[2], P[0]));
          if (len(e) < 1e-14) continue;
          tris.push({ P, C, mat: name });
        }
      }
    }
  }
  return { tris, mats };
}

// ---- 4. weld + topology ----------------------------------------------------------------------------------------------------
function weld(tris, eps) {
  const map = new Map(), P = [], F = [];
  const key = (p) => Math.round(p[0] / eps) + ',' + Math.round(p[1] / eps) + ',' + Math.round(p[2] / eps);
  for (const t of tris) {
    const f = t.P.map((p) => { const k = key(p); let i = map.get(k); if (i === undefined) { i = P.length; P.push(p.slice()); map.set(k, i); } return i; });
    if (f[0] === f[1] || f[1] === f[2] || f[0] === f[2]) continue;
    F.push({ v: f, c: t.C.map((c) => c.slice()), g: t.g, mat: t.mat });
  }
  return { P, F };
}
function faceNormal(P, f) { return norm(cross(sub(P[f.v[1]], P[f.v[0]]), sub(P[f.v[2]], P[f.v[0]]))); }
function edgesOf(P, F, creaseDeg) {
  const E = new Map();
  const cosC = Math.cos((creaseDeg * Math.PI) / 180);
  F.forEach((f, fi) => {
    for (let k = 0; k < 3; k++) {
      const a = f.v[k], b = f.v[(k + 1) % 3];
      const key = a < b ? a + '_' + b : b + '_' + a;
      let e = E.get(key);
      if (!e) E.set(key, (e = { a: Math.min(a, b), b: Math.max(a, b), faces: [], crease: false }));
      e.faces.push(fi);
    }
  });
  for (const e of E.values()) {
    if (e.faces.length !== 2) { e.crease = true; continue; }
    const n0 = faceNormal(P, F[e.faces[0]]), n1 = faceNormal(P, F[e.faces[1]]);
    if (dot(n0, n1) < cosC) e.crease = true;
  }
  return E;
}

// ---- 5. subdivision ----------------------------------------------------------------------------------------------------------
/** One level of crease-aware Loop subdivision (smooth = false: linear 1-to-4 split, shape kept). */
function subdivide(mesh, creaseDeg, smoothOn) {
  const { P, F } = mesh;
  const E = edgesOf(P, F, creaseDeg);
  const nbr = P.map(() => []), creaseN = P.map(() => []);
  for (const e of E.values()) {
    nbr[e.a].push(e.b); nbr[e.b].push(e.a);
    if (e.crease) { creaseN[e.a].push(e.b); creaseN[e.b].push(e.a); }
  }
  const NP = P.map((p, i) => {
    if (!smoothOn) return p.slice();
    const cn = creaseN[i];
    if (cn.length === 2) return [0, 1, 2].map((j) => 0.75 * p[j] + 0.125 * (P[cn[0]][j] + P[cn[1]][j]));
    if (cn.length > 2) return p.slice();
    const n = nbr[i].length; if (n < 3) return p.slice();
    const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
    const s = [0, 0, 0];
    for (const q of nbr[i]) for (let j = 0; j < 3; j++) s[j] += P[q][j];
    return [0, 1, 2].map((j) => (1 - n * beta) * p[j] + beta * s[j]);
  });
  const mid = new Map();
  for (const [key, e] of E) {
    let p;
    const A = P[e.a], B = P[e.b];
    if (!smoothOn || e.crease) p = [0, 1, 2].map((j) => (A[j] + B[j]) / 2);
    else {
      const opp = e.faces.map((fi) => F[fi].v.find((v) => v !== e.a && v !== e.b));
      p = [0, 1, 2].map((j) => 0.375 * (A[j] + B[j]) + 0.125 * (P[opp[0]][j] + P[opp[1]][j]));
    }
    mid.set(key, NP.length); NP.push(p);
  }
  const ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
  const NF = [];
  const avg = (c0, c1) => [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2];
  for (const f of F) {
    const [a, b, c] = f.v, [ca, cb, cc] = f.c;
    const ab = mid.get(ek(a, b)), bc = mid.get(ek(b, c)), ca2 = mid.get(ek(c, a));
    const cab = avg(ca, cb), cbc = avg(cb, cc), cca = avg(cc, ca);
    const base = { g: f.g, mat: f.mat };
    NF.push({ ...base, v: [a, ab, ca2], c: [ca, cab, cca] }, { ...base, v: [ab, b, bc], c: [cab, cb, cbc] },
      { ...base, v: [ca2, bc, c], c: [cca, cbc, cc] }, { ...base, v: [ab, bc, ca2], c: [cab, cbc, cca] });
  }
  return { P: NP, F: NF };
}

// ---- 6. normals ----------------------------------------------------------------------------------------------------------------
/** Per face-corner normals: average of the (area-weighted) normals of faces at the same vertex within the crease angle. */
function cornerNormals(mesh, creaseDeg, softEdge = 0) {
  const { P, F } = mesh;
  const cosC = Math.cos((creaseDeg * Math.PI) / 180);
  const fn = F.map((f) => cross(sub(P[f.v[1]], P[f.v[0]]), sub(P[f.v[2]], P[f.v[0]])));
  const fu = fn.map(norm);
  const vf = P.map(() => []);
  F.forEach((f, fi) => f.v.forEach((v) => vf[v].push(fi)));
  return F.map((f, fi) => f.v.map((v) => {
    const s = [0, 0, 0], o = [0, 0, 0];
    let other = 0;
    for (const g of vf[v]) {
      const d = dot(fu[fi], fu[g]);
      if (d >= cosC) { s[0] += fn[g][0]; s[1] += fn[g][1]; s[2] += fn[g][2]; }
      else if (softEdge && d > -0.2) { o[0] += fu[g][0]; o[1] += fu[g][1]; o[2] += fu[g][2]; other++; }
    }
    let n = norm(s);
    // shading bevel: a corner sitting on a hard edge leans toward the neighbouring face
    if (other && softEdge) { const on = norm(o); n = norm([n[0] + on[0] * softEdge, n[1] + on[1] * softEdge, n[2] + on[2] * softEdge]); }
    return n;
  }));
}

// ---- 7. light bake -----------------------------------------------------------------------------------------------------------
function voxelAO(mesh, normals, { ground, res = 44, rays = 40 }) {
  const { P, F } = mesh;
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of P) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], p[j]); mx[j] = Math.max(mx[j], p[j]); }
  const size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const vs = size / res, pad = 3;
  const nx = Math.ceil((mx[0] - mn[0]) / vs) + pad * 2, ny = Math.ceil((mx[1] - mn[1]) / vs) + pad * 2, nz = Math.ceil((mx[2] - mn[2]) / vs) + pad * 2;
  const grid = new Uint8Array(nx * ny * nz);
  const vox = (p) => [Math.floor((p[0] - mn[0]) / vs) + pad, Math.floor((p[1] - mn[1]) / vs) + pad, Math.floor((p[2] - mn[2]) / vs) + pad];
  for (const f of F) {
    const A = P[f.v[0]], B = P[f.v[1]], C = P[f.v[2]];
    const n = Math.ceil(Math.max(len(sub(B, A)), len(sub(C, A)), len(sub(C, B))) / (vs * 0.5)) + 1;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      const q = vox([A[0] * w + B[0] * u + C[0] * v, A[1] * w + B[1] * u + C[1] * v, A[2] * w + B[2] * u + C[2] * v]);
      grid[(q[2] * ny + q[1]) * nx + q[0]] = 1;
    }
  }
  const solid = (x, y, z) => {
    if (ground && y < pad) return true;
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return false;
    return grid[(z * ny + y) * nx + x] === 1;
  };
  // fixed cosine-weighted directions (z-up local), rotated per normal
  const dirs = [];
  for (let i = 0; i < rays; i++) {
    const u = (i + 0.5) / rays, a = i * 2.39996323;
    const r = Math.sqrt(u);
    dirs.push([Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(1 - u)]);
  }
  const maxD = size * 0.42;
  const cache = new Map();
  return F.map((f, fi) => f.v.map((v, k) => {
    const n = normals[fi][k];
    const ck = v + ':' + n.map((x) => x.toFixed(2)).join(',');
    if (cache.has(ck)) return cache.get(ck);
    const t = Math.abs(n[1]) < 0.9 ? norm(cross([0, 1, 0], n)) : norm(cross([1, 0, 0], n));
    const b = cross(n, t);
    const o = [P[v][0] + n[0] * vs * 1.6, P[v][1] + n[1] * vs * 1.6, P[v][2] + n[2] * vs * 1.6];
    let occ = 0;
    for (const d0 of dirs) {
      const d = [t[0] * d0[0] + b[0] * d0[1] + n[0] * d0[2], t[1] * d0[0] + b[1] * d0[1] + n[1] * d0[2], t[2] * d0[0] + b[2] * d0[1] + n[2] * d0[2]];
      for (let s = vs * 0.6; s < maxD; s += vs * 0.6) {
        const q = vox([o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s]);
        if (solid(q[0], q[1], q[2])) { occ += 1 - (s / maxD) * 0.6; break; }
      }
    }
    const ao = 1 - occ / dirs.length;
    cache.set(ck, ao);
    return ao;
  }));
}
/** Mean-curvature-ish per vertex: + convex, - concave (scale free). */
function curvature(mesh) {
  const { P, F } = mesh;
  const vn = P.map(() => [0, 0, 0]);
  for (const f of F) { const n = cross(sub(P[f.v[1]], P[f.v[0]]), sub(P[f.v[2]], P[f.v[0]])); for (const v of f.v) for (let j = 0; j < 3; j++) vn[v][j] += n[j]; }
  const nb = P.map(() => new Set());
  for (const f of F) for (let k = 0; k < 3; k++) { nb[f.v[k]].add(f.v[(k + 1) % 3]); nb[f.v[k]].add(f.v[(k + 2) % 3]); }
  return P.map((p, i) => {
    const n = norm(vn[i]);
    let s = 0, c = 0;
    for (const q of nb[i]) { const d = sub(p, P[q]); const l = len(d); if (l > 1e-9) { s += dot(n, d) / l; c++; } }
    return c ? s / c : 0;
  });
}

// ---- 8. palette pull ---------------------------------------------------------------------------------------------------------
function pullColour(lin, amt = 0.22, satCap = 0.78) {
  let s = lin.map(l2s);
  let best = null, bd = 1e9;
  for (const q of PAL_RGB) { const d = (s[0] - q[0]) ** 2 + (s[1] - q[1]) ** 2 + (s[2] - q[2]) ** 2; if (d < bd) { bd = d; best = q; } }
  const k = amt * smooth(0.12, 0.0, Math.sqrt(bd) - 0.06) + amt * 0.35; // closer colours pull harder
  s = s.map((v, j) => v + (best[j] - v) * k);
  const h = hsl(s[0], s[1], s[2]);
  h.s = Math.min(h.s, satCap);
  h.l = 0.06 + h.l * 0.94; // no pitch black
  return fromHsl(h.h, h.s, h.l).map(s2l);
}

// ---- 9. procedural replacements --------------------------------------------------------------------------------------------
/** Painterly lotus: cupped petals in three rings around a seed pod, its own lily pad (flora material names). */
function buildLotus() {
  const tris = [];
  const put = (P, C, mat) => tris.push({ P, C, mat });
  const quad = (a, b, c, d, ca, cb, cc, cd, mat) => { put([a, b, c], [ca, cb, cc], mat); put([a, c, d], [ca, cc, cd], mat); };
  const petal = (yaw, tilt, L, W, y0, col0, col1) => {
    const segL = 5, segW = 4, pts = [];
    for (let i = 0; i <= segL; i++) {
      const t = i / segL, row = [];
      for (let j = 0; j <= segW; j++) {
        const s = j / segW - 0.5;
        const w = W * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.12)) * (1 - t * 0.35);
        const cup = (s * s) * W * 0.9;                // cupped across
        const r = L * t, up = r * Math.sin(tilt) + t * t * L * 0.35;
        const out = r * Math.cos(tilt) - t * t * L * 0.12;
        const lx = s * w, ly = y0 + up + cup, lz = out;
        const ca = Math.cos(yaw), sa = Math.sin(yaw);
        row.push([lx * ca + lz * sa, ly, -lx * sa + lz * ca]);
      }
      pts.push(row);
    }
    for (let i = 0; i < segL; i++) for (let j = 0; j < segW; j++) {
      const c = (t) => { const k = t ** 1.4; return [col0[0] + (col1[0] - col0[0]) * k, col0[1] + (col1[1] - col0[1]) * k, col0[2] + (col1[2] - col0[2]) * k]; };
      const t0 = i / segL, t1 = (i + 1) / segL;
      quad(pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1], c(t0), c(t1), c(t1), c(t0), 'petal');
    }
  };
  const base = [0.92, 0.92, 0.92], tipC = [1, 1, 1];
  const rings = [[8, 0.32, 0.3, 0.17, 0.0, 0.55], [7, 0.26, 0.6, 0.15, 0.02, 0.62], [6, 0.18, 0.95, 0.11, 0.05, 0.75]];
  rings.forEach(([n, L, tilt, W, y0, shade], ri) => {
    for (let i = 0; i < n; i++) petal((i / n) * Math.PI * 2 + ri * 0.4, tilt, L, W, y0 + 0.02, base.map((v) => v * shade), tipC);
  });
  // seed pod
  const pod = [1, 0.85, 0.45], podTop = [0.95, 0.78, 0.35];
  const R = 0.06, H = 0.09, seg = 10;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    quad(p(a0, R * 0.6, 0.03), p(a0, R, H), p(a1, R, H), p(a1, R * 0.6, 0.03), pod, podTop, podTop, pod, 'center');
    put([p(a0, R, H), [0, H + 0.01, 0], p(a1, R, H)], [podTop, podTop, podTop], 'center');
  }
  // pad (a notched disc, slightly domed, under the flower)
  const PR = 0.42, ps = 22, g0 = [0.95, 0.95, 0.95], g1 = [0.78, 0.8, 0.78];
  for (let i = 0; i < ps; i++) {
    const a0 = (i / ps) * Math.PI * 2 + 0.25, a1 = ((i + 1) / ps) * Math.PI * 2 + 0.25;
    const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    put([[0, 0.012, 0], p(a1, PR, 0), p(a0, PR, 0)], [g1, g0, g0], 'pad');
    put([p(a0, PR, 0), p(a1, PR, 0), p(a1, PR, -0.012)], [g0, g0, g1], 'pad');
  }
  const mats = new Map([
    ['petal', { name: 'petal', color: [1, 1, 1], emissive: [0, 0, 0], doubleSided: true, alpha: 'OPAQUE', hasVC: true }],
    ['center', { name: 'center', color: [1, 0.72, 0.25], emissive: [0, 0, 0], doubleSided: false, alpha: 'OPAQUE', hasVC: true }],
    ['pad', { name: 'pad', color: [0.16, 0.38, 0.14], emissive: [0, 0, 0], doubleSided: true, alpha: 'OPAQUE', hasVC: true }],
  ]);
  return { tris, mats };
}

// ---- write -----------------------------------------------------------------------------------------------------------------------
async function writeGLB(file, groups) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const mesh = doc.createMesh('refined');
  for (const g of groups) {
    const m = doc.createMaterial(g.name).setBaseColorFactor([...g.color, 1]).setRoughnessFactor(0.9).setMetallicFactor(0)
      .setDoubleSided(!!g.doubleSided).setEmissiveFactor(g.emissive || [0, 0, 0]);
    m.setExtras(g.extras || {});
    const prim = doc.createPrimitive().setMaterial(m)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(g.pos).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(g.nor).setBuffer(buf))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(g.col).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(g.idx).setBuffer(buf));
    mesh.addPrimitive(prim);
  }
  const node = doc.createNode('refined').setMesh(mesh);
  doc.createScene('scene').addChild(node);
  await io.write(file, doc);
}

// ---- main -----------------------------------------------------------------------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
if (args.includes('--list')) { for (const [id, r] of Object.entries(RECIPES)) console.log(id.padEnd(26), r.cls.padEnd(8), r.base || '-', r.max || ''); process.exit(0); }
fs.mkdirSync(path.join(ROOT, 'assets', OUT_DIR), { recursive: true });
const fragment = {};
const report = [];
for (const [id, R] of Object.entries(RECIPES)) {
  if (only.length && !only.includes(id)) continue;
  const t0 = Date.now();
  const srcId = R.src || id;
  const entry = manifest[srcId];
  if (!entry && !R.build) { console.warn('skip (no manifest entry)', id); continue; }
  const origFile = entry ? (entry.orig || entry.file) : null;
  const soup = R.build === 'lotus' ? buildLotus() : await readSoup(path.join(ROOT, 'assets', origFile));
  const flora = R.cls === 'flora';
  const ground = R.ground !== false;
  // 3. surface group per triangle
  for (const t of soup.tris) {
    if (flora || (R.keep && R.keep.test(t.mat))) { t.g = 'keep'; continue; }
    const c = [0, 1, 2].map((j) => l2s((t.C[0][j] + t.C[1][j] + t.C[2][j]) / 3));
    const h = hsl(c[0], c[1], c[2]);
    let g = R.base;
    for (const [test, look] of R.rules || []) if (test(h, c)) { g = look; break; }
    t.g = g;
  }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const t of soup.tris) for (const p of t.P) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], p[j]); mx[j] = Math.max(mx[j], p[j]); }
  const size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  const H = mx[1] - mn[1];
  let mesh = weld(soup.tris, size * 2e-4);
  const crease = R.crease ?? (R.cls === 'box' ? 30 : 70);
  const tris0 = mesh.F.length;
  // 5. subdivision within the triangle budget
  const max = R.max || 2400;
  let levels = 0;
  while (mesh.F.length * 4 <= max && levels < 2) {
    mesh = subdivide(mesh, R.cls === 'box' ? crease : crease, R.cls !== 'box');
    levels++;
  }
  // keep the original bounding box (Loop shrinks convex shapes; colliders are derived from the visual's box)
  if (levels && R.cls !== 'box') {
    const a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
    for (const p of mesh.P) for (let j = 0; j < 3; j++) { a[j] = Math.min(a[j], p[j]); b[j] = Math.max(b[j], p[j]); }
    const k = [0, 1, 2].map((j) => (b[j] - a[j] > 1e-6 ? (mx[j] - mn[j]) / (b[j] - a[j]) : 1));
    for (const p of mesh.P) for (let j = 0; j < 3; j++) p[j] = mn[j] + (p[j] - a[j]) * k[j];
  }
  // 6. normals
  const softEdge = R.cls === 'box' ? 0.55 : 0;
  const normals = cornerNormals(mesh, R.cls === 'box' ? crease : crease, softEdge);
  // 7. light bake
  const ao = voxelAO(mesh, normals, { ground });
  const curv = curvature(mesh);
  const out = new Map();
  mesh.F.forEach((f, fi) => {
    const srcMat = soup.mats.get(f.mat) || { name: f.mat, color: [1, 1, 1], emissive: [0, 0, 0] };
    const gkey = flora || f.g === 'keep' ? f.mat : f.mat + '|' + f.g;
    let G = out.get(gkey);
    if (!G) {
      const lk = LOOKS[f.g];
      out.set(gkey, (G = {
        name: flora || f.g === 'keep' ? srcMat.name : (soup.mats.size > 1 ? srcMat.name + '_' : '') + f.g,
        color: flora || f.g === 'keep' ? srcMat.color : [1, 1, 1],
        emissive: srcMat.emissive, doubleSided: srcMat.doubleSided,
        extras: lk ? { surface: lk.surface, look: lk.look } : {},
        verts: [], map: new Map(), idx: [],
      }));
    }
    for (let k = 0; k < 3; k++) {
      const v = f.v[k], p = mesh.P[v], n = normals[fi][k];
      const hgt = (p[1] - mn[1]) / (H || 1);
      // shading: AO (soft), ground contact, curvature (worn convex edges, dark cavities)
      const a = ao[fi][k];
      let shade = 0.38 + 0.62 * Math.pow(a, 0.9);
      if (ground) shade *= 0.74 + 0.26 * smooth(0, 0.22, hgt);
      shade *= 0.97 + 0.08 * hgt;
      const kc = clamp(curv[v] * 3.2, -1, 1);
      shade *= kc > 0 ? 1 + 0.16 * kc : 1 + 0.2 * kc;
      let c;
      if (flora || f.g === 'keep') { c = f.c[k].map((x, j) => (x / Math.max(1e-3, srcMat.color[j])) * shade); }
      else {
        c = pullColour(f.c[k]);
        // worn edges: convex edges catch a light, slightly desaturated rim
        if (kc > 0.25) { const w = (kc - 0.25) * 0.35; c = c.map((x) => x + (Math.max(...c) - x) * w * 0.5 + w * 0.06); }
        c = c.map((x) => x * shade);
      }
      const key = v + '|' + n.map((x) => x.toFixed(3)).join(',') + '|' + c.map((x) => x.toFixed(3)).join(',');
      let i = G.map.get(key);
      if (i === undefined) { i = G.verts.length; G.verts.push([p, n, c]); G.map.set(key, i); }
      G.idx.push(i);
    }
  });
  const groups = [...out.values()].map((G) => {
    const n = G.verts.length;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    G.verts.forEach(([p, nn, c], i) => { pos.set(p, i * 3); nor.set(nn, i * 3); col.set(c.map((x) => clamp(x, 0, 1)), i * 3); });
    return { ...G, pos, nor, col, idx: n > 65535 ? new Uint32Array(G.idx) : new Uint16Array(G.idx) };
  });
  const rel = `${OUT_DIR}/${id}.glb`;
  await writeGLB(path.join(ROOT, 'assets', rel), groups);
  const tris = groups.reduce((s, g) => s + g.idx.length / 3, 0);
  const mats = {};
  for (const g of groups) if (g.extras.surface) mats[g.name] = { surface: g.extras.surface, look: g.extras.look };
  const base = entry ? { ...entry } : {};
  if (R.src || R.build && !entry) {
    // new id (prop_boulder_*): copy the licence / source of the original
    fragment[id] = { file: rel, type: 'model', license: base.license || 'CC0', author: base.author || 'Moonveil Miko (original procedural)', source: base.source || 'original', scale: base.scale ?? 1, refined: 2, from: srcId, mats, tris };
  } else {
    fragment[id] = { file: rel, orig: origFile || undefined, refined: 2, mats, tris };
    if (R.build) { fragment[id].source = 'original'; fragment[id].author = 'Moonveil Miko (original procedural, tools/refine-models.mjs)'; fragment[id].license = 'CC0'; }
  }
  report.push(`${id.padEnd(24)} ${R.cls.padEnd(8)} tris ${String(tris0).padStart(5)} -> ${String(tris).padStart(5)} (L${levels}) groups ${groups.map((g) => g.name).join(',')}  ${Date.now() - t0} ms`);
  console.log(report[report.length - 1]);
}
if (WRITE_MANIFEST && Object.keys(fragment).length) {
  const fragFile = path.join(ROOT, '.tmp', 'refine-fragment.json');
  fs.mkdirSync(path.dirname(fragFile), { recursive: true });
  fs.writeFileSync(fragFile, JSON.stringify(fragment, null, 1));
  execFileSync(process.execPath, [path.join(ROOT, 'tools/manifest-patch.mjs'), fragFile], { stdio: 'inherit' });
  fs.unlinkSync(fragFile);
}
