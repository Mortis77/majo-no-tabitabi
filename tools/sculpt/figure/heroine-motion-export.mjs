// Bake the browser's heroine-specific rotations into glTF-Transform animations.
// Map keys are channels: one original accessor can drive several different joints.
import { AnimationClip, Bone, Group, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';
import { heroineRotationTrack, fitLandingKnee } from '../../../src/actors/heroine-motion.js';
import { broomMotion, fitBroomPose } from '../../../src/actors/broom-pose.js';
export function bakeHeroineMotion(animation,figure) {
  const name=animation.getName(), tracks=[],result=new Map(),channels=new Map();
  const fit=broomMotion(name)?fitBroomPose:name==='Land_Hard'?fitLandingKnee:null;
  for(const ch of animation.listChannels()){
    const sampler=ch.getSampler(),bone=ch.getTargetNode().getName(),path=ch.getTargetPath();
    if(sampler.getInterpolation()!=='LINEAR')continue;
    const times=sampler.getInput().getArray(),source=sampler.getOutput().getArray();
    if(path==='rotation'){
      const values=heroineRotationTrack(name,bone,source);
      if(values)result.set(ch,{times,values});
      if(fit){
        const target=bone+'.quaternion';channels.set(target,ch);
        tracks.push(new QuaternionKeyframeTrack(target,times,values||source));
      }
    }else if(fit&&path==='translation')tracks.push(new VectorKeyframeTrack(bone+'.position',times,source));
  }
  if(!fit)return result;
  const model=new Group(),nodes=new Map();
  for(const n of figure.getRoot().listNodes()){
    if(!n.getName().startsWith('J_Bip_'))continue;
    const b=new Bone();b.name=n.getName();b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation());nodes.set(n,b);
  }
  for(const [n,b] of nodes)(nodes.get(n.getParentNode())||model).add(b);
  const curves=fit(new AnimationClip(name,-1,tracks),model);
  if(!curves)throw new Error('Incomplete heroine rig or animation: '+name);
  for(const [target,curve] of curves)result.set(channels.get(target),curve);
  return result;
}
