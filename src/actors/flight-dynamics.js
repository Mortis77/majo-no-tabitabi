// Secondary acting and cloth on the side-saddle flight. The original clip still determines
// the pelvis, legs and the two grips. Air loads and contact operate in the actual broom frame.
import { Vector3, Quaternion, Euler, Matrix4 } from 'three';
import { shaftAt, shaftProfile } from './broom-contact.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const vec = () => new Vector3(),
  quat = () => new Quaternion();
function spring() {
  return { x: 0, v: 0 };
}
// Closed-form critically damped spring. A dropped frame cannot build extra energy.
function follow(s, target, w, dt) {
  const d = s.x - target,
    b = s.v + w * d,
    e = Math.exp(-w * dt);
  s.x = target + (d + b * dt) * e;
  s.v = (s.v - w * b * dt) * e;
  return s.x;
}
export function createFlightDynamics(model, bones, solveArm) {
  const panels = [],
    parents = new Map();
  model.traverse((node) => {
    const p = node.userData.flightPanel;
    if (!p) return;
    if (!parents.has(node.parent)) parents.set(node.parent, quat());
    panels.push({
      node,
      p,
      center: vec().set(p.cx / p.n, p.cy / p.n, p.cz / p.n),
      normal: p.normal ? vec().fromArray(p.normal) : null,
      invQ: parents.get(node.parent),
    });
  });
  if (!panels.length || !bones.upperChest) return null;
  const arms = ['L', 'R'].map((s) => ({
    upper: bones['arm' + s],
    fore: bones['fore' + s],
    hand: bones['hand' + s],
    pos: vec(),
    rot: quat(),
  }));
  const spine = bones.spine,
    chest = bones.upperChest,
    neck = bones.neck;
  const restChest = quat(),
    restSpine = quat(),
    goalChest = quat(),
    goalSpine = quat(),
    q = quat(),
    euler = new Euler();
  const pressure = spring(),
    turn = spring(),
    climb = spring(),
    surge = spring(),
    cross = spring(),
    warm = spring();
  const allSprings = [pressure, turn, climb, surge, cross, warm];
  const previous = vec(),
    wind = vec(),
    local = vec(),
    world = vec(),
    center = vec(),
    test = vec(),
    qSeat = quat(),
    seatInv = new Matrix4();
  let active = false,
    age = 0,
    phase = 0,
    lastSpeed = 0,
    windTime = 0,
    lastGripError = 0;
  const metrics = { panels: panels.length, seconds: 0, gripError: 0, maxCloth: 0, turn: 0, pressure: 0 };
  function clear() {
    active = false;
    age = phase = windTime = lastGripError = 0;
    for (const s of allSprings) s.x = s.v = 0;
    for (const { node } of panels) node.position.set(0, 0, 0);
    metrics.seconds = metrics.maxCloth = metrics.gripError = metrics.turn = metrics.pressure = metrics.torsoWeight = 0;
  }
  function pose(weight) {
    metrics.torsoWeight = weight;
    spine.quaternion.copy(restSpine).slerp(goalSpine, weight);
    chest.quaternion.copy(restChest).slerp(goalChest, weight);
    spine.updateWorldMatrix(true, true);
  }
  function reachable() {
    for (const a of arms) {
      a.upper.getWorldPosition(center);
      if (center.distanceTo(a.pos) > a.reach + 0.0004) return false;
    }
    return true;
  }
  function body(amount, cameraSide) {
    for (const a of arms) {
      a.hand.getWorldPosition(a.pos);
      a.hand.getWorldQuaternion(a.rot);
      a.upper.getWorldPosition(center);
      a.fore.getWorldPosition(test);
      a.reach = Math.max(center.distanceTo(a.pos), center.distanceTo(test) + test.distanceTo(a.pos) - 0.001);
    }
    // The shoulders absorb acceleration, lean into a bank and drop slightly on a long cruise.
    // The head anticipates the turn, then occasionally looks along the horizon during long flights.
    const settle = smooth(2.3, 11, age),
      idle = settle * Math.sin(age * 0.69 + 0.24 * Math.sin(age * 0.31));
    const checkHorizon = settle * Math.pow(0.5 + 0.5 * Math.sin(age * 0.55 - 0.9), 3) * Math.sin(age * 0.31);
    const lean = amount * (0.085 * pressure.x + 0.073 * surge.x - 0.095 * climb.x - 0.035 * settle + 0.018 * idle);
    const yaw = amount * (0.12 * turn.x + 0.025 * idle),
      bank = amount * (-0.108 * turn.x + 0.016 * idle);
    restSpine.copy(spine.quaternion);
    restChest.copy(chest.quaternion);
    goalSpine.copy(restSpine).multiply(q.setFromEuler(euler.set(lean * 0.55, yaw * 0.34, bank * 0.55)));
    goalChest.copy(restChest).multiply(q.setFromEuler(euler.set(lean * 0.65, yaw * 0.72, bank * 0.58)));
    pose(1);
    if (!reachable()) {
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 4; i++) {
        const m = (lo + hi) / 2;
        pose(m);
        if (reachable()) lo = m;
        else hi = m;
      }
      pose(lo);
    }
    for (const a of arms) {
      solveArm(a.upper, a.fore, a.hand, a.pos);
      a.hand.parent.getWorldQuaternion(q).invert();
      a.hand.quaternion.copy(q.multiply(a.rot));
      a.hand.getWorldPosition(test);
      lastGripError = Math.max(lastGripError, test.distanceTo(a.pos));
    }
    neck.quaternion.multiply(
      q.setFromEuler(
        euler.set(
          amount * (-0.095 * climb.x - 0.038 * surge.x + 0.014 * idle),
          amount * (0.2 * turn.x + 0.12 * checkHorizon + 0.025 * cameraSide),
          amount * (0.058 * turn.x - 0.014 * idle),
        ),
      ),
    );
  }
  function cloth(seat, amount) {
    seat.updateWorldMatrix(true, false);
    qSeat.setFromRotationMatrix(sideMatrix.extractRotation(seat.matrixWorld));
    seatInv.copy(seat.matrixWorld).invert();
    for (const [node, inverse] of parents) node.getWorldQuaternion(inverse).invert();
    let maxCloth = 0;
    for (const { node, p, center: rest, invQ, normal } of panels) {
      const side = p.side,
        fore = p.fore;
      const wave =
        Math.sin(phase + side * 0.88 + fore * 0.32) + 0.38 * Math.sin(phase * 1.63 + side * 1.6 - fore * 0.78);
      const stream = pressure.x,
        pulse = stream * wave,
        sway = cross.x + turn.x * 0.36;
      // Downstream displacement is deliberately one-sided for coat tails. Ruffles open
      // radially away from the body. Their sewn edges have zero painted influence.
      switch (p.kind) {
        case 'coat':
        case 'shirt': {
          const k = p.kind === 'coat' ? 1 : 0.78;
          local.set(
            side * (0.028 * stream + 0.008 * pulse) + 0.024 * sway,
            0.052 * stream + 0.013 * pulse + 0.014 * surge.x,
            -0.097 * stream + 0.013 * pulse,
          );
          if (fore > 0) local.z *= 0.32;
          local.multiplyScalar(k);
          break;
        }
        case 'cuff':
          local.set(
            side * (0.011 * stream + 0.004 * pulse) + 0.01 * sway,
            0.016 * stream + 0.009 * pulse,
            -0.039 * stream + 0.008 * pulse,
          );
          break;
        case 'tie':
          local.set(
            side * 0.006 * stream + 0.011 * sway,
            0.011 * stream + 0.007 * pulse,
            -0.034 * stream + 0.008 * pulse,
          );
          break;
        case 'brim':
          local.set(
            0.002 * sway,
            0.009 * stream - fore * 0.009 * stream + side * 0.008 * sway + 0.0035 * pulse,
            -0.006 * stream,
          );
          break;
        case 'tip':
          local.set(0.022 * sway, 0.02 * stream + 0.007 * pulse, -0.039 * stream + 0.006 * pulse);
          break;
        case 'bow':
          local.set(0.012 * sway, 0.014 * stream + 0.006 * pulse + 0.006 * surge.x, -0.018 * stream);
          break;
        default: {
          local.set(0.004 * sway, 0.012 * stream + 0.005 * pulse + 0.004 * surge.x + 0.003 * climb.x, -0.007 * stream);
          if (p.kind === 'waist') local.multiplyScalar(1.22);
          if (p.kind === 'skirt') local.multiplyScalar(1.62);
          break;
        }
      }
      local.multiplyScalar(amount * p.scale);
      world.copy(local).applyQuaternion(qSeat);
      // Keep the sampled trailing panel on its original side of the physical shaft.
      if (p.kind === 'coat' || p.kind === 'shirt' || p.kind === 'cuff') {
        center.copy(rest);
        node.parent.localToWorld(center);
        center.applyMatrix4(seatInv);
        if (center.z > shaftProfile[0].z - 0.04 && center.z < shaftProfile.at(-1).z + 0.04) {
          test.copy(center).add(local);
          const h = shaftAt(test.z),
            dx = center.x - h.x,
            dy = center.y - h.y;
          const dist = Math.hypot(dx, dy),
            radius = Math.min(dist, h.r + 0.018);
          if (dist > 0.001 && dist < 0.22) {
            const projected = ((test.x - h.x) * dx + (test.y - h.y) * dy) / dist;
            if (projected < radius) {
              local.x += ((radius - projected) * dx) / dist;
              local.y += ((radius - projected) * dy) / dist;
              world.copy(local).applyQuaternion(qSeat);
            }
          }
        }
      }
      node.position.copy(world).applyQuaternion(invQ);
      if (normal) {
        const opening = (p.kind === 'bow' ? 0.005 : 0.011) * (p.kind === 'skirt' ? 1.35 : 1);
        const minOut = amount * p.scale * Math.max(0, opening * stream + 0.0025 * pulse + 0.002 * surge.x);
        const outside = node.position.dot(normal);
        if (outside < minOut) node.position.addScaledVector(normal, minOut - outside);
      }
      maxCloth = Math.max(maxCloth, node.position.length());
    }
    metrics.maxCloth = maxCloth;
  }
  const sideMatrix = new Matrix4();
  return {
    metrics,
    clear,
    update(dt, player, seat, getWind) {
      if (!player?.onBroom || !seat) {
        if (active) clear();
        return;
      }
      const B = player.broom,
        speed = B.speed;
      if (!Number.isFinite(dt) || dt < 0 || (!active && dt === 0)) return;
      if (!active || dt > 0.23 || previous.distanceToSquared(player.pos) > (7 + Math.abs(speed) * dt) ** 2) {
        clear();
        active = true;
        lastSpeed = speed;
        previous.copy(player.pos);
      }
      dt = Math.min(dt, 0.1);
      previous.copy(player.pos);
      age += dt;
      windTime -= dt;
      if (windTime <= 0) {
        wind.set(0, 0, 0);
        getWind?.(player.pos, wind);
        windTime = 0.08;
      }
      const sn = Math.sin(B.heading),
        cs = Math.cos(B.heading);
      const downstream = clamp((speed - (wind.x * sn + wind.z * cs)) / 29, 0, 1.15);
      follow(pressure, downstream, 4.3, dt);
      follow(turn, clamp(-B.yawRate / 1.45, -1, 1), 5.6, dt);
      follow(climb, clamp(B.vy / 10, -1, 1), 4.8, dt);
      if (dt > 0) {
        follow(surge, clamp((speed - lastSpeed) / (dt * 14), -1, 1), 5.3, dt);
        lastSpeed = speed;
      }
      follow(cross, clamp((wind.x * cs - wind.z * sn) / 8, -1, 1), 4, dt);
      follow(warm, 1, 7.5, dt);
      phase += dt * (3.5 + pressure.x * 5.1);
      const amount = warm.x * smooth(0.08, 0.45, B.appear);
      lastGripError = 0;
      body(amount, cross.x);
      cloth(seat, amount);
      Object.assign(metrics, { seconds: age, gripError: lastGripError, turn: turn.x, pressure: pressure.x });
    },
  };
}
