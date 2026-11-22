// The pause scroll: tabs (map, journal, spells, items, settings) on one washi sheet, plus "back to the journey" and "save & quit".
// Opening it pauses the world (G.setMode('menu')) and frees the pointer; closing gives both back.
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { UI, K, el, tel, clear, fmtTime, hintLine, keycap, pushModal, popModal, enterMenuMode, leaveMenuMode, sfx, codeLabel, key } from './dom.js';
import { icon, EL_COLOR, ELEMENTS } from './icons.js';
import { addCss } from './style.js';
import { navList, createSettings, confirmBox } from './panels.js';
import { createMapTab } from './map.js';
import { spellSlots, selectedId } from './model.js';
import { createWardrobe } from './wardrobe.js';   // wardrobe: 衣装 page
import { notesEntries, notesCount, noteRow, noteDetail } from './reactions.js';   // 元素笔记: the third journal page
import { wildsEntries, wildsCount, wildsRow, wildsDetail } from './wilds-page.js';   // 旅途见闻: the fourth journal page

addCss(`
.mv-menu > .mv-paper { width: 1160u; height: 640u; padding: 26u 40u 20u; display: flex; flex-direction: column; }
.mn-top { display: flex; align-items: flex-end; gap: 8u; border-bottom: 1u solid rgba(35,31,29,.18); padding-bottom: 0; }
.mn-top .keycap { margin-bottom: 12u; }
.mn-side { width: 210u; flex: none; align-self: center; display: flex; align-items: center; gap: 12u; padding-bottom: 6u; }
.mn-tabs { display: flex; gap: 2u; flex: 1; justify-content: center; align-items: flex-end; }
.mn-tab { position: relative; display: flex; align-items: center; gap: 8u; padding: 10u 16u 14u; white-space: nowrap; flex: none; font: 700 18u/1 var(--ft); letter-spacing: .24em; color: var(--ink3); cursor: pointer; pointer-events: auto; transition: color .15s; }
.mn-tab .ic { font-size: 18u; }
.mn-tab:hover { color: var(--ink2); }
.mn-tab.on { color: var(--ink); }
.mn-tab.on .ic { color: var(--red); }
.mn-tab::after { content: ''; position: absolute; left: 10u; right: 10u; bottom: -4u; height: 8u; background: var(--red); opacity: 0; transform: scaleX(.2);
  -webkit-mask: var(--mk-brush1) center / 100% 100% no-repeat; mask: var(--mk-brush1) center / 100% 100% no-repeat; transition: opacity .18s, transform .25s cubic-bezier(.2,.8,.2,1); }
.mn-tab.on::after { opacity: 1; transform: none; }
.mn-info { font-size: 12u; color: var(--ink3); letter-spacing: .1em; line-height: 1.5; white-space: nowrap; }
.mn-info b { display: block; font: 700 15u/1.4 var(--ft); color: var(--ink); letter-spacing: .2em; }
.mn-sub { margin: 10u 0 12u; text-align: center; font: 500 13u/1 var(--ft); color: var(--ink2); letter-spacing: .4em; }
.mn-body { position: relative; flex: 1; min-height: 0; }
.mn-pane { position: absolute; inset: 0; display: none; }
.mn-pane.on { display: block; animation: mn-in .25s ease-out; }
@keyframes mn-in { from { opacity: 0; transform: translateY(6u); } to { opacity: 1; transform: none; } }
.mn-foot { display: flex; align-items: center; gap: 10u; margin-top: 12u; padding-top: 10u; border-top: 1u solid rgba(35,31,29,.15); }
.mn-hint { flex: 1; font-size: 12u; color: var(--ink2); letter-spacing: .08em; display: flex; flex-wrap: wrap; gap: 4u 16u; align-items: center; }
.mn-hint .keycap { margin: 0 3u; }
.mn-foot .btn { font-size: 15u; }
.mn-foot .btn .ic { color: var(--red); }
.mn-foot .btn.sel .ic, .mn-foot .btn:hover .ic { color: var(--gold2); }

/* two-column list + detail layout shared by journal / spells / items */
.mn-split { position: absolute; inset: 0; display: flex; gap: 28u; }
.mn-list { width: 400u; flex: none; display: flex; flex-direction: column; min-height: 0; }
.mn-list .scroll { flex: 1; min-height: 0; padding-right: 6u; }
.mn-det { flex: 1; min-width: 0; position: relative; padding: 8u 10u 0 28u; border-left: 1u solid rgba(35,31,29,.14); overflow: hidden; }
.mn-subtabs { display: flex; flex-wrap: nowrap; gap: 2u; margin-bottom: 10u; } /* four journal pages share one row */
.mn-subtabs .st { padding: 4u 8u; white-space: nowrap; font: 700 14u/1.4 var(--ft); letter-spacing: .08em; color: var(--ink3); cursor: pointer; pointer-events: auto; border-bottom: 2u solid transparent; }
.mn-subtabs .st.on { color: var(--ink); border-color: var(--red); }
.mn-subtabs .st .n { font: 500 11u/1 var(--fb); color: var(--ink3); margin-left: 4u; letter-spacing: 0; }
.mn-row { position: relative; display: flex; align-items: center; gap: 10u; padding: 9u 12u 9u 14u; cursor: pointer; pointer-events: auto; border-bottom: 1u dashed rgba(35,31,29,.13); }
.mn-row.sel { background: linear-gradient(90deg, rgba(35,31,29,.1), rgba(35,31,29,.02)); }
.mn-row.sel::before { content: ''; position: absolute; left: 0; top: 6u; bottom: 6u; width: 3u; background: var(--red); }
.mn-row .seal { width: 24u; height: 24u; font-size: 14u; }
.mn-row .seal.side { background: var(--ink2); box-shadow: inset 0 0 0 1.5u rgba(243,233,212,.7), inset 0 0 0 3u var(--ink2); }
.mn-row .tt { flex: 1; font: 600 15u/1.35 var(--ft); color: var(--ink); letter-spacing: .08em; }
.mn-row.done .tt { color: var(--ink3); text-decoration: line-through; text-decoration-color: rgba(194,59,42,.6); }
.mn-row .chip { font-size: 11u; color: var(--ink3); letter-spacing: .1em; white-space: nowrap; }
.mn-row .chip.act { color: var(--red); }
.mn-list.wide { width: 440u; }
.mn-det .kick .seal { width: 22u; height: 22u; font-size: 13u; }
.kick.gap { margin-top: 14u; }
.mn-det .big { font: 700 28u/1.3 var(--ft); color: var(--ink); letter-spacing: .14em; margin: 6u 0 4u; }
.mn-det .kick { display: flex; align-items: center; gap: 10u; font-size: 12u; color: var(--ink3); letter-spacing: .3em; }
.mn-det .txt { margin-top: 14u; font: 500 15u/1.95 var(--fb); color: var(--ink2); letter-spacing: .05em; white-space: pre-wrap; max-width: 620u; }
.mn-det .rule { margin: 16u 0 12u; max-width: 560u; }
.mn-det .obh { font: 700 13u/1 var(--ft); color: var(--red); letter-spacing: .3em; margin-bottom: 8u; }
.mn-det .ob { display: flex; align-items: flex-start; gap: 10u; font-size: 14u; line-height: 1.6; color: var(--ink); margin: 6u 0; }
.mn-det .ob .bx { width: 16u; height: 16u; margin-top: 3u; flex: none; border: 1.5u solid var(--ink2); border-radius: 50%; position: relative; }
.mn-det .ob.done { color: var(--ink3); }
.mn-det .ob.done .bx { border-color: var(--red); }
.mn-det .ob.done .bx::after { content: ''; position: absolute; left: 3u; top: -3u; width: 6u; height: 12u; border: solid var(--red); border-width: 0 2.5u 2.5u 0; transform: rotate(40deg); }
.mn-det .ghost { position: absolute; right: -10u; bottom: -40u; font: 700 300u/1 var(--ft); color: var(--ink); opacity: .05; pointer-events: none; user-select: none; }
.mn-det .ghost.ic { width: 300u; height: 300u; }

/* spells */
.sp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4u 10u; }
.sp-grid.arts { grid-template-columns: repeat(7, 1fr); gap: 4u; }
.sp-grid.arts .orb { width: 44u; height: 44u; font-size: 22u; }
.sp-grid.arts .nm { font-size: 13u; letter-spacing: .06em; margin-right: -.06em; }
.sp-cell { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5u; padding: 9u 2u 8u; cursor: pointer; pointer-events: auto; border-radius: 3u; }
.sp-cell.sel { background: rgba(35,31,29,.08); box-shadow: inset 0 0 0 1u rgba(194,59,42,.5); }
.sp-cell .orb { width: 54u; height: 54u; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 30u; color: var(--sc);
  background: radial-gradient(circle at 50% 35%, #3a3556, #15132a); box-shadow: 0 0 0 1.5u var(--gold), 0 3u 8u rgba(0,0,0,.35); }
.sp-cell .orb .ic { filter: drop-shadow(0 0 5u var(--sc)); }
.sp-cell.art .orb { background: radial-gradient(circle at 50% 35%, #fff8ea, #e6d6b2); color: var(--ink); box-shadow: 0 0 0 1.5u var(--ink2), 0 3u 6u rgba(0,0,0,.2); }
.sp-cell.art .orb .ic { filter: none; }
.sp-cell.locked .orb { color: #77728a; filter: grayscale(.7); opacity: .55; }
.sp-cell.locked .orb .ic { filter: none; }
.sp-cell .nm { font: 700 14u/1.2 var(--ft); color: var(--ink); letter-spacing: .14em; margin-right: -.14em; }
.sp-cell.locked .nm { color: var(--ink3); }
.sp-cell .pips { display: flex; gap: 4u; }
.sp-cell .pips i { width: 7u; height: 7u; transform: rotate(45deg); background: rgba(35,31,29,.18); }
.sp-cell .pips i.on { background: var(--red); }
.sp-cell .cur { position: absolute; top: 4u; right: 10u; width: 20u; height: 20u; font-size: 12u; }
.sp-h { font: 700 13u/1 var(--ft); color: var(--red); letter-spacing: .3em; margin: 4u 0 8u; display: flex; align-items: center; gap: 8u; }
.sp-h::after { content: ''; flex: 1; height: 1u; background: linear-gradient(90deg, rgba(194,59,42,.45), transparent); }
.sp-forms { display: flex; gap: 20u; margin-top: 16u; }
.sp-form { flex: 1; max-width: 280u; padding: 12u 14u; background: rgba(35,31,29,.05); border-top: 2u solid var(--ink2); }
.sp-form.off { opacity: .4; }
.sp-form .k { font-size: 12u; color: var(--ink3); letter-spacing: .3em; }
.sp-form .v { font: 700 17u/1.5 var(--ft); color: var(--ink); letter-spacing: .1em; }
.sp-form .c { font-size: 12u; color: #3c79b0; font-weight: 700; }

/* items */
.it-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10u; }
.it-cell { position: relative; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6u; cursor: pointer; pointer-events: auto;
  background: rgba(35,31,29,.05); box-shadow: inset 0 0 0 1u rgba(35,31,29,.14); border-radius: 3u; }
.it-cell.sel { background: rgba(35,31,29,.1); box-shadow: inset 0 0 0 1.5u var(--red); }
.it-cell .ic { font-size: 38u; color: var(--ink); }
.it-cell .n { position: absolute; right: 7u; top: 6u; font: 700 13u/1 var(--fb); color: var(--ink2); }
.it-cell .nm { font: 600 12u/1 var(--ft); color: var(--ink2); letter-spacing: .1em; }
.it-big { width: 96u; height: 96u; display: flex; align-items: center; justify-content: center; font-size: 60u; color: var(--ink); background: rgba(35,31,29,.06); border-radius: 50%; box-shadow: 0 0 0 1u var(--gold); margin-bottom: 8u; }

/* phones and tablets: the scroll fills the screen, the side blocks shrink, long details scroll */
.mv-ui.compact .mv-menu > .mv-paper { width: min(1160u, calc(100vw - 16px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  height: min(640u, calc(100dvh - 10px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); padding: 10u 22u 8u; }
.mv-ui.compact .mn-side { width: 150u; }
.mv-ui.compact .mn-top > .mn-side:last-child { width: 40u; }
.mv-ui.compact .mn-info { font-size: 11u; }
.mv-ui.compact .mn-info b { font-size: 14u; }
.mv-ui.compact .mn-tab { padding: 8u 12u 12u; letter-spacing: .14em; }
.mv-ui.compact .mn-sub { display: none; }
.mv-ui.compact .mn-body { margin-top: 10u; }
.mv-ui.compact .mn-foot { margin-top: 6u; padding-top: 6u; }
.mv-ui.compact .mn-split { gap: 18u; }
.mv-ui.compact .mn-list { width: 36%; }
.mv-ui.compact .mn-list.wide { width: 40%; }
.mv-ui.compact .mn-det { padding: 4u 6u 0 18u; overflow-y: auto; touch-action: pan-y; }
.mv-ui.compact .mn-det .big { font-size: 24u; }
.mv-ui.compact .mn-det .txt { margin-top: 8u; line-height: 1.8; }
.mv-ui.compact .mn-det .ghost { position: fixed; display: none; }
.mv-ui.compact .sp-forms { gap: 12u; margin-top: 10u; }
/* touch: no key caps or key hints, a close mark in the corner, fingertip rows */
.mv-ui.touch .mn-tabs > .keycap, .mv-ui.touch .mn-hint { visibility: hidden; }
.mv-ui.touch .mn-close { display: block; }
.mn-close { display: none; z-index: 3; }
.mv-ui.touch .mn-tab { min-height: 44px; align-items: flex-end; }
.mv-ui.touch .mn-subtabs .st { padding: 8u 8u; }
`);

const TABS = ['map', 'journal', 'spells', 'items', 'wardrobe', 'settings'];   // wardrobe: 衣装 between items and settings
const TAB_ICON = { map: 'map', journal: 'journal', spells: 'spells', items: 'items', wardrobe: 'wardrobe', settings: 'settings' };
const ARTS = ['charm', 'dodge', 'broom', 'wings', 'guard', 'shikigami', 'kinkan'];
const INNATE = new Set(['charm', 'dodge']);

function callProvider(providers, k) {
  try { const v = providers[k] && providers[k](); return Array.isArray(v) ? v : []; } catch (e) { G.reportError('ui:provider:' + k, e); return []; }
}
function emptyState(parent, k1, k2) {
  const e = el('div', 'empty', parent);
  el('div', 'enso', e); tel('div', 'e1', e, k1); if (k2) tel('div', 'e2', e, k2);
  return e;
}
const glyph = (id) => (has('ui.glyph.' + id) ? t('ui.glyph.' + id) : '');

// ---- journal ---------------------------------------------------------------------------------------------
function createJournal(parent, providers) {
  const R = el('div', 'mn-split', parent);
  const L = el('div', 'mn-list', R);
  const sub = el('div', 'mn-subtabs', L);
  const listEl = el('div', 'scroll', L);
  const D = el('div', 'mn-det', R);
  let mode = 'quests', nav = null, data = [];
  const st = {
    quests: el('div', 'st', sub), lore: el('div', 'st', sub), notes: el('div', 'st', sub), wilds: el('div', 'st', sub),
  };
  st.quests.addEventListener('click', () => { mode = 'quests'; render(); sfx('ui_page', 0.6); });
  st.lore.addEventListener('click', () => { mode = 'lore'; render(); sfx('ui_page', 0.6); });
  st.notes.addEventListener('click', () => { mode = 'notes'; render(); sfx('ui_page', 0.6); });
  st.wilds.addEventListener('click', () => { mode = 'wilds'; render(); sfx('ui_page', 0.6); });

  function detail(i) {
    clear(D);
    const q = data[i];
    if (!q) return;
    if (mode === 'notes') { noteDetail(D, q); return; }
    if (mode === 'wilds') { wildsDetail(D, q); return; }
    if (mode === 'quests') {
      el('div', 'ghost', D, t(q.main ? 'ui.seal.main' : 'ui.seal.side'));
      const k = el('div', 'kick', D);
      el('span', 'seal' + (q.main ? '' : ' side'), k, t(q.main ? 'ui.seal.main' : 'ui.seal.side'));
      tel('span', '', k, q.main ? 'ui.journal.main' : 'ui.journal.side');
      tel('span', '', k, q.state === 'done' ? 'ui.journal.done' : 'ui.journal.active');
      el('div', 'big', D, q.title || '');
      if (q.desc) el('div', 'txt', D, q.desc);
      const obs = Array.isArray(q.objectives) ? q.objectives : [];
      if (obs.length) {
        el('div', 'rule ink', D);
        tel('div', 'obh', D, 'ui.journal.objectives');
        for (const o of obs) { const r = el('div', 'ob' + (o.done ? ' done' : ''), D); el('span', 'bx', r); el('span', '', r, o.text || ''); }
      }
    } else {
      icon('ema', 'ghost', D);
      const k = el('div', 'kick', D); tel('span', '', k, 'ui.journal.lore');
      el('div', 'big', D, q.title || '');
      el('div', 'txt', D, q.text || '');
    }
  }

  function render() {
    const quests = callProvider(providers, 'journal');
    const lore = callProvider(providers, 'lore');
    clear(st.quests); tel('span', '', st.quests, 'ui.journal.quests'); el('span', 'n', st.quests, String(quests.length));
    clear(st.lore); tel('span', '', st.lore, 'ui.journal.lore'); el('span', 'n', st.lore, String(lore.length));
    const nc = notesCount();
    clear(st.notes); tel('span', '', st.notes, 'elements.ui.tab'); el('span', 'n', st.notes, nc.n + '/' + nc.of);
    const wc = wildsCount();
    clear(st.wilds); tel('span', '', st.wilds, 'gameplay.wilds.page.tab'); el('span', 'n', st.wilds, wc.n + '/' + wc.of);
    st.quests.classList.toggle('on', mode === 'quests'); st.lore.classList.toggle('on', mode === 'lore'); st.notes.classList.toggle('on', mode === 'notes'); st.wilds.classList.toggle('on', mode === 'wilds');
    // active first, main first
    data = mode === 'quests' ? quests.slice().sort((a, b) => ((a.state === 'done') - (b.state === 'done')) || ((b.main ? 1 : 0) - (a.main ? 1 : 0))) : mode === 'notes' ? notesEntries() : mode === 'wilds' ? wildsEntries() : lore;
    clear(listEl); clear(D);
    if (!data.length) {
      nav = null;
      if (mode === 'quests') emptyState(D, 'ui.journal.emptyQuests', 'ui.journal.emptyQuestsSub');
      else emptyState(D, 'ui.journal.emptyLore', 'ui.journal.emptyLoreSub');
      return;
    }
    const rows = data.map((q) => {
      if (mode === 'notes') { const r = el('div', 'mn-row rx-note' + (q.known ? '' : ' unk'), listEl); noteRow(r, q); return r; }
      if (mode === 'wilds') { const r = el('div', 'mn-row', listEl); wildsRow(r, q); return r; }
      const r = el('div', 'mn-row' + (mode === 'quests' && q.state === 'done' ? ' done' : ''), listEl);
      if (mode === 'quests') el('span', 'seal' + (q.main ? '' : ' side'), r, t(q.main ? 'ui.seal.main' : 'ui.seal.side'));
      else icon('ema', '', r);
      el('span', 'tt', r, q.title || '');
      if (mode === 'quests') tel('span', 'chip' + (q.state === 'done' ? '' : ' act'), r, q.state === 'done' ? 'ui.journal.done' : 'ui.journal.active');
      return r;
    });
    nav = navList(rows, null, { onSel: detail }).bind();
  }
  return {
    el: R, render, show: render,
    keys() {
      if (K.L || K.R) { const ms = ['quests', 'lore', 'notes', 'wilds']; mode = ms[(ms.indexOf(mode) + (K.L ? ms.length - 1 : 1)) % ms.length]; render(); sfx('ui_page', 0.6); return; }
      nav?.keys();
    },
    hints: (h) => { hint(h, 'ui.menu.hintMove', { up: '↑', down: '↓' }); hint(h, 'ui.menu.hintSub', { key: '← →' }); },
  };
}

// ---- spells ----------------------------------------------------------------------------------------------
function createSpells(parent, providers) {
  const R = el('div', 'mn-split', parent);
  const L = el('div', 'mn-list', R);
  L.classList.add('wide');
  const box = el('div', 'scroll', L);
  const D = el('div', 'mn-det', R);
  let cells = [], data = [], sel = 0;

  function gather() {
    const prov = callProvider(providers, 'spells');
    const slots = spellSlots(true);
    const els = ELEMENTS.map((id, i) => {
      const p = prov.find((s) => s && s.id === id) || prov.find((s) => s && s.element === id); // the exact id first: 灵符 (charm) also carries element 'sun'
      const s = slots[i];
      return { kind: 'el', id, element: id, level: (p && typeof p.level === 'number') ? p.level : s.level, name: (p && p.name) || s.name, desc: (p && p.desc) || s.desc,
        small: (p && (p.small?.name || p.small)) || s.small, big: (p && (p.big?.name || p.big)) || s.big, cost: s.cost, costBig: s.costBig };
    });
    const ab = (G.state && G.state.abilities) || {};
    const arts = ARTS.map((id) => {
      const p = prov.find((s) => s && s.id === id);
      return { kind: 'art', id, level: INNATE.has(id) || ab[id] || (p && p.level > 0) ? 1 : 0, name: (p && p.name) || t('ui.spells.art.' + id + '.name'), desc: (p && p.desc) || t('ui.spells.art.' + id + '.desc') };
    });
    return els.concat(arts);
  }

  function detail(i) {
    clear(D);
    const s = data[i];
    if (!s) return;
    const g = glyph(s.id);
    if (g) el('div', 'ghost', D, g); else icon(s.id, 'ghost', D);
    const k = el('div', 'kick', D);
    tel('span', '', k, s.kind === 'el' ? 'ui.spells.elements' : 'ui.spells.arts');
    if (s.kind === 'el') el('span', '', k, t('core.element.' + s.id));
    if (s.kind === 'el' && s.id === selectedId()) tel('span', 'seal', k, 'ui.seal.learned');
    const locked = s.level <= 0;
    el('div', 'big', D, locked && s.kind === 'el' ? t('ui.spells.lockedName') : s.name);
    if (s.kind === 'el') tel('div', 'kick', D, 'ui.spells.level' + Math.min(2, Math.max(0, s.level | 0)));
    el('div', 'txt', D, locked && s.kind === 'el' ? t('ui.spells.lockedDesc') : (s.desc || t('ui.spells.el.' + s.id)));
    if (s.kind === 'el') {
      const f = el('div', 'sp-forms', D);
      const form = (lv, kk, nm, cost) => {
        const b = el('div', 'sp-form' + (s.level >= lv ? '' : ' off'), f);
        tel('div', 'k', b, kk);
        el('div', 'v', b, s.level >= lv && nm ? nm : (s.level >= lv ? t(kk) : t('ui.spells.lockedName')));
        if (s.level >= lv && cost) tel('div', 'c', b, 'ui.spells.cost', { n: cost });
      };
      form(1, 'ui.spells.small', s.small, s.cost);
      form(2, 'ui.spells.big', s.big, s.costBig);
      if (s.id === selectedId()) { const e = el('div', 'kick gap', D); tel('span', '', e, 'ui.spells.equipped'); }
    }
  }

  function render() {
    data = gather();
    clear(box);
    const anyKnown = data.some((s) => s.kind === 'el' && s.level > 0);
    tel('div', 'sp-h', box, 'ui.spells.elements');
    const g1 = el('div', 'sp-grid', box);
    const mk = (s, parentGrid) => {
      const c = el('div', 'sp-cell' + (s.kind === 'art' ? ' art' : '') + (s.level <= 0 ? ' locked' : ''), parentGrid);
      if (s.kind === 'el') c.style.setProperty('--sc', EL_COLOR[s.id]);
      const o = el('div', 'orb', c); icon(s.level <= 0 && s.kind === 'el' ? s.id : s.id, '', o);
      el('div', 'nm', c, s.kind === 'el' ? (s.level > 0 ? s.name : t('core.element.' + s.id)) : s.name);
      if (s.kind === 'el') { const p = el('div', 'pips', c); el('i', s.level >= 1 ? 'on' : '', p); el('i', s.level >= 2 ? 'on' : '', p); }
      else if (s.level <= 0) { const p = el('div', 'pips', c); el('i', '', p); }
      if (s.kind === 'el' && s.id === selectedId()) tel('span', 'seal cur', c, 'ui.seal.learned');
      return c;
    };
    cells = data.filter((s) => s.kind === 'el').map((s) => mk(s, g1));
    tel('div', 'sp-h', box, 'ui.spells.arts');
    const g2 = el('div', 'sp-grid arts', box);
    cells = cells.concat(data.filter((s) => s.kind === 'art').map((s) => mk(s, g2)));
    cells.forEach((c, i) => c.addEventListener('mouseenter', () => setSel(i, true)));
    setSel(Math.min(sel, cells.length - 1), false, true);
    if (!anyKnown && !callProvider(providers, 'spells').length && !(G.state && G.state.spells && Object.keys(G.state.spells).length)) {
      // nothing learned yet: a gentle note under the grid
      const e = el('div', 'kick gap', box); tel('span', '', e, 'ui.spells.emptySub');
    }
  }
  function setSel(i, mouse, quiet) {
    i = Math.max(0, Math.min(cells.length - 1, i));
    if (i !== sel && !quiet) sfx('ui_move', 0.45);
    sel = i;
    cells.forEach((c, j) => c.classList.toggle('sel', j === i));
    if (!mouse) cells[i]?.scrollIntoView?.({ block: 'nearest' });
    detail(i);
  }
  return {
    el: R, render, show: render,
    keys() {
      const nEl = 8;
      if (K.L) setSel(sel - 1);
      if (K.R) setSel(sel + 1);
      if (K.U && sel >= 4) setSel(sel >= nEl ? 4 + Math.min(3, Math.floor((sel - nEl) * 4 / 7)) : sel - 4);
      if (K.D && sel < nEl) setSel(sel < 4 ? sel + 4 : Math.min(cells.length - 1, nEl + Math.round((sel - 4) * 7 / 4)));
    },
    hints: (h) => hint(h, 'ui.menu.hintMove', { up: '↑ ↓', down: '← →' }),
  };
}

// ---- items -----------------------------------------------------------------------------------------------
const KNOWN_ITEMS = ['stardust', 'dango', 'moontear'];
function createItems(parent, providers) {
  const R = el('div', 'mn-split', parent);
  const L = el('div', 'mn-list', R);
  const box = el('div', 'scroll', L);
  const D = el('div', 'mn-det', R);
  let cells = [], data = [], sel = 0;
  function gather() {
    const prov = callProvider(providers, 'items');
    if (prov.length) return prov.filter((x) => x && (x.count === undefined || x.count > 0));
    const inv = (G.state && G.state.inventory) || {};
    return KNOWN_ITEMS.filter((id) => (inv[id] || 0) > 0).map((id) => ({ id, name: t('ui.item.' + id + '.name'), desc: t('ui.item.' + id + '.desc'), count: inv[id], icon: id }));
  }
  function detail(i) {
    clear(D);
    const it = data[i];
    if (!it) return;
    const b = el('div', 'it-big', D); icon(it.icon || it.id, '', b);
    el('div', 'big', D, it.name || '');
    if (it.count !== undefined) tel('div', 'kick', D, 'ui.items.held', { n: it.count });
    el('div', 'txt', D, it.desc || '');
    // use / eat (gameplay.useItem); food reads 'eat'
    if (it.usable && G.gameplay?.useItem) {
      const b2 = el('div', 'btn it-use', D); icon(it.icon || it.id, '', b2);
      tel('span', '', b2, it.kind === 'tool' ? 'ui.items.use' : 'ui.items.eat');
      b2.style.marginTop = '14px'; b2.style.display = 'inline-flex';
      b2.addEventListener('click', () => use(i));
    }
  }
  function use(i) {
    const it = data[i];
    if (!it || !it.usable || !G.gameplay?.useItem) return;
    let ok = false;
    try { ok = !!G.gameplay.useItem(it.id); } catch (e) { G.reportError('ui:useItem', e); }
    sfx(ok ? 'ui_confirm' : 'ui_cancel_soft', 0.5);
    render();
  }
  function render() {
    data = gather();
    clear(box); clear(D);
    if (!data.length) { cells = []; emptyState(D, 'ui.items.empty', 'ui.items.emptySub'); return; }
    const g = el('div', 'it-grid', box);
    cells = data.map((it, i) => {
      const c = el('div', 'it-cell', g);
      icon(it.icon || it.id, '', c);
      el('div', 'nm', c, it.name || '');
      if (it.count !== undefined) el('span', 'n', c, t('ui.items.count', { n: it.count }));
      c.addEventListener('mouseenter', () => setSel(i, true));
      return c;
    });
    setSel(Math.min(sel, cells.length - 1), false, true);
  }
  function setSel(i, mouse, quiet) {
    if (!cells.length) return;
    i = Math.max(0, Math.min(cells.length - 1, i));
    if (i !== sel && !quiet) sfx('ui_move', 0.45);
    sel = i;
    cells.forEach((c, j) => c.classList.toggle('sel', j === i));
    detail(i);
  }
  return {
    el: R, render, show: render,
    keys() { if (K.L) setSel(sel - 1); if (K.R) setSel(sel + 1); if (K.U) setSel(sel - 4); if (K.D) setSel(sel + 4); if (K.confirm(false)) use(sel); },
    hints: (h) => hint(h, 'ui.menu.hintMove', { up: '↑ ↓', down: '← →' }),
  };
}

function hint(parent, k, caps) { const s = el('span', '', parent); hintLine(s, k, caps); return s; }

// ---- the scroll ------------------------------------------------------------------------------------------
export function createMenu(host, stage, providers) {
  let M = null;   // built lazily on first open
  let openedAt = 0;
  let cur = 'map', open = false, focusFoot = false, footSel = 0, quitting = false;
  const panes = {};
  let tabsEl = {}, sheet, info, sub, hintEl, footBtns = [];

  function build() {
    M = el('div', 'modal mv-menu', host);
    sheet = el('div', 'mv-paper', M); el('div', 'bg', sheet);
    const top = el('div', 'mn-top', sheet);
    const left = el('div', 'mn-side', top);
    tel('span', 'seal', left, 'ui.seal.paused');
    info = el('div', 'mn-info', left);
    const tabs = el('div', 'mn-tabs', top);
    const kq = keycap('Q', tabs, 'sm');
    el('div', 'mn-side', top);
    for (const id of TABS) {
      const b = el('div', 'mn-tab', tabs);
      icon(TAB_ICON[id], '', b); tel('span', '', b, 'ui.menu.tabs.' + id);
      b.addEventListener('click', () => select(id));
      tabsEl[id] = b;
    }
    const ke = keycap('E', tabs, 'sm');
    kq.style.pointerEvents = ke.style.pointerEvents = 'auto'; kq.style.cursor = ke.style.cursor = 'pointer';
    kq.addEventListener('click', () => step(-1)); ke.addEventListener('click', () => step(1));
    // touch: a close mark in the corner (the footer's "back to the journey" does the same)
    const xb = el('div', 'mv-x mn-close', sheet);
    xb.addEventListener('click', () => close(true));
    sub = el('div', 'mn-sub', sheet);
    const body = el('div', 'mn-body', sheet);
    const pane = (id) => el('div', 'mn-pane', body);
    panes.map = { el: pane('map') }; panes.map.view = createMapTab(panes.map.el, providers);
    panes.journal = { el: pane('journal') }; panes.journal.view = createJournal(panes.journal.el, providers);
    panes.spells = { el: pane('spells') }; panes.spells.view = createSpells(panes.spells.el, providers);
    panes.items = { el: pane('items') }; panes.items.view = createItems(panes.items.el, providers);
    panes.wardrobe = { el: pane('wardrobe') }; panes.wardrobe.view = createWardrobe(panes.wardrobe.el);   // 衣装 (src/ui/wardrobe.js)
    panes.settings = { el: pane('settings') };
    const sw = el('div', 'scroll', panes.settings.el); sw.style.cssText = 'position:absolute;inset:0;';
    panes.settings.view = createSettings(sw);
    const foot = el('div', 'mn-foot', sheet);
    hintEl = el('div', 'mn-hint', foot);
    const bR = el('div', 'btn', foot); icon('resume', '', bR); tel('span', '', bR, 'ui.menu.resume');
    const bQ = el('div', 'btn red', foot); icon('quit', '', bQ); tel('span', '', bQ, 'ui.menu.quit');
    bR.addEventListener('click', () => close(true));
    bQ.addEventListener('click', () => quit());
    footBtns = [bR, bQ];
    footBtns.forEach((b, i) => b.addEventListener('mouseenter', () => { if (focusFoot) { footSel = i; markFoot(); } }));
    M.addEventListener('mousedown', (e) => { if (e.target === M) close(true); });
  }

  function markFoot() { footBtns.forEach((b, i) => b.classList.toggle('sel', focusFoot && i === footSel)); }

  function paintInfo() {
    clear(info);
    const env = G.env || {};
    el('b', '', info, env.region && has('world.place.' + env.region) ? t('world.place.' + env.region) : t('world.name'));
    tel('span', '', info, 'ui.menu.played', { time: fmtTime(G.state && G.state.playTime) });
  }
  function paintHints() {
    clear(hintEl);
    hint(hintEl, 'ui.menu.hintTabs', { prev: 'Q', next: 'E' });
    panes[cur]?.view?.hints?.(hintEl);
    if (cur === 'settings') hint(hintEl, 'ui.menu.hintAdjust', { left: '←', right: '→' });
    hint(hintEl, 'ui.menu.hintFoot', { key: codeLabel('Tab') });
    hint(hintEl, 'ui.menu.hintClose', { key: codeLabel('Escape') });
  }

  function select(id, quiet) {
    if (!panes[id]) return;
    if (id !== cur && !quiet) sfx('ui_page', 0.7);
    cur = id;
    for (const k of TABS) { tabsEl[k].classList.toggle('on', k === id); panes[k].el.classList.toggle('on', k === id); }
    sub.textContent = t('ui.menu.sub.' + id);
    focusFoot = false; markFoot();
    try { panes[id].view.show ? panes[id].view.show() : panes[id].view.render?.(); } catch (e) { G.reportError('ui:menu:' + id, e); }
    paintHints();
  }
  function step(d) { select(TABS[(TABS.indexOf(cur) + d + TABS.length) % TABS.length]); }

  function openMenu(tab) {
    if (quitting) return;
    if (!M) build();
    if (tab && !TABS.includes(tab)) tab = null;
    if (open) { select(tab || cur); return; }
    open = true;
    openedAt = performance.now();
    enterMenuMode();
    G.ui?.prompt?.(null);
    pushModal(modal);
    paintInfo();
    select(tab || cur, true);
    M.classList.add('on');
    sfx('ui_open', 0.7);
  }
  function close(gesture) {
    if (!open) return;
    open = false;
    popModal(modal);
    M.classList.remove('on');
    sfx('ui_close', 0.6);
    leaveMenuMode(gesture);
  }
  async function quit() {
    if (quitting) return;
    const ok = await confirmBox(host, { title: t('ui.menu.quitTitle'), text: t('ui.menu.quitText'), yes: t('ui.menu.quitYes'), no: t('ui.menu.quitNo'), seal: t('ui.seal.paused') });
    if (!ok) return;
    quitting = true;
    try { G.save?.write(); } catch (e) { G.reportError('ui:quit', e); }
    await stage.fade(1, 0.7, '#07060e');
    UI.reload();
  }

  const modal = {
    el: null,
    relabel() { if (open) { paintInfo(); select(cur, true); } else for (const k of TABS) panes[k]?.view?.render?.(); },
    update(rdt) {
      if (cur === 'map') panes.map.view.update(rdt);
      const inp = G.input;
      // the Esc that released the pointer (and opened us) must not close us again
      if (performance.now() - openedAt < 180) { K.eat(); return; }
      // a key being chosen in the settings takes every key (M / J / B / Q / E / Tab / Esc included)
      if (cur === 'settings' && panes.settings?.view?.capturing) { panes.settings.view.keys(); K.eat(); return; }
      // hotkeys: the key of the open tab closes, another opens its tab
      const hk = inp.pressed('map') ? 'map' : inp.pressed('journal') ? 'journal' : inp.pressed('spellbook') ? 'spells' : null;
      if (hk) { if (hk === cur) close(true); else select(hk); K.eat(); return; }
      if (K.cancel() || (inp.pressed('pause') && !K.code('Escape'))) { close(true); K.eat(); return; }
      if (K.code('KeyQ')) step(-1);
      else if (K.code('KeyE')) step(1);
      else if (K.code('Tab')) { focusFoot = !focusFoot; footSel = 0; markFoot(); sfx('ui_move', 0.45); }
      else if (focusFoot) {
        if (K.L || K.U) { footSel = 0; markFoot(); }
        if (K.R || K.D) { footSel = 1; markFoot(); }
        if (K.confirm(false)) { if (footSel === 0) close(true); else quit(); }
      } else panes[cur].view.keys?.();
      K.eat();
    },
  };

  return {
    open: openMenu, close,
    get isOpen() { return open; },
    get tab() { return cur; },
    /** repaint the map (background progressive painting is driven from ui.js) */
    refresh() { if (open) select(cur, true); },
  };
}
