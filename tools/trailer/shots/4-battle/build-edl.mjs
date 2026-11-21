// node tools/trailer/shots/4-battle/build-edl.mjs — writes .tmp/trailer/shots/4-battle/EDL.json and sheet.jpg
// (one row per shot: its first, middle and last used frame) from the shot list below.
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../../../..');
const T = path.join(root, '.tmp/trailer/shots/4-battle');
const shots = JSON.parse(fs.readFileSync(path.join(T, 'shotlist.json'), 'utf8'));
let total = 0;
for (const s of shots) {
  s.file = path.join(T, 'takes', s.file);
  if (!fs.existsSync(s.file)) throw new Error('missing ' + s.file);
  if (s.length % 18) throw new Error('length not a multiple of 18: ' + s.what);
  const n = JSON.parse(fs.readFileSync(path.join(path.dirname(s.file), 'take.json'), 'utf8')).video.nb_read_frames | 0;
  if (s.in + s.length + 18 > n) console.warn('short handle:', s.what, s.in + s.length, '/', n);
  total += s.length;
}
if (total !== 1440) throw new Error('total ' + total);
fs.writeFileSync(path.join(T, 'EDL.json'), JSON.stringify({ section: 4, frames: 1440, fps: 60, shots: shots.map(({ file, in: i, length, what, cue, note }) => ({ file, in: i, length, what, cue, note })) }, null, 2));
const tmp = fs.mkdtempSync(path.join(T, 'sheet-'));
let k = 0;
for (const s of shots) for (const fr of [s.in, s.in + Math.floor(s.length / 2), s.in + s.length - 1]) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', s.file, '-vf', `select=eq(n\\,${fr}),scale=480:-1`, '-frames:v', '1', '-vsync', '0', path.join(tmp, String(k++).padStart(3, '0') + '.png')]);
}
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(tmp, '%03d.png'), '-vf', `tile=3x${shots.length}:padding=4:margin=4`, '-frames:v', '1', '-q:v', '3', path.join(T, 'sheet.jpg')]);
fs.rmSync(tmp, { recursive: true });
console.log('EDL', shots.length, 'shots,', total, 'frames; sheet written');
