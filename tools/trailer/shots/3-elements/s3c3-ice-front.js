// s3c3: opens cell (c), used cell 0-72 (+18 handle): close front three-quarter as she charges 冰镜 (hold 9).
// Section 3, cell (c) 冰, bars 21-22. Game camera on the dusk river. She charges 冰镜 (hold f 9), the frost burst lands on the
// river at f 103 and freezes it into a sheet (and the boulder on the bank grows ice spikes); the camera lifts, she runs down
// the bank and her first step on the ice is at f 252 (the accent). Frame 0 = bar 21 downbeat. Used 0-144 (cut-in s3c2 from 144).
const X = 10.88, Z = 277.32, FACE = -0.75;
const START = 0;
export default {
  name: 's3c3-ice-front', frames: 90, preroll: 90 + START, seed: 21,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('ice');
    R.place(X, Z, FACE);
    { const ps = G.systems.find(s => s.name === 'player'), lu = ps.lateUpdate; ps.lateUpdate = function (...a) { const fc = G.debug.fixedCam, c = G.camera; if (!fc || !fc.view) return lu.apply(this, a); const p = c.position.clone(), q = c.quaternion.clone(); c.position.copy(fc.gp); c.quaternion.copy(fc.gq); c.updateMatrixWorld(); try { return lu.apply(this, a); } finally { c.position.copy(p); c.quaternion.copy(q); c.updateMatrixWorld(); } }; }   // aim with the player's camera, not the shot camera (game fault, see PROGRESS)
  },
  start(G, T, R) { R.place(X, Z, FACE); R.select('ice'); R.gameCam({ yaw: FACE + Math.PI, pitch: -0.5, dist: 5.6 }); },
  camera: (f, G, R) => {   // close front three-quarter on her casting
    const cf = f + START; if (cf < 0) return null;
    const P = G.player.pos, h = G.world.heightAt(P.x, P.z), A = G.player.aim.dir, F = Math.atan2(A.x, A.z), fx = Math.sin(F), fz = Math.cos(F), rx = -fz, rz = fx;
    const t = Math.min(1, (cf - 0) / 100), e = t * (2 - t), d = 2.8 - 0.3 * e;
    return { pos: [P.x + fx * d + rx * 1.6, h + 1.0 + 0.08 * e, P.z + fz * d + rz * 1.6], look: [P.x + fx * 0.2, h + 1.3, P.z + fz * 0.2], fov: 40 };
  },
  actions: [
    { f: -89, do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f)); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f)); } },
    { f: 9, hold: 'Mouse2', frames: 58 },
    { f: 112, lookRate: [0, -2.2], frames: 36 },
    { f: 191, key: 'KeyW', down: true },
    { f: 305, key: 'KeyW', down: false },
  ],
  onFrame(f, G, T, R) { window.__f = f + START; if (f >= 240 && f <= 260 && f % 3 === 0) { const p = G.player.pos; R.log('pos', f, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)); } },
};
