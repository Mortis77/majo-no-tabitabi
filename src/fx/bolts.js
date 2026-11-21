// One instanced batch draws faceted lightning channels with a soft halo, and painted sustained beams.
//   slots [0, MAX_BEAMS)   persistent beams, rewritten while they move
//   slots [MAX_BEAMS, cap) ring buffer of bolt segments, animated in the shader from (birth, duration)
import * as THREE from 'three';
import { FX_OUT, FOG_PARS_VERT, FOG_VERT, fxMaterial } from './glsl.js';
import { TAU } from '../core/util.js';

export const MAX_BEAMS = 8;
const STRIDE = 16;

/** Beam palettes by element: body, heart, edge (foam / bright strokes), dark outline (sRGB). Index = style - 1. */
export const BEAM_EL = ['sun', 'fire', 'water', 'ice', 'wind', 'thunder', 'earth', 'moon', 'shadow'];
const BEAM_PAL = [
  0xffae2c, 0xfff6c8, 0xffe07a, 0x7e340a,   // sun: amber gold, pale-gold heart
  0xe2381a, 0xffe04a, 0xff8a24, 0x4a0a04,   // fire: orange-red, yellow heart
  0x1652c4, 0xd6f1ff, 0xeaf8ff, 0x061a4a,   // water: deep blue, pale foam
  0x58b8ea, 0xf4fdff, 0xd4f4ff, 0x123e6e,   // ice: glacier blue, white heart
  0x2fbf8a, 0xeafff2, 0xb4f7d8, 0x0a4a3a,   // wind: jade, pale mint strokes
  0x7a3cf0, 0xf2e8ff, 0xc6a6ff, 0x220a5c,   // thunder: violet, white-lilac heart
  0xbd7a2c, 0xffe2a4, 0xe2ae62, 0x3a200c,   // earth: ochre, warm light heart
  0x8f80f2, 0xf6f2ff, 0xd6ceff, 0x261c66,   // moon: lilac silver
  0x5a20c0, 0xdcb0ff, 0xa060ff, 0x0e0424,   // shadow (the great shade): deep violet
];

const VERT = /* glsl */`
attribute vec3 section;  // unit cross-section xy, z = 1 on the five-sided channel
attribute vec2 corner;   // x -1..1 across, y 0..1 along
attribute vec4 s0;       // A, birth
attribute vec4 s1;       // B, duration
attribute vec4 s2;       // colour (linear), half width
attribute vec4 s3;       // style (0 bolt, 1 beam), seed, intensity, fade
uniform float uTime;
varying float vFacet;
varying vec4 vP;         // across (-1..1), along / halfWidth, length / halfWidth, metres along
varying vec4 vCol;
varying vec4 vPar;       // life fraction, style, seed, fade
varying float vNear;     // beams: 0 at the lens .. 1 from ~7 m on
${FOG_PARS_VERT}
void main() {
  float age = uTime - s0.w;
  float dur = s1.w;
  if (age < 0.0 || age >= dur || (section.z > 0.5 && s3.x > 0.5)) { gl_Position = vec4(0.0, 0.0, 3.0, 1.0); return; }
  vec3 a = (viewMatrix * vec4(s0.xyz, 1.0)).xyz;
  vec3 b = (viewMatrix * vec4(s1.xyz, 1.0)).xyz;
  vec3 d = b - a;
  float len = length(d);
  vec3 dir = len > 1e-5 ? d / len : vec3(0.0, 1.0, 0.0);
  vec3 mid = mix(a, b, corner.y);
  float hw = max(s2.w, 0.0035 * -mid.z);          // never thinner than a couple of pixels
  vNear = 1.0;
  if (s3.x > 0.5) {
    // beams: the quad is BQ x the body width (outer glow + the root flare are drawn inside it); a beam that passes the
    // lens is narrowed and its glow fades there, so the caster's own beam never fills the screen
    vNear = smoothstep(0.8, 7.0, -mid.z);
    hw = s2.w * mix(0.32, 1.0, vNear) * 1.9;
  }
  vec3 side = cross(dir, normalize(mid));
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  float along = mix(-hw, len + hw, corner.y);
  vec4 mvPosition = vec4(a + dir * along + side * (corner.x * hw), 1.0);
  vFacet = -1.0;
  if (section.z > 0.5) {
    vec3 D = s1.xyz - s0.xyz;
    D /= max(length(D), 0.0001);
    vec3 U = normalize(cross(D, abs(D.y) > .86 ? vec3(1,0,0) : vec3(0,1,0)));
    vec3 radial = U * section.x + cross(D, U) * section.y;
    vec3 centre = mix(s0.xyz, s1.xyz, corner.y) + D * (corner.y - .5) * hw * .28;
    mvPosition = viewMatrix * vec4(centre + radial * hw * .36, 1.);
    vFacet = .5 + .5 * dot(radial, vec3(.77,.22,.60));
  }
  gl_Position = projectionMatrix * mvPosition;
  vP = vec4(corner.x, along / hw, len / hw, along);
  vCol = vec4(s2.rgb, s3.z);
  vPar = vec4(age / dur, s3.x, s3.y, s3.w);
  ${FOG_VERT}
}
`;

const FRAG = /* glsl */`
uniform float uTime;
varying float vFacet;
varying vec4 vP;
varying vec4 vCol;
varying vec4 vPar;
varying float vNear;
uniform vec3 uBeamPal[36];
${FX_OUT}
float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), f.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float x = vP.x, y = vP.y, L = vP.z;
  float dy = y < 0.0 ? -y : (y > L ? y - L : 0.0);
  float r = sqrt(x * x + dy * dy);
  vec3 add;
  if (vPar.y < 0.5) {   // lightning
    // The stepped leader descends, then the hot return stroke retraces the same channel upwards.
    float leader = (1.0 - smoothstep(.04, .34, vPar.x)) * .80;
    float restrike = max(0.0, 1.0 - abs(vPar.x - vPar.w) / .19);
    float energy = leader + restrike * restrike + .19 * (1.0 - vPar.x);
    if (vFacet >= 0.) {
      float face = smoothstep(.44,.64,vFacet);
      vec3 coat = mix(vCol.rgb * .47, mix(vCol.rgb, vec3(1.,.94,1.), .70), face);
      gl_FragColor = fxOut(coat * energy * vCol.a * .72, coat, clamp(energy * .95, 0., .95));
    } else {
      if (r >= 1.0) discard;
      float halo = pow(1.0 - r, 2.6);
      gl_FragColor = fxOut(vCol.rgb * halo * energy * vCol.a * .78, vec3(0.), 0.);
    }
    return;
  }
  // ---- painted beam: a coloured body in the caster's element, a darker outline, a thin bright heart, a surface
  // that rolls along it, a flare at the hands, a faint glow outside. Body = alpha-blended surface colour (under the
  // bloom threshold); only the heart and the flare are additive.
  float m = vP.w, seed = vPar.z;
  float idx = floor(vPar.y - 0.5);
  vec3 cBody = idx < 8.5 ? uBeamPal[int(idx) * 4] : vCol.rgb;
  vec3 cHeart = idx < 8.5 ? uBeamPal[int(idx) * 4 + 1] : mix(vCol.rgb, vec3(1.0), 0.6);
  vec3 cEdge = idx < 8.5 ? uBeamPal[int(idx) * 4 + 2] : mix(vCol.rgb, vec3(1.0), 0.35);
  vec3 cDark = idx < 8.5 ? uBeamPal[int(idx) * 4 + 3] : vCol.rgb * 0.25;
  float t = uTime;
  float near = vNear;
  float mm = max(m, 0.0);
  // silhouette: rolling bulges travel from the caster outward; the root flares open at the hands
  float flare = exp(-mm / 0.45);
  float ripple = 0.09 * sin(m * 1.7 - t * 19.0 + seed * 6.0) + 0.05 * sin(m * 4.1 - t * 31.0);
  float taper = mix(0.5, 1.0, smoothstep(0.0, 2.8, mm));     // narrow at the hands, opening out
  float wl = (taper * (1.0 + ripple) + 0.12 * flare) / 1.9;           // body half width as a fraction of the quad
  float rq = r;                                             // radius in quad units (1 = quad edge)
  float rr = rq / wl;                                       // 1 = outer edge of the outline
  if (rq >= 1.0) discard;
  float n1 = bNoise(vec2(m * 0.75 - t * 13.0, x * 2.2 / wl + seed * 5.0));
  float n2 = bNoise(vec2(m * 2.1 - t * 27.0, x * 5.0 / wl - seed * 3.0));
  float n = n1 * 0.65 + n2 * 0.35;
  vec3 straight = vec3(0.0);
  float alpha = 0.0;
  add = vec3(0.0);
  float I = vCol.a;
  if (rr < 1.0) {
    float ol = 0.88 + 0.04 * (n2 - 0.5);                    // outline starts here (wobbles a little)
    if (rr > ol) {
      straight = cDark;
      alpha = 0.92;
    } else {
      float u = rr / ol;                                    // 0 centre .. 1 inner edge of the outline
      // cel tones: shade band toward the rim, the rolling texture breaks it into strokes
      float shade = smoothstep(0.55, 0.62, u + (n - 0.5) * 0.55);
      vec3 body = mix(cBody, mix(cBody, cDark, 0.45), shade);
      // foam / bright strokes riding the surface
      float foam = smoothstep(0.62, 0.68, n1 * 0.7 + n2 * 0.5 - u * 0.25 + 0.08);
      body = mix(body, cEdge, foam * 0.85);
      // heart: a thin bright line, wavering
      float cw = 0.2 + 0.05 * sin(m * 2.3 - t * 23.0) + 0.04 * (n2 - 0.5);
      float heart = 1.0 - smoothstep(cw * 0.7, cw, u);
      body = mix(body, cHeart, heart);
      straight = body * (0.85 + 0.25 * (1.0 - u * u)) * min(I, 1.25);
      alpha = 0.96;
      add = cHeart * heart * (0.55 + 0.25 * n2) * I * near;
    }
  } else {
    // faint glow outside the outline (restrained; gone near the lens)
    float g = 1.0 - smoothstep(0.0, 1.0, (rq - wl) / max(1.0 - wl, 1e-3));
    add = cBody * g * g * 0.28 * I * near * near;
  }
  // flare at the hands: short rays of the heart colour fanning around the root (additive, the body stays thin)
  float back = m < 0.0 ? smoothstep(0.0, 0.2, -m) : 0.0;     // behind the hands: only the flare, no body
  float ang = atan(x, m * 1.5 + 0.001);
  float rays = smoothstep(0.55, 0.95, bNoise(vec2(ang * 5.0 + seed * 9.0, t * 9.0))) * (1.0 - smoothstep(0.15, 1.0, rq));
  float fl = exp(-abs(m) / 0.55);
  add += (cHeart * (1.0 - smoothstep(0.0, 0.55, rq)) * 0.7 + cBody * rays * 0.9) * fl * I * mix(0.25, 1.0, near);
  // the far end dissolves into whatever it meets (the clash mass, the impact) instead of a rounded tube end
  float tip = 1.0 - smoothstep(L - 2.2, L + 0.6, y + (n - 0.5) * 1.6);
  alpha *= mix(0.45, 1.0, near) * (1.0 - back) * tip;
  add *= mix(1.0, tip, 0.6);
  straight *= 1.0 - back;
  float fade = vPar.w;
  gl_FragColor = fxOut(add * fade, straight, alpha * fade);
}
`;

const rnd = Math.random;
const PTS = new Float32Array(26 * 3);

export class Bolts {
  constructor(capacity, renderOrder) {
    this.cap = capacity;
    this.f = new Float32Array(capacity * STRIDE);
    this.head = MAX_BEAMS; this.dirty = false;
    this.lastBoltEnd = -Infinity;
    this.beamUsed = new Uint8Array(MAX_BEAMS);
    const g = new THREE.InstancedBufferGeometry();
    const corners = [-1, 0, 1, 0, 1, 1, -1, 1];
    const sections = new Array(12).fill(0), indices = [0, 1, 2, 0, 2, 3];
    const sides = 5;
    for (let end = 0; end < 2; end++) {
      for (let n = 0; n < sides; n++) {
        const a = n / sides * TAU;
        corners.push(0, end);
        sections.push(Math.cos(a), Math.sin(a), 1);
        if (end === 0) {
          const i = 4 + n, j = 4 + (n + 1) % sides;
          indices.push(i, j, i + sides, j, j + sides, i + sides);
        }
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sections.length), 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
    g.setAttribute('section', new THREE.Float32BufferAttribute(sections, 3));
    g.setIndex(indices);
    this.buf = new THREE.InstancedInterleavedBuffer(this.f, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 4; i++) g.setAttribute('s' + i, new THREE.InterleavedBufferAttribute(this.buf, 4, i * 4));
    g.instanceCount = 0;
    const pal = BEAM_PAL.map((h) => new THREE.Color().setHex(h));   // ColorManagement converts sRGB hex -> linear
    this.material = fxMaterial({ uniforms: { uBeamPal: { value: pal } }, vertexShader: VERT, fragmentShader: FRAG });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fxBolts';
    this.mesh.onBeforeRender = () => { if (this.dirty) { this.dirty = false; this.buf.needsUpdate = true; } };
  }

  _write(i, ax, ay, az, bx, by, bz, col, halfW, birth, dur, style, intensity, fade) {
    const o = i * STRIDE, f = this.f;
    f[o] = ax; f[o + 1] = ay; f[o + 2] = az; f[o + 3] = birth;
    f[o + 4] = bx; f[o + 5] = by; f[o + 6] = bz; f[o + 7] = dur;
    f[o + 8] = col.r; f[o + 9] = col.g; f[o + 10] = col.b; f[o + 11] = halfW;
    f[o + 12] = style; f[o + 13] = (i * 0.618034) % 1; f[o + 14] = intensity; f[o + 15] = fade;
    this.mesh.geometry.instanceCount = Math.max(this.mesh.geometry.instanceCount, i + 1);
    this.dirty = true;
  }

  segment(ax, ay, az, bx, by, bz, col, halfW, birth, dur, intensity, returnAt = .48) {
    this.lastBoltEnd = Math.max(this.lastBoltEnd, birth + dur);
    const i = this.head;
    this.head = i + 1 === this.cap ? MAX_BEAMS : i + 1;
    this._write(i, ax, ay, az, bx, by, bz, col, halfW, birth, dur, 0, intensity, returnAt);
  }

  /** A jagged bolt from A to B with `branches` side forks. col: THREE.Color (linear). Returns nothing; no allocations. */
  bolt(ax, ay, az, bx, by, bz, col, width, intensity, birth, dur, branches, jag = 1) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return;
    dx /= len; dy /= len; dz /= len;
    // basis ⟂ to the bolt
    let ux, uy, uz;
    if (Math.abs(dy) < 0.95) { const l = 1 / Math.hypot(dz, dx); ux = dz * l; uy = 0; uz = -dx * l; } else { ux = 1; uy = 0; uz = 0; }
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const n = Math.max(4, Math.min(22, Math.round(len / 1.15)));
    const amp = Math.max(0.12, Math.min(1.5, len * 0.075)) * jag;
    let ou = 0, ov = 0;
    for (let i = 0; i <= n; i++) {
      const s = i / n, env = Math.pow(Math.sin(Math.PI * s), 0.55);
      ou = ou * 0.45 + (rnd() - 0.5) * 2 * amp; ov = ov * 0.45 + (rnd() - 0.5) * 2 * amp;
      const a = ou * env, b = ov * env, k = len * s;
      PTS[i * 3] = ax + dx * k + ux * a + vx * b; PTS[i * 3 + 1] = ay + dy * k + uy * a + vy * b; PTS[i * 3 + 2] = az + dz * k + uz * a + vz * b;
    }
    const hw = width * 0.5;
    const lead = Math.min(.052, len * .002, dur * .19);
    for (let i = 0; i < n; i++) {
      this.segment(PTS[i * 3], PTS[i * 3 + 1], PTS[i * 3 + 2], PTS[i * 3 + 3], PTS[i * 3 + 4], PTS[i * 3 + 5], col, hw, birth + lead * i / n, dur, intensity, .56 - .26 * i / n);
    }
    // On a tall sky strike the older high forks are usually outside the player camera.
    // Keep two lower leaders in view, joining the bright trunk before they fade near the soil.
    if (len > 20 && dy < -.85 && branches >= 2) {
      const phase = rnd() * TAU;
      for (let f = 0; f < 2; f++) {
        const k = n - 3 - f;
        let x = PTS[k*3], y = PTS[k*3+1], z = PTS[k*3+2];
        const a = phase + f * Math.PI + rnd() * .45;
        const reach = Math.min(4.4, len * .074) * (.70 + rnd() * .34);
        const endX = bx + Math.cos(a) * reach, endZ = bz + Math.sin(a) * reach;
        const endY = by + .42 + rnd() * .65;
        for (let j = 1; j <= 5; j++) {
          const left = 6 - j;
          const qx = x + (endX - x)/left + Math.sin(a)*(rnd()-.5)*.8*(j<5);
          const qy = y + (endY - y)/left;
          const qz = z + (endZ - z)/left + Math.cos(a)*(rnd()-.5)*.8*(j<5);
          this.segment(x,y,z,qx,qy,qz,col,hw*(.78-.085*j),birth+.026+.005*j,dur*.86,intensity*.76,.38);
          x=qx; y=qy; z=qz;
        }
      }
    }
    for (let b = 0; b < branches; b++) {
      const k = 1 + Math.floor(rnd() * Math.max(1, n * 0.7));
      let px = PTS[k * 3], py = PTS[k * 3 + 1], pz = PTS[k * 3 + 2];
      const th = rnd() * TAU, c = Math.cos(th), s = Math.sin(th), fw = 0.45 + rnd() * 0.5, sd = 0.55 + rnd() * 0.45;
      let ex = dx * fw + (ux * c + vx * s) * sd, ey = dy * fw + (uy * c + vy * s) * sd, ez = dz * fw + (uz * c + vz * s) * sd;
      const el = 1 / Math.hypot(ex, ey, ez); ex *= el; ey *= el; ez *= el;
      const m = 3 + Math.floor(rnd() * 3), bl = len * (0.1 + rnd() * 0.2) / m, ja = amp * 0.55;
      for (let j = 0; j < m; j++) {
        const qx = px + ex * bl + (rnd() - 0.5) * ja, qy = py + ey * bl + (rnd() - 0.5) * ja, qz = pz + ez * bl + (rnd() - 0.5) * ja;
        const w = 1 - j / (m + 1);
        this.segment(px, py, pz, qx, qy, qz, col, hw * 0.6 * w, birth + lead * k / n + j * .002, dur * 0.85, intensity * 0.7 * w);
        px = qx; py = qy; pz = qz;
      }
    }
  }

  // Forks crawl outwards along the actual floor, following steps and slopes.
  ground(at, radius, col, birth, floorAt, count) {
    const turn = rnd() * TAU;
    for (let i = 0; i < count; i++) {
      const a = turn + (i + rnd() * .5) * TAU / count;
      const reach = radius * (.74 + rnd() * .34);
      let x = at.x, z = at.z, y = floorAt(x, z) + .09;
      for (let j = 1; j <= 4; j++) {
        const next = a + (rnd() - .5) * .52;
        const dx = Math.cos(next) * reach * .25, dz = Math.sin(next) * reach * .25;
        const qx = x + dx, qz = z + dz, qy = floorAt(qx, qz) + .09;
        if (Math.abs(qy - y) > .85) break;
        const t = birth + j * .016;
        this.segment(x,y,z,qx,qy,qz,col,(.145 - j * .022),t,.28,1.9);
        if (j === 2) {
          const sx = qx + dx * .6 - dz * .9, sz = qz + dz * .6 + dx * .9, sy = floorAt(sx,sz) + .09;
          if (Math.abs(sy - qy) < .85) this.segment(qx,qy,qz,sx,sy,sz,col,.054,t+.021,.22,1.35);
        }
        x = qx; y = qy; z = qz;
      }
    }
  }

  releaseExpired(now) {
    if (this.lastBoltEnd === -Infinity || now < this.lastBoltEnd) return;
    this.lastBoltEnd = -Infinity;
    this.head = MAX_BEAMS;
    this.mesh.geometry.instanceCount = this.beamUsed.lastIndexOf(1) + 1;
  }

  allocBeam() { for (let i = 0; i < MAX_BEAMS; i++) if (!this.beamUsed[i]) { this.beamUsed[i] = 1; return i; } return -1; }
  freeBeam(i) { if (i < 0) return; this.beamUsed[i] = 0; this.f[i * STRIDE + 7] = 0; this.dirty = true; if (this.lastBoltEnd === -Infinity) this.mesh.geometry.instanceCount = this.beamUsed.lastIndexOf(1) + 1; }
  /** style: 1 + index into BEAM_EL (element palette), 10 = the beam's own colour. */
  setBeam(i, ax, ay, az, bx, by, bz, col, halfW, intensity, fade, style = 10) {
    this._write(i, ax, ay, az, bx, by, bz, col, halfW, -1e5, 1e9, style, intensity, fade);
  }

  live(now) { let n = 0; const f = this.f; for (let o = 0; o < f.length; o += STRIDE) if (f[o + 7] > 0 && now < f[o + 3] + f[o + 7]) n++; return n; }
  rebase(delta) { this.lastBoltEnd -= delta; const f = this.f; for (let i = MAX_BEAMS; i < this.cap; i++) f[i * STRIDE + 3] -= delta; this.dirty = true; }
  clear() { this.f.fill(0); this.beamUsed.fill(0); this.mesh.geometry.instanceCount = 0; this.head = MAX_BEAMS; this.lastBoltEnd = -Infinity; this.dirty = true; }
}
