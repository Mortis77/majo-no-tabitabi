// The HUD: vitals, compass, markers, quest tracker, counters, the selected 灵诀 with the 「契」 ring, crosshair + charge ring,
// lock-on reticle, boss / duel bar, beam-struggle bar, interact prompt and key hints.
// It reads live state every frame through ./model.js (safe when the player / spells do not exist yet) and only touches
// the DOM when a value actually changed.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp, damp } from '../core/util.js';
import { UI, el, tel, clear, key, keycap, setText, setOn, replay } from './dom.js';
import { icon, setIcon, EL_COLOR, STATUS, STATUS_ICON, hasIcon } from './icons.js';
import { addCss } from './style.js';
import { vitals, spellSlots, selectedId, gauge, charge, inv, ability, cooldownLeft } from './model.js';

addCss(`
.mv-hud { opacity: 0; transition: opacity .35s; }
.mv-hud.show { opacity: 1; }
.mv-hud .cg { transition: opacity .3s; }
.mv-hud.calm .cg { opacity: 0; }
.mv-hud.wheel .hud-cross, .mv-hud.wheel .hud-pin, .mv-hud.wheel .hud-prompt { opacity: 0; }
.mv-hud .tsh { text-shadow: 0 1u 2u rgba(8,6,14,.95), 0 0 6u rgba(8,6,14,.6); }

/* ---- vitals ---- */
.hud-vit { position: absolute; left: 26u; top: 22u; display: flex; align-items: flex-start; gap: 12u; }
.hud-orb { position: relative; width: 56u; height: 56u; flex: none; }
.hud-orb::before { content: ''; position: absolute; inset: 3u; border-radius: 50%; background: radial-gradient(circle, rgba(16,18,40,.82) 0%, rgba(16,18,40,.7) 62%, rgba(16,18,40,.25) 100%); }
.hud-orb::after { content: ''; position: absolute; inset: 0; background: var(--gold2); -webkit-mask: var(--mk-enso2) center / contain no-repeat; mask: var(--mk-enso2) center / contain no-repeat; filter: drop-shadow(0 1u 2u rgba(0,0,0,.8)); }
.hud-orb .in { position: absolute; inset: 6u; border-radius: 50%; overflow: hidden; }
.hud-orb .sun { position: absolute; left: 50%; top: 50%; width: 22u; height: 22u; margin: -11u; border-radius: 50%;
  background: radial-gradient(circle, #fff8dc 0%, #ffd77c 58%, #ffb347 100%); box-shadow: 0 0 9u 3u rgba(255,196,104,.8), 0 0 20u 8u rgba(255,170,80,.3); }
.hud-orb .moon { position: absolute; left: 50%; top: 50%; width: 23u; height: 23u; margin: -11.5u; border-radius: 50%; background: #0d1024;
  box-shadow: inset -2u -2u 5u rgba(130,150,235,.4); will-change: transform; }
.hud-vit .bars { padding-top: 6u; }
.hud-vit .row { display: flex; align-items: center; gap: 8u; height: 17u; }
.hud-vit .row.mana { height: 14u; margin-top: 1u; }
.hud-bar { position: relative; height: 13u; background: rgba(14,12,22,.66); overflow: hidden;
  -webkit-mask: var(--mk-brush1) center / 100% 100% no-repeat; mask: var(--mk-brush1) center / 100% 100% no-repeat; }
.hud-bar i { position: absolute; inset: 0; transform-origin: 0 50%; will-change: transform; }
.hud-bar .ghost { background: rgba(255,238,205,.82); }
.hud-vit .life .fill { background: linear-gradient(180deg, #ff8f6b 0%, #e2452f 45%, #b82c1d 100%); }
.hud-vit .mana .hud-bar { height: 9u; -webkit-mask-image: var(--mk-brush3); mask-image: var(--mk-brush3); }
.hud-vit .mana .fill { background: linear-gradient(180deg, #d9f3ff 0%, #74c6ff 45%, #3d8fe0 100%); }
.hud-vit .mana .ghost { background: rgba(220,240,255,.5); }
.hud-vit .num { font: 700 12u/1 var(--fb); letter-spacing: .04em; color: var(--paper); opacity: .92; min-width: 26u; }
.hud-vit.low .life .fill { animation: mv-pulse .7s infinite; }
.hud-vit .status { display: flex; gap: 6u; margin-top: 6u; height: 22u; }
.hud-vit .st { display: none; align-items: center; gap: 4u; height: 22u; padding: 0 9u 0 6u; border-radius: 11u; background: rgba(14,12,22,.72);
  box-shadow: inset 0 0 0 1u currentColor; font: 600 12u/22u var(--fb); letter-spacing: .1em; animation: hud-st-in .25s cubic-bezier(.2,.8,.2,1.4); }
.hud-vit .st.on { display: inline-flex; }
.hud-vit .st .ic { font-size: 14u; }
.hud-vit .st span { color: var(--paper); }
@keyframes hud-st-in { from { transform: scale(.5); opacity: 0; } }

/* ---- compass ---- */
.hud-compass { position: absolute; left: 50%; top: 16u; width: 400u; height: 40u; margin-left: -200u; overflow: hidden;
  -webkit-mask: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent); mask: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent); }
.hud-compass::before { content: ''; position: absolute; left: 0; right: 0; top: 2u; height: 27u; background: linear-gradient(180deg, rgba(12,12,26,.5), rgba(12,12,26,.18)); }
.hud-compass::after { content: ''; position: absolute; left: 0; right: 0; top: 29u; height: 1u; background: var(--gold2); opacity: .75; }
.hud-compass .strip { position: absolute; left: 0; top: 0; height: 100%; will-change: transform; }
.hud-compass .tk { position: absolute; top: 21u; width: 1.5u; height: 6u; margin-left: -.75u; background: rgba(243,233,212,.6); }
.hud-compass .tk.m { top: 16u; width: 5u; height: 5u; margin-left: -2.5u; transform: rotate(45deg); background: var(--gold2); }
.hud-compass .card { position: absolute; top: 2u; width: 26u; margin-left: -13u; text-align: center; font: 700 17u/26u var(--ft); color: var(--paper); text-shadow: 0 1u 3u rgba(0,0,0,.95); }
.hud-compass .card.n { color: #ff8a6a; }
.hud-compass .needle { position: absolute; left: 50%; top: 30u; width: 0; height: 0; margin-left: -5u; border: 5u solid transparent; border-top: 0; border-bottom: 8u solid var(--red2); filter: drop-shadow(0 1u 1u rgba(0,0,0,.7)); }
.hud-compass .mk { position: absolute; left: 0; top: 4u; width: 22u; height: 22u; margin-left: -11u; border-radius: 50%; background: rgba(12,12,26,.86); display: none; align-items: center; justify-content: center;
  font-size: 13u; box-shadow: 0 0 0 1.2u currentColor; will-change: transform; }
.hud-compass .mk.on { display: flex; }
.hud-compass .mk.edge { opacity: .5; }

/* ---- boss / duel ---- */
.hud-boss { position: absolute; left: 50%; top: 64u; width: 480u; margin-left: -240u; text-align: center; opacity: 0; transform: translateY(-8u); transition: opacity .4s, transform .4s; }
.hud-boss.on { opacity: 1; transform: none; }
.hud-boss .nm { font: 700 20u/1.3 var(--ft); letter-spacing: .42em; margin-right: -.42em; color: var(--paper); }
.hud-boss .sub { font: 400 12u/1.4 var(--fb); letter-spacing: .3em; margin-right: -.3em; color: var(--gold2); opacity: .9; min-height: 0; }
.hud-boss .wrap { position: relative; margin-top: 5u; padding: 0 16u; }
.hud-boss .wrap::before, .hud-boss .wrap::after { content: ''; position: absolute; top: 50%; width: 8u; height: 8u; margin-top: -4u; background: var(--gold2); transform: rotate(45deg); box-shadow: 0 0 0 1.5u rgba(12,12,26,.8); }
.hud-boss .wrap::before { left: 0; } .hud-boss .wrap::after { right: 0; }
.hud-boss .hud-bar { height: 11u; -webkit-mask-image: var(--mk-brush3); mask-image: var(--mk-brush3); background: rgba(14,12,22,.74); }
.hud-boss .fill { background: linear-gradient(180deg, #ff9a7a, #d8402c 50%, #9b2114); }
.hud-boss.duel .fill { background: linear-gradient(180deg, #fff1c4, var(--bc, #d8a646) 55%, #8c6a22); }
.hud-boss.shade .fill { background: linear-gradient(180deg, #d8c2ff, #8a5fd8 50%, #4b2c93); }

/* ---- top right: counters + tracker ---- */
.hud-tr { position: absolute; right: 26u; top: 22u; display: flex; flex-direction: column; align-items: flex-end; }
.hud-count { display: flex; align-items: center; gap: 6u; height: 26u; padding: 0 12u 0 8u; border-radius: 13u; background: rgba(14,12,22,.6); font: 700 15u/26u var(--fb); letter-spacing: .04em; }
.hud-count .ic { font-size: 17u; color: var(--gold2); }
.hud-count.bump { animation: hud-bump .35s; }
@keyframes hud-bump { 30% { transform: scale(1.18); } }
.hud-tracker { position: relative; margin-top: 14u; width: 268u; padding: 4u 14u 6u 0; text-align: right; opacity: 0; transform: translateX(12u); transition: opacity .4s, transform .4s; }
.hud-tracker.on { opacity: 1; transform: none; }
.mv-hud .hud-tracker.lb { opacity: 0; }
.hud-tracker::after { content: ''; position: absolute; right: 0; top: 2u; bottom: 2u; width: 2u; background: linear-gradient(180deg, var(--gold2), rgba(255,226,160,.15)); }
.hud-tracker::before { content: ''; position: absolute; right: -3u; top: 0; width: 8u; height: 8u; background: var(--red2); transform: rotate(45deg); box-shadow: 0 0 0 1.5u rgba(12,12,26,.6); }
.hud-tracker .tt { font: 700 17u/1.35 var(--ft); letter-spacing: .14em; color: var(--paper); }
.hud-tracker .ob { margin-top: 2u; font: 400 13u/1.5 var(--fb); letter-spacing: .04em; color: #f6eedd; }
.hud-tracker .pg { margin-top: 3u; font: 700 13u/1.3 var(--fb); color: var(--gold2); letter-spacing: .08em; }
.hud-tracker .pb { position: relative; display: none; margin: 6u 0 0 auto; width: 150u; height: 4u; background: rgba(14,12,22,.6); border-radius: 2u; overflow: hidden; }
.hud-tracker .pb.on { display: block; }
.hud-tracker .pb i { position: absolute; inset: 0; background: var(--gold2); transform-origin: 100% 50%; }
.hud-tracker.flash .ob { animation: hud-flash 1s; }
@keyframes hud-flash { 0% { color: var(--gold2); transform: translateX(-6u); } }

/* ---- crosshair ---- */
.hud-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; color: var(--paper); }
.hud-cross .dot { position: absolute; left: -2.5u; top: -2.5u; width: 5u; height: 5u; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 1.2u rgba(10,8,16,.7); }
.hud-cross .tick { position: absolute; background: currentColor; box-shadow: 0 0 0 1u rgba(10,8,16,.55); border-radius: 1u; transition: transform .12s; }
.hud-cross .t1, .hud-cross .t2 { left: -.75u; width: 1.5u; height: 6u; } .hud-cross .t1 { top: -15u; } .hud-cross .t2 { top: 9u; }
.hud-cross .t3, .hud-cross .t4 { top: -.75u; height: 1.5u; width: 6u; } .hud-cross .t3 { left: -15u; } .hud-cross .t4 { left: 9u; }
.hud-cross.hot { color: #ff9478; }
.hud-cross.hot .t1 { transform: translateY(3u); } .hud-cross.hot .t2 { transform: translateY(-3u); } .hud-cross.hot .t3 { transform: translateX(3u); } .hud-cross.hot .t4 { transform: translateX(-3u); }
.hud-cross svg { position: absolute; left: -27u; top: -27u; width: 54u; height: 54u; transform: rotate(-90deg); opacity: 0; transition: opacity .15s; overflow: visible; }
.hud-cross.charging svg { opacity: 1; }
.hud-cross circle { fill: none; stroke-width: 3.2; }
.hud-cross .trk { stroke: rgba(10,8,16,.5); }
.hud-cross .arc { stroke: var(--cc, #ffe2a0); stroke-linecap: round; }
.hud-cross.full svg { animation: hud-full .5s infinite alternate; }
@keyframes hud-full { to { filter: drop-shadow(0 0 5u var(--cc, #ffe2a0)) brightness(1.3); } }

/* ---- lock-on ---- */
.hud-lock { position: absolute; left: 0; top: 0; width: 0; height: 0; display: none; will-change: transform; }
.hud-lock.on { display: block; }
.hud-lock .sq { position: absolute; left: -28u; top: -28u; width: 56u; height: 56u; animation: mv-spin 5s linear infinite; }
.hud-lock .sq i { position: absolute; width: 13u; height: 13u; border: 2.5u solid var(--red2); filter: drop-shadow(0 0 2u rgba(0,0,0,.8)); }
.hud-lock .sq i:nth-child(1) { left: 0; top: 0; border-right: 0; border-bottom: 0; }
.hud-lock .sq i:nth-child(2) { right: 0; top: 0; border-left: 0; border-bottom: 0; }
.hud-lock .sq i:nth-child(3) { left: 0; bottom: 0; border-right: 0; border-top: 0; }
.hud-lock .sq i:nth-child(4) { right: 0; bottom: 0; border-left: 0; border-top: 0; }
.hud-lock .hp { position: absolute; left: -26u; top: 36u; width: 52u; height: 4u; background: rgba(12,10,20,.7); border-radius: 2u; overflow: hidden; }
.hud-lock .hp i { position: absolute; inset: 0; background: var(--red2); transform-origin: 0 50%; }

/* ---- world markers ---- */
.hud-pin { position: absolute; left: 0; top: 0; width: 0; height: 0; display: none; will-change: transform; }
.hud-pin.on { display: block; }
.hud-pin .disc { position: absolute; left: -15u; top: -15u; width: 30u; height: 30u; border-radius: 50%; background: rgba(12,12,26,.84); box-shadow: 0 0 0 1.5u currentColor, 0 2u 6u rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center; font-size: 17u; }
.hud-pin .ds { position: absolute; left: -40u; top: 18u; width: 80u; text-align: center; font: 700 12u/1.3 var(--fb); color: var(--paper); white-space: nowrap; }
.hud-pin .lb { position: absolute; left: -70u; top: -36u; width: 140u; text-align: center; font: 600 13u/1.3 var(--ft); letter-spacing: .1em; color: var(--paper); white-space: nowrap; }
.hud-pin .ar { position: absolute; left: -24u; top: -24u; width: 48u; height: 48u; display: none; }
.hud-pin .ar::before { content: ''; position: absolute; left: 50%; top: -3u; margin-left: -5u; border: 5u solid transparent; border-top: 0; border-bottom: 8u solid currentColor; filter: drop-shadow(0 0 1.5u rgba(0,0,0,.9)); }
.hud-pin.edge .ar { display: block; }
.hud-pin.edge .lb { display: none; }
.hud-pin.near { opacity: .4; }
.hud-pin.tuck .lb { display: none; }

/* ---- beam struggle ---- */
.hud-struggle { position: absolute; left: 50%; top: 61%; width: 460u; margin-left: -230u; text-align: center; opacity: 0; transform: scale(.92); transition: opacity .2s, transform .25s cubic-bezier(.2,.8,.2,1.5); }
.hud-struggle.on { opacity: 1; transform: none; }
.hud-struggle .ttl { font: 700 22u/1.2 var(--ft); letter-spacing: .5em; margin-right: -.5em; color: var(--paper); }
.hud-struggle .track { position: relative; height: 16u; margin: 8u 0; background: linear-gradient(180deg, #a98cff, #5a37b8 60%, #2c1766); overflow: hidden;
  -webkit-mask: var(--mk-brush1) center / 100% 100% no-repeat; mask: var(--mk-brush1) center / 100% 100% no-repeat; }
.hud-struggle .mine { position: absolute; inset: 0; background: linear-gradient(180deg, #fffbe0, #ffd77c 55%, #f09a3a); transform-origin: 0 50%; will-change: transform; }
.hud-struggle .wrap { position: relative; }
.hud-struggle .spark { position: absolute; left: 0; top: 50%; width: 0; height: 0; will-change: transform; }
.hud-struggle .spark::before { content: ''; position: absolute; left: -17u; top: -17u; width: 34u; height: 34u; background: radial-gradient(circle, #fff 0%, #fff3c4 28%, rgba(255,214,120,.55) 48%, rgba(255,214,120,0) 70%); animation: hud-spark .12s infinite alternate; }
.hud-struggle .spark::after { content: ''; position: absolute; left: -2u; top: -22u; width: 4u; height: 44u; background: #fff; border-radius: 2u; box-shadow: 0 0 8u 2u #ffe6a8; }
@keyframes hud-spark { to { transform: scale(1.35) rotate(40deg); } }
.hud-struggle .hint { display: inline-flex; align-items: center; gap: 8u; font: 600 14u/22u var(--fb); letter-spacing: .14em; color: var(--paper); }
.hud-struggle .hint .keycap { animation: hud-mash .18s infinite alternate; }
@keyframes hud-mash { to { transform: translateY(2u) scale(.94); } }

/* ---- interact prompt ---- */
.hud-prompt { position: absolute; left: 50%; bottom: 152u; transform: translate(-50%, 8u); display: flex; align-items: center; gap: 10u; padding: 7u 26u 7u 18u; opacity: 0; transition: opacity .18s, transform .18s; white-space: nowrap; }
.hud-prompt.on { opacity: 1; transform: translate(-50%, 0); }
.hud-prompt::before { content: ''; position: absolute; inset: 0; background: rgba(14,12,22,.74); -webkit-mask: var(--mk-brush2) center / 100% 100% no-repeat; mask: var(--mk-brush2) center / 100% 100% no-repeat; }
.hud-prompt > * { position: relative; }
.hud-prompt .tx { font: 600 16u/1.4 var(--ft); letter-spacing: .16em; color: var(--paper); }

/* ---- key hints ---- */
.hud-hints { position: absolute; left: 26u; bottom: 22u; display: flex; flex-direction: column; gap: 6u; }
.hud-hints .h { display: flex; align-items: center; gap: 8u; font: 500 13u/22u var(--fb); letter-spacing: .1em; color: var(--paper); }
.hud-hints .ride { display: none; align-items: center; gap: 7u; margin-bottom: 4u; height: 26u; padding: 0 12u 0 8u; border-radius: 13u; align-self: flex-start;
  background: rgba(14,12,22,.66); box-shadow: inset 0 0 0 1u var(--gold2); font: 600 13u/26u var(--ft); letter-spacing: .2em; color: var(--gold2); }
.hud-hints .ride.on { display: inline-flex; }
.hud-hints .ride .ic { font-size: 16u; }

/* ---- selected spell + gauge ---- */
.hud-spell { position: absolute; right: 30u; bottom: 24u; display: flex; align-items: flex-end; gap: 16u; }
.hud-dango { display: flex; align-items: center; gap: 6u; height: 30u; padding: 0 8u 0 6u; border-radius: 15u; background: rgba(14,12,22,.6); font: 700 15u/30u var(--fb); margin-bottom: 26u; }
.hud-dango .ic { font-size: 22u; }
.hud-dango.none { opacity: .5; }
.hud-trio { position: relative; display: flex; align-items: center; gap: 8u; padding-bottom: 26u; }
.hud-sp { position: relative; width: 36u; height: 36u; border-radius: 50%; background: rgba(14,12,22,.7); display: flex; align-items: center; justify-content: center; font-size: 19u; color: var(--sc, #f3e9d4);
  box-shadow: inset 0 0 0 1.2u rgba(243,233,212,.3); opacity: .85; transition: opacity .2s; }
.hud-sp.none { visibility: hidden; }
.hud-sp.main { width: 72u; height: 72u; font-size: 38u; margin: 0 6u; opacity: 1; background: radial-gradient(circle at 50% 38%, rgba(40,36,60,.86), rgba(12,10,22,.86)); box-shadow: inset 0 0 0 1.5u rgba(243,233,212,.2), 0 0 16u -2u var(--sc, transparent); }
.hud-sp.main .ic { filter: drop-shadow(0 0 5u var(--sc, transparent)); transition: opacity .2s; }
.hud-sp.main.dry .ic { opacity: .4; filter: none; }
.hud-sp.main .cdw { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; opacity: 0; transition: opacity .15s;
  background: conic-gradient(rgba(8,6,16,.72) calc(var(--cd, 0) * 360deg), transparent 0); }
.hud-sp.main.cooling .cdw { opacity: 1; }
.hud-sp.main.swap { animation: hud-swap .3s cubic-bezier(.2,.8,.2,1.5); }
@keyframes hud-swap { from { transform: scale(.75) rotate(-25deg); } }
.hud-sp.main svg.ring { position: absolute; left: -9u; top: -9u; width: 90u; height: 90u; transform: rotate(-90deg); overflow: visible; }
.hud-sp.main svg.ring circle { fill: none; stroke-width: 3; }
.hud-sp.main svg.ring .trk { stroke: rgba(12,10,22,.6); stroke-width: 4.4; }
.hud-sp.main svg.ring .arc { stroke: var(--gold2); stroke-linecap: round; }
.hud-sp.main.ready svg.ring { animation: hud-ready 1.1s infinite; }
@keyframes hud-ready { 50% { filter: drop-shadow(0 0 6u #ffe2a0) drop-shadow(0 0 12u #ffb347); } }
.hud-sp .kei { position: absolute; left: -12u; top: -12u; width: 24u; height: 24u; border-radius: 50%; background: rgba(12,10,22,.9); color: var(--gold2); box-shadow: 0 0 0 1.2u var(--gold2);
  font: 700 14u/24u var(--ft); text-align: center; }
.hud-sp.main.ready .kei { background: var(--gold2); color: var(--ink); }
.hud-sp .ult { position: absolute; left: 50%; top: -34u; transform: translateX(-50%); display: none; align-items: center; gap: 6u; white-space: nowrap; font: 700 13u/22u var(--ft); letter-spacing: .16em; color: var(--gold2); }
.hud-sp.main.ready .ult { display: flex; animation: mv-bob 1s infinite; }
.hud-spell .cap { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; white-space: nowrap; font: 700 15u/20u var(--ft); letter-spacing: .2em; color: var(--paper); }
.hud-spell .cap .cost { margin-left: 8u; font: 700 12u/20u var(--fb); letter-spacing: .02em; color: #9fd6ff; }
.hud-spell .cap .cost .ic { font-size: 12u; margin-right: 2u; }
.hud-spell .cap.dim { opacity: .75; letter-spacing: .12em; font-size: 13u; }
`);

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const PPD = 2.4;                 // compass: design px per degree
const RAD2DEG = 180 / Math.PI;
const KIND_ICON = { quest: 'quest', lantern: 'lantern', npc: 'npc', shop: 'shop', boss: 'eye', save: 'brush', race: 'flag', chest: 'chest', great: 'greatlantern' };
const KIND_COLOR = { quest: '#ffe2a0', lantern: '#ffc27a', npc: '#f3e9d4', shop: '#ffe2a0', boss: '#ff8a6a', save: '#bcd9ff', race: '#8ee6ab', chest: '#ffe2a0', great: '#ffd77c' };
const SVGNS = 'http://www.w3.org/2000/svg';

function ringSvg(cls, r) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '-50 -50 100 100');
  if (cls) s.setAttribute('class', cls);
  const mk = (c) => { const e = document.createElementNS(SVGNS, 'circle'); e.setAttribute('r', r); e.setAttribute('class', c); s.appendChild(e); return e; };
  mk('trk');
  const arc = mk('arc');
  const len = 2 * Math.PI * r;
  arc.setAttribute('stroke-dasharray', len.toFixed(2));
  arc.setAttribute('stroke-dashoffset', len.toFixed(2));
  s._arc = arc; s._len = len; s._v = -1;
  return s;
}
function setRing(s, v) {
  v = Math.round(clamp(v) * 200) / 200;
  if (s._v === v) return;
  s._v = v;
  s._arc.setAttribute('stroke-dashoffset', (s._len * (1 - v)).toFixed(2));
}

function makeBar(parent) {
  const bar = el('div', 'hud-bar', parent);
  const ghost = el('i', 'ghost', bar), fill = el('i', 'fill', bar);
  return { bar, ghost, fill, f: -1, g: 1, gw: -1, w: -1 };
}
/** Fill follows at once; the pale ghost trails behind when the value drops. */
function setBar(b, frac, rdt) {
  frac = clamp(frac);
  if (b.g < frac) b.g = frac; else if (b.g - frac > 0.001) b.g = Math.max(frac, b.g - Math.max(0.05, (b.g - frac) * 1.6) * rdt); else b.g = frac;
  const f = Math.round(frac * 500) / 500, g = Math.round(b.g * 500) / 500;
  if (f !== b.f) { b.f = f; b.fill.style.transform = `scaleX(${f})`; }
  if (g !== b.gw) { b.gw = g; b.ghost.style.transform = `scaleX(${g})`; }
}
function setWidth(b, wU) { wU = Math.round(wU); if (b.w !== wU) { b.w = wU; b.bar.style.width = `calc(var(--u)*${wU})`; } }

export function createHud(root) {
  const R = el('div', 'layer mv-hud', root);

  // ---------------- vitals ----------------
  const vit = el('div', 'hud-vit cg tsh', R);
  const orb = el('div', 'hud-orb', vit);
  const orbIn = el('div', 'in', orb);
  el('i', 'sun', orbIn);
  const moon = el('i', 'moon', orbIn);
  const bars = el('div', 'bars', vit);
  const lifeRow = el('div', 'row life', bars), life = makeBar(lifeRow), lifeNum = el('span', 'num', lifeRow);
  const manaRow = el('div', 'row mana', bars), mana = makeBar(manaRow), manaNum = el('span', 'num', manaRow);
  const statusRow = el('div', 'status', bars);
  const statusEl = {};
  for (const s of STATUS) {
    const b = el('span', 'st', statusRow);
    b.style.color = EL_COLOR[STATUS_ICON[s]];
    icon(STATUS_ICON[s], '', b);
    tel('span', '', b, 'core.status.' + s);
    statusEl[s] = b;
  }

  // ---------------- compass ----------------
  const compass = el('div', 'hud-compass cg', R);
  const strip = el('div', 'strip', compass);
  for (let a = -90; a <= 450; a += 15) {
    const x = (a + 90) * PPD;
    const n = ((a % 360) + 360) % 360;
    let e;
    if (n % 90 === 0) { const k = ['n', 'e', 's', 'w'][n / 90]; e = tel('span', 'card ' + k, strip, 'ui.compass.' + k); }
    else e = el('i', n % 45 === 0 ? 'tk m' : 'tk', strip);
    e.style.left = `calc(var(--u)*${x.toFixed(1)})`;
  }
  const compassMarks = el('div', '', compass);
  el('i', 'needle', compass);
  let lastStripX = 1e9;

  // ---------------- boss / duel ----------------
  const boss = el('div', 'hud-boss tsh', R);
  const bossName = el('div', 'nm', boss), bossSub = el('div', 'sub', boss);
  const bossBar = makeBar(el('div', 'wrap', boss));
  let bossData = null, bossFrac = 1;

  // ---------------- top right ----------------
  const tr = el('div', 'hud-tr', R);
  const dust = el('div', 'hud-count cg tsh', tr);
  icon('stardust', '', dust);
  const dustNum = el('span', '', dust, '0');
  let dustShown = -1, dustReal = -1;
  const tracker = el('div', 'hud-tracker tsh', tr);
  const trTitle = el('div', 'tt', tracker), trObj = el('div', 'ob', tracker), trProg = el('div', 'pg', tracker);
  const trBar = el('div', 'pb', tracker), trBarFill = el('i', '', trBar);
  let trackerKey = '';

  // ---------------- markers (world pins) ----------------
  const pins = el('div', 'layer cg', R);
  let markers = [];
  const pool = new Map();   // id -> { m, cm, pin, disc, ds, lb, ar, seen, distShown, st }

  // ---------------- crosshair ----------------
  const cross = el('div', 'hud-cross cg', R);
  const chargeRing = ringSvg('', 44);
  cross.appendChild(chargeRing);
  el('i', 'dot', cross);
  for (let i = 1; i <= 4; i++) el('i', 'tick t' + i, cross);

  // ---------------- lock-on ----------------
  const lock = el('div', 'hud-lock cg', R);
  const lockSq = el('div', 'sq', lock);
  for (let i = 0; i < 4; i++) el('i', '', lockSq);
  const lockHp = el('i', '', el('div', 'hp', lock));
  let lockHpV = -1;

  // ---------------- struggle ----------------
  const strg = el('div', 'hud-struggle tsh', R);
  tel('div', 'ttl', strg, 'ui.hud.struggle');
  const strgWrap = el('div', 'wrap', strg);
  const strgMine = el('i', 'mine', el('div', 'track', strgWrap));
  const strgSpark = el('i', 'spark', strgWrap);
  const strgHint = el('div', 'hint', strg);
  let strgTarget = null, strgV = 0.5, strgHintKey = '';

  // ---------------- prompt ----------------
  const prompt = el('div', 'hud-prompt', R);
  const promptKey = keycap('', prompt), promptTx = el('span', 'tx', prompt);
  let promptText = null;

  // ---------------- hints ----------------
  const hints = el('div', 'hud-hints cg tsh', R);
  const ride = el('div', 'ride', hints);
  const rideIc = icon('broom', '', ride), rideTx = el('span', '', ride);
  const hintList = el('div', '', hints);
  hintList.style.cssText = 'display:flex;flex-direction:column;gap:inherit';
  let hintKey = '', rideKey = '';

  // ---------------- spell cluster ----------------
  const spell = el('div', 'hud-spell cg tsh', R);
  const dango = el('div', 'hud-dango', spell);
  icon('dango', '', dango);
  const dangoNum = el('span', '', dango, '0');
  const dangoKey = keycap('', dango, 'sm');
  const trio = el('div', 'hud-trio', spell);
  const spPrev = el('div', 'hud-sp', trio), spPrevIc = icon('lock', '', spPrev);
  const spMain = el('div', 'hud-sp main', trio), spMainIc = icon('lock', '', spMain);
  const cdw = el('div', 'cdw', spMain);
  let cdLast = -1;
  const gaugeRing = ringSvg('ring', 47);
  spMain.appendChild(gaugeRing);
  tel('span', 'kei', spMain, 'ui.hud.gauge');
  const ult = el('div', 'ult', spMain);
  const ultKey = keycap('', ult, 'sm');
  tel('span', '', ult, 'ui.hud.gaugeReady');
  const spNext = el('div', 'hud-sp', trio), spNextIc = icon('lock', '', spNext);
  const cap = el('div', 'cap', trio);
  const capName = el('span', '', cap), capCost = el('span', 'cost', cap);
  icon('spirit', '', capCost);
  const capCostN = el('span', '', capCost);
  let spellKey = '', lastSel = null;

  function relabel() {
    setText(dangoKey, key('heal'));
    setText(ultKey, key('ultimate'));
    hintKey = ''; rideKey = ''; spellKey = ''; strgHintKey = ''; trackerKey = '';
    for (const p of pool.values()) p.distShown = -1;
    if (promptText) api.prompt(promptText, true);
    if (trackerData) api.setTracker(trackerData);
    if (bossData) { setText(bossName, bossData.name || ''); setText(bossSub, bossData.sub || ''); }
  }

  // ---------------- hints ----------------
  function buildHints(v, known) {
    const on = G.settings ? G.settings.hints !== false : true;
    const k = !on ? 'off' : v.onBroom ? 'broom' : v.gliding ? 'glide' : `g${known}${ability('guard') ? 'G' : ''}${ability('broom') ? 'B' : ''}`;
    if (k === hintKey) return;
    hintKey = k;
    clear(hintList);
    if (!on) return;
    const add = (action, textKey) => { const h = el('div', 'h', hintList); keycap(key(action), h); tel('span', '', h, 'ui.hint.' + textKey); };
    if (v.onBroom) { add('jump', 'ascend'); add('descend', 'descend'); add('sprint', 'boost'); add('broom', 'dismount'); }
    else if (v.gliding) { add('jump', 'glide'); }
    else {
      add('attack', 'attack');
      if (known > 0) add('cast', 'cast');
      add('dodge', 'dodge');
      if (ability('guard')) add('guard', 'guard');
      if (ability('broom')) add('broom', 'broom');
      if (known > 1) add('wheel', 'wheel');
    }
  }

  // ---------------- spell cluster ----------------
  function updateSpell(v) {
    const slots = spellSlots();
    let sel = selectedId();
    let known = 0, selIdx = -1;
    for (let i = 0; i < slots.length; i++) { if (slots[i].level > 0) known++; if (slots[i].id === sel) selIdx = i; }
    if (selIdx >= 0 && slots[selIdx].level <= 0) selIdx = -1;
    let prev = -1, next = -1;
    if (selIdx >= 0 && known > 1) {
      for (let k = 1; k < 8; k++) { const i = (selIdx + 8 - k) % 8; if (slots[i].level > 0) { prev = i; break; } }
      for (let k = 1; k < 8; k++) { const i = (selIdx + k) % 8; if (slots[i].level > 0) { next = i; break; } }
      if (known === 2) prev = -1;     // two 灵诀: show the other one once, on the right
    }
    const s = selIdx >= 0 ? slots[selIdx] : null;
    const k = `${selIdx}|${prev}|${next}|${known}|${s ? s.name + s.cost : ''}`;
    if (k !== spellKey) {
      spellKey = k;
      const put = (node, ic, i) => {
        node.classList.toggle('none', i < 0 && node !== spMain);
        if (i >= 0) { setIcon(ic, slots[i].id); node.style.setProperty('--sc', slots[i].color); }
        else if (node === spMain) { setIcon(ic, 'lock'); node.style.setProperty('--sc', '#8a7d70'); }
      };
      put(spPrev, spPrevIc, prev); put(spMain, spMainIc, selIdx); put(spNext, spNextIc, next);
      if (s) {
        cap.classList.remove('dim');
        setText(capName, s.name);
        capCost.style.display = s.cost > 0 ? '' : 'none';
        setText(capCostN, String(s.cost));
      } else {
        cap.classList.add('dim');
        setText(capName, t(known > 0 ? 'ui.hud.locked' : 'ui.hud.noSpell'));
        capCost.style.display = 'none';
      }
      if (lastSel !== null && (s ? s.id : '') !== lastSel) replay(spMain, 'swap');
      lastSel = s ? s.id : '';
    }
    setOn2(spMain, 'dry', !!s && s.cost > 0 && v.mana < s.cost);
    // cooldown sweep (big forms and other long cooldowns)
    const cdf = s ? Math.round(cooldownLeft(s) * 60) / 60 : 0;
    if (cdf !== cdLast) { cdLast = cdf; cdw.style.setProperty('--cd', String(cdf)); setOn2(spMain, 'cooling', cdf > 0); }
    const g = gauge();
    setRing(gaugeRing, g);
    setOn2(spMain, 'ready', g >= 0.999 && !!G.state?.abilities?.kinkan); // play-test: no "G 金环已满" before she holds 金环
    // charge ring around the crosshair, tinted with the element
    const c = charge();
    setOn2(cross, 'charging', c > 0.02);
    setOn2(cross, 'full', c >= 0.999);
    if (c > 0.02) {
      setRing(chargeRing, c);
      const col = s ? s.color : '#ffe2a0';
      if (cross._cc !== col) { cross._cc = col; cross.style.setProperty('--cc', col); }
    }
    return known;
  }
  function setOn2(node, cls, on) {
    const k = '_' + cls;
    if (node[k] !== on) { node[k] = on; node.classList.toggle(cls, on); }
  }

  // ---------------- markers ----------------
  function colorOf(m) { return m.color || KIND_COLOR[m.kind] || '#f3e9d4'; }
  function iconOf(m) { return m.icon && (hasIcon(m.icon) || String(m.icon).length <= 2) ? m.icon : KIND_ICON[m.kind] || 'pin'; }
  // marker layers: setMarkers(list, layer='main') replaces only that layer (race rings use 'race', quests 'main')
  const layers = new Map();
  const defIds = [];
  function setMarkers(list, layer = 'main') {
    layers.set(String(layer || 'main'), Array.isArray(list) ? list : []);
    markers = []; defIds.length = 0;
    for (const [ln, l] of layers) for (let j = 0; j < l.length; j++) { markers.push(l[j]); defIds.push(ln === 'main' ? 'm' + j : ln + ':' + j); }
    for (const p of pool.values()) p.seen = false;
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (!m || !m.pos) continue;
      const id = m.id !== undefined && m.id !== null ? String(m.id) : defIds[i];
      let p = pool.get(id);
      if (!p) {
        const cm = el('i', 'mk', compassMarks);
        const cmIc = icon('pin', '', cm);
        const pin = el('div', 'hud-pin tsh', pins);
        const ar = el('i', 'ar', pin);
        const disc = el('div', 'disc', pin);
        const pinIc = icon('pin', '', disc);
        const lb = el('div', 'lb', pin), ds = el('div', 'ds', pin);
        p = { cm, cmIc, pin, ar, disc, pinIc, lb, ds, distShown: -1, st: '', cst: '' };
        pool.set(id, p);
      }
      p.m = m; p.seen = true;
      const col = colorOf(m), ic = iconOf(m);
      if (p.col !== col) { p.col = col; p.cm.style.color = col; p.pin.style.color = col; }
      setIcon(p.cmIc, ic); setIcon(p.pinIc, ic);
      setText(p.lb, m.label || '');
    }
    for (const [id, p] of pool) if (!p.seen) { p.cm.remove(); p.pin.remove(); pool.delete(id); }
  }

  function updateCompass(heading) {
    const u = UI.u;
    const x = Math.round((200 - (heading + 90) * PPD) * u * 2) / 2;
    if (x !== lastStripX) { lastStripX = x; strip.style.transform = `translate3d(${x}px,0,0)`; }
  }

  let trRect = null;
  function projectMarkers(heading) {
    const cam = G.camera;
    const w = UI.w, h = UI.h, u = UI.u;
    const fp = (G.player && G.player.pos) || cam.position;
    const frame = G.time.frame;
    // play-test: in a duel the rival is the only goal on screen, so the quest pin over her is noise; a pin's label that lands
    // under the tracker (top right) is tucked away so the two lines of text never print over each other
    const inDuel = !!G.combat?.duel;
    if ((frame & 15) === 0 || trRect === null) { const r = tracker.getBoundingClientRect(); trRect = r.width > 0 && tracker.classList.contains('on') ? r : false; }
    for (const p of pool.values()) {
      const m = p.m, mp = m.pos;
      const dx = mp.x - fp.x, dz = mp.z - fp.z;
      const dist = Math.hypot(dx, dz);
      // compass
      let diff = Math.atan2(dx, -dz) * RAD2DEG - heading;
      diff = ((diff + 540) % 360) - 180;
      const lim = 78;
      const edge = Math.abs(diff) > lim;
      const cx = Math.round((200 + clamp(diff, -lim, lim) * PPD) * u * 2) / 2;
      const cst = cx + (edge ? 'e' : '');
      if (p.cst !== cst) {
        p.cst = cst;
        p.cm.style.transform = `translate3d(${cx}px,0,0)`;
        if (p.cmOn !== true) { p.cmOn = true; p.cm.classList.add('on'); }
        if (p.cmEdge !== edge) { p.cmEdge = edge; p.cm.classList.toggle('edge', edge); }
      }
      // world pin
      const tracked = m.kind === 'quest' || m.kind === 'boss' || m.track === true;
      const range = m.range || (tracked ? Infinity : 70);
      if (dist > range || dist < 2.5 || (inDuel && m.kind === 'quest')) { if (p.st !== 'off') { p.st = 'off'; p.pin.classList.remove('on'); } continue; }
      const my = typeof mp.y === 'number' ? mp.y : G.world.groundAt(mp.x, mp.z);
      _v.set(mp.x, my + (m.lift ?? 2.4), mp.z).applyMatrix4(cam.matrixWorldInverse);
      let nx, ny, on = false;
      if (_v.z < -0.2) {
        _v.applyMatrix4(cam.projectionMatrix);
        nx = _v.x; ny = _v.y;
        on = Math.abs(nx) < 0.9 && ny < 0.82 && ny > -0.72;
      } else {
        const l = Math.hypot(_v.x, _v.y);
        if (l < 1e-4) { nx = 0; ny = -4; } else { nx = (_v.x / l) * 4; ny = (_v.y / l) * 4 - 0.6; }
      }
      if (!on) {
        if (!tracked) { if (p.st !== 'off') { p.st = 'off'; p.pin.classList.remove('on'); } continue; }
        const k = Math.max(Math.abs(nx) / 0.9, ny > 0 ? ny / 0.82 : -ny / 0.72, 1e-6);
        nx /= k; ny /= k;
        // touch controls (src/ui/touch.js): the thumbs' buttons fill the lower corners and the right edge; edge pins stay above them
        if (UI.touch) { nx = clamp(nx, -0.74, 0.74); if (ny < 0.2) ny = 0.2; }
      }
      const sx = Math.round((nx * 0.5 + 0.5) * w);
      let sy = Math.round((-ny * 0.5 + 0.5) * h);
      // a pin that would sit on the tracker text (top right) drops just below it, label tucked away
      const tuck = !!trRect && sx > trRect.left - 80 * u && sy - 44 * u < trRect.bottom && sy > trRect.top - 40 * u;
      if (tuck) sy = Math.round(trRect.bottom + 22 * u);
      const st = on ? 'on' : 'edge';
      if (p.st !== st) { p.st = st; p.pin.classList.add('on'); p.pin.classList.toggle('edge', !on); }
      const near = on && Math.abs(sx - w / 2) < 46 * u && Math.abs(sy - h / 2) < 46 * u;
      if (p.near !== near) { p.near = near; p.pin.classList.toggle('near', near); }
      if (p.sx !== sx || p.sy !== sy) { p.sx = sx; p.sy = sy; p.pin.style.transform = `translate3d(${sx}px,${sy}px,0)`; }
      if (p.tuck !== tuck) { p.tuck = tuck; p.pin.classList.toggle('tuck', tuck); }
      if (!on) {
        const a = Math.round(Math.atan2(sx - w / 2, -(sy - h / 2)) * RAD2DEG);
        if (p.ang !== a) { p.ang = a; p.ar.style.transform = `rotate(${a}deg)`; }
      }
      if ((frame & 7) === 0) {
        const dn = dist < 100 ? Math.round(dist) : Math.round(dist / 10) * 10;
        if (p.distShown !== dn) { p.distShown = dn; setText(p.ds, t('ui.hud.dist', { n: dn })); }
      }
    }
  }

  function updateLock() {
    const tg = G.combat && G.combat.lockTarget;
    if (!tg || tg.dead || !tg.pos) { setOn(lock, false); return; }
    const cam = G.camera;
    _v.set(tg.pos.x, tg.pos.y + (tg.height || 1.4) * 0.55, tg.pos.z).applyMatrix4(cam.matrixWorldInverse);
    if (_v.z > -0.2) { setOn(lock, false); return; }
    const depth = -_v.z;
    _v.applyMatrix4(cam.projectionMatrix);
    if (Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { setOn(lock, false); return; }
    setOn(lock, true);
    const sx = Math.round((_v.x * 0.5 + 0.5) * UI.w), sy = Math.round((-_v.y * 0.5 + 0.5) * UI.h);
    const sc = clamp(((tg.radius || 0.6) * 2.4 * UI.h) / (depth * 1.15 * 56 * UI.u), 0.7, 2.6);
    const scr = Math.round(sc * 20) / 20;
    if (lock._sx !== sx || lock._sy !== sy || lock._sc !== scr) {
      lock._sx = sx; lock._sy = sy; lock._sc = scr;
      lock.style.transform = `translate3d(${sx}px,${sy}px,0) scale(${scr})`;
    }
    const f = typeof tg.hp === 'number' && tg.maxHp > 0 ? Math.round(clamp(tg.hp / tg.maxHp) * 50) / 50 : 1;
    if (f !== lockHpV) { lockHpV = f; lockHp.style.transform = `scaleX(${f})`; }
  }

  // ---------------- tracker ----------------
  let trackerData = null;

  const api = {
    root: R,
    relabel,
    get bossOn() { return !!bossData; },
    setWheel(on) { if (R._wh !== on) { R._wh = on; R.classList.toggle('wheel', on); } },
    setMarkers,
    get markers() { return markers; },
    /** key cap + verb at the bottom of the screen; the core passes "E  调查". */
    prompt(text, force) {
      if (text === promptText && !force) return;
      promptText = text || null;
      if (!promptText) { prompt.classList.remove('on'); return; }
      const m = /^(\S{1,6})\s{2,}(.+)$/.exec(promptText);
      promptKey.style.display = m ? '' : 'none';
      if (m) setText(promptKey, m[1]);
      setText(promptTx, m ? m[2] : promptText);
      prompt.classList.add('on');
    },
    setTracker(d) {
      trackerData = d || null;
      if (!d) { tracker.classList.remove('on'); trackerKey = ''; return; }
      let pg = '', frac = -1;
      const p = d.progress;
      if (typeof p === 'string') pg = p;
      else if (typeof p === 'number') { frac = clamp(p); }
      else if (p && typeof p === 'object') {
        const n = p.n ?? p.cur ?? p.value ?? p.count ?? 0, max = p.max ?? p.total ?? p.of ?? 0;
        pg = max ? `${n} / ${max}` : String(n);
        if (max) frac = clamp(n / max);
      }
      const k = `${d.title}|${d.objective}|${pg}|${frac}`;
      if (k === trackerKey) return;
      const first = !trackerKey;
      trackerKey = k;
      setText(trTitle, d.title || '');
      setText(trObj, d.objective || '');
      setText(trProg, pg);
      trProg.style.display = pg ? '' : 'none';
      trBar.classList.toggle('on', frac >= 0);
      if (frac >= 0) trBarFill.style.transform = `scaleX(${frac})`;
      tracker.classList.add('on');
      if (!first) replay(tracker, 'flash');
    },
    bossBar(d) {
      if (!d) { bossData = null; boss.classList.remove('on'); return; }
      const fresh = !bossData;
      bossData = d;
      setText(bossName, d.name || '');
      setText(bossSub, d.sub || '');
      bossSub.style.display = d.sub ? '' : 'none';
      const kind = d.kind || 'boss';
      if (boss._kind !== kind) { boss._kind = kind; boss.classList.toggle('duel', kind === 'duel'); boss.classList.toggle('shade', kind === 'shade'); }
      const col = d.color || (d.element && EL_COLOR[d.element]) || '';
      if (boss._col !== col) { boss._col = col; if (col) boss.style.setProperty('--bc', col); else boss.style.removeProperty('--bc'); }
      bossFrac = clamp((d.hp ?? 0) / (d.max || d.maxHp || 1));
      if (fresh) { bossBar.g = bossFrac; bossBar.f = -1; }
      boss.classList.add('on');
    },
    struggle(d) {
      if (!d) { strgTarget = null; strg.classList.remove('on'); return; }
      if (strgTarget === null) strgV = clamp(d.value ?? 0.5);
      strgTarget = clamp(d.value ?? 0.5);
      strg.classList.add('on');
    },

    update(rdt) {
      const mode = G.mode;
      const play = mode === 'play';
      const show = play || mode === 'talk' || mode === 'cutscene';
      if (R._show !== show) { R._show = show; R.classList.toggle('show', show); }
      if (R._calm !== !play) { R._calm = !play; R.classList.toggle('calm', !play); }
      // the quest tracker steps aside while the letterbox is up (cutscenes, cinematic talks)
      if (!R._lbox) R._lbox = R.parentElement?.querySelector('.mv-lbox') || null;
      const lb = !!R._lbox?.classList.contains('on');
      if (tracker._lb !== lb) { tracker._lb = lb; tracker.classList.toggle('lb', lb); }
      if (!show) return;
      const v = vitals();

      // vitals
      setWidth(life, clamp(150 + (v.maxHp - 100) * 0.9, 150, 250));
      setWidth(mana, clamp(128 + (v.maxMana - 100) * 0.8, 128, 216));
      setBar(life, v.hp / v.maxHp, rdt);
      setBar(mana, v.mana / v.maxMana, rdt);
      setText(lifeNum, String(Math.ceil(v.hp)));
      setText(manaNum, String(Math.floor(v.mana)));
      const low = v.hp / v.maxHp < 0.3 && !v.dead;
      if (vit._low !== low) { vit._low = low; vit.classList.toggle('low', low); }
      for (let i = 0; i < STATUS.length; i++) setOn(statusEl[STATUS[i]], v[STATUS[i]]);
      // the little sky: the Moon slides over the Sun as the Veil deepens
      const veil = Math.round(clamp(G.env.veil) * 50) / 50;
      if (moon._v !== veil) {
        moon._v = veil;
        const k = 1 - veil;
        moon.style.transform = `translate(calc(var(--u)*${(k * 21).toFixed(1)}), calc(var(--u)*${(-k * 9).toFixed(1)}))`;
      }

      // counters
      const sd = inv('stardust');
      if (dustReal !== sd) { if (dustReal >= 0 && sd > dustReal) replay(dust, 'bump'); dustReal = sd; if (dustShown < 0) dustShown = sd; }
      if (dustShown !== sd) {
        const step = Math.max(1, Math.ceil(Math.abs(sd - dustShown) * Math.min(1, rdt * 6)));
        dustShown += Math.sign(sd - dustShown) * Math.min(step, Math.abs(sd - dustShown));
      }
      setText(dustNum, String(dustShown));
      const dg = inv('dango');
      setText(dangoNum, String(dg));
      if (dango._none !== (dg <= 0)) { dango._none = dg <= 0; dango.classList.toggle('none', dg <= 0); }

      const known = updateSpell(v);
      buildHints(v, known);
      const rk = v.onBroom ? 'broom' : v.gliding ? 'glide' : '';
      if (rk !== rideKey) {
        rideKey = rk;
        ride.classList.toggle('on', !!rk);
        if (rk) { setIcon(rideIc, rk === 'broom' ? 'broom' : 'wings'); setText(rideTx, t('ui.hud.' + rk)); }
      }

      // crosshair: warm when the aim rests on something that can be hit
      const hot = !!(G.player && G.player.aim && G.player.aim.target);
      if (cross._hot !== hot) { cross._hot = hot; cross.classList.toggle('hot', hot); }

      // boss
      if (bossData) setBar(bossBar, bossFrac, rdt);
      // struggle
      if (strgTarget !== null) {
        strgV = damp(strgV, strgTarget, 14, rdt);
        const f = Math.round(strgV * 400) / 400;
        if (strg._f !== f || strg._u !== UI.u) {
          strg._f = f; strg._u = UI.u;
          strgMine.style.transform = `scaleX(${f})`;
          strgSpark.style.transform = `translate3d(${(f * 460 * UI.u).toFixed(1)}px,0,0)`;
        }
        const hk = key('attack');
        if (strgHintKey !== hk) {
          strgHintKey = hk;
          clear(strgHint);
          const parts = t('ui.hud.struggleHint', { key: '\u0001' }).split('\u0001');
          if (parts[0]) el('span', '', strgHint, parts[0].trim());
          keycap(hk, strgHint);
          if (parts[1]) el('span', '', strgHint, parts[1].trim());
        }
      }
    },

    /** after the camera moved: everything that is pinned to a point of the world */
    late() {
      if (!R._show) return;
      const cam = G.camera;
      cam.updateMatrixWorld();
      cam.getWorldDirection(_d);
      let heading = Math.atan2(_d.x, -_d.z) * RAD2DEG;
      if (heading < 0) heading += 360;
      updateCompass(heading);
      if (pool.size) projectMarkers(heading);
      updateLock();
    },
  };
  relabel();
  return api;
}
