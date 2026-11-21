// Garment recipes: same generator, different parameters / palettes / add-ons.
import { lerp, smooth, fbm, vnoise, clamp01 } from './garment.mjs';
import { pattern } from './outfit.mjs';
const TAU = Math.PI * 2;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const gr = (a, b, amt) => (vnoise(a, b) - 0.5) * amt + (vnoise(a * 0.27 + 5, b * 0.27) - 0.5) * amt * 0.7;

// ------------------------------------------------------------------ round 2: dyed motifs (metric coords, metres) -> [mask, mask2]
const fr = (v) => ((v % 1) + 1) % 1;
const hash = (a, b) => fr(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
/** x along the cloth, y DOWN the cloth (depth below the arm / distance from the skirt top) */
export function motifMask(type, x, y) {
  switch (type) {
    case 'sun': { // small five-petal flowers (the sun rays are drawn from the sleeve corner separately)
      const cs = 0.05; const ix = Math.round(x / cs), iy = Math.round(y / cs - (ix & 1) * 0.5); const cx = ix * cs, cy = (iy + (ix & 1) * 0.5) * cs;
      const r = Math.hypot(x - cx, y - cy), a = Math.atan2(y - cy, x - cx) + hash(ix, iy) * 2; const R = 0.0125 * (0.62 + 0.38 * Math.cos(5 * a));
      return [r < R ? 1 : 0, r < 0.0035 ? 1 : 0]; }
    case 'snow': { // six-armed crystals with side branches
      const cs = 0.075; const ix = Math.round(x / cs), iy = Math.round(y / cs - (ix & 1) * 0.5); const cx = ix * cs, cy = (iy + (ix & 1) * 0.5) * cs;
      const dx = x - cx, dy = y - cy; const r = Math.hypot(dx, dy); const R = 0.024 * (0.75 + 0.25 * hash(ix, iy)); if (r > R) return [0, 0];
      const a = Math.atan2(dy, dx) + hash(iy, ix); const sec = Math.PI / 3; const da = Math.abs(fr(a / sec + 0.5) - 0.5) * sec; const arm = r * Math.sin(da) < 0.0016;
      const br = Math.abs(r - R * 0.55) < R * 0.18 && Math.abs(r * Math.sin(da) - (r - R * 0.45) * 0.8) < 0.0014; return [arm || br || r < 0.004 ? 1 : 0, r < 0.0025 ? 1 : 0]; }
    case 'wave': { // flowing wave lines with foam crests
      const yy = y + 0.013 * Math.sin((x / 0.085) * Math.PI * 2); const u = fr(yy / 0.026); const line = Math.abs(u - 0.5) < 0.11;
      const crest = Math.abs(u - 0.22) < 0.06 && fr(x / 0.085 + 0.25) < 0.18; return [line ? 1 : 0, crest ? 1 : 0]; }
    case 'festival': { // bold alternating discs and diamonds
      const cs = 0.07; const ix = Math.round(x / cs), iy = Math.round(y / cs); const dx = x - ix * cs, dy = y - iy * cs;
      if ((ix + iy) & 1) { const d = Math.abs(dx) + Math.abs(dy); return [d < 0.026 ? 1 : 0, d < 0.012 ? 1 : 0]; }
      const r = Math.hypot(dx, dy); return [r < 0.024 ? 1 : 0, Math.abs(r - 0.014) < 0.003 ? 1 : 0]; }
    case 'foxfire': { // will-o'-wisp flames, tip up (y is downward)
      const cs = 0.08; const ix = Math.round(x / cs), iy = Math.round(y / cs - (ix & 1) * 0.5); const cx = ix * cs + (hash(ix, iy) - 0.5) * 0.02, cy = (iy + (ix & 1) * 0.5) * cs;
      const dx = x - cx, dy = y - cy; const R = 0.012; const inBall = Math.hypot(dx, dy) < R; const t = -dy / (2.6 * R); const sway = 0.004 * Math.sin(t * 5);
      const inTip = dy < 0 && t < 1 && Math.abs(dx - sway * t) < R * (1 - t) * Math.sqrt(Math.max(0, 1 - t * 0.2)); const core = Math.hypot(dx, dy + 0.003) < R * 0.45;
      return [inBall || inTip ? 1 : 0, core ? 1 : 0]; }
    case 'moon': { // a row of moon phases
      const cs = 0.055; const ix = Math.round(x / cs); const cx = ix * cs, cy = 0; const dx = x - cx, dy = y - cy; const R = 0.017; if (Math.hypot(dx, dy) > R) return [0, 0];
      const ph = ((ix % 8) + 8) % 8; const off = (ph - 4) / 4 * 2 * R; const lit = ph === 4 ? true : Math.hypot(dx - off, dy) > R; return [lit ? 1 : 0, Math.hypot(dx, dy) > R - 0.0016 ? 1 : 0]; }
    case 'ripple': { // concentric ripple rings
      const cs = 0.12; const ix = Math.round(x / cs), iy = Math.round(y / cs - (ix & 1) * 0.5); const cx = ix * cs + (hash(ix, iy) - 0.5) * 0.04, cy = (iy + (ix & 1) * 0.5) * cs + (hash(iy, ix) - 0.5) * 0.03;
      const r = Math.hypot(x - cx, y - cy); if (r > 0.05) return [0, 0]; const u = fr(r / 0.0115); return [Math.abs(u - 0.5) < 0.13 ? 1 - r / 0.06 : 0, r < 0.003 ? 1 : 0]; }
    default: return [0, 0];
  }
}
// woven look: warp / weft slubs (directional, so it reads as cloth, not as noise)
const weave = (x, y, amt) => (vnoise(x * 900, y * 90) - 0.5) * amt + (vnoise(x * 90 + 31, y * 900) - 0.5) * amt;

// ------------------------------------------------------------------ paint factories (B atlas, local uv)
/** pleated skirt / hakama: c = { base, light, dark, hem?, pat?, hemMotif?:{type,col,col2,alpha}, stitch? } */
export const skirtPaint = (c) => (lu, lv, m) => {
  const th = m.t0 + m.span * lu; const w = m.pleatW(th); const deep = smooth(0.06, 0.3, lv);
  const X = th * 0.27, Y = lv * 0.9; const hemV = m.hemV ?? 0.97, topV = m.topV ?? 0.03;
  let col = c.base; if (c.pat) col = mixc(col, c.pat.col, pattern(c.pat, th * 0.3, lv * 0.8) * (c.pat.alpha ?? 1));
  if (c.band && lv > c.band.from && lv < c.band.to) col = c.band.col;
  if (c.hemMotif) { const reg = smooth(hemV - 0.3, hemV - 0.16, lv) * (1 - smooth(hemV - 0.05, hemV - 0.03, lv)); if (reg > 0) { const [m1, m2] = motifMask(c.hemMotif.type, X, (hemV - lv) * 0.9 - 0.06);
    col = mixc(col, c.hemMotif.col, m1 * reg * (c.hemMotif.alpha ?? 0.85)); if (c.hemMotif.col2) col = mixc(col, c.hemMotif.col2, m2 * reg * 0.9); } }
  col = mixc(col, c.light, Math.pow(w, 3) * 0.45 * deep);
  col = mixc(col, c.dark, Math.pow(1 - w, 4) * 0.7 * deep + 0.08 * fbm(lu * 30, lv * 6));
  // soft drape shading: long vertical folds that follow the pleats, stronger toward the hem
  col = mixc(col, c.dark, 0.16 * smooth(0.55, 0.9, fbm(th * 2.2, lv * 1.3 + 4)) * smooth(0.2, 0.8, lv));
  // ambient band right under the sash
  col = mixc(col, c.dark, 0.38 * (1 - smooth(topV, topV + 0.06, lv)));
  if (c.hem && lv > hemV - 0.04) col = mixc(col, c.hem, smooth(hemV - 0.04, hemV - 0.01, lv) * 0.6);
  // stitched hem
  if (lv > hemV - 0.027 && lv < hemV - 0.02 && fr(X / 0.009) < 0.55) col = mixc(col, c.stitch || mixc(c.base, c.dark, 0.6), 0.75);
  const g = gr(lu * 1400, lv * 700, 3) + weave(X, Y, 4); return [col[0] + g, col[1] + g, col[2] + g];
};
/** sleeve: c = { base, shade, motif:{type?, col, col2, alpha?}?, stitch?, pat?, border? } ; meta {K, L, Dm, foldN, folds} */
export const sleevePaint = (c) => (lu, lv, m) => {
  const ph = -Math.PI / 2 + TAU * lu; const s = Math.sin(ph); const dep = s < 0 ? -s * m.Dm : 0; const X = lv * m.L;
  let col = c.base; if (c.pat) col = mixc(col, c.pat.col, pattern(c.pat, X, dep + (s > 0 ? -s * 0.05 : 0)) * (c.pat.alpha ?? 1));
  const f = fbm(X * 16 + (Math.cos(ph) > 0 ? 0 : 9), dep * 2.5 + 1); col = mixc(col, c.shade, smooth(0.5, 0.82, f) * 0.3 + 0.22 * smooth(0.45, 1, dep / m.Dm));
  // the modelled vertical folds of the bag (same phase as the geometry in buildSleeve)
  // revision r2: sleeve drape — soft folds wrapping over the arm from the shoulder seam and sagging into the bag
  { const L = m.L || 0.5; const top = smooth(-0.55, 0.1, s); const sag = (1 - s) * 0.5;
    for (const [x0, a] of [[0.2, 0.55], [0.38, 0.5], [0.57, 0.42]]) { const d = (X - (x0 + 0.09 * sag) * L) / (0.045 * L); col = mixc(col, c.shade, a * Math.exp(-d * d) * top); } }
  if (m.folds && s < 0) { const q = -s; const fq = Math.pow(q, 1.3) * smooth(0.08, 0.3, lv); const fp = Math.sin(TAU * (lv * m.foldN + 0.15)); col = mixc(col, c.shade, 0.42 * fq * Math.pow(0.5 - 0.5 * fp, 1.5)); col = mixc(col, [255, 255, 255], 0.12 * fq * Math.pow(Math.max(0, fp), 3)); }
  if (c.motif && s < 0) { const type = c.motif.type || 'sun'; const al = c.motif.alpha ?? 0.85;
    if (type === 'sun') { const dx = m.L - X, dy = m.Dm - dep; const r = Math.hypot(dx, dy);
      if (r < 0.2) { const ang = Math.atan2(dy, dx); const ray = Math.pow(Math.abs(Math.sin(ang * 7)), 8) * (1 - r / 0.2) * smooth(0.035, 0.05, r); col = mixc(col, c.motif.col, ray * 0.7); } }
    const reg = smooth(0.4, 0.62, dep / m.Dm) * smooth(0.3, 0.6, lv); if (reg > 0) { const [m1, m2] = motifMask(type, X, dep);
      col = mixc(col, c.motif.col, m1 * reg * al); if (c.motif.col2) col = mixc(col, c.motif.col2, m2 * reg * 0.9); } }
  if (c.border && lv > 1 - c.border.w) col = c.border.col;
  if ((c.stitch || c.border) && lv > 0.94 && lv < 0.955 && ((lu * m.K * 5) % 1) < 0.5) col = c.stitch || mixc(c.base, c.border.col, 0.7);
  const g = gr(lu * 900, lv * 700, 3) + weave(X, dep, 4); return [col[0] + g, col[1] + g, col[2] + g];
};

/** kosode / juban torso (look round): form instead of a blank sheet — soft side shade, under-bust and armpit shade,
 *  centre-back and side seams, drape folds running from the chest into the sash, a blouse bunch above the sash.
 *  Gradients only (no speckle): the cel shader turns the painted dark into shade that follows the light. */
export const kosodePaint = (c) => (p, M, k) => {
  const x = p[0], y = p[1], zc = M.uchest[2]; const th = Math.atan2(x, p[2] - zc); const at = Math.abs(th);
  const r = Math.hypot(x, p[2] - zc); const waist = c.waist ?? lerp(M.spine[1], M.chest[1], 0.55); const cy = M.uchest[1];
  let t = 0;
  t += 0.22 * smooth(1.05, 1.65, at);                                                   // the sides turn away
  t += 0.28 * smooth(0.06 * k, 0, y - (M.uchest[1] - 0.015 * k)) * smooth(cy - 0.12 * k, cy - 0.04 * k, y) * smooth(0.9, 0.2, at) * 0.6; // under the bust
  t += 0.3 * smooth(1.2, 1.55, at) * smooth(M.chest[1] - 0.04 * k, M.uchest[1] + 0.03 * k, y);  // armpits
  const sgn = x >= 0 ? 1 : -1; const below = clamp01((cy - y) / Math.max(1e-3, cy - waist));
  for (const [x0, sl, wd] of [[0.035, 0.32, 0.011], [0.075, 0.18, 0.014]]) {          // two drape folds per side, into the sash
    const d = (x * sgn - (x0 - sl * (cy - y)) * k) / (wd * k); t += 0.26 * Math.exp(-d * d) * smooth(0.05, 0.4, below) * (y < cy ? 1 : 0) * smooth(1.2, 0.6, at); }
  const bh = (y - waist) / (0.075 * k);                                                  // blouse bunch above the sash
  if (bh > -0.2 && bh < 1) { const wv = 0.5 + 0.5 * Math.sin(th * 9 + Math.sin(th * 3.1) * 1.4 + bh * 2); t += 0.3 * Math.pow(wv, 3) * smooth(1, 0.1, bh); t += 0.18 * smooth(0.6, 0, bh); }
  // revision r2: a few big, readable fold shapes (the reviewer: "still one blank plane")
  //  - under the arm: a long diagonal drag fold from the armpit down toward the sash, front and back
  //  - a short tension fold just below the armpit
  //  - gathers pulled up out of the sash: short vertical folds fanning upward
  const ax = Math.abs(x);
  const seg = (x0, y0, x1, y1, w) => { const dx = x1 - x0, dy = y1 - y0; const L2 = dx * dx + dy * dy || 1e-9;
    const u = clamp01(((ax - x0) * dx + (y - y0) * dy) / L2); const ex = ax - (x0 + dx * u), ey = y - (y0 + dy * u);
    return [Math.exp(-(ex * ex + ey * ey) / (w * w)), u]; };
  const front = smooth(1.35, 1.0, at) + smooth(1.8, 2.15, at);                            // front or back panel, not the side
  { const [g, u] = seg(0.105 * k, M.uchest[1] - 0.025 * k, 0.045 * k, waist + 0.03 * k, 0.017 * k); t += 0.8 * g * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.08)) * front; }
  { const [g, u] = seg(0.115 * k, M.chest[1] + 0.01 * k, 0.085 * k, M.chest[1] - 0.05 * k, 0.012 * k); t += 0.55 * g * (1 - u * 0.6) * front; }
  { const up = (y - waist) / (0.13 * k); if (up > -0.05 && up < 1) { const fan = th * (7 + up * 1.5) + Math.sin(th * 2.3) * 0.8;
    const gv = Math.pow(0.5 + 0.5 * Math.sin(fan), 5); t += 0.42 * gv * smooth(1, 0.15, up) * smooth(-0.05, 0.08, up); } }
  const seamD = Math.min(r * Math.abs(Math.PI - at), r * Math.abs(at - Math.PI / 2) + 1e9 * (at < 1.2 || at > 1.9 ? 1 : 0));
  t += 0.35 * smooth(0.0028 * k, 0.0008 * k, seamD);                                     // centre-back + side seams
  let col = mixc(c.base, c.shade, clamp01(t));
  col = mixc(col, [255, 255, 255], 0.35 * smooth(0.5, 0, at) * smooth(cy - 0.06 * k, cy + 0.02 * k, y) * smooth(cy + 0.12 * k, cy + 0.02 * k, y)); // chest catches light
  const g = (vnoise(x * 900, y * 90) - 0.5) * 2 + (vnoise(th * 90, y * 900) - 0.5) * 2;
  return [col[0] + g, col[1] + g, col[2] + g];
};

// ------------------------------------------------------------------ palettes
const WHITE = [248, 245, 239], WSHADE = [196, 204, 230];
const VERM = { base: [204, 40, 34], light: [232, 70, 50], dark: [112, 14, 28], hem: [150, 22, 30] };

// ------------------------------------------------------------------ recipes
export const RECIPES = {
  akari: {
    src: 'char_akari.glb', out: 'char_akari_v2.glb', tex: 1024, texB: 2048,
    dropNodes: ['akari_ribbon'],
    shells: {
      torso: { mat: 'cloth_white', off: 0.011, smooth: 30, col: WHITE, shade: WSHADE, paint: kosodePaint({ base: WHITE, shade: WSHADE }) },
      arm: { mat: 'cloth_white', off: 0.006, to: 'wrist', col: WHITE, shade: WSHADE },
      leg: { mat: 'cloth_red_inner', off: 0.006, col: [184, 34, 34], shade: [110, 16, 30], folds: 0.3 },
      foot: { mat: 'cloth_white', off: 0.0035, col: [250, 250, 247], shade: [206, 212, 230], sole: [196, 196, 200], folds: 0.15 },
    },
    skirts: [({ M, k }) => ({ part: 'Hakama', top: lerp(M.spine[1], M.chest[1], 0.55), hem: M.footL[1] - 0.005, ease: 0.022, flare: [0.205, 0.178], curve: 1.5,
      pleats: 18, depth: 0.021, chains: 10, legFollow: 0.6, mat: 'cloth_red', rect: [0, 0, 0.6, 1], clear: 0.012, paint: skirtPaint(VERM) })],
    sleeves: { style: 'wide', end: 0.97, depth: 0.38, ease: 0.02, back: 0.03, mat: 'cloth_white_sode', rect: [0.6, 0, 1, 0.72], cord: { col: [200, 30, 36] }, tsuyu: true,
      paint: sleevePaint({ base: WHITE, shade: WSHADE, motif: { type: 'sun', col: [234, 120, 104], col2: [222, 176, 70] }, stitch: [196, 34, 38] }) },
    collar: ({ skirt, k }) => ({ outer: [250, 249, 244], inner: [200, 30, 36], endY: skirt ? skirtTop(skirt) + 0.004 * k : 1.0, cross: 0.42 }),
    sash: ({ M, skirt, k }) => ({ y: skirtTop(skirt) - 0.011 * k, h: 0.034, col: [196, 30, 34], bow: true, bowScale: 0.12, tail: 0.36, hemY: M.footL[1], koshiita: true, koshiCol: [190, 28, 32] }),
    charm: { theta: 0.85, len: 0.06, cord: [200, 30, 36], bell: [226, 182, 64], paper: true },
    sandals: { sole: [188, 150, 104], strap: [200, 30, 36] },
    ribbon: { col: [206, 34, 36], tail: 0.24, scale: 1 },
  },
};
export const skirtTop = (s) => s.rows[0].y;

// ================================================================== supporting cast: one factory, different parameters
import { fabric } from './outfit.mjs';
const H = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lighten = (c, f = 1.14) => c.map((v) => Math.min(255, v * f + 8));
const darken = (c) => [c[0] * 0.5, c[1] * 0.5, Math.min(255, c[2] * 0.58 + 10)];
const shadeC = (c) => [c[0] * 0.78, c[1] * 0.8, Math.min(255, c[2] * 0.88 + 14)];
export const sp = (base, o = {}) => skirtPaint({ base, light: lighten(base), dark: darken(base), hem: o.hem, pat: o.pat, band: o.band, hemMotif: o.hemMotif });
export const slp = (base, o = {}) => sleevePaint({ base, shade: shadeC(base), motif: o.motif, stitch: o.stitch, pat: o.pat, border: o.border });
const RECT = { s0: [0, 0, 0.45, 1], s1: [0.45, 0, 0.75, 0.5], s2: [0.45, 0.5, 0.75, 0.75], cape: [0.45, 0.75, 0.75, 1], sl: [0.75, 0, 1, 0.75] };
const hemOf = (len, M) => typeof len === 'number' ? len : { ankle: M.footL[1] - 0.005, calf: lerp(M.footL[1], M.llL[1], 0.42), knee: M.llL[1] - 0.05, aboveknee: lerp(M.llL[1], M.ulL[1], 0.25), thigh: lerp(M.llL[1], M.ulL[1], 0.5) }[len];

function npc(id, o) {
  const top = o.top; const inner = o.inner || top; const frontW = o.frontOpen || 0;
  const torsoPaint = frontW ? (p, M, k) => { const th = Math.atan2(p[0], p[2] - M.uchest[2]); const inFront = Math.abs(th) < frontW; return fabric(null, p, { col: inFront ? inner : top, pat: inFront ? o.innerPat : o.topPat, folds: 0.35, a: th * 0.15, b: p[1] }); } : undefined;
  const skirtF = (sk, i) => (ctx) => { const { M, k } = ctx; const prev = i > 0 ? ctx['skirt' + (i - 1)] : null; const hem = hemOf(sk.len, M);
    const trail = sk.trail || 0; const arc = sk.open ? [sk.open, Math.PI * 2 - sk.open] : sk.front ? [-sk.front, sk.front] : null;
    return { part: sk.part, top: lerp(M.spine[1], M.chest[1], sk.topT ?? 0.25), hem, hemFn: trail ? (th) => hem - trail * k * smooth(-0.2, -0.95, Math.cos(th)) : null, ease: sk.ease ?? 0.02, flare: sk.flare || [0.24, 0.2], curve: sk.curve || 0.9,
      pleats: sk.pleats || 0, depth: sk.depth || 0, chains: sk.chains ?? 8, legFollow: sk.legFollow ?? 0.55, parent: sk.parent, arc, mat: sk.mat || 'cloth_skirt', rect: RECT['s' + i], clear: 0.01,
      over: sk.over === false ? null : prev, hipDrop: i === 0 ? (o.obi.h || 0.04) + 0.006 : 0.03, edge: sk.edge ? { col: sk.edge, w: sk.edgeW || 0.011 } : null, seam: sk.seam ? { theta: 0.28, col: sk.seam, w: 0.008 } : null,
      paint: sp(sk.col, { pat: sk.pat, hem: sk.hem, band: sk.band, hemMotif: sk.hemMotif }) }; };
  const sl = o.sleeves;
  return {
    rename: o.src ? id : undefined, build: o.build, scaleAddons: o.scaleAddons, src: o.src || `char_${id}.glb`, out: o.out || `char_${id}_v2.glb`, tex: 512, keepPrims: ['HairBack'], dropAddons: o.dropAddons || [], pfxNote: o.note,
    shells: {
      torso: { mat: 'cloth_top', off: o.torsoOff ?? 0.010, smooth: 30, col: top, pat: o.topPat, folds: 0.35,
        // look round: plain tops get the painted form of the heroine's kosode (patterned / open-front tops keep theirs)
        paint: torsoPaint || (o.topPat ? undefined : (p, M, k) => kosodePaint({ base: top, shade: shadeC(top), waist: lerp(M.spine[1], M.chest[1], o.skirts[0].topT ?? 0.25) })(p, M, k)) },
      arm: { mat: 'cloth_top', off: 0.006, to: o.armTo || (sl.style === 'rolled' ? 'upper' : 'wrist'), col: o.under || inner, pat: o.underPat },
      leg: { mat: 'cloth_leg', off: 0.006, col: o.leg, folds: 0.25 },
      foot: { mat: 'cloth_foot', off: 0.0035, col: o.foot || [242, 240, 234], sole: [176, 174, 172], folds: 0.12 },
    },
    skirts: o.skirts.map(skirtF),
    sleeves: { style: sl.style, end: sl.end ?? 0.95, depth: sl.depth || 0, ease: sl.ease || 0.02, back: 0.025, wb: sl.wb, bell: sl.bell, drop: sl.drop, mat: 'cloth_sleeve', rect: RECT.sl,
      cord: sl.cord ? { col: sl.cord, w: sl.cordW, t: sl.cordT } : null, tsuyu: sl.tsuyu, paint: slp(sl.col || top, { motif: sl.motif, pat: sl.pat, stitch: sl.stitch, border: sl.border }) },
    collar: ({ skirt, k }) => ({ outer: o.collar || top, inner: o.collarInner || inner, endY: skirtTop(skirt) + 0.004 * k, reach: o.lapel ? -0.3 : 0.62, w: o.collarW }),
    sash: ({ M, skirt, k }) => ({ koshiita: !!o.koshiita, y: skirtTop(skirt) - (o.obi.h || 0.04) * k / 2 + 0.009 * k, h: o.obi.h || 0.04, col: o.obi.col, bow: !!o.obi.bow, bowScale: o.obi.bow || 0.08, tail: o.obi.tail || 0.18, bowCol: o.obi.bowCol, hemY: hemOf(o.skirts[0].len, M) }),
    sandals: { sole: o.sole || [176, 140, 96], strap: o.strap || [60, 40, 30] },
    extras: (o.extras || []).map((e) => e.type === 'cape' ? { ...e, rect: RECT.cape, paint: sp(e.col, { pat: e.pat }) } : e),
    ribbon: o.ribbon,
  };
}

Object.assign(RECIPES, {
  granny: npc('granny', { top: H('#f4f2f0'), inner: H('#f4f2f0'), collar: H('#9a86b4'), collarInner: H('#f8f6f4'), leg: H('#d8d0e2'),
    skirts: [{ part: 'Robe', len: 'ankle', col: H('#b4a2cc'), flare: [0.22, 0.19], pleats: 10, depth: 0.008, seam: H('#8a76a8'), chains: 8 }],
    sleeves: { style: 'wide', depth: 0.28, end: 0.93, col: H('#b4a2cc'), cord: H('#8a76a8'), motif: { col: H('#e8e0f2'), col2: H('#d4b060') } },
    obi: { col: H('#6a4a7a'), h: 0.07 }, collarW: 0.03, topPat: { type: 'kasuri', col: H('#d8cce6'), scale: 0.06, alpha: 0.55 } }), // r2: shawl dropped (fought the sleeve bags)
  himawari: npc('himawari', { koshiita: true, top: H('#f8f6f0'), collar: H('#fbfaf6'), collarInner: H('#e07a1c'), leg: H('#c8601a'),
    skirts: [{ part: 'Hakama', len: 'ankle', topT: 0.5, col: H('#e2731e'), flare: [0.215, 0.185], curve: 1.4, pleats: 16, depth: 0.016, chains: 10, legFollow: 0.6 }],
    sleeves: { style: 'tied', end: 0.55, col: H('#f8f6f0'), cord: H('#e07a1c') }, obi: { col: H('#e07a1c'), h: 0.032, bow: 0.09, tail: 0.26 },
    sole: H('#bc9a6a'), strap: H('#e07a1c'), extras: [{ type: 'tasuki', colour: H('#e8902a') }] }),
  ushio: npc('ushio', { top: H('#4fae9e'), inner: H('#4fae9e'), collar: H('#2f7f86'), collarInner: H('#d8f2ea'), leg: H('#9ad8cc'), under: H('#bfe8de'),
    skirts: [{ part: 'Tunic', len: 'knee', col: H('#2f8f96'), flare: [0.24, 0.21], chains: 8, hemMotif: { type: 'wave', col: H('#7fd4cc'), col2: H('#e8fbf6') } },
             { part: 'TunicOver', len: 'aboveknee', col: H('#5aa86a'), flare: [0.25, 0.22], chains: 8, open: 0.45, edge: H('#d8f2ea') }],
    sleeves: { style: 'bell', end: 0.92, bell: 1.6, drop: 1.9, col: H('#62b8a8'), cord: H('#d8f2ea'), motif: { type: 'wave', col: H('#e4f6f0'), col2: H('#ffffff'), alpha: 0.8 } }, obi: { col: H('#1f6a70'), h: 0.035 }, sole: H('#8aa07a'), strap: H('#2f7f86') }),
  kokonoe: npc('kokonoe', { top: H('#d8522a'), inner: H('#f4ead6'), frontOpen: 0.32, lapel: true, collar: H('#2a1a14'), collarInner: H('#f4ead6'), leg: H('#3a3a5a'), under: H('#f4ead6'),
    skirts: [{ part: 'Trousers', len: 'calf', topT: 0.1, col: H('#3e3e64'), flare: [0.2, 0.17], chains: 8, legFollow: 0.85 },
             { part: 'Happi', len: 'thigh', col: H('#d8522a'), flare: [0.24, 0.21], open: 0.32, edge: H('#2a1a14'), parent: 'hips', chains: 6, hemMotif: { type: 'festival', col: H('#f4d060'), col2: H('#2a1a14'), alpha: 0.95 } }],
    sleeves: { style: 'wide', end: 0.62, depth: 0.2, col: H('#d8522a'), cord: H('#2a1a14'), motif: { type: 'festival', col: H('#f4d060'), col2: H('#2a1a14'), alpha: 0.95 } }, obi: { col: H('#2a1a14'), h: 0.03 },
    dropAddons: ['FoxTail', 'FoxTailTip'], extras: [{ type: 'tails', n: 1, len: 0.62, r: 0.11, colour: H('#e2c27a'), tip: H('#fffaf0') }, { type: 'mask', side: -1 }] }),
  kuzunoha: npc('kuzunoha', { top: H('#ecebf2'), collar: H('#ecebf2'), collarInner: H('#b02030'), leg: H('#e0dce8'),
    skirts: [{ part: 'Robe', len: 'ankle', trail: 0.22, col: H('#e6e3ee'), flare: [0.25, 0.24], pleats: 12, depth: 0.01, chains: 10, band: { from: 0.9, to: 1.0, col: H('#b02030') }, seam: H('#b02030'), hemMotif: { type: 'foxfire', col: H('#d04050'), col2: H('#f0c060') } }],
    sleeves: { style: 'wide', depth: 0.42, end: 0.98, col: H('#e6e3ee'), cord: H('#b02030'), tsuyu: true, motif: { type: 'foxfire', col: H('#c8303e'), col2: H('#f0c060') }, border: { col: H('#b02030'), w: 0.035 } }, obi: { col: H('#b02030'), h: 0.06, bow: 0.1, tail: 0.3 },
    dropAddons: ['FoxTail', 'FoxTailTip'], extras: [{ type: 'tails', n: 5, len: 0.7, r: 0.068, spread: 2.5, colour: H('#e6e4ea'), tip: H('#f2e2d8') }] }),
  rikka: npc('rikka', { top: H('#fafcff'), collar: H('#fafcff'), collarInner: H('#9cd0f2'), leg: H('#e6f2fc'),
    skirts: [{ part: 'Kimono', len: 'ankle', col: H('#f6faff'), flare: [0.21, 0.19], chains: 8, band: { from: 0.93, to: 1, col: H('#a8d8f6') }, seam: H('#a8d8f6'), hemMotif: { type: 'snow', col: H('#9ccdf0'), col2: H('#ffffff') } }],
    sleeves: { style: 'wide', depth: 0.5, end: 0.97, col: H('#f8fbff'), cord: H('#a8d8f6'), motif: { type: 'snow', col: H('#7cbfec'), col2: H('#ffffff') } }, obi: { col: H('#8cc4ea'), h: 0.06, bow: 0.09, tail: 0.22 },
    collarW: 0.028, topPat: { type: 'asanoha', col: H('#bfe0f6'), scale: 0.05, alpha: 0.55 } }), // r2: frost cape dropped (fought the sleeve bags)
  naru: npc('naru', { build: { type: 'child' }, top: H('#283670'), inner: H('#e8b81e'), frontOpen: 0.34, lapel: true, collar: H('#e8c020'), collarInner: H('#e8b81e'), leg: H('#1c2450'), under: H('#f2e8d0'), armTo: 'upper',
    skirts: [{ part: 'Happi', len: 'thigh', topT: 0.1, col: H('#283670'), flare: [0.22, 0.19], open: 0.34, edge: H('#e8c020'), parent: 'hips', chains: 6, pat: { type: 'stripe', col: H('#e8c020'), scale: 0.09, duty: 0.12, alpha: 0.9 } }],
    sleeves: { style: 'rolled', end: 0.42, col: H('#283670'), cord: H('#e8c020'), cordW: 0.012, cordT: 0.006 }, obi: { col: H('#e8c020'), h: 0.03 },
    extras: [{ type: 'headband', colour: H('#f4f0e6'), y: 0.078 }, { type: 'sticks' }] }),
  shoku: npc('shoku', { top: H('#8a4a2a'), collar: H('#8a4a2a'), collarInner: H('#e8d8bc'), leg: H('#2e2422'), topPat: { type: 'kasuri', col: H('#d8b890'), scale: 0.06, alpha: 0.7 },
    skirts: [{ part: 'Kimono', len: 'knee', col: H('#8a4a2a'), flare: [0.23, 0.2], chains: 8, seam: H('#5a2e1a'), pat: { type: 'kasuri', col: H('#d8b890'), scale: 0.06, alpha: 0.7 } },
             { part: 'Apron', len: 'knee', col: H('#2c3c5a'), flare: [0.24, 0.21], front: 0.95, chains: 4, parent: 'hips', ease: 0.03 }],
    sleeves: { style: 'tied', end: 0.55, col: H('#8a4a2a'), cord: H('#e8d8bc'), pat: { type: 'kasuri', col: H('#d8b890'), scale: 0.06, alpha: 0.7 } }, under: H('#e8d8bc'), obi: { col: H('#2c3c5a'), h: 0.035 },
    extras: [{ type: 'tasuki', colour: H('#e8d8bc') }, { type: 'pouch', side: -1 }] }),
  kagami: npc('kagami', { top: H('#a8b8d4'), collar: H('#d8e0f0'), collarInner: H('#3a4a78'), leg: H('#c8d0e4'),
    skirts: [{ part: 'Robe', len: 'ankle', col: H('#9aaccc'), flare: [0.23, 0.2], pleats: 10, depth: 0.008, chains: 8, seam: H('#d8e0f0'), hemMotif: { type: 'ripple', col: H('#dfe6f6'), col2: H('#f4f0d0') } }],
    sleeves: { style: 'wide', depth: 0.36, end: 0.96, col: H('#a8b8d4'), cord: H('#3a4a78'), motif: { type: 'ripple', col: H('#eef3fc'), col2: H('#f4f0d0') } }, obi: { col: H('#3a4a78'), h: 0.055 },
    extras: [{ type: 'hatBack', r: 0.21, colour: H('#c8a868') }] }),
  oboroyo: npc('oboroyo', { koshiita: true, top: H('#3a2852'), collar: H('#3a2852'), collarInner: H('#d8dcec'), leg: H('#2a1c3c'), under: H('#3a2852'), torsoOff: 0.011,
    skirts: [{ part: 'Hakama', len: 'ankle', trail: 0.3, topT: 0.55, col: H('#b8b8d0'), flare: [0.235, 0.205], curve: 1.4, pleats: 18, depth: 0.017, chains: 10, legFollow: 0.55, hem: H('#7a7a98'), hemMotif: { type: 'moon', col: H('#6a6488'), col2: H('#4a4468') } }],
    sleeves: { style: 'wide', depth: 0.4, end: 0.97, col: H('#3a2852'), cord: H('#d8dcec'), tsuyu: true, motif: { type: 'moon', col: H('#c8cce0'), col2: H('#f2f4fa') }, stitch: H('#d8dcec') },
    obi: { col: H('#d8dcec'), h: 0.034, bow: 0.12, tail: 0.38 }, sole: H('#3a3040'), strap: H('#d8dcec') }),
  banou: npc('banou', { build: { type: 'male' }, src: 'char_granny.glb', out: 'char_banou.glb', top: H('#7a6e60'), inner: H('#4e4c4e'), frontOpen: 0.3, lapel: true, collar: H('#3a3430'), collarInner: H('#4e4c4e'), leg: H('#8a8478'), under: H('#5a5650'),
    skirts: [{ part: 'Kimono', len: 'knee', col: H('#4e4c4e'), flare: [0.22, 0.2], chains: 6, pat: { type: 'stripe', col: H('#5e5a58'), scale: 0.03, duty: 0.3, alpha: 0.6 } },
             { part: 'WorkCoat', len: 'thigh', col: H('#7a6e60'), flare: [0.25, 0.22], open: 0.3, edge: H('#3a3430'), parent: 'hips', chains: 6 }],
    sleeves: { style: 'wide', end: 0.8, depth: 0.16, col: H('#7a6e60'), cord: H('#3a3430') }, obi: { col: H('#3a3430'), h: 0.04 }, sole: H('#a08860'), strap: H('#3a3430'),
    dropAddons: ['HairBun', 'Kanzashi', 'KanzashiBead'], extras: [{ type: 'beard', len: 0.17, colour: H('#d6d4ce') }, { type: 'kasa', r: 0.25, colour: H('#b49660') }, { type: 'hammer', side: -1 }] }),
  // ---- generic folk: four presets recombined (short kimono + trousers, apron dress, haori coat, long kimono with obi)
  villager_a: npc('villager_a', { build: { type: 'male' }, scaleAddons: { StrawHat: 0.46, StrawHatBand: 0.46 }, top: H('#34466e'), collar: H('#2a3858'), collarInner: H('#d8d2c4'), leg: H('#6e5440'), topPat: { type: 'kasuri', col: H('#c8d0e0'), scale: 0.07, alpha: 0.8 },
    skirts: [{ part: 'Kimono', len: 'aboveknee', col: H('#34466e'), flare: [0.23, 0.2], chains: 6, parent: 'hips', seam: H('#2a3858'), pat: { type: 'kasuri', col: H('#c8d0e0'), scale: 0.07, alpha: 0.8 } }],
    sleeves: { style: 'short', end: 0.6, col: H('#34466e'), pat: { type: 'kasuri', col: H('#c8d0e0'), scale: 0.07, alpha: 0.8 } }, armTo: 'wrist', under: H('#d8d2c4'), obi: { col: H('#5a4630'), h: 0.03 }, sole: H('#c0a070'), strap: H('#6a5a40') }),
  villager_b: npc('villager_b', { top: H('#b4603c'), collar: H('#b4603c'), collarInner: H('#f0e6d4'), leg: H('#7a4a34'), topPat: { type: 'stripe', col: H('#e0a070'), scale: 0.035, duty: 0.3, alpha: 0.8 },
    skirts: [{ part: 'Kimono', len: 'calf', col: H('#b4603c'), flare: [0.22, 0.19], chains: 8, pat: { type: 'stripe', col: H('#e0a070'), scale: 0.035, duty: 0.3, alpha: 0.8 } },
             { part: 'Apron', len: 'knee', col: H('#ece4d2'), flare: [0.23, 0.2], front: 1.0, chains: 4, parent: 'hips', ease: 0.03 }],
    sleeves: { style: 'tied', end: 0.55, col: H('#b4603c'), pat: { type: 'stripe', col: H('#e0a070'), scale: 0.035, duty: 0.3, alpha: 0.8 } }, under: H('#f0e6d4'), obi: { col: H('#4a6a3a'), h: 0.045 },
    extras: [{ type: 'tasuki', colour: H('#c83a30') }] }),
  villager_c: npc('villager_c', { build: { type: 'male' }, top: H('#5e6c44'), inner: H('#c8b48a'), frontOpen: 0.3, lapel: true, collar: H('#3e4a2c'), collarInner: H('#c8b48a'), leg: H('#5a5a5e'), under: H('#c8b48a'),
    skirts: [{ part: 'Kimono', len: 'knee', col: H('#c8b48a'), flare: [0.22, 0.19], chains: 6, parent: 'hips' },
             { part: 'Haori', len: 'thigh', col: H('#5e6c44'), flare: [0.25, 0.22], open: 0.3, edge: H('#3e4a2c'), parent: 'hips', chains: 6 }],
    sleeves: { style: 'wide', end: 0.85, depth: 0.2, col: H('#5e6c44') }, obi: { col: H('#3e3428'), h: 0.035 } }),
  fox_a: npc('fox_a', { top: H('#c8461e'), inner: H('#f2e6cc'), frontOpen: 0.32, lapel: true, collar: H('#f2e6cc'), collarInner: H('#f2e6cc'), leg: H('#4a3024'), under: H('#f2e6cc'),
    skirts: [{ part: 'Trousers', len: 'calf', topT: 0.1, col: H('#5a3a2a'), flare: [0.2, 0.17], chains: 8, legFollow: 0.85 },
             { part: 'Happi', len: 'thigh', col: H('#c8461e'), flare: [0.24, 0.21], open: 0.32, edge: H('#f2e6cc'), parent: 'hips', chains: 6 }],
    sleeves: { style: 'wide', end: 0.6, depth: 0.18, col: H('#c8461e'), cord: H('#f2e6cc') }, obi: { col: H('#f2e6cc'), h: 0.03 },
    dropAddons: ['FoxTail', 'FoxTailTip'], extras: [{ type: 'tails', n: 1, len: 0.5, r: 0.09, colour: H('#c8601c'), tip: H('#fff6e8') }] }),
  fox_b: npc('fox_b', { top: H('#c8707a'), collar: H('#c8707a'), collarInner: H('#fff2e8'), leg: H('#7a3a3a'), topPat: { type: 'dots', col: H('#f6d0d0'), scale: 0.05, alpha: 0.7 },
    skirts: [{ part: 'Kimono', len: 'knee', col: H('#c8707a'), flare: [0.23, 0.2], chains: 8, seam: H('#9a4a52'), pat: { type: 'dots', col: H('#f6d0d0'), scale: 0.05, alpha: 0.7 } },
             { part: 'Apron', len: 'aboveknee', col: H('#fbf6ee'), flare: [0.23, 0.2], front: 0.9, chains: 4, parent: 'hips', ease: 0.03 }],
    sleeves: { style: 'tied', end: 0.55, col: H('#c8707a'), pat: { type: 'dots', col: H('#f6d0d0'), scale: 0.05, alpha: 0.7 } }, under: H('#fff2e8'), obi: { col: H('#7a2a3a'), h: 0.045, bow: 0.07, tail: 0.14 },
    dropAddons: ['FoxTail', 'FoxTailTip'], extras: [{ type: 'tails', n: 1, len: 0.48, r: 0.085, colour: H('#8a3a1c'), tip: H('#f6e8d8') }] }),
  town_a: npc('town_a', { build: { type: 'male' }, top: H('#3a2438'), inner: H('#22263e'), frontOpen: 0.3, lapel: true, collar: H('#1a1420'), collarInner: H('#22263e'), leg: H('#1e2034'), under: H('#22263e'),
    skirts: [{ part: 'Kimono', len: 'ankle', col: H('#22263e'), flare: [0.22, 0.19], pleats: 10, depth: 0.007, chains: 8, pat: { type: 'stripe', col: H('#30365a'), scale: 0.025, duty: 0.25, alpha: 0.9 } },
             { part: 'Haori', len: 'aboveknee', col: H('#3a2438'), flare: [0.25, 0.22], open: 0.3, edge: H('#1a1420'), parent: 'hips', chains: 6 }],
    sleeves: { style: 'wide', end: 0.9, depth: 0.26, col: H('#3a2438') }, obi: { col: H('#14121a'), h: 0.035 }, sole: H('#4a3a30'), strap: H('#1a1420') }),
  town_b: npc('town_b', { top: H('#7e3060'), collar: H('#7e3060'), collarInner: H('#f4e6d8'), leg: H('#5a2244'), topPat: { type: 'asanoha', col: H('#b05a8a'), scale: 0.06, alpha: 0.7 },
    skirts: [{ part: 'Kimono', len: 'ankle', col: H('#7e3060'), flare: [0.21, 0.19], chains: 8, seam: H('#4a1838'), pat: { type: 'asanoha', col: H('#b05a8a'), scale: 0.06, alpha: 0.7 } }],
    sleeves: { style: 'wide', end: 0.96, depth: 0.36, col: H('#7e3060'), motif: { col: H('#e0a0c0'), col2: H('#e0b040') }, pat: { type: 'asanoha', col: H('#b05a8a'), scale: 0.06, alpha: 0.7 } },
    obi: { col: H('#d8a840'), h: 0.08, bow: 0.15, tail: 0.24 } }),
});
