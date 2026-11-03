// Shaders du globe. Les couleurs sont écrites telles quelles (sRGB), comme le reste de la page.

/** Atténuation près du bord du disque, partagée par les points et les frontières */
const FACING = /* glsl */ `
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float facing = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
`

export const BODY_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalMatrix * normal;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

/** Sphère sombre, éclairée par le haut à gauche, liseré froid sur le contour */
export const BODY_FRAGMENT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    float rim = 1.0 - max(dot(n, normalize(vView)), 0.0);
    float light = max(dot(n, normalize(vec3(-0.5, 0.65, 0.75))), 0.0);
    vec3 color = mix(vec3(0.018, 0.026, 0.07), vec3(0.06, 0.066, 0.2), light);
    color += vec3(0.32, 0.3, 0.92) * pow(rim, 3.6) * 0.42;
    gl_FragColor = vec4(color, 1.0);
  }
`

/** Halo extérieur : face arrière d'une sphère un peu plus grande, s'éteint vers l'extérieur */
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform float uInner;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float d = -dot(normalize(vNormal), normalize(vView));
    float a = smoothstep(0.0, uInner, d);
    gl_FragColor = vec4(0.42, 0.42, 1.0, a * a * a * 0.3);
  }
`

export const DOTS_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPointSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    ${FACING}
    float twinkle = 0.84 + 0.16 * sin(uTime * 1.3 + aSeed * 40.0);
    vColor = aColor;
    vAlpha = smoothstep(0.0, 0.42, facing) * twinkle;
    gl_PointSize = uPointSize * (0.72 + 0.28 * facing);
    gl_Position = projectionMatrix * mv;
  }
`

export const DOTS_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.3, d) * vAlpha * 0.9;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`

export const LINE_VERTEX = /* glsl */ `
  varying float vAlpha;
  void main() {
    ${FACING}
    vAlpha = smoothstep(0.02, 0.5, facing);
    gl_Position = projectionMatrix * mv;
  }
`

export const LINE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * vAlpha);
  }
`

export const HUBS_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  uniform float uPixelScale;
  varying vec3 vColor;
  varying float vPhase;
  varying float vAlpha;
  void main() {
    ${FACING}
    vColor = aColor;
    vPhase = aPhase;
    vAlpha = smoothstep(0.08, 0.34, facing);
    gl_PointSize = aSize * uPixelScale;
    gl_Position = projectionMatrix * mv;
  }
`

/** Point lumineux et onde qui s'élargit lentement */
export const HUBS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec3 vColor;
  varying float vPhase;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float t = fract(uTime * 0.28 + vPhase);
    float ring = smoothstep(0.07, 0.0, abs(d - (0.26 + t * 0.7))) * (1.0 - t) * 0.7;
    float core = smoothstep(0.26, 0.16, d);
    float a = max(core, ring) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.45), a);
  }
`

export const ARC_VERTEX = /* glsl */ `
  varying float vT;
  void main() {
    vT = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** Trait discret et impulsion lumineuse qui part de la Côte d'Ivoire */
export const ARC_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  varying float vT;
  void main() {
    float head = fract(uTime * 0.11 + uPhase) * 1.5;
    float behind = head - vT;
    float pulse = behind < 0.0 ? 0.0 : smoothstep(0.34, 0.0, behind);
    float ends = smoothstep(0.0, 0.05, vT) * smoothstep(1.0, 0.95, vT);
    gl_FragColor = vec4(mix(uFrom, uTo, vT), (0.13 + pulse * 0.85) * ends);
  }
`
