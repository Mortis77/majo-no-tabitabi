// Questions and pushes: raycast, overlap, support under a foot, explosions and gusts.
// Area queries walk the (small, <= ~300) body list in JS against oriented boxes: always up to date, allocation free.
// Rays against bodies / the mirrored world go through Rapier (which sees the world as of the last fixed step);
// rays against the land are marched over the terrain itself, so they work far beyond the built collider chunks.
import * as THREE from 'three';
import { QUERY, M_REF, MAX_KICK_SPEED, LIGHT_GAIN } from './consts.js';
import { SHAPE } from './body.js';

export function createQueries(P) {
  const { RAPIER, world, G } = P;
  const api = {};
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const _n = new THREE.Vector3();
  const _imp = { x: 0, y: 0, z: 0 }, _pt = { x: 0, y: 0, z: 0 };
  const support = { y: 0, body: null, normal: new THREE.Vector3(0, 1, 0) };
  let lx = 0, ly = 0, lz = 0;        // scratch: last closest point (world)

  /** Distance from the world point (x,y,z) to the body's oriented bounding box (0 inside); closest point -> lx,ly,lz. */
  function distTo(b, x, y, z) {
    const c = b._cp;
    let dx = x - c.x, dy = y - c.y, dz = z - c.z;
    if (b._shape === SHAPE.sphere) {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz), r = b._r;
      if (d <= r) { lx = x; ly = y; lz = z; return 0; }
      const k = r / d; lx = c.x + dx * k; ly = c.y + dy * k; lz = c.z + dz * k;
      return d - r;
    }
    // into body space: v' = conj(q) * v * q
    const q = b.quat, qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    let tx = 2 * (qy * dz - qz * dy), ty = 2 * (qz * dx - qx * dz), tz = 2 * (qx * dy - qy * dx);
    let px = dx + qw * tx + (qy * tz - qz * ty), py = dy + qw * ty + (qz * tx - qx * tz), pz = dz + qw * tz + (qx * ty - qy * tx);
    const he = b._he;
    const cx = px < -he[0] ? -he[0] : px > he[0] ? he[0] : px;
    const cy = py < -he[1] ? -he[1] : py > he[1] ? he[1] : py;
    const cz = pz < -he[2] ? -he[2] : pz > he[2] ? he[2] : pz;
    const ex = px - cx, ey = py - cy, ez = pz - cz;
    // closest point back to the world: v = q * c * conj(q)
    const ax = q.x, ay = q.y, az = q.z;
    tx = 2 * (ay * cz - az * cy); ty = 2 * (az * cx - ax * cz); tz = 2 * (ax * cy - ay * cx);
    lx = c.x + cx + qw * tx + (ay * tz - az * ty);
    ly = c.y + cy + qw * ty + (az * tx - ax * tz);
    lz = c.z + cz + qw * tz + (ax * ty - ay * tx);
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
  }
  api.distTo = (b, p) => distTo(b, p.x, p.y, p.z);

  const skip = (b, ex) => ex && (ex === b || (typeof ex === 'function' ? ex(b) : ex.has ? ex.has(b) : Array.isArray(ex) && ex.includes(b)));

  /** Call cb(body) for every body (any type) whose bounds come within r of pos. Returns how many. */
  api.overlapSphere = (pos, r, cb) => {
    const all = P.all;
    let n = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      const b = all[i];
      if (!b || !b.alive) continue;
      const c = b._cp, reach = r + b.radius;
      const dx = pos.x - c.x, dy = pos.y - c.y, dz = pos.z - c.z;
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      if (distTo(b, pos.x, pos.y, pos.z) > r) continue;
      n++;
      if (cb) cb(b);
    }
    return n;
  };

  /** Closest body within r of pos (optionally only those filter(body) accepts), or null. */
  api.nearest = (pos, r, filter) => {
    const all = P.all;
    let best = null, bd = r;
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      if (!b || !b.alive) continue;
      const c = b._cp;
      if (Math.abs(pos.x - c.x) > bd + b.radius || Math.abs(pos.z - c.z) > bd + b.radius) continue;
      const d = distTo(b, pos.x, pos.y, pos.z);
      if (d <= bd && (!filter || filter(b))) { bd = d; best = b; }
    }
    return best;
  };

  /**
   * Blast. `impulse` is the launch speed (m/s) a reference crate (mass M_REF) gets at the centre; it falls off
   * linearly to zero at `radius`. Heavier bodies get proportionally less, light ones at most LIGHT_GAIN times more.
   * opts.up tilts the push skywards (0 = purely radial), opts.exclude = body | array | Set | (body) => bool.
   */
  api.explode = (pos, radius, impulse, opts) => {
    const up = opts && opts.up !== undefined ? opts.up : 0.35;
    const ex = opts && opts.exclude;
    const out = [];
    const dyn = P.dyn;
    for (let i = 0; i < dyn.length; i++) {
      const b = dyn[i];
      if (!b.alive || b._held || skip(b, ex)) continue;
      const c = b._cp;
      const reach = radius + b.radius;
      let dx = c.x - pos.x, dy = c.y - pos.y, dz = c.z - pos.z;
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      const d = distTo(b, pos.x, pos.y, pos.z);
      if (d >= radius) continue;
      const fall = 1 - d / radius;
      let l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l < 1e-3) { dx = 0; dy = 1; dz = 0; l = 1; }
      dx /= l; dy = dy / l + up; dz /= l;
      l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const gain = Math.min(M_REF / b.mass, LIGHT_GAIN);
      const dv = Math.min(MAX_KICK_SPEED, impulse * fall * gain) * b.timeScale;
      const j = dv * b.mass / l;
      _imp.x = dx * j; _imp.y = dy * j; _imp.z = dz * j;
      // pushed a little off-centre, on the side facing the blast: things tumble away instead of gliding
      _pt.x = c.x + (lx - c.x) * 0.35; _pt.y = c.y + (ly - c.y) * 0.35; _pt.z = c.z + (lz - c.z) * 0.35;
      b.rb.applyImpulseAtPoint(_imp, _pt, true);
      out.push(b);
    }
    return out;
  };

  /**
   * Gust: pushes every body inside the cone (apex `origin`, axis `dir`, length `range`, half angle `halfAngle` rad).
   * `impulse` is the speed a reference crate gets right at the apex; it fades with distance and towards the rim, and
   * is multiplied by how readily the material is carried by wind (paper and cloth fly furthest).
   */
  api.pushCone = (origin, dir, range, halfAngle, impulse) => {
    const out = [];
    let ax = dir.x, ay = dir.y, az = dir.z;
    const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    ax /= al; ay /= al; az /= al;
    const dyn = P.dyn;
    for (let i = 0; i < dyn.length; i++) {
      const b = dyn[i];
      if (!b.alive || b._held) continue;
      const c = b._cp;
      const dx = c.x - origin.x, dy = c.y - origin.y, dz = c.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const edge = dist - b.radius;
      if (edge > range) continue;
      let fAng = 1;
      if (dist > b.radius) {
        const ang = Math.acos(Math.max(-1, Math.min(1, (dx * ax + dy * ay + dz * az) / dist)));
        const lim = halfAngle + Math.asin(Math.min(1, b.radius / dist));
        if (ang > lim) continue;
        fAng = 1 - 0.5 * Math.min(1, ang / Math.max(halfAngle, 1e-3));
      }
      const fDist = 1 - 0.75 * Math.max(0, edge) / range;
      const gain = Math.min(M_REF / b.mass, LIGHT_GAIN) * b.mat.wind;
      const dv = Math.min(MAX_KICK_SPEED, impulse * fDist * fAng * gain) * b.timeScale;
      // mostly along the gust, a little outwards from the apex, with some lift so things skip instead of grinding
      let px = ax * 0.8 + (dist > 1e-3 ? dx / dist : 0) * 0.2, py = ay * 0.8 + (dist > 1e-3 ? dy / dist : 0) * 0.2 + 0.16, pz = az * 0.8 + (dist > 1e-3 ? dz / dist : 0) * 0.2;
      const pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
      const j = dv * b.mass / pl;
      _imp.x = px * j; _imp.y = py * j; _imp.z = pz * j;
      distTo(b, origin.x, origin.y, origin.z);
      _pt.x = c.x + (lx - c.x) * 0.25; _pt.y = c.y + (ly - c.y) * 0.25; _pt.z = c.z + (lz - c.z) * 0.25;
      b.rb.applyImpulseAtPoint(_imp, _pt, true);
      out.push(b);
    }
    return out;
  };

  // ---- rays ------------------------------------------------------------------------------------------------------
  const surf = (x, z) => P.terrain.surfaceAt(x, z);
  /** Distance along the ray to the land, or -1. (ox,oy,oz) + t (dx,dy,dz), unit direction. */
  function terrainRay(ox, oy, oz, dx, dy, dz, maxDist) {
    let gap = oy - surf(ox, oz);
    if (gap < 0) return gap > -0.6 ? 0 : -1;           // started (well) under the ground: the land is not in the way
    let t = 0, prev = 0;
    for (let guard = 0; guard < 400; guard++) {
      if (t >= maxDist) return -1;
      if (dy >= 0 && oy + dy * t > 330) return -1;      // climbing above every summit
      const step = gap * 0.35 < 0.3 ? 0.3 : gap * 0.35 > 4 ? 4 : gap * 0.35;
      prev = t; t += step;
      if (t > maxDist) t = maxDist;
      gap = oy + dy * t - surf(ox + dx * t, oz + dz * t);
      if (gap < 0) {
        let a = prev, b = t;
        for (let k = 0; k < 7; k++) {
          const m = (a + b) * 0.5;
          if (oy + dy * m - surf(ox + dx * m, oz + dz * m) < 0) b = m; else a = m;
        }
        return a;
      }
    }
    return -1;
  }

  /**
   * First thing a ray meets: the land, the mirrored static world, or a body.
   * opts: dynamicOnly (only dynamic bodies), exclude (body | array | Set | fn), characters (also character capsules),
   *       out (a result object to fill instead of making a new one).
   * -> { dist, point, normal, body | null, surface: 'terrain'|'static'|'body'|'character', owner } | null
   */
  api.raycast = (origin, dir, maxDist = 100, opts) => {
    let dx = dir.x, dy = dir.y, dz = dir.z;
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(dl > 0) || !(maxDist > 0)) return null;
    dx /= dl; dy /= dl; dz /= dl;
    const dynOnly = !!(opts && opts.dynamicOnly);
    let tT = -1;
    if (!dynOnly) tT = terrainRay(origin.x, origin.y, origin.z, dx, dy, dz, maxDist);
    const lim = tT >= 0 ? tT : maxDist;
    let hit = null;
    if (lim > 0) {
      const o = ray.origin, d = ray.dir;
      o.x = origin.x; o.y = origin.y; o.z = origin.z; d.x = dx; d.y = dy; d.z = dz;
      const ex = opts && opts.exclude;
      let exRb, pred;
      if (ex) {
        if (ex.rb && ex.kind === 'body') exRb = ex.alive ? ex.rb : undefined;
        else pred = (col) => { const rec = P.byHandle.get(col.handle); return !(rec && rec.kind === 'body' && skip(rec, ex)); };
      }
      const groups = dynOnly ? QUERY.bodies : opts && opts.characters ? QUERY.worldAndChars : QUERY.world;
      hit = world.castRayAndGetNormal(ray, lim, true, dynOnly ? RAPIER.QueryFilterFlags.ONLY_DYNAMIC : undefined, groups, undefined, exRb, pred);
    }
    if (!hit && tT < 0) return null;
    const res = (opts && opts.out) || { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), body: null, surface: '', owner: null };
    if (!res.point) res.point = new THREE.Vector3();
    if (!res.normal) res.normal = new THREE.Vector3();
    if (hit) {
      const rec = P.byHandle.get(hit.collider.handle);
      const t = hit.timeOfImpact;
      res.dist = t;
      res.point.set(origin.x + dx * t, origin.y + dy * t, origin.z + dz * t);
      res.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
      if (res.normal.lengthSq() < 1e-6) res.normal.set(-dx, -dy, -dz);
      res.body = rec && rec.kind === 'body' ? rec : null;
      res.surface = !rec ? 'static' : rec.kind === 'char' ? 'character' : rec.kind;
      res.owner = rec && (rec.kind === 'body' || rec.kind === 'char') ? rec.owner : null;
    } else {
      res.dist = tT;
      res.point.set(origin.x + dx * tT, origin.y + dy * tT, origin.z + dz * tT);
      G.world.normalAt(res.point.x, res.point.z, res.normal);
      res.body = null; res.surface = 'terrain'; res.owner = null;
    }
    return res;
  };

  /**
   * The top of the rigid body under a foot at (x, y, z): the highest one no more than `maxDrop` below y (and at most a
   * small step above it). Only things you can stand on count (props and fixed / kinematic bodies; not debris, not what
   * is being carried). -> { y, body, normal }  — ONE shared object, overwritten by the next call — or null.
   */
  api.supportAt = (x, z, y, maxDrop = 1.6) => {
    const STEP_UP = 0.55;
    const o = ray.origin, d = ray.dir;
    o.x = x; o.y = y + STEP_UP; o.z = z; d.x = 0; d.y = -1; d.z = 0;
    const hit = world.castRayAndGetNormal(ray, maxDrop + STEP_UP, true, undefined, QUERY.support);
    if (!hit || hit.timeOfImpact <= 1e-4) return null;        // nothing, or the foot is inside something tall (a wall, not a floor)
    if (hit.normal.y < 0.55) return null;                     // too steep to stand on
    const rec = P.byHandle.get(hit.collider.handle);
    if (!rec || rec.kind !== 'body' || !rec.alive) return null;
    support.y = y + STEP_UP - hit.timeOfImpact;
    support.body = rec;
    support.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    return support;
  };

  api.terrainRay = terrainRay;
  return api;
}
