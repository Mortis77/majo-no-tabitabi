// Section 2 / bar 13: over the red dusk wood she lets go of the wings and calls the broom (F): it appears under her and she
// flies on toward the 千年枫. Game camera behind her, real input (F, W, Shift, D strafe for screen-right drift). Blur 8.
const LOG = (f, G, R) => R.log('f' + f, G.player.state, G.player.pos.toArray().map((v) => v.toFixed(1)).join(','), JSON.stringify(R.lightAt(G.player.pos.x, G.player.pos.z)));
export default {
  name: 'w07-broom-dusk',
  frames: 162, preroll: 90, seed: 17, blur: 8,
  camera: 'game',
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.keepFull(true); R.place(-120, -110, 2.11, G.world.heightAt(-120, -110) + 45); },
  start(G, T, R) { const x = -135, z = -100; R.place(x, z, 2.11, G.world.heightAt(x, z) + 42); R.gameCam({ yaw: 2.11 + Math.PI, pitch: -0.11, dist: 3.7 }); },
  actions: [
    { f: -88, key: 'Space', down: true }, { f: -88, key: 'KeyW', down: true },
    { f: 16, key: 'Space', down: false }, { f: 18, tap: 'KeyF' },

  ],
  onFrame(f, G, T, R) { if (f === -90 || f === 0 || f === 40 || f === 161) LOG(f, G, R); },
};
