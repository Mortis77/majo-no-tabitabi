// Design tokens + the shared pieces of the picture-scroll look: washi sheets, ink plates, seals, key caps, brush buttons.
// Lengths are written as `12u` (px at 1280×720) and compiled to calc(var(--u)*12): the whole UI scales with the window.
import { t } from '../core/i18n.js';
import { UI, compileCss } from './dom.js';
import { paperTexture, brushStroke, deckle, enso, wavePattern } from './icons.js';
import { loadFonts } from '../core/fonts.js';

const BASE = `
.mv-ui { --u: 1px; --ft: serif; --fb: sans-serif; --fs: serif;
  --paper: #f3e9d4; --paper2: #e5d6b6; --paper3: #cdbb95;
  --ink: #231f1d; --ink2: #5b514a; --ink3: #8a7d70;
  --red: #c23b2a; --red2: #e4573c; --gold: #d3ad62; --gold2: #ffe2a0; --indigo: #151a36; --indigo2: #2a356a;
  font-family: var(--fb); font-size: 14u; line-height: 1.5; color: var(--paper); -webkit-font-smoothing: antialiased;
  cursor: default; }
:where(.mv-ui) *, :where(.mv-ui) *::before, :where(.mv-ui) *::after { box-sizing: border-box; }
:where(.mv-ui) .layer { position: absolute; inset: 0; pointer-events: none; }
:where(.mv-ui) .ft { font-family: var(--ft); }
:where(.mv-ui) .wide { letter-spacing: .28em; margin-right: -.28em; }

/* pictograms */
:where(.mv-ui) .ic { display: inline-block; width: 1em; height: 1em; flex: none; font-style: normal; line-height: 1; vertical-align: -.14em; }
:where(.mv-ui) .ic svg { display: block; width: 100%; height: 100%; }
:where(.mv-ui) .ic.glyph { font-family: var(--ft); font-weight: 700; text-align: center; }

/* key caps: a small slip of paper */
:where(.mv-ui) .keycap { display: inline-block; min-width: 22u; height: 22u; padding: 0 6u; border-radius: 4u; background: var(--paper); color: var(--ink);
  font: 700 12u/22u var(--fb); text-align: center; letter-spacing: 0; white-space: nowrap; vertical-align: middle;
  box-shadow: 0 2u 0 rgba(20,14,10,.55), 0 0 0 1u rgba(20,14,10,.35), 0 3u 6u rgba(0,0,0,.35); }
:where(.mv-ui) .keycap.sm { min-width: 18u; height: 18u; line-height: 18u; font-size: 12u; padding: 0 4u; border-radius: 3u; }
:where(.mv-ui) .keycap.dark { background: rgba(28,24,22,.85); color: var(--paper); box-shadow: 0 0 0 1u rgba(243,233,212,.45); }

/* washi sheet: .bg carries the texture and the deckle edge, the sheet itself carries the shadow */
:where(.mv-ui) .mv-paper { position: relative; color: var(--ink); filter: drop-shadow(0 8u 18u rgba(0,0,0,.5)); }
:where(.mv-ui) .mv-paper > .bg { position: absolute; inset: 0; background-color: var(--paper); background-image: var(--tex-paper), linear-gradient(180deg, rgba(255,255,255,.35), rgba(205,187,149,.35));
  background-size: 256u 256u, 100% 100%; background-blend-mode: multiply, normal;
  -webkit-mask: var(--mk-deckle) center / 100% 100% no-repeat; mask: var(--mk-deckle) center / 100% 100% no-repeat; }
:where(.mv-ui) .mv-paper > :not(.bg) { position: relative; }

/* vermilion seal */
:where(.mv-ui) .seal { display: inline-flex; align-items: center; justify-content: center; width: 30u; height: 30u; background: var(--red); color: var(--paper);
  font: 700 19u/1 var(--ft); border-radius: 3u; transform: rotate(-4deg); box-shadow: inset 0 0 0 1.5u rgba(243,233,212,.75), inset 0 0 0 3u var(--red);
  -webkit-mask: var(--mk-deckle-rough) center / 100% 100% no-repeat; mask: var(--mk-deckle-rough) center / 100% 100% no-repeat; flex: none; }
:where(.mv-ui) .seal.tall { width: 26u; height: auto; padding: 6u 0; writing-mode: vertical-rl; letter-spacing: .12em; font-size: 15u; }

/* thin gold rule with a diamond in the middle */
:where(.mv-ui) .rule { position: relative; height: 1u; background: linear-gradient(90deg, transparent, var(--gold) 18%, var(--gold) 82%, transparent); opacity: .8; }
:where(.mv-ui) .rule::after { content: ''; position: absolute; left: 50%; top: 50%; width: 6u; height: 6u; background: var(--gold); transform: translate(-50%,-50%) rotate(45deg); }
:where(.mv-ui) .rule.ink { background: linear-gradient(90deg, transparent, var(--ink2) 12%, var(--ink2) 88%, transparent); opacity: .45; }
:where(.mv-ui) .rule.ink::after { background: var(--red); }

/* brush button (ink on paper) */
:where(.mv-ui) .btn { position: relative; display: inline-flex; align-items: center; gap: 8u; padding: 7u 20u 7u 16u; color: var(--ink); font: 600 15u/1.4 var(--ft);
  letter-spacing: .18em; cursor: pointer; pointer-events: auto; white-space: nowrap; transition: color .15s; }
:where(.mv-ui) .btn::before { content: ''; position: absolute; inset: 0 -4u; background: var(--ink); opacity: 0; transform: scaleX(.6); transform-origin: 0 50%;
  -webkit-mask: var(--mk-brush2) center / 100% 100% no-repeat; mask: var(--mk-brush2) center / 100% 100% no-repeat; transition: opacity .16s, transform .22s cubic-bezier(.2,.8,.2,1); }
:where(.mv-ui) .btn > * { position: relative; }
:where(.mv-ui) .btn.sel, :where(.mv-ui) .btn:hover { color: var(--paper); }
:where(.mv-ui) .btn.sel::before, :where(.mv-ui) .btn:hover::before { opacity: .92; transform: scaleX(1); }
:where(.mv-ui) .btn.red.sel::before, :where(.mv-ui) .btn.red:hover::before { background: var(--red); }
:where(.mv-ui) .btn .ic { font-size: 16u; }
:where(.mv-ui) .btn.off { opacity: .35; pointer-events: none; }

/* scrolling areas */
:where(.mv-ui) .scroll { overflow-y: auto; overflow-x: hidden; pointer-events: auto; scrollbar-width: thin; scrollbar-color: rgba(35,31,29,.35) transparent; }
:where(.mv-ui) .scroll::-webkit-scrollbar { width: 5u; }
:where(.mv-ui) .scroll::-webkit-scrollbar-thumb { background: rgba(35,31,29,.32); border-radius: 3u; }
:where(.mv-ui) .scroll::-webkit-scrollbar-track { background: transparent; }

/* generic full-screen modal backdrop */
:where(.mv-ui) .modal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  background: radial-gradient(ellipse at 50% 45%, rgba(18,18,34,.5), rgba(8,8,18,.82)); opacity: 0; visibility: hidden; transition: opacity .22s, visibility 0s .22s; }
:where(.mv-ui) .modal.on { opacity: 1; visibility: visible; transition: opacity .22s; }
:where(.mv-ui) .modal > .mv-paper { transform: translateY(10u) scale(.985); transition: transform .28s cubic-bezier(.2,.8,.2,1); }
:where(.mv-ui) .modal.on > .mv-paper { transform: none; }

/* empty states */
:where(.mv-ui) .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10u; height: 100%; color: var(--ink2); text-align: center; }
:where(.mv-ui) .empty .enso { width: 96u; height: 96u; background: var(--ink); opacity: .2; -webkit-mask: var(--mk-enso) center / contain no-repeat; mask: var(--mk-enso) center / contain no-repeat; margin-bottom: 4u; }
:where(.mv-ui) .empty .e1 { font: 600 19u/1.5 var(--ft); letter-spacing: .14em; color: var(--ink); }
:where(.mv-ui) .empty .e2 { font-size: 13u; letter-spacing: .08em; }

@keyframes mv-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes mv-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3u); } }
@keyframes mv-spin { to { transform: rotate(360deg); } }
`;

// Type round (docs/api/ui.md "Look round: lettering"): the locale's faces are a brush regular script (--ft: titles,
// place names), a hand-written regular script (--fb: everything that is read) and a running script (--fs: signboards).
// A brush face only reads from about 18u up, so the small labels that the views set in --ft move to --fb here; brush
// faces are set tighter than print type and never faked bold (the face declares the whole weight range).
// Appended after every module's CSS, so these win over the views' own declarations.
const TYPE = `
.mv-ui { font-kerning: normal; text-rendering: optimizeLegibility; font-variant-east-asian: normal; }
.mv-ui :is(.ln-kick, .en-roll .sh, .en-roll .sub, .mp-lbl, .mp-me .nm, .mp-wait, .mp-side .sh, .sh-row .nm, .mn-info b, .mn-sub,
  .mn-subtabs .st, .mn-row .tt, .mn-det .obh, .sp-cell .nm, .sp-h, .sp-form .v, .it-cell .nm, .mv-set .sh, .mv-set .opt, .mv-ctl .sh,
  .hud-prompt .tx, .hud-sp .ult, .hud-spell .cap, .mv-saved, .wh-slot .nm, .btn, .keycap) { font-family: var(--fb); }
/* numerals: hand-written figures, all the same width so counters do not wobble */
.mv-ui :is(.hud-vit .num, .hud-count, .hud-dango, .hud-pin .ds, .hud-spell .cap .cost) { font-family: var(--fb); font-variant-numeric: tabular-nums; }
/* place-name card: the brush name larger and closer, the line under it in the hand-written face */
.mv-ui .mv-banner .tt { font-weight: 400; font-size: 62u; line-height: 1.2; letter-spacing: .08em; margin-right: -.08em;
  text-shadow: 0 2u 2u rgba(6,5,12,.75), 0 0 18u rgba(6,5,12,.55); }
/* the line under it: brush face on a soft ink wash, so it holds over blossom, sky and snow alike */
.mv-ui .mv-banner .sub { position: relative; margin-top: 12u; padding: 3u 30u; font: 400 21u/1.35 var(--ft); letter-spacing: .26em; margin-right: -.26em; color: #fff6e2;
  text-shadow: 0 0 1u rgba(8,6,14,.9), 0 1u 3u rgba(8,6,14,.9), 0 0 10u rgba(8,6,14,.6); }
.mv-ui .mv-banner .sub::before { content: ''; position: absolute; inset: -8u -26u; z-index: -1; pointer-events: none;
  background: radial-gradient(closest-side, rgba(10,8,18,.5), rgba(10,8,18,.32) 55%, rgba(10,8,18,0)); }
/* world-marker names step aside while the place-name card is up (the card and a marker share the upper middle) */
@property --mv-yield { syntax: '<number>'; inherits: true; initial-value: 1; }
.mv-ui:has(.mv-banner.on) { animation: mv-yield 4.4s both; }
@keyframes mv-yield { 0% { --mv-yield: 1; } 5%, 84% { --mv-yield: 0; } 100% { --mv-yield: 1; } }
/* world markers: the name in the brush face, the count in the hand-written figures, both on a soft dark halo */
.mv-ui .hud-pin .lb { left: -130u; width: 260u; top: -44u; font: 400 19u/1.25 var(--ft); letter-spacing: .06em; color: #fff6e4; opacity: var(--mv-yield, 1);
  text-shadow: 0 0 1u rgba(8,6,14,.95), 0 1u 3u rgba(8,6,14,.85), 0 0 9u rgba(8,6,14,.65); }
.mv-ui .hud-pin .ds { top: 17u; font-weight: 400; font-size: 15u; letter-spacing: .04em; color: #fff3da;
  text-shadow: 0 0 1u rgba(8,6,14,.95), 0 1u 3u rgba(8,6,14,.85), 0 0 8u rgba(8,6,14,.6); }
/* quest tracker: the objective in the hand-written face, a size up, with the same halo (it sits on bright sky) */
.mv-ui .hud-tracker .ob { font-size: 16u; line-height: 1.45; letter-spacing: .05em; color: #fff6e6;
  text-shadow: 0 0 1u rgba(8,6,14,.95), 0 1u 3u rgba(8,6,14,.85), 0 0 9u rgba(8,6,14,.6); }
.mv-ui .hud-tracker .pg { font-weight: 400; font-size: 15u; text-shadow: 0 0 1u rgba(8,6,14,.95), 0 1u 3u rgba(8,6,14,.8); }
/* brush titles: tighter than print type */
.mv-ui .dlg-name { font-weight: 400; font-size: 21u; letter-spacing: .14em; text-indent: .14em; }
.mv-ui .hud-boss .nm { font-weight: 400; font-size: 24u; letter-spacing: .24em; margin-right: -.24em; }
.mv-ui .hud-struggle .ttl { font-weight: 400; font-size: 26u; letter-spacing: .3em; margin-right: -.3em; }
.mv-ui .hud-tracker .tt { font-weight: 400; font-size: 19u; letter-spacing: .08em; }
.mv-ui .hud-compass .card { font-weight: 400; font-size: 18u; }
.mv-ui :is(.mn-tab, .mn-det .big, .sh-det .nm, .sh-noren .tt, .mv-sheet .hd .tt, .mv-confirm .tt, .wh-mid .nm, .mp-side .here .v, .empty .e1, .ln-name, .en-roll .gt, .en-line, .en-roll .thx) {
  font-weight: 400; letter-spacing: .1em; }
.mv-ui .seal { font-weight: 400; }
/* reading text: the hand-written face is lighter than print type, so a touch larger and more open */
.mv-ui .dlg-text { font-size: 20u; line-height: 1.75; letter-spacing: .04em; }
.mv-ui .mv-toast { font-size: 15u; }
`;

// Small screens (docs/api/ui.md "Touch and small screens"). Two rules, appended last:
// SAFE — HUD corners and the dialogue keep clear of notches / the home bar (env() is 0 on a desktop, so nothing moves there);
// COMPACT — .mv-ui.compact is set by applyScale when the screen holds less than ~1180x660 design units (phones and tablets,
// where --u is kept large enough to read): every full-screen sheet is clamped to the screen and loosened inside.
const SL = 'env(safe-area-inset-left, 0px)', SR = 'env(safe-area-inset-right, 0px)', ST = 'env(safe-area-inset-top, 0px)', SB = 'env(safe-area-inset-bottom, 0px)';
const FITW = (max, pad) => `min(${max}u, calc(100vw - ${pad}px - ${SL} - ${SR}))`;
const FITH = (max, pad) => `min(${max}u, calc(100dvh - ${pad}px - ${ST} - ${SB}))`;
const SAFE = `
.mv-ui .hud-vit { left: calc(26u + ${SL}); top: calc(22u + ${ST}); }
.mv-ui .hud-tr { right: calc(26u + ${SR}); top: calc(22u + ${ST}); }
.mv-ui .hud-hints { left: calc(26u + ${SL}); bottom: calc(22u + ${SB}); }
.mv-ui .hud-spell { right: calc(30u + ${SR}); bottom: calc(24u + ${SB}); }
.mv-ui .hud-compass { top: calc(16u + ${ST}); }
.mv-ui .mv-toasts { left: calc(26u + ${SL}); }
.mv-ui .mv-saved { right: calc(30u + ${SR}); }
.mv-ui .mvs-skip { right: calc(28px + ${SR}); bottom: calc(22px + ${SB}); }
`;
const COMPACT = `
/* shop */
.mv-ui.compact .mv-shop > .mv-paper { width: ${FITW(940, 20)}; height: ${FITH(560, 12)}; padding: 0 26u 12u; }
.mv-ui.compact .sh-noren { height: 58u; margin: 0 -26u 10u; }
.mv-ui.compact .sh-noren .tt { font-size: 26u; }
.mv-ui.compact .sh-noren .seal { top: 14u; }
.mv-ui.compact .sh-list { width: 46%; overflow-y: auto; }
.mv-ui.compact .sh-det { padding-left: 20u; }
.mv-ui.compact .sh-det .ico { width: 70u; height: 70u; font-size: 42u; }
.mv-ui.compact .sh-det .nm { font-size: 22u; margin-top: 6u; }
.mv-ui.compact .sh-det .ds { margin-top: 4u; line-height: 1.7; overflow-y: auto; min-height: 0; }
.mv-ui.compact .sh-foot { margin-top: 6u; padding-top: 8u; }
/* title sheets (settings / controls) and the confirm slip */
.mv-ui.compact .mv-sheet > .mv-paper { width: ${FITW(1000, 20)}; max-height: ${FITH(640, 12)}; padding: 18u 30u 14u; }
.mv-ui.compact .mv-sheet .hd { margin-bottom: 8u; }
.mv-ui.compact .mv-sheet .ft { margin-top: 8u; padding-top: 8u; }
.mv-ui.compact .mv-set, .mv-ui.compact .mv-ctl { column-gap: 34u; }
.mv-ui.compact .mv-set .trk { width: 140u; }
.mv-ui.compact .mv-set .trk .fil { -webkit-mask-size: 140u 100%; mask-size: 140u 100%; }
.mv-ui.compact .mv-confirm > .mv-paper { width: ${FITW(520, 24)}; padding: 26u 32u 20u; }
.mv-ui.compact .mv-confirm .tx { margin: 10u 0 16u; }
/* learning a magic */
.mv-ui.compact .ln-rays, .mv-ui.compact .ln-emb { top: 32%; }
.mv-ui.compact .ln-emb { transform: scale(.72); }
.mv-ui.compact .ln-ghost { top: 32%; font-size: 380u; }
.mv-ui.compact .ln-txt { top: calc(32% + 104u); }
.mv-ui.compact .ln-name { margin-top: 8u; font-size: 44u; }
.mv-ui.compact .ln-desc { margin-top: 16u; max-width: ${FITW(620, 40)}; font-size: 15u; line-height: 1.75; }
.mv-ui.compact .ln-go { bottom: calc(14u + ${SB}); }
/* the ending */
.mv-ui.compact .en-line { width: ${FITW(900, 40)}; font-size: 21u; }
.mv-ui.compact .en-line.v { width: auto; max-height: calc(100dvh - 70px); font-size: 24u; }
.mv-ui.compact .en-roll .sec { width: ${FITW(640, 40)}; }
.mv-ui.compact .en-go { bottom: calc(10u + ${SB}); }
/* the place-name card: a size down, and the quest tracker steps aside while it is up (they share the top on a phone) */
.mv-ui.compact .mv-banner .tt { font-size: 50u; }
.mv-ui.compact .mv-banner .sub { font-size: 18u; }
.mv-ui.compact .hud-tracker.on:not(.lb) { opacity: var(--mv-yield, 1); }
/* touch: rows, options and buttons are fingertip-sized */
.mv-ui.touch .mv-set .row { min-height: 44px; }
.mv-ui.touch .mv-set .opt { padding: 6px 12px; }
.mv-ui.touch .mv-set .trk { height: 34px; }
.mv-ui.touch .mv-x { width: 44px; height: 44px; right: 10px; top: 8px; }
.mv-ui.touch .mv-x::before, .mv-ui.touch .mv-x::after { left: 12px; right: 12px; }
.mv-ui.touch :is(.mn-row, .sh-row) { min-height: 42px; }
.mv-ui.touch .btn { min-height: 40px; }
.mv-ui.touch .scroll { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
`;

let styleEl = null;
const parts = [BASE];

/** Modules hand their CSS here before install(). */
export function addCss(css) { parts.push(css); }

/** Create (or refresh) the style sheet and the CSS variables that hold generated textures. */
export function installStyle(root) {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'mv-ui-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = compileCss(parts.join('\n') + '\n' + TYPE + '\n' + SAFE + '\n' + COMPACT);
  root.classList.add('mv-ui');
  const s = root.style;
  s.setProperty('--tex-paper', paperTexture(11));
  s.setProperty('--tex-wave', wavePattern('rgba(255,255,255,.055)'));
  s.setProperty('--tex-wave-ink', wavePattern('rgba(35,31,29,.07)'));
  s.setProperty('--mk-brush1', brushStroke(3, { w: 240, h: 24, fray: 5, tail: 20 }));
  s.setProperty('--mk-brush2', brushStroke(8, { w: 200, h: 40, fray: 6, rough: 2.2, tail: 16 }));
  s.setProperty('--mk-brush3', brushStroke(21, { w: 320, h: 16, fray: 4, rough: 1.1, tail: 34 }));
  s.setProperty('--mk-deckle', deckle(5, 2.2));
  s.setProperty('--mk-deckle-rough', deckle(9, 14));
  s.setProperty('--mk-enso', enso(3));
  s.setProperty('--mk-enso2', enso(17, { gap: 0.25, thick: 6, thin: 1.6 }));
  applyFonts(root);
  applyScale(root);
}

/** Font stacks come from the locale (they differ per language). */
export function applyFonts(root) {
  root.style.setProperty('--ft', t('core.meta.fontTitle'));
  root.style.setProperty('--fb', t('core.meta.fontBody'));
  root.style.setProperty('--fs', t('core.meta.fontSign'));
  loadFonts();   // a new locale brings its own faces (idempotent per locale)
}

/** --u: px per design unit. 1 at 1280×720, 1.5 at 1920×1080; never so small that text turns to dust.
 *  With the touch controls (phones, tablets) it is kept large enough to read at arm's length: about 470 design units of
 *  height on a phone held sideways (0.83 at 844×390), 0.9 on a tablet. A screen that then holds less than ~1180×660 units
 *  gets .compact (sheets clamped to the screen). A desktop window keeps the scale it always had. */
export function applyScale(root) {
  const w = window.innerWidth, h = window.innerHeight;
  UI.w = w; UI.h = h;
  let u = Math.max(0.6, Math.min(w / 1280, h / 720));
  if (UI.touch) u = Math.max(u, Math.min(0.9, h / 470, w / 820));
  UI.u = u;
  root.style.setProperty('--u', u.toFixed(4) + 'px');
  const compact = w / u < 1180 || h / u < 660;
  if (root._compact !== compact) { root._compact = compact; root.classList.toggle('compact', compact); }
}
