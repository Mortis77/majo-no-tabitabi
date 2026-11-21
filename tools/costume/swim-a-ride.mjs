// The open summer shirt and its gathered under-frill cross the shaft at the left rear of a side-saddle pose.
// Keep a narrow fold at this exit point. Its full-strength plateau spans the measured cruise and boost contacts.
import { smooth } from './garment.mjs';
export function addSwimRideFold(doc) {
  const root = doc.getRoot(), buffer = root.listBuffers()[0];
  for (const node of root.listNodes()) {
    if (!['akari_skirt','akari_beach_shirt'].includes(node.getName())) continue;
    const mesh = node.getMesh(), voile = node.getName() === 'akari_beach_shirt';
    for (const primitive of mesh.listPrimitives()) {
      const pos = primitive.getAttribute('POSITION').getArray(), delta = new Float32Array(pos.length);
      for (let i = 0; i < pos.length; i += 3) {
        const [x,y,z] = pos.subarray(i,i+3);
        const across = voile ? smooth(-.035,.035,x)*(1-smooth(.212,.285,x)) : smooth(-.012,.043,x)*(1-smooth(.177,.245,x));
        const rear = voile ? 1-smooth(-.075,-.026,z) : 1-smooth(-.090,-.041,z);
        const below = 1-smooth(voile?.887:.868,.987,y);
        const weight = across*rear*below;
        delta[i] = (voile?.01:.018)*weight;
        delta[i+1] = (voile ? .220 : .104)*weight;
        delta[i+2] = (voile?-.028:-.006)*weight;
      }
      const posDelta = doc.createAccessor().setType('VEC3').setArray(delta).setBuffer(buffer);
      primitive.addTarget(doc.createPrimitiveTarget('sideSaddleFold').setAttribute('POSITION',posDelta));
    }
    mesh.setWeights([0]).setExtras({...mesh.getExtras(),targetNames:['sideSaddleFold']});
  }
}
