import * as THREE from 'three';

// A metre per texel resolves the two sides of the broom. Sparse world tiles keep
// their flower history when the local GPU window moves on and later comes back.
const TILE = 8;
const N = 112;
const STRIDE = 5; // bend X, bend Z, flattening, stripped fraction, last touch
const REGROW = 76;
const smooth = THREE.MathUtils.smoothstep;
const key = (ix, iz) => (iz + 32768) * 65536 + ix + 32768;
function bendLeft(age) {
  const t = .68 * Math.max(0, age);
  return t > 11 ? 0 : (1 + t) * Math.exp(-t);
}
function petalsLost(age) {
  return 1 - smooth(age, 3, REGROW);
}

export const plantWake = {
  gMeadowMemory: {value:null},
  gMeadowBounds: {value:new THREE.Vector3()},
};
export const plantWakeGLSL = /* glsl */`
uniform sampler2D gMeadowMemory;
uniform vec3 gMeadowBounds;
// xy = sideways lean, z = flattening, w = missing flower petals.
vec4 plantWakeAt(vec2 root) {
  vec2 local = root - gMeadowBounds.xy;
  if (any(lessThan(local,vec2(.5))) || any(greaterThan(local,vec2(gMeadowBounds.z-.5)))) return vec4(0.);
  vec4 m = textureLod(gMeadowMemory,local/gMeadowBounds.z,0.);
  return vec4((m.rg*255.-128.)/127.,m.ba);
}
`;

export class MeadowWakeField {
  constructor() {
    this.tiles = new Map();
    this.bounds = new THREE.Vector3();
    this.blank = new Uint8Array(N*N*4);
    for (let i=0;i<this.blank.length;i+=4) this.blank[i]=this.blank[i+1]=128;
    this.texture = new THREE.DataTexture(this.blank.slice(),N,N,THREE.RGBAFormat);
    this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;
    this.texture.generateMipmaps=false;
    this.texture.needsUpdate=true;
    this.lastRefresh=-Infinity;
    this.hasInk=false;
  }
  // Stamp only the ground between consecutive recorded cross sections. Release
  // scales with the petals still on each square metre before this pass.
  sweep(fromX,fromZ,s,survey,release) {
    const force=s.drive*(1-smooth(s.clearance,.65,4.8));
    if(s.bare || force<.025) return;
    const run=Math.hypot(s.x-fromX,s.z-fromZ);
    if(run<.05) return;
    const dx=(s.x-fromX)/run, dz=(s.z-fromZ)/run;
    const radius=1.65+3.0*force;
    const reach=radius*(1+.38*Math.abs(s.turn))+1;
    const minX=Math.floor(Math.min(fromX,s.x)-reach),maxX=Math.ceil(Math.max(fromX,s.x)+reach);
    const minZ=Math.floor(Math.min(fromZ,s.z)-reach),maxZ=Math.ceil(Math.max(fromZ,s.z)+reach);
    for(let iz=minZ;iz<=maxZ;iz++) for(let ix=minX;ix<=maxX;ix++) {
      const x=ix+.5,z=iz+.5, rx=x-fromX,rz=z-fromZ;
      const along=rx*dx+rz*dz;
      if(along<-.5 || along>run+.5) continue;
      const lateral=rz*dx-rx*dz;
      const side=Math.sign(lateral),bank=1+.38*s.turn*side;
      const width=radius*bank;
      const cross=1-smooth(Math.abs(lateral),.13*width,width);
      if(cross<.01)continue;
      // Adjacent stamps feather into one another over one texel.
      const seam=smooth(along,-.5,.5)*(1-smooth(along,run-.5,run+.5));
      const pressure=Math.min(1,force*cross*(1+.18*s.turn*side))*seam;
      if(pressure<.025 || !survey(x,z)) continue;
      const tx=Math.floor(ix/TILE),tz=Math.floor(iz/TILE),id=key(tx,tz);
      let tile=this.tiles.get(id);
      if(!tile) {
        tile={ix:tx*TILE,iz:tz*TILE,data:new Float32Array(TILE*TILE*STRIDE),time:s.time};
        this.tiles.set(id,tile);
      }
      tile.time=s.time;
      const data=tile.data,i=((iz-tile.iz)*TILE+ix-tile.ix)*STRIDE;
      const age=s.time-data[i+4],bend=bendLeft(age);
      const oldStrip=data[i+3]*petalsLost(age);
      const loss=(1-oldStrip)*Math.min(.98,pressure*(.40+.68*force));
      const fan=Math.max(-1,Math.min(1,lateral*1.8))*bank;
      const k=Math.min(1,pressure*1.65);
      data[i]=THREE.MathUtils.clamp(data[i]*bend*(1-k)+pressure*(dx*.25-dz*fan),-1,1);
      data[i+1]=THREE.MathUtils.clamp(data[i+1]*bend*(1-k)+pressure*(dz*.25+dx*fan),-1,1);
      data[i+2]=Math.min(.95,Math.max(data[i+2]*bend,pressure*.93));
      data[i+3]=oldStrip+loss;
      data[i+4]=s.time;
      release?.(x,z,side,pressure,loss);
    }
  }
  at(x,z,time) {
    const ix=Math.floor(x),iz=Math.floor(z),tile=this.tiles.get(key(Math.floor(ix/TILE),Math.floor(iz/TILE)));
    if(!tile) return {x:0,z:0,flat:0,strip:0};
    const data=tile.data,i=((iz-tile.iz)*TILE+ix-tile.ix)*STRIDE,age=time-data[i+4];
    const b=bendLeft(age);
    return {x:data[i]*b,z:data[i+1]*b,flat:data[i+2]*b,strip:data[i+3]*petalsLost(age)};
  }
  refresh(x,z,time) {
    if(time-this.lastRefresh<.075 && time>=this.lastRefresh) return;
    this.lastRefresh=time;
    if(!this.tiles.size && !this.hasInk) return;
    const x0=Math.floor(x/TILE)*TILE-N/2,z0=Math.floor(z/TILE)*TILE-N/2;
    const image=this.texture.image.data;
    image.set(this.blank);
    let ink=false;
    for(const [id,tile] of this.tiles) {
      if(time-tile.time>=REGROW || time<tile.time) {this.tiles.delete(id);continue;}
      const u=tile.ix-x0,v=tile.iz-z0;
      if(u<0 || v<0 || u>=N || v>=N) continue;
      ink=true;
      const data=tile.data;
      for(let j=0;j<TILE;j++) for(let k=0;k<TILE;k++) {
        const i=(j*TILE+k)*STRIDE;
        if(data[i+3]===0) continue;
        const age=time-data[i+4], b=bendLeft(age),base=((v+j)*N+u+k)*4;
        image[base]=128+Math.round(127*data[i]*b);
        image[base+1]=128+Math.round(127*data[i+1]*b);
        image[base+2]=Math.round(255*data[i+2]*b);
        image[base+3]=Math.round(255*data[i+3]*petalsLost(age));
      }
    }
    this.bounds.set(x0,z0,ink?N:0);
    if(ink || this.hasInk) this.texture.needsUpdate=true;
    this.hasInk=ink;
  }
}
