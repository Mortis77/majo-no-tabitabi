#!/usr/bin/env node
// Frame-exact, repeatable recording of one trailer shot, rendered by the game itself (tools/trailer/README.md).
//
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/test-run.js [--take 1] [--out dir]
//        [--ss 2]            supersample factor: render at device scale 2 (3840x2160) and scale down with lanczos (default 2; 1 = off)
//        [--master]          keep the supersampled resolution in the intermediate (4K master) instead of scaling to 1080p
//        [--codec prores|h264]  prores = ProRes 422 HQ 10-bit .mov (default); h264 = all-intra x264 crf 8 yuv420p .mp4
//        [--blur n]          override the shot's motion-blur sub-frames (1 = off)
//        [--frames n]        override the shot length (quick tests)      [--preroll n]  override the preroll
//        [--seed n]          override the shot's random seed
//        [--quality high]    game quality tier (default high)           [--params "k=v&k2=v2"] extra URL parameters
//        [--timeout 900]     seconds allowed for boot + shot
//        [--build <id>|last] record against a saved game bundle (.tmp/trailer/rig/builds/) instead of building src/ now
// Output: <out>/<name>.mov|mp4, first.png, middle.png, last.png, contact.jpg (every 30th frame), take.json (timings, hashes).
// Default out: .tmp/trailer/rig/takes/<name>/take<n>/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launch } from '../cdp.mjs';
import { build, serveGame } from '../../build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const RIG_TMP = path.join(ROOT, '.tmp', 'trailer', 'rig');
const FFMPEG = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const MAGICK = fs.existsSync('/opt/homebrew/bin/magick') ? '/opt/homebrew/bin/magick' : 'magick';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);
const PROBE = opt('probe'); // dev aid: --probe file.js runs that file's body in the page after boot (R, G, T in scope) and prints the result
const shotPath = opt('shot') || (PROBE ? path.join(HERE, 'shots', 'test-run.js') : null);
if (!shotPath) { console.error('usage: node tools/trailer/capture.mjs --shot <file.js> [--take n] [--out dir]  (see tools/trailer/README.md)'); process.exit(1); }
const shotAbs = path.resolve(shotPath);
const shotSrc = fs.readFileSync(shotAbs, 'utf8');
const shotMod = (await import(pathToFileURL(shotAbs).href + '?t=' + Date.now())).default;
if (!shotMod || !shotMod.name || !(shotMod.frames > 0)) { console.error('shot module must `export default { name, frames, ... }`'); process.exit(1); }

const SS = Math.max(1, Math.min(2, Number(opt('ss', shotMod.ss ?? 2)) || 2));
const MASTER = flag('master');
const CODEC = opt('codec', 'prores');
const take = Number(opt('take', 1));
const name = String(shotMod.name).replace(/[^\w.-]/g, '_');
const outDir = path.resolve(opt('out', path.join(RIG_TMP, 'takes', name, 'take' + take)));
const timeout = Number(opt('timeout', 900)) * 1000;
const W = 1920, H = 1080;
const over = {
  frames: opt('frames') ? Number(opt('frames')) : undefined,
  preroll: opt('preroll') ? Number(opt('preroll')) : undefined,
  blur: opt('blur') ? Number(opt('blur')) : undefined,
  seed: opt('seed') ? Number(opt('seed')) : undefined,
};
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- build + serve ----
// The game is being edited while shots are recorded: every run saves the exact bundle it used under
// .tmp/trailer/rig/builds/<hash>/, and `--build <hash>|last` records against a saved bundle instead of building src/.
// Takes meant to match (determinism, re-takes of one shot) must use the same bundle.
const BUILDS = path.join(RIG_TMP, 'builds');
let b = null;
const useBuild = opt('build');
if (useBuild) {
  const id = useBuild === 'last' ? fs.readFileSync(path.join(BUILDS, 'last.txt'), 'utf8').trim() : useBuild;
  const dir = path.join(BUILDS, id);
  b = { ok: true, html: fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), js: fs.readFileSync(path.join(dir, 'game.js'), 'utf8') };
} else {
  for (let attempt = 0; attempt < 4; attempt++) { // colleagues may be mid-edit: retry a failing build a few times
    b = await build({});
    if (b.ok) break;
    console.error(`build failed (attempt ${attempt + 1}), retrying in 60 s:\n` + String(b.errors).slice(0, 1500));
    await new Promise((r) => setTimeout(r, 60000));
  }
  if (!b.ok) { console.error('BUILD FAILED'); process.exit(1); }
}
const buildId = crypto.createHash('sha1').update(b.js).update(b.html).digest('hex').slice(0, 12);
if (!useBuild) {
  const dir = path.join(BUILDS, buildId);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.html'), b.html); fs.writeFileSync(path.join(dir, 'game.js'), b.js); }
  fs.writeFileSync(path.join(BUILDS, 'last.txt'), buildId);
}
log(`game bundle ${buildId}${useBuild ? ' (saved)' : ''}`);
// --slot n (0–9): several recordings may run side by side, each with its own port and browser profile. The port stays fixed per
// slot because the game's bake cache (IndexedDB) is per origin.
const SLOT = Math.max(0, Math.min(9, Number(opt('slot', 0)) || 0));
const { server, url } = await serveGame({ getBuild: async () => b, port: 47391 + SLOT });
const usp = new URLSearchParams(shotMod.params || '');
for (const [k, v] of new URLSearchParams(opt('params') || '')) usp.set(k, v);
usp.set('autostart', '1'); usp.set('mute', '1'); usp.set('dynres', '0');
if (!usp.has('quality')) usp.set('quality', opt('quality', 'high'));
usp.set('pr', String(SS)); // let the renderer use the full device scale (the tier caps it at 1.5 otherwise)

// ---- browser ----
const page = await launch({ width: W, height: H, profileDir: path.join(RIG_TMP, SLOT ? 'profile-' + SLOT : 'profile') });
await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SS, mobile: false });
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(HERE, 'clock.js'), 'utf8') });
const consoleLines = [];
page.on('Runtime.consoleAPICalled', (p) => {
  if (p.type !== 'error' && p.type !== 'warning' && p.type !== 'log') return;
  const text = p.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
  if (p.type === 'log' && !text.startsWith('[rig]')) return;
  if (p.type === 'log') { log(text); return; }
  if (consoleLines.length < 200) consoleLines.push(`[${p.type}] ${text.slice(0, 400)}`);
});
page.on('Runtime.exceptionThrown', (p) => { const d = p.exceptionDetails; consoleLines.push('[exception] ' + ((d.exception && d.exception.description) || d.text || '').slice(0, 600)); });

// ---- ffmpeg ----
// Two ways to take a frame:
//   canvas (default): the page reads the WebGL canvas back right after the frame is drawn (gl.readPixels, before the
//          browser composites) and POSTs the raw RGBA to a local sink; ffmpeg reads rawvideo. Fast. Only the 3D picture:
//          DOM overlays (HUD, place-name cards, dialogue, fades) are NOT in it.
//   screen: Page.captureScreenshot of the composited page (PNG) — includes every DOM overlay. Several times slower.
const CAPTURE = opt('capture', shotMod.capture || 'canvas');
// supersample filter (canvas mode): 'box' = the GPU averages 2x2 blocks before readback (4x less data, fast);
// 'lanczos' = read the full 4K picture and let ffmpeg scale it with lanczos (sharper, slower). --master implies lanczos path.
const SSF = MASTER || SS === 1 || CAPTURE === 'screen' ? 'lanczos' : opt('ssfilter', 'box');
const DOWN = SSF === 'box' ? SS : 1;
const inW = (W * SS) / DOWN, inH = (H * SS) / DOWN;
const BLUR = Math.max(1, Math.round(over.blur ?? shotMod.blur ?? 1));
const ext = CODEC === 'h264' ? 'mp4' : 'mov';
const videoFile = path.join(outDir, `${name}.${ext}`);
const outW = MASTER ? W * SS : W, outH = MASTER ? H * SS : H;
const vf = [];
if (CAPTURE === 'canvas') vf.push('vflip'); // readPixels rows are bottom-up
if (BLUR > 1) vf.push(`tmix=frames=${BLUR}`, `select='eq(mod(n\\,${BLUR})\\,${BLUR - 1})'`, `setpts=N/(60*TB)`);
vf.push(`scale=${outW}:${outH}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv`);
vf.push(CODEC === 'h264' ? 'format=yuv420p' : 'format=yuv422p10le');
vf.push('setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv'); // tag the frames themselves (ffmpeg 8 takes tags from frames)
const enc = CODEC === 'h264'
  ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '8', '-x264-params', 'keyint=1:min-keyint=1:scenecut=0', '-tune', 'film']
  : ['-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0'];
const input = CAPTURE === 'canvas'
  ? ['-f', 'rawvideo', '-pix_fmt', 'rgb0', '-s', `${inW}x${inH}`, '-framerate', String(60 * BLUR), '-i', '-']
  : ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(60 * BLUR), '-i', '-'];
const ffArgs = ['-hide_banner', '-loglevel', 'error', '-y', ...input,
  '-vf', vf.join(','), ...enc,
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
  '-r', '60', '-fps_mode', 'cfr', '-an', '-metadata', `title=${name} take ${take}`, videoFile];
let ff = null, ffErr = '';
const startFF = () => {
  ff = spawn(FFMPEG, ffArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
  ff.stderr.on('data', (d) => { ffErr += d; });
  ff.stdin.on('error', (e) => { ffErr += 'stdin: ' + e.message; });
};
const ffWrite = (buf) => new Promise((res) => { if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res); });

// ---- frame intake ----
const frameHashes = [];
const stillsWanted = new Map(); // output frame index -> file (written as PNG at the captured resolution)
const sinkT = { wait: 0, recv: 0, intake: 0 };
let totalFrames = 0, grabMs = 0, writeMs = 0, grabs = 0, firstGrabT = 0;
async function intake(frame, sub, buf, raw) {
  if (!firstGrabT) firstGrabT = Date.now();
  if (sub === BLUR - 1) frameHashes[frame] = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const still = sub === BLUR - 1 ? stillsWanted.get(frame) : null;
  if (still) {
    if (raw) spawnSync(MAGICK, ['-size', `${inW}x${inH}`, '-depth', '8', 'rgba:-', '-alpha', 'off', '-flip', still], { input: buf, maxBuffer: 1 << 30 });
    else fs.writeFileSync(still, buf);
  }
  const t1 = Date.now();
  await ffWrite(buf);
  writeMs += Date.now() - t1;
}
// canvas mode: the page POSTs each frame here (raw RGBA, bottom-up)
const sink = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': '*' }); res.end(); return; }
  const chunks = [];
  const tq = Date.now(); let tFirst = 0;
  req.on('data', (c) => { if (!tFirst) tFirst = Date.now(); chunks.push(c); });
  req.on('end', async () => {
    let status = 200, msg = 'ok';
    try {
      const buf = Buffer.concat(chunks);
      if (buf.length !== inW * inH * 4) throw new Error(`frame size ${buf.length}, expected ${inW * inH * 4}`);
      grabs++;
      const tEnd = Date.now();
      await intake(Number(u.searchParams.get('frame')), Number(u.searchParams.get('sub')), buf, true);
      sinkT.wait += tFirst - tq; sinkT.recv += tEnd - tFirst; sinkT.intake += Date.now() - tEnd;
    } catch (e) { status = 500; msg = e.message; }
    res.writeHead(status, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' });
    res.end(msg);
  });
});
const sinkPort = await new Promise((r) => sink.listen(0, '127.0.0.1', () => r(sink.address().port)));
// screen mode: the page asks through the __rigGrab binding
await page.send('Runtime.addBinding', { name: '__rigGrab' });
page.on('Runtime.bindingCalled', async (p) => {
  if (p.name !== '__rigGrab') return;
  const msg = JSON.parse(p.payload);
  let ok = true, err = '';
  try {
    const t0 = Date.now();
    const r = await page.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, fromSurface: true, captureBeyondViewport: false });
    const buf = Buffer.from(r.data, 'base64');
    grabMs += Date.now() - t0; grabs++;
    await intake(msg.frame, msg.sub, buf, false);
  } catch (e) { ok = false; err = e.message; }
  page.send('Runtime.evaluate', { expression: `window.__rigGrabDone(${JSON.stringify({ ok, err })})` }).catch(() => {});
});

let code = 0;
const T0 = Date.now();
const report = { shot: path.relative(ROOT, shotAbs), name, take, build: buildId, capture: CAPTURE, ssFilter: SSF, ss: SS, master: MASTER, codec: CODEC, blur: BLUR, url: usp.toString() };
try {
  await page.goto(url + '?' + usp.toString());
  log('booting', url + '?' + usp.toString());
  let st = null;
  while (Date.now() - T0 < timeout) {
    st = await page.evaluate(`(() => { const c = window.__rigClock; return { mode: c && c.mode, ready: window.__mvReady === true, failed: window.__mvReady === 'failed' }; })()`).catch(() => null);
    if (st && st.failed) throw new Error('game boot failed');
    if (st && st.ready && st.mode === 'virtual') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!st || !st.ready) throw new Error('game did not become ready in time');
  report.bootSec = +((Date.now() - T0) / 1000).toFixed(1);
  log(`ready in ${report.bootSec} s, clock virtual`);

  // in-page runtime + the shot
  await page.evaluate(fs.readFileSync(path.join(HERE, 'runtime.js'), 'utf8') + '\n;true');
  const inPageShot = shotSrc.replace(/^\s*export\s+default\s+/m, 'window.__rigShot = ');
  await page.evaluate(`(() => { ${inPageShot}\n; return true; })()`);
  if (PROBE) {
    const r = await page.evaluate(`(async () => { const R = window.__rig, G = window.__game, T = window.__T; ${fs.readFileSync(path.resolve(PROBE), 'utf8')}\n})()`, { timeout });
    console.log('PROBE: ' + JSON.stringify(r, null, 1));
    throw new Error('probe finished (no recording)');
  }
  const plan = await page.evaluate(`window.__rig.plan(${JSON.stringify({ ...over, capture: CAPTURE, sink: `http://127.0.0.1:${sinkPort}/frame`, down: DOWN })})`);
  totalFrames = plan.frames;
  report.frames = plan.frames; report.preroll = plan.preroll; report.seed = plan.seed;
  const mid = Math.floor((plan.frames - 1) / 2);
  stillsWanted.set(0, path.join(outDir, 'first-ss.png'));
  stillsWanted.set(mid, path.join(outDir, 'middle-ss.png'));
  stillsWanted.set(plan.frames - 1, path.join(outDir, 'last-ss.png'));
  startFF();
  log(`recording ${plan.frames} frames (preroll ${plan.preroll}, blur ${BLUR}, ss ${SS}${MASTER ? ', 4K master' : ''})`);
  const res = await page.evaluate(`window.__rig.record()`, { timeout });
  report.timing = res.timing;
  report.page = res.info;
  if (res.errors && res.errors.length) { report.pageErrors = res.errors; code = 2; }
} catch (e) {
  code = 2; report.error = e.message;
  console.error('CAPTURE ERROR: ' + e.message);
  await page.screenshot(path.join(outDir, 'error.png')).catch(() => {});
} finally {
  try { report.gameErrors = await page.evaluate('window.__game && window.__game.debug ? window.__game.debug.errors() : []'); } catch (e) { /* ignore */ }
  try { report.clockErrors = await page.evaluate('window.__rigClock ? window.__rigClock.errors : []'); } catch (e) { /* ignore */ }
  log('closing browser');
  await page.close();
  server.close(); sink.close();
}
if (ff) {
  log('finishing encode');
  ff.stdin.end();
  await new Promise((r) => ff.once('close', r));
  if (ffErr.trim()) { console.error('ffmpeg: ' + ffErr.trim()); code = 2; }
}

// ---- stills + contact sheet ----
log('stills + contact sheet');
const finished = fs.existsSync(videoFile) && fs.statSync(videoFile).size > 0;
if (finished) {
  for (const n of ['first', 'middle', 'last']) {
    const src = path.join(outDir, n + '-ss.png');
    if (!fs.existsSync(src)) continue;
    const dst = path.join(outDir, n + '.png');
    if (SS > 1 && !MASTER && DOWN === 1) spawnSync(MAGICK, [src, '-filter', 'Lanczos', '-resize', `${W}x${H}!`, dst]);
    else fs.copyFileSync(src, dst);
    fs.rmSync(src);
  }
  const tiles = Math.ceil(totalFrames / 30), cols = Math.min(6, tiles), rows = Math.ceil(tiles / cols);
  spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoFile, '-vf',
    `select='not(mod(n\\,30))',scale=384:216:flags=bicubic,drawtext=text='%{n}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.5:expansion=normal,tile=${cols}x${Math.max(1, rows)}:padding=4:color=black`,
    '-frames:v', '1', '-fps_mode', 'passthrough', path.join(outDir, 'contact.jpg')]);
  if (!fs.existsSync(path.join(outDir, 'contact.jpg'))) // drawtext needs a font build; fall back to a plain sheet
    spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoFile, '-vf',
      `select='not(mod(n\\,30))',scale=384:216:flags=bicubic,tile=${cols}x${Math.max(1, rows)}:padding=4:color=black`,
      '-frames:v', '1', '-fps_mode', 'passthrough', path.join(outDir, 'contact.jpg')]);
  const probe = spawnSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
    'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_frames,color_range,color_space,color_primaries,color_transfer', '-of', 'json', videoFile], { encoding: 'utf8' });
  try { report.video = JSON.parse(probe.stdout).streams[0]; } catch (e) { /* ignore */ }
  report.videoMB = +(fs.statSync(videoFile).size / 1048576).toFixed(1);
}
report.frameHashes = frameHashes; // sha1 of each captured (supersampled) PNG, last sub-frame: compares takes exactly
const wall = (Date.now() - T0) / 1000;
const recSec = firstGrabT ? (Date.now() - firstGrabT) / 1000 : 0;
report.wallSec = +wall.toFixed(1);
report.perFrame = totalFrames ? {
  totalMs: Math.round((recSec * 1000) / totalFrames),
  grabMs: grabs ? Math.round(grabMs / grabs) : null,
  sinkMs: grabs ? Object.fromEntries(Object.entries(sinkT).map(([k, v]) => [k, Math.round(v / grabs)])) : null, encodeWaitMs: grabs ? Math.round(writeMs / grabs) : null,
  ...(report.timing || {}),
} : null;
report.console = consoleLines.slice(0, 60);
fs.writeFileSync(path.join(outDir, 'take.json'), JSON.stringify(report, null, 1));
log(`done in ${wall.toFixed(0)} s → ${outDir}`);
if (report.perFrame) log('per frame: ' + JSON.stringify(report.perFrame));
if (report.gameErrors && report.gameErrors.length) { log('game errors: ' + report.gameErrors.join(' | ')); }
if (consoleLines.length) log(`${consoleLines.length} console warnings/errors (see take.json)`);
process.exit(finished ? code : 2);
