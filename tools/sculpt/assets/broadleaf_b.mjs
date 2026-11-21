// broadleaf_b — the tall, slim broadleaf of forest edges and the night land (replaces tree_broadleaf_5 / broad5: 9.5 m tall,
//   crown ~3.5 x 4.3 m, collider trunkR 0.32; broad4 and broadSnow map onto it scaled, see INSTALL.md).
// SILHOUETTE: a tall trunk with a slow S that leans toward the light; its crown hangs OFF-CENTRE on the lean side as a
//   column of five stacked leaf masses, and on the shaded side one bare DEAD bough juts out and ends in a broken stub.
// BIG FORMS: (1) the long smooth grey trunk with its leader running up into the crown, (2) the stacked masses, each
//   offset from the one below so the outline steps, (3) the dead bough — the one hard dark line against the sky.
// THE EYE RESTS ON: the dead bough's broken end and its two clawing twigs, the dark gaps between the stacked masses,
//   the root flare where the trunk grips the ground.
// WEAR STORY: it grew up crowded and reached for one gap of light; the shaded bough starved and died, lost its bark and
//   broke; smooth grey bark with darker rings, lichen on the shaded side.
// MUST NOT LOOK LIKE: a lollipop, a green sausage, a cone, a symmetric poplar, the pack's faceted column.
import { bunion, limb, plates, cloud, zig, floor0, crownValue, groundRoot, splinters, along, lit, farField, FAR, C, mix, ss } from './trees_c_lib.mjs';

const far = FAR();
const TRUNK = [[0, -0.2, 0], [0.04, 1.5, 0.04], [-0.04, 3.2, 0.2], [0.08, 5.0, 0.36], [0.22, 6.6, 0.42], [0.18, 7.8, 0.36]];
const CEN = [0.7, 6.4, 0.45];
// masses: [centre, radius, seed, satellites] — stacked, each offset from the one below (the crown leans +X / +Z)
const MASSES = [
  [[1.0, 5.55, 0.7], 1.25, 31, 2],        // 0 the heavy middle mass, out over +X/+Z (the light side)
  [[0.3, 7.05, 0.25], 1.0, 32, 2],        // 1 upper, swung back over the trunk
  [[1.05, 8.35, 0.5], 0.82, 33, 1],       // 2 the top, small, thrown out again (a flame-like S of masses)
  [[1.6, 4.45, -0.2], 0.72, 34, 1],       // 3 a low pendant mass under the middle one
  [[-0.55, 6.2, -0.35], 0.6, 35, 1],      // 4 a small mass on the windward side, a hollow between it and 0
  [[-0.55, 4.75, 0.85], 0.62, 36, 1],     // 5 (rev) a low mass on the bare side: anchors the crown over the pole
];
// side boughs from the trunk into each mass: [trunk fraction, mass, r0]
const BOUGHS = [[0.4, 5, 0.09], [0.45, 3, 0.1], [0.6, 0, 0.13], [0.7, 4, 0.08], [0.8, 1, 0.11], [1.0, 2, 0.09]];
const DEAD = [[-0.04, 3.95, 0.24], [-0.55, 4.2, 0.12], [-1.0, 4.3, -0.08], [-1.32, 4.55, -0.15]];

function bark(c) {
  const { x, y, z, nx, ny, nz, cavity, edge, S } = c;
  // (rev) ONE smooth grey bark with a natural gradient: dark, damp and mossy at the foot, lighter and cooler up the
  // pole (the crown's shade darkens it high up in the game; the paint never gets darker with height)
  let col = mix(C('#4f483f'), C('#7a7368'), ss(0.2, 2.8, y));
  col = mix(col, C('#8a8478'), ss(3.0, 6.5, y));
  const ring = ss(0.55, 0.9, S.fbm(x * 0.8, y * 6.5, z * 0.8, 3, 2) * 0.5 + 0.5);
  col = mix(col, C('#575047'), ring * 0.3);
  col = mix(col, C('#a29b8e'), edge * 0.45 * ss(0.5, 2, y));
  col = mix(col, C('#3a332c'), Math.min(1, cavity * 1.2));
  const n = S.fbm(x * 3, y * 3, z * 3, 8, 2);
  const lichen = ss(0.1, -0.6, nx) * ss(-0.05, 0.3, n) * ss(5, 1, y);
  col = mix(col, C('#7f8c58'), lichen * 0.5);
  const moss = Math.max(ss(0.8, 0.1, y) * ss(-0.1, 0.5, ny) * ss(-0.25, 0.15, n), ss(1.5, 0.2, y) * ss(0.2, -0.5, nz) * ss(-0.2, 0.2, n));
  col = mix(col, C('#64733a'), moss * 0.8);
  return mix(col, C('#3a3129'), ss(0.12, -0.02, y) * 0.5);
}
const BARK = lit(bark, 0.55, (c) => ss(0.1, 1.4, c.y));
const CROWN = { flat: 0.82, skin: 0.07, lobes: 13, satDist: 0.7, satR: 0.5, satDrop: 0.25, spread: 1.7, lobe: { k: 0.14, lr0: 0.3, lr1: 0.15, inset: [0.3, 0.2], satLobes: 8 } };
const boughPts = ([u, mi]) => {
  const a = along(TRUNK, u).p, [cc, cr] = MASSES[mi];
  const end = [cc[0] - (cc[0] - a[0]) * 0.25, cc[1] - cr * 0.3, cc[2] - (cc[2] - a[2]) * 0.25];
  return [a, [(a[0] + end[0]) / 2, (a[1] + end[1]) / 2 - 0.1, (a[2] + end[2]) / 2], end];
};
function farSpec() {
  const blobs = [];
  MASSES.forEach(([c, r, seed, sat]) => cloud(c, r, { seed, sat, out: [c[0] - CEN[0] + 0.3, 0.6, c[2] - CEN[2]], ...CROWN }).centres
    .forEach(([cc, rr], i) => blobs.push([cc, [rr * 1.02, rr * 0.82, rr * 1.02], seed * 3 + i])));
  const tubes = [[TRUNK.map((p) => [p[0], Math.max(0, p[1]), p[2]]), 0.42, 0.09, 6], [DEAD, 0.12, 0.07, 4]];
  BOUGHS.forEach((b) => { if (b[2] >= 0.09) { const p = boughPts(b); tubes.push([[p[0], p[2]], b[2], 0.05, 4]); } });
  return { blobs, tubes, crown: 'leaves', wood: 'bark' };
}
function deadwood(c) {
  const { cavity, edge } = c;
  // the starved bough: bark gone, silver-grey weathered wood, dark checks
  let col = mix(C('#a49c92'), C('#cfc7bb'), edge * 0.8);
  return mix(col, C('#4a443e'), Math.min(1, cavity * 1.4));
}

export default {
  name: 'broadleaf_b', id: 'sculpt_tree_broadleaf_b', species: ['broad5', 'broad4', 'broadSnow'],
  voxel: 0.022,
  lods: [5000, 1800, 500],
  farFrom: 2, farVoxel: 2.4, farSpec,
  ground: 0, aoRange: 1.0, aoStrength: 0.55, cavity: [0.04, 0.18], cavityDark: 0.35, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves', surface: 'leaf', look: { rim: 0.4, wrap: 0.45 } } },
  previewTint: [0.114, 0.423, 0.065],                                      // sunLeaf 0x5fae48 (linear)
  landTints: { 'NIGHT 26506e': [0.019, 0.08, 0.156], 'SUN 8fd060': [0.275, 0.631, 0.117], 'SNOW 3f7a58': [0.05, 0.195, 0.098] },
  replaces: { file: 'assets/models/nature/trees/tree_broadleaf_5.glb', tint: [0.114, 0.423, 0.065] },
  notes: 'Sculpted slim broadleaf with off-centre crown and a dead bough (broad5; broad4, broadSnow scaled). Materials trunk (mul) and leaves (tint). COLOR_0.a = top snow mask. See .tmp/sculpt/broadleaf_a/INSTALL.md.',
  build({ S }) {
    S.part('bark', { mat: 'wood', paint: BARK });
    S.part('deadwood', { mat: 'wood', paint: lit(deadwood, 0.55, 1) });
    S.part('leaves', { mat: 'crown', paint: (c) => { const v = crownValue(c, { cen: CEN, R: 1.9, ry: 2.4, lo: 0.42, hi: 1.0, seed: 6 }); return [v, v, v]; } });
    if (far) return floor0(farField(S, farSpec()));
    let trunk = limb(TRUNK, 0.36, 0.09, 0.62);
    trunk = trunk.softAdd(S.ellipsoid([0.5, 0.42, 0.48]).at(0, 0.0, 0.02), 0.22);
    const pieces = [trunk];
    if (!far) for (const [a, L, r, sd] of [[30, 0.95, 0.15, 1], [125, 0.8, 0.13, 2], [205, 1.05, 0.15, 3], [290, 0.85, 0.14, 4]]) pieces.push(groundRoot(a, L, r, { seed: sd, rt: 0.2, y0: 0.4 }));
    BOUGHS.forEach((b, i) => pieces.push(limb(zig(boughPts(b), 0.18, i + 7), b[2], 0.05, 0.8)));
    let wood = bunion(pieces, 0.08);
    if (!far) wood = plates(wood, { w: 0.32, h: 0.2, depth: 0.014, groove: 0.22, seed: 6, where: (x, y) => ss(5.5, 1.5, y) * 0.8 });
    wood = wood.part('bark', { mat: 'wood', paint: BARK });
    // the dead bough: bare, kinked, broken at the end; two claw twigs from its elbow
    const dp = [];
    dp.push(limb(DEAD, 0.12, 0.06, 0.8));
    {
      // (rev) no claws: the dead bough ends in a blunt break with short splinters, and two side twigs snapped short
      dp.push(...splinters(DEAD[3], [-0.8, 0.5, -0.2], 0.07, { n: 4, len: 0.12, seed: 3, rmin: 0.03 }));
      for (const [a, d, L, sd] of [[DEAD[2], [-0.3, 0.7, -0.6], 0.3, 4], [DEAD[1], [-0.1, -0.2, 0.95], 0.24, 5]]) {
        const dn = Math.hypot(...d), e = [a[0] + d[0] / dn * L, a[1] + d[1] / dn * L, a[2] + d[2] / dn * L];
        dp.push(limb([a, e], 0.05, 0.04, 1), ...splinters(e, d, 0.04, { n: 2, len: 0.07, seed: sd, rmin: 0.022 }));
      }
    }
    wood = wood.add(bunion(dp, 0.03).part('deadwood', { mat: 'wood', paint: lit(deadwood, 0.55, 1) }));
    const crownPaint = (c) => { const v = crownValue(c, { cen: CEN, R: 1.9, ry: 2.4, lo: 0.42, hi: 1.0, seed: 6 }); return [v, v, v]; };
    const shapes = [];
    MASSES.forEach(([c, r, seed, sat]) => shapes.push(...cloud(c, r, { seed, sat, out: [c[0] - CEN[0] + 0.3, 0.6, c[2] - CEN[2]], ...CROWN }).shapes));
    const crown = bunion(shapes, 0).part('leaves', { mat: 'crown', paint: crownPaint });
    return floor0(wood.add(crown));
  },
};
