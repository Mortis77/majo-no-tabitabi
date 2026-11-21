// 五重塔 of 向日神社 — the tallest thing where the game begins, seen from across 曦光原. Replaces bld_pagoda_red (Poly by
// Google) placed in src/world/builders/shrine.js (pagoda block): same footprint (8.57 x 8.57) and height (18.0).
// INTENT
//  silhouette: five broad, thin roofs that step in as they rise, every corner swept up like a lifted sleeve, on a heavy
//    stone podium; a slim bronze spire carrying stacked rings and a sun wheel - the shrine's sun, not a water flame.
//  big forms: the podium with its two stairs; the stack of roofs (diminishing 4.0 -> 2.8 m half-width); the spire.
//  eye rests on: the bracket clusters under each eave (three tiers, real blocks and arms), the swept corners with their
//    ridge ends and hanging wind bells, the latticed windows and the sun crest on the front door.
//  wear: rain from the west has chalked the vermilion and stripped it to grey wood on the -X faces and rail tops; north
//    (-Z) roofs are mossed along the ridges and eaves; the copper has gone green (brown where sheltered); one tile on the
//    second roof's north-west slope has slipped; the stair treads are dished in the middle.
//  not: a pack pagoda (flat brown slabs on a red box), symmetric in its weathering, evenly detailed, toy-new.
// Coordinates: metres, origin = podium foot centre on the ground (the game sets it on its own 0.5 m stone slab), +Y up,
// +Z = front (the door with the sun crest; the stairs run to +Z and -Z). North in these notes = -Z, west = -X.
import * as P from '../sdf.mjs';
import { C, mix, ss, clamp, field, beam, bunion } from './landmarks_lib.mjs';

const R2 = Math.SQRT2;
// ------------------------------------------------------------------------------------------------- storey layout
const POD = 0.75;                                   // podium top
const SC = [1, 0.92, 0.85, 0.78, 0.72];             // detail scale per storey
const HB = [2.05, 1.85, 1.65, 1.45, 1.25];          // body half-width (post centres)
const HE = [4.0, 3.7, 3.4, 3.1, 2.8];               // eave half-width (face, before the corner push)
const WH = [2.2, 1.35, 1.25, 1.15, 1.05];           // wall height (floor -> post top)
const APEX_A = 0.42;                                // top roof meets the spire base here (apothem)
export const ST = [];
{
  let floor = POD;
  for (let k = 0; k < 5; k++) {
    const s = SC[k], hb = HB[k], he = HE[k];
    const yp = floor + WH[k];
    const bh = 0.76 * s;                            // bracket stack height (post top -> purlin top)
    const purl = 0.85 * s;                          // purlin out from the wall
    const uW = yp + bh + 0.16 * purl;               // roof underside at the wall
    const uAt = (a) => uW - 0.16 * (a - hb);        // underside line (base rafters)
    const stepA = he - 0.42 * s;                    // base rafters end; flying rafters beyond, a step higher
    const tipU = uAt(he) + 0.09 * s;
    const tE = 0.36 * s;
    const yeT = tipU + tE;
    const ab = k < 4 ? HB[k + 1] + 0.47 * SC[k + 1] : APEX_A;   // where the next balcony (or the spire) sits
    const yB = k < 4 ? yeT + 0.42 * (he - ab) : yeT + 0.55 * (he - ab);
    const topY = (a) => (a >= ab ? yeT + (yB - yeT) * Math.pow(clamp((he - a) / (he - ab), 0, 1), 1.35) : yB);
    ST.push({ k, s, hb, he, floor, yp, bh, purl, uW, uAt, stepA, tipU, tE, yeT, ab, yB, topY, lift: 0.55 * s, out: 0.2 * s });
    floor = yB;
  }
}
export const APEX = ST[4].yB;
// the sweep: corners lifted and pushed out (displacement at a point of the unswept roof)
const sweep = (st, x, z) => {
  const ax = Math.abs(x), az = Math.abs(z), ch = Math.max(ax, az), mn = Math.min(ax, az);
  if (ch < st.hb) return [0, 0];
  const t = clamp((ch - st.hb) / (st.he - st.hb), 0, 1.15), sd = mn / (ch || 1);
  const w = sd * sd * sd * t * t;
  return [st.lift * w, st.out * w];
};
// a point on the swept roof's top / underside along the diagonal at apothem c (for bells, ridges, moss)
const cornerPoint = (st, c, under = false) => {
  const [ly, lo] = sweep(st, c, c);
  const y0 = under ? (c > st.stepA ? st.uAt(c) + 0.09 * st.s : st.uAt(c)) : st.topY(c);
  return [c + lo / R2, y0 + ly, c + lo / R2];
};

const F = () => field();       // 0 full, 1 mid (LOD1), 2 far (LOD2)

export default {
  name: 'pagoda', id: 'sculpt_pagoda',
  voxel: 0.034,
  fieldVoxel: [0.034, 0.055, 0.1],
  lodField: [0, 1, 2],
  quickVoxel: 1.35,
  lods: [22000, 7000, 1800],
  lodError: [0.05, 0.09, 0.22],
  atlas: 1024,
  ground: 0,
  aoRange: 0.6,
  aoStrength: 0.55,
  cavity: [0.02, 0.09],
  creaseAngle: 45,
  bandSlack: 0.08,
  heroLookUp: 1.4,
  farSheet: true,
  closeSheet: [[25, 8, 3.2, 5.5], [205, 8, 3.2, 5.5], [115, 10, 3.6, 8], [300, 6.5, 3.0, 4.5]],
  replaces: { file: 'assets/models/refined/bld_pagoda_red.glb', scale: 0.32432 },
  materials: {
    stone: { name: 'Granite', surface: 'stone', look: { detail: 0.25, bump: 0.3, fine: 0 } },
    lacquer: { name: 'Lacquer', surface: 'paint', look: { spec: 0.15, specPower: 30, detail: 0.3 } },
    plaster: { name: 'Plaster', surface: 'paint', look: { spec: 0.05, detail: 0.2 } },
    wood: { name: 'Wood', surface: 'wood', look: { detail: 0.3 } },
    tile: { name: 'Tile', surface: 'tile', look: { spec: 0.2, specPower: 40, detail: 0.3 } },
    copper: { name: 'Copper', surface: 'metal', look: { spec: 0.45 } },
    bell: { name: 'WindBell', surface: 'metal', look: { spec: 0.5 } },
    moss: { name: 'Moss', surface: 'none', look: { rim: 0.4, trans: 0.25 } },
  },
  anchors: (() => {
    const a = { finial_top: [0, 18.0, 0], spire_base: [0, APEX, 0], door: [0, POD, HB[0] + 0.1] };
    const nm = { '1,1': 'se', '-1,1': 'sw', '1,-1': 'ne', '-1,-1': 'nw' };   // +Z = south (front), +X = east
    for (const st of ST) for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const [x, y, z] = cornerPoint(st, st.he - 0.16 * st.s, true);
      a[`bell_${st.k + 1}_${nm[sx + ',' + sz]}`] = [+(sx * x).toFixed(3), +(y - 0.02).toFixed(3), +(sz * z).toFixed(3)];
    }
    return a;
  })(),
  notes: 'Sculpted five-storey pagoda of 向日神社. LOD0 colour atlas + object-space normal map; LOD1/2 vertex colours. Wind bells are their own material (WindBell) with a bell_<storey>_<ne|nw|se|sw> pivot node each. See .tmp/sculpt/pagoda/INSTALL.md.',

  build({ S }) {
    const D = F();
    // parts first, in a fixed order (every field registers the same ids)
    S.part('stone', { mat: 'stone', paint: paintStone });
    S.part('lacquer', { mat: 'lacquer', paint: paintLacquer });
    S.part('plaster', { mat: 'plaster', paint: paintPlaster });
    S.part('wood', { mat: 'wood', paint: paintWood });
    S.part('door', { mat: 'lacquer', paint: paintDoor });
    S.part('tile', { mat: 'tile', paint: paintTile });
    S.part('ridge', { mat: 'tile', paint: paintRidge });
    S.part('copper', { mat: 'copper', paint: paintCopper });
    S.part('bell', { mat: 'bell', paint: paintBell });
    S.part('moss', { mat: 'moss', paint: paintMoss });
    S.part('looseTile', { mat: 'tile', paint: paintTile });
    S.part('crest', { mat: 'copper', paint: paintCrest });
    const PT = (n) => (s) => s.part(n);
    const B = (a, r = 0.015) => beam(S, a, r);
    const faces = (s) => S.union(s.mirror('z'), s.turn(0, 90, 0).mirror('x'));   // a piece on the +Z face -> all four faces
    const corners = (s) => s.mirror('x').mirror('z');

    // ============================================================== podium: dressed granite, two stairs
    const podium = [];
    {
      const H0 = 3.2;
      podium.push(S.roundBox([2 * H0 + 0.1, 0.14, 2 * H0 + 0.1], 0.03).at(0, 0.07, 0));           // footing course
      let dado = S.box([2 * H0 - 0.12, POD - 0.28, 2 * H0 - 0.12]).at(0, 0.14 + (POD - 0.28) / 2, 0);
      if (D < 2) {      // dado blocks: vertical joints, every block a hair proud or sunk
        const r = S.prng(3);
        for (let i = -4; i <= 4; i++) dado = dado.cut(S.box([0.035, POD, 0.2]).at(i * 0.74 + (r() - 0.5) * 0.1, POD / 2, H0 - 0.06).mirror('z'))
          .cut(S.box([0.2, POD, 0.035]).at(H0 - 0.06, POD / 2, i * 0.74 + (r() - 0.5) * 0.1).mirror('x'));
      }
      podium.push(dado);
      let cap = S.roundBox([2 * H0, 0.15, 2 * H0], 0.035).at(0, POD - 0.075, 0);                 // cap course, bevelled
      if (D === 0) cap = cap.chip({ at: [-H0, POD - 0.02, -H0], dir: [-1, 0.5, -1], depth: 0.09, spread: 0.6, seed: 4 });
      podium.push(cap);
      // stairs: 4 risers to the front and back, flanked by sloped side stones
      const stair = [];
      const n = 4, rise = POD / n, run = 0.25, W = 0.95;
      for (let i = 0; i < n; i++) {
        let st = S.roundBox([2 * W, rise * (i + 1), run + 0.02], 0.025).at(0, rise * (i + 1) / 2, H0 + (n - i) * run - run / 2);
        if (D === 0) st = st.softCut(S.ellipsoid([0.5, 0.03, 0.12]).at(0.05, rise * (i + 1) + 0.012, H0 + (n - i) * run - run / 2), 0.03);
        stair.push(st);
      }
      const cheek = S.extrude([[0, 0], [n * run + 0.1, 0], [0.05, POD + 0.06], [0, POD + 0.06]], 0.2, { round: 0.02 }).turn(0, -90, 0).at(W + 0.1, 0, H0 - 0.02);
      stair.push(cheek.mirror('x'));
      podium.push(S.union(...stair).mirror('z'));
    }
    let stone = PT('stone')(bunion(S, podium));
    if (D === 0) stone = stone.wear(0.02, { vary: 0.6, seed: 5 });

    // ============================================================== storeys
    const timber = [], plaster = [], wood = [], doors = [], tiles = [], ridges = [], copper = [], bells = [], crests = [];
    for (const st of ST) {
      const { k, s, hb, he, floor, yp } = st;
      const pw = Math.max(0.2 * s, 0.17);                                    // post width
      const third = hb / 3;
      // ---- posts, ties
      const post = (x, z) => S.roundBox([pw, yp - floor, pw], 0.02).at(x, (floor + yp) / 2, z);
      timber.push(corners(post(hb, hb)), faces(post(third, hb).mirror('x')));
      const tieH = 0.14 * s + 0.03, tieD = Math.max(0.12 * s, 0.11);
      const tie = (y0) => B([-hb - 0.16 * s, y0, hb - tieD / 2, hb + 0.16 * s, y0 + tieH, hb + tieD / 2]);
      timber.push(faces(S.union(tie(yp - 0.06 - tieH), tie(floor + 0.03))));
      if (k === 0) timber.push(faces(tie(floor + 1.05)));
      // ---- wall: plaster body, recessed behind the frame; door in the middle bay, latticed windows in the side bays
      let wall = S.box([2 * hb - 0.08, yp - floor - 0.02, 2 * hb - 0.08]).at(0, (floor + yp) / 2, 0);
      const doorTop = k === 0 ? floor + 1.95 : yp - 0.24 * s, doorBot = floor + (k === 0 ? 0.08 : 0.12);
      const dw = third - pw * 0.5 - 0.04;
      wall = wall.cut(faces(S.box([2 * dw, doorTop - doorBot, 0.16]).at(0, (doorTop + doorBot) / 2, hb - 0.04)));
      const winBot = k === 0 ? floor + 1.15 + tieH : floor + 0.42 * (yp - floor), winTop = k === 0 ? floor + 1.95 : yp - 0.24 * s;
      const ww = third - pw * 0.5 - 0.06 * s - 0.03;
      if (D < 2) wall = wall.cut(faces(S.box([2 * ww, winTop - winBot, 0.22]).at(2 * third, (winTop + winBot) / 2, hb - 0.04).mirror('x')));
      plaster.push(wall);
      // the dark interior behind the lattice
      if (D < 2) wood.push(faces(S.box([2 * ww + 0.02, winTop - winBot + 0.02, 0.06]).at(2 * third, (winTop + winBot) / 2, hb - 0.16).mirror('x')));
      // lattice (vertical bars, 'renji') + its frame
      if (D < 2) {
        const nb = 3, bars = [];
        const bw = Math.max(0.11, 0.13 * s), wx = 2 * third, wy = (winTop + winBot) / 2, wh = winTop - winBot;
        for (let i = 0; i < nb; i++) { const x = wx - ww + (2 * ww) * (i + 0.5) / nb; bars.push(S.box([bw, wh + 0.1, 0.13]).at(x, wy, hb - 0.08)); }
        // a flat frame round the opening, proud of the plaster
        const fw = 0.09;
        bars.push(S.box([2 * ww + 2 * fw, wh + 2 * fw, 0.1]).at(wx, wy, hb - 0.03).cut(S.box([2 * ww, wh, 0.3]).at(wx, wy, hb)));
        timber.push(faces(S.union(...bars).mirror('x')));
      }
      // doors: two leaves, a seam, a rail; the front door on the ground storey carries the sun crest (part 'door')
      const leaf = S.box([2 * dw - 0.02, doorTop - doorBot, 0.1]).at(0, (doorTop + doorBot) / 2, hb - 0.11);
      let leaves = D === 0 ? leaf.cut(S.box([0.03, doorTop - doorBot + 0.1, 0.08]).at(0, (doorTop + doorBot) / 2, hb - 0.04)) : leaf;
      if (D === 0) leaves = leaves.add(S.box([2 * dw - 0.04, 0.09 * s, 0.05]).at(0, doorBot + (doorTop - doorBot) * 0.62, hb - 0.03));
      doors.push(faces(leaves));
      if (k === 0 && D < 2) {     // the sun crest on the front door: a disc, a ring and eight rays, proud of the leaves
        const cy = POD + 1.32, zf = hb - 0.06;
        let crest = S.cylinder(0.19, 0.07).turn(90, 0, 0).at(0, cy, zf + 0.035).add(S.torus(0.3, 0.04).turn(90, 0, 0).at(0, cy, zf + 0.01));
        if (D === 0) for (let i = 0; i < 8; i++) crest = crest.add(S.roundBox([0.1, 0.15, 0.06], 0.02).at(0, 0.44, 0).turn(0, 0, i * 45).at(0, cy, zf + 0.005));
        crests.push(crest.part('crest'));
      }
      // ---- bracket clusters: three tiers of rows running along each face (crossing at the corners), arms and blocks
      //      out at every post, a diagonal pair under each swept corner
      const yb0 = yp, d1 = 0.16 * s, a1 = 0.13 * s, m1 = 0.14 * s;
      const yA1 = yb0 + d1, yM1 = yA1 + a1, yA2 = yM1 + m1, yM2 = yA2 + a1, yPur = yM2 + m1;   // purlin bottom
      const out1 = 0.45 * s, out2 = st.purl, aw = 0.17 * s + 0.03, mb = 0.2 * s + 0.03;
      const block = (x, y, z, w = mb, h = m1) => S.roundBox([w, h, w], 0.02).at(x, y + h / 2, z);
      const daito = (x, z, w = 0.34 * s) => S.roundBox([w, d1, w], 0.025).at(x, yb0 + d1 / 2, z);
      const arms = (x0) => S.union(daito(x0, hb),
        B([x0 - aw / 2, yA1, hb - 0.1, x0 + aw / 2, yM1, hb + out1 + mb / 2], 0.02), block(x0, yM1, hb + out1),
        B([x0 - aw / 2, yA2, hb - 0.1, x0 + aw / 2, yM2, hb + out2 + mb / 2], 0.02), block(x0, yM2, hb + out2));
      const rowW = 0.15 * s + 0.03;
      const rows = S.union(
        B([-hb - 0.22 * s, yA1, hb - rowW / 2, hb + 0.22 * s, yM1, hb + rowW / 2], 0.02),                       // tier 1 at the wall
        B([-hb - out1 - 0.2 * s, yA2, hb + out1 - rowW / 2, hb + out1 + 0.2 * s, yM2, hb + out1 + rowW / 2], 0.02), // tier 2
        B([-hb - out2 - 0.3 * s, yPur, hb + out2 - 0.09 * s - 0.01, hb + out2 + 0.3 * s, yPur + 0.14 * s, hb + out2 + 0.09 * s + 0.01], 0.02)); // purlin
      if (D < 2) {
        timber.push(faces(S.union(rows, arms(third).mirror('x'), arms(hb).mirror('x'))));
        // the corner: a bigger bearing block and a two-tier diagonal arm under the sweep
        const L1 = out1 * R2 + 0.12, L2 = out2 * R2 * 1.12 + 0.12;
        const diag = (y0, y1, L) => S.roundBox([aw * 1.15, y1 - y0, L], 0.02).at(0, (y0 + y1) / 2, L / 2).turn(0, 45, 0).at(hb, 0, hb);
        const tip = (L, y) => block(hb + L / R2, y, hb + L / R2, mb * 1.1);
        timber.push(corners(S.union(daito(hb, hb, 0.4 * s), diag(yA1, yM1, L1), diag(yA2, yM2, L2), tip(L1 - 0.1, yM1), tip(L2 - 0.1, yM2))));
      } else timber.push(faces(B([-hb - 0.25, yb0 + 0.04, hb - 0.1, hb + 0.25, yPur + 0.1 * s, hb + 0.25])));   // far: one bracket band
      // ---- balcony (storeys 2-5): plank deck on the roof below + rail with crossing ends
      if (k > 0) {
        const lower = ST[k - 1], ab = lower.ab, yB = lower.yB;
        wood.push(S.box([2 * ab, 0.1, 2 * ab]).at(0, yB - 0.03, 0));
        if (D < 2) {
          const rw = Math.max(0.085, 0.09 * s), rh = 0.44 * s, ra = ab - 0.07;
          const rail = (y, ext) => B([-ra - ext, y, ra - rw / 2, ra + ext, y + rw, ra + rw / 2], 0.012);
          const rp = (x) => S.roundBox([rw + 0.01, rh + rw, rw + 0.01], 0.012).at(x, yB + (rh + rw) / 2, ra);
          const r = [rail(yB + rh, 0.16), rail(yB + rh * 0.4, 0.04)];
          r.push(rp(ra)); if (D === 0) r.push(rp(ra / 3));
          timber.push(faces(S.union(...r).mirror('x')));
        } else timber.push(faces(B([-ab, yB, ab - 0.12, ab, yB + 0.36 * s, ab])));
      }
      // ---- roof
      const prof = [[0, st.uW], [hb - 0.05, st.uW], [st.stepA, st.uAt(st.stepA)], [st.stepA, st.uAt(st.stepA) + 0.09 * s], [he, st.tipU], [he + 0.03, st.tipU + st.tE * 0.45], [he, st.yeT]];
      for (let i = 1; i <= 7; i++) { const a = he - (he - st.ab) * (i / 7); prof.push([a, st.topY(a)]); }
      prof.push([0, st.yB]);
      let roof = S.lathe(prof.map(([a, y]) => [a * R2, y]), { sides: 4 }).turn(0, 45, 0);
      if (D === 0) {
        // tile rolls on the top (geometry: the atlas is ~0.1 m per texel on an object this size)
        const P0 = 0.42 * s;
        roof = roof.warp((x, y, z, o) => {
          const ax = Math.abs(x), az = Math.abs(z), ch = Math.max(ax, az), u = ax > az ? z : x;
          if (ch < st.ab - 0.1) return;
          const yt = st.topY(ch), yu = ch > st.stepA ? st.uAt(ch) + 0.09 * s : st.uAt(ch);
          if (y < (yt + yu) / 2) return;
          const roll = Math.sqrt(0.5 + 0.5 * Math.cos((2 * Math.PI * u) / P0));
          o[1] = 0.05 * s * roll * ss(st.ab - 0.05, st.ab + 0.25, ch) * ss(0.25, 0.6, Math.abs(ax - az));
        }, { lip: 1.4, grow: 0.06 });
      }
      roof = roof.part('tile');
      // hip ridges with a ridge-end tile and an up-curled tip
      const c0 = k < 4 ? st.ab - 0.05 : 0.25, c1 = he - 0.12 * s, rr = 0.1 * s + 0.02;
      const rp = []; for (let i = 0; i <= 10; i++) { const c = c0 + (c1 - c0) * (i / 10); rp.push([c, st.topY(c) + rr * 0.6, c]); }
      let ridge = S.tube(rp, (t) => rr * (1 - 0.15 * t), { aspect: 1.25 });
      const yEnd = st.topY(c1) + rr * 0.6;
      const curl = S.tube([[c1 - 0.15 * s, yEnd, c1 - 0.15 * s], [c1 + 0.06 * s, yEnd + 0.04 * s, c1 + 0.06 * s], [c1 + 0.14 * s, yEnd + 0.2 * s, c1 + 0.14 * s], [c1 + 0.1 * s, yEnd + 0.34 * s, c1 + 0.1 * s]], (t) => rr * (1.05 - 0.45 * t));
      ridge = ridge.softAdd(curl, 0.04);
      if (D < 2) {
        const oni = S.roundBox([0.36 * s, 0.34 * s, 0.13 * s + 0.02], 0.04).turn(-12, 45, 0).at(c1 - 0.32 * s, yEnd + 0.12 * s, c1 - 0.32 * s);
        ridge = ridge.softAdd(oni, 0.03);
      }
      ridge = corners(ridge).part('ridge');
      // the sweep, on roof and ridges together
      let swept = S.union(roof, ridge).warp((x, y, z, o) => {
        const [ly, lo] = sweep(st, x, z), r = Math.hypot(x, z) || 1;
        o[0] = (x / r) * lo; o[1] = ly; o[2] = (z / r) * lo;
      }, { lip: 1.6, grow: st.lift + 0.15 });
      tiles.push(swept);
      // copper caps on the ridge-end tips + wind bells under each corner
      if (D < 2) {
        const tipP = cornerPoint(st, c1 + 0.12 * s); tipP[1] += 0.36 * s + st.lift * 0.0;
        copper.push(corners(S.ellipsoid([0.09 * s + 0.02, 0.07 * s + 0.02, 0.09 * s + 0.02]).at(...tipP)));
      }
      const [bx, by, bz] = cornerPoint(st, he - 0.16 * s, true);
      let bell = S.lathe([[0, 0], [0.045, 0], [0.06, -0.05], [0.1, -0.13], [0.12, -0.27], [0.135, -0.3], [0, -0.3]].map(([r, y]) => [r * s, y * s]), { smooth: 0.005 });
      bell = bell.add(S.cylinder(0.035, 0.12).at(0, -0.01, 0));
      if (D < 2) bell = bell.add(S.capsule([0, -0.25 * s, 0], [0, -0.42 * s, 0], 0.03)).add(S.roundBox([0.16 * s, 0.2 * s, 0.07], 0.02).at(0, -0.52 * s, 0));
      bells.push(corners(bell.at(bx, by - 0.1, bz)));
    }

    // ============================================================== spire: dew basin, bowl, lotus, rings, sun wheel, jewel
    {
      const y0 = APEX - 0.08;
      const parts = [];
      parts.push(S.lathe([[0, y0], [0.44, y0], [0.44, y0 + 0.24], [0.49, y0 + 0.29], [0.49, y0 + 0.36], [0, y0 + 0.36]].map(([a, y]) => [a * R2, y]), { sides: 4 }).turn(0, 45, 0));
      const y1 = y0 + 0.36;
      parts.push(S.lathe([[0, y1], [0.33, y1], [0.35, y1 + 0.07], [0.32, y1 + 0.2], [0.24, y1 + 0.29], [0.12, y1 + 0.33], [0, y1 + 0.33]], { smooth: 0.01 }));
      const y2 = y1 + 0.32;
      let lotus = S.lathe([[0, y2], [0.12, y2], [0.24, y2 + 0.08], [0.33, y2 + 0.2], [0.3, y2 + 0.23], [0, y2 + 0.23]], { sides: D === 0 ? 8 : 0, smooth: 0.01 });
      parts.push(lotus);
      const yR0 = y2 + 0.32, yR1 = 16.95, n = 7, pitch = (yR1 - yR0) / n;
      const ringProf = [[0, yR0 - 0.1]];
      for (let i = 0; i < n; i++) {
        const y = yR0 + i * pitch, r = 0.3 - i * 0.012, h = 0.11;
        ringProf.push([0.08, y], [r - 0.02, y], [r, y + 0.02], [r, y + h - 0.02], [r - 0.02, y + h], [0.08, y + h]);
      }
      ringProf.push([0.08, 17.9], [0, 17.9]);
      parts.push(S.lathe(ringProf, { smooth: 0.004 }));
      // the sun wheel: a ring with eight flame rays, crossed so it reads from every side
      const ySun = 17.38, rS = 0.24;
      let wheel = S.torus(rS, 0.045).turn(90, 0, 0);
      const ray = S.cone(0.06, 0.012, 0.17).at(0, rS + 0.02, 0);
      if (D < 2) for (let i = 0; i < 8; i++) wheel = wheel.add(ray.turn(0, 0, i * 45 + 22.5));
      wheel = wheel.at(0, ySun, 0);
      parts.push(wheel, wheel.turn(0, 90, 0));
      parts.push(S.sphere(0.1).at(0, 17.72, 0));
      parts.push(S.lathe([[0, 17.76], [0.06, 17.77], [0.12, 17.84], [0.13, 17.9], [0.1, 17.95], [0.05, 18.0], [0, 18.03]], { smooth: 0.004 }));
      copper.push(S.union(...parts));
    }

    // ============================================================== the slipped tile (2nd roof, north-west slope)
    let extra = null;
    {
      const st = ST[1], cx = -st.he + 0.75, cz = -1.15;
      const y = st.topY(Math.abs(cx));
      const [ly] = sweep(st, cx, cz);
      if (D === 0) extra = S.roundBox([0.36, 0.06, 0.3], 0.02).turn(4, 0, -24).at(cx - 0.18, y + ly + 0.07, cz + 0.05).part('looseTile');
    }

    // ============================================================== assemble
    let tileAll = bunion(S, tiles);
    if (D === 0) {
      // moss cushions on the north (-Z) slopes, along ridges and eaves
      const mr = S.prng(77), cushions = [];
      for (const st of ST) {
        let got = 0;
        for (let tries = 0; got < (st.k === 4 ? 3 : 5) && tries < 600; tries++) {
          const x = (mr() - 0.5) * 2 * st.he * 0.9, z = -(st.ab + mr() * (st.he - st.ab - 0.3));
          if (Math.abs(x) > Math.abs(z) + 0.2) continue;
          const [ly] = sweep(st, x, z);
          const y = st.topY(Math.max(Math.abs(x), Math.abs(z))) + ly;
          const nearEdge = Math.abs(Math.abs(x) - Math.abs(z)) < 0.5 || Math.abs(z) > st.he - 0.7 || Math.abs(z) < st.ab + 0.4;
          if (!nearEdge) continue;
          const r = (0.14 + 0.16 * mr()) * st.s;
          cushions.push(S.ellipsoid([r * 1.9, r * 0.32, r * 1.2]).turn(0, mr() * 180, 0).at(x, y + 0.03, z));
          got++;
        }
      }
      const moss = S.softUnion(0.06, ...cushions).rough({ type: 'billow', scale: 0.05, amp: 0.018, seed: 17 }).part('moss');
      tileAll = tileAll.softAdd(moss, 0.04);
    }
    const lac = PT('lacquer')(bunion(S, timber));
    const all = [stone, lac, PT('plaster')(bunion(S, plaster)), PT('wood')(bunion(S, wood)), PT('door')(bunion(S, doors)), tileAll,
      PT('copper')(bunion(S, copper)), PT('bell')(bunion(S, bells)), extra, ...crests];
    return bunion(S, all);
  },
};

// ------------------------------------------------------------------------------------------------------------- paint
// weather: rain from the west (-X), north (-Z) damp and shaded, south (+Z) sun-bleached
const west = (x, nx) => clamp(ss(0.1, -0.8, nx) * 0.8 + ss(0, -3, x) * 0.35, 0, 1);
const north = (z, nz) => clamp(ss(0.1, -0.8, nz) * 0.7 + ss(0, -3, z) * 0.4, 0, 1);
const storeyOf = (y) => { for (let k = 4; k >= 0; k--) if (y >= ST[k].floor - 0.05) return k; return 0; };

function paintStone(c) {
  const { x, y, z, nx, ny, nz, cavity, edge, ao } = c;
  let col = mix(C('#b3ab9e'), C('#c2bbae'), 0.5 + 0.5 * P.fbm(x * 1.6, y * 1.6, z * 1.6, 1, 3));
  // block-to-block drift
  col = P.mul(col, 0.94 + 0.1 * (0.5 + 0.5 * P.noise3(Math.floor(x / 0.74) * 3.1, Math.floor(y * 4), Math.floor(z / 0.74) * 2.7)));
  const n = north(z, nz), up = ss(0.4, 0.9, ny);
  col = mix(col, C('#86826f'), ss(0.35, 0, y) * 0.35);                      // damp foot
  col = mix(col, C('#6f8a4c'), clamp(cavity * 1.3 * (0.3 + 0.7 * n) + up * n * 0.25 * ss(0.5, 0.2, P.fbm(x * 2, 0, z * 2, 5, 2) + 0.5), 0, 1) * 0.6);
  const lich = ss(0.42, 0.3, P.cellular(x * 4, y * 4, z * 4, 3)) * (1 - up) * (0.3 + 0.7 * n);
  col = mix(col, C('#cfcda8'), lich * 0.4);
  col = mix(col, C('#ddd6c8'), edge * 0.45);
  // treads polished and dished in the middle; drip line under the eave on the cap course
  const tread = ny > 0.7 && Math.abs(x) < 0.8 && Math.abs(z) > 3.15 ? ss(0.8, 0.2, Math.abs(x)) : 0;
  col = mix(col, C('#d6d0c3'), tread * 0.5);
  return col;
}
function paintLacquer(c) {
  const { x, y, z, nx, ny, nz, cavity, edge, ao } = c;
  let col = mix(C('#e4502f'), C('#ee603c'), 0.5 + 0.5 * P.fbm(x * 3, y * 3, z * 3, 2, 2));
  const w = west(x, nx), up = ss(0.5, 0.95, ny);
  // the sun chalks the south faces and every top
  col = mix(col, C('#e98d72'), clamp(up * 0.45 + ss(0.2, 0.9, nz) * 0.18, 0, 1));
  // rain from the west: lacquer flaked to grey weathered wood, in patches, worst on outward faces and rail tops
  const flake = ss(0.34, 0.18, P.cellular(x * 1.4, y * 1.4, z * 1.4, 2)) * clamp(w * 0.9 + up * 0.35, 0, 1);
  const bare = clamp(flake + edge * 0.5 * (0.3 + 0.7 * w), 0, 1);
  col = mix(col, C('#9b8a76'), bare * 0.8);
  col = mix(col, C('#6e5d4c'), bare * cavity * 0.6);
  // dark in the bracket nests and joints (the eave shade itself comes from AO)
  col = mix(col, C('#a03424'), cavity * 0.35);
  // rain streaks down the posts below the eaves on the west and north
  const streak = ss(0.3, 0.65, P.fbm(x * 4, y * 0.4, z * 4, 7, 3)) * (1 - Math.abs(ny)) * clamp(w + north(z, nz) * 0.6, 0, 1);
  col = mix(col, C('#8a3a2a'), streak * 0.35);
  return col;
}
function paintPlaster(c) {
  const { x, y, z, nx, nz, cavity, ao } = c;
  let col = mix(C('#f0e6d2'), C('#f7f0e2'), 0.5 + 0.5 * P.fbm(x * 2, y * 2, z * 2, 3, 2));
  const k = storeyOf(y), st = ST[k];
  // rain-tracks running down from the head tie, greyer on the west and north
  const fromTop = clamp((st.yp - y) / (st.yp - st.floor), 0, 1);
  const tr = ss(0.3, 0.7, P.fbm(x * 7 + z * 7, y * 0.5, 3, 4, 3)) * (1 - fromTop * 0.7) * clamp(0.3 + west(x, nx) + north(z, nz) * 0.5, 0, 1);
  col = mix(col, C('#b8ad98'), tr * 0.4);
  col = mix(col, C('#c9bca2'), ss(0.25, 0, (y - st.floor)) * 0.4);         // splash at the foot
  // ground storey: a dado of upright boards below the middle tie, oiled wood gone silver at the foot
  if (k === 0 && y < st.floor + 1.05) {
    const u = Math.abs(nz) > Math.abs(nx) ? x : z;
    col = mix(C('#9a6a48'), C('#b07c56'), 0.5 + 0.5 * P.fbm(u * 1.5, y * 6, 1, 4, 2));
    col = P.mul(col, 0.9 + 0.14 * (0.5 + 0.5 * P.noise3(Math.floor(u / 0.22) * 2.7, 3, 1)));
    col = mix(col, C('#5a3e2c'), ss(0.06, 0.0, Math.abs((u / 0.22) - Math.round(u / 0.22)) * 0.22) * 0.6);
    col = mix(col, C('#8e8476'), ss(0.35, 0.0, y - st.floor) * 0.45 + west(x, nx) * 0.25);
  }
  col = mix(col, C('#8c7e68'), cavity * 0.4);
  return col;
}
function paintCrest(c) {
  const { x, y, z, cavity, edge, nz } = c;
  let col = mix(C('#d9a84e'), C('#f2cc7a'), 0.5 + 0.5 * P.fbm(x * 12, y * 12, z * 12, 2, 2));
  col = mix(col, C('#9a7a3e'), cavity * 0.5);                 // old gilt: darker in the hollows
  return mix(col, C('#fff0c0'), edge * 0.5);
}
function paintWood(c) {
  const { x, y, z, ny, nx, nz, cavity, edge } = c;
  const deck = ny > 0.6;
  let col = deck ? mix(C('#a88866'), C('#bfa07c'), 0.5 + 0.5 * P.fbm(x * 0.8, 0, z * 7, 4, 3)) : C('#3b2a22');
  if (deck) { col = mix(col, C('#7e6a52'), west(x, -0.5) * 0.3 + north(z, -0.4) * 0.2); col = mix(col, C('#d6c2a0'), edge * 0.4); }
  return mix(col, C('#2a1e18'), cavity * 0.5);
}
function paintDoor(c) {
  const { x, y, z, nx, ny, nz, cavity, edge } = c;
  let col = mix(C('#c9442b'), C('#d65233'), 0.5 + 0.5 * P.fbm(x * 4, y * 4, z * 4, 6, 2));
  // planks: faint vertical joints (by the face's horizontal coordinate)
  const u = Math.abs(nz) > Math.abs(nx) ? x : z;
  col = P.mul(col, 0.94 + 0.08 * (0.5 + 0.5 * P.noise3(Math.floor(u / 0.16) * 3.3, 1, 2)));
  col = mix(col, C('#9b8a76'), west(x, nx) * ss(0.4, 0.2, P.cellular(x * 3, y * 3, z * 3, 5)) * 0.7);
  // the sun crest on the ground-storey front door: a disc with eight rays, gold leaf worn at the rim
  if (nz > 0.6 && y < ST[1].floor && z > 0) {
    const cy = POD + 1.32, dx = x, dy = y - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const ray = Math.abs(Math.cos(a * 4)) > 0.82 && r > 0.2 && r < 0.36;
    const disc = r < 0.15, ring = r > 0.18 && r < 0.205;
    if (disc || ring || ray) col = mix(C('#e8b85a'), C('#ffd98a'), 0.5 + 0.5 * P.fbm(x * 30, y * 30, 1, 2, 2));
  }
  return mix(col, C('#5a1e14'), cavity * 0.6);
}
function paintTile(c) {
  const { x, y, z, nx, ny, nz, cavity, edge, broad, part } = c;
  const ax = Math.abs(x), az = Math.abs(z), ch = Math.max(ax, az);
  let col = mix(C('#7a8691'), C('#86929c'), 0.5 + 0.5 * P.fbm(x * 1.5, y * 1.5, z * 1.5, 3, 2));
  if (ny < -0.2) {          // underside: rafters (paint stripes) and boards, old lacquer gone brown in the shade
    const uu = ax > az ? z : x;
    const raf = ss(0.3, 0.6, Math.cos((2 * Math.PI * uu) / 0.27));
    let u = mix(C('#7a4a3a'), C('#8e5844'), raf);
    u = mix(u, C('#7a6656'), west(x, -1) * 0.3);
    return mix(u, C('#4a2a20'), cavity * 0.4);
  }
  const k = storeyOf(y - 0.3), st = ST[Math.max(0, k)];
  if (ch > st.he - 0.05 && Math.abs(ny) < 0.55) {   // the eave front: round tile ends and fascia, a pale line under each roof
    let f = mix(C('#8b949c'), C('#a3abb2'), 0.5 + 0.5 * P.fbm(x * 6, y * 6, z * 6, 4, 2));
    return mix(f, C('#3e454c'), cavity * 0.6);
  }
  // per-tile drift: some replaced over the years
  const u = ax > az ? z : x, ti = Math.floor(u / (0.3 * st.s)), tj = Math.floor((st.he - ch) / (0.36 * st.s));
  col = P.mul(col, 0.9 + 0.16 * (0.5 + 0.5 * P.noise3(ti * 1.7, tj * 2.3, (x > 0 ? 1 : 3) + (z > 0 ? 5 : 0) + k * 7)));
  const up = ss(0.2, 0.8, ny), n = north(z, nz), sun = ss(-0.1, 0.6, nz) * up;
  col = mix(col, C('#a7adb0'), sun * 0.35 + edge * up * 0.5);              // bleached on the sunny south and on the rolls
  col = mix(col, C('#4a5056'), cavity * 0.55);                              // dark wet channels
  const streak = ss(0.25, 0.6, P.fbm(u * 6, ch * 0.9, k * 3, 6, 3)) * up;
  col = mix(col, C('#555a58'), streak * 0.25);
  // moss and lichen on the north slopes, thickest in the channels and along the hips and eaves
  const nearHip = ss(0.45, 0.05, Math.abs(ax - az)), nearEave = ss(st.he - 0.8, st.he - 0.2, ch);
  const mossy = n * up * clamp(0.25 + cavity * 1.2 + nearHip * 0.5 + nearEave * 0.4, 0, 1) * ss(0.45, 0.65, P.fbm(x * 1.3, y * 1.3, z * 1.3, 8, 3) + 0.5);
  col = mix(col, C('#6d8a46'), clamp(mossy, 0, 1) * 0.8);
  const lich = ss(0.42, 0.28, P.cellular(x * 3, y * 3, z * 3, 11)) * up * (0.2 + 0.8 * n);
  col = mix(col, C('#c3c08a'), lich * 0.45);
  // the gap where the slipped tile lay: a dark scar
  if (part === 'tile') { const g = Math.hypot(x - (-ST[1].he + 0.75), z - (-1.15)); if (y > ST[1].floor - 1.2 && y < ST[1].floor) col = mix(col, C('#2c2a26'), ss(0.2, 0.12, g) * 0.8); }
  if (part === 'looseTile') col = mix(C('#7d8790'), C('#9aa2a8'), edge);
  return col;
}
function paintRidge(c) {
  const { x, y, z, nz, ny, cavity, edge } = c;
  let col = mix(C('#4f5964'), C('#5c6672'), 0.5 + 0.5 * P.fbm(x * 3, y * 3, z * 3, 12, 2));
  col = mix(col, C('#9aa1a6'), edge * 0.5 + ss(0.5, 1, ny) * 0.15);
  col = mix(col, C('#6d8a46'), north(z, nz) * ss(0.5, 0.75, P.fbm(x * 2, y * 2, z * 2, 13, 2) + 0.5) * 0.6);
  return mix(col, C('#30363c'), cavity * 0.5);
}
function paintCopper(c) {
  const { x, y, z, nx, ny, nz, cavity, edge, ao } = c;
  // verdigris where rain reaches; old brown bronze where it is sheltered (under the rings, in the bowl's lower curve)
  const exposed = clamp(ss(-0.3, 0.6, ny) * 0.6 + ao * 0.5 + west(x, nx) * 0.3 + north(z, nz) * 0.2, 0, 1);
  let col = mix(C('#8a6448'), C('#6fb39a'), ss(0.35, 0.75, exposed + 0.25 * P.fbm(x * 5, y * 5, z * 5, 3, 3)));
  col = mix(col, C('#a8dcc6'), edge * 0.35);
  col = mix(col, C('#4a3a2c'), cavity * 0.5);
  if (y > 17.75) col = mix(C('#e0b260'), C('#ffe0a0'), edge + 0.3);      // the jewel: gilt, the only gold up there
  // green streaks from the copper down onto the top roof are painted on the tile (none here)
  return col;
}
function paintBell(c) {
  const { x, y, z, ny, cavity, edge, ao } = c;
  let col = mix(C('#5e9e86'), C('#7fbca2'), 0.5 + 0.5 * P.fbm(x * 9, y * 9, z * 9, 3, 2));
  col = mix(col, C('#7a5a3e'), (1 - ao) * 0.6);
  col = mix(col, C('#c9e8d8'), edge * 0.4);
  return mix(col, C('#3a3026'), cavity * 0.5);
}
function paintMoss(c) {
  const { x, y, z, cavity, edge, ny } = c;
  let col = mix(C('#6a7a3e'), C('#8a9650'), 0.5 + 0.5 * P.fbm(x * 8, y * 8, z * 8, 2, 3));
  col = mix(col, C('#a3b462'), edge * 0.5 + ss(0.6, 1, ny) * 0.15);
  return mix(col, C('#3d5530'), cavity * 0.5);
}
