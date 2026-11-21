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
`;

