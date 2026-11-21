// The living creatures of the world: foxes, deer, village animals, koi, night critters. Streamed by distance, they
// wander, graze and rest, and bolt away from a running heroine, fire and loud magic. They are never targets.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { TAU, clamp, dampAngle, mulberry32 } from '../core/util.js';
import { acquireCreature } from '../actors/creature.js';
import { WILDLIFE } from '../data/camps.js';

const KINDS = {
  fox: { asset: 'ani_fox', scale: 1.15, walk: 1.2, run: 7, clips: { idle: 'Idle', move: 'Walk', run: 'Gallop', eat: 'Eating' }, shy: 6 },
  deer: { asset: 'ani_deer', scale: 1, walk: 1.1, run: 8, clips: { idle: 'Idle', move: 'Walk', run: 'Gallop', eat: 'Eating' }, shy: 9 },
  stag: { asset: 'ani_stag', scale: 0.9, walk: 1.1, run: 8, clips: { idle: 'Idle', move: 'Walk', run: 'Gallop', eat: 'Eating' }, shy: 9 },
  chicken: { asset: 'ani_chicken', scale: 1.3, walk: 0.8, run: 3.4, clips: { idle: 'Idle', move: 'Run', run: 'Run', eat: 'Idle_Peck' }, shy: 2.5, moveSpeed: 1.4 },
  cow: { asset: 'ani_cow', scale: 1, walk: 0.6, run: 2.6, clips: { idle: 'Idle', move: 'Walk', run: 'Gallop', eat: 'Eating' }, shy: 2, calm: true },
  dog: { asset: 'ani_dog', scale: 1.1, walk: 1.4, run: 6, clips: { idle: 'Idle', move: 'Walk', run: 'Gallop', eat: 'Eating' }, shy: 0, friendly: true },
  sheep: { asset: 'ani_sheep', scale: 1, walk: 0.7, run: 4, clips: { idle: 'Idle', move: 'Walk', run: 'Run', eat: 'Idle_Eating' }, shy: 4 },
  koi: { asset: 'ani_koi', scale: 1.1, walk: 1, run: 4, clips: { idle: 'Swimming_Normal', move: 'Swimming_Normal', run: 'Swimming_Fast', eat: 'Swimming_Impulse' }, shy: 3, swim: true },
  frog: { asset: 'ani_frog', scale: 1.4, walk: 0.9, run: 3, clips: { idle: 'Frog_Idle', move: 'Frog_Jump', run: 'Frog_Jump' }, shy: 3 },
  raccoon: { asset: 'ani_raccoon', scale: 1.2, walk: 1, run: 5, clips: { idle: 'Idle', move: 'Walk', run: 'Run', eat: 'Idle_Eating' }, shy: 5 },
  cat: { asset: 'ani_cat', scale: 1.3, walk: 0.9, run: 5, clips: { idle: 'Idle', move: 'Walk', run: 'Run', eat: 'Idle_Eating' }, shy: 3 },
  hedgehog: { asset: 'ani_hedgehog', scale: 1.4, walk: 0.4, run: 1.2, clips: { idle: 'Idle', move: 'Idle', run: 'Idle' }, shy: 2, curl: true },
};
const SPAWN_R = 85, DESPAWN_R = 115, CAP = 22;
const _v = new THREE.Vector3();

export function createWildlife(C) {
  const spots = WILDLIFE.map((s, i) => ({ ...s, i, live: [], on: false }));
  const animals = [];
  const scares = [];      // { x, z, r, t }
  let acc = 0;

  function scare(x, z, r, t = 3.5) { scares.push({ x, z, r, t }); if (scares.length > 12) scares.shift(); }
  G.events.on('spell:cast', (e) => { if (e && e.pos && e.team === 'player') scare(e.pos.x, e.pos.z, e.form === 'big' ? 22 : 12); });
  G.events.on('element:applied', (e) => { if (e && e.pos && (e.element === 'fire' || e.element === 'thunder' || e.element === 'earth')) scare(e.pos.x, e.pos.z, (e.radius || 2) + 10, 4); });
  G.events.on('spell:meteor', (e) => { if (e && e.pos) scare(e.pos.x, e.pos.z, 35, 6); });
  G.events.on('enemy:killed', (e) => { if (e && e.pos) scare(e.pos.x, e.pos.z, 10); });

  function spawnSpot(s) {
    const K = KINDS[s.kind];
    if (!K || !G.assets?.has(K.asset)) { s.on = true; return; }
    const rng = mulberry32(1000 + s.i * 17);
    for (let k = 0; k < s.n && animals.length < CAP; k++) {
      let x = s.x, z = s.z, ok = false;
      for (let tries = 0; tries < 10 && !ok; tries++) {
        const a = rng() * TAU, d = Math.sqrt(rng()) * s.r;
        x = s.x + Math.cos(a) * d; z = s.z + Math.sin(a) * d;
        ok = K.swim ? G.world.heightAt(x, z) < -1.4 : !G.world.isWater(x, z);
      }
      if (!ok) continue;
      const cr = acquireCreature(K.asset, { scale: K.scale, clips: K.clips, key: 'ani:' + s.kind });
      cr.addTo();
      const an = { K, cr, spot: s, pos: new THREE.Vector3(x, 0, z), yaw: rng() * TAU, mode: 'idle', t: rng() * 3, target: new THREE.Vector3(x, 0, z), speed: 0, fleeT: 0, ph: rng() * TAU };
      an.pos.y = K.swim ? -0.55 : G.world.groundAt(x, z);
      cr.play('idle');
      cr.place(an.pos.x, an.pos.y, an.pos.z, an.yaw);
      animals.push(an); s.live.push(an);
    }
    s.on = true;
  }
  function despawnSpot(s) {
    for (const an of s.live) { an.cr.release(); const i = animals.indexOf(an); if (i >= 0) animals.splice(i, 1); }
    s.live.length = 0; s.on = false;
  }

  function think(an, dt) {
    const K = an.K, P = G.player;
    an.t -= dt;
    // threats: a close or sprinting heroine, fresh scares, ground fire
    let fx = 0, fz = 0, threat = false;
    if (P && !P.dead && !K.friendly) {
      const dx = an.pos.x - P.pos.x, dz = an.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      const reach = K.shy * ((P.speed || 0) > 6 || P.onBroom ? 1.8 : 1);
      if (d < reach && d > 0.01) { fx += dx / d; fz += dz / d; threat = true; }
    }
    for (const s of scares) {
      const dx = an.pos.x - s.x, dz = an.pos.z - s.z, d = Math.hypot(dx, dz);
      if (d < s.r && d > 0.01 && !K.calm) { fx += dx / d; fz += dz / d; threat = true; }
    }
    if ((an.ph += dt) > 0.6) { an.ph = 0; if (!K.swim && G.elements?.isBurningAt?.(an.pos.x + Math.sin(an.yaw) * 2, an.pos.z + Math.cos(an.yaw) * 2)) { fx -= Math.sin(an.yaw); fz -= Math.cos(an.yaw); threat = true; } }
    // upgrade 3 (look only): a startled freeze with the head up before bolting, panic zig-zags, grazers look up at her
    if (threat && !K.curl && an.mode !== 'flee' && an.mode !== 'alert' && !K.swim) { an.mode = 'alert'; an.alertT = 0.22 + Math.random() * 0.2; an.fdx = fx; an.fdz = fz; }
    if (an.mode === 'alert') {
      an.alertT -= dt; an.speed = 0;
      an.cr.lookAt = P ? P.pos : null;
      if (an.alertT <= 0) { an.mode = 'flee'; an.fleeT = 2.2; }
    } else if (threat && !K.curl) { an.mode = 'flee'; an.fleeT = 2.2; an.fdx = fx; an.fdz = fz; }
    else if (threat && K.curl) { an.mode = 'idle'; an.t = 3; }
    if (an.mode === 'flee') {
      an.fleeT -= dt;
      if (an.fleeT <= 0) { an.mode = 'idle'; an.t = 1 + Math.random() * 2; }
      const l = Math.hypot(an.fdx, an.fdz) || 1;
      const zz = Math.sin(G.time.t * 5.3 + an.ph * 7) * 2.2;
      an.target.set(an.pos.x + an.fdx / l * 6 - an.fdz / l * zz, 0, an.pos.z + an.fdz / l * 6 + an.fdx / l * zz);
      an.speed = K.run;
      an.cr.lookAt = null;
    } else if (an.mode === 'eat' && P && an.t > 1 && Math.random() < dt * 0.35 && Math.hypot(P.pos.x - an.pos.x, P.pos.z - an.pos.z) < 12) {
      an.mode = 'idle'; an.speed = 0; an.t = 1.2 + Math.random() * 1.5;
    } else if (an.t <= 0) {
      const r = Math.random();
      if (K.friendly && P && Math.hypot(P.pos.x - an.pos.x, P.pos.z - an.pos.z) < 20 && r < 0.4) {
        an.mode = 'walk'; an.target.set(P.pos.x + (Math.random() - 0.5) * 3, 0, P.pos.z + (Math.random() - 0.5) * 3); an.speed = K.run * 0.6; an.t = 3;
      } else if (r < 0.45) {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * an.spot.r;
        an.target.set(an.spot.x + Math.cos(a) * d, 0, an.spot.z + Math.sin(a) * d);
        an.mode = 'walk'; an.speed = K.moveSpeed ?? K.walk; an.t = 6 + Math.random() * 4;
      } else if (r < 0.75 && an.cr.has('eat')) { an.mode = 'eat'; an.speed = 0; an.t = 3 + Math.random() * 4; }
      else { an.mode = 'idle'; an.speed = 0; an.t = 2 + Math.random() * 4; }
    }
    // move
    if (an.speed > 0) {
      const dx = an.target.x - an.pos.x, dz = an.target.z - an.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.4 && an.mode === 'walk') { an.mode = 'idle'; an.speed = 0; an.t = 1 + Math.random() * 3; }
      else if (d > 0.01) {
        an.yaw = dampAngle(an.yaw, Math.atan2(dx, dz), an.mode === 'flee' ? 10 : 4, dt);
        const s = an.speed * dt;
        const nx = an.pos.x + Math.sin(an.yaw) * s, nz = an.pos.z + Math.cos(an.yaw) * s;
        const wet = G.world.heightAt(nx, nz) < -1.4;
        const ok = K.swim ? wet : !G.world.isWater(nx, nz);
        if (ok && Math.hypot(nx - an.spot.x, nz - an.spot.z) < an.spot.r + 18) { an.pos.x = nx; an.pos.z = nz; }
        else { an.yaw += Math.PI * 0.6; an.target.set(an.spot.x, 0, an.spot.z); }
      }
    }
    if (!K.swim) { an.pos.y = G.world.groundAt(an.pos.x, an.pos.z, an.pos.y + 0.7); G.world.resolveCollisions?.(an.pos, 0.3, 0.6); }
    else an.pos.y = -0.55 + Math.sin(G.time.t * 1.3 + an.ph * 3) * 0.08;
    if (an.mode === 'idle' || an.mode === 'walk') { const d2 = P ? Math.hypot(P.pos.x - an.pos.x, P.pos.z - an.pos.z) : 99; an.cr.lookAt = d2 < 10 ? P.pos : null; }
    else if (an.mode === 'eat') an.cr.lookAt = null;
    const st = an.mode === 'flee' ? 'run' : an.mode === 'walk' ? 'move' : an.mode === 'eat' ? 'eat' : 'idle';
    an.cr.play(st, { speed: an.mode === 'walk' ? clamp(an.speed / Math.max(0.3, K.walk), 0.6, 1.6) : an.mode === 'flee' ? 1.25 : 1 });
  }

  return {
    /** Perf pass: [asset, opts] per animal kind, exactly as spawn() acquires them (shader / pool warm-up). */
    warmList() { return Object.entries(KINDS).filter(([, K]) => G.assets?.has(K.asset)).map(([kind, K]) => [K.asset, { scale: K.scale, clips: K.clips, key: 'ani:' + kind }]); },
    animals, spots,
    get count() { return animals.length; },
    start() { for (const s of spots) if (s.on) despawnSpot(s); scares.length = 0; },
    update(dt) {
      for (let i = scares.length - 1; i >= 0; i--) { scares[i].t -= dt; if (scares[i].t <= 0) scares.splice(i, 1); }
      const P = G.player;
      const fx = P?.pos?.x ?? G.env.focus.x, fz = P?.pos?.z ?? G.env.focus.z;
      acc -= dt;
      if (acc <= 0) {
        acc = 0.7;
        for (const s of spots) {
          const d = Math.hypot(fx - s.x, fz - s.z) - s.r;
          if (!s.on && d < SPAWN_R && animals.length < CAP) spawnSpot(s);
          else if (s.on && d > DESPAWN_R) despawnSpot(s);
        }
      }
      for (const an of animals) {
        const d = Math.hypot(an.pos.x - fx, an.pos.z - fz);
        if (d > 70) continue;
        try { think(an, dt); } catch (e) { G.reportError('combat:wildlife', e); }
        an.cr.place(an.pos.x, an.pos.y, an.pos.z, an.yaw);
        an.cr.update(d > 40 ? dt : dt);
      }
    },
    clear() { for (const s of spots) despawnSpot(s); },
    /** Tests / look shots only: a standing animal of `kind` at (x, z) facing yaw, playing `state`. Returns the creature. */
    showcase(kind, x, z, yaw = 0, state = 'idle') {
      const K = KINDS[kind]; if (!K) return null;
      const cr = acquireCreature(K.asset, { scale: K.scale, clips: K.clips, key: 'ani:' + kind });
      cr.addTo(); cr.play(state);
      cr.place(x, G.world.groundAt(x, z), z, yaw);
      return cr;
    },
  };
}
