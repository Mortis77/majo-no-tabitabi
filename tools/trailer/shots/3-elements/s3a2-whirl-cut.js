// Section 3, cell (a) cut-in ON the accent: cell frames 252-306 (bar 18 beat 4 to the handle). Same play as s3a1 (shifted by S;
// everything earlier runs in the preroll with the game camera). A low camera behind her right shoulder tilting up the whirl.
// NOTE (game fault): the terrain clutter update moves G.camera to a view-only test camera mid-frame, so the aim ray follows the
// shot camera. Cut-ins therefore start after the cell's last cast, and the camera is null (game camera) in the preroll.
const X = 40, Z = 198, FACE = Math.PI, S = -252;
const gy = (G, x, z) => G.world.groundAt(x, z);
export default {
  name: 's3a2-whirl-cut', frames: 54, preroll: 90 - S, seed: 11,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('fire');
    R.place(X, Z, FACE);
  },
  start(G, T, R) { R.place(X, Z, FACE); R.select('fire'); R.gameCam({ yaw: FACE + Math.PI + 0.35, pitch: -0.13, dist: 5.6 }); },
  camera: (f, G, R) => {
    if (f < 0) return null;
    const h = gy(G, X, Z);
    const t = Math.min(1, f / 54), e = t * (2 - t);
    return { pos: [X + 6.5 - 0.8 * e, h + 0.7 + 0.2 * e, Z + 7.0 - 0.8 * e], look: [37.5, h + 4.0 + 4.0 * e, 188], fov: 54 - 3 * e };
  },
  actions: [
    { f: S - 89, do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f)); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f)); } },
    { f: S + 2, tap: 'Mouse2' },
    { f: S + 24, lookRate: [-4, 0], frames: 12 },
    { f: S + 38, tap: 'Mouse2' },
    { f: S + 52, lookRate: [8, 0], frames: 12 },
    { f: S + 74, tap: 'Mouse2' },
    { f: S + 90, lookRate: [-4, 0], frames: 12 },
    { f: S + 150, tap: 'Digit4' },
    { f: S + 172, hold: 'Mouse2', frames: 58 },
    { f: S + 176, lookRate: [0, 1], frames: 25 },
    { f: S + 254, lookRate: [0, -1.5], frames: 50 },
  ],
  onFrame(f) { window.__f = f; },
};
