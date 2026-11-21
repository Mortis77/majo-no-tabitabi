// Section 3, cell (c) cut-in: cell frames 144-306. Same play as s3c1 (offset S; earlier frames in the preroll, game camera).
// A low camera standing on the new ice, looking back at the bank: she runs down and steps onto the ice at recorded 108 (cell 252).
// Cell (c) 冰, bars 21-22. On the dusk river. She charges 冰镜 (hold f 9), the frost burst lands on the
// river at f 103 and freezes it into a sheet (and the boulder on the bank grows ice spikes); the camera lifts, she runs down
// the bank and her first step on the ice is at f 252 (the accent). Frame 0 = bar 21 downbeat. Used 0-144 (cut-in s3c2 from 144).
const X = 10.88, Z = 277.32, FACE = -0.75, S = -144;
export default {
  name: 's3c2-ice-cut', frames: 162, preroll: 90 - S, seed: 21,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('ice');
    R.place(X, Z, FACE);
  },
  start(G, T, R) { R.place(X, Z, FACE); R.select('ice'); R.gameCam({ yaw: FACE + Math.PI, pitch: -0.5, dist: 5.6 }); },
  camera: (f, G, R) => {
    if (f < 0) return null;
    const t = Math.min(1, f / 162), e = t * t * (3 - 2 * t);
    return { pos: [1.6 + 0.8 * e, 1.15 + 0.1 * e, 288.2 - 0.9 * e], look: [6.4 - 1.2 * e, 1.0, 282.0 + 0.8 * e], fov: 42 - 4 * e };
  },
  actions: [
    { f: S - 89, do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f)); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f)); } },
    { f: S + 9, hold: 'Mouse2', frames: 58 },
    { f: S + 112, lookRate: [0, -2.2], frames: 36 },
    { f: S + 191, key: 'KeyW', down: true },
    { f: S + 305, key: 'KeyW', down: false },
  ],
  onFrame(f, G, T, R) { window.__f = f; if (f >= 240 + S && f <= 260 + S && f % 3 === 0) { const p = G.player.pos; R.log('pos', f, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)); } },
};
