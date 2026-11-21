// Flora species table: which model, how it is coloured per land, how it sways, how it reacts.
//
// Parts: every model's meshes are merged into at most a few PARTS by (mode, crown, texture):
//   mode 'tint' -> the part takes its colour from the instance (aCol0, linear RGB); vertex colours keep only the grey ramp
//                  (leaves, blossoms, petals, moss, glowing caps, crystals).
//   mode 'mul'  -> the source material colour (or `base`) is baked into the vertex colours and the instance multiplies it
//                  by a land factor (aCol1): trunks, rocks, stems, snow.
//   crown: true -> collapses to the crown centre when the tree burns out (charred trunk stays).
//   glow        -> emissive strength; the colour comes from the instance hue (palette in material.js).
//   tip [lo,hi] -> only the upper part glows (normalised height), speckled per vertex — softly glowing leaf tips.
//
// kind: tree | plant | rock | crystal | shroom   far: 'blob' | 'cone' | 'shroom' | null (cheap far stand-in)
// flex: tip sway in metres per m/s of wind.  dist: draw distance (m) at quality high.

const T = (o) => ({ kind: 'tree', far: 'blob', flex: 0.05, dist: 150, trunkR: 0.32, ...o });
const P = (o) => ({ kind: 'plant', far: null, flex: 0.07, dist: 75, ...o });
const R = (o) => ({ kind: 'rock', far: null, flex: 0, dist: 200, ...o });

export const SPECIES = {
  // ---- trees
  broad1: T({ asset: 'tree_broadleaf_1' }),
  broad2: T({ asset: 'tree_broadleaf_2' }),
  broad3: T({ asset: 'tree_broadleaf_3', trunkR: 0.5 }),
  broad4: T({ asset: 'tree_broadleaf_4' }),
  broad5: T({ asset: 'tree_broadleaf_5' }),
  birch: T({ asset: 'tree_birch_1', trunkR: 0.25 }),
  cherry1: T({ asset: 'tree_cherry_1', trunkR: 0.4 }),
  cherry2: T({ asset: 'tree_cherry_2' }),
  willow1: T({ asset: 'tree_willow_1', flex: 0.08 }),
  willow2: T({ asset: 'tree_willow_2', flex: 0.08 }),
  maple1: T({ asset: 'tree_maple_1', trunkR: 0.4 }),
  maple2: T({ asset: 'tree_maple_2' }),
  maple3: T({ asset: 'tree_maple_3' }),
  ginkgo1: T({ asset: 'tree_ginkgo_1', trunkR: 0.28 }),
  ginkgo2: T({ asset: 'tree_ginkgo_2', trunkR: 0.28 }),
  pine1: T({ asset: 'tree_pine_1', far: 'cone', flex: 0.035, trunkR: 0.3 }),
  pine2: T({ asset: 'tree_pine_2', far: 'cone', flex: 0.035, trunkR: 0.3 }),
  pine3: T({ asset: 'tree_pine_3', far: 'cone', flex: 0.035, trunkR: 0.3 }),
  pineSnow: T({ asset: 'tree_pine_snow_1', far: 'cone', flex: 0.03, trunkR: 0.3, snow: true }),
  broadSnow: T({ asset: 'tree_broadleaf_snow_1', flex: 0.03, snow: true }),
  dead1: T({ asset: 'tree_dead_1', far: null, flex: 0.015, dist: 170 }),
  dead2: T({ asset: 'tree_dead_2', far: null, flex: 0.015, dist: 170, trunkR: 0.22 }),
  dead3: T({ asset: 'tree_dead_3', far: null, flex: 0.01, dist: 170 }),
  deadSnow: T({ asset: 'tree_dead_snow_1', far: null, flex: 0.01, dist: 170, snow: true }),
  bamboo1: T({ asset: 'tree_bamboo_1', far: 'bcone', near: 52, flex: 0.13, trunkR: 0.45, bamboo: true, dist: 130 }),
  bamboo2: T({ asset: 'tree_bamboo_2', far: 'bcone', near: 52, flex: 0.13, trunkR: 0.35, bamboo: true, dist: 130 }),
  // ---- giant mushrooms (springy caps, glowing at night)
  shroom1: { kind: 'shroom', asset: 'plant_mushroom_giant_1', far: 'shroom', flex: 0.012, dist: 190, trunkR: 0.7 },
  shroom2: { kind: 'shroom', asset: 'plant_mushroom_giant_2', far: 'shroom', flex: 0.012, dist: 190, trunkR: 0.8 },
  shroom3: { kind: 'shroom', asset: 'plant_mushroom_giant_3', far: 'shroom', flex: 0.008, dist: 190, trunkR: 1.0 },
  shroom4: { kind: 'shroom', asset: 'plant_mushroom_giant_4', far: 'shroom', flex: 0.03, dist: 190, trunkR: 0.45 },
  // ---- plants
  bush1: P({ asset: 'plant_bush_1', flex: 0.04, dist: 95 }),
  bush2: P({ asset: 'plant_bush_2', flex: 0.04, dist: 95 }),
  bush3: P({ asset: 'plant_bush_3', flex: 0.04, dist: 95 }),
  bush4: P({ asset: 'plant_bush_4', flex: 0.04, dist: 95 }),
  bushBerry: P({ asset: 'plant_bush_berries', flex: 0.04, dist: 85 }),
  bushSnow: P({ asset: 'plant_bush_snow', flex: 0.02, dist: 85 }),
  fern1: P({ asset: 'plant_fern_1', dist: 60 }),
  fern2: P({ asset: 'plant_fern_2', dist: 55 }),
  flower1: P({ asset: 'plant_flower_1', dist: 45, flex: 0.09 }),
  flower2: P({ asset: 'plant_flower_2', dist: 45, flex: 0.09 }),
  flower4: P({ asset: 'plant_flower_4', dist: 50, flex: 0.08 }),
  sunflower: P({ asset: 'plant_sunflower_1', dist: 70, flex: 0.05 }),
  reed1: P({ asset: 'plant_reed_1', dist: 60, flex: 0.1 }),
  reed2: P({ asset: 'plant_reed_2', dist: 60, flex: 0.1 }),
  lily1: P({ asset: 'plant_lilypad_1', dist: 70, flex: 0, water: true }),
  lily2: P({ asset: 'plant_lilypad_2', dist: 70, flex: 0, water: true }),
  lotus: P({ asset: 'plant_lotus_1', dist: 70, flex: 0.02, water: true }),
  pumpkin1: P({ asset: 'plant_pumpkin_1', dist: 60, flex: 0, sculpt: ['pumpkin', 'sculpt_pumpkin_a', 1] }),
  pumpkin2: P({ asset: 'plant_pumpkin_2', dist: 60, flex: 0, sculpt: ['pumpkin', 'sculpt_pumpkin_b', 1] }),
  mushSmall1: P({ asset: 'plant_mushroom_small_1', dist: 40, flex: 0 }),
  mushSmall3: P({ asset: 'plant_mushroom_small_3', dist: 40, flex: 0 }),
  // ---- rocks & ground clutter
  boulder2: R({ asset: 'rock_boulder_2', dist: 110 }),
  boulder3: R({ asset: 'rock_boulder_3', dist: 160, breakable: true }),
  boulder4: R({ asset: 'rock_boulder_4', dist: 220, breakable: true, solid: true }),
  boulder5: R({ asset: 'rock_boulder_5', dist: 280, breakable: true, solid: true }),
  boulder6: R({ asset: 'rock_boulder_6', dist: 380, solid: true }),
  cliff1: R({ asset: 'rock_cliff_1', dist: 380, solid: true }),
  cliff2: R({ asset: 'rock_cliff_2', dist: 380, solid: true }),
  moss1: R({ asset: 'rock_moss_1', dist: 160, breakable: true, solid: true }),
  moss2: R({ asset: 'rock_moss_2', dist: 90 }),
  snowRock1: R({ asset: 'rock_snow_1', dist: 200, breakable: true, solid: true }),
  snowRock2: R({ asset: 'rock_snow_2', dist: 100 }),
  standing1: R({ asset: 'rock_standing_1', dist: 380, solid: true }),
  standing3: R({ asset: 'rock_standing_3', dist: 320, solid: true }),
  logMoss: R({ asset: 'nat_log_moss_1', dist: 90 }),
  log1: R({ asset: 'nat_log_1', dist: 80 }),
  stump: R({ asset: 'nat_stump_1', dist: 90 }),
  fallen1: R({ asset: 'nat_fallen_trunk_1', dist: 120, solid: true }),
  // ---- crystals (星晶野)
  crys1: { kind: 'crystal', asset: 'nat_crystal_cluster_1', far: null, flex: 0, dist: 260, breakable: true },
  crys2: { kind: 'crystal', asset: 'nat_crystal_cluster_2', far: null, flex: 0, dist: 260, breakable: true },
  crys3: { kind: 'crystal', asset: 'nat_crystal_cluster_3', far: null, flex: 0, dist: 260, breakable: true },
  crys4: { kind: 'crystal', asset: 'nat_crystal_cluster_4', far: null, flex: 0, dist: 260, breakable: true },
  crys6: { kind: 'crystal', asset: 'nat_crystal_cluster_6', far: null, flex: 0, dist: 300, breakable: true, solid: true },
  crysSpike: { kind: 'crystal', asset: 'nat_crystal_3', far: null, flex: 0, dist: 200, breakable: true },
  crysMineral: { kind: 'crystal', asset: 'nat_crystal_mineral_1', far: null, flex: 0, dist: 160, breakable: true },
};

/**
 * Per-material part rules. Returns { mode, crown, glow, tip, base?, dark? } for a source material name.
 * `dark` scales the baked grey ramp (leaves_dark becomes a darker shade of the same tint).
 */
export function partRule(sp, mat) {
  const k = sp.kind;
  if (k === 'tree') {
    if (sp.bamboo) return { mode: 'tint', crown: false };
    if (mat === 'trunk') return { mode: 'mul' };
    if (mat === 'snow') return { mode: 'mul', crown: true, base: 0xf1f6ff };
    if (mat === 'leaves_dark') return { mode: 'tint', crown: true, dark: 0.74, glow: 1.3, tip: [0.55, 0.98] };
    return { mode: 'tint', crown: true, glow: 1.3, tip: [0.55, 0.98] }; // leaves, blossom
  }
  if (k === 'shroom') {
    if (mat === 'cap') return { mode: 'tint', glow: 1.2 };
    return { mode: 'mul', base: 0x6f6a9c, glow: 0.22 };
  }
  if (k === 'crystal') {
    if (mat === 'rock') return { mode: 'mul', base: 0x55525f };
    return { mode: 'tint', glow: 1 };
  }
  if (k === 'rock') {
    if (mat === 'moss') return { mode: 'tint', dark: 0.9 };
    if (mat === 'snow') return { mode: 'mul', base: 0xf1f6ff };
    if (mat === 'cap') return { mode: 'tint', glow: 0.8 };
    if (mat === 'stem') return { mode: 'mul', base: 0xe0d6c4 };
    if (mat === 'cut') return { mode: 'mul', base: 0xc49a6c };
    return { mode: 'mul' };
  }
  // plants
  if (mat === 'leaves' || mat === 'petal' || mat === 'blossom' || mat === 'grain' || mat === 'fruit' || mat === 'cap') {
    const glow = mat === 'petal' || mat === 'cap' ? 1 : mat === 'leaves' ? 0.8 : 0;
    return { mode: 'tint', glow, tip: mat === 'leaves' ? [0.45, 1.0] : null };
  }
  if (mat === 'snow') return { mode: 'mul', base: 0xf1f6ff };
  if (mat === 'center' || mat === 'seed') return { mode: 'mul', base: mat === 'seed' ? 0x6a4520 : 0xffc23a, glow: 0.35 };
  if (mat === 'berry') return { mode: 'mul', base: 0xc8303a };
  if (mat === 'stem') return { mode: 'mul', base: 0x5f9a3a };
  return { mode: 'mul' };
}
