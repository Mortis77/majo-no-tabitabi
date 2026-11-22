// Landmarks of the open countryside (map round, 2026-11-22). Ids + coordinates only — no player-visible text here.
// Built by world/builders/landmarks.js (structures), world/landforms/setpieces.js (rock set pieces) and the flora
// countryside planting (giant tree, flower valley, rockfalls, dead wood). Later systems (side activities, collectibles,
// discoveries) attach to these ids; they must not move them.
//
// Layout follows three rules:
//  * three scales everywhere: LARGE pieces read from a kilometre or more (giant tree, peak tower, windmill hill, hill
//    fort beacon, trilithon crown, crag falls, cape lighthouse, aqueduct); MEDIUM ones (farmsteads, tors, ruins, pools)
//    read from a few hundred metres and sit on the flanks below the large ones; SMALL ones (cairns, shrines, benches,
//    snags) reward a landing within ~60 m of something bigger;
//  * gravity: from any point several of them pull in different directions (north / south of the road alternate), and
//    they chain (tor -> giant tree -> ruined bridge; quarry -> windmill hill; shepherd hut -> heath -> lookout);
//  * reveal: the larger pieces stand behind rises or in groves so they are uncovered while flying round the flank.
//
// Fields: id, kind (builder), scale 'large'|'medium'|'small', x, z (world metres), angle (yaw, radians), r (clearance
// radius kept free of scattered flora and other plans), h (approximate height above its ground, for visibility tools),
// len (linear pieces: length along `angle`), affords (what the element / physics systems can do there):
//   burn (dry wood, beacon, woodpiles), blast (breakable rockfall / rubble), water (open water to wade / wet / boat),
//   frost (still water that can freeze), updraft (wind-swept crest for gliding), wind (sails / chimes that turn),
//   view (lookout), perch (high place to land on), rest (shelter / bench).
export const LANDMARKS = [
  // ---------------------------------------------------------------- large
  { id: 'ancient_tree', kind: 'ancientTree', scale: 'large', x: 470, z: 230, angle: 0.4, r: 30, h: 48, affords: ['perch', 'view', 'burn'] },
  { id: 'north_watchtower', kind: 'watchtower', scale: 'large', x: 450, z: -660, angle: 2.6, r: 14, h: 27, affords: ['view', 'updraft', 'perch'] },
  { id: 'windmill_hill', kind: 'windmills', scale: 'large', x: 2220, z: -440, angle: 0.9, r: 28, h: 16, affords: ['wind', 'view', 'updraft'] },
  { id: 'beacon_keep', kind: 'beaconKeep', scale: 'large', x: -2190, z: -1010, angle: 0.3, r: 26, h: 18, affords: ['burn', 'view', 'updraft', 'perch'] },
  { id: 'stone_crown', kind: 'trilithons', scale: 'large', x: -915, z: 465, angle: 0.2, r: 22, h: 9, affords: ['view', 'updraft', 'perch'] },
  { id: 'crag_falls', kind: 'cragFalls', scale: 'large', x: -300, z: -760, angle: 0.5, r: 32, h: 30, affords: ['water', 'frost', 'updraft', 'perch'] },
  { id: 'cape_lighthouse', kind: 'lighthouse', scale: 'large', x: 2355, z: -15, angle: -1.57, r: 12, h: 24, affords: ['burn', 'view', 'perch'] },
  { id: 'south_aqueduct', kind: 'aqueduct', scale: 'large', x: -1175, z: 250, angle: 1.19, len: 270, r: 10, h: 14, affords: ['perch', 'blast', 'view'] },
  // ---------------------------------------------------------------- medium
  { id: 'brook_bridge', kind: 'bridgeRuin', scale: 'medium', x: 560, z: 350, angle: 0.22, r: 16, h: 6, affords: ['water', 'frost', 'blast'] },
  { id: 'hermit_cottage', kind: 'hermitCottage', scale: 'medium', x: -740, z: -580, angle: 2.2, r: 18, h: 7, affords: ['burn', 'rest'] },
  { id: 'farm_north', kind: 'farmstead', scale: 'medium', x: 1000, z: -480, angle: 0.3, r: 30, h: 9, affords: ['burn', 'rest'] },
  { id: 'farm_south', kind: 'farmstead', scale: 'medium', x: 1150, z: 250, angle: -0.4, r: 30, h: 9, affords: ['burn', 'rest'] },
  { id: 'farm_west', kind: 'farmstead', scale: 'medium', x: -1620, z: 330, angle: 1.1, r: 30, h: 9, affords: ['burn', 'rest'] },
  { id: 'farm_far_north', kind: 'farmstead', scale: 'medium', x: -1000, z: -850, angle: 2.5, r: 30, h: 9, affords: ['burn', 'rest'] },
  { id: 'moor_circle', kind: 'stoneCircle', scale: 'medium', x: 1420, z: -200, angle: 0, r: 17, h: 4, affords: ['view', 'blast'] },
  { id: 'chapel_ruin', kind: 'chapelRuin', scale: 'medium', x: -620, z: -450, angle: 0.7, r: 18, h: 10, affords: ['blast', 'perch'] },
  { id: 'tor_west', kind: 'tor', scale: 'medium', x: -1080, z: -120, angle: 0.3, r: 14, h: 9, affords: ['updraft', 'view', 'perch'] },
  { id: 'tor_north', kind: 'tor', scale: 'medium', x: -60, z: -470, angle: 1.3, r: 14, h: 9, affords: ['updraft', 'view', 'perch'] },
  { id: 'tor_south', kind: 'tor', scale: 'medium', x: 630, z: 270, angle: 2.2, r: 14, h: 9, affords: ['updraft', 'view', 'perch'] },
  { id: 'charcoal_camp', kind: 'charcoalCamp', scale: 'medium', x: 880, z: -215, angle: 0.6, r: 17, h: 4, affords: ['burn'] },
  { id: 'shepherd_hut', kind: 'shepherdHut', scale: 'medium', x: -1380, z: -520, angle: 1.9, r: 12, h: 5, affords: ['rest', 'burn'] },
  { id: 'west_dolmen', kind: 'dolmen', scale: 'medium', x: -1620, z: -30, angle: 0.5, r: 10, h: 4, affords: ['perch'] },
  { id: 'old_quarry', kind: 'quarry', scale: 'medium', x: 1890, z: -470, angle: 2.9, r: 24, h: 14, affords: ['blast', 'perch'] },
  { id: 'reed_tarn', kind: 'tarn', scale: 'medium', x: -1100, z: 320, angle: 0, r: 24, h: 2, affords: ['water', 'frost'] },
  { id: 'flower_valley', kind: 'flowerValley', scale: 'medium', x: -450, z: 330, angle: 0.4, r: 95, h: 1, affords: ['view', 'rest'] },
  { id: 'sea_pier', kind: 'pier', scale: 'medium', x: 2360, z: 350, angle: 0, r: 14, h: 4, affords: ['water'] },
  { id: 'south_cove', kind: 'boathouse', scale: 'medium', x: -1200, z: 590, angle: 3.14, r: 12, h: 5, affords: ['water', 'rest'] },
  { id: 'bee_garden', kind: 'apiary', scale: 'medium', x: -1700, z: -180, angle: 0.4, r: 11, h: 3, affords: ['burn'] },
  // ---------------------------------------------------------------- small
  { id: 'swing_oak', kind: 'swingTree', scale: 'small', x: 900, z: -60, angle: 1.2, r: 12, h: 14, affords: ['rest', 'wind'] },
  { id: 'cairn_southeast', kind: 'cairn', scale: 'small', x: 2040, z: 420, angle: 0, r: 5, h: 2.5, affords: ['view'] },
  { id: 'cairn_westcoast', kind: 'cairn', scale: 'small', x: -2040, z: -30, angle: 0, r: 5, h: 2.5, affords: ['view'] },
  { id: 'cairn_brookhill', kind: 'cairn', scale: 'small', x: 1050, z: 510, angle: 0, r: 5, h: 2.5, affords: ['view'] },
  { id: 'cairn_southhill', kind: 'cairn', scale: 'small', x: 330, z: 330, angle: 0, r: 5, h: 2.5, affords: ['view'] },
  { id: 'cairn_farwest', kind: 'cairn', scale: 'small', x: -1920, z: 345, angle: 0, r: 5, h: 2.5, affords: ['view'] },
  { id: 'shrine_moorroad', kind: 'wayShrine', scale: 'small', x: 1000, z: -179, angle: 3.14, r: 5, h: 2.2, affords: ['rest'] },
  { id: 'shrine_wildsroad', kind: 'wayShrine', scale: 'small', x: 482, z: -151, angle: 0, r: 5, h: 2.2, affords: ['rest'] },
  { id: 'shrine_westroad', kind: 'wayShrine', scale: 'small', x: -565, z: -299, angle: 3.14, r: 5, h: 2.2, affords: ['rest'] },
  { id: 'shrine_passroad', kind: 'wayShrine', scale: 'small', x: -1062, z: -214, angle: 0, r: 5, h: 2.2, affords: ['rest'] },
  { id: 'shrine_cityroad', kind: 'wayShrine', scale: 'small', x: -1731, z: -332, angle: 3.14, r: 5, h: 2.2, affords: ['rest'] },
  { id: 'bench_seaview', kind: 'bench', scale: 'small', x: 2070, z: 180, angle: 1.6, r: 5, h: 1, affords: ['rest', 'view'] },
  { id: 'bench_northwood', kind: 'bench', scale: 'small', x: -90, z: -420, angle: 3.0, r: 5, h: 1, affords: ['rest', 'view'] },
  { id: 'fallen_giant', kind: 'fallenGiant', scale: 'small', x: 300, z: -330, angle: 0.8, r: 14, h: 3, affords: ['burn', 'perch'] },
  { id: 'pass_rockfall', kind: 'rockfall', scale: 'small', x: -1300, z: -420, angle: 2.4, r: 12, h: 4, affords: ['blast'] },
  { id: 'moor_snags', kind: 'snags', scale: 'small', x: 1200, z: -320, angle: 0, r: 12, h: 8, affords: ['burn'] },
  { id: 'farm_well', kind: 'well', scale: 'small', x: 2100, z: 300, angle: 0.5, r: 5, h: 3, affords: ['water'] },
];

export const LANDMARK_BY_ID = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

/** Distance (m) from (x,z) to the landmark's footprint (a point, or a segment for pieces with `len`). */
export function landmarkDist(l, x, z) {
  if (!l.len) return Math.hypot(x - l.x, z - l.z);
  const dx = Math.sin(l.angle), dz = Math.cos(l.angle), h = l.len / 2;
  const t = Math.max(-h, Math.min(h, (x - l.x) * dx + (z - l.z) * dz));
  return Math.hypot(x - l.x - dx * t, z - l.z - dz * t);
}
/** The landmark whose clearance contains (x,z) (pad widens it), or null. Kinds in `except` are ignored. */
export function landmarkAt(x, z, pad = 0, except = null) {
  for (const l of LANDMARKS) {
    const reach = (l.len ? l.len / 2 : 0) + l.r + pad;
    if (Math.abs(x - l.x) > reach || Math.abs(z - l.z) > reach) continue;
    if (except && except.includes(l.kind)) continue;
    if (landmarkDist(l, x, z) < l.r + pad) return l;
  }
  return null;
}
