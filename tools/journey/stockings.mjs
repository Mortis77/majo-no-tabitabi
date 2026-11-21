// Slice triangles at the welt plane, interpolating both the shape and the bind weights.
// A triangle-centre mask produces a sawtooth edge at the student's exposed thigh.
export function fittedStocking(doc, skinMesh, mat, height = 0.692) {
  const src = skinMesh.listPrimitives()[0],
    ix = src.getIndices().getArray(),
    attr = (n) => src.getAttribute(n).getArray(),
    p = attr('POSITION'),
    n = attr('NORMAL'),
    uv = attr('TEXCOORD_0'),
    ji = attr('JOINTS_0'),
    we = attr('WEIGHTS_0'),
    out = { p: [], n: [], uv: [], j: [], w: [], i: [] },
    cache = new Map();
  const vertex = (i) => ({
    i,
    p: [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]],
    n: [...n.slice(i * 3, i * 3 + 3)],
    uv: [...uv.slice(i * 2, i * 2 + 2)],
    j: [...ji.slice(i * 4, i * 4 + 4)],
    w: [...we.slice(i * 4, i * 4 + 4)],
  });
  const split = (a, b) => {
    const t = (height - a.p[1]) / (b.p[1] - a.p[1]),
      lerp = (aa, bb) => aa.map((v, i) => v + (bb[i] - v) * t),
      map = new Map();
    for (const [v, k] of [
      [a, 1 - t],
      [b, t],
    ])
      for (let i = 0; i < 4; i++) if (v.w[i] > 0) map.set(v.j[i], (map.get(v.j[i]) || 0) + v.w[i] * k);
    const weights = [...map].sort((l, r) => r[1] - l[1]).slice(0, 4),
      sum = weights.reduce((s, w) => s + w[1], 0);
    while (weights.length < 4) weights.push([0, 0]);
    return {
      i: Math.min(a.i, b.i) + '/' + Math.max(a.i, b.i),
      p: lerp(a.p, b.p),
      n: lerp(a.n, b.n),
      uv: lerp(a.uv, b.uv),
      j: weights.map((x) => x[0]),
      w: weights.map((x) => x[1] / sum),
    };
  };
  function put(v) {
    if (cache.has(v.i)) return cache.get(v.i);
    const k = out.p.length / 3;
    cache.set(v.i, k);
    const [x, y, z] = v.p;
    out.p.push(x + (x - Math.sign(x) * 0.062) * 0.021, y, z + (z + 0.005) * 0.021);
    out.n.push(...v.n);
    out.uv.push(...v.uv);
    out.j.push(...v.j);
    out.w.push(...v.w);
    return k;
  }
  for (let i = 0; i < ix.length; i += 3) {
    const indices = [ix[i], ix[i + 1], ix[i + 2]];
    if (indices.every((k) => p[3 * k + 1] > height)) continue;
    const tri = indices.map(vertex),
      poly = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k],
        b = tri[(k + 1) % 3],
        inside = a.p[1] <= height;
      if (inside) poly.push(a);
      if (inside !== b.p[1] <= height) poly.push(split(a, b));
    }
    for (let t = 1; t + 1 < poly.length; t++) out.i.push(put(poly[0]), put(poly[t]), put(poly[t + 1]));
  }
  const buffer = doc.getRoot().listBuffers()[0],
    acc = (type, data) => doc.createAccessor().setType(type).setArray(data).setBuffer(buffer);
  const prim = doc.createPrimitive().setMaterial(mat);
  for (const [name, type, data] of [
    ['POSITION', 'VEC3', out.p],
    ['NORMAL', 'VEC3', out.n],
    ['TEXCOORD_0', 'VEC2', out.uv],
    ['JOINTS_0', 'VEC4', out.j],
    ['WEIGHTS_0', 'VEC4', out.w],
  ])
    prim.setAttribute(name, acc(type, name === 'JOINTS_0' ? new Uint16Array(data) : new Float32Array(data)));
  prim.setIndices(acc('SCALAR', new Uint16Array(out.i)));
  skinMesh.addPrimitive(prim);
}
