// Optional discoveries. A map mark records where the player has actually been;
// the journal records what they did there. Neither advances the episode story.
import * as THREE from 'three';
import { t } from '../core/i18n.js';
import { WAYSIDES } from '../data/waysides.js';

const noteText = (id, field) => t('gameplay.travelNotes.' + id + '.' + field);
const noteKey=id=>'journey_'+id;

export function registerTravelNotes(G) {
  const points=WAYSIDES.map(site=>{
    const offset=site.id==='mill'?3.75:site.id.endsWith('Cart')?2.35:0;
    const x=site.x+Math.sin(site.angle)*offset, z=site.z+Math.cos(site.angle)*offset;
    const y=G.world.heightAt(x,z);
    return {...site,pos:new THREE.Vector3(x,y,z)};
  });
  function record(p) {
    const flags=G.state?.flags;
    if(!flags)return;
    const first=!flags[noteKey(p.id)];
    if(!first && p.id!=='westFold')return;
    flags[noteKey(p.id)]=true;
    if(p.id==='westFold')G.player.hp=G.player.maxHp;
    if(p.id==='reedBank')G.life?.spawn('cranes',p.x,p.z,true);
    G.ui?.toast?.(noteText(p.id, 'text'),{icon:'journal',dur:5});
    if(first)G.save.write(true);
  }
  for(const p of points)G.interact.add({
    pos:p.pos,radius:p.id==='mill'?4.5:4.0,priority:-1,
    enabled:()=>!!G.state&&(p.id==='westFold'||!G.state.flags[noteKey(p.id)]),
    prompt:()=>noteText(p.id, 'action'),onInteract:()=>record(p),
  });
  G.events.on('spell:cast',({spell,caster,pos,dir})=>{
    if(spell!=='wind'||caster!==G.player||!dir||!pos)return;
    const mill=points[0],x=mill.x-pos.x,z=mill.z-pos.z;
    const d=Math.hypot(x,z),aim=dir.x*x+dir.z*z;
    if(d<28 && aim>d*.83 && Math.abs(pos.y-mill.pos.y-5)<13)record(mill);
  });
  return {
    update(){
      if(!G.started||G.mode!=='play'||!G.state||!G.player)return;
      const p=G.player.pos;
      for(const site of points){
        if(Math.abs(p.x-site.x)<32&&Math.hypot(p.x-site.x,p.z-site.z)<32&&p.y-site.pos.y<49)
          G.state.discovered[noteKey(site.id)]=true;
      }
    },
    markers:()=>points.filter(p=>G.state?.discovered[noteKey(p.id)]).map(p=>({
      x:p.x,z:p.z,label:noteText(p.id, 'title'),kind:'place',icon:'journal',color:'#87966d'})),
    journal:()=>points.filter(p=>G.state?.flags[noteKey(p.id)]).map(p=>({
      id:noteKey(p.id),title:noteText(p.id, 'title'),text:noteText(p.id, 'text')})),
  };
}
