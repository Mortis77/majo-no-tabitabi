// Keyboard + mouse input with named actions. Gameplay actions are automatically silenced unless G.mode === 'play'.
//   G.input.held('sprint')  G.input.pressed('jump')  G.input.released('attack')
//   G.input.moveX / moveY   (-1..1, right / forward)        G.input.lookX / lookY (mouse pixels this frame)

import { t, has } from './i18n.js';

export const BINDINGS = {
  // gameplay
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],              // on the broom: climb
  descend: ['KeyC', 'ControlLeft'],
  sprint: ['ShiftLeft', 'ShiftRight'], // on the broom: boost
  broom: ['KeyF'],              // 唤帚: summon / dismiss the broom
  interact: ['KeyE'],
  dodge: ['KeyQ'],              // 闪身
  attack: ['Mouse0'],           // 灵符
  cast: ['Mouse2'],             // cast the selected 灵诀 (tap = small form, hold & release = big form)
  guard: ['KeyR'],              // 结界
  heal: ['KeyX'],               // eat a 团子
  summon: ['KeyZ'],             // 式神
  ultimate: ['KeyG'],           // 金环
  lock: ['Mouse1', 'KeyT'],
  wheel: ['Tab'],               // hold: spell wheel
  el1: ['Digit1'], el2: ['Digit2'], el3: ['Digit3'], el4: ['Digit4'], el5: ['Digit5'], el6: ['Digit6'], el7: ['Digit7'], el8: ['Digit8'],
  // always available
  map: ['KeyM'], journal: ['KeyJ'], spellbook: ['KeyB'], pause: ['Escape', 'KeyP'],
  confirm: ['KeyE', 'Space', 'Enter', 'Mouse0'], cancel: ['Escape', 'Backspace'],
  uiUp: ['KeyW', 'ArrowUp'], uiDown: ['KeyS', 'ArrowDown'], uiLeft: ['KeyA', 'ArrowLeft'], uiRight: ['KeyD', 'ArrowRight'],
};
const ALWAYS = new Set(['map', 'journal', 'spellbook', 'pause', 'confirm', 'cancel', 'uiUp', 'uiDown', 'uiLeft', 'uiRight']);

/** Human-readable key label for an action (first binding), e.g. keyLabel('interact') -> 'E'. */
export function keyLabel(action) {
  const c = (BINDINGS[action] || [''])[0];
  if (has('core.key.' + c)) return t('core.key.' + c);
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  return c;
}

export function createInput(G) {
  const canvas = G.canvas;
  const held = new Set(), pressed = new Set(), released = new Set();
  let swallowClick = false;
  let dragging = false;

  const input = {
    bindings: BINDINGS,
    keyLabel,
    lookX: 0, lookY: 0, wheel: 0,
    locked: false,
    /** true while the pointer is NOT locked and the user is dragging to look around (fallback mode). */
    dragLook: false,
    anyPressed: false,
    get moveX() { return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0); },
    get moveY() { return (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0); },
    _ok(action) { return ALWAYS.has(action) || G.mode === 'play'; },
    held(action) { if (!this._ok(action)) return false; const b = BINDINGS[action]; if (!b) return false; for (const c of b) if (held.has(c)) return true; return false; },
    pressed(action) { if (!this._ok(action)) return false; const b = BINDINGS[action]; if (!b) return false; for (const c of b) if (pressed.has(c)) return true; return false; },
    released(action) { if (!this._ok(action)) return false; const b = BINDINGS[action]; if (!b) return false; for (const c of b) if (released.has(c)) return true; return false; },
    /** Raw key code queries, never mode-gated (e.g. 'KeyK'). */
    codeHeld(code) { return held.has(code); },
    codePressed(code) { return pressed.has(code); },
    /** Forget a press so no later system reacts to it this frame. */
    consume(action) { for (const c of BINDINGS[action] || []) pressed.delete(c); },
    requestLock() {
      if (G.params.nolock || !canvas.requestPointerLock) return;
      try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => lockRefused()); } catch (e) { lockRefused(); }
    },
    exitLock() { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
    endFrame() { pressed.clear(); released.clear(); this.lookX = 0; this.lookY = 0; this.wheel = 0; this.anyPressed = false; },
    /** Test hooks: drive the game without real devices. */
    sim: {
      down(code) { down(code); },
      up(code) { up(code); },
      look(dx, dy) { input.lookX += dx; input.lookY += dy; },
      releaseAll() { for (const c of [...held]) up(c); },
    },
  };

  function down(code) { if (!held.has(code)) { held.add(code); pressed.add(code); input.anyPressed = true; } }
  function up(code) { if (held.has(code)) { held.delete(code); released.add(code); } }

  const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'Backspace']);
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (PREVENT.has(e.code) || (e.code === 'KeyF' && !e.metaKey && !e.ctrlKey)) e.preventDefault();
    if (e.metaKey) return;
    if (!e.repeat) down(e.code);
  });
  window.addEventListener('keyup', (e) => up(e.code));
  window.addEventListener('blur', () => { for (const c of [...held]) up(c); dragging = false; if (pend) { clearTimeout(pend.timer); pend = null; } });

  // Without pointer lock (lock refused, trackpads, headless) the mouse works by dragging: a drag looks around,
  // a click or a still hold of the left button attacks. A left press is held back until it is clearly one or the other,
  // so turning the view never throws charms.
  let lockPending = null;      // { button } while a lock request made by this press is unanswered
  let lockFailT = -1e9;        // when the browser last refused the lock (we do not nag it again right away)
  let pend = null;             // { code, t, dist, timer } — a left press not yet delivered
  const DRAG_PX = 7, HOLD_MS = 170;
  const flushPend = () => { if (!pend) return; clearTimeout(pend.timer); const c = pend.code; pend = null; down(c); };
  const pressDrag = (button) => {
    dragging = true;
    const code = 'Mouse' + button;
    if (button === 0 && !input.locked && G.mode === 'play') {
      if (pend) clearTimeout(pend.timer);
      pend = { code, dist: 0, timer: setTimeout(flushPend, HOLD_MS) };
    } else down(code);
  };
  canvas.addEventListener('mousedown', (e) => {
    canvas.focus?.();
    if (G.mode === 'play' && !input.locked && !G.params.nolock && canvas.requestPointerLock && performance.now() - lockFailT > 4000) {
      input.requestLock();
      swallowClick = true; // the click that grabs the pointer is not an attack
      lockPending = { button: e.button };
      return;
    }
    pressDrag(e.button);
  });
  window.addEventListener('mouseup', (e) => {
    dragging = false;
    lockPending = null;
    if (swallowClick) { swallowClick = false; return; }
    if (pend && pend.code === 'Mouse' + e.button) { // a click: press now, release a couple of frames later so it reads as a tap
      const c = pend.code; flushPend();
      requestAnimationFrame(() => requestAnimationFrame(() => { if (!dragging) up(c); }));
      return;
    }
    up('Mouse' + e.button);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (input.locked) { input.lookX += e.movementX || 0; input.lookY += e.movementY || 0; }
    else if (dragging && G.mode === 'play') {
      input.lookX += e.movementX || 0; input.lookY += e.movementY || 0;
      if (pend && (pend.dist += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0)) > DRAG_PX) { clearTimeout(pend.timer); pend = null; } // a look-drag, not an attack
    }
    input.dragLook = !input.locked && dragging;
  });
  canvas.addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerlockchange', () => {
    const was = input.locked;
    input.locked = document.pointerLockElement === canvas;
    if (was && !input.locked) {
      for (const c of ['Mouse0', 'Mouse1', 'Mouse2']) up(c);
      G.events.emit('input:lockLost');
    }
    if (!was && input.locked) G.events.emit('input:lockGained');
  });
  function lockRefused() {
    input.locked = document.pointerLockElement === canvas;
    if (input.locked) return;
    lockFailT = performance.now();
    // the press that asked for the lock still counts: it becomes an ordinary drag / click
    if (lockPending && swallowClick) { swallowClick = false; const b = lockPending.button; lockPending = null; pressDrag(b); }
  }
  document.addEventListener('pointerlockerror', lockRefused);

  return input;
}
