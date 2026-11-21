// The field is indexed in 8 m sections. Six reusable instanced draws collect visible
// plants by species and mesh detail. No per-stalk objects, alpha cards or shadow passes.
import * as THREE from 'three';
import { hookMaterial, toonGradient } from '../../core/mats.js';
import { DATA_CELL, DATA_HALF } from './textures.js';
import { farmWeight, plotAt, plotPoint, plotSeed, PLOT_WIDTH, PLOT_DEPTH, ROW_SPACE, HILL_SPACE } from './paddyLayout.js';
import { makeRiceGeometry } from './ricePlant.js';

const T=THREE, kinds=['young','ripe'], levels=['near','mid','far'];
const profiles={high:{range:[7.2,21,60],stride:[1,2,5]},med:{range:[6.2,17,50],stride:[1,3,7]},low:{range:[5.2,13.5,38],stride:[1,4,9]}};
const cellId=(x,z)=>x*8192+z;
const smooth=(x)=>Math.max(0,Math.min(1,x));
const TAU=2*Math.PI;
const nearMaterial=() => new T.MeshToonMaterial({color:0xffffff,vertexColors:true,side:T.DoubleSide,gradientMap:toonGradient()});

function random(ix,iz,row,hill,n) {
  let a=(Math.imul(ix,15485863)^Math.imul(iz,1664525)^Math.imul(row,2246822519)^Math.imul(hill,3266489917)^Math.imul(n,668265263))>>>0;
  a=Math.imul(a^(a>>>16),0x7feb352d);a=Math.imul(a^(a>>>15),0x846ca68b);
  return ((a^(a>>>16))>>>0)/4294967296;
}

// Use the same baked road, river and relief texture as the land material. The
// interpolated terrain height avoids thousands of fresh noise evaluations per field.
function fieldSampler(G) {
  const tex=G.terrain.dataTexture.image, arr=tex.data,N=tex.width, half=T.DataUtils.fromHalfFloat;
  const read=(x,z,channel=0)=>{
    const u=(x+DATA_HALF)/DATA_CELL-.5,v=(z+DATA_HALF)/DATA_CELL-.5,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,idx=(j*N+i)*4+channel;
    const top=half(arr[idx])*(1-a)+half(arr[idx+4])*a, bottom=half(arr[idx+N*4])*(1-a)+half(arr[idx+N*4+4])*a;
    return top*(1-b)+bottom*b;
  };
  const reserved=new Map(), w=G.world;
  // Expand fixed layouts into a local spatial index, including the field drying racks.
  const structures=new Map(), obstacles=(w.colliders||[]).filter(c=>!c.dead  && Math.hypot(c.x-w.POI.hometown.x,c.z-w.POI.hometown.z)<210);
  // The prop system streams live bodies around the player. Its layout records
  // also describe sleeping carts, barrels and tools across the whole village.
  for(const p of G.props?.records||[]){
    if(!p.gone && Math.hypot(p.x-w.POI.hometown.x,p.z-w.POI.hometown.z)<205)
      obstacles.push({x:p.x,z:p.z,r:Math.max(.16,Math.min(1.4,p.hh)),y0:p.y-p.hh,y1:p.y+p.hh});
  }
  for(const c of obstacles){
    const span=(c.box ? Math.hypot(c.hw,c.hd) : c.r)+.5;
    for(let i=Math.floor((c.x-span)/8);i<=Math.floor((c.x+span)/8);i++)for(let j=Math.floor((c.z-span)/8);j<=Math.floor((c.z+span)/8);j++){
      const k=cellId(i,j);if(!structures.has(k))structures.set(k,[]);structures.get(k).push(c);
    }
  }
  function obstructed(x,z,h){
    const cs=structures.get(cellId(Math.floor(x/8),Math.floor(z/8)));
    if(!cs)return false;
    return cs.some(c=>{
      if(c.dead || c.y0>h+1.3 || c.y1<h-.2)return false;
      const X=x-c.x,Z=z-c.z;
      if(!c.box)return X*X+Z*Z<(c.r+.36)**2;
      const co=Math.cos(c.rot||0),si=Math.sin(c.rot||0);
      return Math.abs(X*co-Z*si)<c.hw+.40 && Math.abs(X*si+Z*co)<c.hd+.40;
    });
  }
  const maskCache=new Map();
  function cover(x,z) {
    const i=Math.floor(x/2),j=Math.floor(z/2),key=cellId(i,j);
    if(!maskCache.has(key)){
      const sx=i*2+1,sz=j*2+1,h=read(sx,sz);
      const slope=Math.atan(Math.hypot(read(sx+1,sz)-read(sx-1,sz),read(sx,sz+1)-read(sx,sz-1))/2);
      maskCache.set(key,farmWeight(sx,sz,h,slope,read(sx,sz,1),read(sx,sz,2)));
    }
    return maskCache.get(key);
  }
  function allowed(x,z,y) {
    const ix=Math.floor(x/2),iz=Math.floor(z/2),key=cellId(ix,iz);
    if(!reserved.has(key))reserved.set(key,w.isReserved(ix*2+1,iz*2+1,1.7));
    return !reserved.get(key)&&!obstructed(x,z,y)&&read(x,z,1)>4.35;
  }
  return {read,cover,allowed};
}

function assembly(G) {
  const sample=fieldSampler(G), chunks=new Map(), borders=new Set(), bankP=[],bankC=[],bankI=[];
  const bankColors=[0x827747,0xb5a16a,0xac9f63,0x858348].map(c=>new T.Color(c));
  const village=G.world.POI.hometown, center=plotAt(village.x,village.z);
  let parcels=0,young=0,ripe=0;
  function earth(ix,iz,side) {
    const key=ix+','+iz+','+side;
    if(borders.has(key))return;
    borders.add(key);
    const across=side===0, len=across?PLOT_DEPTH:PLOT_WIDTH, n=Math.ceil(len/2);
    let last=-1;
    for(let s=0;s<=n;s++){
      const t=s*len/n,u=ix*PLOT_WIDTH+(across?0:t),v=iz*PLOT_DEPTH+(across?t:0),[x,z]=plotPoint(u,v),h=sample.read(x,z);
      const amount=sample.cover(x,z);
      if(amount<.34 || !sample.allowed(x,z,h)){last=-1;continue;}
      const start=bankP.length/3;
      for(const [k,w] of [-.54,-.20,.235,.54].entries()) {
        const [px,pz]=plotPoint(u+(across?w:0),v+(across?0:w));
        const rise=k===0||k===3?-.018:.087+.025*Math.sin(t*.76+ix*.32);
        bankP.push(px,sample.read(px,pz)+rise*smooth((amount-.29)/.23),pz);
        const c=bankColors[k],v0=.96+.04*Math.sin(ix*2.2+iz+t*.68);bankC.push(c.r*v0,c.g*v0,c.b*v0);
      }
      if(last>=0) for(let k=0;k<3;k++){
        const a=last+k,b=a+1,c=start+k+1,d=start+k;
        if(across)bankI.push(a,d,b,b,d,c);else bankI.push(a,b,d,b,c,d);
      }
      last=start;
    }
  }
  for(let ix=center.ix-9;ix<=center.ix+9;ix++)for(let iz=center.iz-13;iz<=center.iz+13;iz++){
    const seed=plotSeed(ix,iz),kind=seed<.32 ? 0 : seed>=.55&&seed<.8 ? 1 : -1;
    if(kind<0)continue;
    const [cx,cz]=plotPoint((ix+.5)*PLOT_WIDTH,(iz+.5)*PLOT_DEPTH);
    const d=Math.hypot(cx-village.x,cz-village.z);
    if(d<65||d>202)continue;
    let count=0;
    for(let r=0;;r++){
      const u=1.06+seed*.12+ROW_SPACE*r;
      if(u>PLOT_WIDTH-.9)break;
      for(let j=0;;j++){
        const v=.98+(j+.28*(r%2))*HILL_SPACE;
        if(v>PLOT_DEPTH-.76)break;
        const a=random(ix,iz,r,j,1),b=random(ix,iz,r,j,2);
        const [x,z]=plotPoint(ix*PLOT_WIDTH+u+(a-.5)*.09,iz*PLOT_DEPTH+v+(b-.5)*.16);
        const weight=sample.cover(x,z);
        if(weight<.33+.29*(1-a))continue;
        const y=sample.read(x,z);
        if(!sample.allowed(x,z,y))continue;
        const bx=Math.floor(x/8),bz=Math.floor(z/8),k=cellId(bx,bz);
        if(!chunks.has(k)) chunks.set(k,{x:(bx+.5)*8,z:(bz+.5)*8,items:[]});
        chunks.get(k).items.push({x,y,z,kind,a,b,angle:TAU*random(ix,iz,r,j,4),pick:random(ix,iz,r,j,5),offUntil:0});
        count++;kind ? ripe++ : young++;
      }
    }
    if(count){
      parcels++;earth(ix,iz,0);earth(ix+1,iz,0);earth(ix,iz,1);earth(ix,iz+1,1);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(bankP,3));geo.setAttribute('color',new T.Float32BufferAttribute(bankC,3));
  geo.setIndex(bankI);geo.computeVertexNormals();
  const mat=nearMaterial();mat.name='rice field banks';hookMaterial(mat);
  const bank=new T.Mesh(geo,mat);bank.name='paddy:earthBanks';bank.receiveShadow=true;bank.castShadow=false;
  G.scene.add(bank);
  return {chunks:[...chunks.values()],bank,parcels,young,ripe};
}

function cropMaterial(G) {
  const mat=nearMaterial();
  const uniforms={pTime:{value:0},pWind:{value:new T.Vector2(.60,.25)},pWalker:{value:new T.Vector3(1e6,0,1e6)}};
  mat.name='rice foliage and panicles';
  mat.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,uniforms);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float pTime;uniform vec2 pWind;uniform vec3 pWalker;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 root=instanceMatrix[3].xyz;
        vec2 xx=normalize(instanceMatrix[0].xz),zz=normalize(instanceMatrix[2].xz);
        float h=max(0.,position.y),phase=dot(root.xz,vec2(.16,.25));
        float gust=sin(phase+pTime*1.3)*.060+sin(phase*.46+pTime*.66)*.047;
        vec2 bend=pWind*gust;
        vec2 diff=root.xz-pWalker.xz;
        float nearPlayer=1.-smoothstep(.16,1.15,length(diff));
        bend+=diff/max(.20,length(diff))*(.16*nearPlayer*(1.-smoothstep(.8,2.6,abs(root.y-pWalker.y))));
        transformed.xz+=vec2(dot(bend,xx),dot(bend,zz))*h*h;`)
      .replace('#include <color_vertex>',`#include <color_vertex>
        #ifdef USE_COLOR
        float pPhase=dot(instanceMatrix[3].xz,vec2(.17,.23));
        float pWave=smoothstep(.18,.88,sin(pPhase+pTime*1.3)+.23*sin(pPhase*.46+pTime*.66));
        float pTop=smoothstep(.32,.87,position.y);
        vColor.rgb*=vec3(.95,.965,.95)+vec3(.18,.14,.075)*(pWave*pTop*min(1.,length(pWind))+.12*pTop);
        #endif`);
  };
  hookMaterial(mat);
  return {mat,uniforms};
}

export function createPaddies(G,quality) {
  const {range,stride}=profiles[quality]||profiles.med, {mat,uniforms}=cropMaterial(G);
  const capacity=range.map((r,i)=>Math.ceil(Math.PI*(r*r-(range[i-1]||0)**2)/(ROW_SPACE*HILL_SPACE*stride[i])*1.20)+80);
  const batches=kinds.map(kind=>levels.map((level,i)=>{
    const m=new T.InstancedMesh(makeRiceGeometry(kind,level),mat,capacity[i]);
    m.count=0;m.visible=false;m.frustumCulled=false;m.instanceMatrix.setUsage(T.DynamicDrawUsage);m.receiveShadow=false;
    m.name='paddy:'+kind+':'+level;G.scene.add(m);return m;
  }));
  const pos=new T.Vector3(),quat=new T.Quaternion(),scale=new T.Vector3(),matrix=new T.Matrix4(),up=new T.Vector3(0,1,0);
  let age=0, regrow=Infinity, buildMs=0;
  let layout=null, draws=0,tris=0, counts=[0,0,0],lastX=1e6,lastY=1e6,lastZ=1e6,overflow=0;
  function clear(){for(const q of batches)for(const m of q){m.visible=false;m.count=0;}}
  function update(dt,cam) {
    age+=dt;uniforms.pTime.value=age;
    const wind=G.terrain.uniforms.trGust.value;
    uniforms.pWind.value.set(wind.x*(.25+.6*wind.z),wind.y*(.25+.6*wind.z));
    if(G.player?.pos)uniforms.pWalker.value.copy(G.player.pos);
    if(age<regrow && Math.hypot(cam.x-lastX,cam.z-lastZ)<1.65 && Math.abs(cam.y-lastY)<1.25)return;
    regrow=Infinity;
    lastX=cam.x;lastY=cam.y;lastZ=cam.z;
    const village=G.world.POI.hometown;
    clear();draws=tris=overflow=0;counts=[0,0,0];
    if(Math.hypot(cam.x-village.x,cam.z-village.z)>201+range[2] || cam.y>100){if(layout)layout.bank.visible=false;return;}
    if(!layout){const t=performance.now();layout=assembly(G);buildMs=Math.round(performance.now()-t);}
    layout.bank.visible=true;
    for(const chunk of layout.chunks){
      if(Math.hypot(chunk.x-cam.x,chunk.z-cam.z)>range[2]+6)continue;
      for(const p of chunk.items){
        if(p.offUntil>age){regrow=Math.min(regrow,p.offUntil);continue;}
        const dx=p.x-cam.x,dz=p.z-cam.z,dy=p.y+.45-cam.y;
        const d=dx*dx+dz*dz+dy*dy;
        const l=d<range[0]**2 ? 0 : d<range[1]**2 ? 1 : d<range[2]**2 ? 2 : 3;
        if(l===3 || p.pick>=1/stride[l])continue;
        const m=batches[p.kind][l];
        if(m.count>=capacity[l]){overflow++;continue;}
        pos.set(p.x,p.y-.018,p.z);quat.setFromAxisAngle(up,p.angle);
        const th=.84+.29*p.a, spread=(l===0?1:l===1?1.09:1.32)*(.85+.30*p.b);
        scale.set(spread,th,spread);matrix.compose(pos,quat,scale);
        m.setMatrixAt(m.count++,matrix);counts[l]++;
      }
    }
    for(const q of batches)for(const m of q)if(m.count){
      m.instanceMatrix.clearUpdateRanges();m.instanceMatrix.addUpdateRange(0,m.count*16);m.instanceMatrix.needsUpdate=true;
      m.visible=true;draws++;tris+=m.count*(m.geometry.index?.count||m.geometry.attributes.position.count)/3;
    }
  }
  function disturb(x,z,r,deform){
    if(!layout)return;
    for(const ch of layout.chunks)if(Math.hypot(ch.x-x,ch.z-z)<r+6)for(const p of ch.items){
      const d=Math.hypot(p.x-x,p.z-z);if(d>r)continue;
      if(deform){p.y=G.world.heightAt(p.x,p.z);if(d<r*.91)p.offUntil=Infinity;}
      else if(d<r*.82)p.offUntil=Math.max(p.offUntil,age+150);
    }
    if(deform){
      const pos=layout.bank.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        const px=pos.getX(i),pz=pos.getZ(i);if(Math.hypot(px-x,pz-z)<r+1) pos.setY(i,G.world.heightAt(px,pz)-.018);
      }
      pos.needsUpdate=true;layout.bank.geometry.computeVertexNormals();layout.bank.geometry.computeBoundingSphere();
    }
    lastX=1e6;
  }
  return {update,disturb,stats:()=>({parcels:layout?.parcels||0,young:layout?.young||0,ripe:layout?.ripe||0,shown:counts,draws,triangles:tris,overflow,buildMs})};
}
