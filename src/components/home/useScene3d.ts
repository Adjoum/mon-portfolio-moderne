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

/** Vrai une fois la page chargée et le navigateur au repos : le premier affichage n'attend jamais la 3D */
export function useIdleStart(enabled: boolean): boolean {
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!enabled || started) return
    const hasIdle = typeof window.requestIdleCallback === 'function'
    let handle: number | undefined
    const start = () => setStarted(true)
    const schedule = () => {
      handle = hasIdle ? window.requestIdleCallback(start, { timeout: 2500 }) : window.setTimeout(start, 1200)
    }
    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })
    return () => {
      window.removeEventListener('load', schedule)
      if (handle === undefined) return
      if (hasIdle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [enabled, started])

  return started && enabled
}
