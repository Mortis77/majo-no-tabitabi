// 衣装 — the wardrobe page of the pause scroll (src/ui/menu.js). Her outfits (src/data/outfits.js) as cards: a painted
// picture of her in the outfit (rendered once from the game, cut out: tools/costume/wardrobe-pics.mjs, manifest ids
// ui_outfit_<id>) on a washi plate in an ink frame with a brush-torn edge (the scroll's own deckle masks), the name, one
// line of description, the worn one sealed. Without its picture a card shows the outfit's pictogram instead.
// Choosing one changes her at once behind the scroll (G.player.setOutfit; the world is paused, so the change is already
// done when the scroll closes). Input like the other pages: ← → (stick / d-pad) move, confirm wears, the mouse hovers and clicks.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { K, el, tel, clear, sfx, hintLine, codeLabel } from './dom.js';
import { icon } from './icons.js';
import { addCss } from './style.js';
import { OUTFITS } from '../data/outfits.js';

addCss(`
.wd-grid { position: absolute; inset: 0 0 6u; display: grid; grid-template-columns: repeat(3, 1fr); gap: 26u; padding: 6u 18u 0; }
.wd-card { position: relative; display: flex; flex-direction: column; align-items: center; min-height: 0; padding: 14u 14u 14u; cursor: pointer; pointer-events: auto;
  background: rgba(35,31,29,.04); box-shadow: inset 0 0 0 1u rgba(35,31,29,.14); border-radius: 3u; transition: background .15s, box-shadow .15s, transform .2s; }
.wd-card:hover { background: rgba(35,31,29,.07); }
.wd-card.sel { background: rgba(35,31,29,.09); box-shadow: inset 0 0 0 1.5u var(--red), 0 4u 14u rgba(35,31,29,.12); transform: translateY(-2u); }
/* the picture: an ink frame (rough deckle) round a washi plate (fine deckle) with the outfit's own colour wash */
.wd-pic { position: relative; align-self: stretch; flex: 1 1 auto; min-height: 120u; filter: drop-shadow(0 3u 6u rgba(0,0,0,.22)); transition: filter .2s, transform .25s cubic-bezier(.2,.8,.2,1); }
.wd-pic .fr { position: absolute; inset: 0; background: var(--ink); opacity: .82; -webkit-mask: var(--mk-deckle-rough) center / 100% 100% no-repeat; mask: var(--mk-deckle-rough) center / 100% 100% no-repeat; }
.wd-pic .wash { position: absolute; inset: 7u; background-color: var(--paper); background-image: var(--tex-paper), radial-gradient(ellipse 70% 60% at 50% 42%, rgba(255,252,242,.95), var(--wd-tint) 78%, var(--wd-tint2));
  background-size: 256u 256u, 100% 100%; background-blend-mode: multiply, normal; -webkit-mask: var(--mk-deckle) center / 100% 100% no-repeat; mask: var(--mk-deckle) center / 100% 100% no-repeat; overflow: hidden; }
.wd-pic .wash::after { content: ''; position: absolute; left: 22%; right: 22%; bottom: 5%; height: 7%; border-radius: 50%; background: radial-gradient(closest-side, rgba(35,31,29,.32), transparent); }
.wd-pic img { position: absolute; left: 0; right: 0; top: 4%; bottom: 3.5%; width: 100%; height: 92.5%; object-fit: contain; z-index: 1; pointer-events: none; user-select: none; }
.wd-pic .ic { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); font-size: 150u; color: var(--ink); z-index: 1; }
.wd-card.sel .wd-pic { filter: drop-shadow(0 5u 10u rgba(0,0,0,.28)); }
.wd-card.worn .wd-pic .fr { background: var(--red); opacity: .9; }
.wd-nm { margin-top: 14u; font: 700 26u/1.3 var(--ft); color: var(--ink); letter-spacing: .3em; margin-right: -.3em; }
.wd-rule { width: 70%; height: 1u; margin: 8u 0 8u; background: linear-gradient(90deg, transparent, rgba(194,59,42,.55), transparent); flex: none; }
.wd-desc { font: 500 14u/1.6 var(--fb); color: var(--ink2); letter-spacing: .06em; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.wd-worn { position: absolute; top: 24u; right: 24u; z-index: 2; display: flex; align-items: center; gap: 6u; font: 700 12u/1 var(--ft); color: var(--red); letter-spacing: .26em;
  padding: 5u 8u 5u 5u; background: rgba(250,244,230,.88); border-radius: 2u; }
.wd-worn .seal { width: 26u; height: 26u; font-size: 14u; }
.wd-go { padding-top: 8u; min-height: 21u; font: 600 13u/1 var(--ft); color: var(--ink3); letter-spacing: .2em; opacity: 0; transition: opacity .15s; }
.wd-card.sel .wd-go { opacity: 1; }
.wd-card.worn .wd-go { opacity: 0; }
.wd-card.busy .wd-go { opacity: 1; color: var(--red); }
`);
// the colour wash behind each picture (a hint of the outfit's own colours)
const WASH = { miko: ['rgba(236,196,176,.55)', 'rgba(206,150,128,.6)'], swim_a: ['rgba(176,212,226,.55)', 'rgba(128,176,204,.6)'], swim_b: ['rgba(196,176,222,.55)', 'rgba(150,126,188,.6)'] };
const picUrl = (o) => { const f = o.pic && G.assets?.info?.(o.pic)?.file; return f ? 'assets/' + f : null; };

export function createWardrobe(parent) {
  const R = el('div', 'wd-grid', parent);
  let cards = [], sel = 0;

  const worn = () => G.player?.outfit || OUTFITS[0].id;
  const pending = () => G.player?._S?.wardrobe?.pending || null;

  function paint() {
    const w = worn(), p = pending();
    cards.forEach((c, i) => {
      const o = OUTFITS[i];
      c.classList.toggle('sel', i === sel);
      c.classList.toggle('worn', o.id === w && !p);
      c.classList.toggle('busy', o.id === p);
      c._worn.style.display = o.id === w && !p ? '' : 'none';
      clear(c._go);
      if (o.id === p) tel('span', '', c._go, 'ui.outfit.changing');
      else hintLine(c._go, 'ui.outfit.wear', { key: codeLabel('Enter') });
    });
  }

  function render() {
    clear(R);
    cards = OUTFITS.map((o, i) => {
      const c = el('div', 'wd-card', R);
      const pic = el('div', 'wd-pic', c);
      const [w1, w2] = WASH[o.id] || WASH.miko; pic.style.setProperty('--wd-tint', w1); pic.style.setProperty('--wd-tint2', w2);
      el('div', 'fr', pic); el('div', 'wash', pic);
      const url = picUrl(o);
      if (url) { const im = el('img', '', pic); im.alt = ''; im.draggable = false; im.decoding = 'async'; im.src = url; im.onerror = () => { im.remove(); icon(o.icon, '', pic); }; }
      else icon(o.icon, '', pic);
      el('div', 'wd-nm', c, t(o.name));
      el('div', 'wd-rule', c);
      el('div', 'wd-desc', c, t(o.desc));
      const wb = el('div', 'wd-worn', c); tel('span', 'seal', wb, 'ui.seal.worn'); tel('span', '', wb, 'ui.outfit.worn');
      c._worn = wb;
      c._go = el('div', 'wd-go', c);
      c.addEventListener('mouseenter', () => setSel(i, true));
      c.addEventListener('click', () => { setSel(i, true); wear(i); });
      return c;
    });
    const w = OUTFITS.findIndex((o) => o.id === worn());
    setSel(w >= 0 ? w : 0, true, true);
  }

  function setSel(i, mouse, quiet) {
    i = Math.max(0, Math.min(cards.length - 1, i));
    if (i !== sel && !quiet) sfx('ui_move', 0.45);
    sel = i;
    paint();
  }

  function wear(i) {
    const o = OUTFITS[i];
    if (!o || !G.player?.setOutfit) return;
    if (o.id === worn() && !pending()) { sfx('ui_cancel_soft', 0.4); return; }
    sfx('ui_select', 0.6);
    const p = G.player.setOutfit(o.id);
    paint();
    Promise.resolve(p).then((ok) => { if (!ok) sfx('ui_error', 0.5); if (R.isConnected) paint(); });
  }

  return {
    el: R, render, show: render,
    keys() {
      if (K.L) setSel(sel - 1);
      if (K.R) setSel(sel + 1);
      if (K.confirm(false)) wear(sel);
    },
    hints: (h) => { const s = el('span', '', h); hintLine(s, 'ui.menu.hintMove', { up: '←', down: '→' }); const s2 = el('span', '', h); hintLine(s2, 'ui.outfit.hintWear', { key: codeLabel('Enter') }); },
  };
}
