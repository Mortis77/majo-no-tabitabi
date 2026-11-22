// Original field trial finale. Everything in this shot belongs to the same world as the flight route.
import * as T from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';

const vector = (x, y, z) => new T.Vector3(x, y, z);
const impactTime = 4.8,
  endTime = 9.1;
const clamp = T.MathUtils.clamp;

function makeEffects() {
  const root = new T.Group();
  root.name = 'journey:trial-meteor';
  const focus = new T.Group(),
    fall = new T.Group(),
    wave = new T.Group(),
    target = new T.Group();
  root.add(focus, fall, wave, target);
  const flat = (color) => new T.MeshBasicMaterial({ color });
  const ember = flat(0xffbe62),
    white = flat(0xffefd0),
    lit = new T.MeshStandardMaterial({ color: 0x6b453e, roughness: 1, flatShading: true });
  function mesh(parent, g, m) {
    const o = new T.Mesh(g, m);
    parent.add(o);
    return o;
  }
  const sparks = [];
  for (let i = 0; i < 15; i++)
    sparks.push(mesh(focus, new T.OctahedronGeometry(0.045 + (i % 3) * 0.012), i % 3 ? white : ember));
  const coal = mesh(fall, new T.IcosahedronGeometry(6.9, 1), lit);
  coal.scale.set(1, 0.81, 0.85);
  const axis = vector(0.54, 1, -0.49).normalize(),
    up = vector(0, 1, 0);
  for (let i = 0; i < 8; i++) {
    const angle = i * 2.39996,
      offset = 2.6 * Math.sqrt(i / 8);
    const w = 2.1 + (i % 3) * 0.81,
      len = 19 + (i % 4) * 7;
    const flame = mesh(fall, new T.ConeGeometry(w, len, 5), i % 3 ? ember : white);
    flame.quaternion.setFromUnitVectors(up, axis);
    flame.position.copy(axis).multiplyScalar(len * 0.43 + 3.5);
    flame.position.x += Math.cos(angle) * offset;
    flame.position.z += Math.sin(angle) * offset;
    const hot = mesh(fall, new T.OctahedronGeometry(1.4), ember);
    hot.position.set(Math.sin(angle) * 5.7, Math.cos(angle) * 4.4, Math.cos(2 * angle) * 3.3);
  }
  const flint = new T.MeshBasicMaterial({ color: 0xffd892 });
  for (let i = 0; i < 12; i++) {
    const k = i / 11,
      angle = i * 2.39996,
      rad = 2.8 + 4.7 * k;
    const fleck = mesh(fall, new T.OctahedronGeometry(0.38 + 0.67 * (1 - k)), flint);
    fleck.position.copy(axis).multiplyScalar(5 + k * 46);
    fleck.position.x += Math.sin(angle) * rad;
    fleck.position.z += Math.cos(angle) * rad;
    fleck.scale.y = 1.65;
  }
  const flash = mesh(
    wave,
    new T.IcosahedronGeometry(1, 2),
    new T.MeshBasicMaterial({ color: 0xffe7af, transparent: true, opacity: 0, depthWrite: false }),
  );
  function ring(parent, r, color, opacity) {
    const mat = new T.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: T.DoubleSide,
    });
    const o = mesh(parent, new T.RingGeometry(r * 0.966, r, 80), mat);
    o.rotation.x = -Math.PI / 2;
    return o;
  }
  const incoming = ring(target, 34, 0xffcd83, 0.65),
    outer = ring(wave, 1, 0xffe5af, 1),
    foam = ring(wave, 1, 0xd4f5ef, 1);
  const shardMat = new T.MeshStandardMaterial({ color: 0x8d725b, roughness: 1, flatShading: true });
  const dustMat = new T.MeshBasicMaterial({
    color: 0xccb28c,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  function cloud(geometry, mat, count) {
    const o = new T.InstancedMesh(geometry, mat, count);
    o.frustumCulled = false;
    wave.add(o);
    return o;
  }
  const shards = cloud(new T.DodecahedronGeometry(1), shardMat, 34),
    dust = cloud(new T.IcosahedronGeometry(1, 1), dustMat, 26);
  G.scene.add(root);
  root.visible = false;
  return { root, focus, sparks, fall, coal, target, incoming, wave, outer, foam, shards, dust, flash };
}

export function createFranMeteor(S) {
  let effect = null,
    shot = null;
  const temp = new T.Object3D(),
    focusWorld = new T.Vector3();
  function start() {
    effect ||= makeEffects();
    const fx = effect,
      n = S.npcs.get('fran');
    const a = G.world.trialLake;
    const point = vector(a.x, G.world.heightAt(a.x, a.z), a.z);
    shot = { time: 0, point, n, wide: false, impact: false };
    fx.root.visible = true;
    fx.focus.visible = true;
    fx.fall.visible = false;
    fx.target.visible = false;
    fx.wave.visible = false;
    fx.target.position.copy(point);
    fx.target.position.y += 1.2;
    G.setMode('cutscene');
    G.player.setControl(false);
    S.npcs.gesture('fran', 'cast_raise');
    const teacher = n.pos,
      close = teacher.clone().add(vector(-2.65, 1.6, 3.5));
    G.cam.cinematic({ pos: close, look: teacher.clone().add(vector(0, 1.38, 0)), dur: 0.36 });
    G.ui?.toast?.(t('story.spar.valley', { skip: t(G.input?.touch ? 'story.spar.skipTouch' : 'story.spar.skipKey') }), { dur: 3.3, icon: 'earth' });
    G.audio?.sfx?.('cast_earth', { pos: teacher, vol: 0.7 });
  }
  function hit() {
    if (!shot || shot.impact) return;
    shot.impact = true;
    if (!G.state.flags.majo_trial_lake) {
      G.world.setTrialLake(true);
      G.state.flags.majo_trial_lake = true;
      G.events.emit('journey:trial-impact', { x: shot.point.x, z: shot.point.z });
      S.save();
    }
    effect.fall.visible = false;
    effect.target.visible = false;
    effect.wave.position.copy(shot.point);
    effect.wave.position.y = 0.62;
    effect.wave.visible = true;
    G.fx.shake(0.38, 0.72);
    G.audio?.sfx?.('shatter_rock', { vol: 0.85 });
    G.audio?.sfx?.('quake', { vol: 0.92 });
  }
  function release() {
    if (!shot) return;
    shot = null;
    effect.root.visible = false;
    G.cam.release();
    if (G.mode === 'cutscene') {
      G.setMode('play');
      G.player.setControl(true);
    }
  }
  function tick(dt) {
    if (
      !shot &&
      G.mode === 'play' &&
      S.current()?.id === 'duel' &&
      S.vars()?.franResult &&
      !G.state.flags.majo_trial_lake &&
      S.near(S.anchor('franTrial'), 38)
    )
      start();
    if (!shot) return;
    const f = effect,
      d = shot,
      p = d.point;
    d.time += dt;
    if (d.time > 0.55 && G.input.codePressed('Enter')) {
      hit();
      release();
      return;
    }
    if (!d.wide) {
      const n = d.n;
      if (n.wand) {
        n.wand.updateWorldMatrix(true, false);
        focusWorld.set(0.009, 0.275, -0.003);
        n.wand.localToWorld(focusWorld);
      } else focusWorld.copy(n.pos).add(vector(0.28, 1.4, 0));
      f.focus.position.copy(focusWorld);
      for (let i = 0; i < f.sparks.length; i++) {
        const progress = (d.time * 0.75 + i / 15) % 1,
          radius = (1 - progress) * 0.92 + 0.03,
          angle = d.time * 4 + i * 2.4;
        f.sparks[i].position.set(
          Math.cos(angle) * radius,
          (1 - progress) * 0.45 + 0.15 * Math.sin(angle * 1.5),
          Math.sin(angle) * radius,
        );
        f.sparks[i].scale.setScalar(0.5 + progress);
      }
      if (d.time >= 1.85) {
        d.wide = true;
        f.focus.visible = false;
        f.target.visible = true;
        S.npcs.gesture('fran', 'cast_throw');
        const from = p.clone().add(vector(112, 84, 117)),
          look = p.clone().add(vector(-2, 30, -4));
        G.cam.cinematic({ pos: from, look, dur: 0.033 });
      }
    }
    if (d.wide && !d.impact) {
      const u = clamp((d.time - 2.05) / (impactTime - 2.05), 0, 1),
        h = 1 - (u * 0.46 + u * u * 0.54);
      f.fall.visible = d.time > 2.05;
      f.fall.position.copy(p).add(vector(62 * h, 114 * h + 1, -56 * h));
      f.coal.rotation.set(u * 0.8, u * 2.6, u);
      f.incoming.scale.setScalar(0.58 + 0.45 * u);
      f.incoming.material.opacity = 0.5 + 0.42 * Math.sin(Math.PI * u);
      if (d.time >= impactTime) hit();
    }
    if (d.impact) {
      const age = Math.max(0, d.time - impactTime),
        fade = clamp(1 - age / 3, 0, 1);
      f.flash.visible = age < 0.55;
      f.flash.scale.set(5 + age * 55, 3 + age * 37, 5 + age * 55);
      f.flash.material.opacity = 0.75 * clamp(1 - age / 0.55, 0, 1);
      f.outer.scale.setScalar(5 + age * 39);
      f.outer.material.opacity = fade * 0.82;
      f.foam.scale.setScalar(1 + Math.max(0, age - 0.15) * 23);
      f.foam.material.opacity = fade * 0.85;
      for (let i = 0; i < f.shards.count; i++) {
        const angle = i * 2.39996,
          r = 3 + (10 + ((i * 17) % 21)) * age,
          vy = 15 + ((i * 13) % 20);
        temp.position.set(
          Math.cos(angle) * r,
          Math.max(-8, 3 + vy * age - 11.9 * age * age),
          Math.sin(angle) * r,
        );
        temp.rotation.set(i + age * (0.4 + (i % 4)), age * 1.5, i);
        const scale = (1.02 + (i % 3) * 0.45) * clamp(3.3 - age, 0, 1);
        temp.scale.set(scale, scale * 0.73, scale * 0.88);
        temp.updateMatrix();
        f.shards.setMatrixAt(i, temp.matrix);
      }
      f.shards.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < f.dust.count; i++) {
        const angle = i * 2.39996,
          r = 5 + age * (5 + ((i * 7) % 8)),
          y = 1 + age * (3 + ((i * 5) % 6));
        temp.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
        temp.rotation.set(i, i + age * 0.14, 0);
        const s = (1.1 + age * 2.6) * (1 + (i % 3) * 0.21);
        temp.scale.set(s * 1.8, s * 0.68, s * 1.25);
        temp.updateMatrix();
        f.dust.setMatrixAt(i, temp.matrix);
      }
      f.dust.instanceMatrix.needsUpdate = true;
      f.dust.material.opacity = 0.51 * clamp((2.95 - age) / 1.7, 0, 1);
      if (age > 1.15 && !d.settle) {
        d.settle = true;
        G.cam.cinematic({ pos: p.clone().add(vector(100, 86, 110)), look: p, dur: 1.05 });
      }
    }
    if (d.time > 8.65 && !d.returning) {
      d.returning = true;
      const teacher = d.n.pos,
        hero = G.player.pos,
        face = teacher.clone().lerp(hero, 0.42);
      G.cam.cinematic({
        pos: face.clone().add(vector(-4.5, 2.25, 4.4)),
        look: face.add(vector(0, 1.1, 0)),
        dur: 0.04,
      });
    }
    if (d.time >= endTime) release();
  }
  return {
    tick,
    reset: release,
    get active() {
      return !!shot;
    },
    get time() {
      return shot?.time || 0;
    },
  };
}
