// Sky directions shared by the sun disk, moving shadows, cloud lighting and water.
// The old biome mask is kept for compatible terrain and palette samplers.
import * as THREE from 'three';
import { VEIL } from '../data/world.js';
import { clamp, smoothstep } from '../core/util.js';
export { VEIL };
export const SUN_ANGULAR_RADIUS=.025;
export const MOON_ANGULAR_RADIUS=.0258;
export const SUN_DIR=new THREE.Vector3(.72,.59,.36).normalize();
export const DAY_ARC=.5;
const moon=new THREE.Vector3(0,-1,0);
const desired=new THREE.Vector3(),tangent=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
let separation=Math.PI, solarTransmission=1;
export function setSolarTransmission(value){solarTransmission=clamp(value,0,1);}

// The normal day crosses the southern sky from east to west. The farewell is a
// narrative time skip. The following lake scene is staged in late afternoon.
export function advanceSky(seconds, lakeScene, age, dt, clockOffset=0) {
  const angle=lakeScene ? 2.69+.015*Math.sin(seconds/60) : .85+(seconds+clockOffset)*Math.PI*2/1440;
  // The everyday arc peaks near 50 degrees (was 62): long raking shadows and warm side light most of the day, the
  // anime's late-afternoon mood. The staged lake scene keeps its original sun.
  desired.set(Math.cos(angle),(lakeScene ? .80 : DAY_ARC)*Math.sin(angle),.42).normalize();
  SUN_DIR.lerp(desired,1-Math.exp(-Math.max(dt,0)*.54)).normalize();
  if(age===null){
    separation=Math.PI;
    moon.set(0,-1,0);
    return;
  }
  const signed= age<15 ? .077*(1-smoothstep(0,15,age)) :
    age<19 ? 0 : -.077*smoothstep(19,36,age);
  tangent.crossVectors(up,SUN_DIR).normalize();
  moon.copy(SUN_DIR).addScaledVector(tangent,signed).normalize();
  separation=Math.acos(clamp(moon.dot(SUN_DIR),-1,1));
}
export function veilAt(x,z){return 1-smoothstep(VEIL.inner,VEIL.outer,Math.hypot(x-VEIL.x,z-VEIL.z));}
export function veilDist(x,z){return Math.hypot(x-VEIL.x,z-VEIL.z);}
export function moonSeparationAt(){return separation;}
export function moonDirAt(x,z,out=new THREE.Vector3()){return out.copy(moon);}
export function daylightAt(x,z){const v=veilAt(x,z);return clamp((1-v*v*(3-2*v)*.98)*solarTransmission,.02,1);}
