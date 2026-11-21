// Section 2 / bar 9 (the pulse enters): game camera, real input (W+D+Shift). She sprints east along the edge of the field of
// 朝颜村; the farmer is at work with his hoe ahead on her left (she passes about 10 m off that he keeps working), the
// thatched houses and the elder's well behind him. Camera looks north-east, so she moves to the screen's right.
export default {
  name: 'w03-village',
  frames: 162, preroll: 100, seed: 13,
  camera: 'game',
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-436, 183, Math.PI / 2); },
  start(G, T, R) { R.place(-446, 183, Math.PI / 2); R.gameCam({ yaw: -Math.PI / 4 + 0.25, pitch: -0.08, dist: 4.2 }); },
  actions: [{ f: -84, key: 'KeyW', down: true }, { f: -84, key: 'KeyD', down: true }, { f: -84, key: 'ShiftLeft', down: true }],
  onFrame(f, G, T, R) {
    if (f === -100 || f === 0 || f === 80 || f === 161) {
      const fp = G.npcs.posOf('farmer');
      R.log('f' + f, G.player.pos.toArray().map((v) => v.toFixed(1)).join(','), 'farmer', fp && fp.toArray().map((v) => v.toFixed(1)).join(','));
    }
  },
};
