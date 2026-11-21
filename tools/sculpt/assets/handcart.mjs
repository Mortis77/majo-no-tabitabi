// handcart — a two-wheeled village hand-cart (板车). Replaces prop_cart (catalog `cart`, a cart stop with sacks and
// crates; old footprint 1.10 x 2.20 m, old height 1.89 m came from a market awning that this cart does not have).
// INTENT
//  silhouette: two big spoked wheels at the back, a long low plank bed, two shafts running on forward into worn handles
//  joined by a pull bar, a prop leg under the front — a cart parked for a moment, not a box on discs.
//  big forms: the wheels / the bed with its low sides / the long shafts.
//  the eye rests on: the spokes against the light, the pale polished hand-grips, the reddish patch board nailed over a
//  broken side, the gaps between the bed planks.
//  wear: years of rice sacks and mud roads — iron tyres rusted, felloes chipped, the bed top scuffed pale, the underside
//  and the wheel bottoms caked dark, one bed plank newer than the rest, the grips rubbed bare by hands.
//  must NOT look like: a toy cart, every plank equal, a symmetric model, evenly detailed.
import * as P from '../sdf.mjs';
import { C, mix, ss, clamp } from './_smallprops.mjs';

const WR = 0.40, AX_Z = -0.62, AX_Y = WR;          // wheel radius, axle position
const WX = 0.465, WW = 0.07;                         // wheel centre x, wheel width (felloe)
const RAIL_X = 0.37, RAIL_W = 0.08, RAIL_Y0 = 0.49, RAIL_Y1 = 0.565;   // the two shafts
const BED_Z0 = -1.06, BED_Z1 = 0.42, BED_Y = RAIL_Y1, PLANK_T = 0.026, BED_HW = 0.43;
const SIDE_H = 0.2;                                  // low side boards
const FRONT_Z = 1.1;                                 // handle ends
const rnd0 = P.prng(17);
const PLANKS = (() => {                              // bed planks run across, uneven widths, gaps
  const out = []; let z = BED_Z0;
  while (z < BED_Z1 - 0.06) { const w = Math.min(0.13 + 0.09 * rnd0(), BED_Z1 - z); out.push([z, z + w, (rnd0() - 0.5) * 0.008]); z += w + 0.016 + 0.006 * rnd0(); }
  return out;
})();
const NEW_PLANK = 3;                                 // the replaced plank (paler, cleaner)

export default {
  name: 'handcart', id: 'sculpt_cart',
  voxel: 0.0045, lods: [5000, 1600, 450], lodError: [0.006, 0.018, 0.09], farFrom: 2, farVoxel: 2.2,
  ground: 0, aoRange: 0.25, cavity: [0.006, 0.03], creaseAngle: 40, bandSlack: 0.03,
  materials: {
    wood: { name: 'wood', surface: 'wood', look: { rim: 0.3 } },
    dark: { name: 'darkwood', surface: 'wood', look: { rim: 0.3 } },
    patch: { name: 'patch', surface: 'wood', look: { rim: 0.3 } },
    metal: { name: 'iron', surface: 'metal', look: { spec: 0.55, specPower: 40, rim: 0.4 } },
  },
  gameMats: { wood: 'Wood_wood', dark: 'DarkWood_wood', patch: 'Red_wood', metal: 'Stone_Dark_metal' },
  replaces: { file: 'assets/models/refined/prop_cart.glb', scale: 2.37225 },
  anchors: { axle: [0, AX_Y, AX_Z], bed: [0, BED_Y + PLANK_T, -0.32], handle: [0, RAIL_Y1 - 0.01, 1.04] },
  notes: 'Sculpted two-wheeled hand-cart (spoked wheels with iron tyres, gapped plank bed, low sides with a patched board, long shafts with worn grips and a pull bar, a prop leg). No awning: height 0.85 m instead of 1.89. Vertex colours on every LOD, no textures: batched prop. Families wood (Wood_wood, DarkWood_wood, Red_wood) / metal (Stone_Dark_metal).',

  build() {
    const rb = P.prng(31);
    const FAR = process.env.SMALLPROPS_FAR === '1';   // LOD2: wheels as discs, the bed one slab (see farFrom)
    // ---------------------------------------------------------------- wheels (modelled with the axis on Y, then laid on X)
    const wheel = (side, seed) => {
      let felloe = P.cylinder(WR - 0.012, WW).cut(P.cylinder(WR - 0.07, WW + 0.02).at(0, -0.01, 0)).at(0, -WW / 2, 0);
      if (!FAR) for (let i = 0; i < 6; i++) felloe = felloe.cut(P.boxFromTo([-0.003, -0.05, WR - 0.08, 0.003, 0.05, WR + 0.01]).turn(0, i * 60 + 12, 0));   // felloe joints
      felloe = felloe.chip({ at: [0, WW / 2, WR - 0.012], dir: [0, 0.7, 0.7], depth: 0.014, spread: 0.6, seed }).turn(0, 70 * side, 0);
      felloe = felloe.wear(0.005, { vary: 0.6, seed });
      let hub = P.lathe([[0, -0.085], [0.05, -0.085], [0.068, -0.05], [0.074, 0], [0.068, 0.05], [0.05, 0.08], [0, 0.08]], { smooth: 0.004 });
      let spokes = FAR ? P.cylinder(WR - 0.05, 0.03).at(0, -0.015, 0) : P.taperedCapsule([0, 0, 0.05], [0, 0, WR - 0.05], 0.02, 0.0145).around(10, seed * 7);
      const wood = felloe.add(hub.softAdd(spokes, 0.012)).part('wheel', { mat: 'dark', paint: paintWheel });
      // iron tyre, two rows of nail heads; axle cap
      let tyre = P.cylinder(WR, WW - 0.008).cut(P.cylinder(WR - 0.0135, WW + 0.02).at(0, -0.01, 0)).at(0, -(WW - 0.008) / 2, 0);
      if (!FAR) tyre = tyre.add(P.sphere(0.008).scale([1, 0.6, 1]).at(0, 0, WR + 0.001).around(14, 4));
      let cap = P.cylinder(0.034, 0.03).at(0, 0.075, 0).add(P.cylinder(0.026, 0.03).at(0, -0.105, 0)).round(0.003);
      const iron = tyre.add(cap).part('tyre', { mat: 'metal', paint: paintIron });
      // y up -> x out (side: +1 -> the cap points to +x)
      return wood.add(iron).turn(0, 0, -90 * side).at(side * WX, AX_Y, AX_Z);
    };
    const wheels = wheel(1, 3).add(wheel(-1, 5));
    // ---------------------------------------------------------------- frame: shafts (running on into the handles), axle block, cross members
    const shaft = (s) => {
      // the beam: straight from the back to the bed front, then tapering into a round grip, rising a touch
      let beam = P.roundBox([RAIL_W, RAIL_Y1 - RAIL_Y0, BED_Z1 + 0.12 - (BED_Z0 - 0.02)], 0.008).at(0, (RAIL_Y0 + RAIL_Y1) / 2, (BED_Z1 + 0.12 + BED_Z0 - 0.02) / 2);
      const grip = P.tube([[0, (RAIL_Y0 + RAIL_Y1) / 2, BED_Z1 + 0.05], [0, (RAIL_Y0 + RAIL_Y1) / 2 + 0.008, 0.72], [s * 0.012, (RAIL_Y0 + RAIL_Y1) / 2 + 0.02, FRONT_Z - 0.03]], (t) => 0.04 - 0.009 * ss(0, 0.45, t));
      beam = beam.softAdd(grip, 0.03).add(P.sphere(0.034).at(s * 0.012, (RAIL_Y0 + RAIL_Y1) / 2 + 0.02, FRONT_Z - 0.03));
      return beam.at(s * RAIL_X, 0, 0);
    };
    let frame = shaft(1).add(shaft(-1));
    frame = frame.add(P.roundBox([0.92, 0.075, 0.1], 0.01).at(0, AX_Y + 0.055, AX_Z));                 // axle block under the shafts
    frame = frame.add(P.cylinder(0.035, 0.98).turn(0, 0, 90).at(0.49, AX_Y, AX_Z));                 // axle
    for (const z of [BED_Z0 + 0.04, -0.15, BED_Z1 - 0.04]) frame = frame.add(P.roundBox([2 * RAIL_X + 0.06, 0.05, 0.06], 0.008).at(0, RAIL_Y0 - 0.015, z));   // cross members
    frame = frame.add(P.tube([[-RAIL_X, (RAIL_Y0 + RAIL_Y1) / 2 + 0.018, 1.0], [0, (RAIL_Y0 + RAIL_Y1) / 2 + 0.024, 1.0], [RAIL_X, (RAIL_Y0 + RAIL_Y1) / 2 + 0.018, 1.0]], 0.022)); // pull bar
    // prop leg: a forked stick under the front cross member, a little splayed
    for (const s of [-1, 1]) frame = frame.add(P.taperedCapsule([s * 0.3, RAIL_Y0 - 0.04, 0.62], [s * 0.34, 0.03, 0.66], 0.034, 0.03).add(P.ellipsoid([0.045, 0.03, 0.05]).at(s * 0.342, 0.022, 0.662)));
    frame = frame.add(P.roundBox([0.7, 0.045, 0.05], 0.008).at(0, RAIL_Y0 - 0.02, 0.62));
    frame = frame.wear(0.006, { vary: 0.6, seed: 9 });
    const wood = frame.part('frame', { mat: 'wood', paint: paintFrame });
    // ---------------------------------------------------------------- bed: planks across with gaps, uneven, one missing a corner
    let bed = null;
    if (FAR) bed = P.boxFromTo([-BED_HW, BED_Y, BED_Z0, BED_HW, BED_Y + PLANK_T, BED_Z1]);
    else PLANKS.forEach(([z0, z1, dy], i) => {
      const hw = BED_HW - (i === 5 ? 0.06 : 0) + (rb() - 0.5) * 0.02;
      let p = P.roundBox([2 * hw, PLANK_T, z1 - z0], 0.004).at((rb() - 0.5) * 0.02, BED_Y + PLANK_T / 2 + dy, (z0 + z1) / 2).turn(0, (rb() - 0.5) * 1.6, 0);
      p = p.add(P.sphere(0.008).scale([1, 0.5, 1]).at(RAIL_X - 0.01, BED_Y + PLANK_T + dy, (z0 + z1) / 2).add(P.sphere(0.008).scale([1, 0.5, 1]).at(-RAIL_X + 0.01, BED_Y + PLANK_T + dy, (z0 + z1) / 2)));
      bed = bed ? bed.add(p) : p;
    });
    bed = bed.chip({ at: [BED_HW - 0.01, BED_Y + PLANK_T, BED_Z1 - 0.02], dir: [0.6, 0.5, 0.6], depth: 0.03, spread: 0.6, seed: 2 });
    // low sides: two boards on short stakes each side, the back board; the +x lower board broken and patched
    let sides = null;
    for (const s of [-1, 1]) {
      for (const z of [-0.98, -0.45, 0.05, 0.36]) sides = add(sides, P.roundBox([0.04, SIDE_H + 0.06, 0.045], 0.006).at(s * (BED_HW - 0.012), BED_Y + PLANK_T + (SIDE_H + 0.06) / 2 - 0.03, z));
      for (const [y0, h] of [[0.0, 0.075], [0.087, 0.07], [0.168, 0.034]]) {
        let b = P.roundBox([0.024, h, BED_Z1 - BED_Z0 - 0.02], 0.005).at(s * (BED_HW + 0.02), BED_Y + PLANK_T + y0 + h / 2, (BED_Z0 + BED_Z1) / 2);
        if (s > 0 && y0 === 0) b = b.cut(P.boxFromTo([0, -0.02, -0.04, 0.06, 0.08, 0.12]).turn(0, 0, 0).at(BED_HW, BED_Y + PLANK_T, -0.3).warp((x, y, z, o) => { o[0] = 0; o[1] = 0.02 * Math.sin(z * 50); o[2] = 0; }, { grow: 0.02 }));
        sides = add(sides, b);
      }
    }
    sides = add(sides, P.roundBox([2 * BED_HW + 0.06, SIDE_H - 0.01, 0.024], 0.005).at(0, BED_Y + PLANK_T + (SIDE_H - 0.01) / 2, BED_Z0 - 0.005));
    bed = bed.add(sides).wear(0.005, { vary: 0.7, seed: 4 });
    const bedPart = bed.part('bed', { mat: 'wood', paint: paintBed });
    // the patch: a reddish board off an old shrine fence, nailed over the break (a separate family: Red_wood)
    const px = BED_HW + 0.032 + 0.008;
    let patch = P.roundBox([0.016, 0.1, 0.3], 0.004).turn(0, 0, -3).at(px, BED_Y + PLANK_T + 0.05, -0.27);
    patch = patch.chip({ at: [px, BED_Y + PLANK_T + 0.1, -0.12], dir: [0.5, 0.7, 0.5], depth: 0.012, spread: 0.6, seed: 6 });
    const patchPart = patch.part('patch', { mat: 'patch', paint: paintPatch });
    // iron: nail heads on the patch, corner straps at the back
    let nails = null;
    if (!FAR) for (const [y, z] of [[0.025, -0.4], [0.078, -0.395], [0.022, -0.14], [0.076, -0.15]]) nails = add(nails, P.sphere(0.009).scale([0.5, 1, 1]).at(px + 0.008, BED_Y + PLANK_T + y, z));
    for (const s of [-1, 1]) nails = add(nails, P.roundBox([0.012, 0.11, 0.06], 0.003).at(s * (BED_HW + 0.034), BED_Y + PLANK_T + 0.06, BED_Z0 + 0.03));
    const ironPart = nails.part('nails', { mat: 'metal', paint: paintIron });
    // a coil of straw rope left on the bed, back left: the thing the eye finds on the flat bed
    let coil = FAR ? P.cylinder(0.15, 0.05) : P.torus(0.13, 0.022).at(0, 0.022, 0).add(P.torus(0.118, 0.021).at(0.012, 0.062, -0.006)).add(P.torus(0.105, 0.02).turn(4, 0, -6).at(0.004, 0.098, 0.004))
      .add(P.tube([[0.09, 0.1, 0.05], [0.17, 0.06, 0.13], [0.23, 0.02, 0.15]], 0.019));
    if (!FAR) coil = coil.rough({ type: 'ridged', scale: 0.015, amp: 0.002, seed: 12 });
    const coilPart = coil.turn(0, 25, 0).at(-0.18, BED_Y + PLANK_T, -0.78).part('coil', { mat: 'wood', paint: paintRope });
    return wheels.add(wood).add(bedPart).add(patchPart).add(ironPart).add(coilPart);
  },
};
function add(a, b) { return a ? a.add(b) : b; }

// ------------------------------------------------------------------------------------------------------------- paint
function grain(x, y, z, axis, seed) {
  const u = axis === 'x' ? x : axis === 'z' ? z : y;
  const v = axis === 'x' ? y * 3 + z : axis === 'z' ? x + y * 3 : x + z;
  return 0.5 + 0.5 * Math.sin(v * 160 + 6 * P.fbm(u * 3, v * 8, seed, seed, 2));
}
function paintFrame(c) {
  const { x, y, z, cavity, edge, ny } = c;
  let col = mix(C('#8e7458'), C('#6e563e'), 0.5 + 0.5 * P.fbm(x * 2, y * 4, z * 2, 2, 2));
  col = mix(col, C('#54402e'), 0.3 * grain(x, y, z, 'z', 3));
  col = mix(col, C('#a89a86'), (ny > 0.5 ? 0.3 : 0.1));                       // silvered by rain on top
  col = mix(col, C('#d8bc90'), ss(0.82, 0.95, z) * (y > 0.45 ? 0.8 : 0));    // grips rubbed bare by hands
  col = mix(col, C('#4a3624'), ss(0.25, 0.02, y) * 0.7);                     // the prop leg's foot in the mud
  col = mix(col, C('#d0b490'), edge * 0.45);
  return mix(col, C('#2a1e14'), cavity * 0.55);
}
function paintBed(c) {
  const { x, y, z, cavity, edge, ny } = c;
  let pi = -1; PLANKS.forEach(([z0, z1], i) => { if (z >= z0 - 0.01 && z <= z1 + 0.01) pi = i; });
  const k = pi >= 0 ? (pi * 0.618) % 1 : 0.5;
  let col = mix(C('#a88660'), C('#6e543c'), k);
  col = mix(col, C('#5a4430'), 0.3 * grain(x, y, z, 'x', pi + 4));
  if (ny > 0.6 && y < BED_Y + PLANK_T + 0.01) col = mix(col, C('#c4ad8a'), 0.35 + 0.25 * ss(0.3, 0.0, Math.abs(x)));   // scuffed by sacks
  if (pi === NEW_PLANK && y < BED_Y + PLANK_T + 0.012) col = mix(col, C('#d8b47e'), 0.6);   // the new plank
  if (ny < -0.5) col = mix(col, C('#3e2e20'), 0.5);                          // underside dark
  col = mix(col, C('#d6bc94'), edge * 0.45);
  return mix(col, C('#2a1e14'), cavity * 0.6);
}
function paintPatch(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(C('#b0503a'), C('#8e3a2c'), 0.5 + 0.5 * P.fbm(x * 20, y * 20, z * 20, 5, 2));   // faded vermilion
  col = mix(col, C('#9a7c5c'), ss(0.35, 0.7, P.fbm(x * 9, y * 30, z * 9, 8, 2) + 0.5) * 0.6);  // paint flaked to the wood
  col = mix(col, C('#d8b494'), edge * 0.5);
  return mix(col, C('#2a1810'), cavity * 0.5);
}
function paintWheel(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(C('#86684c'), C('#6a4e38'), 0.5 + 0.5 * P.fbm(x * 6, y * 6, z * 6, 3, 2));
  col = mix(col, C('#3c2c1e'), ss(0.25, 0.03, y) * 0.75);                    // mud on the bottom of the wheel
  col = mix(col, C('#c0a07a'), edge * 0.5);
  return mix(col, C('#20160e'), cavity * 0.6);
}
function paintIron(c) {
  const { x, y, z, edge, cavity, ny } = c;
  let col = mix(C('#3c3e46'), C('#2c2e34'), 0.5 + 0.5 * P.fbm(x * 20, y * 20, z * 20, 3, 2));
  const rust = clamp(ss(0.4, 0.75, P.fbm(x * 9, y * 9, z * 9, 7, 3) + 0.5) + (ny < -0.3 ? 0.35 : 0) + cavity * 0.6, 0, 1);
  col = mix(col, C('#8a4a26'), rust * 0.7);
  col = mix(col, C('#4a3828'), ss(0.12, 0.0, y) * 0.6);                      // road dirt on the tread
  return mix(col, C('#9a9ea8'), edge * 0.6);
}
function paintRope(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(C('#c8b27a'), C('#a48e5a'), 0.5 + 0.5 * P.fbm(x * 60, y * 60, z * 60, 11, 2));
  col = mix(col, C('#e0d0a0'), edge * 0.4);
  return mix(col, C('#4a3e28'), cavity * 0.6);
}
