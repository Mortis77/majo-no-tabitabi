// Pleated washi chōchin. Town, fox-fire and hand-held lights share the geometry and ink plate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, TAU } from '../../core/util.js';
import { M } from './kit.js';

const sleeves = new WeakMap();
let inkPlate, shell, hardware;

function paperPrint() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const c = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height;
  const wash = c.createLinearGradient(0, 0, 0, h);
  for (const [stop, color] of [
    [0, '#82695e'],
    [0.08, '#b5a397'],
    [0.26, '#ebdfcf'],
    [0.54, '#f9efe2'],
    [0.83, '#dfd0be'],
    [1, '#806858'],
  ])
    wash.addColorStop(stop, color);
  c.fillStyle = wash;
  c.fillRect(0, 0, w, h);
  // Long kozo fibres in the paper and the shadows of the bamboo hoops.
  const rnd = mulberry32(64021);
  for (let i = 0; i < 4500; i++) {
    const x = rnd() * w,
      y = rnd() * h,
      dx = rnd() * 4 + 1;
    c.strokeStyle = rnd() < 0.55 ? 'rgba(255,255,244,.24)' : 'rgba(85,59,59,.14)';
    c.lineWidth = rnd() * 0.65 + 0.35;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + dx, y + rnd() * 3 - 1.5);
    c.stroke();
  }
  for (let row = 1; row < 16; row++) {
    const y = (h * row) / 16;
    c.fillStyle = row === 3 || row === 13 ? 'rgba(70,51,49,.38)' : 'rgba(95,73,66,.24)';
    c.fillRect(0, y, w, 1.8);
    c.fillStyle = 'rgba(255,251,225,.40)';
    c.fillRect(0, y + 2, w, 1.4);
  }
  // Three five-petal bellflower crests around the belly. Knock the veins out of each inked petal.
  for (let i = 0; i <= 3; i++) {
    c.save();
    c.translate((w * i) / 3, h * 0.5);
    c.scale(0.73, 1);
    c.strokeStyle = '#756665';
    c.lineWidth = 2;
    for (let j = 0; j < 5; j++) {
      const angle = -Math.PI / 2 + (j * TAU) / 5;
      c.beginPath();
      c.arc(0, 0, 48, angle + 0.12, angle + TAU / 5 - 0.12);
      c.stroke();
    }
    for (let j = 0; j < 5; j++) {
      c.save();
      c.rotate((j * TAU) / 5);
      c.fillStyle = '#66555b';
      c.beginPath();
      c.moveTo(0, -5);
      c.bezierCurveTo(-8, -9, -18, -25, -13, -29);
      c.bezierCurveTo(-9, -32, -5, -32, 0, -40);
      c.bezierCurveTo(5, -32, 9, -32, 13, -29);
      c.bezierCurveTo(18, -25, 8, -9, 0, -5);
      c.fill();
      c.strokeStyle = '#d4bcae';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(0, -10);
      c.quadraticCurveTo(-1, -20, 0, -30);
      c.stroke();
      c.restore();
    }
    c.fillStyle = '#675660';
    c.beginPath();
    c.arc(0, 0, 4.7, 0, TAU);
    c.fill();
    c.restore();
  }
  // Offset repeating seigaiha wave border, kept small beneath the blossom.
  c.save();
  c.beginPath();
  c.rect(0, h * 0.74, w, h * 0.12);
  c.clip();
  c.strokeStyle = 'rgba(87,68,69,.64)';
  c.lineWidth = 1.55;
  for (let row = 0; row < 3; row++)
    for (let i = -1; i < 18; i++) {
      const x = i * 32 + (row % 2) * 16,
        y = h * 0.766 + row * 9;
      for (const r of [5, 10, 15]) {
        c.beginPath();
        c.ellipse(x, y, r, r * 0.84, 0, Math.PI, TAU);
        c.stroke();
      }
    }
  c.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function geometry() {
  // y is measured from the hanger. Explicit v coordinates keep ink strokes undistorted around the shoulders.
  const profile = [
    [-0.662, 0.133],
    [-0.637, 0.178],
    [-0.595, 0.21],
    [-0.52, 0.236],
    [-0.44, 0.244],
    [-0.3, 0.244],
    [-0.22, 0.236],
    [-0.151, 0.213],
    [-0.108, 0.171],
    [-0.088, 0.131],
  ];
  shell = new THREE.LatheGeometry(
    profile.map(([y, r]) => new THREE.Vector2(r, y)),
    16,
  );
  const uv = shell.attributes.uv,
    positions = shell.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (positions.getY(i) + 0.662) / 0.574);
  const collars = [];
  for (const [y, rTop, rBottom, h] of [
    [-0.084, 0.14, 0.142, 0.04],
    [-0.105, 0.157, 0.157, 0.018],
    [-0.656, 0.153, 0.154, 0.017],
    [-0.678, 0.144, 0.117, 0.033],
  ]) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, 12);
    g.translate(0, y, 0);
    collars.push(g);
  }
  const bow = new THREE.CatmullRomCurve3(
    [
      [-0.092, -0.07, 0],
      [-0.067, -0.017, 0],
      [0, 0, 0],
      [0.067, -0.017, 0],
      [0.092, -0.07, 0],
    ].map((p) => new THREE.Vector3(...p)),
  );
  collars.push(new THREE.TubeGeometry(bow, 8, 0.008, 4, false));
  hardware = mergeGeometries(collars, false);
  for (const part of collars) part.dispose();
}

/** A static, mergeable lamp with shared paper colour. The same material colour is animated by the street light controller. */
export function paperLanternStatic(light) {
  if (!shell) geometry();
  let paper = sleeves.get(light);
  if (!paper) {
    inkPlate ||= paperPrint();
    paper = new THREE.MeshBasicMaterial({ map: inkPlate, toneMapped: false });
    paper.color = light.color;
    paper.userData.farColor = light.color;
    paper.userData.glowAtFullStrength = light.userData.glowAtFullStrength;
    sleeves.set(light, paper);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(shell, paper), new THREE.Mesh(hardware, M.black()));
  return g;
}
