// 器物 — the interactive objects that make the world a toy box (DESIGN §3.2, §6.7). G.props.
//
// Every prop = an instanced visual slot (one draw call per type+material for ALL live props of that type)
// + a G.physics body (owner = the prop) + a G.elements reactor + durability / behaviour (prop.js).
// The world layout is a list of deterministic placement RECORDS (place.js, built in start()); records within
// ACTIVE_R of the focus are live, records beyond DESPAWN_R go dormant again (their pose is remembered until reload).
import * as THREE from 'three';
import { G } from '../core/game.js';
import { CATALOG } from './catalog.js';
import { S, makeProp, removeProp, flushBreaks, updateDebris, updateRockets, debrisCount, looseDebris } from './prop.js';
import { kitStats } from './models.js';
import { buildRecords } from './place.js';

const CAP = 220;            // live props
const ACTIVE_R = 78, DESPAWN_R = 98;
const SPAWN_PER_FRAME = 36;

let records = [];
let scanT = 0;
const _v = new THREE.Vector3();
const cand = [];

function spawn(type, pos, opts = {}) {
  if (!CATALOG[type]) { G.reportError('props:spawn', new Error('unknown prop type ' + type)); return null; }
  if (S.live.length >= CAP) evictFarthest(pos, -1);
  const p = makeProp(type, pos, opts);
  return p;
}
S.spawn = spawn;

/** Make room: send the farthest dormant-able prop back to its record (or remove a far loose one). */
function evictFarthest(from, minDist2) {
  let best = null, bd = minDist2;
  const f = G.env.focus;
  for (const p of S.live) {
    if (p.persistent || p.fuse > 0 || p.body?.held || (p.reactor && p.reactor.burning)) continue;
    const d = p.pos.distanceToSquared(f);
    if (d > bd) { bd = d; best = p; }
  }
  if (best) { despawn(best); return true; }
  return false;
}

function despawn(p) {
  const r = p.rec;
  if (r) {
    const b = p.body;
    if (b) {
      r.x = b.pos.x; r.y = b.pos.y; r.z = b.pos.z;
      r.rot = b.quat.clone(); r.g = G.world.heightAt(r.x, r.z);
    }
    r.lit = p.lit;
  }
  removeProp(p);
}
S.onRemoved = (p) => { if (p.rec && p.rec.live === p) p.rec.live = null; };

function spawnRecord(r) {
  // the ground may have been reshaped since (craters): keep the same height above it
  const g = G.world.heightAt(r.x, r.z);
  const y = Math.abs(g - r.g) > 0.3 ? r.y + (g - r.g) : r.y;
  _v.set(r.x, y, r.z);
  const p = makeProp(r.type, _v, { rot: r.rot, sleep: true, lit: r.lit });
  p.rec = r; r.live = p;
  return p;
}

function stream() {
  const f = G.env.focus;
  if (!f || !(f.x === f.x)) return;
  const a2 = ACTIVE_R * ACTIVE_R, d2 = DESPAWN_R * DESPAWN_R;
  cand.length = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.gone || r.live) continue;
    const dx = r.x - f.x, dz = r.z - f.z, dd = dx * dx + dz * dz;
    if (dd < a2) { r._d = dd; cand.push(r); }
  }
  // far, quiet props go dormant (record-backed) or away (loose, non-persistent)
  for (let i = S.live.length - 1; i >= 0; i--) {
    const p = S.live[i];
    if (p.persistent || p.fuse > 0 || p.body?.held) continue;
    const dx = p.pos.x - f.x, dz = p.pos.z - f.z;
    if (dx * dx + dz * dz < d2) continue;
    if (p.reactor && p.reactor.burning) continue;
    if (p.body && !p.body.sleeping && p.body.type === 'dynamic' && p.body.vel.lengthSq() > 0.04) continue;
    despawn(p);
  }
  if (!cand.length) return false;
  cand.sort((a, b) => a._d - b._d);
  let n = 0;
  for (const r of cand) {
    if (n >= SPAWN_PER_FRAME) return true;
    if (S.live.length >= CAP && !evictFarthest(f, r._d + 400)) break;
    try { spawnRecord(r); } catch (e) { G.reportError('props:stream', e); r.gone = true; }
    n++;
  }
  return false;
}

function clearAll() {
  for (let i = S.live.length - 1; i >= 0; i--) removeProp(S.live[i]);
  S.pendingBreak.length = 0; S.pendingHurt.length = 0; S.rockets.length = 0;
  for (const r of records) r.live = null;
}

function near(pos, r = 5, out = []) {
  out.length = 0;
  const r2 = r * r;
  for (const p of S.live) if (p.alive && p.pos.distanceToSquared(pos) <= r2) out.push(p);
  return out;
}

export const propsSystem = {
  name: 'props',
  pausable: true,
  async init(g) {
    g.props = {
      /** ★ spawn(type, pos, { rot, vel, angvel, burning, persistent, lit, sleep }) -> Prop */
      spawn,
      /** ★ type ids */
      types: Object.keys(CATALOG),
      catalog: CATALOG,
      /** ★ live props within r of pos (array, fresh unless `out` given) */
      near,
      /** ★ number of live props */
      get count() { return S.live.length; },
      get live() { return S.live; },
      get records() { return records; },
      cap: CAP,
      /** Loose physics debris (pooled, capped, fades): debris(kind, pos, vel, { color, scale, life }) -> bool.
       *  kinds: clod rock splinter chunk plank shard sliver ball (see prop.js looseDebris). */
      debris: looseDebris,
      /** prop owning a physics body / reactor, or null */
      fromBody(b) { const o = b && b.owner; return o && o.def && o.type ? o : null; },
      /** Rebuild the world layout (props reset). */
      reset() { clearAll(); records = []; scanT = 0; },
      stats() {
        let awake = 0, burning = 0;
        for (const p of S.live) { if (p.body && !p.body.sleeping && p.body.type === 'dynamic') awake++; if (p.reactor?.burning) burning++; }
        return { live: S.live.length, records: records.length, dormant: records.filter((r) => !r.gone && !r.live).length, gone: records.filter((r) => r.gone).length,
          awake, burning, ticking: S.ticking.size, debris: debrisCount(), rockets: S.rockets.length, ...kitStats() };
      },
    };
  },
  start(g) {
    clearAll();
    for (let i = S.debris.length - 1; i >= 0; i--) S.debris[i].body ? g.physics?.remove?.(S.debris[i].body) : null;
    try { records = []; } catch (e) { g.reportError('props:place', e); records = []; }
    scanT = 0;
  },
  update(dt) {
    if (dt <= 0) return;
    S.t += dt;
    flushBreaks();
    const live = S.live;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      const b = p.body;
      if (b && b.held) p.heldT = S.t;
      if (b && p.def.boulder && !b.sleeping) S.ticking.add(p);
      p.write(false);
    }
    for (const p of S.ticking) { if (p.alive) { try { p.tick(dt); } catch (e) { G.reportError('props:tick', e); S.ticking.delete(p); } } else S.ticking.delete(p); }
    flushBreaks();
    updateDebris(dt);
    updateRockets(dt);
    if ((scanT -= dt) <= 0) { scanT = stream() ? 0 : 0.3; }
  },
};
