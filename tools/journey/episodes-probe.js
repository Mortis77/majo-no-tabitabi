// Episodes probe: twelve made-up episodes on top of the real two, to look at every out-of-play surface that grows with the
// journey — journal chapters + filter chips, the map page's travel-stamp panel (and a stamp flying the map to its place), a
// sheet of every stamp, a long bag, a long wardrobe row. A play script (its body runs inside the page with T and G in
// scope); never imported by the game. Nothing is saved (play's autostart profile).
//   node tools/play.mjs --name ep12-desk --script tools/journey/episodes-probe.js
//   node tools/play.mjs --name ep12-phone --script tools/journey/episodes-probe.js --mobile --dpr 3 --size 844x390
// Shots in .tmp/play/<name>/: journal-top, journal-scrolled, journal-active, map-stamps, map-stamps-end, map-fly,
// stamp-sheet, items-many, wardrobe-many. Result: counts that should hold (see `checks`) + T.errors().

const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四'];
const EP_NAMES = ['雨之国', '灰之城的魔女', '花园里的约定', '钟楼下的少年', '玻璃之海', '星见丘的旅人', '沉睡之国', '旧书街', '风车与麦田', '白雪关', '月光港', '沙漏城'];
const C_NAMES = ['雨之国', '雾桥镇', '灰之城', '花园之国', '玫瑰小径', '钟楼镇', '玻璃之海', '贝壳湾', '星见丘', '沉睡之国', '梦之森', '旧书街',
  '风车村', '麦浪原', '白雪关', '月光港', '灯塔岬', '沙漏城'];
const ANCHORS = ['hometown', null, 'forest', 'eastmoor', 'wilds', null, 'highpass', 'bellcrown', 'trialLake', 'gate'];
const loc = { ep: {}, c: {}, q: {} };
const eps = [], cs = [];
let ci = 0;
for (let i = 0; i < 12; i++) {
  const n = i + 3, id = 'probe_ep' + n, two = i % 3 !== 1;
  loc.ep[id] = `第${CN[n]}话　${EP_NAMES[i]}`;
  const ids = [];
  for (let k = 0; k < (two ? 2 : 1); k++) {
    const cid = `probe_c${n}${'ab'[k]}`;
    loc.c[cid] = C_NAMES[ci % C_NAMES.length];
    cs.push({ id: cid, episode: id, name: 'probe.c.' + cid, sub: null, regions: ['probe_r' + n + 'ab'[k]], anchor: ANCHORS[ci % ANCHORS.length],
      stamp: { seed: 301 + ci } });   // consecutive seeds, as the docs suggest for a journey's countries
    ids.push(cid); ci++;
  }
  eps.push({ id, n, title: 'probe.ep.' + id, quests: i < 10 ? ['probe_q' + n + 'a'].concat(two ? ['probe_q' + n + 'b'] : []) : [], countries: ids });
}
G.i18n.registerLocale('zh-CN', 'probe', loc);
G.ui.episodes.register({ episodes: eps, countries: cs });

// fake quests (episodes 3–12; 13 and 14 not begun, so the map keeps them as "the road ahead"), one side quest of no episode
const fakeQuests = [];
for (const e of eps) e.quests.forEach((qid, k) => fakeQuests.push({
  id: qid, title: k ? `${loc.ep[e.id].split('　')[1]}·旁枝` : loc.ep[e.id], desc: '探针生成的托付，用来看十二集以后的手记排版。',
  state: e.n <= 7 ? 'done' : 'active', main: k === 0,
  objectives: [{ text: '抵达' + loc.c[e.countries[0]], done: true }, { text: '在城门口盖上入境章', done: e.n <= 7 }],
}));
fakeQuests.push({ id: 'probe_side', title: '路边的失物', desc: '不属于任何一话的托付。', state: 'active', main: false, objectives: [{ text: '把手帕还给主人', done: false }] });
const P = G.ui.providers;
const origJournal = P.journal, origItems = P.items;
P.journal = () => (origJournal ? origJournal() : []).concat(fakeQuests);
const ICONS = ['stardust', 'dango', 'moontear'];
P.items = () => (origItems ? origItems() : []).concat(Array.from({ length: 22 }, (_, i) => ({
  id: 'probe_it' + i, name: '旅途杂物 ' + (i + 1), desc: '探针生成的随身物品。', count: 1 + (i % 5), icon: ICONS[i % 3],
})));

const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
const settle = async () => { await T.frames(3); await T.wait(450); };
const checks = {};

// stamps: a region of episode six entered while the menu is up (stampVisit runs before the banner's early return):
// everything up to that country in journey order is stamped
G.ui.openMenu('map');
await settle();
G.events.emit('region:enter', { id: 'probe_r6a' });
const st = G.state.stamps || {};
checks.stamped = Object.keys(st).filter((k) => st[k]).length;
checks.stampedUpToEp6 = !!(st.hometown && st.bellcrown && st.probe_c6a && !st.probe_c6b && !st.probe_c7a);

// journal: chapters, scrolled, filtered
G.ui.openMenu('journal');
await settle();
checks.journalRows = qa('.mn-list .scroll .mn-row').length;
checks.chapterHeads = qa('.mn-list .scroll .mn-ch').length;
checks.headsAreRows = qa('.mn-ch.mn-row').length;
checks.firstSelectedActive = (q('.mn-list .scroll .mn-row.sel')?.textContent || '').includes('进行中');
await T.shot('journal-top');
const jl = q('.mn-list .scroll');
jl.scrollTop = jl.scrollHeight;
await settle();
await T.shot('journal-scrolled');
qa('.mn-filt .fc')[1]?.click();
await settle();
checks.activeRows = qa('.mn-list .scroll .mn-row').length;
checks.activeAllActive = qa('.mn-list .scroll .mn-row').every((r) => !r.classList.contains('done'));
await T.shot('journal-active');
qa('.mn-filt .fc')[0]?.click();

// the map page: the stamp panel (top, end) and a stamp sending the map to its country
G.ui.openMenu('map');
await settle();
checks.mapStamps = qa('.mp-stamp').length;
checks.mapStampsOn = qa('.mp-stamp.on').length;
checks.mapChapters = qa('.mp-ch').length;
checks.roadAhead = !!q('.mp-ahead');
await T.shot('map-stamps');
const touch = !!G.input?.touch;
const scroller = touch ? q('.mp-side') : q('.mp-stamps');
scroller.scrollTop = scroller.scrollHeight;
await settle();
await T.shot('map-stamps-end');
scroller.scrollTop = 0;
await settle();
const target = qa('.mp-stamp.go').find((e) => e.textContent.includes('魔法使之国'));
const before = { ...G.ui.debug.UI.mapView };
if (target) {
  target.scrollIntoView({ block: 'nearest' });
  await T.frames(2);
  const r = target.getBoundingClientRect();
  if (touch && T.tap) await T.tap(r.left + r.width / 2, r.top + r.height / 2);
  else target.click();
}
await T.wait(900);
const after = { ...G.ui.debug.UI.mapView };
checks.flew = !!target && after.zoom > before.zoom + 0.5 && Math.hypot(after.cx - (-2160), after.cz - (-610)) < 40;
checks.view = { before, after };
await T.shot('map-fly');

// a long bag (22 extra things) and a long wardrobe row (the four real cards cloned to seven: the >4 layout)
G.ui.openMenu('items');
await settle();
const box = q('.mn-pane.on .mn-list .scroll');
checks.itemsScroll = box ? box.scrollHeight > box.clientHeight + 4 : false;
await T.shot('items-many');
G.ui.openMenu('wardrobe');
await settle();
const wrap = q('.wd-wrap'), grid = q('.wd-grid');
[...grid.children].slice(0, 3).forEach((c) => grid.appendChild(c.cloneNode(true)));
wrap.classList.add('many');
await settle();
checks.wardrobeScroll = grid.scrollWidth > grid.clientWidth + 4;
await T.shot('wardrobe-many');

// a sheet of every stamp in the registry, inked as when visited (looks: twelve seeds must read clearly different)
G.ui.closeMenu();
await T.frames(2);
const root = q('.mv-ui');
const sheet = document.createElement('div');
sheet.style.cssText = 'position:absolute;inset:0;z-index:99;pointer-events:none;padding:2.5% 3%;display:grid;align-content:start;'
  + 'grid-template-columns:repeat(auto-fill,minmax(calc(var(--u)*150),1fr));gap:calc(var(--u)*8) calc(var(--u)*14);'
  + 'background:var(--tex-parch),linear-gradient(180deg,#f8f2e4,#ecdfc5);background-size:calc(var(--u)*256) calc(var(--u)*256),100% 100%;background-blend-mode:multiply,normal;';
for (const c of G.ui.episodes.countries()) {
  const a = G.ui.episodes.stampArt(c);
  const cell = document.createElement('div');
  cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*2)';
  const s = document.createElement('div');
  s.style.cssText = `position:relative;width:100%;aspect-ratio:1.4;background:${a.url} center/contain no-repeat;transform:rotate(${a.tilt}deg);mix-blend-mode:multiply;opacity:.9`;
  const nm = document.createElement('div');
  nm.textContent = c.name ? G.i18n.t(c.name) : c.id;
  nm.style.cssText = `position:absolute;left:50%;top:${a.nameY}%;width:${a.nameW}%;transform:translate(-50%,-50%);text-align:center;color:${a.ink};font:600 calc(var(--u)*14)/1.15 var(--fd);text-wrap:balance;word-break:break-all`;
  s.appendChild(nm);
  const cap = document.createElement('div');
  cap.textContent = `${c.stamp?.seed} · ${a.shape} · ${a.border} · ${a.motif} · ${a.layout}`;
  cap.style.cssText = 'font:400 calc(var(--u)*10)/1.2 monospace;color:#6b5d4c';
  cell.append(s, cap);
  sheet.appendChild(cell);
}
root.appendChild(sheet);
await settle();
await T.shot('stamp-sheet');
sheet.remove();

const combos = new Set(G.ui.episodes.countries().map((c) => { const a = G.ui.episodes.stampArt(c); return [a.shape, a.border, a.motif, a.layout].join('/'); }));
checks.countries = G.ui.episodes.countries().length;
checks.episodes = G.ui.episodes.list().length;
checks.distinctStamps = combos.size;
P.journal = origJournal; P.items = origItems;
return { checks, errors: T.errors() };
