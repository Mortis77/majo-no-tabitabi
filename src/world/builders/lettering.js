// Hand lettering for the written surfaces of the world (banners, noren, signboards, plaques, notices) and the painted
// crests (mon) beside it. Everything is baked once into the sign's own canvas: no draw calls, no shader, no per-frame
// cost. See docs/api/structures.md "Look round: lettering".
//
// A sign is written by a hand, not set in type: each character differs a little in size, tilt and baseline; the ink is
// dense where the brush lands and thins towards the end of the character; on cloth and paper it bleeds a little; on
// old wood it fades and wears. The surface decides the look (style):
//   'cloth'   dyed nobori / banners: the letters are dye of fg, soft bleed into the weave
//   'resist'  noren: fg reserved out of the dyed ground (white resist on indigo), soft edge
//   'paper'   notices, lanterns: ink on paper, small bleed
//   'inkwood' signposts: ink brushed on plain wood, faded
//   'board'   lacquered shop signboards: paint in fg, worn
//   'gilded'  shrine plaques: carved and gilded (bevel + gold gradient)
// Callers that do not name a style get one inferred from bg / fg (see inferStyle).
import { t } from '../../core/i18n.js';
import { fontStack, handLettering } from '../../core/fonts.js';

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function rng32(a) {
  return () => { a = (a + 0x6D2B79F5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
}
function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function rgb(hex) {
  let s = String(hex || '#000').replace('#', '');
  if (s.length === 3 || s.length === 4) s = s.split('').map((x) => x + x).join('');
  const n = parseInt(s.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = (hex) => { const [r, g, b] = rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
/** hex mixed towards [r,g,b] by f, as a css colour (alpha a). */
function shade(hex, to, f, a = 1) { const c = rgb(hex); const m = c.map((v, i) => Math.round(v + (to[i] - v) * f)); return `rgba(${m[0]},${m[1]},${m[2]},${a})`; }
const WHITE = [255, 255, 255], BLACK = [0, 0, 0], WARM_DARK = [40, 22, 12];

/** Surface style from the colours a caller gives (for callers that do not say). */
export function inferStyle({ bg, fg, vertical, border, text }) {
  if (!text) return 'resist';
  if (!bg) return 'paper';
  const bl = lum(bg), fl = lum(fg);
  if (bl < 0.3 && fl > 0.5) return border ? (vertical ? 'gilded' : 'board') : 'resist';
  if (bl > 0.6 && fl < 0.35) return vertical ? 'cloth' : (bl < 0.86 ? 'inkwood' : 'paper');
  return 'cloth';
}

/** The crest that belongs to a place's own words (plaques name their place). */
export function crestFor(text) {
  const s = String(text);
  // only where the crest has no banner of its own (the shrine, fox and town crests ride on their banners)
  const by = { lakeisle: 'wave', mirrorlake: 'wave', palace: 'crescent' };
  for (const k in by) if (s === t('world.place.' + k)) return by[k];
  return '';
}

// shop boards are read from across a street at night: the brush regular script (not the running hand), a firmer
// stroke (BOLD, fraction of the glyph size), little dry-out and wear
const FONT_ROLE = { cloth: 'title', resist: 'title', gilded: 'title', inkwood: 'title', paper: 'sign', board: 'title' };
// how dry the brush runs out (destination-out strength) and how far the ink bleeds (fraction of the glyph size)
const DRY = { cloth: 0.42, resist: 0.3, paper: 0.55, inkwood: 0.6, board: 0.16, gilded: 0.12 };
const BLEED = { cloth: 0.05, resist: 0.025, paper: 0.03, inkwood: 0.012, board: 0, gilded: 0 };
const WEAR = { inkwood: 0.55, board: 0.12, gilded: 0.2 };
const BOLD = { board: 0.03 };

/**
 * Paint a whole sign into canvas `cv` (its full size). lines: string ('\n' = new line) or array; o: { bg, fg, vertical,
 * size (px of the canvas), border, style, crest, seed }. Returns cv.
 */
export function paintLettering(cv, lines, o = {}) {
  const W = cv.width, H = cv.height, c = cv.getContext('2d');
  const arr = (Array.isArray(lines) ? lines : String(lines).split('\n')).map((s) => String(s));
  const text = arr.join('');
  const style = o.style || inferStyle({ ...o, text: text.trim() });
  const crest = o.crest === undefined ? '' : o.crest;
  const rnd = rng32(hash(text + '|' + (o.seed || 0) + '|' + style));
  const fg = o.fg || '#30200f', bg = o.bg || '';
  c.save();
  c.clearRect(0, 0, W, H);

  // ---- ground: the dyed / painted / planed surface, with soft light, never noise ----------------------------------
  if (bg) {
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    const lin = c.createLinearGradient(0, 0, 0, H);
    const wood = style === 'board' || style === 'gilded' || style === 'inkwood';
    lin.addColorStop(0, shade(bg, WHITE, 1, wood ? 0.07 : 0.1));
    lin.addColorStop(0.55, 'rgba(255,255,255,0)');
    lin.addColorStop(1, shade(bg, BLACK, 1, wood ? 0.14 : 0.1));
    c.fillStyle = lin; c.fillRect(0, 0, W, H);
    const rad = c.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.25, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
    rad.addColorStop(0, 'rgba(0,0,0,0)'); rad.addColorStop(1, `rgba(0,0,0,${style === 'paper' ? 0.1 : 0.16})`);
    c.fillStyle = rad; c.fillRect(0, 0, W, H);
    if (wood) {      // grain: a few long, very soft streaks along the board (low contrast, wide: they survive mip-mapping)
      const n = 7 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) {
        const y = rnd() * H, th = Math.max(2, H * (0.02 + rnd() * 0.05));
        const g = c.createLinearGradient(0, y - th, 0, y + th);
        const a = 0.035 + rnd() * 0.05, dark = rnd() < 0.6;
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, dark ? `rgba(20,10,4,${a})` : `rgba(255,240,220,${a * 0.8})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, y - th, W, th * 2);
      }
    }
    if (style === 'cloth' || style === 'resist') {   // the cloth takes the dye unevenly: two broad, gentle clouds
      for (let i = 0; i < 2; i++) {
        const x = W * (0.2 + rnd() * 0.6), y = H * (0.2 + rnd() * 0.6), r = Math.max(W, H) * (0.3 + rnd() * 0.3);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, shade(bg, rnd() < 0.5 ? WHITE : BLACK, 1, 0.06)); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
    }
  }
  if (o.border && text.trim()) frame(c, W, H, o.border, style, rnd);

  // ---- layout ---------------------------------------------------------------------------------------------------
  const family = fontStack(FONT_ROLE[style] || 'title');
  const glyphs = [];       // { ch, x, y, fs, rot, sx, sy }
  let crestBox = null, area = null;     // area: where the text sits (used by a painted inscription)
  if (o.vertical) {
    const chars = [...arr.join('')];
    const units = chars.reduce((s, ch) => s + (ch.trim() ? 1 : 0.45), 0) || 1;
    let top = H * 0.05, avail = H * 0.9;
    // a tall banner carries a full crest at its head; a plaque (short and wide) only a small one above its name
    if (crest) { const cs = W * (H / W >= 3 ? 0.74 : 0.36); crestBox = { x: W / 2, y: top + cs / 2 + W * 0.04, r: cs / 2 }; top += cs + W * 0.14; avail = H * 0.95 - top; }
    const fs = o.size || Math.min(W * 0.76, avail / (units * 1.02));
    area = { x: W * 0.12, y: top, w: W * 0.76, h: avail };
    let y = top + Math.max(0, (avail - units * fs * 1.02) / 2);
    for (const ch of chars) {
      if (!ch.trim()) { y += fs * 0.45; continue; }
      glyphs.push({ ch, x: W / 2 + (rnd() - 0.5) * fs * 0.07, y: y + fs * 0.51 + (rnd() - 0.5) * fs * 0.05, fs: fs * (0.93 + rnd() * 0.12), rot: (rnd() - 0.5) * 0.09, sx: 0.96 + rnd() * 0.08, sy: 0.97 + rnd() * 0.07 });
      y += fs * 1.02;
    }
  } else {
    const n = arr.length;
    const cw = (s) => [...s].length;
    let left = 0, availW = W * 0.88;
    area = { x: W * 0.06, y: H * 0.1, w: W * 0.88, h: H * 0.8 };
    if (crest) { const cs = Math.min(H * 0.6, W * 0.3); crestBox = { x: W - cs * 0.62 - W * 0.04, y: H - cs * 0.62 - H * 0.06, r: cs / 2, corner: true }; }
    const longest = Math.max(1, ...arr.map(cw));
    const fs = o.size || Math.min((H * 0.8) / (n * 1.12), availW / (longest * 1.04));
    c.font = `400 ${fs}px ${family}`;
    arr.forEach((s, li) => {
      const chars = [...s];
      const widths = chars.map((ch) => Math.max(fs * 0.3, c.measureText(ch).width) * 1.04);
      const tw = widths.reduce((a, b) => a + b, 0);
      let x = left + (W - tw) / 2;
      const by = H / 2 + (li - (n - 1) / 2) * fs * 1.12 + (rnd() - 0.5) * fs * 0.04;
      chars.forEach((ch, i) => {
        if (ch.trim()) glyphs.push({ ch, x: x + widths[i] / 2, y: by + (rnd() - 0.5) * fs * 0.06, fs: fs * (0.93 + rnd() * 0.12), rot: (rnd() - 0.5) * 0.08, sx: 0.96 + rnd() * 0.08, sy: 0.96 + rnd() * 0.08 });
        x += widths[i];
      });
    });
  }

  // ---- the letters as a mask, then the brush: density falls off across each character, a few dry streaks ------------
  // a painted inscription for exactly this text (locale asset): it replaces the font glyphs, same surface treatment
  const hand = text.trim() && o.vertical !== undefined ? handLettering(text.replace(/\s+/g, '')) : null;
  if (hand && area && (hand.height > hand.width) === !!o.vertical) {
    const k = Math.min(area.w / hand.width, area.h / hand.height), dw = hand.width * k, dh = hand.height * k;
    const hx = area.x + (area.w - dw) / 2, hy = area.y + (area.h - dh) / 2, n = Math.max(1, glyphs.length);
    glyphs.length = 0;
    for (let i = 0; i < n; i++) glyphs.push({ ch: '', hand: true, x: o.vertical ? hx + dw / 2 : hx + dw * (i + 0.5) / n, y: o.vertical ? hy + dh * (i + 0.5) / n : hy + dh / 2, fs: o.vertical ? dw : dh, rot: 0, sx: 1, sy: 1 });
    glyphs.box = [hx, hy, dw, dh];
  }
  if (glyphs.length || crestBox) {
    const mask = mk(W, H), m = mask.getContext('2d');
    if (glyphs.box) { m.imageSmoothingEnabled = true; m.imageSmoothingQuality = 'high'; m.drawImage(hand, ...glyphs.box); }
    m.fillStyle = '#fff'; m.textAlign = 'center'; m.textBaseline = 'middle';
    for (const g of glyphs) {
      if (g.hand) continue;
      m.save(); m.translate(g.x, g.y); m.rotate(g.rot); m.scale(g.sx, g.sy);
      if (ARROWS[g.ch] !== undefined) brushArrow(m, ARROWS[g.ch], g.fs);
      else {
        m.font = `400 ${g.fs}px ${family}`; m.fillText(g.ch, 0, 0);
        if (BOLD[style]) { m.lineWidth = g.fs * BOLD[style]; m.lineJoin = 'round'; m.strokeStyle = '#fff'; m.strokeText(g.ch, 0, 0); }
      }
      m.restore();
    }
    if (crestBox) drawCrest(m, crest, crestBox.x, crestBox.y, crestBox.r, rnd);
    brush(m, glyphs, crestBox, style, rnd);
    compose(c, mask, fg, style, glyphs[0]?.fs || Math.min(W, H) * 0.5, rnd);
  }
  c.restore();
  return cv;
}

// the brush faces have no arrows (they would fall back to print type): signposts get them painted
const ARROWS = { '\u2192': 0, '\u2193': Math.PI / 2, '\u2190': Math.PI, '\u2191': -Math.PI / 2 };
function brushArrow(m, a, fs) {
  m.save(); m.rotate(a);
  m.strokeStyle = '#fff'; m.lineCap = 'round'; m.lineJoin = 'round';
  // the shaft, pressed at the start and lifted towards the tip
  m.beginPath(); m.moveTo(-fs * 0.36, -fs * 0.05); m.quadraticCurveTo(0, -fs * 0.07, fs * 0.34, 0); m.quadraticCurveTo(0, fs * 0.02, -fs * 0.36, fs * 0.05); m.closePath();
  m.lineWidth = fs * 0.04; m.stroke(); m.fill();
  m.lineWidth = fs * 0.08;
  m.beginPath(); m.moveTo(fs * 0.08, -fs * 0.26); m.quadraticCurveTo(fs * 0.24, -fs * 0.1, fs * 0.36, 0); m.stroke();
  m.lineWidth = fs * 0.07;
  m.beginPath(); m.moveTo(fs * 0.36, 0); m.quadraticCurveTo(fs * 0.22, fs * 0.12, fs * 0.1, fs * 0.25); m.stroke();
  m.restore();
}

/** Ink runs dry towards the end of each character: a soft gradient plus a few broad streaks, removed from the mask. */
function brush(m, glyphs, crestBox, style, rnd) {
  const dry = DRY[style] ?? 0.4;
  m.save();
  m.globalCompositeOperation = 'destination-out';
  const items = glyphs.map((g) => ({ x: g.x, y: g.y, s: g.fs }));
  if (crestBox) items.push({ x: crestBox.x, y: crestBox.y, s: crestBox.r * 2 });
  for (const it of items) {
    const h = it.s * 0.55;
    // density: full where the brush lands (upper left), thinner at the end (lower right)
    const a0 = rnd() * 0.5 - 0.25, dx = Math.cos(0.75 + a0), dy = Math.sin(0.75 + a0);
    const g = m.createLinearGradient(it.x - dx * h, it.y - dy * h, it.x + dx * h, it.y + dy * h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.12 + dry * 0.38})`);
    m.fillStyle = g; m.fillRect(it.x - h, it.y - h, h * 2, h * 2);
    // dry streaks: broad and few, only on the trailing half, along the stroke directions (across and down)
    const n = Math.round(2 + dry * 6);
    for (let i = 0; i < n; i++) {
      const across = rnd() < 0.6, len = it.s * (0.25 + rnd() * 0.35), wdt = Math.max(1.5, it.s * (0.018 + rnd() * 0.025));
      const sx = it.x + (rnd() * 0.9 - 0.15) * h, sy = it.y + (rnd() * 0.9 - 0.15) * h;
      // a soft elongated blob (no hard edge anywhere): the hairs of a drying brush part along the stroke
      const a = dry * (0.35 + rnd() * 0.45);
      m.save(); m.translate(sx, sy); if (!across) m.rotate(Math.PI / 2); m.scale(len / 2, wdt * 1.5);
      const rg = m.createRadialGradient(0.35, 0, 0, 0, 0, 1);
      rg.addColorStop(0, `rgba(0,0,0,${a})`); rg.addColorStop(0.6, `rgba(0,0,0,${a * 0.45})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = rg; m.fillRect(-1, -1, 2, 2);
      m.restore();
    }
  }
  m.restore();
}

/** Put the letter mask onto the sign in the surface's manner. */
function compose(c, mask, fg, style, fs, rnd) {
  const W = mask.width, H = mask.height;
  const tint = (col, blur = 0) => {
    const t2 = mk(W, H), x = t2.getContext('2d');
    if (blur > 0.3) x.filter = `blur(${blur.toFixed(2)}px)`;
    x.drawImage(mask, 0, 0); x.filter = 'none';
    x.globalCompositeOperation = 'source-in';
    if (typeof col === 'string') x.fillStyle = col; else x.fillStyle = col(x);
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
    return t2;
  };
  const bleed = BLEED[style] || 0;
  if (bleed > 0) { c.globalAlpha = style === 'resist' ? 0.55 : 0.4; c.drawImage(tint(shade(fg, BLACK, 0), fs * bleed), 0, 0); c.globalAlpha = 1; }
  if (style === 'gilded') {
    const d = Math.max(1, fs * 0.035);
    c.drawImage(tint('rgba(8,5,3,0.85)', d * 0.6), d * 0.9, d * 1.1);                        // carved recess shadow
    c.drawImage(tint(shade(fg, WHITE, 0.55, 0.7)), -d * 0.45, -d * 0.55);                   // lit upper edge
    c.drawImage(tint((x) => { const g = x.createLinearGradient(0, 0, 0, H); const n = 6;
      for (let i = 0; i <= n; i++) g.addColorStop(i / n, i % 2 ? shade(fg, WARM_DARK, 0.28) : shade(fg, WHITE, 0.18)); return g; }), 0, 0);  // gold leaf catching light
  } else if (style === 'board') {
    const d = Math.max(1, fs * 0.02);
    c.drawImage(tint('rgba(0,0,0,0.55)', d), d * 0.6, d * 0.8);
    const letters = tint(fg); wear(letters, WEAR.board, fs, rnd); c.drawImage(letters, 0, 0);
  } else if (style === 'inkwood') {
    const letters = tint(fg); wear(letters, WEAR.inkwood, fs, rnd); c.globalAlpha = 0.92; c.drawImage(letters, 0, 0); c.globalAlpha = 1;
  } else {
    c.globalAlpha = style === 'resist' ? 0.94 : 0.96; c.drawImage(tint(fg), 0, 0); c.globalAlpha = 1;
  }
}

/** Fading and wear on old wood: soft blotches taken out of the paint. */
function wear(cv, k, fs, rnd) {
  if (!k) return;
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  x.save(); x.globalCompositeOperation = 'destination-out';
  const n = Math.round(4 + k * 10 * (W * H) / (fs * fs * 6));
  for (let i = 0; i < Math.min(n, 60); i++) {
    const px = rnd() * W, py = rnd() * H, r = fs * (0.08 + rnd() * 0.22);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(0,0,0,${k * (0.35 + rnd() * 0.4)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  x.restore();
}

/** Frame of a board: a slightly uneven painted / gilt border with a fine inner line. */
function frame(c, W, H, col, style, rnd) {
  const lw = Math.max(2, Math.min(W, H) * 0.035), m = lw * 1.3;
  c.save();
  if (style === 'gilded') {
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = lw; c.strokeRect(m + lw * 0.3, m + lw * 0.4, W - 2 * m, H - 2 * m);
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, shade(col, WHITE, 0.25)); g.addColorStop(0.5, shade(col, WARM_DARK, 0.3)); g.addColorStop(1, shade(col, WHITE, 0.1));
    c.strokeStyle = g; c.lineWidth = lw; c.strokeRect(m, m, W - 2 * m, H - 2 * m);
    c.lineWidth = Math.max(1, lw * 0.3); c.strokeRect(m + lw * 1.6, m + lw * 1.6, W - 2 * (m + lw * 1.6), H - 2 * (m + lw * 1.6));
  } else {
    c.strokeStyle = col; c.globalAlpha = 0.85; c.lineCap = 'round';
    const pts = [[m, m], [W - m, m], [W - m, H - m], [m, H - m], [m, m]];
    c.lineWidth = lw;
    c.beginPath();
    pts.forEach(([px, py], i) => { const jx = (rnd() - 0.5) * lw * 0.5, jy = (rnd() - 0.5) * lw * 0.5; if (i) c.lineTo(px + jx, py + jy); else c.moveTo(px + jx, py + jy); });
    c.stroke();
    c.globalAlpha = 0.45; c.lineWidth = Math.max(1, lw * 0.3);
    c.strokeRect(m + lw * 1.5, m + lw * 1.5, W - 2 * (m + lw * 1.5), H - 2 * (m + lw * 1.5));
  }
  c.restore();
}

// ---- crests (mon): a few confident brush shapes in white on the mask ------------------------------------------------
/** Draw crest `kind` ('sun' | 'fox' | 'lantern' | 'wave' | 'crescent') centred at x, y, radius r, into mask context m. */
export function drawCrest(m, kind, x, y, r, rnd = Math.random) {
  m.save(); m.translate(x, y); m.fillStyle = '#fff'; m.strokeStyle = '#fff'; m.lineCap = 'round'; m.lineJoin = 'round';
  const ring = (w = 0.085) => { m.lineWidth = r * w; m.beginPath(); m.arc(0, 0, r * (1 - w / 2), 0.15 + rnd() * 0.2, Math.PI * 2 + 0.05); m.stroke(); };
  const cut = (fn) => { m.save(); m.globalCompositeOperation = 'destination-out'; fn(); m.restore(); };
  if (kind === 'sun') {
    // sun wheel: a full disc and twelve tapering rays, each laid with one stroke
    m.beginPath(); m.arc(0, 0, r * 0.36, 0, Math.PI * 2); m.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (rnd() - 0.5) * 0.04, r0 = r * 0.5, r1 = r * (0.9 + rnd() * 0.08), hw = r * 0.11;
      m.save(); m.rotate(a);
      m.beginPath(); m.moveTo(r0, -hw); m.quadraticCurveTo((r0 + r1) / 2, -hw * 0.55, r1, 0); m.quadraticCurveTo((r0 + r1) / 2, hw * 0.55, r0, hw);
      m.quadraticCurveTo(r0 - hw * 0.5, 0, r0, -hw); m.fill();
      m.restore();
    }
  } else if (kind === 'fox') {
    // a fox mask: two ears and a pointed face, the eyes left as slits of bare cloth
    m.beginPath();
    m.moveTo(0, r * 0.82);
    m.quadraticCurveTo(-r * 0.3, r * 0.42, -r * 0.62, r * 0.05);
    m.lineTo(-r * 0.66, -r * 0.82);
    m.quadraticCurveTo(-r * 0.4, -r * 0.5, -r * 0.2, -r * 0.34);
    m.quadraticCurveTo(0, -r * 0.4, r * 0.2, -r * 0.34);
    m.quadraticCurveTo(r * 0.4, -r * 0.5, r * 0.66, -r * 0.82);
    m.lineTo(r * 0.62, r * 0.05);
    m.quadraticCurveTo(r * 0.3, r * 0.42, 0, r * 0.82);
    m.fill();
    cut(() => {
      for (const s of [-1, 1]) {
        m.beginPath(); m.moveTo(s * r * 0.08, -r * 0.02); m.quadraticCurveTo(s * r * 0.3, -r * 0.14, s * r * 0.44, -r * 0.2);
        m.quadraticCurveTo(s * r * 0.3, r * 0.04, s * r * 0.08, -r * 0.02); m.fill();
        m.beginPath(); m.moveTo(s * r * 0.48, -r * 0.62); m.lineTo(s * r * 0.3, -r * 0.42); m.lineTo(s * r * 0.5, -r * 0.4); m.fill();
      }
    });
    m.beginPath(); m.arc(0, r * 0.6, r * 0.07, 0, Math.PI * 2); m.fill();
  } else if (kind === 'lantern') {
    // a paper lantern: round body with its ribs left bare, a cap and a foot
    m.beginPath(); m.ellipse(0, 0, r * 0.52, r * 0.62, 0, 0, Math.PI * 2); m.fill();
    m.fillRect(-r * 0.3, -r * 0.82, r * 0.6, r * 0.16); m.fillRect(-r * 0.3, r * 0.66, r * 0.6, r * 0.16);
    m.lineWidth = r * 0.06; m.beginPath(); m.moveTo(0, -r * 0.82); m.lineTo(0, -r * 0.98); m.stroke();
    cut(() => {
      m.lineWidth = r * 0.055;
      for (const k of [-0.36, -0.12, 0.12, 0.36]) { m.beginPath(); m.ellipse(0, r * k, r * 0.5 * Math.sqrt(1 - (k / 0.64) ** 2), r * 0.08, 0, 0.15, Math.PI - 0.15); m.stroke(); }
    });
    ring(0.07);
  } else if (kind === 'wave') {
    // a wave: three nested arcs rising from the bottom of a ring
    ring();
    m.save(); m.beginPath(); m.arc(0, 0, r * 0.84, 0, Math.PI * 2); m.clip();
    for (const [cx, cy] of [[-r * 0.42, r * 0.52], [r * 0.42, r * 0.52], [0, r * 0.06]]) {
      for (const k of [0.62, 0.42, 0.22]) { m.lineWidth = r * 0.1; m.beginPath(); m.arc(cx, cy, r * k, Math.PI * 1.02, Math.PI * 1.98); m.stroke(); }
    }
    m.restore();
  } else if (kind === 'crescent') {
    // a crescent: a disc with an offset disc taken away, inside a thin ring
    ring(0.06);
    m.save(); m.beginPath(); m.arc(-r * 0.06, 0, r * 0.7, 0, Math.PI * 2); m.fill(); m.restore();
    cut(() => { m.beginPath(); m.arc(r * 0.22, -r * 0.14, r * 0.6, 0, Math.PI * 2); m.fill(); });
  }
  m.restore();
}
