// Terrain colliders: square heightfield chunks, built lazily where something needs ground under it
// (the environment focus and every awake dynamic body), sampled from G.world.heightAt, cached with an LRU cap.
//
// Rapier heightfield convention (proven by .tmp/physics tests, see the system report):
//   heights is a (nrows+1) x (ncols+1) matrix in COLUMN-major order, rows run along +z, columns along +x:
//       heights[col * (nrows + 1) + row] = height at (x0 + col * cell, z0 + row * cell)
//   the collider is centred on its translation and spans scale.x by scale.z;
//   every cell is split along the diagonal that joins (x0, z1) and (x1, z0).
import { GROUPS, TERRAIN_FRICTION, TERRAIN_RESTITUTION } from './consts.js';

/** Chunk edge in metres. A multiple of the 2 m deformation grid, so chunk samples sit exactly on its nodes. */
export const CHUNK = 32;
const COARSE = 16;            // cells per edge at the normal 2 m resolution
const FINE = 32;              // cells per edge where the land is craggy (1 m)
const ROUGH = 0.8;            // second difference (m) of the 2 m samples above which a chunk is rebuilt at 1 m
const KEY = (cx, cz) => (cx + 512) * 1024 + (cz + 512);

export function createTerrain(P) {
  const { RAPIER, world, G } = P;
  const chunks = new Map();          // key -> chunk
  const dirty = [];                  // chunks whose ground was reshaped since the last flush
  const pool = { [COARSE]: [], [FINE]: [] };   // spare height buffers by resolution
  const scale = { x: CHUNK, y: 1, z: CHUNK };
  const flags = RAPIER.HeightFieldFlags?.FIX_INTERNAL_EDGES ?? 1;
  const heightAt = (x, z) => G.world.heightAt(x, z);
  const api = {
    chunks, CHUNK,
    /** Soft cap on cached chunks. Chunks with a body on them are never dropped, so the count can exceed it for a while. */
    maxChunks: 72,
    built: 0,            // chunks built since boot (statistics)
  };

  function sample(buf, n, x0, z0) {
    const cell = CHUNK / n, m = n + 1;
    for (let col = 0; col <= n; col++) {
      const x = x0 + col * cell, o = col * m;
      for (let row = 0; row <= n; row++) buf[o + row] = heightAt(x, z0 + row * cell);
    }
  }
  function isRough(buf, n) {
    const m = n + 1;
    for (let col = 0; col <= n; col++) {
      for (let row = 0; row <= n; row++) {
        const h = buf[col * m + row];
        if (row > 0 && row < n && Math.abs(buf[col * m + row - 1] - 2 * h + buf[col * m + row + 1]) > ROUGH) return true;
        if (col > 0 && col < n && Math.abs(buf[(col - 1) * m + row] - 2 * h + buf[(col + 1) * m + row]) > ROUGH) return true;
      }
    }
    return false;
  }
  const takeBuf = (n) => pool[n].pop() || new Float32Array((n + 1) * (n + 1));

  function fill(ch) {
    const x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK;
    let n = COARSE, buf = takeBuf(n);
    sample(buf, n, x0, z0);
    if (isRough(buf, n)) {
      // craggy ground (palace rock, ridges): 2 m facets would miss the real surface by decimetres -> 1 m cells here
      const fine = takeBuf(FINE), mc = COARSE + 1, mf = FINE + 1;
      for (let col = 0; col <= FINE; col++) {
        for (let row = 0; row <= FINE; row++) {
          fine[col * mf + row] = (col & 1) === 0 && (row & 1) === 0
            ? buf[(col >> 1) * mc + (row >> 1)]
            : heightAt(x0 + col * (CHUNK / FINE), z0 + row * (CHUNK / FINE));
        }
      }
      pool[n].push(buf);
      n = FINE; buf = fine;
    }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < buf.length; i++) { const h = buf[i]; if (h < lo) lo = h; if (h > hi) hi = h; }
    ch.n = n; ch.h = buf; ch.min = lo; ch.max = hi;
    const desc = RAPIER.ColliderDesc.heightfield(n, n, buf, scale, flags)
      .setTranslation(x0 + CHUNK / 2, 0, z0 + CHUNK / 2)
      .setFriction(TERRAIN_FRICTION).setRestitution(TERRAIN_RESTITUTION)
      .setCollisionGroups(GROUPS.terrain);
    ch.col = world.createCollider(desc);
    P.byHandle.set(ch.col.handle, ch);
    api.built++;
  }
  function strip(ch, wake) {
    if (!ch.col) return;
    P.byHandle.delete(ch.col.handle);
    world.removeCollider(ch.col, wake);
    ch.col = null;
    pool[ch.n].push(ch.h);
    ch.h = null;
  }

  /** Mark the chunks under every body (asleep or not) and under the focus: those must survive eviction. */
  function pinOccupied() {
    const stamp = P.frame;
    const mark = (x, z, r) => {
      const cx0 = Math.floor((x - r) / CHUNK), cx1 = Math.floor((x + r) / CHUNK);
      const cz0 = Math.floor((z - r) / CHUNK), cz1 = Math.floor((z + r) / CHUNK);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const c = chunks.get(KEY(cx, cz)); if (c) c.pin = stamp; }
    };
    for (let i = 0; i < P.dyn.length; i++) { const b = P.dyn[i]; if (b.isDynamic) mark(b._cp.x, b._cp.z, b.radius + 2); }
    const f = G.env.focus; mark(f.x, f.z, 10);
  }
  function evict() {
    if (chunks.size <= api.maxChunks) return;
    pinOccupied();
    const stamp = P.frame;
    // drop the longest-unused chunks first; never one used in the last second or with something resting on it
    let guard = chunks.size;
    while (chunks.size > api.maxChunks && guard-- > 0) {
      let old = null;
      for (const c of chunks.values()) {
        if (c.pin === stamp || stamp - c.used < 60) continue;
        if (!old || c.used < old.used) old = c;
      }
      if (!old) break;
      strip(old, false);
      chunks.delete(old.key);
    }
  }

  /** The chunk (cx, cz), built now if it does not exist yet. */
  function ensure(cx, cz) {
    const key = KEY(cx, cz);
    let ch = chunks.get(key);
    if (!ch) {
      ch = { kind: 'terrain', key, cx, cz, col: null, h: null, n: 0, min: 0, max: 0, used: P.frame, pin: -1, dirty: false };
      chunks.set(key, ch);
      fill(ch);
      evict();
    }
    ch.used = P.frame;
    return ch;
  }
  api.ensure = ensure;

  /** Make sure there is ground under the square (x ± r, z ± r). Cheap when it already exists (a few Map lookups). */
  api.cover = (x, z, r) => {
    const cx0 = Math.floor((x - r) / CHUNK), cx1 = Math.floor((x + r) / CHUNK);
    const cz0 = Math.floor((z - r) / CHUNK), cz1 = Math.floor((z + r) / CHUNK);
    if (cx1 - cx0 > 6 || cz1 - cz0 > 6) return;                       // absurd request (NaN / runaway body): ignore
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) ensure(cx, cz);
  };

  /**
   * Height of the collision surface at (x, z): exactly the facet Rapier collides with where a chunk exists,
   * the analytic terrain elsewhere.
   */
  api.surfaceAt = (x, z) => {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = chunks.get(KEY(cx, cz));
    if (!ch || !ch.h) return heightAt(x, z);
    const n = ch.n, m = n + 1, inv = n / CHUNK;
    const fx = (x - cx * CHUNK) * inv, fz = (z - cz * CHUNK) * inv;
    let j = fx | 0, i = fz | 0;
    if (j >= n) j = n - 1; if (i >= n) i = n - 1;
    const u = fx - j, v = fz - i, H = ch.h, o = j * m + i;
    const h00 = H[o], h10 = H[o + 1], h01 = H[o + m], h11 = H[o + m + 1];   // hRC: R = +z step, C = +x step
    return u + v <= 1 ? h00 + (h01 - h00) * u + (h10 - h00) * v : h11 + (h10 - h11) * (1 - u) + (h01 - h11) * (1 - v);
  };
  /**
   * Slope of the collision surface at (x, z): out.x = dh/dx, out.z = dh/dz (of the very facet a body rests on there).
   */
  api.gradAt = (x, z, out) => {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ch = chunks.get(KEY(cx, cz));
    if (!ch || !ch.h) {
      out.x = (heightAt(x + 0.5, z) - heightAt(x - 0.5, z)); out.z = (heightAt(x, z + 0.5) - heightAt(x, z - 0.5));
      return out;
    }
    const n = ch.n, m = n + 1, inv = n / CHUNK;
    const fx = (x - cx * CHUNK) * inv, fz = (z - cz * CHUNK) * inv;
    let j = fx | 0, i = fz | 0;
    if (j >= n) j = n - 1; if (i >= n) i = n - 1;
    const u = fx - j, v = fz - i, H = ch.h, o = j * m + i;
    const h00 = H[o], h10 = H[o + 1], h01 = H[o + m], h11 = H[o + m + 1];
    if (u + v <= 1) { out.x = (h01 - h00) * inv; out.z = (h10 - h00) * inv; }
    else { out.x = (h11 - h10) * inv; out.z = (h11 - h01) * inv; }
    return out;
  };
  /** True if a collider chunk exists under (x, z). */
  api.has = (x, z) => chunks.has(KEY(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));

  /** 'terrain:deformed' — remember which chunks to rebuild (done in flush(), once per frame, outside the solver). */
  api.onDeform = (e) => {
    const cx0 = Math.floor((e.x0 - 0.01) / CHUNK), cx1 = Math.floor((e.x1 + 0.01) / CHUNK);
    const cz0 = Math.floor((e.z0 - 0.01) / CHUNK), cz1 = Math.floor((e.z1 + 0.01) / CHUNK);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const ch = chunks.get(KEY(cx, cz));
      if (ch && !ch.dirty) { ch.dirty = true; dirty.push(ch); }
    }
  };
  /** Rebuild reshaped chunks. Returns how many were rebuilt. */
  api.flush = () => {
    const n = dirty.length;
    for (let i = 0; i < n; i++) {
      const ch = dirty[i];
      ch.dirty = false;
      if (!chunks.has(ch.key) || !ch.col) continue;
      strip(ch, true);
      fill(ch);
    }
    dirty.length = 0;
    return n;
  };

  /** Throw every chunk away (used by tests and by a world reload). They come back on demand. */
  api.clear = () => { for (const ch of chunks.values()) strip(ch, true); chunks.clear(); dirty.length = 0; };

  return api;
}
