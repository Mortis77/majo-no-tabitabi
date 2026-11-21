// Instanced wind-bent fire volumes for burning ground cells and reactors. Crackling sparks on shocked reactors, frost shells on frozen
// ones, and a small pool of flickering point lights parked on the fires nearest the camera. Smoke and embers go through
// G.fx emitters when the fx system is present.
import * as THREE from 'three';
import { createFireSurfaces } from './fireSurface.js';
import { G } from '../core/game.js';
import { hookMaterial } from '../core/mats.js';
import { hash2, smoothstep } from '../core/util.js';
import { MAX_FLAMES, MAX_FIRE_LIGHTS } from './consts.js';

const VS = /* glsl */`
attribute vec4 aPos;    // base xyz, seed
attribute vec4 aSize;   // width, height, heat 0..1, type (0 flame, 1 spark)
uniform vec2 uWind;
varying vec2 vUv; varying float vSeed; varying float vHeat; varying float vType;
#include <fog_pars_vertex>
void main() {
  vUv = vec2(position.x + 0.5, position.y);
  vSeed = aPos.w; vHeat = aSize.z; vType = aSize.w;
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 up = normalize(mix(camUp, vec3(0.0, 1.0, 0.0), 0.55));
  float yb = vType > 0.5 ? position.y - 0.5 : position.y;
  vec3 wp;
  if (vType > 1.5) {
    // ground glow: a flat disc of firelight lying on the grass
    wp = aPos.xyz + vec3(position.x * aSize.x, 0.35, yb * aSize.y);
  } else {
    wp = aPos.xyz + camRight * (position.x * aSize.x) + up * (yb * aSize.y);
    vec3 toCam = normalize(cameraPosition - aPos.xyz);
    wp += toCam * (aSize.x * 0.3);
  }
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FS = /* glsl */`
uniform float uTime;
varying vec2 vUv; varying float vSeed; varying float vHeat; varying float vType;
#include <fog_pars_fragment>
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec4 outc;
  if (vType > 1.5) {
    float d = length(vUv - 0.5) * 2.0;
    float g = max(0.0, 1.0 - d); g *= g;
    float fl = 0.85 + 0.15 * sin(uTime * 11.0 + vSeed * 40.0);
    outc = vec4(vec3(1.0, 0.42, 0.1) * g * vHeat * fl, 0.0);
  } else {
    vec2 p = (vUv - 0.5) * 2.0;
    float k = floor(uTime * 16.0 + vSeed * 50.0);
    float e = 0.0;
    for (int i = 0; i < 3; i++) {
      float a = h21(vec2(k, float(i) + vSeed * 9.0)) * 6.2832;
      vec2 d = vec2(cos(a), sin(a));
      float along = dot(p, d);
      float perp = dot(p, vec2(-d.y, d.x));
      float jag = (vn(vec2(along * 7.0 + k, float(i) * 3.0 + vSeed)) - 0.5) * 0.4 * along;
      float dl = abs(perp - jag);
      e += exp(-dl * 38.0) * step(0.0, along) * (1.0 - smoothstep(0.3, 0.95, along));
    }
    e += exp(-length(p) * 7.0) * 0.6;
    float blink = step(0.3, h21(vec2(k, vSeed * 3.0)));
    outc = vec4(vec3(0.6, 0.84, 1.0) * e * blink * 4.0 * vHeat, 0.0);
  }
  gl_FragColor = outc;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor *= 1.0 - fogFactor * 0.9;
  #endif
  #include <colorspace_fragment>
}`;

export function createFlames(E) {
  const scene = G.scene;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES * 4), 4);
  const aSize = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES * 4), 4);
  aPos.setUsage(THREE.DynamicDrawUsage); aSize.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos); geo.setAttribute('aSize', aSize);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uDay: { value: 1 }, uWind: { value: new THREE.Vector2() },
    }]),
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.name = 'elements-flames';
  scene.add(mesh);
  const surfaces = createFireSurfaces(scene, mat.uniforms, G.quality.particles < 0.6);
  const P = aPos.array, S = aSize.array;
  let n = 0;
  const put = (x, y, z, seed, w, h, heat, type) => {
    if (n + surfaces.count >= MAX_FLAMES) return;
    if (type === 0) { surfaces.put(x, y, z, seed, w, h, heat, G.camera.position); return; }
    const i = n * 4;
    P[i] = x; P[i + 1] = y; P[i + 2] = z; P[i + 3] = seed;
    S[i] = w; S[i + 1] = h; S[i + 2] = heat; S[i + 3] = type;
    n++;
  };

  // ---- frost shells ---------------------------------------------------------------------------------------------
  const shellGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = shellGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.88 + 0.24 * hash2(Math.round(x * 50) + 7, Math.round(y * 50) * 3 + Math.round(z * 50));
      p.setXYZ(i, x * k, y * k, z * k);
    }
    shellGeo.computeVertexNormals();
  }
  const shellMat = hookMaterial(new THREE.MeshLambertMaterial({
    color: 0xc4ecff, emissive: 0x3d7fa8, emissiveIntensity: 0.35, transparent: true, opacity: 0.62, flatShading: true, depthWrite: false,
  }));
  const shells = [];
  const shellFor = new Map();

  // ---- fire lights ---------------------------------------------------------------------------------------------
  const lights = [];
  for (let i = 0; i < MAX_FIRE_LIGHTS; i++) {
    const L = new THREE.PointLight(0xff8a3a, 0, 22, 2);
    L.castShadow = false;
    L.userData.target = 0; L.userData.seed = Math.random() * 100;
    scene.add(L);
    lights.push(L);
  }
  const cand = [];
  let lightT = 0;

  // ---- smoke via fx (optional) --------------------------------------------------------------------------------
  const smokes = [];
  const SMOKES = 5;

  function pickLights(cam) {
    cand.length = 0;
    for (const h of E.fire.heat.values()) {
      if (h.n < 0.9) continue;
      const x = h.sx / h.n, y = h.sy / h.n, z = h.sz / h.n;
      const d = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
      if (d < 90) cand.push({ x, y: y + 1.6, z, d, w: Math.min(1.6, 0.5 + h.n * 0.12) });
    }
    for (const r of E.active) {
      if (!r.burning) continue;
      const d = r.pos.distanceTo(cam);
      if (d < 90) cand.push({ x: r.pos.x, y: r.cy + r.height * 0.2, z: r.pos.z, d, w: Math.min(1.6, 0.5 + r.radius * r.height * 0.15) });
    }
    cand.sort((a, b) => a.d - b.d);
    // spread the lights: skip candidates too close to an already chosen one
    let k = 0;
    for (let i = 0; i < cand.length && k < lights.length; i++) {
      const c = cand[i];
      let close = false;
      for (let j = 0; j < k; j++) { const L = lights[j]; if (Math.hypot(L.position.x - c.x, L.position.z - c.z) < 7) { close = true; break; } }
      if (close) continue;
      const L = lights[k++];
      if (L.userData.target === 0) L.intensity = 0;
      L.position.set(c.x, c.y, c.z);
      L.userData.target = c.w;
    }
    for (; k < lights.length; k++) lights[k].userData.target = 0;
  }

  function updateSmoke(cam) {
    if (!G.fx?.emitter) return;
    // up to SMOKES emitters on the biggest nearby fire clusters
    let i = 0;
    if (E.fire.count > 0 || E.burningCount > 0) {
      for (const h of E.fire.heat.values()) {
        if (i >= SMOKES) break;
        if (h.n < 2.5) continue;
        const x = h.sx / h.n, z = h.sz / h.n;
        if (Math.hypot(x - cam.x, z - cam.z) > 110) continue;
        const s = smokes[i] || (smokes[i] = makeSmoke());
        if (s) { s.forEach((e) => { if (e) { e.pos.set(x, h.sy / h.n + 1.2, z); e.active = true; } }); }
        i++;
      }
    }
    for (; i < smokes.length; i++) smokes[i]?.forEach((e) => { if (e) e.active = false; });
  }
  function makeSmoke() {
    const out = [];
    for (const name of ['smoke', 'embers']) {
      try { const e = G.fx.emitter(name, { pos: new THREE.Vector3(), rate: name === 'smoke' ? 0.55 : 1.1 }); out.push(e || null); } catch (e) { out.push(null); }
    }
    return out;
  }

  let smokeT = 0;
  const _sp = new THREE.Vector3(), smokeUp = new THREE.Vector3(0, 1, 0);
  const api = {
    mesh, lights,
    get count() { return n + surfaces.count; },
    update(dt, rdt) {
      const t = G.time.t;
      const cam = G.camera.position;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uWind.value.set(E.weather.breeze.x, E.weather.breeze.z);
      const day = G.env ? G.env.light : 1;
      mat.uniforms.uDay.value = day;
      n = 0; surfaces.reset();
      // burning ground: two tongues per cell
      for (const c of E.fire.cells.values()) {
        const g = smoothstep(0, 0.6, c.age);
        const end = 1 - smoothstep(c.life * 0.6, c.life, c.age);
        const s = c.size * (0.25 + 0.75 * g) * (0.3 + 0.7 * end) * (0.75 + 0.35 * Math.min(1.3, Math.max(0.3, c.str)));
        const heat = 0.35 + 0.65 * end;
        put(c.ax, c.ay - 0.2, c.az, c.sa, 1.9 * s, 2.5 * s, heat, 0);
        put(c.bx, c.by - 0.2, c.bz, c.sb, 1.5 * s, 1.9 * s, heat * 0.9, 0);
      }
      // smoke columns over the bigger patches of a grass fire (fx kit shapes; a few at a time)
      smokeT -= dt;
      if (smokeT <= 0 && E.fire.count > 2 && G.fx?.kit) {
        smokeT = 0.45;
        let k = 0;
        for (const h of E.fire.heat.values()) {
          if (h.n < 2.5 || Math.random() > 0.35) continue;
          _sp.set(h.sx / h.n, h.sy / h.n + 1.2, h.sz / h.n);
          if (_sp.distanceToSquared(cam) > 140 * 140) continue;
          const size = 1.0 + Math.min(1.2, h.n * 0.15);
          if (G.fx.magic?.combustion) G.fx.magic.combustion.soot(_sp, smokeUp, size, false);
          else G.fx.kit.smoke(_sp, size, { n: 2, dur: 2.1, rise: 1.5, dark: 0x555052, light: 0x827a77, delay: 0 });
          if (++k >= 2) break;
        }
      }
      // firelight pooled on the ground under each patch of fire (reads even on the dark grass of 常夜)
      const glowK = 0.02 + 0.24 * (1 - day); // HDR budget: pools overlap ~10 deep in a big fire (was 0.03 + 0.64)
      for (const h of E.fire.heat.values()) {
        if (h.n < 0.6) continue;
        const k = Math.min(1, h.n / 5);
        put(h.sx / h.n, h.sy / h.n, h.sz / h.n, h.n, 7 + 4 * k, 7 + 4 * k, glowK * (0.4 + 0.6 * k), 2);
      }
      // burning / shocked reactors
      for (const r of E.active) {
        if (r.burning && !r.dead) {
          const ramp = smoothstep(0, 0.8, r._burnAge || 0);
          const fade = r.living ? 1 : 0.35 + 0.65 * smoothstep(0, 3, r.fuel);
          const cnt = Math.max(1, Math.min(5, Math.round(r.radius * r.height * 0.5)));
          const base = Math.min(7, r.height * 0.55 + r.radius * 0.9) * ramp * fade;
          for (let i = 0; i < cnt; i++) {
            const sd = hash2(r.id * 7 + i, i * 13);
            const a = i * 2.4 + r.id;
            const rr = i ? r.radius * (0.35 + 0.35 * sd) : 0;
            const yy = r.y0 + r.height * (i ? 0.1 + 0.55 * sd : 0.35);
            const sz = base * (i ? 0.6 + 0.35 * sd : 1);
            put(r.pos.x + Math.cos(a) * rr, yy, r.pos.z + Math.sin(a) * rr, sd, sz * 0.8, sz * 1.25, r.living ? 0.6 + 0.4 * fade : 0.38 + 0.3 * fade, 0);   // props: a warm body, not a white sheet
          }
        }
        if (r.shocked && !r.dead) {
          for (let i = 0; i < 2; i++) {
            const sd = hash2(r.id + i * 31, Math.floor(t * 9));
            const a = sd * 6.283;
            const s = Math.max(1.5, Math.min(3, r.radius * 2.4));
            put(r.pos.x + Math.cos(a) * r.radius * 0.7, r.cy + (hash2(r.id, i + Math.floor(t * 9)) - 0.5) * r.height * 0.8,
              r.pos.z + Math.sin(a) * r.radius * 0.7, sd + i, s, s, Math.min(1, r.shocked * 2), 1);
          }
        }
      }
      surfaces.upload();
      geo.instanceCount = n;
      if (n) {
        aPos.clearUpdateRanges(); aSize.clearUpdateRanges();
        aPos.addUpdateRange(0, n * 4); aSize.addUpdateRange(0, n * 4);
        aPos.needsUpdate = true; aSize.needsUpdate = true;
      }
      mesh.visible = n > 0;

      // frost shells
      for (const [r, s] of shellFor) {
        if (!r.frozen || r.dead) {
          s.userData.out = (s.userData.out || 0) + rdt * 4;
          const k = Math.max(0, 1 - s.userData.out);
          s.scale.set(s.userData.sx * k, s.userData.sy * k, s.userData.sz * k);
          if (k <= 0) { s.visible = false; shellFor.delete(r); shells.push(s); }
        }
      }
      for (const r of E.active) {
        if (!r.frozen || r.dead) continue;
        let s = shellFor.get(r);
        if (!s) {
          s = shells.pop();
          if (!s) { s = new THREE.Mesh(shellGeo, shellMat); s.castShadow = false; s.receiveShadow = false; s.renderOrder = 3; scene.add(s); }
          s.visible = true; s.userData.age = 0; s.userData.out = 0;
          s.rotation.set(Math.random() * 0.4, Math.random() * 6.28, Math.random() * 0.4);
          s.userData.sx = r.radius * 1.3 + 0.12; s.userData.sy = r.height * 0.62 + 0.12; s.userData.sz = r.radius * 1.3 + 0.12;
          shellFor.set(r, s);
        }
        s.userData.age += rdt;
        const k = Math.min(1, s.userData.age * 6) * (1 + 0.15 * Math.max(0, 1 - s.userData.age * 3));
        s.position.set(r.pos.x, r.cy, r.pos.z);
        s.scale.set(s.userData.sx * k, s.userData.sy * k, s.userData.sz * k);
      }

      // lights
      lightT -= rdt;
      if (lightT <= 0) { lightT = 0.2; pickLights(cam); updateSmoke(cam); }
      for (const L of lights) {
        const sd = L.userData.seed;
        const fl = 0.78 + 0.14 * Math.sin(t * 13 + sd) + 0.08 * Math.sin(t * 29 + sd * 3);
        const tgt = L.userData.target * (8 + 20 * (1 - day)) * fl; // HDR budget: ~45 cd peak at night (was 770: white hotspots)
        L.intensity += (tgt - L.intensity) * Math.min(1, rdt * 10);
        if (L.intensity < 0.05 && L.userData.target === 0) L.intensity = 0;
      }
    },
    clear() {
      n = 0; geo.instanceCount = 0; mesh.visible = false; surfaces.reset(); surfaces.upload();
      for (const [, s] of shellFor) { s.visible = false; shells.push(s); }
      shellFor.clear();
      for (const L of lights) { L.intensity = 0; L.userData.target = 0; }
    },
  };
  return api;
}
