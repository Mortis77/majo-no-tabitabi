// Static world mirror: every obstacle / walkable slab registered through G.world.addCollider / addPlatform becomes a
// fixed Rapier collider, so rigid bodies rest on bridges, roofs and floating isles and are stopped by walls and trunks.
//
// G.world.colliders / platforms are append-only arrays; other systems fill them with thousands of entries during their own
// init (after ours), and now and then at run time (a conjured rock pillar, an ice slab). So the mirror is incremental:
//   - new entries are picked up a few hundred per frame,
//   - entries flagged `.dead` are removed, entries whose numbers changed (a rising pillar) are rebuilt:
//     the newest few are checked every frame, all the others by a rolling scan.
import { GROUPS, STATIC_FRICTION, STATIC_RESTITUTION, STATIC_INF } from './consts.js';

/**
 * Which way does a box's `rot` turn in THIS world? +1 = like Object3D.rotation.y, -1 = the other way.
 * (The mirror must agree with what G.world.groundAt / resolveCollisions really do, so it asks instead of assuming.)
 */
function probeRotSense(W) {
  try {
    const p = W.addPlatform({ box: true, x: -893, z: -893, hw: 6, hd: 0.5, rot: 0.5, top: 9000, tag: 'physics-probe' });
    // Object3D.rotation.y = +0.5 carries the local +x arm to world (cos, -sin): the point (5, -2.73) lies on it
    const like = W.groundAt(-893 + 5, -893 - 2.73, Infinity) === 9000;
    const unlike = W.groundAt(-893 + 5, -893 + 2.73, Infinity) === 9000;
    p.dead = true;
    if (like !== unlike) return like ? 1 : -1;
  } catch (e) { /* fall through */ }
  return 1;
}

export function createStatics(P) {
  const { RAPIER, world, G } = P;
  const W = G.world;
  const sign = probeRotSense(W);
  const mk = (arr, plat) => ({ arr, plat, recs: [], next: 0, scan: 0 });
  const sets = [mk(W.colliders, false), mk(W.platforms, true)];
  const hot = [];                    // the most recently registered records: checked every frame
  const HOT_MAX = 96;
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  const pos = { x: 0, y: 0, z: 0 };
  let warned = false;
  const api = {
    /** live mirrored colliders */
    count: 0,
    /** +1 if box `rot` turns like Object3D.rotation.y in this world, -1 if the other way */
    rotSense: sign,
    /** New entries mirrored per frame. */
    perFrame: 320,
  };
  const hAt = (x, z) => W.heightAt(x, z);
  const fin = Number.isFinite;

  function span(e, plat, out) {
    if (plat) { out.y1 = e.top; out.y0 = e.top - (e.thick > 0.05 ? e.thick : 1.2); return; }
    let y0 = e.y0, y1 = e.y1;
    const lo = !(y0 > -1e5), hi = !(y1 < 1e5);
    if (lo || hi) {
      // "infinite" walls and trunks: from a little under the lowest ground they stand on to well above the highest
      const r = e.box ? Math.max(e.hw, e.hd) : e.r;
      let a = hAt(e.x, e.z), b = a;
      for (let k = 0; k < 4; k++) {
        const h = hAt(e.x + (k === 0 ? r : k === 1 ? -r : 0), e.z + (k === 2 ? r : k === 3 ? -r : 0));
        if (h < a) a = h; if (h > b) b = h;
      }
      if (lo) y0 = (hi ? a : Math.min(a, y1 - 0.5)) - STATIC_INF.down;
      if (hi) y1 = Math.max(b, y0) + STATIC_INF.up;
    }
    if (!(y1 > y0 + 0.04)) y1 = y0 + 0.04;
    out.y0 = y0; out.y1 = y1;
  }
  const sp = { y0: 0, y1: 0 };

  function snapshot(rec, e) {
    rec.x = e.x; rec.z = e.z; rec.rot = e.rot || 0;
    rec.a = rec.plat ? e.top : e.y0; rec.b = rec.plat ? e.thick : e.y1;
    rec.s0 = e.box ? e.hw : e.r; rec.s1 = e.box ? e.hd : 0;
  }
  function changed(rec) {
    const e = rec.e;
    return rec.x !== e.x || rec.z !== e.z || rec.rot !== (e.rot || 0) || rec.a !== (rec.plat ? e.top : e.y0)
      || rec.b !== (rec.plat ? e.thick : e.y1) || rec.s0 !== (e.box ? e.hw : e.r) || rec.s1 !== (e.box ? e.hd : 0);
  }

  function build(rec) {
    const e = rec.e;
    snapshot(rec, e);
    span(e, rec.plat, sp);
    const hh = (sp.y1 - sp.y0) / 2, cy = (sp.y0 + sp.y1) / 2;
    let desc;
    if (e.box) {
      if (!(e.hw > 0) || !(e.hd > 0)) return false;
      desc = RAPIER.ColliderDesc.cuboid(e.hw, hh, e.hd);
      const a = (e.rot || 0) * sign * 0.5;
      rot.y = Math.sin(a); rot.w = Math.cos(a);
      desc.setRotation(rot);
      rec.reach = Math.hypot(e.hw, e.hd);
    } else {
      if (!(e.r > 0)) return false;
      desc = RAPIER.ColliderDesc.cylinder(hh, e.r);
      rec.reach = e.r;
    }
    if (!fin(e.x) || !fin(e.z) || !fin(cy) || !fin(hh)) return false;
    desc.setTranslation(e.x, cy, e.z).setFriction(STATIC_FRICTION).setRestitution(STATIC_RESTITUTION).setCollisionGroups(GROUPS.static);
    rec.col = world.createCollider(desc);
    rec.y0 = sp.y0; rec.y1 = sp.y1;
    P.byHandle.set(rec.col.handle, rec);
    api.count++;
    return true;
  }
  function strip(rec) {
    if (!rec.col) return;
    P.byHandle.delete(rec.col.handle);
    world.removeCollider(rec.col, true);     // wakes whatever was resting on / leaning against it
    rec.col = null;
    api.count--;
  }
  /** Re-examine one record: gone -> remove, reshaped -> rebuild. Returns false when the record is finished with. */
  function check(rec) {
    if (rec.e.dead) { strip(rec); rec.done = true; return false; }
    if (changed(rec)) {
      strip(rec);
      try { build(rec); } catch (err) { report(err); }
      pos.x = rec.x; pos.z = rec.z;
      P.wakeArea(rec.x, rec.z, rec.reach + 1.5);   // bodies asleep on a slab that just moved must notice
    }
    return true;
  }
  function report(err) { if (!warned) { warned = true; G.reportError('physics:statics', err); } }

  /** Mirror pending entries and look for dead / reshaped ones. Called once per frame; cheap when nothing changed. */
  api.sync = () => {
    let budget = api.perFrame;
    for (let s = 0; s < sets.length; s++) {
      const set = sets[s], arr = set.arr;
      const fresh = arr.length - set.next;
      while (set.next < arr.length && budget > 0) {
        const e = arr[set.next++];
        if (!e || e.dead || e.tag === 'physics-probe') { set.recs.push(null); continue; }
        const rec = { kind: 'static', e, plat: set.plat, col: null, done: false, reach: 1, x: 0, z: 0, rot: 0, a: 0, b: 0, s0: 0, s1: 0, y0: 0, y1: 0 };
        budget--;
        try { if (!build(rec)) { set.recs.push(null); continue; } } catch (err) { report(err); set.recs.push(null); continue; }
        set.recs.push(rec);
        // entries that trickle in at run time are the ones that move or expire (conjured pillars, ice): watch them closely
        if (fresh <= 12) { hot.push(rec); if (hot.length > HOT_MAX) hot.shift(); }
      }
      // rolling scan over everything already mirrored
      const n = set.recs.length;
      for (let k = Math.min(n, 220); k > 0; k--) {
        if (set.scan >= n) set.scan = 0;
        const i = set.scan++;
        const rec = set.recs[i];
        if (rec && !rec.done && !check(rec)) set.recs[i] = null;
      }
    }
    for (let i = hot.length - 1; i >= 0; i--) {
      const rec = hot[i];
      if (rec.done || !check(rec)) hot.splice(i, 1);
    }
  };
  /** Entries registered with the world but not mirrored yet. */
  api.pending = () => (sets[0].arr.length - sets[0].next) + (sets[1].arr.length - sets[1].next);
  /** Mirror everything that is pending right now (tests, loading screens). */
  api.flush = () => { const keep = api.perFrame; api.perFrame = Infinity; api.sync(); api.perFrame = keep; };
  return api;
}
