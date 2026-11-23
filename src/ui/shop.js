// openShop(): a parchment counter under a hanging sign. List + detail, the purse, buying with a wax-seal stamp.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { K, el, tel, clear, hintLine, pushModal, popModal, enterMenuMode, leaveMenuMode, sfx, replay, codeLabel } from './dom.js';
import { icon } from './icons.js';
import { addCss } from './style.js';
import { navList } from './panels.js';

addCss(`
/* a parchment counter under a hanging sign (night plaque, brass frame, two chains) */
.mv-shop > .mv-paper { width: 940u; height: 570u; padding: 0 46u 24u; display: flex; flex-direction: column; }
.sh-noren { position: relative; align-self: center; margin: -24u 0 18u; height: 56u; min-width: 340u; padding: 0 54u; display: flex; align-items: center; justify-content: center; color: var(--star);
  border-radius: 6u; background: radial-gradient(ellipse 80% 80% at 50% 0%, rgba(92,116,190,.38), rgba(92,116,190,0) 70%), var(--tex-stars), linear-gradient(180deg, #26355e, #10172c);
  background-size: 100% 100%, 256u 256u, 100% 100%;
  box-shadow: inset 0 0 0 1u var(--hair2), inset 0 0 0 4u #131b33, inset 0 0 0 5u rgba(236,217,164,.32), 0 8u 18u rgba(0,0,0,.35); }
.sh-noren::before, .sh-noren::after { content: ''; position: absolute; top: -18u; width: 1.5u; height: 18u; background: linear-gradient(180deg, rgba(236,217,164,0), var(--brass2)); }
.sh-noren::before { left: 22%; } .sh-noren::after { right: 22%; }
.sh-noren .tt { position: relative; display: flex; align-items: center; gap: 14u; font: 600 24u/1 var(--fd); letter-spacing: .3em; margin-right: -.3em; text-shadow: 0 2u 4u rgba(0,0,0,.5); }
.sh-noren .tt::before, .sh-noren .tt::after { content: ''; width: 10u; height: 10u; background: var(--brass2); -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.sh-noren .tt::after { margin-left: -.3em; }
.sh-noren .seal { position: absolute; right: -14u; top: 10u; }
.sh-body { flex: 1; min-height: 0; display: flex; gap: 28u; }
.sh-list { width: 430u; flex: none; }
.sh-row { position: relative; display: flex; align-items: center; gap: 12u; padding: 10u 14u 10u 18u; cursor: pointer; pointer-events: auto; border-radius: 4u;
  background: linear-gradient(90deg, rgba(148,113,47,.18), rgba(148,113,47,.18)) 14u 100% / calc(100% - 28u) 1u no-repeat; transition: background-color .15s; }
.sh-row:hover { background-color: rgba(148,113,47,.06); }
.sh-row.sel { background-color: rgba(148,113,47,.13); box-shadow: inset 0 0 0 1u rgba(148,113,47,.35); }
.sh-row.sel::before { content: ''; position: absolute; left: 4u; top: 50%; width: 9u; height: 9u; margin-top: -4.5u; background: var(--brass3);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.sh-row > .ic { font-size: 24u; color: var(--ink); }
.sh-row .nm { flex: 1; font: 600 15.5u/1.3 var(--fd); color: var(--ink); letter-spacing: .04em; }
.sh-row .own { font: 400 12u/1 var(--fb); color: var(--ink3); }
.sh-pr { display: inline-flex; align-items: center; gap: 4u; font: 600 15u/1 var(--fd); color: var(--ink); }
.sh-pr .ic { color: var(--brass3); font-size: 14u; }
.sh-row.poor .sh-pr { color: var(--wine); }
.sh-row.out { opacity: .45; }
.sh-row.out .sh-pr { text-decoration: line-through; }
.sh-det { flex: 1; position: relative; padding: 6u 0 0 30u; display: flex; flex-direction: column;
  background: linear-gradient(180deg, transparent, rgba(148,113,47,.35) 12%, rgba(148,113,47,.35) 88%, transparent) left / 1u 100% no-repeat; }
.sh-det .ico { width: 92u; height: 92u; display: flex; align-items: center; justify-content: center; font-size: 52u; color: var(--ink); border-radius: 50%;
  background: radial-gradient(circle at 50% 38%, #fffaf0, #eadcbe); box-shadow: 0 0 0 1u var(--brass3), 0 0 0 5u rgba(246,239,224,.8), 0 0 0 6u rgba(148,113,47,.3), 0 4u 10u rgba(80,60,30,.15); }
.sh-det .nm { font: 700 25u/1.3 var(--fd); color: var(--ink); letter-spacing: .06em; margin: 14u 0 2u; }
.sh-det .own { font: 600 12u/1.5 var(--fd); color: var(--brass3); letter-spacing: .16em; }
.sh-det .ds { margin-top: 10u; font: 400 15.5u/1.9 var(--fb); color: var(--ink2); letter-spacing: .03em; flex: 1; }
.sh-det .act { display: flex; align-items: center; gap: 18u; }
.sh-det .act .sh-pr { font-size: 20u; }
.sh-det .act .sh-pr .ic { font-size: 18u; }
.sh-det .stamp { position: absolute; right: 30u; top: 20u; width: 74u; height: 74u; font-size: 30u; opacity: 0; pointer-events: none; }
.sh-det .stamp::before { inset: 6u; border-width: 1.5u; }
.sh-det .stamp.go { animation: sh-stamp .9s cubic-bezier(.3,1.5,.5,1) forwards; }
@keyframes sh-stamp { 0% { opacity: 0; transform: scale(2.2) rotate(-14deg); } 30% { opacity: 1; transform: scale(1) rotate(-8deg); } 75% { opacity: 1; } 100% { opacity: 0; transform: scale(1) rotate(-8deg); } }
.sh-msg { min-height: 20u; font: 400 13.5u/1.5 var(--fb); color: var(--wine); letter-spacing: .04em; margin-top: 8u; }
.sh-foot { display: flex; align-items: center; gap: 16u; padding-top: 12u; margin-top: 10u; border-top: 1u solid rgba(148,113,47,.25); }
.sh-purse { display: flex; align-items: center; gap: 10u; font: 600 12u/1 var(--fd); color: var(--brass3); letter-spacing: .16em; }
.sh-purse .sh-pr { font-size: 20u; letter-spacing: 0; }
.sh-purse.shake { animation: sh-shake .4s; }
@keyframes sh-shake { 0%, 100% { transform: none; } 20% { transform: translateX(-6u); } 40% { transform: translateX(5u); } 60% { transform: translateX(-4u); } 80% { transform: translateX(2u); } }
.sh-hint { flex: 1; text-align: right; font: 400 12.5u/1.5 var(--fb); color: var(--ink2); letter-spacing: .04em; }
.sh-hint .keycap { margin: 0 3u; }
`);

export function createShop(host) {
  let active = null;
  let curIcon = 'stardust'; // openShop({ currencyIcon }) — e.g. 'moontear' at the altar

  function price(parent, n) { const p = el('span', 'sh-pr', parent); icon(curIcon, '', p); el('span', '', p, String(n)); return p; }

  function openShop(o = {}) {
    if (active) active.finish();
    curIcon = o.currencyIcon || 'stardust';
    const items = Array.isArray(o.items) ? o.items : [];
    const purse = () => { try { return Number(o.currency ? o.currency() : (G.state?.inventory?.stardust || 0)) || 0; } catch (e) { return 0; } };
    return new Promise((resolve) => {
      enterMenuMode();
      G.ui?.prompt?.(null);
      const M = el('div', 'modal mv-shop', host);
      const sheet = el('div', 'mv-paper', M); el('div', 'bg', sheet);
      const nor = el('div', 'sh-noren', sheet);
      if (o.title) el('div', 'tt', nor, String(o.title)); else tel('div', 'tt', nor, 'ui.shop.title');
      const body = el('div', 'sh-body', sheet);
      const list = el('div', 'sh-list scroll', body);
      const det = el('div', 'sh-det', body);
      const foot = el('div', 'sh-foot', sheet);
      const purseEl = el('div', 'sh-purse', foot);
      const hint = el('div', 'sh-hint', foot);
      const leave = el('div', 'btn', foot); icon('resume', '', leave); tel('span', '', leave, 'ui.shop.leave');
      leave.addEventListener('click', () => finish(true));
      let nav = null, rows = [], msg = null, stamp = null, buyBtn = null;

      const owned = (it) => (typeof it.owned === 'number' ? it.owned : it.owned ? 1 : 0);
      const soldOut = (it) => (typeof it.max === 'number' && owned(it) >= it.max) || (it.max === undefined && it.owned === true);
      function paintPurse() { clear(purseEl); tel('span', '', purseEl, 'ui.shop.purse'); price(purseEl, purse()); }
      function paintRows() {
        const money = purse();
        rows.forEach((r, i) => { const it = items[i]; r.classList.toggle('poor', money < (it.price || 0)); r.classList.toggle('out', soldOut(it));
          r._own.textContent = owned(it) ? (typeof it.max === 'number' ? t('ui.shop.ownedMax', { n: owned(it), max: it.max }) : t('ui.shop.owned', { n: owned(it) })) : ''; });
      }
      function detail(i) {
        clear(det);
        const it = items[i];
        if (!it) { const e = el('div', 'empty', det); el('div', 'enso', e); tel('div', 'e1', e, 'ui.shop.empty'); return; }
        const ic = el('div', 'ico', det); icon(it.icon || it.id, '', ic);
        el('div', 'nm', det, it.name || '');
        const ow = el('div', 'own', det);
        if (owned(it)) ow.textContent = typeof it.max === 'number' ? t('ui.shop.ownedMax', { n: owned(it), max: it.max }) : t('ui.shop.owned', { n: owned(it) });
        el('div', 'ds', det, it.desc || '');
        const act = el('div', 'act', det);
        price(act, it.price || 0);
        buyBtn = el('div', 'btn red', act);
        if (soldOut(it)) { tel('span', '', buyBtn, 'ui.shop.soldOut'); buyBtn.classList.add('off'); }
        else { icon(curIcon, '', buyBtn); tel('span', '', buyBtn, 'ui.shop.buy'); buyBtn.addEventListener('click', () => buy(i)); }
        msg = el('div', 'sh-msg', det);
        stamp = tel('span', 'seal stamp', det, 'ui.seal.bought');
      }
      function buy(i) {
        const it = items[i];
        if (!it || soldOut(it)) { sfx('ui_error', 0.6); return; }
        if (purse() < (it.price || 0)) { sfx('ui_error', 0.7); msg.textContent = t('ui.shop.poor'); replay(purseEl, 'shake'); return; }
        const before = owned(it);
        let ok = false;
        try { ok = o.onBuy ? !!o.onBuy(it.id) : false; } catch (e) { G.reportError('ui:shop', e); }
        if (!ok) { sfx('ui_error', 0.7); msg.textContent = t('ui.shop.poor'); replay(purseEl, 'shake'); return; }
        if (owned(it) === before) it.owned = before + 1;
        sfx('buy'); sfx('ui_select', 0.6);
        G.ui?.toast?.(t('ui.shop.bought', { name: it.name || '' }), { icon: it.icon || it.id, dur: 2.2 });
        paintPurse(); paintRows(); detail(i);
        replay(stamp, 'go');
      }

      rows = items.map((it) => {
        const r = el('div', 'sh-row', list);
        icon(it.icon || it.id, '', r);
        const c = el('div', 'nm', r); el('div', '', c, it.name || ''); r._own = el('div', 'own', c);
        price(r, it.price || 0);
        return r;
      });
      if (rows.length) nav = navList(rows, (i, mouse) => { if (!mouse) buy(i); }, { onSel: detail, allowE: true }).bind();
      else detail(-1);
      paintPurse(); paintRows();
      hintLine(hint, 'ui.shop.hint', { up: '↑', down: '↓', ok: codeLabel('Enter'), back: codeLabel('Escape') });

      const modal = {
        el: M,
        update() {
          if (K.cancel()) { finish(true); K.eat(); return; }
          nav?.keys();
          K.eat();
        },
      };
      function finish(gesture) {
        if (active !== handle) return;
        active = null;
        popModal(modal);
        M.classList.remove('on');
        setTimeout(() => M.remove(), 260);
        sfx('ui_close', 0.6);
        leaveMenuMode(gesture);
        resolve();
      }
      const handle = { finish: () => finish(false) };
      active = handle;
      pushModal(modal);
      requestAnimationFrame(() => requestAnimationFrame(() => M.classList.add('on')));
      sfx('ui_open', 0.7);
    });
  }
  return { openShop, get open() { return !!active; } };
}
