// Character capsules: a kinematic capsule that shadows a person (the player, an enemy, a villager). The person is moved
// by its own controller; the capsule only makes the rigid-body world aware of it, so props are shoved aside when walked
// into and things thrown at people bounce off.
import * as THREE from 'three';
import { GROUPS, STEP } from './consts.js';

/** The capsule starts this far above the feet: standing on a crate must not squeeze the crate into the ground. */
const LIFT = 0.2;
/** A jump of more than this in one step is a teleport (no sweep, nothing gets launched). */
const TELEPORT = 2.5;

export function createCharacters(P) {
  const { RAPIER, world } = P;
  const list = P.chars;
  const _t = { x: 0, y: 0, z: 0 };
  const api = {};

  /**
   * addCharacter({ getPos, radius, height, owner }) -> handle
   *   getPos() returns the feet position (a Vector3-like, read every fixed step).
   *   handle: { owner, radius, height, pos (capsule centre), vel, enabled, setEnabled(on), remove() }
   */
  api.add = (o) => {
    const radius = Math.max(0.05, o.radius ?? 0.4), height = Math.max(radius * 2 + LIFT, o.height ?? 1.6);
    const body = height - LIFT;
    const seg = Math.max(0.01, body / 2 - radius);
    const h = {
      kind: 'char', owner: o.owner ?? null, radius, height, getPos: o.getPos,
      rb: null, col: null, pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: true, enabled: true,
      _cy: LIFT + body / 2, _fresh: true,
      /** Switch the capsule off / on (riding high on a broom, cutscenes, a dodge that passes through things). */
      setEnabled(on) { on = !!on; if (on === h.enabled || !h.alive) return; h.enabled = on; h.col.setEnabled(on); h._fresh = true; },
      remove() {
        if (!h.alive) return;
        h.alive = false;
        P.byHandle.delete(h.col.handle);
        world.removeRigidBody(h.rb);
        const i = list.indexOf(h);
        if (i >= 0) list.splice(i, 1);
      },
    };
    let p = null;
    try { p = o.getPos && o.getPos(); } catch (e) { p = null; }
    const x = p ? p.x : 0, y = p ? p.y + h._cy : -500, z = p ? p.z : 0;
    h.rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    h.col = world.createCollider(RAPIER.ColliderDesc.capsule(seg, radius).setCollisionGroups(GROUPS.capsule).setFriction(0.25).setRestitution(0), h.rb);
    h.pos.set(x, y, z);
    P.byHandle.set(h.col.handle, h);
    list.push(h);
    return h;
  };

  /** Move every capsule to where its person is now (called before each fixed step). */
  /** ... returns true when any capsule moved (physics skips a step only when none did) */
  api.preStep = () => {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      if (!h.enabled) continue;
      let p = null;
      try { p = h.getPos(); } catch (e) { p = null; }
      if (!p || !(p.x === p.x)) continue;
      const x = p.x, y = p.y + h._cy, z = p.z;
      const dx = x - h.pos.x, dy = y - h.pos.y, dz = z - h.pos.z;
      _t.x = x; _t.y = y; _t.z = z;
      if (h._fresh || dx * dx + dy * dy + dz * dz > 1e-8 || h.vel.x !== 0 || h.vel.y !== 0 || h.vel.z !== 0) moved = true;
      if (h._fresh || dx * dx + dy * dy + dz * dz > TELEPORT * TELEPORT) {
        h.rb.setTranslation(_t, true);
        h.vel.set(0, 0, 0);
        h._fresh = false;
      } else {
        h.rb.setNextKinematicTranslation(_t);
        h.vel.set(dx / STEP, dy / STEP, dz / STEP);
      }
      h.pos.set(x, y, z);
    }
    return moved;
  };
  return api;
}
