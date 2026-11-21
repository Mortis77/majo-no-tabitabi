// Branch architecture and leaf sprays for the deciduous trees seen along the journey.
// Distances are in the source model's metres. Each fork carries its own foliage anchors.
import * as THREE from 'three';
import { TILE, tileUV, foliageAtlas } from './atlas.js';
import { birchSurface } from './specimenBrush.js';
import { mulberry32 } from '../../core/util.js';

let birchMap;
function birchTexture(){
  if(birchMap) return birchMap;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  birchSurface(canvas,mulberry32(117802));
  birchMap=new THREE.CanvasTexture(canvas);
  birchMap.wrapS=birchMap.wrapT=THREE.RepeatWrapping;
  birchMap.anisotropy=4;birchMap.colorSpace=THREE.NoColorSpace;
  return birchMap;
}

const TAU=Math.PI*2;
const V=(x,y,z,r=0)=>({x,y,z,r});
const colour=h=>new THREE.Color(h).toArray();
const scale=(c,f)=>c.map(v=>v*f);
const along=(p,a,rad,h,r=0)=>V(p.x+Math.cos(a)*rad,p.y+h,p.z+Math.sin(a)*rad,r);
const mix=(a,b,t)=>V(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t,a.r+(b.r-a.r)*t);

function birchMark(target,wood,start,sides,rings,height,fraction,angle,arc,halfHeight,ink,fork=false) {
  // Barycentric interpolation on the existing trunk rings keeps each mark flush with the bent bark.
  const sample=(t,a)=>{
    const level=Math.max(0,Math.min(rings-1.0001,t*(rings-1))),ring=Math.floor(level),v=level-ring;
    const around=((a/TAU%1)+1)%1*sides,side=Math.floor(around),u=around-side;
    let px=0,py=0,pz=0,nx=0,ny=0,nz=0;
    for(const [row,rw] of [[ring,1-v],[ring+1,v]])for(const [col,cw] of [[side,1-u],[side+1,u]]){
      const id=(start+row*(sides+1)+col)*3,w=rw*cw;
      px+=w*wood.p[id];py+=w*wood.p[id+1];pz+=w*wood.p[id+2];
      nx+=w*wood.n[id];ny+=w*wood.n[id+1];nz+=w*wood.n[id+2];
    }
    return target.v(px+nx*.004,py+ny*.004,pz+nz*.004,nx,ny,nz,ink);
  };
  const steps=fork?4:3,strip=[];
  for(let k=0;k<=steps;k++){
    const u=k/steps,peak=Math.sin(u*Math.PI),a=angle+(u-.5)*arc;
    const center=fraction+(fork?peak*peak*halfHeight*2.3:Math.sin(u*4)*halfHeight*.35)/height;
    const half=(.08+.92*peak)*halfHeight/height;
    strip.push([sample(center-half,a),sample(center+half,a)]);
  }
  for(let k=0;k<steps;k++)target.q(strip[k][0],strip[k][1],strip[k+1][1],strip[k+1][0]);
}

function pendant(gb,root,angle,length,width,wind,random,folded){
  const [u0,v0,u1,v1]=tileUV(TILE.willow);
  const dx=Math.cos(angle),dz=Math.sin(angle),tx=-dz,tz=dx;
  const sway=(random()-.5)*width*.84, rows=[];
  for(const [t,w] of (folded?[[0,.45],[.28,1],[.64,.86],[1,.50]]:[[0,.54],[.40,1],[1,.57]])){
    const arch=width*(.30*Math.sin(t*Math.PI)+.40*t),slide=sway*t*t;
    const row=[];
    for(const s of (folded?[-1,0,1]:[-1,1])){
      const ridge=(1-Math.abs(s))*w*.19*width;
      row.push(gb.v(root.x+dx*(arch+ridge)+tx*(slide+s*w*width*.5),root.y-length*t+s*width*.06*(1-t),
        root.z+dz*(arch+ridge)+tz*(slide+s*w*width*.5),dx+tx*s*.30,.20+.2*(1-t),dz+tz*s*.30,
        [.83+.16*t,.88+.14*t,.85+.09*t],u0+(u1-u0)*(s+1)/2,v1-(v1-v0)*t,null,wind));
    }
    rows.push(row);
  }
  for(let r=0;r<rows.length-1;r++)for(let c=0;c<rows[r].length-1;c++)gb.q(rows[r][c],rows[r+1][c],rows[r+1][c+1],rows[r][c+1]);
}

export function specimenTree(P,seed,{GB,tube,bill,barkShade,model}){
  const kind=P.species,H=P.H,R=P.R,rnd=mulberry32(seed),birch=kind==='birch',willow=kind==='willow',ginkgo=kind==='ginkgo';
  const wood=new GB(), leaves=new GB(), closeLeaves=new GB(), details=new GB(), bounds=new THREE.Box3();
  const phase=rnd()*TAU,drift=(rnd()-.5)*R*.35;
  const bark=birch?colour(0xddd8c9):willow?colour(0x73644f):P.bark;
  const tr=Math.max(P.trunkR,H*(birch?.020:willow?.040:.030));
  const leaderTop=H*(birch?.96:ginkgo?.95:willow?.76:.83);
  const leader=[];
  const rings=7,sides=birch?9:8;
  for(let i=0;i<rings;i++){
    const t=i/(rings-1),bend=Math.sin(t*3.9)*tr*(willow?1.9:1.1);
    leader.push(V(t*t*drift+bend,t*leaderTop-.065,-t*t*R*(willow?.16:.07)+Math.sin(t*4.8)*tr*.43,
      tr*(.035+.965*(1-t)**.75)*(1+.43*(1-t)**7)));
  }
  const rootInk=colour(0x8a8076);
  tube(wood,leader,sides,(t,s)=>{
    if(!birch) return barkShade(bark)(t,s);
    const base=t<.01?rootInk:bark;
    return scale(base,.85+.10*t+.05*Math.sin(s*1.26));
  });
  if(birch)for(let i=0;i<rings;i++)for(let side=0;side<=sides;side++){
    const vertex=(i*(sides+1)+side)*2;
    wood.uv[vertex]=side/sides; wood.uv[vertex+1]=leader[i].y/2.65;
  }
  const trunkAt=t=>{const level=Math.min(rings-1.0001,Math.max(0,t)*(rings-1)),i=Math.floor(level);return mix(leader[i],leader[i+1],level-i);};
  if(birch){
    const charcoal=colour(0x504947),peel=colour(0xac9e89);
    for(let i=0;i<20;i++)birchMark(i%2?details:wood,wood,0,sides,rings,leaderTop,.043+i*.044+(rnd()-.5)*.016,phase+i*2.4,1.0+rnd()*1.2,tr*(.065+.06*rnd()),i%4?charcoal:peel,i%5===0);
    for(let i=0;i<32;i++)birchMark(details,wood,0,sides,rings,leaderTop,.028+.89*rnd(),rnd()*TAU,.38+rnd()*1.2,tr*(.018+.031*rnd()),i%3?charcoal:peel);
  }
  for(let k=0;k<(birch?3:4);k++){
    const a=phase+k*1.66, ry=tr*(.8+.6*rnd());
    tube(wood,[V(0,ry,0,tr*.43),along(leader[0],a,tr*1.16,.07,tr*.38),along(leader[0],a+.16,tr*(2.1+rnd()),-.07,.022)],3,barkShade(bark));
  }
  const tile=birch?TILE.birch:ginkgo?TILE.ginkgo:TILE.maple;
  const uv=tileUV(tile);
  function spray(gb,root,a,length,width,rise,pivot,shade) {
    const dx=Math.cos(a),dz=Math.sin(a),tx=-dz,tz=dx;
    const row=[];
    for(const [t,w,ridge] of [[0,.52,-.08],[.55,1,.18],[1,.69,-.07]]){
      const ids=[];
      for(const side of (gb===closeLeaves?[-1,0,1]:[-1,1])){
        const x=root.x+dx*length*t+tx*width*side*w*.5;
        const z=root.z+dz*length*t+tz*width*side*w*.5;
        const y=root.y+rise*t+(ridge+.17*(1-Math.abs(side)))*width+side*width*.095;
        ids.push(gb.v(x,y,z,dx*.45+tx*side*.38,.59+.17*(1-Math.abs(side)),dz*.45+tz*side*.38,
          scale(shade,.88+.21*t),uv[0]+(uv[2]-uv[0])*(side+1)/2,uv[1]+(uv[3]-uv[1])*t,null,pivot));
        bounds.expandByPoint(new THREE.Vector3(x,y,z));
      }
      row.push(ids);
    }
    for(let i=0;i<2;i++)for(let j=0;j<row[i].length-1;j++)gb.q(row[i][j],row[i][j+1],row[i+1][j+1],row[i+1][j]);
  }
  function foliage(root,a,size,t){
    const wind=[root.x,root.y,root.z,rnd()],shade=[.79+.15*t,.86+.10*t,.87+.08*t];
    if(willow){
      for(let i=0;i<3;i++){
        const turn=a+(i-1)*.68+(rnd()-.5)*.17, p=along(root,turn,size*(.26+.35*rnd()),size*(rnd()*.25-.05));
        const length=Math.min(root.y-.26,H*(.30+.28*rnd())*(1-.20*t));
        pendant(i===1?closeLeaves:leaves,p,turn,length,size*(.92+.41*rnd()),wind,rnd,i===1);
        bounds.expandByPoint(new THREE.Vector3(p.x,p.y-length,p.z));
      }
      // Small sprays above the arched leaders fill the crown's roof, with light between separate boughs.
      for(let i=0;i<4;i++){
        const b=along(root,a+(i-1.5)*1.19,size*.39,size*(rnd()-.34)*.45);
        bill(i===3?closeLeaves:leaves,[b.x,b.y,b.z],size*(1.0+.25*rnd()),TILE.broad,[Math.cos(a)*.65,.65,Math.sin(a)*.65],shade,wind,rnd);
      }
      return;
    }
    for(let i=0;i<3;i++){
      const turn=a+(i-1)*.91+(rnd()-.5)*.35,reach=size*(.77+.31*rnd());
      spray(i===1?leaves:closeLeaves,root,turn,reach,size*(.86+.22*rnd()),size*((birch?.28:.11)+rnd()*.42),wind,shade);
    }
    for(let i=0;i<(ginkgo?4:6);i++){
      const angle=a+(i-2.5)*1.1,p=along(root,angle,size*(.23+.32*rnd()),size*((rnd()-.30)*.51));
      const norm=[Math.cos(angle)*.60,.40+.42*t,Math.sin(angle)*.60];
      bill(i>=4?closeLeaves:leaves,[p.x,p.y,p.z],size*(.89+.38*rnd()),tile,norm,shade,wind,rnd);
    }
  }
  const arms=birch?10:willow?8:ginkgo?9:8;
  const branchInk=birch?colour(0x8d8071):bark;
  for(let i=0;i<arms;i++){
    const t=(i+.4)/arms;
    const levels=birch?[.33,.91]:ginkgo?[.31,.92]:willow?[.29,.84]:[.23,.91];
    const start=trunkAt(levels[0]+(levels[1]-levels[0])*t);
    const a=phase+i*2.4+(rnd()-.5)*.53;
    if(birch && i%2===0)birchMark(wood,wood,0,sides,rings,leaderTop,(start.y+.065)/leaderTop,-a,1.72,tr*.16,colour(0x68605d),true);
    const reach=R*(.80+.15*Math.sin(i*1.87)+.09*rnd())*(ginkgo?(1-.68*t):birch?(1-.47*t):1-.40*t);
    const lift=birch?H*(.23-.08*t):ginkgo?H*(.27-.14*t):willow?H*(.28-.11*t):H*(.23-.09*t);
    const base=start.r*(birch?.46:willow?.80:.70);
    const elbow=along(start,a-.19,reach*(willow?.55:.37),lift*(willow?.86:.38),base*.68);
    const outer=along(start,a,reach,lift,base*.10);
    const fork=mix(elbow,outer,.32);fork.r=base*.50;
    tube(wood,[{...start,r:base},elbow,outer],4,barkShade(branchInk));
    const cluster=R*(birch?.42:willow?.48:ginkgo?.44:.53)*(1-.31*t);
    foliage(outer,a,cluster,t);
    const a2=a+(i%2?1:-1)*(.61+.21*rnd()), side=along(fork,a2,reach*(.48+.24*rnd()),lift*(.34+.22*rnd()),.014);
    tube(wood,[{...fork,r:base*.45},side],3,barkShade(branchInk));
    foliage(side,a2,cluster*.80,t);
    if(!birch&&!ginkgo&&i%2===0){
      const stem=along(elbow,a-.86,reach*.51,lift*.49,.015);
      tube(wood,[{...elbow,r:base*.40},stem],3,barkShade(branchInk));foliage(stem,a-.86,cluster*.75,t);
    }
  }
  foliage(leader.at(-1),phase+.5,R*(willow?.49:ginkgo?.28:birch?.29:.47),1);
  const barkPart={geo:wood.build({uv:birch}),rule:{mode:'mul'},side:THREE.DoubleSide,
    map:birch?birchTexture():null,mat:{surface:birch?'none':'bark',tex:birch}};
  const leafPart={geo:leaves.build({uv:true,leaf:true,card:true}),rule:{mode:'tint',crown:true,glow:.9,tip:[.51,.98]},
    map:foliageAtlas(),side:THREE.DoubleSide,mat:{tex:true,bill:true,leaf:true,look:{trans:.48,rim:.13,wrap:.55},glowFloor:.08}};
  const tree=model([barkPart,leafPart],bounds);
  tree.closeParts=[];
  if(details.nv)tree.closeParts.push({...barkPart,geo:details.build(),map:null,mat:{surface:'none'}});
  if(closeLeaves.nv)tree.closeParts.push({...leafPart,geo:closeLeaves.build({uv:true,leaf:true,card:true})});

  return tree;
}
