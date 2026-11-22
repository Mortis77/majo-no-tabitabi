// README: a charged wind cast (layered magic circles at the wand and under her feet) raises a tornado; a fire bolt
// shot into it turns it into a fire tornado (炎旋). Flower valley, afternoon light. 5.5 s, world-path camera from her front round to over her shoulder.
const HX = -450, HZ = 384, TX = -450, TZ = 366; // heroine, tornado target
export default {
  name: 'readme-fire-tornado',
  frames: 330,
  preroll: 90,
  seed: 5,
  params: 'outfit=elaina&allspells=1',
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(true); R.clearCombat(); R.weather({ rain: 0, cloud: 0.3 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.25 - 0.85) * 1440) / (2 * Math.PI) - 10000;
    R.spells('all'); R.freezeFidgets();
    R.place(HX, HZ, Math.PI);
    await R.step(240);
  },
  start(G, T, R) {
    R.place(HX, HZ, Math.PI);
    R.gameCam({ yaw: 0, pitch: -0.32 });
    R.keepFull(true);
  },
  camera: { // world path (ground here is about y 17.3): from her front-left round to over her right shoulder
    ease: 'inOut', hold: true,
    path: [
      { f: 0, pos: [-452.4, 18.55, 381.4], look: [-450, 18.6, 384], fov: 40 },
      { f: 70, pos: [-454.4, 18.6, 385.2], look: [-450.2, 19.0, 382.6], fov: 44 },
      { f: 135, pos: [-448.0, 19.1, 388.8], look: [-450, 24, 366], fov: 58 },
      { f: 329, pos: [-448.3, 19.2, 388.6], look: [-450, 27, 366], fov: 62 },
    ],
    shake: { pos: 0.02, look: 0.03, speed: 0.8 },
  },
  actions: [
    { f: -60, tap: 'Digit4' },            // wind
    { f: 8, hold: 'Mouse2', frames: 72 }, // charge -> big: the tornado
    { f: 125, tap: 'Digit1' },            // fire
    { f: 140, tap: 'Mouse2' },            // a fire bolt into the tornado
  ],
  onFrame(f, G, T, R) {
    // aim at the target spot. The player's aim is worked out in lateUpdate from whatever camera is drawing, and the
    // rig's view camera stands in front of her, so the shot sets it here (before the frame) for the casts to read.
    const P = G.player, A = P.aim, p = P.pos;
    G.cam.yaw = Math.atan2(TX - p.x, TZ - p.z) - Math.PI;
    if (A) {
      A.origin.set(p.x, p.y + 1.3, p.z);
      A.point.set(TX, G.world.heightAt(TX, TZ) + 0.2, TZ);
      A.dir.subVectors(A.point, A.origin); A.dist = A.dir.length(); A.dir.normalize();
      A.target = null; A.body = null; A.surface = 'terrain';
    }
    if (f === 200) R.log('tornadoes ' + JSON.stringify((G.spells?.fusions?.tornadoes || []).map((t) => t.el || 'wind')));
  },
};
