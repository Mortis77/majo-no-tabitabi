// birch_a — the white birch of the sunlit lands' edges (replaces tree_birch_1 / birch: 9 m tall, crown ~4.3 x 6.2 m,
//   collider trunkR 0.25).
// SILHOUETTE: a slim pale trunk with a gentle lean that FORKS high into two leaders; a light, open crown of many small
//   leaf clumps strung along thin dark branches, with sky through it everywhere — the opposite of the heavy oak.
// BIG FORMS: (1) the pale trunk and its fork (two leaders, one taller), (2) six thin side branches drooping at the tips,
//   (3) the scatter of small clumps along them, bigger near the trunk, smaller toward the tips.
// THE EYE RESTS ON: the dark lenticel bands across the white bark, the black fissured foot, the V of the fork.
// WEAR STORY: young and quick; the foot is already black and cracked where the white bark split; a few curls of bark peel
//   on the trunk; the twigs are dark against the white.
// MUST NOT LOOK LIKE: a lollipop, a single green oval, a striped barber pole (bands irregular and broken), a pack birch.
import { bunion, limb, plates, cloud, zig, floor0, crownValue, groundRoot, along, barkPlate, lit, farField, FAR, C, mix, ss } from './trees_c_lib.mjs';

const far = FAR();
const FK = [0.15, 5.0, 0.22];
const TRUNK = [[0, -0.2, 0], [0.1, 1.5, 0.02], [0.06, 3.2, 0.17], FK];
const LA = [FK, [0.42, 6.4, 0.48], [0.58, 7.6, 0.6], [0.6, 8.35, 0.55]];
const LB = [FK, [-0.22, 6.2, 0.02], [-0.48, 7.2, -0.15], [-0.55, 7.9, -0.2]];
const CEN = [0.05, 6.4, 0.15];
// side branches: [from point, to point, r0]
const BR = [
  [along(TRUNK, 0.72).p, [1.45, 4.5, -0.35], 0.07],
  [along(TRUNK, 0.84).p, [-0.45, 4.95, -1.55], 0.065],
  [along(TRUNK, 0.93).p, [0.15, 5.3, 1.75], 0.07],
  [along(LA, 0.4).p, [1.55, 6.8, 1.15], 0.06],
  [along(LB, 0.42).p, [-1.65, 6.65, -0.5], 0.06],
  [along(LB, 0.75).p, [-0.55, 7.55, -1.4], 0.05],
  [along(LA, 0.7).p, [1.3, 7.95, -0.15], 0.05],
];
// clumps: [centre, radius, seed, branch] — (rev) SMALLER and MORE: three along the outer part of every branch (growing
// toward the drooping tip) plus a scatter of small inner ones round the leaders; an open oval with sky through it
const CL = [];
{
  const rnd = (() => { let t = 7; return () => ((t = (t * 16807) % 2147483647) / 2147483647); })();
  BR.forEach(([a, b], i) => {
    for (const [u, r] of [[0.48, 0.38], [0.74, 0.45], [1.0, 0.52]]) {
      const j = () => (rnd() - 0.5) * 0.4;
      CL.push([[a[0] + (b[0] - a[0]) * u + j(), a[1] + (b[1] - a[1]) * u - 0.14 * u + j() * 0.6, a[2] + (b[2] - a[2]) * u + j()], r * (0.85 + 0.3 * rnd()), 40 + i * 3 + Math.round(u * 2), i]);
    }
  });
  for (const [c, r] of [[[0.62, 8.55, 0.58], 0.5], [[0.2, 8.15, 0.1], 0.4], [[-0.55, 8.1, -0.2], 0.48], [[0.1, 7.3, 0.9], 0.45], [[-0.8, 6.1, 0.7], 0.44],
    [[0.8, 6.5, -0.7], 0.44], [[-0.3, 6.9, -0.9], 0.42], [[0.95, 7.6, 0.45], 0.4], [[-0.95, 7.3, 0.2], 0.4], [[0.25, 5.9, -0.2], 0.38]]) CL.push([c, r, 70 + CL.length, -1]);
}
// LOD2 (built): one blob per branch round its three clumps, four inner blobs
function farSpec() {
  const blobs = [];
  BR.forEach((_, i) => {
    const m = CL.filter((q) => q[3] === i), c = [0, 0, 0]; for (const q of m) for (let k = 0; k < 3; k++) c[k] += q[0][k] / m.length;
    const ext = Math.max(...m.map((q) => Math.hypot(q[0][0] - c[0], q[0][2] - c[2]) + q[1] * 0.8));
    blobs.push([c, [ext, 0.55, ext], 200 + i]);
  });
  for (const [c, r, sd] of [[[0.45, 8.3, 0.4], [0.7, 0.55, 0.65], 1], [[-0.5, 7.7, -0.3], [0.65, 0.6, 0.65], 2], [[-0.4, 6.3, 0.4], [0.7, 0.55, 0.7], 3], [[0.5, 6.6, -0.5], [0.7, 0.55, 0.6], 4]]) blobs.push([c, r, 210 + sd]);
  const tubes = [[[[0, 0, 0], along(TRUNK, 0.2).p, along(TRUNK, 0.33).p, along(TRUNK, 0.42).p, TRUNK[2], FK], 0.33, 0.16, 6],   // rings at 1.1 / 1.8 / 2.3 m keep the black foot's edge [[LA[0], LA[2], LA[3]], 0.15, 0.06, 4], [[LB[0], LB[2], LB[3]], 0.13, 0.06, 4]];
  for (const [a, b, r0] of BR) if (r0 >= 0.06) tubes.push([[a, b], r0, 0.035, 3]);
  return { blobs, tubes, crown: 'leaves', wood: 'birchbark' };
}
// lenticels: [stem, y, centre angle deg, span deg, width] — (rev) ~20 dark horizontal marks of very different lengths,
// some paired at one height, on the trunk and up both leaders; plus a dark chevron over every branch joint
const STEMS = { T: [TRUNK, (u) => 0.17 + 0.11 * Math.pow(1 - u, 0.85)], A: [LA, (u) => 0.05 + 0.11 * Math.pow(1 - u, 0.8)], B: [LB, (u) => 0.05 + 0.09 * Math.pow(1 - u, 0.8)] };
const LENT = [];
{
  let t = 11; const rnd = () => ((t = (t * 16807) % 2147483647) / 2147483647);
  for (let y = 1.95; y < 4.85; y += 0.16 + rnd() * 0.22) {
    LENT.push(['T', y, rnd() * 360, 25 + rnd() * 130, 0.035 + rnd() * 0.03]);
    if (rnd() < 0.3) LENT.push(['T', y + 0.04, rnd() * 360, 20 + rnd() * 40, 0.03]);
  }
  for (const [s, y] of [['A', 5.6], ['A', 6.15], ['A', 6.9], ['B', 5.5], ['B', 6.0], ['B', 6.7]]) LENT.push([s, y, rnd() * 360, 60 + rnd() * 120, 0.03 + rnd() * 0.015]);
}
/** a stem's axis point and radius at height y (stems are mostly upright: interpolate by y) */
function stemAt(key, y) {
  const [poly, rf] = STEMS[key], y0 = poly[0][1], y1 = poly.at(-1)[1];
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i];
    if (y <= b[1] || i === poly.length - 1) { const k = Math.min(1, Math.max(0, (y - a[1]) / (b[1] - a[1]))); return { c: [a[0] + (b[0] - a[0]) * k, a[2] + (b[2] - a[2]) * k], r: rf(Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))) }; }
  }
}
const stemOf = (p) => (p === BR[3][0] || p === BR[6][0] ? 'A' : p === BR[4][0] || p === BR[5][0] ? 'B' : 'T');
// chevrons: [stem, y, yaw deg] above each branch joint
const CHEV = BR.map(([a, b]) => [stemOf(a), a[1], Math.atan2(b[0] - a[0], b[2] - a[2]) * 180 / Math.PI]);

function bark(c) {
  const { x, y, z, ny, cavity, edge, S } = c;
  // chalk-white bark; the dark marks are their own part (lenticel); (rev) the lower 20 % (to ~1.8 m, ragged top edge)
  // is rough black-grey cracked bark with pale plate edges, mossy at the ground
  let col = C('#e2ddd1');
  col = mix(col, C('#8a8278'), ss(0.0, 0.3, S.fbm(x * 1.5, y * 0.8, z * 1.5, 13, 2)) * 0.25);   // grey weathering
  const foot = ss(1.95, 1.35, y + 0.45 * S.fbm(x * 2.5, y * 1.5, z * 2.5, 14, 2));
  col = mix(col, mix(C('#3c3733'), C('#7e776e'), edge * 0.8), foot);
  col = mix(col, C('#1e1a18'), Math.min(1, cavity * 1.4) * (0.4 + 0.6 * foot));
  const moss = ss(0.6, 0.05, y) * ss(-0.1, 0.5, ny) * ss(-0.2, 0.2, S.fbm(x * 3, y * 3, z * 3, 15, 2));
  return mix(col, C('#5d6b36'), moss * 0.7);
}
function lenticel(c) {
  const { cavity } = c;
  return mix(C('#3a332f'), C('#1e1a18'), Math.min(1, cavity));
}
function twig(c) {
  const { y, edge, cavity } = c;
  // thin branches: dark purple-brown twigs, paler grey where thicker / lower
  let col = mix(C('#8c8378'), C('#5c4d48'), ss(4.5, 7.5, y));
  col = mix(col, C('#a89e92'), edge * 0.4);
  return mix(col, C('#2a2320'), Math.min(1, cavity * 1.2));
}

export default {
  name: 'birch_a', id: 'sculpt_tree_birch_a', species: ['birch'],
  voxel: 0.02,
  lods: [5000, 1800, 500],
  farFrom: 2, farVoxel: 2.4, farSpec,
  ground: 0, aoRange: 0.9, aoStrength: 0.5, cavity: [0.04, 0.16], cavityDark: 0.35, creaseAngle: 55,
  materials: { wood: { name: 'trunk', surface: 'bark', look: { rim: 0.2 } }, crown: { name: 'leaves', surface: 'leaf', look: { rim: 0.4, wrap: 0.5 } } },
  previewTint: [0.456, 0.723, 0.162],                                      // sunBirch 0xb4dd70 (linear)
  landTints: { 'SUN 9fd46a': [0.347, 0.658, 0.144], 'DUSK d88a3a': [0.687, 0.254, 0.042] },
  replaces: { file: 'assets/models/nature/trees/tree_birch_1.glb', tint: [0.456, 0.723, 0.162] },
  notes: 'Sculpted birch (birch). Materials trunk (mul: COLOR_0 = bark colour, white) and leaves (tint). COLOR_0.a = top snow mask. See .tmp/sculpt/broadleaf_a/INSTALL.md.',
  build({ S }) {
    S.part('birchbark', { mat: 'wood', paint: lit(bark, 0.5, (c) => ss(0.1, 1.4, c.y)) });
    S.part('twig', { mat: 'wood', paint: lit(twig, 0.5, 0.9) });
    S.part('lenticel', { mat: 'wood', paint: lit(lenticel, 0.5, 1) });
    const crownPaint = (c) => { const v = crownValue(c, { cen: CEN, R: 2.2, ry: 2.3, lo: 0.5, hi: 1.0, seed: 8 }) + 0.12 * c.edge + 0.06 * ss(0.2, 0.9, c.ny); return [v, v, v]; };
    S.part('leaves', { mat: 'crown', paint: crownPaint });
    if (far) return floor0(farField(S, farSpec()));
    let bandCut = null;
    let trunk = limb(TRUNK, 0.28, 0.17, 0.85).softAdd(S.ellipsoid([0.36, 0.3, 0.34]).at(0, 0, 0), 0.16);
    const tp = [trunk, limb(LA, 0.16, 0.05, 0.8), limb(LB, 0.14, 0.05, 0.8)];
    if (!far) for (const [a, L, r, sd] of [[60, 0.7, 0.1, 1], [180, 0.6, 0.09, 2], [300, 0.75, 0.1, 3]]) tp.push(groundRoot(a, L, r, { seed: sd, rt: 0.15, y0: 0.3 }));
    let wood = bunion(tp, 0.06);
    if (!far) {
      // the black foot splits into rough plates; above it the bark is smooth
      wood = plates(wood, { w: 0.17, h: 0.2, depth: 0.035, groove: 0.3, seed: 9, where: (x, y) => ss(2.0, 1.3, y) });
      // two curls of peeling bark on the trunk
      wood = wood.add(barkPlate([0.02, 2.55, 0.27], 10, { w: 0.13, h: 0.24, t: 0.04, peel: 18, curl: 0.15 }));
      wood = wood.add(barkPlate([-0.24, 3.7, 0.05], -80, { w: 0.11, h: 0.2, t: 0.04, peel: 20, curl: 0.15 }));
      // the lenticels and chevrons as shallow grooves: arcs round the stem through [angle deg, y] points
      const g = [], arc = (key, pts, w) => g.push(S.tube(pts.map(([ang, y]) => { const { c, r } = stemAt(key, y), t = ang * Math.PI / 180; return [c[0] + Math.sin(t) * (r + w * 0.3), y, c[1] + Math.cos(t) * (r + w * 0.3)]; }), w * 0.5, { aspect: 2.2, up: [0, 1, 0] }));
      for (const [key, by, ac, sp, w] of LENT) { const n = Math.max(2, Math.round(sp / 25)); arc(key, Array.from({ length: n + 1 }, (_, k) => [ac - sp / 2 + sp * k / n, by + 0.012 * Math.sin(k * 1.7)]), w); }
      for (const [key, by, yaw] of CHEV) arc(key, [-3, -2, -1, 0, 1, 2, 3].map((k) => [yaw + k * 13, by + 0.1 + 0.16 * (1 - Math.abs(k) / 3)]), 0.04);
      // a part of its own: the simplifier keeps part borders, so the bands survive on LOD0 / LOD1 as crisp dark dashes
      bandCut = bunion(g).part('lenticel', { mat: 'wood', paint: lit(lenticel, 0.5, 1) });
    }
    wood = wood.part('birchbark', { mat: 'wood', paint: lit(bark, 0.5, (c) => ss(0.1, 1.4, c.y)) });
    if (bandCut) wood = wood.cut(bandCut, { paintCut: true });
    const tw = [];
    BR.forEach(([a, b, r0], i) => {
      if (far && r0 < 0.065) return;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.25, (a[2] + b[2]) / 2];
      const end = [b[0], b[1] - 0.15, b[2]];
      tw.push(limb(far ? [a, end] : zig([a, mid, end], 0.15, i + 2), r0, 0.035, 0.8));
    });
    if (tw.length) wood = wood.add(bunion(tw, 0.04).part('twig', { mat: 'wood', paint: lit(twig, 0.5, 0.9) }));
    const shapes = [];
    CL.forEach(([c, r, seed]) => {
      const cl = cloud(c, r, { seed, sat: 0, out: [c[0] - CEN[0], 0.5, c[2] - CEN[2]], flat: 0.8, skin: 0.08, lobes: 8, satDist: 0.8, satR: 0.5, satDrop: 0.3, lobe: { k: 0.12, lr0: 0.34, lr1: 0.14, inset: [0.3, 0.2], satLobes: 6 } });
      shapes.push(...cl.shapes);
    });
    const crown = bunion(shapes, 0).part('leaves', { mat: 'crown', paint: crownPaint });
    return floor0(wood.add(crown));
  },
};
