// u follows the swept width of each authored lock. v stores its painted depth
// (crest, folded edge, underside). Bind-space placement keeps the drawings
// attached when the head turns or a hair spring bends.
export const silverHairPaint = /* glsl */`
#ifdef CEL_SLOTS
      vec2 fibre = vCelUv;
#elif defined(USE_MAP)
      vec2 fibre = vMapUv;
#else
      vec2 fibre = vec2(.5,.20);
#endif
      vec3 p = vCelObj;
      float theta = atan(p.x + .012, p.z + .035);
      float facing = .65;
#if NUM_DIR_LIGHTS > 0
      facing = smoothstep(-.35,.60,dot(normalize(normal),directionalLights[0].direction));
#endif
      float depth = fibre.y;
      float root = smoothstep(.071,.113,p.y + .016*cos(theta-.4));
      float below = smoothstep(.012,.145,-p.y);
      float longFold = below * smoothstep(.41,.76,fibre.x + .13*sin(p.y*13.+theta));
      float plane = depth + .15*(1.-facing) + .14*root + .09*longFold;
      // At the whorl the brushstrokes converge into a single root shadow.
      // Fading their depth here avoids outlining every radial triangle.
      float whorl = smoothstep(.092,.120,p.y);
      plane = mix(plane,.31+.07*(1.-facing),whorl);
      float aa = min(.025,max(.006,fwidth(plane)*1.1));
      float shade = smoothstep(.27-aa,.27+aa,plane);
      float deep = smoothstep(.49-aa,.49+aa,plane);
      vec3 ink = mix(vec3(.95,.947,1.01),vec3(.69,.70,.85),shade);
      ink = mix(ink,vec3(.53,.54,.70),deep*.70);
      ink *= mix(vec3(1.),vec3(.87,.89,.99),root);

      // A few broad, pointed glints across the convex crest (silver satin).
      // Width tapers at each strip edge; the rear receives a quieter stroke.
      float center = .066+.013*cos(theta+.33)+.006*sin(2.*theta-.42);
      center += .028*(fibre.x-.46) + .0025*cos(3.*theta+1.);
      float brush = 1.-smoothstep(.17,.34,abs(fibre.x-.47));
      float litLock = 1.-smoothstep(.20,.40,depth);
      float halfWidth = .012*brush*(.60+.40*facing)*mix(.68,1.,smoothstep(-.70,.45,cos(theta)));
      float strokeAA = max(.0008,min(.004,fwidth(p.y-center)));
      float ribbon = (1.-smoothstep(halfWidth-strokeAA,halfWidth+strokeAA,abs(p.y-center)))*brush*litLock;
      float turn = (1.-smoothstep(.06,.16,abs(fibre.x-(.43+.06*sin(11.*p.y+theta))))) *
        smoothstep(.06,.13,-p.y)*(1.-smoothstep(.24,.43,-p.y)) * litLock;
      float paint = max(ribbon*.83,turn*.30)*(.55+.45*facing)*(.66+.34*dayK);
      vec3 lift = mix(ink,vec3(1.26,1.27,1.33),paint);
      lift *= mix(vec3(1.),vec3(.78)/max(diffuseColor.rgb,vec3(.18)),.33*whorl);
      // Dusk reduces the contrast of the painted planes; the sky fill is still
      // proportional to actual irradiance, including the darker moonlit areas.
      vec3 fill = mix(lift,vec3(1.04,1.04,1.09),.27*nightK);
      reflectedLight.indirectDiffuse *= fill*(1.+.15*nightK);
      vec3 localKey = reflectedLight.directDiffuse;
      float lampTint = smoothstep(.15,.9,(localKey.r-localKey.b)/max(celLum(localKey),.01));
      vec3 pearl = vec3(1.055,.985,1.035)*celLum(localKey);
      reflectedLight.directDiffuse = mix(localKey,pearl,.38*lampTint*nightK)*lift;
`;
