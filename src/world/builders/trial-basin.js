// The old mill crossing stands on the two parts of a rock shoulder. A dry gorge
// is visible under its arch before the trial. Afterwards it is open navigable water.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { box } from '../../core/geo.js';
import { Site, mat } from './kit.js';
import { TRIAL_LAKE, trialShoreDistance } from '../trial-lake.js';
import { mulberry32 } from '../../core/util.js';

function millArch(site) {
  const stone = mat.stone(0xbeaf94),
    coping = mat.stone(0xe1cdac),
    dark = mat.stone(0x8f877b);
  const group = new THREE.Group(),
    radius = 10.4,
    deck = 19.28,
    centre = 8.45;
  function block(x, y, z, w, h, d, material) {
    const b = box(w, h, d, material, x, y, z);
    group.add(b);
    return b;
  }
  for (let j = 0; j < 23; j++) {
    const a = (Math.PI * (j + 0.5)) / 23,
      x = radius * Math.cos(a),
      y = centre + radius * Math.sin(a);
    const key = block(x, y, 0, 1.69, 1.3, 5.13, j % 3 ? stone : coping);
    key.rotation.z = a - Math.PI * 0.5;
    const dz = Math.max(0, deck - 0.32 - y - 0.2);
    if (dz > 0.08) block(x, y + dz * 0.5 + 0.2, 0, 1.45, dz, 4.85, dark);
  }
  for (const s of [-1, 1]) {
    block(s * 12.6, (deck + 2.0) / 2, 0, 4.3, deck - 2.0, 5.1, stone);
    site.colBox(s * 12.6, 0, 2.15, 2.55, 0, 2, deck - 0.68);
  }
  for (let i = -13; i <= 13; i++) {
    const x = i * 1.06,
      y = deck + 0.2 * Math.cos((i * Math.PI) / 27);
    block(x, y - 0.13, 0, 1.095, 0.28, 5.39, coping);
    site.platBox(x, 0, 0.555, 2.68, 0, y + 0.011, 0.29);
    for (const s of [-1, 1]) {
      block(x, y + 0.34, s * 2.53, 1.085, 0.65, 0.32, stone);
      block(x, y + 0.7, s * 2.53, 1.085, 0.12, 0.44, coping);
    }
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const u = s * (14.4 + i * 0.7),
        top = deck - 0.07 - i * 0.085;
      block(u, top - 0.2, 0, 0.74, 0.4, 5.15, coping);
      site.platBox(u, 0, 0.385, 2.57, 0, top, 0.28);
    }
  }
  site.add(group, 0, 0, 0);
}
function fracturedRock() {
  // Adjacent layers break along the same set of joints, giving a torn-up ledge a
  // long flat top and a few sharp ends instead of a row of round stones.
  const p = [],
    c = [];
  const ring = [
    [-1, -0.4],
    [-0.62, -0.95],
    [0.42, -0.85],
    [1, -0.33],
    [0.73, 0.69],
    [-0.22, 1],
    [-1, 0.42]
  ];
  const palette = [0x8d8876, 0xb7ae94, 0x9c9986, 0xa39c84, 0xc9ba9b, 0x989b81, 0xaeaf94];
  const color = new THREE.Color();
  function tri(a, b, d, tone) {
    p.push(...a, ...b, ...d);
    color.setHex(tone);
    for (let i = 0; i < 3; i++) c.push(color.r, color.g, color.b);
  }
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length,
      [x, z] = ring[i],
      [u, v] = ring[j];
    const a = [x, 0.7 + 0.11 * x - 0.115 * z, z],
      b = [u, 0.7 + 0.11 * u - 0.115 * v, v];
    const d = [x * 0.82, -0.46, z * 0.79],
      e = [u * 0.82, -0.46, v * 0.79];
    tri([0, 0.74, 0], b, a, 0xb3b79a);
    tri(a, b, d, palette[i]);
    tri(b, e, d, palette[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  geo.computeVertexNormals();
  return geo;
}
function shoreBeds() {
  const rand = mulberry32(88472),
    stones = [];
  for (const [t0, t1, count] of [
    [0.23, 1.39, 24],
    [2.16, 2.99, 20],
    [3.44, 4.5, 28],
    [4.8, 5.71, 24]
  ]) {
    for (let i = 0; i < count; i++) {
      const a = t0 + ((t1 - t0) * (i + rand() * 0.62)) / count,
        r = 0.8 + 0.24 * rand();
      const ux = Math.cos(a) * TRIAL_LAKE.rx,
        uz = Math.sin(a) * TRIAL_LAKE.rz;
      const d = trialShoreDistance(TRIAL_LAKE.x + ux, TRIAL_LAKE.z + uz);
      const x = TRIAL_LAKE.x + (ux * r) / d,
        z = TRIAL_LAKE.z + (uz * r) / d;
      if (G.world.roadDist(x, z) < 7.5) continue;
      stones.push({ x, z, a: -a - 0.7, sx: 3.1 + rand() * 4.0, sz: 1.7 + rand() * 3.4, h: 1.2 + rand() * 2.1 });
    }
  }
  const m = mat.stone(0xffffff).clone();
  m.vertexColors = true;
  const mesh = new THREE.InstancedMesh(fracturedRock(), m, stones.length);
  mesh.name = 'trial basin jointed shore ledges';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const o = new THREE.Object3D();
  function settle() {
    for (const [i, b] of stones.entries()) {
      o.position.set(b.x, G.world.heightAt(b.x, b.z) - 0.26, b.z);
      o.rotation.set(0, b.a, 0);
      o.scale.set(b.sx, b.h, b.sz);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  settle();
  G.scene.add(mesh);
  G.events.on('terrain:deformed', (e) => {
    if (e.kind === 'trialLake') settle();
  });
}
export async function buildTrialBasin(ctx) {
  const site = new Site('millArch', 1876, -77);
  millArch(site);
  shoreBeds();
  await site.bakeSliced(ctx.step);
  ctx.place('millArch', { site, group: site.baked });
}
