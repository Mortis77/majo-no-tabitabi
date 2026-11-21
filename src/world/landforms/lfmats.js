// landforms — materials. Lit rock / grass go through toon() (hookMaterial, surface tags); the falling water, mist
// puffs, foam and crystal glow are small unlit shaders with three's standard fog (scene.fog follows the camera air).
import * as THREE from 'three';
import { toon } from '../../core/mats.js';

let _m = null;
export const LU = { uTime: { value: 0 } };

const NOISE = /* glsl */`
float lfH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lfN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lfH(i), lfH(i + vec2(1.0, 0.0)), f.x), mix(lfH(i + vec2(0.0, 1.0)), lfH(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

function fallMaterial() {
  // aFall: x = across (0..1), y = along (0 lip .. 1 bottom), z = length (m), w = seed
  return new THREE.ShaderMaterial({
    name: 'landforms_fall',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: LU.uTime }]),
    vertexShader: /* glsl */`
      attribute vec4 aFall; attribute vec3 color;
      varying vec4 vF; varying vec3 vC;
      #include <fog_pars_vertex>
      void main() { vF = aFall; vC = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec4 vF; varying vec3 vC;
      #include <common>
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        float u = vF.x, v = vF.y, L = max(vF.z, 1.0);
        float y = v * L;
        float s1 = lfN(vec2(u * 9.0 + vF.w, y * 0.22 - uTime * 2.6));
        float s2 = lfN(vec2(u * 23.0 - vF.w, y * 0.6 - uTime * 5.5));
        float streak = s1 * 0.6 + s2 * 0.4;
        float edge = smoothstep(0.0, 0.22, u) * smoothstep(0.0, 0.22, 1.0 - u);
        float body = 1.0 - smoothstep(0.45, 1.0, v + (streak - 0.5) * 0.25);   // dissolves into mist
        float a = edge * body * (0.35 + 0.65 * smoothstep(0.25, 0.75, streak + (1.0 - edge) * 0.2));
        // round 3: the sheet frays into separate strands and thins as it falls, then is gone into the mist
        float s3 = lfN(vec2(u * 14.0 + vF.w * 3.0, y * 0.05 - uTime * 0.6));
        a *= mix(1.0, smoothstep(0.4, 0.7, s3 * 0.7 + streak * 0.3), smoothstep(0.2, 0.7, v));
        a *= 1.0 - 0.5 * smoothstep(0.3, 0.75, v);
        a *= smoothstep(0.0, 0.02, v);
        vec3 col = vC * (0.82 + 0.45 * streak) + vC * 0.35 * (1.0 - smoothstep(0.0, 0.12, v));
        gl_FragColor = vec4(col, a * 0.9);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
}

function puffMaterial() {
  // billboard puffs: position = centre, aCorner = (-1..1, -1..1), aPuff = (size, alpha, seed, spin)
  return new THREE.ShaderMaterial({
    name: 'landforms_puff',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: LU.uTime }]),
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec4 aPuff; attribute vec3 color;
      uniform float uTime;
      varying vec2 vUv; varying vec3 vC; varying float vA; varying float vSeed;
      #include <fog_pars_vertex>
      void main() {
        vec3 c = position;
        float t = uTime * 0.15 + aPuff.z * 6.28;
        c.xz += vec2(sin(t), cos(t * 0.8)) * aPuff.x * 0.12;
        c.y += sin(t * 0.7) * aPuff.x * 0.05;
        vec4 mvPosition = modelViewMatrix * vec4(c, 1.0);
        float ang = aPuff.w * uTime + aPuff.z * 6.28;
        vec2 cr = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * aCorner;
        mvPosition.xy += cr * aPuff.x;
        gl_Position = projectionMatrix * mvPosition;
        vUv = aCorner; vC = color; vSeed = aPuff.z;
        float d = -mvPosition.z;
        vA = aPuff.y * smoothstep(aPuff.x * 0.6, aPuff.x * 2.2, d);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying vec3 vC; varying float vA; varying float vSeed;
      #include <common>
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        float r = length(vUv);
        float n = lfN(vUv * 2.2 + vSeed * 17.0 + uTime * 0.04) * 0.6 + lfN(vUv * 5.0 - vSeed * 9.0 - uTime * 0.07) * 0.4;
        float a = (1.0 - smoothstep(0.25, 1.0, r + (n - 0.5) * 0.55)) * vA;
        if (a < 0.004) discard;
        vec3 col = vC * (0.9 + 0.2 * n);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
}

function foamMaterial() {
  // flat rings on the water: aFoam = (across 0..1 (0 = at the rock), seed)
  return new THREE.ShaderMaterial({
    name: 'landforms_foam',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: LU.uTime }]),
    vertexShader: /* glsl */`
      attribute vec2 aFoam; attribute vec3 color; varying vec2 vF; varying vec3 vC; varying vec2 vW;
      #include <fog_pars_vertex>
      void main() { vF = aFoam; vC = color; vW = position.xz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vF; varying vec3 vC; varying vec2 vW;
      #include <common>
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        float k = vF.x;
        float n = lfN(vW * 0.9 + vec2(uTime * 0.3, -uTime * 0.2) + vF.y) * 0.6 + lfN(vW * 2.7 - uTime * 0.5) * 0.4;
        float wave = 0.5 + 0.5 * sin(k * 14.0 - uTime * 2.2 + vF.y * 6.0);
        float a = (1.0 - smoothstep(0.15, 1.0, k + (n - 0.5) * 0.6)) * smoothstep(0.35, 0.75, n * 0.7 + wave * 0.45);
        gl_FragColor = vec4(vC, a * 0.85);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

/** Shared landform materials (created once). */
export function lfMats() {
  if (_m) return _m;
  _m = {
    rock: toon(0xffffff, { vertexColors: true, surface: 'rock', look: { rim: 0.22, wrap: 0.35, trans: 0, bump: 1.25, spec: 0 } }),
    // grass caps, roots and vines: soft painterly, double-sided (blades)
    cap: toon(0xfffffe, { vertexColors: true, side: THREE.DoubleSide, surface: 'paint', look: { rim: 0.25, wrap: 0.5, trans: 0.35, detail: 0.6, spec: 0 } }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, name: 'landforms_glow' }),
    fall: fallMaterial(),
    puff: puffMaterial(),
    foam: foamMaterial(),
  };
  return _m;
}

/** Billboard puff buffer builder (merged quads). */
export class Puffs {
  constructor() { this.p = []; this.cr = []; this.pf = []; this.c = []; this.idx = []; this.n = 0; }
  add(x, y, z, size, alpha, col, spin = 0.05, seed = Math.random()) {
    const b = this.n * 4;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { this.p.push(x, y, z); this.cr.push(u, v); this.pf.push(size, alpha, seed, spin); this.c.push(col[0], col[1], col[2]); }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n++;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(this.cr, 2));
    g.setAttribute('aPuff', new THREE.Float32BufferAttribute(this.pf, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    // billboards extend past their centres
    let maxS = 0; for (let i = 0; i < this.pf.length; i += 4) maxS = Math.max(maxS, this.pf[i]);
    g.boundingSphere.radius += maxS * 1.5;
    return g;
  }
}
