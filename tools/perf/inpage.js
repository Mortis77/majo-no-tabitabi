// In-page half of tools/perf.mjs. Evaluated as the body of an async function with T, G and CFG in scope.
// CFG = { tier, scenes: [ids] | null, groups: [names], layers: [scene ids] , frames, settleMs, finish }
// Returns { meta, scenes: [{ id, group, stats, frames? }], layers: { sceneId: [{ layer, ... }] }, runs: [...] }.
// Measurement:
//   cpu   = script time of one frame (first system update -> end of G.renderFrame, CPU side; WebGL calls are queued)
//   gpu   = EXT_disjoint_timer_query_webgl2 TIME_ELAPSED around the same span (falls back to cpu after gl.finish())
//   frame = max(cpu, gpu): what the frame would cost with CPU and GPU overlapping
//   iv    = the real requestAnimationFrame interval (headless Chrome paces rAF at the display rate)
const R = G.renderer, gl = R.getContext();
// The GPU timer on ANGLE-Metal reports wall spans that include queued work of earlier frames (78 ms GPU at a 29 ms
// frame interval), and gl.finish() does not wait for the GPU there. So GPU cost is measured as the SERIAL frame cost:
// drain the GPU (1-pixel readPixels), run the frame, read one pixel again -> 'ser' = CPU + GPU of exactly this frame.
const ext = CFG.timer ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
const px = new Uint8Array(4);
const drainGPU = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hAt = (x, z) => Math.max(0, G.world.heightAt(x, z));

// ---------------------------------------------------------------- instrumentation (once per page)
const P = window.__perf || (window.__perf = (() => {
  const P = { rec: null, cur: null, pending: [], free: [], sysNames: [], lastStart: 0, hooks: [] };
  const sysMs = new Float64Array(64);
  P.sysMs = sysMs; P.acc = new Float64Array(64); P.accN = 0;
  G.systems.forEach((s, i) => {
    P.sysNames[i] = s.name;
    for (const fn of ['update', 'lateUpdate']) {
      const orig = s[fn];
      if (!orig) continue;
      s[fn] = function (a, b) {
        if (i === 0 && fn === 'update') P.frameStart();
        const t = now();
        try { return orig.call(this, a, b); } finally { sysMs[i] += now() - t; }
      };
    }
  });
  P.frameStart = () => {
    const t = now();
    P.cur = { t0: t, iv: P.lastStart ? t - P.lastStart : 0 };
    if (P.sync && P.rec) { drainGPU(); P.cur.t0 = now(); }
    P.lastStart = t;
    sysMs.fill(0);
    for (const h of P.hooks) h.pre?.();
    if (ext && P.rec) {
      const q = P.free.pop() || gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      P.cur.q = q;
    }
  };
  const rf = G.renderFrame;
  G.renderFrame = function () {
    const c = P.cur;
    const t1 = now();
    rf.call(this);
    if (!c) return;
    const t2 = now();
    if (P.sync && P.rec) { drainGPU(); c.ser = now() - c.t0; }
    if (c.q) gl.endQuery(ext.TIME_ELAPSED_EXT);
    c.upd = t1 - c.t0; c.rf = t2 - t1; c.cpu = t2 - c.t0;
    const ri = R.info;
    c.calls = ri.render.calls; c.tris = ri.render.triangles;
    c.progs = ri.programs ? ri.programs.length : 0; c.tex = ri.memory.textures; c.geo = ri.memory.geometries;
    if (c.progs > (P.progN ?? c.progs)) {
      const fresh = new Set(ri.programs.slice(P.progN));
      c.newProgs = [...fresh].map((pg) => (pg.name || '?') + '#' + String(pg.cacheKey || '').length);
      // who uses them: object name / owning system / material type (only on the rare frames that compile)
      const who = new Set();
      G.scene.traverse((o) => { for (const m of [].concat(o.material || [])) { if (!m) continue; const pr = R.properties.get(m); if (pr && fresh.has(pr.currentProgram)) { let s = o; while (s.parent && s.parent !== G.scene) s = s.parent; who.add((o.name || o.type) + '<' + (s.name || s.userData.__sys || s.type) + '>:' + (m.name || m.type)); } } });
      c.newProgs.push(...[...who].slice(0, 6));
    }
    P.progN = c.progs;
    c.heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0;
    if (P.rec) {
      // per-system split for slow frames only (hitch analysis)
      if (c.cpu > 12) { const a = []; for (let i = 0; i < P.sysNames.length; i++) if (sysMs[i] > 1) a.push(P.sysNames[i] + ' ' + sysMs[i].toFixed(1)); c.sys = a.join(', '); }
      c.mode = G.mode; c.sync = !!P.sync;
      if (!P.sync) { for (let i = 0; i < P.sysNames.length; i++) P.acc[i] += sysMs[i]; P.acc[63] += c.rf; P.accN++; }
      P.rec.push(c);
      if (c.q) P.pending.push(c);
    }
    // collect finished GPU timings
    while (P.pending.length) {
      const f = P.pending[0];
      if (!gl.getQueryParameter(f.q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      f.gpu = disjoint ? null : gl.getQueryParameter(f.q, gl.QUERY_RESULT) / 1e6;
      P.free.push(f.q); f.q = null; P.pending.shift();
    }
    P.cur = null;
  };
  return P;
})());

async function drain() { for (let i = 0; i < 30 && P.pending.length; i++) await T.frames(1); }
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const r1 = (x) => (x == null ? null : Math.round(x * 100) / 100);
function summarize(all) {
  const fr = all.filter((f) => !f.sync), sy = all.filter((f) => f.sync);
  const cpu = fr.map((f) => f.cpu), gpu = fr.filter((f) => f.gpu != null).map((f) => f.gpu);
  const iv = fr.map((f) => f.iv).filter((x) => x > 0);
  // frame = the real rAF interval (vsync-capped at ~16.7); ser = serial CPU+GPU cost of one frame (not capped)
  const frame = iv.length ? iv : cpu;
  const ser = sy.map((f) => f.ser);
  const last = all[all.length - 1] || {};
  return {
    n: fr.length, sysAvg: all.sysAvg,
    ser: ser.length ? { p50: r1(pct(ser, 0.5)), p95: r1(pct(ser, 0.95)), max: r1(Math.max(...ser)) } : null,
    frame: { p50: r1(pct(frame, 0.5)), p95: r1(pct(frame, 0.95)), max: r1(Math.max(...frame)) },
    cpu: { p50: r1(pct(cpu, 0.5)), p95: r1(pct(cpu, 0.95)), max: r1(Math.max(...cpu)) },
    gpu: gpu.length ? { p50: r1(pct(gpu, 0.5)), p95: r1(pct(gpu, 0.95)), max: r1(Math.max(...gpu)) } : null,
    iv: { p50: r1(pct(iv, 0.5)), p95: r1(pct(iv, 0.95)), max: r1(Math.max(...iv)) },
    calls: Math.round(pct(all.map((f) => f.calls), 0.5)), tris: Math.round(pct(all.map((f) => f.tris), 0.5)),
    cpuSync: r1(pct(sy.map((f) => f.cpu), 0.5)),
    programs: last.progs, textures: last.tex, geometries: last.geo, heapMB: r1(last.heap),
  };
}
async function sample(n, nSync = Math.round(n / 2)) {
  const fr = []; P.rec = fr; P.acc.fill(0); P.accN = 0;
  if (n) await T.frames(n);
  if (P.accN) { const o = {}; for (let i = 0; i < P.sysNames.length; i++) { const v = P.acc[i] / P.accN; if (v >= 0.05) o[P.sysNames[i]] = r1(v); } o.renderSubmit = r1(P.acc[63] / P.accN); fr.sysAvg = o; }
  if (nSync) { P.sync = true; await T.frames(nSync); P.sync = false; }
  P.rec = null; await drain();
  return fr;
}

// ---------------------------------------------------------------- layers
// classify each top-level scene object (system that added it, tagged by the pre-boot hook in perf.mjs, + its name)
function layerOf(o) {
  const n = o.name || '', s = o.userData.__sys || '';
  if (n === 'flora:grass' || n === 'flora:flowers') return 'grass';
  if (o.material && o.material.name === 'flora-imp') return 'impostors';
  if (n === 'water') return 'water';
  if (n.startsWith('actor') || n === 'player' || n.startsWith('actorBlob')) return 'characters';
  if (n.startsWith('mvSky')) return 'sky';
  if (s === 'flora') return 'flora';
  if (s === 'terrain') return 'terrain';
  if (s === 'landforms') return 'landforms';
  if (s === 'life') return 'life';
  if (s === 'structures') return 'structures';
  if (s === 'props') return 'props';
  if (s === 'combat' || s === 'story') return 'characters';
  if (s === 'fx' || s === 'elements' || s === 'spells') return 'fx';
  if (s === 'gameplay') return 'gameplay';
  if (s === 'sky') return 'sky';
  return 'other';
}
function layerCensus() {
  const out = {};
  for (const c of G.scene.children) {
    const L = layerOf(c), e = out[L] || (out[L] = { objects: 0, meshes: 0, tris: 0 });
    e.objects++;
    c.traverse((o) => { if ((o.isMesh || o.isPoints) && o.geometry) { e.meshes++; const g = o.geometry; const ic = g.index ? g.index.count : (g.attributes.position?.count || 0); e.tris += Math.round(ic / 3 * (o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? (g.instanceCount === Infinity ? 1 : g.instanceCount) : 1))); } });
  }
  return out;
}
const saved = new Map();
function hideLayer(L) {
  for (const c of G.scene.children) if (layerOf(c) === L) c.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; saved.set(o, o.layers.mask); o.layers.mask = 0; });
}
function restoreLayers() { for (const [o, m] of saved) o.layers.mask = m; saved.clear(); }

const pipe = G.sys.sky?.state?.pipe;
const sh = G.look?.shadows;
const toggles = {
  // shadow cascade k: skip its map render (the old map stays bound, so the shading cost is unchanged)
  shadow: (k) => {
    const c = sh?.cascades?.[k]; if (!c) return null;
    const h = { pre() {} };
    const upd = sh.update;
    sh.update = function (d) { upd.call(this, d); c.l.shadow.autoUpdate = false; c.l.shadow.needsUpdate = false; };
    return () => { sh.update = upd; c.l.shadow.autoUpdate = c.every === 1; void h; };
  },
  post: (flag) => {
    if (!pipe) return null;
    const sp = pipe.scenePass;
    const was = { ao: sp.ao, bloom: pipe.bloom.enabled, shafts: sp.shafts, smaa: pipe.smaa.enabled, grade: G.post.flags?.grade };
    if (flag === 'ao') sp.ao = false; else if (flag === 'bloom') pipe.bloom.enabled = false; else if (flag === 'shafts') sp.shafts = false;
    else if (flag === 'smaa') pipe.smaa.enabled = false;
    else if (flag === 'msaa') { const rt = sp.sceneRT; was.samples = rt.samples; if (!rt.samples) return null; rt.samples = 0; rt.dispose(); }
    return () => { sp.ao = was.ao; pipe.bloom.enabled = was.bloom; sp.shafts = was.shafts; pipe.smaa.enabled = was.smaa;
      if (flag === 'msaa') { sp.sceneRT.samples = was.samples; sp.sceneRT.dispose(); } };
  },
  waterRefl: () => { const w = G.water; if (!w || !w.reflect) return null; w.reflect = false; return () => { w.reflect = true; }; },
};
const LAYERS = ['terrain', 'grass', 'flora', 'impostors', 'structures', 'props', 'landforms', 'life', 'characters', 'gameplay', 'water', 'sky', 'fx'];
async function layerAB(n = 40) {
  const base = []; const out = [];
  const one = async (name, apply) => {
    const undo = apply();
    if (undo === null) return;
    await T.frames(6);
    const off = summarize(await sample(0, n));
    if (typeof undo === 'function') undo(); else restoreLayers();
    await T.frames(6);
    const on = summarize(await sample(0, n));
    base.push(on);
    out.push({ layer: name, on, off,
      dSer: r1(on.ser.p50 - off.ser.p50), dCpu: r1(on.cpuSync - off.cpuSync),
      dCalls: on.calls - off.calls, dTris: on.tris - off.tris });
  };
  for (const L of LAYERS) {
    await one(L, () => { hideLayer(L); if (L === 'water' && G.water) { const w = G.water, was = w.reflect; w.reflect = false; return () => { restoreLayers(); w.reflect = was; }; } return true; });
  }
  await one('water reflection', toggles.waterRefl);
  for (let k = 0; k < (sh?.cascades?.length || 0); k++) await one('shadow cascade ' + k, () => toggles.shadow(k));
  for (const f of ['ao', 'bloom', 'shafts', 'smaa', 'msaa']) await one('post ' + f, () => toggles.post(f));
  return out;
}

// ---------------------------------------------------------------- scenes
const go = async (x, z) => { T.cam(); T.teleport(x, z); await sleep(300); G.terrain?.settle?.(); await sleep(CFG.settleMs); };
const gcam = async (yaw, pitch) => { if (G.cam) { G.cam.yaw = yaw; G.cam.pitch = pitch; } await sleep(600); };
const look = async (ex, ey, ez, tx, ty, tz) => { T.viewCam(ex, ey, ez, tx, ty, tz); await T.frames(30); };
let y;
const cleanups = [];
const S = [];
const sc = (id, group, setup) => S.push({ id, group, setup });
// the 31 tour cameras of tools/devkit/after2.js (fixed ones as view-only cameras)
sc('t01_meadow_game', 'tour', async () => { await go(-470, 120); await gcam(0.9, 0.05); });
sc('t02_heroine_close', 'tour', async () => { const p = G.player.pos; await look(p.x + 1.6, p.y + 1.45, p.z + 2.3, p.x, p.y + 1.2, p.z); });
sc('t03_dusk_forest_game', 'tour', async () => { await go(-120, -60); await gcam(2.2, 0.0); });
sc('t04_village_house', 'tour', async () => { await go(-440, 150); await look(-452, 12.5, 168, -446, 11.5, 150); });
sc('t05_open_meadow_game', 'tour', async () => { await go(-500, 100); await gcam(0.4, 0.08); });
sc('t06_heroine_front_open', 'tour', async () => { const p = G.player.pos; await look(p.x - 1.2, p.y + 1.35, p.z - 2.0, p.x, p.y + 1.15, p.z); });
sc('t06b_heroine_back_open', 'tour', async () => { const p = G.player.pos; await look(p.x + 0.4, p.y + 1.9, p.z + 3.4, p.x, p.y + 1.1, p.z); });
sc('t07_shrine_game', 'tour', async () => { await go(-540, 58); await gcam(2.6, 0.1); });
sc('t08_pier_lake_game', 'tour', async () => { await go(56, 292); await gcam(0.0, 0.05); });
sc('t09_lantern_town_game', 'tour', async () => { await go(196, -118); await gcam(1.2, 0.02); });
sc('t10_glowwood_game', 'tour', async () => { await go(400, 210); await gcam(0.6, 0.02); });
sc('t11_west_coast_game', 'tour', async () => { await go(-560, 250); await gcam(1.6, 0.1); });
sc('t12_shrine_approach', 'tour', async () => { await go(-540, 70); y = hAt(-540, 82); await look(-540, y + 3.2, 96, -540, y + 6, 60); });
sc('t13_shrine_hall', 'tour', async () => { await look(-531, hAt(-531, 62) + 2.2, 66, -540, hAt(-540, 40) + 5, 40); });
sc('t14_village_wide', 'tour', async () => { await go(-455, 150); y = hAt(-455, 150); await look(-478, y + 9, 176, -452, y + 2, 148); });
sc('t15_fox_village', 'tour', async () => { await go(-70, 90); y = hAt(-70, 90); await look(-94, y + 7, 112, -68, y + 2, 88); });
sc('t16_dusk_bridge', 'tour', async () => { await go(-142, 95); y = hAt(-150, 110); await look(-160, y + 4, 118, -140, y + 2, 94); });
sc('t17_spring_cascade', 'tour', async () => { await go(-150, -236); y = hAt(-150, -232); await look(-150, y + 3, -222, -150, y + 5, -252); });
sc('t18_dusk_tree', 'tour', async () => { await go(-30, -150); y = hAt(-30, -150); await look(-34, y + 3, -138, -30, y + 12, -170); });
sc('t19_isle_from_ground', 'tour', async () => { await go(-470, 96); y = hAt(-470, 96); await look(-474, y + 2, 104, -470, 56, 60); });
sc('t20_isle_side', 'tour', async () => { await look(-440, 66, 84, -470, 58, 60); });
sc('t21_isle_dusk_side', 'tour', async () => { await look(-170, 96, -30, -200, 84, -60); });
sc('t22_mountain_cliffs', 'tour', async () => { await go(-40, -420); y = hAt(-40, -420); await look(-52, y + 3, -404, -20, y + 60, -540); });
sc('t23_wind_shrine', 'tour', async () => { await go(-20, -536); y = hAt(-20, -540); await look(-34, y + 5, -520, -20, y + 3, -540); });
sc('t24_south_cape', 'tour', async () => { await go(-380, 556); y = hAt(-380, 556); await look(-392, y + 6, 540, -360, y - 4, 600); });
sc('t25_east_shore', 'tour', async () => { await go(686, 60); y = hAt(686, 60); await look(672, y + 5, 52, 720, y, 76); });
sc('t26_crystal_hollow', 'tour', async () => { await go(540, -268); y = hAt(540, -268); await look(526, y + 4, -256, 547, y + 4, -277); });
sc('t27_palace_front', 'tour', async () => { await go(380, 2); y = hAt(380, 2); await look(380, y + 4, 26, 380, y + 14, -40); });
sc('t28_overlook_east', 'tour', async () => { await look(-560, 110, 20, -200, 20, -60); });
sc('t29_overlook_palace', 'tour', async () => { await look(200, 120, -140, 380, 60, -40); });
sc('t30_dango_stall', 'tour', async () => { await go(-446, 136); y = hAt(-444, 132); await look(-448.5, y + 1.7, 136.5, -444, y + 1.0, 132); });
sc('t31_lampmaker_shop', 'tour', async () => { await go(196, -130); y = hAt(196, -134); await look(199.5, y + 1.8, -130, 196, y + 1.2, -134); });

// worst cases
sc('w_town_above', 'worst', async () => { await go(205, -95); y = hAt(205, -125); await look(205, y + 55, -40, 205, y, -125); });
sc('w_town_street', 'worst', async () => { await go(205, -100); y = hAt(205, -100); await look(208, y + 1.7, -96, 200, y + 2.2, -135); });
sc('w_fox_street', 'worst', async () => { await go(-60, 100); y = hAt(-60, 100); await look(-56, y + 1.7, 104, -72, y + 2, 86); });
sc('w_village_10npc', 'worst', async () => {
  await go(-455, 160); y = hAt(-455, 150);
  const list = [...(G.npcs?.list?.values?.() || G.npcs?.list || [])];
  const assets = [...new Set(list.map((n) => n.def?.asset).filter(Boolean))].slice(0, 6);
  if (!assets.length) assets.push('char_villager_c');
  const near = list.filter((n) => n.pos && Math.hypot(n.pos.x + 455, n.pos.z - 150) < 45 && n.actor).length;
  const need = Math.max(0, 10 - near);
  const actors = [];
  for (let i = 0; i < need; i++) {
    const a = G.actors.createActor(assets[i % assets.length], { castShadow: true });
    const x = -462 + (i % 5) * 3.2, z = 150 + Math.floor(i / 5) * 3.5;
    a.group.position.set(x, G.world.groundAt(x, z), z); a.group.rotation.y = 0.6;
    G.scene.add(a.group); actors.push(a);
  }
  const hook = { pre: () => { for (const a of actors) { try { a.update(G.time.dt || 0.016); } catch (e) { /* ignore */ } } } };
  P.hooks.push(hook);
  cleanups.push(() => { P.hooks.splice(P.hooks.indexOf(hook), 1); for (const a of actors) { G.scene.remove(a.group); a.dispose?.(); } });
  await look(-474, y + 6, 172, -456, y + 1.5, 150);
  return { npcsNear: near, spawned: need };
});
sc('w_dusk_clearing', 'worst', async () => { await go(-120, -60); y = hAt(-120, -60); await look(-112, y + 2.2, -52, -132, y + 2, -76); });
sc('w_mirror_lake', 'worst', async () => { await go(56, 292); y = hAt(56, 292); await look(52, y + 3, 286, 120, 4, 400); });
sc('w_beam_struggle', 'worst', async () => {
  await go(-470, -70); const P0 = G.player.pos.clone();
  const e = G.combat?.spawn?.('caster', P0.clone().add(new G.THREE.Vector3(0, 0, -12)), { persistent: true }) || null;
  const o = P0.clone(); o.y += 1.3;
  const to = o.clone().add(new G.THREE.Vector3(0, 0, -12));
  G.player.mana = 999;
  const b1 = G.spells.cast('sun', 'big', { caster: G.player, team: 'player', origin: o, dir: new G.THREE.Vector3(0, 0, -1), duration: 30 });
  const b2 = e ? G.spells.cast('moon', 'big', { caster: e, team: 'enemy', origin: to, dir: new G.THREE.Vector3(0, 0, 1), duration: 30, strength: 1 }) : null;
  const b3 = !b2 ? G.spells.cast('sun', 'big', { caster: { pos: to }, team: 'enemy', origin: to, dir: new G.THREE.Vector3(0, 0, 1), duration: 30 }) : null;
  cleanups.push(() => { try { G.spells.beams?.clear?.(); } catch (err) { /* ignore */ } try { if (e) G.combat.despawn(e); } catch (err) { /* ignore */ } });
  await sleep(1500);
  await look(P0.x + 7, P0.y + 2.5, P0.z - 2, P0.x, P0.y + 1.3, P0.z - 6);
  return { enemy: !!e, beams: [!!b1, !!b2, !!b3], struggle: !!G.spells.struggle };
});
sc('w_grass_fire', 'worst', async () => {
  await go(-380, 40); const p = G.player.pos;
  const lit = G.elements?.igniteGround?.(p.x, p.z - 10, 7, 1) ?? 0;
  cleanups.push(() => { G.elements?.extinguishGround?.(p.x, p.z - 10, 30); });
  await sleep(3500);
  await look(p.x + 4, p.y + 2.2, p.z + 4, p.x, p.y + 1, p.z - 10);
  return { lit, burning: G.elements?.fireCount };
});
sc('w_boss_fight', 'worst', async () => {
  await go(-470, -70);
  G.ui.say = () => Promise.resolve();
  let started = false;
  try { G.combat.startBoss('oboroyo'); started = true; } catch (e) { /* ignore */ }
  cleanups.push(() => { try { G.combat.clear(); } catch (e) { /* ignore */ } G.player.hp = G.player.maxHp; });
  for (let t = 0; t < 5000; t += 250) { await sleep(250); G.player.hp = G.player.maxHp; }
  return { started, boss: !!G.combat.boss || !!G.combat.duel };
});
sc('w_rain', 'worst', async () => {
  await go(-470, 120); const p = G.player.pos;
  G.sky.setWeather({ rain: 1 });
  const z = G.elements?.rain?.(p.x, p.z, 40, 60);
  cleanups.push(() => { G.sky.setWeather({ rain: 0 }); z?.remove?.(); });
  await sleep(2500); await gcam(0.9, 0.05);
});

// ---------------------------------------------------------------- moving runs (hitches)
async function runRecord(fn) {
  const fr = []; P.rec = fr;
  const t0 = now();
  const extra = await fn();
  if (extra && G.dynRes?.enabled) extra.dynres = G.dynRes.stats();
  P.rec = null; await drain();
  for (const f of fr) f.at = Math.round(f.t0 - t0);
  const hitches = fr.filter((f) => f.cpu > 25 || f.iv > 25)
    .map((f, i) => ({ at: f.at, cpu: r1(f.cpu), gpu: r1(f.gpu), iv: r1(f.iv), upd: r1(f.upd), rf: r1(f.rf), sys: f.sys || '',
      calls: f.calls, progs: f.progs, tex: f.tex, geo: f.geo, heap: r1(f.heap), newProgs: f.newProgs }));
  // annotate deltas (new programs / textures / geometries, heap drops = GC) against the previous frame
  const idx = new Map(fr.map((f, i) => [f.at, i]));
  for (const h of hitches) { const i = idx.get(h.at); const p = fr[i - 1]; if (p) { h.dProgs = h.progs - p.progs; h.dTex = h.tex - p.tex; h.dGeo = h.geo - p.geo; h.dHeap = r1(h.heap - p.heap); } }
  return { stats: summarize(fr), hitches, extra, frames: CFG.keepFrames ? fr.map((f) => [f.at, r1(f.cpu), r1(f.gpu), r1(f.iv), f.calls]) : undefined };
}
const RUNS = {
  async sprint_village() {
    await go(-410, 150);
    G.cam.setBehind(Math.atan2(-1, 0)); // face -x (towards the village centre and through it)
    G.player.yaw = Math.atan2(-1, 0);
    await sleep(600);
    return runRecord(async () => {
      T.key('KeyW', true); T.key('ShiftLeft', true);
      for (let t = 0; t < 9000; t += 100) { await sleep(100); }
      T.key('KeyW', false); T.key('ShiftLeft', false);
      return { end: [Math.round(G.player.pos.x), Math.round(G.player.pos.z)] };
    });
  },
  async broom_shrine_town() {
    await go(-540, 70);
    G.player.mana = G.player.maxMana || 100;
    const target = { x: 196, z: -118 };
    G.player.mountBroom?.();
    await sleep(800);
    return runRecord(async () => {
      T.key('KeyW', true); T.key('ShiftLeft', true);
      const t0 = now(); let arrived = false;
      while (now() - t0 < 45000) {
        await sleep(50);
        const p = G.player.pos;
        G.player.mana = Math.max(G.player.mana, 80);
        const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
        if (d < 25) { arrived = true; break; }
        if (G.cam) {
          G.cam.yaw = Math.atan2(-dx, -dz);
          const want = Math.max(hAt(p.x, p.z), hAt(p.x + dx / d * 40, p.z + dz / d * 40)) + 35;
          G.cam.pitch = Math.max(-0.35, Math.min(0.35, (want - p.y) * 0.03));
        }
      }
      T.key('KeyW', false); T.key('ShiftLeft', false);
      return { arrived, secs: Math.round((now() - t0) / 100) / 10, onBroom: !!G.player.onBroom, end: [Math.round(G.player.pos.x), Math.round(G.player.pos.y), Math.round(G.player.pos.z)] };
    });
  },
  async fall_sky_isle() {
    const isle = G.world.SKY_ISLES?.find((i) => i.id === 'fi_dusk1') || { x: -200, z: -60, top: 90, r: 14 };
    await go(isle.x + isle.r + 6, isle.z);
    T.teleport(isle.x + isle.r - 2, isle.z, isle.top + 0.1);
    G.cam.setBehind(Math.PI / 2); G.player.yaw = Math.PI / 2;
    await sleep(1200);
    return runRecord(async () => {
      T.key('KeyW', true); await sleep(1200); T.key('KeyW', false);
      const t0 = now();
      while (now() - t0 < 9000 && !(G.player.grounded && G.player.pos.y < isle.top - 20)) await sleep(100);
      await sleep(2500);
      return { landedY: Math.round(G.player.pos.y), secs: Math.round((now() - t0) / 100) / 10 };
    });
  },
};

// ---------------------------------------------------------------- main
const out = { meta: { tier: CFG.tier, gpuTimer: !!ext, pixelRatio: R.getPixelRatio(), drawingBuffer: [R.domElement.width, R.domElement.height],
  gpu: (() => { const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; })(),
  quality: G.quality, sceneSamples: pipe?.scenePass?.sceneRT?.samples ?? null }, scenes: [], layers: {}, runs: {} };
await sleep(1500);
G.ui.say = () => Promise.resolve();
if (G.player) { G.player.maxHp = G.player.maxHp || 100; }
const want = (s) => (!CFG.scenes || CFG.scenes.includes(s.id)) && (!CFG.groups || CFG.groups.includes(s.group));
for (const s of S) {
  if (!want(s)) continue;
  const t0 = now();
  let extra = null;
  try { extra = await s.setup(); } catch (e) { extra = { error: String(e && e.message || e) }; }
  await T.frames(20);
  const fr = await sample(CFG.frames);
  const rec = { id: s.id, group: s.group, stats: summarize(fr), extra, cam: [r1(G.camera.position.x), r1(G.camera.position.y), r1(G.camera.position.z)] };
  if (CFG.shots) await T.shot(CFG.tier + '_' + s.id);
  if (CFG.probe && window.__gpuProbe) { try { rec.probe = await window.__gpuProbe(CFG.probe, { G, T, layerOf, n: CFG.probeN, ab: CFG.ab }); } catch (e) { rec.probe = { error: String(e && e.stack || e) }; } console.log('[perf] probe ' + s.id + ' ' + JSON.stringify(rec.probe)); }
  if (CFG.layers && CFG.layers.includes(s.id)) { rec.census = layerCensus(); rec.layers = await layerAB(CFG.layerFrames || 40); }
  while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ignore */ } }
  restoreLayers();
  rec.secs = r1((now() - t0) / 1000);
  out.scenes.push(rec);
  console.log('[perf] ' + s.id + ' ' + JSON.stringify(rec.stats.frame) + ' ser ' + JSON.stringify(rec.stats.ser) + ' cpu ' + rec.stats.cpu.p50);
}
for (const name of CFG.runs || []) {
  T.cam();
  try { out.runs[name] = await RUNS[name](); } catch (e) { out.runs[name] = { error: String(e && e.stack || e) }; }
  T.key('KeyW', false); T.key('ShiftLeft', false);
  if (G.player?.onBroom) G.player.dismountBroom?.();
}
T.cam();
out.errors = T.errors();
return out;
