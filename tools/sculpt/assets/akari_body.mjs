// 灯里 — the base figure's BODY as a field (neck down), sculpted in the bind pose (T-pose, palms down) on the VRoid
// skeleton of the present heroine. Her left is +x, front is +z, metres. A tailor's form: every landmark cloth and
// animation need, a smooth non-explicit surface. One side is modelled and mirrored; the legs keep a slot between them.
// Used three ways: the kit's pool (default export = asset), akari_head.mjs (neck + shoulders to join the head on) and
// akari_under.mjs (the under-robe is grown from this surface).
import path from 'node:path';

export const RIG_FILE = '.tmp/sculpt/akari_base/rig_source.glb';
export const SOLE_Y = 0.034;            // the skeleton stands on 34 mm zori: the bare sole is that far above y = 0
// the four small toes of the left foot: [x, z] of the root, [x, z] of the tip, radius at root and tip (the big toe is apart)
export const TOES = [[0.0428, 0.1, 0.0438, 0.1262, 0.0081, 0.0067], [0.0548, 0.098, 0.0566, 0.1205, 0.0077, 0.0063], [0.0656, 0.094, 0.0682, 0.113, 0.0073, 0.0059], [0.0752, 0.0885, 0.0784, 0.1042, 0.0068, 0.0055]];

/** joint heads (bind) -> the body. `only`: 'all' | 'core' (no hands / feet detail, for the garment field) */
export function bodyShape(S, J) {
  const j = (n) => J('J_Bip_' + n);
  const E = (c, r, t) => (t ? S.ellipsoid(r).turn(t[0], t[1], t[2]) : S.ellipsoid(r)).at(c[0], c[1], c[2]);
  const TC = S.taperedCapsule;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // ------------------------------------------------------------------------------------------------ torso (centred)
  // ribcage: an egg, widest low, narrowing to the neck; the waist column; the pelvis as a wide low block
  // (revision 2: waist 4.5 mm in at each side, shoulder girdle lower, the bust bridged like a dress form, no centre cuts)
  let torso = E([0, 1.161, 0.001], [0.105, 0.121, 0.073]);                              // ribcage
  torso = torso.softAdd(E([0, 1.217, -0.013], [0.103, 0.033, 0.050]), 0.03);            // shoulder girdle
  torso = torso.softAdd(E([0, 1.035, 0.007], [0.0765, 0.126, 0.053]), 0.05);           // waist column
  torso = torso.softAdd(E([0, 0.99, 0.021], [0.057, 0.074, 0.036]), 0.045);               // lower abdomen: flat, a little forward
  torso = torso.softAdd(E([0, 0.903, -0.002], [0.100, 0.085, 0.073]), 0.06);            // pelvis
  // side masses (her left; mirrored)
  let side = E([0.081, 0.882, -0.003], [0.043, 0.093, 0.058]);                           // hip over the trochanter
  side = side.softAdd(E([0.057, 0.884, -0.045], [0.054, 0.078, 0.051]), 0.04);            // gluteal mass
  side = side.softAdd(E([0.055, 0.957, -0.045], [0.047, 0.062, 0.031], [10, 0, 0]), 0.04); // flank into the back of the pelvis
  side = side.softAdd(E([0.060, 1.183, -0.059], [0.041, 0.062, 0.013], [-6, 12, 0]), 0.045); // shoulder blade
  side = side.softAdd(E([0.075, 1.133, -0.026], [0.030, 0.081, 0.041]), 0.05);            // latissimus: the back's V into the waist
  side = side.softAdd(E([0.050, 1.155, 0.057], [0.042, 0.038, 0.027]), 0.045);            // bust volume (smooth)
  side = side.softAdd(E([0.046, 1.198, 0.042], [0.046, 0.036, 0.028]), 0.04);                // upper chest plane into the bust
  // trapezius: LOW at the neck and falling 20 degrees to the shoulder point, so the neck rises as a column
  side = side.softAdd(TC([0.010, 1.274, -0.023], [0.100, 1.239, -0.012], 0.020, 0.0165), 0.032);
  side = side.softAdd(TC([0.016, 1.248, 0.033], [0.099, 1.249, 0.004], 0.0052, 0.0068), 0.018); // collarbone: a hint
  torso = torso.softAdd(side.mirror('x'), 0.035);
  torso = torso.softAdd(E([0, 1.152, 0.056], [0.047, 0.037, 0.0233]), 0.04);              // the bust bridged across the sternum (dress form)
  torso = torso.softAdd(E([0, 1.266, -0.031], [0.028, 0.027, 0.020]), 0.03);               // the nape: the two trapezius ends joined (review H2: a dent sat here)
  // the hollow that gives the back its line
  torso = torso.softCut(TC([0, 0.975, -0.1], [0, 1.23, -0.106], 0.016, 0.014), 0.035);     // spine furrow
  // neck: slender (33 mm at the jaw), a little forward at the top, flowing into the shoulders
  const neck = TC([0, 1.238, -0.024], [0, 1.352, -0.004], 0.0302, 0.0276);      // nominal: the blends add ~3 mm (measured width 68 mm)
  torso = torso.softAdd(neck, 0.032);

  // ------------------------------------------------------------------------------------------------ leg (her left)
  const hip = j('L_UpperLeg'), knee = j('L_LowerLeg'), ank = j('L_Foot'), toe = j('L_ToeBase');
  let leg = TC([hip[0] + 0.004, hip[1] - 0.025, 0], [knee[0], knee[1] + 0.03, -0.002], 0.061, 0.0405);
  leg = leg.softAdd(E([0.070, 0.719, 0.019], [0.034, 0.149, 0.0345], [3, 0, 2]), 0.04);   // quadriceps: the front line of the thigh
  leg = leg.softAdd(E([0.062, 0.705, -0.023], [0.034, 0.144, 0.030], [-3, 0, 2]), 0.04);  // hamstrings
  leg = leg.softAdd(E([0.041, 0.778, -0.004], [0.029, 0.077, 0.044]), 0.035);          // adductors (1 cm of girth less than round 1)
  // knee: a structure — condyles, a FLAT kneecap with a plane at each side, the hollow behind
  leg = leg.softAdd(E([knee[0], knee[1] + 0.004, 0.0], [0.0395, 0.050, 0.037]), 0.03);
  leg = leg.softAdd(E([knee[0] + 0.001, knee[1] + 0.012, 0.0335], [0.0185, 0.024, 0.0095]), 0.02); // patella
  leg = leg.softAdd(E([knee[0], knee[1] - 0.04, 0.03], [0.012, 0.022, 0.009]), 0.014);             // tibial tuberosity
  // (V7: a third shallower — in clay the two planes read as the grooves of a doll's ball joint)
  leg = leg.softCut(E([knee[0] + 0.0295, knee[1] + 0.004, 0.0392], [0.008, 0.0225, 0.0064]), 0.03);  // plane outside the kneecap (shallow)
  leg = leg.softCut(E([knee[0] - 0.0285, knee[1] + 0.004, 0.0392], [0.008, 0.0225, 0.0064]), 0.03);  // plane inside the kneecap
  leg = leg.softCut(E([knee[0], knee[1] + 0.002, -0.052], [0.016, 0.03, 0.012]), 0.02);            // popliteal hollow
  // shin + calf (belly HIGH, to the back and a little inside: +2 cm of girth in revision 2), tendon into a fine ankle
  leg = leg.softAdd(TC([knee[0] - 0.001, knee[1] - 0.02, -0.004], [ank[0], ank[1] + 0.03, ank[2] + 0.002], 0.038, 0.0238), 0.03);
  leg = leg.softAdd(E([0.050, 0.399, -0.034], [0.035, 0.109, 0.035]), 0.03);
  leg = leg.softAdd(E([0.037, 0.374, -0.024], [0.0255, 0.088, 0.028]), 0.03);                 // inner head: lower, fuller
  leg = leg.softAdd(E([0.065, 0.407, -0.020], [0.023, 0.086, 0.026]), 0.03);              // outer head: higher, flatter
  leg = leg.softAdd(TC([0.047, 0.27, -0.044], [ank[0], 0.092, -0.056], 0.012, 0.0125), 0.022);     // Achilles tendon
  leg = leg.softAdd(TC([ank[0], ank[1] + 0.04, ank[2] + 0.002], [ank[0], ank[1] - 0.02, ank[2] + 0.004], 0.0245, 0.0255), 0.02);
  leg = leg.softAdd(S.sphere(0.0115).at(ank[0] + 0.0235, ank[1] - 0.012, ank[2] - 0.006), 0.012);  // outer malleolus (lower, back)
  leg = leg.softAdd(S.sphere(0.012).at(ank[0] - 0.023, ank[1] + 0.0, ank[2] + 0.002), 0.012);      // inner malleolus (higher)
  // foot: heel, instep, ball, FIVE toes — the big toe apart (zori thong), four small ones in a falling row
  let foot = E([ank[0], 0.07, -0.046], [0.027, 0.038, 0.031]);                                      // heel
  foot = foot.softAdd(TC([ank[0], 0.098, -0.012], [toe[0] + 0.002, 0.063, 0.07], 0.031, 0.02).scale([1, 1, 1]), 0.025);  // instep
  foot = foot.softAdd(E([toe[0] + 0.003, 0.053, 0.072], [0.036, 0.019, 0.03]), 0.02);               // ball
  foot = foot.softAdd(E([ank[0] + 0.012, 0.05, 0.01], [0.022, 0.016, 0.055]), 0.02);                // outer edge of the sole
  let toes = TC([0.0232, 0.0478, 0.094], [0.0222, 0.0456, 0.1268], 0.0114, 0.0098);                 // big toe
  for (const [x0, z0, x1, z1, r0, r1] of TOES) toes = toes.softAdd(TC([x0, SOLE_Y + r0 + 0.0022, z0], [x1, SOLE_Y + r1 + 0.0012, z1], r0, r1).softAdd(S.sphere(r1 * 1.08).at(x1, SOLE_Y + r1 + 0.0014, z1 + r1 * 0.2), 0.003), 0.0022);
  foot = foot.softAdd(toes, 0.0065);
  foot = foot.softCut(E([0.017, 0.03, 0.012], [0.02, 0.02, 0.042]), 0.014);                         // the arch, inside
  foot = foot.softIntersect(S.plane([0, -1, 0], [0, SOLE_Y, 0]), 0.007);                            // flat sole
  leg = leg.softAdd(foot, 0.018);
  leg = leg.softIntersect(S.plane([-1, 0, 0], [0.0045, 0, 0]), 0.012);                              // the slot between the legs
  let body = torso.softAdd(leg.mirror('x'), 0.035);

  // ------------------------------------------------------------------------------------------------ arm (her left)
  // (revision 2: deltoid 3 mm slimmer, the upper arm tapers to the elbow, a little flesh inside the elbow for the bend)
  const sh = j('L_UpperArm'), el = j('L_LowerArm'), wr = j('L_Hand');
  let arm = E([sh[0] + 0.020, sh[1] + 0.002, sh[2] - 0.002], [0.043, 0.0302, 0.0362], [0, 0, -8]);  // deltoid cap
  arm = arm.softAdd(TC([sh[0] + 0.01, sh[1], sh[2]], [el[0] - 0.012, el[1], el[2]], 0.0298, 0.0240), 0.03);
  arm = arm.softAdd(E([0.2, 1.224, 0.008], [0.069, 0.0214, 0.0196]), 0.025);          // biceps (front in this pose)
  arm = arm.softAdd(E([0.19, 1.225, -0.015], [0.070, 0.022, 0.0184]), 0.025);         // triceps
  arm = arm.softAdd(E([el[0], el[1], el[2] - 0.002], [0.026, 0.0278, 0.0258]), 0.02);   // elbow: wider across the hinge axis (y here)
  arm = arm.softAdd(S.sphere(0.0105).at(el[0] + 0.002, el[1] + 0.002, el[2] - 0.0255), 0.012);  // olecranon
  arm = arm.softAdd(E([el[0] + 0.002, el[1] - 0.001, el[2] + 0.013], [0.03, 0.02, 0.012]), 0.022); // the fold's flesh: keeps volume at 120 degrees
  arm = arm.softAdd(TC([el[0] + 0.01, el[1], el[2]], [wr[0] - 0.02, wr[1], wr[2] - 0.001], 0.026, 0.0170), 0.025);
  arm = arm.softAdd(E([0.370, 1.223, 0.004], [0.063, 0.0254, 0.023], [0, -4, 0]), 0.025);        // forearm belly near the elbow
  arm = arm.softAdd(E([wr[0] - 0.008, wr[1], wr[2]], [0.022, 0.0147, 0.0215]), 0.014);           // wrist: flat, 43 x 30 mm
  arm = arm.softAdd(S.sphere(0.0068).at(wr[0] - 0.012, wr[1] + 0.0105, wr[2] - 0.017), 0.008);   // ulna head
  body = body.softAdd(arm.mirror('x'), 0.03);
  return body.softAdd(handShape(S, J).mirror('x'), 0.01);
}

/** the left hand, palm down, fingers on their bones */
export function handShape(S, J) {
  const j = (n) => J('J_Bip_' + n), TC = S.taperedCapsule;
  const E = (c, r, t) => (t ? S.ellipsoid(r).turn(t[0], t[1], t[2]) : S.ellipsoid(r)).at(c[0], c[1], c[2]);
  const wr = j('L_Hand');
  // palm: a slab that is thicker at the heel, cupped below, knuckle row above
  let palm = S.roundBox([0.064, 0.0205, 0.062], 0.0095).at(wr[0] + 0.034, wr[1] + 0.0005, wr[2] - 0.001);
  palm = palm.softAdd(E([wr[0] + 0.02, wr[1] - 0.008, wr[2] + 0.02], [0.021, 0.0105, 0.016], [0, -30, 0]), 0.01);   // thenar pad
  palm = palm.softAdd(E([wr[0] + 0.024, wr[1] - 0.0065, wr[2] - 0.024], [0.024, 0.009, 0.011]), 0.01);              // little-finger pad
  palm = palm.softCut(E([wr[0] + 0.038, wr[1] - 0.0135, wr[2] + 0.0], [0.018, 0.005, 0.016]), 0.01);                // hollow of the palm
  const fingers = [];
  for (const [name, r] of [['Index', [0.0079, 0.0071, 0.0062]], ['Middle', [0.0081, 0.0073, 0.0064]], ['Ring', [0.0077, 0.0069, 0.006]], ['Little', [0.0069, 0.0062, 0.0054]]]) {
    const a = j(`L_${name}1`), b = j(`L_${name}2`), c = j(`L_${name}3`), e = J(`J_Bip_L_${name}3_end`);
    const tip = [e[0] - r[2] * 0.55, e[1], e[2]];
    let f = TC(a, b, r[0], r[1]).add(TC(b, c, r[1], r[2] * 1.04)).add(TC(c, tip, r[2] * 1.04, r[2] * 0.9));
    f = f.add(S.sphere(r[0] * 1.08).at(a[0] - 0.001, a[1] + 0.002, a[2]));               // knuckle
    f = f.add(E([b[0], b[1] + 0.0008, b[2]], [r[1] * 1.0, r[1] * 1.06, r[1] * 1.1]));     // middle joint, a little wider
    fingers.push(f);
    palm = palm.softAdd(TC([wr[0] + 0.014, wr[1] + 0.003, wr[2] + (a[2] - wr[2]) * 0.55], [a[0], a[1] + 0.001, a[2]], 0.0075, r[0] * 0.95), 0.008);   // metacarpal ray on the back of the hand
  }
  const t1 = j('L_Thumb1'), t2 = j('L_Thumb2'), t3 = j('L_Thumb3'), te = J('J_Bip_L_Thumb3_end');
  const tt = [te[0] - 0.003, te[1], te[2] - 0.004];
  const thumb = TC(t1, t2, 0.0128, 0.0094).add(TC(t2, t3, 0.0094, 0.0083)).add(TC(t3, tt, 0.0083, 0.0072)).add(S.sphere(0.0098).at(t2[0], t2[1], t2[2]));
  let hand = palm.softAdd(S.union(...fingers), 0.0045).softAdd(thumb, 0.007);
  return hand;
}

export default {
  name: 'akari_body', id: 'char_akari_base',
  rig: { file: RIG_FILE },
  voxel: 0.0026, lods: [12000], ground: null, bandSlack: 0.012, bandSafety: 1.3,
  bounds: [-0.012, 0.02, -0.16, 0.67, 1.32, 0.15],
  build({ S, rig }) { return bodyShape(S, (n) => rig.bone(n).head); },
};
void path;
