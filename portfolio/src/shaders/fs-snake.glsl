varying vec3 vNorm;
varying vec2 vLookup;
varying float vSpeed;
varying float vViewZ;

uniform vec3 uPaletteA[5];
uniform vec3 uPaletteB[5];
uniform float uBlend;      // eased 0..1, palette A -> palette B
uniform float uNormalA;    // 1.0 when side A is the normals-colored theme
uniform float uNormalB;
uniform vec4 uFxA;         // (glow, sparkle, tScaleX, tScaleY)
uniform vec4 uFxB;

uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uSpeedGlow;

vec3 gradientColor(vec3 p0, vec3 p1, vec3 p2, vec3 p3, vec3 p4, vec4 fx, float normalFlag) {
  float t = fract(vLookup.x * fx.z + vLookup.y * fx.w);

  vec3 col = mix(p0, p1, smoothstep(0.0, 0.25, t));
  col = mix(col, p2, smoothstep(0.25, 0.5, t));
  col = mix(col, p3, smoothstep(0.5, 0.75, t));
  col = mix(col, p4, smoothstep(0.75, 1.0, t));

  col += fx.x * (0.15 + 0.1 * sin(vLookup.x * 20.0 + vLookup.y * 15.0));
  col += fx.y * (0.1 + 0.15 * sin(vLookup.x * 30.0) * sin(vLookup.y * 25.0));

  return mix(clamp(col, 0.0, 1.0), vNorm * 0.5 + 0.5, normalFlag);
}

void main() {
  vec3 colA = gradientColor(uPaletteA[0], uPaletteA[1], uPaletteA[2], uPaletteA[3], uPaletteA[4], uFxA, uNormalA);
  vec3 colB = gradientColor(uPaletteB[0], uPaletteB[1], uPaletteB[2], uPaletteB[3], uPaletteB[4], uFxB, uNormalB);
  vec3 col = mix(colA, colB, uBlend);

  // Velocity glow: fast particles brighten
  col *= 1.0 + clamp(vSpeed * uSpeedGlow, 0.0, 0.45);

  // Depth fade: dissolve distant particles into the background
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vViewZ));

#ifdef USE_LINEAR_OUT
  // Colors are authored in sRGB; when the post pipeline (OutputPass) is active
  // it converts linear->sRGB at the end, so pre-convert here to preserve the look.
  col = pow(col, vec3(2.2));
#endif

  gl_FragColor = vec4(col, 1.0);
}
