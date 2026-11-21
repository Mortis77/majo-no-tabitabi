// Every picture in the UI is drawn here in code: SVG pictograms, the washi texture, brush-stroke masks and the ensō ring.
// No external images or fonts.
import { mulberry32, TAU } from '../core/util.js';

export const ELEMENTS = ['fire', 'water', 'ice', 'wind', 'thunder', 'earth', 'sun', 'moon'];
/** Display colours of the eight elements (also used for status icons and marker tints). */
export const EL_COLOR = {
  fire: '#ff7b47', water: '#5cb9ff', ice: '#b9eeff', wind: '#8ee6ab', thunder: '#cba6ff', earth: '#e0aa62', sun: '#ffd77c', moon: '#bcc9ff',
};
export const STATUS = ['burning', 'wet', 'frozen', 'shocked'];
export const STATUS_ICON = { burning: 'fire', wet: 'water', frozen: 'ice', shocked: 'thunder' };

const F = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const S = (d, w = 1.8, extra = '') => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const C = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${extra}/>`;
const HI = 'fill="#fff" fill-opacity=".5"';
const SH = 'fill="#000" fill-opacity=".28"';

/** name -> inner SVG markup on a 24×24 grid, drawn with currentColor. */
const ICONS = {
  // ---- eight elements ----
  fire: F('M12.3 2.2c.6 3.7 5.1 5.5 5.1 10.7a5.4 5.4 0 0 1-10.8 0c0-2.2 1-3.8 2.2-5.1.1 1.7.8 2.8 1.8 3.2-.4-3.2.3-6.5 1.7-8.8z')
    + F('M12 13.4c.5 1.5 2 2.1 2 3.7a2 2 0 0 1-4 0c0-1.5 1.3-2.2 2-3.7z', HI),
  water: F('M12 2.6c3.2 4.2 6.2 7.3 6.2 11a6.2 6.2 0 0 1-12.4 0c0-3.7 3-6.8 6.2-11z')
    + S('M9 14.2a3.1 3.1 0 0 0 2.7 3', 1.5, 'stroke="#fff" stroke-opacity=".6"'),
  ice: S('M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2', 1.7)
    + S('M9.8 4.8 12 7l2.2-2.2M9.8 19.2 12 17l2.2 2.2M4.6 11.2l3-.8-.8-3M19.4 12.8l-3 .8.8 3M5.4 15.8l3 .8.8-3M18.6 8.2l-3-.8-.8 3', 1.4),
  wind: S('M3 8.6h9.2a2.7 2.7 0 1 0-2.6-3.4M3 12.6h14.6a3 3 0 1 1-2.9 3.8M3 16.6h7.2', 1.9),
  thunder: F('M13.8 2 5.6 13.4h5.2L9.2 22l9.2-12.2h-5.4z'),
  earth: F('M3.2 18.5 7 9l5-4.5 5.5 2.5 3.3 11.5z') + F('M12 4.5 17.5 7 10.5 12z', HI) + F('M7 9l3.5 3 3.5 6.5H3.2z', SH),
  sun: C(12, 12, 4.4) + S('M12 2.4V5M12 19v2.6M2.4 12H5M19 12h2.6M5.2 5.2 7 7M17 17l1.8 1.8M5.2 18.8 7 17M17 7l1.8-1.8', 1.8),
  moon: F('M15.8 3A9.3 9.3 0 1 0 21 14.6 7.4 7.4 0 0 1 15.8 3z'),
  // ---- abilities ----
  charm: F('M8 2.5h8v19l-4-2.6-4 2.6z') + S('M10.3 7h3.4M10.3 10.4h3.4M12 7v7', 1.3, 'stroke="#000" stroke-opacity=".45"'),
  broom: S('M3.6 20.4 13 11', 2) + F('M11.6 9.6 14.4 12.4l6.8-3-.6-3.8-2.2-2.2-3.8-.6z') + S('M14.2 6.4 17.6 9.8M16 4.6l3.4 3.4', 1, 'stroke="#000" stroke-opacity=".35"'),
  wings: F('M2.5 15.5c4.5-.5 7-3.5 9.5-9.5 1.2 2.8 1.2 5-.2 7.2 2.2-.7 4.2-2.4 5.7-4.7.3 3-.5 5.4-2.7 7.2 1.7-.1 3.2-.7 4.7-1.7-1.2 3.7-4.5 6-8.5 6-3.5 0-6.3-1.5-8.5-4.5z'),
  guard: F('M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z') + F('M12 5.2v13.6c3.3-1.3 5.5-4 5.5-7.6V7.2z', HI),
  dodge: S('M4 7h8M3 12h11M5 17h7', 1.8) + F('M13 5l8 7-8 7 2.5-7z'),
  shikigami: F('M2.5 9 11 11l2-6.5 2.5 6.5 6-1.5-5 5.5 1.5 5.5-5-3.5-6 2 3-5.5z'),
  kinkan: '<circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" stroke-width="2.4"/>' + C(12, 12, 5.6, 'fill="#000" fill-opacity=".55"') + C(17.6, 6.8, 1.7, 'fill="#fff"'),
  // ---- counters / items ----
  dango: S('M4.6 20.4 19.6 3.6', 1.3, 'stroke="#c9a36a"') + C(8.2, 16.2, 3.5, 'fill="#a8cf8e"') + C(12.2, 11.7, 3.5, 'fill="#fff5e6"') + C(16.2, 7.2, 3.5, 'fill="#f5a9bc"'),
  stardust: F('M12 2.5Q12.8 11.2 21.5 12 12.8 12.8 12 21.5 11.2 12.8 2.5 12 11.2 11.2 12 2.5z') + C(18.8, 5.2, 1.2) + C(5.4, 18.4, 0.9),
  moontear: F('M12 2.6c3.2 4.2 6.2 7.3 6.2 11a6.2 6.2 0 0 1-12.4 0c0-3.7 3-6.8 6.2-11z') + F('M13.6 9.6a4.2 4.2 0 1 0 2.6 6.6 3.4 3.4 0 0 1-2.6-6.6z', 'fill="#fff" fill-opacity=".75"'),
  heart: F('M12 20.6C5.6 15.6 3 12.6 3 9.3A4.6 4.6 0 0 1 12 7.4a4.6 4.6 0 0 1 9 1.9c0 3.3-2.6 6.3-9 11.3z'),
  spirit: F('M12 21.5a6 6 0 0 1-6-6c0-4 4.2-5.6 4.8-12 3.7 3.7 7.2 6.8 7.2 12a6 6 0 0 1-6 6z') + C(12, 15.6, 2.3, HI),
  // ---- markers ----
  quest: F('M12 2.2 19.2 12 12 21.8 4.8 12z') + F('M12 7.6 15.2 12 12 16.4 8.8 12z', HI),
  npc: C(12, 7.4, 3.7) + F('M5.2 20.6c.5-4.6 3.2-7.2 6.8-7.2s6.3 2.6 6.8 7.2z'),
  lantern: F('M4.6 9.4 12 4l7.4 5.4z') + F('M8 10.6h8v6H8z') + F('M10.2 12.2h3.6v3h-3.6z', 'fill="#fff" fill-opacity=".7"') + F('M9.4 17.6h5.2l1.6 3.2H7.8z'),
  greatlantern: F('M3.6 8.4 12 2.6l8.4 5.8z') + F('M6.6 9.6h10.8v8H6.6z') + C(12, 13.6, 2.6, 'fill="#fff" fill-opacity=".8"') + F('M5 18.6h14v2.8H5z'),
  chest: F('M4 11c0-3.4 2.6-5.4 8-5.4s8 2 8 5.4v8H4z') + F('M4 11h16v1.8H4z', SH) + C(12, 12.4, 1.6, 'fill="#fff" fill-opacity=".8"'),
  shop: F('M9 3.4h6l-1.4 3.4c3.4 1.4 5.4 4.8 5.4 8.2 0 3.4-2.6 5.4-7 5.4s-7-2-7-5.4c0-3.4 2-6.8 5.4-8.2z') + S('M9.6 6.9h4.8', 1.2, 'stroke="#000" stroke-opacity=".4"'),
  flag: S('M6 21.4V3', 1.8) + F('M6.8 4h12.2l-3.2 4 3.2 4H6.8z'),
  ema: F('M12 3 20.4 8.6V20H3.6V8.6z') + C(12, 8.4, 1.3, 'fill="#000" fill-opacity=".45"') + S('M8 13h8M8 16.2h5.6', 1.2, 'stroke="#000" stroke-opacity=".4"'),
  fox: F('M4 3.6 9 7.2h6l5-3.6-1 8.8c0 4.2-3 7.6-7 7.6s-7-3.4-7-7.6z') + C(9.2, 11.6, 1.1, 'fill="#000" fill-opacity=".6"') + C(14.8, 11.6, 1.1, 'fill="#000" fill-opacity=".6"'),
  torii: F('M2.6 5.2c3.2 1.1 15.6 1.1 18.8 0V8H2.6z') + F('M5 10h14v1.9H5z') + F('M7 8h2.2v13.4H7z') + F('M14.8 8H17v13.4h-2.2z'),
  eye: F('M2.4 12c3-5 6.1-7.2 9.6-7.2s6.6 2.2 9.6 7.2c-3 5-6.1 7.2-9.6 7.2s-6.6-2.2-9.6-7.2z') + C(12, 12, 3.2, 'fill="#000" fill-opacity=".7"'),
  star: F('M12 2.6l2.7 6.1 6.7.6-5 4.5 1.5 6.6L12 17l-5.9 3.4 1.5-6.6-5-4.5 6.7-.6z'),
  pin: F('M12 2.4a6.8 6.8 0 0 1 6.8 6.8c0 4.6-4.6 8.6-6.8 12.4-2.2-3.8-6.8-7.8-6.8-12.4A6.8 6.8 0 0 1 12 2.4z') + C(12, 9.2, 2.5, HI),
  dot: C(12, 12, 5),
  // ---- chrome ----
  lock: F('M6 10.6h12V21H6z') + S('M8.6 10.4V7.8a3.4 3.4 0 0 1 6.8 0v2.6', 1.9) + C(12, 15.6, 1.5, 'fill="#000" fill-opacity=".5"'),
  check: S('M4.4 12.8l5 5L20 5.8', 2.6),
  arrow: F('M12 2.6 19 20l-7-4.2L5 20z'),
  caret: F('M7 4l10 8-10 8z'),
  map: F('M3 5.6 9 3.4l6 2.2 6-2.2v15l-6 2.2-6-2.2-6 2.2z') + S('M9 3.6v14.6M15 5.6v14.8', 1.1, 'stroke="#000" stroke-opacity=".4"'),
  journal: F('M5 3h12.6a1.4 1.4 0 0 1 1.4 1.4V21H6.6A1.6 1.6 0 0 1 5 19.4z') + S('M8.4 3.2v17.6M11.4 8h4.8M11.4 11.4h4.8', 1.2, 'stroke="#000" stroke-opacity=".4"'),
  spells: F('M7.6 2.4h8.8v19.2L12 18.8l-4.4 2.8z')
    + '<circle cx="12" cy="9.4" r="2.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.2"/>' + S('M12 12.6v3.4', 1.2, 'stroke="#000" stroke-opacity=".5"'),
  items: F('M8.4 3h7.2l-1.2 3.6c3.8 1.5 5.6 4.9 5.6 8.2 0 3.8-2.8 6.2-8 6.2s-8-2.4-8-6.2c0-3.3 1.8-6.7 5.6-8.2z') + S('M8.8 6.8h6.4', 1.3, 'stroke="#000" stroke-opacity=".45"'),
  settings: S('M4 6.5h16M4 12h16M4 17.5h16', 1.6) + C(9, 6.5, 2.3) + C(15.5, 12, 2.3) + C(7.5, 17.5, 2.3),
  resume: F('M7 4.4 19 12 7 19.6z'),
  quit: S('M14 4.5H6v15h8M10.5 12H20M16.5 8.5 20 12l-3.5 3.5', 1.9),
  brush: S('M4 20c2.4-.3 3.8-1.3 4.6-3.3', 1.8) + F('M8.4 16.8 18.8 4.2a1.9 1.9 0 0 1 2.9 2.5L11.2 19.2c-1.3.3-2.5-.8-2.8-2.4z'),
  // ---- wardrobe (src/data/outfits.js): a robe on its stand, and the three outfits as garments (in their own colours) ----
  wardrobe: S('M2.5 5.2h19M12 2.6v2.6', 1.6) + F('M5 6.6 9.4 5.6h5.2L19 6.6l1.4 5.6-3.2.8V21H6.8v-8L3.6 12.2z')
    + S('M9.4 5.8 12 10l2.6-4.2', 1.2, 'stroke="#000" stroke-opacity=".45"'),
  outfit_miko: F('M5.8 15.7c2.1-3 3-9.2 7.2-12 2.6-1.7 5.3-.1 5.7 2.5-2.3-1.2-3.8-1.4-4.8.4l2.4 9z', 'fill="#5e506e" stroke="#342c42" stroke-width=".9"')
    + F('m7.5 12.8 7.7-1.7.6 2.1-9.1 2.2z', 'fill="#d9b9d4"') + F('M2 17c2.8-2 6.9-1.9 10.5-2.8 4-.9 6.1-1.3 9.6-1.2-2 2.4-4.6 3.9-9.2 5.1C7.7 19.5 3.5 19.4 2 17z', 'fill="#967a9e" stroke="#403548" stroke-width=".8"'),
  outfit_swim_a: F('M8.2 4.2 12 8.6l3.8-4.4 1.2 7.2H7z', 'fill="#fbf6ea" stroke="#231f1d" stroke-opacity=".7" stroke-width=".8"')
    + S('M8.2 4.4 12 8.8l3.8-4.4', 1.1, 'stroke="#c23b2a"') + F('M6.8 11.6h10.4l2.6 8.4-5.6 1.6-3.2-1.4-4.4.6z', 'fill="#c23b2a"')
    + S('M9.6 12.2l-.8 7.8M12.6 12.2l.4 8.8M15.4 12.2l1.4 8.6', .7, 'stroke="#000" stroke-opacity=".28"') + S('M6.8 11.6h10.4', 1.3, 'stroke="#8f2418"')
    + F('M11 10.6h2l1.6 1-1.6 1h-2l-1.6-1z', 'fill="#fbf6ea"'),
  outfit_swim_b: S('M9.4 6.2 11.2 2.8M14.6 6.2l-1.8-3.4', 1.1, 'stroke="#4a3f86"') + F('M7.8 5.8c1.6 1.1 2.8 1.5 4.2 1.5s2.6-.4 4.2-1.5l.8 4.4H7z', 'fill="#4a3f86"')
    + S('M7.1 10.1h9.8', .8, 'stroke="#e0b85a"') + F('M7.2 12.2h9.6l.8 5.6h-4.8L12 15.6l-.8 2.2H6.4z', 'fill="#4a3f86"')
    + F('M6.6 12 14.2 11.8 11 21.4l-5.2-.6z', 'fill="#8a5fb0"') + C(8.6, 14.6, .6, 'fill="#e0b85a"') + C(10.6, 17.6, .6, 'fill="#e0b85a"') + C(8, 19.2, .6, 'fill="#e0b85a"'),
};
const ALIAS = {
  burning: 'fire', wet: 'water', frozen: 'ice', shocked: 'thunder', mana: 'spirit', life: 'heart', hp: 'heart',
  main: 'quest', side: 'quest', target: 'quest', boss: 'eye', enemy: 'eye', duel: 'eye', save: 'brush', checkpoint: 'brush',
  race: 'flag', lore: 'ema', kitsune: 'fox', teacher: 'npc', talk: 'npc', great: 'greatlantern', tear: 'moontear', coin: 'stardust',
  shrine: 'torii', place: 'pin', poi: 'pin', item: 'items', pickup: 'stardust', pouch: 'items', kite: 'flag', shide: 'charm',
};

export const hasIcon = (name) => !!(ICONS[name] || ICONS[ALIAS[name]]);
/** Inline SVG markup of an icon; unknown names give the plain diamond. */
export function iconSvg(name) {
  const body = ICONS[name] || ICONS[ALIAS[name]] || ICONS.quest;
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
}
/** <i class="ic"> holding an icon. A name that is not an icon but is short (a glyph) is shown as text. */
export function icon(name, cls, parent) {
  const e = document.createElement('i');
  e.className = 'ic' + (cls ? ' ' + cls : '');
  setIcon(e, name);
  if (parent) parent.appendChild(e);
  return e;
}
export function setIcon(e, name) {
  if (e._ic === name) return e;
  e._ic = name;
  if (typeof name === 'string' && !hasIcon(name) && name.length > 0 && name.length <= 2) { e.textContent = name; e.classList.add('glyph'); }
  else { e.classList.remove('glyph'); e.innerHTML = iconSvg(name); }
  return e;
}

// ---- generated textures / masks (returned as CSS url() values) -----------------------------------------------
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** Washi: pale fibre noise, used with multiply over the paper colour. */
export function paperTexture(seed = 11) {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = 238 + r() * 17;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v - 1; img.data[i * 4 + 2] = v - 4; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {       // fibres
    const x = r() * N, y = r() * N, a = r() * TAU, l = 6 + r() * 26;
    g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.25 + r() * 0.35})` : `rgba(120,96,60,${0.05 + r() * 0.09})`;
    g.lineWidth = 0.4 + r() * 0.9;
    for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {   // wrap so it tiles
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + Math.cos(a + 0.6) * l * 0.5, y + oy + Math.sin(a + 0.6) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    }
  }
  return `url(${c.toDataURL('image/png')})`;
}

/** A horizontal brush stroke (stretchable mask): soft start on the left, dry frayed tail on the right. */
export function brushStroke(seed, { w = 240, h = 24, fray = 5, rough = 1.5, tail = 18 } = {}) {
  const r = mulberry32(seed);
  const n = 16, top = [], bot = [];
  const x1 = w - tail - 4;
  for (let i = 0; i <= n; i++) {
    const x = 7 + (i / n) * (x1 - 7);
    top.push([x, 2.5 + r() * rough * 2 + Math.sin(i * 0.9 + seed) * 0.9]);
    bot.push([x, h - 2.5 - r() * rough * 2 + Math.cos(i * 0.7 + seed) * 0.9]);
  }
  const f = (v) => v.toFixed(1);
  let d = `M1.5 ${f(h / 2)}Q1.5 ${f(top[0][1])} ${f(top[0][0])} ${f(top[0][1])}`;
  for (let i = 1; i <= n; i++) d += `L${f(top[i][0])} ${f(top[i][1])}`;
  const ya = top[n][1], yb = bot[n][1];
  for (let k = 0; k < fray; k++) {
    const y0 = ya + (yb - ya) * (k / fray), y1 = ya + (yb - ya) * ((k + 1) / fray);
    const len = tail * (0.35 + r() * 0.65);
    d += `L${f(x1 + len)} ${f(y0 + (y1 - y0) * 0.4)}L${f(x1 + r() * 3)} ${f(y1)}`;
  }
  for (let i = n; i >= 0; i--) d += `L${f(bot[i][0])} ${f(bot[i][1])}`;
  d += `Q1.5 ${f(bot[0][1])} 1.5 ${f(h / 2)}Z`;
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="#000"/></svg>`);
}

/** Deckle edge for paper sheets: a rectangle whose four sides wander by a hair. */
export function deckle(seed = 5, amp = 2.2) {
  const r = mulberry32(seed);
  const W = 1000, H = 1000, pts = [];
  const j = () => (r() - 0.5) * 2 * amp;
  for (let x = 0; x <= W; x += 20) pts.push([x, 2 + amp + j()]);
  for (let y = 20; y <= H; y += 20) pts.push([W - 2 - amp + j(), y]);
  for (let x = W - 20; x >= 0; x -= 20) pts.push([x, H - 2 - amp + j()]);
  for (let y = H - 20; y >= 20; y -= 20) pts.push([2 + amp + j(), y]);
  const d = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="#000"/></svg>`);
}

/** Ensō: one breath of the brush around a circle, thick where it lands and thin where it lifts. */
export function enso(seed = 3, { gap = 0.5, thick = 9, thin = 2.2 } = {}) {
  const r = mulberry32(seed);
  const N = 96, out = [], inn = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const a = -Math.PI / 2 + 0.35 + k * (TAU - gap);
    const press = Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.25 + 0.06)), 0.7) * (1 - 0.6 * k);
    const wd = thin + (thick - thin) * Math.max(0, press);
    const ro = 47 + (r() - 0.5) * 0.7 - k * 1.2;
    out.push([50 + Math.cos(a) * ro, 50 + Math.sin(a) * ro]);
    inn.push([50 + Math.cos(a) * (ro - wd), 50 + Math.sin(a) * (ro - wd)]);
  }
  const f = (p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2);
  const d = 'M' + out.map(f).join('L') + 'L' + inn.reverse().map(f).join('L') + 'Z';
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}" fill="#000"/></svg>`);
}

/** Seigaiha-ish wave scallops (a faint repeating pattern for dark panels). */
export function wavePattern(color = 'rgba(255,255,255,.07)') {
  const arcs = [];
  for (const [cx, cy] of [[0, 20], [40, 20], [20, 10], [20, 30], [0, 0], [40, 0], [0, 40], [40, 40], [-20, 10], [60, 10], [-20, 30], [60, 30]]) {
    for (const rr of [19, 13, 7]) arcs.push(`<path d="M${cx - rr} ${cy}a${rr} ${rr} 0 0 1 ${rr * 2} 0" fill="none" stroke="${color}" stroke-width="1"/>`);
  }
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20">${arcs.join('')}</svg>`);
}
