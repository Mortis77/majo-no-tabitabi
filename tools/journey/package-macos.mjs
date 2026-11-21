// Package the first two episodes for the local Mac. The web build and the app
// are published only after the packaged game has passed its own startup check.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (process.platform !== 'darwin') throw new Error('Run this packaging command on macOS.');
const name = '魔女之旅',
  desktop = path.join(root, 'desktop'),
  output = path.join(root, 'release');
await fs.mkdir(output, { recursive: true });
const stage = await fs.mkdtemp(path.join(output, '.pack-'));
const payload = path.join(stage, 'payload'),
  packed = path.join(stage, 'packed');
const folder = name + '-darwin-' + os.arch(),
  app = path.join(packed, folder, name + '.app');
const previous = [],
  published = [];
async function replace(from, to) {
  let exists = true;
  try {
    await fs.access(to);
  } catch {
    exists = false;
  }
  if (exists) {
    const backup = path.join(stage, 'previous-' + previous.length);
    await fs.rename(to, backup);
    previous.push([backup, to]);
  }
  await fs.rename(from, to);
  published.push(to);
}
try {
  await fs.mkdir(payload);
  const run = (bin, args, opts = {}) => execFileSync(bin, args, { cwd: root, stdio: 'inherit', ...opts });
  run(process.execPath, ['build.mjs', '--release', '--out', path.join(payload, 'dist')]);
  for (const file of ['main.js', 'package.json'])
    await fs.copyFile(path.join(desktop, file), path.join(payload, file));
  const version = JSON.parse(
    await fs.readFile(path.join(desktop, 'node_modules/electron/package.json'), 'utf8'),
  ).version;
  const packager = path.join(desktop, 'node_modules', '.bin', 'electron-packager');
  const args = [
    payload,
    name,
    '--electron-version=' + version,
    '--arch=' + os.arch(),
    '--platform=darwin',
    '--asar',
    '--no-prune',
    '--app-bundle-id=dev.majotabi.journey',
    '--out=' + packed,
  ];
  const icon = path.join(desktop, 'journey-icon.icns');
  await fs.access(icon);
  args.push('--icon=' + icon);
  run(packager, args);
  run('xattr', ['-cr', app]);
  run('codesign', ['--force', '--deep', '--sign', '-', app]);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  const smoke = run(path.join(app, 'Contents/MacOS', name), [], {
    timeout: 155000,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, MV_USERDATA: path.join(stage, 'test-profile'), MV_SMOKE: '1', MV_SMOKE_PLAY: '1' },
  });
  const row = smoke.split('\n').find((line) => line.startsWith('MV_SMOKE '));
  if (!row) throw new Error('Packaged game did not report a startup result.');
  const data = JSON.parse(row.slice(9));
  if (!data.ok || !data.playable || !data.renderer || data.errors?.length)
    throw new Error('Packaged startup failed: ' + row);
  const web = path.join(stage, 'web');
  run('/bin/cp', ['-cR', path.join(payload, 'dist'), web]);
  await replace(path.join(payload, 'dist'), path.join(desktop, 'dist'));
  await replace(web, path.join(root, 'dist'));
  await replace(path.join(packed, folder), path.join(output, folder));
  run('codesign', ['--verify', '--deep', '--strict', path.join(output, folder, name + '.app')]);
  console.log(row);
  console.log(path.join(output, folder, name + '.app'));
} catch (error) {
  for (const file of published.reverse()) await fs.rm(file, { recursive: true, force: true });
  for (const [backup, to] of previous.reverse()) await fs.rename(backup, to);
  throw error;
} finally {
  await fs.rm(stage, { recursive: true, force: true });
}
