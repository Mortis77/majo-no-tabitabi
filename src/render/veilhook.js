// The look of every lit material (installed through core/mats.js addMaterialHook). See docs/api/look.md.
//  * Veil daylight: direct sunlight is scaled by the daylight at the FRAGMENT's own xz (same formula as veil.js
//    daylightAt) and tinted by the local sun colour -> from the meadow you see the eastern land lying dark under the Moon;
//  * stylised sun term: soft wrapped terminator + one crisp cel band (broken by the surface detail), fresnel rim toward
//    the Sun, optional stylised specular and back-light translucency (material.userData.look knobs);
//  * coloured shadows: where the Sun does not reach (shadow, terminator) the ambient shifts to the land's shadow colour
//    (blue in the meadow, violet-rose at dusk, indigo-teal at night); sky / ground hemisphere + bounce from lit ground;
//  * cascaded sun shadows (render/shadows.js) with Poisson PCF and cascade blending; drifting cloud shadows that match
//    the sky's cloud layer;
//  * surface detail: world-space triplanar painterly textures (render/surfaces.js) at three scales — macro colour drift,
//    material pattern (userData.surface), fine speckle — distance-faded; modulates albedo, bends the normal;
//  * a warm rim + fill from the golden ring under the Veil; height fog whose colour blends the camera's air with the
//    far fragment's air; a near-light soft clamp so fire never clips lit surfaces to white.
// Works for MeshToon / MeshLambert / MeshStandard / MeshPhysical / MeshPhong, with instancing, batching, skinning,
// morphs and vertex colours. Chained and order-proof: onBeforeCompile and customProgramCacheKey become accessors, so a
// hook another system assigns later still runs (before ours).
import * as THREE from 'three';
import { cloudSunMap, CLOUD_SUN_LOOKUP_GLSL } from './cloud-shafts.js';
import { U, GLSL_ATMO } from './atmo.js';
import { surfaceTexture, SURFACES } from './surfaces.js';
import { noiseTexture } from './noise.js';

const VERT_PARS = /* glsl */`
varying vec3 vMvWorld;
`;
const VERT_MAIN = /* glsl */`
{
  vec4 mvWp = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    mvWp = batchingMatrix * mvWp;
  #endif
  #ifdef USE_INSTANCING
    mvWp = instanceMatrix * mvWp;
  #endif
  vMvWorld = (modelMatrix * mvWp).xyz;
}
`;
const FRAG_PARS = /* glsl */`
varying vec3 vMvWorld;
${GLSL_ATMO}
uniform vec3 mvSunCam;
uniform float mvHemiMul;
uniform vec3 mvFogCam;
uniform float mvFogDensity, mvFogFalloff, mvFogBase, mvSunVis;
uniform vec4 mvLookA; // rim, spec, wrap, shadowTint
uniform vec4 mvLookB; // translucency, surface layer (-1 none), albedo amp, bump
uniform vec4 mvLookC; // metres per tile, fine amp, spec power, band shift
uniform vec4 mvQ;     // detail on, fine on, cloud shadows on, debug
uniform vec4 mvCloud; // cover, cloud base, shadow strength, reflection pass
${CLOUD_SUN_LOOKUP_GLSL}
// Expose the direct transmission to water's glitter and caustics after the lighting pass.
#define MV_CLOUD_LIGHT
float mvCloudDirect = 1.0;
uniform vec4 mvContact[4]; // contact shadows: feet position xyz + radius (0 = unused), see sky.js
uniform vec4 mvCanyonBox, mvCanyonY, mvCanyonCore, mvCanyonOpen[5];
// City of Magic: share of the open sky a point at the bottom of a tall-house street can still see (1 = open sky)
float mvCanyonSky( vec3 p ) {
  if ( mvCanyonY.z <= 0.0 ) return 1.0;
  vec2 d = abs( p.xz - mvCanyonBox.xy ) - mvCanyonBox.zw;
  float inside = 1.0 - smoothstep( -mvCanyonY.w, 0.0, max( d.x, d.y ) );
  if ( inside <= 0.0 ) return 1.0;
  float core = 1.0 - smoothstep( mvCanyonCore.z - 4.0, mvCanyonCore.z + 2.0, length( p.xz - mvCanyonCore.xy ) );
  float street = mix( mvCanyonY.x, mvCanyonY.y, core );
  float open = 0.0;
  for ( int i = 0; i < 5; i++ ) open = max( open, 1.0 - smoothstep( mvCanyonOpen[i].z * 0.7, mvCanyonOpen[i].z + 6.0, length( p.xz - mvCanyonOpen[i].xy ) ) );
  float low = 1.0 - smoothstep( street + 2.0, street + 26.0, p.y );
  return 1.0 - mvCanyonY.z * inside * low * ( 1.0 - 0.75 * open );
}
uniform sampler2D mvLampMap; // lamp pools (light r3): camera-centred map, rgb pool colour, a = lum x lamp height
uniform vec4 mvLampBox;      // origin x, origin z, 1 / size (m), night k (0 = no pools: one compare)
float mvContactK = 1.0; // 0..1 occlusion of the ground under characters (written in the light section, read by the ambient)
float mvContactAt( vec3 p, vec3 Nw ) {
  float k = 1.0;
  for ( int i = 0; i < 4; i++ ) {
    vec4 c = mvContact[ i ];
    if ( c.w <= 0.0 ) continue;
    vec3 d = p - c.xyz;
    float q = dot( d.xz, d.xz ) / ( c.w * c.w );
    #ifndef MV_GPU_OLD
      // GPU pass: v is exactly 0 outside -0.9 < d.y < 0.4, and exp(-2q) < 7e-6 beyond q = 6 (changes k by < 6e-6)
      if ( q > 6.0 || d.y <= -0.9 || d.y >= 0.4 ) continue;
    #endif
    float v = smoothstep( -0.9, -0.25, d.y ) * ( 1.0 - smoothstep( 0.05, 0.4, d.y ) );
    // round 2: darker core right under the hem / feet, fading out over about the radius
    k *= 1.0 - 0.82 * exp( -q * 2.0 ) * v * smoothstep( 0.1, 0.6, Nw.y );
  }
  return k;
}
// look round (docs/api/look.md "Look round"): scattered sunlight kept on lit / shaded sides, golden ring fill at night
#define MV_FILL_LIT 0.045
#define MV_FILL_SHADE 0.095
#define MV_RING_FILL 0.2
uniform sampler2DArray mvSurf;
uniform sampler2D mvNoise;
float mvLitK = 1.0;   // how much direct sun reaches this fragment (written by the sun term, read by the ambient)
float mvDetH = 0.5;   // surface height (feeds the cel band)
vec3 mvWN = vec3(0.0, 1.0, 0.0); // world-space shading normal
// Near-light soft clamp (fix2): pooled point lights next to fire used to drive lit surfaces (and the heroine) to pure
// white. The brightest channel is rolled off smoothly above a knee and the colour is scaled as a whole, so a surface
// saturates toward the light's hue x its albedo instead of clipping to white. Emissive is never touched.
float mvRoll( float m, float knee, float lim ) {
  return m <= knee ? m : knee + ( lim - knee ) * ( 1.0 - exp( -( m - knee ) / ( lim - knee ) ) );
}
float mvRollK( vec3 c, float knee, float lim ) {
  float m = max( max( c.r, c.g ), c.b );
  return m <= knee ? 1.0 : mvRoll( m, knee, lim ) / m;
}
`;
// after shadowmap_pars_fragment: cascade sampling, cloud shadows, the sun term
const FRAG_FUNCS = /* glsl */`
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && defined( SHADOWMAP_TYPE_PCF )
// 9-tap Poisson PCF on a hardware-compare sampler (each tap is itself a bilinear 2x2 compare): soft, no noise.
float mvTap( sampler2DShadow sm, vec2 size, float bias, float rad, vec4 sc, out float edge ) {
  vec3 c = sc.xyz / sc.w;
  c.z += bias;
  edge = min( min( c.x, 1.0 - c.x ), min( c.y, 1.0 - c.y ) );
  if ( edge <= 0.0 || c.z > 1.0 ) { edge = -1.0; return 1.0; }
  #ifdef MV_DBG_ONETAP
    return texture( sm, c );
  #endif
  vec2 t = rad / size;
  float s = texture( sm, c ) * 2.0;
  s += texture( sm, vec3( c.xy + vec2( -0.94, -0.34 ) * t, c.z ) );
  s += texture( sm, vec3( c.xy + vec2( 0.95, -0.29 ) * t, c.z ) );
  s += texture( sm, vec3( c.xy + vec2( -0.09, -0.93 ) * t, c.z ) );
  s += texture( sm, vec3( c.xy + vec2( 0.34, 0.94 ) * t, c.z ) );
  #ifdef MV_TAP_EARLY
    // centre + four outer taps all fully lit / all fully shadowed: the remaining taps lie between them
    if ( s >= 5.9999 ) return 1.0;
    if ( s <= 1e-4 ) return 0.0;
  #endif
  s += texture( sm, vec3( c.xy + vec2( -0.82, 0.54 ) * t, c.z ) );
  s += texture( sm, vec3( c.xy + vec2( 0.79, 0.6 ) * t, c.z ) );
  s += texture( sm, vec3( c.xy + vec2( 0.45, -0.45 ) * t, c.z ) ) * 0.5;
  s += texture( sm, vec3( c.xy + vec2( -0.45, 0.05 ) * t, c.z ) ) * 0.5;
  return s / 9.0;
}
// GPU pass: the cascade coordinates are computed here from the world position and the interpolated vertex normal
// (exactly what three's shadowmap_vertex interpolates: M * (worldPos + n * normalBias), n = the per-vertex unit
// normal, linear in both) instead of three vec4 varyings per vertex; only the cascades actually read are computed.
#ifdef MV_SC_FRAG
  vec3 mvShN = vec3( 0.0 );
  #define MV_SCOORD( i ) ( directionalShadowMatrix[ i ] * vec4( vMvWorld + mvShN * directionalLightShadows[ i ].shadowNormalBias, 1.0 ) )
#else
  #define MV_SCOORD( i ) vDirectionalShadowCoord[ i ]
#endif
float mvCascadeShadow() {
  #ifdef MV_SC_FRAG
    mvShN = ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz;
  #endif
  float e0 = -1.0, e1 = -1.0, e2 = -1.0;
  #ifdef MV_DBG_NOBLEND
  {
    float b0 = mvTap( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias,
      directionalLightShadows[ 0 ].shadowRadius, MV_SCOORD( 0 ), e0 );
    if ( e0 > 0.0 ) return b0;
    #if NUM_DIR_LIGHT_SHADOWS > 1
    float b1 = mvTap( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowBias,
      directionalLightShadows[ 1 ].shadowRadius, MV_SCOORD( 1 ), e1 );
    if ( e1 > 0.0 ) return b1;
    #endif
    #if NUM_DIR_LIGHT_SHADOWS > 2
    float b2 = mvTap( directionalShadowMap[ 2 ], directionalLightShadows[ 2 ].shadowMapSize, directionalLightShadows[ 2 ].shadowBias,
      directionalLightShadows[ 2 ].shadowRadius, MV_SCOORD( 2 ), e2 );
    if ( e2 > 0.0 ) return b2;
    #endif
    return 1.0;
  }
  #endif
  float s0 = mvTap( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias,
    directionalLightShadows[ 0 ].shadowRadius, MV_SCOORD( 0 ), e0 );
  if ( e0 > 0.07 ) return s0;
  #if NUM_DIR_LIGHT_SHADOWS > 1
    float s1 = mvTap( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowBias,
      directionalLightShadows[ 1 ].shadowRadius, MV_SCOORD( 1 ), e1 );
    if ( e0 > 0.0 ) return mix( s1, s0, e0 / 0.07 );
    if ( e1 > 0.05 ) return s1;
    #if NUM_DIR_LIGHT_SHADOWS > 2
      float s2 = mvTap( directionalShadowMap[ 2 ], directionalLightShadows[ 2 ].shadowMapSize, directionalLightShadows[ 2 ].shadowBias,
        directionalLightShadows[ 2 ].shadowRadius, MV_SCOORD( 2 ), e2 );
      if ( e1 > 0.0 ) return mix( s2, s1, e1 / 0.05 );
      if ( e2 > 0.0 ) return mix( 1.0, s2, smoothstep( 0.0, 0.1, e2 ) );
    #else
      if ( e1 > 0.0 ) return mix( 1.0, s1, smoothstep( 0.0, 0.1, e1 ) );
    #endif
  #else
    if ( e0 > 0.0 ) return mix( 1.0, s0, e0 / 0.07 );
  #endif
  return 1.0;
}
#endif
// stylised sun: wrapped soft terminator + one crisp cel band, rim toward the Sun, stylised spec, translucency
void mvSun( vec3 col, vec3 L, float sh, vec3 N, vec3 V, vec3 alb, inout ReflectedLight rl ) {
  float ndl = dot( N, L );
  float n2 = ndl + ( mvDetH - 0.5 ) * 0.5 * mvLookB.w + mvLookC.w;
  float band = smoothstep( -0.03, 0.09, n2 );
  float lit = band * sh;
  float wrap = mvLookA.z;
  float soft = clamp( ( ndl + wrap ) / ( 1.0 + wrap ), 0.0, 1.0 );
  mvLitK = lit;
  // Broader painted light planes retain the shape at a distance. Small changes
  // in a flat wall normal no longer turn into a continuous shiny gradient.
  float incidence=clamp(ndl,0.,1.);
  float planes=.27+.32*smoothstep(.16,.35,incidence)+.41*smoothstep(.57,.79,incidence);
  vec3 E = col * ( lit * mix(.17+.83*incidence,planes,.62) + ( 1.0 - lit ) * soft * .075 * sh );
  rl.directDiffuse += E * BRDF_Lambert( alb );
  float ndv = clamp( dot( N, V ), 0.0, 1.0 );
  float fres = ( 1.0 - ndv ) * ( 1.0 - ndv ); fres *= fres;
  float back = 0.4 + 0.6 * clamp( dot( -V, L ), 0.0, 1.0 );
  float toL = clamp( ndl * 0.6 + 0.55, 0.0, 1.0 );
  // round 2: the rim grows in the low dusk light (warm edge that separates figures from the crowns)
  float mvRv = mvVeilAt( vMvWorld.xz ), mvDuskRim = 1.0 + 1.6 * clamp( 4.0 * mvRv * ( 1.0 - mvRv ), 0.0, 1.0 );
  rl.directDiffuse += col * mix( alb, vec3( 1.0 ), 0.35 ) * ( RECIPROCAL_PI * 1.7 * mvLookA.x * fres * toL * back * sh * mvDuskRim );
  if ( mvLookA.y > 0.0 ) {
    vec3 H = normalize( L + V + vec3( 0.0, 1e-4, 0.0 ) );
    float s = pow( clamp( dot( N, H ), 0.0, 1.0 ), max( mvLookC.z, 1.0 ) );
    rl.directSpecular += col * ( mvLookA.y * smoothstep( 0.42, 0.62, s ) * lit * 0.5 );
  }
  if ( mvLookB.x > 0.0 ) {
    float bt = clamp( dot( -V, L ), 0.0, 1.0 ); bt *= bt * bt;
    rl.directDiffuse += col * alb * ( RECIPROCAL_PI * mvLookB.x * ( 0.25 + bt ) * ( 0.4 + 0.6 * sh ) * clamp( 0.7 - ndl * 0.5, 0.0, 1.0 ) );
  }
}
`;
// debug variant 'flatvary': constant colour, but every varying stays live (prices vertex outputs vs shading)
const FLATVARY = /* glsl */`
  {
    vec4 mvAcc = vec4( vMvWorld + vViewPosition, 1.0 );
    #ifndef FLAT_SHADED
      mvAcc.xyz += vNormal;
    #endif
    #ifdef USE_COLOR
      mvAcc.x += vColor.r;
    #endif
    #ifdef USE_UV
      mvAcc.xy += vUv;
    #endif
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      mvAcc += vDirectionalShadowCoord[ 0 ];
      #if NUM_DIR_LIGHT_SHADOWS > 1
        mvAcc += vDirectionalShadowCoord[ 1 ];
      #endif
      #if NUM_DIR_LIGHT_SHADOWS > 2
        mvAcc += vDirectionalShadowCoord[ 2 ];
      #endif
    #endif
    gl_FragColor = vec4( 0.3, 0.4, 0.25, 1.0 ) + mvAcc * 1e-7; return;
  }
`;
// computed once at the top of main()
const FRAG_LOCAL = /* glsl */`
  float mvV = mvVeilAt(vMvWorld.xz);
  float mvDay = mvDaylight(mvV);
  vec3 mvSunLocal = mvPalette(MV_ROW_SUN, mvV) * mvDay;
`;
// before emissivemap_fragment: normal (view space) and diffuseColor are final here, lights not yet evaluated
const FRAG_DETAIL = /* glsl */`
{
  mvWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
#if !defined(USE_SKINNING) && !defined(MV_OWN_SURFACE_DETAIL)
  if ( mvLookB.z > 0.0 && mvQ.x > 0.5 ) {
    float mvDist = length( vMvWorld - cameraPosition );
    // 1. macro colour drift (large painted wash, warm / cool)
    vec4 mvMac = texture2D( mvNoise, vMvWorld.xz * ( 1.0 / 97.0 ) + vMvWorld.y * 0.003 );
    float mvM1 = ( mvMac.r * 0.6 + mvMac.g * 0.4 ) - 0.5;
    float mvM2 = mvMac.b - 0.5;
    diffuseColor.rgb *= 1.0 + mvM1 * 0.34 * min( mvLookB.z, 1.0 );
    diffuseColor.rgb *= vec3( 1.0 + mvM2 * 0.12, 1.0, 1.0 - mvM2 * 0.12 );
    if ( mvLookB.y >= 0.0 && mvDist < 85.0 ) {
      // 2. material pattern, world-space triplanar (top projection oriented down the slope)
      float mvMid = 1.0 - smoothstep( 30.0, 85.0, mvDist );
      vec3 mvP = vMvWorld / mvLookC.x;
      vec3 mvW = mvWN * mvWN; mvW *= mvW; mvW /= ( mvW.x + mvW.y + mvW.z + 1e-5 );
      vec2 mvSl = mvWN.xz; float mvSll = length( mvSl );
      vec2 mvDir = mvSll > 0.08 ? mvSl / mvSll : vec2( 0.0, 1.0 );
      vec2 mvPerp = vec2( mvDir.y, -mvDir.x );
      // side projection: on planar faces (any orientation) one projection aligned with the face -> no 45-degree smear;
      // on curved surfaces (posts, trunks) the classic X / Z pair
      bool mvPlanar = length( fwidth( mvWN ) ) < 0.004 && mvSll > 0.08;
      vec2 uvS = vec2( dot( mvP.xz, mvPerp ), mvP.y );
      vec2 uvX = vec2( mvP.z, mvP.y ), uvY = vec2( dot( mvP.xz, mvPerp ), dot( mvP.xz, mvDir ) ), uvZ = vec2( mvP.x, mvP.y );
      if ( mvPlanar ) { uvX = uvS; uvZ = uvS; }
      vec2 gxX = dFdx( uvX ), gyX = dFdy( uvX ), gxY = dFdx( uvY ), gyY = dFdy( uvY ), gxZ = dFdx( uvZ ), gyZ = dFdy( uvZ );
      vec4 tX = vec4( 0.5 ), tY = vec4( 0.5 ), tZ = vec4( 0.5 );
      float L = mvLookB.y;
      if ( mvPlanar ) { mvW.x += mvW.z; mvW.z = 0.0; }
      if ( mvW.x > 0.02 ) tX = textureGrad( mvSurf, vec3( uvX, L ), gxX, gyX );
      if ( mvW.y > 0.02 ) tY = textureGrad( mvSurf, vec3( uvY, L ), gxY, gyY );
      if ( mvW.z > 0.02 ) tZ = textureGrad( mvSurf, vec3( uvZ, L ), gxZ, gyZ );
      vec4 mvT = tX * mvW.x + tY * mvW.y + tZ * mvW.z;
      // 3. fine speckle: the same pattern 4.3x smaller on the dominant projection
      float mvF = 0.0;
      if ( mvQ.y > 0.5 ) {
        float mvFineK = 1.0 - smoothstep( 6.0, 22.0, mvDist );
        vec2 uvF = mvW.y > max( mvW.x, mvW.z ) ? uvY : ( mvW.x > mvW.z ? uvX : uvZ );
        vec2 gF = mvW.y > max( mvW.x, mvW.z ) ? gxY : ( mvW.x > mvW.z ? gxX : gxZ );
        vec2 gF2 = mvW.y > max( mvW.x, mvW.z ) ? gyY : ( mvW.x > mvW.z ? gyX : gyZ );
        if ( mvFineK > 0.0 ) mvF = ( textureGrad( mvSurf, vec3( uvF * 4.31 + 0.37, L ), gF * 4.31, gF2 * 4.31 ).r - 0.5 ) * mvFineK * mvLookC.y;
      }
      float mvA = ( mvT.r - 0.5 ) * mvLookB.z * mvMid + mvF;
      diffuseColor.rgb *= max( 1.0 + mvA * 0.95, 0.15 );
      // darker strokes are a touch more saturated (paint, not dirt)
      float mvLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      diffuseColor.rgb = max( mix( vec3( mvLum ), diffuseColor.rgb, 1.0 + max( -mvA, 0.0 ) * 0.5 ), vec3( 0.0 ) );
      mvDetH = mix( 0.5, mvT.g, mvMid );
      // bend the normal with the pattern's height gradient
      vec2 gX = ( tX.ba - 0.5 ), gY = ( tY.ba - 0.5 ), gZ = ( tZ.ba - 0.5 );
      vec3 mvDn = ( mvPlanar ? -mvW.x * ( gX.x * vec3( mvPerp.x, 0.0, mvPerp.y ) + vec3( 0.0, gX.y, 0.0 ) ) : mvW.x * vec3( 0.0, -gX.y, -gX.x ) )
        - mvW.y * ( gY.x * vec3( mvPerp.x, 0.0, mvPerp.y ) + gY.y * vec3( mvDir.x, 0.0, mvDir.y ) )
        + mvW.z * vec3( -gZ.x, -gZ.y, 0.0 );
      mvWN = normalize( mvWN + mvDn * ( 1.3 * mvLookB.w * mvMid ) );
      normal = normalize( ( viewMatrix * vec4( mvWN, 0.0 ) ).xyz );
      if ( mvQ.w > 0.5 ) diffuseColor.rgb = vec3( mvT.r );
    }
  }
#endif
}
`;

function patchLights(src) {
  let s = src;
  // directional section -> one stylised sun from light 0, cascaded shadow from lights 0..n (shadow-only lights)
  const a = s.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  const e = s.indexOf('#endif', s.indexOf('#pragma unroll_loop_end', a)) + 6;
  if (a >= 0 && e > a) {
    s = s.slice(0, a) + /* glsl */`
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
{
  getDirectionalLightInfo( directionalLights[ 0 ], directLight );
  directLight.color *= mvSunLocal / max( mvSunCam, vec3( 1e-3 ) );
  float mvSh = 1.0;
  #ifndef MV_DBG_NOCONTACT
  mvContactK = mvContactAt( vMvWorld, mvWN );
  #endif
  if ( mvDay > 0.04 ) { // no sun under the Veil: skip the shadow / cloud lookups
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && defined( SHADOWMAP_TYPE_PCF )
    #ifndef MV_DBG_NOSHADOW
    if ( receiveShadow && mvCloud.w < 0.5 ) mvSh = mvCascadeShadow(); // w = 1 in the water mirror
    #endif
  #endif
    if ( mvQ.z > 0.5 ) {
      mvCloudDirect = mvCloudSunAt( vMvWorld, mvSunDir, mvCloud.y );
      mvSh *= mix( 1.0, mvCloudDirect, mvCloud.z );
    }
  }
  mvSh *= mvContactK;
  #ifdef MV_DBG_NOSUN
  mvLitK = mvSh * step( 0.0, dot( geometryNormal, directLight.direction ) );
  reflectedLight.directDiffuse += directLight.color * ( mvLitK * max( dot( geometryNormal, directLight.direction ), 0.0 ) ) * BRDF_Lambert( material.diffuseColor );
  #else
  #if defined(CEL_SLOTS) || defined(CEL_KIND)
    mvLitK = celSunPlane(geometryNormal, directLight.direction, mvSh, directLight.color, material.diffuseColor, reflectedLight);
  #else
  mvSun( directLight.color, directLight.direction, mvSh, geometryNormal, geometryViewDir, material.diffuseColor, reflectedLight );
  #endif
  #endif
  // night key (look round): a cool light from the Moon wheel (which sits on the Sun), cel-banded like the Sun; it uses
  // the same cast shadow while the maps still render (dusk) and the contact term after that
  vec3 mvMk = mvPalette( MV_ROW_MOONKEY, mvV ) * mvHemiMul;
  if ( mvMk.r + mvMk.g + mvMk.b > 1e-3 ) {
    float mvMn = dot( geometryNormal, directLight.direction ) + ( mvDetH - 0.5 ) * 0.4 * mvLookB.w;
    #if defined(CEL_SLOTS) || defined(CEL_KIND)
      float mvMb = celMoonPlane(.07 + .64 * smoothstep(-.07,.09,mvMn) + .13 * smoothstep(.27,.78,mvMn), geometryNormal);
    #else
      float mvMb = smoothstep( -0.04, 0.1, mvMn ) * ( 0.3 + 0.7 * clamp( mvMn, 0.0, 1.0 ) );
    #endif
    reflectedLight.directDiffuse += mvMk * ( mvMb * mvSh ) * BRDF_Lambert( material.diffuseColor );
  }
}
#endif
` + s.slice(e);
  }
  s = s.replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );', `{
      vec3 mvUpV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
      float mvW = 0.5 * dot( geometryNormal, mvUpV ) + 0.5;
      vec3 mvAmb = mix( mvPalette( MV_ROW_HEMIGND, mvV ), mvPalette( MV_ROW_HEMISKY, mvV ), mvW ) * mvHemiMul;
      // coloured shadow: where the sun does not reach, the ambient shifts toward the land's shadow colour
      float mvSunAvail = clamp( mvDay * 1.4 - 0.1, 0.0, 1.0 );
      // sky-scattered sunlight fills the shade (luminous, never grey or black): a little everywhere, more where the
      // direct sun is blocked; then the whole ambient of the shade shifts toward the land's shadow colour
      // look round: the shade keeps only a small share of the scattered sunlight (was 0.15 + 0.75), so the key light
      // has a shape: lit : shade is about 4 : 1 by day instead of 2.4 : 1
      mvAmb += mvSunLocal * ( MV_FILL_LIT + MV_FILL_SHADE * ( 1.0 - mvLitK ) ) * mvHemiMul;
      mvAmb *= mix( vec3( 1.0 ), mvPalette( MV_ROW_SHADOW, mvV ), ( 1.0 - mvLitK * mvSunAvail ) * mvLookA.w );
      // bounce from the sunlit ground onto down / side facing surfaces (warm, from below)
      float mvDown = clamp( 0.55 - 0.5 * mvWN.y, 0.0, 1.0 );
      mvAmb += mvSunLocal * mvPalette( MV_ROW_BOUNCE, mvV ) * mvDown * mvDown * (.18+.55*mvCloudDirect) * mvHemiMul;
      // sky fill is occluded where the surface faces into the ground (crevices, undersides), not only by the contact term
      // deep streets of the City of Magic see little sky: dim at the bottom, open again at balcony height
      irradiance += mvAmb * ( 0.3 + 0.7 * mvContactK ) * mvCanyonSky( vMvWorld );
      // lamp pools (light r3): every lantern near the view, read from the baked pool map (world/sky.js): fixed cost,
      // no per-lamp loop, no popping. The map holds the pool on the ground plane; the lamp height comes back from the
      // alpha (lum-weighted), so roofs high above a lantern and floors far below stay dark; the gradient of the map
      // points at the lamps, so walls facing them catch more light than walls turned away. Faded out beyond 40-56 m.
      #ifndef MV_DBG_NOAMB
      if ( mvLampBox.w > 0.0 ) {
        vec2 mvLu = ( vMvWorld.xz - mvLampBox.xy ) * mvLampBox.z;
        vec4 mvLt = texture2D( mvLampMap, mvLu );
        float mvLl = dot( mvLt.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        if ( mvLl > 2e-3 ) {
          float mvLy = mvLt.a / mvLl;
          float mvDy = vMvWorld.y - mvLy;
          float mvLh = clamp( 1.0 - mvDy * mvDy * 0.018, 0.0, 1.0 ); // a lantern on a post pools below it; the strings overhead much less
          float mvGs = mvLampBox.z * 0.75;
          float mvLx = dot( texture2D( mvLampMap, mvLu + vec2( mvGs, 0.0 ) ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          float mvLz = dot( texture2D( mvLampMap, mvLu + vec2( 0.0, mvGs ) ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          vec2 mvG = vec2( mvLx - mvLl, mvLz - mvLl );
          vec2 mvGd = dot( mvG, mvG ) > 1e-8 ? normalize( mvG ) : vec2( 0.0 );
          vec3 mvLd = normalize( vec3( mvGd.x * 1.6, max( mvLy - vMvWorld.y, -1.0 ) + 0.3, mvGd.y * 1.6 ) );
          float mvLn = clamp( dot( mvWN, mvLd ) * 0.8 + 0.2, 0.0, 1.0 );
          float mvLfar = 1.0 - smoothstep( 40.0, 56.0, length( vMvWorld.xz - cameraPosition.xz ) );
          vec3 mvLc = mvLt.rgb * ( mvLh * mvLh * mvLfar * mvLampBox.w * ( 0.25 + 0.75 * mvLn ) );
          // overlapping pools (a string of lanterns) roll off toward the lantern hue instead of adding up to white
          irradiance += mvLc * mvRollK( mvLc, 2.4, 4.0 );
        }
      }
      // golden rim from the ring, under the Veil
      vec3 mvSunV = normalize( ( viewMatrix * vec4( mvSunDir, 0.0 ) ).xyz );
      float mvRim = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
      float mvTo = saturate( dot( geometryNormal, mvSunV ) * 0.6 + 0.5 );
      irradiance += mvRingCol * mvBoostSoft() * mvRim * mvTo * mvV * mvV * 1.4 * ( 1.0 + 0.3 * mvV ) * ( 0.6 + mvLookA.x * 1.3 );
      irradiance += mvRingCol * mvBoostSoft() * saturate( dot( geometryNormal, mvSunV ) * 0.8 + 0.2 ) * mvV * mvV * MV_RING_FILL * ( 1.0 + 0.3 * mvV );
      #endif
    }`);
  return s;
}

const FOG = /* glsl */`
#if defined( USE_FOG ) && !defined( MV_DBG_NOFOG )
{
  vec3 mvRd = vMvWorld - cameraPosition;
  float mvDist = length( mvRd );
  // GPU pass: inside 15 m every term below is multiplied by an exact 0 (haze, aerial and mist all start further out)
  #ifndef MV_GPU_OLD
  if ( mvDist > 15.0 ) {
  #endif
  float mvK = mvFogFalloff;
  float mvH0 = max( cameraPosition.y - mvFogBase, 0.0 );
  float mvDy = mvRd.y;
  float mvInt = abs( mvDy ) > 0.01 ? ( 1.0 - exp( -mvK * mvDy ) ) / ( mvK * mvDy ) : 1.0;
  float mvAmt = mvFogDensity * exp( -mvK * mvH0 ) * mvInt * mvDist;
  float mvFF = ( 1.0 - exp( -mvAmt ) ) * smoothstep( 15.0, 60.0, mvDist ); // light r3: no haze on the first metres
  float mvFv = mix( mvCamVeil, mvV, 0.6 );
  vec3 mvFc = mix( mvFogCam, mvPalette( MV_ROW_FOG, mvFv ), 0.75 );
  float mvCs = max( dot( mvRd / max( mvDist, 1e-3 ), mvSunDir ), 0.0 );
  mvFc += vec3( 1.0, 0.82, 0.6 ) * pow( mvCs, 8.0 ) * 0.5 * mvSunVis * ( 1.0 - mvV );
  mvFc += mvRingCol * pow( mvCs, 6.0 ) * 0.25 * mvRingK * mvBoostSoft();
  // aerial perspective per land: distant land sinks into blue depth by day, a warm haze at dusk, a violet glow at night
  // look round: reaches the middle distance sooner (x2.4, was x1.6) and also moves the VALUE toward the air (darks lift,
  // the planes step back one behind the other) instead of only the hue
  // round 2: squared, so it grows with distance only: the foreground keeps its contrast, the far planes keep the haze
  // light r3: and nothing in the first ~40 m (full from ~100 m), so the near ground keeps its own contrast
  float mvAer = saturate( mvFF * 2.4 ); mvAer *= mvAer * smoothstep( 40.0, 100.0, mvDist );
  float mvL = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  float mvFL = max( dot( mvFc, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-3 );
  float mvTL = mix( mvL, mvFL, 0.35 );
  float mvDuskW = saturate( 4.0 * mvFv * ( 1.0 - mvFv ) );
  vec3 mvDepthTint = mix( mix( vec3( 0.58, 0.87, 1.24 ), vec3( 1.15, 0.86, 0.66 ), mvDuskW ), vec3( 0.78, 0.62, 1.25 ), smoothstep( 0.75, 1.0, mvFv ) );
  vec3 mvAerC = ( vec3( mvTL ) * 0.45 + mvFc * 0.55 * mvTL / mvFL ) * mvDepthTint;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mvAerC, mvAer * 0.48 );
  // ground mist pooling in the low ground and valleys, patchy and slowly drifting; thickest at dusk
  float mvMistK = ( 0.1 + 0.22 * mvDuskW + 0.1 * smoothstep( 0.8, 1.0, mvFv ) ) * mvQ.z;
  if ( mvMistK > 0.0 ) {
    float mvMh = exp( -max( vMvWorld.y - mvFogBase - 2.0, 0.0 ) * 0.09 ) * exp( -max( cameraPosition.y - vMvWorld.y, 0.0 ) * 0.004 );
    float mvMn = texture2D( mvNoise, vMvWorld.xz * 0.0021 + vec2( mvTime * 0.0012, mvTime * 0.0006 ) ).g;
    float mvMist = mvMistK * mvMh * smoothstep( 45.0, 200.0, mvDist ) * smoothstep( 0.25, 0.75, mvMn ); // light r3: mist starts further out (was 18 m: a grey wash on the near fields)
    mvFF = max( mvFF, saturate( mvMist ) );
  }
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mvFc, saturate( mvFF ) );
  #ifndef MV_GPU_OLD
  }
  #endif
}
#endif
`;

// summed direct light (sun + every point light): knee 0.9, ceiling 1.6 (daylight on a white wall stays under the knee)
const CLAMP_DIRECT = /* glsl */`
{
  float mvK = mvRollK( reflectedLight.directDiffuse + reflectedLight.directSpecular, 0.9, 1.6 );
  reflectedLight.directDiffuse *= mvK;
  reflectedLight.directSpecular *= mvK;
}
`;
// final non-emissive colour (direct + indirect), emissive added back untouched.
// round 2: knee 0.85 / ceiling 1.5 (was 1.0 / 1.75) — pale stone, plaster and white cloth in full sun stayed in the
// flat top of the ACES shoulder and read as white; hue-preserving (max channel), so they keep colour and texture
const CLAMP_FINAL = /* glsl */`
{
  vec3 mvLit = outgoingLight - totalEmissiveRadiance;
  outgoingLight = mvLit * mvRollK( mvLit, 0.85, 1.5 ) + totalEmissiveRadiance;
}
`;

// three's shadow chunks without the directional coordinate varyings (MV_SC_FRAG: computed per fragment, see FRAG_FUNCS)
const SC_DECL = 'varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];';
const SC_SET = 'vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;';
const chunkSwap = (src, a, b) => { if (!src.includes(a)) throw new Error('veilhook: three chunk changed (' + a + ')'); return src.replace(a, b); };
const SM_PARS_VERT = chunkSwap(THREE.ShaderChunk.shadowmap_pars_vertex, SC_DECL, '');
const SM_VERT = chunkSwap(THREE.ShaderChunk.shadowmap_vertex, SC_SET, '');
const SM_PARS_FRAG = chunkSwap(THREE.ShaderChunk.shadowmap_pars_fragment, SC_DECL, 'uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];');

const PATCHABLE = (m) => m && (m.isMeshToonMaterial || m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial);

// ---- per-material look -------------------------------------------------------------------------------------------
/** Defaults of material.userData.look (see docs/api/look.md). */
const surfaceRim = { stone:.045, rock:.055, plaster:.035, wood:.065, bark:.055, thatch:.08, paper:.09, cloth:.07, earth:.035, tile:.08, paint:.09, metal:.20 };
export const LOOK_DEFAULTS = { rim: 0.3, spec: 0, specPower: 24, wrap: 0.4, shadowTint: 1, trans: 0, detail: 1, bump: 1, fine: 1, band: 0 };
const NO_DETAIL = /^(flora|terrain|water|grass)/i;
/** Resolve the surface kind of a material: userData.surface, else an automatic guess. */
export function surfaceOf(m) {
  const s = m.userData?.surface;
  if (s === 'none' || s === false) return null;
  if (s && SURFACES[s]) return s;
  if (m.map || m.transparent || NO_DETAIL.test(m.name || '')) return null;
  return 'paint';
}
const LU = new WeakMap();
function lookUniforms(m) {
  let u = LU.get(m);
  if (!u) { u = { mvLookA: { value: new THREE.Vector4() }, mvLookB: { value: new THREE.Vector4() }, mvLookC: { value: new THREE.Vector4() } }; LU.set(m, u); }
  return u;
}
/** (Re)apply material.userData.look / .surface to the material's uniforms (call after changing them at runtime). */
export function refreshLook(m) {
  const u = lookUniforms(m);
  const kind = surfaceOf(m), K = kind ? SURFACES[kind] : null;
  const L = { ...LOOK_DEFAULTS, rim: surfaceRim[kind] ?? (/^flora/.test(m.name || '') ? .12 : LOOK_DEFAULTS.rim),
    ...(/^flora/.test(m.name || '') ? { trans: .55 } : null), ...(m.userData?.look || {}) };
  u.mvLookA.value.set(L.rim, L.spec, L.wrap, L.shadowTint);
  u.mvLookB.value.set(L.trans, K ? K.index : -1, K ? K.amp * L.detail : (m.map || NO_DETAIL.test(m.name || '') ? 0 : 0.6 * L.detail), K ? K.bump * L.bump : 0);
  u.mvLookC.value.set(K ? (L.scale || K.scale) : 1, K ? K.fine * L.fine : 0, L.specPower, L.band);
  return m;
}

// GPU pass (docs/api/perf.md "GPU pass"): debug variants that price the hook per term (tools/perf/gpuprobe.js).
// 0 = the normal shader (program keys unchanged). Never set in play.
export const HOOK_DEBUG_BITS = { flat: 1, noshadow: 2, onetap: 4, noblend: 8, nofog: 16, nocontact: 32, nosun: 64, noamb: 128, flatvary: 256 };
let DBG = 0;
// GPU pass switches (set once at boot by world/sky.js from ?gpu=0 / ?gpuoff=a,b): old = every pre-GPU-pass path
const GPU = { old: false, sc: true, tap: false };
/** GPU pass: { old, sc (shadow coords per fragment), tap (shadow tap early-out) } — before the first compile. */
export function setGpuHook(o) { Object.assign(GPU, o); }
/** Set the debug variant bits (HOOK_DEBUG_BITS); the caller marks the materials needsUpdate. */
export function setHookDebug(bits) { DBG = bits | 0; }
function dbgDefines() {
  if (!DBG) return '';
  let s = '';
  for (const [k, b] of Object.entries(HOOK_DEBUG_BITS)) if (DBG & b) s += '#define MV_DBG_' + k.toUpperCase() + '\n';
  return s;
}

function patchShader(shader, m) {
  if (shader.vertexShader.includes('vMvWorld')) return; // already patched
  if (!U.mvSurf.value) U.mvSurf.value = surfaceTexture();
  if (!U.mvNoise.value) U.mvNoise.value = noiseTexture();
  refreshLook(m);
  Object.assign(shader.uniforms, {
    mvPal: U.mvPal, mvVeil: U.mvVeil, mvSunDir: U.mvSunDir, mvCamVeil: U.mvCamVeil, mvRingCol: U.mvRingCol, mvRingK: U.mvRingK,
    mvRingBoost: U.mvRingBoost, mvTime: U.mvTime, mvSunCam: U.mvSunCam, mvHemiMul: U.mvHemiMul, mvFogCam: U.mvFogCam,
    mvFogDensity: U.mvFogDensity, mvFogFalloff: U.mvFogFalloff, mvFogBase: U.mvFogBase, mvSunVis: U.mvSunVis,
    mvSurf: U.mvSurf, mvNoise: U.mvNoise, mvCloud: U.mvCloud, mvQ: U.mvQ, mvContact: U.mvContact,
    mvCanyonBox: U.mvCanyonBox, mvCanyonY: U.mvCanyonY, mvCanyonCore: U.mvCanyonCore, mvCanyonOpen: U.mvCanyonOpen,
    mvCloudSunMap: cloudSunMap.texture, mvCloudSunBox: cloudSunMap.box,
    mvLampMap: U.mvLampMap, mvLampBox: U.mvLampBox,
  }, lookUniforms(m));
  // GPU pass: per-fragment cascade coordinates (not with flat shading: no vNormal; not when a hook moved the shadow
  // lookup position, e.g. flora cards look their shadow up off the crown surface)
  const scFrag = !GPU.old && GPU.sc && !m.flatShading && !/worldPosition/.test(shader.vertexShader);
  const gpuDefs = (GPU.old ? '#define MV_GPU_OLD\n' : '') + (scFrag ? '#define MV_SC_FRAG\n' : '') + (!GPU.old && GPU.tap ? '#define MV_TAP_EARLY\n' : '');
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + gpuDefs + VERT_PARS)
    .replace('#include <shadowmap_pars_vertex>', scFrag ? SM_PARS_VERT : '#include <shadowmap_pars_vertex>')
    .replace('#include <shadowmap_vertex>', scFrag ? SM_VERT : '#include <shadowmap_vertex>')
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + gpuDefs + dbgDefines() + FRAG_PARS)
    .replace('#include <shadowmap_pars_fragment>', (scFrag ? SM_PARS_FRAG : '#include <shadowmap_pars_fragment>') + '\n' + FRAG_FUNCS)
    .replace('void main() {', 'void main() {\n' + (DBG & 1 ? '#ifdef MV_DBG_FLAT\n  gl_FragColor = vec4( 0.3, 0.4, 0.25, 1.0 ); return;\n#endif\n' : '') + (DBG & 256 ? FLATVARY : '') + FRAG_LOCAL)
    .replace('#include <emissivemap_fragment>', FRAG_DETAIL + '#include <emissivemap_fragment>')
    .replace('#include <lights_fragment_begin>', patchLights(THREE.ShaderChunk.lights_fragment_begin))
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + CLAMP_DIRECT)
    .replace('#include <opaque_fragment>', CLAMP_FINAL + '#include <opaque_fragment>')
    .replace('#include <fog_fragment>', FOG);
}

const KEY = '|mvlook1';
const done = new WeakSet(); // not userData: Material.copy() clones userData, and own() re-hooks clones
/** The material hook (idempotent). */
export const hasWorldLighting = (m) => done.has(m);
export function veilHook(m) {
  if (!PATCHABLE(m) || done.has(m)) return;
  done.add(m);
  let user = Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') ? m.onBeforeCompile : null;
  if (user === THREE.Material.prototype.onBeforeCompile) user = null;
  let userKey = Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey : null;
  const wrapped = function (shader, renderer) {
    if (user) user.call(this, shader, renderer);
    patchShader(shader, this);
  };
  const keyFn = function () {
    return (userKey ? userKey.call(this) : user ? user.toString() : '') + KEY + (DBG ? '|dbg' + DBG : '') + (GPU.old ? '|gold' : (GPU.sc ? '' : '|nosc') + (GPU.tap ? '|tap' : ''));
  };
  Object.defineProperty(m, 'onBeforeCompile', {
    configurable: true, enumerable: true,
    get() { return wrapped; },
    set(fn) { user = fn === wrapped ? user : fn; this.needsUpdate = true; },
  });
  Object.defineProperty(m, 'customProgramCacheKey', {
    configurable: true, enumerable: true,
    get() { return keyFn; },
    set(fn) { userKey = fn === keyFn ? userKey : fn; },
  });
  m.needsUpdate = true;
}
