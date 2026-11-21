// 《月帷巫女》 trailer — the piece, as data. 100 BPM, 4/4, 42 bars + a ringing tail (bar 43).
// Notation for lines: "D4/1 G4/.5 A4/.5 D5/2 -/.5"  (pitch/beats, "-" = rest, "D3+A3" = chord, "@0.8" = relative velocity)

export const BPM = 100, BEAT = 60 / BPM, BAR = 4 * BEAT, BARS = 42, LENGTH = 43 * BAR; // 103.2 s
export const T = (bar, beat = 0) => Math.round(((bar - 1) * BAR + beat * BEAT) * 1e6) / 1e6;

export const SECTIONS = [
  { id: 'prologue', name: '晨 PROLOGUE', bars: [1, 6] },
  { id: 'world', name: '行 THE WORLD', bars: [7, 16] },
  { id: 'elements', name: '象 THE ELEMENTS', bars: [17, 26] },
  { id: 'battle', name: '战 BATTLE', bars: [27, 36] },
  { id: 'coda', name: '灯 CODA', bars: [37, 43] },
].map((s) => ({ ...s, start: T(s.bars[0]), end: s.id === 'coda' ? LENGTH : T(s.bars[1] + 1) }));

export const CUES = [
  { id: 'bell', what: 'bar 5 downbeat — soft bell', t: T(5) },
  { id: 'theme', what: 'bar 7 downbeat — theme enters', t: T(7) },
  { id: 'pulse', what: 'bar 9 downbeat — hand-drum pulse enters', t: T(9) },
  { id: 'elements', what: 'bar 17 downbeat — elements start', t: T(17) },
  ...[18, 20, 22, 24, 26].map((b, i) => ({ id: 'cell' + 'abcde'[i], what: `cell ${'abcde'[i]} accent — bar ${b} beat 4`, t: T(b, 3) })),
  { id: 'battle', what: 'bar 27 downbeat — battle starts', t: T(27) },
  { id: 'climb', what: 'bar 35 downbeat — climb starts', t: T(35) },
  { id: 'hit', what: 'bar 37 downbeat — THE HIT, then silence', t: T(37) },
  { id: 'title', what: 'bar 39 downbeat — title (music box, after the reversed swell)', t: T(39) },
  { id: 'lastDrum', what: 'bar 41 downbeat — last low drum', t: T(41) },
  { id: 'end', what: 'end of bar 42 — final chord rings into bar 43', t: T(43) },
  { id: 'out', what: 'end of bar 43 — silence', t: LENGTH },
];

// mixer: bus, gain, pan (-1..1), reverb send, koto delay send; `human` = timing/velocity humanised
export const INSTRUMENTS = {
  flute: { bus: 'winds', gain: 0.26, pan: 0.14, send: 0.42 },
  breath: { bus: 'winds', gain: 0.22, pan: 0.14, send: 0.4 },
  koto: { bus: 'plucks', gain: 0.42, pan: -0.38, send: 0.22, delay: 0.1, human: true },
  kotoLead: { bus: 'plucks', gain: 0.85, pan: -0.06, send: 0.24, delay: 0.16, human: true },
  kotoOct: { bus: 'plucks', gain: 0.3, pan: 0.22, send: 0.3, delay: 0.2, human: true },
  shamisen: { bus: 'plucks', gain: 0.55, pan: 0.32, send: 0.16, delay: 0.05, human: true },
  pad: { bus: 'strings', gain: 0.26, pan: 0, send: 0.32 },
  violin: { bus: 'strings', gain: 0.42, pan: -0.2, send: 0.34 },
  cello: { bus: 'strings', gain: 0.2, pan: 0.22, send: 0.26 },
  lowStr: { bus: 'strings', gain: 0.55, pan: 0.08, send: 0.16, human: true },
  bass: { bus: 'bass', gain: 0.12, pan: 0, send: 0 },
  odaiko: { bus: 'drums', gain: 0.25, pan: 0, send: 0.3, human: true },
  taiko: { bus: 'drums', gain: 0.22, pan: -0.18, send: 0.22, human: true },
  taiko2: { bus: 'drums', gain: 0.21, pan: 0.22, send: 0.22, human: true },
  shime: { bus: 'drums', gain: 0.17, pan: 0.36, send: 0.16, human: true },
  rim: { bus: 'drums', gain: 0.13, pan: -0.42, send: 0.14, human: true },
  wood: { bus: 'drums', gain: 0.17, pan: 0.46, send: 0.2, human: true },
  bell: { bus: 'bells', gain: 0.26, pan: 0.18, send: 0.5 },
  rin: { bus: 'bells', gain: 0.1, pan: 0.3, send: 0.45, human: true },
  musicbox: { bus: 'bells', gain: 0.26, pan: -0.1, send: 0.45, human: true },
  airBed: { bus: 'fx', gain: 0.05, pan: 0, send: 0.2 },
  airSwell: { bus: 'fx', gain: 0.11, pan: 0, send: 0.3 },
  cymSwell: { bus: 'fx', gain: 0.10, pan: 0, send: 0.25 },
  riser: { bus: 'fx', gain: 0.16, pan: 0, send: 0.25 },
  hit: { bus: 'fx', gain: 1.0, pan: 0, send: 0.3 }, //        the boom: little reverb (no 36 Hz drone after the hit)
  hitCrack: { bus: 'fx', gain: 1.0, pan: 0, send: 1.1 }, //   the crack: most of the reverb that remains
  crash: { bus: 'fx', gain: 0.13, pan: -0.1, send: 0.3 },
  revSwell: { bus: 'fx', gain: 0.22, pan: 0, send: 0.35 },
};

// reverb / space per bus (the stage): long and dark for winds and bells, short room for drums, very long for the hit
export const BUSES = {
  winds: { rt60: 3.4, damp: 3800, pre: 0.035, size: 1.15, lp: 6000 },
  plucks: { rt60: 2.3, damp: 6500, pre: 0.022, size: 1.0, lp: 9000, comp: { thr: -14, ratio: 3, attack: 0.0008, release: 0.06, makeup: 1.5 }, delay: { time: 0.45, feedback: 0.28, lp: 3200 } },
  strings: { rt60: 2.6, damp: 5000, pre: 0.025, size: 1.05, lp: 8000, eq: [['ls', 110, 0.7, -3]], comp: { thr: -10, ratio: 2.5, attack: 0.004, release: 0.12, makeup: 1 } },
  bass: null,
  drums: { rt60: 1.15, damp: 4500, pre: 0.008, size: 0.7, hp: 220, eq: [['hp', 38, 0.7, 0], ['ls', 90, 0.7, -8], ['peak', 85, 1.0, -3.5], ['peak', 3200, 1, -1.5]], comp: { thr: -16, ratio: 3, attack: 0.003, release: 0.09, makeup: 2 } },
  bells: { rt60: 4.2, damp: 3600, pre: 0.04, size: 1.2, lp: 6500 },
  fx: { rt60: 4.0, damp: 4200, pre: 0.03, size: 1.3, hp: 90, lp: 8000 },
};

// the conductor: overall dynamics (dB) through the piece, applied to the whole mix before the master;
// includes the 'suck-out' just before the hit.
// v2: the battle sits BELOW the hit (−1.5 dB; bars 29–30 drop back to −4 so 31–34 can build again), the climb dips after its downbeat and then grows +4 dB, and a 0.25 s held
// breath (−18 dB) precedes the hit.
export const SUCK = 0.25;
export const DYN = [[0, -5], [T(6), -4.5], [T(7), -3], [T(15), -3], [T(17), 1.0], [T(27) - 0.05, 1.0], [T(27), -1.5], [T(29), -1.5], [T(29) + 0.4, -4.0], [T(31) - 0.15, -4.0], [T(31), -1.5], [T(35) + 0.3, -1.5],
  [T(35) + 0.9, -3.5], [T(37) - SUCK - 0.05, 0], [T(37) - SUCK, -18], [T(37) - 0.0005, -18], [T(37), 1.5], [T(37) + 1.5, 0], [LENGTH, 0]];
// per-bus tail management after the hit: the hit's reverb and drum tails fall away into a quiet bar
export const BUS_DYN = {
  fx: [[0, 0], [T(37) + 0.25, 0], [T(37) + 1.4, -16], [T(38) + 0.5, -16], [T(38) + 1.2, 0], [LENGTH, 0]],
  drums: [[0, 0], [T(37) + 0.25, 0], [T(37) + 1.4, -16], [T(41) - 0.5, -16], [T(41) - 0.05, 0], [LENGTH, 0]],
  strings: [[0, 0], [T(37) + 0.25, 0], [T(37) + 1.4, -16], [T(38) + 0.3, 0], [LENGTH, 0]],
  plucks: [[0, 0], [T(37) + 0.25, 0], [T(37) + 1.4, -16], [T(38) + 0.3, 0], [LENGTH, 0]],
};

// ---------------------------------------------------------------- notation helpers
function parse(str) {
  return str.trim().split(/\s+/).map((tok) => {
    const [p, rest] = tok.split('/');
    const [d, v] = rest.split('@');
    return { pitches: p === '-' ? null : p.split('+'), beats: +d, vel: v ? +v : 1 };
  });
}
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function tr(name, semis) {
  if (!semis) return name;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  const midi = 12 * (+m[3] + 1) + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + semis;
  return NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}
// a line of notes; o: vel, legato (fraction of written length), tr (semitones), opts (instrument options), cresc [v0,v1]
function line(inst, bar, beat, str, o = {}) {
  const toks = parse(str);
  const total = toks.reduce((a, t) => a + t.beats, 0);
  let pos = 0;
  const out = [];
  for (const tok of toks) {
    if (tok.pitches) {
      const x = pos / total;
      const base = o.cresc ? o.cresc[0] + (o.cresc[1] - o.cresc[0]) * x : (o.vel ?? 0.8);
      out.push({ inst, t: T(bar, beat + pos), dur: tok.beats * BEAT * (o.legato ?? 1), notes: tok.pitches.map((p) => tr(p, o.tr)), vel: base * tok.vel, opts: o.opts });
    }
    pos += tok.beats;
  }
  return out;
}
// a flute phrase is one continuous breath
function flute(bar, beat, str, o = {}) {
  const evs = line('flute', bar, beat, str, o);
  const t0 = evs[0].t;
  return [{ inst: 'flute', t: t0, notes: evs.map((e) => ({ t: e.t - t0, dur: e.dur, note: e.notes[0], vel: e.vel })), opts: o.opts }];
}
// drum hits: list of [beat, vel] within a bar
function hits(inst, bar, list, opts) {
  return list.map(([b, v]) => ({ inst, t: T(bar, b), vel: v, opts }));
}
const ev = (inst, t, extra) => ({ inst, t, ...extra });

// ---------------------------------------------------------------- the motif and the theme
// MOTIF (2 bars): a rise by a fourth and two steps to a held top, then a falling answer.
//   D4 – G4 A4 – D5 (held) | Bb4 A4 G4 – A4
export const MOTIF = 'D4/1 G4/.5 A4/.5 D5/2 Bb4/.5 A4/.5 G4/1 A4/1.5 -/.5';
// THEME (8 bars): antecedent (ends open on G over C) + consequent (ends closed on D).
// Kept as an array of bars so that "the second half" is THEME_BARS.slice(4) and can never drift by a token.
export const THEME_BARS = [
  'D4/1 G4/.5 A4/.5 D5/2', //            Dm
  'Bb4/.5 A4/.5 G4/1 F4/1.5 -/.5', //   Bb
  'F4/1 G4/.5 A4/.5 C5/2', //            F/A
  'D5/.5 C5/.5 A4/1 G4/1.5 -/.5', //     C      (open)
  'D4/1 G4/.5 A4/.5 D5/2', //            Dm
  'E5/.5 D5/.5 B4/1 D5/1.5 -/.5', //     G/B    (Dorian brightness)
  'G5/1 E5/.5 D5/.5 C5/1 A4/1', //       C      (the peak: G5, the single top of the theme)
  'A4/.5 G4/.5 E4/1 D4/2', //            Dm     (closed)
];
export const THEME = THEME_BARS.join(' ');
// the same theme in D minor for the battle (B -> Bb, E -> D/F); bar 7 (Bb | C) climbs to G5 on the half-bar hit
export const THEME_MINOR_BARS = [
  'D4/1 G4/.5 A4/.5 D5/2', 'Bb4/.5 A4/.5 G4/1 F4/1.5 -/.5', 'F4/1 G4/.5 A4/.5 C5/2', 'D5/.5 C5/.5 A4/1 G4/1.5 -/.5',
  'D4/1 G4/.5 A4/.5 D5/2', 'D5/.5 C5/.5 Bb4/1 D5/1.5 -/.5', 'F5/1 D5/.5 Bb4/.5 C5/1 G5/1', 'A4/.5 G4/.5 F4/1 D4/2',
];
export const THEME_MINOR = THEME_MINOR_BARS.join(' ');
// sanity: every bar is exactly 4 beats
for (const b of [...THEME_BARS, ...THEME_MINOR_BARS]) {
  const beats = b.split(/\s+/).reduce((a, t) => a + +t.split('/')[1].split('@')[0], 0);
  if (Math.abs(beats - 4) > 1e-9) throw new Error(`theme bar is ${beats} beats: ${b}`);
}

// ---------------------------------------------------------------- the score
export function score() {
  const E = [];
  const add = (...xs) => { for (const x of xs) Array.isArray(x) ? E.push(...x) : E.push(x); };

  // ===== 1. PROLOGUE (bars 1–6) — "in" colour over D; air, a breathy flute stating the motif slowly
  add(ev('airBed', 0, { dur: T(7) + 1.0, vel: 1, opts: { fadeIn: 3, fadeOut: 2.5 } }));
  add(line('koto', 1, 0, 'D3/2 A3/2', { vel: 0.42, opts: { ring: 4 } }));
  add(ev('breath', T(1, 2.9), { dur: 0.7, vel: 0.7 }));
  add(flute(2, 0, 'D4/2 G4/1 A4/1 D5/3 Eb5/.5 D5/.5 Bb4/1 A4/1 G4/2 A4/3', { vel: 0.72 }));
  add(line('koto', 3, 1.5, 'D4/.5 A3/2', { vel: 0.34, opts: { ring: 3 } }));
  add(line('koto', 4, 2, 'Eb4/1 D4/2', { vel: 0.32, opts: { ring: 3 } }));
  add(ev('pad', T(3), { dur: T(7) - T(3) + 0.2, notes: ['D2', 'A2', 'D3'], vel: 0.6, opts: { attack: 4.0, release: 1.4, cutoff: 900 } }));
  add(ev('bell', T(5), { notes: ['D4'], vel: 0.7, cue: true, opts: { decay: 5.5 } }));
  add(ev('breath', T(5, 3.15), { dur: 0.75, vel: 0.6 }));
  add(line('koto', 6, 0, 'G4/1 Eb4/1 D4/2', { vel: 0.44, opts: { ring: 3.5, bend: 30 } }));
  add(ev('airSwell', T(6), { dur: BAR, vel: 1 }));

  // ===== 2. THE WORLD (bars 7–16) — D Dorian, the THEME on koto, strings under it, pulse from bar 9
  const W = [ // chord per bar: bass root, pad voicing, koto arpeggio tones (root, 5th, 8ve, 10th)
    { b: 7, bass: 'D2', pad: ['F3', 'A3', 'D4'], arp: ['D3', 'A3', 'D4', 'F4'] },
    { b: 8, bass: 'Bb1', pad: ['F3', 'Bb3', 'D4'], arp: ['Bb2', 'F3', 'Bb3', 'D4'] },
    { b: 9, bass: 'A1', pad: ['F3', 'A3', 'C4'], arp: ['A2', 'F3', 'A3', 'C4'] },
    { b: 10, bass: 'C2', pad: ['E3', 'G3', 'C4'], arp: ['C3', 'G3', 'C4', 'E4'] },
    { b: 11, bass: 'D2', pad: ['F3', 'A3', 'D4'], arp: ['D3', 'A3', 'D4', 'F4'] },
    { b: 12, bass: 'B1', pad: ['G3', 'B3', 'D4'], arp: ['B2', 'G3', 'B3', 'D4'] },
    { b: 13, bass: 'C2', pad: ['E3', 'G3', 'C4'], arp: ['C3', 'G3', 'C4', 'E4'] },
    { b: 14, bass: 'D2', pad: ['F3', 'A3', 'D4'], arp: ['D3', 'A3', 'D4', 'F4'] },
    { b: 15, bass: 'Bb1', pad: ['F3', 'Bb3', 'D4'], arp: ['Bb2', 'F3', 'Bb3', 'D4'] },
    { b: 16, bass: 'C2', pad: ['E3', 'G3', 'C4'], arp: ['C3', 'G3', 'C4', 'E4'] },
  ];
  add(line('kotoLead', 7, 0, THEME, { vel: 0.9, opts: { bright: 0.58 } }));
  add(line('violin', 11, 0, THEME_BARS.slice(4).join(' '), { vel: 0.42, legato: 0.98, opts: { attack: 0.14, release: 0.5, vib: 10 } }));
  for (const c of W) {
    const pv = c.b <= 8 ? 0.42 : c.b <= 10 ? 0.5 : c.b <= 14 ? 0.445 : 0.56 + 0.06 * (c.b - 15);
    add(ev('pad', T(c.b), { dur: BAR + 0.05, notes: c.pad, vel: pv, opts: { attack: c.b === 7 ? 1.2 : 0.5, release: 0.8, cutoff: 1700 + 120 * (c.b - 7), mud: -5 } }));
    add(ev('cello', T(c.b), { dur: BAR - 0.08, notes: [c.bass.replace(/(\d)$/, (d) => +d + 1)], vel: c.b <= 8 ? 0.4 : 0.5, opts: { attack: 0.25, release: 0.35, cutoff: 1300, voices: 4, vib: 7 } }));
    if (c.b <= 8) {
      add(ev('bass', T(c.b), { dur: BAR - 0.1, notes: [c.bass], vel: 0.6 }));
      add(ev('koto', T(c.b), { notes: [c.arp[0], c.arp[1]], vel: 0.42, opts: { ring: 2.2 } }));
      add(ev('koto', T(c.b, 2), { notes: [c.arp[2]], vel: 0.33, opts: { ring: 2 } }));
    } else {
      add(ev('bass', T(c.b), { dur: 1.5 * BEAT, notes: [c.bass], vel: 0.72 }));
      add(ev('bass', T(c.b, 2.5), { dur: 1.3 * BEAT, notes: [c.bass], vel: 0.6 }));
      const arp = [[0, 0, 0.46], [0.5, 1, 0.3], [1, 2, 0.36], [2, 3, 0.38], [2.5, 2, 0.3], [3.5, 1, 0.28]];
      for (const [bt, i, v] of arp) add(ev('koto', T(c.b, bt), { notes: [c.arp[i]], vel: v, opts: { ring: 1.4, bright: 0.45 } }));
    }
  }
  // hand-drum pulse from bar 9 (cue: downbeat bar 9 not humanised)
  for (let b = 9; b <= 14; b++) {
    add(hits('taiko', b, [[0, b === 9 ? 0.46 : 0.4], [2.5, 0.26]], { pitch: 1.25 }));
    add(hits('shime', b, [[1, 0.3], [3, 0.34]]));
    if (b >= 11) add(hits('rim', b, [[0.5, 0.2], [1.5, 0.16], [2.5, 0.2], [3.5, 0.16]]));
  }
  E.find((e) => e.inst === 'taiko' && e.t === T(9)).cue = true;
  add(hits('taiko', 10, [[3.5, 0.3]], { pitch: 1.25 }));
  add(hits('shime', 12, [[3.25, 0.26], [3.5, 0.32], [3.75, 0.4]]));
  add(hits('shime', 14, [[3, 0.3], [3.25, 0.34], [3.5, 0.4], [3.75, 0.46]]));
  // bars 15–16 lift: rising line, more drums, cymbal and air swell into bar 17
  add(line('violin', 15, 0, 'D4/.5 E4/.5 F4/.5 G4/.5 A4/.5 Bb4/.5 C5/.5 D5/.5 E5/1 F5/1 G5/1.5 -/.5', { cresc: [0.42, 0.72], legato: 0.95, opts: { attack: 0.06, release: 0.3, vib: 8 } }));
  // the lower octave on the cello (the violin's 160 Hz high-pass would remove its fundamental)
  add(line('cello', 15, 0, 'D4/.5 E4/.5 F4/.5 G4/.5 A4/.5 Bb4/.5 C5/.5 D5/.5 E5/1 F5/1 G5/1.5 -/.5', { tr: -12, cresc: [0.5, 0.85], legato: 0.95, opts: { attack: 0.05, release: 0.3, vib: 8, cutoff: 2600, voices: 4 } }));
  add(hits('odaiko', 15, [[0, 0.45]]));
  add(hits('taiko', 15, [[0, 0.5], [1, 0.4], [2, 0.48], [2.5, 0.36], [3, 0.5], [3.5, 0.4]], { pitch: 1.2 }));
  add(hits('shime', 15, [[1, 0.3], [3, 0.34]]));
  add(hits('taiko', 16, [[0, 0.55], [0.5, 0.4], [1, 0.5], [1.5, 0.45], [2, 0.6], [2.5, 0.5], [3, 0.62], [3.25, 0.52], [3.5, 0.6], [3.75, 0.65]], { pitch: 1.15 }));
  add(hits('shime', 16, [[1, 0.32], [2, 0.36], [3, 0.4]]));
  add(ev('cymSwell', T(15), { dur: 2 * BAR, vel: 1 }));
  add(ev('airSwell', T(16), { dur: BAR, vel: 0.85, opts: { f0: 500, f1: 5000 } }));

  // ===== 3. THE ELEMENTS (bars 17–26) — G, plucked ostinato, taiko groove, five 2-bar cells
  const RIFF = { G: 'G3/.5 D4/.5 G4/.5 A4/.25 G4/.25 D4/.5 G3/.5 C4/.5 D4/.5', Em: 'E3/.5 B3/.5 E4/.5 G4/.25 E4/.25 B3/.5 E3/.5 A3/.5 B3/.5', C: 'C3/.5 G3/.5 C4/.5 E4/.25 C4/.25 G3/.5 C3/.5 D3/.5 E3/.5' };
  const COMP = { C: 'C3/.5 G3/.5 C4/.5 G3/.5 E3/.5 G3/.5', D: 'D3/.5 A3/.5 D4/.5 A3/.5 F#3/.5 A3/.5' };
  const STAB = { C: ['C3', 'G3', 'C4'], D: ['D3', 'A3', 'D4'] };
  const PADV = { G: ['G3', 'B3', 'D4'], Em: ['G3', 'B3', 'E4'], C: ['G3', 'C4', 'E4'], D: ['F#3', 'A3', 'D4'] };
  const ROOT = { G: 'G2', Em: 'E2', C: 'C2', D: 'D2' };
  const CELLS = [
    { a: 'G', b: 'C', who: 'flute', ans: 'G4/.25 C5/.25 D5/.5 G5/1 E5/.25 D5/.25 C5/.5', rin: 'G6' }, // fire · wind
    { a: 'G', b: 'C', who: 'kotoLead', ans: 'C5/.5 D5/.5 G5/1 E5/.5 D5/.5', rin: 'E6' }, //               water
    { a: 'Em', b: 'C', who: 'musicbox', ans: 'G5/.5 C6/.5 D6/1 E6/.5 D6/.5', rin: 'G6' }, //              ice
    { a: 'G', b: 'D', who: 'shamisen', ans: 'D4/.5 G4/.25 A4/.25 D5/1 C5/.5 A4/.5', rin: 'A6' }, //       thunder
    { a: 'C', b: 'D', who: 'cello', ans: 'D3/.5 G3/.5 A3/.5 D4/1.5', rin: 'D6' }, //                       earth
  ];
  CELLS.forEach((c, k) => {
    const b1 = 17 + 2 * k, b2 = b1 + 1;
    // call: plucked riff; answer: the motif's rise in a new colour; accent on beat 4 of the second bar
    add(line('shamisen', b1, 0, RIFF[c.a], { vel: 0.62, opts: { t60: 0.55, bright: 0.8, pick: 0.09, buzz: 0.5, ring: 0.42, damp: 0.08 } }));
    add(line('shamisen', b2, 0, COMP[c.b], { vel: 0.42, opts: { t60: 0.5, bright: 0.75, pick: 0.09, buzz: 0.4, ring: 0.35, damp: 0.08 } }));
    if (c.who === 'flute') add(flute(b2, 0, c.ans, { vel: 0.8, opts: { attack: 0.05, vibDelay: 0.25, scoop: 25, breath: 0.2 } }));
    else if (c.who === 'cello') {
      add(line('cello', b2, 0, c.ans, { vel: 0.7, legato: 0.92, opts: { attack: 0.05, release: 0.25, cutoff: 1800, voices: 5, vib: 7 } }));
      add(line('kotoLead', b2, 0, c.ans, { tr: 12, vel: 0.75 }));
    } else if (c.who === 'shamisen') add(line('shamisen', b2, 0, c.ans, { tr: 12, vel: 0.75, opts: { t60: 0.7, bright: 0.85, pick: 0.08, buzz: 0.6, ring: 0.5, damp: 0.08, bend: 25 } }));
    else if (c.who === 'musicbox') add(line('musicbox', b2, 0, c.ans, { vel: 0.55, opts: { kind: 'glass', decay: 2.5 } }));
    else add(line(c.who, b2, 0, c.ans, { vel: 0.85, opts: { bright: 0.62, bend: 20 } }));
    // pads and bass
    add(ev('pad', T(b1), { dur: BAR, notes: PADV[c.a], vel: 0.34, opts: { attack: 0.3, release: 0.5, cutoff: 2000 } }));
    add(ev('pad', T(b2), { dur: 3 * BEAT, notes: PADV[c.b], vel: 0.34, opts: { attack: 0.3, release: 0.4, cutoff: 2000 } }));
    add(ev('bass', T(b1), { dur: BEAT, notes: [ROOT[c.a]], vel: 0.6 }), ev('bass', T(b1, 2.5), { dur: 0.5 * BEAT, notes: [ROOT[c.a]], vel: 0.48 }));
    add(ev('bass', T(b2), { dur: 1.5 * BEAT, notes: [ROOT[c.b]], vel: 0.6 }));
    // groove — one signature per cell: (a) arrival, (b) water: triplet ripple, (c) ice: no taiko, only wood and glass,
    // (e) earth: odaiko on 1 and 3
    add(hits('odaiko', b1, k === 4 ? [[0, 0.6], [2, 0.5]] : k === 2 ? [[0, 0.32]] : [[0, k === 0 ? 0.85 : 0.45]]));
    if (k !== 2) {
      add(hits('taiko', b1, [[0, 0.5], [1.5, 0.32], [2.5, 0.42]], { pitch: 1.12 }));
      add(hits('taiko2', b1, [[3, 0.4]], { pitch: 0.85 }));
    } else {
      add(hits('wood', b1, [[0, 0.42], [1.5, 0.3], [2.5, 0.34], [3, 0.3]], { pitch: 1.35 }));
      for (const [bt, n, v] of [[0.5, 'B6', 0.3], [1.75, 'E6', 0.26], [2.75, 'G6', 0.24], [3.5, 'D6', 0.22]]) add(ev('musicbox', T(b1, bt), { notes: [n], vel: v, opts: { kind: 'glass', decay: 1.6 } }));
    }
    const sh = k === 1 ? [[0, 0.22], [0.5, 0.34], [1, 0.22], [1.5, 0.34], [2, 0.22], [2.5, 0.34], [3, 0.3], [3 + 1 / 3, 0.26], [3 + 2 / 3, 0.32]]
      : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((x, i) => [x, i % 2 ? 0.34 : 0.22]);
    add(hits('shime', b1, sh));
    add(hits('rim', b1, [[1, 0.36], [3, 0.36]]));
    add(hits('wood', b1, [[0.75, 0.4], [2.25, 0.36], [3.5, 0.3]], { pitch: k === 2 ? 1.2 : 1 }));
    if (k === 0) { // the arrival of bar 17: the cymbal swell resolves into a hit, not a drop
      add(ev('shamisen', T(17), { notes: ['G2', 'D3', 'G3'], vel: 0.75, opts: { t60: 0.5, bright: 0.85, pick: 0.08, buzz: 0.5, ring: 0.35, damp: 0.08 } }));
      add(ev('rin', T(17), { notes: ['D7'], vel: 0.55, opts: { kind: 'rin', decay: 2.2 } }));
      add(ev('crash', T(17), { vel: 0.45, opts: { decay: 1.4 } }));
    }
    add(hits('taiko', b2, [[0, 0.48], [1.5, 0.32]], { pitch: 1.12 }));
    add(hits('shime', b2, [0, 0.5, 1, 1.5, 2, 2.5].map((x, i) => [x, i % 2 ? 0.32 : 0.2])));
    add(hits('rim', b2, [[1, 0.34]]));
    // the accent (cue): drums + wood + stab + small bell, then a breath of space
    const at = T(b2, 3);
    add(ev('taiko', at, { vel: 0.85, cue: true }), ev('odaiko', at, { vel: 0.6, cue: true }), ev('wood', at, { vel: 0.75, cue: true, opts: { pitch: 1.12 } }));
    add(ev('shamisen', at, { notes: STAB[c.b], vel: 0.7, cue: true, opts: { t60: 0.4, bright: 0.85, pick: 0.08, buzz: 0.5, ring: 0.3, damp: 0.08 } }));
    add(ev('rin', at, { notes: [c.rin], vel: 0.7, cue: true, opts: { kind: 'rin', decay: 2.2 } }));
    add(ev('bass', at, { dur: 0.5 * BEAT, notes: [ROOT[c.b]], vel: 0.7 }));
  });
  add(hits('taiko', 26, [[3.5, 0.55], [3.75, 0.72]], { pitch: 1.1 })); // fill into the battle

  // ===== 4. BATTLE (bars 27–36) — D minor, theme an octave up in octaves, taiko + low-string ostinato
  // v2: lighter low end (sub −3 dB, ostinato octaves only on the beat, high-passed, pad voiced an octave up), air on top
  // (open violins, rin on the odd downbeats, crash + cymbal swells into 33 and 35), bars 29–30 thinned so 31–34 build again.
  const B = [
    { b: 27, r: 'D', pad: ['F3', 'A3', 'D4'] }, { b: 28, r: 'Bb', pad: ['F3', 'Bb3', 'D4'] },
    { b: 29, r: 'F', pad: ['F3', 'A3', 'C4'] }, { b: 30, r: 'C', pad: ['E3', 'G3', 'C4'] },
    { b: 31, r: 'D', pad: ['F3', 'A3', 'D4'] }, { b: 32, r: 'G', pad: ['G3', 'Bb3', 'D4'] },
  ];
  const LOW = { D: 'D2', Bb: 'Bb1', F: 'F2', C: 'C2', G: 'G1', A: 'A1' };
  const up = (pad) => [pad[1], pad[2], tr(pad[0], 12)]; // first inversion an octave up: out of the 150–300 Hz pile
  const ostinato = (bar, root, beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], scale = 1) => {
    const off = [0, 0, 7, 0, 0, 0, 7, 12], vv = [0.85, 0.5, 0.62, 0.55, 0.78, 0.5, 0.62, 0.58];
    beats.forEach((bt) => {
      const i = Math.round(bt * 2) % 8;
      const n = tr(LOW[root], off[i]);
      add(ev('lowStr', T(bar, bt), { dur: 0.22, notes: i % 2 ? [n] : [n, tr(n, 12)], vel: vv[i] * scale, opts: { stacc: 0.16, release: 0.08, cutoff: 900, envCut: 2.2, voices: 3, hp: 90 } }));
    });
  };
  add(line('violin', 27, 0, THEME_MINOR, { tr: 12, vel: 0.62, legato: 1.0, opts: { attack: 0.08, release: 0.45, vib: 12, cutoff: 5500 } }));
  add(line('violin', 27, 0, THEME_MINOR, { vel: 0.52, legato: 1.0, opts: { attack: 0.08, release: 0.45, vib: 10, cutoff: 4000, pan: 0.3 } }));
  add(line('kotoLead', 27, 0, THEME_MINOR, { vel: 0.9, opts: { bright: 0.62 } }));
  add(flute(31, 0, THEME_MINOR_BARS.slice(4).join(' '), { tr: 12, vel: 0.5, opts: { attack: 0.06, breath: 0.1, vibDelay: 0.25 } }));
  for (const c of B) {
    const thin = c.b === 29 || c.b === 30;
    add(ev('pad', T(c.b), { dur: BAR + 0.05, notes: up(c.pad), vel: 0.45, opts: { attack: 0.2, release: 0.5, cutoff: 2600 } }));
    ostinato(c.b, c.r, undefined, thin ? 0.85 : 1);
    add(ev('bass', T(c.b), { dur: 1.8 * BEAT, notes: [LOW[c.r]], vel: 0.3 }), ev('bass', T(c.b, 2), { dur: 1.8 * BEAT, notes: [LOW[c.r]], vel: 0.24 }));
    add(hits('odaiko', c.b, [[0, c.b === 27 ? 1.0 : 0.62], [2, 0.48]]));
    add(hits('taiko', c.b, [[0, 0.8], [1, 0.62], [1.75, 0.45], [2, 0.7], [3, 0.62], [3.5, 0.45]].map(([x, v]) => [x, thin ? 0.85 * v : v])));
    if (!thin) add(hits('taiko2', c.b, [[0.5, 0.4], [1.5, 0.5], [2.5, 0.42], [3.5, 0.5]], { pitch: 0.82 }));
    add(hits('shime', c.b, thin ? Array.from({ length: 8 }, (_, i) => [i / 2, i % 2 ? 0.3 : 0.24])
      : Array.from({ length: 16 }, (_, i) => [i / 4, i % 4 === 2 ? 0.42 : i % 2 ? 0.16 : 0.26])));
    add(hits('rim', c.b, [[1, 0.42], [3, 0.42]]));
    if (c.b % 2 === 0) add(hits('taiko', c.b, [[3, 0.55], [3.25, 0.62], [3.5, 0.72], [3.75, 0.82]], { pitch: 1.1 }));
  }
  E.find((e) => e.inst === 'odaiko' && e.t === T(27)).cue = true;
  for (const b of [27, 29, 31, 33]) add(ev('rin', T(b), { notes: ['D6'], vel: 0.5, opts: { kind: 'rin', decay: 2.4 } }), ev('rin', T(b) + 0.012, { notes: ['A6'], vel: 0.4, opts: { kind: 'rin', decay: 2.0 } }));
  add(ev('crash', T(27), { vel: 0.75, opts: { decay: 1.8 } }), ev('crash', T(31), { vel: 0.5, opts: { decay: 1.4 } }), ev('crash', T(33), { vel: 0.65, opts: { decay: 1.5 } }));
  add(ev('cymSwell', T(32), { dur: BAR, vel: 0.85 }), ev('cymSwell', T(34), { dur: BAR - 0.3, vel: 1, opts: { tail: 0.05 } }));
  // bars 33–34 tighten: half-bar tutti hits
  const HALF = [[33, 0, 'Bb', ['F3', 'Bb3', 'D4']], [33, 2, 'C', ['E3', 'G3', 'C4']], [34, 0, 'D', ['F3', 'A3', 'D4']], [34, 2, 'D', ['F3', 'A3', 'D4']]];
  for (const [b, bt, r, pad] of HALF) {
    add(ev('pad', T(b, bt), { dur: 2 * BEAT, notes: up(pad), vel: 0.55, opts: { attack: 0.02, release: 0.35, cutoff: 3000 } }));
    add(ev('lowStr', T(b, bt), { dur: 0.5, notes: [LOW[r], tr(LOW[r], 7), tr(LOW[r], 12)], vel: 1.0, opts: { stacc: 0.35, release: 0.15, cutoff: 1100, envCut: 2.5, voices: 4, hp: 45 } }));
    add(ev('odaiko', T(b, bt), { vel: 0.95 }), ev('taiko', T(b, bt), { vel: 0.9 }), ev('taiko2', T(b, bt), { vel: 0.8, opts: { pitch: 0.82 } }));
    add(ev('bass', T(b, bt), { dur: 1.7 * BEAT, notes: [LOW[r]], vel: 0.5 }));
    ostinato(b, r, [bt + 0.5, bt + 1, bt + 1.5], 0.7);
    // the last half-bar's 16ths stop on beat 3.5 so the climb downbeat has air in front of it
    add(hits('shime', b, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75].slice(0, b === 34 && bt === 2 ? 6 : 7).map((x, i) => [bt + x, 0.18 + 0.03 * i])));
  }
  add(hits('taiko', 34, [[3, 0.6], [3.25, 0.7], [3.5, 0.8]], { pitch: 1.1 }));
  // the held lines of bar 34 stop 0.15 s before the climb downbeat (a clean front for the 81.6 cue)
  for (const e of E) {
    if (!['violin', 'flute'].includes(e.inst) || e.t < T(27) || e.t >= T(35)) continue;
    const lim = T(35) - 0.15 - e.t;
    if (e.inst === 'flute') { const last = e.notes[e.notes.length - 1]; if (last.t + last.dur > lim) { last.dur = lim - last.t; e.opts = { ...e.opts, release: 0.1 }; } }
    else if (e.dur > lim) { e.dur = lim; e.opts = { ...e.opts, release: 0.1 }; }
  }
  // bars 35–36: the climb over an A pedal. v2: a real downbeat at 81.6 (odaiko, taiko, low-string stab, crash, rin); then the
  // bed drops back and grows for two bars; everything stops SUCK seconds before the hit — one held breath.
  const C0 = T(35), BREATH = T(37) - SUCK;
  add(ev('odaiko', C0, { vel: 0.95, cue: true }), ev('taiko', C0, { vel: 0.9, cue: true }), ev('taiko2', C0, { vel: 0.75, cue: true, opts: { pitch: 0.82 } }));
  add(ev('lowStr', C0, { dur: 0.45, notes: ['A1', 'A2', 'E3'], vel: 1.0, cue: true, opts: { stacc: 0.3, release: 0.15, cutoff: 1300, envCut: 2.5, voices: 4, hp: 45 } }));
  add(ev('crash', C0, { vel: 0.9, cue: true, opts: { decay: 1.8 } }), ev('rin', C0, { notes: ['A6'], vel: 0.6, cue: true, opts: { kind: 'rin', decay: 2.2 } }));
  const CLIMB = [['A3', 'D4', 'F4', 'A4'], ['Bb3', 'D4', 'F4', 'Bb4'], ['C4', 'E4', 'G4', 'C5'], ['C#4', 'E4', 'G4', 'A4']];
  CLIMB.forEach((ch, i) => add(ev('pad', T(35, 2 * i), { dur: i === 3 ? BREATH - T(35, 6) - 0.03 : 2 * BEAT, notes: ch, vel: 0.5 + 0.12 * i, opts: { attack: i === 0 ? 0.02 : 0.08, release: i === 3 ? 0.03 : 0.2, cutoff: 2400 + 800 * i } })));
  // the motif's rise in sequence; the last half-bar runs up in triplets to a held A5 that stops for the breath
  const climbLine = 'A4/.5 D5/.5 E5/.5 A5/.5 Bb4/.5 Eb5/.5 F5/.5 Bb5/.5 C5/.5 F5/.5 G5/.5 C6/.5 C#5/.33 E5/.33 G5/.34 A5/.56 -/.44';
  add(line('violin', 35, 0, climbLine, { cresc: [0.45, 0.9], legato: 0.92, opts: { attack: 0.03, release: 0.03, vib: 6, cutoff: 5000 } }));
  add(line('violin', 35, 0, climbLine, { tr: -12, cresc: [0.38, 0.8], legato: 0.92, opts: { attack: 0.03, release: 0.03, vib: 6, cutoff: 3600, pan: 0.3 } }));
  for (let i = 1; i < 30; i++) { // A pedal tremolo in the low strings: drops back after the stab, then grows
    const x = i / 30;
    add(ev('lowStr', T(35, i * 0.25), { dur: 0.13, notes: ['A1', 'A2'], vel: 0.28 + 0.62 * x ** 1.5, opts: { stacc: 0.1, release: 0.04, cutoff: 800 + 1000 * x, envCut: 1.5, voices: 3, hp: 45 } }));
  }
  add(ev('bass', C0, { dur: BREATH - C0 - 0.03, notes: ['A1'], vel: 0.7, opts: { release: 0.02 } }));
  { // accelerating, swelling roll — starts soft right after the accent
    let t = C0 + 0.15, k = 0;
    const end = T(37) - 0.3;
    while (t < end) {
      const x = (t - C0) / (end - C0);
      add(ev(k % 2 ? 'taiko2' : 'taiko', t, { vel: 0.15 + 0.7 * x * x, opts: { pitch: k % 2 ? 0.9 : 1.05, decay: 0.6 } }));
      t += 0.15 - 0.09 * x; k++;
    }
    for (let i = 1; i < 4; i++) add(ev('odaiko', T(35, 2 * i), { vel: 0.38 + 0.13 * i }));
    add(hits('shime', 36, Array.from({ length: 29 }, (_, i) => [i / 8, 0.1 + 0.42 * (i / 29)])));
  }
  add(ev('riser', C0, { dur: BREATH - C0 - 0.01, vel: 1, opts: { floor: 0.1 } }));
  // THE HIT (bar 37 downbeat): unison D, boom + crack, then only reverb
  const HIT = T(37);
  add(ev('hit', HIT, { vel: 1, cue: true, opts: { part: 'boom' } }), ev('hitCrack', HIT, { vel: 1, cue: true, opts: { part: 'crack' } }));
  add(ev('crash', HIT, { vel: 1, cue: true, opts: { decay: 1.6 } }));
  add(ev('odaiko', HIT, { vel: 1.2, cue: true, opts: { decay: 1.4 } }), ev('taiko', HIT + 0.006, { vel: 0.8 }), ev('taiko2', HIT + 0.014, { vel: 0.85, opts: { pitch: 0.8 } }));
  add(ev('violin', HIT, { dur: 0.9, notes: ['D4', 'D5', 'D6'], vel: 1.0, cue: true, opts: { stacc: 0.7, release: 0.3, cutoff: 6000, envCut: 1.2, vib: 0, attack: 0.004 } }));
  add(ev('pad', HIT, { dur: 0.9, notes: ['D3', 'A3', 'D4', 'A4', 'D5'], vel: 0.9, cue: true, opts: { stacc: 0.6, release: 0.3, cutoff: 4500, envCut: 1, drift: 0 } }));
  add(ev('lowStr', HIT, { dur: 0.7, notes: ['D1', 'D2', 'D3', 'D4', 'D5'], vel: 1.15, cue: true, opts: { stacc: 0.8, release: 0.3, cutoff: 1800, envCut: 2, voices: 4 } }));
  add(ev('kotoLead', HIT, { notes: ['D4'], vel: 1, cue: true, opts: { bright: 0.8, ring: 1.6 } }));
  add(ev('bass', HIT, { dur: 0.9, notes: ['D2'], vel: 1, opts: { release: 0.6 } }));

  // ===== 5. CODA (bars 37–43) — from the silence: the motif bare on a music box, warm pad, open D at the end
  // v2: about 4 dB quieter and more tender than v1 (music box ×0.65, pad 0.38 → 0.30); the bar-41 odaiko stays at full weight.
  add(ev('airBed', T(38), { dur: LENGTH - T(38), vel: 0.6, opts: { fadeIn: 3, fadeOut: 3 } }));
  add(line('musicbox', 38, 0, MOTIF.replace(/-\/\.5$/, '').replace('A4/1.5', 'A4/2'), { tr: 12, vel: 0.28, opts: { decay: 3 } }));
  add(ev('revSwell', T(39) - 1.8, { dur: 1.8, notes: ['D5', 'A5', 'D6'], vel: 1 }));
  const CP = [[38, ['D3', 'A3', 'D4']], [39, ['D3', 'G3', 'Bb3']], [40, ['D3', 'A3', 'D4']], [41, ['D3', 'G3', 'Bb3']]];
  for (const [b, n] of CP) add(ev('pad', T(b), { dur: BAR + 0.1, notes: n, vel: 0.27, opts: { attack: b === 38 ? 2.0 : 0.9, release: 1.0, cutoff: 1300 } }));
  add(ev('pad', T(42), { dur: LENGTH - T(42) - 1.2, notes: ['D2', 'A2', 'D3', 'A3', 'E4'], vel: 0.35, opts: { attack: 1.0, release: 1.6, cutoff: 1200 } }));
  add(line('koto', 40, 0, 'D4/2 G4/1 A4/1 D5/4', { vel: 0.48, opts: { ring: 3.5, bend: 25 } }));
  add(line('kotoLead', 42, 0, 'D4+A4/4', { vel: 0.48, opts: { ring: 4.5, bright: 0.4 } }));
  add(line('musicbox', 42, 0, 'A5/1.5 G5/.5 A5/2', { vel: 0.27, opts: { decay: 3.5 } }));
  add(ev('musicbox', T(43), { notes: ['E6'], vel: 0.2, opts: { decay: 3 } }));
  add(ev('odaiko', T(41), { vel: 0.62, cue: true, opts: { decay: 1.3 } }));
  add(ev('bass', T(41), { dur: 2 * BAR, notes: ['D2'], vel: 0.38, opts: { attack: 0.3, release: 2.5 } }));
  // the flute leans on Bb4 over the Gm/D pad and resolves to A4 on the bar-42 downbeat (a suspension, not a held major 7th)
  add(ev('flute', T(41, 2), { notes: [{ t: 0, dur: 1.2, note: 'Bb4', vel: 0.36 }, { t: 1.2, dur: 2.2, note: 'A4', vel: 0.38 }, { t: 3.6, dur: 3.2, note: 'E5', vel: 0.3 }], opts: { attack: 0.5, breath: 0.24, release: 1.4, vibDelay: 0.8, vibDepth: 12 } }));

  return E.sort((a, b) => a.t - b.t);
}
