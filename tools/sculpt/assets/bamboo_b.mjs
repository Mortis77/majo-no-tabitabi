// bamboo_b — the smaller, worked bamboo clump by the paths (replaces tree_bamboo_2 / species bamboo2: 6 m, 1.31 x 1.39,
//   collider trunkR 0.35). Drawn instanced, everything vertex coloured (bamboo parts are all 'tint' in species.js).
// SILHOUETTE: a leaning sheaf: five culms that all bow the same way (the prevailing wind, toward -X), the tallest nodding
//   right over, leaves only on the upper half; two culms were HARVESTED: slant-cut stumps stand among the living stems.
// BIG FORMS: (1) the leaning sheaf of culms (6.0 / 5.4 / 4.7 / 3.9 / 3.1 m), (2) the leafy tops: two drooping masses per
//   culm, alternating, (3) the foot with the two cut stumps.
// THE EYE RESTS ON: the slant cuts of the harvested culms (the hollow tube showing), the node rings low down, the sheaths
//   still on the two youngest culms.
// WEAR STORY: someone cuts poles here: two culms taken at knee height with a clean slant; the clump leans away from the
//   wind; the youngest culms still wear their sheaths; dead leaves gather in the lee.
// MUST NOT LOOK LIKE: the pack's straight green pole, bamboo_a mirrored, a symmetric fan, a cone.
import { bambooField, bambooBuilt, nearestCulm, measureClump, grey, ss, mix } from './bamboologs_lib.mjs';
import * as P from '../sdf.mjs';

const SPEC = {
  seed: 2,
  mound: [0.42, 0.11, 0.38], litter: 12, knuckles: 1,
  ring3Below: 2.2, ring1Below: 3.6, ring1BelowLod1: 2.6, reach: 0.74,
  culms: [
    { base: [0.26, 0.04], h: 6.0, yaw: 268, lean: 0.07, bow: 0.14, bowYaw: 268, nod: 0.4, r0: 0.066, leafFrom: 0.58, sheath: 0, seed: 11, masses: 2, leaf: 0.85 },
    { base: [0.08, 0.27], h: 5.4, yaw: 285, lean: 0.07, bow: 0.12, bowYaw: 255, nod: 0.34, r0: 0.062, leafFrom: 0.62, sheath: 0, seed: 12, masses: 2, leaf: 0.85 },
    { base: [0.3, -0.18], h: 4.7, yaw: 250, lean: 0.08, bow: 0.1, bowYaw: 280, nod: 0.3, r0: 0.058, leafFrom: 0.64, sheath: 1, seed: 13, masses: 1, leaf: 0.8 },
    { base: [-0.06, -0.24], h: 3.9, yaw: 290, lean: 0.06, bow: 0.07, bowYaw: 240, nod: 0.22, r0: 0.052, leafFrom: 0.64, sheath: 2, seed: 14, masses: 1, leaf: 0.75 },
    { base: [-0.2, 0.18], h: 3.1, yaw: 255, lean: 0.05, bow: 0.06, bowYaw: 270, nod: 0.18, r0: 0.047, leafFrom: 0.66, sheath: 2, seed: 15, masses: 0, leaf: 0.7 },
  ],
  shoots: [],
  stubs: [{ base: [-0.26, -0.04], h: 0.42, r0: 0.06, yaw: 300, seed: 16, cut: 'saw' }, { base: [0.14, -0.3], h: 0.55, r0: 0.056, yaw: 200, seed: 17, cut: 'saw' }],
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
  name: 'bamboo_b', id: 'sculpt_tree_bamboo_b', species: ['bamboo2'],
  voxel: 0.011,
  lods: [4000, 1400, 400],
  fields: { 1: { env: { BL_MID: '1' }, voxel: 1.7 }, 2: { env: { BL_FAR: '1' }, voxel: 2.6 } },
  ground: 0, aoRange: 0.5, aoStrength: 0.55, cavity: [0.02, 0.08], cavityDark: 0.3, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'none', look: { rim: 0.3, spec: 0.25, specPower: 30 } }, crown: { name: 'leaves', surface: 'none' } },
  tintMats: ['wood', 'crown'],
  previewTint: [0.175, 0.503, 0.093],                                  // scatter C.bamboo 0x74bc56 (linear)
  landTints: { 'DUSK 8cb04c': [0.262, 0.434, 0.073], 'NIGHT 2c6a5c': [0.025, 0.144, 0.107] },
  replaces: { file: 'assets/models/nature/trees/tree_bamboo_2.glb', rules: { stalk: { tint: [0.175, 0.503, 0.093], k: 1 } } },
  notes: 'Sculpted bamboo clump (bamboo2). trunk = culms, twigs, sheaths, foot (tint, value ramp), leaves = leaf sprays (tint). COLOR_0.a = snow mask. See .tmp/sculpt/bamboo_a/INSTALL.md.',
  measure: (o, PARTS) => measureClump(o, PARTS),
  built: (li) => bambooBuilt(SPEC, li),
  build({ S }) {
    const paints = { culm, twig, leaf, sheath, shoot: sheath, stub, foot, litter };
    for (const [n, m] of [['culm', 'wood'], ['twig', 'wood'], ['leafspray', 'crown'], ['sheath', 'wood'], ['stub', 'wood'], ['foot', 'wood'], ['litter', 'wood']]) S.part(n, { mat: m, paint: paints[n === 'leafspray' ? 'leaf' : n] });
    return bambooField(S, SPEC, paints);
  },
};
