// node build.mjs [--only A,B] [--out file.glb]   -> samples all clip modules into one mesh-less library
import path from 'node:path';
import { loadSkeleton, makeSolver, sampleClip, writeLibrary } from './synth.mjs';
import { CLIPS } from './clips/index.mjs';
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const only = opt('only') ? new Set(opt('only').split(',')) : null;
const S = await loadSkeleton(path.resolve('../../assets/models/chars/anim_ual.glb'));
const solver = makeSolver(S);
const sampled = [];
for (const c of CLIPS) {
  if (only && !only.has(c.name)) continue;
  const s = sampleClip(S, solver, c); sampled.push(s);
  if (s.warns.length) console.log('WARN', c.name, s.warns.slice(0, 6).join(' | '));
}
const outF = path.resolve(opt('out', 'out/anim_miko.glb'));
const bytes = await writeLibrary(S, sampled, outF, 'CC0 1.0 — original keyframed animation for Moonveil Miko (anim2 synth), VRoid humanoid skeleton');
console.log(JSON.stringify({ out: outF, kB: Math.round(bytes / 1024), clips: sampled.map((s) => s.name + ':' + s.dur) }));
