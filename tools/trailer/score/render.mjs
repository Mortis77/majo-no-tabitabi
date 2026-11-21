#!/usr/bin/env node
// Render the 《月帷巫女》 trailer score.
//   node tools/trailer/score/render.mjs [--out file.wav] [--stems] [--stems-dir dir] [--cues cues.json] [--report r.json] [--seed n] [--lufs x]
// Default output: .tmp/trailer/audio/score_v2.wav (+ cues.json next to it; stems in ./stems with --stems).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from './synth.mjs';
import { fdnReverb, pingPong, master, loudness, writeWav, kWeight, busComp } from './mix.mjs';
import { score, INSTRUMENTS, BUSES, SECTIONS, CUES, T, LENGTH, BAR, DYN, BUS_DYN } from './piece.mjs';

const { SR, hz, makeRng } = S;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(opt('--out', join(root, '.tmp/trailer/audio/score_v2.wav')));
const CUES_OUT = resolve(opt('--cues', join(dirname(OUT), 'cues.json')));
const STEMS = args.includes('--stems');
const SEED = +opt('--seed', 20261114);
const TARGET_LUFS = +opt('--lufs', -16.5);
const REPORT = resolve(opt('--report', join(dirname(OUT), 'render-report.json')));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const N = Math.round(LENGTH * SR); // exactly 103.2 s
const rng = makeRng(SEED);

// ---------------------------------------------------------------- events: expand + humanise
let events = score();
const cueTimes = CUES.map((c) => c.t);
const isCueTime = (t) => cueTimes.some((c) => Math.abs(c - t) < 0.002);
const tri = () => rng() + rng() - 1; // triangular in (-1, 1)
const expanded = [];
for (const e of events) {
  const def = INSTRUMENTS[e.inst];
  if (!def) throw new Error('unknown instrument ' + e.inst);
  const x = { ...e };
  if (def.human && !e.cue && !isCueTime(e.t)) { x.t = Math.max(0, e.t + 0.008 * tri()); x.vel = e.vel * (1 + 0.12 * tri()); }
  expanded.push(x);
  // the koto lead carries a brighter, quieter second voice an octave up
  if (e.inst === 'kotoLead' && e.notes) {
    const up = (n) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return m[1] + (+m[2] + 1); };
    expanded.push({ ...x, inst: 'kotoOct', t: x.t + 0.004, notes: e.notes.map(up), vel: x.vel * 0.9, opts: { ...(e.opts || {}), bright: 0.8, t60: 1.5, bend: 0 } });
  }
}
events = expanded.filter((e) => e.t < LENGTH);
log(`${events.length} events`);

// ---------------------------------------------------------------- render instruments
function renderEvent(e, r) {
  const o = e.opts || {};
  const vel = Math.max(0.02, e.vel ?? 0.8);
  switch (e.inst) {
    case 'koto': case 'kotoLead': case 'kotoOct': case 'shamisen': {
      const defaults = e.inst === 'shamisen' ? { t60: 0.6, bright: 0.8, pick: 0.09, buzz: 0.5 } : e.inst === 'kotoOct' ? { t60: 1.5, bright: 0.8 } : { t60: 2.6, bright: 0.5 };
      const ring = o.ring ?? (e.dur ? e.dur + 0.6 : 2);
      const parts = e.notes.map((n, i) => ({ off: Math.round(i * 0.009 * SR), buf: S.pluck(hz(n), e.dur ?? ring, vel, { ...defaults, ...o, ring }, r) }));
      const len = Math.max(...parts.map((p) => p.off + p.buf.length));
      const out = new Float32Array(len);
      for (const p of parts) for (let i = 0; i < p.buf.length; i++) out[p.off + i] += p.buf[i];
      return out;
    }
    case 'flute': return S.flutePhrase(e.notes.map((n) => ({ ...n, f: hz(n.note) })), o, r);
    case 'breath': return S.breathNoise(e.dur, vel, r);
    case 'pad': case 'violin': case 'cello': case 'lowStr': {
      const d = { pad: { voices: 5, detune: 10, spread: 0.85, drift: 0.1 }, violin: { voices: 4, detune: 7, spread: 0.5, attack: 0.1, release: 0.4, cutoff: 3000, hp: 160 }, cello: { voices: 4, detune: 6, spread: 0.4, attack: 0.25, cutoff: 1500 }, lowStr: { voices: 3, detune: 8, spread: 0.5 } }[e.inst];
      return S.strings(e.notes.map(hz), e.dur, vel, { ...d, ...o }, r);
    }
    case 'bass': return S.bass(hz(e.notes[0]), e.dur, vel, o);
    case 'odaiko': case 'taiko': case 'shime': case 'rim': case 'wood': return S.drum(e.inst, vel, o, r);
    case 'taiko2': return S.drum('taiko', vel, { pitch: 0.85, ...o }, r);
    case 'bell': return S.bell(hz(e.notes[0]), vel, { kind: 'temple', ...o }, r);
    case 'rin': return S.bell(hz(e.notes[0]), vel, { kind: 'rin', decay: 2.5, ...o }, r);
    case 'musicbox': return S.bell(hz(e.notes[0]), vel, { kind: 'musicbox', decay: 2.8, len: 4, ...o }, r);
    case 'airBed': return S.airBed(e.dur, vel, o, r);
    case 'airSwell': return S.airSwell(e.dur, vel, o, r);
    case 'cymSwell': return S.cymbalSwell(e.dur, vel, o, r);
    case 'riser': return S.riser(e.dur, vel, o, r);
    case 'hit': case 'hitCrack': return S.hit(vel, o, r);
    case 'crash': return S.crash(vel, o, r);
    case 'revSwell': return S.reverseSwell(e.dur, e.notes.map(hz), vel, o, r);
  }
  throw new Error('no renderer for ' + e.inst);
}

const busNames = Object.keys(BUSES);
const bus = Object.fromEntries(busNames.map((b) => [b, { L: new Float32Array(N), R: new Float32Array(N), sL: new Float32Array(N), sR: new Float32Array(N), dL: new Float32Array(N), dR: new Float32Array(N) }]));
const secOf = (t) => SECTIONS.findIndex((s) => t >= s.start && t < s.end);
const energy = {}; // per instrument, per section: sum of squares (dry, after gain)
for (const e of events) {
  const def = INSTRUMENTS[e.inst];
  const r = makeRng(Math.floor(rng() * 2 ** 31));
  const a = renderEvent(e, r);
  const st = Math.round(e.t * SR);
  const B = bus[def.bus];
  const pan = Math.max(-1, Math.min(1, def.pan + (e.pan ?? 0)));
  const stereo = Array.isArray(a);
  const gl = stereo ? Math.min(1, 1 - pan) : Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const gr = stereo ? Math.min(1, 1 + pan) : Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const g = def.gain, sd = def.send ?? 0, dl = def.delay ?? 0;
  const len = Math.min(stereo ? a[0].length : a.length, N - st);
  const en = (energy[e.inst] ??= SECTIONS.map(() => 0));
  for (let i = 0; i < len; i++) {
    const l = (stereo ? a[0][i] : a[i]) * gl * g, rr = (stereo ? a[1][i] : a[i]) * gr * g;
    const n = st + i;
    B.L[n] += l; B.R[n] += rr;
    if (sd) { B.sL[n] += l * sd; B.sR[n] += rr * sd; }
    if (dl) { B.dL[n] += l * dl; B.dR[n] += rr * dl; }
  }
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) mono[i] = (stereo ? 0.5 * (a[0][i] + a[1][i]) : a[i]) * g;
  const kw = kWeight(mono);
  for (let i = 0; i < len; i++) en[secOf((st + i) / SR)] += kw[i] * kw[i];
}
log('instruments rendered');

// gain curve in dB, linear interpolation between [t, dB] points
function applyCurve(L, R, pts) {
  let k = 0;
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    while (k < pts.length - 2 && t >= pts[k + 1][0]) k++;
    const [ta, da] = pts[k], [tb, db] = pts[k + 1];
    const x = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 1;
    const g = Math.pow(10, (da + (db - da) * x) / 20);
    L[n] *= g; R[n] *= g;
  }
}

// ---------------------------------------------------------------- space: per-bus reverb (+ koto delay)
const stems = {};
for (const b of busNames) {
  const B = bus[b], cfg = BUSES[b];
  const L = Float32Array.from(B.L), R = Float32Array.from(B.R);
  if (cfg) {
    if (cfg.delay) {
      const [dL, dR] = pingPong(B.dL, B.dR, cfg.delay);
      for (let n = 0; n < N; n++) { L[n] += dL[n]; R[n] += dR[n]; B.sL[n] += 0.3 * dL[n]; B.sR[n] += 0.3 * dR[n]; }
    }
    const [wL, wR] = fdnReverb(B.sL, B.sR, cfg);
    for (let n = 0; n < N; n++) { L[n] += wL[n]; R[n] += wR[n]; }
  }
  if (cfg && cfg.eq) for (const [ty, f, q, g] of cfg.eq) { new S.Biquad(ty, f, q, g).run(L); new S.Biquad(ty, f, q, g).run(R); }
  if (cfg && cfg.comp) { let pk = 0; for (let n = 0; n < N; n++) pk = Math.max(pk, Math.abs(L[n]), Math.abs(R[n])); const gr = busComp(L, R, cfg.comp); log(`bus ${b}: peak ${(20 * Math.log10(pk)).toFixed(1)} dBFS, comp max ${gr.toFixed(1)} dB`); }
  if (BUS_DYN[b]) applyCurve(L, R, BUS_DYN[b]);
  applyCurve(L, R, DYN);
  stems[b] = [L, R];
}
log('reverbs done');

// final fade: the last chord rings into bar 43 and is gone by 103.2 s; 5 ms fade-in at the very start
const fade = (L, R) => {
  const f0 = Math.round(101.0 * SR);
  for (let n = f0; n < N; n++) { const x = (n - f0) / (N - f0); const g = Math.cos((Math.PI / 2) * x) ** 2; L[n] *= g; R[n] *= g; }
  for (let n = 0; n < 240; n++) { L[n] *= n / 240; R[n] *= n / 240; }
};
for (const b of busNames) { const [l, r] = stems[b]; const a = Math.round(T(27) * SR), z = Math.round(T(37) * SR); let pk = 0, ss = 0; for (let n = a; n < z; n++) { pk = Math.max(pk, Math.abs(l[n]), Math.abs(r[n])); ss += l[n] * l[n] + r[n] * r[n]; } log(`battle ${b}: peak ${(20 * Math.log10(pk + 1e-9)).toFixed(1)} rms ${(10 * Math.log10(ss / (2 * (z - a)) + 1e-12)).toFixed(1)}`); }
const mixL = new Float32Array(N), mixR = new Float32Array(N);
for (const b of busNames) { fade(...stems[b]); for (let n = 0; n < N; n++) { mixL[n] += stems[b][0][n]; mixR[n] += stems[b][1][n]; } }

// ---------------------------------------------------------------- master (iterate the input gain to the loudness target)
// mastering automation around the hit: the glue compressor opens (+8 dB threshold) and the saturator rounds the first
// 60 ms harder, so the hit's body is not squeezed back down to the battle's level
const H0 = T(37);
const HIT_GLUE = (t) => (t < H0 - 0.3 || t > H0 + 1.2 ? 0 : t < H0 - 0.05 ? 8 * (t - H0 + 0.3) / 0.25 : t < H0 + 0.7 ? 8 : 8 * (1 - (t - H0 - 0.7) / 0.5));
const HIT_SAT = (t) => (t >= H0 && t < H0 + 0.06 ? 0.6 : t >= H0 + 0.06 && t < H0 + 0.1 ? 0.6 + 0.25 * (t - H0 - 0.06) / 0.04 : 0.85);
let gain = 1, res, L, R, lu;
for (let it = 0; it < 4; it++) {
  L = Float32Array.from(mixL); R = Float32Array.from(mixR);
  res = master(L, R, { gain, compOffset: HIT_GLUE, satKneeAt: HIT_SAT });
  lu = loudness(L, R);
  log(`master pass ${it}: gain ${(20 * Math.log10(gain)).toFixed(2)} dB -> I ${lu.I.toFixed(2)} LUFS, LRA ${lu.LRA.toFixed(1)}, comp ${res.compMaxGrDb.toFixed(1)} dB, lim ${res.limMaxGrDb.toFixed(1)} dB`);
  if (Math.abs(lu.I - TARGET_LUFS) < 0.15) break;
  gain *= Math.pow(10, (TARGET_LUFS - lu.I) / 20);
}
mkdirSync(dirname(OUT), { recursive: true });
writeWav(OUT, L, R, 24);
log('wrote ' + OUT);

// ---------------------------------------------------------------- report
const report = { file: OUT, seconds: N / SR, integratedLUFS: +lu.I.toFixed(2), LRA: +lu.LRA.toFixed(1), masterGainDb: +(20 * Math.log10(gain)).toFixed(2), compMaxGrDb: +res.compMaxGrDb.toFixed(2), limiterMaxGrDb: +res.limMaxGrDb.toFixed(2), clippedSamples: res.clipped, sections: {} };
for (const s of SECTIONS) {
  const a = Math.round(s.start * 10), b = Math.max(a + 1, Math.round(s.end * 10) - 30);
  const xs = lu.st.slice(a, b).filter((x) => x > -70).sort((p, q) => p - q);
  let lg = 1; for (let n = Math.round(s.start * SR); n < Math.round(s.end * SR); n++) lg = Math.min(lg, res.lim[n]);
  report.sections[s.id] = { limiterMaxGrDb: +(-20 * Math.log10(lg)).toFixed(2), shortTermMin: +(xs[0] ?? -99).toFixed(1), median: +(xs[xs.length >> 1] ?? -99).toFixed(1), max: +(xs[xs.length - 1] ?? -99).toFixed(1) };
}
// after the hit: momentary loudness 1.0–2.4 s after
const momAfter = lu.mom.slice(Math.round((T(37) + 1.0) * 10), Math.round((T(38) - 0.4) * 10));
report.afterHitMomentaryMax = +Math.max(...momAfter).toFixed(1);
{ const h = Math.round(T(37) * 10); report.hitMomentary = +Math.max(...lu.mom.slice(h - 3, h + 2)).toFixed(1); report.preHitMomentaryMax = +Math.max(...lu.mom.slice(Math.round(T(27) * 10), h - 4)).toFixed(1); }
// the loudest onset: largest rise of 5 ms RMS frames (mono) over the previous 50 ms
{
  const hop = 240, nf = Math.floor(N / hop), rms = new Float64Array(nf);
  for (let f = 0; f < nf; f++) { let s = 0; for (let i = f * hop; i < (f + 1) * hop; i++) { const m = 0.5 * (L[i] + R[i]); s += m * m; } rms[f] = Math.sqrt(s / hop); }
  let best = 0, bf = 0;
  for (let f = 10; f < nf; f++) { let prev = 0; for (let k = 1; k <= 10; k++) prev = Math.max(prev, rms[f - k]); const d = rms[f] - prev; if (d > best) { best = d; bf = f; } }
  report.loudestOnset = { t: +((bf * hop) / SR).toFixed(3), expected: T(37) };
}
report.limiterGrPerBar = Array.from({ length: 43 }, (_, b) => { let lg = 1; for (let n = Math.round(T(b + 1) * SR); n < Math.min(N, Math.round(T(b + 2) * SR)); n++) lg = Math.min(lg, res.lim[n]); return +(-20 * Math.log10(lg)).toFixed(1); }).join(' ');
report.shortTermPerBar = Array.from({ length: 43 }, (_, b) => +(lu.st[Math.max(0, Math.round(T(b + 2) * 10) - 30)] ?? -99).toFixed(1)).join(' ');
// level of each instrument per section (dry, dBFS RMS, before master gain)
report.instrumentLevels = {};
for (const [k, v] of Object.entries(energy)) report.instrumentLevels[k] = Object.fromEntries(SECTIONS.map((s, i) => [s.id, v[i] > 0 ? +(10 * Math.log10(v[i] / ((s.end - s.start) * SR)) + 20 * Math.log10(gain) - 0.691).toFixed(1) : null]));
console.log(JSON.stringify(report, null, 1));
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, JSON.stringify(report, null, 1));

// ---------------------------------------------------------------- cues.json
const cues = {
  piece: '月帷巫女 trailer score', bpm: 100, meter: '4/4', beatSeconds: 0.6, barSeconds: BAR, bars: 42, tailBar: 43, lengthSeconds: LENGTH, sampleRate: SR,
  cues: CUES.map((c) => ({ ...c, t: +c.t.toFixed(3) })),
  sections: SECTIONS.map((s) => ({ id: s.id, name: s.name, bars: s.bars, start: +s.start.toFixed(3), end: +s.end.toFixed(3) })),
  barLines: Array.from({ length: 44 }, (_, i) => ({ bar: i + 1, t: +T(i + 1).toFixed(3) })),
};
writeFileSync(CUES_OUT, JSON.stringify(cues, null, 1));
log('wrote ' + CUES_OUT);

// ---------------------------------------------------------------- stems (pre-master, scaled by the master input gain; sum = master input)
if (STEMS) {
  const dir = resolve(opt('--stems-dir', join(dirname(OUT), 'stems')));
  mkdirSync(dir, { recursive: true });
  for (const b of busNames) {
    const [sl, sr] = stems[b];
    const l = Float32Array.from(sl, (x) => x * gain), r = Float32Array.from(sr, (x) => x * gain);
    let pk = 0; for (let n = 0; n < N; n++) pk = Math.max(pk, Math.abs(l[n]), Math.abs(r[n]));
    writeWav(join(dir, `stem_${b}.wav`), l, r, pk < 0.99 ? 24 : 32);
    log(`stem ${b}: peak ${(20 * Math.log10(pk + 1e-12)).toFixed(1)} dBFS${pk < 0.99 ? '' : ' (float, exceeds 0 dBFS before the master)'}`);
  }
}
