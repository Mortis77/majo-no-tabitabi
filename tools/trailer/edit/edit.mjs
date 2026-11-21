#!/usr/bin/env node
// 《月帷巫女》 trailer — the edit as code.
//
//   node tools/trailer/edit/edit.mjs [--preview] [--captions-only] [--review-only] [--no-review] [--clean] [--from-clean]
//   --clean       the cut WITHOUT captions and title -> trailer/月帷巫女-实机演示-无字幕母版.mp4 (kept, so that the text or the
//                 music can be redone later without the recorded takes)
//   --from-clean  build the film from that clean master instead of the takes (captions + title + score laid over it)
//
// Reads the five section EDLs (.tmp/trailer/shots/<n>-<key>/EDL.json), the score master
// (.tmp/trailer/edit/score_master.wav, made by tools/trailer/score/render.mjs --lufs -14.5) and the fonts in
// assets/fonts/zh-CN, renders the captions and the title to transparent PNGs with headless Chrome (tools/cdp.mjs),
// and has ffmpeg cut, fade, overlay and encode:  trailer/月帷巫女-实机演示.mp4
//   --preview   960x540 ultrafast draft to .tmp/trailer/edit/preview.mp4 (for checking the cut quickly)
// The review (contact sheet every 0.5 s, the frame before/after every cut, cut detection, loudness, ffprobe) goes to
// .tmp/trailer/edit/review/.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const PREVIEW = has('--preview');
const CLEAN = has('--clean'), FROM_CLEAN = has('--from-clean');
const CLEAN_OUT = path.join(ROOT, 'trailer/月帷巫女-实机演示-无字幕母版.mp4');
const EDL_KEPT = path.join(ROOT, 'tools/trailer/edit/edl'); // the cut lists as used, kept beside the edit
const SHOTS = path.join(ROOT, '.tmp/trailer/shots');
const WORK = path.join(ROOT, '.tmp/trailer/edit');
const CAPS = path.join(WORK, 'captions');
const REVIEW = path.join(WORK, 'review');
const SCORE = path.join(WORK, 'score_master.wav');
const OUT = PREVIEW ? path.join(WORK, 'preview.mp4') : CLEAN ? CLEAN_OUT : path.join(ROOT, 'trailer/月帷巫女-实机演示.mp4');
const TMPOUT = path.join(WORK, PREVIEW ? 'preview-enc.mp4' : 'final-enc.mp4');
const FONTS = path.join(ROOT, 'assets/fonts/zh-CN');
const W = 1920, H = 1080, FPS = 60, BEAT = 36, BAR = 144, TOTAL = 43 * BAR; // 6192
const bar = (b) => (b - 1) * BAR; // first frame of bar b
const LABEL_FONT = path.join(FONTS, 'LXGWWenKaiLite-Regular.ttf');
const log = (...a) => console.log('[edit]', ...a);
fs.mkdirSync(CAPS, { recursive: true });
fs.mkdirSync(REVIEW, { recursive: true });

// ------------------------------------------------------------------------------------------------ picture
const SECTIONS = [
  { n: 1, key: 'prologue', bars: [1, 6] },
  { n: 2, key: 'world', bars: [7, 16] },
  { n: 3, key: 'elements', bars: [17, 26] },
  { n: 4, key: 'battle', bars: [27, 36] },
  { n: 5, key: 'coda', bars: [37, 43] },
];
// Fallback only: if section 1 has no EDL.json, the prologue is a stand-in: the narration on
// black for bars 1-4, then the two ss1 scout tests of the cinematographer (same pinned bundle). As soon as
// .tmp/trailer/shots/1-prologue/EDL.json exists it is used instead.
const P1 = path.join(SHOTS, '1-prologue/scout');
const PROLOGUE_STANDIN = [
  { black: true, in: 0, length: 576, what: 'stand-in: black under the narration (section 1 not delivered)', cue: 'bar 1' },
  { file: path.join(P1, 't-p1-04-pray/p1-04-pray.mov'), in: 0, length: 144, what: 'stand-in (ss1 scout): she prays at the shrine', cue: 'bar 5 downbeat (bell)' },
  { file: path.join(P1, 't-p1-05-look-up/p1-05-look-up.mov'), in: 18, length: 144, what: 'stand-in (ss1 scout): tilt up the shrine hall to the sky', cue: 'bar 6 downbeat' },
];
// Edit decisions on top of the EDLs (slides inside handles, swaps). Key: "<section>:<shot index>".
const ADJUST = {
};

function loadTimeline() {
  const clips = [];
  let t = 0;
  for (const s of SECTIONS) {
    const want = (s.bars[1] - s.bars[0] + 1) * BAR;
    let edlPath = path.join(SHOTS, `${s.n}-${s.key}/EDL.json`);
    if (!fs.existsSync(edlPath) && fs.existsSync(path.join(EDL_KEPT, `${s.n}-${s.key}.json`))) edlPath = path.join(EDL_KEPT, `${s.n}-${s.key}.json`); // takes cleaned away: the kept cut list still gives the cut table
    let shots, standin = false;
    if (fs.existsSync(edlPath)) shots = JSON.parse(fs.readFileSync(edlPath, 'utf8')).shots;
    else if (s.n === 1) { shots = PROLOGUE_STANDIN; standin = true; }
    else throw new Error('missing ' + edlPath);
    if (bar(s.bars[0]) !== t) throw new Error(`section ${s.n} starts at ${t}, not on bar ${s.bars[0]}`);
    shots.forEach((sh, i) => {
      const a = ADJUST[`${s.n}:${i}`] || {};
      const c = { section: s.n, idx: i, standin, ...sh, ...a, start: t };
      if (c.file) c.file = path.resolve(ROOT, c.file);
      c.length = a.length ?? sh.length;
      c.in = a.in ?? sh.in;
      clips.push(c);
      t += c.length;
    });
    if (t !== bar(s.bars[0]) + want) throw new Error(`section ${s.n} is ${t - bar(s.bars[0])} frames, want ${want}`);
  }
  if (t !== TOTAL) throw new Error('timeline is ' + t);
  return clips;
}

// ------------------------------------------------------------------------------------------------ text
// Times in frames. in = first frame of the fade-in (12 f), out = the frame after the fade-out (18 f) ends.
// pos: the centre of the line as a fraction of the frame. scrim: a very soft dark ellipse behind the line.
// Typefaces (round 3, per the corrected brief): every line of narration / caption / label and 实机画面 in the game's own
// hand-written regular script LXGW WenKai (assets/fonts/zh-CN/LXGWWenKaiLite-Regular.ttf); the brush script Ma Shan Zheng only
// for the title 月帷巫女 (and its seal), the running script Zhi Mang Xing for the tagline 曦月洲绘卷. No system font: the
// @font-face rules point at the shipped files only, and renderCaptions() asks Chrome which font drew each line
// (CSS.getPlatformFontsForNode) and stops if anything else was used.
const WK = 'WenKai';
const CAPTIONS = [
  { id: 'n1', text: '很久很久以前，日轮和月轮是一对姊妹，轮流在天上走。', in: BEAT, out: bar(3), font: WK, size: 52, spacing: 0.12, pos: [0.5, 0.76], scrim: 0.25 },
  { id: 'n2', text: '月影落下的地方，人们叫它「月帷」。', in: bar(3) + 6, out: bar(5), font: WK, size: 58, pos: [0.5, 0.83], scrim: 0.45 },
  { id: 'n3', text: '镇着长夜的灯，一盏一盏地暗了。', in: bar(5) + 6, out: bar(7), font: WK, size: 50, pos: [0.28, 0.87], scrim: 0.42 },
  { id: 'lands', text: '一片永昼　一片薄暮　一片长夜', in: bar(11) + 6, out: bar(13), font: WK, size: 60, pos: [0.5, 0.125], scrim: 0.48 },
  { id: 'signs', text: '八象灵诀　万物相生相克', in: bar(17) + 6, out: bar(18), font: WK, size: 60, pos: [0.5, 0.125], scrim: 0.4 },
  { id: 'el-a', text: '火 · 风', in: bar(17) + 18, out: bar(19) - 4, font: WK, size: 46, label: true },
  { id: 'el-b', text: '水', in: bar(19) + 6, out: bar(21) - 4, font: WK, size: 46, label: true },
  { id: 'el-c', text: '冰', in: bar(21) + 6, out: bar(23) - 4, font: WK, size: 46, label: true },
  { id: 'el-d', text: '雷', in: bar(23) + 6, out: bar(25) - 4, font: WK, size: 46, label: true },
  { id: 'el-e', text: '岩', in: bar(25) + 6, out: bar(27) - 4, font: WK, size: 46, label: true },
  { id: 'shades', text: '影祟四起', in: bar(27) + 6, out: bar(28), font: WK, size: 78, pos: [0.5, 0.15], scrim: 0.25 },
  { id: 'title', title: 'main', in: bar(39), fadeIn: BEAT, out: bar(41) },
  { id: 'title2', title: 'sub', in: bar(39) + BEAT, out: bar(41) },
  // the last line sits in the dark band left of the great lantern, over the roofs: the string lights come on below and right of it
  { id: 'last', text: '去把灯，一盏一盏点亮。', in: bar(41) + 6, out: bar(43), font: WK, size: 58, pos: [0.26, 0.35], scrim: 0.3 },
  // 实机画面: a small slate low left (the calmest corner of bar 43), laid over the picture AFTER the closing fade so it stays
  // legible while the town goes dark; it fades out with its own 18 frames on the last frame.
  { id: 'real', text: '实机画面', in: bar(43) + 6, out: TOTAL, font: WK, size: 34, pos: [0.2, 0.9], spacing: 0.5, scrim: 0.45, afterFade: true },
];

function captionHTML(c) {
  const ff = (name, file) => `@font-face{font-family:${name};src:url("file://${path.join(FONTS, file)}");}`;
  const glow = `0 0 1px rgba(255,244,228,.7), 0 0 8px rgba(255,200,140,.34), 0 0 24px rgba(255,170,96,.20), 0 1px 3px rgba(0,0,0,.45), 0 0 2px rgba(40,24,10,.35)`;
  let body;
  if (c.title) {
    // Title plate on the c3 broom shot: open sky in the upper 55 %, centred a little left of the middle.
    const cx = 0.43 * W;
    const vis = (part) => (c.title === part ? 'visible' : 'hidden');
    body = `
      <div style="position:absolute;left:${cx}px;top:${0.27 * H}px;transform:translate(-50%,-50%);font-family:MaShan;font-size:200px;
        letter-spacing:.14em;padding-left:.14em;white-space:nowrap;color:#fbf6ec;visibility:${vis('main')};
        text-shadow:0 0 2px rgba(255,240,220,.6),0 0 18px rgba(255,196,130,.34),0 0 52px rgba(255,170,96,.22),0 2px 6px rgba(0,0,0,.28)">月帷巫女</div>
      <div style="position:absolute;left:${cx + 465}px;top:${0.27 * H + 48}px;width:62px;height:62px;border-radius:7px;background:#c23a22;
        box-shadow:0 0 10px rgba(194,58,34,.35);visibility:${vis('sub')};display:flex;align-items:center;justify-content:center">
        <div style="font-family:MaShan;font-size:25px;line-height:26px;color:#fbefe2;writing-mode:vertical-rl;letter-spacing:1px">月帷</div></div>
      <div style="position:absolute;left:${cx}px;top:${0.27 * H + 170}px;transform:translate(-50%,-50%);font-family:ZhiMang;font-size:56px;
        letter-spacing:.42em;padding-left:.42em;white-space:nowrap;color:#f7efe2;visibility:${vis('sub')};text-shadow:${glow}">曦月洲绘卷</div>`;
  } else {
    const [px, py] = c.label ? [0.075, 0.9] : c.pos;
    const sp = c.spacing ?? (c.label ? 0.3 : 0.16);
    const scrim = c.label ? 0.42 : c.scrim || 0;
    const fs_ = c.size;
    const scrimDiv = scrim ? `<div style="position:absolute;left:50%;top:50%;width:calc(100% + ${fs_ * 4}px);height:${fs_ * 3.4}px;
        transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(0,0,0,${scrim}),rgba(0,0,0,${scrim * 0.55}) 45%,rgba(0,0,0,0));"></div>` : '';
    body = `<div style="position:absolute;left:${px * W}px;top:${py * H}px;transform:translate(-50%,-50%);">${scrimDiv}
      <div style="position:relative;font-family:${c.font};font-size:${fs_}px;letter-spacing:${sp}em;padding-left:${sp}em;white-space:nowrap;
        color:#fbf6ec;-webkit-text-stroke:${(fs_ / 90).toFixed(2)}px #fbf6ec;text-shadow:${glow}">${c.text}</div></div>`;
  }
  return `<!doctype html><meta charset="utf-8"><style>${ff('MaShan', 'MaShanZheng-Regular.ttf')}${ff('ZhiMang', 'ZhiMangXing-Regular.ttf')}${ff('WenKai', 'LXGWWenKaiLite-Regular.ttf')}
    html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}</style><body>${body}</body>`;
}

const fontLog = {};
async function renderCaptions() {
  process.env.MV_TMP = path.join(WORK, 'chrome');
  const { launch } = await import(path.join(ROOT, 'tools/cdp.mjs'));
  const b = await launch({ width: W, height: H });
  try {
    await b.send('DOM.enable'); await b.send('CSS.enable');
    await b.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    for (const c of CAPTIONS) {
      const html = path.join(CAPS, c.id + '.html');
      fs.writeFileSync(html, captionHTML(c));
      await b.goto('file://' + html);
      const ok = await b.evaluate(`(async()=>{for(let i=0;i<200&&document.readyState!=='complete';i++)await new Promise(r=>setTimeout(r,25));
        await document.fonts.ready; const f=[...document.fonts].map(x=>x.family+':'+x.status); return f;})()`);
      const usedFont = c.title ? ['MaShan', 'ZhiMang'] : [c.font];
      await b.evaluate(`Promise.all(${JSON.stringify(usedFont)}.map(f=>document.fonts.load('40px '+f,'月')))`);
      for (const u of usedFont) if (!ok.some((x) => x === `${u}:loaded`)) throw new Error(`${c.id}: font ${u} not loaded (${ok})`);
      await b.screenshot(path.join(CAPS, c.id + '.png'));
      // which fonts actually drew the glyphs (catches any silent fallback to a system face)
      const { root } = await b.send('DOM.getDocument', { depth: -1 });
      const { nodeIds } = await b.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'body div' });
      const used = new Map();
      for (const id of nodeIds) {
        const r = await b.send('CSS.getPlatformFontsForNode', { nodeId: id });
        for (const f of r.fonts) used.set(f.familyName + (f.isCustomFont ? '' : ' (SYSTEM)'), (used.get(f.familyName) || 0) + f.glyphCount);
      }
      const fonts = [...used.keys()];
      fontLog[c.id] = Object.fromEntries(used);
      if (fonts.some((f) => f.includes('(SYSTEM)')) || !fonts.length) throw new Error(`${c.id}: drawn with ${fonts.join(', ')}`);
    }
  } finally { await b.close(); }
  fs.writeFileSync(path.join(CAPS, 'fonts-used.json'), JSON.stringify(fontLog, null, 1));
  log('captions rendered:', CAPTIONS.map((c) => c.id).join(' '));
}

// ------------------------------------------------------------------------------------------------ ffmpeg
const TAGS = 'setparams=field_mode=prog:range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709';
function buildGraph(clips) {
  const inputs = []; const f = [];
  const addInput = (a) => { inputs.push(...a); return inputs.filter((x) => x === '-i').length - 1; };
  const labels = [];
  if (FROM_CLEAN) {
    // the clean master already holds the cut, the white hit and both fades: only the text goes on top
    const i = addInput(['-i', CLEAN_OUT]);
    f.push(`[${i}:v]format=yuv422p10le,${TAGS}[p0]`);
  } else {
  for (const [k, c] of clips.entries()) {
    let src;
    if (c.black) {
      f.push(`color=c=black:s=${W}x${H}:r=${FPS},trim=end_frame=${c.length},format=gbrp,scale=out_color_matrix=bt709:out_range=tv,format=yuv422p10le,setpts=PTS-STARTPTS,${TAGS}[v${k}]`);
    } else {
      const i = addInput(['-i', c.file]);
      f.push(`[${i}:v]trim=start_frame=${c.in}:end_frame=${c.in + c.length},setpts=PTS-STARTPTS,format=yuv422p10le,${TAGS}[v${k}]`);
    }
    labels.push(`[v${k}]`);
  }
  // sections 1-4, then the coda which comes up out of white
  const firstCoda = clips.findIndex((c) => c.section === 5);
  f.push(`${labels.slice(0, firstCoda).join('')}concat=n=${firstCoda}:v=1:a=0[pre]`);
  f.push(`${labels.slice(firstCoda).join('')}concat=n=${labels.length - firstCoda}:v=1:a=0,fade=t=in:s=6:n=48:color=white[coda]`);
  f.push(`[pre][coda]concat=n=2:v=1:a=0,fade=t=in:s=0:n=36,${TAGS}[p0]`);
  }
  let cur = 'p0';
  const CAPS_ON = CLEAN ? [] : CAPTIONS;
  const overlay = (c, k) => {
    const i = addInput(['-loop', '1', '-framerate', String(FPS), '-i', path.join(CAPS, c.id + '.png')]);
    const dur = c.out - c.in, fin = c.fadeIn ?? 12;
    f.push(`[${i}:v]trim=end_frame=${dur},format=rgba,fade=t=in:s=0:n=${fin}:alpha=1,fade=t=out:s=${dur - 18}:n=18:alpha=1,`
      + `scale=out_color_matrix=bt709:out_range=tv,format=yuva422p10le,setpts=PTS-STARTPTS+${c.in}/(${FPS}*TB)[c${k}]`);
    f.push(`[${cur}][c${k}]overlay=0:0:eof_action=pass:repeatlast=0:format=yuv422p10[o${k}]`);
    cur = `o${k}`;
  };
  CAPTIONS.forEach((c, k) => { if (CAPS_ON.includes(c) && !c.afterFade) overlay(c, k); });
  if (!FROM_CLEAN) { f.push(`[${cur}]fade=t=out:s=${TOTAL - 96}:n=96[faded]`); cur = 'faded'; }
  CAPTIONS.forEach((c, k) => { if (CAPS_ON.includes(c) && c.afterFade) overlay(c, k); });
  const fin = PREVIEW ? `scale=960:540:flags=bilinear,` : '';
  f.push(`[${cur}]${fin}format=yuv420p,${TAGS}[vout]`);
  return { inputs, graph: f.join(';\n') };
}

function encode(clips) {
  if (!fs.existsSync(SCORE)) throw new Error('no score master: node tools/trailer/score/render.mjs --lufs -14.5 --out ' + SCORE);
  const { inputs, graph } = buildGraph(clips);
  const gfile = path.join(WORK, PREVIEW ? 'graph-preview.txt' : 'graph.txt');
  const nIn = inputs.filter((x) => x === '-i').length;
  // the score is cut to the picture length (103.200 s = 4,953,600 samples at 48 kHz)
  fs.writeFileSync(gfile, graph + `;\n[${nIn}:a]atrim=end_sample=${(TOTAL / FPS) * 48000},asetpts=PTS-STARTPTS[aout]`);
  const venc = PREVIEW
    ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24']
    : ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', CLEAN ? '14' : '16', '-g', '120', '-keyint_min', '120', '-sc_threshold', '0',
      '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709', '-bsf:v', 'filter_units=remove_types=6'];
  const a = ['-hide_banner', '-y', '-nostats', '-loglevel', 'warning', ...inputs, '-i', SCORE,
    '-/filter_complex', gfile, '-map', '[vout]', '-map', '[aout]',
    ...venc, '-pix_fmt', 'yuv420p', '-r', String(FPS), '-fps_mode', 'cfr', '-frames:v', String(TOTAL),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac_at', '-aac_at_mode', 'cbr', '-aac_at_quality', '0', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    '-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
    '-metadata', 'title=《月帷巫女》实机演示', '-metadata:s:v', 'handler_name=', '-metadata:s:a', 'handler_name=',
    '-metadata:s:v', 'language=und', '-metadata:s:a', 'language=und',
    TMPOUT];
  log('encoding', OUT, `(${nIn} picture inputs)`);
  const t0 = Date.now();
  const r = spawnSync('ffmpeg', a, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed ' + r.status);
  log(`encoded in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  finalize();
}
// Stream-copy remux: drops the per-stream encoder tags, keeps only the title, moves the index to the front.
function finalize() {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'warning', '-i', TMPOUT, '-map', '0', '-c', 'copy', '-map_metadata', '-1',
    '-map_metadata:s:v', '-1', '-map_metadata:s:a', '-1', '-fflags', '+bitexact', '-metadata', 'title=《月帷巫女》实机演示',
    '-metadata:s:v', 'language=und', '-metadata:s:a', 'language=und', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('remux failed');
  fs.rmSync(TMPOUT);
}

// ------------------------------------------------------------------------------------------------ review
const sh = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(cmd + ' ' + r.stderr); return r.stdout + r.stderr; };
function review(clips) {
  const src = OUT;
  const rep = { file: path.relative(ROOT, src) };
  // contact sheet: one frame every 0.5 s (frames 0, 30, 60 ...), timestamped
  const sheetDir = path.join(REVIEW, 'sheet'); fs.rmSync(sheetDir, { recursive: true, force: true }); fs.mkdirSync(sheetDir);
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src, '-vf', "select='not(mod(n,30))',scale=320:180", '-fps_mode', 'passthrough', path.join(sheetDir, '%04d.png')]);
  const tiles = fs.readdirSync(sheetDir).filter((x) => x.endsWith('.png')).sort();
  const named = tiles.map((x, i) => { const t = (i * 0.5).toFixed(1).padStart(5, '0'); const to = path.join(sheetDir, `${t}s f${i * 30}.png`); fs.renameSync(path.join(sheetDir, x), to); return to; });
  // (montage settings must come BEFORE the files they apply to, or the timestamps are not drawn)
  const mont = (files, out) => sh('magick', ['montage', '-label', '%t', '-font', LABEL_FONT, '-pointsize', '15', '-background', '#202020', '-fill', '#e0e0e0',
    ...files, '-tile', '10x', '-geometry', '+3+3', out]);
  mont(named, path.join(REVIEW, 'contact-sheet.jpg'));
  // parts, for reading at a glance (each about 25 s)
  for (let p = 0; p < 5; p++) {
    const part = named.slice(p * 50, (p + 1) * 50); if (!part.length) continue;
    mont(part, path.join(REVIEW, `final_sheet_${p + 1}.jpg`));
  }
  // the frame before and after every cut
  const cuts = clips.slice(1).map((c, k) => ({ frame: c.start, from: clips[k], to: c }));
  const want = [...new Set(cuts.flatMap((c) => [c.frame - 1, c.frame]))].sort((a, b) => a - b);
  const cutDir = path.join(REVIEW, 'cuts'); fs.rmSync(cutDir, { recursive: true, force: true }); fs.mkdirSync(cutDir);
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src, '-vf', `select='${want.map((n) => `eq(n,${n})`).join('+')}',scale=640:360`, '-fps_mode', 'passthrough', path.join(cutDir, 'raw%04d.png')]);
  const raws = fs.readdirSync(cutDir).filter((x) => x.startsWith('raw')).sort();
  const byFrame = Object.fromEntries(want.map((n, i) => [n, path.join(cutDir, raws[i])]));
  const pairs = [];
  rep.cuts = [];
  for (const c of cuts) {
    const name = path.join(cutDir, `cut f${c.frame}.png`);
    const yb = +sh('magick', [byFrame[c.frame - 1], '-colorspace', 'gray', '-format', '%[fx:mean]', 'info:']);
    const ya = +sh('magick', [byFrame[c.frame], '-colorspace', 'gray', '-format', '%[fx:mean]', 'info:']);
    sh('magick', [byFrame[c.frame - 1], byFrame[c.frame], '+append', '-gravity', 'north', '-background', '#202020', '-splice', '0x26', '-font', LABEL_FONT, '-pointsize', '18', '-fill', '#e0e0e0',
      '-annotate', '+0+3', `cut f${c.frame} (${(c.frame / FPS).toFixed(3)} s, bar ${Math.floor(c.frame / BAR) + 1} beat ${Math.floor((c.frame % BAR) / BEAT) + 1}${c.frame % BEAT ? ' +' + (c.frame % BEAT) : ''})   luma ${yb.toFixed(3)} -> ${ya.toFixed(3)}`, name]);
    pairs.push(name);
    rep.cuts.push({ frame: c.frame, t: +(c.frame / FPS).toFixed(4), from: path.basename(c.from.file || 'black'), to: path.basename(c.to.file || 'black'), lumaBefore: +yb.toFixed(3), lumaAfter: +ya.toFixed(3) });
  }
  for (const r of raws) fs.rmSync(path.join(cutDir, r));
  sh('magick', ['montage', '-font', LABEL_FONT, ...pairs, '-tile', '2x', '-geometry', '+4+4', '-background', '#202020', path.join(REVIEW, 'cuts-all.jpg')]);
  // cut detection on the encoded file: per-frame scene score, list the jumps
  const sc = sh('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-vf', "scale=240:136,select='gte(scene,0)',metadata=print:key=lavfi.scene_score", '-an', '-f', 'null', '-']);
  const scores = []; let n = -1;
  for (const line of sc.split('\n')) { if (line.includes('pts_time')) n++; const m = line.match(/scene_score=([\d.]+)/); if (m) scores[n] = +m[1]; }
  for (const c of rep.cuts) { c.scene = +(scores[c.frame] || 0).toFixed(3); const near = [-2, -1, 1, 2].map((d) => scores[c.frame + d] || 0); c.sceneNeighbourMax = +Math.max(...near).toFixed(3); }
  rep.detectedJumps = scores.map((s, i) => [i, s]).filter(([, s]) => s > 0.3).map(([i, s]) => ({ frame: i, score: +s.toFixed(3) }));
  // levels of the white hold and the black head
  rep.frames = +sh('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', src]).trim();
  // loudness of the final audio
  const lu = sh('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const tail = lu.slice(lu.lastIndexOf('Summary'));
  rep.loudness = { I: +(tail.match(/I:\s+(-?[\d.]+)/) || [])[1], LRA: +(tail.match(/LRA:\s+(-?[\d.]+)/) || [])[1], truePeak: +(tail.match(/Peak:\s+(-?[\d.]+)/) || [])[1] };
  // the hit: first audio sample after 86.0 s louder than -30 dBFS in 1 ms windows vs the first white frame
  const pcm = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src, '-map', '0:a', '-ss', '85.9', '-t', '1', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 }).stdout;
  const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  // 1 ms energy windows; the hit = the biggest jump over the 10-20 ms before it, searched in 86.2-86.6 s
  const db = []; for (let i = 0; i + 48 <= s.length; i += 48) { let e = 0; for (let j = 0; j < 48; j++) e += s[i + j] ** 2; db.push(10 * Math.log10(e / 48 + 1e-12)); }
  let onset = null, best = -1e9;
  for (let k = 300; k < 700; k++) { let m = 0; for (let j = k - 20; j < k - 10; j++) m += db[j] / 10; const jump = db[k] - m; if (jump > best) { best = jump; onset = 85.9 + k / 1000; } }
  const white = sh('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-vf', `select='between(n,${bar(37) - 2},${bar(37) + 8})',signalstats,metadata=print:key=lavfi.signalstats.YAVG`, '-an', '-f', 'null', '-']);
  rep.hit = { audioOnset: onset && +onset.toFixed(4), firstWhiteFrame: bar(37), firstWhiteT: bar(37) / FPS, yavg: [...white.matchAll(/YAVG=([\d.]+)/g)].map((m) => +(+m[1]).toFixed(1)) };
  rep.ffprobe = JSON.parse(sh('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', src]));
  fs.writeFileSync(path.join(REVIEW, 'report.json'), JSON.stringify(rep, null, 1));
  log('review written:', REVIEW);
  return rep;
}

// ------------------------------------------------------------------------------------------------ main
const clips = loadTimeline();
fs.writeFileSync(path.join(WORK, 'timeline.json'), JSON.stringify(clips.map((c) => ({ section: c.section, start: c.start, end: c.start + c.length, file: c.file ? path.relative(ROOT, c.file) : 'black', in: c.in, length: c.length, cue: c.cue, standin: c.standin || undefined })), null, 1));
if (has('--finalize')) { fs.renameSync(OUT, TMPOUT); finalize(); }
else if (!has('--review-only')) {
  await renderCaptions();
  if (has('--captions-only')) process.exit(0);
  encode(clips);
}
if (!has('--no-review') && !CLEAN) review(clips);
