// say(): the dialogue box. Name plate, optional portrait, typewriter text, choices. E / Space / Enter / click advance.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { UI, K, el, clear, paper, setText, layoutFlag, sfx, noteSelfUnlock } from './dom.js';
import { icon, hasIcon } from './icons.js';
import { addCss } from './style.js';

addCss(`
.mv-dlg { opacity: 0; visibility: hidden; transition: opacity .2s, visibility 0s .2s; }
.mv-dlg.on { opacity: 1; visibility: visible; transition: opacity .2s; }
.dlg-box { position: absolute !important; left: 50%; bottom: 38u; width: 800u; margin-left: -400u; min-height: 138u; padding: 30u 44u 26u 44u; pointer-events: auto; cursor: pointer;
  transform: translateY(14u); transition: transform .28s cubic-bezier(.2,.8,.2,1); }
.mv-dlg.on .dlg-box { transform: none; }
.dlg-box::after { content: ''; position: absolute; left: 14u; right: 14u; top: 9u; bottom: 9u; border: 1u solid var(--gold); opacity: .55; pointer-events: none; }
.dlg-box.has-port { padding-left: 176u; }
.dlg-box.has-port.right { padding-left: 44u; padding-right: 176u; }
.dlg-name { position: absolute !important; left: 38u; top: -17u; height: 34u; padding: 0 20u; background: var(--red); color: #fff6e6; font: 700 18u/34u var(--ft); letter-spacing: .24em; text-indent: .24em;
  box-shadow: inset 0 0 0 1.5u rgba(255,240,215,.6), inset 0 0 0 3.5u var(--red), 0 3u 8u rgba(0,0,0,.35); white-space: nowrap; z-index: 2; }
.dlg-name::before { content: ''; position: absolute; left: -5u; top: 50%; width: 9u; height: 9u; margin-top: -4.5u; background: var(--gold); transform: rotate(45deg); box-shadow: 0 0 0 1.5u var(--ink); }
.dlg-box.right .dlg-name { left: auto; right: 38u; }
.dlg-box.has-port .dlg-name { left: 164u; }
.dlg-box.has-port.right .dlg-name { left: auto; right: 164u; }
.dlg-port { position: absolute !important; left: 30u; bottom: 20u; width: 128u; height: 148u; display: none; align-items: center; justify-content: center; overflow: hidden;
  background: linear-gradient(180deg, var(--indigo2), var(--indigo)); box-shadow: 0 0 0 1.5u var(--gold), 0 0 0 5u var(--ink), 0 6u 14u rgba(0,0,0,.45); color: var(--gold2); z-index: 1; }
.dlg-box.right .dlg-port { left: auto; right: 30u; }
.dlg-box.has-port .dlg-port { display: flex; }
.dlg-port::before { content: ''; position: absolute; inset: 0; background-image: var(--tex-wave); opacity: .9; }
.dlg-port img, .dlg-port canvas { position: relative; width: 100%; height: 100%; object-fit: cover; display: block; }
.dlg-port .ic { position: relative; font-size: 74u; }
.dlg-port .ic.glyph { font-size: 78u; line-height: 1; }
.dlg-text { font: 500 19u/1.8 var(--fb); letter-spacing: .05em; color: var(--ink); white-space: pre-wrap; min-height: 68u; }
.dlg-text .rest { opacity: 0; }
.dlg-next { position: absolute !important; right: 32u; bottom: 18u; width: 0; height: 0; border: 7u solid transparent; border-bottom: 0; border-top: 10u solid var(--red); opacity: 0; }
.dlg-box.has-port.right .dlg-next { right: 172u; }
.dlg-box.done .dlg-next { opacity: 1; animation: mv-bob .9s ease-in-out infinite; }
.dlg-box.choosing .dlg-next { opacity: 0; animation: none; }

.dlg-choices { position: absolute; right: calc(50% - 400u); bottom: 196u; display: flex; flex-direction: column; align-items: flex-end; gap: 9u; }
.dlg-choices.left { right: auto; left: calc(50% - 400u); align-items: flex-start; }
.dlg-ch { position: relative; display: flex; align-items: center; gap: 12u; min-width: 280u; max-width: 520u; padding: 9u 26u 9u 14u; color: var(--ink); font: 600 17u/1.5 var(--fb); letter-spacing: .06em;
  pointer-events: auto; cursor: pointer; filter: drop-shadow(0 4u 9u rgba(0,0,0,.45)); transition: transform .16s cubic-bezier(.2,.8,.2,1); animation: dlg-ch-in .3s cubic-bezier(.2,.8,.2,1) both; }
.dlg-ch::before { content: ''; position: absolute; inset: 0; background-color: var(--paper); background-image: var(--tex-paper); background-size: 256u 256u; background-blend-mode: multiply;
  -webkit-mask: var(--mk-deckle) center / 100% 100% no-repeat; mask: var(--mk-deckle) center / 100% 100% no-repeat; transition: background-color .16s; }
.dlg-ch > * { position: relative; }
.dlg-ch .n { width: 24u; height: 24u; border-radius: 50%; box-shadow: inset 0 0 0 1.2u var(--ink2); font: 700 13u/24u var(--fb); text-align: center; color: var(--ink2); flex: none; transition: all .16s; }
.dlg-ch.sel { transform: translateX(-12u); }
.dlg-choices.left .dlg-ch.sel { transform: translateX(12u); }
.dlg-ch.sel::before { background-color: #fff8e8; }
.dlg-ch.sel .n { background: var(--red); color: #fff6e6; box-shadow: none; }
.dlg-ch.sel::after { content: ''; position: absolute; left: 6u; right: 6u; bottom: 3u; height: 2u; background: var(--red); opacity: .85; }
@keyframes dlg-ch-in { from { opacity: 0; transform: translateX(26u); } }
/* clear of the home bar; on small screens the box fits the width and sits lower, choices are fingertip-sized */
.mv-ui .dlg-box { bottom: calc(38u + env(safe-area-inset-bottom, 0px)); }
.mv-ui.compact .dlg-box { --dw: min(800u, calc(100vw - 28px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  width: var(--dw); margin-left: calc(var(--dw) / -2); bottom: calc(12u + env(safe-area-inset-bottom, 0px)); min-height: 112u; padding: 24u 34u 18u; }
.mv-ui.compact .dlg-box.has-port { padding-left: 132u; }
.mv-ui.compact .dlg-box.has-port.right { padding-left: 34u; padding-right: 132u; }
.mv-ui.compact .dlg-port { left: 22u; bottom: 16u; width: 96u; height: 112u; }
.mv-ui.compact .dlg-box.right .dlg-port { left: auto; right: 22u; }
.mv-ui.compact .dlg-box.has-port .dlg-name { left: 120u; }
.mv-ui.compact .dlg-box.has-port.right .dlg-name { left: auto; right: 120u; }
.mv-ui.compact .dlg-text { min-height: 56u; }
.mv-ui.compact .dlg-choices { right: calc(50% - var(--dw2, 400u)); bottom: calc(146u + env(safe-area-inset-bottom, 0px));
  --dw2: min(400u, calc(50vw - 14px - env(safe-area-inset-right, 0px))); }
.mv-ui.compact .dlg-choices.left { right: auto; left: calc(50% - var(--dw2, 400u)); }
.mv-ui.touch .dlg-ch { min-height: 44px; padding: 10u 26u 10u 14u; }
.mv-ui.touch .dlg-ch .n { width: 26u; height: 26u; line-height: 26u; }
`);

export function createDialogue(root) {
  const R = el('div', 'layer mv-dlg', root);
  const choicesEl = el('div', 'dlg-choices', R);
  const box = paper('dlg-box', R);
  const port = el('div', 'dlg-port', box);
  const plate = el('div', 'dlg-name', box);
  const text = el('div', 'dlg-text', box);
  const shown = el('span', '', text), rest = el('span', 'rest', text);
  el('i', 'dlg-next', box);

  let cur = null;           // { chars, n, acc, done, choices, sel, resolve, t }
  let ownMode = false, releaseAt = -1, hideAt = -1;
  let visible = false;

  function setPortrait(p, name) {
    clear(port);
    let on = false;
    if (p && typeof p === 'object' && p.nodeType === 1) { port.appendChild(p); on = true; }
    else if (typeof p === 'string' && p) {
      if (/^(data:|blob:|https?:|\.{0,2}\/|assets\/)/.test(p) || /\.(png|jpe?g|webp|svg)$/i.test(p)) { const im = el('img', '', port); im.src = p; im.alt = ''; on = true; }
      else if (hasIcon(p) || Array.from(p).length <= 2) { icon(p, '', port); on = true; }
    } else if (p === true && name) { icon(Array.from(String(name))[0], '', port); on = true; }
    box.classList.toggle('has-port', on);
  }

  function finish(result) {
    if (!cur) return;
    const c = cur;
    cur = null;
    clear(choicesEl);
    box.classList.remove('choosing');
    hideAt = G.time.frame + 2;        // a chained say() in the same breath keeps the box up
    releaseAt = G.time.frame + 2;
    K.eat();
    c.resolve(result);
  }

  function complete() {
    if (!cur || cur.done) return;
    cur.n = cur.chars.length; cur.done = true;
    setText(shown, cur.text); setText(rest, '');
    box.classList.add('done');
    if (cur.choices) showChoices();
  }

  function showChoices() {
    const c = cur;
    clear(choicesEl);
    box.classList.add('choosing');
    c.nodes = c.choices.map((label, i) => {
      const n = el('div', 'dlg-ch', choicesEl);
      n.style.animationDelay = (i * 0.06).toFixed(2) + 's';
      el('span', 'n', n, String(i + 1));
      el('span', '', n, String(label));
      n.addEventListener('mouseenter', () => { if (cur === c && c.sel !== i) { c.sel = i; markSel(); sfx('ui_move', 0.5); } });
      n.addEventListener('click', (e) => { e.stopPropagation(); if (cur === c) { sfx('ui_select'); finish(i); } });
      return n;
    });
    c.sel = 0;
    markSel();
    // the pointer is needed to click a choice
    if (G.input.locked) { noteSelfUnlock(); G.input.exitLock(); }
  }
  function markSel() { const c = cur; if (c && c.nodes) c.nodes.forEach((n, i) => n.classList.toggle('sel', i === c.sel)); }

  function advance() {
    if (!cur) return;
    if (!cur.done) { complete(); return; }
    if (cur.choices) { sfx('ui_select'); finish(cur.sel); return; }
    sfx('ui_page', 0.6);
    finish(undefined);
  }
  box.addEventListener('click', () => { if (cur && G.time.real - cur.t > 0.12) advance(); });

  const api = {
    root: R,
    get active() { return !!cur; },
    /** choices are up (a tap elsewhere must not pick one) */
    get choosing() { return !!(cur && cur.done && cur.choices); },
    /** Show one line. Resolves with the index of the chosen choice, or undefined for a plain line. */
    say(o) {
      if (typeof o === 'string') o = { text: o };
      o = o || {};
      if (cur) { const c = cur; cur = null; clear(choicesEl); c.resolve(undefined); }
      const str = String(o.text ?? '');
      const right = o.side === 'right';
      box.classList.toggle('right', right);
      choicesEl.classList.toggle('left', right);
      box.classList.remove('done', 'choosing');
      plate.style.display = o.name ? '' : 'none';
      setText(plate, o.name ? String(o.name) : '');
      setPortrait(o.portrait, o.name);
      setText(shown, ''); setText(rest, str);
      hideAt = -1; releaseAt = -1;
      if (!visible) { visible = true; R.classList.add('on'); sfx('ui_open', 0.5); }
      if (G.mode === 'play') { ownMode = true; G.setMode('talk'); }
      return new Promise((resolve) => {
        cur = { text: str, chars: Array.from(str), n: 0, acc: 0, wait: 0, done: false, resolve, t: G.time.real, sel: 0, nodes: null,
          choices: Array.isArray(o.choices) && o.choices.length ? o.choices : null };
        if (!cur.chars.length) complete();
      });
    },
    /** Drop the box at once (scene change, game over). Pending promises resolve with undefined. */
    cancel() { if (cur) finish(undefined); hideAt = 0; },

    update(rdt) {
      const frame = G.time.frame;
      if (!cur) {
        if (visible && hideAt >= 0 && frame >= hideAt) { visible = false; hideAt = -1; R.classList.remove('on'); }
        if (ownMode && releaseAt >= 0 && frame >= releaseAt) {
          ownMode = false; releaseAt = -1;
          if (G.mode === 'talk') { G.setMode('play'); if (!G.input.locked) G.input.requestLock(); }
        }
        return;
      }
      const c = cur;
      // typewriter
      if (!c.done) {
        if (c.wait > 0) c.wait -= rdt;
        else {
          c.acc += rdt * (layoutFlag('typeSpeed', 34) || 34);
          let moved = false;
          const pauses = layoutFlag('pauseChars', '');
          while (c.acc >= 1 && c.n < c.chars.length) {
            c.acc -= 1; c.n++; moved = true;
            if (pauses.includes(c.chars[c.n - 1]) && c.n < c.chars.length) { c.wait = 0.13; c.acc = 0; break; }
          }
          if (moved) {
            if (c.n >= c.chars.length) complete();
            else {
              setText(shown, c.chars.slice(0, c.n).join(''));
              setText(rest, c.chars.slice(c.n).join(''));
              if ((c.n & 3) === 1) sfx('ui_text', 0.35);
            }
          }
        }
      }
      // input (ignored for a blink after the line appears, so the key that opened it does not skip it)
      if (G.time.real - c.t < 0.12 || UI.modals.length) return;
      if (c.done && c.choices && c.nodes) {
        const n = c.choices.length;
        if (K.U) { c.sel = (c.sel + n - 1) % n; markSel(); sfx('ui_move', 0.5); }
        if (K.D) { c.sel = (c.sel + 1) % n; markSel(); sfx('ui_move', 0.5); }
        for (let i = 0; i < Math.min(n, 9); i++) if (K.code('Digit' + (i + 1)) || K.code('Numpad' + (i + 1))) { c.sel = i; markSel(); sfx('ui_select'); finish(i); return; }
        if (K.confirm()) { advance(); return; }
        K.eat();
        return;
      }
      if (G.input.pressed('confirm')) advance();
      K.eat();
    },
  };
  return api;
}
