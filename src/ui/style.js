// Design tokens + the shared pieces of the grimoire look (docs/api/ui.md "Grimoire round"): night glass and leather
// with brass filigree, parchment pages, wax seals, star rules, key caps and serif buttons.
// Lengths are written as `12u` (px at 1280×720) and compiled to calc(var(--u)*12): the whole UI scales with the window.
import { t } from '../core/i18n.js';
import { UI, compileCss } from './dom.js';
import { filigree, star4, flourish, astrolabe, parchTexture, starfield } from './icons.js';
import { loadFonts } from '../core/fonts.js';

const BASE = `
.mv-ui { --u: 1px; --ft: serif; --fb: sans-serif; --fs: serif; --fd: serif;
  --night0: #0a0f1e; --night: #121a2f; --night2: #1c2744; --night3: #2c3a5e;
  --glass: rgba(15,21,40,.62); --glass2: rgba(20,28,52,.8); --hair: rgba(236,217,164,.36); --hair2: rgba(236,217,164,.6);
  --parch: #f6efe0; --parch2: #ebdfc6; --parch3: #d8c6a1;
  --ink: #2a241e; --ink2: #5d5144; --ink3: #8e806f;
  --brass: #c9a45e; --brass2: #ecd9a4; --brass3: #94712f;
  --star: #fff7e8; --moon: #cfdcff;
  --wine: #8b3343; --wine2: #b6495b;
  --life: #e8685c; --life2: #b23a39; --mana: #78b2ff; --mana2: #4f74d8;
  /* inherited names, kept as aliases */
  --paper: var(--parch); --paper2: var(--parch2); --paper3: var(--parch3); --red: var(--wine); --red2: var(--wine2);
  --gold: var(--brass); --gold2: var(--brass2); --indigo: var(--night); --indigo2: var(--night2);
  --ease: cubic-bezier(.2,.8,.2,1);
  --halo: 0 0 1u rgba(6,8,18,.92), 0 1u 3u rgba(6,8,18,.8), 0 0 9u rgba(6,8,18,.5);
  font-family: var(--fb); font-size: 14u; line-height: 1.5; color: var(--star); -webkit-font-smoothing: antialiased;
  cursor: default; }
:where(.mv-ui) *, :where(.mv-ui) *::before, :where(.mv-ui) *::after { box-sizing: border-box; }
:where(.mv-ui) .layer { position: absolute; inset: 0; pointer-events: none; }
:where(.mv-ui) .ft { font-family: var(--fd); }
:where(.mv-ui) .wide { letter-spacing: .2em; margin-right: -.2em; }

/* pictograms */
:where(.mv-ui) .ic { display: inline-block; width: 1em; height: 1em; flex: none; font-style: normal; line-height: 1; vertical-align: -.14em; }
:where(.mv-ui) .ic svg { display: block; width: 100%; height: 100%; }
:where(.mv-ui) .ic.glyph { font-family: var(--fd); font-weight: 700; text-align: center; }

/* key caps: a small night-glass key with a brass hairline (ivory on parchment) */
:where(.mv-ui) .keycap { display: inline-block; min-width: 22u; height: 22u; padding: 0 6u; border-radius: 5u; color: var(--star);
  background: linear-gradient(180deg, rgba(44,58,96,.94), rgba(16,22,42,.94));
  font: 600 11.5u/22u var(--fd); text-align: center; letter-spacing: .02em; white-space: nowrap; vertical-align: middle;
  box-shadow: inset 0 0 0 1u var(--hair2), inset 0 1u 0 rgba(255,255,255,.14), 0 2u 4u rgba(0,0,0,.35); }
:where(.mv-ui) .keycap.sm { min-width: 18u; height: 18u; line-height: 18u; font-size: 10.5u; padding: 0 4u; border-radius: 4u; }
:where(.mv-ui) .keycap.dark { background: linear-gradient(180deg, rgba(44,58,96,.94), rgba(16,22,42,.94)); color: var(--star); }
:where(.mv-ui) :is(.mv-paper, .mv-night .mn-body) .keycap { color: var(--ink); background: linear-gradient(180deg, #fffaf0, #efe3c9);
  box-shadow: inset 0 0 0 1u rgba(110,84,44,.42), 0 1.5u 0 rgba(110,84,44,.3); }
:where(.mv-ui) .mv-night .keycap:not(.mn-body .keycap) { color: var(--star); background: linear-gradient(180deg, rgba(44,58,96,.94), rgba(16,22,42,.94));
  box-shadow: inset 0 0 0 1u var(--hair2), inset 0 1u 0 rgba(255,255,255,.14), 0 2u 4u rgba(0,0,0,.35); }

/* parchment page: ivory, lighter at the centre, fine grain, filigree frame (.bg carries it all; the sheet holds content) */
:where(.mv-ui) .mv-paper { position: relative; color: var(--ink); }
:where(.mv-ui) .mv-paper > .bg { position: absolute; inset: 0; border-radius: 6u; background-color: var(--parch);
  background-image: radial-gradient(ellipse 85% 75% at 50% 42%, rgba(255,253,246,.75), rgba(255,253,246,0) 70%), var(--tex-parch),
    linear-gradient(180deg, #f8f2e4, #ecdfc5);
  background-size: 100% 100%, 256u 256u, 100% 100%; background-blend-mode: normal, multiply, normal;
  box-shadow: inset 0 0 0 1u rgba(122,92,46,.4), inset 0 0 34u rgba(160,118,62,.2), 0 14u 34u rgba(4,6,16,.42), 0 2u 6u rgba(4,6,16,.25); }
:where(.mv-ui) .mv-paper > .bg::after { content: ''; position: absolute; inset: 6u; border: 24u solid transparent; pointer-events: none;
  border-image: var(--fr-paper) 36 / 24u stretch; }
:where(.mv-ui) .mv-paper > :not(.bg) { position: relative; }
/* night cover: deep blue leather and glass with a light brass frame and a few stars */
:where(.mv-ui) .mv-night { color: var(--star); }
:where(.mv-ui) .mv-night > .bg { background-color: var(--night);
  background-image: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(92,116,190,.3), rgba(92,116,190,0) 70%), var(--tex-stars),
    linear-gradient(180deg, #1a243f, #10172b 62%, #0c1222);
  background-size: 100% 100%, 256u 256u, 100% 100%; background-blend-mode: normal;
  box-shadow: inset 0 0 0 1u rgba(236,217,164,.3), inset 0 1u 0 rgba(255,255,255,.08), 0 18u 44u rgba(2,4,12,.55), 0 2u 8u rgba(2,4,12,.35); }
:where(.mv-ui) .mv-night > .bg::after { border-image-source: var(--fr-night); }

/* wax seal */
:where(.mv-ui) .seal { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 30u; height: 30u; flex: none; border-radius: 50%;
  background: radial-gradient(circle at 36% 30%, #c86373 0%, var(--wine) 50%, #5a1d29 100%); color: #fbe7d6;
  font: 700 14u/1 var(--fd); text-shadow: 0 -1u 0 rgba(40,6,14,.55); transform: rotate(-8deg);
  box-shadow: inset 0 -2u 3u rgba(40,6,14,.45), inset 0 1.5u 1u rgba(255,210,200,.28), 0 2u 4u rgba(50,10,18,.35); }
:where(.mv-ui) .seal::before { content: ''; position: absolute; inset: 3u; border-radius: 50%; border: 1u dashed rgba(255,226,206,.42); pointer-events: none; }
:where(.mv-ui) .seal.tall { width: 28u; height: auto; padding: 9u 0; border-radius: 14u; writing-mode: vertical-rl; letter-spacing: .08em; font-size: 13u; transform: rotate(-3deg); }
:where(.mv-ui) .seal.tall::before { border-radius: 11u; }

/* rules: a hairline fading at both ends with a four-point star in the middle */
:where(.mv-ui) .rule { position: relative; height: 1u; background: linear-gradient(90deg, transparent, rgba(236,217,164,.75) 20%, rgba(236,217,164,.75) 80%, transparent); }
:where(.mv-ui) .rule::after { content: ''; position: absolute; left: 50%; top: 50%; width: 11u; height: 11u; margin: -5.5u; background: var(--brass2);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
:where(.mv-ui) .rule.ink { background: linear-gradient(90deg, transparent, rgba(148,113,47,.6) 14%, rgba(148,113,47,.6) 86%, transparent); }
:where(.mv-ui) .rule.ink::after { background: var(--brass3); }
/* heading ornament (mask): tapering rules, two curls and a star */
:where(.mv-ui) .orn { display: block; width: 240u; height: 20u; background: var(--brass2);
  -webkit-mask: var(--mk-flourish) center / 100% 100% no-repeat; mask: var(--mk-flourish) center / 100% 100% no-repeat; }

/* serif buttons: a brass underline grows from the centre, a star marks the choice (ink on parchment, ivory on night) */
:where(.mv-ui) .btn { position: relative; display: inline-flex; align-items: center; gap: 8u; padding: 7u 18u 8u 20u; color: var(--ink); font: 600 15u/1.4 var(--fd);
  letter-spacing: .12em; cursor: pointer; pointer-events: auto; white-space: nowrap; border-radius: 4u; transition: color .15s, background-color .2s; }
:where(.mv-ui) .btn::before { content: ''; position: absolute; left: 16u; right: 14u; bottom: 3u; height: 1.5u; transform: scaleX(0); transition: transform .26s var(--ease);
  background: linear-gradient(90deg, transparent, var(--brass3) 25%, var(--brass3) 75%, transparent); }
:where(.mv-ui) .btn::after { content: ''; position: absolute; left: 4u; top: 50%; width: 10u; height: 10u; margin-top: -5u; background: var(--brass3); opacity: 0;
  transform: translateX(-3u) scale(.5); transition: opacity .16s, transform .22s var(--ease);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
:where(.mv-ui) .btn > * { position: relative; }
:where(.mv-ui) .btn.sel, :where(.mv-ui) .btn:hover { background-color: rgba(148,113,47,.1); }
:where(.mv-ui) .btn.sel::before, :where(.mv-ui) .btn:hover::before { transform: none; }
:where(.mv-ui) .btn.sel::after, :where(.mv-ui) .btn:hover::after { opacity: 1; transform: none; }
:where(.mv-ui) .btn.red.sel, :where(.mv-ui) .btn.red:hover { color: var(--wine); }
:where(.mv-ui) .btn.red::before { background: linear-gradient(90deg, transparent, var(--wine2) 25%, var(--wine2) 75%, transparent); }
:where(.mv-ui) .btn.red::after { background: var(--wine); }
:where(.mv-ui) .btn .ic { font-size: 15u; opacity: .85; }
:where(.mv-ui) .btn.off { opacity: .35; pointer-events: none; }
:where(.mv-ui) .mv-night .btn { color: var(--star); }
:where(.mv-ui) .mv-night .btn::before { background: linear-gradient(90deg, transparent, var(--brass2) 25%, var(--brass2) 75%, transparent); }
:where(.mv-ui) .mv-night .btn::after { background: var(--brass2); }
:where(.mv-ui) .mv-night .btn.sel, :where(.mv-ui) .mv-night .btn:hover { background-color: rgba(236,217,164,.1); color: #fffaf0; }
:where(.mv-ui) .mv-night .btn.red.sel, :where(.mv-ui) .mv-night .btn.red:hover { color: #ffc9c4; }
:where(.mv-ui) .mv-night .btn.red::before { background: linear-gradient(90deg, transparent, #e08490 25%, #e08490 75%, transparent); }
:where(.mv-ui) .mv-night .btn.red::after { background: #e08490; }

/* scrolling areas */
:where(.mv-ui) .scroll { overflow-y: auto; overflow-x: hidden; pointer-events: auto; scrollbar-width: thin; scrollbar-color: rgba(122,92,46,.4) transparent; }
:where(.mv-ui) .scroll::-webkit-scrollbar { width: 5u; }
:where(.mv-ui) .scroll::-webkit-scrollbar-thumb { background: rgba(122,92,46,.38); border-radius: 3u; }
:where(.mv-ui) .scroll::-webkit-scrollbar-track { background: transparent; }

/* generic full-screen modal backdrop */
:where(.mv-ui) .modal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  background: radial-gradient(ellipse at 50% 45%, rgba(10,14,32,.42), rgba(4,6,16,.8)); opacity: 0; visibility: hidden; transition: opacity .24s, visibility 0s .24s; }
:where(.mv-ui) .modal.on { opacity: 1; visibility: visible; transition: opacity .24s; }
:where(.mv-ui:not(.touch)) .modal.on { -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
:where(.mv-ui) .modal > .mv-paper { transform: translateY(8u) scale(.985); transition: transform .3s var(--ease); }
:where(.mv-ui) .modal.on > .mv-paper { transform: none; }

/* empty states: the astrolabe ring, faint */
:where(.mv-ui) .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10u; height: 100%; color: var(--ink2); text-align: center; }
:where(.mv-ui) .empty .enso { width: 92u; height: 92u; background: var(--brass3); opacity: .32; margin-bottom: 6u;
  -webkit-mask: var(--mk-astro) center / contain no-repeat; mask: var(--mk-astro) center / contain no-repeat; }
:where(.mv-ui) .empty .e1 { font: 600 19u/1.5 var(--fd); letter-spacing: .1em; color: var(--ink); }
:where(.mv-ui) .empty .e2 { font-size: 14u; letter-spacing: .06em; }

@keyframes mv-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes mv-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3u); } }
@keyframes mv-spin { to { transform: rotate(360deg); } }
@keyframes mv-sheen { 0% { background-position: -150% 0; } 60%, 100% { background-position: 250% 0; } }
`;

// Type (docs/api/ui.md "Grimoire round"): --fd is the display serif (headings, names, labels, numerals), --fb the
// hand-written face for everything read at length. Appended after every module's CSS.
const TYPE = `
.mv-ui { font-kerning: normal; text-rendering: optimizeLegibility; font-variant-east-asian: normal; }
.mv-ui :is(.hud-vit .num, .hud-count, .hud-dango, .hud-pin .ds, .hud-spell .cap .cost, .sh-pr, .mv-set .val, .foe-combo .n) { font-variant-numeric: tabular-nums lining-nums; }
/* world-marker names step aside while the place-name card is up (the card and a marker share the upper middle) */
@property --mv-yield { syntax: '<number>'; inherits: true; initial-value: 1; }
.mv-ui:has(.mv-banner.on) { animation: mv-yield 4.4s both; }
@keyframes mv-yield { 0% { --mv-yield: 1; } 5%, 84% { --mv-yield: 0; } 100% { --mv-yield: 1; } }
@media (prefers-reduced-motion: reduce) {
  .mv-ui *, .mv-ui *::before, .mv-ui *::after { animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
}
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
.mv-ui.compact .mv-shop > .mv-paper { width: ${FITW(940, 20)}; height: ${FITH(570, 12)}; padding: 0 30u 12u; }
.mv-ui.compact .mv-shop > .mv-paper > .bg { top: 18u; }
.mv-ui.compact .sh-noren { height: 44u; margin: 0 0 8u; min-width: 260u; }
.mv-ui.compact .sh-noren::before, .mv-ui.compact .sh-noren::after { display: none; }
.mv-ui.compact .sh-noren .tt { font-size: 20u; }
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
.mv-ui.touch :is(.mn-row, .sh-row) { min-height: 44px; }
.mv-ui.touch .btn { min-height: 44px; }
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
  const parch = parchTexture(7);
  s.setProperty('--tex-parch', parch);
  s.setProperty('--tex-paper', parch);
  s.setProperty('--tex-stars', starfield(19));
  s.setProperty('--fr-paper', filigree('#94712f', 0.78));
  s.setProperty('--fr-night', filigree('#ecd9a4', 0.6));
  s.setProperty('--mk-star', star4());
  s.setProperty('--mk-flourish', flourish());
  s.setProperty('--mk-astro', astrolabe());
  applyFonts(root);
  applyScale(root);
}

/** Font stacks come from the locale (they differ per language). */
export function applyFonts(root) {
  root.style.setProperty('--fd', t('core.meta.fontDisplay'));
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
