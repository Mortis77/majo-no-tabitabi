// Section 3, cell (c) 冰, bars 21-22. Game camera on the dusk river. She charges 冰镜 (hold f 9), the frost burst lands on the
// river at f 103 and freezes it into a sheet (and the boulder on the bank grows ice spikes); the camera lifts, she runs down
// the bank and her first step on the ice is at f 252 (the accent). Frame 0 = bar 21 downbeat. Used 0-144 (cut-in s3c2 from 144).
const X = 10.88, Z = 277.32, FACE = -0.75;
export default {
  name: 's3c1-ice-game', frames: 306, preroll: 90, seed: 21,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('ice');
    R.place(X, Z, FACE);
  },
  start(G, T, R) { R.place(X, Z, FACE); R.select('ice'); R.gameCam({ yaw: FACE + Math.PI, pitch: -0.5, dist: 5.6 }); },
  camera: 'game',
  actions: [
    { f: -89, do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f)); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f)); } },
    { f: 9, hold: 'Mouse2', frames: 58 },
    { f: 112, lookRate: [0, -2.2], frames: 36 },
    { f: 191, key: 'KeyW', down: true },
    { f: 305, key: 'KeyW', down: false },
  ],
  onFrame(f, G, T, R) { window.__f = f; if (f >= 240 && f <= 260 && f % 3 === 0) { const p = G.player.pos; R.log('pos', f, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)); } },
};
