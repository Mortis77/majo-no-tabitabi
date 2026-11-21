// 纸魅 — the paper shade (TYPES.paper, makeHitogata in src/actors/creature.js), sculpted as a static mesh for the same
// procedural rig: PAPER_VERT (sleeve flap |x| .1-.3 / y .5-.9, hem sway y < .35, uJig lean) and the motion layer move it.
// The boss 无明 shows the same doll 24 times larger: node BOSS is a richer LOD for that (fibres, fold lines, dry brush).
//
// INTENT
//  1. Silhouette: a cut-paper hitogata — round head, wide kimono sleeves held out, a skirt that splits into two legs —
//     but a used one: right sleeve end torn off in a ragged line, right foot burnt away, left sleeve corner dog-eared.
//  2. Big forms: the folded sheet itself (spine mountain fold, sleeves folded forward at the shoulders, a waist crease
//     from being kept folded in a sleeve), the head bent forward at the neck, the thickness of the card.
//  3. Where the eye rests: the ink face (two slanted brush strokes, a sly crescent grin, a forehead tick) and the
//     vermilion moon seal on the chest over the spine fold; then the scorched foot and the torn sleeve.
//  4. Wear story: it has been folded, carried, torn in a scuffle and caught by a flame; the paper is warmer and
//     dirtier toward the feet, browned before the char, the ink bleeds faintly through to the back.
//  5. Must not look like: a flat cut-out, a plane with a picture on it, a ghost sheet, symmetric, cardboard.
//
// Units: the code's local units (mesh 'Hitogata', y 0..0.93; makeHitogata adds y +0.04; the game draws it at 0.62).
import * as L from './jellypaper_lib.mjs';
import * as P from '../sdf.mjs';

const C = P.color, mix = P.mix, ss = P.ss, clamp = L.clamp;
const KITS = new Map();
/** everything that depends on the detail level ('full' boss, 'mid' game LOD0, 'far' LOD1) */
function kit(DET) {
  if (KITS.has(DET)) return KITS.get(DET);
const FULL = DET === 'full', FAR = DET === 'far';
const T = FAR ? 0.007 : 0.004;            // paper thickness (card: the game draws it at 0.62 -> 2.5 mm)
const INKH = 0;                           // (rev 2) ink lies in the paper: no raised step, the remesh follows its edge

// ------------------------------------------------------------------------------------------------- the cut outline
const BODY = [
  // (rev 2) sleeves taper toward the cuff: deep at the shoulder, narrower at the end
  [0.042, 0.74], [0.042, 0.70], [0.065, 0.684], [0.16, 0.668], [0.255, 0.645], [0.302, 0.628], [0.31, 0.56], [0.312, 0.5],
  [0.298, 0.474], [0.262, 0.466], [0.205, 0.474], [0.158, 0.492], [0.126, 0.53], [0.1, 0.45], [0.098, 0.40], [0.115, 0.31],
  [0.145, 0.2], [0.168, 0.11], [0.172, 0.0], [0.018, 0.0], [0.018, 0.10], [0.0, 0.124], [-0.018, 0.10], [-0.018, 0.0],
  [-0.175, 0.0], [-0.17, 0.11], [-0.148, 0.2], [-0.117, 0.31], [-0.099, 0.40], [-0.101, 0.45], [-0.127, 0.53], [-0.16, 0.498],
  [-0.21, 0.48], [-0.268, 0.47], [-0.304, 0.478], [-0.316, 0.505], [-0.312, 0.56], [-0.3, 0.63], [-0.25, 0.647],
  [-0.16, 0.669], [-0.065, 0.685], [-0.042, 0.70], [-0.042, 0.74],
];
// (rev 2) a ragged tear into the left side of the skirt: it opens at the edge and runs out to a hairline
const RIPA = [-0.18, 0.318], RIPB = [-0.084, 0.29];
const ripMid = (x) => RIPA[1] + (x - RIPA[0]) / (RIPB[0] - RIPA[0]) * (RIPB[1] - RIPA[1]);
function ripD(x, y) {
  if (x < -0.2 || x > -0.07 || Math.abs(y - 0.305) > 0.03) return 1;
  const yj = y + 0.0045 * P.fbm(x * 55, 2.3, 0, 5, 3) + (FULL ? 0.0012 * P.noise3(x * 320, 0.7, 0, 4) : 0);
  return L.d2stroke(x, yj, RIPA, RIPB, 0.005, 0.0012).d;
}
/** distance from the burn front, + into the paper (the right foot is burnt away) */
function burn(x, y) {
  const r = 0.078 + 0.012 * P.fbm(x * 30, y * 30, 0, 7, 3) + (FULL ? 0.002 * P.noise3(x * 260, y * 260, 0, 8) : 0);
  return Math.hypot(x - 0.182, y + 0.03) - r;
}
function outline(x, y) {
  let d = P.poly2d(BODY, x, y);
  d = P.smin(d, L.d2ellipse(x, y, 0, 0.805, 0.1, 0.112), 0.012);
  // the right sleeve end torn off: a ragged line, fibres pulled out of it at boss size
  if (x > 0.2 && y > 0.39 && y < 0.7) {
    const xt = 0.286 + 0.012 * P.fbm(y * 38, 1.7, 0, 5, 3) + (FAR ? 0 : 0.003 * P.noise3(y * 140, 0.3, 0, 6)) + (FULL ? 0.0014 * P.noise3(y * 520, 3.1, 0, 9) : 0);
    d = Math.max(d, x - xt);
  }
  if (!FAR) d = Math.max(d, -ripD(x, y));
  d = Math.max(d, -burn(x, y));
  return d;
}
const dO = L.grid2d(outline, [-0.345, -0.035, 0.345, 0.95], FAR ? 0.0016 : 0.0007);

// ---------------------------------------------------------------------------------------------------- the folds
const DOG = { a: [-0.313, 0.575], b: [-0.24, 0.648] };
const dogN = (() => { const dx = DOG.b[0] - DOG.a[0], dy = DOG.b[1] - DOG.a[1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; })(); // points to the corner (-x, +y)
function F(x, y) {
  const ax = Math.abs(x);
  let z = -0.34 * ax + 0.42 * Math.max(0, ax - 0.15) * ss(0.34, 0.4, y);       // spine mountain fold, sleeves folded forward at the shoulders
  z += -0.07 * Math.abs(y - 0.4) + 0.04 * Math.abs(y - 0.6);   // waist mountain + chest valley: it was kept folded                              // waist crease: it was kept folded in half
  if (y > 0.68) z += 0.1 * (y - 0.68);                          // head bent forward at the neck
  z += 0.006 * Math.sin(y * 9 + x * 4);                         // never quite flat
  const dd = (x - DOG.a[0]) * dogN[0] + (y - DOG.a[1]) * dogN[1];
  if (dd > 0 && x < -0.2) z += 0.9 * dd * ss(-0.2, -0.23, x);                                    // dog-eared sleeve corner
  if (!FAR && x < -0.082 && y < ripMid(x)) z += 0.012 * ss(-0.082, -0.14, x) * ss(ripMid(x) - 0.07, ripMid(x), y); // rip flap lifts
  z += 0.016 * ss(0.045, 0, burn(x, y));                        // heat curl at the burnt foot
  return z;
}

// ------------------------------------------------------------------------------------------------- ink and seal
// (rev 2) an angry little face that reads at 120 px: two slanted brushed brows, two eye dots, a flat mouth stroke
const STROKES = [
  { a: [-0.074, 0.842], b: [-0.017, 0.82], ra: 0.0085, rb: 0.0038, dry: 1 },     // left brow, heavy outer end
  { a: [0.076, 0.846], b: [0.02, 0.822], ra: 0.0082, rb: 0.0036, dry: 1 },       // right brow
  { a: [-0.022, 0.749], b: [0.024, 0.745], ra: 0.0044, rb: 0.003, dry: 0.7 },    // the mouth: one flat stroke
  // talisman marks on the whole sleeve: three brushed strokes of different lengths, stacked like a written charm
  { a: [-0.268, 0.603], b: [-0.236, 0.608], ra: 0.0048, rb: 0.0026, dry: 1 },   // short
  { a: [-0.282, 0.576], b: [-0.222, 0.567], ra: 0.0058, rb: 0.0024, dry: 1 },   // long, sloping
  { a: [-0.262, 0.545], b: [-0.243, 0.528], ra: 0.0046, rb: 0.0018, dry: 0.8 }, // a falling tick
];
// brushed arcs: centre, radius, from / to angle (deg, counter-clockwise), width at start / middle / end
const ARCS = [];
function d2arc(x, y, A) {
  const span = (A.a1 - A.a0) * Math.PI / 180, a0 = A.a0 * Math.PI / 180;
  let rel = Math.atan2(y - A.c[1], x - A.c[0]) - a0; rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (rel > span) rel = rel - span < 2 * Math.PI - rel ? span : 0;
  const t = rel / span, w = t < 0.5 ? A.w[0] + (A.w[1] - A.w[0]) * ss(0, 0.5, t) : A.w[1] + (A.w[2] - A.w[1]) * ss(0.5, 1, t);
  const px = A.c[0] + Math.cos(a0 + rel) * A.R, py = A.c[1] + Math.sin(a0 + rel) * A.R;
  const s = Math.hypot(x - A.c[0], y - A.c[1]) - A.R;
  return { d: Math.hypot(x - px, y - py) - w, t, s };
}
function inkD(x, y) {
  let d = 1;
  if (Math.abs(x) < 0.12 && y > 0.7) {
    // the left eye: a heavy brush dot; a seal dot on the brow above the crescent
    d = Math.min(L.d2ellipse(x, y, -0.041, 0.797, 0.0118, 0.0142), L.d2ellipse(x, y, 0.043, 0.799, 0.0112, 0.0136), L.d2circle(x, y, 0.0, 0.884, 0.0062));
    for (let i = 0; i < ARCS.length; i++) {
      const r = d2arc(x, y, ARCS[i]);
      let q = r.d;
      if (FULL && r.t > 0.6) q += ARCS[i].dry * 0.0035 * ((r.t - 0.6) / 0.4) * Math.max(0, Math.sin(r.s / 0.0024 * Math.PI * 2 + i * 2.1));
      if (q < d) d = q;
    }
  }
  for (let i = 0; i < STROKES.length; i++) {
    const s = STROKES[i];
    if (Math.abs(x - (s.a[0] + s.b[0]) / 2) > 0.13 || Math.abs(y - (s.a[1] + s.b[1]) / 2) > 0.13) continue;
    const r = L.d2stroke(x, y, s.a, s.b, s.ra, s.rb);
    let q = r.d;
    // dry brush: the bristles part toward the end of the stroke
    if (FULL && r.t > 0.4) q += s.dry * 0.0045 * ((r.t - 0.4) / 0.6) * Math.max(0, Math.sin(r.s / 0.0026 * Math.PI * 2 + i * 1.7));
    if (q < d) d = q;
  }
  return d;
}
function sealD(x, y) {
  if (Math.abs(x - 0.012) > 0.05 || Math.abs(y - 0.575) > 0.05) return 1;
  const cres = Math.max(L.d2circle(x, y, 0.004, 0.575, 0.021), -L.d2circle(x, y, 0.013, 0.583, 0.019));
  return Math.max(L.d2circle(x, y, 0.012, 0.575, 0.034), -cres);
}

// ------------------------------------------------------------------------------------------------------ paint
function paintWashi(c) {
  const { x, y, z, nz, cavity } = c;
  const up = z - F(x, y);
  let col = C('#f8f0de');
  col = mix(col, C('#ebdcc0'), ss(-0.05, 0.5, P.fbm(x * 18, y * 18, 0, 5, 3)) * 0.55);       // washi clouding
  if (!FAR) col = mix(col, C('#fffaf0'), ss(0.2, 0.6, P.fbm(x * 35, y * 150, 0.5, 8, 2)) * 0.45); // fibres (long, vertical)
  col = mix(col, C('#e2cfa8'), ss(0.28, 0.0, y) * 0.45);                                      // carried: dirtier at the feet
  col = mix(col, C('#c48f52'), ss(0.045, 0.011, burn(x, y)) * 0.8);                          // browned before the char
  // fold lines: a worn crease shows as a thin grey-brown line with a bright lip beside it (spine, waist, chest, shoulders)
  {
    const fw = FAR ? 0.004 : 0.0022;
    const creases = [Math.abs(x), Math.abs(y - 0.4), Math.abs(y - 0.6) + (Math.abs(x) > 0.2 ? 1 : 0), Math.abs(Math.abs(x) - 0.15) + (y < 0.4 ? 1 : 0)];
    const wear = [0.38, 0.36, 0.22, 0.26];
    for (let i = 0; i < creases.length; i++) {
      const q = creases[i], br = 0.75 + 0.25 * P.fbm(x * 40 + i, y * 40, 0, 4, 2);
      col = mix(col, C('#a89474'), ss(fw, 0, q) * wear[i] * br);
      col = mix(col, C('#fffaf0'), ss(fw * 2.6, fw * 1.4, q) * ss(fw * 0.9, fw * 1.4, q) * 0.5);
    }
  }
  if (up < 0) {
    // (rev 2) the back is the same paper a step darker; face and seal show through, mirrored, at about a quarter
    col = col.map((v) => v * 0.9);
    if (sealD(x, y) < 0.0) col = mix(col, C('#d63a28'), 0.25);
    else if (inkD(x, y) < 0.0) col = mix(col, C('#1d1823'), 0.25);
  }
  if (Math.abs(nz) < 0.45) col = mix(col, C('#d9c8a6'), 0.7);                                 // the cut edge of the card
  return mix(col, C('#b8a68a'), cavity * 0.4);
}
function paintChar(c) {
  const b = burn(c.x, c.y);
  let col = mix(C('#18110e'), C('#4a2c1a'), ss(0.0, 0.005, b));
  col = mix(col, C('#9a6634'), ss(0.005, 0.011, b));
  return col;
}
function paintInk(c) {
  const { x, y } = c;
  return mix(C('#1d1823'), C('#3a3341'), ss(0.3, 0.8, P.fbm(x * 120, y * 120, 0, 4, 2)) * 0.6);
}
function paintSeal(c) {
  const { x, y } = c;
  return mix(C('#d63a28'), C('#e9765c'), ss(0.25, 0.75, P.fbm(x * 90, y * 90, 0, 5, 2)) * 0.5);
}

  const K = { F, burn, inkD, sealD, dO, T, INKH, FULL, FAR, DOG, paintWashi, paintChar, paintInk, paintSeal };
  KITS.set(DET, K);
  return K;
}

export default {
  name: 'shade_paper', id: 'sculpt_shade_paper',
  gameScale: 0.62,
  backlit: 0.55,                           // sheets: the game's back-light translucency on the paper (look.trans)
  sheetLift: 0.7,                          // TYPES.paper hover: it floats 0.7 m up
  voxel: 0.0011,
  ground: null,
  aoRange: 0.04, aoStrength: 0.35, cavity: [0.002, 0.01], cavityDark: 0.2,
  creaseAngle: 35, bandSlack: 0.012, hardAngle: 40,
  materials: {
    paper: { name: 'Hitogata', surface: 'paper', look: { trans: 0.55, rim: 0.35, wrap: 0.6 } },
  },
  lodNames: ['BOSS', 'LOD0', 'LOD1'],
  pieces: [
    { key: 'paper', node: 'Hitogata', lods: [14000, 4000, 1200], detail: ['full', 'mid', 'far'], voxelMul: [1, 1.15, 2.4], lodError: [0.0005, 0.0011, 0.0028], mesh: paperMesh },
  ],
  anchors: { head: [0, 0.805, 0.012], seal: [0.012, 0.575, 0.004] },
  notes: '纸魅 paper shade: static mesh Hitogata (LOD0 4k, LOD1 1.2k) for makeHitogata + BOSS 14k LOD; vertex colours. See .tmp/sculpt/shade_jelly/INSTALL.md.',

  build({ S }) {
    const { F, burn, inkD, sealD, dO, T, INKH, paintWashi, paintChar, paintInk, paintSeal } = kit(process.env.JP_DETAIL || 'full');
    const pW = S.part('washi', { mat: 'paper', paint: paintWashi });
    const pC = S.part('char', { mat: 'paper', paint: paintChar });
    const pI = S.part('ink', { mat: 'paper', paint: paintInk });
    const pS = S.part('seal', { mat: 'paper', paint: paintSeal });
    const e = 0.0005;
    const f = (x, y, z) => {
      const d2 = dO(x, y);
      if (d2 > 0.01) return d2;
      const z0 = F(x, y);
      const gx = (F(x + e, y) - F(x - e, y)) / (2 * e), gy = (F(x, y + e) - F(x, y - e)) / (2 * e), k = 1 / Math.sqrt(1 + gx * gx + gy * gy);
      const up = z - z0;
      let top = T / 2;
      if (up > 0) { const di = Math.min(inkD(x, y), sealD(x, y)); if (di < 0.002) top += INKH * clamp(0.5 - di / 0.0012, 0, 1); }
      const dz = (up >= 0 ? up - top : -up - T / 2) * k;
      return Math.max(d2, dz);
    };
    const pf = (x, y, z) => {
      if (burn(x, y) < 0.011) return pC;
      if (z - F(x, y) > 0) { if (sealD(x, y) < 0) return pS; if (inkD(x, y) < 0) return pI; }
      return pW;
    };
    return new S.Shape(f, [-0.345, -0.012, -0.11, 0.345, 0.935, 0.075], pf, 1.2);
  },

  async before() { return L.beforePaper(); },
  async look({ R, lodM, save, sb, sc, gs, scaleMeshes, quick }) {
    const ts = quick ? 380 : 560, tiles = [];
    const boss = lodM(0), lod0 = lodM(1), lod1 = lodM(2);
    const head = [0, 0.78, 0];
    tiles.push({ img: R.render(boss, R.orbit(head, 8, 4, 0.55, 35, ts, ts), { ground: false }), label: 'BOSS LOD - FACE CLOSE' });
    tiles.push({ img: R.render(lod0, R.orbit(head, 8, 4, 0.55, 35, ts, ts), { ground: false }), label: 'LOD0 - FACE CLOSE' });
    tiles.push({ img: R.render(boss, R.orbit([0.2, 0.08, 0], 25, 10, 0.5, 35, ts, ts), { ground: false }), label: 'BOSS - BURNT FOOT' });
    tiles.push({ img: R.render(boss, R.orbit([0.0, 0.47, 0], 200, 8, 2.1, 35, ts, ts), { ground: false }), label: 'BOSS - BACK' });
    tiles.push({ img: R.render(boss, R.orbit([0.0, 0.47, 0], 70, 8, 2.1, 35, ts, ts), { ground: false }), label: 'BOSS - SIDE 70' });
    // the boss as the game draws it now: shade tint (deep violet body)
    const shade = boss.map((m) => ({ ...m, col: m.col.map((v, i) => v * [0.32, 0.22, 0.55][i % 3]) }));
    tiles.push({ img: R.render(shade, R.orbit([0.0, 0.47, 0], 20, 8, 2.1, 35, ts, ts), { ground: false }), label: 'BOSS x SHADE TINT' });
    void lod1; void sb; void sc; void gs; void scaleMeshes;
    save('look.png', R.sheet(tiles, 3, { title: 'shade_paper LOOK - BOSS LOD DETAIL, LOD0, SHADE TINT' }));
  },
};

// ---------------------------------------------------------------------------------------------- (rev 2) even remesh
/** the doll meshed evenly in 2D (cut, ink, seal and char borders, fold lines), then folded: no slivers */
function paperMesh(detail, target, log) {
  const K = kit(detail);
  const sp = { full: [0.0056, 0.0021, 0.0004, 0.02], mid: [0.0125, 0.0046, 0.0008, 0.035], far: [0.027, 0.0125, 0.0015, 0.09] }[detail];
  const [sO, sI, g, h0] = sp;
  const contours = [
    { f: K.inkD, box: [-0.1, 0.72, 0.1, 0.9], sp: sI },
    { f: K.sealD, box: [-0.04, 0.53, 0.06, 0.62], sp: Math.min(sI, 0.0068) },
    { f: (x, y) => K.burn(x, y) - 0.011, box: [0.06, -0.04, 0.33, 0.14], sp: Math.max(sI, sO * 0.6) },
  ];
  if (!K.FAR) contours.push({ f: K.inkD, box: [-0.295, 0.5, -0.2, 0.625], sp: sI });
  const ls = sO * (K.FAR ? 2 : 1.4);
  const lines = K.FAR ? [{ a: [0, -0.01], b: [0, 0.935], sp: ls }, { a: [-0.2, 0.4], b: [0.2, 0.4], sp: ls }, { a: [-0.2, 0.6], b: [0.2, 0.6], sp: ls }] : [
    { a: [0, -0.01], b: [0, 0.935], sp: ls }, { a: [-0.2, 0.4], b: [0.2, 0.4], sp: ls }, { a: [-0.2, 0.6], b: [0.2, 0.6], sp: ls },
    { a: [-0.15, 0.4], b: [-0.15, 0.7], sp: ls }, { a: [0.15, 0.4], b: [0.15, 0.7], sp: ls }, { a: [-0.12, 0.68], b: [0.12, 0.68], sp: ls },
    { a: K.DOG.a, b: K.DOG.b, sp: ls * 0.7 },
  ];
  return L.sheetMeshTarget((h) => L.sheetMesh({ dO: K.dO, F: K.F, T: K.T, box: [-0.345, -0.035, 0.345, 0.95], g, sO, h, hMin: sI, contours, lines }), target, h0, log);
}
