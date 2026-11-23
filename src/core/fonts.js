// Font loading. Each locale declares its own faces in core.meta.fonts ([{ family, file, weight? }], file relative to
// assets/) and the stacks that use them in core.meta.fontTitle / fontBody / fontSign / fontDisplay. The faces are loaded once through
// FontFace under those family names, so the DOM (CSS var(--fd) / var(--fb) / var(--ft)) and every canvas can use them.
//
// A canvas that draws text before its face is ready silently falls back to print type. Rule for every system that
// bakes lettering into a canvas: draw after whenFontsReady(), or register a redraw with whenFontsReady(fn) - the
// world lettering in builders/kit.js does both (bakes now and re-bakes the same texture once the faces arrive).
import { raw, t, getLocale } from './i18n.js';

const BASE = 'assets/';
const started = new Map();          // locale -> Promise<void>
let readyFor = null;                // locale whose faces are all in
const waiters = [];
const hands = new Map();            // 'locale|text' -> HTMLImageElement (white ink on transparent)

/** The active locale's declared faces (raw() falls back to the default locale). */
function decl() {
  const list = raw('core.meta.fonts');
  return Array.isArray(list) ? list.filter((f) => f && f.family && f.file) : [];
}

/** Start loading the active locale's faces (idempotent). Resolves when all are usable or have failed. */
export function loadFonts() {
  const loc = getLocale();
  if (started.has(loc)) return started.get(loc);
  const faces = decl();
  const lettering = raw('core.meta.lettering') || {};
  const imgs = Object.entries(lettering).map(([text, file]) => new Promise((res) => {
    if (typeof Image === 'undefined') return res();
    const im = new Image();
    im.onload = () => { hands.set(loc + '|' + text, im); res(); };
    im.onerror = () => { console.warn('[fonts] no lettering image', file); res(); };
    im.src = BASE + file;
  }));
  const p = Promise.all([...imgs, ...faces.map(async (f) => {
    try {
      if (typeof FontFace === 'undefined' || !document.fonts) return;
      const ff = new FontFace(f.family, `url("${BASE}${f.file}")`, { weight: f.weight || '400', style: 'normal', display: 'block' });
      document.fonts.add(ff);
      await ff.load();
    } catch (e) { console.warn('[fonts] could not load', f.family, e && e.message); }
  })]).then(async () => {
    // make sure the stacks resolve (and the canvas sees the faces) before anyone bakes
    try { await Promise.all(['fontTitle', 'fontBody', 'fontSign', 'fontDisplay'].map((k) => document.fonts.load(`32px ${t('core.meta.' + k)}`, t('core.title')))); } catch (e) { /* fallbacks */ }
    readyFor = loc;
    const fns = waiters.splice(0);
    for (const fn of fns) { try { fn(); } catch (e) { console.warn('[fonts] redraw failed', e); } }
  });
  started.set(loc, p);
  return p;
}

/** Load the faces, but never hold the boot longer than `ms`; late faces still trigger the registered redraws. */
export function loadFontsWithin(ms = 6000) {
  return Promise.race([loadFonts(), new Promise((r) => setTimeout(r, ms))]);
}

/** True once the active locale's faces are in (canvas text drawn now uses them). */
export function fontsReady() { return readyFor === getLocale(); }

/** Run fn now if the faces are ready, else once they are (fn should redraw a canvas and flag its texture). */
export function whenFontsReady(fn) { if (fontsReady()) fn(); else { waiters.push(fn); loadFonts(); } }

/** CSS font stack of a role: 'title' (brush: world titles, banners), 'body' (interface, dialogue), 'sign' (signboards),
 *  'display' (the interface's serif headings and numerals). */
export function fontStack(role = 'body') {
  const k = role === 'title' ? 'fontTitle' : role === 'sign' ? 'fontSign' : role === 'display' ? 'fontDisplay' : 'fontBody';
  return t('core.meta.' + k);
}

/** A painted inscription for exactly this text in the active locale (white ink, transparent ground), or null. */
export function handLettering(text) { return hands.get(getLocale() + '|' + String(text).trim()) || null; }

/** URL (relative to the page) of the painted inscription for this text, or '' - e.g. for a CSS mask on the title:
 *  el.style.cssText += `-webkit-mask: url(${u}) center/contain no-repeat; mask: url(${u}) center/contain no-repeat;
 *  background: currentColor; color: transparent;` (keep the text node for screen readers and other locales). */
export function handLetteringUrl(text) { const im = handLettering(text); return im ? im.src : ''; }
