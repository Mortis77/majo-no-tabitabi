// Section 5 CODA, shot 4 (bars 41-43, 432 + 18 handle; one take) — RE-SHOOT 2: the lantern town in the lasting night,
// seen from high above, the camera rising and turning slowly while keeping the whole town in frame. The town starts
// dark (street lanterns dimmed, every lantern post / andon / brazier / torch put out). The lanterns come on outward from
// the plaza ring by ring, one beat apart (f36, f72, f108, f144: the props by their distance from the lamp tower, the
// stone lantern on the west road with them), then the lamp tower answers (f180: the game's own town-relit moment:
// burst at the lamp, sky flash, every street lantern fades up) and the town is at its brightest by f288 = bar 43.
// Bar 43 (f288-431): near-still hold. The race ring north-east of the town is switched off (gameplay group race_sky).
const TW = [205, -125];
const BANDS = [[0, 34], [34, 47], [47, 58], [58, 80]];   // distance bands from the lamp tower (m) -> rings 1..4
export default {
  name: 'c4-lanterns', frames: 450, preroll: 90, seed: 41,
  setup(G, T, R) { R.hud(false); R.wildlife(false); R.clearCombat(); R.weather('clear'); R.freezeFidgets(); R.life(false);
    G.gameplay.setBarrier(false, { instant: true }); G.gameplay.setActive('crystal_puzzle', false);
    G.gameplay.setActive('race_sky', false);
    R.place(203, -113, 3.1); },
  start(G, T, R) {
    R.place(203, -113, 3.1);
    G.structures.places.town.setLit(false, true);
    if (G.gameplay.isLanternLit('sl_06')) G.gameplay.douseLantern('sl_06');
    window.__c4 = [[], [], [], []];
    for (const p of G.props.live) {
      if (p.def.behave !== 'lantern' && p.def.behave !== 'fire') continue;
      const d = Math.hypot(p.pos.x - TW[0], p.pos.z - TW[1]);
      const b = BANDS.findIndex(([a, z]) => d >= a && d < z);
      if (b < 0) continue;
      p.setLit(false); window.__c4[b].push(p);
    }
    R.log('bands', window.__c4.map(a => a.length).join(','));
  },
  actions: [
    ...[36, 72, 108, 144].map((f, i) => ({ f, do: (G, T, R) => {
      // one by one within the ring: a few frames apart, around the ring
      const ring = window.__c4[i].slice().sort((a, b) => Math.atan2(a.pos.z - TW[1], a.pos.x - TW[0]) - Math.atan2(b.pos.z - TW[1], b.pos.x - TW[0]));
      ring.forEach((p, k) => setTimeout(() => p.setLit(true), k * 50));
      if (i === 2) G.gameplay.lightLantern('sl_06');
      R.log('ring', i + 1, ring.length, 'f', f);
    } })),
    { f: 180, do: (G, T, R) => {   // the lamp tower answers: exactly the game's town-relit moment (story cutscene townLit, without its sky flash)
      const tw = G.world.ANCHORS.town_lamp, town = G.structures.places.town;
      const y = G.world.heightAt(tw.x, tw.z);
      town.setLit(true);
      G.fx.burst('lantern_ignite', G.player.pos.clone().set(tw.x, y + (town.tower?.lampY || 18), tw.z), { scale: 3 });
      R.log('tower f 180');
    } },
  ],
  // orbit-crane round the lamp tower from the south-west to the south, rising 37 -> 59 m; it keeps turning slowly
  // through bar 43 so the hold never freezes. Kept under ~95 m from the town blocks (their far versions swap in beyond).
  camera: (f, G, R) => {
    const c = (x) => Math.min(1, Math.max(0, x));
    const sm = (x) => 0.5 - 0.5 * Math.cos(Math.PI * c(x));
    const u = sm(f / 300), w = 1 - (1 - c(f / 450)) ** 2;
    const a = 0.55 - 0.5 * w, r = 30 + 8 * u, h = 37 + 22 * u;   // a: angle from south (+z), positive = west
    const pos = [TW[0] - Math.sin(a) * r, h, TW[1] + Math.cos(a) * r];
    return { pos, look: [TW[0], 5, TW[1] - 6], fov: 52 };
  },
};
