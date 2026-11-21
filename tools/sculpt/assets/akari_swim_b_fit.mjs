// Fit the loose hip ruffle in bind space against the figure over locomotion and seated poses.
// The resulting positions and ordinary skin weights also play correctly in external glTF viewers.
import { loadFigureRig } from '../figure/akari-figure.mjs';
import { fkPose } from '../figure/weights.mjs';
import { skinMesh } from '../rig.mjs';
import { closestPt, cross, sub, norm, dot, W1, wmix, smooth } from '../../costume/garment.mjs';

const point = (a,i) => [a[i*3],a[i*3+1],a[i*3+2]];
const key = (x,y,z) => (x+255)*1024*1024+(y+255)*1024+z+255;
const clips = [
  ['Idle_Loop',.34],['Walk_Loop',.28],['Jog_Fwd_Loop',.39],['Sprint_Loop',.8],
  ['Broom_Ride_Loop',.5],['Crouch_Idle_Loop',.62],['Sit_Ground_Loop',.1],
  ['Sit_Ground_Loop',.4],['Sit_Ground_Loop',.7],['Land_Hard',.4],['Swim_Fwd_Loop',.4]
];

function signedDistance(body,matrices) {
  const posed=skinMesh(body.P,body.N,body.J,body.Wt,matrices).pos,cell=.021,quantum=.0019;
  const bins=new Map(),samples=new Map();
  for(let i=0;i<body.I.length;i+=3){
    const vs=[body.I[i],body.I[i+1],body.I[i+2]],q=point(body.P,vs[0]);
    if(q[1]<.52||q[1]>1.13||Math.abs(q[0])>.165) continue;
    const tri=vs.map(v=>point(posed,v)),normal=norm(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])));
    const lo=[0,1,2].map(k=>Math.floor(Math.min(...tri.map(v=>v[k]))/cell));
    const hi=[0,1,2].map(k=>Math.floor(Math.max(...tri.map(v=>v[k]))/cell));
    const face=[...tri,normal];
    for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){
      const id=key(x,y,z);if(!bins.has(id))bins.set(id,[]);bins.get(id).push(face);
    }
  }
  return p=>{
    const q=p.map(v=>Math.round(v/quantum)), id=key(...q);
    if(samples.has(id)) return samples.get(id);
    const v=q.map(n=>n*quantum),g=v.map(n=>Math.floor(n/cell));let best=.034,side=best;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      for(const [a,b,c,n] of bins.get(key(g[0]+x,g[1]+y,g[2]+z))||[]){
        const delta=sub(v,closestPt(v,a,b,c)),dist=Math.hypot(...delta);
        if(dist<best){best=dist;side=dot(n,delta);}
      }
    }
    samples.set(id,side);return side;
  };
}

function skinPoint(p,weights,matrices){
  const q=[0,0,0];
  for(const [j,w] of weights){
    const m=matrices[j];
    for(let k=0;k<3;k++) q[k]+=w*(m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]);
  }
  return q;
}

export async function fitHipRuffle(C,wardrobe) {
  const rig=await loadFigureRig();
  const squat=fkPose(rig,{J_Bip_L_UpperLeg:[-112,0,6],J_Bip_R_UpperLeg:[-112,0,-6],J_Bip_L_LowerLeg:[130,0,0],J_Bip_R_LowerLeg:[130,0,0],J_Bip_C_Spine:[22,0,0]});
  const poseList=[fkPose(rig,{}),...clips.map(([name,time])=>{const clip=rig.clip(name);return rig.pose(clip,clip.duration*time);}),squat];
  const poses=poseList.map(m=>({m, distance:signedDistance(C.body,m)}));
  const parts=wardrobe.pieces.filter(p=>p.group==='akari_swim_waist' && p.mat==='float_organza');
  const columns=113,rows=6,legs=['R','L'].map(s=>W1(C.ji('J_Bip_'+s+'_UpperLeg')));
  const cost=(p,w)=>{
    let worst=0, total=0;
    for(const pose of poses){
      const d=Math.max(0,.002-pose.distance(skinPoint(p,w,pose.m)));
      worst=Math.max(worst,d);total+=d;
    }
    return worst+.12*total;
  };
  // Both sides of the double flounce share the same small corrections. The
  // cinched seam is fixed, and a circular smoothing pass preserves the folds.
  for(let pass=0; pass<3;pass++){
  const delta=Array.from({length:rows},()=>Array.from({length:columns-1},()=>[0,0,0,0]));
  for(let row=1;row<rows;row++)for(let j=0;j<columns-1;j++){
    const i=row*columns+j,g=parts[1],p=g.geo.pos[i],w=g.weights[i],leg=wmix(legs[0],legs[1],smooth(-.018,.018,p[0]));
    const a=j/(columns-1)*Math.PI*2,front=Math.cos(a),rad=Math.sin(a);
    if(front<-.28) continue;
    let lowest=cost(p,w);
    if(lowest<.0015) continue;
    const fade=Math.min(1,row/3);
    for(const dy of [0,-.007,.007,.015,.023,.031])for(const dz of [0,-.01,.01,-.022,.022])for(const dx of [0,-.012,.012,-.021,.021])for(const dw of [0,.055,.105,.15]){
      const move=[rad*(.48*dz+dx)*fade,dy*fade,dz*fade],wNew=wmix(w,leg,dw*fade);
      const value=cost(p.map((v,k)=>v+move[k]),wNew)+.04*Math.hypot(...move)+.002*dw;
      if(value<lowest){lowest=value;delta[row][j]=[...move,dw*fade];}
    }
  }
  for(const g of parts)for(let row=1;row<rows;row++)for(let j=0;j<columns;j++){
    const jj=j%(columns-1),d=[0,0,0,0];
    let total=0;
    for(let n=-6;n<=6;n++){
      const weight=Math.exp(-n*n/14);total+=weight;
      for(let k=0;k<4;k++)d[k]+=weight*delta[row][(jj+n+columns-1)%(columns-1)][k];
    }
    for(let k=0;k<4;k++) d[k]/=total;
    const i=row*columns+j,p=g.geo.pos[i],leg=wmix(legs[0],legs[1],smooth(-.018,.018,p[0]));
    g.geo.pos[i]=p.map((v,k)=>v+d[k]);g.weights[i]=wmix(g.weights[i],leg,d[3]);
  }
  }
  // Small weight corrections keep the front hem riding over a lifted thigh.
  // Preserve the bind silhouette. The knee's small contribution lifts the
  // loose edge only in a deep fold, where the thigh rotates against the waist.
  for(const piece of parts)for(let i=0;i<piece.geo.pos.length;i++){
    const p=piece.geo.pos[i],w=piece.weights[i],side=smooth(-.017,.017,p[0]);
    const leg=wmix(legs[0],legs[1],side);
    const knee=wmix(W1(C.ji('J_Bip_R_LowerLeg')),W1(C.ji('J_Bip_L_LowerLeg')),side);
    const hip=W1(C.ji('J_Bip_C_Hips')),spine=W1(C.ji('J_Bip_C_Spine'));
    let best=cost(p,w), chosen=w;
    if(best<.002) continue;
    for(const thigh of [-.2,-.1,0,.045,.09,.135,.18])for(const shin of [0,.012,.025,.04,.06])for(const torso of [0,.14,.28]){
      let k=thigh<0?wmix(w,hip,-thigh):wmix(w,leg,thigh);
      if(shin)k=wmix(k,knee,shin);
      if(torso)k=wmix(k,spine,torso);
      const pairs=[...k.entries()].filter(a=>a[1]>.0001).sort((a,b)=>b[1]-a[1]).slice(0,4);
      const sum=pairs.reduce((v,a)=>v+a[1],0);k=new Map(pairs.map(([j,f])=>[j,f/sum]));
      const score=cost(p,k)+.002*(Math.abs(thigh)+shin+torso);
      if(score<best){best=score;chosen=k;}
    }
    piece.weights[i]=chosen;
  }
  const binding=wardrobe.pieces.find(p=>p.name==='waist_binding');
  if(binding) binding.weights=binding.geo.pos.map((_,i)=>parts[1].weights[Math.floor(i/6)]);
}
