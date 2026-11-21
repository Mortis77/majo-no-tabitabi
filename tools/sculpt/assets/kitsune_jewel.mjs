// Kitsune with the flame-jewel (宝珠), 狐火之里 approach, the statue whose brush tail sweeps out to its right (-x).
// SILHOUETTE: the key fox's twin but quieter: mouth shut in a faint smile, one forepaw lifted onto an onion-shaped jewel,
//   head tipped toward the path, the tail climbing the other side. A candle-flame on a block, leaning the other way.
// THREE BIG FORMS: the tail-and-back column / the narrow head with its ears / the plinth.
// EYE RESTS ON: the vermilion-lined eyes, the paw on the jewel and its spiral flame grooves, the chipped ear tip.
// WEAR: nose, jewel and paw rubbed bright by hands; the right ear's tip broken off; damp back-right side mossy.
// MUST NOT: be a mirror of the key fox (different tail side, head tilt, jewel, chip, moss), nor evenly detailed.
import { plinth, fox, mossCushions, granitePaint, paintMoss, paintVerm, paintBib, MATERIALS, beforeFrom } from './guardian_lib.mjs';

const TOP = 1.13, FS = 1.15, NORTH = [0.45, -0.89], SIDE = -1;
const stone = granitePaint({
  base: ['#b0a898', '#9a9283'], north: NORTH, top: TOP, faces: [[0, TOP + 1.12, 0.24, 0.19]], seed: 17,
  touch: [[0, TOP + 1.08, 0.4, 0.05], [-0.12, TOP + 0.28, 0.34, 0.08], [-0.118, TOP + 0.29, 0.3, 0.05], [0.1, TOP + 0.03, 0.3, 0.05]],
});

export default {
  name: 'kitsune_jewel', id: 'sculpt_kitsune_jewel',
  voxel: 0.005,
  lods: [12000, 3500, 900],
  lodError: [0.003, 0.012, 0.02],
  atlas: 1024,
  ground: 0,
  aoRange: 0.2,
  materials: MATERIALS,
  anchors: { bib: [0, TOP + 0.71 * FS, 0.21 * FS], plinthTop: [0, TOP, 0], head: [0, TOP + 0.965 * FS, 0.12 * FS] },
  notes: 'Sculpted kitsune holding a flame-jewel under its right forepaw (tail to -x), left ear tip chipped. Replaces decor.js kitsune(-1, false, s). Red cloth bib sculpted in (material Bib_cloth, tintable); anchor "bib". Figure 1.15x the old one. See .tmp/sculpt/kitsune_jewel/INSTALL.md.',

  build({ S }) {
    S.part('freshChip', { mat: 'stone', paint: (c) => stone(c, 0.25) });
    const G = ['granite', { mat: 'stone', paint: stone }];
    const V = ['verm', { mat: 'stone', paint: paintVerm(stone, 0.75) }];
    const pl = plinth(S, TOP, { seed: 17, part: G, cushionChisel: false });
    const animal = fox(S, { side: SIDE, key: false, yaw: 8, pitch: -2, seed: 17, chipEar: 1, G, V, bib: paintBib({ seed: 17, tipY: TOP + 0.535 * FS, base: '#c93d2c' }) }).scale(FS).at(0, TOP, 0);
    let st = pl.add(animal);
    const moss = mossCushions(S, TOP, NORTH, 17, { ledge: 6, ground: 0.4 }).part('moss', { mat: 'moss', paint: paintMoss });
    return st.softAdd(moss, 0.012);
  },
  before: beforeFrom('kitsune', [SIDE, false, 1]),
};
