/** Shader que mistura as texturas de terreno usando as máscaras RGBA do chunk. */
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

const CH = ['r', 'g', 'b', 'a'];

/**
 * Fragment shader com `slots` terrenos por chunk: uma máscara RGBA a cada 4
 * slots (uMask1, uMask2...) e uma textura por slot (uTex1, uTex2...).
 * uWater1/uWater2 marcam (com 1.0) o canal da água, que fica mais clara na margem.
 */
export function terrainFragment(slots: number): string {
  const layers = Math.ceil(slots / 4);
  const ids = Array.from({ length: slots }, (_, i) => i);
  const L = Array.from({ length: layers }, (_, l) => l + 1);
  const ch = (i: number) => `w${(i >> 2) + 1}.${CH[i & 3]}`;
  return /* glsl */ `
precision highp float;
in vec2 vUV;
in vec2 vWorld;
out vec4 finalColor;

${L.map((l) => `uniform sampler2D uMask${l};`).join('\n')}
${ids.map((i) => `uniform sampler2D uTex${i + 1};`).join('\n')}
uniform float uTexScale;
uniform float uCell;
${L.map((l) => `uniform vec4 uWater${l};`).join('\n')}

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
${L.map((l) => `  vec4 m${l} = texture(uMask${l}, vUV);`).join('\n')}
  float msum = ${L.map((l) => `dot(m${l}, vec4(1.0))`).join(' + ')};
  if (msum < 0.01) { finalColor = vec4(0.0); return; }
  // Ruído em coordenadas do mundo deixa a borda entre terrenos irregular e natural.
  vec2 q = vWorld / uCell;
  float n = vnoise(q * 1.7) * 0.65 + vnoise(q * 4.3) * 0.35 - 0.5;
  vec4 n4 = vec4(n, -n, n * 0.8, -n * 0.8);
  // Pesos sempre positivos onde há terreno e normalizados: sem buracos na transição.
${L.map((l) => `  vec4 w${l} = pow(clamp(m${l} + n4 * 0.35 * step(0.01, m${l}), 0.0001, 1.0), vec4(5.0)) * step(0.001, m${l});`).join('\n')}
  float wsum = max(${ids.map(ch).join(' + ')}, 1e-6);
${L.map((l) => `  w${l} /= wsum;`).join('\n')}
  vec2 tuv = vWorld / uTexScale;
  vec3 col = ${ids.map((i) => `texture(uTex${i + 1}, tuv).rgb * ${ch(i)}`).join(' +\n             ')};
  // Leve sombra de contato onde dois terrenos se encontram.
  float dominance = ${ids.slice(1).reduce((acc, i) => `max(${acc}, ${ch(i)})`, ch(0))};
  col *= mix(0.84, 1.0, smoothstep(0.5, 0.9, dominance));
  // Água mais clara (rasa) perto da margem.
  float wWater = ${L.map((l) => `dot(w${l}, uWater${l})`).join(' + ')};
  float mWater = ${L.map((l) => `dot(m${l}, uWater${l})`).join(' + ')};
  col = mix(col, col * vec3(1.15, 1.2, 1.1), wWater * (1.0 - smoothstep(0.6, 1.0, mWater)) * 0.7);
  // Borda com o vazio: some aos poucos, também irregular.
  float alpha = smoothstep(0.3, 0.7, msum + n * 0.3);
  finalColor = vec4(col * alpha, alpha);
}
`;
}
