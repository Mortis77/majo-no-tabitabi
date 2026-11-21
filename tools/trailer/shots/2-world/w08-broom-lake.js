// Section 2 / bar 14: skimming the mirror lake on the broom, spray off the water, the isle of the mirror lantern behind her.
// Side follow from her right, low over the water; she travels left to right. Blur 12.
const LOG = (f, G, R) => R.log('f' + f, G.player.state, G.player.pos.toArray().map((v) => v.toFixed(1)).join(','), JSON.stringify(R.lightAt(G.player.pos.x, G.player.pos.z)));
export default {
  name: 'w08-broom-lake',
  frames: 162, preroll: 120, seed: 18, blur: 12,
  camera: { follow: 'side', dist: 5.2, height: 0.5, lookHeight: 0.9, fov: 40, smooth: 0,
    keys: [{ f: 0, yaw: 0.45, dist: 5.0 }, { f: 161, yaw: -0.2, dist: 5.6 }], ease: 'inOut', minClear: 0.3 },
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.keepFull(true); R.place(40, 445, Math.PI / 2, 6); },
  start(G, T, R) { R.place(5, 445, Math.PI / 2, 5); R.gameCam({ yaw: Math.PI / 2 + Math.PI, pitch: -0.2 }); },
  actions: [
    { f: -115, tap: 'KeyF' }, { f: -110, key: 'KeyW', down: true }, { f: -110, key: 'ShiftLeft', down: true },
    { f: -110, key: 'KeyC', down: true },
  ],
  onFrame(f, G, T, R) { if (f === -120 || f === 0 || f === 161) LOG(f, G, R); },
};
