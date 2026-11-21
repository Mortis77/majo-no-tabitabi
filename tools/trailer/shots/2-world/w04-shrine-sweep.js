// Section 2 / bar 10: the shrine courtyard. A dolly rides with the heroine from her front three-quarter as she sprints left to
// right across the courtyard; 婆婆 sweeps behind her path, facing us (the heroine passes about 9 m off, so the old woman
// keeps sweeping), the red hall behind. Her path runs in front of the stone lanterns that flank the path (they stood in her way from further back); higher than w02 and from the other side of the action.
let gx = -540, gz = 30;
export default {
  name: 'w04-shrine-sweep',
  frames: 162, preroll: 100, seed: 14,
  camera: (f, G, R) => {
    const p = G.player.pos, y = G.world.heightAt(gx, gz), u = R.EASE.inOut(Math.min(1, Math.max(0, f / 161)));
    return { pos: [p.x + 2.6 - 3.4 * u, y + 1.6, gz + 13.4], look: [p.x + 0.8, y + 1.05, p.z - 1.5], fov: 40 };
  },
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-552, 35.5, Math.PI / 2); },
  start(G, T, R) {
    const g = G.npcs.posOf('granny'); if (g) { gx = g.x; gz = g.z; }
    R.place(gx - 16, gz + 9, Math.PI / 2); R.gameCam({ yaw: -Math.PI / 2, pitch: -0.1 });
  },
  actions: [{ f: -30, key: 'KeyW', down: true }, { f: -30, key: 'ShiftLeft', down: true }],
  onFrame(f, G, T, R) { if (f % 40 === 0) R.log('f' + f, G.player.pos.toArray().map((v) => v.toFixed(1)).join(','), 'granny', gx.toFixed(1), gz.toFixed(1)); },
};
