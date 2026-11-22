// Magic circles, shield wards and starbursts — one instanced quad batch (one draw call), animated in the shader.
//
//   CIRCLE  layered rune circle: four layers painted into the four channels of one procedural texture
//           (R outer rune band · G star polygon · B inner glyph ring + hexagram · A star-sparkle core). Each layer
//           turns on its own (alternating directions), draws itself on around the ring like a pen (outer first), the
//           whole circle blooms in with a little overshoot and leaves with a flare (bright spike + widening), a collapse
//           or a soft fade. Facing any direction: vertical behind a raised wand, flat on the ground under the caster.
//   WARD    hexagonal lattice flash (a shield taking a blow): a ripple runs out from the centre through the cells.
//   BURST   camera-facing starburst (a perfect parry, a decisive hit): uneven rays, a hot core, a thin running ring.
//
// Handles (opts.handle) follow a position / facing every frame, take a 0..1 charge (layers appear one by one as the
// charge grows) and are released with release(style, dur). Fire-and-forget instances end by themselves.
// Every colour is sRGB hex in, linear in the buffer; additive light only, peak values stay under the bloom clamp.
import * as THREE from 'three';
import { FX_OUT, FOG_PARS_VERT, FOG_VERT, fxMaterial } from './glsl.js';

export const CIRCLE = 0, WARD = 1, BURST = 2;
export const OUT_FLARE = 0, OUT_COLLAPSE = 1, OUT_FADE = 2;
const STRIDE = 28;
const HELD = -1e6;      // release time of a held circle
const TAU = Math.PI * 2;

const VERT = /* glsl */`
attribute vec2 corner;   // -1..1
attribute vec4 d0;       // centre, birth
attribute vec4 d1;       // normal, radius
attribute vec4 d2;       // in-plane reference axis, spin (rad/s)
attribute vec4 d3;       // colour (linear), intensity
attribute vec4 d4;       // core tint (linear), layer mask (bits 1 2 4 8)
attribute vec4 d5;       // release time (-1e6 = held), out duration, out style, charge (-1 = by age)
attribute vec4 d6;       // draw-on time, style, seed, inner fill
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;       // rgb, intensity x envelope
varying vec4 vCore;      // rgb, flare spike
varying vec4 vAng;       // layer angles
varying vec4 vCos;       // their cosines / sines (one rotation per layer, computed once per vertex)
varying vec4 vSin;
varying vec4 vRev;       // layer reveal 0..1 (0 = layer off)
varying vec4 vPar;       // style, seed, age, fill
${FOG_PARS_VERT}
float backOut(float x) { float c = 1.70158; x -= 1.0; return 1.0 + (c + 1.0) * x * x * x + c * x * x; }
void main() {
  float age = uTime - d0.w;
  float relT = d5.x, outDur = max(d5.y, 1e-3);
  float o = relT < -1e5 ? 0.0 : clamp((uTime - relT) / outDur, 0.0, 1.0);
  if (age < 0.0 || o >= 1.0 || d1.w <= 0.0) { gl_Position = vec4(0.0, 0.0, 3.0, 1.0); return; }
  float style = d6.y;
  float drawT = max(d6.x, 0.02);
  float R = d1.w;
  float bright = 1.0, spike = 0.0;
  if (style < 0.5) {
    // bloom in: from 45 % with a small overshoot
    R *= mix(0.45, 1.0, backOut(min(age / clamp(drawT * 0.7, 0.08, 0.3), 1.0)));
    float os = d5.z;
    if (os < 0.5) {               // flare: a bright spike, the circle widens and thins away
      spike = exp(-o * 9.0) * step(1e-4, o);
      R *= 1.0 + 0.45 * (1.0 - (1.0 - o) * (1.0 - o));
      bright = pow(1.0 - o, 1.4) * (1.0 + 1.2 * spike);
    } else if (os < 1.5) {        // collapse into the centre
      R *= 1.0 - 0.8 * o * o;
      bright = 1.0 - o;
    } else bright = pow(1.0 - o, 1.5);
  } else if (style < 1.5) {       // ward: snaps open, fades
    R *= mix(0.82, 1.0, 1.0 - pow(1.0 - min(age / 0.08, 1.0), 3.0));
    bright = pow(1.0 - o, 1.3);
  } else {                        // burst: pops out wide and fades
    R *= mix(0.3, 1.12, 1.0 - pow(1.0 - min(age / 0.12, 1.0), 3.0));
    bright = pow(1.0 - o, 1.2);
  }
  // layer reveal (pen drawing the circle): by charge when held, else by age; outer band first
  float ch = d5.w;
  vec4 th = vec4(0.0, 0.22, 0.45, 0.72);
  vec4 rev = ch >= 0.0 ? clamp((vec4(ch) - th) / 0.26, 0.0, 1.0)
                       : clamp((vec4(age) - th * drawT * 0.9) / drawT, 0.0, 1.0);
  float m = d4.w;
  vec4 bits = vec4(mod(m, 2.0), mod(floor(m / 2.0), 2.0), mod(floor(m / 4.0), 2.0), mod(floor(m / 8.0), 2.0));
  vRev = rev * bits;
  float sp = d2.w, sd = d6.z * 6.2831853;
  vAng = vec4(sp * 0.42 * age + sd, -sp * 0.7 * age - sd * 0.5, sp * 1.05 * age + sd * 1.7, -sp * 0.3 * age);
  vCos = cos(vAng); vSin = sin(vAng);
  vec4 mvPosition;
  if (style > 1.5) {
    mvPosition = viewMatrix * vec4(d0.xyz, 1.0);
    mvPosition.xy += corner * R;
  } else {
    vec3 n = normalize(d1.xyz + vec3(0.0, 1e-5, 0.0));
    vec3 rf = d2.xyz - n * dot(d2.xyz, n);
    vec3 tx = dot(rf, rf) > 1e-6 ? normalize(rf) : normalize(abs(n.y) < 0.99 ? cross(vec3(0.0, 1.0, 0.0), n) : vec3(1.0, 0.0, 0.0));
    vec3 tz = cross(n, tx);
    vec3 wp = d0.xyz + (tx * corner.x + tz * corner.y) * R;
    mvPosition = viewMatrix * vec4(wp, 1.0);
    mvPosition.xyz *= 1.0 - 0.006;            // a hair toward the eye: no z-fighting on the ground
  }
  gl_Position = projectionMatrix * mvPosition;
  vUv = corner;
  vCol = vec4(d3.rgb, d3.w * bright);
  vCore = vec4(d4.rgb, spike);
  vPar = vec4(style, d6.z, age, d6.w);
  ${FOG_VERT}
}
`;

const FRAG = /* glsl */`
uniform sampler2D uCircle;
uniform float uTime;
uniform float uGain;     // dimmer in the night grade (the lifted night look makes additive lines swell)
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vCore;
varying vec4 vAng;
varying vec4 vCos;
varying vec4 vSin;
varying vec4 vRev;
varying vec4 vPar;
${FX_OUT}
float hash1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
// one layer: rotated sample, drawn on around the ring with a hot pen tip at the drawing front (ang0 = angle of uv)
vec2 layer(vec2 uv, float ang0, float a, float c, float s, int ch, float rev) {
  if (rev <= 0.0) return vec2(0.0);
  vec2 q = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
  vec4 t = texture2D(uCircle, q * 0.5 + 0.5);
  float v = ch == 0 ? t.r : ch == 1 ? t.g : ch == 2 ? t.b : t.a;
  float f = fract((ang0 + a) / 6.2831853 + 0.25);
  float r2 = rev * 1.06;
  float vis = smoothstep(f, f + 0.06, r2);
  float tip = rev < 1.0 ? exp(-pow((f - r2 + 0.03) / 0.025, 2.0)) : 0.0;
  return vec2(v * vis, v * tip);
}
float hexD(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float style = vPar.x, seed = vPar.y, age = vPar.z;
  vec3 add;
  if (style < 0.5) {
    float ang0 = atan(vUv.y, vUv.x);
    vec2 l0 = layer(vUv, ang0, vAng.x, vCos.x, vSin.x, 0, vRev.x);
    vec2 l1 = layer(vUv, ang0, vAng.y, vCos.y, vSin.y, 1, vRev.y);
    vec2 l2 = layer(vUv, ang0, vAng.z, vCos.z, vSin.z, 2, vRev.z);
    vec2 l3 = layer(vUv, ang0, vAng.w, vCos.w, vSin.w, 3, vRev.w);
    float v = l0.x + l1.x * 0.9 + l2.x * 0.95 + l3.x * 1.05;
    float tip = l0.y + l1.y + l2.y + l3.y;
    float crisp = smoothstep(0.62, 0.95, v);
    // shimmer running round the ring
    float sweep = 0.85 + 0.25 * sin(ang0 * 3.0 - uTime * 3.1 + seed * 20.0);
    vec3 tone = vCol.rgb * v * sweep * 1.1 + vCore.rgb * (crisp * 0.42 + tip * 0.9);
    tone += vCol.rgb * exp(-r * r * 2.6) * 0.07 * vPar.w;          // light pooled inside the circle
    tone += vCore.rgb * vCore.a * (v * 0.9 + exp(-r * r * 5.0) * 0.35);   // the flare's white spike
    add = tone * vCol.a;
  } else if (style < 1.5) {
    // hexagonal ward: lattice lines, a ripple running out through the cells, a bright rim
    vec2 p = vUv * 3.1;
    vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(p, s) - s * 0.5, b = mod(p - s * 0.5, s) - s * 0.5;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    float e = 0.5 - hexD(g);
    float line = 1.0 - smoothstep(0.0, 0.045, e);
    float front = age * 3.4;
    float ring = exp(-pow((r - front) / 0.16, 2.0));
    float disc = 1.0 - smoothstep(0.82, 1.0, r);
    float rim = exp(-pow((r - 0.93) / 0.05, 2.0));
    float cell = 0.06 + 0.1 * hash1(floor(g.x * 7.0 + p.x) + floor(p.y) * 13.0 + seed * 31.0);
    float lum = (line * (0.35 + 1.6 * ring) + cell * ring) * disc + rim * 0.8;
    add = (vCol.rgb * lum + vCore.rgb * line * ring * disc * 0.7) * vCol.a;
  } else {
    // starburst: uneven rays in two sets, a hot core, a thin ring running out
    float ang = atan(vUv.y, vUv.x) / 6.2831853 + 0.5 + seed;
    float N = 14.0;
    float k = floor(ang * N), fr = fract(ang * N) - 0.5;
    float len = mix(0.42, 1.0, hash1(k + seed * 17.0));
    float w = mix(0.05, 0.16, hash1(k * 3.1 + 5.0)) * (1.0 - r / len);
    float ray = (1.0 - smoothstep(w * 0.25, w, abs(fr))) * step(r, len) * pow(max(1.0 - r / len, 0.0), 0.7);
    float k2 = floor(ang * N + 0.5), fr2 = fract(ang * N + 0.5) - 0.5;
    float len2 = mix(0.25, 0.6, hash1(k2 * 7.7 + seed * 5.0));
    float ray2 = (1.0 - smoothstep(0.01, 0.045, abs(fr2))) * step(r, len2) * (1.0 - r / len2) * 0.7;
    float core = exp(-r * r * 40.0) * 0.8 + exp(-r * r * 7.0) * 0.14;
    float ringR = 0.2 + age * 3.2;
    float ring = exp(-pow((r - ringR) / 0.03, 2.0)) * (1.0 - smoothstep(0.7, 1.0, ringR));
    float lum = (ray + ray2) * 1.25 + core + ring * 0.8;
    add = (vCol.rgb * lum + vCore.rgb * (core + ray * 0.45)) * vCol.a;
  }
  gl_FragColor = fxOut(add * uGain, vec3(0.0), 0.0);
}
`;

// ---- the painted texture: four layers, one per channel -------------------------------------------------------------
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return (h >>> 0) / 4294967295; };

/** An invented glyph (no real script) in a w x h cell centred at 0,0, drawn with the current stroke. */
function glyph(g, w, h, seed) {
  const r = (k) => hash(seed, k);
  g.beginPath();
  const kind = r(1);
  if (kind < 0.25) {                       // stem with a hook and a cross tick
    g.moveTo(0, -h * 0.5); g.lineTo(0, h * 0.3); g.quadraticCurveTo(0, h * 0.5, w * 0.4 * (r(2) < 0.5 ? 1 : -1), h * 0.45);
    g.moveTo(-w * 0.35, -h * (0.1 + 0.2 * r(3))); g.lineTo(w * 0.35, -h * (0.1 + 0.2 * r(3)) + h * 0.12);
  } else if (kind < 0.5) {                 // zig with a tail
    g.moveTo(-w * 0.4, -h * 0.45); g.lineTo(w * 0.35, -h * 0.15); g.lineTo(-w * 0.3, h * 0.15); g.lineTo(w * 0.4, h * 0.45);
  } else if (kind < 0.75) {                // open bowl over a bar
    g.moveTo(-w * 0.4, -h * 0.4); g.quadraticCurveTo(0, h * 0.35, w * 0.4, -h * 0.4);
    g.moveTo(-w * 0.3, h * 0.42); g.lineTo(w * 0.3, h * 0.42);
  } else {                                 // two leaning strokes and a dot
    g.moveTo(-w * 0.3, h * 0.45); g.lineTo(-w * 0.05, -h * 0.45); g.moveTo(w * 0.05, h * 0.45); g.lineTo(w * 0.32, -h * 0.2);
  }
  g.stroke();
  if (r(4) < 0.45) { g.beginPath(); g.arc(w * (r(5) - 0.5) * 0.6, -h * 0.62, Math.max(1.2, w * 0.08), 0, TAU); g.fill(); }
}

export function makeCircleTexture(N = 512) {
  const R = N / 2 - 8;
  const paint = (draw) => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.translate(N / 2, N / 2);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    g.save(); g.filter = 'blur(5px)'; g.globalAlpha = 0.5; draw(g); g.restore();
    draw(g);
    return g.getImageData(0, 0, N, N).data;
  };
  const circle = (g, r, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
  const band = (g, n, rc, w, h, lw, seed) => {
    g.lineWidth = lw;
    for (let i = 0; i < n; i++) {
      g.save(); g.rotate((i / n) * TAU); g.translate(0, -rc);
      glyph(g, w, h, seed + i * 7);
      g.restore();
    }
  };
  // R: outer rune band
  const outer = paint((g) => {
    circle(g, R * 0.985, 5); circle(g, R * 0.94, 2); circle(g, R * 0.8, 2.6); circle(g, R * 0.765, 1.4);
    g.lineWidth = 1.6;
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * TAU, r0 = R * (i % 4 === 0 ? 0.985 : 0.965);
      g.beginPath(); g.moveTo(Math.cos(a) * R * 0.94, Math.sin(a) * R * 0.94); g.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); g.stroke();
    }
    band(g, 20, R * 0.87, R * 0.075, R * 0.095, 2.6, 11);
    for (let i = 0; i < 20; i++) { const a = ((i + 0.5) / 20) * TAU; g.beginPath(); g.arc(Math.cos(a) * R * 0.87, Math.sin(a) * R * 0.87, 2.2, 0, TAU); g.fill(); }
  });
  // G: star polygon {8/3} with knots at the points, short arcs between them
  const star = paint((g) => {
    const rs = R * 0.7;
    circle(g, rs, 2.4);
    g.lineWidth = 2.6; g.beginPath();
    for (let i = 0; i <= 8; i++) { const a = ((i * 3) % 8) / 8 * TAU - Math.PI / 2; const x = Math.cos(a) * rs, y = Math.sin(a) * rs; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2;
      g.lineWidth = 2; g.beginPath(); g.arc(Math.cos(a) * rs, Math.sin(a) * rs, R * 0.04, 0, TAU); g.stroke();
      g.beginPath(); g.arc(Math.cos(a) * rs, Math.sin(a) * rs, R * 0.014, 0, TAU); g.fill();
      const b = a + TAU / 16;
      g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, R * 0.6, b - 0.16, b + 0.16); g.stroke();
    }
  });
  // B: inner glyph ring, hexagram
  const inner = paint((g) => {
    circle(g, R * 0.46, 3); circle(g, R * 0.43, 1.3); circle(g, R * 0.31, 2.2);
    band(g, 12, R * 0.372, R * 0.05, R * 0.06, 2, 53);
    g.lineWidth = 2.2;
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) { const a = (i / 3) * TAU + k * Math.PI - Math.PI / 2; const x = Math.cos(a) * R * 0.31, y = Math.sin(a) * R * 0.31; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
  });
  // A: the core — a four-point star sparkle in a ring, fine spokes
  const core = paint((g) => {
    circle(g, R * 0.165, 4);
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? R * 0.045 : R * 0.15; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath(); g.fill();
    g.lineWidth = 1.8;
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, r1 = R * (i % 2 ? 0.2 : 0.225); g.beginPath(); g.moveTo(Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
    g.lineWidth = 2.4; g.beginPath(); g.arc(0, 0, R * 0.25, 0.3, TAU * 0.42); g.stroke(); g.beginPath(); g.arc(0, 0, R * 0.25, Math.PI + 0.3, Math.PI + TAU * 0.42); g.stroke();
  });
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const k = i * 4 + 3;
    data[i * 4] = outer[k]; data[i * 4 + 1] = star[k]; data[i * 4 + 2] = inner[k]; data[i * 4 + 3] = core[k];
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---- the pool --------------------------------------------------------------------------------------------------------
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

class CircleHandle {
  constructor(pool, slot, gen) {
    this.pool = pool; this.slot = slot; this.gen = gen;
    this.pos = new THREE.Vector3(); this.normal = new THREE.Vector3(0, 1, 0); this.ref = new THREE.Vector3();
    this.radius = 1; this.charge = -1; this.released = false; this.relAt = 0;
  }
  get alive() { return this.pool.gen[this.slot] === this.gen && this.pool.f[this.slot * STRIDE + 7] > 0 && (!this.released || this.pool.now < this.relAt); }
  /** Start the leaving animation: 'flare' (bright spike, widens), 'collapse' (shrinks into the centre) or 'fade'. */
  release(style = 'flare', dur = 0.3) {
    if (this.released || this.pool.gen[this.slot] !== this.gen) return this;
    this.released = true;
    const o = this.slot * STRIDE, f = this.pool.f;
    f[o + 20] = this.pool.now; f[o + 21] = dur; f[o + 22] = style === 'collapse' ? OUT_COLLAPSE : style === 'fade' ? OUT_FADE : OUT_FLARE;
    this.relAt = this.pool.now + dur;
    this.pool.endAt[this.slot] = this.relAt;
    this.pool.dirty = true;
    return this;
  }
  kill() { if (this.pool.gen[this.slot] === this.gen) { this.pool.f[this.slot * STRIDE + 7] = 0; this.pool.endAt[this.slot] = -1; this.pool.dirty = true; } this.released = true; }
  setColor(hex, core) { if (this.pool.gen[this.slot] !== this.gen) return this; const o = this.slot * STRIDE, f = this.pool.f; if (hex !== undefined) { _c.set(hex); f[o + 12] = _c.r; f[o + 13] = _c.g; f[o + 14] = _c.b; } if (core !== undefined) { _c.set(core); f[o + 16] = _c.r; f[o + 17] = _c.g; f[o + 18] = _c.b; } this.pool.dirty = true; return this; }
  setIntensity(I) { if (this.pool.gen[this.slot] === this.gen) { this.pool.f[this.slot * STRIDE + 15] = I; this.pool.dirty = true; } return this; }
  setLayers(mask) { if (this.pool.gen[this.slot] === this.gen) { this.pool.f[this.slot * STRIDE + 19] = mask; this.pool.dirty = true; } return this; }
}

export class Circles {
  constructor(capacity, texture, renderOrder) {
    this.cap = capacity;
    this.f = new Float32Array(capacity * STRIDE);
    this.endAt = new Float32Array(capacity).fill(-1);
    this.gen = new Uint32Array(capacity);
    this.handles = new Array(capacity).fill(null);
    this.now = 0; this.dirty = false; this.next = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.buf = new THREE.InstancedInterleavedBuffer(this.f, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 7; i++) g.setAttribute('d' + i, new THREE.InterleavedBufferAttribute(this.buf, 4, i * 4));
    g.instanceCount = capacity;
    this.material = fxMaterial({ uniforms: { uCircle: { value: texture }, uGain: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fxCircles';
    this.mesh.onBeforeRender = () => this.flush();
  }

  /** A free slot: an expired one, else the oldest fire-and-forget one (held handles are never stolen). */
  _slot() {
    const n = this.cap, now = this.now;
    for (let k = 0; k < n; k++) {
      const i = (this.next + k) % n;
      if (this.endAt[i] < now && !(this.handles[i] && !this.handles[i].released)) { this.next = (i + 1) % n; return i; }
    }
    let best = -1, bt = Infinity;
    for (let i = 0; i < n; i++) { const h = this.handles[i]; if (h && !h.released) continue; if (this.endAt[i] < bt) { bt = this.endAt[i]; best = i; } }
    return best;
  }

  /**
   * o: { pos, normal, ref, radius, color, core, intensity, spin, layers (mask 1..15), dur, outDur, out ('flare'|'collapse'|'fade'),
   *      draw (seconds to draw on), style (CIRCLE|WARD|BURST), fill, delay, handle (bool), charge, tracked (bool) }
   * Returns a handle (o.handle), a kill function (o.tracked) or true; null when the pool is full of held circles.
   */
  add(o) {
    const s = this._slot();
    if (s < 0) return null;
    const f = this.f, b = s * STRIDE, now = this.now;
    const gen = ++this.gen[s];
    const p = o.pos, n = o.normal || UP, rf = o.ref;
    const birth = now + (o.delay || 0);
    const held = !!o.handle;
    const dur = Math.max(0.05, o.dur ?? 1);
    const outDur = Math.max(0.03, o.outDur ?? Math.min(0.4, dur * 0.35));
    f[b] = p.x; f[b + 1] = p.y; f[b + 2] = p.z; f[b + 3] = birth;
    f[b + 4] = n.x; f[b + 5] = n.y; f[b + 6] = n.z; f[b + 7] = o.radius ?? 1;
    f[b + 8] = rf ? rf.x : 0; f[b + 9] = rf ? rf.y : 0; f[b + 10] = rf ? rf.z : 0; f[b + 11] = o.spin ?? 0.8;
    _c.set(o.color ?? 0xffd98a); f[b + 12] = _c.r; f[b + 13] = _c.g; f[b + 14] = _c.b; f[b + 15] = o.intensity ?? 1.4;
    _c.set(o.core ?? 0xfff6e6); f[b + 16] = _c.r; f[b + 17] = _c.g; f[b + 18] = _c.b; f[b + 19] = o.layers ?? 15;
    f[b + 20] = held ? HELD : birth + dur - outDur; f[b + 21] = outDur; f[b + 22] = o.out === 'collapse' ? OUT_COLLAPSE : o.out === 'fade' ? OUT_FADE : OUT_FLARE; f[b + 23] = o.charge ?? -1;
    f[b + 24] = o.draw ?? 0.25; f[b + 25] = o.style ?? CIRCLE; f[b + 26] = Math.random(); f[b + 27] = o.fill ?? 1;
    this.endAt[s] = held ? Infinity : birth + dur;
    this.handles[s] = null;
    this.dirty = true;
    if (held) {
      const h = new CircleHandle(this, s, gen);
      h.pos.copy(p); h.normal.copy(n); if (rf) h.ref.copy(rf); h.radius = o.radius ?? 1; h.charge = o.charge ?? -1;
      this.handles[s] = h;
      return h;
    }
    if (o.tracked) return () => { if (this.gen[s] === gen) { f[b + 7] = 0; this.endAt[s] = -1; this.dirty = true; } };
    return true;
  }

  /** Per frame: held handles write their position / facing / radius / charge; released handles free their slot. */
  update(now) {
    this.now = now;
    const f = this.f;
    for (let s = 0; s < this.cap; s++) {
      const h = this.handles[s];
      if (!h) continue;
      if (this.gen[s] !== h.gen || (h.released && now >= h.relAt) || f[s * STRIDE + 7] <= 0) { this.handles[s] = null; continue; }
      if (h.released) continue;
      const b = s * STRIDE;
      f[b] = h.pos.x; f[b + 1] = h.pos.y; f[b + 2] = h.pos.z;
      f[b + 4] = h.normal.x; f[b + 5] = h.normal.y; f[b + 6] = h.normal.z; f[b + 7] = Math.max(1e-3, h.radius);
      f[b + 8] = h.ref.x; f[b + 9] = h.ref.y; f[b + 10] = h.ref.z;
      f[b + 23] = h.charge;
      this.dirty = true;
    }
  }

  flush() { if (this.dirty) { this.dirty = false; this.buf.needsUpdate = true; } }
  live(now) { let n = 0; for (let s = 0; s < this.cap; s++) if (this.endAt[s] > now && this.f[s * STRIDE + 7] > 0) n++; return n; }
  rebase(d) {
    const f = this.f;
    for (let s = 0; s < this.cap; s++) {
      const b = s * STRIDE;
      f[b + 3] -= d; if (f[b + 20] > HELD * 0.5) f[b + 20] -= d;
      this.endAt[s] -= d;
      if (this.endAt[s] < -10) f[b + 7] = 0;          // long gone: keep it culled
      const h = this.handles[s]; if (h) h.relAt -= d;
    }
    this.now -= d; this.dirty = true;
  }
  clear() { this.f.fill(0); this.endAt.fill(-1); for (let s = 0; s < this.cap; s++) { if (this.handles[s]) this.handles[s].released = true; this.handles[s] = null; this.gen[s]++; } this.dirty = true; }
}
