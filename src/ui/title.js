// The title looks out over the Land of Mages from the western approach.
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { K, el, tel, fmtTime, hintLine, pushModal, popModal, sfx, codeLabel, noteSelfUnlock } from './dom.js';
import { icon } from './icons.js';
import { addCss } from './style.js';
import { navList, openSheet, confirmBox } from './panels.js';

addCss(`
.mv-title {pointer-events:auto;opacity:0;transition:opacity .55s;color:#fff7e6;background:#4d6271 url("assets/textures/journey/magic-country-title.webp") center 45% / cover no-repeat;}
.mv-title.on {opacity:1;}
.mv-title.out {opacity:0;pointer-events:none;}
.tt-wash {position:absolute;inset:0;background:linear-gradient(90deg,rgba(19,30,41,.80),rgba(24,37,44,.56) 30%,transparent 65%),linear-gradient(0deg,rgba(18,26,36,.7),transparent 32%);}
.tt-name,.tt-menu,.tt-load {position:absolute;left:7.4%;}
.tt-name {bottom:48%;padding-bottom:30u;}
.tt-name .nm {font:600 93u/1.12 var(--ft);letter-spacing:.09em;text-shadow:0 3u 16u #17212f80;}
.tt-name .tag {margin-top:18u;display:flex;align-items:center;gap:14u;font:500 18u/1.3 var(--ft);letter-spacing:.14em;color:#f6e7c9;}
.tt-name .tag::before {content:'';width:44u;height:1u;background:#dbc68e;}
.tt-menu {top:52%;width:300u;}
.tt-menu .btn {width:100%;box-sizing:border-box;min-height:46u;display:flex;align-items:center;gap:14u;border:0;border-left:2u solid transparent;border-radius:0;background:transparent;color:#fff8e9;font:500 22u/1.2 var(--ft);text-align:left;padding:8u 18u;cursor:pointer;}
.tt-menu .btn .ic {font-size:16u;color:#dac8a4;}
.tt-menu .btn:hover,.tt-menu .btn.sel {color:#fff9eb;border-left-color:#eedbab;background:linear-gradient(90deg,rgba(230,221,191,.23),transparent);}
.tt-menu .info {font:13u/1.4 var(--fb);color:#efdfc3;margin:2u 0 8u 50u;}
.tt-load {bottom:7.8%;width:240u;font:13u/1.6 var(--fb);}
.tt-load .lb {height:2u;background:#fff4;}
.tt-load i {display:block;height:2u;background:#ead6a7;transition:width .25s;}
.mv-title.ready .tt-load {display:none;}
.mv-title .btn.wait {opacity:.6;}
.tt-foot,.tt-ver {position:absolute;bottom:3.8%;font:13u/1.4 var(--fb);color:#eadfcb;}
.tt-foot {left:7.4%;}
.tt-ver {right:4%;}
`);

export function createTitle(root, stage) {
  let open = null; // { resolve, info }

  function placeOf(info) {
    try {
      const p = info && info.player;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && G.world?.regionAt) {
        const id = G.world.regionAt(p.x, p.z);
        if (has('world.place.' + id)) return t('world.place.' + id);
      }
    } catch (e) { /* the world may be absent */ }
    return t('world.name');
  }

  function show({ hasSave, saveInfo, ready: readyP } = {}) {
    if (open) return open.promise;
    const R = el('div', 'layer mv-title', root);
    el('div', 'tt-wash', R);
    const nameBox = el('div', 'tt-name', R);
    const nm = el('div', 'nm', nameBox);
    const paintName = () => { nm.textContent = t('core.title'); };
    paintName();
    tel('div', 'tag', nameBox, 'ui.title.tagline');
    const menu = el('div', 'tt-menu', R);
    const items = [];
    const add = (id, ic, key, info) => {
      const it = el('div', 'it', menu);
      const b = el('div', 'btn', it); icon(ic, '', b); tel('span', '', b, key);
      if (info) tel('div', 'info', it, 'ui.title.saveInfo', info);
      b._id = id;
      items.push(b);
    };
    if (hasSave) add('continue', 'resume', 'ui.title.continue', () => ({ place: placeOf(saveInfo), time: fmtTime(saveInfo && saveInfo.playTime) }));
    add('new', 'brush', 'ui.title.new');
    add('settings', 'settings', 'ui.title.settings');
    add('controls', 'journal', 'ui.title.controls');

    const foot = el('div', 'tt-foot', R);
    const paintFoot = () => hintLine(foot, 'ui.title.hint', { up: '↑', down: '↓', ok: codeLabel('Enter') });
    paintFoot();
    tel('div', 'tt-ver', R, 'ui.title.version', { v: G.version });

    // boot (docs/api/perf.md "Boot and loading"): the title can open while the world still loads behind it; then
    // "continue" / "new" are dimmed under a progress line, and a choice made early is kept and carried out when ready
    let ready = !readyP, queued = null;
    const loadBox = el('div', 'tt-load', R);
    const loadTx = el('div', '', loadBox), loadBar = el('i', '', el('div', 'lb', loadBox));
    const paintLoad = (p) => { if (!p) return; if (p.text) loadTx.textContent = p.text; loadBar.style.width = Math.round((p.frac || 0) * 100) + '%'; };
    const offProg = G.events.on('boot:progress', paintLoad);
    paintLoad(G.bootProgress?.());
    const gameBtns = items.filter((b) => b._id === 'new' || b._id === 'continue');
    if (ready) R.classList.add('ready'); else for (const b of gameBtns) b.classList.add('wait');
    if (readyP) readyP.then(() => {
      ready = true; offProg?.();
      R.classList.add('ready');
      for (const b of gameBtns) b.classList.remove('wait', 'queued');
      if (queued && open) { const q = queued; queued = null; pick(q, true); }
    });

    let busy = false;
    const nav = navList(items, (i) => pick(items[i]._id)).bind();

    async function pick(id, fromQueue = false) {
      if (busy) return;
      if (!fromQueue) sfx('ui_select');
      if (id === 'settings' || id === 'controls') { busy = true; await openSheet(root, id); busy = false; return; }
      if (id === 'new' && hasSave && !fromQueue) {
        busy = true;
        const ok = await confirmBox(root, { title: t('ui.title.overwriteTitle'), text: t('ui.title.overwriteText'), yes: t('ui.title.overwriteYes'), no: t('ui.title.overwriteNo'), seal: t('ui.seal.done') });
        busy = false;
        if (!ok) return;
      }
      if (!ready && (id === 'new' || id === 'continue')) {
        queued = id;
        for (const b of gameBtns) b.classList.toggle('queued', b._id === id);
        return;
      }
      busy = true;
      // the click / key press that chose is a user gesture: capture the pointer for play now
      try { G.input?.requestLock(); } catch (e) { /* ignore */ }
      R.classList.add('out');
      popModal(modal);
      await stage.fade(1, 0.55, '#07060e');
      R.remove();
      const o = open; open = null;
      o.resolve(id);
    }

    const modal = {
      el: R,
      relabel() { paintName(); paintFoot(); },
      update() { if (!busy) nav.keys(); K.eat(); },
    };
    pushModal(modal);
    requestAnimationFrame(() => requestAnimationFrame(() => R.classList.add('on')));
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    open = { resolve, promise };
    noteSelfUnlock();
    return promise;
  }

  return { show, get open() { return !!open; } };
}
