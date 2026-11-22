// Mist at the foot of the City of Magic (episode two's first aerial view: the plateau city floats on a skirt of cloud).
// One instanced draw of soft camera-facing puffs placed where the land falls away below the town's street level,
// drifting slowly; lit by the sky colour and the sun, thinning at night and in rain, invisible far from the city.
import * as THREE from 'three';
import { BELL, CITY_Y } from '../data/bellcrown.js';
import { U } from '../render/atmo.js';

const VERT = /* glsl */`
attribute vec4 aPuff;   // xyz centre, w size
attribute vec2 aSeed;   // phase, drift speed
uniform float uTime;
varying vec2 vUv; varying float vSeed; varying float vFade;
void main() {
  vUv = uv; vSeed = aSeed.x;
  vec3 c = aPuff.xyz;
  float t = uTime * aSeed.y;
  c.x += sin(t + aSeed.x * 6.28) * 9.0; c.z += cos(t * 0.8 + aSeed.x * 4.1) * 7.0; c.y += sin(t * 0.6 + aSeed.x) * 1.5;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float size = aPuff.w * (0.92 + 0.08 * sin(t * 1.3 + aSeed.x * 9.0));
  mv.xy += (uv - 0.5) * size * vec2(1.6, 0.75);   // wide, low puffs
  float d = -mv.z;
  vFade = smoothstep(18.0, 70.0, d) * (1.0 - smoothstep(1600.0, 2300.0, d)); // never a wall of white in the camera's face
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform vec3 uLit, uShade; uniform float uAlpha;
varying vec2 vUv; varying float vSeed; varying float vFade;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = vUv - 0.5;
  float r = length(q * vec2(1.0, 1.25)) * 2.0;
  vec2 p = vUv * 3.0 + vSeed * 17.0;
  float cloud = n(p) * 0.55 + n(p * 2.1) * 0.3 + n(p * 4.3) * 0.15;
  float a = smoothstep(1.0, 0.25, r + (0.5 - cloud) * 0.55);
  a *= smoothstep(0.0, 0.35, vUv.y + cloud * 0.2);          // feathered underside where it meets the slope
  if (a < 0.004) discard;
  vec3 col = mix(uShade, uLit, smoothstep(0.15, 0.85, vUv.y + (cloud - 0.5) * 0.4));
  gl_FragColor = vec4(col, a * uAlpha * vFade);
}`;

/** Builds the mist around the city. `G` is the game; returns { mesh, update(dt) } or null when there is no room for it. */
export function createCityMist(G) {
  const W = G.world, q = G.quality || {};
  const want = Math.round(70 * Math.min(1, Math.max(0.4, q.density ?? 1)));
  const pts = [];
  // walk out from the walls along rays; keep spots where the land has dropped below the street level
  for (let i = 0; i < 96 && pts.length < want; i++) {
    const a = (i / 96) * Math.PI * 2 + (i % 3) * 0.013;
    for (const k of [1.06, 1.22, 1.42, 1.68]) {
      const x = BELL.boxX + Math.cos(a) * BELL.halfW * k, z = BELL.boxZ + Math.sin(a) * BELL.halfD * k;
      const g = W.heightAt(x, z);
      if (g > CITY_Y - 3 || W.isWater?.(x, z)) continue;
      const top = Math.min(g + 6 + ((i * 7) % 9), CITY_Y + 2);  // hug the slope below the walls
      pts.push([x, top, z, 42 + ((i * 13) % 34)]);
      break;
    }
  }
  if (pts.length < 6) return null;
  const n = pts.length, geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  geo.index = base.index; geo.setAttribute('position', base.getAttribute('position')); geo.setAttribute('uv', base.getAttribute('uv'));
  const P = new Float32Array(n * 4), S = new Float32Array(n * 2);
  pts.forEach((p, i) => { P.set(p, i * 4); S[i * 2] = (i * 0.618) % 1; S[i * 2 + 1] = 0.035 + ((i * 37) % 10) * 0.004; });
  geo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(P, 4));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(S, 2));
  geo.instanceCount = n;
  const uni = { uTime: { value: 0 }, uLit: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.7, 0.76, 0.85) }, uAlpha: { value: 0.6 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uni, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'city-mist'; mesh.frustumCulled = false; mesh.renderOrder = 2;
  G.scene.add(mesh);
  const _c = new THREE.Color();
  return {
    mesh,
    count: n,
    update(dt) {
      uni.uTime.value += dt;
      const cam = G.camera?.position;
      const far = cam ? Math.hypot(cam.x - BELL.boxX, cam.z - BELL.boxZ) : 0;
      mesh.visible = far < 2600;
      if (!mesh.visible) return;
      const w = G.journeyWeather?.state || {};
      const day = 1 - (w.night || 0);
      // lit side: the sky / fog colour lifted toward warm white by day; shade: the fog colour itself
      _c.copy(U.mvFogCam.value);
      uni.uShade.value.copy(_c).multiplyScalar(0.85 + 0.25 * day);
      uni.uLit.value.copy(_c).lerp(_c.setRGB(1.0, 0.97, 0.92), 0.65 * day).multiplyScalar(0.6 + 0.5 * day);
      uni.uAlpha.value = (0.54 - 0.22 * (w.rain || 0)) * (0.45 + 0.55 * day);
    },
  };
}
