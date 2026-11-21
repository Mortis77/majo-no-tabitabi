// Prologue shot 5 (bars 5–6, 288 + 18; cut-in on the bell, f576 of the film): the portrait of the heroine.
// Before the fox elder's hall at dusk, three-quarter front from her left at chest height, close: face in the upper
// third, eyes closed, hands joined in front of her chest (the game's pray action, held at its hands-together pose:
// the clip is stopped before the bow). Bar 6 (shot f144): she opens her eyes and lifts her head to the sky while the
// camera drifts up and back to show the lit hall behind her. She sits right of centre; low left stays calm for the caption.
export default {
  name: 'p1-05-pray-lookup',
  frames: 306,
  preroll: 90,
  seed: 104,
  setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.place(-81, 80, Math.PI / 2);
    // gaze override: the player's update aims her head at the camera's aim point; the shot sets it instead
    const rig = G.player.rig;
    if (!rig.__shotLook) {
      const orig = rig.lookAt.bind(rig);
      rig.lookAt = (p) => orig(window.__shotLook || p);
      rig.__shotLook = true;
      rig.lookLimits = { yaw: 1.15, pitch: 0.8 };   // a little more lift than the gameplay limit
    }
  },
  start(G, T, R) { R.place(-81, 80, Math.PI / 2); R.gameCam({ yaw: Math.PI / 2, pitch: 0 }); },
  actions: [ { f: -88, do: (G) => { G.player.playAction('pray', { lock: 0.9, faceAim: false }); } } ],
  onFrame(f, G) {
    const P = G.player, rig = P.rig, p = P.pos;
    // hold the hands-together pose
    const a = rig.mixer._actions.find((x) => /pray/i.test(x.getClip().name));
    if (a && a.time >= 0.72) { a.time = 0.72; a.timeScale = 0; }
    // eyes closed through bar 5, open on bar 6 (+12 f)
    rig.setExpression('blink', f < 156 ? 1 : 0, f < 156 ? 8 : 5);
    // gaze: lowered a little (face still reads), then up to the sky over ~1 s from shot f150
    const u = Math.min(1, Math.max(0, (f - 150) / 70)), s = u * u * (3 - 2 * u);
    const L = (x, y) => x + (y - x) * s;
    window.__shotLook = { x: p.x + L(2.4, 1.3), y: p.y + L(1.5, 3.6), z: p.z + L(-0.75, -0.35) };
  },
  camera: (f, G) => {
    const p = G.player.pos;
    const u = Math.min(1, Math.max(0, (f - 140) / 165)), s = u * u * u * (u * (u * 6 - 15) + 10);
    const L = (a, b) => a + (b - a) * s;
    const push = Math.min(1, Math.max(0, f / 144)) * 0.08;   // a breath of push in bar 5
    // camera direction from her: front-left (+x forward, -z her left)
    const d = L(2.05 - push, 2.75), dx = 0.93 * d, dz = -0.37 * d;
    return { pos: [p.x + dx, p.y + L(1.12, 1.4), p.z + dz],
             look: [p.x + 0.15, p.y + L(1.26, 1.36), p.z + L(0.42, 0.5)], fov: L(30, 32) };
  },
};
