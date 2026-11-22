// README: the land remembers. A charged earth cast calls a meteor down on a stand of trees: a crater, earth and stone
// thrown out, the trees knocked flat, the grass set alight. West wilds near (150, 55), ground about y 31.6.
// 5.5 s, a slow world-path camera from above the south-west.
const HX = 150, HZ = 81;          // heroine
const ROCK = [150.5, 63];         // aim point: at the foot of the tree stand, so the trees fall away from the camera
export default {
  name: 'readme-destruction',
  frames: 330,
  preroll: 90,
  seed: 9,
  params: 'outfit=elaina&allspells=1',
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.28 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.2 - 0.85) * 1440) / (2 * Math.PI) - 10000;
    R.spells('all'); R.freezeFidgets();
    R.place(HX, HZ, Math.PI);
    await R.step(240);
  },
  start(G, T, R) {
    R.place(HX, HZ, Math.PI);
    R.gameCam({ yaw: 0, pitch: -0.25 });
    R.keepFull(true);
  },
  camera: {
    ease: 'inOut', hold: true,
    path: [
      { f: 0, pos: [142.5, 41, 93.5], look: [151, 33.6, 61], fov: 50 },
      { f: 329, pos: [144.5, 43.5, 91], look: [151, 33, 59], fov: 52 },
    ],
    shake: { pos: 0.03, look: 0.04, speed: 0.7 },
  },
  actions: [
    { f: -70, tap: 'Digit6' },              // earth
    { f: -52, hold: 'Mouse2', frames: 62 }, // charged: the meteor
  ],
  onFrame(f, G, T, R) {
    // aim (see fire-tornado.js: the player's aim is taken from the drawing camera, so the shot sets it before each frame)
    const P = G.player, A = P.aim, p = P.pos, [tx, tz] = ROCK;
    G.cam.yaw = Math.atan2(tx - p.x, tz - p.z) - Math.PI;
    if (A) {
      A.origin.set(p.x, p.y + 1.3, p.z);
      A.point.set(tx, G.world.heightAt(tx, tz) + 0.3, tz);
      A.dir.subVectors(A.point, A.origin); A.dist = A.dir.length(); A.dir.normalize();
      A.target = null; A.body = null; A.surface = 'terrain';
    }
    if (f === 0 || f === 320) R.log(`f${f} trees standing near: ${G.flora.treesNear(new G.THREE.Vector3(ROCK[0], 0, ROCK[1]), 12).length}`);
  },
};
