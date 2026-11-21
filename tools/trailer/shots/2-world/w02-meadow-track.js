// Section 2 / bar 8: low tracking shot from her right side: she sprints left to right through the tall grass, the fox spirit
// bobbing at her shoulder, the shrine hill behind. The camera rides with her (no lag), slides from her front three-quarter
// to her side, and leaves room ahead of her.
export default {
  name: 'w02-meadow-track',
  frames: 162, preroll: 90, seed: 12,
  camera: (f, G, R) => {
    const p = G.player.pos, u = R.EASE.inOut(Math.min(1, Math.max(0, f / 161)));
    const ox = 1.9 - 2.6 * u, dz = 3.5 + 0.4 * u;
    return { pos: [p.x + ox, p.y + 0.55, p.z + dz], look: [p.x + 0.9, p.y + 1.0, p.z], fov: 38 };
  },
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-552, 146, Math.PI / 2); },
  start(G, T, R) { R.place(-552, 146, Math.PI / 2); R.gameCam({ yaw: -Math.PI / 2, pitch: -0.1 }); },
  actions: [{ f: -80, key: 'KeyW', down: true }, { f: -80, key: 'ShiftLeft', down: true }],
};
