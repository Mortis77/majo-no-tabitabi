// s3b2: cut-in, used cell 108-180 (+18 handle).
// Section 3, cell (b) 水, bars 19-20 (cell frames 0-288; accent 252). One play, three cameras (s3b1/s3b2/s3b3 share it):
// a foxfire lit the dusk meadow in the preroll (ignite cell -66); she throws two 涟珠 splashes into the blaze (casts 16, 48:
// steam + smoke at 57 and 88), charges 祈雨, the cloud gathers and the rain drowns the blaze;
// (hold 51, cast 129): the flames sink in the rain and the last go out ON cell 252 (fire cells removed at 252). Tick phase of the fire automaton depends on the preroll: keep 195 + START.
// The player-aim fix: the game aims with G.camera, which boot.js sets to the view-only shot camera before lateUpdate
// (a game fault); the wrapper below lets the player system aim with the player's own camera, so a cut-in does not steer her.
const X = 40, Z = 198, FACE = Math.PI, START = 108;
const C = (f) => f - START;
export default {
  name: 's3b2-water-front', frames: 90, preroll: 195 + START, seed: 11,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('fire'); R.place(X, Z, FACE);
    { const ps = G.systems.find(s => s.name === 'player'), lu = ps.lateUpdate; ps.lateUpdate = function (...a) { const fc = G.debug.fixedCam, c = G.camera; if (!fc || !fc.view) return lu.apply(this, a); const p = c.position.clone(), q = c.quaternion.clone(); c.position.copy(fc.gp); c.quaternion.copy(fc.gq); c.updateMatrixWorld(); try { return lu.apply(this, a); } finally { c.position.copy(p); c.quaternion.copy(q); c.updateMatrixWorld(); } }; }
  },
  start(G, T, R) { R.place(X, Z, FACE); R.select('fire'); R.gameCam({ yaw: FACE + Math.PI + 0.35, pitch: -0.18, dist: 5.6 }); },
  camera: (f, G, R) => {   // close front three-quarter on her as she charges and the bead rises; used cell 108-144
    const cf = f + START; if (cf < 72) return null;
    const P = G.player.pos, a = 0.31, fx = Math.sin(Math.PI + a), fz = Math.cos(Math.PI + a), rx = -fz, rz = fx;
    const t = Math.min(1, (cf - 72) / 90), e = t * (2 - t), h = G.world.heightAt(P.x, P.z), d = 3.6 - 0.7 * e;
    return { pos: [P.x + fx * d + rx * 1.7, h + 1.0 + 0.15 * e, P.z + fz * d + rz * 1.7], look: [P.x - rx * 0.3, h + 1.35 + 0.3 * e, P.z - rz * 0.3], fov: 42 };
  },
  actions: [
    { f: C(-194), do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f, JSON.stringify(G.player.aim.point))); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f, e.count || '')); } },
    { f: C(-110), tap: 'Mouse2' },
    { f: C(-20), tap: 'Digit2' },
    { f: C(0), lookRate: [-4, 0], frames: 6 },
    { f: C(8), tap: 'Mouse2' },
    { f: C(26), lookRate: [6, 0], frames: 8 },
    { f: C(40), tap: 'Mouse2' },
    { f: C(46), lookRate: [-2, 0], frames: 4 },
    { f: C(51), hold: 'Mouse2', frames: 58 },
  ],
  onFrame(f, G, T, R) { window.__f = f + START; if (f + START > 236 && f + START < 272) R.log('FIRE', f + START, G.elements.fireCount); },
};
