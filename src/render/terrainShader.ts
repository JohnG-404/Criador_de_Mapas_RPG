/** Shader que mistura as texturas de terreno usando a máscara RGBA do chunk. */
export const TERRAIN_VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec2 vWorld;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vWorld = aPosition;
}
`;

export const TERRAIN_FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vUV;
in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uMask;
uniform sampler2D uTex1;
uniform sampler2D uTex2;
uniform sampler2D uTex3;
uniform sampler2D uTex4;
uniform float uTexScale;
uniform float uCell;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec4 m = texture(uMask, vUV);
  float msum = m.r + m.g + m.b + m.a;
  if (msum < 0.01) { finalColor = vec4(0.0); return; }
  // Ruído em coordenadas do mundo deixa a borda entre terrenos irregular e natural.
  vec2 q = vWorld / uCell;
  float n = vnoise(q * 1.7) * 0.65 + vnoise(q * 4.3) * 0.35 - 0.5;
  vec4 n4 = vec4(n, -n, n * 0.8, -n * 0.8);
  // Pesos sempre positivos onde há terreno e normalizados: sem buracos na transição.
  vec4 w = pow(clamp(m + n4 * 0.35 * step(0.01, m), 0.0001, 1.0), vec4(5.0));
  w /= (w.r + w.g + w.b + w.a);
  vec2 tuv = vWorld / uTexScale;
  vec3 col = texture(uTex1, tuv).rgb * w.r + texture(uTex2, tuv).rgb * w.g +
             texture(uTex3, tuv).rgb * w.b + texture(uTex4, tuv).rgb * w.a;
  // Leve sombra de contato onde dois terrenos se encontram.
  float dominance = max(max(w.r, w.g), max(w.b, w.a));
  col *= mix(0.84, 1.0, smoothstep(0.5, 0.9, dominance));
  // Água mais clara (rasa) perto da margem.
  col = mix(col, col * vec3(1.15, 1.2, 1.1), w.b * (1.0 - smoothstep(0.6, 1.0, m.b)) * 0.7);
  // Borda com o vazio: some aos poucos, também irregular.
  float alpha = smoothstep(0.3, 0.7, msum + n * 0.3);
  finalColor = vec4(col * alpha, alpha);
}
`;
