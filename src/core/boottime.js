// Boot timeline (docs/api/perf.md "Boot and loading"). Cheap marks and spans, read by tools and the Electron self-test
// as window.__mvBoot. Times are performance.now() ms (0 = navigation start). Never affects gameplay.
export const BT = {
  marks: [],          // [name, ms]
  spans: {},          // name -> { n, ms, max }   (summed: asset groups, bakes, system inits)
  long: [],           // main-thread long tasks [startMs, durMs] (PerformanceObserver 'longtask', Chrome only)
  assets: {},         // group -> { n, bytes, fetchMs, parseMs, cookMs }
};
if (typeof window !== 'undefined') window.__mvBoot = BT;

try {
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (BT.long.length < 400) BT.long.push([+e.startTime.toFixed(0), +e.duration.toFixed(0)]); });
  po.observe({ type: 'longtask', buffered: true });
} catch (e) { /* no longtask support */ }

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function mark(name) { BT.marks.push([name, +now().toFixed(1)]); }

/** Add a measured duration to a named span. */
export function addSpan(name, ms) {
  const s = BT.spans[name] || (BT.spans[name] = { n: 0, ms: 0, max: 0 });
  s.n++; s.ms += ms; if (ms > s.max) s.max = ms;
}

/** Time a synchronous function under a span name. */
export function timed(name, fn) {
  const t0 = now();
  try { return fn(); } finally { addSpan(name, now() - t0); }
}

export function assetStat(group, k, v) {
  const a = BT.assets[group] || (BT.assets[group] = { n: 0, bytes: 0, fetchMs: 0, parseMs: 0, cookMs: 0 });
  a[k] += v;
}

// ---- time slicing (docs/api/perf.md "Boot and loading") ---------------------------------------------------------
// Long synchronous work that runs while the title (or the game) is on screen calls `await slice()` between steps:
// it returns null (no wait) until ~8 ms have passed since the last yield, then a promise that resolves on the next
// macrotask, so the browser can draw a frame and handle input. Order of work is unchanged.
let sliceT = now();
let chan = null, waiters = [];
function resume() { sliceT = now(); const w = waiters; waiters = []; for (const r of w) r(); }
function post() {
  if (!chan && typeof MessageChannel !== 'undefined') { chan = new MessageChannel(); chan.port1.onmessage = resume; }
  if (chan) chan.port2.postMessage(0); else setTimeout(resume, 0);
}
export const SLICE_MS = 8;
/**
 * Visible page: resume right after the next painted frame (requestAnimationFrame, then a message task), so the title
 * keeps its frame rate while the world loads (scheduler.yield / plain message tasks were measured to starve rendering:
 * ~12 fps on the title). A hidden page (the desktop self-test window, a minimised app) gets few or no animation
 * frames, so it resumes on a message task at once. A 20 ms timer covers a slow or throttled frame clock (a busy GPU process on a cold shader cache).
 */
export function slice(budget = SLICE_MS) {
  if (now() - sliceT < budget) return null;
  return new Promise((r) => {
    waiters.push(r);
    if (waiters.length > 1) return;
    const visible = typeof document !== 'undefined' && document.visibilityState === 'visible' && typeof requestAnimationFrame !== 'undefined';
    if (!visible) { post(); return; }
    let done = false;
    const go = () => { if (!done) { done = true; post(); } };
    requestAnimationFrame(go);
    setTimeout(go, 20);
  });
}
/** Boot finished (kept for callers; nothing to stop). */
export function sliceDone() {}
