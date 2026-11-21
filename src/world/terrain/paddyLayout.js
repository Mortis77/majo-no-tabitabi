// The ground painter, field vegetation and instanced plants use one rotated cadastral grid.
import { POI } from '../../data/world.js';
import { smoothstep } from '../../core/util.js';

export const PLOT_WIDTH=26, PLOT_DEPTH=17, ROW_SPACE=.57, HILL_SPACE=.46;
const cosine=.94, sine=.34, det=cosine*cosine+sine*sine;
const mod=(x,m)=>x-m*Math.floor(x/m);
export function plotSeed(ix,iz) {
  const a=mod(ix+15,251), b=mod(iz+29,251);
  return mod(a*43+b*83+a*b*7,251)/251;
}
export function plotPoint(u,v) {
  return [(cosine*u-sine*v)/det,(sine*u+cosine*v)/det];
}
export function plotAt(x,z) {
  const u=cosine*x+sine*z,v=-sine*x+cosine*z;
  const ix=Math.floor(u/PLOT_WIDTH),iz=Math.floor(v/PLOT_DEPTH),seed=plotSeed(ix,iz);
  const lu=u-ix*PLOT_WIDTH,lv=v-iz*PLOT_DEPTH;
  return {ix,iz,u:lu,v:lv,edge:Math.min(lu,PLOT_WIDTH-lu,lv,PLOT_DEPTH-lv),
    kind:seed<.32?'young':seed<.55?'soil':seed<.80?'ripe':'vegetable'};
}
export function farmWeight(x,z,height,slopeRadians,roadDistance,riverDistance) {
  if (height<=1.4 || height>=22 || roadDistance<=3.5 || riverDistance<=16) return 0;
  const v=POI.hometown,s=POI.forest,dist=Math.hypot(x-v.x,z-v.z);
  if (dist<=v.r+6 || dist>=200) return 0;
  const edge=11*Math.sin(x*.031+z*.018)+12*Math.sin(z*.025-x*.011);
  const shoulder=5*Math.sin(z*.049+x*.026);
  return smoothstep(v.r+6,v.r+16,dist)*(1-smoothstep(120,170,dist+edge))*
    (1-smoothstep(.06,.13,1-Math.cos(slopeRadians)))*smoothstep(1.4,2.2,height)*(1-smoothstep(16,22,height))*
    smoothstep(3.5,6,roadDistance)*smoothstep(16,22,riverDistance)*smoothstep(95,125,Math.hypot(x-s.x,z-s.z)+shoulder);
}
export const plotGLSL=/* glsl */`
vec2 paddyGrid(vec2 p) { return mat2(.94,-.34,.34,.94)*p; }
float paddySeed(vec2 cell) {
  vec2 ab=mod(cell+vec2(15.,29.),251.);
  return mod(ab.x*43.+ab.y*83.+ab.x*ab.y*7.,251.)/251.;
}
float paddyFarm(vec2 p,float h,float slope,float road,float river,vec4 village,vec2 shrine) {
  float d=distance(p,village.xy);
  if(d<=village.z || d>=200. || h<=1.4 || h>=22. || road<=3.5 || river<=16.) return 0.;
  float edge=11.*sin(p.x*.031+p.y*.018)+12.*sin(p.y*.025-p.x*.011);
  float shoulder=5.*sin(p.y*.049+p.x*.026);
  return smoothstep(village.z,village.z+10.,d)*(1.-smoothstep(village.w-50.,village.w,d+edge))*
    (1.-smoothstep(.06,.13,slope))*smoothstep(1.4,2.2,h)*(1.-smoothstep(16.,22.,h))*
    smoothstep(3.5,6.,road)*smoothstep(16.,22.,river)*smoothstep(95.,125.,distance(p,shrine)+shoulder);
}
float paddyRows(float u,float r) {
  return .5+.5*cos(6.2831853*(u-1.06-r*.12)/${ROW_SPACE.toFixed(2)});
}
`;
