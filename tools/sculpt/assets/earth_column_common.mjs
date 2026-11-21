// Shared helper for the earth-spell (岩起) column family: earth_column_a / _b / _c and earth_rubble.
// Not an asset by itself (no default export). Holds: the game's numbers for the pillar, a convex prism field with shear
// and tilted cap, polygon tools (jagged outlines, Voronoi cells), surface marching, the clinging soil / roots / caught
// pebbles that every column wears on its lower third, the shared paint, and the "before" (the game's 7-sided prism).
import * as S from '../sdf.mjs';

// ---- the game's pillar (src/spells/entities.js S.spawnPillar): R 2.4, H 6.6; at rest the mesh base is 0.6 m under the
// ground and the top 6.0 m above it. Here the pivot is the base centre AT GROUND LEVEL, so the column spans y -0.6 .. 6.0.
export const R = 2.4, H = 6.6, DEPTH = 0.6, TOP = H - DEPTH;
export const COL_R = 0.9 * R;   // 2.16: collider / platform radius — bulk stays inside
export const FLAT_R = 0.8 * R;  // 1.92: the standable top is flat at least this far out
export const Y0 = -DEPTH;

export const MATERIALS = { rock: { name: 'EarthRock', surface: 'rock', look: { detail: 0.3, bump: 0.35, fine: 0.25 } } };

// ------------------------------------------------------------------------------------------------------- polygons
/** jagged convex-ish outline: n corners about radius r, jittered in radius and angle (CCW in x/z) */
export function jagPoly(n, r, rnd, jr = 0.1, ja = 0.25, rot = 0) {
  const o = [];
  for (let i = 0; i < n; i++) {
    const a = rot + ((i + (rnd() - 0.5) * ja) / n) * 2 * Math.PI, rr = r * (1 + (rnd() - 0.5) * 2 * jr);
    o.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return o;
}
/** keep the part of a convex polygon where nx*x + nz*z <= c (Sutherland-Hodgman, one plane) */
export function clipPoly(P, nx, nz, c) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da < 0) !== (db < 0) && da !== db) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
/** Voronoi cells of `seeds` inside outline `outer`, each shrunk by gap/2 from the bisectors */
export function voronoi(outer, seeds, gap) {
  return seeds.map((s, i) => {
    let P = outer.slice();
    seeds.forEach((t, j) => {
      if (i === j) return;
      const dx = t[0] - s[0], dz = t[1] - s[1], l = Math.hypot(dx, dz), nx = dx / l, nz = dz / l;
      const mx = (s[0] + t[0]) / 2, mz = (s[1] + t[1]) / 2;
      P = clipPoly(P, nx, nz, nx * mx + nz * mz - gap / 2);
    });
    return P;
  });
}
export const centroid = (P) => P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length], [0, 0]);

/**
 * Convex prism from outline P (x/z) between y0 and y1.
 * shear [sx, sz]: m of sideways drift per m of height (a leaning prism whose cap stays level unless tilted);
 * tilt [tx, tz]: the cap's slope (dy per m of x / z).
 */
export function prism(P, y0, y1, { shear = [0, 0], tilt = [0, 0], tiltBot = [0, 0] } = {}) {
  const c = centroid(P), E = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    let nx = b[1] - a[1], nz = -(b[0] - a[0]); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx * (c[0] - a[0]) + nz * (c[1] - a[1]) > 0) { nx = -nx; nz = -nz; }
    E.push([nx, nz, nx * a[0] + nz * a[1]]);
  }
  const [sx, sz] = shear, [tx, tz] = tilt, [bx, bz] = tiltBot;
  const tl = Math.hypot(1, tx, tz), bl = Math.hypot(1, bx, bz);
  const f = (x, y, z) => {
    const qx = x - sx * (y - y0) - c[0], qz = z - sz * (y - y0) - c[1];
    let side = -1e9;
    for (let i = 0; i < E.length; i++) { const e = E[i]; const v = e[0] * (qx + c[0]) + e[1] * (qz + c[1]) - e[2]; if (v > side) side = v; }
    const top = (y - (y1 + tx * qx + tz * qz)) / tl, bot = ((y0 + bx * qx + bz * qz) - y) / bl;
    const v = Math.max(top, bot);
    return side > 0 && v > 0 ? Math.hypot(side, v) : Math.max(side, v);
  };
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const h = y1 - y0, pad = 0.3 * Math.max(Math.abs(tx), Math.abs(tz), Math.abs(bx), Math.abs(bz)) * 3;
  const b = [Math.min(x0, x0 + sx * h) - 0.01, y0 - pad - 0.01, Math.min(z0, z0 + sz * h) - 0.01, Math.max(x1, x1 + sx * h) + 0.01, y1 + pad + 0.01, Math.max(z1, z1 + sz * h) + 0.01];
  return new S.Shape(f, b, null, 1.15);
}

// ------------------------------------------------------------------------------------------------ surface marching
/** the surface point of `shape` on the ray from the axis at angle a (rad, from +x toward +z), height y */
export function surf(shape, a, y, rMax = 3.4) {
  const ca = Math.cos(a), sa = Math.sin(a);
  let lo = 0.0, hi = rMax;
  if (shape.f(hi * ca, y, hi * sa) < 0) return null;
  // step in from outside so a hollow at the axis cannot fool the bisection
  for (let r = rMax; r > 0; r -= 0.03) if (shape.f(r * ca, y, r * sa) < 0) { lo = r; hi = r + 0.03; break; }
  if (lo === 0) return null;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (shape.f(m * ca, y, m * sa) < 0) lo = m; else hi = m; }
  const p = [hi * ca, y, hi * sa];
  return { p, n: shape.normal(p[0], p[1], p[2], [0, 0, 0], 2e-3), r: hi };
}
/** a jagged crack running over the surface from (a0, y0) to (a1, y1), drifting sideways */
export function crackPath(shape, a0, y0, a1, y1, steps, rnd, wander = 0.03) {
  const pts = [];
  let da = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; da += (rnd() - 0.5) * wander;
    const s = surf(shape, a0 + (a1 - a0) * t + da, y0 + (y1 - y0) * t);
    if (s) pts.push([s.p[0] - s.n[0] * 0.01, s.p[1], s.p[2] - s.n[2] * 0.01]);
  }
  return pts;
}

/**
 * A bounded break (kit chip() is an unbounded cone: tilted up, it carves a strip far up a tall face). Three planes
 * behind `at`, limited to a ball of radius ~2.2 x depth around `at`; the break face gets part `paint`.
 */
export function brk(shape, { at, dir, depth = 0.2, spread = 0.5, seed = 1, rough = 0.012, ball = 2.2, paint = 'fresh' }) {
  const rnd = S.prng(seed * 31 + 5), n = S.norm(dir);
  const c = [at[0] - n[0] * depth, at[1] - n[1] * depth, at[2] - n[2] * depth];
  const t1 = S.norm(S.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = S.cross(n, t1), planes = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 2 * Math.PI + rnd() * 1.2, s = spread * (0.7 + 0.6 * rnd());
    planes.push(S.norm([0, 1, 2].map((k) => n[k] + s * (Math.cos(a) * t1[k] + Math.sin(a) * t2[k]))));
  }
  const rb = depth * ball, f = shape.f, pf = shape.pf, sd = seed * 13 + 1;
  const cutF = (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    let k = -1e9; for (const p of planes) { const v = -(px * p[0] + py * p[1] + pz * p[2]); if (v > k) k = v; }
    k += rough * S.fbm(x * 9, y * 9, z * 9, sd, 2);
    return Math.max(k, Math.hypot(x - at[0], y - at[1], z - at[2]) - rb); // < 0 inside the removed piece
  };
  const P = S.part(paint);
  return new S.Shape((x, y, z) => Math.max(f(x, y, z), -cutF(x, y, z)), shape.b,
    (x, y, z) => (-cutF(x, y, z) >= f(x, y, z) - 2e-3 ? P : pf(x, y, z)), shape.lip + 0.2);
}
/**
 * V-grooved seams along the Voronoi bisectors of `seeds` (x/z): open `w` at the surface, closing `dmax` deep, on the
 * sides and the top alike. The prisms stay one solid (no slots with inner walls that eat the triangle budget).
 */
export function seamGroove(shape, seeds, { w = 0.07, dmax = 0.3, warp = null } = {}) {
  const f = shape.f, pf = shape.pf;
  const seamDist = (x, z) => {
    let i1 = -1, d1 = 1e9, i2 = -1, d2 = 1e9;
    for (let i = 0; i < seeds.length; i++) { const d = (x - seeds[i][0]) ** 2 + (z - seeds[i][1]) ** 2; if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d2 = d; i2 = i; } }
    const a = seeds[i1], b = seeds[i2];
    return (d2 - d1) / (2 * Math.hypot(a[0] - b[0], a[1] - b[1]));
  };
  const cutF = (x, y, z, d) => {
    let qx = x, qz = z; if (warp) { const o = warp(x, y, z); qx += o[0]; qz += o[1]; }
    return seamDist(qx, qz) + Math.max(0, -d) * (w / dmax) - w * 0.5;
  };
  return new S.Shape((x, y, z) => { const d = f(x, y, z); if (d > 0.1) return d; return Math.max(d, -cutF(x, y, z, d)); }, shape.b, pf, shape.lip + 0.5);
}
/** a sleeve of soil hugging the foot: `thick` m at the bottom thinning upward, ragged top edge between yLo and yHi */
export function soilSleeve(stone, { yLo = 0.2, yHi = 1.6, thick = 0.16, seed = 7, patch: pb = 0.75 } = {}) {
  const f = stone.f;
  const top = (x, z) => { const a = Math.atan2(z, x); return yLo + (yHi - yLo) * S.clamp(0.5 + 0.9 * S.fbm(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0, seed, 3) + 0.25 * S.fbm(x * 2.5, 0, z * 2.5, seed + 1, 2), 0, 1); };
  const g = (x, y, z) => {
    const h = top(x, z), patch = S.clamp(pb + 1.4 * S.fbm(x * 0.9, y * 0.6, z * 0.9, seed + 2, 2), 0, 1.2);
    const t = thick * S.clamp(1.1 - (y - Y0) / (h - Y0 + 0.01), 0.25, 1) * patch - 0.03;
    return Math.max(f(x, y, z) - t, (y - h) * 0.7, Y0 - y);
  };
  const b = stone.b;
  return new S.Shape(g, [b[0] - thick, Y0, b[2] - thick, b[3] + thick, yHi + 0.1, b[5] + thick], null, 1.4);
}

// ------------------------------------------------------------------------------------------ soil, roots, pebbles
/** cakes of soil pressed onto the lower third (more and bigger toward the foot; not on overhangs) */
export function soilCakes(stone, rnd, { count = 22, yTop = 2.1, rMin = 0.14, rMax = 0.38, skip = () => false } = {}) {
  const cakes = [];
  for (let tries = 0; cakes.length < count && tries < count * 20; tries++) {
    const a = rnd() * 2 * Math.PI, u = Math.pow(rnd(), 1.7), y = Y0 + 0.1 + u * (yTop - Y0 - 0.1);
    if (skip(a, y)) continue;
    const s = surf(stone, a, y); if (!s || s.n[1] < -0.25) continue;
    const big = 1 - u * 0.65, r = (rMin + (rMax - rMin) * rnd()) * big;
    cakes.push(S.ellipsoid([r * 1.2, r * 0.65, r * (0.8 + 0.4 * rnd())]).turn(0, rnd() * 180, 0).aim(s.n)
      .at(s.p[0] + s.n[0] * r * 0.05, s.p[1] - r * 0.15, s.p[2] + s.n[2] * r * 0.05));
  }
  return cakes;
}
/** roots torn up with the rock: they start on the lower third, run down the face and some hang free at the end */
export function roots(stone, rnd, { count = 7, yTop = [1.2, 2.3], rad = [0.05, 0.075], dangleP = 0.45, stick = 0.55, rootlets = 0.7 } = {}) {
  const out = [];
  for (let k = 0; k < count; k++) {
    let a = rnd() * 2 * Math.PI, y = yTop[0] + rnd() * (yTop[1] - yTop[0]);
    const r0 = rad[0] + rnd() * (rad[1] - rad[0]), pts = [];
    const drift = (rnd() - 0.5) * 0.08, dangle = rnd() < dangleP;
    const stop = dangle ? 0.2 + rnd() * 0.9 : Y0 + 0.15;
    while (y > stop) {
      const s = surf(stone, a, y); if (!s) break;
      if (s.n[1] < -0.3 && pts.length > 2) break;     // runs off under an overhang: let it hang from here
      pts.push([s.p[0] + s.n[0] * r0 * stick, y, s.p[2] + s.n[2] * r0 * stick]);
      y -= 0.22 + rnd() * 0.12; a += drift + (rnd() - 0.5) * 0.06;
    }
    if (pts.length < 3) continue;
    if (dangle) { // the free end: out from the face, then down, curling
      const l = pts[pts.length - 1], ox = l[0] / Math.hypot(l[0], l[2]), oz = l[2] / Math.hypot(l[0], l[2]);
      pts.push([l[0] + ox * 0.14, l[1] - 0.2, l[2] + oz * 0.14], [l[0] + ox * 0.22 + (rnd() - 0.5) * 0.1, l[1] - 0.48, l[2] + oz * 0.22 + (rnd() - 0.5) * 0.1]);
    }
    out.push(S.tube(pts, (t) => r0 * (1 - 0.55 * t) + 0.004));
    // a side rootlet off the upper half
    if (pts.length > 4 && rnd() < rootlets) {
      const i = 1 + Math.floor(rnd() * (pts.length / 2)), p = pts[i], side = rnd() < 0.5 ? 1 : -1;
      const a2 = Math.atan2(p[2], p[0]) + side * 0.22;
      const q1 = surf(stone, a2, p[1] - 0.35), q2 = surf(stone, a2 + side * 0.12, p[1] - 0.8);
      if (q1 && q2) out.push(S.tube([p, [q1.p[0] + q1.n[0] * 0.03, q1.p[1], q1.p[2] + q1.n[2] * 0.03], [q2.p[0] + q2.n[0] * 0.03, q2.p[1], q2.p[2] + q2.n[2] * 0.03]], (t) => r0 * 0.6 * (1 - 0.5 * t) + 0.004));
    }
  }
  return out;
}
/** small stones caught in cracks / seams: points [x,y,z] with the outward normal n */
export function pebbles(spots, rnd, size = [0.07, 0.15]) {
  return spots.map(([p, n]) => {
    const r = size[0] + rnd() * (size[1] - size[0]);
    return S.ellipsoid([r * (0.9 + 0.5 * rnd()), r * (0.6 + 0.3 * rnd()), r * (0.8 + 0.4 * rnd())]).turn(rnd() * 40, rnd() * 180, rnd() * 40)
      .at(p[0] + n[0] * r * 0.15, p[1], p[2] + n[2] * r * 0.15);
  });
}

// ---------------------------------------------------------------------------------------------------------- paint
const hash = (i, s = 0) => { let h = (i * 374761393 + s * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/**
 * Rock paint, neutral grey (the game tints it by land). Strata bands of different value along `dip` (a unit-ish up
 * vector of the bedding), a darker, damp, soil-stained lower part, pale worn edges, a dusty top, pale fresh breaks.
 */
export function rockPaint({ spacing = 0.55, dip = [0, 1, 0], wob = 0.25, bands = 0.16, seed = 1 } = {}) {
  return (c, fresh = 0) => {
    const { x, y, z, ny, ao, edge, cavity } = c;
    const P = S;
    // bedding: uneven band widths (the band index runs faster or slower with a slow noise), a dark parting only on
    // some band feet, value steps between bands that you can read from the game camera
    const h0 = x * dip[0] + y * dip[1] + z * dip[2] + wob * P.fbm(x * 0.35, y * 0.35, z * 0.35, seed, 2);
    const u = h0 / spacing + 0.45 * P.fbm(0, h0 * 0.22, 0, seed + 2, 2);
    const bi = Math.floor(u), fr = u - bi;
    const v = 1 + (hash(bi + 50, seed) - 0.5) * 2 * bands;
    const warm = hash(bi + 90, seed + 3) - 0.5, parting = hash(bi + 7, seed + 5) > 0.55 ? 1 : 0;
    let col = P.mix(P.color('#8d8a85'), P.color('#9b968d'), 0.5 + 0.5 * P.fbm(x * 0.8, y * 0.8, z * 0.8, seed + 4, 3));
    col = [col[0] * v * (1 + warm * 0.08), col[1] * v, col[2] * v * (1 - warm * 0.08)];
    col = P.mix(col, P.color('#5f5a54'), P.ss(0.07, 0.0, fr) * 0.55 * parting);
    // speckle grain (small, low contrast — the game adds its own fine layer)
    col = P.mix(col, P.color('#6c6862'), P.ss(0.3, 0.15, P.cellular(x * 9, y * 9, z * 9, seed + 7)) * 0.25);
    if (fresh) return P.mix(col, P.color('#c9c0b0'), 0.6 * fresh);
    // run-off streaks on the sides
    const side = 1 - Math.abs(ny);
    const streak = P.ss(0.2, 0.6, P.fbm(x * 3.2, y * 0.25, z * 3.2, seed + 9, 3)) * side * P.ss(0.3, 3.5, y);
    col = P.mix(col, P.color('#6d6a64'), streak * 0.35);
    // damp, soil-stained lower part: darkest at and under the ground line
    const damp = P.ss(2.3, -0.1, y + 0.3 * P.fbm(x * 0.9, 0, z * 0.9, seed + 11, 2)) * (0.75 + 0.25 * (1 - ao));
    col = P.mix(col, P.color('#5a5047'), damp * 0.55);
    col = P.mix(col, P.color('#3f3832'), P.ss(0.25, -0.35, y) * 0.6);
    // worn edges pale (less where damp), dust on up-facing ledges, the top a dry pale skin with soil crumbs
    col = P.mix(col, P.color('#cbc6bc'), edge * 0.55 * (1 - damp * 0.7));
    const up = P.ss(0.55, 0.95, ny);
    col = P.mix(col, P.color('#aaa396'), up * 0.35);
    if (y > TOP - 0.25 && ny > 0.8) {
      const crumbs = P.ss(0.1, 0.55, P.fbm(x * 0.9, 0, z * 0.9, seed + 15, 3)) * 0.8 + P.ss(0.3, 0.6, P.fbm(x * 4, 0, z * 4, seed + 13, 2)) * 0.3;
      col = P.mix(col, P.color('#7c6a55'), P.clamp(crumbs, 0, 1) * 0.5);
    }
    col = P.mix(col, P.color('#4c4640'), cavity * 0.3);
    return col;
  };
}
export function paintSoil(c) {
  const { x, y, z, ny, cavity, edge } = c;
  let col = S.mix(S.color('#5e4a3a'), S.color('#7a614b'), 0.5 + 0.5 * S.fbm(x * 4, y * 4, z * 4, 21, 3));
  col = S.mix(col, S.color('#8f7760'), S.ss(0.3, 0.9, ny) * 0.5 + edge * 0.3); // dry crust on top
  col = S.mix(col, S.color('#857a6c'), S.ss(0.22, 0.1, S.cellular(x * 3, y * 3, z * 3, 23)) * 0.25); // grit (big, low contrast)
  col = S.mix(col, S.color('#3a2e25'), cavity * 0.4 + S.ss(0.3, -0.4, y) * 0.4);
  return col;
}
export function paintRoot(c) {
  const { x, y, z, edge } = c;
  let col = S.mix(S.color('#4a3829'), S.color('#6e5641'), 0.5 + 0.5 * S.fbm(x * 12, y * 3, z * 12, 31, 2));
  return S.mix(col, S.color('#8a7560'), edge * 0.5);
}
export function paintPebble(c) {
  const { x, y, z, edge } = c;
  const k = Math.floor(S.noise3(x * 3, y * 3, z * 3, 41) * 6 + 6);
  const base = [S.color('#a29d93'), S.color('#7f7a72'), S.color('#b1a58f'), S.color('#6e6a66'), S.color('#958c7e')][k % 5];
  return S.mix(base, S.color('#b3ada2'), S.ss(0.4, 0.9, edge) * 0.25);
}
/** register the shared parts once per build */
export function parts(rock) {
  S.part('rock', { mat: 'rock', paint: (c) => rock(c, 0) });
  S.part('fresh', { mat: 'rock', paint: (c) => rock(c, 1) });
  S.part('soil', { mat: 'rock', paint: paintSoil });
  S.part('root', { mat: 'rock', paint: paintRoot });
  S.part('pebble', { mat: 'rock', paint: paintPebble });
}

// ---------------------------------------------------------------------------------------------------------- before
/** the game's present pillar (V.pillarGeo: jittered 7-sided prism with vertex colours), placed as it stands at rest */
export async function beforePillar({ ROOT, threeToMeshes }, rotY = 0) {
  const THREE = await import(ROOT + '/node_modules/three/build/three.module.js');
  const { hash2 } = await import(ROOT + '/src/core/util.js');
  // copy of pillarGeometry() in src/spells/visuals.js (that module needs the running game to import)
  const g = new THREE.CylinderGeometry(0.88, 1.05, 1, 7, 4);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const j = 1 + (hash2(Math.round(a * 10), Math.round(y * 8)) - 0.5) * 0.22;
    if (Math.hypot(x, z) > 0.01) { p.setX(i, x * j); p.setZ(i, z * j); }
    if (y > 0.99) p.setY(i, 1 + (hash2(Math.round(x * 9), Math.round(z * 9)) - 0.5) * 0.06);
  }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color(), base = new THREE.Color(0x5b534f), mid = new THREE.Color(0x9a8c7c), rim = new THREE.Color(0xc4b8a4), moss = new THREE.Color(0x7d9a52);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0.995 && Math.hypot(p.getX(i), p.getZ(i)) < 0.8) c.copy(moss);
    else if (y > 0.9) c.copy(rim);
    else c.copy(base).lerp(mid, Math.min(1, y * 1.3));
    const n = hash2(Math.round(y * 9), i % 7) * 0.12 - 0.06;
    col[i * 3] = c.r + n; col[i * 3 + 1] = c.g + n; col[i * 3 + 2] = c.b + n;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.scale.set(R, H, R); mesh.position.y = -DEPTH; mesh.rotation.y = rotY;
  const grp = new THREE.Group(); grp.add(mesh);
  return { meshes: threeToMeshes(grp) };
}

// ------------------------------------------------------------------------------------------- bedding (geometric)
/** irregular bed boundaries along a dipped height axis: [{ y0, y1, inset, value, parting }] from `from` to `to` */
export function beds(rnd, from, to, { mean = 0.6, spread = 0.6, inset = 0.07, values = 0.2 } = {}) {
  const out = []; let y = from;
  while (y < to) {
    const t = mean * (1 + (rnd() - 0.5) * 2 * spread), y1 = Math.min(to + 1, y + t);
    out.push({ y0: y, y1, inset: rnd() < 0.35 ? inset * (0.6 + 0.8 * rnd()) : inset * 0.15 * rnd(), value: 1 + (rnd() - 0.5) * 2 * values, warm: rnd() - 0.5, parting: rnd() < 0.5 });
    y = y1;
  }
  return out;
}
/** height along the bedding normal `dip` (unit), with a slow wobble so beds are not ruler-straight */
export const bedH = (dip, x, y, z, wob = 0.08, seed = 3) => x * dip[0] + y * dip[1] + z * dip[2] + wob * S.fbm(x * 0.45, y * 0.2, z * 0.45, seed, 2);
export function bedAt(B, h) { let lo = 0, hi = B.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m].y1 <= h) lo = m + 1; else hi = m; } return B[lo]; }
/** recess some beds into the rock (soft step `soft` m wide), and cut a narrow parting groove at some bed feet */
export function bedLedges(shape, B, dip, { soft = 0.05, groove = 0.035, gw = 0.03, wob = 0.08, seed = 3, from = -9, to = 99 } = {}) {
  const f = shape.f, b = shape.b;
  const g = (x, y, z) => {
    const d = f(x, y, z); if (d > 0.25 || d < -0.4) return d;
    const h = bedH(dip, x, y, z, wob, seed); if (h < from || h > to) return d;
    const k = bedAt(B, h); let off = k.inset;
    // blend toward the neighbour across each boundary
    const i = B.indexOf(k);
    if (h - k.y0 < soft && i > 0) off = B[i - 1].inset + (off - B[i - 1].inset) * S.ss(-soft, soft, h - k.y0);
    else if (k.y1 - h < soft && i < B.length - 1) off = B[i + 1].inset + (off - B[i + 1].inset) * S.ss(-soft, soft, k.y1 - h);
    let r = d + off;
    if (k.parting) { const q = Math.abs(h - k.y0); if (q < gw) r += groove * (1 - q / gw); }
    return r;
  };
  return new S.Shape(g, [b[0] - 0.05, b[1], b[2] - 0.05, b[3] + 0.05, b[4], b[5] + 0.05], shape.pf, shape.lip * 1.6 + 0.6);
}

// ================================================================================================= revision 2 (one family)
// All three columns now speak one language: a bundle of hexagonal-ish basalt prisms with horizontal cross joints (drums),
// vertical V-seams between prisms, a broken crown, soil and roots at the foot. Variants differ only in prism count, how
// the crown is broken and the lean. Strata = the cross joints: every bed boundary is a joint height shared by all prisms,
// the paint changes value there and the part alternates (rock / rockB, same material and paint) so the simplifier keeps
// the boundary as a guarded edge loop and LOD1's vertex colours keep the bands.

/** drum registry filled by buildColumn (same in every worker: the build is seeded) and read by the paint */
export const REG = { cells: [], lean: [0, 0] };

/** bed boundary heights from `from` to `to` (uneven) */
export function bedHeights(rnd, from, to, mean = 0.85, spread = 0.45) {
  const out = []; let y = from + mean * (0.5 + rnd() * 0.5);
  while (y < to) { out.push(y); y += mean * (1 + (rnd() - 0.5) * 2 * spread); }
  return out;
}
const bedIndex = (B, y) => { let i = 0; while (i < B.length && y >= B[i]) i++; return i; };

/** neutral rock paint keyed to the bed heights (the game tints by land) */
export function prismPaint(B, { seed = 1, bands = 0.11 } = {}) {
  return (c, fresh = 0) => {
    const { x, y, z, ny, ao, edge, cavity } = c;
    // which prism, which drum: each drum its own value (the cross joints carry the value steps, so LOD1 keeps them)
    const [ci, di, cuts] = drumAt(x, y, z);
    const bi = bedIndex(B, y), gs = Math.sin(y * 1.9 + 1.3 * S.fbm(x * 0.3, y * 0.2, z * 0.3, seed + 1, 2)); // broad soft strata
    // drum value, blended over +-6 cm across each joint (the joint is a V-notch in the mesh; a hard colour step there
    // stair-steps at 44 mm per texel)
    const dv = (d) => hash(ci * 17 + d + 50, seed) - 0.5, dw = (d) => hash(ci * 5 + d + 90, seed + 3) - 0.5;
    let vv = dv(di), ww = dw(di);
    if (di > 0) { const t = S.ss(-0.06, 0.06, y - cuts[di - 1]); vv = dv(di - 1) + (vv - dv(di - 1)) * t; ww = dw(di - 1) + (ww - dw(di - 1)) * t; }
    if (di < cuts.length) { const t = S.ss(0.06, -0.06, cuts[di] - y) * 0.5; vv += (dv(di + 1) - vv) * t; ww += (dw(di + 1) - ww) * t; }
    const v = (1 + vv * 2 * bands) * (1 + 0.07 * gs), warm = ww;
    let col = S.mix(S.color('#8b8882'), S.color('#99948b'), 0.5 + 0.6 * S.fbm(x * 0.6, y * 0.35, z * 0.6, seed + 4, 2));
    col = [col[0] * v * (1 + warm * 0.09), col[1] * v, col[2] * v * (1 - warm * 0.09)];
    // a darker parting just above some joints (soft, ~8 cm: several texels)
    const below = di > 0 ? y - cuts[di - 1] : 9;
    if (hash(ci * 11 + di + 7, seed + 5) > 0.45) col = S.mix(col, S.color('#625d57'), S.ss(0.16, 0.0, below) * 0.4);
    const up = S.ss(0.55, 0.95, ny);
    if (fresh) {
      col = S.mix(col, S.color('#c4bba9'), 0.45 * fresh);
      return S.mix(col, S.color('#a39a8b'), S.ss(0.2, 0.7, S.fbm(x * 1.2, y * 1.2, z * 1.2, seed + 7, 2)) * 0.25);
    }
    // run-off streaks on the sides, broad and few
    const side = 1 - Math.abs(ny);
    col = S.mix(col, S.color('#6f6b65'), S.ss(0.25, 0.65, S.fbm(x * 1.6, y * 0.18, z * 1.6, seed + 9, 2)) * side * S.ss(0.5, 3.5, y) * 0.3);
    // damp, soil-stained lower part, darkest at the ground line
    const damp = S.ss(2.4, -0.1, y + 0.35 * S.fbm(x * 0.7, 0, z * 0.7, seed + 11, 2)) * (0.8 + 0.2 * (1 - ao));
    col = S.mix(col, S.color('#5a5047'), damp * 0.55);
    col = S.mix(col, S.color('#3f3832'), S.ss(0.25, -0.35, y) * 0.6);
    // worn edges pale (not where damp), dust and a little grit only on up-facing tops
    col = S.mix(col, S.color('#bdb7ab'), S.ss(0.3, 0.85, edge) * 0.3 * (1 - damp));
    col = S.mix(col, S.color('#a9a295'), up * 0.32);
    col = S.mix(col, S.color('#857f75'), up * S.ss(0.15, 0.6, S.fbm(x * 1.5, 0, z * 1.5, seed + 13, 2)) * 0.25);
    if (y > TOP - 0.7 && ny > 0.8) col = S.mix(col, S.color('#7c6a55'), S.ss(0.15, 0.6, S.fbm(x * 0.8, 0, z * 0.8, seed + 15, 2)) * 0.4);
    return S.mix(col, S.color('#4c4640'), cavity * 0.3);
  };
}
/** register the family's parts (rock / rockB alternate by bed, both the same look) */
export function familyParts(paint) {
  S.part('rock', { mat: 'rock', paint: (c) => paint(c, 0) });
  S.part('rockB', { mat: 'rock', paint: (c) => paint(c, 0) });
  S.part('fresh', { mat: 'rock', paint: (c) => paint(c, 1) });
  S.part('soil', { mat: 'rock', paint: paintSoil });
  S.part('root', { mat: 'rock', paint: paintRoot });
  S.part('pebble', { mat: 'rock', paint: paintPebble });
}
/** which prism (index into REG.cells) and which drum a point is in */
export function drumAt(x, y, z) {
  const qx = x - REG.lean[0] * (y - Y0), qz = z - REG.lean[1] * (y - Y0);
  let ci = 0, cd = 1e9; REG.cells.forEach((e, i) => { const d = (qx - e.c[0]) ** 2 + (qz - e.c[1]) ** 2; if (d < cd) { cd = d; ci = i; } });
  const cuts = REG.cells.length ? REG.cells[ci].cuts : []; let di = 0; while (di < cuts.length && y >= cuts[di]) di++;
  return [ci, di, cuts];
}
/** parts alternate rock / rockB drum by drum (and prism by prism): the simplifier then guards every joint and seam as
 * an edge loop, and LOD1's vertex colours split there (crisp drum bands instead of smears) */
export function drumParts(shape) {
  const A = S.part('rock'), Bp = S.part('rockB'), pf = shape.pf;
  return new S.Shape(shape.f, shape.b, (x, y, z) => { const p = pf(x, y, z); if (p !== A && p !== Bp) return p; const [ci, di] = drumAt(x, y, z); return (ci + di) % 2 ? Bp : A; }, shape.lip);
}
/** wrap a stone so its part alternates rock / rockB by bed (fresh / other parts untouched) */
export function bedParts(shape, B) {
  const A = S.part('rock'), Bp = S.part('rockB'), pf = shape.pf;
  return new S.Shape(shape.f, shape.b, (x, y, z) => { const p = pf(x, y, z); return p === A || p === Bp ? (bedIndex(B, y) % 2 ? Bp : A) : p; }, shape.lip);
}

/**
 * one jointed prism: outline P (x/z, absolute), from y0 to y1, cut into drums at the bed heights it takes; each drum's
 * outward corners (r > rOut) pushed by its own factor so the joints show as small ledges; drums worn separately so each
 * joint is a soft V-notch (wide enough for the 512 atlas). lean [sx, sz] m per m, sheared about ground level `lean0`.
 */
export function jointedPrism(P, y0, y1, B, rnd, { lean = [0, 0], tilt = [0, 0], take = 0.6, push = 1, rOut = 1.3, jitter = 0.05, wear = 0.035, seed = 1, key = null } = {}) {
  // cross joints staggered prism to prism (basalt does not joint in rings): own spacing 0.8-1.7 m
  const cuts = []; for (let h = y0 + 0.5 + rnd() * 1.1; h < y1 - 0.45; h += 0.8 + rnd() * 0.9) if (rnd() < take + 0.25) cuts.push(h);
  const ys = [y0, ...cuts, y1], drums = [];
  REG.cells.push({ c: key || centroid(P), cuts });
  for (let k = 0; k < ys.length - 1; k++) {
    const kk = push * (1 + (rnd() - 0.5) * 2 * jitter), dy = ys[k] - Y0;
    const Q = P.map(([x, z]) => { const r = Math.hypot(x, z), f = r > rOut ? kk : 1; return [x * f + lean[0] * dy, z * f + lean[1] * dy]; });
    const last = k === ys.length - 2;
    drums.push(prism(Q, ys[k], ys[k + 1], { shear: lean, tilt: last ? tilt : [0, 0] }).wear(wear, { vary: 0.6, seed: seed * 7 + k }));
  }
  return S.union(...drums);
}
/** the removed wedge of a broken shoulder: everything above a plane falling from (rIn, yIn) to (rIn + run, yIn - drop) toward angle a */
export function shoulder(a, rIn, yIn, run, drop, lean = [0, 0]) {
  const ux = Math.cos(a), uz = Math.sin(a), k = drop / run, l = Math.hypot(k, 1);
  return new S.Shape((x, y, z) => {
    const qx = x - lean[0] * (y - Y0), qz = z - lean[1] * (y - Y0);
    return -((y - yIn) + k * ((qx * ux + qz * uz) - rIn)) / l;  // < 0 inside the removed wedge
  }, [-4, yIn - drop - 2, -4, 4, TOP + 2, 4], null, 1);
}

/**
 * The family builder. o = {
 *   seed, outerR, outerN, seeds: [[x,z]...] (Voronoi seeds of the core), push: [per seed], drop: {i: m below TOP},
 *   flanks: [[angle, r, size, top, capSlope]], proud: index of the flank that stands above TOP,
 *   crown: [[angle, depth]] rim breaks, shoulders: [[a, rIn, run, drop]], lean: [sx, sz], beds, sleeve: {..}, roots, cakes }
 */
export function buildColumn(o) {
  const rnd = S.prng(o.seed), lean = o.lean || [0, 0], B = o.beds;
  REG.cells.length = 0; REG.lean = lean;
  const off = [-lean[0] * (H / 2), -lean[1] * (H / 2)]; // keep the column's mid-height over the pivot
  const outer = jagPoly(o.outerN || 11, o.outerR || 2.0, rnd, 0.03, 0.35, 0.2).map(([x, z]) => [x + off[0], z + off[1]]);
  const seeds = o.seeds.map(([x, z]) => [x + off[0], z + off[1]]);
  const cells = voronoi(outer, seeds, 0);
  const cellsWide = voronoi(jagPoly(24, 3.4, () => 0.5, 0, 0, 0).map(([x, z]) => [x + off[0], z + off[1]]), seeds, 0);
  const prisms = cells.map((P, i) => {
    const top = TOP - 0.035 * rnd();
    return jointedPrism(P, Y0, top, B, rnd, { lean, tilt: [(rnd() - 0.5) * 0.012, (rnd() - 0.5) * 0.012], push: (o.push && o.push[i]) || 1, seed: 100 + i, take: o.take ?? 0.55, key: seeds[i] });
  });
  const wob = (x, y) => [-lean[0] * (y - Y0) + 0.04 * S.fbm(y * 0.4, 0, 1, 3, 2), -lean[1] * (y - Y0) + 0.04 * S.fbm(y * 0.4, 0, 5, 4, 2)];
  // seams: wide V (0.13 m open) so they read at the game camera and stay several texels wide in the atlas
  let stone = seamGroove(S.union(...prisms), seeds, { w: o.seamW || 0.13, dmax: 0.3, warp: wob }).part('rock');
  for (const [i, d] of Object.entries(o.drop || {})) {
    const [drop, rIn] = Array.isArray(d) ? d : [d, o.dropR ?? 1.62];
    const P = cells[+i], c = centroid(P), cx = c[0] - off[0], cz = c[1] - off[1], cl = Math.hypot(cx, cz) || 1, ux = cx / cl, uz = cz / cl;
    // the cell itself, but open to the outside (a wide outline): cutting exactly along the bisectors leaves the
    // neighbours' seam walls whole (the old 1.35x scale left thin fins of the neighbours standing up as teeth)
    const big = cellsWide[+i];
    const y0 = TOP - drop, dy = y0 - Y0;
    const Q = clipPoly(big, -ux, -uz, -(rIn + ux * off[0] + uz * off[1])).map(([x, z]) => [x + lean[0] * dy, z + lean[1] * dy]);
    if (Q.length < 3) continue;
    // the fallen piece leaves a break sloping down outward, and a vertical fracture face at rIn
    stone = stone.cut(prism(Q, y0, TOP + 1, { shear: lean, tilt: [-ux * 0.25, -uz * 0.25], tiltBot: [-ux * 0.25, -uz * 0.25] }).part('fresh'), { paintCut: true });
  }
  // flanking prisms: shorter, pressed on the bundle, caps broken at a slant (the proud one rises above the crown)
  const flanks = (o.flanks || []).map(([a, r, s, top, slope = 0.45], i) => {
    const c = [Math.cos(a) * r + off[0], Math.sin(a) * r + off[1]];
    const P = jagPoly(6, s, rnd, 0.1, 0.3, rnd() * 3).map(([x, z]) => [x + c[0], z + c[1]]);
    const proud = i === o.proud;
    const sl = proud ? -slope : slope; // proud: its cap rises outward, so its high corner stands outside the flat disc
    const tilt = [-Math.cos(a + 0.4) * sl, -Math.sin(a + 0.4) * sl];
    let p = jointedPrism(P, Y0, top, B, rnd, { lean, tilt, rOut: 0, jitter: 0.02, seed: 300 + i, take: 0.4 }).part('rock');
    if (!proud) p = brk(p, { at: [c[0] + Math.cos(a) * s * 0.8 + lean[0] * (top - Y0), top + 0.1, c[1] + Math.sin(a) * s * 0.8 + lean[1] * (top - Y0)], dir: [Math.cos(a), 0.7, Math.sin(a)], depth: 0.2, spread: 0.5, seed: 30 + i });
    return p;
  });
  if (flanks.length) stone = stone.add(S.union(...flanks));
  // broken shoulders (a slanting fresh break across the crown's edge)
  for (const [a, rIn, run, drop] of o.shoulders || []) stone = stone.cut(shoulder(a, rIn, TOP + 0.05, run, drop, lean).part('fresh'), { paintCut: true });
  // rim breaks: big chunks knocked off the crown edge, fresh and pale
  (o.crown || []).forEach(([a, d], i) => {
    const s = surf(stone, a, TOP - 0.25); if (!s || s.r < 1.75) return; // never into the standable disc
    stone = brk(stone, { at: [s.p[0], s.p[1] + 0.25, s.p[2]], dir: [Math.cos(a), 0.65, Math.sin(a)], depth: d, spread: 0.45, seed: 40 + i, ball: 2.2, rough: 0.008 });
  });
  stone = drumParts(stone);
  // stones caught in the seam mouths
  const spots = [];
  for (const P of cells) for (const v of P) {
    if (Math.hypot(v[0] - off[0], v[1] - off[1]) < 1.75) continue;
    if (outer.some((q) => Math.hypot(q[0] - v[0], q[1] - v[1]) < 0.05)) continue;
    for (let k = 0; k < 3; k++) {
      const y = 0.4 + Math.pow(rnd(), 1.3) * 4.4;
      const a = Math.atan2(v[1] + lean[1] * (y - Y0), v[0] + lean[0] * (y - Y0));
      // find the seam's mouth: the deepest point of the surface within +-0.12 rad of the cell corner
      let best = null;
      for (let t = -0.12; t <= 0.12; t += 0.012) { const s = surf(stone, a + t, y); if (s && (!best || s.r < best.r)) best = s; }
      if (best && best.r < 2.15) { const ca = Math.cos(Math.atan2(best.p[2], best.p[0])), sa = Math.sin(Math.atan2(best.p[2], best.p[0])); spots.push([[best.p[0] + ca * 0.03, y, best.p[2] + sa * 0.03], [ca, 0, sa]]); }
    }
  }
  const peb = S.union(...spots.filter((_, k) => k % 2 === 0).slice(0, o.pebbles ?? 5).map(([p, n]) => {
    const r = 0.14 + rnd() * 0.05;
    return prism(jagPoly(5, r, rnd, 0.25, 0.4, rnd() * 6), -r * 0.6, r * 0.6, { tilt: [(rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2] })
      .turn(rnd() * 60, rnd() * 180, rnd() * 60).at(p[0], p[1], p[2]);
  })).part('pebble');
  // soil sleeve (thick-lipped: no paper-thin edge), a few thick cakes, roots
  const sleeve = soilSleeve2(stone, { yLo: 0.1, yHi: 1.7, thick: 0.18, seed: o.seed % 97, ...(o.sleeve || {}) });
  const cakes = soilCakes(stone, rnd, { count: o.cakes ?? 3, yTop: 1.6, rMin: 0.22, rMax: 0.32 });
  const soil = S.softUnion(0.15, sleeve, ...cakes).rough({ type: 'billow', scale: 0.45, amp: 0.02, seed: 9 }).part('soil');
  const rts = S.union(...roots(stone, rnd, { count: o.roots ?? 4, yTop: [1.3, 2.3], rad: [0.1, 0.13], dangleP: 0, stick: 0.2, rootlets: 0.4 })).part('root');
  return stone.add(peb).softAdd(soil, 0.08).add(rts).intersect(S.plane([0, -1, 0], [0, Y0, 0]));
}
/** soilSleeve with a minimum lip: where the soil is present it is at least `lip` thick, so no paper-thin flaps */
export function soilSleeve2(stone, { yLo = 0.2, yHi = 1.6, thick = 0.16, seed = 7, patch: pb = 0.75, lip = 0.07 } = {}) {
  const f = stone.f;
  const top = (x, z) => { const a = Math.atan2(z, x); return yLo + (yHi - yLo) * S.clamp(0.5 + 0.9 * S.fbm(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0, seed, 3) + 0.25 * S.fbm(x * 2.5, 0, z * 2.5, seed + 1, 2), 0, 1); };
  const g = (x, y, z) => {
    const h = top(x, z), patch = S.clamp(pb + 1.4 * S.fbm(x * 0.9, y * 0.6, z * 0.9, seed + 2, 2), 0, 1.2);
    let t = thick * S.clamp(1.1 - (y - Y0) / (h - Y0 + 0.01), 0.35, 1) * patch;
    t = t >= lip ? t : 2 * t - lip;               // below the lip: falls off fast to absent (never a sheet thinner than lip)
    return Math.max(f(x, y, z) - t, (y - h) * 0.7, Y0 - y);
  };
  const b = stone.b;
  return new S.Shape(g, [b[0] - thick, Y0, b[2] - thick, b[3] + thick, yHi + 0.1, b[5] + thick], null, 1.4);
}

/** the asset definition shared by the three columns */
export function columnAsset(name, intentNotes, opts, { lodError = [0.06, 0.2], before = 0.4, hardAngle = 55 } = {}) {
  const B = opts.beds;
  const paint = prismPaint(B, { seed: opts.seed % 13 });
  return {
    name, id: 'sculpt_' + name,
    voxel: 0.02, lods: [3000, 1000], lodError, atlas: 512, ground: 0,
    aoRange: 0.6, cavity: [0.03, 0.11], creaseAngle: 24, hardAngle, bandSlack: 0.06,
    materials: MATERIALS,
    anchors: { top: [0, TOP, 0] },
    notes: intentNotes,
    build() { familyParts(paint); return buildColumn(opts); },
    async before(ctx) { return beforePillar(ctx, before); },
  };
}
