// Groves follow the contours and waterways. Their open sides frame the next ridge, bridge or settlement.
// Each spine is a sequence of separated stands, with taller mature trees in the core and saplings on its fringe.
import {mulberry32} from '../../core/util.js';
import {farmWeight} from '../terrain/paddyLayout.js';
import {SPECIES} from './species.js';

// [habitat, approximate stand radius in metres, spine points (x,z)]
const belts = [
  ['meadow', 17, [[-571,51],[-523,71],[-475,65],[-442,40],[-367,8],[-312,23],[-260,75],[-229,69]]],
  ['meadow', 19, [[-327,206],[-301,162],[-274,147],[-245,157],[-220,184],[-186,201]]],
  ['meadow', 15, [[-327,100],[-292,93],[-261,86],[-231,78],[-211,55]]],
  ['meadow', 20, [[-249,126],[-224,135],[-190,146],[-159,148]]],
  ['meadow', 19, [[-269,79],[-251,65],[-225,49],[-198,55]]],
  ['meadow', 19, [[-385,-72],[-346,-57],[-304,-43],[-277,-8],[-250,14]]],
  ['meadow', 21, [[-338,345],[-288,349],[-236,328],[-200,305],[-168,320]]],
  ['meadow', 17, [[-622,180],[-650,146],[-651,104],[-636,64]]],
  ['meadow', 23, [[-595,273],[-528,309],[-462,320],[-421,331],[-370,300],[-316,285],[-269,273],[-223,293]]],
  ['meadow', 21, [[-615,9],[-574,-40],[-530,-66],[-471,-47],[-413,-16],[-375,-35],[-334,-79]]],
  ['meadow', 23, [[-582,377],[-523,428],[-458,461],[-409,469],[-368,525],[-312,546],[-250,519]]],
  ['riparian', 17, [[-172,-229],[-202,-160],[-218,-107],[-199,-43],[-198,19],[-182,66],[-172,109],[-143,160],[-108,201],[-76,240],[0,311]]],
  ['riparian', 16, [[-148,-182],[-156,-132],[-152,-81],[-145,-22],[-138,23],[-113,86],[-96,138],[-70,173],[-33,226],[32,302]]],
  ['meadow', 20, [[-376,-218],[-332,-211],[-292,-184],[-267,-134],[-241,-105],[-233,-56]]],
  ['meadow', 19, [[-141,420],[-145,377],[-158,330],[-186,298],[-203,263]]],
  ['ridge', 21, [[-354,-376],[-289,-352],[-232,-325],[-180,-295],[-150,-265],[-119,-232]]],
  ['ridge', 18, [[-156,-449],[-122,-407],[-103,-371],[-92,-332],[-72,-295],[-48,-259]]],
  ['ridge', 19, [[-82,-374],[-55,-351],[-39,-324],[-19,-289],[5,-274]]],
  ['ridge', 20, [[21,-436],[62,-397],[94,-359],[101,-313],[118,-270],[172,-230]]],
  ['maple', 15, [[-104,7],[-97,-33],[-80,-74],[-78,-115],[-91,-157],[-78,-198]]],
  ['maple', 16, [[-34,26],[-22,-12],[-12,-48],[4,-94],[32,-134],[54,-192]]],
  ['night', 20, [[84,-183],[119,-171],[152,-188],[188,-219],[229,-252],[287,-288]]],
  ['night', 18, [[232,12],[257,59],[296,84],[338,96],[399,122],[445,152]]],
  ['night', 20, [[324,-349],[393,-380],[463,-372],[511,-338],[559,-329],[606,-308]]],
  ['riparian', 17, [[124,554],[139,596],[152,636],[151,678]]],
  ['meadow', 18, [[-688,-216],[-704,-259],[-743,-285],[-763,-337],[-804,-361],[-835,-402]]],
  ['meadow', 17, [[-619,-263],[-665,-318],[-693,-359],[-730,-398],[-773,-443],[-799,-465]]],
  ['meadow', 18, [[-903,-454],[-933,-470],[-956,-508],[-958,-553],[-948,-608],[-936,-646]]],
  ['ridge', 24, [[-892,-681],[-848,-706],[-809,-748],[-751,-751],[-700,-795],[-675,-846],[-607,-864]]],
  ['ridge', 20, [[-788,-664],[-719,-638],[-669,-609],[-630,-612],[-581,-648],[-541,-681],[-509,-725]]],
  ['meadow', 20, [[-553,-818],[-550,-870],[-526,-897],[-489,-897]]],
];

// Extra canopy can frame these long views but should not fill the line of sight.
const views = [
  [-493,82, 380,-40, 12,30], [-337,138, 380,-40, 11,28],
  [-277,111, -142,95, 10,11], [-75,-315, -20,-540, 12,20],
  [-610,-70, -620,-140, 10,14], [113,-83, 205,-125, 12,17],
];
function inVista(x,z) {
  for (const [x0,z0,x1,z1,start,end] of views) {
    const dx=x1-x0, dz=z1-z0, t=((x-x0)*dx+(z-z0)*dz)/(dx*dx+dz*dz);
    if (t>0 && t<1 && Math.hypot(x-x0-t*dx,z-z0-t*dz)<start+t*(end-start)) return true;
  }
  return false;
}
function trunkSpacing(records,stride) {
  const rows=new Map(), cell=12;
  const index=(ix,iz)=>(ix+80)*180+iz+80;
  function add(x,z) {
    const id=index(Math.floor(x/cell),Math.floor(z/cell));
    if (!rows.has(id)) rows.set(id,[]);
    rows.get(id).push(x,z);
  }
  for(const [key,positions] of records) if(SPECIES[key]?.kind==='tree') {
    for(let i=0;i<positions.length;i+=stride) add(positions[i],positions[i+2]);
  }
  function occupied(x,z,radius) {
    const ix=Math.floor(x/cell), iz=Math.floor(z/cell);
    for(let a=ix-1;a<=ix+1;a++) for(let b=iz-1;b<=iz+1;b++) {
      const bin=rows.get(index(a,b)); if (!bin) continue;
      for(let n=0;n<bin.length;n+=2) if((bin[n]-x)**2+(bin[n+1]-z)**2 < radius*radius) return true;
    }
    return false;
  }
  return {add,occupied};
}
function usable(W,x,z,habitat,canopy) {
  if(W.isReserved(x,z,6.5) || inVista(x,z)) return false;
  const h=W.heightAt(x,z), road=W.roadDist(x,z), river=W.riverDist(x,z);
  if(h<1.45 || h>(habitat==='ridge'?112:72) || road<7.3+canopy || river<11) return false;
  const slope=W.slopeAt(x,z);
  if(slope>(habitat==='ridge'?.68:.52) || farmWeight(x,z,h,slope,road,river)>.07) return false;
  if(Math.hypot(x-W.MOAT.x,z-W.MOAT.z)<W.MOAT.r1+11) return false;
  return Math.hypot(x-W.POI.sunhill.x,z-W.POI.sunhill.z)>75;
}

export function scatterWoodland(W,density,records,stride,plant) {
  const trunks=trunkSpacing(records,stride);
  for(const [beltIndex,[habitat,width,points]] of belts.entries()){
    let remaining=8;
    for(let j=1;j<points.length;j++){
      const [x0,z0]=points[j-1], [x1,z1]=points[j];
      const length=Math.hypot(x1-x0,z1-z0), dx=(x1-x0)/length, dz=(z1-z0)/length;
      while(remaining<length) {
        const step=Math.round(remaining*32), rng=mulberry32((beltIndex*487931+j*71707+step) ^ 0x39a743);
        const lateral=(rng()-.5)*width*.86, along=remaining;
        const cx=x0+dx*along-dz*lateral, cz=z0+dz*along+dx*lateral;
        const spread=width*(.78+rng()*.44), canopyTint=rng(), count=18+Math.floor(rng()*16);
        remaining+=width*(1.42+rng()*1.44);
        // All tiers keep the head of each stand. Lower tiers simplify interior and fringe members.
        for(let i=0;i<count;i++){
          const member=mulberry32((step*1907+i*49891+beltIndex*15163+j*4069)^0x54d1b6);
          const visible=member(), t=i===0?0:Math.sqrt(member()), phi=member()*Math.PI*2;
          if(i>1 && visible>.30+.70*density) continue;
          const ox=Math.cos(phi)*t*spread*1.20, oz=Math.sin(phi)*t*spread*.84;
          const x=cx+dx*ox-dz*oz, z=cz+dz*ox+dx*oz;
          const mature=i===0 || (t<.70 && member()<.59);
          const scale=mature?1.16+member()*.43:.57+member()*.56;
          if(trunks.occupied(x,z,mature?5.8:4.2) || !usable(W,x,z,habitat,scale*3.4)) continue;
          plant(habitat,x,z,scale,mature,canopyTint,member);
          trunks.add(x,z);
        }
      }
      remaining-=length;
    }
  }
}
