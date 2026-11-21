// GLSL shared by every fx shader.
//
// fxOut(add, straight, alpha) builds the final premultiplied colour (blend = ONE, ONE_MINUS_SRC_ALPHA):
//   add      = linear radiance that is ADDED to the frame (glow)
//   straight = linear surface colour of the alpha-blended part, alpha = its coverage
// When the frame goes through the post chain (linear HDR target) the values are written as they are, so bright
// particles land above the bloom threshold. When the game draws straight to the canvas (no sky system, or a low
// quality tier) blending happens in display space instead, so the two parts are tone-mapped/encoded separately to
// keep smoke edges clean and glows from swelling up.
import * as THREE from 'three';

export const FOG_PARS_VERT = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
#endif
`;
export const FOG_VERT = /* glsl */`
#ifdef USE_FOG
  vFogDepth = -mvPosition.z;
#endif
`;
export const FX_OUT = /* glsl */`
uniform float uAddGamma;
uniform float uAddGain;
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
vec4 fxOut(vec3 addC, vec3 straight, float alpha) {
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float ff = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float ff = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    addC *= 1.0 - ff;
    straight = mix(straight, fogColor, ff);
  #endif
  #ifdef TONE_MAPPING
    vec3 a = pow(1.0 - exp(-addC * uAddGain), vec3(uAddGamma));   // soft clip keeps the hue of hot glows
    vec3 s = linearToOutputTexel(vec4(toneMapping(straight), 1.0)).rgb;
  #else
    vec3 a = addC;
    vec3 s = straight;
  #endif
  return vec4(s * alpha + a, alpha);
}
`;
/** sRGB byte colour (0..1) -> linear, cheap fit. */
export const SRGB_TO_LINEAR = /* glsl */`
vec3 fxLinear(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
`;

/** Uniforms every fx material shares (one object, updated once per frame by fx.js). */
export const shared = {
  uTime: { value: 0 },
  uAddGamma: { value: 1 },
  uAddGain: { value: 0.5 },
  uAmbient: { value: new THREE.Color(1, 1, 1) },
};

/** Base options for an fx ShaderMaterial: premultiplied blending, no depth write, fog-aware. */
export function fxMaterial({ uniforms, vertexShader, fragmentShader, depthTest = true, side = THREE.DoubleSide }) {
  const fog = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const m = new THREE.ShaderMaterial({
    uniforms: { ...fog, uTime: shared.uTime, uAddGamma: shared.uAddGamma, uAddGain: shared.uAddGain, uAmbient: shared.uAmbient, ...uniforms },
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest, side,
    blending: THREE.NormalBlending, premultipliedAlpha: true,
    fog: true,
  });
  return m;
}
