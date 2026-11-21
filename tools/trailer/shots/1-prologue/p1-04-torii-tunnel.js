// Prologue shot 4 (bar 4, 144 + 18): inside the 千本鸟居 tunnel of the fox village, a slow push up the path between
// the vermilion posts toward the light, fox-fire lanterns overhead.
export default {
  name: 'p1-04-torii-tunnel',
  frames: 162,
  preroll: 90,
  seed: 204,
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-81, 80, Math.PI / 2); },
  start(G, T, R) { R.place(-81, 80, Math.PI / 2); R.gameCam({ yaw: Math.PI / 2, pitch: 0 }); },
  camera: {
    path: [
      { f: 0,   pos: [-68.2, 7.0, 74.5], look: [-63.1, 8.0, 28], fov: 42 },
      { f: 161, pos: [-67.77, 7.5, 69.5], look: [-63.0, 8.5, 27], fov: 42 },
    ],
    ease: 'linear',
  },
};
