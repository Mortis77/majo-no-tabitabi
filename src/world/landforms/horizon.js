// landforms — the far world: hazy silhouettes of distant isles and ranges on the horizon, and a low sea of clouds far
// out. Two draw calls; the silhouettes stand in three depth layers (near stacks ~1.4 km, the isle ring ~2.2 km, broad pale
// ranges ~3 km) so the horizon reads with depth. Both take their colour from the camera's air (scene.fog colour), so they sit in the haze of
// every land: the silhouettes a little darker and bluer than the air, fading to pure haze at their feet.
import * as THREE from 'three';
import { mulberry32, noise2 } from '../../core/util.js';
import { LU } from './lfmats.js';

const NOISE = /* glsl */`
float hzH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hzN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hzH(i), hzH(i + vec2(1.0, 0.0)), f.x), mix(hzH(i + vec2(0.0, 1.0)), hzH(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

export function buildHorizon(G, root) {
  const rnd = mulberry32(4242);
  const p = [], a2 = [], idx = [];
  let nv = 0;
  // layer: 0 = near isles (crisper, darker), 1 = the middle ring, 2 = broad pale ranges far behind
  const peak = (cx, cz, R, Hm, seed, sharp, layer) => {
    const RINGS = layer === 2 ? 5 : 7, SEG = layer === 2 ? 24 : 28;
    const base = nv;
    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS;
      for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        // spurs and gullies: a few strong ridges running down from the top, not a smooth cone
        const spur = Math.pow(Math.abs(Math.sin(a * (2 + (seed % 3)) + seed)), 3) * 0.28 * (1 - t);
        const jag = 1 + 0.35 * noise2(Math.cos(a) * 1.7 + seed, Math.sin(a) * 1.7 + t * 2) + 0.15 * noise2(Math.cos(a) * 5 + seed, t * 6) + spur;
        const rr = R * (1 - Math.pow(t, sharp)) * jag;
        const y = -25 + (Hm + 25) * t * (0.85 + 0.15 * noise2(a * 3 + seed, 1.3));
        p.push(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr);
        // aHz: x = height 0..1, y = side shade (lit toward the west-ish sun), z = layer, w = angle around the peak
        a2.push(t, 0.7 + 0.3 * Math.cos(a - Math.PI * 1.1), layer, s / SEG + (seed % 1));
        nv++;
      }
    }
    for (let i = 0; i < RINGS; i++) for (let s = 0; s < SEG; s++) {
      const a = base + i * SEG + s, b = base + i * SEG + (s + 1) % SEG, c = a + SEG, d = b + SEG;
      idx.push(a, c, b, b, c, d);
    }
  };
  const isles = [];
  // middle ring (the original 13 isles, same seed, same places)
  const N = 13;
  for (let k = 0; k < N; k++) {
    const ang = (k / N) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const dist = 1750 + rnd() * 1000;
    const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
    const big = rnd() < 0.45;
    const R = big ? 170 + rnd() * 160 : 70 + rnd() * 90;
    const Hm = big ? 110 + rnd() * 160 : 40 + rnd() * 70;
    peak(cx, cz, R, Hm, k * 3.1, big ? 1.6 : 2.4, 1);
    const sub = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < sub; j++) {
      const a = rnd() * 6.28, d = R * (0.5 + rnd() * 0.6);
      peak(cx + Math.cos(a) * d, cz + Math.sin(a) * d, R * (0.35 + rnd() * 0.3), Hm * (0.35 + rnd() * 0.45), k * 7.7 + j, 1.8, 1);
    }
    isles.push({ x: cx, z: cz, r: R, h: Hm });
  }
  // near layer: small steep isles and sea stacks rising out of the cloud sea, between the middle isles
  const rn2 = mulberry32(777);
  for (let k = 0; k < 9; k++) {
    const ang = ((k + 0.5) / 9) * Math.PI * 2 + (rn2() - 0.5) * 0.4;
    const dist = 1320 + rn2() * 260;
    const R = 40 + rn2() * 70, Hm = 45 + rn2() * 70;
    const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
    peak(cx, cz, R, Hm, 50 + k * 2.3, 2.8, 0);
    if (rn2() < 0.6) { const a = rn2() * 6.28; peak(cx + Math.cos(a) * R * 1.1, cz + Math.sin(a) * R * 1.1, R * 0.45, Hm * 0.55, 61 + k, 2.2, 0); }
  }
  // far layer: long low ranges, several overlapping summits along an arc, pale in the air
  for (let k = 0; k < 7; k++) {
    const ang0 = (k / 7) * Math.PI * 2 + rn2() * 0.5;
    const n = 3 + Math.floor(rn2() * 3);
    for (let j = 0; j < n; j++) {
      const ang = ang0 + (j - n / 2) * 0.07, dist = 2950 + rn2() * 250;
      peak(Math.cos(ang) * dist, Math.sin(ang) * dist, 220 + rn2() * 200, 140 + rn2() * 190 * (1 - Math.abs(j - n / 2) / n), 90 + k * 5 + j, 1.4, 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('aHz', new THREE.Float32BufferAttribute(a2, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const silMat = new THREE.ShaderMaterial({
    name: 'landforms_horizon',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uK: { value: 1 } }]),
    vertexShader: /* glsl */`
      attribute vec4 aHz; varying vec4 vHz; varying vec3 vW;
      void main() { vHz = aHz; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogColor; uniform float uK; varying vec4 vHz; varying vec3 vW;
      ${NOISE}
      void main() {
        float h = clamp(vHz.x, 0.0, 1.0), L = vHz.z;
        float n = hzN(vW.xz * 0.012 + vW.y * 0.02);
        // painted depth: the near layer stands darkest and bluest, the far ranges are barely darker than the air
        float depthK = L < 0.5 ? 1.25 : (L < 1.5 ? 1.0 : 0.42);
        float k = (0.1 + 0.42 * smoothstep(0.0, 0.85, h)) * (0.8 + 0.25 * n) * uK * depthK;
        // gullies: soft vertical shade streaks running down from the crests (angle around the peak x height)
        float gl = hzN(vec2(vHz.w * 40.0, h * 2.2 + n * 0.6));
        float side = vHz.y * (0.88 + 0.24 * smoothstep(0.35, 0.7, gl));
        vec3 tint = fogColor * mix(vec3(0.62, 0.7, 0.86), vec3(0.5, 0.6, 0.8), step(L, 0.5)) * (0.82 + 0.3 * side);
        // light on the crests (by day a touch of snow-white, at dusk / night a soft rim of the sky colour)
        float lum = dot(fogColor, vec3(0.33));
        tint = mix(tint, fogColor * 1.12 + 0.03, smoothstep(0.8, 1.0, h) * (0.25 + 0.3 * side) * smoothstep(0.2, 0.6, lum));
        gl_FragColor = vec4(mix(fogColor, tint, clamp(k, 0.0, 1.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: true,
  });
  const sil = new THREE.Mesh(g, silMat);
  sil.name = 'landforms_far_isles'; sil.frustumCulled = false; sil.renderOrder = -5;
  root.add(sil);

  // ---- cloud sea: annulus far out at low height ------------------------------------------------------------------
  const RIN = 1150, ROUT = 3900, RR = 8, SEG = 96;
  const cp = [], ci = [];
  for (let i = 0; i <= RR; i++) {
    const r = RIN + (ROUT - RIN) * Math.pow(i / RR, 1.4);
    for (let s = 0; s < SEG; s++) { const a = (s / SEG) * Math.PI * 2; cp.push(Math.cos(a) * r, 14, Math.sin(a) * r); }
  }
  for (let i = 0; i < RR; i++) for (let s = 0; s < SEG; s++) {
    const a = i * SEG + s, b = i * SEG + (s + 1) % SEG, c = a + SEG, d = b + SEG;
    ci.push(a, c, b, b, c, d);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  cg.setIndex(ci);
  cg.computeBoundingSphere();
  const cloudMat = new THREE.ShaderMaterial({
    name: 'landforms_cloudsea',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: LU.uTime }]),
    vertexShader: /* glsl */`
      varying vec3 vW; void main() { vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogColor; uniform float uTime; varying vec3 vW;
      ${NOISE}
      void main() {
        vec2 q = vW.xz * 0.0045 + vec2(uTime * 0.004, uTime * 0.0015);
        float n = hzN(q) * 0.5 + hzN(q * 2.3 + 3.1) * 0.3 + hzN(q * 5.1 - 1.7) * 0.2;
        float r = length(vW.xz);
        float a = smoothstep(1150.0, 1900.0, r) * smoothstep(0.32, 0.62, n);
        float lum = dot(fogColor, vec3(0.33));
        vec3 top = fogColor * 1.18 + vec3(0.05) * smoothstep(0.15, 0.5, lum);
        vec3 col = mix(fogColor * 0.92, top, smoothstep(0.45, 0.8, n));
        gl_FragColor = vec4(col, a * 0.92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  const clouds = new THREE.Mesh(cg, cloudMat);
  clouds.name = 'landforms_cloudsea'; clouds.frustumCulled = false; clouds.renderOrder = -4;
  root.add(clouds);
  return { isles, sil, clouds };
}
