import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,serveGame} from '../../build.mjs';
import {launch,TMP} from '../cdp.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(process.env.MV_JOURNEY_QA||path.join(TMP,'journey-flight'));
await fs.mkdir(output,{recursive:true});
const bundle=await build({});
if(!bundle.ok)throw new Error(bundle.errors);
const {url,server}=await serveGame({getBuild:async()=>bundle});
const page=await launch({width:1440,height:810});
try{
  const renderErrors=[];
  page.on('Runtime.consoleAPICalled',m=>{
    if(m.type!=='error')return;
    const line=m.args.map(a=>a.value??a.description).join(' ').slice(0,850);
    renderErrors.push(line);console.error(line);
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:await fs.readFile(path.join(root,'tools/trailer/clock.js'),'utf8')});
  await page.goto(url+'?autostart=1&mute=1&quality=high&pr=1&dynres=0');
  const deadline=Date.now()+150000;
  while(!await page.evaluate('window.__mvReady===true&&window.__rigClock.mode==="virtual"')){
    if(Date.now()>deadline)throw new Error('boot timed out');
    await new Promise(r=>setTimeout(r,140));
  }
  const result=await page.evaluate(`(async()=>{
    const G=__game,P=G.player,T=__T,clock=__rigClock;
    const draw=G.renderFrame.bind(G);
    G.renderFrame=()=>{};
    const tick=async(n=1)=>{for(let i=0;i<n;i++)await clock.step(50);};
    // the finish keeps clear of the enlarged City of Magic: the line passes ~30 m south of its south wall towers
    const start={x:2395,z:55},finish={x:-2395,z:-430};
    const dx=finish.x-start.x,dz=finish.z-start.z,length=Math.hypot(dx,dz),heading=Math.atan2(dx,dz);
    G.state.abilities.broom=true;G.state.upgrades.broom=0;
    T.teleport(start.x,start.z,91);
    P.yaw=heading;G.cam.yaw=heading-Math.PI;G.cam.pitch=-.2;
    T.key('KeyF',true);await tick(1);T.key('KeyF',false);await tick(4);
    if(!P.onBroom)throw Error('mount failed');
    const style=document.createElement('style');style.textContent='.mv-ui,.mv-ui *{visibility:hidden!important}';document.head.appendChild(style);
    const t0=G.time.t,samples=[],birds={},conditions={},shots={};
    let minTerrain=Infinity,low=Infinity,high=0,greatestStep=0;
    let px=P.pos.x,pz=P.pos.z,flockFrames=0;
    T.key('KeyW',true);
    for(let frame=0;frame<6400;frame++){
      G.cam.yaw=heading-Math.PI;G.cam.pitch=-.2;
      const flock=frame>40&&frame%20===0&&!flockFrames&&!shots.flyway?G.life.groups.find(g=>g.def.id==='geese'&&!g.leaving&&g.agents[0]?.s>.9&&Math.hypot(g.x-P.pos.x,g.z-P.pos.z)<85):null;
      if(flock) {
        const lead=flock.agents[0], rightX=flock.dir.z,rightZ=-flock.dir.x;
        T.viewCam(lead.x+rightX*12-flock.dir.x*11,lead.y+1.6,lead.z+rightZ*12-flock.dir.z*11,lead.x-flock.dir.x*3,lead.y,lead.z-flock.dir.z*3);
        G.renderFrame=draw;flockFrames=4;
      }
      await tick();
      if(flockFrames && --flockFrames===0){shots.flyway=G.renderer.domElement.toDataURL('image/jpeg',.94);T.cam();G.renderFrame=()=>{};}
      const d=Math.hypot(P.pos.x-finish.x,P.pos.z-finish.z);
      const terrain=G.world.heightAt(P.pos.x,P.pos.z);
      minTerrain=Math.min(minTerrain,terrain);low=Math.min(low,P.pos.y-terrain);high=Math.max(high,P.pos.y-terrain);
      greatestStep=Math.max(greatestStep,Math.hypot(P.pos.x-px,P.pos.z-pz));px=P.pos.x;pz=P.pos.z;
      if(!P.onBroom||!Number.isFinite(d))throw Error('flight interrupted');
      if(frame%30===0){
        for(const [id,n] of Object.entries(G.life.stats().by))birds[id]=Math.max(birds[id]||0,n);
        const w=G.journeyWeather.state;conditions[w.name]=(conditions[w.name]||0)+1;
      }
      if(frame%1200===0)samples.push({s:+(G.time.t-t0).toFixed(1),x:+px.toFixed(1),z:+pz.toFixed(1),region:G.world.regionAt(px,pz),speed:+P.speed.toFixed(2)});
      if(d<1)break;
      if(frame===6399)throw Error('failed to reach endpoint '+d);
    }
    T.key('KeyW',false);
    const s=G.time.t-t0;
    if(s<292||s>310||greatestStep>1.0)throw Error('wrong flight time/discontinuity: '+s+' / '+greatestStep);
    const endpoint=P.pos.toArray(),flora=G.flora.stats();
    const grovePlots=[[900,-335],[520,-16],[-1135,-460],[2006,134]].map(([x,z])=>({x,z,stems:0,upper:0,lower:0}));
    const store=G.flora.store;
    for(let i=0;i<store.n;i++){
      const sp=G.flora.species[store.sp[i]];
      if(sp.def.kind!=='tree'||store.state[i]===3)continue;
      for(const plot of grovePlots){
        if(Math.abs(store.x[i]-plot.x)>=50||Math.abs(store.z[i]-plot.z)>=50)continue;
        const height=sp.model.height*store.s[i];plot.stems++;
        if(height>=14)plot.upper++;if(height<6)plot.lower++;
      }
    }
    if(grovePlots.some(p=>p.stems<340||p.upper<24||p.lower<40))throw Error('forest density or height strata regressed '+JSON.stringify(grovePlots));
    const measuredSpeed=P.speed;
    if(P.onBroom){T.key('KeyF',true);await tick(2);T.key('KeyF',false);await tick(2);}
    const millPos=G.structures.places.mill.site;
    T.teleport(millPos.wx(0,3.8),millPos.wz(0,3.8),millPos.h(0,3.8)+.1);await tick(8);
    T.key('KeyE',true);await tick(1);T.key('KeyE',false);await tick(4);
    if(!G.state.flags.journey_mill||!G.ui.providers.lore().some(p=>p.id==='journey_mill'))throw Error('windmill journal interaction failed '+JSON.stringify({at:P.pos.toArray(),broom:P.onBroom,mode:G.mode,it:G.interact.current?.prompt?.(),errors:T.errors()}));
    const shot=async(name,x,y,z,tx,ty,tz)=>{
      T.viewCam(x,y,z,tx,ty,tz);await tick(8);
      G.renderFrame=draw;await tick(2);G.renderFrame=()=>{};
      shots[name]=G.renderer.domElement.toDataURL('image/jpeg',.91);T.cam();
    };
    await shot('mill',1836,millPos.h(0,0)+8,-92,1818,millPos.h(0,0)+5,-77);
    T.teleport(-1234,-672);await tick(12);
    const summit=G.world.heightAt(-1234,-672);
    await shot('lookout',-1226,summit+6,-669,-1450,summit-15,-665);
    const spots=[];
    for(const [x,z] of [[185,-225],[950,387],[-1234,-672]]){
      T.teleport(x,z);await tick(6);spots.push({x,z,built:G.travelNotes.markers().length,visible:G.flora.stats().visible});
    }
    const testTime=G.state.playTime;
    const wTest=[];
    for(let i=0;i<400;i+=5){G.state.playTime=i;G.journeyWeather.update(8);wTest.push([i,G.journeyWeather.state.rain]);}
    wTest.sort((a,b)=>b[1]-a[1]);
    const wetTime=wTest[0][0];G.state.playTime=wetTime;await tick(85);
    const wet={...G.journeyWeather.state,draws:G.scene.getObjectByName('travelling-rain')?.visible||false};
    const w=G.world;await shot('rain',-1220,summit+5,-650,-1266,summit+2,-694);
    T.teleport(2220,50,19.1);await tick(4);const sheltered=G.journeyWeather.state.sheltered;
    G.state.playTime=testTime;
    if(!wet.draws||!sheltered)throw Error('rain/shelter verification failed '+JSON.stringify({wet,sheltered}));
    // A graduated witch can cast her own rock spell. Its smaller impact uses exactly
    // the same collision grid, saves independently of the story lake and survives loading.
    T.teleport(540,-107);await tick(10);
    G.spells.learn('earth',2,{silent:true});G.spells.select('earth');
    let impact;
    const off=G.events.on('spell:meteor',e=>{impact={x:e.pos.x,z:e.pos.z,crater:e.crater};});
    if(!G.spells.tryCast('earth','big'))throw Error('charged rock cast failed');
    for(let i=0;i<120&&!impact;i++)await tick();
    off();
    if(!impact?.crater)throw Error('no impact from the charged rock spell');
    const height=()=>w.heightAt(impact.x,impact.z);
    const damaged=height(), natural=w.baseHeightAt(impact.x,impact.z);
    G.save.disabled=false;
    if(!G.save.write(true))throw Error('failed to write isolated spell save');
    G.save.reset();const clean=height();
    if(!G.save.load())throw Error('failed to reload isolated spell save');
    const loaded=height();G.save.load();const loadedTwice=height();
    const scar={...impact,natural,damaged,clean,loaded,loadedTwice,stamps:w.saveSpellScars().length};
    if(natural-damaged<3 || clean!==natural || loaded!==damaged || loadedTwice!==damaged || scar.stamps!==1)
      throw Error('terrain save roundtrip failed '+JSON.stringify(scar));
    const solar=[];
    for(const seconds of [0,420,860]){
      G.state.playTime=seconds;G.journeyWeather.update(22);
      solar.push({seconds,elevation:G.journeyWeather.state.sunElevation,light:w.daylightAt(540,-107)});
    }
    if(!(solar[0].elevation>25 && solar[2].elevation<0 && solar[2].light<.05))
      throw Error('solar clock failed '+JSON.stringify(solar));
    return {length,s,endpoint,grovePlots,scar,solar,ordinarySpeed:measuredSpeed,minTerrain,clearance:[low,high],greatestStep,samples,birds,conditions,flora,spots,wet,sheltered,errors:T.errors(),shots};
  })()`,{timeout:540000});
  const shots=result.shots;delete result.shots;
  for(const [name,uri] of Object.entries(shots))await fs.writeFile(path.join(output,name+'.jpg'),Buffer.from(uri.split(',')[1],'base64'));
  await fs.writeFile(path.join(output,'flight.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  if(result.errors.length || renderErrors.length)throw new Error('Game or renderer reported errors');
}finally{await page.close();server.close();}
