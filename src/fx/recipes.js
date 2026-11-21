// Every named effect of the game: particle specs + the small compositions (flash + sparks + smoke + ring …) that make
// a burst or drive an emitter. Pure data and tiny functions; fx.js supplies the emission helpers through `X`.
//
// Conventions
//   - sizes are metres at scale 1; a burst's "nominal radius" is noted beside it so callers can pick opts.scale
//   - specs marked tint:false never take the caller's colour (smoke, debris); the others do (magic light)
//   - counts are multiplied by X.E.k (opts.count × quality × distance LOD)
import { spec, ctx, GLOW, SOFT, BILLBOARD, STRETCH, FLUTTER, FLAT, AXIS, AIM_DIR, AIM_NORMAL, AIM_OUT, AIM_RING, AIM_SWIRL } from './particles.js';
import { S } from './atlas.js';
import * as THREE from 'three';

const _kp = new THREE.Vector3(), _kg = new THREE.Vector3(), _kd = new THREE.Vector3(), _kn = new THREE.Vector3();

const PI = Math.PI;

/** Signature colour of each element (sRGB hex). */
export const ELEMENT_COLOR = {
  fire: 0xff8a2a, water: 0x58c6ff, ice: 0xaee9ff, wind: 0xb6f5d0, thunder: 0xb98cff, earth: 0xc49a6c, sun: 0xffd27a, moon: 0xa9c4ff, dark: 0x8a3cff,
};

// ---- spec factories ----------------------------------------------------------------------------------------------
const SMOKES = [S.SMOKE_A, S.SMOKE_B, S.SMOKE_C];
const flash = (col, size, life = 0.14, I = 5, o) => spec({ sprite: S.GLOW, col, size, grow: 1.5, life, I: [I, 0], fadeIn: 0, fadeOut: 0, rot: 0, ...o });
const star = (col, size, life = 0.22, I = 4, o) => spec({ sprite: S.STAR4, col, size, grow: [1.6, 2], sc: 2, life, I: [I, 0], fadeIn: 0, fadeOut: 0.2, spin: [0.4, 1.6], ...o });
const sparks = (col, col1, o) => spec({ sprite: S.SPARK, mode: STRETCH, col, col1, size: [0.06, 0.11], stretch: 0.45, aspect: 0.5,
  speed: [4, 11], life: [0.3, 0.7], g: -9, drag: 1.4, I: [6, 2], fadeIn: 0, fadeOut: 0.5, ...o });
const motes = (col, o) => spec({ sprite: S.DOT, col, size: [0.06, 0.12], speed: [0.3, 1.2], up: [0.2, 0.8], life: [0.7, 1.4], drag: 1.5,
  I: [3, 0], flicker: [0.5, 14], turb: [0.15, 2.5], fadeIn: 0.1, fadeOut: 0.5, wind: 0.5, ...o });
const twinkle = (col, o) => spec({ sprite: S.STAR4, col, size: [0.14, 0.3], grow: 0.6, speed: [0.5, 2.5], life: [0.5, 1.1], drag: 2.5,
  I: [4, 0], flicker: [0.85, 22], spin: [0.5, 2], fadeIn: 0.05, fadeOut: 0.5, ...o });
const smoke = (col, col1, o) => spec({ pool: SOFT, sprite: SMOKES, col, col1, tint: false, size: [0.5, 0.9], grow: [2, 2.8], sc: 2,
  speed: [0.4, 1.6], up: [0.6, 1.6], life: [1.0, 1.9], drag: 1.6, I: [0.7, 0.55], spin: [0.15, 0.7], fadeIn: 0.12, fadeOut: 0.35, wind: 0.8, r: 0.25, ...o });
/** Fire that turns into soot: born as light, dies as black smoke. */
const firePuff = (o) => spec({ pool: SOFT, sprite: SMOKES, col: [0xffb050, 0xff8a30, 0xff6a20], col1: [0x1c1614, 0x2a201c], add: [1, 0], cc: 1.5,
  I: [1.7, 0.75], size: [0.6, 1.0], grow: [1.8, 2.6], sc: 2.2, speed: [0.8, 2.6], up: [0.8, 2.0], life: [0.8, 1.4], drag: 2.0,
  spin: [0.3, 1.2], fadeIn: 0.03, fadeOut: 0.45, wind: 0.6, r: 0.3, ...o });
const flameLick = (o) => spec({ sprite: [S.FLAME, S.FLAME_B], col: [0xffd080, 0xffb050], col1: [0xff5a1e, 0xe0401a], cc: 0.7, size: [0.35, 0.6], grow: [0.3, 0.5],
  rot: 0, rotJ: 0.5, up: [1.2, 2.4], speed: [0, 0.4], life: [0.35, 0.7], I: [2.6, 1.2], fadeIn: 0.15, fadeOut: 0.5, r: 0.15, wind: 0.5, turb: [0.05, 5], spin: [0, 0.6], ...o });
const chunks = (col, o) => spec({ pool: SOFT, sprite: [S.CHUNK, S.CHUNK_B], col, tint: false, size: [0.1, 0.28], speed: [4, 10], cone: 1.0, g: -18, drag: 0.4,
  life: [0.8, 1.4], spin: [4, 12], I: 1, fadeIn: 0, fadeOut: 0.8, ...o });
const droplets = (o) => spec({ pool: SOFT, sprite: S.SPARK, mode: STRETCH, col: [0xc8ecff, 0x8fd0ff, 0x6ec0ff], add: [0.45, 0.2], I: [1.6, 1], size: [0.07, 0.13], stretch: 0.3, aspect: 0.6,
  speed: [3, 8], cone: 0.9, g: -15, drag: 0.6, life: [0.5, 1.0], fadeIn: 0, fadeOut: 0.7, ...o });
const shards = (o) => spec({ pool: SOFT, sprite: S.SHARD, col: [0xe6fbff, 0xbfeeff, 0x9fdcff], add: [0.5, 0.3], I: [1.8, 1.2], size: [0.14, 0.32], speed: [4, 10],
  g: -14, drag: 0.8, life: [0.6, 1.1], spin: [3, 10], fadeIn: 0, fadeOut: 0.7, ...o });
const flutter = (sprite, col, o) => spec({ pool: SOFT, sprite, mode: FLUTTER, col, size: [0.14, 0.24], stretch: 5, speed: [1.5, 5], g: -2.2, drag: 1.8,
  life: [1.4, 2.6], spin: [0.8, 3], turb: [0.25, 2.2], wind: 1, I: 1, fadeIn: 0.02, fadeOut: 0.75, ...o });
const pring = (col, size, grow, life, I = 3, o) => spec({ sprite: S.RING, col, size, grow, sc: 2.5, life, I: [I, 0], fadeIn: 0, fadeOut: 0.3, rot: 0, ...o });
const shock = (col, size, grow, life, I = 3, o) => spec({ sprite: S.PUFF_RING, col, size, grow, sc: 2.6, life, I: [I, 0], fadeIn: 0, fadeOut: 0.2, ...o });
const rays = (col, o) => spec({ sprite: S.RAY, mode: AXIS, axisOut: true, col, size: [0.7, 1.3], grow: [1.6, 2.2], sc: 2, aspect: 0.4, life: [0.25, 0.45],
  I: [3.5, 0], fadeIn: 0.05, fadeOut: 0.3, speed: 0, ...o });
const pillar = (col, o) => spec({ sprite: S.RAY, mode: AXIS, col, size: [2.5, 5], grow: 1.5, sc: 2, aspect: 0.22, life: [0.6, 1.0], I: [3, 0], fadeIn: 0.12, fadeOut: 0.35,
  speed: 0, ring: 0.5, disc: true, delay: [0, 0.25], ...o });
const dustCol = [0xc4a882, 0xb39570, 0xd2bc98], dustCol1 = [0x9a8468, 0x8c7860];
const dust = (o) => smoke(dustCol, dustCol1, { I: [0.6, 0.4], size: [0.4, 0.7], grow: [2, 2.6], up: [0.2, 0.8], life: [0.7, 1.3], ...o });
const dustRing = (o) => dust({ aim: AIM_RING, ring: 0.3, r: 0, speed: [2.5, 4.5], up: [0.2, 0.6], drag: 3.5, life: [0.5, 0.9], size: [0.35, 0.55], ...o });
const pebbles = (o) => spec({ pool: SOFT, sprite: S.DISC, col: [0x6f6258, 0x8a7a6a, 0x55504c], tint: false, size: [0.04, 0.08], speed: [3, 9], cone: 1.1, g: -18, drag: 0.5,
  life: [0.6, 1.1], I: 1, fadeIn: 0, fadeOut: 0.8, ...o });

// ---- the specs themselves (built once) -----------------------------------------------------------------------------
const GOLD = [0xffe6a8, 0xffd27a, 0xfff3c4], SILVER = [0xdfe9ff, 0xbcd2ff, 0xf2f6ff], VIOLET = [0xe0ccff, 0xb98cff, 0xc9a0ff];
const P = {
  // sun
  sunFlash: flash(0xffe6a8, 1.1, 0.12, 5), sunStar: star(0xfff3c4, 0.7, 0.22, 4), sunRays: rays(GOLD, { size: [0.5, 0.9] }),
  sunSparks: sparks(0xfff0b8, 0xffb155, { speed: [3, 8], life: [0.25, 0.5], g: -5 }), sunMotes: motes(GOLD),
  // dark
  darkFlash: flash(0xa060ff, 1.2, 0.14, 3),
  darkInk: smoke([0x4a1c8a, 0x5a24a0], [0x0b0718, 0x120a24], { add: [0.35, 0], cc: 0.7, I: [1.2, 0.7], size: [0.4, 0.7], grow: [1.6, 2.1], life: [0.5, 0.9], speed: [0.6, 2], up: [0.1, 0.6] }),
  darkWisp: spec({ pool: SOFT, sprite: S.WISP, col: [0x8a3cff, 0x6a2ad8], col1: [0x1a1030, 0x0b0718], add: [0.6, 0], cc: 0.6, I: [1.6, 0.8], size: [0.5, 0.9], grow: [1.3, 1.8],
    speed: [1, 3], drag: 2.5, life: [0.4, 0.8], spin: [3, 6], fadeIn: 0.05, fadeOut: 0.4, r: 0.2 }),
  darkSparks: sparks(0xff5a9a, 0x8a3cff, { speed: [3, 9], life: [0.25, 0.55], g: -4, I: [5, 1.5] }),
  darkRing: pring(0xb070ff, 1.7, 0.2, 0.26, 3),
  darkMotes: motes([0x8a3cff, 0xb070ff, 0xff5a9a], { I: [2.4, 0] }),
  // fire
  fireFlash: flash(0xff9a40, 1.3, 0.12, 4),
  firePuffS: firePuff({ size: [0.35, 0.6], life: [0.8, 1.3] }),
  fireLick: flameLick(),
  fireSparks: sparks([0xffe0a0, 0xffc060], 0xff4a1a),
  fireEmbers: motes([0xffa040, 0xff7a28, 0xffc870], { g: -1.2, up: [0.6, 1.8], life: [0.9, 1.7], I: [3.5, 0], size: [0.05, 0.09], tint: false }),
  fireSmoke: smoke([0x3a302c, 0x2a2422], [0x1c1818], { delay: [0.08, 0.25], size: [0.5, 0.8], I: [0.65, 0.5] }),
  // water
  waterFlash: flash(0x8fd8ff, 1.1, 0.1, 2.5),
  waterCrown: droplets({ aim: AIM_RING, ring: 0.15, speed: [1.2, 2.8], lift: [3, 5.5] }),
  waterDrops: droplets(),
  waterSpray: spec({ pool: SOFT, sprite: S.DOT, col: [0xffffff, 0xe0f4ff], add: [0.4, 0.1], I: [1, 0.6], size: [0.05, 0.1], speed: [2, 6], cone: 1.1, g: -12, drag: 1.2, life: [0.35, 0.7], fadeIn: 0, fadeOut: 0.6 }),
  waterRipple: spec({ pool: SOFT, sprite: S.PUFF_RING, mode: FLAT, col: 0xf2fbff, add: [0.5, 0.3], I: [0.9, 0], size: 0.5, grow: [4, 5], sc: 2.2, life: [0.45, 0.6], fadeIn: 0, fadeOut: 0.2, h: 0.04, tint: false }),
  waterMist: smoke([0xf2fbff, 0xdff0fa], undefined, { I: [0.38, 0.2], size: [0.4, 0.7], grow: [2, 2.6], life: [0.6, 1.1], up: [0.3, 1.0] }),
  waterBubble: spec({ pool: SOFT, sprite: S.BUBBLE, col: 0xe8f8ff, add: [0.5, 0.5], I: [1.4, 0.8], size: [0.08, 0.16], speed: [0.5, 2], up: [0.5, 1.5], drag: 2, life: [0.5, 0.9], fadeIn: 0.05, fadeOut: 0.7, turb: [0.1, 4] }),
  // ice
  iceFlash: flash(0xd8f6ff, 1.2, 0.12, 4), iceStar: star(0xffffff, 0.9, 0.25, 4),
  iceShards: shards(), iceBits: shards({ size: [0.07, 0.13], speed: [3, 12], life: [0.5, 0.9] }),
  iceGlitter: twinkle([0xffffff, 0xd8f6ff, 0xaee9ff], { g: -1.5, life: [0.6, 1.3], r: 0.5 }),
  iceMist: smoke([0xe8f6ff, 0xd4ecfa], undefined, { I: [0.42, 0.2], size: [0.5, 0.8], grow: [2, 2.6], life: [0.9, 1.5], up: [0.05, 0.3], g: -0.5, speed: [0.5, 1.8] }),
  iceFlakes: spec({ sprite: S.SNOW, col: [0xffffff, 0xd8f6ff], size: [0.16, 0.3], speed: [0.8, 2.5], drag: 2.5, g: -1, life: [0.7, 1.3], spin: [0.5, 2.5], I: [2.6, 0], fadeIn: 0.05, fadeOut: 0.5 }),
  // wind
  windSlash: spec({ sprite: S.SLASH, col: [0xe6fff0, 0xc8f8dc], size: [0.9, 1.4], grow: [1.4, 1.9], sc: 2, life: [0.2, 0.32], I: [2.4, 0], spin: [4, 8], fadeIn: 0.05, fadeOut: 0.3, r: 0.2 }),
  windSpiral: spec({ sprite: S.SPIRAL, col: 0xdcffe8, size: 0.6, grow: 2.6, sc: 2, life: 0.32, I: [2.2, 0], spin: [12, 16], symmetric: false, fadeIn: 0.05, fadeOut: 0.3 }),
  windStreaks: spec({ sprite: S.STREAK, mode: STRETCH, col: [0xf0fff6, 0xc8f8dc], size: [0.1, 0.16], stretch: 0.5, aspect: 0.45, aim: AIM_DIR, cone: 0.75, speed: [8, 16], drag: 5,
    life: [0.2, 0.42], I: [2.6, 0.6], fadeIn: 0.05, fadeOut: 0.4, r: 0.3 }),
  windLeaves: flutter(S.LEAF, [0x8ccf5a, 0xa6dd6a, 0x6fbf4f], { tint: false, speed: [3, 7], life: [0.9, 1.6], size: [0.1, 0.17] }),
  windDust: smoke([0xf2fff6, 0xe0f0e6], undefined, { I: [0.3, 0.12], size: [0.4, 0.7], life: [0.5, 0.9], speed: [1.5, 4], up: [0.1, 0.5], drag: 3 }),
  // thunder
  thFlash: flash(0xb98cff, 0.9, 0.1, 2.5),
  thForks: spec({ sprite: [S.FORK_A, S.FORK_B], col: VIOLET, size: [1.0, 1.7], grow: 1.15, life: [0.1, 0.18], I: [2.2, 1], flicker: [0.8, 80], fadeIn: 0, fadeOut: 0.6, r: 0.15 }),
  thCrackle: spec({ sprite: [S.FORK_A, S.FORK_B], col: VIOLET, size: [0.4, 0.8], life: [0.07, 0.13], I: [3, 1.2], flicker: [0.8, 90], fadeIn: 0, fadeOut: 0.6, r: 0.8, delay: [0.06, 0.4] }),
  thSparks: sparks([0xffffff, 0xd8c0ff], 0x8a5cff, { speed: [7, 15], drag: 3.5, g: -6, life: [0.2, 0.45], I: [4.5, 1.5] }),
  thRing: pring(0xc9a0ff, 0.4, 5.5, 0.22, 3),
  // earth
  earthChunks: chunks([0x8a8791, 0x9b9aa2, 0x7a6a5c, 0x66656f]), earthPebbles: pebbles(),
  earthDust: dust(), earthDustRing: dustRing(),
  earthFlash: flash(0xffe0b0, 0.7, 0.08, 1.5),
  // moon
  moonFlash: flash(0xcfe0ff, 1.3, 0.16, 4), moonRing: pring(0xbcd2ff, 0.3, 6.5, 0.36, 3),
  moonCrescents: spec({ sprite: S.CRESCENT, col: SILVER, col1: 0x7f9cff, size: [0.22, 0.4], speed: [1.2, 3.5], drag: 2.6, spin: [1, 4], life: [0.5, 0.9], I: [3.5, 0], fadeIn: 0.05, fadeOut: 0.5, r: 0.15 }),
  moonMotes: motes(SILVER, { up: [0.1, 0.5], life: [0.8, 1.6] }), moonStars: twinkle(SILVER, { size: [0.12, 0.22] }),
  // purify
  purFlash: flash(0xfff3c4, 2.0, 0.2, 5), purRays: rays(GOLD, { cone: 1.2, size: [0.9, 1.6] }),
  purAsh: spec({ sprite: S.DOT, col: [0x8a3cff, 0x6a2ad8], col1: [0xffd98a, 0xfff3c4], cc: 0.6, tint: false, size: [0.08, 0.14], r: 0.7, speed: [0.3, 1.2], up: [1, 2.5], drag: 1.2, life: [0.8, 1.5],
    I: [2.5, 0], turb: [0.2, 3], fadeIn: 0.1, fadeOut: 0.5, wind: 0.5 }),
  purWisps: spec({ pool: SOFT, sprite: S.WISP, col: [0x2a1050, 0x1a1030], col1: [0x6a4a8a], tint: false, I: [0.85, 0], size: [0.6, 1.0], grow: 1.6, r: 0.5, speed: [0.3, 1], up: [0.8, 1.8],
    drag: 1.5, life: [0.6, 1.1], spin: [2, 4], fadeIn: 0.1, fadeOut: 0.3 }),
  purTwinkle: twinkle(GOLD, { r: 0.8, up: [0.5, 1.5] }),
  // steam
  steamPuff: smoke([0xffffff, 0xf2f6fa], [0xe4ecf2], { I: [0.55, 0.25], size: [0.4, 0.7], grow: [2.4, 3.2], up: [1.6, 3.2], speed: [0.3, 1.2], life: [0.9, 1.6], drag: 1.2 }),
  steamJet: smoke([0xffffff], undefined, { I: [0.5, 0.2], size: [0.2, 0.35], grow: [2, 3], cone: 0.5, speed: [3, 5], up: 0, life: [0.35, 0.6], drag: 2.5, r: 0.1 }),
  steamDrops: droplets({ size: [0.04, 0.07], speed: [2, 5], life: [0.3, 0.6] }),
  // splash
  splCrown: droplets({ aim: AIM_RING, ring: 0.5, speed: [1.5, 3], lift: [5, 8], life: [0.7, 1.2] }),
  splColumn: droplets({ cone: 0.22, speed: [7, 11], life: [0.8, 1.3], size: [0.09, 0.16] }),
  splRipple: spec({ pool: SOFT, sprite: S.PUFF_RING, mode: FLAT, col: 0xf2fbff, add: [0.5, 0.3], I: [0.9, 0], size: 1, grow: [4.5, 5.5], sc: 2.2, life: [0.7, 0.9], fadeIn: 0, fadeOut: 0.2, h: 0.04, tint: false, delay: [0, 0.18] }),
  // wood
  splinters: spec({ pool: SOFT, sprite: S.SPLINTER, col: [0xc49a6c, 0x8b5a3c, 0xa87850], tint: false, size: [0.18, 0.4], speed: [3, 8], cone: 1.2, g: -14, drag: 0.6, life: [0.7, 1.2], spin: [5, 14], I: 1, fadeIn: 0, fadeOut: 0.8 }),
  woodChips: chunks([0xc49a6c, 0xa87850, 0x8b5a3c], { size: [0.06, 0.13], speed: [2, 7] }),
  woodDust: dust({ col: [0xd8c4a0, 0xcbb48c], I: [0.45, 0.25] }),
  // movement
  landRing: dustRing(), landSpecks: pebbles({ speed: [1.5, 4], size: [0.03, 0.06], life: [0.4, 0.7] }),
  jumpPuff: dustRing({ speed: [1, 2], size: [0.25, 0.4], life: [0.4, 0.6], I: [0.45, 0.25] }),
  dashStreaks: spec({ sprite: S.STREAK, mode: STRETCH, col: [0xffffff, 0xfff3c4], size: [0.1, 0.15], stretch: 0.5, aspect: 0.4, aim: AIM_DIR, cone: 0.15, speed: [6, 12], drag: 6, life: [0.2, 0.35],
    I: [2.4, 0], fadeIn: 0.05, fadeOut: 0.3, r: 0.55 }),
  dashMotes: motes([0xffffff, 0xfff3c4], { r: 0.5, life: [0.3, 0.6], I: [2.5, 0] }),
  // pickup / heal / level
  pickStar: star(0xfff3c4, 0.5, 0.25, 4), pickRing: pring(0xffe6a8, 0.2, 7, 0.3, 2.5),
  pickMotes: motes(GOLD, { up: [1, 2.4], r: 0.25, life: [0.5, 1.0] }), pickTwinkle: twinkle(GOLD, { r: 0.3 }),
  healPlus: spec({ sprite: S.PLUS, col: [0x8dffb0, 0xb8ffd0], col1: 0xe8fff0, size: [0.16, 0.26], rot: 0, ring: 0.45, disc: true, h: [0.2, 1.2], up: [0.8, 1.6], life: [0.8, 1.3], I: [3, 0], fadeIn: 0.1, fadeOut: 0.5, delay: [0, 0.3] }),
  healMotes: motes([0x8dffb0, 0xd8ffe0, 0xffffff], { ring: 0.6, h: [0, 0.4], up: [1, 2.2], speed: [0, 0.3], life: [0.7, 1.3], delay: [0, 0.35] }),
  healGlow: flash(0x9dffc0, 1.8, 0.5, 1.4, { h: 0.9 }),
  lvlPillar: pillar(GOLD), lvlMotes: motes(GOLD, { ring: 0.9, h: [0, 0.3], up: [2, 4.5], speed: [0, 0.4], life: [1, 1.8], turb: [0.3, 2.5], delay: [0, 0.5], I: [3.5, 0] }),
  lvlTwinkle: twinkle(GOLD, { r: 1.2, up: [0.5, 2], life: [0.7, 1.4], delay: [0, 0.6] }),
  lvlStars: spec({ sprite: S.STAR5, col: GOLD, size: [0.16, 0.26], speed: [3, 6.5], cone: 1.0, g: -4, drag: 1.2, life: [0.9, 1.5], spin: [2, 6], I: [3.5, 0.5], fadeIn: 0, fadeOut: 0.6, h: 1 }),
  lvlFlash: flash(0xfff3c4, 2.5, 0.3, 5, { h: 1 }),
  // ignite / extinguish
  ignFlash: flash(0xffc060, 0.8, 0.12, 3.5),
  extSmoke: smoke([0x9a9aa0, 0x8a8a92], [0x6a6a72], { I: [0.55, 0.3], up: [1, 2], life: [1.0, 1.7] }),
  extEmbers: motes([0xff7a28, 0xffa040], { I: [2.5, 0], life: [0.3, 0.7], g: -2, tint: false }),
  // explosion (nominal radius 3)
  exCore: flash(0xfff0c0, 5, 0.16, 6, { h: 0.9 }), exGlow: flash(0xffa040, 7, 0.32, 2.5, { h: 0.9 }), exStar: star(0xfff3d0, 2.4, 0.12, 4, { h: 0.9 }),
  exPuffs: firePuff({ r: 0.8, aim: AIM_OUT, bias: 0.4, speed: [2, 5.5], up: [0.3, 1.2], size: [1.1, 1.8], grow: [1.7, 2.3], life: [0.8, 1.3] }),
  exHeart: firePuff({ r: 0.4, speed: [0.3, 1.2], up: [0.8, 1.8], size: [1.6, 2.2], grow: [1.5, 1.9], life: [0.9, 1.4], I: [4, 0.75] }),
  exSparks: sparks([0xfff0c0, 0xffd080], 0xff4a1a, { r: 0.22, aim: AIM_OUT, bias: 0.4, speed: [8, 18], g: -10, drag: 1.2, life: [0.5, 1.0], I: [7, 2], size: [0.07, 0.13] }),
  exEmbers: motes([0xffa040, 0xff7a28, 0xffc870], { r: 0.22, aim: AIM_OUT, bias: 0.4, speed: [2, 7], up: [1, 4], g: -2.5, drag: 1, life: [1.2, 2.2], I: [4, 0], size: [0.05, 0.1], tint: false }),
  exSmoke: smoke([0x2e2826, 0x3a3230], [0x1c1818], { r: 0.9, delay: [0.15, 0.4], size: [1.2, 1.8], grow: [2, 2.4], up: [1.5, 2.6], life: [1.6, 2.6], I: [0.7, 0.5] }),
  exDustRing: dustRing({ ring: 0.8, speed: [5, 8], drag: 3, size: [0.7, 1.1], life: [0.7, 1.1] }),
  exChunks: chunks([0x4a4038, 0x6a5a4c, 0x3a3432], { speed: [6, 14], cone: 1.15, size: [0.12, 0.3] }),
  exColumn: smoke([0x2a2422, 0x383030], [0x161212], { r: 1.2, delay: [0.3, 0.9], size: [1.6, 2.4], grow: [1.8, 2.2], up: [2.2, 3.6], speed: [0.2, 0.8], life: [2.4, 3.6], I: [0.75, 0.5] }),
  // generic
  sparkFlash: flash(0xfff3d0, 0.5, 0.08, 4), sparkBits: sparks([0xfff0c0, 0xffffff], 0xffa040, { speed: [3, 9], life: [0.2, 0.45], size: [0.05, 0.08] }),
  leaves: flutter(S.LEAF, [0x6fbf4f, 0xa6dd6a, 0x5fae48, 0x8ccf5a], { cone: 1.3, speed: [2, 5.5] }),
  petals: flutter(S.PETAL, [0xffc1d6, 0xffe4ee, 0xff9dbd], { cone: 1.3, size: [0.1, 0.17], g: -1.6, life: [1.6, 3] }),
  feathers: flutter(S.FEATHER, [0xffffff, 0xf2f6ff], { cone: 1.3, size: [0.18, 0.3], g: -1.4, stretch: 3, life: [1.6, 3] }),
  featherMotes: motes([0xffffff, 0xfff3c4], { r: 0.3 }),
  // magic circle / summon / charge
  mcRunes: spec({ sprite: [S.RUNE_A, S.RUNE_B, S.RUNE_C, S.RUNE_D], col: GOLD, size: [0.28, 0.4], rot: 0, rotJ: 0.3, ring: 1.6, h: [0.1, 0.4], up: [0.5, 1.2], life: [0.9, 1.5], I: [2.6, 0],
    fadeIn: 0.15, fadeOut: 0.5, delay: [0, 0.7], speed: 0 }),
  mcMotes: motes(GOLD, { ring: 1.9, h: [0, 0.2], up: [0.6, 1.8], speed: [0, 0.2], life: [0.8, 1.5], delay: [0, 0.9] }),
  sumPaper: flutter(S.PAPER, [0xffffff, 0xfff8e6], { tint: false, aim: AIM_SWIRL, ring: 1.0, speed: [2, 3.5], up: [2, 4], g: -1.5, life: [1, 1.6], size: [0.2, 0.3], stretch: 7 }),
  sumPoof: smoke([0xffffff, 0xf4f0ff], undefined, { aim: AIM_RING, ring: 0.3, r: 0, speed: [2, 3.5], up: [0.2, 0.8], drag: 2.5, I: [0.6, 0.3], size: [0.5, 0.8], life: [0.6, 1.0] }),
  sumPillar: pillar(0xffffff, { size: [1.8, 3.2], life: [0.4, 0.7], delay: [0, 0.15] }),
  sumStar: star(0xffffff, 1.2, 0.25, 5, { h: 0.9 }), sumTwinkle: twinkle([0xffffff, 0xfff3c4], { r: 1, h: 0.8 }),
  cdRing: pring(0xffffff, 2.2, 0.1, 0.22, 3), cdStar: star(0xffffff, 0.3, 0.2, 6, { grow: [4, 5] }), cdTwinkle: twinkle([0xffffff], { r: 0.2, speed: [1.5, 4] }),
  // lanterns
  lanGlow: flash(0xffb155, 1.6, 0.5, 2.2), lanSparks: sparks([0xffe2a8, 0xffb155], 0xff7a28, { cone: 0.6, speed: [1.5, 4], g: -2, life: [0.5, 1.0], I: [5, 1] }),
  lanMotes: motes([0xffe2a8, 0xffb155], { up: [0.8, 2], r: 0.3, life: [0.9, 1.6] }), lanRing: pring(0xffc880, 0.3, 6, 0.35, 2.5),
  glFlash: flash(0xfff3c4, 10, 0.35, 7), glStar: star(0xfff3c4, 5, 0.3, 5),
  glPillar: pillar(GOLD, { size: [8, 16], aspect: 0.16, ring: 1.2, life: [1.0, 1.8], delay: [0, 0.6], I: [3.5, 0] }),
  glRise: spec({ sprite: S.GLOW, col: GOLD, size: [2.5, 4], ring: 0.8, disc: true, up: [6, 12], life: [0.8, 1.4], I: [2, 0], fadeIn: 0.1, fadeOut: 0.3, delay: [0, 0.5], rot: 0 }),
  glMotes: motes(GOLD, { ring: 3, disc: true, h: [0, 1], up: [1.5, 5], speed: [0, 0.6], life: [2, 3.5], turb: [0.6, 1.6], delay: [0, 1.0], I: [3.5, 0], size: [0.08, 0.16] }),
  glTwinkle: twinkle(GOLD, { r: 5, h: 3, life: [0.8, 1.8], delay: [0, 1.2] }),
  glPetals: spec({ sprite: S.PETAL, mode: FLUTTER, col: GOLD, size: [0.2, 0.34], stretch: 5, cone: 1.2, speed: [3, 8], g: -1.2, drag: 1.4, life: [2, 3.2], spin: [0.8, 3], turb: [0.4, 2], wind: 1, I: [3, 0],
    fadeIn: 0.05, fadeOut: 0.6, h: 2 }),
  // meteor
  metPuff: firePuff({ size: [1.2, 1.8], speed: [0.3, 1], up: [0, 0.4], life: [0.6, 1.0], r: 0.5 }),
  metSparks: sparks([0xfff0c0, 0xffd080], 0xff4a1a, { speed: [2, 6], g: -6, life: [0.4, 0.8] }),
  metSmoke: smoke([0x3a302c, 0x2a2422], [0x1c1818], { size: [1.3, 1.8], grow: [1.8, 2.2], up: [0.2, 0.8], life: [1.4, 2.2], r: 0.5, delay: [0.1, 0.2] }),
  metFlash: flash(0xffd080, 2.4, 0.12, 4),
  crChunks: chunks([0x4a4038, 0x6a5a4c, 0x8a8791, 0x3a3432], { size: [0.3, 0.8], speed: [9, 22], cone: 1.1, life: [1.2, 2.0], r: 2 }),
  crWall: dust({ aim: AIM_RING, ring: 2, r: 0, speed: [9, 15], up: [0.5, 2], drag: 2.2, size: [2, 3], grow: [1.8, 2.2], life: [1.4, 2.2], I: [0.7, 0.4] }),
  crEmbers: motes([0xffa040, 0xff7a28, 0xffc870], { speed: [6, 16], cone: 1.0, up: [2, 6], g: -6, drag: 0.8, life: [1.5, 2.6], I: [4.5, 0], size: [0.07, 0.13], tint: false, r: 2 }),
  // boss death
  bdWisps: spec({ pool: SOFT, sprite: S.WISP, col: [0x8a3cff, 0x6a2ad8], col1: [0x1a1030, 0x0b0718], add: [0.6, 0], cc: 0.5, I: [1.6, 0.8], size: [1.0, 1.8], grow: 1.7, r: 2, speed: [0.5, 2],
    up: [0.8, 2.4], drag: 1.5, life: [0.7, 1.3], spin: [2, 5], fadeIn: 0.1, fadeOut: 0.4, delay: [0, 1.7], tint: false }),
  bdInk: smoke([0x2a1050, 0x341463], [0x0b0718], { r: 2, I: [0.9, 0.6], size: [0.9, 1.5], grow: [1.6, 2.1], life: [0.8, 1.4], up: [0.6, 1.8], delay: [0, 1.7] }),
  bdMotes: motes([0x8a3cff, 0xff5a9a, 0xb070ff], { r: 2.2, up: [1, 3], life: [0.8, 1.6], delay: [0, 1.7], I: [3, 0], tint: false }),
  bdFlash: flash(0xfff3e0, 12, 0.3, 9), bdStar: star(0xfff3e0, 7, 0.3, 6),
  bdRays: rays([0xfff3c4, 0xffd98a, 0xdcc4ff], { size: [4, 8], life: [0.5, 0.9], I: [4, 0] }),
  bdSparks: sparks([0xdcc4ff, 0xb070ff], 0xffd98a, { speed: [8, 20], g: -5, drag: 1.6, life: [0.6, 1.2], I: [7, 2], tint: false }),
  bdRise: motes(GOLD, { r: 3, up: [0.6, 2.2], speed: [0.2, 1.5], life: [2, 3.5], turb: [0.5, 1.5], I: [3.5, 0], size: [0.08, 0.16], delay: [0, 0.4], tint: false }),
  bdShock: shock(0xffffff, 1.5, 12, 0.5, 3.5),
  // clash
  clFlash: flash(0xffffff, 2.4, 0.1, 8, { tint: false }), clStar: star(0xffffff, 1, 0.16, 6, { grow: [2.6, 3.2], tint: false }),
  clShock: shock(0xffffff, 0.6, 7.5, 0.28, 3, { tint: false }),
  clSparks: sparks(0xfff0c0, undefined, { speed: [6, 15], g: -6, drag: 2, life: [0.3, 0.7], I: [7, 2] }),
  clMotes: motes([0xffffff, 0xfff3c4], { r: 0.4, speed: [1, 3] }),
  clForks: spec({ sprite: [S.FORK_A, S.FORK_B], col: 0xffffff, size: [2.5, 4], grow: 1.2, life: [0.12, 0.22], I: [6, 2], flicker: [0.8, 80], fadeIn: 0, fadeOut: 0.6, r: 0.5, tint: false, delay: [0, 0.12] }),
  clEnergy: spec({ sprite: SMOKES, col: 0xffffff, size: [1.2, 2], grow: [1.8, 2.3], sc: 2, r: 1, aim: AIM_OUT, speed: [3, 7], drag: 2.5, life: [0.4, 0.8], I: [2.4, 0], spin: [0.5, 2], fadeIn: 0.02, fadeOut: 0.3 }),

  // ---- emitters ----
  eFlame: flameLick({ size: [0.35, 0.55], up: [1.0, 1.8], life: [0.45, 0.8], r: 0.12, I: [2.4, 1.1] }),
  eFlameCore: spec({ sprite: S.GLOW, col: [0xfff3c4, 0xffe08a], col1: 0xffa040, size: [0.45, 0.65], grow: 0.6, up: [0.5, 1.0], life: [0.25, 0.4], I: [1.5, 0.5], fadeIn: 0.2, fadeOut: 0.4, r: 0.06, h: 0.12, rot: 0 }),
  eFlameEmber: motes([0xffa040, 0xffc870, 0xff7a28], { tint: false, up: [1, 2.5], speed: [0.1, 0.5], turb: [0.2, 3], life: [0.8, 1.6], I: [3.5, 0], size: [0.04, 0.07], r: 0.15, h: [0.3, 0.8] }),
  eFlameSmoke: smoke([0x3a3432, 0x4a4442], [0x2a2626], { I: [0.3, 0.18], size: [0.3, 0.45], grow: [2.2, 3], up: [1.5, 2.5], life: [1.5, 2.5], r: 0.1, h: [0.8, 1.2], speed: [0, 0.3] }),
  eSmoke: smoke([0x6a6a70, 0x5c5c62], [0x9a9aa0], { tint: true, size: [0.4, 0.7], grow: [2.5, 3.5], up: [1.2, 2.2], life: [2.2, 3.6], I: [0.55, 0.3], wind: 1, r: 0.15, speed: [0, 0.4], fadeOut: 0.3 }),
  eEmbers: motes([0xffa040, 0xff7a28, 0xffc870], { r: 0.5, up: [0.6, 2.2], speed: [0.1, 0.6], turb: [0.3, 2.2], life: [1.2, 2.4], I: [3.8, 0], size: [0.05, 0.09], flicker: [0.6, 11] }),
  eRain: spec({ pool: SOFT, sprite: S.STREAK, mode: STRETCH, col: [0xcfe6ff, 0xe0f0ff], add: [0.45, 0.45], I: [0.95, 0.95], size: 0.15, aspect: 0.32, stretch: 0.34, ring: 18, disc: true, h: [9, 14], up: [-19, -15],
    speed: 0, life: [0.6, 0.85], fadeIn: 0.08, fadeOut: 0.9, tint: false }),
  eRainSplash: spec({ pool: SOFT, sprite: S.PUFF_RING, mode: FLAT, col: 0xf2fbff, add: [0.5, 0.3], I: [0.75, 0], size: 0.1, grow: [4, 6], sc: 2, life: [0.25, 0.38], fadeIn: 0, fadeOut: 0.2, h: 0.04, tint: false }),
  eRainHop: droplets({ size: [0.03, 0.05], speed: [1, 2.2], cone: 0.7, life: [0.2, 0.35], tint: false }),
  eRainMist: smoke([0xd8e6f0, 0xc8d8e4], undefined, { I: [0.09, 0.05], ring: 16, disc: true, r: 0, h: [0.2, 1.5], size: [1.5, 2.5], grow: [1.5, 2], speed: [0.1, 0.5], up: [0, 0.2], life: [2, 3.2], fadeIn: 0.3 }),
  eSnow: spec({ pool: SOFT, sprite: [S.SNOW, S.DOT, S.DOT], col: [0xffffff, 0xf0f6ff], add: [0.3, 0.3], I: [0.95, 0.95], size: [0.05, 0.11], ring: 14, disc: true, h: [5, 9], up: [-1.4, -0.9], speed: [0, 0.3],
    g: -1.2, drag: 1, wind: 1, turb: [0.35, 1.2], life: [5, 7], spin: [0.5, 2], fadeIn: 0.08, fadeOut: 0.85, tint: false }),
  eFirefly: spec({ sprite: S.GLOW, col: [0xd8ff6a, 0xfff08a, 0xb6ff8a], size: [0.26, 0.4], ring: 6, disc: true, h: [0.3, 2.2], speed: [0.05, 0.3], turb: [0.6, 0.7], life: [5, 8], I: [3.2, 3.2],
    flicker: [0.92, 2.4], fadeIn: 0.12, fadeOut: 0.85, wind: 0.3, drag: 0.6, rot: 0 }),
  eSpore: spec({ sprite: S.DOT, col: [0x6ff3ff, 0xb48cff, 0xff8fd8, 0x3de0c0], size: [0.06, 0.11], ring: 5, disc: true, h: [0, 0.5], up: [0.15, 0.45], speed: [0, 0.15], turb: [0.25, 0.9], life: [5, 8],
    I: [2.8, 2], flicker: [0.35, 2.2], fadeIn: 0.12, fadeOut: 0.75, wind: 0.6, drag: 0.5 }),
  ePollen: spec({ sprite: S.DOT, col: [0xfff3c0, 0xffe9a0], size: [0.035, 0.06], ring: 8, disc: true, h: [0.2, 3], speed: [0.05, 0.3], turb: [0.4, 0.6], life: [5, 8], I: [1.2, 1], fadeIn: 0.15, fadeOut: 0.8,
    wind: 1, drag: 1, g: -0.05 }),
  eMaple: flutter(S.MAPLE, [0xe5632b, 0xc23a25, 0xf08a3a], { ring: 6, disc: true, h: [3, 7], speed: [0, 0.5], cone: PI, g: -1.3, drag: 1.7, life: [5, 8], size: [0.2, 0.32], stretch: 2.6, turb: [0.45, 1.1], spin: [0.3, 1.4], fadeIn: 0.06, fadeOut: 0.9 }),
  eGinkgo: flutter(S.GINKGO, [0xf2b632, 0xf6c84a, 0xe0a020], { ring: 6, disc: true, h: [3, 7], speed: [0, 0.5], cone: PI, g: -1.2, drag: 1.7, life: [5, 8], size: [0.18, 0.28], stretch: 3, turb: [0.45, 1.1], spin: [0.3, 1.4], fadeIn: 0.06, fadeOut: 0.9 }),
  eBroomStar: twinkle([0xfff3c4, 0xffd98a, 0xffffff], { size: [0.1, 0.22], life: [0.5, 1.0], inherit: 0.15, g: -1.2, drag: 1.5, speed: [0.2, 1], r: 0.12, I: [4, 0] }),
  eBroomDot: motes([0xffd98a, 0xfff3c4], { size: [0.05, 0.09], life: [0.4, 0.8], inherit: 0.1, r: 0.15, speed: [0.1, 0.6], up: [-0.3, 0.3], I: [3, 0] }),
  eWingDot: motes([0xfff8e0, 0xffe6a8, 0xffffff], { size: [0.04, 0.09], r: 0.5, inherit: 0.3, g: -0.6, up: 0, speed: [0.05, 0.4], life: [0.6, 1.2], I: [2.6, 0] }),
  eWingStar: twinkle([0xfff8e0, 0xffffff], { size: [0.08, 0.16], r: 0.5, inherit: 0.3, speed: [0.1, 0.5], life: [0.5, 0.9] }),
  eWingFeather: spec({ sprite: S.FEATHER, mode: FLUTTER, col: [0xfff8e0, 0xffe6a8], size: [0.16, 0.24], stretch: 3, r: 0.5, inherit: 0.25, g: -1, drag: 1.5, life: [1, 1.6], spin: [0.5, 2], turb: [0.3, 2], I: [2.2, 0],
    fadeIn: 0.05, fadeOut: 0.5, wind: 1 }),
  // auras (around a body: ring .5, height 1.7)
  aFire: flameLick({ ring: 0.5, r: 0, h: [0, 0.7], size: [0.22, 0.36], up: [0.9, 1.6], life: [0.35, 0.6], I: [2.2, 1] }),
  aFireEmber: motes([0xffa040, 0xffc870], { ring: 0.5, h: [0.2, 1.4], up: [0.8, 2], life: [0.6, 1.2], I: [3.2, 0], size: [0.04, 0.07] }),
  aWaterBubble: spec({ pool: SOFT, sprite: S.BUBBLE, col: [0xbfe9ff, 0xe8f8ff], add: [0.55, 0.55], I: [1.5, 0.8], size: [0.08, 0.15], ring: 0.55, h: [0, 0.8], up: [0.5, 1.1], speed: 0, turb: [0.12, 3], life: [0.8, 1.4], fadeIn: 0.1, fadeOut: 0.7 }),
  aWaterDrop: droplets({ ring: 0.55, h: [0.6, 1.7], speed: [0, 0.4], up: [0.2, 1], cone: PI, g: -7, life: [0.5, 0.8], size: [0.05, 0.08] }),
  aWaterRipple: spec({ pool: SOFT, sprite: S.PUFF_RING, mode: FLAT, col: 0xbfe9ff, add: [0.6, 0.4], I: [0.9, 0], size: 0.4, grow: [3.5, 4.5], sc: 2, life: [0.7, 1.0], fadeIn: 0, fadeOut: 0.2, h: 0.05 }),
  aIceFlake: spec({ sprite: S.SNOW, col: [0xffffff, 0xd8f6ff], size: [0.12, 0.2], ring: 0.7, h: [0.5, 1.9], up: [-0.6, -0.2], speed: [0, 0.2], turb: [0.15, 1.5], spin: [0.4, 1.6], life: [0.9, 1.5], I: [2.4, 0], fadeIn: 0.15, fadeOut: 0.5 }),
  aIceTwinkle: twinkle([0xffffff, 0xaee9ff], { ring: 0.6, h: [0.1, 1.7], speed: [0, 0.3], size: [0.1, 0.18], life: [0.4, 0.9] }),
  aIceMist: smoke([0xe8f6ff], undefined, { tint: true, I: [0.3, 0.1], ring: 0.5, r: 0, h: [0, 0.2], size: [0.4, 0.6], grow: [1.6, 2], speed: [0.2, 0.6], up: [0, 0.1], life: [0.9, 1.4] }),
  aWindStreak: spec({ sprite: S.STREAK, mode: STRETCH, col: [0xf0fff6, 0xc8f8dc], size: [0.09, 0.13], stretch: 0.5, aspect: 0.4, aim: AIM_SWIRL, ring: 0.65, h: [0.1, 1.6], speed: [3.5, 5.5], up: [0.3, 1.2], drag: 2.5,
    life: [0.25, 0.4], I: [2.2, 0], fadeIn: 0.2, fadeOut: 0.4 }),
  aWindLeaf: flutter(S.LEAF, [0x8ccf5a, 0xa6dd6a], { tint: false, aim: AIM_SWIRL, ring: 0.7, h: [0, 0.8], speed: [2.5, 4], up: [0.8, 1.8], g: -0.6, life: [0.8, 1.3], size: [0.08, 0.13] }),
  aThFork: spec({ sprite: [S.FORK_A, S.FORK_B], col: VIOLET, size: [0.4, 0.8], life: [0.08, 0.14], I: [5, 2], flicker: [0.8, 90], fadeIn: 0, fadeOut: 0.6, ring: 0.5, h: [0.2, 1.6] }),
  aThSpark: sparks([0xffffff, 0xe6d8ff], 0x8a5cff, { ring: 0.5, h: [0.1, 1.6], speed: [1, 3.5], g: -3, life: [0.15, 0.35], size: [0.04, 0.07], I: [6, 1] }),
  aEarthBit: spec({ pool: SOFT, sprite: [S.CHUNK, S.CHUNK_B], col: [0x8a8791, 0x9b8a78, 0x7a6a5c], size: [0.06, 0.13], ring: 0.6, h: [0, 0.3], up: [0.5, 1.1], speed: 0, drag: 0.8, spin: [1, 4], life: [0.8, 1.3],
    I: 1, fadeIn: 0.1, fadeOut: 0.6, tint: false }),
  aEarthDust: dust({ ring: 0.5, r: 0, h: [0, 0.15], size: [0.25, 0.4], I: [0.35, 0.15], speed: [0.2, 0.6], up: [0.1, 0.4], life: [0.7, 1.1] }),
  aSunMote: motes(GOLD, { ring: 0.55, h: [0, 1.2], up: [0.6, 1.5], speed: [0, 0.2], life: [0.7, 1.3] }),
  aSunRay: spec({ sprite: S.RAY, mode: AXIS, col: GOLD, size: [0.5, 0.9], grow: 1.5, aspect: 0.3, ring: 0.45, h: [0, 0.3], life: [0.4, 0.7], I: [1.8, 0], fadeIn: 0.2, fadeOut: 0.4, speed: 0 }),
  aSunTwinkle: twinkle(GOLD, { ring: 0.6, h: [0.2, 1.7], speed: [0, 0.3], size: [0.1, 0.18] }),
  aMoonCrescent: spec({ sprite: S.CRESCENT, col: SILVER, size: [0.1, 0.18], ring: 0.6, h: [0.1, 1.5], up: [0.3, 0.8], speed: 0, spin: [0.6, 2], turb: [0.1, 2], life: [0.9, 1.5], I: [3, 0], fadeIn: 0.15, fadeOut: 0.5 }),
  aMoonMote: motes(SILVER, { ring: 0.6, h: [0, 1.6], up: [0.15, 0.6], speed: [0, 0.15], life: [0.9, 1.6], size: [0.04, 0.08] }),
  aMoonRing: spec({ sprite: S.RING, mode: FLAT, col: 0xbcd2ff, size: 0.5, grow: [3, 3.6], sc: 2, life: [0.9, 1.2], I: [1.8, 0], fadeIn: 0.1, fadeOut: 0.3, h: 0.06 }),
  aDarkWisp: spec({ pool: SOFT, sprite: S.WISP, col: [0x8a3cff, 0x6a2ad8], col1: [0x1a1030, 0x0b0718], add: [0.55, 0], cc: 0.6, I: [1.4, 0.8], size: [0.35, 0.6], grow: 1.5, ring: 0.5, h: [0, 1.2], up: [0.5, 1.2],
    speed: 0, spin: [2, 4], life: [0.6, 1.0], fadeIn: 0.15, fadeOut: 0.4 }),
  aDarkMote: motes([0x8a3cff, 0xff5a9a], { ring: 0.55, h: [0, 1.5], up: [0.3, 0.9], life: [0.7, 1.2], I: [2.4, 0], size: [0.04, 0.08] }),
  // environment columns
  eUpStreak: spec({ sprite: S.STREAK, mode: STRETCH, col: [0xf0fff6, 0xffffff, 0xd8f8e4], size: [0.12, 0.2], stretch: 0.22, aspect: 0.35, aim: AIM_SWIRL, ring: 5, disc: true, h: [0, 4], speed: [1.5, 3.5], up: [9, 15],
    life: [0.7, 1.1], I: [1.3, 0], fadeIn: 0.25, fadeOut: 0.5 }),
  eUpLeaf: flutter(S.LEAF, [0x8ccf5a, 0xa6dd6a, 0xd8c060], { tint: false, aim: AIM_SWIRL, ring: 4, disc: true, h: [0, 2], speed: [2, 4], up: [5, 9], g: 0, drag: 0.3, life: [1.0, 1.6], size: [0.1, 0.16] }),
  eUpDust: dust({ ring: 4, disc: true, r: 0, h: [0, 0.3], I: [0.3, 0.1], aim: AIM_SWIRL, speed: [1.5, 3], up: [0.8, 2.2], life: [0.9, 1.4], size: [0.5, 0.8] }),
  eFallMist: smoke([0xffffff, 0xeaf4fa], undefined, { tint: true, I: [0.32, 0.12], ring: 3, disc: true, r: 0, h: [0, 0.8], aim: AIM_RING, size: [1.2, 2], grow: [1.8, 2.3], speed: [0.5, 1.5], up: [0.3, 1], life: [2, 3.5], fadeIn: 0.25 }),
  eFallSpray: droplets({ ring: 2.4, disc: true, h: [0, 0.3], cone: 0.8, speed: [2, 5], size: [0.04, 0.08], life: [0.4, 0.8], tint: false }),
  eFallRipple: spec({ pool: SOFT, sprite: S.PUFF_RING, mode: FLAT, col: 0xf2fbff, add: [0.5, 0.3], I: [0.7, 0], size: 0.5, grow: [4, 6], sc: 2, life: [0.8, 1.2], fadeIn: 0, fadeOut: 0.2, ring: 3, disc: true, h: 0.05, tint: false }),
  eMiasma: smoke([0x241040, 0x2e1452], [0x120a24], { tint: true, I: [0.62, 0.3], ring: 6, disc: true, r: 0, h: [0, 1.2], size: [1.4, 2.4], grow: [1.5, 1.8], speed: [0.2, 0.6], up: [0.05, 0.3], life: [3.5, 5.5], fadeIn: 0.3,
    fadeOut: 0.5, wind: 0.5, turb: [0.4, 0.3] }),
  eMiasmaGlint: motes([0x8a3cff, 0xb070ff, 0xff5a9a], { ring: 6, disc: true, h: [0.1, 1.6], up: [0.1, 0.5], speed: [0, 0.2], life: [1.5, 2.6], I: [2.2, 0], flicker: [0.6, 5], tint: false }),
  eMiasmaWisp: spec({ pool: SOFT, sprite: S.WISP, col: [0x6a2ad8, 0x4a1a9a], col1: 0x120a24, add: [0.4, 0], I: [1.1, 0.6], size: [0.8, 1.4], grow: 1.5, ring: 5, disc: true, h: [0.2, 1.4], up: [0.2, 0.6], speed: 0, spin: [1, 2.5],
    life: [1.4, 2.2], fadeIn: 0.2, fadeOut: 0.4, tint: false }),
  // extras
  // final-duel: the clash body is fx.magic's painted two-colour mass; these sprites only sparkle (no white blow-out)
  cbCore: spec({ sprite: S.GLOW, col: 0xfff6e0, size: [1.2, 1.7], life: [0.1, 0.16], I: [1.6, 0.6], fadeIn: 0.1, fadeOut: 0.4, tint: false, rot: 0 }),
  cbHalo: spec({ sprite: S.GLOW, col: 0xffe6a8, size: [3, 4], life: [0.16, 0.24], I: [0.7, 0.15], fadeIn: 0.15, fadeOut: 0.4, rot: 0 }),
  cbStar: star(0xffffff, 1.6, 0.12, 2.2, { grow: [1.3, 1.8] }),
  cbSparks: sparks(0xfff0c0, undefined, { aim: AIM_RING, ring: 0.3, speed: [6, 14], g: -4, drag: 2.2, life: [0.25, 0.55], I: [7, 2] }),
  cbForks: spec({ sprite: [S.FORK_A, S.FORK_B], col: 0xffffff, size: [1.2, 2.2], life: [0.07, 0.13], I: [2.6, 1], flicker: [0.8, 80], fadeIn: 0, fadeOut: 0.6, r: 0.5 }),
  cbShock: shock(0xffffff, 0.5, 7, 0.25, 1.2),
  // struggle pushes: sparks thrown sideways off the clash in both colours; the remains that fall after a break
  ssSparks: sparks(0xffffff, undefined, { aim: AIM_RING, ring: 0.2, speed: [8, 18], g: -8, drag: 1.7, life: [0.35, 0.7], I: [3.2, 0.8], size: [0.07, 0.13] }),
  rmMote: motes(0xffffff, { r: 2.6, h: [0.5, 3.5], up: [-0.6, 0.4], speed: [0.2, 1.2], g: -1.6, life: [1.8, 3.2], I: [2.6, 0], size: [0.06, 0.12], delay: [0, 1.4], turb: [0.3, 1.6] }),
  rmDrop: sparks(0xffffff, undefined, { r: 2.4, h: [1.5, 4], speed: [0.5, 2.5], up: [-1, 0], g: -11, drag: 0.4, life: [0.6, 1.1], I: [1.8, 0.6], size: [0.05, 0.09], delay: [0, 1.0] }),
  chMotes: spec({ sprite: S.DOT, col: 0xffe6a8, size: [0.07, 0.13], grow: 0.4, r: 1.6, shell: true, aim: AIM_OUT, speed: [-3.4, -2.6], life: [0.42, 0.55], I: [1.2, 5], fadeIn: 0.25, fadeOut: 0.9 }),
  chStreak: spec({ sprite: S.STREAK, mode: STRETCH, col: 0xffe6a8, size: [0.08, 0.12], stretch: 0.5, aspect: 0.4, r: 1.8, shell: true, aim: AIM_OUT, speed: [-4.2, -3.2], life: [0.4, 0.5], I: [1, 4], fadeIn: 0.3, fadeOut: 0.9 }),
  chRing: pring(0xffe6a8, 2.4, 0.1, 0.4, 0, { I: [0.3, 3], fadeOut: 0.85 }),
  chGlow: spec({ sprite: S.GLOW, col: 0xffe6a8, size: [0.7, 1], life: [0.12, 0.2], I: [2, 1], fadeIn: 0.2, fadeOut: 0.4, rot: 0 }),
  // beams
  bmMote: motes([0xffffff, 0xfff3c4], { size: [0.06, 0.12], speed: [0.5, 2], up: [0, 0.6], life: [0.3, 0.7], I: [3.5, 0], r: 0.2, tint: true }),
  bmEndGlow: spec({ sprite: S.GLOW, col: 0xffffff, size: [1.6, 2.3], life: [0.08, 0.14], I: [4.5, 1.5], fadeIn: 0.1, fadeOut: 0.4, tint: false, rot: 0 }),
  bmEndStar: star(0xffffff, 1.2, 0.1, 3.5, { grow: [1.4, 1.9], tint: false }),
  bmEndSparks: sparks(0xfff0c0, undefined, { cone: 1.25, speed: [5, 13], g: -6, drag: 2, life: [0.25, 0.55], I: [7, 2] }),
  bmStartGlow: spec({ sprite: S.GLOW, col: 0xffffff, size: [0.9, 1.3], life: [0.08, 0.13], I: [3.5, 1.5], fadeIn: 0.1, fadeOut: 0.4, tint: false, rot: 0 }),
  // lightning strike point
  ltSparks: sparks([0xffffff, 0xe6d8ff], 0x8a5cff, { cone: 1.2, speed: [5, 12], drag: 3, g: -8, life: [0.2, 0.45], I: [7, 2] }),
  ltGlow: flash(0xe6d8ff, 2.2, 0.14, 6),
};

/** Build the recipe tables. X = { E, p(spec,n), q(spec,ratePerSec), ring(), disc(), sigil(), light(), shake(), later(), arc(), ground(x,z) }. */
export function makeRecipes(X) {
  const { E, p, q } = X;
  const B = {}, EM = {};
  const C = (def) => (E.color >= 0 ? E.color : def);        // caller's colour or the recipe's own
  const groundOnly = () => E.grounded;
  // mesh-shape layer (kit.js): the 'shape' of an impact — tongues, crowns, crystals, petals … — on top of the particles.
  // Skipped far away / at very low k so distant fights cost nothing extra.
  const kit = () => (X.K && E.dist < 150 && E.k > 0.1 ? X.K : null);
  const KP = () => _kp.set(ctx.x, ctx.y, ctx.z);
  const KG = () => _kg.set(ctx.x, X.ground(ctx.x, ctx.z, ctx.y) + 0.05, ctx.z);
  const KD = () => _kd.set(ctx.dx, ctx.dy, ctx.dz);
  const KN = () => _kn.set(ctx.nx, ctx.ny, ctx.nz);
  const near = () => Math.abs(ctx.y - X.ground(ctx.x, ctx.z, ctx.y)) < 1.6 * Math.max(1, E.scale);

  // ---- elemental hits (nominal radius 1) ---------------------------------------------------------------------------
  B.hit_sun = () => {
    p(P.sunFlash, 1); p(P.sunStar, 1); p(P.sunRays, 5); p(P.sunSparks, 8); p(P.sunMotes, 5);
    X.light(C(0xffd27a), 30, 0.18, 8);
    const K = kit(); if (K) { const sc = E.scale; K.petals(KP(), 1.1 * sc, { up: KN(), n: 8, dur: 0.5 }); K.shock(KP(), 1.5 * sc, 0xffd27a, { up: KN(), dur: 0.35, width: 0.18 });
      if (near()) K.glyphs(KG(), 1.4 * sc, 0xffc24a, { dur: 0.9, I: 1.6 }); }
  };
  B.hit_dark = () => {
    p(P.darkFlash, 1); p(P.darkInk, 5); p(P.darkWisp, 6); p(P.darkSparks, 7); p(P.darkRing, 1); p(P.darkMotes, 4);
    X.light(C(0x8a3cff), 25, 0.2, 8);
  };
  B.hit_fire = () => {
    p(P.fireEmbers, 5); p(P.fireSparks, 3); p(P.fireSmoke, 1);
    X.light(C(0xff8a3a), 32, 0.22, 8);
    const K = kit(); if (K) {
      X.combustion?.bloom(KP(), KN(), E.scale * 0.64, false);
      if (near()) K.mark(KG(), 0.75 * E.scale, 'scorch', 5);
    }
  };
  B.hit_water = () => {
    p(P.waterFlash, 1); p(P.waterCrown, 18); p(P.waterDrops, 8); p(P.waterSpray, 6); p(P.waterRipple, 1); p(P.waterMist, 3); p(P.waterBubble, 3);
    const K = kit(); if (K) { const sc = E.scale; if (near()) { const g = KG(); K.crown(g, 1.0 * sc, { dur: 0.55 }); K.mark(g, 1.3 * sc, 'wet', 6); } else K.sheet(KP(), KD(), 0.9 * sc, { dur: 0.4 });
      K.shock(KP(), 1.1 * sc, 0x9fe0ff, { up: KN(), dur: 0.3, width: 0.35, add: 0.4 }); }
  };
  B.hit_ice = () => {
    p(P.iceStar, 1); p(P.iceShards, 5); p(P.iceGlitter, 4); p(P.iceMist, 2); p(P.iceFlakes, 2);
    X.light(C(0xaee9ff), 30, 0.2, 8);
    const K = kit(); if (K) { const sc = E.scale; const g = near() ? KG() : KP(); K.frostBloom(g,.60*sc,1.12*sc,{dur:1.06});
      if (near()) { K.coldMist(g, 1.6 * sc); K.mark(g, 1.4 * sc, 'frost', 7); } }
  };
  B.hit_wind = () => {
    p(P.windSlash, 2.5); p(P.windSpiral, 1); p(P.windStreaks, 10); p(P.windLeaves, 4); p(P.windDust, 3);
    const K = kit(); if (K) K.strokes(KP(), KD(), 1.3 * E.scale, 3, { dur: 0.45 });
  };
  B.hit_thunder = () => {
    p(P.thFlash, 1); p(P.thCrackle, 1); p(P.thSparks, 9);
    X.arc(3, 1.5, C(0xc9a0ff), 0.16);
    X.light(C(0xb98cff), 60, 0.2, 12);
    const K = kit(); if (K) { const sc = E.scale; K.shock(KP(), .95 * sc, 0xbda1ff, { up: KN(), dur: 0.18, width: 0.09, I: 1.35 });
      if (near()) { const g = KG(); K.shock(g, 2.2 * sc, 0xb98cff, { dur: 0.4, width: 0.12, I: 2.2 }); K.mark(g, 0.9 * sc, 'scorch', 5); } }
  };
  B.hit_earth = () => {
    p(P.earthFlash, 1); p(P.earthChunks, 8); p(P.earthPebbles, 8); p(P.earthDust, 6); p(P.earthDustRing, 6);
    const K = kit(); if (K) { const sc = E.scale; const g = near() ? KG() : KP(); K.shards(g, 4, 0.6 * sc, 0.9 * sc, { dur: 1.0 });
      if (near()) { K.dustSkirt(g, 1.4 * sc, { dur: 1.3, h: 0.9 * sc }); K.mark(g, 1.2 * sc, 'crack', 6); } }
  };
  B.hit_moon = () => {
    p(P.moonFlash, 1); p(P.moonRing, 1); p(P.moonCrescents, 6); p(P.moonMotes, 8); p(P.moonStars, 2);
    X.light(C(0xa9c4ff), 30, 0.22, 8);
    const K = kit(); if (K) { const sc = E.scale; K.crescents(KP(), 1.0 * sc, { n: 2, dir: KD(), dur: 0.5 }); K.mirrors(KP(), 3, 1.2 * sc, { dur: 0.9 }); }
  };

  // ---- reactions ----------------------------------------------------------------------------------------------------
  B.purify = () => {   // radius 1.5
    p(P.purFlash, 1); p(P.purRays, 10); p(P.purAsh, 12); p(P.purWisps, 6); p(P.purTwinkle, 8);
    if (groundOnly()) X.ring(2.4, C(0xffd98a), 0.5);
    X.light(C(0xffd98a), 50, 0.3, 10);
    const K = kit(); if (K) { const sc = E.scale; K.petals(KP(), 1.6 * sc, { n: 10, dur: 0.7, col: 0xffe39a }); if (near()) K.glyphs(KG(), 2.2 * sc, 0xffd98a, { dur: 1.2 }); }
  };
  B.steam = () => {
    p(P.steamPuff, 8); p(P.steamJet, 4); p(P.steamDrops, 6);
    const K = kit(); if (K) K.smoke(KP(), 0.9 * E.scale, { n: 3, dur: 1.6, rise: 2.4, dark: 0xd8e2ea });
  };
  B.splash = () => {   // radius 2, on a water surface
    p(P.splCrown, 22); p(P.splColumn, 10); p(P.waterSpray, 14); p(P.splRipple, 2); p(P.waterMist, 5); p(P.waterBubble, 4);
    const K = kit(); if (K) K.crown(KP(), 1.6 * E.scale, { dur: 0.7 });
  };
  B.shatter_ice = () => {   // radius 1.5
    p(P.iceStar, 1); p(P.iceShards, 10); p(P.iceBits, 5); p(P.iceGlitter, 6); p(P.iceMist, 1);   // big: less white mist
    X.light(C(0xaee9ff), 60, 0.25, 12);
    const K = kit(); if (K) { const sc = E.scale; K.frostBloom(near()?KG():KP(),1.08*sc,1.90*sc,{dur:1.14}); K.shock(KP(), 1.25 * sc, 0x94cbdc, { up: KN(), dur: 0.23, I:.64 }); K.coldMist(KP(), 1.1 * sc, { dur: .75 }); }
  };
  B.shatter_rock = () => {   // radius 1.8
    p(P.earthFlash, 1); p(P.earthChunks, 16); p(P.earthPebbles, 10);
    ctx.scale *= 1.5; p(P.earthDust, 9); p(P.earthDustRing, 8); ctx.scale /= 1.5;
    X.shake(0.15, 0.25);
    const K = kit(); if (K) { const sc = E.scale; K.shards(KP(), 5, 0.9 * sc, 1.0 * sc, { dur: 0.8 }); if (near()) K.dustSkirt(KG(), 2.0 * sc, { dur: 1.5, h: 1.2 * sc }); }
  };
  B.wood_break = () => { p(P.splinters, 12); p(P.woodChips, 6); p(P.woodDust, 5); };
  B.dust = () => { p(P.earthDust, 6); p(P.earthPebbles, 3); };
  B.land = () => { p(P.landRing, 10); p(P.landSpecks, 5); };
  B.jump = () => { p(P.jumpPuff, 5); p(P.landSpecks, 2); };
  B.dash = () => { p(P.dashStreaks, 10); p(P.dashMotes, 6); if (groundOnly()) p(P.jumpPuff, 4); };
  B.pickup = () => { p(P.pickStar, 1); p(P.pickRing, 1); p(P.pickMotes, 8); p(P.pickTwinkle, 4); };
  B.heal = () => {
    p(P.healGlow, 1); p(P.healPlus, 7); p(P.healMotes, 12);
    if (groundOnly()) X.disc(1.5, C(0x8dffb0), 0.8, 1.2);
  };
  B.levelup = () => {
    p(P.lvlFlash, 1); p(P.lvlPillar, 14); p(P.lvlMotes, 24); p(P.lvlTwinkle, 12); p(P.lvlStars, 8);
    X.sigil(2, C(0xffd98a), 1.4, 2);
    X.ring(4.5, C(0xffd98a), 0.7); X.ring(6.5, C(0xfff3c4), 0.9, 0.22);
    X.light(C(0xffd98a), 90, 0.5, 16);
  };
  B.ignite = () => {
    p(P.ignFlash, 1); p(P.fireEmbers, 3); p(P.fireSparks, 3);
    X.light(C(0xff8a3a), 25, 0.2, 7);
    if (kit()) X.combustion?.bloom(KP(), KN(), 0.32 * E.scale, false);
  };
  B.extinguish = () => { p(P.extSmoke, 6); p(P.steamPuff, 3); p(P.extEmbers, 4); };

  // ---- explosions ---------------------------------------------------------------------------------------------------
  const thermalBlast = (sc, big) => {
    const K = kit(), P0 = KP(), normal = KN();
    if (K) {
      X.combustion?.bloom(P0, normal, sc * 1.42, big);
      X.combustion?.impactTrails(P0, normal, sc * 1.55, 0xff771e, big ? 12 : 8);
      K.shock(P0, sc * 2.4, 0xffa04a, { up: normal, dur: 0.28, width: 0.055, I: 0.8, add: 0.22 });
      X.combustion?.soot(P0, normal, sc * 1.13, big);
      if (near()) K.mark(KG(), 1.05 * sc, 'scorch', big ? 9 : 6);
    }
    p(P.exEmbers, big ? 17 : 9); p(P.exSparks, big ? 9 : 5);
    if (groundOnly()) p(P.exDustRing, big ? 6 : 3);
    if (big && E.dist < 45) X.hitstop(0.06);
  };
  const thermal = () => E.color < 0 || E.color === ELEMENT_COLOR.fire;
  const blast = (rings) => {
    p(P.exCore, 1); p(P.exGlow, 1); p(P.exStar, 1); p(P.exHeart, 5); p(P.exPuffs, 14); p(P.exSparks, 22); p(P.exEmbers, 10); p(P.exSmoke, 6);
    if (groundOnly()) {
      p(P.exDustRing, 10);
      if (rings) { X.ring(4.5, C(0xffa040), 0.45); X.disc(4, C(0xff8a3a), 0.5, 1.6); }
    }
  };
  const kitBlast = (sc, big) => {
    const K = kit(); if (!K) return;
    const P0 = KP(), col = C(0xff6a14);
    K.fireball(P0, 1.1 * sc, { dur: big ? 0.8 : 0.55, I: 1.6 });
    K.dome(P0, 2.6 * sc, col === 0xff6a14 ? 0xffc890 : col, { dur: 0.45, I: 1.3, add: 0.6 });
    K.shock(P0, 3.4 * sc, col, { up: KN(), dur: 0.4, width: 0.16, I: 1.8 });
    if (near()) {
      const g = KG();
      K.tongues(g, big ? 9 : 6, 1.3 * sc, 1.6 * sc, { dur: big ? 1.3 : 0.9, col });
      K.smoke(g, 1.6 * sc, { n: big ? 5 : 3, dur: big ? 3.2 : 2.4, rise: 2.2 });
      K.dustSkirt(g, 2.6 * sc, { dur: 1.6, h: 1.2 * sc });
      K.mark(g, 2.4 * sc, 'scorch', big ? 12 : 8);
    }
    if (big && E.dist < 45) X.hitstop(0.06);
  };
  B.explosion = () => {   // radius 3
    if (thermal()) thermalBlast(E.scale, false);
    else { blast(true); kitBlast(E.scale, false); }
    X.light(C(0xffa040), 160, 0.35, 22);
    X.shake(0.35, 0.35);
  };
  B.explosion_big = () => {   // radius 7
    if (thermal()) thermalBlast(E.scale * 2.1, true);
    else { ctx.scale *= 2.3; blast(false); ctx.scale /= 2.3; kitBlast(E.scale * 2.1, true); }
    if (thermal()) { if (groundOnly()) p(P.exChunks, 3); }
    else { ctx.scale *= 1.6; p(P.exChunks, 12); p(P.exColumn, 8); ctx.scale /= 1.6; }
    if (groundOnly() && !thermal()) { X.ring(10, C(0xffa040), 0.55); X.ring(14, C(0xffd9a0), 0.8, 0.1); X.disc(9, C(0xff8a3a), 0.8, 0.8); }   // final-duel: the flat disc no longer floods the ground
    X.light(C(0xffa040), 240, 0.5, 40);
    X.shake(0.6, 0.5);
  };
  B.embers = () => { p(P.fireEmbers, 8); p(P.fireSparks, 4); };
  B.moon_motes = () => { p(P.aMoonMote, 6); p(P.aMoonCrescent, 2); };   // slow silver motes (月晕 interior)
  B.spark = () => { p(P.sparkFlash, 1); p(P.sparkBits, 8); };
  B.leaves = () => { p(P.leaves, 12); };
  B.petals = () => { p(P.petals, 14); };
  B.feathers = () => { p(P.feathers, 10); p(P.featherMotes, 4); };

  // ---- ceremony -----------------------------------------------------------------------------------------------------
  B.magic_circle = () => {   // radius 2
    X.sigil(2, C(0xffd98a), 1.7, 0.9);
    X.disc(2.4, C(0xffd98a), 1.5, 0.5);
    p(P.mcRunes, 10); p(P.mcMotes, 14);
  };
  B.summon = () => {
    X.sigil(1.6, C(0xdfe9ff), 1.2, 1.6);
    p(P.sumStar, 1); p(P.sumPillar, 8); p(P.sumPaper, 10); p(P.sumPoof, 8); p(P.sumTwinkle, 10);
    X.light(C(0xfff8e6), 40, 0.35, 10);
  };
  B.charge_done = () => { p(P.cdRing, 1); p(P.cdStar, 1); p(P.cdTwinkle, 6); };
  B.lantern_ignite = () => {
    p(P.lanGlow, 1); p(P.fireLick, 3); p(P.lanSparks, 10); p(P.lanMotes, 8); p(P.lanRing, 1);
    X.light(C(0xffb155), 50, 0.5, 10);
  };
  B.greatlantern = () => {   // radius 8
    p(P.glFlash, 1); p(P.glStar, 1); p(P.glPillar, 26); p(P.glRise, 12); p(P.glMotes, 60); p(P.glTwinkle, 30); p(P.glPetals, 20);
    X.sigil(6, C(0xffd98a), 2.6, 0.7);
    X.ring(10, C(0xffd98a), 0.9); X.ring(16, C(0xfff3c4), 1.1, 0.25); X.ring(24, C(0xffd98a), 1.3, 0.5);
    X.disc(9, C(0xffd98a), 1.6, 1.5);
    X.light(C(0xffd98a), 220, 1.2, 40);
    X.shake(0.25, 0.6);
  };
  B.meteor_trail = () => { p(P.metFlash, 1); p(P.metPuff, 2); p(P.metSparks, 3); p(P.metSmoke, 1); };
  B.crater = () => {   // radius 9
    ctx.scale *= 3; blast(false); ctx.scale /= 3; kitBlast(E.scale * 2.8, true);
    p(P.crChunks, 26); p(P.crWall, 20); p(P.crEmbers, 30);
    ctx.scale *= 2.2; p(P.exColumn, 10); ctx.scale /= 2.2;
    X.ring(12, C(0xffa040), 0.6); X.ring(20, 0xf0e0c8, 1.0, 0.1); X.disc(10, C(0xff8a3a), 1.2, 0.9);
    X.light(C(0xffb060), 260, 0.6, 50);
    X.shake(1, 0.8);
  };
  B.boss_death = () => {   // a creature of shade about 4 m tall coming apart, then one clean burst of light
    p(P.darkFlash, 1); p(P.bdWisps, 26); p(P.bdInk, 16); p(P.bdMotes, 24);
    const s = E.scale;
    for (let i = 0; i < 5; i++) X.later(0.2 + i * 0.3, 'hit_dark', (Math.random() - 0.5) * 3 * s, (Math.random() - 0.2) * 2.4 * s, (Math.random() - 0.5) * 3 * s, 1.6);
    X.later(1.8, 'boss_death_end', 0, 0, 0, 1);
    X.light(C(0x8a3cff), 60, 0.5, 14);
    X.shake(0.3, 0.4);
  };
  B.boss_death_end = () => {
    p(P.bdFlash, 1); p(P.bdStar, 1); p(P.bdRays, 22); p(P.bdSparks, 40); p(P.bdRise, 50); p(P.bdShock, 1);
    X.ring(14, 0xb070ff, 0.7); X.ring(22, 0xffd98a, 1.1, 0.15);
    X.light(0xfff3e0, 240, 0.6, 44);
    X.shake(0.7, 0.6);
  };
  // two spells colliding. opts.color / opts.color2 = the two sides.
  const clashSparks = (n) => {
    const a = E.color, b = E.color2;
    p(P.clSparks, n);
    ctx.c0 = b >= 0 ? b : 0xbfe9ff; p(P.clSparks, n);
    ctx.c0 = a;
  };
  B.clash = () => {   // radius 1.5
    p(P.clFlash, 1); p(P.clStar, 1); p(P.clShock, 1); clashSparks(16); p(P.clMotes, 6);
    X.light(0xffffff, 90, 0.15, 14);
    X.shake(0.2, 0.2);
  };
  B.clash_big = () => {   // radius 4
    ctx.scale *= 2.6; p(P.clFlash, 1); p(P.clStar, 1); p(P.clShock, 1); ctx.delay = 0.08; p(P.clShock, 1); ctx.delay = 0; ctx.scale /= 2.6;
    p(P.clForks, 6); p(P.clEnergy, 14);
    ctx.scale *= 1.6; clashSparks(22); p(P.clMotes, 20); ctx.scale /= 1.6;
    X.arc(6, 4.5, E.color >= 0 ? E.color : 0xffffff, 0.22);
    { const K = kit(); if (K) { const sc = E.scale; K.dome(KP(), 4.5 * sc, C(0xfff3d0), { dur: 0.5, I: 1.6 }); K.shock(KP(), 6 * sc, C(0xffffff), { up: KD(), dur: 0.45, width: 0.12, I: 2.2 });
      K.shock(KP(), 8 * sc, E.color2 >= 0 ? E.color2 : 0xc87bff, { up: KD(), dur: 0.6, width: 0.1, I: 1.8, delay: 0.08 }); if (near()) { K.dustSkirt(KG(), 4 * sc, { dur: 2, h: 1.6 * sc }); K.mark(KG(), 3.5 * sc, 'crack', 10); } }
      if (E.dist < 45) X.hitstop(0.07); }
    if (groundOnly()) X.ring(9, C(0xffffff), 0.6);
    X.light(0xffffff, 220, 0.4, 36);
    X.shake(0.7, 0.5);
  };

  // ---- emitters (rates are particles per second at rate 1) -----------------------------------------------------------
  EM.flame = () => { q(P.eFlame, 20); q(P.eFlameCore, 6); q(P.eFlameEmber, 3); q(P.eFlameSmoke, 1.5); };
  EM.smoke = () => { q(P.eSmoke, 7); };
  EM.embers = () => { q(P.eEmbers, 10); };
  EM.rain = () => {   // radius 18
    const a = X.area(18);
    q(P.eRain, 480 * a); q(P.eRainMist, 3 * a);
    const n = X.count(60 * a), R = E.radius || 18;
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * R, th = Math.random() * 6.2832;
      const x = E.x + Math.cos(th) * r, z = E.z + Math.sin(th) * r;
      X.at(x, X.ground(x, z, E.y + 3), z);
      X.one(P.eRainSplash); if (i & 1) X.one(P.eRainHop);
    }
  };
  EM.snow = () => { const a = X.area(14); q(P.eSnow, 55 * a); };
  EM.fireflies = () => { const a = X.area(6); q(P.eFirefly, 5 * a); };
  EM.spores = () => { const a = X.area(5); q(P.eSpore, 8 * a); };
  EM.pollen = () => { const a = X.area(8); q(P.ePollen, 12 * a); };
  EM.maple_leaves = () => { const a = X.area(6); q(P.eMaple, 3 * a); q(P.eGinkgo, 1 * a); };
  EM.broom_sparkle = () => { q(P.eBroomStar, 40); q(P.eBroomDot, 22); };
  EM.wing_dust = () => { q(P.eWingDot, 26); q(P.eWingStar, 5); q(P.eWingFeather, 2); };
  EM.aura_fire = () => { q(P.aFire, 21); q(P.aFireEmber, 7.5); };
  EM.aura_water = () => { q(P.aWaterBubble, 12); q(P.aWaterDrop, 9); q(P.aWaterRipple, 2.25); };
  EM.aura_ice = () => { q(P.aIceFlake, 9); q(P.aIceTwinkle, 9); q(P.aIceMist, 3); };
  EM.aura_wind = () => { q(P.aWindStreak, 18); q(P.aWindLeaf, 3); };
  EM.aura_thunder = () => { q(P.aThFork, 7.5); q(P.aThSpark, 12); };
  EM.aura_earth = () => { q(P.aEarthBit, 9); q(P.aEarthDust, 6); };
  EM.aura_sun = () => { q(P.aSunMote, 13.5); q(P.aSunRay, 3.75); q(P.aSunTwinkle, 3.75); };
  EM.aura_moon = () => { q(P.aMoonCrescent, 6); q(P.aMoonMote, 12); q(P.aMoonRing, 1.5); };
  EM.aura_dark = () => { q(P.aDarkWisp, 12); q(P.aDarkMote, 6); };
  EM.updraft = () => {   // radius 5, height 12 (opts.height stretches it)
    const a = X.area(5);
    ctx.speed *= (E.height || 12) / 12;
    q(P.eUpStreak, 26 * a); q(P.eUpLeaf, 5 * a); q(P.eUpDust, 4 * a);
  };
  // final-duel: a struggle push — coloured sparks spraying sideways off the clash (dir = the beam axis), no flash
  B.struggle_spray = () => {
    ctx.nx = ctx.dx; ctx.ny = ctx.dy; ctx.nz = ctx.dz;
    const a = E.color, b = E.color2;
    p(P.ssSparks, 12);
    ctx.c0 = b >= 0 ? b : 0xc87bff; p(P.ssSparks, 12);
    ctx.c0 = a;
  };
  // final-duel: what rains down after a struggle breaks, by the loser's element (color = that element's colour)
  B.remains = () => { p(P.rmMote, 34); };
  B.remains_drops = () => { p(P.rmDrop, 28); p(P.rmMote, 12); };
  EM.waterfall_mist = () => { const a = X.area(3); q(P.eFallMist, 10 * a); q(P.eFallSpray, 16 * a); q(P.eFallRipple, 3 * a); };
  EM.miasma = () => { const a = X.area(6); q(P.eMiasma, 7 * a); q(P.eMiasmaGlint, 3 * a); q(P.eMiasmaWisp, 1 * a); };
  // extras beyond the contract
  EM.clash_ball = () => {   // where two beams meet. dir = beam axis; color / color2 = the two sides
    q(P.cbCore, 8); q(P.cbHalo, 4); q(P.cbStar, 6); q(P.cbForks, 6); q(P.cbShock, 3);   // the body is fx.magic's churning ball; sprites only sparkle
    ctx.nx = ctx.dx; ctx.ny = ctx.dy; ctx.nz = ctx.dz;
    const a = E.color, b = E.color2;
    q(P.cbSparks, 20);
    ctx.c0 = b >= 0 ? b : 0xbfe9ff; q(P.cbSparks, 20);
    ctx.c0 = a;
    if (X.every(0.09)) X.light(0xffffff, 45 * E.scale, 0.14, 16 * E.scale);
  };
  EM.charge = () => {   // motes streaming into a point while a spell is being charged
    q(P.chMotes, 30); q(P.chStreak, 14); q(P.chRing, 2.5); q(P.chGlow, 12);
  };

  return { bursts: B, emitters: EM, P };
}

export { P as SPECS };
