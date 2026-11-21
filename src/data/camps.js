// Where foes and creatures live. Ids + coordinates only (names are in src/locales/zh-CN/combat.js).
// Difficulty rises eastward: paper sprites in the sunlit west, shades at dusk, the heavy ones under the Veil.
// Camps keep clear of wards (settlements); combat streams them in within ~70 m and respawns them after `respawn` s.

/** kinds: [[type, count], ...]   r: wander radius   respawn: seconds after the camp is cleared */
export const CAMPS = [
  // 曦光原 — mischievous paper sprites only
  { id: 'sun_meadow', x: -500, z: -70, r: 9, kinds: [['paper', 3]], respawn: 180 },
  { id: 'sun_road', x: -372, z: 70, r: 8, kinds: [['paper', 3]], respawn: 180 },
  { id: 'sun_south', x: -430, z: 300, r: 10, kinds: [['paper', 4]], respawn: 180 },
  { id: 'sun_hill', x: -300, z: -200, r: 9, kinds: [['paper', 3]], respawn: 180 },
  // 薄暮林 — blobs, wolves, wisps, moths
  { id: 'dusk_glade', x: -110, z: -10, r: 9, kinds: [['blob', 3]], respawn: 220 },
  { id: 'dusk_bank', x: 60, z: 170, r: 10, kinds: [['wolf', 2], ['blob', 1]], respawn: 240 },
  { id: 'dusk_hollow', x: -205, z: 175, r: 9, kinds: [['wisp', 2], ['blob', 2]], respawn: 220 },
  { id: 'dusk_shore', x: 150, z: 250, r: 10, kinds: [['moth', 2], ['wolf', 1]], respawn: 240 },
  { id: 'dusk_spring', x: -150, z: -330, r: 11, kinds: [['wolf', 3]], respawn: 260 },
  { id: 'dusk_ridge', x: 60, z: 60, r: 9, kinds: [['wisp', 3]], respawn: 220 },
  // 常夜原 — the heavy ones
  { id: 'night_glow', x: 320, z: 150, r: 11, kinds: [['moth', 3], ['wisp', 2]], respawn: 300 },
  { id: 'night_pass', x: 260, z: -262, r: 11, kinds: [['wolf', 3], ['caster', 1]], respawn: 300 },
  { id: 'night_field', x: 470, z: 140, r: 12, kinds: [['blob', 3], ['moth', 2]], respawn: 300 },
  { id: 'night_crystal', x: 470, z: -250, r: 12, kinds: [['golem', 1], ['caster', 1]], respawn: 360 },
  { id: 'night_shore', x: 640, z: 40, r: 12, kinds: [['caster', 2], ['wolf', 2]], respawn: 360 },
  { id: 'night_quarry', x: 610, z: -130, r: 12, kinds: [['golem', 2]], respawn: 420 },
  { id: 'night_mush', x: 420, z: 330, r: 12, kinds: [['caster', 1], ['moth', 2], ['wisp', 2]], respawn: 360 },
  { id: 'night_moat', x: 250, z: 40, r: 10, kinds: [['wolf', 2], ['blob', 2]], respawn: 300 },
];

/** 影巢: three nests around 千年枫 (m2_dusk). Each spawns `kinds` until its core is destroyed. */
export const NESTS = [
  { id: 'nest_west', x: -85, z: -205, kinds: ['blob', 'wolf', 'blob'], brambles: 6 },
  { id: 'nest_east', x: 25, z: -215, kinds: ['wolf', 'blob', 'wisp'], brambles: 6 },
  { id: 'nest_south', x: -40, z: -105, kinds: ['blob', 'wisp', 'blob'], brambles: 6 },
];

/** Waves story can call with G.combat.spawnWave(id, pos?). pos defaults to `at`. */
export const WAVES = {
  training: { at: { x: -600, z: -22 }, r: 7, kinds: [['paper', 4]] },
  training_2: { at: { x: -600, z: -22 }, r: 8, kinds: [['paper', 5]] },
  crystal: { at: { x: 545, z: -275 }, r: 12, kinds: [['golem', 1], ['caster', 1]] },
  village_fire: { at: { x: -455, z: 150 }, r: 10, kinds: [['paper', 3]] },
};

/** Default duel rings: story may pass its own position to startDuel(id, { pos }). */
export const DUEL_RINGS = {
  himawari: { x: -600, z: -22, r: 15 },
  kokonoe: { x: -52, z: 120, r: 15 },
  rikka: { x: -20, z: -528, r: 14 },
  naru: { x: 238, z: -90, r: 14 },
};

/** Boss arenas (centre + radius). */
export const ARENAS = {
  oboroga: { x: -30, z: -170, r: 30 },
  tomoshigui: { x: 120, z: 400, r: 34 },
  oboroyo: { x: 380, z: -34, r: 22 },
  mumyo: { x: 380, z: -34, r: 24 },
};

/** Ambient wildlife: { kind, x, z, r, n, time? } — time 'night' only shows under the Veil. */
export const WILDLIFE = [
  {kind:'dog',x:2193,z:54,r:12,n:1},{kind:'chicken',x:2247,z:78,r:8,n:4},
  {kind:'deer',x:2023,z:-61,r:17,n:3},{kind:'hedgehog',x:2005,z:-23,r:12,n:2},
  {kind:'sheep',x:1260,z:-103,r:5,n:4},{kind:'cow',x:1244,z:-95,r:8,n:2},
  {kind:'frog',x:944,z:392,r:11,n:3},{kind:'deer',x:660,z:-154,r:14,n:2},
  {kind:'raccoon',x:152,z:-217,r:9,n:2},{kind:'sheep',x:-333,z:-215,r:6,n:4},
  {kind:'deer',x:-1310,z:-480,r:22,n:3},{kind:'dog',x:-1982,z:-355,r:15,n:1},
  {kind:'cat',x:-2175,z:-509,r:8,n:2}

];
