// Prologue shot 3 (bar 3, 144 + 18): from the bamboo edge west of the fox village, looking east: the Sun wheel with the
// Moon wheel beside it (the two sisters), the Veil itself rising over the land, the fox-village roofs below. A slow crane up.
export default {
  name: 'p1-03-sun-veil',
  frames: 162,
  preroll: 90,
  seed: 203,
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-81, 80, Math.PI / 2); },
  start(G, T, R) { R.place(-81, 80, Math.PI / 2); R.gameCam({ yaw: Math.PI / 2, pitch: 0 }); },
  camera: {
    path: [
      { f: 0,   pos: [-150, 12, 92], look: [-60, 46, 68], fov: 50 },
      { f: 161, pos: [-148, 17.5, 91], look: [-60, 49.5, 68], fov: 50 },
    ],
    ease: 'linear',
  },
};
