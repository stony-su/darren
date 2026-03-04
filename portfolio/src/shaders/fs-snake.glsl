varying vec3 vNorm;
varying vec2 vLookup;

uniform float colorMode;

vec3 getNormalColor() {
  return vNorm * 0.5 + 0.5;
}

vec3 getChinatownNeonColor() {
  vec3 hotPink = vec3(1.0, 0.1, 0.5);
  vec3 neonRed = vec3(1.0, 0.05, 0.15);
  vec3 neonOrange = vec3(1.0, 0.4, 0.1);
  vec3 neonCyan = vec3(0.1, 0.9, 0.95);
  vec3 neonMagenta = vec3(0.95, 0.1, 0.8);

  float t = fract(vLookup.x * 5.0 + vLookup.y * 3.0);

  vec3 col = mix(hotPink, neonRed, smoothstep(0.0, 0.25, t));
  col = mix(col, neonOrange, smoothstep(0.25, 0.5, t));
  col = mix(col, neonMagenta, smoothstep(0.5, 0.75, t));
  col = mix(col, neonCyan, smoothstep(0.75, 1.0, t));

  float glow = 0.15 + 0.1 * sin(vLookup.x * 20.0 + vLookup.y * 15.0);
  col = clamp(col + glow, 0.0, 1.0);
  return pow(col, vec3(0.85));
}

vec3 getMatchaPeaceColor() {
  vec3 matchaGreen = vec3(0.53, 0.71, 0.44);
  vec3 softSage = vec3(0.6, 0.7, 0.55);
  vec3 cream = vec3(0.96, 0.94, 0.88);
  vec3 moss = vec3(0.42, 0.55, 0.35);
  vec3 bamboo = vec3(0.76, 0.78, 0.55);

  float t = fract(vLookup.x * 4.0 + vLookup.y * 2.5);

  vec3 col = mix(matchaGreen, softSage, smoothstep(0.0, 0.25, t));
  col = mix(col, cream, smoothstep(0.25, 0.5, t));
  col = mix(col, bamboo, smoothstep(0.5, 0.75, t));
  col = mix(col, moss, smoothstep(0.75, 1.0, t));

  float softGlow = 0.05 + 0.03 * sin(vLookup.x * 8.0 + vLookup.y * 6.0);
  col = col + softGlow;
  return clamp(col, 0.0, 1.0);
}

vec3 getOceanBeachColor() {
  vec3 deepNavy = vec3(0.1, 0.15, 0.35);
  vec3 oceanBlue = vec3(0.2, 0.45, 0.65);
  vec3 seafoam = vec3(0.5, 0.78, 0.8);
  vec3 sandBeige = vec3(0.87, 0.8, 0.65);
  vec3 coralAccent = vec3(0.9, 0.55, 0.5);

  float t = fract(vLookup.x * 3.5 + vLookup.y * 2.0);

  vec3 col = mix(deepNavy, oceanBlue, smoothstep(0.0, 0.2, t));
  col = mix(col, seafoam, smoothstep(0.2, 0.45, t));
  col = mix(col, sandBeige, smoothstep(0.45, 0.7, t));
  col = mix(col, coralAccent, smoothstep(0.7, 0.85, t));
  col = mix(col, deepNavy, smoothstep(0.85, 1.0, t));

  float shimmer = 0.08 + 0.05 * sin(vLookup.x * 15.0 + vLookup.y * 10.0);
  col = col + shimmer * vec3(0.7, 0.85, 1.0);
  return clamp(col, 0.0, 1.0);
}

vec3 getBlizzardSnowflakeColor() {
  vec3 pureWhite = vec3(1.0, 1.0, 1.0);
  vec3 iceBlue = vec3(0.85, 0.95, 1.0);
  vec3 frostWhite = vec3(0.95, 0.98, 1.0);
  vec3 silverIce = vec3(0.9, 0.92, 0.95);
  vec3 crystalBlue = vec3(0.8, 0.9, 1.0);

  float t = fract(vLookup.x * 6.0 + vLookup.y * 4.0);

  vec3 col = mix(pureWhite, iceBlue, smoothstep(0.0, 0.25, t));
  col = mix(col, frostWhite, smoothstep(0.25, 0.5, t));
  col = mix(col, crystalBlue, smoothstep(0.5, 0.75, t));
  col = mix(col, silverIce, smoothstep(0.75, 1.0, t));

  float sparkle = 0.1 + 0.15 * sin(vLookup.x * 30.0) * sin(vLookup.y * 25.0);
  col = col + sparkle * vec3(1.0, 1.0, 1.0);

  float glow = 0.05 + 0.03 * sin(vLookup.x * 12.0 + vLookup.y * 8.0);
  col = col + glow;

  return clamp(col, 0.0, 1.0);
}

void main() {
  float isNormal = step(colorMode, 0.5);
  float isNeon = step(0.5, colorMode) * step(colorMode, 1.5);
  float isMatcha = step(1.5, colorMode) * step(colorMode, 2.5);
  float isBeach = step(2.5, colorMode) * step(colorMode, 3.5);
  float isBlizzard = step(3.5, colorMode);

  vec3 col = getNormalColor() * isNormal +
             getChinatownNeonColor() * isNeon +
             getMatchaPeaceColor() * isMatcha +
             getOceanBeachColor() * isBeach +
             getBlizzardSnowflakeColor() * isBlizzard;

  gl_FragColor = vec4(col, 1.0);
}
