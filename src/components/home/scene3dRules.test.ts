// P8.4 — Règles communes aux scènes 3D : appareils modestes, surveillance des images
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FrameBudget, modestDevice, onTooSlow, reportTooSlow } from './scene3dRules'

const feed = (budget: FrameBudget, ms: number, frames: number) => {
  const verdicts = []
  for (let i = 0; i < frames; i++) verdicts.push(budget.push(ms))
  return verdicts.filter(v => v !== 'keep')
}

describe('surveillance des images', () => {
  it('60 images par seconde : rien ne change', () => {
    expect(feed(new FrameBudget(), 16.7, 600)).toEqual([])
  })

  it('35 ms : qualité réduite une seule fois, jamais d’abandon', () => {
    expect(feed(new FrameBudget(), 35, 600)).toEqual(['lower'])
  })

  it('45 ms : qualité réduite, puis abandon si cela ne suffit pas', () => {
    expect(feed(new FrameBudget(), 45, 200).slice(0, 2)).toEqual(['lower', 'abandon'])
  })

  it('très lent : abandon dès le premier bilan, sans essayer de réduire la qualité', () => {
    expect(feed(new FrameBudget(), 60, 16)).toEqual(['abandon'])
  })

  it('moins d’une image toutes les 250 ms : abandon, ce n’est pas une pause', () => {
    expect(feed(new FrameBudget(), 400, 6)).toEqual(['abandon'])
  })

  it('la scène n’est déclarée fluide qu’après le premier bilan', () => {
    const budget = new FrameBudget()
    feed(budget, 16.7, 15)
    expect(budget.verified).toBe(false)
    feed(budget, 16.7, 1)
    expect(budget.verified).toBe(true)
    const slow = new FrameBudget()
    feed(slow, 100, 200)
    expect(slow.verified).toBe(false)
  })

  it('les premières images (compilation des shaders) ne comptent pas', () => {
    const budget = new FrameBudget()
    expect(feed(budget, 200, 6)).toEqual([])
    expect(feed(budget, 16.7, 300)).toEqual([])
  })

  it('une reprise après une pause n’est pas prise pour de la lenteur', () => {
    const budget = new FrameBudget()
    for (let i = 0; i < 100; i++) budget.push(i % 2 ? 5000 : 16)
    expect(feed(budget, 16.7, 100)).toEqual([])
  })
})

describe('appareils modestes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    [{ connection: { saveData: true }, hardwareConcurrency: 8 }, true],
    [{ deviceMemory: 2, hardwareConcurrency: 8 }, true],
    [{ connection: { effectiveType: '2g' }, hardwareConcurrency: 8 }, true],
    [{ connection: { effectiveType: 'slow-2g' }, hardwareConcurrency: 8 }, true],
    [{ connection: { effectiveType: '3g' }, hardwareConcurrency: 8 }, false],
    [{ hardwareConcurrency: 2 }, true],
    [{ deviceMemory: 8, hardwareConcurrency: 8 }, false],
    [{}, false], // Safari n'expose pas ces valeurs : aucune exclusion à l'aveugle
  ])('%j → %s', (nav, expected) => {
    vi.stubGlobal('navigator', nav)
    expect(modestDevice()).toBe(expected)
  })

  // Dernier test du fichier : l'état vaut pour toute la visite
  it('après un abandon, plus aucune scène n’est tentée pendant la visite', () => {
    vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 8 })
    expect(modestDevice()).toBe(false)
    const told = vi.fn()
    const stop = onTooSlow(told)
    reportTooSlow()
    expect(modestDevice()).toBe(true)
    expect(told).toHaveBeenCalledOnce()
    stop()
    reportTooSlow()
    expect(told).toHaveBeenCalledOnce()
  })
})
