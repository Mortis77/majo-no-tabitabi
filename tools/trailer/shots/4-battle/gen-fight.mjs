// node tools/trailer/shots/4-battle/gen-fight.mjs — writes fight-game.js and fight-side.js from fight.template.js
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const dir = path.dirname(url.fileURLToPath(import.meta.url));
const tpl = fs.readFileSync(path.join(dir, 'fight.template.js'), 'utf8');
const SIDE = `(f, G, R) => {
    const P = G.player, gy = G.world.heightAt(500, -290);
    if (f < 288) { // the rise: low wide in front of her, the lit horizon behind, a slow push-in
      const u = Math.max(0, f) / 288, e = u * u * (3 - 2 * u);
      const d = 9.0 - 1.6 * e, a = -0.59 + 0.12 - 0.2 * e;
      return { pos: [500 + Math.sin(a) * d, gy + 0.7 + 0.1 * e, -290 + Math.cos(a) * d], look: [500, gy + 1.25, -290], fov: 34 - 2 * e };
    }
    // the fight: a low side angle on her and her target, smoothed like an operator would
    const C = G.combat; let t = C.lockTarget && !C.lockTarget.dead ? C.lockTarget : null;
    if (!t) { let best = 1e9; for (const e of C.enemies) if (!e.dead) { const dd = e.pos.distanceTo(P.pos); if (dd < best) { best = dd; t = e; } } }
    let dx = t ? t.pos.x - P.pos.x : Math.sin(P.yaw), dz = t ? t.pos.z - P.pos.z : Math.cos(P.yaw);
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const S = window.__sc || (window.__sc = { f: -1 });
    let px = dz, pz = -dx;
    if (S.sx !== undefined && px * S.sx + pz * S.sz < 0) { px = -px; pz = -pz; }
    const span = t ? Math.min(6, L) : 3, wide = f >= 690 ? Math.min(1, (f - 690) / 40) : 0;
    // keep clear of crystal spires: a candidate is scored by its nearest spire to the camera and to the sight line
    const cand = (sg, kk) => { const off = (4.6 + span * 0.35 + 5 * wide) * kk, back = 1.2 + 5 * wide;
      const cx = P.pos.x - dx * back + sg * px * off, cz = P.pos.z - dz * back + sg * pz * off; let m = 1e9;
      for (const c of (window.__crys || [])) { const r = 0.4 + c[2] * 0.8; for (let k = 0; k <= 5; k++) { const qx = cx + (P.pos.x - cx) * k / 6, qz = cz + (P.pos.z - cz) * k / 6; m = Math.min(m, Math.hypot(c[0] - qx, c[1] - qz) - r); } }
      return { sg, kk, m, x: cx, z: cz }; };
    let best = null;
    for (const [sg, kk, pen] of [[1, 1, 0], [1, 0.75, 0.6], [-1, 1, 1.4], [-1, 0.75, 2.0], [1, 0.5, 1.2], [-1, 0.5, 2.6]]) {
      const c = cand(sg, kk); const sc = Math.min(c.m, 1.2) - pen * 0.5; if (!best || sc > best.sc) { best = c; best.sc = sc; } }
    px *= best.sg; pz *= best.sg;
    S.sx = px; S.sz = pz; S.side = 1;
    const tp = [best.x, gy + 0.8 + 1.0 * wide, best.z];
    const tl = [P.pos.x + dx * span * 0.45, P.pos.y + 1.1 + 0.4 * wide, P.pos.z + dz * span * 0.45];
    if (!S.p || f < S.f || f - S.f > 3) { S.p = tp.slice(); S.l = tl.slice(); }
    const k = Math.min(1, 0.06 * Math.max(1, f - S.f));
    for (let i = 0; i < 3; i++) { S.p[i] += (tp[i] - S.p[i]) * k; S.l[i] += (tl[i] - S.l[i]) * k * 1.5; }
    S.f = f;
    return { pos: S.p.slice(), look: S.l.slice(), fov: 46 };
  }`;
const mk = (name, cam) => tpl.replace('__NAME__', name).replace('__FRAMES__', '880').replace('__CAMERA__', cam).replace('__CX__', 'G.player.pos.x').replace('__CZ__', 'G.player.pos.z')
  .replace('Generated from fight.template.js by gen-fight.mjs — edit the template, not the outputs.', 'Generated from fight.template.js by gen-fight.mjs.');
fs.writeFileSync(path.join(dir, 'fight-game.js'), mk('fight-game', "'game'").replace("frames: 880", "frames: 920"));
fs.writeFileSync(path.join(dir, 'fight-side.js'), mk('fight-side', SIDE));
console.log('written');
