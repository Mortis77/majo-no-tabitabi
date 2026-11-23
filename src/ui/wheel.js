// The 灵诀 wheel: hold the 'wheel' action, flick the mouse toward one of the eight elements, release to select.
// The world keeps running in slow motion underneath. Mode stays 'play'; while the wheel is up it swallows the look input
// (the UI updates before the player) so the camera holds still.
// Touch (src/ui/touch.js): holding the swap orb opens it; a flick from the orb chooses on release, otherwise it stays
// open and a slot is tapped (a tap on the empty ring closes it).
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { UI, el, clear, key, keycap, setText, sfx } from './dom.js';
import { icon, setIcon } from './icons.js';
import { addCss } from './style.js';
import { spellSlots, selectedId, selectSpell } from './model.js';

const R_SLOT = 182;   // design px from the centre to a slot

addCss(`
.mv-wheel { opacity: 0; visibility: hidden; transition: opacity .14s, visibility 0s .14s; background: radial-gradient(circle at 50% 50%, rgba(6,10,24,.5) 0%, rgba(6,10,24,.62) 38%, rgba(6,10,24,.3) 100%); }
.mv-wheel.on { opacity: 1; visibility: visible; transition: opacity .14s; }
.wh-disc { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transform: scale(calc(var(--whs, 1) * .86)) rotate(-10deg); transition: transform .26s cubic-bezier(.2,.9,.2,1.25); }
.mv-wheel.on .wh-disc { transform: scale(var(--whs, 1)); }
/* a night-glass ring with brass hairlines and the astrolabe round it */
.wh-ring { position: absolute; left: -256u; top: -256u; width: 512u; height: 512u; border-radius: 50%;
  background: radial-gradient(circle, rgba(10,15,32,.3) 0, rgba(10,15,32,.3) 39.5%, rgba(14,20,42,.84) 40%, rgba(22,30,58,.88) 72%, rgba(12,18,38,.6) 99%, rgba(12,18,38,0) 100%);
  box-shadow: inset 0 0 0 1.2u rgba(236,217,164,.45); }
.wh-ring::before { content: ''; position: absolute; inset: 153u; border-radius: 50%; box-shadow: 0 0 0 1.2u rgba(236,217,164,.5), 0 0 24u rgba(236,217,164,.12); }
.wh-ring::after { content: ''; position: absolute; inset: -24u; background: var(--brass2); opacity: .5; -webkit-mask: var(--mk-astro) center / contain no-repeat; mask: var(--mk-astro) center / contain no-repeat; }
.wh-needle { position: absolute; left: -9u; top: -126u; width: 18u; height: 126u; transform-origin: 50% 100%; opacity: 0; transition: opacity .12s; will-change: transform; }
.wh-needle::before { content: ''; position: absolute; left: 0; top: 0; width: 18u; height: 18u; background: var(--brass2); filter: drop-shadow(0 0 5u rgba(236,217,164,.8));
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.wh-needle.on { opacity: 1; }
.wh-slot { position: absolute; width: 78u; height: 78u; margin: -39u; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 38u; color: var(--sc);
  background: radial-gradient(circle at 50% 32%, rgba(50,68,116,.96), rgba(12,18,36,.96) 74%); box-shadow: inset 0 0 0 1.2u var(--hair), 0 4u 12u rgba(0,0,0,.5);
  transition: transform .14s cubic-bezier(.2,.8,.2,1.4), box-shadow .14s; }
.wh-slot .ic { filter: drop-shadow(0 0 6u var(--sc)); }
.wh-slot .nm { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 6u; white-space: nowrap; font: 600 14u/1.3 var(--fd); letter-spacing: .12em; margin-right: -.12em; color: var(--star);
  text-shadow: var(--halo); }
.wh-slot .num { position: absolute; left: -4u; top: -4u; }
.wh-slot .lk { position: absolute; right: -4u; bottom: -2u; width: 26u; height: 26u; border-radius: 50%; background: radial-gradient(circle at 50% 34%, #2a3a64, #0d1328 75%); color: var(--brass2); display: none; align-items: center; justify-content: center; font-size: 13u;
  box-shadow: 0 0 0 1u var(--hair2); }
.wh-slot.locked { color: #6f7590; }
.wh-slot.locked .ic { filter: none; opacity: .55; }
.wh-slot.locked .lk { display: flex; }
.wh-slot.locked .lk .ic { opacity: 1; }
.wh-slot.locked .nm { color: #a9adbf; font-weight: 500; }
.wh-slot.cur { box-shadow: inset 0 0 0 2u var(--brass2), 0 4u 12u rgba(0,0,0,.5); }
.wh-slot.hov { transform: scale(1.18); box-shadow: inset 0 0 0 2u var(--sc), 0 0 22u 2u color-mix(in srgb, var(--sc) 70%, transparent), 0 4u 12u rgba(0,0,0,.5); }
.wh-slot.hov.locked { box-shadow: inset 0 0 0 2u #8d90a8, 0 4u 12u rgba(0,0,0,.5); }
.wh-slot.hov .nm { color: var(--brass2); }
.wh-mid { position: absolute; left: -96u; top: -96u; width: 192u; height: 192u; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.wh-mid .gl { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-52%); font: 700 140u/1 var(--fd); color: var(--sc, #fff); opacity: .1; }
.wh-mid .kick { position: relative; font: 600 11.5u/1.4 var(--fd); letter-spacing: .32em; margin-right: -.32em; color: var(--brass2); }
.wh-mid .nm { position: relative; font: 600 30u/1.25 var(--fd); letter-spacing: .12em; margin-right: -.12em; color: #fffaf0; text-shadow: 0 2u 6u rgba(0,0,0,.9); }
.wh-mid .ds { position: relative; margin-top: 4u; font: 400 13.5u/1.5 var(--fb); letter-spacing: .04em; color: var(--star); max-width: 180u; }
.wh-mid .ds .ic { color: #a9cfff; font-size: 13u; margin: 0 2u 0 6u; }
.wh-mid .ds b { font-family: var(--fd); color: #a9cfff; font-weight: 600; }
.wh-hint { position: absolute; left: 0; right: 0; top: calc(50% + 292u * var(--whs, 1)); text-align: center; font: 400 14u/22u var(--fb); letter-spacing: .1em; color: var(--star); text-shadow: var(--halo); }
.wh-hint .keycap { margin: 0 6u; }
.mv-wheel.touch { pointer-events: auto; touch-action: none; }
.mv-wheel.touch .wh-slot { pointer-events: auto; cursor: pointer; }
.mv-wheel.touch .wh-slot .num { display: none; }
`);

export function createWheel(root) {
  const R = el('div', 'layer mv-wheel', root);
  const disc = el('div', 'wh-disc', R);
  el('div', 'wh-ring', disc);
  const needle = el('i', 'wh-needle', disc);
  const mid = el('div', 'wh-mid', disc);
  const midGl = el('div', 'gl', mid), midKick = el('div', 'kick', mid), midNm = el('div', 'nm', mid), midDs = el('div', 'ds', mid);
  const hint = el('div', 'wh-hint', R);
  const slotEls = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const n = el('div', 'wh-slot', disc);
    n.style.left = `calc(var(--u)*${(Math.sin(a) * R_SLOT).toFixed(1)})`;
    n.style.top = `calc(var(--u)*${(-Math.cos(a) * R_SLOT).toFixed(1)})`;
    const ic = icon('lock', '', n);
    const nm = el('span', 'nm', n);
    keycap(String(i + 1), n, 'sm dark num');
    const lk = el('span', 'lk', n);
    icon('lock', '', lk);
    slotEls.push({ n, ic, nm });
    n.addEventListener('click', (e) => { if (!touchOpen) return; e.stopPropagation(); setHover(i); touchOpen = false; closeWheel(true); });
  }
  R.addEventListener('click', () => { if (touchOpen) { touchOpen = false; closeWheel(false); sfx('ui_close', 0.5); } });

  let open = false, hover = -1, vx = 0, vy = 0, prevScale = 1, shownKey = '', touchOpen = false;

  function fill() {
    const slots = spellSlots(true);
    const sel = selectedId();
    for (let i = 0; i < 8; i++) {
      const s = slots[i], e = slotEls[i];
      setIcon(e.ic, s.id);
      e.n.style.setProperty('--sc', s.color);
      e.n.classList.toggle('locked', s.level <= 0);
      e.n.classList.toggle('cur', s.id === sel && s.level > 0);
      setText(e.nm, s.level > 0 ? s.name : t('core.element.' + s.id));
    }
    clear(hint);
    if (touchOpen) { el('span', '', hint, t('ui.touch.wheelHint')); return; }
    const parts = t('ui.wheel.hint', { key: '\u0001' }).split('\u0001');
    if (parts[0]) el('span', '', hint, parts[0]);
    keycap(key('wheel'), hint, 'sm');
    if (parts[1]) el('span', '', hint, parts[1]);
  }

  function showMid(i) {
    const slots = spellSlots();
    const idx = i >= 0 ? i : slots.findIndex((s) => s.id === selectedId());
    const s = idx >= 0 ? slots[idx] : null;
    const k = `${idx}|${i >= 0}`;
    if (k === shownKey) return;
    shownKey = k;
    clear(midDs);
    if (!s) { setText(midGl, ''); setText(midKick, ''); setText(midNm, t('ui.wheel.title')); return; }
    mid.style.setProperty('--sc', s.color);
    setText(midGl, has('ui.glyph.' + s.id) ? t('ui.glyph.' + s.id) : '');
    if (s.level <= 0) {
      setText(midKick, t('ui.wheel.locked'));
      setText(midNm, t('core.element.' + s.id));
      el('span', '', midDs, t('ui.wheel.lockedDesc'));
      return;
    }
    setText(midKick, i < 0 ? t('ui.wheel.current') : t('core.element.' + s.id));
    setText(midNm, s.name);
    const form = (label, cost) => {
      el('span', '', midDs, label);
      if (cost > 0) { icon('spirit', '', midDs); el('b', '', midDs, String(cost)); }
    };
    form(s.small || t('ui.wheel.small'), s.cost);
    if (s.level > 1) { el('br', '', midDs); form(s.big || t('ui.wheel.big'), s.costBig); }
  }

  function setHover(i) {
    if (i === hover) return;
    if (hover >= 0) slotEls[hover].n.classList.remove('hov');
    hover = i;
    if (i >= 0) { slotEls[i].n.classList.add('hov'); sfx('ui_move', 0.5); }
    needle.classList.toggle('on', i >= 0);
    if (i >= 0) needle.style.transform = `rotate(${i * 45}deg)`;
    showMid(i);
  }

  function openWheel() {
    open = true; vx = vy = 0; shownKey = '';
    fill();
    setHover(-1);
    showMid(-1);
    // a short screen (a phone held sideways) gets a smaller wheel: names and the hint stay on screen
    R.style.setProperty('--whs', Math.min(1, (UI.h - 16) / (600 * UI.u)).toFixed(3));
    prevScale = G.time.scale;
    G.time.scale = Math.min(prevScale, 0.12);
    R.classList.toggle('touch', touchOpen);
    R.classList.add('on');
    sfx('ui_open', 0.6);
  }
  function closeWheel(commit) {
    open = false; touchOpen = false;
    R.classList.remove('touch');
    if (G.time.scale <= 0.1201) G.time.scale = prevScale || 1;
    R.classList.remove('on');
    if (commit && hover >= 0) {
      const s = spellSlots()[hover];
      if (s.level > 0) { if (s.id !== selectedId()) selectSpell(s.id); sfx('ui_select'); }
      else sfx('ui_error', 0.6);
    }
  }

  return {
    get open() { return open; },
    /** opened by the touch swap orb (stays up until a slot or the empty ring is tapped) */
    get touchOpen() { return open && touchOpen; },
    refresh() { if (open) { fill(); shownKey = ''; showMid(hover); } },
    close() { if (open) closeWheel(false); },
    /** touch: open the wheel (true if it is up now) */
    openTouch() {
      if (open) return touchOpen;
      if (G.mode !== 'play' || UI.modals.length) return false;
      touchOpen = true; openWheel();
      return true;
    },
    /** touch: the orb's finger moved by (dx, dy) px — steers the needle like the mouse does */
    touchVec(dx, dy) {
      if (!open || !touchOpen) return;
      const lim = 150 * UI.u;
      vx += dx; vy += dy;
      const l = Math.hypot(vx, vy);
      if (l > lim) { vx *= lim / l; vy *= lim / l; }
    },
    /** touch: the orb's finger lifted. A flick (commit) chooses the slot under the needle; otherwise the wheel stays for a tap. */
    touchRelease(commit) {
      if (!open || !touchOpen) return;
      if (commit && hover >= 0) { touchOpen = false; closeWheel(true); }
    },
    update() {
      const inp = G.input;
      const want = G.mode === 'play' && (inp.held('wheel') || touchOpen) && UI.modals.length === 0;
      if (want && !open) openWheel();
      else if (!want && open) closeWheel(G.mode === 'play');
      if (!open) return;
      // direction: with a captured pointer we integrate its motion, otherwise we read where the cursor is
      const lim = 150 * UI.u;
      if (touchOpen) { /* the orb's finger steers through touchVec(); other fingers do not */ }
      else if (inp.locked || inp.lookX !== 0 || inp.lookY !== 0) {
        vx += inp.lookX; vy += inp.lookY;
        const l = Math.hypot(vx, vy);
        if (l > lim) { vx *= lim / l; vy *= lim / l; }
      } else if (UI.mouse.moved) { vx = UI.mouse.x - UI.w / 2; vy = UI.mouse.y - UI.h / 2; }
      inp.lookX = 0; inp.lookY = 0;              // the camera stays put while choosing
      let h = hover;
      if (Math.hypot(vx, vy) > 34 * UI.u) {
        const a = Math.atan2(vx, -vy);
        h = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
      }
      for (let i = 0; i < 8; i++) if (inp.pressed('el' + (i + 1))) { h = i; vx = Math.sin(i * Math.PI / 4) * lim * 0.6; vy = -Math.cos(i * Math.PI / 4) * lim * 0.6; }
      setHover(h);
      inp.consume('attack'); inp.consume('cast');
    },
  };
}
