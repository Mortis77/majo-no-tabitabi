// README hero / social preview (docs/images/preview.webp): Elaina on her broom on the south-western approach to the City
// of Magic, the walled city with its mist skirt ahead of her and witches over the roofs, late light. A follow camera over
// her right shoulder looking past her toward the gate; the still is last.png of the take (2x supersampled).
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/hero-still.js --ss 2 --codec h264
const GOAL = [-2165, 58, -470]; // she flies toward the gate
export default {
  name: 'readme-hero-still',
  frames: 24,
  preroll: 150,
  seed: 8,
  params: 'outfit=elaina',
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.28 });
    G.quests.debugSkipTo('mages', 'gate'); // episode two (nothing is saved in a rig run)
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.6 - 0.85) * 1440) / (2 * Math.PI) - 10000; // low sun in the west-south-west
    R.place(-2268, -170, 2.75, 74);
    T.key('KeyF', true); await R.step(2); T.key('KeyF', false);
    await R.step(200);
  },
  start(G, T, R) {
    R.place(-2268, -170, 2.75, 74);
    R.keepFull(true);
  },
  actions: [{ f: -140, key: 'KeyW', down: true }, { f: 23, key: 'KeyW', down: false }],
  camera(f, G) {
    const P = G.player, V = G.THREE.Vector3, p = P.pos;
    const d = new V(GOAL[0] - p.x, 0, GOAL[2] - p.z).normalize(), r = new V(-d.z, 0, d.x);
    return {
      pos: new V().copy(p).addScaledVector(d, -4.6).addScaledVector(r, -1.9).setY(p.y + 1.55),
      look: new V().copy(p).addScaledVector(d, 60).addScaledVector(r, 9).setY(p.y - 6),
      fov: 50,
    };
  },
  onFrame(f, G) {
    G.journeyWeather.state.rain = 0;
    const P = G.player, p = P.pos; // steer toward the gate, holding her height
    G.cam.yaw = Math.atan2(GOAL[0] - p.x, GOAL[2] - p.z) - Math.PI;
    G.cam.pitch = -0.2 + Math.max(-0.3, Math.min(0.3, (74 - p.y) * 0.05));
  },
};
