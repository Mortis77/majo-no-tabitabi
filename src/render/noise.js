// Tileable 256x256 RGBA noise texture generated on the CPU (once). Each channel is a smooth gradient noise with a
// different period (R: 4 cells, G: 8, B: 16, A: 32 per tile), so one fetch gives four octaves:
//   fbm = dot(texture(n, uv), vec4(0.5, 0.25, 0.125, 0.0625)) / 0.9375
// Used by the sky (clouds, Moon surface, milky band, veil curtains, corona streamers).
import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

let _tex = null;
export function noiseTexture() {
  if (_tex) return _tex;
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const periods = [4, 8, 16, 32];
  periods.forEach((P, ch) => {
    const rng = mulberry32(9127 + ch * 131);
    const gx = new Float32Array(P * P), gy = new Float32Array(P * P);
    for (let i = 0; i < P * P; i++) { const a = rng() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * P, fy = (y / S) * P;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const dot = (ix, iy, dx, dy) => { const k = (iy % P) * P + (ix % P); return gx[k] * dx + gy[k] * dy; };
        const n00 = dot(x0, y0, tx, ty), n10 = dot(x0 + 1, y0, tx - 1, ty);
        const n01 = dot(x0, y0 + 1, tx, ty - 1), n11 = dot(x0 + 1, y0 + 1, tx - 1, ty - 1);
        const u = fade(tx), v = fade(ty);
        const n = (n00 + (n10 - n00) * u) + ((n01 + (n11 - n01) * u) - (n00 + (n10 - n00) * u)) * v;
        data[(y * S + x) * 4 + ch] = Math.max(0, Math.min(255, Math.round((n * 0.75 + 0.5) * 255)));
      }
    }
  });
  _tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  _tex.wrapS = _tex.wrapT = THREE.RepeatWrapping;
  _tex.minFilter = THREE.LinearMipmapLinearFilter;
  _tex.magFilter = THREE.LinearFilter;
  _tex.generateMipmaps = true;
  _tex.colorSpace = THREE.NoColorSpace;
  _tex.needsUpdate = true;
  return _tex;
}
