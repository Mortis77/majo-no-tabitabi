// Street-front shops have a threshold beneath the arcade and a more private,
// projecting room upstairs. The same fronts read at a walk and from a low broom.
import * as THREE from 'three';
import { box, cyl, sphere } from '../../core/geo.js';
import { mat, beam } from './kit.js';

const oak = mat.wood(0x624637),
  mould = mat.wood(0xac8461),
  putty = mat.plaster(0xe3cb9f);
const glass = mat.paint(0x527984),
  lightGlass = mat.paint(0x95aea5);
const limestone = mat.stone(0xcabc9d),
  edge = mat.stone(0xdfcfac),
  brass = mat.metal(0xba925d);
const aprons = [0x775647, 0x4e7669, 0x875e58].map((c) => mat.cloth(c));
const volumes = [0x9c604e, 0x557365, 0xa9926e, 0x687b87, 0x6e605b].map((c) => mat.cloth(c));
const rail = (g, x, y, z, w, h, d, m) => {
  const o = box(w, h, d, m, x, y, z);
  g.add(o);
  return o;
};

function oriel(g, x, z, w, h) {
  const frame = new THREE.Group();
  frame.position.set(x, h, z);
  const glassBay = (angle, ox, oz, width) => {
    const a = new THREE.Group();
    a.rotation.y = angle;
    a.position.set(ox, 0, oz);
    rail(a, 0, 0, 0, width, 1.57, 0.11, oak);
    for (const side of [-1, 1])
      for (const yy of [-0.3, 0.29])
        rail(a, side * width * 0.21, yy, 0.073, width * 0.337, 0.48, 0.03, yy < 0 ? glass : lightGlass);
    frame.add(a);
  };
  glassBay(0, 0, 0.47, w * 0.56);
  glassBay(-0.7, -w * 0.34, 0.23, w * 0.28);
  glassBay(0.7, w * 0.34, 0.23, w * 0.28);
  rail(frame, 0, -0.87, 0.15, w * 0.99, 0.22, 0.85, mould);
  rail(frame, 0, 0.86, 0.14, w * 1.02, 0.2, 0.86, oak);
  for (const s of [-1, 1]) frame.add(beam(s * w * 0.29, -1.47, -0.06, s * w * 0.29, -0.85, 0.5, 0.11, 0.14, mould));
  g.add(frame);
}
function goods(g, seed, x, z) {
  const type = seed % 3;
  rail(g, x, 0.71, z, 1.58, 0.13, 0.64, oak);
  for (const side of [-1, 1]) rail(g, x + side * 0.63, 0.34, z, 0.11, 0.68, 0.43, oak);
  if (type === 0) {
    for (let i = 0; i < 6; i++) {
      const y = 0.98 + 0.06 * (i % 3),
        u = x - 0.58 + i * 0.19;
      const book = rail(g, u, y, z, 0.13, 0.37 + 0.1 * (i % 3), 0.38, volumes[(i + seed) % 5]);
      book.rotation.z = i === 4 ? 0.17 : 0;
    }
  } else if (type === 1) {
    for (let i = 0; i < 4; i++) {
      const u = x - 0.52 + i * 0.34;
      g.add(
        sphere(0.14, volumes[(i + 2) % 5], u, 0.92, z, 7, 5),
        cyl(0.055, 0.078, 0.16, glass, u, 1.08, z, 7),
        cyl(0.062, 0.061, 0.042, mould, u, 1.18, z, 7)
      );
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const u = x - 0.49 + i * 0.47;
      g.add(
        cyl(0.17, 0.12, 0.19, mould, u, 0.87, z, 8),
        sphere(0.12, i % 2 ? volumes[0] : volumes[2], u, 0.99, z, 7, 5)
      );
    }
  }
}
function arcade(g, w, z, seed) {
  const depth = 1.38,
    front = z + depth,
    colW = 0.22,
    span = w * 0.435,
    baseline = 2.16;
  const top = 3.44;
  rail(g, 0, top + 0.09, z + depth * 0.5, w + 0.36, 0.28, depth + 0.3, oak);
  for (const x of [-span, 0, span]) {
    rail(g, x, baseline * 0.5, front, colW, baseline, 0.28, limestone);
    rail(g, x, 0.13, front, 0.48, 0.26, 0.54, edge);
    rail(g, x, baseline, front, 0.49, 0.23, 0.48, edge);
  }
  for (const side of [-1, 1]) {
    const mid = side * span * 0.5,
      r = span * 0.5;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * i) / 8,
        b = (Math.PI * (i + 1)) / 8;
      g.add(
        beam(
          mid + r * Math.cos(a),
          baseline + 0.99 * Math.sin(a),
          front,
          mid + r * Math.cos(b),
          baseline + 0.99 * Math.sin(b),
          front,
          0.2,
          0.36,
          i % 2 ? edge : limestone
        )
      );
    }
  }
  goods(g, seed, -span * 0.48, z + 0.63);
  rail(g, span * 0.48, top - 0.54, front - 0.14, span * 0.7, 0.62, 0.06, aprons[seed % 3]);
  for (const s of [-1, 1]) rail(g, span * 0.48 + s * span * 0.28, top - 0.12, front - 0.14, 0.05, 0.35, 0.065, brass);
}
function sideElevation(g, length, h, seed) {
  const low = h * 0.48,
    upper = h * 0.93;
  for (const k of [-0.48, 0, 0.48]) rail(g, k * length, h * 0.51, 0.04, 0.13, h * 0.96, 0.14, oak);
  rail(g, 0, low, 0.07, length, 0.22, 0.18, oak);
  for (const side of [-1, 1]) {
    const u = side * length * 0.247;
    const wnd = h * 0.64,
      tall = 1.54;
    rail(g, u, wnd, 0.12, 1.3, tall, 0.12, oak);
    for (const s of [-1, 1]) rail(g, u + s * 0.27, wnd, 0.2, 0.41, tall - 0.19, 0.05, lightGlass);
    rail(g, u, wnd + 0.12, 0.25, 1.06, 0.068, 0.05, putty);
    const post = u + side * 0.71;
    rail(g, post, wnd, 0.12, 0.24, tall, 0.11, aprons[seed % 3]);
    rail(g, u, wnd - tall * 0.5 - 0.065, 0.22, 1.62, 0.16, 0.36, limestone);
    const a = u + side * 0.25 * length * 0.45,
      b = u + side * 0.41 * length * 0.48;
    g.add(beam(a, low + 0.13, 0.108, b, upper - 0.19, 0.108, 0.12, 0.12, mould));
  }
  rail(g, 0, 0.34, 0.03, length, 0.59, 0.19, limestone);
  if (seed % 3 !== 2) {
    const x = length * 0.23;
    rail(g, x, h * 0.257, 0.105, 1.41, 1.52, 0.13, oak);
    for (let j = 0; j < 3; j++) rail(g, x - 0.4 + 0.4 * j, h * 0.257, 0.21, 0.27, 1.23, 0.055, glass);
    rail(g, x, h * 0.257 + 0.12, 0.243, 1.28, 0.08, 0.06, mould);
    rail(g, x, h * 0.257 - 0.83, 0.24, 1.68, 0.13, 0.36, edge);
  }
}
export function finishFrontage(g, { w, d, h, rise, seed, shop, shutters }) {
  const z = d * 0.5 + 0.02;
  // The braces mark each bay individually. Casements and adjoining party walls
  // remain readable even when a nearby building hides the front door.
  for (const side of [-1, 1]) {
    const bx = side * w * 0.481;
    rail(g, bx, h * 0.73, z + 0.09, 0.13, h * 0.5, 0.16, oak);
    g.add(beam(bx, h * 0.5, z + 0.12, side * w * 0.37, h * 0.68, z + 0.12, 0.11, 0.16, oak));
    if (shutters) {
      const sx = side * w * 0.275 + side * 0.737,
        y = h * 0.72;
      rail(g, sx, y, z + 0.15, 0.36, 1.49, 0.096, aprons[seed % 3]);
      for (const yy of [-0.53, 0.45]) rail(g, sx, y + yy, z + 0.22, 0.35, 0.078, 0.061, mould);
    }
    const eave = new THREE.Group();
    eave.rotation.y = (side * Math.PI) / 2;
    eave.position.x = side * w * 0.5;
    for (const fraction of [-0.38, -0.13, 0.13, 0.38]) {
      const bz = d * fraction;
      eave.add(beam(bz, h - 0.65, 0.0, bz, h - 0.08, 0.41, 0.11, 0.12, oak));
    }
    g.add(eave);
  }
  // Doors and alleys reveal all four elevations, including the rear of a house.
  for (const [angle, xx, zz, len] of [
    [Math.PI, 0, -d / 2, w],
    [-Math.PI / 2, -w / 2, 0, d],
    [Math.PI / 2, w / 2, 0, d]
  ]) {
    const face = new THREE.Group();
    face.rotation.y = angle;
    face.position.set(xx, 0, zz);
    sideElevation(face, len, h, seed);
    g.add(face);
  }
  if (seed % 3 !== 0) oriel(g, -w * 0.29, z + 0.06, w * 0.265, h * 0.72);
  if (shop) arcade(g, w, z, seed);
  if (seed % 3 === 0) {
    // An exposed gable over the party wall carries a king post and paired struts.
    rail(g, 0, h + rise * 0.39, z + 0.4, 0.12, rise * 0.73, 0.15, oak);
    for (const s of [-1, 1])
      g.add(beam(s * w * 0.27, h + 0.1, z + 0.41, 0, h + rise * 0.64, z + 0.41, 0.13, 0.15, oak));
  }
  if (seed % 2 === 0) {
    const cx = -w * 0.26,
      cy = h + rise * 0.58,
      cz = -d * 0.25;
    rail(g, cx, cy, cz, 0.56, 1.43, 0.64, limestone);
    g.add(cyl(0.25, 0.25, 0.2, edge, cx, cy + 0.69, cz, 8), cyl(0.2, 0.16, 0.58, volumes[0], cx, cy + 1, cz, 8));
  }
}
