// Section 2 / bar 16: game camera behind her on the broom, diving (C held, camera tilted down) into 萤茸林, the glowing
// mushroom wood; real input. Blur 8.
const LOG = (f, G, R) => R.log('f' + f, G.player.state, G.player.pos.toArray().map((v) => v.toFixed(1)).join(','), JSON.stringify(R.lightAt(G.player.pos.x, G.player.pos.z)));
export default {
  name: 'w10-glowwood',
  frames: 162, preroll: 120, seed: 20, blur: 8,
  camera: 'game',
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.keepFull(true); R.place(340, 160, 0.85, G.world.heightAt(340, 160) + 30); },
  start(G, T, R) { const x = 315, z = 140; R.place(x, z, 0.85, G.world.heightAt(x, z) + 30); R.gameCam({ yaw: 0.85 + Math.PI - 0.35, pitch: -0.32, dist: 5 }); },
  actions: [
    { f: -115, tap: 'KeyF' }, { f: -110, key: 'KeyW', down: true }, { f: -110, key: 'KeyD', down: true },
    { f: 10, key: 'KeyC', down: true }, { f: 120, key: 'KeyC', down: false },
  ],
  onFrame(f, G, T, R) { if (f === -120 || f === 0 || f === 161) LOG(f, G, R); },
};
