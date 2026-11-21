// Section 2 / bar 8 (re-shoot): game camera low behind her, tilted up (the game pulls in when looking up), real input (W+D+Shift): she sprints east through
// the meadow toward the village, grass parting at her feet, the fox spirit at her shoulder; screen motion to the right.
// Follows the low side track (w02) that now opens the section on the theme.
export default {
  name: 'w01b-meadow-run-close',
  frames: 162, preroll: 90, seed: 11,
  camera: 'game',
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-540, 164, Math.PI / 2); },
  start(G, T, R) { R.place(-540, 164, Math.PI / 2); R.gameCam({ yaw: -Math.PI / 4, pitch: 0.4, dist: 3.4 }); },
  actions: [
    { f: -80, key: 'KeyW', down: true }, { f: -80, key: 'KeyD', down: true }, { f: -80, key: 'ShiftLeft', down: true },
  ],
};
