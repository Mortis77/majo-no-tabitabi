// Set-dressing pieces built from primitives and meant to be merged into a site (no live parts).
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { PAL, toon, glow } from '../../core/mats.js';
import { box, cyl, cone, sphere, torus, bakeStatic } from '../../core/geo.js';
import { TAU, mulberry32 } from '../../core/util.js';
import { M, mat, makeRoof, rope, textTexture, texMat, texGlow, rod, clothify, bevelBox } from './kit.js';
import { makeStoneLantern, makeTorii } from './factories.js';
import { rbox, rcyl, lumpy, ropeRing, ring, ell, sweep, skirt, lathe } from '../../props/shapes.js';
import { sculptOn, sculptGroup, noteSite } from './sculpt.js';

/** Strip live flags and swap the fire paper so a factory model merges into the site as static decoration. */
function staticize(group, paperMat, flameMat = null) {
  const drop = [];
  group.traverse((o) => {
    o.userData.dynamic = false;
    o.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
    if (o.userData.flame) { if (flameMat && o.isMesh) o.material = flameMat; else if (!flameMat) drop.push(o); return; }
    if (o.isMesh && o.material && o.material.userData && o.material.userData.setGlow) o.material = paperMat;
  });
  for (const o of drop) o.removeFromParent();
  return group;
}
/** Stone lantern as merged decoration (lit = warm glowing paper, else dark paper). moss = the moss cap on the roof (only
 *  where the site already has the moss material, e.g. the shrine; elsewhere it would be one more draw call). */
export function stoneLanternDecor(lit = false, moss = false) {
  return staticize(makeStoneLantern({ moss }).group, lit ? M.lampWarm(2.6) : mat.paper(0x4b3b33), lit ? M.lampHot(3.2) : null);
}
/** Torii as decoration (already baked; merges fine). */
export function toriiDecor(size = 1, opts) { return makeTorii(size, opts); }

/** Shared canvas textures for banners etc. (by text+style). */
const texCache = new Map();
export function cachedTex(key, make) { let t = texCache.get(key); if (!t) { t = make(); texCache.set(key, t); } return t; }
const matCache = new Map();
export function cachedMat(key, make) { let m = matCache.get(key); if (!m) { m = make(); matCache.set(key, m); } return m; }

/**
 * Banner cloth: a softly billowing sheet with a front AND a back face (same vertices, opposite winding, mirrored u), so
 * the text reads the right way round from both sides. Use with a FrontSide material.
 */
const bannerGeos = new Map();
function bannerGeo(w, hh) {
  const k = w + ':' + hh.toFixed(3);
  let geo = bannerGeos.get(k);
  if (geo) return geo;
  const front = new THREE.PlaneGeometry(w, hh, 4, 12);
  const p = front.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / w + 0.5, v = 0.5 - p.getY(i) / hh; // u: 0 at the pole -> 1 free edge; v: 0 top -> 1 bottom
    p.setZ(i, Math.sin(v * 5.2 + u * 1.3) * 0.035 * (0.25 + u) * (0.3 + v) + Math.sin(u * Math.PI) * 0.018);
  }
  front.computeVertexNormals();
  const back = front.clone();
  const idx = back.index.array;
  for (let i = 0; i < idx.length; i += 3) { const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; }
  const n = back.attributes.normal, uv = back.attributes.uv;
  for (let i = 0; i < n.count; i++) { n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); uv.setX(i, 1 - uv.getX(i)); }
  // one buffer: positions/normals/uvs of both faces, indices of the back face shifted
  const cat = (a, b, size) => { const o = new Float32Array(a.count * size * 2); o.set(a.array, 0); o.set(b.array, a.count * size); return new THREE.BufferAttribute(o, size); };
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', cat(front.attributes.position, back.attributes.position, 3));
  geo.setAttribute('normal', cat(front.attributes.normal, back.attributes.normal, 3));
  geo.setAttribute('uv', cat(front.attributes.uv, back.attributes.uv, 2));
  const fi = front.index.array, off = front.attributes.position.count, ix = new Uint16Array(fi.length * 2);
  ix.set(fi, 0); for (let i = 0; i < idx.length; i++) ix[fi.length + i] = idx[i] + off;
  geo.setIndex(new THREE.BufferAttribute(ix, 1));
  bannerGeos.set(k, geo);
  return geo;
}

/** Nobori banner on a pole (vertical text, readable from both sides). */
export function nobori(text, { bg = '#c8322a', fg = '#fff6e0', h = 4.2, glowK = 0, crest = '' } = {}) {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.04, h, M.woodDark(), 0, h / 2, 0, 5));
  { const bar = cyl(0.025, 0.025, 0.62, M.woodDark(), 0.31, h - 0.08, 0, 4); bar.rotation.z = Math.PI / 2; g.add(bar); }
  const key = text + bg + fg + glowK + crest;
  // hand-lettered dye (lettering.js 'cloth'), the place's crest at the head of the banner; baked at 128 x 640
  const mat = cachedMat(key, () => { const tx = textTexture(text, { w: 64, h: 320, bg, fg, vertical: true, style: 'cloth', crest }); return clothify(glowK ? texGlow(tx, glowK) : texMat(tx), 0.14, 1); });
  const cloth = new THREE.Mesh(bannerGeo(0.6, h * 0.62), mat);
  cloth.position.set(0.32, h - 0.12 - h * 0.31, 0); cloth.castShadow = true;
  g.add(cloth);
  // cloth loops (chichi) tying the sheet to the pole and the top bar
  const hh = h * 0.62, top = h - 0.12;
  for (let i = 0; i < 5; i++) g.add(box(0.05, 0.05, 0.012, M.white(), 0.012, top - 0.06 - (hh - 0.12) * (i / 4), 0));
  for (let i = 0; i < 3; i++) g.add(box(0.05, 0.06, 0.012, M.white(), 0.1 + 0.22 * i, top + 0.015, 0));
  return g;
}

/** Shimenawa: thick straw rope between two points with paper shide zig-zags and tassels. */
export function shimenawa(a, b, sag = 0.4, r = 0.16) {
  const g = new THREE.Group();
  const rp = rope(a, b, sag, r, M.rope(), 14);
  g.add(rp.mesh);
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 1.1));
  for (let i = 1; i < n; i++) {
    const [x, y, z] = rp.at(i / n);
    const sh = new THREE.Group();
    for (let k = 0; k < 3; k++) { const p = box(0.12, 0.16, 0.012, M.white(), (k % 2 ? 0.05 : -0.05), -0.12 - k * 0.15, 0); sh.add(p); }
    sh.position.set(x, y - r * 0.6, z);
    sh.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI / 2;
    g.add(sh);
    if (i % 2 === 0) { const tas = cone(0.08, 0.35, M.straw(), x, y - r - 0.2, z, 6); tas.rotation.x = Math.PI; g.add(tas); }
  }
  return g;
}

/** Bonshō (temple bell) hanging in a small open bell house. Returns a builder result. */
export function bellHouse(build) {
  const b = build;
  const bell = new THREE.Group();
  bell.add(cyl(0.62, 0.72, 1.5, M.bronze(), 0, 0, 0, 16));
  bell.add(sphere(0.62, M.bronze(), 0, 0.72, 0, 16, 8));
  bell.add(cyl(0.74, 0.74, 0.08, M.bronze(), 0, -0.7, 0, 16));
  for (const y of [-0.3, 0.35]) bell.add(cyl(0.64, 0.66, 0.05, M.bronze(), 0, y, 0, 16));
  bell.add(torus(0.15, 0.05, M.bronze(), 0, 1.38, 0, 5, 10));
  bell.position.y = 2.15;
  b.group.add(bell);
  // striking log on ropes
  const log = cyl(0.12, 0.12, 1.6, M.woodLight(), 1.2, 2.0, 0, 8); log.rotation.x = Math.PI / 2; log.rotation.z = Math.PI / 2;
  log.rotation.set(0, Math.PI / 2, Math.PI / 2);
  b.group.add(log);
  return b;
}

/** Makiwara (straw practice target): post with a straw bundle and a red paper target. */
export function makiwara() {
  const g = new THREE.Group();
  g.add(cyl(0.09, 0.11, 1.9, M.wood(), 0, 0.95, 0, 6));
  g.add(cyl(0.3, 0.32, 0.9, M.straw(), 0, 1.25, 0, 10));
  for (const y of [0.9, 1.25, 1.6]) g.add(cyl(0.33, 0.33, 0.06, M.rope(), 0, y, 0, 10));
  const tgt = cyl(0.24, 0.24, 0.03, M.white(), 0, 1.3, 0.31, 14); tgt.rotation.x = Math.PI / 2; g.add(tgt);
  const t2 = cyl(0.14, 0.14, 0.035, M.red(), 0, 1.3, 0.32, 14); t2.rotation.x = Math.PI / 2; g.add(t2);
  return g;
}

/** Stone basin + bamboo spout (temizuya / spring). */
export function basin(w = 1.6) {
  const g = new THREE.Group();
  const d = w * 0.55;
  // a hewn granite trough on a plinth, rim worn round, water brimming, a bamboo spout trickling into it
  g.add(rbox(w + 0.16, 0.16, d + 0.16, M.stoneDark(), 0, 0.08, 0, 0.04, 2));
  g.add(rbox(w, 0.58, d, M.stone(), 0, 0.45, 0, 0.07, 2));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.24, d - 0.24), toon(0x2f6478, { surface: 'none', look: { spec: 1.2, specPower: 90, rim: 0.5 } }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.745; water.castShadow = false; g.add(water);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.1, 14), glow(0xcfefff, 1.1)); ring.rotation.x = -Math.PI / 2; ring.position.set(-w / 2 + 0.32, 0.75, 0); ring.castShadow = false; g.add(ring);
  const bam = mat.wood(0x9fb36a);
  g.add(rcyl(0.07, 0.08, 1.3, bam, -w / 2 - 0.12, 0.65, 0, 8));
  g.add(rod(-w / 2 - 0.12, 1.22, 0, -w / 2 + 0.3, 1.06, 0, 0.045, bam, 7));
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.33, 5, 1, true), glow(0xd8f4ff, 1.0)); stream.position.set(-w / 2 + 0.32, 0.89, 0); stream.castShadow = false; g.add(stream);
  // ladles resting across the trough
  for (let i = 0; i < 4; i++) { const x = -0.35 + i * 0.27; g.add(box(0.025, 0.025, 0.42, M.woodLight(), x, 0.76, d * 0.5 - 0.05)); g.add(rcyl(0.05, 0.045, 0.08, M.woodLight(), x, 0.79, d * 0.5 - 0.27, 8)); }
  return g;
}

/**
 * Carved guardian plinth (shared by the lion-dog and the fox): a foot slab, a die framed by corner pilasters (so the
 * faces read as recessed panels), a chamfered cap and a soft carved cushion. Returns the top height (scaled).
 */
function guardianPlinth(g, s, tall = 1, { moss: withMoss = true, carvedOnly = false } = {}) {
  const cv = M.carved(), st = carvedOnly ? cv : M.stone(), sd = carvedOnly ? cv : M.stoneDark(), dh = 0.56 * tall;
  g.add(rbox(1.2 * s, 0.22 * s, 1.4 * s, sd, 0, 0.11 * s, 0, 0.04, 1));
  g.add(rbox(0.86 * s, dh * s, 1.04 * s, st, 0, (0.22 + dh / 2) * s, 0, 0.03, 1));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rbox(0.12 * s, dh * s, 0.12 * s, st, sx * 0.44 * s, (0.22 + dh / 2) * s, sz * 0.53 * s, 0.025, 1));
  const capY = 0.22 + dh;
  g.add(bevelBox(1.06 * s, 0.13 * s, 1.24 * s, sd, 0, (capY + 0.065) * s, 0, 0.04 * s));
  g.add(rbox(0.84 * s, 0.08 * s, 1.0 * s, cv, 0, (capY + 0.17) * s, 0, 0.035, 2));
  if (!withMoss) return (capY + 0.21) * s;
  // moss where the slab meets the ground (two soft cushions, back corners)
  const moss = M.moss();
  g.add(ell(0.32 * s, 0.07 * s, 0.22 * s, moss, -0.48 * s, 0.03 * s, -0.55 * s, [0, 0.4, 0], 10, 6));
  g.add(ell(0.22 * s, 0.06 * s, 0.18 * s, moss, 0.55 * s, 0.03 * s, -0.4 * s, [0, -0.3, 0], 10, 6));
  return (capY + 0.21) * s;
}
/** A snail-shell curl of carved hair (mane, tail, elbows): a flat ring with a raised centre, facing +z before `rot`. */
function curl(g, r, mat, x, y, z, rot) {
  const c = ring(r, r * 0.42, mat, 0, 0, 0, 10, 5); c.rotation.x = Math.PI / 2;
  const k = ell(r * 0.62, r * 0.62, r * 0.5, mat, 0, 0, r * 0.12, null, 8, 6);
  const h = new THREE.Group(); h.add(c, k); h.position.set(x, y, z); if (rot) h.rotation.set(rot[0], rot[1], rot[2]);
  g.add(h);
}

/**
 * Komainu (lion-dog guardian) on a carved plinth; origin on the ground, faces +z. open = the 'a' twin (open mouth, paw on
 * a carved ball), else the 'un' (closed mouth). Sculpted from smooth parts: a seated body with folded hind legs, straight
 * forelegs with toed paws, a big square head with bulging eyes and brows, a mane of snail curls, a flame-brush tail and a
 * red cloth bib (yodarekake). Reads from two metres; ~9k triangles, 4 materials (carved / stone / stoneDark / moss + red).
 */
export function komainu(open = true, s = 1) {
  if (sculptOn('komainu')) {
    // sculpted pair (assets/models/sculpt/komainu_a|un.glb): one block (plinth + figure + moss + bib), scaled like the old
    const g = sculptGroup(open ? 'sculpt_komainu_a' : 'sculpt_komainu_un', 1, guardianMats(M.red()), { type: 'komainu', scale: s });
    if (g) { noteSite('komainu', open ? 'a' : 'un', g); return g; }
  }
  const g = oldKomainu(open, s);
  noteSite('komainu', open ? 'a-old' : 'un-old', g);
  return g;
}
/** Site materials the sculpted guardians' vertex-coloured LOD merges with (the old statues' carved stone, moss, bib). */
function guardianMats(bib) {
  return (n) => (/^Moss/.test(n) ? M.moss() : /^Bib/.test(n) ? bib : M.carved());
}
function oldKomainu(open, s) {
  const g = new THREE.Group(), C = M.carved(), sd = M.stoneDark();
  const y0 = guardianPlinth(g, s);
  const b = new THREE.Group(); b.position.y = y0; b.scale.setScalar(s); g.add(b);
  // body: haunch, rising torso, deep chest
  b.add(ell(0.3, 0.25, 0.33, C, 0, 0.24, -0.17));
  b.add(sweep([[0, 0.26, -0.2], [0, 0.48, -0.02], [0, 0.7, 0.08]], [0.26, 0.24, 0.19], C, 8, 12));
  b.add(ell(0.22, 0.25, 0.2, C, 0, 0.56, 0.1));
  // folded hind legs + hind paws
  for (const sx of [-1, 1]) {
    b.add(ell(0.12, 0.2, 0.25, C, sx * 0.24, 0.21, -0.12, [-0.35, 0, sx * 0.08]));
    b.add(ell(0.09, 0.06, 0.13, C, sx * 0.26, 0.055, 0.1));
    curl(b, 0.05, C, sx * 0.33, 0.26, -0.1, [0, sx * Math.PI / 2, 0]);            // thigh curl
  }
  // forelegs: straight, a little apart; the 'a' rests its right paw on a ball
  for (const sx of [-1, 1]) {
    const onBall = open && sx < 0, py = onBall ? 0.23 : 0.055;
    b.add(sweep([[sx * 0.15, 0.62, 0.11], [sx * 0.16, 0.36, 0.19], [sx * 0.165, py + 0.03, 0.25]], [0.1, 0.08, 0.072], C, 8, 10));
    b.add(ell(0.1, 0.065, 0.13, C, sx * 0.165, py, 0.3));
    for (const tx of [-0.05, 0, 0.05]) b.add(ell(0.035, 0.03, 0.04, C, sx * 0.165 + tx, py - 0.005, 0.41, null, 8, 6));
    curl(b, 0.045, C, sx * 0.25, 0.42, 0.17, [0, sx * 1.2, 0]);                     // elbow curl
  }
  if (open) b.add(ell(0.115, 0.115, 0.115, C, -0.17, 0.115, 0.3));
  // head: soft square skull, brows, bulging eyes, broad muzzle, nose, cheek tufts, drooping ears
  const hy = 0.98, hz = 0.17;
  b.add(rbox(0.4, 0.34, 0.34, C, 0, hy, hz, 0.12, 3));
  for (const sx of [-1, 1]) {
    b.add(ell(0.1, 0.05, 0.075, C, sx * 0.09, hy + 0.09, hz + 0.16, [0.2, 0, -sx * 0.25]));
    b.add(ell(0.05, 0.045, 0.04, C, sx * 0.09, hy + 0.025, hz + 0.165, null, 10, 8));
    b.add(ell(0.018, 0.018, 0.01, sd, sx * 0.09, hy + 0.025, hz + 0.205, null, 6, 4));
    b.add(ell(0.08, 0.075, 0.07, C, sx * 0.15, hy - 0.1, hz + 0.16));
    b.add(ell(0.075, 0.035, 0.11, C, sx * 0.21, hy + 0.07, hz - 0.03, [0.3, 0, sx * 0.7]));
  }
  b.add(rbox(0.3, 0.15, 0.18, C, 0, hy - 0.07, hz + 0.21, 0.065, 2));
  b.add(ell(0.075, 0.045, 0.05, C, 0, hy - 0.01, hz + 0.3, null, 10, 6));
  if (open) {
    b.add(rbox(0.22, 0.07, 0.13, sd, 0, hy - 0.17, hz + 0.21, 0.025, 1));             // mouth cavity
    b.add(rbox(0.25, 0.06, 0.16, C, 0, hy - 0.225, hz + 0.18, 0.025, 1));             // lower jaw
    for (const sx of [-1, 1]) {
      const f = cone(0.018, 0.06, C, sx * 0.08, hy - 0.17, hz + 0.27, 5); b.add(f);
      const f2 = cone(0.016, 0.05, C, sx * 0.08, hy - 0.165, hz + 0.27, 5); f2.rotation.x = Math.PI; b.add(f2);
    }
  } else {
    b.add(rbox(0.26, 0.07, 0.16, C, 0, hy - 0.17, hz + 0.19, 0.03, 1));
    b.add(box(0.2, 0.012, 0.02, sd, 0, hy - 0.14, hz + 0.29));                         // lip line
  }
  // mane: a shell behind the head covered in rows of curls, a curled beard under the jaw
  b.add(ell(0.3, 0.3, 0.17, C, 0, hy - 0.04, hz - 0.17));
  for (let row = 0; row < 3; row++) {
    const n = 7 - row, R = 0.29 - row * 0.07;
    for (let i = 0; i < n; i++) {
      const a = -1.35 + (2.7 * i) / (n - 1);
      curl(b, 0.05 - row * 0.006, C, Math.sin(a) * R, hy - 0.04 + Math.cos(a) * R * 0.95, hz - 0.2 - row * 0.05, [0, Math.PI, 0]);
    }
  }
  for (let i = 0; i < 6; i++) { const a = -1.25 + i * 0.5; curl(b, 0.047, C, Math.sin(a) * 0.28, hy - 0.04 + Math.cos(a) * 0.27, hz - 0.05, [0, Math.sin(a) * 0.8, 0]); }
  for (const tx of [-0.07, 0, 0.07]) curl(b, 0.04, C, tx, hy - 0.27, hz + 0.1, [0.6, 0, 0]);
  // flame-brush tail rising up the back
  for (const [tx, th, tw] of [[-0.12, 0.82, 0.09], [0, 0.98, 0.11], [0.12, 0.86, 0.09]]) {
    b.add(sweep([[tx * 0.4, 0.3, -0.42], [tx, 0.5, -0.52], [tx * 1.2, th - 0.12, -0.47], [tx * 0.9, th, -0.36]], [tw * 0.9, tw * 1.3, tw, 0.0], C, 10, 9));
    curl(b, 0.05, C, tx * 1.15, th - 0.22, -0.56, [0, Math.PI, 0]);
  }
  // red cloth bib tied round the neck
  const red = M.red();
  b.add(ring(0.19, 0.022, red, 0, 0.8, 0.12, 16, 5));
  const bib = skirt(0.17, 0.235, 0.24, 2.2, red, 0, 0.69, 0.11); bib.rotation.x = 0.06; b.add(bib);
  return g;
}

/**
 * Kitsune (fox messenger) on a carved plinth; origin on the ground, faces +z. Slender and upright: long neck, narrow
 * pointed muzzle, tall ears, a great brush tail sweeping up on one side (side = 1 right, -1 left), a red bib. key = holds
 * a scroll in its jaws, else a sacred jewel under its paw.
 */
export function kitsune(side = 1, key = false, s = 1) {
  if (sculptOn('kitsune')) {
    // sculpted foxes: kitsune_key (tail to +x, the scroll / key) and kitsune_jewel (tail to -x); every caller pairs
    // key with side +1 and the jewel with side -1, as the sculpts are carved. Moss folds into the stone (the fox blocks
    // hold carved + vermilion only, as before).
    const g = sculptGroup(key ? 'sculpt_kitsune_key' : 'sculpt_kitsune_jewel', 1, (n) => (/^Bib/.test(n) ? M.verm() : /^Moss/.test(n) ? null : M.carved()), { type: 'kitsune', scale: s });
    if (g) { noteSite('kitsune', key ? 'key' : 'jewel', g); return g; }
  }
  const g = oldKitsune(side, key, s);
  noteSite('kitsune', key ? 'key-old' : 'jewel-old', g);
  return g;
}
function oldKitsune(side, key, s) {
  // all carved + vermilion: the fox village blocks already hold both (torii), so the statues add no draw calls there
  const g = new THREE.Group(), C = M.carved(), sd = M.black();
  const y0 = guardianPlinth(g, s, 1.25, { moss: false, carvedOnly: true });
  const b = new THREE.Group(); b.position.y = y0; b.scale.setScalar(s); g.add(b);
  b.add(ell(0.2, 0.22, 0.26, C, 0, 0.2, -0.1));
  b.add(sweep([[0, 0.24, -0.12], [0, 0.55, 0.0], [0, 0.86, 0.08]], [0.19, 0.15, 0.11], C, 8, 12));
  b.add(ell(0.13, 0.21, 0.14, C, 0, 0.7, 0.1));
  for (const sx of [-1, 1]) {
    b.add(ell(0.09, 0.16, 0.19, C, sx * 0.16, 0.18, -0.08, [-0.3, 0, 0]));
    b.add(ell(0.05, 0.035, 0.09, C, sx * 0.17, 0.035, 0.1));
    const onJewel = !key && sx === side, py = onJewel ? 0.17 : 0.035;
    b.add(sweep([[sx * 0.08, 0.62, 0.1], [sx * 0.085, 0.32, 0.16], [sx * 0.085, py + 0.03, 0.19]], [0.07, 0.054, 0.048], C, 8, 9));
    b.add(ell(0.05, 0.035, 0.085, C, sx * 0.085, py, 0.23));
  }
  if (!key) { b.add(lathe([[0, 0], [0.07, 0.03], [0.085, 0.07], [0.06, 0.11], [0.02, 0.15], [0, 0.17]], C, side * 0.085, 0, 0.23, 12)); }
  // head
  const hy = 1.06, hz = 0.12;
  b.add(ell(0.12, 0.11, 0.13, C, 0, hy, hz));
  b.add(sweep([[0, hy - 0.01, hz + 0.06], [0, hy - 0.04, hz + 0.18], [0, hy - 0.06, hz + 0.27]], [0.075, 0.05, 0.022], C, 6, 9));
  b.add(ell(0.022, 0.018, 0.02, sd, 0, hy - 0.055, hz + 0.285, null, 6, 4));
  b.add(ell(0.12, 0.08, 0.1, C, 0, hy - 0.1, hz - 0.01));                                // ruff
  for (const sx of [-1, 1]) {
    b.add(ell(0.065, 0.055, 0.06, C, sx * 0.075, hy - 0.04, hz + 0.05));
    const ear = cone(0.05, 0.18, C, sx * 0.07, hy + 0.15, hz - 0.03, 8); ear.rotation.set(-0.15, 0, -sx * 0.28); b.add(ear);
    const eye = ell(0.028, 0.011, 0.01, sd, sx * 0.05, hy + 0.025, hz + 0.115, [0, sx * 0.4, sx * 0.42], 6, 4); b.add(eye);
  }
  if (key) { const sc = rcyl(0.026, 0.026, 0.26, C, 0, hy - 0.08, hz + 0.21, 10); sc.rotation.z = Math.PI / 2; b.add(sc); }
  // the brush tail: up from the rump, out to one side, a flame tip over the shoulder
  const T = (x, y, z) => [x * side, y, z];
  b.add(sweep([T(0.04, 0.1, -0.3), T(0.22, 0.25, -0.38), T(0.27, 0.62, -0.3), T(0.17, 0.95, -0.2), T(0.2, 1.16, -0.1)], [0.07, 0.14, 0.15, 0.1, 0.0], C, 16, 11));
  // red bib
  const red = M.verm();
  b.add(ring(0.12, 0.018, red, 0, 0.88, 0.09, 14, 5));
  const bib = skirt(0.11, 0.165, 0.2, 2.3, red, 0, 0.79, 0.1); b.add(bib);
  return g;
}

/** Jizō: little stone statue with a red bib and cap. */
export function jizo(s = 1) {
  const g = new THREE.Group();
  g.add(box(0.5 * s, 0.25 * s, 0.4 * s, M.stoneDark(), 0, 0.125 * s, 0));
  g.add(cyl(0.16 * s, 0.2 * s, 0.55 * s, M.stone(), 0, 0.52 * s, 0, 8));
  g.add(sphere(0.15 * s, M.stone(), 0, 0.92 * s, 0, 10, 8));
  const bib = cone(0.24 * s, 0.32 * s, M.red(), 0, 0.68 * s, 0.02, 8); g.add(bib);
  const cap = sphere(0.155 * s, M.red(), 0, 0.97 * s, 0, 10, 6); cap.scale.set(1, 0.55, 1); g.add(cap);
  return g;
}

/** Bench (long wooden seat) — optionally with a red cloth (tea house style). */
export function bench(red = false) {
  const g = new THREE.Group();
  g.add(box(1.8, 0.08, 0.5, red ? M.red() : M.woodLight(), 0, 0.45, 0));
  for (const x of [-0.75, 0.75]) for (const z of [-0.18, 0.18]) g.add(box(0.07, 0.42, 0.07, M.wood(), x, 0.21, z));
  return g;
}

/** Umbrella (red parasol) for tea benches. */
export function parasol() {
  const g = new THREE.Group();
  g.add(cyl(0.03, 0.03, 2.4, M.woodDark(), 0, 1.2, 0, 5));
  g.add(cone(1.3, 0.55, M.red(), 0, 2.45, 0, 16));
  return g;
}

/** Scarecrow (kakashi) with straw hat. */
export function scarecrow(rng = Math.random) {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.06, 2.0, M.wood(), 0, 1.0, 0, 5));
  const arm = cyl(0.04, 0.04, 1.7, M.wood(), 0, 1.45, 0, 5); arm.rotation.z = Math.PI / 2; g.add(arm);
  const kimono = [mat.cloth(0x3b5a8c), mat.cloth(0x8c3b3b), mat.cloth(0x5c7a3a)][Math.floor(rng() * 3)];
  g.add(box(0.7, 0.6, 0.25, kimono, 0, 1.3, 0));
  g.add(box(1.5, 0.18, 0.2, kimono, 0, 1.45, 0));
  g.add(sphere(0.2, M.paper(), 0, 1.85, 0, 10, 8));
  g.add(cone(0.42, 0.22, M.straw(), 0, 2.08, 0, 12));
  return g;
}

/** Drying rack (hasa): poles with straw / rice bundles hung over a rail. */
let riceSheafGeometry;
function riceSheaf() {
  if (riceSheafGeometry) return riceSheafGeometry;
  const positions=[], uvs=[], indices=[];
  const rings=[[.038,.54],[.069,.43],[.155,.02],[.193,-.30]], sides=9;
  for (let j=0;j<rings.length;j++) {
    const [radius,y]=rings[j];
    for (let i=0;i<=sides;i++) {
      const a=i*TAU/sides, rib=1+.14*Math.cos(3*a+.6);
      positions.push(Math.cos(a)*radius*rib,y,Math.sin(a)*radius*.76*rib);
      uvs.push(i/sides,j/4);
      if (i<sides && j<rings.length-1) {
        const n=j*(sides+1)+i;
        indices.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);
      }
    }
  }
  // A broken fringe lets light through below the heavier mass of grain.
  for (let i=0;i<sides;i++) {
    const a=(i+.49)*TAU/sides, tip=positions.length/3, n=3*(sides+1)+i;
    positions.push(Math.cos(a)*.202,-.39-.10*(.5+.5*Math.sin(i*2.3)),Math.sin(a)*.162);
    uvs.push((i+.49)/sides,1); indices.push(n,n+1,tip);
  }
  riceSheafGeometry=new THREE.BufferGeometry();
  riceSheafGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  riceSheafGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  riceSheafGeometry.setIndex(indices);riceSheafGeometry.computeVertexNormals();
  return riceSheafGeometry;
}

export function dryingRack(len = 4) {
  const g = new THREE.Group(), bamboo = M.woodLight();
  const supports = Math.max(2, Math.round(len / 2.3));
  for (let i=0;i<=supports;i++) {
    const x = -len/2 + len*i/supports;
    g.add(rod(x-.06,-.18,-.39,x+.05,1.97,.05,.049,bamboo));
    g.add(rod(x+.04,-.18,.39,x-.02,1.99,-.05,.052,bamboo));
  }
  g.add(rod(-len/2-.22,1.71,0,len/2+.22,1.71,0,.066,M.wood()));
  const count = Math.floor(len/.40), straw=M.straw(), cord=M.rope();
  for(let i=0;i<count;i++) {
    if(i===count-3 && count>11)continue;
    const x=(i+.55)*len/count-len/2, h=1+.08*Math.sin(i*1.83);
    for(const side of [-1,1]) {
      const sheaf=new THREE.Mesh(riceSheaf(),straw);
      sheaf.position.set(x,1.27,side*.15);
      sheaf.rotation.set(-side*.27,Math.sin(i)*.38,.105*Math.sin(i*1.7+side));
      sheaf.scale.set(1.07,h,1); g.add(sheaf);
    }
    g.add(cyl(.083,.086,.047,cord,x,1.71,0,6));
  }
  return g;
}

/** Morning-glory fence: bamboo lattice with vines and blue/violet flowers. */
export function moningGloryFence(len = 4, rng = Math.random) {
  const g = new THREE.Group();
  const bam = mat.wood(0xa7b56b), vine = mat.paint(0x4f8f3e);
  const n = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) g.add(cyl(0.035, 0.035, 1.3, bam, -len / 2 + (len * i) / n, 0.65, 0, 5));
  for (const y of [0.35, 0.75, 1.15]) { const r = cyl(0.025, 0.025, len, bam, 0, y, 0, 4); r.rotation.z = Math.PI / 2; g.add(r); }
  const flowers = [glow(0x7aa8ff, 1.05), glow(0xb68cff, 1.05), mat.paper(0xf6f0ff)];
  for (let i = 0; i < len * 7; i++) {
    const x = -len / 2 + rng() * len, y = 0.2 + rng() * 1.05;
    g.add(box(0.12, 0.08, 0.06, vine, x, y, (rng() - 0.5) * 0.1));
    if (rng() < 0.6) { const f = cone(0.07, 0.07, flowers[i % 3], x + 0.04, y + 0.03, 0.06, 6); f.rotation.x = -Math.PI / 2; g.add(f); }
  }
  return g;
}

/** Notice board (kōsatsu): roofed board with paper notices. */
export function noticeBoard(text) {
  const g = new THREE.Group();
  for (const x of [-1.0, 1.0]) g.add(cyl(0.07, 0.08, 2.6, M.wood(), x, 1.3, 0, 6));
  g.add(box(2.2, 1.0, 0.08, M.woodLight(), 0, 1.6, 0));
  const tex = textTexture(text, { w: 256, h: 128, bg: '#f6ecd6', fg: '#30200f', style: 'paper' });
  const pm = texMat(tex);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), pm); p.position.set(-0.45, 1.65, 0.05); g.add(p);
  for (let i = 0; i < 3; i++) g.add(box(0.36, 0.42, 0.01, M.paper(), 0.25 + i * 0.32, 1.55 + (i % 2) * 0.12, 0.05));
  const r = makeRoof({ hw: 1.5, hd: 0.45, h: 0.32, style: 'gable', mat: M.tile(), lift: 0.08, thick: 0.08, corr: 0.03, tile: 0.2 });
  r.group.position.y = 2.6; g.add(r.group);
  return g;
}

/** Waterwheel (static) — the wheel group is returned in .wheel so the caller can keep it live and spin it. */
export function waterwheel(radius = 2.6) {
  const g = new THREE.Group();
  const wheel = new THREE.Group();
  const rimA = torus(radius, 0.07, M.wood(), 0, 0, -0.45, 4, 28), rimB = torus(radius, 0.07, M.wood(), 0, 0, 0.45, 4, 28);
  wheel.add(rimA, rimB);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const sp = box(0.08, radius * 2, 0.08, M.woodDark(), 0, 0, -0.45); sp.rotation.z = a; if (i < 6) { wheel.add(sp); const sp2 = sp.clone(); sp2.position.z = 0.45; wheel.add(sp2); }
    const pad = box(0.08, 0.6, 1.0, M.wood(), Math.cos(a) * radius, Math.sin(a) * radius, 0); pad.rotation.z = a; wheel.add(pad);
  }
  const ax = cyl(0.14, 0.14, 1.4, M.woodDark(), 0, 0, 0, 8); ax.rotation.x = Math.PI / 2; wheel.add(ax);
  const wb = bakeStatic(wheel);
  wb.userData.dynamic = true;
  g.add(wb);
  for (const z of [-0.8, 0.8]) g.add(box(0.25, radius + 0.4, 0.25, M.woodDark(), 0, -(radius + 0.4) / 2 + 0.2, z));
  return { group: g, wheel: wb };
}

/** Pile of round river stones (cheap rock decoration). */
export function stones(n, r, rng, mat) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * r;
    const s = 0.25 + rng() * 0.5;
    const m = sphere(s, mat || M.stone(), Math.cos(a) * d, s * 0.3, Math.sin(a) * d, 7, 5);
    m.scale.set(1, 0.6, 0.9); g.add(m);
  }
  return g;
}

/** A tree from the asset store, recoloured; null if missing. Scaled uniformly. */
export function assetTree(id, scale = 1, leafColor = null, trunkColor = null) {
  const m = G.assets?.model?.(id);
  if (!m) return null;
  m.scale.multiplyScalar(scale);
  if (leafColor || trunkColor) m.traverse((o) => {
    if (!o.isMesh) return;
    const nm = (o.material?.name || '').toLowerCase();
    if (leafColor != null && /leaf|leaves|foliage|canopy|blossom/.test(nm)) o.material = toon(leafColor);
    else if (trunkColor != null && /trunk|bark|wood/.test(nm)) o.material = toon(trunkColor);
  });
  return m;
}
/** A staged building model from the asset store (bld_*), or null. */
export function assetModel(id, scale = 1) {
  const m = G.assets?.model?.(id);
  if (!m) return null;
  if (scale !== 1) m.scale.multiplyScalar(scale);
  return m;
}

export { mulberry32 };

// ---------------------------------------------------------------------------------------------------------------
// Site trees from the flora system's procedural models (upgrade 2): the sacred trees and yard trees match the forest.
// procTree() returns a marker (kept live through the bake); realizeTrees() turns all markers under a baked place into
// one InstancedMesh per species part with the flora material (wind, painted leaf cards, shadows, lighting model).
import { buildModelParts } from '../flora/batches.js';
import { SPECIES } from '../flora/species.js';
import { makeFloraMaterial } from '../flora/material.js';
/** key: flora species key ('cherry1', 'pine2', 'maple1', 'broad3', 'ginkgo1'…); tint: leaf colour (sRGB hex). */
export function procTree(key, scale = 1, tint = 0x6fbf4f, { glow = 0, hue = 0, land = [1, 1, 1] } = {}) {
  const o = new THREE.Object3D();
  o.userData.dynamic = true;
  o.userData.procTree = { key, scale, tint, glow, hue, land };
  return o;
}
const _tc = new THREE.Color(), _rel = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _sm = new THREE.Matrix4();
export function realizeTrees(root) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const byKey = new Map();
  root.traverse((o) => { if (o.userData.procTree) { const k = o.userData.procTree.key; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(o); } });
  let made = 0;
  for (const [key, list] of byKey) {
    const sp = SPECIES[key];
    const model = sp && buildModelParts(G, { ...sp, key });
    if (model) {
      const n = list.length;
      const aC0 = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), aC1 = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), aFx = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      const mats = [];
      list.forEach((o, i) => {
        const d = o.userData.procTree;
        _tc.setHex(d.tint); aC0.setXYZ(i, _tc.r, _tc.g, _tc.b);
        aC1.setXYZ(i, d.land[0], d.land[1], d.land[2]);
        aFx.setXYZW(i, d.glow, d.hue, (i * 0.618) % 1, 1);
        _rel.multiplyMatrices(_inv, o.matrixWorld).multiply(_sm.makeScale(d.scale, d.scale, d.scale));
        mats.push(_rel.clone());
      });
      for (const p of model.parts) {
        const geo = p.geo.clone();
        geo.setAttribute('aCol0', aC0); geo.setAttribute('aCol1', aC1); geo.setAttribute('aFx', aFx);
        const r = p.rule;
        const mat = makeFloraMaterial({ height: model.height, flex: sp.flex || 0, crownY: model.crown.cy, crown: !!r.crown, tint: r.mode === 'tint',
          glow: r.glow || 0, tipLo: r.tip ? r.tip[0] : 0, tipHi: r.tip ? r.tip[1] : 0, map: p.map, alphaTest: p.alphaTest, side: p.side, G, ...(p.mat || {}) });
        const mesh = new THREE.InstancedMesh(geo, mat, n);
        mats.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.computeBoundingSphere();
        mesh.castShadow = true; mesh.receiveShadow = true;
        if (mat.userData.depth) mesh.customDepthMaterial = mat.userData.depth;
        mesh.name = 'siteTree:' + key;
        mesh.userData.dynamic = true;
        root.add(mesh);
      }
      made += n;
    }
    for (const o of list) o.removeFromParent();
  }
  return made;
}
