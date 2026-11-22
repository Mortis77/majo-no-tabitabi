// Boot sequence + main loop. Systems are passed in (see systems.manifest.json); order = init order = update order.
import * as THREE from 'three';
import { G } from './game.js';
import { createInput } from './input.js';
import { createSave, defaultState, addItem, setFlag } from './save.js';
import { createInteract } from './interact.js';
import { createAssets } from './assets.js';
import { installFallbacks } from './fallback.js';
import { world, onDeform } from '../world/ground.js';
import { veilAt, moonDirAt, daylightAt, SUN_DIR } from '../world/veil.js';
import * as i18n from './i18n.js';
import { t, setLocale } from './i18n.js';
import { createDynRes } from '../render/dynres.js';
import { pickQuality, mobileDevice } from '../render/gpubench.js';
import { mark, addSpan, sliceDone } from './boottime.js';
import { compileWorld, warmDraw } from '../render/warmup.js';

/** Quality presets (G.quality). Systems read these in init(); a change takes effect after reload. */
export const QUALITY = {
  low:  { name: 'low',  pixelRatio: 1,    shadowSize: 1024, bloom: false, density: 0.5,  particles: 0.5, viewDist: 1100 },
  med:  { name: 'med',  pixelRatio: 1.25, shadowSize: 2048, bloom: true,  density: 0.75, particles: 0.8, viewDist: 1600 },
  high: { name: 'high', pixelRatio: 1.5, shadowSize: 2048, bloom: true,  density: 1,    particles: 1,   viewDist: 2400 },
  // GPU pass (docs/api/perf.md "GPU pass"): everything of 'high' (systems see name 'high') at pixel ratio 1.25 — the step
  // that holds 60 fps on a machine of the M5 laptop's class, where 'high' at 1.5 runs ~48 fps. Settings key 'highfast'.
  highfast: { name: 'high', key: 'highfast', pixelRatio: 1.25, shadowSize: 2048, bloom: true, density: 1, particles: 1, viewDist: 2400 },
};

/** Dynamic-resolution steps as fractions of each tier's own pixel ratio (render/dynres.js). Light r3: finer and relative,
 *  so a pixel-ratio-1 display also gets small steps (1 -> 0.92 -> 0.85 -> 0.77; it used to jump straight to 0.85). */
const DYNRES_STEPS = { high: [0.92, 0.85, 0.77], med: [0.9, 0.8], low: [0.88, 0.76] };

function showFatal(msg) {
  const el = document.getElementById('fatal');
  if (!el) return;
  el.style.display = 'block';
  el.textContent += (el.textContent ? '\n' : '') + msg;
}

export async function boot(systems) {
  mark('bundle');
  window.__game = G;
  window.addEventListener('error', (e) => { G.reportError('window', e.error || e.message); if (G.mode === 'boot') showFatal(String(e.message)); });
  window.addEventListener('unhandledrejection', (e) => { G.reportError('promise', e.reason); });
  try {
    await bootInner(systems);
  } catch (e) {
    console.error(e);
    showFatal(t('core.boot.failed') + (e && e.stack ? e.stack : e));
    G.reportError('boot', e);
    window.__mvReady = 'failed';
  }
}

async function bootInner(systems) {
  // ---- params ----
  const usp = new URLSearchParams(location.search);
  if (location.hash.length > 1) for (const [k, v] of new URLSearchParams(location.hash.slice(1))) usp.set(k, v);
  for (const [k, v] of usp) G.params[k] = v;

  // ---- core objects ----
  const canvas = (G.canvas = document.getElementById('game'));
  G.uiRoot = document.getElementById('ui');
  G.save = createSave(G);
  G.save.loadSettings();
  G.t = t;
  G.i18n = i18n; // registerLocale / setLocale / locales / raw — for tools, tests and future language packs
  setLocale(G.params.lang || G.settings.lang || 'zh-CN');
  document.title = t('core.title');
  i18n.onLocaleChange(() => { document.title = t('core.title'); });
  { const bt = document.querySelector('#boot .t'); if (bt) bt.textContent = t('core.title'); }
  // phones / tablets start light (gpubench.js mobileDevice); a tier the probe picked on one before is picked again,
  // a tier the player chose is kept
  const mobile = mobileDevice();
  const qa = G.settings.qualityAuto;
  const autoStale = mobile && G.save.qualityStored && qa && typeof qa === 'object' && !qa.mobile && qa.tier === G.settings.quality;
  if (G.params.quality) G.settings.quality = G.params.quality;
  else if (((!G.save.qualityStored || autoStale) && !G.params.autostart && !G.params.nosave) || G.params.qbench) {
    // first start: pick the tier from a short GPU probe and remember it (the settings menu still overrides it)
    const pick = pickQuality({ mobile });
    G.settings.quality = pick.tier;
    G.settings.qualityAuto = { tier: pick.tier, score: pick.score, renderer: pick.renderer.slice(0, 80) };
    if (pick.mobile) G.settings.qualityAuto.mobile = true;
    if (!G.save.disabled && !G.params.qbench) G.save.writeSettings();
    if (G.params.qbench) console.log('[qbench] ' + JSON.stringify(G.settings.qualityAuto));
  }
  G.quality = QUALITY[G.settings.quality] || QUALITY.high;
  if (G.params.autostart || G.params.nosave) G.save.disabled = true;

  mark('settings');
  const renderer = (G.renderer = new THREE.WebGLRenderer({ canvas, antialias: G.params.perf === '0', powerPreference: 'high-performance' }));
  // ?perf=0 restores every pre-perf-pass path (A/B pictures and timings, docs/api/perf.md).
  // antialias: false — every frame reaches the canvas as a full-screen quad from the post pipeline (which has its own
  // MSAA scene target + SMAA / FXAA), so a multisampled default framebuffer only cost a 4x resolve per frame (perf pass).
  // ?pr=<n> overrides the tier's pixel-ratio cap (perf harness: resolution scaling tests)
  const prCap = Number(G.params.pr) > 0 ? Number(G.params.pr) : G.quality.pixelRatio;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prCap));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  // dynamic resolution safety net (docs/api/perf.md): ?dynres=0 or settings.dynRes === false turns it off
  {
    const start = renderer.getPixelRatio();
    const steps = [start, ...(DYNRES_STEPS[G.quality.name] || DYNRES_STEPS.high).map((f) => Math.round(start * f * 100) / 100)];
    // the post pipeline renders at the lower ratio and its last pass upscales to the unchanged canvas (no canvas
    // reallocation, no 'resize' storm); without a pipeline the canvas itself is resized
    G.dynRes = createDynRes(G, { steps, onResize: (pr) => {
      if (G.post?.setRenderScale) { G.post.setRenderScale(pr === steps[0] ? null : pr); return; }
      renderer.setPixelRatio(pr);
      G.events.emit('resize', { w: window.innerWidth, h: window.innerHeight });
    } });
    G.dynRes.enabled = G.params.dynres !== '0' && G.params.perf !== '0' && G.settings.dynRes !== false;
  }

  mark('renderer');
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 4000);
  G.camera.position.set(-540, 60, 120);
  G.scene.add(G.camera);

  G.world = world;
  onDeform((e) => {
    if(e.kind==='trialLake' && G.state?.flags)G.state.flags.majo_trial_lake=e.active;
    G.events.emit('terrain:deformed', e);
  });
  G.state = defaultState();
  G.input = createInput(G);
  G.interact = createInteract(G);
  G.env.sunDir.copy(SUN_DIR);

  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    G.camera.aspect = w / h;
    G.camera.updateProjectionMatrix();
    G.events.emit('resize', { w, h });
  });

  installDebug();

  // ---- assets + systems init (docs/api/perf.md "Boot and loading") ----
  // 1. manifest + the systems the title needs (fx, audio, ui: everything before the first world system) — ~0.2 s
  // 2. title on screen over the boot backdrop; its "continue / new" wait for the world (a choice made early is queued)
  // 3. behind it, time-sliced: models (preload set), world systems in manifest order, shader programs (compileAsync),
  //    then the first world frame fades in behind the title
  const bar = document.getElementById('bootbar'), msg = document.getElementById('bootmsg');
  let progFrac = 0, progText = t('core.boot.waking');
  const progress = (frac, text) => {
    progFrac = frac; if (text) progText = text;
    if (bar) bar.style.width = Math.round(frac * 100) + '%';
    if (msg && text) msg.textContent = text;
    G.events.emit('boot:progress', { frac, text: progText });
  };
  G.bootProgress = () => ({ frac: progFrac, text: progText, ready: G.bootReady === true });
  const breathe = () => new Promise((r) => setTimeout(r, 0));

  G.assets = createAssets(G);
  progress(0.02, t('core.boot.assets'));
  try { await G.assets.init(null, { manifestOnly: true }); } catch (e) { G.reportError('assets', e); }

  const names = new Set(systems.filter((s) => s && !s.stub).map((s) => s.name)); // stubs count as absent
  installFallbacks(G, names);
  const initOne = async (s, i) => {
    if (!s || !s.name) { G.reportError('boot', new Error('system #' + i + ' has no name')); return; }
    G.systems.push(s);
    G.sys[s.name] = s;
    const ti = performance.now();
    try { await s.init?.(G); } catch (e) { G.reportError('init:' + s.name, e); s._initFailed = true; }
    addSpan('init:' + s.name, performance.now() - ti);
  };
  // early systems: the leading run of systems that own no world (the title needs ui, its sounds need audio / fx)
  const EARLY = new Set(['fx', 'audio', 'ui']);
  const legacy = G.params.boot === 'legacy' || G.params.perf === '0'; // ?boot=legacy: the old all-before-title order (A/B)
  let ei = 0;
  if (!legacy) while (ei < systems.length && systems[ei] && EARLY.has(systems[ei].name)) { await initOne(systems[ei], ei); ei++; }
  const early = G.systems.slice();
  mark('early');

  G.bootReady = false;
  const loadWorld = async () => {
    const backdrop = document.getElementById('boot');
    try { await G.assets.init((f) => progress(0.05 + f * 0.3, t('core.boot.assets'))); } catch (e) { G.reportError('assets', e); }
    mark('assets');
    for (let i = ei; i < systems.length; i++) {
      progress(0.35 + 0.5 * ((i - ei) / Math.max(1, systems.length - ei)), t('core.boot.' + (systems[i]?.name || 'waking')));
      await breathe();
      await initOne(systems[i], i);
    }
    mark('systems');
    // shader programs + GPU pipelines: draw every material once, a few per frame, behind the backdrop (warmDraw);
    // ?warm=compile = the earlier compileAsync pass (A/B), ?nowarm=1 = none (the first world frame pays it all)
    if (!legacy && !G.params.nowarm) {
      progress(0.86, t('core.boot.waking'));
      const tw = performance.now();
      if (G.params.warm === 'compile') await compileWorld(G);
      else G.bootWarm = await warmDraw(G, (f) => progress(0.86 + 0.13 * f));
      addSpan('warm', performance.now() - tw);
    }
    mark('compiled');
    G.bootPrograms = new Set(G.renderer.info.programs || []); // debug: programs made before the first frame
    progress(1, '');
    sliceDone();
  };

  if (legacy) {
    await loadWorld();
    G.bootReady = true;
    G.setMode('title');
    startLoop(early);
    if (G.params.autostart) document.getElementById('boot')?.remove();
    document.getElementById('boot')?.classList.add('done');
    setTimeout(() => document.getElementById('boot')?.remove(), 1200);
    requestAnimationFrame(() => requestAnimationFrame(() => mark('firstFrame')));
  } else {
    // the loop runs from now on; until the world is ready it updates only the early systems and draws nothing
    // (the canvas stays clear, the boot backdrop shows through under the title)
    G.setMode('title');
    startLoop(early);
    const showTitle = !G.params.autostart && !G.params.continue && !!G.ui?.showTitle;
    const bootEl = document.getElementById('boot');
    if (showTitle && bootEl) bootEl.classList.add('under');
    G.worldReady = loadWorld().then(() => {
      G.bootReady = true;
      G.events.emit('boot:ready', {});
      requestAnimationFrame(() => requestAnimationFrame(() => mark('firstFrame')));
      if (G.params.autostart) document.getElementById('boot')?.remove(); // test runs: no fade covering screenshots
      document.getElementById('boot')?.classList.add('done');
      setTimeout(() => document.getElementById('boot')?.remove(), 1200);
    });
  }

  // ---- title -> start ----
  let choice = 'new';
  if (G.params.continue && G.save.exists()) choice = 'continue';
  else if (G.params.autostart) choice = 'new';
  else if (G.ui?.showTitle) {
    requestAnimationFrame(() => requestAnimationFrame(() => mark('titleShown')));
    try { choice = await G.ui.showTitle({ hasSave: G.save.exists(), saveInfo: G.save.peek(), ready: G.worldReady || null }); } catch (e) { G.reportError('title', e); }
  } else choice = G.save.exists() ? 'continue' : 'new';
  if (G.worldReady) await G.worldReady;

  mark('choice');
  let loaded = false;
  if (choice === 'continue') loaded = G.save.load();
  if (!loaded) G.save.reset();

  for (const s of G.systems) {
    try { await s.start?.(G); } catch (e) { G.reportError('start:' + s.name, e); }
  }
  if (G.params.pos) {
    const p = G.params.pos.split(',').map(Number);
    if (Number.isFinite(p[0]) && Number.isFinite(p[1])) G.debug.teleport(p[0], p[1], Number.isFinite(p[2]) ? p[2] : undefined);
  }
  G.started = true;
  G.env.region = ''; // so the first 'region:enter' (and its banner) fires right after the game starts
  G.setMode('play');
  G.events.emit('game:start', { loaded });
  window.__mvReady = true;
  mark('started');
  requestAnimationFrame(() => requestAnimationFrame(() => mark('playable')));
}

// ---- main loop -------------------------------------------------------------------------------
let regionCand = null, regionCandT = 0;
function updateEnv(rdt) {
  const env = G.env;
  const f = G.player?.pos || G.camera.position;
  env.focus.copy(f);
  env.veil = veilAt(f.x, f.z);
  env.light = daylightAt(f.x, f.z);
  env.major = env.veil > 0.82 ? 'night' : env.veil > 0.1 ? 'dusk' : 'sun';
  moonDirAt(f.x, f.z, env.moonDir);
  if ((G.time.frame & 7) === 0) {
    const r = world.regionAt(f.x, f.z);
    if (r !== env.region) {
      if (r !== regionCand) { regionCand = r; regionCandT = 0; }
      regionCandT += rdt * 8;
      if (regionCandT > 0.7) {
        const prev = env.region;
        env.region = r; env.regionName = t('world.place.' + r);
        regionCand = null;
        if (G.started && G.state) G.state.discovered[r] = true;
        G.events.emit('region:enter', { id: r, name: env.regionName, prev, major: env.major });
      }
    } else regionCand = null;
  }
}

let fpsAcc = 0, fpsN = 0;
function startLoop(early = []) {
  let last = performance.now();
  const T = G.time;
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    let scale = T.scale * (T.slow > 0 ? T.slow : 1);   // T.slow: duel slow-motion beats (G.fx.duel, eased back to 1)
    if (T.hitstop > 0) { T.hitstop -= rdt; scale *= T.hitstopScale ?? 0.05; }
    const dt = G.paused ? 0 : rdt * scale;
    T.rdt = rdt; T.dt = dt; T.real += rdt; T.t += dt; T.frame++;
    if (G.mode === 'play' && G.state) G.state.playTime += dt;
    fpsAcc += rdt; fpsN++;
    if (fpsAcc >= 0.5) { G.debug.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

    if (G.bootReady === false) {
      // world still loading behind the title: only the early systems (ui, audio, fx) run, nothing is drawn
      for (let i = 0; i < early.length; i++) {
        const s = early[i];
        try { s.update?.(s.pausable === false ? rdt : dt, rdt); } catch (e) { G.reportError('update:' + s.name, e); }
      }
      G.input.endFrame();
      return;
    }
    updateEnv(rdt);
    G._fallbackSky?.();
    const list = G.systems;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.update) continue;
      try { s.update(s.pausable === false ? rdt : dt, rdt); } catch (e) { G.reportError('update:' + s.name, e); }
    }
    try { G.interact.update(); } catch (e) { G.reportError('interact', e); }
    if (G.cam?.update) { try { G.cam.update(dt, rdt); } catch (e) { G.reportError('camera', e); } }
    else G.freeCam?.update(rdt);
    const fc = G.debug.fixedCam; // test camera: applied before lateUpdate so culling / projection see it
    if (fc?.view) { fc.gp.copy(G.camera.position); fc.gq.copy(G.camera.quaternion); } // view-only: game camera restored after the render
    if (fc) { G.camera.position.copy(fc.pos); G.camera.lookAt(fc.look); G.camera.updateMatrixWorld(); }
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.lateUpdate) continue;
      try { s.lateUpdate(s.pausable === false ? rdt : dt, rdt); } catch (e) { G.reportError('late:' + s.name, e); }
    }
    try { G.renderFrame(); } catch (e) { G.reportError('render', e); }
    G.dynRes?.update(rdt);
    if (fc?.view && G.debug.fixedCam === fc) { G.camera.position.copy(fc.gp); G.camera.quaternion.copy(fc.gq); G.camera.updateMatrixWorld(); }
    G.input.endFrame();
    G.save.tick();
  }
  requestAnimationFrame(frame);
}

// ---- debug / test hooks ------------------------------------------------------------------------
function installDebug() {
  G.debug = {
    fps: 0,
    fixedCam: null,
    /** Move the player (or free camera) to (x,z); y defaults to just above the ground. */
    teleport(x, z, y) {
      const gy = y ?? world.groundAt(x, z) + 0.05;
      if (G.player?.teleport) G.player.teleport(x, gy, z);
      else if (G.freeCam) G.camera.position.set(x, gy + 6, z + 14);
    },
    /**
     * Lock the camera: setCam(px,py,pz, tx,ty,tz, opts). Call setCam() with no args to release.
     * opts.view = true: the fixed camera is only used to DRAW the frame; between frames G.camera is the game camera again, so
     * aiming, camera-relative movement and the orbit camera keep working as if no test camera were there.
     */
    setCam(px, py, pz, tx, ty, tz, opts) {
      if (px === undefined) { this.fixedCam = null; return; }
      if (G.freeCam && !G.cam) { G.freeCam.set(px, py, pz, tx, ty, tz); return; }
      this.fixedCam = { pos: new THREE.Vector3(px, py, pz), look: new THREE.Vector3(tx, ty, tz), view: !!opts?.view,
        gp: new THREE.Vector3(), gq: new THREE.Quaternion() };
    },
    give(id, n = 1) { return addItem(G, id, n); },
    flag(name, v = true) { setFlag(G, name, v); },
    /** Renderer statistics for perf checks. */
    stats() {
      const i = G.renderer.info;
      return { fps: this.fps, calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures,
        objects: (() => { let n = 0; G.scene.traverse(() => n++); return n; })() };
    },
    errors() { return G.errors.map((e) => `${e.where}: ${e.message}${e.count ? ' ×' + e.count : ''}`); },
  };

  // Helpers for tools/play.mjs scripts (see docs/DESIGN.md §7).
  const pending = {};
  const T = (window.__T = {
    G,
    frames: (n = 1) => new Promise((res) => { let c = 0; const f = () => { if (++c >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    key: (code, down = true) => (down ? G.input.sim.down(code) : G.input.sim.up(code)),
    press: async (code, ms = 90) => { G.input.sim.down(code); await T.wait(ms); G.input.sim.up(code); await T.frames(2); },
    look: (dx, dy) => G.input.sim.look(dx, dy),
    teleport: (x, z, y) => G.debug.teleport(x, z, y),
    cam: (...a) => G.debug.setCam(...a),
    /** View-only test camera: draws from (px,py,pz)->(tx,ty,tz) while aim / movement keep using the game camera. viewCam() frees it. */
    viewCam: (px, py, pz, tx, ty, tz) => G.debug.setCam(px, py, pz, tx, ty, tz, { view: true }),
    /** View-only camera placed relative to the heroine: side 'left'|'right'|'front'|'back' (or yaw offset in radians), dist, height. */
    orbitCam: (side = 'right', dist = 4, h = 1.1, lookH = 0.95) => {
      const p = G.player?.pos; if (!p) return;
      const yaw = G.player.yaw ?? 0;
      const off = typeof side === 'number' ? side : ({ front: 0, right: -Math.PI / 2, left: Math.PI / 2, back: Math.PI }[side] ?? 0);
      const a = yaw + off;
      G.debug.setCam(p.x + Math.sin(a) * dist, p.y + h, p.z + Math.cos(a) * dist, p.x, p.y + lookH, p.z, { view: true });
    },
    /** Save a screenshot as <name>.png in the run's output folder. */
    shot: async (name = 'shot') => {
      await T.frames(3);
      if (!window.__mvShot) return false;
      await new Promise((res) => { pending[name] = res; window.__mvShot(name); });
      return true;
    },
    errors: () => G.debug.errors(),
    stats: () => G.debug.stats(),
  });
  window.__mvShotDone = (name) => { pending[name]?.(); delete pending[name]; };
}
