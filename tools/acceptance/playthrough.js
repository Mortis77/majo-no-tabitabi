// ACCEPTANCE: new game → m0 … m6 → ending, driving the real systems. Run with --params "story=1" --timeout 1500.
const V = G.THREE.Vector3;
const log = (...a) => console.warn('[pt]', ...a);
const fails = [];
const ok = (c, msg) => { if (!c) { fails.push(msg); console.error('[pt] FAIL ' + msg + ' :: ' + JSON.stringify(S.debug())); if (fails.length >= 3) throw new Error('aborting after 3 failures: ' + fails.join(' | ')); } return c; };
const FROM = +(new URLSearchParams(location.search).get('from') || 0);
const QIDS = ['m0_shrine', 'm1_village', 'm2_dusk', 'm3_town', 'm4_mirror', 'm5_crystal', 'm6_moon'];
const sleep = (ms) => T.wait(ms);
async function waitFor(fn, ms = 10000, step = 100) { const t0 = performance.now(); while (performance.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* */ } await sleep(step); } return false; }
const Q = G.quests, S = G.story;
const at = (q, s) => Q.stepId(q) === s;
// A quest line that was held back by a fight (story.dlg waits for calm) can open while we wait: page through it like a player would.
const expectStep = async (q, s, ms = 8000) => {
  const t0 = performance.now(); let hit = false;
  while (performance.now() - t0 < ms) {
    if (at(q, s)) { hit = true; break; }
    if (G.dialogue.active || G.ui.talking) { await T.press('KeyE', 50); await sleep(110); } else await sleep(100);
  }
  ok(hit, `${q} should reach step ${s} (is ${Q.stepId(q)}; done=${Q.isDone(q)})`);
};
/** Press confirm while any dialogue / ending is up, until cond() (and nothing busy). */
async function settle(cond = () => true, ms = 60000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    if (G.dialogue.active || G.ui.talking) { await T.press('KeyE', 50); await sleep(110); continue; }
    if (G.mode === 'ending') { await T.press('Enter', 50); await sleep(250); continue; }
    if (!S.busy && !G.combat?.duel && !G.combat?.boss && !S.cut.active && G.mode === 'play' && cond()) return true;
    await sleep(150);
  }
  return false;
}
async function tp(x, z, y) { G.debug.teleport(x, z, y); G.terrain?.settle?.(); await sleep(350); }
async function talkTo(id, shot) {
  const n = G.npcs.get(id); const p = G.npcs.posOf(id);
  const yaw = n.baseYaw;
  await tp(p.x + Math.sin(yaw) * 1.7, p.z + Math.cos(yaw) * 1.7);
  await waitFor(() => G.npcs.actor(id) && G.interact.current, 6000);
  await T.frames(4);
  const before = G.dialogue.active;
  await T.press('KeyE');
  const opened = await waitFor(() => G.dialogue.active || S.busy, 3000);
  ok(opened, 'talk to ' + id + ' opened a dialogue (interact=' + (G.interact.current ? 'yes' : 'none') + ')');
  if (shot) { await sleep(1300); await T.shot(shot); }
  await settle();
}
async function killAll(r = 60) {
  for (let k = 0; k < 30; k++) {
    const P = G.player.pos;
    const list = G.combat.enemies.filter((e) => !e.dead && Math.hypot(e.pos.x - P.x, e.pos.z - P.z) < r);
    if (!list.length) return;
    for (const e of list) G.combat.damage(e, 9999, { force: true, element: 'fire' });
    await sleep(300);
  }
}
const lanternE = async (id) => {
  const h = G.structures.greatLanterns[id];
  // lines held back by the fight open a moment after it ends: read them before walking to the lantern
  await sleep(900); await settle(() => true, 20000);
  await waitFor(() => G.state.gp?.glReady?.[id], 6000);
  const yawTo = Math.atan2(G.player.pos.x - h.pos.x, G.player.pos.z - h.pos.z);
  await tp(h.pos.x + Math.sin(yawTo) * 2.4, h.pos.z + Math.cos(yawTo) * 2.4);
  await waitFor(() => G.interact.current, 3000);
  await T.press('KeyE');
};
const saveLoad = async (label) => {
  G.save.write(true);
  const json = JSON.stringify(G.state);
  const before = { q: Q.active().map((id) => id + ':' + Q.stepId(id)).join(','), sp: JSON.stringify(G.state.spells), ab: JSON.stringify(G.state.abilities), lit: JSON.stringify(G.state.greatLanterns) };
  // wreck the live state, then restore the way boot does
  G.state = JSON.parse('{}');
  await S.debugReload(json);
  await sleep(1200);
  const after = { q: Q.active().map((id) => id + ':' + Q.stepId(id)).join(','), sp: JSON.stringify(G.state.spells), ab: JSON.stringify(G.state.abilities), lit: JSON.stringify(G.state.greatLanterns) };
  ok(before.q === after.q, label + ' quests restored ' + before.q + ' vs ' + after.q);
  ok(before.sp === after.sp && before.ab === after.ab && before.lit === after.lit, label + ' spells/abilities/lanterns restored');
  ok(!!G.ui && G.mode === 'play', label + ' back in play');
  log(label, 'restored', after.q);
};

async function duelWith(id, cond, shot) {
  for (let k = 0; k < 3 && !cond(); k++) {
    await talkTo(id, k ? null : shot);
    await settle(cond, 90000);
    if (!cond()) log('duel retry', id, JSON.stringify(S.lastDuel));
  }
  return cond();
}
S.testWin = true;
G.combat.campsEnabled = false; // keep stray camps out of the way of the script (story fights still spawn)
if (FROM > 0) { await sleep(500); if (S.cut.active) { await T.press('Escape', 90); await settle(() => true, 15000); } Q.debugSkipTo(QIDS[FROM]); await sleep(800); log('skipped to', JSON.stringify(S.debug())); }
if (FROM <= 0) { // m0
ok(await waitFor(() => S.cut.active === 'opening', 4000), 'opening cutscene plays on a new game');
await sleep(4500); await T.shot('01_opening');
await T.press('Escape', 90);
await settle(() => true, 15000);
ok(S.flag('opening_seen'), 'opening seen');
ok(at('m0_shrine', 'wake'), 'm0 wake');
await sleep(600); await T.shot('02_tracker_compass');
await talkTo('granny', '03_teacher_granny');
await expectStep('m0_shrine', 'sun');
ok(G.state.spells.sun >= 1, 'learned sun');
G.player.mana = G.player.maxMana; G.spells.select?.('sun');
ok(!!G.spells.tryCast('sun', 'small'), 'cast sun');
await expectStep('m0_shrine', 'training');
await settle(() => true, 8000);
await tp(-600, -12);
ok(await waitFor(() => S.fights.training, 6000), 'training wave spawned');
await settle(() => true, 6000);
await sleep(800); await killAll(); await sleep(800); await killAll();
await expectStep('m0_shrine', 'himawari', 10000);
await duelWith('himawari', () => G.state.spells.fire >= 1, '04_teacher_himawari');
ok(G.state.spells.fire >= 1 && G.state.abilities.guard, 'learned fire + guard from 阳葵');
await expectStep('m0_shrine', 'chest');
await tp(-557.5, 44);
await waitFor(() => G.interact.current, 4000);
await T.press('KeyE');
await settle(() => G.state.abilities.broom, 20000);
ok(G.state.abilities.broom, 'broom from the chest');
await expectStep('m0_shrine', 'rings');
// the six-ring test flight: real race, flown by placing her on each ring
await tp(-520, 104);
await waitFor(() => G.interact.current, 3000);
await T.press('KeyE');
ok(await waitFor(() => G.gameplay.raceRunning === 'race_shrine', 4000), 'race started');
await sleep(3600);
for (const [x, z, y] of [[-506, 90, 22], [-482, 74, 30], [-446, 44, 46], [-470, 22, 56], [-505, 52, 52], [-516, 96, 26]]) {
  if (!G.player.onBroom) G.player.mountBroom?.();
  G.player.teleport(x, y, z); await sleep(450);
}
ok(await waitFor(() => !!G.state.races.race_shrine, 6000), 'race finished: ' + JSON.stringify(G.state.races));
await expectStep('m0_shrine', 'report', 6000);
if (G.player.onBroom) G.player.dismountBroom?.();
await talkTo('granny');
ok(Q.isDone('m0_shrine') && Q.isActive('m1_village'), 'm0 done, m1 active');
}
if (FROM <= 1) { // m1
await sleep(500); await T.shot('05_tracker_m1');
await tp(-455, 165);
await settle(() => S.fights.village || Q.stepId('m1_village') !== 'go', 8000);
await expectStep('m1_village', 'sprites');
await sleep(1500); await T.shot('06_village_fire');
await killAll(); await sleep(600); await killAll();
await settle(() => at('m1_village', 'ushio'), 15000);
await talkTo('ushio', '07_teacher_ushio');
await expectStep('m1_village', 'fire');
ok(G.state.spells.water >= 1, 'learned water');
for (const s of S.fire.slots(true)) { await tp(s.x + 3, s.z + 3); G.elements.apply('water', new V(s.x, s.y - 1, s.z), 4, 1, { team: 'player', source: G.player }); await sleep(500); }
await settle(() => at('m1_village', 'report'), 8000);
await expectStep('m1_village', 'report');
await talkTo('ushio');
ok(Q.isDone('m1_village') && at('m2_dusk', 'bridge'), 'm1 done → m2');
await saveLoad('SAVE#1');
}
if (FROM <= 2) { // m2
await tp(-142, 95); await settle(() => true, 8000);
await tp(-75, 95); await settle(() => true, 8000);
await expectStep('m2_dusk', 'kuzunoha');
await talkTo('kuzunoha');
await duelWith('kokonoe', () => G.state.spells.wind >= 1 && G.state.abilities.wings, '08_teacher_kokonoe');
await expectStep('m2_dusk', 'glide');
await tp(-110, 210, 95); await sleep(250);
T.key('Space', true); await sleep(3600); T.key('Space', false);
await settle(() => at('m2_dusk', 'nests'), 8000);
await expectStep('m2_dusk', 'nests');
for (const n of [{ id: 'nest_west', x: -85, z: -205 }, { id: 'nest_east', x: 25, z: -215 }, { id: 'nest_south', x: -40, z: -105 }]) {
  await tp(n.x + 8, n.z + 8); await sleep(1500);
  for (let k = 0; k < 8 && !G.state.defeated[n.id]; k++) {
    G.elements.apply('fire', new V(n.x, G.world.heightAt(n.x, n.z) + 1, n.z), 9, 2, { team: 'player', source: G.player });
    for (const e of G.combat.enemies.filter((e) => !e.dead && Math.hypot(e.pos.x - n.x, e.pos.z - n.z) < 25)) G.combat.damage(e, 9999, { force: true, element: 'fire' });
    await sleep(700);
  }
  ok(G.state.defeated[n.id], n.id + ' destroyed');
}
await settle(() => at('m2_dusk', 'oboroga'), 10000);
await tp(-30, -140);
ok(await waitFor(() => S.cut.active === 'boss:oboroga' || G.combat.boss, 8000), '胧牙 fight starts');
await sleep(1500); await T.shot('09_boss_oboroga');
await settle(() => G.state.defeated.oboroga, 60000);
await expectStep('m2_dusk', 'lantern', 10000);
await lanternE('gl_dusk');
ok(await waitFor(() => S.cut.active === 'lantern:gl_dusk', 4000), '暮灯 lighting scene');
await sleep(5200); await T.shot('10_lantern_dusk');
await settle(() => G.state.greatLanterns.gl_dusk, 30000);
await expectStep('m2_dusk', 'report', 8000);
await talkTo('kuzunoha');
ok(Q.isDone('m2_dusk') && Q.isActive('m3_town'), 'm2 done → m3');
}
if (FROM <= 3) { // m3
await tp(120, -60);
ok(await waitFor(() => S.cut.active === 'ring', 8000), 'first sight of the ring');
await sleep(3000); await T.shot('11_ring');
await settle(() => true, 20000);
await tp(205, -108); await settle(() => at('m3_town', 'shoku'), 8000);
await talkTo('shoku', '12_talk_night_shoku');
await expectStep('m3_town', 'fireflies');
G.gameplay.debugCollectAll('firefly');
await expectStep('m3_town', 'tower');
await talkTo('shoku');
await settle(() => S.flag('town_lit'), 30000);
await expectStep('m3_town', 'naru', 8000);
await T.shot('13_town_lit');
await duelWith('naru', () => G.state.spells.thunder >= 1, '14_teacher_naru');
ok(Q.isDone('m3_town') && Q.isActive('m4_mirror'), 'm3 done → m4');
}
if (FROM <= 4) { // m4
await talkTo('kagami', '15_teacher_kagami');
await expectStep('m4_mirror', 'lotus');
G.gameplay.debugCollectAll('lotus_lamp');
await expectStep('m4_mirror', 'moth');
await tp(110, 392);
ok(await waitFor(() => S.cut.active === 'boss:tomoshigui' || G.combat.boss, 8000), '灯喰蛾 fight starts');
await settle(() => G.state.defeated.tomoshigui, 60000);
await expectStep('m4_mirror', 'lantern', 10000);
await lanternE('gl_mirror');
await sleep(1000);
await settle(() => G.state.greatLanterns.gl_mirror && Q.isActive('m5_crystal'), 30000);
ok(Q.isDone('m4_mirror'), 'm4 done');
await saveLoad('SAVE#2');
}
if (FROM <= 5) { // m5
await tp(545, -245);
await settle(() => at('m5_crystal', 'puzzle'), 10000);
await expectStep('m5_crystal', 'puzzle');
await sleep(1500); await killAll(80);
const ME = G.gameplay._m.ME;
for (let i = 0; i < 3; i++) for (let k = 0; k < 14 && G.state.gp.pedestals[i] !== ME.puzzle.target[i]; k++) { G.gameplay.rotatePedestal(i, 1); await sleep(450); }
await sleep(1500);
ok(G.gameplay.puzzleSolved, 'crystal puzzle solved');
await killAll(80);
await settle(() => at('m5_crystal', 'lantern'), 10000);
await lanternE('gl_crystal');
await sleep(1000);
await settle(() => G.state.greatLanterns.gl_crystal && at('m5_crystal', 'banou'), 30000);
await talkTo('banou', '16_teacher_banou');
await settle(() => Q.isActive('m6_moon'), 20000);
ok(Q.isDone('m5_crystal'), 'm5 done');
}
if (FROM <= 6) { // m6
ok(await waitFor(() => !G.gameplay.barrierUp, 8000), 'barrier down after three lanterns');
await settle(() => at('m6_moon', 'ascend'), 30000);
ok(G.state.abilities.kinkan, '金环 granted before the final battle');
const L = G.world.ANCHORS.palace_landing;
await tp(L.x, L.z - 4);
log('landing y', G.player.pos.y.toFixed(1));
await settle(() => at('m6_moon', 'oboroyo'), 8000);
ok(await waitFor(() => S.cut.active === 'boss:oboroyo' || G.combat.boss, 10000), '胧夜 fight starts');
await sleep(2500); await T.shot('17_boss_oboroyo');
await settle(() => G.state.defeated.oboroyo, 90000);
// the line after 胧夜 falls waits for calm and can open only after settle() has returned: page through it like a player would
ok(await (async () => { const t0 = performance.now(); while (performance.now() - t0 < 30000) { if (S.cut.active === 'boss:mumyo' || G.combat.boss || G.state.defeated.mumyo) return true; if (G.dialogue.active || G.ui.talking) { await T.press('KeyE', 50); await sleep(110); } else await sleep(100); } return false; })(), '无明 fight starts');
await settle(() => G.state.defeated.mumyo, 90000);
await expectStep('m6_moon', 'lantern', 15000);
await lanternE('gl_moon');
ok(await (async () => { const t0 = performance.now(); while (performance.now() - t0 < 60000) { if (S.cut.active === 'ending' || G.mode === 'ending') return true; if (G.dialogue.active || G.ui.talking) await T.press('KeyE', 50); await sleep(150); } return false; })(), 'ending starts');
await sleep(1800); await T.shot('18_ending_wave');
ok(await waitFor(() => G.mode === 'ending', 30000), 'showEnding');
await sleep(2500); await T.shot('19_ending_card');
await settle(() => S.flag('postgame') && G.mode === 'play' && !G.dialogue.active, 120000);
ok(Q.isDone('m6_moon'), 'm6 done');
ok(S.flag('ending_done') && S.flag('postgame'), 'post-game flag');
ok(G.mode === 'play', 'free roam after the ending');
}
for (const s of ['sun', 'fire', 'water', 'wind', 'thunder', 'moon', 'earth']) ok((G.state.spells[s] || 0) >= 1, 'spell ' + s);
for (const a of ['guard', 'broom', 'wings', 'kinkan']) ok(!!G.state.abilities[a], 'ability ' + a);
await sleep(1500); await T.shot('20_postgame');
log('final', JSON.stringify(S.debug()));
log('errors', JSON.stringify(T.errors()));
ok(T.errors().length === 0, 'no errors');
log(fails.length ? 'FAILED ' + fails.length : 'ALL PASSED');
