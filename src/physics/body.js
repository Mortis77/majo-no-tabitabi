// PhysBody: one rigid body of the game — a Rapier body + collider, the mesh it drives, and mirrored state that the
// rest of the game may read every frame without touching the solver (pos, vel, quat, sleeping, submerged …).
import * as THREE from 'three';
import { MATERIALS, DEFAULT_MATERIAL, MASS_SCALE, GROUPS, MAX_SPEED, ROLL } from './consts.js';

export const SHAPE = { box: 0, sphere: 1, cylinder: 2, capsule: 3, hull: 4 };
const HULL_POINTS = 220;
let nextId = 1;
const _v = { x: 0, y: 0, z: 0 };
const _q = { x: 0, y: 0, z: 0, w: 1 };
const _t = new THREE.Vector3();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const ZERO = { x: 0, y: 0, z: 0 }, IDENT = { x: 0, y: 0, z: 0, w: 1 };

export class PhysBody {
  constructor(P) {
    this._P = P;
    this.id = nextId++;
    this.kind = 'body';
    /** Rapier RigidBody / Collider. */
    this.rb = null; this.col = null;
    /** The Object3D this body moves (may be null). */
    this.mesh = null;
    this.type = 'dynamic'; this.isDynamic = true;
    this.shape = 'box'; this.group = 'prop';
    this.material = DEFAULT_MATERIAL; this.mat = MATERIALS[DEFAULT_MATERIAL];
    this.mass = 0; this.volume = 0;
    /** Radius of the bounding sphere around the collider centre. */
    this.radius = 0.5;
    this.owner = null;
    /** onImpact(other: PhysBody|null, speed, info: {pos, surface, owner}) — hard hits only (see 'physics:impact'). */
    this.onImpact = null;
    /** onRemove(body, reason: 'lifetime'|'budget'|'lost'|'removed') — called once when the body leaves the world. */
    this.onRemove = null;
    /** Mirrors of the simulation state (read-only for everyone else; refreshed every fixed step). */
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3(); this.angvel = new THREE.Vector3();
    this.sleeping = false;
    /** Fraction of the body's volume under water, 0..1. */
    this.submerged = 0;
    /** True while it rests on / rolls over the ground or anything else. */
    this.grounded = false;
    this.alive = true;
    /** Seconds since add(); removed automatically when age reaches lifetime. */
    this.age = 0; this.lifetime = Infinity;
    /** Speed of time for this body (1, or the scale of the time bubble it is in). */
    this.timeScale = 1;

    // ---- internals -------------------------------------------------------------------------------------------
    this._held = false; this._gkey = 'prop'; this._ccd = false; this._ownMesh = false;
    this._shape = 0;
    this._he = [0.5, 0.5, 0.5];        // local half extents of the bounding box (around the collider centre)
    this._r = 0.5; this._hh = 0.5;     // radius / half height of round shapes
    this._off = null;                  // collider centre in body space (null = at the origin)
    this._cp = new THREE.Vector3();    // collider centre in the world
    this._p0 = new THREE.Vector3(); this._q0 = new THREE.Quaternion();   // transform one step ago (render interpolation)
    this._pv = new THREE.Vector3();    // velocity before the current step (impact speed)
    this._gy = -1e9;                   // collision-surface height of the terrain under it
    this._vext = 0.5;                  // current vertical half extent
    this._nc = 0;                      // touching collider pairs
    this._I = 1;                       // mean principal inertia
    this._windK = 0; this._wx = 0; this._wy = 0; this._wz = 0;
    this._impactT = -1; this._rest = 0; this._fade = 0; this._s0 = null;
    this._bub = 1;
    this.rolling = null; this._roll = ROLL.roll; this._hold = ROLL.hold; this._rbox = ROLL.box;
  }

  /** True while 月引 (or anything else) carries the body: no pull of the earth, no wind, people do not bump into it. */
  get held() { return this._held; }
  set held(v) {
    v = !!v;
    if (v === this._held) return;
    this._held = v;
    if (!this.alive || !this.isDynamic) return;
    this.col.setCollisionGroups(v ? GROUPS.held : GROUPS[this._gkey]);
    this.rb.setGravityScale(v ? 0 : this.timeScale * this.timeScale, true);
    this.rb.setLinearDamping(v ? 1.2 : this.mat.linDamp);
    this.rb.setAngularDamping(v ? 3.5 : this.mat.angDamp);
    this.rb.enableCcd(v || this._ccd);
  }

  /** Instant change of momentum (mass × m/s). Wakes the body. */
  applyImpulse(v) {
    if (!this.alive || !this.isDynamic) return;
    const s = this.timeScale;
    _v.x = v.x * s; _v.y = v.y * s; _v.z = v.z * s;
    this.rb.applyImpulse(_v, true);
  }
  /** Impulse applied at a world point (adds spin). */
  applyImpulseAt(v, point) {
    if (!this.alive || !this.isDynamic) return;
    const s = this.timeScale;
    _v.x = v.x * s; _v.y = v.y * s; _v.z = v.z * s;
    this.rb.applyImpulseAtPoint(_v, point, true);
  }
  /** Set the linear velocity (m/s). */
  setVelocity(v) {
    if (!this.alive || this.type === 'fixed') return;
    let x = v.x, y = v.y, z = v.z;
    const l2 = x * x + y * y + z * z;
    if (l2 > MAX_SPEED * MAX_SPEED) { const k = MAX_SPEED / Math.sqrt(l2); x *= k; y *= k; z *= k; }
    _v.x = x; _v.y = y; _v.z = z;
    this.rb.setLinvel(_v, true);
    this.vel.set(x, y, z);
  }
  setAngularVelocity(v) {
    if (!this.alive || this.type === 'fixed') return;
    _v.x = v.x; _v.y = v.y; _v.z = v.z;
    this.rb.setAngvel(_v, true);
    this.angvel.set(v.x, v.y, v.z);
  }
  /** Teleport (no sweep, no interpolation streak). */
  setPosition(v) {
    if (!this.alive) return;
    _v.x = v.x; _v.y = v.y; _v.z = v.z;
    this.rb.setTranslation(_v, true);
    this.pos.set(v.x, v.y, v.z); this._p0.copy(this.pos);
    this._syncCentre();
    this._gy = -1e9;
    if (this.mesh) this.mesh.position.copy(this.pos);
    this._P.stirred = Math.max(this._P.stirred, 2);
    this._P.touch(this);
  }
  setRotation(q) {
    if (!this.alive) return;
    _q.x = q.x; _q.y = q.y; _q.z = q.z; _q.w = q.w;
    this.rb.setRotation(_q, true);
    this._P.stirred = Math.max(this._P.stirred, 2);
    this.quat.set(q.x, q.y, q.z, q.w); this._q0.copy(this.quat);
    this._syncCentre();
    if (this.mesh) this.mesh.quaternion.copy(this.quat);
  }
  /**
   * Where the body should be next. A kinematic body goes exactly there (pushing dynamic bodies out of its way).
   * A dynamic body chases the point with velocity, so on the way it still bumps into walls instead of passing through:
   * call it every frame while you carry something.
   */
  setKinematicTarget(p, q) {
    if (!this.alive) return;
    const rb = this.rb;
    if (this.type === 'kinematic') {
      _v.x = p.x; _v.y = p.y; _v.z = p.z;
      rb.setNextKinematicTranslation(_v);
      this._P.stirred = Math.max(this._P.stirred, 2); // fix2: physics skips quiet steps; a moving kinematic body is not quiet
      if (q) { _q.x = q.x; _q.y = q.y; _q.z = q.z; _q.w = q.w; rb.setNextKinematicRotation(_q); }
      return;
    }
    if (this.type !== 'dynamic') return;
    const K = 14, VMAX = 34;
    let x = (p.x - this.pos.x) * K, y = (p.y - this.pos.y) * K, z = (p.z - this.pos.z) * K;
    const l = Math.hypot(x, y, z);
    if (l > VMAX) { const k = VMAX / l; x *= k; y *= k; z *= k; }
    _v.x = x; _v.y = y; _v.z = z;
    rb.setLinvel(_v, true);
    this.vel.set(x, y, z);
    if (q) {
      // angular velocity that turns the body towards q: axis * angle of (q * conj(current)), small-angle form
      const c = this.quat;
      let dx = q.w * -c.x + q.x * c.w + q.y * -c.z - q.z * -c.y;
      let dy = q.w * -c.y - q.x * -c.z + q.y * c.w + q.z * -c.x;
      let dz = q.w * -c.z + q.x * -c.y - q.y * -c.x + q.z * c.w;
      const dw = q.w * c.w + q.x * c.x + q.y * c.y + q.z * c.z;
      if (dw < 0) { dx = -dx; dy = -dy; dz = -dz; }
      const KR = 2 * 9;
      _v.x = dx * KR; _v.y = dy * KR; _v.z = dz * KR;
      rb.setAngvel(_v, true);
      this.angvel.set(_v.x, _v.y, _v.z);
    }
  }
  /**
   * Rolling resistance override. rolling: number = deceleration ×g while rolling (round shapes) / tumble calming (boxes),
   * or { roll?, hold?, box? } (same meaning as physics ROLL: hold = steepest slope tangent a resting body stays on).
   * null / undefined -> the global defaults.
   */
  setRolling(r) {
    const o = typeof r === 'number' ? { roll: r, box: r * 0.2 } : (r && typeof r === 'object' ? r : null);
    this.rolling = o ? { roll: o.roll ?? ROLL.roll, hold: o.hold ?? ROLL.hold, box: o.box ?? ROLL.box } : null;
    this._roll = this.rolling ? this.rolling.roll : ROLL.roll;
    this._hold = this.rolling ? this.rolling.hold : ROLL.hold;
    this._rbox = this.rolling ? this.rolling.box : ROLL.box;
  }
  wake() { if (this.alive && this.isDynamic) this.rb.wakeUp(); }
  sleep() { if (this.alive && this.isDynamic) this.rb.sleep(); }
  /** Change the collision family: 'prop' | 'debris' | 'character' | 'projectile'. */
  setGroup(group) {
    if (!GROUPS[group] || group === 'held' || group === 'capsule' || group === 'terrain' || group === 'static') return;
    this._P.regroup(this, group);
  }
  remove() { this._P.api.remove(this); }

  _syncCentre() {
    const o = this._off;
    if (!o) { this._cp.copy(this.pos); return; }
    this._cp.copy(o).applyQuaternion(this.quat).add(this.pos);
  }
}

/** Convex-hull points of an Object3D in its own (scaled) space. */
function hullPoints(mesh) {
  mesh.updateWorldMatrix(true, true);
  _inv.copy(mesh.matrixWorld).invert();
  let total = 0;
  mesh.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position) total += o.geometry.attributes.position.count; });
  if (!total) return null;
  const stride = Math.max(1, Math.ceil(total / HULL_POINTS));
  const out = [];
  const s = mesh.scale;
  mesh.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const a = o.geometry.attributes.position;
    _m.multiplyMatrices(_inv, o.matrixWorld);
    for (let i = 0; i < a.count; i += stride) {
      _t.fromBufferAttribute(a, i).applyMatrix4(_m);
      out.push(_t.x * s.x, _t.y * s.y, _t.z * s.z);
    }
  });
  return new Float32Array(out);
}

/**
 * Build a PhysBody from the options of G.physics.add(). Throws on nonsense input (caught by add()).
 */
export function createBody(P, o) {
  const { RAPIER, world } = P;
  const b = new PhysBody(P);
  const type = o.type === 'fixed' || o.type === 'kinematic' ? o.type : 'dynamic';
  const dynamic = type === 'dynamic';
  const matName = MATERIALS[o.material] ? o.material : DEFAULT_MATERIAL;
  const mat = MATERIALS[matName];
  const group = o.group === 'debris' || o.group === 'character' || o.group === 'projectile' ? o.group : 'prop';
  const mesh = o.mesh || null;
  const p = o.pos || (mesh ? mesh.position : ZERO);
  const q = o.quat || (mesh ? mesh.quaternion : IDENT);
  b.type = type; b.isDynamic = dynamic; b.group = group; b._gkey = group;
  b.material = matName; b.mat = mat; b.mesh = mesh;
  b.owner = o.owner ?? null;
  b.onImpact = typeof o.onImpact === 'function' ? o.onImpact : null;
  b.onRemove = typeof o.onRemove === 'function' ? o.onRemove : null;
  if (o.lifetime > 0) b.lifetime = o.lifetime;
  b._ccd = o.ccd ?? group === 'projectile';
  b.setRolling(o.rolling);

  // ---- collider shape ------------------------------------------------------------------------------------------
  const shape = o.shape in SHAPE ? o.shape : 'box';
  const size = o.size;
  let cd = null;
  let off = o.offset ? (Array.isArray(o.offset) ? new THREE.Vector3(o.offset[0], o.offset[1], o.offset[2]) : new THREE.Vector3(o.offset.x, o.offset.y, o.offset.z)) : null;
  const he = b._he;
  b.shape = shape; b._shape = SHAPE[shape];
  if (shape === 'sphere') {
    const r = Math.max(0.01, typeof size === 'number' ? size : size?.r ?? 0.5);
    cd = RAPIER.ColliderDesc.ball(r);
    he[0] = he[1] = he[2] = r; b._r = r; b._hh = 0;
  } else if (shape === 'cylinder' || shape === 'capsule') {
    const r = Math.max(0.01, size?.r ?? 0.4), h = Math.max(2 * 0.01, size?.h ?? 1);
    if (shape === 'cylinder') { cd = RAPIER.ColliderDesc.cylinder(h / 2, r); b._hh = h / 2; }
    else { const seg = Math.max(0.005, h / 2 - r); cd = RAPIER.ColliderDesc.capsule(seg, r); b._hh = seg; }
    he[0] = he[2] = r; he[1] = Math.max(h / 2, r); b._r = r;
  } else if (shape === 'hull') {
    const pts = mesh ? hullPoints(mesh) : null;
    if (pts && pts.length >= 12) cd = RAPIER.ColliderDesc.convexHull(pts);
    if (cd) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < pts.length; i += 3) {
        const x = pts[i], y = pts[i + 1], z = pts[i + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      he[0] = Math.max(0.01, (x1 - x0) / 2); he[1] = Math.max(0.01, (y1 - y0) / 2); he[2] = Math.max(0.01, (z1 - z0) / 2);
      // the hull lives in mesh space: its centre (not a collider offset) is where the forces act
      off = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      if (off.lengthSq() < 1e-6) off = null;
      b._r = Math.min(he[0], he[1], he[2]); b._hh = 0;
      b._hullOff = true;
    } else {
      // no usable geometry: fall back to a box of the given (or unit) size
      const s = Array.isArray(size) ? size : [0.5, 0.5, 0.5];
      he[0] = s[0]; he[1] = s[1]; he[2] = s[2];
      cd = RAPIER.ColliderDesc.cuboid(he[0], he[1], he[2]);
      b.shape = 'box'; b._shape = SHAPE.box;
    }
  } else {
    const s = Array.isArray(size) ? size : typeof size === 'number' ? [size, size, size] : [0.5, 0.5, 0.5];
    he[0] = Math.max(0.005, s[0]); he[1] = Math.max(0.005, s[1]); he[2] = Math.max(0.005, s[2]);
    cd = RAPIER.ColliderDesc.cuboid(he[0], he[1], he[2]);
  }
  b.radius = b._shape === SHAPE.sphere ? b._r : b._shape === SHAPE.capsule ? b._hh + b._r : Math.hypot(he[0], he[1], he[2]);
  b._off = off;
  if (off && !b._hullOff) cd.setTranslation(off.x, off.y, off.z);

  cd.setFriction(o.friction ?? mat.friction).setRestitution(o.restitution ?? mat.restitution).setCollisionGroups(GROUPS[group]);
  if (mat.slick) cd.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
  if (o.mass > 0) cd.setMass(o.mass);
  else cd.setDensity((o.density > 0 ? o.density : mat.density) * MASS_SCALE);
  if (dynamic) cd.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  else if (type === 'kinematic') cd.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT);

  // ---- rigid body ----------------------------------------------------------------------------------------------
  const rd = type === 'fixed' ? RAPIER.RigidBodyDesc.fixed() : type === 'kinematic' ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.dynamic();
  _q.x = q.x; _q.y = q.y; _q.z = q.z; _q.w = q.w;
  rd.setTranslation(p.x, p.y, p.z).setRotation(_q);
  if (dynamic) {
    rd.setLinearDamping(mat.linDamp).setAngularDamping(mat.angDamp).setCcdEnabled(!!b._ccd);
    if (o.vel) rd.setLinvel(o.vel.x, o.vel.y, o.vel.z);
    if (o.angvel) rd.setAngvel({ x: o.angvel.x, y: o.angvel.y, z: o.angvel.z });
    if (o.sleeping) rd.setSleeping(true);
  }
  const rb = world.createRigidBody(rd);
  const col = world.createCollider(cd, rb);
  rb.userData = b;
  b.rb = rb; b.col = col;

  // ---- derived quantities --------------------------------------------------------------------------------------
  b.volume = col.volume();
  if (!(b.volume > 0)) b.volume = 8 * he[0] * he[1] * he[2];
  if (dynamic) {
    b.mass = rb.mass();
    const pi = rb.principalInertia();
    b._I = Math.max(1e-4, (pi.x + pi.y + pi.z) / 3);
    b._windK = mat.wind * Math.pow(b.volume, 2 / 3) / Math.max(b.mass, 1e-3);
    if (o.vel) b.vel.set(o.vel.x, o.vel.y, o.vel.z);
    if (o.angvel) b.angvel.set(o.angvel.x, o.angvel.y, o.angvel.z);
    b.sleeping = !!o.sleeping;
  } else {
    b.mass = Infinity; b._I = Infinity;
  }
  b.pos.set(p.x, p.y, p.z); b.quat.set(q.x, q.y, q.z, q.w);
  b._p0.copy(b.pos); b._q0.copy(b.quat);
  b._syncCentre();
  b._vext = he[1];
  if (mesh) { mesh.position.copy(b.pos); mesh.quaternion.copy(b.quat); }
  return b;
}
