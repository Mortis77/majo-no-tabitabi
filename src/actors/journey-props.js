// Shared by the rider and Saya. The coordinates match the hand and seat contact curve.
import * as THREE from 'three';
import { shaftProfile } from './broom-contact.js';
import { makeCelMaterial } from './celmat.js';
const TAU = Math.PI * 2,
  cache = {};
function maker() {
  const p = [],
    c = [],
    i = [];
  function rod(rows, col, sides = 9) {
    const path = rows.map((row) => new THREE.Vector3(...row.slice(0, 3))),
      base = p.length / 3;
    const color = new THREE.Color(col);
    for (let k = 0; k < rows.length; k++) {
      const t = path[Math.min(k + 1, path.length - 1)]
        .clone()
        .sub(path[Math.max(0, k - 1)])
        .normalize();
      const right = new THREE.Vector3()
        .crossVectors(Math.abs(t.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0), t)
        .normalize();
      const normal = new THREE.Vector3().crossVectors(t, right).normalize();
      for (let s = 0; s < sides; s++) {
        const a = (TAU * s) / sides,
          r = rows[k][3],
          v = path[k]
            .clone()
            .addScaledVector(right, r * Math.cos(a))
            .addScaledVector(normal, r * Math.sin(a));
        p.push(...v.toArray());
        const light = 0.96 + 0.04 * Math.sin(a * 3 + k * 0.23);
        c.push(color.r * light, color.g * light, color.b * light);
        if (k < rows.length - 1) {
          const a0 = base + k * sides + s,
            b = base + k * sides + ((s + 1) % sides);
          i.push(a0, b, a0 + sides, b, b + sides, a0 + sides);
        }
      }
    }
    for (let s = 1; s < sides - 1; s++) {
      i.push(base, base + s + 1, base + s);
      const j = base + (rows.length - 1) * sides;
      i.push(j, j + s, j + s + 1);
    }
  }
  return {
    rod,
    bake(name) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      g.setIndex(i);
      g.computeVertexNormals();
      const pbr = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
      pbr.name = 'cloth_' + name;
      const mesh = new THREE.Mesh(g, makeCelMaterial(pbr, 'cloth', { sph: 0 }));
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    },
  };
}
function buildBroom() {
  const m = maker(),
    axis = shaftProfile.map((p) => [p.x, p.y, p.z, p.r]);
  axis.push([0.006, -0.007, 0.679, 0.017], [0.008, -0.007, 0.72, 0.011], [0.008, -0.007, 0.734, 0.002]);
  m.rod(axis, '#966b4d', 15);
  // Slightly curled birch twig bundles, brightest outer twigs spaced to read in silhouette.
  const tones = ['#8c6146', '#9e7352', '#b3895f', '#aa7857', '#7f5d49', '#c59b6e'];
  let seed = 1937;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let n = 0; n < 57; n++) {
    const a = n * 2.399963,
      rr = Math.sqrt((n + 0.5) / 57),
      x = Math.cos(a) * rr,
      y = Math.sin(a) * rr,
      k = 0.9 + rand() * 0.21,
      z = -0.94 - 0.23 * rand();
    m.rod(
      [
        [x * 0.023, y * 0.022, -0.459, 0.005],
        [x * 0.041, y * 0.034, -0.56, 0.015 * k],
        [x * 0.075, y * 0.063 + 0.005, -0.697, 0.021 * k],
        [x * 0.13, y * 0.1 + 0.024, -0.85, 0.017 * k],
        [x * 0.148, y * 0.113 + 0.052, z + 0.1, 0.009 * k],
        [x * 0.16 + 0.009 * Math.sin(a * 3), y * 0.117 + 0.086, z, 0.0012],
      ],
      tones[n % tones.length],
      6,
    );
    if (!(n % 3))
      m.rod(
        [
          [x * 0.104, y * 0.08 + 0.016, -0.79, 0.005],
          [x * 0.145 + 0.018, y * 0.11 + 0.047, -0.91, 0.003],
          [x * 0.173 + 0.015, y * 0.127 + 0.1, z - 0.03, 0.0007],
        ],
        tones[(n + 2) % tones.length],
        5,
      );
  }
  for (const [z, r] of [
    [-0.49, 0.031],
    [-0.501, 0.033],
    [-0.511, 0.035],
    [-0.523, 0.037],
    [-0.557, 0.044],
    [-0.567, 0.046],
  ]) {
    const pts = [];
    for (let s = 0; s <= 22; s++) {
      const a = (TAU * s) / 22;
      pts.push([r * Math.cos(a), r * 0.86 * Math.sin(a), z + 0.0015 * Math.cos(3 * a), 0.0042]);
    }
    m.rod(pts, '#66513f', 6);
  }
  return m.bake('Journey_birch_broom');
}
export function journeyBroom() {
  cache.broom ??= buildBroom();
  return cache.broom.clone();
}
export function journeyWand() {
  if (!cache.wand) {
    const m = maker();
    m.rod(
      [
        [0, -0.088, 0, 0.004],
        [0, -0.078, 0, 0.012],
        [0, -0.06, 0, 0.01],
        [0, 0.012, 0, 0.01],
        [0, 0.054, 0, 0.008],
        [0.002, 0.11, 0, 0.006],
        [0.005, 0.19, -0.001, 0.004],
        [0.009, 0.267, -0.003, 0.001],
      ],
      '#735048',
      13,
    );
    m.rod(
      [
        [0, 0.019, 0, 0.0105],
        [0, 0.023, 0, 0.012],
        [0, 0.033, 0, 0.012],
        [0, 0.037, 0, 0.0095],
      ],
      '#cbaa72',
      14,
    );
    m.rod(
      [
        [0, -0.092, 0, 0.002],
        [0, -0.085, 0, 0.007],
        [0, -0.079, 0, 0.007],
      ],
      '#8ca5bc',
      9,
    );
    cache.wand = m.bake('Journey_ash_wand');
  }
  return cache.wand.clone();
}
