// Painted crop fields (map round, 2026-11-22): ONE merged mesh draped over every parcel of the countryside plan, so the
// patchwork reads from the broom at any distance (the crop tufts themselves only draw within ~80 m). The fragment
// paints the crop: lavender rows, wheat / barley with soft combing, mown hay in broad stripes, poppies on green.
// Lit by the shared toon model (hookMaterial), depth-biased toward the camera so the coarse far terrain LOD never
// swallows it, dithered out at the parcel edges. Orchards are left to their trees.
import * as THREE from 'three';
import { toonGradient, hookMaterial } from '../../core/mats.js';

const KIND = { lavender: 0, wheat: 1, barley: 2, hay: 3, poppy: 4 };

export function createFields(G, plan) {
  const W = G.world;
  const P = [], N = [], F = [], I = [];
  const CELL = 3.5;
  let tris = 0;
  for (const f of plan.fields) {
    const k = KIND[f.kind];
    if (k === undefined) continue;
    const nu = Math.max(2, Math.ceil(f.hw * 2 / CELL)), nv = Math.max(2, Math.ceil(f.hd * 2 / CELL));
    const base = P.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = -f.hw + (i / nu) * f.hw * 2, v = -f.hd + (j / nv) * f.hd * 2;
      const x = f.x + u * f.c - v * f.s, z = f.z + u * f.s + v * f.c;
      const h = W.heightAt(x, z);
      const e = 1.2, hx = W.heightAt(x + e, z) - W.heightAt(x - e, z), hz = W.heightAt(x, z + e) - W.heightAt(x, z - e);
      const nl = Math.hypot(hx, 2 * e, hz);
      P.push(x, h + 0.12, z); N.push(-hx / nl, 2 * e / nl, -hz / nl);
      F.push(u, v, k + (f.seed % 997) / 1000, Math.min(f.hw - Math.abs(u), f.hd - Math.abs(v)));
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      I.push(a, c, b, b, c, d); tris += 2;
    }
  }
  if (!tris) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('aField', new THREE.Float32BufferAttribute(F, 4));
  geo.setIndex(I.length / 3 * 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  geo.computeBoundingSphere();

  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
  m.name = 'flora-fields';
  m.userData.surface = 'none';
  m.userData.look = { rim: 0.08, wrap: 0.55, shadowTint: 0.8 };
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aField;\nvarying vec4 vField;\nvarying vec2 vFW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvField = aField; vFW = (modelMatrix * vec4(position, 1.0)).xz;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 mv = mvPosition; mv.xyz *= 0.9965; gl_Position = projectionMatrix * mv; }');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vField;
varying vec2 vFW;
float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float kind = floor(vField.z + 0.001), seed = fract(vField.z);
  float u = vField.x, v = vField.y, edge = vField.w;
  float n1 = fn(vFW * 0.09 + seed * 37.0), n2 = fn(vFW * 0.6 + seed * 11.0);
  vec3 col;
  if (kind < 0.5) {            // lavender: purple rows on grey-green
    float row = 0.5 + 0.5 * cos(6.2831853 * v / 1.6);
    vec3 lav = mix(vec3(0.36, 0.26, 0.62), vec3(0.46, 0.34, 0.72), n1);
    col = mix(vec3(0.24, 0.30, 0.20), lav, smoothstep(0.25, 0.7, row + 0.15 * (n2 - 0.5)));
  } else if (kind < 1.5) {     // wheat: warm gold, combed
    float comb = 0.5 + 0.5 * cos(6.2831853 * v / 1.25 + n2);
    col = mix(vec3(0.66, 0.48, 0.17), vec3(0.80, 0.62, 0.26), 0.55 * n1 + 0.25 * comb);
  } else if (kind < 2.5) {     // barley: green-gold
    float comb = 0.5 + 0.5 * cos(6.2831853 * v / 1.25 + n2);
    col = mix(vec3(0.46, 0.50, 0.20), vec3(0.62, 0.60, 0.28), 0.6 * n1 + 0.2 * comb);
  } else if (kind < 3.5) {     // hay: mown stripes
    float stripe = step(0.5, fract(u / 7.0));
    col = mix(vec3(0.50, 0.58, 0.24), vec3(0.64, 0.66, 0.32), stripe * 0.8 + 0.2 * n1);
  } else {                     // poppies on green
    float sp = smoothstep(0.62, 0.7, fn(vFW * 1.4 + seed * 5.0) * 0.7 + n1 * 0.4);
    col = mix(vec3(0.24, 0.42, 0.16), vec3(0.78, 0.17, 0.10), sp);
  }
  diffuseColor.rgb = col * (0.92 + 0.16 * n2);
  // ragged, dithered rim
  float rim = smoothstep(0.0, 1.4, edge + (n2 - 0.5) * 1.2);
  if (rim < fh(gl_FragCoord.xy)) discard;
}`);
  };
  m.customProgramCacheKey = () => 'mvFields1';
  hookMaterial(m);
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = 'flora-fields';
  mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.renderOrder = -1;
  G.scene.add(mesh);
  return { mesh, tris };
}
