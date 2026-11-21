import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO(); const doc = await io.read(process.argv[2]); const r = doc.getRoot();
const skin = r.listSkins()[0]; const J = skin.listJoints();
console.log('joints', J.length, J.map(j=>j.getName()).filter(n=>!/J_Sec_Hair|Hair/.test(n)).join(' '));
console.log('hairjoints', J.filter(j=>/Hair/.test(j.getName())).length);
for (const n of r.listNodes()) if (n.getMesh()) { const m = n.getMesh(); console.log('mesh', n.getName(), m.listPrimitives().map(p=>`${p.getMaterial()?.getName()}:${p.getAttribute('POSITION').getCount()}v/${p.getIndices().getCount()/3}t tex=${p.getMaterial()?.getBaseColorTexture()?.getImage()?.byteLength} t=${p.listTargets().length}`).join(' | ')); }
console.log('extras', JSON.stringify(r.listNodes()[0].getExtras()), r.listScenes()[0].listChildren().map(n=>n.getName()));
const rot = r.listNodes().filter(n=>{const q=n.getRotation(); return Math.abs(q[3]-1)>1e-6}).length; console.log('rotated nodes', rot);
