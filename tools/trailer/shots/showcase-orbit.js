// Showcase: she runs toward the shrine hill; the camera starts low in front of her and swings round and up to a high
// view from behind that reveals the torii and the hill. 5 s, follow rig with keyed distance / height / angle / lens.
export default {
  name: 'showcase-orbit',
  frames: 300,
  preroll: 90,
  seed: 11,
  setup(G, T, R) {
    R.hud(false);
    R.wildlife(false);
    R.clearCombat();
    R.weather('clear');
    R.freezeFidgets();
    R.place(-488, 136, -2.2);
  },
  start(G, T, R) {
    R.place(-488, 136, -2.2);
    R.gameCam({ yaw: -2.2 + Math.PI, pitch: -0.1 }); // W runs where the game camera faces: keep it behind her
  },
  camera: {
    follow: 'front',          // angle 0 = in front of her; `yaw` below adds to it (rad)
    smooth: 0.25,             // seconds of lag on her position / facing (no jitter from steps)
    ease: 'inOut',
    keys: [
      { f: 0,   yaw: 0.85, dist: 3.4, height: 0.55, lookHeight: 1.15, fov: 38 },
      { f: 150, yaw: 1.9,  dist: 4.6, height: 1.6,  lookHeight: 1.2,  fov: 44 },
      { f: 299, yaw: 2.95, dist: 7.5, height: 4.2,  lookHeight: 1.6,  fov: 55 },
    ],
    shake: { pos: 0.02, look: 0.03, speed: 0.8 },  // a breath of hand-held drift
  },
  actions: [
    { f: -60, key: 'KeyW', down: true },
    { f: 299, key: 'KeyW', down: false },
  ],
};
