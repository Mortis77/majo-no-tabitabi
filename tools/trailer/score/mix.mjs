// Mixing and mastering: FDN reverb, stereo delay, master bus (HP, mono lows, glue, true-peak limiter),
// BS.1770 loudness meter, 24-bit WAV writer.
import { writeFileSync } from 'node:fs';
import { SR, Biquad, makeRng } from './synth.mjs';

// ---------------------------------------------------------------- reverb: 8-line feedback delay network
// pre-delay, input diffusion, per-line damping, Hadamard mixing; returns the wet signal only.
export function fdnReverb(inL, inR, o = {}) {
  const rt60 = o.rt60 ?? 2.5, size = o.size ?? 1, pre = Math.round((o.pre ?? 0.02) * SR);
  const dampF = o.damp ?? 5000, N = inL.length;
  const base = [29.7, 37.1, 41.1, 43.7, 53.9, 59.3, 67.1, 73.3];
  const lens = base.map((ms, i) => (Math.round((ms * size * SR) / 1000) | 1) + 2 * i);
  const lines = lens.map((l) => new Float32Array(l)), pos = lens.map(() => 0);
  const g = lens.map((l) => Math.pow(10, (-3 * l) / (rt60 * SR)));
  const ad = 1 - Math.exp((-2 * Math.PI * dampF) / SR);
  const lpState = new Float64Array(8);
  // input diffusers (allpass) per channel
  const mkAp = (len, gain) => ({ buf: new Float32Array(len), p: 0, gain });
  const apL = [mkAp(142, 0.7), mkAp(379, 0.65), mkAp(107, 0.6)], apR = [mkAp(151, 0.7), mkAp(353, 0.65), mkAp(113, 0.6)];
  const ap = (a, x) => { const d = a.buf[a.p]; const y = -a.gain * x + d; a.buf[a.p] = x + a.gain * y; a.p = (a.p + 1) % a.buf.length; return y; };
  const outL = new Float32Array(N), outR = new Float32Array(N);
  const v = new Float64Array(8);
  const cL = [1, -1, 1, -1, 1, -1, 1, -1], cR = [1, 1, -1, -1, 1, 1, -1, -1];
  const s8 = 1 / Math.sqrt(8);
  for (let n = 0; n < N; n++) {
    let xl = n >= pre ? inL[n - pre] : 0, xr = n >= pre ? inR[n - pre] : 0;
    for (const a of apL) xl = ap(a, xl);
    for (const a of apR) xr = ap(a, xr);
    let ol = 0, or = 0;
    for (let i = 0; i < 8; i++) {
      const d = lines[i][pos[i]];
      lpState[i] += ad * (d - lpState[i]);
      v[i] = lpState[i];
      ol += cL[i] * v[i]; or += cR[i] * v[i];
    }
    // fast Walsh–Hadamard
    for (let h = 1; h < 8; h <<= 1) for (let i = 0; i < 8; i += h << 1) for (let j = i; j < i + h; j++) { const a = v[j], b = v[j + h]; v[j] = a + b; v[j + h] = a - b; }
    for (let i = 0; i < 8; i++) {
      const inp = i < 4 ? (i & 1 ? -xl : xl) : (i & 1 ? -xr : xr);
      lines[i][pos[i]] = v[i] * s8 * g[i] + inp * 0.5;
      pos[i] = (pos[i] + 1) % lens[i];
    }
    outL[n] = ol * 0.35; outR[n] = or * 0.35;
  }
  new Biquad('hp', o.hp ?? 180, 0.7).run(outL); new Biquad('hp', o.hp ?? 180, 0.7).run(outR);
  new Biquad('lp', o.lp ?? 7000, 0.7).run(outL); new Biquad('lp', o.lp ?? 7000, 0.7).run(outR);
  return [outL, outR];
}

// ping-pong delay (wet only)
export function pingPong(inL, inR, o = {}) {
  const d = Math.round((o.time ?? 0.45) * SR), fb = o.feedback ?? 0.3, N = inL.length;
  const bl = new Float32Array(d), br = new Float32Array(d);
  const lpl = new Biquad('lp', o.lp ?? 3500, 0.7), lpr = new Biquad('lp', o.lp ?? 3500, 0.7), hpl = new Biquad('hp', 300, 0.7), hpr = new Biquad('hp', 300, 0.7);
  const L = new Float32Array(N), R = new Float32Array(N);
  let p = 0;
  for (let n = 0; n < N; n++) {
    const yl = bl[p], yr = br[p];
    bl[p] = hpl.tick(lpl.tick(0.5 * (inL[n] + inR[n]) + fb * yr));
    br[p] = hpr.tick(lpr.tick(fb * yl));
    L[n] = yl; R[n] = yr;
    p = (p + 1) % d;
  }
  return [L, R];
}

// bus compressor (stereo-linked peak detector, soft knee) — used to tame the drum bus transients
export function busComp(L, R, o = {}) {
  const thr = o.thr ?? -14, ratio = o.ratio ?? 3, knee = 4, N = L.length;
  const at = Math.exp(-1 / ((o.attack ?? 0.002) * SR)), rt = Math.exp(-1 / ((o.release ?? 0.08) * SR));
  const mk = Math.pow(10, (o.makeup ?? 0) / 20);
  let gr = 0, maxGr = 0;
  for (let n = 0; n < N; n++) {
    const lv = 20 * Math.log10(Math.max(Math.abs(L[n]), Math.abs(R[n])) + 1e-9);
    const over = lv - thr;
    let want = 0;
    if (over > knee / 2) want = over * (1 - 1 / ratio);
    else if (over > -knee / 2) want = ((over + knee / 2) ** 2 / (2 * knee)) * (1 - 1 / ratio);
    gr = want > gr ? at * gr + (1 - at) * want : rt * gr + (1 - rt) * want;
    if (gr > maxGr) maxGr = gr;
    const g = Math.pow(10, -gr / 20) * mk;
    L[n] *= g; R[n] *= g;
  }
  return maxGr;
}

// ---------------------------------------------------------------- loudness (ITU-R BS.1770 / EBU R128)
export function kWeight(x) {
  const y = new Float32Array(x.length);
  const s1 = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] };
  const s2 = { b: [1.0, -2.0, 1.0], a: [-1.99004745483398, 0.99007225036621] };
  let a1 = 0, a2 = 0, b1 = 0, b2 = 0;
  for (const s of [s1, s2]) {
    let z1 = 0, z2 = 0;
    const src = s === s1 ? x : y;
    for (let i = 0; i < x.length; i++) {
      const xi = src[i];
      const yi = s.b[0] * xi + z1;
      z1 = s.b[1] * xi - s.a[0] * yi + z2;
      z2 = s.b[2] * xi - s.a[1] * yi;
      y[i] = yi;
    }
  }
  return y;
}
export function loudness(L, R) {
  const kl = kWeight(L), kr = kWeight(R);
  const hop = SR / 10; // 100 ms
  const nb = Math.floor(L.length / hop);
  const p = new Float64Array(nb);
  for (let b = 0; b < nb; b++) { let s = 0; for (let i = b * hop; i < (b + 1) * hop; i++) s += kl[i] * kl[i] + kr[i] * kr[i]; p[b] = s / hop; }
  const win = (k) => { const out = []; for (let b = 0; b + k <= nb; b++) { let s = 0; for (let j = 0; j < k; j++) s += p[b + j]; out.push(s / k); } return out; };
  const LK = (pw) => -0.691 + 10 * Math.log10(pw + 1e-20);
  const m400 = win(4);
  const g1 = m400.filter((x) => LK(x) > -70);
  const rel = LK(g1.reduce((a, b) => a + b, 0) / g1.length) - 10;
  const g2 = g1.filter((x) => LK(x) > rel);
  const I = LK(g2.reduce((a, b) => a + b, 0) / g2.length);
  const st = win(30).map(LK); // short-term, 3 s, 100 ms hop; st[k] covers k*0.1 .. k*0.1+3
  const sg = st.filter((x) => x > -70);
  const rel2 = LK(sg.map((x) => Math.pow(10, (x + 0.691) / 10)).reduce((a, b) => a + b, 0) / sg.length) - 20;
  const s2 = sg.filter((x) => x > rel2).sort((a, b) => a - b);
  const q = (f) => s2[Math.min(s2.length - 1, Math.floor(f * (s2.length - 1)))];
  return { I, LRA: q(0.95) - q(0.1), st, mom: m400.map(LK) };
}

// ---------------------------------------------------------------- true peak (4x oversampling, windowed sinc)
const TP_TAPS = 12;
const tpKernel = [1, 2, 3].map((ph) => {
  const fr = ph / 4, k = [];
  for (let j = -TP_TAPS + 1; j <= TP_TAPS; j++) {
    const x = j - fr;
    const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / (TP_TAPS + 0.5));
    k.push(x === 0 ? 1 : (Math.sin(Math.PI * x) / (Math.PI * x)) * w);
  }
  return k;
});
export function truePeakEnvelope(x) {
  const N = x.length, out = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    let m = Math.abs(x[n]);
    if (m > 0.05) {
      for (const k of tpKernel) {
        let s = 0;
        for (let j = 0; j < k.length; j++) { const i = n + j - TP_TAPS + 1; if (i >= 0 && i < N) s += k[j] * x[i]; }
        // sample between n and n+1
        if (Math.abs(s) > m) m = Math.abs(s);
      }
    }
    out[n] = m;
  }
  return out;
}

// ---------------------------------------------------------------- master bus
export function master(L, R, o = {}) {
  const N = L.length;
  // high-pass 30 Hz (4th order Butterworth)
  for (const ch of [L, R]) { new Biquad('hp', 30, 0.5412).run(ch); new Biquad('hp', 30, 1.3066).run(ch); }
  // keep lows mono below ~120 Hz: high-pass the side signal
  const s1 = new Biquad('hp', 120, 0.5412), s2 = new Biquad('hp', 120, 1.3066);
  for (let n = 0; n < N; n++) { const m = 0.5 * (L[n] + R[n]); const s = s2.tick(s1.tick(0.5 * (L[n] - R[n]))); L[n] = m + s; R[n] = m - s; }
  // gain
  const gain = o.gain ?? 1;
  for (let n = 0; n < N; n++) { L[n] *= gain; R[n] *= gain; }
  // glue compressor: stereo-linked, RMS-ish detector, 2:1, soft knee
  const thr = o.compThr ?? -9, ratio = o.compRatio ?? 2, knee = 6;
  const at = Math.exp(-1 / (0.025 * SR)), rt = Math.exp(-1 / (0.25 * SR)), dt = Math.exp(-1 / (0.01 * SR));
  let det = 0, gr = 0, maxGr = 0;
  for (let n = 0; n < N; n++) {
    const p = Math.max(L[n] * L[n], R[n] * R[n]);
    det = dt * det + (1 - dt) * p;
    const lv = 10 * Math.log10(det + 1e-12);
    const over = lv - thr - (o.compOffset ? o.compOffset(n / SR) : 0); // automation: the glue lets the hit through
    let want = 0;
    if (over > knee / 2) want = over * (1 - 1 / ratio);
    else if (over > -knee / 2) want = ((over + knee / 2) ** 2 / (2 * knee)) * (1 - 1 / ratio);
    gr = want > gr ? at * gr + (1 - at) * want : rt * gr + (1 - rt) * want;
    if (gr > maxGr) maxGr = gr;
    const g = Math.pow(10, -gr / 20);
    L[n] *= g; R[n] *= g;
  }
  // look-ahead true-peak limiter (preceded by a gentle soft-knee saturator that rounds the highest transients)
  const ceil = Math.pow(10, (o.ceiling ?? -1.6) / 20);
  // v2: knee 0.6 -> 0.85 x ceiling (only the highest transients); o.satKneeAt(t) may lower it for a moment (the hit)
  { const sat = (x, k) => { const room = 1.4 * ceil - k, a = Math.abs(x); return a <= k ? x : Math.sign(x) * (k + room * Math.tanh((a - k) / room)); };
    for (let n = 0; n < N; n++) { const k = (o.satKneeAt ? o.satKneeAt(n / SR) : o.satKnee ?? 0.85) * ceil; L[n] = sat(L[n], k); R[n] = sat(R[n], k); } }
  const la = Math.round(0.005 * SR);
  const pl = truePeakEnvelope(L), pr = truePeakEnvelope(R);
  const req = new Float32Array(N);
  for (let n = 0; n < N; n++) { const pk = Math.max(pl[n], pr[n]); req[n] = pk > ceil ? ceil / pk : 1; }
  // forward sliding minimum over [n, n+la)
  const mn = new Float32Array(N);
  { const dq = new Int32Array(N); let h = 0, t = 0;
    for (let i = N - 1; i >= 0; i--) {
      while (t > h && req[dq[t - 1]] >= req[i]) t--;
      dq[t++] = i;
      while (dq[h] >= i + la) h++;
      mn[i] = req[dq[h]];
    } }
  // box average over the previous la samples, then a smooth release
  const lim = new Float32Array(N);
  let acc = la, rel = 1, limMax = 0;
  const rc = 1 - Math.exp(-1 / (0.08 * SR));
  for (let n = 0; n < N; n++) {
    acc += mn[n] - (n >= la ? mn[n - la] : 1);
    const a = Math.min(1, acc / la);
    rel = a < rel ? a : rel + (a - rel) * rc;
    lim[n] = rel;
    if (1 - rel > limMax) limMax = 1 - rel;
  }
  for (let n = 0; n < N; n++) { L[n] *= lim[n]; R[n] *= lim[n]; }
  // safety: hard ceiling on samples (should not engage)
  let clipped = 0;
  for (let n = 0; n < N; n++) { for (const ch of [L, R]) { if (Math.abs(ch[n]) > ceil * 1.000001) { ch[n] = Math.sign(ch[n]) * ceil; clipped++; } } }
  return { compMaxGrDb: maxGr, limMaxGrDb: -20 * Math.log10(1 - limMax + 1e-9), clipped, lim };
}

// ---------------------------------------------------------------- WAV writer (PCM 24-bit, TPDF dither) / float
export function writeWav(path, L, R, bits = 24, seed = 7) {
  const N = L.length, ch = 2, bps = bits / 8;
  const fmt = bits === 32 ? 3 : 1;
  const data = Buffer.alloc(N * ch * bps);
  const rng = makeRng(seed);
  const q = 8388607;
  let o = 0;
  for (let n = 0; n < N; n++) {
    for (const x of [L[n], R[n]]) {
      if (bits === 32) { data.writeFloatLE(x, o); o += 4; continue; }
      let v = Math.round(x * q + (rng() - rng()));
      v = Math.max(-q - 1, Math.min(q, v));
      data.writeIntLE(v, o, 3); o += 3;
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(fmt, 20); h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * ch * bps, 28); h.writeUInt16LE(ch * bps, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}
