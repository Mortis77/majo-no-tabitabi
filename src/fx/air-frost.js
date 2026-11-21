// Parametric meshes on the existing instanced FX grid. Y is the cast direction
// for an air ribbon and the growth axis for a crystal. No camera-facing basis.
import {Vector3} from 'three';

export const airFrostVertex = /* glsl */`
  } else if(kind==7) {
    float angle=i7.w+i3.w*u+i9.z*age;
    vec3 radial=X*cos(angle)+Z*sin(angle), tangent=-X*sin(angle)+Z*cos(angle);
    float tip=pow(max(0.,sin(3.14159265*u)),.65);
    float r=i3.y*(.23+.77*u)*s;
    float width=i3.x*tip*(2.*v-1.);
    p=Y*(i3.z*(.59*t+.57*u)*s)+radial*(r+.2*i3.x*tip*sin(v*3.141593))
       +(Y*.78+tangent*.30+radial*.36)*width;
    n=normalize(radial*.86-tangent*.28+Y*.17);
  } else if(kind==8) {
    // A pointed foot, straight barrel, eight planar faces and a broken tip.
    float seg=u*8., a0=i7.w+floor(seg)*.78539816, a1=a0+.78539816;
    vec3 lo=X*cos(a0)+Z*sin(a0), hi=X*cos(a1)+Z*sin(a1);
    vec3 facet=mix(lo,hi,fract(seg));
    float barrel=min(min(v/.19,1.),(1.-v)/.34);
    float rise=min(1.,t*5.);
    p=facet*(i3.x*s*barrel)+Y*(v*i3.z*s*rise)+X*(i3.x*.38*v*v);
    n=normalize(lo+hi+Y*(v>.65?.9:v<.2?-.7:0.));
`;

export const airFrostFragment=/* glsl */`
  if(kind>6.5 && kind<7.5) {
    float rim=smoothstep(.68,.94,abs(2.*v-1.));
    float thread=smoothstep(.89,.99,abs(2.*v-1.))*.83;
    float ribbon=smoothstep(e,e+.12,.26+.59*n+.24*sin(u*3.14159));
    alpha=ribbon*(vBody+.23*rim);
    col=mix(vA.rgb,vB.rgb,rim*.62+thread*.38);
  } else if(kind>7.5 && kind<8.5) {
    float fa=floor(min(.99999,u)*8.);
    float face=.04+.31*(.5+.5*cos(fa*.785398+1.45))+.09*step(.65,v);
    float edge=1.-smoothstep(.015,.085,min(fract(u*8.),1.-fract(u*8.)));
    float seam=1.-smoothstep(.0,.025,min(abs(v-.20),abs(v-.66)));
    float fracture=pow(max(0.,1.-t1.b),5.)*.40;
    col=mix(vA.rgb,vB.rgb,clamp(face+.35*edge+.18*seam+fracture,0.,1.));
    alpha=smoothstep(e,e+.10,.27+.56*n+.22*(1.-v))*(vBody+.12*edge);
  } else `;

const TAU=Math.PI*2, up=new Vector3(),point=new Vector3();
export function airFrostKit({add,quality}) {
  return {
    windWake(pos,dir,len,r,{dur=.70}={}) {
      const count=quality()<.65?2:3;
      for(let i=0;i<count;i++) {
        add({kind:'windRibbon',pos,up:dir,
          r0:r*(i===0?.19:.095),r1:r*(i===0?1.05:.77),h:len,
          start:i*TAU/count-.35,span:4.4+i*.7,wobble:4.6,
          delay:i*.028,dur:dur*(1-.06*i),grow:[.41,1],erode:[-.15,.87],
          tex:'streak',tile:[1.4,1.1],scroll:[-1.2,0],color:i===0?0x53bfa6:0x8bdbc0,color2:0xf0ffed,
          mode:'sheet',core:.78,add:.18,body:i===0?.68:.50,I:1.13});
      }
    },
    frostBloom(pos,r,h,{dur=1.05}={}) {
      const count=quality()<.65?4:7, phase=Math.random()*TAU;
      for(let i=0;i<count;i++) {
        const a=phase+i*2.399963, center=i===0, span=center?.06:(i%2?.51:.90);
        const spread=center?.09:(.38+.38*span), height=h*(center?1.15:(i%2?.81:.58));
        up.set(Math.sin(a)*spread,1,Math.cos(a)*spread).normalize();
        point.copy(pos);point.x+=Math.sin(a)*r*span;point.z+=Math.cos(a)*r*span;point.y-=.07*h;
        add({kind:'frostPrism',pos:point,up,h:height,r0:height*(center?.20:.16),start:a,
          dur:dur*(center?1:.85),delay:span*.13,grow:[.53,1],erode:[-1.3,.95],
          tex:'cells',tile:[1.2,1],color:0x1e68a8,color2:0xbaf4ff,core:1,body:.90,add:.06,I:1.10});
      }
    }
  };
}
