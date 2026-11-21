// Section 5 CODA, shot 2 (bar 38, 144 + 18 handle): she has walked up to the great lantern and kneels to offer (E, the
// game's own lighting cutscene); the fire takes at about f71 (beat 3) and the light washes over the dais and her.
// Profile from the west: she kneels lower left, the lantern towers right, the Moon wheel at the top edge. Slow push in.
export default {
  name: 'c2-lighting', frames: 162, preroll: 170, seed: 38,
  setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.life(false);
    G.gameplay.setBarrier(false, { instant: true });
    G.gameplay.setActive('crystal_puzzle', false);
    G.gameplay.setGreatLanternReady('gl_crystal', true);
    R.place(545, -287, 0);
  },
  start(G, T, R) { R.place(545, -287, 0); },
  actions: [
    { f: -93, key: 'KeyW', down: true }, { f: -3, key: 'KeyW', down: false },
    { f: -1, tap: 'KeyE' },                                 // interact: the game's lighting cutscene (ignites ~72 frames later)
    { f: 0, do: (G, T, R) => { const t0 = G.time.t; G.events.on('greatlantern:lit', () => R.log('LIT at f', ((G.time.t - t0) * 60).toFixed(1))); } },
  ],
  camera: {
    path: [
      { f: 0, pos: [539.2, 19.45, -281.5], look: [545.6, 20.9, -277.6], fov: 48 },
      { f: 162, pos: [540.4, 19.3, -280.8], look: [545.6, 20.8, -277.6], fov: 46 },
    ],
    ease: 'sine', shake: { pos: 0.015, look: 0.02, speed: 0.5 },
  },
};
