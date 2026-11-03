// P8.3 — Globe : données géographiques, repères, géométrie, vitesses
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { arcPoints, decodeBorders, decodeHomeOutline, decodeLand, landAt, landDots, lineSegments, toVec3 } from './globeGeometry'
import { DEFAULT_GLOBE_SPEED, GLOBE_SPEEDS, easeSpeed, rotationAfter, rotationFacing, speedValue } from './globeMotion'
import { CONTINENT_COLORS, CONTINENT_LABELS, GLOBE_LABELS, HOME, PLACES } from './globePlaces'

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8')
const length = (v: number[]) => Math.hypot(v[0], v[1], v[2])

describe('données géographiques', () => {
  const land = decodeLand()

  it('grille complète', () => {
    expect(land.length).toBe(720 * 360)
  })

  it.each([
    ['Abidjan', 5.5, -4.2, 1], ['Lagos', 7, 3.5, 1], ['Le Caire', 29.8, 31.2, 1], ['Nairobi', -1.3, 36.8, 1], ['Antananarivo', -19, 47.5, 1],
    ['Paris', 48.8, 2.3, 2], ['Moscou', 55.7, 37.6, 2], ['Rome', 41.9, 12.5, 2],
    ['Riyad', 24.7, 46.7, 3], ['Tokyo', 35.9, 139.7, 3], ['Djakarta', -6.3, 106.8, 3], ['Delhi', 28.6, 77.2, 3],
    ['New York', 41, -74, 4], ['Mexico', 19.4, -99.1, 4], ['Panama', 8.4, -81, 4], ['Toronto', 43.8, -79.4, 4],
    ['Bogotá', 4.7, -74, 5], ['São Paulo', -23.5, -46.8, 5], ['Buenos Aires', -34.7, -58.6, 5],
    ['Sydney', -33.9, 151, 6], ['Port Moresby', -9.4, 147.3, 6], ['Auckland', -37, 174.8, 6],
    ['Pôle Sud', -85, 0, 7],
  ])('%s est sur le bon continent', (_, lat, lon, continent) => {
    expect(landAt(land, lat, lon)).toBe(continent)
  })

  it.each([['Atlantique', 20, -40], ['Pacifique', 0, -150], ['océan Indien', -30, 80]])('%s : océan', (_, lat, lon) => {
    expect(landAt(land, lat, lon)).toBe(0)
  })

  it('l’antiméridien ne crée ni bande ni trou', () => {
    expect(landAt(land, -85, 120)).toBe(7)
    expect(landAt(land, -89.9, -120)).toBe(7)
    expect(landAt(land, 68, 179.5)).toBe(3) // Tchoukotka, de part et d'autre
    expect(landAt(land, 66, -175)).toBe(3)
    expect(landAt(land, 75, 170)).toBe(0) // mer de Sibérie orientale
    expect(landAt(land, 75, -170)).toBe(0)
    expect(landAt(land, 65, -30)).toBe(0) // détroit de Danemark : aucune ligne parasite
  })

  it('frontières lisibles, dans les limites du globe', () => {
    const lines = decodeBorders()
    expect(lines.length).toBeGreaterThan(100)
    for (const line of lines) {
      expect(line.length % 2).toBe(0)
      for (let i = 0; i < line.length; i += 2) {
        expect(Math.abs(line[i])).toBeLessThanOrEqual(180)
        expect(Math.abs(line[i + 1])).toBeLessThanOrEqual(90)
      }
    }
  })

  it('le contour désigne bien la Côte d’Ivoire', () => {
    const points = decodeHomeOutline().flat()
    const lon = points.filter((_, i) => i % 2 === 0)
    const lat = points.filter((_, i) => i % 2 === 1)
    expect(Math.min(...lon)).toBeGreaterThan(-9)
    expect(Math.max(...lon)).toBeLessThan(-2.3)
    expect(Math.min(...lat)).toBeGreaterThan(4.1)
    expect(Math.max(...lat)).toBeLessThan(10.9)
  })
})

describe('repères', () => {
  const land = decodeLand()

  it('la Côte d’Ivoire est le centre : San-Pedro, comme le pied de page', () => {
    expect(landAt(land, HOME.lat, HOME.lon)).toBe(1)
    expect(read('src/components/Footer.tsx')).toContain('San-Pedro, Côte d\'Ivoire')
  })

  it.each(PLACES.map(p => [p.name, p] as const))('%s : sur son continent', (_, place) => {
    expect(landAt(land, place.lat, place.lon)).toBe(place.continent)
  })

  it('chaque continent peuplé a un arc et un repère conservé sur mobile', () => {
    for (const continent of [1, 2, 3, 4, 5, 6]) {
      const places = PLACES.filter(p => p.continent === continent)
      expect(places.some(p => p.arc)).toBe(true)
      expect(places.some(p => p.major)).toBe(true)
    }
  })

  it('six continents nommés, noms uniques (clés React)', () => {
    expect(CONTINENT_LABELS).toHaveLength(6)
    expect(new Set(GLOBE_LABELS.map(l => l.name)).size).toBe(GLOBE_LABELS.length)
  })

  it('aucune couleur manquante', () => {
    expect(CONTINENT_COLORS).toHaveLength(8)
    for (const color of CONTINENT_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('géométrie', () => {
  it('orientation : longitude 0 face à la caméra, est à droite, nord en haut', () => {
    expect(toVec3(0, 0)[2]).toBeCloseTo(1)
    expect(toVec3(0, 90)[0]).toBeCloseTo(1)
    expect(toVec3(90, 0)[1]).toBeCloseTo(1)
  })

  it('points : posés sur la sphère, autant de couleurs que de points, environ 29 % de terres', () => {
    const dots = landDots(20000, decodeLand(), CONTINENT_COLORS)
    const count = dots.positions.length / 3
    expect(dots.colors.length).toBe(count * 3)
    expect(dots.seeds.length).toBe(count)
    expect(count / 20000).toBeGreaterThan(0.26)
    expect(count / 20000).toBeLessThan(0.36)
    for (let i = 0; i < 600; i += 3) expect(length([...dots.positions.slice(i, i + 3)])).toBeCloseTo(1.0015, 3)
  })

  it('les grands segments suivent la sphère au lieu de la traverser', () => {
    const flat = lineSegments([[-120, 49, -90, 49]], 1)
    expect(flat.length / 6).toBe(10)
    for (let i = 0; i < flat.length; i += 3) expect(length([...flat.slice(i, i + 3)])).toBeCloseTo(1, 5)
    expect(flat[1]).toBeCloseTo(Math.sin((49 * Math.PI) / 180), 5)
  })

  it('arcs : partent et arrivent sur la sphère, restent bas sur le disque', () => {
    const from = toVec3(HOME.lat, HOME.lon)
    for (const place of PLACES.filter(p => p.arc)) {
      const to = toVec3(place.lat, place.lon)
      const points = arcPoints(from, to, 28)
      expect(points).toHaveLength(29)
      expect(length(points[0])).toBeCloseTo(1, 5)
      expect(length(points[28])).toBeCloseTo(1, 5)
      expect(Math.max(...points.map(length))).toBeLessThan(1.18)
      expect(Math.min(...points.map(length))).toBeGreaterThanOrEqual(0.9999)
    }
  })
})

describe('vitesses', () => {
  it('quatre niveaux, du plus lent au plus rapide', () => {
    expect(GLOBE_SPEEDS.map(s => s.label)).toEqual(['Lent', 'Normal', 'Rapide', 'Très rapide'])
    const values = GLOBE_SPEEDS.map(s => speedValue(s.id))
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  it('rotation lente par défaut', () => {
    expect(DEFAULT_GLOBE_SPEED).toBe('lent')
  })

  it('transition progressive, sans dépasser la vitesse visée', () => {
    let speed = speedValue('lent')
    const target = speedValue('tres-rapide')
    const steps: number[] = []
    for (let i = 0; i < 300; i++) {
      speed = easeSpeed(speed, target, 1 / 60)
      steps.push(speed)
    }
    expect(steps[0]).toBeLessThan(target / 2)
    expect(steps.every((v, i) => i === 0 || v >= steps[i - 1])).toBe(true)
    expect(speed).toBeLessThanOrEqual(target)
    expect(speed).toBeGreaterThan(target * 0.99)
  })

  it('même trajectoire à toute fréquence d’écran', () => {
    const run = (fps: number) => {
      let s = 0
      for (let i = 0; i < fps; i++) s = easeSpeed(s, 1, 1 / fps)
      return s
    }
    expect(run(30)).toBeCloseTo(run(144), 6)
  })

  it('la pause arrête complètement la rotation', () => {
    let speed = speedValue('tres-rapide')
    for (let i = 0; i < 60 * 8; i++) speed = easeSpeed(speed, 0, 1 / 60)
    expect(speed).toBe(0)
  })

  it('le globe tourne vers l’est et démarre sur la longitude voulue', () => {
    expect(rotationAfter(0, 1, 0.5)).toBe(0.5)
    expect(rotationFacing(90)).toBeCloseTo(-Math.PI / 2)
  })
})

describe('intégration dans l’accueil', () => {
  const home = read('src/pages/HomePage.tsx')

  it('le globe est la dernière section : juste avant le pied de page', () => {
    const globe = home.indexOf('<GlobeSection />')
    expect(globe).toBeGreaterThan(home.indexOf('Prêt à collaborer'))
    expect(home.slice(globe)).not.toMatch(/<section/)
  })

  it('three.js n’est jamais importé directement par le chargement initial', () => {
    for (const file of ['src/pages/HomePage.tsx', 'src/components/Hero.tsx', 'src/components/home/HomeNavCards.tsx', 'src/components/home/GlobeSection.tsx', 'src/components/home/scene3dRules.ts']) {
      expect(read(file)).not.toMatch(/from '(three|@react-three\/fiber)'/)
    }
    expect(read('src/components/home/HomeNavCards.tsx')).toMatch(/lazy\(\(\) => import\('\.\/CardCylinder'\)\)/)
    expect(read('src/components/home/GlobeSection.tsx')).toMatch(/lazy\(\(\) => import\('\.\/GlobeScene'\)\)/)
  })

  it('aucun chemin d’administration dans les nouveaux fichiers', () => {
    for (const file of ['HomeNavCards.tsx', 'CardCylinder.tsx', 'GlobeSection.tsx', 'GlobeScene.tsx', 'globePlaces.ts']) {
      expect(read(`src/components/home/${file}`)).not.toMatch(/admin/i)
    }
  })
})
