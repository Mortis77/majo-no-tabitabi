// The volume, the sun-transmission atlas and the ground use one advected moisture field.
// Distances and offsets are in world metres. These integrals can be reconstructed directly
// from saved game time, including after a pause, load or long journey.
import * as THREE from 'three';
import { CITY } from '../data/journey-map.js';

export const cloudFieldUniforms = {
  mvCloudFlow: { value: new THREE.Vector4() }, // lower deck xz, upper deck xz
  mvCloudShape: { value: new THREE.Vector4(.52,.4,1,0) }, // threshold, sheet fraction, extinction, billow phase
  mvCloudPocket: { value: new THREE.Vector4(CITY.x,CITY.z,0,1) }, // dry updraft centre xz, moisture loss, width scale
};

function oscillation(seconds,period,offset) {
  return Math.sin(seconds/period+offset) - Math.sin(offset);
}

export function updateCloudField(seconds, weatherCover, rainfall, override=null) {
  const t=seconds;
  // The lower edge has nearly the same prevailing wind as the old cloud bank.
  // Two independent, smoothly veering altitudes stretch and reconnect its gaps.
  const windA=oscillation(t,86,.28), windB=oscillation(t,147,1.12);
  const lowerX=2.10*t+57*windA+33*windB;
  const lowerZ=.90*t+69*oscillation(t,104,.95);
  const upperX=2.58*t+79*oscillation(t,111,1.23);
  const upperZ=.53*t+63*oscillation(t,73,.42);
  cloudFieldUniforms.mvCloudFlow.value.set(lowerX,lowerZ,upperX,upperZ);
  const clamp=THREE.MathUtils.clamp;
  const moisture=override===null?clamp(Math.max(weatherCover,rainfall*.90),0,1):clamp(override,0,1);
  const growing=.5+.5*Math.sin(t/76+.30*Math.sin(t/191)-.40);
  const transition=Math.sin(Math.PI*moisture);
  const cover=clamp(moisture+.074*(growing-.30)*transition,0,1);
  // A dry afternoon leaves isolated towers; humid air joins them into a deeper sheet.
  const sheet=clamp(.12+.57*cover+.25*rainfall+.10*growing,0,1);
  const extinction=.72+.38*cover+.24*rainfall+.10*growing;
  cloudFieldUniforms.mvCloudShape.value.set(.75-.55*cover,sheet,extinction,t*.00086);
  // The sheltered plateau warms the air over the roofs. Winds displace this dry
  // pocket into the surrounding trees, while a wet front can entirely close it.
  const dry=1-THREE.MathUtils.smoothstep(Math.max(cover,rainfall),.46,.80);
  cloudFieldUniforms.mvCloudPocket.value.set(
    CITY.x+23*Math.sin(t/83+.42)+11*Math.sin(t/151),
    CITY.z+17*Math.sin(t/101-.62)+9*Math.sin(t/49),
    (.22+.05*growing)*dry,
    1.04-.12*growing
  );
  return cloudFieldUniforms.mvCloudShape.value;
}

export const CLOUD_FIELD_GLSL = /* glsl */`
uniform vec4 mvCloudFlow;
uniform vec4 mvCloudShape;
uniform vec4 mvCloudPocket;
float mvCloudNoise4(sampler2D noiseTex, vec2 uv, float lod) {
  return dot(textureLod(noiseTex,uv,lod),vec4(.5,.25,.125,.0625))*1.0666667;
}
float mvCloudMacroFiltered(sampler2D noiseTex, vec2 worldXZ, float footprint) {
  vec2 lower=(worldXZ+mvCloudFlow.xy)/1800.;
  vec2 upper=(worldXZ+mvCloudFlow.zw)*(3.7/1800.)+.13;
  float large=mvCloudNoise4(noiseTex,lower,max(0.,log2(footprint*(256./1800.))));
  float small=mvCloudNoise4(noiseTex,upper,max(0.,log2(footprint*(256.*3.7/1800.))));
  float moisture=.72*large+.38*small;
  vec2 plateau=(worldXZ-mvCloudPocket.xy)*vec2(1./146.,1./111.)*mvCloudPocket.w;
  if(mvCloudPocket.z>.001 && all(lessThan(abs(plateau),vec2(1.60)))) {
    float edge=length(plateau)+(small-.50)*.85+(large-.50)*.55;
    moisture-=mvCloudPocket.z*(1.-smoothstep(.20,1.26,edge));
  }
  return moisture;
}
`;
