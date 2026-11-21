// Weather: the wandering global breeze, local wind fields (updraft columns, gusts), fire updrafts, and rain zones
// (祈雨: a dark cloud disc + falling streaks; puts out fire, soaks everything below).
import * as THREE from 'three';
import { G } from '../core/game.js';
import { makeNoise2D, smoothstep } from '../core/util.js';

const nz = makeNoise2D(4242);
const DROPS = 3200;

const rainVS = /* glsl */`
attribute vec4 aDrop;            // x,z in unit disc, phase, speed jitter
uniform float uTime, uTop, uBottom, uRadius, uFade;
uniform vec2 uCenter, uWind;
varying float vA; varying float vX;
#include <fog_pars_vertex>
void main() {
  float fallH = uTop - uBottom;
  float speed = 17.0 * aDrop.w;
  float f = fract(aDrop.z + uTime * speed / fallH);
  float y = mix(uTop, uBottom, f);
  float len = .32 + .24 * aDrop.w;
  vec3 c = vec3(uCenter.x + aDrop.x * uRadius, y, uCenter.y + aDrop.y * uRadius);
  c.xz += uWind * (1.0 - f) * 0.35 * fallH / speed;
  vec3 dir = normalize(vec3(-uWind.x * 0.06, -1.0, -uWind.y * 0.06));
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 side = normalize(camRight - dir * dot(camRight, dir));
  vec3 wp = c + dir * (position.y * len) + side * (position.x * .018);
  vX = position.x;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float edge = 1.0 - smoothstep(0.75, 1.0, length(aDrop.xy));
  vA = uFade * edge * smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.92, 1.0, f));
  vA *= smoothstep(1.8, 5.8, -mvPosition.z); // no wide white rods across the lens
  #include <fog_vertex>
}`;
const rainFS = /* glsl */`
uniform vec3 uColor;
varying float vA; varying float vX;
#include <fog_pars_fragment>
void main() {
  float core = 1.0 - abs(vX);
  gl_FragColor = vec4(uColor, vA * 0.75 * core);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const cloudVS = /* glsl */`
attribute float aLayer;
varying vec2 vUv; varying float vLayer;
#include <fog_pars_vertex>
void main() {
  vUv = uv; vLayer = aLayer;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const cloudFS = /* glsl */`
uniform float uTime, uFade, uSeed;
uniform vec3 uDark, uLit;
varying vec2 vUv; varying float vLayer;
#include <fog_pars_fragment>
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  vec2 q = p * 3.2 + vec2(uSeed * 13.0 + vLayer * 5.0, uTime * 0.05 * (1.0 + vLayer));
  float n = fbm(q + fbm(q * 0.7 + uTime * 0.03));
  float shape = (1.0 - smoothstep(0.45 + 0.3 * vLayer, 1.0, r + (n - 0.5) * 0.55));
  float dens = smoothstep(0.25, 0.75, n * shape + shape * 0.35);
  float a = dens * uFade * (0.92 - 0.2 * vLayer);
  vec3 col = mix(uDark, uLit, smoothstep(0.3, 0.9, n) * (0.4 + 0.3 * vLayer));
  // posterize slightly for the painterly toon look
  col = mix(col, floor(col * 6.0 + 0.5) / 6.0, 0.35);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

export function createWeather(E) {
  const scene = G.scene;
  const zones = [];
  const fields = [];
  const breeze = new THREE.Vector3();
  let rainGeo = null, cloudGeo = null;
  const _v = new THREE.Vector3();

  function buildGeos() {
    if (rainGeo) return;
    rainGeo = new THREE.InstancedBufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
    rainGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const d = new Float32Array(DROPS * 4);
    for (let i = 0; i < DROPS; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
      d[i * 4] = Math.cos(a) * r; d[i * 4 + 1] = Math.sin(a) * r; d[i * 4 + 2] = Math.random(); d[i * 4 + 3] = 0.8 + Math.random() * 0.4;
    }
    rainGeo.setAttribute('aDrop', new THREE.InstancedBufferAttribute(d, 4));
    rainGeo.instanceCount = DROPS;
    // three stacked, slightly offset discs = one draw call
    const geos = [];
    for (let l = 0; l < 3; l++) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      const s = 1 - l * 0.16;
      g.scale(s, 1, s);
      g.translate((l - 1) * 0.04, l * 0.06, (1 - l) * 0.05);
      g.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(4).fill(l / 2), 1));
      geos.push(g);
    }
    cloudGeo = mergeSimple(geos);
  }

  function mergeSimple(geos) {
    const out = new THREE.BufferGeometry();
    const P = [], U = [], L = [], I = [];
    let base = 0;
    for (const g of geos) {
      const p = g.attributes.position.array, u = g.attributes.uv.array, l = g.attributes.aLayer.array, idx = g.index.array;
      P.push(...p); U.push(...u); L.push(...l);
      for (const i of idx) I.push(i + base);
      base += g.attributes.position.count;
    }
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    out.setAttribute('aLayer', new THREE.Float32BufferAttribute(L, 1));
    out.setIndex(I);
    return out;
  }

  function rainMesh(z) {
    buildGeos();
    const fogU = THREE.UniformsLib.fog;
    const rm = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([fogU, {
        uTime: { value: 0 }, uTop: { value: 0 }, uBottom: { value: 0 }, uRadius: { value: z.r }, uFade: { value: 0 },
        uCenter: { value: new THREE.Vector2(z.x, z.z) }, uWind: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(0xc8d8ea) },
      }]),
      vertexShader: rainVS, fragmentShader: rainFS, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    const rain = new THREE.Mesh(rainGeo, rm);
    rain.frustumCulled = false; rain.renderOrder = 5;
    return rain;
  }
  let ambientRain=null;
  function makeZoneVisual(z) {
    const rain=rainMesh(z), fogU=THREE.UniformsLib.fog;
    const cm = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([fogU, {
        uTime: { value: 0 }, uFade: { value: 0 }, uSeed: { value: Math.random() },
        uDark: { value: new THREE.Color(0x2a2f3a) }, uLit: { value: new THREE.Color(0x6c7484) },
      }]),
      vertexShader: cloudVS, fragmentShader: cloudFS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    const cloud = new THREE.Mesh(cloudGeo, cm);
    cloud.scale.set(z.r * 2.6, 6, z.r * 2.6);
    cloud.renderOrder = 6;
    cloud.frustumCulled = false;
    z.rain = rain; z.cloud = cloud;
    scene.add(rain, cloud);
  }

  function disposeZone(z) {
    if (z.rain) { z.rain.removeFromParent(); z.rain.material.dispose(); }
    if (z.cloud) { z.cloud.removeFromParent(); z.cloud.material.dispose(); }
  }

  const api = {
    zones, fields, breeze,
    /** Start (or extend) rain over a disc. Returns a handle { x, z, r, t, duration, remove() }. */
    rain(x, z, r = 18, duration = 20) {
      const W = G.world;
      const gy = W.heightAt(x, z);
      const zone = { x, z, r, duration, t: 0, gy, top: Math.max(gy, W.seaLevel) + 24, fade: 0, soakT: 0, dead: false };
      zone.remove = () => { zone.t = Math.max(zone.t, zone.duration); };
      makeZoneVisual(zone);
      zone.cloud.position.set(x, zone.top + 1.5, z);
      zones.push(zone);
      if (zones.length > 8) { const old = zones.shift(); disposeZone(old); }
      return zone;
    },
    isRainingAt(x,z) {
      if(api.isSpellRainAt(x,z)) return true;
      if((G.journeyWeather?.rainAt(x,z)||0)<.34)return false;
      return !Number.isFinite(G.world.ceilingAt(x,z,G.world.heightAt(x,z)+1));
    },
    isSpellRainAt(x, z) {
      for (let i = 0; i < zones.length; i++) {
        const q = zones[i];
        if (q.t < q.duration && q.t > 0.4) { const dx = x - q.x, dz = z - q.z; if (dx * dx + dz * dz < q.r * q.r) return true; }
      }
      return false;
    },
    addWind(o = {}) {
      const f = {
        kind: o.kind === 'gust' ? 'gust' : 'updraft',
        pos: new THREE.Vector3().copy(o.pos || _v.set(0, 0, 0)),
        dir: new THREE.Vector3().copy(o.dir || _v.set(1, 0, 0)).normalize(),
        radius: o.radius ?? 5, height: o.height ?? 40, strength: o.strength ?? (o.kind === 'gust' ? 12 : 14),
        duration: o.duration ?? Infinity, t: 0, dead: false, swirl: o.swirl ?? (o.kind === 'gust' ? 0 : 0.25),
        // visual: true = a gust only cloth / flora / fx see (visualWindAt); bodies and the player never feel it (windAt)
        visual: !!o.visual,
      };
      f.remove = () => { f.dead = true; };
      fields.push(f);
      return f;
    },
    /** Global breeze + wind fields (no fire updraft). Horizontal spread of fire uses this. */
    breezeAt(pos, out) {
      out.copy(breeze);
      for (let i = 0; i < fields.length; i++) if (!fields[i].visual) addField(fields[i], pos, out);
      return out;
    },
    /** windAt + the visual-only gusts (a beam struggle's pressure, a big blast): for cloth, flora and effects only. */
    visualWindAt(pos, out = new THREE.Vector3()) {
      api.windAt(pos, out);
      for (let i = 0; i < fields.length; i++) if (fields[i].visual) addField(fields[i], pos, out);
      return out;
    },
    windAt(pos, out = new THREE.Vector3()) {
      api.breezeAt(pos, out);
      // fire updraft: hot air above burning ground and burning things
      const hk = E.fire.heatAt(pos.x, pos.z);
      if (hk > 0) {
        const gy = G.world.heightAt(pos.x, pos.z);
        const above = pos.y - gy;
        if (above > -1 && above < 34) out.y += Math.min(1, hk / 5) * 9 * (1 - smoothstep(14, 34, above));
      }
      return out;
    },
    update(dt) {
      const t = G.time.t;
      // publish the visual wind next to windAt (elements.js builds G.elements without it)
      if (G.elements && !G.elements.visualWindAt) G.elements.visualWindAt = api.visualWindAt;
      // global breeze: slowly wandering direction and strength
      const ang = 0.6 + 2.4 * nz(t * 0.004, 3.7) + 0.35 * nz(t * 0.03, 9.1);
      const sp = 2.4 + 1.6 * nz(t * 0.02, 1.3) + 0.6 * nz(t * 0.2, 7.7);
      const climate=G.journeyWeather?.state;
      breeze.set(Math.cos(ang) * sp, 0, Math.sin(ang) * sp).multiplyScalar(climate?.wind||1);
      const layer=G.sky?.cloudLayer?.();
      const cloudRain=layer ? 1-smoothstep(layer.base+8,layer.top-5,G.camera.position.y) : 1;
      const show=G.started && climate && climate.rain*cloudRain>.035 && !climate.sheltered;
      if(show && !ambientRain) {
        ambientRain=rainMesh({x:0,z:0,r:15});
        ambientRain.name='travelling-rain';scene.add(ambientRain);
      }
      if(ambientRain){
        ambientRain.visible=!!show;
        if(show){
          const p=G.camera.position,u=ambientRain.material.uniforms;
          const gy=Math.max(0,G.world.heightAt(p.x,p.z));
          u.uTop.value=p.y+13; u.uBottom.value=Math.min(p.y+11,Math.max(gy+.03,p.y-13));
          u.uCenter.value.set(p.x,p.z); u.uWind.value.set(-breeze.x,-breeze.z);
          u.uTime.value=t; u.uFade.value=climate.rain*cloudRain*.58;
        }
      }
      for (let i = fields.length - 1; i >= 0; i--) {
        const f = fields[i];
        f.t += dt;
        if (f.dead || f.t >= f.duration) { f.dead = true; fields.splice(i, 1); }
      }
      for (let i = zones.length - 1; i >= 0; i--) {
        const q = zones[i];
        q.t += dt;
        q.fade = Math.min(1, q.t / 1.2) * (1 - smoothstep(q.duration, q.duration + 1.8, q.t));
        if (q.t > q.duration + 2) { disposeZone(q); zones.splice(i, 1); continue; }
        const lightK = 0.12 + 0.88 * (G.world.daylightAt(q.x, q.z)); // unlit streaks: dim under the Veil (was 0.35 floor)
        const rm = q.rain.material.uniforms, cm = q.cloud.material.uniforms;
        rm.uTime.value = t; rm.uFade.value = q.fade; rm.uTop.value = q.top; rm.uBottom.value = q.gy - 8;
        rm.uWind.value.set(breeze.x, breeze.z);
        rm.uColor.value.setRGB(0.62 * lightK + 0.1, 0.7 * lightK + 0.12, 0.8 * lightK + 0.16);
        cm.uTime.value = t; cm.uFade.value = q.fade;
        cm.uDark.value.setRGB(0.1 + 0.09 * lightK, 0.11 + 0.1 * lightK, 0.14 + 0.12 * lightK);
        cm.uLit.value.setRGB(0.2 + 0.25 * lightK, 0.22 + 0.27 * lightK, 0.27 + 0.3 * lightK);
        q.cloud.rotation.y += dt * 0.02;
        if (q.t < q.duration && q.t > 0.4) {
          q.soakT -= dt;
          if (q.soakT <= 0) { q.soakT = 0.5; E.rainSoak(q); }
        }
      }
    },
    clear() { for (const q of zones) disposeZone(q); zones.length = 0; fields.length = 0; },
  };

  function addField(f, pos, out) {
    const dx = pos.x - f.pos.x, dz = pos.z - f.pos.z;
    const env = Math.min(1, f.t / 0.6) * (f.duration === Infinity ? 1 : 1 - smoothstep(f.duration - 1, f.duration, f.t));
    if (env <= 0) return;
    if (f.kind === 'updraft') {
      const d2 = dx * dx + dz * dz, r2 = f.radius * f.radius;
      if (d2 >= r2) return;
      const dy = pos.y - f.pos.y;
      if (dy < -2 || dy > f.height) return;
      const k = (1 - d2 / r2) * env * (1 - smoothstep(f.height * 0.75, f.height, dy));
      out.y += f.strength * k;
      if (f.swirl) { const d = Math.sqrt(d2) + 1e-3; out.x += (-dz / d) * f.strength * f.swirl * k; out.z += (dx / d) * f.strength * f.swirl * k; }
    } else {
      const dy = pos.y - f.pos.y;
      const d2 = dx * dx + dz * dz + dy * dy, r2 = f.radius * f.radius;
      if (d2 >= r2) return;
      // gusts flare up and fade over their life
      const life = f.duration === Infinity ? 1 : Math.max(0, 1 - f.t / f.duration);
      const k = (1 - Math.sqrt(d2 / r2)) * env * (0.35 + 0.65 * life);
      out.x += f.dir.x * f.strength * k; out.y += f.dir.y * f.strength * k; out.z += f.dir.z * f.strength * k;
    }
  }
  return api;
}
