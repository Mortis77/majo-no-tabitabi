// Small speech bubbles over heads in the world (NPC barks, 团子's hints). DOM in G.uiRoot, projected in lateUpdate.
import * as THREE from 'three';
import { G } from '../core/game.js';

let root = null;
const live = [];
const _p = new THREE.Vector3();

function css() {
  if (document.getElementById('mv-story-css')) return;
  const s = document.createElement('style');
  s.id = 'mv-story-css';
  s.textContent = `
.mvs-bub { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); max-width: 320px; padding: 7px 14px 8px; border-radius: 14px;
  background: rgba(255, 249, 236, 0.94); color: #3a2a1e; font: 500 15px/1.45 var(--fb, var(--ft, serif)); letter-spacing: .04em; white-space: pre-wrap;
  box-shadow: 0 0 0 1.5px rgba(196, 150, 70, .75), 0 4px 14px rgba(20, 10, 30, .35); opacity: 0; transition: opacity .25s; pointer-events: none; }
.mvs-bub::after { content: ''; position: absolute; left: 50%; bottom: -7px; margin-left: -7px; border: 7px solid transparent; border-bottom: 0;
  border-top-color: rgba(255, 249, 236, 0.94); }
.mvs-bub.on { opacity: 1; }
.mvs-bub.dango { background: rgba(255, 238, 205, 0.96); color: #4a2a14; box-shadow: 0 0 0 1.5px rgba(255, 190, 90, .9), 0 0 16px rgba(255, 190, 90, .45); }
.mvs-bub .nm { display: block; font-size: 12px; color: #b0412e; letter-spacing: .2em; margin-bottom: 1px; }
.mvs-skip { position: absolute; right: 28px; bottom: 22px; color: rgba(255, 246, 228, .78); font: 500 14px/1 var(--fb, serif); letter-spacing: .12em;
  text-shadow: 0 1px 3px rgba(0,0,0,.6); opacity: 0; transition: opacity .4s; pointer-events: none; }
.mvs-skip.on { opacity: 1; }
`;
  document.head.appendChild(s);
}

export function initBubbles() {
  if (root || !G.uiRoot) return;
  css();
  root = document.createElement('div');
  root.className = 'mvs-layer';
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3';
  G.uiRoot.appendChild(root);
}

/**
 * Show a bubble. getPos(out) -> world Vector3 (head) each frame. opts { name?, dur=3.4, cls? } -> handle { close() }
 * One bubble per owner key: a new one replaces the old.
 */
export function bubble(key, text, getPos, { name = '', dur = 3.4, cls = '' } = {}) {
  if (!root) initBubbles();
  if (!root) return null;
  for (const b of live) if (b.key === key) b.t = Math.min(b.t, 0.01);
  const el = document.createElement('div');
  el.className = 'mvs-bub ' + cls;
  if (name) { const n = document.createElement('span'); n.className = 'nm'; n.textContent = name; el.appendChild(n); }
  el.appendChild(document.createTextNode(text));
  root.appendChild(el);
  const b = { key, el, getPos, t: dur, shown: false, close() { b.t = Math.min(b.t, 0.01); } };
  live.push(b);
  return b;
}

export function bubblesActive(key) { return live.some((b) => b.key === key && b.t > 0.3); }

export function clearBubbles() { for (const b of live) b.t = Math.min(b.t, 0.01); }

/** Project + age. Call from lateUpdate with the real dt. */
export function updateBubbles(rdt) {
  if (!live.length) return;
  const cam = G.camera, w = root?.clientWidth || window.innerWidth, h = root?.clientHeight || window.innerHeight;
  const hideAll = G.mode === 'menu' || G.mode === 'ending' || G.mode === 'title' || !!G.ui?.talking;
  for (let i = live.length - 1; i >= 0; i--) {
    const b = live[i];
    b.t -= rdt;
    let vis = !hideAll && b.t > 0;
    if (vis) {
      const p = b.getPos?.(_p);
      if (!p) vis = false;
      else {
        p.project(cam);
        if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) vis = false;
        else b.el.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(1)}px, ${((1 - p.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`;
      }
    }
    b.el.classList.toggle('on', vis);
    if (b.t <= -0.4) { b.el.remove(); live.splice(i, 1); }
  }
}

/** "Esc 跳过" corner hint for cutscenes. */
let skipEl = null;
export function skipHint(text) {
  if (!root) initBubbles();
  if (!root) return;
  if (!skipEl) { skipEl = document.createElement('div'); skipEl.className = 'mvs-skip'; root.appendChild(skipEl); }
  if (text) skipEl.textContent = text;
  skipEl.classList.toggle('on', !!text);
}
