// 岩起 column, variant B — the same basalt, fewer and fatter prisms: four thick columns, leaning, crown torn on one side.
// Silhouette: a stout bundle leaning a little, the crown broken on one side (two prisms dropped 0.35 / 0.6 m), one
//   flanking prism standing proud on the other side, two short flanks stepping down below the low side.
// Big forms: the four fat prisms (each ~2 m wide); the stepped, torn crown; the soil-caked foot.
// Eye rests on: the dropped pair's pale breaks against the dark seams; the proud prism; the staggered cross joints.
// Wear story: torn up a second ago — fresh breaks at the crown, soil and roots below, damp foot.
// Must not look like: a different rock type from A and C, a ruler-striped cake, a gabled roof, a level drum.
import * as S from '../sdf.mjs';
import * as K from './earth_column_common.mjs';

const rnd = S.prng(2207);
const seeds = [];
for (let i = 0; i < 4; i++) { const a = (i / 4) * 2 * Math.PI + 0.5 + (rnd() - 0.5) * 0.4; seeds.push([Math.cos(a) * (0.95 + rnd() * 0.2), Math.sin(a) * (0.95 + rnd() * 0.2)]); }
const TOP = K.TOP;

export default K.columnAsset('earth_column_b',
  'Earth-spell column B (four fat prisms, two dropped, one proud flank). Pivot = base centre at ground level; extends 0.6 m below ground, standable top at 6.0 m. LOD0 atlas + object-space normal map (extras.normalSpace=object); LOD1 vertex colours. See .tmp/sculpt/earth_column_b/INSTALL.md.',
  {
    seed: 2207, seeds, outerR: 2.02, outerN: 10,
    push: [1, 1.07, 0.95, 1.1],
    drop: { 1: 0.6, 2: 0.35 },
    beds: K.bedHeights(S.prng(91), -0.6, 6.0, 0.8, 0.5),
    take: 0.4,
    flanks: [[0.2, 2.1, 0.46, TOP + 0.35, 0.4], [3.4, 1.95, 0.55, TOP - 2.4], [4.2, 1.93, 0.5, TOP - 3.6]],
    proud: 0,
    crown: [[2.9, 0.3], [5.4, 0.26]],
    lean: [0.03, -0.02], seamW: 0.14, roots: 2, pebbles: 3, cakes: 2,
  }, { lodError: [0.04, 0.1], before: 1.3, hardAngle: 40 });
