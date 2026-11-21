// Shared palette + material factories. Every model in the game is built from primitives and these materials,
// so the whole world keeps one painterly, soft-toon look. Materials are cached: same arguments -> same instance.
import * as THREE from 'three';

/** Palette (sRGB hex). Use these names instead of inventing new colours where one fits. */
export const PAL = {
  // 巫女
  mikoWhite: 0xfbf6ec, mikoRed: 0xd8362c, mikoRedDark: 0xa9241f, hair: 0x2b2238, hairShine: 0x4a3d63, skin: 0xffe3cf, blush: 0xff9d8f,
  ribbon: 0xe8413a, gold: 0xffd27a, paper: 0xfff8e6, straw: 0xd9b46a, strawDark: 0xa98444,
  // 建筑
  vermilion: 0xe24a2e, vermilionDark: 0xb5351f, wood: 0x8b5a3c, woodDark: 0x5b3a29, woodLight: 0xc49a6c, plaster: 0xf2e9d8,
  roofTile: 0x3c4a5c, roofTileDusk: 0x4a3a52, roofTileNight: 0x232a44, thatch: 0xc8a86a, stone: 0xa29e96, stoneDark: 0x6b6862, moss: 0x6f8f54,
  // 曦光原
  grassSun: 0x8ccf5a, grassSunDark: 0x5fae48, leafSun: 0x6fbf4f, leafSunLight: 0xa6dd6a, sunflower: 0xffc928, sakura: 0xffc1d6, sand: 0xf0dfae, dirt: 0xb99468,
  // 薄暮林
  grassDusk: 0xb9a24e, grassDuskDark: 0x8d7a3e, maple: 0xe5632b, mapleDeep: 0xc23a25, ginkgo: 0xf2b632, duskTrunk: 0x4d3530,
  // 常夜原
  grassNight: 0x1f3550, grassNightDark: 0x142338, leafNight: 0x1d4a5e, glowCyan: 0x6ff3ff, glowTeal: 0x3de0c0, glowViolet: 0xb48cff, glowPink: 0xff8fd8,
  crystal: 0x9fd8ff, crystalDeep: 0x5a7dff, nightTrunk: 0x2a2440,
  // 灯火
  lanternWarm: 0xffb155, lanternHot: 0xffe2a8, moonGold: 0xffd98a, moonPale: 0xdfe9ff,
  // 影祟
  shade: 0x1a1030, shadeDeep: 0x0b0718, shadeEye: 0xff3b6b, shadeGlow: 0x8a3cff,
  // 水
  water: 0x4fb6d8, waterDusk: 0x9a6a8c, waterNight: 0x16335a,
  snow: 0xf4f8ff, rock: 0x8a8791, rockDark: 0x55525f,
};

let _grad = null;
/** 4-step toon ramp shared by all toon materials. */
export function toonGradient() {
  if (_grad) return _grad;
  const data = new Uint8Array([70, 135, 205, 255]);
  _grad = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
  _grad.generateMipmaps = false;
  _grad.needsUpdate = true;
  return _grad;
}

const cache = new Map();
const hooks = [];
const hooked = new Set();
/**
 * Register a function that is applied to every LIT material of the game — those made by toon()/flat() (past and future)
 * and those passed to hookMaterial(). The sky system uses this to add Veil shading (the land far away under the Moon is
 * dark even when you stand in sunlight) and its shadow set-up. fn(material) must be idempotent.
 */
export function addMaterialHook(fn) {
  hooks.push(fn);
  for (const m of hooked) { fn(m); m.needsUpdate = true; }
}
/**
 * Run the material hooks on a lit material you created yourself (custom terrain shader, instanced foliage, water…).
 * ALWAYS call this for hand-made materials that should respond to the Veil; safe before any hook exists (remembered).
 * Not for glow / unlit materials. Returns the material.
 */
export function hookMaterial(m) {
  if (hooked.has(m)) return m;
  hooked.add(m);
  for (const fn of hooks) fn(m);
  return m;
}
function cached(kind, color, opts, make) {
  const k = kind + ':' + color + ':' + (opts ? JSON.stringify(opts) : '');
  let m = cache.get(k);
  if (!m) { m = make(); m.userData.shared = true; cache.set(k, m); if (kind !== 'glow') hookMaterial(m); }
  return m;
}

// ---- surface detail (render/surfaces.js, docs/api/look.md) -------------------------------------------------------
// material.userData.surface = 'paint' | 'wood' | 'plaster' | 'stone' | 'rock' | 'thatch' | 'tile' | 'cloth' | 'paper' |
// 'metal' | 'earth' | 'bark' | 'none'; material.userData.look = { rim, spec, specPower, wrap, shadowTint, trans, detail,
// bump, fine, scale, band }. toon()/flat() take them as options: toon(PAL.wood, { surface: 'wood', look: { spec: 0.2 } }).
// Without an explicit surface, a guess is made from the palette colour (wood colours -> wood, thatch -> thatch…).
const _guess = new Map();
const g = (kind, look, ...names) => { for (const n of names) _guess.set(PAL[n], { surface: kind, look }); };
const CHAR = { rim: 0.6, wrap: 0.5, shadowTint: 0.35 };
g('wood', null, 'wood', 'woodDark', 'woodLight');
g('bark', null, 'duskTrunk', 'nightTrunk');
g('paint', { spec: 0.15, specPower: 30 }, 'vermilion', 'vermilionDark');
g('plaster', null, 'plaster');
g('paper', { trans: 0.35, rim: 0.15 }, 'paper');
g('thatch', null, 'thatch', 'straw', 'strawDark');
g('tile', { spec: 0.25, specPower: 40 }, 'roofTile', 'roofTileDusk', 'roofTileNight');
g('stone', null, 'stone', 'stoneDark');
g('rock', null, 'rock', 'rockDark', 'snow');
g('earth', null, 'dirt', 'sand');
g('metal', { spec: 0.6, specPower: 48, rim: 0.4 }, 'gold');
g('none', CHAR, 'skin', 'blush', 'hair', 'hairShine');
g('cloth', { ...CHAR, detail: 0.5 }, 'mikoWhite', 'mikoRed', 'mikoRedDark', 'ribbon');
g('none', { rim: 0.5 }, 'shade', 'shadeDeep');
g('none', { spec: 0.5, specPower: 60, rim: 0.5 }, 'crystal', 'crystalDeep');
g(null, { trans: 0.4 }, 'leafSun', 'leafSunLight', 'maple', 'mapleDeep', 'ginkgo', 'leafNight', 'sakura');
// nearest palette entry (sRGB distance <= 34) for colours that are not exactly a PAL value (0xb8995c ~ thatch)
const _gl = [..._guess.entries()];
function nearGuess(hex) {
  let best = null, bd = 34 * 34;
  const r = (hex >> 16) & 255, g2 = (hex >> 8) & 255, b = hex & 255;
  for (const [h, v] of _gl) {
    const dr = r - ((h >> 16) & 255), dg = g2 - ((h >> 8) & 255), db = b - (h & 255), d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
function splitLook(color, opts, flatShaded) {
  let surface, look, rest = opts;
  if (opts && ('surface' in opts || 'look' in opts)) { ({ surface, look, ...rest } = opts); }
  const gs = typeof color === 'number' ? (_guess.get(color) || nearGuess(color)) : null;
  if (surface === undefined && gs?.surface) surface = gs.surface;
  if (surface === undefined && flatShaded && typeof color === 'number') {
    // faceted grey-ish primitives are mostly rocks / cliffs
    const c = new THREE.Color(color); const hsl = {}; c.getHSL(hsl);
    if (hsl.s < 0.18) surface = 'rock';
  }
  if (gs?.look) look = { ...gs.look, ...(look || {}) };
  return { surface, look, rest };
}
function tag(m, surface, look) {
  if (surface !== undefined && surface !== null) m.userData.surface = surface;
  if (look) m.userData.look = look;
  return m;
}

/**
 * Soft cel-shaded surface. The default for characters, props and buildings. opts: any MeshToonMaterial params, plus
 * `surface` (detail kind, see docs/api/look.md) and `look` (lighting knobs).
 */
export function toon(color, opts) {
  return cached('toon', color, opts, () => {
    const { surface, look, rest } = splitLook(color, opts, false);
    return tag(new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...rest }), surface, look);
  });
}
/** Faceted low-poly surface (rocks, cliffs, crystals, roofs). opts: any MeshLambertMaterial params + `surface`, `look`. */
export function flat(color, opts) {
  return cached('flat', color, opts, () => {
    const { surface, look, rest } = splitLook(color, opts, true);
    return tag(new THREE.MeshLambertMaterial({ color, flatShading: true, ...rest }), surface, look);
  });
}
/**
 * Self-lit surface that blooms (lantern paper, glowing caps, eyes, magic). `strength` > 1 pushes it over the bloom
 * threshold; 1.6 = gentle glow, 3 = bright, 6 = dazzling. Unaffected by scene lighting and fog-aware.
 */
export function glow(color, strength = 2, opts) {
  return cached('glow', color, { strength, ...opts }, () => {
    const m = new THREE.MeshBasicMaterial({ color, ...opts });
    m.color.multiplyScalar(strength);
    m.toneMapped = false;
    return m;
  });
}
/** Un-cached copy of a shared material, for when you need to animate colour/opacity on one object only. */
export function own(material) {
  const m = material.clone(); m.userData.shared = false;
  if (!material.isMeshBasicMaterial) hookMaterial(m);
  return m;
}

/** A fresh (non-shared) glow material whose brightness you intend to animate: m.userData.setGlow(k) with k in 0..1+. */
export function glowDynamic(color, strength = 2, opts) {
  const base = new THREE.Color(color);
  const m = new THREE.MeshBasicMaterial({ color, ...opts });
  m.toneMapped = false;
  m.userData.glowAtFullStrength = base.clone().multiplyScalar(strength).toArray();
  m.userData.setGlow = (k) => { m.color.copy(base).multiplyScalar(Math.max(0.02, strength * k)); };
  m.userData.setGlow(1);
  return m;
}
