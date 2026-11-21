// stump_a — the stump of a tree the wind broke (replaces nat_stump_1 / species stump: 1.30 x 0.59 x 0.99).
// SILHOUETTE: a short thick stump on a wide spread of roots, its top a broken crown of splinters — high on one side, torn
//   low on the other — and a thin sapling rising out of the root crotch: the forest starting again.
// BIG FORMS: (1) the flared foot and five roots gripping the ground (two long, three short, none alike), (2) the drum of
//   the stump with its bark in vertical plates, (3) the broken top: a tall splinter wall on the lee side, a ragged slope.
// THE EYE RESTS ON: the pale torn fibres of the break against the dark bark, the rotten dark pit in its heart, the
//   sapling's three leaf clumps, moss on the root backs.
// WEAR STORY: a storm snapped the tree (the break leans with the fall, toward +X); years since: the heart rotted, bark
//   plates loosened, moss climbed the roots from the damp north (-Z), a seedling took root in the crotch.
// MUST NOT LOOK LIKE: a pack stump (a cylinder with a flat sawn top and a ring of identical roots), a symmetric star.
import { bunion, limb, plates, furrows, rootLimb, mossBlanket, splinters, floorAt, brk, lit, grey, ss, mix, C, WOODPAINT as W, MOSSV, spray } from './bamboologs_lib.mjs';
import * as P from '../sdf.mjs';

const FARF = () => process.env.BL_FAR === '1';
const R0 = 0.3, TOP = 0.36;
const ROOTS = [[92, 0.4, 0.105, 1], [266, 0.36, 0.1, 2], [12, 0.18, 0.085, 3], [172, 0.22, 0.09, 4], [218, 0.16, 0.075, 5], [318, 0.17, 0.07, 6]];
const SAP = [0.14, 0.08, 0.3];

const paintBreak = (c) => {
  const { y } = c;
  // the torn top: pale fibres, greyer where weathered (low side), dark in the pit
  return mix(W.fresh(c), W.bare(c), ss(0.5, 0.36, y) * 0.6);
};
export default {
  name: 'stump_a', id: 'sculpt_nat_stump_a', species: ['stump'], view: 'prop',
  voxel: 0.006,
  lods: [2400, 800, 250],
  farFrom: 2, farVoxel: 2.6,
  ground: 0, aoRange: 0.2, aoStrength: 0.55, cavity: [0.006, 0.03], cavityDark: 0.4, creaseAngle: 50,
  materials: { wood: { name: 'trunk', surface: 'bark' }, crown: { name: 'moss', surface: 'none' } },
  tintMats: ['crown'], tintK: { crown: 0.9 },
  previewTint: [0.159, 0.347, 0.069],
  landTints: { 'DUSK MOSS 9a8f3a': { crown: [0.323, 0.275, 0.042] }, 'NIGHT MOSS 2a6a66': { crown: [0.023, 0.145, 0.133] } },
  replaces: { file: 'assets/models/refined/nat_stump_1.glb', rules: { cut: { mul: [0.552, 0.323, 0.147] }, moss: { tint: [0.159, 0.347, 0.069], k: 0.9 } } },
  notes: 'Sculpted broken stump with a sapling (stump). trunk (mul, real colour), moss (tint: moss cushions and the sapling leaves). COLOR_0.a = snow mask. See .tmp/sculpt/bamboo_a/INSTALL.md.',
  heroAz: 40, gameAz: 35,
  build({ S }) {
    const far = FARF();
    S.part('bark', { mat: 'wood', paint: lit(W.bark) }); S.part('torn', { mat: 'wood', paint: lit(paintBreak) }); S.part('pit', { mat: 'wood', paint: lit(W.hollow) });
    S.part('sapstem', { mat: 'wood', paint: lit(W.sapling) }); S.part('stumpmoss', { mat: 'crown', paint: MOSSV }); S.part('sapleaf', { mat: 'crown', paint: MOSSV });
    // the drum: slightly oval, leaning a little with the fall (+X), the flare
    let drum = P.taperedCapsule([0.0, -0.1, 0.0], [0.03, TOP + 0.25, 0.0], R0 * 1.08, R0 * 0.94).scale([1.0, 1, 0.92]);
    const flare = P.ellipsoid([R0 * 1.3, 0.16, R0 * 1.22]).at(0.0, 0.0, -0.01);
    let wood = drum.softAdd(flare, 0.1);
    const roots = ROOTS.filter((r) => !far || r[2] >= 0.1).map(([a, L, r, sd]) => rootLimb(a, L, r, { seed: sd, rt: R0 * 0.9, y0: 0.24 + 0.1 * (sd % 2) }));
    wood = wood.softAdd(bunion(roots), 0.06);
    if (!far) wood = furrows(wood, { axis: 'y', centre: () => [0.01, 0], n: 10, depth: 0.02, width: 0.15, wob: 1.2, seed: 3, plate: 0.25, where: (x, y) => ss(0.06, 0.16, y) * ss(TOP + 0.12, TOP - 0.02, y) });
    wood = wood.part('bark', { mat: 'wood', paint: lit(W.bark) });
    // the break: a slope down toward -X (torn low), a tall splinter wall left standing on the +X lee side
    const cutA = P.plane(P.norm([0.42, -1, 0.12]), [0.0, TOP + 0.03, 0.0]).intersect(P.box([1, 0.6, 1]).at(0, TOP + 0.35, 0));
    wood = wood.cut(cutA.part('torn', { mat: 'wood', paint: lit(paintBreak) }), { paintCut: true });
    if (!far) {
      for (const [p, d, dep, sd] of [[[-0.18, TOP - 0.03, 0.12], [-0.6, 0.8, 0.2], 0.05, 1], [[0.05, TOP + 0.03, -0.2], [0.1, 0.8, -0.6], 0.045, 2], [[-0.22, TOP - 0.06, -0.12], [-0.7, 0.7, -0.2], 0.04, 3]]) wood = wood.cut(brk(p, d, dep, { seed: sd }).part('torn', { mat: 'wood', paint: lit(paintBreak) }), { paintCut: true });
      // the splinter wall: tall tapering fibres standing on the high side, leaning with the fall
      const sp = [];
      for (const [x, z, h, r, sd] of [[0.21, -0.05, 0.12, 0.05, 1], [0.18, 0.1, 0.09, 0.045, 2], [0.22, -0.16, 0.07, 0.04, 3], [0.09, 0.17, 0.05, 0.035, 4]]) {
        const b = [x, TOP + 0.06 + x * 0.42 - 0.04, z];
        sp.push(P.taperedCapsule(b, [b[0] + 0.03, b[1] + h, b[2] + (P.prng(sd)() - 0.5) * 0.03], r, 0.009));
      }
      wood = wood.add(bunion(sp, 0.012).part('torn', { mat: 'wood', paint: lit(paintBreak) }));
      // the rotten heart: a dark pit sinking into the break
      wood = wood.softCut(P.ellipsoid([0.075, 0.14, 0.055]).turn(0, 30, 0).at(-0.05, TOP + 0.0, 0.03).part('pit', { mat: 'wood', paint: lit(W.hollow) }), 0.03, { paintCut: true });
    }
    let all = wood;
    // moss: cushions on the root backs and the damp north foot
    const moss = mossBlanket(wood, far ? 0.03 : 0.022, (x, y, z) => {
      // on the backs of the roots (up-facing, away from the drum) and a little up the damp north side
      const r = Math.hypot(x, z), north = ss(0.1, -0.35, z), onRoot = ss(0.3, 0.42, r) * ss(0.16, 0.06, y);
      return Math.max(onRoot * (0.5 + 0.5 * north), north * ss(0.3, 0.1, y) * 0.6) - 0.5 + 0.3 * P.fbm(x * 7, y * 7, z * 7, 11, 2);
    }, { seed: 9, scale: 0.05, taper: 0.15, edge: 0.4, bump: 0.3 });
    all = all.add(moss.part('stumpmoss', { mat: 'crown', paint: MOSSV }));
    // the sapling in the root crotch (+Z): a thin bent stem, three small leaf clumps
    const stem = limb([[SAP[0], SAP[1] - 0.06, SAP[2]], [SAP[0] + 0.02, SAP[1] + 0.12, SAP[2] + 0.04], [SAP[0] - 0.01, SAP[1] + 0.26, SAP[2] + 0.07], [SAP[0] + 0.02, SAP[1] + 0.36, SAP[2] + 0.06]], 0.016, 0.011, 1);
    all = all.add(stem.part('sapstem', { mat: 'wood', paint: lit(W.sapling) }));
    const lv = [];
    for (const [c, yaw, rx, sd] of [[[SAP[0] + 0.09, SAP[1] + 0.2, SAP[2] + 0.08], 70, 0.09, 1], [[SAP[0] - 0.08, SAP[1] + 0.29, SAP[2] + 0.1], 250, 0.085, 2], [[SAP[0] + 0.03, SAP[1] + 0.39, SAP[2] + 0.07], 20, 0.095, 3]]) lv.push(spray(c, { rx, rz: rx * 0.75, th: 0.035, yaw, seed: sd, lobes: 4, tips: 0.6, droop: 0.4, far }));
    all = all.add(bunion(lv).part('sapleaf', { mat: 'crown', paint: MOSSV }));
    return floorAt(all, 0);
  },
};
