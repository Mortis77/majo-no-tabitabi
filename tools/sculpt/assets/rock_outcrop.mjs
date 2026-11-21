// rock_outcrop — a jagged outcrop of dipping beds: a little cuesta, the beds tilted ~28 deg down to the east.
// SILHOUETTE: a wedge: a steep stepped scarp on the west end (tall), a long dip slope down to the east (low), its top
//   edge broken into two teeth by a joint.
// BIG FORMS: (1) the dip slope = the top of one hard bed, (2) the stepped scarp of bed ends on the west, (3) the two
//   long flanks where every bed shows as a ledge (hard beds proud, soft beds recessed).
// THE EYE RESTS ON: the stepped scarp, the joint that splits the crest into two teeth, and the ledges that all dip the
//   same way (the eye reads "layered rock pushed up" at once).
// WEAR STORY: tilted sediment; the soft beds wash out between the hard ones, frost opens the joint; moss in the bed
//   recesses and on the dip slope's damp north half; the scarp faces the weather (pitted, streaked).
// MUST NOT LOOK LIKE: a blob with stripes, horizontal terraces, a staircase of equal steps, or a symmetric pyramid.
import { rockDef, rockPoly, wearWhere, pl, vCrack, protoBefore } from './rock_common.mjs';

const DIP = 28 * Math.PI / 180, NB = [Math.sin(DIP), Math.cos(DIP), 0], T = 0.105;
const bedU = (x, y) => x * NB[0] + y * NB[1];

export default rockDef('rock_outcrop', {
  height: 0.92,
  bedPaint: (x, y, z) => bedU(x, y) / T,
  build(S) {
    const rnd = S.prng(4242);
    const env = [
      pl([-1, 0.12, 0.06], [-0.47, 0, 0]),       // scarp (west)
      pl([1, 0.3, 0.1], [0.52, 0, 0]),           // east toe
      pl([0.08, 0.06, 1], [0, 0, 0.36]), pl([-0.06, 0.1, -1], [0, 0, -0.37]),
      pl([-0.5, 0.2, 0.75], [-0.35, 0, 0.26]), pl([0.45, 0.25, -0.8], [0.35, 0, -0.25]),
    ];
    const top = 0.66;
    // beds of UNEQUAL thickness (u = height across the bedding): thick hard beds, thin soft partings between some of
    // them only; each hard bed steps back a little from the one below it (a cuesta, not a stack of plates)
    const BEDS = [[-0.4, 0.17, 0], [0.17, 0.2, 1], [0.2, 0.36, 0], [0.36, 0.39, 1], [0.39, 0.5, 0], [0.5, 0.53, 1], [0.53, top, 0]];
    const layers = [];
    BEDS.forEach(([u0, u1, soft], i) => {
      const inset = soft ? 0.03 + 0.012 * rnd() : 0.006 * rnd() + 0.012 * i;
      const pls = env.map(([a, b, c, d]) => [a + (rnd() - 0.5) * 0.06, b, c + (rnd() - 0.5) * 0.06, d - inset]);
      pls.push([NB[0], NB[1], 0, u1 + (u1 >= top ? 0 : 0.004)], [-NB[0], -NB[1], 0, -u0 + 0.004]);
      layers.push(rockPoly(pls, { k: soft ? 0.012 : 0.006, kSoft: 0.04, soft: (x, y, z) => S.ss(top - 0.08, top, bedU(x, y)) * S.ss(-0.1, -0.4, x), bounds: [-0.56, 0, -0.45, 0.6, 1.0, 0.45] }));   // revision 2: crisp bed edges; only the old weathered crest on the scarp end rounds
    });
    let body = S.union(...layers).part('stone');
    // the crest broken into two teeth by a joint across the strike, and the scarp's top block knocked back
    body = vCrack(S, body, { n: [1, 0.1, -0.35], at: [0.06, 0, 0], width: 0.07, depth: 0.15, bottom: 0.35, top: 0.95, wander: 0.03, seed: 9 });
    body = body.chip({ at: [-0.46, 0.86, 0.22], dir: [-0.5, 0.6, 0.6], depth: 0.1, spread: 0.6, seed: 2, rough: 0.004 });
    body = body.chip({ at: [0.2, 0.5, -0.33], dir: [0.2, 0.5, -0.8], depth: 0.07, spread: 0.7, seed: 6, rough: 0.004 });
    body = wearWhere(S, body, 0.014, (x, y, z) => S.ss(top - 0.1, top, bedU(x, y)), { vary: 0.6, seed: 7 });
    return body.wear(0.004, { vary: 0.4, seed: 8 });
  },
  before: () => protoBefore([{ opts: { seed: 41, planes: 10, bands: 5, lip: 0.16 }, size: [1.04, 0.92, 0.76] }]),
});
