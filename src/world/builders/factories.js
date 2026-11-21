// Model factories shared with other systems (gameplay, story, props): lanterns, torii, chest, signpost, race ring,
// brazier, crystal pillar, ema rack, shrine bell. Each returns a small object { group, ... }. Static parts are baked;
// the animated bits stay live and are ticked by the structures system (tickFactories), so a fade or a lid swing keeps
// playing as long as that system runs — with `instant` everything also works without it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, toon, glowDynamic } from '../../core/mats.js';
import { box, cyl, cone, sphere, torus, bakeStatic } from '../../core/geo.js';
import { clamp, damp, TAU } from '../../core/util.js';
import { rcyl } from '../../props/shapes.js';
import { paperLanternStatic } from './paperLantern.js';
import { makeSuzuPull } from './shrineMaterials.js';
import { gateRope, redPost } from './toriiFinish.js';
import { M, mat, makeRoof, textTexture, texMat, rod, bevelBox } from './kit.js';

export const tickers = new Set();
/** A front (+z) and a back (-z) plane, offset ±d/2, merged into one geometry (painted sign faces: one draw call). */
function twoFaces(w, h, d) {
  const a = new THREE.PlaneGeometry(w, h); a.translate(0, 0, d / 2);
  const b = new THREE.PlaneGeometry(w, h); b.rotateY(Math.PI); b.translate(0, 0, -d / 2);
  return mergeGeometries([a, b], false);
}
/** Advance running fades / swings. Called every frame by the structures system. */
export function tickFactories(dt, time) {
  for (const k of tickers) { if (k(dt, time) === false) tickers.delete(k); }
}
/** Animate a value toward a target; fn(v) applies it. Returns a setter target(v, instant). */
function fader(apply, rate = 2.5, v0 = 0) {
  let v = v0, goal = v0, running = false;
  const tick = (dt) => {
    v = damp(v, goal, rate, dt);
    if (Math.abs(v - goal) < 0.004) { v = goal; apply(v); running = false; return false; }
    apply(v); return true;
  };
  apply(v);
  return (target, instant) => {
    goal = target;
    if (instant) { v = goal; apply(v); if (running) { tickers.delete(tick); running = false; } return; }
    if (!running) { running = true; tickers.add(tick); }
  };
}
function bakeWith(root, dyn = []) {
  for (const d of dyn) d.userData.dynamic = true;
  return bakeStatic(root);
}

// Stone lantern, Great Lantern and chest live in keyobjects.js (architecture round 2).
export { makeStoneLantern, makeGreatLantern, makeChest } from './keyobjects.js';

/** Hanging paper lantern (chōchin), ~0.7 m, hook at y = 0 (hangs downward). color: glow colour of the paper. */
export function makePaperLantern(color = 0xff7a3a) {
  const mat = glowDynamic(color, 2.4);
  const group = paperLanternStatic(mat);
  group.children[0].userData.dynamic = true;
  group.name = 'paperLantern';
  const set = fader((v) => mat.userData.setGlow(0.08 + 0.92 * v), 3, 1);
  const h = { group, lit: true, setLit(on, instant = false) { h.lit = !!on; set(on ? 1 : 0, instant); } };
  return h;
}

const _toriiShapes = new Map();
/** Elevation of a curved top beam (kasagi / shimaki) extruded through its depth: the ends sweep up (sori) and
 *  thicken, the end faces are cut on a slant. */
function kasagiGeo(hw, thick, depth, curl, grow = 0.35) {
  const k = [hw, thick, depth, curl, grow].join();
  if (_toriiShapes.has(k)) return _toriiShapes.get(k);
  const s = new THREE.Shape();
  const N = 20;
  const yAt = (x) => curl * Math.pow(Math.abs(x) / hw, 2.6);
  const tAt = (x) => thick * (1 + grow * Math.pow(Math.abs(x) / hw, 2));
  s.moveTo(-hw, yAt(-hw));
  for (let i = 1; i <= N; i++) { const x = -hw + (2 * hw * i) / N; s.lineTo(x, yAt(x)); }
  s.lineTo(hw + thick * 0.55, yAt(hw) + tAt(hw) + thick * 0.35);
  for (let i = N; i >= 0; i--) { const x = -hw + (2 * hw * i) / N; s.lineTo(x, yAt(x) + tAt(x)); }
  s.lineTo(-hw - thick * 0.55, yAt(-hw) + tAt(-hw) + thick * 0.35);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 2 });
  geo.translate(0, 0, -depth / 2);
  _toriiShapes.set(k, geo);
  return geo;
}
/**
 * Torii gate (myōjin style). size 1 = 4.6 m tall, 4.4 m between the pillar centres. Returns { group, width, height, posts:[[x,z],..], postR }.
 * Pillars lean in slightly and stand on black foot bands, plaster mounds and base stones; the tie beam (nuki) runs
 * through them with wedges; a straight lower beam (shimaki) and the curved top beam (kasagi) with a dark cap; a strut
 * (gakuzuka) with the plaque. opts: { color: 'verm'|'stone'|'wood'|'silver', plaque: string (already translated),
 * rope: true (shimenawa with paper shide under the tie beam) }
 */
export function makeTorii(size = 1, opts = {}) {
  const g = new THREE.Group();
  const s = size;
  const kind = opts.color || 'verm';
  const col = kind === 'stone' ? M.stoneLight() : kind === 'wood' ? M.woodLight() : kind === 'silver' ? M.silver() : M.verm();
  const dark = kind === 'silver' ? M.deepBlue() : kind === 'stone' ? M.stone() : kind === 'wood' ? M.woodDark() : M.black();
  const H = 4.6 * s, span = 2.2 * s, pr = 0.19 * s;
  const ceremonial = !!(opts.plaque || opts.rope);
  const lacquered = kind === 'verm' && ceremonial;
  const fitting = mat.metal(0xa87b48, { spec: 0.30 });
  const pillar = lacquered ? redPost() : col;
  const lean = 0.022;
  for (const x of [-span, span]) {
    const ph = H - 0.5 * s;
    const p = cyl(pr * 0.84, pr, ph, pillar, x, ph / 2, 0, 14);
    p.rotation.z = x > 0 ? lean : -lean; p.position.x = x - Math.sign(x) * Math.sin(lean) * ph / 2; g.add(p);
    if (kind === 'verm' || kind === 'silver') g.add(cyl(pr * 1.1, pr * 1.13, 0.55 * s, dark, x, 0.36 * s, 0, 14));   // nemaki
    g.add(cyl(pr * 1.2, pr * 1.75, 0.2 * s, kind === 'stone' ? M.stone() : M.plaster(), x, 0.1 * s, 0, 14));         // kamebara
    g.add(bevelBox(pr * 4.6, 0.2 * s, pr * 4.6, M.stoneWarm(), x, -0.03 * s, 0, 0.045 * s));                               // base stone, chamfered
    if (lacquered) {
      g.add(cyl(pr*1.09, pr*1.09, .033*s, fitting, x, .625*s, 0, 14));
      // The foot sleeve is fixed with two bosses across its seam.
      for (const side of [-1,1]) {
        const stud = cyl(.032*s, .036*s, .022*s, fitting, x, .49*s, side*pr*1.11, 8);
        stud.rotation.x = Math.PI/2; g.add(stud);
      }
    }
    // daiwa: the ring where the pillar meets the top beams
    g.add(cyl(pr * 0.98, pr * 0.98, 0.14 * s, dark, x - Math.sign(x) * Math.sin(lean) * (H - 0.86 * s), H - 0.86 * s, 0, 14));
  }
  // nuki through the pillars, with wedges outside each pillar
  const ny = H - 1.3 * s;
  g.add(box(2 * span + 1.15 * s, 0.26 * s, 0.17 * s, col, 0, ny, 0));
  // kusabi: tapered wedges driven through the tie beam outside each pillar (thicker at the top)
  for (const sx of [-1, 1]) {
    const w = rcyl(0.05 * s, 0.032 * s, 0.34 * s, dark, 0, 0, 0, 4, 0.006); w.rotation.y = Math.PI / 4;
    const wg = new THREE.Group(); wg.add(w); wg.scale.set(1, 1, 2.6); wg.position.set(sx * (span + pr * 1.05 - Math.sin(lean) * (H - ny)), ny, 0); g.add(wg);
  }
  // shimaki (straight-ish), kasagi (curved, thickening ends), dark cap on the kasagi
  const parts = [
    [kasagiGeo(span + 0.88 * s, 0.2 * s, 0.38 * s, 0.12 * s, 0.1), lacquered ? M.vermDark() : col, H - 0.7 * s],
    [kasagiGeo(span + 1.0 * s, 0.24 * s, 0.46 * s, 0.32 * s, 0.4), col, H - 0.5 * s],
    [kasagiGeo(span + 1.08 * s, 0.09 * s, 0.54 * s, 0.36 * s, 0.6), dark, H - 0.26 * s],
  ];
  if (lacquered) {
    // Broad eaves are read from below. A brass drip edge sits between the kasagi and its black cap.
    parts.push([kasagiGeo(span + 1.035*s,.035*s,.484*s,.35*s,.30),fitting,H-.285*s]);
    for (const side of [-1,1]) {
      const tip=span+.535*s;
      g.add(box(.084*s,.29*s,.19*s,dark,side*tip,ny,0));
      g.add(box(.030*s,.274*s,.182*s,fitting,side*(tip-.075*s),ny,0));
    }
  }
  for (const [geo, m, y] of parts) { const k = new THREE.Mesh(geo, m); k.position.y = y; k.castShadow = k.receiveShadow = true; g.add(k); }
  // gakuzuka + plaque
  g.add(box(0.22 * s, 0.6 * s, 0.15 * s, col, 0, H - 0.98 * s, 0));
  if (opts.plaque) {
    const pm = texMat(textTexture(opts.plaque, { w: 144, h: 224, bg: '#242125', fg: '#f6d796', vertical: true, border: '#bc915d', style:'gilded' }));
    const py=H-.98*s;
    g.add(bevelBox(.65*s,.96*s,.32*s,dark,0,py,0,.035*s));
    const p = new THREE.Mesh(twoFaces(.49*s,.78*s,.339*s), pm);
    p.position.y = py; p.userData.dynamic = true; g.add(p);
    for (const side of [-1,1]) {
      const z=side*.17*s;
      g.add(box(.61*s,.039*s,.028*s,fitting,0,py+.43*s,z),
        box(.61*s,.039*s,.028*s,fitting,0,py-.43*s,z));
      for (const x of [-.277*s,.277*s]) {
        g.add(box(.029*s,.83*s,.026*s,fitting,x,py,z));
      }
    }
  } else g.add(box(0.38 * s, 0.5 * s, 0.06 * s, dark, 0, H - 0.98 * s, 0.1 * s));
  if (opts.rope) g.add(gateRope(span - .064*s, ny - .37*s, s));
  const group = bakeStatic(g);
  group.name = 'torii';
  return { group, width: 2 * span, height: H, posts: [[-span, 0], [span, 0]], postR: pr * 1.3 };
}

/** Wooden signpost with a small roof; `text` (already translated, '\n' for lines) is painted on the board. */
export function makeSignpost(text = '') {
  const g = new THREE.Group();
  const lines = String(text).split('\n');
  g.add(cyl(0.08, 0.1, 2.5, M.wood(), 0, 1.25, 0, 6));
  const bw = 1.5, bh = 0.32 + 0.28 * lines.length;
  const tex = textTexture(lines, { w: 384, h: Math.round(384 * (bh / bw)), bg: '#e9d3a5', fg: '#3b2414' });
  const tm = texMat(tex);
  // two boards (front and back of the post) in wood, the painted faces as one two-sided textured mesh
  g.add(box(bw + 0.08, bh + 0.08, 0.06, M.wood(), 0, 2.35 - bh / 2, 0.1), box(bw + 0.08, bh + 0.08, 0.06, M.wood(), 0, 2.35 - bh / 2, -0.1));
  const faces = twoFaces(bw, bh, 0.27);
  const fm = new THREE.Mesh(faces, tm); fm.position.set(0, 2.35 - bh / 2, 0); fm.userData.dynamic = true; fm.castShadow = false;
  g.add(fm);
  const roof = makeRoof({ hw: bw / 2 + 0.25, hd: 0.32, h: 0.22, style: 'gable', mat: M.tile(), lift: 0.06, thick: 0.06, corr: 0.025, tile: 0.16 });
  roof.group.position.y = 2.48; g.add(roof.group);
  const group = bakeStatic(g);
  group.name = 'signpost';
  return { group };
}

/** Flight ring for broom races: a glowing torus with paper streamers. radius in metres (default 3). */
export function makeRaceRing(radius = 3) {
  const g = new THREE.Group();
  const mat = glowDynamic(PAL.gold, 2.6);
  const ring = torus(radius, 0.12, mat, 0, 0, 0, 6, 40); ring.castShadow = false;
  g.add(ring);
  const shideMat = M.white();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const sh = box(0.1, 0.42, 0.02, shideMat, Math.cos(a) * radius, Math.sin(a) * radius - 0.25, 0);
    g.add(sh);
    g.add(box(0.05, 0.05, 0.3, M.verm(), Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  const group = bakeWith(g, [ring]);
  group.name = 'raceRing';
  let pulse = 0, active = true;
  const tick = (dt) => { pulse = Math.max(0, pulse - dt * 1.5); const k = (active ? 1 : 0.15) + pulse * 2; mat.userData.setGlow(k); ring.scale.setScalar(1 + pulse * 0.25); return pulse > 0; };
  const h = { group, radius, active: true,
    setActive(on) { active = h.active = !!on; mat.userData.setGlow(active ? 1 : 0.15); },
    pass() { pulse = 1; tickers.add(tick); } };
  return h;
}

/** Iron brazier on three legs. setLit(on) shows / hides a flickering glow flame. */
export function makeBrazier() {
  const g = new THREE.Group();
  const iron = mat.metal(0x3a3434, { spec: 0.35 });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.add(rod(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45, Math.cos(a) * 0.22, 0.85, Math.sin(a) * 0.22, 0.04, iron)); }
  const bowl = cyl(0.5, 0.28, 0.32, iron, 0, 0.98, 0, 10); g.add(bowl);
  { const rim = torus(0.5, 0.04, iron, 0, 1.14, 0, 4, 20); rim.rotation.x = Math.PI / 2; g.add(rim); }
  g.add(cyl(0.44, 0.44, 0.06, M.woodDark(), 0, 1.12, 0, 10));
  const fmat = glowDynamic(0xff8a2a, 3), fmat2 = glowDynamic(PAL.lanternHot, 4);
  const flame = new THREE.Group(); flame.position.y = 1.12;
  const f1 = cone(0.36, 0.95, fmat, 0, 0.47, 0, 7), f2 = cone(0.2, 0.62, fmat2, 0.03, 0.33, 0.02, 6);
  f1.castShadow = f2.castShadow = false;
  flame.add(f1, f2); g.add(flame);
  const group = bakeWith(g, [flame]);
  group.name = 'brazier';
  let t = 0;
  const tick = (dt) => { if (!h.lit) return false; t += dt; flame.scale.set(1 + 0.08 * Math.sin(t * 17), 1 + 0.16 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 23), 1 + 0.08 * Math.cos(t * 15)); flame.rotation.y = t * 1.3; return true; };
  const h = { group, lit: false, firePos: new THREE.Vector3(0, 1.4, 0),
    setLit(on) { h.lit = !!on; flame.visible = h.lit; if (h.lit) tickers.add(tick); } };
  h.setLit(false);
  return h;
}

/** Crystal pillar on a turnable pedestal (星晶野 puzzle). setAngle(rad) turns it; setLit(on) makes the crystal sing. */
export function makeCrystalPillar() {
  const g = new THREE.Group();
  g.add(cyl(1.1, 1.25, 0.4, M.stoneDark(), 0, 0.2, 0, 8));
  g.add(cyl(0.95, 1.0, 0.18, M.moonStone(), 0, 0.49, 0, 16));
  let turn = new THREE.Group(); turn.position.y = 0.58;
  const cm = glowDynamic(PAL.crystal, 1.6);
  const shaft = cyl(0.42, 0.5, 2.6, cm, 0, 1.4, 0, 6); shaft.castShadow = false;
  const tip = cone(0.42, 0.9, cm, 0, 3.15, 0, 6); tip.castShadow = false;
  turn.add(shaft, tip);
  // the mirror face that redirects light (faces local +z)
  turn.add(box(0.9, 1.5, 0.08, M.silver(), 0, 1.5, 0.52));
  turn.add(box(1.0, 0.08, 0.14, M.gold(), 0, 2.28, 0.52), box(1.0, 0.08, 0.14, M.gold(), 0, 0.72, 0.52));
  turn.add(box(0.06, 0.3, 0.6, M.gold(), 0, 0.15, 0.6));
  turn = bakeStatic(turn);
  g.add(turn);
  const group = bakeWith(g, [turn]);
  group.name = 'crystalPillar';
  const set = fader((v) => cm.userData.setGlow(0.55 + 1.6 * v), 2.5);
  const h = { group, angle: 0, lit: false, turn,
    setAngle(rad) { h.angle = rad; turn.rotation.y = rad; },
    setLit(on, instant = false) { h.lit = !!on; set(on ? 1 : 0, instant); } };
  set(0, true);
  return h;
}

/** Ema (votive plaque) rack with a little roof and a few dozen plaques. */
export function makeEmaRack() {
  const g = new THREE.Group();
  const w = M.wood();
  for (const x of [-1.2, 1.2]) g.add(box(0.12, 2.0, 0.12, w, x, 1.0, 0));
  for (const y of [0.9, 1.4]) g.add(box(2.6, 0.06, 0.08, w, 0, y, 0));
  const roof = makeRoof({ hw: 1.6, hd: 0.45, h: 0.3, style: 'gable', mat: M.tile(), lift: 0.08, thick: 0.08, corr: 0.03, tile: 0.2 });
  roof.group.position.y = 2.0; g.add(roof.group);
  const plate = M.woodLight(), str = mat.cloth(0xd64040);
  let n = 0;
  for (const y of [0.9, 1.4]) for (let i = 0; i < 11; i++) {
    const x = -1.05 + i * 0.21 + (n % 3) * 0.01;
    for (const z of [0.06, -0.06]) {
      const p = box(0.17, 0.13, 0.015, plate, x, y - 0.1, z);
      p.rotation.z = ((n * 37) % 11 - 5) * 0.025; g.add(p);
      g.add(box(0.012, 0.05, 0.012, str, x, y - 0.02, z)); n++;
    }
  }
  const group = bakeStatic(g); group.name = 'emaRack';
  return { group, colliders: [{ x: 0, z: 0, hw: 1.35, hd: 0.2 }] };
}

/** Shrine bell (suzu) with a red-and-white rope, hung from a beam at y ≈ 3. ring() sets it swinging. */
export function makeShrineBell() {
  const g = new THREE.Group();
  for (const x of [-.8,.8]) {
    g.add(box(.12,3.2,.12,redPost(),x,1.6,0),bevelBox(.187,.095,.185,M.stoneDark(),x,.046,0,.013));
    g.add(box(.26,.072,.14,M.woodDark(),x,2.99,0));
  }
  g.add(box(1.9,.14,.16,redPost(),0,3.1,0));
  let sw=makeSuzuPull();
  sw = bakeStatic(sw);
  sw.position.y=3.02;
  g.add(sw);
  const group = bakeWith(g, [sw]); group.name = 'shrineBell';
  let amp = 0, t = 0;
  const tick = (dt) => { t += dt; amp = Math.max(0, amp - dt * 0.35); sw.rotation.x = Math.sin(t * 5.2) * amp; sw.rotation.z = Math.sin(t * 3.7) * amp * 0.4; return amp > 0; };
  return { group, ring(strength = 1) { amp = clamp(amp + 0.25 * strength, 0, 0.45); tickers.add(tick); } };
}
