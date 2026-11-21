// Raised grassland grows on the actual flat collision disc. The broad hummocks remain
// visible on approach; a separate population of finer leaves opens as the rider lands.
import * as THREE from 'three';
import { mulberry32 } from '../../core/util.js';
import { hookMaterial, toonGradient } from '../../core/mats.js';
import { MOONTEARS, CHESTS, KITE } from '../../data/placements.js';
import { flowerPatch } from '../flora/meadowFlowers.js';

const PALETTES = {
  sun: ['#568936', '#a8ca5c', '#fff3ce', '#fec85b', '#cd8423'],
  dusk: ['#927d38', '#d0b564', '#f48a64', '#ffcc85', '#f2ad39'],
  night: ['#306d70', '#67aea6', '#acdaee', '#b3a9ed', '#ffdb96'],
};
const QUALITY = {
  low: { spacing: 1.05, far: [86,124], near: [24,37] },
  med: { spacing: .84, far: [105,149], near: [35,53] },
  high: { spacing: .74, far: [123,171], near: [42,63] },
};
const anchors = [...MOONTEARS, ...CHESTS, KITE].filter(p => p.isle);
const TAU = Math.PI * 2;
const sharedPos = new THREE.Object3D();
const shade = new THREE.Color();

function growthAllowed(isle, index, x, z) {
  const r = isle.r;
  if (Math.hypot(x,z) > r-.58 || Math.hypot(x,z) < 2.45) return false;
  // All islands have a landing and a short approach to it. Shrines have a continuous
  // path under the gate to their doorstep. Keep the actual quest props visible too.
  if (z > 0 && Math.abs(x) < 1.55) return false;
  if (index % 5 === 1 && Math.hypot(x*.72,z+r*.35)<2.35) return false;
  if (index % 5 === 0 || index % 5 === 2) {
    if (Math.hypot(x-r*.25,z+r*.2) < 1.1) return false;
  }
  if (isle.streamAngle !== null) {
    const c=Math.cos(isle.streamAngle), s=Math.sin(isle.streamAngle);
    if (x*c+z*s>r*.72-.5 && Math.abs(z*c-x*s)<1.58) return false;
  }
  return !anchors.some(p => p.isle===isle.id && Math.hypot(x-p.dx,z-p.dz)<1.78);
}

function grassGeometry(far, colors) {
  const p=[],rgb=[],n=[],ind=[],rnd=mulberry32(far?7304:8411);
  const roots=far?11:15;
  for (let j=0;j<roots;j++) {
    const a=TAU*rnd(), radial=Math.sqrt(rnd())*.58, x=radial*Math.cos(a), z=radial*Math.sin(a);
    const theta=TAU*rnd(), c=Math.cos(theta), s=Math.sin(theta);
    const tall=j%4===0, h=(tall?.73:.46)*(.64+rnd()*.55), bend=.18+.46*rnd();
    const width=(far?.079:.052)*(.7+rnd()*.65), light=.28+rnd()*.59;
    const pt=(side,lean,y,tone)=>{
      p.push(x+c*lean-s*side, y*h,z+s*lean+c*side);
      shade.copy(colors[0]).lerp(colors[1],tone).toArray(rgb,rgb.length);
      n.push(c*.18,.97,s*.18);return p.length/3-1;
    };
    const i=pt(-width*.62,0,0,light*.12);pt(width*.62,0,0,light*.22);
    pt(-width,bend*.28,.65,.31+light*.36);pt(width*.68,bend*.25,.65,.23+light*.29);
    pt(0,bend,1,.48+light*.49);ind.push(i,i+1,i+2,i+1,i+3,i+2,i+2,i+3,i+4);
  }
  return geometry(p,rgb,n,ind);
}

function flowersGeometry(far,colors) {
  const source=flowerPatch(far), a=source.attributes, p=[],rgb=[],n=[];
  for(let i=0;i<a.position.count;i++) {
    const x=a.position.getX(i), y=a.position.getY(i), z=a.position.getZ(i);
    const u=a.aBlade.getX(i),v=a.aBlade.getY(i),yaw=a.aBlade.getZ(i),j=a.aBlade.getW(i);
    const c=Math.cos(yaw),s=Math.sin(yaw),role=a.aBlade2.getX(i);
    const headX=x-a.aBlade3.getX(i), headZ=z-a.aBlade3.getZ(i);
    const tilt=role>1.5 ? headX*.98+headZ*.4 : 0;
    p.push((u-.5)*1.4+c*x-s*z,y*(.64+j*.13)+tilt,(v-.5)*1.4+s*x+c*z);
    if(role<1.5) shade.copy(colors[0]).lerp(colors[1],role?.63:.20);
    else if(role<2.5) shade.copy(colors[j>.6?3:2]).multiplyScalar(.89+.14*a.aBlade2.getY(i));
    else shade.copy(colors[4]);
    shade.toArray(rgb,rgb.length);n.push(c*.12,.98,s*.12);
  }
  const g=geometry(p,rgb,n,source.index.array);source.dispose();return g;
}

function geometry(p,rgb,n,ind) {
  const g=new THREE.BufferGeometry();
  for(const [key,data] of [['position',p],['color',rgb],['normal',n]]) g.setAttribute(key,new THREE.Float32BufferAttribute(data,3));
  g.setIndex(ArrayBuffer.isView(ind)?new THREE.BufferAttribute(ind,1):ind);
  return g;
}

function material(range,time,wind) {
  const m=new THREE.MeshToonMaterial({vertexColors:true,side:THREE.DoubleSide,gradientMap:toonGradient()});
  m.name='isle-meadow';m.userData.surface='none';
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,{imTime:time,imWind:wind,imFade:{value:new THREE.Vector2(...range)}});
    sh.vertexShader=sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float imTime; uniform vec3 imWind; uniform vec2 imFade;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 imRoot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
      float keep=1.-smoothstep(imFade.x,imFade.y,distance(imRoot,cameraPosition));
      vec2 breeze=imWind.xz/max(length(imWind.xz),.01);
      float wave=sin(dot(imRoot.xz,vec2(.31,.22))-imTime*1.7)+.48*sin(imRoot.z*.57+imTime*2.1);
      vec2 local=vec2(dot(normalize(instanceMatrix[0].xz),breeze),dot(normalize(instanceMatrix[2].xz),breeze));
      transformed.xz+=local*wave*transformed.y*transformed.y*clamp(length(imWind.xz)*.028,.045,.21);
      transformed*=keep;`);
    sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);');
  };
  // The two stages share one program; range is refreshed by Three on material change.
  m.customProgramCacheKey=()=>'isleWindMeadow1';
  return hookMaterial(m);
}

function batchesFor(isle,index,q,prototypes,materials) {
  const rnd=mulberry32(Math.abs(isle.x*177+isle.z*239)), slots=[[],[],[],[]],r=isle.r;
  const offset=rnd()*TAU;
  for(let ix=-r;ix<=r;ix+=q.spacing)for(let iz=-r;iz<=r;iz+=q.spacing) {
    const x=ix+(rnd()-.5)*q.spacing*.78,z=iz+(rnd()-.5)*q.spacing*.78;
    if(!growthAllowed(isle,index,x,z))continue;
    const far=rnd()<.54, slot=far?0:2,turn=rnd()*TAU;
    const patch=Math.sin(x*.39+z*.24+offset)+.62*Math.sin(z*.65-x*.28+offset*.31);
    const h=.80+.23*patch+.33*rnd(),w=.92+.38*rnd();
    slots[slot].push([x,z,turn,w,h,.80+.24*rnd()]);
    if (patch>.32 && rnd()<.33) {
      // Flower colour occurs in drifts with corridors of clean grass between them.
      slots[slot+1].push([x,z,turn+1,.91+.21*rnd(),h*(.89+.26*rnd()),.93+.10*rnd()]);
    }
  }
  const result=[];
  for(let i=0;i<slots.length;i++){
    const items=slots[i];if(!items.length)continue;
    const far=i<2;
    const mesh=new THREE.InstancedMesh(prototypes[i],materials[far?0:1],items.length);
    mesh.name='isle-meadow-'+isle.id+'-'+['base-leaf','base-flower','fine-leaf','fine-flower'][i];
    mesh.position.set(isle.x,isle.top-.014,isle.z);
    items.forEach(([x,z,yaw,w,h,value],j)=>{
      sharedPos.position.set(x,0,z);sharedPos.rotation.set(0,yaw,0);sharedPos.scale.set(w,h,w);sharedPos.updateMatrix();
      mesh.setMatrixAt(j,sharedPos.matrix);mesh.setColorAt(j,shade.setScalar(value));
    });
    mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.6;
    mesh.receiveShadow=true;mesh.visible=false;result.push({mesh,range:far?q.far:q.near});
  }
  return result;
}

export function createIsleMeadow(G,parent,isles) {
  const root=new THREE.Group();root.name='floating-meadows';parent.add(root);
  const q=QUALITY[G.quality?.name]||QUALITY.high;
  const time={value:0},wind={value:new THREE.Vector3(2,0,1)}, cache={};
  const materials=[material(q.far,time,wind),material(q.near,time,wind)];
  const islands=isles.map((isle,index)=>{
    if(!cache[isle.major]){
      const c=PALETTES[isle.major].map(hex=>new THREE.Color(hex));
      cache[isle.major]=[grassGeometry(true,c),flowersGeometry(true,c),grassGeometry(false,c),flowersGeometry(false,c)];
    }
    const batches=batchesFor(isle,index,q,cache[isle.major],materials);
    root.add(...batches.map(b=>b.mesh));return {isle,batches};
  });
  return {root,update(t,observer){
    time.value=t;
    const shared=G.flora?.grass?.uniforms?.gWind;if(shared)wind.value.copy(shared.value);
    for(const {isle,batches} of islands) {
      const radial=Math.max(0,Math.hypot(observer.x-isle.x,observer.z-isle.z)-isle.r);
      const dy=observer.y-isle.top, dist=Math.hypot(radial,dy);
      for(const {mesh,range} of batches) mesh.visible=dy>-3 && dist<range[1]+2;
    }
  }};
}
