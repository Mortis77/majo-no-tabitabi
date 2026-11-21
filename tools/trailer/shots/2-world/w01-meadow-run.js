// Section 2 / bar 7: the theme enters on motion. Game camera behind her, real input (W+D+Shift): she sprints east through
// the meadow below the shrine hill, grass parting, the fox spirit at her shoulder; screen motion to the right.
export default {
  name: 'w01-meadow-run',
  frames: 162, preroll: 90, seed: 11,
  camera: 'game',
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-548, 138, Math.PI / 2); },
  start(G, T, R) { R.place(-548, 138, Math.PI / 2); R.gameCam({ yaw: -Math.PI / 4, pitch: -0.1, dist: 4.2 }); },
  actions: [
    { f: -80, key: 'KeyW', down: true }, { f: -80, key: 'KeyD', down: true }, { f: -80, key: 'ShiftLeft', down: true },
  ],
};
