// CPU preview renderer: z-buffered, perspective-correct rasteriser with 2x2 supersampling, a shadow map, the game's light
// in spirit (warm key, cool sky shade, two-step cel band with a soft terminator, rim, baked AO in the colours, object-space
// normal maps) and an ink line on silhouettes and creases. Writes PNG with node:zlib. Also: sheet layout and a 5x7 font.
import fs from 'node:fs';
import zlib from 'node:zlib';

// ------------------------------------------------------------------------------------------------------------- colour
export const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// ---------------------------------------------------------------------------------------------------------------- PNG
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** encode 8-bit RGB (ch = 3) or RGBA (ch = 4) pixels as PNG */
export function encodePNG(w, h, px, ch = 3) {
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * ch + 1)] = 0; Buffer.from(px.buffer, px.byteOffset + y * w * ch, w * ch).copy(raw, y * (w * ch + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
/** decode a non-interlaced 8-bit PNG (gray, RGB, RGBA, palette) -> { w, h, rgba: Uint8Array } */
export function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 8, plte = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced PNG'); }
    else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('PNG bit depth ' + bd);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch] : 0, b = y ? out[dst - stride + x] : 0, c = x >= ch && y ? out[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (ct === 2 || ct === 6) { rgba[i * 4] = out[i * ch]; rgba[i * 4 + 1] = out[i * ch + 1]; rgba[i * 4 + 2] = out[i * ch + 2]; rgba[i * 4 + 3] = ct === 6 ? out[i * ch + 3] : 255; }
    else if (ct === 3) { const k = out[i]; rgba[i * 4] = plte[k * 3]; rgba[i * 4 + 1] = plte[k * 3 + 1]; rgba[i * 4 + 2] = plte[k * 3 + 2]; rgba[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255; }
    else { const g = out[i * ch]; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g; rgba[i * 4 + 3] = ct === 4 ? out[i * ch + 1] : 255; }
  }
  return { w, h, rgba };
}
/** texture object for the renderer from RGBA bytes: srgb -> linear floats (colour) or raw 0..1 (data, e.g. normals) */
export function texture(w, h, rgba, srgb = true) {
  const d = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) d[i * 3 + k] = srgb ? toLin(rgba[i * 4 + k] / 255) : rgba[i * 4 + k] / 255;
  return { w, h, d };
}
function sampleTex(t, u, v, out) {
  // bilinear, repeat (glTF default sampler); v as in glTF (0 = top row)
  let x = u * t.w - 0.5, y = v * t.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const W = t.w, H = t.h, d = t.d;
  const ix = (a) => ((a % W) + W) % W, iy = (b) => ((b % H) + H) % H;
  const a = (iy(y0) * W + ix(x0)) * 3, b = (iy(y0) * W + ix(x0 + 1)) * 3, c = (iy(y0 + 1) * W + ix(x0)) * 3, e = (iy(y0 + 1) * W + ix(x0 + 1)) * 3;
  for (let k = 0; k < 3; k++) out[k] = (d[a + k] * (1 - fx) + d[b + k] * fx) * (1 - fy) + (d[c + k] * (1 - fx) + d[e + k] * fx) * fy;
  return out;
}

// --------------------------------------------------------------------------------------------------------------- image
export function image(w, h, fill = [0, 0, 0]) { const d = new Float32Array(w * h * 3); for (let i = 0; i < w * h; i++) { d[i * 3] = fill[0]; d[i * 3 + 1] = fill[1]; d[i * 3 + 2] = fill[2]; } return { w, h, d }; }
/** linear float image -> sRGB bytes */
export function toBytes(img) { const o = new Uint8Array(img.w * img.h * 3); for (let i = 0; i < o.length; i++) o[i] = Math.max(0, Math.min(255, Math.round(toSrgb(Math.max(0, img.d[i])) * 255))); return o; }
export function savePNG(file, img) { fs.writeFileSync(file, encodePNG(img.w, img.h, toBytes(img), 3)); }
export function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.h; y++) { const yy = oy + y; if (yy < 0 || yy >= dst.h) continue; for (let x = 0; x < src.w; x++) { const xx = ox + x; if (xx < 0 || xx >= dst.w) continue; for (let k = 0; k < 3; k++) dst.d[(yy * dst.w + xx) * 3 + k] = src.d[(y * src.w + x) * 3 + k]; } }
}

// ---------------------------------------------------------------------------------------------------------------- font
const GLYPH = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31], 0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  '-': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0], '/': [1, 1, 2, 4, 8, 16, 16],
  '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '=': [0, 0, 31, 0, 31, 0, 0], '%': [24, 25, 2, 4, 8, 19, 3],
  ',': [0, 0, 0, 0, 12, 4, 8], '+': [0, 4, 4, 31, 4, 4, 0], '_': [0, 0, 0, 0, 0, 0, 31], "'": [4, 4, 8, 0, 0, 0, 0],
};
/** draw text (upper-cased) into a linear image; scale = pixel size of one font dot */
export function text(img, str, x, y, scale = 2, col = [1, 1, 1], shadow = true) {
  const draw = (ox, oy, c) => {
    let cx = ox;
    for (const ch of String(str).toUpperCase()) {
      const g = GLYPH[ch];
      if (g) for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (g[r] & (16 >> b)) {
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          const px = cx + b * scale + sx, py = oy + r * scale + sy;
          if (px >= 0 && py >= 0 && px < img.w && py < img.h) { const i = (py * img.w + px) * 3; img.d[i] = c[0]; img.d[i + 1] = c[1]; img.d[i + 2] = c[2]; }
        }
      }
      cx += 6 * scale;
    }
  };
  if (shadow) draw(x + Math.max(1, scale >> 1), y + Math.max(1, scale >> 1), [0, 0, 0]);
  draw(x, y, col);
}

// ------------------------------------------------------------------------------------------------------------- camera
/** camera looking from eye to target; fov in degrees (vertical) */
export function camera(eye, target, fov, w, h) {
  const f = nrm3(sub(target, eye)), r = nrm3(cross3(f, [0, 1, 0])), u = cross3(r, f);
  return { eye, f, r, u, fov, w, h, k: 1 / Math.tan((fov * Math.PI) / 360) };
}
/** orbit camera: azimuth (deg, 0 = from +Z, the object's front), elevation (deg), distance, around target */
export function orbit(target, az, el, dist, fov, w, h) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  const eye = [target[0] + Math.sin(a) * Math.cos(e) * dist, target[1] + Math.sin(e) * dist, target[2] + Math.cos(a) * Math.cos(e) * dist];
  return camera(eye, target, fov, w, h);
}
/** distance at which a bounding box fills `frac` of the frame height */
export function fitDistance(b, fov, frac = 0.8, aspect = 1) {
  const sz = Math.max(b[4] - b[1], (Math.max(b[3] - b[0], b[5] - b[2])) / Math.min(aspect, 1));
  return (sz / frac / 2) / Math.tan((fov * Math.PI) / 360) + Math.max(b[3] - b[0], b[5] - b[2]) / 2;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ---------------------------------------------------------------------------------------------------------- the light
export const LIGHT = {
  dir: nrm3([0.55, 0.75, 0.42]),            // towards the sun: front-right, high
  key: [1.0, 0.9, 0.74].map((v) => v * 1.75), // warm key (linear)
  sky: [0.36, 0.45, 0.66].map((v) => v * 0.55), // cool shade from the sky
  bounce: [0.42, 0.36, 0.28].map((v) => v * 0.38),
  rim: 0.35,
  bg0: [0.62, 0.74, 0.88], bg1: [0.93, 0.9, 0.84],
};

// ------------------------------------------------------------------------------------------------------------ raster
/**
 * Mesh for the renderer: { pos, nrm, idx, uv?, col? (linear per vertex), base? [r,g,b] linear, tex?, nmap? (object space),
 *   ink = true, ground = false, wire = false }
 * render(meshes, cam, opts): opts { ss = 2, clay = false, shadow = true, ground = true(y=0 disc), groundY, wire, bg }
 */
export function render(meshes, cam, opts = {}) {
  const ss = opts.ss ?? 2, W = cam.w * ss, H = cam.h * ss;
  const L = opts.light || LIGHT;
  // scene bounds (for the shadow map and the ground)
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], m.pos[i + k]); bb[k + 3] = Math.max(bb[k + 3], m.pos[i + k]); }
  const all = meshes.slice();
  const shadow = opts.shadow !== false ? shadowMap(all, L.dir, bb) : null;
  const zb = new Float32Array(W * H).fill(Infinity), col = new Float32Array(W * H * 3), gn = new Float32Array(W * H * 3), id = new Int16Array(W * H).fill(-1);
  const inkMask = new Uint8Array(W * H); // 1 = this surface takes ink
  // background
  const gY = opts.groundY ?? 0, gc = opts.groundColor || [0.2, 0.21, 0.15], gR = Math.max(bb[3] - bb[0], bb[5] - bb[2], bb[4] - bb[1]) * 3;
  const gcx = (bb[0] + bb[3]) / 2, gcz = (bb[2] + bb[5]) / 2;
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) col[i + k] = L.bg0[k] * (1 - t) + L.bg1[k] * t;
      if (opts.ground === false) continue;
      // ray through the pixel against the ground plane (analytic: no clipping trouble near the camera)
      const sx = (x + 0.5 - W / 2) / (cam.k * H / 2), sy = -(y + 0.5 - H / 2) / (cam.k * H / 2);
      const dx = cam.f[0] + cam.r[0] * sx + cam.u[0] * sy, dy = cam.f[1] + cam.r[1] * sx + cam.u[1] * sy, dz = cam.f[2] + cam.r[2] * sx + cam.u[2] * sy;
      if (dy >= -1e-6) continue;
      const tt = (gY - cam.eye[1]) / dy, px = cam.eye[0] + dx * tt, pz = cam.eye[2] + dz * tt;
      const rr = Math.hypot(px - gcx, pz - gcz); if (rr > gR) continue;
      const sh = shadow ? shadow.lookup(px, gY + 0.003, pz) : 1;
      const fade = Math.min(1, (gR - rr) / (gR * 0.3));
      for (let k = 0; k < 3; k++) { const g = gc[k] * (L.sky[k] + L.key[k] * L.dir[1] * sh); col[i + k] = col[i + k] * (1 - fade) + g * fade; }
      zb[y * W + x] = tt; // view depth along f ~ tt * (d . f)
      zb[y * W + x] = tt * (dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2]);
    }
  }
  const proj = (p) => {
    const dx = p[0] - cam.eye[0], dy = p[1] - cam.eye[1], dz = p[2] - cam.eye[2];
    const vx = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2], vy = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2], vz = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
    return [W / 2 + (vx / vz) * cam.k * (H / 2), H / 2 - (vy / vz) * cam.k * (H / 2), vz];
  };
  const tmp = [0, 0, 0], tn = [0, 0, 0];
  all.forEach((m, mi) => {
    const nv = m.pos.length / 3, S = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) { const s = proj([m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]]); S[v * 3] = s[0]; S[v * 3 + 1] = s[1]; S[v * 3 + 2] = s[2]; }
    const idx = m.idx, base = m.base || [0.6, 0.6, 0.6];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const za = S[a * 3 + 2], zb2 = S[b * 3 + 2], zc = S[c * 3 + 2];
      if (za < 0.05 || zb2 < 0.05 || zc < 0.05) continue;
      const ax = S[a * 3], ay = S[a * 3 + 1], bx = S[b * 3], by = S[b * 3 + 1], cx = S[c * 3], cy = S[c * 3 + 1];
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      if (x0 > x1 || y0 > y1) continue;
      // geometric face normal (world)
      const P = m.pos;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
      let fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      const ia = 1 / za, ib = 1 / zb2, ic = 1 / zc;
      // wire: pixel distance to edges
      const eA = Math.hypot(cx - bx, cy - by), eB = Math.hypot(ax - cx, ay - cy), eC = Math.hypot(bx - ax, by - ay);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        let w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        // perspective-correct weights
        const q0 = w0 * ia, q1 = w1 * ib, q2 = w2 * ic, qs = q0 + q1 + q2;
        const z = 1 / qs, p0 = q0 / qs, p1 = q1 / qs, p2 = q2 / qs;
        const pi = y * W + x;
        if (z >= zb[pi]) continue;
        zb[pi] = z; id[pi] = mi; inkMask[pi] = m.ink === false ? 0 : 1;
        // world position
        const wpx = P[a * 3] * p0 + P[b * 3] * p1 + P[c * 3] * p2, wpy = P[a * 3 + 1] * p0 + P[b * 3 + 1] * p1 + P[c * 3 + 1] * p2, wpz = P[a * 3 + 2] * p0 + P[b * 3 + 2] * p1 + P[c * 3 + 2] * p2;
        // view direction (to the eye)
        let vx = cam.eye[0] - wpx, vy = cam.eye[1] - wpy, vz = cam.eye[2] - wpz; const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
        const back = fx * vx + fy * vy + fz * vz < 0;
        // shading normal
        let nx, ny, nz;
        let u = 0, v = 0;
        if (m.uv) { u = m.uv[a * 2] * p0 + m.uv[b * 2] * p1 + m.uv[c * 2] * p2; v = m.uv[a * 2 + 1] * p0 + m.uv[b * 2 + 1] * p1 + m.uv[c * 2 + 1] * p2; }
        if (m.nmap && m.uv) { sampleTex(m.nmap, u, v, tn); nx = tn[0] * 2 - 1; ny = tn[1] * 2 - 1; nz = tn[2] * 2 - 1; }
        else if (m.nrm) { const N = m.nrm; nx = N[a * 3] * p0 + N[b * 3] * p1 + N[c * 3] * p2; ny = N[a * 3 + 1] * p0 + N[b * 3 + 1] * p1 + N[c * 3 + 1] * p2; nz = N[a * 3 + 2] * p0 + N[b * 3 + 2] * p1 + N[c * 3 + 2] * p2; }
        else { nx = fx; ny = fy; nz = fz; }
        let nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        if (back) { nx = -nx; ny = -ny; nz = -nz; }
        gn[pi * 3] = back ? -fx : fx; gn[pi * 3 + 1] = back ? -fy : fy; gn[pi * 3 + 2] = back ? -fz : fz;
        // albedo
        let r = base[0], g = base[1], bl = base[2];
        if (!opts.clay || m.ground) {
          if (m.tex && m.uv) { sampleTex(m.tex, u, v, tmp); r *= tmp[0]; g *= tmp[1]; bl *= tmp[2]; }
          if (m.col) { const C = m.col; r *= C[a * 3] * p0 + C[b * 3] * p1 + C[c * 3] * p2; g *= C[a * 3 + 1] * p0 + C[b * 3 + 1] * p1 + C[c * 3 + 1] * p2; bl *= C[a * 3 + 2] * p0 + C[b * 3 + 2] * p1 + C[c * 3 + 2] * p2; }
          if (m.emit) { col[pi * 3] = r; col[pi * 3 + 1] = g; col[pi * 3 + 2] = bl; continue; }
        } else { r = 0.5; g = 0.48; bl = 0.46; }
        // light
        const ndl = nx * L.dir[0] + ny * L.dir[1] + nz * L.dir[2];
        let sh = 1;
        if (shadow) sh = shadow.lookup(wpx + fx * 0.004, wpy + fy * 0.004, wpz + fz * 0.004);
        const band = smooth(-0.03, 0.09, ndl) * sh;
        const lit = band * (0.82 + 0.18 * Math.max(0, ndl));
        const hemi = ny * 0.5 + 0.5;
        const rimK = Math.pow(1 - Math.max(0, nx * vx + ny * vy + nz * vz), 4) * L.rim * (0.35 + 0.65 * Math.max(0, ndl + 0.3));
        const out = [r, g, bl].map((al, k) => al * (L.sky[k] * hemi + L.bounce[k] * (1 - hemi) + L.key[k] * lit) + L.key[k] * rimK * 0.25);
        col[pi * 3] = out[0]; col[pi * 3 + 1] = out[1]; col[pi * 3 + 2] = out[2];
        if (opts.wire || m.wire) {
          const dpx = Math.min(w0 * Math.abs(area) / eA, w1 * Math.abs(area) / eB, w2 * Math.abs(area) / eC);
          if (dpx < ss * 0.6) { col[pi * 3] *= 0.25; col[pi * 3 + 1] *= 0.3; col[pi * 3 + 2] *= 0.4; }
        }
      }
    }
  });
  // ink: silhouettes (id / depth jumps) and creases (geometric normal turns), drawn on the nearer surface
  const inkW = opts.inkWidth ?? ss;
  const ink = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (id[i] < 0) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const zi = zb[i], zj = zb[j];
      let edge = false;
      if (id[j] !== id[i]) edge = zi < zj;
      else if (zj - zi > 0.025 * zi + 0.004) edge = true;
      else if (zi <= zj && gn[i * 3] * gn[j * 3] + gn[i * 3 + 1] * gn[j * 3 + 1] + gn[i * 3 + 2] * gn[j * 3 + 2] < (opts.crease ?? 0.3)) edge = true;
      if (edge && inkMask[i]) { ink[i] = 1; break; }
    }
  }
  const out = image(W, H);
  out.d.set(col);
  for (let pass = 1; pass < inkW; pass++) { const grow = ink.slice(); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (ink[i] || !inkMask[i]) continue; if (ink[i - 1] || ink[i + 1] || ink[i - W] || ink[i + W]) grow[i] = 1; } ink.set(grow); }
  for (let i = 0; i < W * H; i++) if (ink[i]) { out.d[i * 3] *= 0.22; out.d[i * 3 + 1] *= 0.2; out.d[i * 3 + 2] *= 0.24; }
  // tone: soft shoulder
  for (let i = 0; i < out.d.length; i++) { const v = out.d[i]; out.d[i] = v < 0.6 ? v : 0.6 + (1 - Math.exp(-(v - 0.6) * 1.6)) * 0.4 / 1.0; }
  return downsample(out, ss, { depth: zb, id });
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function downsample(img, s, extra) {
  if (s === 1) return Object.assign(img, extra);
  const w = img.w / s, h = img.h / s, o = image(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) {
    let a = 0; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) a += img.d[((y * s + j) * img.w + x * s + i) * 3 + k];
    o.d[(y * w + x) * 3 + k] = a / (s * s);
  }
  return o;
}
function groundDisc(bb, y, color) {
  const cx = (bb[0] + bb[3]) / 2, cz = (bb[2] + bb[5]) / 2, R = Math.max(bb[3] - bb[0], bb[5] - bb[2], bb[4] - bb[1]) * 2.5;
  const n = 48, pos = [cx, y, cz], idx = [], col = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pos.push(cx + Math.sin(a) * R, y, cz + Math.cos(a) * R); }
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  const c = color || [0.21, 0.22, 0.16];
  return { pos: Float32Array.from(pos), nrm: Float32Array.from(pos.map((_, i) => (i % 3 === 1 ? 1 : 0))), idx: Uint32Array.from(idx), base: c, ink: false, ground: true };
}
function shadowMap(meshes, dir, bb) {
  const N = 1536, r = nrm3(cross3(dir, Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0])), u = cross3(r, dir);
  const c = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2], R = Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) * 0.6 + 0.05;
  const z = new Float32Array(N * N).fill(Infinity);
  const P = (x, y, zz) => { const dx = x - c[0], dy = y - c[1], dz = zz - c[2]; return [((dx * r[0] + dy * r[1] + dz * r[2]) / R * 0.5 + 0.5) * N, ((dx * u[0] + dy * u[1] + dz * u[2]) / R * 0.5 + 0.5) * N, -(dx * dir[0] + dy * dir[1] + dz * dir[2])]; };
  for (const m of meshes) {
    if (m.ground) continue;
    const nv = m.pos.length / 3, S = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) { const p = P(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]); S.set(p, v * 3); }
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
  const texel = (2 * R) / N;
  return {
    lookup(x, y, zz) {
      const p = P(x, y, zz); let lit = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const xi = Math.floor(p[0]) + i, yi = Math.floor(p[1]) + j;
        if (xi < 0 || yi < 0 || xi >= N || yi >= N) { lit++; continue; }
        if (p[2] <= z[yi * N + xi] + texel * 1.5) lit++;
      }
      return lit / 9;
    },
  };
}

// ------------------------------------------------------------------------------------------------------------- sheets
/** lay out labelled tiles in a grid: tiles = [{ img, label }], cols; returns a linear image */
export function sheet(tiles, cols, { title = '', pad = 8, bg = [0.08, 0.08, 0.09], scale = 2 } = {}) {
  const tw = Math.max(...tiles.map((t) => t.img.w));
  const rows = Math.ceil(tiles.length / cols), top = title ? 12 * scale + pad : 0;
  const rh = [], ry = [];
  for (let r = 0, y = top + pad; r < rows; r++) { rh[r] = Math.max(...tiles.slice(r * cols, r * cols + cols).map((t) => t.img.h)); ry[r] = y; y += rh[r] + pad; }
  const out = image(cols * tw + (cols + 1) * pad, ry[rows - 1] + rh[rows - 1] + pad, bg);
  if (title) text(out, title, pad, pad, scale, [1, 0.95, 0.8]);
  tiles.forEach((t, i) => {
    const x = pad + (i % cols) * (tw + pad), y = ry[Math.floor(i / cols)];
    blit(out, t.img, x, y);
    if (t.label) text(out, t.label, x + 6, y + 6, scale, [1, 1, 1]);
  });
  return out;
}
