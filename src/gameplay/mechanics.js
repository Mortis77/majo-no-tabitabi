// World mechanics: updraft vents, springy mushroom caps, the 月障 barrier dome, the 星晶野 crystal-pillar puzzle.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { flat, toon, glow, glowDynamic, PAL } from '../core/mats.js';
import { cyl, torus, box, bakeStatic } from '../core/geo.js';
import { VENTS, BARRIER, CRYSTAL_PUZZLE } from '../data/placements.js';
import { gp, isActive, sfx, toast } from './common.js';
import { M, rbox, ring, lathe } from '../props/shapes.js';

const TAU = Math.PI * 2;

// ---- shaders (additive, unlit) ------------------------------------------------------------------------------------------
const SWIRL_VS = /* glsl */`
varying vec2 vUv; varying float vH;
uniform float uH;
void main(){ vUv = uv; vH = position.y / uH; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SWIRL_FS = /* glsl */`
varying vec2 vUv; varying float vH;
uniform float uTime; uniform vec3 uColor; uniform float uAlpha;
void main(){
  float band = 0.5 + 0.5 * sin(vUv.x * 40.0 - uTime * 6.0);
  float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float fadeTop = 1.0 - smoothstep(0.55, 1.0, vH);
  float fadeBot = smoothstep(0.0, 0.06, vH);
  float a = edge * (0.35 + 0.65 * band) * fadeTop * fadeBot * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`;
const DOME_VS = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main(){
  vL = position;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const DOME_FS = /* glsl */`
// The moon veil: a tall veil of slow-flowing moonlight — curtains, drifting bands of invented glyphs, a bright skirt where it meets
// the ground, a soft silhouette edge, star motes, ripples where something touches it. Dissolves from the crown down.
varying vec3 vN; varying vec3 vW; varying vec3 vL;
uniform float uTime; uniform float uDissolve; uniform vec4 uHit; uniform vec3 uColA; uniform vec3 uColB; uniform float uAlpha; uniform float uInside;
float uGlyphK;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float k = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0); return length(pa - ba * k); }
// one invented glyph in a unit cell: three or four brush strokes picked by the cell's hash (hooks, ticks, bars —
// never a closed circle or a cross through a ring, so nothing reads as a real letter)
float glyph(vec2 p, float id){
  float r1 = hash(vec2(id, 1.3)), r2 = hash(vec2(id, 7.1)), r3 = hash(vec2(id, 3.7)), r4 = hash(vec2(id, 9.9));
  float d = 9.0;
  float sx = 0.3 + 0.4 * r4;
  d = min(d, seg(p, vec2(sx, 0.1), vec2(sx + (r1 - 0.5) * 0.25, 0.9)));                          // spine, slightly leaning
  if (r2 < 0.33) d = min(d, seg(p, vec2(0.18, 0.72), vec2(0.82, 0.78)));
  else if (r2 < 0.66) d = min(d, seg(p, vec2(sx, 0.62), vec2(0.85, 0.42)));                      // a falling stroke
  else d = min(d, seg(p, vec2(0.15, 0.5), vec2(sx, 0.36)));
  if (r3 < 0.4) { d = min(d, seg(p, vec2(sx, 0.12), vec2(sx + 0.22, 0.2))); }                  // hook at the foot
  else if (r3 < 0.75) d = min(d, seg(p, vec2(0.6, 0.85), vec2(0.78, 0.66)));                   // tick
  else d = min(d, abs(length(p - vec2(sx, 0.5)) - 0.2) + step(p.x, sx) * 0.3);                // half arc, open side
  if (r1 > 0.55) d = min(d, length(p - vec2(0.8, 0.18)) - 0.02);                               // dot
  return 1.0 - smoothstep(0.03, 0.075, d);
}
float band(float u, float h, float hb, float n, float spd){
  float y = (h - hb) / 0.0105;
  if (abs(y) > 1.3) return 0.0;
  float x = u * n + uTime * spd;
  vec2 p = vec2(fract(x), y * 0.45 + 0.5);
  float rule = (1.0 - smoothstep(0.0, 0.07, abs(abs(y) - 1.18)));       // the two thin rules around the band
  float g = (step(0.12, hash(vec2(floor(x), hb)))) * glyph(p, floor(x) + hb * 100.0) * step(abs(y), 1.0);
  return max(g * uGlyphK, rule * 0.45);
}
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float ndv = abs(dot(normalize(vN), V));
  float fres = (1.0 - ndv) * (1.0 - ndv);
  float u = atan(vL.z, vL.x) * 0.15915494 + 0.5;
  float h = clamp(vL.y, 0.0, 1.0);
  float t = uTime;
  // curtains: vertical folds that sway and flow slowly upward
  float sway = sin(h * 3.0 - t * 0.15 + u * 12.0) * 0.9;
  float n1 = noise(vec2(u * 70.0 + sway, h * 2.6 - t * 0.08));
  float n2 = noise(vec2(u * 190.0 + sway * 2.0, h * 7.0 - t * 0.2));
  float fold = 0.5 + 0.5 * sin(u * 6.2831853 * 11.0 + sway + t * 0.04);
  float curtain = smoothstep(0.35, 0.9, n1 * 0.65 + n2 * 0.35) * (0.45 + 0.55 * fold);
  float skirt = exp(-h * 14.0) + 0.35 * exp(-h * 4.0);
  float crown = 1.0 - smoothstep(0.6, 1.0, h);
  float dist = length(cameraPosition - vW);
  uGlyphK = 1.0 - smoothstep(160.0, 420.0, dist);                  // glyphs only where they can be read; far = rules + curtains
  float glyphs = band(u, h, 0.06, 240.0, 0.012) + band(u, h, 0.17, 220.0, -0.009) + 0.8 * band(u, h, 0.31, 190.0, 0.007);
  // star motes drifting up
  vec2 sc = vec2(u * 420.0, h * 150.0 - t * 0.35);
  vec2 sf = fract(sc) - 0.5; float sh = hash(floor(sc));
  float star = step(0.965, sh) * (1.0 - smoothstep(0.04, 0.16, length(sf))) * (0.5 + 0.5 * sin(t * (1.5 + sh * 3.0) + sh * 40.0));
  // ripple where something bounced off
  float rd = distance(vW, uHit.xyz); float ra = uTime - uHit.w;
  float ripple = (1.0 - smoothstep(0.0, 3.0, abs(rd - ra * 18.0))) * (1.0 - smoothstep(0.0, 1.6, ra));
  // break-up: from the crown down, along the curtains, with a glowing gold edge
  float dv = (1.0 - h) * 0.6 + n1 * 0.4;
  float cut = uDissolve * 1.15;
  if (dv < cut - 0.02) discard;
  float burn = (1.0 - smoothstep(0.0, 0.07, dv - cut)) * step(0.001, uDissolve);
  float body = (0.04 + curtain * 0.3) * crown + skirt * 0.55 + fres * 0.5;
  body = mix(body, (curtain * 0.2 * crown + skirt * 0.25) * (0.4 + 0.6 * fold), uInside);   // from inside the night: thin curtains, not a wall of light
  vec3 col = mix(uColA, uColB, clamp(curtain * 0.7 + h * 0.5, 0.0, 1.0)) * body * uAlpha;
  col += vec3(0.86, 0.84, 1.0) * glyphs * (0.55 + 0.25 * fold) * (1.0 + 2.0 * uDissolve) * uAlpha;
  col += vec3(0.92, 0.9, 1.0) * star * 1.2 * crown;
  col += uColB * ripple * 0.9 + vec3(1.0, 0.85, 0.5) * burn * 2.5;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createMechanics(api) {
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3();
  const vents = [];
  let barrier = null;
  const puzzle = { peds: [], steps: [], anim: [], cool: [0, 0, 0], beams: [], sky: null, solved: false, lit: [false, false, false, false] };

  // ---- updraft vents ------------------------------------------------------------------------------------------------------
  function initVents() {
    const stoneProto = new THREE.Group();
    // carved curb: eight dressed stones with soft arrises, each a little tilted and settled, a moss cap on the outer
    // edge, a low inner kerb ring and a wind spiral cut into every second block (glowing groove)
    const st = M.stone(), sd = M.stoneDark(), moss = toon(PAL.moss, { surface: 'rock', look: { detail: 1.2, bump: 1.3, scale: 1.2 } });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, w = 1.32 + 0.08 * Math.sin(i * 2.3), h = 0.5 + 0.06 * Math.cos(i * 1.7);
      const b = rbox(w, h, 0.72, i % 2 ? st : sd, Math.cos(a) * 2.9, 0.12 + h / 2 - 0.25, Math.sin(a) * 2.9, 0.07, 3);
      b.rotation.set(0.03 * Math.sin(i * 3.1), -a + Math.PI / 2, 0.04 * Math.cos(i * 2.2)); stoneProto.add(b);
      const m = rbox(w * 0.7, 0.05, 0.26, moss, Math.cos(a) * 3.12, 0.12 + h - 0.25 + 0.005, Math.sin(a) * 3.12, 0.025, 2);
      m.rotation.y = -a + Math.PI / 2 + 0.1 * Math.sin(i); stoneProto.add(m);
      if (i % 2 === 0) { const sp = ring(0.14, 0.018, glow(0xbfe8ff, 1.6), Math.cos(a) * 2.8, 0.12 + h - 0.25 + 0.01, Math.sin(a) * 2.8, 16, 3); sp.castShadow = false; stoneProto.add(sp); }
    }
    stoneProto.add(lathe([[2.36, -0.05], [2.42, 0.08], [2.5, 0.14], [2.58, 0.1], [2.6, -0.05]], sd, 0, 0, 0, 40));
    const glowRing = torus(2.4, 0.09, glow(0xbfe8ff, 2.2), 0, 0.35, 0, 4, 40); glowRing.rotation.x = Math.PI / 2; glowRing.castShadow = false; stoneProto.add(glowRing);
    const disc = cyl(2.3, 2.3, 0.04, glow(0x6fb8e8, 0.9, { transparent: true, opacity: 0.6, depthWrite: false }), 0, 0.12, 0, 24); disc.castShadow = false; stoneProto.add(disc);
    for (const v of VENTS) {
      const y = G.world.heightAt(v.x, v.z);
      const pos = new THREE.Vector3(v.x, y, v.z);
      const base = bakeStatic(stoneProto.clone());
      base.position.copy(pos); base.position.y -= 0.05;
      base.scale.setScalar(v.radius / 5);
      G.scene.add(base);
      // the visible swirl: two helix ribbons, fading upward
      const hVis = Math.min(v.height, 70);
      const mat = new THREE.ShaderMaterial({ vertexShader: SWIRL_VS, fragmentShader: SWIRL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uH: { value: hVis }, uColor: { value: new THREE.Color(0xbfe8ff).multiplyScalar(1.4) }, uAlpha: { value: 0.75 } } });
      mat.toneMapped = false;
      const swirl = new THREE.Group();
      for (let k = 0; k < 2; k++) {
        const pts = [];
        const turns = hVis / 9;
        for (let i = 0; i <= 120; i++) { const f = i / 120, a = f * turns * TAU + k * Math.PI; const r = v.radius * (0.55 + 0.35 * f); pts.push(new THREE.Vector3(Math.cos(a) * r, f * hVis, Math.sin(a) * r)); }
        const curve = new THREE.CatmullRomCurve3(pts);
        const geo = ribbon(curve, 240, 0.55);
        const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 3;
        swirl.add(m);
      }
      swirl.position.copy(pos);
      G.scene.add(swirl);
      vents.push({ ...v, pos, swirl, mat, wind: null, em: null, spin: Math.random() * 6 });
    }
  }
  /** A flat ribbon along a curve (uv.x along, uv.y across), always roughly facing outward. */
  function ribbon(curve, seg, w) {
    const pos = [], uv = [], idx = [];
    const p = new THREE.Vector3(), out = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      const f = i / seg; curve.getPointAt(f, p);
      out.set(p.x, 0, p.z).normalize().multiplyScalar(w * 0.5);
      pos.push(p.x - out.x * 0.2, p.y - w * 0.5, p.z - out.z * 0.2, p.x + out.x * 0.2, p.y + w * 0.5, p.z + out.z * 0.2);
      uv.push(f, 0, f, 1);
      if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  function startVents() {
    for (const v of vents) {
      v.wind?.remove?.();
      v.wind = G.elements?.addWind?.({ kind: 'updraft', pos: v.pos, radius: v.radius, height: v.height, strength: v.strength, duration: Infinity, swirl: 0.35 }) || null;
    }
  }

  // ---- mushroom caps -------------------------------------------------------------------------------------------------------
  const padGrid = new Map(); let padsReady = false;
  const cellKey = (x, z) => (Math.floor(x / 16) + 4096) * 8192 + (Math.floor(z / 16) + 4096);
  function initPads() {
    const pads = G.flora?.bouncePads; if (!pads || !pads.length) return;
    for (const p of pads) { const k = cellKey(p.pos.x, p.pos.z); let a = padGrid.get(k); if (!a) padGrid.set(k, (a = [])); a.push(p); }
    padsReady = true;
  }
  let wasGrounded = true, bounceCd = 0;
  function padUnder(P) {
    const a = padGrid.get(cellKey(P.pos.x, P.pos.z)); if (!a) return null;
    for (const p of a) {
      const dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z;
      if (dx * dx + dz * dz < p.radius * p.radius && Math.abs(P.pos.y - (p.pos.y + 0.15)) < 0.7) return p;
    }
    return null;
  }
  function updatePads(dt) {
    const P = G.player;
    if (!P || !padsReady || api.playerBounces) return;
    bounceCd -= dt;
    const g = !!P.grounded && !P.onBroom;
    if (g && !wasGrounded && bounceCd <= 0 && G.mode === 'play' && !P.dead) {
      const p = padUnder(P);
      if (p && !G.input?.held?.('descend')) {
        P.vel.y = p.power; P.state = 'air'; P.grounded = false; bounceCd = 0.3;
        P.pos.y += 0.05;
        _v.copy(P.pos); _v.y += 0.1;
        G.fx?.burst?.('jump', _v, { scale: 1.4 });
        G.fx?.burst?.('dust', _v, { scale: 1.2 });
        G.fx?.ring?.(p.pos, { color: PAL.glowCyan, radius: p.radius * 1.2, dur: 0.5, y: p.pos.y + 0.2 });
        sfx('jump', { pos: P.pos, pitch: 0.7 });
        sfx('bubble', { pos: P.pos, vol: 0.8 });
        G.player?.playAction?.('air_jump');
        G.events.emit('player:jump', { air: false, bounce: true });
        wasGrounded = false;
        return;
      }
    }
    wasGrounded = g;
  }

  // ---- 月障 barrier dome -------------------------------------------------------------------------------------------------
  function initBarrier() {
    const geo = new THREE.SphereGeometry(1, 72, 36, 0, TAU, 0, Math.PI / 2);
    const mat = new THREE.ShaderMaterial({ vertexShader: DOME_VS, fragmentShader: DOME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uDissolve: { value: 0 }, uHit: { value: new THREE.Vector4(0, -999, 0, -99) }, uAlpha: { value: 0.85 }, uInside: { value: 0 },
        uColA: { value: new THREE.Color(0x7a8cff) }, uColB: { value: new THREE.Color(0xd9b8ff) } } });
    mat.toneMapped = false;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(BARRIER.x, BARRIER.y0, BARRIER.z);
    mesh.scale.set(BARRIER.rx, BARRIER.ry, BARRIER.rx);
    mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.castShadow = false;
    G.scene.add(mesh);
    barrier = { mesh, mat, up: true, dissolving: -1, prevE: 2, hintT: -99, hitT: -99 };
  }
  function barrierUp() { return !!barrier && barrier.up; }
  function setBarrier(on, { instant = false } = {}) {
    if (!barrier) return;
    if (on) { barrier.up = true; barrier.dissolving = -1; barrier.mesh.visible = true; barrier.mat.uniforms.uDissolve.value = 0; gp().barrierDown = false; return; }
    if (!barrier.up) return;
    barrier.up = false;
    gp().barrierDown = true;
    if (instant) { barrier.mesh.visible = false; return; }
    barrier.dissolving = 0;
    const top = _v.set(BARRIER.x, BARRIER.y0 + BARRIER.ry * 0.95, BARRIER.z);
    G.fx?.burst?.('purify', top, { scale: 4 });
    G.fx?.flash?.(top, 0xd9b8ff, 400, 1.2, 160);
    G.sky?.flash?.(0xffe6a6, 1.0);
    G.fx?.shake?.(0.25, 1.2);
    sfx('shatter_crystal', { vol: 1 }); sfx('kinkan', { vol: 0.8 });
    toast(t('gameplay.toast.barrierGone'), { icon: 'greatlantern', dur: 4 });
    G.events.emit('barrier:down', { id: 'palace' });
    api.onBarrierDown?.();
  }
  function updateBarrier(dt, time) {
    if (!barrier) return;
    const u = barrier.mat.uniforms;
    u.uTime.value = time;
    {   // visuals: is the camera inside the veil? (soft over the last 6 % of the radius)
      const c = G.camera.position;
      const cx = (c.x - BARRIER.x) / BARRIER.rx, cy = Math.max(0, c.y - BARRIER.y0) / BARRIER.ry, cz = (c.z - BARRIER.z) / BARRIER.rx;
      const ce = Math.sqrt(cx * cx + cy * cy + cz * cz);
      u.uInside.value = Math.min(1, Math.max(0, (1.0 - ce) / 0.03));
    }
    if (barrier.dissolving >= 0) {
      barrier.dissolving += dt / 3.6;
      u.uDissolve.value = Math.min(1, barrier.dissolving);
      if (Math.random() < dt * 14) {
        const a = Math.random() * TAU, el = Math.random() * 1.3;
        _v.set(BARRIER.x + Math.cos(a) * Math.cos(el) * BARRIER.rx, BARRIER.y0 + Math.sin(el) * BARRIER.ry, BARRIER.z + Math.sin(a) * Math.cos(el) * BARRIER.rx);
        G.fx?.burst?.('hit_moon', _v, { scale: 2.5 });
        if (Math.random() < 0.35) G.fx?.kit?.mirrors?.(_v, 3, 9, { dur: 1.8 });   // the veil breaking into mirror shards
      }
      if (barrier.dissolving >= 1) { barrier.dissolving = -1; barrier.mesh.visible = false; }
      return;
    }
    if (!barrier.up) return;
    const P = G.player; if (!P || P.dead) return;
    // ellipsoid test (normalised distance e: 1 = on the shell)
    const dx = (P.pos.x - BARRIER.x) / BARRIER.rx, dy = (Math.max(P.pos.y + 0.8, BARRIER.y0) - BARRIER.y0) / BARRIER.ry, dz = (P.pos.z - BARRIER.z) / BARRIER.rx;
    const e = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (e < 1.0 && barrier.prevE >= 0.8) {
      // push back out along the normal and turn the broom around
      _n.set(dx / BARRIER.rx, dy / BARRIER.ry, dz / BARRIER.rx).normalize();
      const k = 1.03 / Math.max(0.01, e);
      P.pos.x = BARRIER.x + dx * k * BARRIER.rx; P.pos.z = BARRIER.z + dz * k * BARRIER.rx;
      if (dy > 0.05) P.pos.y = Math.max(P.pos.y, BARRIER.y0 + dy * k * BARRIER.ry - 0.8);
      const out = Math.atan2(_n.x, _n.z);
      if (P.onBroom && P.broom) {
        P.broom.heading = P.broom.course = out;
        P.broom.yawRate = P.broom.bank = 0;
        P.broom.speed = Math.min(P.broom.speed, 10);
        P.broom.vy = Math.max(P.broom.vy || 0, 2);
      }
      P.vel.x = _n.x * 12; P.vel.z = _n.z * 12; if (!P.onBroom) P.vel.y = Math.max(P.vel.y, 3);
      if (P.yaw !== undefined) P.yaw = out;
      _w.copy(P.pos); _w.y += 0.9;
      u.uHit.value.set(_w.x, _w.y, _w.z, time);
      G.fx?.burst?.('hit_moon', _w, { scale: 1.6, dir: _n });
      G.fx?.ring?.(_w, { color: 0xb48cff, radius: 3.5, dur: 0.5, y: _w.y });
      G.fx?.shake?.(0.18, 0.3);
      G.cam?.fovKick?.(-0.4);
      sfx('parry', { pos: _w, pitch: 0.7 }); sfx('crystal', { pos: _w, vol: 0.6 });
      if (time - barrier.hintT > 7) { barrier.hintT = time; toast(t('gameplay.toast.barrier'), { icon: 'greatlantern', dur: 3 }); }
      barrier.prevE = 1.03;
      return;
    }
    barrier.prevE = e;
  }

  // ---- crystal-pillar puzzle ------------------------------------------------------------------------------------------------
  const STEP = TAU / CRYSTAL_PUZZLE.steps;
  function initPuzzle() {
    const peds = G.structures?.crystalPedestals || [];
    if (peds.length < 3) return;
    puzzle.peds = peds.slice(0, 3);
    puzzle.target = [];
    const gl = G.structures?.greatLanterns?.[CRYSTAL_PUZZLE.lantern];
    puzzle.lanternPos = gl ? gl.pos.clone().setY(gl.pos.y + (gl.firePos?.y ?? 3.33)) : new THREE.Vector3(545, 22, -275);
    puzzle.mirror = puzzle.peds.map((p) => p.pos.clone().setY(p.pos.y + 2.08));
    for (let i = 0; i < 3; i++) {
      const to = i < 2 ? puzzle.mirror[i + 1] : puzzle.lanternPos;
      const yaw = Math.atan2(to.x - puzzle.mirror[i].x, to.z - puzzle.mirror[i].z);
      puzzle.target.push(((Math.round(yaw / STEP) % CRYSTAL_PUZZLE.steps) + CRYSTAL_PUZZLE.steps) % CRYSTAL_PUZZLE.steps);
      puzzle.anim.push({ from: 0, to: 0, t: 1 });
      G.interact?.add({ getPos: (o) => o.copy(puzzle.peds[i].pos).setY(puzzle.peds[i].pos.y + 1.2), radius: 2.6, priority: 2,
        enabled: () => !puzzle.solved, prompt: () => t('gameplay.prompt.rotate'), onInteract: () => rotate(i, 1) });
    }
    // light beams: sky -> P0, P0 -> P1, P1 -> P2, P2 -> lantern (unit cylinders stretched between points)
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
    const coreGeo = geo;
    for (let i = 0; i < 4; i++) {
      const outer = glowDynamic(0xffe6a6, 1.6, { transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const inner = glowDynamic(0xfff6dc, 3.2, { transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
      const g = new THREE.Group();
      const o = new THREE.Mesh(coreGeo, outer), c = new THREE.Mesh(coreGeo, inner);
      o.scale.set(i === 0 ? 0.55 : 0.32, i === 0 ? 0.55 : 0.32, 1); c.scale.set(0.09, 0.09, 1);
      o.frustumCulled = c.frustumCulled = false; o.castShadow = c.castShadow = false; o.renderOrder = c.renderOrder = 5;
      g.add(o, c); g.visible = false;
      G.scene.add(g);
      puzzle.beams.push({ g, outer, inner, o, c, on: 0 });
    }
  }
  const skyPoint = (out) => out.copy(puzzle.mirror[0]).add(_w.set(-0.35, 1, 0.25).normalize().multiplyScalar(90));
  function setBeam(b, from, to, k, time) {
    if (k <= 0.01) { b.g.visible = false; return; }
    b.g.visible = true;
    b.g.position.copy(from);
    b.g.lookAt(to);
    const len = from.distanceTo(to);
    const flick = 1 + 0.08 * Math.sin(time * 9 + len);
    b.o.scale.z = len; b.c.scale.z = len;
    b.c.scale.x = b.c.scale.y = 0.09 * flick;
    b.outer.userData.setGlow(k); b.inner.userData.setGlow(k);
  }
  function stepsNow() {
    let s = gp().pedestals;
    if (!Array.isArray(s) || s.length !== 3) { s = CRYSTAL_PUZZLE.start.slice(); gp().pedestals = s; }
    return s;
  }
  function rotate(i, dir = 1) {
    if (puzzle.solved || !puzzle.peds[i]) return false;
    if (G.time.t - puzzle.cool[i] < 0.35) return false;
    puzzle.cool[i] = G.time.t;
    const s = stepsNow();
    const a = puzzle.anim[i];
    a.from = puzzle.peds[i].angle; s[i] = (s[i] + dir + CRYSTAL_PUZZLE.steps) % CRYSTAL_PUZZLE.steps;
    a.to = a.from + dir * STEP; a.t = 0;
    sfx('crystal', { pos: puzzle.peds[i].pos }); sfx('switch', { pos: puzzle.peds[i].pos, vol: 0.5 });
    G.fx?.burst?.('hit_moon', _v.copy(puzzle.mirror[i]), { scale: 0.6 });
    return true;
  }
  function chain() {
    // how far the light gets: 0 = sky lights P0 only ... 3 = reaches the lantern
    const s = stepsNow();
    let n = 0;
    for (let i = 0; i < 3; i++) { if (s[i] === puzzle.target[i] && puzzle.anim[i].t >= 1) n++; else break; }
    return n;
  }
  function restorePuzzle() {
    if (!puzzle.peds.length) return;
    const s = stepsNow();
    puzzle.solved = !!gp().puzzles[CRYSTAL_PUZZLE.id];
    if (puzzle.solved) for (let i = 0; i < 3; i++) s[i] = puzzle.target[i];
    for (let i = 0; i < 3; i++) { puzzle.peds[i].setAngle(s[i] * STEP); puzzle.anim[i].t = 1; puzzle.peds[i].setLit(puzzle.solved, true); }
  }
  function updatePuzzle(dt, time) {
    if (!puzzle.peds.length) return;
    for (let i = 0; i < 3; i++) {
      const a = puzzle.anim[i];
      if (a.t < 1) { a.t = Math.min(1, a.t + dt / 0.4); const k = 1 - Math.pow(1 - a.t, 3); puzzle.peds[i].setAngle(a.from + (a.to - a.from) * k + Math.sin(a.t * Math.PI) * 0.03); }
    }
    const P = G.player;
    const near = P && P.pos.distanceTo(puzzle.mirror[0]) < 260;
    const on = near && isActive('crystal_puzzle');
    const n = puzzle.solved ? 3 : chain();
    const k = on ? 1 : 0;
    setBeam(puzzle.beams[0], skyPoint(_v), puzzle.mirror[0], k * 0.6, time);
    for (let i = 0; i < 3; i++) {
      const to = i < 2 ? puzzle.mirror[i + 1] : puzzle.lanternPos;
      setBeam(puzzle.beams[i + 1], puzzle.mirror[i], to, on && n > i ? (puzzle.solved ? 1.2 : 1) : 0, time);
    }
    if (on) for (let i = 0; i < 3; i++) { const lit = i <= n || puzzle.solved; if (puzzle.peds[i].lit !== lit) puzzle.peds[i].setLit(lit); }
    if (on && !puzzle.solved && n >= 3) solve();
  }
  function solve() {
    puzzle.solved = true;
    gp().puzzles[CRYSTAL_PUZZLE.id] = true;
    const p = puzzle.lanternPos;
    G.fx?.burst?.('hit_sun', p, { scale: 2 });
    for (const m of puzzle.mirror) G.fx?.burst?.('pickup', m, { color: PAL.crystal, scale: 1.4 });
    G.fx?.flash?.(p, 0xfff1c9, 120, 0.8, 30);
    sfx('crystal', { pos: p, vol: 1 }); sfx('stinger_quest', { vol: 0.7 });
    toast(t('gameplay.toast.puzzle'), { icon: 'greatlantern' });
    G.events.emit('puzzle:solved', { id: CRYSTAL_PUZZLE.id });
    if (typeof api.onPuzzleSolved === 'function') { try { api.onPuzzleSolved(CRYSTAL_PUZZLE.id); } catch (e) { G.reportError('gameplay:onPuzzleSolved', e); } }
    else if (!G.quests) api.setGreatLanternReady(CRYSTAL_PUZZLE.lantern, true);
  }
  /** Sun / moon spells turn the pedestal nearest to where they land. */
  function onElement(e) {
    if (!puzzle.peds.length || puzzle.solved || !e || !e.pos) return;
    if (e.element !== 'sun' && e.element !== 'moon') return;
    if (e.team && e.team !== 'player') return;
    nearestTurn(e.pos, Math.max(3, Math.min(e.radius || 3, 6)));
  }
  function onCast(e) {
    if (!puzzle.peds.length || puzzle.solved || !e || e.spell !== 'moon' || e.caster !== G.player) return;
    const pt = G.player?.aim?.point; if (pt) nearestTurn(pt, 3);
  }
  function nearestTurn(pos, r) {
    let best = -1, bd = r;
    for (let i = 0; i < 3; i++) { const d = Math.hypot(pos.x - puzzle.peds[i].pos.x, pos.z - puzzle.peds[i].pos.z); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) rotate(best, 1);
  }

  // ---- vents animation -----------------------------------------------------------------------------------------------------
  function updateVents(dt, time) {
    const P = G.player;
    for (const v of vents) {
      v.mat.uniforms.uTime.value = time;
      v.swirl.rotation.y = time * 0.6 + v.spin;
      const near = P ? (v.pos.x - P.pos.x) ** 2 + (v.pos.z - P.pos.z) ** 2 < 160 * 160 : false;
      v.swirl.visible = near;
      if (near && !v.em) v.em = G.fx?.emitter?.('updraft', { radius: v.radius, height: Math.min(v.height, 40) }) || null;
      if (!near && v.em) { v.em.remove?.(); v.em = null; }
      if (v.em) v.em.pos.copy(v.pos);
    }
  }

  function init() { initVents(); initPads(); initBarrier(); initPuzzle(); }
  function start() {
    startVents();
    if (!padsReady) initPads();
    if (barrier) { if (gp().barrierDown) setBarrier(false, { instant: true }); else setBarrier(true); barrier.prevE = 2; }
    restorePuzzle();
  }
  function update(dt) {
    const time = G.time.t;
    updateVents(dt, time);
    updatePads(dt);
    updateBarrier(dt, time);
    updatePuzzle(dt, time);
  }
  return { init, start, update, onElement, onCast, setBarrier, barrierUp, rotate, puzzle, vents, get barrier() { return barrier; },
    puzzleSolved: () => !!puzzle.solved };
}
