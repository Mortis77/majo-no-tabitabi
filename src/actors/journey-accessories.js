// Accessory joints survive the draw-call, outline and shadow-proxy merges. Collapsing
// the accessory into its parent also removes its ink hull and shadow on every quality tier.
export function setJourneyAccessories(rig, { brooch, hat } = {}) {
  const root = rig?.model;
  if (!root) return;
  for (const [name, on] of [
    ['Journey_Brooch', brooch],
    ['Journey_ApprenticeHat', hat],
  ]) {
    if (on === undefined) continue;
    root.getObjectByName(name)?.scale.setScalar(on ? 1 : 0.00001);
  }
}
