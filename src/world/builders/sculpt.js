// Sculpted hero objects in the world (install round 2026-11-17; tools/sculpt/README.md §7, .tmp/sculpt/<name>/INSTALL.md).
// A sculpted GLB holds <name>_LOD0 (colour atlas + OBJECT-space normal map), <name>_LOD1/2 (vertex
// colours only) and empty anchor nodes. The game uses them like this:
//   * far / everywhere: the vertex-coloured LOD, with WHITE copies of the site's own materials (kit.js sculptVcMat), so
//     a statue or decor lantern merges into the same surface-family mesh its old primitive version merged into: no draw
//     call is added at any distance. Stand-alone objects (roadside lanterns) keep it as their own baked mesh.
//   * near (within NEAR_R of the camera): ONE InstancedMesh per sculpt type draws LOD0 for every near instance (all of
//     LOD0's materials share one atlas, so they fold into one material). The merged vertex-coloured copy of a near
//     instance is collapsed to a point (its vertex range in the merged mesh, tracked through the bake) while LOD0 shows.
// Switch: G.sculpt (core/assets.js): ?sculpt=0 builds every old object.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../../core/game.js';
import { hookMaterial } from '../../core/mats.js';
import { sculptVcMat } from './kit.js';

/** Is the sculpted version of `type` in use (see core/assets.js SCULPT_TYPES)? false before the assets exist. */
export const sculptOn = (type) => !!G.sculpt?.on?.(type) && !!G.assets;

/** Every place a sculpt-able object stands (both modes), for probes and shots: { type, id, pos: Vector3, yaw }. */
export const sculptSites = [];
export function noteSite(type, id, obj) {
  const e = { type, id, obj, pos: null, yaw: 0 };
  sculptSites.push(e);
  return e;
}
/** World positions of the noted sites (resolved lazily from the objects' last known world matrix). */
export function siteList() {
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), eu = new THREE.Euler();
  return sculptSites.map((e) => {
    if (!e.pos && e.matrix) { e.matrix.decompose(v, q, s); e.pos = v.clone(); eu.setFromQuaternion(q, 'YXZ'); e.yaw = eu.y; }
    else if (!e.pos && e.obj?.parent) { e.obj.updateWorldMatrix(true, false); e.obj.matrixWorld.decompose(v, q, s); e.pos = v.clone(); eu.setFromQuaternion(q, 'YXZ'); e.yaw = eu.y; }
    return { type: e.type, id: e.id, x: e.pos ? +e.pos.x.toFixed(2) : null, y: e.pos ? +e.pos.y.toFixed(2) : null, z: e.pos ? +e.pos.z.toFixed(2) : null, yaw: +e.yaw.toFixed(3) };
  });
}

// ---- the GLB, split into LOD pieces ------------------------------------------------------------------------------------
const _assets = new Map();
/**
 * The pieces of a sculpt asset: { base, lods: [[{ geo, mat, name }]] (geometry in the GLB root frame), anchors:
 * { name: Vector3 }, box }. Shared by every instance (never edit the geometries). null when the asset is not loaded.
 */
export function sculptAsset(id) {
  if (_assets.has(id)) return _assets.get(id);
  const raw = G.assets?.raw?.(id);
  if (!raw) { _assets.set(id, null); return null; }
  const root = raw.scene;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  const top = root.children.length === 1 && !root.children[0].isMesh ? root.children[0] : root;
  const base = top.name || id.replace(/^sculpt_/, '');
  const lods = [], anchors = {};
  for (const node of top.children) {
    const m = /_LOD(\d)$/.exec(node.name || '');
    if (!m) { anchors[node.name] = new THREE.Vector3().setFromMatrixPosition(rel.multiplyMatrices(inv, node.matrixWorld)); continue; }
    const list = [];
    node.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.userData = {};
      g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
      g.computeBoundingBox(); g.computeBoundingSphere();
      list.push({ geo: g, mat: o.material, name: (o.material?.name || '').replace(/_vc$/, '') });
    });
    lods[+m[1]] = list;
  }
  const box = new THREE.Box3();
  for (const p of lods[0] || []) box.union(p.geo.boundingBox);
  const a = { id, base, lods, anchors, box, lift: liftOf(lods) };
  _assets.set(id, a);
  return a;
}

/**
 * Value lift: the sculpts' granite was painted darker than the game's carved stone (M.carved, #a59c90) — in the game
 * light they read as dark lumps next to the old pale lanterns. The stone's mean (vertex-coloured LOD) is lifted toward
 * the game stone's value, at most 1.35x, the same factor on every LOD (vertex colours and the LOD0 material colour).
 */
const STONE_LUM = (() => { const c = new THREE.Color(0xa59c90); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; })();
function liftOf(lods) {
  for (const l of lods.slice(1)) for (const p of l || []) {
    const c = p.geo.attributes.color;
    if (!/^Granite/.test(p.name) || !c) continue;
    let s = 0;
    for (let i = 0; i < c.count; i++) s += 0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i);
    return Math.min(1.35, Math.max(1, STONE_LUM / Math.max(1e-3, s / c.count)));
  }
  return 1;
}
export const liftFor = (id) => sculptAsset(id)?.lift || 1;
/** Plain float RGB copy of a (possibly RGBA / normalised) colour attribute; alpha dropped. */
export function rgbOf(attr, mul = null) {
  const n = attr.count, o = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    o[i * 3] = attr.getX(i) * (mul ? mul[0] : 1); o[i * 3 + 1] = attr.getY(i) * (mul ? mul[1] : 1); o[i * 3 + 2] = attr.getZ(i) * (mul ? mul[2] : 1);
  }
  return new THREE.BufferAttribute(o, 3);
}

// ---- vertex-coloured LOD as a placeable group ----------------------------------------------------------------------
const _vcGeo = new Map();
/** One vertex-coloured LOD piece as a non-indexed geometry with position / normal / rgb colour (cached per piece). */
function vcGeo(id, lod, i, piece, tint0) {
  const k = id + ':' + lod + ':' + i + ':' + (tint0 ? tint0.join(',') : '');
  let g = _vcGeo.get(k);
  if (g) return g;
  const L = liftFor(id), tint = [(tint0 ? tint0[0] : 1) * L, (tint0 ? tint0[1] : 1) * L, (tint0 ? tint0[2] : 1) * L];
  const src = piece.geo.index ? piece.geo.toNonIndexed() : piece.geo;
  g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position);
  g.setAttribute('normal', src.attributes.normal);
  g.setAttribute('color', rgbOf(src.attributes.color, tint));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData = { shared: true };
  _vcGeo.set(k, g);
  return g;
}

/**
 * A placeable group with the vertex-coloured LOD `lod` of sculpt asset `id`. matFor(pieceName) -> the site material the
 * piece merges with (wrapped in sculptVcMat: white, vertex-coloured, same family), or null to fold that piece into the
 * first piece's material. opts: { scale, tint: [r,g,b] (linear multiplier, e.g. a land's stone), hero: true (register
 * for the near LOD0 swap), type }. Returns the group (userData.sculpt = the handle) or null if the asset is missing.
 */
export function sculptGroup(id, lod, matFor, opts = {}) {
  const A = sculptAsset(id);
  const pieces = A?.lods[lod];
  if (!pieces?.length) return null;
  const g = new THREE.Group();
  g.name = 'sculpt:' + A.base;
  const handle = opts.hero === false ? null : hero(id, opts.type).add(g, opts.tint);
  const first = matFor(pieces[0].name);
  const byMat = new Map();
  pieces.forEach((p, i) => {
    const site = matFor(p.name) || first;
    const geo = vcGeo(id, lod, i, p, opts.tint);
    let l = byMat.get(site); if (!l) byMat.set(site, (l = [])); l.push(geo);
  });
  for (const [site, geos] of byMat) {
    const geo = geos.length === 1 ? geos[0] : mergedGeo(id + ':' + lod + ':' + site.uuid + ':' + (opts.tint ? opts.tint.join(',') : ''), geos);
    const m = new THREE.Mesh(geo, sculptVcMat(site));
    m.castShadow = true; m.receiveShadow = true;
    m.name = 'sculpt:' + A.base + ':LOD' + lod;
    if (handle) { m.userData.sculptRef = handle; handle.meshes.push(m); }
    g.add(m);
  }
  if (opts.scale && opts.scale !== 1) g.scale.setScalar(opts.scale);
  g.userData.sculpt = handle;
  return g;
}
const _merged = new Map();
function mergedGeo(k, geos) {
  let g = _merged.get(k);
  if (!g) { g = mergeGeometries(geos, false); g.computeBoundingBox(); g.computeBoundingSphere(); g.userData = { shared: true }; _merged.set(k, g); }
  return g;
}

// ---- near LOD0: one InstancedMesh per sculpt type ------------------------------------------------------------------
const NEAR_R = 17, HYST = 2;          // m from the camera to the object's origin; LOD0 inside, the merged LOD outside
const NORMAL_K = 0.85;                // share of the baked normal in the LOD0 shading normal (see heroMaterial; ?snk=0..1 for tests)
const CAP = 6;                         // LOD0 instances per type at once (nearest first)
const heroes = new Map();              // asset id -> Hero
/**
 * One LOD0 material for the whole object (every LOD0 primitive of a sculpt GLB uses the same atlas and normal map):
 * a copy of the asset's first LOD0 toon material (surface / look of its main part), object-space normal map kept.
 * Instanced: the object-space normal is turned by the instance rotation (three's chunk only applies normalMatrix).
 */
export function heroMaterial(id, { instanced = true, vertexColors = false, from = null, lift = null } = {}) {
  const A = sculptAsset(id);
  const src = (from && A.lods[0].find((p) => p.name === from)?.mat) || A.lods[0][0].mat;
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, map: src.map, gradientMap: src.gradientMap, normalMap: src.normalMap, vertexColors });
  m.color.setScalar(lift ?? A.lift ?? 1);
  m.normalMapType = src.normalMapType;
  m.name = 'sculpt:' + A.base;
  m.userData.surface = src.userData.surface; m.userData.look = { ...(src.userData.look || {}) };
  if (src.map) src.map.anisotropy = Math.max(src.map.anisotropy, 4);
  if (m.normalMap && m.normalMapType === THREE.ObjectSpaceNormalMap) {
    // Object-space normal map, two changes to three's chunk: (1) instanced, the mapped normal is turned by the instance
    // rotation (three applies only normalMatrix); (2) it is blended with the interpolated surface normal (NORMAL_K):
    // a little of the smooth normal keeps the cel band from cutting the finest baked grain into specks.
    m.defines = { ...(m.defines || {}), SCULPT_NK: (G.params?.snk != null ? +G.params.snk : NORMAL_K).toFixed(2) };
    if (instanced) m.defines.SCULPT_INST = '';
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', 'varying vec3 vSiR0, vSiR1, vSiR2;\n#include <common>')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n  vSiR0 = instanceMatrix[0].xyz; vSiR1 = instanceMatrix[1].xyz; vSiR2 = instanceMatrix[2].xyz;\n#endif');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', 'varying vec3 vSiR0, vSiR1, vSiR2;\n#include <common>')
        .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_OBJECTSPACE
  vec3 siGeo = normal;
  vec3 siN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  #ifdef FLIP_SIDED
    siN = - siN;
  #endif
  #ifdef DOUBLE_SIDED
    siN = siN * faceDirection;
  #endif
  #ifdef SCULPT_INST
    siN = mat3( normalize( vSiR0 ), normalize( vSiR1 ), normalize( vSiR2 ) ) * siN;
  #endif
  siN = normalize( normalMatrix * siN );
  normal = normalize( mix( siGeo, siN, SCULPT_NK ) );
#else
  #include <normal_fragment_maps>
#endif`);
    };
    m.customProgramCacheKey = () => 'sculptN' + (instanced ? 'i' : '');
  }
  hookMaterial(m);
  return m;
}
/** Merged LOD0 geometry of a sculpt asset (position / normal / uv), optionally with a per-piece colour (tint). */
export function heroGeometry(id, colourOf = null) {
  const A = sculptAsset(id);
  const geos = A.lods[0].map((p) => {
    const s = p.geo;
    const g = new THREE.BufferGeometry();
    for (const n of ['position', 'normal', 'uv']) if (s.attributes[n]) g.setAttribute(n, s.attributes[n]);
    if (s.index) g.setIndex(s.index);
    if (colourOf) {
      const c = colourOf(p.name), n = s.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    return g;
  });
  const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

class Hero {
  constructor(id, type) {
    this.id = id; this.type = type || G.sculpt?.typeOf?.(id) || id;
    this.list = [];
    this.mesh = null;
    this.shown = [];
  }
  /** Register an instance group; its world matrix is read when it first matters. */
  add(group, tint) {
    const h = { group, hero: this, ranges: [], meshes: [], matrix: null, pos: null, near: false, saved: null, tint: tint || null };
    this.list.push(h);
    return h;
  }
  build() {
    if (this.mesh || !this.list.length) return;
    const geo = heroGeometry(this.id);
    const mat = heroMaterial(this.id, { instanced: true });
    const im = new THREE.InstancedMesh(geo, mat, CAP);
    im.name = 'sculpt:' + sculptAsset(this.id).base + ':LOD0';
    im.count = 0; im.visible = false; im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;   // the near instances are within NEAR_R of the camera; one draw either way
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.list.some((h) => h.tint)) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3); }
    G.scene.add(im);
    this.mesh = im;
  }
}
export function hero(id, type) {
  let h = heroes.get(id);
  if (!h) heroes.set(id, (h = new Hero(id, type)));
  return h;
}

function worldOf(h) {
  if (h.matrix) return h.matrix;
  const m = h.meshes[0];
  if (!m) return null;
  // site pieces: the bake recorded the piece's world matrix (kit.js prepVertexColours); stand-alone: read it live
  if (h.recorded) { h.matrix = h.recorded; }
  else if (m.parent) { m.updateWorldMatrix(true, false); h.matrix = m.matrixWorld.clone(); }
  if (h.matrix) h.pos = new THREE.Vector3().setFromMatrixPosition(h.matrix);
  return h.matrix;
}
/** Hide / show the vertex-coloured copy of one instance (collapse its range in a merged mesh, or its own meshes). */
function setFarHidden(h, hide) {
  if (h.ranges.length) {
    for (const r of h.ranges) {
      const P = r.geo?.attributes?.position;
      if (!P) continue;
      const a = P.array, s = r.start * 3, e = (r.start + r.count) * 3;
      if (hide) {
        if (!r.saved) r.saved = a.slice(s, e);
        const x = a[s], y = a[s + 1], z = a[s + 2];
        for (let i = s; i < e; i += 3) { a[i] = x; a[i + 1] = y; a[i + 2] = z; }
      } else if (r.saved) a.set(r.saved, s);
      P.addUpdateRange(s, e - s); P.needsUpdate = true;   // never clear: other instances of this merged mesh may have queued ranges this frame (three clears after the upload)
    }
  } else {
    for (const m of h.meshes) { if (hide) { if (h.mask == null) h.mask = m.layers.mask; m.layers.mask = 0; } else if (h.mask != null) m.layers.mask = h.mask; }
  }
}
const _cam = new THREE.Vector3(), _col = new THREE.Color();
let _frame = 0, _built = false;
/** Tests: force every instance to its far (vertex-coloured) version, re-read world matrices. */
export const sculptDebug = {
  heroes, farOnly: false,
  reread() { for (const H of heroes.values()) for (const h of H.list) if (!h.recorded) { h.matrix = null; h.pos = null; } },
  tick: () => tickHeroes(true),
};
/** After the world is built: the instanced LOD0 meshes (structures.js init). */
export function buildHeroes() {
  for (const h of heroes.values()) { try { h.build(); } catch (e) { G.reportError?.('sculpt:hero:' + h.id, e); } }
  _built = true;
}
/** Every few frames (structures.js update): which instances are near enough for LOD0. */
export function tickHeroes(force = false) {
  if (!_built || !G.camera) return;
  if (!force && (++_frame & 3)) return;
  G.camera.getWorldPosition(_cam);
  tickLodSets();
  for (const H of heroes.values()) {
    const im = H.mesh;
    if (!im) continue;
    const near = [];
    for (const h of H.list) {
      if (!worldOf(h) || !h.group.visible && !h.ranges.length) continue;
      const d = _cam.distanceTo(h.pos);
      if (!sculptDebug.farOnly && d < (h.near ? NEAR_R + HYST : NEAR_R)) near.push([d, h]);
    }
    near.sort((a, b) => a[0] - b[0]);
    if (near.length > CAP) near.length = CAP;
    const want = new Set(near.map((x) => x[1]));
    let changed = false;
    for (const h of H.list) {
      const on = want.has(h);
      if (on !== h.near) { h.near = on; setFarHidden(h, on); changed = true; }
    }
    if (changed || force) {
      let i = 0;
      for (const [, h] of near) {
        im.setMatrixAt(i, h.matrix);
        if (im.instanceColor) im.setColorAt(i, h.tint ? _col.setRGB(h.tint[0], h.tint[1], h.tint[2]) : _col.setRGB(1, 1, 1));
        i++;
      }
      im.count = i; im.visible = i > 0;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
// ---- stand-alone objects with their own distance LODs (the great lanterns) ---------------------------------------------
// levels: [{ meshes: [Mesh], to: metres }] nearest first; the last level's `to` is ignored. The meshes are direct children
// of a structures stand-in object (which toggles .visible on all of them beyond 100 m), so the level switch uses the
// layer mask instead. Built with only the last level visible: the boot stand-in is made from the far level alone.
const lodSets = [];
export function addLodSet(obj, levels) {
  const set = { obj, levels, cur: -1, pos: new THREE.Vector3(), ready: false };
  for (let i = 0; i < levels.length; i++) for (const m of levels[i].meshes) m.visible = i === levels.length - 1;
  lodSets.push(set);
  return set;
}
function tickLodSets() {
  for (const s of lodSets) {
    if (!s.obj.parent) continue;
    if (!s.ready) {
      s.ready = true;
      s.obj.updateWorldMatrix(true, false); s.pos.setFromMatrixPosition(s.obj.matrixWorld);
      const far = s.levels[s.levels.length - 1].meshes[0];
      const vis = far ? far.visible : true;   // the stand-in may already have hidden the levels: keep its state
      for (const l of s.levels) for (const m of l.meshes) { m.userData.mask = m.layers.mask; m.visible = vis; }
    }
    const d = _cam.distanceTo(s.pos);
    let k = s.levels.length - 1;
    for (let i = 0; i < s.levels.length - 1; i++) if (d < s.levels[i].to + (s.cur === i ? HYST : 0)) { k = i; break; }
    if (k === s.cur) continue;
    s.cur = k;
    s.levels.forEach((l, i) => { for (const m of l.meshes) m.layers.mask = i === k ? m.userData.mask : 0; });
  }
}

/** Tests / reports: per type the instances, how many are near, LOD0 triangles. */
export function heroStats() {
  const o = {};
  for (const H of heroes.values()) {
    const g = H.mesh?.geometry;
    o[H.id] = { n: H.list.length, near: H.list.filter((h) => h.near).length, merged: H.list.filter((h) => h.ranges.length).length, lod0Tris: g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0 };
  }
  return o;
}
