/* Liquid glass shard — fragment stage.
 *
 * The shard is a solid of cast glass with a picture suspended inside it,
 * standing in a small dark studio: one hard-edged softbox just off the
 * viewing axis, a horizon where the lit half meets the floor, and two strip
 * lights off to the side.
 *
 * The thing that separates glass from plastic is angular contrast, and every
 * stage below exists to protect it:
 *
 *   1. the surface, at two frequencies that go to two different places —
 *      a broad pour that slides the reflections, and fine striae that only
 *      the refraction sees
 *   1b. what the surface remembers: how it was poured, ground and broken
 *   2. refraction, marched through the slab in the shard's OWN space, so the
 *      picture hangs at a real depth and parallaxes as the piece turns
 *   3. Beer-Lambert absorption, per channel and glass-coloured, plus the
 *      lens grade that gives the body a bimodal histogram
 *   4. what the surface reflects — and what it stops transmitting in order
 *      to reflect it. Nothing here is added on top of anything
 *   5. the edge, given a cross-section instead of a border: face, dark band,
 *      chromatically split fire line, wall
 *   6. caustic filaments, and the shock ring as the pane gives way
 *
 * Intact (uOpen == 0) the pane is clear glass lying flat on the DOM picture:
 * the faces contribute nothing and only the fracture catches light. Every
 * term that could veil the photograph underneath is gated on `surface`.
 */

uniform sampler2D uHero;
uniform sampler2D uPage;
uniform sampler2D uNoise;
uniform float uPageMix;     // 0 shows the project screenshot, 1 the page
uniform float uHasPage;
uniform vec2 uPageFit;      // sub-rect of the page this shard draws from
uniform vec2 uPageUvPerPx;  // page uv per shard-local pixel

uniform vec3 uAccent;
uniform float uTime;
uniform float uOpen;        // 0 assembled, 1 fully broken out
uniform float uReveal;      // master fade, covers the swap from the DOM image
uniform float uTint;        // how much of the accent the body absorbs

uniform float uIor;
uniform float uDispersion;
uniform float uRefract;     // unitless gain on the marched path
uniform float uEdgeSplit;   // channel separation across the fire line
uniform vec4 uGrain;        // xy: pour direction. zw: this shard's seed.

uniform vec3 uLocalEye;     // camera in this shard's own pixel space
uniform vec3 uSlab;         // (halfThickness, dome, bevel), px
uniform vec2 uPaneSize;     // pane px

uniform vec3 uKeyDir;
uniform vec3 uFillDir;
uniform vec3 uEnvTop;
uniform vec3 uEnvHorizon;
uniform vec3 uEnvBottom;
uniform vec3 uEnvWindow;    // axis the softbox hangs on

uniform float uPaneAspect;
uniform vec2 uImpactUv;
uniform float uCrackR;      // shock ring radius, in pane heights
uniform float uCrackAmt;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUvHero;
varying vec2 vUvPage;
varying float vEdge;
varying vec3 vLocal;
varying float vSwell;
varying vec3 vNrmLocal;
varying vec3 vAxisX;
varying vec3 vAxisY;

/* The room the glass stands in. Not a capture — a dark studio with one
 * hard-edged softbox hanging just off the viewing axis, a horizon where the
 * lit half meets the dark floor, and two thin strips well off to the side so
 * a shard turning away from the key still has something to pick up on the
 * way round.
 *
 * The panel is the point. A cosine lobe has no edge anywhere, so nothing in
 * a gradient environment can ever read as a reflection — it reads as
 * shading. `q` is the reflected direction projected onto the window's own
 * plane, so `box` has genuine straight edges and genuine corners, and a
 * curved bevel sweeping past one is how an eye confirms "mirror".
 *
 * Every lobe is built by repeated squaring: this function contains no
 * transcendental at all, which is what funds the rest of the pass. */
vec3 environment(vec3 dir) {
  float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(uEnvBottom, uEnvHorizon, smoothstep(0.0, 0.52, t));
  c = mix(c, uEnvTop, smoothstep(0.5, 1.0, t));

  /* The horizon. Wide enough (about nine per cent of the sweep) that a
   * grazing ray crosses it over several pixels: a band narrow enough to read
   * as a hairline is narrower than a bevel is wide on screen, and it
   * speckles on and off between fragment centres instead of sweeping. */
  float h = 1.0 - min(abs(dir.y) * 11.0, 1.0);
  c += mix(vec3(0.62, 0.68, 0.82), uAccent, 0.35) * (h * h * 0.30);

  vec3 wz = uEnvWindow;
  vec3 wx = normalize(vec3(wz.z, 0.0, -wz.x));
  vec3 wy = cross(wz, wx);
  float wd = dot(dir, wz);
  vec2 q = vec2(dot(dir, wx), dot(dir, wy)) / max(wd, 0.04);
  vec2 box = abs(q) - vec2(0.58, 0.44);
  /* The grazing cut-off is a smoothstep, not a step: a binary edge in a
   * per-pixel reflection direction crawls on a tumbling chip. */
  float panel = (1.0 - smoothstep(-0.075, 0.050, max(box.x, box.y)))
              * smoothstep(0.04, 0.10, wd);

  // Mullions, so the reflected panel has structure inside its outline and
  // not only an outline.
  vec2 mull = abs(fract(q * vec2(1.7, 2.3) + 0.5) - 0.5);
  panel *= 1.0 - 0.34 * (1.0 - smoothstep(0.020, 0.052, min(mull.x, mull.y)));
  c += vec3(1.0, 0.985, 0.955) * panel * 3.4;

  float s0 = 1.0 - smoothstep(0.030, 0.075, abs(dot(dir, uKeyDir) + 0.34));
  float s1 = 1.0 - smoothstep(0.040, 0.095, abs(dot(dir, uFillDir) - 0.62));
  c += vec3(0.85, 0.90, 1.0) * s0 * 0.9 + uAccent * s1 * 1.1;

  // key^6 and key^26 by repeated squaring: k4*k2 and k8*k8*k8*k2.
  float key = max(dot(dir, uKeyDir), 0.0);
  float k2 = key * key;
  float k4 = k2 * k2;
  float k8 = k4 * k4;
  c += vec3(1.0, 0.99, 0.96) * ((k4 * k2) * 0.26 + (k8 * k8 * k8 * k2) * 0.55);

  float fill = max(dot(dir, uFillDir), 0.0);
  float fl2 = fill * fill;
  c += uAccent * (fl2 * fl2 * fl2) * 0.5;
  return c;
}

/** The picture inside the glass, split per channel along the bent ray. */
vec3 dispersed(sampler2D tex, vec2 uv, vec2 slide, float disp) {
  return vec3(
    texture2D(tex, uv + slide * (1.0 + disp)).r,
    texture2D(tex, uv + slide).g,
    texture2D(tex, uv + slide * (1.0 - disp)).b
  );
}

/* Both polarisations, not Schlick. For n = 1.52 this is exactly 0.0426
 * face-on and exactly 1.0 edge-on — a 23:1 angular range, where
 * pow(1 - facing, 4.0) managed 8.8:1 and never reached a mirror at all. A
 * material whose reflectance barely changes with angle is the definition of
 * what moulded polymer looks like. */
float fresnelDielectric(float cosi, float eta) {
  float s2 = eta * eta * (1.0 - cosi * cosi);
  float cost = sqrt(max(1.0 - s2, 0.0));
  float rs = (eta * cosi - cost) / max(eta * cosi + cost, 1e-5);
  float rp = (cosi - eta * cost) / max(cosi + eta * cost, 1e-5);
  return clamp(mix(0.5 * (rs * rs + rp * rp), 1.0, step(1.0, s2)), 0.0, 1.0);
}

void main() {
  vec3 Ng = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);

  /* 1. The surface. Two fields at deliberately different frequencies, going
   * to deliberately different places — not one field at two amplitudes.
   *
   * `na` is broad and slow: about one and a half features across a whole
   * face, far wider than the specular lobe, so it SLIDES the highlight and
   * the window's edge instead of chopping them up. `nb` is sampled through a
   * frame squashed three and a half to one, which turns the noise blobs into
   * streaks running along the shard's local x — striae, the cords a cast slab
   * keeps from the pour — and those only ever touch the refraction, where the
   * eye reads them as something seen THROUGH the glass rather than as the
   * glass boiling. */
  vec2 nuv = vLocal.xy * 0.0013;
  vec3 na = texture2D(uNoise, nuv + vec2(uTime * 0.011, uTime * -0.007)).rgb;
  vec3 nb = texture2D(uNoise, nuv * vec2(0.9, 3.5)
                    + vec2(uTime * -0.016, uTime * 0.010)).rgb;

  vec2 pour   = vec2(na.r + na.b, na.g + na.b) - 1.0;   // broad, sigma ~0.28
  vec2 striae = vec2(nb.g - 0.5, nb.r - 0.5) * 1.1;     // streaked, finer
  /* The third octave of the stretched field, kept as a scalar: a 190 x 24 px
   * density drift down the pour. Free — the fetch is already paid for — and
   * it is what finally breaks up the flat body. */
  float schlieren = nb.b - 0.5;

  float rippleAmt = (0.030 + 0.10 * uOpen) * (1.0 - vEdge * 0.65);
  vec2 ripple = pour * 0.75 + striae;

  /* 1b. What the surface remembers: how it was flowed, ground and broken.
   *
   * One fetch, three lattices, three jobs. The uv is squashed about three to
   * one along the pour direction, so the noise blobs come back as streaks and
   * not as snow — a 32 x 13 px figure in R, 17 x 7 px hackle in G, 10 x 4 px
   * grooves in B. Deliberately NOT scrolled in time: a defect that drifts is
   * a defect the eye reads as a shader rather than as a mark on an object. */
  vec2 flowDir = uGrain.xy;
  vec2 cordDir = vec2(-flowDir.y, flowDir.x);
  vec2 muv = vec2(dot(vLocal.xy, cordDir) * 0.0052,
                  dot(vLocal.xy, flowDir) * 0.0125) + uGrain.zw * 2.7;
  vec3 mn = texture2D(uNoise, muv).rgb;

  /* The conchoidal mist and hackle of a fresh break. This value has to reach
   * every single edge term, because a band of even width and even brightness
   * tracing a silhouette is precisely what reads as moulded trim. The mean of
   * a value-noise channel is 0.5, so the multipliers below average to exactly
   * 1.0: the edge keeps its weight and gains only variation. */
  float hackle = mn.r * 0.55 + mn.g * 0.45;

  /* The refraction normal, in world space. vAxisX/vAxisY carry the shard's
   * own axes, so a shard-local tangent offset perturbs the surface it is
   * meant to perturb even when the piece has tumbled. */
  vec3 N = normalize(Ng + (vAxisX * ripple.x + vAxisY * ripple.y) * rippleAmt);

  /* The reflective normal gets the BROAD field only, plus a one-axis orange
   * peel off mn.r — the 32 x 13 px channel, coarse enough that the window
   * crawls instead of fizzing. One axis on purpose: a 1-D ripple is what a
   * rolled or drawn surface actually carries, and it stays coherent rather
   * than going isotropic-noisy. The striae and the grooves are kept out of
   * here entirely — a tight lobe boils on a shaken normal, and the answer is
   * to put the fine detail in the COLOUR instead. */
  float sheen = (0.050 + 0.070 * uOpen) * (1.0 - vEdge * 0.55);
  float peel = mn.r - 0.5;
  vec3 Ns = normalize(Ng
          + (vAxisX * (pour.x + peel * 1.3) + vAxisY * pour.y) * sheen);

  float facing = clamp(dot(Ns, V), 0.0, 1.0);
  float fres = fresnelDielectric(facing, 1.0 / uIor);

  /* A separate, cheaper shaping curve. `fres` saturates flat to 1.0 along the
   * entire wall — the wall's normal is purely in-plane, so `facing` is ~0
   * everywhere round the perimeter — which makes it useless for shaping
   * anything that has to VARY across the bevel. f2 still has gradient there,
   * and it is two multiplies. */
  float f2 = (1.0 - facing) * (1.0 - facing);

  float curve   = smoothstep(0.05, 0.95, vEdge);
  float surface = smoothstep(0.0, 0.25, uOpen);

  /* 2. Refraction, marched through the slab in the shard's own space.
   *
   * The ray used to be bent in WORLD space and the result added to UVs whose
   * axes are the shard's LOCAL x and y, so the moment a piece tumbled the
   * interior smeared sideways to the solid holding it. And the offset was a
   * flat uv nudge with no thickness and no 1/cos, so the picture barely moved
   * as the shard turned — and an interior that does not parallax against its
   * own surface IS an image printed on the surface. Both gone. */
  vec3 Vl = normalize(uLocalEye - vLocal);
  vec3 Nl = normalize(vNrmLocal
          + vec3(ripple, 0.0) * rippleAmt);
  vec3 Rl = refract(-Vl, Nl, 1.0 / uIor);

  /* Distance from this fragment to the flat back face along the bent ray.
   * The wall's normal has no z, so that path runs to infinity: cap the
   * descent. No side flip — the material is FrontSide, and flipping snaps
   * travel to zero at grazing on the wall, killing the fringe exactly where
   * it is meant to be widest. */
  float rz = min(Rl.z, -0.22);
  float travel = clamp((uSlab.x + vLocal.z) / -rz, 0.0, uSlab.x * 5.6);
  travel *= mix(0.42, 1.0, uOpen);

  /* A real length in pixels, converted per axis into each UV space. One
   * isotropic uv offset applied to two differently-shaped uv spaces moved the
   * picture by an arbitrary fraction rather than by a distance. */
  vec2 march = Rl.xy * travel * uRefract;
  vec2 slideHero = march / uPaneSize;
  vec2 slidePage = march * uPageUvPerPx;
  float disp = uDispersion * (0.18 + vEdge * 2.6);

  // Six fetches is the worst case and only happens mid-crossfade; a shard
  // that has finished turning into its page never touches the hero at all.
  bool hasPage = uHasPage > 0.5;
  vec2 pageUv = clamp((vUvPage - 0.5) * uPageFit + 0.5, 0.004, 0.996);
  vec3 inner;
  if (hasPage && uPageMix > 0.996) {
    // The page is squeezed into the shard's own outline, so it reads as a
    // window rather than as more of the same picture.
    inner = dispersed(uPage, pageUv, slidePage, disp);
  } else if (hasPage && uPageMix > 0.004) {
    inner = mix(dispersed(uHero, vUvHero, slideHero, disp),
                dispersed(uPage, pageUv, slidePage, disp), uPageMix);
  } else {
    inner = dispersed(uHero, vUvHero, slideHero, disp);
  }

  /* 3. Beer-Lambert absorption.
   *
   * The constant this replaces took two per cent out of a face fragment and
   * six at the wall. Two per cent is not a material, it is a rounding error,
   * and it is why the body of every shard read as one flat tone no matter how
   * much glass the sightline crossed. Depth inside a transparent solid is
   * MADE of differential absorption.
   *
   * Sigma is per channel and glass-coloured. Iron in the melt eats red first,
   * which is why the edge of every sheet of float glass anyone has seen is
   * green; the theme's accent is layered on top of that rather than replacing
   * it. The floor on (1 - uAccent) keeps a hot accent from collapsing the
   * wall to monochrome. */
  float path = travel * (0.55 + 1.9 * vEdge * vEdge);
  vec3 sigma = vec3(0.0060, 0.0029, 0.0042)               // the glass itself
             + max(1.0 - uAccent, 0.12) * (uTint * 0.0034); // and the theme
  vec3 absorb = exp(-path * sigma);
  inner *= absorb;

  /* What the body takes out of the beam it puts back as a glow, brightest
   * exactly where it is taking the most. Coupling the two keeps a thick edge
   * from going black, and makes the glow belong to the material instead of
   * sitting on top of it as a flat haze. */
  inner += uAccent * (1.0 - absorb) * (0.26 * uTint);

  // A density drift down the pour, for free from the striae fetch.
  inner *= 1.0 + schlieren * 0.18 * uOpen;

  /* The lens grade. A lens concentrates; it does not roll off. The shoulder
   * gives the top of the range GAIN, pushing bright content past 1.0 where
   * the hue-preserving shoulder at the end of main() catches it. The toe
   * hands the bottom over to the glass itself, so a dark panel in a
   * screenshot becomes depth instead of fill. */
  float lum = dot(inner, vec3(0.2126, 0.7152, 0.0722));
  float toe = smoothstep(0.006, 0.130, lum);
  float hi  = smoothstep(0.260, 0.800, lum);

  inner = mix(vec3(lum), inner, 1.42 + 0.55 * hi);
  // 1.85 was tuned against the dark screenshots and blew a light one —
  // a white app screen inside a shard clipped to flat paper and lost every
  // trace of the glass around it. Dark content is untouched at this gain.
  inner = max(inner, 0.0) * (0.88 + 1.15 * hi);

  vec3 bodyGlow = (uAccent * (0.085 + 0.22 * vEdge) + uEnvHorizon * 0.30)
                * (0.35 + 0.85 * fres) * uTint;
  inner = mix(bodyGlow, inner, toe);

  /* 4. What the surface reflects — and what it stops transmitting in order
   * to reflect it.
   *
   * The old composition added the reflection on top of an interior the same
   * Fresnel term had just BOOSTED: at the silhouette that handed you 1.18x
   * picture plus 0.745x room, and the picture never went away. Real glass at
   * 85 degrees transmits about nine per cent. The moment a surface stops
   * showing you its interior and starts showing you the room is the moment
   * the eye commits to "transparent solid". */
  vec3 refl = environment(reflect(-V, Ns));

  /* At rest the pane is clear glass lying flat on the picture. A
   * full-strength studio reflection on the intact bevels would draw a bright
   * white wireframe over a photograph that is meant to show through
   * untouched, so the room only arrives with the break. */
  refl *= mix(0.30, 1.0, surface);

  /* One near-specular lobe, split three ways so the glint itself carries
   * colour. The broad Blinn-18 lobe that used to sit beside it is gone: that
   * is GGX roughness 0.32, a rough surface, and a fixed-amplitude rough lobe
   * on every fragment is what moulded polymer looks like. 200 is a 4.7 degree
   * half-width — tight enough to be glass, still wide enough to survive the
   * surface wobble on this normal. */
  vec3 H = normalize(uKeyDir + V);
  float ndh = max(dot(Ns, H), 0.0);

  /* Polish marks and micro-pits, in the COLOUR and never in the normal.
   * A scratch is a groove, not a mirror: it takes the key over a very wide
   * angle and hands it back as a thin hard line. So it is a broad lobe
   * (ndh^9, a 22 degree half-width, four multiplies and no pow) masked by a
   * sharp threshold on the fine octave — it shows only where the specular
   * grazes, and it cannot alias the specular because it is nowhere near it.
   * Pits ride the Fresnel rather than the specular, because a pit catches
   * grazing light; the threshold is deliberately wide so they stay sparse. */
  float p3 = ndh * ndh * ndh;
  float grooves = smoothstep(0.66, 0.91, mn.b) * (1.0 - vEdge * 0.45);
  float polish = grooves * (p3 * p3 * p3);
  float pits = smoothstep(0.90, 1.16, mn.b * (0.55 + 0.75 * mn.g));

  vec3 glint = vec3(pow(ndh, 200.0), pow(ndh, 260.0), pow(ndh, 330.0)) * 1.9;
  vec3 Hf = normalize(uFillDir + V);
  float specFill = pow(max(dot(Ns, Hf), 0.0), 90.0) * 0.6;

  /* Both speculars ARE reflections, so both are weighted by Fresnel like one.
   * The mix() inside gives them their contrast back: face-on a glint is a
   * real four-per-cent dielectric highlight, at grazing it blazes. */
  vec3 mirror = refl
              + glint * mix(1.0, 3.0, fres)
              + uAccent * specFill * mix(1.0, 2.5, fres);

  /* 5. The edge, given a cross-section instead of a border.
   *
   * Face -> dark band -> chromatically split fire line -> wall. Four events
   * across five or six screen pixels, every one of them broken along its
   * length by the hackle and varied around the perimeter by the room. A real
   * thick glass edge is bright lip, then a DARK band where the ray grazes the
   * bevel foot and looks down the longest path in the solid, then the bright
   * silhouette. Bright/bright/bright is the most reliable moulded-plastic
   * tell there is, and that is what was here. */
  float edgeDark = smoothstep(0.14, 0.38, vEdge) * (1.0 - smoothstep(0.44, 0.68, vEdge));
  edgeDark *= (0.30 + 0.70 * uOpen) * (0.50 + 0.50 * hackle);

  float lit = 0.26
            + 0.78 * smoothstep(-0.35, 0.85, dot(Ns, uKeyDir))
            + 0.42 * smoothstep( 0.10, 0.90, dot(Ns, uFillDir));

  /* Each channel turns the corner at a different place, so the lip runs warm
   * on one flank and cold on the other. sp peaks at 0.169, so 0.985 + sp
   * exceeds 1.0 on purpose — blue never quite completes at grazing, and that
   * incompleteness IS the fringe. */
  float sp = uEdgeSplit * (0.35 + 1.9 * f2);
  vec3 fireRGB = vec3(
    smoothstep(0.62 - sp, 0.985 - sp, vEdge),
    smoothstep(0.62,      0.985,      vEdge),
    smoothstep(0.62 + sp, 0.985 + sp, vEdge)
  );
  fireRGB *= fireRGB * (0.42 + 1.16 * hackle);

  /* Chill. A fresh fracture face is microscopically rough: it forward-
   * scatters and goes milky, in patches following the hackle, never as an
   * even band. Held almost entirely back until the break — at half strength
   * it frosts the intact pane's crack lines before anything has happened. */
  float frost = smoothstep(0.42, 1.0, vEdge)
              * smoothstep(0.30, 0.82, hackle)
              * (0.15 + 0.85 * uOpen);

  vec3 edgeCol = fireRGB * vec3(1.55, 1.22, 0.90) * (0.20 + 1.15 * fres) * lit
               + mix(vec3(0.26, 0.40, 0.82), uAccent, 0.80)
                 * (fireRGB.g * 0.22 + curve * fres * 0.30)
               + mix(vec3(1.0), uAccent, 0.20) * frost * (0.15 + 0.55 * fres);
  // A third at rest: enough that the crazing reads as glass rather than as
  // bright trim, without the intact pane growing a blown white web.
  edgeCol *= mix(0.34, 1.0, surface);

  /* The trade. Nothing is added on top of anything: what the surface
   * reflects, it does not transmit. The dark band multiplies DOWN what is
   * behind it — an absence of light, not a black paint stroke — and the edge
   * is added after, so the dark band never eats the fire line. */
  vec3 col = (inner * (1.0 - fres) * mix(1.02, 0.92, uOpen) + mirror * fres)
             * (1.0 - edgeDark * 0.80)
           + edgeCol
           + mix(vec3(1.0), uAccent, 0.15) * polish * 0.10 * surface
           + vec3(1.0, 0.98, 0.94) * pits * (0.03 + 0.20 * fres) * surface;

  /* 6. Caustic. Where the poured surface folds toward the key the light
   * bunches into filaments — thin threads with dark between them. Ridged,
   * then sharpened to the eighth by repeated squaring (six multiplies, no
   * transcendental), and gated hard on where the key is actually going so it
   * reads as focused light rather than as a texture. It is the only term in
   * the shader that is a moment rather than a shading function: as a shard
   * turns, threads fire and die. Static materials read as plastic. */
  float ridge = max(1.0 - abs(na.g + na.b - 1.0) * 3.2, 0.0);
  ridge *= ridge;
  ridge *= ridge;
  ridge *= ridge;                                  // ^8
  float lit2 = max(dot(Ns, uKeyDir), 0.0);
  lit2 *= lit2;
  lit2 *= lit2;                                    // ^4, a real gate
  float caustic = ridge * lit2 * (0.20 + 0.80 * curve) * uOpen;
  // At 2.4 the threads stopped reading as focused light and started
  // reading as smoke sitting on the surface.
  col += mix(vec3(1.0, 0.955, 0.87), uAccent, 0.25) * caustic * 1.5;

  // The swell catches its own light, so a moving surface glints as it moves.
  col += vec3(0.5, 0.55, 0.62) * max(vSwell, 0.0) * 0.22 * uOpen;

  /* The shock ring: the moment the pane gives way, a bright front runs out
   * from the impact along every edge it crosses. */
  float d = length((vUvHero - uImpactUv) * vec2(uPaneAspect, 1.0));
  float ring = exp(-pow((d - uCrackR) * 7.5, 2.0));
  float crack = ring * uCrackAmt * (0.25 + 1.6 * curve);
  col += mix(vec3(1.0), uAccent, 0.35) * crack * 2.4;

  /* Body.
   *
   * Intact, the pane is a sheet of clear glass lying on the picture: the
   * faces give you the picture itself, unaltered, and only the fracture
   * catches the light. That is also what spares the hand-over from having to
   * match a refracting lens pixel for pixel, since a lens by definition does
   * not match what is behind it.
   *
   * Once loose, the silhouette tracks the luminance of what the fragment
   * actually became: the page shows through the dark parts of a shard and the
   * bright parts stay solid, so the piece is drawn by light rather than by a
   * filled rectangle. The floor is 0.62 and not lower on purpose — these
   * meshes run depthWrite, and three sorts transparent meshes back-to-front
   * by object centre, which is only approximately right for sixteen large
   * plates lying on a dish at similar z. Drop it further and every sort error
   * that is currently invisible becomes a punched hole. */
  float bodyLum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float body = smoothstep(0.0, 0.32, uOpen) * 0.94
             * (0.62 + 0.38 * smoothstep(0.004, 0.115, bodyLum));

  float alpha = clamp(body
                    + curve * (0.30 + 0.55 * fres) * (0.58 + 0.84 * hackle)
                    + edgeDark * 0.30 * surface
                    + fireRGB.g * (0.25 + 0.50 * fres) * surface
                    + frost * 0.26
                    + (fres * 0.30 + min(glint.g, 1.0) * 0.55) * surface
                    + crack * 0.8, 0.0, 1.0);
  alpha *= uReveal;
  // Nothing to show and nothing to occlude: keep it out of the depth buffer.
  if (alpha < 0.012) discard;

  /* A shoulder, not a limiter. There is no tone mapping on this renderer, so
   * anything over 1.0 hard-clips per channel — and per-channel clipping turns
   * every warm highlight pure white, which is itself one of the plastic
   * tells. This preserves the ratio between channels on the way up while
   * still letting the core clip: the asymptote is 1.35, so a blowout is still
   * a blowout, it just arrives through its own colour. */
  float peak = max(max(col.r, col.g), max(col.b, 1e-5));
  float over = max(peak - 0.80, 0.0);
  float rolled = min(peak, 0.80) + 0.55 * (1.0 - exp(-over / 0.55));
  col *= rolled / peak;

  gl_FragColor = vec4(col, alpha);

  #include <colorspace_fragment>

  // The canvas composites over the page premultiplied, so fold alpha in
  // after the colour has been converted, never before.
  gl_FragColor.rgb *= gl_FragColor.a;
}
