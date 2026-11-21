// Terrain level of detail: a CDLOD-style quadtree of 40×40-quad chunks, all drawn by ONE BatchedMesh (one draw call,
// per-chunk frustum culling, partial buffer uploads).
//  * root = 2048 m square centred on the island; 6 levels; leaf chunks are 64 m (1.6 m vertex spacing).
//  * a node splits when the camera is closer than K·size to its 3D box (small hysteresis).
//  * every vertex stores the height the PARENT grid has at that point; the vertex shader blends toward it as the
//    vertex approaches the range where the coarser level takes over (geomorphing: no popping, edges line up).
//  * skirts (strips hanging under every chunk edge) hide any remaining hairline gaps.
//  * chunk building is budgeted per frame; a node only descends into children that are all built, so there is never
//    a hole: until the children exist the parent keeps drawing (the root is always built).
import { ATLAS_HALF } from '../../data/atlas.js';
import * as THREE from 'three';
import { heightAt, deformOffsetAt } from '../ground.js';

export const Q = 40;                               // quads per chunk side
const GV = (Q + 1) * (Q + 1);                      // grid vertices
export const VPC = GV + 4 * (Q + 1);               // + skirt vertices
export const IPC = Q * Q * 6 + 4 * Q * 6;          // indices per chunk
const W = Q + 3;                                    // sample grid with a 1-vertex border (normals)

export const ROOT = ATLAS_HALF * 2, LEVELS = 7;              // sizes 2048 1024 512 256 128 64
const LEAF = LEVELS - 1;

class Node {
  constructor(level, x0, z0, size, parent) {
    this.level = level; this.x0 = x0; this.z0 = z0; this.size = size; this.parent = parent;
    this.children = null;
    this.slot = -1;           // BatchedMesh slot index or -1
    this.dirty = false;       // built, but the ground changed underneath
    this.split = false;
    this.minY = parent ? parent.minY : -20; this.maxY = parent ? parent.maxY : 200;
    this.used = 0;            // last frame it was drawn / visited
    this.drawTag = -1;
  }
  get built() { return this.slot >= 0; }
}

export class TerrainLOD {
  constructor(material, { slots = 220, K = 1.25 } = {}) {
    this.K = K;
    this.slots = slots;
    this.mesh = new THREE.BatchedMesh(slots, slots * VPC, slots * IPC, material);
    this.mesh.name = 'terrain';
    this.mesh.frustumCulled = false;      // per-chunk culling happens inside (perObjectFrustumCulled)
    this.mesh.sortObjects = true;         // front-to-back: less overdraw
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;

    // scratch geometry (reused for every build)
    this.pos = new Float32Array(VPC * 3);
    this.nor = new Float32Array(VPC * 3);
    this.mor = new Float32Array(VPC * 4);
    this.H = new Float32Array(W * W);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    this.geo.setAttribute('aMorph', new THREE.BufferAttribute(this.mor, 4));
    this.geo.setIndex(new THREE.BufferAttribute(makeIndex(), 1));
    this.geo.boundingBox = new THREE.Box3();
    this.geo.boundingSphere = new THREE.Sphere();

    this.slotGeo = []; this.slotInst = []; this.slotNode = []; this.free = [];
    for (let i = 0; i < slots; i++) {
      const gid = this.mesh.addGeometry(this.geo, VPC, IPC);
      const iid = this.mesh.addInstance(gid);
      this.mesh.setVisibleAt(iid, false);
      this.slotGeo.push(gid); this.slotInst.push(iid); this.slotNode.push(null); this.free.push(slots - 1 - i);
    }
    this.root = new Node(0, -ROOT / 2, -ROOT / 2, ROOT, null);
    this.frame = 0; this.tag = 0;
    this.cam = new THREE.Vector3();
    this.drawn = [];
    this.want = [];
    this.stats = { drawn: 0, built: 0, builds: 0, buildMs: 0, triangles: 0, pending: 0 };
    this._build(this.root);
  }

  /** Morph end distance for a node: where the next coarser level takes over. */
  morphEnd(node) { return node.level === 0 ? 1e9 : 2 * this.K * node.size; }

  _alloc(protectFrame) {
    if (this.free.length) return this.free.pop();
    // evict the least recently used built node that has no built children and was not drawn this frame
    let best = -1, bestUsed = Infinity;
    for (let s = 0; s < this.slots; s++) {
      const n = this.slotNode[s];
      if (!n || n.level === 0 || n.used >= protectFrame) continue;
      if (n.children && n.children.some((c) => c.built)) continue;
      if (n.used < bestUsed) { bestUsed = n.used; best = s; }
    }
    if (best < 0) return -1;
    const n = this.slotNode[best];
    n.slot = -1; n.dirty = false;
    this.slotNode[best] = null;
    this.mesh.setVisibleAt(this.slotInst[best], false);
    return best;
  }

  /** (Re)build the chunk geometry of `node` into its slot (allocating one if needed). Returns false if no slot. */
  _build(node) {
    const t0 = performance.now();
    if (node.slot < 0) {
      const s = this._alloc(this.frame);
      if (s < 0) return false;
      node.slot = s; this.slotNode[s] = node;
    }
    const d = node.size / Q, x0 = node.x0, z0 = node.z0;
    const H = this.H, pos = this.pos, nor = this.nor, mor = this.mor;
    let minY = Infinity, maxY = -Infinity;
    for (let jj = 0; jj < W; jj++) {
      const z = z0 + (jj - 1) * d;
      for (let ii = 0; ii < W; ii++) H[jj * W + ii] = heightAt(x0 + (ii - 1) * d, z);
    }
    const mEnd = this.morphEnd(node);
    const h = (i, j) => H[(j + 1) * W + i + 1];
    for (let j = 0; j <= Q; j++) {
      for (let i = 0; i <= Q; i++) {
        const v = j * (Q + 1) + i, x = x0 + i * d, z = z0 + j * d, y = h(i, j);
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        let nx = h(i - 1, j) - h(i + 1, j), ny = 2 * d, nz = h(i, j - 1) - h(i, j + 1);
        const il = 1 / Math.hypot(nx, ny, nz);
        nor[v * 3] = nx * il; nor[v * 3 + 1] = ny * il; nor[v * 3 + 2] = nz * il;
        const oi = i & 1, oj = j & 1;
        let py = y;
        if (oi && !oj) py = 0.5 * (h(i - 1, j) + h(i + 1, j));
        else if (!oi && oj) py = 0.5 * (h(i, j - 1) + h(i, j + 1));
        else if (oi && oj) py = 0.5 * (h(i - 1, j - 1) + h(i + 1, j + 1));
        mor[v * 4] = py; mor[v * 4 + 1] = mEnd; mor[v * 4 + 2] = 0; mor[v * 4 + 3] = deformOffsetAt(x, z);
      }
    }
    // skirts: copies of the four edges, dropped in the vertex shader by mor.z
    const drop = Math.max(1.5, d * 1.6);
    let k = GV;
    const copy = (src) => {
      pos[k * 3] = pos[src * 3]; pos[k * 3 + 1] = pos[src * 3 + 1]; pos[k * 3 + 2] = pos[src * 3 + 2];
      nor[k * 3] = nor[src * 3]; nor[k * 3 + 1] = nor[src * 3 + 1]; nor[k * 3 + 2] = nor[src * 3 + 2];
      mor[k * 4] = mor[src * 4]; mor[k * 4 + 1] = mor[src * 4 + 1]; mor[k * 4 + 2] = drop; mor[k * 4 + 3] = mor[src * 4 + 3];
      k++;
    };
    for (let i = 0; i <= Q; i++) copy(i);                       // north edge (j = 0)
    for (let i = 0; i <= Q; i++) copy(Q * (Q + 1) + i);         // south edge (j = Q)
    for (let j = 0; j <= Q; j++) copy(j * (Q + 1));             // west edge (i = 0)
    for (let j = 0; j <= Q; j++) copy(j * (Q + 1) + Q);         // east edge (i = Q)
    node.minY = minY; node.maxY = maxY;
    const bb = this.geo.boundingBox;
    bb.min.set(x0, minY - drop - 1, z0); bb.max.set(x0 + node.size, maxY + 1, z0 + node.size);
    bb.getBoundingSphere(this.geo.boundingSphere);
    for (const a of ['position', 'normal', 'aMorph']) this.geo.attributes[a].needsUpdate = true;
    this.mesh.setGeometryAt(this.slotGeo[node.slot], this.geo);
    node.dirty = false;
    this.stats.builds++;
    this.stats.buildMs += performance.now() - t0;
    return true;
  }

  _boxDist(n) {
    const c = this.cam;
    const dx = Math.max(n.x0 - c.x, 0, c.x - (n.x0 + n.size));
    const dz = Math.max(n.z0 - c.z, 0, c.z - (n.z0 + n.size));
    const dy = Math.max(n.minY - c.y, 0, c.y - n.maxY);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  _children(n) {
    if (!n.children) {
      const s = n.size / 2;
      n.children = [
        new Node(n.level + 1, n.x0, n.z0, s, n), new Node(n.level + 1, n.x0 + s, n.z0, s, n),
        new Node(n.level + 1, n.x0, n.z0 + s, s, n), new Node(n.level + 1, n.x0 + s, n.z0 + s, s, n),
      ];
    }
    return n.children;
  }

  _select(n) {
    n.used = this.frame;
    const d = this._boxDist(n);
    const wantSplit = n.level < LEAF && d < this.K * n.size * (n.split ? 1.1 : 1);
    n.split = wantSplit;
    if (wantSplit) {
      const ch = this._children(n);
      let ready = true;
      for (const c of ch) if (!c.built) { ready = false; this.want.push(c); c._d = d; }
      if (ready) { for (const c of ch) this._select(c); return; }
    }
    if (n.dirty) this._build(n);   // the ground changed: rebuild before showing it again (same frame)
    n.drawTag = this.tag;
    this.drawn.push(n);
  }

  /**
   * Choose and show the chunks for a camera at `camPos`. budgetMs limits how long new chunks may be built this frame
   * (Infinity = refine completely, e.g. after a teleport).
   */
  update(camPos, budgetMs = 3) {
    this.frame++;
    this.cam.copy(camPos);
    const t0 = performance.now();
    for (let pass = 0; pass < 14; pass++) {
      this.tag++;
      this.drawn.length = 0; this.want.length = 0;
      this._select(this.root);
      if (!this.want.length || performance.now() - t0 > budgetMs) break;
      // coarse levels first, then nearest
      this.want.sort((a, b) => a.level - b.level || a._d - b._d);
      let built = 0;
      for (const n of this.want) {
        if (built > 0 && performance.now() - t0 > budgetMs) break;
        if (!this._build(n)) break;
        n.used = this.frame;
        built++;
      }
      if (!built) break;
    }
    // visibility
    const m = this.mesh;
    let built = 0;
    for (let s = 0; s < this.slots; s++) {
      const n = this.slotNode[s];
      if (n) built++;
      const vis = !!n && n.drawTag === this.tag;
      if (m.getVisibleAt(this.slotInst[s]) !== vis) m.setVisibleAt(this.slotInst[s], vis);
    }
    this.stats.drawn = this.drawn.length; this.stats.built = built; this.stats.pending = this.want.length;
    this.stats.triangles = this.drawn.length * IPC / 3;
  }

  /** The ground changed inside a world rectangle: drawn chunks are rebuilt now, the others when next shown. */
  invalidate(x0, x1, z0, z1) {
    for (let s = 0; s < this.slots; s++) {
      const n = this.slotNode[s];
      if (!n) continue;
      if (n.x0 > x1 + 2 || n.x0 + n.size < x0 - 2 || n.z0 > z1 + 2 || n.z0 + n.size < z0 - 2) continue;
      n.dirty = true;
      if (n.drawTag === this.tag) this._build(n);
    }
  }
}

function makeIndex() {
  const idx = new Uint16Array(IPC);
  let k = 0;
  for (let j = 0; j < Q; j++) for (let i = 0; i < Q; i++) {
    const a = j * (Q + 1) + i, b = a + (Q + 1), c = b + 1, d = a + 1;
    idx[k++] = a; idx[k++] = b; idx[k++] = c;
    idx[k++] = a; idx[k++] = c; idx[k++] = d;
  }
  // skirts: edge e has grid vertices g(t) and skirt vertices s(t); outward normals N, S, W, E.
  const edges = [
    { g: (t) => t, out: [0, -1] },
    { g: (t) => Q * (Q + 1) + t, out: [0, 1] },
    { g: (t) => t * (Q + 1), out: [-1, 0] },
    { g: (t) => t * (Q + 1) + Q, out: [1, 0] },
  ];
  edges.forEach((e, ei) => {
    const s = (t) => GV + ei * (Q + 1) + t;
    for (let t = 0; t < Q; t++) {
      const a = e.g(t), b = e.g(t + 1), as = s(t), bs = s(t + 1);
      // triangle (a, as, bs) with a at y=0, as/bs at y=-1: decide winding so the face points outward
      const ax = a % (Q + 1), az = (a / (Q + 1)) | 0, bx = b % (Q + 1), bz = (b / (Q + 1)) | 0;
      // edge direction (b - a) × down (0,-1,0) = (-(bz-az)*-1 ... ) -> outward test
      const ex = bx - ax, ez = bz - az;
      // normal of (a, as, bs) = (as - a) × (bs - a) = (0,-1,0) × (ex,-1,ez) = (-ez, 0, ex)
      const nx = -ez, nz = ex;
      if (nx * e.out[0] + nz * e.out[1] > 0) { idx[k++] = a; idx[k++] = as; idx[k++] = bs; idx[k++] = a; idx[k++] = bs; idx[k++] = b; }
      else { idx[k++] = a; idx[k++] = bs; idx[k++] = as; idx[k++] = a; idx[k++] = b; idx[k++] = bs; }
    }
  });
  return idx;
}
