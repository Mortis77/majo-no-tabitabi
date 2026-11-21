// Shared meshes and materials of the spell system: instanced projectile bodies (one draw call per shape), the paper
// charm texture, rock pillar / crane / shield / dome / light-pillar / tornado geometry and their glowing materials.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { flat, toon, PAL } from '../core/mats.js';
import { hash2 } from '../core/util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(0, 0, 1);

/** One instanced batch: add(pos, quat, scale, color) every frame between begin() and end(). */
function batch(geo, mat, max) {
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, _c.set(1, 1, 1));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 2;
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    add(pos, quat, sx, sy, sz, color, k = 1) {
      if (n >= max) return;
      _s.set(sx, sy ?? sx, sz ?? sx);
      _m.compose(pos, quat || _q.identity(), _s);
      mesh.setMatrixAt(n, _m);
      _c.set(color).multiplyScalar(k);
      mesh.setColorAt(n, _c);
      n++;
    },
    end() {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

function charmTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff8e6'; x.fillRect(4, 2, 56, 124);
  x.strokeStyle = '#d8362c'; x.lineWidth = 4; x.strokeRect(9, 8, 46, 112);
  x.lineWidth = 5; x.beginPath();
  x.moveTo(32, 20); x.lineTo(32, 104); x.moveTo(18, 38); x.lineTo(46, 38); x.moveTo(20, 62); x.lineTo(44, 74);
  x.moveTo(44, 62); x.lineTo(20, 74); x.stroke();
  x.fillStyle = '#d8362c'; x.beginPath(); x.arc(32, 92, 8, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Vertical stripe texture for tornado / light pillar (white on transparent). */
function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const s = 0.5 + 0.5 * Math.sin((i / 128) * Math.PI * 8 + Math.sin(j / 128 * Math.PI * 2) * 2.2);
    const n = hash2(i >> 2, j >> 3);
    const a = Math.pow(s, 3) * (0.55 + 0.45 * n);
    const k = (j * 128 + i) * 4;
    g.data[k] = g.data[k + 1] = g.data[k + 2] = 255; g.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(g, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Additive fresnel shell (shield, time dome). uniforms: uColor, uTime, uAlpha, uHex (0..1 hex pattern) */
function fresnelMaterial(color, { hex = 0, rings = 0, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uAlpha: { value: 1 }, uHex: { value: hex }, uRings: { value: rings } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = position;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uHex; uniform float uRings;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float f = 1.0 - abs(dot(normalize(vN + vec3(0.0, 1e-5, 0.0)), normalize(vV)));
        float rim = pow(clamp(f, 0.001, 1.0), 2.2);
        vec2 h = vP.xy * 3.2 + vec2(vP.z * 1.7, 0.0);
        vec2 q = abs(fract(h) - 0.5);
        float hexl = 1.0 - smoothstep(0.0, 0.08, abs(max(q.x * 1.15 + q.y * 0.58, q.y * 1.15) - 0.42));
        float ring = clamp(0.5 + 0.5 * sin(vP.y * 2.6 - uTime * 2.0), 0.0, 1.0);
        float a = 0.035 + rim * 0.75 + uHex * hexl * 0.22 + uRings * pow(ring, 8.0) * 0.25;
        gl_FragColor = vec4(uColor * clamp(a * uAlpha, 0.0, 4.0), 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side, toneMapped: false,
  });
}

/** Scrolling additive texture material (tornado bands, light pillar). */
function scrollMaterial(tex, color, strength = 2) {
  const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(strength), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  return m;
}

/** Rock pillar geometry: a jittered 7-sided prism, base at y=0, height 1 (scale y), radius 1. */
function pillarGeometry() {
  const g = new THREE.CylinderGeometry(0.88, 1.05, 1, 7, 4);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const j = 1 + (hash2(Math.round(a * 10), Math.round(y * 8)) - 0.5) * 0.22;
    if (Math.hypot(x, z) > 0.01) { p.setX(i, x * j); p.setZ(i, z * j); }
    if (y > 0.99) p.setY(i, 1 + (hash2(Math.round(x * 9), Math.round(z * 9)) - 0.5) * 0.06);
  }
  g.computeVertexNormals();
  // strata: dark wet base, warm earthy middle, pale weathered rim, mossy cap
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color(), base = new THREE.Color(0x5b534f), mid = new THREE.Color(0x9a8c7c), rim = new THREE.Color(0xc4b8a4), moss = new THREE.Color(0x7d9a52);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0.995 && Math.hypot(p.getX(i), p.getZ(i)) < 0.8) c.copy(moss);
    else if (y > 0.9) c.copy(rim);
    else c.copy(base).lerp(mid, Math.min(1, y * 1.3));
    const n = hash2(Math.round(y * 9), i % 7) * 0.12 - 0.06;
    col[i * 3] = c.r + n; col[i * 3 + 1] = c.g + n; col[i * 3 + 2] = c.b + n;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Ice dais: hex slab (radius 1, height 1, base y=0) plus a crown of spikes. */
function daisGeometry() {
  const parts = [];
  const slab = new THREE.CylinderGeometry(1, 1.12, 1, 6, 1); slab.translate(0, 0.5, 0); parts.push(slab);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const h = 0.9 + hash2(i, 7) * 1.4;
    const c = new THREE.ConeGeometry(0.07 + hash2(i, 3) * 0.05, h, 5);
    c.translate(0, h / 2, 0);
    c.rotateZ((hash2(i, 9) - 0.5) * 0.5); c.rotateX(0.35);
    c.rotateY(-a);
    c.translate(Math.cos(a) * 1.0, 0.7, Math.sin(a) * 1.0);
    parts.push(c);
  }
  const merged = mergeGeos(parts);
  merged.computeVertexNormals();
  return merged;
}

function mergeGeos(list) {
  let count = 0;
  const nonIdx = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of nonIdx) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  let o = 0;
  for (const g of nonIdx) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return out;
}

/** Paper crane: body + two wings (wings are separate meshes so they can flap). Returns { group, wingL, wingR }. */
export function makeCrane(mat, accent) {
  const group = new THREE.Group();
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    // keel (two triangles), neck, tail
    0, 0, 0.32, 0, -0.08, 0, 0, 0.06, 0,
    0, 0.06, 0, 0, -0.08, 0, 0, 0, -0.3,
    0, 0.04, 0.18, 0, 0.2, 0.42, 0, 0.0, 0.3,
    0, 0.02, -0.16, 0, 0.18, -0.4, 0, 0.0, -0.26,
  ]), 3));
  body.computeVertexNormals();
  const b = new THREE.Mesh(body, mat); group.add(b);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), accent);
  beak.position.set(0, 0.21, 0.45); beak.rotation.x = Math.PI / 2; group.add(beak);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.12, 0, 0, -0.12, 0.42, 0.02, -0.04]), 3));
  wingGeo.computeVertexNormals();
  const wingL = new THREE.Mesh(wingGeo, mat); wingL.position.set(0.0, 0.05, 0);
  const wingR = new THREE.Mesh(wingGeo, mat); wingR.position.set(0.0, 0.05, 0); wingR.scale.x = -1;
  group.add(wingL, wingR);
  for (const m of [b, wingL, wingR, beak]) { m.castShadow = true; }
  return { group, wingL, wingR };
}

// ---- 岩起 sculpted columns + rubble skirt (install-actors round; .tmp/sculpt/earth_column_a/INSTALL.md) -----------------
// G.sculpt 'earth_column' (?sculpt=0 = the old prism). Each is a THREE.LOD of the GLB's own nodes (shared geometry and
// materials across casts): LOD0 = colour atlas + object-space normal map near, LOD1 = vertex colours beyond — one draw
// either way, as the old pillar. Scale 1, metres; pivot = the column axis at ground level.
const COLUMN_IDS = ['sculpt_earth_column_a', 'sculpt_earth_column_b', 'sculpt_earth_column_c'];
const COLUMN_NEAR = 20, RUBBLE_NEAR = 20;
function sculptLod(id, near, far = Infinity) {
  if (!G.sculpt?.on('earth_column') || !G.assets?.ready?.(id)) return null;
  const sc = G.assets.model(id);
  if (!sc) return null;
  const pick = (k) => { let r = null; sc.traverse((o) => { if (!r && o.isMesh && new RegExp('_LOD' + k + '$').test(o.name)) r = o; }); return r; };
  const l0 = pick(0), l1 = pick(1);
  if (!l0) return null;
  const lod = new THREE.LOD(); lod.name = id;
  for (const m of [l0, l1]) if (m) { m.removeFromParent(); m.position.set(0, 0, 0); m.castShadow = true; m.receiveShadow = true; }
  lod.addLevel(l0, 0);
  if (l1) lod.addLevel(l1, near);
  // the rubble is a ground skirt: nothing at all beyond `far` (no draw added at distance)
  if (far < Infinity) lod.addLevel(new THREE.Object3D(), far);
  return lod;
}
/** A random column variant: a holder that behaves like the old pillar mesh (pivot at its base, 0.6 m below the ground). */
function sculptColumn() {
  const lod = sculptLod(COLUMN_IDS[Math.floor(Math.random() * COLUMN_IDS.length)], COLUMN_NEAR);
  if (!lod) return null;
  const holder = new THREE.Group(); holder.name = 'earthColumn';
  lod.position.y = 0.6;
  holder.add(lod);
  return holder;
}
/** The rubble skirt laid around a column's foot (no collider; LOD0 near, nothing far). */
function sculptRubble() {
  const lod = sculptLod('sculpt_earth_rubble', RUBBLE_NEAR, RUBBLE_NEAR);
  if (!lod) return null;
  // low plates: they take the column's shadow but cast none (no extra shadow draws)
  lod.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return lod;
}

export function createVisuals(scene) {
  const V = {};
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const charmMat = new THREE.MeshBasicMaterial({ map: charmTexture(), side: THREE.DoubleSide, alphaTest: 0.3, toneMapped: false });
  charmMat.color.setScalar(1.25);
  const lanceMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  V.orbs = batch(new THREE.IcosahedronGeometry(1, 2), orbMat, 128);
  V.halos = batch(new THREE.IcosahedronGeometry(1, 2), haloMat, 128);
  const lg = new THREE.OctahedronGeometry(1, 0); lg.scale(0.22, 0.22, 1);
  V.lances = batch(lg, lanceMat, 48);
  V.charms = batch(new THREE.PlaneGeometry(0.2, 0.38), charmMat, 64);
  for (const b of [V.halos, V.orbs, V.lances, V.charms]) scene.add(b.mesh);
  V.halos.mesh.renderOrder = 3;

  V.pillarGeo = pillarGeometry();
  V.pillarMat = flat(0xffffff, { vertexColors: true });
  V.sculptColumn = sculptColumn; V.sculptRubble = sculptRubble;
  // boot warm-up (render/warmup.js compiles hidden objects too): one hidden column + rubble so their programs (atlas +
  // object-space normal map, vertex-colour LOD) are built at boot, not on the first cast
  const wc = sculptColumn(), wr = sculptRubble();
  for (const w of [wc, wr]) if (w) { w.visible = false; w.position.set(0, -500, 0); w.name = 'sculpt:warm:' + w.name; scene.add(w); }
  V.rockMat = flat(PAL.rock);
  V.pillarTopMat = flat(0x8a7f6c);
  V.daisGeo = daisGeometry();
  V.iceMat = flat(0xbfe9ff, { transparent: true, opacity: 0.86, emissive: 0x2a6f9a, emissiveIntensity: 0.35 });
  V.meteorGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = V.meteorGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.85 + hash2(Math.round(p.getX(i) * 7), Math.round(p.getY(i) * 7 + p.getZ(i) * 3)) * 0.3;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    V.meteorGeo.computeVertexNormals();
  }
  V.meteorMat = flat(0x3a2a2a, { emissive: 0xff5a1a, emissiveIntensity: 0.55 });
  V.craneMat = toon(PAL.paper, { side: THREE.DoubleSide });
  V.craneAccent = toon(PAL.mikoRed);
  V.stripes = stripeTexture();
  V.fresnel = fresnelMaterial;
  V.scroll = scrollMaterial;
  V.lightOrbGeo = new THREE.IcosahedronGeometry(0.55, 2);
  V.domeGeo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5);
  V.shieldGeo = new THREE.SphereGeometry(1.25, 28, 16, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.12, Math.PI * 0.68);
  V.shieldGeo.rotateY(Math.PI / 2); // the arc bulges toward +z (forward)
  V.tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true); V.tubeGeo.translate(0, 0.5, 0);
  V.funnelGeo = new THREE.CylinderGeometry(1, 0.22, 1, 28, 6, true); V.funnelGeo.translate(0, 0.5, 0);
  V.ringGeo = new THREE.TorusGeometry(1, 0.025, 6, 64); V.ringGeo.rotateX(Math.PI / 2);

  /** Orient quat so +z points along dir. */
  V.look = (quat, dir) => {
    const l = dir.length();
    if (l < 1e-5) return quat.identity();
    _s.copy(dir).divideScalar(l);
    return quat.setFromUnitVectors(_z, _s);
  };
  V.begin = () => { V.orbs.begin(); V.halos.begin(); V.lances.begin(); V.charms.begin(); };
  V.end = () => { V.orbs.end(); V.halos.end(); V.lances.end(); V.charms.end(); };
  V.up = _up;
  return V;
}

/** Self-check of the GL-side materials (used in tests). */
export function visualsReady() { return !!G.scene; }
