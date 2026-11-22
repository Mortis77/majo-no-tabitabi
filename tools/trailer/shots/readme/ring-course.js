// README: the heart ring course (src/data/wilds.js rc_heart) on the broom: through the glowing rings and up past the
// ancient tree. Setup flies the first three rings with a steering bot (as tools/acceptance/journey-activities.mjs does), so
// the take opens with the course running. 6 s, follow rig behind her.
function steer(G, target) {
  const P = G.player, dx = target.x - P.pos.x, dz = target.z - P.pos.z;
  G.cam.yaw = Math.atan2(dx, dz) - Math.PI;
  const vy = Math.max(-10, Math.min(10, (target.y - P.pos.y) * 1.6)), sp = Math.max(6, P.speed * 0.6);
  G.cam.pitch = Math.asin(Math.max(-0.95, Math.min(0.95, vy / sp))) - 0.2;
}
const course = (G) => G.wilds.rings.courses.find((c) => c.def.id === 'rc_heart');
export default {
  name: 'readme-ring-course',
  frames: 360,
  preroll: 30,
  seed: 4,
  params: 'outfit=elaina',
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.3 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.3 - 0.85) * 1440) / (2 * Math.PI) - 10000;
    R.keepFull(true); R.fill();
    const RR = G.wilds.rings, c = course(G), r0 = c.rings[0];
    const back = r0.pos.clone().addScaledVector(r0.normal, -16);
    R.place(back.x, back.z, Math.atan2(r0.normal.x, r0.normal.z), back.y);
    await R.settle();
    T.key('KeyF', true); await R.step(2); T.key('KeyF', false); await R.step(12);
    R.log('onBroom ' + G.player.onBroom);
    T.key('KeyW', true); T.key('ShiftLeft', true);
    for (let i = 0; i < 2400; i++) {
      R.fill();
      steer(G, RR.running ? RR.next.pos : r0.pos);
      await R.step(1);
      if (RR.running && c.rings.indexOf(RR.next) >= 3) break;
    }
    R.log('running ' + RR.running + ' next ' + c.rings.indexOf(RR.next) + ' at ' + G.player.pos.toArray().map((v) => v.toFixed(0)));
  },
  camera: {
    follow: 'behind', smooth: 0.2, ease: 'inOut',
    keys: [
      { f: 0, dist: 5.0, height: 1.2, lookHeight: 1.4, yaw: 0.35, fov: 58 },
      { f: 150, dist: 5.2, height: 1.4, lookHeight: 1.8, yaw: 0.55, fov: 60 },
      { f: 359, dist: 5.8, height: 1.3, lookHeight: 1.6, yaw: 0.2, fov: 58 },
    ],
    shake: { pos: 0.03, look: 0.03, speed: 0.8 },
  },
  actions: [
    { f: 359, key: 'KeyW', down: false },
    { f: 359, key: 'ShiftLeft', down: false },
  ],
  onFrame(f, G, T, R) {
    const RR = G.wilds.rings;
    if (RR.running) steer(G, RR.next.pos);
    G.journeyWeather.state.rain = 0; // no passing shower in this take
    if (f === 0 || f === 359) R.log(`f${f} next ring ${course(G).rings.indexOf(RR.next)} running ${RR.running}`);
  },
};
