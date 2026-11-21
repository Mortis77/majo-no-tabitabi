// Collectibles: 月之泪, 绘马, chests, lost fox kits, the kite, ingredients, firefly clusters, lotus lamps, and the tear altars.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { addItem } from '../core/save.js';
import { glow, glowDynamic, toon, flat, PAL } from '../core/mats.js';
import { box, cyl, cone, sphere, torus, bakeStatic } from '../core/geo.js';
import { MOONTEARS, EMA, CHESTS, FOXKITS, KITE, INGREDIENTS, FIREFLIES, LOTUS, ALTARS } from '../data/placements.js';
import { LOOT, UPGRADES, TEARS_PER_POINT } from '../data/items.js';
import { gp, isActive, resolveSpot, makeInstanced, sfx, toast } from './common.js';
import { M, lathe, rcyl, rbox, ring, tube, emaBoard } from '../props/shapes.js';
// draw-call pass (docs/api/perf.md): chests and the kite (about a metre, a few pixels in the haze) are not drawn beyond
// CHEST_CUT m; the chests' baked body and the altars swap to a one- or two-draw stand-in beyond FAR_SWAP m (past the
// 64 m night lamp-pool map).
const CHEST_CUT = 220, FAR_SWAP = 100;

const TAU = Math.PI * 2;

export function createCollect(api) {
  const spots = [];                 // every collectible: { id, kind, group, pos, ... }
  const byId = {};
  const _v = new THREE.Vector3(), _q = new THREE.Vector3();
  let tears = null, emas = null, shrooms = null, seeds = null, ffDots = null;
  const chests = {}, kits = {}, lotus = {}, altars = {};
  let kite = null;
  const done = (id) => !!(G.state && G.state.collected && G.state.collected[id]);

  function add(s) { spots.push(s); byId[s.id] = s; return s; }

  // ---- 月之泪 -----------------------------------------------------------------------------------------------------
  function initTears() {
    // a faceted moon-glass teardrop: lit facets (cool cel band + crisp highlight) over a strong inner emissive, a soft
    // glowing back shell, a bright heart, and two thin gold hoops crossing at an angle
    const proto = new THREE.Group();
    const tearPts = (k) => [[0, -0.2 * k], [0.09 * k, -0.18 * k], [0.15 * k, -0.11 * k], [0.165 * k, -0.02 * k], [0.14 * k, 0.08 * k], [0.09 * k, 0.18 * k], [0.035 * k, 0.29 * k], [0, 0.34 * k]];
    const drop = lathe(tearPts(1), toon(0xbfe0ff, { emissive: 0x3d6fae, surface: 'none', look: { spec: 1, specPower: 80, rim: 1, wrap: 0.7 } }), 0, 0, 0, 9);
    drop.geometry = drop.geometry.toNonIndexed(); drop.geometry.computeVertexNormals();   // faceted (toon has no flatShading)
    const shell = lathe(tearPts(1.22), glow(0xa9d4ff, 1.6, { side: THREE.BackSide }), 0, -0.01, 0, 12);
    const heart = sphere(0.06, glow(0xffffff, 4), 0, 0.0, 0, 8, 6);
    const halo = ring(0.32, 0.011, M.gold(), 0, 0.03, 0, 40, 4); halo.rotation.z = 0.32;
    const halo2 = ring(0.27, 0.008, glow(PAL.moonGold, 2.2), 0, 0.03, 0, 36, 4); halo2.rotation.set(1.2, 0, -0.25);
    for (const m of [drop, shell, heart, halo, halo2]) m.castShadow = false;
    // the heart shows through a narrow window: put it just proud of the facets on two sides
    heart.scale.set(1.9, 1.2, 1.9);
    proto.add(drop, shell, heart, halo, halo2);
    tears = makeInstanced(proto, MOONTEARS.length, { castShadow: false, name: 'gp:moontears' });
    G.scene.add(tears.group);
    MOONTEARS.forEach((m, i) => add({ id: m.id, kind: 'moontear', slot: i, pos: resolveSpot(m, 1.1), phase: i * 1.7 }));
  }
  function collectTear(s) {
    G.state.collected[s.id] = true;
    tears.hide(s.slot);
    const n = addItem(G, 'moontear', 1);
    G.fx?.burst?.('pickup', s.pos, { color: 0xcfe6ff, scale: 1.4 });
    G.fx?.ring?.(s.pos, { color: PAL.moonPale, radius: 2.4, dur: 0.8, y: s.pos.y - 0.6 });
    G.fx?.flash?.(s.pos, 0xcfe6ff, 40, 0.4, 10);
    const got = MOONTEARS.filter((m) => done(m.id)).length;
    toast(t('gameplay.toast.tear', { n: got, max: MOONTEARS.length }), { icon: 'moontear' });
    if (n >= TEARS_PER_POINT && n % TEARS_PER_POINT === 0) setTimeout(() => toast(t('gameplay.toast.tearPoint'), { icon: 'moontear' }), 900);
    G.events.emit('item:collected', { id: s.id, kind: 'moontear', pos: s.pos.clone() });
  }

  // ---- 绘马 ---------------------------------------------------------------------------------------------------------
  function initEma() {
    // a little shrine rack: a stone foot, a dark post with a gabled cap, and the pentagonal votive board hanging from a
    // red cord; the painted face (a vermilion sun disc over ink strokes) keeps a soft glow so it reads as a find
    const proto = new THREE.Group();
    const wood = M.woodLight(), dark = M.woodDark(), red = M.ropeRed();
    proto.add(lathe([[0, 0], [0.13, 0], [0.14, 0.03], [0.11, 0.07], [0.08, 0.09], [0, 0.09]], M.stone(), 0, 0, 0, 10));
    proto.add(rcyl(0.04, 0.05, 1.3, dark, 0, 0.7, 0, 8, 0.01));
    proto.add(rbox(0.58, 0.05, 0.06, dark, 0, 1.3, 0, 0.012, 1));
    for (const sgn of [-1, 1]) { const r = rbox(0.34, 0.025, 0.11, M.woodDark(), sgn * 0.15, 1.37, 0, 0.008, 1); r.rotation.z = -sgn * 0.42; proto.add(r); }
    proto.add(tube([[0, 1.28, 0.03], [0.01, 1.22, 0.04], [0, 1.16, 0.045]], 0.008, red, 6, 4));
    proto.add(emaBoard(0.42, 0.32, 0.025, wood, 0).translateY(0.98).translateZ(0.05));
    proto.add(rbox(0.4, 0.02, 0.03, M.wood(), 0, 1.11, 0.05, 0.006, 1));
    const sun = rcyl(0.07, 0.07, 0.006, glow(0xff7a52, 1.25), 0, 0, 0, 14, 0.002); sun.rotation.x = Math.PI / 2; sun.position.set(0.06, 1.0, 0.068); sun.castShadow = false; proto.add(sun);
    for (let i = 0; i < 3; i++) { const st = rbox(0.012, 0.11 - i * 0.02, 0.006, toon(PAL.ink || 0x2b2238, { surface: 'none' }), -0.1 + i * 0.035, 0.97, 0.067, 0.003, 1); st.rotation.z = 0.15 * (i - 1); proto.add(st); }
    const pane = emaBoard(0.36, 0.26, 0.004, glow(PAL.lanternHot, 0.55), 0); pane.position.set(0, 0.975, 0.0645); pane.castShadow = false; proto.add(pane);
    // tassel under the board
    proto.add(tube([[0.17, 0.86, 0.06], [0.18, 0.8, 0.06], [0.175, 0.74, 0.06]], 0.007, red, 6, 4), sphere(0.018, red, 0.175, 0.735, 0.06, 6, 4));
    emas = makeInstanced(proto, EMA.length, { castShadow: true, name: 'gp:ema' });
    G.scene.add(emas.group);
    EMA.forEach((e, i) => {
      const pos = resolveSpot(e, 0);
      const s = add({ id: e.id, kind: 'ema', slot: i, pos, yaw: hashYaw(e.id) });
      emas.set(i, pos, s.yaw, 1);
      G.world.addCollider?.({ x: pos.x, z: pos.z, r: 0.12, y0: pos.y - 0.5, y1: pos.y + 1.3, tag: 'gameplay' });
      s.interact = G.interact?.add({ pos: pos.clone().setY(pos.y + 1), radius: 2.2, priority: 1, prompt: () => t('gameplay.prompt.read'), onInteract: () => readEma(s) });
    });
  }
  function hashYaw(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return ((h >>> 0) % 628) / 100; }
  async function readEma(s) {
    const first = !(G.state.lore && G.state.lore[s.id]);
    G.state.lore[s.id] = true;
    G.state.collected[s.id] = true;
    sfx('paper', { pos: s.pos });
    if (first) {
      G.events.emit('item:collected', { id: s.id, kind: 'ema', pos: s.pos.clone() });
      const n = EMA.filter((e) => G.state.lore[e.id]).length;
      toast(t('gameplay.toast.ema', { n, max: EMA.length }), { icon: 'ema' });
    }
    try { await G.ui?.say?.({ name: t('gameplay.lore.' + s.id + '.title'), text: t('gameplay.lore.' + s.id + '.text') }); } catch (e) { G.reportError('gameplay:ema', e); }
  }

  // ---- chests ---------------------------------------------------------------------------------------------------------
  function initChests() {
    const make = G.structures?.factories?.makeChest || G.structures?.makeChest;
    for (const c of CHESTS) {
      const pos = resolveSpot(c, 0);
      const h = make ? make() : null;
      if (h) { h.group.position.copy(pos); h.group.rotation.y = c.face || 0; G.scene.add(h.group); G.structures?.cull?.(h.group, pos, CHEST_CUT);
        G.structures?.standIn?.(h.group, FAR_SWAP, CHEST_CUT, { statics: true })?.catch?.((e) => G.reportError('gameplay:chest:far', e)); }
      G.world.addCollider?.({ box: true, x: pos.x, z: pos.z, hw: 0.5, hd: 0.32, rot: c.face || 0, y0: pos.y - 0.4, y1: pos.y + 0.6, tag: 'gameplay' });
      const s = add({ id: c.id, kind: 'chest', pos, h, loot: c.loot });
      chests[c.id] = s;
      s.interact = G.interact?.add({ pos: pos.clone().setY(pos.y + 0.6), radius: 2.2, priority: 1, enabled: () => !done(c.id), prompt: () => t('gameplay.prompt.open'), onInteract: () => openChest(c.id) });
    }
  }
  /** Open a chest (own chests by id, or a structures chest handle such as 'broom_chest'). */
  function openChest(id, { silent = false } = {}) {
    const own = chests[id];
    const h = own ? own.h : G.structures?.chests?.[id];
    if (done(id)) return false;
    G.state.collected[id] = true;
    h?.open?.(false);
    if (!own) { G.events.emit('item:collected', { id, kind: 'chest', pos: (h?.group?.position || G.player?.pos)?.clone?.() }); return true; }
    const pos = own.pos;
    G.player?.playAction?.('open', { face: pos });
    sfx('chest_open', { pos });
    setTimeout(() => {
      G.fx?.burst?.('pickup', _v.copy(pos).setY(pos.y + 0.7), { color: PAL.gold, scale: 1.6 });
      G.fx?.flash?.(_v, PAL.gold, 50, 0.5, 10);
      const names = [];
      for (const it of LOOT[own.loot] || []) {
        if (it.item === 'stardust') { api.spawnPickup('stardust', _q.copy(pos).setY(pos.y + 0.7), it.n); names.push(t('gameplay.toast.chestItem', { name: t('gameplay.item.stardust.name'), n: it.n })); }
        else if (it.upgrade) { const lv = api.applyUpgrade(it.upgrade, it.n || 1); names.push(t('gameplay.upgrade.' + it.upgrade + '.name')); if (lv) setTimeout(() => toast(t('gameplay.toast.upgraded', { name: t('gameplay.upgrade.' + it.upgrade + '.name'), lv }), { icon: UPGRADES[it.upgrade]?.icon }), 1200); }
        else { addItem(G, it.item, it.n); names.push(t('gameplay.toast.chestItem', { name: t('gameplay.item.' + it.item + '.name'), n: it.n })); }
      }
      if (!silent) toast(t('gameplay.toast.chest', { items: names.join(t('gameplay.toast.sep')) }), { icon: 'chest', dur: 3.2 });
    }, 420);
    G.events.emit('item:collected', { id, kind: 'chest', pos: pos.clone() });
    api.markersDirty();
    return true;
  }

  // ---- fox kits -----------------------------------------------------------------------------------------------------------
  function initKits() {
    for (const k of FOXKITS) {
      const pos = resolveSpot(k, 0);
      const s = add({ id: k.id, kind: 'foxkit', group: 'kits', pos, face: k.face || 0, obj: null, mixer: null, yipT: 2 + Math.random() * 4, hopT: 0 });
      kits[k.id] = s;
      s.interact = G.interact?.add({ pos: pos.clone().setY(pos.y + 0.4), radius: 2.0, priority: 2, enabled: () => !done(k.id) && isActive('kits'), prompt: () => t('gameplay.prompt.kit'), onInteract: () => collectSimple(s) });
    }
  }
  function buildKit(s) {
    if (s.obj || !G.assets?.has?.('ani_fox')) return;
    const m = G.assets.model('ani_fox'); if (!m) return;
    m.scale.multiplyScalar(0.62);
    m.position.copy(s.pos); m.rotation.y = s.face;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    G.scene.add(m);
    s.obj = m;
    const clips = m.userData.clips || G.assets.clips?.('ani_fox') || [];
    s.mixer = new THREE.AnimationMixer(m);
    s.clips = {};
    for (const c of clips) s.clips[c.name] = c;
    const idle = s.clips.Eating || clips[0];
    if (idle) { s.idle = s.mixer.clipAction(idle); s.idle.play(); s.idle.time = Math.random() * idle.duration; }
  }

  // ---- kite --------------------------------------------------------------------------------------------------------------
  function initKite() {
    const pos = resolveSpot(KITE, 0);
    const g = new THREE.Group();
    const paper = toon(0xfff1d6), red = toon(PAL.mikoRed), bamboo = toon(PAL.straw);
    const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.75, 0), new THREE.Vector3(-0.5, 0.1, 0), new THREE.Vector3(0, -0.6, 0),
      new THREE.Vector3(0, 0.75, 0), new THREE.Vector3(0, -0.6, 0), new THREE.Vector3(0.5, 0.1, 0)]), paper);
    sail.geometry.computeVertexNormals(); sail.material = paper.clone(); sail.material.side = THREE.DoubleSide;
    g.add(sail);
    // a red koi on the sail (two ellipses), bamboo spars, a ribbon tail of bows
    const koi = sphere(0.16, red, 0, 0.12, 0.012, 10, 6); koi.scale.set(1, 1.7, 0.08); g.add(koi);
    const fin = cone(0.1, 0.18, red, 0, -0.2, 0.012, 6); fin.scale.z = 0.1; fin.rotation.x = Math.PI; g.add(fin);
    g.add(box(0.02, 1.35, 0.02, bamboo, 0, 0.07, -0.02));
    const cross = box(1.0, 0.02, 0.02, bamboo, 0, 0.1, -0.02); g.add(cross);
    for (let i = 0; i < 6; i++) { const b = box(0.14, 0.05, 0.01, i % 2 ? red : toon(PAL.gold), 0.04 * Math.sin(i), -0.72 - i * 0.2, 0); b.rotation.z = 0.3 * (i % 2 ? 1 : -1); g.add(b); }
    const baked = bakeStatic(g);
    baked.position.copy(pos).setY(pos.y + 0.9);
    baked.rotation.set(-0.35, 0.8, 0.25);
    // draw-call pass: the kite hides itself once taken, so the distance cut works on a holder around it
    const holder = new THREE.Group(); holder.name = 'kiteHolder'; holder.add(baked);
    G.scene.add(holder);
    G.structures?.cull?.(holder, pos, CHEST_CUT);
    kite = add({ id: KITE.id, kind: 'kite', group: 'kite', pos: pos.clone().setY(pos.y + 0.9), obj: baked });
    kite.interact = G.interact?.add({ pos: kite.pos, radius: 2.6, priority: 2, broom: true, enabled: () => !done(KITE.id) && isActive('kite'), prompt: () => t('gameplay.prompt.kite'), onInteract: () => collectSimple(kite) });
  }

  // ---- ingredients ---------------------------------------------------------------------------------------------------------
  function initIngredients() {
    const sp = new THREE.Group();
    const stem = toon(0xdfe9ff);
    for (const [x, z, s] of [[0, 0, 1], [0.22, 0.1, 0.7], [-0.16, 0.14, 0.6], [0.05, -0.2, 0.55]]) {
      sp.add(cyl(0.035 * s, 0.05 * s, 0.3 * s, stem, x, 0.15 * s, z, 6));
      const cap = sphere(0.17 * s, glow(PAL.glowCyan, 2.2), x, 0.3 * s, z, 12, 6); cap.scale.y = 0.5; cap.castShadow = false; sp.add(cap);
    }
    const shroomList = INGREDIENTS.filter((i) => i.item === 'glowshroom');
    shrooms = makeInstanced(sp, shroomList.length, { castShadow: false, name: 'gp:glowshroom' });
    const sf = new THREE.Group();
    sf.add(cyl(0.035, 0.05, 1.6, toon(0x5fae48), 0, 0.8, 0, 6));
    const head = cyl(0.3, 0.3, 0.08, toon(0x6a4a26), 0, 1.65, 0.05, 14); head.rotation.x = Math.PI / 2 - 0.3; sf.add(head);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const p = box(0.13, 0.26, 0.03, glow(PAL.sunflower, 1.15), Math.cos(a) * 0.36, 1.65 + Math.sin(a) * 0.36 * Math.cos(0.3), 0.08 + Math.sin(a) * 0.1); p.rotation.z = a - Math.PI / 2; p.castShadow = false; sf.add(p); }
    for (const sgn of [-1, 1]) { const l = sphere(0.16, toon(0x5fae48), sgn * 0.18, 0.75, 0, 6, 4); l.scale.set(1, 0.25, 0.5); sf.add(l); }
    const seedList = INGREDIENTS.filter((i) => i.item === 'sunseed');
    seeds = makeInstanced(sf, seedList.length, { castShadow: true, name: 'gp:sunseed' });
    G.scene.add(shrooms.group, seeds.group);
    let a = 0, b = 0;
    for (const ing of INGREDIENTS) {
      const pos = resolveSpot(ing, 0);
      const isShroom = ing.item === 'glowshroom';
      const s = add({ id: ing.id, kind: ing.item, item: ing.item, pos, inst: isShroom ? shrooms : seeds, slot: isShroom ? a++ : b++, yaw: hashYaw(ing.id) });
      s.inst.set(s.slot, pos, s.yaw, isShroom ? 1.2 : 1);
      s.interact = G.interact?.add({ pos: pos.clone().setY(pos.y + 0.6), radius: 2.0, priority: 1, enabled: () => !done(ing.id), prompt: () => t('gameplay.prompt.gather', { name: t('gameplay.item.' + ing.item + '.name') }), onInteract: () => collectSimple(s) });
    }
  }

  // ---- fireflies -----------------------------------------------------------------------------------------------------------
  function initFireflies() {
    const dot = new THREE.Group(); const d = sphere(0.05, glow(0xd8ff7a, 4), 0, 0, 0, 6, 4); d.castShadow = false; dot.add(d);
    ffDots = makeInstanced(dot, FIREFLIES.length * 14, { castShadow: false, name: 'gp:fireflies' });
    G.scene.add(ffDots.group);
    FIREFLIES.forEach((f, i) => {
      const pos = resolveSpot(f, 1.3);
      const s = add({ id: f.id, kind: 'firefly', group: 'fireflies', pos, base: i * 14, em: null, light: null });
      s.interact = G.interact?.add({ pos, radius: 2.4, priority: 2, enabled: () => !done(f.id) && isActive('fireflies'), prompt: () => t('gameplay.prompt.firefly'), onInteract: () => collectSimple(s) });
    });
  }

  // ---- lotus lamps -----------------------------------------------------------------------------------------------------------
  function initLotus() {
    for (const l of LOTUS) {
      const pos = new THREE.Vector3(l.x, (G.world.seaLevel ?? 0) + 0.02, l.z);
      const g = new THREE.Group();
      const pad = cyl(0.9, 0.9, 0.05, toon(0x3f7a4a), 0, 0, 0, 16); g.add(pad);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; const p = cone(0.16, 0.5, toon(0xffc1d6), Math.cos(a) * 0.22, 0.22, Math.sin(a) * 0.22, 5); p.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); g.add(p); }
      const mat = glowDynamic(PAL.lanternWarm, 3);
      const lamp = cyl(0.17, 0.2, 0.36, mat, 0, 0.42, 0, 8); lamp.castShadow = false;
      const cap = cyl(0.05, 0.22, 0.1, toon(PAL.vermilion), 0, 0.65, 0, 8);
      g.add(lamp, cap);
      g.position.copy(pos);
      G.scene.add(g);
      mat.userData.setGlow(0.08);
      const s = add({ id: l.id, kind: 'lotus_lamp', group: 'lotus', pos, obj: g, mat, light: null, phase: Math.random() * 6 });
      lotus[l.id] = s;
      const fire = pos.clone().setY(pos.y + 0.45);
      s.reactor = G.elements?.register?.({ owner: s, kind: 'lantern', material: 'paper', pos, radius: 1.0, height: 0.8, team: 'neutral',
        on: { ignite: () => lightLotus(s), light: () => lightLotus(s), extinguish: () => false } }) || null;
      // she reaches the lamps on the broom, which cruises ~4 m over the water and glides on after W is let go: the prompt
      // follows her height up to 6 m above the lamp and the radius is a little wider, so a fly-over at cruise height works
      const fy = fire.y;
      s.interact = G.interact?.add({ pos: fire, getPos: (o) => o.set(fire.x, Math.min(fy + 6, Math.max(fy, G.player?.pos.y ?? fy)), fire.z),
        radius: 3.6, priority: 2, broom: true, enabled: () => (!done(l.id) || s.eaten) && isActive('lotus'), prompt: () => t('gameplay.prompt.lotus'), onInteract: () => lightLotus(s) });
    }
  }
  // the moth (灯喰蛾) can eat a lit lamp's flame: it goes dark (progress kept) until relit with fire or by hand
  function eatLotus(s) {
    if (!done(s.id) || s.eaten) return false;
    s.eaten = true;
    s.mat.userData.setGlow(0.08);
    if (s.light) { s.light.remove?.(); s.light = null; }
    G.fx?.burst?.('extinguish', _v.copy(s.pos).setY(s.pos.y + 0.5));
    sfx('lantern_out', { pos: s.pos });
    return true;
  }
  function lightLotus(s, silent = false) {
    if (s.eaten && done(s.id)) {
      s.eaten = false;
      s.mat.userData.setGlow(1);
      if (!s.light) s.light = G.elements?.addLight?.({ pos: s.pos.clone().setY(s.pos.y + 0.5), radius: 9, intensity: 0.8 }) || null;
      if (!silent) { G.fx?.burst?.('lantern_ignite', _v.copy(s.pos).setY(s.pos.y + 0.5)); sfx('lantern_ignite', { pos: s.pos }); }
      return true;
    }
    if (done(s.id) || !isActive('lotus')) return false;
    G.state.collected[s.id] = true;
    s.mat.userData.setGlow(1);
    s.light = G.elements?.addLight?.({ pos: s.pos.clone().setY(s.pos.y + 0.5), radius: 9, intensity: 0.8 }) || null;
    if (!silent) {
      G.fx?.burst?.('lantern_ignite', _v.copy(s.pos).setY(s.pos.y + 0.5));
      G.fx?.ring?.(s.pos, { color: PAL.lanternWarm, radius: 4, dur: 1.2, y: s.pos.y + 0.05 });
      sfx('lantern_ignite', { pos: s.pos });
      const n = LOTUS.filter((l) => done(l.id)).length;
      toast(t('gameplay.toast.lotus', { n, max: LOTUS.length }), { icon: 'lantern' });
      G.events.emit('item:collected', { id: s.id, kind: 'lotus_lamp', pos: s.pos.clone() });
    }
    return true;
  }

  // ---- generic simple collect (kits, kite, ingredients, fireflies) ------------------------------------------------------------
  function collectSimple(s, silent = false) {
    if (done(s.id)) return false;
    G.state.collected[s.id] = true;
    const pos = s.pos;
    if (s.kind === 'foxkit') {
      addItem(G, 'foxkit', 1);
      G.fx?.burst?.('leaves', _v.copy(pos).setY(pos.y + 0.4), { scale: 0.8 });
      G.fx?.burst?.('summon', _v, { color: PAL.lanternWarm, scale: 0.7 });
      sfx('squeak', { pos, pitch: 1.5 });
      if (s.obj) { s.obj.removeFromParent(); s.obj = null; s.mixer = null; }
      const n = FOXKITS.filter((k) => done(k.id)).length;
      if (!silent) toast(t('gameplay.toast.kit', { n, max: FOXKITS.length }), { icon: 'fox' });
    } else if (s.kind === 'kite') {
      addItem(G, 'kite', 1);
      s.obj.visible = false;
      G.fx?.burst?.('feathers', pos, { scale: 0.8 });
      if (!silent) toast(t('gameplay.toast.kite'), { icon: 'flag' });
    } else if (s.kind === 'firefly') {
      addItem(G, 'firefly', 1);
      s.em?.remove?.(); s.em = null;
      for (let i = 0; i < 14; i++) ffDots.hide(s.base + i);
      G.fx?.burst?.('pickup', pos, { color: 0xd8ff7a, scale: 1.1 });
      const n = FIREFLIES.filter((f) => done(f.id)).length;
      if (!silent) toast(t('gameplay.toast.firefly', { n, max: FIREFLIES.length }), { icon: 'spirit' });
    } else if (s.item) {
      addItem(G, s.item, 1);
      s.inst.hide(s.slot);
      G.fx?.burst?.(s.item === 'glowshroom' ? 'pickup' : 'petals', _v.copy(pos).setY(pos.y + 0.5), { scale: 0.7, color: s.item === 'glowshroom' ? PAL.glowCyan : undefined });
      if (!silent) toast(t('gameplay.toast.gathered', { name: t('gameplay.item.' + s.item + '.name') }), { icon: s.item === 'glowshroom' ? 'spirit' : 'sun', dur: 2 });
    }
    G.player?.playAction?.('pickup', { face: pos });
    G.events.emit('item:collected', { id: s.id, kind: s.kind, pos: pos.clone() });
    api.markersDirty();
    return true;
  }

  // ---- altars ------------------------------------------------------------------------------------------------------------
  function initAltars() {
    const proto = new THREE.Group();
    const ms = flat(0xc9cfe6), msd = flat(0x7f86a6);
    proto.add(cyl(0.75, 0.85, 0.25, msd, 0, 0.12, 0, 8), cyl(0.5, 0.6, 0.85, ms, 0, 0.65, 0, 8), cyl(0.7, 0.55, 0.18, msd, 0, 1.15, 0, 8));
    const bowl = cyl(0.42, 0.42, 0.04, glow(0xcfe6ff, 1.4), 0, 1.25, 0, 16); bowl.castShadow = false; proto.add(bowl);
    // a crescent hovering above
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 24, Math.PI * 1.25), glow(PAL.moonGold, 2.6)); arc.position.set(0, 1.95, 0); arc.rotation.z = -0.4; arc.castShadow = false;
    proto.add(arc);
    for (const a of ALTARS) {
      const pos = resolveSpot(a, 0);
      const b = bakeStatic(proto.clone());
      b.position.copy(pos);
      G.scene.add(b);
      b.updateMatrixWorld(true);
      G.structures?.standIn?.(b, FAR_SWAP, 320)?.catch?.((e) => G.reportError('gameplay:altar:far', e));
      G.world.addCollider?.({ x: pos.x, z: pos.z, r: 0.75, y0: pos.y - 0.5, y1: pos.y + 1.3, tag: 'gameplay' });
      const s = { id: a.id, kind: 'altar', pos, obj: b };
      altars[a.id] = s;
      G.interact?.add({ pos: pos.clone().setY(pos.y + 1), radius: 2.6, priority: 2, prompt: () => t('gameplay.prompt.altar'), onInteract: () => api.openAltar() });
    }
  }

  // ---- visibility / animation ----------------------------------------------------------------------------------------------
  function refresh() {
    for (const s of spots) {
      const on = !done(s.id) && isActive(s.group);
      if (s.kind === 'moontear') { if (!on) tears.hide(s.slot); }
      else if (s.kind === 'chest') { if (done(s.id)) s.h?.open?.(true); }
      else if (s.kind === 'foxkit') { if (s.obj) s.obj.visible = on; }
      else if (s.kind === 'kite') s.obj.visible = on;
      else if (s.kind === 'firefly') { if (!on) { s.em?.remove?.(); s.em = null; for (let i = 0; i < 14; i++) ffDots.hide(s.base + i); } }
      else if (s.kind === 'lotus_lamp') {
        s.obj.visible = isActive('lotus');
        const lit = done(s.id) && !s.eaten;
        s.mat.userData.setGlow(lit ? 1 : 0.08);
        if (lit && !s.light) s.light = G.elements?.addLight?.({ pos: s.pos.clone().setY(s.pos.y + 0.5), radius: 9, intensity: 0.8 }) || null;
        if (!lit && s.light) { s.light.remove?.(); s.light = null; }
      } else if (s.inst) { if (!on) s.inst.hide(s.slot); else s.inst.set(s.slot, s.pos, s.yaw, s.item === 'glowshroom' ? 1.2 : 1); }
    }
    // structures' broom chest: opened once the broom is ours
    const bc = G.structures?.chests?.broom_chest;
    if (bc && (done('broom_chest') || G.state?.abilities?.broom)) bc.open?.(true);
  }

  function update(dt) {
    const P = G.player; if (!P) return;
    const time = G.time.t;
    const px = P.pos.x, pz = P.pos.z;
    // moon tears: spin + bob, collect by touch (also from the broom)
    for (const s of spots) {
      if (s.kind !== 'moontear' || done(s.id)) continue;
      const dx = s.pos.x - px, dz = s.pos.z - pz, d2 = dx * dx + dz * dz;
      if (d2 > 160 * 160) continue;
      _v.copy(s.pos); _v.y += Math.sin(time * 1.8 + s.phase) * 0.12;
      tears.set(s.slot, _v, time * 1.4 + s.phase, 1 + 0.06 * Math.sin(time * 4 + s.phase));
      if (d2 < 2.6 && Math.abs(P.pos.y + 0.9 - s.pos.y) < 1.8 && !P.dead) collectTear(s);
      else if (d2 < 900 && Math.random() < dt * 1.5) G.fx?.burst?.('spark', _v, { color: 0xcfe6ff, scale: 0.3, count: 0.4 });
    }
    // fox kits: animate when near, yip now and then
    for (const id in kits) {
      const s = kits[id];
      if (done(id) || !isActive('kits')) continue;
      const dx = s.pos.x - px, dz = s.pos.z - pz, d2 = dx * dx + dz * dz;
      if (d2 < 140 * 140 && !s.obj) buildKit(s);
      if (!s.obj) continue;
      const near = d2 < 90 * 90;
      s.obj.visible = near;
      if (!near) continue;
      s.mixer?.update(dt);
      s.yipT -= dt;
      if (s.yipT <= 0) {
        s.yipT = 3.5 + Math.random() * 4;
        if (d2 < 30 * 30) {
          sfx('squeak', { pos: s.pos, pitch: 1.6 + Math.random() * 0.3, vol: 0.7 });
          s.hopT = 0.45;
          // turn toward the heroine when she is close
          if (d2 < 12 * 12) s.face = Math.atan2(px - s.pos.x, pz - s.pos.z);
        }
      }
      if (s.hopT > 0) { s.hopT = Math.max(0, s.hopT - dt); const k = s.hopT / 0.45; s.obj.position.y = s.pos.y + Math.sin(k * Math.PI) * 0.35; }
      s.obj.rotation.y += ((s.face - s.obj.rotation.y + Math.PI * 3) % TAU - Math.PI) * Math.min(1, dt * 4);
    }
    // fireflies: orbiting dots + an fx emitter when near
    for (const s of spots) {
      if (s.kind !== 'firefly' || done(s.id) || !isActive('fireflies')) continue;
      const dx = s.pos.x - px, dz = s.pos.z - pz, d2 = dx * dx + dz * dz;
      if (d2 > 120 * 120) { if (s.em) { s.em.remove?.(); s.em = null; } continue; }
      if (!s.em) s.em = G.fx?.emitter?.('fireflies', { radius: 1.6, height: 1.6, rate: 0.6 }) || null;
      if (s.em) s.em.pos.copy(s.pos);
      for (let i = 0; i < 14; i++) {
        const a = time * (0.6 + (i % 5) * 0.17) + i * 2.1, r = 0.35 + (i % 4) * 0.22;
        _v.set(s.pos.x + Math.cos(a) * r, s.pos.y + Math.sin(time * 1.3 + i) * 0.35 + (i % 3) * 0.15, s.pos.z + Math.sin(a * 1.13) * r);
        ffDots.set(s.base + i, _v, 0, 0.6 + 0.4 * Math.max(0, Math.sin(time * 5 + i * 1.7)));
      }
    }
    // lotus: bob on the water
    for (const id in lotus) {
      const s = lotus[id];
      s.obj.position.y = s.pos.y + Math.sin(time * 1.1 + s.phase) * 0.05;
      s.obj.rotation.y = time * 0.05 + s.phase;
    }
    // remember discovered spots (map markers)
    if ((G.time.frame & 15) === 7) {
      const seen = gp().seen;
      for (const s of spots) if (!seen[s.id] && (s.pos.x - px) ** 2 + (s.pos.z - pz) ** 2 < 45 * 45) { seen[s.id] = true; api.markersDirty(); }
    }
  }

  function init() { initTears(); initEma(); initChests(); initKits(); initKite(); initIngredients(); initFireflies(); initLotus(); initAltars(); }

  /** Positions of uncollected things of a kind (kind = spot kind, item id, or 'chest' / 'ema' / ...). */
  function find(kind) {
    const out = [];
    for (const s of spots) if ((s.kind === kind || s.item === kind) && !done(s.id) && isActive(s.group)) out.push(s.pos.clone());
    if (kind === 'altar') for (const id in altars) out.push(altars[id].pos.clone());
    return out;
  }
  function collectAll(kind) {
    let n = 0;
    for (const s of spots) {
      if (kind && s.kind !== kind && s.item !== kind) continue;
      if (done(s.id)) continue;
      if (s.kind === 'moontear') collectTear(s);
      else if (s.kind === 'ema') { G.state.lore[s.id] = true; G.state.collected[s.id] = true; G.events.emit('item:collected', { id: s.id, kind: 'ema', pos: s.pos.clone() }); }
      else if (s.kind === 'chest') openChest(s.id, { silent: true });
      else if (s.kind === 'lotus_lamp') { if (!isActive('lotus')) continue; lightLotus(s, true); G.events.emit('item:collected', { id: s.id, kind: 'lotus_lamp', pos: s.pos.clone() }); }
      else { if (s.group && !isActive(s.group)) continue; collectSimple(s, true); }
      n++;
    }
    refresh();
    return n;
  }

  return { init, update, refresh, find, collectAll, openChest, spots, byId, chests, kits, lotus, altars, eatLotus, lightLotus, get kite() { return kite; } };
}
