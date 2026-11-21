// Section 2 / bar 12 (re-shoot): a real glide. She is already gliding (jump held, W) low over the day fields, heading east
// toward the red dusk forest; the camera starts trailing behind her right shoulder and swings out to flank her as she
// descends, so she crosses the frame left to right with the fields streaming below and the red forest ahead.
const LOG = (f, G, R) => R.log('f' + f, G.player.state, G.player.pos.toArray().map((v) => v.toFixed(1)).join(','), JSON.stringify(R.lightAt(G.player.pos.x, G.player.pos.z)));
const X0 = -250, Z0 = -50;
export default {
  name: 'w06b-glide-flank',
  frames: 162, preroll: 90, seed: 16,
  camera: (f, G, R) => {
    const p = G.player.pos, u = R.EASE.inOut(Math.min(1, Math.max(0, f / 161)));
    // her heading is +x (east); her right side is +z (south)
    const back = 5.0 - 3.4 * u, side = 2.0 + 4.2 * u, up = 1.5 - 0.5 * u;
    return { pos: [p.x - back, p.y + up, p.z + side], look: [p.x + 2.0, p.y + 0.3, p.z], fov: 42 };
  },
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(X0, Z0, Math.PI / 2, G.world.heightAt(X0, Z0) + 18); },
  start(G, T, R) { R.place(X0, Z0, Math.PI / 2, G.world.heightAt(X0, Z0) + 18); R.gameCam({ yaw: Math.PI / 2 + Math.PI, pitch: -0.15 }); },
  actions: [{ f: -88, key: 'Space', down: true }, { f: -88, key: 'KeyW', down: true }],
  onFrame(f, G, T, R) { if (f === -90 || f === 0 || f === 80 || f === 161) LOG(f, G, R); },
};
