// « Adaptive Liquid Presence » : légère présence lumineuse qui accompagne le curseur système.
// - Le curseur du système reste visible et seul responsable des clics (pointer-events: none ici).
// - S'étire dans le sens d'un mouvement rapide, redevient ronde à l'arrêt, s'estompe au repos.
// - Sur un élément interactif : légère attraction vers son centre et halo discret ; pression :
//   contraction liquide.
// - S'efface sur les champs de saisie, contenus éditables, cadres, fenêtres de dialogue, pendant
//   une sélection de texte et hors de la fenêtre ; absente des éditeurs plein écran et de
//   l'administration.
// - Aucun rendu React pendant le mouvement : une boucle requestAnimationFrame, arrêtée dès que
//   la présence est immobile ; transform et opacity uniquement.
// - Désactivée sans pointeur fin (écrans tactiles), en mouvement réduit, ou si le navigateur ne
//   fournit pas les API nécessaires.
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { attract, settled, shape, step, type PresenceState } from './presencePhysics'
import { presenceOffRoute, presenceSupported, subscribeMedia } from './presenceRules'
import './liquidPresence.css'

/** Survol : légère attraction et halo */
const INTERACTIVE = 'a[href], button:not(:disabled), [role="button"], [role="tab"], [role="link"], summary, label[for], select, input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"], [data-cursor="interactive"]'
/** La présence s'efface : saisie, contenus éditables, cadres, médias, fenêtres de dialogue */
const NATIVE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable=""], [contenteditable="true"], iframe, canvas, video, [data-cursor="native"], [role="dialog"], dialog, [aria-modal="true"]'

export default function LiquidPresence() {
  const { pathname } = useLocation()
  const supported = useSyncExternalStore(subscribeMedia, presenceSupported, () => false)
  if (!supported || presenceOffRoute(pathname)) return null
  return <Presence />
}

function Presence() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const flag = (name: string, on: boolean) => root.classList.toggle(name, on)
    const pointer = { x: 0, y: 0 }
    let state: PresenceState | null = null
    let hovered: Element | null = null
    let rect: DOMRect | null = null
    let lastTarget: EventTarget | null = null
    let raf = 0
    let last = 0
    let idleTimer = 0

    const tick = (now: number) => {
      raf = 0
      if (!state) return
      const dt = last ? (now - last) / 1000 : 1 / 60
      last = now
      const target = attract(pointer, rect)
      state = step(state, target, dt)
      const { angle, scaleX, scaleY } = shape(state)
      root.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) rotate(${angle.toFixed(4)}rad) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`
      if (settled(state, target)) {
        last = 0
        root.dataset.moving = 'false'
        return
      }
      root.dataset.moving = 'true'
      raf = requestAnimationFrame(tick)
    }
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick) }

    const classify = (el: Element | null) => {
      const native = el?.closest?.(NATIVE) ?? null
      const interactive = native ? null : el?.closest?.(INTERACTIVE) ?? null
      flag('is-native', !!native)
      flag('is-hover', !!interactive)
      hovered = interactive
      rect = interactive ? interactive.getBoundingClientRect() : null
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      pointer.x = e.clientX
      pointer.y = e.clientY
      if (!state) state = { x: e.clientX, y: e.clientY, vx: 0, vy: 0 }
      if (e.target !== lastTarget) {
        lastTarget = e.target
        classify(e.target as Element)
      }
      flag('is-hidden', false)
      flag('is-idle', false)
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => flag('is-idle', true), 1400)
      wake()
    }
    const onDown = (e: PointerEvent) => { if (e.pointerType !== 'touch') flag('is-pressed', true) }
    const onUp = () => flag('is-pressed', false)
    const onLeave = () => { flag('is-hidden', true); flag('is-pressed', false) }
    const onScroll = () => {
      if (hovered) rect = hovered.getBoundingClientRect()
      lastTarget = null // l'élément sous le curseur a pu changer
    }
    const onSelection = () => {
      const selection = document.getSelection()
      flag('is-selecting', !!selection && !selection.isCollapsed)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('blur', onLeave)
    document.documentElement.addEventListener('pointerleave', onLeave)
    document.addEventListener('selectionchange', onSelection)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(idleTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('blur', onLeave)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('selectionchange', onSelection)
    }
  }, [])

  return (
    <div ref={rootRef} className="lp-root is-hidden" aria-hidden="true" data-moving="false">
      <span className="lp-core" />
    </div>
  )
}
