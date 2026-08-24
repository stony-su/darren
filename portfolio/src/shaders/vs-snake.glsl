attribute vec2 lookup;

uniform sampler2D t_pos;
uniform sampler2D t_oPos;
uniform sampler2D t_ooPos;
uniform float uSnowflake;
uniform float uStretch;
uniform float uLineStrength;

varying vec3 vNorm;
varying vec2 vLookup;
varying float vSpeed;
varying float vViewZ;

/* A step smaller than this is float32 quantization noise, not motion: world
   coordinates run past 6 out at the edges of the field, where one ULP is
   ~5e-7. Steps are bimodal in practice — parked particles sit at 0..1e-7,
   moving ones at 1e-4 and up — so this band is empty and nothing flickers
   across it. */
const float REST_STEP = 2e-6;
const float MOVE_STEP = 2e-5;

/** Stable per-particle axis, uniform over the sphere. */
vec3 parkedAxis( vec2 seed, float salt ) {
  float a = fract( sin( dot( seed, vec2( 127.1, 311.7 ) ) + salt ) * 43758.5453 ) * 6.2831853;
  float pz = fract( sin( dot( seed, vec2( 269.5, 183.3 ) ) + salt ) * 43758.5453 ) * 2.0 - 1.0;
  float r = sqrt( max( 0.0, 1.0 - pz * pz ) );
  return vec3( cos( a ) * r, sin( a ) * r, pz );
}

/* Resting axis for the *shading* normal. Spread around +Z rather than over
   the whole sphere: +Z is the resting hue the field has always had, so a
   settled formation still reads in the theme's colour — a live speckle
   around it instead of full-spectrum confetti, which buries the letterforms. */
const float PARKED_SPREAD = 0.45;

vec3 parkedShadingAxis( vec2 seed ) {
  vec3 biased = mix( vec3( 0.0, 0.0, 1.0 ), parkedAxis( seed, 0.0 ), PARKED_SPREAD );
  float bl = length( biased );
  return bl > 1e-4 ? biased / bl : vec3( 0.0, 0.0, 1.0 );
}

/* Unit direction of a step, fading to a parked axis as the step decays into
   noise. Normalizing a noise-sized step reseeds a random direction every
   frame, and a step of exactly zero has no direction at all — so a settled
   formation would otherwise strobe between confetti and whatever constant
   the guard fell back to (identical for every particle). Both are visible:
   the feather's only vertex normal is +Z, so the frame's z axis IS the
   shading normal, and normal-shaded themes read it straight out as color. */
vec3 stepDir( vec3 delta, vec3 parked ) {
  float len = length( delta );
  vec3 blended = mix( parked, delta / max( len, REST_STEP ),
                      smoothstep( REST_STEP, MOVE_STEP, len ) );
  float bl = length( blended );
  return bl > 1e-4 ? blended / bl : parked;   // guard the antipodal midpoint
}

void main(){

  vLookup = lookup;

  // instance position from GPGPU textures
  vec3 iPos   = texture2D( t_pos   , lookup ).xyz;
  vec3 ioPos  = texture2D( t_oPos  , lookup ).xyz;
  vec3 iooPos = texture2D( t_ooPos , lookup ).xyz;

  // velocity-based rotation matrix. Particles that have come to rest — e.g.
  // holding a text formation — have no direction of travel to build it from,
  // so they hold a stable per-particle axis instead of NaN, noise, or one
  // shared constant.
  vec3 d1 = iPos  - ioPos;
  vec3 d2 = ioPos - iooPos;

  vSpeed = length( d1 );

  vec3 z = stepDir( d1, parkedShadingAxis( lookup ) );
  vec3 xr = cross( z , stepDir( d2, parkedAxis( lookup, 7.13 ) ) );
  // In filament-line mode, near-straight motion makes this cross product
  // degenerate and normalizing it amplifies float noise into per-particle
  // random orientations (confetti normals along the lines) — so lines use a
  // stable reference frame. Chaos mode keeps the noisy roll: its shimmer is
  // what makes dense formations (DARREN) glow white-hot while they gather.
  // (Parked particles are already stable — both axes come from stepDir.)
  float axisThresh = mix( 1e-8, 1e-3, uLineStrength );
  vec3 ref = abs( z.y ) < 0.95 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
  vec3 x = length( xr ) > axisThresh ? normalize( xr ) : normalize( cross( z, ref ) );
  vec3 y = cross( z , x );

  mat3 rot = mat3(
    x.x , x.y , x.z ,
    y.x , y.y , y.z ,
    z.x , z.y , z.z
  );

  // Filament-line rig: this legacy frame maps the feather's plane normal to
  // the motion direction, so a chain cruising straight in the screen plane
  // is seen edge-on — an invisible sliver. In line mode, point the length
  // axis along the motion and turn the plane toward the camera instead.
  if ( uLineStrength > 0.001 ) {
    vec3 zc = vec3( 0.0, 0.0, 1.0 ) - z * z.z;
    float zcl = length( zc );
    vec3 zcam = zcl > 1e-4 ? zc / zcl : vec3( 0.0, 1.0, 0.0 );
    vec3 xc = cross( z, zcam );
    rot = mat3(
      mix( x, xc, uLineStrength ),
      mix( y, z, uLineStrength ),
      mix( z, zcam, uLineStrength )
    );
  }

  // Blizzard: morph the feather into a 6-arm snowflake (blend, not branch)
  vec3 modifiedPos = position;

  float armIndex = floor(mod(position.y * 100.0 + 3.0, 6.0));
  float armAngle = armIndex * 1.0472;

  float cosA = cos(armAngle);
  float sinA = sin(armAngle);

  float armLength = 2.0;
  float armWidth = 0.15;

  float extension = position.y * armLength;
  float width = position.x * armWidth;

  vec3 armLocal = vec3(width, 0.0, extension);

  vec3 snowflakePos;
  snowflakePos.x = armLocal.x * cosA - armLocal.z * sinA;
  snowflakePos.z = armLocal.x * sinA + armLocal.z * cosA;
  snowflakePos.y = position.z * 0.1;

  float branchPhase = mod(position.y * 8.0, 1.0);
  float branchOffset = sin(branchPhase * 6.28318) * 0.3 * step(0.3, abs(position.y));
  snowflakePos.x += branchOffset * cosA * 0.5;
  snowflakePos.z += branchOffset * sinA * 0.5;

  float variation = sin(lookup.x * 50.0 + lookup.y * 37.0);
  snowflakePos *= 0.8 + variation * 0.2;

  float snowAngle = lookup.x * 6.28318 + lookup.y * 3.14159;
  float cS = cos(snowAngle);
  float sS = sin(snowAngle);
  vec3 rotatedSnow;
  rotatedSnow.x = snowflakePos.x * cS - snowflakePos.z * sS;
  rotatedSnow.z = snowflakePos.x * sS + snowflakePos.z * cS;
  rotatedSnow.y = snowflakePos.y;

  modifiedPos = mix(position, rotatedSnow, uSnowflake);

  // Velocity stretch: shear the feather's length axis into the motion axis
  // so fast particles elongate along their path (disabled for snowflakes).
  // The line rig already points the length axis along the motion, so there
  // it elongates directly instead of shearing into the plane normal.
  float stretch = clamp(vSpeed * uStretch, 0.0, 1.2) * (1.0 - uSnowflake);
  modifiedPos.z += modifiedPos.y * stretch * (1.0 - uLineStrength);
  modifiedPos.y *= 1.0 + stretch * 1.2 * uLineStrength;

  // Near-camera boost: particles drifting toward the lens grow beyond raw
  // perspective, reading as big soft foreground shapes "outside" the screen
  vec4 soulMv = modelViewMatrix * vec4( iPos, 1.0 );
  float prox = smoothstep(1.6, 0.5, -soulMv.z);
  modifiedPos *= 1.0 + prox * 1.4;

  vNorm = rot * normal;

  vec3 pos = iPos + rot * modifiedPos;

  vec4 mvPosition = modelViewMatrix * vec4( pos , 1. );
  vViewZ = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
