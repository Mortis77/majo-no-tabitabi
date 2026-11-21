// A rooted rice tussock in metres. Faces, normals and linear vertex colours are shared by
// the field instances. All leaves and panicles stay in world space as the camera moves.
import {BufferGeometry, Float32BufferAttribute, Color, Vector3} from 'three';

const PALETTE = {
  stem: new Color(0xad993e), newStem: new Color(0x589548),
  leaf: new Color(0x8c994a), leafSun: new Color(0xc8b459), foldedLeaf: new Color(0x858547),
  young: new Color(0x55934d), youngSun: new Color(0x89b85d), youngFold: new Color(0x337247),
  neck: new Color(0xae9141), grain: new Color(0xefc468), grainLight: new Color(0xfade8c),
  grainShadow: new Color(0xbe913e)
};
const TAU = Math.PI*2, UP = new Vector3(0,1,0);
const point = (x,y,z) => new Vector3(x,y,z);
const polar = (a,r,y) => point(Math.cos(a)*r,y,Math.sin(a)*r);

/** kind: ripe or young. level: near, mid or far. The material should draw both sides of folded leaves. */
export function makeRiceGeometry(kind, level, variant=0) {
  const pos=[], colours=[];
  const near=level==='near', far=level==='far', green=kind==='young';
  const phase=(variant*.382+.12)*TAU;
  function face(a,b,c,colour) {
    for(const v of [a,b,c]) {pos.push(v.x,v.y,v.z);colours.push(colour.r,colour.g,colour.b);}
  }
  function stem(from,to,r0,r1,colour) {
    const tangent=to.clone().sub(from).normalize();
    const side=tangent.clone().cross(Math.abs(tangent.y)>.87 ? point(1,0,0) : UP).normalize();
    const around=tangent.clone().cross(side);
    const ring=(p,r,i)=>p.clone().addScaledVector(side,Math.cos(i*TAU/3)*r).addScaledVector(around,Math.sin(i*TAU/3)*r);
    for(let i=0;i<3;i++) {
      const a=ring(from,r0,i), b=ring(from,r0,i+1), c=ring(to,r1,i), d=ring(to,r1,i+1);
      face(a,b,c,colour);face(b,d,c,colour);
    }
  }
  function blade(base,angle,height,reach,halfWidth) {
    const forward=polar(angle,1,0), side=polar(angle+Math.PI/2,1,0);
    const tip=base.clone().addScaledVector(forward,reach);tip.y+=height;
    const arc=base.clone().addScaledVector(forward,reach*.48);arc.y+=height*(green?.83:1.11);
    const left=arc.clone().addScaledVector(side,-halfWidth),right=arc.clone().addScaledVector(side,halfWidth);
    const ridge=arc.clone().addScaledVector(forward,-halfWidth*.42);
    const lit=green?PALETTE.youngSun:PALETTE.leafSun, shade=green?PALETTE.youngFold:PALETTE.foldedLeaf;
    face(base,left,ridge,shade);face(base,ridge,right,lit);face(left,tip,ridge,shade);face(ridge,tip,right,lit);
  }
  // Double-pointed husk; at distance a long spindle describes a group of grains.
  function husk(start,end,radius,angle) {
    const shoulder=start.clone().lerp(end,.43);
    const verts=[0,1,2].map(i=>shoulder.clone().add(polar(angle+TAU*i/3,radius,0)));
    for(let i=0;i<3;i++){
      const next=(i+1)%3, col=[PALETTE.grainLight,PALETTE.grain,PALETTE.grainShadow][i];
      face(start,verts[next],verts[i],col);face(verts[i],verts[next],end,col);
    }
  }
  if (green) {
    const count=near?10:far?3:6;
    for(let i=0;i<count;i++){
      const a=phase+i*2.39996, height=.28+.15*(.5+.5*Math.cos(i*1.9+phase));
      blade(polar(a,.012,-.016),a,height,.075+.11*(i%3)/2,near?.018:.023);
    }
  } else if (far) {
    for(let i=0;i<2;i++){
      const a=phase+i*2.45,root=polar(a,.02,-.02),peak=polar(a,.04,.90-i*.09),end=polar(a,.21,.69-i*.1);
      const side=polar(a+Math.PI/2,.037,0);
      face(root,peak.clone().sub(side),peak.clone().add(side),PALETTE.stem);
      husk(peak,end,.036,a);
    }
  } else {
    const count=near?3:2;
    for(let i=0;i<count;i++) {
      const a=phase+i*2.39996, drift=1+.12*Math.sin(phase+i*1.7);
      const height=(1.025-.075*i)*drift, root=polar(a,.020,-.025);
      const shoulder=polar(a,.055,height*.67), peak=polar(a,.13,height), bend=polar(a,.225,height-.05), tip=polar(a,.30,height-.20);
      const spread=.030*i;
      for(const top of [shoulder,peak,bend,tip]) top.add(polar(a,spread,0));
      const width=near?.011:.022;
      stem(root,peak,width,width*.57,PALETTE.stem);
      blade(shoulder.clone().multiplyScalar(.62),a+.72,.42,.19,.023);
      if(near)blade(shoulder,a-.49,.26,.21,.021);
      if(!near) { husk(peak,tip,.041,a); continue; }
      stem(peak,bend,.010,.007,PALETTE.neck);stem(bend,tip,.007,.0035,PALETTE.neck);
      const branches=i===0?4:3;
      for(let n=0;n<branches;n++){
        const t=(n+.27)/branches, u=t<.5?peak.clone().lerp(bend,t*2):bend.clone().lerp(tip,t*2-1);
        const turn=a+(n%2?1:-1)*(.6+.21*n);
        const joint=u.clone().add(polar(turn,.052+.008*(1-t),-.048));
        stem(u,joint,.004,.003,PALETTE.neck);
        const end=joint.clone().add(polar(turn,.024,-.063));
        husk(joint,end,.015,turn);
        if(i===0 && n%2===0) {
          const second=u.clone().lerp(joint,.52);
          husk(second,second.clone().add(polar(turn+.6,.028,-.053)),.011,turn+.6);
        }
      }
    }
  }
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute(pos,3));
  g.setAttribute('color',new Float32BufferAttribute(colours,3));
  g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
