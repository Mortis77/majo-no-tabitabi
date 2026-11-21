import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// Bundle the sampler with its transitive map definitions. A changed street,
// roof foundation or river gets a new field. The browser still handles later
// gameplay craters and wall shading on top of the shipped base samples.
export async function bakeJourneyField(root) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/world/terrain/textures.js')],
    bundle: true,
    platform: 'node',
    packages: 'external',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].contents;
  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
  const file = path.join(root, 'assets', '_terrain_cache', hash + '.gz');
  try {
    await fs.access(file);
    return hash;
  } catch {}
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = await fs.mkdtemp(path.join(root, '.field-bake-'));
  try {
    const module = path.join(temp, 'sampler.mjs');
    await fs.writeFile(module, code);
    const { DATA_N, fillDataRow } = await import(pathToFileURL(module).href);
    const values = new Uint16Array(DATA_N * DATA_N * 4);
    for (let y = 0; y < DATA_N; y++) fillDataRow(values, y);
    const packed = gzipSync(Buffer.from(values.buffer), { level: 3 });
    const stage = path.join(temp, 'field.gz');
    await fs.writeFile(stage, packed);
    await fs.rename(stage, file);
    return hash;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
