// Instanced skinned townsfolk and witches for the City of Magic (citylife round, 2026-11-22).
// Same idea as life/skinned.js (bone matrices of baked clips in a float texture, two rows blended per instance), plus:
//  * the journey cast GLBs are read raw (GLTFLoader, clean material names, no cel cooking), every material is sorted
//    into a costume part (skin/eyes/leather kept; robe, hat, hair, trim, hat trim recoloured per instance), so three
//    witch bodies and two townsfolk bodies give dozens of different apprentices, travelling witches, elders and
//    townspeople. Texture colour is sampled into vertex colour; the part's own light / dark detail is kept as a shade.
//  * a broom (and a parcel for delivery witches) is bound to an extra bone: on the broom in the ride states, gone on foot.
//  * three LODs per body from meshopt (near ~16k tris with eyes, mid ~5k, far ~1.3k, the face details dropped).
//  * vertex flutter of robe hems and hair while flying (per-instance amount), hats and parcels collapse per instance.
// One InstancedMesh per (body, LOD) — at most 15 draws for the whole city, shadows only from the two near LODs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { toonGradient, hookMaterial } from '../../core/mats.js';
import { broomSeat } from '../../actors/broom-contact.js';

// parts: 0 keep, 1 robe, 2 hat, 3 hair, 4 trim, 5 hat trim, 6 broom (kept colour), 7 parcel
export const PART = { keep: 0, robe: 1, hat: 2, hair: 3, trim: 4, hatTrim: 5, broom: 6, parcel: 7 };
function partOf(name) {
  if (/^Hair_/i.test(name)) return PART.hair;
  if (/hatRibbon/i.test(name)) return PART.hatTrim;
  if (/hatUnder|hatEdge|_hat$/i.test(name)) return PART.hat;
  if (/accent|sash|_edge$|gem|starDust|collar/i.test(name)) return PART.trim;
  if (/coat|skirt|lining|cape|cloak/i.test(name)) return PART.robe;
  return PART.keep;
}
const DETAIL = /^Eye|FaceEyelash|FaceMouth|Glint|EyeHighlight/i; // dropped from the mid / far LODs

// ---- baked states (shared by every body). [clip, fps, opts]
const RIGHT_ARM = /J_Bip_R_(Shoulder|UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)|J_Bip_C_(Neck|Head)/;
export const STATES = {
  ride: ['Broom_Ride_Loop', 12, { broom: true }],
  boost: ['Broom_Boost_Loop', 20, { broom: true }],
  rwave: ['Broom_Ride_Loop', 18, { broom: true, upper: 'Wave', dur: 1.7 }],
  mount: ['Broom_Mount', 24, { broom: true }],
  dismount: ['Broom_Dismount', 24, { broom: true }],
  idle: ['Idle_Loop', 10],
  walk: ['Walk_Loop', 24],
  jog: ['Jog_Fwd_Loop', 24],
  talk: ['Idle_Talking_Loop', 10],
  listen: ['Idle_FoldArms_Loop', 8],
  rail: ['Idle_Rail_Loop', 10],
  call: ['Idle_Rail_Call', 12],
  lookup: ['Idle_Loop', 8, { look: -0.62 }],
  wave: ['Wave', 18],
  carry: ['Walk_Carry_Loop', 18],
};

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3();

function texReader(tex) {
  try {
    const img = tex?.image; if (!img || !img.width) return null;
    const w = Math.min(512, img.width), h = Math.min(512, img.height);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data, flip = tex.flipY;
    return (u, v) => {
      const x = Math.floor((((u % 1) + 1) % 1) * w); let y = Math.floor((((v % 1) + 1) % 1) * h);
      if (flip) y = h - 1 - y;
      const k = (y * w + x) * 4, s = (q) => Math.pow(q / 255, 2.2);
      return [s(d[k]), s(d[k + 1]), s(d[k + 2])];
    };
  } catch (e) { return null; }
}
const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

/** Simple broom (+ parcel) along +Z, seat at broomSeat, in rig space. detail 0 (near) / 1 (far). */
function broomParts(detail) {
  const seg = detail ? 5 : 10, out = [];
  const shaft = new THREE.CylinderGeometry(0.021, 0.019, 1.2, seg, 1).rotateX(Math.PI / 2).translate(0, 0, 0.13);
  const brush = new THREE.CylinderGeometry(0.035, 0.13, 0.62, seg + 2, 2).rotateX(-Math.PI / 2).translate(0, 0.02, -0.78);
  const band = new THREE.CylinderGeometry(0.04, 0.04, 0.05, seg, 1).rotateX(Math.PI / 2).translate(0, 0.0, -0.47);
  const parcel = new THREE.BoxGeometry(0.34, 0.24, 0.3).translate(0, 0.2, -0.72);
  const strap = new THREE.BoxGeometry(0.36, 0.25, 0.04).translate(0, 0.2, -0.72);
  for (const [g, col, part] of [[shaft, [0.36, 0.21, 0.12], PART.broom], [brush, [0.55, 0.38, 0.2], PART.broom], [band, [0.42, 0.12, 0.08], PART.broom], [parcel, [0.62, 0.42, 0.24], PART.parcel], [strap, [0.25, 0.12, 0.08], PART.parcel]]) {
    g.translate(broomSeat[0], broomSeat[1] - 0.02, broomSeat[2]);
    out.push({ g: g.index ? g.toNonIndexed() : g, col, part });
  }
  return out;
}

let simplifierReady = null;

/**
 * Load + bake one humanoid. Returns { geos: [lod0, lod1, lod2], tex, clips, nBones, tris: [..], height } or null.
 */
export async function bakeHumanoid(G, id) {
  const info = G.assets?.info?.(id);
  if (!info?.file) return null;
  const libs = [].concat(G.assets?.clips?.('anim_ual') || [], G.assets?.clips?.('anim_miko') || []);
  if (!libs.length) return null;
  simplifierReady ??= MeshoptSimplifier.ready;
  const gltf = await new GLTFLoader().loadAsync('assets/' + info.file);
  await simplifierReady;
  const obj = gltf.scene;
  obj.scale.setScalar(info.scale || 1);
  obj.updateMatrixWorld(true);
  let skel = null;
  obj.traverse((o) => { if (!skel && o.isSkinnedMesh) skel = o.skeleton; });
  if (!skel) return null;
  const bones = skel.bones, nB = bones.length, broomBone = nB, boneIdx = new Map(bones.map((b, i) => [b, i]));
  const byName = new Map(bones.map((b) => [b.name, b]));
  const rootInv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const P = [], N = [], C = [], SI = [], SW = [], PS = [], Ifull = [], Ilod = [];
  const texCache = new Map();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position || !o.visible) return;
    const g = o.geometry, pos = g.attributes.position, nrm = g.attributes.normal, col = g.attributes.color, uv = g.attributes.uv;
    const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
    const name = m0?.name || o.name || '';
    if (m0?.side === THREE.BackSide || /outline/i.test(name)) return;
    const part = partOf(name), detail = DETAIL.test(name);
    const base = m0?.color || new THREE.Color(1, 1, 1);
    let read = null;
    if (m0?.map && uv) { if (!texCache.has(m0.map)) texCache.set(m0.map, texReader(m0.map)); read = texCache.get(m0.map); }
    const v0 = P.length / 3;
    let pre, map = null, rigid = 0;
    if (o.isSkinnedMesh) { pre = o.bindMatrix; if (o.skeleton !== skel) map = o.skeleton.bones.map((b) => boneIdx.get(byName.get(b.name)) ?? 0); }
    else {
      let p = o.parent; while (p && !boneIdx.has(p)) p = p.parent;
      rigid = p ? boneIdx.get(p) : 0;
      _m.copy(skel.boneInverses[rigid]).invert();
      _m2.copy(bones[rigid].matrixWorld).invert().multiply(o.matrixWorld);
      pre = new THREE.Matrix4().multiplyMatrices(_m, _m2);
    }
    _nm.getNormalMatrix(pre);
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const cols = [];
    let lsum = 0;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(pre); P.push(_v.x, _v.y, _v.z);
      if (nrm) { _n.fromBufferAttribute(nrm, i).applyMatrix3(_nm).normalize(); N.push(_n.x, _n.y, _n.z); } else N.push(0, 1, 0);
      let r = base.r, gg = base.g, b = base.b;
      if (col) { r *= col.getX(i); gg *= col.getY(i); b *= col.getZ(i); }
      if (read) { const t = read(uv.getX(i), uv.getY(i)); r *= t[0]; gg *= t[1]; b *= t[2]; }
      C.push(r, gg, b); cols.push(lum(r, gg, b)); lsum += lum(r, gg, b);
      if (o.isSkinnedMesh && si) for (let k = 0; k < 4; k++) { const j = si.getComponent(i, k); SI.push(map ? map[j] : j); SW.push(sw.getComponent(i, k)); }
      else { SI.push(rigid, 0, 0, 0); SW.push(1, 0, 0, 0); }
    }
    const mean = Math.max(0.02, lsum / Math.max(1, pos.count));
    for (let i = 0; i < pos.count; i++) PS.push(part, Math.min(1.7, Math.max(0.35, cols[i] / mean)));
    const push = (k) => { Ifull.push(k); if (!detail) Ilod.push(k); };
    if (g.index) for (let i = 0; i < g.index.count; i++) push(g.index.getX(i) + v0);
    else for (let i = 0; i < pos.count; i++) push(v0 + i);
  });
  for (const t of texCache.keys()) { try { t.image?.close?.(); t.dispose(); } catch { /* */ } }
  // facing: VRoid exports may face -Z; the game's rigs face +Z
  const toe = byName.get('J_Bip_L_ToeBase'), foot = byName.get('J_Bip_L_Foot');
  let flip = false;
  if (toe && foot) { const a = new THREE.Vector3().setFromMatrixPosition(toe.matrixWorld), b = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld); flip = a.z < b.z; }
  // ---- broom / parcel at two detail levels (bound to the extra bone)
  const extra = [[], []];
  for (let d = 0; d < 2; d++) for (const bp of broomParts(d)) {
    const pos = bp.g.attributes.position, nrm = bp.g.attributes.normal, v0 = P.length / 3;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), z = pos.getZ(i), nx = nrm.getX(i), nz = nrm.getZ(i);
      if (flip) { x = -x; z = -z; nx = -nx; nz = -nz; } // undone with the body below so the broom stays +Z in rig space
      P.push(x, pos.getY(i), z); N.push(nx, nrm.getY(i), nz); C.push(...bp.col); SI.push(broomBone, 0, 0, 0); SW.push(1, 0, 0, 0);
      PS.push(bp.part, 1); extra[d].push(v0 + i);
    }
  }
  // ---- frames
  const mixer = new THREE.AnimationMixer(obj);
  const nodeNames = new Set(); obj.traverse((o) => o.name && nodeNames.add(o.name));
  const findClip = (nm) => libs.find((c) => c.name === nm) || libs.find((c) => c.name.endsWith('|' + nm)) || null;
  const clean = (clip) => { const c = clip.clone(); c.tracks = c.tracks.filter((tr) => nodeNames.has(tr.name.slice(0, tr.name.lastIndexOf('.')))); return c; };
  const rows = [], clips = {};
  const head = byName.get('J_Bip_C_Head'), neck = byName.get('J_Bip_C_Neck');
  for (const [state, [name, fps, opt = {}]] of Object.entries(STATES)) {
    const src = findClip(name);
    if (!src) continue;
    let clip = clean(src);
    if (opt.upper) {
      const up = findClip(opt.upper);
      if (up) {
        const u = clean(up);
        clip.tracks = clip.tracks.filter((t) => !RIGHT_ARM.test(t.name)).concat(u.tracks.filter((t) => RIGHT_ARM.test(t.name)));
        clip.duration = opt.dur || u.duration;
      }
    }
    const dur = opt.dur || clip.duration;
    const frames = Math.max(2, Math.round(dur * fps));
    clips[state] = { row0: rows.length, frames, fps: frames / dur, dur, broom: !!opt.broom };
    mixer.stopAllAction();
    const act = mixer.clipAction(clip); act.reset(); act.play();
    for (let f = 0; f < frames; f++) {
      mixer.setTime(((f / frames) * dur) % Math.max(0.001, clip.duration));
      const nq = neck?.quaternion.clone(), hq = head?.quaternion.clone();
      if (opt.look && neck && head) {
        // look up at the sky (flyers passing over): pitch the neck and head back about their local X
        _ax.set(1, 0, 0);
        _q.setFromAxisAngle(_ax, opt.look * 0.45); neck.quaternion.multiply(_q);
        _q.setFromAxisAngle(_ax, opt.look * 0.55); head.quaternion.multiply(_q);
      }
      obj.updateMatrixWorld(true);
      const row = new Float32Array((nB + 1) * 12);
      for (let i = 0; i < nB; i++) {
        _m.multiplyMatrices(rootInv, bones[i].matrixWorld).multiply(skel.boneInverses[i]);
        if (flip) _m.premultiply(_m2.makeRotationY(Math.PI));
        const e = _m.elements;
        row.set([e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14]], i * 12);
      }
      // broom bone: identity (with the flip undone) when riding, collapsed on foot
      const s = opt.broom ? 1 : 0;
      if (flip) row.set([-s, 0, 0, 0, 0, s, 0, 0, 0, 0, -s, 0], nB * 12);
      else row.set([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0], nB * 12);
      rows.push(row);
      if (opt.look && neck && head) { neck.quaternion.copy(nq); head.quaternion.copy(hq); }
    }
    act.stop();
    mixer.uncacheClip(clip);
  }
  if (!rows.length || !clips.idle) return null;
  // ---- texture
  const w = (nB + 1) * 3, h = rows.length, data = new Float32Array(w * h * 4);
  rows.forEach((r, y) => data.set(r, y * w * 4));
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  // ---- shared vertex attributes + three index sets
  const pos = new Float32Array(P);
  const attrs = {
    position: new THREE.BufferAttribute(pos, 3), normal: new THREE.Float32BufferAttribute(N, 3), color: new THREE.Float32BufferAttribute(C, 3),
    aBoneIdx: new THREE.Float32BufferAttribute(SI, 4), aBoneW: new THREE.Float32BufferAttribute(SW, 4), aPS: new THREE.Float32BufferAttribute(PS, 2),
  };
  const simp = (idx, tris, err) => {
    const src = new Uint32Array(idx);
    let [out] = MeshoptSimplifier.simplify(src, pos, 3, Math.min(src.length, tris * 3), err, []);
    if (out.length > tris * 3 * 1.6) [out] = MeshoptSimplifier.simplifySloppy(src, pos, 3, null, tris * 3, err * 4);
    return out;
  };
  const lodIdx = [simp(Ifull, 16000, 0.004), simp(Ilod, 3600, 0.03), simp(Ilod, 1000, 0.08)];
  const geos = lodIdx.map((ix, l) => {
    const g = new THREE.BufferGeometry();
    for (const k in attrs) g.setAttribute(k, attrs[k]);
    const all = new Uint32Array(ix.length + extra[l ? 1 : 0].length);
    all.set(ix); all.set(extra[l ? 1 : 0], ix.length);
    g.setIndex(new THREE.BufferAttribute(all, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2);
    return g;
  });
  // dispose the raw load
  obj.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m?.dispose?.(); } });
  return { id, geos, tex, clips, nBones: nB + 1, tris: geos.map((g) => g.index.count / 3) };
}

const SKIN = /* glsl */`
uniform highp sampler2D uBones;
uniform float uTime;
attribute vec4 aBoneIdx;
attribute vec4 aBoneW;
attribute vec2 aPS;
attribute vec4 iAnim;
attribute vec4 iPalA;
attribute vec4 iPalB;
attribute vec4 iPalC;
attribute vec4 iPalD;
mat4 cbBone(float b, float row) {
  int x = int(b) * 3, y = int(row);
  vec4 a = texelFetch(uBones, ivec2(x, y), 0), c = texelFetch(uBones, ivec2(x + 1, y), 0), d = texelFetch(uBones, ivec2(x + 2, y), 0);
  return mat4(vec4(a.x, c.x, d.x, 0.0), vec4(a.y, c.y, d.y, 0.0), vec4(a.z, c.z, d.z, 0.0), vec4(a.w, c.w, d.w, 1.0));
}
mat4 cbSkin() {
  mat4 m = mat4(0.0);
  for (int k = 0; k < 4; k++) {
    float w = aBoneW[k];
    if (w <= 0.0) continue;
    mat4 b0 = cbBone(aBoneIdx[k], iAnim.x), b1 = cbBone(aBoneIdx[k], iAnim.y);
    m += w * (b0 + (b1 - b0) * iAnim.z);
  }
  return m;
}
vec3 cbPose(mat4 M) {
  vec3 p = (M * vec4(position, 1.0)).xyz;
  float part = aPS.x;
  float flags = iPalA.w;
  bool hatless = mod(flags, 2.0) > 0.5, parcel = mod(floor(flags / 2.0), 2.0) > 0.5;
  if ((hatless && (abs(part - 2.0) < 0.5 || abs(part - 5.0) < 0.5)) || (!parcel && abs(part - 7.0) < 0.5)) return vec3(0.0, 1.0, 0.0);
  float fl = iPalB.w;
  if (fl > 0.001 && (abs(part - 1.0) < 0.5 || abs(part - 3.0) < 0.5)) {
    float w = abs(part - 1.0) < 0.5 ? clamp((0.95 - position.y) / 0.75, 0.0, 1.0) : clamp((1.5 - position.y) / 0.55, 0.0, 1.0);
    float ph = uTime * 11.0 + position.y * 9.0 + position.x * 6.0 + iAnim.w * 6.283;
    p += vec3(sin(ph) * 0.03, sin(ph * 1.37) * 0.018, -0.11 - 0.04 * sin(ph * 0.71)) * (w * w * fl);
  }
  return p;
}
`;

/** InstancedMesh of one body at one LOD. */
export function makeBodyMesh(baked, lod, cap, uTime) {
  const geo = baked.geos[lod].clone(); // shares the vertex buffers
  const inst = {};
  for (const [k, n] of [['iAnim', 4], ['iPalA', 4], ['iPalB', 4], ['iPalC', 4], ['iPalD', 4]]) {
    inst[k] = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(k, inst[k]);
  }
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), vertexColors: true });
  mat.name = 'citybody-' + baked.id + '-' + lod;
  mat.userData.surface = 'none';
  mat.userData.look = { rim: 0.5, wrap: 0.5, shadowTint: 0.8 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBones = { value: baked.tex }; sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN)
      .replace('#include <beginnormal_vertex>', 'mat4 cbM = cbSkin();\nvec3 objectNormal = normalize(mat3(cbM) * normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = cbPose(cbM);')
      .replace('#include <color_vertex>', `#include <color_vertex>
        {
          float pt = aPS.x;
          vec3 pal = vec3(-1.0);
          if (abs(pt - 1.0) < 0.5) pal = iPalA.rgb;
          else if (abs(pt - 2.0) < 0.5) pal = iPalB.rgb;
          else if (abs(pt - 3.0) < 0.5) pal = iPalC.rgb;
          else if (abs(pt - 4.0) < 0.5 || abs(pt - 5.0) < 0.5) pal = iPalD.rgb;
          if (pal.x >= 0.0) vColor.rgb = pal * aPS.y;
        }`);
  };
  mat.customProgramCacheKey = () => 'cityBody1';
  hookMaterial(mat);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.uBones = { value: baked.tex }; sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SKIN)
      .replace('#include <begin_vertex>', 'mat4 cbM = cbSkin();\nvec3 transformed = cbPose(cbM);');
  };
  depth.customProgramCacheKey = () => 'cityBodyDepth1';
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.customDepthMaterial = depth;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = lod < 2; mesh.receiveShadow = true;
  mesh.name = 'citybody-' + baked.id + '-' + lod;
  mesh.userData.inst = inst; mesh.userData.cap = cap;
  return mesh;
}

/**
 * The writer every city agent draws through. begin() each frame, put(...) per visible agent, end().
 * LOD by camera distance with per-LOD caps (overflow is demoted one LOD).
 */
export function createBodyPool(root, bodies, tier = 1) {
  const uTime = { value: 0 };
  const CAP = [4, 24, 110];
  // whole-city budgets for the two near LODs (the LOD distances adapt to keep within them)
  const BUDGET = [tier < 0.5 ? 2 : 4, tier < 0.5 ? 12 : 24];
  const used = [0, 0], asked = [0, 0];
  const meshes = bodies.map((b) => (b ? CAP.map((c, l) => { const m = makeBodyMesh(b, l, c, uTime); root.add(m); return m; }) : null));
  const counts = bodies.map(() => [0, 0, 0]);
  const _o = new THREE.Object3D(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  let tris = 0;
  function rows(info, t) {
    const f = ((t * info.fps) % info.frames + info.frames) % info.frames, i = Math.floor(f);
    return [info.row0 + i, info.row0 + ((i + 1) % info.frames), f - i];
  }
  return {
    meshes, uTime,
    lod0: 14, lod1: 55,
    /** LOD for a camera distance (adaptive thresholds) */
    lodOf(d) { return d < this.lod0 ? 0 : d < this.lod1 ? 1 : 2; },
    begin(time) { uTime.value = time; tris = 0; for (const c of counts) c[0] = c[1] = c[2] = 0; used[0] = used[1] = asked[0] = asked[1] = 0; },
    /** a: { body, x, y, z, yaw, pitch, bank, scale, clip, clipT, prev, prevT, fade, pal: [4 x [r,g,b]], flags, flutter, seed } */
    put(a, lod) {
      const M = meshes[a.body], b = bodies[a.body];
      if (!M) return false;
      const c = counts[a.body];
      if (lod < 2) asked[lod]++;
      while (lod < 2 && (c[lod] >= CAP[lod] || used[lod] >= BUDGET[lod])) lod++;
      if (lod < 2) used[lod]++;
      if (c[lod] >= CAP[lod]) return false;
      const i = c[lod]++, m = M[lod], I = m.userData.inst;
      _o.position.set(a.x, a.y, a.z);
      _e.set(a.pitch || 0, a.yaw || 0, a.bank || 0, 'YXZ');
      _o.quaternion.setFromEuler(_e);
      _o.scale.setScalar(a.scale * a.s * (a._boost || 1));
      _o.updateMatrix();
      m.setMatrixAt(i, _o.matrix);
      const C = b.clips, cur = C[a.clip] || C.idle;
      if (a.fade < 1 && a.prev && C[a.prev]) { const p = rows(C[a.prev], a.prevT), q = rows(cur, a.clipT); I.iAnim.setXYZW(i, p[0], q[0], a.fade, a.seed); }
      else { const q = rows(cur, a.clipT); I.iAnim.setXYZW(i, q[0], q[1], q[2], a.seed); }
      const p = a.pal;
      I.iPalA.setXYZW(i, p[0][0], p[0][1], p[0][2], a.flags);
      I.iPalB.setXYZW(i, p[1][0], p[1][1], p[1][2], a.flutter || 0);
      I.iPalC.setXYZW(i, p[2][0], p[2][1], p[2][2], 0);
      I.iPalD.setXYZW(i, p[3][0], p[3][1], p[3][2], 0);
      tris += b.tris[lod];
      return true;
    },
    end() {
      let draws = 0;
      meshes.forEach((M, k) => {
        if (!M) return;
        for (let l = 0; l < 3; l++) {
          const m = M[l], n = counts[k][l];
          m.count = n; m.visible = n > 0;
          if (!n) continue;
          draws++;
          m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true;
          for (const key in m.userData.inst) { const at = m.userData.inst[key]; at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true; }
        }
      });
      this.draws = draws; this.tris = tris;
      // adapt: shrink a near-LOD radius while more agents ask for it than the budget, regrow slowly
      if (asked[0] > BUDGET[0]) this.lod0 = Math.max(5, this.lod0 * 0.93); else if (asked[0] < BUDGET[0] * 0.6) this.lod0 = Math.min(14, this.lod0 * 1.02);
      if (asked[1] > BUDGET[1]) this.lod1 = Math.max(this.lod0 + 5, this.lod1 * 0.95); else if (asked[1] < BUDGET[1] * 0.6) this.lod1 = Math.min(55, this.lod1 * 1.02);
    },
    hide() { for (const M of meshes) if (M) for (const m of M) { m.count = 0; m.visible = false; } this.draws = 0; this.tris = 0; },
    counts, draws: 0, tris: 0,
  };
}
