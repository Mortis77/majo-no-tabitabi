// One continuous pass through two flower drifts on the northern shore of the flooded trial lake.
// The camera stays behind and slightly above the brush so both sides of the wake are visible.
export default {
  name: 'meadow-lake-wake',
  seed: 3081, frames: 750, preroll: 90, blur: 1,
  camera: { follow: 'behind', dist: 6.4, height: 3.3, lookHeight: 0.45, yaw: 0.18, fov: 59, smooth: 0.10 },
  setup(G, T, R) {
    G.world.setTrialLake(true);
    R.hud(false); R.weather('clear'); R.wildlife(false); R.clearCombat(); R.keepFull(true);
    R.place(1854, -312, -0.61);
  },
  start(G, T, R) {
    R.place(1854, -312, -0.61, G.world.heightAt(1854, -312) + 4);
    if (!G.player.onBroom && !G.player.mountBroom()) throw new Error('Could not mount for the flight pass');
    R.gameCam({ yaw: Math.PI - 0.61, pitch: -0.4 });
  },
  actions: [
    { f: -90, key: 'KeyW', down: true },
    { f: -28, key: 'KeyC', down: true },
    { f: 100, key: 'ShiftLeft', down: true },
    { f: 157, lookRate: [4.5, 0], frames: 35 },
    { f: 212, lookRate: [-4.5, 0], frames: 35 },
    { f: 427, key: 'ShiftLeft', down: false },
    { f: 530, key: 'ShiftLeft', down: true },
    { f: 565, lookRate: [-6, 0], frames: 55 },
    { f: 635, lookRate: [5, 0], frames: 50 },
    { f: 719, key: 'KeyC', down: false }, { f: 719, key: 'Space', down: true },
  ],
  onFrame(f, G, T, R) {
    if (f < 0 || f % 15) return;
    const p = G.player;
    if (!p.onBroom) throw new Error('Rider dismounted at frame ' + f);
    R.log('pass', f, ...p.pos.toArray().map(n => n.toFixed(2)), p.speed.toFixed(2),
      p.broom.yawRate.toFixed(2), G.world.isWater(p.pos.x, p.pos.z) ? 'water' : 'land',
      G.scene.getObjectByName('flora:airborne-leaves')?.count ?? 0,
      JSON.stringify(G.water?.flightWakeStats?.() || G.terrain?.water?.flightWakeStats?.() || {}));
  },
};
