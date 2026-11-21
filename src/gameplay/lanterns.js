// Stone lanterns (石灯笼), great lanterns (镇灯), rest points / checkpoints and respawning after death.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { addItem } from '../core/save.js';
import { ANCHORS } from '../data/world.js';
import { RESTS } from '../data/placements.js';
import { DEATH_TOLL } from '../data/items.js';
import { box, cyl, cone, sphere } from '../core/geo.js';
import { toon, glow, PAL } from '../core/mats.js';
import { bakeStatic } from '../core/geo.js';
import { gp, sfx, toast } from './common.js';
import { M, lathe, rcyl, rbox, ring, tube, paperLantern } from '../props/shapes.js';

const LIGHT_R = 14, GREAT_LIGHT_R = 46;

export function createLanterns(api) {
  const stones = {};      // id -> { id, h (structure handle), pos, firePos, reactor, light, interact }
  const greats = {};      // id -> { id, h, pos, firePos, reactor, light, interact, pulseT }
  const rests = {};       // id -> { id, pos, kind:'rest'|'lantern' }
  const _v = new THREE.Vector3();
  let respawning = false;

  // ---- stone lanterns --------------------------------------------------------------------------------------------
  function initStones() {
    const S = G.structures?.stoneLanterns || {};
    for (const id in S) {
      const h = S[id];
      const pos = h.pos ? h.pos.clone() : new THREE.Vector3();
      const firePos = pos.clone(); firePos.y += (h.firePos?.y ?? 1.73);
      const L = { id, h, pos, firePos, reactor: null, light: null };
      L.reactor = G.elements?.register?.({
        owner: L, kind: 'lantern', material: 'stone', pos, radius: 0.9, height: 2.6, team: 'neutral',
        on: {
          ignite: () => (isLit(id) ? false : (light(id), true)),
          light: () => (isLit(id) ? false : (light(id), true)),
          extinguish: (info) => (isLit(id) ? (douse(id, info), true) : false),
        },
      }) || null;
      L.interact = G.interact?.add({
        pos: firePos, radius: 2.4, priority: 2,
        prompt: () => (isLit(id) ? t('gameplay.prompt.rest') : t('gameplay.prompt.light')),
        onInteract: () => { if (isLit(id)) rest(id); else { G.player?.playAction?.('lantern', { face: pos }); light(id, { byHand: true }); } },
      });
      stones[id] = L;
      rests[id] = { id, pos, kind: 'lantern', lantern: L };
    }
  }
  const isLit = (id) => !!(G.state && G.state.lanterns && G.state.lanterns[id]);
  let poolMat = null;
  function pool(L) {
    if (!poolMat) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,190,110,1)'); gr.addColorStop(0.35, 'rgba(255,150,70,0.45)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.55 });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), poolMat);
    m.rotation.x = -Math.PI / 2; m.position.copy(L.pos); m.position.y += 0.12; m.renderOrder = 2; m.castShadow = false;
    G.scene.add(m);
    return m;
  }
  function setLitVisual(L, on, instant) {
    L.h?.setLit?.(on, instant);
    if (on && !L.pool) L.pool = pool(L);
    if (L.pool) L.pool.visible = on;
    if (on && !L.light) L.light = G.elements?.addLight?.({ pos: L.firePos, radius: LIGHT_R, intensity: 1 }) || null;
    if (!on && L.light) { L.light.remove?.(); L.light = null; }
  }
  /** Light stone lantern id (spells, interact or story). Returns true if it changed. */
  function light(id, o = {}) {
    const L = stones[id]; if (!L || isLit(id)) return false;
    G.state.lanterns[id] = true;
    setLitVisual(L, true, !!o.instant);
    if (o.silent) return true;
    G.fx?.burst?.('lantern_ignite', L.firePos);
    G.fx?.flash?.(L.firePos, PAL.lanternWarm, 60, 0.5, 18);
    sfx('lantern_ignite', { pos: L.firePos });
    const n = litCount(), max = Object.keys(stones).length;
    toast(n >= max ? t('gameplay.toast.lanternAll') : t('gameplay.toast.lanternLit', { n, max }), { icon: 'lantern' });
    G.events.emit('lantern:lit', { id, pos: L.pos.clone() });
    setCheckpoint(id, false);
    api.markersDirty();
    return true;
  }
  function douse(id, info = {}) {
    const L = stones[id]; if (!L || !isLit(id)) return false;
    delete G.state.lanterns[id];
    setLitVisual(L, false, false);
    G.fx?.burst?.('extinguish', L.firePos);
    sfx('lantern_out', { pos: L.firePos });
    if (G.player && L.pos.distanceTo(G.player.pos) < 30) toast(t('gameplay.toast.lanternOut'), { icon: 'lantern', dur: 2 });
    G.events.emit('lantern:out', { id, pos: L.pos.clone() });
    api.markersDirty();
    return true;
  }
  const litCount = () => Object.keys(stones).filter(isLit).length;

  // ---- great lanterns --------------------------------------------------------------------------------------------
  function initGreats() {
    const S = G.structures?.greatLanterns || {};
    for (const id in S) {
      const h = S[id];
      const pos = h.pos ? h.pos.clone() : new THREE.Vector3();
      const firePos = pos.clone(); firePos.y += (h.firePos?.y ?? 3.33);
      const L = { id, h, pos, firePos, reactor: null, light: null, pulseT: Math.random() * 2, hintT: 0 };
      const tryLight = () => { if (greatLit(id)) return false; tryGreat(id); return true; };
      L.reactor = G.elements?.register?.({
        owner: L, kind: 'lantern', material: 'metal', pos, radius: 1.4, height: 5.6, team: 'neutral',
        on: { ignite: tryLight, light: tryLight, extinguish: () => false },
      }) || null;
      L.interact = G.interact?.add({
        pos: firePos, getPos: (o) => o.copy(pos).setY(pos.y + 1.2), radius: 4.8, priority: 3, // final-play2: was 3.2 — the stepped plinth stops her ~4.6 m out, so no prompt without climbing it
        prompt: () => t('gameplay.prompt.great'),
        enabled: () => !greatLit(id) && !!gp().glReady[id],
        onInteract: () => tryGreat(id),
      });
      greats[id] = L;
    }
  }
  const greatLit = (id) => !!(G.state && G.state.greatLanterns && G.state.greatLanterns[id]);
  function tryGreat(id) {
    const L = greats[id]; if (!L || greatLit(id)) return;
    if (!gp().glReady[id]) {
      // final-play1: a stray spell in the boss fight around the lantern is not her trying to light it — no hint mid-fight
      if (G.time.t - L.hintT > 6 && G.player && !G.combat?.boss && !G.combat?.duel && L.pos.distanceTo(G.player.pos) < 30) { L.hintT = G.time.t; toast(t('gameplay.toast.dormant'), { icon: 'greatlantern' }); }
      G.fx?.burst?.('hit_sun', L.firePos, { scale: 0.6 });
      return;
    }
    if (typeof api.onGreatLanternTry === 'function') { try { api.onGreatLanternTry(id); } catch (e) { G.reportError('gameplay:onGreatLanternTry', e); } }
    else igniteGreat(id);
  }
  function setGreatReady(id, on = true) {
    if (!greats[id] && !G.world?.GREAT_LANTERNS?.some((g) => g.id === id)) return false;
    if (on) gp().glReady[id] = true; else delete gp().glReady[id];
    return true;
  }
  function greatVisual(L, on, instant) {
    L.h?.setLit?.(on, instant);
    if (on && !L.light) L.light = G.elements?.addLight?.({ pos: L.firePos, radius: GREAT_LIGHT_R, intensity: 1.2 }) || null;
    if (!on && L.light) { L.light.remove?.(); L.light = null; }
  }
  /** ★ The lighting moment itself: a great bloom of light, wide permanent light, 'greatlantern:lit'. */
  function igniteGreat(id, o = {}) {
    const L = greats[id];
    if (!L || greatLit(id)) return false;
    G.state.greatLanterns[id] = true;
    delete gp().glReady[id];
    greatVisual(L, true, !!o.instant);
    if (!o.silent) {
      const p = L.firePos;
      G.fx?.burst?.('greatlantern', p, { scale: 0.9, power: 0.7 });
      G.fx?.flash?.(p, PAL.lanternHot, 90, 1.2, 50);
      G.fx?.ring?.(p, { color: PAL.gold, radius: 26, dur: 1.6, y: L.pos.y + 0.2 });
      setTimeout(() => G.fx?.ring?.(p, { color: PAL.lanternWarm, radius: 40, dur: 2.2, y: L.pos.y + 0.3 }), 350);
      G.fx?.sigil?.(L.pos, { color: PAL.gold, radius: 6, dur: 3, y: L.pos.y + 0.15 });
      G.fx?.shake?.(0.35, 0.8);
      G.sky?.flash?.(PAL.lanternHot, 1.2);
      api.pillar(p, 3.2);
      G.hitstop?.(0.08);
      sfx('greatlantern', { pos: p });
    }
    G.events.emit('greatlantern:lit', { id });
    api.markersDirty();
    api.onGreatLit?.(id);
    return true;
  }
  const greatCount = (exclude) => Object.keys(G.state?.greatLanterns || {}).filter((k) => G.state.greatLanterns[k] && k !== exclude).length;

  // ---- rest points, checkpoints ------------------------------------------------------------------------------------
  function initRests() {
    for (const r of RESTS) {
      const a = ANCHORS[r.anchor]; if (!a) continue;
      const pos = G.world.anchor(r.anchor);
      rests[r.id] = { id: r.id, pos, kind: 'rest' };
      if (r.post) buildPost(pos, a.face || 0);
      G.interact?.add({ pos: pos.clone().setY(pos.y + 1), radius: 2.6, priority: 2, prompt: () => t(r.post ? 'gameplay.prompt.restPost' : 'gameplay.prompt.rest'), onInteract: () => rest(r.id) });
    }
  }
  let postProto = null;
  function buildPost(pos, face) {
    if (!postProto) {
      // rest post: a carved stone foot, an iron-banded cedar post, a bracket arm with a brace, and a ribbed paper
      // lantern with lacquered caps, a gold finial and a red tassel (same footprint and lantern position as before)
      const g = new THREE.Group();
      const wood = M.woodDark(), red = M.lacquer(PAL.vermilion), iron = M.iron();
      g.add(lathe([[0, 0], [0.4, 0], [0.42, 0.04], [0.38, 0.1], [0.3, 0.14], [0.24, 0.2], [0.2, 0.22], [0, 0.22]], M.stone(), 0, 0, 0, 12));
      g.add(rcyl(0.09, 0.11, 2.3, wood, 0, 1.3, 0, 10, 0.015));
      for (const y of [0.36, 1.45, 2.2]) g.add(ring(0.104 - y * 0.008, 0.014, iron, 0, y, 0, 14, 4));
      g.add(rbox(0.78, 0.075, 0.08, wood, 0.3, 2.3, 0, 0.015, 1));
      const brace = rbox(0.05, 0.42, 0.05, wood, 0.16, 2.1, 0, 0.01, 1); brace.rotation.z = 0.75; g.add(brace);
      g.add(rcyl(0.06, 0.08, 0.05, wood, 0, 2.47, 0, 10, 0.01), sphere(0.05, M.gold(), 0, 2.53, 0, 8, 6));
      g.add(tube([[0.55, 2.27, 0], [0.555, 2.22, 0], [0.55, 2.17, 0]], 0.008, M.rope(), 4, 4));
      const paper = paperLantern(0.2, 0.42, glow(PAL.lanternWarm, 2.6), M.woodDark(), 6, 16); paper.position.set(0.55, 1.92, 0); paper.traverse((o) => { o.castShadow = false; }); g.add(paper);
      g.add(rcyl(0.12, 0.13, 0.05, red, 0.55, 2.15, 0, 14, 0.012), rcyl(0.13, 0.12, 0.05, red, 0.55, 1.69, 0, 14, 0.012));
      g.add(cone(0.035, 0.07, M.gold(), 0.55, 2.2, 0, 8));
      g.add(tube([[0.55, 1.66, 0], [0.552, 1.6, 0], [0.55, 1.52, 0]], 0.012, M.ropeRed(), 4, 5), sphere(0.03, M.ropeRed(), 0.55, 1.5, 0, 6, 4));
      postProto = g;
    }
    const b = bakeStatic(postProto.clone());
    b.position.copy(pos); b.position.x += Math.sin(face + Math.PI / 2) * 1.4; b.position.z += Math.cos(face + Math.PI / 2) * 1.4;
    b.rotation.y = face;
    G.scene.add(b);
    // draw-call pass: eight draws near, a two-draw stand-in (lit + glow) beyond 100 m (outside the night lamp-pool map)
    b.updateMatrixWorld(true);
    G.structures?.standIn?.(b, 100)?.catch?.((e) => G.reportError('gameplay:post:far', e));
    G.world.addCollider?.({ x: b.position.x, z: b.position.z, r: 0.2, y0: pos.y - 1, y1: pos.y + 2.4, tag: 'gameplay' });
    G.elements?.addLight?.({ pos: b.position.clone().setY(pos.y + 1.9), radius: 10, intensity: 0.8 });
  }
  function setCheckpoint(id, announce = true) {
    const r = rests[id]; if (!r || !G.state) return false;
    const c = G.state.checkpoint || (G.state.checkpoint = {});
    // stand beside a lantern (not inside it)
    let x = r.pos.x, z = r.pos.z;
    if (r.kind === 'lantern') { const a = Math.atan2(r.pos.x - (G.player?.pos.x ?? r.pos.x + 1), r.pos.z - (G.player?.pos.z ?? r.pos.z)); x -= Math.sin(a) * 1.8; z -= Math.cos(a) * 1.8; }
    c.id = id; c.x = x; c.z = z;
    gp().checkpointId = id;
    G.events.emit('checkpoint', { id, pos: r.pos.clone() });
    if (announce) toast(t('gameplay.toast.checkpoint'), { icon: 'lantern', dur: 2 });
    return true;
  }
  /** Rest at a rest point: checkpoint + full heal + save + toast. */
  function rest(id) {
    const P = G.player;
    setCheckpoint(id, false);
    if (P && !P.dead) {
      const missing = Math.max(0, (P.maxHp || 100) - (P.hp || 0));
      if (missing > 0) P.heal?.(missing);
      P.addMana?.(P.maxMana || 100);
      if (P.reactor) { P.reactor.burning = 0; }
      P.playAction?.('kneel_work', { once: true });
    }
    const pos = rests[id]?.pos || P?.pos;
    if (pos) { G.fx?.burst?.('heal', _v.copy(pos).setY(pos.y + 1)); G.fx?.ring?.(pos, { color: PAL.lanternWarm, radius: 3.5, dur: 0.9 }); }
    try { G.save?.write?.(); } catch (e) { G.reportError('gameplay:save', e); }
    toast(t('gameplay.toast.rested'), { icon: 'lantern' });
    return true;
  }

  // ---- death and respawn -------------------------------------------------------------------------------------------
  function onDied() {
    if (respawning) return;
    respawning = true;
    // fade out while she falls; the player system calls respawnPlayer() ~2.8 s after death (or we do it ourselves)
    setTimeout(() => { G.ui?.fade?.(1, 0.9); }, 1500);
    setTimeout(() => { if (G.player?.dead) respawnPlayer(); }, 3300);
  }
  /** ★ Back to the last checkpoint: fade out, small 星屑 loss, revive, fade in. Synchronous revive (safe to call any time). */
  function respawnPlayer() {
    const P = G.player;
    const st = G.state;
    respawning = false;
    if (!P) return false;
    const cp = (st && st.checkpoint) || { x: ANCHORS.spawn.x, z: ANCHORS.spawn.z };
    const W = G.world;
    const x = Number.isFinite(cp.x) ? cp.x : ANCHORS.spawn.x, z = Number.isFinite(cp.z) ? cp.z : ANCHORS.spawn.z;
    const y = W.groundAt(x, z, W.heightAt(x, z) + 3);
    if (P.onBroom) P.dismountBroom?.();
    if (P.revive) P.revive(x, y, z);
    else { P.teleport?.(x, y, z); P.dead = false; P.hp = P.maxHp; G.events.emit('player:respawn', {}); }
    // the toll
    const purse = (st && st.inventory && st.inventory.stardust) || 0;
    const loss = Math.min(DEATH_TOLL.max, Math.floor(purse * DEATH_TOLL.frac));
    if (loss > 0) addItem(G, 'stardust', -loss);
    if (st && st.stats) st.stats.deaths = (st.stats.deaths || 0) + 1;
    G.terrain?.settle?.();
    G.ui?.fade?.(0, 1.1);
    setTimeout(() => {
      toast(t('gameplay.toast.revived'), { icon: 'lantern', dur: 2.4 });
      if (loss > 0) toast(t('gameplay.toast.lostDust', { n: loss }), { icon: 'stardust', dur: 2.4 });
    }, 500);
    G.fx?.burst?.('heal', _v.set(x, y + 1, z));
    return true;
  }

  // ---- restore + update ----------------------------------------------------------------------------------------------
  function restore() {
    for (const id in stones) setLitVisual(stones[id], isLit(id), true);
    for (const id in greats) greatVisual(greats[id], greatLit(id), true);
    respawning = false;
  }
  function update(dt) {
    // ready great lanterns breathe: a soft ring every ~3 s while the player is near
    for (const id in greats) {
      const L = greats[id];
      if (greatLit(id) || !gp().glReady[id]) continue;
      L.pulseT -= dt;
      if (L.pulseT <= 0) {
        L.pulseT = 2.6;
        if (G.player && L.pos.distanceTo(G.player.pos) < 90) {
          G.fx?.ring?.(L.pos, { color: PAL.gold, radius: 5, dur: 1.6, y: L.pos.y + 0.12 });
          G.fx?.burst?.('hit_sun', L.firePos, { scale: 0.5 });
        }
      }
    }
    // remember lanterns once seen (for the map)
    if ((G.time.frame & 31) === 0 && G.player) {
      const seen = gp().seen;
      for (const id in stones) if (!seen[id] && stones[id].pos.distanceTo(G.player.pos) < 60) { seen[id] = true; api.markersDirty(); }
    }
  }

  function init() { initStones(); initGreats(); initRests(); }

  return {
    stones, greats, rests, init, restore, update, onDied,
    light, douse, isLit, litCount, igniteGreat, setGreatReady, greatLit, greatCount, tryGreat, rest, setCheckpoint, respawnPlayer,
  };
}
