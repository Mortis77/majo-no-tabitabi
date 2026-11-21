// Section 3, cell (a) 火·风, bars 17-18. Game camera. She throws three foxfires into the dusk meadow, the grass catches and
// spreads; at frame 172 she charges 龙卷 and the wind fans the blaze into a fire whirl (cast + fan reaction at f 250, accent 252).
// Timeline is the cell's: frame 0 = bar 17 downbeat. Used 0-216 (cut-in s3a2 takes 216-288).
const X = 40, Z = 198, FACE = Math.PI;
export default {
  name: 's3a1-fire-game', frames: 306, preroll: 90, seed: 11,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('fire');
    R.place(X, Z, FACE);
  },
  start(G, T, R) { R.place(X, Z, FACE); R.select('fire'); R.gameCam({ yaw: FACE + Math.PI + 0.35, pitch: -0.13, dist: 5.6 }); },
  camera: 'game',
  actions: [
    { f: -89, do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f)); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f)); } },
    { f: 2, tap: 'Mouse2' },
    { f: 24, lookRate: [-4, 0], frames: 12 },
    { f: 38, tap: 'Mouse2' },
    { f: 52, lookRate: [8, 0], frames: 12 },
    { f: 74, tap: 'Mouse2' },
    { f: 90, lookRate: [-4, 0], frames: 12 },
    { f: 150, tap: 'Digit4' },
    { f: 172, hold: 'Mouse2', frames: 58 },
    { f: 176, lookRate: [0, 1], frames: 25 },
    { f: 254, lookRate: [0, -1.5], frames: 50 },
  ],
  onFrame(f) { window.__f = f; },
};
