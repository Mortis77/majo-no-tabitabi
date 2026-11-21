// Section 5 CODA, shot 1 (bar 37, 144 + 18 handle): from white into the dark. The crystal field at night, the great
// lantern waiting on its dais (ready ring), the heroine walking up to it. Slow crane down.
export default {
  name: 'c1-approach', frames: 162, preroll: 90, seed: 37,
  setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.life(false);
    G.gameplay.setBarrier(false, { instant: true });       // story state: the palace barrier is down
    G.gameplay.setActive('crystal_puzzle', false);         // no puzzle beams across the frame
    G.gameplay.setGreatLanternReady('gl_crystal', true);   // the lantern is ready to be lit
    R.place(545, -297, 0);
  },
  start(G, T, R) { R.place(545, -297, 0); },
  actions: [ { f: -20, key: 'KeyW', down: true } ],
  camera: {
    path: [
      { f: 0, pos: [588, 62, -236], look: [541, 18, -284], fov: 42 },
      { f: 162, pos: [574, 38, -252], look: [543, 19, -284], fov: 40 },
    ],
    ease: 'sine', hold: false, shake: { pos: 0.05, look: 0.05, speed: 0.6 },
  },
};
