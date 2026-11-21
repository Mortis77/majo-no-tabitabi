// Static working sets for the village counters, farmhouse verandas and shrine.
// Their wood, straw, clay and fabric share the site's existing material batches.
import * as THREE from 'three';
import { box, cyl } from '../../core/geo.js';
import { mulberry32 } from '../../core/util.js';
import { fontsReady, fontStack, whenFontsReady } from '../../core/fonts.js';
import { t } from '../../core/i18n.js';
import { lathe } from '../../props/shapes.js';
import { M, rod, sharedMat, texMat } from './kit.js';

function barrelWrap() {
  return sharedMat('shrine-donated-sake', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 160;
    const c = canvas.getContext('2d'), rnd = mulberry32(33499);
    c.fillStyle = '#d8c39a'; c.fillRect(0,0,512,160);
    // Straw mat slats with gaps in the ink. A rope disappears into each bound hoop.
    for (let x=0;x<512;x+=3) {
      c.strokeStyle = rnd()>.47 ? '#b59a70' : '#ead8ae';
      c.lineWidth = .65+rnd(); c.beginPath(); c.moveTo(x,0);
      c.bezierCurveTo(x-2,42,x+3,110,x,160); c.stroke();
    }
    for (const y of [12,146]) {
      c.fillStyle='#937849'; c.fillRect(0,y-3,512,7);
      for(let x=0;x<512;x+=6) {
        c.strokeStyle='#efdab1'; c.lineWidth=2.5; c.beginPath();
        c.moveTo(x,y+1); c.lineTo(x+4,y-2); c.stroke();
      }
    }
    function paintMarks() {
      const lines=t('structures.inscription.sakeOffering').split('\n');
      const leading=Math.min(39,78/lines.length);
      for(const x of [4,256,508]) {
        c.fillStyle='#eee4c7'; c.beginPath(); c.ellipse(x,79,49,56,0,0,Math.PI*2); c.fill();
        c.strokeStyle='#a04437'; c.lineWidth=3; c.setLineDash([99,8,50,7]);
        c.beginPath(); c.ellipse(x,79,46,53,0,0,Math.PI*2); c.stroke(); c.setLineDash([]);
        c.fillStyle='#b74c3a'; c.beginPath(); c.arc(x+17,50,9,0,Math.PI*2); c.fill();
        c.fillStyle='#38352f'; c.font='400 41px '+fontStack('sign'); c.textAlign='center';
        lines.forEach((line,i)=>c.fillText(line,x,96.5+(i-(lines.length-1)/2)*leading,78));
      }
    }
    paintMarks();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=4;
    if (!fontsReady()) whenFontsReady(()=>{ paintMarks();tex.needsUpdate=true; });
    return texMat(tex);
  });
}

function workTable(width, depth, height) {
  const g = new THREE.Group(), wood=M.wood(), dark=M.woodDark();
  for(const x of [-1,1]) for(const z of [-1,1])
    g.add(box(.085,height,.085,dark,x*(width/2-.1),height/2,z*(depth/2-.095)));
  for(const x of [-1,1]) g.add(box(.07,.10,depth-.06,wood,x*(width/2-.1),height*.45,0));
  g.add(box(width-.09,.10,.07,wood,0,height*.45,-depth*.29));
  for(let i=0;i<3;i++) g.add(box(width,.073,depth/3-.012,i===2?M.woodLight():wood,0,height-.034,(i-1)*depth/3));
  return g;
}

export function donatedBarrels() {
  const g=workTable(2.44,.85,.30), oak=M.wood(), wrap=barrelWrap();
  const profile=[[.306,0],[.337,.04],[.363,.16],[.370,.46],[.342,.617],[.315,.66]];
  for(const [x,y,z,turn] of [[-.77,.30,0,.04],[0,.30,0,-.07],[.77,.30,0,.02],[-.39,.99,0,.10],[.39,.99,-.03,-.08]]) {
    const body=lathe(profile,wrap,x,y,z,16); body.rotation.y=Math.PI+turn; g.add(body);
    g.add(cyl(.31,.31,.034,oak,x,y+.654,z,16));
    g.add(cyl(.34,.344,.038,M.rope(),x,y+.618,z,16));
  }
  g.add(box(2.30,.041,.63,M.woodLight(),0,.971,0));
  return g;
}

// A shallow bamboo sieve. The lip has an actual hollow profile and crossing
// split cane on its bed. The long shallow ellipse remains visible in silhouette.
function sieve(radius) {
  const g=new THREE.Group(), straw=M.straw(), reed=M.woodLight();
  const rim=lathe([[radius*.81,0],[radius,.13],[radius,.155],[radius*.94,.158],[radius*.78,.028],[.002,.028]],straw,0,0,0,15);
  rim.scale.z=.81; g.add(rim);
  for(let i=-3;i<=3;i++){
    const p=i*.20, extent=radius*Math.sqrt(.64-p*p);
    g.add(box(extent*2,.015,.024,reed,0,.036,p*radius*.81));
    g.add(box(.028,.013,extent*1.62,reed,p*radius,.047,0));
  }
  return g;
}

function riceBale(x,y,z,angle=0) {
  const g=new THREE.Group(), straw=M.straw(), cord=M.woodDark();
  const form=lathe([[.002,-.42],[.23,-.405],[.295,-.29],[.312,-.06],[.307,.20],[.275,.34],[.22,.412],[.002,.42]],straw,0,0,0,12);
  form.rotation.z=Math.PI/2; g.add(form);
  for(const xx of [-.24,.24]) {
    const hoop=lathe([[.31,-.018],[.311,.018]],cord,xx,0,0,12);
    hoop.rotation.z=Math.PI/2; g.add(hoop);
  }
  // The binding runs end to end across the two hoops.
  g.add(rod(-.32,.23,.166,.32,.23,.166,.014,M.rope(),4));
  g.add(rod(-.32,.23,-.166,.32,.23,-.166,.014,M.rope(),4));
  g.position.set(x,y,z);g.rotation.y=angle;return g;
}

export function harvestStation(full, fruit) {
  const g=new THREE.Group(), table=workTable(1.60,.78,.62);
  table.position.x=full ? .54 : 0;
  g.add(table);
  const tray=sieve(.40);tray.position.set(table.position.x+.24,.62,-.045);g.add(tray);
  // Small-cluster silhouette of the persimmons in the sorting tray.
  const stem=M.woodDark();
  for(const [x,z,s] of [[-.12,0,.09],[.03,.07,.083],[.12,-.04,.094],[-.04,-.09,.087],[.005,-.016,.091]]) {
    const y=x===.005 ? .164 : .095;
    const f=lathe([[.001,-s*.70],[s*.77,-s*.50],[s,-s*.05],[s*.82,s*.53],[s*.35,s*.63],[.001,s*.52]],fruit,x,y,z,8);
    tray.add(f);
    tray.add(box(s*.6,.013,s*.42,stem,x,y+s*.57,z));
  }
  const r=sieve(.43);r.rotation.x=-1.12;r.rotation.z=.18;
  r.position.set(table.position.x-.48,.95,-.20);g.add(r);
  if(full) {
    g.add(riceBale(-.78,.31,-.18,-.05),riceBale(-.83,.31,.36,.025),riceBale(-.80,.80,.09,-.04));
  }
  return g;
}

export function millBales() {
  const g=new THREE.Group();
  for(const [x,y,z,a] of [[-.55,.30,0,.12],[.45,.29,.02,-.05],[-.50,.29,.51,.01],[.48,.30,.55,-.05],
    [-.45,.80,.26,-.03],[.51,.79,.28,.07],[-.02,1.28,.27,.05]]) g.add(riceBale(x,y,z,a));
  const scoop=sieve(.51);scoop.position.set(1.15,.39,.26);scoop.rotation.z=-1.10;scoop.rotation.x=-.3;g.add(scoop);
  return g;
}

export function dangoKitchen() {
  const g=new THREE.Group(), bamboo=M.woodLight(), dark=M.wood(), clay=M.stoneDark();
  const stove=lathe([[.27,0],[.35,.035],[.37,.20],[.336,.44],[.29,.49]],clay,0,0,0,14);
  g.add(stove);
  for(let i=0;i<3;i++){
    const y=.462+i*.139;
    g.add(lathe([[.30,0],[.361,.024],[.359,.13],[.327,.143]],bamboo,0,y,0,16));
    g.add(lathe([[.357,0],[.367,.01],[.367,.032],[.357,.04]],dark,0,y+.017,0,16));
  }
  g.add(lathe([[.002,0],[.35,0],[.366,.033],[.30,.068],[.07,.107],[.002,.108]],bamboo,0,.88,0,16));
  for(const s of [-1,1]) g.add(rod(0,.978,s*.08,0,1.053,s*.06,.021,dark,6));
  g.add(rod(0,1.053,-.06,0,1.053,.06,.021,dark,6));
  const tray=sieve(.28);tray.position.set(.50,.023,.07);g.add(tray);
  return g;
}

let tabletShape;
function blankTablet(g,x,y,z,turn) {
  if(!tabletShape) {
    // The characteristic roof-shaped top is cut as part of the board.
    const s=new THREE.Shape();s.moveTo(-.135,-.078);s.lineTo(.135,-.078);
    s.lineTo(.135,.035);s.lineTo(0,.092);s.lineTo(-.135,.035);s.closePath();
    tabletShape=new THREE.ExtrudeGeometry(s,{depth:.016,bevelEnabled:false});
    tabletShape.rotateX(-Math.PI/2);
  }
  const tile=new THREE.Mesh(tabletShape,M.woodLight());
  tile.rotation.y=turn;tile.position.set(x,y,z);g.add(tile);
}

export function prayerDesk() {
  const g=workTable(1.80,.70,.76);
  const runner=M.red();
  g.add(box(.52,.015,.69,runner,.34,.767,0),box(.52,.18,.018,runner,.34,.682,.347));
  for(let i=0;i<5;i++) blankTablet(g,.38+(i%2)*.013,.777+i*.019,.05,i%2 ? .07 : -.08);
  blankTablet(g,.09,.78,.16,-.34);
  const inkstone=box(.21,.039,.16,M.black(),-.13,.785,-.14);inkstone.rotation.y=-.16;g.add(inkstone);
  g.add(lathe([[.042,0],[.071,.025],[.071,.178],[.050,.180],[.045,.125]],M.woodDark(),-.62,.76,-.15,10));
  for(const [x,z] of [[-.60,-.17],[-.68,-.11],[-.64,-.23]]){
    const dx=(x+.62)*1.18, dz=(z+.15)*1.1;
    g.add(rod(x,.87,z,x+dx,1.11,z+dz,.011,M.woodLight(),5));
    g.add(rod(x+dx,1.11,z+dz,x+dx*1.09,1.14,z+dz*1.08,.010,M.black(),5));
  }
  // A short writing stool slides beneath the desk between visitors.
  const stool=workTable(.6,.37,.40);stool.position.set(-.28,0,.24);g.add(stool);
  return g;
}
