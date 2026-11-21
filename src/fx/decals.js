// Ground decals: expanding shock rings, spinning magic circles and soft light pools. One instanced draw call,
// ring buffer, everything animated in the shader from (birth, duration).
import * as THREE from 'three';
import { FX_OUT, FOG_PARS_VERT, FOG_VERT, fxMaterial } from './glsl.js';

export const RING = 0, SIGIL = 1, DISC = 2;
const STRIDE = 16;

const VERT = /* glsl */`
attribute vec2 corner;   // -1..1
attribute vec4 d0;       // centre, birth
attribute vec4 d1;       // normal, duration
attribute vec4 d2;       // colour (linear), radius
attribute vec4 d3;       // style, spin (rad/s), intensity, thickness (ring) or start angle (sigil)
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vPar;
${FOG_PARS_VERT}
void main() {
  float age = uTime - d0.w;
  float dur = d1.w;
  if (age < 0.0 || age >= dur) { gl_Position = vec4(0.0, 0.0, 3.0, 1.0); return; }
  float t = age / dur;
  vec3 n = normalize(d1.xyz);
  vec3 tx = normalize(abs(n.y) < 0.99 ? cross(vec3(0.0, 1.0, 0.0), n) : vec3(1.0, 0.0, 0.0));
  vec3 tz = cross(n, tx);
  float style = d3.x;
  float R = d2.w;
  vec2 c = corner;
  if (style > 0.5 && style < 1.5) {
    float a = d3.y * age + d3.w;
    float cs = cos(a), sn = sin(a);
    c = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
    float pop = 1.0 - pow(1.0 - min(t / 0.16, 1.0), 3.0);
    R *= mix(0.5, 1.0, pop);
  }
  vec3 wp = d0.xyz + (tx * c.x + tz * c.y) * R;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  mvPosition.xyz *= 1.0 - 0.012;                 // pull a hair toward the eye: no z-fighting with the ground
  gl_Position = projectionMatrix * mvPosition;
  vUv = corner;
  vCol = vec4(d2.rgb, d3.z);
  vPar = vec4(t, style, d3.w, d0.x * 0.37 + d0.z * 0.71);
  ${FOG_VERT}
}
`;

const FRAG = /* glsl */`
uniform sampler2D uSigil;
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vPar;
${FX_OUT}
void main() {
  float t = vPar.x, style = vPar.y;
  float r = length(vUv);
  vec3 add;
  if (style < 0.5) {
    if (r > 1.0) discard;
    float front = 0.1 + 0.86 * (1.0 - pow(1.0 - t, 2.8));
    float th = vPar.z;
    float ang = atan(vUv.y, vUv.x);
    float nz = 0.5 + 0.27 * sin(ang * 7.0 + vPar.w * 3.0 + t * 2.0) + 0.23 * sin(ang * 13.0 - t * 7.0 + vPar.w);   // periodic: no seam
    float tail = th * (0.5 + 1.1 * nz);
    float edge = smoothstep(front - tail, front, r) * (1.0 - smoothstep(front, front + 0.02 + 0.03 * t, r));
    float fill = smoothstep(front * 0.3, front, r) * step(r, front) * 0.1;
    float fade = pow(1.0 - t, 1.5);
    float rim = smoothstep(front - th * 0.22, front, r) * (1.0 - smoothstep(front, front + 0.02, r));
    add = vCol.rgb * (edge + fill) * fade * vCol.a + vec3(1.0) * rim * fade * fade * vCol.a * 0.55;
  } else if (style < 1.5) {
    vec4 tx = texture2D(uSigil, vUv * 0.5 + 0.5);
    float env = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.7, 1.0, t));
    float pulse = 0.82 + 0.18 * sin(uTime * 8.0 + vPar.w);
    float sweep = 0.8 + 0.3 * sin(atan(vUv.y, vUv.x) * 3.0 - uTime * 2.4 + vPar.w);
    add = (vCol.rgb * tx.r * sweep + vec3(1.0) * tx.r * tx.r * tx.r * 0.4) * env * pulse * vCol.a;
    add += vCol.rgb * exp(-r * r * 3.0) * 0.12 * env * vCol.a;           // faint light pooled inside the circle
  } else {
    if (r > 1.0) discard;
    float g = max(exp(-r * r * 4.6) - 0.01, 0.0);
    float env = smoothstep(0.0, 0.07, t) * pow(1.0 - t, 1.6);
    add = vCol.rgb * g * env * vCol.a;
  }
  gl_FragColor = fxOut(add, vec3(0.0), 0.0);
}
`;

export class Decals {
  constructor(capacity, sigilTexture, renderOrder) {
    this.cap = capacity;
    this.generations = new Uint32Array(capacity);
    this.f = new Float32Array(capacity * STRIDE);
    this.head = 0; this.dirty = false;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.buf = new THREE.InstancedInterleavedBuffer(this.f, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 4; i++) g.setAttribute('d' + i, new THREE.InterleavedBufferAttribute(this.buf, 4, i * 4));
    g.instanceCount = capacity;
    this.material = fxMaterial({ uniforms: { uSigil: { value: sigilTexture } }, vertexShader: VERT, fragmentShader: FRAG });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fxDecals';
    this.mesh.onBeforeRender = () => { if (this.dirty) { this.dirty = false; this.buf.needsUpdate = true; } };
  }

  /** col: THREE.Color (linear). p3 = thickness for RING, start angle for SIGIL. */
  add(style, x, y, z, nx, ny, nz, col, radius, birth, dur, intensity, spin, p3, tracked = false) {
    const slot = this.head, generation = ++this.generations[slot];
    const o = slot * STRIDE, f = this.f;
    this.head = this.head + 1 === this.cap ? 0 : this.head + 1;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = birth;
    f[o + 4] = nx; f[o + 5] = ny; f[o + 6] = nz; f[o + 7] = dur;
    f[o + 8] = col.r; f[o + 9] = col.g; f[o + 10] = col.b; f[o + 11] = radius;
    f[o + 12] = style; f[o + 13] = spin; f[o + 14] = intensity; f[o + 15] = p3;
    this.dirty = true;
    if (tracked) return () => {
      if (this.generations[slot] !== generation) return;
      f[o+7]=0;
      this.dirty=true;
    };
  }

  live(now) { let n = 0; const f = this.f; for (let o = 0; o < f.length; o += STRIDE) if (f[o + 7] > 0 && now < f[o + 3] + f[o + 7]) n++; return n; }
  rebase(delta) { const f = this.f; for (let o = 3; o < f.length; o += STRIDE) f[o] -= delta; this.dirty = true; }
  clear() { this.f.fill(0); this.dirty = true; }
}
