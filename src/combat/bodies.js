// Hand-built bodies for the journey bestiary (all procedural, all shared geometry / materials):
//   makePages()     流浪书页 — three loose grimoire leaves flapping around a spine, ink eyes and a glowing rune
//   makeMud()       泥沼团   — a lumpy wet mud dome with reeds, pale eyes and a bakeable crust
//   makeLostFlame() 迷路的灯火 — a warm lantern flame with a halo and two eyes
//   dressRogue(actor, look) — hooded cloak + witch hat (+ scarf mask) over a villager rig: bandit mages, raiders, thief
//   addFrostCrown(cr)        — ice crystals on the frost stag's antlers / back
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/game.js';
import { toon, glow, toonGradient, hookMaterial } from '../core/mats.js';
import { TAU, mulberry32 } from '../core/util.js';
import { CEL_U } from '../actors/celmat.js';
import { journeyWand, journeyBroom } from '../actors/journey-props.js';

// ---- 流浪书页 ---------------------------------------------------------------------------------------------------------
let pageTex = null, pageMat = null, pageGeo = null, runeMat = null, runeGeo = null;
function pageTexture() {
  if (pageTex) return pageTex;
  const W = 128, H = 160, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  // a slightly torn, foxed parchment leaf
  const sil = new Path2D();
  sil.moveTo(4, 6); sil.lineTo(120, 3); sil.lineTo(124, 40); sil.lineTo(119, 52); sil.lineTo(125, 70); sil.lineTo(122, 156);
  sil.lineTo(70, 158); sil.lineTo(62, 150); sil.lineTo(54, 157); sil.lineTo(5, 155); sil.closePath();
  x.fillStyle = '#f4e6c4'; x.fill(sil);
  x.save(); x.clip(sil);
  const gr = x.createRadialGradient(64, 80, 20, 64, 80, 100); gr.addColorStop(0, 'rgba(255,250,235,0.5)'); gr.addColorStop(1, 'rgba(170,120,60,0.45)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  const rng = mulberry32(17);
  // handwriting: rows of little ink strokes
  x.strokeStyle = 'rgba(52,36,40,0.62)'; x.lineWidth = 1.3; x.lineCap = 'round';
  for (let row = 0; row < 13; row++) {
    const y = 14 + row * 10.5;
    if (row > 3 && row < 9) continue;
    let px = 12 + rng() * 6;
    while (px < 112) {
      const w = 4 + rng() * 11;
      x.beginPath(); x.moveTo(px, y + rng() * 1.5);
      for (let k = 1; k <= 3; k++) x.lineTo(px + (w * k) / 3, y + (rng() - 0.5) * 3);
      x.stroke();
      px += w + 3 + rng() * 4;
    }
  }
  // a rune circle where the spell used to be — with two ink eyes peeking out of it
  x.strokeStyle = 'rgba(160,70,40,0.85)'; x.lineWidth = 2;
  x.beginPath(); x.arc(64, 74, 22, 0, TAU); x.stroke();
  x.beginPath(); x.arc(64, 74, 15, 0, TAU); x.stroke();
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; x.beginPath(); x.moveTo(64 + Math.cos(a) * 15, 74 + Math.sin(a) * 15); x.lineTo(64 + Math.cos(a + 2.1) * 15, 74 + Math.sin(a + 2.1) * 15); x.stroke(); }
  x.fillStyle = '#231a2c';
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(64 + s * 7, 72, 3.2, 4.4, 0, 0, TAU); x.fill(); }
  x.fillStyle = '#fff'; for (const s of [-1, 1]) { x.beginPath(); x.arc(65 + s * 7, 70.5, 1.1, 0, TAU); x.fill(); }
  // foxing spots
  for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(150,100,50,${0.08 + rng() * 0.12})`; x.beginPath(); x.arc(rng() * W, rng() * H, 1 + rng() * 4, 0, TAU); x.fill(); }
  x.restore();
  x.strokeStyle = 'rgba(110,80,50,0.7)'; x.lineWidth = 1.5; x.stroke(sil);
  pageTex = new THREE.CanvasTexture(c);
  pageTex.colorSpace = THREE.SRGBColorSpace;
  pageTex.anisotropy = 4;
  return pageTex;
}
export function makePages() {
  if (!pageGeo) {
    // a 0.5 x 0.62 leaf hinged on its left edge (x = 0), gently curled
    pageGeo = new THREE.PlaneGeometry(0.5, 0.62, 8, 6);
    pageGeo.translate(0.25, 0, 0);
    const p = pageGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 4.2) * 0.05 + y * y * 0.12); }
    pageGeo.computeVertexNormals();
    pageMat = new THREE.MeshToonMaterial({ map: pageTexture(), side: THREE.DoubleSide, alphaTest: 0.5, emissive: 0x3a2a10, gradientMap: toonGradient() });
    pageMat.userData.shared = true; pageMat.userData.surface = 'none';
    hookMaterial(pageMat);
    runeGeo = new THREE.RingGeometry(0.12, 0.155, 28);
    runeMat = glow(0xffb070, 2.6, { transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  }
  const g = new THREE.Group();
  const spine = new THREE.Group();
  spine.position.y = 0.9;
  g.add(spine);
  const leaves = [];
  for (let i = 0; i < 3; i++) {
    const hinge = new THREE.Group();
    const m = new THREE.Mesh(pageGeo, pageMat);
    m.name = 'PageLeaf';
    m.scale.x = i === 1 ? 1 : -1;
    m.position.z = (i - 1) * 0.015;
    hinge.add(m);
    spine.add(hinge);
    leaves.push(hinge);
  }
  const rune = new THREE.Mesh(runeGeo, runeMat);
  rune.position.set(0.02, 0.02, 0.04); rune.name = 'PageRune';
  leaves[1].add(rune);
  g.userData.leaves = leaves;
  g.userData.rune = rune;
  g.userData.creature = { motion: 'paper', style: 'paper', outline: false, h: 1.2, r: 0.32 };
  return g;
}
/** Flap the leaves (call from think): speed 0..1 (attack wind-up flutters faster). */
export function flapPages(e, t, k = 1) {
  const L = e.cr?.model?.userData?.leaves;
  if (!L) return;
  const f = 9 + 9 * k;
  L[0].rotation.y = 0.5 + 0.55 * Math.sin(t * f + e.id);
  L[2].rotation.y = -0.5 - 0.55 * Math.sin(t * f + e.id + 0.6);
  L[1].rotation.y = 0.15 * Math.sin(t * f * 0.5 + e.id);
  const r = e.cr.model.userData.rune;
  if (r) r.rotation.z += 0.05 * k;
}

// ---- 泥沼团 -----------------------------------------------------------------------------------------------------------
let mudGeo = null, mudMat = null, crustMat = null, reedGeo = null, reedMat = null, eyeW = null, eyeB = null, eyeGeo = null;
function buildMud() {
  const g = new THREE.IcosahedronGeometry(0.55, 3);
  const p = g.attributes.position, col = [];
  const rng = mulberry32(41);
  const bumps = Array.from({ length: 9 }, () => [new THREE.Vector3(rng() - 0.5, rng() * 0.8, rng() - 0.5).normalize(), 0.05 + rng() * 0.08]);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let r = 0.55;
    for (const [d, a] of bumps) r += a * Math.max(0, n.dot(d) - 0.75) * 4;
    v.copy(n).multiplyScalar(r);
    if (v.y < 0) v.y *= 0.25;                       // a flat, spread-out base
    v.y += 0.14;
    v.x *= 1.08; v.z *= 1.08;
    p.setXYZ(i, v.x, v.y, v.z);
    const k = Math.min(1, Math.max(0, v.y / 0.65));
    col.push(0.55 + 0.45 * k, 0.5 + 0.5 * k, 0.45 + 0.55 * k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
export function makeMud() {
  if (!mudGeo) {
    mudGeo = buildMud();
    mudMat = toon(0x8a6644, { vertexColors: true, emissive: 0x1c1208 });
    crustMat = toon(0xd9b98c, { vertexColors: true, emissive: 0x3a2610 });
    const parts = [];
    const rng = mulberry32(9);
    for (let i = 0; i < 6; i++) {
      const r = new THREE.ConeGeometry(0.025, 0.4 + rng() * 0.25, 4);
      r.translate(0, 0.2, 0);
      r.rotateZ((rng() - 0.5) * 0.7); r.rotateX((rng() - 0.5) * 0.5);
      r.translate((rng() - 0.5) * 0.3, 0.58, (rng() - 0.5) * 0.25 - 0.1);
      parts.push(r.toNonIndexed());
    }
    reedGeo = mergeGeometries(parts, false);
    reedMat = toon(0x7d8f3c);
    eyeGeo = new THREE.SphereGeometry(0.1, 10, 8);
    eyeW = toon(0xfff3c8, { emissive: 0x4a3a10 });
    eyeB = toon(0x1c1410);
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(mudGeo, mudMat); body.name = 'MudBody';
  const crust = new THREE.Mesh(mudGeo, crustMat); crust.name = 'MudCrust'; crust.scale.setScalar(1.035); crust.visible = false;
  const reeds = new THREE.Mesh(reedGeo, reedMat); reeds.name = 'MudReeds';
  g.add(body, crust, reeds);
  for (const s of [-1, 1]) {
    const e1 = new THREE.Mesh(eyeGeo, eyeW); e1.position.set(0.17 * s, 0.5, 0.5); e1.scale.set(1, 1.2, 0.6); e1.name = 'EyeWhite';
    const e2 = new THREE.Mesh(eyeGeo, eyeB); e2.position.set(0.175 * s, 0.49, 0.555); e2.scale.setScalar(0.45); e2.name = 'EyeBlack';
    g.add(e1, e2);
  }
  g.userData.crust = crust;
  g.userData.creature = { motion: 'jelly', style: 'slime', outline: false, h: 0.8, r: 0.6 };
  return g;
}

// ---- 迷路的灯火 -------------------------------------------------------------------------------------------------------
let flameGeo = null, flameOut = null, flameIn = null, haloMat = null, haloGeo = null, feyeGeo = null;
function flameMat(col, hot, k) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCelTime: CEL_U.uCelTime, uCol: { value: new THREE.Color(col).multiplyScalar(k) }, uHot: { value: new THREE.Color(hot).multiplyScalar(k) } },
    vertexShader: /* glsl */`
      uniform float uCelTime; varying float vH; varying float vF;
      void main() {
        vec3 p = position;
        float h = clamp( p.y / 0.9 + 0.5, 0.0, 1.0 );
        p.xz *= 1.0 - h * h * 0.78;
        p.y += h * h * 0.28 * ( 0.8 + 0.2 * sin( uCelTime * 8.0 ) );
        p.x += sin( uCelTime * 5.3 + h * 4.0 ) * 0.07 * h * h;
        p.z += cos( uCelTime * 4.1 + h * 3.0 ) * 0.05 * h * h;
        vH = h;
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        vF = abs( dot( normalize( normalMatrix * normal ), normalize( -mv.xyz ) ) );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol, uHot; varying float vH; varying float vF;
      void main() {
        float core = smoothstep( 0.25, 0.95, vF ) * ( 1.0 - vH * 0.7 );
        vec3 c = mix( uCol, uHot, core );
        float a = smoothstep( 0.0, 0.5, vF ) * ( 1.0 - smoothstep( 0.6, 1.0, vH ) * 0.6 );
        gl_FragColor = vec4( c * a, a );
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  m.userData.shared = true; m.userData.noFx = true;
  return m;
}
export function makeLostFlame() {
  if (!flameGeo) {
    flameGeo = new THREE.SphereGeometry(0.36, 18, 14);
    flameOut = flameMat(0xff8a2a, 0xffe6a0, 1.6);
    flameIn = flameMat(0xffd27a, 0xffffff, 1.2);
    haloGeo = new THREE.SphereGeometry(0.55, 14, 10);
    haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(1.2), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    haloMat.userData.shared = true;
    feyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
  }
  const g = new THREE.Group();
  const f = new THREE.Mesh(flameGeo, flameOut); f.position.y = 0.6; f.name = 'Flame';
  const fi = new THREE.Mesh(flameGeo, flameIn); fi.position.y = 0.55; fi.scale.setScalar(0.55); fi.name = 'FlameIn';
  const halo = new THREE.Mesh(haloGeo, haloMat); halo.position.y = 0.6; halo.name = 'Halo';
  g.add(f, fi, halo);
  const em = glow(0x3a1a08, 1);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(feyeGeo, em); eye.scale.set(1, 1.4, 0.6); eye.position.set(0.1 * s, 0.6, 0.29); eye.name = 'Eye'; g.add(eye); }
  g.userData.creature = { motion: 'hover', style: 'light', outline: false, h: 0.95, r: 0.36, noFx: true };
  return g;
}

// ---- rogue dress kit ---------------------------------------------------------------------------------------------------
const kit = {};
function cloakGeo() {
  if (kit.cloak) return kit.cloak;
  // a mantle from the shoulders to mid thigh, open at the front, with a soft hood rolled at the collar
  const prof = [];
  for (let i = 0; i <= 10; i++) { const u = i / 10; prof.push(new THREE.Vector2(0.17 + 0.08 * Math.sin(u * 1.4) + u * u * 0.16, -u * 0.78)); }
  const g = new THREE.LatheGeometry(prof, 22, Math.PI * 0.62, Math.PI * 1.76);   // gap toward +z (the front)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i), z = p.getZ(i); p.setZ(i, z - 0.05 * (y / -0.78)); p.setX(i, x * 1.12); }
  g.computeVertexNormals();
  const hood = new THREE.TorusGeometry(0.15, 0.065, 8, 18, Math.PI * 1.5);
  hood.rotateX(Math.PI / 2); hood.rotateY(Math.PI * 0.75); hood.translate(0, 0.02, -0.02);
  kit.cloak = g; kit.hood = hood;
  return g;
}
function hatGeo() {
  if (kit.hat) return kit.hat;
  const cone = new THREE.ConeGeometry(0.17, 0.46, 14, 6, true);
  const p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.23, k = Math.max(0, y / 0.46); p.setX(i, p.getX(i) - k * k * 0.12); p.setY(i, y); }
  cone.computeVertexNormals();
  const brim = new THREE.CylinderGeometry(0.34, 0.36, 0.018, 24);
  const band = new THREE.CylinderGeometry(0.172, 0.176, 0.05, 18, 1, true); band.translate(0, 0.035, 0);
  kit.hat = mergeGeometries([cone.toNonIndexed(), brim.toNonIndexed()], false);
  kit.hat.computeVertexNormals();
  kit.band = band;
  const scarf = new THREE.CylinderGeometry(0.105, 0.115, 0.075, 16, 1, true, -Math.PI * 0.55, Math.PI * 1.1);
  kit.scarf = scarf;
  const feather = new THREE.ConeGeometry(0.03, 0.34, 4); feather.scale(1, 1, 0.3); feather.rotateZ(-0.9); feather.translate(0.2, 0.12, -0.03);
  kit.feather = feather;
  return kit.hat;
}
/** Dress a humanoid rig. look: { cloak, hat (or null for a hood only), band, scarf, feather, wand: true } */
export function dressRogue(actor, look) {
  const parts = [];
  try {
    cloakGeo(); hatGeo();
    const cm = toon(look.cloak, { side: THREE.DoubleSide });
    const cloak = new THREE.Group();
    cloak.add(new THREE.Mesh(kit.cloak, cm), new THREE.Mesh(kit.hood, cm));
    cloak.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    actor.attach(cloak, 'upperChest', { pos: [0, 0.16, -0.01] });
    parts.push(cloak);
    if (look.hat != null) {
      const hat = new THREE.Group();
      hat.add(new THREE.Mesh(kit.hat, toon(look.hat)));
      if (look.band != null) hat.add(new THREE.Mesh(kit.band, toon(look.band)));
      if (look.feather != null) hat.add(new THREE.Mesh(kit.feather, toon(look.feather)));
      actor.attach(hat, 'head', { pos: [0, 0.17, -0.01], rot: [-0.12, 0, 0] });
      parts.push(hat);
    }
    if (look.scarf != null) {
      const s = new THREE.Mesh(kit.scarf, toon(look.scarf, { side: THREE.DoubleSide }));
      actor.attach(s, 'head', { pos: [0, 0.035, 0.005] });
      parts.push(s);
    }
    if (look.wand !== false) {
      const w = journeyWand();
      actor.attach(w, 'handR', { pos: [-0.075, -0.025, 0], rot: [Math.PI / 2, 0, -0.25] });
      parts.push(w);
    }
  } catch (err) { G.reportError('combat:dress', err); }
  return parts;
}
/** A broom for a rider: the journey broom model, seated like Fran's / Saya's. */
export function riderBroom() { return journeyBroom(); }

// ---- frost stag crown ----------------------------------------------------------------------------------------------------
let crystalGeo = null, crystalMat = null, crystalMat2 = null;
export function addFrostCrown(cr) {
  if (!crystalGeo) {
    const parts = [];
    const rng = mulberry32(23);
    for (let i = 0; i < 7; i++) {
      const c = new THREE.ConeGeometry(0.05 + rng() * 0.04, 0.3 + rng() * 0.35, 5);
      c.translate(0, 0.15, 0);
      c.rotateZ((rng() - 0.5) * 1.2); c.rotateX((rng() - 0.5) * 0.9);
      c.translate((rng() - 0.5) * 0.5, rng() * 0.2, (rng() - 0.5) * 0.3);
      parts.push(c.toNonIndexed());
    }
    crystalGeo = mergeGeometries(parts, false);
    crystalGeo.computeVertexNormals();
    crystalMat = glow(0xbfefff, 1.7);
    crystalMat2 = toon(0x8fd0ff, { emissive: 0x2a5a8a });
  }
  // find the head bone so the crystals ride the antlers; fall back to the body
  let head = null;
  cr.model.traverse((o) => { if (!head && o.isBone && /head/i.test(o.name)) head = o; });
  const g = new THREE.Group();
  const a = new THREE.Mesh(crystalGeo, crystalMat), b = new THREE.Mesh(crystalGeo, crystalMat2);
  b.rotation.y = 1.7; b.scale.setScalar(0.85);
  g.add(a, b);
  if (head) {
    // bone space is in the model's own (unscaled) units: undo the model scale so the crown keeps its metre size
    const s = 1 / Math.max(1e-3, cr.model.scale.x);
    g.scale.setScalar(s * 1.0);
    g.position.set(0, 0.35 * s, 0);
    head.add(g);
  } else { g.position.set(0, cr.height * 0.95, 0.4); cr.body.add(g); }
  return g;
}
