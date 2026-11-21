// Heights in world metres above sea level. One shared slab drives the sky,
// opaque depth composite, rain cutoff and the shadow on high terrain.
export const CLEAR_CLOUD_BASE=112;
export const CLOUD_THICKNESS=66;
export function cloudBase(overcast){return CLEAR_CLOUD_BASE-34*overcast;}

// Concentrate depth readback around the rider inside the volume, especially
// when a nearly horizontal ray travels kilometres before leaving the cloud.
export const CLOUD_SLICES_GLSL = `
vec4 cloudSlices(float span,float nearEdge) {
  vec4 regular=vec4(.25,.50,.75,1.);
  vec4 closeCuts=min(regular,vec4(8.,32.,125.,span)/max(.001,span));
  return mix(regular,closeCuts,1.-smoothstep(0.,12.,nearEdge));
}`;
