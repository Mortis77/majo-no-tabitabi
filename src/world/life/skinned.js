// Instanced skinned animals (map round, 2026-11-22): many animated creatures in ONE draw per species.
// At boot the creature's skeleton is played through its clips on the CPU and every bone's matrix (relative to the
// model root, bind pose folded in) is written into a float texture: one row per frame, three texels per bone.
// The vertex shader blends two rows per instance (two frames of a clip, or the last frame of the old clip and the
// new one during a cross-fade) and skins with four weights. Material colours (and texture colour, sampled once on the
// CPU) are baked into vertex colours, so the whole animal is one geometry + one toon material + one depth material.
//   bakeAsset(G, id, clips)      a Quaternius-style rig from the asset catalogue (G.assets)
//   bakeProcedural(parts, clips) hand-built bodies (rabbit.js) with procedural "clips"
//   makeHerdMesh(baked, cap)     InstancedMesh with iAnim (rowA, rowB, mix, -) / iTint attributes
import * as THREE from 'three';
import { toonGradient, hookMaterial } from '../../core/mats.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

function findClip(clips, name) {
  return clips.find((c) => c.name === name) || clips.find((c) => c.name.endsWith('|' + name)) || clips.find((c) => c.name.includes(name)) || null;
}
/** CPU pixel reader for a texture image (ImageBitmap / HTMLImageElement / canvas) */
function texReader(tex) {
  try {
    const img = tex?.image; if (!img || !img.width) return null;
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, img.width, img.height).data, w = img.width, h = img.height;
    const flip = tex.flipY;
    return (u, v) => {
      let x = Math.floor(((u % 1) + 1) % 1 * w), y = Math.floor(((v % 1) + 1) % 1 * h);
      if (flip) y = h - 1 - y;
      const k = (y * w + x) * 4; const s = (q) => Math.pow(q / 255, 2.2);
      return [s(d[k]), s(d[k + 1]), s(d[k + 2])];
    };
  } catch (e) { return null; }
}

/** Bake a rigged asset. clips: { state: [clipName, fps] }. Returns null if the asset is missing. */
export function bakeAsset(G, id, clips, { tint = null } = {}) {
  const obj = G.assets?.model?.(id);
  const all = G.assets?.clips?.(id) || [];
  if (!obj || !all.length) return null;
  obj.updateMatrixWorld(true);
  let skel = null;
  obj.traverse((o) => { if (!skel && o.isSkinnedMesh) skel = o.skeleton; });
  if (!skel) return null;
  const bones = skel.bones, boneIdx = new Map(bones.map((b, i) => [b, i]));
  const rootInv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const P = [], N = [], C = [], SI = [], SW = [], I = [];
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry, pos = g.attributes.position, nrm = g.attributes.normal, col = g.attributes.color, uv = g.attributes.uv;
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    if (/outline/i.test(m0?.name || '') || /outline/i.test(o.name || '') || m0?.side === THREE.BackSide) return; // ink hulls of the cel rig
    const base = m0?.color ? m0.color : new THREE.Color(1, 1, 1);
    const read = m0?.map && uv ? texReader(m0.map) : null;
    const v0 = P.length / 3;
    let pre, map = null, rigidBone = 0;
    if (o.isSkinnedMesh) {
      pre = o.bindMatrix;
      if (o.skeleton !== skel) map = o.skeleton.bones.map((b) => boneIdx.get(b) ?? 0);
    } else {
      let p = o.parent; while (p && !boneIdx.has(p)) p = p.parent;
      rigidBone = p ? boneIdx.get(p) : 0;
      const b = bones[rigidBone];
      // pos' = boneInverse^-1 * (bone.mw^-1 * mesh.mw) * pos, so that K_b * pos' follows the bone
      _m.copy(skel.boneInverses[rigidBone]).invert();
      _m2.copy(b.matrixWorld).invert().multiply(o.matrixWorld);
      pre = new THREE.Matrix4().multiplyMatrices(_m, _m2);
    }
    _nm.getNormalMatrix(pre);
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(pre); P.push(_v.x, _v.y, _v.z);
      if (nrm) { _n.fromBufferAttribute(nrm, i).applyMatrix3(_nm).normalize(); N.push(_n.x, _n.y, _n.z); } else N.push(0, 1, 0);
      let r = base.r, gg = base.g, b = base.b;
      if (col) { r *= col.getX(i); gg *= col.getY(i); b *= col.getZ(i); }
      if (read) { const t = read(uv.getX(i), uv.getY(i)); r *= t[0]; gg *= t[1]; b *= t[2]; }
      C.push(r, gg, b);
      if (o.isSkinnedMesh && si) {
        for (let k = 0; k < 4; k++) { const j = si.getComponent(i, k); SI.push(map ? map[j] : j); SW.push(sw.getComponent(i, k)); }
      } else { SI.push(rigidBone, 0, 0, 0); SW.push(1, 0, 0, 0); }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + v0);
    else for (let i = 0; i < pos.count; i++) I.push(v0 + i);
  });
  // ---- frames
  const mixer = new THREE.AnimationMixer(obj);
  const rows = [], clipInfo = {};
  for (const [state, [name, fps]] of Object.entries(clips)) {
    const clip = findClip(all, name);
    if (!clip) continue;
    const frames = Math.max(2, Math.round(clip.duration * fps));
    clipInfo[state] = { row0: rows.length, frames, fps: frames / clip.duration, dur: clip.duration };
    mixer.stopAllAction();
    const act = mixer.clipAction(clip); act.reset(); act.play();
    for (let f = 0; f < frames; f++) {
      mixer.setTime((f / frames) * clip.duration);
      obj.updateMatrixWorld(true);
      const row = new Float32Array(bones.length * 12);
      for (let i = 0; i < bones.length; i++) {
        _m.multiplyMatrices(rootInv, bones[i].matrixWorld).multiply(skel.boneInverses[i]);
        const e = _m.elements; // column-major
        row.set([e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]], i * 12);
      }
      rows.push(row);
    }
    act.stop();
  }
  if (!rows.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aBoneIdx', new THREE.Float32BufferAttribute(SI, 4));
  geo.setAttribute('aBoneW', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(I);
  if (tint) { const c = geo.attributes.color.array; for (let i = 0; i < c.length; i += 3) { c[i] *= tint[0]; c[i + 1] *= tint[1]; c[i + 2] *= tint[2]; } }
  return finish(geo, rows, bones.length, clipInfo);
}

/**
 * Hand-built body. parts: [{ geo (BufferGeometry, rest pose), bone (index), color [r,g,b] linear }];
 * pose(state, t01) -> array of Matrix4 per bone (model space, applied to the rest geometry); clips: { state: [dur, frames] }.
 */
export function bakeProcedural(parts, nBones, pose, clips) {
  const P = [], N = [], C = [], SI = [], SW = [], I = [];
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const pos = g.attributes.position, nrm = g.attributes.normal, v0 = P.length / 3;
    for (let i = 0; i < pos.count; i++) {
      P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); N.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      const c = typeof p.color === 'function' ? p.color(pos.getX(i), pos.getY(i), pos.getZ(i)) : p.color;
      C.push(c[0], c[1], c[2]); SI.push(p.bone, 0, 0, 0); SW.push(1, 0, 0, 0); I.push(v0 + i);
    }
  }
  const rows = [], clipInfo = {};
  for (const [state, [dur, frames]] of Object.entries(clips)) {
    clipInfo[state] = { row0: rows.length, frames, fps: frames / dur, dur };
    for (let f = 0; f < frames; f++) {
      const mats = pose(state, f / frames);
      const row = new Float32Array(nBones * 12);
      for (let i = 0; i < nBones; i++) { const e = mats[i].elements; row.set([e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]], i * 12); }
      rows.push(row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aBoneIdx', new THREE.Float32BufferAttribute(SI, 4));
  geo.setAttribute('aBoneW', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(I);
  return finish(geo, rows, nBones, clipInfo);
}

function finish(geo, rows, nBones, clips) {
  const w = nBones * 3, h = rows.length;
  const data = new Float32Array(w * h * 4);
  rows.forEach((r, y) => data.set(r, y * w * 4));
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  geo.computeBoundingBox();
  const height = geo.boundingBox.max.y - Math.min(0, geo.boundingBox.min.y);
  return { geo, tex, nBones, clips, height, tris: geo.index.count / 3 };
}

const SKIN = /* glsl */`
uniform highp sampler2D uBones;
attribute vec4 aBoneIdx;
attribute vec4 aBoneW;
attribute vec4 iAnim;
attribute vec3 iTint;
mat4 herdBone(float b, float row) {
  int x = int(b) * 3, y = int(row);
  vec4 a = texelFetch(uBones, ivec2(x, y), 0), c = texelFetch(uBones, ivec2(x + 1, y), 0), d = texelFetch(uBones, ivec2(x + 2, y), 0);
  return mat4(vec4(a.x, c.x, d.x, 0.0), vec4(a.y, c.y, d.y, 0.0), vec4(a.z, c.z, d.z, 0.0), vec4(a.w, c.w, d.w, 1.0));
}
mat4 herdSkin() {
  mat4 m = mat4(0.0);
  for (int k = 0; k < 4; k++) {
    float w = aBoneW[k];
    if (w <= 0.0) continue;
    mat4 b0 = herdBone(aBoneIdx[k], iAnim.x), b1 = herdBone(aBoneIdx[k], iAnim.y);
    m += w * (b0 + (b1 - b0) * iAnim.z);
  }
  return m;
}
`;
function inject(sh, colour) {
  sh.uniforms.uBones = sh.uniforms.uBones || { value: null };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + SKIN)
    .replace('#include <beginnormal_vertex>', 'mat4 herdM = herdSkin();\nvec3 objectNormal = normalize(mat3(herdM) * normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif')
    .replace('#include <begin_vertex>', 'vec3 transformed = (herdM * vec4(position, 1.0)).xyz;');
  if (colour) sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb *= iTint;');
  else sh.vertexShader = sh.vertexShader.replace('#include <skinbase_vertex>', 'mat4 herdM = herdSkin();').replace('#include <begin_vertex>', 'vec3 transformed = (herdM * vec4(position, 1.0)).xyz;');
}

/** InstancedMesh for a baked body. Write instances with setMatrixAt + iAnim / iTint, then set count. */
export function makeHerdMesh(baked, cap, name) {
  const geo = baked.geo.clone();
  const iAnim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iTint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iAnim', iAnim); geo.setAttribute('iTint', iTint);
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), vertexColors: true });
  mat.name = 'herd-' + name;
  mat.userData.surface = 'none';
  mat.userData.look = { rim: 0.5, wrap: 0.5, shadowTint: 0.8 };
  mat.onBeforeCompile = (sh) => { sh.uniforms.uBones = { value: baked.tex }; inject(sh, true); };
  mat.customProgramCacheKey = () => 'mvHerd1';
  hookMaterial(mat);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.uBones = { value: baked.tex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SKIN)
      .replace('#include <begin_vertex>', 'mat4 herdM = herdSkin();\nvec3 transformed = (herdM * vec4(position, 1.0)).xyz;');
  };
  depth.customProgramCacheKey = () => 'mvHerdDepth1';
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.customDepthMaterial = depth;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'herd-' + name;
  mesh.userData.attrs = { iAnim, iTint };
  mesh.userData.cap = cap;
  return mesh;
}
