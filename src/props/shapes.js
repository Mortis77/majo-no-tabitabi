// Shared shapes + tagged materials for hand-built props (visual upgrade 2). Everything here is soft-edged so the cel
// band of the look layer catches an edge highlight: rounded boxes, lathed bodies, twisted ropes, ribbed paper.
// Used by src/props/models.js and the gameplay builders (pickups, collect, lanterns, mechanics).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL, toon, flat } from '../core/mats.js';

const gc = new Map();
const geo = (k, make) => { let g = gc.get(k); if (!g) { g = make(); g.userData.shared = true; gc.set(k, g); } return g; };
const place = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };

// ---- tagged materials (cached by toon(): same args -> same material) ---------------------------------------------------
export const M = {
  wood: () => toon(PAL.wood, { surface: 'wood' }),
  woodLight: () => toon(PAL.woodLight, { surface: 'wood' }),
  woodDark: () => toon(PAL.woodDark, { surface: 'wood' }),
  woodRed: () => toon(0x8e4a32, { surface: 'wood' }),
  iron: () => toon(0x4f525c, { surface: 'metal', look: { spec: 0.55, specPower: 40, rim: 0.45 } }),
  ironDark: () => toon(0x34363e, { surface: 'metal', look: { spec: 0.45, specPower: 34, rim: 0.4 } }),
  brass: () => toon(0xc9a24e, { surface: 'metal', look: { spec: 0.7, specPower: 52, rim: 0.5 } }),
  bronze: () => toon(0xa8823c, { surface: 'metal', look: { spec: 0.6, specPower: 44, rim: 0.45 } }),
  gold: () => toon(PAL.gold, { surface: 'metal', look: { spec: 0.75, specPower: 56, rim: 0.5 } }),
  rope: () => toon(0xc9a467, { surface: 'thatch', look: { scale: 0.25, detail: 0.7 } }),
  ropeRed: () => toon(PAL.mikoRed, { surface: 'cloth', look: { detail: 0.6 } }),
  paper: () => toon(PAL.paper, { surface: 'paper', look: { trans: 0.45, rim: 0.15 } }),
  paperWarm: () => toon(0xf3e3c8, { surface: 'paper', look: { trans: 0.45, rim: 0.15 } }),
  clay: () => toon(0xb8693c, { surface: 'earth', look: { spec: 0.12, specPower: 20, detail: 0.7, scale: 1.2 } }),
  glaze: (c) => toon(c, { surface: 'paint', look: { spec: 0.35, specPower: 46, detail: 0.4 } }),
  lacquer: (c = PAL.vermilion) => toon(c, { surface: 'paint', look: { spec: 0.3, specPower: 40 } }),
  burlap: () => toon(0xcdb58a, { surface: 'cloth', look: { detail: 1.3, bump: 1.4, scale: 0.6 } }),
  straw: () => toon(PAL.straw, { surface: 'thatch', look: { scale: 0.9 } }),
  strawDark: () => toon(PAL.strawDark, { surface: 'thatch', look: { scale: 0.9 } }),
  stone: () => toon(PAL.stone, { surface: 'stone' }),
  stoneDark: () => toon(PAL.stoneDark, { surface: 'stone' }),
  snow: () => toon(PAL.snow, { surface: 'rock', look: { detail: 0.35, bump: 0.5, spec: 0.15, specPower: 20 } }),
  ice: () => toon(0xa9dcff, { emissive: 0x1d4a6a, surface: 'none', look: { spec: 0.6, specPower: 70, rim: 0.7, trans: 0.3 } }),
  rock: () => flat(PAL.rock, { surface: 'rock' }),
};

// ---- geometry ----------------------------------------------------------------------------------------------------------------
/** Box with rounded edges (r = edge radius), centred on (x,y,z). */
export function rbox(w, h, d, mat, x, y, z, r = 0.02, seg = 2) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return place(new THREE.Mesh(geo(`rb${w},${h},${d},${rr},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, rr)), mat), x, y, z);
}
/** Lathe around +y from [[r, y], ...] (bottom to top). */
export function lathe(pts, mat, x = 0, y = 0, z = 0, seg = 20) {
  const key = 'la' + seg + ':' + pts.map((p) => p.join(',')).join(';');
  return place(new THREE.Mesh(geo(key, () => new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(Math.max(r, 1e-4), yy)), seg)), mat), x, y, z);
}
/** Smooth cylinder with softened rims (a lathe with tiny bevels), axis +y, centred. */
export function rcyl(rTop, rBot, h, mat, x, y, z, seg = 16, b = 0.012) {
  const bb = Math.min(b, h / 4, rTop / 2 + 1e-3, rBot / 2 + 1e-3);
  const p = [[0, -h / 2], [rBot - bb, -h / 2], [rBot, -h / 2 + bb], [rTop, h / 2 - bb], [rTop - bb, h / 2], [0, h / 2]];
  return lathe(p, mat, x, y, z, seg);
}
/** Ring (torus) lying flat (axis +y). */
export function ring(r, tube, mat, x, y, z, seg = 24, tseg = 6) {
  const m = place(new THREE.Mesh(geo(`rg${r},${tube},${seg},${tseg}`, () => { const g = new THREE.TorusGeometry(r, tube, tseg, seg); g.rotateX(Math.PI / 2); return g; }), mat), x, y, z);
  return m;
}
/** Twisted rope ring lying flat: two thin strands spiralling round a circle of radius r. */
export function ropeRing(r, thick, mat, x, y, z, turns = 0) {
  const n = turns || Math.max(10, Math.round(r * 90));
  const g = geo(`rr${r},${thick},${n}`, () => {
    const parts = [];
    for (let s = 0; s < 2; s++) {
      const pts = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2, ph = a * n + s * Math.PI;
        const rr = r + Math.cos(ph) * thick * 0.45;
        pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(ph) * thick * 0.45, Math.sin(a) * rr));
      }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, thick * 0.55, 5, true));
    }
    return mergeTwo(parts);
  });
  return place(new THREE.Mesh(g, mat), x, y, z);
}
/** Tube through points [[x,y,z], ...] (ropes, fuses, cords). */
export function tube(pts, radius, mat, seg = 12, rseg = 5) {
  const key = 'tu' + radius + ':' + seg + ':' + rseg + ':' + pts.map((p) => p.map((v) => v.toFixed(3)).join(',')).join(';');
  const g = geo(key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, radius, rseg, false));
  return place(new THREE.Mesh(g, mat));
}
/** Sphere deformed by a cheap value-noise (sacks, snow, rocks); seeded, cached. */
export function lumpy(r, mat, x, y, z, amp = 0.08, seed = 1, w = 16, h = 12, sx = 1, sy = 1, sz = 1) {
  const g = geo(`lu${r},${amp},${seed},${w},${h},${sx},${sy},${sz}`, () => {
    const s = new THREE.SphereGeometry(r, w, h);
    const p = s.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      const k = 1 + amp * (Math.sin(n.x * 4.1 + seed) * Math.sin(n.y * 3.7 + seed * 1.3) + 0.6 * Math.sin(n.z * 5.3 + seed * 2.1) * Math.cos(n.x * 2.9));
      p.setXYZ(i, v.x * k * sx, v.y * k * sy, v.z * k * sz);
    }
    s.computeVertexNormals();
    return s;
  });
  return place(new THREE.Mesh(g, mat), x, y, z);
}
/** Smooth ellipsoid (radii rx, ry, rz) centred on (x,y,z), optional Euler rotation [rx, ry, rz]. Sculpted forms. */
export function ell(rx, ry, rz, mat, x, y, z, rot = null, w = 14, h = 10) {
  const m = place(new THREE.Mesh(geo(`el${w},${h}`, () => new THREE.SphereGeometry(1, w, h)), mat), x, y, z);
  m.scale.set(rx, ry, rz);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  return m;
}
/**
 * Swept body: a smooth tube through points [[x,y,z], ...] whose radius follows `radii` (sampled evenly along the curve,
 * linear in between; a 0 at the end makes a pointed tip). Ends are closed with a fan. Limbs, tails, necks, curls.
 */
export function sweep(pts, radii, mat, seg = 14, rseg = 9) {
  const key = 'sw' + seg + ':' + rseg + ':' + radii.map((r) => r.toFixed(3)).join(',') + ':' + pts.map((p) => p.map((v) => v.toFixed(3)).join(',')).join(';');
  const g = geo(key, () => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const fr = curve.computeFrenetFrames(seg, false);
    const pos = [], idx = [];
    const rAt = (t) => { const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)), k = f - i; return radii[i] * (1 - k) + radii[i + 1] * k; };
    const P = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg; curve.getPointAt(t, P);
      const r = Math.max(rAt(t), 1e-4), N = fr.normals[i], B = fr.binormals[i];
      for (let j = 0; j < rseg; j++) {
        const a = (j / rseg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        pos.push(P.x + (N.x * c + B.x * s) * r, P.y + (N.y * c + B.y * s) * r, P.z + (N.z * c + B.z * s) * r);
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < rseg; j++) {
      const a = i * rseg + j, b = i * rseg + (j + 1) % rseg, c = a + rseg, d = b + rseg;
      idx.push(a, b, c, b, d, c);              // outward (N cos + B sin turns counter-clockwise about T)
    }
    // end fans (a centre vertex each)
    const c0 = pos.length / 3; curve.getPointAt(0, P); pos.push(P.x, P.y, P.z);
    const c1 = pos.length / 3; curve.getPointAt(1, P); pos.push(P.x, P.y, P.z);
    for (let j = 0; j < rseg; j++) { const jn = (j + 1) % rseg; idx.push(c0, jn, j); idx.push(c1, seg * rseg + j, seg * rseg + jn); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setIndex(idx);
    out.computeVertexNormals();
    return out;
  });
  return place(new THREE.Mesh(g, mat));
}
/** Open cone band (cloth bib, apron, collar skirt): radius rTop -> rBot over h, `arc` radians centred on +z. Two-sided. */
export function skirt(rTop, rBot, h, arc, mat, x, y, z, seg = 12) {
  const g = geo(`sk${rTop},${rBot},${h},${arc},${seg}`, () => {
    const a = new THREE.CylinderGeometry(rTop, rBot, h, seg, 3, true, -arc / 2, arc);
    // a soft hang: the free hem bellies out a little in the middle
    const p = a.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = (h / 2 - p.getY(i)) / h, ang = Math.atan2(p.getX(i), p.getZ(i)), k = 1 + 0.08 * v * Math.cos(ang * 2.2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    a.computeVertexNormals();
    const b = a.clone(); const ix = b.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    const n = b.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    return mergeTwo([a, b]);
  });
  return place(new THREE.Mesh(g, mat), x, y, z);
}
/**
 * Chipped edge: a copy of the mesh's geometry where every vertex on the outer side of a cutting plane is pushed onto it,
 * so a corner reads as broken off (a flat new facet). Plane through point p (local) with outward normal n.
 */
export function chip(mesh, p, n, r = 0.12) {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const P = src.attributes.position, N = new THREE.Vector3(...n).normalize(), v = new THREE.Vector3(), q = new THREE.Vector3(...p);
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const d = v.clone().sub(q).dot(N);
    if (d > 0 && v.distanceTo(q) < r + d) { v.addScaledVector(N, -d); P.setXYZ(i, v.x, v.y, v.z); }
  }
  src.computeVertexNormals();
  mesh.geometry = src;
  return mesh;
}
/** Faceted gem star (星屑): n points, flat facets that catch the cel band, front / back apex. Centred, faces +z. */
export function gemStar(r0, r1, depth, mat, n = 5) {
  const g = geo(`gs${r0},${r1},${depth},${n}`, () => {
    const pos = [], rim = [];
    for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? r1 : r0; rim.push([Math.cos(a) * r, Math.sin(a) * r]); }
    for (const s of [1, -1]) for (let i = 0; i < n * 2; i++) {
      const a = rim[i], b = rim[(i + 1) % (n * 2)];
      // edge ridge: the rim is a thin knife edge, the apex bulges
      const tri = [[0, 0, s * depth], [a[0], a[1], 0], [b[0], b[1], 0]];
      if (s < 0) tri.reverse();
      for (const v of tri) pos.push(...v);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.computeVertexNormals();
    return out;
  });
  return place(new THREE.Mesh(g, mat));
}
/** Ema / sign board outline: a pentagon with a pitched top, extruded with a soft bevel. Centred, faces +z. */
export function emaBoard(w, h, d, mat) {
  const g = geo(`ema${w},${h},${d}`, () => {
    const s = new THREE.Shape(), hw = w / 2, hh = h / 2, sh = h * 0.28;
    s.moveTo(-hw, -hh); s.lineTo(hw, -hh); s.lineTo(hw, hh - sh); s.lineTo(0, hh); s.lineTo(-hw, hh - sh); s.closePath();
    const e = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: d * 0.35, bevelSize: Math.min(0.012, d * 0.5), bevelSegments: 2, curveSegments: 4 });
    e.translate(0, 0, -d / 2);
    return e;
  });
  return place(new THREE.Mesh(g, mat));
}
/** Paper lantern body: a ribbed lathe (bellied), radius r, height h, centred; `ribs` raised bamboo hoops. */
export function paperLantern(r, h, mat, ribMat, ribs = 6, seg = 18) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12, y = -h / 2 + t * h; pts.push([r * (0.62 + 0.38 * Math.sin(t * Math.PI)), y]); }
  g.add(lathe(pts, mat, 0, 0, 0, seg));
  if (ribMat) for (let i = 1; i < ribs; i++) { const t = i / ribs; g.add(ring(r * (0.62 + 0.38 * Math.sin(t * Math.PI)) + 0.003, Math.max(0.004, r * 0.03), ribMat, 0, -h / 2 + t * h, 0, seg, 4)); }
  return g;
}
function mergeTwo(parts) {
  // tiny merge (non-indexed) to avoid importing BufferGeometryUtils twice in hot paths
  const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

/** Wooden plank crate (planks with gaps, corner posts, iron corner plates + rivets). Base at y = 0. */
export function plankCrate(w, h, d, { planks = 4, wood = M.woodLight(), frame = M.wood(), iron = M.iron(), lid = true } = {}) {
  const g = new THREE.Group();
  g.add(rbox(w - 0.04, h - 0.04, d - 0.04, M.woodDark(), 0, h / 2, 0, 0.01, 1));   // dark inner box shows through the gaps
  const ph = (h - 0.08) / planks;
  for (let i = 0; i < planks; i++) {
    const y = 0.04 + ph * (i + 0.5), tw = 0.004 * ((i * 7) % 3);
    g.add(rbox(w - 0.1, ph - 0.012, 0.03, wood, tw, y, d / 2 - 0.012, 0.008, 1), rbox(w - 0.1, ph - 0.012, 0.03, wood, -tw, y, -d / 2 + 0.012, 0.008, 1));
    g.add(rbox(0.03, ph - 0.012, d - 0.1, wood, w / 2 - 0.012, y, tw, 0.008, 1), rbox(0.03, ph - 0.012, d - 0.1, wood, -w / 2 + 0.012, y, -tw, 0.008, 1));
  }
  if (lid) for (let i = 0; i < planks; i++) { const pw = (w - 0.08) / planks; g.add(rbox(pw - 0.012, 0.03, d - 0.06, wood, -w / 2 + 0.04 + pw * (i + 0.5), h - 0.012, 0, 0.008, 1)); }
  const fw = Math.min(0.07, w * 0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(rbox(fw, h, fw, frame, sx * (w / 2 - fw / 2 + 0.006), h / 2, sz * (d / 2 - fw / 2 + 0.006), 0.012, 2));
    // corner plates + rivets, top and bottom
    for (const yy of [0.06, h - 0.06]) {
      g.add(rbox(fw + 0.026, 0.1, fw + 0.026, iron, sx * (w / 2 - fw / 2 + 0.006), yy, sz * (d / 2 - fw / 2 + 0.006), 0.01, 1));
    }
  }
  for (const sy of [0.03, h - 0.03]) {
    g.add(rbox(w + 0.004, 0.05, 0.04, frame, 0, sy, d / 2, 0.01, 1), rbox(w + 0.004, 0.05, 0.04, frame, 0, sy, -d / 2, 0.01, 1));
    g.add(rbox(0.04, 0.05, d + 0.004, frame, w / 2, sy, 0, 0.01, 1), rbox(0.04, 0.05, d + 0.004, frame, -w / 2, sy, 0, 0.01, 1));
  }
  return g;
}
