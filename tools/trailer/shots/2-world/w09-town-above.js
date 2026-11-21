// Section 2 / bar 15 (the music lifts): into the lasting night. High over her shoulder on the broom, looking down past her on
// 万灯镇, the town of lanterns; she flies left to right. Blur 8.
const LOG = (f, G, R) => R.log('f' + f, G.player.state, G.player.pos.toArray().map((v) => v.toFixed(1)).join(','), JSON.stringify(R.lightAt(G.player.pos.x, G.player.pos.z)));
const TOWN = [205, 12, -125];
export default {
  name: 'w09-town-above',
  frames: 162, preroll: 120, seed: 19, blur: 8,
  camera: (f, G, R) => {
    const p = G.player.pos;
    return { pos: [p.x - 5.5, p.y + 5, p.z + 6.5], look: [p.x + (TOWN[0] - p.x) * 0.3, p.y + (TOWN[1] - p.y) * 0.3, p.z + (TOWN[2] - p.z) * 0.3], fov: 50 };
  },
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.keepFull(true); R.place(150, -85, Math.PI / 2, 45); },
  start(G, T, R) { R.place(120, -82, Math.PI / 2, 42); R.gameCam({ yaw: Math.PI / 2 + Math.PI, pitch: -0.2 }); },
  actions: [{ f: -115, tap: 'KeyF' }, { f: -110, key: 'KeyW', down: true }, { f: -110, key: 'ShiftLeft', down: true }],
  onFrame(f, G, T, R) { if (f === -120 || f === 0 || f === 161) LOG(f, G, R); },
};
