// World-space slipstream. Only living ground cover supplies fragments. The
// stationary stems sample recent passes; freed leaves carry momentum and tumble.
import * as THREE from 'three';
import { bellPaving } from '../../data/bellcrown.js';

export function createSlipstream(G) {
  const capacity = G.quality?.name === 'low' ? 60 : 112;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, 0, -0.5, -0.29, 0.075, -0.1, 0, 0.16, 0.11, 0.27, 0.07, -0.09, 0.02, 0.1, 0.5],
      3
    )
  );
  geo.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3]);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.name = 'flora:airborne-leaves';
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(mesh);
  const pool = Array.from({ length: capacity }, () => ({
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    age: 3,
    life: 0
  }));
  const pose = new THREE.Object3D(),
    color = new THREE.Color(),
    last = new THREE.Vector3();
  const leaves = [0x729859, 0x8aa958, 0x698752, 0xa9b66e];
  const petals = [0xead8b0, 0xe7b3ce, 0xe4bd70];
  let cursor = 0,
    credit = 0,
    elapsed = 0,
    trailSlot = 0,
    sampled = false,
    airborne = false;
  const terrain = G.world;
  const trail = Array.from({ length: 6 }, () => new THREE.Vector4());
  function spawn(x, z, dx, dz, speed, force) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const spread = side * (0.2 + Math.random() * 1.1);
    x += dz * spread;
    z -= dx * spread;
    if (
      terrain.isWater(x, z) ||
      bellPaving(x, z) ||
      terrain.roadDist(x, z) < 3.7 ||
      terrain.isReserved?.(x, z, 0)
    )
      return;
    const ground = terrain.heightAt(x, z);
    if (ground < 0.45 || Math.abs(terrain.heightAt(x + 0.6, z) - ground) > 0.43) return;
    const q = pool[cursor];
    cursor = (cursor + 1) % capacity;
    q.age = 0;
    q.life = 1.35 + Math.random() * 0.7;
    q.ground = ground;
    q.spin = side * (3 + Math.random() * 6);
    q.petal = Math.random() < 0.19;
    q.size = q.petal ? 0.045 + Math.random() * 0.038 : 0.11 + Math.random() * 0.115;
    q.phase = Math.random() * 6.28;
    const palette = q.petal ? petals : leaves;
    q.color = palette[Math.floor(Math.random() * palette.length)];
    q.side = side;
    q.pos.set(x, ground + 0.28 + Math.random() * 0.27, z);
    q.vel.set(
      dx * speed * 0.14 + dz * side * (1 + force * 2.1),
      1.4 + 2.5 * force + Math.random(),
      dz * speed * 0.14 - dx * side * (1 + force * 2.1)
    );
  }
  function update(dt, wind) {
    const p = G.player;
    if (!p) return;
    const pos = p.pos,
      flying = p.state === 'broom',
      speed = Math.hypot(p.vel.x, p.vel.z);
    const dx = p.vel.x / Math.max(0.01, speed),
      dz = p.vel.z / Math.max(0.01, speed);
    const jump = sampled && pos.distanceToSquared(last) > 18 ** 2;
    if (jump) {
      for (const q of pool) q.age = q.life;
      for (const v of trail) v.w = 0;
      credit = 0;
    }
    const height = flying ? pos.y - terrain.heightAt(pos.x, pos.z) : 20;
    let force =
      flying && !terrain.isWater(pos.x, pos.z)
        ? (1 - THREE.MathUtils.smoothstep(height, 0.45, 4.3)) * THREE.MathUtils.smoothstep(speed, 2, 17)
        : 0;
    if (force && (bellPaving(pos.x, pos.z) || terrain.roadDist(pos.x, pos.z) < 3.3)) force = 0;
    for (const v of trail) v.w = Math.max(0, v.w - dt * 0.88);
    elapsed += dt;
    if (force > 0.02 && elapsed > 0.073) {
      trail[trailSlot].set(pos.x, pos.z, 1.3 + 1.5 * force, force);
      trailSlot = (trailSlot + 1) % trail.length;
      elapsed = 0;
    }
    if (force > 0.02 && sampled && !jump && airborne) {
      credit += Math.min(3, pos.distanceTo(last)) * force * 2.0;
      const count = Math.min(9, Math.floor(credit));
      credit -= count;
      for (let i = 0; i < count; i++) {
        const f = (i + Math.random()) / count;
        spawn(
          THREE.MathUtils.lerp(last.x, pos.x, f),
          THREE.MathUtils.lerp(last.z, pos.z, f),
          dx,
          dz,
          speed,
          force
        );
      }
    } else credit = 0;
    last.copy(pos);
    sampled = true;
    airborne = flying;
    let visible = 0;
    for (const q of pool) {
      if (q.age >= q.life) continue;
      q.age += dt;
      const drag = 1 - Math.exp(-1.8 * dt);
      q.vel.x += (wind.x * 0.3 - q.vel.x) * drag;
      q.vel.z += (wind.z * 0.3 - q.vel.z) * drag;
      q.vel.y = Math.max(q.petal ? -1.25 : -1.9, q.vel.y - (q.petal ? 3.9 : 4.85) * dt);
      q.pos.addScaledVector(q.vel, dt);
      const floor = terrain.heightAt(q.pos.x, q.pos.z) + 0.025;
      if (q.pos.y < floor) {
        q.pos.y = floor;
        q.age = Math.max(q.age, q.life - 0.26);
        q.vel.multiplyScalar(0.4);
      }
      pose.position.copy(q.pos);
      pose.rotation.set(
        q.phase + q.age * q.spin,
        q.phase + q.age * q.side * 2,
        0.45 * Math.sin(q.age * 6 + q.phase)
      );
      const scale = q.size * (1 - THREE.MathUtils.smoothstep(q.age, q.life - 0.32, q.life));
      pose.scale.set(scale * (q.petal ? 1.5 : 0.78), scale, scale);
      pose.updateMatrix();
      mesh.setMatrixAt(visible, pose.matrix);
      mesh.setColorAt(visible++, color.setHex(q.color));
    }
    mesh.count = visible;
    mesh.visible = visible > 0;
    if (visible) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }
  return { mesh, trail, update };
}
