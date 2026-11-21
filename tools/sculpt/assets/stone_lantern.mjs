// Stone lantern (tōrō) for the shrine and the roadsides — replaces the primitive build of makeStoneLantern
// (src/world/builders/keyobjects.js). Same size (2.66 m), same origin (foot centre), same hex orientation (a corner on +Z),
// same fire box (paper faces at 30/150/270 deg, apothem 0.268, centre y 1.73) so the live paper / flame still fit.
// Story: granite, two hundred years in the rain. Water runs off the roof corners and keeps the north-west side damp;
// moss sits where it lingers (roof top, base shelf); one roof corner was knocked off long ago and has weathered since;
// the lamp has smoked the inside and the stone above the windows.

const hex = (k, r) => [Math.sin((k * Math.PI) / 3) * r, Math.cos((k * Math.PI) / 3) * r];

export default {
  name: 'stone_lantern',
  id: 'sculpt_stone_lantern',
  voxel: 0.006,
  lods: [14000, 3200, 1500],
  lodError: [0.003, 0.012, 0.016], // m: the most a LOD may move the surface (RMS); the jewel and roof ears must survive LOD2
  atlas: 1024,
  ground: 0,
  aoRange: 0.25,
  materials: {
    stone: { name: 'Granite', surface: 'stone', look: { detail: 0.25, bump: 0.3, fine: 0 } },
    moss: { name: 'Moss', surface: 'none', look: { rim: 0.4, trans: 0.25 } },
  },
  anchors: { fire: [0, 1.73, 0] },
  notes: 'Sculpted stone lantern. LOD0 colour atlas + object-space normal map (material extras.normalSpace=object); LOD1/2 vertex colours. Node "fire" = firePos (0,1.73,0). Paper panels and flame stay live from makeStoneLantern. See tools/sculpt/README.md (installing).',

  build({ S }) {
    const granite = { mat: 'stone', paint: paintGranite };
    S.part('freshChip', { mat: 'stone', paint: (c) => paintGranite(c, 0.25) });
    S.part('oldChip', { mat: 'stone', paint: (c) => paintGranite(c, 0.7) });
    // ---- base (kiso): hex plinth with a soft top, sunk panels, a ring of lotus petals
    let base = S.lathe([[0.555, 0], [0.565, 0.012], [0.565, 0.105], [0.535, 0.15], [0.47, 0.19], [0.455, 0.25], [0.39, 0.3], [0.2, 0.31]], { sides: 6 });
    const panel = S.roundBox([0.3, 0.055, 0.04], 0.01).at(0, 0.062, 0.489).around(6, 30);
    base = base.softCut(panel, 0.006);
    let lotus = S.lathe([[0.2, 0.26], [0.33, 0.27], [0.43, 0.285], [0.44, 0.305], [0.4, 0.33], [0.3, 0.35], [0.2, 0.355]], { smooth: 0.008 });
    // petals: V grooves between twelve petals, each petal domed and its tip turned up
    const groove = S.roundBox([0.014, 0.08, 0.3], 0.006).turn(0, 0, 0).at(0, 0.33, 0.33).turn(0, 15, 0);
    lotus = lotus.softCut(groove.around(12), 0.01);
    lotus = lotus.warp((x, y, z, o) => {
      const r = Math.hypot(x, z); let a = Math.atan2(x, z); const sec = Math.PI / 6; a = Math.abs(a - sec * Math.round(a / sec));
      const mid = Math.max(0, 1 - a / 0.26);                 // 1 on a petal's midline
      o[1] = 0.022 * mid * mid * Math.max(0, (r - 0.3) / 0.14) + 0.01 * mid; // dome + lifted tip
    }, { lip: 1.3, grow: 0.04 });
    base = base.softAdd(lotus, 0.012);
    base = base.chisel({ count: 10, depth: 0.01, seed: 11, radius: 0.12, tilt: 0.25, where: (x, y) => y < 0.2 });
    const [bx, bz] = hex(4, 0.565);
    base = base.chip({ at: [bx, 0.1, bz], dir: [bx, 0.5, bz], depth: 0.045, spread: 0.6, seed: 4, paint: 'freshChip' });
    base = base.crack([[0.2, 0.0, 0.47], [0.23, 0.06, 0.47], [0.21, 0.1, 0.46]], { width: 0.007, jag: 0.012, seed: 2 });
    base = base.wear(0.012, { vary: 0.7, seed: 5 });

    // ---- shaft (sao): hand-dressed, a little entasis, a lean, the fushi ring with its two grooves
    let shaft = S.lathe([[0.178, 0.29], [0.168, 0.36], [0.16, 0.52], [0.152, 0.72], [0.19, 0.752], [0.198, 0.8], [0.19, 0.848], [0.15, 0.88], [0.144, 1.06], [0.152, 1.16], [0.18, 1.215], [0.18, 1.235]], { sides: 0 });
    const ringGroove = (y) => S.torus(0.2, 0.006).at(0, y, 0);
    shaft = shaft.softCut(ringGroove(0.772), 0.004).softCut(ringGroove(0.828), 0.004);
    shaft = shaft.chisel({ count: 12, depth: 0.003, seed: 21, radius: 0.14, tilt: 0.08, where: (x, y) => y > 0.34 && y < 1.2 });
    shaft = shaft.turn(0, 0, 0.5);
    shaft = shaft.wear(0.006, { vary: 0.5, seed: 6 });

    // ---- platform (chūdai): hex flare with six petals under the lip
    let plat = S.lathe([[0.15, 1.205], [0.24, 1.26], [0.34, 1.325], [0.405, 1.37], [0.425, 1.4], [0.425, 1.462], [0.395, 1.5], [0.2, 1.505]], { sides: 6 });
    const petal2 = S.ellipsoid([0.085, 0.03, 0.08]).turn(-36, 0, 0).at(0, 1.31, 0.29);
    plat = plat.softAdd(petal2.around(6, 30), 0.02);
    plat = plat.chisel({ count: 8, depth: 0.01, seed: 31, radius: 0.07 });
    plat = plat.wear(0.01, { vary: 0.6, seed: 7 });

    // ---- fire box (hibukuro): sill, walls, lintel, hollow, windows (paper on 30/150/270, moon and crescent on the others)
    let box = S.lathe([[0.36, 1.495], [0.372, 1.525], [0.345, 1.555], [0.33, 1.562], [0.33, 1.913], [0.35, 1.92], [0.372, 1.95], [0.362, 1.992], [0.2, 1.995]], { sides: 6 });
    const hollow = S.lathe([[0.262, 1.565], [0.262, 1.905]], { sides: 6 });
    box = box.cut(hollow);
    const ang = (k) => 30 + 60 * k;
    for (let k = 0; k < 6; k++) {
      let hole;
      if (k % 2 === 0) hole = S.roundBox([0.19, 0.27, 0.3], 0.014).at(0, 1.735, 0.27);
      else if (k === 3) hole = S.cylinder(0.085, 0.3).turn(90, 0, 0).at(0, 1.75, 0.42).cut(S.cylinder(0.075, 0.32).turn(90, 0, 0).at(0.04, 1.77, 0.42));
      else hole = S.cylinder(0.085, 0.3).turn(90, 0, 0).at(0, 1.75, 0.42);
      box = box.cut(hole.turn(0, ang(k), 0));
    }
    const dish = S.lathe([[0.09, 1.562], [0.095, 1.59], [0.075, 1.6], [0.07, 1.585], [0, 1.585]]);
    box = box.add(dish);
    box = box.chisel({ count: 8, depth: 0.008, seed: 41, radius: 0.05 });
    box = box.wear(0.007, { vary: 0.6, seed: 8 });

    // ---- roof (kasa): heavy, concave, corners turned up, hip ridges, curled ears; one corner knocked off
    let roof = S.lathe([[0.3, 1.99], [0.6, 1.99], [0.68, 2.0], [0.705, 2.03], [0.7, 2.06], [0.66, 2.085], [0.56, 2.11], [0.45, 2.16], [0.34, 2.22], [0.23, 2.29], [0.14, 2.34], [0.06, 2.36]], { sides: 6 });
    const lift = (x, y, z, o) => {
      const r = Math.hypot(x, z); if (r < 0.4) return;
      let a = Math.atan2(x, z); const sec = Math.PI / 3; a = Math.abs(a - sec * Math.round(a / sec));
      const c = Math.max(0, 1 - a / 0.42), t = Math.min(1, (r - 0.4) / 0.32);
      o[1] = 0.075 * c * c * t * t;
    };
    const ridge = S.tube([[0, 2.352, 0.06], [0, 2.3, 0.2], [0, 2.215, 0.38], [0, 2.14, 0.56], [0, 2.12, 0.64]], [0.022, 0.03]);
    const ear = S.tube([[0, 2.085, 0.6], [0, 2.105, 0.675], [0, 2.145, 0.705], [0, 2.18, 0.69], [0, 2.175, 0.655], [0, 2.15, 0.655]], (t) => 0.036 - 0.014 * t);
    roof = roof.softAdd(ridge.around(6), 0.03).softAdd(ear.around(6), 0.02);
    roof = roof.warp(lift, { lip: 1.35, grow: 0.08 });
    roof = roof.chisel({ count: 14, depth: 0.012, seed: 51, radius: 0.07, tilt: 0.5, where: (x, y, z) => y > 2.0 && y < 2.1 && Math.hypot(x, z) > 0.6 });
    const [kx, kz] = hex(2, 0.72);
    roof = roof.chip({ at: [kx, 2.17, kz], dir: [kx, 0.55, kz], depth: 0.1, spread: 0.55, seed: 9, rough: 0.006, paint: 'oldChip' });
    roof = roof.crack([[0.0, 2.33, -0.12], [-0.05, 2.25, -0.3], [-0.04, 2.17, -0.47], [-0.07, 2.12, -0.57]], { width: 0.008, jag: 0.015, seed: 3 });
    roof = roof.wear(0.014, { vary: 0.7, seed: 9 });

    // ---- jewel (hōju) on its collar
    const jewel = S.lathe([[0.1, 2.34], [0.135, 2.38], [0.128, 2.405], [0.098, 2.425], [0.115, 2.46], [0.12, 2.5], [0.11, 2.545], [0.08, 2.585], [0.04, 2.625], [0.012, 2.655], [0, 2.665]]).wear(0.006, { seed: 10 });

    let stone = S.union(base, shaft, plat, box, roof, jewel).part('granite', granite);
    // weather over everything: fine pitting where the rain hits
    stone = stone.rough({ type: 'cellular', scale: 0.018, amp: 0.0012, seed: 12 });

    // ---- moss: cushions where rain lingers — roof back slopes near the eave and the base shelf, north-west side
    const rnd = S.prng(77), cushions = [];
    const back = (x, z) => z * 0.8 + x * 0.6 < -0.05;
    for (let tries = 0; cushions.length < 26 && tries < 600; tries++) {
      const hit = roof.probe(rnd, [[-0.6, 0.8, -0.6], [-0.9, 0.6, -0.1], [-0.1, 0.6, -0.9], [-0.7, 0.5, -0.5]], [0, 2.05, 0]);
      if (!hit) continue;
      const [[x, y, z], n] = hit;
      if (!back(x, z) || n[1] < 0.45 || y < 2.08) continue;
      const r = 0.035 + 0.045 * rnd() * Math.max(0.3, 1 - (y - 2.08) / 0.3);
      cushions.push(S.ellipsoid([r * 1.3, r * 0.5, r]).turn(0, rnd() * 180, 0).at(x, y + r * 0.3, z));
    }
    for (let tries = 0; cushions.length < 40 && tries < 600; tries++) {
      const hit = base.probe(rnd, [[-0.5, 1, -0.6]]);
      if (!hit) continue;
      const [[x, y, z], n] = hit;
      if (!back(x, z) || n[1] < 0.5 || y < 0.15 || y > 0.36) continue;
      const r = 0.025 + 0.035 * rnd();
      cushions.push(S.ellipsoid([r * 1.2, r * 0.5, r]).at(x, y + r * 0.2, z));
    }
    const moss = S.softUnion(0.03, ...cushions).rough({ type: 'billow', scale: 0.012, amp: 0.004, seed: 14 })
      .part('moss', { mat: 'moss', paint: paintMoss });
    return stone.softAdd(moss, 0.012);
  },

  // the code-built lantern of the game, rendered with the same camera and light (paper + flame are the live parts)
  async before({ ROOT, threeToMeshes }) {
    const mod = await import(ROOT + '/src/world/builders/keyobjects.js');
    const meshes = threeToMeshes(mod.makeStoneLantern({ moss: true }).group);
    return { meshes, live: meshes.filter((m) => m.emit) };
  },
};

// ---------------------------------------------------------------------------------------------------------------- paint
import * as P from '../sdf.mjs';
function paintGranite(c, weathered = 1) {
  const { x, y, z, nx, ny, nz, ao, cavity, edge, broad } = c;
  // body: warm grey granite with a slow drift between blocks
  let col = P.mix(P.color('#9c978d'), P.color('#aaa499'), 0.5 + 0.5 * P.fbm(x * 2.5, y * 2.5, z * 2.5, 1, 3));
  // crystals: dark mica flecks and pale feldspar
  const f1 = P.cellular(x * 140, y * 140, z * 140, 7), f2 = P.cellular(x * 90 + 3, y * 90, z * 90, 8);
  col = P.mix(col, P.color('#3f3c38'), P.ss(0.22, 0.12, f1) * 0.75);
  col = P.mix(col, P.color('#d9d4c8'), P.ss(0.2, 0.08, f2) * 0.5);
  if (weathered <= 0.3) return P.mix(col, P.color('#c4beb2'), 0.35); // a fresh break: pale and clean
  const w = weathered;
  // rain: grey-green weathering on top faces, damp dark at the foot and in the shade side
  const up = P.ss(0.3, 0.9, ny);
  const damp = P.ss(0.35, 0.0, y) * (0.55 + 0.45 * (1 - ao));
  const northwest = P.ss(0.3, -0.5, z * 0.8 + x * 0.6);
  col = P.mix(col, P.color('#76786a'), up * 0.45 * w);
  col = P.mix(col, P.color('#55534b'), damp * 0.75 * w);
  // streaks running down from the roof corners and the window sills
  const side = 1 - Math.abs(ny);
  const streak = P.ss(0.15, 0.55, P.fbm(x * 18, y * 0.9, z * 18, 5, 3)) * side * P.ss(2.0, 1.2, y) * (0.4 + 0.6 * northwest);
  col = P.mix(col, P.color('#5d5a50'), streak * 0.55 * w);
  // lichen: pale blotches on sides, a few rusty ones on the sunny side
  const lich = P.ss(0.42, 0.28, P.cellular(x * 9, y * 9, z * 9, 3)) * side * P.ss(0.3, 0.9, P.fbm(x * 3, y * 3, z * 3, 9, 2) + 0.5);
  col = P.mix(col, P.color('#c8c8a8'), lich * 0.6 * w);
  const rust = P.ss(0.3, 0.18, P.cellular(x * 14 + 5, y * 14, z * 14, 4)) * P.ss(-0.2, 0.5, -z * 0.8 - x * 0.6) * side;
  col = P.mix(col, P.color('#b98a4a'), rust * 0.5 * w);
  // green in hollows and on up-facing shelves of the damp side
  const green = P.clamp(cavity * 0.8 + broad * 0.6, 0, 1) * (0.4 + 0.6 * northwest) + up * northwest * 0.5;
  col = P.mix(col, P.color('#5c7448'), P.clamp(green, 0, 1) * 0.55 * w);
  // worn edges: pale where hands and weather rub
  col = P.mix(col, P.color('#cdc6b8'), edge * 0.55);
  // soot: inside the fire box, and up over the window heads onto the roof's underside
  const r = Math.hypot(x, z);
  const inside = r < 0.255 && y > 1.55 && y < 1.92 ? 1 : 0;
  const plume = P.ss(1.86, 1.93, y) * P.ss(2.06, 1.98, y) * P.ss(0.42, 0.25, r) * (ny < 0.2 ? 1 : 0.3);
  const under = ny < -0.4 && y < 2.02 && r < 0.45 ? P.ss(0.45, 0.25, r) : 0;
  const soot = P.clamp(inside * 0.85 + plume * 0.8 + under * 0.7, 0, 1) * (0.75 + 0.25 * P.fbm(x * 20, y * 20, z * 20, 6, 2));
  col = P.mix(col, P.color('#2a2622'), soot);
  return col;
}
function paintMoss(c) {
  const { x, y, z, cavity, edge, ny } = c;
  let col = P.mix(P.color('#6f9142'), P.color('#9cb655'), 0.5 + 0.5 * P.fbm(x * 30, y * 30, z * 30, 2, 3));
  col = P.mix(col, P.color('#a7b062'), edge * 0.6 + P.ss(0.6, 1, ny) * 0.15);
  col = P.mix(col, P.color('#3d5530'), cavity * 0.5);
  return col;
}
