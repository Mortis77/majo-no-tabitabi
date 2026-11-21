// shroom_c — the stair-shelf: a leaning stem with brackets growing out of it in tiers. Replaces plant_mushroom_giant_2
//   (flora `shroom2`: 6.69 x 6.0 x 6.69 m, foot centre on y = 0, collider trunkR 0.8, INSTANCED).
// SILHOUETTE: a thick stem leaning hard to the east, and out of its west / north / south faces three half-moon shelves
//   at three heights and three headings, the lowest the widest, a small round cap crowning the bent tip — a broken
//   staircase you could almost climb.
// BIG FORMS: (1) the leaning, ridged stem; (2) the three brackets, thick at the root, thin and wavy at the lip;
//   (3) the crown cap.
// THE EYE RESTS ON: the stacked lips of the shelves with their growth rings, the lit gill fans under each one.
// WEAR STORY: the stem was pushed over by a falling tree and kept growing — the shelves grew level again from the
//   leaning stem, so each one is tilted against it; the oldest (lowest) has the deepest rings and a sagging lip.
// MUST NOT LOOK LIKE: an umbrella, a pack bracket fungus on a log, three identical plates, symmetric.
import * as P from '../sdf.mjs';
import { SHROOM_MATS, SHROOM_TINT, FAR, capParts, capWarp, kidney, underDome, stem, floorAt, paintCapSkin, paintGill, paintStem, pathAt, ss } from './shroomcrystal_lib.mjs';

const PATH = [[0, -0.2, 0], [0.22, 1.4, 0.08], [0.62, 2.9, 0.12], [1.06, 4.2, 0.08], [1.38, 5.15, 0.0], [1.5, 5.45, -0.02]];
// shelves: [height on the stem, heading (deg), radius, upward tilt (deg), seed, gill count]
const SHELVES = [[2.3, 165, 3.35, 7, 1, 44], [3.5, 68, 2.65, 10, 2, 38], [4.45, 292, 2.05, 13, 3, 32]];

function shelf([y, head, R, tilt, seed, n], far, idx) {
  const k = R / 2.45;
  const top = [[0, 1.0], [0.5, 0.88], [1.2, 0.56], [1.9, 0.28], [2.33, 0.09], [2.45, -0.04]].map(([r, h]) => [r * k, h * Math.sqrt(k)]);
  const under = [[2.36, -0.08], [1.9, 0.03], [1.2, 0.13], [0.5, 0.2], [0.12, 0.22]].map(([r, h]) => [r * k, h * Math.sqrt(k)]);
  const { skin, gills } = capParts({ top, under, gills: far ? null : { n, t: 0.06, depth: (r) => 0.16 * Math.sqrt(k) * Math.pow(Math.max(0, Math.sin(Math.PI * (r - 0.12 * k) / (2.3 * k))), 0.8) + 0.02, short: 1.3 * k, wave: 0.03 }, smooth: 0.025, seed });
  const c = pathAt(PATH, y), sr = 0.68 - 0.3 * (y / 5.4);
  const out = [Math.cos(head * Math.PI / 180), 0, -Math.sin(head * Math.PI / 180)];
  const ax = [c[0] + out[0] * sr * 0.15, y - 0.25 * Math.sqrt(k), c[2] + out[2] * sr * 0.15];
  let s = skin.part(`c_skin${idx}`, { mat: 'cap', paint: paintCapSkin({ c: ax, R, fib: 41, top: (cc, r) => 0.09 * Math.sin(r * R * 9.0) * ss(0.2, 0.4, r) }) });
  if (!far) s = s.add(gills.part(`c_gill${idx}`, { mat: 'cap', paint: paintGill() }));
  else s = s.add(underDome(under, 0.12 * Math.sqrt(k)).part(`c_gill${idx}`, { mat: 'cap', paint: paintGill({ k: 0.95 }) }));
  // growth ridges, a wavy lip, the old shelf's lip sagging
  s = capWarp(s, { R, sag: [idx === 0 ? 0.28 : 0.08, 0], rag: 0.06, wave: [0.1 * k, 4 + idx, seed], zones: far ? null : [0.022 * k, 9.0 / k], seed: seed + 3 });
  // a bracket: the back of the round cap shrinks into the stem (kidney outline), the root thickened into the stem
  s = kidney(s, Math.min(0.6, (sr * 0.85) / R));
  return s.turn(0, 0, tilt).turn(0, head, 0).at(ax[0], ax[1], ax[2]);
}

export default {
  name: 'shroom_c', id: 'sculpt_shroom_c',
  voxel: 0.018, lods: [3500, 1200, 350], lodError: [0.03, 0.06, 0.12],
  farFrom: 1, farVoxel: 1.6,
  ground: 0, aoRange: 0.7, aoStrength: 0.45, cavity: [0.025, 0.1], creaseAngle: 50, hardAngle: 60, bandSlack: 0.06,
  materials: SHROOM_MATS, previewTint: SHROOM_TINT,
  replaces: { file: 'assets/models/nature/plants/plant_mushroom_giant_2.glb', scale: 1, tint: { cap: SHROOM_TINT.cap, stem: SHROOM_TINT.stem } },
  notes: 'Sculpted giant mushroom (tiered shelves on a leaning stem). Vertex colours on every LOD. cap = shelves + gills (tint), stem (mul).',
  build() {
    const far = FAR();
    let st = stem({
      path: PATH, r: (t) => 0.72 - 0.34 * t,
      bulb: { size: [1.05, 0.55, 0.98], at: [0.05, 0.3, 0], k: 0.45 },
      ridges: far ? 0 : 8, ridgeAmp: 0.05, ridgeTwist: 0.15, ridgeFrom: 0.1, ridgeTo: 0.95, seed: 2,
    }).part('c_stem', { mat: 'stem', paint: paintStem({ yTop: 5.2, foot: 0.7, seed: 2 }) });
    let all = st;
    SHELVES.forEach((s, i) => { all = all.softAdd(shelf(s, far, i), 0.14); });
    // the crown: a small round cap rolled over the bent tip, tipped east
    const { skin, gills } = capParts({
      top: [[0, 0.5], [0.4, 0.46], [0.75, 0.28], [0.95, 0.04], [0.97, -0.06]], under: [[0.9, -0.08], [0.6, 0.12], [0.3, 0.2], [0.2, 0.21]],
      gills: far ? null : { n: 24, t: 0.05, depth: (r) => 0.1 * Math.sin(Math.PI * (r - 0.2) / 0.68) + 0.02, short: 0.55 }, smooth: 0.02, seed: 9,
    });
    let crown = skin.part('c_skin3', { mat: 'cap', paint: paintCapSkin({ c: [1.5, 5.4, 0], R: 0.97, fib: 23 }) });
    crown = crown.add((far ? underDome([[0.9, -0.08], [0.6, 0.12], [0.3, 0.2], [0.2, 0.21]], 0.08) : gills).part('c_gill3', { mat: 'cap', paint: paintGill() }));
    crown = capWarp(crown, { R: 0.97, sag: [0.12, 0], wave: [0.05, 5], seed: 4 }).turn(0, 0, -16).at(1.48, 5.42, -0.02);
    all = all.add(crown);
    return floorAt(all, 0);
  },
};
