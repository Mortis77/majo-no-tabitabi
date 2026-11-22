// Keep the planting in elongated ribbons, with smaller clearings between the
// flowering clumps. The terrain uses the same coordinates for its distance tint.
export const meadowPattern=/* glsl */`
float meadowRibbon(vec2 p,float broad,float detail) {
  vec2 direction=vec2(.78,.62);
  float band=sin(dot(p,direction)*.175+2.5*sin(dot(p,vec2(-.61,.79))*.069)+2.6*broad);
  return smoothstep(-.55,.64,band+(broad-.5)*1.4+(detail-.5)*.8);
}
// Curved petals and the painted distant flower ribbons share the same patches.
vec3 meadowDayPetal(float patchColour, float forest, float wet) {
  vec3 cornflower = vec3(.055,.28,.85), white = vec3(.93,.96,.99);
  vec3 open = mix(cornflower,white,smoothstep(.16,.67,patchColour));
  vec3 woodland = mix(vec3(.18,.21,.76),vec3(.48,.68,.98),patchColour);
  return mix(open,woodland,max(.72*forest,wet));
}
// map round (2026-11-22): the meadows change colour along the journey (buttercup and daisy by the hometown, poppies
// and cornflowers in the middle country, cornflower and white past the wilds, lupine and clover towards the city),
// with broad patches of a second colour inside each stretch. Same patches for the sprays and the painted distance.
vec3 meadowDayPetalAt(float patchColour, float forest, float wet, vec2 p) {
  vec3 base = meadowDayPetal(patchColour, forest, wet);
  float patchy = .5 + .5 * sin(p.x * .0061 + 1.7 * sin(p.y * .0047)) * sin(p.y * .0053 - .8 + 1.3 * sin(p.x * .0029));
  vec3 yellow = mix(vec3(.93, .72, .10), vec3(.95, .93, .84), smoothstep(.3, .75, patchColour));
  vec3 red = mix(vec3(.83, .16, .08), vec3(.95, .93, .86), smoothstep(.45, .85, patchColour));
  vec3 violet = mix(vec3(.42, .26, .78), vec3(.86, .52, .70), smoothstep(.35, .7, patchColour));
  float east = smoothstep(700., 1300., p.x), mid = smoothstep(-450., 100., p.x) * (1. - east), west = 1. - smoothstep(-1300., -800., p.x);
  vec3 c = base;
  c = mix(c, yellow, east * smoothstep(.25, .65, patchy));
  c = mix(c, red, mid * smoothstep(.45, .8, patchy) * .85);
  c = mix(c, violet, west * smoothstep(.3, .7, patchy));
  return mix(c, base, max(.72 * forest, wet));
}
`;

