// Gameplay placements — deterministic data for collectibles, chests, races, vents, altars and rest points.
// Coordinates follow src/data/world.js (+x east, +z south). No y values: a spot is resolved at runtime by
// src/gameplay/place.js from one of these forms:
//   { x, z }                 on the ground (groundAt at foot height), + lift
//   { x, z, top: true }      on the topmost walkable surface (roofs, towers)
//   { isle, dx, dz }         on a floating island's top (SKY_ISLES id), offset from its centre
//   { pad: [x, z] }          on the giant-mushroom cap (G.flora.bouncePads) nearest to x,z
//   { x, z, y }              absolute height
// lift: extra metres above the resolved surface (default per kind).

/** 月之泪 ×24 — hidden all over: island tops, roofs, mushroom caps, mountain ledges, the town tower. */
export const MOONTEARS = [
  { id: 'mt_01', isle: 'fi_sun', dx: 4, dz: -5 },
  { id: 'mt_02', isle: 'fi_cape', dx: -6, dz: 3 },
  { id: 'mt_03', isle: 'fi_dusk1', dx: 7, dz: 5 },
  { id: 'mt_04', isle: 'fi_dusk2', dx: -4, dz: -6 },
  { id: 'mt_05', isle: 'fi_lake', dx: 6, dz: -6 },
  { id: 'mt_06', isle: 'fi_peak', dx: -5, dz: 6 },
  { id: 'mt_07', isle: 'fi_night1', dx: 5, dz: 6 },
  { id: 'mt_08', isle: 'fi_night2', dx: -5, dz: 4 },
  { id: 'mt_09', isle: 'fi_night3', dx: 6, dz: -3 },
  { id: 'mt_10', isle: 'fi_night4', dx: -7, dz: -4 },
  { id: 'mt_11', isle: 'fi_glow', dx: 8, dz: 6 },
  { id: 'mt_12', isle: 'fi_crys', dx: -4, dz: 5 },
  { id: 'mt_13', isle: 'fi_east', dx: 7, dz: -6 },
  { id: 'mt_14', x: -494, z: 148, top: true },         // 朝颜村 farmhouse ridge
  { id: 'mt_15', x: -93, z: 80, top: true },           // 狐火之里 stilt-house roof
  { id: 'mt_16', x: -540, z: 13, top: true },          // 向日神社 haiden ridge
  { id: 'mt_17', x: 205, z: -125, top: true },         // 万灯镇 lamp-tower roof
  { id: 'mt_18', pad: [430, 170] },                    // 萤茸林 mushroom caps
  { id: 'mt_19', pad: [340, 250] },
  { id: 'mt_20', x: 40, z: -580 },                     // 霜见岳 ledges
  { id: 'mt_21', x: -80, z: -540 },
  { id: 'mt_22', x: -200, z: -500 },
  { id: 'mt_23', x: -147, z: -256, lift: 1.4 },        // 雾见泉, under the torii in the pond
  { id: 'mt_24', x: -392, z: 596 },                    // 白浪岬, the very tip
];

/** 绘马 ×10 — lore tablets (text: gameplay.lore.<id>). Order = the legend's order. */
export const EMA = [
  { id: 'ema_01', x: -516, z: 62 },     // 向日神社, beside the ema rack
  { id: 'ema_02', x: -432, z: 160 },    // 朝颜村
  { id: 'ema_03', x: -604, z: -150 },   // 向日葵之丘
  { id: 'ema_04', x: -136, z: -238 },   // 雾见泉
  { id: 'ema_05', x: -58, z: 74 },      // 狐火之里
  { id: 'ema_06', x: -14, z: -158 },    // 千年枫
  { id: 'ema_07', x: 130, z: 392 },     // 镜心屿
  { id: 'ema_08', x: 221, z: -131 },    // 万灯镇
  { id: 'ema_09', x: -12, z: -533 },    // 风祠
  { id: 'ema_10', x: 532, z: -292 },    // 星晶野
];

/** Treasure chests (own; the broom chest belongs to structures/story). loot: data/items.js LOOT key. */
export const CHESTS = [
  { id: 'ch_bellpost', x: -804, z: -546, top: true, loot: 'large', face: -0.6 },
  { id: 'ch_01', x: -642, z: -118, loot: 'small', face: 0.6 },
  { id: 'ch_02', x: -372, z: 578, loot: 'medium', face: 2.4 },
  { id: 'ch_03', isle: 'fi_dusk1', dx: -6, dz: 4, loot: 'large', face: 1.2 },
  { id: 'ch_04', x: -162, z: -264, loot: 'small', face: 0.3 },
  { id: 'ch_05', x: -112, z: -22, loot: 'charm', face: -0.8 },
  { id: 'ch_06', x: 24, z: 258, loot: 'small', face: 2.0 },
  { id: 'ch_07', pad: [380, 150], loot: 'medium', face: 0 },
  { id: 'ch_08', x: 172, z: -158, loot: 'small', face: 1.0 },
  { id: 'ch_09', x: -120, z: -500, loot: 'broom', face: 2.8 },
  { id: 'ch_10', x: 582, z: -248, loot: 'large', face: -2.2 },
  { id: 'ch_11', x: 702, z: 88, loot: 'medium', face: -1.5 },
  { id: 'ch_12', isle: 'fi_peak', dx: 5, dz: -4, loot: 'charm', face: 0.4 },
];

/** Lost fox kits ×5 in the dusk forest (group 'kits'). */
export const FOXKITS = [
  { id: 'kit_1', x: -122, z: 12, face: 1.2 },
  { id: 'kit_2', x: -18, z: -44, face: -2.0 },
  { id: 'kit_3', x: -104, z: -118, face: 0.5 },
  { id: 'kit_4', x: 32, z: -108, face: 2.6 },
  { id: 'kit_5', x: -152, z: -62, face: -0.7 },
];

/** The village kid's kite, caught on island fi_kite (group 'kite'). */
export const KITE = { id: 'kite', isle: 'fi_kite', dx: 4, dz: 3 };

/** Cooking ingredients (collected once each). */
export const INGREDIENTS = [
  ...[[360, 180], [420, 240], [452, 192], [382, 262], [332, 222], [470, 242], [410, 160], [356, 288]]
    .map(([x, z], i) => ({ id: 'gs_' + (i + 1), item: 'glowshroom', x, z })),
  ...[[-590, -170], [-560, -140], [-600, -112], [-636, -150], [-576, -92], [-616, -178]]
    .map(([x, z], i) => ({ id: 'ss_' + (i + 1), item: 'sunseed', x, z })),
];

/** Firefly clusters for the town-lamp quest (group 'fireflies'). */
export const FIREFLIES = [
  { id: 'ff_1', x: 372, z: 198 },
  { id: 'ff_2', x: 442, z: 232 },
  { id: 'ff_3', x: 396, z: 282 },
];

/** Lotus lamps floating on 镜湖 (group 'lotus'). Lit by fire / sun, or by hand from the broom. */
export const LOTUS = [
  { id: 'lotus_1', x: 72, z: 382 },
  { id: 'lotus_2', x: 166, z: 360 },
  { id: 'lotus_3', x: 150, z: 456 },
];

/** Moon-tear altars (spend tears on hp / mana). */
export const ALTARS = [
  { id: 'altar_shrine', x: -527, z: 28 },
  { id: 'altar_fox', x: -78, z: 66 },
  { id: 'altar_town', x: 218, z: -140 },
];

/** Rest points (checkpoints) besides lit stone lanterns. post: build a save-lantern post there. */
export const RESTS = [
  { id: 'bell_save', anchor: 'bell_save', post: true },
  { id: 'shrine_save', anchor: 'shrine_save', post: false },
  { id: 'village_save', anchor: 'village_save', post: true },
  { id: 'fox_save', anchor: 'fox_save', post: true },
  { id: 'town_save', anchor: 'town_save', post: true },
];

/**
 * Broom races. start: ANCHORS id (the race is offered there). rings: [x, z, y] absolute, or [x, z, h, 'g'] = h above ground.
 * medals: seconds for gold / silver / bronze. reward: stardust for the first gold / silver / bronze.
 */
export const RACES = {
  race_shrine: {
    group: 'race_shrine', start: 'ring_start', radius: 3.2,
    rings: [[-506, 90, 22], [-482, 74, 30], [-446, 44, 46], [-470, 22, 56], [-505, 52, 52], [-516, 96, 26]],
    medals: [20, 26, 34], reward: [120, 60, 30],
  },
  race_dusk: {
    group: 'race_dusk', start: 'fox_racer', radius: 3,
    rings: [[-62, 70, 4, 'g'], [-71, 40, 4.5, 'g'], [-55, 10, 4, 'g'], [-63, -20, 4.5, 'g'], [-43, -50, 4, 'g'], [-50, -80, 4.5, 'g'], [-31, -110, 4, 'g'], [-41, -140, 4.5, 'g']],
    medals: [24, 30, 40], reward: [150, 80, 40],
  },
  race_sky: {
    group: 'race_sky', start: 'town_racer', radius: 4,
    rings: [[258, -128, 60], [290, -186, 118], [360, -176, 134], [430, -142, 134], [500, -92, 124], [502, 0, 118],
      [480, 92, 110], [400, 112, 104], [330, 72, 98], [272, -28, 70], [246, -94, 30]],
    medals: [52, 64, 82], reward: [240, 120, 60],
  },
};

/** Updraft vents (permanent wind columns). */
export const VENTS = [
  { id: 'vent_m1', x: -60, z: -468, height: 90, strength: 15, radius: 5 },
  { id: 'vent_m2', x: 22, z: -500, height: 95, strength: 15, radius: 5 },
  { id: 'vent_m3', x: -122, z: -470, height: 85, strength: 15, radius: 5 },
  { id: 'vent_palace', x: 505, z: -60, height: 175, strength: 17, radius: 6 },
];

/** 月障 — the barrier dome over the palace rock. */
export const BARRIER = { x: 380, z: -40, rx: 90, ry: 185, y0: -6, need: 3 };

/** Crystal-pillar puzzle at 星晶野: light falls from the gold ring onto pedestal 0, then 0 → 1 → 2 → 晶灯. */
export const CRYSTAL_PUZZLE = { id: 'crystal', lantern: 'gl_crystal', steps: 12, start: [3, 8, 5] };
