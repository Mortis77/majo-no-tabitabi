// Original game geometry drawn from TAITO's 2025 Coreful Elaina swimsuit, regular edition.
// Body slices register the fitted details to the posed game's actual skin, including the foot and arm.
import { add, mul, sub, lerp, norm, cross, grid, loft, ellipsoid, tube, merge, fixWinding, W1, wmix, smooth } from './garment.mjs';
import { swatchUV } from './outfit.mjs';
const TAU = Math.PI * 2;
const WHITE = [245, 241, 249], LACE = [225, 220, 235], BLACK = [42, 38, 53], SATIN = [55, 49, 61];
const mix3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const vec = (a, i) => [a[i*3], a[i*3+1], a[i*3+2]];
const clamp = t => Math.max(0,Math.min(1,t));
export function upperEdge(x,z) {
  const t = Math.atan2(x,z), f = Math.max(0,Math.cos(t));
  return 1.144 + .060*f + .021*Math.sin(t)**2*f + .020*Math.exp(-((Math.abs(x)-.051)**2)/.00023)*f - .008*Math.exp(-(x*x)/.00024)*f;
}
const waist = (x,z) => .973 + .006*Math.sin(Math.atan2(x,z))**2 + .022 * smooth(0,-.065,z);
export const swimsuitCut = (x,y,z) => Math.max(waist(x,z)-y, Math.min(y-1.094,upperEdge(x,z)-y));

// Sample the true first skin crossing along a ray in a body cross-section. Bucketing
// triangle bounds by height keeps the construction deterministic and inexpensive.
function surfaces(C) {
  const P=C.body.P, I=C.body.I, axes=[[1,2],[0,2]], bins=[new Map(),new Map()];
  for(let axis=0;axis<2;axis++) for(let t=0;t<I.length;t+=3) {
    const vs=[vec(P,I[t]),vec(P,I[t+1]),vec(P,I[t+2])];
    const q=vs.map(v=>v[axis]), a=Math.floor(Math.min(...q)*100),b=Math.floor(Math.max(...q)*100);
    for(let k=a;k<=b;k++){if(!bins[axis].has(k))bins[axis].set(k,[]);bins[axis].get(k).push(vs);}
  }
  return (axis,h,centre,d,def=.035)=>{
    const [a,b]=axes[axis], o=[centre[a],centre[b]], dir=[d[a],d[b]];
    let r=Infinity;
    for(const tri of bins[axis].get(Math.floor(h*100))||[]) {
      const edges=[];
      for(let j=0;j<3;j++) {const p=tri[j],q=tri[(j+1)%3];if((p[axis]>h)===(q[axis]>h))continue;
        const u=(h-p[axis])/(q[axis]-p[axis]);edges.push([lerp(p[a],q[a],u),lerp(p[b],q[b],u)]);}
      if(edges.length!==2)continue;
      const [p,q]=edges,e=[q[0]-p[0],q[1]-p[1]], den=dir[0]*e[1]-dir[1]*e[0];
      if(Math.abs(den)<1e-9)continue;
      const v=[p[0]-o[0],p[1]-o[1]], ray=(v[0]*e[1]-v[1]*e[0])/den, s=(v[0]*dir[1]-v[1]*dir[0])/den;
      if(ray>.00001&&s>=0&&s<=1)r=Math.min(r,ray);
    }
    return r===Infinity?def:r;
  };
}
export function beachDetails(wd) {
  const C=wd.C, M=C.M, skin=surfaces(C), bone=name=>W1(C.ji('J_Bip_'+name));
  const phys=name=>W1(C.ji(name)), up=bone('C_UpperChest'), hip=bone('C_Hips'), spine=bone('C_Spine');
  const hipWeight=p=>wmix(hip,spine,smooth(.93,1.04,p[1])*.5);
  const addPiece=(name,g,col,weights,group,mat='cloth_trim',centre=null)=>{
    fixWinding(g,centre);swatchUV(wd,g,col);
    wd.piece(name,g,g.pos.map((p,i)=>weights(p,i)),mat,{group});
  };
  const patch=(rows,cols,fn)=>grid(rows+1,cols+1,(i,j)=>({p:fn(j/cols,i/rows),u:j/cols,v:i/rows}));
  const torso=(a,y,ease=0)=>{
    const d=[Math.sin(a),0,Math.cos(a)], c=[0,y,.001];
    return add(c,mul(d,skin(1,y,c,d,.105)+ease));
  };
  const print=[.03,.03,.96,.68];
  wd.cvB.rect(print,(u,v)=>{
    const x=u*14 + .24*Math.sin(v*2.1), y=v*1.62 + .25*Math.sin(TAU*u*4);
    const i=Math.floor(x),j=Math.floor(y), lx=x-i-.5, ly=(y-j-.5)*1.47;
    const a=Math.atan2(ly,lx)+.65*Math.sin(i*3+j),r=Math.hypot(lx,ly);
    const scallop=.082+.065*(.5+.5*Math.cos(5*a));
    const petal=Math.exp(-((r-scallop)**2)/.00052);
    const eye=Math.exp(-((r-.032)**2)/.00014);
    const thread=Math.exp(-((ly-.31*Math.sin(4*lx+1.4))**2)/.00020)*.28;
    const line=Math.exp(-((v-.94+.016*Math.cos(TAU*u*32))**2)/.000065);
    const v0=.71*(petal+eye)+thread*1.3+line*.68;
    return WHITE.map((k,index)=>lerp(k,[133,119,154][index],Math.min(.85,v0)));
  });
  function printed(name,g,w,group){
    g.uv=g.uv.map(([u,v])=>[lerp(print[0]+.005,print[2]-.005,u),lerp(print[1]+.005,print[3]-.005,v)]);
    fixWinding(g,[0,1,0]);wd.piece(name,g,g.pos.map(w),'cloth_frill',{group});
  }
  function frill(name, a0,a1,rows,cols,material,weight,yAt,easeAt,group='akari_swim') {
    const geo=patch(rows,cols,(u,v)=>{
      const a=lerp(a0,a1,u), y=yAt(a,v), e=easeAt(a,v);
      const dir=[Math.sin(a),0,Math.cos(a)],c=[0,y,.001];
      const raw=skin(1,y,c,dir,.105);
      // The lower wrap spans both legs with a single continuous fold. A ray
      // through the gap between the thighs would otherwise fold the fabric inward.
      const ellipse=1/Math.hypot(dir[0]/.154,dir[2]/.116);
      const envelope=group==='akari_skirt' ? ellipse*(1-smooth(.86,.944,y)) : 0;
      return add(c,mul(dir,Math.max(raw,envelope)+e));
    }); 
    const follows=group==='akari_skirt'?wd.weightsBelow(geo.pos,2,{reach:.10}):null;
    const weighted=(p,i)=>follows?.[i]||weight(p,i);
    if(name==='upper_flounce'||name==='hip_ruffle') printed(name,geo,weighted,group);
    else addPiece(name,geo,material,weighted,group,'cloth_frill',[0,1,0]);
  }
  // Two layers follow a shallow sweetheart dip, each gathered independently. A dark
  // bias binding shows below the pale, lobed outer tier and on the halter straps.
  const crest=a=>upperEdge(.10*Math.sin(a),.09*Math.cos(a));
  const chestBottom = a=>1.096+.0015*Math.cos(a*17);
  for(const [name,col,step] of [['lower_flounce',BLACK,0],['upper_flounce',WHITE,1],['lace_yoke',LACE,2]]){
    const span=2.05;
    const low=(a)=>{const f=Math.max(0,Math.cos(a)),side=smooth(1.30,2.05,Math.abs(a));return step===0?chestBottom(a)-.003*f-.003*Math.cos(17*a):step===1?chestBottom(a)+.020+.003*Math.sin(17*a+.4)+.012*side:lerp(crest(a),chestBottom(a),.42)+.0015*Math.sin(22*a);};
    frill(name,-span,span,step===2?3:5,96,col,()=>up,(a,v)=>lerp(crest(a)+.0015,low(a),v),
      (a,v)=>.0058+step*.0025+v*(step===2?.006:.014)*(.62+.38*Math.cos(a*17+v*.55)),'akari_swim');
  }
  // Low, gathered waist ruffle over the fully lined swimming briefs.
  const hipTop=a=>waist(.11*Math.sin(a),.10*Math.cos(a))+.001;
  const hipBottom=a=>.825-.025*Math.cos(a)**2-.005*Math.sin(19*a+.6);
  for(const [name,col,short] of [['hip_ruffle',WHITE,false],['hip_waistband',LACE,true]])
    frill(name,-Math.PI,Math.PI,short?2:5,114,col,hipWeight,(a,v)=>lerp(hipTop(a),short?hipTop(a)-.013:hipBottom(a),v),
      (a,v)=>.006+(short?.004:.003)+v*(short?.001:.027*(.76+.24*Math.cos(19*a+v*.7))*v),'akari_skirt');
  function ribbon(name,cc,width,col,wt,group='akari_swim'){
    const parts=[];
    for(const sign of [-1,1]){const rings=[];
      for(let i=0;i<=8;i++){const t=i/8; rings.push({c:add(cc,[sign*width*t,width*(.12*Math.sin(Math.PI*t)+.28*t),-.0005*Math.sin(Math.PI*t)]),u:[-sign*.20,1,0],v:[0,0,1],ru:width*(.075+.27*Math.sin(Math.PI*t*.84)),rv:.0015+.0017*Math.sin(Math.PI*t)});}
      parts.push(loft(rings,6));
      const g=patch(5,2,(u,v)=>[cc[0]+sign*width*(.1+.4*v)+(u-.5)*width*(.21+.035*v),cc[1]-width*(.08+.86*v)+.12*width*v*(u-.5),cc[2]+.001+v*.004]);
      parts.push(g);
    }
    parts.push(ellipsoid(cc,[width*.17,width*.15,.0036],8,4));addPiece(name,merge(parts),col,wt,group,'cloth_frill');
  }
  const mid=torso(0,1.191,.016);ribbon('central_bow',mid,.014,BLACK,()=>up);
  // Choker and descending straps are the black Y-frame of the reference. Sample
  // continuously along the clavicle; a straight line would pass inside the shoulder.
  const neckPoint=(a,y,ease)=>{
    const c=[0,y,-.015],d=[Math.sin(a),0,Math.cos(a)];
    return add(c,mul(d,skin(1,y,c,d,.032)+ease));
  };
  const collar=patch(2,58,(u,v)=>neckPoint(u*TAU,1.294+v*.012,.0022));
  addPiece('halter_collar',collar,BLACK,()=>up,'akari_cord','cloth_frill',[0,1.30,-.015]);
  for(const [sg,side] of [[1,'L'],[-1,'R']]){
    const strap=patch(16,3,(u,v)=>{
      const y=lerp(1.294,1.196,v),a=sg*lerp(.82,.74,v)+(u-.5)*lerp(.20,.088,v);
      return neckPoint(a,y,.0050+.006*v);
    });
    addPiece('halter_'+side,strap,BLACK,()=>up,'akari_cord','cloth_frill',[0,1.24,-.015]);
    const h=torso(sg*1.12,.954,.014);ribbon('hip_tie_'+side,h,.011,BLACK,hipWeight,'akari_cord');
  }
  // Garter is entirely on the right thigh and follows that bone through kicks.
  const thigh=bone('R_UpperLeg'), centreAt=y=>mix3(M.ulR,M.llR,(M.ulR[1]-y)/(M.ulR[1]-M.llR[1]));
  const leg=(a,y,ease)=>{const c=centreAt(y),d=[Math.sin(a),0,Math.cos(a)];return add(c,mul(d,skin(1,y,c,d,.057)+ease));};
  for(const [name,colour,r] of [['garter_frill',LACE,0],['garter_satin',BLACK,1]]){
    const g=patch(r?2:5,80,(u,v)=>{const a=u*TAU,sc=Math.cos(16*a),y=.672+.005*Math.cos(a)+lerp(r?.012:.019,r?-.011:-.020,v)+(r?0:.0027*sc*Math.abs(2*v-1));return leg(a,y,r?.0048:.0025+.003*(.5+.5*sc)*Math.abs(2*v-1));});
    addPiece(name,g,colour,()=>thigh,'akari_wrist','cloth_frill',centreAt(.672));
  }
  // A single off-shoulder cover-up. Joined at the biceps, the open front edges
  // sweep down the flanks into a broad, free back hem. Sleeve cuffs are open.
  const wJ=(side,x)=>wmix(bone(side+'_UpperArm'),bone(side+'_LowerArm'),smooth(.265,.345,Math.abs(x)));
  for(const [sg,side] of [[1,'L'],[-1,'R']]){
    const sleevePosition=(u,v)=>{
      const a=u*TAU,ct=Math.cos(a),st=Math.sin(a),wave=Math.sin(6*a+2.8*v);
      const s=lerp(.185+.013*ct,.472+.009*ct,v),x=sg*s;
      const c=s<Math.abs(M.laL[0])?mix3(M['ua'+side],M['la'+side],(s-.102)/(.308-.102)):mix3(M['la'+side],M['hand'+side],(s-.308)/(.508-.308));
      c[0]=x;const d=[0,ct,st],base=skin(0,x,c,d,.034);
      const ease=.007+.026*v+.013*Math.sin(Math.PI*v)+.009*wave*(.18+.82*v);
      const p=add(c,mul(d,base+ease)); p[1]-=.018*v+.019*Math.sin(Math.PI*v); return p;
    };
    const g=patch(15,44,sleevePosition);
    addPiece('chiffon_sleeve_'+side,g,WHITE,p=>wJ(side,p[0]),'akari_beach_shirt','cloth_voile',[sg*.31,1.21,0]);
    const cuff=patch(2,32,(u,v)=>sleevePosition(u,.955+.045*v));
    addPiece('cuff_'+side,cuff,LACE,p=>wJ(side,p[0]),'akari_beach_shirt','cloth_seam',[sg*.47,1.22,0]);
  }
  const rows=15,cols=76,weights=[];
  const panel=patch(rows,cols,(u,v)=>{
    const a=lerp(-1.86,1.86,u),mag=Math.abs(Math.sin(a)),c=Math.cos(a),back=Math.max(0,c);
    const atHem=.668+.155*(1-back)+.033*Math.sin(3*a+.4)+.019*Math.cos(4*a);
    const atTop=1.203-.104*back**1.3;
    const y=lerp(atTop,atHem,v),wav=Math.cos(6*a+2.6*v+.5*Math.sin(a));
    const size=.007+.010*wav;
    const x=Math.sin(a)*(.176-.026*Math.sin(Math.PI*v)+v*(.047+.021*Math.sin(2*a)) + size*v);
    const z=-.008-c*(.110+.074*v+size*v)-.045*v*v*back-.025*Math.sin(Math.PI*v)*back+ .012*(1-back)**4;
    const pin=(1-back)**2,side=x>0?'L':'R';const wTop=wmix(up,bone(side+'_UpperArm'),pin*(.83-.40*smooth(.85,1,mag)));
    const chain=phys('J_Sec_Hakama_'+(x>0?4:7)+'_01'),wBottom=wmix(hip,chain,.45+.20*mag);
    weights.push(wmix(wTop,wBottom,smooth(.06,.68,v)));
    return [x,y,z];});
  addPiece('billowing_back',panel,WHITE,(_,i)=>weights[i],'akari_beach_shirt','cloth_voile',[0,.93,.025]);
  // Opaque turned hems on the sheer cloth catch the silhouette on light backgrounds.
  const hem=patch(1,cols,(u,v)=>{const j=Math.round(u*cols),p=panel.pos[rows*(cols+1)+j],q=panel.pos[(rows-1)*(cols+1)+j];return mix3(p,q,.11*v);});
  addPiece('shirt_hem',hem,WHITE,(_,i)=>weights[rows*(cols+1)+i%(cols+1)],'akari_beach_shirt','cloth_seam',[0,.93,0]);
  return {skin};
}
export function sandalStraps(wd,side,footGeo,wOf,base,sg,rayNear) {
  const C=wd.C, M=C.M, cx=M['foot'+side][0], white=WHITE;
  const footTop=(x,z)=>{const o=[x,.24,z],h=rayNear(footGeo,o,[0,-1,0]);return h>0?Math.max(base+.003,.24-h+.003):base+.003;};
  const transfer=(g)=>{fixWinding(g,[cx,base,0]);swatchUV(wd,g,white);wd.piece('sandal_strap_'+side,g,g.pos.map(wOf),'cloth_trim',{group:'akari_zori'});};
  const front=grid(5,17,(i,j)=>{const u=j/16,v=i/4, x=cx+(u-.5)*.061,z=.082+.027*(v-.5)-.009*(u-.5)*sg;return {p:[x,footTop(x,z),z],u,v};});
  transfer(front);
  const skin=surfaces(C),parts=[];
  const ankle=(a,y,ease)=>{
    const c=[cx,y,-.021],d=[Math.sin(a),0,Math.cos(a)];
    return add(c,mul(d,skin(1,y,c,d,.027)+ease));
  };
  for(const sign of [-1,1]){
    const strap=grid(23,4,(i,j)=>{
      const t=i/22,u=j/3, a=(sign*sg)*(1.22-4.45*t), y=.054+.105*t+(u-.5)*.009;
      return {p:ankle(a,y,.0045),u,v:t};});
    parts.push(strap);
  }
  transfer(merge(parts));
}
