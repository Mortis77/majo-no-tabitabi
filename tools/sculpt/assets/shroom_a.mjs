// shroom_a — the old parasol of the glow wood. Replaces plant_mushroom_giant_3 (flora `shroom3`: 8.5 x 5.0 x 8.28 m,
//   foot centre on y = 0, collider trunkR 1.0, materials stem / cap, drawn INSTANCED, vertex colours only).
// SILHOUETTE: a huge, wide, low cap that has gone soft with age and SAGS — one side hangs nearly to head height, the rim
//   is torn through in one deep split and nicked in another; under it a short, thick, ridged stem on a swollen bulb.
// BIG FORMS: (1) the slumped cap, crown still domed; (2) the underside — forty-odd deep gills fanning out, the light
//   coming from between them; (3) the stem: bulb, ridged shaft, a torn collar of veil.
// THE EYE RESTS ON: the deep split and the flap beside it hanging lower; the bright gill edges seen from under the rim;
//   the ragged collar on the stem.
// WEAR STORY: it has stood for decades; the cap tore under its own weight on the south-west, the rim went wavy, the veil
//   left a ragged collar, the foot is stained by soil and damp.
// MUST NOT LOOK LIKE: a pack toadstool (round dome, white spots, cylinder stem), an umbrella, symmetric, evenly detailed.
import * as P from '../sdf.mjs';
import { SHROOM_MATS, SHROOM_TINT, FAR, capParts, capWarp, underDome, rimSplit, stem, skirt, floorAt, paintCapSkin, paintGill, paintStem, paintVeil } from './shroomcrystal_lib.mjs';

const TOP = [[0, 2.05], [1.2, 1.98], [2.2, 1.75], [3.0, 1.4], [3.6, 0.95], [3.9, 0.55], [4.06, 0.16], [4.09, 0.03]];
const UNDER = [[4.04, -0.01], [3.85, 0.36], [3.5, 0.66], [3.0, 0.86], [2.2, 1.02], [1.4, 1.1], [0.62, 1.12]];
const RIM_Y = 2.95, R = 4.05, CAPC = [0.25, RIM_Y, 0.1];

export default {
  name: 'shroom_a', id: 'sculpt_shroom_a',
  voxel: 0.022, lods: [3500, 1200, 350], lodError: [0.032, 0.06, 0.12],
  farFrom: 1, farVoxel: 1.6,
  ground: 0, aoRange: 0.9, aoStrength: 0.45, cavity: [0.03, 0.12], creaseAngle: 50, hardAngle: 60, bandSlack: 0.06,
  materials: SHROOM_MATS, previewTint: SHROOM_TINT,
  replaces: { file: 'assets/models/nature/plants/plant_mushroom_giant_3.glb', scale: 1, tint: { cap: SHROOM_TINT.cap, stem: SHROOM_TINT.stem } },
  notes: 'Sculpted giant mushroom (old parasol). Vertex colours on every LOD. cap = cap skin + gills (tint, value only), stem = stem + bulb + collar (mul).',
  build() {
    const far = FAR();
    const { skin, gills } = capParts({
      top: TOP,
      under: UNDER,
      gills: far ? null : { n: 46, t: 0.075, depth: (r) => 0.45 * Math.pow(Math.max(0, Math.sin(Math.PI * (r - 0.62) / 3.4)), 0.7) + 0.03, short: 2.2, wave: 0.04 },
      smooth: 0.035, seed: 3,
    });
    let cap = (far ? skin.round(0.03) : skin).part('a_skin', { mat: 'cap', paint: paintCapSkin({ c: CAPC, R, fib: 37 }) });
    if (far) {
      // the far LODs: a shallow bright under-dome and 18 coarse gills (thick enough to survive LOD1) — the gill fan
      // still reads from under the rim in the instanced batch
      const fg = capParts({ top: TOP, under: UNDER, gills: { n: 18, t: 0.16, depth: (r) => 0.4 * Math.pow(Math.max(0, Math.sin(Math.PI * (r - 0.62) / 3.4)), 0.7) + 0.05, short: 99, wave: 0 }, smooth: 0.035, seed: 3 });
      const under = underDome(UNDER, 0.12).add(fg.gills).part('a_gill', { mat: 'cap', paint: paintGill({ k: 0.95 }) });
      cap = cap.add(under);
    } else cap = cap.add(gills.part('a_gill', { mat: 'cap', paint: paintGill() }));
    // torn: a deep split on the south-west, a nick on the north-east, and the flap beside the split hanging lower
    cap = cap.cut(rimSplit(212, 2.25, 15, 10, 0.05)).cut(rimSplit(38, 3.15, 8, 10, 0.045));
    cap = capWarp(cap, { R, sag: [0.75, 205], rag: 0.16, flaps: [[224, 0.5, 12]], wave: [0.32, 5, 0.6], seed: 5 });
    cap = cap.bulge([0.1, 2.05, 0.0], 0.9, 0.16).bulge([1.3, 1.9, -1.1], 1.5, 0.12).bulge([-1.6, 1.8, 0.9], 1.3, 0.1).bulge([2.5, 1.5, 1.5], 1.1, -0.1);
    cap = cap.turn(3, 0, -4).at(CAPC[0], CAPC[1], CAPC[2]);
    // the stem: swollen bulb, ridged shaft leaning a little east, flaring into the cap
    const path = [[0, -0.2, 0], [0.06, 1.3, 0.04], [0.18, 2.7, 0.08], [0.25, 4.1, 0.1]];
    let st = stem({
      path, r: (t) => 0.8 - 0.2 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.5) + 0.28 * Math.pow(Math.max(0, t - 0.78) / 0.22, 2),
      bulb: { size: [1.2, 0.62, 1.12], at: [-0.04, 0.38, 0.02], k: 0.5 },
      ridges: far ? 0 : 9, ridgeAmp: 0.055, ridgeTwist: 0.12, ridgeFrom: 0.12, ridgeTo: 0.85, seed: 4,
    }).part('a_stem', { mat: 'stem', paint: paintStem({ yTop: 4.0, foot: 0.75, seed: 4 }) });
    // the torn veil collar, hanging on the shaft
    const collar = skirt({ at: [0.19, 3.05, 0.08], rIn: 0.6, rOut: 0.98, drop: 0.48, thick: 0.07, rag: 0.55, seed: 8, tears: [[300, 24], [80, 10]] })
      .part('a_veil', { mat: 'stem', paint: paintVeil });
    if (!far) st = st.add(collar);
    return floorAt(st.add(cap), 0);
  },
};
