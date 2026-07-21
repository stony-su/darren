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

uniform float uTime;
uniform float lineStrength;

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

void main(){

  vec2 uv = gl_FragCoord.xy / resolution;
  vec4 oPos = texture2D( t_oPos , uv );
  vec4 pos  = texture2D( t_pos , uv );

  vec3 vel = pos.xyz - oPos.xyz;

  // Time-based speed multiplier
  float timeScale = dT * 60.0;

  // Filament-chain topology: consecutive texels form follow-the-leader
  // chains of CHAIN particles. Index 0 of each chain is the leader.
  float texW = resolution.x;
  vec2 texel = floor(gl_FragCoord.xy);
  float idx = texel.y * texW + texel.x;
  float posInChain = mod(idx, CHAIN);
  float isLeader = 1.0 - step(0.5, posInChain);
  float chainRand = rand(vec2(floor(idx / CHAIN) * 0.137, 4.7));
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
      float cruise = 0.0032 * (0.7 + 0.6 * chainRand);
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
  // letters hold still once formed.
  if (arrive > 0.001) {
    vel += (tgt.xyz - pos.xyz) * 0.06 * arrive * timeScale;
    vel *= mix(1.0, pow(0.80, timeScale), arrive * 0.9);
  }

  // Release burst: scatter + recede into depth so a held formation dissolves
  // into the fog instead of flaring across the screen
  // (fired when text formation lets go, decays scene-side in ~1s)
  if (burstStrength > 0.001) {
    vec3 scatter = curlNoise(pos.xyz * (noiseSize * 2.5) + vec3(37.7, 17.3, 91.1));
    vel += (scatter * 0.001 + vec3(0.0, 0.0, -0.002)) * burstStrength * timeScale;
  }

  vel *= pow(.97, timeScale); // dampening

  vec3 p = pos.xyz + vel;

  gl_FragColor = vec4( p , 1. );
}
