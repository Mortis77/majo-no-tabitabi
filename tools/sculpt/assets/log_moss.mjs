// log_moss — an old log sinking back into the forest floor (replaces nat_log_moss_1 / species logMoss: 1.04 x 0.80 x 3.10,
//   lying along Z).
// SILHOUETTE: a fat log, its back humped under a thick moss blanket that drapes over the sides, one end rotted open into
//   a dark hollow mouth, the other broken off ragged; a cluster of glowing caps climbing its flank.
// BIG FORMS: (1) the log body, sagging and slightly bent, (2) the moss blanket (one big form with a scalloped lower edge,
//   not a green coat on everything), (3) the hollow end.
// THE EYE RESTS ON: the black mouth of the hollow with its crumbling orange rim, the mushroom cluster, the edge where the
//   moss gives way to the grey fissured wood where the bark has fallen.
// WEAR STORY: down for decades: the bark is gone from the upper flanks (grey, deeply fissured wood), clings low in loose
//   plates; the heart rotted from the +Z end inward; moss holds the whole top; caps grow where the rot is wettest.
// MUST NOT LOOK LIKE: a pack log with a green lid, a clean cylinder, evenly fuzzy moss.
import { logBody, plates, furrows, mossBlanket, mushroom, splinters, bunion, limb, floorAt, brk, lit, ss, mix, C, WOODPAINT as W, MOSSV, CAPV } from './bamboologs_lib.mjs';
import * as P from '../sdf.mjs';

const FARF = () => process.env.BL_FAR === '1';
const Y0 = 0.36, R0 = 0.395, ZA = -1.5, ZB = 1.55;
const CY = (z) => Y0 - 0.035 * Math.cos((z / 1.55) * Math.PI * 0.5);           // the middle sags into the ground

// bark only low on the flanks (patches); bare fissured wood above
const barkMask = (x, y, z) => (CY(z) + 0.1 - y) * 6 + 0.35 * P.fbm(x * 3, y * 3, z * 1.5, 13, 2) + 0.15;
function wood(c) {
  const { x, y, z } = c;
  const b = ss(-0.05, 0.08, barkMask(x, y, z));
  // the old wood under the moss: dark, damp, warm grey-brown (darker than the dead trees' silver)
  const bare = mix(W.bare(c), mix(C('#5a4a3c'), C('#7a6652'), ss(-0.3, 0.8, c.ny)), 0.65);
  return mix(bare, W.bark(c), b);
}
export default {
  name: 'log_moss', id: 'sculpt_nat_log_moss_a', species: ['logMoss'], view: 'prop',
  voxel: 0.0085,
  lods: [2400, 800, 250],
  farFrom: 2, farVoxel: 2.5, lodError: [0.02, 0.05, 0.1],
  ground: 0, aoRange: 0.3, aoStrength: 0.55, cavity: [0.01, 0.05], cavityDark: 0.4, creaseAngle: 50,
  materials: { wood: { name: 'trunk', surface: 'bark' }, crown: { name: 'moss', surface: 'none' }, cap: { name: 'cap', surface: 'none' } },
  tintMats: ['crown', 'cap'], tintK: { crown: 0.9 },
  previewTint: [0.159, 0.347, 0.069],
  tints: { cap: [0.323, 0.275, 0.042] },
  landTints: { 'DUSK MOSS 9a8f3a': { crown: [0.323, 0.275, 0.042], cap: [0.323, 0.275, 0.042] }, 'NIGHT MOSS 2a6a66': { crown: [0.023, 0.145, 0.133], cap: [0.023, 0.145, 0.133] } },
  replaces: { file: 'assets/models/refined/nat_log_moss_1.glb', rules: { moss: { tint: [0.159, 0.347, 0.069], k: 0.9 }, cap: { tint: [0.323, 0.275, 0.042] }, stem: { mul: [0.745, 0.672, 0.552] } } },
  notes: 'Sculpted mossy half-rotted log (logMoss). trunk (mul, real colour), moss (tint), cap (tint, glow). COLOR_0.a = snow mask. See .tmp/sculpt/bamboo_a/INSTALL.md.',
  heroAz: 55, gameAz: 40,
  build({ S }) {
    const far = FARF();
    S.part('wood', { mat: 'wood', paint: lit(wood) }); S.part('rot', { mat: 'wood', paint: lit(W.rot) }); S.part('mouth', { mat: 'wood', paint: lit(W.hollow) });
    S.part('mstem', { mat: 'wood', paint: lit(W.stem) }); S.part('mossblanket', { mat: 'crown', paint: MOSSV }); S.part('mcaps', { mat: 'cap', paint: CAPV });
    // body: two segments make a slight bend and sag; lumpy
    const r = (t) => R0 * (1.04 - 0.08 * t) * (1 + 0.04 * Math.sin(t * 7 + 1));
    let body = logBody([0.02, CY(ZA), ZA], [-0.01, CY(0), 0.0], (t) => r(t * 0.5), { aspect: 0.9, lumps: far ? 0 : 0.035, seed: 3 })
      .softAdd(logBody([-0.01, CY(0), 0.0], [0.05, CY(ZB), ZB], (t) => r(0.5 + t * 0.5), { aspect: 0.9, lumps: far ? 0 : 0.035, seed: 4 }), 0.12);
    if (!far) body = furrows(body, { axis: 'z', centre: (z) => [0.02, CY(z)], n: 9, depth: 0.032, width: 0.13, wob: 1.5, seed: 6, plate: 0.6 });
    body = body.part('wood', { mat: 'wood', paint: lit(wood) });
    // the hollow mouth at +Z: rotted in, rim crumbling
    let mouth = P.capsule([0.04, CY(ZB) + 0.02, 0.9], [0.05, CY(ZB) + 0.03, ZB + 0.3], 0.25);
    body = body.cut(mouth.part('mouth', { mat: 'wood', paint: lit(W.hollow) }), { paintCut: true });
    // the ragged broken -Z end: a slanted break with chunks out
    body = body.cut(P.plane(P.norm([-0.15, -0.3, 1]), [0, Y0, ZA + 0.06]).intersect(P.box([1.2, 1, 0.4]).at(0, Y0, ZA - 0.1)).part('rot', { mat: 'wood', paint: lit(W.rot) }), { paintCut: true });
    if (!far) {
      for (const [p, d, dep, sd] of [[[0.25, Y0 + 0.2, ZB - 0.02], [0.6, 0.6, 0.5], 0.07, 1], [[-0.2, Y0 + 0.24, ZB - 0.05], [-0.6, 0.6, 0.5], 0.06, 2], [[0.05, Y0 - 0.2, ZB], [0, -0.3, 1], 0.05, 3],
        [[-0.2, Y0 + 0.15, ZA + 0.1], [-0.5, 0.5, -0.7], 0.07, 4], [[0.22, Y0 - 0.05, ZA + 0.1], [0.7, 0, -0.7], 0.06, 5]]) body = body.cut(brk(p, d, dep, { seed: sd }).part('rot', { mat: 'wood', paint: lit(W.rot) }), { paintCut: true });
      body = body.add(bunion(splinters([0.0, Y0 + 0.12, ZA + 0.05], [0.1, 0.25, -1], 0.06, { n: 3, len: 0.16, seed: 7, rmin: 0.014 })).part('rot', { mat: 'wood', paint: lit(W.rot) }));
    }
    // a broken branch stub standing up out of the back (through the moss), splintered
    const STB = [[-0.08, Y0 + 0.25, -0.55], [-0.13, Y0 + 0.37, -0.62]];
    body = body.softAdd(limb([STB[0], STB[1]], 0.075, 0.06, 1).part('wood', { mat: 'wood', paint: lit(wood) }), 0.05);
    if (!far) body = body.add(bunion(splinters(STB[1], [-0.25, 1, -0.3], 0.05, { n: 3, len: 0.1, seed: 9, rmin: 0.012 })).part('rot', { mat: 'wood', paint: lit(W.rot) }));
    let all = body;
    // the moss blanket: the whole top, its lower edge scalloped and draping lower on the damp -X side; not on the mouth
    const moss = mossBlanket(body, far ? 0.07 : 0.075, (x, y, z) => {
      // the blanket's lower edge: high on the dry +X flank, draping lower on the damp -X flank, scalloped
      const edge = CY(z) + 0.2 + 0.07 * Math.tanh(x * 5) - 0.08 * P.fbm(x * 2, 0, z * 2.4, 5, 2) - 0.045 * Math.sin(z * 7 + 1.3);
      return (y - edge) * 5 * ss(ZB - 0.08, ZB - 0.3, z) * ss(ZA + 0.05, ZA + 0.3, z) - 0.02;
    }, { seed: 8, scale: 0.13, bump: 0.35, taper: 0.5, edge: 0.3 });
    all = all.add(moss.part('mossblanket', { mat: 'crown', paint: MOSSV }));
    // a mushroom cluster climbing the +X flank near the rotten end
    const st = [], cp = [];
    for (const [at, d, len, rr, R] of [[[0.37, 0.27, 0.72], [0.8, 0.6, 0.05], 0.1, 0.02, 0.085], [[0.37, 0.38, 0.84], [0.75, 0.66, 0.1], 0.08, 0.018, 0.068], [[0.36, 0.19, 0.88], [0.85, 0.5, 0.1], 0.06, 0.016, 0.055],
      [[0.38, 0.3, 0.58], [0.8, 0.55, -0.2], 0.06, 0.014, 0.05], [[0.33, 0.46, 0.95], [0.6, 0.8, 0.1], 0.05, 0.013, 0.042]]) {
      if (far && R < 0.06) continue;
      const m = mushroom(at, d, len, rr * (far ? 1.4 : 1), R * (far ? 1.15 : 1)); st.push(m.stem); cp.push(m.cap);
    }
    all = all.add(bunion(st).part('mstem', { mat: 'wood', paint: lit(W.stem) })).add(bunion(cp).part('mcaps', { mat: 'cap', paint: CAPV }));
    return floorAt(all, 0);
  },
};
