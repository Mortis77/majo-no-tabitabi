// Dynamic resolution safety net (docs/api/perf.md). Lowers the renderer's pixel ratio one step when the frame interval
// stays over budget, and raises it again after a long quiet spell. Anti-pumping: every time a raise is followed by a
// drop within a few seconds, the wait before the next raise doubles (8 s -> 16 -> 32 -> 64 s); long stable play halves
// it again. Hitches (> 90 ms: streaming, loading, a tab switch) never count: only sustained load moves the resolution.
//   createDynRes(G, { steps, onResize }) -> { update(rdtSeconds), index, ratio, enabled, stats() }
// steps[0] is the tier's own pixel ratio (already capped by devicePixelRatio); each later step is a lower ratio.

const WIN = 1.0;          // s per evaluation window
const OVER = 19.0;        // ms: a window whose mean interval is over this is "over budget" (60 Hz = 16.7)
const UNDER = 17.4;       // ms: a window whose mean interval is under this is "at the display rate"
const HOLD_DOWN = 2;      // consecutive over-budget windows before a drop
const HOLD_AFTER = 3;     // s after any change before the next drop may happen (the new size must settle first)

export function createDynRes(G, { steps, onResize }) {
  const st = {
    enabled: true, index: 0, steps,
    winT: 0, winN: 0, winSum: 0,
    overRun: 0, goodT: 0, sinceChange: 99,
    upWait: 8, lastUpAt: -1e9, clock: 0, changes: 0,
  };
  function apply(i) {
    if (i === st.index) return;
    st.index = i; st.sinceChange = 0; st.changes++;
    try { onResize(steps[i]); } catch (e) { G.reportError?.('dynres', e); }
  }
  return {
    get index() { return st.index; },
    get ratio() { return steps[st.index]; },
    get enabled() { return st.enabled; },
    set enabled(v) { st.enabled = !!v; if (!st.enabled) apply(0); },
    /** Force a step (tests / photo mode); also resets the anti-pumping wait. */
    set(i) { apply(Math.max(0, Math.min(steps.length - 1, i | 0))); },
    stats() { return { index: st.index, ratio: steps[st.index], steps, changes: st.changes, upWait: st.upWait }; },
    update(rdt) {
      if (!st.enabled || steps.length < 2) return;
      const ms = rdt * 1000;
      st.clock += rdt; st.sinceChange += rdt;
      if (ms <= 0 || ms > 90 || G.paused || G.mode !== 'play' || (typeof document !== 'undefined' && document.hidden)) return;
      st.winT += rdt; st.winN++; st.winSum += ms;
      if (st.winT < WIN) return;
      const mean = st.winSum / st.winN;
      st.winT = 0; st.winN = 0; st.winSum = 0;
      if (mean > OVER) { st.overRun++; st.goodT = 0; } else { st.overRun = 0; if (mean < UNDER) st.goodT += WIN; else st.goodT = 0; }
      if (st.overRun >= HOLD_DOWN && st.sinceChange >= HOLD_AFTER && st.index < steps.length - 1) {
        // dropped soon after a raise: that raise was too optimistic -> wait longer before the next one
        if (st.clock - st.lastUpAt < 6) st.upWait = Math.min(64, st.upWait * 2);
        st.overRun = 0; st.goodT = 0;
        apply(st.index + 1);
        return;
      }
      if (st.index > 0 && st.goodT >= st.upWait && st.sinceChange >= st.upWait) {
        st.goodT = 0; st.lastUpAt = st.clock;
        apply(st.index - 1);
        return;
      }
      // a long stable spell at the top step forgives earlier pumping
      if (st.index === 0 && st.goodT >= 60) { st.upWait = Math.max(8, st.upWait / 2); st.goodT = 0; }
    },
  };
}
