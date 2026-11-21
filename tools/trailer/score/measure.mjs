#!/usr/bin/env node
// Measure a rendered score against the brief: loudness per section, momentary around the climax, cue onsets,
// the breath before the hit, the quiet after it, octave bands, stereo, the tail.
//   node tools/trailer/score/measure.mjs score.wav [cues.json]  -> prints a plain-text report
import { readFileSync } from 'node:fs';
import { Biquad, SR } from './synth.mjs';
import { loudness, truePeakEnvelope } from './mix.mjs';
import { CUES, SECTIONS, T, SUCK } from './piece.mjs';

const file = process.argv[2];
const buf = readFileSync(file);
// minimal WAV reader: PCM 16/24-bit or float 32, stereo
let p = 12, fmt, bits, ch, dataOff, dataLen;
while (p < buf.length) {
  const id = buf.toString('ascii', p, p + 4), sz = buf.readUInt32LE(p + 4);
  if (id === 'fmt ') { fmt = buf.readUInt16LE(p + 8); ch = buf.readUInt16LE(p + 10); bits = buf.readUInt16LE(p + 22); }
  if (id === 'data') { dataOff = p + 8; dataLen = sz; break; }
  p += 8 + sz + (sz & 1);
}
const bps = bits / 8, N = dataLen / (bps * ch);
const L = new Float32Array(N), R = new Float32Array(N);
for (let n = 0; n < N; n++) for (let c = 0; c < 2; c++) {
  const o = dataOff + (n * ch + c) * bps;
  const x = fmt === 3 ? buf.readFloatLE(o) : bits === 24 ? buf.readIntLE(o, 3) / 8388608 : buf.readInt16LE(o) / 32768;
  (c ? R : L)[n] = x;
}
const out = [];
const say = (...a) => out.push(a.join(' '));
const db = (x) => (20 * Math.log10(x + 1e-12)).toFixed(1);
const f1 = (x) => (x > -99 ? x.toFixed(1) : '-inf');
say(`file ${file}`);
say(`format: ${SR} Hz, ${ch} ch, ${bits}-bit, ${N} samples = ${(N / SR).toFixed(4)} s`);

const slice = (a, b) => [L.subarray(Math.round(a * SR), Math.round(b * SR)), R.subarray(Math.round(a * SR), Math.round(b * SR))];
const lu = loudness(L, R);
const tpL = truePeakEnvelope(L), tpR = truePeakEnvelope(R);
const tp = (a, b) => { let m = 0; for (let n = Math.round(a * SR); n < Math.min(N, Math.round(b * SR)); n++) m = Math.max(m, tpL[n], tpR[n]); return m; };
say(`\n== whole: I ${lu.I.toFixed(2)} LUFS, LRA ${lu.LRA.toFixed(1)} LU, true peak ${db(tp(0, N / SR))} dBTP`);
let dc = 0; for (let n = 0; n < N; n++) dc += L[n] + R[n]; say(`DC offset ${(dc / (2 * N)).toExponential(2)}`);

say('\n== sections (I / LRA / true peak / RMS)');
const parts = [...SECTIONS.map((s) => [s.id, s.start, s.end]), ['battle27-34', T(27), T(35)], ['climb35-36', T(35), T(37) - SUCK], ['hit-bar37', T(37), T(38)], ['coda38-43', T(38), T(44)]];
for (const [id, a, b] of parts) {
  const [l, r] = slice(a, b);
  const x = loudness(l, r);
  let ss = 0; for (let i = 0; i < l.length; i++) ss += l[i] * l[i] + r[i] * r[i];
  say(`${id.padEnd(12)} ${a.toFixed(1).padStart(5)}-${b.toFixed(1).padEnd(6)} I ${f1(x.I)}  LRA ${x.LRA.toFixed(1)}  TP ${db(tp(a, b))}  RMS ${db(Math.sqrt(ss / (2 * l.length)))}`);
}

// momentary (400 ms) series: m[k] covers k*0.1 .. k*0.1+0.4
const M = lu.mom, idx = (t) => Math.round(t * 10);
const maxM = (a, b) => { let m = -200, at = 0; for (let k = idx(a); k <= idx(b - 0.4); k++) if (M[k] > m) { m = M[k]; at = k / 10; } return [m, at]; };
say('\n== climax (momentary, 400 ms windows)');
const [mb, tb] = maxM(T(27), T(35)); say(`battle 27-34 max M ${f1(mb)} at ${tb.toFixed(1)}`);
const [mc, tc] = maxM(T(35), T(37) - SUCK); say(`climb 35-36 (to the breath) max M ${f1(mc)} at ${tc.toFixed(1)}`);
const [m0, t0] = maxM(T(35), T(35) + 1.2); const [m1, t1] = maxM(T(35) + 1.0, T(36) + 1.2); const [m2, t2] = maxM(T(36) + 1.0, T(37) - SUCK);
say(`climb shape: first 1.2 s max ${f1(m0)} (${t0}), middle ${f1(m1)} (${t1}), last bar ${f1(m2)} (${t2})`);
const hitM = Math.max(...M.slice(idx(T(37)) - 3, idx(T(37)) + 2));
say(`hit M ${f1(hitM)} -> ${(hitM - Math.max(mb, mc)).toFixed(1)} LU above anything in 27-36`);
const st = lu.st; const stAt = (t) => st[Math.max(0, idx(t) - 30)];
say(`short-term (3 s ending at): T35 ${f1(stAt(T(35)))}, T36 ${f1(stAt(T(36)))}, T37-0.3 ${f1(stAt(T(37) - 0.3))}`);
say('momentary after the hit: ' + [0.5, 1, 1.5, 2, 2.4, 3, 4].map((d) => `+${d}s ${f1(M[idx(T(37) + d)])}`).join(', '));
say(`max M in ${(T(37) + 1).toFixed(1)}-${(T(38) - 0.4 + 0.4).toFixed(1)}: ${f1(maxM(T(37) + 1, T(38))[0])}`);

// the breath before the hit
{
  const rms = (a, b) => { const [l, r] = slice(a, b); let s = 0; for (let i = 0; i < l.length; i++) s += l[i] * l[i] + r[i] * r[i]; return Math.sqrt(s / (2 * l.length)); };
  say(`\n== breath: RMS ${db(rms(T(37) - 0.55, T(37) - SUCK - 0.05))} dBFS in the 0.25 s before it, ${db(rms(T(37) - SUCK + 0.03, T(37) - 0.005))} dBFS inside it (${(T(37) - SUCK).toFixed(2)}-${T(37).toFixed(2)})`);
}

// onsets at cues: 1 ms frames, HF (>1.5 kHz, mid) and full band; rise over the max of the previous 50 ms, search ±80 ms
{
  const mid = new Float32Array(N); for (let n = 0; n < N; n++) mid[n] = 0.5 * (L[n] + R[n]);
  const hf = Float32Array.from(mid); new Biquad('hp', 1500, 0.7).run(hf); new Biquad('hp', 1500, 0.7).run(hf);
  const hop = 48, nf = Math.floor(N / hop);
  const fr = (x) => { const o = new Float64Array(nf); for (let f = 0; f < nf; f++) { let s = 0; for (let i = f * hop; i < (f + 1) * hop; i++) s += x[i] * x[i]; o[f] = Math.sqrt(s / hop); } return o; };
  const H = fr(hf), F = fr(mid);
  const rise = (X, f) => { let pr = 1e-9; for (let k = 1; k <= 50; k++) pr = Math.max(pr, X[f - k] ?? 0); let nx = 0; for (let k = 0; k < 5; k++) nx = Math.max(nx, X[f + k]); return 20 * Math.log10((nx + 1e-9) / pr); };
  say('\n== cue onsets (strongest rise within ±80 ms; 1 ms frames)');
  for (const c of CUES) {
    if (c.id === 'end' || c.id === 'out') continue;
    const f0 = Math.round(c.t * 1000);
    let bh = -99, th = 0, bf = -99, tf = 0;
    for (let f = f0 - 80; f <= f0 + 80; f++) { const h = rise(H, f), q = rise(F, f); if (h > bh) { bh = h; th = f; } if (q > bf) { bf = q; tf = f; } }
    say(`${c.id.padEnd(9)} ${c.t.toFixed(3)}  HF ${(th / 1000).toFixed(3)} (${(th - f0 >= 0 ? '+' : '') + (th - f0)} ms, +${bh.toFixed(1)} dB)  full ${(tf / 1000).toFixed(3)} (${(tf - f0 >= 0 ? '+' : '') + (tf - f0)} ms, +${bf.toFixed(1)} dB)  at-cue HF rise +${rise(H, f0).toFixed(1)} dB`);
  }
  // loudest onset in the piece (5 ms frames, full band)
  let best = 0, bt = 0;
  for (let f = 50; f < nf - 5; f += 1) { const d = F[f] - Math.max(...F.subarray(f - 50, f)); if (d > best) { best = d; bt = f; } }
  say(`largest absolute onset (full band, 1 ms frames): ${(bt / 1000).toFixed(3)} s`);
}

// octave bands per section, mid signal; correlation and side/mid
{
  const edges = [20, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 16000];
  say('\n== bands (mid, dB RMS) ' + edges.slice(0, -1).map((e, i) => `${e}-${edges[i + 1]}`).join(' | ') + ' | corr | side/mid dB');
  const secs = [['prologue', 0, T(7)], ['world', T(7), T(17)], ['elements', T(17), T(27)], ['battle', T(27), T(35)], ['climb', T(35), T(37) - SUCK], ['coda', T(38), T(43)]];
  for (const [id, a, b] of secs) {
    const [l, r] = slice(a, b);
    const m = new Float32Array(l.length), s = new Float32Array(l.length);
    let sll = 0, srr = 0, slr = 0, sm = 0, sss = 0;
    for (let i = 0; i < l.length; i++) { m[i] = 0.5 * (l[i] + r[i]); s[i] = 0.5 * (l[i] - r[i]); sll += l[i] * l[i]; srr += r[i] * r[i]; slr += l[i] * r[i]; sm += m[i] * m[i]; sss += s[i] * s[i]; }
    const row = [];
    for (let k = 0; k < edges.length - 1; k++) {
      const x = Float32Array.from(m);
      for (let j = 0; j < 2; j++) { new Biquad('hp', edges[k], 0.7).run(x); new Biquad('lp', edges[k + 1], 0.7).run(x); }
      let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i];
      row.push(db(Math.sqrt(e / x.length)));
    }
    say(`${id.padEnd(9)} ${row.join(' | ')} | ${(slr / Math.sqrt(sll * srr)).toFixed(2)} | ${(10 * Math.log10(sss / sm)).toFixed(1)}`);
  }
}

// tail
{
  let pk = 0; for (let n = N - Math.round(0.02 * SR); n < N; n++) pk = Math.max(pk, Math.abs(L[n]), Math.abs(R[n]));
  say(`\n== tail: true peak last 100 ms ${db(tp(N / SR - 0.1, N / SR))} dBTP, last 20 ms peak ${db(pk)} dBFS, final samples ${L[N - 1].toExponential(1)} / ${R[N - 1].toExponential(1)}`);
  say('momentary toward the end: ' + [100.8, 101.5, 102.0, 102.5, 102.8].map((t) => `${t}s ${f1(M[idx(t)])}`).join(', '));
}
console.log(out.join('\n'));
