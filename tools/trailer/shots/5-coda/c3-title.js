// Section 5 CODA, shot 3 (bars 39-40, the TITLE PLATE, 288 + 18 handle): she rides the broom with the fox spirit, flying
// across the face of the Moon wheel. The camera flies with her, below and behind, looking up 42 deg: she and the wheel
// sit on one line in the lower third, the upper 60 % is open night sky for the title. Nearly still; a slow push in.
const D = [0.969, 0, 0.248], Q = [-0.248, 0, 0.969], U = [0, 1, 0];   // D: the Moon wheel (level), Q: her heading
export default {
  name: 'c3-title', frames: 306, preroll: 400, seed: 39,
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.life(false);
    G.gameplay.setBarrier(false, { instant: true }); G.gameplay.setActive('crystal_puzzle', false); R.place(498, -332, -0.25); },
  start(G, T, R) { R.place(498, -332, -0.25); R.gameCam({ yaw: -0.25 + Math.PI, pitch: 0 }); R.keepFull(true); },
  actions: [ { f: -390, tap: 'KeyF' }, { f: -370, key: 'Space', down: true }, { f: -170, key: 'Space', down: false },
    { f: -360, key: 'KeyW', down: true } ],
  camera: (f, G, R) => {
    const P = G.player.pos.toArray();
    const add = (...t) => [0, 1, 2].map(i => t.reduce((s, [v, k]) => s + v[i] * k, 0));
    const u = Math.min(1, Math.max(0, f / 306)), s = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const back = 10.8 - 1.0 * s, side = 3.7 - 0.3 * s, down = 6.6 - 0.5 * s;
    const pos = add([P, 1], [D, -back], [Q, side], [U, -down]);
    const a = (42 - 0.6 * s) * Math.PI / 180;
    const look = add([pos, 1], [D, 20 * Math.cos(a)], [U, 20 * Math.sin(a)], [Q, -2.2]);
    return { pos, look, fov: 38 };
  },
};
