// Small ground clutter near the camera: pebbles and small stones (path edges, plazas, river banks, the foot of rock,
// shells on the beach), twigs and fallen leaves in the dusk land, petals under cherry trees, tiny mushrooms (softly
// glowing caps) in the night. GPU-placed on world-fixed cells (no per-frame CPU work), one draw call per kind, toon lit
// through hookMaterial(), shadows received. Reads the grass FIELD (flora/grass.js) for land / grass / slope, and the
// terrain data texture for footpath / river distance and height.
import { ATLAS_HALF } from '../../data/atlas.js';
import * as THREE from 'three';
import { toonGradient, hookMaterial } from '../../core/mats.js';

const lin = (hex) => { const c = new THREE.Color().setHex(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
const MAXT = 8;

function pebbleGeo() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { // lumpy, flattened
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.85 + 0.3 * Math.abs(Math.sin(x * 3.1 + z * 2.3 + y * 1.7));
    p.setXYZ(i, x * k, y * 0.55 * k, z * k * 0.85);
  }
  g.computeVertexNormals();
  return g;
}
function twigGeo() {
  const g = new THREE.CylinderGeometry(0.03, 0.02, 1, 4, 1, true);
  g.rotateZ(Math.PI / 2);
  const b = new THREE.CylinderGeometry(0.018, 0.012, 0.4, 3, 1, true);
  b.rotateZ(Math.PI / 2); b.rotateY(0.7); b.translate(0.1, 0, 0.12);
  return mergeGeos([g, b]);
}
function leafGeo() {
  // diamond leaf with a centre fold, lying on the ground (y up)
  const pos = [0, 0, -1, 0.42, 0.12, 0, 0, 0.06, 1, -0.42, 0.12, 0, 0, -0.04, 0];
  const idx = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function mushroomGeo() {
  const stem = new THREE.CylinderGeometry(0.16, 0.22, 1, 5, 1, true); stem.translate(0, 0.5, 0);
  const cap = new THREE.SphereGeometry(0.55, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.7, 1); cap.translate(0, 0.92, 0);
  // mark cap vertices with uv.y = 2 so the shader can colour / light them
  const cu = cap.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setY(i, 2);
  const su = stem.attributes.uv; for (let i = 0; i < su.count; i++) su.setY(i, 0);
  return mergeGeos([stem, cap]);
}
function mergeGeos(list) {
  const pos = [], nrm = [], uv = [], idx = [];
  let off = 0;
  for (let g of list) {
    if (!g.index) g = g.toNonIndexed();
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('cUV', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

// KIND: 0 pebble / stone / shell, 1 twig, 2 fallen leaf, 3 petal, 4 mushroom
const VERT_PARS = /* glsl */`
uniform sampler2D cData;
uniform sampler2D cNoise;
uniform sampler2D cLitter;
uniform sampler2D cF0;
uniform sampler2D cF1;
uniform sampler2D cF2;
uniform vec3 cField;
uniform vec2 cCenter;
uniform vec3 cCam;
uniform vec4 cRing;   // S, n cells, rOut, density
uniform float cOffset;
uniform sampler2D cCells;
uniform vec4 cTrees[${MAXT}];
uniform float cTime;
attribute vec2 cUV;
varying vec3 vCCol;
varying vec3 vCGlow;
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec4 cTex(sampler2D t, vec2 p) { return textureLod(t, (p + ${ATLAS_HALF.toFixed(1)}) / ${(ATLAS_HALF*2).toFixed(1)}, 0.0); }
`;
const VERT_MAIN = (kind) => /* glsl */`
vec3 cPos; vec3 cNrm;
{
  float S = cRing.x;
  float fi = mod(float(gl_InstanceID) + cOffset, cRing.y);
  vec2 gi = texelFetch(cCells, ivec2(int(mod(fi, 256.0)), int(fi / 256.0)), 0).rg;
  vec2 cell = floor(cCenter / S) * S + gi * S;
  float hA = cHash(cell * 0.913 + ${(kind * 7.31).toFixed(2)}), hB = cHash(cell * 1.71 - ${(kind * 3.7 + 1.3).toFixed(2)});
  float hC = cHash(cell * 0.37 + ${(kind * 11.9 + 4.1).toFixed(2)}), hD = cHash(cell * 2.33 + 9.7);
  vec2 root = cell + vec2(hA, hB) * S;
  float dist = distance(root, cCam.xz);
  vec2 fuv = (root - cField.xy) / cField.z;
  vec4 F0 = textureLod(cF0, fuv, 0.0), F1 = textureLod(cF1, fuv, 0.0), F2 = textureLod(cF2, fuv, 0.0);
  vec4 D = cTex(cData, root);
  float h = D.r, road = D.g, river = D.b;
  float grass = F0.a, wDusk = F1.b, wNight = F1.a, wSun = max(0.0, 1.0 - wDusk - wNight);
  vec3 tn = vec3(F2.x, sqrt(max(0.0, 1.0 - F2.x * F2.x - F2.y * F2.y)), F2.y);
  float slope = 1.0 - tn.y;
  float crop = F1.g;
  float inField = step(0.002, fuv.x) * step(fuv.x, 0.998) * step(0.002, fuv.y) * step(fuv.y, 0.998);
  float p = 0.0; float size = 1.0; vec3 col = vec3(1.0); vec3 glow = vec3(0.0);
  float n = textureLod(cNoise, root / 7.0 + 0.3, 0.0).r;
  float woodFloor=smoothstep(.16,.78,cTex(cLitter,root).a)*smoothstep(2.3,4.5,road);
  ${kind === 0 ? `
  // pebbles: path edges, sparse on paths and plazas, river banks, the foot of rock; shells on the beach
  float edge = smoothstep(0.6, 1.7, road) * (1.0 - smoothstep(2.2, 4.8, road));
  float onPath = 1.0 - smoothstep(1.4, 2.4, road);
  float bare = (1.0 - grass) * (1.0 - onPath) * (1.0 - smoothstep(0.22, 0.3, slope));
  float bank = 1.0 - smoothstep(9.0, 14.0, river);
  float foot = smoothstep(0.12, 0.18, slope) * (1.0 - smoothstep(0.22, 0.28, slope));
  float beach = (1.0 - smoothstep(1.6, 2.6, h)) * step(0.15, h) * smoothstep(30.0, 60.0, river);
  p = edge * 0.75 + onPath * 0.18 + bare * 0.3 + bank * 0.6 + foot * 0.6 + beach * 0.35;
  p *= 0.55 + 0.9 * n;
  p *= 1.0 - step(0.5, crop);
  size = mix(0.05, 0.16, hC * hC) * (1.0 + foot * 1.4 * step(0.8, hD) + bank * 0.4);
  vec3 pc = mix(${lin(0x9a948a)}, ${lin(0xc9c0ae)}, hD);
  pc = mix(pc, ${lin(0x8c7a68)}, step(0.75, hC) * 0.6);
  pc = mix(pc, ${lin(0xf2e6dc)}, beach * step(0.5, hD));                       // shells
  col = mix(pc, pc * vec3(0.98, 0.94, 0.96), wDusk);
  col = mix(col, pc * vec3(0.42, 0.46, 0.6), wNight);
  ` : kind === 1 ? `
  // twigs: dusk woods and under trees, a few on paths
  p = .22*woodFloor + wDusk * (0.25 + 0.35 * n) * (1.0 - grass * 0.5) + wSun * 0.04 * (1.0 - grass);
  size = mix(0.25, 0.6, hC);
  col = mix(${lin(0x5b3d2c)}, ${lin(0x7a5a40)}, hD);
  col = mix(col, col * vec3(0.4, 0.45, 0.6), wNight);
  ` : kind === 2 ? `
  // fallen leaves: everywhere in the dusk land, in drifts; maple reds, ginkgo golds, browns
  float drift = smoothstep(0.35, 0.7, n);
  p = max(wDusk,woodFloor)* (0.35 + 0.9 * drift) * (1.0 - grass * 0.35);
  size = mix(0.06, 0.11, hC);
  col = hD < 0.35 ? ${lin(0xe5632b)} : hD < 0.6 ? ${lin(0xc23a25)} : hD < 0.85 ? ${lin(0xf2b632)} : ${lin(0x9a6a44)};
  col=mix(col,mix(${lin(0x806747)},${lin(0xb39454)},hC),woodFloor*.78);
  ` : kind === 3 ? `
  // cherry petals under the trees (CPU feeds the nearby cherry trees)
  float t = 0.0;
  for (int i = 0; i < ${MAXT}; i++) { vec4 c = cTrees[i]; if (c.w <= 0.0) continue; t = max(t, 1.0 - smoothstep(c.w * 0.4, c.w, distance(root, c.xy))); }
  p = t * 1.6;
  size = mix(0.035, 0.055, hC);
  col = mix(${lin(0xffc1d6)}, ${lin(0xfff0f4)}, hD);
  ` : `
  // tiny mushrooms in the night (and a few red caps in damp dusk woods)
  float cl = smoothstep(0.55, 0.75, n);
  p = woodFloor*.055*cl + wNight * (0.06 + 0.5 * cl) * (1.0 - smoothstep(0.25, 0.4, slope)) + wDusk * 0.05 * cl;
  size = mix(0.06, 0.14, hC);
  vec3 cap = hD < 0.5 ? vec3(0.35, 0.95, 1.0) : hD < 0.8 ? vec3(0.65, 0.5, 1.0) : vec3(1.0, 0.55, 0.85);
  col = mix(${lin(0xd8d0c0)}, ${lin(0xc24030)}, wDusk);
  if (cUV.y > 1.5) { col = mix(${lin(0xe8e4ff)}, ${lin(0xd83a2a)}, wDusk); glow = cap * wNight * (0.5 + 0.3 * sin(cTime * 1.3 + hA * 6.28)); }
  else col *= mix(1.0, 0.6, wNight);
  `}
  p *= cRing.w * inField * (1.0 - smoothstep(cRing.z - 6.0, cRing.z, dist));
  vec2 house=abs(root-vec2(2220.,48.))-vec2(9.,9.);
  vec2 cabin=abs(root-vec2(2055.,-35.))-vec2(9.,9.);
  vec2 inn=abs(root-vec2(-2119.,-514.))-vec2(9.,11.);
  p *= step(0.2,h)*step(.4,max(house.x,house.y))*step(.4,max(cabin.x,cabin.y))*step(.4,max(inn.x,inn.y));
  float keep = step(hA * 0.5 + hB * 0.5, p);
  float yaw = hC * 6.2832 + hD * 3.1;
  float cy = cos(yaw), sy = sin(yaw);
  vec3 lp = position;
  ${kind === 2 || kind === 3 ? `
  // lying flat on the ground, slightly cupped and tilted
  lp = vec3(lp.x * (0.8 + 0.4 * hD), lp.y, lp.z);
  ` : ''}
  vec3 rp = vec3(lp.x * cy - lp.z * sy, lp.y, lp.x * sy + lp.z * cy) * size;
  // align with the ground slope
  vec3 up = normalize(tn);
  vec3 ax = normalize(cross(up, vec3(0.0, 0.0, 1.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 az = cross(ax, up);
  vec3 wp = ax * rp.x + up * rp.y + az * rp.z;
  float sink = ${kind === 0 ? '0.35' : kind === 4 ? '0.0' : '0.02'} * size;
  cPos = keep > 0.5 ? vec3(root.x, h - sink + 0.02, root.y) + wp : vec3(0.0, -1.0e4, 0.0);
  vec3 ln = vec3(normal.x * cy - normal.z * sy, normal.y, normal.x * sy + normal.z * cy);
  cNrm = normalize(ax * ln.x + up * ln.y + az * ln.z + up * ${kind === 0 ? '0.6' : '0.3'});
  vCCol = col * (0.85 + 0.3 * hB);
  vCGlow = glow;
}
`;

function makeMat(U, kind) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), side: kind >= 2 ? THREE.DoubleSide : THREE.FrontSide });
  m.name = 'ground-clutter-' + kind;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <beginnormal_vertex>', VERT_MAIN(kind) + '\nvec3 objectNormal = cNrm;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = cPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCCol;\nvarying vec3 vCGlow;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCCol;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vCGlow;');
  };
  m.customProgramCacheKey = () => 'mvClutter1-' + kind;
  return hookMaterial(m);
}

/**
 * Create the clutter once the grass field exists. Returns { meshes, update(dt, cam), count() } or null.
 * quality: 'low' | 'med' | 'high' (ring radius and density).
 */
export function createClutter(G, grass, quality = 'high') {
  if (!grass?.uniforms?.gF0 || !G.terrain?.dataTexture) return null;
  const GU = grass.uniforms;
  const Q = { high: { r: 20, d: 1 }, med: { r: 15, d: 0.8 }, low: { r: 10, d: 0.6 } }[quality] || { r: 20, d: 1 };
  const shared = {
    cData: { value: G.terrain.dataTexture }, cLitter:GU.gScorch, cNoise: { value: G.terrain.noiseTexture },
    cF0: GU.gF0, cF1: GU.gF1, cF2: GU.gF2, cField: GU.gField,
    cCenter: { value: new THREE.Vector2() }, cCam: { value: new THREE.Vector3() }, cTime: GU.gTime,
    cTrees: { value: Array.from({ length: MAXT }, () => new THREE.Vector4()) },
  };
  const KINDS = [
    { geo: pebbleGeo(), S: 0.72 },
    { geo: twigGeo(), S: 1.1 },
    { geo: leafGeo(), S: 0.5 },
    { geo: leafGeo(), S: 0.32 },
    { geo: mushroomGeo(), S: 0.9 },
  ];
  const meshes = [];
  KINDS.forEach((k, kind) => {
    const rOut = Q.r * (kind === 3 ? 0.8 : 1);
    const M = Math.ceil(rOut / k.S) + 2, cells = [];
    for (let iz = -M; iz <= M; iz++) for (let ix = -M; ix <= M; ix++) {
      const d = Math.hypot(ix + 0.5, iz + 0.5) * k.S;
      if (d > rOut + 1.5 * k.S) continue;
      cells.push([ix, iz, Math.atan2(iz + 0.5, ix + 0.5)]);
    }
    cells.sort((a, b) => a[2] - b[2]);
    const n = cells.length, rows = Math.ceil(n / 256);
    const data = new Float32Array(256 * rows * 4), angles = new Float32Array(n);
    cells.forEach((c, i) => { data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; angles[i] = c[2]; });
    const tex = new THREE.DataTexture(data, 256, rows, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    const geo = new THREE.InstancedBufferGeometry().copy(k.geo);
    geo.instanceCount = n;
    const U = { ...shared, cRing: { value: new THREE.Vector4(k.S, n, rOut, Q.d) }, cOffset: { value: 0 }, cCells: { value: tex } };
    const mesh = new THREE.Mesh(geo, makeMat(U, kind));
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.name = 'terrain:clutter';
    mesh.userData.ring = { n, angles, U, geo, tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 };
    G.scene.add(mesh);
    meshes.push(mesh);
  });

  const _f = new THREE.Vector3(), _f2 = new THREE.Vector3();
  const lowerBound = (a, v) => { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; if (a[m] < v) l = m + 1; else h = m; } return l % a.length; };
  let treeT = 0;
  return {
    meshes,
    update(dt, cam) {
      shared.cCenter.value.set(cam.position.x, cam.position.z);
      shared.cCam.value.copy(cam.position);
      cam.getWorldDirection(_f2); _f.copy(_f2); _f.y = 0;
      const flatOk = _f.lengthSq() > 0.25; if (flatOk) _f.normalize();
      const a0 = Math.atan2(_f.z, _f.x);
      const hf = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect);
      const half = hf + 0.5 + 1.3 * Math.max(0, -_f2.y - 0.2);
      for (const m of meshes) {
        const R = m.userData.ring;
        if (!flatOk || half >= Math.PI - 0.05) { R.U.cOffset.value = 0; R.geo.instanceCount = R.n; continue; }
        let lo = a0 - half; if (lo < -Math.PI) lo += Math.PI * 2;
        R.U.cOffset.value = lowerBound(R.angles, lo);
        R.geo.instanceCount = Math.min(R.n, Math.round(R.n * (2 * half) / (Math.PI * 2)) + 8);
      }
      const gh = G.world?.heightAt ? G.world.heightAt(cam.position.x, cam.position.z) : 0;
      const show = cam.position.y - gh < 60;
      // skip whole kinds that cannot appear around here (veil 0 = morning meadow .. 1 = night)
      const v = G.env?.veil ?? 0.5;
      const anyTree = shared.cTrees.value[0].w > 0;
      const wood=G.terrain.scorchLayer.at(cam.position.x,cam.position.z,'litter')>.06 ||
        G.terrain.scorchLayer.at(cam.position.x+6,cam.position.z+4,'litter')>.12;
      const autumn=v>.12 && v<.95;
      const need = [true, wood||autumn, wood||autumn, anyTree, wood||v>.3];
      meshes.forEach((m, i) => { m.visible = show && need[i]; });
      // nearby cherry trees for the petals (twice a second)
      treeT -= dt;
      if (treeT <= 0 && G.flora?.treesNear) {
        treeT = 0.5;
        const tv = shared.cTrees.value;
        let k = 0;
        try {
          const list = G.flora.treesNear(cam.position, 40) || [];
          for (const t of list) {
            if (k >= MAXT) break;
            if (!/cherry|sakura/i.test(t.key || '') || t.charred) continue;
            tv[k++].set(t.pos.x, t.pos.z, 0, Math.max(3.5, (t.radius || 2) * 2.2 + 2));
          }
        } catch (e) { G.reportError?.('clutter:trees', e); }
        for (; k < MAXT; k++) tv[k].set(0, 0, 0, 0);
      }
    },
    /** Instances submitted (upper bound before placement rules) and triangles. */
    count() { let i = 0, t = 0; for (const m of meshes) if (m.visible) { i += m.userData.ring.geo.instanceCount; t += m.userData.ring.geo.instanceCount * m.userData.ring.tris; } return { instances: i, triangles: t }; },
  };
}
