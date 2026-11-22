// Lingering spell bodies: rock pillars (岩起), ice daises (冰镜), tornadoes (龙卷), meteors (陨星), light orbs (日辉),
// time bubbles (月晕) and the thunder strike helper. Each entity is { update(dt) -> keep?, dispose() } in S.ents.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { clamp, easeOutBack, easeInOutCubic, TAU } from '../core/util.js';
import { glowDynamic } from '../core/mats.js';
import { COLORS, damageOf } from './book.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const MAX_PILLARS = 4, MAX_DAIS = 3;

export function createEntities(S, V) {
  const pillars = [], daises = [];

  function add(ent) { S.ents.push(ent); return ent; }

  // ---- thunder strike ---------------------------------------------------------------------------------------------
  /** One bolt from the sky onto `at`: lightning, apply('thunder'), small blast, flash, shake. */
  S.strike = (at, radius, power, info, size = 1) => {
    _w.set(at.x + (Math.random() - 0.5) * 6, at.y + 46, at.z + (Math.random() - 0.5) * 6);
    G.fx?.lightning(_w, at, { color: 0x9753ff, groundRadius: radius * 1.10, dur: .34, branches: Math.round(3 + size * 2), width: 0.44 * Math.sqrt(size) + 0.16, intensity: 1.4 + size * 0.5 });
    G.elements?.apply('thunder', at, radius, power, info);
    G.physics?.explode(at, radius, 5 * power, { up: 0.6 });
    _v.copy(at); _v.y += 0.6;
    G.fx?.burst('hit_thunder', _v, { scale: 1 + size * 0.4, power });
    G.fx?.ring(at, { color: COLORS.thunder, radius: radius * 1.2, dur: 0.4 });
    G.fx?.flash(_v, COLORS.thunder, 90 * size, 0.18, 30);
    G.sky?.flash?.(0xb9a0ff, 0.08 + 0.05 * size);
    G.audio?.sfx('hit_thunder', { pos: at, vol: 0.7 + 0.3 * size });
    S.shake(0.2 + 0.18 * size, at);
  };

  /** Characters standing over a rising slab ride up with it (player, combat enemies). */
  function liftActors(at, R, top, H) {
    const lift = (o) => {
      if (!o || !o.pos || o.dead) return;
      const dx = o.pos.x - at.x, dz = o.pos.z - at.z;
      if (dx * dx + dz * dz > R * R) return;
      if (o.pos.y < top && o.pos.y > top - H - 0.5) {
        o.pos.y = top;
        if (o.vel && o.vel.y < 0) o.vel.y = 0;
      }
    };
    lift(G.player);
    const en = G.combat?.enemies;
    if (en) for (let i = 0; i < en.length; i++) lift(en[i]);
  }

  // ---- 岩起 rock pillar -----------------------------------------------------------------------------------------
  S.spawnPillar = (at, c) => {
    while (pillars.length >= MAX_PILLARS) pillars[0].crumble();
    const R = 2.4, H = 6.6;
    const gy = G.world.heightAt(at.x, at.z);
    // sculpted column (G.sculpt 'earth_column'): a holder with the old mesh's pivot (base, 0.6 m below ground), scale 1;
    // a rubble skirt at its foot that does not rise. ?sculpt=0 = the old jittered prism.
    const mesh = V.sculptColumn?.() || new THREE.Mesh(V.pillarGeo, V.pillarMat);
    if (mesh.isMesh) { mesh.scale.set(R, H, R); mesh.castShadow = true; mesh.receiveShadow = true; }
    mesh.rotation.y = Math.random() * TAU;
    mesh.position.set(at.x, gy - H, at.z);
    G.scene.add(mesh);
    const rubble = mesh.isMesh ? null : V.sculptRubble?.();
    const RUB_Y = gy - 0.12;   // a little into the ground: the skirt is 7.7 m wide and slopes would float its downhill edge
    if (rubble) { rubble.rotation.y = Math.random() * TAU; rubble.position.set(at.x, RUB_Y - 0.25, at.z); G.scene.add(rubble); }
    const plat = G.world.addPlatform({ x: at.x, z: at.z, r: R * 0.9, top: gy - 0.6, thick: 1.6, tag: 'spell-pillar' });
    const col = G.world.addCollider({ x: at.x, z: at.z, r: R * 0.92, y0: gy - H, y1: gy - 0.7, tag: 'spell-pillar' });
    let body = null;
    if (G.physics) {
      body = G.physics.add({ shape: 'cylinder', size: { r: R * 0.9, h: H }, pos: _v.set(at.x, gy - H / 2, at.z), type: 'kinematic', material: 'stone', group: 'prop', owner: null });
    }
    let t = 0, life = 25, dying = -1, hitDone = false, sinkFrom = 0;
    const top = () => mesh.position.y + H;
    // 元素交织: the column is a lightning rod — thunder charges it (it arcs to foes nearby, then crumbles) instead of
    // splitting it; it conducts, so a strike on it also chains on to wet foes around it
    const reactor = G.elements?.register?.({ owner: null, kind: 'structure', material: 'stone', conductive: true, getPos: () => _w.set(at.x, mesh.position.y, at.z), radius: R, height: H, team: 'neutral',
      on: { shatter: () => ent.crumble(), hit: (r, el, pw, h) => {
        if (el === 'thunder' && !h?.fusion && h?.team && h.team !== 'neutral' && h.team === c.team && S.fusions) S.fusions.chargePillar(ent, h);
        else if (el === 'thunder' && !(ent.rod > 0)) ent.crumble();
        else if (h && h.heavy && pw >= 2) ent.crumble();
      } } });
    G.fx?.burst('dust', _v.set(at.x, gy + 0.3, at.z), { scale: 1.6 });
    G.fx?.burst('shatter_rock', _v, { scale: 0.8 });
    G.fx?.ring(_v, { color: COLORS.earth, radius: 3.5, dur: 0.5 });
    G.audio?.sfx('cast_earth', { pos: at });
    G.audio?.sfx('rock_fall', { pos: at, vol: 0.8 });
    S.shake(0.3, at);
    const ent = add({
      kind: 'pillar', pos: at.clone(), get top() { return top(); }, team: c.team, caster: c.caster, rod: 0, get dying() { return dying >= 0; },
      update(dt) {
        t += dt;
        if (dying < 0) {
          const k = easeOutBack(clamp(t / 0.45));
          mesh.position.y = gy - H + (H - 0.6) * k;
          if (rubble) rubble.position.y = RUB_Y - 0.25 * (1 - clamp(t / 0.15));   // heave
          if (!hitDone && t > 0.05) {
            hitDone = true;
            _v.set(at.x, gy + 1, at.z);
            G.elements?.apply('earth', _v, R + 0.4, c.power, { source: c.caster, team: c.team, damage: damageOf('earth', 'small'), heavy: true, noGround: true });
            G.elements?.touchGround?.('earth', _v.set(at.x, gy + 0.3, at.z), R + 0.6, c.power, { source: c.caster, team: c.team });   // puddle → mud, burning grass → lava
            G.physics?.explode(_v.set(at.x, gy - 0.5, at.z), R + 1.2, 10, { up: 1.6 });
          }
          if (ent.rod > 0 && S.fusions?.pillarTick(ent, dt)) ent.crumble();
          if (t > life && !(ent.rod > 0)) ent.crumble();
        } else {
          dying += dt;
          mesh.position.y = sinkFrom - H * easeInOutCubic(clamp(dying / 0.9));
          mesh.rotation.z = Math.sin(dying * 40) * 0.01;
          if (rubble) rubble.position.y = RUB_Y - 0.5 * easeInOutCubic(clamp(dying / 0.9));
          if (dying > 0.9) return false;
        }
        const tp = top();
        plat.top = tp; col.y0 = tp - H; col.y1 = tp - 0.12;
        if (dying < 0 && t < 0.6) liftActors(at, R, tp, H);
        if (body) body.setKinematicTarget(_v.set(at.x, tp - H / 2, at.z));
        return true;
      },
      crumble() {
        if (dying >= 0) return;
        dying = 0; sinkFrom = mesh.position.y;
        plat.dead = true; col.dead = true;
        const i = pillars.indexOf(ent); if (i >= 0) pillars.splice(i, 1);
        _v.set(at.x, top() - 0.5, at.z);
        G.fx?.burst('shatter_rock', _v, { scale: 1.4 });
        G.fx?.burst('dust', _w.set(at.x, gy + 0.5, at.z), { scale: 2 });
        G.audio?.sfx('rock_crumble', { pos: at });
        S.debris(_v, 5, 0.55, V.rockMat);
      },
      dispose() {
        plat.dead = true; col.dead = true;
        const i = pillars.indexOf(ent); if (i >= 0) pillars.splice(i, 1);
        if (body) G.physics?.remove(body);
        if (reactor) G.elements?.unregister(reactor);
        mesh.removeFromParent();
        rubble?.removeFromParent();
      },
    });
    pillars.push(ent);
    return { pillar: ent, stop: () => ent.crumble() };
  };

  /** n small rock chunks flung from p (short-lived physics debris). */
  S.debris = (p, n, size, mat) => {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(V.meteorGeo, mat || V.rockMat);
      const s = size * (0.6 + Math.random() * 0.7);
      m.scale.setScalar(s); m.castShadow = true;
      _w.set(p.x + (Math.random() - 0.5) * 2, p.y + Math.random(), p.z + (Math.random() - 0.5) * 2);
      m.position.copy(_w);
      G.scene.add(m);
      if (G.physics) {
        const life = 2.5 + Math.random();
        const b = G.physics.add({ mesh: m, shape: 'sphere', size: s * 0.9, pos: _w, type: 'dynamic', material: 'stone', group: 'debris', lifetime: life,
          vel: { x: (Math.random() - 0.5) * 8, y: 4 + Math.random() * 6, z: (Math.random() - 0.5) * 8 } });
        if (!b) { m.removeFromParent(); continue; }
        // safety net: whatever happens to the body, the chunk never outlives it by more than a moment
        let tt = 0;
        add({ kind: 'debris', update(dt) { tt += dt; return tt < life + 1.2 && !!m.parent; }, dispose() { if (b.alive) G.physics?.remove(b); m.removeFromParent(); } });
      } else {
        let tt = 0; const vy = 5;
        add({ update(dt) { tt += dt; m.position.y += (vy - 22 * tt) * dt; return tt < 1; }, dispose() { m.removeFromParent(); } });
      }
    }
  };

  // ---- 冰镜 ice dais ---------------------------------------------------------------------------------------------
  S.spawnDais = (at, caster, team = caster === G.player ? 'player' : caster?.team || 'neutral') => {
    while (daises.length >= MAX_DAIS) daises[0].melt(0.6);
    const R = 3.3, H = 1.7;
    const gy = G.world.heightAt(at.x, at.z);
    const mat = V.iceMat.clone(); // own opacity while melting
    const mesh = new THREE.Mesh(V.daisGeo, mat);
    mesh.position.set(at.x, gy - H, at.z);
    mesh.scale.set(R, H, R);
    mesh.castShadow = true; mesh.receiveShadow = true;
    G.scene.add(mesh);
    const plat = G.world.addPlatform({ x: at.x, z: at.z, r: R * 0.92, top: gy - 0.2, thick: 1.4, tag: 'spell-ice' });
    const col = G.world.addCollider({ x: at.x, z: at.z, r: R, y0: gy - 1, y1: gy - 0.3, tag: 'spell-ice' });
    let t = 0, life = 22, scale = 1;
    const reactor = G.elements?.register?.({ owner: null, kind: 'structure', material: 'ice', pos: new THREE.Vector3(at.x, gy, at.z), radius: R, height: H, team: 'neutral',
      on: { hit: (r, el, pw, h) => {
        if (el !== 'fire') return;
        // 元素交织: her own fire on her ice dais flashes it into a steam explosion
        if (!blasted && t > 0.3 && !h?.fusion && h?.team === team && team !== 'neutral' && S.fusions) { blasted = true; S.fusions.steamblast(at, team, h.source || caster); life = Math.min(life, t + 1.2); return; }
        life = Math.min(life, t + 3); G.fx?.burst('steam', _v.set(at.x, gy + H, at.z), { scale: 1.5 });
      } } });
    let blasted = false;
    const ent = add({
      kind: 'dais',
      update(dt) {
        t += dt;
        const k = easeOutBack(clamp(t / 0.4));
        const melt = clamp((life - t) / 4);       // 1 → 0 over the last 4 s
        scale = 0.55 + 0.45 * melt;
        mesh.scale.set(R * scale, H * (0.25 + 0.75 * melt), R * scale);
        mesh.position.y = gy - 0.25 - H * (1 - k);
        mat.opacity = 0.86 * clamp(melt * 1.5);
        const tp = mesh.position.y + mesh.scale.y;
        plat.top = tp; plat.r = R * 0.92 * scale; col.y1 = tp - 0.1; col.r = R * scale;
        if (t < 0.55) liftActors(at, R * 0.9, tp, H + 1);
        if (melt < 1 && Math.random() < dt * 4) G.fx?.burst('splash', _v.set(at.x + (Math.random() - 0.5) * 4, tp, at.z + (Math.random() - 0.5) * 4), { scale: 0.4 });
        return t < life;
      },
      melt(sec) { life = Math.min(life, t + sec); const i = daises.indexOf(ent); if (i >= 0) daises.splice(i, 1); },
      dispose() {
        plat.dead = true; col.dead = true;
        const i = daises.indexOf(ent); if (i >= 0) daises.splice(i, 1);
        if (reactor) G.elements?.unregister(reactor);
        G.fx?.burst('splash', _v.set(at.x, gy + 0.4, at.z), { scale: 1.6 });
        mesh.removeFromParent(); mat.dispose();
      },
    });
    daises.push(ent);
    void caster;
    return ent;
  };

  // ---- 龙卷 tornado -----------------------------------------------------------------------------------------------
  S.spawnTornado = (at, c) => {
    const R = 5, H = 40, DUR0 = 14;
    const wind = G.elements?.addWind?.({ kind: 'updraft', pos: at.clone(), radius: R, height: H, strength: 17, duration: DUR0, swirl: 1 }) || null;
    const grp = new THREE.Group();
    grp.position.copy(at);
    const m1 = V.scroll(V.stripes, 0x9fe8c0, 0.55), m2 = V.scroll(V.stripes, 0xe8fff4, 0.42);
    m1.map = V.stripes.clone(); m1.map.needsUpdate = true; m1.map.repeat.set(3, 2);
    m2.map = V.stripes.clone(); m2.map.needsUpdate = true; m2.map.repeat.set(2, 1);
    const outer = new THREE.Mesh(V.funnelGeo, m1); outer.scale.set(R * 1.15, H, R * 1.15);
    const inner = new THREE.Mesh(V.funnelGeo, m2); inner.scale.set(R * 0.7, H * 0.92, R * 0.7);
    grp.add(outer, inner);
    // look: a painted funnel from fx shapes (shared instanced batch, no draw calls of its own): a dusty jade body
    // twisting up, bright wind streaks spiralling faster inside, a dust skirt on the ground. The meshes stay as fallback.
    const shp = G.fx?.shape ? [
      G.fx.shape({ kind: 'cone', pos: at, r0: 0.9, r1: R * 1.25, h: H * 0.72, dur: 1, grow: [1, 1], erode: [0.18, 0.18], tex: 'billow', tile: [3, 1.4], scroll: [2.4, -1.3], twist: 5,
        color: 0x5fae8e, color2: 0xe6fff2, core: 0.85, mode: 'sheet', body: 0.55, I: 1.0, soft: 0.06, handle: true }),
      G.fx.shape({ kind: 'cone', pos: at, r0: 0.6, r1: R * 0.95, h: H * 0.68, dur: 1, grow: [1, 1], erode: [0.3, 0.3], tex: 'streak', tile: [3, 2], scroll: [3.4, -2.6], twist: 8,
        color: 0xbaf2d6, color2: 0xffffff, mode: 'glow', add: 0.45, I: 0.8, soft: 0.06, body: 0.45, handle: true }),
      G.fx.shape({ kind: 'ring', pos: _v.set(at.x, G.world.heightAt(at.x, at.z) + 0.15, at.z).clone(), r0: 1.2, r1: R * 1.6, h: 1, dur: 1, grow: [1, 1], erode: [0.3, 0.3], tex: 'billow', tile: [4, 1], scroll: [0.6, 0.2],
        color: 0x9a8c72, color2: 0xcabda2, mode: 'smoke', body: 0.45, soft: 0.1, handle: true }),
    ].filter((h) => h && h !== true) : [];
    if (shp.length < 3) { for (const h of shp) h.kill?.(0.01); shp.length = 0; G.scene.add(grp); }
    const em = G.fx?.emitter?.('updraft', { color: COLORS.wind, radius: R, height: H }) || null;
    if (em) em.pos.copy(at);
    const dust = null;
    G.fx?.ring(at, { color: COLORS.wind, radius: R * 1.4, dur: 0.8 });
    G.audio?.sfx('cast_wind', { pos: at, vol: 1.2 });
    let t = 0, tick = 0, DUR = DUR0;
    const team = c.team, caster = c.caster;
    // 合咏: cast fire / thunder / ice / water into it (or shoot through it) and it takes that element on (fusions.js)
    const tw = S.fusions?.addTornado({ at: at.clone(), R, H, team, caster, shp, ent: null, recolor: (col) => { m1.color?.setHex?.(col); } }) || null;
    const ent = add({
      kind: 'tornado', pos: at,
      get fused() { return tw?.el || null; },
      /** live a few seconds longer (capped at 22 s in all) */
      extend(sec) { DUR = Math.min(22, Math.max(DUR, t + 1.5) + sec); if (wind) wind.duration = DUR; },
      update(dt) {
        t += dt;
        const k = clamp(t / 0.6) * clamp((DUR - t) / 1.2);
        if (tw) { try { S.fusions.tornadoTick(tw, dt, k); } catch (e) { G.reportError('spells:tornado-fusion', e); } }
        outer.rotation.y -= dt * 3.2; inner.rotation.y -= dt * 5.5;
        m1.map.offset.y -= dt * 0.9; m2.map.offset.y -= dt * 1.6; m1.map.offset.x += dt * 0.2;
        m1.opacity = k; m2.opacity = k * 0.8;
        grp.scale.set(0.6 + 0.4 * k, 0.3 + 0.7 * clamp(t / 0.5), 0.6 + 0.4 * k);
        if (shp.length) {
          const sw = 0.6 + 0.4 * k, sh = 0.3 + 0.7 * clamp(t / 0.5), wob = 1 + 0.06 * Math.sin(t * 3.1);
          shp[0].dims(0.9 * sw, R * 1.25 * sw * wob, H * 0.72 * sh); shp[0].I = 1.0 * k;
          shp[1].dims(0.6 * sw, R * 0.95 * sw, H * 0.68 * sh); shp[1].I = 0.8 * k;
          shp[2].dims(1.2, R * 1.6 * sw, 1); shp[2].I = k;
          shp[0].up.set(0.05 * Math.sin(t * 0.9), 1, 0.05 * Math.cos(t * 0.7)).normalize(); shp[1].up.copy(shp[0].up);
        }
        tick -= dt;
        if (tick <= 0 && t < DUR - 0.5) {
          tick = 0.8;
          _v.copy(at); _v.y += 1.5;
          G.elements?.apply('wind', _v, R, 0.55, { source: caster, team, damage: 6, impulse: 0.01 });
          if (Math.random() < 0.5) G.audio?.sfx('whoosh', { pos: at, vol: 0.5, pitch: 0.7 });
          G.fx?.burst('leaves', _v.set(at.x + (Math.random() - 0.5) * R, at.y + 1, at.z + (Math.random() - 0.5) * R), { dir: V.up, scale: 1.2 });
          G.fx?.burst('dust', _v.set(at.x, at.y + 0.3, at.z), { scale: 1.4 });
        }
        return t < DUR;
      },
      dispose() { if (tw) S.fusions?.removeTornado(tw); for (const h of shp) h.kill?.(0.3); wind?.remove?.(); em?.remove?.(); dust?.remove?.(); grp.removeFromParent(); m1.map.dispose(); m2.map.dispose(); m1.dispose(); m2.dispose(); },
    });
    if (tw) tw.ent = ent;
    return { tornado: ent, stop: () => { t = Math.max(t, DUR - 1); } };
  };

  // ---- 陨星 meteor -------------------------------------------------------------------------------------------------
  S.spawnMeteor = (at, c) => {
    const FALL = 1.2;
    _v.copy(c.dir); _v.y = 0; if (_v.lengthSq() < 1e-4) _v.set(0, 0, 1); _v.normalize();
    const from = new THREE.Vector3(at.x - _v.x * 34, at.y + 82, at.z - _v.z * 34);
    const mesh = new THREE.Mesh(V.meteorGeo, V.meteorMat);
    mesh.scale.setScalar(1.8); mesh.castShadow = true;
    mesh.position.copy(from);
    G.scene.add(mesh);
    const halo = new THREE.Mesh(V.lightOrbGeo, glowDynamic(0xff7a2a, 2.2, { transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(5.5); mesh.add(halo);
    const trail = G.fx?.trail?.({ color: 0xffd080, color2: 0xff3a10, width: 3.2, life: 0.8, intensity: 2.6, style: 'band', pos: from }) || null;
    const em = G.fx?.emitter?.('smoke', { scale: 2.2 }) || null;
    let puff = 0;
    const fl = G.fx?.emitter?.('flame', { scale: 1.8 }) || null;
    G.fx?.sigil?.(at, { color: 0xff6a2a, radius: 9, dur: FALL + 0.2, spin: 2.5 });
    G.fx?.ring(at, { color: 0xff6a2a, radius: 9, dur: FALL, intensity: 1.5 });
    G.audio?.sfx('cast_earth', { pos: c.origin });
    G.audio?.sfx('cast_fire_2', { pos: at, vol: 0.7, pitch: 0.6 });
    let t = 0, done = false;
    const team = c.team, caster = c.caster, power = c.power;
    const ent = add({
      kind: 'meteor',
      update(dt) {
        t += dt;
        const k = clamp(t / FALL);
        mesh.position.lerpVectors(from, at, k * k * (0.4 + 0.6 * k) / 1.0);
        mesh.rotation.x += dt * 3; mesh.rotation.z += dt * 2;
        trail?.push(mesh.position);
        if (em) em.pos.copy(mesh.position);
        if (fl) fl.pos.copy(mesh.position);
        puff -= dt;
        if (puff <= 0) { puff = 0.06; G.fx?.burst('meteor_trail', mesh.position, { scale: 1.4 }); }
        if (k >= 1 && !done) { done = true; impact(); return false; }
        return true;
      },
      dispose() { trail?.stop?.(); em?.remove?.(); fl?.remove?.(); halo.material.dispose(); mesh.removeFromParent(); },
    });
    function impact() {
      const x = at.x, z = at.z;
      _v.copy(at); _v.y += 1;
      const dmg = damageOf('earth', 'big');
      G.elements?.apply('earth', _v, 9, 2 * power, { source: caster, team, damage: dmg, heavy: true });
      G.elements?.apply('fire', _v, 7, 1.2 * power, { source: caster, team, damage: 0 });
      // rocks in the blast shatter
      G.elements?.query?.(at, 7, (r) => { if ((r.material === 'stone' || r.material === 'crystal') && r.kind !== 'creature' && r.on?.shatter) { try { r.on.shatter(r, { source: caster, team }); } catch (e) { G.reportError('spells:meteor', e); } } });
      G.physics?.explode(at, 12, 24 * power, { up: 0.75 });
      const res = G.world.deform(x, z, 9, -4, { rim: 0.28 });
      G.flora?.removeInRadius?.(x, z, 6.5);
      G.fx?.burst('explosion_big', _v, { color: 'fire', scale: 1.35, power: 3 });
      G.fx?.burst('crater', at, { scale: 1 });
      G.fx?.burst('shatter_rock', _v, { scale: 2 });
      G.fx?.ring(at, { color: 0xffa040, radius: 16, dur: 1.1, intensity: 2.6 });
      G.fx?.flash(_v, 0xff7a2a, 420, 0.6, 60);
      G.sky?.flash?.(0xffa060, 0.25);
      G.audio?.sfx('explosion_large', { pos: at, vol: 1.3 });
      G.audio?.sfx('rock_crumble', { pos: at });
      S.shake(1, at);
      G.hitstop(0.09); G.cam?.fovKick?.(0.4);
      S.debris(_v.set(x, G.world.heightAt(x, z) + 1, z), 8, 0.7, V.meteorMat);
      // 元素交织: into a lake it throws a tidal splash; on land a pool of molten rock stays in the crater
      if (G.world.isWater?.(x, z)) S.fusions?.tidal(at, team, caster, power);
      else S.after(0.35, () => { if (!G.world.isWater?.(x, z)) G.elements?.addField?.('lava', x, z, 4.2, { team, source: caster, life: 12, power }); });
      // embers keep burning around the rim
      S.after(0.25, () => {
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * TAU, d = 6 + Math.random() * 4;
          G.elements?.igniteGround?.(x + Math.cos(a) * d, z + Math.sin(a) * d, 1.6, 1.1);
        }
      });
      G.events.emit('spell:meteor', { pos: at.clone(), crater: !!res });
    }
    return { meteor: ent };
  };

  // ---- 日辉 light orb ------------------------------------------------------------------------------------------------
  S.spawnLightOrb = (at, c) => {
    const pos = new THREE.Vector3(at.x, at.y + 2.1, at.z);
    const mat = glowDynamic(0xffc04a, 1.5); // HDR budget: golden, not white (was 0xffd27a x2.2)
    const orb = new THREE.Mesh(V.lightOrbGeo, mat);
    const halo = new THREE.Mesh(V.lightOrbGeo, glowDynamic(0xffb850, 1, { transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(2);
    orb.add(halo);
    orb.position.copy(pos);
    G.scene.add(orb);
    const light = G.elements?.addLight?.({ pos, radius: 13, intensity: 1, duration: 10 }) || null;
    const em = G.fx?.emitter?.('aura_sun', { color: 'sun', scale: 0.8 }) || null;
    if (em) em.pos.copy(pos);
    let t = 0;
    const base = pos.y;
    add({
      kind: 'lightorb',
      update(dt) {
        t += dt;
        pos.y = base + Math.sin(t * 1.6) * 0.18;
        orb.position.copy(pos);
        const k = clamp(t / 0.3) * clamp((10 - t) / 1);
        orb.scale.setScalar(0.15 + 0.4 * k + Math.sin(t * 7) * 0.02);
        mat.userData.setGlow(k);
        if (em) em.pos.copy(pos);
        return t < 10;
      },
      dispose() { light?.remove?.(); em?.remove?.(); orb.removeFromParent(); mat.dispose(); halo.material.dispose(); },
    });
    void c;
  };

  // ---- 月晕 time bubble ------------------------------------------------------------------------------------------------
  S.spawnBubble = (at, c) => {
    const R = 10, DUR = 8;
    const bubble = { pos: at.clone(), radius: R, scale: 0.25, team: c.team, caster: c.caster, t: 0 };
    S.timeBubbles.push(bubble);
    const mat = V.fresnel(0xb9a8ff, { rings: 1, side: THREE.DoubleSide });
    const dome = new THREE.Mesh(V.domeGeo, mat);
    dome.position.copy(at); dome.scale.setScalar(0.01);
    dome.renderOrder = 4;
    const ringMat = glowDynamic(0xd8ccff, 1.6);
    const r1 = new THREE.Mesh(V.ringGeo, ringMat); r1.scale.setScalar(R); r1.position.y = 0.15;
    const r2 = new THREE.Mesh(V.ringGeo, ringMat); r2.scale.setScalar(R * 0.62); r2.position.y = 4.5;
    const g = new THREE.Group(); g.position.copy(at); g.add(r1, r2);
    G.scene.add(dome, g);
    // look: the hard glow rings give way to fx-kit shapes when the kit exists — a slow glyph ring on the ground, two
    // crescent blades orbiting, mirror shards and silver motes drifting inside (visual only)
    const kh = [];
    if (G.fx?.shape && G.fx?.kit) {
      r1.visible = false; r2.visible = false;
      const gr = G.fx.kit.glyphs(_v.copy(at).setY(at.y + 0.08), R, 0xcfc2ff, { dur: 2, spin: 0.25, I: 1.3, width: 0.08, handle: true });
      if (gr && gr !== true) kh.push(gr);
      for (let i = 0; i < 2; i++) {
        const h = G.fx.shape({ kind: 'arc', pos: at, up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(1, 0, 0), r0: R * (0.5 + i * 0.12), r1: R * (0.56 + i * 0.12), span: 2.2, start: i * Math.PI,
          dur: 2, grow: [1, 1], erode: [-0.1, -0.1], tex: 'streak', tile: [1, 1], scroll: [-0.8, 0], color: 0xa9b8ff, color2: 0xffffff, mode: 'glow', add: 0.75, I: 1.3, soft: 0.06, handle: true });
        if (h && h !== true) { h.ph = i * Math.PI; h.y = 2.2 + i * 2.4; h.spd = i ? -0.5 : 0.35; kh.push(h); }
      }
    }
    let moteT = 0;
    G.fx?.sigil?.(at, { color: COLORS.moon, radius: R, dur: DUR, spin: 0.3 });
    G.fx?.burst('magic_circle', at, { color: 'moon', scale: 1.5 });
    G.audio?.sfx('cast_moon', { pos: at });
    G.audio?.sfx('bell_small', { pos: at, vol: 0.6, pitch: 0.6 });
    let t = 0;
    const ent = add({
      kind: 'bubble', bubble,
      update(dt) {
        t += dt; bubble.t = t;
        const k = easeOutBack(clamp(t / 0.5)) * clamp((DUR - t) / 0.6);
        dome.scale.setScalar(Math.max(0.01, R * k));
        mat.uniforms.uTime.value = t;
        mat.uniforms.uAlpha.value = (kh.length ? 0.4 : 0.6) * clamp((DUR - t) / 0.6);
        g.rotation.y += dt * 0.25; r2.rotation.y -= dt * 0.8;
        r2.position.y = 4.5 + Math.sin(t * 0.8) * 0.5;
        ringMat.userData.setGlow(clamp((DUR - t) / 0.6));
        const kk = easeInOutCubic(clamp(t / 0.6)) * clamp((DUR - t) / 0.6);
        for (const h of kh) {
          h.I = 1.3 * kk;
          if (h.ph === undefined) continue;
          const a = h.ph + t * h.spd;
          h.pos.set(at.x, at.y + h.y + Math.sin(t * 0.7 + h.ph) * 0.4, at.z);
          h.fwd.set(Math.cos(a), 0, Math.sin(a)); h.up.set(Math.sin(t * 0.3 + h.ph) * 0.15, 1, 0).normalize();
        }
        moteT -= dt;
        if (kh.length && moteT <= 0 && t < DUR - 0.6) {
          moteT = 0.45;
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R * 0.8;
          _v.set(at.x + Math.cos(a) * rr, at.y + 0.6 + Math.random() * R * 0.45, at.z + Math.sin(a) * rr);
          G.fx.kit.mirrors(_v, 1, 1.6, { dur: 2.2 });
          G.fx.burst?.('moon_motes', _v, { scale: 1 });
        }
        return t < DUR;
      },
      dispose() {
        const i = S.timeBubbles.indexOf(bubble); if (i >= 0) S.timeBubbles.splice(i, 1);
        dome.removeFromParent(); g.removeFromParent(); mat.dispose(); ringMat.dispose();
        for (const h of kh) h.kill?.(0.3);
        G.fx?.burst('hit_moon', _v.copy(at).setY(at.y + 2), { scale: 1.5 });
      },
    });
    return { bubble, stop: () => { t = Math.max(t, DUR - 0.6); } };
  };

  return { pillars, daises };
}
