// Water helper textures, generated once on the CPU.
//  waveTexture(): tileable 256² RGBA8 — RG = stylised wave normal (xz, 0.5 = flat), B = crest mask (painted foam /
//                 glints ride on it), A = caustic web (periodic Worley F2-F1 edges). Mipmapped, so it stays calm far away.
//  flowTexture(): 256² RGBA8 over the data-texture square [-1024,1024]² (8 m texels) — RG = flow velocity
//                 (0.5 + v / 6, m/s), B = river weight, A = speed / 3. Built from the river polylines in data/world.js.
import * as THREE from 'three';
import { trialLakeContains } from '../trial-lake.js';
import { RIVERS, POI } from '../../data/world.js';
import { heightAt, SEA_LEVEL } from '../ground.js';
import { DATA_HALF } from '../terrain/textures.js';
import { mulberry32 } from '../../core/util.js';

const S = 256;

function periodicNoise(P, seed) {
  const rng = mulberry32(seed);
  const gx = new Float32Array(P * P), gy = new Float32Array(P * P);
  for (let i = 0; i < P * P; i++) { const a = rng() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (u, v) => { // u, v in [0,1) -> about [-0.7, 0.7]
    const fx = u * P, fy = v * P, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const d = (ix, iy, dx, dy) => { const k = (((iy % P) + P) % P) * P + (((ix % P) + P) % P); return gx[k] * dx + gy[k] * dy; };
    const a = d(x0, y0, tx, ty), b = d(x0 + 1, y0, tx - 1, ty), c = d(x0, y0 + 1, tx, ty - 1), e = d(x0 + 1, y0 + 1, tx - 1, ty - 1);
    const uu = fade(tx), vv = fade(ty);
    return a + (b - a) * uu + ((c + (e - c) * uu) - (a + (b - a) * uu)) * vv;
  };
}

let _wave = null;
export function waveTexture() {
  if (_wave) return _wave;
  const nA = periodicNoise(4, 701), nB = periodicNoise(8, 733), nC = periodicNoise(16, 769);
  // integer wave vectors keep the tile periodic; amplitude, sharpness (peaky crests, broad troughs)
  const W = [[3, 1, 0.30, 2.2], [-2, 3, 0.24, 2.0], [1, -4, 0.17, 2.4], [5, 2, 0.12, 1.8], [-4, -5, 0.08, 2.0],
    [7, -3, 0.06, 1.6], [-9, 5, 0.045, 1.6], [11, 8, 0.03, 1.4], [-13, -6, 0.022, 1.3]];
  const H = new Float32Array(S * S);
  let mn = Infinity, mx = -Infinity;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S;
    // gentle domain warp: hand-drawn wobble instead of ruler-straight crests
    const wu = u + nA(u, v) * 0.035 + nB(u, v) * 0.012, wv = v + nA(v + 0.37, u + 0.11) * 0.035 + nB(v, u) * 0.012;
    let h = 0;
    for (let k = 0; k < W.length; k++) {
      const [kx, ky, a, p] = W[k];
      const s = 0.5 + 0.5 * Math.sin(2 * Math.PI * (kx * wu + ky * wv) + k * 1.7);
      h += a * Math.pow(s, p);
    }
    h += nC(u, v) * 0.05;
    H[j * S + i] = h; if (h < mn) mn = h; if (h > mx) mx = h;
  }
  // caustics: periodic jittered Worley, 7 cells per tile
  const P = 7, rng = mulberry32(911), pts = [];
  for (let i = 0; i < P * P; i++) pts.push([rng() * 0.8 + 0.1, rng() * 0.8 + 0.1]);
  const data = new Uint8Array(S * S * 4);
  const at = (i, j) => H[(((j % S) + S) % S) * S + (((i % S) + S) % S)];
  const k = 34 / (mx - mn);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const o = (j * S + i) * 4;
    const dx = (at(i + 1, j) - at(i - 1, j)) * k, dz = (at(i, j + 1) - at(i, j - 1)) * k;
    data[o] = Math.round(Math.max(0, Math.min(1, 0.5 - dx * 0.5)) * 255);
    data[o + 1] = Math.round(Math.max(0, Math.min(1, 0.5 - dz * 0.5)) * 255);
    const hn = (H[j * S + i] - mn) / (mx - mn);
    data[o + 2] = Math.round(Math.max(0, Math.min(1, (hn - 0.55) / 0.35)) * 255);
    const fx = (i / S) * P, fy = (j / S) * P, cx = Math.floor(fx), cy = Math.floor(fy);
    let f1 = 9, f2 = 9;
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
      const gx = cx + xx, gy = cy + yy, p = pts[(((gy % P) + P) % P) * P + (((gx % P) + P) % P)];
      const d = Math.hypot(gx + p[0] - fx, gy + p[1] - fy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    const e = Math.max(0, 1 - (f2 - f1) / 0.22);
    data[o + 3] = Math.round(Math.pow(e, 2.4) * 255);
  }
  _wave = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  _wave.wrapS = _wave.wrapT = THREE.RepeatWrapping;
  _wave.minFilter = THREE.LinearMipmapLinearFilter; _wave.magFilter = THREE.LinearFilter;
  _wave.generateMipmaps = true; _wave.anisotropy = 8;
  _wave.colorSpace = THREE.NoColorSpace; _wave.needsUpdate = true;
  _wave.name = 'mvWaterWave';
  return _wave;
}

let _flow = null;
// Both painted detail maps use the same linear RGBA8 format, periodic 256²
// domain and mip chain. Array layers filter independently and share a sampler.
export function waterDetailTexture(noise) {
  const wave = waveTexture(), { width, height, data } = wave.image;
  const layers = new Uint8Array(data.length*2);
  layers.set(data);
  layers.set(noise.image.data,data.length);
  const tex = new THREE.DataArrayTexture(layers,width,height,2);
  tex.name = 'water:painted waves and noise';
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.max(wave.anisotropy,noise.anisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function flowTexture() {
  if (_flow) return _flow;
  const N = DATA_HALF / 4, cell = (DATA_HALF * 2) / N, data = new Uint8Array(N * N * 4);
  const segs = [];
  for (const r of RIVERS) for (let i = 0; i + 1 < r.pts.length; i++) segs.push([r.pts[i], r.pts[i + 1]]);
  const lake = POI.lake;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = (j * N + i) * 4, x = -DATA_HALF + (i + 0.5) * cell, z = -DATA_HALF + (j + 0.5) * cell;
    data[o] = 128; data[o + 1] = 128; data[o + 2] = 0; data[o + 3] = 0;
    let best = Infinity, bx = 0, bz = 0, nx = 0, nz = 0;
    for (const [a, b] of segs) {
      const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2));
      const px = a[0] + ex * t, pz = a[1] + ez * t, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; const L = Math.sqrt(L2); bx = ex / L; bz = ez / L; nx = px; nz = pz; }
    }
    if (best > 36) continue;
    const depth = Math.max(0.2, SEA_LEVEL - heightAt(nx, nz));
    let w = 1 - Math.min(1, Math.max(0, (best - 12) / 22));
    const dl = Math.hypot(x - lake.x, z - lake.z);
    w *= Math.min(1, Math.max(0, (dl - (lake.r - 30)) / 40));
    if (w <= 0) continue;
    const sp = Math.max(0.7, Math.min(2.8, 4.0 / (depth + 1.2))) * w;
    data[o] = Math.round(Math.max(0, Math.min(1, 0.5 + bx * sp / 6)) * 255);
    data[o + 1] = Math.round(Math.max(0, Math.min(1, 0.5 + bz * sp / 6)) * 255);
    data[o + 2] = Math.round(w * 255);
    data[o + 3] = Math.round(Math.min(1, sp / 3) * 255);
  }
  _flow = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  _flow.minFilter = THREE.LinearFilter; _flow.magFilter = THREE.LinearFilter; _flow.generateMipmaps = false;
  _flow.colorSpace = THREE.NoColorSpace; _flow.needsUpdate = true;
  _flow.name = 'mvWaterFlow';
  return _flow;
}

// Bilinear CPU counterpart of wFlow.rg for surface disturbances moving relative to the river.
export function flowAt(x, z, out) {
  if(trialLakeContains(x,z)){
    const k=x-1505,axis=-80+k*.39+2.2*Math.sin(k*.10);
    const inlet=THREE.MathUtils.smoothstep(k,2,14)*(1-THREE.MathUtils.smoothstep(k,65,105))*
      (1-THREE.MathUtils.smoothstep(Math.abs(z-axis),1,9));
    return out.set(.42*inlet,.18*inlet);
  }
  const {data, width:n} = flowTexture().image;
  const u = THREE.MathUtils.clamp((x+DATA_HALF)*n/(2*DATA_HALF)-0.5,0,n-1);
  const v = THREE.MathUtils.clamp((z+DATA_HALF)*n/(2*DATA_HALF)-0.5,0,n-1);
  const i = Math.floor(u), j = Math.floor(v), i1 = Math.min(i+1,n-1), j1 = Math.min(j+1,n-1);
  const a=(j*n+i)*4, b=(j*n+i1)*4, c=(j1*n+i)*4, d=(j1*n+i1)*4;
  if(!(data[a+2] || data[b+2] || data[c+2] || data[d+2])) return out.set(0,0);
  const l = THREE.MathUtils.lerp;
  const channel = k => l(l(data[a+k],data[b+k],u-i),l(data[c+k],data[d+k],u-i),v-j);
  return out.set((channel(0)/255-.5)*6,(channel(1)/255-.5)*6);
}
