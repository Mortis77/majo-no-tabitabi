// bonfire — the camp and village fire pit (replaces prop_bonfire, the Quaternius pack bonfire; catalog `campfire`).
// Batched prop: vertex colours on every LOD, no textures. Flames and light stay code (prop.js flame emitter at the body
// centre + flameY, G.elements light). Foot centre on the ground; the old footprint 1.22 x 1.12 m is kept.
// INTENT
//  silhouette: a low oval crown of field stones with four charred split logs leaning together into a small tent over a pale
//  ash bed — the flame (code) stands in the tent's mouth.
//  big forms: the stone ring / the log tent / the ash bed. Medium: one fallen log across the ash, one big flat sitting
//  stone on the south side, a split stone. Small: charcoal lumps, the alligator cracks of the char, axe-cut log ends.
//  the eye rests on: where the logs meet (black char cracking to pale ends), the soot on the stones' inner faces.
//  wear: stones black inside, sooty on top, clean and pale outside; the logs burnt from below and inside, bark and pale
//  split faces left on the outer, upper ends; ash spilt between two stones toward the downwind side (+x).
//  must NOT look like: a pack campfire (even ring of identical grey lumps, two crossed cylinders, a cone of flame).
import * as P from '../sdf.mjs';
import { C, mix, ss, clamp } from './_smallprops.mjs';
import { obox, norm, cross } from './broom_lib.mjs';

const RX = 0.52, RZ = 0.455;                  // ring centre line (oval)
const rs = P.prng(11);
// 3 large (L, incl. the flat sitting stone S), 5 medium (M), 4 small (s): laid round the oval by their own lengths, so the
// gaps and the rhythm are uneven; a few flat or tilted; tone 0 grey, 1 ochre, 2 blue-grey
const KIND = { S: [0.34, 0.22, 0.075], L: [0.3, 0.2, 0.105], M: [0.23, 0.16, 0.075], s: [0.15, 0.11, 0.054] };
const ORDER = ['S', 'M', 's', 'L', 'M', 's', 'M', 'L', 's', 'M', 's', 'M'];
const TONE = [0, 1, 0, 2, 0, 0, 1, 0, 2, 0, 0, 2];
const STONES = [];
{
  const sizes = ORDER.map((k) => KIND[k][0]), total = sizes.reduce((a, b) => a + b, 0);
  let acc = -Math.PI;                       // the sitting stone on the -z (south) side
  for (let i = 0; i < ORDER.length; i++) {
    const [l, w, h] = KIND[ORDER[i]], j = 0.85 + rs() * 0.3;
    const a = acc + (sizes[i] / total) * Math.PI;
    acc += (sizes[i] / total) * Math.PI * 2;
    const flat = ORDER[i] === 'S' || i === 4 || i === 9;
    STONES.push({ a: a + (rs() - 0.5) * 0.08, l: l * j, w: w * (0.9 + rs() * 0.2), h: h * (flat ? 0.75 : 0.95 + rs() * 0.25), tilt: (ORDER[i] === 's' ? 22 : 12) * (rs() - 0.5) * 2, roll: (rs() - 0.5) * 14, seed: i + 3, big: ORDER[i] === 'S', split: i === 3, tone: TONE[i], kind: ORDER[i], rr: ORDER[i] === 's' ? 0.04 : 0 });
  }
}
const LOGS = [   // foot on the ash at angle a (deg, 0 = +z), the tops meeting over the centre; log 1 leans far out (asymmetry)
  { a: 20, foot: 0.36, top: [0.03, 0.39, -0.01], r: [0.078, 0.055] },
  { a: 118, foot: 0.47, top: [-0.035, 0.33, 0.02], r: [0.086, 0.06] },
  { a: 205, foot: 0.33, top: [0.0, 0.4, 0.035], r: [0.068, 0.05] },
  { a: 290, foot: 0.35, top: [0.025, 0.41, 0.0], r: [0.076, 0.056] },
];
const CROSS = [0.005, 0.39, 0.01];          // where the tent's logs meet (blackest char)
const FALLEN = { a: [-0.6, 0.115, 0.17], b: [0.2, 0.06, 0.03], r: 0.062 };   // rests on a ring stone, sticks out on the west
// a cheap 3D cell noise (distance to nearest jittered point minus second): 0 on cell borders .. 1 inside
function cells(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let d1 = 9, d2 = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const X = ix + a, Y = iy + b, Z = iz + c;
    let h = Math.sin(X * 127.1 + Y * 311.7 + Z * 74.7) * 43758.5453; const fx = h - Math.floor(h);
    h = Math.sin(X * 269.5 + Y * 183.3 + Z * 246.1) * 43758.5453; const fy = h - Math.floor(h);
    h = Math.sin(X * 113.5 + Y * 271.9 + Z * 124.6) * 43758.5453; const fz = h - Math.floor(h);
    const d = Math.hypot(X + fx - x, Y + fy - y, Z + fz - z);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return clamp((d2 - d1) * 3, 0, 1);
}
const stoneAt = (x, z) => { let best = STONES[0], bd = 9; for (const s of STONES) { const d = Math.hypot(x - Math.sin(s.a) * RX, z - Math.cos(s.a) * RZ); if (d < bd) { bd = d; best = s; } } return best; };
function nearestLog(x, y, z) {
  let best = null, bd = 9;
  for (const L of LOGS) {
    const a = L.a * Math.PI / 180, f = [Math.sin(a) * L.foot, 0.05, Math.cos(a) * L.foot], t = L.top;
    const d = [t[0] - f[0], t[1] - f[1], t[2] - f[2]], dl = Math.hypot(...d), u = d.map((v) => v / dl);
    const k = clamp((x - f[0]) * u[0] + (y - f[1]) * u[1] + (z - f[2]) * u[2], 0, dl);
    const q = [f[0] + u[0] * k, f[1] + u[1] * k, f[2] + u[2] * k], dd = Math.hypot(x - q[0], y - q[1], z - q[2]);
    if (dd < bd) { bd = dd; best = { u, k: k / dl, q, foot: f }; }
  }
  return best;
}

export default {
  name: 'bonfire', id: 'sculpt_prop_bonfire',
  voxel: 0.004, lods: [2000, 700, 250], farFrom: 2, farVoxel: 2.2, lodError: [0.0055, 0.014, 0.018], lodTurn: [null, null, 40],
  ground: 0, aoRange: 0.12, cavity: [0.004, 0.02], creaseAngle: 40, bandSlack: 0.012,
  materials: {
    wood: { name: 'Wood', surface: 'bark', look: {} },
    light: { name: 'LightWood', surface: 'bark', look: {} },
    stone: { name: 'Stone', surface: 'stone', look: { detail: 0.2 } },
  },
  gameMats: { wood: 'Wood_bark', light: 'LightWood_bark', stone: 'Stone_stone' },
  replaces: { file: 'assets/models/refined/prop_bonfire.glb', scale: 0.56246 },
  notes: 'Sculpted fire pit: oval ring of ten field stones, four charred split logs leaning into a tent, a fallen log, ash bed. Vertex colours on every LOD, no textures, no flame mesh (flames + light stay code). Families Wood_bark / LightWood_bark as before plus a new Stone_stone.',

  build() {
    const FAR = process.env.SMALLPROPS_FAR === '1';
    // ---- stones
    const st = STONES.map((s) => {
      const cx = Math.sin(s.a) * RX, cz = Math.cos(s.a) * RZ, deg = s.a * 180 / Math.PI;
      let g = P.ellipsoid([s.l / 2, s.h, s.w / 2]).softAdd(P.ellipsoid([s.l * 0.3, s.h * 0.8, s.w * 0.35]).at(s.l * 0.15, s.h * 0.15, 0), 0.03);
      if (FAR) g = P.ellipsoid([s.l / 2 * 1.05, s.h * 1.05, s.w / 2 * 1.05]);   // far: one low dome per stone
      if (!FAR) {
        g = g.chisel({ count: 4, depth: 0.014, radius: 0.09, tilt: 0.45, seed: s.seed, where: (x, y) => y > 0 });
        if (s.split) g = g.cut(P.boxFromTo([-0.004, -0.2, -0.2, 0.004, 0.2, 0.2]).turn(0, 0, 8).at(0.01, 0, 0));
      }
      return g.turn(s.roll, 0, s.tilt).turn(0, deg, 0).at(cx, s.h * 0.25, cz);
    });
    let stones = sunion(st, FAR ? 0.05 : 0.018);
    // far: the domes sit on one low connected ring band, so the simplifier keeps them as bumps instead of shards
    if (FAR) stones = P.softUnion(0.06, stones, P.torus(0.49, 0.045).scale([1, 0.7, RZ / RX]).at(0, 0.0, 0));   // stones that touch blend (no knife-edge contacts)
    if (!FAR) stones = stones.rough({ type: 'fbm', scale: 0.08, amp: 0.004, seed: 5 });
    stones = stones.part('stones', { mat: 'stone', paint: paintStone });
    // ---- ash bed: a low mound, spilt toward +x between two stones, charcoal lumps
    let ash = P.ellipsoid([0.42, 0.055, 0.38]).at(0, 0.0, 0).softAdd(P.ellipsoid([0.13, 0.035, 0.085]).at(0.44, 0, -0.05), 0.05);
    if (!FAR) {
      ash = ash.rough({ type: 'billow', scale: 0.07, amp: 0.008, seed: 2, mask: 'up' });
      const cr = P.prng(9), lumps = [];
      for (let i = 0; i < 9; i++) { const a = cr() * 6.28, r = 0.08 + cr() * 0.22; lumps.push(P.roundBox([0.05 + cr() * 0.04, 0.03, 0.04 + cr() * 0.03], 0.01).turn(0, cr() * 180, (cr() - 0.5) * 30).at(Math.sin(a) * r, 0.034, Math.cos(a) * r)); }
      ash = ash.add(bunion(lumps).part('char', { mat: 'wood', paint: paintChar }));
    }
    ash = ash.part('ash', { mat: 'light', paint: paintAsh });
    ash = ash.cut(P.plane([0, 1, 0], [0, 0.001, 0]));   // drop what is under the ground
    // ---- logs: split logs (a flat split face on the outside-up), axe-cut outer ends, leaning into a tent
    const logs = LOGS.map((L, i) => {
      const a = L.a * Math.PI / 180, foot = [Math.sin(a) * L.foot, 0.05, Math.cos(a) * L.foot];
      const top = L.top;
      let g = P.taperedCapsule(foot, top, L.r[0], L.r[1]);
      if (!FAR) {
        // a split face: cut along the log on its outer upper side
        const dir = [top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]], dl = Math.hypot(...dir);
        const out = [-Math.sin(a), -0.6, -Math.cos(a)];   // the plane's inside (negative side) is what the cut removes
        if (i % 2 === 0) g = g.cut(P.plane(out, [foot[0] + Math.sin(a) * L.r[0] * 0.45, foot[1] + L.r[0] * 0.5, foot[2] + Math.cos(a) * L.r[0] * 0.45]).intersect(P.sphere(dl * 0.7).at((foot[0] + top[0]) / 2, (foot[1] + top[1]) / 2, (foot[2] + top[2]) / 2)), { paintCut: false });
        // axe-cut outer end
        g = g.cut(P.plane([-Math.sin(a) * 0.9, 0.45, -Math.cos(a) * 0.9], [foot[0] + Math.sin(a) * 0.035, foot[1], foot[2] + Math.cos(a) * 0.035]));
        // bark plates: three raised plates per log with a step at their edges
        const pr = P.prng(60 + i), u = dir.map((v) => v / dl);
        for (let k = 0; k < 3; k++) {
          const t = 0.18 + 0.22 * k + pr() * 0.08, ang = pr() * 6.28;
          const side = norm(cross(u, [Math.cos(ang), 0.3, Math.sin(ang)])), nrm = cross(side, u);
          const rr = L.r[0] + (L.r[1] - L.r[0]) * t;
          const c = [foot[0] + dir[0] * t + nrm[0] * rr * 0.92, foot[1] + dir[1] * t + nrm[1] * rr * 0.92, foot[2] + dir[2] * t + nrm[2] * rr * 0.92];
          // a curved plate: the log grown by 7 mm, kept only inside an oriented patch
          const shell = P.taperedCapsule(foot, top, L.r[0] + 0.01, L.r[1] + 0.01);
          g = g.add(shell.intersect(obox(c, side, u, [rr * 0.75, 0.045 + pr() * 0.03, rr * 0.5], 0.006)));
        }
        g = g.rough({ type: 'ridged', scale: 0.03, amp: 0.0035, seed: 20 + i });
      }
      return g;
    });
    let fallen = P.taperedCapsule(FALLEN.a, FALLEN.b, FALLEN.r, FALLEN.r * 0.85);
    if (!FAR) fallen = fallen.rough({ type: 'ridged', scale: 0.03, amp: 0.003, seed: 31 });
    let wood = bunion([...logs, fallen]);
    if (!FAR) wood = wood.wear(0.004, { vary: 0.5, seed: 4 });
    wood = wood.part('logs', { mat: 'wood', paint: paintLog });
    return stones.add(ash).add(wood);
  },
};

function sunion(list, k) { if (list.length === 1) return list[0]; const m = list.length >> 1; return P.softUnion(k, sunion(list.slice(0, m), k), sunion(list.slice(m), k)); }
function bunion(list) { if (list.length === 1) return list[0]; const m = list.length >> 1; return P.union(bunion(list.slice(0, m)), bunion(list.slice(m))); }

// colour: stone near the game's carved stone #a59c90, soot inside, ash pale grey, char black with ember-red cracks
function paintStone(c) {
  const { x, y, z, nx, nz, ny, cavity, edge } = c;
  const S = stoneAt(x, z), top = S.h * 1.2;
  const r = Math.hypot(x, z) || 1, inward = -(nx * x + nz * z) / r;     // 1 = facing the fire
  const base = [['#b2a898', '#9a9082'], ['#b8a07a', '#a08862'], ['#9ea2a2', '#868a8c']][S.tone];
  let col = mix(C(base[0]), C(base[1]), 0.5 + 0.5 * P.fbm(x * 6, y * 6, z * 6, 4, 2));
  col = col.map((v) => v * (S.kind === 's' ? 0.94 : S.kind === 'L' ? 1.03 : 1));
  col = mix(col, C('#c8bca8'), ss(0.2, 0.8, ny) * 0.35);                               // sun on the tops
  // soot: black-brown on the faces toward the fire, up to about half the stone's height, a smudge over the inner rim
  const soot = ss(-0.15, 0.55, inward) * ss(top * 0.62, top * 0.38, y);
  col = mix(col, C('#2e2620'), clamp(soot * 0.9 + ss(0.4, 0.33, r) * 0.5, 0, 0.92));
  col = mix(col, C('#5a5048'), ss(0.0, 0.6, inward) * ss(0.3, 0.9, ny) * 0.35);
  col = mix(col, C('#6a645c'), ss(0.05, 0.0, y) * 0.4);                                // damp foot
  col = mix(col, C('#d8ccb8'), edge * 0.35 * (1 - soot));
  return mix(col, C('#4a4440'), cavity * 0.5);
}
function paintAsh(c) {
  const { x, y, z, cavity } = c;
  const r = Math.hypot(x, z);
  let col = mix(C('#cfcac2'), C('#a8a29a'), 0.5 + 0.5 * P.fbm(x * 12, 0, z * 12, 6, 2));
  col = mix(col, C('#2e2a28'), ss(0.24, 0.06, r) * 0.75);                            // black under the logs
  const ember = ss(0.12, 0.0, r) * ss(0.45, 0.75, P.fbm(x * 30, 0, z * 30, 8, 2) + 0.5);
  col = mix(col, C('#b8441e'), ember * 0.8);
  return mix(col, C('#5a5450'), cavity * 0.4);
}
function paintChar(c) {
  const { x, y, z, edge } = c;
  let col = mix(C('#262220'), C('#3a3430'), 0.5 + 0.5 * P.fbm(x * 40, y * 40, z * 40, 3, 2));
  return mix(col, C('#7a7068'), edge * 0.5);
}
function paintLog(c) {
  const { x, y, z, nx, ny, nz, cavity, edge } = c;
  const L = nearestLog(x, y, z);
  const dc = Math.hypot(x - CROSS[0], y - CROSS[1], z - CROSS[2]);
  // char: black at the tent crossing and on the faces toward the flame, fading to grey-brown bark at the feet
  const toFlame = L ? -((x - L.q[0]) * x + (z - L.q[2]) * z) / ((Math.hypot(x - L.q[0], z - L.q[2]) || 1) * (Math.hypot(x, z) || 1)) : 0;
  const burn = clamp(ss(0.3, 0.08, dc) + ss(0.0, 0.8, toFlame) * ss(0.36, 0.14, Math.hypot(x, z)) * 0.7 + ss(-0.2, -0.6, ny) * ss(0.3, 0.15, Math.hypot(x, z)) * 0.5, 0, 1);
  const bark = mix(C('#86725e'), C('#6e5c4a'), 0.5 + 0.5 * P.fbm(x * 25, y * 25, z * 25, 2, 2));
  let col = bark;
  // cut ends: a face along the log axis shows pale wood with growth rings; a split face (up) pale long grain
  const endFace = L ? Math.abs(nx * L.u[0] + ny * L.u[1] + nz * L.u[2]) : 0;
  if (L && endFace > 0.8 && L.k < 0.12) {
    const rr = Math.hypot(x - L.q[0], y - L.q[1], z - L.q[2]);
    col = mix(C('#c8a272'), C('#a47c52'), 0.5 + 0.5 * Math.sin(rr * 520));
    col = mix(col, C('#7a5638'), ss(0.04, 0.07, rr) * 0.6);                            // the bark rim of the cut
  }
  // alligator char: dark blocks, grey edges; dull ember only in the cracks the flame touches
  const cl = cells(x * 38, y * 38, z * 38);
  let charC = mix(C('#2e2824'), C('#1e1a18'), cl);
  const ember = ss(0.22, 0.05, cl) * ss(0.5, 0.9, burn) * ss(0.3, 0.12, dc + 0.1 * (1 - toFlame));
  charC = mix(charC, C('#8a2c16'), ember * 0.85);
  col = mix(col, charC, burn);
  col = mix(col, C('#9a9088'), ss(0.35, 0.7, burn) * ss(0.85, 1, cl) * edge * 0.5);   // white ash on burnt edges
  return mix(col, C('#2a1e16'), cavity * 0.4);
}
