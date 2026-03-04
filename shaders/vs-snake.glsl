
attribute vec2 lookup;

uniform sampler2D t_pos;
uniform sampler2D t_oPos;
uniform sampler2D t_ooPos;
uniform float colorMode;

varying vec3 vNorm;
varying vec2 vLookup;

void main(){

  // Pass lookup to fragment shader for neon coloring
  vLookup = lookup;

  // instance position
  vec3 iPos   = texture2D( t_pos   , lookup ).xyz;
  vec3 ioPos  = texture2D( t_oPos  , lookup ).xyz;
  vec3 iooPos = texture2D( t_ooPos , lookup ).xyz;

  // getting the difference between pos and oldPos
  vec3 d1 = iPos  - ioPos;
  vec3 d2 = ioPos - iooPos;

  vec3 z = normalize( d1 );
  vec3 x = normalize( cross( normalize( d1 ) , normalize( d2 ) ) );
  vec3 y = cross( z , x );
  
  mat3 rot = mat3(
    x.x , x.y , x.z ,
    y.x , y.y , y.z ,
    z.x , z.y , z.z
  );
  
  // Modify position for snowflake shape in blizzard mode
  vec3 modifiedPos = position;
  float isBlizzard = step(3.5, colorMode);
  
  if (isBlizzard > 0.5) {
    // Create 6-pointed snowflake pattern
    // Use the vertex position to determine which arm it belongs to
    float armIndex = floor(mod(position.y * 100.0 + 3.0, 6.0));
    float armAngle = armIndex * 1.0472; // 60 degrees = PI/3
    
    // Calculate distance from center for this vertex
    float dist = length(position.xz);
    float vertY = position.y;
    
    // Create snowflake arm structure
    float cosA = cos(armAngle);
    float sinA = sin(armAngle);
    
    // Main arm extends outward
    float armLength = 2.0;
    float armWidth = 0.15;
    
    // Transform to create 6-fold symmetry
    // Each vertex gets rotated to its arm position
    vec3 snowflakePos;
    
    // Use original Y as the extension along the arm
    float extension = vertY * armLength;
    
    // Use original X as width perpendicular to arm
    float width = position.x * armWidth;
    
    // Create the arm in local space then rotate
    vec3 armLocal = vec3(width, 0.0, extension);
    
    // Rotate around Y axis to create 6 arms
    snowflakePos.x = armLocal.x * cosA - armLocal.z * sinA;
    snowflakePos.z = armLocal.x * sinA + armLocal.z * cosA;
    snowflakePos.y = position.z * 0.1; // Flatten significantly
    
    // Add small branches on each arm
    float branchPhase = mod(vertY * 8.0, 1.0);
    float branchOffset = sin(branchPhase * 6.28318) * 0.3 * step(0.3, abs(vertY));
    snowflakePos.x += branchOffset * cosA * 0.5;
    snowflakePos.z += branchOffset * sinA * 0.5;
    
    // Add slight variation per snowflake
    float variation = sin(lookup.x * 50.0 + lookup.y * 37.0);
    snowflakePos *= 0.8 + variation * 0.2;
    
    // Rotate the whole snowflake based on lookup for variety
    float snowAngle = lookup.x * 6.28318 + lookup.y * 3.14159;
    float cS = cos(snowAngle);
    float sS = sin(snowAngle);
    vec3 rotatedSnow;
    rotatedSnow.x = snowflakePos.x * cS - snowflakePos.z * sS;
    rotatedSnow.z = snowflakePos.x * sS + snowflakePos.z * cS;
    rotatedSnow.y = snowflakePos.y;
    
    modifiedPos = rotatedSnow;
  }

  vNorm = rot * normal;

  vec3 pos = iPos + rot * modifiedPos;

  gl_Position = projectionMatrix * modelViewMatrix * vec4( pos , 1. );

}
