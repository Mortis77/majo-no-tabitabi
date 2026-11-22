// The open country's discovery loop (src/gameplay/wilds*.js): one landmark puzzle of every kind solved by real spell
// casts (G.spells.cast, the same path the heroine's casts take), stray stars picked up by touch, a cairn lookout, one
// ring course flown on the broom by a steering bot, the save → reload round trip, and the map / journal pages.
// Private throwaway browser, virtual clock (tools/trailer/clock.js). Output: MV_JOURNEY_QA or .tmp/journey-activities.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, serveGame } from '../../build.mjs';
import { launch, TMP } from '../cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
// ACT_RINGS=all flies all three ring courses (medal calibration); by default only the heart course
const RING_IDS = process.env.ACT_RINGS === 'all' ? ['rc_heart', 'rc_coast', 'rc_vale'] : ['rc_heart'];
const output = path.resolve(process.env.MV_JOURNEY_QA || path.join(TMP, 'journey-activities'));
await fs.mkdir(output, { recursive: true });
const bundle = await build({});
if (!bundle.ok) throw new Error(bundle.errors);
const { url, server } = await serveGame({ getBuild: async () => bundle });
const page = await launch({ width: 1280, height: 720 });
let failed = false;
try {
  const consoleErrors = [];
  page.on('Runtime.consoleAPICalled', (m) => {
    if (m.type !== 'error') return;
    const line = m.args.map((a) => a.value ?? a.description).join(' ').slice(0, 600);
    consoleErrors.push(line); console.error(line);
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: await fs.readFile(path.join(root, 'tools/trailer/clock.js'), 'utf8') });
  await page.goto(url + '?autostart=1&mute=1&quality=high&pr=1&dynres=0&allspells=1&pos=2100,330');
  const deadline = Date.now() + 150000;
  while (!(await page.evaluate('window.__mvReady===true&&window.__rigClock.mode==="virtual"&&!!window.__game.wilds?.ready'))) {
    if (Date.now() > deadline) throw new Error('boot timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
  // ---- part 1: puzzles, stars, cairn, ring course, save round trip (all in the page) ----------------------------------
  const result = await page.evaluate(`(async()=>{
    const G=__game,P=G.player,T=__T,clock=__rigClock,V=G.THREE.Vector3;
    const draw=G.renderFrame.bind(G);G.renderFrame=()=>{};
    const tick=async(n=1)=>{for(let i=0;i<n;i++)await clock.step(50);};
    const sec=(s)=>tick(Math.round(s*20));
    const fail=(m,o)=>{throw Error(m+' '+JSON.stringify(o||{}));};
    const W=G.wilds,PZ=W.puzzles,out={puzzles:{},stars:{},ring:{},save:{}};
    await tick(20);G.physics?.syncStatics?.();await tick(4);
    const st=(id)=>PZ.state(id);
    const cast=(id,form,point)=>{const o=P.pos.clone().setY(P.pos.y+1.25);return G.spells.cast(id,form,{caster:P,point:point.clone(),dir:point.clone().sub(o).normalize()});};
    const stand=async(t,dist,dy)=>{T.teleport(t.x,t.z+dist,dy===undefined?undefined:t.y+dy);P.yaw=Math.PI;await tick(8);};
    const press=async(code)=>{T.key(code,true);await tick(1);T.key(code,false);await tick(3);};
    async function open(id){
      const p=PZ.get(id),c=p.chest.group.position;
      T.teleport(c.x,c.z+1.5,c.y+0.2);await tick(6);
      const prompt=G.interact.current?.prompt?.()||null;
      await press('KeyE');await tick(10);
      if(st(id)!=='open')fail('chest did not open: '+id,{prompt,state:st(id)});
      return prompt;
    }
    const dust0=G.state.inventory.stardust;
    // beacon: fire on the keep's iron basket
    { const p=PZ.get('pz_beacon_keep'),b=p.pos;
      T.teleport(b.x+3.5,b.z+3.5,b.y-1.6);await tick(8);
      const look=G.interact.current?.prompt?.();
      cast('fire','small',b.clone().setY(b.y-0.3));await sec(2.5);
      if(st('pz_beacon_keep')!=='solved')fail('beacon not lit by fire',{at:P.pos.toArray()});
      out.puzzles.beacon={lit:p.lit,open:await open('pz_beacon_keep')}; }
    // bramble: fire burns the thicket away
    { const p=PZ.get('pz_hermit_briar'),b=p.pos;
      await stand(b,7);
      cast('fire','small',b.clone().setY(b.y+0.8));await sec(1.5);
      const burning=!!p.reactor?.burning;await sec(8);
      if(st('pz_hermit_briar')!=='solved')fail('bramble did not burn away',{burning});
      out.puzzles.bramble={burning,open:await open('pz_hermit_briar')}; }
    // rubble: thunder shatters the stones
    { const p=PZ.get('pz_pass_rubble'),b=p.pos;
      await stand(b,8);
      cast('thunder','small',b.clone().setY(b.y+0.5));await sec(1.5);
      if(st('pz_pass_rubble')!=='solved')fail('rubble not shattered');
      out.puzzles.rubble={open:await open('pz_pass_rubble')}; }
    // drift: the chest slips away from her hand; a frost burst on the pool holds it
    { const p=PZ.get('pz_tarn_drift'),c=p.center;
      const a0=p.chest.group.position.clone();
      T.teleport(a0.x,a0.z,c.y+0.8);await sec(1.2);
      const slipped=+a0.distanceTo(p.chest.group.position).toFixed(2);
      await stand(c,10,1.0);
      cast('ice','big',c.clone());await sec(1.5);
      if(!p.frozen)fail('pool did not freeze');
      out.puzzles.drift={slipped,frozen:p.frozen,open:await open('pz_tarn_drift')};
      if(slipped<0.5)fail('drifting chest did not slip away',{slipped}); }
    // ember: water quenches the coals
    { const p=PZ.get('pz_charcoal_ember'),b=p.pos;
      await stand(b,7);
      cast('water','small',b.clone().setY(b.y+0.5));await sec(1.5);
      if(st('pz_charcoal_ember')!=='solved')fail('embers not quenched');
      out.puzzles.ember={open:await open('pz_charcoal_ember')}; }
    // circle: dry stones keep no lightning; rain, then one strike charges all thirteen
    { const p=PZ.get('pz_moor_circle'),c=p.pos,s0=p.stones[0];
      await stand(c,16);
      cast('thunder','small',new V(s0.x,s0.g+1,s0.z));await sec(1.5);
      const dry=p.stones.filter((s)=>s.charged>0).length;
      if(dry||st('pz_moor_circle'))fail('dry circle took the lightning',{dry});
      G.spells.cast('water','big',{caster:P,point:c.clone()});await sec(5);
      const wet=p.stones.filter((s)=>s.reactor?.wet>0).length;
      cast('thunder','small',new V(s0.x,s0.g+1,s0.z));await sec(1.5);
      if(st('pz_moor_circle')!=='solved')fail('wet circle not charged',{wet,charged:p.stones.filter((s)=>s.charged>0).length});
      await sec(2.2);
      out.puzzles.circle={dry,wet,open:await open('pz_moor_circle')}; }
    // wheel: three gusts spin it up
    { const p=PZ.get('pz_mill_wheel'),b=p.pos;
      await stand(b,7);
      for(let k=0;k<3;k++){cast('wind','small',b.clone().setY(b.y+2.5));await sec(0.9);}
      if(st('pz_mill_wheel')!=='solved')fail('wind wheel not spun up',{spin:p.spin});
      out.puzzles.wheel={spin:+p.spin.toFixed(2),open:await open('pz_mill_wheel')}; }
    // lantern: fire warms it, it rises on the wind, she catches it on the broom
    { const p=PZ.get('pz_tor_south_lantern'),b=p.pos;
      await stand(b,7);
      cast('fire','small',b.clone().setY(b.y+0.7));await sec(5);
      if(p.phase!=='rise')fail('sky lantern did not rise',{phase:p.phase});
      const rose=+(p.pos.y-p.home.y).toFixed(1);
      T.teleport(p.pos.x,p.pos.z,p.pos.y-1.2);await tick(4);
      if(st('pz_tor_south_lantern')!=='open')fail('sky lantern not caught');
      out.puzzles.lantern={rose}; }
    // ---- stray stars by touch + a cairn ----
    const want=['st_well_mouth','st_mill_cap','st_light_finial','st_pier_end','st_bridge_under','st_tree_crown','st_tower_top'];
    const n0=W.starCount();
    for(const id of want){const s=W.stars.find((x)=>x.id===id);T.teleport(s.pos.x,s.pos.z,s.pos.y-0.9);await tick(3);}
    out.stars.picked=W.starCount()-n0;out.stars.total=W.starTotal();out.stars.steps=G.state.wilds.steps;
    if(out.stars.picked!==want.length)fail('stars not picked up',{picked:out.stars.picked});
    { const l=G.wilds.resolveAt('cairn_southhill',{x:0,z:0,y:['h0',0]});
      T.teleport(l.x,l.z+1.6);await tick(6);
      const prompt=G.interact.current?.prompt?.()||null;
      await press('KeyE');await sec(2);
      out.stars.cairn={prompt,sighted:Object.keys(G.state.wilds.sighted).length};
      if(!G.state.wilds.cairns.cairn_southhill)fail('cairn lookout failed',out.stars.cairn); }
    out.found=Object.keys(G.state.wilds.lm).length;
    // ---- ring course(s), flown on the broom by a steering bot at cruise speed (no boost, broom level 0) ----
    out.ring={};
    const broomLv=G.state.upgrades.broom;G.state.upgrades.broom=0;
    for(const id of ${JSON.stringify(RING_IDS)}){
      const R=W.rings,c=R.courses.find((x)=>x.def.id===id),r0=c.rings[0];
      const back=r0.pos.clone().addScaledVector(r0.normal,-14);
      T.teleport(back.x,back.z,back.y);await tick(2);
      if(!P.onBroom){await press('KeyF');await tick(6);}
      if(!P.onBroom)fail('could not mount the broom');
      P.mana=P.maxMana;
      T.key('KeyW',true);
      let frames=0,lastNext=-1,stuck=0,aborts=0,wasRunning=false;
      for(;frames<6000;frames++){
        const target=R.running?R.next.pos:r0.pos;
        const dx=target.x-P.pos.x,dz=target.z-P.pos.z;
        G.cam.yaw=Math.atan2(dx,dz)-Math.PI;
        const vy=Math.max(-10,Math.min(10,(target.y-P.pos.y)*1.6)),sp=Math.max(6,P.speed*0.6);
        G.cam.pitch=Math.asin(Math.max(-0.95,Math.min(0.95,vy/sp)))-0.2;
        await tick();
        if(wasRunning&&!R.running&&!G.state.wilds.rings[id])aborts++;
        wasRunning=!!R.running;
        if(R.running&&R.next!==lastNext){lastNext=R.next;stuck=0;}else if(R.running&&++stuck>1200)break;
        if(!R.running&&frames>40&&G.state.wilds.rings[id])break;
      }
      T.key('KeyW',false);
      const rec=G.state.wilds.rings[id];
      out.ring[id]={rec,aborts,secs:+(frames*0.05).toFixed(1),len:Math.round(c.len),medals:c.def.medals};
      if(!rec||!(rec.best>0))fail('ring course not completed',out.ring[id]);
    }
    G.state.upgrades.broom=broomLv;
    // ---- save -> reload keeps everything ----
    { const before=JSON.stringify(G.state.wilds);
      G.save.disabled=false;
      if(!G.save.write(true))fail('save write failed');
      G.save.reset();
      if(Object.keys(G.state.wilds.stars).length)fail('reset kept stars');
      W.start();
      const hiddenAfterReset=W.stars.filter((s)=>s.got).length;
      if(!G.save.load())fail('save load failed');
      W.start();
      const after=JSON.stringify(G.state.wilds);
      const thicket=PZ.get('pz_hermit_briar').thicket.visible, pile=PZ.get('pz_pass_rubble').pile.visible, beacon=PZ.get('pz_beacon_keep').lit;
      out.save={same:before===after,hiddenAfterReset,starsGot:W.stars.filter((s)=>s.got).length,thicket,pile,beacon,opened:PZ.counts()};
      G.save.erase();G.save.disabled=true;
      if(before!==after||thicket||pile||!beacon||out.save.starsGot!==W.starCount())fail('save round trip lost state',out.save); }
    out.dust={start:dust0,end:G.state.inventory.stardust};
    out.upgrades={...G.state.upgrades};
    out.errors=T.errors();
    G.renderFrame=draw;
    return out;
  })()`, { timeout: 600000 });
  // ---- part 2: map and journal pages (DOM, so real screenshots) --------------------------------------------------------
  const step = (n) => page.evaluate(`(async()=>{for(let i=0;i<${n};i++)await __rigClock.step(50);return true;})()`);
  await page.evaluate(`(()=>{const G=__game,s=G.wilds.stars.find((x)=>x.id==='st_tree_roots');__T.teleport(560,250);G.ui.openMenu('map');return true;})()`);
  await step(30);
  await page.screenshot(path.join(output, 'map.png'));
  const journal = await page.evaluate(`(()=>{const G=__game;G.ui.openMenu('journal');
    const tab=[...document.querySelectorAll('.mn-subtabs .st')].find((e)=>e.textContent.includes('旅途见闻'));
    if(!tab)return {tab:false};tab.click();return {tab:true,text:tab.textContent};})()`);
  await step(10);
  await page.screenshot(path.join(output, 'journal-stars.png'));
  const rows = await page.evaluate(`(()=>{const rows=[...document.querySelectorAll('.mn-list .scroll .mn-row')];const r=rows.find((e)=>e.textContent.includes('古树原野'));r?.dispatchEvent(new MouseEvent('mouseenter'));return rows.map((e)=>e.textContent);})()`);
  await step(10);
  await page.screenshot(path.join(output, 'journal-region.png'));
  result.pages = { journal, rows };
  if (!journal.tab || rows.length < 8) throw new Error('journal page missing ' + JSON.stringify(result.pages));
  await fs.writeFile(path.join(output, 'activities.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || consoleErrors.length) throw new Error('Game or renderer reported errors');
  console.log('journey-activities: PASS — ' + output);
} catch (e) {
  failed = true;
  console.error('journey-activities: FAIL — ' + (e?.message || e));
} finally { await page.close(); server.close(); }
process.exit(failed ? 1 : 0);
