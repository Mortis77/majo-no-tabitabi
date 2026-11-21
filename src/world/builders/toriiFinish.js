// The ceremonial gates have a twisted shimenawa, folded paper and lacquered wooden pillars.
import * as THREE from 'three';
import { cyl, torus } from '../../core/geo.js';
import { own } from '../../core/mats.js';
import { mulberry32, TAU } from '../../core/util.js';
import { M } from './kit.js';

let lacquer;
export function redPost() {
  if (lacquer) return lacquer;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 512;
  const ctx = cv.getContext('2d'),
    w = cv.width,
    h = cv.height;
  // The varnish darkens at the join and above the plinth. Long dragged strokes reveal the timber grain.
  const base = ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, color] of [
    [0, '#d5bbad'],
    [0.17, '#fbf1df'],
    [0.52, '#e9d2bf'],
    [0.8, '#e2c9ae'],
    [1, '#bca191'],
  ])
    base.addColorStop(at, color);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const rnd = mulberry32(17233);
  for (let i = 0; i < 1650; i++) {
    const x = rnd() * w,
      y = rnd() * h,
      length = 8 + 110 * rnd(),
      sway = (rnd() - 0.5) * 3;
    ctx.strokeStyle = rnd() < 0.52 ? 'rgba(89,73,64,.13)' : 'rgba(255,246,217,.18)';
    ctx.lineWidth = 0.25 + rnd() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sway, y + length * 0.43, x + sway * 0.35, y + length);
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 4;
  lacquer = own(M.verm());
  lacquer.map = map;
  lacquer.userData.farColor = M.verm().color;
  return lacquer;
}

let hemp;
function strandMaterial() {
  if (hemp) return hemp;
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const ctx = cv.getContext('2d'),
    pixels = ctx.createImageData(cv.width, cv.height);
  // Every strand continues on the reverse side. Its changing grain follows its twist around the catenary.
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const turns = 3 * (1 - (y + 0.5) / cv.height) - (11 * (x + 0.5)) / cv.width;
      const ridge = 0.5 + 0.5 * Math.cos(TAU * turns);
      const groove = Math.pow(1 - ridge, 2.6);
      const fibre = 3.5 * Math.sin(TAU * (turns * 11 + ((x + 0.5) * 2) / cv.width));
      const i = (y * cv.width + x) * 4;
      pixels.data[i] = 251 - 75 * groove + fibre;
      pixels.data[i + 1] = 238 - 99 * groove + fibre;
      pixels.data[i + 2] = 210 - 109 * groove + fibre;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  hemp = own(M.rope());
  hemp.map = map;
  hemp.userData.farColor = M.rope().color;
  return hemp;
}

function braidedRope(span, y, s) {
  const segments = 68,
    sides = 12,
    pos = [],
    uv = [],
    idx = [];
  function centre(f) {
    return new THREE.Vector3((2 * f - 1) * span, y - 0.32 * s * 4 * f * (1 - f), 0.075 * s);
  }
  for (let i = 0; i <= segments; i++) {
    const f = i / segments,
      mid = centre(f);
    const slope = (-0.32 * s * 4 * (1 - 2 * f)) / (2 * span);
    const inv = 1 / Math.hypot(slope, 1);
    const belly = 0.073 + 0.078 * Math.pow(Math.sin(Math.PI * f), 0.82);
    for (let j = 0; j <= sides; j++) {
      const a = (j * TAU) / sides;
      const r = s * belly * (1 + 0.19 * Math.cos(3 * a - TAU * 11 * f));
      const lift = r * Math.cos(a) * inv;
      pos.push(mid.x - slope * lift, mid.y + lift, mid.z + r * Math.sin(a));
      uv.push(f, j / sides);
      if (i < segments && j < sides) {
        const k = i * (sides + 1) + j,
          next = k + sides + 1;
        idx.push(k, k + 1, next, next, k + 1, next + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { mesh: new THREE.Mesh(geo, strandMaterial()), centre };
}

let shide;
function foldedPaper() {
  if (shide) return shide;
  // Fold one ribbon forward, then back to the next tier. Front and back have their own normals.
  const front = [];
  const panels = [
    [-0.02, 0.11, 0, 0],
    [-0.02, 0.11, -0.23, 0.045],
    [0.055, 0.185, -0.2, -0.025],
    [0.055, 0.185, -0.38, 0.01],
    [0.14, 0.27, -0.35, -0.045],
    [0.14, 0.27, -0.535, -0.018],
  ];
  for (let i = 1; i < panels.length; i++) {
    const [l0, r0, y0, z0] = panels[i - 1],
      [l1, r1, y1, z1] = panels[i];
    front.push(l0, y0, z0, l1, y1, z1, r0, y0, z0, r0, y0, z0, l1, y1, z1, r1, y1, z1);
  }
  const both = front.slice();
  for (let k = 0; k < front.length; k += 9)
    both.push(...front.slice(k, k + 3), ...front.slice(k + 6, k + 9), ...front.slice(k + 3, k + 6));
  shide = new THREE.BufferGeometry();
  shide.setAttribute('position', new THREE.Float32BufferAttribute(both, 3));
  shide.computeVertexNormals();
  return shide;
}

export function gateRope(span, y, s) {
  const g = new THREE.Group(),
    { mesh, centre } = braidedRope(span, y, s);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  for (const side of [-1, 1]) {
    for (const dy of [-0.045, 0.045]) {
      const ring = torus(0.184 * s, 0.028 * s, strandMaterial(), side * span, y + dy * s, 0, 5, 14);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
  }
  for (const [i, f] of [0.18, 0.39, 0.6, 0.81].entries()) {
    const p = centre(f),
      fold = new THREE.Mesh(foldedPaper(), M.white());
    fold.position.set(p.x, p.y - 0.04 * s, p.z + 0.045 * s);
    fold.scale.setScalar(s);
    fold.rotation.y = i % 2 ? -0.32 : 0.19;
    fold.rotation.z = i % 2 ? -0.15 : 0.06;
    g.add(fold);
  }
  for (const f of [0.085, 0.5, 0.915]) {
    const p = centre(f),
      k = f === 0.5 ? 1 : 0.72,
      length = 0.38 * k * s;
    g.add(cyl(0.024 * s, 0.08 * k * s, length, M.straw(), p.x, p.y - 0.03 * s - length / 2, p.z, 7));
    g.add(cyl(0.036 * s, 0.034 * s, 0.035 * s, strandMaterial(), p.x, p.y - 0.115 * s, p.z, 8));
  }
  return g;
}
