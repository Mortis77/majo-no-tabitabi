// NPCs (G.npcs): the named cast of §1.3 at their anchors plus the village / fox / town folk. createActor rigs stream in and
// out by distance (≤ MAX_LIVE alive), idle with small behaviours, turn head and body to the heroine, bark short lines that
// change with story progress, and offer a talk interaction (routed to G.story.talk).
import * as THREE from 'three';
import { BELL } from '../data/bellcrown.js';
import { G } from '../core/game.js';
import { t, raw } from '../core/i18n.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { createActor, makeActorShadowBlob } from '../actors/rig.js';
import { CLIPS } from '../actors/clips.js';
import { toon, hookMaterial } from '../core/mats.js';
import { celSlotsOf, hideCelParts } from '../actors/celmerge.js';
import { bubble } from './bubbles.js';

const MAX_LIVE = 10, NEAR = 62, FAR = 78;
const ROSTER = [
  // named cast
  { id: 'granny', asset: 'char_granny', anchor: 'granny', idle: 'idle', alt: ['fold_arms'], work: 'sweep', props: ['broom'] },
  { id: 'himawari', asset: 'char_himawari', anchor: 'training', off: [0, -6], face: Math.PI, idle: 'fold_arms', alt: ['idle', 'cheer'], rival: true },
  { id: 'ushio', asset: 'char_ushio', pos: () => wellSpot(), idle: 'idle', alt: ['shake_head'] },
  { id: 'kokonoe', asset: 'char_kokonoe', anchor: 'fox_racer', off: [-4.5, 0], idle: 'idle', alt: ['fold_arms', 'dance'], rival: true },
  { id: 'kuzunoha', asset: 'char_kuzunoha', anchor: 'fox_elder', idle: 'idle', alt: ['fold_arms'] },
  { id: 'rikka', asset: 'char_rikka', anchor: 'wind_altar', off: [0, 5.5], face: Math.PI, idle: 'idle', alt: ['fold_arms'], rival: true },
  { id: 'naru', asset: 'char_naru', anchor: 'town_racer', off: [4.5, 0], idle: 'idle', alt: ['dance', 'cheer'], rival: true, work: 'drum', props: ['bachiR', 'bachiL'], set: 'taiko' },
  { id: 'shoku', asset: 'char_shoku', anchor: 'town_lampmaker', idle: 'lantern', alt: ['idle', 'kneel_work'], work: 'craft', props: ['brush'], set: 'lanternwork' },
  // 磐翁 has his own costume file (beard, kasa, hammer built in); the runtime dress-up only for ?costume=v1 A/B shots
  { id: 'banou', asset: 'char_banou', anchor: 'crystal_hermit', idle: 'fold_arms', alt: ['kneel_work', 'idle'], work: 'hammer', props: ['mallet', 'chisel'], set: 'stone', scale: 1.04, dress: (a) => { if (G.params?.costume === 'v1') dressBanou(a); } },
  { id: 'kagami', asset: 'char_kagami', anchor: 'lake_ferryman', idle: 'idle', alt: ['lean'], work: 'pole', props: ['pole'] },
  { id: 'oboroyo', asset: 'char_oboroyo', anchor: 'palace_arena', off: [0, -18], idle: 'idle', when: () => !!G.state?.flags?.ending_done },
  // Small city cast uses the same distance-streamed residents as the old settlements.
  { id:'bellwarden', folk:true, asset:'char_rikka', pos:()=>({x:BELL.x-37,z:BELL.z-21.8}), face:0, idle:'fold_arms', alt:['idle'], when:()=>G.combat?.duel?.id!=='rikka' },
  { id:'bellbaker', folk:true, asset:'char_villager_b', pos:()=>({x:BELL.x+14,z:BELL.z+3.25}), face:0, idle:'idle', alt:['call_out'] },
  { id:'bellclerk', folk:true, asset:'char_town_b', pos:()=>({x:BELL.x+28.2,z:BELL.z+15}), face:-1.2, idle:'idle', alt:['talk'], wander:1.3 },
  { id:'bellkeeper', folk:true, asset:'char_town_a', pos:()=>({x:BELL.x+6.2,z:BELL.z-36}), face:-.8, idle:'idle', alt:['fold_arms'] },
  // folk
  { id: 'elder', folk: true, asset: 'char_villager_a', anchor: 'village_elder', idle: 'idle', alt: ['fold_arms', 'call_out'], work: 'fan', props: ['uchiwa'] },
  { id: 'kid', folk: true, asset: 'char_villager_b', anchor: 'village_kid', idle: 'idle', alt: ['dance', 'cheer'], scale: 0.74, wander: 3.5 },
  { id: 'farmer', folk: true, asset: 'char_villager_c', anchor: 'village_farmer', idle: 'idle', alt: ['water_plants', 'harvest'], work: 'hoe', props: ['hoe'] },
  { id: 'dangoya', folk: true, asset: 'char_villager_a', anchor: 'village_dango', off: [0, -1.6], idle: 'idle', alt: ['call_out'], shop: 'village_dango' },
  { id: 'painter', folk: true, asset: 'char_villager_b', anchor: 'sunhill_painter', idle: 'kneel_work', alt: ['idle'] },
  { id: 'pilgrim', folk: true, asset: 'char_villager_c', anchor: 'ema_shrine', off: [2.6, -2.2], face: -Math.PI / 2, idle: 'idle', alt: ['interact'], scale: 0.95 },
  { id: 'foxmom', folk: true, asset: 'char_fox_a', anchor: 'fox_mother', idle: 'idle', alt: ['call_out'] },
  { id: 'foxguard', folk: true, asset: 'char_fox_b', pos: () => ({ x: -112, z: 92 }), face: -Math.PI / 2, idle: 'fold_arms', alt: ['idle'] },
  { id: 'foxkid', folk: true, asset: 'char_fox_b', anchor: 'fox_mother', off: [3.4, 2.2], idle: 'idle', alt: ['dance'], scale: 0.72, wander: 3 },
  { id: 'townelder', folk: true, asset: 'char_town_a', anchor: 'town_elder', idle: 'lantern', alt: ['idle'] },
  { id: 'shopkeeper', folk: true, asset: 'char_town_b', anchor: 'town_shop', off: [0, -1.6], idle: 'idle', alt: ['call_out'], shop: 'town_shop' },
  { id: 'cook', folk: true, asset: 'char_town_a', anchor: 'town_cook', idle: 'idle', alt: ['interact'], work: 'fan', props: ['uchiwa'] },
  { id: 'townfolk1', folk: true, asset: 'char_town_b', pos: () => ({ x: 214, z: -131 }), idle: 'lantern', alt: ['idle'], wander: 2.5 },
  { id: 'townfolk2', folk: true, asset: 'char_town_a', pos: () => ({ x: 190, z: -127 }), idle: 'idle', alt: ['talk'], scale: 0.97, work: 'sit_ground', props: ['uchiwa'], workUpper: 'fan' },
];

function wellSpot() {
  const w = G.structures?.places?.village?.well;
  const a = G.world.ANCHORS.village_elder;
  if (w) { const dx = a.x - w.x, dz = a.z - w.z, l = Math.hypot(dx, dz) || 1; return { x: w.x + dx / l * 1.9, z: w.z + dz / l * 1.9 }; }
  return { x: a.x + 3.5, z: a.z + 1 };
}

/** 磐翁 has no model of his own: the elder rig in stone-dust colours, a woven kasa, a long grey beard and a mason's hammer. */
function dressBanou(a) {
  // the dress becomes a plain stone-dust robe; the hairpins go; hair a shade greyer, skin a shade more weathered
  const toneOf = (n) => (/Onepice/.test(n) ? [0x80776a, true] : /Shoes/.test(n) ? [0x4a3f36, true] : /Hair/.test(n) ? [0xc4c0b8, false] : /^Body$|^Face$/.test(n) ? [0xead2bc, false] : null);
  a.model.traverse((m) => {
    if (!m.isMesh || Array.isArray(m.material) || m.material.cel?.multi) return;
    const n = m.material.name || '';
    if (/Kanzashi/.test(n)) { m.visible = false; return; }
    const tone = toneOf(n);
    if (!tone) return;
    const c = m.material.clone(); c.userData.shared = false;
    if (tone[1]) { c.map = null; c.color.set(tone[0]); } else c.color.multiply(new THREE.Color(tone[0]));
    m.material = c;
  });
  // merged characters (draw-call pass): the same edits on the slots of the merged parts (actors/celmerge.js)
  const own = new Map();
  for (const s of celSlotsOf(a.model)) {
    if (/Kanzashi/.test(s.name)) { for (const m of s.meshes) hideCelParts(m, /Kanzashi/); continue; }
    const tone = toneOf(s.name);
    if (!tone) continue;
    let c = own.get(s.material);
    if (!c) { c = s.material.clone(); c.userData.shared = false; hookMaterial(c); own.set(s.material, c); for (const m of s.meshes) m.material = c; }
    const v = c.celU.uSlC.value[s.slot], k = new THREE.Color(tone[0]);
    if (tone[1]) { v.x = k.r; v.y = k.g; v.z = k.b; c.celU.uSlE.value[s.slot].w = -1; } else { v.x *= k.r; v.y *= k.g; v.z *= k.b; }
  }
  const mat = (c) => new THREE.MeshToonMaterial({ color: c });
  const beardM = mat(0xd9d4cb), strawM = mat(0x9a7b4c), bandM = mat(0x4a4038);
  const beard = new THREE.Group();
  const b1 = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 9), beardM); b1.rotation.x = Math.PI; b1.position.set(0, -0.1, 0); b1.scale.z = 0.6;
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), beardM); b2.scale.set(1.0, 0.5, 0.7); b2.position.y = -0.01;
  const mL = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.07, 3, 6), beardM); mL.rotation.z = 1.1; mL.position.set(0.045, 0.028, 0.012);
  const mR = mL.clone(); mR.rotation.z = -1.1; mR.position.x = -0.045;
  beard.add(b1, b2, mL, mR);
  a.attach(beard, 'head', { pos: [0, 0.0, 0.08] });
  const hat = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.17, 18, 1, true), strawM); cone.material.side = THREE.DoubleSide;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.05, 14), bandM); band.position.y = -0.07;
  hat.add(cone, band);
  a.attach(hat, 'head', { pos: [0, 0.27, -0.01], rot: [-0.08, 0, 0] });
  if (G.assets?.ready?.('prop_hammer')) {
    const hm = G.assets.model('prop_hammer');
    a.attach(hm, 'hips', { pos: [-0.21, -0.36, 0.02], rot: [0, 0, 0.18], scale: (G.assets.info('prop_hammer')?.scale || 1) * 1.5 });
  }
}


// ---- work props: simple hand tools from primitives, lit through the look system (one merged mesh per material) --------------
// Hand props follow the gohei convention: origin = grip, the tool along +Y (the thumb direction), attached like GOHEI_MOVE.
const GRIP_R = { pos: [-0.075, -0.025, 0], rot: [Math.PI / 2, 0, -0.25] };
const GRIP_L = { pos: [0.075, -0.025, 0], rot: [Math.PI / 2, 0, 0.25] };
const C = { wood: 0xa77b4f, darkWood: 0x6e4a2e, straw: 0xc9a65e, iron: 0x5d5f66, bamboo: 0xa9b26a, paper: 0xf2e6cc, lacquer: 0x8c2f24, hide: 0xe9dcc0, rope: 0xd8b25a, stone: 0x9a958c };
const _tpl = new Map();
function cyl(r0, r1, h, y, seg = 8) { return new THREE.CylinderGeometry(r0, r1, h, seg, 1).translate(0, y, 0); }
/** parts: [[geometry, colorKey, surface]] → a group with one mesh per colour (merged). */
function assemble(parts) {
  const by = new Map();
  for (const [g, c, surf] of parts) { const k = c + '|' + surf; if (!by.has(k)) by.set(k, { c, surf, geos: [] }); by.get(k).geos.push(g.index ? g.toNonIndexed() : g); }
  const root = new THREE.Group();
  for (const { c, surf, geos } of by.values()) {
    const geo = geos.length > 1 ? BGU.mergeGeometries(geos, false) : geos[0];
    const m = new THREE.Mesh(geo, toon(C[c], { surface: surf }));
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
  }
  return root;
}
const PROP_DEF = {
  // 箒 shrine-yard broom: long handle, a fan of straw at the bottom
  // (the sweep grip has the thumb pointing down the handle: the straw sits along +Y, the grip near the top of the handle)
  broom: () => assemble([[cyl(0.014, 0.014, 0.98, 0.07), 'bamboo', 'wood'], [cyl(0.15, 0.035, 0.28, 0.66, 10).scale(1, 1, 0.42), 'straw', 'thatch'], [cyl(0.03, 0.03, 0.04, 0.53), 'rope', 'cloth']]),
  // 撥 drumsticks
  bachiR: () => assemble([[cyl(0.013, 0.016, 0.4, 0.12), 'wood', 'wood']]),
  bachiL: () => assemble([[cyl(0.013, 0.016, 0.4, 0.12), 'wood', 'wood']]),
  // 鍬 hoe: the blade at the far end, bent toward the ground
  hoe: () => assemble([[cyl(0.017, 0.017, 1.2, 0.35), 'wood', 'wood'], [new THREE.BoxGeometry(0.17, 0.2, 0.018).translate(0, 0.93, 0.07).rotateX(0), 'iron', 'metal']]),
  // 竿 ferry pole
  pole: () => assemble([[cyl(0.022, 0.026, 3.1, -0.65, 7), 'bamboo', 'wood']]),
  // 木槌 mallet (head across the handle) and 鑿 chisel
  mallet: () => assemble([[cyl(0.014, 0.016, 0.32, 0.1), 'wood', 'wood'], [cyl(0.05, 0.05, 0.15, 0, 10).rotateX(Math.PI / 2).translate(0, 0.28, 0), 'darkWood', 'wood']]),
  chisel: () => assemble([[cyl(0.013, 0.013, 0.12, 0.0), 'darkWood', 'wood'], [cyl(0.008, 0.004, 0.13, 0.12, 6), 'iron', 'metal']]),
  // 団扇 round paper fan
  uchiwa: () => assemble([[cyl(0.009, 0.009, 0.16, 0.02), 'bamboo', 'wood'], [new THREE.CylinderGeometry(0.115, 0.115, 0.006, 16).rotateX(Math.PI / 2).scale(1, 1.08, 1).translate(0, 0.21, 0), 'paper', 'paper']]),
  // 筆 brush
  brush: () => assemble([[cyl(0.006, 0.006, 0.17, 0.05), 'bamboo', 'wood'], [cyl(0.002, 0.009, 0.035, -0.045, 6), 'darkWood', 'none']]),
  // sets placed on the ground in front of the worker (y = 0 is the ground, +z forward, scaled with the character)
  taiko: () => assemble([
    [cyl(0.3, 0.3, 0.42, 0, 20).rotateX(Math.PI / 2).translate(0, 0.86, 0), 'lacquer', 'wood'],
    [cyl(0.285, 0.285, 0.44, 0, 20).rotateX(Math.PI / 2).translate(0, 0.86, 0), 'hide', 'none'],
    [new THREE.BoxGeometry(0.06, 0.86, 0.06).translate(-0.24, 0.43, 0).rotateZ(0.12), 'darkWood', 'wood'],
    [new THREE.BoxGeometry(0.06, 0.86, 0.06).translate(0.24, 0.43, 0).rotateZ(-0.12), 'darkWood', 'wood'],
    [new THREE.BoxGeometry(0.62, 0.05, 0.08).translate(0, 0.58, 0), 'darkWood', 'wood']]),
  stone: () => assemble([[cyl(0.24, 0.27, 0.36, 0.18, 9), 'darkWood', 'bark'], [new THREE.BoxGeometry(0.42, 0.26, 0.34).translate(0, 0.49, 0), 'stone', 'stone']]),
  lanternwork: () => assemble([[cyl(0.13, 0.13, 0.28, 0.14, 12), 'paper', 'paper'], [cyl(0.135, 0.135, 0.02, 0.005, 12), 'darkWood', 'wood'], [cyl(0.135, 0.135, 0.02, 0.275, 12), 'darkWood', 'wood'],
    [cyl(0.1, 0.1, 0.012, 0.006, 10).translate(0.34, 0, 0.05), 'darkWood', 'wood']]),
};
/** A shared-geometry clone of a prop (templates are built once). */
function prop(kind) {
  let t = _tpl.get(kind);
  if (!t) { const f = PROP_DEF[kind]; if (!f) return null; t = f(); t.name = 'prop:' + kind; _tpl.set(kind, t); }
  return t.clone();
}
// where a set stands relative to the worker (forward metres at hipsHeight 0.887; scaled with the character)
const SET_AT = { taiko: 1.17, stone: 0.62, lanternwork: 0.42 };
// sound on the work clip's marks
const WORK_SFX = { drum: ['taiko', 0.45], hammer: ['hit_earth', 0.18] };

const _v = new THREE.Vector3(), _h = new THREE.Vector3();
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export function createNpcs(story) {
  const npcs = new Map();
  let streamT = 0, spawnedThisFrame = 0, barkGlobalT = 0;

  function home(n) {
    const d = n.def;
    let x, z;
    if (d.pos) ({ x, z } = d.pos());
    else { const a = G.world.ANCHORS[d.anchor]; if (!a) return false; x = a.x; z = a.z; }
    if (d.off) { x += d.off[0]; z += d.off[1]; }
    const a = d.anchor ? G.world.ANCHORS[d.anchor] : null;
    n.home.set(x, 0, z);
    const h = G.world.heightAt(x, z);
    n.home.y = G.world.groundAt ? G.world.groundAt(x, z, h + 1.2) : h;
    n.baseYaw = d.face ?? a?.face ?? 0;
    return true;
  }

  for (const def of ROSTER) {
    const n = { id: def.id, def, actor: null, blob: null, home: new THREE.Vector3(), pos: new THREE.Vector3(), yaw: 0, baseYaw: 0, ready: false,
      talking: false, speakT: 0, altT: 4 + Math.random() * 6, barkT: 0, wanderT: 2 + Math.random() * 4, target: null, gestureT: 0, hidden: false };
    npcs.set(def.id, n);
  }

  function visibleRule(n) {
    if (n.def.when && !n.def.when()) return false;
    if (G.combat?.duel && G.combat.duel.id === n.id) return false;
    return true;
  }
  function spawn(n) {
    if (n.actor) return;
    try {
      const a = createActor(n.def.asset, { castShadow: true, fidgets: !n.def.folk, animLod: true });   // animLod: pose every 2nd frame beyond 60 m (draw-call pass)
      if (n.def.scale) a.group.scale.setScalar(n.def.scale);
      // work props: hand tools (shown while working) and a set on the ground in front
      n.props = [];
      for (const k of n.def.props || []) { const p = prop(k); if (p) { a.attach(p, k.endsWith('L') || k === 'chisel' ? 'handL' : 'handR', k.endsWith('L') || k === 'chisel' ? GRIP_L : GRIP_R); p.visible = false; n.props.push(p); } }
      n.propK = 0; n.working = false; n.workT = 0;
      if (n.def.set && !n.set) {
        const s = prop(n.def.set);
        if (s) {
          const k = ((a.info?.hipsHeight || 0.887) / 0.887) * (n.def.scale || 1), f = (SET_AT[n.def.set] || 0.8) * k;
          const x = n.home.x + Math.sin(n.baseYaw) * f, z = n.home.z + Math.cos(n.baseYaw) * f;
          s.position.set(x, G.world.groundAt ? G.world.groundAt(x, z, n.home.y + 1) : n.home.y, z);
          s.rotation.y = n.baseYaw; s.scale.setScalar(k);
          n.set = s; G.scene.add(s);
        }
      }
      if (n.def.dress) { try { n.def.dress(a); } catch (e) { G.reportError('npcs:dress:' + n.id, e); } }
      n.actor = a;
      n.pos.copy(n.home); n.yaw = n.baseYaw;
      a.group.position.copy(n.pos); a.group.rotation.y = n.yaw;
      G.scene.add(a.group);
      a.play(n.def.idle || 'idle', { fade: 0.01 });
      n.blob = makeActorShadowBlob(0.42 * (n.def.scale || 1), 0.35);
      G.scene.add(n.blob);
    } catch (e) { G.reportError('npcs:spawn:' + n.id, e); }
  }
  function despawn(n) {
    if (!n.actor) return;
    try { n.actor.dispose(); } catch (e) { /* ignore */ }
    n.actor.group.parent?.remove(n.actor.group);
    n.actor = null;
    if (n.blob) { n.blob.parent?.remove(n.blob); n.blob.geometry.dispose(); n.blob.material.dispose(); n.blob = null; }
    if (n.set) { n.set.parent?.remove(n.set); n.set = null; }
    n.props = null; n.working = false;
    n.talking = false;
  }

  function stage() { return story.stage?.() || 'a'; }
  function barkLine(n) {
    const S = stage();
    if (n.def.folk) {
      const tbl = raw('story.bark.' + n.id) || {};
      const order = ['post', 'c', 'b', 'a'];
      for (let i = order.indexOf(S); i < order.length; i++) { const L = tbl[order[i]]; if (Array.isArray(L) && L.length) return L[(Math.random() * L.length) | 0]; }
      return null;
    }
    const L = raw('story.greet.' + n.id);
    return Array.isArray(L) && L.length ? L[(Math.random() * L.length) | 0] : null;
  }
  function headPos(n, out) {
    if (!n.actor) return null;
    const hb = n.actor.bones?.head;
    if (hb) { hb.getWorldPosition(out); out.y += 0.55 * (n.def.scale || 1); } else out.copy(n.pos).setY(n.pos.y + 2.1);
    return out;
  }

  function updateOne(n, dt) {
    const a = n.actor; if (!a) return;
    const P = G.player;
    const vis = visibleRule(n);
    a.group.visible = vis; if (n.blob) n.blob.visible = vis;
    if (!vis) return;
    const px = P?.pos.x ?? 0, pz = P?.pos.z ?? 0;
    const dx = px - n.pos.x, dz = pz - n.pos.z, d = Math.hypot(dx, dz);
    // wandering (folk only, never while talking or watching the heroine closely)
    if (n.def.wander && !n.talking && d > 4) {
      n.wanderT -= dt;
      if (!n.target && n.wanderT <= 0) {
        const ang = Math.random() * Math.PI * 2, r = Math.random() * n.def.wander;
        n.target = new THREE.Vector3(n.home.x + Math.cos(ang) * r, 0, n.home.z + Math.sin(ang) * r);
      }
      if (n.target) {
        const tx = n.target.x - n.pos.x, tz = n.target.z - n.pos.z, td = Math.hypot(tx, tz);
        if (td < 0.25) { n.target = null; n.wanderT = 3 + Math.random() * 6; a.play(n.def.idle || 'idle'); }
        else {
          const sp = 1.1;
          n.pos.x += tx / td * sp * dt; n.pos.z += tz / td * sp * dt;
          n.yaw += angDiff(n.yaw, Math.atan2(tx, tz)) * Math.min(1, dt * 6);
          a.move(sp / (n.def.scale || 1));
        }
      }
    } else if (n.target) { n.target = null; a.play(n.def.idle || 'idle'); }
    n.pos.y = G.world.groundAt ? G.world.groundAt(n.pos.x, n.pos.z, n.home.y + 1.2) : G.world.heightAt(n.pos.x, n.pos.z);
    // attention: head follows the heroine within 8 m, body turns within 3.6 m or while talking
    if (P && d < 8 && G.mode !== 'cutscene') {
      _h.set(px, P.pos.y + 1.4, pz);
      a.lookAt(_h);
      if ((d < 3.6 || n.talking) && !n.target) n.yaw += angDiff(n.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * (n.talking ? 6 : 2.5));
    } else {
      a.lookAt(null);
      if (!n.target && !n.talking) n.yaw += angDiff(n.yaw, n.baseYaw) * Math.min(1, dt * 1.2);
    }
    // work: the NPC's own activity while nobody comes close (stops, puts the hand tools away and turns to her)
    if (n.def.work) workUpdate(n, a, d, dt);
    // idle variety
    else if (!n.talking && !n.target) {
      n.altT -= dt;
      if (n.altT <= 0) {
        const alts = n.def.alt || [];
        const pick = Math.random() < 0.55 || !alts.length ? n.def.idle || 'idle' : alts[(Math.random() * alts.length) | 0];
        a.play(pick, { fade: 0.4 });
        n.altT = 6 + Math.random() * 9;
      }
    }
    a.group.position.copy(n.pos);
    a.group.rotation.y = n.yaw;
    try { a.update(dt); } catch (e) { G.reportError('npcs:actor', e); }
    n.blob?.userData.place?.(n.pos.x, n.pos.y, n.pos.z, 0);
    // barks
    if (P && G.mode === 'play' && !n.talking && d < 5.5 && G.time.t > n.barkT && G.time.t > barkGlobalT && !story.busy) {
      const line = barkLine(n);
      n.barkT = G.time.t + 16 + Math.random() * 10; barkGlobalT = G.time.t + 3.5;
      if (line) bubble('npc:' + n.id, line, (o) => headPos(n, o), { name: t('story.name.' + n.id), dur: 3.6 });
    }
  }

  function workUpdate(n, a, d, dt) {
    const def = n.def;
    const want = !n.talking && !n.target && !(G.player && d < (n.working ? 3.8 : 4.8)) && G.mode !== 'cutscene';
    if (want !== n.working) {
      n.working = want;
      if (want) {
        const upper = CLIPS[def.work]?.layer === 'upper';
        if (upper) { a.play(def.idle || 'idle', { fade: 0.4 }); a.play(def.work, { fade: 0.4 }); }
        else { a.play(def.work, { fade: 0.5 }); if (def.workUpper) a.play(def.workUpper, { layer: 'upper', fade: 0.5 }); }
      } else if (!n.talking) { a.stop('upper', 0.3); a.play(def.idle || 'idle', { fade: 0.35 }); }
    }
    // hand tools fade in / out with the work (scaled, no pop)
    n.propK = damp(n.propK, n.working ? 1 : 0, n.working ? 5 : 9, dt);
    for (const p of n.props || []) { p.visible = n.propK > 0.03; p.scale.setScalar(Math.max(0.03, n.propK)); }
    // sound on the clip's marks (drum hits, hammer blows) when she is near enough to hear
    const sfx = WORK_SFX[def.work];
    if (sfx && n.working && d < 30) {
      const tm = a.timeOf(def.work), marks = CLIPS[def.work].marks || [];
      if (tm != null && n.workT != null) for (const m of marks) if ((n.workT < m && tm >= m) || (tm < n.workT && (m >= n.workT || m <= tm))) { G.audio?.sfx(sfx[0], { pos: n.pos, vol: sfx[1] }); break; }
      n.workT = tm;
    }
  }

  const api = {
    roster: ROSTER,
    list: npcs,
    /** Live Actor of an npc (or null when streamed out). */
    actor(id) { return npcs.get(id)?.actor || null; },
    /** Npc record. */
    get(id) { return npcs.get(id) || null; },
    /** Feet position (home position when streamed out). */
    posOf(id, out = new THREE.Vector3()) { const n = npcs.get(id); if (!n) return null; if (!n.ready) home(n); return out.copy(n.actor ? n.pos : n.home); },
    /** True if spawned, visible and within 40 m of the heroine. */
    isPresent(id) { const n = npcs.get(id); return !!(n && n.actor && n.actor.group.visible && G.player && n.pos.distanceTo(G.player.pos) < 40); },
    alive() { let k = 0; for (const n of npcs.values()) if (n.actor) k++; return k; },
    beginTalk(id) {
      const n = npcs.get(id); if (!n) return;
      n.talking = true; n.target = null;
      if (!n.actor) { spawn(n); }
      // listening stance; the talk gestures play over it as upper-body one-shots
      if (n.actor) { n.actor.stop('upper', 0.25); n.actor.play('listen', { fade: 0.4 }); }
    },
    endTalk(id) {
      const n = npcs.get(id); if (!n) return;
      n.talking = false;
      if (n.actor) { n.actor.speaking = false; n.actor.stop('upper', 0.3); n.actor.play(n.def.idle || 'idle', { fade: 0.5 }); n.actor.clearExpressions?.(); }
    },
    /** Lip-sync: on with the line's text (mouth shapes walk the text at the box's typing pace), off when it is done. */
    speaking(id, on, text) { const a = npcs.get(id)?.actor; if (!a) return; if (on && text) a.say(text); else a.speaking = !!on; },
    /** Acting tag (clips.js state): upper-body ones play over the listening stance, full-body ones return to it. */
    gesture(id, act) {
      const n = npcs.get(id); if (!n?.actor) return;
      n.actor.play(act, { restart: true, fade: CLIPS[act]?.fade ?? 0.25 });
    },
    /** Bark a line now (used by story beats). */
    bark(id, text, dur = 3.6) { const n = npcs.get(id); if (n?.actor) bubble('npc:' + id, text, (o) => headPos(n, o), { name: t('story.name.' + id), dur }); },
    /** Move an NPC's home (story staging). null restores the roster spot. */
    place(id, x, z, face) {
      const n = npcs.get(id); if (!n) return;
      if (x == null) { home(n); } else { n.home.set(x, G.world.groundAt(x, z, G.world.heightAt(x, z) + 1.2), z); if (face != null) n.baseYaw = face; }
      n.ready = true; n.pos.copy(n.home);
    },
    init() {
      for (const n of npcs.values()) {
        n.ready = home(n);
        const id = n.id;
        G.interact?.add({
          // final-play1: a work set on the ground (鸣's taiko) stopped her ~3 m out, so no talk prompt from that side
          getPos: (o) => (n.actor ? o.copy(n.pos).setY(n.pos.y + 1) : null), radius: n.def.set ? 3.8 : 2.9, priority: 2,
          prompt: () => (n.def.shop ? t('story.prompt.shop') : t('story.prompt.talkTo', { name: t('story.name.' + id) })),
          enabled: () => !!n.actor && n.actor.group.visible && !story.busy,
          onInteract: () => story.talk(id),
        });
      }
    },
    update(dt) {
      spawnedThisFrame = 0;
      streamT -= dt;
      const F = G.player?.pos || G.camera.position;
      if (streamT <= 0) {
        streamT = 0.4;
        const cand = [];
        for (const n of npcs.values()) {
          if (!n.ready) n.ready = home(n);
          const d = Math.hypot(n.home.x - F.x, n.home.z - F.z);
          n._d = d;
          const want = n.ready && d < (n.actor ? FAR : NEAR) && (!n.def.when || n.def.when());
          if (want || n.talking) cand.push(n);
          else if (n.actor) despawn(n);
        }
        cand.sort((a, b) => a._d - b._d);
        cand.forEach((n, i) => { if (i >= MAX_LIVE && !n.talking) despawn(n); });
        for (let i = 0; i < Math.min(MAX_LIVE, cand.length) && spawnedThisFrame < 1; i++) if (!cand[i].actor) { spawn(cand[i]); spawnedThisFrame++; }
      }
      for (const n of npcs.values()) if (n.actor) updateOne(n, dt);
    },
    /** Re-home everyone (after load / story staging). */
    rehome() { for (const n of npcs.values()) { n.ready = home(n); if (n.actor && !n.target) n.pos.copy(n.home); } },
  };
  return api;
}
