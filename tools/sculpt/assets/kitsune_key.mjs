// Kitsune with the key (鍵), 狐火之里 approach, the statue whose brush tail sweeps out to its left (+x).
// SILHOUETTE: a slim upright fox, all vertical: tall ears, long neck, a great brush tail climbing its back to a flame
//   tip over the shoulder; a key held crosswise in the jaws breaks the vertical. Reads as a candle-flame on a block.
// THREE BIG FORMS: the tail-and-back column / the narrow head with its ears / the plinth.
// EYE RESTS ON: the vermilion-lined almond eyes and the key in the mouth; the flame tip of the tail.
// WEAR: nose and key polished by hands; lichen and moss on the damp back-left; a corner of the plinth's foot knocked off.
// MUST NOT: be a lion-dog in fox ears, a mirror of the jewel fox (other tail side, head turn, ears whole), or a smooth toy.
import { plinth, fox, mossCushions, granitePaint, paintMoss, paintVerm, paintBib, MATERIALS, beforeFrom } from './guardian_lib.mjs';

const TOP = 1.13, FS = 1.15, NORTH = [-0.5, -0.86], SIDE = 1;
const stone = granitePaint({
  base: ['#b4ab9b', '#9e9585'], north: NORTH, top: TOP, faces: [[0, TOP + 1.12, 0.24, 0.19]], seed: 11,
  touch: [[0, TOP + 1.08, 0.4, 0.05], [0, TOP + 1.05, 0.29, 0.07], [-0.1, TOP + 0.03, 0.3, 0.05], [0.1, TOP + 0.03, 0.3, 0.05]],
});

export default {
  name: 'kitsune_key', id: 'sculpt_kitsune_key',
  voxel: 0.005,
  lods: [12000, 3500, 900],
  lodError: [0.003, 0.012, 0.02],
  atlas: 1024,
  ground: 0,
  aoRange: 0.2,
  materials: MATERIALS,
  anchors: { bib: [0, TOP + 0.71 * FS, 0.21 * FS], plinthTop: [0, TOP, 0], head: [0, TOP + 0.965 * FS, 0.12 * FS] },
  notes: 'Sculpted kitsune holding a key (tail to +x). Replaces decor.js kitsune(+1, true, s). Red cloth bib sculpted in (material Bib_cloth, tintable); anchor "bib". Figure 1.15x the old one. See .tmp/sculpt/kitsune_key/INSTALL.md.',

  build({ S }) {
    S.part('freshChip', { mat: 'stone', paint: (c) => stone(c, 0.25) });
    const G = ['granite', { mat: 'stone', paint: stone }];
    const V = ['verm', { mat: 'stone', paint: paintVerm(stone, 0.75) }];
    const pl = plinth(S, TOP, { seed: 11, part: G, cushionChisel: false, chip: { at: [-0.6, 0.15, -0.7], dir: [-0.6, 0.4, -0.7], depth: 0.05, spread: 0.6, seed: 12 } });
    const animal = fox(S, { side: SIDE, key: true, yaw: -6, pitch: 5, seed: 11, G, V, bib: paintBib({ seed: 11, tipY: TOP + 0.535 * FS, base: '#c63a2b' }) }).scale(FS).at(0, TOP, 0);
    let st = pl.add(animal);
    const moss = mossCushions(S, TOP, NORTH, 11, { ledge: 4, ground: 0.4 }).part('moss', { mat: 'moss', paint: paintMoss });
    return st.softAdd(moss, 0.012);
  },
  before: beforeFrom('kitsune', [SIDE, true, 1]),
};
