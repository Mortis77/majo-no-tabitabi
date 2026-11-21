// crystal_vein — a boulder split by a vein of crystal. Replaces nat_crystal_mineral_1 (flora `crysMineral`: 1.34 x 1.0 x
//   1.29 m, foot centre on y = 0, materials rock + crystal, INSTANCED).
// SILHOUETTE: a squat, faceted boulder with one clean diagonal seam across its top; out of the seam a comb of small
//   crystals sticks up and out like a crest, longest in the middle.
// BIG FORMS: (1) the boulder (big flat faces, crisp edges); (2) the seam; (3) the crest of crystals.
// THE EYE RESTS ON: the crest against the sky, the seam's glowing filling, one bigger crystal at the crest's end.
// WEAR STORY: the vein was inside the rock until the rock weathered and opened along it; the crystals in the seam are
//   fresh, the rock's faces are old and pale-topped.
// MUST NOT LOOK LIKE: a pack mineral (a rock with crystals stuck on), a round pebble, symmetric.
import * as P from '../sdf.mjs';
import { crystalDef, crystal, paintCrystal, paintMatrix, rockPoly, stonePlanes, floorAt } from './shroomcrystal_lib.mjs';

export default crystalDef('crystal_vein', {
  replaces: 'assets/models/nature/nature/nat_crystal_mineral_1.glb', voxel: 0.0045,
  build() {
    const planes = stonePlanes(P.prng(41), { size: [0.64, 0.62, 0.6], c: [0, 0.22, 0], count: 11, cut: [0.82, 1.0], flatTop: 0.82, noUnder: true });
    let rock = rockPoly(planes, { k: 0.008, kSoft: 0.05, soft: (x, y) => P.ss(0.6, 0.85, y) * 0.7, floor: -0.3, bounds: [-0.9, -0.3, -0.9, 0.9, 1.1, 0.9] })
      .part('vn_rock', { mat: 'rock', paint: paintMatrix });
    const rock0 = rock;
    // the seam: a slot across the top along a tilted plane (normal n), filled with crystal a little below the surface
    const n = P.norm([0.8, 0.25, 0.55]);
    const slot = new P.Shape((x, y, z) => Math.abs(x * n[0] + (y - 0.6) * n[1] + z * n[2]) - 0.065 - 0.012 * P.fbm(x * 6, y * 6, z * 6, 3, 2), [-1, -0.5, -1, 1, 1.5, 1], null, 1.2);
    rock = rock.cut(slot.intersect(P.plane([0, -1, 0], [0, 0.06, 0])));
    const fillAx = { base: [0, 0.3, 0], u: [0, 1, 0], len: 0.7, r: 0.1, spin: 0 };
    const fill = rock0.round(-0.016).intersect(new P.Shape((x, y, z) => Math.abs(x * n[0] + (y - 0.6) * n[1] + z * n[2]) - 0.085, [-1, -0.5, -1, 1, 1.5, 1])).part('vn_fill', { mat: 'crystal', paint: paintCrystal(fillAx, { seed: 4 }) });
    // the crest: crystals along the seam line (direction t = n x up), longest in the middle, leaning out of the seam
    const t = P.norm(P.cross(n, [0, 1, 0]));
    let all = rock.add(fill);
    const N = 7;
    for (let i = 0; i < N; i++) {
      const s = (i / (N - 1)) * 2 - 1, mid = 1 - s * s;
      const bx = t[0] * s * 0.5, bz = t[2] * s * 0.5;
      const by = 0.62 - 0.22 * s * s - (bx * n[0] + bz * n[2]) * n[1] * 0;
      const side = i % 2 ? 1 : -1;
      const c = crystal({ base: [bx, by - 0.08, bz], dir: [n[0] * side * 0.35 + t[0] * s * 0.4, 1, n[2] * side * 0.35 + t[2] * s * 0.4], len: 0.12 + 0.36 * mid + (i === N - 2 ? 0.2 : 0), r: 0.05 + 0.04 * mid + (i === N - 2 ? 0.035 : 0), tip: 0.08 + 0.05 * mid, spin: i * 29,
        broken: i === 3 ? { at: 0.7, tilt: [25, -10] } : null });
      let piece = c.s.part(`vn_c${i}`, { mat: 'crystal', paint: paintCrystal(c.axis, { seed: i + 9 }) });
      if (c.brk) piece = piece.cut(new P.Shape(c.brk.f, c.brk.b).part(`vn_b${i}`, { mat: 'crystal', paint: paintCrystal(c.axis, { fresh: true }) }), { paintCut: true });
      all = all.add(piece);
    }
    return floorAt(all, 0);
  },
});
