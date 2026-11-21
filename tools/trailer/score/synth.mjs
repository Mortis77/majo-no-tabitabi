// 《月帷巫女》 trailer score — small synthesiser. Every sound is generated here; no samples.
// Instruments return a mono Float32Array or a stereo pair [L, R], starting at the note onset.

export const SR = 48000;
const TAU = Math.PI * 2;

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midiOf(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return 12 * (+m[3] + 1) + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const hz = (m) => 440 * Math.pow(2, (midiOf(m) - 69) / 12);

// ---------------------------------------------------------------- filters
export class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0) { this.z1 = 0; this.z2 = 0; if (type) this.set(type, f, q, gainDb); }
  set(type, f, q = 0.707, gainDb = 0) {
    const w = (TAU * Math.min(Math.max(f, 5), SR * 0.47)) / SR;
    const c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    else if (type === 'ls' || type === 'hs') {
      const sq = 2 * Math.sqrt(A) * al, sg = type === 'ls' ? 1 : -1;
      b0 = A * ((A + 1) - sg * (A - 1) * c + sq); b1 = sg * 2 * A * ((A - 1) - sg * (A + 1) * c); b2 = A * ((A + 1) - sg * (A - 1) * c - sq);
      a0 = (A + 1) + sg * (A - 1) * c + sq; a1 = -sg * 2 * ((A - 1) + sg * (A + 1) * c); a2 = (A + 1) + sg * (A - 1) * c - sq;
    } else throw new Error('filter ' + type);
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  tick(x) { const y = this.b0 * x + this.z1; this.z1 = this.b1 * x - this.a1 * y + this.z2; this.z2 = this.b2 * x - this.a2 * y; return y; }
  run(buf) { for (let i = 0; i < buf.length; i++) buf[i] = this.tick(buf[i]); return buf; }
}
export const filt = (buf, type, f, q, g) => new Biquad(type, f, q, g).run(buf);

// ---------------------------------------------------------------- helpers
function fadeEnds(buf, inMs = 1, outMs = 8) {
  const a = Math.min(buf.length, Math.round((inMs * SR) / 1000)), b = Math.min(buf.length, Math.round((outMs * SR) / 1000));
  for (let i = 0; i < a; i++) buf[i] *= i / a;
  for (let i = 0; i < b; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
}
const smooth = (x) => x * x * (3 - 2 * x);
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// ---------------------------------------------------------------- plucked strings (Karplus–Strong)
// koto: long ring, pick comb, optional upward press-bend on the attack. shamisen: short, bright, buzzy (sawari).
export function pluck(freq, dur, vel, o = {}, rng = Math.random) {
  const t60 = o.t60 ?? 2.6, bright = o.bright ?? 0.5, pickPos = o.pick ?? 0.14, bend = o.bend ?? 0;
  const ring = o.ring ?? dur + 1.4, damp = o.damp ?? 0.25;
  const len = Math.ceil((ring + damp) * SR);
  const out = new Float32Array(len);
  const P = SR / freq;
  const N = Math.max(4, Math.round(P));
  // excitation: lowpassed noise burst, pick-position comb, DC removed
  const exc = new Float32Array(N);
  const a = 0.12 + 0.8 * Math.min(1, bright * (0.55 + 0.6 * vel));
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += a * (rng() * 2 - 1 - lp); exc[i] = lp; }
  const pk = Math.max(1, Math.round(pickPos * P));
  for (let i = N - 1; i >= pk; i--) exc[i] -= exc[i - pk];
  let mean = 0; for (let i = 0; i < N; i++) mean += exc[i]; mean /= N;
  let pkv = 1e-9; for (let i = 0; i < N; i++) { exc[i] -= mean; pkv = Math.max(pkv, Math.abs(exc[i])); }
  for (let i = 0; i < N; i++) exc[i] *= vel / pkv;
  const s = 0.5 - 0.42 * bright; // loop smoothing: 0.5 = darkest
  const g = Math.pow(0.001, 1 / (t60 * freq));
  const size = 8192, mask = size - 1, buf = new Float32Array(size);
  let prev = 0;
  const bendTau = SR * 0.09;
  for (let n = 0; n < len; n++) {
    const D = (bend ? P * Math.pow(2, (-bend * Math.exp(-n / bendTau)) / 1200) : P) - s;
    const idx = n - D;
    let x = 0;
    if (idx >= 0) { const i0 = Math.floor(idx), fr = idx - i0; x = buf[i0 & mask] * (1 - fr) + buf[(i0 + 1) & mask] * fr; }
    let y = g * ((1 - s) * x + s * prev);
    prev = x;
    if (n < N) y += exc[n];
    buf[n & mask] = y;
    out[n] = y;
  }
  // sawari buzz: rectified, band-limited, follows the string
  if (o.buzz) {
    const bp = new Biquad('bp', o.buzzF ?? 3000, 1.2), lp2 = new Biquad('lp', 7000, 0.7);
    for (let n = 0; n < len; n++) out[n] += o.buzz * lp2.tick(bp.tick(Math.abs(out[n]) - 0.2 * vel));
  }
  // body: a little wood resonance, top rolled off
  new Biquad('peak', o.bodyF ?? 240, 1.1, 2.5).run(out);
  new Biquad('lp', o.lp ?? 9500, 0.6).run(out);
  // damping at the end
  const d0 = Math.round(ring * SR), dl = Math.round(damp * SR);
  for (let n = d0; n < len; n++) out[n] *= 0.5 + 0.5 * Math.cos((Math.PI * (n - d0)) / dl);
  return fadeEnds(out, 0.6, 4);
}

// ---------------------------------------------------------------- breathy flute (shakuhachi colour)
// One continuous breath per phrase: notes = [{t, dur, f, vel}] relative to the event, portamento between notes.
export function flutePhrase(notes, o = {}, rng = Math.random) {
  const last = notes[notes.length - 1];
  const release = o.release ?? 0.32;
  const total = last.t + last.dur + release + 0.05;
  const len = Math.ceil(total * SR);
  const out = new Float32Array(len);
  const tonal = new Biquad('bp', 440, 7), hiss = new Biquad('bp', 2400, 0.7), hissLp = new Biquad('lp', 6500, 0.7);
  const atk = o.attack ?? 0.16, breath = o.breath ?? 0.16;
  let ph = 0, ni = 0, drift = 0, driftT = 0;
  let curCents = 0;
  const vibRate = o.vibRate ?? 5.1;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    while (ni < notes.length - 1 && t >= notes[ni + 1].t) ni++;
    const nt = notes[ni];
    const tn = t - nt.t; // time within current note
    const longNote = nt.dur > 0.9;
    // target pitch with a portamento from the previous note
    const prevF = ni > 0 ? notes[ni - 1].f : nt.f;
    const glide = Math.min(1, tn / 0.035);
    const baseF = prevF + (nt.f - prevF) * smooth(Math.max(0, glide));
    // scoop into long notes, late vibrato that deepens
    const scoop = longNote && (ni === 0 || nt.scoop) ? -(o.scoop ?? 40) * Math.exp(-tn / 0.08) : 0;
    const vd = Math.min(1, Math.max(0, (tn - (o.vibDelay ?? 0.38)) / 0.9));
    const vib = (o.vibDepth ?? 16) * vd * vd * Math.sin(TAU * vibRate * t + 0.3 * Math.sin(TAU * 0.7 * t));
    if (t >= driftT) { drift = (rng() - 0.5) * 6; driftT = t + 0.25; }
    curCents += 0.002 * (drift - curCents);
    const f = baseF * Math.pow(2, (scoop + vib + curCents) / 1200);
    ph += f / SR; if (ph > 1) ph -= 1;
    if ((n & 63) === 0) tonal.set('bp', f, 7);
    // phrase envelope (overshooting attack, articulation dip at note changes, release)
    let env;
    if (t < atk) env = Math.pow(t / atk, 1.6) * 1.18;
    else if (t < atk + 0.22) env = 1.18 - 0.18 * smooth((t - atk) / 0.22);
    else env = 1;
    const endT = last.t + last.dur;
    if (t > endT) env *= Math.max(0, 1 - (t - endT) / release);
    if (ni > 0 && tn < 0.05) env *= 0.72 + 0.28 * (tn / 0.05);
    // note dynamics: a little swell on long notes, the note's own velocity
    const nv = nt.vel * (longNote ? 0.92 + 0.12 * Math.min(1, tn / (nt.dur * 0.6)) : 1);
    // breathing: slow amplitude wander
    const wander = 1 + 0.04 * Math.sin(TAU * 0.9 * t + 1.3) + 0.025 * Math.sin(TAU * 2.3 * t);
    const core = Math.sin(TAU * ph) + 0.16 * Math.sin(2 * TAU * ph) + 0.07 * Math.sin(3 * TAU * ph) + 0.025 * Math.sin(4 * TAU * ph);
    const w = rng() * 2 - 1;
    const chiff = Math.exp(-tn / 0.045) * (ni === 0 || tn < 0.3 ? 1 : 0);
    const noiseEnv = Math.min(1, t / (atk * 0.5));
    const toneEnv = env * env;
    out[n] = nv * wander * (0.7 * core * toneEnv + breath * 3.2 * tonal.tick(w) * env * noiseEnv
      + hissLp.tick(hiss.tick(w)) * (breath * 0.35 * env + 0.25 * chiff * nv));
  }
  return fadeEnds(out, 2, 20);
}

// breath between phrases: a soft inhale
export function breathNoise(dur, vel, rng = Math.random) {
  const len = Math.ceil(dur * SR), out = new Float32Array(len);
  const bp = new Biquad('bp', 1100, 0.8), hp = new Biquad('hp', 400, 0.7);
  for (let n = 0; n < len; n++) {
    const x = n / len, e = Math.sin(Math.PI * Math.pow(x, 0.7)) ** 2;
    bp.set('bp', 900 + 900 * x, 0.8);
    out[n] = vel * 0.5 * e * hp.tick(bp.tick(rng() * 2 - 1));
  }
  return out;
}

// ---------------------------------------------------------------- strings (detuned saws through a low-pass)
// freqs: chord; options: attack, release, cutoff, voices, detune (cents), spread, vib (cents), stacc (decay seconds)
export function strings(freqs, dur, vel, o = {}, rng = Math.random) {
  const attack = o.attack ?? 0.6, release = o.release ?? 0.9, voices = o.voices ?? 5, det = o.detune ?? 9, spread = o.spread ?? 0.8;
  const stacc = o.stacc ?? 0, vibC = o.vib ?? 0;
  const len = Math.ceil((dur + release + 0.02) * SR);
  const L = new Float32Array(len), R = new Float32Array(len);
  const norm = 1 / Math.sqrt(freqs.length * voices);
  for (let fi = 0; fi < freqs.length; fi++) {
    for (let v = 0; v < voices; v++) {
      const k = voices > 1 ? v / (voices - 1) - 0.5 : 0;
      const cents = 2 * k * det + (rng() - 0.5) * 3;
      const f0 = freqs[fi] * Math.pow(2, cents / 1200);
      const pan = Math.max(-1, Math.min(1, 2 * k * spread + (rng() - 0.5) * 0.3 + (o.pan ?? 0)));
      const gl = Math.cos(((pan + 1) * Math.PI) / 4) * norm, gr = Math.sin(((pan + 1) * Math.PI) / 4) * norm;
      const vr = 4.6 + rng() * 1.2, vp = rng() * TAU, vdel = 0.25 + rng() * 0.3;
      let ph = rng();
      for (let n = 0; n < len; n++) {
        const t = n / SR;
        let f = f0;
        if (vibC) { const vd = Math.min(1, Math.max(0, (t - vdel) / 0.6)); f *= Math.pow(2, (vibC * vd * Math.sin(TAU * vr * t + vp)) / 1200); }
        const dt = f / SR;
        ph += dt; if (ph >= 1) ph -= 1;
        const s = 2 * ph - 1 - blep(ph, dt);
        L[n] += s * gl; R[n] += s * gr;
      }
    }
  }
  // tone: low-pass (cutoff may open with an envelope), body EQ
  const cutoff = o.cutoff ?? 2200, envCut = o.envCut ?? 0;
  const fl = [new Biquad('lp', cutoff, 0.6), new Biquad('lp', cutoff * 1.4, 0.55)], fr = [new Biquad('lp', cutoff, 0.6), new Biquad('lp', cutoff * 1.4, 0.55)];
  const mud = [new Biquad('peak', 320, 0.9, o.mud ?? -3), new Biquad('peak', 320, 0.9, o.mud ?? -3)];
  const drift = o.drift ?? 0, dRate = o.driftRate ?? 0.2, dPh = rng() * TAU; // slow breathing of the tone (held chords)
  const hp = o.hp ? [new Biquad('hp', o.hp, 0.7), new Biquad('hp', o.hp, 0.7)] : null;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    if ((envCut || drift) && (n & 31) === 0) {
      const c = cutoff * (1 + envCut * Math.exp(-t / (stacc || 0.3))) * (1 + drift * Math.sin(TAU * dRate * t + dPh));
      fl[0].set('lp', c, 0.6); fr[0].set('lp', c, 0.6);
      if (drift) { fl[1].set('lp', c * 1.4, 0.55); fr[1].set('lp', c * 1.4, 0.55); }
    }
    let env;
    if (stacc) env = Math.min(1, t / 0.006) * Math.exp(-t / stacc) * (t > dur ? Math.max(0, 1 - (t - dur) / release) : 1);
    else {
      const a = t < attack ? Math.sin((Math.PI / 2) * (t / attack)) ** 2 : 1;
      const r = t > dur ? Math.max(0, Math.cos((Math.PI / 2) * Math.min(1, (t - dur) / release))) : 1;
      env = a * r;
    }
    let l = fl[1].tick(fl[0].tick(L[n])), r = fr[1].tick(fr[0].tick(R[n]));
    l = mud[0].tick(l); r = mud[1].tick(r);
    if (hp) { l = hp[0].tick(l); r = hp[1].tick(r); }
    L[n] = l * env * vel; R[n] = r * env * vel;
  }
  fadeEnds(L, 1, 6); fadeEnds(R, 1, 6);
  return [L, R];
}

// ---------------------------------------------------------------- drums: pitched body + band-passed noise
const DRUMS = {
  odaiko: { f0: 48, f1: 115, sweep: 0.04, decay: 1.0, modes: [[1, 1, 1], [1.59, 0.3, 0.45], [2.14, 0.14, 0.3]], nf: 220, nq: 0.7, na: 0.55, nd: 0.07, drive: 1.5, len: 2.2, click: 0.25 },
  taiko: { f0: 92, f1: 180, sweep: 0.025, decay: 0.42, modes: [[1, 1, 1], [1.6, 0.35, 0.5], [2.3, 0.15, 0.3]], nf: 520, nq: 0.8, na: 0.6, nd: 0.045, drive: 1.4, len: 1.1, click: 0.35 },
  shime: { f0: 360, f1: 430, sweep: 0.01, decay: 0.08, modes: [[1, 1, 1], [1.52, 0.5, 0.7], [2.2, 0.3, 0.5]], nf: 2300, nq: 1.1, na: 0.8, nd: 0.022, drive: 1.2, len: 0.35, click: 0.5 },
  rim: { f0: 820, f1: 900, sweep: 0.004, decay: 0.022, modes: [[1, 1, 1], [2.7, 0.4, 0.5]], nf: 3200, nq: 1.6, na: 0.7, nd: 0.01, drive: 1, len: 0.15, click: 0.6 },
  wood: { f0: 980, f1: 1010, sweep: 0.003, decay: 0.055, modes: [[1, 1, 1], [2.64, 0.28, 0.5]], nf: 1900, nq: 2.5, na: 0.25, nd: 0.004, drive: 1, len: 0.25, click: 0.3 },
};
export function drum(kind, vel, o = {}, rng = Math.random) {
  const p = DRUMS[kind];
  const pitch = o.pitch ?? 1;
  const stretch = Math.max(1, o.decay ?? 1);
  const len = Math.ceil(p.len * (stretch > 1 ? 1.6 * stretch : 1) * SR), out = new Float32Array(len);
  const ph = p.modes.map(() => rng() * 0.1);
  const bp = new Biquad('bp', p.nf * pitch, p.nq), hpc = new Biquad('hp', 2500, 0.7);
  const dec = p.decay * (o.decay ?? 1) * (0.85 + 0.3 * vel);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = (p.f0 + (p.f1 - p.f0) * Math.exp(-t / p.sweep)) * pitch;
    let body = 0;
    for (let m = 0; m < p.modes.length; m++) {
      const [r, a, dk] = p.modes[m];
      ph[m] += (f * r) / SR;
      body += a * Math.sin(TAU * ph[m]) * Math.exp(-t / (dec * dk));
    }
    const w = rng() * 2 - 1;
    const noise = p.na * bp.tick(w) * Math.exp(-t / p.nd) * 2.2;
    const click = p.click * hpc.tick(w) * Math.exp(-t / 0.0025);
    const atk = Math.min(1, t / 0.0008);
    const x = atk * (body + noise * (0.6 + 0.6 * vel) + click * vel);
    out[n] = (Math.tanh(p.drive * x) / Math.tanh(p.drive)) * vel;
  }
  return fadeEnds(out, 0, stretch > 1 ? 150 : 10);
}

// ---------------------------------------------------------------- bells, music box (inharmonic additive)
const BELLS = {
  temple: [[0.5, 0.45, 1.0], [1, 1, 0.8], [1.19, 0.18, 0.55], [1.5, 0.22, 0.45], [2, 0.42, 0.42], [2.76, 0.22, 0.25], [4.07, 0.12, 0.15], [5.4, 0.07, 0.1]],
  rin: [[1, 1, 1], [2.71, 0.45, 0.45], [5.15, 0.22, 0.2], [8.3, 0.08, 0.1]],
  musicbox: [[1, 1, 1], [3.0, 0.06, 0.35], [5.93, 0.16, 0.12], [9.1, 0.04, 0.05]],
  glass: [[1, 1, 1], [2.32, 0.3, 0.5], [4.25, 0.15, 0.25], [6.63, 0.05, 0.12]],
};
export function bell(freq, vel, o = {}, rng = Math.random) {
  const parts = BELLS[o.kind ?? 'temple'];
  const T = o.decay ?? 5;
  const len = Math.ceil((o.len ?? T * 1.3) * SR), out = new Float32Array(len);
  for (const [r, a, d] of parts) {
    const f = freq * r;
    if (f > 15000) continue;
    const beat = 0.6 + rng() * 1.2; // two slightly detuned components beat slowly
    const p1 = rng() * TAU, p2 = rng() * TAU, tau = T * d * (o.kind === 'musicbox' ? Math.pow(440 / freq, 0.35) : 1);
    const amp = a * (r > 1.6 ? 0.6 + 0.6 * vel : 1);
    for (let n = 0; n < len; n++) {
      const t = n / SR;
      out[n] += amp * Math.exp(-t / tau) * (Math.sin(TAU * f * t + p1) + 0.6 * Math.sin(TAU * (f + beat) * t + p2)) * 0.62;
    }
  }
  // strike: a short soft mallet / tine click
  const hp = new Biquad('hp', o.kind === 'musicbox' ? 3500 : 1200, 0.7), lp = new Biquad('lp', 9000, 0.7);
  const cl = o.kind === 'musicbox' ? 0.12 : 0.05;
  for (let n = 0; n < Math.min(len, 0.03 * SR); n++) out[n] += cl * lp.tick(hp.tick(rng() * 2 - 1)) * Math.exp(-n / (0.004 * SR));
  for (let n = 0; n < len; n++) out[n] *= vel * Math.min(1, n / (0.0015 * SR));
  return fadeEnds(out, 0.5, 40);
}

// ---------------------------------------------------------------- bass: soft sub following the roots
export function bass(freq, dur, vel, o = {}) {
  const rel = o.release ?? 0.3, atk = o.attack ?? 0.03;
  const len = Math.ceil((dur + rel) * SR), out = new Float32Array(len);
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    ph += freq / SR;
    const s = Math.sin(TAU * ph) + 0.18 * Math.sin(2 * TAU * ph) + 0.06 * Math.sin(3 * TAU * ph);
    const a = Math.min(1, t / atk), r = t > dur ? Math.max(0, 1 - (t - dur) / rel) : 1;
    const d = 0.75 + 0.25 * Math.exp(-t / 0.4);
    out[n] = Math.tanh(1.2 * s * a * r * d) * vel * 0.8;
  }
  return fadeEnds(out, 2, 10);
}

// ---------------------------------------------------------------- trailer sound design
// airy swell: band-passed noise opening upward, peak at `dur`, short fall-off after
export function airSwell(dur, vel, o = {}, rng = Math.random) {
  const tail = o.tail ?? 0.35, len = Math.ceil((dur + tail) * SR);
  const L = new Float32Array(len), R = new Float32Array(len);
  const f0 = o.f0 ?? 350, f1 = o.f1 ?? 3200;
  const bl = new Biquad('bp', f0, 0.9), br = new Biquad('bp', f0, 0.9), ll = new Biquad('lp', 8000, 0.7), lr = new Biquad('lp', 8000, 0.7);
  for (let n = 0; n < len; n++) {
    const t = n / SR, x = Math.min(1, t / dur);
    if ((n & 31) === 0) { const f = f0 * Math.pow(f1 / f0, x); bl.set('bp', f, 0.9); br.set('bp', f * 1.07, 0.9); }
    const e = t <= dur ? Math.pow(x, o.curve ?? 2.4) : Math.exp(-(t - dur) / (tail / 4));
    L[n] = vel * e * ll.tick(bl.tick(rng() * 2 - 1)) * 1.6;
    R[n] = vel * e * lr.tick(br.tick(rng() * 2 - 1)) * 1.6;
  }
  fadeEnds(L, 5, 15); fadeEnds(R, 5, 15);
  return [L, R];
}

// a quiet wind bed: wandering band of noise
export function airBed(dur, vel, o = {}, rng = Math.random) {
  const len = Math.ceil(dur * SR), L = new Float32Array(len), R = new Float32Array(len);
  const bl = new Biquad('bp', 600, 1.2), br = new Biquad('bp', 700, 1.2), rl = new Biquad('bp', 260, 0.9), rr = new Biquad('bp', 280, 0.9);
  const fin = o.fadeIn ?? 2.5, fout = o.fadeOut ?? 2.5;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    if ((n & 63) === 0) {
      bl.set('bp', 520 + 260 * Math.sin(TAU * 0.07 * t) + 120 * Math.sin(TAU * 0.19 * t + 1), 1.2);
      br.set('bp', 600 + 240 * Math.sin(TAU * 0.06 * t + 2) + 130 * Math.sin(TAU * 0.23 * t), 1.2);
    }
    const e = Math.min(1, t / fin) * Math.min(1, (dur - t) / fout) * (0.75 + 0.25 * Math.sin(TAU * 0.11 * t));
    L[n] = vel * e * (bl.tick(rng() * 2 - 1) + 0.35 * rl.tick(rng() * 2 - 1));
    R[n] = vel * e * (br.tick(rng() * 2 - 1) + 0.35 * rr.tick(rng() * 2 - 1));
  }
  return [L, R];
}

// cymbal swell: metallic square cluster + noise, high-passed, rising to `dur`
export function cymbalSwell(dur, vel, o = {}, rng = Math.random) {
  const tail = 0.6, tTau = o.tail ?? 0.15, len = Math.ceil((dur + tail) * SR), L = new Float32Array(len), R = new Float32Array(len);
  const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 1.7);
  const ph = fr.map(() => rng());
  const hl = [new Biquad('hp', 5200, 0.7), new Biquad('hp', 5200, 0.7)], hr = [new Biquad('hp', 5400, 0.7), new Biquad('hp', 5400, 0.7)];
  const ll = new Biquad('lp', 11000, 0.7), lr = new Biquad('lp', 11000, 0.7), pres = [new Biquad('peak', 3500, 1, -4), new Biquad('peak', 3500, 1, -4)];
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    let m = 0;
    for (let k = 0; k < fr.length; k++) { ph[k] += fr[k] / SR; if (ph[k] >= 1) ph[k] -= 1; m += ph[k] < 0.5 ? 1 : -1; }
    m /= fr.length;
    const e = t <= dur ? Math.pow(t / dur, 3) : Math.exp(-(t - dur) / tTau);
    const nl = rng() * 2 - 1, nr = rng() * 2 - 1;
    L[n] = vel * e * pres[0].tick(ll.tick(hl[1].tick(hl[0].tick(0.6 * m + 0.7 * nl))));
    R[n] = vel * e * pres[1].tick(lr.tick(hr[1].tick(hr[0].tick(0.6 * m + 0.7 * nr))));
  }
  fadeEnds(L, 5, 20); fadeEnds(R, 5, 20);
  return [L, R];
}

// riser: noise band sweeping up + rising detuned tone, tremolo speeding up; cut clean at `dur`
export function riser(dur, vel, o = {}, rng = Math.random) {
  const len = Math.ceil(dur * SR), L = new Float32Array(len), R = new Float32Array(len);
  const bl = new Biquad('bp', 300, 1.4), br = new Biquad('bp', 300, 1.4);
  const tl = new Biquad('lp', 900, 0.8), tr = new Biquad('lp', 900, 0.8);
  const ph = [0, 0.33, 0.66], dets = [-12, 0, 12];
  let tph = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR, x = t / dur;
    if ((n & 31) === 0) {
      const f = 250 * Math.pow(5000 / 250, x);
      bl.set('bp', f, 1.4); br.set('bp', f * 1.1, 1.4);
      tl.set('lp', 600 + 5000 * x * x, 0.8); tr.set('lp', 600 + 5000 * x * x, 0.8);
    }
    const pf = 110 * Math.pow(2, 2.2 * x * x);
    let tone = 0;
    for (let k = 0; k < 3; k++) { const f = pf * Math.pow(2, dets[k] / 1200); ph[k] += f / SR; if (ph[k] >= 1) ph[k] -= 1; tone += 2 * ph[k] - 1 - blep(ph[k], f / SR); }
    tph += (3 + 13 * x * x) / SR;
    const trem = 0.75 + 0.25 * Math.sin(TAU * tph);
    const fl0 = o.floor ?? 0, e = (fl0 + (1 - fl0) * Math.pow(x, 2.2)) * trem;
    L[n] = vel * e * (1.4 * bl.tick(rng() * 2 - 1) + 0.18 * tl.tick(tone));
    R[n] = vel * e * (1.4 * br.tick(rng() * 2 - 1) + 0.18 * tr.tick(tone));
  }
  fadeEnds(L, 5, 12); fadeEnds(R, 5, 12);
  return [L, R];
}

// the big hit: low boom + short bright crack (mono; reverb does the rest)
// v2: o.part = "boom" | "crack" | (both); boom decay 0.9 -> 0.5 s, 4.5 s buffer with a 200 ms out-fade
export function hit(vel, o = {}, rng = Math.random) {
  const part = o.part ?? 'both', wb = part === 'crack' ? 0 : 1, wc = part === 'boom' ? 0 : 1;
  const len = Math.ceil((part === 'crack' ? 1.0 : 4.5) * SR), out = new Float32Array(len);
  let p1 = 0, p2 = 0;
  const hp = new Biquad('hp', 1800, 0.7), lp = new Biquad('lp', 9000, 0.7), mid = new Biquad('bp', 900, 0.9);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 36 + 50 * Math.exp(-t / 0.09);
    p1 += f / SR; p2 += (f * 1.5) / SR;
    const boom = (Math.sin(TAU * p1) + 0.25 * Math.sin(TAU * p2) * Math.exp(-t / 0.3)) * Math.exp(-t / 0.5) * Math.min(1, t / 0.001);
    const w = rng() * 2 - 1;
    const crack = lp.tick(hp.tick(w)) * Math.exp(-t / 0.018) * 1.4 + mid.tick(w) * Math.exp(-t / 0.05) * 0.8;
    out[n] = vel * (wb * Math.tanh(1.6 * boom) * 0.9 + wc * crack * 0.5);
  }
  return fadeEnds(out, 0, 200);
}

// reversed swell: a bright chord whose envelope grows like a reverse decay, cut at `dur`
export function reverseSwell(dur, freqs, vel, o = {}, rng = Math.random) {
  const len = Math.ceil(dur * SR), L = new Float32Array(len), R = new Float32Array(len);
  const lp = [new Biquad('lp', 2000, 0.7), new Biquad('lp', 2000, 0.7)];
  const comps = [];
  for (const f of freqs) for (const [r, a] of [[1, 1], [2.0, 0.3], [5.93, 0.08]]) comps.push({ f: f * r * (1 + (rng() - 0.5) * 0.004), a, p: rng() * TAU, pan: rng() * 2 - 1 });
  for (let n = 0; n < len; n++) {
    const t = n / SR, x = t / dur, rt = dur - t;
    const e = Math.exp(-rt / (dur * 0.28)) * x;
    if ((n & 63) === 0) { lp[0].set('lp', 1500 + 6000 * x * x, 0.7); lp[1].set('lp', 1500 + 6000 * x * x, 0.7); }
    let l = 0, r = 0;
    for (const c of comps) { const s = c.a * Math.sin(TAU * c.f * t + c.p); l += s * (1 - c.pan) * 0.5; r += s * (1 + c.pan) * 0.5; }
    const nl = rng() * 2 - 1, nr = rng() * 2 - 1;
    L[n] = vel * e * (0.25 * l + 0.25 * lp[0].tick(nl));
    R[n] = vel * e * (0.25 * r + 0.25 * lp[1].tick(nr));
  }
  fadeEnds(L, 10, 6); fadeEnds(R, 10, 6);
  return [L, R];
}

// crash: a struck metal plate — inharmonic square cluster + noise, bright transient, exponential ring (stereo)
export function crash(vel, o = {}, rng = Math.random) {
  const dec = o.decay ?? 1.6, len = Math.ceil(dec * 2.4 * SR), L = new Float32Array(len), R = new Float32Array(len);
  const fr = [233.1, 351.7, 416.3, 587.9, 612.4, 902.2, 1187.5].map((f) => f * 1.9);
  const ph = fr.map(() => rng());
  const hl = [new Biquad('hp', 3200, 0.7), new Biquad('hp', 3200, 0.7)], hr = [new Biquad('hp', 3300, 0.7), new Biquad('hp', 3300, 0.7)];
  const ll = new Biquad('lp', 12500, 0.7), lr = new Biquad('lp', 12500, 0.7);
  const pk = [new Biquad('peak', 6000, 0.8, 3), new Biquad('peak', 6200, 0.8, 3)];
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    let m = 0;
    for (let k = 0; k < fr.length; k++) { ph[k] += fr[k] / SR; if (ph[k] >= 1) ph[k] -= 1; m += ph[k] < 0.5 ? 1 : -1; }
    m /= fr.length;
    const e = Math.min(1, t / 0.0015) * (0.55 * Math.exp(-t / 0.05) + 0.45 * Math.exp(-t / (dec * 0.4)));
    const nl = rng() * 2 - 1, nr = rng() * 2 - 1;
    L[n] = vel * e * pk[0].tick(ll.tick(hl[1].tick(hl[0].tick(0.55 * m + 0.8 * nl))));
    R[n] = vel * e * pk[1].tick(lr.tick(hr[1].tick(hr[0].tick(0.55 * m + 0.8 * nr))));
  }
  fadeEnds(L, 0, 80); fadeEnds(R, 0, 80);
  return [L, R];
}
