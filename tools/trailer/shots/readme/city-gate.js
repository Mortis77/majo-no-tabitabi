// README: Elaina flies in through the great south gate of the City of Magic and climbs the street canyon toward the
// cathedral, witches crossing overhead. Late light from the west. 5.5 s, follow rig behind her.
const WP = [ // world x, y, z: the gate street (bellcrown.js BELL_ROADS[0]) and the stair to the raised core
  [-2160, 41, -440], [-2160, 41.5, -470], [-2163, 46, -505], [-2164, 54, -528], [-2163, 66, -556], [-2162, 82, -590], [-2162, 96, -640],
];
export default {
  name: 'readme-city-gate',
  frames: 330,
  preroll: 60,
  seed: 21,
  blur: 1,
  params: 'outfit=elaina',
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.32 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.5 - 0.85) * 1440) / (2 * Math.PI) - 10000; // sun low in the west-south-west
    R.place(-2160, -412, Math.PI, 41);
    await R.step(4);
    T.key('KeyF', true); await R.step(2); T.key('KeyF', false);
    await R.step(40);
    R.log('onBroom ' + G.player.onBroom);
    await R.step(200);
  },
  start(G, T, R) {
    R.place(-2160, -412, Math.PI, 41);
    R.gameCam({ yaw: 0, pitch: -0.2 });
    R.keepFull(true);
  },
  camera: {
    follow: 'behind', smooth: 0.22, ease: 'inOut',
    keys: [
      { f: 0, dist: 4.8, height: 1.2, lookHeight: 1.4, yaw: 0.3, fov: 54 },
      { f: 140, dist: 4.3, height: 0.9, lookHeight: 1.5, yaw: 0.05, fov: 58 },
      { f: 329, dist: 5.0, height: 0.3, lookHeight: 2.3, yaw: -0.3, fov: 62 },
    ],
    shake: { pos: 0.03, look: 0.04, speed: 0.7 },
  },
  actions: [
    { f: -50, key: 'KeyW', down: true },
    { f: -50, key: 'ShiftLeft', down: true },
    { f: 329, key: 'KeyW', down: false },
    { f: 329, key: 'ShiftLeft', down: false },
  ],
  onFrame(f, G) {
    // steer along the waypoints: heading from the game camera's yaw, climb from its pitch (as a player would)
    const P = G.player, p = P.pos;
    let i = 0; while (i < WP.length - 1 && p.z < WP[i][2] + 2) i++;
    const [x, y, z] = WP[i];
    G.cam.yaw = Math.atan2(x - p.x, z - p.z) - Math.PI;
    const d = Math.hypot(x - p.x, z - p.z);
    G.cam.pitch = Math.asin(Math.max(-0.9, Math.min(0.9, ((y - p.y) / Math.max(4, d)) * 1.2))) - 0.2;
  },
};
