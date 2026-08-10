uniform sampler2D t_oPos;
uniform sampler2D t_pos;

uniform float dT;
uniform float noiseSize;
uniform float exclusionRadius;
uniform vec3  mousePos;
uniform float mouseForce;
uniform vec2  resolution;

uniform sampler2D t_target;
uniform float targetStrength;
uniform float formationParticipation; // fraction of particles that join a formation

uniform vec3  cardCenter;
uniform vec2  cardHalfSize;
uniform float cardRadius;
uniform float cardStrength;

uniform vec3  windDir;
uniform float burstStrength;

uniform vec3  shockCenter;
uniform float shockStrength;

uniform float uTime;
uniform float lineStrength;
uniform float attractorStrength; // 0 = curl chaos, 1 = Lorenz strange attractor
uniform float holeStrength; // 0 = curl chaos, 1 = black hole owns the field
uniform vec3  holeCenter;   // world-space gravity well (the eased pointer)
uniform float surfaceStrength; // 0 = curl chaos, 1 = gyroid minimal surface

varying vec2 vUv;

// Chain length for filament-line mode (particles per line)
#define CHAIN 64.0

// Lorenz strange attractor (classic sigma/rho/beta — the butterfly). LZ_SCALE
// is world units per Lorenz unit; the attractor spans roughly +/-20 in x and
// 0..50 in z, so 0.04 fills the stage height with margin. LZ_ZC re-centers
// that z range on the world origin, and LZ_DEPTH squashes the attractor's
// remaining axis into screen depth so the silhouette stays the recognizable
// butterfly instead of an edge-on smear.
#define LZ_SIGMA 10.0
#define LZ_RHO   28.0
#define LZ_BETA  2.6666667
// Sized well under the frustum on purpose: particles lag the flow through
// every turn, so the cloud settles onto a manifold noticeably fatter than the
// ideal curve, and a scale that fits on paper overflows the frame in motion.
#define LZ_SCALE 0.030
#define LZ_ZC    25.0
// Depth is mapped 1:1 with the other two axes rather than squashed: flattening
// the attractor toward the screen plane is what turns it from a butterfly into
// a filled violet blob. At full depth the wings tilt through ~1.3 world units
// of z, so perspective and the depth fade separate the near wing from the far
// one and the structure reads.
#define LZ_DEPTH 1.0
#define LZ_CRUISE 0.0095

// Black hole. Speeds below are world units per frame at 60fps / 1x sim speed;
// they get the frame step and the per-particle draw applied at the use site.
// The stage is roughly 4.5 x 2.5 world units at z=0, so a rim at 1.45 fills
// the frame's height and leaves the corners to the free field.
#define BH_RIM     1.45
// Where particles are actually eaten. Much smaller than the shadow you see —
// see the note on the plunge term for which one draws the black centre.
#define BH_HORIZON 0.085
// Softening radius for the orbit law. Without it v ~ 1/sqrt(r) runs away as
// r -> 0 and the last ring before the horizon steps further per frame than it
// is wide, which draws as a scribble rather than a ring.
#define BH_CORE    0.16
#define BH_ORBIT   0.0135
#define BH_INFALL  0.0026
// Disc axis: mostly toward the camera, tilted ~23 degrees off it. Face-on the
// disc is a flat ring with no depth to read; edge-on it is a line. This much
// tilt shows it as an ellipse, and puts the far half far enough back that the
// depth fade separates it from the near half. BH_U/BH_V span the disc plane
// (BH_V = cross(BH_N, BH_U)) and are only used to place respawns on the rim.
#define BH_N vec3(0.0, 0.3873, 0.9221)
#define BH_U vec3(1.0, 0.0, 0.0)
#define BH_V vec3(0.0, 0.9221, -0.3873)

// Gyroid minimal surface: F(q) = sin x cos y + sin y cos z + sin z cos x = 0.
// GY_FREQ is radians per world unit, so one cell spans 2π/GY_FREQ ≈ 1.65
// world units — between two and three cells across the stage width, which is
// enough for the labyrinth to read as one without shrinking its walls into
// texture.
#define GY_FREQ   3.8
// Tangential wander speed (world units per frame at 60fps / 1x). Fast enough
// that particles visibly *stream* along the walls — their motion-stretch and
// trails are what draw the sheets as ribbons; at ambient drift speed the same
// population reads as static clutter.
#define GY_CRUISE 0.006
// Cap on the descent speed toward the surface. Everything starts within half
// a cell of *some* sheet, so even at this crawl the labyrinth condenses out
// of the chaos in a couple of seconds.
#define GY_SNAP   0.012

// -- simplex noise chunk --
%SIMPLEX%

// -- curl noise chunk --
%CURL%

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main(){

  vec2 uv = gl_FragCoord.xy / resolution;
  vec4 oPos = texture2D( t_oPos , uv );
  vec4 pos  = texture2D( t_pos , uv );

  vec3 vel = pos.xyz - oPos.xyz;
  // Velocity is implicit in the two position buffers, so a position that did
  // not come from the one before it — the black hole's horizon respawn is the
  // only one — reads here as a single stage-crossing step. The sim flags such
  // a write by putting 0 in the w channel (1 otherwise); that particle simply
  // restarts from rest, and the field it lands in accelerates it again.
  vel *= step(0.5, pos.w);

  // Time-based speed multiplier
  float timeScale = dT * 60.0;

  // Filament-chain topology: consecutive texels form follow-the-leader
  // chains of CHAIN particles. Index 0 of each chain is the leader.
  float texW = resolution.x;
  vec2 texel = floor(gl_FragCoord.xy);
  float idx = texel.y * texW + texel.x;
  float posInChain = mod(idx, CHAIN);
  float isLeader = 1.0 - step(0.5, posInChain);
  float chainId = floor(idx / CHAIN);
  float chainRand = rand(vec2(chainId * 0.137, 4.7));
  float follower = lineStrength * (1.0 - isLeader);

  vec3 curl = curlNoise( pos.xyz * noiseSize );
  // Followers in line mode shed most of their individual jitter so the
  // chains stay thin instead of fuzzing back into a cloud.
  vel += curl * .0001 * timeScale * mix(1.0, 0.18, follower);

  // Ambient wind drift (per-slide direction + scroll gusts)
  vel += windDir * 0.00012 * timeScale;

  // Text-formation lookup (needed by the exclusion logic below):
  // only a fraction of particles join the formation; the rest keep flowing so
  // the release never dumps the whole population in one burst. Compact icon
  // slides lower the fraction so the shape stays sparse and colorful instead of
  // overlapping into a bloom-white blob.
  vec4 tgt = vec4(0.0);
  float participate = 0.0;
  float arrive = 0.0;
  if (targetStrength > 0.001) {
    tgt = texture2D(t_target, uv);
    participate = step(tgt.w, formationParticipation);
    arrive = clamp(targetStrength * 1.6 - fract(tgt.w * 7.0) * 0.5, 0.0, 1.0) * participate;
    // A shockwave overrides the formation hold. Without this the settle
    // damping further down (x0.80/frame while arrive is high) eats the kick
    // on the very frames it is strongest, and the shape only swells a little
    // instead of coming apart. The spring returns as the wave fades, which is
    // what pulls the particles back into the next shape.
    arrive *= 1.0 - smoothstep(0.05, 0.45, shockStrength);
  }

  // Center exclusion zone — particles physically repelled from origin.
  // Formation members ignore it (the letters live near the center).
  vec3 toCenter = pos.xyz;
  float dist = length(toCenter);
  if (dist > 0.001) {
    // The attractor owns the middle of the stage (the saddle between its two
    // lobes sits on the origin), so its flow is exempt from the exclusion too.
    // So is the black hole: the well is usually parked near the middle, and an
    // origin repulsion punches a hole straight through the inner disc. And the
    // gyroid: its sheets pass through the origin like everywhere else, and the
    // repulsion would blow a bald patch in the middle of the labyrinth.
    float repel = smoothstep(exclusionRadius, 0.0, dist) * (1.0 - arrive)
                  * (1.0 - max(attractorStrength, max(holeStrength, surfaceStrength)));
    vel += normalize(toCenter) * repel * 0.0007 * timeScale;
  }

  // While the text holds, non-participants drift behind the text plane and
  // into the depth fade, leaving the word crisp against a soft mist.
  float freeAgent = targetStrength * (1.0 - participate);
  if (freeAgent > 0.001) {
    float ahead = smoothstep(-0.8, 0.2, pos.z);
    vel += vec3(0.0, 0.0, -0.0012) * ahead * freeAgent * timeScale;
  }

  // Mouse attraction / repulsion (sign of mouseForce)
  if (mouseForce != 0.0) {
    vec3 toMouse = mousePos - pos.xyz;
    float mDist = length(toMouse);
    float influence = 1.0 / (1.0 + mDist * mDist * 8.0);
    vec3 mouseDir = normalize(toMouse);
    vel += mouseDir * mouseForce * influence * 0.0045 * timeScale;
  }

  // Strange-attractor mode: swap the curl field for the flow of the Lorenz
  // system. Every particle steers toward the local field direction, so the
  // whole population converges onto the attractor's manifold and then orbits
  // it forever — winding out one lobe of the butterfly, flipping to the other,
  // never repeating. Steering (a first-order chase toward a target velocity)
  // rather than integrating the raw derivative: the field's magnitude spans two
  // orders of magnitude, and adding that as acceleration flings the outliers
  // off-screen.
  // Placed above the card deflection and below the mouse force on purpose —
  // both of those then push against the settled flow, so the pointer and the
  // slide's copy still carve visible holes in the butterfly instead of being
  // overwritten by it every frame. In filament-line mode only the leaders
  // steer; their chains draw the flow lines behind them.
  if (attractorStrength > 0.001) {
    float lx = pos.x / LZ_SCALE;
    float ly = pos.z / (LZ_SCALE * LZ_DEPTH);
    float lz = pos.y / LZ_SCALE + LZ_ZC;
    vec3 d = vec3(
      LZ_SIGMA * (ly - lx),
      lx * (LZ_RHO - lz) - ly,
      lx * ly - LZ_BETA * lz
    );
    // Back to world axes: Lorenz z is screen-up, its y is screen depth.
    vec3 flow = vec3(d.x, d.z, d.y * LZ_DEPTH) * LZ_SCALE;
    float fl = length(flow);
    vec3 dir = fl > 1e-6 ? flow / fl : vec3(0.0, 1.0, 0.0);
    // Speed tracks the local field magnitude (clamped): particles crawl through
    // the slow saddle in the middle and swoop through the lobe hand-offs, which
    // is what makes the trails read as a flow rather than a moving crowd.
    // timeScale keeps it frame-rate independent (and speed-slider responsive),
    // capped so a 10x sim can't step further than the manifold is thick.
    float cruise = LZ_CRUISE * clamp(fl / 3.0, 0.35, 2.2) * min(timeScale, 4.0);
    vec3 steered = mix(vel, dir * cruise, clamp(0.30 * timeScale, 0.0, 1.0));
    vel = mix(vel, steered, attractorStrength * (1.0 - follower));
  }

  // Black-hole mode: the pointer becomes a gravity well, and the field is
  // captured into an accretion disc. A tangential term winds particles into
  // orbit, a slow radial term spirals them down, and the event horizon eats
  // whatever reaches it and drops it back on the rim.
  // Steered toward a target velocity rather than integrated from a 1/r^2
  // acceleration, for the same reason the attractor is: real gravity spans
  // orders of magnitude across the stage, and the inner particles leave the
  // frame on the first frame. Steering also makes the orbit law something the
  // shader states outright — v ~ 1/sqrt(r), so inner rings visibly shear past
  // outer ones, which is the whole reason the disc reads as a disc and not a
  // ring of confetti.
  float bhEaten = 0.0;
  vec3 bhRespawn = vec3(0.0);
  if (holeStrength > 0.001) {
    vec3 rel = pos.xyz - holeCenter;
    float r = length(rel);
    vec3 outward = r > 1e-5 ? rel / r : BH_U;

    // Orbit direction: tangent to the circle this particle traces when rotated
    // about the disc axis. Degenerate only for a particle sitting exactly on
    // the axis, which the fallback shoves off it.
    vec3 tang = cross(BH_N, outward);
    float tlen = length(tang);
    tang = tlen > 1e-4 ? tang / tlen : BH_U;

    // A minority of particles are given a far looser disc and become the halo
    // around it. Without them the entire population stacks onto one thin
    // annulus, which is the density trap the rest of this file keeps warning
    // about — and a bare disc reads flatter than a disc with a haze around it.
    float bhRand = rand(uv * 1.93 + vec2(5.7, 2.1));
    float halo = smoothstep(0.70, 1.0, bhRand);

    float vOrb = BH_ORBIT / sqrt(max(r, BH_CORE));
    // Slow drift inward, plunging below r ~ 0.85, plus a hauling term well
    // outside the rim — at the ambient infall rate, switching the mode on
    // spends fifteen seconds reeling in the corners of the stage before
    // anything recognisable appears.
    // The plunge is what draws the black disc at the centre, not BH_HORIZON:
    // particles cross it several times faster than they drift through the
    // disc, so the region inside it stays swept clean and reads as the hole's
    // shadow. Tightening the plunge fills that in and costs the disc its
    // depth — it narrows to a single uniform ring.
    float vIn = BH_INFALL * (0.55
                             + 1.35 * smoothstep(0.85, 0.12, r)
                             + 2.00 * smoothstep(1.5, 3.2, r));

    // Flatten toward the disc plane, but only past a flared half-thickness:
    // driving every particle onto the plane exactly is the whiteout again.
    float h = dot(rel, BH_N);
    float halfH = (0.045 + 0.085 * r) * (1.0 + 5.0 * halo);
    float over = h - clamp(h, -halfH, halfH);

    // Absolute target speeds, so the frame step has to scale them directly
    // (capped, exactly as the attractor's cruise is).
    float bhStep = min(timeScale, 4.0);
    vec3 vTarget = (tang * vOrb - outward * vIn - BH_N * over * 0.12) * bhStep;
    vec3 steered = mix(vel, vTarget, clamp(0.22 * timeScale, 0.0, 1.0));
    vel = mix(vel, steered, holeStrength * (1.0 - follower));

    // Event horizon. Nothing in this sim can write a velocity, so a respawn
    // has to be a bare position write — see the w-channel flag at the top of
    // main(), which is what keeps the teleport from reading as one colossal
    // step here and as a screen-long streak in the vertex rig.
    // Formation members are exempt: a preset holding a shape over the well
    // would otherwise be shredded a particle at a time.
    if (holeStrength > 0.5 && r < BH_HORIZON && arrive < 0.5) {
      float ang = rand(uv * 7.31 + vec2(fract(uTime * 0.31), 1.7)) * 6.28318530718;
      float rr = BH_RIM * (0.88 + 0.24 * rand(uv * 3.77 + vec2(2.3, fract(uTime * 0.17))));
      // Halo particles come back into the halo, or the disc slowly eats it.
      float lift = (rand(uv * 5.13 + vec2(fract(uTime * 0.23), 8.1)) - 0.5)
                   * (0.10 + 1.6 * halo);
      bhRespawn = holeCenter + (cos(ang) * BH_U + sin(ang) * BH_V) * rr + BH_N * lift;
      bhEaten = 1.0;
    }
  }

  // Minimal-surface mode: the field condenses onto a gyroid isosurface and
  // then wanders along it forever — an infinite glowing labyrinth. The
  // gradient is analytic, so the descent is a handful of instructions: one
  // Newton step gives the signed distance to the sheet, and the curl flow is
  // projected onto the tangent plane so particles explore *along* the surface
  // instead of fighting it. Steered toward a target velocity like the other
  // modes, and for the same reason: the pull must never outrun the wander, or
  // the population stacks onto the sheet and blooms white.
  if (surfaceStrength > 0.001) {
    // A surface is a 2D manifold — the same density trap as the attractor.
    // Each particle gets its own iso level on a band around zero, so the
    // population fills a soft shell of nearby level sets instead of one
    // razor-thin sheet. The band stays well inside ±1.4, where the gyroid's
    // level sets pinch off and the labyrinth falls apart into blobs.
    float iso = (rand(uv * 2.71 + vec2(3.9, 8.4)) - 0.5) * 0.6;
    vec3 q = pos.xyz * GY_FREQ;
    float f = sin(q.x) * cos(q.y) + sin(q.y) * cos(q.z) + sin(q.z) * cos(q.x) - iso;
    vec3 grad = vec3(
      cos(q.x) * cos(q.y) - sin(q.z) * sin(q.x),
      cos(q.y) * cos(q.z) - sin(q.x) * sin(q.y),
      cos(q.z) * cos(q.x) - sin(q.y) * sin(q.z)
    );
    // The gradient vanishes on the lattice of points where all three terms
    // peak together; the floor keeps the normal finite there and the Newton
    // step just reports a small distance, which is true enough.
    float invg = inversesqrt(max(dot(grad, grad), 1e-4));
    vec3 n = grad * invg;
    // Newton step to the sheet, converted to world units (chain rule).
    float d = f * invg / GY_FREQ;

    // Wander: the curl field with its normal component removed, so the flow
    // follows the sheet's twists. A lower frequency than the ambient chaos —
    // the walls are ~1.5 world units apart, and noise finer than the cells
    // reads as jitter, not as travel through the labyrinth. The seed drifts
    // slowly: the projection is not divergence-free on the manifold, so a
    // frozen flow herds the population into its stagnation points and the
    // surface goes patchy; sliding the pattern keeps redealing them.
    vec3 flow = curlNoise(pos.xyz * noiseSize * 0.6 + vec3(11.0 + uTime * 0.05, 5.0, 23.0));
    vec3 tang = flow - n * dot(flow, n);
    vec3 tdir = normalize(tang + vec3(1e-6));
    // Per-particle pace spread, so the surface shimmers with relative motion
    // instead of scrolling as one rigid texture.
    float pace = 0.7 + 0.6 * rand(uv * 4.13 + vec2(6.2, 1.8));

    // Descent speed proportional to the distance, capped — far particles
    // approach at the cap, near ones ease in and settle instead of buzzing
    // across the sheet every frame.
    float vSnap = clamp(d * 0.5, -GY_SNAP, GY_SNAP);
    float gyStep = min(timeScale, 4.0);
    vec3 vTarget = (tdir * GY_CRUISE * pace - n * vSnap) * gyStep;
    vec3 gySteered = mix(vel, vTarget, clamp(0.20 * timeScale, 0.0, 1.0));
    vel = mix(vel, gySteered, surfaceStrength * (1.0 - follower));

    // The sheets are infinite and the wander is a random walk along them, so
    // without a recall the population slowly diffuses off-stage for good (the
    // attractor and the hole recirculate by construction; this mode has to be
    // told). Same soft box the swirl lines use: no force inside, springs back
    // past the bounds. The spring is off-surface, but the descent term
    // re-seats returners on the nearest sheet within a second.
    // The z-slab is much thinner than the frustum on purpose: the labyrinth
    // is only legible one layer at a time — give it the full depth and the
    // camera sees three cells of walls stacked on top of each other, which
    // scrambles the structure back into clutter.
    vec3 gyExcess = pos.xyz - clamp(pos.xyz, vec3(-2.6, -1.5, -0.5), vec3(2.6, 1.5, 0.5));
    vel += -gyExcess * vec3(0.0006, 0.0006, 0.0018) * surfaceStrength * timeScale;
  }

  // Rounded-box deflection around the visible project card. The z-mask is
  // asymmetric: wide on the camera side (anything glowing between the card
  // and the lens washes out its text through the backdrop blur), narrow on
  // the far side so deep particles still drift behind the card.
  if (cardStrength > 0.001) {
    vec2 rel = pos.xy - cardCenter.xy;
    vec2 q = abs(rel) - (cardHalfSize - vec2(cardRadius));
    float sd = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - cardRadius;
    float dz = pos.z - cardCenter.z;
    float zMask = dz > 0.0 ? smoothstep(1.7, 0.2, dz) : smoothstep(0.9, 0.15, -dz);
    // Softened under the attractor: at full strength the deflection fountains a
    // steady plume of particles off the top of the frame, since the flow keeps
    // feeding the card's neighbourhood. This much still carves a readable hole
    // around the copy without the leak. The black hole feeds the card the same
    // way — every orbit sweeps the population back past it.
    float deflect = smoothstep(0.18, -0.05, sd) * cardStrength * zMask
                    * (1.0 - 0.6 * max(attractorStrength, holeStrength));
    vel += normalize(vec3(rel, 0.0) + vec3(0.0, 0.0, 1e-5)) * deflect * 0.0009 * timeScale;
  }

  // Filament lines (project-card slides): leaders cruise along a slow,
  // lower-frequency curl field; every other particle springs toward its
  // predecessor, so each chain traces the leader's path as one long thin
  // swirling line instead of a swarm of individually-wandering particles.
  if (lineStrength > 0.001) {
    if (isLeader > 0.5) {
      vec3 flow = curlNoise(pos.xyz * noiseSize * 0.55 + vec3(chainRand * 19.0, 7.0, 3.0));
      flow.z *= 0.35; // keep the lines swirling mostly in the screen plane
      vec3 flowDir = normalize(flow + vec3(1e-5));
      float cruise = 0.0032 * (0.7 + 0.6 * chainRand);
      vec3 steered = mix(vel, flowDir * cruise, clamp(0.10 * timeScale, 0.0, 1.0));
      // Attractor mode takes the leaders over (below), so the chains trace the
      // butterfly instead of a curl field; the followers keep chasing either way.
      vel = mix(vel, steered, lineStrength * (1.0 - attractorStrength));
    } else {
      float prevIdx = idx - 1.0;
      vec2 prevUv = (vec2(mod(prevIdx, texW), floor(prevIdx / texW)) + 0.5) / resolution;
      vec3 toPrev = texture2D(t_pos, prevUv).xyz - pos.xyz;
      float d = length(toPrev);
      if (d > 1e-5) {
        // First-order chase toward a fixed spacing behind the predecessor:
        // the follower's velocity converges to the closing speed instead of
        // integrating a spring (which winds up and explodes the field).
        // The repulsion floor keeps coiled chains from knotting into blobs.
        float pull = clamp(d - 0.014, -0.03, 0.03);
        vec3 chase = (toPrev / d) * pull * 0.25;
        vec3 followVel = mix(vel, chase, clamp(0.25 * timeScale, 0.0, 1.0));
        vel = mix(vel, followVel, follower);
      }
    }
    // Containment: a soft box. No force inside (lines roam the whole view
    // freely — a center-pull herds everything behind the card), springs back
    // only past the frustum-ish bounds, stronger in z.
    vec3 excess = pos.xyz - clamp(pos.xyz, vec3(-2.6, -1.5, -0.9), vec3(2.6, 1.5, 0.9));
    vel += -excess * vec3(0.0006, 0.0006, 0.0012) * lineStrength * timeScale;
  }

  // Depth floaters: a few percent of particles (whole chains, in line mode)
  // slowly swim toward the camera and back on a long sine, looming large in
  // perspective before dissolving near the lens. Off while text is forming.
  // Line mode floats fewer, gentler chains — a whole 64-particle chain near
  // the lens is a lot of glow, and several at once wash out the card.
  float floatRand = mix(rand(uv * 1.71 + 3.3), chainRand, lineStrength);
  float floater = step(mix(0.94, 0.97, lineStrength), floatRand);
  float floatAmp = mix(0.00022, 0.00013, lineStrength);
  vel.z += sin(uTime * 0.30 + floatRand * 91.0) * floatAmp
           * floater * (1.0 - targetStrength) * timeScale;

  // Text-formation target attraction: spring toward per-particle target,
  // staggered by the target texel's random w, with settle damping so the
  // letters hold still once formed. The spring is kept soft so particles
  // glide onto their targets over a couple of seconds rather than snapping.
  if (arrive > 0.001) {
    vel += (tgt.xyz - pos.xyz) * 0.04 * arrive * timeScale;
    vel *= mix(1.0, pow(0.80, timeScale), arrive * 0.9);
  }

  // Release burst: scatter + recede into depth so a held formation dissolves
  // into the fog instead of flaring across the screen
  // (fired when text formation lets go, decays scene-side in ~1s)
  if (burstStrength > 0.001) {
    vec3 scatter = curlNoise(pos.xyz * (noiseSize * 2.5) + vec3(37.7, 17.3, 91.1));
    vel += (scatter * 0.001 + vec3(0.0, 0.0, -0.002)) * burstStrength * timeScale;
  }

  // Transition shockwave: a point repulsion at the released shape's center,
  // fired for a fraction of a second so one formation blows apart outward
  // before the next gathers, instead of the two cross-dissolving. Pushed
  // mostly across the screen plane — a straight radial kick throws a wall of
  // particles at the lens, which just blooms white.
  if (shockStrength > 0.001) {
    vec3 away = pos.xyz - shockCenter;
    away.z *= 0.3;
    float d = length(away);
    // Speed grows with distance from the center, so the shape expands
    // self-similarly and thins out. A distance-falloff kick does the opposite:
    // the inner particles overtake the outer ones and compress the silhouette
    // into a dense shell that just blooms white.
    // `reach` confines the wave to the shape's neighborhood; the small
    // radial term gives particles sitting near the center somewhere to go.
    float reach = smoothstep(1.7, 0.15, d);
    vec3 dir = away / max(d, 1e-4);
    vel += (away + dir * 0.22) * reach * shockStrength * 0.115 * timeScale;
  }

  vel *= pow(.97, timeScale); // dampening

  vec3 p = pos.xyz + vel;

  // w = 1 for a position integrated from the previous one, 0 for a position
  // written from nowhere (a black-hole respawn). Consumers of the two position
  // buffers difference them to get velocity, so they need to be told.
  float continuous = 1.0;
  if (bhEaten > 0.5) {
    p = bhRespawn;
    continuous = 0.0;
  }

  gl_FragColor = vec4( p , continuous );
}
