// Procedural fallback sounds, rendered once into AudioBuffers (no live oscillator graphs, no per-play cost).
// Used for names without a fitting file (snow/sand steps, dialogue ticks, beam hum, quake rumble, sparkle, chime)
// and as a stand-in whenever a file fails to load or decode.
import { mulberry32 } from '../core/util.js';

const KINDS = {
  // tiny wooden tick for the dialogue typewriter
  tick(sr, rng) {
    const len = Math.floor(sr * 0.045), L = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      L[i] = (Math.sin(t * 2 * Math.PI * 2100) * 0.6 + Math.sin(t * 2 * Math.PI * 3400) * 0.25 + (rng() * 2 - 1) * 0.15) * Math.exp(-t * 140);
    }
    return [L];
  },
  // crunchy snow step: dense grains over a low-passed noise body
  snow(sr, rng) {
    const len = Math.floor(sr * 0.26), L = new Float32Array(len);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, env = Math.min(1, t / 0.012) * Math.exp(-t * 15);
      const grain = rng() < 0.06 ? (rng() * 2 - 1) * 2.2 : 0;
      lp += (rng() * 2 - 1 - lp) * 0.35; lp2 += (lp - lp2) * 0.25;
      L[i] = (lp2 * 1.4 + grain * 0.5) * env;
    }
    return [L];
  },
  // soft sand / earth shuffle
  sand(sr, rng) {
    const len = Math.floor(sr * 0.2), L = new Float32Array(len);
    let lp = 0, hp = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, env = Math.min(1, t / 0.02) * Math.exp(-t * 18);
      lp += (rng() * 2 - 1 - lp) * 0.5; hp = 0.9 * (hp + lp - prev); prev = lp;
      L[i] = hp * env * 1.3;
    }
    return [L];
  },
  // seamless 2 s magic hum (beam / charge loops): detuned partials with whole-cycle tremolo
  hum(sr, rng) {
    const dur = 2, len = sr * dur, L = new Float32Array(len), R = new Float32Array(len);
    const parts = [[110, 0.35], [165, 0.22], [220, 0.2], [330, 0.1], [440, 0.06]];
    for (let i = 0; i < len; i++) {
      const t = i / sr, trem = 0.8 + 0.2 * Math.sin(t * 2 * Math.PI * 3);
      let l = 0, r = 0;
      for (const [f, a] of parts) { l += Math.sin(t * 2 * Math.PI * f) * a; r += Math.sin(t * 2 * Math.PI * (f + 0.5)) * a; }
      const sh = (rng() * 2 - 1) * 0.03;
      L[i] = (l * trem + sh) * 0.8; R[i] = (r * trem + sh) * 0.8;
    }
    return [L, R];
  },
  // seamless 4 s wind: band-limited noise with slow swells, ends crossfaded into the start
  wind(sr, rng) {
    const dur = 4, len = sr * dur, L = new Float32Array(len), R = new Float32Array(len);
    let a = 0, b = 0, c = 0, d = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, sw = 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 0.5) * Math.sin(t * 2 * Math.PI * 0.25 + 1);
      a += (rng() * 2 - 1 - a) * 0.06; b += (a - b) * 0.2;
      c += (rng() * 2 - 1 - c) * 0.05; d += (c - d) * 0.2;
      L[i] = b * 3.2 * sw; R[i] = d * 3.2 * sw;
    }
    const xf = Math.floor(sr * 0.25);
    for (const ch of [L, R]) for (let i = 0; i < xf; i++) { const k = i / xf; ch[i] = ch[i] * k + ch[len - xf + i] * (1 - k); }
    return [L.subarray(0, len - xf), R.subarray(0, len - xf)];
  },
  // low rumble for quakes / rising pillars
  rumble(sr, rng) {
    const len = Math.floor(sr * 1.2), L = new Float32Array(len);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr, env = Math.min(1, t / 0.04) * Math.exp(-t * 3.2);
      lp += (rng() * 2 - 1 - lp) * 0.02; lp2 += (lp - lp2) * 0.05;
      L[i] = (lp2 * 9 + Math.sin(t * 2 * Math.PI * (48 - t * 14)) * 0.35) * env;
    }
    return [L];
  },
  // rising glitter of small bell pings
  sparkle(sr, rng) {
    const len = Math.floor(sr * 0.7), L = new Float32Array(len), R = new Float32Array(len);
    for (let k = 0; k < 7; k++) {
      const t0 = k * 0.055 + rng() * 0.02, f = 2200 + k * 260 + rng() * 200, pan = rng();
      const s0 = Math.floor(t0 * sr);
      for (let i = s0; i < len; i++) {
        const t = (i - s0) / sr, v = Math.sin(t * 2 * Math.PI * f) * Math.exp(-t * 16) * 0.22;
        L[i] += v * (1 - pan); R[i] += v * pan;
      }
    }
    return [L, R];
  },
  // small temple-bell chime (inharmonic partials)
  chime(sr) {
    const len = Math.floor(sr * 1.4), L = new Float32Array(len);
    const parts = [[880, 0.5, 4], [880 * 2.76, 0.25, 6], [880 * 5.4, 0.12, 9], [880 * 0.5, 0.15, 3]];
    for (let i = 0; i < len; i++) {
      const t = i / sr; let v = 0;
      for (const [f, a, dk] of parts) v += Math.sin(t * 2 * Math.PI * f) * a * Math.exp(-t * dk);
      L[i] = v * Math.min(1, t / 0.003);
    }
    return [L];
  },
  // generic soft thump (last-resort stand-in)
  thud(sr) {
    const len = Math.floor(sr * 0.3), L = new Float32Array(len);
    let ph = 0;
    for (let i = 0; i < len; i++) { const t = i / sr; ph += 2 * Math.PI * (130 - 260 * t) / sr; L[i] = Math.sin(ph) * Math.exp(-t * 14) * 0.8; }
    return [L];
  },
};

export const SYNTH_KINDS = Object.keys(KINDS);

/** Render (once, cached by caller) a synth kind into an AudioBuffer of `ctx`. Unknown kinds fall back to 'thud'. */
export function renderSynth(ctx, kind) {
  const fn = KINDS[kind] || KINDS.thud;
  const sr = ctx.sampleRate;
  const chans = fn(sr, mulberry32(kind.length * 7919 + 13));
  let peak = 1e-6;
  for (const ch of chans) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
  const g = 0.8 / peak;
  const buf = ctx.createBuffer(chans.length, chans[0].length, sr);
  chans.forEach((ch, c) => { for (let i = 0; i < ch.length; i++) ch[i] *= g; buf.copyToChannel(ch, c); });
  return buf;
}
