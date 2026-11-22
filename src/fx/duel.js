// G.fx.duel — duel cinematics: the beats that make a magic duel read like the anime. Visual / pacing only; it never
// changes damage, aim rules or outcomes. Everything is optional and toggle-safe:
//   G.settings.cinematic === false  → no slow motion, no camera liberties, no impact frames (shake still follows
//                                      G.settings.shake through G.fx.shake)
//
//   slowmo(scale, hold, out)   a slow beat: time eases down to `scale` in 50 ms, holds `hold` real seconds, eases back
//                              over `out` (writes G.time.slow, read by the frame loop; never stacks past the deepest)
//   impact(color, k)           an impact frame: a 1–2 frame tint of the whole screen through G.sky.flash
//   shake(weight, pos?)        shake profiles 'tap' | 'light' | 'medium' | 'heavy' | 'massive' (or a number 0..1),
//                              attenuated by distance from the camera when pos is given; heavier ones kick the FOV
//   gust(pos, dir, strength, dur)  a visual-only wind puff: the heroine's hair, robe and cape lift (cloth reads visualWindAt)
//   angle(target, opts)        a brief dramatic camera angle on a point (side-on, low, a little tighter), then back
//   engage(foe) / disengage()  explicit duel framing target (auto: Fran's spar, G.combat.duel, a live boss)
//   beat(kind, pos, opts)      the composed moments: 'parry' 'block' 'dodge' 'clash' 'finisher' 'cast' 'break'
//   camAssist(C, P, rdt, idle) / camShot(pos, look, rdt, cine)   called by the orbit camera (src/player/camera.js)
// It also listens: spell:clash (block / perfect reflect / clashes), player:dodge (perfect dodge), beam:struggle end,
// enemy:killed / boss:defeated (finishers), the end of a G.combat duel and of Fran's spar, and Fran's aim (her wind-up
// grows a magic circle at her hand that flares when she throws).
import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDiff, smoothstep } from '../core/util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _hit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), body: null, surface: '', owner: null };
const _ic = new THREE.Color(), _ic2 = new THREE.Color();
const _g0 = new THREE.Vector3(), _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), _g3 = new THREE.Vector3(), _tg = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const GOLD = 0xffd98a;
const SHAKE = { tap: [0.07, 0.14, 0], light: [0.15, 0.22, 0.08], medium: [0.28, 0.32, 0.18], heavy: [0.48, 0.45, 0.3], massive: [0.72, 0.7, 0.45] };
const FRAN_EL = ['wind', 'ice', 'water'];

export function installDuel(G, fx, X) {
  const T = G.time;
  const on = () => G.settings?.cinematic !== false;
  const motion = () => G.settings?.shake !== false;
  const kit = () => fx.kit;
  const camD = (p) => p.distanceTo(G.camera.position);
  const ground = (p) => X.ground(p.x, p.z, p.y);
  const playing = () => G.mode === 'play';

  // ---- slow motion ----------------------------------------------------------------------------------------------------
  const SL = { phase: 0, scale: 1, hold: 0, out: 0.3, t: 0, from: 1, k: 1 };
  function slowmo(scale = 0.3, hold = 0.2, out = 0.35) {
    if (!on() || !playing() || !(scale < 1)) return false;
    scale = clamp(scale, 0.06, 1);
    if (SL.phase === 1) { SL.scale = Math.min(SL.scale, scale); SL.hold = Math.max(SL.hold, SL.t + hold); SL.out = Math.max(SL.out, out); return true; }
    SL.phase = 1; SL.scale = scale; SL.hold = hold; SL.out = Math.max(0.05, out); SL.t = 0; SL.from = SL.k;
    return true;
  }
  function updSlow(rdt) {
    if (SL.phase === 0) { if (T.slow !== undefined && T.slow !== 1) T.slow = 1; return; }
    if (!playing()) { SL.phase = 0; SL.k = 1; T.slow = 1; return; }
    SL.t += rdt;
    if (SL.phase === 1) {
      const e = Math.min(1, SL.t / 0.05);
      SL.k = SL.from + (SL.scale - SL.from) * e * e * (3 - 2 * e);
      if (SL.t >= SL.hold + 0.05) { SL.phase = 2; SL.t = 0; SL.from = SL.k; }
    } else {
      const e = Math.min(1, SL.t / SL.out);
      SL.k = SL.from + (1 - SL.from) * e * e * (3 - 2 * e);
      if (e >= 1) { SL.phase = 0; SL.k = 1; }
    }
    T.slow = SL.k;
  }

  // ---- impact frames, shake profiles, gusts ---------------------------------------------------------------------------
  let lastImpact = -9;
  function impact(color = 0xffffff, k = 1) {
    if (!on() || !G.sky?.flash) return false;
    const now = T.real;
    if (now - lastImpact < 0.3) return false;           // never a strobe
    lastImpact = now;
    _ic.set(color).lerp(_ic2.setRGB(1, 1, 1), 0.25).multiplyScalar(0.5 * clamp(k, 0, 1.5) * (motion() ? 1 : 0.5));
    G.sky.flash(_ic, 0.12);
    return true;
  }
  function shake(w = 'medium', pos) {
    const p = typeof w === 'number' ? [clamp(w, 0, 1), 0.2 + w * 0.5, w * 0.45] : SHAKE[w] || SHAKE.medium;
    let k = 1;
    if (pos) { const d = camD(pos); k = 1 - smoothstep(12, 60, d); }
    if (k <= 0.01) return;
    fx.shake(p[0] * k, p[1]);
    if (p[2] && motion() && on()) G.cam?.fovKick?.(p[2] * k);
  }
  function gust(pos, dir, strength = 9, dur = 0.9, radius = 3.5) {
    const aw = G.elements?.addWind;
    if (!aw || !pos) return null;
    try { return aw({ kind: 'gust', visual: true, pos, dir: dir || UP, radius, strength, duration: dur }); } catch (e) { return null; }
  }

  // ---- duel framing: keep both duelists in view --------------------------------------------------------------------------
  const DF = { foe: null, explicit: null, w: 0, assist: false, mid: new THREE.Vector3(), fpos: new THREE.Vector3(), L: 0 };
  function posOf(f, out) {
    const p = f && (f.pos || f.group?.position);
    if (!p) return null;
    return out.set(p.x, p.y + (f.height || 1.6) * 0.62, p.z);
  }
  function autoFoe() {
    const ex = DF.explicit;
    if (ex && !ex.dead && ex.alive !== false) return ex;
    DF.explicit = null;
    const sp = G.story?.spar;
    if (sp?.active) { const n = G.npcs?.get?.('fran'); if (n?.pos) return n; }
    const d = G.combat?.duel;
    if (d && !d.over && d.enemy && !d.enemy.dead) return d.enemy;
    return null;
  }
  function camAssist(C, P, rdt, idle) {
    if (!on() || !P) { DF.w = damp(DF.w, 0, 4, rdt); return 0; }
    const f = DF.foe;
    const ok = !!f && playing() && !P.onBroom && P.state !== 'swim' && !G.spells?.struggle && posOf(f, DF.fpos) && DF.fpos.distanceTo(P.pos) < 42;
    DF.w = damp(DF.w, ok ? 1 : 0, ok ? 2.5 : 4, rdt);
    if (DF.w < 0.01 || !ok) return 0;
    const dx = DF.fpos.x - P.pos.x, dz = DF.fpos.z - P.pos.z, L = Math.hypot(dx, dz);
    DF.L = L;
    DF.mid.set((P.pos.x + DF.fpos.x) * 0.5, (P.pos.y + 1.2 + DF.fpos.y) * 0.5, (P.pos.z + DF.fpos.z) * 0.5);
    // the foe drifted out of the frame and the mouse is idle: swing round behind her, the foe a little right of centre
    if (L > 1.5 && idle > 0.45 && !G.combat?.lockTarget) {
      const want = Math.atan2(dx, dz) + Math.PI + 0.2;
      const off = Math.abs(angleDiff(C.yaw, want));
      if (off > 0.62) DF.assist = true; else if (off < 0.14) DF.assist = false;
      if (DF.assist) C.yaw = dampAngle(C.yaw, want, 2.2 * DF.w, rdt);
    } else DF.assist = false;
    // close duels pull the camera back a little so both bodies and the space between them read
    return DF.w * clamp(0.45 + (10 - L) * 0.16, 0.25, 1.5);
  }

  // ---- dramatic angle ----------------------------------------------------------------------------------------------------
  const AN = { on: false, t: 0, dur: 0.8, pos: new THREE.Vector3(), look: new THREE.Vector3(), w: 0.85, fov: -7, cd: 0 };
  const RC = { out: _hit };
  function free(from, to) {
    _g3.subVectors(to, from); const L = _g3.length(); if (L < 0.1) return true; _g3.divideScalar(L);
    const h = G.physics?.raycast ? G.physics.raycast(from, _g3, L, RC) : null;
    if (h && h.surface !== 'character' && !(h.body && h.body.mass < 6)) return false;
    const W = G.world;
    if (W?.raycastGround && W.raycastGround(from, _g3, L, 0.2) < L - 0.3) return false;
    // tree trunks, posts and walls are world colliders (cylinders / boxes), not physics bodies: keep the line and the spot clear
    const cs = W?.colliders;
    if (cs) {
      const ax = from.x, az = from.z, bx = to.x, bz = to.z, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const minX = Math.min(ax, bx) - 3, maxX = Math.max(ax, bx) + 3, minZ = Math.min(az, bz) - 3, maxZ = Math.max(az, bz) + 3;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (c.dead || c.x < minX || c.x > maxX || c.z < minZ || c.z > maxZ) continue;
        const r = (c.box ? Math.max(c.hw || 0, c.hd || 0) : c.r || 0) + 0.7;
        const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / l2));
        const px = ax + dx * t - c.x, pz = az + dz * t - c.z;
        if (px * px + pz * pz > r * r) continue;
        const y = from.y + (to.y - from.y) * t;
        if (y > (c.y0 ?? -1e9) - 1 && y < (c.y1 ?? 1e9) + 1) return false;
      }
    }
    return true;
  }
  function angle(target, o = {}) {
    if (!on() || !motion() || !target || !playing() || G.cam?.cinematicActive) return false;
    if (T.real < AN.cd) return false;
    const P = G.player; if (!P) return false;
    if (camD(target) > (o.range ?? 40)) return false;
    target = _tg.copy(target);
    // side-on to the line from her to the target, low, looking at the target
    const fw = _g0.subVectors(target, P.pos); fw.y = 0;
    if (fw.lengthSq() < 0.04) fw.set(Math.sin(P.yaw || 0), 0, Math.cos(P.yaw || 0));
    const span = Math.min(30, fw.length()); fw.normalize();
    const side = _g1.set(-fw.z, 0, fw.x);
    // keep the side the camera already sees from
    const cp = G.camera.position;
    if ((cp.x - P.pos.x) * side.x + (cp.z - P.pos.z) * side.z < 0) side.negate();
    const dist = o.dist ?? Math.max(4.2, span * 0.45 + 3);
    const spot = _g2;
    for (let tries = 0; tries < 2; tries++) {
      spot.copy(P.pos).lerp(target, o.mix ?? 0.55).addScaledVector(side, dist).addScaledVector(fw, -dist * 0.25);
      const gy = G.world?.groundAt ? G.world.groundAt(spot.x, spot.z, spot.y + 3) : spot.y;
      spot.y = Math.max(gy + (o.low ?? 0.9), Math.min(P.pos.y, target.y) + (o.low ?? 0.9));
      _d.copy(target); _d.y += 0.2;
      if (free(_d, spot)) {
        AN.pos.copy(spot); AN.look.copy(target).lerp(P.pos, 0.3); AN.look.y = target.y + 0.4;
        AN.on = true; AN.t = 0; AN.dur = o.dur ?? 0.8; AN.w = o.weight ?? 0.85; AN.fov = o.fov ?? -7;
        AN.cd = T.real + AN.dur + (o.cooldown ?? 2.5);
        return true;
      }
      side.negate();
    }
    return false;
  }
  function camShot(pos, look, rdt, cine) {
    let fovOff = 0;
    // a light pull of the look point toward the middle of the duel (both duelists stay in the frame)
    if (DF.w > 0.01 && !cine) look.lerp(DF.mid, 0.12 * DF.w);
    if (!AN.on) return 0;
    if (cine || !playing()) { AN.on = false; return 0; }
    AN.t += rdt;
    const e = smoothstep(0, 0.12, AN.t) * (1 - smoothstep(AN.dur - 0.3, AN.dur, AN.t));
    if (AN.t >= AN.dur) { AN.on = false; return 0; }
    pos.lerp(AN.pos, AN.w * e); look.lerp(AN.look, AN.w * e);
    fovOff = AN.fov * e;
    return fovOff;
  }

  // ---- the composed beats ---------------------------------------------------------------------------------------------
  let parryCd = 0, dodgeCd = 0, clashCd = 0;
  function beat(kind, pos, o = {}) {
    try { return beats[kind]?.(pos, o) ?? false; } catch (e) { G.reportError('fx.duel.beat:' + kind, e); return false; }
  }
  const beats = {
    /** perfect guard: gold starburst, the ward rings out, a slow beat, a gold impact frame */
    parry(pos, o) {
      if (!pos) return false;
      const col = o.color ?? GOLD, n = o.normal || _d.subVectors(G.camera.position, pos).normalize();
      fx.starburst(pos, { radius: 2.3, color: col, intensity: 1.25, dur: 0.4 });
      fx.ward(o.center || pos, n, { radius: 1.55, color: col, intensity: 1.3, dur: 0.42 });
      fx.circle(pos, { normal: n, radius: 1.15, color: col, layers: 15, dur: 0.42, draw: 0.06, out: 'flare', outDur: 0.3, intensity: 1.2, spin: 3 });
      const K = kit();
      if (K) { K.shock(pos, 2.4, col, { up: n, dur: 0.3, width: 0.12, I: 1.8 }); K.shock(pos, 3.6, 0xffffff, { up: n, dur: 0.42, width: 0.06, I: 1.4, delay: 0.05 }); }
      fx.burst('sparkle_hang', pos, { color: col, scale: 1.1 });
      fx.burst('glint_burst', pos, { color: col, dir: n, scale: 1.2 });
      if (T.real > parryCd) { parryCd = T.real + 1.1; slowmo(0.22, 0.2, 0.42); }
      impact(col, 0.8);
      shake('medium', pos);
      return true;
    },
    /** a plain block: the hex lattice of the ward lights up from the blow */
    block(pos, o) {
      if (!pos) return false;
      const col = o.color ?? GOLD, n = o.normal || _d.subVectors(G.camera.position, pos).normalize();
      fx.ward(o.center || pos, n, { radius: 1.35, color: col, intensity: 1.5, dur: 0.3 });
      kit()?.shock(pos, 1.3, col, { up: n, dur: 0.22, width: 0.16, I: 1.5 });
      fx.burst('glint_burst', pos, { color: col, dir: n, scale: 0.7 });
      shake('light', pos);
      return true;
    },
    /** a dodge right under a bullet: a short slow beat, a ring of wind where she was */
    dodge(pos, o) {
      if (!pos || T.real < dodgeCd) return false;
      dodgeCd = T.real + 1.2;
      const d = o.dir || UP;
      kit()?.shock(pos, 1.6, 0xeafff4, { up: d, dur: 0.3, width: 0.12, I: 1.3 });
      fx.burst('sparkle_hang', pos, { color: 0xe6fff2, scale: 0.7 });
      slowmo(0.35, 0.16, 0.32);
      return true;
    },
    /** two spells collide: a big one gets a slow beat, a two-colour impact frame and a dramatic angle */
    clash(pos, o) {
      if (!pos) return false;
      const near = camD(pos) < 30;
      if (o.big && near && T.real > clashCd) {
        clashCd = T.real + 1.6;
        slowmo(0.3, 0.18, 0.4);
        _ic.set(o.color ?? 0xffffff).lerp(_ic2.set(o.color2 ?? 0xffffff), 0.5);
        impact(_ic.getHex(), 0.7);
        angle(pos, { dur: 0.75, dist: 5, mix: 0.7, cooldown: 3 });
        shake('heavy', pos);
      }
      return true;
    },
    /** the decisive hit: a deep slow beat, an impact frame, a starburst, an angle on the fallen foe */
    finisher(pos, o) {
      if (!pos) return false;
      const col = o.color ?? GOLD;
      slowmo(0.2, o.hold ?? 0.42, 0.6);
      impact(col, 1);
      shake('heavy', pos);
      fx.starburst(pos, { radius: 3.2, color: col, intensity: 1.6, dur: 0.45 });
      fx.burst('sparkle_hang', pos, { color: col, scale: 1.6 });
      const K = kit();
      if (K) { K.shock(pos, 4.5, col, { up: _d.subVectors(G.camera.position, pos).normalize(), dur: 0.45, width: 0.1, I: 1.8 }); }
      gust(pos, UP, 10, 0.9, 6);
      if (pos.y - ground(pos) < 3) fx.burst('dust_ring', _b.set(pos.x, ground(pos) + 0.1, pos.z), { scale: 1.3 });
      if (o.angle !== false) angle(pos, { dur: 1.05, cooldown: 2, fov: -9, mix: 0.78, dist: 4.6 });
      return true;
    },
    /** a struggle breaks: one deep beat */
    break(pos, o) {
      slowmo(0.22, 0.32, 0.55);
      if (pos) { impact(o.color ?? 0xffffff, 1); shake('massive', pos); }
      return true;
    },
  };

  // ---- the beat right before a decisive hit: a charged bullet about to land on the duel foe (or on her) ------------------
  const IN = { last: 0, cd: 0 };
  function watchIncoming() {
    const list = G.spells?.projectiles, P = G.player;
    if (!list || !P || T.real < IN.cd) return;
    const foe = DF.foe;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p?.alive || p.id === IN.last) continue;
      const mine = p.team === 'player';
      if (p.form !== 'big' && !(mine ? false : p.power >= 1.6)) continue;
      const tgt = mine ? (foe ? posOf(foe, _b) : null) : _b.copy(P.pos).setY(P.pos.y + 1);
      if (!tgt) continue;
      _a.subVectors(tgt, p.pos);
      const d = _a.length();
      if (d > 3.6 || d < 0.4) continue;
      const closing = p.vel.dot(_a) / d;
      if (closing < 4 || d / closing > 0.35) continue;
      IN.last = p.id; IN.cd = T.real + 2.2;
      slowmo(mine ? 0.28 : 0.35, 0.16, 0.3);
      if (mine) angle(tgt, { dur: 0.7, cooldown: 2.5, mix: 0.75 });
      return;
    }
  }

  // ---- Fran's wind-up: a circle grows at her hand while she aims, flares when she throws -----------------------------------
  const FW = { aim: null, h: null, t: 0, look: 0, el: 'wind', big: false, find: 0 };
  function franAim() {
    if (FW.aim && FW.aim.parent) return FW.aim;
    if (T.real < FW.find) return null;
    FW.find = T.real + 1.5;
    FW.aim = G.scene.getObjectByName('journey:fran-aim') || null;
    return FW.aim;
  }
  function updFran(dt) {
    const sp = G.story?.spar;
    const aim = sp?.active ? franAim() : null;
    const winding = !!aim && aim.visible;
    if (winding && !FW.h) {
      const st = sp.stats;                     // once per wind-up (an allocation, not per frame)
      FW.el = FRAN_EL[(st?.fired || 0) % 3]; FW.big = !!st?.phase; FW.t = 0;
      const col = fx.elementColor(FW.el, 0xe2b974);
      aim.getWorldPosition(_a);
      aim.getWorldDirection(_b);
      FW.h = fx.circle(_a, { normal: _b, radius: FW.big ? 1.2 : 0.95, color: col, handle: true, charge: 0, spin: 1.8, intensity: 1.5, layers: FW.big ? 15 : 11 });
      if (FW.big) FW.g = fx.circle(_c.copy(_a), { ground: true, radius: 2.1, color: col, handle: true, charge: 0, spin: 0.9, intensity: 1.2, layers: 15 });
    }
    if (FW.h && winding) {
      FW.t += dt;
      aim.getWorldPosition(FW.h.pos);
      aim.getWorldDirection(FW.h.normal);
      FW.h.pos.addScaledVector(FW.h.normal, 0.25);
      FW.h.charge = Math.min(1.05, FW.t / (FW.big ? 0.75 : 1.1));
      if (FW.g) { const n = G.npcs?.get?.('fran'); if (n?.pos) { FW.g.pos.set(n.pos.x, ground(n.pos) + 0.07, n.pos.z); } FW.g.charge = FW.h.charge; }
    } else if (FW.h) {
      const thrown = !!sp?.active;
      FW.h.release(thrown ? 'flare' : 'collapse', thrown ? 0.32 : 0.2);
      FW.g?.release(thrown ? 'fade' : 'collapse', thrown ? 0.5 : 0.2);
      if (thrown) {
        const col = fx.elementColor(FW.el, 0xe2b974);
        fx.burst('glint_burst', FW.h.pos, { color: col, dir: FW.h.normal, scale: 0.9 });
        kit()?.shock(FW.h.pos, FW.big ? 1.8 : 1.3, col, { up: FW.h.normal, dur: 0.26, width: 0.14, I: 1.6 });
        if (FW.big) shake('light', FW.h.pos);
      }
      FW.h = null; FW.g = null;
    }
  }

  // ---- listeners ------------------------------------------------------------------------------------------------------
  function guardNear(pos) {
    const gs = G.spells?.guards;
    if (!gs || !pos) return null;
    let best = null, bd = 9;
    for (let i = 0; i < gs.length; i++) { const g = gs[i]; if (!g?.center) continue; const d = g.center.distanceToSquared(pos); if (d < bd) { bd = d; best = g; } }
    return best;
  }
  function onClash(e) {
    if (!e?.pos || camD(e.pos) > 120) return;
    if (e.result === 'reflect' || e.result === 'block') {
      const g = guardNear(e.pos);
      const n = g ? g.fwd : null;
      const c = g ? _c.copy(g.center).addScaledVector(g.fwd, 0.55) : null;
      const col = fx.elementColor('sun', GOLD);
      if (e.result === 'reflect' && (e.defender === G.player || !e.defender)) beat('parry', e.pos, { normal: n, center: c, color: col });
      else if (e.result === 'reflect') { fx.ward(c || e.pos, n || UP, { radius: 1.5, color: col, dur: 0.35 }); fx.starburst(e.pos, { radius: 1.8, color: col }); }
      else beat('block', e.pos, { normal: n, center: c, color: col });
    }
  }
  function onDodge() {
    const P = G.player, list = G.spells?.projectiles;
    if (!P || !list) return;
    // a bullet within reach and closing: the dodge was a close one
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p?.alive || p.team === 'player') continue;
      _a.subVectors(P.pos, p.pos); _a.y += 1;
      const d = _a.length();
      if (d > 4.2) continue;
      const closing = p.vel.dot(_a) / Math.max(1e-3, d);
      if (closing > 3 && d / closing < 0.5) { beat('dodge', _b.copy(P.pos).setY(P.pos.y + 1), { dir: _c.copy(p.vel).normalize() }); return; }
    }
  }
  function onKilled(e) {
    const en = e?.enemy;
    if (!en || !e.pos) return;
    if (en.boss || en.elite) beat('finisher', _a.copy(e.pos).setY(e.pos.y + (en.height || 1.6) * 0.6), { color: fx.elementColor(typeof e.by === 'string' ? e.by : null, GOLD) });
  }
  // ends of fights we poll (no events carry the moment of the last hit)
  const W = { duel: null, fired: false, spar: false, franPos: new THREE.Vector3(), franH: 1.6 };
  function watchEnds() {
    const d = G.combat?.duel;
    if (d !== W.duel) { W.duel = d || null; W.fired = false; }
    if (d && d.over && !W.fired) {
      W.fired = true;
      if (d.won && d.enemy?.pos) beat('finisher', posOf(d.enemy, _a), { color: fx.elementColor(d.cfg?.el, GOLD) });
    }
    const sp = G.story?.spar;
    const active = !!sp?.active;
    if (active) { const n = G.npcs?.get?.('fran'); if (n?.pos) { W.franPos.copy(n.pos); W.franH = n.height || 1.7; } }   // where she stood at the last hit
    else if (W.spar && sp?.last?.result === 'break') beat('finisher', _a.copy(W.franPos).setY(W.franPos.y + W.franH * 0.62), { color: 0xe2b974 });
    W.spar = active;
  }

  G.events.on('spell:clash', (e) => { try { onClash(e); } catch (err) { G.reportError('fx.duel.clash', err); } });
  G.events.on('player:dodge', () => { try { onDodge(); } catch (err) { G.reportError('fx.duel.dodge', err); } });
  G.events.on('enemy:killed', (e) => { try { onKilled(e); } catch (err) { G.reportError('fx.duel.kill', err); } });
  G.events.on('boss:defeated', () => { try { const P = G.player; if (P) beat('finisher', _a.copy(P.pos).setY(P.pos.y + 1.2), { angle: false, hold: 0.3 }); } catch (err) { G.reportError('fx.duel.boss', err); } });
  // the struggle's clash point, remembered while it lasts (the 'end' event carries no position)
  const SP = new THREE.Vector3(); let spOn = false;
  G.events.on('beam:struggle', (e) => { try { if (e?.state === 'end' && e.why !== 'stopped') beat('break', spOn ? SP : null, {}); } catch (err) { G.reportError('fx.duel.struggle', err); } });

  return {
    slowmo, impact, shake, gust, angle, beat,
    engage(foe) { DF.explicit = foe || null; },
    disengage() { DF.explicit = null; },
    get focus() { return DF.foe; },
    get slow() { return SL.k; },
    get enabled() { return on(); },
    camAssist, camShot,
    update(dt, rdt) {
      try {
        updSlow(rdt);
        DF.foe = autoFoe();
        const sg = G.spells?.struggle; spOn = !!sg?.pos; if (spOn) SP.copy(sg.pos);
        if (dt > 0) { updFran(dt); if (on() && (DF.foe || G.combat?.inCombat)) watchIncoming(); }
        watchEnds();
      } catch (err) { G.reportError('fx.duel.update', err); }
    },
    clear() {
      SL.phase = 0; SL.k = 1; T.slow = 1; AN.on = false; DF.explicit = null;
      FW.h = null; FW.g = null;
    },
  };
}
