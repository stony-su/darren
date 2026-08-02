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
uniform float speedSpread; // 0 = every particle runs at sim speed, 1 = full 0.1x..10x spread

varying vec2 vUv;

// Chain length for filament-line mode (particles per line)
#define CHAIN 64.0

// -- simplex noise chunk --
%SIMPLEX%

// -- curl noise chunk --
%CURL%

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

// Box-Muller: two uniform samples -> one standard normal. Used for the
// randomized-speed bell curve; a plain rand() would spread speeds flat.
float gauss(vec2 s1, vec2 s2){
    float u1 = max(rand(s1), 1e-6);
    return sqrt(-2.0 * log(u1)) * cos(6.28318530718 * rand(s2));
}

void main(){

  vec2 uv = gl_FragCoord.xy / resolution;
  vec4 oPos = texture2D( t_oPos , uv );
  vec4 pos  = texture2D( t_pos , uv );

  vec3 vel = pos.xyz - oPos.xyz;

  // Frame-rate normalisation. Drag and the formation hold stay on this clock;
  // the driving forces run on `timeScale` below, which the randomized-speed
  // option scales per particle.
  float dampScale = dT * 60.0;

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

  // Randomized speed: each particle gets its own multiplier, normal in log10
  // space centred on 1x, so the spread is a bell over 0.1x..10x — most sit near
  // normal speed and the extremes are rare.
  // It scales the driving forces only, NOT the drag below: drag already scales
  // with the timestep, so multiplying both just cancels out and every particle
  // ends up at the same terminal speed.
  // In line mode the draw is seeded per chain, so a whole filament shares one
  // speed and travels as a single object.
  float speedMul = 1.0;
  if (speedSpread > 0.0001) {
    vec2 cs = vec2(chainId * 0.311, chainId * 0.577);
    float g = mix(
      gauss(uv * 3.17 + 11.3, uv * 5.41 + 27.9),
      gauss(cs + 9.13, cs + 2.71),
      lineStrength
    );
    // +/-3 sigma spans one decade each way; the clamp pins the tails to the
    // stated 0.1x / 10x bounds instead of letting a rare sample run away.
    speedMul = pow(10.0, clamp(g / 3.0, -1.0, 1.0) * speedSpread);
  }
  float timeScale = dampScale * speedMul;

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
    float repel = smoothstep(exclusionRadius, 0.0, dist) * (1.0 - arrive);
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
    float deflect = smoothstep(0.18, -0.05, sd) * cardStrength * zMask;
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
      // Cruise is an absolute target speed, so the per-chain multiplier has to
      // scale it directly — steering toward a fixed magnitude would otherwise
      // pin every filament to the same speed no matter its draw.
      float cruise = 0.0032 * (0.7 + 0.6 * chainRand) * speedMul;
      vec3 steered = mix(vel, flowDir * cruise, clamp(0.10 * timeScale, 0.0, 1.0));
      vel = mix(vel, steered, lineStrength);
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
        // Scaled too, or the closing speed caps out below a fast leader's
        // cruise and the chain stretches until it snaps apart.
        float pull = clamp(d - 0.014, -0.03, 0.03);
        vec3 chase = (toPrev / d) * pull * 0.25 * speedMul;
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
  // letters hold still once formed.
  // Held on dampScale, not the per-particle clock: a formation's job is to hit
  // its target and stay put, and a 10x spring here just rings around it.
  if (arrive > 0.001) {
    vel += (tgt.xyz - pos.xyz) * 0.06 * arrive * dampScale;
    vel *= mix(1.0, pow(0.80, dampScale), arrive * 0.9);
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

  vel *= pow(.97, dampScale); // dampening

  vec3 p = pos.xyz + vel;

  gl_FragColor = vec4( p , 1. );
}
