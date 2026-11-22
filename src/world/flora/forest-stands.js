// A 100 m square is one hectare. A fully stocked core has around 560 stems/ha
// before local canopy gaps, stream banks and footpaths remove individual stems.
import { mulberry32, noise2, smoothstep } from '../../core/util.js';
import { JOURNEY_POI } from '../../data/journey-map.js';
import { WAYSIDES } from '../../data/waysides.js';
import { landmarkAt } from '../../data/landmarks.js';
import { trialShoreDistance, trialViewOpening } from '../trial-lake.js';
import { treeCommunity } from './travel-canopy.js';

const stands = [
  // Centre, east/north half-widths and orientation. Overlapping ellipses form one wood.
  [1995,140,172,115,-.32], [2040,-255,153,99,.44], [1512,153,200,134,.29],
  [1285,-298,239,122,-.23], [906,-334,231,148,.24], [520,-16,238,133,-.33],
  [183,-76,223,130,-.45], [-230,-412,239,154,.41], [-747,-118,239,143,-.29],
  [-1135,-460,254,153,.37], [-1518,-166,253,162,.17], [-1817,-603,231,153,-.40],
  [-715,-591,232,135,.38], [-2041,-846,234,113,.07], [-123,326,241,155,-.27],
  [897,345,205,137,.17], [491,-692,272,148,-.19], [-1515,246,261,141,.40],
];
/** 0..1+: elliptical distance to the nearest stand centre line (below ~1.1 the stand may plant trees here). */
export function standEllipse(x, z) {
  let best = 9;
  for (const [cx,cz,rx,rz,angle] of stands) {
    if (Math.abs(x-cx) > Math.max(rx,rz)*1.4 || Math.abs(z-cz) > Math.max(rx,rz)*1.4) continue;
    const cs=Math.cos(angle), sn=Math.sin(angle), dx=x-cx, dz=z-cz;
    best = Math.min(best, Math.hypot((dx*cs+dz*sn)/rx,(dz*cs-dx*sn)/rz));
  }
  return best;
}
const pitch = 4.04;
const stemBin = 2;
const binKey = (x,z) => x*4096+z;

export function plantForestStands(world, result, stride, plantTree, plantFloor) {
  const occupied=new Map(), visited=new Set();
  function remember(x,z) {
    const key=binKey(Math.floor(x/stemBin), Math.floor(z/stemBin));
    let pts=occupied.get(key);if(!pts)occupied.set(key,pts=[]);
    pts.push(x,z);
  }
  // Keep hard separation from older canopy trees, including the ones around Fran's cottage.
  for(const [id,arr] of result) {
    if(!/^(broad|pine|birch|ginkgo|maple|willow)/.test(id))continue;
    for(let i=0;i<arr.length;i+=stride)remember(arr[i],arr[i+2]);
  }
  function canGrow(x,z) {
    const ix=Math.floor(x/stemBin), iz=Math.floor(z/stemBin);
    for(let bx=ix-1;bx<=ix+1;bx++)for(let bz=iz-1;bz<=iz+1;bz++){
      const pts=occupied.get(binKey(bx,bz));
      if(pts)for(let i=0;i<pts.length;i+=2)if((x-pts[i])**2+(z-pts[i+1])**2<2.6)return false;
    }
    return true;
  }
  const {hometown,forest,trial}=JOURNEY_POI;
  for(const [cx,cz,rx,rz,angle] of stands){
    const cs=Math.cos(angle),sn=Math.sin(angle);
    const extentX=Math.hypot(rx*cs,rz*sn)*1.20, extentZ=Math.hypot(rx*sn,rz*cs)*1.20;
    for(let j=Math.floor((cz-extentZ)/pitch); j*pitch<cz+extentZ; j++){
      for(let i=Math.floor((cx-extentX)/pitch); i*pitch<cx+extentX; i++){
        const key=binKey(i,j);
        if(visited.has(key))continue;
        // Key the stem to the site, so a changed shoreline or clearing doesn't shuffle its neighbours.
        const random=mulberry32(Math.imul(i+8791,73856093)^Math.imul(j-1941,19349663)^648091);
        const x=(i+.08+.84*random())*pitch+2.7*noise2(i*.12,j*.12),
          z=(j+.08+.84*random())*pitch+2.7*noise2(i*.12+81,j*.12-33);
        const dx=x-cx,dz=z-cz;
        const ellipse=Math.hypot((dx*cs+dz*sn)/rx,(dz*cs-dx*sn)/rz);
        const border=ellipse+.19*noise2(x*.018+3,z*.018);
        const edge=1-smoothstep(.64,1.11,border);
        if(edge===0)continue;
        // Windthrow gaps leave pockets of brighter sky and groups of smaller trees.
        const lightGap=smoothstep(.29,.61,noise2(x*.036-13,z*.036+19));
        if(random()>edge*(.965-.84*lightGap))continue;
        if(Math.hypot(x-hometown.x,z-hometown.z)<175 ||
           Math.hypot(x-trial.x,z-trial.z)<44 || trialViewOpening(x,z) ||
           Math.hypot(x-forest.x,z-forest.z)<22 || trialShoreDistance(x,z)<1.16 ||
           WAYSIDES.some(p=>Math.abs(x-p.x)<p.radius+4&&Math.abs(z-p.z)<p.radius+4) || landmarkAt(x,z,3,['flowerValley']))continue;
        const h=world.heightAt(x,z);
        if(h<1.5 || h>207 || world.roadDist(x,z)<4.9 || world.isReserved(x,z,1.2) || !canGrow(x,z))continue;
        visited.add(key);remember(x,z);
        const nearCabin=Math.hypot(x-forest.x,z-forest.z)<175;
        const tree=treeCommunity(x,z,h,world.riverDist(x,z),true,nearCabin,random);
        const age=random()+lightGap*.2;
        // Emergent trunks stand above a smaller middle storey and naturally regenerating saplings.
        const size=age<.19 ? 1.80+random()*.83 : age<.66 ? .88+random()*.60 : .34+random()*.46;
        plantTree(tree,x,z,size);
        if(random()<.22)plantFloor(x,z,lightGap,random);
      }
    }
  }
}
