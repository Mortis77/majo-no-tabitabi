// shroom_d — the grandmother: a fat-stemmed old mushroom with her brood at her foot. Replaces plant_mushroom_giant_1
//   (flora `shroom1`: 7.71 x 9.0 x 7.70 m, foot centre on y = 0, collider trunkR 0.7, INSTANCED).
// SILHOUETTE: a heavy barrel of a stem, a deep dome with a rolled-in rim — and a big round BITE out of the rim on the
//   east; three young ones (a button, a half-open cap, a tiny one) huddled at her west foot.
// BIG FORMS: (1) the barrel stem on its broad foot; (2) the dome, its skin cracked into plates on the crown;
//   (3) the brood.
// THE EYE RESTS ON: the bite (scalloped, the pale flesh inside), the cracked plates on the crown, the young caps.
// WEAR STORY: she is the oldest in the wood — her skin has dried and split into plates, something large took a bite
//   out of her rim and the wound has dried pale, her stem is deeply furrowed, the young grew from her spores.
// MUST NOT LOOK LIKE: a spotted pack toadstool (no white dots), a smooth dome on a cylinder, symmetric, evenly detailed.
import * as P from '../sdf.mjs';
import { SHROOM_MATS, SHROOM_TINT, FAR, capParts, capWarp, underDome, stem, skirt, young, floorAt, paintCapSkin, paintGill, paintStem, paintVeil, ss, grey, clamp } from './shroomcrystal_lib.mjs';

const RIM_Y = 6.2, R = 3.72, CAPC = [-0.12, RIM_Y, 0.05];
const UNDER = [[3.55, -0.05], [3.1, 0.42], [2.4, 0.78], [1.6, 0.98], [1.15, 1.04]];

export default {
  name: 'shroom_d', id: 'sculpt_shroom_d',
  voxel: 0.02, lods: [3500, 1200, 350], lodError: [0.03, 0.06, 0.12],
  farFrom: 1, farVoxel: 1.6,
  ground: 0, aoRange: 0.8, aoStrength: 0.45, cavity: [0.03, 0.12], creaseAngle: 50, hardAngle: 60, bandSlack: 0.07,
  materials: SHROOM_MATS, previewTint: SHROOM_TINT,
  replaces: { file: 'assets/models/nature/plants/plant_mushroom_giant_1.glb', scale: 1, tint: { cap: SHROOM_TINT.cap, stem: SHROOM_TINT.stem } },
  notes: 'Sculpted giant mushroom (old, bitten, with young). Vertex colours on every LOD. cap = caps + gills + bite flesh (tint), stem = stems + collar (mul).',
  build() {
    const far = FAR();
    const { skin, gills } = capParts({
      top: [[0, 2.8], [1.0, 2.72], [1.9, 2.42], [2.7, 1.86], [3.25, 1.18], [3.6, 0.5], [3.72, 0.06], [3.66, -0.2], [3.5, -0.28]],
      under: UNDER,
      gills: far ? null : { n: 52, t: 0.075, depth: (r) => 0.38 * Math.pow(Math.max(0, Math.sin(Math.PI * (r - 1.15) / 2.35)), 0.7) + 0.03, short: 2.25, wave: 0.03 },
      smooth: 0.04, seed: 12,
    });
    // the crown's dried skin split into plates (only on the upper dome; the cracks fade out toward the rim)
    let sk = far ? skin.round(0.03) : skin;
    if (!far) {
      const f = skin.f;
      sk = new P.Shape((x, y, z) => {
        const d = f(x, y, z);
        if (d > 0.1 || y < 1.5) return d;
        const w = ss(1.6, 2.5, y);
        const c = P.cellular(x * 0.95 + 3, y * 0.4, z * 0.95, 21, true);   // F2-F1 style: small near the cell borders
        return d + 0.07 * w * ss(0.16, 0.0, c);
      }, skin.b, null, 1.6);
    }
    const plates = (c, r) => {
      const t = ss(0.72, 0.2, r);
      const cc = P.cellular((c.x - CAPC[0]) * 0.95 + 3, (c.y - RIM_Y) * 0.4, (c.z - CAPC[2]) * 0.95, 21, true);
      return 0.1 * t * ss(0.08, 0.3, cc) + 0.05 * t;                       // plate centres pale, the cracks dark (cavity)
    };
    let cap = sk.part('d_skin', { mat: 'cap', paint: paintCapSkin({ c: CAPC, R, fib: 47, top: plates }) });
    const farG = far ? underDome(UNDER, 0.1).add(capParts({ top: [[0, 2.8], [3.72, 0.06], [3.5, -0.28]], under: UNDER, gills: { n: 20, t: 0.16, depth: (r) => 0.34 * Math.pow(Math.max(0, Math.sin(Math.PI * (r - 1.15) / 2.35)), 0.7) + 0.05, short: 99, wave: 0 }, smooth: 0.04, seed: 12 }).gills) : null;
    cap = cap.add((far ? farG : gills).part('d_gill', { mat: 'cap', paint: paintGill() }));
    // the bite: three overlapping round jaws into the east rim; pale dried flesh inside
    const bite = P.sphere(0.85).at(3.55, 0.75, 0.25).add(P.sphere(0.72).at(3.25, 0.95, -0.55)).add(P.sphere(0.6).at(3.3, 0.55, 0.95))
      .part('d_bite', { mat: 'cap', paint: (c) => grey(clamp(1.25 - 0.3 * c.cavity + 0.08 * P.fbm(c.x * 9, c.y * 9, c.z * 9, 4, 2), 0.6, 1.35)) });
    cap = cap.cut(bite, { paintCut: true });
    cap = capWarp(cap, { R, sag: [0.18, 120], rag: 0.08, wave: [0.14, 6, 1.2], seed: 14 });
    cap = cap.turn(-3, 0, 5).at(CAPC[0], CAPC[1], CAPC[2]);
    // the barrel stem: broad foot, swollen middle, deep furrows that twist a little
    let st = stem({
      path: [[0, -0.2, 0], [0.04, 2.0, 0.02], [-0.06, 4.2, 0.04], [-0.1, 7.1, 0.05]],
      r: (t) => 0.98 + 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.1)) - 0.18 * t + 0.35 * Math.pow(Math.max(0, t - 0.85) / 0.15, 2),
      bulb: { size: [1.55, 0.7, 1.5], at: [0, 0.3, 0], k: 0.6 },
      ridges: far ? 0 : 11, ridgeAmp: 0.07, ridgeTwist: 0.06, ridgeFrom: 0.08, ridgeTo: 0.92, seed: 13,
    }).part('d_stem', { mat: 'stem', paint: paintStem({ yTop: 6.8, foot: 0.9, seed: 13 }) });
    // a short ragged collar left high on the stem
    // (parts are created in the same order in the far field too: part ids must match between the two fields)
    const collar = skirt({ at: [-0.08, 5.95, 0.04], rIn: 1.02, rOut: 1.32, drop: 0.32, thick: 0.08, rag: 0.6, seed: 15, tears: [[30, 30], [200, 18]] }).part('d_collar', { mat: 'stem', paint: paintVeil });
    if (!far) st = st.add(collar);
    // the brood at the west foot
    const kids = [
      { at: [-1.95, 0, 0.75], h: 1.7, sr: 0.26, cr: 0.95, lean: [-0.4, 0.18], open: 0.7, seed: 1 },
      { at: [-1.6, 0, -0.95], h: 0.85, sr: 0.22, cr: 0.6, lean: [-0.12, -0.15], open: 0.15, seed: 2 },
      { at: [-2.45, 0, -0.2], h: 0.5, sr: 0.13, cr: 0.36, lean: [-0.1, 0.05], open: 0.35, seed: 3 },
    ];
    let all = st.add(cap);
    kids.forEach((k, i) => {
      const y = young(k);
      all = all.add(y.stem.part(`d_kstem${i}`, { mat: 'stem', paint: paintStem({ yTop: k.h, foot: k.h * 0.35, seed: 20 + i }) }))
        .add(y.cap.part(`d_kcap${i}`, { mat: 'cap', paint: paintCapSkin({ c: [k.at[0] + k.lean[0], 0, k.at[2] + k.lean[1]], R: k.cr, fib: 17 }) }));
    });
    return floorAt(all, 0);
  },
};
