// Residents can fly, so their street clothes share practical boots, capes and small
// travelling hats. Three batched parts keep a strolling pair of legs independent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../../core/game.js';
import { box, cyl, cone, sphere } from '../../core/geo.js';
import { mat, beam, M } from './kit.js';
import { CITY } from '../../data/journey-map.js';
function painted(group) {
  const bits = [];
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (!o.isMesh) return;
    const b = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    b.applyMatrix4(o.matrixWorld);
    b.deleteAttribute('uv');
    const c = o.material.color,
      a = new Float32Array(b.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) {
      a[i] = c.r;
      a[i + 1] = c.g;
      a[i + 2] = c.b;
    }
    b.setAttribute('color', new THREE.BufferAttribute(a, 3));
    bits.push(b);
  });
  const g = mergeGeometries(bits);
  for (const b of bits) b.dispose();
  const m = M.plaster().clone();
  m.color.set(0xffffff);
  m.vertexColors = true;
  return new THREE.Mesh(g, m);
}
function person(seed) {
  const coat = mat.cloth([0x525d77, 0x827663, 0x646668, 0x7d5764, 0x52746b][seed % 5]),
    darker = mat.cloth([0x414758, 0x6a5053, 0x56616b][seed % 3]),
    leather = mat.wood(0x694b3d),
    hair = mat.paint([0x67472f, 0x4e403c, 0xa78058, 0x635560][seed % 4]),
    face = mat.plaster(0xe6bea0),
    brass = mat.metal(0xc09b59);
  const g = new THREE.Group();
  g.add(
    cyl(0.14, 0.225, 0.62, coat, 0, 0.915, 0, 9),
    cyl(0.17, 0.251, 0.32, darker, 0, 1.22, -0.025, 9),
    cyl(0.125, 0.13, 0.07, leather, 0, 1.03, 0.006, 8)
  );
  g.add(sphere(0.153, face, 0, 1.545, 0.034, 10, 8), sphere(0.162, hair, 0, 1.6, -0.014, 10, 7));
  for (const s of [-1, 1]) {
    const h = sphere(0.083, hair, s * 0.121, 1.46, -0.018, 8, 6);
    h.scale.set(0.67, 1.64, 0.7);
    g.add(h);
    g.add(
      beam(0.14 * s, 1.27, 0, 0.18 * s, 1.0, 0.045, 0.1, 0.115, coat),
      beam(0.18 * s, 1.0, 0.045, 0.2 * s, 0.9, 0.155, 0.085, 0.085, darker),
      sphere(0.046, face, 0.2 * s, 0.9, 0.155, 7, 5)
    );
  }
  const brim = cyl(0.28 + (seed % 3) * 0.035, 0.31, 0.046, coat, 0, 1.68, 0, 12);
  brim.rotation.z = (seed % 2 ? 1 : -1) * 0.1;
  g.add(brim, cyl(0.065, 0.165, 0.24, coat, 0, 1.806, 0, 10), cyl(0.151, 0.158, 0.056, leather, 0, 1.72, 0.004, 10));
  const tip = cone(0.074, 0.17, coat, -0.035, 1.98, -0.013, 8);
  tip.rotation.z = 0.43;
  g.add(tip);
  g.add(
    box(0.12, 0.17, 0.12, leather, 0.212, 0.91, -0.034),
    beam(-0.13, 1.32, 0.11, 0.17, 0.97, 0.12, 0.045, 0.037, leather),
    sphere(0.035, brass, 0.03, 1.3, 0.16, 6, 5)
  );
  if (seed % 3 === 0) {
    g.add(cyl(0.027, 0.035, 1.37, leather, 0.23, 0.81, 0.17, 7), sphere(0.08, brass, 0.23, 1.48, 0.17, 7, 5));
  }
  const whole = new THREE.Group(),
    body = painted(g);
  whole.add(body);
  const legs = [];
  for (const side of [-1, 1]) {
    const l = new THREE.Group();
    l.add(
      cyl(0.069, 0.06, 0.35, darker, 0, -0.18, 0, 8),
      cyl(0.071, 0.075, 0.29, leather, 0, -0.465, 0, 8),
      box(0.14, 0.1, 0.21, leather, 0, -0.592, 0.042)
    );
    const leg = painted(l);
    leg.position.set(side * 0.096, 0.64, 0);
    whole.add(leg);
    legs.push(leg);
  }
  return { whole, body, legs };
}
export function mageResidents(ctx) {
  const entries = [
    [-8, 53, 0.1, 5.1],
    [4, 32, -0.6, 3.7],
    [10, 16, 2.0, 0],
    [-7, 12, 2.4, 0],
    [29, 19, -0.3, 3.7],
    [-24, -16, -2.5, 3.0],
    [12, -12, 0.2, 3.0],
    [-53, -15, -0.8, 3.2]
  ];
  const list = entries.map(([x, z, heading, range], i) => {
    const a = person(i);
    a.whole.name = 'MageResident_' + i;
    G.scene.add(a.whole);
    return { ...a, x: CITY.x + x, z: CITY.z + z, heading, range, i };
  });
  const center = new THREE.Vector3();
  ctx.tick((_dt, time) => {
    const p = G.player?.pos || G.camera.position;
    for (const a of list) {
      const { x, z, heading, range, i } = a,
        d = Math.hypot(x - p.x, z - p.z);
      a.whole.visible = d < 88;
      if (!a.whole.visible) continue;
      const f = Math.sin(time * 0.18 + i),
        walk = Math.cos(time * 0.18 + i),
        px = x + Math.sin(heading) * f * range,
        pz = z + Math.cos(heading) * f * range;
      center.set(px, CITY.y, pz);
      G.world.resolveCollisions(center, 0.3, 1.72);
      a.whole.position.copy(center);
      a.whole.rotation.y = range ? heading + (walk < 0 ? Math.PI : 0) : heading + 0.08 * Math.sin(time * 0.66 + i);
      const stride = range ? Math.sin(time * 3.8 + i) * 0.37 * Math.abs(walk) : 0;
      a.legs[0].rotation.x = stride;
      a.legs[1].rotation.x = -stride;
      a.body.position.y = 0.011 * Math.sin(time * 2.0 + i);
    }
  });
}
