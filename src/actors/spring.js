// Secondary motion for the character rigs: costume cloth chains, VRoid hair, fox tails — verlet tails on bone chains.
//
//   const sb = createSprings(model, { scale, chains, defaults })   // null if the rig has nothing to drive
//   sb.update(dt, { wind, water, lod, airK })   // after animation / IK, every frame. lod 0 = full 60 Hz, 1 = 30 Hz cloth only,
//                                                 // 2 = static hang (no dynamics; keeps cloth hanging, never rigid)
//   sb.reset()                                    // snap to the animated pose (teleports > 1.5 m are detected automatically)
//
// Chains (see docs/api/cloth.md):
//   costume  J_Sec_<Part>_<n>_<01..03> (+ _end leaf) from the manifest's `secondaryChains` (kind: sleeve skirt tail cape charm
//            beard) or found by name. When a rig has costume chains, the old VRoid outfit chains (J_Sec_L_SkirtBack0…,
//            *_LowerSleeve, *_TipSleeve) and the limb helpers J_Sec_{L,R}_{UpperArm,LowerArm,UpperLeg,LowerLeg} are never touched.
//   hair     HairJoint-* chains (VRoid).
//   legacy   rigs without costume chains (?costume=v1): J_Sec_*Skirt* / J_Sec_*Sleeve* as before.
// Model: tails live in world space; the actor's root translation is carried (so walking does not drag cloth through the
// body), and the motion comes back as explicit forces — air flow (wind − velocity, so a broom / glide streams the cloth back),
// inertia (−acceleration, so stops / jumps overshoot), gravity, a pull toward the animated rest direction, damping, an angle
// limit, and capsule colliders (hips, thighs, shins, chest, upper arms, head, neck) scaled by hipsHeight. In water: heavy drag,
// near-zero weight (cloth floats). Fixed 1/60 s steps (1/30 at lod 1), so it is the same at any frame rate.
import * as THREE from 'three';

const STEP = 1 / 60;
const G9 = 9.8;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _n = new THREE.Vector3(), _rd = new THREE.Vector3(), _acc = new THREE.Vector3(), _air = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _s = new THREE.Vector3();
const _m = new THREE.Vector3(), _ra = new THREE.Vector3(), _aq = new THREE.Quaternion();

// Colliders [name, boneA, offA, boneB, offB, radius] — offsets in metres at hips 0.887 (bone-local), radius likewise.
const COLLIDERS = [
  ['hips', 'J_Bip_C_Hips', [0, 0.07, -0.01], 'J_Bip_C_Hips', [0, -0.05, -0.01], 0.13],
  ['thighL', 'J_Bip_L_UpperLeg', [0, 0, 0], 'J_Bip_L_LowerLeg', [0, 0, 0], 0.075],
  ['thighR', 'J_Bip_R_UpperLeg', [0, 0, 0], 'J_Bip_R_LowerLeg', [0, 0, 0], 0.075],
  ['shinL', 'J_Bip_L_LowerLeg', [0, 0, 0], 'J_Bip_L_Foot', [0, 0, 0], 0.055],
  ['shinR', 'J_Bip_R_LowerLeg', [0, 0, 0], 'J_Bip_R_Foot', [0, 0, 0], 0.055],
  ['chest', 'J_Bip_C_Spine', [0, 0.02, -0.005], 'J_Bip_C_UpperChest', [0, 0.06, -0.005], 0.11],
  ['armL', 'J_Bip_L_UpperArm', [0, 0, 0], 'J_Bip_L_LowerArm', [0, 0, 0], 0.045],
  ['armR', 'J_Bip_R_UpperArm', [0, 0, 0], 'J_Bip_R_LowerArm', [0, 0, 0], 0.045],
  ['head', 'J_Bip_C_Head', [0, 0.075, 0.005], 'J_Bip_C_Head', [0, 0.04, -0.02], 0.09],
  ['neck', 'J_Bip_C_Neck', [0, 0.0, 0], 'J_Bip_C_Neck', [0, 0.05, 0], 0.05],
];
const CI = Object.fromEntries(COLLIDERS.map((c, i) => [c[0], i]));
const mask = (...names) => names.reduce((m, n) => m | (1 << CI[n]), 0);

// Per kind (internal units, per 1/60 s step): pull = fraction of the way back to the animated rest tip, damp = fraction of
// relative velocity lost, grav = × 9.8 m/s², air = 1/s response to air flow, inert = response to −acceleration,
// maxAng = max swing from the rest direction (deg), hit = collision thickness (m at hips 0.887), cols = collider mask,
// hipR = hips radius override (sleeves slide outside the skirt). Manifest springDefaults {stiffness, drag, gravity, hit} map
// to pull = 0.11·stiffness, damp = 0.2·drag, grav = gravity (see docs/api/cloth.md).
const KIND = {
  sleeve: { pull: 0.03, damp: 0.07, grav: 1.0, air: 0.9, wk: 0.6, inert: 0.8, maxAng: 95, hit: 0.035, cols: mask('hips', 'chest', 'thighL', 'thighR'), hipR: 0.2,
    upSoft: 1 },
  skirt: { pull: 0.06, damp: 0.09, grav: 0.55, air: 0.38, wk: 0.45, inert: 0.35, maxAng: 34, hit: 0.03, cols: mask('hips', 'thighL', 'thighR', 'shinL', 'shinR'),
    airV: 0.25, inertV: 0.3, radMax: 13, legF: 0.55, speedPull: 0.06 },
  tail: { pull: 0.045, damp: 0.06, grav: 0.4, air: 0.9, inert: 0.8, maxAng: 105, hit: 0.025, cols: mask('hips', 'thighL', 'thighR') },
  fox: { pull: 0.06, damp: 0.05, grav: 0.25, air: 0.45, inert: 0.7, maxAng: 70, hit: 0.03, cols: mask('hips', 'thighL', 'thighR'), wag: 1 },
  cape: { pull: 0.07, damp: 0.09, grav: 0.6, air: 0.6, wk: 0.7, inert: 0.6, maxAng: 80, hit: 0.035, cols: mask('chest', 'armL', 'armR', 'hips') },
  charm: { pull: 0.02, damp: 0.05, grav: 1.0, air: 0.5, inert: 1.2, maxAng: 100, hit: 0.015, cols: mask('hips', 'thighL', 'thighR') },
  beard: { pull: 0.09, damp: 0.1, grav: 0.3, air: 0.3, inert: 0.35, maxAng: 45, hit: 0.02, cols: mask('chest', 'neck') },
  hair: { pull: 0.085, damp: 0.09, grav: 0.22, air: 0.45, inert: 0.5, maxAng: 45, hit: 0.018, cols: mask('head', 'neck', 'chest', 'armL', 'armR') },
  legacy: { pull: 0.06, damp: 0.09, grav: 0.4, air: 0.3, inert: 0.4, maxAng: 70, hit: 0.015, cols: mask('hips', 'thighL', 'thighR', 'chest') },
};
const COSTUME = /^J_Sec_([A-Za-z]+)_(\d+)_(\d\d)$/;
const SKIRT_PARTS = /Hakama|Robe|Kimono|Tunic|Happi|Haori|Apron|Trousers|WorkCoat|Skirt/;
function kindOfPart(part) {
  if (/Sleeve/.test(part)) return 'sleeve';
  if (SKIRT_PARTS.test(part)) return 'skirt';
  if (/Shawl|Cape/.test(part)) return 'cape';
  if (/Charm|Bell/.test(part)) return 'charm';
  if (/Beard/.test(part)) return 'beard';
  return 'tail';
}
const colLen = (m) => Math.hypot(m.elements[0], m.elements[1], m.elements[2]);

export function createSprings(model, opts = {}) {
  const k = opts.scale || 1;
  model.updateMatrixWorld(true);
  const ms0 = colLen(model.matrixWorld) || 1;
  const byName = new Map();
  model.traverse((o) => { if (o.name && !byName.has(o.name)) byName.set(o.name, o); });
  const defaults = opts.defaults || {};

  // ---- chains ----
  const chains = [];
  const used = new Set();
  function addChain(bonesList, tailNode, kind) {
    const bs = bonesList.filter(Boolean);
    if (!bs.length || used.has(bs[0])) return;
    const base = KIND[kind] || KIND.tail;
    const p = { ...base };
    const d = defaults[kind === 'fox' ? 'tail' : kind];
    if (d && kind !== 'fox') {
      if (d.stiffness != null) p.pull = 0.11 * d.stiffness;
      if (d.drag != null) p.damp = 0.2 * d.drag;
      if (d.gravity != null) p.grav = d.gravity;
      if (d.hit != null) p.hit = d.hit;
    }
    p.hitW = p.hit * k;
    const joints = [];
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      const child = i + 1 < bs.length ? bs[i + 1] : tailNode;
      let axis, len;
      const wp = b.getWorldPosition(new THREE.Vector3());
      if (child) {
        axis = child.position.clone();
        len = child.getWorldPosition(new THREE.Vector3()).distanceTo(wp);
      } else {
        // leaf without an _end node: virtual tail continuing the parent -> joint direction
        const pw = b.parent.getWorldPosition(new THREE.Vector3());
        const dir = wp.clone().sub(pw);
        if (dir.lengthSq() < 1e-10) dir.set(0, -1, 0);
        dir.normalize();
        len = 0.06 * k * ms0;
        b.getWorldQuaternion(_q).invert();
        axis = dir.applyQuaternion(_q);
      }
      if (len < 1e-4 || axis.lengthSq() < 1e-12) break;
      axis.normalize();
      used.add(b);
      joints.push({ b, rest: b.quaternion.clone(), axis, len0: len / ms0, cur: new THREE.Vector3(), prev: new THREE.Vector3(), wq: new THREE.Quaternion() });
    }
    if (joints.length) chains.push({ kind, p, joints, ph: Math.random() * 6.28, cosMax: Math.cos(p.maxAng * Math.PI / 180), sinMax: Math.sin(p.maxAng * Math.PI / 180), hair: kind === 'hair',
      root0: joints[0].b.getWorldPosition(new THREE.Vector3()), wL: 0.5, sinRad: Math.sin((p.radMax || 90) * Math.PI / 180) });
  }

  // costume chains: manifest first, then by name
  let costume = false;
  for (const c of opts.chains || []) {
    const bs = (c.joints || []).map((n) => byName.get(n));
    if (!bs[0]) continue;
    const part = (COSTUME.exec(c.root) || [])[1] || '';
    let kind = c.kind || kindOfPart(part);
    if (kind === 'tail' && /^Tail$/.test(part)) kind = 'fox';
    addChain(bs, byName.get(c.tail) || null, kind);
    costume = true;
  }
  model.traverse((b) => {
    const m = COSTUME.exec(b.name || '');
    if (!m || m[3] !== '01' || used.has(b)) return;
    const bs = [b];
    for (let i = 2; i < 10; i++) { const n = byName.get('J_Sec_' + m[1] + '_' + m[2] + '_' + String(i).padStart(2, '0')); if (!n) break; bs.push(n); }
    let kind = kindOfPart(m[1]);
    if (m[1] === 'Tail') kind = 'fox';
    addChain(bs, byName.get('J_Sec_' + m[1] + '_' + m[2] + '_end') || null, kind);
    costume = true;
  });
  // hair (and legacy outfit chains on v1 rigs): roots = matching bones whose parent does not match
  const hairRe = /^HairJoint/;
  const legacyRe = /^J_Sec_.*(Skirt|Sleeve)/;
  model.traverse((b) => {
    const n = b.name || '';
    const isHair = hairRe.test(n);
    const isLegacy = !costume && legacyRe.test(n) && !/_end$/.test(n);
    if (!isHair && !isLegacy) return;
    const re = isHair ? hairRe : legacyRe;
    if (re.test(b.parent?.name || '')) return;
    const bs = [];
    for (let x = b; x && re.test(x.name) && !/_end$/.test(x.name); ) { bs.push(x); x = x.children.find((c) => re.test(c.name) && !/_end$/.test(c.name)) || null; }
    const last = bs[bs.length - 1];
    const tailNode = last.children.find((c) => c.isBone || c.type === 'Bone' || c.type === 'Object3D') || null;
    addChain(bs, tailNode, isHair ? 'hair' : 'legacy');
  });
  if (!chains.length) return null;

  // ---- colliders ----
  const cols = [];
  for (const [name, an, ao, bn, bo, r] of COLLIDERS) {
    const A = byName.get(an), B = byName.get(bn);
    cols[CI[name]] = A && B ? { A, B, ao: new THREE.Vector3(...ao).multiplyScalar(k), bo: new THREE.Vector3(...bo).multiplyScalar(k), r: r * k, wa: new THREE.Vector3(), wb: new THREE.Vector3(), rw: 0 } : null;
  }
  const hasFox = chains.some((c) => c.kind === 'fox');
  // ---- leg follow (skirts): each skirt chain turns with the thigh(s) nearest to it, so a hakama / long robe goes with the
  // legs in a stride, a jump tuck or a seat instead of hanging from the hips like a bell. Bind-pose thigh directions are kept
  // in the hips' frame; at run time the rotation rest->current of each thigh is blended by the chain's side weight.
  const OLD = !!opts.legacyMotion;
  const hipsB = byName.get('J_Bip_C_Hips');
  const legs = ['L', 'R'].map((sd) => {
    const t = byName.get('J_Bip_' + sd + '_UpperLeg'), kn = byName.get('J_Bip_' + sd + '_LowerLeg');
    if (!t || !kn || !hipsB) return null;
    const d = kn.getWorldPosition(new THREE.Vector3()).sub(t.getWorldPosition(new THREE.Vector3())).normalize();
    hipsB.getWorldQuaternion(_q).invert();
    return { t, kn, bind: d.applyQuaternion(_q), q: new THREE.Quaternion(), pos0: t.getWorldPosition(new THREE.Vector3()) };
  });
  const legOK = !OLD && legs[0] && legs[1];
  if (legOK) for (const ch of chains) {
    if (!ch.p.legF) continue;
    const dl = Math.hypot(ch.root0.x - legs[0].pos0.x, ch.root0.z - legs[0].pos0.z), dr = Math.hypot(ch.root0.x - legs[1].pos0.x, ch.root0.z - legs[1].pos0.z);
    ch.wL = dr / Math.max(1e-6, dl + dr);
    ch.wL = ch.wL < 0.35 ? 0 : ch.wL > 0.65 ? 1 : (ch.wL - 0.35) / 0.3;   // side chains follow one leg, the middle ones both
  }
  const _qF = new THREE.Quaternion(), _hp = new THREE.Vector3();
  function legRot() {
    hipsB.getWorldQuaternion(_q2);
    for (const L of legs) {
      L.t.getWorldPosition(_a); L.kn.getWorldPosition(_b);
      _b.sub(_a).normalize();
      _c.copy(L.bind).applyQuaternion(_q2);
      L.q.setFromUnitVectors(_c, _b);
    }
  }
  // body spin (rad/s about the vertical): fast turns carry the cloth round with the body and tighten the limits
  let yaw0 = null, spin = 0;

  // ---- root motion (carried; comes back as forces) ----
  const lastRoot = new THREE.Vector3();
  const vel = new THREE.Vector3(), velPrev = new THREE.Vector3(), acc = new THREE.Vector3();
  let needReset = true, acc60 = 0, ms = ms0, simT = 0;

  function headOf(j, out) { return out.copy(j.b.position).applyMatrix4(j.b.parent.matrixWorld); }
  function setRot(j, dirW, parentQ) {
    // world dir -> joint-local, relative to the rest orientation
    _q2.copy(parentQ).multiply(j.rest);           // rest world rotation
    j.wq.copy(_q2);
    _d.copy(dirW).applyQuaternion(_q.copy(_q2).invert());
    const l = _d.length();
    const b = j.b;
    if (l > 1e-6) {
      _d.multiplyScalar(1 / l);
      _q.setFromUnitVectors(j.axis, _d);
      b.quaternion.copy(j.rest).multiply(_q);
      j.wq.multiply(_q);
    } else b.quaternion.copy(j.rest);
    b.updateMatrix();
    b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix);
  }

  function snap() {
    for (const ch of chains) {
      ch.joints[0].b.parent.matrixWorld.decompose(_a, _pq, _s);
      for (const j of ch.joints) {
        j.b.quaternion.copy(j.rest);
        j.b.updateMatrix();
        j.b.matrixWorld.multiplyMatrices(j.b.parent.matrixWorld, j.b.matrix);
        _q.copy(_pq).multiply(j.rest);
        headOf(j, _a);
        j.cur.copy(_a).addScaledVector(_b.copy(j.axis).applyQuaternion(_q), j.len0 * ms);
        j.prev.copy(j.cur);
        _pq.copy(_q);
      }
    }
  }

  function updateCols() {
    for (const c of cols) {
      if (!c) continue;
      c.wa.copy(c.ao).applyMatrix4(c.A.matrixWorld);
      c.wb.copy(c.bo).applyMatrix4(c.B.matrixWorld);
      c.rw = c.r * ms;
    }
  }

  // push p out of the capsule collider c (radius + extra); returns true when moved
  function pushOut(p, c, r) {
    _e.copy(c.wb).sub(c.wa);
    const ll = _e.lengthSq();
    let t = ll > 1e-10 ? _n.copy(p).sub(c.wa).dot(_e) / ll : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    _n.copy(c.wa).addScaledVector(_e, t);          // closest point on the segment
    _e.copy(p).sub(_n);
    const dl = _e.length();
    if (dl >= r) return false;
    if (dl > 1e-6) p.copy(_n).addScaledVector(_e, r / dl);
    else p.y = _n.y - r;
    return true;
  }

  /** One solver step for every chain (h = step length, mode: 0 dynamic, 2 static hang). */
  function step(h, o, mode, hairToo) {
    updateCols();
    const water = o.water || 0;
    const h2 = h * h;
    if (legOK) legRot();
    if (hipsB) _hp.setFromMatrixPosition(hipsB.matrixWorld);
    const kStep = h / STEP;                      // 1 at 60 Hz, 2 at 30 Hz
    simT += h;
    for (const ch of chains) {
      if (ch.hair && !hairToo) { holdChain(ch); continue; }
      const p = ch.p;
      const sp01 = OLD ? 0 : Math.min(1, Math.max(0, (Math.abs(spin) - 3) / 7));
      const spd01 = OLD || !p.speedPull ? 0 : Math.min(1, Math.max(0, (vel.length() - 3) / 8));
      const pullB = Math.min(0.5, p.pull + 0.1 * sp01 + (p.speedPull || 0) * spd01);
      const pull = 1 - Math.pow(1 - pullB, kStep);
      const cosMax = sp01 > 0 ? Math.cos(p.maxAng * (1 - 0.4 * sp01) * Math.PI / 180) : ch.cosMax;
      const sinMax = sp01 > 0 ? Math.sqrt(1 - cosMax * cosMax) : ch.sinMax;
      const follow = legOK && p.legF && mode !== 2;
      if (follow) _qF.copy(legs[1].q).slerp(legs[0].q, ch.wL); // R..L by side weight
      if (follow) _qF.slerp(_q2.identity(), 1 - p.legF);
      // drape: the more the thighs lift (seated on the broom, a jump tuck), the more the lower joints hang from the knee line
      // instead of carrying the thigh's angle out — the cloth lies over the knees and falls, it does not stand out flat
      const hang = follow ? Math.min(0.75, Math.max(0, (2 * Math.acos(Math.min(1, Math.abs(_qF.w))) - 0.25) * 1.1)) : 0;
      const damp = 1 - Math.pow(1 - Math.min(0.9, p.damp + water * 0.3), kStep);
      // forces common to the chain (world, m/s²)
      const flut = 0.75 + 0.35 * Math.sin(simT * 2.9 + ch.ph) + 0.2 * Math.sin(simT * 7.3 + ch.ph * 2.1);
      _air.copy(o.wind || _m.set(0, 0, 0)).multiplyScalar(flut * (1 - water) * (p.wk ?? 1)).sub(vel);   // heavy cloth feels the breeze less than its own motion
      const al = _air.length();
      if (al > 14) _air.multiplyScalar(14 / al);
      if (!OLD && p.airV != null && water <= 0) _air.y *= p.airV;   // heavy cloth: the fall / climb wind streams it, it does not balloon
      _acc.set(0, -G9 * p.grav * (1 - water * 0.92), 0)
        .addScaledVector(_air, p.air * (water > 0 ? 1.4 : 1) * (o.airK ?? 1))
        .addScaledVector(acc, -p.inert);
      if (!OLD && p.inertV != null) _acc.y += acc.y * p.inert * (1 - p.inertV);
      if (ch.kind === 'fox') {                   // living tails: a slow sway on top of the physics
        _b.set(Math.sin(simT * 2.1 + ch.ph), 0.4 * Math.sin(simT * 1.3 + ch.ph), Math.cos(simT * 1.7 + ch.ph * 1.3)).multiplyScalar(2.2);
        _acc.add(_b);
      }
      ch.joints[0].b.parent.matrixWorld.decompose(_a, _pq, _s);
      _aq.copy(_pq);
      const rad = (c) => (c === cols[CI.hips] && p.hipR ? p.hipR * k * ms : c.rw) + p.hitW * ms;
      for (const j of ch.joints) {
        const L = j.len0 * ms;
        headOf(j, _a);
        _q.copy(_pq).multiply(j.rest);
        _rd.copy(j.axis).applyQuaternion(_q);    // rest direction under the simulated parent
        _aq.multiply(j.rest);
        _ra.copy(j.axis).applyQuaternion(_aq);   // rest direction of the fully animated chain (angle limit is cumulative)
        if (follow) { if (j === ch.joints[0]) _rd.applyQuaternion(_qF); _ra.applyQuaternion(_qF); }  // deeper joints inherit it via the simulated parent
        if (hang > 0 && j !== ch.joints[0]) {
          _rd.lerp(_m.set(0, -1, 0), hang); if (_rd.lengthSq() < 1e-8) _rd.set(0, -1, 0); _rd.normalize();
          _ra.lerp(_m.set(0, -1, 0), hang); if (_ra.lengthSq() < 1e-8) _ra.set(0, -1, 0); _ra.normalize();
        }
        const next = _c;
        if (mode === 2) {
          // static hang: rest direction leaned toward straight down
          next.copy(_rd).lerp(_b.set(0, -1, 0), ch.hair ? 0.25 : 0.6);
          if (next.lengthSq() < 1e-8) next.copy(_rd);
          next.normalize().multiplyScalar(L).add(_a);
        } else {
          next.copy(j.cur).sub(j.prev).multiplyScalar(1 - damp).add(j.cur);
          next.addScaledVector(_acc, h2);
          // a sleeve whose rest points up (arm raised) is mostly held by gravity: it falls down the forearm, not stands up
          const pk = p.upSoft && !OLD && _rd.y > 0 ? pull * (1 - 0.92 * Math.min(1, _rd.y * 1.6)) : pull;
          next.add(_b.copy(_a).addScaledVector(_rd, L).sub(j.cur).multiplyScalar(pk));
        }
        // length + angle limit
        _d.copy(next).sub(_a);
        let l = _d.length();
        if (l < 1e-6) { _d.copy(_ra); l = 1; }
        _d.multiplyScalar(1 / l);
        const cd = _d.dot(_ra);
        // look r2: arms raised over the head — the sleeve bag may swing much further from its (upward) rest, so it
        // drops down the forearm and leaves the head free instead of standing up around it like a hood
        let cM = cosMax, sM = sinMax;
        if (p.upSoft && !OLD && _ra.y > 0) { const ang = Math.min(150, p.maxAng + 55 * Math.min(1, _ra.y * 1.4)) * Math.PI / 180; cM = Math.cos(ang); sM = Math.sin(ang); }
        if (cd < cM) {
          _b.copy(_d).addScaledVector(_ra, -cd);
          const bl = _b.length();
          if (bl > 1e-6) _d.copy(_ra).multiplyScalar(cM).addScaledVector(_b, sM / bl);
          else _d.copy(_ra);
        }
        // anti-bell: the swing OUTWARD from the body axis is limited much tighter than the swing along the motion
        if (!OLD && p.radMax && mode !== 2 && hipsB) {
          _e.set(_a.x - _hp.x, 0, _a.z - _hp.z);
          const el = _e.length();
          if (el > 1e-4) {
            _e.multiplyScalar(1 / el);
            const rc = _d.dot(_e) - _ra.dot(_e);
            if (rc > ch.sinRad) { _d.addScaledVector(_e, ch.sinRad - rc).normalize(); }
          }
        }
        next.copy(_a).addScaledVector(_d, L);
        // colliders (only those this kind cares about; the static hang only keeps out of the hips)
        const cm = mode === 2 ? (p.cols & (1 << CI.hips)) : p.cols;
        if (cm) {
          let moved = false;
          for (let ci = 0; ci < cols.length; ci++) {
            if (!(cm & (1 << ci)) || !cols[ci]) continue;
            if (pushOut(next, cols[ci], rad(cols[ci]))) moved = true;
          }
          if (moved) { _d.copy(next).sub(_a); const l2 = _d.length(); if (l2 > 1e-6) next.copy(_a).addScaledVector(_d, L / l2); }
        }
        if (mode === 2) j.prev.copy(next); else j.prev.copy(j.cur);
        j.cur.copy(next);
        _d.copy(next).sub(_a);
        setRot(j, _d, _pq);
        _pq.copy(j.wq);
      }
    }
  }
  // chain not simulated this step: keep its local rotations, but follow the parents (tails move with it)
  function holdChain(ch) {
    for (const j of ch.joints) {
      j.b.updateMatrix(); j.b.matrixWorld.multiplyMatrices(j.b.parent.matrixWorld, j.b.matrix);
      _d.copy(j.cur).sub(j.prev); headOf(j, _a);
      _b.copy(j.axis).transformDirection(j.b.matrixWorld);
      j.cur.copy(_a).addScaledVector(_b, j.len0 * ms); j.prev.copy(j.cur).sub(_d);
    }
  }

  return {
    count: chains.reduce((n, c) => n + c.joints.length, 0),
    chains: chains.length,
    costume, hasFox,
    reset() { needReset = true; },
    /**
     * Debug (tests only): per kind, tip stats relative to the hips joint: { kind: { up: max tip height above the hips (m),
     * low: mean tip height, spread: mean horizontal tip distance from the hips (m), back: max tip distance behind the hips
     * along the body's backward axis while higher than the hips (over-the-back), n } }.
     */
    tipStats(hips, fwd) {
      const o = {};
      const hp = hips.getWorldPosition(new THREE.Vector3());
      for (const c of chains) {
        const t = c.joints[c.joints.length - 1].cur;
        const r = o[c.kind] || (o[c.kind] = { up: -9, low: 0, spread: 0, back: 0, n: 0 });
        const dy = t.y - hp.y, dx = t.x - hp.x, dz = t.z - hp.z;
        r.up = Math.max(r.up, dy); r.low += dy; r.spread += Math.hypot(dx, dz); r.n++;
        const bk = -(dx * fwd.x + dz * fwd.z);
        if (dy > 0) r.back = Math.max(r.back, bk);
      }
      for (const k in o) { o[k].low /= o[k].n; o[k].spread /= o[k].n; }
      return o;
    },
    _dbg: { legs: () => legs, chains: () => chains },
    /** Kinds present, for debugging: { sleeve: n, skirt: n, … } */
    kinds() { const o = {}; for (const c of chains) o[c.kind] = (o[c.kind] || 0) + 1; return o; },
    update(dt, o = {}) {
      if (!(dt > 0)) return;
      model.updateMatrixWorld(true);
      ms = colLen(model.matrixWorld) || ms0;
      _a.setFromMatrixPosition(model.matrixWorld);
      const lod = o.lod || 0;
      if (needReset || _a.distanceToSquared(lastRoot) > 2.25) {
        lastRoot.copy(_a); vel.set(0, 0, 0); velPrev.set(0, 0, 0); acc.set(0, 0, 0); yaw0 = null; spin = 0;
        snap(); needReset = false; acc60 = 0;
        return;
      }
      // body spin: carry part of a fast turn into the tails (about the hips' vertical), more the faster it is
      if (!OLD) {
        const e = model.matrixWorld.elements;
        const yw = Math.atan2(e[8], e[10]);
        if (yaw0 === null) yaw0 = yw;
        let dy = yw - yaw0; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
        yaw0 = yw;
        spin += (dy / dt - spin) * (1 - Math.exp(-dt * 12));
        const rate = Math.abs(dy / dt);
        const carry = Math.min(0.95, 0.3 + 0.65 * Math.min(1, Math.max(0, (rate - 2) / 6)));
        if (Math.abs(dy) > 1e-4 && hipsB) {
          _hp.setFromMatrixPosition(hipsB.matrixWorld);
          const an = dy * carry, cs = Math.cos(an), sn = Math.sin(an);
          for (const ch of chains) for (const j of ch.joints) for (const v of [j.cur, j.prev]) {
            const x = v.x - _hp.x, z = v.z - _hp.z;
            v.x = _hp.x + x * cs + z * sn; v.z = _hp.z - x * sn + z * cs;
          }
        }
      }
      // carry the root translation into the tails; turn it into velocity / acceleration for the forces
      _b.copy(_a).sub(lastRoot);
      lastRoot.copy(_a);
      for (const ch of chains) for (const j of ch.joints) { j.cur.add(_b); j.prev.add(_b); }
      const vk = 1 - Math.exp(-dt * 14);
      velPrev.copy(vel);
      vel.lerp(_b.multiplyScalar(1 / dt), vk);
      if (o.vel) vel.copy(o.vel);
      _c.copy(vel).sub(velPrev).multiplyScalar(1 / dt);
      if (_c.length() > 40) _c.setLength(40);
      acc.lerp(_c, 1 - Math.exp(-dt * 10));
      if (lod >= 2) { step(STEP, o, 2, true); acc60 = 0; return; }
      const h = lod === 1 ? STEP * 2 : STEP;
      acc60 = Math.min(acc60 + dt, h * 3);
      let n = 0;
      while (acc60 >= h) { step(h, o, 0, lod === 0); acc60 -= h; n++; }
      if (!n) for (const ch of chains) for (const j of ch.joints) { j.b.updateMatrix(); j.b.matrixWorld.multiplyMatrices(j.b.parent.matrixWorld, j.b.matrix); }
    },
  };
}
