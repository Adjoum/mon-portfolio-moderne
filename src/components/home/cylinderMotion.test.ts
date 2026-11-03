// P8.2 — Mouvement du cylindre : vitesse douce, cartes amenées de face, indépendance de la fréquence d'écran
import { describe, expect, it } from 'vitest'
import { AUTO_SPEED, CARD_STEP, atRest, autoSpeed, flick, nearestAngle, stepCylinder, type CylinderInput, type CylinderState } from './cylinderMotion'

const run = (state: CylinderState, input: CylinderInput, seconds: number, fps = 60) => {
  let s = state
  for (let i = 0; i < seconds * fps; i++) s = stepCylinder(s, input, 1 / fps)
  return s
}
const free: CylinderInput = { target: null, hold: false }

describe('rotation automatique', () => {
  it('ne s’arrête jamais et ne dépasse pas la vitesse prévue', () => {
    for (let a = 0; a < 7; a += 0.05) {
      expect(autoSpeed(a)).toBeGreaterThan(0)
      expect(autoSpeed(a)).toBeLessThanOrEqual(AUTO_SPEED + 1e-9)
    }
  })

  it('ralentit quand une carte est de face', () => {
    expect(autoSpeed(0)).toBeLessThan(autoSpeed(CARD_STEP / 2) / 2)
    expect(autoSpeed(CARD_STEP)).toBeCloseTo(autoSpeed(0))
  })

  it('un tour complet prend plus de 48 s, à toute fréquence d’écran', () => {
    const at60 = run({ angle: 0, speed: 0 }, free, 60, 60)
    const at120 = run({ angle: 0, speed: 0 }, free, 60, 120)
    expect(at60.angle).toBeLessThan(2 * Math.PI)
    expect(Math.abs(at60.angle - at120.angle)).toBeLessThan(0.02)
  })
})

describe('arrêt et reprise', () => {
  it('survol ou pause : s’arrête en douceur, sans à-coup', () => {
    let s: CylinderState = { angle: 1, speed: AUTO_SPEED }
    let previous = s.speed
    for (let i = 0; i < 240; i++) {
      s = stepCylinder(s, { target: null, hold: true }, 1 / 60)
      expect(s.speed).toBeLessThanOrEqual(previous)
      previous = s.speed
    }
    expect(atRest(s, { target: null, hold: true })).toBe(true)
  })

  it('la rotation libre ne s’endort jamais', () => {
    expect(atRest(run({ angle: 0, speed: 0 }, free, 5), free)).toBe(false)
  })
})

describe('carte amenée de face', () => {
  it('choisit le chemin le plus court', () => {
    expect(nearestAngle(0.1, 0)).toBeCloseTo(0)
    expect(nearestAngle(6.2, 0)).toBeCloseTo(2 * Math.PI)
    expect(nearestAngle(-0.2, 3)).toBeCloseTo(-CARD_STEP)
    for (let i = 0; i < 4; i++) for (let a = -9; a < 9; a += 0.3) {
      expect(Math.abs(nearestAngle(a, i) - a)).toBeLessThanOrEqual(Math.PI + 1e-9)
    }
  })

  it.each([[0], [1], [2], [3]])('carte %i : arrive de face et s’y stabilise', index => {
    const input = { target: index, hold: false }
    const s = run({ angle: 7.3, speed: 0.4 }, input, 2.5)
    expect(s.angle).toBeCloseTo(nearestAngle(7.3, index), 2)
    expect(atRest(s, input)).toBe(true)
  })

  it('reste stable même à faible fréquence d’image', () => {
    const s = run({ angle: 3, speed: 0 }, { target: 1, hold: false }, 3, 15)
    expect(s.angle).toBeCloseTo(nearestAngle(3, 1), 1)
    expect(Math.abs(s.speed)).toBeLessThan(0.05)
  })

  it('un dépassement éventuel reste discret', () => {
    let s: CylinderState = { angle: 0, speed: 0 }
    const input = { target: 1, hold: false }
    let peak = 0
    for (let i = 0; i < 180; i++) { s = stepCylinder(s, input, 1 / 60); peak = Math.max(peak, s.angle) }
    expect(peak).toBeLessThan(CARD_STEP * 1.04)
  })
})

describe('glissement', () => {
  it('élan plafonné, dans les deux sens', () => {
    expect(flick(50)).toBe(2.4)
    expect(flick(-50)).toBe(-2.4)
    expect(flick(1)).toBe(1)
  })

  it('après un élan, retour progressif à la rotation automatique', () => {
    const s = run({ angle: 0, speed: flick(50) }, free, 4)
    expect(Math.abs(s.speed - autoSpeed(s.angle))).toBeLessThan(0.02)
  })
})
