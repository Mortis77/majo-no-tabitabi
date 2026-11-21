// The shaft as authored in tools/sculpt/assets/broom.mjs, transformed about
// the side-saddle contact point into the horizontal holder's local frame.
export const sculptBroomMount={pivot:[-.0032,.90,-.005],scale:[1,1.18,1]};
export const broomSeat = [.022,.392,.020];
export const shaftProfile = Array.from({length:26}, (_,i)=>{
  const h=.36+(1.447-.36)*i/25, u=(h-.36)/(1.447-.36);
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const x=.007*Math.sin(2*Math.PI*u)+.003*Math.sin(2*Math.PI*2.3*(h-.36));
  const y=.005*Math.sin(Math.PI*u);
  const r=.0226-.0032*smooth(u)-.0012*smooth((h-.72)/.08)*smooth((1.33-h)/.08);
  const [px,py,pz]=sculptBroomMount.pivot, [sx,sy,sz]=sculptBroomMount.scale;
  return {z:(h-py)*sy,x:(x-px)*sx,y:(y+pz)*sz,r};
});
export function shaftAt(z) {
  const i=shaftProfile.findIndex(p=>p.z>=z);
  if(i<0)return shaftProfile.at(-1);
  if(!i)return shaftProfile[0];
  const a=shaftProfile[i-1], b=shaftProfile[i], t=(z-a.z)/(b.z-a.z);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,r:a.r+(b.r-a.r)*t,z};
}
