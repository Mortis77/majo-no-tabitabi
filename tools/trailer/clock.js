// Virtual clock for frame-exact capture. Injected by tools/trailer/capture.mjs with Page.addScriptToEvaluateOnNewDocument,
// so it runs before any game code. Plain script (no imports), installs window.__rigClock.
//
// Phase 1 "real": the page runs on real time (loading, boot). Callbacks are wrapped so that anything that fires after the
//   switch is deferred to the next virtual step instead of running at an unpredictable moment.
// Phase 2 "virtual": entered automatically the instant the game sets window.__mvReady = true (or by __rigClock.goVirtual()).
//   From then on NOTHING advances unless the rig calls __rigClock.step(ms): requestAnimationFrame, performance.now,
//   Date.now, setTimeout / setInterval and every CSS / Web Animation advance exactly by the stepped amount.
// Math.random is replaced from the start by a seedable PRNG (__rigClock.seed(n)).
(() => {
  if (window.__rigClock) return;
  const W = window;
  const realRAF = W.requestAnimationFrame.bind(W);
  const realCAF = W.cancelAnimationFrame.bind(W);
  const realPerfNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const realST = W.setTimeout.bind(W), realCT = W.clearTimeout.bind(W);
  const realSI = W.setInterval.bind(W), realCI = W.clearInterval.bind(W);

  const C = {
    mode: 'real', vNow: 0, dateBase: 0, steps: 0, errors: [],
    realRAF, realPerfNow, realST,
    /** called (once) when the clock goes virtual; capture.mjs listens for it */
    onVirtual: null,
  };
  W.__rigClock = C;

  // ---- seedable Math.random (sfc32) ----
  let a = 0, b = 0, c = 0, d = 0;
  C.seed = (n = 1) => {
    a = 0x9e3779b9 ^ (n >>> 0); b = 0x243f6a88; c = 0xb7e15162; d = (n * 2654435761) >>> 0;
    for (let i = 0; i < 16; i++) rnd();
  };
  function rnd() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  C.seed(1);
  Math.random = rnd;

  const report = (where, e) => { if (C.errors.length < 50) C.errors.push(where + ': ' + (e && (e.stack || e.message) || e)); console.error('[rig clock] ' + where, e); };

  // ---- requestAnimationFrame ----
  const rafQ = new Map();      // id -> cb, run on the next virtual step
  let vId = 1e9;
  W.requestAnimationFrame = function (cb) {
    if (C.mode === 'virtual') { const id = ++vId; rafQ.set(id, cb); return id; }
    let id = 0;
    id = realRAF((t) => { if (C.mode === 'virtual') rafQ.set(id, cb); else cb(t); });
    return id;
  };
  W.cancelAnimationFrame = function (id) { if (rafQ.has(id)) rafQ.delete(id); else realCAF(id); };

  // ---- clocks ----
  performance.now = function () { return C.mode === 'virtual' ? C.vNow : realPerfNow(); };
  Date.now = function () { return C.mode === 'virtual' ? Math.floor(C.dateBase + C.vNow) : realDateNow(); };

  // ---- timers ----
  const timers = new Map();    // id -> { due, fn, args, every }
  let tId = 2e9;
  const deferred = [];          // real-time callbacks that fired while virtual: run at the next step
  const call = (fn, args) => (typeof fn === 'function' ? fn.apply(W, args) : (0, eval)(String(fn)));
  W.setTimeout = function (fn, ms = 0, ...args) {
    if (C.mode === 'virtual') { const id = ++tId; timers.set(id, { due: C.vNow + Math.max(0, +ms || 0), seq: id, fn, args, every: 0 }); return id; }
    return realST(() => { if (C.mode === 'virtual') deferred.push(() => call(fn, args)); else call(fn, args); }, ms);
  };
  W.setInterval = function (fn, ms = 0, ...args) {
    if (C.mode === 'virtual') { const id = ++tId; const every = Math.max(1, +ms || 0); timers.set(id, { due: C.vNow + every, seq: id, fn, args, every }); return id; }
    return realSI(() => { if (C.mode === 'virtual') deferred.push(() => call(fn, args)); else call(fn, args); }, ms);
  };
  W.clearTimeout = function (id) { if (timers.has(id)) timers.delete(id); else realCT(id); };
  W.clearInterval = function (id) { if (timers.has(id)) timers.delete(id); else realCI(id); };

  // a real macrotask that lets every pending microtask (promise continuation) run, like the browser does between tasks
  const mc = new MessageChannel();
  let mcRes = null;
  mc.port1.onmessage = () => { const r = mcRes; mcRes = null; r && r(); };
  const flush = () => new Promise((r) => { mcRes = r; mc.port2.postMessage(0); });
  C.flush = flush;

  // ---- Web Animations (CSS animations / transitions of DOM overlays) ----
  const animTick = (dt) => {
    let list;
    try { list = document.getAnimations(); } catch (e) { return; }
    for (const an of list) {
      try {
        if (!an.__rig) { an.__rig = 1; if (an.playState === 'running' || an.pending) { an.pause(); an.__rigRun = 1; } }
        if (an.playState === 'running') { an.pause(); an.__rigRun = 1; } // restarted by the page (play())
        if (an.__rigRun && an.currentTime !== null && an.playState !== 'finished') {
          const t = an.currentTime + dt * (an.playbackRate || 1);
          const end = an.effect ? an.effect.getComputedTiming().endTime : Infinity;
          // reaching the end: finish() so 'animationend' / 'transitionend' / 'finish' fire as they would on real time
          if (Number.isFinite(end) && t >= end) { an.__rigRun = 0; an.finish(); } else an.currentTime = t;
        }
      } catch (e) { /* idle / detached animation */ }
    }
  };

  C.goVirtual = () => {
    if (C.mode === 'virtual') return;
    C.vNow = realPerfNow();
    C.dateBase = realDateNow() - C.vNow;
    C.mode = 'virtual';
    animTick(0);
    try { C.onVirtual && C.onVirtual(); } catch (e) { report('onVirtual', e); }
  };

  /**
   * Advance virtual time by ms: due timers (in time order, microtasks flushed between them), animations, then every
   * queued requestAnimationFrame callback with the new time. Resolves after the page's microtasks have run.
   */
  C.step = async (ms = 1000 / 60) => {
    if (C.mode !== 'virtual') C.goVirtual();
    const target = C.vNow + ms;
    while (deferred.length) { const f = deferred.shift(); try { f(); } catch (e) { report('deferred', e); } await flush(); }
    for (let guard = 0; guard < 10000; guard++) {
      let best = null, bestId = 0;
      for (const [id, t] of timers) if (t.due <= target && (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq))) { best = t; bestId = id; }
      if (!best) break;
      C.vNow = Math.max(C.vNow, best.due);
      if (best.every) { best.due += best.every; best.seq = ++tId; } else timers.delete(bestId);
      try { call(best.fn, best.args); } catch (e) { report('timer', e); }
      await flush();
    }
    C.vNow = target;
    animTick(ms);
    const q = [...rafQ.values()]; rafQ.clear();
    for (const cb of q) { try { cb(C.vNow); } catch (e) { report('raf', e); } }
    C.steps++;
    await flush();
  };
  /** Wait until the last drawn frame has reached the screen (real requestAnimationFrame). */
  C.present = () => new Promise((r) => realRAF(() => r()));
  C.pending = () => ({ raf: rafQ.size, timers: timers.size, deferred: deferred.length });

  // switch the moment boot declares the game ready (boot.js sets window.__mvReady = true as its last step)
  let ready;
  Object.defineProperty(W, '__mvReady', {
    configurable: true,
    get() { return ready; },
    set(v) { ready = v; if (v === true && W.__rigAutoVirtual !== false) C.goVirtual(); },
  });
})();
