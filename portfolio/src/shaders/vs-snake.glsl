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

  vec3 z = vSpeed > 1e-8 ? normalize( d1 ) : vec3( 0.0, 0.0, 1.0 );
  vec3 xr = cross( z , normalize( d2 + vec3( 1e-7 ) ) );
  vec3 x = length( xr ) > 1e-8 ? normalize( xr ) : vec3( 1.0, 0.0, 0.0 );
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
