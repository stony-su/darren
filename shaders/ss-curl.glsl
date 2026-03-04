uniform sampler2D t_oPos;
uniform sampler2D t_pos;

uniform float dT;
uniform float noiseSize;
uniform float audioLevel;
uniform vec3  mousePos;
uniform float mouseForce;
uniform vec2  resolution;

varying vec2 vUv;

$simplex
$curl


float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}


void main(){

  vec2 uv = gl_FragCoord.xy / resolution;
  vec4 oPos = texture2D( t_oPos , uv );
  vec4 pos  = texture2D( t_pos , uv );

  vec3 vel = pos.xyz - oPos.xyz;

  // Time-based speed multiplier (dT includes speed setting)
  float timeScale = dT * 60.0; // Normalize to ~60fps baseline
  
  // Audio reactive curl intensity - particles move faster with audio
  float audioBoost = 1.0 + audioLevel * 2.5;
  float dynamicNoiseSize = noiseSize * (1.0 + audioLevel * 0.5);
  
  vec3 curl = curlNoise( pos.xyz * dynamicNoiseSize );

  vel += curl * .0001 * audioBoost * timeScale;
  
  // Mouse attraction/repulsion
  if (mouseForce != 0.0) {
    vec3 toMouse = mousePos - pos.xyz;
    float dist = length(toMouse);
    float influence = 1.0 / (1.0 + dist * dist * 8.0); // Falloff with distance
    vec3 mouseDir = normalize(toMouse);
    
    // Apply force: positive = attract, negative = repel
    vel += mouseDir * mouseForce * influence * 0.002 * timeScale;
  }
  
  vel *= pow(.97 - audioLevel * 0.02, timeScale); // dampening varies with audio and speed

  vec3 p = pos.xyz + vel;


  gl_FragColor = vec4( p , 1. );


}
