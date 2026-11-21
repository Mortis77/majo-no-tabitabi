// hay_sheaf — a standing sheaf of rice straw, bound at the waist with a twist of its own straw. Replaces prop_hay_sheaf
// (catalog `hay_sheaf`: cloth phys, very flammable, fierce burn; 0.68 x 1.00 x 0.70 m, origin foot centre).
// INTENT
//  silhouette: an hourglass — butt ends splayed wide on the ground, pinched hard at the waist by the band, the heads
//  bursting out above and drooping over in ragged tufts, leaning a little to one side (it has been stood up in a hurry).
//  big forms: the splayed foot / the band / the drooping crown.
//  the eye rests on: the twisted band with its tucked end, the ragged tufts breaking the outline, the pale cut butts.
//  wear: field-dried: heads darker ochre, stalks pale gold, butts almost white where cut, the foot grey and damp.
//  must NOT look like: a smooth cone with a ring, a bale, a pack haystack, a symmetric lathe.
import * as P from '../sdf.mjs';
import { pickMats, rope, FAR, C, mix, ss, clamp } from './containers_lib.mjs';

const WAIST = 0.43;
const PROF = [[0, 0], [0.285, 0], [0.305, 0.025], [0.27, 0.12], [0.205, 0.28], [0.158, WAIST - 0.03], [0.152, WAIST], [0.162, WAIST + 0.04], [0.21, 0.55], [0.27, 0.67], [0.298, 0.77], [0.282, 0.84], [0.22, 0.9], [0.12, 0.94], [0, 0.95]];
// tufts: [angle (deg), start height, length, droop, radius]
const TUFTS = [[10, 0.9, 0.17, 0.09, 0.032], [55, 0.86, 0.2, 0.13, 0.03], [100, 0.92, 0.14, 0.07, 0.028], [150, 0.84, 0.21, 0.15, 0.033], [195, 0.9, 0.16, 0.1, 0.03], [240, 0.87, 0.19, 0.14, 0.031], [290, 0.91, 0.15, 0.08, 0.028], [330, 0.85, 0.2, 0.15, 0.032], [30, 0.94, 0.08, 0.0, 0.03], [210, 0.94, 0.09, 0.01, 0.028], [125, 0.78, 0.15, 0.12, 0.026], [275, 0.76, 0.14, 0.12, 0.026]];
const STUBS = [[20, 0.07], [80, 0.1], [140, 0.06], [200, 0.09], [260, 0.05], [320, 0.08]];
const LEAN = 0.045;                                             // metres of sideways lean at 1 m

export default {
  name: 'hay_sheaf', id: 'sculpt_hay_sheaf',
  voxel: 0.0034, lods: [1800, 600, 200], farFrom: 2, farVoxel: 2.4,
  ground: 0, aoRange: 0.1, cavity: [0.005, 0.025], creaseAngle: 45,
  materials: pickMats('straw'),
  replaces: { file: 'assets/models/refined/prop_hay_sheaf.glb', scale: 5.60218 },
  notes: 'Sculpted rice-straw sheaf (splayed butts, waist band of twisted straw with a tucked end, drooping ragged crown, strand relief). Vertex colours on every LOD, no textures: batched, very flammable prop. Family straw.',

  build() {
    const far = FAR();
    let body = P.lathe(PROF, { smooth: 0.008 });
    // strands: vertical relief, seam-free (integer frequency in the angle + noise in direction coordinates)
    if (!far) {
      const f0 = body.f;
      body = new P.Shape((x, y, z) => {
        const d = f0(x, y, z);
        if (d > 0.02) return d;
        const r = Math.hypot(x, z) || 1e-6, ux = x / r, uz = z / r, a = Math.atan2(x, z);
        const n = P.noise3(ux * 3, y * 2.5, uz * 3, 7);
        const s = Math.sin(a * 34 + n * 5 + y * 3);
        const amp = 0.006 * ss(0.0, 0.08, y) * (1 - 0.7 * ss(WAIST - 0.06, WAIST, y) * ss(WAIST + 0.06, WAIST, y));
        return d - amp * (s > 0 ? s ** 0.5 : -0.6 * (-s) ** 2);
      }, [-0.33, -0.01, -0.33, 0.33, 1.0, 0.33], body.pf, 1.5);
    }
    // tufts at the crown: tapered bundles going out and drooping
    for (const [ad, y0, L, droop, r] of (far ? TUFTS.filter((_, i) => i % 2 === 0) : TUFTS)) {
      const a = ad * Math.PI / 180, ca = Math.sin(a), cz = Math.cos(a);
      const rr = Math.max(0.05, prof(y0) - 0.05);
      const p0 = [ca * rr, y0, cz * rr], p1 = [ca * (rr + L * 0.6), y0 + 0.05, cz * (rr + L * 0.6)], p2 = [ca * (rr + L), y0 + 0.03 - droop, cz * (rr + L)];
      const t = P.tube([p0, p1, p2], (u) => r * (1 - 0.8 * u) + 0.004);
      body = body.softAdd(t, 0.03);
    }
    // ragged butts: a few stubs poking out at the foot
    if (!far) for (const [ad, L] of STUBS) {
      const a = ad * Math.PI / 180, ca = Math.sin(a), cz = Math.cos(a);
      body = body.softAdd(P.taperedCapsule([ca * 0.24, 0.05, cz * 0.24], [ca * (0.27 + L * 0.4), 0.018, cz * (0.27 + L * 0.4)], 0.022, 0.013), 0.02);
    }
    body = body.cut(P.plane([0, 1, 0], [0, 0, 0]));               // stands flat on the ground
    let all = body.part('hs_straw', { mat: 'straw', paint: strawSheafPaint });
    // the band: a twist of straw round the waist, its end tucked under and sticking out
    const band = [];
    const N = 26, rb = prof(WAIST) + 0.006;
    for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2 + 0.3; band.push([Math.sin(t) * rb, WAIST + 0.008 * Math.sin(t * 2), Math.cos(t) * rb]); }
    let b = rope(band, 0.022, { lay: 0.07, far });
    if (!far) {
      const t0 = 0.3, e = [Math.sin(t0) * rb, WAIST, Math.cos(t0) * rb];
      b = b.softAdd(rope([e, [e[0] + 0.04, WAIST - 0.05, e[2] + 0.05], [e[0] + 0.05, WAIST - 0.12, e[2] + 0.075]], 0.014, { lay: 0.05 }), 0.01);
      b = b.softAdd(P.ellipsoid([0.035, 0.03, 0.03]).at(e[0], WAIST, e[2] + 0.012), 0.01);     // the twist knot
    }
    all = all.add(b.part('hs_band', { mat: 'straw', paint: bandPaint }));
    // lean: a shear (the foot stays flat on the ground), heavier toward the top
    return all.warp((x, y, z, o) => { o[0] = LEAN * y * y; o[1] = 0; o[2] = 0; }, { lip: 1.15, grow: LEAN + 0.01 }).turn(0, 25, 0);
  },
};

function prof(y) {
  for (let i = 1; i < PROF.length; i++) { const [r1, y1] = PROF[i], [r0, y0] = PROF[i - 1]; if (y <= y1 && y >= y0) return r0 + (r1 - r0) * ((y - y0) / ((y1 - y0) || 1)); }
  return 0.1;
}
function strawSheafPaint(c) {
  const { x, y, z, ny, cavity, edge } = c;
  let col = mix(C('#ecd28e'), C('#d2b06a'), 0.5 + 0.5 * P.fbm(x * 12, y * 40, z * 12, 3, 2));
  col = mix(col, C('#c09048'), ss(0.72, 0.9, y) * 0.55);                          // heads darker ochre
  col = mix(col, C('#f6eac6'), ss(0.05, 0.0, y) * 0.5 + (ny < -0.5 ? 0.4 : 0));   // pale cut butts
  col = mix(col, C('#8a8468'), ss(0.04, 0.0, y) * 0.35);                          // damp foot
  col = mix(col, C('#fbecc0'), edge * 0.45);
  return mix(col, C('#5e4422'), cavity * 0.6);
}
function bandPaint(c) {
  let col = mix(C('#d8b468'), C('#a8823e'), 0.5 + 0.5 * P.fbm(c.x * 40, c.y * 40, c.z * 40, 8, 2));
  col = mix(col, C('#f0d8a0'), c.edge * 0.5);
  return mix(col, C('#4e381a'), c.cavity * 0.6);
}
