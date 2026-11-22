// The device side of touch play: is this a touch device, the browser gestures a game must not trigger (pinch-zoom,
// pull-to-refresh, double-tap zoom, long-press callouts, text selection), fullscreen + landscape lock on the first tap,
// and the gentle "turn your phone sideways" card while it is held upright.
// Touch mode = ?touch=1|0, else settings.touch 'on'|'off', else 'auto': a coarse primary pointer (phones, tablets),
// or a touchscreen laptop the moment a finger lands on the game.
import { G } from '../core/game.js';
import { el, tel } from './dom.js';
import { addCss } from './style.js';

addCss(`
.mv-turn { position: fixed; inset: 0; z-index: 3000; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  padding: 32px; text-align: center; pointer-events: auto; touch-action: none; color: var(--paper);
  background: radial-gradient(ellipse at 50% 40%, #1d2440 0%, #0b0c18 70%); }
.mv-turn.on { display: flex; }
.mv-turn .ph { position: relative; width: 58px; height: 96px; border-radius: 10px; box-shadow: inset 0 0 0 3px var(--gold2), 0 0 24px rgba(255,214,140,.25);
  animation: mv-turn 2.6s cubic-bezier(.5,0,.3,1) infinite; }
.mv-turn .ph::after { content: ''; position: absolute; left: 50%; bottom: 7px; width: 14px; height: 3px; margin-left: -7px; border-radius: 2px; background: var(--gold2); opacity: .7; }
@keyframes mv-turn { 0%, 25% { transform: rotate(0); } 60%, 100% { transform: rotate(-90deg); } }
.mv-turn .tt { font: 400 26px/1.3 var(--ft); letter-spacing: .16em; color: #fff6e2; }
.mv-turn .tx { max-width: 300px; font: 400 15px/1.8 var(--fb); letter-spacing: .05em; color: var(--paper2); }
`);

const qs = (q) => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
/** The primary pointer is a finger (phones, tablets). */
export const coarsePointer = () => qs('(pointer: coarse)') || (qs('(any-pointer: coarse)') && !qs('(any-pointer: fine)'));
/** The device can be touched at all. */
export const canTouch = () => coarsePointer() || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || 'ontouchstart' in window;
/** iPhone / iPad (iPadOS reports itself as a Mac with touch points). */
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Launched from the home screen (no browser bars). */
export const standalone = () => qs('(display-mode: standalone)') || qs('(display-mode: fullscreen)') || navigator.standalone === true;

let touchedOnce = false;
/** Should the touch controls be up? */
export function wantTouch() {
  const p = String(G.params?.touch ?? '');
  if (p === '1' || p === 'on' || p === 'true') return true;
  if (p === '0' || p === 'off' || p === 'false') return false;
  const s = G.settings?.touch;
  if (s === 'on') return true;
  if (s === 'off') return false;
  return coarsePointer() || touchedOnce;
}

/**
 * Install the device handlers once. onChange() runs whenever wantTouch() may have changed (first finger on a laptop,
 * a mouse after it, orientation). Returns { portrait }.
 */
export function installTouchEnv(root, onChange) {
  // ---- browser gestures ----
  const inGame = (t) => !t || !t.closest || !t.closest('#fatal');
  // pinch-zoom: Safari's own gesture events, and any two-finger move outside the map (the map pinches itself)
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => { if (inGame(e.target)) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1 && !(e.target && e.target.closest && e.target.closest('.mp-view'))) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => { if (G.input?.touch && inGame(e.target)) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (G.input?.touch && inGame(e.target)) e.preventDefault(); });
  document.addEventListener('selectstart', (e) => { if (G.input?.touch && inGame(e.target)) e.preventDefault(); });

  // ---- touchscreen laptops: the first finger turns the controls on, a real mouse press turns them off again ----
  let lastTouch = -1e9;
  window.addEventListener('touchstart', () => {
    lastTouch = performance.now();
    if (!touchedOnce && !coarsePointer()) { touchedOnce = true; onChange(); }
  }, { capture: true, passive: true });
  window.addEventListener('mousedown', (e) => {
    if (!touchedOnce || coarsePointer() || G.settings?.touch === 'on' || String(G.params?.touch ?? '') === '1') return;
    if (e.sourceCapabilities?.firesTouchEvents || performance.now() - lastTouch < 1500) return; // a mouse event made from a touch
    touchedOnce = false; onChange();
  }, { capture: true, passive: true });

  // ---- fullscreen + landscape on the first tap (needs a user gesture) ----
  let triedFs = false;
  const goFull = () => {
    if (triedFs || !G.input?.touch || G.params?.autostart || standalone()) return;
    triedFs = true;
    const d = document.documentElement;
    const req = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      const p = req.call(d, { navigationUI: 'hide' });
      const lock = () => { try { const o = screen.orientation; const r = o && o.lock && o.lock('landscape'); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not supported */ } };
      if (p && p.then) p.then(lock, () => {}); else lock();
    } catch (e) { /* not supported (iPhone Safari): the title shows the home-screen hint instead */ }
  };
  window.addEventListener('touchend', goFull, { capture: true, passive: true });
  window.addEventListener('click', goFull, { capture: true, passive: true });

  // ---- held upright: a card asks to turn the phone (and the journey pauses under it) ----
  const card = el('div', 'mv-turn', root);   // last in the UI root: above the fade veil, fonts from the root
  el('div', 'ph', card);
  tel('div', 'tt', card, 'ui.touch.turn.title');
  tel('div', 'tx', card, 'ui.touch.turn.text');
  let portrait = false;
  const check = () => {
    const p = !!G.input?.touch && window.innerHeight > window.innerWidth * 1.05;
    if (p === portrait) return;
    portrait = p;
    card.classList.toggle('on', p);
    // turning the phone mid-fight would cost her: the scroll opens, as when a desktop player lets go of the pointer
    if (p && G.mode === 'play' && !G.ui?.isOpen && G.started) { try { G.ui?.openMenu?.(); } catch (e) { G.reportError('touch:portrait', e); } }
  };
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', () => setTimeout(check, 120));
  return { check, get portrait() { return portrait; }, card };
}
