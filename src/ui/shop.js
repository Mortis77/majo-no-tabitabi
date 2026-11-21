// openShop(): a little stall under a noren curtain. List + detail, the purse, buying with a vermilion stamp.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { K, el, tel, clear, hintLine, pushModal, popModal, enterMenuMode, leaveMenuMode, sfx, replay, codeLabel } from './dom.js';
import { icon } from './icons.js';
import { addCss } from './style.js';
import { navList } from './panels.js';

addCss(`
.mv-shop > .mv-paper { width: 940u; height: 560u; padding: 0 40u 22u; display: flex; flex-direction: column; }
.sh-noren { position: relative; margin: 0 -40u 18u; height: 86u; display: flex; align-items: center; justify-content: center; color: var(--paper);
  background: var(--indigo2); background-image: var(--tex-wave), linear-gradient(180deg, #2b376e, #1b2350); box-shadow: 0 4u 10u rgba(0,0,0,.25); }
.sh-noren::before, .sh-noren::after { content: ''; position: absolute; top: 26u; bottom: 0; width: 3u; background: rgba(243,233,212,.9); }
.sh-noren::before { left: 22%; } .sh-noren::after { left: 78%; }
.sh-noren .tt { font: 700 30u/1 var(--ft); letter-spacing: .5em; margin-right: -.5em; text-shadow: 0 2u 4u rgba(0,0,0,.5); }
.sh-noren .seal { position: absolute; right: 30u; top: 26u; }
.sh-body { flex: 1; min-height: 0; display: flex; gap: 28u; }
.sh-list { width: 430u; flex: none; }
.sh-row { position: relative; display: flex; align-items: center; gap: 12u; padding: 10u 14u; cursor: pointer; pointer-events: auto; border-bottom: 1u dashed rgba(35,31,29,.15); }
.sh-row.sel { background: linear-gradient(90deg, rgba(35,31,29,.1), rgba(35,31,29,.02)); }
.sh-row.sel::before { content: ''; position: absolute; left: 0; top: 6u; bottom: 6u; width: 3u; background: var(--red); }
.sh-row > .ic { font-size: 26u; color: var(--ink); }
.sh-row .nm { flex: 1; font: 600 16u/1.3 var(--ft); color: var(--ink); letter-spacing: .08em; }
.sh-row .own { font-size: 11u; color: var(--ink3); }
.sh-pr { display: inline-flex; align-items: center; gap: 4u; font: 700 15u/1 var(--fb); color: var(--ink); font-variant-numeric: tabular-nums; }
.sh-pr .ic { color: #b4862e; font-size: 15u; }
.sh-row.poor .sh-pr { color: var(--red); }
.sh-row.out { opacity: .45; }
.sh-row.out .sh-pr { text-decoration: line-through; }
.sh-det { flex: 1; position: relative; border-left: 1u solid rgba(35,31,29,.14); padding: 6u 0 0 28u; display: flex; flex-direction: column; }
.sh-det .ico { width: 92u; height: 92u; display: flex; align-items: center; justify-content: center; font-size: 56u; color: var(--ink); border-radius: 50%; background: rgba(35,31,29,.06); box-shadow: 0 0 0 1u var(--gold); }
.sh-det .nm { font: 700 26u/1.3 var(--ft); color: var(--ink); letter-spacing: .14em; margin: 12u 0 2u; }
.sh-det .own { font-size: 12u; color: var(--ink3); letter-spacing: .2em; }
.sh-det .ds { margin-top: 10u; font: 500 15u/1.9 var(--fb); color: var(--ink2); letter-spacing: .04em; flex: 1; }
.sh-det .act { display: flex; align-items: center; gap: 18u; }
.sh-det .act .sh-pr { font-size: 20u; }
.sh-det .act .sh-pr .ic { font-size: 20u; }
.sh-det .stamp { position: absolute; right: 30u; top: 20u; width: 76u; height: 76u; font-size: 44u; opacity: 0; pointer-events: none; }
.sh-det .stamp.go { animation: sh-stamp .9s cubic-bezier(.3,1.5,.5,1) forwards; }
@keyframes sh-stamp { 0% { opacity: 0; transform: scale(2.2) rotate(-14deg); } 30% { opacity: 1; transform: scale(1) rotate(-8deg); } 75% { opacity: 1; } 100% { opacity: 0; transform: scale(1) rotate(-8deg); } }
.sh-msg { min-height: 20u; font-size: 13u; color: var(--red); letter-spacing: .08em; margin-top: 8u; }
.sh-foot { display: flex; align-items: center; gap: 16u; padding-top: 12u; margin-top: 10u; border-top: 1u solid rgba(35,31,29,.15); }
.sh-purse { display: flex; align-items: center; gap: 10u; font-size: 12u; color: var(--ink3); letter-spacing: .2em; }
.sh-purse .sh-pr { font-size: 20u; letter-spacing: 0; }
.sh-purse.shake { animation: sh-shake .4s; }
@keyframes sh-shake { 0%, 100% { transform: none; } 20% { transform: translateX(-6u); } 40% { transform: translateX(5u); } 60% { transform: translateX(-4u); } 80% { transform: translateX(2u); } }
.sh-hint { flex: 1; text-align: right; font-size: 12u; color: var(--ink2); letter-spacing: .08em; }
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
