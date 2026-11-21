import { loadModel, sampleSurface } from '../model.mjs';
import { ST } from './pagoda.mjs';
const M = await loadModel('tools/sculpt/assets/pagoda.mjs');
const st = ST[0]; const out = new Float32Array(8);
for (const a of [3.0, 3.5, 3.8, 3.95]) {
  const y = st.topY(a) + 0.1;
  const p = sampleSurface(M, 0.3, y, a, out);
  console.log(a, p.name, Array.from(out).map(v => v.toFixed(2)).join(' '));
}
