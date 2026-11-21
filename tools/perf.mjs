#!/usr/bin/env node
// Frame-budget harness (docs/api/perf.md). Runs the game headless at the REAL render size of the desktop app
// (1440x900 window, device pixel ratio 2; the game caps its own pixel ratio per tier), drives fixed cameras, worst-case
// set pieces and moving runs, and writes .tmp/perf/<label>/<tier>.json + a readable table (<tier>.txt, summary.txt).
//
//   node tools/perf.mjs --label base [--tiers high,med,low] [--groups tour,worst] [--scenes id,id] [--runs all|a,b]
//                       [--layers w_town_above,t01_meadow_game] [--frames 60] [--settle 1400] [--shots] [--finish]
//                       [--size 1440x900] [--dpr 2] [--params "k=v&..."]
//
// --groups   which scene groups to run: tour (the 31 cameras of tools/devkit/after2.js), worst (towns, crowds, set pieces). Default both.
// --scenes   only these scene ids (see tools/perf/inpage.js). --groups none / --scenes none: no fixed scenes.
// --runs     moving runs: sprint_village, broom_shrine_town, fall_sky_isle ('all' = the three). Frames over 25 ms are listed
//            with the per-system script time, new programs / textures / geometries and the heap change.
// --layers   per-layer A/B on these scene ids (each layer hidden in turn, each shadow cascade skipped, each post step off).
// --timer    also read EXT_disjoint_timer_query (unreliable on ANGLE-Metal: it includes queued work of earlier frames).
// --shots    save a screenshot per scene (<label>/<tier>_<scene>.png).
// --probe    GPU probes per scene (tools/perf/gpuprobe.js): split,hook,res,resflat,layers,overdraw,casters; --probe-n repeats.
// One browser per tier, one tier at a time (never run two GPU jobs at once).
import fs from 'node:fs';
import path from 'node:path';
import { launch, TMP, ROOT } from './cdp.mjs';
import { build, serveGame } from '../build.mjs';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const list = (n, d) => { const v = opt(n); if (v === null) return d; if (v === 'none') return []; return v.split(',').map((s) => s.trim()).filter(Boolean); };
const label = (opt('label', 'run') || 'run').replace(/[^\w.-]/g, '_');
const tiers = list('tiers', ['high', 'med', 'low']);
const [W, H] = (opt('size', '1440x900')).split('x').map(Number);
const DPR = Number(opt('dpr', 2));
const RUN_NAMES = ['sprint_village', 'broom_shrine_town', 'fall_sky_isle'];
let runs = list('runs', []);
if (runs.includes('all')) runs = RUN_NAMES;
const cfgBase = {
  scenes: list('scenes', null), groups: list('groups', null), layers: list('layers', []), runs,
  frames: Number(opt('frames', 60)), settleMs: Number(opt('settle', 1400)), layerFrames: Number(opt('layer-frames', 40)),
  timer: args.includes('--timer'), shots: args.includes('--shots'), keepFrames: args.includes('--keep-frames'),
  probe: list('probe', null), probeN: Number(opt('probe-n', 14)),
  ab: opt('ab') ? JSON.parse(opt('ab')) : null, // --ab '[["old",{"old":true}],["new",{}]]' variants for --probe ab
};
if (cfgBase.scenes && cfgBase.scenes.length === 0) cfgBase.groups = ['none'];
const outDir = path.join(TMP, 'perf', label);
fs.mkdirSync(outDir, { recursive: true });
const inpage = fs.readFileSync(path.join(ROOT, 'tools/perf/inpage.js'), 'utf8');
// --probe split,hook,res,resflat,layers,overdraw,casters: GPU probes per scene (tools/perf/gpuprobe.js, docs/api/perf.md "GPU pass")
const gpuprobe = fs.readFileSync(path.join(ROOT, 'tools/perf/gpuprobe.js'), 'utf8');

// pre-boot hook: tag every object added to the scene with the system that added it (layer A/B needs the owner)
const PREBOOT = `(() => {
  let g = null;
  Object.defineProperty(window, '__game', { configurable: true, get() { return g; }, set(v) {
    g = v;
    let scene = null, cur = '';
    const wrapSys = (s) => {
      for (const fn of ['init', 'start', 'update', 'lateUpdate']) {
        const o = s[fn]; if (typeof o !== 'function') continue;
        s[fn] = function (...a) { const p = cur; cur = s.name; try { const r = o.apply(this, a); if (r && r.then) return r.finally(() => { cur = p; }); cur = p; return r; } catch (e) { cur = p; throw e; } };
      }
    };
    Object.defineProperty(g, 'scene', { configurable: true, get() { return scene; }, set(sc) {
      scene = sc;
      const add = sc.add;
      sc.add = function (...objs) { for (const o of objs) if (o && o.userData && !o.userData.__sys) o.userData.__sys = cur || 'core'; return add.apply(this, objs); };
    } });
    const iv = setInterval(() => {
      if (!g.systems) return;
      if (!g.systems.__perfWrapped) {
        g.systems.__perfWrapped = true;
        const push = g.systems.push;
        g.systems.push = function (...s) { s.forEach(wrapSys); return push.apply(this, s); };
        g.systems.forEach(wrapSys);
      }
      clearInterval(iv);
    }, 0);
  } });
})();`;

const b = await build({});
if (!b.ok) { console.error('BUILD FAILED\n' + b.errors); process.exit(1); }
const { server, url } = await serveGame({ getBuild: async () => b });

const fmt = (x, w = 6) => (x == null ? '-' : (typeof x === 'number' ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)) : String(x))).padStart(w);
function table(res) {
  const L = [];
  const m = res.meta;
  L.push(`tier ${m.tier}  buffer ${m.drawingBuffer.join('x')} (pixel ratio ${m.pixelRatio})  MSAA ${m.sceneSamples}  GPU timer ${m.gpuTimer ? 'yes' : 'no (gl.finish)'}  ${m.gpu}`);
  L.push('frame = real rAF interval ms (vsync caps it at ~16.7); cpu = script ms per frame; ser = serial CPU+GPU ms of one frame (GPU drained before and after; not capped); tris in k');
  L.push('scene'.padEnd(26) + ' frame50 frame95  fmax  cpu50  cpu95  ser50  ser95  calls  ktris  progs   tex   heapMB');
  for (const s of res.scenes) {
    const t = s.stats;
    L.push(s.id.padEnd(26) + fmt(t.frame.p50, 8) + fmt(t.frame.p95, 8) + fmt(t.frame.max) + fmt(t.cpu.p50, 7) + fmt(t.cpu.p95, 7) + fmt(t.ser?.p50, 7) + fmt(t.ser?.p95, 7) + fmt(t.calls, 7) + fmt(Math.round(t.tris / 1000), 7) + fmt(t.programs, 7) + fmt(t.textures, 6) + fmt(t.heapMB, 8)
      + (s.extra && Object.keys(s.extra).length ? '  ' + JSON.stringify(s.extra) : ''));
  }
  L.push('', 'script ms per frame by system (p50 scene of the run, mean over its frames):');
  for (const s of res.scenes) if (s.stats.sysAvg) L.push('  ' + s.id.padEnd(24) + Object.entries(s.stats.sysAvg).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + v).join(', '));
  for (const s of res.scenes) {
    if (!s.layers) continue;
    L.push('', `per-layer A/B at ${s.id} (cost = with - without: serial frame ms p50, script ms p50, draw calls, k tris)`);
    if (s.census) L.push('census: ' + Object.entries(s.census).map(([k, v]) => `${k} ${v.meshes}m/${Math.round(v.tris / 1000)}k`).join('  '));
    L.push('layer'.padEnd(22) + '  dSer   dCpu  dCalls  dKtris   serWith serWithout');
    for (const l of s.layers) L.push(l.layer.padEnd(22) + fmt(l.dSer) + fmt(l.dCpu, 7) + fmt(l.dCalls, 8) + fmt(Math.round(l.dTris / 1000), 8) + fmt(l.on.ser?.p50, 10) + fmt(l.off.ser?.p50, 10));
  }
  for (const [name, r] of Object.entries(res.runs || {})) {
    L.push('', `moving run ${name}: ` + (r.error ? 'ERROR ' + r.error : `frame p50 ${r.stats.frame.p50} p95 ${r.stats.frame.p95} max ${r.stats.frame.max}  iv p95 ${r.stats.iv.p95} max ${r.stats.iv.max}  frames ${r.stats.n}  ${JSON.stringify(r.extra)}`));
    if (r.hitches) {
      L.push(`  frames over 25 ms: ${r.hitches.length}`);
      for (const h of r.hitches.slice(0, 60)) L.push(`  t=${String(h.at).padStart(6)}ms cpu ${fmt(h.cpu)} gpu ${fmt(h.gpu)} iv ${fmt(h.iv)} upd ${fmt(h.upd)} rf ${fmt(h.rf)} +prog ${h.dProgs ?? '-'} +tex ${h.dTex ?? '-'} +geo ${h.dGeo ?? '-'} heap ${h.dHeap ?? '-'}  ${h.sys}${h.newProgs ? '  new programs: ' + h.newProgs.join(', ') : ''}`);
    }
  }
  if (res.errors?.length) L.push('', 'errors: ' + res.errors.join(' | '));
  if (res.console?.length) L.push('', 'console: ' + res.console.slice(0, 20).join('\n  '));
  return L.join('\n');
}

const summary = [];
let code = 0;
for (const tier of tiers) {
  const page = await launch({ width: W, height: H });
  const consoleLines = [];
  page.on('Runtime.consoleAPICalled', (p) => {
    const text = p.args.map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
    if (p.type === 'log' && text.startsWith('[perf]')) { console.log('  ' + tier + ' ' + text.slice(7)); return; }
    if (p.type === 'error' || p.type === 'warning') consoleLines.push(`[${p.type}] ${text.slice(0, 400)}`);
  });
  page.on('Runtime.exceptionThrown', (p) => { const d = p.exceptionDetails; consoleLines.push('[exception] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 600)); });
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PREBOOT });
  // screenshots for --shots go through the same binding as play.mjs
  await page.send('Runtime.addBinding', { name: '__mvShot' });
  page.on('Runtime.bindingCalled', async (p) => {
    if (p.name !== '__mvShot') return;
    const n = String(p.payload || 'shot').replace(/[^\w.-]/g, '_');
    try { await page.screenshot(path.join(outDir, n + '.png')); } catch (e) { consoleLines.push('screenshot failed ' + e.message); }
    page.send('Runtime.evaluate', { expression: `window.__mvShotDone(${JSON.stringify(String(p.payload || 'shot'))})` }).catch(() => {});
  });
  const usp = new URLSearchParams(opt('params') || '');
  usp.set('autostart', '1'); usp.set('mute', '1'); usp.set('quality', tier);
  if (!usp.has('dynres')) usp.set('dynres', '0'); // fixed resolution unless asked (--params dynres=1)
  const t0 = Date.now();
  await page.goto(url + '?' + usp.toString());
  let ready = false;
  while (Date.now() - t0 < 120000) {
    const r = await page.evaluate('window.__mvReady === undefined ? null : window.__mvReady').catch(() => null);
    if (r === true) { ready = true; break; }
    if (r === 'failed') break;
    await new Promise((r2) => setTimeout(r2, 150));
  }
  const bootS = (Date.now() - t0) / 1000;
  if (!ready) { console.log(tier + ': GAME DID NOT BECOME READY'); code = 2; await page.close(); continue; }
  console.log(`${tier}: ready in ${bootS.toFixed(1)} s`);
  const cfg = { ...cfgBase, tier };
  let res;
  try {
    if (cfg.probe) await page.evaluate(gpuprobe + "\n;0");
    res = await page.evaluate(`(async () => { const T = window.__T, G = window.__game; const CFG = ${JSON.stringify(cfg)}; ${inpage}\n})()`, { timeout: 3600 * 1000 });
  } catch (e) { console.log(tier + ': SCRIPT ERROR ' + e.message); code = 2; res = null; }
  await page.close();
  if (!res) continue;
  res.meta.bootSeconds = bootS;
  res.console = consoleLines;
  const shaderErr = consoleLines.filter((l) => /shader|program|THREE\.WebGL/i.test(l) && /error/i.test(l));
  if (res.errors?.length || shaderErr.length) code = 2;
  fs.writeFileSync(path.join(outDir, tier + '.json'), JSON.stringify(res, null, 1));
  const tbl = table(res);
  fs.writeFileSync(path.join(outDir, tier + '.txt'), tbl + '\n');
  console.log(tbl);
  summary.push(tbl);
}
server.close();
fs.writeFileSync(path.join(outDir, 'summary.txt'), summary.join('\n\n') + '\n');
console.log('\nwritten: ' + outDir);
process.exit(code);
