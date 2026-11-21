// The short pleated skirt hangs from the waist. Its ten panels lift just far enough to clear the thighs,
// instead of rotating the lip through the full angle of the hip joint in a high step.
import * as THREE from 'three';
import { shaftAt } from './broom-contact.js';

const TAU = Math.PI * 2,
  sectors = 10;
export function createTravellerCloth(model, bones) {
  let marked = false,
    ridingHem;
  model.traverse((o) => {
    if (o.userData.travellerPanelFit === 1) {
      marked = true;
      ridingHem = o.userData.travellerRidingHem;
    }
  });
  if (!marked || !bones.hips || !bones.thighL || !bones.thighR || !bones.kneeL || !bones.kneeR) return null;
  const hip = bones.hips,
    v = new THREE.Vector3();
  const hipOrientation = new THREE.Quaternion(),
    parentOrientation = new THREE.Quaternion(),
    jointPosition = new THREE.Vector3();
  const thighs = [
    [bones.thighL, bones.kneeL],
    [bones.thighR, bones.kneeR],
  ];
  const localLegs = thighs.map(() => [new THREE.Vector3(), new THREE.Vector3()]);
  const panels = [];
  for (let i = 0; i < sectors; i++) {
    const node = model.getObjectByName('J_Sec_Hakama_' + (i + 1) + '_01');
    if (!node) return null;
    const a = ((i + 0.5) * TAU) / sectors,
      radialX = Math.sin(a),
      radialZ = Math.cos(a);
    const rest = hip.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
    const restOrientation = hip
      .getWorldQuaternion(new THREE.Quaternion())
      .invert()
      .multiply(node.getWorldQuaternion(new THREE.Quaternion()));
    const hem = ridingHem && model.getObjectByName('J_Sec_Hakama_' + (i + 1) + '_02');
    panels.push({
      hem,
      hemRest: hem?.position.clone(),
      hemOrientation: hem?.quaternion.clone(),
      lift: 0,
      node,
      radialX,
      radialZ,
      rest,
      restOrientation,
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      pivot: new THREE.Vector3(0.113 * radialX, 0.113, 0.093 * radialZ),
      axis: new THREE.Vector3(-radialZ, 0, radialX),
      angle: 0,
      bend: new THREE.Quaternion(),
      normal: new THREE.Vector3(),
      offset: 0,
      previousOffset: 0,
    });
  }
  const length = 0.323,
    baseAngle = 0.335;
  function support(p, dx, dz) {
    let angle = baseAngle;
    for (const [thigh, knee] of localLegs) {
      for (let j = 0; j <= 12; j++) {
        const f = j / 12;
        v.lerpVectors(thigh, knee, f).sub(p.pivot);
        const across = Math.abs(v.x * dz - v.z * dx);
        const radius = 0.094 - 0.024 * f; // original thigh tapers to the kneecap
        if (across >= radius) continue;
        const r = Math.sqrt(radius * radius - across * across);
        const depth = v.x * dx + v.z * dz,
          down = -v.y,
          d = Math.hypot(depth, down);
        if (d - r > length || depth + r <= 0 || d < 0.01) continue;
        const tangent = Math.atan2(depth, down) + Math.asin(Math.min(0.98, r / d));
        angle = Math.max(angle, tangent);
      }
    }
    return angle;
  }
  // Vertices along the inside of the pleats form a small clearance cage. Test interpolation between neighbouring
  // bones as well: a knee can sit between two clear bone origins, particularly on a broom.
  const cage = [];
  // Inner pleat profile in bind-space metres: height, half-width, front depth, back depth.
  const rows = [
    [1.006, 0.112, 0.088, 0.085],
    [0.989, 0.121, 0.097, 0.094],
    [0.952, 0.138, 0.11, 0.116],
    [0.91, 0.155, 0.125, 0.136],
    [0.857, 0.172, 0.149, 0.154],
    [0.8, 0.19, 0.177, 0.178],
    [0.746, 0.208, 0.202, 0.194],
    [0.694, 0.221, 0.213, 0.209],
  ];
  for (const [height, rx, front, back] of rows) {
    const t = Math.min(1, Math.max(0, (1.005 - height) / 0.071));
    for (let i = 0; i < 50; i++) {
      const a = (i * TAU) / 50,
        c = Math.cos(a),
        sector = (i * sectors) / 50 - 0.5,
        left = Math.floor(sector);
      const xyz = new THREE.Vector3(rx * Math.sin(a), height - 0.887407, c * (c > 0 ? front : back) - 0.00549);
      cage.push({
        xyz,
        t: 0.3 + 0.7 * t * t * (3 - 2 * t),
        left: (left + 10) % 10,
        right: (left + 11) % 10,
        w: sector - left,
      });
    }
  }
  const leftPoint = new THREE.Vector3(),
    rightPoint = new THREE.Vector3(),
    q = new THREE.Vector3(),
    n = new THREE.Vector3(),
    axis = new THREE.Vector3(),
    radialDifference = new THREE.Vector3();
  const next = new Float32Array(sectors);
  // The seat supports only the cut edges which cross the handle. Hem joints carry the change below the waist.
  const rim = (ridingHem || []).map(([x, y, z]) => {
    const a = (Math.atan2(x, z) + TAU) % TAU,
      sector = (a * sectors) / TAU - 0.5,
      left = Math.floor(sector);
    return {
      xyz: new THREE.Vector3(x, y - 0.887407, z - 0.00549),
      left: (left + 10) % 10,
      right: (left + 11) % 10,
      w: sector - left,
    };
  });
  const seatFromHip = new THREE.Matrix4(),
    seatUp = new THREE.Vector3(),
    hemWorld = new THREE.Vector3();
  function drapeOnShaft(seat, dt) {
    next.fill(0);
    if (seat) {
      seat.updateWorldMatrix(true, false);
      seatFromHip.copy(seat.matrixWorld).invert().multiply(hip.matrixWorld);
      for (const c of rim) {
        moved(c.xyz, panels[c.left], leftPoint);
        moved(c.xyz, panels[c.right], rightPoint);
        q.copy(leftPoint).lerp(rightPoint, c.w).applyMatrix4(seatFromHip);
        const shaft = shaftAt(q.z),
          d = Math.abs(q.x - shaft.x);
        if (d > shaft.r + 0.035) continue;
        // Give both sides of an interpolated pleat enough room around the solid shaft.
        const amount = Math.max(0, Math.min(0.2, shaft.y + shaft.r + 0.012 - q.y));
        if (c.w < 0.92) next[c.left] = Math.max(next[c.left], amount);
        if (c.w > 0.08) next[c.right] = Math.max(next[c.right], amount);
      }
      seatUp.set(0, 1, 0).transformDirection(seat.matrixWorld);
    }
    for (let i = 0; i < sectors; i++) {
      const p = panels[i];
      if (!p.hem) continue;
      p.lift = Math.max(next[i], p.lift * Math.exp(-dt * 20));
      p.hem.position.copy(p.hemRest);
      p.hem.quaternion.copy(p.hemOrientation);
      if (p.lift > 0.0002) {
        hemWorld.copy(p.hemRest);
        p.node.localToWorld(hemWorld);
        hemWorld.addScaledVector(seatUp, p.lift);
        p.hem.position.copy(p.node.worldToLocal(hemWorld));
      }
      p.hem.updateWorldMatrix(false, true);
    }
  }
  function moved(point, p, out) {
    return out.copy(point).sub(p.pivot).applyQuaternion(p.bend).add(p.pivot).addScaledVector(p.normal, p.offset);
  }
  function separate() {
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < sectors; i++) next[i] = panels[i].offset;
      let touched = false;
      for (const c of cage) {
        const a = panels[c.left],
          b = panels[c.right];
        moved(c.xyz, a, leftPoint);
        moved(c.xyz, b, rightPoint);
        q.copy(c.xyz).lerp(leftPoint.lerp(rightPoint, c.w), c.t);
        n.copy(a.normal).lerp(b.normal, c.w).normalize();
        for (const [u, k] of localLegs) {
          axis.subVectors(k, u);
          const t = Math.max(0, Math.min(1, radialDifference.subVectors(q, u).dot(axis) / axis.lengthSq()));
          radialDifference.addScaledVector(axis, -t);
          const r = 0.088 - 0.021 * t,
            d = radialDifference.lengthSq();
          if (d >= r * r) continue;
          const dot = radialDifference.dot(n),
            step = Math.min(0.085, (-dot + Math.sqrt(Math.max(0, dot * dot + r * r - d)) + 0.004) / c.t);
          if (c.w < 0.88) next[c.left] = Math.max(next[c.left], Math.min(0.19, a.offset + step));
          if (c.w > 0.12) next[c.right] = Math.max(next[c.right], Math.min(0.19, b.offset + step));
          touched = true;
        }
      }
      if (!touched) break;
      for (let j = 0; j < sectors; j++)
        panels[j].offset = Math.max(next[j], next[(j + 9) % 10] - 0.06, next[(j + 1) % 10] - 0.06);
    }
  }
  return {
    reset() {
      for (const p of panels) {
        if (p.hem) {
          p.hem.position.copy(p.hemRest);
          p.hem.quaternion.copy(p.hemOrientation);
        }
        p.node.position.copy(p.position);
        p.node.quaternion.copy(p.quaternion);
      }
    },
    update(dt, seat) {
      hip.updateWorldMatrix(true, false);
      hip.getWorldQuaternion(hipOrientation);
      for (let i = 0; i < thighs.length; i++)
        for (let j = 0; j < 2; j++) {
          const b = thighs[i][j],
            q = localLegs[i][j];
          b.getWorldPosition(q);
          hip.worldToLocal(q);
        }
      for (const p of panels) {
        // Sample the two sides of the same pleat as well as its centre, so a narrow knee cannot slip between roots.
        const a = Math.atan2(p.radialX, p.radialZ),
          half = 0.3;
        const wanted = Math.min(
          1.1,
          Math.max(
            support(p, p.radialX, p.radialZ),
            support(p, Math.sin(a - half), Math.cos(a - half)),
            support(p, Math.sin(a + half), Math.cos(a + half)),
          ) - baseAngle,
        );
        p.angle = wanted >= p.angle ? wanted : p.angle + (wanted - p.angle) * (1 - Math.exp(-17 * dt));
        p.bend.setFromAxisAngle(p.axis, p.angle);
        p.normal.set(p.radialX * Math.cos(p.angle), Math.sin(p.angle), p.radialZ * Math.cos(p.angle));
        p.offset = 0;
      }
      separate();
      for (const p of panels) {
        // Fabric clears an approaching leg immediately and settles back over several frames.
        p.offset = Math.max(p.offset, p.previousOffset * Math.exp(-18 * dt));
        p.previousOffset = p.offset;
        moved(p.rest, p, jointPosition);
        hip.localToWorld(jointPosition);
        p.node.parent.worldToLocal(jointPosition);
        p.node.position.copy(jointPosition);
        p.node.parent.getWorldQuaternion(parentOrientation);
        p.node.quaternion
          .copy(parentOrientation.invert())
          .multiply(hipOrientation)
          .multiply(p.bend)
          .multiply(p.restOrientation);
        p.node.updateWorldMatrix(false, true);
      }
      if (rim.length) drapeOnShaft(seat, dt);
    },
  };
}
