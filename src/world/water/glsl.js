// GLSL of the water material (injected into a MeshPhongMaterial, then passed through hookMaterial).
// WQ = 0 low / 1 med / 2 high. See src/world/water.js for the model.
import * as THREE from 'three';
import { TRAIL_SAMPLES } from './flight-wake.js';
import { DATA_HALF } from '../terrain/textures.js';

export const MAX_RIPPLES = 12, MAX_WAKES = 24;
const lin = (hex, k = 1) => { const c = new THREE.Color().setHex(hex); return `vec3(${(c.r * k).toFixed(4)}, ${(c.g * k).toFixed(4)}, ${(c.b * k).toFixed(4)})`; };
const F = (x) => x.toFixed(4);
const H = F(DATA_HALF), H2 = F(DATA_HALF * 2);

// shared: long open-sea swell (height + gradient), masked to deep open water near the camera
const SWELL = /* glsl */`
float wSwell(vec2 p, float t, out vec2 g) {
  vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.3, 0.954), d3 = vec2(0.954, -0.3);
  float a1 = 0.165 * dot(d1, p) - 1.27 * t, a2 = 0.262 * dot(d2, p) - 1.60 * t, a3 = 0.419 * dot(d3, p) - 2.03 * t;
  g = d1 * (0.18 * 0.165 * cos(a1)) + d2 * (0.10 * 0.262 * cos(a2)) + d3 * (0.05 * 0.419 * cos(a3));
  return 0.18 * sin(a1) + 0.10 * sin(a2) + 0.05 * sin(a3);
}
float wBasin(vec2 p){
  if(wTrial.z<1.)return 0.;
  float r=length((p-wTrial.xy)/wTrial.zw);
  return 1.-smoothstep(1.12,1.38,r);
}
float wCalmAt(vec2 p) {
  float lake = 1.0 - smoothstep(wLake.z - 25.0, wLake.z + 10.0, distance(p, wLake.xy));
  float md = distance(p, wMoat.xy);
  float moat = smoothstep(wMoat.z - 8.0, wMoat.z + 2.0, md) * (1.0 - smoothstep(wMoat.w - 2.0, wMoat.w + 10.0, md));
  return max(wBasin(p),max(lake, moat));
}
`;

export const VERT_PARS = /* glsl */`
uniform sampler2D wData;
uniform float wTime;
uniform vec4 wLake, wMoat, wTrial;
varying vec3 vWW;
${SWELL}
`;
export const VERT_MAIN = /* glsl */`
{
  vec3 wq = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float wdep = max(0.0, -texture2D(wData, (wq.xz + ${H}) / ${H2}).r);
  float wsea = smoothstep(4.0, 10.0, wdep) * (1.0 - wCalmAt(wq.xz)) * (1.0 - smoothstep(140.0, 380.0, distance(wq.xz, cameraPosition.xz)));
  vec2 wg;
  transformed.y += wSwell(wq.xz, wTime, wg) * wsea;
  vWW = wq; vWW.y += transformed.y - position.y;
}
`;

export function fragPars(WQ) {
  return /* glsl */`
#define WQ ${WQ}
uniform sampler2D wData, wNoise, wWave, wFlow, wReflTex, wSkyLow, wSkyHemisphere;
uniform float wHasHemisphere;
uniform float wTime, wWind, wRingK, wReflK, wSkyK, wRain, wDebug;
uniform vec4 wVeil, wLake, wMoat, wTrial;
uniform vec2 wAtmosphere;
uniform vec3 wSunDir, wSunCol, wRingCol;
uniform mat4 wReflMat, wViewProj, wInvViewProj;
uniform vec4 wRipples[${MAX_RIPPLES}];
uniform vec4 wWakes[${MAX_WAKES}];
uniform vec4 wFlightPath[${TRAIL_SAMPLES}], wFlightBounds;
uniform sampler2D wRefrTex, wRefrDepth;
uniform float wRefrK;
uniform vec2 wScreenInv, wNearFar;
varying vec3 vWW;
float wLinZ(float d) { return wNearFar.x * wNearFar.y / max(wNearFar.y - d * (wNearFar.y - wNearFar.x), 1e-4); }
${SWELL}
vec3 wPal(vec3 a, vec3 b, vec3 c, vec3 d, float v) {
  if (v < 0.38) return mix(a, b, smoothstep(0.0, 0.38, v));
  if (v < 0.72) return mix(b, c, smoothstep(0.38, 0.72, v));
  return mix(c, d, smoothstep(0.72, 1.0, v));
}
float wHash(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
float wWakeNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(wHash(i),wHash(i+vec2(1,0)),f.x),mix(wHash(i+vec2(0,1)),wHash(i+1.0),f.x),f.y);
}
// expanding rings: returns crest intensity, accumulates a radial slope into g
float wRing(vec2 p, vec4 r, float speed, float life, float w0, inout vec2 g) {
  float age = wTime - r.z;
  if (r.w <= 0.0 || age < 0.0 || age > life) return 0.0;
  float rad = 0.2 + age * speed;
  vec2 dv = p - r.xy;
  float d = length(dv);
  float w = w0 + age * 0.09;
  float x = (d - rad) / w;
  if (abs(x) > 3.5) return 0.0;
  float k = r.w * pow(max(1.0 - age / life, 0.0), 1.4);
  float e = exp(-x * x);
  g += (dv / max(d, 1e-3)) * (-2.0 * x * e) * k * 0.22;
  return e * k;
}
#if WQ > 0
float wRainRings(vec2 p, float t, inout vec2 g) {
  float s = 0.0;
  for (int L = 0; L < 2; L++) {
    vec2 q = p / 0.85 + float(L) * vec2(0.37, 0.71);
    vec2 c = floor(q), f = fract(q);
    float h = wHash(c + float(L) * 17.0), h2 = fract(h * 91.7);
    vec2 dv = f - (vec2(0.3) + 0.4 * vec2(h, h2));
    float ph = fract(t * 1.15 + h * 7.0);
    float d = length(dv), x = (d - ph * 0.3) / 0.022;
    float e = exp(-x * x) * (1.0 - ph);
    g += (dv / max(d, 1e-3)) * (-x * e) * 0.04;
    s += e;
  }
  return s;
}
#endif
`;
}

// colour_fragment: everything about the surface (depth, flow, waves, foam) is computed here
export const FRAG_COLOR = /* glsl */`
vec3 wP = vWW;
vec2 wUV = (wP.xz + ${H}) / ${H2};
float wDepth = max(0.0, -texture2D(wData, wUV).r);
float wDist = distance(cameraPosition, wP);
vec3 wView = (wP - cameraPosition) / max(wDist, 1e-3);
float wV = 1.0 - smoothstep(wVeil.z, wVeil.w, distance(wP.xz, wVeil.xy));
float wSun = 1.0 - smoothstep(0.05, 0.34, wV);
float wNight = smoothstep(0.56, 0.86, wV);
float wDusk = max(0.0, 1.0 - wSun - wNight);
float wt = wTime;
float basin = wBasin(wP.xz);
float wCalm = wCalmAt(wP.xz);
float wSeaK = smoothstep(4.0, 10.0, wDepth) * (1.0 - wCalm);
float wAmpD = 1.0 / (1.0 + wDist / 70.0);

// ---- waves: two painted layers (+ a flow-mapped layer on the rivers), mip-filtered so they calm with distance
vec4 wS1 = texture2D(wWave, wP.xz / 41.0 + vec2(wt * 0.0105, wt * 0.0062));
vec4 wS2 = texture2D(wWave, mat2(0.8, -0.6, 0.6, 0.8) * wP.xz / 14.0 + vec2(-wt * 0.0175, wt * 0.0118));
vec4 wFl = texture2D(wFlow, wUV);
// A shallow inlet widens west to east before losing its current in the still basin.
float channelX=wP.x-1505.;
float streamAxis=-80.+channelX*.39+2.2*sin(channelX*.10);
float inlet=wBasin(wP.xz)*smoothstep(2.,14.,channelX)*(1.-smoothstep(65.,105.,channelX))*
  (1.-smoothstep(1.,9.,abs(wP.z-streamAxis)));
wFl=mix(wFl,vec4(.57,.53,.57,.16),inlet);
float wRiver = wFl.b;
vec2 wVel = (wFl.rg - 0.5) * 6.0;
float wSpeed = wFl.a * 3.0;
vec4 wS3 = vec4(0.5, 0.5, 0.0, 0.0);
if (wRiver > 0.01) {
  float ph0 = fract(wt * 0.4), ph1 = fract(wt * 0.4 + 0.5);
  float fw = abs(ph0 * 2.0 - 1.0);
  vec2 base = wP.xz / 6.5;
  vec4 fa = texture2D(wWave, base - wVel * ph0 * 2.5 / 6.5);
  vec4 fb = texture2D(wWave, base - wVel * ph1 * 2.5 / 6.5 + vec2(0.37, 0.61));
  wS3 = mix(fa, fb, fw);
  wS2 = mix(wS2, wS3, wRiver * 0.85);
}
// round 3: break the tiling of the open water — a third, rotated large layer and two slow macro masks that trade the
// layers against each other (patches of choppy / glassy water), and a painted far sea: with distance the chop gives way
// to long soft swell bands across the view (see the far-sea block in the reflection)
vec4 wS4 = texture2D(wWave, mat2(0.31, 0.95, -0.95, 0.31) * wP.xz / 97.0 + vec2(wt * 0.0047, -wt * 0.0069));
vec4 wMac = texture2D(wNoise, wP.xz / 430.0 + vec2(wt * 0.0011, wt * 0.0007));
float wMa = smoothstep(0.25, 0.75, wMac.r), wMb = smoothstep(0.3, 0.7, wMac.g);
float wFarK = smoothstep(70.0, 360.0, wDist) * (1.0 - wCalm);
vec2 wG = ((wS1.rg - 0.5) * 0.7 * (0.55 + 0.9 * wMa) + (wS2.rg - 0.5) * 0.42 * (1.0 - 0.55 * wCalm) * (1.35 - 0.7 * wMb * wMa)
          + (wS4.rg - 0.5) * 0.55 * (0.4 + 0.6 * wMb)) * 2.0 * mix(1.0, 0.45, wFarK);
wG *= 1.20 * mix(1.0, 0.25, wCalm) * mix(0.3, 1.0, smoothstep(0.3, 4.0, wDepth)) * wAmpD * (1.0 - wRiver * 0.4 + wSeaK * 0.25);
{
  // Sheltered islands break the wind fetch. Rain, the western inlet and broom wakes
  // disturb their own patches instead of roughening the entire landlocked basin.
  float exposure=clamp(.11+.17*wMa+.38*smoothstep(.98,1.70,wWind)+.16*wRain+.22*inlet,0.,1.);
  wG *= mix(1.,exposure,basin);
  vec2 sg; wSwell(wP.xz, wt, sg);
  wG += sg * wSeaK * (1.0 - smoothstep(140.0, 380.0, distance(wP.xz, cameraPosition.xz))) * 1.4;
}
// ---- rings: ripples, wakes, rain
float wRip = 0.0;
if (wDist < 160.0) {
  for (int i = 0; i < ${MAX_RIPPLES}; i++) wRip += wRing(wP.xz, wRipples[i], 2.4, 2.6, 0.12, wG);
#if WQ > 0
  for (int i = 0; i < ${MAX_WAKES}; i++) wRip += 0.8 * wRing(wP.xz, wWakes[i], 1.5, 2.6, 0.09, wG);
#endif
}
#if WQ > 0
float wRainS = 0.0;
if (wRain > 0.01 && wDist < 50.0) wRainS = wRainRings(wP.xz, wt, wG) * wRain * (1.0 - smoothstep(25.0, 50.0, wDist));
wRip += wRainS * 0.6;
#endif
// History is sampled by travelled distance. Locate only the nearest segment so joins stay smooth through turns.
float flightFoam = 0.0;
if (all(greaterThanEqual(wP.xz, wFlightBounds.xy)) && all(lessThanEqual(wP.xz, wFlightBounds.zw))) {
  float nearest = 900.0, age = 0.0, drive = 0.0;
  vec2 outward = vec2(0.0);
  for (int j = 1; j < ${TRAIL_SAMPLES}; ++j) {
    vec4 a = wFlightPath[j-1], b = wFlightPath[j];
    vec2 line = b.xy-a.xy;
    float len2 = dot(line,line);
    if (len2 < 0.0001 || a.w < 0.0 || b.w < 0.0) continue;
    float t = clamp(dot(wP.xz-a.xy,line)/len2,0.0,1.0);
    vec2 offset = wP.xz-mix(a.xy,b.xy,t);
    float dist2 = dot(offset,offset);
    if (dist2 < nearest) {
      nearest = dist2; age = wTime-mix(a.z,b.z,t); drive = mix(a.w,b.w,t);
      vec2 wing = vec2(-line.y,line.x)*inversesqrt(len2);
      outward = wing*sign(dot(offset,wing));
    }
  }
  float swell = 1.0-exp(-max(0.0,age)*2.7);
  float width = .08 + swell*(.66+1.65*drive);
  vec2 foamUV = wP.xz*3.0 + vec2(wt*.24,-wt*.15);
  float grain = .62*wWakeNoise(foamUV)+.38*wWakeNoise(foamUV*3.3+vec2(wt*.17));
  float tuft = wWakeNoise(foamUV*.34+vec2(.2*wt,4.2));
  float d = sqrt(nearest);
  float ridge = d - width*(.71+.54*tuft) - (grain-.5)*(.09+.45*swell);
  float thick = .037+.06*drive+.14*swell;
  float edge = exp(-ridge*ridge/(thick*thick));
  float ripple = exp(-pow((ridge+.22+.24*swell)/(thick*.48),2.));
  float churn = exp(-d*d/(.02+.17*swell))*(1.0-swell);
  float broken = mix(.48+.42*grain, smoothstep(.27,.70,grain)*smoothstep(.12,.61,tuft),.3+.70*swell);
  float fade = drive*(1.0-smoothstep(.50,1.68,age))*smoothstep(.06,.65,wDepth);
  flightFoam = clamp(((edge+.33*ripple)*broken*2.0 + churn*grain)*fade,0.0,1.0);
  wG += outward*clamp(ridge/thick,-2.0,2.0)*edge*fade*.21;

}
vec3 wNrm = normalize(vec3(-wG.x, 1.0, -wG.y));

// ---- body colour by depth and land
vec3 wShallow = ${lin(0x62e8d4)} * wSun + ${lin(0xf4b890)} * wDusk + ${lin(0x164a62)} * wNight;
vec3 wMid     = ${lin(0x1aaccc)} * wSun + ${lin(0xbc7490)} * wDusk + ${lin(0x0c2c46)} * wNight;
vec3 wDeep    = ${lin(0x10528e)} * wSun + ${lin(0x553874)} * wDusk + ${lin(0x040e22)} * wNight;
float wb1 = texture2D(wNoise, wP.xz / 83.0 + vec2(wt * 0.003, wt * 0.002)).b;
wShallow=mix(wShallow,${lin(0x4cc69e)},basin*.86);
wMid=mix(wMid,${lin(0x138f93)},basin*.79);
wDeep=mix(wDeep,${lin(0x125674)},basin*.88);
vec3 wBase = mix(wShallow, wMid, smoothstep(0.3, 3.5, wDepth));
wBase = mix(wBase, wDeep, smoothstep(3.0, 14.0, wDepth + (wb1 - 0.5) * 3.0));
wBase *= (0.9 + 0.2 * wb1)*mix(vec3(1.),vec3(.36,.48,.66),wAtmosphere.y);
wBase *= 0.94 + 0.12 * wMa * wSeaK; // choppy patches a touch lighter
// optical path: see-through shallows, opaque at grazing angles and in the deep
float wPath = wDepth / max(0.12, -wView.y);
float wA0 = 1.0 - exp(-wPath * mix(0.42, 0.62, wNight)) * (1.0 - smoothstep(0.0, 1.0, wDist / 700.0));
wA0 = clamp(wA0 + 0.06, 0.0, 1.0);

// ---- foam: shore lip, swash lines rolling in, river streaks, whitecaps, rings
float wn = texture2D(wNoise, wP.xz / 7.0 + vec2(wt * 0.02, -wt * 0.013)).g;
float wn2 = texture2D(wNoise, wP.xz / 19.0 - vec2(wt * 0.008, 0.0)).r;
float wEdge = smoothstep(0.0, 0.1, wDepth);
float wLip = (1.0 - smoothstep(0.08, 0.24 + wn * 0.3, wDepth)) * smoothstep(0.0, 0.05, wDepth);
float wFringe = (1.0 - smoothstep(0.2, 1.1 + wn2 * 0.6, wDepth)) * smoothstep(0.45, 0.7, wn * 0.7 + wn2 * 0.5);
float wSwash = fract(wDepth * mix(0.75, 1.4, wCalm) - wt * mix(0.3, 0.12, wCalm) + wn2 * 0.7);
float wLine = smoothstep(0.76, 0.86, wSwash) * (1.0 - smoothstep(0.88, 0.99, wSwash));
wLine *= (1.0 - smoothstep(0.6, 2.4, wDepth)) * smoothstep(0.3, 0.55, wn + 0.15) * mix(1.0, 0.5, wCalm);
float wStreak = smoothstep(0.5, 0.85, wS3.b) * wRiver * smoothstep(0.9, 2.2, wSpeed);
float wCap = smoothstep(0.72, 0.95, wS1.b * 0.55 + wS2.b * 0.6 + (wMa - 0.5) * 0.25) * wSeaK * 0.55 * wAmpD;
float wFoam = clamp(max(max(wLip, wLine), max(max(wStreak * 0.75, wCap), wFringe * 0.42)) + wRip * 0.55, 0.0, 1.0);
wFoam *= 1.0 - smoothstep(250.0, 900.0, wDist) * 0.7;
// painterly two-tone foam: bright core, cool-shadowed fringe
float wFoamCore = smoothstep(0.45, 0.7, max(wFoam,flightFoam));
vec3 wFoamHi = ${lin(0xffffff)} * wSun + ${lin(0xffe6d2)} * wDusk + ${lin(0x6a9ab6)} * wNight;
vec3 wFoamLo = ${lin(0xbfe8f0)} * wSun + ${lin(0xe8b8c0)} * wDusk + ${lin(0x2e5a78)} * wNight;
vec3 wFoamC = mix(wFoamLo, wFoamHi, wFoamCore);
float wFoamA = max(smoothstep(0.08, 0.4, wFoam),flightFoam*.92);
diffuseColor.rgb = mix(wBase, wFoamC, wFoamA);
wA0 = max(wA0, wFoamA);
`;

export const FRAG_NORMAL = /* glsl */`
normal = normalize( ( viewMatrix * vec4( wNrm, 0.0 ) ).xyz );
`;

// envmap_fragment: reflection, glints, ring path, caustics, night glow, and the premultiplied-style composition
export function fragReflect(ringR) {
  return /* glsl */`
{
  float wCos = clamp(dot(-wView, wNrm), 0.0, 1.0);
  float wF = 0.02 + 0.98 * pow(1.0 - wCos, 5.0);
  wF = clamp(mix(0.14 + 0.11*wCalm, 0.96, wF), 0.0, 0.96) * (1.0 - wFoamA);
  vec3 wR = reflect(wView, wNrm);
  wR.y = abs(wR.y) + 0.002;
  wR = normalize(wR);
  // analytic sky (same keys as the sky palette)
  vec3 skyZen = wPal(${lin(0x3f86dc, 1.05)}, ${lin(0x5468b8, 0.95)}, ${lin(0x2e2a6c, 0.7)}, ${lin(0x060a26, 0.62)}, wV);
  vec3 skyHor = wPal(${lin(0xcfe7f6, 1.15)}, ${lin(0xffc88c, 1.1)}, ${lin(0xe58a84, 0.85)}, ${lin(0x1a2452, 0.62)}, wV);
  vec3 wSky = mix(skyHor, skyZen, pow(clamp(wR.y, 0.0, 1.0), 0.6));
  if(wHasHemisphere>0.5){
    vec2 uvSky=vec2(atan(wR.z,wR.x)*.159154943+.5,asin(clamp(wR.y,0.,1.))*.636619772);
    wSky=texture2D(wSkyHemisphere,uvSky).rgb;
  }
  // The main view refines visible sky detail close to the water surface.
  if (wSkyK > 0.5) {
    vec4 cl = wViewProj * vec4(wR, 0.0);
    if (cl.w > 1e-4) {
      // off-screen directions take the nearest on-screen sky (the screen's top row is the highest sky we know)
      vec2 su = clamp(cl.xy / cl.w * 0.5 + 0.5, vec2(0.003), vec2(0.997));
      // only where the sampled direction is close to the wanted one and above the horizon
      vec4 hp = wInvViewProj * vec4(su * 2.0 - 1.0, 1.0, 1.0);
      vec3 sd0 = hp.xyz / (abs(hp.w) > 1e-6 ? hp.w : 1e-6) - cameraPosition;
      vec3 sdir = sd0 / max(length(sd0), 1e-4);
      float e = smoothstep(0.82, 0.97, dot(sdir, wR)) * smoothstep(0.0, 0.06, sdir.y);
      wSky = mix(wSky, texture2D(wSkyLow, su).rgb, e * .82 * (1.-smoothstep(12.,55.,abs(cameraPosition.y))));
    }
  }
  vec3 wRefl = wSky;
  float wCover = 0.0;
  if (wReflK > 0.001) {
    vec4 rp = wReflMat * vec4(wP.x, 0.0, wP.z, 1.0);
    // distortion grows with distance from the camera: the mirror right at her feet stays calm and readable
    vec2 ru = rp.xy / max(rp.w, 1e-4) + vec2(wG.x, wG.y*0.64) * mix(0.018, 0.008, wCalm) * (0.4 + 0.6 * wAmpD) * mix(0.35, 1.0, smoothstep(3.0, 28.0, wDist));
    vec4 rc = texture2D(wReflTex, clamp(ru, 0.001, 0.999));
    vec2 edge = min(ru,1.0-ru);
    float inFrame = smoothstep(-0.002,0.008,min(edge.x,edge.y))*step(0.001,rp.w);
    wCover = clamp(rc.a, 0.0, 1.0)*wReflK*inFrame;
    wRefl = mix(wSky, rc.rgb/max(rc.a,0.008), wCover);
    // A broad directional fill keeps the rider and shoreline coherent across the rough sea.
    wF = mix(wF,max(wF,0.38+0.12*wCalm), wCover*(1.0-wFoamA));
  }
  float wOpen = 1.0 - wCover;
  // painted far sea: long soft bands across the view (brighter crests catching the sky, darker troughs), no texel pattern
  if (wFarK > 0.001) {
    vec2 vd = normalize(wView.xz + vec2(1e-4, 0.0));
    vec2 bq = vec2(dot(wP.xz, vec2(-vd.y, vd.x)) / 340.0, dot(wP.xz, vd) / 34.0);
    float band = texture2D(wNoise, bq + vec2(wt * 0.0009, -wt * 0.006)).r * 0.65 + texture2D(wNoise, bq * vec2(2.3, 2.9) + vec2(0.31, wt * 0.011)).g * 0.35;
    band = smoothstep(0.3, 0.75, band);
    wRefl = mix(wRefl, wRefl * (0.86 + 0.28 * band) + skyHor * 0.06 * band, wFarK * wOpen);
    wF = mix(wF, clamp(wF * (0.8 + 0.4 * band), 0.0, 0.96), wFarK);
  }
  vec3 X = wF * wRefl;
  // Sun: broad glitter path + crisp glints on the crests
  float sd = max(dot(wR, wSunDir), 0.0);
  float sunVis = (1.0-smoothstep(.25,.8,wV))*wAtmosphere.x;
  #ifdef MV_CLOUD_LIGHT
    sunVis *= mvCloudDirect;
  #endif
  float crest = smoothstep(0.35, 0.85, wS2.b + wS1.b * 0.5);
  float glint = pow(sd, 980.0) * 7.0 + pow(sd, 165.0) * 0.95 * crest + pow(sd, 22.0) * 0.12;
  X += wSunCol * glint * sunVis * wOpen * (1.0 - wFoamA) * (0.35 + 0.65 * wAmpD + wCalm * 0.4);
  // golden ring: a crisp, shimmering ring off a calmer copy of the surface + a glitter path below it
  if (wRingK > 0.001) {
    vec3 wNc = normalize(mix(vec3(0.0, 1.0, 0.0), wNrm, mix(0.22, 0.09, wCalm)));
    vec3 wRc = reflect(wView, wNc);
    float ang = acos(clamp(dot(wRc, wSunDir), -1.0, 1.0));
    float rw = max(.0035 + wDist * .000019, fwidth(ang)*.85);
    float rx = (ang - ${F(ringR)}) / rw;
    float ring = exp(-rx * rx) * 3.2 + exp(-max(ang - ${F(ringR)}, 0.0) / 0.05) * smoothstep(${F(ringR * 0.6)}, ${F(ringR)}, ang) * 0.12;
    float path = pow(max(dot(wR, wSunDir), 0.0), 70.0);
    float spark = smoothstep(0.55, 0.9, wS2.b) * (0.6 + 0.4 * sin(wt * 3.0 + wS1.b * 20.0));
    float halo = exp(-ang / 0.16) * 0.07;
    // The mirrored lunar silhouette occludes skylight behind it; the shore and the rider can still cover it.
    float lunarDisc=(1.-smoothstep(${F(ringR)}-rw,${F(ringR)}+rw,ang))*wRingK*wOpen;
    X*=1.-.87*lunarDisc;
    vec3 ringLight = wRingCol;
    #ifdef MV_CLOUD_LIGHT
      ringLight *= mvCloudDirect;
    #endif
    X += ringLight * (ring + path * (.16 + spark * mix(2.2,.60,basin))*(1.-lunarDisc) + halo) * wRingK * wOpen * (1.0 - wFoamA * 0.8);
  }
#if WQ > 0
  // caustics on the shallow bed (seen through the water), day and dusk
  float cK = (1.0 - smoothstep(0.3, 4.5, wDepth)) * smoothstep(0.02, 0.2, wDepth) * (1.0 - wNight) * (1.0 - wFoamA);
  cK *= sunVis;
  if (cK > 0.001 && wDist < 120.0) {
    vec2 cu = wP.xz + wG * wDepth * 2.0;
    float c1 = texture2D(wWave, cu / 6.3 + vec2(wt * 0.021, wt * 0.013)).a;
    float c2 = texture2D(wWave, mat2(0.6, 0.8, -0.8, 0.6) * cu / 4.9 - vec2(wt * 0.016, -wt * 0.011)).a;
    float c = pow(clamp(c1 * c2 * 1.6 + max(c1, c2) * 0.25, 0.0, 2.0), 1.3);
    X += wSunCol * c * cK * 0.75 * (1.0 - wA0) * (1.0 - wF) * (1.0 - smoothstep(60.0, 120.0, wDist));
  }
  // night: glowing motes drifting at two depths (parallax), faint glowing ripple lines
  if (wNight > 0.01) {
    float mo = 0.0;
    for (int L = 0; L < 2; L++) {
      float dl = 0.5 + float(L) * 1.1;
      if (wDepth > dl) {
        vec2 q = (wP.xz + wView.xz / max(-wView.y, 0.2) * dl + vec2(wt * 0.06, wt * 0.04) * (1.0 + float(L))) / 1.7;
        vec2 c = floor(q), f = fract(q) - 0.5;
        float h = wHash(c + float(L) * 31.0);
        vec2 off = vec2(fract(h * 13.7), fract(h * 29.3)) - 0.5;
        float d = length(f - off * 0.6);
        mo += step(0.78, h) * exp(-d * d / 0.0035) * (0.55 + 0.45 * sin(wt * (1.5 + h * 3.0) + h * 40.0)) / (1.0 + float(L));
      }
    }
    float gl = smoothstep(0.62, 0.92, wS2.b) * smoothstep(0.4, 0.7, wn2) * 0.10;
    float shoreGlow = (1.0 - smoothstep(0.5, 6.0, wDepth));
    X += (${lin(0x6ff3ff)} * (gl * (0.5 + shoreGlow) + mo * 0.9 * (1.0 - wF)) + ${lin(0xffd98a)} * mo * 0.25) * wNight * (1.0 - smoothstep(60.0, 500.0, wDist));
    X += ${lin(0x8ff6ff)} * wRip * wNight * 1.2;
    X += wFoamC * wFoamA * wNight * 0.14;
  }
#endif
#if WQ > 0
  if (wRefrK > 0.5) {
    // refraction (round 2): the bed comes from the opaque scene captured before the water drew, bent by the wave
    // normals in proportion to the water's thickness (zero at the waterline: no seam), never from in front of the water
    vec2 su = gl_FragCoord.xy * wScreenInv;
    float zS = wLinZ(gl_FragCoord.z);
    float zB0 = wLinZ(texture2D(wRefrDepth, su).x);
    float th0 = max(zB0 - zS, 0.0);
    vec2 off = normal.xy * (0.05 / (1.0 + zS * 0.03)) * smoothstep(0.0, 1.2, th0) * mix(1.0, 0.45, wCalm);
    vec2 su2 = clamp(su + off, vec2(0.001), vec2(0.999));
    float zB = wLinZ(texture2D(wRefrDepth, su2).x);
    if (zB < zS + 0.02) { su2 = su; zB = zB0; }
    // real optical path along the ray (pier posts, her legs and the bed all count)
    float pathR = max(zB - zS, 0.0) * wDist / max(zS, 1e-3);
    float aR = 1.0 - exp(-pathR * mix(0.42, 0.62, wNight)) * (1.0 - smoothstep(0.0, 1.0, wDist / 700.0));
    aR = max(clamp(aR + 0.04 * smoothstep(0.0, 0.6, pathR), 0.0, 1.0), wFoamA);
    vec3 bed = texture2D(wRefrTex, su2).rgb;
    float tm = max(max(wShallow.r, wShallow.g), max(wShallow.b, 1e-3));
    bed *= mix(vec3(1.0), wShallow / tm, 0.4 * smoothstep(0.0, 1.5, pathR));
    X = min(X, vec3(60.0));
    vec3 wOut = (1.0 - wF) * (aR * outgoingLight + (1.0 - aR) * bed) + X;
    float eK = smoothstep(0.0, 0.1, pathR);
    outgoingLight = mix(bed, wOut, eK);
    totalEmissiveRadiance += X;
    diffuseColor.a = 1.0;
  } else
#endif
  {
  // composition: out = (1-F)*(a0*body + (1-a0)*bed) + X, written as a normal alpha blend
  float wA = max(1.0 - (1.0 - wA0) * (1.0 - wF), 0.004);
  X = min(X, vec3(60.0 * wA));
  outgoingLight = outgoingLight * ((1.0 - wF) * wA0 / wA) + X / wA;
  totalEmissiveRadiance += X / wA;
  diffuseColor.a = wA * wEdge; // fade out at the waterline: no hard intersection line
  }
  if (wDebug > 0.5) {
    vec3 dv = wDebug < 1.5 ? wRefl : wDebug < 2.5 ? wSky : wDebug < 3.5 ? vec3(wF, wCover, wA0) : wDebug < 4.5 ? wNrm * 0.5 + 0.5 : vec3(wFoam, wLip, wDepth * 0.25);
    outgoingLight = dv; totalEmissiveRadiance = dv; diffuseColor.a = 1.0;
  }
}
`;
}
