// Sheet helpers for the figure work (CPU renderer of figure/render.mjs).
import path from 'node:path';
import { render, R } from './render.mjs';

export const save = (file, img) => { R.savePNG(file, img); return file; };
export const tile = (meshes, cam, opts, label) => ({ img: render(meshes, cam, opts), label });

/** views: [[az, el, label?, light?]] around `center` */
export function turntable(meshes, { center, dist, fov = 26, w = 320, h = 560, views = [[0, 4], [45, 4], [90, 4], [135, 4], [180, 4], [270, 4]], opts = {}, cols, title = '' }) {
  const tiles = views.map(([az, el, label, light]) => tile(meshes, R.orbit(center, az, el, dist, fov, w, h), { ...opts, ...(light ? { light } : {}) }, label ?? `${az}`));
  return R.sheet(tiles, cols || views.length, { title });
}
export const clayOf = (m) => ({ pos: m.pos, nrm: m.nrm, idx: m.idx, base: [0.6, 0.6, 0.6], material: 'clay', kind: 'cloth', doubleSided: !!m.doubleSided });
export const out = (dir, name) => path.join(dir, name);
