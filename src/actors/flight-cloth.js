// Add loose-cloth joints before the cel mesh, ink hull and shadow caster share a skeleton.
// A joint starts coincident with its existing parent. Reassigning that parent's vertex
// weight preserves the fitted garment exactly at rest, including the four-weight body fit.
import { Bone, Vector3 } from 'three';
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const parts = new Set([
  'traveller_coat',
  'traveller_blouse',
  'akari_skirt',
  'traveller_sleeves',
  'akari_witch_hat',
  'akari_beach_shirt',
  'akari_cord',
  'akari_swim_neckline',
  'akari_swim_waist',
]);
function paint(name, material, x, y, z, v) {
  const side = x < -0.0001 ? -1 : 1,
    fore = z < -0.0001 ? -1 : 1,
    ax = Math.abs(x);
  if (name === 'traveller_blouse') return ['bow', side, 1, 1 - smooth(1.115, 1.221, y)];
  if (name === 'akari_skirt')
    return ['skirt', side, fore, (1 - smooth(0.812, 0.951, y)) * smooth(0.035, 0.14, Math.max(ax, -z))];
  if (name === 'traveller_coat') {
    // Keep the hip and the saddle-crossing part of the front facing pinned.
    return ['coat', side, fore, (1 - smooth(0.67, 0.99, y)) * smooth(0.025, 0.145, Math.max(ax, -z))];
  }
  if (name === 'traveller_sleeves' || (name === 'akari_beach_shirt' && ax > 0.25)) {
    // Wind catches the bell below the wrist. The fitted top of the cuff stays on its sleeve.
    return ['cuff', side, fore, smooth(0.32, 0.49, ax) * (1 - smooth(1.16, 1.24, y))];
  }
  if (name === 'akari_beach_shirt')
    return ['shirt', side, fore, (1 - smooth(0.7, 1.05, y)) * smooth(0.025, 0.16, Math.max(-z, ax))];
  if (name === 'akari_cord') return ['tie', side, fore, smooth(0.045, 0.085, ax) * (1 - smooth(1.18, 1.28, y))];
  if (name === 'akari_witch_hat') {
    if (y > 1.59 && x < -0.07) return ['tip', -1, -1, smooth(0.065, 0.19, -x)];
    const brim = Math.hypot(x / 0.315, z / 0.237);
    return ['brim', side, fore, (1 - smooth(1.59, 1.64, y)) * smooth(0.48, 0.96, brim)];
  }
  // Both gathered layers have six rows in their own quarter of the atlas. Their
  // stitched row is fixed, and the turned, free edge responds at full weight.
  if (material === 'float_organza') {
    const row = (v * 4) % 1;
    return [name === 'akari_swim_waist' ? 'waist' : 'ruffle', side, fore, smooth(0.04, 0.96, row)];
  }
  return null;
}
export function bindFlightCloth(gltf) {
  const rigs = new Map(),
    meshes = [],
    center = new Vector3();
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  for (const mesh of meshes) {
    const ref = gltf.parser.associations.get(mesh);
    const name = gltf.parser.json.meshes[ref?.meshes]?.name;
    if (!parts.has(name)) continue;
    // The two long neck-bow tails are separate primitives from the knot and fitted blouse.
    if (name === 'traveller_blouse') {
      const b = mesh.geometry.boundingBox;
      if (!b || b.min.z < 0.1 || b.min.y >= 1.15) continue;
    }
    const skeleton = mesh.skeleton,
      geometry = mesh.geometry;
    let additions = rigs.get(skeleton);
    if (!additions) {
      additions = new Map();
      rigs.set(skeleton, additions);
    }
    const { position, uv, skinIndex, skinWeight } = geometry.attributes;
    function joint(parentIndex, kind, side, fore, scale, i) {
      const key = [parentIndex, kind, side, fore, scale].join('_');
      let index = additions.get(key);
      if (index !== undefined) {
        const p = skeleton.bones[index].userData.flightPanel;
        center
          .fromBufferAttribute(position, i)
          .applyMatrix4(mesh.bindMatrix)
          .applyMatrix4(skeleton.boneInverses[parentIndex]);
        p.cx += center.x;
        p.cy += center.y;
        p.cz += center.z;
        p.n++;
        return index;
      }
      const bone = new Bone(),
        parent = skeleton.bones[parentIndex];
      bone.name = 'FlightCloth_' + key;
      center
        .fromBufferAttribute(position, i)
        .applyMatrix4(mesh.bindMatrix)
        .applyMatrix4(skeleton.boneInverses[parentIndex]);
      bone.userData.flightPanel = { kind, side, fore, scale, cx: center.x, cy: center.y, cz: center.z, n: 1 };
      if (kind === 'bow' || kind === 'ruffle' || kind === 'waist' || kind === 'skirt') {
        const normal = kind === 'bow' ? new Vector3(0, 0, 1) : new Vector3(side * 0.62, 0, fore);
        bone.userData.flightPanel.normal = normal.transformDirection(skeleton.boneInverses[parentIndex]).toArray();
      }
      parent.add(bone);
      index = skeleton.bones.length;
      skeleton.bones.push(bone);
      skeleton.boneInverses.push(skeleton.boneInverses[parentIndex].clone());
      additions.set(key, index);
      return index;
    }
    for (let i = 0; i < position.count; i++) {
      const p = paint(name, mesh.material.name, position.getX(i), position.getY(i), position.getZ(i), uv.getY(i));
      if (!p || p[3] < 0.003) continue;
      let main = 0,
        free = -1;
      for (let k = 0; k < 4; k++) {
        if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, main)) main = k;
        if (skinWeight.getComponent(i, k) === 0) free = k;
      }
      const original = skinIndex.getComponent(i, main),
        base = skinWeight.getComponent(i, main);
      const [kind, side, fore, weight] = p;
      if (free >= 0) {
        skinIndex.setComponent(i, free, joint(original, kind, side, fore, 1, i));
        skinWeight.setComponent(i, main, base * (1 - weight));
        skinWeight.setComponent(i, free, base * weight);
      } else {
        // Keep all four original influences. The added child is coincident in the
        // bind pose, with its displacement quantised only for these dense vertices.
        const scale = Math.round(weight * 6) / 6;
        if (scale > 0) skinIndex.setComponent(i, main, joint(original, kind, side, fore, scale, i));
      }
    }
  }
  for (const [skel, added] of rigs) if (added.size) skel.init();
}
