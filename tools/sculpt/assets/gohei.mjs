// GOHEI — the heroine's ritual wand (replaces assets/models/chars/prop_gohei.glb). Origin = the grip, the wand runs along +Y
// (docs/api/animation.md), y -0.12 .. 0.39 like the old one; streamers hang on +X (L) and -X (R), the bells face +Z.
// SILHOUETTE: a slim pale staff that ends in a split top, a mirror pair of lightning-stepped paper streamers hanging nearly
//   straight (a breath of wind drifts the tips back), a small red-and-gold knot of bells under the paper.
// BIG / MEDIUM / SMALL: the staff and the two streamers / the indigo grip wrap, brass ferrule and collar, the bell knot /
//   shaving facets, the dent, the bell slits, the tassel strands.
// EYE RESTS ON: the split top with the paper band through it, the gold bells on the red cord, the curled streamer tips.
// WEAR: the white wood is handled grey-brown just above and below the wrap, the wrap is rubbed pale where her thumb sits,
//   the ferrule is dented and scuffed from being planted on stone, the paper tips yellowed and one edge nicked.
// MUST NOT LOOK LIKE: a cylinder with flat cards; a symmetric trophy; detail spread evenly (the middle of the staff is calm).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../sdf.mjs';
import { readGLB } from './gohei_look.mjs';

const DEG = Math.PI / 180;
// world = M * local, M = Rz * Ry * Rx — the kit's turn() convention (sdf.mjs rotMat)
function rot(ax, ay, az) {
  const cx = Math.cos(ax * DEG), sx = Math.sin(ax * DEG), cy = Math.cos(ay * DEG), sy = Math.sin(ay * DEG), cz = Math.cos(az * DEG), sz = Math.sin(az * DEG);
  const m3 = (A, B) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]); return o; };
  return m3([cz, -sz, 0, sz, cz, 0, 0, 0, 1], m3([cy, 0, sy, 0, 1, 0, -sy, 0, cy], [1, 0, 0, 0, cx, -sx, 0, sx, cx]));
}
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

// ---------------------------------------------------------------------------------------------------- streamer layout
const T = 0.0016;                       // paper thickness ~1.5 mm (2.7 voxels at 0.6 mm), edges fully rounded
// lightning zigzag: four panels stepping out / back / out / back, the pair mirror-symmetric about the staff
const STEPS = { c: [0.022, 0.035, 0.022, 0.035], w: [0.024, 0.023, 0.022, 0.021], h: [0.068, 0.068, 0.066, 0.064] };
const OVER = 0.008;                    // a segment's hinge sits this far above the previous segment's bottom edge
const GAP = 0.0055;                     // z offset between successive segments (they overlap 4 mm in height)
// rest pose: within ~4 degrees of vertical, the bottom drifting a little back and out (a breeze from the front)
const SWAY = { ax: [1.5, 2.5, 3.5], ay: [-3, 3, -2], az: [1, 1.5, 2.5] };
const SIDES = {
  L: { sx: 1, ax: SWAY.ax, ay: SWAY.ay, az: SWAY.az },
  R: { sx: -1, ax: SWAY.ax, ay: SWAY.ay.map((v) => -v), az: SWAY.az.map((v) => -v) },   // exact mirror of L
};
const TOP = [0, 0.3775, 0.0036];       // first segment's hinge (x = step centre * side), just in front of the paper band
/** anchors (world, rest pose) + rotation per segment */
export function shideLayout() {
  const out = {};
  for (const [S, cfg] of Object.entries(SIDES)) {
    let A = [cfg.sx * STEPS.c[0], TOP[1], TOP[2]];
    const segs = [];
    for (let k = 0; k < 3; k++) {
      const M = rot(cfg.ax[k], cfg.ay[k], cfg.az[k]);
      segs.push({ name: `shide_${S}_${k + 1}`, A, M, ax: cfg.ax[k], ay: cfg.ay[k], az: cfg.az[k] });
      if (k < 2) {
        const off = [cfg.sx * (STEPS.c[k + 1] - STEPS.c[k]), -STEPS.h[k] + OVER, k === 0 ? GAP : -GAP];
        const d = mv(M, off); A = [A[0] + d[0], A[1] + d[1], A[2] + d[2]];
      }
    }
    out[S] = segs;
  }
  return out;
}
const LAYOUT = shideLayout();
const KNOT = [0.0004, 0.3315, 0.0098];   // sinks 0.6 mm into the staff
const BELLS = [[-0.0068, 0.3025, 0.0158], [0.0066, 0.2985, 0.0166], [0.0006, 0.2885, 0.0224]];   // >= 2.5 mm apart
const ANCHORS = {};
for (const S of ['L', 'R']) for (const s of LAYOUT[S]) ANCHORS[s.name] = s.A.map((v) => +v.toFixed(5));

const MATS = {
  wood: { name: 'Wood', surface: 'wood', look: { detail: 0.15, bump: 0.2, fine: 0 } },
  brass: { name: 'Brass', surface: 'metal', look: { spec: 0.5, specPower: 40, detail: 0, bump: 0, fine: 0 } },
  gold: { name: 'Gold', surface: 'metal', look: { spec: 0.6, specPower: 48, detail: 0, bump: 0, fine: 0 } },
  cord: { name: 'Cord', surface: 'cloth', look: { detail: 0, bump: 0, fine: 0 } },
  redcord: { name: 'RedCord', surface: 'cloth', look: { detail: 0, bump: 0, fine: 0 } },
  paper: { name: 'Paper', surface: 'paper', look: { trans: 0.35, detail: 0, bump: 0, fine: 0 } },
};
for (const S of ['L', 'R']) for (let k = 1; k <= 3; k++) MATS[`shide${S}${k}`] = { name: `Shide${S}${k}`, surface: 'paper', look: { trans: 0.35, detail: 0, bump: 0, fine: 0 } };

export default {
  name: 'gohei',
  id: 'sculpt_prop_gohei',
  voxel: 0.0006,
  lods: [3500, 1200, 400],
  lodError: [0.0008, 0.0045, 0.012],
  atlas: 512,
  ground: null,
  aoRange: 0.02,
  aoStrength: 0.5,          // the thin paper between the panels was going uniformly grey from AO
  cavity: [0.0015, 0.006],
  bandSlack: 0.004,
  creaseAngle: 55,
  materials: MATS,
  anchors: { grip: [0, 0, 0], ...ANCHORS },
  notes: 'Sculpted gohei. Origin = grip, +Y along the wand (same as prop_gohei). Streamers are six separate segment meshes under the chained anchor nodes shide_L_1..3 / shide_R_1..3 (rest pose baked). LOD0 colour atlas + object-space normal map; LOD1/2 vertex colours. See .tmp/sculpt/gohei/INSTALL.md.',

  build({ S }) {
    // ---- staff: hand-shaved, nine uneven facets that wander along the length, a slight taper, split top
    const R = (y) => 0.0099 + (0.0079 - 0.0099) * Math.min(1, Math.max(0, (y + 0.12) / 0.505));
    const NF = 9, rnd = S.prng(5), fa = [], fo = [];
    for (let k = 0; k < NF; k++) { fa.push((k / NF) * 2 * Math.PI + (rnd() - 0.5) * 0.25); fo.push(1 + (rnd() - 0.5) * 0.08); }
    const cs = Math.cos(Math.PI / NF), sm = 0.00035;
    const staffF = (x, y, z) => {
      const r = R(y) * cs;
      let m = -1e9; const v = new Array(NF);
      for (let k = 0; k < NF; k++) { v[k] = x * Math.sin(fa[k]) + z * Math.cos(fa[k]) - r * fo[k] - 0.0003 * S.noise3(y * 14, k * 3.7, 1.3); if (v[k] > m) m = v[k]; }
      let s = 0; for (let k = 0; k < NF; k++) s += Math.exp((v[k] - m) / sm);
      const dxz = m + sm * Math.log(s) - sm * 0.5;
      return Math.max(dxz, -0.106 - y, y - 0.386);
    };
    let staff = new S.Shape(staffF, [-0.012, -0.11, -0.012, 0.012, 0.39, 0.012]);
    // the split: a slot along X through the top (the paper band passes through it), the two tines slightly chamfered
    // slot 4 mm wide so the 1.6 mm band sits in it with a clear 1.2 mm each side (no near-touching surfaces)
    staff = staff.softCut(S.box([0.03, 0.06, 0.004]).at(0, 0.379, 0), 0.0006);
    staff = staff.wear(0.0012, { vary: 0.4, seed: 4, scale: 0.02 });
    staff = staff.part('staff', { mat: 'wood', paint: paintWood });

    // ---- grip: indigo cord wound in a tight helix, a binding ring at each end
    const pitch = 0.0026, rc = 0.00125;
    const wrapF = (x, y, z) => {
      const rho = Math.hypot(x, z), th = Math.atan2(x, z);
      const Rc = R(y) * 0.985 + rc * 0.55;
      const u = y - (pitch * th) / (2 * Math.PI);
      const v = ((u % pitch) + pitch) % pitch - pitch / 2;
      let d = Math.hypot(rho - Rc, v) - rc;
      const sleeve = rho - (Rc - rc * 0.3), kk = 0.0004, hh = Math.max(0, Math.min(1, 0.5 + 0.5 * (sleeve - d) / kk));
      d = sleeve * (1 - hh) + d * hh - kk * hh * (1 - hh);
      return Math.max(d, Math.abs(y - 0.008) - 0.052);
    };
    const wrap = new S.Shape(wrapF, [-0.014, -0.046, -0.014, 0.014, 0.062, 0.014]);
    const bind = S.torus(0.0113, 0.0016).at(0, -0.0442, 0).add(S.torus(0.0110, 0.0016).at(0, 0.0602, 0));   // centred on the wrap's cut ends
    const grip = wrap.add(bind).part('grip', { mat: 'cord', paint: paintGrip });

    // ---- brass: the ferrule on the butt (dented, scuffed) and the collar that keeps the split from running
    let ferrule = S.lathe([[0, -0.1205], [0.0085, -0.1205], [0.0104, -0.118], [0.0109, -0.112], [0.0109, -0.1], [0.0113, -0.0985], [0.0113, -0.0965], [0.0104, -0.0955], [0, -0.0955]]);
    ferrule = ferrule.pinch([0.0098, -0.109, 0.0045], 0.0045, 0.0009);
    const collar = S.lathe([[0.0074, 0.3405], [0.0093, 0.3408], [0.0098, 0.3425], [0.0098, 0.3455], [0.0093, 0.3472], [0.0074, 0.3475]]);
    const brass = ferrule.add(collar).part('brass', { mat: 'brass', paint: paintBrass });

    // ---- paper band through the slot, its ends folded down a little outside each tine
    const tabs = sheet([[0.379, -0.0002], [0.3715, -0.001], [0.3655, -0.0006]], 0.0097, 0.0127, T, 0).mirror('x');
    const paperTop = sheet([[0.3796, 0], [0.3690, 0]], -0.0127, 0.0127, T, 0).add(tabs).part('paperTop', { mat: 'paper', paint: paintPaper });

    // ---- the streamers: three segments each, chained, rest pose
    const streams = [];
    for (const side of ['L', 'R']) {
      const cfg = SIDES[side];
      LAYOUT[side].forEach((seg, k) => {
        let s = segmentShape(S, k, cfg.sx);
        s = s.turn(seg.ax, seg.ay, seg.az).at(seg.A[0], seg.A[1], seg.A[2]);
        streams.push(s.part(`shide_${side}${k + 1}`, { mat: `shide${side}${k + 1}`, paint: shidePaint(seg, k, cfg.sx) }));
      });
    }

    // ---- red cord tied under the collar, a knot in front, three gold bells and a tassel
    const knot = KNOT;
    // contacts either sink >= 0.6 mm in or stay >= 1.2 mm clear (near-touching surfaces gave the non-manifold edges)
    const turns = S.torus(0.0083, 0.0011).at(0, 0.3325, 0).add(S.torus(0.0083, 0.0011).at(0, 0.3352, 0).turn(0, 0, 2));
    const knotS = S.ellipsoid([0.0029, 0.0025, 0.0023]).at(...knot);
    const bells = BELLS;
    const BR = 0.0051;
    let cords = turns.add(knotS);
    for (const b of bells) cords = cords.add(S.tube([knot, [(knot[0] + b[0]) / 2, (knot[1] + b[1]) / 2 + 0.003, (knot[2] + b[2]) / 2 + 0.001], [b[0], b[1] + BR + 0.0022, b[2]]], 0.00078));
    const th = [0.0016, 0.2785, 0.0142];
    cords = cords.add(S.tube([knot, [0.0012, 0.31, 0.0128], [0.0016, 0.29, 0.0134], [th[0], th[1] + 0.003, th[2]]], 0.00078));
    const tasselHead = S.ellipsoid([0.0028, 0.0037, 0.0028]).at(...th);
    let strands = S.lathe([[0, 0.0002], [0.0024, 0.0002], [0.0033, -0.008], [0.0040, -0.022], [0.0036, -0.0265], [0, -0.027]], { smooth: 0.0003 });
    strands = strands.softCut(S.box([0.0013, 0.03, 0.004]).at(0, -0.017, 0.0044).around(9), 0.0003);   // slits >= 2 voxels wide
    strands = strands.turn(0, 0, 7).at(th[0], th[1] - 0.003, th[2]);
    const red = cords.add(tasselHead).add(strands).part('redCord', { mat: 'redcord', paint: paintRed });
    let bellS = null;
    bells.forEach((b, i) => {
      let bell = S.sphere(BR).add(S.torus(BR * 0.98, 0.00045));
      bell = bell.cut(S.box([0.0015, 0.0065, 0.02]).at(0, -0.0042, 0)).cut(S.sphere(0.0012).at(0, -0.0012, BR)).cut(S.sphere(0.0012).at(0, -0.0012, -BR));
      bell = bell.add(S.torus(0.0015, 0.00065).turn(90, 0, 0).at(0, BR + 0.0011, 0));
      bell = bell.turn(8 * (i - 1), 30 * i - 20, 0).at(...b);
      bellS = bellS ? bellS.add(bell) : bell;
    });
    bellS = bellS.part('bells', { mat: 'gold', paint: paintGold });

    return S.union(staff, grip, brass, paperTop, red, bellS, ...streams);
  },

  async before({ ROOT }) {
    return { meshes: readGLBMeshes(path.join(ROOT, 'assets/models/chars/prop_gohei.glb')) };
  },
};

// ------------------------------------------------------------------------------------------------------- paper helpers
/** a bent sheet of paper: side profile [[y, z], ...] (polyline), width x0..x1, thickness t, a soft vertical crease that
 *  bows the middle forward by `bow`. Distance to the zero-thickness ribbon minus t/2, so every edge is fully rounded. */
function sheet(profile, x0, x1, t, bow = 0) {
  const xc = (x0 + x1) / 2, hw = (x1 - x0) / 2, r = t * 0.5;
  let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [y, z] of profile) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const f = (x, y, z) => {
    const u = Math.min(1, Math.abs(x - xc) / hw);
    const zz = z - bow * (1 - Math.sqrt(u * u + 0.006)) / (1 - Math.sqrt(0.006));   // soft fold crease down the middle
    let best = 1e9;
    for (let i = 0; i + 1 < profile.length; i++) {
      const [ay, az] = profile[i], [by, bz] = profile[i + 1];
      const dy = by - ay, dz = bz - az, l2 = dy * dy + dz * dz;
      const h = l2 > 0 ? Math.min(1, Math.max(0, ((y - ay) * dy + (zz - az) * dz) / l2)) : 0;
      const d = Math.hypot(y - ay - dy * h, zz - az - dz * h); if (d < best) best = d;
    }
    return Math.hypot(Math.max(Math.abs(x - xc) - hw, 0), best) - r;
  };
  const m = t + Math.abs(bow) + 0.001;
  return new P.Shape(f, [x0 - m, y0 - m, Math.min(z0, z0 + bow) - m, x1 + m, y1 + m, Math.max(z1, z1 + bow) + m]);
}
/** the fold at the top of segment k (k>0): a short band in the segment's own plane reaching back over the previous
 *  segment's bottom, rolled like a real paper fold, so the two read as one strip folded sideways (the lightning step) */
function foldLip(k, sx) {
  const { c, w } = STEPS, back = -sx * (c[k] - c[k - 1]);
  const x0 = Math.min(back - w[k - 1] / 2, -w[k] / 2), x1 = Math.max(back + w[k - 1] / 2, w[k] / 2);
  return sheet([[0.0035, 0.0001], [0.0005, 0.0011], [-0.0035, 0.0014], [-0.0072, 0.0009]], x0, x1, T, 0.0008);
}
/** segment k of a streamer in its hinge frame (hinge = top centre, hanging down -Y, side sx) */
function segmentShape(S, k, sx) {
  const { c, w, h } = STEPS;
  if (k < 2) {
    const prof = [[0.0035, 0], [-h[k] * 0.35, 0.0009], [-h[k] * 0.7, 0.0004], [-h[k] + 0.0012, 0.0008]];
    let s = sheet(prof, -w[k] / 2, w[k] / 2, T, 0.0032);
    if (k > 0) s = s.add(foldLip(k, sx));
    return s;
  }
  // last segment: step 3, a fold forward, step 4 whose tip turns a little forward (the only part that curls)
  const h3 = h[2], h4 = h[3], dx = sx * (c[3] - c[2]);
  const p3 = [[0.0035, 0], [-h3 * 0.4, 0.001], [-h3 + 0.003, 0.0004], [-h3 + 0.0004, 0.0021], [-h3 + 0.0022, 0.0042]];
  const s3 = sheet(p3, -w[2] / 2, w[2] / 2, T, 0.003).add(foldLip(2, sx));
  const y0 = -h3 + 0.003, yb = y0 - h4;
  const p4 = [[y0, 0.0042], [y0 - 0.02, 0.0052], [y0 - 0.042, 0.0048], [yb + 0.008, 0.0048], [yb + 0.003, 0.006], [yb + 0.0006, 0.0082], [yb + 0.0014, 0.0104]];
  const s4 = sheet(p4, dx - w[3] / 2, dx + w[3] / 2, T, 0.0028);
  return s3.add(s4);
}
/** paper paint for one streamer segment: the two faces of each crease differ in value (outer face cool grey, inner face
 *  paper white), fold lips a shade cooler, and the back of the paper stays light and warm (light comes through washi) */
function shidePaint(seg, k, sx) {
  const M = seg.M, A = seg.A, { c, h } = STEPS;
  const toL = (v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
  return (q) => {
    const l = toL([q.x - A[0], q.y - A[1], q.z - A[2]]), ln = toL([q.nx, q.ny, q.nz]);
    const xc = k === 2 && l[1] < -h[2] + 0.002 ? sx * (c[3] - c[2]) : 0;
    const outer = P.ss(-0.0012, 0.0012, (l[0] - xc) * sx);
    const back = P.ss(0.15, -0.35, ln[2]);
    let col = paintPaper({ ...q, cavity: q.cavity * 0.4, edge: 0 });
    col = P.mix(col, P.color('#c8cfd8'), outer * (0.75 - 0.3 * back));   // the fold's outer face: cool grey
    const lip = k > 0 ? P.ss(-0.008, -0.005, l[1]) * P.ss(0.0004, 0.0012, l[2]) : 0;
    col = P.mix(col, P.color('#e3e2dc'), lip * 0.5);
    col = P.mix(col, P.color('#fff1d6'), back * (1 - outer) * 0.7);          // back, inner face: warm, light comes through
    col = P.mix(col, P.color('#c6ccd6'), back * outer * 0.45);               // back, outer face: the cool one
    col = P.mix(col, P.color('#ffffff'), q.edge * 0.3);
    // thin paper scatters light: undo ~70 % of the AO / cavity darkening the bake multiplies in afterwards
    const kk = (1 - 0.5 * (1 - (q.ao ?? 1))) * (1 - 0.45 * (q.cavity ?? 0)), lift = 1 / (1 - 0.7 * (1 - kk));
    return col.map((v) => Math.min(1.35, v * lift));
  };
}

// ----------------------------------------------------------------------------------------------------------- paint
function grain(x, y, z) { return P.fbm(x * 260, y * 9, z * 260, 3, 3); }
function paintWood(c) {
  const { x, y, z, cavity, edge } = c;
  // pale white wood with a faint straight grain
  let col = P.mix(P.color('#eadfc4'), P.color('#d9c7a2'), P.ss(-0.3, 0.6, grain(x, y, z)));
  col = P.mix(col, P.color('#c9b48c'), P.ss(0.35, 0.7, P.fbm(x * 600, y * 30, z * 600, 9, 2)) * 0.35);
  // handled: grey-brown just above and below the wrap, fading out along the staff; the butt end darker from the ground
  const hand = P.ss(0.12, 0.065, Math.abs(y - 0.008)) * 0.75;
  const ground = P.ss(-0.06, -0.1, y) * 0.5;
  col = P.mix(col, P.color('#a99271'), Math.max(hand, ground));
  // the split top: cut faces fresher, the tine tips rubbed pale
  col = P.mix(col, P.color('#f3ead6'), edge * 0.6);
  col = P.mix(col, P.color('#8f7a5a'), cavity * 0.6);
  return col;
}
function paintGrip(c) {
  const { x, y, z, cavity, edge } = c;
  let col = P.mix(P.color('#2f355c'), P.color('#3c4572'), 0.5 + 0.5 * P.fbm(x * 300, y * 300, z * 300, 2, 2));
  // her thumb sits on the +Z/+X side: rubbed paler and a little shiny there
  const thumb = P.ss(0.2, 0.9, (z * 0.7 + x * 0.7) / 0.011) * P.ss(0.05, 0.0, Math.abs(y - 0.02));
  col = P.mix(col, P.color('#6a72a0'), thumb * 0.55);
  col = P.mix(col, P.color('#7d86b4'), edge * 0.45);
  return P.mix(col, P.color('#171a2e'), cavity * 0.7);
}
function paintBrass(c) {
  const { x, y, z, cavity, edge, ny } = c;
  let col = P.mix(P.color('#b88a3a'), P.color('#cfa24e'), 0.5 + 0.5 * P.fbm(x * 400, y * 400, z * 400, 4, 2));
  // tarnish in the crevices and around the dent, scuffed bright on the butt and the ridge edges
  const dent = P.ss(0.006, 0.002, Math.hypot(x - 0.0098, y + 0.109, z - 0.0045));
  col = P.mix(col, P.color('#6e5426'), Math.max(cavity * 0.8, dent * 0.5));
  col = P.mix(col, P.color('#f2d98e'), Math.max(edge * 0.7, (y < -0.115 ? P.ss(-0.3, -0.9, ny) : 0) * 0.6));
  return col;
}
function paintPaper(c) {
  const { x, y, z, cavity, edge } = c;
  let col = P.color('#fbf7ec');
  col = P.mix(col, P.color('#efe6d0'), P.ss(0.2, 0.8, P.fbm(x * 120, y * 120, z * 120, 6, 3)) * 0.35);
  // the lowest hand-width yellowed by handling and weather
  col = P.mix(col, P.color('#ead9ae'), P.ss(0.165, 0.11, y) * 0.65);
  col = P.mix(col, P.color('#ffffff'), edge * 0.4);
  return P.mix(col, P.color('#c8c4bc'), cavity * 0.5);
}
function paintRed(c) {
  const { x, y, z, cavity, edge } = c;
  let col = P.mix(P.color('#c42d27'), P.color('#d83a30'), 0.5 + 0.5 * P.fbm(x * 500, y * 500, z * 500, 7, 2));
  col = P.mix(col, P.color('#ef6a52'), edge * 0.5);
  return P.mix(col, P.color('#6e1414'), cavity * 0.75);
}
function paintGold(c) {
  const { ny, cavity, edge } = c;
  let col = P.mix(P.color('#d9a640'), P.color('#f3cd6a'), P.ss(-0.4, 0.8, ny));
  col = P.mix(col, P.color('#fff0b8'), edge * 0.6);
  return P.mix(col, P.color('#4a3210'), cavity * 0.9);
}

// --------------------------------------------------------------------------------------------- before: the old GLB
function readGLBMeshes(file) {
  return readGLB(file);
}
// Kit workaround (kitNotes): vertex colours are sampled by position only, so the duplicated vertices on a part border
// (staff under the red cord, staff in the grip wrap) all get the colour of whichever part owns that spot, and on LOD1/2
// long staff triangles then fade from red / indigo across the whole staff. Re-paint border vertices with their own part.
function paintFor(mat, y) {
  if (/^Wood/.test(mat)) return paintWood; if (/^Brass/.test(mat)) return paintBrass; if (/^Gold/.test(mat)) return paintGold;
  if (/^RedCord/.test(mat)) return paintRed; if (/^Cord/.test(mat)) return paintGrip; return paintPaper;
}
function recolourSeams(root) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  for (const mesh of root.listMeshes()) {
    const prims = mesh.listPrimitives().filter((p) => p.getAttribute('COLOR_0'));
    if (!prims.length) continue;
    const key = (a, i) => `${a[i].toFixed(5)},${a[i + 1].toFixed(5)},${a[i + 2].toFixed(5)}`;
    const owners = new Map();
    prims.forEach((p, pi) => { const a = p.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) { const k = key(a, i); const o = owners.get(k) || new Set(); o.add(pi); owners.set(k, o); } });
    prims.forEach((p, pi) => {
      const a = p.getAttribute('POSITION').getArray(), n = p.getAttribute('NORMAL').getArray(), C = p.getAttribute('COLOR_0'), col = C.getArray().slice();
      const mat = p.getMaterial().getName();
      for (let i = 0; i < a.length; i += 3) {
        if (owners.get(key(a, i)).size < 2) continue;
        const c = paintFor(mat, a[i + 1])({ x: a[i], y: a[i + 1], z: a[i + 2], nx: n[i], ny: n[i + 1], nz: n[i + 2], h: 0.5, ao: 1, cavity: 0.15, edge: 0, broad: 0 });
        for (let k = 0; k < 3; k++) col[i + k] = lin(c[k]) * 0.85;
      }
      C.setArray(col);
    });
  }
}

// ------------------------------------------------------------------------------------- hand-laid far LOD (LOD2)
const linC = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function soup() { return { p: [], n: [], c: [] }; }
function tri(g, a, b, c, paint) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
  for (const q of [a, b, c]) {
    const col = paint({ x: q[0], y: q[1], z: q[2], nx: n[0], ny: n[1], nz: n[2], h: 0.5, ao: 1, cavity: 0.1, edge: 0, broad: 0 });
    const shade = 0.82 + 0.12 * n[1];   // a little sky-over-ground so the faces separate at 50 px
    g.p.push(...q); g.n.push(...n); g.c.push(...col.slice(0, 3).map((x) => linC(x) * shade));
  }
}
/** closed prism along Y: rings [[y, r], ...], n sides, phase */
function prism(g, rings, n, paint, ph = 0, cx = 0, cz = 0) {
  const P = rings.map(([y, r]) => Array.from({ length: n }, (_, i) => { const a = ph + (i / n) * 2 * Math.PI; return [cx + r * Math.sin(a), y, cz + r * Math.cos(a)]; }));
  for (let j = 0; j + 1 < P.length; j++) for (let i = 0; i < n; i++) {
    const a = P[j][i], b = P[j][(i + 1) % n], c = P[j + 1][(i + 1) % n], d = P[j + 1][i];
    tri(g, a, b, c, paint); tri(g, a, c, d, paint);
  }
  const bot = [cx, rings[0][0], cz], top = [cx, rings[rings.length - 1][0], cz], L = P.length - 1;
  for (let i = 0; i < n; i++) { tri(g, bot, P[0][(i + 1) % n], P[0][i], paint); tri(g, top, P[L][i], P[L][(i + 1) % n], paint); }
}
/** closed slab: x0..x1, y0..y1, z0..z1 in a frame (M, origin o); 12 tris */
function slab(g, [x0, y0, z0, x1, y1, z1], M, o, paint) {
  const V = (x, y, z) => { const w = mv(M, [x, y, z]); return [w[0] + o[0], w[1] + o[1], w[2] + o[2]]; };
  const c = [V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0), V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1)];
  const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  for (const [a, b, cc, d] of f) { tri(g, c[a], c[b], c[cc], paint); tri(g, c[a], c[cc], c[d], paint); }
}
function setPrim(prim, g) {
  prim.getAttribute('POSITION').setArray(new Float32Array(g.p));
  prim.getAttribute('NORMAL').setArray(new Float32Array(g.n));
  prim.getAttribute('COLOR_0').setArray(new Float32Array(g.c));
  prim.getIndices().setArray(Uint16Array.from({ length: g.p.length / 3 }, (_, i) => i));
}
function buildFarLOD(doc, root, byName) {
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1], O = [0, 0, 0];
  const R = (y) => 0.0099 + (0.0079 - 0.0099) * Math.min(1, Math.max(0, (y + 0.12) / 0.505));
  const G = { Wood: soup(), Cord: soup(), Brass: soup(), Paper: soup() };
  prism(G.Wood, [[-0.0955, R(-0.0955)], [0.2, R(0.2)], [0.386, R(0.386)]], 6, paintWood, 0.3);
  prism(G.Cord, [[-0.047, R(-0.047) + 0.0018], [0.063, R(0.063) + 0.0018]], 6, paintGrip, 0.3);
  prism(G.Brass, [[-0.1205, 0.0095], [-0.0955, 0.0113]], 6, paintBrass, 0.3);
  prism(G.Brass, [[0.3405, 0.0097], [0.3475, 0.0097]], 6, paintBrass, 0.3);
  // the bell knot as one warm lump in front (gold over red) so the far wand keeps its single spot of colour
  prism(G.Cord, [[0.272, 0.0004], [0.284, 0.0034], [0.333, 0.0022]], 4, () => P.color('#c42d27'), 0, 0.001, 0.0135);
  prism(G.Brass, [[0.287, 0.0006], [0.296, 0.0085], [0.307, 0.0006]], 5, () => P.color('#e6b850'), 0.2, 0.0, 0.0165);
  slab(G.Paper, [-0.0135, 0.3686, -0.0012, 0.0135, 0.3804, 0.0012], I, O, paintPaper);
  setPrimsByMat(byName('gohei_LOD2').getMesh(), G);
  layStreamers(doc, byName, 2);
}
/** hand-laid streamer segments for LOD li (1: each panel two halves creased forward, 2: one slab) */
function layStreamers(doc, byName, li) {
  const { c, w, h } = STEPS, t = li === 2 ? 2 * T : 1.4 * T;
  for (const S of ['L', 'R']) LAYOUT[S].forEach((seg, k) => {
    const g = soup(), sx = SIDES[S].sx;
    const sp = shidePaint(seg, k, sx), ow = (q) => sp({ ...q, x: q.x + seg.A[0], y: q.y + seg.A[1], z: q.z + seg.A[2], edge: 0 }).map((v) => Math.min(1, v));
    const panel = (x0, y0, x1, y1, z) => {
      if (li === 2) return slab(g, [x0, y0, z, x1, y1, z + t], seg.M, [0, 0, 0], ow);
      // one closed V-section prism: the centre crease bowed 3 mm toward the viewer, 1.4 T thick (no overlapping halves)
      const xm = (x0 + x1) / 2, hw = (x1 - x0) / 2, bw = 0.003;
      const sec = [[xm - hw, z], [xm, z + bw], [xm + hw, z], [xm + hw, z - t], [xm, z + bw - t], [xm - hw, z - t]];
      const V = (q, y) => mv(seg.M, [q[0], y, q[1]]);
      const lo = sec.map((q) => V(q, y0)), hi = sec.map((q) => V(q, y1));
      for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; tri(g, lo[i], lo[j], hi[j], ow); tri(g, lo[i], hi[j], hi[i], ow); }
      for (const [a, b, cc] of [[0, 1, 4], [0, 4, 5], [1, 2, 3], [1, 3, 4]]) { tri(g, lo[a], lo[cc], lo[b], ow); tri(g, hi[a], hi[b], hi[cc], ow); }
    };
    if (k < 2) panel(-w[k] / 2, -h[k] + 0.0012, w[k] / 2, 0.0035, 0.0002);
    else {
      panel(-w[2] / 2, -h[2] + 0.002, w[2] / 2, 0.0035, 0.0002);
      const dx = sx * (c[3] - c[2]), y0 = -h[2] + 0.003;
      panel(dx - w[3] / 2, y0 - h[3] + 0.006, dx + w[3] / 2, y0 + 0.002, 0.004);
      // the curled tip: a short slab turned up and forward
      slab(g, [dx - w[3] / 2, -0.003, -t / 2, dx + w[3] / 2, 0.003, t / 2], mulM(seg.M, rot(-40, 0, 0)), mv(seg.M, [0, y0 - h[3] + 0.0045, 0.0072]), ow);
    }
    if (k > 0) {
      const back = -sx * (c[k] - c[k - 1]);
      slab(g, [Math.min(back - w[k - 1] / 2, -w[k] / 2), -0.0075, 0.0004, Math.max(back + w[k - 1] / 2, w[k] / 2), 0.0035, 0.0004 + t], seg.M, [0, 0, 0], ow);
    }
    let node = byName(`${seg.name}_LOD${li}`);
    if (!node) {   // the simplifier may have dropped a segment entirely: give it a mesh cloned from a sibling's
      const donor = ['L', 'R'].flatMap((q) => LAYOUT[q]).map((o) => byName(`${o.name}_LOD${li}`)).find(Boolean);
      const m2 = doc.createMesh(`${seg.name}_LOD${li}`).addPrimitive(donor.getMesh().listPrimitives()[0].clone());
      node = doc.createNode(`${seg.name}_LOD${li}`).setMesh(m2).setExtras({ lod: li, segment: seg.name });
      byName(seg.name).addChild(node);
    }
    setPrim(node.getMesh().listPrimitives()[0], g);
  });
}
/** a closed n-sided rod from a to b (radius ra -> rb) */
function rod(g, a, b, ra, rb, n, paint) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d), u = d.map((x) => x / L);
  const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let e1 = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
  const l1 = Math.hypot(...e1); e1 = e1.map((x) => x / l1);
  const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
  const ring = (o, r) => Array.from({ length: n }, (_, i) => { const t = (i / n) * 2 * Math.PI, cs = Math.cos(t) * r, sn = Math.sin(t) * r; return [0, 1, 2].map((k) => o[k] + e1[k] * cs + e2[k] * sn); });
  const A = ring(a, ra), B = ring(b, rb);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(g, A[i], A[j], B[j], paint); tri(g, A[i], B[j], B[i], paint); tri(g, a, A[j], A[i], paint); tri(g, b, B[i], B[j], paint); }
}
/** LOD1: the grip wrap and the red cord come out of the simplifier at 313 / 453 tris; lay them by hand (~150) */
function layLOD1Cords(mesh) {
  const R = (y) => 0.0099 + (0.0079 - 0.0099) * Math.min(1, Math.max(0, (y + 0.12) / 0.505));
  const grip = soup(), red = soup();
  // the wrap: an 8-sided sleeve whose rings swell and pinch in a slow spiral so the winding still shows at 300 px
  const rings = [];
  for (let i = 0; i <= 8; i++) { const y = -0.0475 + (i / 8) * 0.111; rings.push([y, R(y) + 0.0019 + (i % 2 ? 0.0004 : 0) + (i === 0 || i === 8 ? 0.0006 : 0)]); }
  prism(grip, rings, 8, paintGrip, 0.2);
  const knot = KNOT, bells = BELLS;
  const pr = () => P.color('#c83229');
  prism(red, [[0.3305, R(0.33) + 0.0004], [0.3365, R(0.336) + 0.0004]], 6, pr, 0.3);      // the turns round the staff
  rod(red, [knot[0], knot[1] - 0.0028, knot[2]], [knot[0], knot[1] + 0.0028, knot[2]], 0.0028, 0.0024, 5, pr);
  for (const b of bells) rod(red, knot, [b[0], b[1] + 0.006, b[2]], 0.0009, 0.0009, 3, pr);
  rod(red, knot, [0.0016, 0.2815, 0.0142], 0.0009, 0.0009, 3, pr);
  rod(red, [0.0016, 0.2815, 0.0142], [0.0019, 0.2515, 0.0142], 0.0026, 0.0038, 6, pr);   // tassel
  for (const prim of mesh.listPrimitives()) {
    const k = /^(\w+?)_/.exec(prim.getMaterial().getName())?.[1];
    if (k === 'Cord') setPrim(prim, grip); else if (k === 'RedCord') setPrim(prim, red);
  }
}
const mulM = (A, B) => { const o = []; for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) o.push(A[r * 3] * B[q] + A[r * 3 + 1] * B[3 + q] + A[r * 3 + 2] * B[6 + q]); return o; };
function setPrimsByMat(mesh, G) {
  for (const prim of mesh.listPrimitives()) {
    const k = /^(\w+?)_/.exec(prim.getMaterial().getName())?.[1];
    if (G[k]) setPrim(prim, G[k]); else { mesh.removePrimitive(prim); prim.dispose(); }
  }
}

// ---------------------------------------------------------------------------- post step: split streamers onto anchors
// node tools/sculpt/assets/gohei.mjs --split   (after build.mjs): moves each Shide<S><k> primitive of every LOD into a
// mesh node `shide_<S>_<k>_LOD<i>` under its anchor, re-expressed in the anchor's frame; chains the anchors
// (shide_X_1 > shide_X_2 > shide_X_3) and gives the segments the shared Paper material of their LOD.
export async function splitStreamers(file) {
  const { NodeIO } = await import('@gltf-transform/core');
  const io = new NodeIO();
  const doc = await io.read(file);
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const byName = (n) => nodes.find((o) => o.getName() === n);
  const top = byName('gohei');
  // chain the anchors
  for (const S of ['L', 'R']) {
    const segs = LAYOUT[S];
    for (let k = 0; k < 3; k++) {
      const a = byName(segs[k].name);
      if (k > 0) {
        const parent = byName(segs[k - 1].name);
        top.removeChild(a); parent.addChild(a);
        a.setTranslation(segs[k].A.map((v, i) => v - segs[k - 1].A[i]));
      }
    }
  }
  for (let li = 0; li < 3; li++) {
    const lodNode = byName(`gohei_LOD${li}`);
    const mesh = lodNode.getMesh();
    const paperMat = mesh.listPrimitives().map((p) => p.getMaterial()).find((m) => /^Paper_paper/.test(m.getName()));
    for (const prim of mesh.listPrimitives()) {
      const mn = prim.getMaterial().getName(), mm = /^Shide([LR])(\d)_/.exec(mn);
      if (!mm) continue;
      const seg = LAYOUT[mm[1]][+mm[2] - 1];
      const pos = prim.getAttribute('POSITION'), arr = pos.getArray().slice();
      for (let i = 0; i < arr.length; i += 3) { arr[i] -= seg.A[0]; arr[i + 1] -= seg.A[1]; arr[i + 2] -= seg.A[2]; }
      pos.setArray(arr);
      const old = prim.getMaterial();
      prim.setMaterial(paperMat);
      if (old !== paperMat && old.listParents().filter((p) => p !== root).length === 0) old.dispose();
      mesh.removePrimitive(prim);
      const m2 = doc.createMesh(`${seg.name}_LOD${li}`).addPrimitive(prim);
      byName(seg.name).addChild(doc.createNode(`${seg.name}_LOD${li}`).setMesh(m2).setExtras({ lod: li, segment: seg.name }));
    }
  }
  recolourSeams(root);
  // LOD2 (far, < 60 px): the simplifier stalls near 530 tris on thin paper (fold limit), so the far mesh is laid by hand
  // here: closed faceted prisms and slabs, flat normals, vertex colours from the same paint functions (budget 400).
  const fresh = (n) => root.listNodes().find((o) => o.getName() === n);
  buildFarLOD(doc, root, fresh);
  // LOD1 (game camera): the simplifier shreds the thin paper into shards; the staff, wrap and bells stay simplified,
  // the streamers are laid by hand like LOD2 but with a centre crease and the curled tip
  layStreamers(doc, fresh, 1);
  layLOD1Cords(fresh('gohei_LOD1').getMesh());
  for (const S of ['L', 'R']) for (const s of LAYOUT[S]) byName(s.name).setExtras({ anchor: true, pivot: 'hinge (top centre of the segment)', restWorld: s.A, restTurnDeg: [s.ax, s.ay, s.az] });
  for (const m of root.listMaterials()) if (/^Shide/.test(m.getName())) m.dispose();
  await io.write(file, doc);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--split')) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  splitStreamers(path.join(ROOT, 'assets/models/sculpt/gohei.glb')).then(() => console.log('streamers split onto anchors'));
}
