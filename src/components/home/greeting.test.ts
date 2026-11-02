// P8.1 — Salutation du Hero : créneaux exacts, repli, prochaine vérification
import { describe, expect, it } from 'vitest'
import { FALLBACK_GREETING, greetingAt, msUntilNextCheck } from './greeting'

const at = (h: number, m = 0, s = 0, ms = 0) => new Date(2026, 5, 15, h, m, s, ms)

describe('salutation selon l’heure locale', () => {
  it.each([
    [0, 0, 'Bonne nuit'],
    [4, 59, 'Bonne nuit'],
    [5, 0, 'Bonjour'],
    [11, 59, 'Bonjour'],
    [12, 0, 'Bon après-midi'],
    [17, 59, 'Bon après-midi'],
    [18, 0, 'Bonsoir'],
    [21, 59, 'Bonsoir'],
    [22, 0, 'Bonne nuit'],
    [23, 59, 'Bonne nuit'],
  ])('%i:%i → %s', (h, m, text) => {
    expect(greetingAt(at(h, m))).toBe(text)
  })

  it('chaque heure de la journée donne une salutation', () => {
    for (let h = 0; h < 24; h++) expect(greetingAt(at(h))).toMatch(/^Bon/)
  })

  it('heure illisible : salutation d’origine', () => {
    expect(greetingAt(new Date(Number.NaN))).toBe(FALLBACK_GREETING)
  })
})

describe('prochaine vérification', () => {
  it('se réveille juste après le changement de créneau', () => {
    const wait = msUntilNextCheck(at(17, 59, 59, 0))
    expect(wait).toBeGreaterThan(1000)
    expect(wait).toBeLessThan(1200)
    expect(greetingAt(new Date(at(17, 59, 59, 0).getTime() + wait))).toBe('Bonsoir')
  })

  it('passe minuit : de 23:30 à 05:00, mais jamais plus d’une heure d’attente', () => {
    expect(msUntilNextCheck(at(23, 30))).toBe(60 * 60 * 1000)
    const wait = msUntilNextCheck(at(4, 59, 50))
    expect(wait).toBeGreaterThan(10_000)
    expect(greetingAt(new Date(at(4, 59, 50).getTime() + wait))).toBe('Bonjour')
  })

  it('après 22:00, le prochain créneau est celui du lendemain matin', () => {
    const wait = msUntilNextCheck(at(22, 0))
    expect(wait).toBe(60 * 60 * 1000) // plafond : l'attente réelle serait de 7 h
  })

  it('délai toujours positif, y compris sur une heure illisible', () => {
    for (let h = 0; h < 24; h++) expect(msUntilNextCheck(at(h, 59, 59, 999))).toBeGreaterThan(0)
    expect(msUntilNextCheck(new Date(Number.NaN))).toBeGreaterThan(0)
  })
})
