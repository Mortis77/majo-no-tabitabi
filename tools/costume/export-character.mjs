// Rebuild a portable heroine with the same motion curves and skirt response as the game.
// node tools/costume/export-character.mjs char_akari [output directory]
import {io} from '../sculpt/figure/glbio.mjs';
import fs from 'node:fs';
import {copyToDocument, unpartition, unweld, tangents, weld} from '@gltf-transform/functions';
import {generateTangents} from 'mikktspace';
import {broomSeat, sculptBroomMount} from '../../src/actors/broom-contact.js';
import {bakeHeroineMotion} from '../sculpt/figure/heroine-motion-export.mjs';
import {bakeSkirt} from './bake-traveller-skirt.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../assets/', import.meta.url));
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
const id=process.argv[2]||'char_akari';
const namesById={char_akari:'旅行魔女',char_akari_swim_a:'潮祭水着',char_akari_swim_b:'暮海水着'};
if (!namesById[id]) throw new Error('Unknown outfit '+id);
const ioGL=io();
const doc=await ioGL.read(path.join(root,catalogue[id].file));
const nodes=new Map(doc.getRoot().listNodes().map(n=>[n.getName(),n]));
const buf=doc.getRoot().listBuffers()[0];
for (const [libId,names] of [['anim_ual',['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Jump_Start','Jump_Land']],['anim_miko',['Cast_Wind','Broom_Ride_Loop','Land_Hard']]]) {
  const lib=await ioGL.read(path.join(root,catalogue[libId].file));
  const accessors=new Map();
  const copy=a=>{
    if (!accessors.has(a)) accessors.set(a,doc.createAccessor().setBuffer(buf).setType(a.getType()).setArray(a.getArray().slice()).setNormalized(a.getNormalized()));
    return accessors.get(a);
  };
  for (const name of names) {
    const src=lib.getRoot().listAnimations().find(x=>x.getName()===name);
    if(!src) throw new Error('Missing '+name);
    const curves=bakeHeroineMotion(src,doc);
    const anim=doc.createAnimation(name);
    const samplers=new Map();
    for (const channel of src.listChannels()) {
      const node=nodes.get(channel.getTargetNode().getName());
      if (!node) throw new Error('Missing animated bone '+channel.getTargetNode().getName());
      const samp=channel.getSampler();
      const corrected=curves.get(channel);
      const key=corrected ? channel : samp;
      if(!samplers.has(key)){
        const values=corrected ? doc.createAccessor().setBuffer(buf).setType('VEC4').setArray(corrected.values) : copy(samp.getOutput());
        const times=corrected && corrected.times !== samp.getInput().getArray() ? doc.createAccessor().setBuffer(buf).setType('SCALAR').setArray(corrected.times) : copy(samp.getInput());
        const s=doc.createAnimationSampler().setInput(times).setOutput(values).setInterpolation(samp.getInterpolation());
        samplers.set(key,s);anim.addSampler(s);
      }
      anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(channel.getTargetPath()).setSampler(samplers.get(key)));
    }
    if(id==='char_akari') bakeSkirt(doc,anim);
    if (id==='char_akari_swim_a') bakeBeachHem(doc,anim);
    console.log(name,anim.listChannels().length);
  }
}
// Keep the independent meshes directly under the scene in the interchange file.
const scene = doc.getRoot().listScenes()[0];
const ident = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
for (const node of nodes.values()) {
  const par = node.getParentNode();
  if (!node.getMesh() || !node.getSkin() || !par) continue;
  if (!par.getWorldMatrix().every((x,i) => Math.abs(x-ident[i])<1e-8)) throw new Error('Nonidentity skinned-mesh parent');
  par.removeChild(node);
  scene.addChild(node);
}
// A glTF viewer has no player controller to summon the broom. Animate the holder's
// visibility via its scale; the other clips retain their original prop-free silhouette.
const broomDoc=await ioGL.read(path.join(root,catalogue.sculpt_prop_broom.file));
await broomDoc.transform(unweld(), tangents({generateTangents}), weld());
const sourceLOD=broomDoc.getRoot().listNodes().find(n=>n.getName()==='broom_LOD0');
if(!sourceLOD) throw new Error('Missing riding broom geometry');
const broomMesh=copyToDocument(doc,broomDoc,[sourceLOD]).get(sourceLOD);
const pivot=sculptBroomMount.pivot;
broomMesh.setTranslation(pivot.map(x=>-x));
const scaleNode=doc.createNode('BroomScale').setScale(sculptBroomMount.scale).addChild(broomMesh);
const holder=doc.createNode('BroomSeat').setTranslation(broomSeat).setRotation([Math.SQRT1_2,0,0,Math.SQRT1_2]).setScale([0,0,0]).addChild(scaleNode);
scene.addChild(holder);
const time0=doc.createAccessor().setBuffer(buf).setType('SCALAR').setArray(new Float32Array([0]));
for(const anim of doc.getRoot().listAnimations()){
  const visibility=+(anim.getName()==='Broom_Ride_Loop');
  const value=doc.createAccessor().setBuffer(buf).setType('VEC3').setArray(new Float32Array(3).fill(visibility));
  const samp=doc.createAnimationSampler().setInput(time0).setOutput(value).setInterpolation('STEP');
  anim.addSampler(samp).addChannel(doc.createAnimationChannel().setTargetNode(holder).setTargetPath('scale').setSampler(samp));
}
await doc.transform(unpartition());
doc.getRoot().setExtras({
  character: '灯里 / Akari', project: '月帷巫女 / Moonveil Miko',
  credits: 'Character meshes and textures made for Moonveil Miko. Costume references: Wandering Witch Elaina, TAITO Coreful and Aqua Float Girls. VRoid HairSample_Female skeleton by pixiv (CC0). Idle, walk and jog retargeted from Quaternius Universal Animation Library (CC0). Spell and broom clips by Moonveil Miko.',
  secondaryChains: catalogue[id].secondaryChains, springDefaults: catalogue[id].springDefaults
});
const dir=path.resolve(process.argv[3] || path.join(root,'../.tmp/character-export'));
fs.mkdirSync(dir,{recursive:true});
const file=path.join(dir,'灯里_'+namesById[id]+'.glb');
await ioGL.write(file,doc);const check=await ioGL.read(file);
if(check.getRoot().listAnimations().length!==9) throw new Error('Missing animations in export.');
console.log('export verified',fs.statSync(file).size);

function bakeBeachHem(doc,anim) {
  const root=doc.getRoot(), buffer=root.listBuffers()[0];
  const folded=Number(anim.getName()==='Broom_Ride_Loop');
  // Each of the two outer garments has one independent, named outfit shape.
  for (const node of root.listNodes()) {
    if (!node.getMesh()?.getExtras().targetNames?.includes('sideSaddleFold')) continue;
    const input=doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Float32Array([0]));
    const output=doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Float32Array([folded]));
    const sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('STEP');
    anim.addSampler(sampler);
    anim.addChannel(doc.createAnimationChannel().setSampler(sampler).setTargetNode(node).setTargetPath('weights'));
  }
}
