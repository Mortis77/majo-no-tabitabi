// Tileable 3-D billows from the distance to jittered cell centres. Trilinear
// sampling keeps their contours continuous as wind carries the field past the viewer.
import * as THREE from 'three';
import { CLOUD_FIELD_GLSL } from './cloud-field.js';
import { CLOUD_THICKNESS, CLOUD_SLICES_GLSL } from './cloud-layer.js';

export function cloudNoise() {
  const n = 48,
    cells = 6,
    data = new Uint8Array(n ** 3);
  const wrap = (x, k) => ((x % k) + k) % k;
  function hash(x, y, z, seed) {
    let h =
      Math.imul(x + 17, 374761393) ^ Math.imul(y + 29, 668265263) ^ Math.imul(z + 47, 1597334677) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const features = Array.from({ length: cells ** 3 }, (_, i) => {
    const x = i % cells,
      y = Math.floor(i / cells) % cells,
      z = Math.floor(i / (cells * cells));
    return [11, 89, 32771].map((seed) => 0.12 + 0.76 * hash(x, y, z, seed));
  });
  const at = (x, y, z) => features[wrap(x, cells) + cells * (wrap(y, cells) + cells * wrap(z, cells))];
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const px = (x * cells) / n,
          py = (y * cells) / n,
          pz = (z * cells) / n;
        const ix = Math.floor(px),
          iy = Math.floor(py),
          iz = Math.floor(pz);
        let nearest = 2;
        for (let k = -1; k <= 1; k++)
          for (let j = -1; j <= 1; j++)
            for (let i = -1; i <= 1; i++) {
              const f = at(ix + i, iy + j, iz + k);
              const dx = px - ix - i - f[0],
                dy = py - iy - j - f[1],
                dz = pz - iz - k - f[2];
              nearest = Math.min(nearest, dx * dx + dy * dy + dz * dz);
            }
        const idx = x + n * (y + n * z);
        data[idx] = Math.round(255 * Math.max(0, 1 - Math.sqrt(nearest) * 0.92));
      }
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.format = THREE.RedFormat;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

// A direct light ray and a view ray must see the very same evolving billows.
export const CLOUD_DENSITY_GLSL = /* glsl */ `
${CLOUD_FIELD_GLSL}
uniform highp sampler3D uVolume;
const float cloudDepth = ${CLOUD_THICKNESS.toFixed(1)};
float cloudDensityFiltered(vec3 p, float footprint) {
  float h=(p.y-uCloudH)/cloudDepth;
  if(h<=0. || h>=1.) return 0.;
  float weather=mvCloudMacroFiltered(uNoise,p.xz,footprint);
  vec2 adv=p.xz+mix(mvCloudFlow.xy,mvCloudFlow.zw,h*(.50+.50*h));
  vec3 v=vec3(adv.x,125.+h*108.,adv.y)/330.;
  float billow=textureLod(uVolume,v+vec3(0.,mvCloudShape.w*.30,0.),max(0.,log2(footprint*(48./330.)))).r;
  float detail=textureLod(uVolume,v*3.13+vec3(.17,mvCloudShape.w,.45),max(0.,log2(footprint*(3.13*48./330.)))).r;
  float shape=mix(.31,.22,mvCloudShape.y);
  // fair-weather cumulus: the 330 m billow carries more of the shape than the continental moisture, so a dry or
  // middling sky breaks into separate heaps with blue gaps (and patchy shadows / sunbeams below); humid sheets stay joined
  float ruffle=mix(.55,.26,mvCloudShape.y);
  float body=weather-mvCloudShape.x+ruffle*(billow-.45)+.105*(detail-.5);
  float heightLoss=shape*h*h;
  float density=smoothstep(-.022,.115,body-heightLoss);
  return density*smoothstep(0.,.15,h)*(1.-smoothstep(.80,1.,h))*mvCloudShape.z;
}
float densityAt(vec3 p) { return cloudDensityFiltered(p,1.); }
`;

export const CLOUD_GLSL = /* glsl */ `
${CLOUD_SLICES_GLSL}
${CLOUD_DENSITY_GLSL}
vec4 traceCloud(vec3 dir, float veil, vec3 horizon, out vec4 profile) {
  profile=vec4(0.);
  float dy=abs(dir.y)<.0001 ? (dir.y<0.?-.0001:.0001) : dir.y;
  float first=(uCloudH-uCam.y)/dy, last=(uCloudH+cloudDepth-uCam.y)/dy;
  float lo=max(0.,min(first,last)), hi=min(3200.,max(first,last));
  if(hi<=lo) return vec4(0.);
  vec3 light=mvPalette(MV_ROW_CLOUDLIT,veil), shade=mvPalette(MV_ROW_CLOUDSH,veil);
  vec3 sun=normalize(vec3(mvSunDir.x,max(.18,mvSunDir.y),mvSunDir.z));
  float glare=pow(max(dot(dir,sun),0.),9.)*uSunVis;
  float tr=1.; vec3 acc=vec3(0.);
  // Quadratic spacing reserves samples for silhouettes near a rider inside the slab.
  float span=hi-lo, nearFill=1.-smoothstep(0.,12.,lo);
  vec4 cuts=cloudSlices(span,lo);
  float stretch=log2(1.+span/16.);
  float grazing=smoothstep(220.,540.,span);
  int samples=int(float(CLOUD_STEPS)*(1.+1.4*grazing)+.5);
  float lastLit=-1.e5, shadow=1.;
  // Wide grazing rays can otherwise expose the finite set of sampling heights
  // as horizontal stripes on the hills. Filter to each ray segment's footprint
  // and stratify neighbouring pixels without changing the integrated step size.
  float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
  for(int i=0;i<3*CLOUD_STEPS;i++){
    if(i>=samples) break;
    float f=float(i)/float(samples), g=float(i+1)/float(samples);
    float a=mix(f,f*f,.52), b=mix(g,g*g,.52);
    if(nearFill>.001){
      vec2 fine=(exp2(vec2(f,g)*stretch)-1.)*(16./max(span,.001));
      a=mix(a,fine.x,nearFill); b=mix(b,fine.y,nearFill);
    }
    float stepLength=(b-a)*span;
    float farFilter=smoothstep(8.,40.,stepLength);
    float phase=fract(jitter+.5+float(i)*.61803399)-.5;
    float t=mix(lo,hi,mix(a,b,.5+phase*.86*farFilter));
    float footprint=max(1.,stepLength*farFilter*.70);
    vec3 p=uCam+dir*t;
    float den=cloudDensityFiltered(p,footprint);
    if(den<.008) continue;
    float h=clamp((p.y-uCloudH)/cloudDepth,0.,1.);
    // At grazing angles, spend the budget on smaller view segments. The broader
    // sun shadow can be reused over nearby segments of the same cloud mass.
    if(t-lastLit>grazing*max(38.,stepLength*2.15)) {
      float lit=cloudDensityFiltered(p+sun*mix(17.,28.,grazing),footprint);
      float opticalSun=(1.45+.95*grazing)*lit;
      if(grazing<.999) opticalSun+=.95*(1.-grazing)*cloudDensityFiltered(p+sun*48.,footprint);
      shadow=exp(-opticalSun);
      lastLit=t;
    }
    // anime cumulus: bright crowns over grey-blue bellies even when the sun is behind the viewer
    float facing=clamp(.05+.58*h+.46*shadow,0.,1.);
    vec3 pigment=mix(shade,light,smoothstep(.12,.93,facing));
    // Sunlit tops sit above the dark body of a rain cloud.
    float grey=uWeather.x*(1.-.72*smoothstep(.38,.92,h)*shadow);
    pigment*=mix(vec3(1.+.07*uWeather.y,1.,1.-.07*uWeather.y),vec3(.49,.56,.66),grey);
    pigment+=light*.27*glare*shadow*(1.-den*.65)*(1.-uCover);
    pigment*=mix(vec3(1.),vec3(.24,.31,.42),max(uSkyNight,uCover*.92));
    pigment=mix(pigment,horizon,.48*smoothstep(800.,3200.,t));
    float optical=den*stepLength*.079;
    // Cumulative optical depth at four world-distance slices. The opaque
    // composite can stop at buildings, flying islands or the rider's silhouette.
    profile+=optical*clamp((cuts-a)/max(b-a,.00001),0.,1.);
    float opacity=1.-exp(-optical);
    acc+=tr*opacity*pigment; tr*=1.-opacity;
    if(tr<.015) break;
  }
  return vec4(acc,1.-tr);
}`;
