// Section 2 / bar 12: the glide. Game camera behind her, looking out east over the land: the green day land below, the red
// dusk band beyond, the lasting night and the Moon palace on the horizon. Real input: jump held, W.
export default {
  name: 'w06-glide',
  frames: 162, preroll: 90, seed: 16,
  camera: 'game',
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-470, 70, 1.45, 50); },
  start(G, T, R) { R.place(-474, 74, 1.45, 50); R.gameCam({ yaw: 1.45 + Math.PI, pitch: -0.2, dist: 4.8 }); },
  actions: [{ f: -88, key: 'Space', down: true }, { f: -88, key: 'KeyW', down: true }],
  onFrame(f, G, T, R) { if (f === -90 || f === 0 || f === 161) R.log('f' + f, G.player.state, G.player.pos.toArray().map((v) => v.toFixed(1)).join(','), JSON.stringify(R.lightAt(G.player.pos.x, G.player.pos.z))); },
};
