// An ordinary broom climbs through an actual daytime cloud, turns to look down, and descends into it again.
// Set MV_JOURNEY_QA to retain the five camera views and the measured altitude / optical-depth report.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,serveGame} from '../../build.mjs';
import {launch,TMP} from '../cdp.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(process.env.MV_JOURNEY_QA||path.join(TMP,'journey-cloud-flight'));
const quality=process.env.MV_QUALITY||'high';
const overcast=process.env.MV_CLOUD_WEATHER==='overcast';
await fs.mkdir(output,{recursive:true});
const bundle=await build({});
if(!bundle.ok)throw new Error(bundle.errors);
const {url,server}=await serveGame({getBuild:async()=>bundle});
let page;
try{
  page=await launch({width:1440,height:900});
  const renderErrors=[];
  page.on('Runtime.consoleAPICalled',m=>{if(m.type==='error')renderErrors.push(m.args.map(a=>a.value??a.description).join(' ').slice(0,900));});
  page.on('Runtime.exceptionThrown',m=>renderErrors.push(m.exceptionDetails?.exception?.description||m.exceptionDetails?.text));
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:await fs.readFile(path.join(root,'tools/trailer/clock.js'),'utf8')});
  await page.goto(url+'?autostart=1&quality='+quality+'&pr=1&mute=1&dynres=0');
  const deadline=Date.now()+150000;
  while(!(await page.evaluate('window.__mvReady===true&&window.__rigClock.mode==="virtual"'))){
    if(Date.now()>deadline)throw Error('cloud flight boot timed out');
    await new Promise(r=>setTimeout(r,150));
  }
  const result=await page.evaluate('('+ride.toString()+')('+JSON.stringify(overcast)+')',{timeout:240000});
  for(const [name,data] of Object.entries(result.photos)){
    await fs.writeFile(path.join(output,name+'.jpg'),Buffer.from(data.split(',')[1],'base64'));
  }
  delete result.photos;
  result.quality=quality;result.weather=overcast?'overcast':'ordinary';result.renderErrors=renderErrors;
  await fs.writeFile(path.join(output,'flight.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  if(result.errors.length||renderErrors.length||result.failures.length)throw Error('cloud flight acceptance failed: '+JSON.stringify(result.failures));
}finally{await page?.close();server.close();}

async function ride(overcast){
  const G=window.__game,P=G.player,T=window.__T,clock=window.__rigClock;
  let previousY=null,maxStep=0,peak=-Infinity;
  const step=async()=>{
    await clock.step(50);
    if(P.onBroom){
      if(previousY!==null)maxStep=Math.max(maxStep,Math.abs(P.pos.y-previousY));
      previousY=P.pos.y;peak=Math.max(peak,P.pos.y);
    }
  };
  const render=G.renderFrame.bind(G);
  const frames=async n=>{for(let i=0;i<n;i++)await step();};
  const photos={},shots={},crossings=[],failures=[];
  const require=(ok,why)=>{if(!ok)failures.push(why);};
  const round=(n,places=2)=>Number(n.toFixed(places));
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=60;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const style=document.createElement('style');style.textContent='.mv-ui,.mv-ui *{visibility:hidden!important}';document.head.appendChild(style);
  const start={x:-1005,z:-230};const ground=G.world.groundAt(start.x,start.z);
  T.teleport(start.x,start.z,ground+.04);
  G.state.abilities.broom=true;G.state.upgrades.broom=0;
  G.state.flags.majo_named=true;G.state.flags.majo_brooch=true;
  P.setOutfit('elaina',{quiet:true});
  if(overcast)G.sky.setWeather({cloud:.80,rain:.65});
  P.yaw=.77;G.cam.yaw=P.yaw-Math.PI;G.cam.pitch=-.2;
  await frames(6);
  const origin=P.pos.toArray(), t0=G.time.t;
  // The initial test location and story flags are the same as a daytime traveller's save.
  // From this point all movement goes through the input map and the standard mount/fly functions.
  T.key('KeyF',true);await step();T.key('KeyF',false);
  if(!P.onBroom)throw Error('F failed to mount the broom');
  const light=G.journeyWeather.state;
  const observe=()=>({t:round(G.time.t-t0),y:round(P.pos.y),...G.sky.cloudLayer()});
  function pixels(){
    ctx.drawImage(G.renderer.domElement,0,0,canvas.width,canvas.height);
    const img=ctx.getImageData(0,0,96,60).data;
    let n=0,white=0,blue=0,luma=0;
    for(let y=2;y<56;y+=2)for(let x=3;x<93;x+=2){
      if(x>32&&x<62&&y>18&&y<49)continue; // exclude the rider and broom
      const i=(y*96+x)*4,r=img[i]/255,g=img[i+1]/255,b=img[i+2]/255;
      const v=.213*r+.715*g+.072*b;
      if(v>.52 && Math.max(r,g,b)-Math.min(r,g,b)<.21)white++;
      if(b-r>.12&&b>g+.032)blue++;
      n++;luma+=v;
    }
    return {white:round(white/n,3),blue:round(blue/n,3),luma:round(luma/n,3)};
  }
  function optical(){
    const rt=G.sky.mesh.material.uniforms.uLow.value.renderTarget;
    if(!rt?.textures[2])throw Error('missing volume colour / optical-depth render targets');
    const sample=new Uint16Array(4),toFloat=G.THREE.DataUtils.fromHalfFloat;
    let alpha=0,depth=0,n=0;
    for(const u of [.25,.38,.50,.62,.75])for(const v of [.32,.5,.68]){
      const x=Math.floor(u*rt.width),y=Math.floor(v*rt.height);
      G.renderer.readRenderTargetPixels(rt,x,y,1,1,sample,0,1);alpha+=toFloat(sample[3]);
      G.renderer.readRenderTargetPixels(rt,x,y,1,1,sample,0,2);depth+=toFloat(sample[0]);n++;
    }
    return {opacity:round(alpha/n,4),opticalDepth:round(depth/n,4)};
  }
  async function picture(name,pitch,distance=5.25,heading=-.315){
    const p=P.pos,dx=Math.cos(heading),dz=Math.sin(heading),lookY=p.y+1;
    const camHeight=lookY+distance*Math.tan(-pitch);
    T.viewCam(p.x-dx*distance,camHeight,p.z-dz*distance,p.x+dx*.6,lookY,p.z+dz*.6);
    // Chromium discards the WebGL back buffer after its compositor presents. Read it in the
    // same render callback, while the production pipeline and the view-only camera are active.
    G.renderFrame=()=>{
      render();
      photos[name]=G.renderer.domElement.toDataURL('image/jpeg',.94);
      shots[name]={...observe(),...pixels(),...optical(),rain:round(light.rain),skyOvercast:round(G.sky.mesh.material.uniforms.uWeather.value.x),sun:round(light.sunElevation)};
    };
    await step();
    G.renderFrame=()=>{};T.viewCam();
  }
  G.renderFrame=()=>{};T.key('Space',true);
  let low=false,middle=false,top=false;
  for(let frame=0;frame<970;frame++){
    G.renderFrame=frame%10===0?render:()=>{};await step();G.renderFrame=()=>{};
    const y=P.pos.y,layer=G.sky.cloudLayer();
    if(!P.onBroom)throw Error('unexpected automatic dismount at '+y);
    if(!shots.below && y>=layer.base-20)await picture('below',.12);
    if(!low && y>=layer.base){crossings.push({name:'cloud-base',...observe()});low=true;}
    if(!middle && y>=(layer.base+layer.top)*.5){crossings.push({name:'cloud-middle',...observe()});await picture('inside',.04);middle=true;}
    if(!top && y>=layer.top){crossings.push({name:'cloud-top',...observe()});top=true;}
    if(y>=layer.top+38){T.key('Space',false);await frames(7);await picture('above',-.22,4.7,Math.PI*.82);await picture('blue-sky',.83);await picture('look-down',-.88);break;}
  }
  T.key('Space',false);
  const descentStart=P.pos.y;
  T.key('KeyC',true);
  for(let i=0;i<320&&P.pos.y>(G.sky.cloudLayer().base+G.sky.cloudLayer().top)*.5;i++)await step();
  T.key('KeyC',false);
  const descent=observe();
  require(low&&middle&&top,'the flight did not cross all cloud boundaries');
  require(maxStep<1.1,'vertical displacement discontinuity: '+maxStep);
  require(P.onBroom&&descent.y<descentStart-32,'C did not return the rider to the cloud');
  require(shots.inside?.opacity>.88&&shots.inside?.white>.34,'the middle did not render as a dense bright cloud');
  require(shots['blue-sky']?.opacity<.04&&shots['blue-sky']?.blue>.52,'upward rays above the cloud top should show blue sky');
  require(shots['look-down']?.opacity>.60&&shots['look-down']?.white>.28,'the downward view should contain a lit cloud sea');
  require(Math.max(...crossings.map(q=>q.top))<peak-25,'insufficient flight headroom above cloud tops');
  T.cam();G.renderFrame=render;
  return {origin,peak:round(peak),maxStep:round(maxStep,3),descent,crossings,shots,photos,failures,errors:T.errors()};
}
