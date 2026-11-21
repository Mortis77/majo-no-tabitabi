// Loads a sculpt asset module (tools/sculpt/assets/<name>.mjs) and builds its field. Shared by the main thread and the
// workers, so the build must be deterministic (seeds, no Math.random). Also: surface sampling for bakes (colour, normal,
// ambient occlusion, cavity) — the one place where the paint rules are called.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as S from './sdf.mjs';

export const DEFAULTS = {
  voxel: 0.006,          // mesh extraction voxel (m)
  lods: [12000, 3000, 800],
  atlas: 1024,
  ground: 0,             // ground plane height counted as an occluder for AO (null = floating object)
  aoRange: 0.3,          // m: how far AO looks
  cavity: [0.006, 0.03], // m: fine and broad cavity radii
  creaseAngle: 40,       // degrees: hard normals above this dihedral angle (LOD1/2)
  bandSafety: 1.6,       // narrow-band skip test: keep a brick if |d(centre)| < halfDiagonal * bandSafety + bandSlack
  bandSlack: 0.03,       // m: covers displacement / warp error of the field (raise if the mesh shows holes)
};

export async function loadModel(assetPath, extra = {}) {
  const mod = await import(pathToFileURL(path.resolve(assetPath)).href);
  const def = mod.default;
  const cfg = { ...DEFAULTS, ...def };
  let rig = null;
  if (def.rig) {
    const { loadRig } = await import('./rig.mjs');
    rig = await loadRig(path.resolve(def.rig.file), def.rig);
  }
  const shape = await def.build({ S, rig, cfg });
  const bounds = def.bounds || shape.bounds;
  return { def, cfg, shape, bounds, rig, S, assetPath, ...extra };
}

const TILT = (() => {
  // 4 directions 40 degrees off the normal, in the tangent frame
  const s = Math.sin(40 * Math.PI / 180), c = Math.cos(40 * Math.PI / 180);
  return [[s, 0, c], [-s, 0, c], [0, s, c], [0, -s, c]];
})();
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Sample the true surface near (x,y,z): snap onto the field, then normal, AO, cavity, part and paint.
 * out: Float32Array slot of 8: r, g, b (sRGB 0..1, paint only), nx, ny, nz, ao, cavityShade (0..1)
 */
export function sampleSurface(M, x, y, z, out, o = 0) {
  const sh = M.shape, f = sh.f, cfg = M.cfg, n = [0, 0, 0];
  for (let it = 0; it < 3; it++) { const d = f(x, y, z); if (Math.abs(d) < 1e-5) break; sh.normal(x, y, z, n, 4e-4); x -= d * n[0]; y -= d * n[1]; z -= d * n[2]; }
  sh.normal(x, y, z, n, 4e-4);
  const [nx, ny, nz] = n;
  const g = cfg.ground;
  const dAO = g == null ? f : (px, py, pz) => Math.min(f(px, py, pz), py - g);
  // tangent frame
  const tx0 = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t1 = S.norm(S.cross(n, tx0)), t2 = S.cross(n, t1);
  let occ = 0, wsum = 0;
  const R = cfg.aoRange, steps = [0.04, 0.12, 0.3, 0.6, 1].map((v) => v * R);
  const dirs = [[0, 0, 1], ...TILT];
  for (const dl of dirs) {
    const dx = t1[0] * dl[0] + t2[0] * dl[1] + nx * dl[2], dy = t1[1] * dl[0] + t2[1] * dl[1] + ny * dl[2], dz = t1[2] * dl[0] + t2[2] * dl[1] + nz * dl[2];
    let w = 1;
    for (const t of steps) {
      const d = dAO(x + dx * t, y + dy * t, z + dz * t);
      occ += w * Math.max(0, t - d) / t; wsum += w; w *= 0.8;
    }
  }
  const ao = S.clamp(1 - (occ / wsum) * 1.6, 0, 1);
  const [r1, r2] = cfg.cavity;
  let a1 = 0, a2 = 0;
  for (const [ax, ay, az] of AXES) { a1 += f(x + ax * r1, y + ay * r1, z + az * r1); a2 += f(x + ax * r2, y + ay * r2, z + az * r2); }
  a1 /= 6; a2 /= 6;
  const cavity = S.clamp(-a1 / r1 * 4, 0, 1), edge = S.clamp(a1 / r1 * 4, 0, 1), broad = S.clamp(-a2 / r2 * 3, -1, 1);
  const part = sh.partAt(x, y, z);
  const b = M.bounds;
  const ctx = { x, y, z, nx, ny, nz, h: (y - b[1]) / (b[4] - b[1] || 1), ao, cavity, edge, broad, part: part.name, mat: part.mat, S };
  const paint = part.paint || M.def.paint;
  const c = paint ? paint(ctx) : [0.7, 0.7, 0.7];
  out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  out[o + 3] = nx; out[o + 4] = ny; out[o + 5] = nz;
  out[o + 6] = ao; out[o + 7] = cavity;
  return part;
}
