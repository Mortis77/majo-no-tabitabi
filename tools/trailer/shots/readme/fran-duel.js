// README: Fran's spar in the forest clearing (the replay of story/fran-spar.js, started the way the clearing's prompt
// starts it). Fran's wand grows a magic circle, a stardust bolt comes in, Elaina raises her guard as it arrives: the
// perfect guard's starburst, and the bolt flies back at Fran. 5 s, over-the-shoulder camera.
const HX = 2100, HZ = -70;
const GUARD_AT = 172; // frame the guard goes up (the bolt lands a few frames later; see the take log)
export default {
  name: 'readme-fran-duel',
  frames: 300,
  preroll: 90,
  seed: 12,
  params: 'outfit=elaina&allspells=1',
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.25 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.15 - 0.85) * 1440) / (2 * Math.PI) - 10000;
    R.spells('all');
    R.place(HX, HZ, Math.PI);
    await R.step(200);
  },
  start(G, T, R) {
    R.place(HX, HZ, Math.PI);
    G.story.spar.start(false); G.story.npcs.stage(true);
    window.__duelLog = { hp: G.player.hp, hits: [], clash: [] };
    G.events.on('spell:clash', (e) => window.__duelLog.clash.push(window.__duelF + ':' + (e?.kind || e?.result || '?')));
  },
  // over her right shoulder toward Fran (who moves between casts): a long lens, the look eased after Fran
  camera(f, G) {
    const P = G.player, n = G.story.npcs.get('fran'), V = G.THREE.Vector3;
    const S = (window.__duelCam ||= { f: new V().copy(n ? n.pos : P.pos), last: -1e9 });
    if (n) S.f.lerp(n.pos, f - S.last > 30 ? 1 : 0.06);
    S.last = f;
    const e = P.pos, d = new V(S.f.x - e.x, 0, S.f.z - e.z).normalize(), r = new V(-d.z, 0, d.x);
    const k = f / 299;
    return {
      pos: new V().copy(e).addScaledVector(d, -(3.4 + 0.5 * k)).addScaledVector(r, -(1.35 + 0.2 * k)).setY(e.y + 1.75 + 0.1 * k),
      look: new V().copy(e).lerp(S.f, 0.72).setY((e.y + S.f.y) / 2 + 1.15),
      fov: 30 + 3 * k,
    };
  },
  actions: [
    { f: GUARD_AT, key: 'KeyR', down: true },
    { f: GUARD_AT + 30, key: 'KeyR', down: false },
  ],
  onFrame(f, G, T, R) {
    window.__duelF = f;
    const P = G.player, A = P.aim, n = G.story.npcs.get('fran');
    if (n && A) { // face Fran: aim at her (see fire-tornado.js for why the shot sets the aim itself)
      A.origin.set(P.pos.x, P.pos.y + 1.3, P.pos.z);
      A.point.set(n.pos.x, n.pos.y + 1.2, n.pos.z);
      A.dir.subVectors(A.point, A.origin); A.dist = A.dir.length(); A.dir.normalize();
      G.cam.yaw = Math.atan2(n.pos.x - P.pos.x, n.pos.z - P.pos.z) - Math.PI;
    }
    const L = window.__duelLog;
    if (L && P.hp !== L.hp) { L.hits.push(f); L.hp = P.hp; }
    if (f === 299) R.log('duel log ' + JSON.stringify(L) + ' fran ' + (n ? n.pos.toArray().map((v) => v.toFixed(1)) : '-'));
  },
};
