// Exercise the whole, unmodified, 36-game-second solar eclipse in a private save.
// MV_ECLIPSE_FILM enables a 3x time-compressed H.264 recording with the game's lake ambience.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build, serveGame } from '../../build.mjs';
import { launch, TMP } from '../cdp.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const quality = process.env.MV_ECLIPSE_QUALITY || 'high';
if (!['low', 'medium', 'high'].includes(quality)) throw Error('Unsupported MV_ECLIPSE_QUALITY: ' + quality);
const output = path.resolve(process.env.MV_JOURNEY_QA || path.join(TMP, 'journey-eclipse'));
const film = process.env.MV_ECLIPSE_FILM,
  scout = process.env.MV_ECLIPSE_SCOUT === '1';
await fs.mkdir(output, { recursive: true });
const bundle = await build({});
if (!bundle.ok) throw Error(bundle.errors);
const { url, server } = await serveGame({ getBuild: async () => bundle });
let page,
  frames,
  failed = false;
try {
  if (film) frames = await fs.mkdtemp(path.join(output, 'frames-'));
  page = await launch({ width: scout ? 1152 : 1920, height: scout ? 648 : 1080 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: await fs.readFile(path.join(root, 'tools/trailer/clock.js'), 'utf8'),
  });
  let index = 0;
  if (film) {
    await page.send('Runtime.addBinding', { name: 'saveEclipseFrame' });
    const { writeFileSync } = await import('node:fs');
    page.on('Runtime.bindingCalled', ({ name, payload }) => {
      if (name === 'saveEclipseFrame')
        writeFileSync(
          path.join(frames, String(index++).padStart(4, '0') + '.jpg'),
          Buffer.from(payload, 'base64'),
        );
    });
  }
  await page.goto(url + '?autostart=1&quality=' + quality + '&pr=1&mute=1&dynres=0');
  const deadline = Date.now() + 120000;
  while (!(await page.evaluate('window.__mvReady === true'))) {
    if (Date.now() > deadline) throw Error('boot timeout');
    await new Promise((r) => setTimeout(r, 120));
  }
  const report = await page.evaluate('(' + survey.toString() + ')(' + JSON.stringify(!!film) + ')', {
    timeout: 480000,
  });
  for (const [key, data] of Object.entries(report.pictures))
    await fs.writeFile(path.join(output, key + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));
  delete report.pictures;
  report.quality = quality;
  await fs.writeFile(path.join(output, 'journey-eclipse.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ samples: report.samples, error: report.error }));
  if (report.error || report.errors.length) throw Error(report.error || report.errors.join('\n'));
  if (film) {
    if (index !== 300) throw Error('Expected 300 recorded frames, received ' + index);
    await fs.mkdir(path.dirname(path.resolve(film)), { recursive: true });
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-framerate',
      '24',
      '-i',
      path.join(frames, '%04d.jpg'),
      '-stream_loop',
      '-1',
      '-i',
      path.join(root, 'assets/audio/ambience/amb_lake.ogg'),
      '-t',
      '12.5',
      '-af',
      'volume=0.27,afade=t=in:d=0.35,afade=t=out:st=12.0:d=0.5',
      '-c:v',
      'libx264',
      '-threads',
      '4',
      '-preset',
      'fast',
      '-crf',
      '17',
      '-pix_fmt',
      'yuv420p',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-colorspace',
      'bt709',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-movflags',
      '+faststart',
      path.resolve(film),
    ]);
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  if (page) await page.close();
  server.close();
  if (frames) await fs.rm(frames, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

async function survey(record) {
  const G = __game,
    T = __T,
    C = __rigClock,
    P = G.player,
    V = G.THREE.Vector3,
    draw = G.renderFrame.bind(G);
  G.renderFrame = () => {};
  const step = async (n) => {
    for (let i = 0; i < n; i++) await C.step(1000 / 24);
  };
  const picture = () => G.renderer.domElement.toDataURL('image/jpeg', 0.93);
  const report = { pictures: {}, samples: [], errors: [], error: null };
  try {
    G.quests.debugSkipTo('mages', 'lake');
    G.world.setTrialLake(true);
    G.state.flags.majo_trial_lake = true;
    const shore = { x: 1885, z: -50 };
    T.teleport(shore.x, shore.z, G.world.groundAt(shore.x, shore.z) + 0.05);
    const yaw = Math.atan2(-1, 0.08);
    P.yaw = yaw;
    G.cam.yaw = yaw - Math.PI;
    await step(175);
    draw();
    await step(2);
    const sun = G.env.sunDir,
      camera = G.camera,
      level = G.water.level;
    function frame() {
      const flat = new V(sun.x, 0, sun.z).normalize(),
        side = new V(flat.z, 0, -flat.x);
      camera.position.copy(P.pos).addScaledVector(flat, -6.6).addScaledVector(side, -2.36);
      camera.position.y += 1.06;
      const look = camera.position.clone().addScaledVector(flat, 70).addScaledVector(side, 0.8);
      look.y += 3.3;
      camera.lookAt(look);
      camera.updateMatrixWorld(true);
      draw();
    }
    T.key('KeyF', true);
    await step(1);
    T.key('KeyF', false);
    let elapsed = 0;
    const samples = [
      [0, 'start'],
      [7, 'partial'],
      [16.1, 'maximum'],
      [26, 'returning'],
      [36.9, 'clear'],
    ];
    let sample = 0;
    const direct = G.scene.children.find((o) => o.isDirectionalLight && o.intensity > 0.3);
    const water = G.water;
    const small = document.createElement('canvas');
    small.width = 256;
    small.height = 144;
    const pixels = small.getContext('2d', { willReadFrequently: true });
    function lowerWater() {
      pixels.drawImage(G.renderer.domElement, 0, 0, 256, 144);
      return pixels.getImageData(12, 88, 232, 49).data;
    }
    function mirrorProbe() {
      const rendered = lowerWater(),
        weight = water.uniforms.wReflK.value;
      water.reflect = false;
      frame();
      const analytic = lowerWater();
      water.reflect = true;
      water.uniforms.wReflK.value = weight;
      frame();
      let sum = 0,
        changed = 0;
      for (let i = 0; i < rendered.length; i += 4) {
        let max = 0;
        for (let c = 0; c < 3; c++) {
          const d = rendered[i + c] - analytic[i + c];
          sum += d * d;
          max = Math.max(max, Math.abs(d));
        }
        if (max > 4) changed++;
      }
      return {
        pixels: rendered.length / 4,
        changedOverFour: changed,
        rmse: Math.sqrt(sum / (rendered.length * 0.75)),
      };
    }
    for (let out = 0; out < 300; out++) {
      elapsed = out * 0.125;
      G.cam.yaw = yaw - Math.PI;
      T.key('KeyW', elapsed < 8.6);
      T.key('KeyS', elapsed >= 8.6 && P.broom.speed > 2.5);
      const floor = Math.max(level, G.world.groundAt(P.pos.x, P.pos.z));
      const desired = Math.max(1.7, floor + 1.6);
      T.key('Space', P.pos.y < desired - 0.3);
      T.key('KeyC', P.pos.y > desired + 0.42);
      await step(3);
      // The sky publishes its current solar-disc coverage on draw. Keep its shadow and water uniforms in sync during fast QA.
      const due = sample < samples.length && elapsed >= samples[sample][0];
      if (record || due || out % 6 === 0) {
        frame();
        if (record) saveEclipseFrame(picture().split(',')[1]);
      }
      if (due) {
        const key = samples[sample++][1],
          weather = G.journeyWeather.state;
        const clip = sun.clone().multiplyScalar(200).add(camera.position).project(camera);
        const body = P.pos
          .clone()
          .add(new V(0, 0.72, 0))
          .project(camera);
        const glint = new V(sun.x, -sun.y, sun.z)
          .multiplyScalar((camera.position.y - level) / sun.y)
          .add(camera.position);
        const reflection = glint.clone().project(camera);
        const stats = water.stats();
        report.pictures[key] = picture();
        if (key === 'maximum') {
          report.mirrorProbe = mirrorProbe();
          const weight = water.uniforms.wRingK.value;
          const before = lowerWater();
          water.uniforms.wRingK.value = 0;
          frame();
          const masked = lowerWater();
          let changed = 0,
            peak = 0;
          for (let i = 0; i < before.length; i += 4) {
            const delta = Math.max(...[0, 1, 2].map((c) => Math.abs(before[i + c] - masked[i + c])));
            if (delta > 4) changed++;
            peak = Math.max(delta, peak);
          }
          water.uniforms.wRingK.value = weight;
          frame();
          report.solarMirror = { weight, changedOverFour: changed, brightestChannelDifference: peak };
        }
        report.samples.push({
          key,
          elapsed,
          age: weather.eclipseAge,
          occlusion: weather.eclipse,
          sunlight: weather.sunlight,
          light: direct?.intensity,
          position: P.pos.toArray(),
          sunNdc: clip.toArray(),
          glintNdc: reflection.toArray(),
          riderNdc: body.toArray(),
          glintFloor: G.world.heightAt(glint.x, glint.z),
          reflection: stats.reflection,
          passFrames: water.reflection.frames,
          reflectedDraws: stats.calls,
          reflectedHeight: water.reflection.cam.position.y,
        });
      }
    }
    T.key('KeyW', false);
    T.key('KeyS', false);
    T.key('Space', false);
    T.key('KeyC', false);
    const [start, , peak, , end] = report.samples;
    if (
      !P.onBroom ||
      !G.state.flags.journey_eclipse_seen ||
      peak.occlusion < 0.96 ||
      peak.sunlight > start.sunlight * 0.16 ||
      end.sunlight < start.sunlight * 0.92
    )
      throw Error('eclipse lighting or mounted route did not recover');
    if (
      report.solarMirror.weight < 0.9 ||
      report.solarMirror.changedOverFour < 60 ||
      report.solarMirror.brightestChannelDifference < 45
    )
      throw Error('solar rim was not visible on water');
    for (const point of [peak.sunNdc, peak.glintNdc, peak.riderNdc])
      if (Math.abs(point[0]) > 0.94 || Math.abs(point[1]) > 0.94)
        throw Error('solar composition outside picture');
    if (report.mirrorProbe.changedOverFour < 40 || report.mirrorProbe.rmse < 1)
      throw Error('mirror pass had no material picture difference');
    if (
      !peak.reflection ||
      peak.reflectedDraws < 1 ||
      peak.reflectedHeight >= 0 ||
      peak.glintFloor >= level
    )
      throw Error('solar mirror did not intersect an active reflected water surface');
  } catch (e) {
    report.error = String(e.stack);
  }
  report.errors = T.errors();
  return report;
}
