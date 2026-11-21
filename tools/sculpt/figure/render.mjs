// CPU renderer for the figure work — a fork of tools/sculpt/preview.mjs `render` (that file is unchanged) that adds what a
// character needs to be judged before the game: back-face culling for one-sided parts, alpha (MASK in the depth pass, BLEND
// as depth-tested decals in mesh order), and a cel mode that follows the game's character shader in the points that
// decide a face (src/actors/celmat.js): half-lambert terminator + softness per material kind, the warm / cool shade tint,
// the subsurface band on skin, eye self-light, and the FACE NORMAL ROUNDING toward the head centre (85 %, centre pushed
// 35 mm back, y squashed) for the kinds face / eye / line. It is still not the game's shader: no rim, no grain, no fog.
import * as R from '../preview.mjs';

export const KIND = (name = '') => {
  if (/^Face$|_Face$|FaceSkin/i.test(name)) return 'face';
  if (/EyeWhite|EyeIris|EyeHighlight|Eye$/i.test(name)) return 'eye';
  if (/FaceEyeline|FaceEyelash|FaceBrow|FaceMouth/i.test(name)) return 'line';
  if (/Hair/i.test(name)) return 'hair';
  if (/^Body$|Skin/i.test(name)) return 'skin';
  return 'cloth';
};
// [terminator, softness], shade multiplier, sss, self light — celmat.js PRESET
const PRESET = {
  cloth: { p: [0.5, 0.05], k: 0.5, sss: 0, self: 0 }, skin: { p: [0.46, 0.06], k: 0.66, sss: 0.25, self: 0 }, face: { p: [0.4, 0.08], k: 0.78, sss: 0.22, self: 0 },
  hair: { p: [0.5, 0.05], k: 0.5, sss: 0, self: 0 }, eye: { p: [0.3, 0.2], k: 0.86, sss: 0, self: 0.12 }, line: { p: [0.3, 0.2], k: 0.9, sss: 0, self: 0 },
  garment: { p: [0.47, 0.1], k: 0.6, sss: 0, self: 0 },
};
const COOL = [0.78, 0.82, 1.0], WARM = [1.0, 0.8, 0.82];
export function shadeTint(kind, shadeColor, garment) {
  const pr = garment && kind === 'cloth' ? PRESET.garment : PRESET[kind] || PRESET.cloth;
  let s = shadeColor ? shadeColor.slice() : [1, 1, 1];
  const l = (s[0] + s[1] + s[2]) / 3; if (l > 0.001) s = s.map((v) => v / Math.max(l, 0.5));
  const tone = kind === 'skin' || kind === 'face' ? WARM : COOL;
  return s.map((v, i) => (v + (tone[i] - v) * 0.5) * tone[i] * pr.k);
}

export const LIGHTS = {
  day: { dir: n3([0.55, 0.75, 0.42]), key: [1.0, 0.95, 0.84].map((v) => v * 1.0), amb: [0.5, 0.56, 0.72].map((v) => v * 0.42), bg0: [0.62, 0.74, 0.88], bg1: [0.93, 0.9, 0.84] },
  front: { dir: n3([0.1, 0.35, 1]), key: [1, 0.96, 0.9], amb: [0.5, 0.56, 0.72].map((v) => v * 0.42), bg0: [0.62, 0.74, 0.88], bg1: [0.93, 0.9, 0.84] },
  left: { dir: n3([-0.9, 0.45, 0.35]), key: [1, 0.95, 0.84], amb: [0.5, 0.56, 0.72].map((v) => v * 0.42), bg0: [0.62, 0.74, 0.88], bg1: [0.93, 0.9, 0.84] },
  right: { dir: n3([0.9, 0.45, 0.35]), key: [1, 0.95, 0.84], amb: [0.5, 0.56, 0.72].map((v) => v * 0.42), bg0: [0.62, 0.74, 0.88], bg1: [0.93, 0.9, 0.84] },
  top: { dir: n3([0.15, 1, 0.25]), key: [1, 0.95, 0.84], amb: [0.5, 0.56, 0.72].map((v) => v * 0.42), bg0: [0.62, 0.74, 0.88], bg1: [0.93, 0.9, 0.84] },
  back: { dir: n3([-0.5, 0.5, -0.8]), key: [1, 0.9, 0.78], amb: [0.5, 0.56, 0.72].map((v) => v * 0.42), bg0: [0.62, 0.74, 0.88], bg1: [0.93, 0.9, 0.84] },
  dusk: { dir: n3([-0.8, 0.22, 0.45]), key: [1.0, 0.62, 0.38].map((v) => v * 0.95), amb: [0.42, 0.4, 0.6].map((v) => v * 0.4), bg0: [0.36, 0.38, 0.6], bg1: [0.95, 0.62, 0.42] },
  night: { dir: n3([0.4, 0.7, 0.5]), key: [0.42, 0.52, 0.9].map((v) => v * 0.6), amb: [0.2, 0.24, 0.42].map((v) => v * 0.5), bg0: [0.03, 0.04, 0.1], bg1: [0.08, 0.1, 0.2] },
};
function n3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

function sampleTex(t, u, v, out) {
  let x = u * t.w - 0.5, y = v * t.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const W = t.w, H = t.h, d = t.d;
  const ix = (a) => ((a % W) + W) % W, iy = (b) => ((b % H) + H) % H;
  const a = iy(y0) * W + ix(x0), b = iy(y0) * W + ix(x0 + 1), c = iy(y0 + 1) * W + ix(x0), e = iy(y0 + 1) * W + ix(x0 + 1);
  const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, we = fx * fy;
  for (let k = 0; k < 3; k++) out[k] = d[a * 3 + k] * wa + d[b * 3 + k] * wb + d[c * 3 + k] * wc + d[e * 3 + k] * we;
  out[3] = t.a ? t.a[a] * wa + t.a[b] * wb + t.a[c] * wc + t.a[e] * we : 1;
  return out;
}

/**
 * meshes: [{ pos, nrm, idx, uv?, tex? ({w,h,d,a?}), col?, base?, material (name: decides the cel kind), kind?, shade? (MToon
 *   shadeColor), garment?, alphaMode ('OPAQUE'|'MASK'|'BLEND'), alphaCutoff, opacity, doubleSided, ink = true, emit, bind?
 *   (bind-pose positions for the face rounding when `pos` is posed / morphed) }]
 * opts: { ss = 2, clay, light (LIGHTS.x or name), cel = true, headC ([x,y,z] bind space: face rounding centre; null = off),
 *   sph = 0.85, ground = false, groundY, shadow = true, ink = true, bg }
 */
export function render(meshes, cam, opts = {}) {
  const ss = opts.ss ?? 2, W = cam.w * ss, H = cam.h * ss;
  const L = typeof opts.light === 'string' ? LIGHTS[opts.light] : opts.light || LIGHTS.day;
  const cel = opts.cel !== false, sph = opts.sph ?? 0.85, headC = opts.headC || null;
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], m.pos[i + k]); bb[k + 3] = Math.max(bb[k + 3], m.pos[i + k]); }
  const shadow = opts.shadow !== false ? shadowMap(meshes.filter((m) => m.alphaMode !== 'BLEND' && !/Eye|FaceEyeline|FaceEyelash|FaceBrow|FaceMouth/.test(m.material || '')), L.dir, bb) : null;
  const zb = new Float32Array(W * H).fill(Infinity), col = new Float32Array(W * H * 3), id = new Int16Array(W * H).fill(-1), inkMask = new Uint8Array(W * H);
  const bg0 = opts.bg || L.bg0, bg1 = opts.bg || L.bg1;
  const gY = opts.groundY ?? 0, gc = [0.2, 0.21, 0.15], gR = Math.max(bb[3] - bb[0], bb[5] - bb[2], bb[4] - bb[1]) * 3, gcx = (bb[0] + bb[3]) / 2, gcz = (bb[2] + bb[5]) / 2;
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) col[i + k] = bg0[k] * (1 - t) + bg1[k] * t;
      if (!opts.ground) continue;
      const sx = (x + 0.5 - W / 2) / (cam.k * H / 2), sy = -(y + 0.5 - H / 2) / (cam.k * H / 2);
      const dx = cam.f[0] + cam.r[0] * sx + cam.u[0] * sy, dy = cam.f[1] + cam.r[1] * sx + cam.u[1] * sy, dz = cam.f[2] + cam.r[2] * sx + cam.u[2] * sy;
      if (dy >= -1e-6) continue;
      const tt = (gY - cam.eye[1]) / dy, px = cam.eye[0] + dx * tt, pz = cam.eye[2] + dz * tt;
      const rr = Math.hypot(px - gcx, pz - gcz); if (rr > gR) continue;
      const sh = shadow ? shadow.lookup(px, gY + 0.003, pz) : 1, fade = Math.min(1, (gR - rr) / (gR * 0.3));
      for (let k = 0; k < 3; k++) { const g = gc[k] * (L.amb[k] * 1.4 + L.key[k] * L.dir[1] * sh); col[i + k] = col[i + k] * (1 - fade) + g * fade; }
      zb[y * W + x] = tt * (dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2]);
    }
  }
  const proj = (x, y, z, o, k) => {
    const dx = x - cam.eye[0], dy = y - cam.eye[1], dz = z - cam.eye[2];
    const vx = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2], vy = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2], vz = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
    o[k] = W / 2 + (vx / vz) * cam.k * (H / 2); o[k + 1] = H / 2 - (vy / vz) * cam.k * (H / 2); o[k + 2] = vz;
  };
  const tmp = [0, 0, 0, 1];
  const drawMesh = (m, mi, blend) => {
    const nv = m.pos.length / 3, S = new Float32Array(nv * 3), P = m.pos, B = m.bind || m.pos;
    for (let v = 0; v < nv; v++) proj(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], S, v * 3);
    const idx = m.idx, base = m.base || [0.6, 0.6, 0.6];
    const kind = m.kind || KIND(m.material || m.name || '');
    const pr = m.garment && kind === 'cloth' ? PRESET.garment : PRESET[kind] || PRESET.cloth;
    const tint = shadeTint(kind, m.shade, m.garment);
    const round = cel && headC && !m.authoredFaceNormals && (kind === 'face' || kind === 'eye' || kind === 'line') ? sph : 0;
    const mask = m.alphaMode === 'MASK', cutoff = m.alphaCutoff ?? 0.5, opacity = m.opacity ?? 1;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const za = S[a * 3 + 2], zb2 = S[b * 3 + 2], zc = S[c * 3 + 2];
      if (za < 0.03 || zb2 < 0.03 || zc < 0.03) continue;
      const ax = S[a * 3], ay = S[a * 3 + 1], bx = S[b * 3], by = S[b * 3 + 1], cx = S[c * 3], cy = S[c * 3 + 1];
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-9) continue;
      // screen-space winding: y is flipped, so front faces (CCW in world) have area < 0
      const back = area > 0;
      if (back && !m.doubleSided && !opts.clayTwoSided) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      if (x0 > x1 || y0 > y1) continue;
      const ia = 1 / za, ib = 1 / zb2, ic = 1 / zc;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const q0 = w0 * ia, q1 = w1 * ib, q2 = w2 * ic, qs = q0 + q1 + q2;
        const z = 1 / qs, p0 = q0 / qs, p1 = q1 / qs, p2 = q2 / qs;
        const pi = y * W + x;
        if (z >= zb[pi] - (blend ? 2e-4 : 0)) continue;
        let r = base[0], g = base[1], bl = base[2], alpha = opacity;
        const clay = opts.clay && !blend;
        if (m.tex && m.uv) {
          const u = m.uv[a * 2] * p0 + m.uv[b * 2] * p1 + m.uv[c * 2] * p2, v = m.uv[a * 2 + 1] * p0 + m.uv[b * 2 + 1] * p1 + m.uv[c * 2 + 1] * p2;
          sampleTex(m.tex, u, v, tmp); r *= tmp[0]; g *= tmp[1]; bl *= tmp[2]; alpha *= tmp[3];
        }
        if (m.col) { const C = m.col; r *= C[a * 3] * p0 + C[b * 3] * p1 + C[c * 3] * p2; g *= C[a * 3 + 1] * p0 + C[b * 3 + 1] * p1 + C[c * 3 + 1] * p2; bl *= C[a * 3 + 2] * p0 + C[b * 3 + 2] * p1 + C[c * 3 + 2] * p2; }
        if (mask && alpha < cutoff) continue;
        if (blend && alpha < 0.004) continue;
        if (opts.clay && blend) continue;
        const wpx = P[a * 3] * p0 + P[b * 3] * p1 + P[c * 3] * p2, wpy = P[a * 3 + 1] * p0 + P[b * 3 + 1] * p1 + P[c * 3 + 1] * p2, wpz = P[a * 3 + 2] * p0 + P[b * 3 + 2] * p1 + P[c * 3 + 2] * p2;
        let nx, ny, nz;
        if (m.nrm) { const N = m.nrm; nx = N[a * 3] * p0 + N[b * 3] * p1 + N[c * 3] * p2; ny = N[a * 3 + 1] * p0 + N[b * 3 + 1] * p1 + N[c * 3 + 1] * p2; nz = N[a * 3 + 2] * p0 + N[b * 3 + 2] * p1 + N[c * 3 + 2] * p2; }
        else { const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2]; nx = uy * wz - uz * wy; ny = uz * wx - ux * wz; nz = ux * wy - uy * wx; }
        let nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (round > 0 && !clay) {
          // the game rounds in bind space before skinning; the sheets pose the head little, so bind positions stand in
          let cxh = B[a * 3] * p0 + B[b * 3] * p1 + B[c * 3] * p2 - headC[0], cyh = (B[a * 3 + 1] * p0 + B[b * 3 + 1] * p1 + B[c * 3 + 1] * p2 - headC[1]) * 0.85, czh = B[a * 3 + 2] * p0 + B[b * 3 + 2] * p1 + B[c * 3 + 2] * p2 - headC[2] + 0.035;
          const cl = Math.hypot(cxh, cyh, czh);
          if (cl > 1e-4) { nx = nx * (1 - round) + (cxh / cl) * round; ny = ny * (1 - round) + (cyh / cl) * round; nz = nz * (1 - round) + (czh / cl) * round; nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; }
        }
        if (back) { nx = -nx; ny = -ny; nz = -nz; }
        let out0, out1, out2;
        if (clay) { r = 0.52; g = 0.5; bl = 0.48; }
        if (m.emit) { out0 = r; out1 = g; out2 = bl; }
        else {
          const ndl = nx * L.dir[0] + ny * L.dir[1] + nz * L.dir[2];
          // shadow lookup with a slope-scaled normal offset: at grazing angles a fixed 6 mm offset left the 1280-texel map
          // stair-stepping down the side of the neck (first-pass sheets); surfaces turned from the light stay self-shadowed
          const so = 0.006 + 0.016 * (1 - Math.max(0, Math.min(1, ndl * 2.5)));
          const sh = shadow && !blend && kind !== 'eye' && kind !== 'line' ? shadow.lookup(wpx + nx * so, wpy + ny * so, wpz + nz * so) : 1;
          if (cel && !clay) {
            const h = ndl * 0.5 + 0.5;
            let rr = smooth(pr.p[0] - pr.p[1], pr.p[0] + pr.p[1], h);
            rr *= 1 - (kind === 'face' ? 0.55 : kind === 'eye' || kind === 'line' ? 0.3 : 1) * (1 - smooth(0.2, 0.8, sh));
            const lum = r * 0.299 + g * 0.587 + bl * 0.114;
            const s0 = Math.max(0, lum + (r - lum) * 1.3) * tint[0], s1 = Math.max(0, lum + (g - lum) * 1.3) * tint[1], s2 = Math.max(0, lum + (bl - lum) * 1.3) * tint[2];
            const band = rr * (1 - rr) * 4 * pr.sss;
            out0 = (s0 + (r - s0) * rr + r * band) * L.key[0] + r * L.amb[0] + r * pr.self;
            out1 = (s1 + (g - s1) * rr + g * 0.36 * band) * L.key[1] + g * L.amb[1] + g * pr.self;
            out2 = (s2 + (bl - s2) * rr + bl * 0.22 * band) * L.key[2] + bl * L.amb[2] + bl * pr.self;
          } else {
            // clay: a soft studio light by default (form reading); opts.hardClay = the kit's two-tone band
            const band = (opts.hardClay ? smooth(-0.03, 0.09, ndl) : Math.pow(Math.max(0, ndl * 0.5 + 0.5), 1.6) * 0.9) * (0.45 + 0.55 * sh), lit = band * (0.82 + 0.18 * Math.max(0, ndl)), hemi = ny * 0.5 + 0.5;
            out0 = r * (0.2 * hemi + 0.06 + 1.5 * lit); out1 = g * (0.25 * hemi + 0.05 + 1.35 * lit); out2 = bl * (0.36 * hemi + 0.04 + 1.1 * lit);
          }
        }
        if (blend) { col[pi * 3] += (out0 - col[pi * 3]) * alpha; col[pi * 3 + 1] += (out1 - col[pi * 3 + 1]) * alpha; col[pi * 3 + 2] += (out2 - col[pi * 3 + 2]) * alpha; continue; }
        zb[pi] = z; id[pi] = m.inkId ?? mi; inkMask[pi] = m.ink === false ? 0 : 1;
        col[pi * 3] = out0; col[pi * 3 + 1] = out1; col[pi * 3 + 2] = out2;
      }
    }
  };
  meshes.forEach((m, mi) => { if (m.alphaMode !== 'BLEND') drawMesh(m, mi, false); });
  // ink on silhouettes (id / depth jumps), before the decals
  if (opts.ink !== false) {
    const ink = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (id[i] < 0 || !inkMask[i]) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx, zi = zb[i], zj = zb[j];
        if ((id[j] !== id[i] && zi < zj && (id[j] < 0 || zj - zi > 0.004)) || zj - zi > 0.02 * zi + 0.006) { ink[i] = 1; break; }
      }
    }
    const inkW = opts.inkWidth ?? Math.max(1, ss - 1);
    for (let pass = 1; pass < inkW; pass++) { const grow = ink.slice(); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (ink[i] || !inkMask[i]) continue; if (ink[i - 1] || ink[i + 1] || ink[i - W] || ink[i + W]) grow[i] = 1; } ink.set(grow); }
    for (let i = 0; i < W * H; i++) if (ink[i]) { col[i * 3] *= 0.3; col[i * 3 + 1] *= 0.24; col[i * 3 + 2] *= 0.28; }
  }
  meshes.forEach((m, mi) => { if (m.alphaMode === 'BLEND') drawMesh(m, mi, true); });
  const out = R.image(W, H); out.d.set(col);
  for (let i = 0; i < out.d.length; i++) { const v = out.d[i]; out.d[i] = v < 0.7 ? v : 0.7 + (1 - Math.exp(-(v - 0.7) * 2)) * 0.3; }
  return down(out, ss);
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function down(img, s) {
  if (s === 1) return img;
  const w = img.w / s, h = img.h / s, o = R.image(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) { let a = 0; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) a += img.d[((y * s + j) * img.w + x * s + i) * 3 + k]; o.d[(y * w + x) * 3 + k] = a / (s * s); }
  return o;
}
function shadowMap(meshes, dir, bb) {
  const N = 1280, c3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const r = n3(c3(dir, Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0])), u = c3(r, dir);
  const c = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2], Rr = Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 0.52 + 0.02;
  const z = new Float32Array(N * N).fill(Infinity);
  const P = (x, y, zz, o, k) => { const dx = x - c[0], dy = y - c[1], dz = zz - c[2]; o[k] = ((dx * r[0] + dy * r[1] + dz * r[2]) / Rr * 0.5 + 0.5) * N; o[k + 1] = ((dx * u[0] + dy * u[1] + dz * u[2]) / Rr * 0.5 + 0.5) * N; o[k + 2] = -(dx * dir[0] + dy * dir[1] + dz * dir[2]); };
  for (const m of meshes) {
    const nv = m.pos.length / 3, S = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) P(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2], S, v * 3);
    for (let t = 0; t < m.idx.length; t += 3) {
      const a = m.idx[t] * 3, b = m.idx[t + 1] * 3, cc = m.idx[t + 2] * 3;
      const area = (S[b] - S[a]) * (S[cc + 1] - S[a + 1]) - (S[b + 1] - S[a + 1]) * (S[cc] - S[a]);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(S[a], S[b], S[cc]))), x1 = Math.min(N - 1, Math.ceil(Math.max(S[a], S[b], S[cc])));
      const y0 = Math.max(0, Math.floor(Math.min(S[a + 1], S[b + 1], S[cc + 1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(S[a + 1], S[b + 1], S[cc + 1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((S[b] - px) * (S[cc + 1] - py) - (S[b + 1] - py) * (S[cc] - px)) / area, w1 = ((S[cc] - px) * (S[a + 1] - py) - (S[cc + 1] - py) * (S[a] - px)) / area, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const d = S[a + 2] * w0 + S[b + 2] * w1 + S[cc + 2] * w2, i = y * N + x;
        if (d < z[i]) z[i] = d;
      }
    }
  }
  const texel = (2 * Rr) / N, o = [0, 0, 0];
  return {
    lookup(x, y, zz) {
      P(x, y, zz, o, 0); let lit = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const xi = Math.floor(o[0]) + i, yi = Math.floor(o[1]) + j;
        if (xi < 0 || yi < 0 || xi >= N || yi >= N) { lit++; continue; }
        if (o[2] <= z[yi * N + xi] + texel * 2.5) lit++;
      }
      return lit / 9;
    },
  };
}
export { R };
