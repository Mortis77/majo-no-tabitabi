// The projectile world: a pool of flying spells with element, power, team and owner. Each frame they steer (homing),
// fall (arcs), slow down inside 月晕 bubbles, and test their swept path against guards (block / perfect reflect),
// hostile reactors, the physics world (bodies, statics, land), water and each other (飞弹相克, §3.2 / §3.3).
import * as THREE from 'three';
import { G } from '../core/game.js';
import { clamp } from '../core/util.js';

const MAX = 120;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _n = new THREE.Vector3();
const _hit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), body: null, surface: '', owner: null };
const _impact = { reactor: null, body: null, point: new THREE.Vector3(), normal: new THREE.Vector3(), water: false, ground: false, reason: '' };

/** Is reactor r a valid hostile target for something on `team`? */
export function hostileReactor(r, team) {
  return !!r && !!r.team && r.team !== 'neutral' && r.team !== team && !r.dead;
}

/** Centre point of anything targetable (reactor, enemy, player, Vector3). */
export function targetPoint(t, out) {
  if (!t) return null;
  if (t.isVector3) return out.copy(t);
  if (t.reactor && t.reactor.cy !== undefined && !t.pos) t = t.reactor;
  if (t.cy !== undefined && t.pos && t.radius !== undefined && t.material) return out.set(t.pos.x, t.cy, t.pos.z); // reactor
  const p = t.pos || (t.group && t.group.position);
  if (!p) return null;
  return out.set(p.x, p.y + (t.height || 1.6) * 0.55, p.z);
}

export function createProjectiles(S) {
  const pool = [];
  const list = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({
      alive: false, id: 0, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(),
      el: 'fire', shape: 'orb', color: 0xffffff, size: 0.4, radius: 0.4, power: 1, team: 'player', owner: null, life: 0, age: 0,
      gravity: 0, target: null, turn: 0, speed: 0, pierce: 0, hits: new Set(), def: null, trail: null, emitter: null, damage: 10,
      spell: '', form: 'small', spin: 0, k: 1, data: null, deflected: 0, reflected: false,
    });
  }
  let nextId = 1;

  const api = {
    list,
    get count() { return list.length; },
    /**
     * spawn({ el, shape:'orb'|'lance'|'charm', pos, vel, color, size, radius, power, team, owner, life, gravity,
     *         target, turn, pierce, def:{ impact(p, hit), expire?(p), clash? }, trail:{...}|null, emitter:name|null,
     *         damage, spell, form, data })
     */
    spawn(o) {
      let p = pool.pop();
      if (!p) { // pool exhausted: recycle the oldest
        p = list[0]; api.release(p, 'recycle');
        p = pool.pop();
        if (!p) return null;
      }
      p.alive = true; p.id = nextId++;
      p.el = o.el || 'fire'; p.shape = o.shape || 'orb'; p.color = o.color ?? 0xffffff;
      p.size = o.size ?? 0.4; p.radius = o.radius ?? p.size; p.power = o.power ?? 1; p.team = o.team || 'player';
      p.owner = o.owner || null; p.life = o.life ?? 3; p.age = 0; p.gravity = o.gravity || 0; p.target = o.target || null;
      p.turn = o.turn || 0; p.pierce = o.pierce || 0; p.hits.clear(); p.def = o.def || null; p.damage = o.damage ?? 10;
      p.spell = o.spell || p.el; p.form = o.form || 'small'; p.spin = Math.random() * 6; p.k = 1; p.data = o.data || null;
      p.deflected = 0; p.reflected = false;
      p.pos.copy(o.pos); p.prev.copy(o.pos); p.vel.copy(o.vel); p.speed = p.vel.length();
      p.trail = null; p.emitter = null;
      if (o.trail && G.fx?.trail) { try { p.trail = G.fx.trail({ pos: p.pos, style: 'band', ...o.trail }); } catch (e) { p.trail = null; } }
      if (o.emitter && G.fx?.emitter) { try { p.emitter = G.fx.emitter(o.emitter, { color: o.emitterColor ?? p.color, scale: o.emitterScale ?? 1, rate: o.emitterRate ?? 1 }); p.emitter.pos.copy(p.pos); } catch (e) { p.emitter = null; } }
      try { G.fx?.magic?.projStart?.(p); } catch (e) { /* visual only */ }
      list.push(p);
      return p;
    },
    release(p, reason = 'hit') {
      if (!p || !p.alive) return;
      p.alive = false;
      const i = list.indexOf(p);
      if (i >= 0) list.splice(i, 1);
      if (p.trail) { try { p.trail.stop(); } catch (e) { /* ignore */ } p.trail = null; }
      if (p.emitter) { try { p.emitter.remove(); } catch (e) { /* ignore */ } p.emitter = null; }
      try { G.fx?.magic?.projEnd?.(p); } catch (e) { /* visual only */ }
      p.target = null; p.owner = null; p.def = null; p.data = null; p.hits.clear();
      pool.push(p);
    },
    clear() { while (list.length) api.release(list[list.length - 1], 'clear'); },
    /** Hostile projectiles near pos within r (for wind deflection, guards). */
    each(fn) { for (let i = list.length - 1; i >= 0; i--) fn(list[i]); },
    update(dt) {
      if (!(dt > 0)) return;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        if (!p || !p.alive) continue;
        try { step(p, dt); } catch (e) { G.reportError('spells:projectile', e); api.release(p, 'error'); }
      }
      clashes();
    },
    draw(V) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const fl = 1 + Math.sin(p.age * 40 + p.id) * 0.08;
        if (p.shape === 'charm') {
          V.look(_q, p.vel);
          _q2.setFromAxisAngle(_n.set(0, 0, 1), p.spin + p.age * 14);
          _q.multiply(_q2);
          _q2.setFromAxisAngle(_n.set(1, 0, 0), Math.PI / 2);
          _q.multiply(_q2);
          V.charms.add(p.pos, _q, 1, 1, 1, 0xffffff, 1);
          V.halos.add(p.pos, null, 0.32 * fl, null, null, p.color, 0.8);
        } else if (p.shape === 'lance') {
          V.look(_q, p.vel);
          V.lances.add(p.pos, _q, p.size * 0.6, p.size * 0.6, p.size * 1.1, p.color, 1.8);
          V.halos.add(p.pos, _q, p.size * 0.8, p.size * 0.8, p.size * 2.2, p.color, 0.45);
        } else if (p.el === 'fire' || p.el === 'water') {
          // the shaped body (fx magic: rolling fireball / thick water drop) carries the look; a small hot heart only
          if (p.el !== 'fire' || !G.fx?.magic?.hasBody?.(p)) V.orbs.add(p.pos, null, p.size * 0.42 * fl, null, null, p.color, 1.4);
          V.halos.add(p.pos, null, p.size * 1.2 * fl, null, null, p.color, 0.3);
        } else {
          V.orbs.add(p.pos, null, p.size * fl, null, null, p.color, 1.9);
          V.halos.add(p.pos, null, p.size * 1.65 * fl, null, null, p.color, 0.75);
        }
        G.fx?.magic?.projDraw?.(p);
      }
    },
  };

  // ---- one projectile ---------------------------------------------------------------------------------------------
  function step(p, dt) {
    const k = S.bubbleScale(p.pos, p.team);
    p.k = k;
    const h = dt * k;
    p.age += h;
    if (p.age > p.life) { expire(p); return; }
    // homing
    if (p.target && p.turn > 0) {
      if (p.target.dead || p.target.alive === false) p.target = null;
      else if (targetPoint(p.target, _t)) {
        _d.subVectors(_t, p.pos);
        const dist = _d.length();
        if (dist > 0.05) {
          _d.multiplyScalar(p.speed / dist);
          p.vel.lerp(_d, clamp(p.turn * h * (1 + 3 / Math.max(1, dist))));
          const l = p.vel.length();
          if (l > 0.01) p.vel.multiplyScalar(p.speed / l);
        }
      }
    }
    if (p.gravity) p.vel.y -= p.gravity * h;
    p.prev.copy(p.pos);
    _a.copy(p.vel).multiplyScalar(h);
    const segLen = _a.length();
    _b.copy(p.pos).add(_a);           // proposed next position

    // guards (shields) first: they are in front of the caster
    if (S.guardCheck(p, p.pos, _b)) return;

    // hostile reactors along the swept segment
    let best = 2, bestR = null;
    if (G.elements?.query) {
      _t.copy(p.pos).addScaledVector(_a, 0.5);
      G.elements.query(_t, segLen * 0.5 + p.radius + 1.8, (r) => {
        if (!hostileReactor(r, p.team) || p.hits.has(r)) return;
        if (p.owner && (r === p.owner.reactor || r.owner === p.owner)) return;
        const tt = segReactor(p.pos, _a, segLen, r, p.radius);
        if (tt >= 0 && tt < best) { best = tt; bestR = r; }
      });
    }
    // world: land, statics, bodies
    let tw = 2, body = null;
    if (segLen > 1e-5) {
      _d.copy(_a).divideScalar(segLen);
      const rc = G.physics?.raycast ? G.physics.raycast(p.pos, _d, segLen + p.radius * 0.5, { out: _hit, exclude: p.data && p.data.excludeBody }) : null;
      if (rc && !(p.age < 0.1 && rc.dist < 0.02 && rc.surface !== 'terrain')) { tw = clamp(rc.dist / segLen, 0, 1); body = rc.body; _n.copy(rc.normal); }
      else if (!G.physics) {
        const g = G.world.groundAt(_b.x, _b.z, _b.y + 0.5);
        if (_b.y < g) { tw = 1; _n.set(0, 1, 0); }
      }
    }
    // water surface
    let tWater = 2;
    if (_b.y < 0.05 && p.pos.y >= 0.05 && G.world.isWater(_b.x, _b.z)) tWater = clamp((p.pos.y - 0.05) / Math.max(1e-4, p.pos.y - _b.y));

    const tMin = Math.min(best, tw, tWater);
    if (tMin <= 1) {
      _impact.point.copy(p.pos).addScaledVector(_a, tMin);
      _impact.reactor = null; _impact.body = null; _impact.water = false; _impact.ground = false;
      if (tMin === best && bestR) {
        _impact.reactor = bestR; _impact.reason = 'reactor'; _impact.normal.copy(_a).normalize().negate();
        p.hits.add(bestR);
        p.pos.copy(_impact.point);
        const keep = p.def?.impact?.(p, _impact) === 'pierce' && p.pierce-- > 0;
        if (!keep) { api.release(p, 'hit'); return; }
        p.pos.copy(_b);
      } else if (tMin === tWater) {
        _impact.water = true; _impact.reason = 'water'; _impact.normal.set(0, 1, 0); _impact.point.y = 0;
        p.pos.copy(_impact.point);
        p.def?.impact?.(p, _impact);
        api.release(p, 'water'); return;
      } else {
        _impact.body = body; _impact.ground = !body; _impact.reason = body ? 'body' : 'ground'; _impact.normal.copy(_n);
        p.pos.copy(_impact.point).addScaledVector(_n, 0.05);
        p.def?.impact?.(p, _impact);
        api.release(p, 'world'); return;
      }
    } else p.pos.copy(_b);

    p.trail?.push(p.pos);
    if (p.emitter) p.emitter.pos.copy(p.pos);
  }

  function expire(p) {
    try { p.def?.expire?.(p); } catch (e) { G.reportError('spells:expire', e); }
    api.release(p, 'expire');
  }

  // swept sphere (segment p0 + a·t, t∈[0,1]) against a reactor's vertical capsule; returns t or -1
  function segReactor(p0, a, len, r, rad) {
    const cx = r.pos.x, cz = r.pos.z, y0 = r.y0, y1 = y0 + (r.height || 1);
    const cy = clamp(p0.y, y0, y1);
    // closest t to the axis point at the segment's mean height
    const ax = cx - p0.x, ay = (y0 + y1) * 0.5 - p0.y, az = cz - p0.z;
    const l2 = Math.max(1e-6, len * len);
    let t = clamp((ax * a.x + ay * a.y + az * a.z) / l2);
    const qx = p0.x + a.x * t, qy = p0.y + a.y * t, qz = p0.z + a.z * t;
    const dh = Math.max(0, Math.hypot(qx - cx, qz - cz) - (r.radius || 0.5));
    const dv = qy < y0 ? y0 - qy : qy > y1 ? qy - y1 : 0;
    void cy;
    return Math.hypot(dh, dv) <= rad ? t : -1;
  }

  // ---- 飞弹相克: hostile projectiles meeting in the air -----------------------------------------------------------
  function clashes() {
    const n = list.length;
    if (n < 2) return;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a || !a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b || !b.alive || b.team === a.team) continue;
        const rr = a.radius + b.radius + 0.35;
        // swept: closest approach of the two motion segments this frame
        if (segSeg(a.prev, a.pos, b.prev, b.pos) > rr * rr) continue;
        S.clash(a, b);
        if (!a.alive) break;
      }
    }
  }

  return api;
}

// squared distance between segments p1-q1 and p2-q2
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
export function segSeg(p1, q1, p2, q2) {
  _d1.subVectors(q1, p1); _d2.subVectors(q2, p2); _r.subVectors(p1, p2);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
  let s, t;
  if (a <= 1e-8 && e <= 1e-8) return _r.lengthSq();
  if (a <= 1e-8) { s = 0; t = clamp(f / e); }
  else {
    const c = _d1.dot(_r);
    if (e <= 1e-8) { t = 0; s = clamp(-c / a); }
    else {
      const b = _d1.dot(_d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
    }
  }
  _c1.copy(p1).addScaledVector(_d1, s); _c2.copy(p2).addScaledVector(_d2, t);
  return _c1.distanceToSquared(_c2);
}
/** Closest points of the last segSeg call. */
export const segSegPoints = { a: _c1, b: _c2 };
