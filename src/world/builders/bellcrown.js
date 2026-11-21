// A gate for travellers on foot, and an upper front door for the wing-post couriers.
import * as THREE from 'three';
import { BELL, BELL_ROADS, BELL_WALL } from '../../data/bellcrown.js';
import { G } from '../../core/game.js';
import { procTree } from './decor.js';
import { finishFrontage } from './mage-frontage.js';
import { mageResidents } from './mage-folk.js';
import { box, cone, cyl, sphere, torus } from '../../core/geo.js';
import { Site, mat, M, beam } from './kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const H = BELL.y;
const stone = mat.stone(0xd5c5ae),
  light = mat.plaster(0xeee1c5),
  foot = mat.stone(0xad9685);
const tile = [0xc99456, 0xbf5b38, 0x358878, 0xd79d4c, 0x42768e, 0xa39179, 0xcaa15d].map((c) => mat.tile(c));
const plaster = [light, mat.plaster(0xe7c5a4), mat.plaster(0xd6b398), mat.plaster(0xe2c7a5)];
const wood = mat.wood(0x724e40),
  trim = mat.wood(0xac7955),
  dark = mat.paint(0x343940);
const glass = mat.paint(0x71919a),
  brass = mat.metal(0xcd9a51),
  blue = mat.cloth(0x385d86),
  red = mat.cloth(0xb24c42);
const pave = mat.stone(0xb29d8c),
  street = mat.stone(0xc7b39b),
  border = mat.stone(0xe1caa4);
const gableGeo = new THREE.BufferGeometry();
const corners = [
  [-0.5, 0, 0.5],
  [0.5, 0, 0.5],
  [0, 1, 0.5],
  [-0.5, 0, -0.5],
  [0.5, 0, -0.5],
  [0, 1, -0.5]
];
const faces = [0, 1, 2, 4, 3, 5, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 3, 4, 1, 3, 1, 0];
gableGeo.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(
    faces.flatMap((i) => corners[i]),
    3
  )
);
gableGeo.computeVertexNormals();
function gable(g, w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(gableGeo, m);
  o.scale.set(w, h, d);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}
function band(g, x, y, z, w, h, d, m) {
  const o = box(w, h, d, m, x, y, z);
  g.add(o);
  return o;
}
function flag(g, x, y, z, size, m) {
  g.add(cyl(0.048, 0.068, size * 1.8, brass, x, y + size * 0.8, z, 6));
  const v = [
    0,
    0,
    0,
    size * 0.94,
    -size * 0.12,
    0,
    size * 1.52,
    -size * 0.28,
    0.07,
    size * 0.93,
    -size * 0.42,
    0.1,
    0,
    -size * 0.49,
    0
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geom.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 2, 1, 0, 3, 2, 0, 4, 3, 0]);
  geom.computeVertexNormals();
  const b = new THREE.Mesh(geom, m);
  b.position.set(x, y + size * 1.6, z);
  g.add(b);
}
function casement(g, x, y, z, w, h) {
  band(g, x, y, z, w + 0.2, h + 0.22, 0.16, wood);
  band(g, x, y + 0.02, z + 0.09, w, h, 0.07, glass);
  band(g, x, y - 0.04, z + 0.14, 0.085, h, 0.065, trim);
  band(g, x, y + 0.06 * h, z + 0.14, w, 0.09, 0.065, trim);
  band(g, x, y - h / 2 - 0.11, z + 0.08, w + 0.46, 0.16, 0.36, stone);
}
// The original concept artist describes entrances and shop signs at broom height.
function upstairsDoor(g, w, d, h) {
  const z = d / 2,
    doorX = w * 0.14,
    y = h * 0.53,
    deck = 2.05;
  band(g, doorX, y + 1.0, z + 0.11, 1.26, 2.0, 0.18, wood);
  band(g, doorX, y + 1.39, z + 0.245, 0.71, 0.77, 0.1, glass);
  band(g, doorX, y - 0.12, z + deck * 0.49, 2.75, 0.25, deck, trim);
  for (const side of [-1, 1]) {
    band(g, doorX + side * 1.29, y + 0.4, z + deck * 0.91, 0.12, 0.81, 0.12, wood);
    g.add(
      beam(doorX + side * 1.05, y - 1.33, z + 0.04, doorX + side * 1.05, y - 0.19, z + deck * 0.83, 0.13, 0.13, wood)
    );
    band(g, doorX + side * 1.29, y + 0.79, z + deck * 0.49, 0.12, 0.12, deck * 0.86, wood);
  }
  for (const u of [-1, 0, 1]) band(g, doorX + u * 0.44, y + 0.4, z + deck * 0.92, 0.08, 0.81, 0.08, wood);
  band(g, doorX, y + 0.8, z + deck * 0.92, 2.71, 0.12, 0.13, wood);
  const sx = -w * 0.33;
  g.add(beam(sx, y + 2.39, z + 0.02, sx, y + 2.39, z + 1.54, 0.095, 0.095, brass));
  for (const zz of [0.85, 1.38]) band(g, sx, y + 2.12, z + zz, 0.055, 0.52, 0.055, brass);
  band(g, sx, y + 1.65, z + 1.13, 0.14, 0.65, 0.94, wood);
  // Two-sided brass pictograms read from either direction down the lane.
  for (const side of [-1, 1]) {
    const sign = torus(0.21, 0.046, brass, sx + side * 0.091, y + 1.68, z + 1.13, 5, 12);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  }
}
function house(site, x, z, w, d, h, rot, seed, baseY = H) {
  const g = new THREE.Group(),
    roof = tile[seed % tile.length],
    body = plaster[seed % plaster.length],
    f = d / 2;
  band(g, 0, 0.35, 0, w + 0.2, 0.7, d + 0.2, foot);
  band(g, 0, h / 2 + 0.26, 0, w, h - 0.45, d, body);
  for (const xx of [-w / 2 + 0.11, w / 2 - 0.11]) {
    band(g, xx, h * 0.52, 0, 0.2, h - 0.55, d + 0.08, trim);
  }
  for (const yy of [h * 0.49, h - 0.14]) band(g, 0, yy, 0, w + 0.24, 0.22, d + 0.25, wood);
  const rise = w * (0.31 + 0.045 * (seed % 4));
  gable(g, w + 0.85, rise, d + 1, roof, 0, h, 0);
  const front = f + 0.5;
  gable(g, w - 0.34, rise * 0.88, 0.12, body, 0, h + 0.03, front);
  for (const side of [-1, 1])
    g.add(beam(0, h + rise + 0.02, front + 0.1, side * (w / 2 + 0.42), h, front + 0.1, 0.14, 0.15, wood));
  band(g, 0, h + rise, 0, 0.24, 0.22, d + 1.02, roof);
  const bay = w * 0.275;
  for (const xx of [-bay, bay]) {
    casement(g, xx, h * 0.73, f + 0.03, 1.11, 1.55);
    casement(g, xx, h * 0.26, f + 0.03, 1.05, 1.26);
  }
  band(g, 0, 1.15, f + 0.08, 1.53, 2.3, 0.24, wood);
  band(g, 0, 1.06, f + 0.216, 1.04, 2.1, 0.05, dark);
  casement(g, 0, h + rise * 0.35, front + 0.065, 0.71, 0.83);
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.rotation.y = (side * Math.PI) / 2;
    wing.position.x = (side * w) / 2;
    for (const xx of [-d * 0.25, d * 0.25]) casement(wing, xx, h * 0.7, 0.015, 1, 1.47);
    g.add(wing);
  }
  const cx = (seed % 2 ? 1 : -1) * w * 0.24,
    cz = -d * 0.22;
  band(g, cx, h + rise * 0.63, cz, 0.71, rise * 0.85 + 1, 0.83, foot);
  band(g, cx, h + rise * 1.05 + 0.44, cz, 0.88, 0.23, 1.0, wood);
  if (seed % 3 === 0) {
    const canopy = band(g, 0, h * 0.41, f + 0.78, w * 0.79, 0.16, 1.63, seed % 2 ? red : blue);
    canopy.rotation.x = 0.15;
    for (let i = 0; i < 7; i++)
      band(
        g,
        (i - 3) * w * 0.11,
        h * 0.41 - 0.19,
        f + 1.56,
        w * 0.11 - 0.025,
        0.26,
        0.11,
        i % 2 ? light : seed % 2 ? red : blue
      );
  }
  if (baseY === H && seed % 3 !== 0) {
    upstairsDoor(g, w, d, h);
    const a = w * 0.14,
      b = d / 2 + 1.02;
    site.platBox(
      x + a * Math.cos(rot) + b * Math.sin(rot),
      z - a * Math.sin(rot) + b * Math.cos(rot),
      1.37,
      1.0,
      rot,
      baseY + h * 0.53 + 0.01,
      0.22
    );
  }
  if(baseY===H)finishFrontage(g,{w,d,h,rise,seed,shop:seed%3!==0,shutters:true});
  site.add(g, x, baseY, z, rot);
  site.footprint(x, z, rot, w / 2, d / 2, baseY + h, seed);
  site.colBox(x, z, w / 2, d / 2, rot, baseY, baseY + h);
  // Stepped support follows the pitched roof rather than a platform suspended over the eaves.
  for (let i = -3; i <= 3; i++) {
    const lx = (w * i) / 7,
      top = baseY + h + rise * (1 - Math.abs(lx) / (w * 0.5 + 0.425));
    site.platBox(x + lx * Math.cos(rot), z - lx * Math.sin(rot), w / 14, d / 2, rot, top, 0.22);
  }
}
function spire(g, x, z, r, h, tip, roof = tile[4], pennant = false) {
  g.add(cyl(r * 0.91, r, h, light, x, h / 2, z, 12), cyl(r * 1.08, r * 1.05, 0.58, foot, x, 0.38, z, 12));
  for (const y of [h * 0.61, h - 0.59, h + 0.03]) g.add(cyl(r * 1.015, r * 0.98, 0.25, stone, x, y, z, 12));
  for (let j = 0; j < 8; j++) {
    const a = (j * Math.PI) / 4;
    const win = box(
      r * 0.3,
      r * 0.74,
      0.15,
      dark,
      x + Math.sin(a) * r * 0.925,
      h - r * 0.64,
      z + Math.cos(a) * r * 0.925
    );
    win.rotation.y = a;
    g.add(win);
  }
  g.add(
    cyl(r * 1.17, r * 1.04, 0.42, roof, x, h + 0.29, z, 12),
    cyl(r * 0.48, r * 1.19, tip * 0.4, roof, x, h + 0.48 + tip * 0.2, z, 12),
    cone(r * 0.5, tip * 0.6, roof, x, h + 0.48 + tip * 0.7, z, 12),
    sphere(0.19, brass, x, h + tip + 0.43, z, 8, 5)
  );
  if (pennant) flag(g, x, h + tip + 0.44, z, 1.5, red);
}
function paving(site) {
  const g = new THREE.Group();
  const apron = new THREE.Shape();
  for (const [i, [x, z]] of BELL_WALL.entries()) {
    if (i) apron.lineTo(x, -z);
    else apron.moveTo(x, -z);
  }
  apron.closePath();
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(apron), pave);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.043;
  g.add(floor);
  for (const segments of BELL_ROADS)
    for (let i = 1; i < segments.length; i++) {
      const [a, b] = segments[i - 1],
        [c, d] = segments[i];
      const len = Math.hypot(c - a, d - b),
        ang = Math.atan2(c - a, d - b);
      const run = band(g, (a + c) / 2, 0.058, (b + d) / 2, 5.6, 0.04, len + 1, street);
      run.rotation.y = ang;
      for (const side of [-1, 1]) {
        const curb = band(
          g,
          (a + c) / 2 + Math.cos(ang) * side * 2.78,
          0.09,
          (b + d) / 2 - Math.sin(ang) * side * 2.78,
          0.17,
          0.035,
          len,
          border
        );
        curb.rotation.y = ang;
      }
      for (let n = 3; n < len; n += 3.6) {
        const joint = band(g, a + ((c - a) * n) / len, 0.085, b + ((d - b) * n) / len, 5.3, 0.012, 0.048, pave);
        joint.rotation.y = ang;
      }
    }
  const disc = cyl(10.4, 10.4, 0.1, street, -5, 0.08, 4, 24);
  g.add(disc);
  for (const r of [2.55, 9.68]) {
    const ring = torus(r, 0.1, border, -5, 0.14, 4, 4, 32);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  for (let j = 0; j < 8; j++) {
    const a = (j * Math.PI) / 4,
      ray = band(g, -5 + Math.sin(a) * 4.25, 0.14, 4 + Math.cos(a) * 4.25, 0.2, 0.08, 3.7, border);
    ray.rotation.y = a;
  }
  site.add(g, 0, H, 0);
}
function market(site) {
  for (const [x, z, i] of [
    [-16, 8, 0],
    [14, 5, 1],
    [-14, 29, 2],
    [34, 23, 3]
  ]) {
    const g = new THREE.Group();
    band(g, 0, 1, 0, 3.7, 0.29, 1.5, wood);
    for (const xx of [-1.71, 1.71]) for (const zz of [-0.65, 0.65]) band(g, xx, 1.3, zz, 0.12, 2.6, 0.12, trim);
    for (let j = -3; j <= 3; j++) {
      const o = band(g, j * 0.56, 2.67, 0, 0.55, 0.16, 2.14, (j + i) % 2 === 0 ? light : i % 2 ? blue : red);
      o.rotation.x = 0.14;
    }
    for (let j = -2; j <= 2; j++) g.add(cyl(0.31, 0.24, 0.39, j % 2 ? brass : foot, j * 0.52, 1.31, 0.04, 6));
    site.add(g, x, H, z);
    site.colBox(x, z, 1.78, 0.74, 0, H, H + 1.2);
  }
}
// Each background rider is one coloured mesh, shared by the three flight paths.
function riders(ctx) {
  const g = new THREE.Group(),
    skin = mat.plaster(0xe3bb9c);
  g.add(cyl(0.035, 0.04, 2.53, wood, 0, 0.04, 0.3, 7), cone(0.23, 0.73, trim, 0, 0.05, -0.84, 7));
  g.children[0].rotation.x = Math.PI / 2;
  g.children[1].rotation.x = Math.PI / 2;
  g.add(
    cone(0.34, 0.69, blue, 0, 0.46, 0, 8),
    sphere(0.145, skin, 0, 0.93, 0.07, 8, 6),
    cyl(0.34, 0.32, 0.045, dark, 0, 1.07, 0.06, 10),
    cone(0.19, 0.44, blue, 0, 1.28, 0.05, 8)
  );
  for (const [x, z] of [
    [0.16, 0.09],
    [0.23, -0.12]
  ]) {
    g.add(
      beam(x, 0.2, z, x + 0.08, -0.25, z + 0.1, 0.11, 0.15, dark),
      beam(x + 0.08, -0.25, z + 0.1, x + 0.1, -0.28, z + 0.28, 0.12, 0.11, wood)
    );
  }
  g.add(beam(0.13, 0.64, 0.03, 0.08, 0.25, 0.51, 0.12, 0.1, blue));
  const bits = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!o.isMesh) return;
    const b = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    b.applyMatrix4(o.matrixWorld);
    b.deleteAttribute('uv');
    const c = o.material.color,
      a = new Float32Array(b.attributes.position.count * 3);
    for (let j = 0; j < a.length; j += 3) {
      a[j] = c.r;
      a[j + 1] = c.g;
      a[j + 2] = c.b;
    }
    b.setAttribute('color', new THREE.BufferAttribute(a, 3));
    bits.push(b);
  });
  const geo = mergeGeometries(bits),
    m = M.plaster().clone();
  m.color.set(0xffffff);
  m.vertexColors = true;
  const flock = new THREE.Group(),
    all = [];
  for (let j = 0; j < 3; j++) {
    const o = new THREE.Mesh(geo, m);
    o.scale.setScalar(1.12);
    flock.add(o);
    all.push(o);
  }
  flock.name = 'BellcrownWindCouriers';
  G.scene.add(flock);
  ctx.tick((_dt, time) => {
    const p = G.player?.pos || G.camera.position;
    flock.visible = Math.hypot(p.x - BELL.x, p.z - BELL.z) < 210;
    if (!flock.visible) return;
    all.forEach((o, j) => {
      const a = time * (0.082 + j * 0.015) + j * 2.094,
        rx = 32 + j * 4,
        rz = 15 + j * 2;
      o.position.set(
        BELL.x + Math.cos(a) * rx,
        H + 18.8 + j * 3 + Math.sin(a * 2 + j) * 1.1,
        BELL.z + 12 + Math.sin(a) * rz
      );
      o.rotation.set(0, Math.atan2(-rx * Math.sin(a), rz * Math.cos(a)), -0.15);
    });
  });
}

function turret(site, x, z, r, h, cap, roof) {
  const g = new THREE.Group();
  spire(g, 0, 0, r, h, cap, roof);
  site.add(g, x, H, z);
  site.colCyl(x, z, r * 0.94, H, H + h + cap * 0.55);
  site.platDisc(x, z, r * 0.82, H + h, 0.35);
}
function rampart(site, x0, z0, x1, z1, height = 12.8) {
  const len = Math.hypot(x1 - x0, z1 - z0),
    x = (x0 + x1) / 2,
    z = (z0 + z1) / 2,
    yaw = Math.atan2(x1 - x0, z1 - z0),
    g = new THREE.Group();
  band(g, 0, height / 2, 0, 2.55, height, len + 0.2, stone);
  band(g, 0, 1, 0, 3.26, 2, len + 0.25, foot);
  band(g, 0, height - 0.56, 0, 2.9, 0.59, len + 0.15, light);
  band(g, 0, height + 0.12, 0, 2.85, 0.28, len + 0.25, stone);
  const bays = Math.ceil(len / 8);
  for (let j = 0; j < bays; j++) {
    const q = ((j + 0.5) * len) / bays - len / 2;
    band(g, 0, height * 0.48, q, 3.1, height * 0.96, 0.6, light);
  }
  const teeth = Math.ceil(len / 3.9);
  band(g, -1.18, height + 0.41, 0, 0.41, 0.49, len, light);
  for (let j = 0; j < teeth; j++)
    band(g, -1.15, height + 0.78, ((j + 0.5) * len) / teeth - len / 2, 0.58, 0.76, 1.14, stone);
  site.add(g, x, H, z, yaw);
  site.colBox(x, z, 1.3, len / 2, yaw, H, H + height + 0.15);
  site.platBox(x, z, 1.1, len / 2, yaw, H + height + 0.2, 0.35);
}
function pointed(g, x, y, z, w, h, material) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * 0.62);
  s.quadraticCurveTo(w * 0.46, h * 0.87, 0, h);
  s.quadraticCurveTo(-w * 0.46, h * 0.87, -w / 2, h * 0.62);
  s.closePath();
  const o = new THREE.Mesh(
    new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false, curveSegments: 7 }),
    material
  );
  o.position.set(x, y, z);
  g.add(o);
  return o;
}
function tracery(g, x, y, z, w, h) {
  pointed(g, x, y - 0.35, z, w + 0.77, h + 0.9, brass);
  pointed(g, x, y, z + 0.14, w, h, mat.paint(0x7f9fa8));
  for (let i = 1; i <= 5; i++) {
    const t = i / 6,
      xx = x + (t - 0.5) * w,
      hh = h * (1 - 0.49 * Math.abs(t - 0.5) * 2);
    band(g, xx, y + hh / 2, z + 0.37, 0.1, hh, 0.12, light);
  }
  for (const qq of [0.19, 0.4, 0.6]) band(g, x, y + h * qq, z + 0.37, w * 0.99, 0.12, 0.12, light);
  const o = torus(w * 0.185, 0.18, light, x, y + h * 0.74, z + 0.39, 6, 23);
  g.add(o);
}
function townWall(site) {
  const p = [[5.7, 61], ...BELL_WALL.slice(1), BELL_WALL[0], [-5.7, 61]];
  for (let i = 1; i < p.length; i++) {
    const [a, b] = p[i - 1],
      [c, d] = p[i];
    if (a === 74 && b === 23) {
      rampart(site, a, b, a + (c - a) * 0.3, b + (d - b) * 0.3);
      rampart(site, a + (c - a) * 0.7, b + (d - b) * 0.7, c, d);
    } else rampart(site, a, b, c, d, 12.8);
  }
  for (const [i, [x, z]] of BELL_WALL.entries())
    if (i % 2 === 0 || z > 42)
      turret(site, x, z, 1.9 + (i % 3) * 0.33, 13.7 + (i % 2) * 2.3, 4.5, tile[i % tile.length]);
  const g = new THREE.Group(),
    R = 5.6;
  for (let i = 0; i < 17; i++) {
    const a = (i * Math.PI) / 16,
      block = band(g, R * Math.cos(a), 6.6 + R * Math.sin(a), 0, 1.68, 1.28, 3.85, i % 2 ? stone : light);
    block.rotation.z = a;
  }
  for (const side of [-1, 1]) {
    const x = side * 7.7;
    turret(site, x, 61, 2.72, 19.2, 6.6, tile[3]);
    turret(site, side * 11.2, 57.5, 2.03, 22.0, 5.4, tile[2]);
    band(g, side * 5.63, 3.3, 0, 1.55, 6.6, 3.85, stone);
    site.colBox(side * 5.63, 61, 0.77, 1.92, 0, H, H + 7.4);
  }
  band(g, 0, 13.56, 0, 12.9, 2.2, 3.96, stone);
  band(g, 0, 14.77, 0, 13.25, 0.31, 4.27, light);
  // A sky-blue jewel in an open lancet window crowns the ceremonial front gate.
  for (const side of [-1, 1]) band(g, side * 2.75, 17.27, 0, 0.58, 5.15, 2.05, light);
  for (let i = 0; i < 8; i++) {
    const u = i / 8,
      v = (i + 1) / 8;
    for (const side of [-1, 1]) {
      const ax = side * 2.75 * (1 - u),
        bx = side * 2.75 * (1 - v);
      g.add(beam(ax, 19.7 + 3.2 * Math.sin(u * 1.35), 0, bx, 19.7 + 3.2 * Math.sin(v * 1.35), 0, 0.49, 1.88, light));
    }
  }
  const orb = sphere(1.1, mat.paint(0x64b7b4), 0, 17.87, 0.51, 14, 9);
  g.add(orb, torus(1.31, 0.14, brass, 0, 17.87, 0.61, 6, 24));
  site.add(g, 0, H, 61);
  site.colBox(0, 61, 5.2, 1.95, 0, H + 11.9, H + 15.0);
}
function greatHall(site) {
  const x = -4,
    z = -54,
    g = new THREE.Group(),
    w = 22,
    d = 26,
    e = 21.2;
  band(g, 0, 0.7, 0, w + 3, 1.4, d + 2, foot);
  band(g, 0, e * 0.5, 0, w, e, d, light);
  gable(g, w + 1.5, 8.4, d + 2, tile[2], 0, e, 0);
  // High arched glazed facade with two stepped aisles; readable from the approach over the roofs.
  const f = d / 2 + 0.42;
  pointed(g, 0, 2.1, f, 17.4, 28, stone);
  tracery(g, 0, 8.0, f + 0.27, 10.45, 18.8);
  pointed(g, 0, 0.4, f + 0.55, 4.7, 6.8, wood);
  for (const side of [-1, 1]) {
    for (const offset of [5.6, 8.8]) {
      const c = offset === 5.6 ? 25.3 : 22.4;
      band(g, side * offset, c / 2, f, 0.86, c, 1.43, foot);
      g.add(cone(0.97, 3.55, brass, side * offset, c + 1.7, f, 5));
    }
    for (const k of [-8, 0, 8]) {
      band(g, side * 11.05, 10.5, k, 0.8, 21, 1.0, stone);
      tracery(g, side * 8.3, 6.5, f + 0.1, 2.2, 10.1);
    }
    const lowX = side * 15.3;
    band(g, lowX, 6.6, -0.4, 7.3, 13.2, 23, stone);
    gable(g, 8.5, 4.1, 24, tile[3], lowX, 13.2, -0.4);
    for (const zz of [-11, 11]) spire(g, lowX, zz, 1.43, 15.7, 6.1, tile[3]);
  }
  g.scale.y = 1.2;
  site.add(g, x, H, z);
  site.colBox(x, z, 18.9, 13.7, 0, H, H + 25.2);
  site.platBox(x, z, 7.1, 11.8, 0, H + 31.2, 0.9);
}
function streetBlock(site, x, z, w, d, h, rot, seed, baseY = H) {
  const g = new THREE.Group(),
    body = plaster[seed % plaster.length],
    roof = tile[seed % tile.length];
  band(g, 0, h / 2, 0, w, h, d, body);
  band(g, 0, h - 0.13, 0, w + 0.22, 0.27, d + 0.2, trim);
  gable(g, w + 0.62, w * 0.49, d + 0.65, roof, 0, h, 0);
  for (const yy of [0.28, 0.72])
    for (const xx of [-0.28, 0, 0.28]) {
      band(g, xx * w, yy * h, d / 2 + 0.06, 0.89, 1.49, 0.13, glass);
      band(g, xx * w, yy * h - 0.72, d / 2 + 0.15, 1.08, 0.12, 0.22, stone);
    }
  band(g, 0, 1.09, d / 2 + 0.11, 1.19, 2.18, 0.14, wood);
  band(g, -w * 0.23, h + w * 0.36, -d * 0.24, 0.65, w * 0.47, 0.65, tile[1]);
  // The upper rooms project above the masonry ground floor. Windows and roof
  // dormers also face the side lanes, so the roofs remain legible from a broom.
  band(g, 0, h * 0.48, 0, w + 0.18, 0.18, d + 0.2, trim);
  for (const side of [-1, 1])
    for (const zz of [-0.26, 0.26]) {
      band(g, side * w * 0.502, h * 0.72, zz * d, 0.16, 1.72, 1.03, wood);
      band(g, side * (w * 0.502 + 0.09), h * 0.74, zz * d, 0.06, 1.42, 0.79, glass);
      band(g, side * (w * 0.502 + 0.13), h * 0.74, zz * d, 0.05, 1.41, 0.085, light);
    }
  for (const sx of [-0.29, 0.29]) {
    band(g, sx * w, h * 0.67, -d * 0.503, 0.99, 1.51, 0.14, glass);
    band(g, sx * w, h * 0.67, -d * 0.514, 0.09, 1.53, 0.08, trim);
  }
  if (seed % 3 !== 0) {
    const side = seed % 2 === 0 ? 1 : -1;
    const dormer = new THREE.Group();
    band(dormer, 0, 0.59, 0, 1.45, 1.18, 1.3, body);
    gable(dormer, 1.87, 0.88, 1.61, roof, 0, 1.18, 0);
    band(dormer, 0, 0.65, 0.7, 0.87, 0.75, 0.09, wood);
    band(dormer, 0, 0.66, 0.76, 0.65, 0.63, 0.06, glass);
    dormer.position.set(side * w * 0.32, h + w * 0.14, d * 0.16);
    dormer.rotation.y = (side * Math.PI) / 2;
    g.add(dormer);
  }
  if (seed % 6 === 1) {
    upstairsDoor(g, w, d, h);
    const a = w * 0.14,
      b = d / 2 + 1.02;
    site.platBox(
      x + a * Math.cos(rot) + b * Math.sin(rot),
      z - a * Math.sin(rot) + b * Math.cos(rot),
      1.37,
      1.0,
      rot,
      baseY + h * 0.53 + 0.01,
      0.22
    );
  }
  if(baseY===H || seed%4===0)finishFrontage(g,{w,d,h,rise:w*.49,seed,shop:baseY===H&&seed%4<2,shutters:seed%3!==0});
  site.add(g, x, baseY, z, rot);
  site.colBox(x, z, w / 2, d / 2, rot, baseY, baseY + h);
  site.platBox(x, z, w * 0.27, d / 2, rot, baseY + h + w * 0.37, 0.53);
}

function insideWall(x, z, margin) {
  let inside = false,
    edge = 1e6;
  for (let i = 0, j = BELL_WALL.length - 1; i < BELL_WALL.length; j = i++) {
    const [ax, az] = BELL_WALL[j],
      [bx, bz] = BELL_WALL[i],
      dx = bx - ax,
      dz = bz - az;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    edge = Math.min(edge, Math.hypot(x - ax - dx * f, z - az - dz * f));
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside && edge > margin;
}
function accident(ctx, site) {
  const x = -14,
    z = 37,
    w = 8.4,
    d = 9.5,
    h = 7.4,
    slope = 0.65,
    g = new THREE.Group();
  band(g, 0, h / 2, 0, w, h, d, plaster[1]);
  gable(g, w, h * 0.03, d + 0.45, foot, 0, h - 0.08, 0);
  for (const u of [-2.45, 0, 2.45]) casement(g, u, 4.8, d * 0.5 + 0.03, 1.12, 1.95);
  const plain = mat.tile(0x9a6a58),
    lightClay = mat.tile(0xb78369);
  const patched = new THREE.Group(),
    shards = new THREE.Group();
  for (let i = -5; i <= 5; i++)
    for (let j = -5; j <= 5; j++) {
      const xx = i * 0.807,
        zz = j * 0.898,
        y = h + (w * 0.5 - Math.abs(xx)) * slope;
      const fixed = i >= -1 && i <= 1 && j >= 1 && j <= 3;
      const b = band(fixed ? patched : g, xx, y, zz, 0.99, 0.17, 0.97, (i + j) % 4 ? plain : lightClay);
      b.rotation.z = i > 0 ? -Math.atan(slope) : i < 0 ? Math.atan(slope) : 0;
      if (fixed) {
        const fragment = band(
          shards,
          xx + 0.13,
          y - 0.26,
          j * 0.898 + 0.1,
          0.57,
          0.13,
          0.49,
          (i + j) % 2 ? lightClay : plain
        );
        fragment.rotation.set(0.14 + i * 0.12, 0.28 * j, 0.18 * i);
      }
    }
  site.add(g, x, H, z);
  site.colBox(x, z, w / 2, d / 2, 0, H, H + h);
  for (let i = -5; i <= 5; i++)
    site.platBox(x + i * 0.807, z, 0.416, 5.0, 0, H + h + (w * 0.5 - Math.abs(i * 0.807)) * slope + 0.09, 0.19);
  for (const b of [patched, shards]) {
    b.position.set(BELL.x + x, H, BELL.z + z);
    G.scene.add(b);
  }
  const entry = {
    setRepaired(on) {
      patched.visible = !!on;
      shards.visible = !on;
    },
    x: BELL.x + x,
    z: BELL.z + z,
    top: H + h + w * 0.5 * slope + 0.09
  };
  entry.setRepaired(false);
  ctx.place('accidentRoof', entry);
}
function jeweller(site) {
  const x = -15,
    z = -7,
    g = new THREE.Group(),
    half = 3.65,
    depth = 3,
    height = 5.4,
    doorX = 1.46,
    doorWidth = 1.63;
  const wall = (cx, cz, w, d, h = height, base = 0) => {
    band(g, cx, base + h / 2, cz, w, h, d, plaster[2]);
    site.colBox(x + cx, z + cz, w / 2, d / 2, 0, H + base, H + base + h);
  };
  wall(-half, 0, 0.3, 6);
  wall(half, 0, 0.3, 6);
  wall(0, -depth, 7.3, 0.32);
  const l = doorX - doorWidth / 2,
    r = doorX + doorWidth / 2;
  wall((-half + l) / 2, depth, l + half, 0.31);
  wall((half + r) / 2, depth, half - r, 0.31);
  wall(doorX, depth, doorWidth, 0.31, height - 2.56, 2.56);
  band(g, 0, 0.055, 0, 7.25, 0.11, 6, wood);
  gable(g, 8.1, 3.2, 6.8, tile[2], 0, height, 0);
  for (const u of [l - 0.04, r + 0.04]) band(g, u, 1.32, depth + 0.12, 0.16, 2.64, 0.2, wood);
  band(g, doorX, 2.65, depth + 0.13, doorWidth + 0.31, 0.23, 0.23, wood);
  casement(g, -1.75, 2.05, 3.07, 2.46, 2.1);
  band(g, -1.65, 0.89, 3.44, 3.62, 0.14, 0.82, trim);
  // A small open counter displays clasps and pins; the gold ring sign
  // hangs perpendicular to the lane so approaching riders can see it.
  for (const side of [-1, 1]) {
    const bust = cone(0.22, 0.37, mat.cloth(0x585864), -1.72 + side * 0.7, 1.15, 3.46, 9);
    g.add(bust);
    g.add(torus(0.1, 0.024, brass, -1.72 + side * 0.7, 1.18, 3.6, 5, 14));
  }
  band(g, -0.3, 0.59, -1.32, 4.05, 1.18, 1.03, wood);
  band(g, -0.3, 1.23, -1.32, 4.17, 0.12, 1.13, trim);
  site.colBox(x - 0.3, z - 1.32, 2.02, 0.52, 0, H, H + 1.28);
  for (let i = 0; i < 3; i++) {
    const u = -1.46 + i * 0.98;
    band(g, u, 1.32, -1.32, 0.72, 0.08, 0.68, blue);
    g.add(sphere(0.1, brass, u, 1.39, -1.32, 7, 5));
  }
  band(g, 2.9, 3.96, 3.74, 0.12, 0.12, 1.51, brass);
  for (let i = 0; i < 2; i++) {
    const sign = torus(0.42, 0.08, brass, 2.9, 3.48, 4.23, 6, 18);
    sign.rotation.y = (i * Math.PI) / 2;
    g.add(sign);
  }
  // The emporium is visited on foot; the counter, pin sign and gable also read from above.
  for(const side of [-1,1]){
    band(g,side*half,2.7,depth+.09,.21,5.4,.25,wood);
    for(const zz of [-1.95,.70]) {
      const wing=new THREE.Group();wing.rotation.y=side*Math.PI/2;wing.position.set(side*half,0,zz);
      casement(wing,0,2.2,.22,1.42,1.9);g.add(wing);
    }
    g.add(beam(side*(half-.10),4.0,depth+.18,side*1.5,5.4,depth+.18,.17,.19,wood));
    g.add(beam(side*(half+.18),height+.02,depth+.4,0,height+3.1,depth+.4,.16,.18,wood));
  }
  band(g,0,height-.10,0,7.53,.27,6.29,wood);
  band(g,0,height+1.16,depth+.37,.16,2.46,.21,wood);casement(g,0,height+.83,depth+.49,.76,.99);
  const awning=band(g,-1.79,3.43,depth+.91,3.87,.15,1.68,blue);awning.rotation.x=.17;
  for(let i=0;i<9;i++)band(g,-3.44+i*.414,3.11,depth+1.72,.39,.30,.115,i%2===0?blue:light);
  site.add(g, x, H, z);
  site.platBox(x, z, half, depth, 0, H + height + 1.45, 0.34);
}
async function residential(ctx, site) {
  const fixed = [
    [-4, -54, 22, 17],
    [41, 5, 11.8, 15],
    [-14, 37, 6.1, 6.4],
    [-15, -7, 5.2, 5.0],
    [15.8, 33, 2.0, 14.5],
    [21.5, 47.8, 8.0, 3.4],
    [28, 52.9, 2.3, 5.5]
  ];
  let n = 0;
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 21; col++) {
      const x = -112 + col * 11 + 2.3 * Math.sin(row * 0.94 + col),
        z = -85 + row * 12.1 + 1.55 * Math.cos(col * 1.73 + row);
      const seed = row * 31 + col * 7,
        w = 6.5 + (seed % 4) * 0.49,
        d = 6.8 + (seed % 5) * 0.52,
        r = Math.hypot(w / 2, d / 2);
      if (
        !insideWall(x, z, r + 1.8) ||
        fixed.some(([a, b, u, v]) => Math.abs(x - a) < u + w / 2 && Math.abs(z - b) < v + d / 2)
      )
        continue;
      if (G.world.roadDist(BELL.x + x, BELL.z + z) < r + 1.55) continue;
      const yaw = (seed % 3 === 1 ? 0.5 * Math.PI : 0) + 0.16 * Math.sin(row + col);
      const h = 6.8 + (seed % 7) * 0.78 + Math.max(0, -z) * 0.029;
      if (Math.abs(x) < 34 && z > -34 && n % 2 === 0) house(site, x, z, w, d, h, yaw, seed);
      else streetBlock(site, x, z, w, d, h, yaw, seed);
      n++;
    }
    await ctx.step('mages:residential');
  }
  return n;
}
// A second route through this block begins at the market crossing. The masonry
// stair rises onto a public roof terrace and connects to the curved south wall.
function lookoutWalk(site) {
  const g = new THREE.Group(),
    x = 15.8,
    start = 19.4,
    top = 13.0,
    steps = 41,
    stride = 0.64,
    width = 2.55;
  for (let i = 0; i < steps; i++) {
    const h = (top * (i + 1)) / steps,
      z = start + (i + 0.5) * stride;
    band(g, x, h / 2, z, width, h, stride + 0.025, i % 5 === 0 ? light : stone);
    site.platBox(x, z, width / 2, stride / 2 + 0.015, 0, H + h, 0.23);
    if (i % 6 === 0)
      for (const side of [-1, 1]) band(g, x + side * (width / 2 - 0.08), h + 0.43, z, 0.14, 0.86, 0.16, trim);
  }
  for (const side of [-1, 1])
    g.add(
      beam(
        x + side * (width / 2 - 0.08),
        1.13,
        start + 0.3,
        x + side * (width / 2 - 0.08),
        top + 0.85,
        start + stride * steps,
        0.12,
        0.15,
        trim
      )
    );
  function deck(cx, cz, w, d) {
    band(g, cx, top - 0.24, cz, w, 0.48, d, stone);
    site.platBox(cx, cz, w / 2, d / 2, 0, H + top, 0.45);
    for (const dx of [-w * 0.42, w * 0.42])
      for (const dz of [-d * 0.36, d * 0.36]) {
        band(g, cx + dx, top * 0.5 - 0.23, cz + dz, 0.58, top - 0.47, 0.58, foot);
        site.colBox(cx + dx, cz + dz, 0.29, 0.29, 0, H, H + top - 0.48);
      }
  }
  deck(21.1, 47.7, 13.45, 4.24);
  deck(27.68, 53.2, 4.1, 10.5);
  for (const [a, b, c, d] of [
    [14.42, 45.8, 14.42, 49.7],
    [14.42, 49.7, 26.3, 49.7],
    [17.18, 45.73, 27.47, 45.73],
    [29.65, 46.0, 29.65, 56.45],
    [25.72, 50.04, 25.72, 56.4]
  ]) {
    const dx = c - a,
      dz = d - b,
      n = Math.ceil(Math.hypot(dx, dz) / 2.3);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      band(g, a + dx * u, top + 0.44, b + dz * u, 0.22, 0.88, 0.22, light);
    }
    g.add(beam(a, top + 0.84, b, c, top + 0.84, d, 0.16, 0.16, stone));
  }
  // A stone bench marks the oriel overlooking the central high window.
  band(g, 21.35, top + 0.52, 49.02, 2.01, 0.24, 0.64, foot);
  for (const off of [-0.63, 0.63]) band(g, 21.35 + off, top + 0.24, 49.02, 0.29, 0.48, 0.5, foot);
  site.add(g, 0, H, 0);
}

function courtyardTrees(site) {
  const point = new THREE.Vector3();
  let planted = 0;
  for (let i = 0; i < 680 && planted < 55; i++) {
    const x = -116 + (((i + 11) * 89) % 235),
      z = -85 + (((i + 8) * 59) % 149);
    if (!insideWall(x, z, 3.5) || G.world.roadDist(BELL.x + x, BELL.z + z) < 3.8) continue;
    if (
      (Math.abs(x - 41) < 12.5 && Math.abs(z - 5) < 15) ||
      Math.hypot(x + 14, z - 37) < 6.0 ||
      (Math.abs(x - 15.8) < 2.4 && z > 18 && z < 46) ||
      (x > 13 && x < 30 && z > 44 && z < 57)
    )
      continue;
    point.set(BELL.x + x, H + 0.12, BELL.z + z);
    if (G.world.resolveCollisions(point, 2.05, 2)) continue;
    const west=x< -22 && z> -43, upper=z< -46, inn=x>28 && z> -7;
    const key=west?(i%3?'ginkgo1':'broad2'):upper?(i%3?'maple1':'broad2'):inn?'birch':'broad2';
    const palette=west?[0xcba45b,0xd1ad63,0xb3a063]:upper?[0x995f69,0x956f77,0xab8075]:
      inn?[0xa1b193,0xa2ac81,0x95ab83]:[0x81975e,0x8d9c67,0x738b5d];
    const tint=palette[i%3];
    site.add(procTree(key,.68+.065*(i%4),tint),x,H-.035,z,i*1.73);
    site.colCyl(x,z,.21,H,H+3.6);
    planted++;
  }
}
export async function buildBellcrown(ctx) {
  const site = new Site('landOfMages', BELL.x, BELL.z);
  paving(site);
  townWall(site);
  greatHall(site);
  await ctx.step('mages:walls');
  const count = await residential(ctx, site);
  accident(ctx, site);
  jeweller(site);
  lookoutWalk(site);
  courtyardTrees(site);
  market(site);
  // Thin civic towers punctuate the dense roofs without taking over the silhouette of the central arched hall.
  for (const [x, z, r, h] of [
    [-77, -25, 2.1, 21],
    [70, -34, 2.0, 22],
    [-34, -65, 1.7, 26],
    [32, -59, 1.8, 20],
    [82, -66, 1.6, 21]
  ]) {
    if (G.world.roadDist(BELL.x + x, BELL.z + z) > r + 1.7)
      turret(site, x, z, r, h, 6.8, tile[(Math.abs(x) + 2) % tile.length]);
  }
  await site.bakeBlocksSliced(42, ctx.step);
  ctx.place('landOfMages', { group: site.baked, blocks: site.blocks, site, houses: count });
  riders(ctx);
  mageResidents(ctx);
  const upper = new Site('upperMageDistrict', -2085, -682),
    base = 46;
  for (let j = -3; j <= 3; j++)
    for (let i = -5; i <= 5; i++) {
      const x = i * 9.8 + 2 * Math.sin(j),
        z = j * 10.7 + 2 * Math.cos(i),
        seed = (j + 3) * 11 + i + 5;
      if ((x / 57) ** 2 + (z / 38) ** 2 > 1 || Math.abs(x) < 3.9) continue;
      streetBlock(
        upper,
        x,
        z,
        5.2 + (seed % 3) * 0.62,
        5.8 + (seed % 2) * 0.83,
        6.9 + (seed % 6) * 0.7,
        ((i % 3) * Math.PI) / 2,
        seed,
        base
      );
    }
  const curve = [
    [-6, 37],
    [-31, 34],
    [-48, 22],
    [-57, 0],
    [-44, -25],
    [-25, -37],
    [14, -39],
    [46, -27],
    [57, 0],
    [48, 26],
    [28, 36],
    [6, 37]
  ];
  for (let i = 1; i < curve.length; i++) {
    const [x, z] = curve[i - 1],
      [u, v] = curve[i],
      l = Math.hypot(x - u, z - v),
      yaw = Math.atan2(u - x, v - z),
      g = new THREE.Group();
    band(g, 0, 3.7, 0, 1.39, 7.4, l + 0.1, stone);
    band(g, 0, 7.36, 0, 1.72, 0.32, l, light);
    upper.add(g, (x + u) / 2, base, (v + z) / 2, yaw);
    upper.colBox((x + u) / 2, (z + v) / 2, 0.7, l / 2, yaw, base, base + 7.4);
  }
  for (const [x, z] of [
    [-47, 22],
    [46, -27],
    [-27, -35],
    [27, 35]
  ]) {
    const g = new THREE.Group();
    spire(g, 0, 0, 2.0, 12.6, 4.1, tile[3]);
    upper.add(g, x, base, z);
    upper.colCyl(x, z, 1.97, base, base + 16);
  }
  await upper.bakeBlocksSliced(42, ctx.step);
  ctx.place('upperMageDistrict', { group: upper.baked, blocks: upper.blocks, site: upper });
}
export async function buildEastTown(ctx) {
  const site = new Site('peacefulCountry', 2220, 48),
    floor = 19;
  // The house with the book and fireplace stands just inside the hometown's eastern street.
  for (const [i, [x, z, w, d, yaw]] of [
    [-20, -20, 8.4, 9.3, 0],
    [-30, -6, 7.7, 8.8, Math.PI / 2],
    [-29, 14, 9, 7.8, 0],
    [-9, 25, 8.6, 8.9, Math.PI],
    [8, 26, 7.6, 8.2, Math.PI],
    [23, 15, 8.1, 7.9, -1.57],
    [24, -2, 8.3, 9.1, -1.57],
    [15, -20, 7.5, 8.1, 0],
    [-2, -26, 9.0, 7.4, 0]
  ].entries()) {
    house(site, x, z, w, d, 6.8 + (i % 3) * 0.8, yaw, i + 20, floor);
  }
  await site.bakeBlocksSliced(34, ctx.step);
  ctx.place('peacefulCountry', { group: site.baked, site, blocks: site.blocks });
}
