// 团子 — the heroine's companion: a small fox spirit made of light that floats near her shoulder, sleeps curled on the broom
// tail in flight, emotes in dialogues and gives gentle contextual hints after idle time through small speech bubbles (respects
// G.settings.hints). First-time key hints are queued here too (G.state.story.hints[id]).
// Body (final-beasts round, docs/api/actors-look.md "团子"): hand-built skinned fox spirit — round body, big brush tail that
// trails like a ribbon of flame, tall tufted ears, glossy eyes that blink and look where she looks, warm inner light, a trail
// of motes; cel 'fur' shading + ink hull like the heroine. All motion is procedural (springs + bone poses), no clips.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/game.js';
import { t, raw } from '../core/i18n.js';
import { makeCelMaterial, buildOutlines, updateCelGlobals } from '../actors/celmat.js';
import { bubble, bubblesActive } from './bubbles.js';
import { fill } from './dialogue.js';
import { clamp, damp, angleDiff, TAU } from '../core/util.js';

const _t = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Vector3();
const _a = new THREE.Vector3(), _l = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _qq = new THREE.Quaternion();
const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

function glowSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,236,190,0.8)'); g.addColorStop(0.35, 'rgba(255,196,110,0.3)'); g.addColorStop(1, 'rgba(255,170,80,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const m = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3 });
  const s = new THREE.Sprite(m); s.scale.setScalar(0.9); s.renderOrder = 2;
  return s;
}
// ---- the body: hand-built fox spirit (final-beasts round) -------------------------------------------------------------
// One SkinnedMesh on its own 17-bone skeleton (model space in metres, facing +z), one cel 'fur' material: vertex colours carry
// the painted two-tone fur, uv.x carries how much a vertex glows (an emissive ramp: faint warm body light -> gold tail flame ->
// white eye glints). Ink outline = one hull draw. Motes = one Points draw, halo = one sprite.
const B = { root: 0, body: 1, chest: 2, head: 3, earL: 4, earR: 5, eyeL: 6, eyeR: 7, tail: 8, pawF: 15, pawH: 16 };
const TAILN = 7;
const BONE_POS = [
  [0, 0, 0, -1], [0, 0, 0, 0], [0, 0.02, 0.08, 1], [0, 0.085, 0.115, 2],
  [0.064, 0.228, 0.128, 3], [-0.064, 0.228, 0.128, 3], [0.05, 0.162, 0.236, 3], [-0.05, 0.162, 0.236, 3],
];
function tailSpine(t) { return [0, 0.012 + 0.05 * t + 0.35 * t * t - 0.1 * t * t * t, -0.075 - 0.36 * t + 0.1 * t * t * t]; }
for (let i = 0; i < TAILN; i++) { const p = tailSpine(i / TAILN); BONE_POS.push([p[0], p[1], p[2], i === 0 ? 1 : B.tail + i - 1]); }
BONE_POS.push([0, -0.055, 0.075, 1], [0, -0.05, -0.055, 1]);

const COL = {
  cream: [1.0, 0.88, 0.72], back: [1.0, 0.64, 0.32], belly: [1.0, 0.985, 0.95], white: [1, 1, 0.98],
  inner: [1.0, 0.72, 0.64], innerDeep: [0.93, 0.55, 0.5], amber: [0.98, 0.5, 0.2], gold: [1.0, 0.76, 0.32], pale: [1.0, 0.95, 0.78],
  nose: [0.3, 0.14, 0.1], pupil: [0.1, 0.04, 0.03], irisTop: [0.36, 0.17, 0.06], irisLow: [1.0, 0.68, 0.26], rim: [0.18, 0.08, 0.04],
  blush: [1.0, 0.66, 0.6], paw: [1.0, 0.7, 0.4],
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** a part: arrays -> BufferGeometry (position, normal, color, uv, skinIndex, skinWeight, index) */
function partGeo(P, N, Cc, U, SI, SW, I, computeN) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  for (let i = 0; i < Cc.length; i++) Cc[i] = Math.pow(Cc[i], 2.2);   // painted in sRGB, vertex colours are linear
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.setIndex(I);
  if (computeN) g.computeVertexNormals(); else g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
const _eq = new THREE.Quaternion(), _ev = new THREE.Vector3(), _en = new THREE.Vector3();
/** ellipsoid at c with radii r, rotated by euler e; paint(dirLocal, posWorld) -> [r,g,b,glow]; bone index or [[i,w],[j,w]] */
function ellipsoid(c, r, e, ws, hs, paint, bone) {
  const P = [], N = [], Cc = [], U = [], SI = [], SW = [], I = [];
  _eq.setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
  for (let j = 0; j <= hs; j++) {
    const v = j / hs, th = v * Math.PI;
    for (let i = 0; i <= ws; i++) {
      const u = i / ws, ph = u * Math.PI * 2;
      const dx = Math.sin(th) * Math.sin(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.cos(ph);
      _ev.set(dx * r[0], dy * r[1], dz * r[2]).applyQuaternion(_eq);
      _en.set(dx / r[0], dy / r[1], dz / r[2]).normalize().applyQuaternion(_eq);
      const px = c[0] + _ev.x, py = c[1] + _ev.y, pz = c[2] + _ev.z;
      P.push(px, py, pz); N.push(_en.x, _en.y, _en.z);
      const k = paint([dx, dy, dz], [px, py, pz], _en);
      Cc.push(k[0], k[1], k[2]); U.push(k[3] ?? 0.1, 0.5);
      const w = typeof bone === 'function' ? bone([px, py, pz]) : [[bone, 1]];
      SI.push(w[0][0], w[1]?.[0] ?? 0, 0, 0); SW.push(w[0][1], w[1]?.[1] ?? 0, 0, 0);
    }
  }
  for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) {
    const a = j * (ws + 1) + i, b = a + ws + 1;
    I.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return partGeo(P, N, Cc, U, SI, SW, I, false);
}
const _T = new THREE.Vector3(), _Bv = new THREE.Vector3(), _Nv = new THREE.Vector3(), _ref = new THREE.Vector3();
/** sweep a cross-section along spine(t) -> [x,y,z]; rad(t, th) -> [rx, ry]; ref = the cross-section "up" hint */
function sweep(spine, rad, rings, segs, ref, paint, bone) {
  const P = [], Cc = [], U = [], SI = [], SW = [], I = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const a = spine(Math.max(0, t - 0.01)), b = spine(Math.min(1, t + 0.01)), c = spine(t);
    _T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _ref.set(ref[0], ref[1], ref[2]);
    _Bv.crossVectors(_T, _ref).normalize(); _Nv.crossVectors(_Bv, _T).normalize();
    for (let i = 0; i < segs; i++) {
      const th = (i / segs) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      const [rx, ry] = rad(t, th);
      const px = c[0] + _Bv.x * ct * rx + _Nv.x * st * ry, py = c[1] + _Bv.y * ct * rx + _Nv.y * st * ry, pz = c[2] + _Bv.z * ct * rx + _Nv.z * st * ry;
      P.push(px, py, pz);
      const k = paint(t, ct, st, [px, py, pz]);
      Cc.push(k[0], k[1], k[2]); U.push(k[3] ?? 0.1, 0.5);
      const w = typeof bone === 'function' ? bone(t) : [[bone, 1]];
      SI.push(w[0][0], w[1]?.[0] ?? 0, 0, 0); SW.push(w[0][1], w[1]?.[1] ?? 0, 0, 0);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
    const a = j * segs + i, b = j * segs + ((i + 1) % segs), c = a + segs, d = b + segs;
    I.push(a, c, b, b, c, d);
  }
  return partGeo(P, null, Cc, U, SI, SW, I, true);
}

function rampTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 1;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, '#000000'); g.addColorStop(0.12, '#2e1e0e'); g.addColorStop(0.3, '#6e4618');
  g.addColorStop(0.6, '#ffae48'); g.addColorStop(0.85, '#ffe0a0'); g.addColorStop(1, '#ffffff');
  x.fillStyle = g; x.fillRect(0, 0, 64, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,230,170,0.7)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function buildFoxSpirit() {
  const parts = [];
  // ---- torso: an egg, warm back, white belly
  const furPaint = (glow0) => (d, p, n) => {
    const up = n.y;
    let col = mix3(COL.cream, COL.back, sstep(0.05, 0.75, up));
    col = mix3(col, COL.belly, sstep(0.0, -0.6, up));
    return [...col, glow0 + sstep(0.3, 0.9, up) * 0.05];
  };
  parts.push(ellipsoid([0, 0.0, -0.005], [0.098, 0.092, 0.128], [-0.12, 0, 0], 28, 20, furPaint(0.14), (p) => (p[2] > 0.06 ? [[B.chest, 0.6], [B.body, 0.4]] : [[B.body, 1]])));
  // chest ruff: white, and three soft tongues falling from it
  parts.push(ellipsoid([0, 0.03, 0.085], [0.074, 0.08, 0.06], [0.25, 0, 0], 22, 16, () => [...COL.belly, 0.16], B.chest));
  for (const s of [-1, 0, 1]) {
    const o = [s * 0.034, -0.025, 0.11];
    parts.push(sweep((t) => [o[0] + s * 0.008 * t, o[1] - 0.032 * t, o[2] + 0.01 * t - 0.012 * t * t],
      (t) => { const r = 0.032 * Math.pow(Math.max(0, 1 - t * t), 0.5); return [r, r * 0.8]; }, 6, 10, [0, 0, 1], () => [...COL.belly, 0.16], B.chest));
  }
  // paws (tucked)
  for (const s of [-1, 1]) {
    parts.push(ellipsoid([s * 0.044, -0.082, 0.075], [0.026, 0.03, 0.038], [0.3, 0, 0], 12, 10, (d) => [...mix3(COL.cream, COL.paw, sstep(0.0, -0.8, d[1])), 0.16], B.pawF));
    parts.push(ellipsoid([s * 0.054, -0.066, -0.05], [0.027, 0.027, 0.04], [0.2, 0, 0], 12, 10, (d) => [...mix3(COL.cream, COL.paw, sstep(0.0, -0.8, d[1])), 0.16], B.pawH));
  }
  // ---- head: big and round; white muzzle and cheeks, warm crown, a rosy blush under each eye
  const HC = [0, 0.152, 0.15];
  parts.push(ellipsoid(HC, [0.118, 0.104, 0.108], [0, 0, 0], 32, 24, (d, p, n) => {
    let col = mix3(COL.cream, COL.back, sstep(0.2, 0.9, d[1]) * 0.9 * sstep(0.75, 0.2, d[2]));
    const low = sstep(0.1, -0.5, d[1]) * sstep(0.2, 0.8, d[2]);
    col = mix3(col, COL.belly, Math.min(1, low * 1.4 + sstep(-0.1, -0.7, d[1]) * 0.8));
    for (const s of [-1, 1]) { const q = Math.hypot(p[0] - s * 0.073, p[1] - 0.128, p[2] - 0.222); col = mix3(col, COL.blush, sstep(0.03, 0.012, q) * 0.7); }
    return [...col, 0.15];
  }, B.head));
  parts.push(ellipsoid([0, 0.118, 0.238], [0.05, 0.04, 0.058], [0.18, 0, 0], 18, 12, () => [...COL.belly, 0.16], B.head));
  parts.push(ellipsoid([0, 0.134, 0.294], [0.017, 0.013, 0.012], [0, 0, 0], 10, 8, () => [...COL.nose, 0], B.head));
  // cheek fluff: soft white puffs at the jaw, a smaller one behind
  for (const s of [-1, 1]) {
    parts.push(ellipsoid([s * 0.088, 0.112, 0.17], [0.042, 0.036, 0.04], [0, s * 0.5, s * -0.35], 14, 10, () => [...COL.belly, 0.16], B.head));
    parts.push(ellipsoid([s * 0.1, 0.098, 0.128], [0.03, 0.028, 0.032], [0, s * 0.6, s * -0.5], 12, 8, () => [...COL.belly, 0.16], B.head));
  }
  // forelock tuft
  parts.push(sweep((t) => [0.004 * t, 0.245 + 0.03 * t - 0.012 * t * t, 0.16 + 0.055 * t - 0.01 * t * t],
    (t) => { const r = 0.03 * Math.pow(1 - t, 0.8); return [r, r * 0.55]; }, 6, 10, [0, 0, 1], (t) => [...mix3(COL.back, COL.gold, t), 0.16 + t * 0.2], B.head));
  // ---- ears: tall leaves with a rosy inner face, amber tips and a glowing tuft
  for (const [s, bone] of [[1, B.earL], [-1, B.earR]]) {
    const base = [s * 0.064, 0.208, 0.128];
    const dir = new THREE.Vector3(s * 0.38, 1, -0.12).normalize();
    const L = 0.15;
    const sp = (t) => [base[0] + dir.x * L * t + s * 0.01 * t * t, base[1] + dir.y * L * t, base[2] + dir.z * L * t - 0.012 * t * t];
    parts.push(sweep(sp, (t) => { const w = 0.068 * Math.pow(Math.max(0, 1 - t), 0.85) * (0.8 + 0.2 * sstep(0, 0.25, t)); return [w, w * 0.4]; }, 12, 16, [0, 0, 1],
      (t, ct, st) => {
        let col = mix3(COL.cream, COL.amber, sstep(0.55, 0.95, t));
        const front = sstep(0.15, 0.6, st) * sstep(0.85, 0.5, t) * sstep(0.95, 0.4, Math.abs(ct));
        col = mix3(col, mix3(COL.inner, COL.innerDeep, sstep(0.6, 1, st) * 0.6), front);
        return [...col, 0.15 + sstep(0.6, 1, t) * 0.25];
      }, bone));
    const tip = sp(0.9);
    parts.push(sweep((t) => [tip[0] + s * 0.014 * t, tip[1] + 0.034 * t, tip[2] - 0.012 * t * t],
      (t) => { const r = 0.014 * Math.pow(1 - t, 0.6); return [r, r * 0.75]; }, 5, 8, [0, 0, 1], (t) => [...mix3(COL.amber, COL.pale, t), 0.4 + t * 0.4], bone));
  }
  // ---- eyes: tall glossy ovals, dark top to amber bottom, two white glints that glow
  for (const [s, bone] of [[1, B.eyeL], [-1, B.eyeR]]) {
    const c = BONE_POS[bone];
    parts.push(ellipsoid([c[0], c[1], c[2]], [0.029, 0.037, 0.018], [-0.08, s * 0.42, 0], 28, 22, (d) => {
      if (d[2] < 0.15) return [...COL.rim, 0];
      const x = d[0], y = d[1];
      const rho = Math.hypot(x, y * 0.95);
      let col = mix3(COL.irisTop, COL.irisLow, sstep(0.45, -0.75, y));
      let gl = sstep(-0.2, -0.8, y) * 0.3;
      col = mix3(col, COL.pupil, sstep(0.5, 0.36, Math.hypot(x, y + 0.05)));
      col = mix3(col, COL.rim, sstep(0.8, 0.93, rho));
      const h1 = Math.hypot(x - 0.28, y - 0.4), h2 = Math.hypot(x + 0.3, y + 0.42);
      const hl = Math.max(sstep(0.27, 0.17, h1), sstep(0.13, 0.07, h2) * 0.9);
      col = mix3(col, COL.white, hl); gl = Math.max(gl, hl);
      return [...col, gl];
    }, bone));
  }
  // ---- the tail: a brush that swells, twists into three flame tongues and burns gold at the tip
  const tw = (t) => Math.min(TAILN - 1e-4, t * TAILN);
  parts.push(sweep(tailSpine, (t, th) => {
    let r = 0.088 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.78))), 0.62);
    r = Math.max(r, 0.034 * (1 - t / 0.35)) ;
    r *= 1 + 0.26 * Math.sin(3 * th + t * 11) * sstep(0.35, 0.9, t);
    return [r, r * 0.92];
  }, 34, 18, [0, 1, 0], (t, ct, st) => {
    let col = mix3(COL.cream, COL.back, sstep(0.1, 0.9, st) * 0.6 * (1 - sstep(0.4, 0.6, t)));
    col = mix3(col, COL.white, sstep(0.48, 0.62, t));
    col = mix3(col, COL.gold, sstep(0.66, 0.84, t));
    col = mix3(col, COL.pale, sstep(0.93, 1.0, t));
    return [...col, 0.15 + sstep(0.5, 0.82, t) * 0.48 + sstep(0.86, 1.0, t) * 0.32];
  }, (t) => { const s = tw(t), i = Math.floor(s), f = s - i; return i + 1 < TAILN ? [[B.tail + i, 1 - f], [B.tail + i + 1, f]] : [[B.tail + i, 1]]; }));

  const geo = BGU.mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return { geo, bones: buildBones() };
}

/** The 17-bone skeleton at rest (BONE_POS), index order 0..16 */
function buildBones() {
  const bones = BONE_POS.map((b, i) => { const o = new THREE.Bone(); o.name = 'dango_' + i; return o; });
  BONE_POS.forEach((b, i) => {
    if (b[3] < 0) { bones[i].position.set(b[0], b[1], b[2]); return; }
    const pp = BONE_POS[b[3]];
    // world rest positions -> local offsets (bones have identity rotation at rest)
    bones[i].position.set(b[0] - pp[0], b[1] - pp[1], b[2] - pp[2]);
    bones[b[3]].add(bones[i]);
  });
  return bones;
}

/**
 * Sculpted body (tools/sculpt/assets/dango.mjs, .tmp/sculpt/dango/INSTALL.md; switch G.sculpt 'dango', ?sculpt=0 = the
 * hand-built body above). Same 17 bones and attributes as buildFoxSpirit: COLOR_0 painted fur (linear; A = tip mask, read
 * by the cel material, see celmat CEL_TIP), uv.x = glow ramp, eye shells weighted to the eye bones. null = use the old body.
 */
function sculptedFox() {
  if (!G.sculpt?.on('dango')) return null;
  const g = G.assets?.raw?.('sculpt_dango');
  let src = null;
  g?.scene.traverse((o) => { if (!src && o.isSkinnedMesh) src = o; });
  if (!src || !src.geometry.attributes.color || !src.geometry.attributes.uv) return null;
  const geo = src.geometry.clone();
  // skin joints -> the game's bone index (names dango_<i>); identity today, kept so a re-export cannot scramble them
  const jmap = src.skeleton.bones.map((b) => +String(b.name).replace('dango_', ''));
  if (jmap.some((v, i) => v !== i)) {
    const si = geo.attributes.skinIndex;
    for (let i = 0; i < si.count; i++) si.setXYZW(i, jmap[si.getX(i)], jmap[si.getY(i)], jmap[si.getZ(i)], jmap[si.getW(i)]);
  }
  geo.userData.sculpt = true;
  return { geo, bones: buildBones() };
}

function inkFor(r, g, b, glow) {
  const c = new THREE.Color(r, g, b); const h = {}; c.getHSL(h);
  if (glow > 0.45) c.setHSL(0.08, 0.95, 0.42); else c.setHSL(h.s < 0.05 ? 0.06 : h.h, Math.min(1, h.s * 0.8 + 0.45), Math.min(0.2, h.l * 0.16 + 0.07));
  return c;
}

/** Build the companion body: { root (Group), mesh, bones, motes, sprite, mat } */
function makeDango() {
  const sc = sculptedFox();
  const { geo, bones } = sc || buildFoxSpirit();
  const src = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveMap: rampTexture() });
  src.name = 'DangoFur';
  const mat = makeCelMaterial(src, 'fur', { sph: 0, grain: 0.03, tip: !!sc });
  mat.setSpirit(0xffc46a, 1.2);   // warm living edge light (inner glow)
  const root = new THREE.Group(); root.name = 'dangoBody';
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = 'Dango'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.add(bones[0]);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  const outs = buildOutlines(root);
  for (const o of outs) {
    const C = geo.attributes.color, U = geo.attributes.uv, oc = o.geometry.attributes.aOutC, ow = o.geometry.attributes.aOutW;
    if (!oc || oc.count !== C.count) continue;
    for (let i = 0; i < C.count; i++) {
      const gl = U.getX(i), k = inkFor(C.getX(i), C.getY(i), C.getZ(i), gl);
      oc.setXYZ(i, k.r, k.g, k.b); ow.setX(i, gl > 0.45 ? 0.35 : gl > 0.25 ? 0.6 : 0.85);
    }
    oc.needsUpdate = ow.needsUpdate = true;
  }
  // motes: a short trail of light from the tail flame (world space, one draw)
  const N = 26;
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  mg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.05, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  motes.frustumCulled = false; motes.name = 'dangoMotes';
  motes.userData.m = Array.from({ length: N }, () => ({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 }));
  return { root, mesh, bones, mat, motes, outlines: outs, sculpt: !!sc };
}

export function createCompanion(story) {
  const C = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, creature: null, group: null, sprite: null, body: null,
    idleT: 0, hintT: 0, chatterT: 25, emoteT: 0, emoteKind: '', queue: [], lastPlayer: new THREE.Vector3(), spin: 0, hop: 0,
  };
  // motion state (procedural; see update)
  const M = {
    prev: new THREE.Vector3(), v: new THREE.Vector3(), yawPrev: 0, yawRate: 0, bank: 0, pitch: 0, lift: 0,
    hy: 0, hp: 0, hr: 0, eyeY: 0, earB: 0, earD: 0, earF: [0, 0], flickT: 2, blinkT: 2, blinkPh: -1, blink: 0,
    tailY: new Float32Array(TAILN), tailP: new Float32Array(TAILN), sleep: 0, hide: 0, peek: 0,
    startle: 0, sneezeT: -1, sneezeCd: 0, sneezePh: -1, flinch: 0, glanceT: 6, glance: 0, squash: 0, squashV: 0, burst: 0, init: false,
  };
  C._m = M;   // tests / shots only
  const hintsOn = () => G.settings?.hints !== false;
  const seen = () => (G.state?.story ? (G.state.story.hints ||= {}) : {});

  C.init = () => {
    const g = new THREE.Group(); g.name = 'dango';
    try {
      C.body = makeDango();
      g.add(C.body.root);
      G.scene.add(C.body.motes);
    } catch (e) { G.reportError('dango:model', e); C.body = null; }
    C.sprite = glowSprite(); C.sprite.position.set(0, 0.12, 0.02); g.add(C.sprite);
    C.group = g;
    G.scene.add(g);
    C.pos.set(0, -100, 0);
    // spell reactions: ears back at thunder, a sneeze in smoke, a flinch when she is hurt
    const near = (p, r) => p && C.pos.distanceToSquared(p) < r * r;
    G.events?.on?.('element:applied', (e) => {
      if (!e) return;
      if (e.element === 'thunder' && near(e.pos, 30)) { M.startle = 1.5; M.squashV += 3; C.hop = Math.max(C.hop, 0.55); M.blinkPh = -1; }
      else if (e.element === 'fire' && near(e.pos, 9)) queueSneeze();
    });
    G.events?.on?.('element:reaction', (e) => { if (e && /burn|ignite|smoke|steam|fire|scorch/.test(e.type || '') && near(e.pos, 10)) queueSneeze(); });
    G.events?.on?.('player:damaged', () => { M.flinch = 0.6; M.squashV -= 2.5; });
  };
  function queueSneeze() { if (M.sneezeCd > 0 || M.sneezeT >= 0 || M.sneezePh >= 0) return; M.sneezeT = 0.35 + Math.random() * 0.5; M.sneezeCd = 7; }
  C.start = () => {
    const P = G.player; if (P) C.pos.copy(P.pos).add(_t.set(0.6, 1.6, 0));
    C.vel.set(0, 0, 0); M.init = false;
    C.idleT = 0; C.hintT = 6; C.queue.length = 0;
  };
  C.headPos = (out) => out.copy(C.pos).setY(C.pos.y + 0.42);

  /** Small speech bubble from 团子 (always shown, not gated by the hint setting). */
  C.say = (text, dur = 4.2) => { if (text) bubble('dango', text, C.headPos, { name: t('story.name.dango'), dur, cls: 'dango' }); C.emote('talk'); };
  /** Gentle hint (gated by settings, each id once unless repeat). key = locale key under story.hint */
  C.hint = (id, { repeat = false, vars, delay = 0, force = false, when = null } = {}) => {
    if (!hintsOn() && !force) return false;
    if (!repeat && seen()[id]) return false;
    if (!story.live && !force) return false;
    C.queue.push({ id, vars, at: G.time.real + delay, repeat, when });
    return true;
  };
  /** Expressions: talk | joy (spin, wag, happy eyes) | surprised (hop, wide eyes) | sorrow (ears droop) | angry (ears back,
   *  puffed) | fun (wag). */
  C.emote = (kind) => {
    C.emoteKind = kind || 'talk';
    C.emoteT = kind === 'joy' ? 1.4 : kind === 'surprised' ? 0.9 : kind === 'sorrow' || kind === 'angry' ? 1.8 : kind === 'fun' ? 1.4 : 0.7;
    if (kind === 'joy') C.spin = 1;
    if (kind === 'surprised') { C.hop = 1; M.squashV += 2; }
  };

  function direction(p) {
    const P = G.player; if (!P) return '';
    const dx = p.x - P.pos.x, dz = p.z - P.pos.z;
    const a = Math.atan2(dx, -dz); // 0 = north (−z), clockwise
    const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    return t('story.hint.dir.' + DIRS[i]);
  }
  function idleHint() {
    const id = G.quests?.trackedId?.(); if (!id) return false;
    const tr = G.quests.tracker(); if (!tr) return false;
    const tg = G.quests.targets(id)[0];
    if (tg && G.player) {
      const m = Math.round(Math.hypot(tg.x - G.player.pos.x, tg.z - G.player.pos.z));
      if (m > 25) { C.say(fill(t('story.hint.idleFar', { dir: direction(tg), m })), 4.6); return true; }
    }
    C.say(fill(t('story.hint.idleMain', { obj: tr.objective })), 4.6);
    return true;
  }

  // ---- body motion ----------------------------------------------------------------------------------------------------
  const rotB = (b, x, y, z) => { _e.set(x, y, z, 'YXZ'); b.quaternion.setFromEuler(_e); };
  const TIP = new THREE.Vector3(0, 0.032, -0.031);
  function move(P, dt, time) {
    const yaw = P.yaw || 0;
    _f.set(Math.sin(yaw), 0, Math.cos(yaw));
    _r.set(_f.z, 0, -_f.x); // heroine's left (screen right when behind her)
    const broom = !!(P.onBroom && P.broom?.perchWorld);
    const combat = !broom && !!G.combat?.inCombat;
    const talking = !!(story.busy && G.dialogue?.active);
    const it = !broom && !combat && !talking ? G.interact?.current : null;
    const itPos = it && (it.pos || it.o?.pos);
    const peek = !!(itPos && Math.hypot(itPos.x - P.pos.x, itPos.z - P.pos.z) < 4.5);
    M.sleep = damp(M.sleep, broom ? 1 : 0, broom ? 2.5 : 5, dt);
    M.hide = damp(M.hide, combat ? 1 : 0, 4, dt);
    M.peek = damp(M.peek, peek ? 1 : 0, 3, dt);
    // where to float
    const bob = Math.sin(time * 2.1) * 0.07 * (1 - M.sleep) + Math.sin(time * 0.77) * 0.03;
    if (broom) P.broom.perchWorld(_t);
    else if (combat) { _t.copy(P.pos).addScaledVector(_f, -0.62).addScaledVector(_r, -0.22); _t.y += 1.22 + bob * 0.5; }
    else {
      _t.copy(P.pos).addScaledVector(_r, -0.58).addScaledVector(_f, -0.22); _t.y += 1.58 + bob;
      if (talking) {
        _t.addScaledVector(_f, 0.55);
        // play-test: on the camera's side of her it filled a third of the dialogue shot — float on her far side instead
        const cs = (G.camera.position.x - P.pos.x) * _r.x + (G.camera.position.z - P.pos.z) * _r.z;
        if (cs < 0) _t.addScaledVector(_r, 1.16);
      }
      if (peek) {   // drift out to peek at what she is reaching for (never further than ~1.3 m from her)
        _a.set(itPos.x, (itPos.y ?? P.pos.y + 1) + 0.25, itPos.z);
        _l.copy(_a).sub(P.pos); _l.y = 0; const d = _l.length(); if (d > 1.3) _l.multiplyScalar(1.3 / d);
        _a.set(P.pos.x + _l.x - _r.x * 0.3, Math.max(P.pos.y + 1.0, Math.min(_a.y + 0.2, P.pos.y + 1.7)), P.pos.z + _l.z - _r.z * 0.3);
        _t.lerp(_a, 0.65 * M.peek);
      }
    }
    const pv = P.vel || _q.set(0, 0, 0);
    if (!M.init || C.pos.distanceToSquared(_t) > 400) { C.pos.copy(_t); C.vel.set(0, 0, 0); M.prev.copy(_t); M.init = true; }
    else if (broom) {
      C.pos.addScaledVector(pv, dt);
      C.pos.lerp(_t, 1 - Math.exp(-(6 + 14 * M.sleep) * dt));
      C.vel.copy(pv);
    } else {
      // a spring that lags a little behind her motion and catches up with a small overshoot
      const k = 38, c = 8.6, lagK = 0.84;
      const steps = Math.max(1, Math.ceil(dt / 0.017)), h = dt / steps;
      for (let i = 0; i < steps; i++) {
        _a.copy(_t).sub(C.pos).multiplyScalar(k);
        _a.x += c * (pv.x * lagK - C.vel.x); _a.y += c * (pv.y * lagK * 0.5 - C.vel.y); _a.z += c * (pv.z * lagK - C.vel.z);
        C.vel.addScaledVector(_a, h); C.pos.addScaledVector(C.vel, h);
      }
    }
    // measured motion in its own frame
    if (dt > 0) M.v.copy(C.pos).sub(M.prev).divideScalar(dt);
    M.prev.copy(C.pos);
    const spd = Math.hypot(M.v.x, M.v.z);
    // where it looks: what she reaches for > her face while talking > (now and then) the viewer > where she looks
    M.glanceT -= dt;
    if (M.glanceT <= 0) { M.glance = M.glance > 0 ? 0 : (spd < 1.5 && !combat ? 1 : 0); M.glanceT = M.glance ? 1.1 + Math.random() * 0.8 : 4 + Math.random() * 6; }
    const cam = G.camera;
    if (peek) _l.set(itPos.x, (itPos.y ?? P.pos.y + 1) + 0.1, itPos.z);
    else if (talking) _l.copy(P.pos).setY(P.pos.y + 1.45);
    else if (M.glance && cam) _l.copy(cam.position);
    else if (cam) { cam.getWorldDirection(_l); _l.multiplyScalar(14).add(cam.position); }
    else _l.copy(C.pos).addScaledVector(_f, 5);
    // facing: into its motion when it moves fast, otherwise half-way toward what it looks at
    let face;
    if (broom) face = yaw + 1.35;
    else if (spd > 2.2) face = Math.atan2(M.v.x, M.v.z);
    else { const lk = Math.atan2(_l.x - C.pos.x, _l.z - C.pos.z); face = yaw + angleDiff(yaw, lk) * (talking || peek ? 0.75 : 0.45); }
    const dy = angleDiff(C.yaw, face);
    C.yaw += dy * (1 - Math.exp(-(broom ? 8 : 5) * dt));
    M.yawRate = damp(M.yawRate, dt > 0 ? angleDiff(M.yawPrev, C.yaw) / dt : 0, 8, dt); M.yawPrev = C.yaw;
    // head toward the look point, in body space
    const ldx = _l.x - C.pos.x, ldz = _l.z - C.pos.z, ldy = _l.y - (C.pos.y + 0.15);
    const lyaw = angleDiff(C.yaw, Math.atan2(ldx, ldz)), lp = Math.atan2(ldy, Math.hypot(ldx, ldz));
    const hyT = M.sleep > 0.5 ? 0.5 : clamp(lyaw, -1.05, 1.05), hpT = M.sleep > 0.5 ? -0.55 : clamp(-lp, -0.5, 0.55);
    M.hy = damp(M.hy, hyT, 7, dt); M.hp = damp(M.hp, hpT, 7, dt);
    M.eyeY = damp(M.eyeY, clamp(lyaw - M.hy, -0.3, 0.3), 14, dt);
    // banking + pitch from turns and speed; local velocity
    const fx = Math.sin(C.yaw), fz = Math.cos(C.yaw);
    const vF = M.v.x * fx + M.v.z * fz, vL = M.v.x * fz - M.v.z * fx;
    M.bank = damp(M.bank, (1 - M.sleep) * clamp(-M.yawRate * Math.min(spd, 9) * 0.07 - vL * 0.05, -0.65, 0.65), 6, dt);
    M.pitch = damp(M.pitch, (1 - M.sleep) * clamp(vF * 0.03 - M.v.y * 0.04, -0.3, 0.38) + M.hide * 0.08, 5, dt);
    return { spd, vF, vL, broom, combat, talking, peek };
  }

  function pose(S, dt, time) {
    const Bn = C.body.bones;
    const emo = C.emoteT > 0 ? C.emoteKind : '';
    // squash spring (hop / sneeze / startle land)
    M.squashV += (-90 * M.squash - 9 * M.squashV) * dt; M.squash += M.squashV * dt;
    M.startle = Math.max(0, M.startle - dt); M.flinch = Math.max(0, M.flinch - dt); M.sneezeCd = Math.max(0, M.sneezeCd - dt);
    if (M.sneezeT >= 0) { M.sneezeT -= dt; if (M.sneezeT < 0) M.sneezePh = 0; }
    let sneezeHead = 0, sneezeEyes = 0;
    if (M.sneezePh >= 0) {
      M.sneezePh += dt;
      const p = M.sneezePh;
      if (p < 0.42) { sneezeHead = -0.35 * Math.sin((p / 0.42) * Math.PI * 0.5); sneezeEyes = clamp(p / 0.3); }
      else if (p < 0.75) {
        const q = (p - 0.42) / 0.33; sneezeHead = -0.35 + 0.95 * Math.sin(Math.min(1, q * 2.2) * Math.PI * 0.5) * (1 - q * 0.6); sneezeEyes = 1;
        if (!M.burst) { M.burst = 1; M.squashV -= 4.5; C.hop = Math.max(C.hop, 0.35); }
      } else if (p < 1.1) { sneezeHead = 0.35 * (1 - (p - 0.75) / 0.35); sneezeEyes = 1 - (p - 0.75) / 0.35; }
      else { M.sneezePh = -1; M.burst = 0; }
    }
    // breathing
    const br = Math.sin(time * (M.sleep > 0.5 ? 1.5 : 2.6)) * (M.sleep > 0.5 ? 0.03 : 0.016);
    const puff = emo === 'angry' ? 0.07 : 0;
    const sq = clamp(M.squash, -0.3, 0.3);
    C.body.root.scale.set(1 + br * 0.6 + puff - sq * 0.5, 1 + br + puff + sq, 1 - sq * 0.3 + puff * 0.5);
    rotB(Bn[B.body], M.sleep * 0.1, M.sleep * 0.25, 0);
    rotB(Bn[B.chest], M.sleep * 0.1, 0, 0);
    // head: look + talk bob + sorrow droop + sneeze + sleep tuck; a tilt when it peeks or listens
    const talkBob = emo === 'talk' ? Math.sin(time * 13) * 0.07 : 0;
    const sorrow = emo === 'sorrow' ? 1 : 0;
    const tilt = (M.peek * 0.28 + (M.glance ? 0.18 : 0)) * (1 - M.sleep) + Math.sin(time * 0.6) * 0.04;
    rotB(Bn[B.head], M.hp + talkBob + sorrow * 0.35 + sneezeHead + M.sleep * 0.2, M.hy + M.sleep * 0.5, tilt + M.sleep * 0.35);
    // ears: back at thunder / in a fight / when angry; droop when sad or asleep; random flicks; a little forward when peeking
    const back = Math.max(M.hide * 0.7, clamp(M.startle / 0.6) * 1.0, emo === 'angry' ? 0.8 : 0, M.flinch * 1.2, sneezeEyes * 0.5);
    const droop = Math.max(sorrow * 0.85, M.sleep * 0.8);
    M.earB = damp(M.earB, back, 12, dt); M.earD = damp(M.earD, droop, 5, dt);
    M.flickT -= dt;
    if (M.flickT <= 0) { M.flickT = 1.5 + Math.random() * 4.5; const w = Math.random() < 0.5 ? 0 : 1; M.earF[w] = 1; if (Math.random() < 0.3) M.earF[1 - w] = 0.7; }
    for (let s = 0; s < 2; s++) {
      M.earF[s] = Math.max(0, M.earF[s] - dt * 5);
      const fl = Math.sin(M.earF[s] * Math.PI * 2) * 0.35 * M.earF[s];
      const sg = s === 0 ? 1 : -1;
      const fwd = M.peek * 0.18 + (emo === 'surprised' ? 0.12 : 0) + (emo === 'joy' ? Math.sin(time * 9) * 0.08 : 0);
      rotB(Bn[s === 0 ? B.earL : B.earR], -M.earB * 1.05 - M.earD * 0.35 + fwd + fl * 0.5, sg * fl * 0.3, -sg * (M.earD * 0.75 + M.earB * 0.3));
    }
    // eyes: blinks (single / double), asleep, happy squint, wide when startled
    M.blinkT -= dt;
    if (M.blinkT <= 0 && M.blinkPh < 0) { M.blinkPh = 0; M.blinkT = 1.8 + Math.random() * 3.5; if (Math.random() < 0.2) M.blinkT = 0.28; }
    let bl = 0;
    if (M.blinkPh >= 0) { M.blinkPh += dt; bl = Math.sin(clamp(M.blinkPh / 0.14) * Math.PI); if (M.blinkPh > 0.14) M.blinkPh = -1; }
    const happy = emo === 'joy' || emo === 'fun' ? 0.62 : 0;
    const shut = Math.max(bl, M.sleep > 0.6 ? 1 : 0, sneezeEyes, happy);
    M.blink = damp(M.blink, shut, 30, dt);
    const wide = M.startle > 0.8 || emo === 'surprised' ? 1.14 : 1;
    for (const e of [B.eyeL, B.eyeR]) { Bn[e].scale.set(wide, Math.max(0.1, (1 - M.blink * 0.9) * wide), 1); rotB(Bn[e], 0, M.eyeY, 0); }
    // tail: a ribbon that trails its motion — every joint follows the one before with more lag
    const wag = emo === 'joy' || emo === 'fun' ? 1 : 0;
    const flow = clamp(S.spd / 9);
    for (let i = 0; i < TAILN; i++) {
      const ph = time * 1.9 - i * 0.62;
      let ty = Math.sin(ph) * (0.07 + 0.05 * flow) * (1 - M.sleep * 0.7) + wag * Math.sin(time * 10 - i * 0.5) * 0.17;
      ty += clamp(-S.vL * 0.045 + M.yawRate * 0.12, -0.35, 0.35) * (1 - M.sleep);
      let tp = Math.sin(time * 1.37 - i * 0.5) * 0.045 * (1 - M.sleep * 0.6);
      tp += clamp(-S.vF * 0.014 - M.v.y * 0.02, -0.26, 0.12) * (1 - M.sleep) - M.hide * 0.12;
      ty += M.sleep * 0.4; tp += M.sleep * -0.1;
      const k = 13 / (1 + i * 0.5);
      M.tailY[i] = damp(M.tailY[i], ty, k, dt); M.tailP[i] = damp(M.tailP[i], tp, k, dt);
      rotB(Bn[B.tail + i], M.tailP[i], M.tailY[i], 0);
    }
    // paws paddle a little while it hurries, tuck when asleep
    const pad = Math.sin(time * 9) * 0.35 * clamp(S.spd / 5) * (1 - M.sleep);
    rotB(Bn[B.pawF], pad + M.sleep * 0.3, 0, 0); rotB(Bn[B.pawH], -pad - M.sleep * 0.2, 0, 0);
  }

  function motes(dt, time, night) {
    const mo = C.body.motes, list = mo.userData.m;
    const pos = mo.geometry.attributes.position, col = mo.geometry.attributes.color;
    const Bn = C.body.bones;
    Bn[B.tail + TAILN - 1].updateWorldMatrix(true, false);
    _a.copy(TIP).applyMatrix4(Bn[B.tail + TAILN - 1].matrixWorld);
    const rate = (M.sleep > 0.5 ? 3 : 11) + (M.burst ? 40 : 0);
    M.moteAcc = (M.moteAcc || 0) + dt * rate;
    for (const m of list) {
      if (m.life > 0) {
        m.life -= dt; m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
        m.vx *= 1 - dt * 1.6; m.vz *= 1 - dt * 1.6; m.vy += dt * 0.12;
      } else if (M.moteAcc >= 1) {
        M.moteAcc -= 1;
        const burst = M.burst ? 1 : 0;
        const src = burst ? C.body.bones[B.head] : null;
        if (src) { src.updateWorldMatrix(true, false); _l.set(0, 0.06, 0.2).applyMatrix4(src.matrixWorld); } else _l.copy(_a);
        m.x = _l.x + (Math.random() - 0.5) * 0.06; m.y = _l.y + (Math.random() - 0.5) * 0.06; m.z = _l.z + (Math.random() - 0.5) * 0.06;
        const sp = burst ? 0.9 : 0.12;
        m.vx = (Math.random() - 0.5) * sp + (burst ? Math.sin(C.yaw) * 0.8 : 0); m.vy = 0.05 + Math.random() * 0.12; m.vz = (Math.random() - 0.5) * sp + (burst ? Math.cos(C.yaw) * 0.8 : 0);
        m.max = m.life = (burst ? 0.5 : 0.8) + Math.random() * 0.7;
      }
    }
    M.moteAcc = Math.min(M.moteAcc, 2);
    const k = 0.55 + night * 0.6;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const a = m.life > 0 ? Math.sin(Math.PI * clamp(1 - m.life / m.max)) * k * (0.75 + 0.25 * Math.sin(time * 9 + i)) : 0;
      pos.setXYZ(i, m.x, m.life > 0 ? m.y : -9999, m.z);
      col.setXYZ(i, a, a * 0.8, a * 0.5);
    }
    pos.needsUpdate = col.needsUpdate = true;
  }

  C.update = (dt, rdt) => {
    const P = G.player; if (!P || !C.group) return;
    const time = G.time.real;
    const fdt = Math.min(rdt, 0.05);
    const S = move(P, fdt, time);
    // emotes: spin on joy, hop on surprise
    if (C.emoteT > 0) C.emoteT -= rdt;
    C.spin = Math.max(0, C.spin - rdt * 1.1); C.hop = Math.max(0, C.hop - rdt * 1.6);
    const spinA = C.spin > 0 ? (1 - C.spin) * TAU * (1 - C.spin * 0.3) : 0;
    const hopY = Math.sin(C.hop * Math.PI) * 0.22;
    C.group.position.set(C.pos.x, C.pos.y + hopY - M.sleep * 0.02, C.pos.z);
    C.group.rotation.set(M.pitch, C.yaw + spinA, M.bank + Math.sin(time * 1.3) * 0.06 * (1 - M.sleep), 'YXZ');
    const night = G.env?.veil || 0;
    if (C.sprite) { C.sprite.material.opacity = 0.14 + night * 0.36 + Math.sin(time * 3) * 0.03; C.sprite.scale.setScalar(0.75 + night * 0.45); }
    const vis = G.mode !== 'title' && !P.dead;
    C.group.visible = vis;
    if (C.body) {
      C.body.motes.visible = vis;
      updateCelGlobals(G);
      try {
        pose(S, fdt, time);
        C.body.mat.emissiveIntensity = 0.95 + night * 0.55;
        if (vis) motes(fdt, time, night);
      } catch (e) { G.reportError('dango:pose', e); }
    }

    // ---- hints ----
    if (G.mode !== 'play') { C.idleT = 0; return; }
    const moved = C.lastPlayer.distanceToSquared(P.pos) > 0.04;
    C.lastPlayer.copy(P.pos);
    if (moved || G.combat?.inCombat) C.idleT = 0; else C.idleT += rdt;
    C.hintT -= rdt;
    if (C.queue.length && C.hintT <= 0 && !bubblesActive('dango') && !story.busy) {
      const i = C.queue.findIndex((h) => time >= h.at);
      if (i >= 0) {
        const h = C.queue.splice(i, 1)[0];
        let stale = false; try { stale = !!h.when && !h.when(); } catch (e) { stale = true; }
        if (!stale && (h.repeat || !seen()[h.id])) {
          seen()[h.id] = true;
          C.say(fill(t('story.hint.' + h.id, h.vars), h.vars), 5);
          C.hintT = 6;
        }
      }
    }
    if (hintsOn() && story.live && C.idleT > 14 && C.hintT <= 0 && !story.busy) { C.idleT = -8; C.hintT = 10; idleHint(); }
    // chatter: rare, harmless
    C.chatterT -= rdt;
    if (C.chatterT <= 0) {
      C.chatterT = 70 + Math.random() * 60;
      if (story.live && hintsOn() && !story.busy && !G.combat?.inCombat && !bubblesActive('dango')) {
        const L = raw('story.chatter.' + (G.env.major || 'sun'));
        if (Array.isArray(L) && L.length) C.say(L[(Math.random() * L.length) | 0], 3.6);
      }
    }
  };
  return C;
}
