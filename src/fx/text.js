// Floating world-space words and numbers (damage, "+1", status words). One instanced draw call over a canvas atlas of
// 32 slots; a string already drawn is reused (damage numbers repeat a lot). Pop-in with overshoot, ease-out rise,
// a little sideways drift, fade. Size is roughly constant on screen so it stays readable near and far.
// The caller passes an already translated string (see DESIGN §5.5); this module never makes up text.
import * as THREE from 'three';
import { t } from '../core/i18n.js';
import { fontsReady, whenFontsReady } from '../core/fonts.js';

const SW = 256, SH = 64, SCOLS = 4, SROWS = 8, NSLOT = SCOLS * SROWS;
const CAP = 64, STRIDE = 12;

const VERT = /* glsl */`
attribute vec2 corner;    // -0.5..0.5
attribute vec4 t0;        // position, birth
attribute vec4 t1;        // duration, size, slot, aspect (drawn width / slot height)
attribute vec4 t2;        // colour (linear), seed
uniform float uTime;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
void main() {
  float age = uTime - t0.w, dur = t1.x;
  if (age < 0.0 || age >= dur) { gl_Position = vec4(0.0, 0.0, 3.0, 1.0); return; }
  float t = age / dur;
  float rise = 1.0 - pow(1.0 - min(age / (dur * 0.8), 1.0), 3.0);
  vec4 mv = viewMatrix * vec4(t0.xyz + vec3(0.0, 0.2 + 1.2 * rise, 0.0), 1.0);
  float pop = age < 0.12 ? mix(0.3, 1.4, age / 0.12) : mix(1.4, 1.0, clamp((age - 0.12) / 0.14, 0.0, 1.0));
  float h = t1.y * clamp(-mv.z * 0.075, 0.3, 9.0) * pop;
  mv.xy += vec2(corner.x * t1.w, corner.y) * h;
  mv.x += (t2.w - 0.5) * 1.4 * rise * h;
  gl_Position = projectionMatrix * mv;
  float col = mod(t1.z, ${SCOLS}.0), row = floor(t1.z / ${SCOLS}.0);
  vUv = vec2((col * ${SW}.0 + ${SW / 2}.0 + corner.x * t1.w * ${SH}.0) / ${SW * SCOLS}.0,
             1.0 - (row * ${SH}.0 + ${SH / 2}.0 - corner.y * ${SH}.0) / ${SH * SROWS}.0);
  vCol = t2.rgb;
  vA = smoothstep(0.0, 0.04, age) * (1.0 - smoothstep(0.7, 1.0, t));
}
`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
void main() {
  vec4 tx = texture2D(uMap, vUv);
  float a = tx.a * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(tx.rgb * vCol, a);
  #include <colorspace_fragment>
}
`;

export class FloatText {
  constructor(renderOrder) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SW * SCOLS; this.canvas.height = SH * SROWS;
    this.g2 = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter; this.tex.magFilter = THREE.LinearFilter;
    this.slotKey = new Array(NSLOT).fill(null);
    this.slotAspect = new Float32Array(NSLOT);
    this.slotUse = new Float32Array(NSLOT).fill(-1e9);    // last time a text using the slot was spawned
    this.slotLive = new Float32Array(NSLOT).fill(-1e9);   // time until which the slot is on screen
    this.cache = new Map();
    this.texDirty = false;

    this.f = new Float32Array(CAP * STRIDE);
    this.head = 0; this.dirty = false;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.buf = new THREE.InstancedInterleavedBuffer(this.f, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 3; i++) g.setAttribute('t' + i, new THREE.InterleavedBufferAttribute(this.buf, 4, i * 4));
    g.instanceCount = CAP;
    this.uTime = { value: 0 };
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uTime: this.uTime },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fxText';
  }

  _slot(str, now, until) {
    let s = this.cache.get(str);
    if (s === undefined) {
      // free slot that has been unused longest; if every slot is on screen, steal the one that ends first
      let best = -1, bestT = Infinity;
      for (let i = 0; i < NSLOT; i++) if (this.slotLive[i] < now && this.slotUse[i] < bestT) { bestT = this.slotUse[i]; best = i; }
      if (best < 0) { for (let i = 0; i < NSLOT; i++) if (this.slotLive[i] < bestT) { bestT = this.slotLive[i]; best = i; } }
      s = best;
      if (this.slotKey[s] !== null) this.cache.delete(this.slotKey[s]);
      this.slotKey[s] = str; this.cache.set(str, s);
      this._draw(s, str);
    }
    this.slotUse[s] = now;
    if (until > this.slotLive[s]) this.slotLive[s] = until;
    return s;
  }

  _draw(s, str) {
    const c = this.g2, x0 = (s % SCOLS) * SW, y0 = Math.floor(s / SCOLS) * SH;
    c.clearRect(x0, y0, SW, SH);
    c.save();
    c.beginPath(); c.rect(x0, y0, SW, SH); c.clip();
    // brush face (the locale's title face); a word drawn before the faces arrive is forgotten once they do
    if (!fontsReady() && !this._waitFonts) { this._waitFonts = true; whenFontsReady(() => { this._waitFonts = false; this.invalidate(); }); }
    c.font = `400 50px ${t('core.meta.fontTitle')}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(str).width + 12;
    const k = Math.min(1, (SW - 8) / w);
    c.translate(x0 + SW / 2, y0 + SH / 2 + 2);
    c.scale(k, k);
    c.lineJoin = 'round';
    c.lineWidth = 10; c.strokeStyle = 'rgba(20,14,30,0.8)'; c.strokeText(str, 0, 0);
    c.lineWidth = 5; c.strokeStyle = 'rgba(10,6,16,1)'; c.strokeText(str, 0, 0);
    c.fillStyle = '#ffffff'; c.fillText(str, 0, 0);
    c.restore();
    this.slotAspect[s] = Math.min(SW, w * k + 4) / SH;
    this.texDirty = true;
  }

  /** col: THREE.Color (linear). */
  add(x, y, z, str, col, size, dur, now) {
    const s = this._slot(str, now, now + dur);
    const o = this.head * STRIDE, f = this.f;
    this.head = (this.head + 1) % CAP;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = now;
    f[o + 4] = dur; f[o + 5] = size; f[o + 6] = s; f[o + 7] = this.slotAspect[s];
    f[o + 8] = col.r; f[o + 9] = col.g; f[o + 10] = col.b; f[o + 11] = Math.random();
    this.dirty = true;
  }

  flush() {
    if (this.dirty) { this.dirty = false; this.buf.needsUpdate = true; }
    if (this.texDirty) { this.texDirty = false; this.tex.needsUpdate = true; }
  }

  live(now) { let n = 0; const f = this.f; for (let o = 0; o < f.length; o += STRIDE) if (f[o + 4] > 0 && now < f[o + 3] + f[o + 4]) n++; return n; }
  rebase(delta) {
    const f = this.f;
    for (let o = 3; o < f.length; o += STRIDE) f[o] -= delta;
    for (let i = 0; i < NSLOT; i++) { this.slotUse[i] -= delta; this.slotLive[i] -= delta; }
    this.dirty = true;
  }
  clear() { this.f.fill(0); this.dirty = true; }
  /** Locale changed: drawn words may now be wrong (font) — forget them. */
  invalidate() { this.cache.clear(); this.slotKey.fill(null); }
}
