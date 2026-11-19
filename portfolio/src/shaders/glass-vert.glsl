/* Liquid glass shard — vertex stage.
 *
 * Mostly a pass-through: the interesting work is per-fragment. Two jobs
 * happen here.
 *
 * The melt: a slow swell along the surface normal that only switches on once
 * the pane has broken. At rest it is exactly zero, so the shards still tile
 * the picture seamlessly; on the way out the faces bulge and settle like
 * something with surface tension.
 *
 * And the frames the fragment stage needs. `vNrmLocal` lets the refraction be
 * traced through the slab in the shard's OWN space, where the front and back
 * surfaces are known planes; `vAxisX`/`vAxisY` carry the shard's axes into
 * world space so a shard-local surface wobble perturbs the surface it is
 * meant to perturb even after the piece has tumbled. */

attribute vec2 uvHero;
attribute vec2 uvPage;
attribute float aEdge;

uniform sampler2D uNoise;
uniform float uTime;
uniform float uMelt;      // 0 assembled, 1 fully broken out
uniform float uMeltScale; // px per unit of noise, set from the shard's size

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUvHero;
varying vec2 vUvPage;
varying float vEdge;
varying vec3 vLocal;
varying float vSwell;
varying vec3 vNrmLocal;
varying vec3 vAxisX;
varying vec3 vAxisY;

void main() {
  vec3 p = position;

  // Two channels of the baked field, scrolled against each other, so the
  // swell never reads as a single pulsing rhythm.
  vec2 nuv = p.xy * 0.0019;
  vec3 n = texture2D(uNoise, nuv + vec2(uTime * 0.010, uTime * 0.007)).rgb;
  float swell = (n.r + n.g - 1.0) * uMelt;

  // The rim stays put while the broad faces move: glass is stiffest where
  // it is thickest, and a wandering silhouette would break the fracture.
  p += normal * swell * uMeltScale * (1.0 - aEdge * 0.75);

  vSwell = swell;
  vLocal = p;
  vUvHero = uvHero;
  vUvPage = uvPage;
  vEdge = aEdge;
  vNrmLocal = normal;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  // Rotation plus a uniform scale only, so the model matrix is safe to use
  // directly on the normal, and one inverse square root of a column length
  // normalises both axes.
  mat3 M = mat3(modelMatrix);
  vNormal = normalize(M * normal);
  float invS = inversesqrt(max(dot(M[0], M[0]), 1e-6));
  vAxisX = M[0] * invS;
  vAxisY = M[1] * invS;

  gl_Position = projectionMatrix * viewMatrix * world;
}
