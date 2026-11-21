// 岩起 column, variant A — the family's reference: a bundle of six basalt prisms torn out of the earth.
// Silhouette: a fat bundle with a level standing top, three outer prisms broken 0.4-0.6 m lower, one flanking prism
//   standing proud above the crown, three shorter flanks stepping down the other side like broken organ pipes.
// Big forms: the core bundle; the stepped crown (low pair + proud flank); the soil-caked, rooted foot.
// Eye rests on: the broken crown with its pale fresh breaks; the dark V-seams between prisms with stones jammed in them;
//   the cross joints (strata) that step each prism into drums of different value.
// Wear story: underground a second ago — sharp fresh breaks at the crown, soil and roots below, damp foot, dry dusty top.
// Must not look like: one primitive prism, a symmetric fluted column, a level drum, even noise all over.
import * as S from '../sdf.mjs';
import * as K from './earth_column_common.mjs';

const rnd = S.prng(1301);
const seeds = [[0.3, -0.2]];
for (let i = 0; i < 5; i++) { const a = (i / 5) * 2 * Math.PI + 0.4 + (rnd() - 0.5) * 0.7; seeds.push([Math.cos(a) * (1.15 + rnd() * 0.35), Math.sin(a) * (1.15 + rnd() * 0.35)]); }
const TOP = K.TOP;

export default K.columnAsset('earth_column_a',
  'Earth-spell column A (bundle of six prisms, three dropped, one proud). Pivot = base centre at ground level; extends 0.6 m below ground, standable top at 6.0 m. LOD0 atlas + object-space normal map (extras.normalSpace=object); LOD1 vertex colours. See .tmp/sculpt/earth_column_a/INSTALL.md.',
  {
    seed: 1301, seeds, outerR: 2.0, outerN: 11,
    push: [1, 1.12, 0.93, 1.14, 0.95, 1.08],
    drop: { 2: 0.38, 3: 0.6, 5: 0.48 }, dropR: 1.62,
    beds: K.bedHeights(S.prng(77), -0.6, 6.0, 0.95, 0.4),
    flanks: [[0.95, 2.12, 0.44, TOP + 0.4, 0.4], [2.35, 1.95, 0.5, TOP - 1.9], [3.7, 1.9, 0.58, TOP - 3.2], [5.0, 1.92, 0.46, 1.5]],
    proud: 0,
    crown: [[0.15, 0.36], [1.6, 0.26], [4.4, 0.3]],
    lean: [0.012, 0.006],
  }, { lodError: [0.04, 0.1] });
