// LEGACY water (before the v-water upgrade), kept for A/B comparison: ?water=legacy. One stylised surface at y = 0 (sea, 镜湖, 暮川, 雾见泉, 月池 and any crater dug below sea level).
// MeshPhong base (so the Veil hook lights and fogs it) with a custom shader: depth colour from the baked height
// texture, foam lines at the shore, scrolling wave normals, fresnel sky reflection from an analytic sky palette, sun
// glint and sparkles by day, rose-gold at dusk, dark glass with glowing ripples and the golden ring's reflection at
// night. The mesh follows the camera (it is flat, so nothing swims) and reaches the far plane: no edge of the world.
import * as THREE from 'three';
import { hookMaterial } from '../../core/mats.js';
import { heightAt, SEA_LEVEL } from '../ground.js';
import { VEIL } from '../../data/world.js';
import { SUN_DIR, SUN_ANGULAR_RADIUS } from '../veil.js';
import { lin } from '../terrain/shader.js';
import { DATA_HALF } from '../terrain/textures.js';

const MAX_RIPPLES = 12;

const WATER_PARS = /* glsl */`
uniform sampler2D wData;
uniform sampler2D wNoise;
uniform float wTime;
uniform vec4 wVeil;
uniform vec3 wSunDir;
uniform vec4 wRipples[${MAX_RIPPLES}];
uniform float wRingK;
varying vec3 vWW;
vec3 wPal(vec3 a, vec3 b, vec3 c, vec3 d, float v) {
  // keys at 0, 0.38, 0.72, 1 (same as the sky palette)
  if (v < 0.38) return mix(a, b, smoothstep(0.0, 0.38, v));
  if (v < 0.72) return mix(b, c, smoothstep(0.38, 0.72, v));
  return mix(c, d, smoothstep(0.72, 1.0, v));
}
float wN(vec2 uv) { return texture2D(wNoise, uv).g; }
`;

const WATER_COLOR = /* glsl */`
vec3 wP = vWW;
vec2 wUV = (wP.xz + ${DATA_HALF.toFixed(1)}) / ${(DATA_HALF * 2).toFixed(1)};
float wGround = texture2D(wData, wUV).r;
float wDepth = max(0.0, -wGround);
float wDist = distance(cameraPosition, wP);
float wV = 1.0 - smoothstep(wVeil.z, wVeil.w, distance(wP.xz, wVeil.xy));
float wSun = 1.0 - smoothstep(0.05, 0.34, wV);
float wNight = smoothstep(0.56, 0.86, wV);
float wDusk = max(0.0, 1.0 - wSun - wNight);
float wt = wTime;
float wb1 = texture2D(wNoise, wP.xz / 61.0 + vec2(wt * 0.004, wt * 0.0027)).b;

// colour by depth and land
vec3 wShallow = ${lin(0x52e0d0)} * wSun + ${lin(0xf0b08a)} * wDusk + ${lin(0x123848)} * wNight;
vec3 wMid     = ${lin(0x1aa6c4)} * wSun + ${lin(0xb87088)} * wDusk + ${lin(0x0b2438)} * wNight;
vec3 wDeep    = ${lin(0x16609e)} * wSun + ${lin(0x5c3e78)} * wDusk + ${lin(0x040c1c)} * wNight;
vec3 wBase = mix(wShallow, wMid, smoothstep(0.2, 3.0, wDepth));
wBase = mix(wBase, wDeep, smoothstep(3.0, 13.0, wDepth));
wBase *= 0.92 + 0.16 * wb1;

// shore foam: a steady lip plus lines that roll in
float wn = wN(wP.xz / 9.0 + vec2(wt * 0.02, 0.0));
float wLip = 1.0 - smoothstep(0.05, 0.28 + wn * 0.3, wDepth);
float wRoll = sin(wDepth * 4.2 - wt * 1.5 + wn * 5.0);
float wLine = smoothstep(0.72, 0.93, wRoll) * (1.0 - smoothstep(0.25, 1.3, wDepth)) * smoothstep(0.35, 0.6, wn + 0.15);
float wFoam = clamp(max(wLip, wLine * 0.85), 0.0, 1.0) * (1.0 - wNight * 0.45);
// ripples (splashes, wading)
float wRip = 0.0;
for (int i = 0; i < ${MAX_RIPPLES}; i++) {
  vec4 r = wRipples[i];
  float age = wt - r.z;
  if (r.w <= 0.0 || age < 0.0 || age > 2.6) continue;
  float rad = age * 2.4 + 0.2;
  float d = distance(wP.xz, r.xy);
  float ring = exp(-pow((d - rad) / (0.12 + age * 0.12), 2.0)) + 0.5 * exp(-pow((d - rad * 0.62) / (0.1 + age * 0.1), 2.0));
  wRip += ring * r.w * (1.0 - age / 2.6);
}
wFoam = clamp(wFoam + wRip * 0.6 * (1.0 - wNight * 0.6), 0.0, 1.0);
vec3 wFoamC = ${lin(0xffffff)} * wSun + ${lin(0xffe2cc)} * wDusk + ${lin(0x5a8aa6)} * wNight;
diffuseColor.rgb = mix(wBase, wFoamC, wFoam);
diffuseColor.a = mix(mix(0.52, 0.97, smoothstep(0.0, 3.2, wDepth)), 1.0, max(wFoam, smoothstep(6.0, 10.0, wDepth)));
`;

const WATER_NORMAL = /* glsl */`
// wave normal in world space: two scrolling noise layers + a slow swell; flattened with distance
vec3 wNrm;
{
  float e = 0.004;
  vec2 u1 = wP.xz / 34.0 + vec2(wt * 0.011, wt * 0.006);
  vec2 u2 = wP.xz / 9.5 - vec2(wt * 0.017, -wt * 0.012);
  float h1x = wN(u1 + vec2(e, 0.0)) - wN(u1 - vec2(e, 0.0)), h1z = wN(u1 + vec2(0.0, e)) - wN(u1 - vec2(0.0, e));
  float h2x = wN(u2 + vec2(e, 0.0)) - wN(u2 - vec2(e, 0.0)), h2z = wN(u2 + vec2(0.0, e)) - wN(u2 - vec2(0.0, e));
  float amp = 1.0 / (1.0 + wDist / 140.0);
  vec2 g = (vec2(h1x, h1z) * 2.2 + vec2(h2x, h2z) * 1.3) * amp;
  g += vec2(sin(wP.x * 0.07 + wt * 0.9), sin(wP.z * 0.05 - wt * 0.7)) * 0.05 * amp;
  g *= 1.0 - wFoam * 0.7;
  wNrm = normalize(vec3(-g.x * 3.0, 1.0, -g.y * 3.0));
}
normal = normalize( ( viewMatrix * vec4( wNrm, 0.0 ) ).xyz );
`;

const WATER_REFLECT = /* glsl */`
{
  vec3 wView = normalize(wP - cameraPosition);
  vec3 wR = reflect(wView, wNrm);
  wR.y = abs(wR.y);
  float wCos = clamp(dot(-wView, wNrm), 0.0, 1.0);
  float wF = 0.04 + 0.96 * pow(1.0 - wCos, 5.0);
  float wVsky = clamp(wV + 0.0, 0.0, 1.0);
  vec3 skyZen = wPal(${lin(0x3f86dc, 1.05)}, ${lin(0x5468b8, 0.95)}, ${lin(0x2e2a6c, 0.7)}, ${lin(0x060a26, 0.62)}, wVsky);
  vec3 skyHor = wPal(${lin(0xcfe7f6, 1.15)}, ${lin(0xffc88c, 1.1)}, ${lin(0xe58a84, 0.85)}, ${lin(0x1a2452, 0.62)}, wVsky);
  vec3 wSky = mix(skyHor, skyZen, pow(clamp(wR.y, 0.0, 1.0), 0.6));
  float sd = dot(wR, wSunDir);
  float ang = acos(clamp(sd, -1.0, 1.0));
  float sunVis = 1.0 - smoothstep(0.25, 0.8, wV);
  #ifdef MV_CLOUD_LIGHT
    sunVis *= mvCloudDirect;
  #endif
  vec3 sunC = mix(${lin(0xfff2dc)}, ${lin(0xffa860)}, smoothstep(0.1, 0.6, wV));
  vec3 wRefl = wSky;
  wRefl += sunC * (pow(max(sd, 0.0), 1400.0) * 40.0 + pow(max(sd, 0.0), 90.0) * 0.9) * sunVis;
  // golden ring and its glow under the Veil
  // the ring is mirrored by a calmer surface (long, coherent streak instead of random glitter)
  vec3 wRc = reflect(wView, normalize(mix(vec3(0.0, 1.0, 0.0), wNrm, 0.07)));
  ang = acos(clamp(dot(wRc, wSunDir), -1.0, 1.0));
  float ringR = ${(SUN_ANGULAR_RADIUS * 1.02).toFixed(4)};
  float ring = exp(-pow((ang - ringR) / 0.02, 2.0)) * 2.6 + exp(-ang / 0.18) * 0.4;
  wRefl += ${lin(0xffd98a)} * ring * smoothstep(0.55, 0.9, wV) * wRingK;
  float wMix = clamp(wF * 0.62 + 0.1, 0.0, 1.0) * (1.0 - wFoam);
  outgoingLight = mix(outgoingLight, wRefl, wMix);

  // sparkles: twinkling points on wave crests, near the sun's path by day, everywhere faintly
  float sp = wN(wP.xz / 2.3 + vec2(wt * 0.05, -wt * 0.03)) * wN(wP.xz / 1.7 - vec2(wt * 0.04, wt * 0.06));
  float spark = smoothstep(0.5, 0.62, sp) * (1.0 - smoothstep(60.0, 260.0, wDist)) * (1.0 - wFoam);
  outgoingLight += sunC * spark * (0.05 + 5.0 * pow(max(sd, 0.0), 24.0)) * sunVis * 1.6;
  // night: glowing ripples (bioluminescent lines that drift), stronger near the shore; ring-gold flecks
  float rl = texture2D(wNoise, wP.xz / 23.0 + vec2(wt * 0.006, wt * 0.009)).a;
  float rl2 = texture2D(wNoise, wP.xz / 71.0 - vec2(wt * 0.004, 0.0)).a;
  float glowLine = smoothstep(0.945, 0.99, rl) * smoothstep(0.45, 0.85, rl2);
  float nearShore = 1.0 - smoothstep(0.5, 6.0, wDepth) * 0.6;
  outgoingLight += ${lin(0x6ff3ff)} * glowLine * wNight * nearShore * 0.28 * (1.0 - smoothstep(150.0, 600.0, wDist));
  outgoingLight += ${lin(0x8ff6ff)} * wRip * wNight * 1.4;
  outgoingLight += wFoamC * wFoam * wNight * 0.12;
}
`;

export function createLegacyWater(G, { data, noise }) {
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
  const uniforms = {
    wData: { value: data }, wNoise: { value: noise }, wTime: { value: 0 },
    wVeil: { value: new THREE.Vector4(VEIL.x, VEIL.z, VEIL.inner, VEIL.outer) },
    wSunDir: {value:SUN_DIR}, wRipples: { value: ripples }, wRingK: { value: 1 },
  };
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: 2, transparent: true, depthWrite: true });
  mat.name = 'water';
  mat.defines = { MV_OWN_SURFACE_DETAIL: 1 };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WATER_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + WATER_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WATER_NORMAL)
      .replace('#include <envmap_fragment>', '#include <envmap_fragment>\n' + WATER_REFLECT);
  };
  mat.customProgramCacheKey = () => 'mvWater2';
  hookMaterial(mat);

  // flat sheet: fine-ish centre (so per-vertex fog/varyings stay smooth), reaching past the far plane
  const geo = new THREE.PlaneGeometry(9000, 9000, 48, 48);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = -10;  // first among transparent things: particles above it draw on top, below it are hidden
  mesh.position.y = SEA_LEVEL;
  G.scene.add(mesh);

  let rip = 0, wadeT = 0;
  const water = {
    mesh, material: mat, uniforms, level: SEA_LEVEL,
    /** Height of the water surface at (x,z): 0 where there is water (ground below sea level), else -Infinity. */
    levelAt(x, z) { return heightAt(x, z) < SEA_LEVEL ? SEA_LEVEL : -Infinity; },
    /** Water depth at (x,z) in metres (0 on dry land). */
    depthAt(x, z) { return Math.max(0, SEA_LEVEL - heightAt(x, z)); },
    /** Expanding ring on the surface (splash, wading, a cast landing in water). strength 0..1.5. */
    ripple(x, z, strength = 1) {
      if (!(heightAt(x, z) < SEA_LEVEL)) return false;
      const r = ripples[rip]; rip = (rip + 1) % MAX_RIPPLES;
      r.set(x, z, uniforms.wTime.value, Math.min(1.5, Math.max(0.05, strength)));
      return true;
    },
    /** Alias kept for splash hooks: ripple + optional fx. */
    splash(pos, strength = 1) {
      if (water.ripple(pos.x, pos.z, strength)) { G.fx?.burst?.('splash', pos); return true; }
      return false;
    },
    update(dt) {
      uniforms.wTime.value += dt;
      const c = G.camera.position;
      mesh.position.x = Math.round(c.x / 200) * 200; mesh.position.z = Math.round(c.z / 200) * 200;
      uniforms.wRingK.value = G.sky?.info?.ringK ?? 1;
      // wading / swimming leaves rings
      const p = G.player?.pos;
      if (p && dt > 0) {
        wadeT -= dt;
        const sp = G.player.speed ?? 0;
        if (wadeT <= 0 && p.y < SEA_LEVEL + 0.4 && heightAt(p.x, p.z) < SEA_LEVEL && (sp > 0.6 || G.player.state === 'swim')) {
          water.ripple(p.x, p.z, sp > 0.6 ? 0.8 : 0.35);
          wadeT = sp > 3 ? 0.28 : 0.6;
        }
      }
    },
  };
  // anything landing in the water makes rings
  G.events.on('element:applied', (e) => { if (e?.pos && Math.abs(e.pos.y - SEA_LEVEL) < 3) water.ripple(e.pos.x, e.pos.z, 0.6 + Math.min(0.8, (e.radius || 1) * 0.08)); });
  G.events.on('physics:impact', (e) => { if (e?.pos && Math.abs(e.pos.y - SEA_LEVEL) < 1.2 && e.speed > 3) water.ripple(e.pos.x, e.pos.z, Math.min(1.2, e.speed * 0.08)); });
  return water;
}
