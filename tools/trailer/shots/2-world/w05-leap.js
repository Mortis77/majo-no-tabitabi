// Section 2 / bar 11 (caption: the three lands): she sprints off the south-east edge of the shrine hill, jumps, jumps again in
// the air and holds it: the wings of light open. Low camera on the slope below, panning with her against the sky; she
// travels left to right. The jump fires (real input) when she reaches the edge.
const C0 = [-540, 40];
let jumpAt = null;
export default {
  name: 'w05-leap',
  frames: 162, preroll: 90, seed: 15,
  camera: (f, G, R) => {
    // rides beside her on her right (south-west of her path), a little ahead at first, sliding to her side; it keeps the
    // take-off height while she rises, then sinks with her glide
    const p = G.player.pos, u = R.EASE.inOut(Math.min(1, Math.max(0, f / 161)));
    const hx = 0.75, hz = 0.66, rx = -0.66, rz = 0.75;
    const side = 4.6 + 1.6 * u, ahead = 1.4 - 2.2 * u;
    const cy = Math.min(30.9, p.y + 0.45 + 0.6 * u);
    return { pos: [p.x + rx * side + hx * ahead, cy, p.z + rz * side + hz * ahead], look: [p.x + hx * 1.2, p.y + 1.1, p.z + hz * 1.2], fov: 44 };
  },
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-528, 40, 0.85); },
  start(G, T, R) { jumpAt = null; R.place(-526, 41.3, 0.85); R.gameCam({ yaw: 0.85 + Math.PI, pitch: -0.1 }); },
  actions: [{ f: -80, key: 'KeyW', down: true }, { f: -80, key: 'ShiftLeft', down: true }],
  onFrame(f, G, T, R) {
    const p = G.player.pos, d = Math.hypot(p.x - C0[0], p.z - C0[1]);
    if (jumpAt === null && d >= 25.5) { jumpAt = f; T.key('Space', true); R.log('jump at f' + f); }
    if (jumpAt !== null) { if (f === jumpAt + 14) T.key('Space', false); if (f === jumpAt + 30) T.key('Space', true); }
    if (f % 30 === 0) R.log('f' + f, G.player.state, p.toArray().map((v) => v.toFixed(1)).join(','), G.world.heightAt(p.x, p.z).toFixed(1));
  },
};
