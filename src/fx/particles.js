// GPU particle pools. Every particle is one instanced quad whose whole life is ANALYTIC: the CPU writes 34 numbers
// once when it is born, the vertex shader does the rest (drag, gravity, wind, wobble, size/colour curves, fading).
// Ring buffers: the oldest particle is overwritten when a pool is full. Nothing is allocated after start-up.
//
// Two pools share one shader and one atlas:
//   GLOW (0) — additive light: sparks, flames, magic. Drawn last so it sits on top of smoke.
//   SOFT (1) — alpha blended, lit by the ambient light: smoke, dust, leaves, debris, water.
// A particle carries its own "additive" amount for birth and death, so a fire puff can start as light and end as soot.
import * as THREE from 'three';
import { COLS, ROWS } from './atlas.js';
import { FX_OUT, FOG_PARS_VERT, FOG_VERT, SRGB_TO_LINEAR, fxMaterial } from './glsl.js';
import { TAU } from '../core/util.js';

export const GLOW = 0, SOFT = 1;
/** Quad orientation modes. */
export const BILLBOARD = 0, STRETCH = 1, FLUTTER = 2, FLAT = 3, AXIS = 4;
/** Where the launch direction comes from. */
export const AIM_DIR = 0, AIM_NORMAL = 1, AIM_OUT = 2, AIM_RING = 3, AIM_SWIRL = 4;

const STRIDE = 32, CSTRIDE = 8;

const VERT = /* glsl */`
attribute vec4 a0; // position, birth time
attribute vec4 a1; // velocity, life
attribute vec4 a2; // wind (or normal / axis for FLAT / AXIS), gravity
attribute vec4 a3; // drag, size0, size1, size curve
attribute vec4 a4; // rot0, spin, sprite, mode
attribute vec4 a5; // stretch (or flutter speed), intensity0, intensity1, colour curve
attribute vec4 a6; // fade-in end, fade-out start, flicker amount, flicker speed
attribute vec4 a7; // wobble radius, wobble speed, seed, aspect
attribute vec4 c0; // rgb at birth, additive at birth
attribute vec4 c1; // rgb at death, additive at death
attribute vec2 corner; // quad corner (-0.5..0.5); the position attribute is all zeros so override materials draw nothing
uniform float uTime;
uniform vec3 uAmbient;
uniform vec2 uCell;
varying vec2 vUv;
varying vec3 vAdd;
varying vec3 vBase;
varying float vAlpha;
${FOG_PARS_VERT}
${SRGB_TO_LINEAR}
void main() {
  float age = uTime - a0.w;
  float life = a1.w;
  if (age < 0.0 || age >= life) { gl_Position = vec4(0.0, 0.0, 3.0, 1.0); return; }
  float t = age / life;
  float mode = a4.w;
  float seed = a7.z;

  // closed-form motion under linear drag k:  v' = g - k (v - wind)
  float k = max(a3.x, 0.05);
  float e = exp(-k * age);
  float f = (1.0 - e) / k;
  vec3 vt = vec3(0.0, a2.w / k, 0.0);
  if (mode < 2.5) vt += a2.xyz;
  vec3 p = a0.xyz + a1.xyz * f + vt * (age - f);
  vec3 vel = vt + (a1.xyz - vt) * e;
  if (a7.x > 0.0) {
    float ph = age * a7.y + seed * 43.0;
    p += a7.x * min(age * 1.6, 1.0) * vec3(sin(ph), 0.6 * sin(ph * 0.73 + seed * 17.0), cos(ph * 0.91 + seed * 29.0));
  }

  float size = mix(a3.y, a3.z, 1.0 - pow(1.0 - t, a3.w));
  vec2 q = corner;
  float rot = a4.x + a4.y * age;
  float cr = cos(rot), sr = sin(rot);
  vec4 mvPosition;
  if (mode < 0.5 || (mode > 1.5 && mode < 2.5)) {          // camera-facing (FLUTTER flips around its own axis)
    vec2 c = q * vec2(a7.w, 1.0);
    if (mode > 1.5) c.x *= cos(age * a5.x + seed * 6.2832);
    c = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr) * size;
    mvPosition = viewMatrix * vec4(p, 1.0);
    mvPosition.xy += c;
  } else if (mode < 1.5 || mode > 3.5) {                   // long axis = velocity (STRETCH) or a fixed axis (AXIS)
    vec3 axis; float len;
    if (mode < 1.5) {
      float sp = length(vel);
      axis = sp > 1e-4 ? vel / sp : vec3(0.0, 1.0, 0.0);
      len = size * (1.0 + a5.x * sp);
    } else {
      axis = normalize(a2.xyz);
      len = size;
      q.y += 0.5;                                          // AXIS grows from its base
    }
    vec3 side = cross(axis, cameraPosition - p);
    float sl = length(side);
    side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
    vec3 wp = p + axis * (q.y * len) + side * (q.x * size * a7.w);
    mvPosition = viewMatrix * vec4(wp, 1.0);
  } else {                                                  // FLAT: lies in the plane with normal a2.xyz
    vec3 n = normalize(a2.xyz);
    vec3 tx = normalize(abs(n.y) < 0.99 ? cross(vec3(0.0, 1.0, 0.0), n) : vec3(1.0, 0.0, 0.0));
    vec3 ty = cross(n, tx);
    vec2 c = vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr) * size;
    mvPosition = viewMatrix * vec4(p + tx * c.x + ty * c.y, 1.0);
  }
  gl_Position = projectionMatrix * mvPosition;

  float sprite = a4.z;
  float col = mod(sprite, ${COLS}.0), row = floor(sprite / ${COLS}.0);
  vec2 uv = corner + 0.5;
  uv = uv * 0.984 + 0.008;
  vUv = vec2((col + uv.x) * uCell.x, 1.0 - (row + 1.0 - uv.y) * uCell.y);

  float ct = pow(t, a5.w);
  vec3 tint = fxLinear(mix(c0.rgb, c1.rgb, ct));
  float add = mix(c0.a, c1.a, ct);
  float inten = mix(a5.y, a5.z, t);
  inten *= 1.0 - a6.z * (0.5 + 0.5 * sin(age * a6.w + seed * 51.0));
  float env = clamp(t / max(a6.x, 1e-4), 0.0, 1.0) * (1.0 - smoothstep(a6.y, 1.0, t));
  env *= smoothstep(0.35, 1.6, -mvPosition.z);              // never slap a big quad across the lens
  // HDR budget for the additive part: soft-compress intensity above 2 (5 -> 3.4) and dim quads that cover a big part
  // of the screen, so a stack of flashes / glows reads as glowing colour, never as a white sheet
  float iAdd = inten <= 2.0 ? inten : 2.0 + log(inten - 1.0);
  float scr = size * projectionMatrix[1][1] / max(-mvPosition.z, 0.1);
  iAdd /= 1.0 + max(scr - 0.25, 0.0) * 2.5;
  vAdd = tint * (iAdd * env * add);
  vBase = tint * uAmbient;
  vAlpha = clamp(inten, 0.0, 1.0) * env * (1.0 - add);
  ${FOG_VERT}
}
`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vAdd;
varying vec3 vBase;
varying float vAlpha;
${FX_OUT}
void main() {
  vec4 tx = texture2D(uMap, vUv);
  vec3 lum = tx.rgb / max(tx.a, 0.004);
  gl_FragColor = fxOut(tx.rgb * vAdd, lum * vBase, tx.a * vAlpha);
}
`;

const QUAD = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);

export class ParticlePool {
  constructor(capacity, atlasTexture, renderOrder) {
    this.cap = capacity;
    this.f = new Float32Array(capacity * STRIDE);
    this.c = new Uint8Array(capacity * CSTRIDE);
    this.head = 0;
    this.dirty = 0;        // particles written since the last upload
    this.dirtyStart = 0;
    this.spawned = 0;      // lifetime counter (stats)

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('corner', new THREE.BufferAttribute(QUAD, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.fb = new THREE.InstancedInterleavedBuffer(this.f, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    this.cb = new THREE.InstancedInterleavedBuffer(this.c, CSTRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 8; i++) g.setAttribute('a' + i, new THREE.InterleavedBufferAttribute(this.fb, 4, i * 4));
    g.setAttribute('c0', new THREE.InterleavedBufferAttribute(this.cb, 4, 0, true));
    g.setAttribute('c1', new THREE.InterleavedBufferAttribute(this.cb, 4, 4, true));
    g.instanceCount = capacity;
    this.ranges = [{ start: 0, count: 0 }, { start: 0, count: 0 }, { start: 0, count: 0 }, { start: 0, count: 0 }];

    this.material = fxMaterial({
      uniforms: { uMap: { value: atlasTexture }, uCell: { value: new THREE.Vector2(1 / COLS, 1 / ROWS) } },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'fxParticles' + renderOrder;
  }

  /** Reserve the next slot; returns its index. */
  alloc() {
    const i = this.head;
    this.head = i + 1 === this.cap ? 0 : i + 1;
    if (this.dirty === 0) this.dirtyStart = i;
    this.dirty++;
    this.spawned++;
    return i;
  }

  /** Upload what was written this frame (one or two sub-ranges of the ring). */
  flush() {
    const n = this.dirty;
    if (n === 0) return;
    this.dirty = 0;
    const fr = this.fb.updateRanges, cr = this.cb.updateRanges;
    fr.length = 0; cr.length = 0;
    if (n < this.cap) {
      const s = this.dirtyStart, first = Math.min(n, this.cap - s), R = this.ranges;
      R[0].start = s * STRIDE; R[0].count = first * STRIDE; fr.push(R[0]);
      R[2].start = s * CSTRIDE; R[2].count = first * CSTRIDE; cr.push(R[2]);
      if (first < n) {
        R[1].start = 0; R[1].count = (n - first) * STRIDE; fr.push(R[1]);
        R[3].start = 0; R[3].count = (n - first) * CSTRIDE; cr.push(R[3]);
      }
    }
    this.fb.needsUpdate = true; this.cb.needsUpdate = true;
  }

  /** Number of particles alive (or waiting to be born) at time `now`. O(capacity): for stats / tests only. */
  live(now) {
    let n = 0;
    const f = this.f;
    for (let o = 0, e = this.cap * STRIDE; o < e; o += STRIDE) if (f[o + 7] > 0 && now < f[o + 3] + f[o + 7]) n++;
    return n;
  }

  /** Shift every birth time (the clock is rebased now and then to keep float precision). */
  rebase(delta) {
    const f = this.f;
    for (let o = 3, e = this.cap * STRIDE; o < e; o += STRIDE) f[o] -= delta;
    this.dirty = this.cap;
  }

  clear() { this.f.fill(0); this.dirty = this.cap; this.head = 0; }
}

// ---- particle specs ----------------------------------------------------------------------------------------------

const pair = (v, d0, d1) => (v === undefined ? [d0, d1 === undefined ? d0 : d1] : typeof v === 'number' ? [v, v] : v);
function colours(v) {
  const list = v === undefined ? [0xffffff] : typeof v === 'number' ? [v] : v;
  const out = new Uint8Array(list.length * 3);
  list.forEach((h, i) => { out[i * 3] = (h >> 16) & 255; out[i * 3 + 1] = (h >> 8) & 255; out[i * 3 + 2] = h & 255; });
  return out;
}

/**
 * Normalise a particle spec (fills defaults, expands shorthand). Call ONCE at module load, then pass the result to emit().
 *   pool GLOW|SOFT       sprite id | [ids]      mode BILLBOARD|STRETCH|FLUTTER|FLAT|AXIS
 *   r        spawn inside a sphere of this radius (shell:true = on its surface)   ring   spawn on a circle (plane ⟂ normal); disc:true fills it
 *   axisOut  AXIS mode: the long axis is the particle's own launch direction instead of ctx.d
 *   h [a,b]  offset along the normal                     along [a,b] offset along the direction
 *   aim AIM_DIR|AIM_NORMAL|AIM_OUT|AIM_RING|AIM_SWIRL   cone (half angle, rad)   speed [a,b]   lift [a,b] (along normal)   up [a,b] (world +y)
 *   inherit  share of the emitter's own velocity         bias   AIM_OUT: push the direction toward the normal
 *   life [a,b] s    size [a,b] m    grow (end size = size × grow, number or [a,b])    sc size-curve exponent
 *   g  vertical acceleration (negative falls)   drag   wind (0..1 how much the wind carries it)
 *   col / col1  hex or [hex…] at birth / death    add [a,b] additive share at birth / death    I [a,b] intensity (HDR for glow, opacity for soft)
 *   cc colour-curve exponent (<1 = turns early)   tint: false = ignore the caller's colour override, 2 = override col1 too
 *   rot  radians, omit for random     rotJ jitter     spin [a,b] rad/s (sign randomised when symmetric:true)
 *   stretch  STRETCH: extra length per m/s; FLUTTER: flip speed (rad/s)      aspect  width / height
 *   fadeIn (life fraction)  fadeOut (life fraction where the fade starts)  flicker [amount 0..1, speed]  turb [radius m, speed]
 *   delay [a,b] seconds before birth
 */
export function spec(s) {
  const pool = s.pool ?? GLOW;
  return {
    pool,
    sprites: typeof s.sprite === 'number' ? [s.sprite] : s.sprite || [0],
    mode: s.mode ?? BILLBOARD,
    r: s.r ?? 0, shell: !!s.shell, ring: s.ring ?? 0, disc: !!s.disc, axisOut: !!s.axisOut, h: pair(s.h, 0), along: pair(s.along, 0),
    aim: s.aim ?? AIM_NORMAL, cone: s.cone ?? Math.PI, speed: pair(s.speed, 0), lift: pair(s.lift, 0), up: pair(s.up, 0),
    inherit: s.inherit ?? 0, bias: s.bias ?? 0,
    life: pair(s.life, 1), size: pair(s.size, 0.2), grow: pair(s.grow, 1), sc: s.sc ?? 1,
    g: s.g ?? 0, drag: s.drag ?? 0, wind: s.wind ?? 0,
    col: colours(s.col), col1: s.col1 === undefined ? null : colours(s.col1),
    add: pair(s.add, pool === GLOW ? 1 : 0), I: pair(s.I, 1), cc: s.cc ?? 1, tint: s.tint ?? true,
    rot: s.rot === undefined ? null : s.rot, rotJ: s.rotJ ?? 0, spin: pair(s.spin, 0), symmetric: s.symmetric ?? true,
    stretch: s.stretch ?? 0, aspect: s.aspect ?? 1,
    fadeIn: s.fadeIn ?? 0.04, fadeOut: s.fadeOut ?? 0.45, flicker: pair(s.flicker, 0), turb: pair(s.turb, 0),
    delay: pair(s.delay, 0),
  };
}

/** Scratch emission context: recipes fill it in, then call emit(). */
export const ctx = {
  now: 0,
  x: 0, y: 0, z: 0,                 // spawn centre
  px: 0, py: 0, pz: 0, sweep: false, dt: 0,   // previous centre: spread births along the path travelled this frame
  dx: 0, dy: 1, dz: 0,              // direction (unit)
  nx: 0, ny: 1, nz: 0,              // surface normal (unit)
  vx: 0, vy: 0, vz: 0,              // emitter velocity
  wx: 0, wy: 0, wz: 0,              // wind here
  scale: 1, speed: 1, delay: 0,
  area: 1, hk: 1,                   // extra multipliers for spawn radius (r / ring) and for h, independent of scale
  c0: -1, c1: -1,                   // colour overrides (hex) or -1
};

const rnd = Math.random;

/** Spawn `count` particles of a normalised spec at the current ctx. Fractions are rounded at random. */
export function emit(pools, s, count) {
  let n = count | 0;
  if (rnd() < count - n) n++;
  if (n <= 0) return;
  const pool = pools[s.pool], F = pool.f, C = pool.c, c = ctx;
  const sc = c.scale, vs = sc * c.speed;
  const nx = c.nx, ny = c.ny, nz = c.nz;
  // plane basis around the normal
  let ux, uy, uz, vx, vy, vz;
  if (Math.abs(ny) < 0.99) { const l = 1 / Math.hypot(nz, nx); ux = nz * l; uy = 0; uz = -nx * l; } else { ux = 1; uy = 0; uz = 0; }
  vx = ny * uz - nz * uy; vy = nz * ux - nx * uz; vz = nx * uy - ny * ux;
  // cone basis around the aim axis
  const useDir = s.aim === AIM_DIR;
  const ax = useDir ? c.dx : nx, ay = useDir ? c.dy : ny, az = useDir ? c.dz : nz;
  let sx, sy, sz, tx, ty, tz;
  if (useDir) {
    if (Math.abs(ay) < 0.99) { const l = 1 / Math.hypot(az, ax); sx = az * l; sy = 0; sz = -ax * l; } else { sx = 1; sy = 0; sz = 0; }
    tx = ay * sz - az * sy; ty = az * sx - ax * sz; tz = ax * sy - ay * sx;
  } else { sx = ux; sy = uy; sz = uz; tx = vx; ty = vy; tz = vz; }
  const cosCone = Math.cos(Math.min(s.cone, Math.PI));
  const col = s.col, col1 = s.col1, nc = col.length / 3, nc1 = col1 ? col1.length / 3 : 0;
  const sprites = s.sprites, ns = sprites.length;
  const mode = s.mode;
  const o0 = c.c0 >= 0 && s.tint, o1 = c.c1 >= 0 && s.tint;

  for (let i = 0; i < n; i++) {
    const idx = pool.alloc();
    const o = idx * STRIDE, oc = idx * CSTRIDE;
    // --- where
    let bx = c.x, by = c.y, bz = c.z, born = c.now + c.delay + s.delay[0] + (s.delay[1] - s.delay[0]) * rnd();
    if (c.sweep) { const k = rnd(); bx = c.px + (bx - c.px) * k; by = c.py + (by - c.py) * k; bz = c.pz + (bz - c.pz) * k; born -= (1 - k) * c.dt; }
    let ox = 0, oy = 0, oz = 0, phi = rnd() * TAU;
    if (s.r > 0) {
      const u = rnd() * 2 - 1, th = rnd() * TAU, rad = s.r * sc * c.area * (s.shell ? 1 : Math.cbrt(rnd())), q = Math.sqrt(1 - u * u);
      ox = q * Math.cos(th) * rad; oy = u * rad; oz = q * Math.sin(th) * rad;
    }
    if (s.ring > 0) {
      const rad = s.ring * sc * c.area * (s.disc ? Math.sqrt(rnd()) : 1), cp = Math.cos(phi) * rad, sp = Math.sin(phi) * rad;
      ox += ux * cp + vx * sp; oy += uy * cp + vy * sp; oz += uz * cp + vz * sp;
    }
    const hh = (s.h[0] + (s.h[1] - s.h[0]) * rnd()) * sc * c.hk, al = (s.along[0] + (s.along[1] - s.along[0]) * rnd()) * sc;
    ox += nx * hh + c.dx * al; oy += ny * hh + c.dy * al; oz += nz * hh + c.dz * al;
    // --- which way
    let dx, dy, dz;
    if (s.aim === AIM_RING) {
      const cp = Math.cos(phi), sp = Math.sin(phi);
      dx = ux * cp + vx * sp; dy = uy * cp + vy * sp; dz = uz * cp + vz * sp;
    } else if (s.aim === AIM_SWIRL) {              // tangent to the ring, counter-clockwise seen from the normal
      const cp = -Math.sin(phi), sp = Math.cos(phi);
      dx = ux * cp + vx * sp; dy = uy * cp + vy * sp; dz = uz * cp + vz * sp;
    } else if (s.aim === AIM_OUT && (ox !== 0 || oy !== 0 || oz !== 0)) {
      dx = ox + nx * s.bias * sc; dy = oy + ny * s.bias * sc; dz = oz + nz * s.bias * sc;
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    } else {
      const ct = 1 - rnd() * (1 - cosCone), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = rnd() * TAU, cp = Math.cos(ph) * st, sp = Math.sin(ph) * st;
      dx = ax * ct + sx * cp + tx * sp; dy = ay * ct + sy * cp + ty * sp; dz = az * ct + sz * cp + tz * sp;
    }
    const spd = (s.speed[0] + (s.speed[1] - s.speed[0]) * rnd()) * vs;
    const lift = (s.lift[0] + (s.lift[1] - s.lift[0]) * rnd()) * vs;
    const up = (s.up[0] + (s.up[1] - s.up[0]) * rnd()) * vs;
    const life = s.life[0] + (s.life[1] - s.life[0]) * rnd();
    const size = (s.size[0] + (s.size[1] - s.size[0]) * rnd()) * sc;

    F[o] = bx + ox; F[o + 1] = by + oy; F[o + 2] = bz + oz; F[o + 3] = born;
    F[o + 4] = dx * spd + nx * lift + c.vx * s.inherit;
    F[o + 5] = dy * spd + ny * lift + up + c.vy * s.inherit;
    F[o + 6] = dz * spd + nz * lift + c.vz * s.inherit;
    F[o + 7] = life;
    if (mode === FLAT) { F[o + 8] = nx; F[o + 9] = ny; F[o + 10] = nz; }
    else if (mode === AXIS) { if (s.axisOut) { F[o + 8] = dx; F[o + 9] = dy; F[o + 10] = dz; } else { F[o + 8] = c.dx; F[o + 9] = c.dy; F[o + 10] = c.dz; } }
    else { F[o + 8] = c.wx * s.wind; F[o + 9] = c.wy * s.wind; F[o + 10] = c.wz * s.wind; }
    F[o + 11] = s.g;
    F[o + 12] = s.drag; F[o + 13] = size; F[o + 14] = size * (s.grow[0] + (s.grow[1] - s.grow[0]) * rnd()); F[o + 15] = s.sc;
    F[o + 16] = s.rot === null ? rnd() * TAU : s.rot + (rnd() - 0.5) * s.rotJ;
    let spin = s.spin[0] + (s.spin[1] - s.spin[0]) * rnd();
    if (s.symmetric && rnd() < 0.5) spin = -spin;
    F[o + 17] = spin;
    F[o + 18] = sprites[ns === 1 ? 0 : (rnd() * ns) | 0];
    F[o + 19] = mode;
    F[o + 20] = s.stretch; F[o + 21] = s.I[0]; F[o + 22] = s.I[1]; F[o + 23] = s.cc;
    F[o + 24] = s.fadeIn; F[o + 25] = s.fadeOut; F[o + 26] = s.flicker[0]; F[o + 27] = s.flicker[1];
    F[o + 28] = s.turb[0] * sc; F[o + 29] = s.turb[1]; F[o + 30] = rnd(); F[o + 31] = s.aspect;

    let r0, g0, b0;
    if (o0) { r0 = (c.c0 >> 16) & 255; g0 = (c.c0 >> 8) & 255; b0 = c.c0 & 255; }
    else { const k = nc === 1 ? 0 : ((rnd() * nc) | 0) * 3; r0 = col[k]; g0 = col[k + 1]; b0 = col[k + 2]; }
    C[oc] = r0; C[oc + 1] = g0; C[oc + 2] = b0; C[oc + 3] = s.add[0] * 255;
    if (o1 && (s.tint === 2 || !col1)) { C[oc + 4] = (c.c1 >> 16) & 255; C[oc + 5] = (c.c1 >> 8) & 255; C[oc + 6] = c.c1 & 255; }
    else if (col1 && !(o0 && s.tint === 2)) { const k = nc1 === 1 ? 0 : ((rnd() * nc1) | 0) * 3; C[oc + 4] = col1[k]; C[oc + 5] = col1[k + 1]; C[oc + 6] = col1[k + 2]; }
    else { C[oc + 4] = r0; C[oc + 5] = g0; C[oc + 6] = b0; }
    C[oc + 7] = s.add[1] * 255;
  }
}
