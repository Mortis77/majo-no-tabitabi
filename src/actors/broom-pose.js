// Solve against the same physical branch used by flight and by the dress.
// The read-only bind offsets and clip interpolants let the browser and glTF
// exporter bake identical rotations, including mount/release cross-fades.
import {Vector3, Quaternion, Matrix4} from 'three';
import {broomSeat,shaftAt} from './broom-contact.js';
const V=(x=0,y=0,z=0)=>new Vector3(x,y,z);
const Q=()=>new Quaternion();
const SAT=x=>Math.min(1,Math.max(0,x));
const smooth=x=>{x=SAT(x);return x*x*(3-2*x);};
export const broomMotion=name=>/^Broom_(Ride_Loop|Boost_Loop|Mount|Dismount)$/.test(name);
function frameAt(model,tracks) {
  const nodes=new Map();
  function add(b) {
    if(nodes.has(b.name))return nodes.get(b.name);
    const parent=b.name==='J_Bip_C_Hips'?null:add(b.parent);
    const frame={parent,rest:b,position:V(),rotation:Q(),local:Q(),
      motion:tracks.get(b.name+'.quaternion')?.createInterpolant(),
      translation:tracks.get(b.name+'.position')?.createInterpolant()};
    nodes.set(b.name,frame);return frame;
  }
  for(const side of ['L','R'])for(const part of ['Thumb3_end','Foot']) {
    const b=model.getObjectByName('J_Bip_'+side+'_'+part);
    if(!b)return null;add(b);
  }
  add(model.getObjectByName('J_Bip_C_Head'));
  return {nodes,update(t,overrides) {
    for(const f of nodes.values()) {
      if(overrides?.has(f.rest.name))f.local.copy(overrides.get(f.rest.name));
      else if(f.motion)f.local.fromArray(f.motion.evaluate(t)); else f.local.copy(f.rest.quaternion);
      if(f.translation)f.position.fromArray(f.translation.evaluate(t)); else f.position.copy(f.rest.position);
      f.rotation.copy(f.local);
      if(f.parent){
        f.position.applyQuaternion(f.parent.rotation).add(f.parent.position);
        f.rotation.premultiply(f.parent.rotation);
      }
    }
  }};
}
const correction=(actual,desired,rotation)=>Q().setFromUnitVectors(actual.normalize(),desired.normalize()).multiply(rotation);
const relative=(parent,world)=>parent.clone().invert().multiply(world).normalize();
function fitSide(frames,side,boost) {
  const sign=side==='L'?1:-1, prefix='J_Bip_'+side+'_';
  const get=name=>frames.get(prefix+name), shoulder=get('Shoulder'),upper=get('UpperArm'),lower=get('LowerArm'),hand=get('Hand');
  const a=lower.position.clone().sub(upper.position), b=hand.position.clone().sub(lower.position);
  const upperLen=a.length(), lowerLen=b.length();
  const grip=shaftAt(sign>0?(boost?-.242:-.254):(boost?.265:.266));
  // Wrist sits above the handle; the metacarpals descend on its near side and
  // the four fingers curl behind the wood. The thumb comes from the other side.
  const target=V(broomSeat[0]+grip.x-.004,broomSeat[1]+grip.y+.075,broomSeat[2]+grip.z);
  // Bring a high clavicle down to a reachable position when the rider leans
  // into a turn. Both upper-arm bones retain their authored lengths.
  const maxLength=upperLen+lowerLen-.003, delta=target.clone().sub(upper.position);
  const reach=Math.max(0,delta.length()-maxLength), clav=upper.position.clone().sub(shoulder.position);
  const clavWorld=correction(clav.clone(),clav.clone().addScaledVector(delta.normalize(),reach*1.3),shoulder.rotation);
  const origin=upper.rest.position.clone().applyQuaternion(clavWorld).add(shoulder.position);
  const startArm=clavWorld.clone().multiply(upper.local);
  const aim=target.sub(origin), dist=Math.min(maxLength,aim.length());
  aim.normalize();
  const along=(upperLen*upperLen-lowerLen*lowerLen+dist*dist)/(2*dist);
  const pole=V(-.24,-.13,-sign*.75);pole.addScaledVector(aim,-pole.dot(aim)).normalize();
  const elbow=origin.clone().addScaledVector(aim,along).addScaledVector(pole,Math.sqrt(Math.max(0,upperLen*upperLen-along*along)));
  const wrist=origin.clone().addScaledVector(aim,dist);
  const upperWorld=correction(lower.rest.position.clone().applyQuaternion(startArm),elbow.clone().sub(origin),startArm);
  const propagated=upperWorld.clone().multiply(lower.local);
  const foreWorld=correction(hand.rest.position.clone().applyQuaternion(propagated),wrist.sub(elbow),propagated);
  const across=V(.32,-.948,0).normalize().multiplyScalar(sign), back=V(.948,.32,0).normalize();
  const palm=Q().setFromRotationMatrix(new Matrix4().makeBasis(across,back,V().crossVectors(across,back)));
  const solved=new Map([['Shoulder',relative(shoulder.parent.rotation,clavWorld)],['UpperArm',relative(clavWorld,upperWorld)],['LowerArm',relative(upperWorld,foreWorld)],['Hand',relative(foreWorld,palm)]]);
  // Ankles trail the knees along the flight axis even as the pelvis oscillates.
  const shin=get('LowerLeg'),ankle=get('Foot'),old=ankle.position.clone().sub(shin.position);
  const lowerWorld=correction(old.clone(),old.clone().add(V(0,0,boost?-.095:-.067)),shin.rotation);
  solved.set('LowerLeg',relative(shin.parent.rotation,lowerWorld));
  solved.set('Foot',relative(lowerWorld,ankle.rotation));
  for(const [f,d] of Object.entries({Index:[15,48,52],Middle:[16,56,51],Ring:[20,58,54],Little:[24,52,49]}))
    for(let i=0;i<3;i++)solved.set(f+(i+1),Q().setFromAxisAngle(V(0,0,1),-sign*d[i]*Math.PI/180));
  let thumbParent=palm;
  const thumbDirs=[V(-.013,-.039,sign*.013),V(.002,-.025,-sign*.008),V(-.001,-.016,-sign*.010)];
  for(let i=0;i<3;i++){
    const next=get(i===2?'Thumb3_end':'Thumb'+(i+2)).rest.position.clone();
    const world=correction(next.applyQuaternion(thumbParent),thumbDirs[i],thumbParent);
    solved.set('Thumb'+(i+1),relative(thumbParent,world));thumbParent=world;
  }
  return {prefix,solved};
}
export function fitBroomPose(clip,model) {
  if(!broomMotion(clip.name))return null;
  const tracks=new Map(clip.tracks.map(tr=>[tr.name,tr])),skel=frameAt(model,tracks);
  if(!skel)return null;
  const count=Math.max(1,Math.ceil(clip.duration*30));
  const times=Float32Array.from({length:count+1},(_,i)=>i*clip.duration/count);
  const curves=new Map(), interps=new Map();
  for(let i=0;i<=count;i++) {
    const t=times[i];skel.update(t);
    const upright=Q().setFromAxisAngle(V(0,1,0),clip.name==='Broom_Boost_Loop'?.59:.68);
    const chest=skel.nodes.get('J_Bip_C_UpperChest'),neck=skel.nodes.get('J_Bip_C_Neck');
    const newChest=upright.clone().multiply(chest.rotation);
    const torso=new Map([['J_Bip_C_UpperChest',relative(chest.parent.rotation,newChest)],
      ['J_Bip_C_Neck',relative(newChest,neck.rotation)]]);
    skel.update(t,torso);
    const w=clip.name==='Broom_Mount'?smooth((t/clip.duration-.42)/.44):
      clip.name==='Broom_Dismount'?1-smooth(t/clip.duration/.39):1;
    const sides=['L','R'].map(side=>fitSide(skel.nodes,side,clip.name==='Broom_Boost_Loop'));
    sides.push({prefix:'',solved:torso});
    for(const {prefix,solved} of sides){
      for(const [joint,goal] of solved){
        const name=prefix+joint+'.quaternion',source=tracks.get(name);
        if(!source)continue;
        if(!curves.has(name)){
          curves.set(name,{times,values:new Float32Array(times.length*4)});
          interps.set(name,source.createInterpolant());
        }
        const final=Q().fromArray(interps.get(name).evaluate(t)).slerp(goal,w).normalize();
        const data=curves.get(name).values;
        if(i && final.dot(Q().fromArray(data,4*(i-1)))<0)final.set(-final.x,-final.y,-final.z,-final.w);
        final.toArray(data,i*4);
      }
    }
  }
  return curves;
}
