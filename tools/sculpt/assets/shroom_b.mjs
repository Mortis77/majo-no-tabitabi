// shroom_b — the lamplighter: a tall, thin-stemmed mushroom with a small nodding bell. Replaces plant_mushroom_giant_4
//   (flora `shroom4`: 3.29 x 12 x 3.29 m, foot centre on y = 0, collider trunkR 0.45, sways most (flex 0.03), INSTANCED).
// SILHOUETTE: a long stem drawn up in a slow S, a hanging ring two thirds of the way up, and at the top a small bell cap
//   nodding to one side like a lamp on a post; at the foot a torn cup (volva) holding a swollen bulb.
// BIG FORMS: (1) the S-stem; (2) the bell with its pointed crown and flared, striate rim; (3) the skirt-ring.
// THE EYE RESTS ON: the bell's lit gill ring seen from below, the skirt, the torn cup at the foot.
// WEAR STORY: it shot up in one night and is still young — clean surfaces, a zigzag snakeskin of torn veil scales on the
//   lower stem, the cup at the foot split open as it rose, one tear in the skirt.
// MUST NOT LOOK LIKE: a lollipop, a straight pole with a dome, a pack toadstool, symmetric.
import * as P from '../sdf.mjs';
import { SHROOM_MATS, SHROOM_TINT, FAR, capParts, capWarp, underDome, rimSplit, stem, skirt, floorAt, paintCapSkin, paintGill, paintStem, paintVeil, ringNoise, ss } from './shroomcrystal_lib.mjs';

const RIM_Y = 10.3, R = 1.6, CAPC = [0.12, RIM_Y, 0.02];
const PATH = [[0, -0.2, 0], [0.12, 2.6, 0.06], [0.02, 5.2, 0.16], [-0.1, 7.6, 0.08], [0.06, 9.8, 0.0], [0.13, 11.3, 0.02]];

export default {
  name: 'shroom_b', id: 'sculpt_shroom_b',
  voxel: 0.016, lods: [3500, 1200, 350], lodError: [0.02, 0.05, 0.15],
  farFrom: 1, farVoxel: 1.6,
  ground: 0, aoRange: 0.6, aoStrength: 0.45, cavity: [0.02, 0.08], creaseAngle: 50, hardAngle: 60, bandSlack: 0.05,
  materials: SHROOM_MATS, previewTint: SHROOM_TINT,
  replaces: { file: 'assets/models/nature/plants/plant_mushroom_giant_4.glb', scale: 1, tint: { cap: SHROOM_TINT.cap, stem: SHROOM_TINT.stem } },
  notes: 'Sculpted giant mushroom (tall bell). Vertex colours on every LOD. cap = bell + gills (tint), stem = stem, ring, cup (mul).',
  build() {
    const far = FAR();
    const { skin, gills } = capParts({
      top: [[0, 1.72], [0.22, 1.68], [0.52, 1.48], [0.9, 1.1], [1.24, 0.62], [1.5, 0.2], [1.61, -0.02], [1.63, -0.12]],
      under: [[1.55, -0.13], [1.26, 0.3], [0.9, 0.72], [0.52, 1.0], [0.24, 1.1]],
      gills: far ? null : { n: 30, t: 0.055, depth: (r) => 0.2 * Math.pow(Math.max(0, Math.sin(Math.PI * (r - 0.24) / 1.24)), 0.7) + 0.02, short: 0.85, wave: 0.02 },
      smooth: 0.02, seed: 6,
    });
    // striate margin: shallow grooves up from the rim (integer count, no seam)
    const sk = skin.f;
    const striate = new P.Shape((x, y, z) => {
      const d = sk(x, y, z);
      if (d > 0.06) return d;
      const r = Math.hypot(x, z), th = Math.atan2(z, x);
      return d + 0.018 * ss(0.9, 1.45, r) * ss(0.3, 0.0, y) * Math.pow(0.5 + 0.5 * Math.cos(26 * th), 4);
    }, skin.b, null, 1.6);
    let cap = (far ? skin.round(0.025) : striate).part('b_skin', { mat: 'cap', paint: paintCapSkin({ c: CAPC, R, fib: 26, top: (c, r) => 0.1 * ss(0.25, 0.0, r) }) });
    if (far) cap = cap.add(underDome([[1.47, -0.13], [1.2, 0.3], [0.85, 0.72], [0.5, 1.0], [0.24, 1.1]], 0.18).part('b_gill', { mat: 'cap', paint: paintGill({ k: 0.95 }) }));
    else cap = cap.add(gills.part('b_gill', { mat: 'cap', paint: paintGill() }));
    cap = cap.cut(rimSplit(140, 1.1, 10, 10, 0.035));
    cap = capWarp(cap, { R, sag: [0.1, 300], rag: 0.04, wave: [0.06, 7], seed: 3 });
    // nodding: tipped toward +x / -z
    cap = cap.turn(-6, 0, -11).at(CAPC[0], CAPC[1], CAPC[2]);
    // stem: slim S, thickening into the cap, a bulb in a torn cup at the foot
    let st = stem({
      path: PATH, r: (t) => 0.4 - 0.12 * t + 0.18 * Math.pow(Math.max(0, t - 0.9) / 0.1, 2),
      bulb: { size: [0.44, 0.6, 0.42], at: [0, 0.42, 0], k: 0.25 },
      ridges: far ? 0 : 7, ridgeAmp: 0.022, ridgeTwist: 0.05, ridgeFrom: 0.15, ridgeTo: 0.95, seed: 7,
    });
    // snakeskin: zigzag bands of torn veil on the lower stem (paint), between y 1 and 7
    const bands = (x, y, z) => {
      const th = Math.atan2(z, x);
      const zz = y + 0.12 * Math.abs(((th * 4 / Math.PI) % 2 + 2) % 2 - 1);
      return ss(1.0, 1.6, y) * ss(7.2, 6.2, y) * ss(0.45, 0.8, (zz / 0.42) % 1);
    };
    st = st.part('b_stem', { mat: 'stem', paint: paintStem({ yTop: 10.5, foot: 0.8, seed: 7, bands }) });
    // the skirt-ring under the cap, hanging; one tear
    const ringAt = [0.0, 8.55, 0.05];
    const ring = skirt({ at: ringAt, rIn: 0.27, rOut: 0.82, drop: 0.78, thick: 0.05, rag: 0.3, seed: 11, tears: [[250, 16]] }).part('b_ring', { mat: 'stem', paint: paintVeil });
    // the volva: a torn cup round the bulb, three lobes standing up and out
    let cup = P.lathe([[0.6, 0.0], [0.73, 0.35], [0.77, 0.78], [0.69, 0.8], [0.63, 0.4], [0.55, 0.0]], { smooth: 0.02 });
    const cf = cup.f;
    cup = new P.Shape((x, y, z) => {
      const th = Math.atan2(z, x);
      const lip = 0.45 + 0.4 * Math.pow(0.5 + 0.5 * Math.cos(3 * th + 0.8 * ringNoise(th, 2, 5)), 1.5);
      return Math.max(cf(x, y, z), y - lip);
    }, cup.b, null, 1.3).part('b_cup', { mat: 'stem', paint: paintVeil });
    let all = st.add(cap);
    if (!far) all = all.add(ring).add(cup);
    else all = all.add(P.lathe([[0.27, 8.62], [0.8, 7.85], [0.62, 7.75], [0.27, 8.3]], { smooth: 0.02 }).part('b_ring', { mat: 'stem', paint: paintVeil }));
    return floorAt(all, 0);
  },
};
