// shroom_small_a — a tuft of bonnets for the forest floor. Replaces plant_mushroom_small_1 (flora `mushSmall1`:
//   0.22 x 0.34 x 0.22 m, foot centre on y = 0, scaled 1.2-3.4x, INSTANCED; cap = tint + glow, the rest = mul).
// SILHOUETTE: three slender stems from one root, fanning out like fingers, each with a small conical bonnet — tall,
//   middle, short — and a pin-head button at the foot.
// BIG FORMS: (1) the three bonnets at three heights; (2) the fanned stems joined in one woolly root; (3) the button.
// THE EYE RESTS ON: the pointed bonnet tips and their pale, lit rims.
// WEAR STORY: a young tuft on rotten wood; the tallest bonnet has opened and split once at the rim, the others are
//   still closed; the root is furred white with mycelium.
// MUST NOT LOOK LIKE: a pack mushroom (red dome, white spots), three identical copies, a lollipop.
import * as P from '../sdf.mjs';
import { SMALL_MATS, SMALL_TINT, rimSplit, floorAt, paintCapSkin, mix, C, ss, clamp } from './shroomcrystal_lib.mjs';

// [foot, tip of stem, cap radius, cap height, rim flare, seed]
const BONNETS = [
  [[0.0, 0, 0.0], [0.03, 0.275, 0.012], 0.052, 0.07, 0.25, 1],
  [[0.012, 0, -0.008], [-0.055, 0.19, -0.035], 0.042, 0.058, 0.1, 2],
  [[0.006, 0, 0.012], [0.04, 0.115, 0.065], 0.034, 0.048, 0.0, 3],
];
function paintStalk(c) {
  const { y, cavity, edge, ao } = c;
  let col = P.mul(mix(C('#dccdb6'), C('#f7eee0'), ss(0.0, 0.2, y)), 1.08);
  col = mix(col, C('#fbf6ee'), edge * 0.5);
  col = mix(col, C('#7a6656'), ss(0.03, 0.0, y) * 0.6);
  col = mix(col, C('#8c7a6a'), clamp(cavity * 1.3, 0, 1) * 0.5);
  return P.mul(col, 1 + 0.4 * (1 - ao));
}

export default {
  name: 'shroom_small_a', id: 'sculpt_shroom_small_a',
  voxel: 0.0011, lods: [900, 300], lodError: [0.0012, 0.004],
  ground: 0, aoRange: 0.04, aoStrength: 0.45, cavity: [0.0015, 0.006], creaseAngle: 50, hardAngle: 60,
  materials: SMALL_MATS, previewTint: SMALL_TINT,
  replaces: { file: 'assets/models/refined/plant_mushroom_small_1.glb', scale: 1, tint: { cap: SMALL_TINT.cap, stem: [0.11, 0.32, 0.04] } },
  notes: 'Sculpted small mushroom tuft. Vertex colours on every LOD. cap = tint + glow (value only), stalk = painted colour (mul by white).',
  build() {
    let all = null;
    BONNETS.forEach(([a, b, cr, ch, flare, seed], i) => {
      const mid = [(a[0] + b[0]) / 2 + (b[0] - a[0]) * 0.15, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + (b[2] - a[2]) * 0.15];
      const st = P.tube([a, mid, b], (t) => cr * (0.25 - 0.06 * t)).part(`sa_stalk${i}`, { mat: 'stalk', paint: paintStalk });
      // conical bonnet: pointed crown, straight flanks, the rim flared out a little when open
      const prof = [[0, ch], [cr * 0.25, ch * 0.93], [cr * 0.7, ch * 0.5], [cr * (1 + flare * 0.15), ch * 0.04], [cr * (0.97 + flare * 0.15), -ch * 0.06], [cr * 0.55, ch * 0.18], [cr * 0.22, ch * 0.2]];
      let cap = P.lathe(prof, { smooth: cr * 0.05 });
      if (i === 0) cap = cap.cut(rimSplit(50, cr * 0.6, 14, 1, 0.0018));
      const dir = P.norm([b[0] - mid[0], b[1] - mid[1], b[2] - mid[2]]);
      cap = cap.aim(dir).at(b[0] - dir[0] * ch * 0.15, b[1] - dir[1] * ch * 0.15, b[2] - dir[2] * ch * 0.15)
        .part(`sa_cap${i}`, { mat: 'cap', paint: paintCapSkin({ c: b, R: cr, fib: 13, top: (c, r) => 0.12 * ss(0.45, 0.05, r) }) });
      const one = st.add(cap);
      all = all ? all.add(one) : one;
    });
    // the button and the furred root
    const btn = P.ellipsoid([0.011, 0.013, 0.011]).at(-0.03, 0.012, 0.03).part('sa_cap3', { mat: 'cap', paint: paintCapSkin({ c: [-0.03, 0, 0.03], R: 0.011, fib: 7 }) });
    const root = P.ellipsoid([0.026, 0.014, 0.024]).at(0.005, 0.0, 0.0).softAdd(P.ellipsoid([0.008, 0.008, 0.008]).at(-0.03, 0.002, 0.03), 0.01)
      .rough({ type: 'fbm', scale: 0.006, amp: 0.0012, seed: 3 }).part('sa_root', { mat: 'stalk', paint: paintStalk });
    all = all.softAdd(root, 0.012).add(btn);
    return floorAt(all, 0);
  },
};
