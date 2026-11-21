// 岩起 column, variant C — the same basalt, many slender prisms: a leaning sheaf of nine with a ragged crown.
// Silhouette: a tight sheaf leaning clearly to one side, three outer prisms broken 0.3-0.6 m low, one flank standing
//   proud, a skirt of short flanks stepping down the low side.
// Big forms: the leaning sheaf; the ragged stepped crown; the soil-caked foot with roots.
// Eye rests on: the crown's steps against the sky; the many dark seams with stones caught in them; the joint bands.
// Wear story: torn up a second ago and still tipping — fresh breaks, soil and roots on the foot, damp below.
// Must not look like: a pile of slabs, a fluted cylinder, a rock type different from A and B.
import * as S from '../sdf.mjs';
import * as K from './earth_column_common.mjs';

const rnd = S.prng(3119);
const seeds = [[0.35, 0.1], [-0.4, -0.25]];
for (let i = 0; i < 7; i++) { const a = (i / 7) * 2 * Math.PI + 0.2 + (rnd() - 0.5) * 0.45; seeds.push([Math.cos(a) * (1.35 + rnd() * 0.25), Math.sin(a) * (1.35 + rnd() * 0.25)]); }
const TOP = K.TOP;

export default K.columnAsset('earth_column_c',
  'Earth-spell column C (leaning sheaf of nine slender prisms). Pivot = base centre at ground level; extends 0.6 m below ground, standable top at 6.0 m. LOD0 atlas + object-space normal map (extras.normalSpace=object); LOD1 vertex colours. See .tmp/sculpt/earth_column_c/INSTALL.md.',
  {
    seed: 3119, seeds, outerR: 2.0, outerN: 13,
    push: [1, 1, 1.07, 0.96, 1.1, 0.98, 1.06, 0.95, 1.08],
    drop: { 3: 0.3, 5: 0.55, 6: 0.4 },
    beds: K.bedHeights(S.prng(57), -0.6, 6.0, 1.1, 0.35),
    flanks: [[1.2, 2.12, 0.4, TOP + 0.45, 0.4], [3.3, 1.95, 0.45, TOP - 2.6], [3.9, 1.95, 0.42, TOP - 3.7], [4.6, 1.92, 0.44, 1.2]],
    proud: 0,
    crown: [[0.3, 0.3], [2.4, 0.26]],
    lean: [-0.07, 0.045], seamW: 0.12,
  }, { lodError: [0.04, 0.1], before: 2.2 });
