// crate_iron — the iron-bound strongbox of the quartermasters and the shrine store. Replaces prop_crate_large (catalog
// `iron_box`: phys metal, heavy, hp 400, unbreakable by hand; 1.00 x 0.666 x 0.962 m, origin foot centre).
// INTENT
//  silhouette: a low, wide chest — angle irons on every corner, two straps clasping over the lid and down both faces,
//  a hasp with a hanging padlock on the front, a drop ring on each end. Heavy, low, squat.
//  big forms: the boarded body with its lid line / the iron cage (corners + straps) / the lock and rings.
//  the eye rests on: the padlock and hasp (front centre), the rows of rivet heads on the straps, the lid line.
//  wear: iron rubbed bright on the edges, rust bleeding into the boards below the straps, the boards between the irons
//  darker with age, the lid silvered; one corner iron dented.
//  must NOT look like: a metal cube, a pack chest with gold trim (no gold: gold is for sacred things), symmetric.
import * as P from '../sdf.mjs';
import { pickMats, woodPaint, board, faceBoards, nail, nailPaint, ironPaint, FAR, C, mix, ss } from './containers_lib.mjs';

const X = 0.5, Z = 0.464, Y = 0.666;   // Z: the padlock stands 34 mm proud of the front; old depth 0.962 kept overall
const T = 0.012;                          // iron thickness (proud of the boards)
const XB = X - T, ZB = Z - T, YB = Y - T; // board outer planes
const SEAM = 0.47;                        // lid line
const STRAPS = [-0.27, 0.285];            // x of the two straps
const SW = 0.07, CW = 0.075;              // strap width, corner-iron leg width

export default {
  name: 'crate_iron', id: 'sculpt_crate_iron',
  voxel: 0.0036, lods: [1800, 600, 200], farFrom: 1, farVoxel: 1.6,   // LOD1+2 from a field without lock detail / rivets / dent (they smeared to a dark wedge at LOD1)
  ground: 0, aoRange: 0.1, cavity: [0.005, 0.025], creaseAngle: 40,
  materials: pickMats('wood', 'metal'),
  replaces: { file: 'assets/models/refined/prop_crate_large.glb', scale: 0.637 },
  notes: 'Sculpted iron-bound strongbox (boarded body, corner irons, two riveted straps over the lid, hasp + padlock, drop rings). Vertex colours on every LOD, no textures: batched prop. Families wood / metal.',

  build() {
    const far = FAR();
    let all = P.boxFromTo([-XB + 0.024, 0.0, -ZB + 0.024, XB - 0.024, YB - 0.02, ZB - 0.024]).part('ci_core', { mat: 'wood', paint: () => C('#4e3828') });
    {
      // boards: horizontal on the four sides, the lid line a wider gap; lid boards along x
      const sides = [
        { face: { axis: 'z', sign: 1, at: ZB }, u: [-XB, XB], w: [0.16, 0.13, 0.17, 1], s: 1 },
        { face: { axis: 'z', sign: -1, at: -ZB }, u: [-XB, XB], w: [0.14, 0.175, 0.145, 1], s: 2 },
        { face: { axis: 'x', sign: 1, at: XB }, u: [-ZB + 0.02, ZB - 0.02], w: [0.15, 0.165, 0.14, 1], s: 3 },
        { face: { axis: 'x', sign: -1, at: -XB }, u: [-ZB + 0.02, ZB - 0.02], w: [0.17, 0.14, 0.15, 1], s: 4 },
      ];
      let bi = 0;
      for (const S of sides) {
        // body boards below the seam, one lid board above it
        const body = faceBoards({ face: S.face, u: S.u, v: [0.0, SEAM - 0.006], run: 'u', widths: S.w, gap: 0.01, thick: 0.02, seed: S.s });
        const lidb = faceBoards({ face: S.face, u: S.u, v: [SEAM + 0.006, YB - 0.002], run: 'u', widths: [1], gap: 0.01, thick: 0.02, seed: S.s + 10 });
        for (const b of body.concat(lidb)) {
          all = all.add(board(b.lo, b.hi, { r: 0.0045 }).part('ci_b' + bi, { mat: 'wood', paint: woodPaint({ tone: 0.45 + 0.55 * ((bi * 0.618) % 1), grain: S.face.axis === 'z' ? 'x' : 'z', seed: 10 + bi, silver: 0.2, extra: rustBelowStraps }) }));
          bi++;
        }
      }
      const lid = faceBoards({ face: { axis: 'y', sign: 1, at: YB }, u: [-XB + 0.002, XB - 0.002], v: [-ZB + 0.002, ZB - 0.002], run: 'u', widths: [0.24, 0.21, 0.26, 1], gap: 0.01, thick: 0.02, sink: 0.004, seed: 7 });
      for (const b of lid) all = all.add(board(b.lo, b.hi, { r: 0.005 }).part('ci_lid' + b.i, { mat: 'wood', paint: woodPaint({ tone: (b.i * 0.37) % 1 * 0.7, grain: 'x', seed: 60 + b.i, silver: 0.55, extra: rustBelowStraps }) }));
    }
    // ---- iron
    const P_ = far ? 1.6 : 1;                                                         // far: prouder, so the bands survive
    let iron = null; const addI = (s) => { iron = iron ? iron.add(s) : s; };
    let riv = null; const addR = (s) => { riv = riv ? riv.add(s) : s; };
    // corner angle irons: two legs on each vertical edge, ground to the top
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x0 = sx * X, z0 = sz * Z, t = T * P_;
      let a = board([Math.min(x0, x0 - sx * CW), 0, Math.min(z0, z0 - sz * t)], [Math.max(x0, x0 - sx * CW), Y, Math.max(z0, z0 - sz * t)], { r: 0.003 });
      a = a.add(board([Math.min(x0, x0 - sx * t), 0, Math.min(z0, z0 - sz * CW)], [Math.max(x0, x0 - sx * t), Y, Math.max(z0, z0 - sz * CW)], { r: 0.003 }));
      if (sx > 0 && sz > 0 && !far) a = a.cut(P.sphere(0.05).at(X + 0.035, 0.2, Z + 0.035));    // a dent from a dropped load
      addI(a);
      if (!far) for (const y of [0.08, 0.3, 0.55]) { addR(nail([x0 - sx * CW * 0.55, y, z0], [0, 0, sz], 0.009)); addR(nail([x0, y + 0.03, z0 - sz * CW * 0.55], [sx, 0, 0], 0.009)); }
    }
    // top rim irons: an angle all round the lid edge
    for (const sz of [-1, 1]) addI(board([-X, Y - CW * 0.7, Math.min(sz * Z, sz * (Z - T * P_))], [X, Y, Math.max(sz * Z, sz * (Z - T * P_))], { r: 0.003 }).add(board([-X, Y - T * P_, Math.min(sz * Z, sz * (Z - CW))], [X, Y, Math.max(sz * Z, sz * (Z - CW))], { r: 0.003 })));
    for (const sx of [-1, 1]) addI(board([Math.min(sx * X, sx * (X - T * P_)), Y - CW * 0.7, -Z], [Math.max(sx * X, sx * (X - T * P_)), Y, Z], { r: 0.003 }).add(board([Math.min(sx * X, sx * (X - CW)), Y - T * P_, -Z], [Math.max(sx * X, sx * (X - CW)), Y, Z], { r: 0.003 })));
    // straps over the lid and down both faces, riveted
    for (const sxp of STRAPS) {
      const t = T * P_;
      addI(board([sxp - SW / 2, Y - t, -Z], [sxp + SW / 2, Y, Z], { r: 0.003 }));
      for (const sz of [-1, 1]) addI(board([sxp - SW / 2, 0.025, Math.min(sz * Z, sz * (Z - t))], [sxp + SW / 2, Y, Math.max(sz * Z, sz * (Z - t))], { r: 0.003 }));
      if (!far) {
        for (const z of [-0.33, -0.11, 0.11, 0.33]) addR(nail([sxp, Y, z], [0, 1, 0], 0.01));
        for (const sz of [-1, 1]) for (const y of [0.09, 0.27, SEAM - 0.04, SEAM + 0.06]) addR(nail([sxp, y, sz * Z], [0, 0, sz], 0.01));
      }
    }
    if (!far) {
      // hasp: a hinged tongue from the lid over the seam, a staple through it, a padlock hanging from the staple
      const hz = Z - 0.002;
      addI(P.roundBox([0.075, 0.15, 0.012], 0.006).at(0, SEAM - 0.005, hz + 0.004).softAdd(P.cylinder(0.011, 0.09).turn(0, 0, 90).at(0.045, SEAM + 0.07, hz + 0.008), 0.004));
      addI(P.roundBox([0.13, 0.11, 0.012], 0.01).at(0, SEAM - 0.07, ZB + 0.004));                          // lock plate on the body
      // padlock: a heavy rounded body and a thick shackle through the staple
      const lk = P.roundBox([0.075, 0.062, 0.026], 0.011).at(0, SEAM - 0.135, hz + 0.02)
        .add(P.torus(0.024, 0.0075).turn(90, 0, 0).intersect(P.boxFromTo([-0.05, 0, -0.05, 0.05, 0.05, 0.05])).at(0, SEAM - 0.106, hz + 0.02))
        .cut(P.cylinder(0.006, 0.02).turn(90, 0, 0).at(0, SEAM - 0.145, hz + 0.036));                     // key hole
      addI(lk);
      // staple the shackle hangs on
      addI(P.torus(0.016, 0.0055).turn(90, 0, 0).intersect(P.boxFromTo([-0.04, -0.04, -0.04, 0.04, 0.0, 0.04])).turn(0, 0, 0).at(0, SEAM - 0.1, hz + 0.018).softAdd(P.box([0.04, 0.012, 0.012]).at(0, SEAM - 0.1, hz + 0.012), 0.003));
      // drop rings on both ends: a staple and a heavy ring lying against the boards
      for (const s of [-1, 1]) {
        addI(P.roundBox([0.014, 0.05, 0.07], 0.005).at(s * (XB + 0.004), 0.47, 0));
        addI(P.torus(0.055, 0.0095).turn(0, 0, 90).at(s * (XB + 0.01), 0.415, 0).turn(0, 0, s * 8));
      }
    } else {
      addI(P.roundBox([0.075, 0.15, 0.016], 0.006).at(0, SEAM - 0.005, Z + 0.002)); addI(P.roundBox([0.075, 0.062, 0.03], 0.01).at(0, SEAM - 0.13, Z + 0.012));
    }
    all = all.add(iron.part('ci_iron', { mat: 'metal', paint: ironPaint({ light: '#70737c', dark: '#53565e', rust: 0.55 }) }));
    if (riv) all = all.add(riv.part('ci_rivets', { mat: 'metal', paint: (c) => mix(mix(C('#5a5c62'), C('#8a5a3a'), c.cavity), C('#c4c6cc'), c.edge * 0.7) }));
    return all;
  },
};

// rust bled from the straps into the boards below them (a few cm, streaky)
function rustBelowStraps(c, col) {
  let r = 0;
  for (const sx of STRAPS) { const dx = Math.abs(c.x - sx) - SW / 2; if (dx < 0.05 && dx > -0.01) r = Math.max(r, ss(0.05, 0.0, dx) * (0.5 + 0.5 * P.fbm(c.x * 40, c.y * 4, c.z * 4, 3, 2))); }
  return mix(col, C('#8a4e2c'), r * 0.45);
}
