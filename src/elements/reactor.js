// Reactor — anything that takes part in 万物相生 (props, trees, creatures, lanterns …) — and the spatial hash that finds them.
//
// Position convention: `pos` is the BASE of the thing (feet / foot of the trunk), its body spans pos.y .. pos.y + height.
// register({ center: true }) (default for kind 'prop', which are usually physics bodies) means pos is the CENTRE and the
// body spans pos.y - height/2 .. pos.y + height/2. Either way the reactor's own `y0` is the bottom and `cy` the middle.
import * as THREE from 'three';
import { MATERIALS, T } from './consts.js';

let E = null;            // the elements core (set by elements.js)
export function bindCore(core) { E = core; }

let nextId = 1;

export class Reactor {
  constructor(o) {
    const m = MATERIALS[o.material] || MATERIALS.wood;
    this.id = nextId++;
    this.owner = o.owner ?? null;
    this.kind = o.kind || 'prop';
    this.material = MATERIALS[o.material] ? o.material : 'wood';
    this.team = o.team || 'neutral';
    this.radius = Math.max(0.1, o.radius ?? 0.5);
    this.height = Math.max(0.1, o.height ?? this.radius * 2);
    this.center = o.center ?? (this.kind === 'prop');
    this.flammable = o.flammable ?? m.flammable;
    this.burnTime = o.burnTime ?? m.burnTime;
    this.conductive = o.conductive ?? m.conductive;
    this.freezable = o.freezable ?? m.freezable;
    this.living = o.living ?? (!!m.living || this.kind === 'creature');
    this.immune = new Set(o.immune || []);
    this.on = o.on || {};
    this.getPos = typeof o.getPos === 'function' ? o.getPos : null;
    this.pos = new THREE.Vector3();
    if (this.getPos) { const p = this.getPos(); if (p) this.pos.copy(p); }
    else if (o.pos) this.pos.copy(o.pos);
    this._src = this.getPos ? null : (o.pos && o.pos.isVector3 ? o.pos : null); // a live vector we may re-read
    // status timers (seconds left, 0 = off)
    this.burning = 0; this.wet = 0; this.frozen = 0; this.shocked = 0; this.lit = 0;
    this.fuel = this.burnTime;        // seconds of burning left in it
    this.charred = false;             // burnt out (won't burn again)
    this.dead = false;
    this._cell = null; this._active = false; this._spread = Math.random() * T.SPREAD_EVERY;
    this._fx = null;                  // smoke emitter while burning
  }
  get y0() { return this.center ? this.pos.y - this.height * 0.5 : this.pos.y; }
  get cy() { return this.center ? this.pos.y : this.pos.y + this.height * 0.5; }

  /** Status check: is('burning'|'wet'|'frozen'|'shocked'|'lit'|'charred'). */
  is(s) { return s === 'charred' ? this.charred : !!this[s]; }
  ignite(power = 1, info) { return E ? E.ignite(this, power, info) : false; }
  extinguish(info) { return E ? E.extinguish(this, info) : false; }
  soak(sec = T.WET) { return E ? E.soak(this, sec) : false; }
  freeze(sec = T.FREEZE) { return E ? E.freeze(this, sec) : false; }
  thaw() { return E ? E.thaw(this) : false; }
  shock(power = 1, info) { return E ? E.shock(this, power, info) : false; }
  /** Re-read the position now and fix the spatial hash (call after teleporting something registered with a fixed pos). */
  moved(p) { if (p) this.pos.copy(p); if (E) E.hash.update(this); }
}

/** Uniform grid of reactors keyed by the cell of their position. Every reactor lives in exactly one cell. */
export function createHash(cell = 8) {
  const cells = new Map();
  const key = (ix, iz) => (ix + 1024) * 2048 + (iz + 1024);
  let maxR = 1;
  const api = {
    cells,
    get maxR() { return maxR; },
    add(r) {
      if (r.radius > maxR) maxR = Math.min(r.radius, 24);
      const k = key(Math.floor(r.pos.x / cell), Math.floor(r.pos.z / cell));
      let a = cells.get(k);
      if (!a) cells.set(k, (a = []));
      a.push(r); r._cell = k;
    },
    remove(r) {
      const a = cells.get(r._cell);
      if (a) { const i = a.indexOf(r); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } if (!a.length) cells.delete(r._cell); }
      r._cell = null;
    },
    /** Re-hash if its position left its cell (cheap when it did not). */
    update(r) {
      if (r._cell === null) return;
      const k = key(Math.floor(r.pos.x / cell), Math.floor(r.pos.z / cell));
      if (k !== r._cell) { api.remove(r); api.add(r); }
    },
    /** cb(r) for every reactor whose footprint may touch the vertical cylinder of radius rad around (x,z). */
    each(x, z, rad, cb) {
      const reach = rad + maxR;
      const ix0 = Math.floor((x - reach) / cell), ix1 = Math.floor((x + reach) / cell);
      const iz0 = Math.floor((z - reach) / cell), iz1 = Math.floor((z + reach) / cell);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const a = cells.get(key(ix, iz));
        if (!a) continue;
        for (let i = a.length - 1; i >= 0; i--) { const r = a[i]; if (r && !r.dead) cb(r); }
      }
    },
  };
  return api;
}

/** Distance from point p to the reactor's body (a vertical capsule-ish cylinder); <= 0 means inside. */
export function distTo(r, x, y, z) {
  const dh = Math.hypot(x - r.pos.x, z - r.pos.z) - r.radius;
  const y0 = r.y0, y1 = y0 + r.height;
  const dv = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  const h = dh > 0 ? dh : 0;
  return h > 0 || dv > 0 ? Math.hypot(h, dv) : dh;
}
