// src/components/home/elasticBubble.ts
// Grande bulle élastique de l'accueil, en WebGL natif (aucune bibliothèque 3D à télécharger).
//
// Reprise de l'ancien Hero (version antérieure à a5c5a69) :
//   <Sphere args={[1, 100, 200]} scale={2}> + <MeshDistortMaterial distort={0.5} speed={2}>
//   caméra par défaut de @react-three/fiber (fov 75°, z = 5), OrbitControls autoRotateSpeed 0.5.
// Même bruit simplex et même déformation que drei (helpers/glsl/distort.vert.glsl) :
//   transformed = position * (snoise(position / 2 + time / 50 * 5) * distort² + radius)
// Ajouts : enveloppe lente de l'amplitude (étirements marqués puis retours progressifs à une forme
// arrondie), légère respiration, normale réelle de la surface déformée, rendu « verre fumé ».
//
// La photo est échantillonnée en coordonnées d'ÉCRAN autour du centre de la bulle, avec un seul
// facteur d'échelle, jamais par les coordonnées de texture de la sphère : le contour se déforme,
// les proportions du visage jamais.

/** Paramètres de l'ancien Hero */
export const LEGACY = {
  scale: 2,
  radius: 1,
  distort: 0.5,
  speed: 2,
  segments: [100, 200] as [number, number],
  fovDeg: 75,
  cameraZ: 5,
  /** OrbitControls : 2π / 60 × autoRotateSpeed (0.5) rad/s, un tour en 120 s */
  autoRotate: (2 * Math.PI / 60) * 0.5,
}

/**
 * Diamètre de base de la bulle rapporté à la hauteur du canevas (silhouette d'une sphère de rayon
 * 2 vue à 5 unités sous 75°). Le CSS dimensionne le canevas avec : diamètre / BASE_RATIO.
 */
export const BASE_RATIO = Math.tan(Math.asin((LEGACY.scale * LEGACY.radius) / LEGACY.cameraZ)) / Math.tan((LEGACY.fovDeg * Math.PI) / 360)

/** Amplitude relative (0,58 → 1) : courbe lente et irrégulière, jamais saccadée */
export function envelope(t: number): number {
  const a = 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / 13)
  const b = 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / 21 + 1.3)
  return 0.58 + 0.42 * (0.65 * a + 0.35 * b)
}

/** Respiration de la silhouette (contractions douces, ±2,2 %) */
export const breathing = (t: number) => 1 + 0.022 * Math.sin((t * 2 * Math.PI) / 6.5)

export interface BubbleOptions {
  photoUrl: string
  /** Point de la photo placé au centre de la bulle (0–1, origine en haut à gauche) */
  focus: { x: number; y: number }
  /** Part de la largeur de la photo couverte par le diamètre de base */
  zoom: number
  segments?: [number, number]
  maxDpr?: number
  /** Animation fluide vérifiée (première série d'images) : l'appelant peut l'afficher */
  onReady?: () => void
  /** WebGL perdu, photo illisible ou appareil trop lent : animation arrêtée, repli CSS */
  onFail?: (reason: string) => void
}

export interface BubbleController {
  destroy(): void
}

// Bruit simplex 3D (Ashima Arts, MIT) : copie conforme de drei/helpers/glsl/distort.vert.glsl
const SNOISE = 'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}'

const VERTEX = `
attribute vec3 aPosition;
uniform mat4 uProjection;
uniform mat4 uModelView;
uniform float uTime;
uniform float uDistort;
varying vec3 vNormal;
varying vec3 vView;
${SNOISE}
vec3 displace(vec3 p) {
  float updateTime = uTime / 50.0;
  float noise = snoise(vec3(p / 2.0 + updateTime * 5.0));
  return p * (noise * pow(uDistort, 2.0) + 1.0);
}
void main() {
  vec3 n = normalize(aPosition);
  vec3 helper = abs(n.y) < 0.98 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(helper, n));
  vec3 b = cross(n, t);
  vec3 p = displace(aPosition);
  vec3 normal = normalize(cross(displace(normalize(aPosition + t * 0.02)) - p, displace(normalize(aPosition + b * 0.02)) - p));
  if (dot(normal, n) < 0.0) normal = -normal;
  vec4 view = uModelView * vec4(p, 1.0);
  vView = view.xyz;
  vNormal = (uModelView * vec4(normal, 0.0)).xyz;
  gl_Position = uProjection * view;
}`

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uPhoto;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec2 uFocus;
uniform float uZoom;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  // Coordonnées d'écran autour du centre : un seul facteur d'échelle, aucune déformation
  vec2 d = (gl_FragCoord.xy - uCenter) / (2.0 * uRadius);
  vec2 uv = uFocus + d * uZoom;
  vec3 photo = texture2D(uPhoto, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
  vec2 edge = smoothstep(vec2(0.0), vec2(0.06), uv) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - uv);
  float r = length(d) * 2.0;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vView);
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);

  // Verre fumé bleu nuit → violet : léger au centre (visage lisible), dense vers les bords
  vec3 smoke = mix(vec3(0.02, 0.03, 0.09), vec3(0.12, 0.06, 0.25), clamp(0.55 + d.y * 0.9 - d.x * 0.3, 0.0, 1.0));
  float density = mix(0.2, 0.86, smoothstep(0.25, 1.0, r));
  // Teinte bleutée déjà appliquée à la photo (adjoumani-glass-*) : aucun calque de fusion
  vec3 col = mix(photo, smoke, max(density, 1.0 - edge.x * edge.y));
  // Reflet courbe discret en haut à gauche (verre), loin du visage
  float arc = smoothstep(0.035, 0.0, abs(length(d - vec2(0.1, -0.1)) - 0.46)) * smoothstep(0.05, -0.35, d.x - d.y);
  col += vec3(0.75, 0.78, 1.0) * arc * 0.10;
  // Liseré lumineux subtil (indigo en haut, rose en bas) et reflet rasant de la lumière principale,
  // sur la couronne extérieure seulement : aucun reflet mouvant sur le visage
  float ring = smoothstep(0.42, 0.78, r);
  col += mix(vec3(0.48, 0.52, 1.0), vec3(0.9, 0.35, 0.7), clamp(0.5 - N.y * 0.6, 0.0, 1.0)) * fresnel * 0.7 * ring;
  float nh = max(dot(N, normalize(normalize(vec3(0.7, 0.8, 0.25)) + V)), 0.0);
  col += vec3(pow(nh, 220.0) * 0.32 + pow(nh, 18.0) * 0.035) * ring;
  float alpha = mix(0.88, 1.0, fresnel * ring);
  gl_FragColor = vec4(col * alpha, alpha);
}`

// ── Géométrie : sphère UV identique à THREE.SphereGeometry ─────
export function sphereGeometry(widthSegments: number, heightSegments: number) {
  const positions = new Float32Array((widthSegments + 1) * (heightSegments + 1) * 3)
  let k = 0
  for (let iy = 0; iy <= heightSegments; iy++) {
    const v = iy / heightSegments
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments
      positions[k++] = -Math.cos(u * 2 * Math.PI) * Math.sin(v * Math.PI)
      positions[k++] = Math.cos(v * Math.PI)
      positions[k++] = Math.sin(u * 2 * Math.PI) * Math.sin(v * Math.PI)
    }
  }
  const indices: number[] = []
  const row = widthSegments + 1
  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = iy * row + ix + 1, b = iy * row + ix, c = (iy + 1) * row + ix, d = (iy + 1) * row + ix + 1
      if (iy !== 0) indices.push(a, b, d)
      if (iy !== heightSegments - 1) indices.push(b, c, d)
    }
  }
  return { positions, indices: new Uint16Array(indices) }
}

// ── Matrices (colonne majeure, comme WebGL) ───────────────────
function perspective(fovDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360)
  const nf = 1 / (near - far)
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0])
}

/** Vue (caméra en z = cameraZ) × rotation Y × échelle */
function modelView(angle: number, scale: number, cameraZ: number): Float32Array {
  const c = Math.cos(angle) * scale, s = Math.sin(angle) * scale
  return new Float32Array([c, 0, -s, 0, 0, scale, 0, 0, s, 0, c, 0, 0, 0, -cameraZ, 1])
}

function shader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error('shader')
  gl.shaderSource(s, source)
  gl.compileShader(s) // état lu après la liaison : aucune attente ici
  return s
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

/**
 * Démarre la bulle dans le canevas ; null si le WebGL est indisponible (repli CSS par l'appelant).
 * Mise en place étalée sur plusieurs images (compilation des shaders sans attente quand le
 * navigateur le permet, maillage, photo décodée hors du fil principal) : aucune tâche longue.
 * L'animation s'arrête hors écran et dans un onglet masqué.
 */
export async function startElasticBubble(canvas: HTMLCanvasElement, options: BubbleOptions): Promise<BubbleController | null> {
  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: true, depth: true,
    powerPreference: 'low-power', failIfMajorPerformanceCaveat: true,
  })
  if (!gl) return null

  const program = gl.createProgram()
  if (!program) return null
  const vs = shader(gl, gl.VERTEX_SHADER, VERTEX)
  const fs = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  // Compilation par le GPU en parallèle : le fil principal reste libre pendant ce temps
  const parallel = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null
  if (parallel) {
    while (!gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) {
      await nextFrame()
      if (gl.isContextLost()) return null
    }
  }
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (!gl.isContextLost()) options.onFail?.(`shaders : ${gl.getShaderInfoLog(vs) || gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(program) || 'liaison'}`)
    return null
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  gl.useProgram(program)
  await nextFrame() // maillage dans une autre tâche

  const vbo = gl.createBuffer()
  const ibo = gl.createBuffer()
  let indexCount = 0
  /** (Re)charge le maillage : segments de l'ancien Hero, réduits sur petit écran ou appareil lent */
  const upload = ([ws, hs]: [number, number]) => {
    const { positions, indices } = sphereGeometry(ws, hs)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
    indexCount = indices.length
  }
  upload(options.segments ?? LEGACY.segments)
  const aPosition = gl.getAttribLocation(program, 'aPosition')
  gl.enableVertexAttribArray(aPosition)
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0)

  const u = (name: string) => gl.getUniformLocation(program, name)
  const uProjection = u('uProjection'), uModelView = u('uModelView'), uTime = u('uTime'), uDistort = u('uDistort')
  const uCenter = u('uCenter'), uRadius = u('uRadius')
  gl.uniform1i(u('uPhoto'), 0)
  gl.uniform2f(u('uFocus'), options.focus.x, 1 - options.focus.y)
  gl.uniform1f(u('uZoom'), options.zoom)
  gl.enable(gl.DEPTH_TEST)
  gl.enable(gl.CULL_FACE)
  gl.clearColor(0, 0, 0, 0)

  let destroyed = false
  let textureReady = false
  let frame = 0
  let visible = true
  let elapsed = 0
  let last = 0
  let frames = 0
  let maxDpr = options.maxDpr ?? 1.75
  // Qualité adaptative : intervalle médian entre images, mesuré par séries après le démarrage
  let quality: 'pleine' | 'réduite' = 'pleine'
  let intervals: number[] = []
  let windowStart = 0
  let firstFrameAt = 0
  let revealed = false
  canvas.dataset.quality = quality

  const texture = gl.createTexture()
  const photo = new Image()
  photo.decoding = 'async'
  photo.src = options.photoUrl
  // Décodage hors du fil principal, puis envoi au GPU dans une image suivante
  photo.decode().then(nextFrame).then(() => {
    if (destroyed) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, photo)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    textureReady = true
    schedule()
  }).catch(() => fail('photo'))

  const resize = () => {
    if (destroyed) return
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    gl.viewport(0, 0, w, h)
    gl.uniformMatrix4fv(uProjection, false, perspective(LEGACY.fovDeg, w / h, 0.1, 100))
    gl.uniform2f(uCenter, w / 2, h / 2)
    gl.uniform1f(uRadius, (BASE_RATIO * h) / 2)
  }

  /** Appareil trop lent : maillage et résolution réduits, puis abandon au profit de la version CSS */
  const adapt = (now: number, interval: number) => {
    if (now - firstFrameAt < 600) return // démarrage : la page charge encore
    if (!windowStart) windowStart = now
    intervals.push(interval)
    // Série de 45 images, ou 1,5 s si l'appareil est si lent qu'il en affiche peu
    if (intervals.length < 45 && !(now - windowStart > 1500 && intervals.length >= 8)) return
    const median = [...intervals].sort((a, b) => a - b)[intervals.length >> 1]
    intervals = []
    windowStart = 0
    if (quality === 'pleine' && median > 28) {
      quality = 'réduite'
      canvas.dataset.quality = quality
      maxDpr = 1
      upload([56, 112])
      resize()
    } else if (quality === 'réduite' && median > 40) {
      fail('lent')
    } else if (!revealed) {
      // Affichée seulement une fois sa fluidité vérifiée : jamais d'apparition suivie d'un retrait
      revealed = true
      options.onReady?.()
    }
  }

  const draw = (now: number) => {
    frame = 0
    if (destroyed || !visible || !textureReady) return
    // Pas de rattrapage après une pause : l'animation reprend là où elle s'était arrêtée
    if (!firstFrameAt) firstFrameAt = now
    if (last) adapt(now, now - last)
    elapsed += Math.min(0.05, last ? (now - last) / 1000 : 0)
    last = now
    gl.uniform1f(uTime, elapsed * LEGACY.speed)
    gl.uniform1f(uDistort, LEGACY.distort * envelope(elapsed))
    gl.uniformMatrix4fv(uModelView, false, modelView(elapsed * LEGACY.autoRotate, LEGACY.scale * breathing(elapsed), LEGACY.cameraZ))
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0)
    frames += 1
    canvas.dataset.frames = String(frames)
    schedule()
  }
  function schedule() {
    if (!frame && !destroyed && visible && textureReady) frame = requestAnimationFrame(draw)
  }
  const setVisible = (value: boolean) => {
    visible = value && document.visibilityState === 'visible'
    canvas.dataset.state = visible ? 'running' : 'paused'
    if (!visible) {
      cancelAnimationFrame(frame)
      frame = 0
      last = 0
      intervals = []
      windowStart = 0
    }
    schedule()
  }

  resize()
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  let inView = true
  const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; setVisible(inView) })
  intersection.observe(canvas)
  const onVisibility = () => setVisible(inView)
  document.addEventListener('visibilitychange', onVisibility)
  const onLost = (e: Event) => {
    e.preventDefault()
    fail('contexte perdu')
  }
  canvas.addEventListener('webglcontextlost', onLost)

  const destroy = () => {
    if (destroyed) return
    destroyed = true
    cancelAnimationFrame(frame)
    resizeObserver.disconnect()
    intersection.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.dataset.state = 'stopped'
    if (gl.isContextLost()) return
    gl.deleteBuffer(vbo)
    gl.deleteBuffer(ibo)
    gl.deleteTexture(texture)
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  function fail(reason: string) {
    if (destroyed) return
    destroy()
    options.onFail?.(reason)
  }

  return { destroy }
}
