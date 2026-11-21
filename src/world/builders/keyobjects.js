// The story's key objects (architecture round 2): the lightable stone lantern (tōrō), the Great Lantern (镇灯) and the
// treasure chest. Soft-edged builders from src/props/shapes.js; static parts baked per material, the animated parts
// (paper, flame, lid, glow) stay live. Return shapes / public fields are exactly those of the old factories.
import * as THREE from 'three';
import { PAL, glowDynamic } from '../../core/mats.js';
import { box, cyl, cone, sphere, bakeStatic } from '../../core/geo.js';
import { TAU } from '../../core/util.js';
import { lathe, rcyl, rbox, ring, tube, chip, M as SM } from '../../props/shapes.js';
import { M, mat, makeRoof, texMat } from './kit.js';
import { G } from '../../core/game.js';
import { sculptOn, sculptGroup, noteSite, sculptAsset, heroGeometry, heroMaterial, rgbOf, addLodSet, liftFor } from './sculpt.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../../core/mats.js';

// flat-faceted copy of a (cached) lathe geometry: hex stone reads as cut stone, not as a soft cylinder
const _facet = new Map();
function facet(mesh) {
  let g = _facet.get(mesh.geometry);
  if (!g) { g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); g.computeVertexNormals(); _facet.set(mesh.geometry, g); }
  mesh.geometry = g;
  return mesh;
}
const hexAt = (k, r) => { const a = (k / 6) * TAU; return [Math.sin(a) * r, Math.cos(a) * r, a]; };   // lathe corner k
// a broken-off corner on a (faceted) stone part, cached per key (every lantern shares the same chipped copy)
const _chips = new Map();
function chipped(mesh, key, k, r, y, depth = 0.05, size = 0.1) {
  const g = _chips.get(key);
  if (g) { mesh.geometry = g; return mesh; }
  const [x, z] = hexAt(k, r), l = Math.hypot(x, z);
  chip(mesh, [x - (x / l) * depth, y, z - (z / l) * depth], [x / l, 0.9, z / l], size);
  _chips.set(key, mesh.geometry);
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------
/** Stone lantern (Kasuga tōrō) ~2.65 m, firePos y 1.73. Hex lathe base with lotus petals, round pole with a ring,
 *  flared platform, a real fire box (corner posts, lintel, paper windows on three sides, open lattice on the others,
 *  a flame inside), curved hex roof with curled tips, jewel. Live: paper + flame (fade with setLit). */
let _mossCap = null;
export function makeStoneLantern({ moss = true } = {}) {
  if (sculptOn('stone_lantern')) {
    try { const h = sculptStoneLantern(moss); if (h) { noteSite('stone_lantern', 'sculpt', h.group); return h; } } catch (e) { G.reportError?.('sculpt:stone_lantern', e); }
  }
  const h = oldStoneLantern(moss);
  noteSite('stone_lantern', 'old', h.group);
  return h;
}
/**
 * The sculpted stone lantern (tools/sculpt/README.md §7): the stone is assets/models/sculpt/stone_lantern.glb (LOD1 vertex
 * colours here, LOD0 near through builders/sculpt.js); paper panels on faces k = 0, 2, 4 and the flame stay live with the
 * same fader / setLit / flicker, height and firePos. The three lattice-bar faces are now carved moon openings.
 * moss = false: the moss is coloured but folded into the stone material (no moss draw where a site has none).
 */
function sculptStoneLantern(moss) {
  const s = sculptGroup('sculpt_stone_lantern', 1, (n) => (/^Moss/.test(n) ? (moss ? M.moss() : null) : M.carved()), { type: 'stone_lantern' });
  if (!s) return null;
  const g = new THREE.Group();
  const paperMat = glowDynamic(PAL.lanternWarm, 2.8);
  const live = [];
  for (let k = 0; k < 6; k += 2) {
    const a = ((k + 0.5) / 6) * TAU, cx = Math.sin(a) * 0.268, cz = Math.cos(a) * 0.268;
    const p = box(0.26, 0.34, 0.012, paperMat, cx, 1.74, cz); p.rotation.y = a; p.castShadow = false; g.add(p); live.push(p);
  }
  const flameMat = glowDynamic(PAL.lanternHot, 4);
  const flame = new THREE.Group();
  const f1 = sphere(0.055, flameMat, 0, 1.66, 0, 8, 6); f1.scale.set(1, 1.5, 1);
  const f2 = cone(0.04, 0.14, flameMat, 0, 1.76, 0, 8);
  flame.add(f1, f2); flame.traverse((o) => { o.castShadow = false; o.userData.flame = true; });
  g.add(flame); live.push(flame);
  const group = bakeWith(g, live);
  // the stone as direct (non-dynamic) children: the structures stand-in swaps exactly these beyond 100 m
  for (const m of [...s.children]) group.add(m);
  group.userData.sculpt = s.userData.sculpt;
  group.name = 'stoneLantern';
  const set = fader((v) => { paperMat.userData.setGlow(0.07 + 0.93 * v); flameMat.userData.setGlow(v); flame.visible = v > 0.03; }, 3);
  let ft = 0;
  const h = { group, lit: false, height: 2.65, firePos: new THREE.Vector3(0, 1.73, 0),
    setLit(on, instant = false) { h.lit = !!on; set(on ? 1 : 0, instant); } };
  f1.onBeforeRender = () => { if (!h.lit) return; ft += 0.016; const sc = 1 + 0.12 * Math.sin(ft * 13.1) * Math.sin(ft * 7.3); flame.scale.set(1, sc, 1); };
  h.setLit(false, true);
  return h;
}
function oldStoneLantern(moss) {
  const g = new THREE.Group();
  // carved = smooth-shaded granite: the round pole and petals read as turned stone; the hex parts keep flat facets
  const st = M.carved(), sd = M.stoneDark(), sl = M.carved();
  g.add(chipped(facet(lathe([[0, 0], [0.56, 0], [0.57, 0.1], [0.52, 0.16], [0.46, 0.2], [0.45, 0.26], [0.38, 0.3], [0, 0.3]], sd, 0, 0, 0, 6)), 'base', 1, 0.52, 0.2, 0.05, 0.12));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const p = sphere(0.1, sl, Math.sin(a) * 0.33, 0.33, Math.cos(a) * 0.33, 8, 5); p.scale.set(1.1, 0.5, 0.7); p.rotation.y = a + Math.PI / 2; g.add(p); }
  g.add(lathe([[0.17, 0.3], [0.16, 0.42], [0.145, 0.74], [0.19, 0.77], [0.19, 0.85], [0.15, 0.88], [0.135, 1.18], [0.17, 1.23], [0, 1.23]], st, 0, 0, 0, 16));
  g.add(chipped(facet(lathe([[0.16, 1.22], [0.24, 1.27], [0.36, 1.34], [0.42, 1.38], [0.42, 1.46], [0.36, 1.5], [0, 1.5]], st, 0, 0, 0, 6)), 'plat', 4, 0.42, 1.47, 0.04, 0.09));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; const p = sphere(0.09, sl, Math.sin(a) * 0.3, 1.29, Math.cos(a) * 0.3, 8, 5); p.scale.set(1.2, 0.5, 0.7); p.rotation.y = a + Math.PI / 2; g.add(p); }
  // fire box: sill, six posts, lintel; paper windows on 3 faces (front / back-left / back-right), open lattice on 3
  g.add(facet(lathe([[0.36, 1.5], [0.37, 1.53], [0.33, 1.55], [0, 1.55]], sd, 0, 0, 0, 6)));
  for (let k = 0; k < 6; k++) { const [x, z, a] = hexAt(k, 0.31); const p = rbox(0.08, 0.38, 0.08, st, x, 1.74, z, 0.015, 1); p.rotation.y = a; g.add(p); }
  g.add(facet(lathe([[0, 1.92], [0.35, 1.92], [0.37, 1.95], [0.36, 1.99], [0, 1.99]], sd, 0, 0, 0, 6)));
  const paperMat = glowDynamic(PAL.lanternWarm, 2.8);
  const live = [];
  for (let k = 0; k < 6; k++) {
    const a = ((k + 0.5) / 6) * TAU, cx = Math.sin(a) * 0.268, cz = Math.cos(a) * 0.268;
    if (k % 2 === 0) {
      const p = box(0.26, 0.34, 0.012, paperMat, cx, 1.74, cz); p.rotation.y = a; p.castShadow = false; g.add(p); live.push(p);
      const fr = rbox(0.24, 0.022, 0.03, sd, cx * 1.06, 1.74, cz * 1.06, 0.008, 1); fr.rotation.y = a; g.add(fr);   // lattice bar
    } else {
      for (const dy of [-0.09, 0.09]) { const b = rbox(0.24, 0.02, 0.03, st, cx * 1.08, 1.74 + dy, cz * 1.08, 0.008, 1); b.rotation.y = a; g.add(b); }
    }
  }
  // flame: soft core + licking tongue on a small dish
  g.add(rcyl(0.09, 0.06, 0.05, sd, 0, 1.585, 0, 10));
  const flameMat = glowDynamic(PAL.lanternHot, 4);
  const flame = new THREE.Group();
  const f1 = sphere(0.055, flameMat, 0, 1.66, 0, 8, 6); f1.scale.set(1, 1.5, 1);
  const f2 = cone(0.04, 0.14, flameMat, 0, 1.76, 0, 8);
  flame.add(f1, f2); flame.traverse((o) => { o.castShadow = false; o.userData.flame = true; });
  g.add(flame); live.push(flame);
  // kasa: curved hex roof, curled tips, jewel
  g.add(facet(lathe([[0, 1.99], [0.66, 1.99], [0.7, 2.02], [0.69, 2.06], [0.56, 2.1], [0.38, 2.19], [0.22, 2.29], [0.12, 2.35], [0, 2.37]], st, 0, 0, 0, 6)));
  for (let k = 0; k < 6; k++) {
    const [x, z, a] = hexAt(k, 0.69);
    const c = sphere(0.055, st, x, 2.08, z, 6, 4); c.scale.set(0.8, 1.5, 0.8); g.add(c);
    const tip = cone(0.035, 0.1, st, x * 1.02, 2.16, z * 1.02, 5); tip.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4); g.add(tip);
  }
  // a cap of moss over the back half of the roof (same hex facets, lying on the slope), a few cushions at its edge
  if (moss) {
    if (!_mossCap) { _mossCap = new THREE.LatheGeometry([[0.675, 2.075], [0.655, 2.108], [0.56, 2.14], [0.45, 2.195], [0.38, 2.232], [0.22, 2.328], [0.12, 2.383], [0.07, 2.398]].map(([r, y]) => new THREE.Vector2(r, y)), 6, Math.PI * 2 / 3, Math.PI).toNonIndexed(); _mossCap.computeVertexNormals(); _mossCap.userData.shared = true; }
    const mc = new THREE.Mesh(_mossCap, M.moss()); mc.castShadow = mc.receiveShadow = true; g.add(mc);
    for (const [k, rr] of [[2.6, 0.5], [3.4, 0.36], [4.3, 0.55]]) { const [x, z] = hexAt(k, rr); const m = sphere(0.06, M.moss(), x, 2.15 + (0.6 - rr) * 0.55, z, 9, 6); m.scale.set(1.4, 0.5, 1.2); g.add(m); }
  }
  g.add(lathe([[0.1, 2.35], [0.135, 2.4], [0.1, 2.45], [0.115, 2.5], [0.11, 2.57], [0.06, 2.62], [0.015, 2.66], [0, 2.66]], st, 0, 0, 0, 10));
  const group = bakeWith(g, live);
  group.name = 'stoneLantern';
  const set = fader((v) => { paperMat.userData.setGlow(0.07 + 0.93 * v); flameMat.userData.setGlow(v); flame.visible = v > 0.03; }, 3);
  let ft = 0;
  const h = { group, lit: false, height: 2.65, firePos: new THREE.Vector3(0, 1.73, 0),
    setLit(on, instant = false) { h.lit = !!on; set(on ? 1 : 0, instant); } };
  // flicker (cheap: only while lit and drawn)
  f1.onBeforeRender = () => { if (!h.lit) return; ft += 0.016; const s = 1 + 0.12 * Math.sin(ft * 13.1) * Math.sin(ft * 7.3); flame.scale.set(1, s, 1); };
  h.setLit(false, true);
  return h;
}

// ---------------------------------------------------------------------------------------------------------------
// Great Lantern (镇灯) — variants per land: crest, paper tint, frame and roof.
const GL_LANDS = {
  dusk:    { frame: () => M.verm(),            trim: () => M.black(),          roof: () => M.tileDusk(),  paper: '#f6e2c4', ink: '#a8261c', crest: 'maple', fire: PAL.lanternWarm, base: () => M.stoneWarm() },
  mirror:  { frame: () => M.woodOld(),         trim: () => M.woodDark(),       roof: () => M.copper(),    paper: '#f3ead6', ink: '#24546a', crest: 'wave',  fire: 0xffc27a,        base: () => M.stone() },
  crystal: { frame: () => mat.lacquer(0x2b3566), trim: () => M.silver(),       roof: () => M.deepBlue(),  paper: '#eef0f6', ink: '#3d4fa0', crest: 'star',  fire: 0xffd2a0,        base: () => M.stoneLight() },
  moon:    { frame: () => M.black(),           trim: () => M.gold(),           roof: () => M.tileNight(), paper: '#f4f1ea', ink: '#1d2140', crest: 'moon',  fire: PAL.lanternHot,  base: () => M.moonStone() },
  sun:     { frame: () => M.verm(),            trim: () => M.gold(),           roof: () => M.tile(),      paper: '#f8ecd2', ink: '#b8261c', crest: 'sun',   fire: PAL.lanternWarm, base: () => M.stone() },
};
const _crest = new Map();
/** Painted paper of a great lantern: washi with fibres, the land's crest twice (front / back), ribs left to geometry.
 *  Returns { map, emap } — emap darkens the crest so it shows as a silhouette when lit. */
function crestTextures(land) {
  if (_crest.has(land)) return _crest.get(land);
  const L = GL_LANDS[land] || GL_LANDS.sun;
  const W = 512, H = 256;
  const draw = (paper, ink, fibre) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = paper; x.fillRect(0, 0, W, H);
    // fibres and a soft vertical wash (hand-made washi)
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    x.globalAlpha = fibre;
    for (let i = 0; i < 260; i++) { x.strokeStyle = rnd() < 0.5 ? '#c9b48e' : '#ffffff'; x.lineWidth = 0.6 + rnd(); x.beginPath(); const px = rnd() * W, py = rnd() * H; x.moveTo(px, py); x.quadraticCurveTo(px + rnd() * 18 - 9, py + rnd() * 10, px + rnd() * 26 - 13, py + rnd() * 22 - 11); x.stroke(); }
    x.globalAlpha = 1;
    // bands top and bottom
    x.fillStyle = ink; x.globalAlpha = 0.85; x.fillRect(0, 0, W, 14); x.fillRect(0, H - 14, W, 14); x.globalAlpha = 1;
    for (const u of [0.25, 0.75]) crestAt(x, L.crest, u * W, H * 0.5, H * 0.3, ink, paper);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  const out = { map: draw(L.paper, L.ink, 0.35), emap: draw('#ffffff', '#3a2a22', 0.18) };
  _crest.set(land, out);
  return out;
}
function crestAt(x, kind, cx, cy, r, ink, paper) {
  x.save(); x.translate(cx, cy); x.fillStyle = ink; x.strokeStyle = ink; x.lineWidth = r * 0.12;
  x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke();               // the mon's ring
  if (kind === 'moon') {
    x.beginPath(); x.arc(0, 0, r * 0.72, 0, TAU); x.fill();
    x.fillStyle = paper; x.beginPath(); x.arc(r * 0.3, -r * 0.12, r * 0.62, 0, TAU); x.fill();
  } else if (kind === 'maple') {
    x.beginPath();
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.3 : r * 0.72; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    x.fill(); x.fillRect(-r * 0.04, r * 0.1, r * 0.08, r * 0.62);
  } else if (kind === 'wave') {
    x.lineWidth = r * 0.13;
    for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(0, r * 0.35, r * (0.62 - k * 0.2), Math.PI * 1.05, Math.PI * 1.95); x.stroke(); }
    x.beginPath(); x.arc(0, r * 0.35, r * 0.1, 0, TAU); x.fill();
  } else if (kind === 'star') {
    x.beginPath();
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * TAU, rr = i % 2 ? r * 0.2 : r * 0.7; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    x.fill();
  } else {   // sun: disc with rays
    x.beginPath(); x.arc(0, 0, r * 0.32, 0, TAU); x.fill();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; x.save(); x.rotate(a); x.fillRect(r * 0.44, -r * 0.05, r * 0.3, r * 0.1); x.restore(); }
  }
  x.restore();
}
let _spillTex = null;
function spillTexture() {
  if (_spillTex) return _spillTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,200,130,1)'); gr.addColorStop(0.3, 'rgba(255,160,80,0.5)'); gr.addColorStop(0.7, 'rgba(255,120,50,0.12)'); gr.addColorStop(1, 'rgba(255,110,40,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  _spillTex = new THREE.CanvasTexture(c); _spillTex.colorSpace = THREE.SRGBColorSpace;
  return _spillTex;
}

/**
 * Great Lantern (镇灯), ~5.6 m, firePos y 3.33. opts.land: 'dusk' | 'mirror' | 'crystal' | 'moon' | 'sun' (default).
 * Carved stone base (plinth, lotus drum, banded shaft, flared capital), a timber frame with corner posts, rails and
 * bracket blocks holding a big ribbed paper lantern with the land's painted crest, a tiled pyramid cap with a finial,
 * red tassels at the corners. Lit: the paper glows from inside (crest in silhouette), a flame core breathes, the
 * ground around it is washed with warm light. tick() animates while lit; `spark` (local Vector3) is where embers rise.
 */
export function makeGreatLantern(opts = {}) {
  if (sculptOn('great_lantern')) {
    try { const h = sculptGreatLantern(opts); if (h) { noteSite('great_lantern', h.land, h.group); return h; } } catch (e) { G.reportError?.('sculpt:great_lantern', e); }
  }
  const h = oldGreatLantern(opts);
  noteSite('great_lantern', h.land + '-old', h.group);
  return h;
}
// sculpted body tints per land (.tmp/sculpt/great_lantern/INSTALL.md, from tools/sculpt/assets/great_lantern.mjs TINTS):
// the bake is neutral for these materials, the land colour multiplies it (granite only mildly: tint / #a29e96)
const GL_TINT = {
  dusk:    { Lacquer_paint: '#e24a2e', Fitting_metal: '#7a5a44', Tile_tile: '#4a3a52', Granite_stone: '#a59c90' },
  mirror:  { Lacquer_paint: '#8c7a68', Fitting_metal: '#6e5640', Tile_tile: '#4f8f80', Granite_stone: '#a29e96' },
  crystal: { Lacquer_paint: '#2b3566', Fitting_metal: '#d8dff0', Tile_tile: '#26346a', Granite_stone: '#c9c6c0' },
  moon:    { Lacquer_paint: '#2a2326', Fitting_metal: '#ffd27a', Tile_tile: '#232a44', Granite_stone: '#b9c3dc' },
  sun:     { Lacquer_paint: '#e24a2e', Fitting_metal: '#ffd27a', Tile_tile: '#3c4a5c', Granite_stone: '#a29e96' },
};
const _glTint = new Map();
function glTintOf(land) {
  let f = _glTint.get(land);
  if (f) return f;
  const T = GL_TINT[land] || GL_TINT.sun, ref = new THREE.Color('#a29e96');
  f = (name) => {
    const hex = T[name];
    if (!hex) return [1, 1, 1];
    const c = new THREE.Color(hex);
    return name === 'Granite_stone' ? [c.r / ref.r, c.g / ref.g, c.b / ref.b] : [c.r, c.g, c.b];
  };
  _glTint.set(land, f);
  return f;
}
const _glGeo = new Map(), _glMat = new Map();
/** One draw of a sculpted great-lantern level (merged primitives, the land's tint in vertex colours). */
function glLevel(id, land, cast) {
  const k = id + ':' + land;
  let geo = _glGeo.get(k);
  if (!geo) { geo = heroGeometry(id, glTintOf(land)); geo.userData.shared = true; _glGeo.set(k, geo); }
  let m = _glMat.get(id);
  if (!m) { m = heroMaterial(id, { instanced: false, vertexColors: true, from: 'Granite_stone', lift: liftFor('sculpt_great_lantern') }); _glMat.set(id, m); }
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = cast; mesh.receiveShadow = true; mesh.name = 'sculpt:' + id.replace(/^sculpt_/, '');
  return mesh;
}
/** The four corner pendants merged into one draw (near: LOD0 atlas; far: LOD2 vertex colours). */
function glPendants(land, anchors, lod) {
  const A = sculptAsset('sculpt_great_lantern_hang');
  const corners = ['hang_fl', 'hang_fr', 'hang_bl', 'hang_br'].map((n) => anchors[n]).filter(Boolean);
  if (!A || corners.length < 4) return null;
  const k = 'hang:' + lod + ':' + land;
  let geo = _glGeo.get(k);
  if (!geo) {
    const tint = glTintOf(land);
    const one = lod === 0 ? heroGeometry('sculpt_great_lantern_hang', tint) : (() => {
      const parts = A.lods[lod].map((p) => {
        const s = p.geo.index ? p.geo.toNonIndexed() : p.geo, t = tint(p.name);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', s.attributes.position); g.setAttribute('normal', s.attributes.normal);
        g.setAttribute('color', rgbOf(s.attributes.color, t));
        return g;
      });
      return parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    })();
    const list = corners.map((c) => { const g = (one.index ? one.toNonIndexed() : one.clone()); g.translate(c.x, c.y, c.z); return g; });
    geo = mergeGeometries(list, false); geo.computeBoundingSphere(); geo.userData.shared = true;
    _glGeo.set(k, geo);
  }
  let m = _glMat.get(k.replace(':' + land, ''));
  if (!m) {
    m = lod === 0 ? heroMaterial('sculpt_great_lantern_hang', { instanced: false, vertexColors: true, from: 'Fitting_metal', lift: 1 })
      : toon(0xffffff, { vertexColors: true, surface: 'none', look: { rim: 0.2 } });
    _glMat.set(k.replace(':' + land, ''), m);
  }
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = lod === 0; mesh.receiveShadow = true; mesh.name = 'sculpt:great_lantern_hang';
  return mesh;
}
/**
 * The sculpted Great Lantern (.tmp/sculpt/great_lantern/INSTALL.md): the stone base, shaft, timber cage, tiled cap and
 * corner pendants are assets/models/sculpt/great_lantern*.glb, three distance levels (LOD0 1024 atlas within 17 m, the
 * 'mid' file to 35 m, the 'far' file beyond; one draw each, the land's colours in vertex colours). The paper barrel,
 * its ribs and lacquered caps, the flame core, the ground spill, fader / setLit / tick, height, firePos and spark are
 * the code ones, unchanged. Colliders stay in dusk.js.
 */
function sculptGreatLantern(opts) {
  const A0 = sculptAsset('sculpt_great_lantern'), Am = sculptAsset('sculpt_great_lantern_mid'), Af = sculptAsset('sculpt_great_lantern_far');
  if (!A0 || !Am || !Af) return null;
  const land = GL_LANDS[opts.land] ? opts.land : 'sun';
  const L = GL_LANDS[land];
  const g = new THREE.Group();
  const trim = L.trim();
  const tex = crestTextures(land);
  const paperMatH = texMat(tex.map, { emissive: new THREE.Color(L.fire), emissiveMap: tex.emap, emissiveIntensity: 0 });
  paperMatH.userData.surface = 'none'; paperMatH.userData.look = { trans: 0.5, rim: 0.15 };
  const pts = [];
  const pr = 0.64, ph = 1.08, pc = 3.33;
  for (let i = 0; i <= 14; i++) { const tt = i / 14; pts.push([pr * (0.7 + 0.3 * Math.sin(tt * Math.PI)), pc - ph / 2 + tt * ph]); }
  const paper = lathe(pts, paperMatH, 0, 0, 0, 24); paper.castShadow = false;
  g.add(paper);
  for (let i = 1; i < 7; i++) { const tt = i / 7; g.add(ring(pr * (0.7 + 0.3 * Math.sin(tt * Math.PI)) + 0.006, 0.012, M.woodDark(), 0, pc - ph / 2 + tt * ph, 0, 24, 4)); }
  for (const s of [-1, 1]) g.add(rcyl(pr * 0.74, pr * 0.74, 0.1, trim, 0, pc + s * (ph / 2 + 0.03), 0, 20, 0.02));
  const coreMat = glowDynamic(L.fire, 5);
  const core = new THREE.Group();
  const c1 = sphere(0.2, coreMat, 0, pc - 0.08, 0, 12, 8); c1.scale.set(1, 1.35, 1);
  const c2 = cone(0.12, 0.42, coreMat, 0, pc + 0.2, 0, 10);
  core.add(c1, c2); core.traverse((o) => { o.castShadow = false; });
  g.add(core);
  const spillMat = new THREE.MeshBasicMaterial({ map: spillTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0, color: new THREE.Color(L.fire) });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 9.5), spillMat);
  spill.rotation.x = -Math.PI / 2; spill.position.y = 0.06; spill.renderOrder = 2; spill.castShadow = false; spill.receiveShadow = false;
  g.add(spill);
  const group = bakeWith(g, [paper, core, spill]);
  group.name = 'greatLantern';
  // the sculpted body: three levels as direct children (the structures stand-in swaps them beyond 100 m)
  const near = glLevel('sculpt_great_lantern', land, true), mid = glLevel('sculpt_great_lantern_mid', land, true), far = glLevel('sculpt_great_lantern_far', land, true);
  const pNear = glPendants(land, A0.anchors, 0), pFar = glPendants(land, A0.anchors, 2);
  for (const m of [near, mid, far, pNear, pFar]) if (m) group.add(m);
  addLodSet(group, [{ meshes: [near, pNear].filter(Boolean), to: 17 }, { meshes: [mid, pFar].filter(Boolean), to: 35 }, { meshes: [far, pFar].filter(Boolean) }]);
  let lv = 0;
  const fire = new THREE.Color(L.fire);
  const set = fader((v) => {
    lv = v;
    paperMatH.emissiveIntensity = 0.04 + 2.3 * v;
    paperMatH.emissive.copy(fire);
    coreMat.userData.setGlow(0.02 + v);
    core.visible = v > 0.02; spill.visible = v > 0.02;
    spillMat.opacity = 0.75 * v;
  }, 1.4);
  const h = { group, lit: false, land, height: 5.6, firePos: new THREE.Vector3(0, 3.33, 0), spark: new THREE.Vector3(0, 4.06 + 0.4, 0),
    setLit(on, instant = false) { h.lit = !!on; set(on ? 1 : 0, instant); },
    tick(dt, time) {
      if (lv <= 0.02) return;
      const fl = 0.5 + 0.5 * Math.sin(time * 7.3) * Math.sin(time * 3.1 + 1.3);
      core.scale.set(1, 1 + 0.1 * fl * lv, 1);
      paperMatH.emissiveIntensity = (0.04 + 2.3 * lv) * (0.93 + 0.07 * fl);
      spillMat.opacity = 0.75 * lv * (0.9 + 0.1 * fl);
    } };
  h.setLit(false, true);
  return h;
}
function oldGreatLantern(opts) {
  const land = GL_LANDS[opts.land] ? opts.land : 'sun';
  const L = GL_LANDS[land];
  const g = new THREE.Group();
  const st = L.base(), sd = M.stoneDark(), frame = L.frame(), trim = L.trim();
  // --- carved stone base -------------------------------------------------------------------------------------------
  g.add(facet(lathe([[0, 0], [1.34, 0], [1.36, 0.14], [1.26, 0.2], [1.2, 0.3], [1.0, 0.34], [0, 0.34]], sd, 0, 0, 0, 8)));
  g.add(lathe([[0.98, 0.34], [1.02, 0.42], [0.96, 0.52], [0.78, 0.62], [0.62, 0.7], [0, 0.7]], st, 0, 0, 0, 24));
  for (let i = 0; i < 16; i++) {   // lotus petals round the drum
    const a = (i / 16) * TAU, p = sphere(0.2, st, Math.sin(a) * 0.82, 0.58, Math.cos(a) * 0.82, 8, 5);
    p.scale.set(0.75, 0.55, 0.32); p.rotation.set(-0.5, a, 0, 'YXZ'); g.add(p);
  }
  g.add(lathe([[0.5, 0.68], [0.46, 0.82], [0.42, 1.6], [0.44, 2.1], [0.5, 2.2], [0, 2.2]], st, 0, 0, 0, 20));
  for (const y of [0.86, 1.52, 2.08]) g.add(ring(0.465 - (y - 0.86) * 0.02, 0.035, sd, 0, y, 0, 20, 5));
  g.add(facet(lathe([[0.5, 2.18], [0.62, 2.26], [0.84, 2.38], [0.98, 2.46], [1.0, 2.56], [0.94, 2.62], [0, 2.62]], st, 0, 0, 0, 8)));
  // --- timber frame -----------------------------------------------------------------------------------------------
  const fy0 = 2.62, fy1 = 4.06, fx = 0.78;
  g.add(rbox(1.84, 0.1, 1.84, trim, 0, fy0 + 0.05, 0, 0.03, 2));                         // sill
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(rbox(0.13, fy1 - fy0, 0.13, frame, sx * fx, (fy0 + fy1) / 2, sz * fx, 0.025, 2));    // corner posts
    g.add(rbox(0.22, 0.12, 0.22, trim, sx * fx, fy1 - 0.02, sz * fx, 0.025, 1));              // bearing block (masu)
    for (const [bx, bz] of [[sx * 0.22, 0], [0, sz * 0.22]]) g.add(rbox(bx ? 0.3 : 0.1, 0.09, bx ? 0.1 : 0.3, frame, sx * fx - bx * 0.6, fy1 - 0.14, sz * fx - bz * 0.6, 0.02, 1));   // brackets
  }
  for (const y of [fy0 + 0.22, fy1 - 0.08]) for (const s of [-1, 1]) {
    g.add(rbox(1.62, 0.08, 0.08, frame, 0, y, s * fx, 0.02, 1), rbox(0.08, 0.08, 1.62, frame, s * fx, y, 0, 0.02, 1));
  }
  g.add(rbox(1.95, 0.12, 1.95, trim, 0, fy1 + 0.08, 0, 0.03, 2));                         // top plate
  // --- the paper lantern ------------------------------------------------------------------------------------------
  const tex = crestTextures(land);
  const paperMatH = texMat(tex.map, { emissive: new THREE.Color(L.fire), emissiveMap: tex.emap, emissiveIntensity: 0 });
  paperMatH.userData.surface = 'none'; paperMatH.userData.look = { trans: 0.5, rim: 0.15 };
  const pts = [];
  const pr = 0.64, ph = 1.08, pc = 3.33;
  for (let i = 0; i <= 14; i++) { const tt = i / 14; pts.push([pr * (0.7 + 0.3 * Math.sin(tt * Math.PI)), pc - ph / 2 + tt * ph]); }
  const paper = lathe(pts, paperMatH, 0, 0, 0, 24); paper.castShadow = false;
  g.add(paper);
  for (let i = 1; i < 7; i++) { const tt = i / 7; g.add(ring(pr * (0.7 + 0.3 * Math.sin(tt * Math.PI)) + 0.006, 0.012, M.woodDark(), 0, pc - ph / 2 + tt * ph, 0, 24, 4)); }
  for (const s of [-1, 1]) g.add(rcyl(pr * 0.74, pr * 0.74, 0.1, trim, 0, pc + s * (ph / 2 + 0.03), 0, 20, 0.02));   // lacquered caps
  // flame core (live)
  const coreMat = glowDynamic(L.fire, 5);
  const core = new THREE.Group();
  const c1 = sphere(0.2, coreMat, 0, pc - 0.08, 0, 12, 8); c1.scale.set(1, 1.35, 1);
  const c2 = cone(0.12, 0.42, coreMat, 0, pc + 0.2, 0, 10);
  core.add(c1, c2); core.traverse((o) => { o.castShadow = false; });
  g.add(core);
  // --- tiled cap, finial, tassels ----------------------------------------------------------------------------------
  const roof = makeRoof({ hw: 1.38, hd: 1.38, h: 0.98, style: 'pyramid', mat: L.roof(), ridgeMat: trim, lift: 0.34, corr: 0.05, tile: 0.25, thick: 0.14, rafters: false, finial: grpFinial(trim) });
  roof.group.position.y = fy1 + 0.14; g.add(roof.group);
  const tasselMat = SM.ropeRed();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = sx * 1.22, z0 = sz * 1.22, y0 = fy1 + 0.18;
    g.add(tube([[x0, y0, z0], [x0 * 1.01, y0 - 0.35, z0 * 1.01], [x0, y0 - 0.62, z0]], 0.018, tasselMat, 6, 4));
    g.add(sphere(0.06, trim, x0, y0 - 0.66, z0, 8, 6));
    g.add(lathe([[0.03, 0], [0.08, -0.08], [0.1, -0.3], [0.07, -0.36], [0, -0.37]], tasselMat, x0, y0 - 0.68, z0, 10));
  }
  // --- warm spill on the ground (live, additive) --------------------------------------------------------------------
  const spillMat = new THREE.MeshBasicMaterial({ map: spillTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0, color: new THREE.Color(L.fire) });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 9.5), spillMat);
  spill.rotation.x = -Math.PI / 2; spill.position.y = 0.06; spill.renderOrder = 2; spill.castShadow = false; spill.receiveShadow = false;
  g.add(spill);
  const group = bakeWith(g, [paper, core, spill]);
  group.name = 'greatLantern';
  let lv = 0;
  const fire = new THREE.Color(L.fire);
  const set = fader((v) => {
    lv = v;
    paperMatH.emissiveIntensity = 0.04 + 2.3 * v;
    paperMatH.emissive.copy(fire);
    coreMat.userData.setGlow(0.02 + v);
    core.visible = v > 0.02; spill.visible = v > 0.02;
    spillMat.opacity = 0.75 * v;
  }, 1.4);
  const h = { group, lit: false, land, height: 5.6, firePos: new THREE.Vector3(0, 3.33, 0), spark: new THREE.Vector3(0, fy1 + 0.4, 0),
    setLit(on, instant = false) { h.lit = !!on; set(on ? 1 : 0, instant); },
    // gentle life while lit (called by the structures system when the lantern is near)
    tick(dt, time) {
      if (lv <= 0.02) return;
      const fl = 0.5 + 0.5 * Math.sin(time * 7.3) * Math.sin(time * 3.1 + 1.3);
      core.scale.set(1, 1 + 0.1 * fl * lv, 1);
      paperMatH.emissiveIntensity = (0.04 + 2.3 * lv) * (0.93 + 0.07 * fl);
      spillMat.opacity = 0.75 * lv * (0.9 + 0.1 * fl);
    } };
  h.setLit(false, true);
  return h;
}
function grpFinial(m) {
  const g = new THREE.Group();
  g.add(lathe([[0.13, 0], [0.09, 0.08], [0.08, 0.26], [0.14, 0.32], [0.17, 0.44], [0.12, 0.56], [0.05, 0.66], [0.02, 0.82], [0, 0.84]], m, 0, -0.1, 0, 14));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; const p = sphere(0.05, m, Math.sin(a) * 0.15, 0.36, Math.cos(a) * 0.15, 6, 4); g.add(p); }
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
/** Treasure chest: plank body with corner posts and a skid, iron bands with rivets, brass corner caps, lock plate and
 *  side handles; a barrel lid of staves hinged at the back (pivot (0, 0.54, -0.31), swings 1.9 rad), glowing inside. */
export function makeChest() {
  const g = new THREE.Group();
  const wood = SM.woodRed(), woodD = SM.woodDark(), iron = SM.iron(), brass = SM.brass();
  const W = 1.0, D = 0.62, y0 = 0.06, y1 = 0.54;
  g.add(rbox(W + 0.06, 0.06, D + 0.06, woodD, 0, 0.03, 0, 0.015, 1));                     // skid
  g.add(rbox(W - 0.06, y1 - y0 - 0.02, D - 0.06, woodD, 0, (y0 + y1) / 2, 0, 0.01, 1));    // dark core (shows in the gaps)
  const n = 3, ph = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const y = y0 + ph * (i + 0.5), j = ((i * 5) % 3) * 0.003;
    for (const s of [-1, 1]) {
      g.add(rbox(W - 0.1, ph - 0.012, 0.035, wood, j * s, y, s * (D / 2 - 0.016), 0.01, 1));
      g.add(rbox(0.035, ph - 0.012, D - 0.1, wood, s * (W / 2 - 0.016), y, -j * s, 0.01, 1));
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(rbox(0.07, y1 - y0 + 0.02, 0.07, woodD, sx * (W / 2 - 0.03), (y0 + y1) / 2, sz * (D / 2 - 0.03), 0.015, 1));
    g.add(rbox(0.1, 0.1, 0.1, brass, sx * (W / 2 - 0.03), y0 + 0.04, sz * (D / 2 - 0.03), 0.02, 1));       // corner caps
  }
  // iron bands round the body with rivets
  for (const bx of [-0.3, 0.3]) {
    for (const s of [-1, 1]) g.add(rbox(0.07, y1 - y0, 0.016, iron, bx, (y0 + y1) / 2, s * (D / 2 + 0.008), 0.006, 1));
    for (const s of [-1, 1]) for (const y of [y0 + 0.06, (y0 + y1) / 2, y1 - 0.06]) g.add(sphere(0.012, iron, bx, y, s * (D / 2 + 0.018), 6, 4));
  }
  g.add(rbox(W + 0.02, 0.05, D + 0.02, iron, 0, y1 - 0.02, 0, 0.01, 1));                   // rim band
  // lock plate, side handles
  g.add(rbox(0.17, 0.17, 0.025, brass, 0, y1 - 0.11, D / 2 + 0.014, 0.012, 1));
  g.add(box(0.024, 0.05, 0.01, woodD, 0, y1 - 0.13, D / 2 + 0.028));
  for (const s of [-1, 1]) {
    g.add(rbox(0.02, 0.06, 0.14, iron, s * (W / 2 + 0.01), y1 - 0.14, 0, 0.006, 1));
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 12, Math.PI), iron); hd.rotation.set(Math.PI, Math.PI / 2, 0); hd.position.set(s * (W / 2 + 0.03), y1 - 0.15, 0); g.add(hd);
  }
  const innerMat = glowDynamic(PAL.gold, 3);
  const inner = box(0.9, 0.04, 0.52, innerMat, 0, 0.5, 0); inner.castShadow = false; g.add(inner);
  // lid: pivot at the back edge; barrel of staves over the depth
  let lid = new THREE.Group(); lid.position.set(0, 0.54, -0.31);
  const arc = (th) => [0.08 + Math.sin(th) * 0.19, 0.31 - Math.cos(th) * 0.31];   // [y, z] in lid space
  const N = 6, pts = [];
  for (let i = 0; i <= N; i++) pts.push(arc((i / N) * Math.PI));
  lid.add(rbox(W, 0.08, D, wood, 0, 0.04, 0.31, 0.012, 1));                              // lid frame
  for (let i = 0; i < N; i++) {
    const [ya, za] = pts[i], [yb, zb] = pts[i + 1];
    const len = Math.hypot(yb - ya, zb - za) + 0.008;
    const s = rbox(W - 0.04, 0.035, len, wood, 0, (ya + yb) / 2, (za + zb) / 2, 0.01, 1);
    s.rotation.x = -Math.atan2(yb - ya, zb - za); lid.add(s);
  }
  // gable ends (half-ellipse boards) and iron straps following the arc, rivets on them
  const sh = new THREE.Shape(); sh.moveTo(pts[0][1], pts[0][0]); for (const [y, z] of pts) sh.lineTo(z, y); sh.closePath();
  const endG = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 2 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(endG, woodD); e.rotation.y = -Math.PI / 2; e.position.x = s * (W / 2 - 0.018) + 0.0175; e.castShadow = true; lid.add(e); }
  for (const bx of [-0.3, 0.3]) {
    lid.add(tube(pts.map(([y, z]) => [bx, y + 0.022, z]), 0.016, iron, 12, 4));
    for (let i = 1; i < N; i++) lid.add(sphere(0.013, iron, bx, pts[i][0] + 0.04, pts[i][1], 6, 4));
  }
  lid.add(rbox(0.12, 0.13, 0.02, brass, 0, 0.0, 0.625, 0.01, 1));                           // hasp
  for (const hx of [-0.3, 0.3]) lid.add(rbox(0.09, 0.03, 0.16, iron, hx, 0.03, 0.02, 0.006, 1));   // hinge straps
  lid = bakeStatic(lid);
  g.add(lid);
  const group = bakeWith(g, [lid, inner]);
  group.name = 'chest';
  const set = fader((v) => { lid.rotation.x = -1.9 * v; innerMat.userData.setGlow(0.05 + v); }, 4);
  const h = { group, opened: false, open(instant = false) { h.opened = true; set(1, instant); }, close(instant = false) { h.opened = false; set(0, instant); } };
  set(0, true);
  return h;
}

// --- shared helpers (same semantics as in factories.js) -----------------------------------------------------------
import { tickers } from './factories.js';
import { damp } from '../../core/util.js';
function fader(apply, rate = 2.5, v0 = 0) {
  let v = v0, goal = v0, running = false;
  const tick = (dt) => {
    v = damp(v, goal, rate, dt);
    if (Math.abs(v - goal) < 0.004) { v = goal; apply(v); running = false; return false; }
    apply(v); return true;
  };
  apply(v);
  return (target, instant) => {
    goal = target;
    if (instant) { v = goal; apply(v); if (running) { tickers.delete(tick); running = false; } return; }
    if (!running) { running = true; tickers.add(tick); }
  };
}
function bakeWith(root, dyn = []) { for (const d of dyn) d.userData.dynamic = true; return bakeStatic(root); }
void cyl;
