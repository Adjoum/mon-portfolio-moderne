// P7.1 — Bulle élastique du Hero : paramètres de l'ancien Hero, géométrie, cadrage de la photo.
// Le rendu réel (déformation, visage stable, pause hors écran) est vérifié dans le navigateur :
// tests/e2e/premium/accueil.mjs.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { BASE_RATIO, LEGACY, breathing, envelope, sphereGeometry } from './elasticBubble'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('reprise de l’ancien Hero (avant a5c5a69)', () => {
  it('mêmes paramètres que <Sphere args={[1, 100, 200]} scale={2}> + <MeshDistortMaterial distort={0.5} speed={2}>', () => {
    expect(LEGACY).toMatchObject({ scale: 2, radius: 1, distort: 0.5, speed: 2, segments: [100, 200], fovDeg: 75, cameraZ: 5 })
    // OrbitControls autoRotateSpeed 0.5 : un tour en 120 s
    expect((2 * Math.PI) / LEGACY.autoRotate).toBeCloseTo(120, 6)
  })

  it('même déformation que drei (bruit simplex identique, même formule)', () => {
    const src = read('src/components/home/elasticBubble.ts')
    expect(src).toMatch(/float updateTime = uTime \/ 50\.0;/)
    expect(src).toMatch(/float noise = snoise\(vec3\(p \/ 2\.0 \+ updateTime \* 5\.0\)\);/)
    expect(src).toMatch(/return p \* \(noise \* pow\(uDistort, 2\.0\) \+ 1\.0\);/)
    // Le bruit est la copie conforme de drei/helpers/glsl/distort.vert.glsl
    expect(src).toContain('return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));')
  })

  it('amplitude : jusqu’à celle de l’ancien Hero, avec des retours progressifs à une forme arrondie', () => {
    let min = Infinity, max = -Infinity, maxStep = 0, prev = envelope(0)
    for (let t = 0; t <= 600; t += 1 / 60) {
      const v = envelope(t)
      min = Math.min(min, v)
      max = Math.max(max, v)
      maxStep = Math.max(maxStep, Math.abs(v - prev))
      prev = v
    }
    expect(max).toBeLessThanOrEqual(1)
    expect(max).toBeGreaterThan(0.97)
    expect(min).toBeGreaterThanOrEqual(0.58)
    expect(min).toBeLessThan(0.62)
    // Aucune saccade : variation par image (60 i/s) infime
    expect(maxStep).toBeLessThan(0.002)
    for (let t = 0; t < 60; t += 0.1) expect(Math.abs(breathing(t) - 1)).toBeLessThanOrEqual(0.0221)
  })
})

describe('géométrie et cadrage', () => {
  it('sphère UV de THREE.SphereGeometry : sommets sur la sphère unité, faces tournées vers l’extérieur', () => {
    const { positions, indices } = sphereGeometry(100, 200)
    expect(positions.length / 3).toBe(101 * 201)
    expect(indices.length).toBe(100 * 200 * 6 - 2 * 100 * 3)
    expect(Math.max(...indices)).toBeLessThan(65536)
    for (let i = 0; i < positions.length; i += 3 * 97) {
      expect(Math.hypot(positions[i], positions[i + 1], positions[i + 2])).toBeCloseTo(1, 6)
    }
    // Normale de chaque face orientée vers l'extérieur (ordre antihoraire, CULL_FACE par défaut)
    for (let f = 0; f < indices.length; f += 3 * 53) {
      const [a, b, c] = [indices[f], indices[f + 1], indices[f + 2]].map(k => [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]])
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const centre = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
      expect(n[0] * centre[0] + n[1] * centre[1] + n[2] * centre[2]).toBeGreaterThan(0)
    }
  })

  it('canevas dimensionné par le CSS avec le même rapport que la projection', () => {
    expect(1 / BASE_RATIO).toBeCloseTo(1.7584, 3)
    expect(read('src/components/home/home.css')).toMatch(/width: calc\(var\(--hb-d\) \* 1\.7584\);/)
  })

  it('photo : un seul facteur d’échelle en coordonnées d’écran (visage jamais déformé)', () => {
    const src = read('src/components/home/elasticBubble.ts')
    expect(src).toMatch(/vec2 d = \(gl_FragCoord\.xy - uCenter\) \/ \(2\.0 \* uRadius\);/)
    expect(src).toMatch(/vec2 uv = uFocus \+ d \* uZoom;/)
    // Rayon de la photo constant : la respiration de la silhouette ne touche pas le visage
    expect(src).toMatch(/gl\.uniform1f\(uRadius, \(BASE_RATIO \* h\) \/ 2\)/)
  })

  it('même cadrage pour la version statique et le WebGL', () => {
    const hero = read('src/components/home/HeroBubbles.tsx')
    const css = read('src/components/home/home.css')
    expect(hero).toMatch(/PHOTO_FOCUS = \{ x: 0\.5, y: 0\.45 \}/)
    expect(hero).toMatch(/PHOTO_ZOOM = 0\.9/)
    expect(css).toMatch(/width: calc\(100% \/ 0\.9\);/)
    expect(css).toMatch(/left: calc\(50% - 0\.5 \* 100% \/ 0\.9\);/)
    expect(css).toMatch(/top: calc\(50% - 0\.45 \* 100% \/ 0\.9\);/)
  })

  it('mouvement réduit, économie de données, WebGL absent : version statique, aucun canevas animé', () => {
    const hero = read('src/components/home/HeroBubbles.tsx')
    expect(hero).toMatch(/if \(reduceMotion \|\| saveData\(\)\) return/)
    // Sans WebGL (contexte refusé) : contour CSS ; aucun contexte créé au montage (premier affichage)
    expect(hero).toMatch(/if \(!controller\) setMode\('morph'\)/)
    expect(hero).not.toMatch(/getContext\(/)
    expect(read('src/components/home/home.css')).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/)
  })
})
