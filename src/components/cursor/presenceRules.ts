// Activation de la présence lumineuse (LiquidPresence.tsx) : appareil, préférences, page.
import { looksLikeAdminPath } from '../../lib/adminRoute'

/** Éditeurs, canevas et outils plein écran : leurs propres contrôles priment */
export const OFF_ROUTES = ['/latex-cv-editor', '/cv-generator', '/cv-builder', '/playground', '/adjoumani-whiteboard', '/tools/novamind', '/blog/new', '/blog/edit', '/file-converter']

/** Pointeur fin capable de survol (souris, pavé tactile, stylet), mouvement autorisé */
export const PRESENCE_MEDIA = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'

export function subscribeMedia(callback: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(PRESENCE_MEDIA)
  media.addEventListener?.('change', callback)
  return () => media.removeEventListener?.('change', callback)
}

/** Pointeur fin, survol possible, mouvement autorisé, API disponibles (sinon : aucun effet) */
export function presenceSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function' && window.matchMedia(PRESENCE_MEDIA).matches
    && typeof window.PointerEvent === 'function'
    && typeof window.requestAnimationFrame === 'function'
    && typeof CSS !== 'undefined' && CSS.supports?.('transform', 'translate3d(0px, 0px, 0px)') === true
}

export function presenceOffRoute(pathname: string): boolean {
  return looksLikeAdminPath(pathname) || OFF_ROUTES.some(r => pathname === r || pathname.startsWith(`${r}/`))
}
