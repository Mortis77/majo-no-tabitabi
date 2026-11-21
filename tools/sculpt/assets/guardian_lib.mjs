// Shared carving helpers for the four shrine guardians (komainu_a, komainu_un, kitsune_key, kitsune_jewel).
// Not an asset itself. Every guardian is one block of granite: plinth + animal, origin on the ground at the plinth's
// centre, +Z = the statue's front, units metres. The game's builders (src/world/builders/decor.js komainu / kitsune)
// put the plinth top at 0.99 m (lion-dog) and 1.13 m (fox) at scale 1; the red cloth bib stays a live part of the code.
import * as P from '../sdf.mjs';

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
};

/** balanced union (keeps the bounding-box skip cheap for many small pieces) */
export function bunion(S, list) {
  if (list.length === 1) return list[0];
  const m = list.length >> 1;
  return S.union(bunion(S, list.slice(0, m)), bunion(S, list.slice(m)));
}

/**
 * A carved snail-curl lock: a low boss with a spiral groove, face along local +Y (aim it with .aim(n)).
 * spin +1 / -1 = curl direction, turns = how far the groove winds.
 */
export function lock(S, r, { spin = 1, phase = 0, turns = 1.5, depth = 0.55 } = {}) {
  const boss = S.ellipsoid([r, r * depth, r]);
  const pts = [], N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = spin * (phase + t * turns * 2 * Math.PI), rad = r * (0.86 - 0.66 * t);
    const yy = r * depth * Math.sqrt(Math.max(0, 1 - (rad / r) ** 2));
    pts.push([Math.sin(a) * rad, yy, Math.cos(a) * rad]);
  }
  return boss.softCut(S.tube(pts, (t) => r * (0.14 - 0.06 * t), { smooth: false }), r * 0.05);
}
/** the big flame-curl boss of a lion-dog's tail lobe: face along local +Y, a deep, wide spiral cut (two turns) */
export function tailCurl(S, r, spin = 1, phase = 0) {
  const boss = S.ellipsoid([r, r * 0.7, r]);
  const pts = [], N = 16, turns = 1.9;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = spin * (phase + t * turns * 2 * Math.PI), rad = r * (0.9 - 0.72 * t);
    const yy = r * 0.7 * Math.sqrt(Math.max(0, 1 - (rad / r) ** 2)) - r * 0.06;
    pts.push([Math.sin(a) * rad, yy, Math.cos(a) * rad]);
  }
  return boss.softCut(S.tube(pts, (t) => r * (0.2 - 0.09 * t), { smooth: false }), r * 0.05);
}
/** just the groove of a spiral (face along local +Y, centred on the surface point): cut it into a broad face */
export function spiralCut(S, r, spin = 1, phase = 0) {
  const pts = [], N = 18, turns = 1.85;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = spin * (phase + t * turns * 2 * Math.PI), rad = r * (0.95 - 0.8 * t);
    pts.push([Math.sin(a) * rad, -r * 0.04 - r * 0.25 * (rad / r) ** 2 * 0, Math.cos(a) * rad]);
  }
  return S.tube(pts, (t) => r * (0.17 - 0.07 * t), { smooth: false });
}
/** place a lock on a surface point p with outward normal n, sunk by `sink` of its radius */
export function placeLock(S, r, p, n, opts = {}, sink = 0.2) {
  const q = V.add(p, V.mul(P.norm(n), -r * 0.55 * sink));
  return lock(S, r, opts).aim(n).at(q[0], q[1], q[2]);
}

// ------------------------------------------------------------------------------------------------------------- plinth
/**
 * The carved plinth: foot slab with a stepped moulding, a die with recessed panels and corner pilasters, a moulded cap
 * with a cove under it, a soft cushion on top. top = height of the cushion top (0.99 lion-dog, 1.13 fox).
 */
export function plinth(S, top, { seed = 1, crack = null, chip = null, part = null, cushionChisel = true } = {}) {
  const dh = top - 0.43, capY = 0.22 + dh, midY = 0.22 + dh / 2;
  let foot = S.roundBox([1.2, 0.16, 1.4], 0.028).at(0, 0.08, 0)
    .softAdd(S.roundBox([1.1, 0.075, 1.3], 0.032).at(0, 0.18, 0), 0.008)
    .softAdd(S.roundBox([0.96, 0.05, 1.14], 0.022).at(0, 0.24, 0), 0.006);
  let die = S.roundBox([0.86, dh, 1.04], 0.022).at(0, midY, 0);
  const ph = dh - 0.2;
  const panels = S.union(
    S.roundBox([0.56, ph, 0.07], 0.016).at(0, midY, 0.52), S.roundBox([0.56, ph, 0.07], 0.016).at(0, midY, -0.52),
    S.roundBox([0.07, ph, 0.72], 0.016).at(0.43, midY, 0), S.roundBox([0.07, ph, 0.72], 0.016).at(-0.43, midY, 0));
  die = die.softCut(panels, 0.008);
  // a bead framing each panel (reads as a carved moulding at two metres)
  die = die.softAdd(S.roundBox([0.92, 0.035, 1.1], 0.014).at(0, capY - 0.03, 0), 0.006);
  let cap = S.roundBox([0.99, 0.05, 1.17], 0.022).at(0, capY + 0.012, 0)
    .softAdd(S.roundBox([1.07, 0.095, 1.25], 0.03).at(0, capY + 0.08, 0), 0.01);
  const cushH = top - (capY + 0.12);
  cap = cap.softAdd(S.roundBox([0.88, cushH + 0.02, 1.04], 0.045).at(0, capY + 0.12 + cushH / 2 - 0.01, 0), 0.02);
  let pl = S.union(foot, die, cap);
  if (part) pl = pl.part(...part);   // before the chip: .part() replaces every paint below it
  // dressed faces: a few broad flat planes on the foot and the cap only (on the die they bit the panel walls)
  pl = pl.chisel({ count: 12, depth: 0.004, seed: seed * 3 + 1, radius: 0.18, tilt: 0.1, where: (x, y) => y < 0.2 || (y > capY + 0.03 && (cushionChisel || y < capY + 0.11)) });
  if (chip) pl = pl.chip({ ...chip, paint: 'freshChip' });
  if (crack) pl = pl.crack(crack, { width: 0.006, jag: 0.014, seed: seed + 5 });
  pl = pl.wear(0.013, { vary: 0.75, seed: seed + 2 });
  return pl;
}

/** moss cushions: two at the foot on the damp side, a few on the back of the cap ledge */
export function mossCushions(S, top, north, seed = 1, { ledge = 5, ground = 1 } = {}) {
  const rnd = S.prng(seed * 17 + 3), cs = [];
  const [nx, nz] = north;
  // ground corners on the north side (same place as the old code's two moss lumps)
  const c1 = [Math.sign(nx || -1) * 0.5, Math.sign(nz || -1) * 0.56];
  const g = ground, gi = 1 - 0.25 * (1 - g);   // ground < 1: smaller cushions, drawn in to the foot
  cs.push(S.ellipsoid([0.3 * g, 0.07, 0.21 * g]).turn(0, 20 + rnd() * 20, 0).at(c1[0] * gi, 0.03, c1[1] * gi));
  cs.push(S.ellipsoid([0.2 * g, 0.06, 0.16 * g]).turn(0, -20, 0).at(-c1[0] * 0.15 + c1[0] * 0.05, 0.025, c1[1] * 1.12 * gi));
  cs.push(S.ellipsoid([0.12, 0.05, 0.1]).at(c1[0] * 1.08 * gi, 0.05, c1[1] * 0.55));
  // cap ledge, behind the cushion, where rain lingers
  const ly = 0.22 + (top - 0.43) + 0.127;
  for (let i = 0; i < ledge; i++) {
    const t = rnd() * 2 - 1;
    const onBack = rnd() < 0.65;
    const x = onBack ? t * 0.45 + nx * 0.1 : Math.sign(nx || 1) * (0.48 + rnd() * 0.04);
    const z = onBack ? Math.sign(nz || -1) * (0.565 + rnd() * 0.03) : t * 0.5;
    if (!onBack && Math.abs(z) > 0.55) continue;
    const r = 0.03 + rnd() * 0.035;
    cs.push(S.ellipsoid([r * 1.4, r * 0.55, r]).turn(0, rnd() * 180, 0).at(x, ly + r * 0.15, z));
  }
  return S.softUnion(0.025, ...cs).rough({ type: 'billow', scale: 0.014, amp: 0.005, seed: seed + 14 });
}

// -------------------------------------------------------------------------------------------------------------- paint
/**
 * Weathered granite. o: { base: [#light, #dark], north: [x, z] (damp side), touch: [[x,y,z,r], ...] (polished by hands),
 * verm: 0..1 faded vermilion on parts named 'verm*', top: plinth top (for the damp foot and streaks) }
 */
export function granitePaint(o) {
  const nb = P.norm([o.north[0], 0, o.north[1]]);
  const A = P.color(o.base[0]), B = P.color(o.base[1]);
  return (c, weathered = 1) => {
    const { x, y, z, nx, ny, nz, ao, cavity, edge, broad } = c;
    let col = P.mix(A, B, 0.5 + 0.5 * P.fbm(x * 2.2, y * 2.2, z * 2.2, o.seed || 1, 3));
    // granite speckle: full on the plinth, half the dots on the figure, none on the faces (smooth carved stone)
    const topY = o.top || 1;
    const figure = y > topY + 0.03;
    let face = 0;
    for (const [fx, fy, fz, fr] of o.faces || []) face = Math.max(face, P.ss(fr, fr * 0.6, Math.hypot(x - fx, y - fy, z - fz)));
    const f1 = P.cellular(x * 130, y * 130, z * 130, 7), f2 = P.cellular(x * 85 + 3, y * 85, z * 85, 8);
    const dk = figure ? P.ss(0.155, 0.085, f1) : P.ss(0.22, 0.12, f1);
    const lt = figure ? P.ss(0.14, 0.055, f2) : P.ss(0.2, 0.08, f2);
    col = P.mix(col, P.color('#45413c'), dk * 0.6 * (1 - face));
    col = P.mix(col, P.color('#ddd7cb'), lt * 0.45 * (1 - face));
    if (weathered <= 0.3) return P.mix(col, P.color('#cbc4b7'), 0.4);
    // hands: clean, warm, a little polished
    let touch = 0;
    for (const [tx, ty, tz, tr] of o.touch || []) touch = Math.max(touch, P.ss(tr, tr * 0.45, Math.hypot(x - tx, y - ty, z - tz)));
    const w = weathered * (1 - touch * 0.9);
    const side = 1 - Math.abs(ny);
    const north = P.ss(-0.2, 0.7, x * nb[0] + z * nb[2] + 0.35 * (nx * nb[0] + nz * nb[2]));
    const up = P.ss(0.3, 0.9, ny);
    // rain greys the tops; the foot is damp
    col = P.mix(col, P.color('#7a7b6c'), up * 0.35 * w);
    col = P.mix(col, P.color('#5d5b52'), P.ss(0.3, 0.0, y) * (0.5 + 0.5 * (1 - ao)) * 0.6 * w);
    // run-off streaks down the plinth faces below the cap ledge
    const top = o.top || 1;
    const streak = P.ss(0.12, 0.5, P.fbm(x * 16, y * 0.8, z * 16, 5, 3)) * side * P.ss(top - 0.02, top - 0.25, y) * P.ss(0.05, 0.35, y) * (0.35 + 0.65 * north);
    col = P.mix(col, P.color('#605d53'), streak * 0.5 * w);
    // lichen: pale rosettes, more on the damp side; a few rusty ones on the sunny side
    const lich = P.ss(0.4, 0.26, P.cellular(x * 8, y * 8, z * 8, 3)) * P.ss(0.25, 0.85, P.fbm(x * 3, y * 3, z * 3, 9, 2) + 0.45 + 0.3 * north);
    col = P.mix(col, P.color('#cfcfae'), lich * 0.62 * w * (0.4 + 0.6 * side) * (1 - face));
    const rust = P.ss(0.3, 0.17, P.cellular(x * 13 + 5, y * 13, z * 13, 4)) * (1 - north) * side;
    col = P.mix(col, P.color('#b58a4e'), rust * 0.22 * w * (1 - face));
    // moss green in the folds and on the shelves of the damp side; on the figure only a breath of it (deep carved
    // cuts already read dark — green on top of them looked eaten)
    const green = P.clamp(cavity * 0.9 + Math.max(0, broad) * 0.7, 0, 1) * (0.25 + 0.75 * north) + up * north * 0.35;
    col = P.mix(col, P.color('#61794a'), P.clamp(green, 0, 1) * 0.42 * w * (figure ? 0.4 : 1) * (1 - face));
    // worn edges pale; polished places warm
    col = P.mix(col, P.color('#d2cbbd'), edge * 0.5);
    col = P.mix(col, P.color('#b9ab97'), touch * 0.55);
    return col;
  };
}
export function paintMoss(c) {
  const { x, y, z, cavity, edge, ny } = c;
  let col = P.mix(P.color('#6c8d40'), P.color('#9ab452'), 0.5 + 0.5 * P.fbm(x * 30, y * 30, z * 30, 2, 3));
  col = P.mix(col, P.color('#aab463'), edge * 0.6 + P.ss(0.6, 1, ny) * 0.15);
  col = P.mix(col, P.color('#3d5530'), cavity * 0.5);
  return col;
}
/** the faded vermilion pigment in the fox's carved lines (eyes, ear cups, mouth): old paint, mostly gone */
export function paintVerm(stone, amount = 0.7) {
  return (c) => {
    const base = stone(c, 0.6);
    const keep = P.ss(0.35, 0.6, P.fbm(c.x * 40, c.y * 40, c.z * 40, 21, 3) + 0.25 + c.cavity * 0.5);
    return P.mix(base, P.color('#b4432c'), keep * amount);
  };
}

export const MATERIALS = {
  stone: { name: 'Granite', surface: 'stone', look: { detail: 0.25, bump: 0.3, fine: 0 } },
  moss: { name: 'Moss', surface: 'none', look: { rim: 0.4, trans: 0.25 } },
  bib: { name: 'Bib', surface: 'cloth', look: { detail: 0.5 } },
};

/**
 * The red cloth bib (yodarekake), sun-faded on top, darker in its folds and hem, a little grime at the point.
 * Painted near the palette's mikoRed so it reads untouched; the material `Bib_cloth` can be tinted (color multiplies).
 */
export function paintBib({ base = '#cc3b2b', seed = 1, tipY = 0 } = {}) {
  const A = P.color(base), FADE = P.color('#de6f58'), DEEP = P.color('#86251b');
  return (c) => {
    const { x, y, z, ny, cavity, edge } = c;
    let col = P.mix(A, P.mul(A, 0.9), 0.5 + 0.5 * P.fbm(x * 9, y * 9, z * 9, seed + 40, 3));
    col = P.mix(col, FADE, P.ss(0.1, 0.8, ny) * 0.55);                    // sun-bleached where it faces up
    col = P.mix(col, DEEP, P.clamp(cavity * 1.3, 0, 1) * 0.6);            // folds and under the hem
    const streak = P.ss(0.15, 0.55, P.fbm(x * 40, y * 4, z * 40, seed + 41, 2));
    col = P.mix(col, P.mul(A, 0.78), streak * 0.18);                       // rain run in the weave
    col = P.mix(col, P.color('#7d5a4c'), P.ss(tipY + 0.07, tipY, y) * 0.3); // grime where the point hangs
    col = P.mix(col, FADE, edge * 0.15);
    return col;
  };
}

/**
 * Cloth hung over a body: a sheet that follows the front of `body` (marched along -z) at `off`, then falls plumb off
 * the bulges, cut to a 2D outline (XY), with soft folds converging to the point and a rolled hem along `hem` edges.
 * o: { outline: [[x,y]...], x: [x0,x1], y: [y0,y1], off, th, zFrom, zMin, hang, folds: [[xTop, amp, width]],
 *      point: [px, py], yTop, hem: [[x,y]...] (polyline along the lower edges), hemR, collar: [[x,y]...], collarR }
 */
export function drape(S, body, o) {
  const { outline, off = 0.012, th = 0.02, zFrom = 0.7, zMin = -0.2, hang = 0.3, folds = [], point, yTop } = o;
  const [x0, x1] = o.x, [y0, y1] = o.y, NX = o.nx || 24, NY = o.ny || 30;
  const dx = (x1 - x0) / (NX - 1), dy = (y1 - y0) / (NY - 1);
  const surf = new Float64Array(NX * NY), Z = new Float64Array(NX * NY);
  // the blend that joins the head to the body later swells the throat: stand the cloth further off up there
  const offAt = (y) => off + (o.offTop || 0) * P.ss(o.offTopFrom ?? y1, y1, y);
  const lip = Math.max(1, body.lip || 1);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = x0 + i * dx, y = y0 + j * dy;
    let z = zFrom, d = body.f(x, y, z), n = 0;
    while (d > 0.0007 && z > zMin && n++ < 500) { z -= Math.max(d / lip * 0.7, 0.001); d = body.f(x, y, z); }
    surf[j * NX + i] = Math.max(z, zMin);
  }
  // hang from the top down: the cloth never comes back in faster than `hang` per metre of drop
  for (let i = 0; i < NX; i++) {
    let prev = -1e9;
    for (let j = NY - 1; j >= 0; j--) {
      const k = j * NX + i;
      const v = Math.max(surf[k] + offAt(y0 + j * dy), prev - hang * dy);
      Z[k] = v; prev = v;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const T = Z.slice();
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      let s = 0, w = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b;
        if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) continue;
        s += T[jj * NX + ii]; w++;
      }
      Z[j * NX + i] = Math.max(s / w, surf[j * NX + i] + offAt(y0 + j * dy) * 0.7);
    }
  }
  const zAt = (x, y) => {
    const fi = P.clamp((x - x0) / dx, 0, NX - 1.0001), fj = P.clamp((y - y0) / dy, 0, NY - 1.0001);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = Z[j * NX + i], b = Z[j * NX + i + 1], c = Z[(j + 1) * NX + i], e = Z[(j + 1) * NX + i + 1];
    let zz = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
    const uu = P.clamp((y - point[1]) / (yTop - point[1]), 0, 1);
    for (const [xt, amp, wid] of folds) {
      const xr = point[0] + (xt - point[0]) * uu;
      zz += amp * Math.exp(-(((x - xr) / (wid * (0.45 + 0.55 * uu))) ** 2)) * P.ss(0, 0.3, uu) * P.ss(1.08, 0.55, uu);
    }
    return zz;
  };
  let zlo = 1e9, zhi = -1e9;
  for (const v of Z) { zlo = Math.min(zlo, v); zhi = Math.max(zhi, v); }
  const sheet = new P.Shape((x, y, z) => Math.max(Math.abs(z - zAt(x, y)) - th / 2, P.poly2d(outline, x, y)),
    [x0, y0, zlo - th - 0.02, x1, y1, zhi + th + 0.03], null, 1.8);
  const roll = (line, r, lift) => S.tube(line.map(([x, y]) => [x, y, zAt(x, y) + lift]), r);
  let cloth = sheet;
  if (o.hem) cloth = cloth.softAdd(roll(o.hem, o.hemR || 0.011, th * 0.15), 0.006);
  if (o.collar) cloth = cloth.softAdd(roll(o.collar, o.collarR || 0.013, th * 0.1), 0.006);
  return { cloth, zAt };
}

/** a band round a neck at height y (tilted: `drop` lower at the front), marched onto `body`, with a knot at the back */
export function neckBand(S, body, { y, cz, r = 0.011, stand = 0.55, drop = 0.03, knot = true, seed = 1, skipFront = 0 }) {
  const N = 24, raw = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * 2 * Math.PI, sx = Math.sin(a), sz = Math.cos(a);
    const yy = y - drop * (0.5 + 0.5 * Math.cos(a));
    let rr = 0.35, d = body.f(sx * rr, yy, cz + sz * rr), n = 0;
    while (d > 0.0007 && rr > 0.01 && n++ < 300) { rr -= Math.max(d * 0.85, 0.001); d = body.f(sx * rr, yy, cz + sz * rr); }
    raw.push(rr);
  }
  // the band is pulled taut: smooth its radius round the neck (never into the fur), so it does not bead over the locks
  let R = raw.slice();
  for (let pass = 0; pass < 3; pass++) R = R.map((v, k) => Math.max(raw[k], (R[(k + N - 1) % N] + 2 * v + R[(k + 1) % N]) / 4));
  const pts = [];
  let back = null;
  for (let k = 0; k <= N; k++) {
    const a = (k / N) * 2 * Math.PI, sx = Math.sin(a), sz = Math.cos(a);
    if (skipFront && Math.cos(a) > 1 - skipFront) continue;
    const yy = y - drop * (0.5 + 0.5 * Math.cos(a)), rr = R[k % N];
    const p = [sx * (rr + r * stand), yy, cz + sz * (rr + r * stand)];
    pts.push(p);
    if (k === N / 2) back = p;
  }
  let band = S.tube(pts, r);
  if (knot && back) {
    const rnd = S.prng(seed * 7 + 5);
    const [bx, by, bz] = back;
    const kn = S.ellipsoid([0.027, 0.021, 0.018]).at(bx, by, bz - 0.008);
    const tails = [-1, 1].map((s) => S.tube([[bx + s * 0.008, by - 0.004, bz - 0.01], [bx + s * (0.02 + rnd() * 0.01), by - 0.045, bz - 0.012], [bx + s * (0.026 + rnd() * 0.01), by - 0.085 - rnd() * 0.02, bz - 0.006]], (t) => 0.0145 - 0.004 * t, { aspect: 1.3, up: [0, 0, 1] }));
    // the knot alone: its two hanging tails read as a pale tassel of fingers at game size, so they stay unused
    void tails;
    band = band.softAdd(S.ellipsoid([0.031, 0.024, 0.02]).at(bx, by, bz - 0.009), 0.008);
  }
  return band;
}

/** shared "before": the code-built statue of the game */
export function beforeFrom(fn, args) {
  return async ({ ROOT, threeToMeshes }) => {
    const mod = await import(ROOT + '/src/world/builders/decor.js');
    const meshes = threeToMeshes(mod[fn](...args));
    return { meshes, live: [] };
  };
}

// ----------------------------------------------------------------------------------------------------------- lion-dog
/**
 * Seated lion-dog on its plinth. o: { open (mouth), ballSide (-1 / +1 / 0), yaw (head turn, deg), seed, horn,
 * north, top }. Local animal coords: origin at the plinth-top centre; shifted up by `top` at the end.
 */
export function lionDog(S, o) {
  const { open, ballSide = 0, yaw = 0, seed = 1, horn = false } = o;
  const rnd = S.prng(seed * 101 + 7);
  const sides = [-1, 1];
  // ---- body: rump and haunches low at the back, ribcage rising, deep chest, shoulders, thick neck
  const body = [];
  body.push(S.ellipsoid([0.25, 0.23, 0.25]).at(0, 0.24, -0.2));
  body.push(S.ellipsoid([0.205, 0.27, 0.2]).turn(-24, 0, 0).at(0, 0.47, -0.03));
  body.push(S.ellipsoid([0.195, 0.2, 0.17]).at(0, 0.62, 0.1));
  body.push(S.taperedCapsule([0, 0.64, 0.06], [0, 0.9, 0.13], 0.175, 0.165));
  for (const s of sides) {
    body.push(S.ellipsoid([0.13, 0.205, 0.25]).turn(-18, 0, 0).at(s * 0.2, 0.215, -0.12));        // haunch
    body.push(S.ellipsoid([0.092, 0.17, 0.12]).turn(0, 0, s * 6).at(s * 0.148, 0.6, 0.12));         // shoulder blade
  }
  let torso = S.softUnion(0.07, ...body);
  // ---- legs
  const legs = [];
  const toes = (cx, y, z, n, r, spread, claw = true, tilt = 0) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * spread;
      out.push(S.sphere(r).at(cx + dx, y, z));
      if (claw) out.push(S.taperedCapsule([cx + dx, y + r * 0.35, z + r * 0.75], [cx + dx * 1.05, y - r * 0.55 - tilt, z + r * 1.55], r * 0.38, r * 0.12));
    }
    return out;
  };
  for (const s of sides) {
    const onBall = s === ballSide;
    legs.push(S.taperedCapsule([s * 0.152, 0.6, 0.13], [s * 0.168, 0.37, 0.2], 0.088, 0.071));
    legs.push(S.ellipsoid([0.05, 0.065, 0.05]).at(s * 0.18, 0.42, 0.135));                        // elbow
    if (!onBall) {
      legs.push(S.taperedCapsule([s * 0.168, 0.37, 0.2], [s * 0.165, 0.1, 0.255], 0.069, 0.058));
      legs.push(S.ellipsoid([0.04, 0.035, 0.035]).at(s * 0.165, 0.1, 0.235));                       // wrist knob
      legs.push(S.ellipsoid([0.086, 0.056, 0.1]).at(s * 0.165, 0.056, 0.3));
      legs.push(...toes(s * 0.165, 0.04, 0.375, 4, 0.032, 0.036));
    } else {
      legs.push(S.taperedCapsule([s * 0.168, 0.37, 0.2], [s * 0.17, 0.27, 0.27], 0.069, 0.06));
      legs.push(S.ellipsoid([0.086, 0.052, 0.1]).turn(16, 0, 0).at(s * 0.17, 0.262, 0.31));
      legs.push(...toes(s * 0.17, 0.246, 0.385, 4, 0.031, 0.035, true, 0.01));
    }
    // folded hind leg: hock on the ground behind, hind paw forward beside the forepaw
    legs.push(S.taperedCapsule([s * 0.25, 0.075, -0.33], [s * 0.262, 0.05, 0.02], 0.065, 0.052));
    legs.push(S.ellipsoid([0.075, 0.05, 0.09]).at(s * 0.27, 0.046, 0.08));
    legs.push(...toes(s * 0.27, 0.034, 0.152, 3, 0.028, 0.038));
  }
  // legs blend into the body; toes stay crisp (union per paw group below)
  const legShapes = [], toeShapes = [];
  for (const sh of legs) ((sh.b[4] - sh.b[1]) < 0.09 && (sh.b[3] - sh.b[0]) < 0.09 ? toeShapes : legShapes).push(sh);
  let animal = torso.softAdd(S.softUnion(0.03, ...legShapes), 0.05).softAdd(bunion(S, toeShapes), 0.012);
  // the ball under one forepaw, with two carved ribbons
  if (ballSide) {
    let ball = S.sphere(0.12).at(ballSide * 0.17, 0.12, 0.33);
    ball = ball.softCut(S.torus(0.12, 0.007).turn(70, 20, 0).at(ballSide * 0.17, 0.12, 0.33), 0.004)
      .softCut(S.torus(0.12, 0.007).turn(-35, -40, 60).at(ballSide * 0.17, 0.12, 0.33), 0.004);
    animal = animal.softAdd(ball, 0.015);
  }
  // body curls: thigh, elbow
  const bodyLocks = [];
  for (const s of sides) {
    bodyLocks.push(placeLock(S, 0.065, [s * 0.325, 0.25, -0.1], [s, 0.15, 0.05], { spin: s, phase: rnd() * 6 }));
    bodyLocks.push(placeLock(S, 0.042, [s * 0.225, 0.43, 0.12], [s, 0.0, -0.35], { spin: -s, phase: rnd() * 6 }));
  }
  animal = animal.softAdd(bunion(S, bodyLocks), 0.012);
  const drapeBody = animal;   // the front the bib hangs on (before the tail, chisel and wear: cheap to march)
  // ---- tail: three upright flame-curl lobes rising from the rump against the back, the middle one tallest; each a
  //      thick rounded lobe ending in a boss with a deep spiral cut, a carved flame stroke down its back
  const j = () => (rnd() - 0.5) * 0.025;
  // [x at the top, top height, curl spin, outward lean]
  const lobeDefs = [[-0.175, 0.75 + j(), -1, -1], [0.005, 0.9 + j(), 1, 0.4], [0.175, 0.78 + j(), 1, 1]];
  const lobes = [S.ellipsoid([0.2, 0.14, 0.1]).turn(-12, 0, 0).at(0, 0.36, -0.4)], spirals = [], curls = [];
  for (const [lx, top, spin, lean] of lobeDefs) {
    // a flame: full and round low down, tapering to a tip that hooks out to the side and forward
    const mid = lx === 0.005;
    const pts = [[lx * 0.3, 0.33, -0.42], [lx * 0.8, 0.48, -0.42], [lx * 1.05, top - 0.2, -0.39], [lx * 1.05 + lean * 0.02, top - 0.08, -0.36], [lx * 1.05 + lean * 0.055, top, -0.31]];
    const r0 = mid ? 0.084 : 0.072;
    lobes.push(S.tube(pts, (t) => (t < 0.62 ? r0 * (0.88 + 0.22 * Math.sin(Math.PI * t / 0.62 * 0.5)) : r0 * 1.1 * Math.pow(1 - (t - 0.62) / 0.38, 0.85) + 0.006), { aspect: 1.15, up: [0, 0, 1] }));
    // a deep spiral carved into the back of the flame, high up where it swells
    const n = P.norm([lx * 2.2, 0.25, -1]);
    // a round boss on the back of each flame, high up, with its own deep two-turn spiral: the curl reads from 6 m
    const c = [lx * 1.03, top - 0.19, -0.39 - r0 / 1.15 * 0.55];
    curls.push(tailCurl(S, r0 * 0.95, spin, rnd() * 6).aim(n).at(c[0], c[1], c[2]));
    // and a carved flame stroke running down the lobe below it
    spirals.push(S.tube([[lx * 0.95, top - 0.3, -0.39 - r0 / 1.15 * 0.95], [lx * 0.8, 0.5, -0.42 - r0 / 1.15 * 0.95], [lx * 0.45, 0.4, -0.43 - r0 / 1.15 * 0.9]], (t) => 0.011 * (1 - t) + 0.003));
  }
  let tail = S.softUnion(0.016, ...lobes).softAdd(bunion(S, curls), 0.012).softCut(bunion(S, spirals), 0.004);
  tail = tail.softAdd(bunion(S, sides.map((s) => placeLock(S, 0.055, [s * 0.11, 0.26, -0.47], [s * 0.4, -0.1, -1], { spin: s, phase: rnd() * 6 }))), 0.01);
  animal = animal.softAdd(tail, 0.03);
  animal = animal.chisel({ count: 22, depth: 0.006, seed: seed + 40, radius: 0.085, tilt: 0.3, where: (x, y, z) => y > 0.12 && y < 0.8 && z > -0.3 });
  animal = animal.wear(0.011, { vary: 0.6, seed: seed + 3 });

  // ---- head (head-local: origin at the head centre, +z forward), turned a little toward the path
  const H = [0, 0.98, 0.17];
  const hp = [];
  hp.push(S.ellipsoid([0.2, 0.17, 0.17]).at(0, 0.03, -0.02));
  hp.push(S.roundBox([0.36, 0.26, 0.2], 0.09).at(0, -0.02, 0.08));
  for (const s of sides) {
    hp.push(S.ellipsoid([0.09, 0.08, 0.075]).at(s * 0.125, -0.075, 0.17));                         // cheek
    hp.push(S.ellipsoid([0.08, 0.032, 0.11]).turn(25, 0, s * 55).at(s * 0.2, 0.06, -0.03));         // drooping ear
  }
  hp.push(S.roundBox([0.25, 0.1, 0.15], 0.045).at(0, -0.08, 0.24));                              // upper lip / muzzle
  hp.push(S.taperedCapsule([0, 0.09, 0.2], [0, 0.015, 0.29], 0.03, 0.036));                       // nose bridge
  let head = S.softUnion(0.04, ...hp);
  // heavy brows that meet in a frown, with curls at their outer ends
  const brows = [];
  for (const s of sides) {
    brows.push(S.tube([[s * 0.175, 0.055, 0.12], [s * 0.1, 0.118, 0.19], [s * 0.022, 0.092, 0.218]], (t) => 0.036 - 0.01 * t));
    brows.push(placeLock(S, 0.038, [s * 0.18, 0.08, 0.12], [s * 0.75, 0.35, 0.55], { spin: s, phase: rnd() * 6 }));
  }
  head = head.softAdd(S.softUnion(0.015, ...brows), 0.02);
  // eyes: bulging, drilled pupils
  for (const s of sides) {
    head = head.softAdd(S.sphere(0.046).at(s * 0.088, 0.028, 0.168), 0.012);
    head = head.softCut(S.sphere(0.017).at(s * 0.09, 0.033, 0.219), 0.004);
  }
  // nose: broad, alae flared, deep nostrils
  head = head.softAdd(S.ellipsoid([0.078, 0.05, 0.05]).at(0, -0.005, 0.31), 0.02);
  for (const s of sides) head = head.softAdd(S.sphere(0.034).at(s * 0.05, -0.027, 0.3), 0.01);
  for (const s of sides) head = head.softCut(S.ellipsoid([0.019, 0.014, 0.035]).turn(0, 0, s * 22).at(s * 0.037, -0.033, 0.352), 0.006);
  // mouth
  if (open) {
    head = head.softCut(S.roundBox([0.23, 0.1, 0.24], 0.04).at(0, -0.157, 0.28), 0.014);
    const jaw = S.roundBox([0.22, 0.058, 0.17], 0.028).turn(12, 0, 0).at(0, -0.218, 0.2);
    const teeth = [S.ellipsoid([0.072, 0.024, 0.085]).turn(-10, 0, 0).at(0, -0.188, 0.235)];       // tongue
    for (const s of sides) {
      teeth.push(S.taperedCapsule([s * 0.078, -0.108, 0.298], [s * 0.074, -0.182, 0.306], 0.019, 0.006));
      teeth.push(S.taperedCapsule([s * 0.084, -0.198, 0.278], [s * 0.086, -0.136, 0.292], 0.017, 0.005));
      for (const dx of [0.016, 0.042]) {
        teeth.push(S.roundBox([0.022, 0.032, 0.02], 0.006).at(s * dx, -0.118, 0.312));
        teeth.push(S.roundBox([0.02, 0.026, 0.018], 0.006).at(s * dx, -0.196, 0.28));
      }
    }
    head = head.softAdd(jaw, 0.025).add(bunion(S, teeth));
  } else {
    head = head.softAdd(S.roundBox([0.24, 0.075, 0.17], 0.03).at(0, -0.163, 0.2), 0.03);
    head = head.softCut(S.tube([[-0.13, -0.11, 0.2], [-0.065, -0.132, 0.282], [0, -0.127, 0.296], [0.065, -0.132, 0.282], [0.13, -0.11, 0.2]], 0.0075), 0.003);
    const fangs = sides.map((s) => S.taperedCapsule([s * 0.07, -0.122, 0.29], [s * 0.072, -0.163, 0.295], 0.013, 0.004));
    head = head.add(bunion(S, fangs));
  }
  if (horn) head = head.softAdd(S.taperedCapsule([0, 0.13, 0.06], [0, 0.205, 0.1], 0.04, 0.016), 0.02);
  // mane: a shell behind the head, rows of carved curls around the face, a curled beard
  // mane: a crown round the face; behind, the ball is flattened and falls onto the shoulders as a cape, parted down
  // the spine; swirls are biggest at the crown and the nape, smaller toward the edges
  const MC = [0, -0.01, -0.13], MR = [0.3, 0.31, 0.2];
  let mane = S.ellipsoid(MR).at(...MC).softIntersect(S.plane([0, 0.42, -1], [0, 0, MC[2] - 0.115]), 0.05);
  mane = mane.softAdd(S.ellipsoid([0.27, 0.15, 0.13]).at(0, -0.22, -0.17), 0.06);
  const manel = [];
  const rows = [[38, 150, 11, 0.05], [8, 160, 12, 0.056]];
  rows.forEach(([phi, tmax, n, r], ri) => {
    const pr = phi * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const th = (-tmax + (2 * tmax * (i + (ri % 2 ? 0.5 : 0.25) + (rnd() - 0.5) * 0.25)) / n) * Math.PI / 180;
      const d = [Math.sin(th) * Math.cos(pr), Math.cos(th) * Math.cos(pr), Math.sin(pr)];
      const p = [MC[0] + MR[0] * d[0], MC[1] + MR[1] * d[1], MC[2] + MR[2] * d[2]];
      const nn = [(p[0] - MC[0]) / MR[0] ** 2, (p[1] - MC[1]) / MR[1] ** 2, (p[2] - MC[2]) / MR[2] ** 2];
      const crown = 0.82 + 0.42 * Math.max(0, Math.cos(th)) ** 2;      // big on top, small down the sides
      manel.push(placeLock(S, r * crown * (1.15 + rnd() * 0.15), p, nn, { spin: th > 0 ? 1 : -1, phase: rnd() * 6 }, 0.25));
    }
  });
  // the back: swirls placed on the flattened surface, two big columns beside the parting, small ones at the edges
  const onMane = (x, y) => {
    let z = MC[2] - 0.6, d = mane.f(x, y, z), n = 0;
    while (d > 0.0007 && z < MC[2] + 0.1 && n++ < 300) { z += Math.max(d * 0.8, 0.001); d = mane.f(x, y, z); }
    return [[x, y, z], mane.normal(x, y, z)];
  };
  // [|x|, y, r]: crown-back, upper back, mid, nape (on the cape), cape edge
  const backL = [[0.085, 0.2, 0.074], [0.09, 0.07, 0.066], [0.088, -0.06, 0.07], [0.095, -0.2, 0.082], [0.21, 0.13, 0.05], [0.215, 0.0, 0.046],
    [0.205, -0.13, 0.05], [0.235, -0.24, 0.052], [0.27, 0.04, 0.038], [0.27, -0.09, 0.038]];
  for (const s of sides) for (const [ax, y, r] of backL) {
    const x = s * (ax + (rnd() - 0.5) * 0.012), yy = y + (s > 0 ? 0.018 : -0.006) + (rnd() - 0.5) * 0.012;
    const [p, nn] = onMane(x, yy);
    if (p[2] > MC[2] + 0.05) continue;   // off the back (a side swirl already covers it)
    manel.push(placeLock(S, r * (0.95 + rnd() * 0.12), p, nn, { spin: s, phase: rnd() * 6, turns: r > 0.06 ? 1.8 : 1.4 }, 0.25));
  }
  const parting = [0.26, 0.15, 0.02, -0.12, -0.26, -0.33].map((y) => { const [p, nn] = onMane(0, y); return [p[0] - nn[0] * 0.004, p[1] - nn[1] * 0.004, p[2] - nn[2] * 0.004]; });
  for (const [x, y, z, r] of [[-0.075, -0.255, 0.13, 0.045], [0, -0.262, 0.14, 0.047], [0.075, -0.255, 0.13, 0.045], [-0.04, -0.3, 0.08, 0.04], [0.04, -0.3, 0.08, 0.04]]) {
    manel.push(placeLock(S, r, [x, y, z], [x * 2, -0.6, 1], { spin: x < 0 ? -1 : 1, phase: rnd() * 6 }, 0.3));
  }
  mane = mane.softAdd(bunion(S, manel), 0.014).softCut(S.tube(parting, 0.013), 0.006);
  head = head.softAdd(mane, 0.03);
  head = head.wear(0.009, { vary: 0.6, seed: seed + 4 });
  head = head.turn(0, yaw, 0).at(...H);
  animal = animal.softAdd(head, 0.05);
  if (o.G) animal = animal.part(...o.G);
  // ---- the red cloth bib: hung from under the beard over the chest and the tops of the forelegs, point between them
  if (o.bib) {
    const tip = [o.open ? 0.02 : -0.016, 0.4];
    const outline = [[-0.225, 0.82], [0.225, 0.82], [0.218, 0.7], [0.165, 0.575], [0.085, 0.465], tip, [-0.09, 0.47], [-0.17, 0.58], [-0.22, 0.705]];
    const { cloth } = drape(S, drapeBody, {
      outline, x: [-0.26, 0.26], y: [0.37, 0.84], zFrom: 0.62, zMin: -0.05, off: 0.013, offTop: 0.022, offTopFrom: 0.6, th: 0.02, hang: 0.25,
      point: tip, yTop: 0.8, folds: [[-0.12, 0.012, 0.035], [0.03, 0.009, 0.03], [0.14, 0.011, 0.035]],
      hem: [[-0.215, 0.705], [-0.168, 0.58], [-0.09, 0.47], tip, [0.085, 0.465], [0.163, 0.575], [0.213, 0.7]], hemR: 0.012,
    });
    animal = animal.add(cloth.part('bib', { mat: 'bib', paint: o.bib }));
  }
  return animal;
}

// ---------------------------------------------------------------------------------------------------------------- fox
/**
 * Seated fox messenger on its plinth (local: origin at the plinth-top centre). o: { side (+1 tail sweeps to +x), key
 * (holds a key in its mouth; else a flame-jewel under the forepaw on `side`), yaw / pitch (head turn, deg), seed,
 * chipEar (-1 / +1 / 0), G (the granite part: applied here, before the vermilion-lined cuts, because .part() replaces
 * every paint below it), V (the faded-vermilion part) }.
 */
export function fox(S, o) {
  const { side = 1, key = false, yaw = 0, pitch = 0, seed = 1, chipEar = 0, G, V: VP } = o;
  const rnd = S.prng(seed * 131 + 11);
  const sides = [-1, 1];
  const T = (x, y, z) => [x * side, y, z];
  // ---- body: compact haunches, a long rising ribcage, deep narrow chest, a long neck
  const body = [];
  body.push(S.ellipsoid([0.165, 0.19, 0.2]).at(0, 0.19, -0.13));                                   // rump / pelvis
  body.push(S.ellipsoid([0.13, 0.25, 0.14]).turn(-24, 0, 0).at(0, 0.45, -0.02));                    // ribcage
  body.push(S.ellipsoid([0.118, 0.15, 0.11]).turn(-10, 0, 0).at(0, 0.6, 0.075));                    // chest
  body.push(S.taperedCapsule([0, 0.64, 0.05], [0, 0.88, 0.095], 0.1, 0.08));                          // neck
  for (const s of sides) {
    body.push(S.ellipsoid([0.075, 0.17, 0.2]).turn(-24, 0, s * 4).at(s * 0.12, 0.18, -0.07));       // thigh
    body.push(S.ellipsoid([0.05, 0.12, 0.075]).turn(-8, 0, s * 8).at(s * 0.092, 0.62, 0.05));       // shoulder blade
  }
  let torso = S.softUnion(0.06, ...body);
  // chest ruff: a full rounded breast of fur ending in soft scallops (the bib drapes over it)
  const breast = [S.ellipsoid([0.112, 0.125, 0.085]).at(0, 0.665, 0.112)];
  for (const [x, y, z, r] of [[-0.072, 0.578, 0.132, 0.04], [0.07, 0.582, 0.132, 0.04], [-0.034, 0.55, 0.152, 0.042], [0.036, 0.552, 0.152, 0.042], [0.001, 0.532, 0.158, 0.04]]) breast.push(S.sphere(r).at(x, y, z));
  torso = torso.softAdd(S.softUnion(0.022, ...breast), 0.035);
  // ---- legs: slim forelegs, standing straight; hind legs folded with the hock on the plinth
  const legs = [], toes = [];
  const paw = (x, y, z, r = 0.017, n = 4, sp = 0.021, tip = 0) => {
    legs.push(S.ellipsoid([0.046, 0.028, 0.062]).turn(tip, 0, 0).at(x, y, z));
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * sp, dz = -Math.abs(i - (n - 1) / 2) * 0.008;
      toes.push(S.ellipsoid([r, r * 0.85, r * 1.25]).at(x + dx, y - 0.004, z + 0.048 + dz));
      toes.push(S.taperedCapsule([x + dx, y, z + 0.062 + dz], [x + dx * 1.05, y - r * 0.8, z + 0.078 + dz], r * 0.35, r * 0.12));
    }
  };
  for (const s of sides) {
    const onJewel = !key && s === side;
    legs.push(S.taperedCapsule([s * 0.088, 0.6, 0.085], [s * 0.094, 0.4, 0.125], 0.056, 0.042));     // upper arm
    legs.push(S.ellipsoid([0.03, 0.04, 0.03]).at(s * 0.105, 0.42, 0.105));                         // elbow
    if (!onJewel) {
      legs.push(S.taperedCapsule([s * 0.094, 0.4, 0.125], [s * 0.088, 0.07, 0.185], 0.04, 0.032));
      legs.push(S.ellipsoid([0.026, 0.024, 0.022]).at(s * 0.088, 0.075, 0.172));                    // wrist
      paw(s * 0.088, 0.026, 0.215);
    } else {
      legs.push(S.taperedCapsule([s * 0.094, 0.4, 0.125], [s * 0.1, 0.26, 0.215], 0.04, 0.034));
      paw(s * 0.103, 0.25, 0.255, 0.016, 4, 0.02, 18);
    }
    legs.push(S.taperedCapsule([s * 0.16, 0.055, -0.24], [s * 0.165, 0.03, 0.05], 0.042, 0.032));     // hock -> hind foot
    paw(s * 0.168, 0.022, 0.07, 0.015, 3, 0.022);
  }
  let animal = torso.softAdd(S.softUnion(0.025, ...legs), 0.04).softAdd(bunion(S, toes), 0.008);
  // the flame-jewel (houju) under one forepaw: an onion with three spiral flame grooves and a pointed tip
  if (!key) {
    const jx = side * 0.105, jz = 0.3;
    let jw = S.lathe([[0, 0], [0.045, 0.006], [0.075, 0.04], [0.08, 0.075], [0.06, 0.12], [0.03, 0.155], [0.008, 0.185], [0, 0.19]], { sides: 28 });
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, a = (k * 120 + t * 160) * Math.PI / 180, y = 0.03 + t * 0.15;
        const r = [0.065, 0.078, 0.08, 0.074, 0.06, 0.046, 0.032, 0.02, 0.01][i];
        pts.push([Math.sin(a) * r, y, Math.cos(a) * r]);
      }
      jw = jw.softCut(S.tube(pts, (t) => 0.007 * (1 - t) + 0.002), 0.003);
    }
    animal = animal.softAdd(jw.scale(1.28).at(jx, 0, jz), 0.012);
  }
  const drapeBody = animal;   // the breast the bib hangs on
  // ---- the brush tail: a thick round brush from the rump up the flank to over the shoulder on `side`, three big
  //      spiralling fur grooves, and a pointed flame-jewel tip set off by a carved collar
  const spine = [T(0.02, 0.07, -0.28), T(0.16, 0.13, -0.34), T(0.24, 0.33, -0.33), T(0.235, 0.58, -0.28), T(0.18, 0.79, -0.21), T(0.135, 0.94, -0.15), T(0.145, 1.04, -0.1)];
  const tr = (t) => {
    if (t >= 0.8) { const u = (t - 0.78) / 0.22; return Math.max(0.003, 0.07 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.8)); }
    return t < 0.45 ? 0.05 + 0.063 * Math.sin((t / 0.45) * Math.PI / 2) : 0.113 - 0.058 * P.ss(0.45, 0.8, t);
  };
  let tail = S.tube(spine, tr);
  const sp = P.resample(spine, 10), grooves = [];
  for (const th0 of [0.4, 2.5, 4.6]) {
    const pts = [];
    for (let i = 0; i < sp.length; i++) {
      const t = i / (sp.length - 1);
      if (t < 0.1 || t > 0.74) continue;
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
      const Tn = P.norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const N1 = P.norm(P.cross(Tn, [0, 0, 1])), N2 = P.cross(N1, Tn);
      const th = th0 + side * t * 1.6, rr = tr(t) * 0.97;
      pts.push([sp[i][0] + rr * (Math.cos(th) * N1[0] + Math.sin(th) * N2[0]), sp[i][1] + rr * (Math.cos(th) * N1[1] + Math.sin(th) * N2[1]), sp[i][2] + rr * (Math.cos(th) * N1[2] + Math.sin(th) * N2[2])]);
    }
    grooves.push(S.tube(pts, (t) => 0.013 * Math.sin(Math.PI * (0.08 + 0.84 * t)) + 0.003));
  }
  tail = tail.softCut(S.union(...grooves), 0.005);
  animal = animal.softAdd(tail, 0.04);
  animal = animal.wear(0.008, { vary: 0.6, seed: seed + 3 });
  animal = animal.part(...G);

  // ---- head (head-local, +z forward): a narrow wedge skull, long fine muzzle, tall cupped ears, almond eyes
  const hp = [];
  hp.push(S.ellipsoid([0.104, 0.086, 0.098]).at(0, 0.012, -0.01));                                  // cranium: broad
  hp.push(S.ellipsoid([0.08, 0.032, 0.05]).at(0, 0.046, 0.055));                                    // brow plate
  for (const s of sides) hp.push(S.ellipsoid([0.064, 0.052, 0.066]).at(s * 0.058, -0.032, 0.022));  // cheeks
  hp.push(S.taperedCapsule([0, -0.014, 0.05], [0, -0.03, 0.19], 0.058, 0.022));                    // muzzle: short, tapering
  hp.push(S.taperedCapsule([0, -0.056, 0.045], [0, -0.056, 0.16], 0.036, 0.016));                  // lower jaw
  let head = S.softUnion(0.03, ...hp);
  // cheek ruff: pointed tufts sweeping back and down
  const ruff = [];
  for (const s of sides) for (const [dy, dz, l] of [[-0.015, 0, 0.085], [-0.055, 0.015, 0.065]]) {   // kept clear of the bib band
    ruff.push(S.taperedCapsule([s * 0.07, dy, dz + 0.01], [s * (0.075 + l * 0.6), dy - l * 0.45, dz - l * 0.35], 0.032, 0.012));
  }
  head = head.softAdd(S.union(...ruff), 0.018);
  // nose leather and nostrils
  head = head.softAdd(S.ellipsoid([0.024, 0.018, 0.019]).at(0, -0.024, 0.196), 0.008);
  for (const s of sides) head = head.softCut(S.ellipsoid([0.007, 0.005, 0.01]).at(s * 0.01, -0.029, 0.213), 0.002);
  head = head.part(...G);
  // ears: tall, slightly flared, with a cupped front
  const ear = (s) => {
    return S.cone(0.077, 0.007, 0.12).scale([1, 1, 0.6]);
  };
  for (const s of sides) {
    let e = ear(s).part(...G);
    // the inner cup keeps faded vermilion: re-cut the cup with the vermilion part
    e = e.softCut(S.cone(0.052, 0.002, 0.095).scale([1, 1, 0.45]).at(0, 0.02, 0.026).part(...VP), 0.006, { paintCut: true });
    e = e.wear(0.006, { vary: 0.5, seed: seed + 9 + s });
    if (chipEar === s) e = e.cut(S.box([0.1, 0.05, 0.1]).turn(0, 0, s * -35).at(s * 0.024, 0.122, 0)).chip({ at: [0, 0.1, 0], dir: [s * 0.3, 1, 0.2], depth: 0.012, spread: 0.6, seed: seed + 31, paint: 'freshChip' });
    head = head.softAdd(e.turn(-10, s * 14, s * -28).at(s * 0.064, 0.05, -0.022), 0.022);
  }
  // almond eyes cut along the slope of the face, lined in vermilion; a carved line along the lips
  for (const s of sides) {
    const eye = S.ellipsoid([0.031, 0.0095, 0.014]).turn(0, s * 34, s * 22).at(s * 0.054, 0.024, 0.082).part(...VP);
    head = head.softCut(eye, 0.003, { paintCut: true });
    head = head.softAdd(S.ellipsoid([0.016, 0.0075, 0.009]).turn(0, s * 34, s * 22).at(s * 0.053, 0.023, 0.079).part(...G), 0.002);
    const lip = S.tube([[s * 0.008, -0.046, 0.186], [s * 0.03, -0.042, 0.135], [s * 0.048, -0.037, 0.088], [s * 0.058, -0.026, 0.066]], 0.0042).part(...VP);
    head = head.softCut(lip, 0.002, { paintCut: true });
  }
  if (key) {
    // the key, held crosswise in the jaws: a ringed bow on the near side, a bit with two wards on the far side
    const kx = -side, ky = -0.05, kz = 0.12;
    const kk = [S.capsule([-0.115, ky, kz], [0.115, ky, kz], 0.0105)];
    kk.push(S.torus(0.032, 0.0095).turn(0, 0, 90).at(kx * -0.15, ky, kz));                          // bow
    kk.push(S.ellipsoid([0.012, 0.02, 0.02]).at(kx * -0.112, ky, kz));                               // collar
    kk.push(S.roundBox([0.04, 0.042, 0.014], 0.005).at(kx * 0.095, ky - 0.028, kz));                  // bit
    head = head.add(S.union(...kk).wear(0.003).part(...G));
  }
  head = head.wear(0.006, { vary: 0.5, seed: seed + 4 });
  head = head.turn(pitch, yaw, 0).at(0, 0.965, 0.12);
  animal = animal.softAdd(head, 0.035);
  // ---- the red cloth bib over the ruff, tied round the neck with a knot at the nape
  if (o.bib) {
    const tip = [side * 0.012, 0.535];
    const outline = [[-0.112, 0.83], [0.112, 0.83], [0.118, 0.75], [0.09, 0.655], [0.045, 0.58], tip, [-0.042, 0.578], [-0.088, 0.652], [-0.116, 0.748]];
    const { cloth } = drape(S, drapeBody, {
      outline, x: [-0.14, 0.14], y: [0.51, 0.85], zFrom: 0.45, zMin: -0.05, off: 0.011, offTop: 0.01, offTopFrom: 0.74, th: 0.018, hang: 0.55,
      point: tip, yTop: 0.82, folds: [[-0.06, 0.008, 0.022], [0.055, 0.009, 0.024]],
      hem: [[-0.114, 0.75], [-0.088, 0.652], [-0.042, 0.578], tip, [0.045, 0.58], [0.09, 0.655], [0.116, 0.75]], hemR: 0.0095,
    });
    const band = neckBand(S, drapeBody, { y: 0.845, cz: 0.07, r: 0.013, stand: 0.9, drop: 0.03, seed });
    animal = animal.add(cloth.softAdd(band, 0.008).part('bib', { mat: 'bib', paint: o.bib }));
  }
  return animal;
}
