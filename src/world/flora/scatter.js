// World-space plant communities. A fixed seed keeps individual plants in place through LOD changes.
import * as THREE from 'three';
import { noise2, mulberry32, smoothstep } from '../../core/util.js';
import { FIELD_LIMIT, JOURNEY_POI, journeyIndoor } from '../../data/journey-map.js';
import { TRIAL_LAKE, floodedTrialHeight, trialViewHeight, trialViewOpening } from '../trial-lake.js';
import { plantForestStands } from './forest-stands.js';
import { crownColors, treeCommunity } from './travel-canopy.js';
import { WAYSIDES } from '../../data/waysides.js';
import { bellPaving } from '../../data/bellcrown.js';
import { countryPlan, zoneWeights } from './countryside-plan.js';
import { plantCountryside } from './countryside-scatter.js';
import { landmarkAt } from '../../data/landmarks.js';

export const STRIDE = 16;
const palette = values => values.map(value => new THREE.Color(value).toArray());
const leaves = palette([0x69a04f, 0x92b55a, 0x639451, 0xa5b557, 0x589761]);
const crowns=Object.fromEntries(Object.entries(crownColors).map(([type,colors])=>[type,palette(colors)]));
const petals = palette([0xf2cc62, 0xf1c3aa, 0xbf8bd8, 0xe9a54e, 0xaaccef]);
const undergrowth = palette([0x859a56, 0x789d68, 0x93a76c, 0x739b5e]);
const stone = palette([0xc1bca8, 0xadae9d, 0xc2bcab]);
const neutral = [1, 1, 1];
const broadleaf = ['broad1', 'broad2', 'broad3', 'broad4', 'broad5', 'birch'];
const blossoms = ['flower1', 'flower2', 'flower4'];
const shrubs = ['bush1', 'bush3', 'bushBerry'];
const outcrops = ['boulder3', 'boulder4', 'boulder5', 'cliff1'];

export function scatter(world, density = 1) {
  const result = new Map();
  const random = mulberry32(314159);
  const choose = list => list[Math.floor(random() * list.length)];
  function plant(id, x, z, scale, tones, tilt = .12, mineral = false) {
    const y = world.heightAt(x, z);
    if (y < .1 || journeyIndoor(x, z, 1) || bellPaving(x, z, 1) || world.isReserved(x, z, 1)) return;
    // map round: landmarks keep their ground (a flower valley only loses its trees and rocks)
    const lm = landmarkAt(x, z, 1.5);
    if (lm && (lm.kind !== 'flowerValley' || !/^flower|^fern|^bush/.test(id))) return;
    if (!result.has(id)) result.set(id, []);
    const tint = choose(tones);
    result.get(id).push(x, y - .06, z, random() * 2 * Math.PI, scale,
      (random() - .5) * tilt, (random() - .5) * tilt,
      ...(mineral ? neutral : tint), ...(mineral ? tint : neutral), 0, 0, random());
  }
  // map round: one exact instance (yaw / pitch given), used by the countryside planting
  function put(id, x, z, rot, scale, rgb, o = {}) {
    const y = world.heightAt(x, z);
    if (!o.force && (y < .1 || journeyIndoor(x, z, 1) || bellPaving(x, z, 1) || world.isReserved(x, z, .5) || landmarkAt(x, z, .5))) return false;
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(x, (o.y ?? y) - (o.sink ?? .06), z, rot, scale, o.tx || 0, o.tz || 0,
      ...(o.mineral ? neutral : rgb), ...(o.mineral ? rgb : neutral), 0, 0, random());
    return true;
  }
  const plan = countryPlan(world), zw = [0, 0, 0, 0];
  const pitch = 15;
  for (let iz = -FIELD_LIMIT; iz < FIELD_LIMIT; iz += pitch) {
    for (let ix = -FIELD_LIMIT; ix < FIELD_LIMIT; ix += pitch) {
      const x = ix + random() * pitch, z = iz + random() * pitch;
      const h = world.heightAt(x, z);
      if (h < .1 || h > 260 || journeyIndoor(x, z, 3) || bellPaving(x, z, 3)) continue;
      const road = world.roadDist(x, z);
      if (road < 4) continue;
      const river = world.riverDist(x, z);
      const canopy = noise2(x / 165 + 3, z / 165 - 6);
      const detail = noise2(x / 62, z / 62);
      const forest = Math.hypot(x - JOURNEY_POI.forest.x, z - JOURNEY_POI.forest.z) < 148;
      const wooded = forest || canopy > .23 || (h > 65 && detail > .05);
      const edge = road < 14;
      // map round: open land is composed by the countryside plan (copses, landmark trees, hedgerows, orchards);
      // only a few strays and roadside trees stay random. Fields belong to their crops.
      zoneWeights(x, z, zw);
      const heathW = Math.max(zw[1], zw[2]);
      if (!forest && plan.fieldAt(x, z, 2.5)) continue;
      // natural woods outside the stands gather into groves with glades between them (not an even savanna)
      const clump = forest ? 1 : smoothstep(0, .3, noise2(x / 48 + 31, z / 48 - 17));
      const treeChance = wooded ? (forest ? .47 : .03 + .82 * clump * clump) * (1 - .5 * heathW) : (edge ? .08 : .007) * (1 - .6 * heathW) * (1 - .7 * zw[0]);
      const wayside = WAYSIDES.some(p => Math.abs(x-p.x)<p.radius && Math.abs(z-p.z)<p.radius);
      if (!wayside && road > 7 && !trialViewOpening(x,z) && random() < treeChance * (.7 + .3 * density)) {
        const tree=treeCommunity(x,z,h,river,wooded,forest,random);
        plant(tree.key, x, z, (wooded ? 1.1 : .92) + random() * .76, crowns[tree.type], .07);
        if (wooded && random() < .49) plant('fern1', x + 2, z + 2, .92 + random() * .6, undergrowth);
      }
      if (random() < (.19 + .27 * Number(edge || river < 28 || detail > .1)) * density * (river < 22 ? 1 : 1 - .85 * heathW)) {
        const type = river < 22 ? choose(['reed1','reed2']) : wooded ? 'fern2' : choose(blossoms);
        const colors = type.startsWith('flower') ? petals : undergrowth;
        const count = (wooded ? 4 : 7) + Math.floor(random() * (wooded ? 5 : 9));
        for (let j = 0; j < count; j++) {
          plant(type, x + (random() - .5) * 7, z + (random() - .5) * 4, .82 + random() * .65, colors);
        }
      }
      if (random() < (wooded ? .22 : .11) * density) {
        plant(choose(shrubs), x - 2.8, z + 4, .78 + random() * 1.14, leaves);
      }
      if (wooded && detail < -.25 && random() < .075 * density) {
        plant('logMoss', x, z, .8 + random() * .6, stone, .1, true);
        plant('mushSmall1', x + .8, z + .8, .7 + random() * .4, undergrowth);
      }
      if (road > 10 && random() < ((h > 57 ? .085 : .017) + .05 * zw[2] + .025 * zw[3]) * density) {
        const type = h > 60 && detail > .12 ? choose(outcrops) : choose(['boulder2','moss2']);
        plant(type, x, z, .7 + random() * (h > 60 ? 2.5 : 1.1), stone, .35, true);
      }
    }
  }
  // Fran's clearing is small enough for the trunks and the front door to share a frame.
  // Denser crescent on the north and west; an open wedge joins the house to the lesson lawn.
  const cabin = JOURNEY_POI.forest;
  for (let ring = 0; ring < 4; ring++) {
    const count = 13 + ring * 3;
    for (let i = 0; i < count; i++) {
      const a = (i + random() * .56) * Math.PI * 2 / count;
      const radius = 21 + ring * 9 + random() * 3;
      const x = cabin.x + Math.cos(a) * radius, z = cabin.z + Math.sin(a) * radius;
      if (trialViewOpening(x,z) || (x > cabin.x + 6 && z < cabin.z + 3) || world.roadDist(x,z) < 7) continue;
      plant(choose(broadleaf), x,z, 1.16 + random() * .56, leaves,.05);
      plant(choose(shrubs),x+2.7,z+1.2,.84+random()*.45,undergrowth);
      plant('fern2',x-1.2,z+1.5,.92+random()*.5,undergrowth);
    }
  }
  const lakeGroups=[
    [1817,-60,18,9,'birch',[0x9aba70,0xa4b779]],
    [1661,-102,14,7,'maple1',[0xcb7043,0xd38b45,0xc6a849]],
    [1747,25,11,7,'pine2',[0x456b67,0x53786d]],
    [1618,-31,6,3,'willow2',[0x91ab68,0xa6b978]],
    [1688,87,24,11,'birch',[0xa1b479,0x8eab65]],
    [1796,-189,30,13,'pine1',[0x516d6a,0x486260]],
    [1568,-104,21,11,'maple1',[0xc57a45,0xd4973f]],
    [1888,43,20,10,'willow1',[0x95ae67,0x839e65]]
  ];
  for(const [cx,cz,spread,count,key,pal] of lakeGroups){
    const tones=palette(pal);
    for(let i=0;i<count;i++){
      const a=i*2.4+random()*.38,r=spread*Math.sqrt((i+.25)/count);
      const x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r*.75;
      if(trialViewOpening(x,z) || Math.hypot(x-TRIAL_LAKE.islands[0].x,z-TRIAL_LAKE.islands[0].z)<15 || world.roadDist(x,z)<5)continue;
      plant(key,x,z,1.12+random()*.74,tones,.035);
    }
  }
  // Following a winding shoulder of the road gives successive masses of
  // daisies, yarrow and violet flowers, with quieter patches between them.
  const drifts=[
    [1190,-103,178,58],[810,-152,135,71],[495,-185,165,45],[126,-174,171,57],
    [-251,-225,154,55],[-616,-255,141,63],[-1007,-255,164,56],[-1560,-381,140,66]
  ];
  for(const [cx,cz,rx,rz] of drifts){
    const dominant=choose(blossoms),color=choose(petals);
    for(let n=0;n<62;n++){
      const u=random()*2-1,v=random()*2-1;
      if(u*u+v*v>1)continue;
      const x=cx+u*rx,z=cz+v*rz+Math.sin(u*4)*15;
      const count=7+Math.floor(random()*13);
      for(let j=0;j<count;j++)plant(j%5===0?choose(blossoms):dominant,
        x+(random()-.5)*10,z+(random()-.5)*6,.76+random()*.86,[color]);
    }
  }
  // Sow clusters on the future shore shelves, using their post-collapse height
  // and slope. Their roots stay on the same four islands after the collapse.
  const reeds=palette([0x8f9d6d,0xa0a577,0x899d72]);
  const shoreFoliage=palette([0x76905e,0x849764,0x92a16b]);
  const shoreFlowers=[palette([0xe5bc66,0xf1d594]),palette([0xf0b39a,0xcb92ad]),palette([0xb09ec5,0xe5ceb2]),palette([0xc8dfac,0xe0d0a5])];
  const lakeFloor=(x,z)=>trialViewHeight(x,z,floodedTrialHeight(x,z,world.baseHeightAt(x,z)),true);
  for(const [id,island] of TRIAL_LAKE.islands.entries()){
    let made=0;const want=Math.round((id===0?51:id===3?25:41)*(.65+density*.35));
    for(let j=0;j<want*15 && made<want;j++){
      const angle=random()*Math.PI*2,r=.28+random()*1.41;
      const x=island.x+Math.cos(angle)*r*island.rx,z=island.z+Math.sin(angle)*r*island.rz;
      if(world.roadDist(x,z)<3.8 || id===0&&Math.hypot(x-1818,z+77)<14)continue;
      const h=lakeFloor(x,z);
      if(h<.75||h>island.height-.15)continue;
      const slope=Math.hypot(lakeFloor(x+1,z)-h,lakeFloor(x,z+1)-h);
      if(slope>.89)continue;
      const nearWater=h<1.75;
      const shrub=!nearWater && random()<.45;
      const key=nearWater?choose(['reed1','reed2']):shrub?choose(['bush1','bush3','bushBerry']):choose(['fern1','fern2','flower1','flower4']);
      const colors=key.startsWith('flower')?shoreFlowers[id]:nearWater?reeds:shoreFoliage;
      const count=nearWater?7:shrub?3:7;
      for(let k=0;k<count;k++){
        const dx=x+(random()-.5)*3.3,dz=z+(random()-.5)*2.3;
        if(lakeFloor(dx,dz)<.59||world.roadDist(dx,dz)<3.1)continue;
        plant(key,dx,dz,(shrub?.70:1.08)+random()*(shrub?.48:.69),colors,.08);
      } made++;
    }
  }
  // Use the full stem density even when the grass quality setting is reduced.
  plantForestStands(world,result,STRIDE,
    (tree,x,z,size)=>plant(tree.key,x,z,size,crowns[tree.type],.055),
    (x,z,gap,rng)=>{
      const ox=x+(rng()-.5)*4,oz=z+(rng()-.5)*4;
      if(gap>.44)plant('flower1',ox,oz,.70+rng()*.34,petals);
      else if(rng()<.07)plant('logMoss',ox,oz,.68+rng()*.54,stone,.1,true);
      else plant(rng()<.76?'fern1':'bush3',ox,oz,.53+rng()*.63,undergrowth);
    });
  // Reeds follow two short stretches of contour on each island. Select mild banks
  // by their flooded survey even when the scene initially loads in its dry state.
  for (const island of TRIAL_LAKE.islands) {
    const banks = [];
    for (let i = 0; i < 40; i++) {
      const a = (i + .3) * Math.PI / 20;
      for (let r = .82; r < 1.75; r += .026) {
        const x = island.x + Math.cos(a) * island.rx * r;
        const z = island.z + Math.sin(a) * island.rz * r;
        const h = lakeFloor(x, z);
        if (h < .72 || h > 2.25 || world.roadDist(x, z) < 5) continue;
        const slope = Math.hypot(lakeFloor(x + .5, z) - h, lakeFloor(x, z + .5) - h) * 2;
        banks.push({ x, z, a, score: slope + .55 * Math.abs(h - 1.1) });
      }
    }
    banks.sort((a, b) => a.score - b.score);
    const clumps = [];
    for (const bank of banks) {
      if (clumps.some(p => Math.hypot(p.x - bank.x, p.z - bank.z) < 9)) continue;
      for (let j = -6; j <= 6; j++) {
        const x = bank.x - Math.sin(bank.a) * j * .47;
        const z = bank.z + Math.cos(bank.a) * j * .47;
        if (lakeFloor(x, z) < .55 || lakeFloor(x, z) > 2.65 || world.roadDist(x, z) < 4.2) continue;
        plant(j % 3 === 0 ? 'reed2' : 'reed1', x, z, .90 + .31 * random(), reeds, .06);
      }
      clumps.push(bank);
      if (clumps.length === 2) break;
    }
  }
  try { result.countryside = plantCountryside(world, density, put); } catch (e) { console.error('[flora] countryside', e); }
  return result;
}
