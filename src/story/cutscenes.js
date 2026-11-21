// Cutscenes: opening, great-lantern lightings, boss introductions, the first sight of the ring, the town relit, the barrier,
// the ending. Built from G.cam.cinematic, G.ui.letterbox / fade / say, G.fx, G.sky. All skippable with the cancel action
// (Esc / Backspace): a skip jumps to the end state — every hook in skipped dialogue still runs.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t, raw } from '../core/i18n.js';
import { skipHint } from './bubbles.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const gy = (x, z) => (G.world?.groundAt ? G.world.groundAt(x, z, G.world.heightAt(x, z) + 2) : 0);

export function createCutscenes(story) {
  let cur = null, heldPrev = false;

  /** Heroine acting beat (animation only; no gameplay flag). `face` turns her toward a point first. */
  function act(state, face) {
    const P = G.player;
    if (!P?.rig || P.state !== 'ground') return;
    if (face) { const a = Math.atan2(face.x - P.pos.x, face.z - P.pos.z); if (Number.isFinite(a)) P.yaw = a; }
    P.rig.play(state, { restart: true, fade: 0.25 });
  }
  /** Press confirm a few frames so a pending say() resolves (G.ui exposes no cancel). */
  function pumpConfirm() {
    const sim = G.input?.sim; if (!sim) return;
    let n = 0;
    const tick = () => { if (!G.ui?.talking || n++ > 12) { sim.up?.('Enter'); return; } if (n % 2) sim.down?.('Enter'); else sim.up?.('Enter'); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  function makeCtx() {
    const c = {
      skipped: false,
      async shot(pos, look, dur = 1.5, ease = 'inOut') {
        if (c.skipped || !G.cam?.cinematic) return;
        await Promise.race([G.cam.cinematic({ pos, look, dur: Math.max(0.05, dur), ease }), c.until()]);
      },
      cut(pos, look) { if (G.cam?.cinematic) G.cam.cinematic({ pos, look, dur: 0.02 }); },
      wait(sec) { if (c.skipped) return Promise.resolve(); return Promise.race([new Promise((r) => setTimeout(r, sec * 1000)), c.until()]); },
      async say(id, opts = {}) { const r = await G.dialogue.play(id, { cam: false, keepCam: true, skippable: true, skipAll: c.skipped, ...opts }); return r; },
      until() { return c.skipped ? Promise.resolve() : new Promise((r) => { c._w.push(r); }); },
      _w: [],
      _wake() { const w = c._w.splice(0); for (const r of w) r(); },
    };
    return c;
  }

  /**
   * Run a cutscene body: async (c) => {...}. finish(c) always runs (also after a skip) and must leave the world in the end state.
   */
  async function run(name, body, finish) {
    if (cur) { try { await cur.p; } catch (e) { /* ignore */ } }
    const c = makeCtx();
    const prev = G.mode === 'cutscene' ? 'play' : G.mode;
    const wasBusy = story.busy;
    story.busy = true;
    G.setMode('cutscene');
    G.player?.setControl?.(false);
    G.ui?.letterbox?.(true);
    skipHint(t('story.ui.skip', { key: G.input?.keyLabel?.('cancel') || 'Esc' }));
    const p = (async () => {
      try { await body(c); } catch (e) { G.reportError('cutscene:' + name, e); }
      c.done = true;
      try { await finish?.(c); } catch (e) { G.reportError('cutscene:' + name + ':finish', e); }
    })();
    cur = { name, p, c };
    await p;
    cur = null;
    skipHint(null);
    G.ui?.letterbox?.(false);
    G.cam?.release?.();
    if (G.mode === 'cutscene') G.setMode(prev === 'ending' ? 'play' : prev || 'play');
    G.player?.setControl?.(true);
    story.busy = wasBusy; // a cutscene inside a talk / the ending leaves the outer owner in charge
    return !c.skipped;
  }

  const api = {
    get active() { return cur?.name || null; },
    /** Every frame (story.update): the cancel action skips the running cutscene. */
    tick() {
      // held, not pressed: the dialogue box consumes 'cancel' presses while a line is up
      const c = cur?.c;
      const h = !!(G.input?.held?.('cancel') || G.input?.pressed?.('cancel'));
      if (c && h && !heldPrev && !c.skipped && !c.done) api.skip();
      heldPrev = h;
    },
    skip() { const c = cur?.c; if (!c || c.skipped) return; c.skipped = true; G.dialogue?.skip?.(); pumpConfirm(); c._wake?.(); },
    run,
    /** Opening: a slow flight from the bright shrine toward the dark east while 日和婆婆 tells the legend. */
    opening() {
      return run('opening', async (c) => {
        const S = G.world.POI.shrine;
        G.ui?.fade?.(1, 0.01);
        c.cut(V(S.x - 30, 52, S.z + 40), V(S.x, 34, S.z));
        await c.wait(0.3);
        G.ui?.fade?.(0, 1.6);
        G.ui?.banner?.(t('story.scene.opening'), t('story.scene.openingSub'));
        const L = raw('story.dlg.main.opening') || [];
        const legs = [
          [V(S.x - 10, 60, S.z + 30), V(S.x + 40, 40, S.z - 10), 6],
          [V(-380, 95, 60), V(-100, 50, -40), 7],
          [V(-160, 120, 10), V(200, 60, -60), 7],
          [V(40, 150, -30), V(380, 120, -40), 7],
          [V(150, 170, -40), V(380, 160, -40), 6],
        ];
        // the camera keeps flying while each line is read
        const fly = (async () => { for (const [p, l, d] of legs) await c.shot(p, l, d, 'linear'); })();
        await c.wait(1.4); // let the fade-in and the title card land before the first line types under it
        for (let i = 0; i < L.length - 1 && !c.skipped; i++) await c.say([L[i]]);
        await fly;
        if (!c.skipped) { await G.ui?.fade?.(1, 1.2); }
      }, async (c) => {
        G.ui?.fade?.(1, 0.01);
        const A = G.world.ANCHORS.spawn;
        G.player?.teleport?.(A.x, undefined, A.z);
        if (G.player) G.player.yaw = Math.PI;
        G.cam?.release?.(); G.cam?.snap?.();
        story.setFlag('opening_seen');
        await new Promise((r) => setTimeout(r, 200));
        G.ui?.fade?.(0, 1.4);
        const L = raw('story.dlg.main.opening') || [];
        if (!c.skipped && L.length) await G.dialogue.play([L[L.length - 1]], { cam: false, keepCam: true });
      });
    },
    /** Great lantern lighting: close shot, ignite, pull back while the light washes over the land, banner, lines. */
    lantern(id, lines) {
      const h = G.structures?.greatLanterns?.[id];
      const p = h?.pos ? h.pos.clone() : (G.world.anchor(G.world.GREAT_LANTERNS.find((g) => g.id === id)?.anchor || 'dusk_lantern'));
      return run('lantern:' + id, async (c) => {
        const P = G.player.pos;
        const dx = P.x - p.x, dz = P.z - p.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
        act('offer', p);
        await c.shot(V(p.x + ux * 9 + uz * 3, p.y + 4.5, p.z + uz * 9 - ux * 3), V(p.x, p.y + 3.4, p.z), 1.2);
        if (!G.gameplay?.isGreatLanternLit?.(id)) G.gameplay?.igniteGreatLantern?.(id);
        act('pray');
        await c.wait(1.6);
        G.fx?.ring?.(V(p.x, p.y + 0.3, p.z), { color: 0xffd27a, radius: 70, dur: 3.2, intensity: 1.4 });
        G.sky?.flash?.(0xffe3a8, 0.9);
        G.ui?.banner?.(t('story.scene.lit.' + id), t('story.scene.litSub'));
        await c.shot(V(p.x + ux * 42 + uz * 18, p.y + 30, p.z + uz * 42 - ux * 18), V(p.x, p.y + 6, p.z), 4.2, 'out');
        await c.wait(0.6);
        if (lines) await c.say(lines);
      }, () => { if (!G.gameplay?.isGreatLanternLit?.(id)) G.gameplay?.igniteGreatLantern?.(id, { instant: true }); });
    },
    /** Boss introduction: frame the boss (the fight is already spawned; enemies freeze outside 'play'), a few lines. */
    bossIntro(id, lines) {
      return run('boss:' + id, async (c) => {
        await c.wait(0.25);
        const e = G.combat?.boss?.enemy || G.combat?.duel?.enemy || G.combat?.enemies?.find?.((x) => x.boss);
        const P = G.player.pos;
        const bp = e?.pos ? e.pos.clone() : V(P.x, P.y, P.z - 12);
        const hgt = Math.max(2, e?.height || 3);
        const dx = P.x - bp.x, dz = P.z - bp.z, l = Math.hypot(dx, dz) || 1;
        await c.shot(V(bp.x + dx / l * (6 + hgt * 1.6) + dz / l * 3, bp.y + hgt * 0.9 + 1.5, bp.z + dz / l * (6 + hgt * 1.6) - dx / l * 3), V(bp.x, bp.y + hgt * 0.6, bp.z), 1.1);
        G.fx?.shake?.(0.35, 0.6);
        act('surprised', bp);
        await c.wait(0.9);
        act('guard_enter');
        await c.shot(V(P.x - dx / l * 2.5 + dz / l * 1.6, P.y + 2.2, P.z - dz / l * 2.5 - dx / l * 1.6).add(V(dx / l * 5, 0, dz / l * 5)), V(bp.x, bp.y + hgt * 0.5, bp.z), 0.8);
        if (lines) await c.say(lines);
      });
    },
    /** The first sight of the ring over the evernight. */
    ring(lines) {
      return run('ring', async (c) => {
        const P = G.player.pos, s = G.env.sunDir;
        await c.shot(V(P.x - s.x * 3, P.y + 1.4, P.z - s.z * 3), V(P.x + s.x * 100, P.y + 1.6 + s.y * 100, P.z + s.z * 100), 2.4);
        G.ui?.banner?.(t('story.scene.ringTitle'), t('story.scene.ringSub'));
        act('surprised');
        G.sky?.setRingBoost?.(1.6);
        await c.wait(1.0);
        if (lines) await c.say(lines);
      }, () => { G.sky?.setRingBoost?.(1); });
    },
    /** 万灯镇 relit: the tower first, then every street lantern. */
    townLit(lines) {
      return run('town', async (c) => {
        const tw = G.world.ANCHORS.town_lamp, y = gy(tw.x, tw.z);
        await c.shot(V(tw.x + 26, y + 10, tw.z + 26), V(tw.x, y + 12, tw.z), 1.3);
        G.structures?.places?.town?.setLit?.(true);
        G.fx?.burst?.('lantern_ignite', V(tw.x, y + (G.structures?.places?.town?.tower?.lampY || 18), tw.z), { scale: 3 });
        G.sky?.flash?.(0xffc98a, 0.5);
        await c.shot(V(tw.x + 48, y + 34, tw.z + 40), V(tw.x, y + 8, tw.z), 3.6, 'out');
        G.ui?.banner?.(t('story.scene.townLit'), '');
        act('cheer');
        if (lines) await c.say(lines);
      }, () => { G.structures?.places?.town?.setLit?.(true); });
    },
    /** 月障 falls. */
    barrier(lines) {
      return run('barrier', async (c) => {
        const p = G.world.POI.palace;
        const P = G.player.pos;
        const dx = P.x - p.x, dz = P.z - p.z, l = Math.hypot(dx, dz) || 1;
        await c.shot(V(p.x + dx / l * 260, 120, p.z + dz / l * 260), V(p.x, 120, p.z), 1.8);
        G.ui?.banner?.(t('story.scene.barrier'), '');
        await c.wait(2.2);
        if (lines) await c.say(lines);
      });
    },
    /** Ending: ring blazes, every lantern lights in a wave, epilogue, credits, then free roam. */
    ending() {
      return run('ending', async (c) => {
        const p = G.world.POI.palace;
        G.sky?.setRingBoost?.(3);
        await c.shot(V(p.x + 60, 190, p.z + 120), V(p.x, 150, p.z), 2.2);
        // the wave: stone lanterns by distance from the palace, then the town
        const ids = (G.world.STONE_LANTERNS || []).slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).map((s) => s.id);
        for (const id of ids) { if (c.skipped) break; G.gameplay?.lightLantern?.(id, { silent: true }); await c.wait(0.18); }
        G.structures?.places?.town?.setLit?.(true);
        // the heroine, close: she prays, then bows to the lit land
        const H = G.player?.pos;
        if (H && !c.skipped) {
          const f = G.player.yaw || 0, fx = Math.sin(f), fz = Math.cos(f);
          await c.shot(V(H.x + fx * 3.2 - fz * 1.2, H.y + 1.5, H.z + fz * 3.2 + fx * 1.2), V(H.x, H.y + 1.25, H.z), 1.4);
          act('pray');
          await c.wait(2.6);
          act('bow');
          await c.wait(2.2);
        }
        await c.shot(V(p.x - 260, 260, p.z + 260), V(p.x, 80, p.z), 5, 'inOut');
      }, async (c) => {
        for (const s of G.world.STONE_LANTERNS || []) G.gameplay?.lightLantern?.(s.id, { silent: true, instant: true });
        story.setFlag('ending_done'); story.setFlag('postgame');
        if (G.ui?.showEnding) {
          try { await G.ui.showEnding({ lines: raw('story.scene.ending') || [], title: t('story.ui.endingTitle'), credits: raw('story.ui.credits') || [] }); }
          catch (e) { G.reportError('story:ending', e); }
        }
        G.sky?.setRingBoost?.(1.6);
        G.setMode('cutscene');
      });
    },
  };
  return api;
}
