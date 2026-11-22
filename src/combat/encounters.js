// Journey encounters: streams the camps, named elites, a light sprinkle of roamers along the road and the lake shore,
// air ambushes on broom riders and the occasional pickpocket. Story-aware:
//   armed  — only once she has left home as a witch (quest 'apprentice' done; ?foes=1 / C.forceArmed for tests)
//   calm   — any non-play mode, the eclipse crossing over the lake, a running dialogue / spar / clearing trial:
//            foes stop, forget her and drift home (C.calm), nothing new spawns and ambushers leave
//   never  — inside NO_FOES (home, Fran's forest, the city), on warded ground or near a story anchor
// Save: G.state.combat = { cleared: {campId: playTime}, elites: {id: playTime}, seen: {type: true} }.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp, TAU, mulberry32 } from '../core/util.js';
import { CAMPS, ELITES, SPRINKLE, SHORE, NO_FOES } from '../data/camps.js';
import { ROAD_ACROSS, JOURNEY_ANCHORS } from '../data/journey-map.js';
import { makeElite } from './wards.js';

const _v = new THREE.Vector3();
const SPAWN_R = 88, SPAWN_R_AIR = 120, DESPAWN_R = 150;
const RANDOM_AFFIX = ['frenzy', 'warded', 'bulwark', 'blink', 'leech', 'volatile'];

export function inNoFoes(x, z, pad = 0) {
  for (const n of NO_FOES) if (Math.hypot(x - n.x, z - n.z) < n.r + pad) return true;
  return false;
}
/** May a foe stand at (x, z)? */
export function spotOk(x, z) {
  const W = G.world;
  if (inNoFoes(x, z, 10)) return false;
  if (W.isWater(x, z) || (W.slopeAt?.(x, z) ?? 0) > 0.55 || (W.protectionAt?.(x, z) ?? 0) > 0.01) return false;
  for (const a of Object.values(JOURNEY_ANCHORS)) if (Math.hypot(x - a.x, z - a.z) < 35) return false;
  return true;
}

export function createEncounters(C) {
  const camps = CAMPS.map((c) => ({ ...c, alive: new Set(), spawned: false }));
  const elites = ELITES.map((c) => ({ ...c, alive: new Set(), spawned: false }));
  let sprinkles = null, shore = null;
  let acc = 0, ambush = null, nextAmbushT = 60, ambushRollT = 0, thief = null, nextThiefT = 150, thiefRollT = 0;
  const E = { camps, elites, get sprinkles() { return sprinkles; }, get ambush() { return ambush; }, get thief() { return thief; } };

  const st = () => {
    const s = G.state;
    if (!s) return null;
    s.combat ||= {};
    s.combat.cleared ||= {}; s.combat.elites ||= {}; s.combat.seen ||= {};
    return s.combat;
  };
  const now = () => G.state?.playTime ?? G.time.t;
  function armed() {
    if (C.forceArmed || G.params?.foes === '1') return true;
    if (!G.quests) return true;
    return !!G.quests.isDone?.('apprentice');
  }
  function calm() {
    if (G.mode !== 'play') return true;
    const S = G.story;
    if (S?.busy || S?.spar?.active || S?.finale?.active || G.dialogue?.active) return true;
    // the eclipse crossing: the lake step of episode two, anywhere near the lake
    const step = S?.current?.()?.id;
    if (step === 'lake') { const P = G.player; if (P && Math.hypot(P.pos.x - 1725, P.pos.z + 48) < 420) return true; }
    if (G.journeyWeather?.state?.eclipse > 0.05) return true;
    return false;
  }

  // ---- placement -------------------------------------------------------------------------------------------------------
  function ring(x, z, r, i, n, out) {
    for (let k = 0; k < 8; k++) {
      const a = (i / Math.max(1, n)) * TAU + Math.random() * 0.7 + k * 0.9;
      const d = r * (0.3 + 0.6 * Math.random());
      out.set(x + Math.cos(a) * d, NaN, z + Math.sin(a) * d);
      if (spotOk(out.x, out.z)) return out;
    }
    return out.set(x, NaN, z);
  }
  function spawnGroup(g, kinds, opts = {}) {
    let total = 0;
    for (const [, n] of kinds) total += n;
    if (C.MAX_ACTIVE - C.enemies.length < total) return false;
    let i = 0;
    const made = [];
    for (const [type, n] of kinds) for (let k = 0; k < n; k++) {
      ring(g.x, g.z, g.r || 8, i++, total, _v);
      const e = C.spawn(type, _v, { camp: g, element: opts.element, hpMul: opts.hpMul });
      if (!e) continue;
      e.encounter = g;
      g.alive.add(e);
      made.push(e);
    }
    return made;
  }
  function despawnGroup(g) {
    for (const e of g.alive) C.despawn(e);
    g.alive.clear();
    g.spawned = false;
  }
  function spawnCamp(c) {
    const made = spawnGroup(c, c.kinds);
    if (!made) return;
    c.spawned = true;
    c.engaged = false;
    if (made.length) {
      if (c.leader) makeElite(made[0], c.leader.affixes);
      else if (Math.random() < 0.18) {
        const e = made[(Math.random() * made.length) | 0];
        makeElite(e, [RANDOM_AFFIX[(Math.random() * RANDOM_AFFIX.length) | 0]]);
      }
      if (made[0].type === 'wolf' && made[0].elite) made[0].data.leader = true;
    }
  }
  function spawnElite(el) {
    const e = C.spawn(el.type, _v.set(el.x, NaN, el.z), { camp: el, hpMul: el.hp ?? 1.5, element: el.element, wardEl: el.wardEl });
    if (!e) return;
    e.encounter = el; e.named = el.id;
    el.alive.add(e);
    makeElite(e, el.affixes);
    if (e.type === 'wolf') e.data.leader = true;
    if (el.escorts) { const m = spawnGroup(el, el.escorts); if (m) for (const x of m) x.encounter = el; }
    el.spawned = true;
  }

  // ---- the sprinkle --------------------------------------------------------------------------------------------------------
  function buildSprinkles() {
    const out = [];
    const rng = mulberry32(2207);
    const dens = clamp(G.quality?.density ?? 1, 0.35, 1);
    let carry = 0, side = 1;
    for (let i = 0; i < ROAD_ACROSS.length - 1; i++) {
      const [ax, az] = ROAD_ACROSS[i], [bx, bz] = ROAD_ACROSS[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let s = carry; s < len; ) {
        const x = ax + ux * s, z = az + uz * s;
        const zone = SPRINKLE.find((q) => x <= q.from && x > q.to);
        const step = zone ? zone.every : 80;
        if (zone && rng() < dens) {
          side = -side;
          const off = 22 + rng() * 34;
          const px = x - uz * off * side, pz = z + ux * off * side;
          const k = (rng() * zone.kinds.length) | 0, kn = (rng() * zone.night.length) | 0;
          if (spotOk(px, pz)) out.push({ id: 'spr' + out.length, x: px, z: pz, r: 6, day: zone.kinds[k], night: zone.night[kn], alive: new Set(), spawned: false, clearedAt: -1e9, respawn: 150 + rng() * 60 });
        }
        s += step;
        carry = s - len;
      }
    }
    return out;
  }
  function buildShore() {
    const out = [];
    const rng = mulberry32(41);
    for (let i = 0; i < SHORE.n; i++) {
      const a = (i / SHORE.n) * TAU + rng() * 0.4, r = SHORE.r * (0.95 + rng() * 0.15);
      const x = SHORE.x + Math.cos(a) * r, z = SHORE.z + Math.sin(a) * r;
      if (!spotOk(x, z)) continue;
      const kind = SHORE.kinds[(rng() * SHORE.kinds.length) | 0];
      out.push({ id: 'shore' + i, x, z, r: 7, day: kind, night: 'wisp', alive: new Set(), spawned: false, clearedAt: -1e9, respawn: 200 });
    }
    return out;
  }
  function spawnSpot(s) {
    const night = (G.env?.light ?? 1) < 0.35;
    const type = night ? s.night : s.day;
    const n = type === 'wolf' ? 2 : type === 'paper' && Math.random() < 0.5 ? 2 : 1;
    const made = spawnGroup(s, [[type, n]]);
    if (made) s.spawned = true;
  }

  // ---- air ambush ----------------------------------------------------------------------------------------------------------
  function tryAmbush(P, force) {
    if (ambush || G.time.t < nextAmbushT || !P.onBroom) return;
    if (P.pos.x > 1000 || P.pos.x < -1600) return;
    const alt = P.pos.y - G.world.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
    if (alt > 34 || alt < 1.5 || P.speed < 5 || P.hp < 45) return;
    if ((ambushRollT -= 1) > 0) return;
    ambushRollT = 4;
    if (Math.random() > 0.2) return;
    const raiders = force ? force === 'raiders' : P.pos.x < 500 && Math.random() < 0.4;
    const kinds = raiders ? [['raider', P.pos.x < -900 ? 2 : 1]] : [['moth', 3 + ((Math.random() * 2) | 0)]];
    const a = P.yaw + (Math.random() - 0.5) * 1.0, dist = 60;
    const x = P.pos.x + Math.sin(a) * dist, z = P.pos.z + Math.cos(a) * dist;
    if (inNoFoes(x, z, 40)) return;
    const g = { id: 'ambush', x, z, r: 6, alive: new Set(), t: 0, farT: 0, retreating: false };
    let total = 0;
    for (const [, n] of kinds) total += n;
    if (C.MAX_ACTIVE - C.enemies.length < total) return;
    for (const [type, n] of kinds) for (let k = 0; k < n; k++) {
      _v.set(x + (Math.random() - 0.5) * 8, P.pos.y + 3 + Math.random() * 3, z + (Math.random() - 0.5) * 8);
      const e = C.spawn(type, _v, { aggro: true, snap: false });
      if (!e) continue;
      e.encounter = g; e.ambush = g; e.mercyFloor = 25;
      e.data.dy = Math.max(0, _v.y - G.world.groundAt(_v.x, _v.z) - e.hover);
      g.alive.add(e);
      G.fx?.burst('summon', e.centerOut(_v), { color: raiders ? 0x8a2a2a : 0xff8a6a, scale: 0.7 });
    }
    if (!g.alive.size) return;
    ambush = g;
    G.ui?.toast?.(t(raiders ? 'combat.ambush.raiders' : 'combat.ambush.bats'), { dur: 3 });
    G.events.emit('combat:ambush', { kind: raiders ? 'raiders' : 'bats', count: g.alive.size });
  }
  function updateAmbush(dt, P, isCalm) {
    const g = ambush;
    if (!g) return;
    for (const e of g.alive) if (e.dead) g.alive.delete(e);
    g.t += dt;
    if (!g.alive.size) { ambush = null; nextAmbushT = G.time.t + 110 + Math.random() * 60; return; }
    let near = false;
    for (const e of g.alive) if (e.pos.distanceTo(P.pos) < 85) near = true;
    g.farT = near ? 0 : g.farT + dt;
    const outran = g.farT > 4;
    if (!g.retreating && (isCalm || P.hp <= 28 || g.t > 70 || outran || P.dead || inNoFoes(P.pos.x, P.pos.z))) {
      g.retreating = true; g.rt = 0;
      if (!isCalm && !P.dead) G.ui?.toast?.(t(outran ? 'combat.ambush.outran' : 'combat.ambush.retreat'), { dur: 2.5 });
      for (const e of g.alive) { e.aggro = false; e.stopAttack(); e.data.leaving = true; }
    }
    if (g.retreating) {
      g.rt += dt;
      for (const e of g.alive) {
        // up and away
        e.data.dy = (e.data.dy || 0) + dt * 6;
        _v.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize();
        e.move.set(_v.x * 12, 0, _v.z * 12);
      }
      if (g.rt > 2.5 || outran) {
        for (const e of g.alive) { G.fx?.burst('summon', e.centerOut(_v), { color: 0xd0c0ff, scale: 0.6 }); C.despawn(e); }
        g.alive.clear();
        ambush = null;
        nextAmbushT = G.time.t + 110 + Math.random() * 60;
      }
    }
  }

  // ---- the pickpocket ------------------------------------------------------------------------------------------------------
  function tryThief(P) {
    if (thief || G.time.t < nextThiefT || P.onBroom || C.inCombat) return;
    if (P.pos.x > 600 || P.pos.x < -1100 || P.speed < 0.8) return;
    const inv = G.state?.inventory || {};
    if ((inv.stardust || 0) < 15 && !(inv.dango > 0)) return;
    if ((thiefRollT -= 1) > 0) return;
    thiefRollT = 6;
    if (Math.random() > 0.15) return;
    const back = P.yaw + Math.PI + (Math.random() - 0.5) * 0.8;
    const x = P.pos.x + Math.sin(back) * 26, z = P.pos.z + Math.cos(back) * 26;
    if (!spotOk(x, z)) return;
    const e = C.spawn('thief', _v.set(x, NaN, z), { yaw: back + Math.PI });
    if (!e) return;
    thief = e;
    nextThiefT = G.time.t + 420 + Math.random() * 200;
    G.ui?.toast?.(t('combat.thief.appear'), { dur: 2.5 });
  }

  // ---- first meetings --------------------------------------------------------------------------------------------------------
  G.events.on('enemy:aggro', ({ enemy: e }) => {
    const s = st();
    if (!s || !e || s.seen[e.type]) return;
    s.seen[e.type] = true;
    if (e.type === 'wolf') G.ui?.toast?.(t('combat.hint.pack'), { dur: 4.5 });
    else if (e.type === 'golem') G.ui?.toast?.(t('combat.hint.armor'), { dur: 4 });
    else if (e.ward) G.ui?.toast?.(t('combat.ward.hint', { el: t('core.element.' + e.ward.el), counter: t('core.element.' + (G.combat?.counterOf?.(e.ward.el)?.[0] || 'fire')) }), { dur: 4.5 });
    G.events.emit('combat:firstMeet', { type: e.type });
  });
  G.events.on('combat:ambush', () => {
    const s = st();
    if (!s || s.seen.ambushHint) return;
    s.seen.ambushHint = true;
    C.after(3.2, () => G.ui?.toast?.(t('combat.hint.broom', { key: G.input?.keyLabel?.('lock') || '' }), { dur: 4.5 }));
  });
  G.events.on('enemy:killed', ({ enemy: e }) => {
    if (!e) return;
    const s = st();
    if (e.named && s) {
      s.elites[e.named] = now();
      G.ui?.toast?.(t('combat.eliteDown', { name: t('combat.elite.' + e.named) }), { dur: 3.5 });
      G.gameplay?.spawnPickup?.('dango', e.pos, 1);
      G.gameplay?.spawnPickup?.('stardust', e.pos, 30);
      G.events.emit('combat:elite', { id: e.named });
    }
    if (e === thief) thief = null;
  });

  E.update = function (dt) {
    const P = G.player;
    if (!P || !P.pos) return;
    const isCalm = calm();
    C.calm = isCalm;
    updateAmbush(dt, P, isCalm);
    if (thief && (thief.dead || !C.enemies.includes(thief))) thief = null;
    acc -= dt;
    if (acc > 0) return;
    acc = 0.5;
    const s = st();
    const live = armed() && !isCalm && !P.dead;
    const pr = P.onBroom ? SPAWN_R_AIR : SPAWN_R;
    const tnow = now();
    // camps
    for (const c of camps) {
      for (const e of c.alive) if (e.dead) c.alive.delete(e);
      const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z);
      if (c.spawned && c.alive.size === 0) { c.spawned = false; if (s) s.cleared[c.id] = tnow; if (c.engaged) G.events.emit('combat:campCleared', { id: c.id }); }
      if (c.spawned) { for (const e of c.alive) if (e.aggro) c.engaged = true; }
      const ready = !s || !(s.cleared[c.id] > 0) || tnow - s.cleared[c.id] > c.respawn || s.cleared[c.id] > tnow;
      if (!c.spawned && live && d < pr && ready && C.campsEnabled) spawnCamp(c);
      else if (c.spawned && d > DESPAWN_R) despawnGroup(c);
    }
    // named elites
    for (const el of elites) {
      for (const e of el.alive) if (e.dead) el.alive.delete(e);
      if (el.spawned && el.alive.size === 0) el.spawned = false;
      const d = Math.hypot(P.pos.x - el.x, P.pos.z - el.z);
      const beaten = s && s.elites[el.id] > 0;
      if (!el.spawned && !beaten && live && d < pr + 20 && C.campsEnabled) spawnElite(el);
      else if (el.spawned && d > DESPAWN_R + 30) despawnGroup(el);
    }
    // sprinkle + shore
    if (!sprinkles) { sprinkles = buildSprinkles(); shore = buildShore(); }
    let small = 0;
    for (const sp of sprinkles) small += sp.alive.size;
    const shoreOpen = !!G.state?.flags?.journey_eclipse_peak;
    for (const list of [sprinkles, shoreOpen ? shore : null]) {
      if (!list) continue;
      for (const sp of list) {
        for (const e of sp.alive) if (e.dead) sp.alive.delete(e);
        if (sp.spawned && sp.alive.size === 0) { sp.spawned = false; sp.clearedAt = G.time.t; }
        const d = Math.hypot(P.pos.x - sp.x, P.pos.z - sp.z);
        if (!sp.spawned && live && d < pr - 5 && small < 8 && G.time.t - sp.clearedAt > sp.respawn && C.campsEnabled && C.enemies.length < C.MAX_ACTIVE - 6) { spawnSpot(sp); small += sp.alive.size; }
        else if (sp.spawned && d > DESPAWN_R) despawnGroup(sp);
      }
    }
    if (live) { tryAmbush(P); tryThief(P); }
  };
  E.clear = function () {
    for (const c of camps) despawnGroup(c);
    for (const el of elites) despawnGroup(el);
    for (const list of [sprinkles, shore]) if (list) for (const sp of list) { despawnGroup(sp); sp.clearedAt = -1e9; }
    if (ambush) { for (const e of ambush.alive) C.despawn(e); ambush = null; }
    if (thief) { C.despawn(thief); thief = null; }
  };
  E.armed = armed;
  E.calm = calm;
  E.stats = () => ({ camps: camps.filter((c) => c.spawned).map((c) => c.id), elites: elites.filter((c) => c.spawned).map((c) => c.id),
    sprinkle: sprinkles ? sprinkles.filter((s) => s.spawned).length : 0, sprinkleSpots: sprinkles ? sprinkles.length : 0, ambush: ambush ? ambush.alive.size : 0, thief: !!thief, armed: armed(), calm: C.calm });
  /** Tests: force an ambush / a thief right now. */
  E.forceAmbush = (kind = 'bats') => { nextAmbushT = 0; ambushRollT = 0; const r = Math.random; Math.random = () => 0.01; try { tryAmbush(G.player, kind); } finally { Math.random = r; } return ambush; };
  E.forceThief = () => { nextThiefT = 0; thiefRollT = 0; const r = Math.random; Math.random = () => 0.01; try { tryThief(G.player); } finally { Math.random = r; } return thief; };
  return E;
}
