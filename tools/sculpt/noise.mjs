// Seeded 3D noise for the sculpt kit: gradient noise, fbm, ridged, billow, cellular (Worley F1 / F2-F1). Pure functions,
// deterministic per seed, no allocation per call (workers rebuild the same fields from the same seeds).

function h3(i, j, k, s) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x9e3779b1) ^ Math.imul(s + 0x6a09e667, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
export const hash = h3;
/** uniform [0,1) from integers + seed */
export const rand3 = (i, j, k, s = 0) => h3(i | 0, j | 0, k | 0, s | 0) / 4294967296;

const G = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 1, 1, 0, 0, -1, 1, -1, 1, 0, 0, -1, -1];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(i, j, k, s, x, y, z) { const g = (h3(i, j, k, s) & 15) * 3; return G[g] * x + G[g + 1] * y + G[g + 2] * z; }

/** gradient noise, about [-1, 1] */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const a = grad(xi, yi, zi, seed, xf, yf, zf), b = grad(xi + 1, yi, zi, seed, xf - 1, yf, zf);
  const c = grad(xi, yi + 1, zi, seed, xf, yf - 1, zf), d = grad(xi + 1, yi + 1, zi, seed, xf - 1, yf - 1, zf);
  const e = grad(xi, yi, zi + 1, seed, xf, yf, zf - 1), f = grad(xi + 1, yi, zi + 1, seed, xf - 1, yf, zf - 1);
  const g = grad(xi, yi + 1, zi + 1, seed, xf, yf - 1, zf - 1), hh = grad(xi + 1, yi + 1, zi + 1, seed, xf - 1, yf - 1, zf - 1);
  const x1 = a + u * (b - a), x2 = c + u * (d - c), x3 = e + u * (f - e), x4 = g + u * (hh - g);
  const y1 = x1 + v * (x2 - x1), y2 = x3 + v * (x4 - x3);
  return (y1 + w * (y2 - y1)) * 1.1;
}
/** fractal sum, about [-1, 1] */
export function fbm(x, y, z, seed = 0, oct = 4, lac = 2.03, gain = 0.5) {
  let s = 0, a = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * noise3(x, y, z, seed + o * 17); n += a; a *= gain; x *= lac; y *= lac; z *= lac; }
  return s / n;
}
/** ridged: sharp crests (1 = on a ridge), [0, 1] */
export function ridged(x, y, z, seed = 0, oct = 4) {
  let s = 0, a = 1, n = 0, prev = 1;
  for (let o = 0; o < oct; o++) { let r = 1 - Math.abs(noise3(x, y, z, seed + o * 31)); r *= r; s += a * r * prev; prev = r; n += a; a *= 0.5; x *= 2.1; y *= 2.1; z *= 2.1; }
  return s / n;
}
/** billow: rounded lumps, [0, 1] */
export function billow(x, y, z, seed = 0, oct = 4) {
  let s = 0, a = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * Math.abs(noise3(x, y, z, seed + o * 13)); n += a; a *= 0.5; x *= 2.07; y *= 2.07; z *= 2.07; }
  return s / n;
}
/** cellular (Worley): returns F1 (distance to nearest feature, cell units) or F2-F1 when edge = true (0 on cell walls) */
export function cellular(x, y, z, seed = 0, edge = false) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let f1 = 9, f2 = 9;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const h = h3(xi + i, yi + j, zi + k, seed);
    const px = xi + i + (h & 1023) / 1024, py = yi + j + ((h >>> 10) & 1023) / 1024, pz = zi + k + ((h >>> 20) & 1023) / 1024;
    const d = Math.hypot(px - x, py - y, pz - z);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return edge ? f2 - f1 : f1;
}
/** small seeded PRNG for construction-time choices (mulberry32) */
export function prng(seed) {
  let a = (seed | 0) + 0x9e3779b9;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
