// Section 4, bars 35–36: THE BEAM STRUGGLE. The heroine's 天照 against 胧夜's beam on the crystal plain at night.
// Everything is played: the duel engine starts the fight, the rival's own beam set piece fires, she answers by holding
// cast with the sun selected, and the struggle is mashed with the attack button. A controller decides when to press so
// the clash holds near the middle, then she drives it home: the win lands in the last frames of the 288 (+18 handle).
const CX = 310, CZ = -225, RING = 14;
const PRE = 160;
export default {
  name: 'b10-struggle', frames: 306, preroll: PRE, seed: 11,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all', 2); R.select('sun'); R.fill();
    R.place(CX, CZ + 8, Math.PI);
    await R.settle();
    // cache the rival's model before the shot
    G.combat.startDuel('oboroyo', { pos: { x: CX, z: CZ }, r: RING });
    await R.step(40);
    G.combat.clear(); R.clearCombat();
  },
  start(G, T, R) { R.clearCombat(); R.place(CX, CZ + 8, Math.PI); R.fill(); R.keepFull(true); R.select('sun'); window.__st = { atk: null, s0: null, last: -1e9, up: null }; },
  // side-on, low, from the east: she is on the left, 胧夜 on the right, the clash between them. A slow push-in and a
  // hand-held tremor that grows with the pressure.
  camera: (f, G) => {
    const gy = G.world.heightAt(CX, CZ);
    const u = Math.min(1, Math.max(0, f / 288)), e = u * u * (3 - 2 * u);
    const k = 0.25 + 0.75 * u * u;
    const n = (a, b, c) => Math.sin(f * a + b) * 0.6 + Math.sin(f * c + b * 2.1) * 0.4;
    const x = CX + 11.8 - 1.2 * e, y = gy + 1.55 - 0.35 * e, z = CZ + 0.6 + 0.3 * e;
    return { pos: [x + n(0.11, 1, 0.23) * 0.05 * k, y + n(0.13, 2, 0.29) * 0.05 * k, z + n(0.09, 3, 0.31) * 0.05 * k],
             look: [CX, gy + 1.15 + n(0.17, 4, 0.37) * 0.04 * k, CZ + 0.6 + n(0.15, 5, 0.33) * 0.05 * k], fov: 48 - 1.5 * e };
  },
  actions: [
    { f: -92, do: (G) => { G.combat.startDuel('oboroyo', { pos: { x: CX, z: CZ }, r: RING }); const e = G.combat.duel.enemy; e.hp = e.maxHp * 0.5; } },
  ],
  onFrame(f, G, T, R) {
    const S = window.__st, d = G.combat.duel, e = d && d.enemy;
    if (!e) return;
    if (S.atk === null && e.atk && e.atk.name === 'beam') { S.atk = f; R.log('rival beam windup at', f); }
    if (S.atk !== null && f === S.atk + 40) T.key('Mouse2', true);
    const s = G.spells.struggle;
    if (!s && S.s0 !== null && !S.end) { S.end = f; R.log('struggle end at', f); }
    if (s && S.s0 === null) { S.s0 = f; R.log('struggle start at', f, 'P', G.player.pos.toArray().map(v=>v.toFixed(1)).join(','), 'E', e.pos.toArray().map(v=>v.toFixed(1)).join(','), 'clash', s.pos.toArray().map(v=>v.toFixed(1)).join(',')); }
    if (S.up !== null && f >= S.up) { T.key('Mouse0', false); S.up = null; }
    if (!s) return;
    const t = f - S.s0;
    const pa = s.a.caster === G.player;
    const share = pa ? s.v : 1 - s.v;
    const T0 = 160, T1 = 286;
    let target, slope;
    if (t < T0) { target = 0.5 + 0.05 * Math.sin(t / 26); slope = 0.05 * Math.cos(t / 26) / 26 * 60; }
    else { const u = Math.min(1, (t - T0) / (T1 - T0)); target = 0.5 + 0.5 * u; slope = 0.5 / (T1 - T0) * 60; }
    const rate = (target - share) * 4 + slope;
    const pushAI = 1.15;
    const need = Math.max(0, Math.min(9, (pushAI + rate / 0.2 - 0.55) / 0.32));
    if (S.up === null && s.mash < need - 0.3 && f - S.last >= 4) { T.key('Mouse0', true); S.up = f + 2; S.last = f; }
    if (f % 24 === 0) R.log('t', t, 'share', share.toFixed(2), 'target', target.toFixed(2), 'mash', s.mash.toFixed(1));
  },
};
