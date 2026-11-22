// Mage-duel moves shared by Fran's spar, the bandit mages, broom raiders and the clearing trial — the vocabulary of a
// Wandering-Witch style magic fight. Every move is announced (a circle at the hand, a ring on the ground, a sigil) and
// every bolt is a real spells projectile: it can be guarded, reflected with a well-timed shield, and clashed mid-air.
//
//   c (caster context) = { owner, team = 'enemy', alive() -> bool, hand(out) -> Vector3, data: {...merged into bolts},
//                          power = 1, onShot(p), dmgK = 1 }
//   volley(c, target, o)     luminous magic bullets in a fan or a stream
//   lightning(c, points, o)  marked circles, then lightning out of a clear sky
//   rockBarrage(c, target,o) shards of rock tear out of the ground around the caster, hang, then fly
//   starRain(c, center, o)   a bombardment of bolts falling from above onto a marked area
//   seal(c, at, o)           a rune at the target's feet that bursts (a counter element dispels it)
//   counterCast(c, proj, o)  a bolt of the countering element sent to meet an incoming spell mid-air
// Each returns a handle { cancel() } that stops the pieces still waiting. updatePatterns(dt) drives the flying rocks.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { clamp, TAU, mulberry32 } from '../core/util.js';
import { toon } from '../core/mats.js';
import { after, warnAt, hurtPlayer, playerAlive } from './attacks.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();
export const EL_COL = { fire: 0xff8a3a, water: 0x58c6ff, ice: 0xbfefff, wind: 0x9ff0c0, thunder: 0xc39bff, earth: 0xd6a96a, sun: 0xffd27a, moon: 0xc8b8ff, star: 0xffe9b0 };
/** The element that answers an incoming spell in the air (steam, cancel, conduct …). */
export const ANSWER = { fire: 'water', water: 'thunder', ice: 'fire', sun: 'moon', moon: 'sun', earth: 'wind', wind: 'earth', thunder: 'earth' };

function handOf(c, out) {
  if (c.hand) return c.hand(out);
  const o = c.owner;
  return out.set(o.pos.x + Math.sin(o.yaw || 0) * 0.5, o.pos.y + (o.height || 1.6) * 0.75, o.pos.z + Math.cos(o.yaw || 0) * 0.5);
}
function tpos(target, out) {
  if (!target) return null;
  if (target.isVector3) return out.copy(target);
  const p = target.pos;
  if (!p) return null;
  return out.set(p.x, p.y + (target.height || 1.6) * 0.55, p.z);
}
/** Move aim point p (in place) to where a target moving at v will meet a shot of speed s from `from` (k = how much to trust it). */
export function intercept(from, p, v, s, k = 1) {
  const dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z;
  const a = v.x * v.x + v.y * v.y + v.z * v.z - s * s, b = 2 * (dx * v.x + dy * v.y + dz * v.z), c = dx * dx + dy * dy + dz * dz;
  let tt;
  if (Math.abs(a) < 1e-6) tt = b < 0 ? -c / b : Math.sqrt(c) / s;
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return p;
    const r = Math.sqrt(disc), t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a);
    tt = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  }
  if (!(tt > 0) || !isFinite(tt)) return p;
  tt = Math.min(tt, 2);
  return p.set(p.x + v.x * tt * k, p.y + v.y * tt * 0.5 * k, p.z + v.z * tt * k);
}
function handle() {
  const h = { dead: false, cancel() { h.dead = true; } };
  return h;
}
function later(h, c, sec, fn) {
  return after(sec, () => { if (!h.dead && (!c.alive || c.alive())) { try { fn(); } catch (e) { G.reportError('combat:pattern', e); } } });
}
/** One bolt (a spells projectile, so it guards / reflects / clashes). */
export function bolt(c, from, dir, o = {}) {
  const el = o.el || 'sun';
  const p = G.spells?.shoot?.({
    el, shape: o.shape || 'orb', origin: from, dir, speed: o.speed ?? 15, size: o.size ?? 0.32, radius: o.radius,
    color: o.color ?? EL_COL[el] ?? 0xffe9b0, team: c.team || 'enemy', owner: c.owner, damage: Math.round((o.damage ?? 9) * (c.dmgK ?? 1)),
    power: o.power ?? c.power ?? 0.8, life: o.life ?? 3, turn: o.turn ?? 0, target: o.turn ? o.target : null, gravity: o.gravity || 0,
    splash: o.splash ?? 0.6, trail: o.trail ?? { color: o.color ?? EL_COL[el] ?? 0xffe9b0, color2: 0xffffff, width: (o.size ?? 0.32) * 0.5, life: 0.28, intensity: 1.8 },
    spell: o.spell || 'duel_bolt', data: Object.assign({}, c.data, o.data),
  });
  if (p) c.onShot?.(p);
  return p;
}

/** Magic bullets: n of them, fanned over `fan` radians, `gap` seconds apart. o: { n=5, fan=0.6, gap=0.08, delay=0, ...bolt opts, rise } */
export function volley(c, target, o = {}) {
  const h = handle();
  const n = o.n ?? 5, fan = o.fan ?? 0.6, gap = o.gap ?? 0.08;
  for (let i = 0; i < n; i++) {
    later(h, c, (o.delay ?? 0) + i * gap, () => {
      const from = handOf(c, new THREE.Vector3());
      if (!tpos(target, _t)) return;
      // lead a moving target (a rider on a broom is gone before a straight shot arrives)
      const tv = target.vel;
      let turn = o.turn ?? 0.35;
      if (tv && o.lead !== false) {
        intercept(from, _t, tv, o.speed ?? 15, 0.9);
        // homing would drag a led shot back onto where a fast target was: against a rider, trust the lead (dodge by turning)
        if (tv.x * tv.x + tv.z * tv.z > 36) turn = 0;
      }
      _d.subVectors(_t, from);
      const k = n > 1 ? i / (n - 1) - 0.5 : 0;
      const order = o.sweep ? k : (i % 2 ? 1 : -1) * Math.ceil(i / 2) / Math.max(1, Math.ceil((n - 1) / 2)) * 0.5;
      _d.applyAxisAngle(G.scene.up, fan * order);
      if (o.rise) _d.y += o.rise * _d.length();
      _d.normalize();
      bolt(c, from, _d.clone(), Object.assign({}, o, { turn, target }));
      if (i === 0 || i % 3 === 0) G.audio?.sfx('cast_' + (o.el === 'sun' || !o.el ? 'wind' : o.el), { pos: from, vol: 0.4, pitch: 1.3 });
    });
  }
  return h;
}

/** Lightning on each point after `delay` (ground warning first). o: { delay=1.0, radius=2.2, damage=14, stagger=0.18, color } */
export function lightning(c, points, o = {}) {
  const h = handle();
  const col = o.color ?? EL_COL.thunder, r = o.radius ?? 2.2, delay = o.delay ?? 1.0;
  points.forEach((pt, i) => {
    const at = pt.clone();
    at.y = G.world.groundAt(at.x, at.z, at.y + 3);
    const d = delay + i * (o.stagger ?? 0.18);
    later(h, c, i * (o.stagger ?? 0.18) * 0.5, () => warnAt(at, r, d - i * (o.stagger ?? 0.18) * 0.5, col));
    later(h, c, d, () => {
      _w.copy(at); _w.y += 26;
      G.fx?.lightning?.(_w, at, { color: col, branches: 3, dur: 0.22, width: 0.6 });
      G.fx?.burst('hit_thunder', at, { scale: 1.3 });
      G.fx?.flash?.(at, col, 90, 0.18, 16);
      G.fx?.ring?.(at, { color: col, radius: r, dur: 0.35, intensity: 2 });
      G.audio?.sfx('thunder', { pos: at, vol: 0.8 });
      G.fx?.shake?.(0.16, 0.2);
      strikePlayer(c, at, r, o.damage ?? 14, 'thunder');
    });
  });
  return h;
}
/** Area hit on the player only (enemy spells never scar the ground here). Guarding toward the caster softens it. */
function strikePlayer(c, at, r, dmg, el) {
  if (!playerAlive()) return;
  const P = G.player;
  const dx = P.pos.x - at.x, dz = P.pos.z - at.z, dy = P.pos.y - at.y;
  if (dx * dx + dz * dz > r * r || dy > 3.2 || dy < -1.5) return;
  const src = c.owner;
  G.player.takeDamage?.(Math.round(dmg * (c.dmgK ?? 1)), { element: el, from: src && src.pos ? src : at, knock: 2.5, source: src });
  if (el) G.elements?.apply(el, _v.set(P.pos.x, P.pos.y + 1, P.pos.z), 0.8, 0.6, { team: c.team || 'enemy', source: src, damage: 0, noGround: true });
}

// ---- rock barrage -----------------------------------------------------------------------------------------------------
const rocks = [];   // { p (projectile), id, mesh, spin }
let rockGeo = null, rockMat = null;
const rockPool = [];
function rockMesh() {
  if (!rockGeo) { rockGeo = new THREE.DodecahedronGeometry(0.42, 0); rockMat = toon(0x9a8268); }
  const m = rockPool.pop() || new THREE.Mesh(rockGeo, rockMat);
  m.castShadow = true;
  m.visible = true;
  G.scene.add(m);
  return m;
}
/** Rocks tear out of the ground around the caster, hang for `rise` s, then fly at the target. o: { n=5, rise=0.75, speed=21, damage=12, ring=2.6 } */
export function rockBarrage(c, target, o = {}) {
  const h = handle();
  const n = o.n ?? 5, o0 = c.owner.pos;
  const rng = mulberry32((G.time.frame * 31) | 0);
  const yaw = c.owner.yaw || 0;
  for (let i = 0; i < n; i++) {
    const a = yaw + (i / Math.max(1, n - 1) - 0.5) * 2.4 + (rng() - 0.5) * 0.3;
    const at = new THREE.Vector3(o0.x + Math.sin(a) * (o.ring ?? 2.6), 0, o0.z + Math.cos(a) * (o.ring ?? 2.6));
    at.y = G.world.groundAt(at.x, at.z, o0.y + 3);
    later(h, c, i * 0.07, () => {
      G.fx?.burst('shatter_rock', at, { scale: 0.7 });
      G.fx?.burst('dust', at, { scale: 0.6 });
      G.audio?.sfx('shatter_rock', { pos: at, vol: 0.35, pitch: 1.3 });
      // the shard: an earth bolt that hangs (slow upward drift) until it is thrown
      const p = bolt(c, at.clone().setY(at.y + 0.4), _d.set(0, 1, 0), { el: 'earth', speed: 2.4, size: 0.14, radius: 0.42, life: 6, damage: o.damage ?? 12, power: 1, turn: 0, trail: null, splash: 0.9, color: EL_COL.earth });
      if (!p) return;
      p.data.rock = true;
      const mesh = rockMesh();
      mesh.scale.setScalar(0.7 + rng() * 0.6);
      rocks.push({ p, id: p.id, mesh, spin: new THREE.Vector3(rng() * 4, rng() * 4, rng() * 4) });
      later(h, c, (o.rise ?? 0.75) + (n - i) * 0.03 + i * 0.09, () => {
        if (!p.alive || p.id !== rocks.find((r) => r.p === p)?.id) return;
        if (!tpos(target, _t)) return;
        _d.subVectors(_t, p.pos);
        const dist = _d.length();
        const sp = o.speed ?? 21;
        _d.multiplyScalar(sp / Math.max(0.01, dist));
        _d.y += 0.5 * 5 * (dist / sp);   // a slight lob that the gravity takes back out
        p.vel.copy(_d); p.speed = p.vel.length(); p.gravity = 5; p.age = 0; p.life = 3;
        G.audio?.sfx('cast_earth', { pos: p.pos, vol: 0.35, pitch: 1.2 });
      });
    });
  }
  return h;
}

/** Bombardment from above: n bolts fall onto marked spots around `center` (radius). o: { n=8, radius=6, delay=0.9, gap=0.1, damage=10, el='sun' } */
export function starRain(c, center, o = {}) {
  const h = handle();
  const n = o.n ?? 8, R = o.radius ?? 6, el = o.el || 'sun';
  const rng = mulberry32((G.time.frame * 17 + n) | 0);
  const cx = (center.pos || center).x, cz = (center.pos || center).z, cy = (center.pos || center).y;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = i === 0 ? 0 : Math.sqrt(rng()) * R;
    const at = new THREE.Vector3(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d);
    at.y = G.world.groundAt(at.x, at.z, cy + 3);
    const t0 = i * (o.gap ?? 0.1);
    later(h, c, t0, () => warnAt(at, 1.5, o.delay ?? 0.9, o.color ?? EL_COL[el]));
    later(h, c, t0 + Math.max(0.1, (o.delay ?? 0.9) - 0.45), () => {
      const from = at.clone(); from.y += 12; from.x += (rng() - 0.5) * 2;
      _d.subVectors(at, from).normalize();
      bolt(c, from, _d.clone(), { el, speed: 27, size: 0.36, damage: o.damage ?? 10, turn: 0, life: 1.2, splash: 1.4, color: o.color });
    });
  }
  return h;
}

/** A rune under the target that bursts after `delay`. A hit of `o.answer` (default: ANSWER-like counter) dispels it.
 *  o: { el='fire', radius=1.7, delay=1.6, damage=14, answer } -> handle (+ .seal) */
export function seal(c, at, o = {}) {
  const h = handle();
  const el = o.el || 'fire', r = o.radius ?? 1.7, delay = o.delay ?? 1.6;
  const pos = at.clone();
  pos.y = G.world.groundAt(pos.x, pos.z, pos.y + 2);
  const col = EL_COL[el] ?? 0xffffff;
  const marks = [];
  warnAt(pos, r, delay, col, marks);
  G.fx?.sigil?.(pos, { color: col, radius: r * 0.7, dur: delay, spin: 2, tracked: false });
  const answers = [].concat(o.answer || []);
  const off = G.events.on('element:applied', (ev) => {
    if (h.dead || !ev || ev.team !== 'player' || !answers.includes(ev.element) || !ev.pos) return;
    if (Math.hypot(ev.pos.x - pos.x, ev.pos.z - pos.z) > r + (ev.radius || 1) + 0.5) return;
    h.cancel(); off();
    for (const m of marks) { try { m?.(); } catch (e) { /* tracked fx */ } }
    G.fx?.burst('clash', pos.clone().setY(pos.y + 0.4), { color: EL_COL[ev.element], color2: col, scale: 0.9 });
    G.audio?.sfx('steam_sizzle', { pos, vol: 0.6 });
    o.onDispel?.();
  });
  later(h, c, delay, () => {
    off();
    G.fx?.burst('hit_' + el, pos.clone().setY(pos.y + 0.5), { scale: 1.3 });
    G.fx?.ring?.(pos, { color: col, radius: r + 0.4, dur: 0.35, intensity: 2 });
    G.audio?.sfx('explosion_small', { pos, vol: 0.6 });
    strikePlayer(c, pos, r + 0.1, o.damage ?? 14, el);
  });
  later(h, c, delay + 0.05, () => off());
  return h;
}

/** Answer an incoming player spell with the countering element so the two meet mid-air. Returns the bolt or null. */
export function counterCast(c, proj, o = {}) {
  if (!proj || !proj.alive) return null;
  const el = o.el || ANSWER[proj.el] || 'sun';
  const from = handOf(c, new THREE.Vector3());
  // lead: where the incoming spell will be when ours gets there
  const sp = o.speed ?? 26;
  const dist = from.distanceTo(proj.pos);
  const tt = dist / (sp + proj.vel.length());
  _t.copy(proj.pos).addScaledVector(proj.vel, tt);
  _d.subVectors(_t, from).normalize();
  const id = proj.id;
  const proxy = { pos: proj.pos, height: 1e-6, get alive() { return proj.alive && proj.id === id; } };
  const p = bolt(c, from, _d.clone(), { el, speed: sp, size: o.size ?? 0.4, turn: 6, target: proxy, damage: o.damage ?? 8, power: o.power ?? 1.1, life: 1.6, data: { counter: true } });
  G.fx?.burst('charge_done', from, { color: EL_COL[el], scale: 0.7 });
  G.audio?.sfx('cast_' + (el === 'sun' || el === 'moon' ? 'wind' : el), { pos: from, vol: 0.6 });
  return p;
}

/** The nearest player spell projectile flying at `pos` within `range` (or null). */
export function incomingAt(pos, range = 12, minDot = 0.8) {
  const list = G.spells?.projectiles;
  if (!list) return null;
  let best = null, bd = range;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive || p.team !== 'player') continue;
    const dx = pos.x - p.pos.x, dy = pos.y - p.pos.y, dz = pos.z - p.pos.z, d = Math.hypot(dx, dy, dz);
    if (d > bd || d < 0.8) continue;
    const vl = p.vel.length();
    if (vl < 1 || (p.vel.x * dx + p.vel.y * dy + p.vel.z * dz) / (d * vl) < minDot) continue;
    best = p; bd = d;
  }
  return best;
}

let lastFrame = -1;
/** Keep the barrage rocks on their bolts (call every frame; safe to call twice). */
export function updatePatterns(dt) {
  if (G.time.frame === lastFrame) return;
  lastFrame = G.time.frame;
  for (let i = rocks.length - 1; i >= 0; i--) {
    const r = rocks[i];
    if (!r.p.alive || r.p.id !== r.id) {
      if (r.mesh.visible) { G.fx?.burst('shatter_rock', r.mesh.position, { scale: 0.5 }); }
      r.mesh.visible = false; r.mesh.parent?.remove(r.mesh); rockPool.push(r.mesh);
      rocks.splice(i, 1);
      continue;
    }
    r.mesh.position.copy(r.p.pos);
    r.mesh.rotation.x += r.spin.x * dt; r.mesh.rotation.y += r.spin.y * dt; r.mesh.rotation.z += r.spin.z * dt;
  }
}
export function clearPatterns() {
  for (const r of rocks) { r.mesh.visible = false; r.mesh.parent?.remove(r.mesh); rockPool.push(r.mesh); }
  rocks.length = 0;
}
export { handOf, tpos, strikePlayer };
