// shroom_small_b — a squat family of toadstools for the forest floor. Replaces plant_mushroom_small_3 (flora
//   `mushSmall3`: 0.40 x 0.40 x 0.39 m, foot centre on y = 0, scaled 1.2-3.4x, INSTANCED; cap = tint + glow).
// SILHOUETTE: one broad, flat cap tipped back like a hat pushed up, its rim turned up and torn on one side; a smaller
//   dome leaning out from under it; a closed button at the foot. Stout stems with a swollen base.
// BIG FORMS: (1) the big flat cap and its upturned rim; (2) the leaning dome; (3) the stout stems in one clump.
// THE EYE RESTS ON: the upturned, torn rim of the big cap with the gills showing over it, the button.
// WEAR STORY: the big one is past its best — the rim has curled up and split, showing its gills to the sky; the small
//   one is in its prime; a slug has nibbled the button.
// MUST NOT LOOK LIKE: a pack toadstool (red dome, white spots), a stack of identical domes, symmetric.
import * as P from '../sdf.mjs';
import { SMALL_MATS, SMALL_TINT, capParts, capWarp, rimSplit, floorAt, paintCapSkin, paintGill, mix, C, ss, clamp, grey } from './shroomcrystal_lib.mjs';

function paintStalk(c) {
  const { y, cavity, edge, ao } = c;
  let col = P.mul(mix(C('#dccdb6'), C('#f7eee0'), ss(0.0, 0.18, y)), 1.08);
  col = mix(col, C('#fcf7ef'), edge * 0.5);
  col = mix(col, C('#806a58'), ss(0.04, 0.0, y) * 0.6);
  col = mix(col, C('#8c7a6a'), clamp(cavity * 1.3, 0, 1) * 0.5);
  return P.mul(col, 1 + 0.4 * (1 - ao));
}

export default {
  name: 'shroom_small_b', id: 'sculpt_shroom_small_b',
  voxel: 0.0015, lods: [900, 300], lodError: [0.0025, 0.006],
  ground: 0, aoRange: 0.06, aoStrength: 0.45, cavity: [0.002, 0.008], creaseAngle: 50, hardAngle: 60,
  materials: SMALL_MATS, previewTint: SMALL_TINT,
  replaces: { file: 'assets/models/refined/plant_mushroom_small_3.glb', scale: 1, tint: { cap: SMALL_TINT.cap, stem: [0.11, 0.32, 0.04] } },
  notes: 'Sculpted small toadstool group. Vertex colours on every LOD. cap = caps + gills (tint + glow), stalk = painted colour.',
  build() {
    // the big one: flat cap, rim turned UP (an old cap), gills showing
    const big = capParts({
      top: [[0, 0.052], [0.05, 0.05], [0.1, 0.038], [0.14, 0.026], [0.158, 0.03], [0.166, 0.038]],
      under: [[0.16, 0.026], [0.13, 0.012], [0.09, 0.008], [0.05, 0.012], [0.024, 0.016]],
      gills: { n: 22, t: 0.0048, depth: (r) => 0.012 * Math.sin(Math.PI * (r - 0.024) / 0.13) + 0.002, short: 0.1, wave: 0.03 }, smooth: 0.003, seed: 2, inset: 0.004,
    });
    let cap1 = big.skin.part('sb_skin0', { mat: 'cap', paint: paintCapSkin({ c: [-0.02, 0, 0.0], R: 0.166, fib: 29 }) })
      .add(big.gills.part('sb_gill0', { mat: 'cap', paint: paintGill() }));
    cap1 = cap1.cut(rimSplit(300, 0.1, 16));
    cap1 = capWarp(cap1, { R: 0.166, sag: [-0.012, 200], wave: [0.008, 5], rag: 0.004, seed: 3 }).turn(10, 0, 8).at(-0.02, 0.25, 0.0);
    const st1 = P.tube([[-0.005, -0.01, 0.0], [-0.012, 0.12, 0.0], [-0.02, 0.255, 0.0]], (t) => 0.033 - 0.009 * t)
      .softAdd(P.ellipsoid([0.036, 0.03, 0.034]).at(-0.004, 0.018, 0), 0.012).part('sb_stalk0', { mat: 'stalk', paint: paintStalk });
    // the small one: a dome leaning out to the south-east
    const sm = capParts({
      top: [[0, 0.06], [0.04, 0.055], [0.075, 0.035], [0.096, 0.008], [0.094, -0.008]],
      under: [[0.088, -0.006], [0.06, 0.012], [0.03, 0.02], [0.016, 0.022]],
      gills: null, smooth: 0.003,
    });
    const tip2 = [0.1, 0.155, 0.08];
    let cap2 = sm.skin.part('sb_skin1', { mat: 'cap', paint: paintCapSkin({ c: tip2, R: 0.096, fib: 19 }) });
    cap2 = capWarp(cap2, { R: 0.096, wave: [0.004, 4], seed: 5 }).turn(14, 0, -22).at(tip2[0], tip2[1] - 0.01, tip2[2]);
    const st2 = P.tube([[0.04, -0.01, 0.03], [0.07, 0.08, 0.055], [tip2[0], tip2[1], tip2[2]]], (t) => 0.022 - 0.005 * t)
      .softAdd(P.ellipsoid([0.024, 0.02, 0.024]).at(0.042, 0.012, 0.032), 0.01).part('sb_stalk1', { mat: 'stalk', paint: paintStalk });
    // the button, nibbled
    let btn = P.ellipsoid([0.03, 0.032, 0.03]).at(-0.07, 0.05, 0.075).part('sb_skin2', { mat: 'cap', paint: paintCapSkin({ c: [-0.07, 0, 0.075], R: 0.03, fib: 11, top: () => 0.1 }) });
    btn = btn.cut(P.sphere(0.013).at(-0.047, 0.065, 0.093).add(P.sphere(0.01).at(-0.055, 0.075, 0.1)).part('sb_nibble', { mat: 'cap', paint: (c) => grey(1.25 - 0.3 * c.cavity) }), { paintCut: true });
    const st3 = P.tube([[-0.06, -0.005, 0.065], [-0.068, 0.03, 0.073]], 0.016).softAdd(P.ellipsoid([0.024, 0.016, 0.024]).at(-0.058, 0.006, 0.064), 0.01).part('sb_stalk2', { mat: 'stalk', paint: paintStalk });
    const all = st1.add(cap1).add(st2).add(cap2).softAdd(st3, 0.008).add(btn);
    return floorAt(all, 0);
  },
};
