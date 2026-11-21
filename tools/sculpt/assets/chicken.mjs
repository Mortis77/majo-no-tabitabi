// The village hen, sculpted anew on the skeleton and clips of ani_chicken (assets/models/refined/ani_chicken.glb, CC0).
// Bind pose, game metres, front = +Z, foot on y = 0. Bones: Root, Body (everything above the legs rides on it), Leg.L /
// Leg.R (hip at y 0.109, ankle-end at y 0.006). A round, soft hen: clear head, comb and wattles, a fan of tail
// feathers, folded wings raised from the body, scaled shanks and toes.
// Weights: transferred from the old mesh and smoothed (4 rounds). Rules pin only the comb, wattles, beak and eyes to Body.
// Measured (tools/sculpt/README.md): pinning the shanks to their leg or hand-blending the thighs made the hip seam WORSE
// than the plain transfer, so they keep the transfer. SCULPT_NO_RULES=1 builds chicken_rawtransfer for comparison.
const RULES = !process.env.SCULPT_NO_RULES;

export default {
  name: RULES ? 'chicken' : 'chicken_rawtransfer',
  id: 'sculpt_ani_chicken',
  rig: { file: 'assets/models/refined/ani_chicken.glb' },
  rigCredit: 'Quaternius, CC0 (skeleton + clips)',
  voxel: 0.0022,
  lods: [4200],
  ground: 0,
  aoRange: 0.06,
  cavityDark: 0.25,
  cavity: [0.003, 0.012],
  creaseAngle: 75,
  bandSlack: 0.01,
  weights: { smooth: 4, smoothAlpha: 0.5 },
  poses: [['Idle', 0.5], ['Idle_Peck', 1.0], ['Run', 0.1], ['Run', 0.29], ['Attack', 0.15], ['Attack', 0.28]],
  notes: 'Sculpted hen on the ani_chicken skeleton (joints, IBMs, clips unchanged). Vertex colours, no texture. Material name kept (AtlasMaterial).',

  build({ S, rig }) {
    const body = rig.bone('Body');
    const side = (x) => (x >= 0 ? 1 : -1);
    const R = (name) => (RULES ? name : undefined);
    // ---- body: an egg, breast low and forward, back rising to the tail
    let torso = S.ellipsoid([0.098, 0.084, 0.128]).turn(-12, 0, 0).at(0, 0.19, -0.03);
    torso = torso.softAdd(S.ellipsoid([0.08, 0.075, 0.07]).at(0, 0.175, 0.045), 0.04);        // breast
    torso = torso.softAdd(S.ellipsoid([0.07, 0.06, 0.06]).at(0, 0.235, -0.12), 0.05);        // saddle toward the tail
    // ---- neck + head
    const neck = S.taperedCapsule([0, 0.235, 0.045], [0, 0.335, 0.07], 0.05, 0.036);
    const head = S.sphere(0.042).scale([0.95, 1, 1.08]).at(0, 0.355, 0.075);
    let upper = torso.softAdd(neck, 0.05).softAdd(head, 0.025);
    // feathers as form: shallow scallops over body and neck (the hackles), rows running down the body
    upper = upper.rough({ type: 'cells', scale: 0.02, amp: 0.0011, seed: 3 });
    // ---- folded wings: raised shields on the flanks, primaries stepping back
    const wing = S.ellipsoid([0.026, 0.058, 0.098]).turn(-8, 0, -6).at(0.084, 0.2, -0.045)
      .softAdd(S.ellipsoid([0.018, 0.03, 0.07]).turn(-14, 0, -4).at(0.08, 0.2, -0.13), 0.02)
      .strata({ spacing: 0.016, depth: 0.0018, width: 0.004, wobble: 0.004, axis: 'z', seed: 5 });
    upper = upper.softAdd(wing.mirror('x'), 0.012);
    // ---- tail: a fan of seven feathers, up and back
    const tail = [];
    for (let i = 0; i < 7; i++) {
      const a = (i - 3) * 17, len = 0.075 - Math.abs(i - 3) * 0.007;
      // each feather: a flat blade, pointed tip, fanned about the tail root and slightly cupped
      const blade = S.ellipsoid([0.008, len, 0.02]).taper(-4).at(0, len * 0.8, 0);
      tail.push(blade.turn(-32 - Math.abs(i - 3) * 4, 0, a).at(0, 0.255, -0.15 - Math.abs(i - 3) * 0.006));
    }
    upper = upper.softAdd(S.union(...tail), 0.022);
    upper = upper.part('feathers', { mat: 'body', paint: paintFeathers }); // transferred weights: the belly near the hips follows the legs a little

    // ---- comb (five lobes along the crown), wattles, beak, eyes
    const lobes = [];
    for (let i = 0; i < 5; i++) { const z = 0.045 + i * 0.016, h = 0.022 - Math.abs(i - 1.6) * 0.004; lobes.push(S.ellipsoid([0.0075, h, 0.0105]).at(0, 0.392 + h * 0.4, z)); }
    const comb = S.softUnion(0.006, ...lobes).part('comb', { mat: 'body', paint: () => S.color('#d8362c'), bone: R('Body') });
    const wattles = S.ellipsoid([0.009, 0.017, 0.009]).at(0.008, 0.305, 0.112).mirror('x').part('wattle', { mat: 'body', paint: () => S.color('#c92e27'), bone: R('Body') });
    const beak = S.taperedCapsule([0, 0.344, 0.105], [0, 0.333, 0.142], 0.0125, 0.0025).part('beak', { mat: 'body', paint: (c) => S.mix(S.color('#f0b23c'), S.color('#c9822a'), c.cavity), bone: R('Body') });
    const eye = S.sphere(0.0085).at(0.0375, 0.362, 0.09).mirror('x').part('eye', { mat: 'body', paint: (c) => (c.ny > 0.55 && c.nz > 0.1 ? S.color('#fff4dc') : S.color('#1d1712')), bone: R('Body') });
    let hen = upper.softAdd(comb, 0.006).softAdd(wattles, 0.008).softAdd(beak, 0.006).softAdd(eye, 0.002);

    // ---- legs: fluffy thighs (blend across the hip), scaled yellow shanks, three toes forward and one back
    const L = rig.bone('Leg.L');
    const thigh = S.ellipsoid([0.034, 0.04, 0.042]).at(L.head[0] + 0.004, 0.125, L.head[2] + 0.004).mirror('x')
      .part('thigh', { mat: 'body', paint: paintFeathers }); // transferred + smoothed (an explicit blend rule measured worse)
    hen = hen.softAdd(thigh, 0.02);
    const hx = L.head[0], hz = L.head[2];
    let shank = S.taperedCapsule([hx, 0.105, hz], [hx, 0.018, hz + 0.004], 0.0105, 0.0078)
      .strata({ spacing: 0.0075, depth: 0.0009, width: 0.0022, wobble: 0.001, seed: 9 });
    const toe = (dx, dz, l) => S.taperedCapsule([hx, 0.012, hz + 0.004], [hx + dx * l, 0.006, hz + 0.004 + dz * l], 0.0062, 0.0035);
    shank = S.softUnion(0.008, shank, toe(0, 1, 0.055), toe(0.55, 0.84, 0.045), toe(-0.55, 0.84, 0.045), toe(0, -1, 0.025));
    const legs = shank.mirror('x').part('leg', { mat: 'body', paint: (c) => S.mix(S.color('#eab347'), S.color('#a8701f'), c.cavity * 0.8 + 0.15) });  // transfer gives these 1.0 to their leg already; pinning them made the hip seam worse
    hen = hen.softAdd(legs, 0.006);
    void body; void side;
    return hen;
  },
};

import * as P from '../sdf.mjs';
function paintFeathers(c) {
  const { x, y, z, ny, cavity, edge } = c;
  // buff hen: cream body, warm brown back and wing coverts, dark-tipped tail, pale breast
  let col = P.mix(P.color('#f1e6cf'), P.color('#e7d3ad'), P.ss(0.15, 0.3, y) * 0.7);
  const back = P.ss(0.0, 0.6, ny) * P.ss(0.15, 0.24, y);
  col = P.mix(col, P.color('#c99a5e'), back * 0.55);
  const wing = Math.abs(x) > 0.06 && y > 0.15 && y < 0.26 && z < 0.03 ? 1 : 0;
  col = P.mix(col, P.color('#b9824a'), wing * 0.65 * P.ss(0.03, -0.08, z));
  const tail = P.ss(-0.13, -0.17, z) * P.ss(0.25, 0.3, y);
  col = P.mix(col, P.color('#5a3a22'), tail * P.ss(0.3, 0.36, y) * 0.9);
  col = P.mix(col, P.color('#a8733f'), tail * 0.5);
  // hackles: neck feathers a shade more golden
  col = P.mix(col, P.color('#f3d18e'), P.ss(0.26, 0.31, y) * P.ss(0.0, 0.05, z) * 0.45);
  // feather edges lighter, the gaps between them darker
  col = P.mix(col, P.color('#fff8ea'), edge * 0.4);
  col = P.mix(col, P.color('#b0916a'), cavity * 0.3);
  return col;
}
