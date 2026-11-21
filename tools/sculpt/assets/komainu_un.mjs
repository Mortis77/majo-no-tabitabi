// Komainu "un" (closed mouth, a short horn, both forepaws on the plinth), 向日神社, right of the approach.
// SILHOUETTE: the same upright lion-dog as its twin but shut-jawed and still: a squarer head turned the other way, a horn
//   nub on the brow, no ball, so the forelegs stand as two clean columns. Triangle with a round crown on a block.
// THREE BIG FORMS: the mane-crowned head / the chest-and-forelegs column / the plinth.
// EYE RESTS ON: the clamped lip line with two fangs over it, the frowning brow and horn, the front toes.
// WEAR: noses and toes rubbed by hands; damp back-right side with lichen and moss; a hairline crack runs down the
//   plinth's front-right corner from cap to foot (frost, long ago).
// MUST NOT: be a mirror copy of the "a" (different head turn, mouth, horn, locks, crack, moss), nor a smooth blob.
import { plinth, lionDog, mossCushions, granitePaint, paintMoss, paintBib, MATERIALS, beforeFrom } from './guardian_lib.mjs';

const TOP = 0.99, NORTH = [0.5, -0.86];
const stone = granitePaint({
  base: ['#b1aa9c', '#9f988a'], north: NORTH, top: TOP, faces: [[0, TOP + 0.95, 0.4, 0.15]], seed: 7,
  touch: [[0.0, TOP + 0.97, 0.47, 0.07], [-0.165, TOP + 0.05, 0.4, 0.075], [0.165, TOP + 0.05, 0.4, 0.075]],
});

export default {
  name: 'komainu_un', id: 'sculpt_komainu_un',
  voxel: 0.0055,
  lods: [12000, 3500, 900],
  lodError: [0.003, 0.012, 0.02],
  atlas: 1024,
  ground: 0,
  aoRange: 0.22,
  materials: MATERIALS,
  anchors: { bib: [0, TOP + 0.8, 0.12], plinthTop: [0, TOP, 0], head: [0, TOP + 0.98, 0.17] },
  notes: 'Sculpted komainu (closed mouth, horn). Replaces decor.js komainu(false, s): scale by s, origin foot centre, faces +Z. Red cloth bib sculpted in (material Bib_cloth, tintable); anchor "bib". LOD0 atlas + object-space normal map; LOD1/2 vertex colours. See .tmp/sculpt/komainu_un/INSTALL.md.',

  build({ S }) {
    const G = ['granite', { mat: 'stone', paint: stone }];
    const crack = [[0.36, 0.905, 0.62], [0.37, 0.77, 0.522], [0.385, 0.6, 0.522], [0.35, 0.44, 0.522], [0.375, 0.3, 0.522], [0.37, 0.245, 0.57], [0.36, 0.2, 0.65], [0.385, 0.12, 0.7], [0.37, 0.0, 0.7]];
    const pl = plinth(S, TOP, { seed: 7, part: G, crack });
    const animal = lionDog(S, { open: false, ballSide: 0, yaw: -7, seed: 7, horn: true, G, bib: paintBib({ seed: 8, tipY: TOP + 0.425 }) }).at(0, TOP, 0);
    let st = pl.add(animal);
    st = st.rough({ type: 'cellular', scale: 0.016, amp: 0.001, seed: 13 });
    const moss = mossCushions(S, TOP, NORTH, 7, { ground: 0.75 }).part('moss', { mat: 'moss', paint: paintMoss });
    return st.softAdd(moss, 0.012);
  },
  before: beforeFrom('komainu', [false, 1]),
};
