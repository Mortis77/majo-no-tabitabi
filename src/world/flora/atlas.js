// Painted foliage atlas, made at boot on a canvas (no image files). 4×4 tiles of 256 px.
// Channels: R = painted shade (grey, multiplied by the instance tint), G = tint mask (1 takes the instance tint, 0 takes
// the part's second colour: stems, flower centres, cattail heads), B = glow mask (leaf tips / petal edges, used only
// by glowing night instances), A = coverage (soft painted edges). Transparent texels are dilated with the colour of
// their neighbours so mipmaps never pull dark fringes in, and the material sharpens alpha per mip (alpha-to-coverage).
import * as THREE from 'three';
import { deciduousSpray, willowSpray } from './specimenBrush.js';
import { paintBroadCrown, paintConiferSpray } from './canopyBrush.js';
import { mulberry32 } from '../../core/util.js';

export const TILE = {
  broad: 0, maple: 1, ginkgo: 2, blossom: 3, needle: 4, bamboo: 5, willow: 6, bush: 7,
  fern: 8, sunflower: 9, flowers: 10, clump: 11, reed: 12, petal: 13, birch: 14, cedar: 15,
};
const N = 4, TS = 256;

/** UV rectangle of a tile: [u0, v0, u1, v1] (v up). A 3 px inset keeps mip levels inside the tile. */
export function tileUV(t) {
  const cx = t % N, cy = Math.floor(t / N), e = 3 / (N * TS);
  return [cx / N + e, 1 - (cy + 1) / N + e, (cx + 1) / N - e, 1 - cy / N - e];
}

let _tex = null;
export function foliageAtlas() {
  if (_tex) return _tex;
  const W = N * TS;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = W;
  const c = cv.getContext('2d');
  const col = (shade, tint = 1, glow = 0) => `rgb(${Math.round(255 * Math.min(1, Math.max(0, shade)))},${Math.round(255 * tint)},${Math.round(255 * glow)})`;
  for (const [name, t] of Object.entries(TILE)) {
    c.save();
    _org = [(t % N) * TS, Math.floor(t / N) * TS];
    c.translate(_org[0], _org[1]);
    c.beginPath(); c.rect(0, 0, TS, TS); c.clip();
    try { PAINT[name]?.(c, mulberry32(1000 + t * 77), col); } catch (e) { /* a broken tile stays empty */ }
    c.restore();
  }
  const img = c.getImageData(0, 0, W, W).data;
  const out = new Uint8Array(W * W * 4);
  // flip rows (canvas top -> v = 1) and copy
  for (let y = 0; y < W; y++) out.set(img.subarray((W - 1 - y) * W * 4, (W - y) * W * 4), y * W * 4);
  dilate(out, W, 6);
  const tex = new THREE.DataTexture(out, W, W, THREE.RGBAFormat);
  // look round: mips built here, colour averaged by coverage (no dark or pale fringes) and the alpha of every tile
  // rescaled so the share of texels that pass the cut-off stays what it is at full size: crowns keep their silhouette
  // at 100 m instead of thinning into speckle (no shader-side alpha boost needed).
  try { tex.mipmaps = coverageMips(out, W); tex.generateMipmaps = false; } catch (e) { tex.mipmaps = []; tex.generateMipmaps = true; }
  if (!tex.mipmaps.length) tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  _tex = tex;
  return tex;
}

let _org = [0, 0];
const CUT = 0.42 * 255; // the leaf materials' alpha cut-off

/**
 * Mip chain with coverage-weighted colour and per-tile alpha rescaled to keep the level-0 coverage
 * (fraction of texels above CUT) on every level where a tile is still at least 2 px wide.
 */
function coverageMips(base, W) {
  const mips = [{ data: base, width: W, height: W }];
  const cov0 = new Float64Array(N * N);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (base[(y * W + x) * 4 + 3] > CUT) cov0[Math.floor(y / TS) * N + Math.floor(x / TS)]++;
  for (let i = 0; i < N * N; i++) cov0[i] /= TS * TS;
  // working level: premultiplied rgb, plain rgb, raw (unscaled) alpha
  let w = W;
  let P = new Float32Array(w * w * 3), Q = new Float32Array(w * w * 3), A = new Float32Array(w * w);
  for (let i = 0; i < w * w; i++) {
    const a = base[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) { P[i * 3 + k] = base[i * 4 + k] * a; Q[i * 3 + k] = base[i * 4 + k]; }
    A[i] = base[i * 4 + 3];
  }
  while (w > 1) {
    const w2 = w >> 1;
    const P2 = new Float32Array(w2 * w2 * 3), Q2 = new Float32Array(w2 * w2 * 3), A2 = new Float32Array(w2 * w2);
    for (let y = 0; y < w2; y++) for (let x = 0; x < w2; x++) {
      const o = y * w2 + x;
      let a = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const j = (y * 2 + dy) * w + x * 2 + dx;
        a += A[j];
        for (let k = 0; k < 3; k++) { P2[o * 3 + k] += P[j * 3 + k] * 0.25; Q2[o * 3 + k] += Q[j * 3 + k] * 0.25; }
      }
      A2[o] = a * 0.25;
    }
    const out = new Uint8Array(w2 * w2 * 4);
    const ts = w2 / N;
    const scale = new Float32Array(N * N).fill(1);
    if (ts >= 2) {
      for (let t = 0; t < N * N; t++) {
        const tx = (t % N) * ts, ty = Math.floor(t / N) * ts;
        const frac = (s) => { let n = 0; for (let y = ty; y < ty + ts; y++) for (let x = tx; x < tx + ts; x++) if (A2[y * w2 + x] * s > CUT) n++; return n / (ts * ts); };
        if (cov0[t] <= 0 || frac(1) >= cov0[t]) continue;
        let lo = 1, hi = 4;
        for (let it = 0; it < 10; it++) { const m = (lo + hi) / 2; if (frac(m) < cov0[t]) lo = m; else hi = m; }
        scale[t] = hi;
      }
    }
    for (let y = 0; y < w2; y++) for (let x = 0; x < w2; x++) {
      const o = y * w2 + x, a = A2[o] / 255;
      const t = ts >= 1 ? Math.floor(y / ts) * N + Math.floor(x / ts) : 0;
      for (let k = 0; k < 3; k++) out[o * 4 + k] = Math.round(a > 0.004 ? Math.min(255, P2[o * 3 + k] / a) : Q2[o * 3 + k]);
      out[o * 4 + 3] = Math.round(Math.min(255, A2[o] * scale[t]));
    }
    mips.push({ data: out, width: w2, height: w2 });
    P = P2; Q = Q2; A = A2; w = w2;
  }
  return mips;
}

/**
 * Per-pixel shade of a leaf mass (look round): the lobes form one smooth height field (soft union, no circle edges);
 * its normal against a light from the upper left gives a few broad tone steps; rim leaves keep their painted value.
 * Writes R only, inside the tile at _org.
 */
function shadeMass(c, lobes, cx, cy, R, o) {
  const img = c.getImageData(_org[0], _org[1], TS, TS);
  const d = img.data;
  const H = new Float32Array(TS * TS);
  const k = Math.max(4, R * 0.16);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let m = -1e9;
    const hs = [];
    for (const L of lobes) {
      const q = ((x - L.x) ** 2 + (y - L.y) ** 2) / (L.r * L.r);
      if (q < 1) { const h = L.r * (1 - q) * 0.55 + L.z; hs.push(h); if (h > m) m = h; }
    }
    if (!hs.length) continue;
    let s = 0;
    for (const h of hs) s += Math.exp((h - m) / k);
    H[y * TS + x] = Math.max(0.01, m + k * Math.log(s) - k * Math.log(hs.length) * 0.35);
  }
  // soften the field once more (5x5 box) so lobe joins never print as arcs
  const H2 = new Float32Array(TS * TS);
  for (let y = 2; y < TS - 2; y++) for (let x = 2; x < TS - 2; x++) {
    const i = y * TS + x;
    if (H[i] <= 0) continue;
    let sum = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sum += H[i + dy * TS + dx];
    H2[i] = Math.max(0.01, sum / 25);
  }
  H.set(H2);
  const lx = -0.32, ly = -0.72, lz = 0.62;
  for (let y = 1; y < TS - 1; y++) for (let x = 1; x < TS - 1; x++) {
    const i = y * TS + x;
    if (d[i * 4 + 3] === 0) continue;
    const h = H[i];
    const ny = (y - cy) / R;
    let v;
    if (h > 0) {
      const gx = (H[i + 1] - H[i - 1]) * 0.5, gy = (H[i + TS] - H[i - TS]) * 0.5;
      const nl = Math.hypot(gx, gy, 1);
      const lam = Math.max(0, (-gx * lx - gy * ly + lz) / nl);
      // broad tone steps: soften the lambert into a gentle S, then a slow top-to-bottom fall
      const st = lam * lam * (3 - 2 * lam);
      v = (o.v0 ?? 0.62) + (o.v1 ?? 0.26) * st - 0.07 * ny;
      const rimV = d[i * 4] / 255;
      const e = Math.min(1, h / 5);
      v = rimV + (v - rimV) * e;
    } else v = d[i * 4] / 255;
    d[i * 4] = Math.round(255 * Math.min(1, Math.max(0, v)));
  }
  c.putImageData(img, _org[0], _org[1]);
  return img;
}

/** Fill RGB of empty texels from their covered neighbours (several rings), so mips keep the leaf colour at edges. */
function dilate(a, W, rings) {
  const filled = new Uint8Array(W * W);
  for (let i = 0; i < W * W; i++) filled[i] = a[i * 4 + 3] > 8 ? 1 : 0;
  for (let r = 0; r < rings; r++) {
    const add = [];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (filled[i]) continue;
      let R = 0, Gc = 0, B = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue;
        const j = yy * W + xx;
        if (!filled[j]) continue;
        R += a[j * 4]; Gc += a[j * 4 + 1]; B += a[j * 4 + 2]; n++;
      }
      if (n) add.push(i, R / n, Gc / n, B / n);
    }
    for (let k = 0; k < add.length; k += 4) {
      const i = add[k]; a[i * 4] = add[k + 1]; a[i * 4 + 1] = add[k + 2]; a[i * 4 + 2] = 0; filled[i] = 1;
    }
  }
  // the rest of the empty texels: a mid shade, tint mask on, no glow
  for (let i = 0; i < W * W; i++) if (!filled[i]) { a[i * 4] = 150; a[i * 4 + 1] = 255; a[i * 4 + 2] = 0; }
}

// ------------------------------------------------------------------ leaf shapes (drawn at the origin, pointing +x)
function ovate(c, L, Wd) {
  c.beginPath(); c.moveTo(0, 0);
  c.bezierCurveTo(L * 0.25, -Wd, L * 0.75, -Wd * 0.8, L, 0);
  c.bezierCurveTo(L * 0.75, Wd * 0.8, L * 0.25, Wd, 0, 0);
  c.fill();
}
function star(c, R, lobes = 5, inner = 0.42) {
  c.beginPath();
  for (let k = 0; k <= lobes * 2; k++) {
    const a = -Math.PI / 2 + (k / (lobes * 2)) * Math.PI * 2;
    const r = k % 2 ? R * inner : R * (k === 0 || k === lobes * 2 ? 1 : (k / 2) % lobes === 0 ? 1 : 0.92);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath(); c.fill();
}
function fan(c, R) {
  c.beginPath(); c.moveTo(0, 0);
  for (let k = 0; k <= 10; k++) {
    const a = -0.75 + (k / 10) * 1.5, r = R * (1 - 0.12 * Math.abs(Math.sin(k * 1.7)) - (k === 5 ? 0.2 : 0));
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath(); c.fill();
}
function petals(c, R, n = 5) {
  for (let k = 0; k < n; k++) {
    c.save(); c.rotate((k / n) * Math.PI * 2);
    c.beginPath(); c.ellipse(R * 0.5, 0, R * 0.52, R * 0.36, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

/**
 * A soft painted leaf MASS (round 2): a few big overlapping lobes, each shaded like a painted ball (light from the top,
 * dark core and underside), a scalloped rim of leaf shapes that catches the light, and only a handful of quiet leaf
 * strokes inside. Reads as one form at 5-20 m instead of a pile of busy leaves; the alpha edge is one soft painted
 * outline (no isolated dots that alpha-to-coverage turns into speckle). Rim leaves carry the glow mask (night tips).
 */
function cluster(c, rnd, col, o) {
  const cx = TS / 2, cy = TS / 2 + (o.cy || 0);
  const R = o.R || 92, sx = o.sx || 1, sy = o.sy || 1;
  const lobes = [];
  const nl = o.lobes || 6;
  for (let i = 0; i < nl; i++) {
    const a = i * 2.39996 + rnd() * 0.6, rr = i === 0 ? 0 : R * (0.34 + 0.2 * rnd());
    const y = cy + Math.sin(a) * rr * sy * 0.9;
    // upper lobes sit a little in front (z), so the soft union reads top-lit and layered
    lobes.push({ x: cx + Math.cos(a) * rr * sx, y, r: R * (i === 0 ? 0.64 : 0.44 + 0.12 * rnd()), z: (cy - y) * 0.12 });
  }
  // look round: a generous, clean silhouette. Few, large rim leaves (no isolated specks), drawn flat; the lobes are one
  // flat mass; all shading is then computed per pixel (shadeMass): soft tone steps instead of painted balls.
  const nr = o.rim || 22;
  for (let i = 0; i < nr; i++) {
    const L = lobes[Math.floor(rnd() * lobes.length)];
    const a = rnd() * 6.283;
    const x = L.x + Math.cos(a) * L.r * 0.82, y = L.y + Math.sin(a) * L.r * 0.82;
    if (Math.hypot((x - cx) / sx, (y - cy) / sy) < R * 0.5) continue;
    const up = 0.5 - (y - cy) / (2 * R);
    c.save(); c.translate(x, y); c.rotate(a + (rnd() - 0.5) * 0.5);
    c.fillStyle = col(0.66 + 0.24 * up + (rnd() - 0.5) * 0.04, 1, 1);
    o.leaf(c, (o.size || 34) * (0.9 + rnd() * 0.3), rnd);
    c.restore();
  }
  c.fillStyle = col(0.75, 1, o.glowIn || 0);
  for (const L of lobes) { c.beginPath(); c.arc(L.x, L.y, L.r, 0, 6.283); c.fill(); }
  const base = shadeMass(c, lobes, cx, cy, R, o);
  // a handful of light leaves on the lit upper edge of the mass and a few shaded ones low down: few, chosen details
  const acc = (n, upper, v) => {
    for (let i = 0; i < n; i++) {
      const L = lobes[Math.floor(rnd() * lobes.length)];
      const a = (upper ? -Math.PI / 2 - 0.5 : Math.PI / 2) + (rnd() - 0.5) * 1.4, rr = L.r * (0.55 + 0.25 * rnd());
      const x = L.x + Math.cos(a) * rr, y = L.y + Math.sin(a) * rr;
      c.save(); c.translate(x, y); c.rotate(a + (rnd() - 0.5) * 0.8);
      c.globalCompositeOperation = upper ? 'lighten' : 'darken';
      c.fillStyle = upper ? `rgb(${Math.round(255 * v)},0,0)` : `rgb(${Math.round(255 * v)},255,255)`;
      (o.accLeaf || o.leaf)(c, (o.size || 34) * (0.55 + rnd() * 0.2), rnd);
      c.restore();
    }
    c.globalCompositeOperation = 'source-over';
  };
  acc(o.lit ?? 7, true, 0.93);
  acc(o.dark ?? 4, false, 0.68);
  // the accents change the shade only: alpha, tint and glow masks come back from the shaded mass
  const now = c.getImageData(_org[0], _org[1], TS, TS), b = base.data, d = now.data;
  for (let i = 0; i < d.length; i += 4) { if (b[i + 3] > 0) d[i] = Math.min(d[i], 255); else d[i] = b[i]; d[i + 1] = b[i + 1]; d[i + 2] = b[i + 2]; d[i + 3] = b[i + 3]; }
  c.putImageData(now, _org[0], _org[1]);
}

const PAINT = {
  broad: paintBroadCrown,
  maple(c,r,col) { deciduousSpray(c,r,col,'maple'); },
  ginkgo(c, r, col) { cluster(c, r, col, { R: 76, size: 40, rim: 24, leaf: (c, s) => fan(c, s * 0.8) }); },
  blossom(c, r, col) {
    // A forked flowering spray in the crown atlas. The open spaces between twigs survive in silhouette.
    c.lineCap = 'round';
    const blooms = [];
    for (const [ex,ey,bend,count] of [[217,62,-18,8],[175,25,16,6],[232,151,-20,9],[52,70,-16,7],[58,172,23,6],[129,200,15,5]]) {
      const sx=121, sy=204, dx=ex-sx, dy=ey-sy, len=Math.hypot(dx,dy);
      const nx=-dy/len, ny=dx/len;
      const point=t=>[sx+dx*t+nx*bend*4*t*(1-t),sy+dy*t+ny*bend*4*t*(1-t)];
      c.strokeStyle=col(.44,.17); c.lineWidth=3.1;
      c.beginPath(); c.moveTo(sx,sy); c.quadraticCurveTo((sx+ex)/2+nx*2*bend,(sy+ey)/2+ny*2*bend,ex,ey); c.stroke();
      for(let i=1;i<=count;i++){
        const t=.17+.78*i/count, p=point(t), side=i%2 ? 1 : -1;
        const reach=side*(6+11*r()), x=p[0]+nx*reach,y=p[1]+ny*reach;
        c.strokeStyle=col(.50,.3); c.lineWidth=1.7;
        c.beginPath(); c.moveTo(p[0],p[1]); c.lineTo(x,y); c.stroke();
        blooms.push([x,y,7+6*r(),r()*6.28,r()*.19+.66]);
        if(i%3===0) {
          c.save(); c.translate(x,y); c.rotate(Math.atan2(dy,dx)+side*.75);
          c.fillStyle=col(.56,.05); ovate(c,13+4*r(),3.7); c.restore();
        }
      }
    }
    blooms.sort((a,b)=>b[1]-a[1]);
    for (const [x,y,radius,yaw,value] of blooms) {
      c.save(); c.translate(x,y); c.rotate(yaw); c.scale(1,.7+.24*r());
      for(let i=0;i<5;i++) {
        c.save(); c.rotate(i*Math.PI*.4);
        c.fillStyle=col(value+.09*Math.cos(yaw+i*1.257),.98,.14);
        c.beginPath(); c.moveTo(0,0);
        c.bezierCurveTo(radius*.12,-radius*.27,radius*.82,-radius*.56,radius,-radius*.27);
        c.quadraticCurveTo(radius*1.04,-radius*.08,radius*.85,0);
        c.quadraticCurveTo(radius*1.04,radius*.09,radius,radius*.23);
        c.bezierCurveTo(radius*.86,radius*.5,radius*.25,radius*.28,0,0); c.fill(); c.restore();
      }
      c.fillStyle=col(.48,.79); c.beginPath(); c.arc(0,0,radius*.15,0,6.283); c.fill();
      c.restore();
    }
  },
  needle(c,r,col) { paintConiferSpray(c,r,col); },
  cedar(c,r,col) { paintConiferSpray(c,r,col,true); },
  bamboo(c, r, col) {
    // round 3: a layered spray of SMALL lance leaves. A thin twig runs along the top (v = 1); from it hang 7 sprigs,
    // each a fan of 4-6 narrow leaves (about a fifth of the tile long, so on a 0.7 m card a leaf is ~13 cm).
    // Back sprigs are painted first and darker, front sprigs lighter: depth inside one card.
    const lance = (L, Wd) => { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * 0.3, -Wd, L, 0); c.quadraticCurveTo(L * 0.3, Wd, 0, 0); c.fill(); };
    c.strokeStyle = col(0.5, 0, 0); c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(6, 22); c.quadraticCurveTo(128, 8, 250, 30); c.stroke();
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < 7; i++) {
        const t = (i + 0.5 + (r() - 0.5) * 0.6) / 7, x = 12 + t * 232, y = 18 + 6 * Math.sin(t * 3.1) + layer * 30 + r() * 20;
        c.strokeStyle = col(0.45, 0, 0); c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(x, 18 + 4 * Math.sin(t * 3.1)); c.lineTo(x + (r() - 0.5) * 16, y); c.stroke();
        const nl = 4 + Math.floor(r() * 3);
        for (let k = 0; k < nl; k++) {
          c.save(); c.translate(x, y);
          c.rotate(Math.PI / 2 + (k / (nl - 1) - 0.5) * 1.9 + (r() - 0.5) * 0.25);
          const sh = layer ? 0.66 + r() * 0.26 : 0.42 + r() * 0.18;
          c.fillStyle = col(sh, 1, 0);
          const L = 46 + r() * 30;
          lance(L, 5 + r() * 2);
          c.fillStyle = col(Math.min(1, sh + 0.12), 1, 1); c.beginPath(); c.ellipse(L * 0.8, 0, L * 0.18, 1.6, 0, 0, 6.28); c.fill();
          c.restore();
        }
      }
    }
  },
  willow: willowSpray,
  bush(c, r, col) { cluster(c, r, col, { R: 80, size: 34, rim: 30, lobes: 7, leaf: (c, s) => ovate(c, s, s * 0.48) }); },
  clump(c, r, col) { cluster(c, r, col, { R: 80, size: 34, rim: 30, lobes: 8, leaf: (c, s) => ovate(c, s, s * 0.46) }); },
  fern(c, r, col) {
    // frond along +x from u=0 (base) to u=1 (tip), leaflets on both sides
    c.strokeStyle = col(0.5, 1, 0); c.lineWidth = 3;
    c.beginPath(); c.moveTo(4, TS / 2); c.quadraticCurveTo(128, TS / 2 - 8, 250, TS / 2 + 6); c.stroke();
    for (let i = 0; i < 30; i++) {
      const t = i / 30, x = 8 + t * 236, y = TS / 2 - 4 * Math.sin(t * 3) + t * 4;
      const L = 88 * Math.sin(Math.PI * (0.12 + 0.85 * t)) * (1 - 0.35 * t) + 8;
      for (const sd of [-1, 1]) {
        c.save(); c.translate(x, y); c.rotate(sd * (1.05 - 0.3 * t));
        c.fillStyle = col(0.5 + 0.3 * t + (sd < 0 ? 0.12 : 0) + (r() - 0.5) * 0.08, 1, t > 0.8 ? 1 : 0.15);
        ovate(c, L, 6.5); c.restore();
      }
    }
  },
  sunflower(c, r, col) {
    const cx = TS / 2, cy = TS / 2;
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 6.283 + ring * 0.13;
      c.save(); c.translate(cx, cy); c.rotate(a);
      c.fillStyle = col(0.72 + 0.2 * ring + (r() - 0.5) * 0.12, 1, 1);
      c.beginPath(); c.ellipse(70, 0, 46 - ring * 6, 13, 0, 0, 6.28); c.fill();
      c.restore();
    }
    const g = c.createRadialGradient(cx, cy, 4, cx, cy, 52);
    g.addColorStop(0, col(0.4, 0, 0.2)); g.addColorStop(1, col(0.75, 0, 0));
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 52, 0, 6.28); c.fill();
    for (let i = 0; i < 260; i++) { // seed spiral
      const a = i * 2.39996, rr = 3 * Math.sqrt(i);
      c.fillStyle = col(0.35 + (i % 3) * 0.08, 0, 0); c.beginPath(); c.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.6, 0, 6.28); c.fill();
    }
  },
  flowers(c, r, col) {
    // a little clump of wild flowers: stems (tint mask 0 -> stem colour) with petal heads (tint)
    for (let i = 0; i < 9; i++) {
      const x0 = 50 + r() * 156, top = 30 + r() * 110, bend = (r() - 0.5) * 50;
      c.strokeStyle = col(0.55, 0, 0); c.lineWidth = 3;
      c.beginPath(); c.moveTo(TS / 2 + (x0 - TS / 2) * 0.3, TS); c.quadraticCurveTo(x0, (TS + top) / 2, x0 + bend * 0.5, top); c.stroke();
      c.fillStyle = col(0.6, 0, 0); c.save(); c.translate(x0, (TS + top) / 1.9); c.rotate(-0.9 + r() * 1.8); ovate(c, 30, 7); c.restore();
      c.save(); c.translate(x0 + bend * 0.5, top);
      c.fillStyle = col(0.82 + r() * 0.15, 1, 1); petals(c, 16 + r() * 8, 5 + (i % 2));
      c.fillStyle = col(0.8, 0, 0.8); c.beginPath(); c.arc(0, 0, 5, 0, 6.28); c.fill();
      c.restore();
    }
  },
  reed(c, r, col) {
    for (let i = 0; i < 14; i++) {
      const x0 = 40 + r() * 176, top = 10 + r() * 80, bend = (r() - 0.5) * 60;
      c.fillStyle = col(0.5 + r() * 0.35, 1, 0.2);
      c.beginPath(); c.moveTo(x0 - 5, TS); c.quadraticCurveTo(x0, (TS + top) / 2, x0 + bend, top); c.quadraticCurveTo(x0 + 3, (TS + top) / 2, x0 + 5, TS); c.fill();
      if (i % 3 === 0) { c.fillStyle = col(0.42, 0, 0); c.beginPath(); c.ellipse(x0 + bend * 0.35, top + 50, 6, 22, bend * 0.004, 0, 6.28); c.fill(); }
    }
  },
  petal(c, r, col) {
    const g = c.createLinearGradient(0, TS, 0, 0);
    g.addColorStop(0, col(0.55, 1, 0.2)); g.addColorStop(1, col(1, 1, 1));
    c.fillStyle = g;
    c.beginPath(); c.moveTo(TS / 2, TS - 4);
    c.bezierCurveTo(TS * 0.02, TS * 0.6, TS * 0.2, TS * 0.08, TS / 2, 4);
    c.bezierCurveTo(TS * 0.8, TS * 0.08, TS * 0.98, TS * 0.6, TS / 2, TS - 4); c.fill();
  },
  birch(c,r,col) { deciduousSpray(c,r,col,'birch'); },
};
