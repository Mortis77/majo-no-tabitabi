// Persistent fire ages, spreads and extinguishes in fire.js. Render its existing cell / reactor
// samples as wind-bent, closed flame volumes. Sparse distant fires share one coarse instance batch.
import * as THREE from 'three';
import { MAX_FLAMES } from './consts.js';

const vertexShader = /* glsl */`
attribute vec4 aPos, aSize;
uniform float uTime;
uniform vec2 uWind;
varying vec4 vFlame; varying float vHeat;
#include <fog_pars_vertex>
void main() {
  float a = position.x * 6.283185, y = position.y, wing = position.z;
  float seed = aPos.w * 39.7, t = uTime * (3.7 + fract(seed) * 1.6);
  float swirl = seed + (1.9 + wing * 1.45) * y + 0.48 * sin(5.2*y-t+seed);
  vec2 outward = vec2(cos(a),sin(a)), turn = vec2(cos(swirl),sin(swirl));
  float profile = pow(max(0.0,sin(3.14159 * pow(y,0.69))),0.70) * (1.0-0.61*y);
  float flute = 1.0 + 0.26*sin(a*3.0 + y*6.2-t + seed) + 0.11*cos(a*2.0-y*5.7+t*0.65);
  float width = aSize.x * (wing > 0.5 ? 0.145 : 0.365);
  float len = aSize.y * (wing > 0.5 ? 0.74 + 0.15*sin(t*0.60+seed) : 0.93 + 0.09*sin(t*0.74+seed));
  vec2 centre = turn * width * (0.16 * y + 0.72*y*y*sin(t-y*5.3+seed));
  if (wing > 0.5) centre += turn * aSize.x * (0.11+0.23*sin(y*3.14159));
  centre += uWind * y*y * aSize.y * 0.064;
  vec3 wp = aPos.xyz;
  wp.xz += centre + outward * width * profile * flute;
  wp.y += y*len;
  vec3 n = normalize(vec3(outward.x,(y-0.43)*0.95,outward.y));
  float skin = 1.0 - abs(dot(n, normalize(cameraPosition-wp)));
  vFlame = vec4(a,y,skin,seed+wing*1.65); vHeat = aSize.z;
  vec4 mvPosition = viewMatrix * vec4(wp,1.0);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */`
uniform float uTime, uDay;
varying vec4 vFlame; varying float vHeat;
#include <fog_pars_fragment>
void main() {
  float a=vFlame.x, y=vFlame.y, seed=vFlame.w;
  float flow=5.4*y-4.1*uTime+seed;
  float curl=0.5+0.5*sin(2.0*a+flow+1.7*sin(a-6.5*y+uTime*2.8+seed));
  float noise=0.5+0.5*sin(3.0*a-5.3*y+uTime*1.9+seed);
  float pocket=sin(4.0*a+6.9*y-2.8*uTime+seed+1.22*sin(2.0*a-7.0*y+uTime));
  float heat=clamp(0.19 + 0.09*vHeat + 0.29*curl + 0.12*noise + 0.25*(1.0-y) - 0.29*vFlame.z + 0.095*pocket,0.0,1.0);
  vec3 col=mix(vec3(0.43,0.013,0.001),vec3(1.29,0.16,0.004),smoothstep(0.13,0.46,heat));
  col=mix(col,vec3(1.66,0.69,0.042),smoothstep(0.43,0.68,heat));
  col=mix(col,vec3(1.83,1.26,0.27),smoothstep(0.67,0.86,heat));
  float wisps=smoothstep(-0.06,0.27,0.21+0.57*curl+0.22*noise-0.62*smoothstep(0.55,1.0,y));
  float alpha=(0.86-0.19*vFlame.z)*wisps*(0.71+0.29*vHeat);
  gl_FragColor=vec4(col*alpha*mix(0.78,1.0,uDay),alpha);
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogAmount=1.0-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
    #else
      float fogAmount=smoothstep(fogNear,fogFar,vFogDepth);
    #endif
    gl_FragColor*=1.0-fogAmount*0.9;
  #endif
  #include <colorspace_fragment>
}`;

function makeBatch(scene, material, name, cap, sides, rings, lobes) {
  const pos = [], index = [];
  for (let lobe = 0; lobe < lobes; lobe++) {
    const first = pos.length / 3;
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= sides; i++) {
      pos.push(i / sides, j / rings, lobe);
      if (i === sides || j === rings) continue;
      const a = first + j * (sides + 1) + i, c = a + sides + 1;
      index.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  const attributes = ['aPos','aSize'].map((key) => {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(key, attribute);
    return attribute;
  });
  geometry.instanceCount = 0;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 4;
  scene.add(mesh);
  let count = 0;
  return {
    get count() { return count; },
    reset() { count = 0; },
    add(x,y,z,seed,w,h,heat) {
      if (count >= cap) return false;
      attributes[0].setXYZW(count,x,y,z,seed); attributes[1].setXYZW(count,w,h,heat,0);
      count++; return true;
    },
    upload() {
      geometry.instanceCount = count; mesh.visible = count > 0;
      if (!count) return;
      for (const attr of attributes) {
        attr.clearUpdateRanges(); attr.addUpdateRange(0,count * 4); attr.needsUpdate = true;
      }
    },
  };
}

export function createFireSurfaces(scene, uniforms, low) {
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true,
    transparent: true, depthWrite: false, side: THREE.FrontSide, premultipliedAlpha: true, toneMapped: false });
  const close = makeBatch(scene, material, 'elements-fire-close', low ? 24 : 64, low ? 7 : 9, low ? 5 : 7, 2);
  const far = makeBatch(scene, material, 'elements-fire-far', MAX_FLAMES, low ? 5 : 6, 4, 1);
  const nearSq = (low ? 18 : 38) ** 2;
  return {
    get count() { return close.count + far.count; },
    reset() { close.reset(); far.reset(); },
    upload() { close.upload(); far.upload(); },
    put(x,y,z,seed,w,h,heat,cam) {
      const d = (x-cam.x)**2 + (y-cam.y)**2 + (z-cam.z)**2;
      if (d < nearSq && close.add(x,y,z,seed,w,h,heat)) return;
      far.add(x,y,z,seed,w,h,heat);
    },
  };
}
