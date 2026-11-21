// Texture painting for figures: a tiny canvas with anti-aliased soft shapes (distance based), enough for a face — blush,
// lid lines, lips, an iris with depth — written as PNG. Colours are sRGB 0..1, alpha is straight.
import { encodePNG } from '../preview.mjs';
import { texRGBA } from './glbio.mjs';

export const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export class Canvas {
  constructor(w, h, rgb = [1, 1, 1], a = 1) { this.w = w; this.h = h; this.d = new Float32Array(w * h * 4); for (let i = 0; i < w * h; i++) { this.d[i * 4] = rgb[0]; this.d[i * 4 + 1] = rgb[1]; this.d[i * 4 + 2] = rgb[2]; this.d[i * 4 + 3] = a; } }
  /** per pixel: fn(px, py) -> [r, g, b, a] or null; composited over (box = [x0, y0, x1, y1] in pixels) */
  each(fn, box = [0, 0, this.w, this.h], mode = 'over') {
    const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1])), x1 = Math.min(this.w, Math.ceil(box[2])), y1 = Math.min(this.h, Math.ceil(box[3]));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const c = fn(x + 0.5, y + 0.5); if (!c || c[3] <= 0) continue;
      const i = (y * this.w + x) * 4, a = Math.min(1, c[3]), d = this.d;
      if (mode === 'set') { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; continue; }
      if (mode === 'mul') { d[i] *= 1 + (c[0] - 1) * a; d[i + 1] *= 1 + (c[1] - 1) * a; d[i + 2] *= 1 + (c[2] - 1) * a; continue; }
      const da = d[i + 3], oa = a + da * (1 - a);
      if (oa <= 0) continue;
      for (let k = 0; k < 3; k++) d[i + k] = (c[k] * a + d[i + k] * da * (1 - a)) / oa;
      d[i + 3] = oa;
    }
    return this;
  }
  /** a shape by signed distance in pixels (negative inside): colour, opacity, feather (pixels of soft edge) */
  shape(dist, rgb, alpha = 1, feather = 1, box, mode) { return this.each((x, y) => { const d = dist(x, y); if (d > feather) return null; return [rgb[0], rgb[1], rgb[2], alpha * (1 - sm(-feather, feather, d))]; }, box, mode); }
  ellipse(cx, cy, rx, ry, rgb, alpha = 1, feather = 1, mode) { const r = Math.min(rx, ry); return this.shape((x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * r, rgb, alpha, feather, [cx - rx - feather, cy - ry - feather, cx + rx + feather, cy + ry + feather], mode); }
  /** a stroke along a polyline [[x, y], ...] with width(t) pixels (t = 0..1 along) */
  stroke(pts, width, rgb, alpha = 1, feather = 0.8, mode) {
    const W = typeof width === 'function' ? width : () => width, n = pts.length - 1;
    let wmax = 0; for (let i = 0; i <= 10; i++) wmax = Math.max(wmax, W(i / 10));
    const bx = [1e9, 1e9, -1e9, -1e9]; for (const p of pts) { bx[0] = Math.min(bx[0], p[0]); bx[1] = Math.min(bx[1], p[1]); bx[2] = Math.max(bx[2], p[0]); bx[3] = Math.max(bx[3], p[1]); }
    const m = wmax / 2 + feather + 1;
    return this.shape((x, y) => {
      let best = 1e9;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[i + 1], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2));
        const d = Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t) - W((i + t) / n) / 2;
        if (d < best) best = d;
      }
      return best;
    }, rgb, alpha, feather, [bx[0] - m, bx[1] - m, bx[2] + m, bx[3] + m], mode);
  }
  bytes() { const o = new Uint8Array(this.w * this.h * 4); for (let i = 0; i < o.length; i++) o[i] = Math.max(0, Math.min(255, Math.round(this.d[i] * 255))); return o; }
  png() { return encodePNG(this.w, this.h, this.bytes(), 4); }
  /** renderer texture (figure/render.mjs) */
  tex() { return texRGBA(this.w, this.h, this.bytes()); }
}

// --------------------------------------------------------------------------------------------- 灯里's palette + textures
export const PAL = {
  skin: hex('#ecc6b8'), blush: hex('#d99393'), lip: hex('#d98a9b'), lipLine: hex('#895967'), crease: hex('#bf8996'),
  lash: hex('#292638'), lashWarm: hex('#5d4356'), brow: hex('#92839e'), white: [1.0, 0.988, 0.972], whiteShade: [0.84, 0.74, 0.8],
};
/** planar front mapping of the face: metres -> uv (u right = her left, v down) */
export const FACE_UV = { x0: -0.12, w: 0.24, yTop: 1.515, h: 0.24 };
export const faceUV = (x, y) => [(x - FACE_UV.x0) / FACE_UV.w, (FACE_UV.yTop - y) / FACE_UV.h];

/**
 * The face skin. f = { lids(s) -> [yU, yL], eye: { in, out }, mouthLine(x), mouthHalf, noseY, mouthY, iris }
 * Painted on both sides. What the cel shader's rounded normals cannot give is painted here: the nose's small shadow,
 * the lid crease, the dark base of the lashes inside the lid edge, a soft warmth on the cheeks, the lips.
 */
export function faceTexture(f, size = 1024) {
  const c = new Canvas(size, size, PAL.skin, 1), k = size / FACE_UV.w;
  const X = (x) => (x - FACE_UV.x0) * k, Y = (y) => (FACE_UV.yTop - y) * k, mm = (v) => v * 0.001 * k;
  const lashTh = f.lashTh || (() => 0.003);
  for (const sgn of [1, -1]) {
    const ex = (s) => sgn * (f.eye.in[0] + (f.eye.out[0] - f.eye.in[0]) * s);
    // Broad cheek colour picks up where the lower lid turns out. A few tapered pencil marks
    // sit within it and disappear naturally in the texture's lower mip levels.
    const yLo = f.lids(0.6)[1], appleY = yLo - 0.009;
    c.ellipse(X(sgn * 0.041), Y(appleY), mm(14), mm(5.4), hex('#eca8b1'), 0.28, mm(6.8));
    c.ellipse(X(sgn * 0.044), Y(appleY + 0.001), mm(7.2), mm(2.8), hex('#df9fab'), 0.17, mm(3.8));
    for (const dx of [-3.1, 0, 3.6]) {
      const x = 0.043 + dx / 1000, y = appleY + 0.0003 * dx;
      c.stroke([[X(sgn * (x - 0.0007)), Y(y - 0.0008)], [X(sgn * (x + 0.0011)), Y(y + 0.0013)]],
        (t) => mm(0.35) * Math.sin(Math.PI * t), hex('#c78092'), 0.43, mm(0.25));
    }
    // the socket: a faint rose veil over the upper lid, above the lash band
    const up = [], lo = [], cr = [], veil = [];
    for (let i = 0; i <= 40; i++) { const s = i / 40, [yU, yL] = f.lids(s); up.push([X(ex(s)), Y(yU)]); lo.push([X(ex(s)), Y(yL)]); veil.push([X(ex(s)), Y(yU + lashTh(s) + 0.002)]); }
    // the fold of the upper lid: a fine line 1.5 mm above the lash band, from over the inner third to the outer quarter
    for (let i = 0; i <= 30; i++) { const s = 0.14 + 0.66 * (i / 30), [yU] = f.lids(s); cr.push([X(ex(s)), Y(yU + lashTh(s) + 0.0015 + 0.0006 * Math.sin(Math.PI * (i / 30)))]); }
    c.stroke(veil, mm(5), PAL.crease, 0.16, mm(2.6));
    c.stroke(cr, (t) => mm(0.45) * (0.3 + 0.7 * Math.sin(Math.PI * t)), PAL.crease, 0.62, mm(0.35));
    // inside the lid edge (what the lid's thickness shows): the dark root of the lashes above; below, only a breath of
    // skin shade under the iris and a short dark stroke that grows toward the outer corner (review F1)
    c.stroke(up.slice(0, 9), mm(1.1), PAL.crease, 0.85, mm(0.4));                    // the inner corner stays soft: its wall is seen broadside at 3/4
    c.stroke(up.slice(5), (t) => mm(1.6) * sm(0, 0.1, t), PAL.lash, 1, mm(0.35));
    c.stroke(lo.slice(8, 29), (t) => mm(0.6) * (0.5 + 0.5 * t), PAL.crease, 0.3, mm(0.5));
    c.stroke(lo.slice(26), (t) => mm(0.25 + 1.0 * t), PAL.lash, 0.6, mm(0.4));
  }
  // Soft light on the tip over a short warm underside. Keep the bridge clear when viewed from the front.
  c.ellipse(X(0), Y(f.noseY + 0.0025), mm(3.2), mm(2.4), hex('#e6b1b8'), 0.27, mm(2.4));
  c.ellipse(X(-0.0004), Y(f.noseY + 0.0006), mm(1.8), mm(0.62), PAL.crease, 0.59, mm(0.65));
  c.ellipse(X(0.0005), Y(f.noseY + 0.0047), mm(1.1), mm(0.55), hex('#f8dcd0'), 0.54, mm(0.7));
  const hw = f.mouthHalf, line = [];
  for (let i = -24; i <= 24; i++) { const x = (i / 24) * hw; line.push([X(x), Y(f.mouthLine(Math.abs(x)))]); }
  // Follow the lip seam with a soft vermilion wash, leaving a sliver of reflected light on the lower roll.
  c.stroke(line, (t) => mm(4.4) * Math.sin(Math.PI * t) ** 0.7, hex('#e7a7b2'), 0.3, mm(1.3));
  c.ellipse(X(0), Y(f.mouthY - 0.0023), mm(6.6), mm(1.8), hex('#e5b0b9'), 0.43, mm(1.3));
  c.ellipse(X(-0.0012), Y(f.mouthY - 0.0019), mm(2.55), mm(0.48), hex('#f3d3cb'), 0.46, mm(0.5));
  c.stroke(line, (t) => mm(0.95) * (0.22 + 0.78 * Math.sin(Math.PI * t) ** 0.62),
    hex('#9f6571'), 0.9, mm(0.29));
  return c;
}

/** Violet-blue irises. The upper lid casts an indigo shadow, with a pale reflected arc at the bottom.
 * The large shapes survive downsampling, while the small facets only show up at portrait distance.
 */
export function irisTexture(size = 512) {
  const c = new Canvas(size, size, [0.17, 0.18, 0.33], 0), h = size / 2;
  const ink = hex('#292b50'), violet = hex('#4f477f'), body = hex('#7770c0'), periwinkle = hex('#aab8ed');
  const rim = hex('#353650'), pupil = hex('#282844'), reflected = hex('#e5edff');
  c.each((px, py) => {
    const u = (px - h) / h, v = (h - py) / h, r = Math.hypot(u, v);
    if (r > 1) return [...rim, 0];
    const depth = (1 - v) / 2 - 0.045 * u * u;
    let col = mix3(ink, violet, sm(0.03, 0.42, depth));
    col = mix3(col, body, sm(0.36, 0.68, depth));
    col = mix3(col, periwinkle, sm(0.60, 0.96, depth));
    const theta = Math.atan2(v, u);
    const lower = sm(0.17, -0.52, v), annulus = sm(0.44, 0.56, r) * (1 - sm(0.75, 0.89, r));
    const rays = Math.max(0, Math.cos(theta * 13 + 0.75 * Math.sin(theta * 5))) ** 6;
    col = mix3(col, reflected, lower * annulus * (0.17 + 0.43 * rays));
    const rp = Math.hypot(u / 0.31, (v - 0.11) / 0.49);
    col = mix3(col, reflected, 0.3 * lower * (1 - sm(1, 1.18, rp)));
    col = mix3(col, pupil, 1 - sm(0.84, 1.04, rp));
    col = mix3(col, rim, sm(0.83, 0.96, r) * (0.89 - 0.25 * lower));
    return [...col, 1 - sm(0.967, 0.998, r)];
  }, undefined, 'set');
  return c;
}
// Both eye bones carry the same window catchlight direction. A smaller low glint balances the diffuse warm arc.
export const GLINT_SPOTS = [{ u: 0.35, v: 0.39, ru: 0.236, rv: 0.158, a: 0.98 }, { u: -0.44, v: -0.49, ru: 0.106, rv: 0.087, a: 0.83 }];
export function highlightTexture(size = 128) {
  const c = new Canvas(size, size, [1, 1, 1], 0), h = size / 2;
  c.each((px, py) => {
    const u = (px - h) / h, v = -(py - h) / h; let m = 0;
    for (const g of GLINT_SPOTS) m = Math.max(m, (1 - sm(0.82, 1.0, Math.hypot((u - g.u) / g.ru, (v - g.v) / g.rv))) * g.a);
    return [1, 1, 1, m];
  }, undefined, 'set');
  return c;
}
export function whiteTexture(w = 128, h = 64) {
  const c = new Canvas(w, h, PAL.white, 1);
  // V7: in the game the visible white is mostly the two corners, and the old lilac-grey shade (top half + both sides) made
  // the whole white read grey-blue next to sunlit skin. Now: a clean warm white, and the lid's shadow as a soft rose-lilac
  // band under the upper lid only (the visible opening runs from v 0.14 to 0.78 of this patch).
  c.each((px, py) => { const v = py / h, u = px / w; const k = (1 - sm(0.1, 0.4, v)) * 0.82 + 0.05 * Math.max(sm(0.18, 0.0, u), sm(0.82, 1.0, u)); const col = mix3(PAL.white, PAL.whiteShade, Math.min(1, k + 0.09)); return [col[0], col[1], col[2], 1]; }, undefined, 'set');
  return c;
}
/** a line ribbon: colour with feathered long edges and ends */
export function lineTexture(rgb, { w = 64, h = 16, endFade = 0.06, edge = 0.22, tipRgb = null } = {}) {
  const c = new Canvas(w, h, rgb, 0);
  c.each((px, py) => { const u = px / w, v = py / h; const a = sm(0, edge, v) * sm(1, 1 - edge, v) * sm(0, endFade, u) * sm(1, 1 - endFade, u); const col = tipRgb ? mix3(rgb, tipRgb, sm(0.55, 1, u)) : rgb; return [col[0], col[1], col[2], a]; }, undefined, 'set');
  return c;
}
/** the inside of the mouth: left half = the dark hollow (redder below), right upper = teeth, right lower = tongue */
export function mouthTexture(s = 64) {
  const c = new Canvas(s, s, [0.3, 0.08, 0.1], 1);
  c.each((px, py) => {
    const u = px / s, v = py / s;
    if (u < 0.5) { const col = mix3(hex('#3d0e16'), hex('#8a2630'), sm(0.2, 0.95, v)); return [col[0], col[1], col[2], 1]; }
    if (v < 0.5) return [0.985, 0.97, 0.955, 1];
    const col = mix3(hex('#e0707a'), hex('#b84a58'), sm(0.5, 1, v)); return [col[0], col[1], col[2], 1];
  }, undefined, 'set');
  return c;
}
/** skin by two numbers per vertex: u = warmth (knees, elbows, knuckles, heels), v = depth of shade (folds, hollows) */
export function skinRampTexture(s = 64) {
  const c = new Canvas(s, s, PAL.skin, 1);
  c.each((px, py) => { const u = px / s, v = py / s; let col = mix3(PAL.skin, PAL.blush, u * 0.6); col = mix3(col, [col[0] * 0.8, col[1] * 0.66, col[2] * 0.66], v * 0.8); return [col[0], col[1], col[2], 1]; }, undefined, 'set');
  return c;
}
/** white under-robe cloth: u = fold shade (same hue, the cel shader turns it into light-following shade), v = edge trim */
export function clothRampTexture(s = 64, base = hex('#fbfaf6')) {
  const c = new Canvas(s, s, base, 1);
  c.each((px, py) => { const u = px / s; const col = mix3(base, [base[0] * 0.78, base[1] * 0.8, base[2] * 0.88], u); return [col[0], col[1], col[2], 1]; }, undefined, 'set');
  return c;
}

/** several line ribbons in one texture (rows top to bottom): one material, one draw, and the game's face-line merge is not needed */
export function lineAtlas(rows) {
  const w = rows[0].w, h = rows[0].h, c = new Canvas(w, h * rows.length, [0, 0, 0], 0);
  rows.forEach((r, k) => { for (let i = 0; i < w * h * 4; i++) c.d[k * w * h * 4 + i] = r.d[i]; });
  return c;
}
