// Screen-wide dressing that is not part of the HUD proper: damage vignette + low-life pulse, cinematic bars, fades,
// the region banner, toasts and the little "saved" mark.
import { G } from '../core/game.js';
import { clamp } from '../core/util.js';
import { el, tel, setText, replay, layoutFlag } from './dom.js';
import { icon, hasIcon } from './icons.js';
import { addCss } from './style.js';
import { vitals } from './model.js';

addCss(`
/* ---- vignette ---- */
.mv-vig { opacity: 0; will-change: opacity; }
.mv-vig.hit { background: radial-gradient(ellipse at 50% 50%, rgba(160,20,10,0) 46%, rgba(170,24,12,.42) 78%, rgba(120,8,4,.82) 100%); }
.mv-vig.heal { background: radial-gradient(ellipse at 50% 50%, rgba(255,226,160,0) 55%, rgba(255,226,160,.28) 85%, rgba(255,210,120,.5) 100%); }
.mv-vig.low { background: radial-gradient(ellipse at 50% 50%, rgba(120,8,4,0) 52%, rgba(140,14,8,.3) 82%, rgba(110,6,2,.62) 100%); }
.mv-vig.low.on { animation: vig-low 1.15s ease-in-out infinite; }
@keyframes vig-low { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }

/* ---- letterbox ---- */
.mv-lbox i { position: absolute; left: 0; right: 0; height: 11.5%; background: #05050b; transition: transform .7s cubic-bezier(.3,.7,.2,1); }
.mv-lbox i:first-child { top: 0; transform: translateY(-101%); }
.mv-lbox i:last-child { bottom: 0; transform: translateY(101%); }
.mv-lbox.on i { transform: none; }
.mv-lbox i::after { content: ''; position: absolute; left: 0; right: 0; height: 1u; background: var(--gold); opacity: .35; }
.mv-lbox i:first-child::after { bottom: 0; } .mv-lbox i:last-child::after { top: 0; }

/* ---- fade ---- */
.mv-fade { background: #05060d; opacity: 0; will-change: opacity; }

/* ---- region banner ---- */
.mv-banner { display: flex; flex-direction: column; align-items: center; top: 15%; bottom: auto; opacity: 0; visibility: hidden; }
.mv-banner.on { visibility: visible; animation: ban-in 4.4s both; }
@keyframes ban-in { 0% { opacity: 0; } 9% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
.mv-banner .line { display: flex; align-items: center; gap: 18u; }
.mv-banner .tt { font: 700 50u/1.25 var(--ft); letter-spacing: .34em; margin-right: -.34em; color: #fffaf0;
  text-shadow: 0 2u 4u rgba(6,5,12,.95), 0 0 22u rgba(6,5,12,.7), 0 0 44u rgba(6,5,12,.45); }
.mv-banner.on .tt { animation: ban-tt 4.4s both cubic-bezier(.2,.7,.2,1); }
@keyframes ban-tt { 0% { letter-spacing: .7em; margin-right: -.7em; } 22% { letter-spacing: .34em; margin-right: -.34em; } }
.mv-banner .seal { width: 28u; font-size: 15u; opacity: 0; }
.mv-banner.on .seal { animation: ban-seal 4.4s both; }
@keyframes ban-seal { 0%, 16% { opacity: 0; transform: rotate(-4deg) scale(1.9); } 22% { opacity: 1; transform: rotate(-4deg) scale(.94); } 26%, 100% { opacity: 1; transform: rotate(-4deg) scale(1); } }
.mv-banner .stroke { width: 330u; height: 12u; margin-top: 2u; background: linear-gradient(90deg, var(--red2), var(--red) 60%, #8f2418); transform-origin: 0 50%;
  -webkit-mask: var(--mk-brush3) center / 100% 100% no-repeat; mask: var(--mk-brush3) center / 100% 100% no-repeat; filter: drop-shadow(0 1u 2u rgba(0,0,0,.6)); }
.mv-banner.on .stroke { animation: ban-stroke 4.4s both cubic-bezier(.3,.7,.2,1); }
@keyframes ban-stroke { 0%, 6% { clip-path: inset(0 100% 0 0); } 24%, 100% { clip-path: inset(0 0 0 0); } }
.mv-banner .sub { margin-top: 9u; font: 500 16u/1.4 var(--ft); letter-spacing: .42em; margin-right: -.42em; color: #fff3da; text-shadow: 0 1u 3u rgba(6,5,12,.95), 0 0 12u rgba(6,5,12,.7); }
.mv-banner.on .sub { animation: ban-sub 4.4s both; }
@keyframes ban-sub { 0%, 14% { opacity: 0; transform: translateY(6u); } 28%, 100% { opacity: 1; transform: none; } }

/* ---- toasts ---- */
.mv-toasts { z-index: 8; pointer-events: none; left: 26u; top: 150u; right: auto; bottom: auto; display: flex; flex-direction: column; align-items: flex-start; gap: 8u; }
.mv-toast { position: relative; display: flex; align-items: center; gap: 10u; min-height: 34u; padding: 5u 30u 5u 8u; color: var(--ink); font: 600 14u/1.45 var(--fb); letter-spacing: .06em;
  max-width: 380u; filter: drop-shadow(0 3u 7u rgba(0,0,0,.45)); animation: toast-in .38s cubic-bezier(.2,.8,.2,1) both; }
.mv-toast::before { content: ''; position: absolute; inset: 0; background-color: var(--paper); background-image: var(--tex-paper); background-size: 256u 256u; background-blend-mode: multiply;
  clip-path: polygon(0 0, calc(100% - 15u) 0, 100% 50%, calc(100% - 15u) 100%, 0 100%); }
.mv-toast::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3u; background: var(--red); }
.mv-toast > * { position: relative; }
.mv-toast .dot { width: 24u; height: 24u; border-radius: 50%; background: var(--ink); color: var(--gold2); display: flex; align-items: center; justify-content: center; font-size: 14u; flex: none; margin-left: 4u; }
.mv-toast.out { animation: toast-out .32s ease-in both; }
@keyframes toast-in { from { opacity: 0; transform: translateX(-28u); } }
@keyframes toast-out { to { opacity: 0; transform: translateX(-18u); } }

/* ---- saved mark ---- */
.mv-saved { position: absolute; right: 30u; top: 50%; display: flex; align-items: center; gap: 7u; font: 500 13u/1.4 var(--ft); letter-spacing: .2em; color: var(--paper); opacity: 0;
  text-shadow: 0 1u 3u rgba(6,5,12,.95); }
.mv-saved .ic { font-size: 16u; color: var(--gold2); }
.mv-saved.on { animation: saved 2.6s both; }
@keyframes saved { 0% { opacity: 0; transform: translateX(10u); } 14%, 78% { opacity: 1; transform: none; } 100% { opacity: 0; } }
`);

const MAX_TOASTS = 4;

export function createStage(root, hudRoot) {
  // order of creation = paint order
  const vigLow = el('div', 'layer mv-vig low', root);
  const vigHit = el('div', 'layer mv-vig hit', root);
  const vigHeal = el('div', 'layer mv-vig heal', root);
  root.appendChild(hudRoot);
  const lbox = el('div', 'layer mv-lbox', root);
  el('i', '', lbox); el('i', '', lbox);
  const fadeEl = el('div', 'layer mv-fade', root);
  const banner = el('div', 'layer mv-banner', root);
  const bLine = el('div', 'line', banner);
  const bTitle = el('div', 'tt', bLine);
  const bSeal = el('span', 'seal tall', bLine);
  el('div', 'stroke', banner);
  const bSub = el('div', 'sub', banner);
  const toasts = el('div', 'layer mv-toasts', root);
  const saved = el('div', 'mv-saved', root);
  icon('brush', '', saved);
  tel('span', '', saved, 'ui.hud.saved');

  let hit = 0, heal = 0, lastHp = null, lowOn = false;
  let fade = { a: 0, from: 0, to: 0, t: 0, dur: 0, res: null };
  const live = [];   // { node, left }
  const queue = [];

  function pushToast(text, opts) {
    const node = el('div', 'mv-toast', toasts);
    const ic = opts.icon;
    if (ic) { const d = el('span', 'dot', node); icon(hasIcon(ic) || String(ic).length <= 2 ? ic : 'star', '', d); if (opts.color) d.style.color = opts.color; }
    el('span', '', node, text);
    live.push({ node, left: Math.max(0.8, opts.dur ?? 3), out: false });
  }

  const api = {
    /** A slip of paper on the left edge. Extra toasts wait their turn. */
    toast(text, opts = {}) {
      if (text === undefined || text === null || text === '') return;
      const o = typeof opts === 'object' && opts ? opts : {};
      if (live.length >= MAX_TOASTS) { if (queue.length < 12) queue.push([String(text), o]); return; }
      pushToast(String(text), o);
    },
    /** Big place-name card. banner(null) takes it down at once. opts.seal: two glyphs for the red seal. */
    banner(title, subtitle, opts = {}) {
      if (!title) { banner.classList.remove('on'); return; }
      setText(bTitle, String(title));
      setText(bSub, subtitle ? String(subtitle) : '');
      bSub.style.display = subtitle ? '' : 'none';
      const seal = opts && opts.seal;
      bSeal.style.display = seal ? '' : 'none';
      if (seal) setText(bSeal, String(seal));
      bSeal.classList.toggle('tall', layoutFlag('vertical', true));
      replay(banner, 'on');
    },
    /** Fade the whole picture to `alpha` (1 = covered) over `dur` seconds. Optional colour (default near-black). */
    fade(alpha, dur = 0.5, color) {
      if (fade.res) { const r = fade.res; fade.res = null; r(); }
      if (color) fadeEl.style.background = color; else if (alpha > 0 && fade.a <= 0.001) fadeEl.style.background = '';
      fade.from = fade.a; fade.to = clamp(alpha); fade.t = 0; fade.dur = Math.max(0, dur || 0);
      if (fade.dur === 0) { fade.a = fade.to; fadeEl.style.opacity = String(fade.a); return Promise.resolve(); }
      return new Promise((res) => { fade.res = res; });
    },
    get fadeAlpha() { return fade.a; },
    letterbox(on) { lbox.classList.toggle('on', !!on); },
    get letterboxed() { return lbox.classList.contains('on'); },
    /** red flash at the edges (0..1) */
    hurt(k = 0.6) { hit = Math.max(hit, clamp(k)); },
    saved() { replay(saved, 'on'); },

    update(rdt) {
      // fade tween (runs on real time so it also works while the world is paused)
      if (fade.dur > 0 && fade.a !== fade.to) {
        fade.t += rdt;
        const k = clamp(fade.t / fade.dur);
        fade.a = fade.from + (fade.to - fade.from) * (k * k * (3 - 2 * k));
        if (k >= 1) fade.a = fade.to;
        fadeEl.style.opacity = fade.a.toFixed(3);
        if (k >= 1 && fade.res) { const r = fade.res; fade.res = null; r(); }
      } else if (fade.res) { const r = fade.res; fade.res = null; r(); }

      // vignettes follow the life total: no events needed, so they work whoever deals the damage
      const mode = G.mode;
      const active = mode === 'play' || mode === 'talk' || mode === 'cutscene';
      const v = vitals();
      if (lastHp !== null && active) {
        const d = v.hp - lastHp;
        if (d < -0.5) hit = Math.max(hit, clamp(0.35 + (-d / v.maxHp) * 2.2));
        else if (d > 4) heal = Math.max(heal, 0.8);
      }
      lastHp = v.hp;
      if (hit > 0) { hit = Math.max(0, hit - rdt * 1.5); vigHit.style.opacity = hit.toFixed(3); }
      else if (vigHit._z !== 0) { vigHit._z = 0; vigHit.style.opacity = '0'; }
      if (hit > 0) vigHit._z = 1;
      if (heal > 0) { heal = Math.max(0, heal - rdt * 1.3); vigHeal.style.opacity = heal.toFixed(3); vigHeal._z = 1; }
      else if (vigHeal._z !== 0) { vigHeal._z = 0; vigHeal.style.opacity = '0'; }
      const low = active && v.has && !v.dead && v.hp / v.maxHp < 0.3;
      if (low !== lowOn) { lowOn = low; vigLow.classList.toggle('on', low); if (!low) vigLow.style.opacity = ''; }

      // toasts
      for (let i = live.length - 1; i >= 0; i--) {
        const tt = live[i];
        tt.left -= rdt;
        if (!tt.out && tt.left <= 0) { tt.out = true; tt.left = 0.34; tt.node.classList.add('out'); }
        else if (tt.out && tt.left <= 0) { tt.node.remove(); live.splice(i, 1); }
      }
      if (queue.length && live.length < MAX_TOASTS) { const q = queue.shift(); pushToast(q[0], q[1]); }
      const showT = mode !== 'title' && mode !== 'boot';
      if (toasts._s !== showT) { toasts._s = showT; toasts.style.visibility = showT ? '' : 'hidden'; }
    },
  };
  return api;
}

