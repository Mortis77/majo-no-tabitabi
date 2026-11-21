// landforms — cell store: rock pieces baked into 128 m cells, two levels of detail per cell (same silhouettes),
// LOD picked by camera distance, pieces moved / shattered in place when spells reshape the ground.
import * as THREE from 'three';
import { Bake } from './rockgeo.js';

const CELL = 128, ORG = -1024, N = 16;

export class CellStore {
  constructor(name, mat, { hiDist = 170, castFar = true } = {}) {
    this.name = name; this.mat = mat; this.hiDist = hiDist; this.castFar = castFar;
    this.cells = new Map();
    this.pieces = [];
    this.group = new THREE.Group(); this.group.name = 'landforms_' + name;
  }
  cellOf(x, z) {
    const cx = Math.max(0, Math.min(N - 1, Math.floor((x - ORG) / CELL))), cz = Math.max(0, Math.min(N - 1, Math.floor((z - ORG) / CELL)));
    const k = cx + cz * N;
    let c = this.cells.get(k);
    if (!c) { c = { k, x: ORG + (cx + 0.5) * CELL, z: ORG + (cz + 0.5) * CELL, hi: new Bake(), lo: new Bake(), pieces: [], meshHi: null, meshLo: null }; this.cells.set(k, c); }
    return c;
  }
  /** Add a piece: protos { hi, lo } (lo optional = hi), matrix, shade(). info is kept on the piece (x, z, y0, y1 …). */
  add(protos, m, shade, info) {
    const c = this.cellOf(info.x, info.z);
    const hi = c.hi.add(protos.hi, m, shade);
    const lo = c.lo.add(protos.lo || protos.hi, m, shade);
    const p = { ...info, cell: c, hi, lo, dead: false, col: null };
    c.pieces.push(p); this.pieces.push(p);
    return p;
  }
  /** Add a hand-built piece: buildHi(bake) / buildLo(bake) write raw vertices (Bake.vert / tri) into the cell. */
  addRaw(info, buildHi, buildLo) {
    const c = this.cellOf(info.x, info.z);
    const h0 = c.hi.nv; buildHi(c.hi); const hi = { v0: h0, v1: c.hi.nv };
    const l0 = c.lo.nv; buildLo(c.lo); const lo = { v0: l0, v1: c.lo.nv };
    const p = { ...info, cell: c, hi, lo, dead: false, col: null };
    c.pieces.push(p); this.pieces.push(p);
    return p;
  }
  /**
   * Build the meshes (call once after adding everything). Draw-call pass (docs/api/perf.md): the near (hi) version is
   * one mesh per cell as before; the far (lo) versions of ALL cells live in one THREE.BatchedMesh (one instance per
   * cell, culled one by one against the camera), so the 20-odd far cells in view are one draw instead of one each.
   * c.meshLo is a small handle { batch, gid, iid, visible } with the same visible / geometry-edit behaviour.
   */
  finish() {
    let tHi = 0, tLo = 0;
    const los = [];
    for (const c of this.cells.values()) {
      if (!c.pieces.length) continue;
      c.meshHi = new THREE.Mesh(c.hi.build(), this.mat); c.meshHi.name = this.name + '_hi';
      c.meshHi.castShadow = c.meshHi.receiveShadow = true;
      c.meshHi.visible = false;
      const g = c.lo.build();
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      los.push([c, g]);
      tHi += c.hi.idx.length / 3; tLo += c.lo.idx.length / 3;
      c.hi = c.lo = null;           // free the JS arrays
      this.group.add(c.meshHi);
    }
    if (los.length) {
      let nv = 0, ni = 0;
      for (const [, g] of los) { nv += g.attributes.position.count; ni += g.index.count; }
      const bm = new THREE.BatchedMesh(los.length, nv, ni, this.mat);
      bm.name = this.name + '_lo';
      bm.castShadow = this.castFar; bm.receiveShadow = true;
      bm.frustumCulled = false; bm.perObjectFrustumCulled = true; bm.sortObjects = false;
      for (const [c, g] of los) {
        const gid = bm.addGeometry(g), iid = bm.addInstance(gid);
        const vs = bm.getGeometryRangeAt(gid).vertexStart;
        c.meshLo = { batch: bm, gid, iid, vs, _v: true,
          get visible() { return this._v; }, set visible(v) { if (v !== this._v) { this._v = v; bm.setVisibleAt(iid, v); } } };
        g.dispose();
      }
      this.lo = bm;
      this.group.add(bm);
    }
    this.tris = { hi: tHi, lo: tLo };
  }
  /** Pick LOD per cell from the camera position. */
  lod(cam) {
    let hiTris = 0, cells = 0;
    for (const c of this.cells.values()) {
      if (!c.meshHi) continue;
      const d = Math.max(0, Math.hypot(cam.x - c.x, cam.z - c.z) - CELL * 0.71);
      const hi = d < this.hiDist;
      c.meshHi.visible = hi; c.meshLo.visible = !hi;
      if (hi) { hiTris += c.meshHi.geometry.index.count / 3; cells++; }
    }
    return { hiTris, cells };
  }
  /** [position attribute, vertex offset] of a cell LOD: a near mesh, or the far cell's range in the shared batch. */
  _pos(mesh) {
    if (mesh.isMesh) return [mesh.geometry.attributes.position, 0];
    // the batch caches each geometry's bounds for its per-instance culling: drop them so they are recomputed
    const gi = mesh.batch._geometryInfo?.[mesh.gid];
    if (gi) { gi.boundingBox = null; gi.boundingSphere = null; }
    return [mesh.batch.geometry.attributes.position, mesh.vs];
  }
  /** Pieces whose anchor lies in the rectangle (world metres). */
  *inRect(x0, x1, z0, z1) {
    const keys = new Set();
    for (let x = x0; x <= x1 + CELL; x += CELL) for (let z = z0; z <= z1 + CELL; z += CELL) {
      const cx = Math.floor((Math.min(x, x1) - ORG) / CELL), cz = Math.floor((Math.min(z, z1) - ORG) / CELL);
      if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
      keys.add(cx + cz * N);
    }
    for (const k of keys) { const c = this.cells.get(k); if (!c) continue; for (const p of c.pieces) if (!p.dead && p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) yield p; }
  }
  /** Move a piece vertically by dy (both LODs). */
  shift(p, dy) {
    for (const [mesh, r] of [[p.cell.meshHi, p.hi], [p.cell.meshLo, p.lo]]) {
      const [a, o] = this._pos(mesh), v0 = r.v0 + o, v1 = r.v1 + o;
      for (let i = v0; i < v1; i++) a.array[i * 3 + 1] += dy;
      a.addUpdateRange(v0 * 3, (v1 - v0) * 3); a.needsUpdate = true;
    }
    if (p.col) { p.col.y0 += dy; p.col.y1 += dy; }
  }
  /** Hide a piece (collapse its vertices to a point) and drop its collider. */
  kill(p) {
    p.dead = true;
    for (const [mesh, r] of [[p.cell.meshHi, p.hi], [p.cell.meshLo, p.lo]]) {
      const [a, o] = this._pos(mesh), v0 = r.v0 + o, v1 = r.v1 + o;
      const x = a.array[v0 * 3], y = a.array[v0 * 3 + 1], z = a.array[v0 * 3 + 2];
      for (let i = v0; i < v1; i++) { a.array[i * 3] = x; a.array[i * 3 + 1] = y; a.array[i * 3 + 2] = z; }
      a.addUpdateRange(v0 * 3, (v1 - v0) * 3); a.needsUpdate = true;
    }
    if (p.col) p.col.dead = true;
  }
}
