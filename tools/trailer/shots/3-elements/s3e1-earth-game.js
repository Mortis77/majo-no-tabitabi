// s3e1: the game camera, used cell 0-108 (+18 handle).
// Section 3, cell (e) 岩, bars 25-26 (cell frames 0-288; accent 252). One play, three cameras (s3e1/s3e2/s3e3 share it).
// Sunlit meadow by day (region sunmeadow, veil 0). She faces west, the sun behind her left shoulder. Four 岩起 casts (real
// input: 14 frames of closed-loop mouse-look onto each point, then a tap) raise a line of stone columns that runs away from her
// to a pile of rocks (7 boulder_m + 4 boulder_s, the game's own breakable props, spawned in start): casts at cell 24, 84, 164
// and 251. The fourth column heaves up right under the pile: every rock is crushed on cell 252 (prop:broken 'impact'), the
// pieces split and burst again on 255, and the chunks fly up over the column top into the sky.
// The aim wrapper in setup works around a game fault (she aims along the view-only shot camera; see PROGRESS).
const HX = -526, HZ = 172, FACE = -Math.PI / 2;   // facing west, the sun behind her left shoulder
const W = (f, r) => [HX - f, HZ - r];                       // her local (forward, right) -> world x,z (facing -x, right = -z)
const PL = [[7, -4.5], [12, 0.5], [17, 5], [22, 11]], PT = PL.map(([f, r]) => W(f, r));
const LD = Math.atan2(PT[3][0] - PT[2][0], PT[3][1] - PT[2][1]);   // world heading of the last step
const P4 = PT[3];
const PX = Math.sin(LD), PZ = Math.cos(LD), QX = -PZ, QZ = PX;          // p: onward along the line; q: the sunlit side of it
const AX = 0.75, AZ = -0.66, AH = Math.atan2(AX, AZ);   // the burst camera's side (north-east of the rocks: sun from its right)
const GX = P4[0], GZ = P4[1];                                            // the rock pile: the last column heaves up right under it
const ROCKS = [['boulder_m', 0, 0.75], ['boulder_m', 72, 0.75], ['boulder_m', 144, 0.75], ['boulder_m', 216, 0.75], ['boulder_m', 288, 0.75], ['boulder_m', 36, 1.55], ['boulder_m', 180, 1.55], ['boulder_s', 0, 0], ['boulder_s', 108, 1.5], ['boulder_s', 252, 1.5], ['boulder_s', 324, 1.5]];
const aimAt = (k) => (G, T, R) => {
  const [tx, tz] = PT[k], ty = G.world.heightAt(tx, tz), C = G.camera.position, A = G.player.aim.point;
  const yaw = (x, z) => Math.atan2(x - C.x, z - C.z), el = (x, y, z) => Math.atan2(y - C.y, Math.hypot(x - C.x, z - C.z));
  let ey = yaw(tx, tz) - yaw(A.x, A.z); while (ey > Math.PI) ey -= 2 * Math.PI; while (ey < -Math.PI) ey += 2 * Math.PI;
  const ep = el(tx, ty, tz) - el(A.x, A.y, A.z);
  T.look(-ey / 0.0024 * 0.6, -ep / 0.0024 * 0.6);
};
const aimSteps = (f0, k) => Array.from({ length: 14 }, (_, i) => ({ f: f0 + i, do: aimAt(k) }));
const START = 0;
export default {
  name: 's3e1-earth-game', frames: 126, preroll: 90 + START, seed: 41,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('earth'); R.place(HX, HZ, FACE);
    { const ps = G.systems.find(s => s.name === 'player'), lu = ps.lateUpdate; ps.lateUpdate = function (...a) { const fc = G.debug.fixedCam, c = G.camera; if (!fc || !fc.view) return lu.apply(this, a); const p = c.position.clone(), q = c.quaternion.clone(); c.position.copy(fc.gp); c.quaternion.copy(fc.gq); c.updateMatrixWorld(); try { return lu.apply(this, a); } finally { c.position.copy(p); c.quaternion.copy(q); c.updateMatrixWorld(); } }; }
  },
  start(G, T, R) {
    R.place(HX, HZ, FACE); R.select('earth'); R.gameCam({ yaw: FACE + Math.PI, pitch: -0.16, dist: 5.6 });
    const v = G.player.pos.clone();
    window.__R = ROCKS.map(([t, deg, r]) => { const a = AH + deg * Math.PI / 180, x = P4[0] + Math.sin(a) * r, z = P4[1] + Math.cos(a) * r;
      return G.props.spawn(t, v.set(x, G.world.heightAt(x, z) + 0.45, z), { persistent: true, rot: deg }); });
  },
  camera: 'game',
  actions: [
    { f: -89 - START, do: (G, T, R) => {
      G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f, 'aim', G.player.aim.point.x.toFixed(2), G.player.aim.point.z.toFixed(2)));
      G.events.on('prop:broken', e => R.log('BROKEN', e.type, e.by, window.__f, e.pos.x.toFixed(1), e.pos.y.toFixed(1), e.pos.z.toFixed(1)));
    } },
    ...aimSteps(2 - START, 0), { f: 16 - START, tap: 'Mouse2' },
    ...aimSteps(62 - START, 1), { f: 76 - START, tap: 'Mouse2' },
    ...aimSteps(142 - START, 2), { f: 156 - START, tap: 'Mouse2' },
    ...aimSteps(229 - START, 3), { f: 243 - START, tap: 'Mouse2' },
    { f: 247 - START, do: () => (window.__R || []).forEach(p => { if (p && p.alive && p.body) { p.body.sleeping = false; p.body.rb?.wakeUp?.(); } }) },
  ],
  onFrame(f, G, T, R) { f += START; window.__f = f; if (f === 0 || f === 200) R.log('ROCKS', f, (window.__R || []).map(p => p && (p.type + ' ' + p.alive + ' ' + p.pos.x.toFixed(1) + ',' + p.pos.y.toFixed(1) + ',' + p.pos.z.toFixed(1))).join(' | ')); },
};
