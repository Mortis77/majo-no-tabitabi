// dead_b — the tall dead snag of 常夜原 (replaces tree_dead_2 / dead2: 7 m tall, 2.3 x 0.84 m, collider trunkR 0.22).
// SILHOUETTE: one tall, slightly wind-bent pole whose top SNAPPED off in a crown of long splinters; a few short arms, the
//   longest reaching down-wind, every one snapped off in splinters; a swollen burl low on the trunk, bracket fungi above it.
// BIG FORMS: (1) the long tapering pole with its flared foot, (2) the jagged broken top, (3) the burl and the three arms.
// THE EYE RESTS ON: the round bird's hole high on the front with its dark inside and worn lip, the burl, the splintered
//   top against the sky.
// WEAR STORY: a tree that died standing; woodpeckers came for the soft wood and a bird nests in the hole; the bark has
//   fallen from all but three patches near the base; long dry splits run up the silver wood; fungus eats the soft side.
// MUST NOT LOOK LIKE: a telegraph pole, a straight stick with pins, the pack snag, an even pattern of branches.
import { bunion, limb, plates, zig, floor0, groundRoot, buttress, splinters, barkPlate, burl, along, lit, FAR, C, mix, ss } from './trees_c_lib.mjs';

const far = FAR();
const POLE = [[0, -0.2, 0], [0.06, 1.3, 0.0], [0.22, 2.8, 0.04], [0.48, 4.3, 0.05], [0.7, 5.5, 0.02], [0.78, 6.3, -0.02]];
// arms: [fraction, offsets (from the pole point), r0, end]
const ARMS = [
  [0.47, [[0.5, 0.15, 0.1], [0.95, 0.3, 0.12], [1.25, 0.15, 0.05]], 0.13, 'break'],      // the long down-wind arm, sagging
  [0.6, [[-0.35, 0.3, 0.05], [-0.7, 0.55, 0.12], [-0.8, 0.95, 0.1]], 0.1, 'break'],
  [0.9, [[0.3, 0.25, 0.1], [0.55, 0.6, 0.15], [0.6, 0.85, 0.1]], 0.07, 'break'],   // the up-turned windward arm
  [0.78, [[0.35, 0.2, -0.12], [0.6, 0.32, -0.18]], 0.07, 'stub'],
  [0.3, [[-0.32, 0.12, -0.1]], 0.08, 'stub'],
];
const HOLE = [0.5, 4.45, 0.21];       // the bird's hole (front, +Z)
// (rev) three patches of the last bark near the base; two bracket fungi above the burl: [centre, yaw deg, size]
const PATCH = [[[-0.2, 1.0, 0.05], 0.4], [[0.08, 1.45, -0.22], 0.45], [[0.27, 0.7, -0.1], 0.35]];
const FUNGI = [[[0.2, 2.75, 0.24], 35, 0.17], [[0.28, 2.98, 0.18], 60, 0.12]];

function wood(c) {
  const { x, y, z, ny, cavity, edge, S } = c;
  let col = mix(C('#746b63'), C('#8c847a'), ss(2.5, 6, y));
  col = mix(col, C('#b5ac9f'), edge * 0.6);
  col = mix(col, C('#2c2724'), Math.min(1, cavity * 1.4));
  // (rev) the last bark in three patches low on the pole (round the hanging plates), not an all-round band
  const n = S.fbm(x * 3, y * 1.2, z * 3, 61, 2);
  let patch = 0;
  for (const [p, r] of PATCH) patch = Math.max(patch, ss(r, r * 0.6, Math.hypot(x - p[0], (y - p[1]) * 0.6, z - p[2]) + 0.12 * n));
  col = mix(col, mix(C('#5b5048'), C('#7a6c60'), edge), patch * 0.85);
  col = mix(col, C('#4a423c'), ss(0.25, 0.0, y) * 0.5);
  if (far) {
    // LOD2 keeps its identity as paint: the bird's hole (dark disc + worn rim), the fungi (pale ochre), the burl
    const dh = Math.hypot((x - HOLE[0]) / 0.1, (y - HOLE[1]) / 0.12, (z - HOLE[2]) / 0.2);
    col = mix(col, C('#a39582'), ss(1.9, 1.4, dh) * ss(0.8, 1.2, dh));
    col = mix(col, C('#171311'), ss(1.15, 0.85, dh));
    for (const [p, , r] of FUNGI) col = mix(col, C('#c49a5c'), ss(1.3, 0.9, Math.hypot((x - p[0]) / (r * 1.4), (y - p[1]) / (r * 0.6), (z - p[2]) / (r * 1.4))));
  }
  return col;
}
function fungus(c) {
  const { ny, cavity, edge } = c;
  // bracket fungus: ochre top with a pale growing rim, dark gills underneath
  let col = mix(C('#a47a44'), C('#d8bf8c'), edge * 0.8);
  col = mix(col, C('#4a3828'), ss(0.0, -0.6, ny));
  return mix(col, C('#2a2018'), Math.min(1, cavity * 1.2));
}
function bark(c) {
  const { ny, cavity, edge } = c;
  let col = mix(C('#5d524a'), C('#8a7462'), ss(-0.2, -0.7, ny));
  col = mix(col, C('#8c8279'), edge * 0.5);
  return mix(col, C('#2a2420'), Math.min(1, cavity * 1.3));
}
function burlPaint(c) {
  const { cavity, edge } = c;
  let col = mix(C('#6e6258'), C('#a3968a'), edge);
  return mix(col, C('#2e2622'), Math.min(1, cavity * 1.6));
}
function hollow(c) {
  const { ao, edge } = c;
  return mix(mix(C('#171311'), C('#33281f'), ao), C('#5a4d43'), edge * 0.45);
}

export default {
  name: 'dead_b', id: 'sculpt_tree_dead_b', species: ['dead2'],
  voxel: 0.016,
  lods: [5000, 1800, 500],
  farFrom: 2, farVoxel: 2.4,
  ground: 0, aoRange: 0.6, aoStrength: 0.5, cavity: [0.03, 0.12], cavityDark: 0.35, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.25 } } },
  previewTint: [1, 1, 1],
  replaces: { file: 'assets/models/nature/trees/tree_dead_2.glb', tint: [1, 1, 1] },
  notes: 'Sculpted dead snag with a burl and a bird hole (dead2). One material trunk (mul). No crown part. COLOR_0.a = top snow mask. See .tmp/sculpt/broadleaf_a/INSTALL.md.',
  anchors: { birdHole: [HOLE[0], HOLE[1], HOLE[2] + 0.05] },
  build({ S }) {
    S.part('deadwood', { mat: 'wood', paint: lit(wood, 0.5, 0.3) });
    S.part('barkplate', { mat: 'wood', paint: lit(bark, 0.5, 0.3) });
    S.part('burl', { mat: 'wood', paint: lit(burlPaint, 0.5, 0.3) });
    S.part('hollow', { mat: 'wood', paint: lit(hollow, 0.5, 0.3) });
    S.part('fungus', { mat: 'wood', paint: lit(fungus, 0.5, 0.3) });
    let pole = limb(POLE, 0.27, 0.11, 0.7).softAdd(S.ellipsoid([0.38, 0.34, 0.34]).at(0, 0, 0), 0.18);
    const pieces = [pole];
    if (!far) {
      for (const [a, L, r, h, sd] of [[95, 0.55, 0.17, 0.6, 1], [215, 0.5, 0.16, 0.55, 2], [330, 0.6, 0.17, 0.65, 3]]) pieces.push(buttress(a, L, r, h, { seed: sd, rt: 0.17 }));
      for (const [a, L, r, sd] of [[150, 1.0, 0.08, 4], [20, 0.85, 0.07, 5], [270, 0.9, 0.075, 6]]) pieces.push(groundRoot(a, L, r, { seed: sd, rt: 0.3, y0: 0.1 }));
    }
    const ends = [];
    ARMS.forEach(([u, offs, r0, kind], i) => {
      const a = along(POLE, u).p, pts = [a, ...offs.map((o) => [a[0] + o[0], a[1] + o[1], a[2] + o[2]])];
      if (far && r0 < 0.075) return;
      pieces.push(limb(far || pts.length < 3 ? pts : zig(pts, 0.12, i + 3), r0, kind === 'stub' ? r0 * 0.65 : r0 * 0.5, 0.85));
      const e = pts.at(-1), p = pts.at(-2);
      ends.push([e, [e[0] - p[0], e[1] - p[1], e[2] - p[2]], kind, r0, i]);
    });
    let w = bunion(pieces, 0.07);
    if (!far) {
      // (rev) long vertical dry splits up the silver pole (cells 6 m tall), none on the arms or the foot
      w = plates(w, { w: 0.34, h: 6.0, depth: 0.022, groove: 0.075, seed: 62, where: (x, y) => ss(0.2, 0.6, y) * ss(6.0, 5.4, y) });
      const extra = [];
      // the snapped top: a crown of long splinters, the tallest on the windward side
      extra.push(...splinters(POLE.at(-1), [0.15, 1, 0], 0.11, { n: 5, len: 0.6, seed: 71, rmin: 0.022 }));
      for (const [e, d, kind, r0, i] of ends) {
        // (rev) no claws: every arm snapped, a jagged end of splinters (long arms: longer, fewer splinters)
        if (kind === 'stub') extra.push(...splinters(e, d, r0 * 0.65, { n: 3, len: 0.14, seed: 80 + i, rmin: 0.02 }));
        else extra.push(...splinters(e, d, r0 * 0.5, { n: i === 0 ? 4 : 3, len: i === 0 ? 0.3 : 0.22, seed: 90 + i, rmin: 0.022 }));
      }
      w = w.add(bunion(extra, 0.015));
    }
    w = w.part('deadwood', { mat: 'wood', paint: lit(wood, 0.5, 0.3) });
    // the burl: a lumpy swelling low on the windward side
    const bpos = along(POLE, 0.36).p;
    w = w.softAdd(burl([bpos[0] + 0.18, bpos[1], bpos[2] + 0.1], 70, 0.2, 5).part('burl', { mat: 'wood', paint: lit(burlPaint, 0.5, 0.3) }), 0.06);
    if (!far) {
      // the bird's hole: a worn round lip, a round entrance, a dark cavity behind it
      w = w.softAdd(S.ellipsoid([0.14, 0.16, 0.08]).at(HOLE[0], HOLE[1], HOLE[2] - 0.02).part('deadwood', { mat: 'wood', paint: lit(wood, 0.5, 0.3) }), 0.05);
      const hole = S.capsule([HOLE[0], HOLE[1], HOLE[2] + 0.14], [HOLE[0], HOLE[1], HOLE[2] - 0.12], 0.068)
        .add(S.ellipsoid([0.075, 0.12, 0.075]).at(HOLE[0], HOLE[1] - 0.05, HOLE[2] - 0.16)).part('hollow', { mat: 'wood', paint: lit(hollow, 0.5, 0.3) });
      w = w.softCut(hole, 0.015, { paintCut: true });
      const pl = [];
      for (const [p, a, o] of [[[-0.24, 1.0, 0.05], -90, { w: 0.2, h: 0.5, peel: 14 }], [[0.08, 1.5, -0.24], 180, { w: 0.22, h: 0.55, peel: 18 }], [[0.3, 0.75, -0.1], 110, { w: 0.18, h: 0.4, peel: 12 }]])
        pl.push(barkPlate(p, a, { t: 0.045, curl: 0.2, ...o }));
      w = w.add(bunion(pl).part('barkplate', { mat: 'wood', paint: lit(bark, 0.5, 0.3) }));
      // two bracket fungi above the burl: flat shelves, rounded front edge, set into the wood
      const fg = FUNGI.map(([p, a, r]) => S.ellipsoid([r, r * 0.32, r * 0.75]).softAdd(S.ellipsoid([r * 0.7, r * 0.22, r * 0.5]).at(0, r * 0.2, -r * 0.1), r * 0.15).turn(-6, a, 0).at(p[0], p[1], p[2]));
      w = w.add(bunion(fg, 0.03).part('fungus', { mat: 'wood', paint: lit(fungus, 0.5, 0.3) }));
    }
    return floor0(w);
  },
};
