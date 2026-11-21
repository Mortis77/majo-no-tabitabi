// Komainu "a" (open mouth, right paw — the statue's own right, -x — on a carved ball), 向日神社, left of the approach.
// SILHOUETTE: a big-headed lion-dog sitting bolt upright, chest out, head a full mane-disc wider than the body, a flame
//   tail standing up its back; the whole on a heavy two-tier plinth. Reads as a triangle with a round crown on a block.
// THREE BIG FORMS: the mane-crowned head / the upright chest-and-forelegs column / the plinth.
// EYE RESTS ON: the open mouth (fangs, tongue), the frowning brow with drilled eyes, the paw on the ball.
// WEAR: two centuries of rain and hands — nose, ball top and front toes rubbed smooth and warm; lichen and moss on the
//   damp (back-left) side and in the curls; the plinth's front-right foot corner knocked off long ago.
// MUST NOT: look like stacked spheres, be a mirror copy of the "un", or carry even noise everywhere.
import { plinth, lionDog, mossCushions, granitePaint, paintMoss, paintBib, MATERIALS, beforeFrom } from './guardian_lib.mjs';

const TOP = 0.99, NORTH = [-0.45, -0.9];
const stone = granitePaint({
  base: ['#b5aea1', '#a29b8e'], north: NORTH, top: TOP, faces: [[0, TOP + 0.95, 0.4, 0.15]], seed: 3,
  touch: [[-0.005, TOP + 0.97, 0.49, 0.07], [-0.17, TOP + 0.27, 0.42, 0.11], [0.165, TOP + 0.06, 0.4, 0.07], [-0.17, TOP + 0.21, 0.45, 0.06]],
});

export default {
  name: 'komainu_a', id: 'sculpt_komainu_a',
  voxel: 0.0055,
  lods: [12000, 3500, 900],
  lodError: [0.003, 0.012, 0.02],
  atlas: 1024,
  ground: 0,
  aoRange: 0.22,
  materials: MATERIALS,
  anchors: { bib: [0, TOP + 0.8, 0.12], plinthTop: [0, TOP, 0], head: [0, TOP + 0.98, 0.17] },
  notes: 'Sculpted komainu (open mouth, ball under its right forepaw). Replaces decor.js komainu(true, s): scale by s, origin foot centre, faces +Z. Red cloth bib sculpted in (material Bib_cloth, tintable); anchor "bib". LOD0 atlas + object-space normal map; LOD1/2 vertex colours. See .tmp/sculpt/komainu_a/INSTALL.md.',

  build({ S }) {
    S.part('freshChip', { mat: 'stone', paint: (c) => stone(c, 0.25) });
    const G = ['granite', { mat: 'stone', paint: stone }];
    const pl = plinth(S, TOP, { seed: 3, part: G, chip: { at: [0.6, 0.15, 0.7], dir: [0.6, 0.4, 0.7], depth: 0.06, spread: 0.6, seed: 4 } });
    const animal = lionDog(S, { open: true, ballSide: -1, yaw: 9, seed: 3, G, bib: paintBib({ seed: 3, tipY: TOP + 0.425 }) }).at(0, TOP, 0);
    let st = pl.add(animal);
    st = st.rough({ type: 'cellular', scale: 0.016, amp: 0.001, seed: 12 });
    const moss = mossCushions(S, TOP, NORTH, 3, { ground: 0.75 }).part('moss', { mat: 'moss', paint: paintMoss });
    return st.softAdd(moss, 0.012);
  },
  before: beforeFrom('komainu', [true, 1]),
};
