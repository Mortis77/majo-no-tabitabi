// Broad moving fronts along the route. Saved play time fixes their position across reloads.
// Episode lighting is art direction for the adaptation; it blends locally into the travelling front.
import { advanceSky, SUN_DIR, moonSeparationAt, setSolarTransmission } from './veil.js';
import { sunVisibleFraction } from '../render/atmo.js';
import { t } from '../core/i18n.js';
import { TRIAL_LAKE } from './trial-lake.js';
import { smoothstep } from '../core/util.js';

const light = { cover:.36, rain:0, warmth:.32, wind:1 };
const home = { cover:.29, rain:0, warmth:.62, wind:.8 };
const testing = { cover:.87, rain:0, warmth:.03, wind:1.65 };
const arrival = { cover:.39, rain:0, warmth:.30, wind:.94 };
const farewell = { cover:.23, rain:0, warmth:.88, wind:.8 };
const mix = (a,b,t) => a+(b-a)*t;

function front(x,z,t) {
  return .56*Math.sin(x*.00215+z*.0012+t*.0115-.87)
    +.31*Math.sin(x*.0039-z*.0015+t*.0075+.4)
    +.18*Math.cos(z*.006+t*.016+x*.0008);
}
// Showers only where a front is strong: most of the road is clear or fair-weather cumulus.
function naturalRain(x,z,t) {return smoothstep(.5,.88,front(x,z,t));}

export function createJourneyWeather(G) {
  const state={
    ...light, sheltered:false, eclipse:0, eclipseAge:null, night:0, sunlight:1, sunElevation:0,
    get name() {
      const key = this.rain > .48 ? 'showers' : this.cover > .62 ? 'overcast' : this.cover > .41 ? 'cloudy' : 'clear';
      return t('world.weather.' + key);
    },
  };
  let time=0, cue=null, cueX=0, cueZ=0, radius=1, ready=false;
  function localWeight(x,z) {
    return cue ? 1-smoothstep(radius*.6,radius,Math.hypot(x-cueX,z-cueZ)) : 0;
  }
  function lakeClearing(x,z) {
    const flags=G.state?.flags;
    if(!flags?.majo_trial_lake || (!flags.journey_eclipse_running && G.story?.current()?.id!=='lake'))return 0;
    return 1-smoothstep(310,530,Math.hypot(x-TRIAL_LAKE.x,z-TRIAL_LAKE.z));
  }
  function prepare() {
    const id=G.story?.current()?.id;
    cue=null;
    if (['book','refusal','promise'].includes(id)) {
      cue=id==='promise'?farewell:home; cueX=2210;cueZ=10;radius=330;
    } else if (['storm','honest','invest','practice'].includes(id)){
      cue=id==='storm'?testing:id==='honest'?light:farewell;cueX=2080;cueZ=-65;radius=205;
    } else if (['gate','collision','repair','hat','depart'].includes(id)){
      cue=id==='hat'||id==='depart'?farewell:arrival;cueX=-2160;cueZ=-510;radius=290;
    }
  }
  function beginEclipse() {
    const f=G.state?.flags;
    if(!f?.majo_trial_lake || f.journey_eclipse_seen || f.journey_eclipse_running)return false;
    f.journey_eclipse_running=true;
    f.journey_eclipse_age=0;
    G.save?.write(true);
    return true;
  }
  return {
    state,beginEclipse,
    rainAt(x,z) {
      return mix(naturalRain(x,z,time),cue?.rain||0,localWeight(x,z))*(1-lakeClearing(x,z));
    },
    update(dt) {
      const p=G.player?.pos;
      if(!p||!G.started)return;
      time=G.state.playTime;prepare();
      const flags=G.state.flags, stage=G.story?.current()?.id;
      const lakeScene=stage==='lake' || !!flags.journey_eclipse_running;
      if(stage==='lake' && G.player.onBroom && Math.hypot(p.x-TRIAL_LAKE.x,p.z-TRIAL_LAKE.z)<266)beginEclipse();
      let age=null;
      if(flags.journey_eclipse_running) {
        age=Math.min(36,(flags.journey_eclipse_age||0)+dt);
        flags.journey_eclipse_age=age;
        if(age>=14&&!flags.journey_eclipse_peak){flags.journey_eclipse_peak=true;G.save?.write(true);}
        if(age>=36){
          flags.journey_eclipse_running=false;flags.journey_eclipse_seen=true;
          flags.journey_sun_offset=(2.69-.85)*1440/(2*Math.PI)-time;
          G.save?.write(true);age=null;
        }
      }
      advanceSky(time,lakeScene,age,dt,flags.journey_sun_offset||0);
      state.eclipseAge=age;
      state.eclipse=1-sunVisibleFraction(moonSeparationAt());
      state.sunElevation=Math.asin(SUN_DIR.y)*180/Math.PI;
      state.night=1-smoothstep(-.14,.14,SUN_DIR.y);
      state.sunlight=(1-state.night)*(1-.95*state.eclipse);
      setSolarTransmission(state.sunlight);

      const f=front(p.x,p.z,time),blend=localWeight(p.x,p.z);
      const rain=naturalRain(p.x,p.z,time);
      const sky=smoothstep(-.63,.73,f);
      // cover by share of the time along the road: ~30% clear (<.25), ~40% fair cumulus (.25-.42: drifting cloud
      // shadows and sunbeams), ~20% cloudy, ~10% showers (rain pushes the sky to overcast by itself)
      const span=Math.min(1,Math.max(0,(f+1)/2.05));
      const fields={cover:.13+.6*Math.pow(span,1.5),rain,warmth:.17+.38*(1-sky),wind:.8+.76*sky+.32*rain};
      if(lakeScene){
        // The approaching front opens a window over the western horizon.
        const clearing=lakeClearing(p.x,p.z);
        fields.cover=mix(fields.cover,Math.min(fields.cover,.31),clearing);
        fields.rain*=1-clearing;
        fields.warmth=mix(fields.warmth,.74,clearing);
      }
      fields.warmth=Math.max(fields.warmth,(1-smoothstep(.03,.55,SUN_DIR.y))*(1-state.night));
      const a=ready?1-Math.exp(-Math.max(0,dt)*.33):1;
      for(const key of Object.keys(fields)){
        const target=mix(fields[key],cue?.[key]??fields[key],blend);
        state[key]=mix(state[key],target,a);
      }
      ready=true;
      const roof=G.world.ceilingAt(p.x,p.z,p.y+1.3);
      state.sheltered=Number.isFinite(roof) && roof-p.y<28;
    }
  };
}
