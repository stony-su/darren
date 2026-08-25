attribute vec2 lookup;

uniform sampler2D t_pos;
uniform sampler2D t_oPos;
uniform sampler2D t_ooPos;
uniform float uSnowflake;
uniform float uStretch;

varying vec3 vNorm;
varying vec2 vLookup;
varying float vSpeed;
varying float vViewZ;

// Stable, uniformly-distributed unit vector per instance. Used as the resting
// orientation for particles that have stopped moving.
vec3 restAxis( vec2 lk ){
  float a = fract( sin( dot( lk , vec2( 12.9898 , 78.233 ) ) ) * 43758.5453 ) * 6.2831853;
  float u = fract( sin( dot( lk , vec2( 39.3468 , 11.1350 ) ) ) * 24634.6345 ) * 2.0 - 1.0;
  float r = sqrt( max( 0.0 , 1.0 - u * u ) );
  return vec3( r * cos( a ) , r * sin( a ) , u );
}

void main(){

  vLookup = lookup;

  // instance position from GPGPU textures
  vec3 iPos   = texture2D( t_pos   , lookup ).xyz;
  vec3 ioPos  = texture2D( t_oPos  , lookup ).xyz;
  vec3 iooPos = texture2D( t_ooPos , lookup ).xyz;

  // velocity-based rotation matrix (guarded against zero-length deltas so
  // near-still particles — e.g. holding a text formation — never go NaN)
  vec3 d1 = iPos  - ioPos;
  vec3 d2 = ioPos - iooPos;

  vSpeed = length( d1 );

  // Ease into a per-instance resting axis as the particle slows. A held text
  // formation damps velocity to zero against a static curl field, so every
  // settled particle used to take the same constant fallback axis — and since
  // the feather's normals are all +Z, vNorm IS this axis, which painted the
  // whole word one flat colour under theme 0's normal shading. Worse, at rest
  // the stored positions differ by either zero or a single float32 ulp, so a
  // hard threshold flipped the axis on and off frame to frame. Blending on a
  // speed scale ~50x below normal flow keeps moving particles untouched while
  // giving settled ones a quiet, varied orientation.
  vec3 rest = restAxis( lookup );
  float motion = smoothstep( 0.0 , 6e-5 , vSpeed );
  vec3 zMix = mix( rest , d1 / max( vSpeed , 1e-12 ) , motion );
  float zLen = length( zMix );
  vec3 z = zLen > 1e-6 ? zMix / zLen : rest;

  // Roll the feather into its trajectory plane; when that plane collapses fall
  // back to a branchless orthonormal tangent (Duff et al.) derived from z, so
  // the basis stays per-particle instead of snapping to a shared constant.
  vec3 xr = cross( z , normalize( d2 + vec3( 1e-7 ) ) );
  float sgn = z.z >= 0.0 ? 1.0 : -1.0;
  float ia  = -1.0 / ( sgn + z.z );
  vec3 xOnb = vec3( 1.0 + sgn * z.x * z.x * ia , sgn * z.x * z.y * ia , -sgn * z.x );
  vec3 x = length( xr ) > 1e-6 ? normalize( xr ) : xOnb;
  vec3 y = cross( z , x );

  mat3 rot = mat3(
    x.x , x.y , x.z ,
    y.x , y.y , y.z ,
    z.x , z.y , z.z
  );

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
  // so fast particles elongate along their path (disabled for snowflakes)
  float stretch = clamp(vSpeed * uStretch, 0.0, 1.2) * (1.0 - uSnowflake);
  modifiedPos.z += modifiedPos.y * stretch;

  vNorm = rot * normal;

  vec3 pos = iPos + rot * modifiedPos;

  vec4 mvPosition = modelViewMatrix * vec4( pos , 1. );
  vViewZ = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
