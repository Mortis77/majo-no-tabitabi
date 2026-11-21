// Everything that acts on an awake body besides contacts: time bubbles, water (buoyancy + drag), rolling resistance,
// wind. Runs once per body per fixed step, right before the solver; works on the mirrored velocities and writes them
// back to Rapier only when something changed (no allocation, at most two calls into the solver per body).
import * as THREE from 'three';
import { GRAVITY, SEA, MASS_SCALE, WATER, WIND, ROLL, MAX_SPEED } from './consts.js';
import { SHAPE } from './body.js';

export function createForces(P) {
  const { G } = P;
  const _lv = { x: 0, y: 0, z: 0 }, _av = { x: 0, y: 0, z: 0 };
  const _w = new THREE.Vector3();
  const _g = { x: 0, z: 0 };
  let windFn = null, stepNo = 0;
  const api = {};

  /** Call once before the bodies of a step are processed. */
  api.begin = () => {
    stepNo++;
    const el = G.elements;
    windFn = el && typeof el.windAt === 'function' ? el.windAt : null;
  };

  /** Strength of the wind felt by a body there, as the acceleration (m/s²) it would get standing still. */
  api.windPull = (b) => {
    const el = G.elements;
    if (!el || typeof el.windAt !== 'function') return 0;
    const w = el.windAt(b.pos, _w) || _w;
    const m2 = w.x * w.x + w.y * w.y + w.z * w.z;
    return WIND.c * b._windK * m2;
  };

  /** Forces on one awake dynamic body for the coming step of length dt. */
  api.pre = (b, dt) => {
    const rb = b.rb, v = b.vel, w = b.angvel;
    let vx = v.x, vy = v.y, vz = v.z, wx = w.x, wy = w.y, wz = w.z;
    let dl = false, da = false;

    // ---- time bubbles (月晕): inside, the body lives at `scale` × speed ----------------------------------------
    let s = 1;
    const tb = P.api.timeBubbles;
    if (tb && tb.length) {
      const c = b._cp;
      for (let i = 0; i < tb.length; i++) {
        const B = tb[i], p = B && B.pos;
        if (!p) continue;
        const dx = c.x - p.x, dy = c.y - p.y, dz = c.z - p.z, R = B.radius || 0;
        if (dx * dx + dy * dy + dz * dz < R * R) { const sc = B.scale > 0 ? B.scale : 0.25; if (sc < s) s = sc; }
      }
    }
    if (s !== b.timeScale) {
      // entering / leaving: velocities are rescaled once, and the pull of the earth by scale² — the body keeps the
      // very same path, only slower; when the bubble ends it gets its speed back
      const k = s / b.timeScale;
      vx *= k; vy *= k; vz *= k; wx *= k; wy *= k; wz *= k;
      b.timeScale = s;
      rb.setGravityScale(b._held ? 0 : s * s, false);
      dl = da = true;
    }
    const s2 = s * s;

    if (!b._held) {
      // ---- pose-dependent vertical half extent -------------------------------------------------------------------
      const q = b.quat, he = b._he, cp = b._cp;
      const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      const r10 = 2 * (qx * qy + qw * qz), r11 = 1 - 2 * (qx * qx + qz * qz), r12 = 2 * (qy * qz - qw * qx);
      const shape = b._shape;
      let ve;
      if (shape === SHAPE.sphere) ve = b._r;
      else if (shape === SHAPE.cylinder) ve = Math.abs(r11) * b._hh + b._r * Math.sqrt(Math.max(0, 1 - r11 * r11));
      else if (shape === SHAPE.capsule) ve = Math.abs(r11) * b._hh + b._r;
      else ve = Math.abs(r10) * he[0] + Math.abs(r11) * he[1] + Math.abs(r12) * he[2];
      b._vext = ve;
      const bottom = cp.y - ve, gy = b._gy;

      // ---- water: wherever the land lies below the sea level there is water up to it -----------------------------
      let sub = 0;
      if (gy < SEA && bottom < SEA) {
        let f = 0, tx = 0, tz = 0;
        if (shape === SHAPE.sphere) {
          const u = (SEA - bottom) / (2 * ve);
          f = u >= 1 ? 1 : u * u * (3 - 2 * u);            // exact volume fraction of a sphere cap
        } else if (shape === SHAPE.cylinder || shape === SHAPE.capsule) {
          // two halves along the local y axis: a log floats lying down and is free to roll
          const half = b._hh * 0.5;
          const ax = 2 * (qx * qy - qw * qz) * half, ay = r11 * half, az = 2 * (qy * qz + qw * qx) * half;
          const e = Math.abs(ay) + (shape === SHAPE.capsule ? b._r : b._r * Math.sqrt(Math.max(0, 1 - r11 * r11)));
          for (let k = -1; k <= 1; k += 2) {
            let u = (SEA - (cp.y + k * ay - e)) / (2 * e);
            if (u <= 0) continue;
            u = u >= 1 ? 1 : u * u * (3 - 2 * u);
            f += u; tx -= k * az * u; tz += k * ax * u;
          }
          f *= 0.5; tx *= 0.5; tz *= 0.5;
        } else {
          // boxes and hulls: eight octants, each pushed up by how deep it sits -> floats level, rocks, rights itself
          const r00 = 1 - 2 * (qy * qy + qz * qz), r01 = 2 * (qx * qy - qw * qz), r02 = 2 * (qx * qz + qw * qy);
          const r20 = 2 * (qx * qz - qw * qy), r21 = 2 * (qy * qz + qw * qx), r22 = 1 - 2 * (qx * qx + qy * qy);
          const hx = he[0] * 0.5, hy = he[1] * 0.5, hz = he[2] * 0.5, e = ve * 0.5, top = SEA + e - cp.y, inv = 1 / (2 * e);
          for (let i = 0; i < 8; i++) {
            const sx = i & 1 ? hx : -hx, sy = i & 2 ? hy : -hy, sz = i & 4 ? hz : -hz;
            let u = (top - (r10 * sx + r11 * sy + r12 * sz)) * inv;
            if (u <= 0) continue;
            if (u > 1) u = 1;
            f += u;
            tx -= (r20 * sx + r21 * sy + r22 * sz) * u;
            tz += (r00 * sx + r01 * sy + r02 * sz) * u;
          }
          f *= 0.125; tx *= 0.125; tz *= 0.125;
        }
        if (f > 0) {
          sub = f;
          const lift = b.volume * MASS_SCALE * GRAVITY * s2 * dt;
          vy += lift * f / b.mass;
          const k = lift / b._I;
          wx += tx * k; wz += tz * k;
          const dd = dt * s * f;
          const kh = 1 / (1 + WATER.dragH * dd), kv = 1 / (1 + WATER.dragV * dd), ka = 1 / (1 + WATER.dragA * dd);
          vx *= kh; vz *= kh; vy *= kv; wx *= ka; wy *= ka; wz *= ka;
          dl = da = true;
          if (b.submerged === 0 && v.y < -WATER.splashSpeed * s) P.splash(b, -v.y / s);
        }
      }
      b.submerged = sub;

      // ---- on the ground: rolling resistance ---------------------------------------------------------------------
      const onTerrain = bottom - gy < 0.1 + 0.08 * b.radius;
      const grounded = onTerrain || b._nc > 0;
      b.grounded = grounded;
      if (grounded && sub < 0.3) {
        const wm = Math.sqrt(wx * wx + wy * wy + wz * wz);
        if (shape === SHAPE.box) {
          if (wm > 1e-4) { const k = Math.max(0, 1 - b._rbox * GRAVITY * s2 * dt / (b.radius * wm)); wx *= k; wy *= k; wz *= k; da = true; }
        } else {
          const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
          const r = b._r;
          let held = false;
          if (onTerrain && sp < ROLL.slow * s && wm * r < ROLL.slow * s) {
            // nearly at rest: soft ground holds a ball on any slope gentler than ROLL.hold by cancelling the downhill pull
            P.terrain.gradAt(cp.x, cp.z, _g);
            const t2 = _g.x * _g.x + _g.z * _g.z;
            if (t2 < b._hold * b._hold) {
              const ny = 1 / Math.sqrt(1 + t2), k = GRAVITY * s2 * dt * ny;
              vx += k * _g.x * ny; vz += k * _g.z * ny; vy += GRAVITY * s2 * dt * (1 - ny * ny);
              vx *= 0.88; vz *= 0.88; wx *= 0.8; wy *= 0.8; wz *= 0.8;
              dl = da = held = true;
            }
          }
          if (!held) {
            // rolling: lose speed and spin together, as if the ground gave way a little under the body
            const dv = b._roll * GRAVITY * s2 * dt;
            if (sp > 1e-4) { const k = Math.max(0, 1 - dv / sp); vx *= k; vz *= k; if (vy > 0) vy *= k; dl = true; }
            if (wm > 1e-4) { const k = Math.max(0, 1 - dv / (r * wm)); wx *= k; wy *= k; wz *= k; da = true; }
          }
        }
      }

      // ---- wind ----------------------------------------------------------------------------------------------------
      if (windFn && sub < 1 && b._windK > 0) {
        if ((stepNo + b.id) % WIND.every === 0) {
          const ww = windFn.call(G.elements, b.pos, _w) || _w;
          b._wx = ww.x; b._wy = ww.y; b._wz = ww.z;
        }
        const rx = b._wx * s - vx, ry = b._wy * s - vy, rz = b._wz * s - vz;
        const rm = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const rate = WIND.c * b._windK * rm;
        if (rate * rm > WIND.min * s2) {
          let k = rate * dt * (1 - sub);
          if (k > 0.5) k = 0.5;
          vx += rx * k; vy += ry * k; vz += rz * k;
          dl = true;
        }
      }
    }

    // ---- write back ------------------------------------------------------------------------------------------------
    if (dl) {
      const m2 = vx * vx + vy * vy + vz * vz;
      if (m2 > MAX_SPEED * MAX_SPEED) { const k = MAX_SPEED / Math.sqrt(m2); vx *= k; vy *= k; vz *= k; }
      _lv.x = vx; _lv.y = vy; _lv.z = vz;
      rb.setLinvel(_lv, false);
      v.set(vx, vy, vz);
    }
    if (da) {
      _av.x = wx; _av.y = wy; _av.z = wz;
      rb.setAngvel(_av, false);
      w.set(wx, wy, wz);
    }
  };
  return api;
}
