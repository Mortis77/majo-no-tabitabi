// Helper module of the broom set (broom, bonfire, andon): oriented boxes, y-parametric twig locks, paper strips, the old
// model loader for before_after.png, and a close-up look sheet for the broom (the kit's hero camera sits 2 m away and
// shows the broom standing; the game shows it lying along +Z under the heroine).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../sdf.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const C = P.color, mix = P.mix, ss = P.ss;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** rounded box with centre c, unit axes ax (X), ay (Y), az = ax x ay, half sizes h, corner radius r */
export function obox(c, ax, ay, h, r = 0) {
  ax = norm(ax); ay = norm(ay); const az = cross(ax, ay);
  const hx = h[0] - r, hy = h[1] - r, hz = h[2] - r, e = Math.hypot(h[0], h[1], h[2]);
  return new P.Shape((x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const qx = Math.abs(px * ax[0] + py * ax[1] + pz * ax[2]) - hx, qy = Math.abs(px * ay[0] + py * ay[1] + pz * ay[2]) - hy, qz = Math.abs(px * az[0] + py * az[1] + pz * az[2]) - hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }, [c[0] - e, c[1] - e, c[2] - e, c[0] + e, c[1] + e, c[2] + e]);
}

/**
 * A lock of twigs running down the y axis: centre(y) -> [x, z], radius(y), from y0 (tip) to y1 (butt).
 * The section is an ellipse (radial / tangential about the broom axis, `asp` = tangential / radial) with `flutes`
 * ridges (the single twigs) of relative depth flute(y). Ends are rounded. lip: the field is only roughly a distance.
 */
export function yLock({ centre, radius, y0, y1, asp = 1.3, flutes = 7, flute = () => 0.1, phase = 0 }) {
  const N = 48, cs = [], rs = [];
  let bb = [1e9, y0, 1e9, -1e9, y1, -1e9];
  for (let i = 0; i <= N; i++) {
    const y = y0 + (y1 - y0) * i / N, c = centre(y), r = radius(y) * Math.max(1, asp) * 1.2;
    cs.push(c); rs.push(r);
    bb[0] = Math.min(bb[0], c[0] - r); bb[2] = Math.min(bb[2], c[1] - r); bb[3] = Math.max(bb[3], c[0] + r); bb[5] = Math.max(bb[5], c[1] + r);
  }
  const rmax = Math.max(...rs); bb[1] -= rmax; bb[4] += rmax;
  const f = (x, y, z) => {
    const yc = y < y0 ? y0 : y > y1 ? y1 : y;
    const t = (yc - y0) / (y1 - y0) * N, i = Math.min(N - 1, Math.floor(t)), k = t - i;
    const cx = cs[i][0] + (cs[i + 1][0] - cs[i][0]) * k, cz = cs[i][1] + (cs[i + 1][1] - cs[i][1]) * k;
    const r = radius(yc);
    // radial direction about the broom axis at the lock centre
    const rl = Math.hypot(cx, cz) || 1, ux = cx / rl, uz = cz / rl;
    const dx = x - cx, dz = z - cz;
    const dr = dx * ux + dz * uz, dt = -dx * uz + dz * ux;
    const th = Math.atan2(dt, dr);
    const rr = r * (1 + flute(yc) * Math.sin(flutes * th + phase));
    const lat = Math.hypot(dr, dt / asp);
    const dl = lat - rr;
    return (Math.hypot(Math.max(dl, 0), y - yc) + Math.min(dl, 0)) * 0.8;
  };
  return new P.Shape(f, bb, null, 1.6);
}

/** a thin flat strip (paper) from A to B, `w` wide along `side`, thickness t, rounded edges */
export function strip(A, B, side, w, t) {
  const ay = norm([B[0] - A[0], B[1] - A[1], B[2] - A[2]]), len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  let ax = norm(side); ax = norm(add(ax, ay, -dot(ax, ay)));
  return obox([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], ax, ay, [w / 2, len / 2, t / 2], t * 0.49);
}

/** meshes of an old GLB for before_after.png (node translations, uniform manifest scale) */
export async function beforeMeshes(file, scale = 1) {
  const { readGLB } = await import('./gohei_look.mjs');
  const ms = readGLB(path.join(ROOT, file));
  for (const m of ms) for (let i = 0; i < m.pos.length; i++) m.pos[i] *= scale;
  return ms;
}

/**
 * Ride-pose close look for the broom: the GLB laid down as broom.js fitRide does (+Y -> +Z forward, +Z -> down), seen
 * from the chase camera (behind and above), the side, and close on the binding; plus standing close-ups and LOD tiles.
 *   node tools/sculpt/assets/broom_lib.mjs ride broom
 */
export async function rideSheet(name, before = null) {
  const R = await import('../preview.mjs');
  const { readGLB, trans } = await import('./gohei_look.mjs');
  const all = readGLB(path.join(ROOT, 'assets/models/sculpt', name + '.glb'));
  const lay = (ms) => ms.map((m) => { const pos = new Float32Array(m.pos.length), nrm = new Float32Array(m.nrm.length);
    for (let i = 0; i < m.pos.length; i += 3) { pos[i] = m.pos[i]; pos[i + 1] = -m.pos[i + 2] + 1.0; pos[i + 2] = m.pos[i + 1] - 0.615; nrm[i] = m.nrm[i]; nrm[i + 1] = -m.nrm[i + 2]; nrm[i + 2] = m.nrm[i + 1]; }
    return { ...m, pos, nrm, nmap: null }; });   // the cel path drops the normal map (and it is in the standing frame)
  const lod = (i) => all.filter((m) => (m.lod ?? 0) === i);
  const S = 560, fov = 32, opt = { ground: false };
  const rt = (ms, cam, o = opt) => R.render(trans(ms, cam.eye), cam, o);
  const L0 = lay(lod(0)), c = [0, 1.0, 0];
  const tiles = [
    { img: rt(L0, R.camera([0.9, 1.9, -2.4], [0, 1.0, -0.1], fov, S, S)), label: 'RIDE - CHASE CAM (BEHIND/ABOVE)' },
    { img: rt(L0, R.camera([2.0, 1.25, -0.1], [0, 1.0, -0.05], fov, S, S)), label: 'RIDE - SIDE' },
    { img: rt(L0, R.camera([0.55, 0.85, -1.1], [0, 1.0, -0.42], fov, S, S)), label: 'RIDE - HEAD CLOSE, BELOW' },
    { img: rt(L0, R.camera([-0.6, 1.45, -1.05], [0, 1.0, -0.35], fov, S, S)), label: 'RIDE - HEAD CLOSE, ABOVE' },
    { img: rt(L0, R.camera([0.45, 1.2, 0.35], [0, 1.0, -0.15], fov + 8, S, S)), label: 'RIDE - FROM THE FRONT, BINDING' },
    { img: rt(L0, R.camera([0.3, 1.2, 1.25], [0, 1.0, 0.75], fov, S, S)), label: 'RIDE - CAP + CHARM' },
    { img: R.render(L0, R.camera([2.0, 1.25, -0.1], [0, 1.0, -0.05], fov, S, S), { ...opt, clay: true }), label: 'CLAY SIDE' },
    { img: rt(lay(lod(1)), R.camera([0.9 * 4, 1.0 + 0.9 * 4, -2.4 * 4], [0, 1.0, -0.1], fov, S, S)), label: 'LOD1 GAME DIST ~8 M' },
    { img: rt(lay(lod(2)), R.camera([0.9 * 9, 1.0 + 0.9 * 9, -2.4 * 9], [0, 1.0, -0.1], fov, S, S)), label: 'LOD2 FAR ~20 M' },
  ];
  if (before) {
    const B = lay(before);
    tiles.push({ img: R.render(B, R.camera([0.9, 1.9, -2.4], [0, 1.0, -0.1], fov, S, S), opt), label: 'BEFORE (PACK) - CHASE CAM' });
    tiles.push({ img: R.render(B, R.camera([2.0, 1.25, -0.1], [0, 1.0, -0.05], fov, S, S), opt), label: 'BEFORE - SIDE' });
  }
  tiles.push({ img: rt(lay(lod(1)), R.camera([0.9, 1.9, -2.4], [0, 1.0, -0.1], fov, S, S)), label: 'LOD1 AT CHASE CAM (SWITCH CHECK)' });
  const out = path.join(ROOT, '.tmp/sculpt', name, 'ride.png');
  R.savePNG(out, R.sheet(tiles, 3, { title: `${name} RIDE POSE (AS broom.js LAYS IT)` }));
  console.log('wrote', out);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'ride') {
  const n = process.argv[3] || 'broom';
  const before = n === 'broom' ? await beforeMeshes('assets/models/props/prop_broom.glb', 0.60388) : null;
  await rideSheet(n, before);
}
