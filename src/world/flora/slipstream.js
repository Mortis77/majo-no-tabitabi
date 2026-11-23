import * as THREE from 'three';
import { BELL } from '../../data/bellcrown.js';
import { hookMaterial } from '../../core/mats.js';
import { farmWeight } from '../terrain/paddyLayout.js';
import { MeadowWakeField } from './wake-field.js';

const smooth=THREE.MathUtils.smoothstep;

// Sample the same noise bands, pigments and foothold restrictions as the planted
// flower shader. A stamp surveys only the few square metres it crosses.
function meadowSurvey(G, bed) {
  const world=G.world, noise=G.terrain.noiseTexture.image;
  function noiseAt(x,z,scale,offset,channel) {
    const ix=THREE.MathUtils.euclideanModulo(Math.floor((x/scale+offset)*noise.width),noise.width);
    const iz=THREE.MathUtils.euclideanModulo(Math.floor((z/scale+offset)*noise.height),noise.height);
    return noise.data[(iz*noise.width+ix)*4+channel]/255;
  }
  const open=new THREE.Color(), regional=new THREE.Color(), shade=new THREE.Color();
  const rgb=(r,g,b)=>new THREE.Color(r,g,b);
  const corn=rgb(.055,.28,.85), white=rgb(.93,.96,.99), deep=rgb(.18,.21,.76), blue=rgb(.48,.68,.98);
  const yellow=rgb(.93,.72,.10), ivory=rgb(.95,.93,.84), red=rgb(.83,.16,.08);
  const violet=rgb(.42,.26,.78), pink=rgb(.86,.52,.70), sunset=rgb(.91,.22,.18), amber=rgb(.96,.54,.15);
  const cyan=rgb(.43,.74,.82), moon=rgb(.58,.48,.86);
  return (x,z)=>{
    if(world.isWater(x,z) || world.isReserved(x,z,0))return false;
    if(Math.abs(x-(BELL.boxX??BELL.x))<BELL.halfW && Math.abs(z-(BELL.boxZ??BELL.z))<BELL.halfD)return false;
    const h=world.heightAt(x,z), road=world.roadDist(x,z), river=world.riverDist(x,z);
    if(h<.55 || road<3.7 || river<10 || (G.terrain.scorchLayer?.at(x,z,'burn')??0)>.35) return false;
    const slope=world.slopeAt?.(x,z)??0;
    if(slope>.68 || farmWeight(x,z,h,slope,road,river)>.24) return false;
    if(h>86 && (world.mountainMask?.(x,z)??0)>.25) return false;
    const groundScars=G.flora?.grass?.uniforms.gCraters.value;
    if(groundScars?.some(c=>c.w>.4 && (x-c.x)**2+(z-c.y)**2<c.z*c.z))return false;
    const broad=noiseAt(x,z,128,.31,1), detail=noiseAt(x,z,20,.42,2);
    const sand=.9+1.8*noiseAt(x,z,57,.77,2);
    if(river>40 && h<sand+.62)return false;
    const band=Math.sin((x*.78+z*.62)*.175+2.5*Math.sin((-x*.61+z*.79)*.069)+2.6*broad);
    const ribbon=smooth(band+(broad-.5)*1.4+(detail-.5)*.8,-.55,.64);
    const wet=1-smooth(river,17,33), forest=smooth(broad,.47,.70);
    const islands=noiseAt(x,z,15,.74,0);
    bed.cover=smooth(.14+.70*ribbon+.31*islands+.18*wet-.10*forest,.10,.73);
    bed.height=h;
    const patch=smooth(noiseAt(x,z,52,.12,0),.38,.62);
    const patchy=.5+.5*Math.sin(x*.0061+1.7*Math.sin(z*.0047))*Math.sin(z*.0053-.8+1.3*Math.sin(x*.0029));
    const east=smooth(x,700,1300),mid=smooth(x,-450,100)*(1-east),west=1-smooth(x,-1300,-800);
    open.copy(corn).lerp(white,smooth(patch,.16,.67));
    shade.copy(deep).lerp(blue,patch);
    const damp=Math.max(.72*forest,wet);
    open.lerp(shade,damp);
    bed.color.copy(open);
    bed.color.lerp(regional.copy(yellow).lerp(ivory,smooth(patch,.30,.75)),east*smooth(patchy,.25,.65));
    bed.color.lerp(regional.copy(red).lerp(ivory,smooth(patch,.45,.85)),mid*smooth(patchy,.45,.80)*.85);
    bed.color.lerp(regional.copy(violet).lerp(pink,smooth(patch,.35,.70)),west*smooth(patchy,.30,.70));
    bed.color.lerp(open,damp);
    const veil=world.veilAt?.(x,z)??0, night=smooth(veil,.56,.86);
    const dusk=Math.max(0,smooth(veil,.05,.34)-night);
    bed.color.lerp(regional.copy(sunset).lerp(amber,patch),dusk*(1-.83*wet));
    bed.color.lerp(regional.copy(cyan).lerp(moon,patch),night);
    return true;
  };
}

export function createSlipstream(G) {
  const capacity=G.quality?.name==='low'?196:384;
  const geo=new THREE.BufferGeometry();
  // Smooth spoon-shaped lobes, a tapering base and a small crease along the rib.
  const rings=[[-.58,.012],[-.39,.115],[-.13,.235],[.09,.336],[.28,.39],[.42,.37],[.54,.24]];
  const positions=[],colors=[],indices=[];
  for(let row=0;row<rings.length;row++){
    const [z,width]=rings[row],t=(z+.58)/1.12;
    for(let col=0;col<5;col++){
      const u=col*.5-1,edge=u*u;
      const x=width*u+.045*t*t;
      const y=.15*edge*Math.sin(Math.PI*t*.82)+.11*t*t+.055*u*t-.027*Math.exp(-9*edge)*Math.sin(Math.PI*t);
      const tip=t**5*(.12*edge+.07*Math.exp(-12*edge));
      positions.push(x,y,z-tip);
      const pigment=.68+.27*t+.055*edge-.045*Math.exp(-12*edge);
      colors.push(pigment+.035*t,pigment,pigment+.025*edge);
      if(row && col){
        const k=row*5+col;
        indices.push(k-6,k-1,k,k-6,k,k-5);
      }
    }
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  material.name='flora:loose-petals';
  material.userData.surface='none';
  material.userData.look={trans:.76,rim:.10,wrap:.61,shadowTint:.35};
  const flutter={value:0};
  material.onBeforeCompile=shader=>{
    shader.uniforms.petalTime=flutter;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nuniform float petalTime;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        // The render pass owns viewMatrix. Chase, capture and reflection cameras
        // each thin the petals crossing their own near plane.
        float eyeDepth=-(viewMatrix*modelMatrix*instanceMatrix[3]).z;
        float tip=clamp((position.z+.58)/1.12,0.,1.);
        float pulse=petalTime*5.8+4.1*instanceColor.r+11.*instanceColor.g;
        transformed.y+=tip*tip*(.053*sin(pulse+tip)+.10*position.x*sin(pulse*1.37));
        transformed*=smoothstep(.80,1.65,eyeDepth);`);
  };
  material.customProgramCacheKey=()=>'loose-petals-lit';
  hookMaterial(material);
  const mesh=new THREE.InstancedMesh(geo,material,capacity);
  mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  mesh.name='flora:airborne-leaves';
  mesh.receiveShadow=true;
  mesh.frustumCulled=false;
  mesh.count=0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(mesh);
  const pool=Array.from({length:capacity},()=>({
    pos:new THREE.Vector3(),vel:new THREE.Vector3(),color:new THREE.Color(),age:0,life:0
  }));
  const field=new MeadowWakeField(), bed={height:0,cover:0,color:new THREE.Color()};
  const survey=meadowSurvey(G,bed);
  const pose=new THREE.Object3D(),air=new THREE.Vector3(),lastPos=new THREE.Vector3();
  const stats={petals:0,leaves:0,airborne:0};
  let cursor=0,petalCredit=0,leafCredit=0,lastTime=-Infinity,previous=null,stamp=null;
  let hasPosition=false;

  function loft(x,z,side,pressure,petal) {
    const q=pool[cursor];
    cursor=(cursor+1)%capacity;
    const drive=stamp.drive, turn=stamp.turn*side;
    const power=pressure*(1+.30*turn);
    q.age=0;
    q.life=(petal?1.8:1.2)+.9*drive+Math.random()*.65;
    q.petal=petal;
    q.phase=Math.random()*Math.PI*2;
    q.size=(petal?.15:.18)+Math.random()*(petal?.13:.12)+drive*.055;
    q.spin=(side||1)*(2.9+4.8*Math.random());
    q.side=side||1;
    q.nx=-stamp.dz*q.side; q.nz=stamp.dx*q.side;
    q.lift=power;
    q.pos.set(x+(Math.random()-.5)*.48,bed.height+(petal?.80:.40)+Math.random()*.26,z+(Math.random()-.5)*.48);
    q.floor=bed.height+.025;
    q.nextGroundCheck=.15+.12*Math.random();
    const carry=stamp.speed*(.25+.30*drive);
    const flick=1.2+power*3.8;
    q.vel.set(stamp.dx*carry+q.nx*flick,1.7+3.8*power+Math.random()*.85,stamp.dz*carry+q.nz*flick);
    if(petal) {
      q.color.copy(bed.color).multiplyScalar(.96+.16*Math.random());
      stats.petals++;
    } else {
      q.color.setHex(Math.random()<.5?0x8ea864:0xabbb77);
      stats.leaves++;
    }
  }
  function shed(x,z,side,pressure,loss) {
    // The release comes from the same before/after delta that removes rays
    // from the stems. A second pass can still bend the grass on a spent bed.
    petalCredit+=loss*bed.cover*2.8;
    leafCredit+=pressure*(1-bed.cover*.75)*.17;
    while(petalCredit>=1){loft(x,z,side,pressure,true);petalCredit--;}
    if(leafCredit>=1){loft(x,z,side,pressure,false);leafCredit--;}
  }
  function update(dt,wind) {
    const p=G.player;
    if(!p) return;
    const time=G.time.t,trail=p.broom?.airTrail;
    const jump=hasPosition && p.pos.distanceToSquared(lastPos)>18**2;
    if(jump || time<lastTime) {
      for(const q of pool) q.age=q.life;
      previous=null; lastTime=-Infinity; petalCredit=leafCredit=0;
    }
    if(p.state==='broom' && trail?.count) {
      const sections=trail.sections;
      for(let i=trail.count;i>0;i--) {
        const s=sections[(trail.next-i+sections.length)%sections.length];
        if(s.time<=lastTime || time-s.time>.30)continue;
        lastTime=s.time;
        const linked=previous && !previous.bare && s.time-previous.time<.4 &&
          Math.hypot(s.x-previous.x,s.z-previous.z)<9;
        stamp=s;
        const back=Math.min(1.4,s.half??1);
        field.sweep(linked?previous.x:s.x-s.dx*back,linked?previous.z:s.z-s.dz*back,s,survey,shed);
        previous={x:s.x,z:s.z,time:s.time,bare:s.bare};
      }
    } else previous=null;
    lastPos.copy(p.pos);
    hasPosition=true;
    field.refresh(p.pos.x,p.pos.z,time);
    flutter.value=time;
    let visible=0;
    for(const q of pool) {
      if(q.age>=q.life)continue;
      q.age+=dt;
      if(trail) trail.sample(q.pos,time,air); else air.set(0,0,0);
      // The first outward/upward fold follows the passing brush. The released
      // petals then roll back towards the cores and settle through the breeze.
      const envelope=Math.exp(-1.65*q.age)*q.lift;
      const angle=q.age*4.6;
      const fan=envelope*Math.cos(angle)*5.4;
      const lift=envelope*Math.sin(angle+.58)*6.2;
      const drag=1-Math.exp(-(q.petal?2.45:2.05)*dt);
      q.vel.x+=(wind.x*.37+air.x*.91+q.nx*fan-q.vel.x)*drag;
      q.vel.z+=(wind.z*.37+air.z*.91+q.nz*fan-q.vel.z)*drag;
      q.vel.y+=(air.y*.87+lift-(q.petal?.76:1.25)-q.vel.y)*drag;
      q.pos.addScaledVector(q.vel,dt);
      if(q.age>=q.nextGroundCheck){
        q.floor=G.world.heightAt(q.pos.x,q.pos.z)+.025;
        q.nextGroundCheck=q.age+.2;
      }
      if(q.pos.y<q.floor) {
        q.pos.y=q.floor;
        q.age=Math.max(q.age,q.life-.24);
        q.vel.multiplyScalar(.38);
      }
      pose.position.copy(q.pos);
      pose.rotation.set(q.phase+q.age*q.spin, q.phase+q.age*q.side*2.4, .55*Math.sin(q.age*5+q.phase));
      const size=q.size*(1-smooth(q.age,q.life-.35,q.life));
      pose.scale.set(size*(q.petal?1.05:.60),size,size);
      pose.updateMatrix();
      mesh.setMatrixAt(visible,pose.matrix);
      mesh.setColorAt(visible++,q.color);
    }
    mesh.count=stats.airborne=visible;
    mesh.visible=visible>0;
    if(visible) {mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
  }
  return {mesh,field,stats,update};
}
