// crate_b — the big framed shipping crate of the market and the camps. Replaces prop_crate_big (catalog `crate_large`:
// wood, breakable, stackable; 0.90 x 0.90 x 0.90 m, origin foot centre).
// INTENT
//  silhouette: a heavy framed cube — corner posts and top / bottom rails standing proud like a picture frame on each
//  side, a diagonal brace across three sides; the lid boards run the other way.
//  big forms: the frame / the recessed panels of upright boards / the braces.
//  the eye rests on: the merchant's brand burnt into the front panel (a ring round a crescent over two waves — the mark
//  of the lake carriers, original to this world), its scorched halo, and one panel board split along its grain.
//  wear: a crate that travels: frame edges rubbed pale, panel boards darker in their recess, the lid silvered by rain,
//  the foot damp, a split board on the left side.
//  must NOT look like: crate_a (no rope, no sprung board), a pack crate (no X-brace on every side, no even boards).
import * as P from '../sdf.mjs';
import { pickMats, woodPaint, board, faceBoards, nail, nailPaint, FAR, C, mix, ss } from './containers_lib.mjs';

const X = 0.45, Y = 0.9;                  // half width (x and z), height
const POST = 0.072, RAIL = 0.075;         // frame member widths
const FR = X - 0.004;                     // rail outer plane
const PB = X - 0.018;                     // panel board outer plane (recessed 14 mm behind the rails)
const LID_T = 0.024;
const BRAND = [0.02, 0.45];
const FRAME = { light: '#a87a56', dark: '#6e4a32', end: '#5a3c28' };   // frame and braces: a darker, redder wood than the panels               // brand centre on the +z panel (x, y)

// face frames: (u, v, w) -> world; w is the outward coordinate
const FACE = {
  f: { axis: 'z', sign: 1, w: (u, v, w) => [u, v, w] },
  k: { axis: 'z', sign: -1, w: (u, v, w) => [-u, v, -w] },
  r: { axis: 'x', sign: 1, w: (u, v, w) => [w, v, -u] },
  l: { axis: 'x', sign: -1, w: (u, v, w) => [-w, v, u] },
};
const boxUVW = (F, u0, u1, v0, v1, w0, w1, r = 0.005) => {
  const a = F.w(u0, v0, w0), b = F.w(u1, v1, w1);
  return board([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])], { r });
};
const PANEL = { f: [0.15, 0.13, 0.19, 0.11, 0.17, 1], k: [0.18, 0.2, 0.12, 0.16, 1], r: [0.13, 0.17, 0.155, 0.19, 1], l: [0.2, 0.12, 0.17, 0.14, 1] };
const BRACE = { k: 1, r: -1, l: 1 };        // sides with a diagonal brace (sign = which diagonal)

function brandSD(x, y) {                    // 2D signed distance to the burnt lines of the mark (in the panel plane)
  const dx = x - BRAND[0], dy = y - BRAND[1], r = Math.hypot(dx, dy);
  let d = Math.abs(r - 0.1) - 0.0095;                                             // the ring
  const moon = Math.max(Math.hypot(dx + 0.004, dy - 0.018) - 0.056, -(Math.hypot(dx + 0.03, dy - 0.04) - 0.046));
  d = Math.min(d, moon);                                                           // the crescent
  for (const [wy, ph] of [[-0.042, 0], [-0.066, 1.2]]) {                           // two waves
    if (Math.abs(dx) < 0.062) d = Math.min(d, Math.abs(dy - wy - 0.009 * Math.sin(dx * 75 + ph)) - 0.0075);
  }
  return d;
}

export default {
  name: 'crate_b', id: 'sculpt_crate_b',
  voxel: 0.0036, lods: [1800, 600, 200], farFrom: 1, farVoxel: 1.6,   // LOD1+2 from a field without brand skin / nails / split (the brand skin smeared into a dark wedge at LOD1)
  ground: 0, aoRange: 0.1, cavity: [0.005, 0.025], creaseAngle: 40,
  materials: pickMats('wood', 'metal'),
  replaces: { file: 'assets/models/refined/prop_crate_big.glb', scale: 4.28571 },
  notes: 'Sculpted framed crate (posts + rails, recessed upright boards, braces, a burnt carrier brand, a split board). Vertex colours on every LOD, no textures: batched prop. Families wood / metal.',

  build() {
    const far = FAR();
    let all = P.boxFromTo([-PB + 0.026, 0.004, -PB + 0.026, PB - 0.026, Y - LID_T + 0.004, PB - 0.026]).part('cb_core', { mat: 'wood', paint: () => C('#5e4430') });
    // corner posts
    let k = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = board([sx > 0 ? X - POST : -X, 0, sz > 0 ? X - POST : -X], [sx > 0 ? X : -X + POST, Y - LID_T + 0.004, sz > 0 ? X : -X + POST], { r: 0.008 });
      all = all.add(p.part('cb_post' + k, { mat: 'wood', paint: woodPaint({ tone: 0.3 + 0.2 * (k % 2), grain: 'y', seed: 10 + k, silver: 0.2, ...FRAME }) }));
      k++;
    }
    let nails = null; const addNail = (s) => { nails = nails ? nails.add(s) : s; };
    let ri = 0, bi = 0;
    for (const [key, F] of Object.entries(FACE)) {
      const u0 = -X + POST - 0.008, u1 = X - POST + 0.008;
      // rails top and bottom (grain along u)
      for (const [v0, v1] of [[0.0, RAIL], [Y - LID_T - RAIL + 0.004, Y - LID_T + 0.004]]) {
        all = all.add(boxUVW(F, u0, u1, v0, v1, PB - 0.012, FR, 0.006).part('cb_rail' + ri, { mat: 'wood', paint: woodPaint({ tone: 0.15 + (ri * 0.37) % 0.6, grain: F.axis === 'z' ? 'x' : 'z', seed: 20 + ri, silver: 0.3, ...FRAME }) }));
        for (const e of [-1, 1]) { const n = F.w(0, 0, 1).map((v, i) => i === 1 ? 0 : v); if (!far) addNail(nail(F.w(e * (X - POST - 0.03), (v0 + v1) / 2, FR), n, 0.009)); }
        ri++;
      }
      // panel: upright boards of unequal width between the rails
      const ws = PANEL[key];
      let u = u0;
      ws.forEach((w, i) => {
        const last = i === ws.length - 1, a = u + (i ? 0.0055 : 0), b = last ? u1 : u + w - 0.0055;
        const proud = ((bi * 0.618) % 1 - 0.5) * 0.004;
        let s = boxUVW(F, a, b, RAIL - 0.01, Y - LID_T - RAIL + 0.014, PB - 0.03, PB + proud, 0.0045);
        if (key === 'l' && i === 2 && !far) {                                                      // split along the grain
          const c = F.w((a + b) / 2 + 0.008, 0.52, PB);
          s = s.cut(P.box([0.004, 0.36, 0.05]).turn(0, 0, 3).at(0, 0, 0).turn(0, 90, 0).at(c[0], c[1], c[2]));
        }
        const paint = woodPaint({ tone: 0.35 + 0.65 * ((bi * 0.618) % 1), grain: 'y', seed: 40 + bi, silver: 0.25, extra: key === 'f' ? brandPaint : null });
        all = all.add(s.part('cb_p' + bi, { mat: 'wood', paint }));
        bi++; u += w;
      });
      // diagonal brace, nailed at both ends
      if (BRACE[key]) {
        const sgn = BRACE[key], h = Y - LID_T - 2 * RAIL, wspan = u1 - u0, ang = Math.atan2(h, wspan) * 180 / Math.PI * sgn;
        const len = Math.hypot(h, wspan) + 0.1, cy = (Y - LID_T) / 2;
        let br = P.roundBox([len, 0.088, 0.022], 0.006).turn(0, 0, ang).at(0, cy, 0)
          .intersect(P.boxFromTo([u0 + 0.004, RAIL - 0.002, -1, u1 - 0.004, Y - LID_T - RAIL + 0.006, 1]));
        // into face frame: local (u, v, w) with w centred at PB + 0.002
        const toF = (s) => {
          if (F.axis === 'z') return F.sign > 0 ? s.at(0, 0, PB + 0.006) : s.turn(0, 180, 0).at(0, 0, -(PB + 0.006));
          return F.sign > 0 ? s.turn(0, 90, 0).at(PB + 0.006, 0, 0) : s.turn(0, -90, 0).at(-(PB + 0.006), 0, 0);
        };
        all = all.add(toF(br).part('cb_brace' + key, { mat: 'wood', paint: woodPaint({ tone: 0.5, grain: F.axis === 'z' ? 'x' : 'z', seed: 70 + bi, silver: 0.3, ...FRAME }) }));
        const n = F.w(0, 0, 1).map((v, i) => i === 1 ? 0 : v);
        if (!far) for (const e of [-1, 1]) addNail(nail(F.w(e * (wspan / 2 - 0.07), cy + e * sgn * (h / 2 - 0.05), PB + 0.018), n, 0.009));
      }
    }
    // lid: boards along z, unequal widths across x
    const lid = faceBoards({ face: { axis: 'y', sign: 1, at: Y }, u: [-X + 0.003, X - 0.003], v: [-X + 0.003, X - 0.003], run: 'v', widths: [0.22, 0.15, 0.25, 1], gap: 0.011, thick: LID_T - 0.005, sink: 0.004, seed: 31 });
    for (const b of lid) {
      all = all.add(board(b.lo, b.hi, { r: 0.005 }).part('cb_lid' + b.i, { mat: 'wood', paint: woodPaint({ tone: b.tone * 0.6, grain: 'z', seed: 90 + b.i, silver: 0.55 }) }));
      const xm = (b.lo[0] + b.hi[0]) / 2;
      if (!far) for (const e of [-1, 1]) addNail(nail([xm, Y, e * (X - POST / 2)], [0, 1, 0], 0.009));
    }
    if (!far) {
      // the brand: a char skin a hair proud of the front boards (a separate part keeps its edge crisp at every LOD)
      const bf = all.f;
      const brand = new P.Shape((x, y, z) => Math.max(bf(x, y, z) - 0.0013, brandSD(x, y), PB - 0.012 - z), [BRAND[0] - 0.13, BRAND[1] - 0.13, PB - 0.02, BRAND[0] + 0.13, BRAND[1] + 0.13, PB + 0.01]).part('cb_brand', { mat: 'wood', paint: (c) => mix(C('#2e1c12'), C('#5a3a24'), c.edge * 0.6) });
      all = all.add(brand);
    }
    if (nails) all = all.add(nails.part('cb_nails', { mat: 'metal', paint: nailPaint }));
    return all;
  },
};

function brandPaint(c, col) {
  if (c.z < PB - 0.02) return col;
  const d = brandSD(c.x, c.y);
  return mix(col, C('#5a3820'), ss(0.03, 0.0, d) * 0.65);                           // scorched halo round the lines
}
