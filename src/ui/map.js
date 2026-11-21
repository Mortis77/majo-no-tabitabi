// The map tab: an ink-wash map of the island painted from the world functions (height, Veil, roads, rivers), plus DOM overlays
// for place names, lanterns, quest markers and the player arrow. The base image is painted progressively (a few ms per frame).
import { BELL, BELL_WALL } from '../data/bellcrown.js';
import { WORLD } from '../data/world.js';
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { UI, K, el, tel, clear, setText, codeLabel, hintLine } from './dom.js';
import { icon, setIcon } from './icons.js';
import { addCss } from './style.js';

addCss(`
.mp { position: absolute; inset: 0; display: flex; gap: 22u; }
.mp-view { position: relative; flex: 1; overflow: hidden; background: #1c2333; cursor: grab; pointer-events: auto; touch-action: none;
  box-shadow: 0 0 0 1u var(--gold), 0 0 0 5u var(--paper), 0 0 0 6u rgba(35,31,29,.4), inset 0 0 40u rgba(0,0,0,.35); }
.mp-view.drag { cursor: grabbing; }
.mp-view canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.mp-ov { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.mp-lbl { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; font: 700 13u/1.2 var(--ft); color: var(--ink); letter-spacing: .14em;
  text-shadow: 0 0 3u rgba(243,233,212,.95), 0 0 6u rgba(243,233,212,.8); }
.mp-lbl.big { font-size: 19u; letter-spacing: .5em; color: rgba(35,31,29,.55); text-shadow: 0 0 4u rgba(243,233,212,.6); font-weight: 600; }
.mp-lbl.n { color: #f1e6ff; text-shadow: 0 0 3u rgba(10,10,30,.95), 0 0 8u rgba(10,10,30,.8); }
.mp-lbl.big.n { color: rgba(220,215,255,.5); text-shadow: none; }
.mp-lbl.poi::after { content: ''; position: absolute; left: 50%; bottom: -12u; width: 7u; height: 7u; margin-left: -3.5u; background: var(--red); transform: rotate(45deg); box-shadow: 0 0 0 1.5u rgba(243,233,212,.85); }
.mp-lbl.poi { transform: translate(-50%, calc(-100% - 9u)); z-index: 2; }
.mp-lbl.big { z-index: 0; }
.mp-ln { position: absolute; width: 9u; height: 9u; margin: -4.5u; border-radius: 50%; background: #3a3530; box-shadow: 0 0 0 1.5u rgba(243,233,212,.5); opacity: .7; }
.mp-ln.lit { background: var(--gold2); box-shadow: 0 0 0 1.5u #7a4e1a, 0 0 10u 3u rgba(255,200,100,.75); opacity: 1; }
.mp-gl { position: absolute; width: 26u; height: 26u; margin: -13u; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15u;
  background: #262033; color: #8d86a6; box-shadow: 0 0 0 1.5u #8d86a6; }
.mp-gl.lit { background: radial-gradient(circle, #fff2c8, #ffbf55 70%); color: #6a3a10; box-shadow: 0 0 0 1.5u #7a4e1a, 0 0 18u 6u rgba(255,190,90,.7); }
.mp-mk { z-index: 1; position: absolute; width: 26u; height: 26u; margin: -13u; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15u; color: #fff;
  background: var(--mc, var(--red)); box-shadow: 0 0 0 1.5u var(--paper), 0 2u 6u rgba(0,0,0,.5); animation: mv-bob 2.2s ease-in-out infinite; }
.mp-mk .tx { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 4u; white-space: nowrap; font: 700 12u/1.2 var(--fb); color: var(--paper); letter-spacing: .06em;
  background: rgba(28,24,22,.82); padding: 2u 7u; border-radius: 2u; }
.mp-me { position: absolute; width: 34u; height: 34u; margin: -17u; z-index: 3; }
.mp-me::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, rgba(255,90,60,.45), rgba(255,90,60,0) 70%); animation: mv-pulse 1.6s ease-in-out infinite; }
.mp-me i { position: absolute; left: 50%; top: 50%; width: 0; height: 0; border-left: 8u solid transparent; border-right: 8u solid transparent; border-bottom: 22u solid var(--red2);
  transform: translate(-50%, -62%); filter: drop-shadow(0 0 1.5u #fff) drop-shadow(0 2u 3u rgba(0,0,0,.6)); }
.mp-me .nm { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 2u; font: 700 12u/1 var(--ft); color: var(--paper); letter-spacing: .2em; white-space: nowrap; text-shadow: 0 1u 3u #000, 0 0 6u #000; }
.mp-wait { position: absolute; left: 50%; bottom: 18u; transform: translateX(-50%); font: 600 14u/1 var(--ft); color: var(--paper); letter-spacing: .3em; text-shadow: 0 1u 3u #000; animation: mv-pulse 1.4s infinite; }
.mp-zoom { position: absolute; right: 12u; bottom: 12u; display: flex; flex-direction: column; gap: 6u; pointer-events: auto; }
.mp-zoom div { width: 28u; height: 28u; border-radius: 50%; background: rgba(243,233,212,.92); color: var(--ink); font: 700 18u/28u var(--fb); text-align: center; cursor: pointer; box-shadow: 0 2u 5u rgba(0,0,0,.4); }
.mp-zoom div:hover { background: var(--red); color: var(--paper); }
.mp-side { width: 232u; flex: none; display: flex; flex-direction: column; gap: 5u; color: var(--ink); }
.mp-side .here { padding: 8u 14u; margin-bottom: 4u; background: rgba(35,31,29,.06); border-left: 3u solid var(--red); }
.mp-side .here .k { font-size: 12u; color: var(--ink3); letter-spacing: .3em; }
.mp-side .here .v { font: 700 21u/1.3 var(--ft); letter-spacing: .2em; }
.mp-side .here .s { font-size: 12u; color: var(--ink2); letter-spacing: .06em; }
.mp-side .sh { font: 700 13u/1 var(--ft); letter-spacing: .3em; color: var(--red); margin-top: 6u; display: flex; align-items: center; gap: 8u; }
.mp-side .sh::after { content: ''; flex: 1; height: 1u; background: linear-gradient(90deg, rgba(194,59,42,.45), transparent); }
.mp-side .gl { display: flex; align-items: center; gap: 8u; font-size: 13u; min-height: 21u; }
.mp-side .gl .d { width: 12u; height: 12u; border-radius: 50%; background: #3a3540; box-shadow: 0 0 0 1u #8d86a6; flex: none; }
.mp-side .gl.lit .d { background: radial-gradient(circle, #fff2c8, #ffbf55 70%); box-shadow: 0 0 0 1u #7a4e1a, 0 0 6u 1u rgba(255,190,90,.7); }
.mp-side .gl .st { margin-left: auto; font-size: 12u; color: var(--ink3); }
.mp-side .gl.lit .st { color: #9a5a12; font-weight: 700; }
.mp-side .lg { display: flex; align-items: center; gap: 8u; font-size: 13u; color: var(--ink2); min-height: 20u; }
.mp-side .lg .sw { width: 16u; height: 16u; flex: none; display: flex; align-items: center; justify-content: center; }
.mp-side .lg .sw.me { width: 0; height: 0; border-left: 6u solid transparent; border-right: 6u solid transparent; border-bottom: 15u solid var(--red2); margin: 0 2u; }
.mp-side .lg .sw.place::before { content: ''; width: 7u; height: 7u; background: var(--red); transform: rotate(45deg); }
.mp-side .lg .sw.lan::before { content: ''; width: 9u; height: 9u; border-radius: 50%; background: var(--gold2); box-shadow: 0 0 0 1.5u #7a4e1a, 0 0 6u 2u rgba(255,200,100,.7); }
.mp-side .lg .sw.q { border-radius: 50%; background: var(--red); color: #fff; font-size: 11u; }
.mp-side .lg .sw.veil { border-radius: 50%; background: radial-gradient(circle, #121130 52%, #ffd27a 56%, #ffd27a 66%, transparent 70%); }
.mp-side .ft { margin-top: auto; font-size: 12u; color: var(--ink3); letter-spacing: .06em; line-height: 1.8; }
.mp-side .ft .keycap { margin: 0 3u; }
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

// ---- the tab -----------------------------------------------------------------------------------------------
const BIG = new Set(['wilds']);
// broad regions are rings or wide fields: their centroid is a poor place for a name, so they get a hand-picked spot
const SPOT = { sunmeadow: { x: -300, z: 330 }, duskwood: { x: 40, z: 250 }, evernight: { x: 300, z: 70 } };
const view = { cx: -40, cz: 0, zoom: 1 };   // zoom 1 = whole island fits the height

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
  tel('div','sh',side,'world.atlas');
  const itinerary=el('div','lg',side);
  itinerary.textContent=t('world.itinerary');
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
    hintLine(foot, 'ui.menu.hintMap', { ok: codeLabel('Enter') });
  }

  function focusPlayer() {
    const p = G.player?.pos || G.env?.focus || G.camera.position;
    view.cx = p.x; view.cz = p.z;
  }

  const toScreen = (x, z) => [(x - view.cx) * scale + W / 2, (z - view.cz) * scale + H / 2];

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

  // mouse: drag to pan, wheel to zoom
  let drag = null;
  vw.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz }; vw.setPointerCapture?.(e.pointerId); vw.classList.add('drag'); });
  vw.addEventListener('pointermove', (e) => { if (!drag) return; view.cx = drag.cx - (e.clientX - drag.x) / scale; view.cz = drag.cz - (e.clientY - drag.y) / scale; clampView(); });
  vw.addEventListener('pointerup', () => { drag = null; vw.classList.remove('drag'); });
  vw.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  zIn.addEventListener('pointerdown', (e) => { e.stopPropagation(); zoomBy(1.3); });
  zOut.addEventListener('pointerdown', (e) => { e.stopPropagation(); zoomBy(1 / 1.3); });
  function zoomBy(f) { view.zoom = Math.min(12, Math.max(0.8, view.zoom * f)); clampView(); }
  function clampView() { view.cx = Math.max(-EXT, Math.min(EXT, view.cx)); view.cz = Math.max(-EXT, Math.min(EXT, view.cz)); }

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
      draw();
    },
    keys() {
      const sp = 260 / (view.zoom * 6);
      if (G.input.codeHeld('ArrowLeft') || G.input.codeHeld('KeyA')) view.cx -= sp;
      if (G.input.codeHeld('ArrowRight') || G.input.codeHeld('KeyD')) view.cx += sp;
      if (G.input.codeHeld('ArrowUp') || G.input.codeHeld('KeyW')) view.cz -= sp;
      if (G.input.codeHeld('ArrowDown') || G.input.codeHeld('KeyS')) view.cz += sp;
      if (K.code('Equal') || K.code('NumpadAdd')) zoomBy(1.3);
      if (K.code('Minus') || K.code('NumpadSubtract')) zoomBy(1 / 1.3);
      if (K.confirm(false)) { focusPlayer(); view.zoom = Math.max(view.zoom, 1.6); }
      clampView();
    },
    view,
  };
}
export { UI };
