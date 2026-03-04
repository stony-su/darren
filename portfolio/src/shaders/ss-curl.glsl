uniform sampler2D t_oPos;
uniform sampler2D t_pos;

uniform float dT;
uniform float noiseSize;
uniform float exclusionRadius;
uniform vec3  mousePos;
uniform float mouseForce;
uniform vec2  resolution;

varying vec2 vUv;

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

  vec3 curl = curlNoise( pos.xyz * noiseSize );
  vel += curl * .0001 * timeScale;

  // Center exclusion zone — particles physically repelled from origin
  vec3 toCenter = pos.xyz;
  float dist = length(toCenter);
  if (dist > 0.001) {
    float repel = smoothstep(exclusionRadius, 0.0, dist);
    vel += normalize(toCenter) * repel * 0.0007 * timeScale;
  }

  // Mouse attraction
  if (mouseForce != 0.0) {
    vec3 toMouse = mousePos - pos.xyz;
    float mDist = length(toMouse);
    float influence = 1.0 / (1.0 + mDist * mDist * 8.0);
    vec3 mouseDir = normalize(toMouse);
    vel += mouseDir * mouseForce * influence * 0.0045 * timeScale;
  }

  vel *= pow(.97, timeScale); // dampening

  vec3 p = pos.xyz + vel;

  gl_FragColor = vec4( p , 1. );
}
