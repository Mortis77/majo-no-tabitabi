// Atlas paint for foliage. The masks remain continuous at low mip levels while the
// smaller connected groups describe individual twigs and leaves in a close view.
export const crownPlane = /* glsl */`
vec3 crownPlane(vec3 cluster, vec3 hue, vec3 core) {
  float outside = smoothstep(0.13,1.10,length(cluster));
  float top = smoothstep(-0.73,0.78,cluster.y + 0.18*cluster.x - 0.12*cluster.z);
  return hue * mix(0.75,1.0,outside) * mix(0.70,1.09,top) * mix(core,vec3(1.0),0.28+0.68*top);
}`;

export const canopyPigment = /* glsl */`
vec3 canopyPigment(float pigment) {
  float warm = smoothstep(0.37, 0.86, pigment);
  return mix(vec3(0.64,0.92,1.46), vec3(1.14,1.06,0.85), warm) * (0.47 + 0.81*pigment*pigment);
}`;

function spray(c, x, y, length, width, tilt, fill, rnd, teeth = 6) {
  c.save();
  c.translate(x,y); c.rotate(tilt); c.fillStyle = fill;
  c.beginPath(); c.moveTo(-length * 0.46, width * 0.22);
  // Each side has its own leaf ends and notches. They read as one patch of paint at a distance.
  for (const side of [-1,1]) {
    for (let j=0;j<teeth;j++) {
      const u = (side < 0 ? j + 0.45 : teeth - j - 0.40) / teeth;
      const widthHere = width * (0.28 + 0.72*Math.sin(Math.PI*u));
      const px = length * (u - 0.48);
      c.lineTo(px - length*0.025, side*widthHere*(0.45+0.20*rnd()));
      c.quadraticCurveTo(px+length*0.035, side*widthHere*(0.86+0.11*rnd()),
        px+length*(0.07+0.028*rnd()),side*widthHere*(0.89+0.22*rnd()));
    }
    if (side<0) c.lineTo(length*0.59,-width*0.14);
  }
  c.closePath();c.fill();c.restore();
}

function leafMark(c,x,y,length,width,tilt,color) {
  c.save(); c.translate(x,y); c.rotate(tilt); c.fillStyle=color;
  c.beginPath(); c.moveTo(-length*.48,0);
  c.quadraticCurveTo(-length*.07,-width,length*.58,-width*.13);
  c.quadraticCurveTo(length*.01,width,-length*.48,0);
  c.fill(); c.restore();
}

export function paintBroadCrown(c,rnd,col) {
  // Three slanting forks share a deep middle. Irregular open ends make the gaps
  // between neighbouring clusters legible even after the texture is minified.
  const groups=[
    [74,153,98,28,-.26],[130,138,109,31,-.12],[184,124,80,24,-.40],
    [60,119,73,22,-.59],[101,99,91,30,-.37],[152,90,78,27,-.18],
    [85,73,61,17,-.79],[134,65,75,20,-.42],[194,101,53,15,-.60]
  ];
  for(const [x,y,l,w,a] of groups) {
    for(const side of [-1,1]) {
      const bx=x+side*l*.35, by=y-w*.40;
      const branchColor=col(.48+.22*rnd());
      for(let i=0;i<5;i++){
        const tilt=(side<0?-2.50:-.60)+(i-2)*.29+.18*rnd();
        const stem=8+6*rnd();
        leafMark(c,bx+Math.cos(tilt)*stem,by+Math.sin(tilt)*stem,17+11*rnd(),5+3*rnd(),tilt,branchColor);
      }
    }
  }
  for(const [x,y,l,w,a] of groups)
    spray(c,x,y+5,l*1.17,w*1.12,a,col(.35+.075*rnd()),rnd,8);

  // Sun falls across the whole branch. Avoid an individual outline or a
  // concentric highlight for each tuft. Broken patches continue across forks.
  for(const [x,y,l,w,a] of groups) {
    const sun=1-y/215, shade=col(.51+.12*sun+.07*rnd());
    spray(c,x-l*.16,y-w*.04,l*.84,w*.65,a-.27,shade,rnd,7);
    spray(c,x+l*.25,y-w*.37,l*.49,w*.44,a+.18,shade,rnd,5);
  }
  for(const [x,y,l,w,a] of groups) {
    const sun=(1-y/215)*.12;
    if(y<120 || x<100) {
      const startX=x-l*.30, startY=y-w*.58;
      for(let i=0;i<3;i++) {
        const px=startX+i*l*.13, py=startY-w*.07*i;
        const tone=col(.64+sun+.13*rnd(),1,.13);
        leafMark(c,px,py,l*(.27+.20*rnd()),w*(.21+.22*rnd()),a-.23+.44*rnd(),tone);
        leafMark(c,px+6,py-4,13+8*rnd(),3+2*rnd(),a-.78,tone);
      }
    }
    // A few deeper seams underneath the fork edge keep the lit scraps connected.
    for(let i=0;i<3;i++)
      leafMark(c,x+(rnd()-.4)*l,y+(.15+.39*rnd())*w,11+12*rnd(),3+2*rnd(),a+.53*rnd(),col(.36+.08*rnd()));
  }
}

export function paintConiferSpray(c,rnd,col,cedar=false) {
  const bark=col(.35,.91);
  const line=(x,y,ex,ey,width,tint)=>{
    c.strokeStyle=tint;c.lineWidth=width;c.beginPath();c.moveTo(x,y);
    c.quadraticCurveTo((x+ex)/2, (y+ey)/2+3, ex,ey);c.stroke();
  };
  c.lineCap='round';
  const spine=t=>[8+t*232,136-14*Math.sin(Math.PI*t)+9*t*t];
  const origin=spine(0),tip=spine(1);line(...origin,...tip,4.2,bark);
  const n=cedar?8:7;
  // Deep groups overlap along the midrib. The long outer tips remain separate.
  for(let layer=0;layer<5;layer++) {
    const u=layer/5;
    spray(c,48+u*199,132-13*Math.sin(u*Math.PI),89-28*u,35-16*u,
      -.09+.2*u,col(.38+.09*u),rnd,8);
    spray(c,43+u*202,123-11*Math.sin(u*Math.PI),75-26*u,19-8*u,
      -.12+.18*u,col(.55+.09*u),rnd,7);
  }
  for(const side of [-1,1]) {
    for(let j=0;j<n;j++){
      const t=.03+(.80/n)*(j+.23*rnd());
      const [x,y]=spine(t);
      const arm=(cedar?90:83)*(1-.51*t)*(.82+.30*rnd());
      const a=side*(.82+.23*Math.sin(t*Math.PI)-.19*t+.15*rnd());
      const ex=x+arm*Math.cos(a),ey=y+arm*Math.sin(a);
      line(x,y,ex,ey,3.0-1.2*t,bark);
      const tone=.35+.16*t+.085*(side<0)+.07*rnd();
      // A hanging spray splits into fine serrations at its edge and warm, shorter tips on its lit ridge.
      spray(c,x+.53*(ex-x),y+.52*(ey-y),arm*1.16,cedar?17:20,a,col(tone),rnd,8);
      spray(c,x+.63*(ex-x),y+.61*(ey-y)-3,arm*.80,cedar?10.7:12.2,a+.06*side,col(tone+.16),rnd,7);
      spray(c,x+.77*(ex-x),y+.78*(ey-y)-5,arm*.38,4.1,a+.09*side,col(tone+.25,1,.18),rnd,5);
    }
  }
  spray(c,218,134,54,11,.08,col(.63),rnd,8);
  spray(c,229,131,30,4.7,.06,col(.77,1,.22),rnd,5);
}
