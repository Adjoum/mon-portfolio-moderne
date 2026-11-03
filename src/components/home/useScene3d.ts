import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import { modestDevice, onTooSlow } from './scene3dRules'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Réactif : une scène déjà montée mais pas encore lancée renonce si une autre vient d'abandonner */
export const useModestDevice = () => useSyncExternalStore(onTooSlow, modestDevice)

/**
 * `near` : l'élément a approché l'écran au moins une fois (déclenche le téléchargement) ;
 * `visible` : il est à l'écran ou sur le point d'y entrer (l'animation ne tourne que dans ce cas) :
 * la scène a ainsi le temps de vérifier sa fluidité avant d'être vue.
 */
export function useViewport(ref: RefObject<Element | null>, margin: string) {
  const [state, setState] = useState({ near: false, visible: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const nearby = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setState(s => (s.near ? s : { ...s, near: true }))
    }, { rootMargin: margin })
    const onScreen = new IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting
      setState(s => (s.visible === visible ? s : { ...s, visible }))
    }, { rootMargin: '140px' })
    nearby.observe(el)
    onScreen.observe(el)
    return () => {
      nearby.disconnect()
      onScreen.disconnect()
    }
  }, [ref, margin])

  return state
}

/**
 * Mesuré (banc alterné, desktop) : lancée dès le repos qui suit le chargement, l'analyse de three.js
 * retardait la peinture du portrait, l'élément LCP, d'environ 70 ms. La page a donc d'abord le temps
 * de peindre ses images.
 */
const SETTLE_AFTER_LOAD_MS = 1200

/** Vrai une fois la page chargée, peinte et le navigateur au repos : le premier affichage n'attend jamais la 3D */
export function useIdleStart(enabled: boolean): boolean {
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!enabled || started) return
    const hasIdle = typeof window.requestIdleCallback === 'function'
    let timer: number | undefined
    let handle: number | undefined
    const start = () => setStarted(true)
    const schedule = () => {
      // Délai compté depuis la fin du chargement : plus tard dans la visite, aucune attente inutile
      const loaded = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.loadEventEnd || performance.now()
      timer = window.setTimeout(() => {
        handle = hasIdle ? window.requestIdleCallback(start, { timeout: 2500 }) : window.setTimeout(start, 200)
      }, Math.max(0, SETTLE_AFTER_LOAD_MS - (performance.now() - loaded)))
    }
    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })
    return () => {
      window.removeEventListener('load', schedule)
      window.clearTimeout(timer)
      if (handle === undefined) return
      if (hasIdle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [enabled, started])

  return started && enabled
}
