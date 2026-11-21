// The crown can look intact from the front even when hair comes through the hat band at
// the rear. Check vertices and triangle centres against the triangulated brim underside.
import { NodeIO } from '@gltf-transform/core';
import { hatSurfaces } from './hat-fit.mjs';

const io = new NodeIO();
const read = (file) => io.read('assets/models/' + file);
const worn = await read('journey/elaina.glb');
const bare = await read('journey/elaina_apprentice.glb');
const looseSource = await read('chars/char_akari_miko.glb');
const hair = (doc) =>
  doc
    .getRoot()
    .listMeshes()
    .find((mesh) => mesh.getName() === 'akari_hair')
    .listPrimitives()[0];

for (const channel of ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0']) {
  const loose = hair(looseSource).getAttribute(channel).getArray();
  const apprentice = hair(bare).getAttribute(channel).getArray();
  if (loose.length !== apprentice.length || loose.some((v, i) => v !== apprentice[i])) {
    throw new Error('The uncovered apprentice hairstyle differs from its loose source in ' + channel);
  }
}

const shell = hair(worn);
const positions = shell.getAttribute('POSITION').getArray();
const indices = shell.getIndices().getArray();
const { topY } = hatSurfaces(worn);
const unique = new Set();
let samples = 0;
let clearance = Infinity;

function measure(x, y, z) {
  if (y < 1.422) return;
  const key = [x, y, z].map((v) => Math.round(v * 1e6)).join(',');
  if (unique.has(key)) return;
  unique.add(key);
  const brim = topY(x, z);
  if (!Number.isFinite(brim)) return;
  samples++;
  clearance = Math.min(clearance, brim - y);
}

for (let i = 0; i < positions.length; i += 3) measure(positions[i], positions[i + 1], positions[i + 2]);
for (let i = 0; i < indices.length; i += 3) {
  const vertices = [3 * indices[i], 3 * indices[i + 1], 3 * indices[i + 2]];
  const centre = [0, 1, 2].map((axis) => vertices.reduce((s, v) => s + positions[v + axis], 0) / 3);
  measure(...centre);
}
if (!samples || clearance <= 0)
  throw new Error('Hair penetrates the hat or the underside could not be sampled');
console.log(
  'Loose crown matches all four original channels. Hat underside:',
  samples,
  'samples,',
  (clearance * 1000).toFixed(2),
  'mm minimum separation.',
);
