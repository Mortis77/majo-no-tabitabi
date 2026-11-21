import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';

// Fran uses the same elemental collision registry, projectile simulation and shield checks as the player.
// The persistent evaluation and the optional recollection share the fight, but record their outcomes separately.
export function createFranSpar(S) {
  const circle = new THREE.Group(),
    aim = new THREE.Vector3(),
    base = new THREE.Vector3();
  circle.name = 'journey:fran-aim';
  const chalk = new THREE.MeshBasicMaterial({ color: 0xdfbc79 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.035, 6, 42), chalk);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.23),
    new THREE.MeshBasicMaterial({ color: 0xffecd0 }),
  );
  diamond.scale.y = 1.7;
  circle.add(halo, diamond);
  G.scene.add(circle);
  circle.visible = false;
  const colors = [0xe2b974, 0xb89de3, 0x9ed0dd];
  let duel = null,
    last = null,
    serial = 0;
  function safeSave() {
    if (duel?.story) S.save();
  }
  function standing(x, z) {
    return G.world.groundAt(x, z, G.world.heightAt(x, z) + 1.2);
  }
  function pose(n, p, t, phase) {
    const side = Math.sin(t * 0.44) * 4.7,
      back = -4.4 - Math.cos(t * 0.37) * 2.2;
    const loc = base.clone().add(new THREE.Vector3(side, 0, back));
    loc.y = standing(loc.x, loc.z) + (phase ? 2.1 + 0.36 * Math.sin(t * 1.7) : 0);
    const yaw = Math.atan2(p.pos.x - loc.x, p.pos.z - loc.z);
    S.npcs.airPose('fran', loc, yaw, !!phase);
  }
  function start(story) {
    if (duel || (story && !S.near(S.anchor('franTrial'), 19)) || G.mode !== 'play') return;
    const P = G.player,
      n = S.npcs.get('fran');
    if (!n) return;
    base.copy(S.anchor('franTrial'));
    const vars = story ? S.vars() : {};
    const log = (vars.franDuel ||= {
      hits: 0,
      fired: 0,
      blocked: 0,
      reflected: 0,
      dodged: 0,
      taken: 0,
      attempts: 0,
    });
    const hp = Math.max(0, 42 - (log.hits || 0));
    duel = {
      story,
      log,
      hp,
      n,
      t: 0,
      stage: 'rest',
      wait: 1.1,
      opening: 0,
      missile: 0,
      shots: new Set(),
      id: ++serial,
      phase: 0,
      hpBefore: P.hp,
      manaBefore: P.mana,
      floor: P.damageFloor,
      onFloor: P.onDamageFloor,
      teamBefore: n.team,
    };
    const d = duel;
    n.team = 'enemy';
    n.height = 1.7;
    P.damageFloor = Math.max(1, Math.min(10, P.hp));
    P.onDamageFloor = () => {
      if (duel === d) d.exhausted = true;
    };
    d.reactor = G.elements?.register({
      owner: n,
      kind: 'creature',
      team: 'enemy',
      material: 'cloth',
      radius: 0.63,
      height: 1.85,
      living: true,
      getPos: () => n.pos,
      on: {
        hit(r, el, power, h) {
          if (duel !== d || h?.team !== 'player' || !h.source || d.hitLock > 0) return;
          const raw = Math.max(1, Math.min(h.damage ?? power * 7, 22));
          const amount = Math.min(d.hp, Math.max(1, Math.round(raw * (d.stage === 'opening' ? 1 : 0.32))));
          d.hp = Math.max(0, d.hp - amount);
          d.log.hits += amount;
          d.hitLock = 0.22;
          G.fx?.burst?.(
            d.stage === 'opening' ? 'hit_wind' : 'summon',
            n.pos.clone().add(new THREE.Vector3(0, 1.15, 0)),
            { scale: 0.6, color: 0xebd2ab },
          );
          G.npcs.gesture('fran', d.stage === 'opening' ? 'hit' : 'guard');
          safeSave();
        },
      },
    });
    if (!story) G.ui?.banner?.(t('story.spar.memory'), t('story.spar.memorySub'));
  }
  function stop(result, report = true) {
    const d = duel;
    if (!d) return;
    duel = null;
    circle.visible = false;
    if (d.reactor) G.elements?.unregister(d.reactor);
    for (const orb of d.shots) {
      if (orb.data?.franSpar !== d.id) continue;
      orb.damage = 0;
      orb.def = null;
      orb.life = orb.age;
    }
    d.shots.clear();
    d.n.team = d.teamBefore;
    const P = G.player;
    P.damageFloor = d.floor;
    P.onDamageFloor = d.onFloor;
    const a = S.anchor('franTrial');
    a.x += 3;
    a.z -= 1;
    S.npcs.airPose('fran', a, 0, false);
    G.ui?.bossBar?.(null);
    if (!report) return;
    last = { result, campaign: d.story, phase: d.phase, remaining: d.hp, ...d.log };
    P.hp = Math.min(P.maxHp, Math.max(P.hp, d.hpBefore));
    P.mana = Math.min(P.maxMana, Math.max(P.mana, d.manaBefore));
    if (d.story) {
      const v = S.vars();
      if (v) {
        v.franResult = result;
        S.save();
      }
    } else {
      G.state.story.practiceBouts = (G.state.story.practiceBouts || 0) + 1;
      S.save();
      G.ui?.toast?.(t('story.spar.' + result), { icon: 'wind', dur: 3 });
      S.npcs.stage(true);
    }
  }
  function aimAtPlayer(d) {
    aim.copy(G.player.pos);
    aim.y += 0.95;
    circle.position.copy(d.n.pos);
    circle.position.y += 1.5;
    circle.lookAt(aim);
    circle.visible = true;
    chalk.color.setHex(colors[d.log.fired % 3]);
    G.npcs.gesture('fran', d.phase ? 'cast_raise' : 'cast_throw');
  }
  function launch(d, offset) {
    const n = d.n,
      start = n.pos.clone();
    start.y += 1.3;
    const dir = aim.clone().sub(start).normalize().applyAxisAngle(G.scene.up, offset);
    start.addScaledVector(dir, 0.74);
    const k = d.log.fired % 3,
      el = ['wind', 'ice', 'water'][k],
      color = colors[k];
    const orb = G.spells?.shoot?.({
      el,
      shape: k === 1 ? 'lance' : 'orb',
      speed: d.phase ? 11 : 9,
      size: 0.36,
      radius: 0.28,
      dir,
      origin: start,
      team: 'enemy',
      owner: n,
      damage: d.phase ? 9 : 11,
      power: 0.7,
      life: 2.5,
      turn: 0,
      splash: 0.55,
      color,
      trail: { color, width: 0.15, life: 0.3 },
      spell: 'fran_stardust',
      data: { franSpar: d.id },
    });
    if (orb) d.shots.add(orb);
    G.audio?.sfx?.('cast_' + el, { pos: start, vol: 0.45 });
  }
  function tick(dt) {
    const id = S.current()?.id;
    if (!duel && id === 'duel' && !S.vars()?.franResult) start(true);
    const d = duel;
    if (!d) return;
    if (d.story && id !== 'duel') {
      stop('', false);
      return;
    }
    if (G.mode !== 'play') return;
    if (!S.near(base, 36)) {
      stop('left', false);
      S.npcs.stage(true);
      return;
    }
    d.t += dt;
    d.wait -= dt;
    d.hitLock = Math.max(0, (d.hitLock || 0) - dt);
    if (!d.phase && (d.hp <= 25 || d.log.fired >= 3)) {
      d.phase = 1;
      G.ui?.toast?.(t('story.spar.phase'), { icon: 'wind', dur: 2.5 });
    }
    pose(d.n, G.player, d.t, d.phase);
    if (
      d.hp <= 0 ||
      d.exhausted ||
      (d.log.fired >= 6 && d.log.attempts + d.log.dodged + d.log.blocked > 0)
    ) {
      stop(d.hp <= 0 ? 'break' : d.exhausted ? 'yield' : 'hold');
      return;
    }
    if (d.stage === 'windup') {
      circle.position.copy(d.n.pos);
      circle.position.y += 1.4;
      circle.lookAt(aim);
      const size = 1 + Math.max(0, d.wait) * 0.45;
      halo.scale.setScalar(size);
      diamond.rotation.y += dt * 5;
    }
    if (d.wait <= 0) {
      if (d.stage === 'rest') {
        d.stage = 'windup';
        d.wait = d.phase ? 0.83 : 1.24;
        aimAtPlayer(d);
      } else if (d.stage === 'windup') {
        circle.visible = false;
        launch(d, 0);
        if (d.phase) {
          launch(d, -0.23);
          launch(d, 0.23);
        }
        d.log.fired++;
        d.stage = 'opening';
        d.wait = d.phase ? 1.8 : 1.55;
        G.npcs.gesture('fran', 'cast_throw');
        safeSave();
      } else {
        d.stage = 'rest';
        d.wait = d.phase ? 0.7 : 1.0;
      }
    }
    d.hud = (d.hud || 0) - dt;
    if (d.hud <= 0) {
      d.hud = 0.14;
      G.ui?.bossBar?.({
        name: t('story.spar.name'),
        hp: d.hp,
        max: 42,
        kind: 'duel',
        element: 'wind',
        sub: t('story.spar.' + (d.stage === 'opening' ? 'open' : d.stage === 'windup' ? 'read' : 'ready')),
      });
    }
  }
  G.events.on('spell:cast', (e) => {
    if (duel && e.caster === G.player && e.spell !== 'guard') duel.log.attempts++;
  });
  G.events.on('player:dodge', () => {
    if (duel && duel.stage !== 'rest') duel.log.dodged++;
  });
  G.events.on('player:damaged', (e) => {
    if (duel && e.from === duel.n) duel.log.taken += e.amount;
  });
  G.events.on('spell:clash', (e) => {
    if (!duel || !['block', 'reflect'].includes(e.result)) return;
    if (e.pos?.distanceTo(G.player.pos) > 4) return;
    duel.log.blocked++;
    if (e.result === 'reflect') duel.log.reflected++;
    safeSave();
  });
  return {
    tick,
    start,
    reset() {
      stop('', false);
      last = null;
    },
    get last() {
      return last;
    },
    get active() {
      return !!duel;
    },
    get memory() {
      return !!duel && !duel.story;
    },
    get stats() {
      return duel ? { ...duel.log, phase: duel.phase, remaining: duel.hp, stage: duel.stage } : null;
    },
  };
}
