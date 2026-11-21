// Procedurally drawn sprite atlas for every particle in the game (no image files).
// All sprites are white / grey: the shader tints them per particle. The texture is uploaded PREMULTIPLIED
// (rgb = luminance * alpha), so bilinear filtering and mip-mapping never produce dark fringes.
import * as THREE from 'three';
import { mulberry32, TAU } from '../core/util.js';

export const COLS = 8, ROWS = 5, CELL = 128;

/** Sprite ids (cell index in the atlas, row-major from the top-left). */
export const S = {
  DOT: 0, GLOW: 1, SPARK: 2, STAR4: 3, SMOKE_A: 4, SMOKE_B: 5, FLAME: 6, DROP: 7,
  SHARD: 8, CHUNK: 9, MAPLE: 10, GINKGO: 11, LEAF: 12, PETAL: 13, FEATHER: 14, STAR5: 15,
  SNOW: 16, RING: 17, CRESCENT: 18, RUNE_A: 19, RUNE_B: 20, RUNE_C: 21, RUNE_D: 22, STREAK: 23,
  RAY: 24, WISP: 25, COMET: 26, PUFF_RING: 27, SPLINTER: 28, PLUS: 29, PAPER: 30, BUBBLE: 31,
  FORK_A: 32, FORK_B: 33, SPIRAL: 34, SMOKE_C: 35, FLAME_B: 36, DISC: 37, SLASH: 38, CHUNK_B: 39,
};

const grey = (l, a = 1) => { const v = Math.round(Math.max(0, Math.min(1, l)) * 255); return `rgba(${v},${v},${v},${a})`; };

function radial(ctx, r, stops, x = 0, y = 0) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const s of stops) g.addColorStop(s[0], grey(s[2] ?? 1, s[1]));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
/** Gaussian-ish falloff stops: alpha = peak * exp(-(k r)^2), reaching exactly 0 at the rim. */
function gauss(peak = 1, k = 2.3, n = 14) {
  const out = [];
  const edge = Math.exp(-k * k);
  for (let i = 0; i <= n; i++) { const o = i / n; out.push([o, peak * Math.max(0, (Math.exp(-(o * k) * (o * k)) - edge) / (1 - edge))]); }
  return out;
}
function poly(ctx, pts, close = true) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) { if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]); }
  if (close) ctx.closePath();
}
/** Draw `fn` twice: first blurred and faint (a halo), then crisp on top. */
function withHalo(ctx, blur, haloAlpha, fn) {
  ctx.save(); ctx.filter = `blur(${blur}px)`; ctx.globalAlpha = haloAlpha; fn(); ctx.restore();
  fn();
}

// ---- individual sprites. Origin = cell centre, R = usable radius, +y is DOWN (canvas). ------------------------

function drawDot(ctx, R) { radial(ctx, R, gauss(1, 2.2)); }

function drawGlow(ctx, R) {
  radial(ctx, R, [[0, 1], [0.07, 1], [0.16, 0.62], [0.3, 0.3], [0.5, 0.13], [0.72, 0.045], [0.9, 0.01], [1, 0]]);
}

function drawSpark(ctx, R) { // short fat spindle (used stretched along velocity)
  ctx.save(); ctx.scale(0.3, 1); radial(ctx, R, gauss(1, 2.0)); ctx.restore();
  ctx.save(); ctx.scale(0.12, 0.8); radial(ctx, R, gauss(1, 1.6)); ctx.restore();
}

function drawStar4(ctx, R) {
  radial(ctx, R * 0.5, gauss(0.55, 2.2));
  const spike = (len, w) => {
    ctx.beginPath();
    ctx.moveTo(0, -len); ctx.quadraticCurveTo(w * 0.35, -w * 0.35, len, 0); ctx.quadraticCurveTo(w * 0.35, w * 0.35, 0, len);
    ctx.quadraticCurveTo(-w * 0.35, w * 0.35, -len, 0); ctx.quadraticCurveTo(-w * 0.35, -w * 0.35, 0, -len);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
    g.addColorStop(0, grey(1, 1)); g.addColorStop(0.35, grey(1, 0.85)); g.addColorStop(1, grey(1, 0));
    ctx.fillStyle = g; ctx.fill();
  };
  spike(R, R * 0.2);
  ctx.save(); ctx.rotate(Math.PI / 4); spike(R * 0.42, R * 0.16); ctx.restore();
  radial(ctx, R * 0.16, [[0, 1], [0.6, 0.9], [1, 0]]);
}

function drawSmoke(ctx, R, seed) {
  const rng = mulberry32(seed);
  // a chunky cumulus silhouette: one core + lobes around it
  const blob = (x, y, r, a) => radial(ctx, r, [[0, a], [0.55, a * 0.94], [0.8, a * 0.5], [0.93, a * 0.14], [1, 0]], x, y);
  blob(0, 0, R * 0.62, 0.95);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.6, d = R * (0.4 + rng() * 0.16), r = R * (0.3 + rng() * 0.16);
    blob(Math.cos(a) * d, Math.sin(a) * d * 0.92, r, 0.9);
  }
  // volume: lit from the upper left, shaded lower right (kept inside the silhouette)
  ctx.globalCompositeOperation = 'source-atop';
  let g = ctx.createLinearGradient(-R * 0.6, -R * 0.75, R * 0.6, R * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = g; ctx.fillRect(-R, -R, 2 * R, 2 * R);
  for (let i = 0; i < 4; i++) { // soft inner creases
    const a = rng() * TAU, d = R * (0.15 + rng() * 0.3), r = R * (0.2 + rng() * 0.14);
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    g = ctx.createRadialGradient(x + r * 0.35, y + r * 0.4, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0)'); g.addColorStop(0.95, 'rgba(0,0,0,0.13)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawFlame(ctx, R, variant) {
  const lick = (s, l, a, lean) => {
    ctx.beginPath();
    ctx.moveTo(lean * R * 0.5 * s, -R * s);
    ctx.bezierCurveTo(R * 0.1 * s, -R * 0.55 * s, R * 0.62 * s, -R * 0.15 * s, R * 0.5 * s, R * 0.38 * s);
    ctx.bezierCurveTo(R * 0.42 * s, R * 0.86 * s, -R * 0.42 * s, R * 0.86 * s, -R * 0.5 * s, R * 0.38 * s);
    ctx.bezierCurveTo(-R * 0.62 * s, -R * 0.1 * s, -R * 0.2 * s, -R * 0.35 * s, lean * R * 0.5 * s, -R * s);
    ctx.fillStyle = grey(l, a); ctx.fill();
  };
  const lean = variant ? -0.5 : 0.35;
  ctx.save(); ctx.filter = 'blur(5px)'; lick(1, 0.75, 0.55, lean); ctx.restore();
  ctx.save(); ctx.filter = 'blur(1.5px)'; lick(0.9, 0.72, 0.9, lean); ctx.restore();
  ctx.save(); ctx.translate(0, R * 0.16); ctx.filter = 'blur(2px)'; lick(0.6, 1, 1, lean * 0.6); ctx.restore();
  if (variant) { ctx.save(); ctx.translate(R * 0.42, R * 0.1); ctx.rotate(0.35); ctx.filter = 'blur(1.5px)'; lick(0.38, 0.8, 0.85, 0.5); ctx.restore(); }
}

function drawDrop(ctx, R) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.95);
    ctx.bezierCurveTo(R * 0.12, -R * 0.5, R * 0.6, -R * 0.05, R * 0.6, R * 0.35);
    ctx.arc(0, R * 0.35, R * 0.6, 0, Math.PI);
    ctx.bezierCurveTo(-R * 0.6, -R * 0.05, -R * 0.12, -R * 0.5, 0, -R * 0.95);
  };
  ctx.save(); ctx.filter = 'blur(4px)'; ctx.globalAlpha = 0.35; path(); ctx.fillStyle = grey(1); ctx.fill(); ctx.restore();
  path();
  const g = ctx.createRadialGradient(-R * 0.1, R * 0.25, R * 0.05, 0, R * 0.25, R * 0.75);
  g.addColorStop(0, grey(0.62, 0.8)); g.addColorStop(0.7, grey(0.8, 0.9)); g.addColorStop(1, grey(1, 1));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.translate(-R * 0.22, R * 0.12); ctx.rotate(-0.5); ctx.scale(0.42, 1);
  radial(ctx, R * 0.3, [[0, 1], [0.6, 0.95], [1, 0]]); ctx.restore();
}

function drawShard(ctx, R) {
  const P = [[-0.08, -1], [0.4, -0.18], [0.16, 1], [-0.34, 0.3]].map((p) => [p[0] * R, p[1] * R]);
  ctx.save(); ctx.filter = 'blur(4px)'; ctx.globalAlpha = 0.4; poly(ctx, P); ctx.fillStyle = grey(1); ctx.fill(); ctx.restore();
  poly(ctx, P); ctx.fillStyle = grey(0.78, 0.95); ctx.fill();
  poly(ctx, [P[0], P[1], [0.02 * R, 0.1 * R]]); ctx.fillStyle = grey(1, 1); ctx.fill();
  poly(ctx, [P[3], P[2], [0.02 * R, 0.1 * R]]); ctx.fillStyle = grey(0.55, 0.95); ctx.fill();
  poly(ctx, [P[0], [0.02 * R, 0.1 * R], P[3]]); ctx.fillStyle = grey(0.9, 0.95); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = grey(1, 0.9); poly(ctx, P); ctx.stroke();
}

function drawChunk(ctx, R, seed) {
  const rng = mulberry32(seed);
  const n = 7, P = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (rng() - 0.5) * 0.5; const r = R * (0.62 + rng() * 0.33); P.push([Math.cos(a) * r, Math.sin(a) * r * 0.9]); }
  const c = [R * 0.08, -R * 0.1];
  poly(ctx, P); ctx.fillStyle = grey(0.5, 1); ctx.fill();
  // facets: top = light, right = mid, bottom-left = dark
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const lit = Math.max(0, (-my * 0.9 - mx * 0.45) / R);
    poly(ctx, [a, b, c]); ctx.fillStyle = grey(0.42 + lit * 0.62, 1); ctx.fill();
  }
  ctx.lineWidth = 1.2; ctx.strokeStyle = grey(0.36, 0.7); poly(ctx, P); ctx.stroke();
}

function drawMaple(ctx, R) {
  const lobes = [[0, 1.0], [0.92, 0.84], [-0.92, 0.84], [1.95, 0.56], [-1.95, 0.56]];
  ctx.save(); ctx.translate(0, R * 0.12);
  const body = () => {
    for (const [ang, len] of lobes) {
      const L = R * len, dx = Math.sin(ang), dy = -Math.cos(ang), px = dy, py = -dx;
      const at = (d, s) => [dx * L * d + px * L * s, dy * L * d + py * L * s];
      poly(ctx, [at(-0.06, -0.12), at(0.36, -0.2), at(0.5, -0.3), at(0.56, -0.14), at(0.74, -0.2), at(0.8, -0.07), at(1, 0),
        at(0.8, 0.07), at(0.74, 0.2), at(0.56, 0.14), at(0.5, 0.3), at(0.36, 0.2), at(-0.06, 0.12)]);
      ctx.fill();
    }
  };
  ctx.fillStyle = grey(0.92, 1); body();
  // tonal variation + veins
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
  g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g; ctx.fillRect(-R, -R * 1.2, 2 * R, 2.4 * R);
  ctx.strokeStyle = grey(0.5, 0.75); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (const [ang, len] of lobes) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(ang) * R * len * 0.86, -Math.cos(ang) * R * len * 0.86); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = grey(0.62, 1); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(R * 0.05, R * 0.4, -R * 0.08, R * 0.8); ctx.stroke();
  ctx.restore();
}

function drawGinkgo(ctx, R) {
  ctx.save(); ctx.translate(0, R * 0.5);
  const fan = () => {
    ctx.beginPath(); ctx.moveTo(0, 0);
    const N = 40, half = 1.02;
    for (let i = 0; i <= N; i++) {
      const th = -half + (2 * half * i) / N;
      const r = R * 1.28 * (0.93 + 0.05 * Math.cos(th * 11)) * (1 - 0.3 * Math.exp(-(th / 0.1) * (th / 0.1)));
      ctx.lineTo(Math.sin(th) * r, -Math.cos(th) * r);
    }
    ctx.closePath();
  };
  fan(); ctx.fillStyle = grey(0.95, 1); ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.3);
  g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(0.6, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.2)');
  ctx.fillStyle = g; ctx.fillRect(-R * 1.4, -R * 1.4, R * 2.8, R * 2.8);
  ctx.strokeStyle = grey(0.55, 0.5); ctx.lineWidth = 1.1;
  for (let i = -6; i <= 6; i++) { const th = i * 0.155; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(th) * R * 1.12, -Math.cos(th) * R * 1.12); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = grey(0.7, 1); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -R * 0.05); ctx.quadraticCurveTo(R * 0.06, R * 0.22, -R * 0.04, R * 0.46); ctx.stroke();
  ctx.restore();
}

function drawLeaf(ctx, R) {
  ctx.beginPath(); ctx.moveTo(0, -R);
  ctx.bezierCurveTo(R * 0.62, -R * 0.45, R * 0.56, R * 0.4, 0, R * 0.92);
  ctx.bezierCurveTo(-R * 0.56, R * 0.4, -R * 0.62, -R * 0.45, 0, -R);
  ctx.fillStyle = grey(0.9, 1); ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(-R * 0.5, 0, R * 0.5, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g; ctx.fillRect(-R, -R, 2 * R, 2 * R);
  ctx.strokeStyle = grey(0.5, 0.7); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(0, -R * 0.85); ctx.lineTo(0, R * 0.9); ctx.stroke();
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) { const y = i * R * 0.26; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(R * 0.34, y - R * 0.2); ctx.moveTo(0, y); ctx.lineTo(-R * 0.34, y - R * 0.2); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
}

function drawPetal(ctx, R) {
  ctx.beginPath(); ctx.moveTo(0, R * 0.95);
  ctx.bezierCurveTo(R * 0.75, R * 0.35, R * 0.72, -R * 0.55, R * 0.26, -R * 0.92);
  ctx.quadraticCurveTo(R * 0.1, -R * 0.84, 0, -R * 0.66);
  ctx.quadraticCurveTo(-R * 0.1, -R * 0.84, -R * 0.26, -R * 0.92);
  ctx.bezierCurveTo(-R * 0.72, -R * 0.55, -R * 0.75, R * 0.35, 0, R * 0.95);
  const g = ctx.createLinearGradient(0, R * 0.95, 0, -R * 0.9);
  g.addColorStop(0, grey(0.7, 1)); g.addColorStop(0.45, grey(0.95, 1)); g.addColorStop(1, grey(1, 1));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = grey(0.72, 0.5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, R * 0.8); ctx.lineTo(0, -R * 0.5); ctx.stroke();
}

function drawFeather(ctx, R) {
  ctx.save(); ctx.rotate(0.12);
  ctx.beginPath(); ctx.moveTo(0, -R);
  ctx.bezierCurveTo(R * 0.46, -R * 0.6, R * 0.44, R * 0.25, R * 0.1, R * 0.62);
  ctx.lineTo(R * 0.22, R * 0.36); ctx.lineTo(R * 0.02, R * 0.5);
  ctx.lineTo(-R * 0.08, R * 0.62);
  ctx.bezierCurveTo(-R * 0.42, R * 0.3, -R * 0.4, -R * 0.6, 0, -R);
  const g = ctx.createLinearGradient(-R * 0.4, 0, R * 0.4, 0);
  g.addColorStop(0, grey(0.82, 1)); g.addColorStop(0.5, grey(1, 1)); g.addColorStop(1, grey(0.88, 1));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = grey(0.62, 0.8); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -R * 0.9); ctx.quadraticCurveTo(R * 0.06, 0, -R * 0.02, R * 0.96); ctx.stroke();
  ctx.lineWidth = 0.9; ctx.strokeStyle = grey(0.7, 0.5);
  for (let i = 0; i < 7; i++) { const y = -R * 0.7 + i * R * 0.19; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(R * 0.3, y - R * 0.16); ctx.moveTo(0, y); ctx.lineTo(-R * 0.3, y - R * 0.16); ctx.stroke(); }
  ctx.restore();
}

function drawStar5(ctx, R) {
  radial(ctx, R, gauss(0.3, 2.0));
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? R * 0.36 : R * 0.82; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = grey(1, 1); ctx.stroke();
  ctx.fillStyle = grey(1, 1); ctx.fill();
}

function drawSnow(ctx, R) {
  radial(ctx, R * 0.9, gauss(0.25, 2.0));
  const arms = () => {
    ctx.lineCap = 'round'; ctx.strokeStyle = grey(1, 1);
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.rotate((i * Math.PI) / 3);
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -R * 0.88); ctx.stroke();
      ctx.lineWidth = 3.6;
      for (const [d, l] of [[0.42, 0.26], [0.66, 0.2]]) {
        ctx.beginPath(); ctx.moveTo(0, -R * d); ctx.lineTo(R * l * 0.87, -R * (d + l * 0.5)); ctx.moveTo(0, -R * d); ctx.lineTo(-R * l * 0.87, -R * (d + l * 0.5)); ctx.stroke();
      }
      ctx.restore();
    }
  };
  withHalo(ctx, 3, 0.5, arms);
}

function drawRing(ctx, R) {
  const ring = () => { ctx.beginPath(); ctx.arc(0, 0, R * 0.84, 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = grey(1, 1); ctx.stroke(); };
  ctx.save(); ctx.filter = 'blur(5px)'; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(0, 0, R * 0.84, 0, TAU); ctx.lineWidth = 9; ctx.strokeStyle = grey(1, 1); ctx.stroke(); ctx.restore();
  ring();
}

function drawPuffRing(ctx, R) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, grey(1, 0)); g.addColorStop(0.42, grey(1, 0.02)); g.addColorStop(0.62, grey(1, 0.3)); g.addColorStop(0.78, grey(1, 0.95));
  g.addColorStop(0.86, grey(1, 0.7)); g.addColorStop(1, grey(1, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
}

function drawCrescent(ctx, R, off) {
  // drawn on a scratch layer so the cut-out does not eat the halo
  const layer = (blur, alpha) => {
    const c = document.createElement('canvas'); c.width = c.height = CELL;
    const x = c.getContext('2d'); x.translate(CELL / 2, CELL / 2);
    x.fillStyle = grey(1, 1); x.beginPath(); x.arc(0, 0, R * 0.8, 0, TAU); x.fill();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.arc(R * off, -R * 0.06, R * (0.8 - off * 0.18), 0, TAU); x.fill();
    ctx.save(); ctx.filter = blur ? `blur(${blur}px)` : 'none'; ctx.globalAlpha = alpha; ctx.drawImage(c, -CELL / 2, -CELL / 2); ctx.restore();
  };
  layer(5, 0.6); layer(0.6, 1);
}

function runeStroke(ctx, R, which, lw = 7) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = grey(1, 1); ctx.fillStyle = grey(1, 1);
  const line = (a, b, c, d) => { ctx.beginPath(); ctx.moveTo(a * R, b * R); ctx.lineTo(c * R, d * R); ctx.stroke(); };
  const dot = (x, y, r = 0.09) => { ctx.beginPath(); ctx.arc(x * R, y * R, r * R, 0, TAU); ctx.fill(); };
  switch (which) {
    case 0: // ring pierced by a staff, two ticks
      ctx.beginPath(); ctx.arc(0, 0.05 * R, 0.42 * R, 0, TAU); ctx.stroke();
      line(0, -0.86, 0, 0.9); line(-0.3, -0.7, 0.3, -0.7); dot(0.66, 0.05); dot(-0.66, 0.05);
      break;
    case 1: // mountain over a bowl
      ctx.beginPath(); ctx.moveTo(-0.6 * R, 0.2 * R); ctx.lineTo(0, -0.8 * R); ctx.lineTo(0.6 * R, 0.2 * R); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0.3 * R, 0.56 * R, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      dot(0, -0.12, 0.11);
      break;
    case 2: // twin chevrons and a tail
      ctx.beginPath(); ctx.moveTo(-0.55 * R, -0.75 * R); ctx.lineTo(0.2 * R, -0.3 * R); ctx.lineTo(-0.55 * R, 0.15 * R); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.55 * R, -0.2 * R); ctx.lineTo(-0.15 * R, 0.3 * R); ctx.lineTo(0.55 * R, 0.8 * R); ctx.stroke();
      dot(0.55, -0.72); dot(-0.55, 0.72);
      break;
    default: // open moon holding a diamond
      ctx.beginPath(); ctx.arc(0, 0, 0.72 * R, 0.35 * Math.PI, 1.9 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -0.34 * R); ctx.lineTo(0.26 * R, 0); ctx.lineTo(0, 0.34 * R); ctx.lineTo(-0.26 * R, 0); ctx.closePath(); ctx.stroke();
      line(0.5, 0.52, 0.86, 0.86);
  }
}
function drawRune(ctx, R, which) { withHalo(ctx, 5, 0.6, () => runeStroke(ctx, R * 0.92, which)); }

function drawStreak(ctx, R) {
  ctx.save(); ctx.scale(0.16, 1); radial(ctx, R, gauss(1, 1.9)); ctx.restore();
  ctx.save(); ctx.scale(0.05, 0.9); radial(ctx, R, gauss(1, 1.5)); ctx.restore();
}

function drawRay(ctx, R) { // narrow at the bottom (origin), widening and fading toward the top
  ctx.save(); ctx.filter = 'blur(3px)';
  poly(ctx, [[-R * 0.05, R * 0.95], [R * 0.05, R * 0.95], [R * 0.3, -R * 0.9], [-R * 0.3, -R * 0.9]]);
  const g = ctx.createLinearGradient(0, R * 0.95, 0, -R * 0.9);
  g.addColorStop(0, grey(1, 0)); g.addColorStop(0.12, grey(1, 1)); g.addColorStop(0.5, grey(1, 0.5)); g.addColorStop(1, grey(1, 0));
  ctx.fillStyle = g; ctx.fill(); ctx.restore();
  ctx.save(); ctx.filter = 'blur(1px)';
  poly(ctx, [[-R * 0.02, R * 0.9], [R * 0.02, R * 0.9], [R * 0.07, -R * 0.6], [-R * 0.07, -R * 0.6]]);
  const g2 = ctx.createLinearGradient(0, R * 0.9, 0, -R * 0.6);
  g2.addColorStop(0, grey(1, 0)); g2.addColorStop(0.15, grey(1, 0.9)); g2.addColorStop(1, grey(1, 0));
  ctx.fillStyle = g2; ctx.fill(); ctx.restore();
}

function drawWisp(ctx, R) {
  const draw = () => {
    ctx.lineCap = 'round';
    const N = 46;
    let px = 0, py = 0;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const ang = -0.6 + s * 4.6, rad = R * (0.14 + 0.72 * s);
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
      if (i > 0) {
        ctx.lineWidth = 3 + 20 * Math.pow(Math.sin(Math.min(1, s * 1.15) * Math.PI), 0.8) * (1 - s * 0.55);
        ctx.strokeStyle = grey(1, 0.25 + 0.75 * Math.sin(s * Math.PI));
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      }
      px = x; py = y;
    }
  };
  ctx.save(); ctx.filter = 'blur(6px)'; ctx.globalAlpha = 0.6; draw(); ctx.restore();
  ctx.save(); ctx.filter = 'blur(2px)'; draw(); ctx.restore();
}

function drawComet(ctx, R) { // head at the top, tail fading to the bottom
  ctx.save(); ctx.filter = 'blur(2px)';
  ctx.beginPath(); ctx.arc(0, -R * 0.68, R * 0.2, Math.PI, 0);
  ctx.quadraticCurveTo(R * 0.14, R * 0.2, 0, R * 0.95);
  ctx.quadraticCurveTo(-R * 0.14, R * 0.2, -R * 0.2, -R * 0.68);
  const g = ctx.createLinearGradient(0, -R * 0.9, 0, R * 0.95);
  g.addColorStop(0, grey(1, 1)); g.addColorStop(0.25, grey(1, 0.9)); g.addColorStop(0.6, grey(1, 0.35)); g.addColorStop(1, grey(1, 0));
  ctx.fillStyle = g; ctx.fill(); ctx.restore();
  radial(ctx, R * 0.34, gauss(0.9, 2.0), 0, -R * 0.66);
}

function drawSplinter(ctx, R) {
  const P = [[-0.14, -1], [0.1, -0.8], [0.18, 0.2], [0.06, 0.96], [-0.1, 0.7], [-0.2, -0.1]].map((p) => [p[0] * R, p[1] * R]);
  poly(ctx, P); ctx.fillStyle = grey(0.9, 1); ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = grey(0.55, 0.8); ctx.lineWidth = 1.4;
  for (const x of [-0.08, 0.02, 0.1]) { ctx.beginPath(); ctx.moveTo(x * R, -R); ctx.lineTo((x + 0.03) * R, R); ctx.stroke(); }
  const g = ctx.createLinearGradient(-R * 0.2, 0, R * 0.2, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g; ctx.fillRect(-R, -R, 2 * R, 2 * R);
  ctx.globalCompositeOperation = 'source-over';
}

function drawPlus(ctx, R) {
  const plus = () => {
    ctx.fillStyle = grey(1, 1);
    const w = R * 0.3, l = R * 0.8;
    ctx.beginPath(); ctx.roundRect(-w / 2, -l, w, l * 2, w * 0.45); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-l, -w / 2, l * 2, w, w * 0.45); ctx.fill();
  };
  withHalo(ctx, 6, 0.6, plus);
}

function drawPaper(ctx, R) {
  ctx.save(); ctx.rotate(-0.08);
  ctx.fillStyle = grey(1, 1); ctx.beginPath(); ctx.roundRect(-R * 0.4, -R * 0.92, R * 0.8, R * 1.84, 3); ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(-R * 0.4, -R, R * 0.4, R);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g; ctx.fillRect(-R, -R, 2 * R, 2 * R);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = grey(0.45, 0.9); ctx.lineCap = 'round'; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.arc(0, -R * 0.4, R * 0.2, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -R * 0.16); ctx.lineTo(0, R * 0.62); ctx.moveTo(-R * 0.2, R * 0.12); ctx.lineTo(R * 0.2, R * 0.12);
  ctx.moveTo(-R * 0.16, R * 0.4); ctx.lineTo(R * 0.16, R * 0.4); ctx.stroke();
  ctx.restore();
}

function drawBubble(ctx, R) {
  radial(ctx, R * 0.86, [[0, 0.06], [0.7, 0.1], [0.92, 0.35], [1, 0]]);
  ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, TAU); ctx.lineWidth = 3.5; ctx.strokeStyle = grey(1, 0.95); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.58, 1.1 * Math.PI, 1.42 * Math.PI); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = grey(1, 1); ctx.stroke();
}

function drawFork(ctx, R, seed) {
  const rng = mulberry32(seed);
  const path = (x0, y0, x1, y1, n, jit) => {
    const pts = [[x0, y0]];
    for (let i = 1; i < n; i++) { const s = i / n; pts.push([x0 + (x1 - x0) * s + (rng() - 0.5) * jit, y0 + (y1 - y0) * s + (rng() - 0.5) * jit * 0.5]); }
    pts.push([x1, y1]);
    return pts;
  };
  const main = path(0, R * 0.95, (rng() - 0.5) * R * 0.3, -R * 0.95, 7, R * 0.5);
  const b1 = path(main[3][0], main[3][1], main[3][0] + R * (0.5 + rng() * 0.3), main[3][1] - R * 0.55, 4, R * 0.26);
  const b2 = path(main[5][0], main[5][1], main[5][0] - R * (0.4 + rng() * 0.3), main[5][1] - R * 0.4, 3, R * 0.22);
  const stroke = (lw) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'miter'; ctx.strokeStyle = grey(1, 1);
    ctx.lineWidth = lw; poly(ctx, main, false); ctx.stroke();
    ctx.lineWidth = lw * 0.6; poly(ctx, b1, false); ctx.stroke(); poly(ctx, b2, false); ctx.stroke();
  };
  ctx.save(); ctx.filter = 'blur(6px)'; ctx.globalAlpha = 0.65; stroke(12); ctx.restore();
  ctx.save(); ctx.filter = 'blur(0.6px)'; stroke(4.4); ctx.restore();
}

function drawSpiral(ctx, R) {
  const draw = (lw) => {
    ctx.lineCap = 'round'; ctx.strokeStyle = grey(1, 1);
    for (let k = 0; k < 2; k++) {
      let px = 0, py = 0;
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const s = i / N, ang = k * Math.PI + s * 5.4, rad = R * (0.08 + 0.84 * s);
        const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
        if (i > 0) { ctx.lineWidth = lw * (0.3 + Math.sin(s * Math.PI)); ctx.globalAlpha = Math.sin(s * Math.PI); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); }
        px = x; py = y;
      }
    }
    ctx.globalAlpha = 1;
  };
  ctx.save(); ctx.filter = 'blur(4px)'; draw(9); ctx.restore();
  ctx.save(); ctx.filter = 'blur(0.8px)'; draw(4); ctx.restore();
}

function drawDisc(ctx, R) { radial(ctx, R * 0.9, [[0, 1], [0.86, 1], [0.97, 0.5], [1, 0]]); }

function drawSlash(ctx, R) { // a thin sweeping arc (blade of wind / moonlight)
  const draw = (lw, a) => {
    ctx.lineCap = 'round'; ctx.strokeStyle = grey(1, a);
    const N = 40; let px = 0, py = 0;
    for (let i = 0; i <= N; i++) {
      const s = i / N, ang = Math.PI * (1.12 + 0.76 * s);
      const x = Math.cos(ang) * R * 0.9, y = Math.sin(ang) * R * 0.9 + R * 0.45;
      if (i > 0) { ctx.lineWidth = lw * Math.pow(Math.sin(s * Math.PI), 0.7) + 0.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); }
      px = x; py = y;
    }
  };
  ctx.save(); ctx.filter = 'blur(5px)'; draw(16, 0.6); ctx.restore();
  ctx.save(); ctx.filter = 'blur(1px)'; draw(8, 1); ctx.restore();
}

// ---- atlas -------------------------------------------------------------------------------------------------------

function finish(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;       // luminance data, used as-is
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 2;
  tex.needsUpdate = true;
  return tex;
}

/** Build the particle atlas. Returns { texture, canvas }. */
export function makeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL; canvas.height = ROWS * CELL;
  const ctx = canvas.getContext('2d');
  const R = CELL / 2 - 10;
  const cell = (i, fn) => {
    const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx + 1, cy + 1, CELL - 2, CELL - 2); ctx.clip();
    ctx.translate(cx + CELL / 2, cy + CELL / 2);
    fn(ctx, R);
    ctx.restore();
  };
  cell(S.DOT, drawDot); cell(S.GLOW, drawGlow); cell(S.SPARK, drawSpark); cell(S.STAR4, drawStar4);
  cell(S.SMOKE_A, (c, r) => drawSmoke(c, r, 11)); cell(S.SMOKE_B, (c, r) => drawSmoke(c, r, 29)); cell(S.SMOKE_C, (c, r) => drawSmoke(c, r, 53));
  cell(S.FLAME, (c, r) => drawFlame(c, r, 0)); cell(S.FLAME_B, (c, r) => drawFlame(c, r, 1));
  cell(S.DROP, drawDrop); cell(S.SHARD, drawShard);
  cell(S.CHUNK, (c, r) => drawChunk(c, r, 7)); cell(S.CHUNK_B, (c, r) => drawChunk(c, r, 23));
  cell(S.MAPLE, drawMaple); cell(S.GINKGO, drawGinkgo); cell(S.LEAF, drawLeaf); cell(S.PETAL, drawPetal); cell(S.FEATHER, drawFeather);
  cell(S.STAR5, drawStar5); cell(S.SNOW, drawSnow); cell(S.RING, drawRing); cell(S.PUFF_RING, drawPuffRing);
  cell(S.CRESCENT, (c, r) => drawCrescent(c, r, 0.42));
  cell(S.RUNE_A, (c, r) => drawRune(c, r, 0)); cell(S.RUNE_B, (c, r) => drawRune(c, r, 1));
  cell(S.RUNE_C, (c, r) => drawRune(c, r, 2)); cell(S.RUNE_D, (c, r) => drawRune(c, r, 3));
  cell(S.STREAK, drawStreak); cell(S.RAY, drawRay); cell(S.WISP, drawWisp); cell(S.COMET, drawComet);
  cell(S.SPLINTER, drawSplinter); cell(S.PLUS, drawPlus); cell(S.PAPER, drawPaper); cell(S.BUBBLE, drawBubble);
  cell(S.FORK_A, (c, r) => drawFork(c, r, 5)); cell(S.FORK_B, (c, r) => drawFork(c, r, 41));
  cell(S.SPIRAL, drawSpiral); cell(S.DISC, drawDisc); cell(S.SLASH, drawSlash);
  return { texture: finish(canvas), canvas };
}

/** The 512² magic-circle texture used by ground sigils (white on transparent, tinted by the shader). */
export function makeSigil() {
  const N = 512, canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  ctx.translate(N / 2, N / 2);
  const R = N / 2 - 14;
  const draw = () => {
    ctx.strokeStyle = grey(1, 1); ctx.fillStyle = grey(1, 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const circle = (r, lw) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); };
    circle(R, 7); circle(R * 0.93, 2.5); circle(R * 0.72, 3); circle(R * 0.68, 1.5); circle(R * 0.3, 3);
    // tick marks between the two outer rings
    ctx.lineWidth = 2;
    for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU, r0 = R * (i % 6 === 0 ? 0.86 : 0.9); ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93); ctx.stroke(); }
    // twelve runes on the band
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.save(); ctx.rotate(a); ctx.translate(0, -R * 0.825); runeStroke(ctx, R * 0.075, i % 4, 3.2); ctx.restore();
    }
    // two interlocked squares (an eight-pointed star) + inner petals
    ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) { ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = k * Math.PI / 4 + i * Math.PI / 2; ctx.lineTo(Math.cos(a) * R * 0.68, Math.sin(a) * R * 0.68); } ctx.closePath(); ctx.stroke(); }
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, -R * 0.3); ctx.quadraticCurveTo(R * 0.1, -R * 0.42, 0, -R * 0.56); ctx.quadraticCurveTo(-R * 0.1, -R * 0.42, 0, -R * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -R * 0.615, R * 0.022, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // heart: the golden ring with the moon laid over it
    ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, R * 0.17, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.105, 0.25 * Math.PI, 1.75 * Math.PI); ctx.lineWidth = 3.5; ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.21, Math.sin(a) * R * 0.21); ctx.lineTo(Math.cos(a) * R * (i % 2 ? 0.25 : 0.28), Math.sin(a) * R * (i % 2 ? 0.25 : 0.28)); ctx.stroke(); }
  };
  ctx.save(); ctx.filter = 'blur(7px)'; ctx.globalAlpha = 0.55; draw(); ctx.restore();
  draw();
  return { texture: finish(canvas), canvas };
}
