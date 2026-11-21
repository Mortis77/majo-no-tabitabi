// Draw-call pass for characters (docs/api/actors-look.md "Draw-call pass", docs/api/perf.md).
//
//   mergeCelParts(root)       -> at load (assets.celify, after outlines + shadow proxy): the ~19 cel materials of a VRoid
//                                character become three merged SkinnedMeshes, one draw each:
//                                  body   — every opaque part without morphs (skin, garments, hair, ears, add-ons), two-sided
//                                           with one-sided parts' back faces discarded per slot
//                                  face   — the opaque morph parts (Face, FaceMouth, EyeWhite, EyeIris)
//                                  decals — the transparent parts (HairBack, FaceLines, EyeHighlight), morph targets
//                                plus two hidden far views the rig switches to beyond FAR_LOD m (docs: "Distance"):
//                                  far body   — body + face in one draw (face in its rest shape), same material
//                                  far decals — HairBack only (eyelines / highlights are sub-pixel there)
//                                Each vertex carries its slot (aCelS); each slot keeps its own colour, map (a layer of a
//                                texture array: one array per map size, no resampling), shade, rim, kind and flags, so
//                                the picture is the one of the separate parts.
//   celParts(mesh)            -> [{ name, slot, start, count }] of a merged mesh ([] for anything else)
//   celSlotsOf(model)         -> every merged slot of a model: [{ material, meshes, slot, name, kind }]
//   splitCelPart(mesh, re, material) -> draw the parts whose name matches re with another material (own draw), hide them
//                                in the merged one (per-clone geometry view; used by tints that make eyes glow)
//   hideCelParts(mesh, re) / restoreCelParts(mesh)
//
// Documented material names (Body, Face, Hair*, Eye*, cloth_*, …) live on as slot names: material.cel.slots[i].name and
// mesh.userData.celParts. Merged meshes: userData.celLod = 'near' | 'far' (far views start hidden). ?castmerge=0 = off.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { CelMaterial, CEL_SLOTS, CEL_ARRS, sameBones, harmonize } from './celmat.js';
import { hookMaterial } from '../core/mats.js';

const KINDS = { cloth: 0, skin: 1, face: 2, hair: 3, eye: 4, line: 5, fur: 6 };
const ATTRS = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];

// ---- texture arrays: one per map size (max CEL_ARRS), so every layer keeps its own texels and mip chain ----------------------
let RENDERER = null;
function textureArray(maps) {
  const W = maps[0].image.width, H = maps[0].image.height, n = maps.length;
  // fast path: allocate on the GPU and copy each map's image straight into its layer (no JS pixel readback; the maps
  // are uploaded here, at load, instead of in the frame a character first appears)
  const gpu = !!RENDERER?.copyTextureToTexture;
  let data = null;
  if (!gpu) {
    data = new Uint8Array(W * H * 4 * n);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    maps.forEach((t, i) => { cx.clearRect(0, 0, W, H); cx.drawImage(t.image, 0, 0, W, H); data.set(cx.getImageData(0, 0, W, H).data, i * W * H * 4); });
  }
  const tex = new THREE.DataArrayTexture(data, W, H, n);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  const wrap = maps.every((t) => t.wrapS === maps[0].wrapS && t.wrapT === maps[0].wrapT) ? [maps[0].wrapS, maps[0].wrapT] : [THREE.RepeatWrapping, THREE.RepeatWrapping];
  tex.wrapS = wrap[0]; tex.wrapT = wrap[1];
  tex.anisotropy = Math.max(...maps.map((t) => t.anisotropy || 1));
  tex.name = 'celArray';
  tex.needsUpdate = true;
  if (gpu) {
    tex.source.dataReady = false;   // allocate only
    tex.mipmapsAutoUpdate = false;
    const at = new THREE.Vector3();
    maps.forEach((t, i) => {
      if (i === n - 1) tex.mipmapsAutoUpdate = true;   // mip chain once, after the last layer
      RENDERER.copyTextureToTexture(t, tex, null, at.set(0, 0, i));
    });
  } else tex.onUpdate = () => { tex.image.data = null; };   // the pixels live on the GPU after the first upload
  return tex;
}
let BLANK = null;
function blankArray() {
  if (!BLANK) { BLANK = new THREE.DataArrayTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, 1); BLANK.needsUpdate = true; }
  return BLANK;
}
/** maps -> { arrays: [tex0 … texN], code(map) -> array * 256 + layer } or null (more than CEL_ARRS sizes / 256 layers). */
function packMaps(maps) {
  const bySize = new Map();
  for (const t of maps) { const k = t.image.width + 'x' + t.image.height; if (!bySize.has(k)) bySize.set(k, []); bySize.get(k).push(t); }
  if (bySize.size > CEL_ARRS || [...bySize.values()].some((l) => l.length > 255)) return null;
  const classes = [...bySize.values()];
  const arrays = Array.from({ length: CEL_ARRS }, (_, i) => (classes[i] ? textureArray(classes[i]) : blankArray()));
  const code = (t) => { for (let i = 0; i < classes.length; i++) { const j = classes[i].indexOf(t); if (j >= 0) return i * 256 + j; } return -1; };
  return { arrays, code };
}

// ---- slots ----------------------------------------------------------------------------------------------------------
const _c = new THREE.Color();
function fillSlot(U, i, m, code, twoSidedDraw) {   // uSlA: alphaTest, fox ears, discard back faces, -
  const cu = m.celU;
  U.uSlC.value[i].set(m.color.r, m.color.g, m.color.b, m.opacity);
  const st = cu.uShadeTint.value;
  U.uSlT.value[i].set(st.r, st.g, st.b, KINDS[m.cel.kind] ?? 0);
  U.uSlP.value[i].copy(cu.uCelP.value);
  U.uSlQ.value[i].copy(cu.uCelQ.value);
  U.uSlG.value[i].copy(cu.uCelG.value);
  U.uSlH.value[i].copy(cu.uHairB.value);
  U.uSlS.value[i].copy(cu.uSpirit.value);
  U.uSlV.value[i].copy(cu.uCelV.value);
  if (m.emissive) _c.copy(m.emissive).multiplyScalar(m.emissiveIntensity ?? 1); else _c.setRGB(0, 0, 0);
  U.uSlE.value[i].set(_c.r, _c.g, _c.b, code);
  U.uSlA.value[i].set(m.alphaTest || 0, cu.uEarL.value.w > 0 ? 1 : 0, twoSidedDraw && m.side === THREE.FrontSide ? 1 : 0, 0);
}
function makeMaterial(slots, pack, base, o) {
  const mat = new CelMaterial({
    color: 0xffffff, transparent: base.transparent, opacity: 1, side: THREE.DoubleSide, depthWrite: base.depthWrite, depthTest: base.depthTest,
    blending: base.blending, toneMapped: base.toneMapped, fog: base.fog,
  }, { kind: 'cloth', multi: true, slots: slots.map((m) => ({ name: m.name || '', kind: m.cel.kind, garment: !!m.cel.garment })) });
  mat.forceSinglePass = !!o.singlePass;
  mat.name = 'CelMerged:' + slots.map((m) => m.name || '?').join('+');
  mat.userData.surface = 'none';
  const U = mat.celU;
  U.uHeadC.value.copy(slots[0].celU.uHeadC.value);
  const ear = slots.find((m) => m.celU.uEarL.value.w > 0);
  if (ear) { U.uEarL.value.copy(ear.celU.uEarL.value); U.uEarR.value.copy(ear.celU.uEarR.value); }
  slots.forEach((m, i) => fillSlot(U, i, m, m.map ? pack.code(m.map) : -1, true));
  pack.arrays.forEach((t, i) => { U['uCelArr' + i].value = t; });
  const defs = {};
  if (slots.some((m) => m.alphaTest > 0)) defs.CEL_ATEST = '';
  if (slots.some((m) => m.side !== THREE.DoubleSide)) defs.CEL_SIDE = '';
  mat.defines = { ...(mat.defines || {}), ...defs };
  hookMaterial(mat);
  return mat;
}

// a merged geometry from members (ATTRS + aCelS, optional morph targets by name)
const numericName = (n) => /^\d+$/.test(String(n));
function buildGeometry(list, slotOf, names) {
  const parts = [];
  let start = 0;
  const geos = list.map((o) => {
    const g = o.geometry, c = new THREE.BufferGeometry();
    for (const a of ATTRS) c.setAttribute(a, g.attributes[a]);
    const n = g.attributes.position.count;
    if (g.index) c.setIndex(g.index);
    else { const ix = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) ix[i] = i; c.setIndex(new THREE.BufferAttribute(ix, 1)); }
    const slot = slotOf(o);
    c.setAttribute('aCelS', new THREE.BufferAttribute(new Uint8Array(n).fill(slot), 1));
    const cnt = c.index.count;
    parts.push({ name: o.material.name || '', slot, start, count: cnt });
    start += cnt;
    return c;
  });
  const hz = harmonize(geos);
  if (names) {
    list.forEach((o, i) => {
      const g = o.geometry, d = o.morphTargetDictionary || {}, src = g.morphAttributes.position || [], n = g.attributes.position.count;
      hz[i].morphAttributes.position = names.map((nm) => { const k = d[nm]; return k !== undefined && src[k] ? src[k] : new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3); });
      hz[i].morphTargetsRelative = true;
    });
  }
  const merged = BGU.mergeGeometries(hz, false);
  if (!merged) throw new Error('mergeGeometries failed');
  merged.computeBoundingSphere(); merged.computeBoundingBox();
  return { geo: merged, parts };
}
// morph target names of a set (named targets only: numeric names = a merge that lost the names; such parts get zero
// deltas, as they never moved — FaceLines, docs/api/actors-look.md)
function morphNames(list) {
  const names = [];
  for (const o of list) {
    const d = o.morphTargetDictionary || {};
    for (const n of Object.keys(d).sort((a, b) => d[a] - d[b])) if (!numericName(n) && !names.includes(n)) names.push(n);
  }
  return names;
}
function view(geo, start, count) {
  const g = new THREE.BufferGeometry();
  for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  g.setIndex(geo.index);
  g.morphAttributes = geo.morphAttributes; g.morphTargetsRelative = geo.morphTargetsRelative;
  g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox;
  g.setDrawRange(start, count);
  return g;
}
function addMesh(first, geo, mat, name, lod, parts, list) {
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = name;
  mesh.position.copy(first.position); mesh.quaternion.copy(first.quaternion); mesh.scale.copy(first.scale);
  mesh.castShadow = lod === 'near' && list.some((o) => o.castShadow); mesh.receiveShadow = list.some((o) => o.receiveShadow);
  mesh.frustumCulled = first.frustumCulled; mesh.renderOrder = first.renderOrder;
  mesh.userData.proxied = list.some((o) => o.userData.proxied);
  mesh.userData.celParts = parts;
  mesh.userData.celLod = lod;
  if (lod === 'far') mesh.visible = false;
  first.parent.add(mesh);
  mesh.bind(first.skeleton, first.bindMatrix);
  return mesh;
}

/** Merge the cel parts of a loaded (not yet cloned) character. Returns { before, after } (colour draws near). */
export function mergeCelParts(root, opts = {}) {
  RENDERER = opts.renderer || null;
  root.updateMatrixWorld(true);
  const cand = [];
  root.traverse((o) => {
    if (!o.isSkinnedMesh || o.children.length || o.userData.outline || o.userData.shadowProxy || Array.isArray(o.material) || !o.visible) return;
    const m = o.material, g = o.geometry;
    if (!m?.isCelMaterial || m.cel.multi || m.emissiveMap || m.vertexColors || m.alphaMap || m.normalMap || m.blending !== THREE.NormalBlending || m.side === THREE.BackSide) return;
    if (!ATTRS.every((a) => g.attributes[a]) || g.groups.length > 1 || g.morphAttributes.normal) return;
    if (g.morphAttributes.position && !g.morphTargetsRelative) return;
    if (m.map && !(m.map.image && m.map.image.width > 0)) return;
    if (m.map && (m.map.offset.x || m.map.offset.y || m.map.repeat.x !== 1 || m.map.repeat.y !== 1 || m.map.rotation || m.map.channel)) return;
    cand.push(o);
  });
  if (!cand.length) return { before: 0, after: 0 };
  // one skeleton / bind / world transform / head centre (the biggest compatible set; the rest stays as it was)
  let set = [];
  for (const a of cand) {
    const s = cand.filter((o) => sameBones(o.skeleton, a.skeleton) && o.bindMatrix.equals(a.bindMatrix) && o.matrixWorld.equals(a.matrixWorld)
      && o.material.celU.uHeadC.value.equals(a.material.celU.uHeadC.value) && o.renderOrder === a.renderOrder);
    if (s.length > set.length) set = s;
    if (set.length > cand.length / 2) break;
  }
  // material id order = the order three drew them in (opaque sort); kept inside each merged draw
  set.sort((a, b) => a.material.id - b.material.id || a.id - b.id);
  const opaque = set.filter((o) => !o.material.transparent && o.material.depthWrite);
  const decal = set.filter((o) => o.material.transparent);
  const before = set.length;
  let after = before;
  const uniq = (l) => [...new Set(l.map((o) => o.material))];
  try { after += mergeOpaque(opaque, uniq) - opaque.length; } catch (e) { console.warn('[celmerge] body merge skipped', e); }
  try { after += mergeDecals(decal, uniq) - decal.length; } catch (e) { console.warn('[celmerge] decal merge skipped', e); }
  return { before, after };
}

function mergeOpaque(list, uniq) {
  const flat = list.filter((o) => !o.geometry.morphAttributes.position), morph = list.filter((o) => o.geometry.morphAttributes.position);
  const slots = uniq(list);
  if (list.length < 2 || slots.length > CEL_SLOTS || !flat.length) return list.length;
  const maps = [...new Set(slots.map((m) => m.map).filter(Boolean))];
  const pack = packMaps(maps);
  if (!pack) return list.length;
  const mat = makeMaterial(slots, pack, list[0].material, {});
  const slotOf = (o) => slots.indexOf(o.material);
  // body + (static) face in one geometry: the near body draws the first range, the far body all of it
  const ridingFold = morph.some(o => o.morphTargetDictionary?.sideSaddleFold !== undefined);
  const { geo, parts } = buildGeometry([...flat, ...morph], slotOf, ridingFold ? ['sideSaddleFold'] : null);
  const nFlat = parts.slice(0, flat.length).reduce((s, p) => s + p.count, 0);
  const first = flat[0];
  addMesh(first, view(geo, 0, nFlat), mat, 'cel:body', 'near', parts.slice(0, flat.length), flat);
  const far = addMesh(first, view(geo, 0, Infinity), mat, 'cel:body_far', 'far', parts, list);
  if (ridingFold) { far.morphTargetDictionary = { sideSaddleFold: 0 }; far.morphTargetInfluences = [0]; }
  let n = 1;
  if (morph.length) {
    const names = morphNames(morph);
    const fm = buildGeometry(morph, slotOf, names);
    const mesh = addMesh(first, fm.geo, mat, 'cel:face', 'near', fm.parts, morph);
    mesh.morphTargetDictionary = Object.fromEntries(names.map((nm, i) => [nm, i]));
    mesh.morphTargetInfluences = names.map(() => 0);
    n++;
  }
  for (const o of list) o.parent.remove(o);
  return n;
}

function mergeDecals(list, uniq) {
  if (list.length < 2) return list.length;
  const slots = uniq(list);
  if (slots.length > CEL_SLOTS) return list.length;
  const maps = [...new Set(slots.map((m) => m.map).filter(Boolean))];
  const pack = packMaps(maps);
  if (!pack) return list.length;
  // HairBack (no morphs) first: the far view draws only it; the face decals follow in their draw order
  const facial = o => o.geometry.morphAttributes.position && o.morphTargetDictionary?.sideSaddleFold === undefined;
  const flat = list.filter(o => !facial(o)), morph = list.filter(facial);
  const ord = [...flat, ...morph];
  const mat = makeMaterial(slots, pack, list[0].material, { singlePass: true });
  const names = morphNames(list);
  const { geo, parts } = buildGeometry(ord, (o) => slots.indexOf(o.material), names && names.length ? names : null);
  const first = ord[0];
  const near = addMesh(first, geo, mat, 'cel:decals', 'near', parts, ord);
  const infl = names && names.length ? names.map(() => 0) : null;
  const dict = infl ? Object.fromEntries(names.map((nm, i) => [nm, i])) : null;
  if (infl) { near.morphTargetDictionary = dict; near.morphTargetInfluences = infl; }
  if (flat.length) {
    const nFlat = parts.slice(0, flat.length).reduce((s, p) => s + p.count, 0);
    const far = addMesh(first, view(geo, 0, nFlat), mat, 'cel:decals_far', 'far', parts.slice(0, flat.length), flat);
    if (infl) { far.morphTargetDictionary = dict; far.morphTargetInfluences = infl.slice(); }
  }
  for (const o of list) o.parent.remove(o);
  return 1;
}

/** Parts of a merged mesh: [{ name, slot, start, count }] (index ranges). */
export function celParts(mesh) { return mesh?.userData?.celParts || []; }

/**
 * Every slot of every merged material of a model, one entry per slot and material:
 * [{ material, meshes (all meshes drawing with it: near / far views), slot, name, kind }].
 */
export function celSlotsOf(model) {
  const by = new Map();
  model.traverse((o) => {
    const m = o.isMesh && !Array.isArray(o.material) ? o.material : null;
    if (!m?.cel?.multi) return;
    if (!by.has(m)) by.set(m, []);
    by.get(m).push(o);
  });
  const out = [];
  for (const [m, meshes] of by) m.cel.slots.forEach((s, i) => out.push({ material: m, meshes, slot: i, name: s.name, kind: s.kind }));
  return out;
}

// a per-clone view of a merged geometry: same attributes / morphs, own index (parts kept by keep(part))
function geometryView(mesh, keep) {
  const src = mesh.celSrcGeo || mesh.geometry;
  const g = new THREE.BufferGeometry();
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  g.morphAttributes = src.morphAttributes; g.morphTargetsRelative = src.morphTargetsRelative;
  g.boundingSphere = src.boundingSphere; g.boundingBox = src.boundingBox;
  const ix = src.index.array, out = [];
  const end = Math.min(src.index.count, src.drawRange.start + src.drawRange.count);
  for (const p of celParts(mesh)) if (keep(p)) for (let i = p.start; i < Math.min(p.start + p.count, end); i++) out.push(ix[i]);
  g.setIndex(new THREE.BufferAttribute(new (ix.constructor)(out), 1));
  return g;
}

/** Hide the parts whose slot name matches re in this clone (other clones keep them). Returns the number hidden. */
export function hideCelParts(mesh, re) {
  const hit = celParts(mesh).filter((p) => re.test(p.name));
  if (!hit.length) return 0;
  if (!mesh.celSrcGeo) mesh.celSrcGeo = mesh.geometry;
  const hidden = mesh.celHidden || (mesh.celHidden = []);
  for (const p of hit) if (!hidden.includes(p.name)) hidden.push(p.name);
  if (mesh.geometry !== mesh.celSrcGeo) mesh.geometry.dispose();
  mesh.geometry = geometryView(mesh, (p) => !hidden.includes(p.name));
  return hit.length;
}

/** Undo hideCelParts / splitCelPart on this clone. */
export function restoreCelParts(mesh) {
  if (mesh.celSrcGeo) { mesh.geometry.dispose(); mesh.geometry = mesh.celSrcGeo; }
  mesh.celSrcGeo = null; mesh.celHidden = null;
  for (const s of mesh.celSplit || []) { s.parent?.remove(s); s.geometry.dispose(); }
  mesh.celSplit = null;
}

/**
 * Draw the parts whose slot name matches re with `material` as their own SkinnedMesh (same skeleton; morphs follow the
 * merged mesh's influences), and hide them in the merged mesh. Returns the new mesh or null.
 */
export function splitCelPart(mesh, re, material) {
  const hit = celParts(mesh).filter((p) => re.test(p.name));
  if (!hit.length) return null;
  const g = geometryView(mesh, (p) => re.test(p.name));
  hideCelParts(mesh, re);
  const s = new THREE.SkinnedMesh(g, material);
  s.name = mesh.name + ':split';
  s.position.copy(mesh.position); s.quaternion.copy(mesh.quaternion); s.scale.copy(mesh.scale);
  s.frustumCulled = mesh.frustumCulled; s.renderOrder = mesh.renderOrder;
  s.castShadow = false; s.receiveShadow = mesh.receiveShadow;
  s.visible = mesh.visible;
  s.userData.celLod = mesh.userData.celLod;
  mesh.parent.add(s);
  s.bind(mesh.skeleton, mesh.bindMatrix);
  if (mesh.morphTargetInfluences) { s.morphTargetDictionary = mesh.morphTargetDictionary; s.morphTargetInfluences = mesh.morphTargetInfluences; }
  (mesh.celSplit || (mesh.celSplit = [])).push(s);
  return s;
}
