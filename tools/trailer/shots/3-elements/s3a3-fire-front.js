// s3a3: cut-in for cell (a), used cell 180-252 (+18 handle): close front three-quarter as she charges 龙卷 (cast 250).
// Section 3, cell (a) 火·风, bars 17-18. Game camera. She throws three foxfires into the dusk meadow, the grass catches and
// spreads; at frame 172 she charges 龙卷 and the wind fans the blaze into a fire whirl (cast + fan reaction at f 250, accent 252).
// Timeline is the cell's: frame 0 = bar 17 downbeat. Used 0-216 (cut-in s3a2 takes 216-288).
const X = 40, Z = 198, FACE = Math.PI;
const START = 180;
export default {
  name: 's3a3-fire-front', frames: 90, preroll: 90 + START, seed: 11,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('fire');
    R.place(X, Z, FACE);
    { const ps = G.systems.find(s => s.name === 'player'), lu = ps.lateUpdate; ps.lateUpdate = function (...a) { const fc = G.debug.fixedCam, c = G.camera; if (!fc || !fc.view) return lu.apply(this, a); const p = c.position.clone(), q = c.quaternion.clone(); c.position.copy(fc.gp); c.quaternion.copy(fc.gq); c.updateMatrixWorld(); try { return lu.apply(this, a); } finally { c.position.copy(p); c.quaternion.copy(q); c.updateMatrixWorld(); } }; }   // aim with the player's camera, not the shot camera (game fault, see PROGRESS)
  },
  start(G, T, R) { R.place(X, Z, FACE); R.select('fire'); R.gameCam({ yaw: FACE + Math.PI + 0.35, pitch: -0.13, dist: 5.6 }); },
  camera: (f, G, R) => {   // close front three-quarter on her casting
    const cf = f + START; if (cf < 180) return null;
    const P = G.player.pos, h = G.world.heightAt(P.x, P.z), F = FACE, fx = Math.sin(F), fz = Math.cos(F), rx = -fz, rz = fx;
    const t = Math.min(1, (cf - 180) / 100), e = t * (2 - t), d = 2.8 - 0.3 * e;
    return { pos: [P.x + fx * d + rx * -1.6, h + 1.0 + 0.08 * e, P.z + fz * d + rz * -1.6], look: [P.x + fx * 0.2, h + 1.3, P.z + fz * 0.2], fov: 40 };
  },
  actions: [
    { f: -269, do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f)); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f)); } },
    { f: -178, tap: 'Mouse2' },
    { f: -156, lookRate: [-4, 0], frames: 12 },
    { f: -142, tap: 'Mouse2' },
    { f: -128, lookRate: [8, 0], frames: 12 },
    { f: -106, tap: 'Mouse2' },
    { f: -90, lookRate: [-4, 0], frames: 12 },
    { f: -30, tap: 'Digit4' },
    { f: -8, hold: 'Mouse2', frames: 58 },
    { f: -4, lookRate: [0, 1], frames: 25 },
    { f: 74, lookRate: [0, -1.5], frames: 50 },
  ],
  onFrame(f) { window.__f = f + START; },
};
