// A passing broom presses a pair of waves into the surface immediately beneath its brush.
// Each station stays in world space. Ballistic droplets land and disturb that same surface.
import * as THREE from 'three';
import { flowAt } from './maps.js';

export const TRAIL_SAMPLES = 26;
const LIFETIME = 1.68;
const smooth = THREE.MathUtils.smoothstep;
const UP = new THREE.Vector3(0, 1, 0);

export class FlightWake {
  constructor(G, water, tier, path, bounds) {
    this.G = G; this.water = water; this.path = path; this.bounds = bounds;
    this.history = []; this.spare = path.map(() => new THREE.Vector4()); this.path.forEach(p => p.w = -1);
    this.capacity = [60, 100, 152][tier]; this.density = [.61, .84, 1][tier];
    this.drops = Array.from({length:this.capacity}, () => ({pos:new THREE.Vector3(), vel:new THREE.Vector3(), size:0, age:0}));
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4),
      new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.82, depthWrite:false, fog:true}), this.capacity);
    this.mesh.name = 'water:skimming droplets';
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = -6;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); G.scene.add(this.mesh);
    this.stamp = new THREE.Object3D(); this.tip = new THREE.Vector3(); this.unit = new THREE.Vector3();
    this.current = new THREE.Vector2();
    this.next = 0; this.seed = 945; this.accum = 0; this.ringCooldown = 0;
    this.total = 0; this.landings = 0; this.rings = 0; this.impacts = 0; this.strength = 0; this.clearance = 0;
  }
  random() { this.seed = (Math.imul(this.seed,1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  // Surface sampling is deferred until a drop is within reach of the crests. A drop
  // which lands on the bank simply stops; only an actual wet landing creates a ring.
  stepDrops(dt) {
    let count = 0;
    this.ringCooldown = Math.max(0, this.ringCooldown - dt);
    for (const d of this.drops) {
      if (!d.size) continue;
      d.age += dt;
      d.pos.x += d.vel.x*dt; d.pos.z += d.vel.z*dt;
      d.pos.y += d.vel.y*dt - 4.905*dt*dt; d.vel.y -= 9.81*dt;
      const drag = Math.exp(-1.05*dt); d.vel.x *= drag; d.vel.z *= drag;
      const nearSurface = d.vel.y < 0 && d.pos.y < this.water.level + .36;
      const surface = nearSurface ? this.water.surfaceAt(d.pos.x,d.pos.z) : -Infinity;
      if (d.age > 2.35 || (nearSurface && (!Number.isFinite(surface) || d.pos.y <= surface))) {
        if (Number.isFinite(surface) && d.vel.y < 0 && d.pos.y <= surface) {
          this.landings++;
          if (!this.ringCooldown && this.water.ripple(d.pos.x,d.pos.z,Math.min(.39,.1+d.size*3))) {
            this.rings++; this.ringCooldown = .085;
          }
        }
        d.size = 0; continue;
      }
      this.unit.copy(d.vel).normalize();
      this.stamp.position.copy(d.pos); this.stamp.quaternion.setFromUnitVectors(UP,this.unit);
      const r = d.size*Math.min(1,.45+d.age*18);
      this.stamp.scale.set(r, r*Math.min(3.3,1.4+d.vel.length()*.31),r);
      this.stamp.updateMatrix(); this.mesh.setMatrixAt(count++,this.stamp.matrix);
    }
    this.mesh.count = count; this.mesh.visible = count>0;
    if (count) {
      this.mesh.instanceMatrix.needsUpdate=true;
      this.mesh.material.color.setHex((this.G.env?.veil??0)>.62?0x8cbacb:0xe3f4ff);
    }
  }
  drop(x,z,vx,vy,vz,radius) {
    const surface = this.water.surfaceAt(x,z);
    if (!Number.isFinite(surface) || this.water.depthAt(x,z)<.055) return;
    const d=this.drops[this.next]; this.next=(this.next+1)%this.capacity;
    d.pos.set(x,surface+.014,z); d.vel.set(vx,vy,vz); d.size=radius; d.age=0; this.total++;
  }
  impact(pos, power=1) {
    const depth=this.water.depthAt(pos.x,pos.z);
    if (depth<=.045) return false;
    const drive=Math.min(1.5,Math.max(.18,power))*smooth(depth,0,.60);
    const n=Math.ceil((12+30*drive)*this.density);
    const phase=this.random()*Math.PI*2;
    for (let j=0;j<n;j++) {
      const a=phase+Math.PI*2*(j+this.random()*.7)/n, r=this.random();
      const dx=Math.cos(a), dz=Math.sin(a), w=(.55+2.45*r)*drive;
      this.drop(pos.x+dx*r*.22,pos.z+dz*r*.22,w*dx,(1.95+this.random()*3.35)*drive,w*dz,.018+r*.037);
    }
    this.water.ripple(pos.x,pos.z,.3+.86*drive); this.impacts++; return true;
  }
  update(dt,t) {
    const P=this.G.player;
    this.stepDrops(dt); this.strength=0;
    // The lower, outer bristle envelope expressed in the flight holder's axes.
    if (P?.onBroom && P.broom.holder.visible) {
      const tip=P.broom.holder.localToWorld(this.tip.set(0,-.09,-.96));
      const surface=this.water.surfaceAt(tip.x,tip.z);
      const current=flowAt(tip.x,tip.z,this.current);
      const vx=P.vel.x-current.x, vz=P.vel.z-current.y;
      const speed=Math.hypot(vx,vz);
      this.clearance=Number.isFinite(surface)?tip.y-surface:Infinity;
      if (Number.isFinite(surface) && this.clearance<1.65 && speed>1.0 && P.speed>1.0) {
        const speedK=smooth(speed,1.0,19.0), shore=smooth(this.water.depthAt(tip.x,tip.z),.065,.83);
        const drive=speedK*(1-smooth(this.clearance,.12,1.65))*shore;
        this.strength=drive;
        if (drive>.012) {
          this.station(tip.x,tip.z,t,drive);
          const spray=speedK*(1-smooth(this.clearance,.22,1.16))*shore;
          this.accum+=dt*(42+115*speedK)*spray*this.density;
          const dx=vx/speed,dz=vz/speed;
          while(this.accum>=1) {
            this.accum--;
            const side=this.random()<.5?-1:1,r=this.random(), spread=side*(.06+.15*r);
            const outward=side*(.8+3.1*r)*Math.sqrt(spray), aft=(.15+.7*this.random())*spray;
            this.drop(tip.x-dz*spread,tip.z+dx*spread,current.x-dz*outward-dx*aft,
              .6+(1.35+2.6*this.random())*Math.sqrt(spray),current.y+dx*outward-dz*aft,.009+r*.020);
          }
        }
      }
    } else this.clearance=Infinity;
    if(this.strength<=.012){this.accum=0;this.linked=false;}
    this.updatePath(t);
  }
  station(x,z,t,drive) {
    const h=this.history;
    if(h.length && (Math.hypot(h.at(-1).x-x,h.at(-1).y-z)>9 || !this.linked)) {
      this.spare.push(...h); h.length=0;
    }
    this.linked=true;
    if(!h.length){h.push(this.spare.pop().set(x,z,t,drive),this.spare.pop().set(x,z,t,drive));return;}
    if(h.length===1)h.push(this.spare.pop().copy(h[0]));
    const a=h[h.length-2],d=Math.hypot(x-a.x,z-a.y);
    h.at(-1).set(x,z,t,drive);
    if(d>=1.05){
      const head=h.length>=TRAIL_SAMPLES?h.shift():this.spare.pop();
      h.push(head.copy(h.at(-1)));
    }
  }
  updatePath(t) {
    const h=this.history;
    while(h.length && t-h[0].z>LIFETIME)this.spare.push(h.shift());
    if(!this.linked && h.length===1)this.spare.push(h.shift());
    let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
    for(let j=0;j<this.path.length;j++){
      const q=this.path[j],v=h[j];
      if(!v){q.w=-1;continue;}
      q.copy(v);x0=Math.min(x0,q.x);x1=Math.max(x1,q.x);z0=Math.min(z0,q.y);z1=Math.max(z1,q.y);
    }
    this.bounds.set(x0-2.5,z0-2.5,x1+2.5,z1+2.5);
    if(!h.length)this.bounds.set(0,0,-1,-1);
  }
  stats(){return {clearance:Number.isFinite(this.clearance)?+this.clearance.toFixed(3):null,strength:+this.strength.toFixed(3),stations:this.history.length,droplets:this.mesh.count,emitted:this.total,returned:this.landings,rings:this.rings,impacts:this.impacts};}
}
