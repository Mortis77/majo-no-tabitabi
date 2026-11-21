// log_fallen — a great trunk the storm laid down across the forest floor (replaces nat_fallen_trunk_1 / species fallen1:
//   8.37 x 1.74 x 1.21, lying along X, solid: a collider). Long enough to walk along.
// SILHOUETTE: a long tapering trunk lying almost flat, a torn-up ROOT PLATE standing on edge at the -X end like a wall of
//   earth and broken roots, the +X end snapped off in long splinters; one branch stub stands up from its back.
// BIG FORMS: (1) the root plate (a tall disc of soil, roots and caught stones), (2) the trunk with the moss road along its
//   top, (3) the split running in from the broken end.
// THE EYE RESTS ON: the stones and broken root stubs in the plate, the shelf fungi stepping up the shaded (-Z) flank, the
//   pale splinters of the break, the dark gape of the split.
// WEAR STORY: uprooted (not cut): it fell to +X, tearing its roots and the ground up with it; years since: the soil in the
//   plate has dried and crumbles, moss grew a road along the top where rain lies, the bark has gone near the broken end,
//   brackets climb the damp north side.
// MUST NOT LOOK LIKE: a pack trunk (a smooth tapered cylinder with flat ends), a log with a disc glued on, even moss.
import { logBody, furrows, mossBlanket, splinters, bunion, limb, floorAt, brk, shelf, lit, ss, mix, C, WOODPAINT as W, MOSSV } from './bamboologs_lib.mjs';
import * as P from '../sdf.mjs';

const FARF = () => process.env.BL_FAR === '1';
const XA = -3.78, XB = 3.88;
// trunk centre line (x -> [z, y]) and radius
const cz = (x) => 0.02 + 0.05 * Math.sin((x - XA) / (XB - XA) * Math.PI) - 0.06 * ((x - XA) / (XB - XA));
const cy = (x) => 0.4 - 0.11 * ((x - XA) / (XB - XA));
const rad = (x) => 0.43 - 0.13 * ((x - XA) / (XB - XA));
const PLATE = { x: -3.96, y: 0.86, ry: 0.86, rz: 0.585, th: 0.19 };

function bark(c) {
  // the bark is gone toward the broken end: silver-tan bare wood there
  return mix(W.bark(c), W.bare(c), ss(2.2, 3.2, c.x + 0.3 * P.fbm(c.y * 3, c.z * 3, c.x, 3, 2)));
}
const splitP = (c) => mix(W.hollow(c), W.fresh(c), c.edge * 0.6);
const rootwood = (c) => mix(W.bark(c), W.soil(c), 0.35);
export default {
  name: 'log_fallen', id: 'sculpt_nat_fallen_trunk_a', species: ['fallen1'], view: 'prop',
  voxel: 0.016,
  lods: [2400, 800, 250],
  farFrom: 2, farVoxel: 2.3, lodError: [0.025, 0.06, 0.14],
  ground: 0, aoRange: 0.5, aoStrength: 0.55, cavity: [0.02, 0.08], cavityDark: 0.38, creaseAngle: 50,
  materials: { wood: { name: 'trunk', surface: 'bark' }, crown: { name: 'moss', surface: 'none' } },
  tintMats: ['crown'], tintK: { crown: 0.9 },
  previewTint: [0.159, 0.347, 0.069],
  landTints: { 'DUSK MOSS 9a8f3a': { crown: [0.323, 0.275, 0.042] }, 'NIGHT MOSS 2a6a66': { crown: [0.023, 0.145, 0.133] } },
  replaces: { file: 'assets/models/refined/nat_fallen_trunk_1.glb' },
  notes: 'Sculpted uprooted fallen trunk (fallen1). trunk (mul, real colour: bark, root plate soil and stones, shelf fungi), moss (tint: the moss road on top). COLOR_0.a = snow mask. See .tmp/sculpt/bamboo_a/INSTALL.md.',
  heroAz: 35, gameAz: 30,
  build({ S }) {
    const far = FARF();
    S.part('fbark', { mat: 'wood', paint: lit(bark) }); S.part('split', { mat: 'wood', paint: lit(splitP) }); S.part('fresh', { mat: 'wood', paint: lit(W.fresh) });
    S.part('soil', { mat: 'wood', paint: lit(W.soil) }); S.part('stone', { mat: 'wood', paint: lit(W.stone) }); S.part('roots', { mat: 'wood', paint: lit(rootwood) });
    S.part('fungus', { mat: 'wood', paint: lit(W.fungus) }); S.part('fmoss', { mat: 'crown', paint: MOSSV });
    // the trunk: three spans (a slight bend), lumpy, furrowed
    const xs = [XA, -1.2, 1.4, XB], segs = [];
    for (let i = 0; i < 3; i++) {
      const a = xs[i], b = xs[i + 1];
      segs.push(logBody([a, cy(a), cz(a)], [b, cy(b), cz(b)], (t) => rad(a + (b - a) * t) * (1 + 0.04 * Math.sin((a + (b - a) * t) * 3.1)), { aspect: 0.92, lumps: far ? 0 : 0.03, seed: 4 + i }));
    }
    let trunk = P.softUnion(0.15, ...segs);
    // two branch stubs: one standing up from the back, one short to +Z
    trunk = trunk.softAdd(limb([[0.9, cy(0.9) + 0.25, cz(0.9)], [0.98, cy(0.9) + 0.55, cz(0.9) - 0.05], [1.08, cy(0.9) + 0.78, cz(0.9) - 0.04]], 0.1, 0.075, 1), 0.08);
    trunk = trunk.softAdd(limb([[-2.0, cy(-2) + 0.1, cz(-2) + 0.25], [-1.92, cy(-2) + 0.2, 0.42], [-1.85, cy(-2) + 0.28, 0.52]], 0.09, 0.07, 1), 0.07);
    if (!far) trunk = furrows(trunk, { axis: 'x', centre: (x) => [cz(x), cy(x)], n: 12, depth: 0.03, width: 0.14, wob: 1.3, seed: 7, plate: 0.8, where: (x) => ss(XB - 0.1, XB - 0.5, x) * ss(XA + 0.1, XA + 0.4, x) });
    trunk = trunk.part('fbark', { mat: 'wood', paint: lit(bark) });
    // the broken top end (+X): ragged, chunks out, long splinters
    trunk = trunk.cut(P.plane(P.norm([-1, -0.25, 0.1]), [XB - 0.05, cy(XB), cz(XB)]).intersect(P.box([0.8, 1.2, 1.2]).at(XB + 0.3, cy(XB), cz(XB))).part('fresh', { mat: 'wood', paint: lit(W.fresh) }), { paintCut: true });
    trunk = trunk.cut(P.sphere(0.55).at(XB + 0.42, cy(XB) + 0.08, cz(XB) + 0.0).part('fresh', { mat: 'wood', paint: lit(W.fresh) }), { paintCut: true });
    // stub tops broken
    trunk = trunk.cut(P.sphere(0.2).at(1.16, cy(0.9) + 0.98, cz(0.9) - 0.04).part('fresh', { mat: 'wood', paint: lit(W.fresh) }), { paintCut: true });
    if (!far) {
      for (const [p, d, dep, sd] of [[[XB - 0.1, cy(XB) + 0.22, cz(XB) + 0.15], [0.6, 0.6, 0.4], 0.09, 1], [[XB - 0.2, cy(XB) - 0.15, cz(XB) - 0.2], [0.5, -0.3, -0.7], 0.08, 2]]) trunk = trunk.cut(brk(p, d, dep, { seed: sd }).part('fresh', { mat: 'wood', paint: lit(W.fresh) }), { paintCut: true });
      trunk = trunk.add(bunion(splinters([XB - 0.12, cy(XB) + 0.02, cz(XB)], [1, 0.12, 0], 0.17, { n: 5, len: 0.42, seed: 3, rmin: 0.022, spread: 0.45 }), 0.02).part('fresh', { mat: 'wood', paint: lit(W.fresh) }));
      // the split: a slot opening along the top from the broken end, widening toward it
      const sl = P.tube([[1.5, cy(1.5) + rad(1.5) * 0.95, cz(1.5) + 0.06], [2.7, cy(2.7) + rad(2.7) * 0.9, cz(2.7) + 0.1], [XB + 0.1, cy(XB) + rad(XB) * 0.55, cz(XB) + 0.12]], (t) => 0.03 + 0.2 * t * t, { aspect: 0.2 + 0.0, up: [0, 1, 0] });
      trunk = trunk.cut(sl.part('split', { mat: 'wood', paint: lit(splitP) }), { paintCut: true });
    }
    // the ROOT PLATE: a tall disc standing across the -X end, its back (-X) a crust of soil, stones caught in it
    let plate = P.ellipsoid([PLATE.th, PLATE.ry, PLATE.rz]).at(PLATE.x, PLATE.y, 0.0);
    if (!far) plate = plate.rough({ type: 'cellular', scale: 0.16, amp: 0.035, seed: 5 });
    plate = plate.softAdd(P.ellipsoid([0.3, 0.55, 0.45]).at(PLATE.x + 0.12, 0.5, 0.0), 0.12);       // the root crown into the trunk
    const roots = [];
    // broken roots: radiating in the plate's plane, sticking out of its face and rim
    const RR = [[18, 0.97, 0.1], [62, 0.96, 0.09], [112, 0.95, 0.095], [158, 0.97, 0.1], [205, 0.75, 0.09], [332, 0.78, 0.085], [290, 0.6, 0.09], [248, 0.65, 0.08]];
    for (const [a, L, r] of RR) {
      const t = a * Math.PI / 180, dy = Math.cos(t) * PLATE.ry * L, dz = Math.sin(t) * PLATE.rz * L;
      const y1 = Math.min(1.7, PLATE.y + dy), z1 = Math.max(-0.58, Math.min(0.58, dz));
      roots.push(limb([[PLATE.x + 0.05, PLATE.y + dy * 0.15, dz * 0.15], [PLATE.x - 0.1, PLATE.y + dy * 0.6, z1 * 0.75], [PLATE.x - 0.17, y1, z1]], r * 1.5, r * 0.8, 0.8));
    }
    if (!far) for (const [p, d, sd] of [[[PLATE.x - 0.2, 1.2, 0.2], [-1, 0.3, 0.2], 1], [[PLATE.x - 0.2, 0.45, -0.25], [-1, -0.2, -0.3], 2], [[PLATE.x - 0.18, 0.9, -0.35], [-1, 0, -0.4], 3]]) roots.push(...splinters(p, d, 0.06, { n: 2, len: 0.1, seed: sd, rmin: 0.03 }));
    const rootS = bunion(roots, 0.03).part('roots', { mat: 'wood', paint: lit(rootwood) });
    plate = plate.part('soil', { mat: 'wood', paint: lit(W.soil) });
    let all = trunk.softAdd(plate, 0.2).add(rootS);
    // soil clods on the back face and at the foot of the plate (where it tore out of the ground)
    if (!far) {
      const rnd = P.prng(21), cl = [];
      for (let i = 0; i < 9; i++) { const a = rnd() * 6.283, rr = 0.25 + 0.5 * rnd(); cl.push(P.ellipsoid([0.08 + 0.05 * rnd(), 0.07 + 0.06 * rnd(), 0.08 + 0.05 * rnd()]).at(PLATE.x - 0.13 - 0.03 * rnd(), PLATE.y + Math.cos(a) * rr * PLATE.ry * 0.8, Math.sin(a) * rr * PLATE.rz * 0.8)); }
      cl.push(P.ellipsoid([0.35, 0.16, 0.5]).at(PLATE.x + 0.05, 0.02, 0.0));                     // the torn ground at its foot
      all = all.softAdd(bunion(cl).part('soil', { mat: 'wood', paint: lit(W.soil) }), 0.05);
    }
    // stones caught in the plate
    const st = [];
    for (const [p, r, sd] of [[[PLATE.x - 0.12, 1.25, -0.24], 0.16, 1], [[PLATE.x - 0.13, 0.62, 0.3], 0.19, 2], [[PLATE.x - 0.1, 0.32, -0.33], 0.13, 3], [[PLATE.x - 0.04, 1.58, 0.14], 0.11, 4]]) {
      let s = P.ellipsoid([r * 0.85, r, r * 1.1]).at(...p);
      if (!far) s = s.chisel({ count: 5, depth: r * 0.18, seed: sd, radius: r * 0.9 });
      st.push(s);
    }
    all = all.add(bunion(st).part('stone', { mat: 'wood', paint: lit(W.stone) }));
    // shelf fungi stepping up the shaded -Z flank
    const sh = [];
    for (const [x, yo, R, sd] of [[-1.55, 0.05, 0.17, 1], [-1.3, 0.2, 0.13, 2], [-1.7, 0.27, 0.11, 3], [0.35, 0.08, 0.15, 4], [0.55, 0.22, 0.1, 5]]) {
      if (far && R < 0.14) continue;
      const y = cy(x) + yo, zs = cz(x) - Math.sqrt(Math.max(0.01, rad(x) * rad(x) - yo * yo)) * 0.98;
      sh.push(shelf([x, y, zs], 180, R, { th: R * 0.32, seed: sd }));
    }
    all = all.add(bunion(sh).part('fungus', { mat: 'wood', paint: lit(W.fungus) }));
    // the moss road along the top
    const moss = mossBlanket(trunk, far ? 0.05 : 0.045, (x, y, z) => {
      // three long cushions along the top with bare gaps between (a road of moss, not a green coat), off the stubs
      const top = cy(x) + rad(x) * (0.52 + 0.12 * P.fbm(x * 1.4, z * 2, 0, 6, 2)) - 0.04 * Math.sin(x * 2.3);
      const A = ss(XA + 0.25, XA + 0.6, x) * ss(2.6, 2.0, x) * ss(0.25, 0.45, Math.abs(Math.sin((x + 0.6) * 0.95))) * ss(cy(x) + rad(x) + 0.12, cy(x) + rad(x) + 0.04, y);
      return (y - top) * 4 * A - (1 - A) * 0.3;
    }, { seed: 8, scale: 0.14, bump: 0.35, taper: 0.4, edge: 0.3 });
    all = all.add(moss.part('fmoss', { mat: 'crown', paint: MOSSV }));
    return floorAt(all, 0);
  },
};
