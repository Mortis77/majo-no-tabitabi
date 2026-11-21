// Rig proof shot: the heroine runs across the meadow below the shrine hill, game camera, HUD off. 3 s.
// Recorded twice to prove the takes are identical (tools/trailer/README.md "Determinism").
export default {
  name: 'test-run',
  frames: 180,
  preroll: 90,
  seed: 7,
  camera: 'game',
  setup(G, T, R) {
    R.hud(false);
    R.wildlife(false);
    R.clearCombat();
    R.weather('clear');
    R.freezeFidgets();
    R.place(-505, 120, -2.2);
  },
  start(G, T, R) {
    // final placement after the land settled: same spot, same facing, camera snapped behind her and a little to the side
    R.place(-505, 120, -2.2);
    R.gameCam({ yaw: -2.2 + Math.PI - 0.45, pitch: -0.12 });
  },
  actions: [
    { f: -40, key: 'KeyW', down: true },   // she is already running when the take starts
    { f: 175, key: 'KeyW', down: false },
  ],
};
