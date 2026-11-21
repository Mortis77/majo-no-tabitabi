// Sample the gameplay skirt solver onto the ten existing panels for ordinary glTF animation players.
import * as THREE from 'three';
import {broomSeat} from '../../src/actors/broom-contact.js';
import {createTravellerCloth} from '../../src/actors/travellerCloth.js';
export function bakeSkirt(doc, anim) {
  const root=new THREE.Group(), scene=doc.getRoot().listScenes()[0], map=new Map(), byName=new Map();
  function attach(node, parent) {
    const obj=new THREE.Object3D();obj.name=node.getName();obj.userData={...node.getExtras()};
    obj.position.fromArray(node.getTranslation());obj.quaternion.fromArray(node.getRotation());obj.scale.fromArray(node.getScale());
    parent.add(obj);map.set(node,obj);byName.set(obj.name,node);
    for(const child of node.listChildren())attach(child,obj);
  }
  for (const top of scene.listChildren()) attach(top,root);
  root.updateWorldMatrix(true,true);
  const lookup=s=>root.getObjectByName('J_Bip_'+s);
  const solver=createTravellerCloth(root,{hips:lookup('C_Hips'),thighL:lookup('L_UpperLeg'),thighR:lookup('R_UpperLeg'),kneeL:lookup('L_LowerLeg'),kneeR:lookup('R_LowerLeg')});
  if(!solver) throw Error('The outfit has no skirt correction metadata');
  const riding=anim.getName()==='Broom_Ride_Loop';
  const joints=riding?['01','02']:['01'];
  const panels=Array.from({length:10},(_,i)=>joints.map(end=>root.getObjectByName('J_Sec_Hakama_'+(i+1)+'_'+end))).flat();
  const seat=new THREE.Object3D();
  seat.position.fromArray(broomSeat);seat.updateMatrixWorld(true);
  const original=anim.listChannels(), tracks=[];
  for (const chan of original) {
    const obj=map.get(chan.getTargetNode()), path=chan.getTargetPath(), samp=chan.getSampler();
    if(!obj || path==='weights')continue;
    const attr={rotation:'quaternion',translation:'position',scale:'scale'}[path];
    const type=attr==='quaternion'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
    tracks.push(new type(obj.uuid+'.'+attr,samp.getInput().getArray(),samp.getOutput().getArray()));
  }
  const clip=new THREE.AnimationClip('pose',-1,tracks), mix=new THREE.AnimationMixer(root);
  const action=mix.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const frames=Math.max(2,Math.ceil(clip.duration*48)+1);
  const dt=clip.duration/(frames-1),times=Float32Array.from({length:frames},(_,i)=>i*dt);
  const data=panels.map(()=>({translation:[],rotation:[]}));
  function evaluate(t) {solver.reset();action.enabled=true;action.paused=false;mix.setTime(t);root.updateWorldMatrix(true,true);solver.update(dt,riding?seat:null);}
  if(anim.getName().endsWith('Loop'))for (const t of times) evaluate(t);
  for (const t of times) {
    evaluate(t);
    panels.forEach((p,i)=>{data[i].translation.push(...p.position.toArray());data[i].rotation.push(...p.quaternion.toArray());});
  }
  const buf=doc.getRoot().listBuffers()[0];
  const add=(type,array)=>doc.createAccessor().setBuffer(buf).setType(type).setArray(array);
  const input=add('SCALAR',times);
  for(const ch of original)if(panels.includes(map.get(ch.getTargetNode())) && ['translation','rotation'].includes(ch.getTargetPath())) ch.dispose();
  for(const samp of anim.listSamplers())if(!anim.listChannels().some(ch=>ch.getSampler()===samp))samp.dispose();
  for(const [i,panel] of panels.entries())for(const path of ['translation','rotation']){
    const samp=doc.createAnimationSampler().setInput(input).setOutput(add(path==='rotation'?'VEC4':'VEC3',Float32Array.from(data[i][path]))).setInterpolation('LINEAR');
    anim.addSampler(samp);anim.addChannel(doc.createAnimationChannel().setTargetNode(byName.get(panel.name)).setTargetPath(path).setSampler(samp));
  }
}
