// Joinery and hand-cut paving in the courtyard of the Sun Shrine.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { flat, own } from '../../core/mats.js';
import { box } from '../../core/geo.js';
import { mulberry32 } from '../../core/util.js';
import { M, bevelBox } from './kit.js';

let finishes;
function shrineFinishes() {
  if (finishes) return finishes;
  function scanned(id, base, surface, distant) {
    const material = own(flat(base, { surface, look: { detail: 0, spec: .08 }, flatShading: false }));
    const texture = G.assets.texture(id);
    if (texture) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      material.map = texture;
    }
    material.userData.farColor = new THREE.Color(distant);
    material.needsUpdate = true;
    return material;
  }
  finishes = {
    stone: scanned('surface_shrine_flagstone', 0xc4c3b9, 'stone', 0xa6a39a),
    timber: scanned('surface_shrine_cedar', 0xbc9268, 'wood', 0x8d684b),
    bronze: flat(0x584c3c, {surface:'metal',look:{spec:.16}}),
  };
  return finishes;
}

function stone(w, d, height, rng) {
  const hx = w/2, hz = d/2;
  const cuts = Array.from({length:4}, () => .016 + .05*rng()**2 + (rng()<.11 ? .068*rng() : 0));
  // View from above. Chamfers retain the long straight faces of split stone;
  // isolated broken corners interrupt their silhouette.
  const outline = [
    [-hx+cuts[0],-hz], [hx-cuts[1],-hz], [hx,-hz+cuts[1]*.8],
    [hx,hz-cuts[2]], [hx-cuts[2]*.74,hz], [-hx+cuts[3],hz],
    [-hx,hz-cuts[3]*.9], [-hx,-hz+cuts[0]*.85]
  ];
  const lip=.010 + .012*rng(), slabs=[], uv=[];
  const phaseX=rng()*4, phaseZ=rng()*4, angle=rng()*6.28;
  const dx=Math.cos(angle),dz=Math.sin(angle),sx=(rng()-.5)*.006,sz=(rng()-.5)*.011;
  const top=outline.map(([x,z])=>[x*(1-lip/hx),height+x*sx+z*sz,z*(1-lip/hz)]);
  const edge=outline.map(([x,z],i)=>[x,top[i][1]-lip*(.8+rng()*.6),z]);
  const bottom=outline.map(([x,z])=>[x,-.065,z]);
  const center=[0,height+.0035,0];
  function face(a,b,c) {
    for(const [x,y,z] of [a,b,c]) {
      slabs.push(x,y,z);
      uv.push(phaseX+(x*dx+z*dz)/1.32,phaseZ+(z*dx-x*dz+.27*y)/1.32);
    }
  }
  for (let i=0;i<8;i++) {
    const j=(i+1)%8;
    face(center,top[j],top[i]);
    face(top[i],top[j],edge[j]);face(top[i],edge[j],edge[i]);
    face(edge[i],edge[j],bottom[j]);face(edge[i],bottom[j],bottom[i]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(slabs,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,shrineFinishes().stone);
  mesh.castShadow=mesh.receiveShadow=true;
  return mesh;
}

export function layApproach(site, toLocal) {
  const rng=mulberry32(276511);
  let course=0;
  function segment(ax,az,bx,bz,count) {
    const angle=Math.atan2(bx-ax,bz-az),length=Math.hypot(bx-ax,bz-az),step=length/count;
    const cs=Math.cos(angle),sn=Math.sin(angle);
    for(let i=0;i<count;i++,course++){
      const f=(i+.5)/count, x=ax+(bx-ax)*f,z=az+(bz-az)*f;
      const [lx,lz]=toLocal(x,z);
      // A sunken run of fine gravel is visible in the narrow unpointed joints.
      site.add(box(2.36,.058,step+.012,M.stoneDark()),lx,site.h(lx,lz)-.023,lz,angle);
      const width=2.25+.042*rng(),gap=.022+.011*rng(),split=width*(.36+.27*rng());
      const spans=course%5===1 || course%7===4 ? [width] : [split,width-split-gap];
      let left=-width/2;
      for(const span of spans){
        const off=left+span/2,px=lx+off*cs,pz=lz-off*sn;
        const slab=stone(span,step-(.029+.018*rng()),.041+.009*rng(),rng);
        site.add(slab,px,site.h(px,pz),pz,angle+(rng()-.5)*.013);
        left+=span+gap;
      }
    }
  }
  segment(-540,21.0,-540,68,45);
  segment(-540,68,-548.4,72.5,10);
}

// Reproject each timber in its own grain direction. UVs are measured in
// metres so the same scan reads continuously along a beam, rim or deck board.
function timber(w,h,d,x,y,z,axis,rng) {
  const mesh=bevelBox(w,h,d,shrineFinishes().timber,x,y,z,Math.min(.010, .12*Math.min(w,h,d)));
  const geo=mesh.geometry.clone(),p=geo.attributes.position;
  const uv=new Float32Array(p.count*2),a=rng()*3,b=rng()*3,sign=rng()<.5?-1:1;
  for(let i=0;i<p.count;i++){
    const px=p.getX(i),py=p.getY(i),pz=p.getZ(i);
    const along=axis==='x'?px:axis==='z'?pz:py;
    const across=axis==='x'?pz+py:axis==='z'?px+py:px+pz;
    uv[i*2]=a+along*sign/.97;uv[i*2+1]=b+across/.65;
  }
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));mesh.geometry=geo;
  return mesh;
}

export function fitHaidenVeranda(group, floorMaterial) {
  const floor=group.children.find(o=>o.material===floorMaterial);
  const rng=mulberry32(8243);
  if(floor) {
    // The dark core is visible only through 7 mm board joints and along the end grain.
    floor.material=M.woodDark();floor.position.y-=.013;
  }
  const depth=1.70,rows=8;
  for(let row=0;row<rows;row++){
    const z=4.0+(row+.5)*depth/rows, cuts=row%3===0?[-6.09,-2.7,1.35,6.09]:row%3===1?[-6.09,-.95,3.05,6.09]:[-6.09,-3.85,.28,6.09];
    for(let i=0;i<cuts.length-1;i++){
      const length=cuts[i+1]-cuts[i]-.009;
      group.add(timber(length,.067,depth/rows-.007,(cuts[i+1]+cuts[i])/2,1.02-.034,z,'x',rng));
    }
  }
}

export function shrineFloorMarker() { return shrineFinishes().timber; }

export function offeringChest() {
  const g=new THREE.Group(),rng=mulberry32(742);
  const {bronze}=shrineFinishes(), width=1.72,depth=.82,half=width/2;
  const plank=(...args)=>g.add(timber(...args,rng));
  g.add(box(width-.08,.08,depth-.08,M.woodDark(),0,.23,0));
  for(const side of [-1,1]){
    for(let row=0;row<3;row++){
      plank(width-.12,.119,.057,0,.296+.126*row,side*(depth/2-.044),'x');
      plank(.057,.119,depth-.10,side*(half-.045),.296+.126*row,0,'z');
    }
    // Projecting rails and inset feet keep the box off the wet ground.
    plank(.126,.118,depth+.018,side*(half-.052),.059,0,'z');
    plank(width+.048,.080,.072,0,.187,side*(depth/2-.027),'x');
    plank(width+.085,.084,.10,0,.670,side*(depth/2+.003),'x');
    plank(.10,.084,depth-.07,side*(half-.007),.670,0,'z');
    for(const end of [-1,1]){
      plank(.092,.55,.09,side*(half-.034),.38,end*(depth/2-.032),'y');
      g.add(box(.104,.07,.013,bronze,side*(half-.034),.622,end*(depth/2+.014)));
      g.add(box(.017,.07,.09,bronze,side*(half+.018),.622,end*(depth/2-.03)));
    }
  }
  // Widely spaced inclined slats let coins drop into the dark interior.
  for(let i=0;i<13;i++){
    const slat=timber(.044,.087,depth-.11,-.724+i*.12,.645,0,'z',rng);
    slat.rotation.z=.35;g.add(slat);
  }
  // The shrine uses a sun crest on its banners. Its eight recessed spokes are
  // repeated here as a small bronze escutcheon on the middle front board.
  const crest=new THREE.Group();crest.position.set(0,.438,depth/2-.008);
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(.061,.061,.018,16),bronze);disk.rotation.x=Math.PI/2;crest.add(disk);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,ray=box(.026,.065,.014,bronze,.096*Math.sin(a),.096*Math.cos(a),.003);
    ray.rotation.z=-a;crest.add(ray);
  }
  g.add(crest);
  return g;
}

let bellMetal;
function castBrass() {
  if(bellMetal) return bellMetal;
  const cv=document.createElement('canvas');cv.width=256;cv.height=192;
  const ctx=cv.getContext('2d'),pix=ctx.createImageData(cv.width,cv.height);
  const rng=mulberry32(60917),tau=2*Math.PI;
  for(let j=0;j<cv.height;j++)for(let i=0;i<cv.width;i++){
    const u=i/cv.width,v=j/cv.height;
    const cloud=(Math.sin(tau*(3*u+.32*Math.sin(8*v)))+.55*Math.cos(tau*(7*u+2*v))+.31*Math.sin(tau*(13*u-3*v)))/1.86;
    // Darker oxidation gathers below the equator. The rolled shoulder and the
    // exposed lower lip pick up a softer, broad band from regular handling.
    const seams=.17*Math.exp(-((v-.54)**2)/.0018)+.13*Math.exp(-((v-.81)**2)/.003);
    const patina=Math.max(0,Math.min(.8,.16+.27*v+.11*cloud+seams+.045*(rng()-.5)));
    const warm=.88+.09*Math.cos((v-.27)*Math.PI)+.035*cloud;
    const rgb=[205*warm,163*warm,105*warm],oxidized=[91,94,74],ix=(j*cv.width+i)*4;
    for(let k=0;k<3;k++)pix.data[ix+k]=rgb[k]*(1-patina)+oxidized[k]*patina;
    pix.data[ix+3]=255;
  }
  ctx.putImageData(pix,0,0);
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=THREE.RepeatWrapping;tex.anisotropy=2;
  bellMetal=own(flat(0xf5e5cc,{surface:'metal',look:{spec:.37,detail:0},flatShading:false}));
  bellMetal.map=tex;bellMetal.userData.farColor=new THREE.Color(0xb19467);bellMetal.needsUpdate=true;
  return bellMetal;
}

// Shallow slot and rolled equator of a cast suzu bell. Its pull is three
// continuous laid strands, so the stripe follows the twist when the bell swings.
export function makeSuzuPull() {
  const group=new THREE.Group(), y=-.22, radius=.194;
  const aged=castBrass();
  const recess=shrineFinishes().bronze;
  const addShell=(phi,length,theta,height)=>{
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,22,6,phi,length,theta,height),aged);
    mesh.position.y=y; mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  };
  addShell(0,Math.PI*2,0,1.60);
  // Two opposed sound slots run up into the lower shell. Their wider rounded
  // heads show the recessed dark metal behind them from the prayer side.
  for(const start of [Math.PI/2,Math.PI*1.5]) {
    const positions=[],normals=[],uv=[],index=[],levels=10,segments=16;
    for(let row=0;row<=levels;row++){
      const f=row/levels,theta=1.60+f*1.48;
      const gap=(.042+.118*Math.exp(-((theta-1.89)**2)/.029))*Math.min(1,f*13);
      for(let i=0;i<=segments;i++){
        const phi=start+gap+(Math.PI-2*gap)*i/segments;
        const nx=-Math.cos(phi)*Math.sin(theta),ny=Math.cos(theta),nz=Math.sin(phi)*Math.sin(theta);
        positions.push(radius*nx,y+radius*ny,radius*nz);
        normals.push(nx,ny,nz);uv.push(phi/(2*Math.PI),1-theta/Math.PI);
        if(i<segments&&row<levels){
          const a=row*(segments+1)+i,b=a+segments+1;
          index.push(a,b,a+1,a+1,b,b+1);
        }
      }
    }
    const g=new THREE.BufferGeometry();g.setIndex(index);
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const shell=new THREE.Mesh(g,aged);shell.castShadow=shell.receiveShadow=true;group.add(shell);
  }
  const suspension=new THREE.Mesh(new THREE.TorusGeometry(.041,.009,5,13),aged);
  suspension.position.y=-.035;group.add(suspension);
  const core=new THREE.Mesh(new THREE.SphereGeometry(radius*.86,14,7),recess);
  core.position.y=y;group.add(core);
  for(const [r,thickness,h] of [[.192,.009,y+.006],[.077,.010,y+.174]]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r,thickness,6,22),aged);
    ring.position.y=h;ring.rotation.x=Math.PI/2;group.add(ring);
  }
  const cordTop=-.389,length=1.57;
  const red=flat(0xa8453b,{surface:'cloth',look:{spec:.03}}), cream=flat(0xdcc9a9,{surface:'cloth',look:{spec:.03}});
  for(let strand=0;strand<3;strand++){
    const knots=[];
    for(let i=0;i<=44;i++){
      const t=i/44,phase=2*Math.PI*(5.1*t+strand/3),bulge=.020*(.88+.14*Math.sin(Math.PI*t));
      knots.push(new THREE.Vector3(bulge*Math.cos(phase),cordTop-length*t,bulge*Math.sin(phase)));
    }
    const strandMesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(knots),48,.021,5,false),strand===1?red:cream);
    strandMesh.castShadow=strandMesh.receiveShadow=true;group.add(strandMesh);
  }
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(.039,.048,.078,10),red);
  collar.position.y=cordTop-length-.022;group.add(collar);
  for(let i=0;i<7;i++){
    const a=i/7*Math.PI*2,R=.027;
    const tassel=new THREE.Mesh(new THREE.CylinderGeometry(.011,.007,.216+.034*Math.sin(a),4),i%3===0?red:cream);
    tassel.position.set(R*Math.sin(a),cordTop-length-.158,R*Math.cos(a));
    tassel.rotation.set(-.16*Math.cos(a),0,.16*Math.sin(a));group.add(tassel);
  }
  return group;
}
