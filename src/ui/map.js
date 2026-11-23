// The map tab: an ink-wash map of the island painted from the world functions (height, Veil, roads, rivers), plus DOM overlays
// for place names, lanterns, quest markers and the player arrow. The base image is painted progressively (a few ms per frame).
import { BELL, BELL_WALL } from '../data/bellcrown.js';
import { WORLD } from '../data/world.js';
import { JOURNEY_POI, JOURNEY_ANCHORS } from '../data/journey-map.js';
import { episodes, countries, countryOfRegion } from '../data/episodes.js';   // the episode / country registry
import { stampArt } from './stamps.js';
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { UI, K, el, tel, clear, setText, codeLabel, hintLine, sfx } from './dom.js';
import { icon, setIcon } from './icons.js';
import { addCss } from './style.js';

addCss(`
.mp { position: absolute; inset: 0; display: flex; gap: 22u; }
.mp-view { position: relative; flex: 1; overflow: hidden; background: #1c2333; cursor: grab; pointer-events: auto; touch-action: none; border-radius: 3u;
  box-shadow: 0 0 0 1u var(--brass3), 0 0 0 4u #f7f0e2, 0 0 0 5u rgba(122,92,46,.45), inset 0 0 40u rgba(0,0,0,.3), 0 4u 14u rgba(60,40,20,.22); }
.mp-view.drag { cursor: grabbing; }
.mp-view canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.mp-ov { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.mp-lbl { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; font: 600 13u/1.2 var(--fd); color: var(--ink); letter-spacing: .08em;
  text-shadow: 0 0 3u rgba(246,239,224,.95), 0 0 6u rgba(246,239,224,.8); }
.mp-lbl.big { font-size: 19u; letter-spacing: .42em; color: rgba(42,36,30,.5); text-shadow: 0 0 4u rgba(246,239,224,.6); font-weight: 600; }
.mp-lbl.n { color: #f1e6ff; text-shadow: 0 0 3u rgba(10,10,30,.95), 0 0 8u rgba(10,10,30,.8); }
.mp-lbl.big.n { color: rgba(220,215,255,.5); text-shadow: none; }
.mp-lbl.poi::after { content: ''; position: absolute; left: 50%; bottom: -12u; width: 8u; height: 8u; margin-left: -4u; border-radius: 50%; background: var(--wine); box-shadow: 0 0 0 1.5u rgba(246,239,224,.9), 0 1u 3u rgba(0,0,0,.35); }
.mp-lbl.poi { transform: translate(-50%, calc(-100% - 9u)); z-index: 2; }
.mp-lbl.big { z-index: 0; }
.mp-ln { position: absolute; width: 9u; height: 9u; margin: -4.5u; border-radius: 50%; background: #3a3530; box-shadow: 0 0 0 1.5u rgba(246,239,224,.5); opacity: .7; }
.mp-ln.lit { background: var(--brass2); box-shadow: 0 0 0 1.5u #7a5a24, 0 0 10u 3u rgba(255,206,120,.7); opacity: 1; }
.mp-gl { position: absolute; width: 26u; height: 26u; margin: -13u; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15u;
  background: #1f2640; color: #8d93b6; box-shadow: 0 0 0 1.5u #8d93b6; }
.mp-gl.lit { background: radial-gradient(circle, #fff2c8, #ffc561 70%); color: #6a4410; box-shadow: 0 0 0 1.5u #7a5a24, 0 0 18u 6u rgba(255,196,96,.65); }
.mp-mk { z-index: 1; position: absolute; width: 26u; height: 26u; margin: -13u; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14u; color: #fff8ee;
  background: radial-gradient(circle at 36% 30%, color-mix(in srgb, var(--mc, #8b3343) 62%, #fff), var(--mc, #8b3343) 52%, color-mix(in srgb, var(--mc, #8b3343) 62%, #000));
  box-shadow: 0 0 0 1.5u #f7f0e2, 0 0 0 2.5u rgba(122,92,46,.4), 0 2u 6u rgba(0,0,0,.45); animation: mv-bob 2.2s ease-in-out infinite; }
.mp-mk .tx { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 6u; white-space: nowrap; font: 600 12u/1.2 var(--fd); color: var(--star); letter-spacing: .04em;
  background: rgba(18,26,47,.9); padding: 3u 9u; border-radius: 10u; box-shadow: inset 0 0 0 1u var(--hair); }
.mp-me { position: absolute; width: 34u; height: 34u; margin: -17u; z-index: 3; }
.mp-me::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, rgba(236,217,164,.55), rgba(236,217,164,0) 70%); animation: mv-pulse 1.6s ease-in-out infinite; }
.mp-me i { position: absolute; left: 50%; top: 50%; width: 0; height: 0; border-left: 8u solid transparent; border-right: 8u solid transparent; border-bottom: 22u solid var(--wine2);
  transform: translate(-50%, -62%); filter: drop-shadow(0 0 1.5u #fff8ec) drop-shadow(0 2u 3u rgba(0,0,0,.6)); }
.mp-me .nm { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 2u; font: 600 12u/1 var(--fd); color: var(--star); letter-spacing: .14em; white-space: nowrap; text-shadow: var(--halo); }
.mp-wait { position: absolute; left: 50%; bottom: 18u; transform: translateX(-50%); font: 600 14u/1 var(--fd); color: var(--star); letter-spacing: .24em; text-shadow: var(--halo); animation: mv-pulse 1.4s infinite; }
.mp-zoom { position: absolute; right: 12u; bottom: 12u; display: flex; flex-direction: column; gap: 6u; pointer-events: auto; }
.mp-zoom div { width: 28u; height: 28u; border-radius: 50%; color: var(--ink); font: 600 17u/28u var(--fd); text-align: center; cursor: pointer;
  background: radial-gradient(circle at 50% 35%, #fffaf0, #eadcbe); box-shadow: 0 0 0 1u var(--brass3), 0 2u 5u rgba(0,0,0,.35); transition: background .15s, color .15s; }
.mp-zoom div:hover { background: radial-gradient(circle at 50% 35%, #33467a, #121a33); color: var(--brass2); }
.mv-ui.touch .mp-zoom { gap: 10px; right: 10px; bottom: 10px; }
.mv-ui.touch .mp-zoom div { width: 44px; height: 44px; font-size: 22px; line-height: 44px; }
.mv-ui.compact .mp { gap: 14u; }
.mv-ui.compact .mp-side { width: 190u; overflow-y: auto; touch-action: pan-y; }
.mp-side { width: 232u; flex: none; display: flex; flex-direction: column; gap: 5u; color: var(--ink); }
.mp-side .here { padding: 10u 14u; margin-bottom: 6u; border-radius: 6u; background: rgba(148,113,47,.08); box-shadow: inset 0 0 0 1u rgba(148,113,47,.3); }
.mp-side .here .k { font: 600 11.5u/1.5 var(--fd); color: var(--brass3); letter-spacing: .24em; }
.mp-side .here .v { font: 700 21u/1.3 var(--fd); letter-spacing: .08em; }
.mp-side .here .s { font: 400 12.5u/1.5 var(--fb); color: var(--ink2); letter-spacing: .04em; }
.mp-side .sh { font: 600 12.5u/1 var(--fd); letter-spacing: .24em; color: var(--brass3); margin-top: 8u; display: flex; align-items: center; gap: 8u; }
.mp-side .sh::after { content: ''; flex: 1; height: 1u; background: linear-gradient(90deg, rgba(148,113,47,.5), transparent); }
.mp-side .gl { display: flex; align-items: center; gap: 8u; font: 400 13u/1.5 var(--fb); min-height: 21u; }
.mp-side .gl .d { width: 12u; height: 12u; border-radius: 50%; background: #3a3540; box-shadow: 0 0 0 1u #8d86a6; flex: none; }
.mp-side .gl.lit .d { background: radial-gradient(circle, #fff2c8, #ffc561 70%); box-shadow: 0 0 0 1u #7a5a24, 0 0 6u 1u rgba(255,196,96,.7); }
.mp-side .gl .st { margin-left: auto; font: 600 12u/1 var(--fd); color: var(--ink3); }
.mp-side .gl.lit .st { color: var(--brass3); }
.mp-side .lg { display: flex; align-items: center; gap: 8u; font: 400 13u/1.5 var(--fb); color: var(--ink2); min-height: 20u; }
.mp-side .lg .sw { width: 16u; height: 16u; flex: none; display: flex; align-items: center; justify-content: center; }
.mp-side .lg .sw.me { width: 0; height: 0; border-left: 6u solid transparent; border-right: 6u solid transparent; border-bottom: 15u solid var(--wine2); margin: 0 2u; }
.mp-side .lg .sw.place::before { content: ''; width: 8u; height: 8u; border-radius: 50%; background: var(--wine); }
.mp-side .lg .sw.lan::before { content: ''; width: 9u; height: 9u; border-radius: 50%; background: var(--brass2); box-shadow: 0 0 0 1.5u #7a5a24, 0 0 6u 2u rgba(255,206,120,.7); }
.mp-side .lg .sw.q { border-radius: 50%; background: radial-gradient(circle at 36% 30%, #c86373, var(--wine) 55%, #5a1d29); color: #fff; font-size: 10u; }
.mp-side .lg .sw.veil { border-radius: 50%; background: radial-gradient(circle, #121130 52%, #ffd27a 56%, #ffd27a 66%, transparent 70%); }
.mp-side .ft { margin-top: auto; font: 400 12u/1.8 var(--fb); color: var(--ink3); letter-spacing: .04em; }
/* travel stamps (src/data/episodes.js countries, art from stamps.js), grouped under a small chapter line per episode: inked,
   tilted and multiplied into the page once she has been there, a faint dashed outline before; a stamp with a place on the
   map flies the map there when clicked / tapped. The list scrolls (12+ episodes); on a phone the whole side panel does. */
.mp-side .sh .n { font: 500 11u/1 var(--fd); color: var(--ink3); letter-spacing: .04em; order: 2; }
.mp-stamps { flex: 1 1 0; min-height: 110u; margin: 2u -8u 4u 0; padding: 0 8u 4u 0; }
.mp-ch { display: flex; align-items: center; gap: 6u; margin: 7u 0 3u; font: 600 11u/1.35 var(--fd); color: var(--ink2); letter-spacing: .08em; white-space: nowrap; }
.mp-ch::before { content: ''; width: 7u; height: 7u; flex: none; background: var(--brass3); -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.mp-ch span { overflow: hidden; text-overflow: ellipsis; }
.mp-sg { display: grid; grid-template-columns: 1fr 1fr; gap: 4u 8u; }
.mp-stamp { position: relative; aspect-ratio: 1.4; color: var(--ink3); transition: transform .2s var(--ease); }
.mp-stamp::before { content: ''; position: absolute; inset: 7% 5%; border-radius: 10u; border: 1u dashed rgba(148,113,47,.5); }
.mp-stamp.rd::before { inset: 5% 18%; border-radius: 50%; }
.mp-stamp.ov::before { border-radius: 50%; }
.mp-stamp .art { position: absolute; inset: 0; background: var(--art) center / contain no-repeat; display: none; }
.mp-stamp .nm { position: absolute; left: 50%; top: var(--ny, 50%); width: var(--nw, 60%); transform: translate(-50%, -50%); text-align: center;
  font: 600 11u/1.15 var(--fd); letter-spacing: .02em; text-wrap: balance; word-break: break-all; }
.mp-stamp.on { color: var(--sk); transform: rotate(var(--tilt, 0deg)); }
.mp-stamp.on::before { display: none; }
.mp-stamp.on .art { display: block; opacity: .9; mix-blend-mode: multiply; }
.mp-stamp.on .nm { opacity: .92; mix-blend-mode: multiply; }
.mp-stamp.go { cursor: pointer; pointer-events: auto; }
.mp-stamp.go:hover { transform: rotate(var(--tilt, 0deg)) scale(1.05); }
.mp-ahead { margin: 8u 0 2u; font: 400 12u/1.5 var(--fb); color: var(--ink3); letter-spacing: .06em; text-align: center; }
/* where a clicked stamp sends the map: a brass ring that swells once and fades */
.mp-focus { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: 1;
  box-shadow: 0 0 0 2u rgba(201,164,94,.95), 0 0 14u 4u rgba(236,217,164,.55), inset 0 0 14u rgba(236,217,164,.45); animation: mp-focus 1.9s ease-out forwards; }
@keyframes mp-focus { 0% { opacity: 0; scale: .6; } 20% { opacity: 1; scale: 1; } 70% { opacity: .8; } 100% { opacity: 0; scale: 1.08; } }
.mv-ui.compact .mp-stamps { flex: none; min-height: 0; overflow: visible; margin-right: 0; padding-right: 0; }
.mv-ui.compact .mp-sg { gap: 2u 6u; }
.mv-ui.compact .mp-stamp .nm { font-size: 10.5u; }
.mv-ui.touch .mp-stamp { min-height: 44px; }
`);

// ---- base painting (shared, progressive) ------------------------------------------------------------------
const N = 512;                   // base image size (px)
const EXT = WORLD.half;                 // world half-extent painted
const MPP = (2 * EXT) / N;       // metres per pixel
const base = { cv: null, ctx: null, img: null, row: 0, done: false, hPrev: null, hCur: null, cent: null };

function mix(a, b, k) { return a + (b - a) * k; }
function syncMapLake() {
  const W=G.world;if(!W)return;
  const wet=W.trialLakeActive();
  if(base.wet===wet)return;
  base.wet=wet;
  if(!base.cv)return;
  // Preserve the already drawn atlas. Only the horizontal strip containing the
  // collapsed basin needs fresh contours and shore shading.
  const first=Math.max(0,Math.floor((W.trialLake.z0+EXT)/MPP)-2);
  const last=Math.min(N,Math.ceil((W.trialLake.z1+EXT)/MPP)+2);
  if(base.done){base.stop=last;base.row=first;}
  else if(base.row>first)base.row=first;
  base.done=false;
  const z=-EXT+(base.row-.5)*MPP;
  for(let i=0;i<N;i++)base.hPrev[i]=W.heightAt(-EXT+(i+.5)*MPP,z);
}
function paintRows(budgetMs) {
  const W = G.world;
  syncMapLake();
  if(!W||base.done)return;
  if (!base.cv) {
    base.cv = document.createElement('canvas'); base.cv.width = base.cv.height = N;
    base.ctx = base.cv.getContext('2d');
    base.img = base.ctx.createImageData(N, N);
    base.hPrev = new Float32Array(N); base.hCur = new Float32Array(N);
    base.cent = {};
  }
  const d = base.img.data;
  const t0 = performance.now();
  const sea = W.seaLevel || 0;
  const stop=base.stop??N;
  const firstRow=base.row;
  while (base.row < stop && performance.now() - t0 < budgetMs) {
    const j = base.row;
    const z = -EXT + (j + 0.5) * MPP;
    const hp = base.hPrev, hc = base.hCur;
    for (let i = 0; i < N; i++) hc[i] = W.heightAt(-EXT + (i + 0.5) * MPP, z);
    for (let i = 0; i < N; i++) {
      const x = -EXT + (i + 0.5) * MPP;
      const h = hc[i];
      const hl = i > 0 ? hc[i - 1] : h, hu = j > 0 ? hp[i] : h;
      const v = W.veilAt(x, z);
      // hillshade, light from the north-west
      const sh = Math.max(-1, Math.min(1, ((hl - h) + (hu - h)) * 0.16));
      let r, g, b;
      if (h < sea - 0.4) {
        const dep = Math.min(1, (sea - h) / 30);
        r = mix(150, 96, dep); g = mix(178, 128, dep); b = mix(184, 150, dep);
        // a pale ripple band along the coast
        if (h > sea - 2.2) { r += 30; g += 26; b += 18; }
      } else {
        const e = Math.min(1, Math.max(0, h / 150));
        // meadow sage -> ochre -> stone
        r = e < 0.5 ? mix(206, 214, e * 2) : mix(214, 170, (e - 0.5) * 2);
        g = e < 0.5 ? mix(208, 190, e * 2) : mix(190, 160, (e - 0.5) * 2);
        b = e < 0.5 ? mix(160, 138, e * 2) : mix(138, 150, (e - 0.5) * 2);
        if (h > 150) { const s = Math.min(1, (h - 150) / 40); r = mix(r, 236, s); g = mix(g, 236, s); b = mix(b, 240, s); }
        r += sh * 46; g += sh * 42; b += sh * 36;
        // contour lines every 25 m, coastline in ink
        const c0 = Math.floor(h / 25), c1 = Math.floor(hl / 25), c2 = Math.floor(hu / 25);
        if (c0 !== c1 || c0 !== c2) { r *= 0.86; g *= 0.85; b *= 0.84; }
        if (hl < sea - 0.4 || hu < sea - 0.4) { r *= 0.45; g *= 0.42; b *= 0.42; }
        else {
          const rv = W.riverDist ? W.riverDist(x, z) : 99;
          if (rv < 7) { const k = rv < 4.5 ? 1 : (7 - rv) / 2.5; r = mix(r, 96, k); g = mix(g, 140, k); b = mix(b, 174, k); }
          const rd = W.roadDist ? W.roadDist(x, z) : 99;
          if (rd < 2.4 && ((i + j) % 5) < 3) { r = 150; g = 84; b = 56; }
        }
      }
      // the Veil: ink-indigo night laid over the land
      if (v > 0.001) {
        const k = v * v * (3 - 2 * v) * 0.78;
        r = mix(r, r * 0.25 + 18, k); g = mix(g, g * 0.25 + 22, k); b = mix(b, b * 0.3 + 70, k);
        if (v > 0.6 && ((i * 73856093) ^ (j * 19349663)) % 211 === 0) { r = 255; g = 236; b = 190; } // lamp-lights
      }
      const o = (j * N + i) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      // coarse region centroids for labels
      if ((i & 7) === 4 && (j & 7) === 4 && W.regionAt && h > sea - 3) {
        const id = W.regionAt(x, z);
        const c = base.cent[id] || (base.cent[id] = { x: 0, z: 0, n: 0 });
        c.x += x; c.z += z; c.n++;
      }
    }
    base.hPrev = hc; base.hCur = hp;
    base.row++;
  }
  if(base.row>firstRow)base.ctx.putImageData(base.img,0,0,0,firstRow,N,base.row-firstRow);
  if (base.row >= stop) { base.ctx.putImageData(base.img, 0, 0); base.done = true; base.stop=null; base.sea = `rgb(${d[0]},${d[1]},${d[2]})`; }
}
/** Paint a little of the map in the background (called while playing). */
export function idlePaint(ms) { try { paintRows(ms); } catch (e) { base.done = true; G.reportError('ui:map', e); } }
export const mapReady = () => {syncMapLake();return base.done;};

// ---- travel stamps: one per country of the episode registry (src/data/episodes.js) ------------------------------------
// Every region id belongs to one country (countryOfRegion); entering it stamps that country and every country before it in
// journey order (the road is one road, so an old save that is already far along gets its earlier stamps the first time a
// region is entered). Save: G.state.stamps[countryId] = 1.
/** Record a visit (called on every 'region:enter'); writes G.state.stamps. */
export function stampVisit(id) {
  const c = id ? countryOfRegion(id) : null;
  const st = G.state;
  if (!c || !st) return;
  if (!st.stamps || typeof st.stamps !== 'object') st.stamps = {};
  for (const x of countries()) { st.stamps[x.id] = 1; if (x === c) break; }
}
/** World position (+ radius) a country's map anchor names: journey places first, then the world's, then story anchors. */
function anchorAt(id) {
  if (!id) return null;
  const p = JOURNEY_POI[id] || G.world?.POI?.[id] || JOURNEY_ANCHORS[id];
  return p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z, r: Number.isFinite(p.r) && p.r > 0 ? p.r : 90 } : null;
}

// ---- the tab -----------------------------------------------------------------------------------------------
const BIG = new Set(['wilds']);
// broad regions are rings or wide fields: their centroid is a poor place for a name, so they get a hand-picked spot
const SPOT = { sunmeadow: { x: -300, z: 330 }, duskwood: { x: 40, z: 250 }, evernight: { x: 300, z: 70 } };
const view = { cx: -40, cz: 0, zoom: 1 };   // zoom 1 = whole island fits the height
UI.mapView = view;                         // tests read the map's pan / zoom (G.ui.debug.UI.mapView)

export function createMapTab(parent, providers) {
  const R = el('div', 'mp', parent);
  const vw = el('div', 'mp-view', R);
  const cv = el('canvas', '', vw);
  const ctx = cv.getContext('2d');
  const ov = el('div', 'mp-ov', vw);
  const wait = tel('div', 'mp-wait', vw, 'ui.map.painting');
  const zm = el('div', 'mp-zoom', vw);
  const zIn = el('div', '', zm, '+'), zOut = el('div', '', zm, '−');
  const side = el('div', 'mp-side', R);

  // side panel
  const here = el('div', 'here', side);
  const hereK = tel('div', 'k', here, 'ui.map.here'); void hereK;
  const hereV = el('div', 'v', here), hereS = el('div', 's', here);
  const atlasH = tel('div', 'sh', side, 'world.atlas');
  const atlasN = el('span', 'n', atlasH);
  const stampsEl = el('div', 'mp-stamps scroll', side);
  // An episode shows once it is under way (a stamp from it, or one of its quests in the journal); the ones after it stay
  // a single line, so the panel grows with the journey and names no country before its time.
  function paintStamps() {
    clear(stampsEl);
    const got = (G.state && G.state.stamps) || {};
    let qs = [];
    try { qs = (providers.journal && providers.journal()) || []; } catch (e) { G.reportError('ui:journal', e); }
    const started = new Set((Array.isArray(qs) ? qs : []).map((q) => q && q.id));
    const cs = countries();
    let n = 0, ahead = false;
    const group = (label, list) => {
      if (label) { const h = el('div', 'mp-ch', stampsEl); el('span', '', h, label); }
      const g = el('div', 'mp-sg', stampsEl);
      for (const c of list) {
        const on = !!got[c.id], a = stampArt(c), at = anchorAt(c.anchor);
        if (on) n++;
        const sp = el('div', 'mp-stamp' + (on ? ' on' : '') + (at ? ' go' : '') + (a.shape === 'circle' || a.shape === 'scalloped' ? ' rd' : a.shape === 'oval' ? ' ov' : ''), g);
        sp.style.setProperty('--sk', a.ink); sp.style.setProperty('--tilt', a.tilt + 'deg'); sp.style.setProperty('--art', a.url);
        sp.style.setProperty('--ny', a.nameY + '%'); sp.style.setProperty('--nw', a.nameW + '%');
        el('i', 'art', sp); el('span', 'nm', sp, c.name ? t(c.name) : c.id);
        if (at) sp.addEventListener('click', () => { flyTo(at); sfx('ui_move', 0.5); });
      }
    };
    for (const ep of episodes()) {
      const list = cs.filter((c) => c.episode === ep.id);
      if (!list.length) continue;
      const open = list.some((c) => got[c.id]) || (ep.quests || []).some((q) => started.has(q));
      if (!open) { ahead = true; continue; }
      group(ep.title ? t(ep.title) : '', list);
    }
    const loose = cs.filter((c) => !episodes().some((e) => e.id === c.episode));   // countries of no listed episode: last, unlabelled
    if (loose.length) group('', loose);
    if (ahead) tel('div', 'mp-ahead', stampsEl, 'ui.map.roadAhead');
    atlasN.textContent = t('ui.map.stampCount', { n });
  }
  tel('div','sh',side,'ui.map.legend');
  const leg=(cls,key,ic)=>{const r=el('div','lg',side),sw=el('span','sw '+cls,r);if(ic)icon(ic,'',sw);tel('span','',r,key);};
  leg('me','ui.map.legendYou');leg('place','ui.map.legendPlace');leg('q','ui.map.legendQuest','quest');
  const foot = el('div', 'ft', side);

  // overlay pools
  const labels = [], lanterns = [], greats = [], marks = [];
  let me = null;
  let W = 0, H = 0, scale = 1;

  function build() {
    clear(ov); labels.length = lanterns.length = greats.length = marks.length = 0;
    if (focus) ov.appendChild(focus);
    const Wd = G.world;
    if (!Wd) return;
    const st = G.state || {};
    const disc = st.discovered || {};
    const used = new Set();
    // region + place labels
    const districts=['inn','roof','gate','bellkeep','lookout'];
    const ids=[...new Set(['hometown','forest','wilds','bellcrown',...(G.world.trialLakeActive()?['trialLake']:[]),...districts,...Object.keys(disc).filter(k=>disc[k]),G.env?.region])].filter(Boolean);
    for (const id of ids) {
      if (!has('world.place.' + id) || id === 'sea') continue;
      const name = t('world.place.' + id);
      if (used.has(name)) continue;
      let p = SPOT[id] || Wd.POI?.[id] || (id === 'mirrorlake' ? Wd.POI?.lake : id === 'moonmoat' ? { x: Wd.MOAT.x + Wd.MOAT.r1 * 0.72, z: Wd.MOAT.z + Wd.MOAT.r1 * 0.72 } : null);
      if (id === 'frostpeak' && Wd.MOUNTAIN) p = { x: Wd.MOUNTAIN.x - 90, z: Wd.MOUNTAIN.z + 40 };
      if (!p && base.cent && base.cent[id]) { const c = base.cent[id]; p = { x: c.x / c.n, z: c.z / c.n }; }
      if (!p) continue;
      used.add(name);
      const big = BIG.has(id);
      const night = (Wd.veilAt ? Wd.veilAt(p.x, p.z) : 0) > 0.45;
      const n = el('div', 'mp-lbl' + (big ? ' big' : ' poi') + (night ? ' n' : ''), ov, name);
      n._x = p.x; n._z = p.z + (big ? 0 : 0);
      n._district = districts.includes(id);
      labels.push(n);
    }
    // provider markers
    let list = [];
    try { list = (providers.mapMarkers && providers.mapMarkers()) || []; } catch (e) { G.reportError('ui:mapMarkers', e); }
    for (const m of list) {
      if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.z)) continue;
      const n = el('div', 'mp-mk', ov);
      if (m.color) n.style.setProperty('--mc', m.color);
      icon(m.icon || (m.kind === 'lantern' ? 'lantern' : 'quest'), '', n);
      if (m.label) el('span', 'tx', n, String(m.label));
      n._x = m.x; n._z = m.z; n._kind = m.kind; marks.push(n);
    }
    me = el('div', 'mp-me', ov); el('i', '', me); tel('span', 'nm', me, 'ui.map.you');
    // side panel
    const env = G.env || {};
    setText(hereV, env.region && has('world.place.' + env.region) ? t('world.place.' + env.region) : t('world.name'));
    setText(hereS, env.region && has('world.sub.' + env.region) ? t('world.sub.' + env.region) : '');
    paintStamps();
    if (G.input?.touch) foot.textContent = t('ui.touch.mapHint'); else hintLine(foot, 'ui.menu.hintMap', { ok: codeLabel('Enter') });
  }

  function focusPlayer() {
    const p = G.player?.pos || G.env?.focus || G.camera.position;
    view.cx = p.x; view.cz = p.z;
  }

  const toScreen = (x, z) => [(x - view.cx) * scale + W / 2, (z - view.cz) * scale + H / 2];
  const toWorld = (sx, sy) => [(sx - W / 2) / scale + view.cx, (sy - H / 2) / scale + view.cz];

  // play-test: around the shrine and the village a handful of names printed over each other. Keep the first of any
  // overlapping text — quest labels, then place names, then the rest — and hide the others until the view separates them.
  function declutter() {
    const taken = [], items = [];
    const hit = (r) => taken.some((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
    for (const n of marks) { const tx = n.querySelector('.tx'); if (tx) items.push([n._kind === 'quest' ? 0 : 2, tx]); }
    for (const n of labels) {
      n.style.display = n._district && view.zoom < 3.7 ? 'none' : '';
      if (n.style.display !== 'none' && !n.classList.contains('big')) items.push([1, n]);
    }
    items.sort((a, b) => a[0] - b[0]);
    for (const [, e] of items) {
      e.style.visibility = '';
      const r = e.getBoundingClientRect();
      if (hit(r)) e.style.visibility = 'hidden'; else taken.push(r);
    }
  }

  function draw() {
    const r = vw.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width < 2) return;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    W = r.width; H = r.height;
    scale = Math.min(W/(2*EXT+200),H/2450)*view.zoom;   // px per metre
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // paper-sea background
    ctx.fillStyle = base.sea || '#608096'; ctx.fillRect(0, 0, W, H);
    if (base.cv) {
      ctx.imageSmoothingEnabled = true;
      const [x0, y0] = toScreen(-EXT, -EXT);
      ctx.drawImage(base.cv, x0, y0, 2 * EXT * scale, 2 * EXT * scale);
    }
    const Wd = G.world;
    if (Wd?.ROADS) {
      ctx.save(); ctx.strokeStyle = 'rgba(112,76,53,.55)'; ctx.lineWidth = Math.max(.85,scale * 1.9);
      ctx.lineCap = 'round';
      for (const road of Wd.ROADS) {
        ctx.beginPath();
        road.pts.forEach(([x,z],i) => { const [sx,sy] = toScreen(x,z); if(i)ctx.lineTo(sx,sy);else ctx.moveTo(sx,sy); });
        ctx.stroke();
      }
      ctx.beginPath();
      BELL_WALL.forEach(([x,z],i) => { const [sx,sy]=toScreen(BELL.x+x,BELL.z+z);if(i)ctx.lineTo(sx,sy);else ctx.moveTo(sx,sy); });
      ctx.closePath();ctx.fillStyle='rgba(151,112,89,.12)';ctx.fill();ctx.strokeStyle='#8f735c';ctx.stroke();
      ctx.restore();
    }
    // vignette of old paper
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(60,40,20,0)'); vg.addColorStop(1, 'rgba(40,28,14,.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // overlays
    const place = (n) => { const [x, y] = toScreen(n._x, n._z); n.style.transform = ''; n.style.left = x.toFixed(1) + 'px'; n.style.top = y.toFixed(1) + 'px'; };
    labels.forEach(place); lanterns.forEach(place); greats.forEach(place); marks.forEach(place);
    if (focus) { place(focus); const d = (Math.max(14, 2 * focus._r * scale)).toFixed(1) + 'px'; focus.style.width = focus.style.height = d; }
    declutter();
    if (me) {
      const p = G.player?.pos || G.env?.focus || G.camera.position;
      place(Object.assign(me, { _x: p.x, _z: p.z }));
      G.camera.getWorldDirection(_dir);
      let yaw = Math.atan2(_dir.x, -_dir.z);
      if (G.player && Number.isFinite(G.player.yaw)) yaw = Math.PI - G.player.yaw;
      me.querySelector('i').style.transform = `translate(-50%,-62%) rotate(${yaw.toFixed(3)}rad)`;
      me.querySelector('i').style.transformOrigin = '50% 62%';
    }
    wait.style.display = base.done ? 'none' : '';
  }
  const _dir = new G.THREE.Vector3();

  // mouse / one finger: drag to pan; wheel or two fingers (pinch): zoom about the point under them
  const ptrs = new Map();   // pointerId -> { x, y }
  let drag = null, pinch = null;
  const startDrag = () => { const p = ptrs.values().next().value; drag = p ? { x: p.x, y: p.y, cx: view.cx, cz: view.cz } : null; };
  const pinchState = () => {
    const [a, b] = [...ptrs.values()];
    return { d: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  vw.addEventListener('pointerdown', (e) => {
    fly = null;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    vw.setPointerCapture?.(e.pointerId); vw.classList.add('drag');
    if (ptrs.size === 1) startDrag();
    else if (ptrs.size === 2) { drag = null; pinch = { ...pinchState(), zoom: view.zoom }; }
  });
  vw.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && ptrs.size >= 2) {
      const s2 = pinchState();
      // keep the map point under the fingers' midpoint where it is while the spread zooms
      const r = vw.getBoundingClientRect();
      const [wx, wz] = toWorld(pinch.mx - r.left, pinch.my - r.top);
      view.zoom = Math.min(12, Math.max(0.8, pinch.zoom * (s2.d / pinch.d)));
      scale = Math.min(W / (2 * EXT + 200), H / 2450) * view.zoom;
      const [sx2, sy2] = toScreen(wx, wz);
      view.cx += (sx2 - (s2.mx - r.left)) / scale; view.cz += (sy2 - (s2.my - r.top)) / scale;
      pinch.mx = s2.mx; pinch.my = s2.my; pinch.d = s2.d; pinch.zoom = view.zoom;
      clampView();
    } else if (drag) { view.cx = drag.cx - (e.clientX - drag.x) / scale; view.cz = drag.cz - (e.clientY - drag.y) / scale; clampView(); }
  });
  const lift = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 1) startDrag();
    if (ptrs.size === 0) { drag = null; vw.classList.remove('drag'); }
  };
  vw.addEventListener('pointerup', lift);
  vw.addEventListener('pointercancel', lift);
  vw.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  zIn.addEventListener('pointerdown', (e) => { e.stopPropagation(); zoomBy(1.3); });
  zOut.addEventListener('pointerdown', (e) => { e.stopPropagation(); zoomBy(1 / 1.3); });
  function zoomBy(f) { fly = null; view.zoom = Math.min(12, Math.max(0.8, view.zoom * f)); clampView(); }
  function clampView() { view.cx = Math.max(-EXT, Math.min(EXT, view.cx)); view.cz = Math.max(-EXT, Math.min(EXT, view.cz)); }

  // a travel stamp clicked: glide (pan + zoom) so the country's anchor circle fills about 40 % of the view, ring it once
  let fly = null, focus = null;
  function flyTo(at) {
    const r = vw.getBoundingClientRect(), w = r.width || W || 1, h = r.height || H || 1;
    const base = Math.min(w / (2 * EXT + 200), h / 2450);
    const k1 = Math.min(12, Math.max(0.8, (Math.min(w, h) * 0.4) / (Math.max(8, at.r) * base)));
    fly = { t0: performance.now(), x0: view.cx, z0: view.cz, k0: view.zoom, x1: at.x, z1: at.z, k1 };
    focus?.remove();
    focus = el('div', 'mp-focus', ov);
    focus._x = at.x; focus._z = at.z; focus._r = at.r;
    setTimeout(() => { if (focus && focus._x === at.x && focus._z === at.z) { focus.remove(); focus = null; } }, 2000);
  }
  function stepFly() {
    if (!fly) return;
    const k = Math.min(1, (performance.now() - fly.t0) / 560), e = 1 - Math.pow(1 - k, 3);
    view.cx = fly.x0 + (fly.x1 - fly.x0) * e; view.cz = fly.z0 + (fly.z1 - fly.z0) * e;
    view.zoom = Math.exp(Math.log(fly.k0) + (Math.log(fly.k1) - Math.log(fly.k0)) * e);
    clampView();
    if (k >= 1) fly = null;
  }

  return {
    el: R,
    show() {
      if (!mapReady()) idlePaint(40);
      build();
      if (view.zoom > 1.05) focusPlayer(); else { view.cx=0; view.cz=0; }
      draw();
    },
    render() { build(); },
    update() {
      if (!mapReady()) { idlePaint(9); if (base.done) build(); }
      stepFly();
      draw();
    },
    keys() {
      if (fly && (G.input.codeHeld('ArrowLeft') || G.input.codeHeld('ArrowRight') || G.input.codeHeld('ArrowUp') || G.input.codeHeld('ArrowDown'))) fly = null;
      const sp = 260 / (view.zoom * 6);
      if (G.input.codeHeld('ArrowLeft') || G.input.codeHeld('KeyA')) view.cx -= sp;
      if (G.input.codeHeld('ArrowRight') || G.input.codeHeld('KeyD')) view.cx += sp;
      if (G.input.codeHeld('ArrowUp') || G.input.codeHeld('KeyW')) view.cz -= sp;
      if (G.input.codeHeld('ArrowDown') || G.input.codeHeld('KeyS')) view.cz += sp;
      if (K.code('Equal') || K.code('NumpadAdd')) zoomBy(1.3);
      if (K.code('Minus') || K.code('NumpadSubtract')) zoomBy(1 / 1.3);
      if (K.confirm(false)) { fly = null; focusPlayer(); view.zoom = Math.max(view.zoom, 1.6); }
      clampView();
    },
    view,
  };
}
export { UI };
