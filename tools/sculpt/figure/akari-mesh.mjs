// 灯里's skin as ONE closed mesh: trunk + limbs (2.6 mm voxels), hand (0.9 mm), foot (1.1 mm: five toes), head (1.1 mm), each
// contoured from the fields in tools/sculpt/assets/akari_body.mjs / akari_head.mjs, cut on the seam planes, simplified to
// its own budget, stitched and mirrored. Result: a symmetric watertight mesh in the bind pose (game metres).
import path from 'node:path';
import { ROOT } from './glbio.mjs';
import { contourPieces } from './pieces.mjs';
import { stitch, boundaryNext } from './seam.mjs';
import { mirrorX, vertexNormals } from './meshops.mjs';
import { checkMesh } from '../mesh.mjs';

export const SEAM = { wristX: 0.494, ankleY: 0.165, neckY: 1.297 };
export const OUT = path.join(ROOT, '.tmp/sculpt/akari_base');
const A = (f) => path.join(ROOT, 'tools/sculpt/assets', f);

/** cutHalf(half) -> { pos, idx, tag }: work done on the half before mirroring (the face's openings) */
export async function buildSkin({ log = console.log, threads, head = true, budget = {}, cutHalf = null, headCacheDir = null } = {}) {
  const B = { trunk: 4750, hand: 1450, foot: 1100, head: 3100, ...budget };
  const body = await contourPieces(A('akari_body.mjs'), [
    { name: 'trunk', bounds: [-0.012, 0.15, -0.16, 0.51, 1.315, 0.15], voxel: 0.0026, planes: [[1, 0, 0, 0], [-1, 0, 0, SEAM.wristX], [0, 1, 0, -SEAM.ankleY], [0, -1, 0, SEAM.neckY]], tris: B.trunk },
    { name: 'hand', bounds: [0.48, 1.185, -0.045, 0.665, 1.25, 0.11], voxel: 0.0009, planes: [[1, 0, 0, -SEAM.wristX]], tris: B.hand },
    { name: 'foot', bounds: [-0.004, 0.02, -0.095, 0.1, 0.18, 0.15], voxel: 0.0011, planes: [[1, 0, 0, 0], [0, -1, 0, SEAM.ankleY]], tris: B.foot },
  ], { cacheDir: path.join(OUT, 'cache'), sources: [A('akari_body.mjs')], log, threads });
  const near = (v, c) => Math.abs(v - c) < 3e-4;
  let m = stitch(body.hand, body.trunk, (x) => near(x, SEAM.wristX));
  m = stitch(body.foot, m, (x, y) => near(y, SEAM.ankleY));
  if (head) {
    const hd = await contourPieces(A('akari_head.mjs'), [
      { name: 'head', bounds: [-0.012, 1.28, -0.125, 0.105, 1.535, 0.115], voxel: 0.0011, planes: [[1, 0, 0, 0], [0, 1, 0, -SEAM.neckY]], tris: B.head },
    ], { cacheDir: headCacheDir || path.join(OUT, 'cache'), sources: [A('akari_head.mjs'), A('akari_body.mjs')], log, threads });   // headCacheDir: a head under work keeps its pieces apart from the shipped figure's
    m = stitch(hd.head, m, (x, y) => near(y, SEAM.neckY));
  }
  let half = { pos: m.pos, idx: m.idx };
  // border vertices that simplification left a hair off the mirror plane go back onto it (only border vertices)
  for (const [a] of boundaryNext(half.idx)) if (Math.abs(half.pos[a * 3]) < 0.002) half.pos[a * 3] = 0;
  if (cutHalf) { half = cutHalf(half); for (const [a] of boundaryNext(half.idx)) if (Math.abs(half.pos[a * 3]) < 0.0006) half.pos[a * 3] = 0; }
  const full = mirrorX(half, 2.5e-4);
  let tag = null;
  if (half.tag) { tag = new Uint8Array(full.pos.length / 3); for (let v = 0; v < half.tag.length; v++) { tag[v] = half.tag[v]; tag[full.mirrorOf[v]] = half.tag[v]; } }
  const ck = checkMesh(full.pos, full.idx);
  log(`  skin: ${ck.tris} tris, ${ck.verts} verts, open edges ${ck.openEdges}, non-manifold ${ck.nonManifoldEdges}, bounds ${ck.bounds.join(' ')}`);
  return { half, pos: full.pos, idx: full.idx, tag, mirrorOf: full.mirrorOf, nrm: vertexNormals(full.pos, full.idx), check: ck };
}
