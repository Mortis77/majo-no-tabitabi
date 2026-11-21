// Section 4, bars 27–32: shade creatures rise out of ink blots around her on the crystal plain at night, then the fight
// as a player fights it: lock-on, talismans, a dodge, a guard that flashes, a fire cast and the 金环 that scatters them.
// One performance, recorded twice with the same seed and inputs (only the camera differs) so the edit can cross-cut:
//   fight-game.js  the player's own lock-on camera
//   fight-side.js  a low wide for the rise, then a low side angle that keeps her and her target in frame
// Generated from fight.template.js by gen-fight.mjs.
const CX = 500, CZ = -290, YAW0 = -0.59;
export default {
  name: 'fight-game', frames: 920, preroll: 90, seed: 27,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all', 2); R.select('fire'); R.fill();
    R.place(CX, CZ, YAW0);
    await R.settle();
    // cache every foe model before the shot
    for (const t of ['wolf', 'blob', 'caster', 'moth']) R.spawn(t, CX + 30, CZ, { aggro: false });
    await R.step(20); R.clearCombat();
  },
  start(G, T, R) {
    R.clearCombat(); R.place(CX, CZ, YAW0); R.fill(); R.keepFull(true); R.select('fire');
    R.gameCam({ yaw: YAW0 + Math.PI, pitch: -0.12 });
    window.__fs = { dodged: false, guarded: false, upD: null, upR: null, lockT: -99, ev: [] };
    // crystal spires near the plain (instanced flora): the side camera keeps clear of them
    const crys = []; const m = new (G.scene.matrixWorld.constructor)(); const v = G.player.pos.clone();
    G.scene.updateMatrixWorld(true);
    G.scene.traverse((o) => { if (!o.isInstancedMesh || !/crys/i.test(o.name || '')) return;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); v.setFromMatrixPosition(m);
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (Math.hypot(v.x - CX, v.z - CZ) < 45) crys.push([v.x, v.z, Math.hypot(m.elements[0], m.elements[1], m.elements[2]) * o.geometry.boundingSphere.radius]); } });
    window.__crys = crys; R.log('crystals', crys.length, JSON.stringify(crys.slice(0, 6).map((c) => c.map((x) => +x.toFixed(1)))));
    // floating damage numbers are part of the HUD, not the world: keep them out of the trailer picture
    G.scene.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.corner && o.geometry.attributes.t0) { Object.defineProperty(o, 'visible', { get: () => false, set: () => {} }); R.log('damage numbers hidden'); } });
    G.events.on('spell:clash', (e) => { if (e && e.a === 'guard') R.log('GUARD', e.result, 'f', window.__rigF); });
    G.events.on('enemy:killed', (e) => R.log('KILL', e.type, 'f', window.__rigF));
  },
  camera: 'game',
  actions: [
    { f: 14, do: (G) => G.combat.spawnWave([['wolf', 3], ['blob', 2], ['caster', 1], ['blob', 1]], { x: G.player.pos.x, z: G.player.pos.z }, { r: 7.5, stagger: 0.32, hpMul: 4 }) },
    { f: 170, tap: 'KeyT' },
    { f: 300, hold: 'Mouse0', frames: 46 },
    { f: 372, hold: 'Mouse0', frames: 40 },
    { f: 596, do: (G, T, R) => R.log('selected', G.spells.selected, G.state.selected, JSON.stringify(Object.keys(G.spells).slice(0,40))) },
    { f: 600, tap: 'Mouse2' },
    { f: 640, tap: 'Mouse2' },
    { f: 700, tap: 'KeyG' },
    { f: 800, hold: 'Mouse0', frames: 50 },
  ],
  onFrame(f, G, T, R) {
    window.__rigF = f;
    // the small floating enemy health bars are HUD, not the world: keep them out of the trailer picture
    for (const e of G.combat.enemies) if (e.bar && !e.bar.__mvHid) { e.bar.__mvHid = 1; Object.defineProperty(e.bar, 'visible', { get: () => false, set: () => {} }); }
    const S = window.__fs; if (!S) return;
    const P = G.player, C = G.combat;
    if (S.upD !== null && f >= S.upD) { T.key('KeyD', false); S.upD = null; }
    if (S.upR !== null && f >= S.upR) { T.key('KeyR', false); S.upR = null; }
    // keep a lock once the fight is on
    if (f > 180 && f - S.lockT > 20 && (!C.lockTarget || C.lockTarget.dead)) { T.key('KeyT', true); setTimeout(() => T.key('KeyT', false), 34); S.lockT = f; }
    // the dodge: the first wolf lunge that is about to land between f 420 and 540 (fallback at 540)
    if (!S.dodged && f >= 400) {
      let go = f >= 560;
      for (const e of C.enemies) if (!e.dead && e.atk && e.atk.name === 'lunge' && e.atk.fired && e.atk.t < e.atk.windup + 0.12 && e.pos.distanceTo(P.pos) < 9) go = true;
      if (go) { S.dodged = true; T.key('KeyD', true); S.upD = f + 22; setTimeout(() => { T.key('KeyQ', true); setTimeout(() => T.key('KeyQ', false), 34); }, 17); R.log('DODGE f', f); }
    }
    // the guard: the first hostile orb about to reach her between f 470 and 600
    if (!S.guarded && f >= 440 && f < 690) {
      let go = false;
      for (const p of (G.spells.projectiles || [])) { if (p && p.alive && p.team !== 'player' && p.pos.distanceTo(P.pos) < 4.5) go = true; }
      if (go) { S.guarded = true; T.key('KeyR', true); S.upR = f + 30; R.log('GUARD UP f', f); }
    }
    if (f % 30 === 0 && f >= 0) { const a = C.enemies.filter((e) => !e.dead && e.atk).map((e) => e.type + ':' + e.atk.name + '@' + e.pos.distanceTo(P.pos).toFixed(1)); if (a.length) R.log('atk f', f, a.join(' ')); }
    if (f % 60 === 0 && f >= 0) R.log('f', f, 'enemies', C.enemies.filter((e) => !e.dead).length, 'lock', C.lockTarget && C.lockTarget.type, 'P', P.pos.x.toFixed(1), P.pos.z.toFixed(1), 'gauge', (G.state.gauge || 0).toFixed(2));
  },
};
