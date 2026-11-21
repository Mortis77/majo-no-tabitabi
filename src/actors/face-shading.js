// Akari's facial lighting is drawn in the sculpt's bind coordinates. The solar
// and lunar keys share a direction in the game's world lighting.
export const FACE_VERTEX = /* glsl */`
vFaceKey = vec3(0.0);
#if CEL_KIND == 2
  if (uCelV.w > 0.5) {
    mat3 head = mat3(modelMatrix);
    #ifdef USE_SKINNING
      head = head * mat3(skinMatrix);
    #endif
    vFaceKey = vec3(dot(normalize(head[0]), uFaceKeyWorld),
                    dot(normalize(head[1]), uFaceKeyWorld),
                    dot(normalize(head[2]), uFaceKeyWorld));
  }
#endif
`;

export const FACE_PARS = /* glsl */`
varying vec3 vFaceKey;
float facePaint = 1.0;
float faceFeather(float d, float width) {
  float aa = max(width, fwidth(d) * .82);
  return smoothstep(-aa, aa, d);
}
// One temple / cheek cut, the underside of the jaw, and a small tapered cast
// from the nose. Coordinate zero is the centre of the unposed face mesh.
float faceKeyMask() {
  vec3 key = normalize(vFaceKey);
  vec2 p = vCelObj.xy / vec2(.082, .100);
  float turn = atan(key.x, key.z);
  float side = sign(key.x);
  float x = -p.x * side;
  float border = mix(1.22, -1.18, smoothstep(.34, 2.85, abs(turn)));
  border += .10 * (1.0 - smoothstep(.02, .40, abs(p.y + .31)))
          - .18 * smoothstep(.44, .95, -p.y);
  float cheek = faceFeather(x - border, .026);
  float depth = 1.0 - smoothstep(-.003, .048, vCelObj.z);
  float jawLine = -.983 + .30 * abs(p.x) + .23 * p.x*p.x + .20 * depth;
  float jaw = faceFeather(jawLine - p.y, .024) * smoothstep(-.28, .40, key.y);
  // The tiny triangular shadow stays just beneath and to the side of the tip.
  float sideLight = smoothstep(.15, .79, abs(key.x));
  float width = mix(.045, .122, sideLight);
  float along = x / width;
  float tip = -.397 - .036 * along;
  float upper = tip + .017 * (1.0 - clamp(along, 0.0, 1.0));
  float lower = tip - .034 * (1.0 - clamp(along, 0.0, 1.0));
  float nose = faceFeather(min(min(along + .11, 1.0-along) * width, min(upper-p.y,p.y-lower)), .007)
             * sideLight * smoothstep(.015, .045, vCelObj.z);
  return 1.0 - max(max(cheek, jaw * .83), nose * .75);
}
// A back light only catches the outer cheek / jaw on its own side. Eye sockets
// and the nose stay inside the drawn face, even in close profile.
float faceEdgeLight(vec3 N) {
  vec2 p = vCelObj.xy / vec2(.082, .100);
  float outside = max(smoothstep(.49,.81,abs(p.x)), 1.0-smoothstep(-.98,-.74,p.y));
  float silhouette = 1.0-smoothstep(.065,.32,abs(dot(N,normalize(vViewPosition))));
  float toward = smoothstep(-.20,.28, p.x * vFaceKey.x);
  return silhouette * outside * toward * (1.0-smoothstep(-.77,-.20,vFaceKey.z));
}
// The ochre Veil bounce and a lantern below the chin can coincide. Keep their
// intensity, but reserve the upper cheek for the silvery night skin palette.
vec3 faceNightBounce(vec3 light, vec3 skin, float amount) {
  const vec3 luma = vec3(.299,.587,.114);
  float value = dot(light,luma);
  float amber = smoothstep(.18,.97,(light.r-light.b)/max(.002,value));
  vec3 neutralSkin = skin * vec3(1.00,.99,1.09);
  neutralSkin /= max(.002,dot(neutralSkin,luma));
  return mix(light,value*neutralSkin,amount*amber);
}
float celMoonPlane(float original, vec3 N) {
  #if CEL_KIND == 2
    if (uCelQ.w > .5) return mix(.19, .80, facePaint) + .22 * faceEdgeLight(N);
  #endif
  return original;
}
`;
