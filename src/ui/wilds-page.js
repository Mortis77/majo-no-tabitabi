// 旅途见闻: the fourth journal page (menu.js calls wildsEntries / wildsCount / wildsRow / wildsDetail).
// Reads G.wilds.journal() (src/gameplay/wilds.js): the stray stars and the careless witch's note, one entry per region
// (places found, stars, chests), the ring courses. Words: src/locales/zh-CN/gameplay.wilds.js (page.*).
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { addCss } from './style.js';

const tt = (k, p) => t('gameplay.wilds.' + k, p);

addCss(`
/* four journal sub-tabs: on touch (wider tabs) let the fourth wrap rather than run off the list */
.mv-ui.touch .mn-subtabs { flex-wrap: wrap; row-gap: 4u; }
.wd-row .ic { font-size: 15u; color: #b9c8ff; flex: none; }
.wd-row.reg .ic { color: #c8a878; }
.wd-row.rc .ic { color: #ffd27a; }
.wd-det .stat { display: flex; flex-wrap: wrap; gap: 6u 14u; margin-top: 10u; font: 700 15u/1.4 var(--ft); color: var(--ink); letter-spacing: .1em; }
.wd-det .stat span { white-space: nowrap; }
.wd-det .line { margin-top: 8u; font: 400 15u/1.7 var(--ft); color: var(--ink); letter-spacing: .06em; }
.wd-det .line.dim { color: var(--ink3); }
.wd-det .places { display: flex; flex-wrap: wrap; gap: 4u 10u; margin-top: 8u; }
.wd-det .places span { font: 400 14u/1.6 var(--ft); color: var(--ink); }
.wd-det .places span.large { font-weight: 700; }
.wd-det .rc { margin-top: 12u; }
.wd-det .rc .nm { font: 700 16u/1.4 var(--ft); color: var(--ink); letter-spacing: .12em; }
.wd-det .rc .sm { font: 400 13u/1.5 var(--fb); color: var(--ink3); }
`);

function data() { try { return G.wilds?.journal?.() || null; } catch (e) { G.reportError('ui:wilds', e); return null; } }

/** Journal list entries: [{ type: 'stars' | 'region' | 'rings', ... }]. */
export function wildsEntries() {
  const d = data();
  if (!d) return [];
  return [{ type: 'stars', ...d.stars }, ...d.regions.map((r) => ({ type: 'region', ...r })), { type: 'rings', list: d.rings }];
}
/** { n, of } for the sub-tab chip: places found. */
export function wildsCount() {
  const d = data();
  return d ? { n: d.found, of: d.foundOf } : { n: 0, of: 0 };
}
export function wildsRow(row, q) {
  row.classList.add('wd-row');
  if (q.type === 'stars') { icon('star', '', row); el('span', 'tt', row, tt('page.stars')); el('span', 'chip', row, tt('page.starsCount', { n: q.n, of: q.of })); return; }
  if (q.type === 'rings') {
    row.classList.add('rc'); icon('flag', '', row); el('span', 'tt', row, tt('page.rings'));
    const done = q.list.filter((r) => r.best !== null).length;
    el('span', 'chip', row, done + '/' + q.list.length);
    return;
  }
  row.classList.add('reg'); icon('pin', '', row); el('span', 'tt', row, q.name);
  el('span', 'chip' + (q.found ? ' act' : ''), row, q.found + '/' + q.of);
}
export function wildsDetail(D, q) {
  D.classList.add('wd-det');
  if (q.type === 'stars') {
    icon('star', 'ghost', D);
    const k = el('div', 'kick', D); el('span', '', k, tt('page.stars'));
    el('div', 'big', D, tt('page.starsCount', { n: q.n, of: q.of }));
    el('div', 'txt', D, tt('page.starsSub', { step: q.step }));
    el('div', 'line dim', D, q.n >= q.of ? tt('page.starsAll') : tt('page.starsNext', { next: Math.min(q.of, q.next) }));
    el('div', 'rule ink', D);
    el('div', 'obh', D, tt('page.noteHead'));
    if (!q.lines.length) el('div', 'line dim', D, tt('page.noteNone'));
    for (const line of q.lines) el('div', 'line', D, line);
    return;
  }
  if (q.type === 'rings') {
    icon('flag', 'ghost', D);
    const k = el('div', 'kick', D); el('span', '', k, tt('page.rings'));
    el('div', 'big', D, tt('page.rings'));
    el('div', 'txt', D, tt('page.ringsSub'));
    for (const r of q.list) {
      const b = el('div', 'rc', D);
      el('div', 'nm', b, r.name);
      el('div', 'sm', b, tt('page.ringFrom', { from: r.from, len: r.len }));
      el('div', 'sm', b, r.best !== null ? tt('page.ringBest', { t: r.best.toFixed(1), medal: tt('medal.' + (r.medal || 'none')) }) : tt('page.ringNone'));
      el('div', 'sm', b, tt('page.ringMedals', { g: r.medals[0], s: r.medals[1], b: r.medals[2] }));
    }
    return;
  }
  icon('map', 'ghost', D);
  const k = el('div', 'kick', D); el('span', '', k, tt('page.tab'));
  el('div', 'big', D, q.name);
  el('div', 'txt', D, q.desc);
  const s = el('div', 'stat', D);
  el('span', '', s, tt('page.found', { n: q.found, of: q.of }));
  el('span', '', s, tt('page.starsIn', { n: q.stars, of: q.starsOf }));
  if (q.chestsOf) el('span', '', s, tt('page.chests', { n: q.chests, of: q.chestsOf }));
  el('div', 'rule ink', D);
  el('div', 'obh', D, tt('page.places'));
  if (!q.places.length) { el('div', 'line dim', D, tt('page.placesNone')); return; }
  const p = el('div', 'places', D);
  for (const x of q.places) el('span', x.scale === 'large' ? 'large' : '', p, x.name);
}
