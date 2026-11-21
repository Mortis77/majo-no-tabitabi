// 镇灯 — the Great Lantern (makeGreatLantern, src/world/builders/keyobjects.js). Replaces its solid body; the paper
// barrel, its ribs and caps, the flame core and the light spill stay live in code (openings + anchors left for them).
// INTENT
//  silhouette: a heavy stone foot, a slim banded column, an open timber cage, and a broad cap whose four corners sweep up.
//  big forms: the two-step granite plinth with its lotus drum; the timber chamber (posts, beams, brackets); the tiled cap.
//  eye rests on: the chamber's arched frieze and soot over the paper; the upturned cap corners with their ears and the
//    bronze jewel on top; the offerings and the worn tread at the front step.
//  wear: centuries of rain from the north-west (-X/-Z): moss in the step joints and on the cap's back slopes, lichen and
//    streaks there; lacquer flaked on the weather side; the lamplighter's hands have polished the front sill and posts,
//    feet have dished the front treads; the flame has smoked the frieze and the cap's underside.
//  not: a stack of primitives, symmetric, evenly detailed, glossy-new.
// Coordinates: metres, origin = foot centre on the ground, +Y up, +Z front (the side the code's crest faces is +Z/-Z).
// Land tint: GL_LAND=<dusk|mirror|crystal|moon|sun> bakes a land's colours for LOOKING (name great_lantern_<land>);
// without it the tintable materials (Lacquer, Fitting, Tile; Granite mildly) bake neutral for material.color tinting.
import * as P from '../sdf.mjs';

const LAND = process.env.GL_LAND || '';
// GL_LOD=mid | far builds the game-camera / distance meshes from a simpler field (the simplifier cannot reduce the full
// field's cage + tiles + offerings to 5000 / 1200 triangles without wrecking it): great_lantern_mid.glb, _far.glb.
const LODV = process.env.GL_LOD || '';
const D = LODV === 'mid' ? 1 : LODV === 'far' ? 2 : 0;
const hero = (s, f) => (D === 0 ? f(s) : s);
const hex = (h) => P.color(h);
const STONE_REF = hex('#a29e96');
const div = (a, b) => [a[0] / b[0], a[1] / b[1], a[2] / b[2]];
// tints (sRGB multipliers) per land — the installer sets material.color to these (see INSTALL.md)
export const TINTS = {
  dusk: { Lacquer: '#e24a2e', Fitting: '#7a5a44', Tile: '#4a3a52', Granite: '#a59c90' },
  mirror: { Lacquer: '#8c7a68', Fitting: '#6e5640', Tile: '#4f8f80', Granite: '#a29e96' },
  crystal: { Lacquer: '#2b3566', Fitting: '#d8dff0', Tile: '#26346a', Granite: '#c9c6c0' },
  moon: { Lacquer: '#2a2326', Fitting: '#ffd27a', Tile: '#232a44', Granite: '#b9c3dc' },
  sun: { Lacquer: '#e24a2e', Fitting: '#ffd27a', Tile: '#3c4a5c', Granite: '#a29e96' },
};
const T = LAND && TINTS[LAND] ? TINTS[LAND] : null;
const tint = (mat) => (!T ? [1, 1, 1] : mat === 'Granite' ? div(hex(T.Granite), STONE_REF) : hex(T[mat]));
const TL = tint('Lacquer'), TF = tint('Fitting'), TT = tint('Tile'), TG = tint('Granite');
const mulc = (a, b) => [Math.min(1, a[0] * b[0]), Math.min(1, a[1] * b[1]), Math.min(1, a[2] * b[2])];

// ------------------------------------------------------------------------------------------------- key dimensions
const FX = 0.78;            // post centre offset (code: fx)
const SILL0 = 2.62, SILL1 = 2.75, DECK = 2.73, POST1 = 4.08, MASU1 = 4.2, KETA1 = 4.32;
const R2 = Math.SQRT2;
// cap profile: [half-width (face apothem), y]  — bottom out, edge, top back in
const CAP_UNDER = [[0, 4.31], [0.95, 4.31], [1.25, 4.25], [1.36, 4.235]];
const CAP_TOP = [[1.39, 4.37], [1.37, 4.43], [1.2, 4.485], [1.0, 4.555], [0.8, 4.66], [0.6, 4.775], [0.4, 4.895], [0.22, 4.99], [0.1, 5.035], [0, 5.05]];
const interp = (prof, v) => {
  const p = prof.slice().sort((a, b) => a[0] - b[0]);
  if (v <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (v <= p[i][0]) { const t = (v - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + t * (p[i][1] - p[i - 1][1]); }
  return p[p.length - 1][1];
};
const capTopY = (c) => interp(CAP_TOP, c), capUnderY = (c) => interp(CAP_UNDER, c);
const LIFT = 0.3, LIFT_OUT = 0.08;
const cornerLift = (x, z) => {   // how much the cap is lifted / pushed out at (x, z)
  const ax = Math.abs(x), az = Math.abs(z), ch = Math.max(ax, az);
  if (ch < 0.75) return [0, 0];
  const cf = Math.max(0, 1 - (Math.abs(ax - az) / Math.max(ch, 1e-6)) / 0.55); // 1 on the diagonal
  const t = Math.min(1, (ch - 0.75) / 0.63);
  return [LIFT * cf * cf * t * t, LIFT_OUT * cf * cf * t * t];
};
export const HANG = 1.11, HANG_Y = 4.07;   // corner pendants hang from the bracket tips

export default {
  name: 'great_lantern' + (LAND ? '_' + LAND : '') + (LODV ? '_' + LODV : ''),
  id: 'sculpt_great_lantern' + (LODV ? '_' + LODV : ''),
  voxel: [0.0095, 0.016, 0.026][D],
  // main: LOD0 18000 is the deliverable; the 9000 'LOD1' exists only because the kit's before_after sheet reads out[1]
  lods: [[18000, 9000], [5000], [1200]][D],
  lodError: [[0.009, 0.02], [0.03], [0.07]][D],
  atlas: [1024, 256, 128][D],
  ground: 0,
  aoRange: 0.4,
  materials: {
    stone: { name: 'Granite', surface: 'stone', look: { detail: 0.25, bump: 0.3, fine: 0 } },
    moss: { name: 'Moss', surface: 'none', look: { rim: 0.4, trans: 0.25 } },
    lacquer: { name: 'Lacquer', surface: 'paint', look: { spec: 0.15, specPower: 30, detail: 0.3 } },
    bronze: { name: 'Fitting', surface: 'metal', look: { spec: 0.5 } },
    tile: { name: 'Tile', surface: 'tile', look: { spec: 0.2, specPower: 40, detail: 0.3 } },
    straw: { name: 'Straw', surface: 'none', look: { rim: 0.2 } },
    paper: { name: 'Shide', surface: 'none', look: { trans: 0.4 } },
    offer: { name: 'Offering', surface: 'none' },
  },
  anchors: {
    fire: [0, 3.33, 0],                  // = firePos; flame core centre
    paper: [0, 3.33, 0],                 // centre of the live paper barrel (r 0.64, y 2.79..3.87)
    paper_hook: [0, 3.93, 0],            // the iron hanger rod ends here, on top of the paper's upper cap
    spark: [0, 4.46, 0],                 // embers rise from here (code: spark)
    hang_fl: [HANG, HANG_Y, HANG], hang_fr: [-HANG, HANG_Y, HANG], hang_bl: [HANG, HANG_Y, -HANG], hang_br: [-HANG, HANG_Y, -HANG],
    finial_top: [0, 5.4, 0],
  },
  notes: 'Sculpted great lantern (镇灯) body. LOD0 colour atlas + object-space normal map; LOD1/2 vertex colours. Paper barrel + ribs + caps, flame core and spill stay live from makeGreatLantern. Anchors fire/paper/paper_hook/spark/hang_*. Pendants: great_lantern_hang.glb at each hang_* node. See .tmp/sculpt/great_lantern/INSTALL.md.',

  build({ S }) {
    S.part('granite', { mat: 'stone', paint: paintGranite });
    S.part('freshChip', { mat: 'stone', paint: (c) => paintGranite(c, 0.25) });
    const G = (s) => s.part('granite', { mat: 'stone', paint: paintGranite });
    const L = (s) => s.part('lacquer', { mat: 'lacquer', paint: paintLacquer });
    const B = (s) => s.part('bronze', { mat: 'bronze', paint: paintBronze });

    // ============================================================== plinth: two steps of fitted granite blocks
    const rnd = S.prng(5);
    const blockRing = (half, y0, y1, depth, splits, seed) => {
      const r = S.prng(seed), out = [];
      for (let side = 0; side < 4; side++) {
        // front/back sides own the corners
        const own = side % 2 === 0, len = own ? half : half - depth;
        const cuts = [-len]; const n = splits[side];
        for (let i = 1; i < n; i++) cuts.push(-len + (2 * len * i) / n + (r() - 0.5) * 0.25);
        cuts.push(len);
        for (let i = 0; i < n; i++) {
          const a = cuts[i] + 0.004, b = cuts[i + 1] - 0.004, jy = (r() - 0.5) * 0.014, jd = (r() - 0.5) * 0.02;
          let blk = S.roundBox([b - a, y1 - y0 + jy, depth + jd], 0.022).at((a + b) / 2, (y0 + y1 + jy) / 2, half - (depth + jd) / 2)
            .turn(0, (r() - 0.5) * 0.6, 0);
          out.push(blk.turn(0, side * 90, 0));
        }
      }
      const core = S.box([2 * (half - depth) + 0.02, y1 - y0 - 0.02, 2 * (half - depth) + 0.02]).at(0, (y0 + y1) / 2 - 0.01, 0);
      return S.union(core, ...out);
    };
    let step1 = D < 2 ? blockRing(1.3, 0, 0.205, 0.32, [3, 2, 3, 2], 11) : S.roundBox([2.6, 0.205, 2.6], 0.02).at(0, 0.1025, 0);
    let step2 = D < 2 ? blockRing(1.06, 0.2, 0.405, 0.3, [2, 2, 2, 1], 12) : S.roundBox([2.12, 0.205, 2.12], 0.02).at(0, 0.3025, 0);
    if (D === 0) {
    // dished, polished treads at the front where feet have stood for centuries
    step1 = step1.softCut(S.ellipsoid([0.5, 0.022, 0.13]).at(0.06, 0.212, 1.14), 0.03);
    step2 = step2.softCut(S.ellipsoid([0.42, 0.02, 0.1]).at(-0.04, 0.414, 0.93), 0.03);
    step1 = step1.softCut(S.capsule([-0.55, 0.205, 1.3], [0.62, 0.205, 1.3], 0.03), 0.03);   // front nosing rounded by feet
    // one corner block knocked, a crack
    step1 = step1.chip({ at: [-1.3, 0.19, -1.3], dir: [-1, 0.6, -1], depth: 0.08, spread: 0.6, seed: 3, paint: 'freshChip' });
    step2 = step2.crack([[1.06, 0.4, -0.3], [1.06, 0.33, -0.25], [1.06, 0.26, -0.32]], { width: 0.009, jag: 0.015, seed: 4 });
    }
    const plinth = G(hero(S.union(step1, step2), (s) => s.wear(0.012, { vary: 0.7, seed: 5 })));

    // ============================================================== lotus drum (inverted lotus collar)
    let drum = S.lathe([[0, 0.4], [0.84, 0.4], [0.86, 0.43], [0.84, 0.47], [0, 0.47]], { smooth: 0.01 });
    let lotus = S.lathe([[0.45, 0.45], [0.8, 0.47], [0.86, 0.51], [0.84, 0.56], [0.76, 0.62], [0.63, 0.675], [0.52, 0.71], [0.45, 0.715]], { smooth: 0.01 });
    const groove = S.roundBox([0.02, 0.2, 0.42], 0.008).at(0, 0.6, 0.62);
    if (D < 2) lotus = lotus.softCut(groove.around(16, 11.25), 0.012);
    lotus = lotus.warp((x, y, z, o) => {
      const r = Math.hypot(x, z); let a = Math.atan2(x, z) - Math.PI / 16; const sec = Math.PI / 8; a = Math.abs(a - sec * Math.round(a / sec));
      const mid = Math.max(0, 1 - a / 0.17);
      o[0] = 0; o[1] = 0.016 * mid * Math.max(0, (r - 0.5) / 0.35); o[2] = 0;
      const k = 0.02 * mid * mid; o[0] = (x / (r || 1)) * k; o[2] = (z / (r || 1)) * k;
    }, { lip: 1.3, grow: 0.04 });
    const bead = S.torus(0.5, 0.025).at(0, 0.725, 0);
    drum = drum.softAdd(lotus, 0.015).softAdd(bead, 0.01);
    if (D === 0) drum = drum.chisel({ count: 10, depth: 0.008, seed: 21, radius: 0.12, tilt: 0.3, where: (x, y) => y > 0.45 && y < 0.72 });

    // ============================================================== shaft: octagonal, entasis, carved bands
    const oct = (prof) => S.lathe(prof, { sides: 8 }).turn(0, 22.5, 0);
    let shaft = oct([[0, 0.7], [0.5, 0.7], [0.475, 0.76], [0.462, 1.05], [0.448, 1.6], [0.452, 2.0], [0.47, 2.14], [0, 2.14]]);
    const band = (y) => oct([[0, y - 0.045], [0.475, y - 0.045], [0.495, y - 0.03], [0.495, y + 0.03], [0.475, y + 0.045], [0, y + 0.045]]);
    shaft = shaft.softAdd(band(0.84), 0.008).softAdd(band(2.02), 0.008);
    if (D === 0) shaft = shaft.softCut(S.torus(0.5, 0.009).at(0, 0.84, 0), 0.004).softCut(S.torus(0.5, 0.009).at(0, 2.02, 0), 0.004);
    if (D === 0) shaft = shaft.chisel({ count: 14, depth: 0.006, seed: 31, radius: 0.16, tilt: 0.1, where: (x, y) => y > 0.9 && y < 1.95 });
    if (D === 0) shaft = shaft.crack([[-0.2, 1.9, -0.42], [-0.17, 1.7, -0.43], [-0.21, 1.52, -0.42], [-0.18, 1.38, -0.43]], { width: 0.008, jag: 0.014, seed: 6 });

    // ============================================================== capital: flare and a carved wave band
    let cap = S.lathe([[0, 2.12], [0.47, 2.12], [0.56, 2.18], [0.74, 2.27], [0.9, 2.35], [0.97, 2.4], [0.985, 2.44], [0.985, 2.565], [0.955, 2.6], [0.9, 2.62], [0, 2.62]], { smooth: 0.008 });
    const wave = (ph, amp, y0) => { const pts = []; for (let i = 0; i <= 96; i++) { const a = (i / 96) * 2 * Math.PI; pts.push([Math.sin(a) * 0.99, y0 + amp * Math.sin(a * 10 + ph), Math.cos(a) * 0.99]); } return pts; };
    if (D === 0) for (const [ph, y0] of [[0, 2.485], [Math.PI, 2.52]]) cap = cap.softCut(S.tube(wave(ph, 0.022, y0), 0.008, { smooth: false }), 0.004);
    if (D === 0) cap = cap.softCut(S.torus(0.99, 0.007).at(0, 2.452, 0), 0.003).softCut(S.torus(0.99, 0.007).at(0, 2.555, 0), 0.003);
    if (D === 0) cap = cap.chisel({ count: 8, depth: 0.008, seed: 41, radius: 0.1, where: (x, y) => y < 2.4 });

    const column = G(hero(S.union(drum, shaft, cap), (s) => s.wear(0.01, { vary: 0.6, seed: 7 })));

    // ============================================================== timber chamber
    const bx = (a) => S.boxFromTo(a);
    const beam = (a, r = 0.012) => { const [x0, y0, z0, x1, y1, z1] = a; return S.roundBox([x1 - x0, y1 - y0, z1 - z0], r).at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); };
    const both = (s) => s.mirror('x').mirror('z');
    const swapXZ = (s) => s.turn(0, 90, 0);      // a member along X becomes one along Z
    // sill: four beams crossing at the corners, ends proud; a board deck between
    const sillX = beam([-1.02, SILL0, FX - 0.075, 1.02, SILL1, FX + 0.075], 0.015);
    let sill = S.union(sillX.mirror('z'), swapXZ(sillX).mirror('x'), bx([-0.72, SILL0 + 0.02, -0.72, 0.72, DECK, 0.72]));
    // posts: chamfered, set on the sill
    const postShape = S.box([0.16, POST1 - SILL1, 0.16]).intersect(S.box([0.19, POST1 - SILL1, 0.19]).turn(0, 45, 0)).at(FX, (SILL1 + POST1) / 2, FX);
    const posts = both(postShape);
    // through-ties (nuki) with wedges: X ties low and high on the faces, Z ties offset in height
    const nuki = (y0, h) => beam([-0.95, y0, FX - 0.035, 0.95, y0 + h, FX + 0.035], 0.008);
    const wedge = (y0, h) => beam([0.885, y0 - 0.02, FX - 0.05, 0.905, y0 + h + 0.02, FX + 0.05], 0.004);
    const tiesX = S.union(nuki(2.88, 0.08), wedge(2.88, 0.08)).mirror('x').mirror('z');
    const tiesZ = swapXZ(S.union(nuki(2.97, 0.08), wedge(2.97, 0.08))).mirror('x').mirror('z');
    // kneewall boards between sill and lower tie
    const knee = beam([-0.71, SILL1 - 0.01, FX - 0.02, 0.71, 2.885, FX + 0.015], 0.006);
    const knees = S.union(knee.mirror('z'), swapXZ(knee).mirror('x'));
    // head tie + arched frieze board (the deep reveal over the paper), on all four faces
    const head = S.union(beam([-0.98, 3.99, FX - 0.05, 0.98, POST1, FX + 0.05], 0.012), beam([0.95, 3.97, FX - 0.06, 0.975, 4.1, FX + 0.06], 0.004));
    let frieze = beam([-0.71, 3.6, FX - 0.035, 0.71, 4.0, FX - 0.0], 0.006);
    frieze = frieze.cut(S.cylinder(0.66, 0.4).turn(90, 0, 0).at(0, 3.27, FX - 0.2));
    // cusps: two small notches turned into the arch
    frieze = frieze.cut(S.cylinder(0.11, 0.4).turn(90, 0, 0).at(0.5, 3.66, FX - 0.2).mirror('x'));
    const friezes = S.union(S.union(head, frieze).mirror('z'), swapXZ(S.union(beam([-0.98, 3.89, FX - 0.05, 0.98, 3.99, FX + 0.05], 0.012), frieze)).mirror('x'));
    // bearing blocks (masu) on the posts, tapered bottom
    const masu = both(S.lathe([[0, POST1], [0.095 * R2, POST1], [0.125 * R2, POST1 + 0.05], [0.125 * R2, MASU1], [0, MASU1]], { sides: 4 }).turn(0, 45, 0).at(FX, 0, FX));
    // diagonal corner brackets reaching for the cap's corners, with a strut block at the tip
    const DG = (a, b) => [a, b];
    const armLen = (HANG - 0.68) * R2;
    let arm = S.roundBox([0.11, 0.11, armLen], 0.012).at(0, 4.155, 0);
    arm = arm.cut(S.cylinder(0.32, 0.2).turn(0, 0, 90).at(0.1, 3.82, armLen / 2 - 0.02));        // curved underside at the tip
    arm = arm.turn(0, 45, 0).at((0.68 + HANG) / 2, 0, (0.68 + HANG) / 2);
    const strut = S.roundBox([0.13, 0.15, 0.13], 0.012).turn(0, 45, 0).at(HANG - 0.01, 4.27, HANG - 0.01);
    const brackets = both(S.union(arm, strut));
    // short face brackets from each masu
    let farm = S.roundBox([0.36, 0.09, 0.09], 0.01).at(FX - 0.02, 4.16, FX);
    farm = farm.cut(S.cylinder(0.22, 0.2).turn(90, 0, 0).at(FX - 0.22, 3.93, FX - 0.1));
    const farms = S.union(both(farm), both(swapXZ(farm)));
    // keta: the eave beam ring, ends proud and carved
    const keta = beam([-1.1, MASU1, FX - 0.07, 1.1, KETA1, FX + 0.07], 0.016);
    let ketaEnd = S.cylinder(0.075, 0.2).turn(90, 0, 0);
    const ketas = S.union(keta.mirror('z'), swapXZ(keta).mirror('x'));
    // inner hanger: two cross beams under the keta and an iron rod to the paper's cap
    const cross = beam([-0.72, 4.12, -0.05, 0.72, 4.22, 0.05], 0.01);
    const hanger = S.union(cross, swapXZ(cross).at(0, 0.0, 0));
    const timber = L(D === 2 ? S.union(sill, posts, tiesX, friezes, masu, brackets, ketas)
      : hero(S.union(sill, posts, tiesX, tiesZ, knees, friezes, masu, brackets, farms, ketas, hanger), (s) => s.wear(0.008, { vary: 0.7, seed: 8 })));

    // ============================================================== bronze fittings (patina)
    const shoe = both(S.roundBox([0.19, 0.11, 0.19], 0.01).at(FX, SILL1 + 0.055, FX));
    const collar = both(S.roundBox([0.185, 0.06, 0.185], 0.008).at(FX, POST1 - 0.12, FX));
    const capEnd = (x0, x1, y0, y1, zc, w) => beam([x0, y0, zc - w, x1, y1, zc + w], 0.008);
    const sillCaps = S.union(capEnd(0.97, 1.035, SILL0 - 0.01, SILL1 + 0.01, FX, 0.087), swapXZ(capEnd(0.97, 1.035, SILL0 - 0.01, SILL1 + 0.01, FX, 0.087))).mirror('x').mirror('z');
    const ketaCaps = S.union(capEnd(1.05, 1.115, MASU1 - 0.01, KETA1 + 0.01, FX, 0.082), swapXZ(capEnd(1.05, 1.115, MASU1 - 0.01, KETA1 + 0.01, FX, 0.082))).mirror('x').mirror('z');
    // studs on the sill caps and keta caps
    const stud = (x, y, z) => S.sphere(0.017).at(x, y, z);
    const studs = S.union(stud(1.04, 2.685, FX), stud(1.12, 4.26, FX), swapXZ(S.union(stud(1.04, 2.685, FX), stud(1.12, 4.26, FX)))).mirror('x').mirror('z');
    // corner hooks under the bracket tips (the pendants hang here)
    const hook = S.torus(0.03, 0.009).turn(90, 45, 0).at(HANG, HANG_Y + 0.03, HANG).add(S.cylinder(0.012, 0.09).at(HANG, HANG_Y + 0.05, HANG));
    const hooks = both(hook);
    const rod = S.cylinder(0.018, 4.12 - 3.93).at(0, 3.93, 0).add(S.cylinder(0.04, 0.03).at(0, 3.93, 0));
    // ridge ornament: a jewel on a lotus seat, with a flame-tongue tip
    const jewel = S.lathe([[0, 5.0], [0.16, 5.0], [0.17, 5.04], [0.12, 5.07], [0.09, 5.09], [0.13, 5.12], [0.135, 5.15], [0.1, 5.17], [0.07, 5.18],
      [0.09, 5.2], [0.115, 5.24], [0.12, 5.28], [0.105, 5.32], [0.075, 5.35], [0.035, 5.38], [0.01, 5.4], [0, 5.402]], { smooth: 0.004 });
    const seatPetals = S.ellipsoid([0.06, 0.025, 0.05]).turn(-30, 0, 0).at(0, 5.06, 0.13).around(8);
    const ornament = jewel.softAdd(seatPetals, 0.01).softCut(S.torus(0.135, 0.006).at(0, 5.135, 0), 0.003);
    const bronze = B(D === 2 ? S.union(ketaCaps, ornament) : D === 1 ? S.union(shoe, collar, sillCaps, ketaCaps, ornament)
      : S.union(shoe, collar, sillCaps, ketaCaps, studs, hooks, rod, ornament).wear(0.005, { vary: 0.6, seed: 9 }));

    // ============================================================== the cap: square hip roof of rolled tiles
    let capS = S.lathe([...CAP_UNDER, ...CAP_TOP].map(([h, y]) => [h * R2, y]), { sides: 4 }).turn(0, 45, 0);
    // tile rolls down the slope + stepped courses, on the upper surface only
    if (D === 0) capS = capS.warp((x, y, z, o) => {
      const ax = Math.abs(x), az = Math.abs(z), ch = Math.max(ax, az), u = ax > az ? z : x;
      const yu = capUnderY(ch), top = capTopY(ch);
      const w = P.ss(yu + 0.03, Math.min(top, yu + 0.1), y) * P.ss(0.12, 0.3, ch);
      const roll = Math.sqrt(0.5 + 0.5 * Math.cos((2 * Math.PI * u) / 0.165));
      const v = (1.4 - ch) / 0.21, s = v - Math.floor(v);
      const course = P.ss(0, 0.8, s) * (1 - P.ss(0.86, 1, s));
      o[1] = w * (0.024 * roll + 0.016 * course);
    }, { lip: 1.6, grow: 0.05 });
    const ridgePts = []; for (let i = 0; i <= 12; i++) { const c = 0.06 + (1.36 - 0.06) * (i / 12); ridgePts.push([c, capTopY(c) + 0.035, c]); }
    let hip = S.tube(ridgePts, (t) => 0.055 - 0.012 * t, { aspect: 1.2 });
    // corner ear: the hip ends in a curled tongue
    const ear = S.tube([[1.25, capTopY(1.25) + 0.04, 1.25], [1.35, 4.43, 1.35], [1.38, 4.45, 1.38], [1.4, 4.51, 1.4], [1.38, 4.56, 1.38], [1.34, 4.54, 1.34]], (t) => 0.06 - 0.025 * t);
    hip = both(hip.softAdd(ear, 0.03));
    const apex = S.lathe([[0, 4.97], [0.2, 4.97], [0.21, 5.0], [0.17, 5.04], [0, 5.04]], { sides: 4 }).turn(0, 45, 0);
    capS = capS.softAdd(hip, 0.03).softAdd(apex, 0.02);
    // the sweep: corners lifted and pushed out
    capS = capS.warp((x, y, z, o) => {
      const [ly, lo] = cornerLift(x, z), r = Math.hypot(x, z) || 1;
      o[0] = (x / r) * lo; o[1] = ly; o[2] = (z / r) * lo;
    }, { lip: 1.5, grow: 0.15 });
    // weather: one slipped tile on the back-left slope, chips on the eave, a crack
    if (D === 0) {
    capS = capS.chip({ at: [-0.55, capTopY(1.0) + 0.05, -1.0], dir: [-0.2, 1, -0.6], depth: 0.05, spread: 0.6, seed: 13 });
    capS = capS.chisel({ count: 12, depth: 0.01, seed: 51, radius: 0.08, tilt: 0.5, where: (x, y, z) => Math.max(Math.abs(x), Math.abs(z)) > 1.25 });
    capS = capS.crack([[0.3, 4.9, 0.42], [0.36, 4.78, 0.62], [0.33, 4.66, 0.82]], { width: 0.01, jag: 0.02, seed: 14 });
    }
    const tile = hero(capS, (s) => s.wear(0.008, { vary: 0.6, seed: 15 })).part('tile', { mat: 'tile', paint: paintTile });

    // ============================================================== shimenawa round the shaft, shide hanging
    const ROPE_Y = 1.42;
    const strand = (ph) => { const pts = []; for (let i = 0; i <= 160; i++) { const a = (i / 160) * 2 * Math.PI; const rr = 0.505 + 0.022 * Math.cos(a * 16 + ph); const sag = 0.03 * Math.max(0, Math.cos(a)) ** 6; pts.push([Math.sin(a) * rr, ROPE_Y + 0.022 * Math.sin(a * 16 + ph) - sag, Math.cos(a) * rr]); } return pts; };
    let rope = S.tube(strand(0), 0.03, { smooth: false }).softAdd(S.tube(strand(Math.PI), 0.03, { smooth: false }), 0.008);
    // knot at the front and two short tails
    rope = rope.softAdd(S.ellipsoid([0.07, 0.06, 0.05]).at(0.0, ROPE_Y - 0.04, 0.54), 0.02)
      .add(S.tube([[0.02, ROPE_Y - 0.06, 0.55], [0.045, ROPE_Y - 0.13, 0.565], [0.05, ROPE_Y - 0.17, 0.565]], [0.022, 0.018]))
      .add(S.tube([[-0.02, ROPE_Y - 0.06, 0.55], [-0.05, ROPE_Y - 0.11, 0.56], [-0.06, ROPE_Y - 0.14, 0.56]], [0.02, 0.016]));
    // the tails end in a binding and a splayed straw brush (not a drip)
    const brush = (x, y, z, len) => S.torus(0.02, 0.006).add(S.cone(0.018, 0.034, len).turn(180, 0, 0)
      .cut(S.box([0.012, 0.06, 0.08]).at(0, -len, 0.04).around(5))).at(x, y, z);
    rope = rope.add(brush(0.05, ROPE_Y - 0.17, 0.565, 0.1)).add(brush(-0.06, ROPE_Y - 0.14, 0.56, 0.08));
    rope = rope.rough({ type: 'fbm', scale: 0.015, amp: 0.004, seed: 16 }).part('straw', { mat: 'straw', paint: paintStraw });
    const zig = (w, h, n) => { const o = [], s = w * 0.55; const off = (i) => (i % 2 ? s : 0); for (let i = 0; i < n; i++) { o.push([off(i), -i * h], [off(i), -(i + 1) * h]); } for (let i = n - 1; i >= 0; i--) { o.push([off(i) + w, -(i + 1) * h], [off(i) + w, -i * h]); } return o; };
    const shide = (deg, len, tilt) => S.extrude(zig(0.075, len / 4, 4), 0.03, { round: 0.006 }).at(-0.07, 0, 0).turn(tilt, 0, 0).at(0, ROPE_Y - 0.02, 0.545).turn(0, deg, 0);
    const paper = S.union(shide(-38, 0.36, 6), shide(36, 0.34, 5), shide(160, 0.3, 4), shide(-120, 0.33, 5)).part('paper', { mat: 'paper', paint: paintShide });

    // ============================================================== offerings at the foot (front, asymmetric)
    const OFF = (name, paint) => (s) => s.part(name, { mat: 'offer', paint });
    // a two-tier mochi on a little stand, on the upper step, right of centre
    const mochi = OFF('mochi', paintMochi)(S.union(
      S.lathe([[0, 0.405], [0.095, 0.405], [0.1, 0.43], [0.09, 0.44], [0, 0.44]]),
      S.ellipsoid([0.075, 0.035, 0.075]).at(0, 0.47, 0), S.ellipsoid([0.055, 0.028, 0.055]).at(0, 0.522, 0),
      S.ellipsoid([0.03, 0.022, 0.03]).at(0.005, 0.56, 0)).at(0.36, 0, 0.93));
    // bamboo vase with an evergreen sprig, upper step left
    const sprig = []; const sr = S.prng(23);
    for (let i = 0; i < 7; i++) { const a = sr() * 6.28, h = 0.12 + sr() * 0.12; sprig.push(S.ellipsoid([0.035, 0.012, 0.018]).turn(sr() * 40 - 20, (a * 180) / Math.PI, 30).at(Math.sin(a) * 0.04, 0.62 + h * 0.6, Math.cos(a) * 0.04)); }
    const vase = OFF('bamboo', paintBamboo)(S.lathe([[0, 0.405], [0.045, 0.405], [0.045, 0.62], [0.035, 0.62], [0.035, 0.5], [0, 0.5]]).add(S.torus(0.047, 0.006).at(0, 0.52, 0)).at(-0.52, 0, 0.9));
    const leaves = OFF('leaves', paintLeaves)(S.union(S.capsule([0, 0.55, 0], [0.01, 0.72, 0.01], 0.008), ...sprig).at(-0.52, 0, 0.9));
    // three little sake cups and a flask on the lower step, right
    const cup = (x, z) => S.lathe([[0, 0.205], [0.028, 0.205], [0.04, 0.235], [0.034, 0.235], [0.02, 0.215], [0, 0.215]]).at(x, 0, z);
    const flask = S.lathe([[0, 0.205], [0.05, 0.205], [0.062, 0.26], [0.05, 0.31], [0.022, 0.34], [0.02, 0.38], [0.026, 0.39], [0, 0.39]], { smooth: 0.004 }).at(0.98, 0, 1.12);
    const cups = OFF('ceramic', paintCeramic)(S.union(cup(0.78, 1.16), cup(0.85, 1.22), cup(0.7, 1.23), flask));
    // a pebble cairn on the lower step, left; and a burnt-down candle with its wax pool
    const cr = S.prng(31), stones = [];
    let cy = 0.205;
    for (let i = 0; i < 4; i++) { const r = 0.055 - i * 0.011; stones.push(S.ellipsoid([r * 1.25, r * 0.6, r]).turn(0, cr() * 180, (cr() - 0.5) * 12).at(-0.94 + (cr() - 0.5) * 0.02, cy + r * 0.55, 1.15)); cy += r * 1.05; }
    const cairn = OFF('pebble', paintPebble)(S.union(...stones));
    const candle = OFF('wax', paintWax)(S.union(S.ellipsoid([0.07, 0.008, 0.05]).at(0.08, 0.399, 0.95), S.cylinder(0.022, 0.06).at(0.08, 0.396, 0.95)));

    // ============================================================== moss: joints and shelves on the damp side, cap back slopes
    const mr = S.prng(77), cushions = [];
    const back = (x, z) => z * 0.75 + x * 0.65 < -0.15;
    for (let tries = 0; cushions.length < 22 && tries < 900; tries++) {
      const hit = tile.probe(mr, [[-0.6, 0.8, -0.6], [-0.9, 0.5, -0.2], [-0.2, 0.5, -0.9]], [0, 4.6, 0]);
      if (!hit) continue;
      const [[x, y, z], n] = hit; const ch = Math.max(Math.abs(x), Math.abs(z));
      if (!back(x, z) || n[1] < 0.5 || ch < 0.75 || ch > 1.33) continue;
      const r = 0.035 + 0.05 * mr();
      cushions.push(S.ellipsoid([r * 1.3, r * 0.45, r]).turn(0, mr() * 180, 0).at(x, y + r * 0.2, z));
    }
    for (let tries = 0; cushions.length < 40 && tries < 900; tries++) {
      const hit = plinth.probe(mr, [[-0.5, 1, -0.6], [-0.8, 0.7, 0.1]]);
      if (!hit) continue;
      const [[x, y, z], n] = hit;
      if (!back(x, z) || n[1] < 0.6) continue;
      const r = 0.025 + 0.04 * mr();
      cushions.push(S.ellipsoid([r * 1.4, r * 0.45, r]).at(x, y + r * 0.15, z));
    }
    const moss = S.softUnion(0.03, ...cushions).rough({ type: 'billow', scale: 0.014, amp: 0.005, seed: 17 }).part('moss', { mat: 'moss', paint: paintMoss });

    if (D > 0) {
      const ropeLo = S.torus(0.51, 0.04).scale([1, 0.9, 1]).at(0, ROPE_Y, 0).part('straw', { mat: 'straw', paint: paintStraw });
      if (D === 2) return S.union(plinth, column, timber, bronze, tile, ropeLo);
      return S.union(plinth, column, timber, bronze, tile, ropeLo, mochi, vase, cairn);
    }
    const stoneAll = S.union(plinth, column).rough({ type: 'cellular', scale: 0.025, amp: 0.0015, seed: 18 });
    return S.union(stoneAll.softAdd(moss, 0.012), timber, bronze, tile, rope, paper, mochi, vase, leaves, cups, cairn, candle);
  },

  // the code-built great lantern (land dusk unless GL_LAND says otherwise), unlit; spill / flame are invisible unlit
  async before({ ROOT, threeToMeshes }) {
    stubDocument();
    const mod = await import(ROOT + '/src/world/builders/keyobjects.js');
    const h = mod.makeGreatLantern({ land: LAND || 'dusk' });
    h.setLit(false, true);
    const meshes = threeToMeshes(h.group);
    // live parts for the sculpt's own sheets: the code's paper barrel with its ribs and caps (same formulas)
    const THREE = await import('three');
    const g = new THREE.Group();
    const lands = { dusk: ['#f6e2c4', '#2a2326'], mirror: ['#f3ead6', '#5b3a29'], crystal: ['#eef0f6', '#d8dff0'], moon: ['#f4f1ea', '#ffd27a'], sun: ['#f8ecd2', '#ffd27a'] };
    const [pc, tc] = lands[LAND || 'dusk'];
    const lam = (c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c) });
    const pr = 0.64, ph = 1.08, cy = 3.33, pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(pr * (0.7 + 0.3 * Math.sin(t * Math.PI)), cy - ph / 2 + t * ph)); }
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), lam(pc)));
    for (let i = 1; i < 7; i++) { const t = i / 7; const m = new THREE.Mesh(new THREE.TorusGeometry(pr * (0.7 + 0.3 * Math.sin(t * Math.PI)) + 0.006, 0.012, 4, 24), lam('#5b3a29')); m.rotation.x = Math.PI / 2; m.position.y = cy - ph / 2 + t * ph; g.add(m); }
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.74, pr * 0.74, 0.1, 20), lam(tc)); m.position.y = cy + s * (ph / 2 + 0.03); g.add(m); }
    return { meshes, live: threeToMeshes(g) };
  },
};

function stubDocument() {
  if (globalThis.document) return;
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') ? () => ({ addColorStop() {} })
    : (k === 'getImageData' || k === 'createImageData') ? (x, y, w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx, style: {} }) };
}

// ------------------------------------------------------------------------------------------------------------- paint
const NW = (x, z) => P.ss(0.3, -0.6, z * 0.75 + x * 0.65);       // 1 on the weather (north-west) side
function paintGranite(c, weathered = 1) {
  const { x, y, z, nx, ny, nz, ao, cavity, edge, broad } = c;
  let col = P.mix(hex('#aaa59b'), hex('#bab4a8'), 0.5 + 0.5 * P.fbm(x * 2.2, y * 2.2, z * 2.2, 1, 3));
  // block-to-block drift on the plinth
  if (y < 0.42) col = P.mix(col, hex('#8f8b83'), 0.35 * (0.5 + 0.5 * P.noise3(Math.floor(x * 2.2) * 3.1, Math.floor(y * 5), Math.floor(z * 2.2) * 2.7)));
  const f1 = P.cellular(x * 26, y * 26, z * 26, 7), f2 = P.cellular(x * 18 + 3, y * 18, z * 18, 8);
  col = P.mix(col, hex('#6a655d'), P.ss(0.22, 0.12, f1) * 0.3);
  col = P.mix(col, hex('#d9d4c8'), P.ss(0.2, 0.08, f2) * 0.3);
  if (weathered <= 0.3) return mulc(P.mix(col, hex('#c4beb2'), 0.35), TG);
  const nw = NW(x, z), up = P.ss(0.3, 0.9, ny), side = 1 - Math.abs(ny);
  const damp = P.ss(0.45, 0.0, y) * (0.5 + 0.5 * (1 - ao));
  col = P.mix(col, hex('#828374'), up * 0.25);
  col = P.mix(col, hex('#66645a'), damp * 0.4);
  const streak = P.ss(0.15, 0.55, P.fbm(x * 14, y * 0.8, z * 14, 5, 3)) * side * (0.35 + 0.65 * nw);
  col = P.mix(col, hex('#7a776d'), streak * 0.22);
  const lich = P.ss(0.42, 0.28, P.cellular(x * 8, y * 8, z * 8, 3)) * side * P.ss(0.3, 0.9, P.fbm(x * 3, y * 3, z * 3, 9, 2) + 0.5);
  col = P.mix(col, hex('#c9c8a6'), lich * 0.55 * (0.4 + 0.6 * nw));
  const rust = P.ss(0.3, 0.18, P.cellular(x * 12 + 5, y * 12, z * 12, 4)) * (1 - nw) * side;
  col = P.mix(col, hex('#b48a52'), rust * 0.4);
  // green in the joints and hollows, strongest on the damp side and low down
  const green = P.clamp(cavity * 1.1 + broad * 0.5 * (y < 0.75 ? 1 : 0), 0, 1) * (0.35 + 0.65 * nw) * (y < 0.45 ? 1 : 0.5) + up * nw * 0.35 * (y < 0.45 ? 1 : 0.3);
  col = P.mix(col, hex('#58733f'), P.clamp(green, 0, 1) * 0.65);
  // worn: pale rubbed edges; polished treads at the front; the front of the shaft where hands rest
  col = P.mix(col, hex('#cec7b9'), edge * 0.5);
  const tread = (ny > 0.6 && z > 0.8 && Math.abs(x) < 0.7 && y < 0.45) ? P.ss(0.7, 0.2, Math.abs(x)) : 0;
  const touch = (y > 0.95 && y < 1.75 && nz > 0.35) ? P.ss(0.95, 1.15, y) * P.ss(1.75, 1.55, y) * P.ss(0.35, 0.8, nz) : 0;
  col = P.mix(col, hex('#c3bdb0'), (tread + touch) * 0.6);
  // smoke: under the chamber floor, a little up the capital's top edge
  const soot = P.ss(2.5, 2.62, y) * (ny > 0.5 ? 0.35 : 0.2) * (0.85 + 0.15 * P.fbm(x * 3, y * 3, z * 3, 6, 2));
  col = P.mix(col, hex('#2f2a25'), soot);
  // candle soot on the upper step
  const cd = Math.hypot(x - 0.08, z - 0.95);
  if (y < 0.45) col = P.mix(col, hex('#3a332c'), P.ss(0.16, 0.05, cd) * 0.6);
  return mulc(col, TG);
}
function paintLacquer(c) {
  const { x, y, z, nx, ny, nz, ao, cavity, edge } = c;
  const ax = Math.abs(x), az = Math.abs(z), ch = Math.max(ax, az);
  // neutral lacquer (the land tint makes it vermilion / black / indigo / old wood)
  let col = P.mix(hex('#e8e5e1'), hex('#f6f3ef'), 0.5 + 0.5 * P.fbm(x * 6, y * 3, z * 6, 2, 2));
  const nw = NW(x, z), outward = (ax > az ? Math.sign(x) * nx : Math.sign(z) * nz);
  // sun and rain: lacquer chalked on top faces and on the weather side, flaked to bare wood in patches
  col = P.mix(col, hex('#c9c4bc'), P.ss(0.4, 0.95, ny) * 0.5);
  const flake = P.ss(0.38, 0.22, P.cellular(x * 7, y * 7, z * 7, 2)) * P.clamp(nw * 0.8 + P.ss(0.5, 1, ny) * 0.4, 0, 1) * (outward > 0.2 || ny > 0.5 ? 1 : 0.2);
  const bare = P.clamp(flake + edge * 0.55 * (0.4 + 0.6 * nw), 0, 1);
  col = P.mix(col, hex('#6b5646'), bare * 0.85);
  // polished by the lamplighter's hands: front sill and the lower front posts
  const hands = (z > 0.6 && y > SILL0 - 0.02 && y < 3.15) ? P.ss(0.2, 0.8, ch) * P.ss(3.15, 2.85, y) : 0;
  col = P.mix(col, hex('#ffffff'), hands * 0.5);
  if (hands > 0.2) col = P.mix(col, hex('#efe9e2'), edge * 0.6);
  // soot: inside the chamber and up under the frieze, the masu, the keta and the hanger
  const inner = ch < FX + 0.06 && outward < 0.2 ? 1 : 0;
  const soot = P.clamp(inner * P.ss(3.1, 3.95, y) * 0.85 + (y > 3.95 && ch < 0.9 ? 0.75 : 0) + (ny < -0.5 && y > 3.55 ? 0.5 : 0), 0, 1)
    * (0.75 + 0.25 * P.fbm(x * 12, y * 12, z * 12, 4, 2));
  col = P.mix(col, hex('#2c2622'), soot);
  // dark in the deck boards, weather-dark joints
  col = P.mix(col, hex('#4a3e36'), cavity * 0.4);
  return mulc(col, TL);
}
function paintBronze(c) {
  const { x, y, z, ny, cavity, edge, ao } = c;
  let col = P.mix(hex('#d9cfbf'), hex('#e9e0d0'), 0.5 + 0.5 * P.fbm(x * 9, y * 9, z * 9, 3, 2));
  const nw = NW(x, z);
  // verdigris in recesses, on top faces and on the weather side; rubbed bright on the edges
  const pat = P.clamp(cavity * 1.2 + P.ss(0.4, 1, ny) * 0.5 + nw * 0.35 + (1 - ao) * 0.4, 0, 1) * P.ss(0.25, 0.6, P.fbm(x * 14, y * 14, z * 14, 5, 3) + 0.35);
  col = P.mix(col, hex('#7fb8a2'), pat * 0.75);
  col = P.mix(col, hex('#fffaf0'), edge * 0.6);
  if (y > 4.95) col = P.mix(col, hex('#fff6e2'), 0.2 + edge * 0.3);   // the jewel, kept bright
  return mulc(col, TF);
}
function paintTile(c) {
  const { x, y, z, nx, ny, nz, ao, cavity, edge, broad } = c;
  const ax = Math.abs(x), az = Math.abs(z), ch = Math.max(ax, az);
  const diag = Math.abs(ax - az) < 0.11 && ch > 0.1;
  let col = P.mix(hex('#cfd0d2'), hex('#dcdcdc'), 0.5 + 0.5 * P.fbm(x * 4, y * 4, z * 4, 3, 2));
  // per-tile value drift: some tiles replaced over the years
  const u = ax > az ? z : x, ti = Math.floor(u / 0.165), tj = Math.floor((1.4 - ch) / 0.21);
  col = P.mul(col, 0.9 + 0.16 * (0.5 + 0.5 * P.noise3(ti * 1.7, tj * 2.3, x > 0 ? 1 : 3)));
  if (diag && ny > 0) col = P.mul(col, 0.72);                       // the hip ridges are darker clay
  const nw = NW(x, z), up = P.ss(0.2, 0.8, ny);
  // bleached tops, dark wet valleys, rain streaks running to the eave
  col = P.mix(col, hex('#f0efe9'), up * edge * 0.6);
  col = P.mix(col, hex('#6f7068'), cavity * 0.55);
  const streak = P.ss(0.2, 0.6, P.fbm(u * 10, ch * 1.2, 7, 6, 3)) * up * (0.4 + 0.6 * nw);
  col = P.mix(col, hex('#7c7d76'), streak * 0.4);
  // lichen: pale gold-green rosettes on the back slopes
  const lich = P.ss(0.4, 0.25, P.cellular(x * 9, y * 9, z * 9, 11)) * up * nw;
  col = P.mix(col, hex('#c9c98e'), lich * 0.7);
  col = P.mix(col, hex('#5d7646'), P.clamp(cavity * 1.2 + broad * 0.4, 0, 1) * nw * up * 0.5);
  // underside: smoke from the fire, heaviest above the chamber
  if (ny < -0.3) col = P.mix(col, hex('#2c2723'), P.ss(1.3, 0.6, ch) * 0.75 + 0.15);
  return mulc(col, TT);
}
function paintStraw(c) {
  const { x, y, z, cavity, edge } = c;
  if (y < 1.27 && z > 0.5) return P.mix(hex('#d8cba0'), hex('#8a7a58'), cavity * 0.7);   // the cut brush ends, fresh straw
  let col = P.mix(hex('#b0a07a'), hex('#c4b48a'), 0.5 + 0.5 * P.fbm(x * 40, y * 40, z * 40, 3, 2));
  col = P.mix(col, hex('#8a7448'), NW(x, z) * 0.45);                 // grey-brown where the rain reaches
  col = P.mix(col, hex('#6e5a38'), cavity * 0.6);
  return P.mix(col, hex('#efdca0'), edge * 0.4);
}
function paintShide(c) {
  const { x, y, z, edge, cavity } = c;
  let col = P.mix(hex('#f4f0e6'), hex('#fffdf6'), 0.5 + 0.5 * P.fbm(x * 30, y * 30, z * 30, 4, 2));
  col = P.mix(col, hex('#cfc6b0'), NW(x, z) * 0.45 + P.ss(1.25, 1.05, y) * 0.3);  // rain-tired, edges browned
  return P.mix(col, hex('#b9ab8c'), cavity * 0.4);
}
function paintMoss(c) {
  const { x, y, z, cavity, edge, ny } = c;
  let col = P.mix(hex('#6c8e41'), hex('#9bb757'), 0.5 + 0.5 * P.fbm(x * 30, y * 30, z * 30, 2, 3));
  col = P.mix(col, hex('#aab565'), edge * 0.6 + P.ss(0.6, 1, ny) * 0.15);
  return P.mix(col, hex('#3d5530'), cavity * 0.5);
}
function paintMochi(c) {
  const { y, edge, cavity } = c;
  if (y < 0.445) return P.mix(hex('#c9a46a'), hex('#8a6a40'), cavity);   // the little sanbō stand
  if (y > 0.54) return P.mix(hex('#f2a23a'), hex('#ffd07a'), edge);    // the bitter orange on top
  return P.mix(P.mix(hex('#eee6d4'), hex('#fffaf0'), edge), hex('#b8ad98'), cavity * 0.6);
}
function paintBamboo(c) { const { y, edge, cavity } = c; return P.mix(P.mix(hex('#8ea05a'), hex('#c6c27c'), edge + P.ss(0.5, 0.62, y) * 0.3), hex('#4e5a30'), cavity * 0.7); }
function paintLeaves(c) { const { edge, cavity } = c; return P.mix(P.mix(hex('#2f5a34'), hex('#5d8a48'), edge), hex('#1c3420'), cavity * 0.6); }
function paintCeramic(c) { const { x, y, ny, edge, cavity } = c; const flask = x > 0.93; let col = flask ? P.mix(hex('#e9e2d2'), hex('#3b4f72'), P.ss(0.3, 0.32, y) * P.ss(0.36, 0.34, y)) : hex('#f1ece0'); if (!flask && ny > 0.3 && y > 0.21) col = hex('#9e2a22'); return P.mix(P.mix(col, hex('#ffffff'), edge * 0.4), hex('#6d6455'), cavity * 0.5); }
function paintPebble(c) { const { x, y, z, edge, cavity } = c; const k = Math.floor((y - 0.2) / 0.05); const base = [hex('#7c7a74'), hex('#a39d90'), hex('#6c6a70'), hex('#b8b2a5')][Math.min(3, Math.max(0, k))]; return P.mix(P.mix(base, hex('#d0cabe'), edge * 0.5), hex('#4a4842'), cavity * 0.6); }
function paintWax(c) { const { y, edge } = c; return y > 0.412 ? P.mix(hex('#efe6cf'), hex('#3a2c22'), P.ss(0.455, 0.465, y)) : P.mix(hex('#e3d6b6'), hex('#fff6dc'), edge); }
