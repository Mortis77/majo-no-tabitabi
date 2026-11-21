// rock_boulder_a — the meadow boulder: old, frost-rounded on its crown, SPLIT in two by a frost crack.
// SILHOUETTE: a low loaf higher on the north-east, cut through by one dark gap from crown to ground; the east half has
//   settled a few cm lower and turned a little, so the two halves no longer match — the split is the read at any distance.
// BIG FORMS: (1) the rounded, bleached crown, (2) the big flat old fracture plane on the east side (one clean slope that
//   catches the light), (3) the step across the south front (a ledge where a shell of the front came away long ago).
// THE EYE RESTS ON: the frost split (dark, mossy inside, its walls flat and offset), the pale chipped south-west corner,
//   and the ledge's crisp riser.
// WEAR STORY: water froze in a joint and opened it right through; the east half slid; the crown is worn round by
//   centuries of rain, the breaks lower down keep crisp edges; the west is pitted, the north damp and mossy.
// MUST NOT LOOK LIKE: a pillow, a dough loaf, a sphere with noise, a symmetric bun, or evenly bumpy.
import { rockDef, rockPoly, wearWhere, halfSpace, pl, breakAway, floor0, protoBefore } from './rock_common.mjs';

const H = 0.64;
export default rockDef('rock_boulder_a', {
  height: H,
  build(S) {
    // big planes, few: a crown, four flanks of unequal size, and the old east fracture plane (steep, flat, broad)
    const planes = [
      pl([-0.2, 1, 0.12], [0.02, 0.675, 0]),           // crown
      pl([-0.85, 0.4, 0.05], [-0.42, 0.3, 0]),         // west flank (weather)
      pl([-0.35, 0.45, -0.9], [-0.15, 0.3, -0.25]),   // north flank
      pl([-0.2, 0.25, 1], [0, 0.25, 0.39]),           // south front
      pl([0.95, 0.42, 0.2], [0.36, 0.3, 0.06]),        // east: the big old fracture plane
      pl([0.55, 0.5, -0.75], [0.28, 0.3, -0.22]),      // north-east shoulder
      pl([-0.7, 0.55, 0.55], [-0.33, 0.38, 0.27]),     // south-west shoulder
      pl([-0.65, 0.7, -0.6], [-0.32, 0.45, -0.28]),   // north-west crown bevel
      pl([0.45, 0.85, 0.35], [0.3, 0.5, 0.2]),        // south-east crown bevel
      pl([0.7, 0.08, 0.7], [0.34, 0.2, 0.26]),          // south-east foot corner
      pl([-0.75, 0.05, -0.7], [-0.36, 0.2, -0.28]),   // north-west foot corner
    ];
    const crown = (x, y, z) => S.ss(0.44, 0.62, y) * (1 - 0.8 * S.ss(0.15, 0.35, x));   // the east break stays crisp
    let body = rockPoly(planes, { k: 0.006, kSoft: 0.045, soft: crown, bounds: [-0.72, 0, -0.66, 0.72, 0.75, 0.62] }).part('stone');
    body = body.rough({ type: 'fbm', scale: 0.5, amp: 0.004, oct: 1, seed: 4 });
    // the ledge across the south front: a shell came off, leaving a tread (~0.3 m, sloping down to the front and the
    // west) and a riser that leans back ~6–9 cm behind the old face
    body = body.cut(S.plane([0.05, -0.3, -1], [0, 0.3, 0.305]).intersect(S.plane([0.08, -1, -0.15], [0, 0.29, 0.35])));
    // the chipped south-west corner (fresh, pale, crisp) — after the wear so it stays sharp
    body = wearWhere(S, body, 0.016, crown, { vary: 0.6, seed: 8 });
    body = body.cut(breakAway(S, { n: [-0.6, 0.45, 0.66], at: [-0.29, 0.36, 0.26], bowl: 0.02, r: 0.18 }).part('fresh'), { paintCut: true });
    // the frost split, right through: two halves, the east one settled 2.5 cm and slid 1.5 cm along the joint
    const J = { n: [0.93, 0.05, 0.36], at: [0.07, 0, 0], wander: 0.035, seed: 7 };
    const gap = (y) => 0.009 + 0.016 * S.ss(0.05, H, y);
    const west = body.intersect(halfSpace(S, { ...J, gap, side: -1 }));
    const east = body.intersect(halfSpace(S, { ...J, gap, side: 1 })).turn(0, -1.5, 0).at(0.006, -0.022, 0.008);
    return floor0(S, west.add(east)).wear(0.004, { vary: 0.4, seed: 9 });
  },
  before: () => protoBefore([{ opts: { seed: 11, planes: 10 }, size: [1.1, 0.64, 0.96] }]),
});
