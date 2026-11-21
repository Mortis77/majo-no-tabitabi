// Prologue shot 2 (bar 2, 144 + 18 handle): the sky isle over the mirror lake (fi_lake) at the dusk edge of the Veil,
// seen from the north: pink sky, the isle in silhouette with its thin fall on the right, far isles and the sea beyond.
// A slow lateral drift with a slight rise. Lower third = calm sea / far shore (caption area). Light is decided by the
// camera's place, so the camera stays inside the dusk band (d ~ 525 m from the Veil heart).
export default {
  name: 'p1-02-dusk-isle',
  frames: 162,
  preroll: 90,
  seed: 202,
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-81, 80, Math.PI / 2); },
  start(G, T, R) { R.place(-81, 80, Math.PI / 2); R.gameCam({ yaw: Math.PI / 2, pitch: 0 }); },
  camera: {
    path: [
      { f: 0,   pos: [160, 57.5, 317], look: [146, 68, 430], fov: 40 },
      { f: 161, pos: [147, 60.5, 321], look: [144, 69, 430], fov: 38.5 },
    ],
    ease: 'linear',
  },
};
