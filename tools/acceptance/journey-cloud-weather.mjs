// Sample the live sky MRT at one world location across saved weather-front times.
// MV_JOURNEY_QA keeps the report and representative game frames for visual inspection.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, serveGame } from '../../build.mjs';
import { launch, TMP } from '../cdp.mjs';
import { CITY } from '../../src/data/journey-map.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(process.env.MV_JOURNEY_QA||path.join(TMP,'journey-cloud-weather'));
const quality=process.env.MV_QUALITY||'high';
await fs.mkdir(output,{recursive:true});
const bundle=await build({});
if(!bundle.ok)throw Error(bundle.errors);
const {url,server}=await serveGame({getBuild:async()=>bundle});
let page;
try{
  page=await launch({width:1280,height:800});
  const errors=[];
  page.on('Runtime.consoleAPICalled',m=>{if(m.type==='error')errors.push(m.args.map(a=>a.value??a.description).join(' ').slice(0,900));});
  page.on('Runtime.exceptionThrown',m=>errors.push(m.exceptionDetails.exception?.description??m.exceptionDetails.text));
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:await fs.readFile(path.join(root,'tools/trailer/clock.js'),'utf8')});
  await page.goto(url+'?autostart=1&quality='+quality+'&pr=1&mute=1&dynres=0');
  const deadline=Date.now()+150000;
  while(!await page.evaluate('window.__mvReady===true && window.__rigClock.mode==="virtual"')){
    if(Date.now()>deadline)throw Error('cloud weather boot timed out');
    await new Promise(r=>setTimeout(r,100));
  }
  const result=await page.evaluate('('+survey.toString()+')('+JSON.stringify(CITY)+')',{timeout:180000});
  for(const [name,uri] of Object.entries(result.photos))await fs.writeFile(path.join(output,name+'.jpg'),Buffer.from(uri.split(',')[1],'base64'));
  delete result.photos;
  result.renderErrors=errors;
  result.quality=quality;
  await fs.writeFile(path.join(output,'weather.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  if(errors.length||result.failures.length||result.errors.length)process.exitCode=1;
}finally{await page?.close();server.close();}
process.exit(process.exitCode||0);

async function survey(city){
  const G=window.__game,T=window.__T,clock=window.__rigClock;
  const dome=G.sys.sky.state.dome, renderer=G.renderer, rt=dome.lowRT;
  const U=dome.uniforms, toFloat=G.THREE.DataUtils.fromHalfFloat, camera=G.camera;
  const photos={},samples=[],failures=[];
  const check=(condition,reason)=>{if(!condition)failures.push(reason);};
  const round=n=>+n.toFixed(4);
  const style=document.createElement('style');style.textContent='.mv-ui,.mv-ui *{visibility:hidden!important}';document.head.appendChild(style);
  T.teleport(city.x+52,city.z+123,G.world.groundAt(city.x+52,city.z+123)+.05);
  const render=G.renderFrame.bind(G);
  const cityView=()=>T.cam(city.x+53,205,city.z+149,city.x-7,45,city.z-18);
  cityView();
  await clock.step(40);

  // One read of the native cloud-opacity attachment. World geometry, shadows, colour grading
  // and brightness cannot bias these measurements.
  function read(){
    const data=new Uint16Array(rt.width*rt.height*4), grid=[];
    renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,data,0,1);
    for(let y=0;y<48;y++)for(let x=0;x<80;x++){
      const i=Math.floor((y+.5)*rt.height/48)*rt.width+Math.floor((x+.5)*rt.width/80);
      grid.push(toFloat(data[4*i+3]));
    }
    return grid;
  }
  const average=arr=>arr.reduce((sum,n)=>sum+n,0)/arr.length;
  const density=grid=>({
    mean:round(average(grid)),dense:round(grid.filter(v=>v>.75).length/grid.length),clear:round(grid.filter(v=>v<.18).length/grid.length)
  });
  function sample(t,photo){
    // Advance the actual weather integrator to equilibrium at this saved play time.
    // Keep the game camera, scene fog, sky pass and cloud shader in their normal production path.
    G.state.playTime=t;
    G.sys.sky.update(120,120);
    render();
    if(photo)photos[photo]=renderer.domElement.toDataURL('image/jpeg',.92);
    const grid=read();
    const q=G.journeyWeather.state;
    return {grid,stats:{t,cover:round(q.cover),rain:round(q.rain),strength:round(U.mvCloudPocket.value.z),
      flow:U.mvCloudFlow.value.toArray().map(round),shape:U.mvCloudShape.value.toArray().map(round),...density(grid)}};
  }
  const moments=[0,24,48,72,96,120,144,168,192,216,240,264,288,312,336,360,384,408];
  let broken=null;
  for(const t of moments){
    const row=sample(t);
    samples.push(row.stats);
    if(!broken||Math.abs(row.stats.mean-.5)<Math.abs(broken.mean-.5))broken=row.stats;
  }
  const phases=[['clear',samples.reduce((a,b)=>a.mean<b.mean?a:b)],['broken',broken],['thick',samples.reduce((a,b)=>a.mean>b.mean?a:b)]];
  for(const [name,slot] of phases)sample(slot.t,name);
  const first=sample(broken.t), second=sample(broken.t+1), third=sample(broken.t+12), replay=sample(broken.t);
  const delta=(a,b)=>round(average(a.map((v,i)=>Math.abs(v-b[i]))));
  const motion={afterOneSecond:delta(first.grid,second.grid),afterTwelveSeconds:delta(first.grid,third.grid),replay:delta(first.grid,replay.grid)};
  check(motion.afterTwelveSeconds>.012 && motion.afterOneSecond<motion.afterTwelveSeconds,'cloud silhouettes did not move progressively');
  check(motion.replay<.001,'cloud mask changed when replaying the same weather/time');
  check(phases[2][1].mean-phases[0][1].mean>.22,'the open and deep cloud periods were too similar');

  // Sample the same vertical rays twice, once with the warm roofs/plateau's contribution,
  // then with only the regional front. A central 70m square covers the city blocks;
  // the perimeter lies outside the plateau and includes trees, hills and open country.
  camera.position.set(city.x,352,city.z+.001);
  camera.lookAt(city.x,0,city.z);
  camera.updateMatrixWorld();
  const top=[];
  for(const row of [...samples,{t:168,storm:true}]){
    G.state.playTime=row.t;
    if(row.storm)G.sky.setWeather({cloud:1,rain:1});
    G.sys.sky.update(120,120);
    G.sys.sky.render();
    const withPocket=read(),strength=U.mvCloudPocket.value.z;
    U.mvCloudPocket.value.z=0;
    dome.renderLow(renderer,camera,G.post.enabled?G.sys.sky.state.pipe.size:null);
    const without=read();
    U.mvCloudPocket.value.z=strength;
    const core=[],rim=[];
    for(let y=0;y<48;y++)for(let x=0;x<80;x++){
      const difference=without[80*y+x]-withPocket[80*y+x];
      if(Math.abs(x-39.5)<7&&Math.abs(y-23.5)<7)core.push(difference);
      if(x<5||x>74)rim.push(difference);
    }
    top.push({t:row.t,storm:!!row.storm,strength:round(strength),coreRelief:round(average(core)),perimeterRelief:round(average(rim))});
  }
  check(Math.max(...top.map(q=>q.coreRelief))>.13,'city air did not open a visible window over the rooftops');
  check(top.some(q=>q.strength===0&&Math.abs(q.coreRelief)<.001),'a heavy front failed to close the local window');
  check(Math.max(...top.map(q=>Math.abs(q.perimeterRelief)))<.05,'the dry pocket spread into the distant cloud bank');
  G.sky.setWeather({cloud:null,rain:0});
  T.cam();
  return {city,samples,phases:Object.fromEntries(phases.map(([k,v])=>[k,v.t])),motion,localPocket:top,photos,failures,errors:T.errors()};
}
