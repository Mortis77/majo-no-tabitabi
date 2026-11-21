// Ambient life — species and the groups they live in (docs/api/life.md). Pure simulation: writes agent fields that
// life.js packs into the instanced bodies of life/meshes.js. Nothing here touches gameplay.
//
// Agent fields: body ('bird'|'insect'|'frog'|'fish'|'jelly'), x y z, vx vy vz, yaw pitch bank, phase amp fold glow,
// sh0..sh3 (iShape, meaning per body in meshes.js), size, s (current fade 0..1, driven by life.js), sT (fade target),
// colA colB (THREE.Color).
//
// A group def: { id, lands: [sun, dusk, night] weights, max groups at once (quality 'high'), near / far spawn ring (m),
// keep (recycle distance), spacing, follows (leaves when she changes land), find(x, z, env) -> spot | null,
// init(g, env), update(g, ctx) }.
import * as THREE from 'three';
import { POI, MOUNTAIN, STONE_LANTERNS, GREAT_LANTERNS } from '../../data/world.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const col = (h) => new THREE.Color(h);
const hdr = (r, g, b) => new THREE.Color(r, g, b);

/** Land weights from a veil value, as in fx/ambient.js: [sun, dusk, night]. */
export function landWeights(v, out) {
  const sun = 1 - ss(0.05, 0.18, v), night = ss(0.74, 0.9, v);
  out[0] = sun; out[2] = night; out[1] = Math.max(0, 1 - sun - night);
  return out;
}

// ---- species -----------------------------------------------------------------------------------------------------
// birds: size (m per unit body), colours, flap Hz, amplitude, glide chance, glide amplitude, cruise speed, legs, neck,
// dark beak, scare radius
export const KINDS = {
  sparrow: { body: 'bird', size: 0.3, a: 0x8a6447, b: 0x5b3f2b, hz: 9, amp: 0.95, glide: 0.12, gAmp: 0.12, speed: 6.5, legs: 0.14, neck: 0, beak: 0.65, scare: 6.5 },
  swallow: { body: 'bird', size: 0.27, a: 0x263252, b: 0x182038, hz: 6, amp: 0.85, glide: 0.55, gAmp: 0.06, speed: 9, legs: 0, neck: 0, beak: 1 },
  crow: { body: 'bird', size: 0.48, a: 0x26222e, b: 0x17151d, hz: 4.2, amp: 0.78, glide: 0.35, gAmp: 0.08, speed: 7.5, legs: 0.16, neck: 0, beak: 1, scare: 9 },
  goose: { body: 'bird', size: 0.85, a: 0x8a8070, b: 0x5d554a, hz: 2.6, amp: 0.62, glide: 0.08, gAmp: 0.1, speed: 10, legs: 0, neck: 0.32, beak: 1 },
  gull: { body: 'bird', size: 0.56, a: 0xf4f2ec, b: 0xa7b1bc, hz: 3.1, amp: 0.6, glide: 0.65, gAmp: 0.05, speed: 7, legs: 0.15, neck: 0, beak: 0, scare: 8 },
  eagle: { body: 'bird', size: 1.35, a: 0x5c4230, b: 0x392a20, hz: 2.2, amp: 0.5, glide: 0.92, gAmp: 0.04, speed: 9, legs: 0, neck: 0, beak: 0 },
  crane: { body: 'bird', size: 0.95, a: 0xf6f3ec, b: 0x2c2a32, hz: 2.0, amp: 0.7, glide: 0.4, gAmp: 0.08, speed: 6, legs: 0.85, neck: 1, beak: 0.25, scare: 12 },
  bat: { body: 'bird', size: 0.3, a: 0x2e2438, b: 0x40304e, hz: 9, amp: 1.05, glide: 0, gAmp: 0.5, speed: 6, legs: 0, neck: 0, beak: 1 },
  // insects: kind (wing shape), colours (body, wings), flap Hz, amplitude, rest dihedral, hind lag, body stretch, glow
  butterfly: { body: 'insect', size: 0.13, kind: 0, a: 0x2a2420, wings: [0xffe27a, 0xfff6e8, 0x8cc4ff, 0xff9d5c, 0xf6b8d8], hz: 6, amp: 0.8, rest: 0.55, lag: 0.25, stretch: 1, glow: 0 },
  bee: { body: 'insect', size: 0.05, kind: 3, a: 0xe8b030, wings: [0xdfe8f0], hz: 38, amp: 0.45, rest: 0.25, lag: 0, stretch: 1.1, glow: 0 },
  dragonfly: { body: 'insect', size: 0.13, kind: 2, a: 0x2f9fb2, wings: [0xdff4ff], hz: 24, amp: 0.32, rest: 0.05, lag: 1.6, stretch: 2.0, glow: 0 },
  moth: { body: 'insect', size: 0.09, kind: 1, a: 0x6a5a48, wings: [0xd9c9a8, 0xc8b898, 0xe6dcc4], hz: 13, amp: 0.65, rest: 0.3, lag: 0.3, stretch: 1, glow: 0 },
  glowmoth: { body: 'insect', size: 0.11, kind: 1, a: 0x5a6aa0, wings: [0x9fe8ff, 0xc9b0ff, 0xa8ffd8], hz: 9, amp: 0.7, rest: 0.35, lag: 0.3, stretch: 1, glow: 2.6 },
  frog: { body: 'frog', size: 0.13, a: 0x5f8f3a, b: 0x3e6a2a },
};

function agent(body, sp, x, y, z) {
  return {
    body, sp, x, y, z, vx: 0, vy: 0, vz: 0, yaw: rnd(0, TAU), pitch: 0, bank: 0, phase: rnd(0, TAU), amp: 0, fold: 0, glow: 0,
    sh0: 0, sh1: 0, sh2: 0, sh3: 0, size: sp?.size || 1, s: 0, sT: 1, colA: col(sp?.a ?? 0xffffff), colB: col(sp?.b ?? 0xffffff),
    state: 'idle', t: rnd(0, 1.5), flapT: 0, gliding: false, yawRate: 0,
  };
}
function birdAgent(sp, x, y, z) {
  const a = agent('bird', sp, x, y, z);
  a.sh0 = sp.legs; a.sh1 = sp.neck; a.sh3 = sp.beak;
  a.size = sp.size * rnd(0.9, 1.1);
  // a touch of individual colour variation (painted, not uniform)
  a.colA.offsetHSL(rnd(-0.015, 0.015), rnd(-0.05, 0.05), rnd(-0.04, 0.04));
  return a;
}

// ---- motion helpers ------------------------------------------------------------------------------------------------
function steer(a, tx, ty, tz, speed, k, dt, arrive = 0) {
  const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const sp = arrive > 0 ? Math.min(speed, d * arrive) : speed;
  const f = 1 - Math.exp(-k * dt);
  a.vx += (dx / d * sp - a.vx) * f; a.vy += (dy / d * sp - a.vy) * f; a.vz += (dz / d * sp - a.vz) * f;
  a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
  return d;
}
function orient(a, dt, bankK = 0.28) {
  const h = Math.hypot(a.vx, a.vz);
  if (h > 0.08) {
    const want = Math.atan2(a.vx, a.vz);
    const dy = angDiff(a.yaw, want);
    const step = dy * (1 - Math.exp(-8 * dt));
    a.yawRate = damp(a.yawRate, step / Math.max(dt, 1e-3), 6, dt);
    a.yaw += step;
  } else a.yawRate = damp(a.yawRate, 0, 6, dt);
  a.pitch = damp(a.pitch, clamp(-Math.atan2(a.vy, Math.max(h, 0.3)) * 0.7, -0.7, 0.7), 5, dt);
  a.bank = damp(a.bank, clamp(-a.yawRate * bankK, -0.95, 0.95), 5, dt);
}
function flap(a, dt, climb) {
  const sp = a.sp;
  a.flapT -= dt;
  if (a.flapT <= 0) {
    a.gliding = !a.gliding && climb < 0.25 && Math.random() < sp.glide;
    a.flapT = a.gliding ? rnd(0.7, 1.8) : rnd(0.5, 1.3);
  }
  const g = a.gliding && climb < 0.25;
  a.amp = damp(a.amp, g ? sp.gAmp : sp.amp * (1 + clamp(climb, 0, 1) * 0.35), 7, dt);
  a.phase += dt * sp.hz * TAU * (g ? 0.25 : 1 + clamp(climb, 0, 1) * 0.5);
  if (a.phase > TAU) a.phase -= TAU;
  a.fold = damp(a.fold, 0, 10, dt);
  a.sh0 = damp(a.sh0, 0, 5, dt);
}
// nearest threat at (x, y, z): returns 0..1 urgency and writes the flee source into out
function threatAt(ctx, x, y, z, radius, out) {
  const P = ctx.P;
  let best = 0;
  const r = radius * (P.fast ? 1.6 : 1);
  const dp = Math.hypot(P.x - x, (P.y - y) * 0.6, P.z - z);
  if (dp < r) { best = 1 - dp / r * 0.5; out.x = P.x; out.y = P.y; out.z = P.z; }
  for (const t of ctx.threats) {
    const d = Math.hypot(t.x - x, (t.y - y) * 0.6, t.z - z);
    if (d < t.r + radius * 0.4) { const u = Math.min(1, t.k * (1 - d / (t.r + radius * 0.4)) + 0.5); if (u > best) { best = u; out.x = t.x; out.y = t.y; out.z = t.z; } }
  }
  return best;
}
const _src = { x: 0, y: 0, z: 0 };
const dry = (env, x, z) => env.ground(x, z) > 0.3 && !env.world.isWater(x, z);
function nearWater(env, x, z, r) { for (let i = 0; i < 8; i++) { const a = i * TAU / 8; if (env.ground(x + Math.sin(a) * r, z + Math.cos(a) * r) < -0.2) return a; } return null; }

// ---- perching flocks: songbirds, crows, gulls, cranes (wade) ---------------------------------------------------------
function perchInit(spName, nMin, nMax) {
  return (g, env) => {
    const sp = KINDS[spName];
    const n = Math.max(2, Math.round(rnd(nMin, nMax) * Math.max(0.5, env.tier)));
    g.sp = sp; g.mode = 'ground'; g.home = { x: g.x, z: g.z }; g.airT = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * (sp.neck ? 4 : 2.4), an = rnd(0, TAU);
      const x = g.x + Math.sin(an) * r, z = g.z + Math.cos(an) * r;
      const a = birdAgent(sp, x, 0, z);
      a.y = env.ground(x, z) + standH(a); a.fold = 1; a.state = 'ground'; a.sh2 = 0;
      g.agents.push(a);
    }
  };
}
const standH = (a) => (0.1 + a.sp.legs) * a.size;
function perchUpdate(g, ctx) {
  const dt = ctx.dt, sp = g.sp;
  g.t += dt;
  const urg = threatAt(ctx, g.home.x, ctx.ground(g.home.x, g.home.z), g.home.z, sp.scare, _src);
  if (g.mode === 'ground' && urg > 0) {
    g.mode = 'air'; g.airT = rnd(7, 13); g.R = rnd(8, 14) * (sp.neck ? 1.8 : 1); g.H = rnd(5, 9) * (sp.neck ? 1.5 : 1);
    for (const a of g.agents) {
      const dx = a.x - _src.x, dz = a.z - _src.z, d = Math.hypot(dx, dz) || 1;
      const sp0 = sp.speed * rnd(0.7, 1.05) * (sp.neck ? 0.6 : 1);
      a.vx = dx / d * sp0 + rnd(-1.5, 1.5); a.vz = dz / d * sp0 + rnd(-1.5, 1.5); a.vy = rnd(3, 5) * (sp.neck ? 0.6 : 1);
      a.state = 'flee'; a.t = rnd(0.7, 1.3) * (sp.neck ? 1.6 : 1); a.ang = Math.atan2(a.x - g.home.x, a.z - g.home.z); a.gliding = false; a.flapT = 1;
      a.delay = sp.neck ? 0 : rnd(0, 0.18); // the burst ripples through the flock
    }
  } else if (g.mode === 'air' && urg > 0) g.airT = Math.max(g.airT, 3);
  if (g.mode === 'air') {
    g.airT -= dt;
    if (g.airT <= 0) {
      const P = ctx.P;
      const dp = Math.hypot(P.x - g.home.x, P.z - g.home.z);
      if (g.fixed && dp < sp.scare * 1.6) g.airT = 2;   // hero perch: wait in the air until she has passed
      else if (g.fixed) {
        g.mode = 'ground';
        for (const a of g.agents) { const q = g.landAt(a); a.lx = q[0]; a.lz = q[1]; a.state = 'land'; }
      } else if (dp < sp.scare * 2) {
        // she is still there: settle somewhere else, away from her
        const ax = g.home.x - P.x, az = g.home.z - P.z, d = Math.hypot(ax, az) || 1;
        const nx = g.home.x + ax / d * rnd(14, 24), nz = g.home.z + az / d * rnd(14, 24);
        if (ctx.ground(nx, nz) > (sp.neck ? -0.65 : 0.3) && (sp.neck ? ctx.ground(nx, nz) < -0.1 : true)) { g.home.x = nx; g.home.z = nz; g.x = nx; g.z = nz; }
        g.airT = 3;
      } else {
        g.mode = 'ground';
        for (const a of g.agents) {
          const r = Math.sqrt(Math.random()) * (sp.neck ? 4 : 2.4), an = rnd(0, TAU);
          a.lx = g.home.x + Math.sin(an) * r; a.lz = g.home.z + Math.cos(an) * r; a.state = 'land';
        }
      }
    }
  }
  for (const a of g.agents) perchAgent(g, a, ctx, dt, sp);
}
function perchAgent(g, a, ctx, dt, sp) {
  const gnd = g.groundFn || ctx.ground;
  if (a.state === 'ground') {
    a.t -= dt;
    a.fold = damp(a.fold, 1, 10, dt); a.amp = damp(a.amp, 0, 10, dt);
    a.sh0 = damp(a.sh0, sp.legs, 8, dt);
    a.pitch = damp(a.pitch, 0, 8, dt); a.bank = damp(a.bank, 0, 8, dt);
    if (a.hopT > 0) {
      a.hopT -= dt;
      const k = 1 - a.hopT / 0.22;
      a.x += a.hvx * dt; a.z += a.hvz * dt;
      a.y = gnd(a.x, a.z) + standH(a) + Math.sin(Math.PI * clamp(k, 0, 1)) * 0.07 * a.size / 0.26;
      a.fold = 0.55; a.amp = 0.35; a.phase += dt * sp.hz * TAU;
    } else a.y = damp(a.y, gnd(a.x, a.z) + standH(a), 12, dt);
    if (a.pk > 0) { a.pk -= dt; a.sh2 = damp(a.sh2, sp.neck ? 1.2 : 0.85, 22, dt); if (sp.neck) a.sh1 = damp(a.sh1, 0.45, 4, dt); }
    else { a.sh2 = damp(a.sh2, a.look || 0, 10, dt); if (sp.neck) a.sh1 = damp(a.sh1, sp.neck, 3, dt); }
    if (a.t <= 0) {
      const r = Math.random();
      if (sp.neck) { // waders: long feeding dips, slow steps
        if (r < 0.45) { a.pk = rnd(1.2, 3); a.t = a.pk + rnd(0.5, 2); }
        else if (r < 0.75) { a.hopT = 0.22; a.yaw += rnd(-0.6, 0.6); a.hvx = Math.sin(a.yaw) * 0.5; a.hvz = Math.cos(a.yaw) * 0.5; a.t = rnd(0.8, 2); }
        else { a.look = rnd(-0.35, 0.1); a.t = rnd(1, 3); }
      } else if (r < 0.45) { a.pk = 0.16; a.t = rnd(0.25, 0.7); }
      else if (r < 0.75 && !g.noHop) { a.hopT = 0.22; a.yaw += rnd(-0.9, 0.9); const v = rnd(0.6, 1.3) * a.size / 0.26; a.hvx = Math.sin(a.yaw) * v; a.hvz = Math.cos(a.yaw) * v; a.t = rnd(0.3, 0.9); }
      else { a.look = rnd(-0.45, 0.15); a.yaw += rnd(-1.2, 1.2); a.t = rnd(0.4, 1.4); }
    }
    return;
  }
  if (a.delay > 0) { a.delay -= dt; return; }
  const gy = gnd(a.x, a.z);
  if (a.state === 'flee') {
    a.t -= dt;
    a.vy = damp(a.vy, 2.5, 2, dt);
    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    a.sh2 = damp(a.sh2, -0.2, 8, dt);
    if (a.t <= 0) a.state = 'circle';
    flap(a, dt, 1); orient(a, dt);
  } else if (a.state === 'circle') {
    a.ang += dt * (sp.speed / g.R) * (a.dir || (a.dir = Math.random() < 0.5 ? -1 : 1)) * 0.8;
    const tx = g.home.x + Math.sin(a.ang) * g.R, tz = g.home.z + Math.cos(a.ang) * g.R;
    const ty = Math.max(ctx.ground(tx, tz), 0) + g.H + Math.sin(ctx.time * 0.7 + a.phase) * 1.2;
    const w = ctx.windAt(a.x, a.y, a.z);
    steer(a, tx + w.x * 0.6, ty, tz + w.z * 0.6, sp.speed, 2.2, dt);
    flap(a, dt, clamp(a.vy / 3, 0, 1)); orient(a, dt);
  } else if (a.state === 'land') {
    const ty = gnd(a.lx, a.lz) + standH(a);
    const d = Math.hypot(a.lx - a.x, a.lz - a.z);
    // approach: glide down along a slope, then a braking flare with the legs out
    const hy = ty + Math.min(d * 0.45, 8);
    const dist = steer(a, a.lx, hy, a.lz, sp.speed * 0.8, 3, dt, 1.4);
    const flare = 1 - ss(0.4, 3, d);
    a.amp = damp(a.amp, flare > 0.1 ? sp.amp * 1.1 : sp.gAmp, 8, dt);
    a.phase += dt * sp.hz * TAU * (flare > 0.1 ? 1.4 : 0.3); if (a.phase > TAU) a.phase -= TAU;
    a.fold = damp(a.fold, 0, 8, dt);
    a.sh0 = damp(a.sh0, sp.legs * flare, 8, dt);
    orient(a, dt);
    a.pitch = damp(a.pitch, -0.5 * flare, 8, dt);
    if (dist < 0.25 || (d < 0.3 && a.y < ty + 0.15)) { a.state = 'ground'; a.vx = a.vy = a.vz = 0; a.t = rnd(0.2, 1); a.y = ty; }
  }
  if (a.y < gy + 0.2 && a.state !== 'land') a.y = gy + 0.2;
}

// ---- circling (gulls over the sea, eagles over 霜见岳, crows against the sunset) ------------------------------------
function circleInit(spName, nMin, nMax, R, H) {
  return (g, env) => {
    const sp = KINDS[spName];
    g.sp = sp; g.R = rnd(R[0], R[1]); g.H = rnd(H[0], H[1]); g.base = Math.max(env.ground(g.x, g.z), 0);
    const n = Math.max(1, Math.round(rnd(nMin, nMax) * Math.max(0.6, env.tier)));
    for (let i = 0; i < n; i++) {
      const a = birdAgent(sp, 0, 0, 0);
      a.ang = rnd(0, TAU); a.rr = g.R * rnd(0.7, 1.25); a.hh = g.H + rnd(-3, 3); a.dir = i % 3 === 2 ? -1 : 1; a.sh0 = 0;
      a.x = g.x + Math.sin(a.ang) * a.rr; a.z = g.z + Math.cos(a.ang) * a.rr; a.y = g.base + a.hh;
      a.vx = Math.cos(a.ang) * sp.speed * a.dir; a.vz = -Math.sin(a.ang) * sp.speed * a.dir; a.yaw = Math.atan2(a.vx, a.vz);
      g.agents.push(a);
    }
  };
}
function circleUpdate(g, ctx) {
  const dt = ctx.dt, sp = g.sp;
  const urg = threatAt(ctx, g.x, g.base + g.H, g.z, 14, _src);
  g.lift = damp(g.lift || 0, urg > 0 ? 8 : 0, 1.5, dt);
  const w = ctx.windAt(g.x, g.base + g.H, g.z);
  g.x += w.x * dt * 0.15; g.z += w.z * dt * 0.15;  // thermals drift with the wind
  for (const a of g.agents) {
    a.ang += dt * (sp.speed / a.rr) * a.dir;
    const tx = g.x + Math.sin(a.ang) * a.rr, tz = g.z + Math.cos(a.ang) * a.rr;
    const ty = Math.max(ctx.ground(tx, tz) + 9, g.base + a.hh + g.lift + Math.sin(ctx.time * 0.3 + a.phase * 0.2) * 2);
    steer(a, tx, ty, tz, sp.speed, 1.6, dt);
    flap(a, dt, clamp(a.vy / 2, 0, 1)); orient(a, dt, 0.5);
  }
}

// ---- swooping companions (swallows by day, bats at night) -----------------------------------------------------------
function swoopInit(spName, nMin, nMax, hMin, hMax) {
  return (g, env) => {
    const sp = KINDS[spName];
    g.sp = sp; g.hMin = hMin; g.hMax = hMax; g.cx = g.x; g.cz = g.z;
    const n = Math.max(2, Math.round(rnd(nMin, nMax) * Math.max(0.5, env.tier)));
    for (let i = 0; i < n; i++) {
      const a = birdAgent(sp, g.x + rnd(-8, 8), 0, g.z + rnd(-8, 8));
      a.y = env.ground(a.x, a.z) + rnd(hMin, hMax) + 4; a.sh0 = 0;
      a.f = [rnd(0.25, 0.5), rnd(0.3, 0.6), rnd(0.2, 0.45), rnd(0, TAU), rnd(0, TAU)]; a.R = rnd(5, 13);
      g.agents.push(a);
    }
  };
}
function swoopUpdate(g, ctx) {
  const dt = ctx.dt, sp = g.sp, P = ctx.P;
  // the centre drifts lazily after her (they hunt the insects she stirs up)
  g.cx = damp(g.cx, P.x, 0.25, dt); g.cz = damp(g.cz, P.z, 0.25, dt); g.x = g.cx; g.z = g.cz;
  const bat = sp === KINDS.bat;
  for (const a of g.agents) {
    const t = ctx.time;
    const tx = g.cx + Math.sin(t * a.f[0] + a.f[3]) * a.R + (bat ? Math.sin(t * 3.1 + a.f[4]) * 1.2 : 0);
    const tz = g.cz + Math.cos(t * a.f[2] + a.f[4]) * a.R + (bat ? Math.cos(t * 2.7 + a.f[3]) * 1.2 : 0);
    const gy = Math.max(ctx.ground(tx, tz), 0);
    const ty = gy + g.hMin + (g.hMax - g.hMin) * (0.5 + 0.5 * Math.sin(t * a.f[1] + a.f[3] * 2));
    // dodge her at close range
    const dx = a.x - P.x, dz = a.z - P.z, dp = Math.hypot(dx, dz);
    let ox = 0, oz = 0;
    if (dp < 2.5) { ox = dx / (dp || 1) * 4; oz = dz / (dp || 1) * 4; }
    steer(a, tx + ox, ty, tz + oz, sp.speed, bat ? 3.2 : 1.8, dt);
    if (a.y < gy + 0.6) a.y = gy + 0.6;
    flap(a, dt, clamp(a.vy / 2, 0, 1)); orient(a, dt, bat ? 0.15 : 0.35);
  }
}

// ---- a skein of geese crossing the sunset -----------------------------------------------------------------------------
function skeinInit(g, env) {
  const sp = KINDS.goose, P = env.P;
  const ahead = { x: Math.sin(P.yaw || 0), z: Math.cos(P.yaw || 0) };
  const side = Math.random() < .5 ? -1 : 1;
  const h = (P.yaw || 0) + side * rnd(1.2, 1.85);
  g.dir = { x: Math.sin(h), z: Math.cos(h) };
  const lead = P.fast ? 96 : 58;
  g.lx = P.x + ahead.x * lead - g.dir.x * 86;
  g.lz = P.z + ahead.z * lead - g.dir.z * 86;
  const terrain = Math.max(0, env.ground(g.lx, g.lz));
  g.ly = Math.max(terrain + rnd(29, 45), P.y + rnd(7, 16));
  g.yaw = h; g.sp = sp; g.flightAge = 0;
  const n = Math.max(5, Math.round(rnd(7, 11) * Math.max(0.6, env.tier)));
  for (let i = 0; i < n; i++) {
    const a = birdAgent(sp, g.lx, g.ly, g.lz);
    a.rank = Math.ceil(i / 2); a.side = i === 0 ? 0 : i % 2 ? 1 : -1; a.sh0 = 0; a.fadeK = 0.35;
    a.wob = rnd(0, TAU);
    g.agents.push(a);
  }
}
function skeinUpdate(g, ctx) {
  const dt = ctx.dt, sp = g.sp, P = ctx.P;
  g.lx += g.dir.x * sp.speed * dt; g.lz += g.dir.z * sp.speed * dt;
  g.x = g.lx; g.z = g.lz;
  g.flightAge += dt;
  const ahead = ctx.ground(g.x + g.dir.x * 15, g.z + g.dir.z * 15);
  g.ly = damp(g.ly, Math.max(g.ly, ahead + 16), 1.5, dt);
  const c = Math.cos(g.yaw), s = Math.sin(g.yaw);
  for (const a of g.agents) {
    const ox = a.side * a.rank * 1.8 + Math.sin(ctx.time * 0.4 + a.wob) * 0.3, oz = -a.rank * 1.6;
    a.x = g.lx + c * ox + s * oz; a.z = g.lz - s * ox + c * oz; a.y = g.ly + Math.sin(ctx.time * 0.5 + a.wob) * 0.4 - a.rank * 0.15;
    a.yaw = g.yaw; a.pitch = 0; a.bank = 0;
    a.amp = sp.amp; a.phase = (ctx.time * sp.hz * TAU - a.rank * 0.7) % TAU; a.fold = 0;
  }
  const dx = g.lx - P.x, dz = g.lz - P.z;
  if (Math.hypot(dx, dz) > 265 || g.flightAge > 45) g.leaving = true;
}

// ---- insects -----------------------------------------------------------------------------------------------------------
function insectInit(spName, nMin, nMax, how) {
  return (g, env) => {
    const sp = KINDS[spName];
    g.sp = sp; g.how = how;
    const n = Math.max(2, Math.round(rnd(nMin, nMax) * Math.max(0.5, env.tier)));
    for (let i = 0; i < n; i++) {
      const a = agent('insect', sp, g.x, 0, g.z);
      a.colA = col(sp.a); a.colB = col(sp.wings[(Math.random() * sp.wings.length) | 0]);
      a.colB.offsetHSL(rnd(-0.02, 0.02), 0, rnd(-0.04, 0.04));
      a.size = sp.size * rnd(0.85, 1.15); a.sh0 = sp.rest; a.sh1 = sp.lag; a.sh2 = Math.random(); a.sh3 = sp.stretch; a.amp = sp.amp; a.glow = sp.glow;
      const r = how === 'orbit' ? rnd(0.4, 1.1) : how === 'dart' ? rnd(1, 4) : rnd(0.5, 4);
      const an = rnd(0, TAU);
      a.ax = g.x + (how === 'orbit' ? 0 : Math.sin(an) * r); a.az = g.z + (how === 'orbit' ? 0 : Math.cos(an) * r);
      a.ay = (g.spot.y ?? env.ground(a.ax, a.az)) + (how === 'orbit' ? rnd(-0.2, 0.4) : how === 'bee' ? rnd(0.2, 0.7) : how === 'dart' ? rnd(0.4, 1.2) : rnd(0.4, 1.8));
      a.r = r; a.f = [rnd(0.6, 1.4), rnd(0.8, 1.7), rnd(0.5, 1.2), rnd(0, TAU), rnd(0, TAU)];
      a.x = a.ax; a.y = a.ay; a.z = a.az; a.ox = 0; a.oz = 0; a.oy = 0; a.fadeK = 1.5;
      a.restT = rnd(3, 9);
      g.agents.push(a);
    }
  };
}
function insectUpdate(g, ctx) {
  const dt = ctx.dt, sp = g.sp, how = g.how, t = ctx.time;
  const w = ctx.windAt(g.x, (g.spot.y ?? 0) + 1, g.z);
  const light = sp.kind <= 1 ? 0.5 : 0.15;
  for (const a of g.agents) {
    // flee: she brushes past or a blast goes off
    const u = threatAt(ctx, a.x, a.y, a.z, how === 'orbit' ? 1.4 : 2.2, _src);
    if (u > 0) {
      const dx = a.x - _src.x, dz = a.z - _src.z, d = Math.hypot(dx, dz) || 1;
      a.ox += dx / d * dt * 6 * u; a.oz += dz / d * dt * 6 * u; a.oy += dt * 2 * u; a.resting = false; a.restT = rnd(3, 8);
    }
    a.ox = damp(a.ox, 0, 0.35, dt); a.oz = damp(a.oz, 0, 0.35, dt); a.oy = damp(a.oy, 0, 0.5, dt);
    let tx, ty, tz, speed = 2, k = 3;
    if (how === 'orbit') {           // moths round a lantern
      a.ang = (a.ang || rnd(0, TAU)) + dt * a.f[0] * 2.4 * (a.f[3] > Math.PI ? 1 : -1);
      const r = a.r + Math.sin(t * a.f[1] * 2 + a.f[4]) * 0.3;
      tx = a.ax + Math.sin(a.ang) * r; tz = a.az + Math.cos(a.ang) * r; ty = a.ay + Math.sin(t * a.f[2] * 3 + a.f[3]) * 0.35;
      speed = 2.6; k = 6;
    } else if (how === 'dart' || how === 'bee') {  // dragonflies and bees: hover, then dart to a new point
      a.dT = (a.dT ?? 0) - dt;
      if (a.dT <= 0) {
        a.dT = how === 'bee' ? rnd(0.3, 1.0) : rnd(0.6, 1.8);
        const an = rnd(0, TAU), r = rnd(0.5, a.r + 1);
        a.tx = a.ax + Math.sin(an) * r; a.tz = a.az + Math.cos(an) * r; a.ty = a.ay + rnd(-0.25, 0.4);
      }
      tx = a.tx ?? a.ax; ty = a.ty ?? a.ay; tz = a.tz ?? a.az;
      tx += Math.sin(t * 9 + a.f[3]) * 0.03; ty += Math.sin(t * 11 + a.f[4]) * 0.03;
      speed = how === 'bee' ? 2.5 : 6; k = how === 'bee' ? 7 : 10;
    } else {                          // butterflies, glow-moths: wandering, bobbing flight; butterflies rest on flowers
      a.restT -= dt;
      if (sp.kind === 0 && a.restT <= 0) {
        a.resting = !a.resting; a.restT = a.resting ? rnd(2, 6) : rnd(5, 12);
        if (a.resting) { a.rx = a.x + rnd(-0.6, 0.6); a.rz = a.z + rnd(-0.6, 0.6); }
      }
      if (a.resting) {
        tx = a.rx; tz = a.rz; ty = ctx.ground(a.rx, a.rz) + 0.32; speed = 1; k = 4;
      } else {
        tx = a.ax + Math.sin(t * a.f[0] * 0.45 + a.f[3]) * a.r + Math.sin(t * a.f[1] * 1.3) * 0.5;
        tz = a.az + Math.cos(t * a.f[2] * 0.45 + a.f[4]) * a.r + Math.cos(t * a.f[0] * 1.1) * 0.5;
        ty = a.ay + Math.sin(t * a.f[1] * 1.7 + a.f[3]) * 0.4 + Math.abs(Math.sin(t * sp.hz * 0.5 + a.f[4])) * 0.12;
        speed = sp.glow ? 0.9 : 1.6; k = 2.5;
      }
    }
    const d = steer(a, tx + a.ox + w.x * light, ty + a.oy, tz + a.oz + w.z * light, speed, k, dt, 3);
    const gy = ctx.ground(a.x, a.z);
    if (a.y < gy + 0.12) a.y = gy + 0.12;
    if (how === 'dart' && a.y < 0.15 && gy < 0) a.y = 0.15;
    orient(a, dt, 0.05);
    a.pitch *= 0.4;
    // wings: resting butterflies hold them closed upright with a slow fan
    const rest = a.resting && d < 0.15;
    a.sh0 = damp(a.sh0, rest ? 1.42 : sp.rest, 6, dt);
    a.amp = damp(a.amp, rest ? 0.1 : sp.amp, 6, dt);
    a.phase += dt * TAU * (rest ? 0.6 : sp.hz * (1 + (a.ox * a.ox + a.oz * a.oz > 0.05 ? 0.5 : 0)));
    if (a.phase > TAU) a.phase -= TAU;
    if (sp.glow) a.glow = sp.glow * (0.6 + 0.4 * Math.sin(t * 1.3 + a.f[3]));
  }
}

// ---- fish under the surface -------------------------------------------------------------------------------------------
function fishInit(light) {
  return (g, env) => {
    const n = Math.max(2, Math.round(rnd(3, 6) * Math.max(0.5, env.tier)));
    g.light = light; g.ripT = rnd(2, 5);
    for (let i = 0; i < n; i++) {
      const a = agent('fish', null, g.x + rnd(-3, 3), 0, g.z + rnd(-3, 3));
      a.size = light ? rnd(0.35, 0.55) : rnd(0.45, 0.8);
      a.colA = light ? (Math.random() < 0.5 ? hdr(0.5, 1.7, 2.1) : hdr(2.0, 1.6, 0.6)) : col(0x0d1b20);
      a.colB = a.colA; a.sh0 = light ? 1 : 0; a.glow = light ? 0.9 : 0.36;
      a.v = rnd(0.4, 0.9); a.turn = 0; a.fadeK = 0.8;
      if (env.ground(a.x, a.z) > -0.8) { a.x = g.x; a.z = g.z; }
      g.agents.push(a);
    }
  };
}
function fishUpdate(g, ctx) {
  const dt = ctx.dt;
  for (const a of g.agents) {
    a.t -= dt;
    if (a.t <= 0) { a.turn = rnd(-0.8, 0.8); a.t = rnd(0.8, 2.5); a.vT = rnd(0.3, 1.0); }
    const u = threatAt(ctx, a.x, 0, a.z, 3.5, _src);
    if (u > 0) { const want = Math.atan2(a.x - _src.x, a.z - _src.z); a.yaw += angDiff(a.yaw, want) * Math.min(1, dt * 8); a.vT = 4.5; a.t = 0.8; }
    // stay in deep enough water and near home
    const fx = a.x + Math.sin(a.yaw) * 1.6, fz = a.z + Math.cos(a.yaw) * 1.6;
    if (ctx.ground(fx, fz) > -0.7) a.yaw += 2.5 * dt * (a.turn >= 0 ? 1 : -1) + 0.02;
    else if (Math.hypot(a.x - g.x, a.z - g.z) > (g.R || 10)) a.yaw += angDiff(a.yaw, Math.atan2(g.x - a.x, g.z - a.z)) * dt;
    else a.yaw += a.turn * dt;
    a.v = damp(a.v, a.vT ?? 0.6, 3, dt);
    a.x += Math.sin(a.yaw) * a.v * dt; a.z += Math.cos(a.yaw) * a.v * dt;
    a.y = (ctx.water?.surfaceAt ? ctx.water.surfaceAt(a.x, a.z) : 0) + 0.02;
    a.amp = 0.5 + a.v * 0.35;
    a.phase += dt * (5 + a.v * 7); if (a.phase > TAU * 8) a.phase -= TAU * 8;
    a.pitch = 0; a.bank = 0;
  }
  // now and then one rises and breaks the surface
  g.ripT -= dt;
  if (g.ripT <= 0 && g.agents.length) {
    g.ripT = rnd(3, 8);
    const a = g.agents[(Math.random() * g.agents.length) | 0];
    if (a.s > 0.5) ctx.water?.ripple?.(a.x, a.z, g.light ? 0.22 : 0.18);
  }
}

// ---- lantern-jellies drifting over the dark shore ---------------------------------------------------------------------
function jellyInit(g, env) {
  const n = Math.max(2, Math.round(rnd(3, 5) * Math.max(0.5, env.tier)));
  for (let i = 0; i < n; i++) {
    const a = agent('jelly', null, g.x + rnd(-8, 8), 0, g.z + rnd(-8, 8));
    a.ay = Math.max(env.ground(a.x, a.z), 0) + rnd(2.2, 7); a.y = a.ay;
    a.size = rnd(0.55, 1.15);
    const hue = Math.random();
    a.colA = hue < 0.5 ? hdr(0.55, 1.5, 2.4) : hdr(1.7, 0.8, 2.3); a.colB = hue < 0.5 ? hdr(1.4, 2.2, 2.4) : hdr(2.3, 1.6, 2.2);
    a.ax = a.x; a.az = a.z; a.f = [rnd(0.05, 0.12), rnd(0.05, 0.12), rnd(0, TAU), rnd(0, TAU)]; a.fadeK = 0.4;
    a.glow = 0.6;
    g.agents.push(a);
  }
}
function jellyUpdate(g, ctx) {
  const dt = ctx.dt, t = ctx.time;
  const w = ctx.windAt(g.x, 4, g.z);
  for (const a of g.agents) {
    a.phase += dt * (1.5 + Math.sin(t * 0.1 + a.f[2]) * 0.3); if (a.phase > TAU) a.phase -= TAU;
    const u = threatAt(ctx, a.x, a.y, a.z, 3, _src);
    if (u > 0) { a.ax += (a.x - _src.x) * dt * 0.5; a.az += (a.z - _src.z) * dt * 0.5; }
    a.ax += w.x * dt * 0.15; a.az += w.z * dt * 0.15;
    const tx = a.ax + Math.sin(t * a.f[0] + a.f[2]) * 4, tz = a.az + Math.cos(t * a.f[1] + a.f[3]) * 4;
    a.x = damp(a.x, tx, 0.4, dt); a.z = damp(a.z, tz, 0.4, dt);
    a.y = damp(a.y, a.ay + Math.max(0, Math.sin(a.phase)) * 0.35 + Math.sin(t * 0.2 + a.f[3]) * 0.8, 1.2, dt);
    a.yaw += dt * 0.15; a.pitch = Math.sin(t * 0.3 + a.f[2]) * 0.08; a.bank = Math.cos(t * 0.27 + a.f[3]) * 0.08;
    a.glow = 0.7 + 0.3 * Math.sin(a.phase + 1);
  }
}

// ---- frogs on the river banks -----------------------------------------------------------------------------------------
function frogInit(g, env) {
  const sp = KINDS.frog;
  const n = Math.max(1, Math.round(rnd(2, 4) * Math.max(0.5, env.tier)));
  for (let i = 0; i < n; i++) {
    const a = agent('frog', sp, g.x + rnd(-2, 2), 0, g.z + rnd(-2, 2));
    a.size = sp.size * rnd(0.85, 1.2); a.colA.offsetHSL(rnd(-0.03, 0.03), 0, rnd(-0.05, 0.05));
    a.y = env.ground(a.x, a.z);
    if (a.y < 0.02) { a.x = g.x; a.z = g.z; a.y = env.ground(a.x, a.z); }
    a.yaw = (g.spot.wa ?? 0) + rnd(-0.5, 0.5);
    a.state = 'sit'; a.t = rnd(1, 5); a.fadeK = 2;
    g.agents.push(a);
  }
}
function frogUpdate(g, ctx) {
  const dt = ctx.dt;
  for (const a of g.agents) {
    if (a.state === 'gone') {
      a.t -= dt;
      const P = ctx.P;
      if (a.t <= 0 && Math.hypot(P.x - g.x, P.z - g.z) > 9) {
        a.x = g.x + rnd(-1.5, 1.5); a.z = g.z + rnd(-1.5, 1.5);
        if (ctx.ground(a.x, a.z) > 0.02) { a.y = ctx.ground(a.x, a.z); a.state = 'sit'; a.sT = 1; a.hide = false; a.t = rnd(2, 5); }
        else a.t = 1;
      }
      continue;
    }
    if (a.state === 'hop') {
      a.ht += dt;
      const k = clamp(a.ht / a.hd, 0, 1);
      a.x = a.hx0 + (a.hx1 - a.hx0) * k; a.z = a.hz0 + (a.hz1 - a.hz0) * k;
      a.y = a.hy0 + (a.hy1 - a.hy0) * k + Math.sin(Math.PI * k) * a.hh;
      a.amp = Math.sin(Math.PI * Math.min(1, k * 1.6)); a.pitch = -0.5 * (1 - 2 * k);
      if (k >= 1) {
        a.amp = 0; a.pitch = 0;
        if (a.into) { ctx.water?.ripple?.(a.x, a.z, 0.3); a.state = 'gone'; a.sT = 0; a.fadeK = 8; a.t = rnd(12, 20); }
        else { a.state = 'sit'; a.t = rnd(2, 6); }
      }
      continue;
    }
    // sitting: throat pumping in bursts, now and then a small hop along the bank
    a.t -= dt;
    a.fold = a.croak > 0 ? 0.5 + 0.5 * Math.sin(ctx.time * 26) : 0;
    if (a.croak > 0) a.croak -= dt;
    const u = threatAt(ctx, a.x, a.y, a.z, 3.6, _src);
    if (u > 0 || a.t <= 0) {
      let dir = a.yaw, len = rnd(0.3, 0.6), into = false;
      if (u > 0) { const wa = g.spot.wa; dir = wa ?? Math.atan2(a.x - _src.x, a.z - _src.z); len = rnd(1.4, 2.2); into = true; }
      else if (Math.random() < 0.5) { a.croak = rnd(0.6, 1.4); a.t = rnd(2, 6); continue; }
      else dir = a.yaw + rnd(-1, 1);
      a.state = 'hop'; a.ht = 0; a.hd = into ? 0.42 : 0.3; a.hh = into ? 0.35 : 0.12;
      a.hx0 = a.x; a.hz0 = a.z; a.hy0 = a.y; a.hx1 = a.x + Math.sin(dir) * len; a.hz1 = a.z + Math.cos(dir) * len;
      const gy = ctx.ground(a.hx1, a.hz1);
      a.into = into || gy < -0.05;
      a.hy1 = a.into ? (ctx.water?.surfaceAt ? ctx.water.surfaceAt(a.hx1, a.hz1) : 0) - 0.05 : gy;
      a.yaw = dir;
    }
  }
}
// frogs read iAnim.y as leg stretch (amp) and iAnim.z as throat (fold): see meshes.js

// ---- spot finders -----------------------------------------------------------------------------------------------------
const flat0 = (env, x, z, s) => env.world.slopeAt(x, z) < s;
function findMeadow(x, z, env) {
  if (!dry(env, x, z) || !flat0(env, x, z, 0.35) || env.world.isReserved(x, z, 2)) return null;
  return { x, z };
}
// songbirds peck on paths and bare ground: the meadow grass would hide a 25 cm bird
function findPath(x, z, env) {
  if (!dry(env, x, z) || !flat0(env, x, z, 0.3) || (env.world.roadDist?.(x, z) ?? 99) > 2.2) return null;
  for (const id of ['village', 'foxvillage', 'town', 'shrine']) { const p = POI[id]; if (Math.hypot(x - p.x, z - p.z) < p.r * 0.8) return null; }
  return { x, z };
}
function findFlowers(x, z, env) {
  if (!dry(env, x, z) || !flat0(env, x, z, 0.4) || env.world.isReserved(x, z, 1) || (env.world.roadDist?.(x, z) ?? 99) < 3) return null;
  return { x, z };
}
function findBeach(x, z, env) {
  const h = env.ground(x, z);
  if (h < 0.15 || h > 4 || env.world.isReserved(x, z, 1) || !flat0(env, x, z, 0.35)) return null;
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; if (env.world.isWater(x + Math.sin(a) * 14, z + Math.cos(a) * 14) && (env.water?.depthAt?.(x + Math.sin(a) * 30, z + Math.cos(a) * 30) ?? 0) > 3) return { x, z }; }
  return null;
}
function findSea(x, z, env) {
  if ((env.water?.depthAt?.(x, z) ?? -env.ground(x, z)) < 2) return null;
  return nearWater(env, x, z, 1) !== null && landWithin(env, x, z, 45) ? { x, z, y: 0 } : null;
}
function landWithin(env, x, z, r) { for (let i = 0; i < 8; i++) { const a = i * TAU / 8; if (env.ground(x + Math.sin(a) * r, z + Math.cos(a) * r) > 0.5) return true; } return false; }
function findShallows(x, z, env) {
  const h = env.ground(x, z);
  if (h > -0.15 || h < -0.65) return null;
  return { x, z, y: h };
}
function findWater(x, z, env) {
  if (env.ground(x, z) > -1.0) return null;
  return { x, z, y: 0 };
}
function findBank(x, z, env) {
  const h = env.ground(x, z);
  if (h < 0.04 || h > 1.6 || env.world.isReserved(x, z, 0.5)) return null;
  const wa = nearWater(env, x, z, 2.5);
  return wa === null ? null : { x, z, wa };
}
function findWaterEdge(x, z, env) {
  const h = env.ground(x, z);
  if (h > 1.5) return null;
  const wa = nearWater(env, x, z, 4);
  return wa === null ? null : { x, z, y: Math.max(h, 0) };
}
let LAMPS = null;
function lamps(env) {
  if (LAMPS) return LAMPS;
  LAMPS = STONE_LANTERNS.map((l) => ({ x: l.x, z: l.z, h: 1.55 }));
  for (const gl of GREAT_LANTERNS) { const p = env.world.anchor?.(gl.anchor); if (p) LAMPS.push({ x: p.x, z: p.z, h: 2.6 }); }
  return LAMPS;
}
function findLantern(x, z, env) {
  let best = null, bd = 30;
  for (const l of lamps(env)) { const d = Math.hypot(l.x - x, l.z - z); if (d < bd) { bd = d; best = l; } }
  return best ? { x: best.x, z: best.z, y: env.ground(best.x, best.z) + best.h } : null;
}
function findSunhill(x, z, env) {
  const p = POI.sunhill;
  if (Math.hypot(x - p.x, z - p.z) > p.r * 1.1) return null;
  return findFlowers(x, z, env);
}
function findPeak(x, z, env) {
  const m = MOUNTAIN, e = Math.hypot((x - m.x) / m.rx, (z - m.z) / m.rz);
  if (e > 1.25) return null;
  return { x, z };
}
const any = (x, z) => ({ x, z });

// ---- groups --------------------------------------------------------------------------------------------------------------
// ---- hero moments (final-beasts round): placed where a player walks, larger on screen than the ambient specks -------
Object.assign(KINDS, {
  sparrowH: { ...KINDS.sparrow, size: 0.44, scare: 8 },
  crowH: { ...KINDS.crow, size: 0.68, scare: 11 },
  heron: { body: 'bird', size: 1.2, a: 0x9aa6b4, b: 0x3c4450, hz: 1.9, amp: 0.74, glide: 0.5, gAmp: 0.08, speed: 6, legs: 0.85, neck: 1, beak: 0.25, scare: 15 },
  mothH: { ...KINDS.moth, size: 0.16, wings: [0xf0dcb0, 0xe8c890, 0xfff0d0] },
});
const STEPS = { top: [-549.6, 73.2], bot: [-529.4, 91.8] };          // 向日神社 stone stairs (builders/shrine.js)
const TUNNEL = { a: [-70, 90], b: [-60, 0], s: 0.82, d: [29, 44] };   // 千本鳥居 (builders/dusk.js): torii every 1.15 m from d = 14
const PIER = { x: 44, z: 270 };                                      // 镜湖 ferry pier
let HERO = null;
function heroSpots(env) {
  if (HERO) return HERO;
  const H = { steps: [], torii: [], koi: [], heron: [] };
  { const [x0, z0] = STEPS.top, [x1, z1] = STEPS.bot; H.steps.push({ x: x0 + (x1 - x0) * 0.5, z: z0 + (z1 - z0) * 0.5, kind: 'steps' }); }
  {
    const [ax, az] = TUNNEL.a, [bx, bz] = TUNNEL.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    for (const d0 of TUNNEL.d) {
      const d = 14 + Math.round((d0 - 14) / 1.15) * 1.15;
      const x = ax + ux * d, z = az + uz * d;
      H.torii.push({ x, z, y: env.ground(x, z) + (4.6 + 0.24) * TUNNEL.s, bx: uz, bz: -ux, half: 2.0 * TUNNEL.s, kind: 'torii' });
    }
  }
  // deep water closest to the pier end, and lake shallows near it
  let bk = null, bd = 1e9, bh = null, bhd = 1e9;
  for (let r = 4; r <= 46; r += 2) for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, x = PIER.x + Math.sin(a) * r, z = PIER.z + Math.cos(a) * r, h = env.ground(x, z);
    if (h < -1.2 && r < bd) { bd = r; bk = { x, z, y: 0, kind: 'koi' }; }
    if (h < -0.2 && h > -0.6 && r > 12 && r < bhd) { bhd = r; bh = { x, z, y: h, kind: 'heron' }; }
  }
  if (bk) H.koi.push(bk);
  if (bh) H.heron.push(bh);
  return (HERO = H);
}
function heroFind(key, reach = 80) {
  return (x, z, env) => {
    const P = env.P; let best = null, bd = reach;
    for (const s of heroSpots(env)[key]) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd) { bd = d; best = s; } }
    return best ? { ...best } : null;
  };
}
function heroPerchInit(spName, n) {
  return (g, env) => {
    const sp = KINDS[spName], S = g.spot;
    g.sp = sp; g.mode = 'ground'; g.home = { x: g.x, z: g.z }; g.airT = 0; g.fixed = true;
    if (S.kind === 'torii') {
      // in a row on the top beam of the torii
      g.noHop = true; const top = S.y;
      g.groundFn = (x, z) => (Math.hypot(x - S.x, z - S.z) < S.half + 0.4 ? top : env.ground(x, z));
      g.landAt = (a) => [S.x + S.bx * a.slot, S.z + S.bz * a.slot];
    } else if (S.kind === 'steps') {
      // scattered over the stairs, pecking on the treads
      const [x0, z0] = STEPS.top, [x1, z1] = STEPS.bot, L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      g.groundFn = env.groundAt || env.ground;
      g.landAt = (a) => [x0 + ux * L * a.slot + uz * a.lat, z0 + uz * L * a.slot - ux * a.lat];
    } else {
      g.landAt = (a) => [S.x + Math.sin(a.slot * 9) * 2.5, S.z + Math.cos(a.slot * 9) * 2.5];
    }
    for (let i = 0; i < n; i++) {
      const a = birdAgent(sp, g.x, 0, g.z);
      a.slot = S.kind === 'torii' ? (i / Math.max(1, n - 1) - 0.5) * 2 * S.half * 0.85 : S.kind === 'steps' ? rnd(0.18, 0.78) : i / n;
      a.lat = rnd(-1.5, 1.5);
      [a.x, a.z] = g.landAt(a);
      a.y = (g.groundFn || env.ground)(a.x, a.z) + standH(a); a.fold = 1; a.state = 'ground'; a.sh2 = 0;
      if (S.kind === 'torii') a.yaw = Math.atan2(S.bz, -S.bx) + rnd(-0.4, 0.4);
      g.agents.push(a);
    }
  };
}
function koiInit(g, env) {
  const C = [0xff6a1e, 0xf6efe4, 0xffb22e, 0xe8452a, 0xf6efe4];
  g.light = false; g.ripT = rnd(2, 4); g.R = 4.5;
  for (let i = 0; i < 5; i++) {
    const a = agent('fish', null, g.x + rnd(-2, 2), 0, g.z + rnd(-2, 2));
    a.size = rnd(0.75, 1.0); a.colA = col(C[i]); a.colB = a.colA; a.sh0 = 0; a.glow = 0.82;
    a.v = rnd(0.3, 0.6); a.turn = 0; a.fadeK = 0.8;
    g.agents.push(a);
  }
}
function heroMothFind(x, z, env) {
  const L = env.lamps, T = POI.town; if (!Array.isArray(L) || !L.length) return null;   // needs G.sky.lampList() (requested)
  const P = env.P; if (Math.hypot(P.x - T.x, P.z - T.z) > T.r + 30) return null;
  let best = null, bd = 1e9;
  for (const l of L) {
    if (Math.hypot(l.x - T.x, l.z - T.z) > T.r) continue;
    const d = Math.hypot(l.x - x, l.z - z) + Math.random() * 6;
    if (d < bd && Math.hypot(l.x - P.x, l.z - P.z) < 30) { bd = d; best = l; }
  }
  return best ? { x: best.x, z: best.z, y: best.y } : null;
}

export const GROUPS = [
  // hero moments (one of each where she passes; every tier)
  { id: 'hero_sparrows', lands: [1, 0.3, 0], max: 1, lowFloor: 1, near: 0, far: 70, keep: 100, spacing: 3, find: heroFind('steps'), init: heroPerchInit('sparrowH', 8), update: perchUpdate },
  { id: 'hero_crows', lands: [0.1, 1, 0.2], max: 2, lowFloor: 0.5, near: 0, far: 70, keep: 100, spacing: 3, find: heroFind('torii'), init: heroPerchInit('crowH', 4), update: perchUpdate },
  { id: 'hero_heron', lands: [0.4, 1, 0.2], max: 1, lowFloor: 1, near: 0, far: 90, keep: 130, spacing: 3, find: heroFind('heron', 90), init: heroPerchInit('heron', 1), update: perchUpdate },
  { id: 'hero_koi', lands: [1, 1, 0.3], max: 1, lowFloor: 1, near: 0, far: 60, keep: 90, spacing: 3, find: heroFind('koi', 60), init: koiInit, update: fishUpdate },
  { id: 'hero_moths', lands: [0, 0.6, 1], max: 3, lowFloor: 0.34, near: 0, far: 30, keep: 50, spacing: 4, find: heroMothFind, init: insectInit('mothH', 4, 6, 'orbit'), update: insectUpdate },
  // 曦光原
  { id: 'songbirds', lands: [1, 0.15, 0], max: 3, near: 24, far: 70, keep: 120, spacing: 22, find: findPath, init: perchInit('sparrow', 5, 9), update: perchUpdate },
  { id: 'swallows', lands: [1, 0.2, 0], max: 1, near: 10, far: 30, keep: 200, spacing: 40, follows: true, find: findMeadow, init: swoopInit('swallow', 4, 6, 1.2, 6), update: swoopUpdate },
  { id: 'butterflies', lands: [1, 0.25, 0], max: 4, near: 10, far: 40, keep: 60, spacing: 12, find: findFlowers, init: insectInit('butterfly', 4, 7, 'wander'), update: insectUpdate },
  { id: 'bees', lands: [1, 0, 0], max: 2, near: 8, far: 40, keep: 55, spacing: 10, find: findSunhill, init: insectInit('bee', 6, 10, 'bee'), update: insectUpdate },
  { id: 'dragonflies', lands: [1, 0.8, 0], max: 2, near: 8, far: 40, keep: 60, spacing: 12, find: findWaterEdge, init: insectInit('dragonfly', 2, 4, 'dart'), update: insectUpdate },
  { id: 'fish', lands: [1, 1, 0], max: 3, near: 10, far: 45, keep: 70, spacing: 14, find: findWater, init: fishInit(false), update: fishUpdate },
  // coast and peaks
  { id: 'gulls', lands: [0.8, 0.6, 0], max: 2, near: 25, far: 80, keep: 140, spacing: 30, find: findBeach, init: perchInit('gull', 3, 6), update: perchUpdate },
  { id: 'gullsky', lands: [0.8, 0.6, 0], max: 2, near: 25, far: 90, keep: 160, spacing: 40, find: findSea, init: circleInit('gull', 2, 4, [12, 22], [8, 16]), update: circleUpdate },
  { id: 'eagles', lands: [1, 1, 0.3], max: 1, near: 40, far: 160, keep: 320, spacing: 80, find: findPeak, init: circleInit('eagle', 1, 2, [24, 40], [38, 60]), update: circleUpdate },
  // 薄暮林
  { id: 'crows', lands: [0, 1, 0.1], max: 2, near: 24, far: 70, keep: 120, spacing: 25, find: findMeadow, init: perchInit('crow', 4, 7), update: perchUpdate },
  { id: 'crowsky', lands: [.76, 1, 0], max: 1, lowFloor: .72, near: 30, far: 90, keep: 180, spacing: 60, find: any, init: circleInit('crow', 3, 5, [16, 26], [18, 28]), update: circleUpdate },
  { id: 'geese', lands: [1, 1, 0], max: 1, lowFloor: 1, interval: 40, near: 0, far: 1, keep: 1e9, spacing: 0, follows: true, find: any, init: skeinInit, update: skeinUpdate },
  { id: 'moths', lands: [0, 1, 0.7], max: 4, near: 0, far: 45, keep: 60, spacing: 3, find: findLantern, init: insectInit('mothH', 3, 6, 'orbit'), update: insectUpdate },
  { id: 'frogs', lands: [.8, 1, 0.3], max: 2, near: 10, far: 40, keep: 60, spacing: 10, find: findBank, init: frogInit, update: frogUpdate },
  { id: 'cranes', lands: [.82, 1, 0], max: 1, near: 25, far: 80, keep: 140, spacing: 30, find: findShallows, init: perchInit('crane', 2, 4), update: perchUpdate },
  // 常夜原
  { id: 'glowmoths', lands: [0, 0.2, 1], max: 3, near: 8, far: 40, keep: 60, spacing: 12, find: findFlowers, init: insectInit('glowmoth', 5, 8, 'wander'), update: insectUpdate },
  { id: 'lightfish', lands: [0, 0.2, 1], max: 3, near: 10, far: 45, keep: 70, spacing: 14, find: findWater, init: fishInit(true), update: fishUpdate },
  { id: 'bats', lands: [0, 0.1, 1], max: 1, near: 10, far: 30, keep: 200, spacing: 40, follows: true, find: any, init: swoopInit('bat', 4, 6, 2.5, 8), update: swoopUpdate },
  { id: 'jellies', lands: [0, 0, 1], max: 2, near: 20, far: 70, keep: 110, spacing: 25, find: findWaterEdge, init: jellyInit, update: jellyUpdate },
];
// instance caps per body at quality 'high' (worst case of the group maxima above)
export const CAPS = { bird: 96, insect: 110, frog: 10, fish: 24, jelly: 12 };
