// Procedural passport stamps for the journey's countries (docs/api/ui.md "Adding an episode"). Each country in
// src/data/episodes.js carries `stamp: { seed, ink?, shape?, motif? }`; stampArt(country) turns it into a small one-ink SVG: a frame
// (shape + border style), ornaments (a motif, little stars, rules) and a speckled, unevenly pressed print.
// The country's name is NOT part of the art (an SVG background cannot use the page's fonts): the caller lays the name over
// the stamp's clear centre as DOM text, `nameY` / `nameW` say where and how wide.
//   stampArt(country) -> { url: 'url("data:image/svg+xml,…")', ink: '#hex', tilt: deg, shape, border, motif, layout,
//                          nameY: % of the height for the name's centre, nameW: % of the width the name may use }
// The art is 140×100 (aspect 1.4); draw it with `background: <url> center / contain no-repeat`.
// Deterministic per seed (the same seed always prints the same stamp) and cached per country.
// shapes: circle oval octagon scalloped shield rect hexagon notched · borders: double heavy dashed dotted ticks rope ·
// motifs: star crescent sun tower key leaf wave bell quill flower · layouts: crown emblem band arc ·
// inks (muted): wine forest ochre indigo plum teal sepia slate. A stamp's own `ink` / `shape` / `motif` override the seed's
// pick (the rest still follows the seed); look at the probe's stamp sheet (tools/journey/episodes-probe.js) when choosing.

const W = 140, H = 100, CX = 70, CY = 50;
const INKS = ['#8b3343', '#2f5a4a', '#86621f', '#34467a', '#6a3d6e', '#2b6468', '#6b4a2e', '#4a5262'];
const f = (n) => +n.toFixed(2);

// ---- seeded random --------------------------------------------------------------------------------------------
function rng(seed) {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x5bd1e995) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => { let h = 7; for (const c of String(s)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0; return h >>> 0; };

// ---- outlines: each shape draws its rim at an inset `d` (0 = the outer edge) ----------------------------------
const pts2d = (pts) => 'M' + pts.map(([x, y]) => f(x) + ',' + f(y)).join('L') + 'Z';
function cross(P, L) {   // two lines given as [x, y, dx, dy]
  const den = P[2] * L[3] - P[3] * L[2];
  const t = ((L[0] - P[0]) * L[3] - (L[1] - P[1]) * L[2]) / den;
  return [P[0] + t * P[2], P[1] + t * P[3]];
}
/** A convex polygon (clockwise on screen) with every edge moved inwards by d. */
function inset(pts, d) {
  const n = pts.length, lines = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    const len = Math.hypot(x2 - x1, y2 - y1);
    lines.push([x1 - ((y2 - y1) / len) * d, y1 + ((x2 - x1) / len) * d, x2 - x1, y2 - y1]);
  }
  return lines.map((L, i) => cross(lines[(i + n - 1) % n], L));
}
const circ = (r) => `M${f(CX - r)},${CY}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
const ell = (rx, ry) => `M${f(CX - rx)},${CY}a${f(rx)},${f(ry)} 0 1,0 ${f(2 * rx)},0a${f(rx)},${f(ry)} 0 1,0 ${f(-2 * rx)},0Z`;
function rrect(a, b, r) {
  const x0 = f(CX - a), x1 = f(CX + a), y0 = f(CY - b), y1 = f(CY + b); r = f(r);
  return `M${f(x0 + r)},${y0}H${f(x1 - r)}A${r},${r} 0 0 1 ${x1},${f(y0 + r)}V${f(y1 - r)}A${r},${r} 0 0 1 ${f(x1 - r)},${y1}` +
    `H${f(x0 + r)}A${r},${r} 0 0 1 ${x0},${f(y1 - r)}V${f(y0 + r)}A${r},${r} 0 0 1 ${f(x0 + r)},${y0}Z`;
}
function notch(a, b, k) {   // a ticket: a rectangle with the corners bitten out (concave quarter circles)
  const x0 = f(CX - a), x1 = f(CX + a), y0 = f(CY - b), y1 = f(CY + b); k = f(k);
  return `M${f(x0 + k)},${y0}H${f(x1 - k)}A${k},${k} 0 0 0 ${x1},${f(y0 + k)}V${f(y1 - k)}A${k},${k} 0 0 0 ${f(x1 - k)},${y1}` +
    `H${f(x0 + k)}A${k},${k} 0 0 0 ${x0},${f(y1 - k)}V${f(y0 + k)}A${k},${k} 0 0 0 ${f(x0 + k)},${y0}Z`;
}
function shield(d) {
  const w = 43 - d, t = 5 + d, m = CY - 4, b = 96 - d * 1.45, k = w / 43;
  return `M${f(CX - w)},${f(t)}Q${CX},${f(t + 7 * k)} ${f(CX + w)},${f(t)}L${f(CX + w)},${m}` +
    `C${f(CX + w)},${f(m + (b - m) * 0.55)} ${f(CX + w * 0.42)},${f(b - (b - m) * 0.14)} ${CX},${f(b)}` +
    `C${f(CX - w * 0.42)},${f(b - (b - m) * 0.14)} ${f(CX - w)},${f(m + (b - m) * 0.55)} ${f(CX - w)},${m}Z`;
}
function scallop(R) {   // a seal with a bitten edge: round bumps meeting in small notches
  const N = 22, M = 220;
  let s = '';
  for (let i = 0; i < M; i++) {
    const a = (i / M) * Math.PI * 2, r = R - 2.8 + 3.2 * Math.pow(Math.abs(Math.cos((a * N) / 2)), 0.45);
    s += (i ? 'L' : 'M') + f(CX + r * Math.cos(a)) + ',' + f(CY + r * Math.sin(a));
  }
  return s + 'Z';
}
const OCT = ((a, b, c) => [[CX - a + c, CY - b], [CX + a - c, CY - b], [CX + a, CY - b + c], [CX + a, CY + b - c], [CX + a - c, CY + b], [CX - a + c, CY + b], [CX - a, CY + b - c], [CX - a, CY - b + c]])(64, 44, 17);
const HEX = ((a, b, p) => [[CX - a + p, CY - b], [CX + a - p, CY - b], [CX + a, CY], [CX + a - p, CY + b], [CX - a + p, CY + b], [CX - a, CY]])(66, 43, 21);

// hw / hh: half extents of the outer rim; round: no room for marks beside the name
const SHAPES = {
  circle: { hw: 45, hh: 45, round: true, out: (d) => circ(45 - d) },
  oval: { hw: 65, hh: 45, out: (d) => ell(65 - d, 45 - d) },
  octagon: { hw: 64, hh: 44, out: (d) => pts2d(inset(OCT, d)) },
  scalloped: { hw: 44, hh: 44, round: true, out: (d) => (d < 0.5 ? scallop(45) : circ(42 - d)) },
  shield: { hw: 43, hh: 45, round: true, nameY: 45, out: shield },
  rect: { hw: 64, hh: 43, out: (d) => rrect(64 - d, 43 - d, Math.max(1.5, 9 - d * 0.7)) },
  hexagon: { hw: 66, hh: 43, side: 0.62, out: (d) => pts2d(inset(HEX, d)) },
  notched: { hw: 63, hh: 43, out: (d) => notch(63 - d, 43 - d, 11 + d) },
};
const SHAPE_IDS = Object.keys(SHAPES);

// ---- border styles: the rims drawn, outermost first ({ d inset, w stroke, dash?, off? dash offset, cap? }) ------------
const BORDERS = {
  double: [{ d: 0, w: 3 }, { d: 6, w: 1.2 }],
  heavy: [{ d: 0, w: 4.6 }, { d: 8, w: 1 }],
  dashed: [{ d: 0, w: 2.2 }, { d: 5.5, w: 1.4, dash: '4.5 2.6' }],
  dotted: [{ d: 0, w: 1.6 }, { d: 4.8, w: 2.6, dash: '0 4.4', cap: 'round' }, { d: 9.4, w: 1 }],
  ticks: [{ d: 0, w: 2 }, { d: 5.2, w: 5, dash: '0.9 2.2' }, { d: 9.4, w: 1.1 }],
  // rope: three dashed strands, each a little further round than the last, read as one twisted cord
  rope: [{ d: 0, w: 1.3 }, { d: 3.2, w: 1.4, dash: '1.5 1.9' }, { d: 4.5, w: 1.4, dash: '1.5 1.9', off: 0.7 }, { d: 5.8, w: 1.4, dash: '1.5 1.9', off: 1.4 }, { d: 8.2, w: 1.3 }],
};
const BORDER_IDS = Object.keys(BORDERS);

// ---- motifs: paths in a 24×24 box centred on 0,0 ---------------------------------------------------------------
function starPts(n, r1, r2, rot = -Math.PI / 2) {
  const p = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, r = i % 2 ? r2 : r1; p.push([r * Math.cos(a), r * Math.sin(a)]); }
  return p;
}
const ptsPath = (p) => 'M' + p.map(([x, y]) => f(x) + ',' + f(y)).join('L') + 'Z';
function crescent() {   // the outer circle minus an offset one, traced as a polygon
  const A = { x: 0, y: 0, r: 11 }, B = { x: 5, y: -3.4, r: 9.2 }, out = [], inn = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2, x = A.r * Math.cos(a), y = A.r * Math.sin(a);
    if (Math.hypot(x - B.x, y - B.y) > B.r) out.push([x, y, a]);
    const bx = B.x + B.r * Math.cos(a), by = B.y + B.r * Math.sin(a);
    if (Math.hypot(bx, by) < A.r) inn.push([bx, by, a]);
  }
  // walk the outer arc in angle order starting after the gap, then the inner arc back
  const gap = (arr) => { let k = 0; for (let i = 1; i < arr.length; i++) if (arr[i][2] - arr[i - 1][2] > 0.2) k = i; return arr.slice(k).concat(arr.slice(0, k)); };
  const o = gap(out), n = gap(inn).reverse();
  return ptsPath(o.concat(n));
}
function sun() {
  let s = 'M-4.6,0a4.6,4.6 0 1,0 9.2,0a4.6,4.6 0 1,0 -9.2,0Z';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, b = 0.2;
    s += ptsPath([[6.4 * Math.cos(a - b), 6.4 * Math.sin(a - b)], [11.6 * Math.cos(a), 11.6 * Math.sin(a)], [6.4 * Math.cos(a + b), 6.4 * Math.sin(a + b)]]);
  }
  return s;
}
function flower() {
  let s = 'M-2.4,0a2.4,2.4 0 1,0 4.8,0a2.4,2.4 0 1,0 -4.8,0Z';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5, c = Math.cos(a), sn = Math.sin(a), deg = (a * 180) / Math.PI + 90;
    const x = 7.6 * c, y = 7.6 * sn;
    // an ellipse rx 3, ry 4 rotated to point outwards, as two arcs
    const ux = 4 * Math.cos((deg - 90) * Math.PI / 180), uy = 4 * Math.sin((deg - 90) * Math.PI / 180);
    s += `M${f(x - ux)},${f(y - uy)}A3,4 ${f(deg)} 1,0 ${f(x + ux)},${f(y + uy)}A3,4 ${f(deg)} 1,0 ${f(x - ux)},${f(y - uy)}Z`;
  }
  return s;
}
const MOTIFS = {
  star: { d: ptsPath(starPts(5, 11.5, 4.7)) },
  crescent: { d: crescent() },
  sun: { d: sun() },
  tower: { d: 'M-6,11V-3H-8.5V-10H-5.2V-7H-1.7V-10H1.7V-7H5.2V-10H8.5V-3H6V11Z M-2.3,11V5.4A2.3,2.3 0 0 1 2.3,5.4V11Z M-1,-1.6H1V2H-1Z', odd: true },
  key: { d: 'M0,-11.5A4.6,4.6 0 1 1 0,-2.3A4.6,4.6 0 1 1 0,-11.5Z M0,-9.1A2.2,2.2 0 1 0 0,-4.7A2.2,2.2 0 1 0 0,-9.1Z M-1.25,-2.6H1.25V11.5H-1.25Z M1.25,5H5V7.2H1.25Z M1.25,9H3.8V11.2H1.25Z', odd: true },
  leaf: { d: 'M0,-11.5C7.5,-6 7.2,5.5 0,11.5C-7.2,5.5 -7.5,-6 0,-11.5Z M-0.55,-7.5L0.55,-7.5L0.55,9L-0.55,9Z', odd: true },
  wave: { d: 'M-11,-5.5q2.75,-3.4 5.5,0t5.5,0t5.5,0t5.5,0M-11,0.5q2.75,-3.4 5.5,0t5.5,0t5.5,0t5.5,0M-11,6.5q2.75,-3.4 5.5,0t5.5,0t5.5,0t5.5,0', stroke: 1.9 },
  bell: { d: 'M0,-11.5C-1.3,-11.5 -1.8,-10.4 -1.7,-9.4C-5.6,-8.4 -7.2,-4.8 -7.2,-0.5V4.2L-9.4,7.6H9.4L7.2,4.2V-0.5C7.2,-4.8 5.6,-8.4 1.7,-9.4C1.8,-10.4 1.3,-11.5 0,-11.5Z M-2.6,8.8A2.6,2.6 0 0 0 2.6,8.8Z' },
  quill: { d: 'M9.5,-11.5C3,-10 -3.6,-3.8 -6.8,5.2L-9.6,11.5L-7.4,10.6C-5.6,5.2 -1.6,0.6 3.6,-2.4C6.4,-5.4 8.6,-8.4 9.5,-11.5Z M-6.8,5.2L-5.4,6.2L-1.5,-0.3L-2.6,-0.9Z', odd: true },
  flower: { d: flower() },
};
const MOTIF_IDS = Object.keys(MOTIFS);
const LAYOUTS = ['crown', 'emblem', 'band', 'arc'];

function motif(id, x, y, size, op = 1) {
  const m = MOTIFS[id], k = f(size / 24);
  const o = op < 1 ? ` opacity='${op}'` : '';
  if (m.stroke) return `<path transform='translate(${f(x)} ${f(y)}) scale(${k})' d='${m.d}' fill='none' stroke-width='${m.stroke}' stroke-linecap='round'${o}/>`;
  return `<path transform='translate(${f(x)} ${f(y)}) scale(${k})' d='${m.d}' stroke='none' fill='currentColor'${m.odd ? " fill-rule='evenodd'" : ''}${o}/>`;
}
const smallStar = (x, y, s) => `<path transform='translate(${f(x)} ${f(y)}) scale(${f(s / 24)})' d='${MOTIFS.star.d}' stroke='none' fill='currentColor'/>`;
const dot = (x, y, r) => `<circle cx='${f(x)}' cy='${f(y)}' r='${f(r)}' stroke='none' fill='currentColor'/>`;

// ---- the stamp ------------------------------------------------------------------------------------------------
const cache = new Map();

/** Passport-stamp art for a country of src/data/episodes.js (see the header for the result's fields). */
export function stampArt(country) {
  const c = country || {}, st = c.stamp || {};
  const seed = Number.isFinite(st.seed) ? st.seed | 0 : hashStr(c.id || 'stamp');
  const key = `${c.id}|${seed}|${st.ink || ''}|${st.shape || ''}|${st.motif || ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // shape, motif and ink walk low-discrepancy sequences (seed × an irrational), so neighbouring seeds land far apart: give a
  // journey's countries consecutive seeds and no two neighbours share a shape or a motif; border, layout and tilt are hashed
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  const walk = (arr, k) => arr[Math.floor((((seed * k) % 1) + 1) % 1 * arr.length) % arr.length];
  const shapeId = SHAPES[st.shape] ? st.shape : walk(SHAPE_IDS, 0.6180339887);
  const motifId = MOTIFS[st.motif] ? st.motif : walk(MOTIF_IDS, 0.3183098862);
  const inkPick = walk(INKS, 0.4142135624);
  const borderId = pick(BORDER_IDS), layout = pick(LAYOUTS);
  const ink = /^#[0-9a-f]{3,8}$/i.test(st.ink || '') ? st.ink : inkPick;
  const tilt = f((r() < 0.5 ? -1 : 1) * (2.5 + r() * 6));
  const S = SHAPES[shapeId], rims = BORDERS[borderId];

  // the frame
  let body = '';
  for (const q of rims) {
    body += `<path d='${S.out(q.d)}' stroke-width='${q.w}'${q.dash ? ` stroke-dasharray='${q.dash}'` : ''}${q.off ? ` stroke-dashoffset='${q.off}'` : ''}${q.cap ? ` stroke-linecap='${q.cap}'` : ''}/>`;
  }
  // the clear inside, where the ornaments go and the name sits
  const inD = rims[rims.length - 1].d + 2.5;
  const iw = S.hw - inD, ih = S.hh - inD;
  const NY = ((S.nameY || 50) / 100) * H;   // where the name's centre sits (the shield's is a little higher)
  const topY = CY - ih * 0.66, botY = CY + ih * (shapeId === 'shield' ? 0.5 : 0.66);
  const sideX = iw * (S.side || 0.8);
  let orn = '', clip = '';
  if (layout === 'crown') {
    orn += motif(motifId, CX, topY, 13);
    if (!S.round) orn += smallStar(CX - sideX, NY, 7) + smallStar(CX + sideX, NY, 7);
    else orn += dot(CX - 6, botY, 1.3) + dot(CX, botY, 1.3) + dot(CX + 6, botY, 1.3);
  } else if (layout === 'emblem') {
    orn += motif(motifId, CX, NY, Math.min(ih * 1.55, 50), 0.2);
    orn += smallStar(CX, topY, 7) + smallStar(CX, botY, 7);
    if (!S.round) orn += dot(CX - sideX, NY, 1.4) + dot(CX + sideX, NY, 1.4);
  } else if (layout === 'band') {
    const y1 = NY - ih * 0.54, y2 = NY + ih * 0.54;
    clip = `<clipPath id='c'><path d='${S.out(inD - 1)}'/></clipPath>`;
    orn += `<g clip-path='url(#c)'><path d='M0,${f(y1)}H${W}M0,${f(y2)}H${W}' stroke-width='1.1'/><path d='M0,${f(y1 - 2.2)}H${W}M0,${f(y2 + 2.2)}H${W}' stroke-width='.5'/></g>`;
    orn += motif(motifId, CX, (y1 + (CY - ih)) / 2 + 0.5, 9.5);
    const by = (y2 + (CY + ih)) / 2 - (shapeId === 'shield' ? 2 : 0);
    orn += smallStar(CX - 7, by, 4.6) + smallStar(CX, by, 5.6) + smallStar(CX + 7, by, 4.6);
  } else {   // arc: five little stars along the top, the motif below the name
    const R = ih * 0.92;
    for (let i = -2; i <= 2; i++) { const a = -Math.PI / 2 + i * 0.3; orn += smallStar(CX + R * Math.cos(a) * (S.round ? 1 : 1.25), CY + R * Math.sin(a) + 3, i === 0 ? 6.4 : 4.8); }
    orn += motif(motifId, CX, botY, 11);
  }

  // a speckled, unevenly inked print: fine grain knocked out of the ink, a broad patch pressed lighter, a wobble at the edges
  const filt = `<filter id='w' x='-6%' y='-6%' width='112%' height='112%'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='${seed % 997}' result='n1'/>` +
    `<feColorMatrix in='n1' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2.8 0 0 0 -.62' result='a1'/>` +
    `<feTurbulence type='fractalNoise' baseFrequency='.028' numOctaves='1' seed='${(seed * 7 + 3) % 997}' result='n2'/>` +
    `<feColorMatrix in='n2' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3.2 0 0 0 -.62' result='a2'/>` +
    `<feComposite in='a1' in2='a2' operator='in' result='m'/>` +
    `<feComposite in='SourceGraphic' in2='m' operator='in' result='s'/>` +
    `<feTurbulence type='fractalNoise' baseFrequency='.06' numOctaves='2' seed='${(seed * 13 + 5) % 997}' result='n3'/>` +
    `<feDisplacementMap in='s' in2='n3' scale='1.8' xChannelSelector='R' yChannelSelector='G'/></filter>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'><defs>${filt}${clip}</defs>` +
    `<g filter='url(#w)' fill='none' stroke='${ink}' color='${ink}'>${body}${orn}</g></svg>`;

  const nameW = Math.round(((S.round ? 2 * (iw - 3) : 2 * (iw * (S.side || 0.8) - 6)) / W) * 100);
  const out = {
    url: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, ink, tilt, shape: shapeId, border: borderId, motif: motifId, layout,
    nameY: S.nameY || 50, nameW,
  };
  cache.set(key, out);
  return out;
}
