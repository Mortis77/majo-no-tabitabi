// crate_a — the village's everyday supply crate. Replaces prop_crate_metal (catalog `crate`: wood, breakable, stackable;
// 0.80 x 0.80 x 0.80 m, origin foot centre).
// INTENT
//  silhouette: a box whose four corner posts stand proud of the boards, the lid boards overhanging a little, a rope
//  loop slung on each end, and one front board sprung loose — the corner that says "carried and dropped for years".
//  big forms: the cube with its posts / the boards of unequal width with dark gaps / the rope handles.
//  the eye rests on: the sprung board (shadow behind it, the nail pulled out), the rope knots at the handle holes,
//  the nail heads pinning each board to the posts.
//  wear: rain silvers the lid and the tops of the boards, the foot is damp and dark, edges rubbed pale where hands grab,
//  one post corner knocked off; every board its own tone.
//  must NOT look like: a box with a plank texture, a pack crate with metal corner caps, even boards, symmetric.
import * as P from '../sdf.mjs';
import { pickMats, woodPaint, board, faceBoards, swingY, nail, nailPaint, rope, ropePaint, FAR, C, mix, ss } from './containers_lib.mjs';

const X = 0.398, Y = 0.80, Z = 0.399;          // the old crate's half extents / height
const POST = 0.064, PROUD = 0.02;  // posts stand 20 mm proud and run down as legs: the boards stop above the ground
const FOOT = 0.035;               // post size, how far posts stand out of the board planes
const BP = X - PROUD;                           // board outer plane (sides)
const TOP = Y - 0.022, LID_T = 0.024;          // lid under two cleats that rise to Y
const CLEAT = [-0.255, 0.27];
const AX = ['x', 'y', 'z'];

const FACES = [
  { key: 'f', face: { axis: 'z', sign: 1, at: BP }, run: 'u', widths: [0.19, 0.215, 0.15, 1], seed: 11 },
  { key: 'k', face: { axis: 'z', sign: -1, at: -BP }, run: 'u', widths: [0.23, 0.17, 0.2, 1], seed: 12 },
  { key: 'r', face: { axis: 'x', sign: 1, at: BP }, run: 'u', widths: [0.165, 0.24, 0.17, 1], seed: 13 },
  { key: 'l', face: { axis: 'x', sign: -1, at: -BP }, run: 'u', widths: [0.2, 0.18, 0.22, 1], seed: 14 },
];
const SPRUNG = { key: 'f', i: 2, deg: -2.6 };    // front, third board from the foot: its +x end has come loose
const HANDLE_Y = 0.6, HOLE_Z = 0.125;

export default {
  name: 'crate_a', id: 'sculpt_crate_a',
  voxel: 0.0035, lods: [1800, 600, 200], farFrom: 2, farVoxel: 2.4,
  ground: 0, aoRange: 0.1, cavity: [0.005, 0.025], creaseAngle: 40,
  materials: pickMats('wood', 'metal'),
  replaces: { file: 'assets/models/refined/prop_crate_metal.glb', scale: 0.92178 },
  notes: 'Sculpted supply crate (corner posts, boards of unequal width, a sprung board, rope handles, nails). Vertex colours on every LOD, no textures: batched prop. Families wood / metal.',

  build() {
    const far = FAR();
    // core: the inside of the crate, seen through the gaps (dark)
    let core = P.boxFromTo([-BP + 0.024, FOOT + 0.004, -BP + 0.024, BP - 0.024, TOP - LID_T + 0.004, BP - 0.024]);
    if (far) core = P.boxFromTo([-BP + 0.002, 0, -BP + 0.002, BP - 0.002, TOP - 0.004, BP - 0.002]);
    let all = core.part('ca_core', { mat: 'wood', paint: (c) => mix(C('#7a5a40'), C('#4a3424'), 0.6) });
    // corner posts (grain up), the -x/-z one knocked at the top
    let pi = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      let p = board([sx > 0 ? X - POST : -X, 0, sz > 0 ? Z - POST : -Z], [sx > 0 ? X : -X + POST, TOP - LID_T + 0.004, sz > 0 ? Z : -Z + POST], { r: 0.009 });
      if (sx < 0 && sz < 0 && !far) p = p.cut(P.box([0.07, 0.05, 0.07]).turn(30, 45, 0).at(-X - 0.012, TOP - LID_T - 0.006, -Z - 0.012));
      all = all.add(p.part('ca_post' + pi, { mat: 'wood', paint: woodPaint({ tone: [0.95, 1.0, 0.85, 1.0][pi], grain: 'y', seed: 30 + pi, silver: 0.15, dark: '#7a5638' }) }));
      pi++;
    }
    if (far) {
      let lid = board([-X + 0.012, TOP - LID_T, -Z + 0.012], [X - 0.012, TOP, Z - 0.012], { r: 0.006 });
      for (const cx of CLEAT) lid = lid.add(board([cx - 0.034, TOP - 0.004, -Z + 0.03], [cx + 0.034, Y, Z - 0.03], { r: 0.007 }));
      all = all.add(lid.part('ca_lid0', { mat: 'wood', paint: woodPaint({ tone: 0.2, grain: 'x', seed: 50 }) }));
      for (const s of [-1, 1]) all = all.add(rope([[s * (BP - 0.008), HANDLE_Y, -HOLE_Z], [s * (BP + 0.006), HANDLE_Y - 0.06, 0], [s * (BP - 0.008), HANDLE_Y, HOLE_Z]], 0.016, { far: true }).part('ca_rope' + (s > 0 ? 'r' : 'l'), { mat: 'wood', paint: ropePaint() }));
      return all;
    }
    // side boards
    let bi = 0, nails = null;
    const addNail = (s) => { nails = nails ? nails.add(s) : s; };
    for (const F of FACES) {
      const span = F.face.axis === 'z' ? [-X + POST - 0.007, X - POST + 0.007] : [-Z + POST - 0.007, Z - POST + 0.007];
      const bs = faceBoards({ face: F.face, u: span, v: [FOOT, TOP - LID_T + 0.004], run: F.run, widths: F.widths, gap: 0.011, thick: 0.022, seed: F.seed });
      for (const b of bs) {
        let s = board(b.lo, b.hi, { r: 0.0045, bow: (b.i === 1 ? 0.004 : 0) * F.face.sign, bowAxis: F.face.axis === 'z' ? 2 : 0 });
        const sprung = F.key === SPRUNG.key && b.i === SPRUNG.i;
        if (sprung) s = swingY(s, -X + POST, BP - 0.02, SPRUNG.deg);
        all = all.add(s.part('ca_b' + bi, { mat: 'wood', paint: woodPaint({ tone: (bi * 0.618 + b.tone * 0.3) % 1, grain: AX[b.grainAxis], seed: 60 + bi, light: '#d4b088', dark: '#94704c' }) }));
        bi++;
        // nails into the posts at both ends (the sprung board kept only its fixed end)
        const vMid = (b.lo[1] + b.hi[1]) / 2, n = F.face.axis === 'z' ? [0, 0, F.face.sign] : [F.face.sign, 0, 0];
        for (const e of [-1, 1]) {
          if (sprung && e > 0) continue;
          const u = e * (X - POST + 0.025), out = F.face.at + F.face.sign * 0.0;
          for (const dv of (b.hi[1] - b.lo[1] > 0.19 ? [-0.045, 0.045] : [0])) {
            const at = F.face.axis === 'z' ? [u, vMid + dv, out] : [out, vMid + dv, u];
            addNail(nail(at, n, 0.011));
          }
        }
      }
    }
    // the sprung board: a nail drawn half out at its loose end, bent
    {
      const at = [X - POST + 0.025, 0, BP + 0.03];
      const b = FACES[0];
      let y = FOOT; for (let i = 0; i < SPRUNG.i; i++) y += b.widths[i]; y += b.widths[SPRUNG.i] / 2;
      addNail(P.taperedCapsule([at[0], y, BP - 0.004], [at[0] + 0.006, y + 0.012, BP + 0.022], 0.004, 0.0035).add(nail([at[0] + 0.007, y + 0.014, BP + 0.024], [0.3, 0.4, 0.86], 0.008)));
    }
    // lid: boards along x, unequal widths across z, overhanging the sides by a few mm
    const lid = faceBoards({ face: { axis: 'y', sign: 1, at: TOP }, u: [-X + 0.012, X - 0.012], v: [-Z + 0.012, Z - 0.012], run: 'u', widths: [0.2, 0.17, 0.235, 1], gap: 0.011, thick: LID_T - 0.006, sink: 0.004, seed: 21 });
    for (const b of lid) {
      all = all.add(board(b.lo, b.hi, { r: 0.005 }).part('ca_lid' + b.i, { mat: 'wood', paint: woodPaint({ tone: (b.i * 0.41) % 1 * 0.8, grain: 'x', seed: 80 + b.i, silver: 0.5 }) }));
      const zm = (b.lo[2] + b.hi[2]) / 2;
      for (const e of [-1, 1]) addNail(nail([e * (X - POST / 2), TOP, zm], [0, 1, 0], 0.0095));
    }
    // two cleats across the lid (a lid you lift off by them), the left one set a little skew
    CLEAT.forEach((cx, i) => {
      const cl = board([cx - 0.034, TOP - 0.004, -Z + 0.03], [cx + 0.034, Y, Z - 0.03], { r: 0.007 }).turn(0, i ? 0 : 2.2, 0);
      all = all.add(cl.part('ca_cleat' + i, { mat: 'wood', paint: woodPaint({ tone: 0.9 - i * 0.3, grain: 'z', seed: 95 + i, silver: 0.35 }) }));
      for (const z of [-0.3, -0.1, 0.1, 0.3]) addNail(nail([cx + (i ? 0 : z * 0.038), Y, z], [0, 1, 0], 0.0095));
    });
    all = all.add(nails.part('ca_nails', { mat: 'metal', paint: nailPaint }));
    // rope handles on both ends: out of one hole, a slack loop, into the other; a stopper knot at each hole
    for (const s of [-1, 1]) {
      const x0 = s * (BP - 0.006);
      const pts = [[x0, HANDLE_Y, -HOLE_Z], [s * (BP + 0.008), HANDLE_Y - 0.035, -HOLE_Z * 0.75], [s * (BP + 0.012), HANDLE_Y - 0.075, 0.01], [s * (BP + 0.008), HANDLE_Y - 0.03, HOLE_Z * 0.8], [x0, HANDLE_Y, HOLE_Z]];
      let r = rope(pts, 0.0125, { lay: 0.045 });
      for (const z of [-HOLE_Z, HOLE_Z]) r = r.softAdd(P.ellipsoid([0.012, 0.021, 0.021]).at(s * (BP + 0.004), HANDLE_Y + 0.002, z), 0.006);
      all = all.add(r.part('ca_rope' + (s > 0 ? 'r' : 'l'), { mat: 'wood', paint: ropePaint() }));
    }
    return all;
  },
};
