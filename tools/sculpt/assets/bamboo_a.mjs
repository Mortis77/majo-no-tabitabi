// bamboo_a — the tall bamboo clump of the fox-shrine groves (replaces tree_bamboo_1 / species bamboo1: 9 m, 1.75 x 1.84,
//   collider trunkR 0.45). Drawn instanced, everything vertex coloured (bamboo parts are all 'tint' in species.js).
// SILHOUETTE: a vase of six culms rising from one knotted foot, each bowed a little its own way, the tops nodding over
//   like fishing rods; the leaves only in the top third, so the clump reads as bare striped stems under a broken parasol.
// BIG FORMS: (1) the fan of culms (unequal: 8.9 / 8.2 / 7.4 / 6.5 / 5.3 m), (2) the leafy top: layered sprays hung off
//   short twigs, alternating sides, never one ball, (3) the foot: a rhizome mound with a young sheathed shoot.
// THE EYE RESTS ON: the node rings on the lower culms (pale ridge, dark band above), the spear of the young shoot in its
//   spotted sheaths, the broken old culm stub, the litter of dry lance leaves on the mound.
// WEAR STORY: an old clump: one culm snapped long ago (a splintered stub), the lowest sheaths of the young culms still
//   clinging and peeling, a new shoot pushing up; dead leaves pile on the windward side of the foot.
// MUST NOT LOOK LIKE: the pack's straight green poles with leaf cards, a symmetric fan, a cone, evenly striped pipes.
import { bambooField, bambooBuilt, nearestCulm, measureClump, grey, ss, mix } from './bamboologs_lib.mjs';
import * as P from '../sdf.mjs';

const SPEC = {
  seed: 1,
  mound: [0.5, 0.13, 0.46], litter: 16, knuckles: 2,
  ring3Below: 2.2, ring1Below: 4.2, reach: 0.95,
  culms: [
    { base: [0.06, -0.05], h: 8.9, yaw: 200, lean: 0.012, bow: 0.12, bowYaw: 110, nod: 0.3, r0: 0.082, leafFrom: 0.62, sheath: 0, seed: 1, masses: 3 },
    { base: [0.26, 0.16], h: 8.2, yaw: 55, lean: 0.02, bow: 0.1, bowYaw: 330, nod: 0.26, r0: 0.076, leafFrom: 0.6, sheath: 1, seed: 2, masses: 3 },
    { base: [-0.24, 0.2], h: 7.4, yaw: 310, lean: 0.022, bow: 0.13, bowYaw: 40, nod: 0.26, r0: 0.072, leafFrom: 0.6, sheath: 0, seed: 3, masses: 2 },
    { base: [-0.1, -0.3], h: 6.5, yaw: 165, lean: 0.025, bow: 0.09, bowYaw: 250, nod: 0.22, r0: 0.066, leafFrom: 0.58, sheath: 2, seed: 4, masses: 2 },
    { base: [0.32, -0.2], h: 5.3, yaw: 115, lean: 0.03, bow: 0.07, bowYaw: 20, nod: 0.2, r0: 0.06, leafFrom: 0.55, sheath: 1, seed: 5, leaf: 0.9, masses: 2 },
  ],
  shoots: [{ base: [-0.3, -0.06], h: 1.5, r0: 0.082, yaw: 280, seed: 6 }],
  stubs: [{ base: [0.0, 0.33], h: 0.62, r0: 0.066, yaw: 20, seed: 7, cut: 'break' }],
};

// ---- paint: VALUES only (tint mode: the land tint gives the hue; each material is normalised to a mean grey of 0.85)
function culm(c) {
  const { x, y, z, ny, edge, cavity } = c;
  const k = nearestCulm(SPEC, x, y, z);
  // each internode: darker just above its node, lighter toward the next node (the powdery band); the ridge itself pale
  const along = ss(0.03, Math.max(0.12, k.dNode + k.toNext - 0.04), k.dNode);
  let v = 0.72 + 0.26 * along;
  v = mix([v, v, v], [1.18, 1.18, 1.18], ss(0.045, 0.012, Math.abs(k.dNode - 0.0)) + ss(0.035, 0.0, k.toNext))[0];
  v *= 0.9 + 0.12 * ss(0, 0.6, k.u);                             // younger, brighter wood up the culm
  if (k.i === 0) v *= 0.92;                                       // the oldest culm, a little duller
  v *= 1 - 0.25 * ss(0.5, 0.0, y);                                // damp foot
  return grey(v + 0.05 * edge - 0.1 * cavity);
}
const twig = (c) => grey(0.8 + 0.1 * c.edge);
function leaf(c) {
  const { x, y, z, ny, ao, cavity, edge } = c;
  // bright upper skins, dark undersides; AO into each spray and toward the culm (where sprays overlap)
  let v = 0.5 + 0.48 * ss(-0.5, 0.8, ny);
  v *= 0.62 + 0.38 * ao;
  v += 0.1 * edge - 0.12 * cavity + 0.04 * P.fbm(x * 3, y * 3, z * 3, 5, 2);
  return grey(v);
}
function sheath(c) {
  const { x, y, z, edge, cavity } = c;
  // papery: mid value, dark blotches, pale drying edges
  const sp = ss(0.35, 0.55, P.fbm(x * 18, y * 9, z * 18, 9, 2));
  return grey(0.78 - 0.28 * sp + 0.3 * edge - 0.15 * cavity);
}
function stub(c) {
  const { ny, edge, cavity, y } = c;
  // the old broken culm: dry and pale, the broken top paler still
  return grey(0.95 + 0.25 * ss(0.4, 0.62, y) + 0.15 * edge - 0.35 * cavity);
}
function foot(c) {
  const { ny, cavity, ao, edge, x, z } = c;
  // dark damp earth under the clump; knuckles of rhizome a little lighter where they arch up
  return grey(0.42 + 0.18 * edge + 0.08 * ss(0.3, 0.9, ny) - 0.12 * cavity);
}
const litter = (c) => grey(1.25 + 0.15 * c.edge - 0.3 * c.cavity);

export default {
  name: 'bamboo_a', id: 'sculpt_tree_bamboo_a', species: ['bamboo1'],
  voxel: 0.012,
  lods: [4000, 1400, 400],
  fields: { 1: { env: { BL_MID: '1' }, voxel: 1.7 }, 2: { env: { BL_FAR: '1' }, voxel: 2.6 } },
  ground: 0, aoRange: 0.5, aoStrength: 0.55, cavity: [0.02, 0.08], cavityDark: 0.3, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'none', look: { rim: 0.3, spec: 0.25, specPower: 30 } }, crown: { name: 'leaves', surface: 'none' } },
  tintMats: ['wood', 'crown'],
  previewTint: [0.175, 0.503, 0.093],                                  // scatter C.bamboo 0x74bc56 (linear)
  landTints: { 'DUSK 8cb04c': [0.262, 0.434, 0.073], 'NIGHT 2c6a5c': [0.025, 0.144, 0.107] },
  replaces: { file: 'assets/models/nature/trees/tree_bamboo_1.glb', rules: { stalk: { tint: [0.175, 0.503, 0.093], k: 1 } } },
  notes: 'Sculpted bamboo clump (bamboo1). trunk = culms, twigs, sheaths, foot (tint, value ramp), leaves = leaf sprays (tint). COLOR_0.a = snow mask. See .tmp/sculpt/bamboo_a/INSTALL.md.',
  measure: (o, PARTS) => measureClump(o, PARTS),
  built: (li) => bambooBuilt(SPEC, li),
  build({ S }) {
    const paints = { culm, twig, leaf, sheath, shoot: sheath, stub, foot, litter };
    for (const [n, m] of [['culm', 'wood'], ['twig', 'wood'], ['leafspray', 'crown'], ['sheath', 'wood'], ['stub', 'wood'], ['foot', 'wood'], ['litter', 'wood']]) S.part(n, { mat: m, paint: paints[n === 'leafspray' ? 'leaf' : n] });
    return bambooField(S, SPEC, paints);
  },
};
