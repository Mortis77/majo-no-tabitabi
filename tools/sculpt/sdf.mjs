// Shapes as distance fields — the sculptor's clay. Metres, Y up, origin on the ground at the object's foot.
//
//   import * as S from './sdf.mjs'
//   const body = S.lathe(profile, { sides: 6 }).softAdd(S.ellipsoid([.2,.1,.2]).at(0,1,0), 0.05).chisel({ count: 7, depth: .02, seed: 3 })
//
// Every Shape is immutable: each method returns a new Shape. A Shape is f(x,y,z) -> signed distance (negative inside) plus
// pf(x,y,z) -> the Part that owns the surface there (material + paint rule), plus conservative bounds.
// The field is a distance BOUND, not always exact (blends, twists, noise): `lip` says how much it may overestimate slopes.
import { noise3, fbm, ridged, billow, cellular, prng } from './noise.mjs';

const DEG = Math.PI / 180;
const INF = [-1e9, -1e9, -1e9, 1e9, 1e9, 1e9];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const len3 = Math.hypot;

// ---------------------------------------------------------------------------------------------------------------- parts
export const PARTS = [];
/** A Part names a piece of the model: its material id (key of the asset's `materials`), its paint rule and, for skinned
 *  models, how its skin weights are set (`bone: 'Leg.L'` rigid, `bones: ['Body','Leg.L']` blend, `side` mirrors .L/.R). */
export function part(name, opts = {}) {
  let p = PARTS.find((q) => q.name === name);
  if (!p) { p = { id: PARTS.length, name, mat: 'default', paint: null }; PARTS.push(p); }
  Object.assign(p, opts);
  return p;
}
const DEFAULT_PART = part('default');

// ------------------------------------------------------------------------------------------------------------- Shape
export class Shape {
  constructor(f, b, pf = null, lip = 1) { this.f = f; this.b = b || INF; this.pf = pf || (() => DEFAULT_PART); this.lip = lip; }
  d(x, y, z) { return this.f(x, y, z); }
  partAt(x, y, z) { return this.pf(x, y, z) || DEFAULT_PART; }
  /** gradient (tetrahedral, 4 evaluations) -> unit normal written to out */
  normal(x, y, z, out = [0, 0, 0], e = 5e-4) {
    const f = this.f;
    const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
    let nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d;
    const l = Math.hypot(nx, ny, nz) || 1; out[0] = nx / l; out[1] = ny / l; out[2] = nz / l; return out;
  }
  /** name this piece: material, paint, rig binding. Later calls on the same name merge options. */
  part(name, opts = {}) { const p = part(name, opts); return new Shape(this.f, this.b, () => p, this.lip); }
  get bounds() { return this.b; }

  // ---- combine
  add(o) { return union(this, o); }
  softAdd(o, k = 0.03) { return softUnion(k, this, o); }
  cut(o, opts = {}) { return subtract(this, o, 0, opts.paintCut); }
  softCut(o, k = 0.02, opts = {}) { return subtract(this, o, k, opts.paintCut); }
  intersect(o) { return intersect(this, o, 0); }
  softIntersect(o, k = 0.02) { return intersect(this, o, k); }
  // aliases that read like the brief
  union(o) { return this.add(o); }
  softUnion(o, k) { return this.softAdd(o, k); }
  subtract(o) { return this.cut(o); }

  // ---- place
  /** move by (x, y, z) */
  at(x, y = 0, z = 0) {
    if (Array.isArray(x)) [x, y, z] = x;
    const f = this.f, pf = this.pf, b = this.b;
    return new Shape((px, py, pz) => f(px - x, py - y, pz - z), [b[0] + x, b[1] + y, b[2] + z, b[3] + x, b[4] + y, b[5] + z], (px, py, pz) => pf(px - x, py - y, pz - z), this.lip);
  }
  move(x, y, z) { return this.at(x, y, z); }
  /** turn about X, then Y, then Z (degrees) */
  turn(ax = 0, ay = 0, az = 0) {
    const m = rotMat(ax * DEG, ay * DEG, az * DEG); // world = M * local ; local = M^T * world
    const [a, b, c, d, e, f2, g, h, i] = m;
    const f = this.f, pf = this.pf;
    const L = (fn) => (x, y, z) => fn(a * x + d * y + g * z, b * x + e * y + h * z, c * x + f2 * y + i * z);
    return new Shape(L(f), xfBounds(this.b, (x, y, z) => [a * x + b * y + c * z, d * x + e * y + f2 * z, g * x + h * y + i * z]), L(pf), this.lip);
  }
  /** turn so that local +Y points along dir */
  aim(dir) {
    const [x, y, z] = norm(dir);
    const ax = Math.acos(clamp(y, -1, 1)), ay = Math.atan2(x, z);
    return this.turn(ax / DEG, 0, 0).turn(0, ay / DEG, 0);
  }
  /** uniform or per-axis scale (per-axis keeps a distance bound) */
  scale(s) {
    const f = this.f, pf = this.pf;
    if (typeof s === 'number') return new Shape((x, y, z) => f(x / s, y / s, z / s) * s, this.b.map((v) => v * s), (x, y, z) => pf(x / s, y / s, z / s), this.lip);
    const [sx, sy, sz] = s, m = Math.min(sx, sy, sz), M = Math.max(sx, sy, sz), b = this.b;
    return new Shape((x, y, z) => f(x / sx, y / sy, z / sz) * m, [b[0] * sx, b[1] * sy, b[2] * sz, b[3] * sx, b[4] * sy, b[5] * sz], (x, y, z) => pf(x / sx, y / sy, z / sz), this.lip * M / m);
  }
  /** mirror: the half on the +axis side is copied to the other side (model one side, get both) */
  mirror(axis = 'x') {
    const f = this.f, pf = this.pf, b = this.b;
    if (axis === 'x') { const r = Math.max(Math.abs(b[0]), Math.abs(b[3])); return new Shape((x, y, z) => f(Math.abs(x), y, z), [-r, b[1], b[2], r, b[4], b[5]], (x, y, z) => pf(Math.abs(x), y, z), this.lip); }
    if (axis === 'z') { const r = Math.max(Math.abs(b[2]), Math.abs(b[5])); return new Shape((x, y, z) => f(x, y, Math.abs(z)), [b[0], b[1], -r, b[3], b[4], r], (x, y, z) => pf(x, y, Math.abs(z)), this.lip); }
    const r = Math.max(Math.abs(b[1]), Math.abs(b[4])); return new Shape((x, y, z) => f(x, Math.abs(y), z), [b[0], -r, b[2], b[3], r, b[5]], (x, y, z) => pf(x, Math.abs(y), z), this.lip);
  }
  /** n copies around the Y axis (model one copy on +Z, at angle 0; `offset` degrees turns the whole ring) */
  around(n, offset = 0) {
    const f = this.f, pf = this.pf, sec = (2 * Math.PI) / n, off = offset * DEG;
    const L = (fn) => (x, y, z) => {
      const r = Math.hypot(x, z); let a = Math.atan2(x, z) - off;
      a = a - sec * Math.round(a / sec);
      return fn(r * Math.sin(a), y, r * Math.cos(a));
    };
    return new Shape(L(f), radialBounds(this.b), L(pf), this.lip);
  }
  repeatAround(n, offset) { return this.around(n, offset); }
  /** twist about Y: `deg` degrees per metre of height */
  twist(deg) {
    const k = deg * DEG, f = this.f, pf = this.pf;
    const L = (fn) => (x, y, z) => { const c = Math.cos(k * y), s = Math.sin(k * y); return fn(c * x - s * z, y, s * x + c * z); };
    return new Shape(L(f), radialBounds(this.b), L(pf), this.lip * (1 + Math.abs(k) * 0.5));
  }
  /** bend in the XY plane: `deg` degrees per metre along X (a beam along X curls up for deg > 0) */
  bend(deg) {
    const k = deg * DEG, f = this.f, pf = this.pf, b = this.b;
    const L = (fn) => (x, y, z) => { const c = Math.cos(k * x), s = Math.sin(k * x); return fn(c * x + s * y, -s * x + c * y, z); };
    const r = Math.max(Math.abs(b[0]), Math.abs(b[3]), Math.abs(b[1]), Math.abs(b[4]));
    return new Shape(L(f), [-r, -r, b[2], r, r, b[5]], L(pf), this.lip * (1 + Math.abs(k) * 0.5));
  }
  /** taper along Y: horizontal size multiplied by (1 + k*y) */
  taper(k) {
    const f = this.f, pf = this.pf, b = this.b;
    const L = (fn, dist) => (x, y, z) => { const s = Math.max(0.05, 1 + k * y); const v = fn(x / s, y, z / s); return dist ? v * Math.min(s, 1) : v; };
    const smax = Math.max(1 + k * b[1], 1 + k * b[4], 1);
    return new Shape(L(f, true), [b[0] * smax, b[1], b[2] * smax, b[3] * smax, b[4], b[5] * smax], L(pf, false), this.lip * (1 + Math.abs(k)));
  }

  /**
   * Free deformation: fn(x, y, z, out) writes the displacement [dx, dy, dz] that the shape gets at that place (small,
   * smooth displacements only; `lip` = how much the warp stretches space, 1.2 is a gentle bend). Example: lift corners.
   */
  warp(fn, { lip = 1.3, grow: g = 0.1 } = {}) {
    const f = this.f, pf = this.pf, o = [0, 0, 0];
    const L = (fun) => (x, y, z) => { o[0] = o[1] = o[2] = 0; fn(x, y, z, o); return fun(x - o[0], y - o[1], z - o[2]); };
    return new Shape(L(f), grow(this.b, g), L(pf), this.lip * lip);
  }

  // ---- surface form
  /** grow (+) or shrink (-) the surface */
  round(r) { const f = this.f; return new Shape((x, y, z) => f(x, y, z) - r, grow(this.b, Math.max(r, 0)), this.pf, this.lip); }
  grow(r) { return this.round(r); }
  /** hollow: a wall of thickness t on the surface */
  shell(t) { const f = this.f; return new Shape((x, y, z) => Math.abs(f(x, y, z)) - t / 2, grow(this.b, t), this.pf, this.lip); }
  /** keep only what is inside a box [x0,y0,z0,x1,y1,z1] (hard) */
  clip(b) { return intersect(this, boxBetween(b), 0); }

  /**
   * Chisel: flat facets cut at jittered angles into the surface, each confined to a ball so it never slices far parts.
   * { count, depth, seed, radius (facet size, default 7*depth), tilt (0..1 how far facets lean off the surface),
   *   where: (x,y,z,nx,ny,nz) => bool (pick region), dirs: [[x,y,z],...] (aim from these sides) }
   */
  chisel({ count = 6, depth = 0.015, seed = 1, radius, tilt = 0.35, where = null, dirs = null, from = null } = {}) {
    const cuts = [];
    const rnd = prng(seed * 7919 + 11);
    const R = radius || depth * 7;
    for (let i = 0, tries = 0; i < count && tries < count * 40; tries++) {
      const hit = this.probe(rnd, dirs, from);
      if (!hit) continue;
      const [s, n] = hit;
      if (where && !where(s[0], s[1], s[2], n[0], n[1], n[2])) continue;
      const np = norm([n[0] + (rnd() - 0.5) * 2 * tilt, n[1] + (rnd() - 0.5) * 2 * tilt, n[2] + (rnd() - 0.5) * 2 * tilt]);
      const dd = depth * (0.6 + 0.8 * rnd()), rr = R * (0.7 + 0.6 * rnd());
      cuts.push([s[0] - np[0] * dd, s[1] - np[1] * dd, s[2] - np[2] * dd, np[0], np[1], np[2], s[0], s[1], s[2], rr, dd * 2.5]);
      i++;
    }
    const f = this.f;
    const g = (x, y, z) => {
      let d = f(x, y, z);
      for (let i = 0; i < cuts.length; i++) {
        const c = cuts[i];
        const dist = Math.hypot(x - c[6], y - c[7], z - c[8]), ball = dist - c[9];
        if (ball > -d) continue; // cheap reject: the cut region is farther than the surface
        // the facet plane rises back to the surface toward the ball's edge, so a facet never ends in a wall (no slots)
        const t = dist / c[9];
        const pl = -((x - c[0]) * c[3] + (y - c[1]) * c[4] + (z - c[2]) * c[5]) + c[10] * 0.4 * t * t;
        // removal = above the plane, inside the ball, and no thicker than a slab of 2.5 x depth (so a facet started on
        // a shoulder never bites into the form that rises behind it)
        const k = Math.max(pl, ball, -pl - c[10]);
        if (-k > d) d = -k;
      }
      return d;
    };
    const out = new Shape(g, this.b, this.pf, this.lip);
    out.cuts = cuts;
    return out;
  }
  /**
   * Knock off a corner: a conchoidal chip of three jittered planes behind point `at`, facing out along `dir`.
   * { at:[x,y,z], dir:[x,y,z], depth (how far behind `at` the break goes), spread (0..1 how open the break is), seed, rough }
   */
  chip({ at, dir, depth = 0.04, spread = 0.5, seed = 1, rough = 0.004, paint = null } = {}) {
    const rnd = prng(seed * 31 + 5), n = norm(dir);
    const c = [at[0] - n[0] * depth, at[1] - n[1] * depth, at[2] - n[2] * depth];
    const planes = [];
    const t1 = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(n, t1);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 2 * Math.PI + rnd() * 1.2;
      const s = spread * (0.7 + 0.6 * rnd());
      planes.push(norm([n[0] + s * (Math.cos(a) * t1[0] + Math.sin(a) * t2[0]), n[1] + s * (Math.cos(a) * t1[1] + Math.sin(a) * t2[1]), n[2] + s * (Math.cos(a) * t1[2] + Math.sin(a) * t2[2])]));
    }
    const f = this.f, sd = seed * 13 + 1;
    const g = (x, y, z) => {
      const d = f(x, y, z);
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      let k = -1e9;
      for (const p of planes) { const v = -(px * p[0] + py * p[1] + pz * p[2]); if (v > k) k = v; }
      k += rough * fbm(x * 60, y * 60, z * 60, sd, 2);
      return Math.max(d, -k);
    };
    const out = new Shape(g, this.b, paint ? (x, y, z) => { const px = x - c[0], py = y - c[1], pz = z - c[2]; let k = -1e9; for (const p of planes) { const v = -(px * p[0] + py * p[1] + pz * p[2]); if (v > k) k = v; } return -k >= f(x, y, z) - 1e-3 ? part(paint) : this.pf(x, y, z); } : this.pf, this.lip + 0.2);
    return out;
  }
  /** a groove along a curve (points in object space, on or slightly below the surface) */
  groove(points, { width = 0.01, soft = 0.3 } = {}) { return this.softCut(tube(points, width / 2), width * soft); }
  /** a crack: a jagged, tapering cut along a curve. { width, jag (sideways wander, m), seed } */
  crack(points, { width = 0.006, jag = 0.01, seed = 1 } = {}) {
    const rnd = prng(seed * 101 + 3), pts = [];
    const sm = resample(points, 6);
    for (let i = 0; i < sm.length; i++) {
      const j = i === 0 || i === sm.length - 1 ? 0 : jag;
      pts.push([sm[i][0] + (rnd() - 0.5) * j, sm[i][1] + (rnd() - 0.5) * j, sm[i][2] + (rnd() - 0.5) * j]);
    }
    const r = (t) => (width / 2) * Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.6) + 1e-4;
    return this.cut(tube(pts, r, { smooth: false }));
  }
  /** strata: shallow horizontal bedding lines every `spacing` m, wandering by `wobble` */
  strata({ spacing = 0.08, depth = 0.003, width = 0.006, wobble = 0.01, seed = 1, axis = 'y' } = {}) {
    const f = this.f;
    return new Shape((x, y, z) => {
      const v = axis === 'y' ? y : axis === 'x' ? x : z;
      const u = (v + wobble * fbm(x * 4, y * 4, z * 4, seed, 2)) / spacing;
      const dist = Math.abs(u - Math.round(u)) * spacing;
      const t = Math.max(0, 1 - dist / width);
      return f(x, y, z) + depth * t * t * (0.6 + 0.4 * noise3(x * 9, y * 9, z * 9, seed + 7));
    }, this.b, this.pf, this.lip + depth / width);
  }
  /**
   * Layered noise displacement. { type: 'fbm'|'ridged'|'billow'|'cellular'|'cells' (cell walls), scale (m per feature),
   * amp (m, + = raised), oct, seed, mask: (x,y,z,nx,ny,nz) => 0..1 or 'up'|'side'|'down'|{ y:[from,to] } }
   * Masks that need the normal cost 4 extra evaluations of the shape below.
   */
  rough({ type = 'fbm', scale = 0.1, amp = 0.005, oct = 3, seed = 1, mask = null } = {}) {
    const f = this.f, self = this, inv = 1 / scale, nb = [0, 0, 0];
    const N = type === 'ridged' ? (x, y, z) => ridged(x, y, z, seed, oct) - 0.5
      : type === 'billow' ? (x, y, z) => billow(x, y, z, seed, oct) - 0.35
        : type === 'cellular' ? (x, y, z) => 0.5 - cellular(x, y, z, seed)
          : type === 'cells' ? (x, y, z) => Math.min(1, cellular(x, y, z, seed, true) * 3) - 0.6
            : (x, y, z) => fbm(x, y, z, seed, oct);
    const M = maskFn(mask);
    const needN = M && M.needN;
    return new Shape((x, y, z) => {
      const d = f(x, y, z);
      if (d > amp * 3 + 0.02) return d; // far away: displacement cannot matter
      let m = 1;
      if (M) { if (needN) self.normal(x, y, z, nb, 1e-3); m = M(x, y, z, nb[0], nb[1], nb[2]); if (m <= 0) return d; }
      return d - amp * m * N(x * inv, y * inv, z * inv);
    }, grow(this.b, Math.abs(amp) * 1.5), this.pf, this.lip + Math.abs(amp) * inv * 2.5);
  }
  /** push the surface out (amount > 0) or in (< 0) around a point, falling off over `radius` */
  bulge(at, radius, amount) {
    const f = this.f, [cx, cy, cz] = at;
    return new Shape((x, y, z) => {
      const t = Math.hypot(x - cx, y - cy, z - cz) / radius;
      const d = f(x, y, z);
      if (t >= 1) return d;
      const w = (1 - t * t); return d - amount * w * w;
    }, grow(this.b, Math.max(0, amount)), this.pf, this.lip + Math.abs(amount) / radius * 2);
  }
  pinch(at, radius, amount) { return this.bulge(at, radius, -amount); }
  /**
   * Wear: rounds exposed (convex) edges by about r and leaves crevices sharp (max of the field and its local blur).
   * { vary: 0..1 how unevenly (noise), seed }. Costs 8 extra evaluations of the shape below near the surface.
   */
  wear(r = 0.01, { vary = 0.5, seed = 3, scale = 0.25 } = {}) {
    const f = this.f, k = 1 / Math.sqrt(3);
    return new Shape((x, y, z) => {
      const d = f(x, y, z);
      if (d > r * 2 || d < -r * 2) return d;
      const rr = r * (1 - vary * 0.5 + vary * 0.5 * fbm(x / scale, y / scale, z / scale, seed, 2) * 2);
      if (rr <= 1e-5) return d;
      const e = rr * k;
      const b = (f(x + e, y + e, z + e) + f(x + e, y + e, z - e) + f(x + e, y - e, z + e) + f(x + e, y - e, z - e)
        + f(x - e, y + e, z + e) + f(x - e, y + e, z - e) + f(x - e, y - e, z + e) + f(x - e, y - e, z - e)) / 8;
      // a flat face averages to d; an edge to more than d (more of the ball is outside) -> material is removed there
      return Math.max(d, b - rr * 0.08);
    }, this.b, this.pf, this.lip);
  }

  /** find a surface point by marching in from a random direction: returns [point, normal] or null */
  probe(rnd, dirs = null, from = null) {
    const b = this.b;
    const c = from || [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    const R = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2 + 0.01;
    let u;
    if (dirs) { const d = dirs[Math.floor(rnd() * dirs.length)]; u = norm([d[0] + (rnd() - 0.5) * 0.6, d[1] + (rnd() - 0.5) * 0.6, d[2] + (rnd() - 0.5) * 0.6]); }
    else { const z = rnd() * 2 - 1, a = rnd() * 2 * Math.PI, s = Math.sqrt(1 - z * z); u = [s * Math.cos(a), z, s * Math.sin(a)]; }
    let t = 0;
    for (let i = 0; i < 256; i++) {
      const x = c[0] + u[0] * (R - t), y = c[1] + u[1] * (R - t), z = c[2] + u[2] * (R - t);
      const d = this.f(x, y, z);
      if (d < 2e-4) { const n = this.normal(x, y, z); return [[x, y, z], n]; }
      t += Math.max(d / this.lip, 5e-4);
      if (t > 2 * R) return null;
    }
    return null;
  }
}

// --------------------------------------------------------------------------------------------------------- combinators
export function union(...s) {
  if (s.length === 1) return s[0];
  if (s.length > 2) return s.reduce((a, b) => union(a, b));
  const [a, b] = s, fa = a.f, fb = b.f, pa = a.pf, pb = b.pf, ba = a.b, bb = b.b;
  // bounding-box skip: the distance to a child's box is a lower bound of the distance to the child
  return new Shape((x, y, z) => {
    const da = boxDist(ba, x, y, z), db = boxDist(bb, x, y, z);
    if (da <= db) { const u = fa(x, y, z); if (db > 0 && db >= u) return u; const v = fb(x, y, z); return u < v ? u : v; }
    const v = fb(x, y, z); if (da > 0 && da >= v) return v; const u = fa(x, y, z); return u < v ? u : v;
  }, ubounds(a.b, b.b),
  (x, y, z) => (fa(x, y, z) <= fb(x, y, z) ? pa(x, y, z) : pb(x, y, z)), Math.max(a.lip, b.lip));
}
/** smooth union (polynomial smooth-min, blend radius k) */
export function softUnion(k, ...s) {
  if (s.length > 2) return s.reduce((a, b) => softUnion(k, a, b));
  const [a, b] = s, fa = a.f, fb = b.f, pa = a.pf, pb = b.pf, ba = a.b, bb = b.b;
  return new Shape((x, y, z) => {
    const da = boxDist(ba, x, y, z), db = boxDist(bb, x, y, z);
    if (da <= db) { const u = fa(x, y, z); if (db > 0 && db >= u + k) return u; return smin(u, fb(x, y, z), k); }
    const v = fb(x, y, z); if (da > 0 && da >= v + k) return v; return smin(fa(x, y, z), v, k);
  }, grow(ubounds(a.b, b.b), k * 0.25),
  (x, y, z) => (fa(x, y, z) <= fb(x, y, z) ? pa(x, y, z) : pb(x, y, z)), Math.max(a.lip, b.lip));
}
export function subtract(a, b, k = 0, paintCut = false) {
  const fa = a.f, fb = b.f, pa = a.pf, pb = b.pf, bb = b.b;
  const f = k > 0
    ? (x, y, z) => { const u = fa(x, y, z); const q = boxDist(bb, x, y, z); if (q > 0 && q >= k - u) return u; return -smin(-u, fb(x, y, z), k); }
    : (x, y, z) => { const u = fa(x, y, z); const q = boxDist(bb, x, y, z); if (q > 0 && q >= -u) return u; const v = -fb(x, y, z); return u > v ? u : v; };
  const pf = paintCut ? (x, y, z) => (-fb(x, y, z) >= fa(x, y, z) ? pb(x, y, z) : pa(x, y, z)) : pa;
  return new Shape(f, a.b, pf, Math.max(a.lip, b.lip));
}
export function intersect(a, b, k = 0) {
  const fa = a.f, fb = b.f, pa = a.pf;
  const f = k > 0 ? (x, y, z) => -smin(-fa(x, y, z), -fb(x, y, z), k) : (x, y, z) => { const u = fa(x, y, z), v = fb(x, y, z); return u > v ? u : v; };
  return new Shape(f, ibounds(a.b, b.b), pa, Math.max(a.lip, b.lip));
}
/** distance from a point to an axis-aligned box (0 inside) */
export function boxDist(b, x, y, z) {
  const dx = Math.max(b[0] - x, 0, x - b[3]), dy = Math.max(b[1] - y, 0, y - b[4]), dz = Math.max(b[2] - z, 0, z - b[5]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ---------------------------------------------------------------------------------------------------------- primitives
export function sphere(r) { return new Shape((x, y, z) => Math.hypot(x, y, z) - r, [-r, -r, -r, r, r, r]); }
/** ellipsoid with radii [rx, ry, rz] (bound) */
export function ellipsoid([a, b, c]) {
  return new Shape((x, y, z) => {
    const k0 = Math.hypot(x / a, y / b, z / c), k1 = Math.hypot(x / (a * a), y / (b * b), z / (c * c));
    return k1 < 1e-9 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
  }, [-a, -b, -c, a, b, c]);
}
/** box of full size [sx, sy, sz], centred */
export function box([sx, sy, sz]) { return roundBox([sx, sy, sz], 0); }
/** rounded box of full size, corner radius r */
export function roundBox([sx, sy, sz], r = 0.01) {
  const hx = sx / 2 - r, hy = sy / 2 - r, hz = sz / 2 - r;
  return new Shape((x, y, z) => {
    const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy, qz = Math.abs(z) - hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }, [-sx / 2, -sy / 2, -sz / 2, sx / 2, sy / 2, sz / 2]);
}
function boxBetween([x0, y0, z0, x1, y1, z1]) { return box([x1 - x0, y1 - y0, z1 - z0]).at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
export { boxBetween as boxFromTo };
/** capsule between points a and b, radius r */
export function capsule(a, b, r) { return taperedCapsule(a, b, r, r); }
/** capsule whose radius goes from ra (at a) to rb (at b) — the basic limb */
export function taperedCapsule(a, b, ra, rb) {
  const [ax, ay, az] = a, bx = b[0] - ax, by = b[1] - ay, bz = b[2] - az;
  const l2 = bx * bx + by * by + bz * bz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const f = (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az;
    const yv = px * bx + py * by + pz * bz, zv = yv - l2;
    const qx = px * l2 - bx * yv, qy = py * l2 - by * yv, qz = pz * l2 - bz * yv;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * l2, z2 = zv * zv * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
  };
  const r = Math.max(ra, rb);
  return new Shape(f, [Math.min(ax, b[0]) - r, Math.min(ay, b[1]) - r, Math.min(az, b[2]) - r, Math.max(ax, b[0]) + r, Math.max(ay, b[1]) + r, Math.max(az, b[2]) + r]);
}
/** capped cone / cylinder from y = 0 (radius r0) to y = h (radius r1) */
export function cone(r0, r1, h) { return lathe([[0, 0], [r0, 0], [r1, h], [0, h]]); }
export function cylinder(r, h) { return cone(r, r, h); }
/** torus in the XZ plane: ring radius R, tube radius r */
export function torus(R, r) { return new Shape((x, y, z) => Math.hypot(Math.hypot(x, z) - R, y) - r, [-R - r, -r, -R - r, R + r, r, R + r]); }
/** half-space below a plane through `at` with outward normal n */
export function plane(n, at = [0, 0, 0]) { const [a, b, c] = norm(n); return new Shape((x, y, z) => (x - at[0]) * a + (y - at[1]) * b + (z - at[2]) * c, INF); }

/**
 * Lathe: a 2D profile [[radius, y], ...] from the axis, out, and back to the axis, turned about Y.
 * { sides: n } turns it as an n-sided prism (radii are corner radii; a corner points along +Z), else round.
 * { smooth: k } rounds the profile's corners by k metres (applied in 2D).
 */
export function lathe(profile, { sides = 0, smooth = 0, twist = 0 } = {}) {
  const P = closeProfile(profile);
  const n = sides, c = n ? Math.cos(Math.PI / n) : 1;
  const sec = n ? (2 * Math.PI) / n : 0;
  const rho = n
    ? (x, z) => { let a = Math.atan2(x, z); a = a - sec * Math.round(a / sec); const r = Math.hypot(x, z); return (r * Math.cos(Math.abs(a) - Math.PI / n) * 1) / c; }
    : (x, z) => Math.hypot(x, z);
  let rmax = 0, y0 = 1e9, y1 = -1e9;
  for (const [r, y] of P) { rmax = Math.max(rmax, r); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const f = (x, y, z) => poly2d(P, rho(x, z), y) * c - smooth;
  return new Shape(f, [-rmax - smooth, y0 - smooth, -rmax - smooth, rmax + smooth, y1 + smooth, rmax + smooth], null, 1);
}
/** extrude a 2D outline [[x, y], ...] (in the XY plane) along Z, full depth `depth`, centred */
export function extrude(outline, depth, { round = 0 } = {}) {
  const P = outline, h = depth / 2 - round;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return new Shape((x, y, z) => {
    const dx = poly2d(P, x, y) + round, dz = Math.abs(z) - h;
    return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) - round;
  }, [x0, y0, -depth / 2, x1, y1, depth / 2]);
}
/** regular 2D polygon outline helper (for extrude): n corners, radius r, first corner up */
export function ngon(n, r, rot = 0) { const o = []; for (let i = 0; i < n; i++) { const a = rot * DEG + (i / n) * 2 * Math.PI; o.push([Math.sin(a) * r, Math.cos(a) * r]); } return o; }
/** 2D circle outline (for extrude) */
export function circle(r, n = 40) { return ngon(n, r); }

/**
 * Tube along a curve through `points` (Catmull-Rom smoothed). radius: number, [r0, r1], or t => r (t = 0..1 along).
 * { aspect: w/h of the cross-section (1 = round), up: [x,y,z] for the section's height direction, smooth: false = polyline }
 */
export function tube(points, radius, { aspect = 1, up = [0, 1, 0], smooth = true } = {}) {
  const pts = smooth && points.length > 2 ? resample(points, 10) : points.map((p) => p.slice());
  const R = typeof radius === 'function' ? radius : Array.isArray(radius) ? (t) => radius[0] + (radius[1] - radius[0]) * t : () => radius;
  const nS = pts.length - 1, segs = [];
  let total = 0;
  for (let i = 0; i < nS; i++) { const a = pts[i], b = pts[i + 1]; const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); segs.push([a, b, l, total]); total += l; }
  let rmax = 0; for (let i = 0; i <= 20; i++) rmax = Math.max(rmax, R(i / 20));
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of pts) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], p[k] - rmax * Math.max(1, aspect)); bb[k + 3] = Math.max(bb[k + 3], p[k] + rmax * Math.max(1, aspect)); }
  const upn = norm(up);
  const f = (x, y, z) => {
    let best = 1e9;
    for (let i = 0; i < segs.length; i++) {
      const [a, b, l, s0] = segs[i];
      const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const h = l > 0 ? clamp((px * bx + py * by + pz * bz) / (l * l), 0, 1) : 0;
      const qx = px - bx * h, qy = py - by * h, qz = pz - bz * h;
      const r = R((s0 + h * l) / total);
      let d;
      if (aspect === 1) d = Math.hypot(qx, qy, qz) - r;
      else {
        // section frame: n = up projected off the tangent, w = side
        const il = 1 / (l || 1), tx = bx * il, ty = by * il, tz = bz * il;
        const dt = upn[0] * tx + upn[1] * ty + upn[2] * tz;
        let nx = upn[0] - tx * dt, ny = upn[1] - ty * dt, nz = upn[2] - tz * dt; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const wx = ty * nz - tz * ny, wy = tz * nx - tx * nz, wz = tx * ny - ty * nx;
        const u = (qx * wx + qy * wy + qz * wz) / aspect, v = qx * nx + qy * ny + qz * nz;
        const along = (px * tx + py * ty + pz * tz) - h * l;
        d = (Math.hypot(u, v, along) - r) * Math.min(1, aspect);
      }
      if (d < best) best = d;
    }
    return best;
  };
  return new Shape(f, bb);
}

// --------------------------------------------------------------------------------------------------------- 2D helpers
function closeProfile(p) {
  const P = p.map((q) => [q[0], q[1]]);
  if (P[0][0] !== 0) P.unshift([0, P[0][1]]);
  if (P[P.length - 1][0] !== 0) P.push([0, P[P.length - 1][1]]);
  return P;
}
/** signed distance to a closed 2D polygon */
export function poly2d(P, px, py) {
  let d = (px - P[0][0]) ** 2 + (py - P[0][1]) ** 2, s = 1;
  for (let i = 0, j = P.length - 1; i < P.length; j = i, i++) {
    const vi = P[i], vj = P[j];
    const ex = vj[0] - vi[0], ey = vj[1] - vi[1], wx = px - vi[0], wy = py - vi[1];
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1);
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= vi[1], c2 = py < vj[1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
/** Catmull-Rom resample of a polyline: `per` points per span */
export function resample(points, per = 8) {
  if (points.length < 3) return points.map((p) => p.slice());
  const out = [];
  const P = (i) => points[clamp(i, 0, points.length - 1)];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(points[points.length - 1].slice());
  return out;
}

// --------------------------------------------------------------------------------------------------------------- masks
function maskFn(m) {
  if (!m) return null;
  if (typeof m === 'function') { const f = (x, y, z, nx, ny, nz) => m(x, y, z, nx, ny, nz); f.needN = m.length > 3; return f; }
  if (m === 'up') { const f = (x, y, z, nx, ny) => clamp((ny - 0.35) * 2.5, 0, 1); f.needN = true; return f; }
  if (m === 'down') { const f = (x, y, z, nx, ny) => clamp((-ny - 0.2) * 2.5, 0, 1); f.needN = true; return f; }
  if (m === 'side') { const f = (x, y, z, nx, ny) => clamp((0.75 - Math.abs(ny)) * 3, 0, 1); f.needN = true; return f; }
  if (m.y) { const [a, b] = m.y, e = m.fade ?? 0.03; return (x, y) => clamp(Math.min((y - a) / e, (b - y) / e), 0, 1); }
  throw new Error('unknown mask');
}

// ---------------------------------------------------------------------------------------------------------- vec / bounds
export function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
export function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function rotMat(ax, ay, az) {
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  // M = Rz * Ry * Rx (row-major)
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul3(Rz, mul3(Ry, Rx));
}
function mul3(A, B) { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]); return o; }
function xfBounds(b, fn) {
  if (b[0] < -1e8) return INF;
  const o = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < 8; i++) { const p = fn(i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2]); for (let k = 0; k < 3; k++) { o[k] = Math.min(o[k], p[k]); o[k + 3] = Math.max(o[k + 3], p[k]); } }
  return o;
}
function radialBounds(b) { if (b[0] < -1e8) return INF; const r = Math.max(Math.hypot(b[0], b[2]), Math.hypot(b[3], b[2]), Math.hypot(b[0], b[5]), Math.hypot(b[3], b[5])); return [-r, b[1], -r, r, b[4], r]; }
function ubounds(a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])]; }
function ibounds(a, b) { return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3]), Math.min(a[4], b[4]), Math.min(a[5], b[5])]; }
function grow(b, r) { return b[0] < -1e8 ? b : [b[0] - r, b[1] - r, b[2] - r, b[3] + r, b[4] + r, b[5] + r]; }

// ---------------------------------------------------------------------------------------------------------- paint kit
/** '#rrggbb' or 0xrrggbb -> [r, g, b] in 0..1 (sRGB, as painted) */
export function color(c) { const h = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c; return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
export function mix(a, b, t) { t = clamp(t, 0, 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function mul(a, k) { return typeof k === 'number' ? [a[0] * k, a[1] * k, a[2] * k] : [a[0] * k[0], a[1] * k[1], a[2] * k[2]]; }
export function ss(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export { clamp, fbm, ridged, billow, cellular, noise3, prng };
