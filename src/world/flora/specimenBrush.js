// Leaf sprays occupy a whole atlas tile. Colour is provided by the tree instance;
// the atlas stores painted value, stem/leaf mix, the tip mask, and real cut-out space.
function blade(c, col, x, y, angle, length, width, value, kind) {
  c.save();
  c.translate(x,y); c.rotate(angle);
  c.fillStyle=col(value,1,.16);
  c.beginPath(); c.moveTo(0,0);
  if (kind==='maple') {
    // The petiole joins the five lobes at a common palm. The two basal lobes turn toward it.
    for (const [u,v] of [[-.34,-.16],[-.59,-.43],[-.39,-.42],[-.53,-.83],[-.28,-.66],[-.18,-.60],[-.16,-.78],[0,-1.13],[.15,-.78],[.14,-.62],[.37,-.81],[.52,-.91],[.43,-.54],[.35,-.46],[.61,-.49],[.45,-.26],[.26,-.14]]) c.lineTo(u*width,v*length);
  } else {
    // Broad, triangular birch blade with a drawn point and small serrations.
    for(const [u,v] of [[-.32,-.11],[-.48,-.32],[-.40,-.33],[-.49,-.46],[-.39,-.48],[-.40,-.59],[-.23,-.68],[0,-1.05],[.21,-.71],[.33,-.60],[.29,-.55],[.43,-.47],[.38,-.42],[.45,-.32],[.32,-.14]]) c.lineTo(u*width,v*length);
  }
  c.closePath();c.fill();
  c.fillStyle=col(Math.min(1,value+.10),1,.32);
  c.beginPath();c.moveTo(0,0);c.lineTo(0,-length*(kind==='maple'?1.12:1.03));c.lineTo(width*.055,-length*.53);c.closePath();c.fill();
  if(kind==='maple'){
    c.strokeStyle=col(Math.max(.26,value-.09),1,0);c.lineWidth=.9;
    for(const side of [-1,1]){c.beginPath();c.moveTo(0,0);c.lineTo(side*width*.43,-length*.72);c.stroke();}
  }
  c.restore();
}
export function deciduousSpray(c,r,col,kind) {
  // Three offset growth points and a separate back fork leave sky between neighbouring sprays.
  const forks=kind==='maple'?[[115,218,39,165],[116,217,107,90],[120,215,214,142],[117,203,58,102],[121,201,180,63],[118,159,116,54]]:[[111,223,36,132],[112,219,104,76],[115,204,198,95],[111,188,164,51],[110,165,64,59]];
  for(const [x0,y0,x1,y1] of forks){
    c.strokeStyle=col(.34,.36,0);c.lineWidth=kind==='maple'?3.4:2.8;c.beginPath();c.moveTo(x0,y0);c.quadraticCurveTo(x0+(x1-x0)*.38,y0+(y1-y0)*.62,x1,y1);c.stroke();
    const along=Math.atan2(x1-x0,y0-y1);
    for(let i=0;i<5;i++){
      const t=.18+i*.155, side=i%2?1:-1,j=(r()-.5)*7;
      const x=x0+(x1-x0)*t+j, y=y0+(y1-y0)*t;
      const L=(kind==='maple'?51:40)*(.8+.26*r())*(1-.23*t), a=along+side*(.61+.42*r());
      const value=.57+.17*(1-y/256)+.11*r();
      blade(c,col,x,y,a,L,L*(kind==='maple'?1.14:.96),value,kind);
    }
    blade(c,col,x1,y1,along,kind==='maple'?40:35,kind==='maple'?43:32,.82+.12*r(),kind);
  }
}
export function willowSpray(c,r,col){
  // Three tapered pendants branch above the visible leaf clusters. Their tips end at different heights.
  for(const [bx,ex,L] of [[113,32,202],[124,98,246],[130,196,197],[157,226,142],[133,147,223]]){
    const curl=(r()-.5)*18;
    const at=t=>[bx+(ex-bx)*Math.sin(t*1.54)+curl*Math.sin(t*3.14),4+t*L];
    c.strokeStyle=col(.42,.64,0);c.lineWidth=2.7;c.beginPath();
    for(let j=0;j<=10;j++){const p=at(j/10);j?c.lineTo(...p):c.moveTo(...p);}c.stroke();
    for(let j=0;j<12;j++){
      const t=.06+j*.078, [x,y]=at(t);const side=j%2?1:-1;
      const w=(4.9+.9*r())*(1-.5*t),len=(32+10*r())*(1-.44*t),fall=len*(.7+.28*r());
      c.fillStyle=col(.66+.21*r()-.12*t,1,.22+t*.31);c.beginPath();c.moveTo(x,y);
      c.bezierCurveTo(x+side*w*2,y+1,x+side*(len*.55+w),y+fall*.7,x+side*len*.57,y+fall);
      c.quadraticCurveTo(x+side*len*.19,y+fall*.62,x,y);c.fill();
    }
  }
}

export function birchSurface(canvas,random){
  const c=canvas.getContext('2d'),size=canvas.width;
  const shade=n=>'rgb('+n+',255,0)';
  c.fillStyle=shade(193);c.fillRect(0,0,size,size);
  // Broad changes in paper tone follow the bark's circumference. Short horizontal pores
  // interrupt peeling bands, while larger, darker branch scars are part of the mesh.
  for(let j=0;j<158;j++){
    const x=random()*size,y=random()*size;
    const broad=j<33, w=broad?21+random()*63:2+random()*23;
    const h=broad?.5+random()*2.2:.55+random()*1.25;
    c.fillStyle=shade(Math.round(broad?169+random()*41:54+random()*92));
    for(const offset of [-size,0,size]){
      const a=x+offset;c.beginPath();c.moveTo(a-w*.50,y);
      c.quadraticCurveTo(a-w*.15,y-h*.85,a+w*.21,y-h*.48);c.lineTo(a+w*.5,y+h*.22);
      c.quadraticCurveTo(a-w*.07,y+h*.30,a-w*.5,y);c.fill();
    }
  }
}
