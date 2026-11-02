// P7.4 — « Adaptive Liquid Presence » : physique (suivi, étirement, repos) et règles d'activation.
// Le comportement réel (clics, champs, survol, tactile) est vérifié dans le navigateur :
// tests/e2e/premium/curseur.mjs.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { MAX_SPEED, STRETCH, attract, settled, shape, step, type PresenceState } from './presencePhysics'
import { OFF_ROUTES, PRESENCE_MEDIA, presenceOffRoute } from './presenceRules'

const run = (state: PresenceState, target: { x: number; y: number }, seconds: number, hz: number) => {
  let s = state
  for (let i = 0; i < Math.round(seconds * hz); i++) s = step(s, target, 1 / hz)
  return s
}
const origin: PresenceState = { x: 0, y: 0, vx: 0, vy: 0 }

describe('physique', () => {
  it('rejoint le curseur sans le dépasser, puis s’immobilise (boucle arrêtée)', () => {
    let s = origin
    let maxX = 0
    for (let i = 0; i < 120; i++) {
      s = step(s, { x: 300, y: 0 }, 1 / 60)
      maxX = Math.max(maxX, s.x)
    }
    expect(maxX).toBeLessThanOrEqual(300)
    expect(s.x).toBeCloseTo(300, 0)
    expect(settled(s, { x: 300, y: 0 })).toBe(true)
  })

  it('indépendante de la fréquence d’affichage (60 et 120 Hz)', () => {
    const a = run(origin, { x: 400, y: 200 }, 0.25, 60)
    const b = run(origin, { x: 400, y: 200 }, 0.25, 120)
    expect(Math.abs(a.x - b.x)).toBeLessThan(4)
    expect(Math.abs(a.y - b.y)).toBeLessThan(2)
  })

  it('aucun bond après une pause (pas de temps plafonné à 100 ms)', () => {
    const s = step(origin, { x: 1000, y: 0 }, 5)
    expect(s.x).toBeLessThan(1000 * (1 - Math.exp(-16 * 0.1)) + 1)
  })

  it('s’étire dans le sens d’un mouvement rapide, reste ronde pour un petit mouvement', () => {
    const fast = shape({ x: 0, y: 0, vx: MAX_SPEED * 2, vy: 0 })
    expect(fast.scaleX).toBeCloseTo(1 + STRETCH.along, 5)
    expect(fast.scaleY).toBeCloseTo(1 - STRETCH.across, 5)
    expect(fast.angle).toBeCloseTo(0, 5)
    const diagonal = shape({ x: 0, y: 0, vx: 1000, vy: 1000 })
    expect(diagonal.angle).toBeCloseTo(Math.PI / 4, 5)
    const slow = shape({ x: 0, y: 0, vx: 60, vy: 0 })
    expect(slow.scaleX).toBeLessThan(1.002)
    const still = shape(origin)
    expect([still.scaleX, still.scaleY, still.angle]).toEqual([1, 1, 0])
  })

  it('retrouve progressivement une forme ronde à l’arrêt (jamais brutalement)', () => {
    let s: PresenceState = { x: 0, y: 0, vx: 2500, vy: 0 }
    let previous = shape(s).scaleX
    let maxDrop = 0
    for (let i = 0; i < 90; i++) {
      s = step(s, { x: 0, y: 0 }, 1 / 60)
      const current = shape(s).scaleX
      maxDrop = Math.max(maxDrop, previous - current)
      previous = current
    }
    expect(previous).toBeLessThan(1.01)
    expect(maxDrop).toBeLessThan(0.08) // aucune chute d'une image à l'autre
  })

  it('attraction discrète vers le centre d’un élément interactif (18 %)', () => {
    expect(attract({ x: 0, y: 0 }, null)).toEqual({ x: 0, y: 0 })
    const p = attract({ x: 100, y: 100 }, { left: 100, top: 100, width: 200, height: 100 })
    expect(p.x).toBeCloseTo(118, 5)
    expect(p.y).toBeCloseTo(109, 5)
  })
})

describe('activation', () => {
  it('pointeur fin capable de survol, mouvement autorisé : sinon aucun effet', () => {
    expect(PRESENCE_MEDIA).toBe('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
  })

  it('absente des éditeurs plein écran, du studio LaTeX et de l’administration', () => {
    for (const route of ['/latex-cv-editor', '/cv-generator', '/playground', '/adjoumani-whiteboard', '/tools/novamind', '/blog/new', '/blog/edit/42', '/file-converter']) {
      expect(presenceOffRoute(route), route).toBe(true)
    }
    expect(presenceOffRoute(`/${'a'.repeat(32)}`)).toBe(true)
    expect(presenceOffRoute(`/${'a'.repeat(32)}/knowledge`)).toBe(true)
    for (const route of ['/', '/about', '/projects', '/cv', '/contact', '/blog', '/blog/un-article']) {
      expect(presenceOffRoute(route), route).toBe(false)
    }
    // Les routes plein écran de l'application sont toutes couvertes
    const app = fs.readFileSync('src/App.tsx', 'utf8')
    const fullscreen = /FULLSCREEN_ROUTES = \[([\s\S]*?)\]/.exec(app)?.[1].match(/'\/[^']*'/g)?.map(r => r.slice(1, -1)) ?? []
    expect(fullscreen.length).toBeGreaterThan(4)
    for (const route of fullscreen) expect(OFF_ROUTES).toContain(route)
  })

  it('jamais d’interception des clics, curseur système conservé, ancien curseur retiré', () => {
    const css = fs.readFileSync('src/components/cursor/liquidPresence.css', 'utf8')
    expect(css).toMatch(/\.lp-root \{[\s\S]*?pointer-events: none;/)
    expect(css).not.toMatch(/mix-blend-mode/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.lp-root \{ display: none; \}/)
    for (const file of ['src/index.css', 'src/App.css', 'src/App.tsx']) {
      const code = fs.readFileSync(file, 'utf8')
      expect(code, file).not.toMatch(/custom-cursor|CustomCursor|cursor:\s*none/)
    }
    const component = fs.readFileSync('src/components/cursor/LiquidPresence.tsx', 'utf8')
    expect(component).toMatch(/aria-hidden="true"/)
    // Aucun état React mis à jour pendant le mouvement
    expect(component).not.toMatch(/useState/)
    expect(component).toMatch(/\{ passive: true \}/)
  })
})
