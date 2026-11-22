// Title-screen background (assets/textures/journey/magic-country-title.webp, 1920x1080): the City of Magic from broom
// height on the south-western approach in warm late light, witches over the roofs. The title darkens the left ~35% for
// its menu, so the city sits centre-right. A held camera; the still is last.png of the take (2x supersampled).
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/title-still.js --ss 2 --codec h264
export default {
  name: 'readme-title-still',
  frames: 24,
  preroll: 240,
  seed: 33,
  params: 'outfit=elaina',
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.3 });
    G.quests.debugSkipTo('mages', 'gate'); // episode two: the city's own day (nothing is saved in a rig run)
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.75 - 0.85) * 1440) / (2 * Math.PI) - 10000; // low sun in the west
    R.place(-2335, -300, Math.PI, 95);
    T.key('KeyF', true); await R.step(2); T.key('KeyF', false);
    await R.step(200);
  },
  start(G, T, R) {
    R.place(-2335, -300, Math.PI, 95);
  },
  camera: { // held: the south-western approach, rampart and gate towers right of centre, roofs and cathedral behind
    path: [
      { f: 0, pos: [-2318, 90, -332], look: [-2178, 64, -598], fov: 48 },
      { f: 23, pos: [-2318, 90, -332], look: [-2178, 64, -598], fov: 48 },
    ],
  },
  onFrame(f, G) { G.journeyWeather.state.rain = 0; },
};
