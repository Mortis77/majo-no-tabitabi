// A whole spray is one instance. Narrow ray florets, curved bells and upright
// flower spikes share the same wind-bent stem and the same near/far draw.
import * as THREE from 'three';

export function flowerPatch(distant) {
  const pos=[], blade=[], shape=[], head=[], indices=[];
  const stems = distant ? [[.24,.4],[.53,.57],[.75,.32]] : [[.16,.40],[.40,.31],[.63,.58],[.77,.71]];
  for (let j=0;j<stems.length;j++) {
    const [u,v]=stems[j], yaw=j*2.399+.34, variation=(j*.373+.12)%1;
    const add=(x,y,z,role,center=[0,0,0])=>{
      const i=pos.length/3;pos.push(x,y,z);blade.push(u,v,yaw,variation);
      shape.push(role,Math.max(0,Math.min(1,.48+3.8*(x-center[0])+2.7*(z-center[2]))),0,0);head.push(center[0],center[1],center[2],0);return i;
    };
    const ribbon=(start,end,width,role)=>{
      const a=add(start[0]-width,start[1],start[2],role);
      add(start[0]+width,start[1],start[2],role);
      add(end[0]+width*.6,end[1],end[2],role);add(end[0]-width*.6,end[1],end[2],role);
      indices.push(a,a+1,a+2,a,a+2,a+3);
    };
    const leaf=(t,side)=>{
      const a=add(0,t,0,1), b=add(side*.07,t+.08,-.032,1), c=add(side*.17,t+.18,.03,1), d=add(side*.06,t+.115,.041,1);
      indices.push(a,b,c,a,c,d);
    };
    ribbon([0,0,0],[.035,.99,.015],distant?.014:.009,0);
    if (!distant) {leaf(.20,1);leaf(.43,-1);}
    const n=distant?2:3;
    for (let k=0;k<n;k++){
      const a=yaw+(k+1)*2.35;
      const ctr=k===0?[.035,.99,.015]:[Math.cos(a)*(.11+.02*k),.70+.09*k,Math.sin(a)*.105];
      const [cx,cy,cz]=ctr;
      if(k)ribbon([.02,cy-.18,.009],ctr,distant?.009:.005,0);
      const rays=distant?5:6,rad=(k?.75:1)*(distant ? .172 : .143);
      const core=add(cx,cy+.012,cz,3,ctr);
      const rim=[];
      for(let k2=0;k2<rays;k2++){
        const angle=k2*6.283185/rays+.22*k;
        const at=(off,r,y,role)=>add(cx+r*Math.cos(angle+off),cy+y,cz+r*Math.sin(angle+off),role,ctr);
        rim.push(at(0,rad*.31,.012,3));
        const a0=at(0,rad*.20,0,2);
        const a1=at(-.32,rad*.72,.018,2);
        const a2=at(-.04,rad,.034,2);
        const a3=at(.34,rad*.74,.023,2);
        if(distant) indices.push(a0,a1,a3);
        else indices.push(a0,a1,a2,a0,a2,a3);
      }
      // The small golden centre reads as one shape at both distances.
      for (let ii=0;ii<rays;ii+=2) {
        const next=ii+2<rays?ii+2:0;
        indices.push(core,rim[ii],rim[next]);
      }
    }
  }
  const geo=new THREE.InstancedBufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  const norms=new Float32Array(pos.length);for(let i=1;i<norms.length;i+=3)norms[i]=1;
  geo.setAttribute('normal',new THREE.BufferAttribute(norms,3));
  geo.setAttribute('aBlade',new THREE.Float32BufferAttribute(blade,4));
  geo.setAttribute('aBlade2',new THREE.Float32BufferAttribute(shape,4));
  geo.setAttribute('aBlade3',new THREE.Float32BufferAttribute(head,4));
  geo.setIndex(indices);geo.userData.blades=stems.length;return geo;
}

export const flowerVertex=/* glsl */`
vec3 gPos=vec3(0.0,-1.e4,0.0),gNrm=vec3(0.,1.,0.);
{
  float S=gRing.x;
  int slot=int(mod(float(gl_InstanceID)+gOffset,gRing.y));
  vec2 grid=texelFetch(gCells,ivec2(slot%256,slot/256),0).rg;
  vec2 cell=(floor(gCenter/S)+grid)*S;
  vec2 jitter=vec2(gHash(cell*.58+.14),gHash(cell*.79+9.));
  float tile=gHash(cell*.42+11.5);
  vec2 local=aBlade.xy-.5;
  if(tile>.5)local.x=-local.x;
  if(jitter.x>.5)local=local.yx;
  vec2 root=cell+S*(vec2(.5)+local*.65+(jitter-.5)*.53);
  vec2 uv=(root-gField.xy)/gField.z;
  vec4 field=textureLod(gF0,uv,0.), land=textureLod(gF1,uv,0.);
  vec4 ground=gTex(gData,root);
  float dist=distance(root,gCam.xz),road=ground.g,river=ground.b;
  float onset=gRing.z<.5?1.:smoothstep(gRing.z,gRing.z+gRing2.y,dist);
  float fade=onset*(1.-smoothstep(gRing.w-gRing2.z,gRing.w,dist));
  float broad=gN(root/128.+.31).g, detail=gN(root/20.+.42).b;
  float ribbon=meadowRibbon(root,broad,detail);
  float wet=1.-smoothstep(17.,33.,river);
  float forest=smoothstep(.47,.70,broad);
  float dusk=land.b,night=land.a;
  float margin=smoothstep(3.15,5.5,road)*smoothstep(9.5,13.,river);
  float amount=field.a*margin*(1.-step(.35,land.g));
  float islands=gN(root/15.+.74).r;
  float bloomCover=smoothstep(.10,.73,.14+ .70*ribbon +.31*islands+.18*wet-.10*forest);
  float grow=gAerial*fade*smoothstep(.19,.73,amount)*smoothstep(tile*.44+.035,tile*.44+.25,bloomCover);
  if(grow>.015) {
    float spike=max(wet*.84,forest*(1.-.70*dusk))*(1.-night*.55);
    float stature=mix(.94,1.18,wet)+.10*dusk-.035*forest;
    float len=stature*(.88+.31*aBlade.w+.16*tile)*grow;
    float role=aBlade2.x,t=position.y;
    vec3 form=position;
    if(role>1.5){
      vec3 delta=position-aBlade3.xyz;
      float radial=length(delta.xz);
      form.xz=aBlade3.xz*mix(1.,.72,spike)+delta.xz*gRing2.x*mix(1.,.72,spike);
      form.y-=spike*(radial*1.03+.024);
      form.y+=delta.x*.66+delta.z*.42;
    }
    float turn=aBlade.z+tile*6.28318;
    mat2 rot=mat2(cos(turn),sin(turn),-sin(turn),cos(turn));
    float gust,flatten;
    vec2 wind=gBend(root,aBlade.w,gust,flatten);
    float t2=t*t;
    gPos=vec3(root.x,ground.r-.032,root.y);
    gPos.xz+=rot*(form.xz*grow*(.96+.32*aBlade.w))+len*t2*(wind*.54+rot*vec2(.09,.02));
    gPos.y+=form.y*len*(1.-flatten*.68);
    vec3 green=mix(field.rgb*vec3(.53,.67,.54),vec3(.10,.26,.12),.36);
    float mixColour=smoothstep(.38,.62,gN(root/52.+.12).r);
    vec3 petal=meadowDayPetal(mixColour,forest,wet);
    petal=mix(petal,mix(vec3(.91,.22,.18),vec3(.96,.54,.15),mixColour),dusk*(1.-.83*wet));
    vec3 moon=mix(vec3(.43,.74,.82),vec3(.58,.48,.86),mixColour);
    petal=mix(petal,moon,night);
    vec3 pollen=mix(vec3(.81,.46,.07),vec3(.94,.74,.33),dusk*.3);
    vGCol=role<.5?green:role<1.5?green*1.38:role<2.5?petal:pollen;
    vGCol*=.91+.12*aBlade.w+.09*detail;
    if(role>1.5 && role<2.5) vGCol*=.76+.32*aBlade2.y;
    vGTrans=role>1.5?vGCol*.32:green*.20;
    vGGlow=role>1.5?moon*(role>2.5?.34:.11)*night:vec3(0.);
    gNrm=normalize(vec3(wind.x*.08,.9,wind.y*.08)+vec3(rot[0].x*.15,0.,rot[0].y*.15));
  } else {vGCol=vec3(0.);vGTrans=vec3(0.);vGGlow=vec3(0.);}
}
`;
