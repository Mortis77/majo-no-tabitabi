// Ribbon trails (broom, charms, wings, blades of wind). Every trail owns one fixed slot of POINTS points inside a single
// shared geometry, so all trails together cost one draw call. Point 0 is the "live head": it follows the emitter every
// frame; a new point is committed behind it at a steady rhythm, the others slide back. Width and opacity come from each
// point's age, so a trail left alone simply thins out and disappears.
import * as THREE from 'three';
import { FX_OUT, FOG_PARS_VERT, FOG_VERT, fxMaterial } from './glsl.js';

export const MAX_TRAILS = 48, POINTS = 28;
const VS = 12;                 // floats per vertex in each of the two buffers
const PS = VS * 2;             // floats per point (two vertices)
const SLOT = POINTS * PS;      // floats per trail
const DEAD = -1e6;

const VERT = /* glsl */`
attribute vec4 r0;   // centre, birth
attribute vec4 r1;   // newer neighbour, side (-1 / +1)
attribute vec4 r2;   // older neighbour, -
attribute vec4 q0;   // head colour (linear), width
attribute vec4 q1;   // tail colour (linear), life
attribute vec4 q2;   // additive share, intensity, taper power, style
uniform float uTime;
varying vec3 vUv;    // across (-1..1), age fraction, style
varying vec3 vC0;
varying vec3 vC1;
varying vec2 vMix;   // additive share, intensity
${FOG_PARS_VERT}
void main() {
  float life = max(q1.w, 1e-3);
  float v = clamp((uTime - r0.w) / life, 0.0, 1.0);
  vec3 c = (viewMatrix * vec4(r0.xyz, 1.0)).xyz;
  vec3 a = (viewMatrix * vec4(r1.xyz, 1.0)).xyz;
  vec3 b = (viewMatrix * vec4(r2.xyz, 1.0)).xyz;
  vec3 side = cross(a - b, c);
  float sl = length(side);
  side = sl > 1e-7 ? side / sl : vec3(0.0);
  float w = q0.w * 0.5 * pow(max(1.0 - v, 0.0), q2.z) * smoothstep(-0.02, 0.07, v);
  vec4 mvPosition = vec4(c + side * (r1.w * w), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = vec3(r1.w, v, q2.w);
  vC0 = q0.rgb; vC1 = q1.rgb;
  vMix = q2.xy;
  ${FOG_VERT}
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uAmbient;
varying vec3 vUv;
varying vec3 vC0;
varying vec3 vC1;
varying vec2 vMix;
${FX_OUT}
void main() {
  float x = abs(vUv.x), v = vUv.y, style = vUv.z;
  float prof, core;
  if (style < 0.5) {            // soft glow ribbon
    prof = pow(max(1.0 - x, 0.0), 1.7);
    core = 1.0 - smoothstep(0.0, 0.4, x);
  } else if (style < 1.5) {     // flat band with a soft edge (cloth, wing membranes, wind blades)
    prof = 1.0 - smoothstep(0.72, 1.0, x);
    core = 0.0;
  } else if (style < 2.5) {     // streaked: several fine lines
    float lines = 0.55 + 0.45 * sin(vUv.x * 9.0 + v * 6.0);
    prof = pow(max(1.0 - x, 0.0), 1.2) * lines;
    core = 1.0 - smoothstep(0.0, 0.25, x);
  } else {                      // vfx comet: a hot thin core, a wide soft halo, beads of light running down it
    float beads = 0.72 + 0.28 * sin(v * 38.0 - uTime * 26.0);
    float coreL = exp(-x * x * 46.0) * (1.0 - smoothstep(0.7, 1.0, v));
    float fadeC = pow(max(1.0 - v, 0.0), 1.05);
    vec3 colC = mix(vC0, vC1, smoothstep(0.0, 0.55, v));
    vec3 addC = (colC * exp(-x * x * 3.0) * 0.62 * beads + mix(colC, vec3(1.0), 0.65) * coreL * 1.35) * vMix.y * fadeC;
    gl_FragColor = fxOut(addC, vec3(0.0), 0.0);
    return;
  }
  float fade = pow(max(1.0 - v, 0.0), 1.25);
  vec3 col = mix(vC0, vC1, smoothstep(0.0, 0.8, v));
  vec3 add = (col * prof + vec3(1.0) * core * (1.0 - v) * (1.0 - v) * 0.55) * (vMix.y * fade * vMix.x);
  float alpha = prof * fade * (1.0 - vMix.x) * min(vMix.y, 1.0);
  gl_FragColor = fxOut(add, col * uAmbient, alpha);
}
`;

class Trail {
  constructor(owner, slot) {
    this.owner = owner; this.slot = slot;
    this.active = false; this.stopped = true;
    this.n = 0; this.life = 0.5; this.interval = 0.02; this.sinceCommit = 0; this.lastPush = 0; this.minDist = 0.02;
    this.hx = 0; this.hy = 0; this.hz = 0;
  }
  /** Move the head of the trail to `pos` (call every frame while the thing moves). */
  push(pos) { if (this.active && !this.stopped) this.owner._push(this, pos.x, pos.y, pos.z); return this; }
  /** Stop feeding the trail; what is already drawn fades out by itself, then the slot is reused. */
  stop() { this.stopped = true; }
  /** Cut the ribbon (teleports): the next push starts a fresh strip. */
  reset() { if (this.active) { this.n = 0; this.owner._blank(this); } return this; }
  setColor(c0, c1) { if (this.active) this.owner._params(this, c0, c1 ?? c0); return this; }
  setWidth(w) { if (this.active) { this.width = w; this.owner._params(this); } return this; }
  /** vfx: change the look of a live trail { style, width, life, add, intensity, taper, c0, c1 (linear THREE.Color) }; keeps its points */
  restyle(o) {
    if (!this.active || !o) return this;
    if (o.style !== undefined) this.style = o.style;
    if (o.width !== undefined) this.width = o.width;
    if (o.life !== undefined) { this.life = o.life; this.interval = o.life / (POINTS - 3); }
    if (o.add !== undefined) this.add = o.add;
    if (o.intensity !== undefined) this.intensity = o.intensity;
    if (o.taper !== undefined) this.taper = o.taper;
    this.owner._params(this, o.c0, o.c1 ?? o.c0);
    return this;
  }
  remove() { this.stopped = true; }
}

export class Ribbons {
  constructor(renderOrder) {
    const nv = MAX_TRAILS * POINTS * 2;
    this.a = new Float32Array(nv * VS);
    this.b = new Float32Array(nv * VS);
    this.now = 0;
    this.trails = [];
    for (let i = 0; i < MAX_TRAILS; i++) this.trails.push(new Trail(this, i));
    this.free = MAX_TRAILS;
    this.loA = Infinity; this.hiA = 0; this.loB = Infinity; this.hiB = 0;   // dirty float ranges
    this.rangeA = { start: 0, count: 0 }; this.rangeB = { start: 0, count: 0 };

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    this.ba = new THREE.InterleavedBuffer(this.a, VS).setUsage(THREE.DynamicDrawUsage);
    this.bb = new THREE.InterleavedBuffer(this.b, VS).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 3; i++) g.setAttribute('r' + i, new THREE.InterleavedBufferAttribute(this.ba, 4, i * 4));
    for (let i = 0; i < 3; i++) g.setAttribute('q' + i, new THREE.InterleavedBufferAttribute(this.bb, 4, i * 4));
    const idx = new Uint16Array(MAX_TRAILS * (POINTS - 1) * 6);
    let k = 0;
    for (let s = 0; s < MAX_TRAILS; s++) {
      for (let i = 0; i < POINTS - 1; i++) {
        const v = (s * POINTS + i) * 2;
        idx[k++] = v; idx[k++] = v + 1; idx[k++] = v + 2; idx[k++] = v + 1; idx[k++] = v + 3; idx[k++] = v + 2;
      }
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    // side flags never change
    for (let v = 0; v < nv; v++) this.a[v * VS + 7] = v & 1 ? 1 : -1;
    this.material = fxMaterial({ uniforms: {}, vertexShader: VERT, fragmentShader: FRAG });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fxRibbons';
    this.mesh.onBeforeRender = () => {
      if (this.hiA > this.loA) {
        const r = this.rangeA; r.start = this.loA; r.count = this.hiA - this.loA;
        this.ba.updateRanges.length = 0; this.ba.updateRanges.push(r); this.ba.needsUpdate = true;
        this.loA = Infinity; this.hiA = 0;
      }
      if (this.hiB > this.loB) {
        const r = this.rangeB; r.start = this.loB; r.count = this.hiB - this.loB;
        this.bb.updateRanges.length = 0; this.bb.updateRanges.push(r); this.bb.needsUpdate = true;
        this.loB = Infinity; this.hiB = 0;
      }
    };
    this._c0 = new THREE.Color(); this._c1 = new THREE.Color();
  }

  /** opts: { color, color2, width, life, add, intensity, taper, style: 0 glow | 1 band | 2 streaks }. null when all slots are busy. */
  create(c0, c1, width, life, add, intensity, taper, style) {
    let tr = null;
    for (let i = 0; i < MAX_TRAILS; i++) if (!this.trails[i].active) { tr = this.trails[i]; break; }
    if (!tr) {   // steal the stopped trail that has been silent the longest
      let best = Infinity;
      for (let i = 0; i < MAX_TRAILS; i++) { const t = this.trails[i]; if (t.stopped && t.lastPush < best) { best = t.lastPush; tr = t; } }
      if (!tr) return null;
    } else this.free--;
    tr.active = true; tr.stopped = false; tr.n = 0;
    tr.life = life; tr.width = width; tr.add = add; tr.intensity = intensity; tr.taper = taper; tr.style = style;
    tr.interval = life / (POINTS - 3); tr.sinceCommit = 0; tr.lastPush = this.now;
    this._blank(tr);
    this._params(tr, c0, c1);
    return tr;
  }

  _params(tr, c0, c1) {
    if (c0) { tr.r0 = c0.r; tr.g0 = c0.g; tr.b0 = c0.b; }
    if (c1) { tr.r1 = c1.r; tr.g1 = c1.g; tr.b1 = c1.b; }
    const b = this.b;
    for (let v = tr.slot * POINTS * 2, e = v + POINTS * 2; v < e; v++) {
      const o = v * VS;
      b[o] = tr.r0; b[o + 1] = tr.g0; b[o + 2] = tr.b0; b[o + 3] = tr.width;
      b[o + 4] = tr.r1; b[o + 5] = tr.g1; b[o + 6] = tr.b1; b[o + 7] = tr.life;
      b[o + 8] = tr.add; b[o + 9] = tr.intensity; b[o + 10] = tr.taper; b[o + 11] = tr.style;
    }
    const base = tr.slot * SLOT;
    if (base < this.loB) this.loB = base;
    if (base + SLOT > this.hiB) this.hiB = base + SLOT;
  }

  _dirty(base, floats) {
    if (base < this.loA) this.loA = base;
    if (base + floats > this.hiA) this.hiA = base + floats;
  }

  _blank(tr) {
    const a = this.a, base = tr.slot * SLOT;
    for (let o = base; o < base + SLOT; o += VS) {
      a[o] = a[o + 1] = a[o + 2] = 0; a[o + 3] = DEAD;
      a[o + 4] = a[o + 5] = a[o + 6] = 0;
      a[o + 8] = a[o + 9] = a[o + 10] = 0;
    }
    this._dirty(base, SLOT);
  }

  _point(base, i, x, y, z, birth) {
    const a = this.a;
    for (let k = 0; k < 2; k++) { const o = base + i * PS + k * VS; a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = birth; }
  }
  _newer(base, i, x, y, z) { const a = this.a; for (let k = 0; k < 2; k++) { const o = base + i * PS + k * VS + 4; a[o] = x; a[o + 1] = y; a[o + 2] = z; } }
  _older(base, i, x, y, z) { const a = this.a; for (let k = 0; k < 2; k++) { const o = base + i * PS + k * VS + 8; a[o] = x; a[o + 1] = y; a[o + 2] = z; } }

  _push(tr, x, y, z) {
    const a = this.a, base = tr.slot * SLOT, now = this.now;
    tr.lastPush = now;
    if (tr.n === 0) {
      // every point starts collapsed on the first position; only the head is alive
      for (let i = 0; i < POINTS; i++) { this._point(base, i, x, y, z, i === 0 ? now : DEAD); this._newer(base, i, x, y, z); this._older(base, i, x, y, z); }
      tr.n = 1; tr.sinceCommit = 0; tr.hx = x; tr.hy = y; tr.hz = z; tr.cx = x; tr.cy = y; tr.cz = z;
      this._dirty(base, SLOT);
      return;
    }
    if (Math.abs(x - tr.hx) + Math.abs(y - tr.hy) + Math.abs(z - tr.hz) > 18) { tr.n = 0; this._push(tr, x, y, z); return; }   // teleported: start a new strip
    const moved = Math.hypot(x - tr.cx, y - tr.cy, z - tr.cz);
    let floats = PS * 2;
    if (tr.sinceCommit >= tr.interval && moved > tr.minDist) {
      floats = SLOT;
      // slide everything back one point; the old head becomes committed point 1
      a.copyWithin(base + PS, base, base + SLOT - PS);
      // the side flags travelled with the copy and are identical for every point: nothing to repair there
      this._point(base, 1, tr.hx, tr.hy, tr.hz, now - 0.0001);
      if (tr.n < POINTS) tr.n++;
      tr.sinceCommit = 0; tr.cx = tr.hx; tr.cy = tr.hy; tr.cz = tr.hz;
      // the last point has no older neighbour
      const L = POINTS - 1, lo = base + L * PS;
      this._older(base, L, a[lo], a[lo + 1], a[lo + 2]);
    }
    // head follows the emitter
    tr.hx = x; tr.hy = y; tr.hz = z;
    this._point(base, 0, x, y, z, now);
    this._newer(base, 0, x, y, z);
    const o1 = base + PS;
    this._older(base, 0, a[o1], a[o1 + 1], a[o1 + 2]);
    this._newer(base, 1, x, y, z);
    this._dirty(base, floats);
  }

  update(now, dt) {
    this.now = now;
    for (let i = 0; i < MAX_TRAILS; i++) {
      const tr = this.trails[i];
      if (!tr.active) continue;
      tr.sinceCommit += dt;
      if (tr.stopped && now - tr.lastPush > tr.life + 0.05) { tr.active = false; tr.n = 0; this.free++; this._blank(tr); }
    }
  }

  get activeCount() { return MAX_TRAILS - this.free; }

  rebase(delta) {
    const a = this.a;
    for (let o = 3; o < a.length; o += VS) if (a[o] > DEAD * 0.5) a[o] -= delta;
    for (const tr of this.trails) tr.lastPush -= delta;
    this.now -= delta;
    this._dirty(0, a.length);
  }

  clear() { for (const tr of this.trails) { if (tr.active) { tr.active = false; this.free++; } tr.stopped = true; tr.n = 0; this._blank(tr); } }
}
